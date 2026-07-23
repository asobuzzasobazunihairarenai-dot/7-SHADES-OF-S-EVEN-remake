// ユーザー要望「ゲーム終了時に、戦績システムにコメントを記入する欄（パス可）→
// 戦績を確認してみるボタン→もう一度遊ぶボタン、という流れを追加したい」への対応。
// victory.jsのcheckForVictory()から、オンライン対戦の勝利直後に呼ばれる
// （showVictoryModal()とは別の、独立したパネル）。
//
// 勝者の画面だけ、コメント欄（記入 or パス）を経てから対戦記録を戦績システムへ
// 登録する（submitStatsMatchResult()自体はここから呼ぶよう変更した——victory.js側は
// もう呼ばない）。勝者以外の画面は、コメント欄を出さずに直接ボタン列を表示する
// （実際にmatches.feedbackへ書き込むのは勝者の入力内容だけのため）。
//
// 「もう一度遊ぶ」は、まだこの部屋にいる全員が押すか部屋を抜けるまで待つ
// （online.jsのsetRematchReady/maybeTriggerRematch参照）。実際に新しい対局が
// 始まったこと（＝勝者のロック済み色数が7から減った）を全クライアントが検知したら、
// このパネルは自動で閉じる。

import { subscribe } from "./state.js";
import { isOnlineMode, getSelfSeat, getCurrentGameId, submitStatsMatchResult, setRematchReady, maybeTriggerRematch } from "./online.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

// victory.jsはこのモジュール（showPostGamePanel）を呼ぶ側になる予定のため、ここから
// victory.jsを直接importすると循環importになる。他の箇所（setup-animation.js等）と
// 同じ「main.jsから注入してもらう」パターンで回避する。
let getLockedCountFn = null;
let resetVictoryTrackingFn = null;
export function registerVictoryHelpers({ getLockedCount, resetVictoryTracking }) {
  getLockedCountFn = getLockedCount;
  resetVictoryTrackingFn = resetVictoryTracking;
}

// TODO: 戦績管理システムの実際のURLをここに設定してください。空のままだと
// 「戦績を確認してみる」ボタンは押せない状態で表示されます。
const STATS_SITE_URL = "";

let panelEl = null;
let backdropEl = null;
let pollTimerId = null;
let unsubscribeStateWatch = null;

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
  backdropEl?.remove();
  panelEl?.remove();
  backdropEl = null;
  panelEl = null;
}

function buildButtonsSection(gameId) {
  const col = document.createElement("div");

  const row = document.createElement("div");
  row.style.cssText = "display: flex; gap: 0.6rem; flex-wrap: wrap;";

  const statsBtn = document.createElement("button");
  statsBtn.type = "button";
  statsBtn.textContent = "戦績を確認してみる";
  statsBtn.disabled = !STATS_SITE_URL;
  if (!STATS_SITE_URL) statsBtn.title = "戦績サイトのURLが未設定です";
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
  rematchBtn.textContent = "もう一度遊ぶ";
  rematchBtn.style.cssText = `
    padding: 0.5rem 1rem; background: #15803d; border: none; border-radius: 0.3rem;
    color: white; cursor: pointer; font-size: 0.85rem;
  `;

  const waitingLabel = document.createElement("div");
  waitingLabel.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; display: none;";
  waitingLabel.textContent = "他の参加者を待っています…（誰かが部屋を抜けたらその人数で再開します）";

  rematchBtn.addEventListener("click", async () => {
    rematchBtn.disabled = true;
    rematchBtn.textContent = "待機中…";
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

  row.appendChild(statsBtn);
  row.appendChild(rematchBtn);
  col.appendChild(row);
  col.appendChild(waitingLabel);
  return col;
}

function buildCommentSection(activePlayers, winnerSeat, onDone) {
  const wrap = document.createElement("div");

  const label = document.createElement("div");
  label.textContent = "戦績システムにゲームのコメントを記入する（任意・パスできます）";
  label.style.cssText = "font-size: 0.85rem; margin-bottom: 0.5rem; line-height: 1.5;";
  wrap.appendChild(label);

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "感想やハイライトなど（空欄でもOK）";
  textarea.style.cssText = `
    width: 100%; box-sizing: border-box; padding: 0.5rem; background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 0.3rem; color: #e2e8f0;
    font-size: 0.85rem; resize: vertical; font-family: sans-serif;
  `;
  wrap.appendChild(textarea);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 0.5rem; margin-top: 0.6rem;";

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.textContent = "登録する";
  submitBtn.style.cssText = `
    padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem;
    color: white; cursor: pointer; font-size: 0.85rem;
  `;

  const passBtn = document.createElement("button");
  passBtn.type = "button";
  passBtn.textContent = "パス";
  passBtn.style.cssText = `
    padding: 0.4rem 0.9rem; background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 0.3rem;
    color: #e2e8f0; cursor: pointer; font-size: 0.85rem;
  `;

  let done = false;
  function finish(feedback) {
    if (done) return;
    done = true;
    submitBtn.disabled = true;
    passBtn.disabled = true;
    submitBtn.textContent = "登録中…";
    onDone(feedback);
  }
  submitBtn.addEventListener("click", () => finish(textarea.value.trim()));
  passBtn.addEventListener("click", () => finish(""));

  btnRow.appendChild(submitBtn);
  btnRow.appendChild(passBtn);
  wrap.appendChild(btnRow);
  return wrap;
}

export function showPostGamePanel({ activePlayers, winnerSeat }) {
  if (!isOnlineMode()) return;
  const gameId = getCurrentGameId();
  if (!gameId) return;
  if (panelEl) return; // 既に開いている（多重表示防止）

  backdropEl = createBackdrop(() => {}, { dim: true, zIndex: 10600 });
  panelEl = document.createElement("div");
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(26rem, 92vw); background: rgba(15, 23, 32, 0.98);
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.6rem;
    padding: 1.2rem; z-index: 10601; font-family: sans-serif; font-size: 0.85rem;
    color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;

  const body = document.createElement("div");
  panelEl.appendChild(body);

  function showButtons() {
    body.innerHTML = "";
    panelEl.appendChild(createModalCloseX(closePanel));
    body.appendChild(buildButtonsSection(gameId));
  }

  if (getSelfSeat() === winnerSeat) {
    body.appendChild(
      buildCommentSection(activePlayers, winnerSeat, (feedback) => {
        submitStatsMatchResult({ activePlayers, winnerSeat, feedback })
          .catch((err) => console.error("submitStatsMatchResult failed", err))
          .finally(showButtons);
      })
    );
  } else {
    showButtons();
  }

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
