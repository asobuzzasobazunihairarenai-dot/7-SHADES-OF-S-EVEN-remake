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
} from "./online.js";
import { openDeckSelect } from "./my-deck-select.js";
import { playSound } from "./sound.js";
import {
  ensureNotifyPermission,
  showBrowserNotification,
  startFaviconAlert,
  stopFaviconAlert,
} from "./browser-notify.js";
import { applyAvatarContent, isImageAvatar } from "./avatar-render.js";
import { resolveAvatarValue } from "./player-identity.js";

const POLL_INTERVAL_MS = 2500;
const READY_WINDOW_SEC = 60; // サーバー側so7_ranked_pollの解散閾値と揃える（見た目のカウントダウン用）
const RANK_NAMES = ["ブロンズ", "シルバー", "ゴールド", "プラチナ", "ダイヤモンド", "マスター", "レジェンド"];

let overlayEl = null; // 待機画面オーバーレイ
let statusEl = null;
let countEl = null;
let pollTimer = null;
let myUserId = null;
let myDeck = null;
let mySize = 2; // 希望人数（2/3/4）。同じ size 同士だけがマッチする。
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
  // マッチ成立（レディチェック）は別タブ/別アプリを見ていると見逃しやすいので、この操作起点で
  // ブラウザ通知の許可を取っておく（許可済み/拒否済みなら何もしない）。
  void ensureNotifyPermission();
  // 人数選択（2/3/4）→ デッキ確認 → キュー登録の順。
  showSizeSelect((size) => {
    if (!size) {
      exitToHome?.(); // やめる → ホームへ戻す
      return;
    }
    openDeckSelect({
      durationSec: 0,
      subtitle: `${size}人ランク戦で使うデッキを選んでください`,
      onResolved: (resolved) => {
        void beginQueue(resolved, size);
      },
    });
  });
}

// 人数選択モーダル。onChosen(size|null)。同じ size 同士だけがマッチする。
function showSizeSelect(onChosen) {
  const modal = document.createElement("div");
  modal.id = "ranked-size-modal";
  const inner = document.createElement("div");
  inner.className = "ranked-ready-inner";

  const heading = document.createElement("div");
  heading.className = "ranked-ready-heading";
  heading.textContent = "🏆 ランク戦・人数を選ぶ";
  inner.appendChild(heading);

  const note = document.createElement("div");
  note.className = "ranked-size-note";
  note.textContent = "同じ人数を選んだ人同士でマッチします。プレイ人口が少ないうちは2人が一番早くマッチします。";
  inner.appendChild(note);

  const btns = document.createElement("div");
  btns.className = "ranked-size-btns";
  const defs = [
    { size: 2, label: "2人", sub: "1対1" },
    { size: 3, label: "3人", sub: "3人対戦" },
    { size: 4, label: "4人", sub: "4人対戦" },
  ];
  const close = () => modal.remove();
  for (const d of defs) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "ranked-size-btn";
    const main = document.createElement("span");
    main.textContent = d.label;
    const sub = document.createElement("span");
    sub.className = "ranked-size-btn-sub";
    sub.textContent = d.sub;
    b.appendChild(main);
    b.appendChild(sub);
    b.addEventListener("click", () => {
      close();
      onChosen(d.size);
    });
    btns.appendChild(b);
  }
  inner.appendChild(btns);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "ranked-size-cancel";
  cancel.textContent = "やめる";
  cancel.addEventListener("click", () => {
    close();
    onChosen(null);
  });
  inner.appendChild(cancel);

  modal.appendChild(inner);
  document.body.appendChild(modal);
}

async function beginQueue(resolved, size) {
  if (!resolved) return;
  myDeck = resolved;
  mySize = size;
  showWaitingScreen();
  setWaitingStatus("キューに登録しています…");
  const ok = await enqueueRanked(resolved, size);
  if (!ok) {
    setWaitingStatus("キューに入れませんでした（ログイン状態・通信をご確認ください）。");
    return;
  }
  setWaitingStatus("対戦相手を探しています…");
  startPolling();
}

// ---- 待機画面 -------------------------------------------------------------

function showWaitingScreen() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "ranked-waiting";

  const title = document.createElement("div");
  title.className = "ranked-waiting-title";
  title.textContent = `🏆 ランク戦（${mySize}人）・対戦相手を探しています`;
  overlayEl.appendChild(title);

  const spinner = document.createElement("div");
  spinner.className = "ranked-waiting-spinner";
  overlayEl.appendChild(spinner);

  statusEl = document.createElement("div");
  statusEl.className = "ranked-waiting-status";
  statusEl.textContent = "対戦相手を探しています…";
  overlayEl.appendChild(statusEl);

  countEl = document.createElement("div");
  countEl.className = "ranked-waiting-count";
  countEl.textContent = "";
  overlayEl.appendChild(countEl);

  const hint = document.createElement("div");
  hint.className = "ranked-waiting-hint";
  hint.textContent = "相手が見つかると「対戦開始」ボタンが出ます。別のタブで待っていても、音とタブの点滅でお知らせします。";
  overlayEl.appendChild(hint);

  // 待機中CPU練習（docs/ranked-spec.md「待機中にCPU練習」）。探している間ヒマなので、
  // CPU戦で練習できる。人間が見つかったら自動で中断して「対戦開始」に呼び戻す。
  // CPU戦はランク無効（レートに一切影響しない・ローカル戦）。
  const practiceBtn = document.createElement("button");
  practiceBtn.type = "button";
  practiceBtn.className = "ranked-waiting-practice";
  practiceBtn.textContent = "🤖 CPUと練習する（マッチしたら中断）";
  practiceBtn.addEventListener("click", () => void startPractice());
  overlayEl.appendChild(practiceBtn);

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "ranked-waiting-cancel";
  cancelBtn.textContent = "キャンセル";
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
  closeWaitingScreen();
  showPracticeBanner();
  try {
    const { startCpuBattle, runCpuBattleSetup } = await import("./cpu-battle.js");
    await startCpuBattle();
    // 盤面はもう見えている（ランク戦はホームから来ておりオープニング画面は閉じている）。
    // ホームのCPU戦と同じく、セットアップ演出は待たずに走らせる。
    runCpuBattleSetup().catch((err) => console.error("practice runCpuBattleSetup failed", err));
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
  label.textContent = "🏆 ランク戦の相手を探し中…（見つかると練習を中断します）";
  practiceBannerEl.appendChild(label);
  const stopBtn = document.createElement("button");
  stopBtn.type = "button";
  stopBtn.textContent = "練習をやめて待機に戻る";
  stopBtn.addEventListener("click", async () => {
    await stopPractice();
    showWaitingScreen();
    setWaitingStatus("対戦相手を探しています…");
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
  countEl.textContent = count > 0 ? `現在 ${count} 人が対戦相手を探しています` : "今は他に探している人がいません";
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
      setWaitingStatus("通信エラー。再試行中…");
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
    if (lastState === "matched") hideReadyModal(); // ペア解散→待機に戻った
    setWaitingStatus("対戦相手を探しています…");
    lastState = "waiting";
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
    }
    lastState = "matched";
  } else if (state === "ingame") {
    lastState = "ingame";
    if (practicing) await stopPractice(); // 保険（通常はmatchedで畳み済み）
    await enterRankedGame(res.game_id, res.opponents);
  } else {
    // 'none' — キューから外れた（通常はポーリング中は起きない）。待機画面を閉じる。
    if (!entering) {
      stopPolling();
      stopTitleFlash();
      setWaitingStatus("キューから外れました。");
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
    title: "▶ 相手が見つかりました！",
    body: "ランク戦の対戦相手が見つかりました。戻って「対戦開始」を押してください。",
    tag: "so7-ranked-matched",
  });
}

function startTitleFlash() {
  if (titleFlashTimer) return;
  originalTitle = document.title;
  let on = false;
  titleFlashTimer = setInterval(() => {
    on = !on;
    document.title = on ? "▶ 相手が見つかりました！" : originalTitle;
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
    console.warn("[so7][ranked] 相手アバターが画像/絵文字として認識できません:", JSON.stringify(oppAvatar));
  }
  applyAvatarContent(avatar, safeAvatar);
  opp.appendChild(avatar);
  const info = document.createElement("div");
  info.className = "ranked-ready-info";
  const nameEl = document.createElement("div");
  nameEl.className = "ranked-ready-name";
  nameEl.textContent = (o && o.name) || "対戦相手";
  info.appendChild(nameEl);
  const rankEl = document.createElement("div");
  rankEl.className = "ranked-ready-rank";
  const rank = o && o.rank;
  rankEl.textContent = typeof rank === "number" && RANK_NAMES[rank] ? `ランク: ${RANK_NAMES[rank]}` : "ランク: ブロンズ";
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
  heading.textContent = opponents.length >= 2 ? "対戦相手が見つかりました！" : "相手が見つかりました！";
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
  note.textContent = "全員が「対戦開始」を押すと始まります。押さないと自動でキャンセルされます。";
  inner.appendChild(note);

  const countdown = document.createElement("div");
  countdown.className = "ranked-ready-countdown";
  inner.appendChild(countdown);

  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "ranked-ready-start";
  startBtn.textContent = "対戦開始";
  startBtn.addEventListener("click", async () => {
    startBtn.disabled = true;
    startBtn.textContent = "相手を待っています…";
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
    countdown.textContent = `残り ${remain} 秒`;
  };
  updateCd();
  readyCountdownTimer = setInterval(() => {
    remain -= 1;
    if (remain <= 0) {
      remain = 0;
      updateCd();
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
  setWaitingStatus("対局を準備しています…");
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
    setWaitingStatus("対局への入場に失敗しました。時間をおいて再度お試しください。");
    entering = false;
  }
}
