// ユーザー要望「ゲーム終了時に、戦績システムにコメントを記入する欄（パス可）→
// 戦績を確認してみるボタン→もう一度遊ぶボタン、という流れを追加したい」への対応。
// victory.jsのcheckForVictory()から、オンライン対戦の勝利直後に呼ばれる
// （showVictoryModal()とは別の、独立したパネル）。
//
// 対戦記録の戦績システムへの登録は、このパネルではなく「勝敗が決まった瞬間」に
// victory.js から行う（ユーザー要望2026-08-28、続き298）。試合ID（＝日時ベースの
// m_<エポックms>）もその時点で確定するため、このパネルは「確定済みの試合IDに対して、
// 参加者が各々コメントを付ける」場所になった（勝者・敗者の区別なく全員にコメント欄を
// 出し、全員が自分で投稿する。以前のように勝者の進み具合を待たない）。
//
// 「もう一度遊ぶ」は、まだこの部屋にいる全員が押すか部屋を抜けるまで待つ
// （online.jsのsetRematchReady/maybeTriggerRematch参照）。実際に新しい対局が
// 始まったこと（＝勝者のロック済み色数が7から減った）を全クライアントが検知したら、
// このパネルは自動で閉じる。

import { subscribe } from "./state.js";
import {
  isOnlineMode,
  getSelfSeat,
  getCurrentGameId,
  getCurrentUser,
  ensureStatsMatchRecorded,
  getRecordedStatsMatchId,
  resolveMatchIdForComment,
  submitMatchComment,
  submitMatchCommentForSeat,
  onMatchRecordedEvents,
  onMatchCommentEvents,
  broadcastMatchComment,
  setRematchReady,
  maybeTriggerRematch,
  leaveGame,
} from "./online.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ11
import { createBackdrop } from "./ui-helpers.js";
import { logAction } from "./action-log.js";
import { fetchStatsProfile, getTierInfo } from "./stats-profile.js";
import { showRankUpModal } from "./rank-up-modal.js";
import { setSavedRoomPassword } from "./online-ui.js";
import { openHomeScreen } from "./home-screen.js";
// cpu-battle-state.js は依存ゼロの葉モジュール（循環importの心配なし）。CPU戦終了パネルの
// 「ホームに戻る」でCPU戦フラグを下ろすのに使う。
import { setCpuBattleActive } from "./cpu-battle-state.js";
// 勝利BGMを「もう一度遊ぶ/戦う」押下の“その瞬間”に止めるために使う（#88）。sound.jsは
// state.js/action-log.jsしかimportしない葉に近いモジュールなので循環importの心配はない。
import { stopVictoryBgm } from "./sound.js";

// victory.jsはこのモジュール（showPostGamePanel）を呼ぶ側になる予定のため、ここから
// victory.jsを直接importすると循環importになる。他の箇所（setup-animation.js等）と
// 同じ「main.jsから注入してもらう」パターンで回避する。
let getLockedCountFn = null;
let resetVictoryTrackingFn = null;
export function registerVictoryHelpers({ getLockedCount, resetVictoryTracking }) {
  getLockedCountFn = getLockedCount;
  resetVictoryTrackingFn = resetVictoryTracking;
}

const STATS_SITE_URL = "https://asobuzzasobazunihairarenai-dot.github.io/BATTLE-log/";

let panelEl = null;
let backdropEl = null;
let pollTimerId = null;
let unsubscribeStateWatch = null;
let unsubscribeMatchRecorded = null; // 敗者側で試合IDのブロードキャストを待ち受けている間の解除関数
let unsubscribeMatchComment = null; // 勝者側で敗者コメントの中継を待ち受けている間の解除関数（#45）
let restoreIconEl = null; // 「盤面を確認する」で最小化した時、左上に出す復元アイコン

// ユーザー要望「対戦終了モーダルに『盤面を確認する』を追加。押すと最小化の案内モーダルを出した
// あと、画面左上に縮小されて、いつでもそこから元に戻せるように」。パネル＋背景を隠し、左上に
// 復元アイコンを出す。アイコンを押すとパネルを元通り表示する。
function removeRestoreIcon() {
  restoreIconEl?.remove();
  restoreIconEl = null;
}
function minimizePanel() {
  if (backdropEl) backdropEl.style.display = "none";
  if (panelEl) panelEl.style.display = "none";
  removeRestoreIcon();
  restoreIconEl = document.createElement("button");
  restoreIconEl.id = "post-game-restore-icon";
  restoreIconEl.type = "button";
  restoreIconEl.textContent = "🏆";
  restoreIconEl.title = t("postgamepanel.L83");
  restoreIconEl.style.cssText =
    "position: fixed; top: 0.9rem; left: 0.9rem; z-index: 10602; width: 3rem; height: 3rem; " +
    "border-radius: 50%; background: rgba(15,23,32,0.95); border: 1px solid rgba(250,204,21,0.7); " +
    "color: #fde68a; font-size: 1.4rem; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.55); " +
    "display: flex; align-items: center; justify-content: center; padding: 0; animation: post-game-restore-pulse 1.8s ease-in-out infinite;";
  restoreIconEl.addEventListener("click", () => {
    removeRestoreIcon();
    if (backdropEl) backdropEl.style.display = "";
    if (panelEl) panelEl.style.display = "";
  });
  document.body.appendChild(restoreIconEl);
}
// 最小化の案内モーダル（OKで実際に最小化する）。
function showMinimizeNoticeThenMinimize() {
  const nb = createBackdrop(() => {}, { dim: true, zIndex: 10610 });
  const m = document.createElement("div");
  m.style.cssText =
    "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(22rem, 90vw); " +
    "background: rgba(15,23,32,0.98); border: 1px solid rgba(148,163,184,0.4); border-radius: 0.5rem; " +
    "padding: 1.2rem; z-index: 10611; color: #e2e8f0; font-family: sans-serif; text-align: center;";
  const txt = document.createElement("div");
  txt.textContent = t("postgamepanel.L105");
  txt.style.cssText = "margin-bottom: 1rem; line-height: 1.6; font-size: 0.9rem;";
  const ok = document.createElement("button");
  ok.type = "button";
  ok.textContent = "OK";
  ok.style.cssText = "padding: 0.4rem 1.4rem; background: #0891b2; border: none; border-radius: 0.3rem; color: #fff; cursor: pointer;";
  ok.addEventListener("click", () => {
    nb.remove();
    m.remove();
    minimizePanel();
  });
  m.appendChild(txt);
  m.appendChild(ok);
  document.body.appendChild(nb);
  document.body.appendChild(m);
}

function stopPolling() {
  if (pollTimerId) {
    clearInterval(pollTimerId);
    pollTimerId = null;
  }
}

function closePanel() {
  stopPolling();
  if (unsubscribeStateWatch) {
    unsubscribeStateWatch();
    unsubscribeStateWatch = null;
  }
  if (unsubscribeMatchRecorded) {
    unsubscribeMatchRecorded();
    unsubscribeMatchRecorded = null;
  }
  if (unsubscribeMatchComment) {
    unsubscribeMatchComment();
    unsubscribeMatchComment = null;
  }
  removeRestoreIcon();
  backdropEl?.remove();
  panelEl?.remove();
  backdropEl = null;
  panelEl = null;
}

function buildButtonsSection(gameId) {
  // #189: 変数名を t にすると翻訳関数 t を隠して "t is not a function" になる。
  const tone = postGamePanelTokens();
  const col = document.createElement("div");

  const row = document.createElement("div");
  row.style.cssText = "display: flex; gap: 0.6rem; flex-wrap: wrap;";

  const statsBtn = document.createElement("button");
  statsBtn.type = "button";
  statsBtn.textContent = t("postgamepanel.L159");
  statsBtn.disabled = !STATS_SITE_URL;
  if (!STATS_SITE_URL) statsBtn.title = t("postgamepanel.L161");
  statsBtn.style.cssText = `
    padding: 0.5rem 1rem; background: #0369a1; border: none; border-radius: 0.3rem;
    color: white; cursor: pointer; font-size: 0.85rem;
  `;
  if (!STATS_SITE_URL) statsBtn.style.opacity = "0.5";
  statsBtn.addEventListener("click", () => {
    if (STATS_SITE_URL) window.open(STATS_SITE_URL, "_blank", "noopener");
  });

  const rematchBtn = document.createElement("button");
  rematchBtn.type = "button";
  rematchBtn.textContent = t("postgamepanel.L173");
  rematchBtn.style.cssText = `
    padding: 0.5rem 1rem; background: #15803d; border: none; border-radius: 0.3rem;
    color: white; cursor: pointer; font-size: 0.85rem;
  `;

  const waitingLabel = document.createElement("div");
  waitingLabel.style.cssText = `font-size: 0.75rem; color: ${tone.sub}; margin-top: 0.5rem; display: none;`;
  waitingLabel.textContent = t("postgamepanel.L181");

  rematchBtn.addEventListener("click", async () => {
    // #88: 「もう一度遊ぶ」を押した“その瞬間”に勝利BGMを止める（従来は次の対局がSET_TURN_PLAYER
    // まで進んで初めてinitGameBgmAutoStartが止めていたため、セットアップ完了まで鳴り続けていた）。
    stopVictoryBgm();
    rematchBtn.disabled = true;
    rematchBtn.textContent = t("postgamepanel.L188");
    waitingLabel.style.display = "block";
    try {
      await setRematchReady(true);
    } catch (err) {
      console.error("setRematchReady failed", err);
    }
    stopPolling();
    pollTimerId = setInterval(() => {
      maybeTriggerRematch(gameId).catch((err) => console.error("maybeTriggerRematch failed", err));
    }, 3000);
  });

  // ユーザー要望「勝利後『もう一度遊ぶ』モーダルの時に、『この部屋を出る』ボタンも
  // お願いします」。以前はこのパネルから抜けるには✕で閉じてローカル表示に戻すか、
  // 「もう一度遊ぶ」を押すかの2択しかなく、「この部屋はもう十分遊んだので別の部屋を
  // 探したい」という場合の導線が無かった。online-ui.jsの「この部屋を離れる」ボタンと
  // 同じ処理（leaveGame→保存済みパスワード削除→URLの?room=を消す）を行い、このパネルを
  // 閉じてから部屋一覧パネル（openOnlinePanel）を開き直す。
  // ユーザー要望「盤面を確認する」ボタン。押すと案内モーダル→最小化（左上の🏆アイコンから復元）。
  const boardBtn = document.createElement("button");
  boardBtn.type = "button";
  boardBtn.textContent = t("postgamepanel.L210");
  boardBtn.style.cssText = `
    padding: 0.5rem 1rem; background: ${tone.infoBg};
    border: 1px solid ${tone.infoBorder}; border-radius: 0.3rem;
    color: ${tone.infoText}; cursor: pointer; font-size: 0.85rem;
  `;
  boardBtn.addEventListener("click", () => {
    showMinimizeNoticeThenMinimize();
  });

  // ユーザー要望（変更）「『この部屋を出る』を押したらホーム画面に戻る」。以前は部屋一覧
  // （openOnlinePanel）へ戻していたが、ホーム画面へ戻す。部屋からの離脱・保存パスワード削除・
  // URLの?room=消去は従来どおり。
  const leaveBtn = document.createElement("button");
  leaveBtn.type = "button";
  leaveBtn.textContent = t("postgamepanel.L225");
  leaveBtn.style.cssText = `
    padding: 0.5rem 1rem; background: ${tone.secBg};
    border: 1px solid ${tone.secBorder}; border-radius: 0.3rem;
    color: ${tone.secText}; cursor: pointer; font-size: 0.85rem;
  `;
  leaveBtn.addEventListener("click", () => {
    // #182: パネルが出た直後のクリックは、前のモーダルを閉じたクリックの続きの可能性が高い。
    const sinceShownMs = Date.now() - postGamePanelShownAt;
    logAction("diag-postgame-leave", { sinceShownMs, guarded: isPostGameInputGuarded() });
    if (isPostGameInputGuarded()) return;
    leaveGame();
    setSavedRoomPassword(gameId, null);
    history.replaceState(null, "", location.pathname);
    closePanel();
    openHomeScreen();
  });

  row.appendChild(statsBtn);
  row.appendChild(rematchBtn);
  row.appendChild(boardBtn);
  row.appendChild(leaveBtn);
  col.appendChild(row);
  col.appendChild(waitingLabel);
  return col;
}

// （旧 waitForMatchId は撤去した。試合IDは勝敗確定の瞬間に確定するようになり〈続き298〉、
// 「勝者が試合を作るのを待つ」必要そのものが無くなったため。待ちと検索は online.js の
// resolveMatchIdForComment に一本化してある。）

// 全参加者共通のコメント入力欄（案①：勝者・敗者を区別せず全員がコメントできる）。
// onFinish(comment)には入力文字列（パス時は空文字）が渡る。
function buildCommentSection(onFinish) {
  // #189: 変数名を t にすると翻訳関数 t を隠して "t is not a function" になる。
  const tone = postGamePanelTokens();
  const wrap = document.createElement("div");

  const label = document.createElement("div");
  label.textContent = t("postgamepanel.L263");
  label.style.cssText = "font-size: 0.85rem; margin-bottom: 0.5rem; line-height: 1.5;";
  wrap.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = t("postgamepanel.L269");
  textarea.style.cssText = `
    width: 100%; box-sizing: border-box; padding: 0.5rem; background: ${tone.fieldBg};
    border: 1px solid ${tone.fieldBorder}; border-radius: 0.3rem; color: ${tone.fieldText};
    font-size: 0.85rem; resize: vertical; font-family: sans-serif;
  `;
  wrap.appendChild(textarea);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 0.5rem; margin-top: 0.6rem;";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = t("postgamepanel.L282");
  submitBtn.style.cssText = `
    padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem;
    color: white; cursor: pointer; font-size: 0.85rem;
  `;

  const passBtn = document.createElement("button");
  passBtn.type = "button";
  passBtn.textContent = t("postgamepanel.L290");
  passBtn.style.cssText = `
    padding: 0.4rem 0.9rem; background: ${tone.secBg};
    border: 1px solid ${tone.secBorder}; border-radius: 0.3rem;
    color: ${tone.secText}; cursor: pointer; font-size: 0.85rem;
  `;

  let done = false;
  function finish(comment) {
    if (done) return;
    done = true;
    submitBtn.disabled = true;
    passBtn.disabled = true;
    submitBtn.textContent = comment ? t("postgamepanel.L303") : "…";
    onFinish(comment);
  }
  submitBtn.addEventListener("click", () => finish(textarea.value.trim()));
  passBtn.addEventListener("click", () => finish(""));
  // ユーザー報告「コメント入力後にエンターで閉じたらコメントが反映されなかった」。原因は
  // Enterが単に改行になるだけで送信されていなかったこと。Enter（Shift無し）で「登録する」と
  // 同じ送信を行う（改行したい時はShift+Enter）。
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      finish(textarea.value.trim());
    }
  });

  btnRow.appendChild(submitBtn);
  btnRow.appendChild(passBtn);
  wrap.appendChild(btnRow);
  return wrap;
}

// ローカルCPU戦（1人用）専用の終了パネル（ユーザー要望2026-08-12）。オンラインの
// showPostGamePanel（戦績連携・もう一度遊ぶの部屋同期・コメント等）はCPU戦には重すぎるため、
// 「もう一度戦う／盤面を見る（最小化）／ホームに戻る」の3つだけのシンプルなパネルにする。
// 最小化（盤面を見る）と復元アイコンは online 版と同じ minimizePanel/restoreIcon をそのまま流用する。
// #5（ユーザー報告2026-08-19「対戦完了のもう一度やるモーダルがライトモードなのにダーク」）:
// このパネルは inline style でダーク色を直書きしていたため、body.theme-light の CSS で上書きできず
// ライトモードでもダークのままだった。ライト（theme-light=全体 or theme-light-ingame=盤面）のどちらか
// がONなら明るい配色にする（inlineで直に切り替えるので確実）。
function postGamePanelSkinCss() {
  const light =
    document.body.classList.contains("theme-light") || document.body.classList.contains("theme-light-ingame");
  return light
    ? "background: rgba(249, 250, 251, 0.99); border: 1px solid rgba(100, 116, 139, 0.45); color: #1e293b; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);"
    : "background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4); color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);";
}

// ユーザー報告2026-08-24「対戦終了時のモーダルの文字が見にくい」。#5でパネルの背景・枠・タイトル色は
// ライト対応したが、サブ文字(#94a3b8)・二次ボタン（盤面を見る／ホームに戻る／この部屋を出る／パス）の
// 文字色(#e2e8f0=ほぼ白)・入力欄が dark 決め打ちのままで、ライトパネル上ではほぼ見えなかった。
// サブ文字・二次ボタン・入力欄の配色もライト/ダークで出し分ける。
function postGamePanelTokens() {
  const light =
    document.body.classList.contains("theme-light") || document.body.classList.contains("theme-light-ingame");
  return light
    ? {
        sub: "#475569",
        secBg: "rgba(15,23,42,0.06)",
        secBorder: "rgba(100,116,139,0.55)",
        secText: "#1e293b",
        infoBg: "rgba(56,189,248,0.16)",
        infoBorder: "rgba(2,132,199,0.65)",
        infoText: "#0c4a6e",
        fieldBg: "rgba(255,255,255,0.9)",
        fieldBorder: "rgba(100,116,139,0.5)",
        fieldText: "#1e293b",
      }
    : {
        sub: "#94a3b8",
        secBg: "rgba(255,255,255,0.08)",
        secBorder: "rgba(148,163,184,0.3)",
        secText: "#e2e8f0",
        infoBg: "rgba(56,189,248,0.18)",
        infoBorder: "rgba(56,189,248,0.6)",
        infoText: "#e2e8f0",
        fieldBg: "rgba(0,0,0,0.3)",
        fieldBorder: "rgba(148,163,184,0.3)",
        fieldText: "#e2e8f0",
      };
}

export function showCpuBattleEndPanel({ winnerSeat }) {
  if (panelEl) return; // 多重表示防止
  const iWon = winnerSeat === getSelfSeat();
  // #189: 変数名を t にすると翻訳関数 t を隠して "t is not a function" になる。
  const tone = postGamePanelTokens();

  backdropEl = createBackdrop(() => {}, { dim: true, zIndex: 10600 }); // 外側クリックでは閉じない
  panelEl = document.createElement("div");
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(24rem, 92vw); border-radius: 0.6rem;
    padding: 1.2rem; z-index: 10601; font-family: sans-serif; font-size: 0.85rem;
    ${postGamePanelSkinCss()}
  `;

  const title = document.createElement("div");
  title.style.cssText = "font-size: 1.15rem; font-weight: bold; text-align: center; margin-bottom: 0.2rem;";
  title.textContent = iWon ? t("postgamepanel.L390") : t("postgamepanel.L390_2");
  const sub = document.createElement("div");
  sub.style.cssText = `font-size: 0.75rem; color: ${tone.sub}; text-align: center; margin-bottom: 1rem;`;
  sub.textContent = t("postgamepanel.L393");
  panelEl.appendChild(title);
  panelEl.appendChild(sub);

  const row = document.createElement("div");
  row.style.cssText = "display: flex; gap: 0.6rem; flex-wrap: wrap; justify-content: center;";

  const rematchBtn = document.createElement("button");
  rematchBtn.type = "button";
  rematchBtn.textContent = t("postgamepanel.L402");
  rematchBtn.style.cssText =
    "padding: 0.5rem 1rem; background: #15803d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.85rem;";
  rematchBtn.addEventListener("click", async () => {
    // #88: CPU戦の「もう一度戦う」でも、押した瞬間に勝利BGMを止める（セットアップ完了を待たない）。
    stopVictoryBgm();
    rematchBtn.disabled = true;
    closePanel();
    try {
      // 動的import（cpu-battle.js は重い依存を芋づるで持つため。home-screen.js と同じパターン）。
      const { startCpuBattle, runCpuBattleSetup } = await import("./cpu-battle.js");
      await startCpuBattle(); // resetGame 込みで新しい対局を用意する
      setTimeout(() => {
        runCpuBattleSetup().catch((err) => console.error("runCpuBattleSetup failed", err));
      }, 60);
    } catch (err) {
      console.error("CPU rematch failed", err);
    }
  });

  const boardBtn = document.createElement("button");
  boardBtn.type = "button";
  boardBtn.textContent = t("postgamepanel.L424");
  boardBtn.style.cssText =
    `padding: 0.5rem 1rem; background: ${tone.infoBg}; border: 1px solid ${tone.infoBorder}; border-radius: 0.3rem; color: ${tone.infoText}; cursor: pointer; font-size: 0.85rem;`;
  boardBtn.addEventListener("click", () => {
    showMinimizeNoticeThenMinimize(); // 左上の🏆アイコンから復元できる（online版と共通）
  });

  const homeBtn = document.createElement("button");
  homeBtn.type = "button";
  homeBtn.textContent = t("postgamepanel.L433");
  homeBtn.style.cssText =
    `padding: 0.5rem 1rem; background: ${tone.secBg}; border: 1px solid ${tone.secBorder}; border-radius: 0.3rem; color: ${tone.secText}; cursor: pointer; font-size: 0.85rem;`;
  homeBtn.addEventListener("click", () => {
    setCpuBattleActive(false); // CPU戦フラグを下ろす（自動処理を止める）
    document.body.classList.remove("cpu-battle-mode");
    resetVictoryTrackingFn?.(); // 次にまた勝利演出が出るように勝利記録をクリア
    closePanel();
    openHomeScreen();
  });

  row.appendChild(rematchBtn);
  row.appendChild(boardBtn);
  row.appendChild(homeBtn);
  panelEl.appendChild(row);

  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
}

// #182: 「ランク結果モーダルの直後にすぐホームへ戻ってしまい、盤面を見られなかった」への対応。
// このパネルはランク結果などのモーダルが閉じた“直後”に出るため、直前のモーダルを消すための
// クリックの続き（連打・押しっぱなしの離し）が、出たばかりのボタン（特に「この部屋を出る」）に
// 吸われて意図せず退室してしまう余地がある。パネルが出てから少しの間はボタンを一切受け付けない。
// あわせて「パネル表示から何ms後に押されたか」を記録し、次に同じ報告が来た時に事故クリック
// なのか本人の操作なのかを切り分けられるようにする。
const POST_GAME_INPUT_GUARD_MS = 900;
let postGamePanelShownAt = 0;
function isPostGameInputGuarded() {
  return Date.now() - postGamePanelShownAt < POST_GAME_INPUT_GUARD_MS;
}
export function showPostGamePanel({ activePlayers, winnerSeat }) {
  // 戦績システムへの対戦登録はこのパネル（勝者のクライアント）から行うため、ここで
  // 早期returnすると「対戦したのに戦績に載らない」になる。原因の切り分けができるよう、
  // どの理由で出せなかったかを必ずアクションログへ残す（#183で実際に no-game-id ＝
  // 部屋から強制退出させられた後に呼ばれていた、というケースが判明した）。
  if (!isOnlineMode()) {
    logAction("diag-postgame-skip", { reason: "not-online", winnerSeat });
    return;
  }
  const gameId = getCurrentGameId();
  if (!gameId) {
    logAction("diag-postgame-skip", { reason: "no-game-id", winnerSeat });
    return;
  }
  if (panelEl) {
    logAction("diag-postgame-skip", { reason: "already-open", winnerSeat });
    return;
  }
  postGamePanelShownAt = Date.now(); // #182: 直後の誤クリック（前のモーダルのクリックの続き）よけ

  backdropEl = createBackdrop(() => {}, { dim: true, zIndex: 10600 });
  panelEl = document.createElement("div");
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(26rem, 92vw); border-radius: 0.6rem;
    padding: 1.2rem; z-index: 10601; font-family: sans-serif; font-size: 0.85rem;
    ${postGamePanelSkinCss()}
  `;

  const body = document.createElement("div");
  panelEl.appendChild(body);

  function showButtons() {
    body.innerHTML = "";
    // ユーザー要望「対戦終了モーダルは✕や外側クリックでは消せないように。消すには
    // 『この部屋を出る』か『もう一度遊ぶ』のみ」。✕ボタン(createModalCloseX)は付けない。
    // 背景クリックも元々no-op（createBackdropの第1引数が()=>{}）なので閉じない。
    // 『盤面を確認する』は“消す”のではなく最小化（左上🏆から復元可）なので従来どおり残す。
    body.appendChild(buildButtonsSection(gameId));
  }

  // ユーザー要望「対戦終了時、勝者だけでなく参加者全員がコメントできるように」（案①）。
  // 試合行(matches)を作るのは勝者のクライアントだけなので、作成された試合ID(matchId)を
  // 取得してから、各参加者が自分のコメントをその試合に紐づけて投稿する。
  const isWinner = getSelfSeat() === winnerSeat;
  // 試合IDは勝敗が決まった瞬間に確定している（victory.js→ensureStatsMatchRecorded）。
  // 自分で登録した／ブロードキャストで受け取った分がここで既に分かっていることが多い。
  let matchId = getRecordedStatsMatchId();

  // #45: 敗者のコメントは Realtime ブロードキャスト（試合ID受信）だけに頼ると取りこぼしで
  // 失われることがあった。勝者は matchId を確実に持っているので、敗者はコメントを勝者へも
  // 中継し、勝者が代理投稿する。あわせて敗者本人の直接投稿も試みる（返信IDが決定的なので
  // 二重投稿にはならない）。勝者側は受信したコメントを matchId 確定後に投稿する（バッファ）。
  const pendingLoserComments = [];
  async function flushPendingLoserComments() {
    if (!matchId) return;
    while (pendingLoserComments.length > 0) {
      const c = pendingLoserComments.shift();
      try {
        await submitMatchCommentForSeat(matchId, c.fromPlayer, c.comment);
      } catch (err) {
        console.error("submitMatchCommentForSeat failed", err);
      }
    }
  }
  if (isWinner) {
    unsubscribeMatchComment = onMatchCommentEvents((payload) => {
      if (!payload?.comment || payload.fromPlayer === getSelfSeat()) return;
      pendingLoserComments.push({ fromPlayer: payload.fromPlayer, comment: payload.comment });
      flushPendingLoserComments();
    });
  }

  if (isWinner) {
    // ユーザー要望「勝利時ランクアップした場合に何かモーダル出したい」。対戦前の対戦数を
    // 先に取得し、承認見込み（+1）で楽観的にランクアップ判定する（rank-up-modal.js参照）。
    const beforeRankProfilePromise = (async () => {
      try {
        const user = await getCurrentUser();
        if (!user) return null;
        return await fetchStatsProfile(user.id);
      } catch (err) {
        console.error("fetchStatsProfile (rank-up check) failed", err);
        return null;
      }
    })();
    // 勝者は試合を記録する（コメントはfeedbackへ入れず、下で全員と同じくreplyとして投稿）。
    // 戻り値の試合IDを保持し、他の参加者へはsubmitStatsMatchResult内でブロードキャストする。
    // 実際の登録は勝敗が決まった瞬間に victory.js から済んでいる（続き298）。ここでは
    // 確定済みの試合IDを受け取るだけ（万一まだなら、この呼び出しが登録を担う＝冪等）。
    ensureStatsMatchRecorded({ activePlayers, winnerSeat })
      .then((id) => {
        matchId = id || null;
        flushPendingLoserComments(); // 先に届いていた敗者コメントを投稿する（#45）
      })
      .catch((err) => console.error("ensureStatsMatchRecorded failed", err))
      .finally(async () => {
        try {
          const before = await beforeRankProfilePromise;
          if (before?.linked && before.tier.label !== t("postgamepanel.L563")) {
            const afterTier = getTierInfo(before.matchesCount + 1);
            if (afterTier.label !== before.tier.label) {
              showRankUpModal({ fromTier: before.tier, toTier: afterTier });
            }
          }
        } catch (err) {
          console.error("rank-up check failed", err);
        }
      });
  } else {
    // 敗者は、勝者が作成・ブロードキャストした試合IDを待ち受ける。
    unsubscribeMatchRecorded = onMatchRecordedEvents((payload) => {
      if (payload?.matchId) matchId = payload.matchId;
    });
  }

  // 全員にコメント欄を表示。送信時、試合IDがまだ届いていなければ少し待ってから投稿する。
  body.appendChild(
    buildCommentSection(async (comment) => {
      if (comment) {
        // ユーザー要望2026-08-28「対戦に参加したプレイヤーが各々コメントを残せるように」。
        // 以前は敗者のコメントを「勝者が作った試合IDが届くまで待って」投稿していたため、
        // 勝者の進み具合に引きずられて（届かなければ）捨てられることがあった。試合IDは
        // 勝敗確定の瞬間に確定するようになったので、勝者・敗者の区別なく全員が同じIDへ
        // 自分で投稿する。返信IDは（試合ID×プレイヤー）で決定的なので、後述の中継と
        // 重なっても二重投稿にはならない。
        if (!isWinner) {
          // ゲスト（戦績プレイヤーIDを持たない）は自分では試合を検索できないため、従来通り
          // 勝者への中継も残す（勝者が代理投稿する。#42/#45の保険）。
          broadcastMatchComment({ fromPlayer: getSelfSeat(), comment });
        }
        const id = matchId || (await resolveMatchIdForComment());
        if (id) {
          matchId = id;
          try {
            await submitMatchComment(id, comment);
          } catch (err) {
            console.error("submitMatchComment failed", err);
          }
        } else {
          logAction("diag-match-comment-no-id", { seat: getSelfSeat() });
        }
      }
      if (unsubscribeMatchRecorded) {
        unsubscribeMatchRecorded();
        unsubscribeMatchRecorded = null;
      }
      showButtons();
    })
  );

  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);

  // 新しい対局が実際に始まったこと（＝勝者のロック済み色数が7から減った）を検知したら、
  // 「もう一度遊ぶ」を押していない・待っている最中のプレイヤーも含め、全クライアントで
  // このパネルを自動的に閉じる。
  unsubscribeStateWatch = subscribe(() => {
    if ((getLockedCountFn?.(winnerSeat) ?? 7) < 7) {
      resetVictoryTrackingFn?.();
      closePanel();
    }
  });
}
