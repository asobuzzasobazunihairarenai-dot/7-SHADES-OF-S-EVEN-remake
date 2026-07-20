// ターンタイマー（ロープ・砂時計・優先権）。MTGAのイメージで、優先権を持ってから次に
// 何かする（フェイズを進める/カードを使う/ターンを終了する等）までを「1回の行動」とし、
// 約30秒（管理者モードで調整可）経過すると画面にロープ（燃え尽きる導火線）が表示される。
// 燃え尽きる前に行動しないと、ストックしている砂時計を1個消費してさらに延長する。
//
// このゲーム全体の「座席を持っていれば何でも自由に操作できる、強制力の無い自己申告制」
// という設計方針に合わせ、砂時計も尽きた場合でも自動でターンを終了させたりはしない。
// 代わりに「ムーブフェイズを終えてターンを終了してください」という警告を点滅表示するだけに
// 留める（ユーザー判断で「自動でターン終了ボタンを押す」案を撤回した経緯あり）。
//
// 実質的にオンライン対戦向けの機能（ローカルモードは1人で全座席を操作するため緊張感が
// 無い）のため、管理者モードのマスタースイッチ（デフォルトOFF）で完全にオフにできる。
// 今回はローカルモードのみの実装で、オンライン同期は次回以降のラウンドに回す。

import { getState, subscribe, setPriority, setHourglassStock } from "./state.js";
import { SEAT_ORDER } from "./board-layout.js";
import { getSelfSeat } from "./online.js";
import { getPlayerName } from "./player-identity.js";
import {
  isTurnTimerEnabled,
  getInitialHourglassStock,
  getMaxHourglassStock,
  getRopeBaseSeconds,
  getRopeExtensionSeconds,
  getTurnsToReplenishHourglass,
} from "./admin.js";

let hudEl = null;
let transferButtonsEl = null;
let warningEl = null;
let seatCardRefs = {}; // seat -> { card, stockEl, ropeFill }

// 「砂時計を使わずに何ターン経過したか」は見た目に影響しない内部カウンタのため、共有
// state.jsには持たせず、このモジュールのローカル変数だけで追跡する。
let prevTurnPlayer = null;
let hourglassUsedThisTurn = {};
let turnsWithoutHourglass = {};

// 自分自身が発行したdispatch（setPriority/setHourglassStock）による通知で、
// onStateChangeが無限に再入しないようにする再入防止フラグ（remote-move-animator.jsの
// skipNextHydrateDiffと同じ考え方）。
let applyingOwnUpdate = false;
function withGuard(fn) {
  applyingOwnUpdate = true;
  try {
    fn();
  } finally {
    applyingOwnUpdate = false;
  }
}

function freshDeadline() {
  return Date.now() + getRopeBaseSeconds() * 1000;
}

// ターンプレイヤーの交代（ゲーム開始時のnull→非nullも含む）を検知した時の処理。
function handleTurnTransition(prevPlayer, nextPlayer, activePlayers) {
  if (prevPlayer === null && nextPlayer !== null) {
    // ゲーム開始。参加座席全員の砂時計を初期値にし、優先権をスタートプレイヤーへ渡す。
    for (const seat of activePlayers) {
      hourglassUsedThisTurn[seat] = false;
      turnsWithoutHourglass[seat] = 0;
      withGuard(() => setHourglassStock(seat, getInitialHourglassStock()));
    }
    withGuard(() => setPriority(nextPlayer, freshDeadline()));
    return;
  }
  if (prevPlayer !== null && nextPlayer !== null && prevPlayer !== nextPlayer) {
    // 通常のターン交代。離れる座席が「そのターン中に一度も砂時計を使わなかったか」を
    // 評価し、3ターン（管理者モードで調整可）連続なら砂時計を1個補充する。
    if (!hourglassUsedThisTurn[prevPlayer]) {
      turnsWithoutHourglass[prevPlayer] = (turnsWithoutHourglass[prevPlayer] ?? 0) + 1;
      if (turnsWithoutHourglass[prevPlayer] >= getTurnsToReplenishHourglass()) {
        turnsWithoutHourglass[prevPlayer] = 0;
        const current = getState().hourglassStock[prevPlayer] ?? 0;
        const next = Math.min(getMaxHourglassStock(), current + 1);
        if (next !== current) withGuard(() => setHourglassStock(prevPlayer, next));
      }
    } else {
      turnsWithoutHourglass[prevPlayer] = 0;
    }
    hourglassUsedThisTurn[nextPlayer] = false;
    withGuard(() => setPriority(nextPlayer, freshDeadline()));
  }
}

function onStateChange(state) {
  if (applyingOwnUpdate) return;
  if (!isTurnTimerEnabled()) return;
  const tp = state.turnPlayer;
  if (tp !== prevTurnPlayer) {
    handleTurnTransition(prevTurnPlayer, tp, state.activePlayers);
    prevTurnPlayer = tp;
    rebuildHud();
    return;
  }
  // ターン交代以外の理由で状態が変化した＝優先権を持つ座席が何か行動したとみなし、
  // ロープをリセットする（「1回の行動」＝優先権を持ってから次に何かするまで、という定義）。
  if (state.priorityPlayer) {
    withGuard(() => setPriority(state.priorityPlayer, freshDeadline()));
  }
}

// --- HUD（座席カード：名前・砂時計・ロープ）--------------------------------------------

function buildHud() {
  hudEl = document.createElement("div");
  hudEl.id = "turn-timer-hud";
  hudEl.style.display = "none";
  document.body.appendChild(hudEl);
}

function rebuildHud() {
  if (!hudEl) return;
  hudEl.innerHTML = "";
  seatCardRefs = {};
  const state = getState();
  if (!isTurnTimerEnabled() || !state.turnPlayer) {
    hudEl.style.display = "none";
    return;
  }
  hudEl.style.display = "flex";
  for (const seat of SEAT_ORDER.filter((s) => state.activePlayers.includes(s))) {
    const card = document.createElement("div");
    card.className = "turn-timer-seat-card";

    const nameEl = document.createElement("div");
    nameEl.className = "turn-timer-seat-name";
    nameEl.textContent = getPlayerName(seat);
    card.appendChild(nameEl);

    const stockEl = document.createElement("div");
    stockEl.className = "turn-timer-seat-stock";
    card.appendChild(stockEl);

    const ropeTrack = document.createElement("div");
    ropeTrack.className = "turn-timer-rope-track";
    const ropeFill = document.createElement("div");
    ropeFill.className = "turn-timer-rope-fill";
    ropeTrack.appendChild(ropeFill);
    card.appendChild(ropeTrack);

    hudEl.appendChild(card);
    seatCardRefs[seat] = { card, stockEl, ropeFill };
  }
  updateHudValues();
}

// tick()から高頻度に呼ばれる、DOM更新だけを行う軽量な部分（stateへのdispatchは行わない）。
function updateHudValues() {
  const state = getState();
  const now = Date.now();
  for (const [seat, refs] of Object.entries(seatCardRefs)) {
    const stock = state.hourglassStock[seat] ?? 0;
    refs.stockEl.textContent = `⏳ × ${stock}`;
    const isPriorityHolder = state.priorityPlayer === seat;
    refs.card.classList.toggle("is-priority-holder", isPriorityHolder);
    if (isPriorityHolder && state.priorityDeadline) {
      const remaining = state.priorityDeadline - now;
      const totalMs = getRopeBaseSeconds() * 1000;
      const ratio = Math.max(0, Math.min(1, remaining / totalMs));
      refs.ropeFill.style.transform = `scaleX(${ratio})`;
      refs.card.classList.toggle("is-timed-out", remaining <= 0);
    } else {
      refs.card.classList.remove("is-timed-out");
    }
  }
}

// --- #end-turn-buttonのそばに出す警告バッジ ---------------------------------------------

function buildWarning() {
  warningEl = document.createElement("div");
  warningEl.className = "turn-timer-warning";
  warningEl.textContent = "ムーブフェイズを終えてターンを終了してください";
  warningEl.style.display = "none";
  document.body.appendChild(warningEl);
}

function updateWarning(shouldShow) {
  if (!warningEl) return;
  if (!shouldShow) {
    warningEl.style.display = "none";
    return;
  }
  const endTurnBtn = document.getElementById("end-turn-button");
  if (!endTurnBtn || getComputedStyle(endTurnBtn).display === "none") {
    warningEl.style.display = "none";
    return;
  }
  const rect = endTurnBtn.getBoundingClientRect();
  warningEl.style.left = `${rect.left}px`;
  warningEl.style.top = `${rect.top - 2.4 * 16}px`; // ボタンの少し上（2.4rem相当）
  warningEl.style.display = "block";
}

// --- 優先権譲渡ボタン（三角形配置） -----------------------------------------------------

function buildTransferButtons() {
  transferButtonsEl = document.createElement("div");
  transferButtonsEl.id = "priority-transfer-buttons";
  transferButtonsEl.style.display = "none";
  document.body.appendChild(transferButtonsEl);
}

function rebuildTransferButtons() {
  if (!transferButtonsEl) return;
  transferButtonsEl.innerHTML = "";
  const state = getState();
  if (!isTurnTimerEnabled() || !state.turnPlayer) {
    transferButtonsEl.style.display = "none";
    return;
  }
  const selfSeat = getSelfSeat();
  const others = SEAT_ORDER.filter((s) => state.activePlayers.includes(s) && s !== selfSeat);
  if (others.length === 0) {
    transferButtonsEl.style.display = "none";
    return;
  }
  transferButtonsEl.style.display = "grid";
  for (const seat of others) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "priority-transfer-btn";
    btn.textContent = getPlayerName(seat).slice(0, 2);
    btn.title = `${getPlayerName(seat)}に優先権を渡す`;
    btn.addEventListener("click", () => setPriority(seat, freshDeadline()));
    transferButtonsEl.appendChild(btn);
  }
}

// --- ティック（描画のみ。stateへのdispatchはタイムアウト時の砂時計自動消費のみ） -----------

function tick() {
  if (!isTurnTimerEnabled()) return;
  const state = getState();
  if (!state.turnPlayer || !state.priorityPlayer || !state.priorityDeadline) {
    updateWarning(false);
    return;
  }
  updateHudValues();

  const remaining = state.priorityDeadline - Date.now();
  if (remaining > 0) {
    updateWarning(false);
    return;
  }

  // ロープが燃え尽きた。ストックがあれば自動で消費して延長する（これは元の仕様通り
  // 自動で行う）。無ければ、強制力を持たせずあくまで警告表示だけに留める。
  const stock = state.hourglassStock[state.priorityPlayer] ?? 0;
  if (stock > 0) {
    hourglassUsedThisTurn[state.priorityPlayer] = true;
    withGuard(() => {
      setHourglassStock(state.priorityPlayer, stock - 1);
      setPriority(state.priorityPlayer, Date.now() + getRopeExtensionSeconds() * 1000);
    });
    updateWarning(false);
    return;
  }

  updateWarning(state.priorityPlayer === state.turnPlayer);
}

// 管理者モードのマスタースイッチを試合の途中でONにした場合、prevTurnPlayerの追跡は
// （オフの間はonStateChangeが最初にreturnしていたため）ここまで一度も更新されておらず、
// 次のターン交代まで初期化（砂時計の初期値セット・優先権の設定）が起きない。ONにした
// 瞬間から使えるよう、「turnPlayerは既にあるのにpriorityPlayerがまだ無い」状態を検知して
// その場で初期化する。
function ensureInitializedIfNeeded() {
  const state = getState();
  if (!isTurnTimerEnabled() || !state.turnPlayer || state.priorityPlayer) return;
  handleTurnTransition(null, state.turnPlayer, state.activePlayers);
  prevTurnPlayer = state.turnPlayer;
}

export function initTurnTimer() {
  buildHud();
  buildWarning();
  buildTransferButtons();
  subscribe((state) => {
    onStateChange(state);
    rebuildTransferButtons();
  });
  window.addEventListener("admin:change", () => {
    ensureInitializedIfNeeded();
    rebuildHud();
    rebuildTransferButtons();
  });
  setInterval(tick, 200);
}
