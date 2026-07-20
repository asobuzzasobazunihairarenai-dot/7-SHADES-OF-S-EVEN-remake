// ターンタイマー（ロープ・砂時計・優先権）。MTGAのイメージで、優先権を持ってから次に
// 何かする（フェイズを進める/カードを使う/ターンを終了する等）までを「1回の行動」とし、
// 基本時間（管理者モードで調整可、デフォルト30秒）は完全に無音・無表示で与えられる
// （ロープは出現しない）。基本時間が切れると、そこで初めてストックしている砂時計を1個
// 「仮消費」し、画面中央に神秘的なオーラのロープが出現して延長時間分だけ燃え尽きていく。
// 行動を取れば（＝ロープリセット）その仮消費は無かったことになり砂時計は満額のまま持ち越
// せる。延長時間も使い切って燃え尽きた場合だけ、砂時計が正式に1個減る（さらに残りがあれば
// 連続してもう1本ロープが燃える）。
//
// このゲーム全体の「座席を持っていれば何でも自由に操作できる、強制力の無い自己申告制」
// という設計方針に合わせ、砂時計も尽きた場合でも自動でターンを終了させたりはしない。
// 代わりに「ムーブフェイズを終えてターンを終了してください」という警告を点滅表示するだけに
// 留める。
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

let selfStockEl = null; // 左下の自分専用ステータスエリアに出す、自分の砂時計個数バッジ
let ropeEl = null; // 画面中央のロープ本体（延長中だけ表示）
let ropeStrandEl = null;
let ropeTipEl = null;
let ropeHourglassCountEl = null;
let warningEl = null;
let transferButtonsEl = null;

let prevTurnPlayer = null;
// 「砂時計を使わずに何ターン経過したか」は見た目に影響しない内部カウンタのため、共有
// state.jsには持たせず、このモジュールのローカル変数だけで追跡する。
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

function freshBaseDeadline() {
  return Date.now() + getRopeBaseSeconds() * 1000;
}

// ターンプレイヤーの交代（ゲーム開始時のnull→非nullも含む）を検知した時の処理。
function handleTurnTransition(prevPlayer, nextPlayer, activePlayers) {
  if (prevPlayer === null && nextPlayer !== null) {
    // ゲーム開始。参加座席全員の砂時計を初期値にし、優先権をスタートプレイヤーへ渡す
    // （基本時間から開始、ロープは非表示）。
    for (const seat of activePlayers) {
      hourglassUsedThisTurn[seat] = false;
      turnsWithoutHourglass[seat] = 0;
      withGuard(() => setHourglassStock(seat, getInitialHourglassStock()));
    }
    withGuard(() => setPriority(nextPlayer, freshBaseDeadline(), "base"));
    return;
  }
  if (prevPlayer !== null && nextPlayer !== null && prevPlayer !== nextPlayer) {
    // 通常のターン交代。離れる座席が「そのターン中に一度も砂時計を正式に消費しなかったか」
    // を評価し、3ターン（管理者モードで調整可）連続なら砂時計を1個補充する。
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
    withGuard(() => setPriority(nextPlayer, freshBaseDeadline(), "base"));
  }
}

function onStateChange(state) {
  if (applyingOwnUpdate) return;
  if (!isTurnTimerEnabled()) return;
  const tp = state.turnPlayer;
  if (tp !== prevTurnPlayer) {
    handleTurnTransition(prevTurnPlayer, tp, state.activePlayers);
    prevTurnPlayer = tp;
    return;
  }
  // ターン交代以外の理由で状態が変化した＝優先権を持つ座席が何か行動したとみなし、
  // 基本時間の窓へリセットする（延長中に行動した場合、仮消費していた砂時計は
  // 「ロープが完全に無くならなければ持ち越せる」仕様通り、何も減らさずそのまま戻る）。
  if (state.priorityPlayer) {
    withGuard(() => setPriority(state.priorityPlayer, freshBaseDeadline(), "base"));
  }
}

// --- 自分専用の砂時計バッジ（左下ステータスエリア） -------------------------------------

function buildSelfStock() {
  const host = document.getElementById("self-hand-status");
  if (!host) return;
  selfStockEl = document.createElement("div");
  selfStockEl.className = "turn-timer-self-stock";
  selfStockEl.style.display = "none";
  host.appendChild(selfStockEl);
}

function updateSelfStock(state) {
  if (!selfStockEl) return;
  if (!isTurnTimerEnabled() || !state.turnPlayer) {
    selfStockEl.style.display = "none";
    return;
  }
  const stock = state.hourglassStock[getSelfSeat()] ?? 0;
  selfStockEl.textContent = `⏳ × ${stock}`;
  selfStockEl.style.display = "block";
}

// --- 画面中央のロープ（延長中だけ表示、全プレイヤーに見える） ---------------------------

function buildRope() {
  ropeEl = document.createElement("div");
  ropeEl.id = "turn-timer-rope";
  ropeEl.style.display = "none";

  const track = document.createElement("div");
  track.className = "turn-timer-rope-track";

  ropeStrandEl = document.createElement("div");
  ropeStrandEl.className = "turn-timer-rope-strand";
  track.appendChild(ropeStrandEl);

  ropeTipEl = document.createElement("div");
  ropeTipEl.className = "turn-timer-rope-tip";
  const spark = document.createElement("div");
  spark.className = "turn-timer-rope-spark";
  const hourglass = document.createElement("div");
  hourglass.className = "turn-timer-rope-hourglass";
  hourglass.textContent = "⏳";
  ropeHourglassCountEl = document.createElement("span");
  ropeHourglassCountEl.className = "turn-timer-rope-hourglass-count";
  hourglass.appendChild(ropeHourglassCountEl);
  ropeTipEl.appendChild(spark);
  ropeTipEl.appendChild(hourglass);
  track.appendChild(ropeTipEl);

  const nameEl = document.createElement("div");
  nameEl.className = "turn-timer-rope-name";
  track.appendChild(nameEl);
  ropeEl.appendChild(track);
  ropeEl._nameEl = nameEl;

  document.body.appendChild(ropeEl);
}

function getPieceColor(seat) {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === seat);
  return piece ? piece.color : null;
}

// tick()から高頻度に呼ばれる、DOM更新だけを行う軽量な部分（stateへのdispatchは行わない）。
function updateRope(state) {
  const inExtension =
    isTurnTimerEnabled() && state.turnPlayer && state.priorityPlayer && state.priorityPhase === "extension";
  if (!inExtension) {
    if (ropeEl) ropeEl.style.display = "none";
    return;
  }
  ropeEl.style.display = "block";
  const totalMs = getRopeExtensionSeconds() * 1000;
  const remaining = state.priorityDeadline - Date.now();
  const ratio = Math.max(0, Math.min(1, remaining / totalMs));
  ropeStrandEl.style.width = `${ratio * 100}%`;
  ropeTipEl.style.left = `${ratio * 100}%`;
  const color = getPieceColor(state.priorityPlayer);
  ropeEl.style.setProperty("--turn-timer-rope-color", color ? `var(--color-${color})` : "#eab308");
  ropeHourglassCountEl.textContent = state.hourglassStock[state.priorityPlayer] ?? 0;
  ropeEl._nameEl.textContent = `${getPlayerName(state.priorityPlayer)}の砂時計が燃えています`;
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
    // 優先権の譲渡自体は基本時間の窓から仕切り直す（受け取った側にロープなしの
    // 基本時間をまるまる与える）。
    btn.addEventListener("click", () => setPriority(seat, freshBaseDeadline(), "base"));
    transferButtonsEl.appendChild(btn);
  }
}

// --- ティック（描画のみ。stateへのdispatchは基本/延長時間切れの遷移のみ） -------------------

function tick() {
  if (!isTurnTimerEnabled()) {
    updateWarning(false);
    if (ropeEl) ropeEl.style.display = "none";
    return;
  }
  const state = getState();
  if (!state.turnPlayer || !state.priorityPlayer || !state.priorityDeadline) {
    updateWarning(false);
    if (ropeEl) ropeEl.style.display = "none";
    return;
  }
  updateSelfStock(state);
  updateRope(state);

  const remaining = state.priorityDeadline - Date.now();
  if (remaining > 0) {
    updateWarning(false);
    return;
  }

  const stock = state.hourglassStock[state.priorityPlayer] ?? 0;

  if (state.priorityPhase === "base") {
    // 基本時間が切れた。ストックがあれば、ここで初めて延長ロープを出現させる
    // （まだ正式には消費しない＝仮消費。行動すれば持ち越せる）。無ければ延長できないので
    // 基本時間切れのまま警告表示のみ。
    if (stock > 0) {
      withGuard(() => setPriority(state.priorityPlayer, Date.now() + getRopeExtensionSeconds() * 1000, "extension"));
    } else {
      updateWarning(state.priorityPlayer === state.turnPlayer);
    }
    return;
  }

  // 延長ロープも燃え尽きた＝行動が無いまま延長時間を使い切った。ここで初めて砂時計を
  // 正式に1個消費する。まだ残っていれば連続してもう1本ロープを燃やす。
  // stockが既に0の場合（この分岐に前回既に入っていて消費し切っている）は、ここで
  // 何もdispatchせず素通りする（後述のphase:"base"への遷移で既に安定状態のはず）。
  if (stock <= 0) {
    updateWarning(state.priorityPlayer === state.turnPlayer);
    return;
  }
  hourglassUsedThisTurn[state.priorityPlayer] = true;
  const nextStock = stock - 1;
  if (nextStock > 0) {
    withGuard(() => {
      setHourglassStock(state.priorityPlayer, nextStock);
      setPriority(state.priorityPlayer, Date.now() + getRopeExtensionSeconds() * 1000, "extension");
    });
    updateWarning(false);
  } else {
    // 最後の1個も使い切った。ロープを消して警告表示だけの安定状態(phase:"base")に戻す
    // （ここで一度だけdispatchすれば、以降は上のstock<=0の早期returnで毎ティックの
    // 無駄な再dispatchを避けられる）。
    withGuard(() => {
      setHourglassStock(state.priorityPlayer, nextStock);
      setPriority(state.priorityPlayer, state.priorityDeadline, "base");
    });
    updateWarning(state.priorityPlayer === state.turnPlayer);
  }
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
  buildSelfStock();
  buildRope();
  buildWarning();
  buildTransferButtons();
  subscribe((state) => {
    onStateChange(state);
    updateSelfStock(state);
    rebuildTransferButtons();
  });
  window.addEventListener("admin:change", () => {
    ensureInitializedIfNeeded();
    updateSelfStock(getState());
    rebuildTransferButtons();
    if (!isTurnTimerEnabled() && ropeEl) ropeEl.style.display = "none";
  });
  setInterval(tick, 200);
}
