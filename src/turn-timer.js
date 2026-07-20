// ターンタイマー（ロープ・砂時計・優先権）。MTGAのイメージで、優先権を持ってから次に
// 何かする（フェイズを進める/カードを使う/ターンを終了する等）までを「1回の行動」とし、
// 基本時間（管理者モードで調整可、デフォルト30秒）は完全に無音・無表示で与えられる
// （ロープは出現しない）。基本時間が切れると、そこで初めてストックしている砂時計を1個
// 「仮消費」し、画面中央に神秘的なオーラのロープが出現して延長時間分だけ燃え尽きていく。
// 行動を取れば（＝ロープリセット）その仮消費は無かったことになり砂時計は満額のまま持ち越
// せる。延長時間も使い切って燃え尽きた場合だけ、砂時計が正式に1個減る（さらに残りがあれば
// 連続してもう1本ロープが燃える＝「回復した基本時間を使い切ったらまた砂時計が作動する」）。
// ロープが一度でも出現した（＝砂時計を使い始めた）ターンは、以降は行動しても満額の基本時間
// には戻らず、短縮された基本時間（管理者モードで調整可、デフォルト10秒上限）だけが与え
// られる——「延長を実際に使い切ったかどうか」ではなく「ロープが出現したかどうか」が基準
// （ユーザー報告で「行動したら基本時間が30秒まで回復してしまう」というバグを修正した際に
// この基準に変更した）。ターンが変わればまた通常の基本時間に戻る。
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
import { SEAT_ORDER, SEAT_TO_SIDE, getRotationSteps, rotateSide } from "./board-layout.js";
import { getSelfSeat } from "./online.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import {
  isTurnTimerEnabled,
  getInitialHourglassStock,
  getMaxHourglassStock,
  getRopeBaseSeconds,
  getRopeExtensionSeconds,
  getTurnsToReplenishHourglass,
  getReducedBaseSeconds,
} from "./admin.js";

let selfStockEl = null; // 左下の自分専用ステータスエリアに出す、自分の砂時計個数バッジ
let baseClockEl = null; // フェイズ案内板の中に出す、基本時間の残り秒数表示
let baseClockLabelEl = null;
let ropeEl = null; // 画面中央のロープ本体（延長中だけ表示）
let ropeStrandEl = null;
let ropeTipEl = null;
let ropeHourglassCountEl = null;
let warningEl = null;
let transferButtonsEl = null;
let transferModalBackdrop = null;
let transferModalEl = null;

let prevTurnPlayer = null;
// 「砂時計を使わずに何ターン経過したか」「そのターン中に砂時計を使ったか」は見た目に
// 影響しない内部カウンタのため、共有state.jsには持たせず、このモジュールのローカル変数
// だけで追跡する。
let hourglassUsedThisTurn = {};
let turnsWithoutHourglass = {};
// 延長ロープが燃えている最中に行動して中断された場合、その時点の残りミリ秒を座席ごとに
// 覚えておく。次にその座席の延長ロープが再開する時、満タンからではなくこの続きから
// 燃え始めるようにするため（ユーザー報告: 「再起動時に前回のロープの長さではなく
// マックスの長さから再開してしまっている」の修正）。延長が最後まで自然に燃え尽きた
// （＝中断されなかった）場合はこの値を使わない＝次の1個は満タンから始まる。
let pausedExtensionRemainingMs = {};

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

// その座席が既に砂時計を使い始めている（＝そのターン中に1個でも正式消費している）場合は、
// 行動で得られる基本時間の窓を短く抑える（デフォルト上限10秒、管理者モードで調整可）。
// まだ使っていなければ通常の基本時間をまるまる与える。
function freshBaseDeadlineFor(seat) {
  const seconds = hourglassUsedThisTurn[seat] ? Math.min(getRopeBaseSeconds(), getReducedBaseSeconds()) : getRopeBaseSeconds();
  return Date.now() + seconds * 1000;
}

// 延長ロープを（再）開始する時に使う長さ（ミリ秒）。中断されて一時停止中の残り時間が
// あればそれを使い切って消費し（＝続きから再開）、無ければ通常の延長時間をまるまる使う
// （＝新しい砂時計が燃え始める）。
function extensionDurationMsFor(seat) {
  const paused = pausedExtensionRemainingMs[seat];
  if (typeof paused === "number" && paused > 0) {
    pausedExtensionRemainingMs[seat] = null;
    return paused;
  }
  return getRopeExtensionSeconds() * 1000;
}

// ターンプレイヤーの交代（ゲーム開始時のnull→非nullも含む）を検知した時の処理。
function handleTurnTransition(prevPlayer, nextPlayer, activePlayers) {
  if (prevPlayer === null && nextPlayer !== null) {
    // ゲーム開始。参加座席全員の砂時計を初期値にし、優先権をスタートプレイヤーへ渡す
    // （基本時間から開始、ロープは非表示）。
    for (const seat of activePlayers) {
      hourglassUsedThisTurn[seat] = false;
      turnsWithoutHourglass[seat] = 0;
      pausedExtensionRemainingMs[seat] = null;
      withGuard(() => setHourglassStock(seat, getInitialHourglassStock()));
    }
    withGuard(() => setPriority(nextPlayer, freshBaseDeadlineFor(nextPlayer), "base"));
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
    // ターンが変わるので、新しいターンプレイヤーの「基本時間短縮」フラグ・一時停止中の
    // ロープの続きをリセットし、通常の基本時間をまるまる与える。
    hourglassUsedThisTurn[nextPlayer] = false;
    pausedExtensionRemainingMs[nextPlayer] = null;
    withGuard(() => setPriority(nextPlayer, freshBaseDeadlineFor(nextPlayer), "base"));
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
    // 延長ロープが燃えている最中に中断された場合、その時点の残り時間を覚えておき、
    // 次にこの座席の延長ロープが再開する時は満タンではなくこの続きから燃えるようにする。
    if (state.priorityPhase === "extension" && state.priorityDeadline) {
      const remaining = state.priorityDeadline - Date.now();
      if (remaining > 0) pausedExtensionRemainingMs[state.priorityPlayer] = remaining;
    }
    withGuard(() => setPriority(state.priorityPlayer, freshBaseDeadlineFor(state.priorityPlayer), "base"));
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

// --- フェイズ案内板の中に出す、基本時間の残り秒数表示 -----------------------------------
// 延長中（ロープ表示中）は出さない——役割が被るため、基本時間の「音も無く静かに減っていく」
// 感覚を伝えるための控えめな表示にとどめる。

function buildBaseClock() {
  const bar = document.getElementById("phase-guide-bar");
  if (!bar) return;
  baseClockEl = document.createElement("div");
  baseClockEl.className = "phase-guide-item turn-timer-base-clock";
  baseClockEl.style.display = "none";
  baseClockLabelEl = document.createElement("span");
  baseClockLabelEl.className = "phase-guide-item-label";
  baseClockEl.appendChild(baseClockLabelEl);
  bar.appendChild(baseClockEl);
}

function updateBaseClock(state) {
  if (!baseClockEl) return;
  const showing =
    isTurnTimerEnabled() &&
    state.turnPlayer &&
    state.priorityPlayer &&
    state.priorityPhase === "base" &&
    state.priorityDeadline &&
    state.priorityDeadline - Date.now() > 0;
  if (!showing) {
    baseClockEl.style.display = "none";
    return;
  }
  const remainingSec = Math.max(0, Math.ceil((state.priorityDeadline - Date.now()) / 1000));
  baseClockLabelEl.textContent = `⏱ ${remainingSec}`;
  baseClockEl.style.display = "flex";
  const totalSeconds = hourglassUsedThisTurn[state.priorityPlayer]
    ? Math.min(getRopeBaseSeconds(), getReducedBaseSeconds())
    : getRopeBaseSeconds();
  const ratio = remainingSec / totalSeconds;
  baseClockEl.classList.toggle("is-warning", ratio <= 0.5 && ratio > 0.2);
  baseClockEl.classList.toggle("is-critical", ratio <= 0.2);
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
  const endTurnBtn = document.getElementById("end-turn-button");
  if (!shouldShow || !endTurnBtn || getComputedStyle(endTurnBtn).display === "none") {
    warningEl.style.display = "none";
    endTurnBtn?.classList.remove("turn-timer-warning-glow");
    return;
  }
  // 「1枚ドロー」ボタン等、#end-turn-buttonの真上に縦に積まれている他のボタンと重なって
  // いた（ボタンの上に表示する方式だった）ため、縦積みの列とは重ならない列の左側へ表示する
  // よう変更した。あわせてボタン自体にも点滅する縁取りを付け、警告テキストが画面外にはみ
  // 出す狭い画面でも「ここが光っている」ことだけは必ず伝わるようにしている。
  endTurnBtn.classList.add("turn-timer-warning-glow");
  const rect = endTurnBtn.getBoundingClientRect();
  warningEl.style.top = `${rect.top + rect.height / 2}px`;
  warningEl.style.right = `${window.innerWidth - rect.left + 12}px`;
  warningEl.style.left = "auto";
  warningEl.style.display = "block";
}

// --- 優先権譲渡ボタン（三角形配置、円の中はアバター・枠は駒の色） ------------------------

const TRANSFER_EXPLANATION = [
  "優先権とは「次に行動すべきプレイヤー」を表します。通常はターンプレイヤーが持っていますが、カードの効果などで一時的に他のプレイヤーへ移ることがあります（今はカード効果の自動処理が無いため、実際に効果が発生したらこのボタンで手動・自己申告的に表現してください）。",
  "円形のボタンを押すと、そのプレイヤーへ優先権を譲渡します。誰でも押せます（押した本人が今優先権を持っているかは問いません、このゲーム全体の自己申告制と同じ考え方です）。",
  "ボタンの枠の色はそのプレイヤーの駒の色、円の中は登録されているアバターです。",
];

// main.jsのapplyAvatarContentと同じロジック（main.js側は非公開のため、依存を増やさない
// よう軽量な内容をここに複製してある）。
function isImageAvatar(avatar) {
  return typeof avatar === "string" && /^https?:\/\//.test(avatar);
}
function applyAvatar(el, avatar) {
  if (isImageAvatar(avatar)) {
    let img = el.querySelector("img.avatar-image");
    if (!img) {
      img = document.createElement("img");
      img.className = "avatar-image";
      el.textContent = "";
      el.appendChild(img);
    }
    img.src = avatar;
  } else {
    el.querySelector("img.avatar-image")?.remove();
    el.textContent = avatar;
  }
}

function openTransferModal() {
  transferModalBackdrop.style.display = "block";
  transferModalEl.style.display = "block";
}
function closeTransferModal() {
  transferModalBackdrop.style.display = "none";
  transferModalEl.style.display = "none";
}

function buildTransferButtons() {
  transferButtonsEl = document.createElement("div");
  transferButtonsEl.id = "priority-transfer-buttons";
  transferButtonsEl.style.display = "none";

  const grid = document.createElement("div");
  grid.className = "priority-transfer-grid";
  transferButtonsEl.appendChild(grid);
  transferButtonsEl._grid = grid;

  // 「優先権譲渡」ラベル。フェイズ案内板のボタンと同じ「ホバーで簡易説明・クリックで詳細
  // 説明」パターン（説明文はTRANSFER_EXPLANATION参照）。
  const label = document.createElement("button");
  label.type = "button";
  label.className = "priority-transfer-label";
  const labelText = document.createElement("span");
  labelText.textContent = "優先権譲渡";
  const tooltip = document.createElement("span");
  tooltip.className = "phase-guide-tooltip";
  tooltip.textContent = "優先権を他のプレイヤーへ手動で譲渡します（自己申告制）";
  label.appendChild(labelText);
  label.appendChild(tooltip);
  label.addEventListener("click", openTransferModal);
  transferButtonsEl.appendChild(label);

  document.body.appendChild(transferButtonsEl);

  transferModalBackdrop = createBackdrop(closeTransferModal, { dim: true, zIndex: 10100 });
  transferModalBackdrop.style.display = "none";
  transferModalEl = document.createElement("div");
  transferModalEl.id = "priority-transfer-modal";
  transferModalEl.style.display = "none";
  transferModalEl.appendChild(createModalCloseX(closeTransferModal));
  const modalTitle = document.createElement("div");
  modalTitle.className = "phase-guide-modal-title";
  modalTitle.textContent = "優先権譲渡";
  transferModalEl.appendChild(modalTitle);
  const modalBody = document.createElement("div");
  modalBody.className = "phase-guide-modal-body";
  for (const paragraph of TRANSFER_EXPLANATION) {
    const p = document.createElement("p");
    p.style.cssText = "margin: 0 0 0.6rem 0; line-height: 1.6;";
    p.textContent = paragraph;
    modalBody.appendChild(p);
  }
  transferModalEl.appendChild(modalBody);
  document.body.appendChild(transferModalBackdrop);
  document.body.appendChild(transferModalEl);
}

function rebuildTransferButtons() {
  if (!transferButtonsEl) return;
  const grid = transferButtonsEl._grid;
  grid.innerHTML = "";
  const state = getState();
  if (!isTurnTimerEnabled() || !state.turnPlayer) {
    transferButtonsEl.style.display = "none";
    return;
  }
  const selfSeat = getSelfSeat();
  const activeSeats = SEAT_ORDER.filter((s) => state.activePlayers.includes(s));
  if (activeSeats.length === 0) {
    transferButtonsEl.style.display = "none";
    return;
  }
  transferButtonsEl.style.display = "flex";
  // 実際のテーブルの位置関係と同じ「＋」形（上/左/右/自分=下）にdata-pos属性で配置する。
  // 自分以外は、実際の画面上の座席位置（自分視点で盤面全体が回転する既存の仕組み、
  // getRotationSteps/rotateSide参照）をそのままスロットの位置として使う。自分自身の
  // ボタンは常に「自分（下）」の位置＝「自分に優先権を戻す」ボタンを兼ねる
  // （ユーザー要望）。
  const steps = getRotationSteps(selfSeat);
  for (const seat of activeSeats) {
    const isSelf = seat === selfSeat;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = isSelf ? "priority-transfer-btn is-self" : "priority-transfer-btn";
    btn.dataset.pos = isSelf ? "self" : rotateSide(SEAT_TO_SIDE[seat], steps);
    const color = getPieceColor(seat);
    btn.style.borderColor = color ? `var(--color-${color})` : "rgba(255, 255, 255, 0.5)";
    applyAvatar(btn, getPlayerAvatar(seat));
    btn.title = isSelf ? "自分に優先権を戻す" : `${getPlayerName(seat)}に優先権を渡す`;
    // 優先権の譲渡自体も「行動」の一種として扱い、freshBaseDeadlineForで基本時間の窓を
    // 仕切り直す（既に砂時計を使い始めている座席への譲渡は、短縮された基本時間になる——
    // 譲渡を繰り返して時間を稼ぐ抜け道を作らないため）。
    btn.addEventListener("click", () => setPriority(seat, freshBaseDeadlineFor(seat), "base"));
    grid.appendChild(btn);
  }
}

// --- ティック（描画のみ。stateへのdispatchは基本/延長時間切れの遷移のみ） -------------------

function tick() {
  if (!isTurnTimerEnabled()) {
    updateWarning(false);
    if (ropeEl) ropeEl.style.display = "none";
    if (baseClockEl) baseClockEl.style.display = "none";
    return;
  }
  const state = getState();
  if (!state.turnPlayer || !state.priorityPlayer || !state.priorityDeadline) {
    updateWarning(false);
    if (ropeEl) ropeEl.style.display = "none";
    if (baseClockEl) baseClockEl.style.display = "none";
    return;
  }
  updateSelfStock(state);
  updateRope(state);
  updateBaseClock(state);

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
      // ハマりどころ（ユーザー報告で発覚）: 以前はこのフラグを「延長を使い切って正式に
      // 砂時計を消費した瞬間」だけtrueにしていたため、ロープが燃えている最中（まだ正式
      // 消費前）に行動すると、hourglassUsedThisTurnがまだfalseのまま＝短縮ルールが
      // 適用されず、行動のたびに満額の基本時間（例:30秒）へ戻ってしまっていた。
      // 「ロープが一度でも出現したら、そのターンはもう基本時間が短縮される」という
      // 仕様に合わせ、ロープが最初に出現するこの時点でフラグを立てる（本当に正式消費
      // されるかどうかは問わない）。
      hourglassUsedThisTurn[state.priorityPlayer] = true;
      // 中断された延長ロープの続きがあればそこから、無ければ満タンから燃やす
      // （extensionDurationMsFor参照）。
      withGuard(() =>
        setPriority(state.priorityPlayer, Date.now() + extensionDurationMsFor(state.priorityPlayer), "extension")
      );
    } else {
      updateWarning(state.priorityPlayer === state.turnPlayer);
    }
    return;
  }

  // 延長ロープも燃え尽きた＝行動が無いまま延長時間を使い切った。ここで初めて砂時計を
  // 正式に1個消費する。まだ残っていれば連続してもう1本ロープを燃やす
  // （＝「回復した基本時間を使い切ったらまた砂時計が作動する」）。
  // stockが既に0の場合（この分岐に前回既に入っていて消費し切っている）は、ここで
  // 何もdispatchせず素通りする（後述のphase:"base"への遷移で既に安定状態のはず）。
  if (stock <= 0) {
    updateWarning(state.priorityPlayer === state.turnPlayer);
    return;
  }
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
  buildBaseClock();
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
    if (!isTurnTimerEnabled()) {
      if (ropeEl) ropeEl.style.display = "none";
      if (baseClockEl) baseClockEl.style.display = "none";
    }
  });
  setInterval(tick, 200);
}
