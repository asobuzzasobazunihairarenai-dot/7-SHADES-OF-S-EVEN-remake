// フェイズ自動進行（試作）。ユーザー要望「効果自動処理がオンの時はフェイズも自動で
// 流れるようにしよう」への対応。docs/rulebook.mdの3フェイズ構造
// （ロックフェイズ→ハンドフェイズ→ムーブフェイズ→ターン終了）に沿って、
// 「今どのフェイズか」を持ち、各フェイズで実際に何かが起きた（ロックした/手札効果を
// 使い切った/移動できるものが無くなった）ことを検知して次のフェイズへ自動で進める。
//
// card-effect-engine.js（カード効果DSLの実行）と同じ立ち位置: isAutoProcessingEnabled()が
// ONの間だけ、かつ「自分の手番」の間だけ動く（他プレイヤーの画面・OFF時は完全に無関係、
// 従来の自己管理プレイを一切妨げない）。フェイズ状態自体もセッション限りで、アカウントには
// 保存しない。
//
// main.js側の状態変更関数（render・findTopCardAt等）は、他のモジュールと同じ
// 「register helper」注入パターンで main.js から渡してもらう（循環import回避）。

import { getState, isOnlineMode, drawFromPile, flipToken, nextTurn } from "./state.js";
import { getSelfSeat, getCurrentGameId, fetchAndHydrate } from "./online.js";
import { markSelfHandled } from "./self-handled-tokens.js";
import { isAutoProcessingEnabled, getMoveCandidates, hasUsableHandEffect } from "./card-effect-engine.js";
import { runGateInvasionsIfNeeded } from "./gate-invasion.js";
import { playSound } from "./sound.js";
import { announceHandPickups } from "./hand-announcer.js";
import { SIDE_TO_SEAT } from "./board-layout.js";

let renderHelper = null;
let findTopCardAtHelper = null;
export function registerPhaseAutomationHelpers({ render, findTopCardAt }) {
  renderHelper = render;
  findTopCardAtHelper = findTopCardAt;
}

export const PHASES = ["lock", "hand", "move"];
const PHASE_LABEL = { lock: "LOCK", hand: "HAND", move: "MOVE" };
const PHASE_KATAKANA = { lock: "ロック", hand: "ハンド", move: "ムーブ" };

let currentPhase = null; // null | "lock" | "hand" | "move"
let lockCountAtPhaseStart = 0;
let performingFallback = false; // ムーブフェイズの自動処理（カード設置＋ターン終了）の二重発火防止
let handEffectBusy = false; // 手札効果の解決中（コスト選択待ち等）はフェイズを進めない

export function getCurrentPhase() {
  return currentPhase;
}
export function isHandPhaseActive() {
  return currentPhase === "hand";
}
// main.jsの手札効果トリガー（Task 5）が、コスト選択等で待っている間はフェイズの
// 自動進行を一時止める（選んでいる最中にハンドフェイズが終わってしまうのを防ぐ）。
export function setHandEffectBusy(v) {
  handEffectBusy = !!v;
}

const DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];
function inBounds(row, col) {
  return row >= 0 && row <= 6 && col >= 0 && col <= 6;
}
function hasCardAt(row, col) {
  return getState().tokens.some((t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
}
function hasPieceAt(row, col) {
  return getState().tokens.some((t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
}

function getSelfPiece(player) {
  return getState().tokens.find((t) => t.kind === "piece" && t.player === player);
}

function countLockedCards(player) {
  return getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && SIDE_TO_SEAT[t.location.side] === player).length;
}

// ムーブフェイズ用: 隣接4マスのうち「相手の駒がいるマス」（接触可能）。
function getContactableCells(pieceLocation, player) {
  const results = [];
  for (const { dr, dc } of DIRECTIONS) {
    const row = pieceLocation.row + dr;
    const col = pieceLocation.col + dc;
    if (!inBounds(row, col)) continue;
    const piece = getState().tokens.find(
      (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col
    );
    if (piece && piece.player && piece.player !== player) results.push({ zone: "cell", row, col });
  }
  return results;
}

// ルール補足「隣に『カード』も『相手の駒』も無い場合：隣の任意の1マスへ山札から1枚
// 表向きに置いてターンを終了します」用の「本当に何も無い」隣接空マス。
function getAdjacentEmptyCells(pieceLocation) {
  const results = [];
  for (const { dr, dc } of DIRECTIONS) {
    const row = pieceLocation.row + dr;
    const col = pieceLocation.col + dc;
    if (!inBounds(row, col)) continue;
    if (hasCardAt(row, col) || hasPieceAt(row, col)) continue;
    results.push({ zone: "cell", row, col });
  }
  return results;
}

// --- UI: 中央の一時的なフェイズ案内トースト（turn-announce.jsと同じ「一瞬待って表示→
// 数秒後にフェードアウト」パターン） --------------------------------------------------
const PHASE_DESCRIPTION = {
  lock: "1枚ロックできます",
  hand: "何枚でも使えます",
  move: "移動か接触ができます",
};
function announcePhase(phase) {
  playSound("turnSwitch");
  const el = document.createElement("div");
  el.className = "phase-announce-toast";
  const titleEl = document.createElement("div");
  titleEl.className = "phase-announce-title";
  titleEl.innerHTML = `${PHASE_LABEL[phase]}<span class="phase-announce-ruby">${PHASE_KATAKANA[phase]}</span>フェイズ`;
  const descEl = document.createElement("div");
  descEl.className = "phase-announce-desc";
  descEl.textContent = PHASE_DESCRIPTION[phase];
  el.appendChild(titleEl);
  el.appendChild(descEl);
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 500);
  }, 2600);
}

// --- UI: フェイズ案内板（phase-guide.js）のボタンを、今のフェイズだけ光らせる ---------
function updatePhaseGuideGlow() {
  for (const p of PHASES) {
    const btn = document.getElementById(`phase-guide-${p}-button`);
    if (btn) btn.classList.toggle("is-current-phase", p === currentPhase);
  }
}

// --- UI: 常設のスキップボタン（フェイズ案内板の近くに表示） ---------------------------
let skipButtonEl = null;
function ensureSkipButton() {
  if (skipButtonEl) return skipButtonEl;
  skipButtonEl = document.createElement("button");
  skipButtonEl.type = "button";
  skipButtonEl.id = "phase-automation-skip-button";
  skipButtonEl.textContent = "スキップ";
  skipButtonEl.addEventListener("click", () => {
    if (handEffectBusy) return;
    advancePhase();
  });
  document.body.appendChild(skipButtonEl);
  return skipButtonEl;
}
function updateSkipButtonVisibility() {
  const btn = ensureSkipButton();
  // ムーブフェイズは「移動」か「接触」のどちらかを必ず行う必要があり、任意にスキップできる
  // 性質のものではない（docs/rulebook.md）。スキップボタンはロック・ハンドフェイズだけに出す。
  btn.style.display = currentPhase === "lock" || currentPhase === "hand" ? "block" : "none";
}

// --- フェイズの開始・進行 ---------------------------------------------------------------
function enterPhase(phase, player) {
  currentPhase = phase;
  if (phase === "lock") lockCountAtPhaseStart = countLockedCards(player);
  announcePhase(phase);
  updatePhaseGuideGlow();
  updateSkipButtonVisibility();
  if (phase === "move") reconcileMovePhase(player);
}

function advancePhase() {
  const idx = PHASES.indexOf(currentPhase);
  if (idx === -1 || idx === PHASES.length - 1) return;
  enterPhase(PHASES[idx + 1], getSelfSeat());
}

function clearPhase() {
  if (currentPhase === null) return;
  currentPhase = null;
  updatePhaseGuideGlow();
  updateSkipButtonVisibility();
  clearMovableHighlights();
}

// render()のたびに呼ばれ、今のフェイズで「もう次へ進めるか」を判定する。
// カード効果自動処理と同じ「呼び出し元(main.js)がrender()の末尾で毎回呼ぶ」設計
// （remote-move-animator.jsのreapplyActiveHighlights等と同じ考え方）。
export function reconcilePhaseAutomation() {
  const player = getSelfSeat();
  const shouldBeActive = isAutoProcessingEnabled() && getState().turnPlayer === player;
  if (!shouldBeActive) {
    clearPhase();
    return;
  }
  if (currentPhase === null) {
    enterPhase("lock", player);
    return;
  }
  if (currentPhase === "lock") {
    if (countLockedCards(player) > lockCountAtPhaseStart) advancePhase();
    return;
  }
  if (currentPhase === "hand") {
    if (!handEffectBusy && !hasUsableHandEffect(player)) advancePhase();
    return;
  }
  if (currentPhase === "move") {
    reconcileMovePhase(player);
  }
}

// --- ムーブフェイズ: 移動・接触できるマスをハイライトし、両方無ければ自動でルール上の
// 救済（隣の空マスへ山札から1枚表向きに置いてターン終了）を行う。 -----------------------
let highlightedMoveCellEls = [];
function clearMovableHighlights() {
  for (const el of highlightedMoveCellEls) el.classList.remove("phase-move-highlight", "phase-contact-highlight");
  highlightedMoveCellEls = [];
}

function reconcileMovePhase(player) {
  if (performingFallback) return;
  const piece = getSelfPiece(player);
  if (!piece || piece.location.zone !== "cell") return;
  const moveCandidates = getMoveCandidates(piece.location, 1, false);
  const contactCandidates = getContactableCells(piece.location, player);
  clearMovableHighlights();
  const table = document.getElementById("game-table");
  if (table) {
    for (const loc of moveCandidates) {
      const el = table.querySelector(`.cell[data-row="${loc.row}"][data-col="${loc.col}"]`);
      if (el) {
        el.classList.add("phase-move-highlight");
        highlightedMoveCellEls.push(el);
      }
    }
    for (const loc of contactCandidates) {
      const el = table.querySelector(`.cell[data-row="${loc.row}"][data-col="${loc.col}"]`);
      if (el) {
        el.classList.add("phase-contact-highlight");
        highlightedMoveCellEls.push(el);
      }
    }
  }
  if (moveCandidates.length === 0 && contactCandidates.length === 0) {
    const emptyCells = getAdjacentEmptyCells(piece.location);
    if (emptyCells.length > 0) performMoveFallbackAndEndTurn(player, emptyCells[0]);
  }
}

async function performMoveFallbackAndEndTurn(player, location) {
  performingFallback = true;
  try {
    if (isOnlineMode()) {
      try {
        await drawFromPile("deck", location);
        await fetchAndHydrate(getCurrentGameId());
        const token = findTopCardAtHelper?.(location);
        if (token) {
          await flipToken(token.id);
          markSelfHandled([token.id]);
          await fetchAndHydrate(getCurrentGameId());
          announceHandPickups(player, [{ cardId: token.cardId, wasPublic: true }]);
        }
      } catch (err) {
        console.error("performMoveFallbackAndEndTurn failed", err);
        renderHelper?.();
        return;
      }
    } else {
      const pileArray = getState().piles.deck;
      const cardId = pileArray.length > 0 ? pileArray[pileArray.length - 1] : null;
      drawFromPile("deck", location);
      const token = findTopCardAtHelper?.(location);
      if (token) {
        flipToken(token.id);
        if (cardId) announceHandPickups(player, [{ cardId, wasPublic: true }]);
      }
    }
    playSound("cardPlace");
    renderHelper?.();
    if (isOnlineMode()) {
      nextTurn();
    } else {
      runGateInvasionsIfNeeded(() => {
        nextTurn();
        renderHelper?.();
      });
    }
  } finally {
    performingFallback = false;
    clearPhase();
  }
}
