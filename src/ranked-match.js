// ランク戦（フリーマッチ）のクライアント側マッチメイキング（フェーズ2b）。docs/ranked-spec.md参照。
// ホームの「🏆 フリーマッチ（ランク戦）」タイルから起動する。
//
// 流れ（レディチェック方式）:
//   デッキ確認(openDeckSelect) → enqueue → 待機画面(pollループ・待機人数表示) →
//   マッチ成立で通知(音・タブ点滅)＋レディチェック(両者「対戦開始」を押す) →
//   is_ranked対局へ自動入場（joinRoomで入場・user_idが先の方だけstartGameでBOOTSTRAP）。
//
// 低母数対策のうち「待機人数の表示」「通知（音・タブ点滅）」はここで実装済み。
// 「待機中にCPU練習」は盤面をCPU戦に明け渡す関係で複雑なため次回（フォローアップ）に回す。
// 「合言葉でフレンドとランク戦」は既存の部屋にis_ranked印を付けるだけなのでフェーズ3（レート反映）で。
//
// このモジュールはホームから動的importされる（cpu-battle.jsと同じく、静的な依存辺を作って
// online.js↔他の循環参照を表面化させないため）。静的importするonline.js/my-deck-select.js/
// sound.js/avatar-render.jsはいずれもranked-match.jsをimportしないので循環の心配はない。

import {
  enqueueRanked,
  pollRanked,
  readyRanked,
  leaveRankedQueue,
  getCurrentUser,
  joinRoom,
  startGame,
  captureRankedPreMatchRank,
  sendPushToUsers,
} from "./online.js";
import { t } from "./ui-text.js";
// ユーザー要望2026-09-02「ランク戦待ちの時にも（通知を）促す」。
import { shouldSuggestRankedNotify, enableRankedNotifyFromPrompt } from "./ranked-notify.js"; // UI英語化フェーズ11
import { openDeckSelect } from "./my-deck-select.js";
import { playSound } from "./sound.js";
import {
  primeNotifyPermission,
  showBrowserNotification,
  startFaviconAlert,
  stopFaviconAlert,
} from "./browser-notify.js";
// Web Push（続き198）: 通知許可が取れたら購読して自席subscriptionを保存しておく。
import { subscribeToPush } from "./push-notify.js";
import { applyAvatarContent, isImageAvatar } from "./avatar-render.js";
import { resolveAvatarValue } from "./player-identity.js";

const POLL_INTERVAL_MS = 2500;
const READY_WINDOW_SEC = 60; // サーバー側so7_ranked_pollの解散閾値と揃える（見た目のカウントダウン用）
// UI英語化フェーズ11: 段位名は使う時に解決する（定数にすると読み込み時の言語で固定される）。
function rankNames() {
  return [t("rm.L43"), t("rm.L43_2"), t("rm.L43_3"), t("rm.L43_4"), t("rm.L43_5"), t("rm.L43_6"), t("rm.L43_7")];
}

let overlayEl = null; // 待機画面オーバーレイ
let statusEl = null;
let countEl = null;
let pollTimer = null;
let myUserId = null;
let myDeck = null;
let entering = false; // 対局入場の二重防止
let lastState = null; // 直前のstate（matched遷移で1回だけ通知するため）
let readyModalEl = null;
let readyCountdownTimer = null;
let originalTitle = null;
let titleFlashTimer = null;
let exitToHome = null; // キャンセル/失敗時にホームへ戻すコールバック（home-screen.jsから注入）
let practicing = false; // 待機中CPU練習中か（マッチ成立で中断してオンライン対局へ移る）
let practiceBannerEl = null; // 練習中に画面隅に出す小さな「探し中」バナー

// ホームの「フリーマッチ（ランク戦）」タイルから呼ばれる入口。
// onExit: キャンセル・失敗でホームへ戻すためのコールバック（呼び出し元がclose→この関数、
// 戻る時はopenHomeScreen()を渡す）。home-screen.jsを直接importしないための注入。
export async function startRankedMatchmaking(onExit) {
  exitToHome = typeof onExit === "function" ? onExit : null;
  const user = await getCurrentUser();
  if (!user) {
    // ランク戦はログイン必須（サーバー側RPCがauth.uid()前提）。ホームへ戻してログインを促す。
    exitToHome?.();
    const { openOnlinePanel } = await import("./online-ui.js");
    openOnlinePanel();
    return;
  }
  myUserId = user.id;
  // 人数はおまかせ（2〜4人・段階的フィル）。デッキ確認 → キュー登録の順。
  // ※ブラウザ通知の許可は「いきなり本物のダイアログ」ではなく、キュー登録後に何のための通知か
  //   説明するプリパーミッションを出してから求める（beginQueue内、ユーザー報告2026-08-18）。
  openDeckSelect({
    durationSec: 0,
    subtitle: t("rm.L80"),
    onResolved: (resolved) => {
      void beginQueue(resolved);
    },
    // キューに入る前にやめたい時の逃げ道（ユーザー要望）。まだenqueueしていないので
    // ホームへ戻すだけでよい。
    onHome: () => exitToHome?.(),
  });
}

async function beginQueue(resolved) {
  if (!resolved) return;
  myDeck = resolved;
  showWaitingScreen();
  setWaitingStatus(t("rm.L94"));
  const ok = await enqueueRanked(resolved);
  if (!ok) {
    setWaitingStatus(t("rm.L97"));
    return;
  }
  setWaitingStatus(t("rm.L100"));
  startPolling();
  // 別タブ/別アプリを見ていると、マッチ成立（レディチェック）を見逃してキューから弾かれやすい。
  // その通知を出すために、何のための通知かを説明してから許可を求める（本物のダイアログは
  // ユーザーが「許可する」を押した時だけ出る）。非ブロッキングで、待機中に1回だけ。
  void primeNotifyPermission({
    title: t("rm.L106"),
    body: t("rm.L107"),
  }).then((perm) => {
    // 許可が取れたら Web Push を購読（タブ/ブラウザを閉じていてもマッチ成立を受け取れるように）。
    if (perm === "granted") void subscribeToPush();
  });
}

// ---- 待機画面 -------------------------------------------------------------

function showWaitingScreen() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "ranked-waiting";

  const title = document.createElement("div");
  title.className = "ranked-waiting-title";
  title.textContent = t("rm.L123");
  overlayEl.appendChild(title);

  const spinner = document.createElement("div");
  spinner.className = "ranked-waiting-spinner";
  overlayEl.appendChild(spinner);

  statusEl = document.createElement("div");
  statusEl.className = "ranked-waiting-status";
  statusEl.textContent = t("rm.L100");
  overlayEl.appendChild(statusEl);

  countEl = document.createElement("div");
  countEl.className = "ranked-waiting-count";
  countEl.textContent = "";
  overlayEl.appendChild(countEl);

  const hint = document.createElement("div");
  hint.className = "ranked-waiting-hint";
  hint.textContent = t("rm.L142");
  overlayEl.appendChild(hint);

  // 待機中CPU練習（docs/ranked-spec.md「待機中にCPU練習」）。探している間ヒマなので、
  // CPU戦で練習できる。人間が見つかったら自動で中断して「対戦開始」に呼び戻す。
  // CPU戦はランク無効（レートに一切影響しない・ローカル戦）。
  const practiceBtn = document.createElement("button");
  practiceBtn.type = "button";
  practiceBtn.className = "ranked-waiting-practice";
  practiceBtn.textContent = t("rm.L151");
  practiceBtn.addEventListener("click", () => void startPractice());
  overlayEl.appendChild(practiceBtn);

  // ユーザー要望2026-09-02: 待っている間に「次からは、募集中の人が現れたらお知らせしますか？」と
  // 勧める。ここで待つのをやめても、次に誰かが待ち始めた時に気づけるようにするため。
  // 既にONの人・通知が使えない環境には出さない（shouldSuggestRankedNotify）。
  if (shouldSuggestRankedNotify()) {
    const notifyRow = document.createElement("div");
    notifyRow.className = "ranked-waiting-notify";
    const notifyText = document.createElement("div");
    notifyText.className = "ranked-waiting-notify-text";
    notifyText.textContent = t("rm.notifySuggest");
    const notifyBtn = document.createElement("button");
    notifyBtn.type = "button";
    notifyBtn.className = "ranked-waiting-notify-button";
    notifyBtn.textContent = t("rm.notifySuggestBtn");
    notifyBtn.addEventListener("click", () => {
      enableRankedNotifyFromPrompt();
      notifyText.textContent = t("rm.notifyEnabled");
      notifyBtn.remove();
    });
    notifyRow.appendChild(notifyText);
    notifyRow.appendChild(notifyBtn);
    overlayEl.appendChild(notifyRow);
  }

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ranked-waiting-cancel";
  cancelBtn.textContent = t("rm.L158");
  cancelBtn.addEventListener("click", () => void cancelMatchmaking());
  overlayEl.appendChild(cancelBtn);

  document.body.appendChild(overlayEl);
}

// ---- 待機中CPU練習 --------------------------------------------------------

async function startPractice() {
  if (practicing) return;
  practicing = true;
  // 全画面の待機オーバーレイを畳んで盤面を見せ、隅に小さな「探し中」バナーを出す。
  // ポーリングは止めない（マッチ成立を裏で待ち続け、見つかったら練習を中断する）。
  try {
    const { startCpuBattle, runCpuBattleSetup } = await import("./cpu-battle.js");
    await startCpuBattle(2); // ランク待機中の練習は1対1固定（続き226。人数設定に依らず2人）。
    // 盤面が空になってから待機画面を畳む（先に畳むと、上の動的importが解決するまでの間に
    // 前の盤面が一瞬見えてしまう。ユーザー報告2026-09-03と同じ理由）。
    closeWaitingScreen();
    showPracticeBanner();
    // 盤面はもう見えている（ランク戦はホームから来ておりオープニング画面は閉じている）。
    // ホームのCPU戦と同じく、セットアップ演出は待たずに走らせる。
    runCpuBattleSetup({ count: 2 }).catch((err) => console.error("practice runCpuBattleSetup failed", err));
  } catch (err) {
    console.error("startPractice failed", err);
  }
}

// 練習を畳む。マッチ成立・手動停止・キャンセルから呼ぶ。teardownCpuBattleが疑似CPU/タイマー/
// cpu-battle印を解除し盤面を空にするので、この後オンライン対局へ移っても練習のCPU駆動は混入しない。
async function stopPractice() {
  if (!practicing) return;
  practicing = false;
  removePracticeBanner();
  try {
    const { teardownCpuBattle } = await import("./cpu-battle.js");
    await teardownCpuBattle();
  } catch (err) {
    console.error("stopPractice teardown failed", err);
  }
}

function showPracticeBanner() {
  if (practiceBannerEl) return;
  practiceBannerEl = document.createElement("div");
  practiceBannerEl.id = "ranked-practice-banner";
  const label = document.createElement("span");
  label.textContent = t("rm.L204");
  practiceBannerEl.appendChild(label);
  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.textContent = t("rm.L208");
  stopBtn.addEventListener("click", async () => {
    await stopPractice();
    showWaitingScreen();
    setWaitingStatus(t("rm.L100"));
  });
  practiceBannerEl.appendChild(stopBtn);
  document.body.appendChild(practiceBannerEl);
}

function removePracticeBanner() {
  practiceBannerEl?.remove();
  practiceBannerEl = null;
}

function setWaitingStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function updateWaitingCount(n) {
  if (!countEl) return;
  const count = Number(n) || 0;
  countEl.textContent = count > 0 ? t("rm.searching", { n: count }) : t("rm.L230");
}

function closeWaitingScreen() {
  overlayEl?.remove();
  overlayEl = null;
  statusEl = null;
  countEl = null;
}

async function cancelMatchmaking() {
  stopPolling();
  hideReadyModal();
  stopTitleFlash();
  if (practicing) await stopPractice(); // 練習中ならCPU戦を畳んでから抜ける
  await leaveRankedQueue();
  closeWaitingScreen();
  lastState = null;
  exitToHome?.(); // ホームへ戻す
}

// ---- ポーリング -----------------------------------------------------------

function startPolling() {
  stopPolling();
  const tick = async () => {
    const res = await pollRanked();
    if (!res) {
      setWaitingStatus(t("rm.L258"));
      return;
    }
    await handlePollResult(res);
  };
  void tick(); // 即時1回
  pollTimer = setInterval(() => void tick(), POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

async function handlePollResult(res) {
  updateWaitingCount(res.waiting_count);
  const state = res.state;
  if (state === "waiting") {
    if (lastState === "matched" || lastState === "forming") hideReadyModal(); // グループ解散→待機に戻った
    setWaitingStatus(t("rm.L100"));
    lastState = "waiting";
  } else if (state === "forming") {
    // 段階的フィル中（2人以上集合。締め切りまで、さらに参加者を待っている）。
    if (lastState === "matched") hideReadyModal();
    const here = (res.size || 0);
    const sec = res.grow_seconds != null ? res.grow_seconds : 0;
    setWaitingStatus(t("rm.gathering", { here, sec }));
    lastState = "forming";
  } else if (state === "matched") {
    if (lastState !== "matched") {
      // 待機中CPU練習をしていたら、練習を畳んで待機オーバーレイを戻してから
      // 「対戦開始」モーダルを出す（ユーザーを対人戦へ呼び戻す）。
      if (practicing) {
        await stopPractice();
        showWaitingScreen();
      }
      notifyMatchFound();
      showReadyModal(res);
      // タブ/ブラウザを閉じている相手にも「対戦相手が見つかった」を届ける（Web Push）。
      // Notification API（notifyMatchFound）は“タブが生きている間”だけなので、閉じている相手は
      // これで呼び戻す。両クライアントが送っても、SW側は同じtagで1つにまとまる／サーバー側は
      // 同じpending_matchのメンバーにしか送らない（濫用防止）。best-effortで失敗は握りつぶす。
      const oppIds = Array.isArray(res.opponents) ? res.opponents.map((o) => o && o.user_id).filter(Boolean) : [];
      void sendPushToUsers(oppIds, {
        title: t("rm.L304"),
        body: t("rm.L305"),
        url: "./",
        tag: "so7-ranked-matched",
      });
    }
    lastState = "matched";
  } else if (state === "ingame") {
    lastState = "ingame";
    if (practicing) await stopPractice(); // 保険（通常はmatchedで畳み済み）
    await enterRankedGame(res.game_id, res.opponents);
  } else {
    // 'none' — キューから外れた。対戦開始を押さずに締め切りを迎え、押した人だけで対局が
    // 始まった（＝自分はAFKで外された）場合もここに来る。レディチェックのモーダルを閉じて
    // 待機画面を閉じる。
    if (!entering) {
      hideReadyModal();
      stopPolling();
      stopTitleFlash();
      setWaitingStatus(t("rm.L323"));
      lastState = "none";
    }
  }
}

// ---- 通知（音・タブ点滅） --------------------------------------------------

function notifyMatchFound() {
  try {
    playSound("arrivalEffect"); // 前面で見ている時用（隠れている間は sound.js 側で鳴らない）
  } catch {
    /* 音は best-effort */
  }
  startTitleFlash();
  startFaviconAlert();
  // 別タブ/別アプリを見ていてもレディチェックを見逃さないよう、OS のブラウザ通知で知らせる。
  showBrowserNotification({
    title: t("rm.L304"),
    body: t("rm.L305"),
    tag: "so7-ranked-matched",
  });
}

function startTitleFlash() {
  if (titleFlashTimer) return;
  originalTitle = document.title;
  let on = false;
  titleFlashTimer = setInterval(() => {
    on = !on;
    document.title = on ? t("rm.L304") : originalTitle;
  }, 900);
}

function stopTitleFlash() {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (originalTitle != null) {
    document.title = originalTitle;
    originalTitle = null;
  }
  stopFaviconAlert();
}

// ---- レディチェック -------------------------------------------------------

// 相手1人分の行（アバター・名前・ランク）を作る。o = {user_id, name, avatar, rank}。
function buildOpponentRow(o) {
  const opp = document.createElement("div");
  opp.className = "ranked-ready-opponent";
  const avatar = document.createElement("div");
  avatar.className = "ranked-ready-avatar";
  // アバターが画像として認識できない値だと生テキスト（パス/URL断片）で出てしまう不具合の対策。
  // まずセンチネル（"protagonist"／"entrusted"＝青年/託された者たちアバター）を実際の画像パスへ解決する
  // （#121）。レディチェック時点ではまだ座席・駒の色が無いため、駒の無いダミー座席を渡して灰色版に解決。
  // 画像 or 短い絵文字（≤2コードポイント）ならそのまま、それ以外は生値を見せず絵文字にフォールバック。
  const oppAvatar = resolveAvatarValue("__ranked_opponent__", o && o.avatar);
  const safeAvatar =
    isImageAvatar(oppAvatar) || (typeof oppAvatar === "string" && [...oppAvatar].length <= 2 && oppAvatar.length > 0)
      ? oppAvatar
      : "🎮";
  if (oppAvatar && safeAvatar === "🎮") {
    console.warn(t("rm.L387"), JSON.stringify(oppAvatar));
  }
  applyAvatarContent(avatar, safeAvatar);
  opp.appendChild(avatar);
  const info = document.createElement("div");
  info.className = "ranked-ready-info";
  const nameEl = document.createElement("div");
  nameEl.className = "ranked-ready-name";
  nameEl.textContent = (o && o.name) || t("rm.L395");
  info.appendChild(nameEl);
  const rankEl = document.createElement("div");
  rankEl.className = "ranked-ready-rank";
  const rank = o && o.rank;
  rankEl.textContent = typeof rank === "number" && rankNames()[rank] ? t("rm.rankOf", { rank: rankNames()[rank] }) : t("rm.L400");
  info.appendChild(rankEl);
  opp.appendChild(info);
  return opp;
}

function showReadyModal(res) {
  if (readyModalEl) return;
  readyModalEl = document.createElement("div");
  readyModalEl.id = "ranked-ready-modal";

  const inner = document.createElement("div");
  inner.className = "ranked-ready-inner";

  const opponents = Array.isArray(res.opponents) ? res.opponents : [];
  const heading = document.createElement("div");
  heading.className = "ranked-ready-heading";
  heading.textContent = opponents.length >= 2 ? t("rm.L417") : t("rm.L417_2");
  inner.appendChild(heading);

  // 相手情報（アバター・名前・ランク）を人数分並べる。
  const oppList = document.createElement("div");
  oppList.className = "ranked-ready-opponents";
  for (const o of opponents) {
    oppList.appendChild(buildOpponentRow(o));
  }
  inner.appendChild(oppList);

  const note = document.createElement("div");
  note.className = "ranked-ready-note";
  note.textContent = t("rm.L430");
  inner.appendChild(note);

  const countdown = document.createElement("div");
  countdown.className = "ranked-ready-countdown";
  inner.appendChild(countdown);

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "ranked-ready-start";
  startBtn.textContent = t("rm.L440");
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = t("rm.L443");
    stopTitleFlash();
    const gameId = await readyRanked(res.match_id);
    if (gameId) {
      // 全員readyになり対局が作成された（自分が最後）→ そのまま入場。
      await enterRankedGame(gameId, res.opponents);
    }
    // gameId が null ならまだ相手待ち。ポーリングが 'ingame' を検知して enterRankedGame する。
  });
  inner.appendChild(startBtn);

  readyModalEl.appendChild(inner);
  document.body.appendChild(readyModalEl);

  // 見た目のカウントダウン（サーバーが60秒でペアを解散する）。
  let remain = READY_WINDOW_SEC;
  const updateCd = () => {
    countdown.textContent = t("rm.remain", { n: remain });
  };
  updateCd();
  readyCountdownTimer = setInterval(() => {
    remain -= 1;
    if (remain <= 0) {
      remain = 0;
      // ユーザー要望2026-08-18「2人しか押さなくても押した人だけで開始」。締め切り時点で
      // ready が2人以上いれば、その人たちだけで対局が始まる（サーバーの so7_ranked_poll が判定）。
      countdown.textContent = t("rm.L469");
      return;
    }
    updateCd();
  }, 1000);
}

function hideReadyModal() {
  readyModalEl?.remove();
  readyModalEl = null;
  if (readyCountdownTimer) {
    clearInterval(readyCountdownTimer);
    readyCountdownTimer = null;
  }
  stopTitleFlash(); // レディチェックUIが消えたらタブ点滅・ファビコン点滅も止める
}

// ---- 対局入場 -------------------------------------------------------------

async function enterRankedGame(gameId, opponents) {
  if (entering) return;
  entering = true;
  stopPolling();
  hideReadyModal();
  stopTitleFlash();
  setWaitingStatus(t("rm.L494"));
  try {
    await leaveRankedQueue(); // キューからクリーンに抜ける
    // 昇格演出（docs/ranked-spec.md）用に、対局開始時点の自分のランクを覚えておく
    // （結果反映後と比べて rank が上がっていれば昇格。結果直前だとレースになるので開始時に取る）。
    await captureRankedPreMatchRank();
    // 席は so7_ranked_ready がサーバー側で作成済み → so7_join_room は即return、
    // subscribeToGame が online mode/transport/hydrate/heartbeat を立てる。
    await joinRoom(gameId);
    // 二重BOOTSTRAP防止: 参加者全員のuser_idのうちアルファベット順で最も先の1人だけが開始を
    // トリガーする（2〜4人共通。maybeTriggerRematchと同じ考え方）。他の人は誰かのBOOTSTRAPの
    // hydrateで盤面が出る。
    const oppIds = Array.isArray(opponents) ? opponents.map((o) => o && o.user_id).filter(Boolean) : [];
    const allIds = [myUserId, ...oppIds].filter(Boolean).sort();
    if (myUserId && allIds.length > 0 && allIds[0] === myUserId) {
      // ランク戦の固定ルール（ユーザー決定2026-08-17）: タイマー・マイデッキ戦・白黒（無色）カード・
      // ブーストモードを全てON。フレンドランク戦（online-ui.js）と揃える。
      await startGame(gameId, {
        includeBlackWhite: true,
        timerEnabled: true,
        pseudoCpuModeEnabled: false,
        boost: true,
        myDeckMode: true,
        skipDeckSelection: true, // 席に既にデッキがある（enqueue時に確定）
      });
    }
    // 盤面はhydrateで下に出るので待機画面を閉じる。
    closeWaitingScreen();
    lastState = null;
  } catch (err) {
    console.error("enterRankedGame failed", err);
    setWaitingStatus(t("rm.L525"));
    entering = false;
  }
}
