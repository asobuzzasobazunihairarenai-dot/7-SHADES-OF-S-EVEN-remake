// 案内人エイドスの物語チュートリアル（オンボーディング）のフロー制御＝オーケストレーター。
// シーン台本(eidos-dialogue-scenes.js)と対話UI(eidos-dialogue-ui.js)、操作チュートリアル
// (tutorial-battle.js)、CPU戦(cpu-battle.js)を、進捗に応じて順に繋ぐ。
//
// 全体の流れ:
//   ホームの🎓タイル
//    → 導入シーン SCENE1（tutorial_completed になるまで毎回）
//    → 操作チュートリアル(tutorial-battle.js)
//    → 完了 SCENE2（操作説明後。挑戦するか選ぶ）
//    → 易しいエイドス戦（difficulty=intermediate）
//        勝ち → SCENE3→SCENE5（本気戦の解放）→ 本気エイドス戦（advanced）
//                    勝ち → SCENE7→SCENE8（セプト獲得）→ ホーム
//                    負け → SCENE6（再挑戦 or あとで）
//        負け → SCENE4（再挑戦 or あとで）
//
// 【Phase 1（今ここ）】進捗は localStorage に保存（DB不要・ゲストでも動く）。CPU戦の難易度は
//   ユーザーの基本設定を書き換えないよう、cpu-battle-state.js の非永続オーバーライドを使う。
// 【Phase 2（後日・要ユーザーのSQL）】進捗のアカウント同期(so7_user_profiles列)＋Septの
//   実アンロック(so7_grant_item RPC)。今は localStorage の sept_awarded フラグのみ。
//
// 循環import回避: victory.js からは cpu-battle-state.js（極小leaf）経由で結果ハンドラだけを
//   受け渡す。cpu-battle.js / victory.js の重い依存は関数内の動的importで遅延読み込みする。
// see [[eidos-tutorial-story]], [[circular-import-tdz-and-no-cache-bust]], [[cpu-battle-architecture]]。

import { runEidosDialogue } from "./eidos-dialogue-ui.js";
import { getEidosScene, EIDOS_SCENE } from "./eidos-dialogue-scenes.js";
import { startTutorialBattle, registerTutorialHomeOpener, registerTutorialCompleteHandler } from "./tutorial-battle.js";
import { setPlayerName, setPlayerAvatar, getPlayerName } from "./player-identity.js";
import { SEAT_LABELS } from "./board-layout.js";
import { resetGame } from "./state.js";
import {
  setCpuBattleActive,
  setEidosStoryStage,
  setStoryDifficultyOverride,
  registerEidosStoryResultHandler,
} from "./cpu-battle-state.js";

// 相手(C)の物語上の表示名・アバター（tutorial-battle.js と同じもの）。
const EIDOS_NAME = "案内人エイドス";
const EIDOS_AVATAR = "assets/avatars/eidos-noir-front.webp";

// 進捗フラグ（localStorage、端末ローカル。Phase 2でアカウント同期）。
// intro_seen / tutorial_completed / eidos_easy_cleared / eidos_hard_unlocked /
// eidos_hard_cleared / sept_awarded / sept_set
const PROGRESS_KEY = "so7-eidos-progress-v1";
function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
export function isEidosProgress(flag) {
  return !!readProgress()[flag];
}
export function setEidosProgress(flag, value) {
  const p = readProgress();
  p[flag] = !!value;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 保存不可でも進行は続ける */
  }
}
export function getEidosProgress() {
  return readProgress();
}
// 進捗を全消去（管理者用「チュートリアル実績リセット」）。次回タイル起動で導入から演出し直す。
// プレイヤーの表示名（別保存）はここでは消さない。
export function resetEidosProgress() {
  try {
    localStorage.removeItem(PROGRESS_KEY);
  } catch {
    /* 消せなくても致命的ではない */
  }
}

// 主人公（記憶を失った青年）の話者名の基準。名前入力後は「記憶を失った青年ー○○」と表示する。
const YOUTH_SPEAKER = "記憶を失った青年";
// 自席（ローカルは"A"固定だがオンライン下でも堅牢にするため起動時に解決してキャッシュ）。
let storySelfSeat = "A";

// 自席の現在の表示名が「本人が設定した名前」か（座席ラベルのままなら未設定とみなす）。
function currentSelfName() {
  const cur = getPlayerName(storySelfSeat);
  if (cur && cur !== SEAT_LABELS[storySelfSeat]) return cur;
  return null;
}
// 会話の入力ステップの初期値を解決。名前入力は、既に本人が名前を設定済みならそれを、無ければ
// 「アッシュ」を初期値にする（ユーザー要望2026-08-15）。
function getDialogueInputDefault(step) {
  if (step?.input?.field === "playerName") return currentSelfName() || "アッシュ";
  return step?.input?.default ?? "";
}
// 会話の話者名を解決。主人公の発話は、名前設定後は「記憶を失った青年ー○○」と表示する。
function resolveDialogueSpeaker(step) {
  if (step?.speaker === YOUTH_SPEAKER) {
    const name = currentSelfName();
    if (name) return `${YOUTH_SPEAKER}ー${name}`;
  }
  return step?.speaker ?? "";
}

// 操作チュートリアルを終了/中断した時の戻り先（home-screen.jsから注入）。結果ハンドラや各分岐の
// 「あとで/ホームへ」からも使う。
let homeOpener = null;
function goHome() {
  if (typeof homeOpener === "function") homeOpener();
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 物語チュートリアルの締めくくり（本気エイドス戦に勝利し、セプトを得た後）。ユーザー要望
// 2026-08-15「最後はゆっくりフェード暗転で、画面中央に枠無しで『あなたの物語は、今、はじまる。』」。
// ゆっくり暗転→中央テキストをフェードイン→少し見せる→裏でホームを開いて暗転を解除して現す。
async function playStoryEnding() {
  const overlay = document.createElement("div");
  overlay.className = "eidos-story-ending";
  const text = document.createElement("div");
  text.className = "eidos-story-ending-text";
  text.textContent = "あなたの物語は、今、はじまる。";
  overlay.appendChild(text);
  document.body.appendChild(overlay);
  // 2フレーム待ってからクラス付与＝transitionを確実に効かせる。
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  overlay.classList.add("is-black"); // ゆっくり暗転（CSS: opacity 0→1）
  await wait(2600);
  text.classList.add("is-shown"); // テキストをフェードイン
  await wait(3600);
  goHome(); // 暗転の裏でホームを開く
  await wait(500);
  overlay.classList.add("is-fading-out"); // 暗転を解除してホームを現す
  await wait(1000);
  overlay.remove();
}

// 会話中の入力ステップ（step.input）の決定時に呼ばれる。今は「名前入力」（field:"playerName"）
// のみ。入力値を自分の表示名として設定＝永続化（setPlayerNameが自席ならupdateMyIdentityで保存）。
function onDialogueInput(value, step) {
  if (step?.input?.field === "playerName") applyPlayerName(value);
}
function applyPlayerName(value) {
  const name = (value || "").trim() || "アッシュ";
  setPlayerName(storySelfSeat, name); // storySelfSeatはstartEidosStoryで解決済み（自席ならupdateMyIdentityで永続化）
}

// 単一シーンを再生（nextScene連鎖はしない。導入SCENE1のように単発のシーン用）。
async function playScene(sceneId) {
  const scene = getEidosScene(sceneId);
  if (!scene) return null;
  try {
    const res = await runEidosDialogue(scene.steps, {
      fadeInFromBlack: !!scene.fadeInFromBlack,
      onInput: onDialogueInput,
      getInputDefault: getDialogueInputDefault,
      resolveSpeaker: resolveDialogueSpeaker,
    });
    if (Array.isArray(scene.stateUpdate)) for (const f of scene.stateUpdate) setEidosProgress(f, true);
    if (scene.grantItem) await grantStoryItem(scene.grantItem);
    return res?.choice ?? null;
  } catch (err) {
    console.error("runEidosDialogue failed", err);
    return null;
  }
}

// nextScene を辿ってstepsを連結し、1回の会話として途切れなく再生する（SCENE3→SCENE5、
// SCENE7→SCENE8 のように「会話を閉じず続けて再生する」連鎖）。stateUpdate/grantItem は連鎖に
// 含まれる全シーン分を、会話が終わってからまとめて適用する。戻り値=最後に選ばれた選択肢のvalue。
async function playSceneChain(startSceneId) {
  const merged = [];
  const stateFlags = [];
  const grantItems = [];
  let fadeInFromBlack = false;
  let id = startSceneId;
  const guard = new Set(); // nextSceneの循環を保険で止める
  while (id && !guard.has(id)) {
    guard.add(id);
    const scene = getEidosScene(id);
    if (!scene) break;
    if (scene.fadeInFromBlack && merged.length === 0) fadeInFromBlack = true;
    for (const s of scene.steps) merged.push(s);
    if (Array.isArray(scene.stateUpdate)) stateFlags.push(...scene.stateUpdate);
    if (scene.grantItem) grantItems.push(scene.grantItem);
    id = scene.nextScene || null;
  }
  let result = null;
  try {
    result = await runEidosDialogue(merged, {
      fadeInFromBlack,
      onInput: onDialogueInput,
      getInputDefault: getDialogueInputDefault,
      resolveSpeaker: resolveDialogueSpeaker,
    });
  } catch (err) {
    console.error("runEidosDialogue(chain) failed", err);
  }
  for (const f of stateFlags) setEidosProgress(f, true);
  for (const item of grantItems) await grantStoryItem(item);
  return result?.choice ?? null;
}

// アイテム付与。Phase 1（端末ローカル）では実アンロックはまだ行わず（Phase 2でSupabaseの
// so7_grant_item RPC）、進捗フラグのみ確実化する。item例: "pet:sept"。
async function grantStoryItem(item) {
  if (item === "pet:sept") setEidosProgress("sept_awarded", true);
}

// エイドス物語戦を開始する。stage: "intermediate"（易しい）/ "advanced"（本気）。CPU戦の薄い
// ラッパー(cpu-battle.js)を使い、相手(C)の名前・アバターを案内人エイドスに、難易度を非永続の
// オーバーライドで設定する。勝敗確定時は victory.js が結果ハンドラ(handleStoryResult)へ委譲する。
async function startStoryBattle(stage) {
  setEidosStoryStage(stage);
  setStoryDifficultyOverride(stage === "advanced" ? "advanced" : "intermediate");
  try {
    const { startCpuBattle, runCpuBattleSetup } = await import("./cpu-battle.js");
    await startCpuBattle(); // resetGame＋疑似CPU設定込み（相手名は"CPU"／託されたアバターになる）
    // 相手(C)の表示を案内人エイドスへ上書き（セットアップ描画の前に）。
    setPlayerName("C", EIDOS_NAME);
    setPlayerAvatar("C", EIDOS_AVATAR);
    setTimeout(() => {
      // エイドス(C)の駒スキンとファーストカードを黒（noir）へ（ユーザー要望2026-08-15）。配布
      // アニメーションの前（setupAssignFirstCards直後）に適用されるので、最初から黒いカードが飛ぶ
      // （#108: 以前はセットアップ完了後に差し替えていたため配布中は元の色＝黄色等が見えていた）。
      runCpuBattleSetup({ noirSeat: "C" }).catch((err) => console.error("runCpuBattleSetup(story) failed", err));
    }, 60);
  } catch (err) {
    console.error("startStoryBattle failed", err);
    await teardownStoryBattle();
    goHome();
  }
}

// エイドス物語戦の後始末（CPU戦フラグ・難易度オーバーライド・ステージ・相手表示をリセット）。
async function teardownStoryBattle() {
  setCpuBattleActive(false);
  document.body.classList.remove("cpu-battle-mode");
  setStoryDifficultyOverride(null);
  setEidosStoryStage(null);
  setPlayerName("C", "");
  setPlayerAvatar("C", null);
  // #104: 勝利状態（7色ロック済み）の盤面を「同期的に」消す。これをやらないと、この後の
  // resetVictoryTracking で勝利記録(announcedPlayers)が消えた後、勝敗シーンの描画中に
  // checkForVictory が同じ勝者を再検出し、勝利モーダルが二重に出る／その二度目のモーダルの
  // 閉じるコールバックが再戦開始後に走って勝敗会話が誤って再生される。resetGame を先に（同期で）
  // 呼んで盤面を空にしてから記録をクリアする（間に非同期の隙を作らない）。
  resetGame();
  // #107: 勝利がゲート侵攻の最中に確定すると、ゲート侵攻モーダルがキュー途中で取り残されて
  // 盤面に残ることがある。物語戦の後始末で必ず片付ける。
  try {
    const { forceCloseGateInvasionModal } = await import("./gate-invasion-modal.js");
    forceCloseGateInvasionModal();
  } catch (err) {
    console.error("forceCloseGateInvasionModal failed", err);
  }
  try {
    const { resetVictoryTracking } = await import("./victory.js");
    resetVictoryTracking(); // 次にまた勝利演出が出るように勝利記録をクリア
  } catch (err) {
    console.error("resetVictoryTracking failed", err);
  }
}

// 自分が勝者か。ローカルCPU戦では getSelfSeat()==="A" 固定だが、堅牢のため実際に照会する。
async function isSelfWinner(winnerSeat) {
  try {
    const { getSelfSeat } = await import("./online.js");
    return winnerSeat === getSelfSeat();
  } catch {
    return winnerSeat === "A";
  }
}

// エイドス物語戦の勝敗確定時に victory.js から呼ばれる（結果ハンドラ）。勝敗シーンを出し、
// 選択に応じて「次の戦い／再挑戦／ホーム」へ分岐する。
async function handleStoryResult({ winnerSeat, stage }) {
  const iWon = await isSelfWinner(winnerSeat);
  await teardownStoryBattle();

  if (stage === "intermediate") {
    if (iWon) {
      // SCENE3（初勝利）→ SCENE5（本気戦の解放）。選択: 本気に挑戦 / 準備してから。
      const choice = await playSceneChain(EIDOS_SCENE.INTERMEDIATE_FIRST_WIN);
      if (choice === "start-advanced-battle") {
        startStoryBattle("advanced");
        return;
      }
      goHome();
    } else {
      const choice = await playSceneChain(EIDOS_SCENE.INTERMEDIATE_LOSS);
      if (choice === "retry-intermediate-battle") {
        startStoryBattle("intermediate");
        return;
      }
      goHome();
    }
    return;
  }

  // advanced（本気エイドス戦）
  if (iWon) {
    // SCENE7（初勝利）→ SCENE8（セプト獲得。grantItem: pet:sept）。選択: セット / あとで。
    const choice = await playSceneChain(EIDOS_SCENE.ADVANCED_FIRST_WIN);
    if (choice === "set-sept") setEidosProgress("sept_set", true);
    // 物語チュートリアルの締めくくり: ゆっくりフェード暗転→中央テキスト→ホーム（goHomeは内部で呼ぶ）。
    await playStoryEnding();
  } else {
    const choice = await playSceneChain(EIDOS_SCENE.ADVANCED_LOSS);
    if (choice === "retry-advanced-battle") {
      startStoryBattle("advanced");
      return;
    }
    goHome();
  }
}

// 操作チュートリアルを最後まで完了した時に tutorial-battle.js から呼ばれる。完了シーンSCENE2を
// 出し、「挑戦する」なら易しいエイドス戦へ、「あとで」ならホームへ。
async function onOperationTutorialComplete() {
  setEidosProgress("tutorial_completed", true);
  const choice = await playSceneChain(EIDOS_SCENE.OPERATION_TUTORIAL_COMPLETE);
  if (choice === "start-intermediate-battle") {
    startStoryBattle("intermediate");
    return;
  }
  goHome();
}

// ホームの「🎓 チュートリアルCPU戦（物語）」タイルから呼ぶ入口。進捗に応じて出し分ける。
// openHome: 操作チュートリアルを終了/中断した時、および各分岐でホームへ戻る時の戻り先。
export async function startEidosStory({ openHome } = {}) {
  homeOpener = () => openHome?.();
  // 自席を解決してキャッシュ（名前入力の初期値・話者名の解決に使う。ローカルは"A"）。
  try {
    const { getSelfSeat } = await import("./online.js");
    storySelfSeat = getSelfSeat() || "A";
  } catch {
    storySelfSeat = "A";
  }
  // 操作チュートリアル終了時の戻り先（中断時のホーム復帰）と、完了時のハンドラ（完了シーン→
  // エイドス戦）、CPU戦の結果ハンドラ（勝敗シーン）を注入する。
  registerTutorialHomeOpener(homeOpener);
  registerTutorialCompleteHandler(onOperationTutorialComplete);
  registerEidosStoryResultHandler(handleStoryResult);
  // 進捗に応じて出し分ける（ユーザー要望2026-08-15「エイドス戦まで進んでいるなら、再度開いた時は
  // エイドス戦から始めたい」。以前は tutorial_completed でも常に操作チュートリアルから始まっていた）。
  if (!isEidosProgress("tutorial_completed")) {
    // まだ操作チュートリアル未完了: 導入SCENE1（毎回）→ 操作チュートリアル。
    // 以前は intro_seen（一度でも見たら二度と出さない）でゲートしていたが、一度見ると再表示できず
    // 「会話が出ずチュートリアルから始まる」状態になっていた（ユーザー報告2026-08-14）。
    await playScene(EIDOS_SCENE.FIRST_ENCOUNTER);
    setEidosProgress("intro_seen", true); // 記録用（今のゲートは tutorial_completed 側）
    startTutorialBattle();
    return;
  }
  // 操作チュートリアルは完了済み: エイドス戦から再開する。易しい戦をクリアして本気戦が解放済み
  // (eidos_hard_unlocked) なら本気戦へ、まだなら易しい戦へ。それぞれ対応する導入シーンを出し、
  // 「挑戦する」で戦闘開始／「あとで」でホームへ。
  await resumeEidosBattles();
}

// 操作チュートリアル完了後にタイルを開き直した時の再開フロー。進捗で易しい/本気を出し分ける。
async function resumeEidosBattles() {
  if (isEidosProgress("eidos_hard_unlocked")) {
    // 易しい戦クリア済み → 本気戦の解放シーン(SCENE5)→ 本気エイドス戦。
    const choice = await playSceneChain(EIDOS_SCENE.ADVANCED_UNLOCKED);
    if (choice === "start-advanced-battle") {
      startStoryBattle("advanced");
      return;
    }
    goHome();
    return;
  }
  // まだ易しい戦をクリアしていない → 完了シーン(SCENE2)→ 易しいエイドス戦。
  const choice = await playSceneChain(EIDOS_SCENE.OPERATION_TUTORIAL_COMPLETE);
  if (choice === "start-intermediate-battle") {
    startStoryBattle("intermediate");
    return;
  }
  goHome();
}
