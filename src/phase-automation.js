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

import { getState, isOnlineMode, drawFromPile, flipToken, nextTurn, setPriorityState } from "./state.js";
import { getSelfSeat, getCurrentGameId, fetchAndHydrate, getSyncedTimerConfig, broadcastPhaseChange, onPhaseChangeEvents, isSpectatingGame } from "./online.js";
import { markSelfHandled } from "./self-handled-tokens.js";
import {
  isAutoProcessingEnabled,
  getMoveCandidates,
  isMovementBoostActiveThisTurn,
  isMovementDisabledThisTurn,
  isHandEffectReactiveOnly,
  hasHandEffectData,
  canUseHandEffect,
} from "./card-effect-engine.js";
import { runGateInvasionsIfNeeded } from "./gate-invasion.js";
import { isGateInvasionQueueActive } from "./gate-invasion-modal.js";
import { playSound } from "./sound.js";
import { announceHandPickups } from "./hand-announcer.js";
import { SIDE_TO_SEAT, COLORS, SEAT_ORDER } from "./board-layout.js";
import { getCardDefinition } from "./cards-data.js";
import { hasAnyoneWon } from "./victory.js";
import { isPseudoCpuModeEnabled as isPseudoCpuModeEnabledLocal, isPseudoCpuIncludeSelf, getPseudoCpuDeadlineMs } from "./admin.js";
import { logAction } from "./action-log.js";
import { isAutoPhaseSkipEnabled, onAutoPhaseSkipChange } from "./auto-phase-skip-setting.js";
import { isCpuBattleActive } from "./cpu-battle-state.js";

// フェイズ自動進行が「今どの席を対象に動くか」。通常は自分の席（getSelfSeat）。ただしローカルの
// CPU戦では、自分(A)だけでなくCPU(C)の番も自動で流したいので、その時だけ「今のターン
// プレイヤー」を対象にする（オンラインは各クライアントが自分の席だけを動かすので対象外）。
// main.js の performPriorityTimeoutAutoAction 側にも同じ考え方の getAutoDriveSeat がある。
function getAutoDriveSeat() {
  if (isCpuBattleActive() && !isOnlineMode()) return getState().turnPlayer || getSelfSeat();
  return getSelfSeat();
}

// ユーザー報告（続き99）「疑似CPUモードの時、回復すると基本時間が15秒とかまで行って
// しまう」。turn-timer.jsのisPseudoCpuTargetと全く同じ判定だが、循環import
// （turn-timer.js→main.js→phase-automation.js）を避けるためturn-timer.js側の
// 関数は呼べず、ここに同じロジックを複製する（ensureSkipButtonの15秒回復と同じ
// 「turn-timer.js側の関数は呼べないので直接setPriorityStateする」既存パターンの延長）。
// 続き101: 「有効化」自体もturnEnabled等と同じくオンライン中は対局開始時の同期値を
// 優先するようになったため、ここもturn-timer.jsのisPseudoCpuModeActiveと同じ
// 判定に揃える。
// 疑似CPUの基本時間はオプションで可変（admin.jsのgetPseudoCpuDeadlineMs、既定1000ms）。
function isPseudoCpuModeActive() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? !!synced.pseudoCpuModeEnabled : isPseudoCpuModeEnabledLocal();
}
function isPseudoCpuTarget(seat) {
  if (!isPseudoCpuModeActive()) return false;
  return isPseudoCpuIncludeSelf() || seat !== getSelfSeat();
}

let renderHelper = null;
let findTopCardAtHelper = null;
export function registerPhaseAutomationHelpers({ render, findTopCardAt, pickLocation }) {
  renderHelper = render;
  findTopCardAtHelper = findTopCardAt;
  pickLocationHelper = pickLocation;
}
// ムーブフェイズの救済（移動先も接触相手も無い時、山札から隣へ1枚置く）で、プレイヤーに
// 置き先マスを選ばせるためのピッカー（main.jsのrequestCellChoiceForEffectを注入）。
let pickLocationHelper = null;
// 救済ピック中の二重発火防止（reconcileMovePhaseは何度も呼ばれるため）。
let awaitingFallbackPick = false;

export const PHASES = ["lock", "hand", "move"];
const PHASE_LABEL = { lock: "LOCK", hand: "HAND", move: "MOVE" };
const PHASE_KATAKANA = { lock: "ロック", hand: "ハンド", move: "ムーブ" };

// ユーザー要望「今相手が何のフェイズかをフェイズ案内板でわかるようにしたい」。
// 自分のフェイズ（currentPhase）は自分の手番の間しか動かない（reconcilePhaseAutomationの
// shouldBeActive参照）ため、他プレイヤーの手番中は案内板に何も光らない。手番プレイヤーが
// 自分のフェイズが変わるたびにonline.jsのbroadcastPhaseChangeで{player, phase}を全員へ
// 中継し、受け取った側は「その人が今の手番プレイヤーなら」案内板をそのフェイズで光らせる。
// remotePhaseは直近に受け取った他プレイヤーのフェイズ（1手番に1人しか手番は無いので
// 単一の{player, phase}で足りる。phase=nullなら消灯）。
let remotePhase = null;
function broadcastMyPhase() {
  if (isOnlineMode()) broadcastPhaseChange({ player: getSelfSeat(), phase: currentPhase });
}
// 案内板・ターン表示に実際に反映すべきフェイズ（自分の手番なら自分のcurrentPhase、相手の
// 手番なら中継で受け取ったremotePhase）。
function getDisplayedPhase() {
  const turnPlayer = getState().turnPlayer;
  if (!turnPlayer) return null;
  if (turnPlayer === getSelfSeat()) return currentPhase;
  if (remotePhase && remotePhase.player === turnPlayer) return remotePhase.phase;
  return null;
}
// 登録はモジュール評価が全て終わってから行う（queueMicrotask）。不具合2026-08-08「更新したら
// 画面真っ黒」の原因: online.js↔（admin.js→main.js経由の）循環importで、online.jsの評価が
// 終わる前にこのトップレベル呼び出しが走ると online.js の `phaseChangeEventListeners`(let)が
// TDZで「Cannot access ... before initialization」を投げ、アプリ全体が起動時にクラッシュしていた。
// マイクロタスクへ遅らせれば、同期的なモジュール評価が全て完了した後（online.js初期化済み）に
// 登録されるため、import順に依存せず安全（フェイズ中継の受信はゲーム開始後なので遅延は無害）。
queueMicrotask(() => {
  onPhaseChangeEvents((payload) => {
    if (!payload || payload.player === getSelfSeat()) return; // 自分の中継は無視（自分はcurrentPhaseで表示）
    remotePhase = payload.phase ? { player: payload.player, phase: payload.phase } : null;
    updatePhaseGuideGlow();
    updateSkipButtonVisibility();
  });
});

let currentPhase = null; // null | "lock" | "hand" | "move"
// currentPhaseが「どの席のフェイズか」。通常プレイでは常に自分の席だが、ローカルCPU戦では
// A/C両方の席を順に駆動するため、ターンが変わったのに前のターンのcurrentPhaseが残って
// しまうと即ターン終了ループになる（不具合#19）。ターン境界でこれを見てリセットする。
let phaseOwner = null;
// ロックフェイズ開始時点で自分がロック済みのカードid集合。以前は「ロック枚数」だけを
// 覚えて『枚数が増えたら次のフェイズへ』としていたが、ゴメンナサイで最後のロックを
// 妨害されたケース（相手が7色目をロック＝1枚増、と同時に既存ロック1枚を奪われ＝1枚減で
// 差し引きゼロ）で枚数が変わらず、攻撃側がロックフェイズから進めなくなっていた
// （ユーザー報告「相手はロックフェイズからハンドフェイズに移行しませんでした」）。
// 「開始時に無かった新しいロックidが1枚でも増えたか」で判定すれば、同時に別の1枚が
// 奪われても新しくロックした事実を取りこぼさない。
let lockedIdsAtPhaseStart = new Set();
function getLockedTokenIds(player) {
  return new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && SIDE_TO_SEAT[t.location.side] === player)
      .map((t) => t.id)
  );
}
let performingFallback = false; // ムーブフェイズの自動処理（カード設置＋ターン終了）の二重発火防止
let handEffectBusy = false; // 手札効果の解決中（コスト選択待ち等）はフェイズを進めない
// ユーザー報告「ムーブフェイズでの移動後、移動したにもかかわらずまた隣のマスに
// ハイライトが表示される」。「移動」か「接触」のどちらか一方を必ず1回だけ行う
// ルールのため、このフェイズで既に行動したら（クリック実行時にmarkPhaseMoveActionTaken
// を呼んでもらう）、以後は再計算・再ハイライトも救済フォールバックも一切行わない
// （手動で「ターン終了」ボタンを押すのを待つだけの状態になる）。
let moveActionTaken = false;

export function getCurrentPhase() {
  return currentPhase;
}
export function isHandPhaseActive() {
  return currentPhase === "hand";
}
export function isMovePhaseActive() {
  return currentPhase === "move" && !moveActionTaken;
}
export function markPhaseMoveActionTaken() {
  moveActionTaken = true;
  clearMovableHighlights();
}
// main.jsの手札効果トリガー（Task 5）が、コスト選択等で待っている間はフェイズの
// 自動進行を一時止める（選んでいる最中にハンドフェイズが終わってしまうのを防ぐ）。
export function setHandEffectBusy(v) {
  handEffectBusy = !!v;
}
// ユーザー報告「『いつでも使える』が効果の処理中にも使えてしまう」への対応で
// main.js側が判定に使う（docs/rulebook.md「いつでも使える」の定義参照）。
export function isHandEffectBusy() {
  return handEffectBusy;
}

// ユーザー報告「『○○のターン』の表示がちゃんと消えてからフェイズのモーダル表示に
// 移ってほしい」。ターン切替時、announceTurnChange()（turn-announce.js）のトーストと
// このモジュールのannouncePhase("lock")トーストが同じrender()タイミングで同時に
// 出てしまい重なっていた。main.js側がannounceTurnChange()の表示中はtrueにし、
// トーストが完全に消え終わったコールバックでfalseに戻す（その際reconcileし直し、
// 待たされていたフェイズ開始をそこで行う）。
let turnAnnounceActive = false;
export function setTurnAnnounceActive(v) {
  turnAnnounceActive = !!v;
  if (!turnAnnounceActive) reconcilePhaseAutomation();
}

// ユーザー要望「セットアップが完全に終わってからフェイズのモーダルを表示するように
// してください」への対応。turnAnnounceActiveと同じ考え方だが、こちらは対局最初の
// ターン開始時が対象。game-setup.jsのrunStep3()はsetTurnPlayer()（turnPlayerが
// null→非null）した直後に「３：スタートプレイヤー決定」モーダル
// （showStartPlayerModal、8秒で自動的に消える）を出すが、turnPlayerの変化自体は
// その前の同期的なnotifyChange()で既に発火済みのため、上のturnAnnounceActiveが
// 対象にしていない「対局開始1回目」のケースでは、このモーダルとフェイズ告知
// （announcePhase("lock")等）が同時に表示され重なってしまっていた。
// game-setup.js側がshowStartPlayerModal表示中はtrueにし、モーダルが消えた
// コールバックでfalseに戻す（その際reconcileし直す）。
let setupRevealActive = false;
export function setSetupRevealActive(v) {
  setupRevealActive = !!v;
  if (!setupRevealActive) reconcilePhaseAutomation();
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

// ユーザー要望「手札がないロックフェイズを自動でスキップしてください」「手札があるのに
// ハンドフェイズが飛ばされました」。以前のハンドフェイズは構造化データ(DSL)を持つ
// カードだけを見るhasUsableHandEffect()で自動スキップしていたが、まだDSL化されていない
// 効果カードの手札を見落として飛ばしてしまうバグがあった。ロック・ハンドとも
// 「手札が本当に空かどうか」だけを見るシンプルな判定に統一する。
function handIsEmpty(player) {
  return !getState().tokens.some((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
}

// ユーザー報告「手札にカウンターロックのみ持っていて使えるカードがないのにムーブ
// フェイズへ自動で移行しなかった」への対応。ゴメンナサイッ！・カウンターロックは
// 反応時専用（あなたへのロック/接触の宣言時にしか使えない）で、Hand Phase中は
// 絶対に使えない（card-effect-engine.jsのisHandEffectReactiveOnly参照、続き57で
// 新設）。手札が「文字通り空」ではなくても、中身が全てこの手のカードだけなら
// 実質「ハンドフェイズでは何もできない」ことに変わりないため、handIsEmptyと同じ
// 扱いにする。手札に構造化データが無いカード（プレゼント等、まだ自動処理未対応の
// 手札効果を持つ可能性があるカード）は安全側で「使えるかもしれない」扱いのまま
// 残し、この判定の対象には含めない。
function handHasOnlyReactiveOnlyCards(player) {
  const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
  return hand.length > 0 && hand.every((t) => isHandEffectReactiveOnly(t.cardId));
}

// ユーザー報告「手札にマスチェンジ1枚しかないのにハンドフェイズがスキップされない
// （追色が必要で1枚では使えない）。ザ・ギャンブル1枚の時も同様」。手札が空でなくても、
// 全ての手札カードが『今このハンドフェイズでは使えない』と確定できるなら自動スキップする。
// handHasOnlyReactiveOnlyCardsの拡張版で、以下を「使えない」とみなす:
//   ・反応時専用カード（ハンドフェイズでは絶対に使えない）
//   ・構造化データ(DSL)を持つカードで、canUseHandEffectがfalse（追色コスト不足・使用回数
//     超過・ザ・ギャンブルで捨てる手札が無い等、善処の原則で発動宣言できない）
// 逆に、DSL未対応のカード（プレゼント等、まだ使えるか判定できない手札効果）は
// 「使えるかもしれない」として残し、スキップしない（＝取りこぼして飛ばさない。以前
// hasUsableHandEffectで飛ばしていたバグ、reconcilePhaseAutomationのhandコメント参照）。
function handHasNoUsableCards(player) {
  const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
  if (hand.length === 0) return false; // 空はhandIsEmptyが担当
  return hand.every((t) => {
    if (isHandEffectReactiveOnly(t.cardId)) return true;
    if (!hasHandEffectData(t.cardId)) return false; // DSL未対応 → 使えるかもしれないので残す
    return !canUseHandEffect(t.cardId, t.id, player);
  });
}

// ファースト/エターナルカードは「原則ロックしたカードの手札効果は使えない」の例外で、
// ロックエリアに置いたままでもハンドフェイズで使える（buildFlatCardのis-usable-while-locked
// 参照）。上のhandIsEmpty/handHasNoUsableCardsは手札ゾーンしか見ないため、手札が空/全部
// 使えなくても、ロック済みのファースト/エターナルが今使えるならハンドフェイズを自動
// スキップしてはいけない（ユーザー指摘）。使用可否は手札のときと同じcanUseHandEffectで
// 判定する（追色コスト等。ゾーンに依存しない）。
function hasUsableLockedFirstOrEternal(player) {
  return getState().tokens.some(
    (t) =>
      t.kind === "card" &&
      t.location.zone === "lock" &&
      SIDE_TO_SEAT[t.location.side] === player &&
      (t.cardId.startsWith("first-") || t.cardId.startsWith("eternal-")) &&
      hasHandEffectData(t.cardId) &&
      canUseHandEffect(t.cardId, t.id, player)
  );
}

// ユーザー指摘: ロックフェイズのスキップ判定は「手札が空かどうか」だけでは不十分。
// docs/rulebook.mdの「ロック」FAQ確認: 原則1色のロックエリアには1枚しかロックできない
// （既に埋まっている色は対象外）。「なないろの欠片」は手札に2枚揃っていてもロック
// フェイズでは常にロックできない（手札効果やカウンターロック等、ハンドフェイズの
// 効果でのみロックできる特殊カードのため）。無色（白/黒）カードはロックエリアへ
// 「置いて」もルール上「ロックした」扱いにならない（docs/cards.md）ため対象外にする。
function isLockSlotOccupied(player, color) {
  const colorIndex = COLORS.indexOf(color);
  if (colorIndex === -1) return false;
  return getState().tokens.some(
    (t) => t.kind === "card" && t.location.zone === "lock" && SIDE_TO_SEAT[t.location.side] === player && t.location.index === colorIndex
  );
}
// 1枚のカードがロックフェイズで実際にロックできるか（hasLockableCard/ハイライトの両方が
// 使う共通の判定）。ユーザー要望「ロックフェイズでロックできるカードが光りますが、
// クリックで自動でロックされるようにもしてください」への対応で、main.jsのクリック
// ハンドラからも判定できるようexportした。
export function isCardLockable(token, player) {
  if (token.cardId === "rainbow-shard") return false; // ロックフェイズでは常にロック不可
  const color = getCardDefinition(token.cardId)?.color;
  if (!color || color === "white" || color === "black") return false; // 無色は「ロックした」扱いにならない
  return !isLockSlotOccupied(player, color);
}
function hasLockableCard(player) {
  const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
  return hand.some((t) => isCardLockable(t, player));
}

// ユーザー要望「ロックフェイズではロックできるカードのみ手札内でハイライトし、それ以外は
// トーンオフしてほしい」。ムーブフェイズのマスハイライト（reconcileMovePhase）と同じ
// 「render()のたびに呼び直す」パターンを、盤面マスの代わり自分の手札カードに適用する。
let highlightedLockCardEls = [];
function clearLockHandHighlight() {
  for (const el of highlightedLockCardEls) el.classList.remove("phase-lock-highlight");
  highlightedLockCardEls = [];
  document.body.classList.remove("phase-lock-picking");
}
function updateLockPhaseHandHighlight(player) {
  clearLockHandHighlight();
  const handArea = document.querySelector(`.hand-area[data-player="${player}"]`);
  if (!handArea) return;
  const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
  const lockableIds = new Set(hand.filter((t) => isCardLockable(t, player)).map((t) => t.id));
  document.body.classList.toggle("phase-lock-picking", lockableIds.size > 0);
  for (const el of handArea.querySelectorAll(".hand-card")) {
    if (lockableIds.has(el.dataset.tokenId)) {
      el.classList.add("phase-lock-highlight");
      highlightedLockCardEls.push(el);
    }
  }
}

// ユーザー要望「その旨をモーダルで伝えてください」。confirm-modal（main.js）と似た
// 見た目だが、OKを待たせず数秒で自動的に消える（フェイズ自動スキップは1ターンに
// 複数回起こり得るため、毎回クリックを要求すると煩雑になる。クリックでも即消せる）。
// ユーザー報告「ロックもハンドも連続でスキップされる時、ハンドのスキップ表示が
// 出なかったりする」の対応: 前回分がまだ残っていたら（連続スキップで2回目が
// 呼ばれた場合等）先に消してから出し直す。showCardArrivalModal等、既存の
// 「前のモーダルを消してから最新を出す」パターンと同じ考え方。
let currentSkipModal = null;
let currentSkipModalTimer = null;
// ユーザー報告「『ロックできないのでスキップ』的なモーダルが次のハンドフェイズの
// モーダルにかぶったりする。ハンドフェイズのスキップモーダルもムーブフェイズの
// モーダルにかかる」の原因: このモーダル自身の自動消滅は2800ms後だが、
// advancePhaseAfterSkip()は1500ms後には次のフェイズへ進めてしまう（PHASE_SKIP_
// ADVANCE_DELAY_MS参照）。次のフェイズが「またスキップ」ならshowPhaseSkipModal()
// 自身が古いモーダルを消してから出し直すので問題にならないが、次のフェイズが
// スキップされず通常のannouncePhase()（別要素・別クラスのトースト）が出る場合、
// announcePhase()側はこのスキップモーダルの存在を知らず消さないため、最大で
// 2800-1500=1300ms程度、両方が同時に画面に残ってしまっていた。enterPhase()の
// 先頭で必ずこの関数を呼び、前のフェイズのスキップモーダルが残っていれば
// （スキップだろうと通常告知だろうと）新しいフェイズに入る前に必ず消すようにした。
function dismissSkipModal() {
  if (!currentSkipModal) return;
  clearTimeout(currentSkipModalTimer);
  currentSkipModal.backdrop.remove();
  currentSkipModal.modal.remove();
  currentSkipModal = null;
}
function showPhaseSkipModal(message) {
  dismissSkipModal();
  const backdrop = document.createElement("div");
  backdrop.className = "phase-skip-modal-backdrop";
  const modal = document.createElement("div");
  modal.className = "phase-skip-modal";
  modal.textContent = message;
  const dismiss = () => {
    backdrop.remove();
    modal.remove();
    if (currentSkipModal?.modal === modal) currentSkipModal = null;
  };
  backdrop.addEventListener("click", dismiss);
  modal.addEventListener("click", dismiss);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  currentSkipModal = { backdrop, modal };
  currentSkipModalTimer = setTimeout(dismiss, 2800);
}

// ユーザー報告「フェイズが自動スキップされる時、次のフェイズタイトルモーダルが出るまで
// もう少し間があった方が良い。ロックもハンドもスキップの場合、ハンドのフェイズタイトルが
// 表示されなかったりする」。以前はshowPhaseSkipModal()の直後に同期的にadvancePhase()を
// 呼んでいたため、ロック→ハンドと連続でスキップされる場合、ロックのスキップ表示・
// ハンドのスキップ表示・（両方スキップなら）ムーブの告知トーストが同じ一瞬に折り重なって
// 出ていた。スキップからの遷移だけ、次のフェイズの判定に移るまで一呼吸置く
// （実際に手札効果を使った・ロックした等の「本物の進行」によるadvancePhase()呼び出し
// （reconcilePhaseAutomation参照）は従来通り即時のまま）。
const PHASE_SKIP_ADVANCE_DELAY_MS = 1500;
// ユーザー報告「ロックフェイズでロックはできて、ハンドフェイズに手札が無い時、
// ハンドフェイズの自動スキップモーダルが出ていない」の原因: ロック→ハンドの
// 自動遷移はstate.jsの汎用render()購読（moveToken等の状態変更のたびに同期的に
// 発火する）経由でreconcilePhaseAutomation()が呼ばれてenterPhase("hand",...)に
// 到達し、そこでこのadvancePhaseAfterSkip()（1500ms後に実際の遷移）が予約される。
// ところがperformLockPhaseClick等の呼び出し元は、その直後に自分でも明示的に
// render()を呼んでおり、その2回目のreconcilePhaseAutomation()が「currentPhase===
// "hand" && handIsEmpty」を見てそのまま即座に（1500ms待たず）advancePhase()して
// しまい、enterPhase("move",...)の先頭のdismissSkipModal()で、表示された直後の
// スキップモーダルを一瞬で消してしまっていた（ユーザーからは「出ていない」ように
// 見える）。予約中はこのフラグで「もう次への遷移は予約済み」と示し、reconcile側の
// 別経路からの即時advancePhase()を抑止する。
let skipTransitionPending = false;
function advancePhaseAfterSkip() {
  skipTransitionPending = true;
  setTimeout(() => {
    skipTransitionPending = false;
    advancePhase();
  }, PHASE_SKIP_ADVANCE_DELAY_MS);
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
  const shown = getDisplayedPhase();
  for (const p of PHASES) {
    const btn = document.getElementById(`phase-guide-${p}-button`);
    if (btn) btn.classList.toggle("is-current-phase", p === shown);
  }
}

// --- UI: 常設のスキップボタン（フェイズ案内板の近くに表示） ---------------------------
let skipButtonEl = null;
// ユーザー要望（続き76）「スキップボタンを表示させていない時は『自分のターンです』
// 『相手のターンです』とそこに表示させておきたい」。スキップボタンと同じ「フェイズ
// 案内板の右端」の枠を共有し、どちらか一方だけを表示する。
let turnStatusEl = null;
// ハマりどころ（続き76、実機確認で発見）: 以前は「#phase-guide-barが無ければbody直下へ
// フォールバックする」だけで、一度フォールバックしてしまうと（ensureXxx()自体は
// 「既に生成済みならそのまま返す」ため）二度とbarへ移設されなかった。この続き76で
// reconcilePhaseAutomation()の先頭からshouldBeActiveの判定に関係なく毎回呼ぶように
// 変更した結果、main.js側でまだ#phase-guide-barが構築される前の最初のrender()で
// このフォールバック経路に入ってしまい、bottom:calc(100% + 0.6rem)がbody全体を基準に
// 計算されて画面の全く違う場所に表示される不具合が発生した。生成済みでも、現在の親が
// バーと違う（＝フォールバック中）かつバーが今は存在するなら、そのタイミングで
// バーの子へ付け替える（毎回呼ばれても親が既に一致していればappendChildは無害な
// no-opのため、判定を省略して常に実行してよい）。
function attachToPhaseGuideBar(el) {
  const bar = document.getElementById("phase-guide-bar");
  if (bar) {
    // ユーザー報告#12「ハンドフェイズのスキップがワンクリックで反応せず、ダブルクリックで
    // 効いた」。この関数はrender()だけでなくタイマーtick(200ms毎、#8)からも呼ばれる。
    // 以前は「既に子でもappendChildは無害なno-op」と考えて毎回appendChildしていたが、実際は
    // 既存要素のappendChildは“いったんDOMから外して末尾へ入れ直す”移動になり、ちょうど
    // クリックのmousedown〜mouseup/clickの間に起きるとそのクリックがキャンセルされる（＝
    // 1回目が無反応になり2回目で効く）。既に正しい親(bar)にいる時は本当に何もしない。
    if (el.parentElement !== bar) bar.appendChild(el);
  } else if (!el.parentElement) {
    document.body.appendChild(el);
  }
}
function ensureSkipButton() {
  if (skipButtonEl) {
    attachToPhaseGuideBar(skipButtonEl);
    return skipButtonEl;
  }
  skipButtonEl = document.createElement("button");
  skipButtonEl.type = "button";
  skipButtonEl.id = "phase-automation-skip-button";
  skipButtonEl.textContent = "スキップ";
  skipButtonEl.addEventListener("click", () => {
    if (handEffectBusy) return;
    // ユーザー要望「スキップボタンを押しても時間を15秒回復させてください」。
    // turn-timer.jsは時間切れによる自動スキップの時だけ、盤面操作を伴わないことの
    // 埋め合わせとして優先権保持者に15秒の基本時間を明示的に付与している
    // （performPriorityTimeoutAutoAction()が"skip"を返した時のsetPriorityState呼び出し
    // 参照）。この常設スキップボタンを手動で押した時も、同じく盤面操作を一切伴わない
    // （＝onStateChange側の「本人の本物の操作」判定では自然にリセットされない）ため、
    // 同じ埋め合わせが必要。turn-timer.js側の関数は循環import（turn-timer.js→main.js→
    // phase-automation.js）になるため呼べず、ここではstate.jsのsetPriorityStateを
    // 直接呼んで同じパッチを適用する。
    const priorityPlayer = getState().priorityPlayer;
    if (priorityPlayer) {
      const target = isPseudoCpuTarget(priorityPlayer);
      // ユーザー要望（続き102）「疑似CPUモードが適用されない原因をアクションログで
      // 確認できるようにしてほしい」。
      logAction("diag-pseudo-cpu", { phase: "ensureSkipButton", priorityPlayer, isPseudoCpuModeActive: isPseudoCpuModeActive(), isPseudoCpuTarget: target });
      const recoveryMs = target ? getPseudoCpuDeadlineMs() : 15000;
      setPriorityState({ player: priorityPlayer, deadline: Date.now() + recoveryMs, phase: "base" });
    }
    advancePhase();
  });
  attachToPhaseGuideBar(skipButtonEl);
  return skipButtonEl;
}
function ensureTurnStatus() {
  if (turnStatusEl) {
    attachToPhaseGuideBar(turnStatusEl);
    return turnStatusEl;
  }
  turnStatusEl = document.createElement("div");
  turnStatusEl.id = "phase-automation-turn-status";
  attachToPhaseGuideBar(turnStatusEl);
  return turnStatusEl;
}
export function updateSkipButtonVisibility() {
  const btn = ensureSkipButton();
  const statusEl = ensureTurnStatus();
  // ムーブフェイズは「移動」か「接触」のどちらかを必ず行う必要があり、任意にスキップできる
  // 性質のものではない（docs/rulebook.md）。スキップボタンはロック・ハンドフェイズだけに出す。
  const showSkip = currentPhase === "lock" || currentPhase === "hand";
  btn.style.display = showSkip ? "block" : "none";
  const state = getState();
  if (showSkip || !state.turnPlayer) {
    statusEl.style.display = "none";
  } else {
    statusEl.style.display = "block";
    let text = state.turnPlayer === getSelfSeat() ? "自分のターンです" : "相手のターンです";
    // ユーザー要望「今相手が何のフェイズかをフェイズ案内板でわかるようにしたい」。案内板の
    // ボタン発光（updatePhaseGuideGlow）に加え、相手の手番中はこのターン表示にも相手の
    // 現在フェイズ名を添える（中継で受け取ったremotePhaseベース。まだ届いていなければ何も
    // 添えない）。
    if (state.turnPlayer !== getSelfSeat()) {
      const shown = getDisplayedPhase();
      if (shown) text += `（${PHASE_KATAKANA[shown]}フェイズ）`;
    }
    // ユーザー要望（続き92）「優先権譲渡アイコンの表示は自動処理モードでは非表示でいいと
    // 思います。その代わり優先権が相手にある間はその旨を右下の『自分のターン相手の
    // ターン』表示のところに表示した方が良い気がします」。優先権譲渡アイコン
    // （#priority-transfer-buttons、turn-timer.js）を自動処理モード中は隠す代わりに、
    // 優先権がturnPlayerと一時的に食い違っている間（接触の強制移動解決中・
    // スリカエ等の割り込み処理中等）だけ、ここに一言添える。一致している間（通常の
    // ほとんどの時間）は「自分のターンです」だけで十分なため表示しない。
    if (isAutoProcessingEnabled() && state.priorityPlayer && state.priorityPlayer !== state.turnPlayer) {
      text += state.priorityPlayer === getSelfSeat() ? "（優先権はあなたにあります）" : "（優先権は相手にあります）";
    }
    statusEl.textContent = text;
  }
}

// フェイズ自動送りのON/OFFは葉モジュール（auto-phase-skip-setting.js）が持つ。ここでは
// その値を読み、変更時の副作用（ONに戻した瞬間に「することが無いフェイズ」を即スキップ
// させるための再評価）だけを購読して行う。値の所有をこのモジュールから外したのは、ボタン側
// （phase-guide.js）がphase-automation.jsをimportするとモジュール評価順が壊れて起動不能に
// なったため（auto-phase-skip-setting.js冒頭コメント参照）。
onAutoPhaseSkipChange((on) => {
  // ONに切り替えた瞬間、今いるフェイズが「することが無い」なら即スキップに入れるよう、
  // 自分の手番のロック/ハンドフェイズなら入り直して自動スキップ判定をやり直す（まだ
  // ロック/使用していなければ再入場は無害。詳細はenterPhaseの各自動スキップ分岐参照）。
  if (on && getState().turnPlayer === getSelfSeat() && (currentPhase === "lock" || currentPhase === "hand")) {
    enterPhase(currentPhase, getSelfSeat());
  }
  updateSkipButtonVisibility();
});

// --- フェイズの開始・進行 ---------------------------------------------------------------
function enterPhase(phase, player) {
  // 前のフェイズのスキップモーダルがまだ残っていれば、新しいフェイズの表示
  // （スキップモーダルであれ通常のannouncePhase()トーストであれ）とかぶらないよう
  // ここで必ず消す（詳しい経緯はdismissSkipModal()のコメント参照）。
  dismissSkipModal();
  currentPhase = phase;
  phaseOwner = player; // このフェイズがどの席のものか（ターン境界のリセット判定に使う。#19）
  if (phase === "lock") lockedIdsAtPhaseStart = getLockedTokenIds(player);
  if (phase === "move") moveActionTaken = false;

  // ユーザー要望「手札がないロックフェイズを自動でスキップしてください。その際その旨を
  // モーダルで伝えてください」。ハンドフェイズは「手札に何もない」時、ロックフェイズは
  // 「ロックできるカードが1枚も無い」時（手札はあっても、なないろの欠片だけ・
  // 既に埋まっている色しか無い等の場合を含む——ユーザー指摘、hasLockableCard参照）に、
  // 通常のフェイズ告知は出さずスキップの旨だけモーダルで伝えて次へ進む。
  // 自動スキップがOFFのときは、することが無いフェイズでも自動では飛ばさず、通常通り
  // フェイズを開始してプレイヤーの手動スキップを待つ（ユーザー要望の情報秘匿目的）。
  if (isAutoPhaseSkipEnabled()) {
    if (phase === "lock" && !hasLockableCard(player)) {
      showPhaseSkipModal("ロックできるカードが無いため、ロックフェイズを自動的にスキップしました。");
      advancePhaseAfterSkip();
      return;
    }
    // ハンドフェイズの自動スキップは、ロック済みのファースト/エターナルが使える場合は
    // 行わない（手札が空/使えなくてもロック済みのF/Eをハンドフェイズで使えるため。
    // ユーザー指摘、hasUsableLockedFirstOrEternal参照）。
    if (phase === "hand" && !hasUsableLockedFirstOrEternal(player)) {
      if (handIsEmpty(player)) {
        showPhaseSkipModal("手札が無いため、ハンドフェイズを自動的にスキップしました。");
        advancePhaseAfterSkip();
        return;
      }
      if (handHasOnlyReactiveOnlyCards(player)) {
        showPhaseSkipModal("手札の効果は反応時にしか使えないため、ハンドフェイズを自動的にスキップしました。");
        advancePhaseAfterSkip();
        return;
      }
      // 手札はあるが、どれも今は使えない（追色コスト不足・ザ・ギャンブルで捨てる手札が
      // 無い等）場合も自動スキップする。反応時専用だけの場合は上で専用文言を出している
      // ため、ここはそれ以外の「使えない」ケース向けの一般的な文言にする。
      if (handHasNoUsableCards(player)) {
        showPhaseSkipModal("今使える手札効果が無いため、ハンドフェイズを自動的にスキップしました。");
        advancePhaseAfterSkip();
        return;
      }
    }
  }

  announcePhase(phase);
  updatePhaseGuideGlow();
  broadcastMyPhase(); // 相手の案内板にも自分のフェイズを反映（オンライン時のみ）
  updateSkipButtonVisibility();
  if (phase === "lock") updateLockPhaseHandHighlight(player);
  else clearLockHandHighlight();
  if (phase === "move") reconcileMovePhase(player);
}

function advancePhase() {
  const idx = PHASES.indexOf(currentPhase);
  if (idx === -1 || idx === PHASES.length - 1) return;
  // ローカルCPU戦ではCPU(C)のフェイズも進めるため、自分の席固定ではなく駆動対象席へ進める
  // （通常プレイでは getAutoDriveSeat() は自分の席を返すので従来通り）。
  enterPhase(PHASES[idx + 1], getAutoDriveSeat());
}

// なないろの巨光・スラム上がりの役人・ザ・ギャンブルの手札効果「このフェイズを
// 終了する。」用。カード効果側から強制的に次のフェイズへ進める（通常の
// reconcilePhaseAutomation()による「手札が空になったら」等の自然な進行を待たず、
// 即座に終了する）。
export function forceEndCurrentPhase() {
  advancePhase();
}

function clearPhase() {
  if (currentPhase === null) return;
  currentPhase = null;
  phaseOwner = null;
  broadcastMyPhase(); // 自分のフェイズが終わった（＝手番が移る）ことを相手の案内板へも反映
  updatePhaseGuideGlow();
  updateSkipButtonVisibility();
  clearMovableHighlights();
  clearLockHandHighlight();
}

// render()のたびに呼ばれ、今のフェイズで「もう次へ進めるか」を判定する。
// カード効果自動処理と同じ「呼び出し元(main.js)がrender()の末尾で毎回呼ぶ」設計
// （remote-move-animator.jsのreapplyActiveHighlights等と同じ考え方）。
export function reconcilePhaseAutomation() {
  // 続き76の修正: 以前はupdateSkipButtonVisibility()（スキップボタン/「自分の
  // ターンです」表示の更新）がclearPhase()の中、それも「currentPhaseが既に
  // nullでない時だけ」という早期returnの内側からしか呼ばれていなかったため、
  // 一度も自動処理が有効化されないまま（＝shouldBeActiveが最初からずっとfalseの
  // まま）の対局では、この2つのDOM要素自体が一度も生成されず、「自分のターンです/
  // 相手のターンです」がどのプレイヤーの画面にも一切表示されないままになっていた。
  // render()のたびに呼ばれるこの関数の先頭で、shouldBeActiveの判定に関係なく
  // 毎回呼び直すようにする（軽量なDOM表示切り替えのみのため負荷は無視できる）。
  updateSkipButtonVisibility();
  // ユーザー報告#9「エターナル演出が始まると同時くらいに次のターンへ移ってしまう。演出を
  // 最後まで見てから移行すべき」。ゲート侵攻の一連の演出（手札奪取→エターナル獲得→帰還）は
  // gate-invasion-modal.jsのキューで再生され、その間 isGateInvasionQueueActive() が true になる。
  // ターンはサーバー側で侵攻とまとめて進むため、演出中に既に turnPlayer が次の人になっている
  // ことがあり、その状態でフェイズ自動進行を回すと、演出が終わる前に次のターンのロック/移動
  // 自動処理（＝実質的な「ターンが移った」挙動）が始まってしまう。演出キューが空になるまでは
  // フェイズ自動進行を進めない（clearPhase()はせず、そのまま待つだけにして表示のちらつきを避ける）。
  if (isGateInvasionQueueActive()) return;
  // ローカルCPU戦ではCPU(C)の番も駆動対象にする（それ以外は自分の席）。
  const player = getAutoDriveSeat();
  // ユーザー報告（続き86）「勝利後、まだ盤面のタイマーが止まらず自動処理が継続
  // されてしまっている」。誰かが既に勝利していれば、以後のフェイズ自動進行
  // （ロック/移動の自動ハイライト・自動ドロー・自動ターン終了等）は一切不要
  // なため、以降は完全に停止する。
  // 観戦者は読み取り専用（座席を持たず操作もしない）ため、フェイズ自動処理は一切走らせない。
  const shouldBeActive = !hasAnyoneWon() && !isSpectatingGame() && isAutoProcessingEnabled() && getState().turnPlayer === player;
  if (!shouldBeActive) {
    clearPhase();
    return;
  }
  // 不具合#19: ローカルCPU戦ではA/C両方の席を駆動するため shouldBeActive が常にtrueになり、
  // 「相手の番の間にshouldBeActive=falseでclearPhaseされる」という通常のターン境界リセットが
  // 起きない。その結果、前のターンのcurrentPhase（例:"move"＋moveActionTaken）が残ったまま
  // 次のターンに入り、computeShouldEmphasizeが即trueになって延々とターンが自動終了し続けて
  // いた。フェイズの持ち主(phaseOwner)が今の駆動対象(player)と食い違っていたら、新しいターンの
  // 先頭としてリセットする（通常プレイではplayerは常に自分なので発火せず無害）。
  if (currentPhase !== null && phaseOwner !== null && phaseOwner !== player) {
    clearPhase();
  }
  if (currentPhase === null) {
    // 「○○のターン」トースト・「スタートプレイヤー決定」モーダル表示中はフェイズ開始
    // （LOCKフェイズ告知）を待たせる。setTurnAnnounceActive(false)/
    // setSetupRevealActive(false)で改めてreconcilePhaseAutomation()が呼ばれるので、
    // 表示が消え次第ここに戻ってくる。
    if (turnAnnounceActive || setupRevealActive) return;
    enterPhase("lock", player);
    return;
  }
  if (currentPhase === "lock") {
    // 開始時に無かった新しいロックidが1枚でも増えていれば（＝このフェイズで新規にロック
    // した）次へ進む。枚数比較ではなくid集合の差分で見るのは、ゴメンナサイで別の1枚を
    // 同時に奪われても「新しくロックした」事実を取りこぼさないため（上のlockedIdsAtPhaseStart
    // コメント参照）。
    const nowLocked = getLockedTokenIds(player);
    let placedNewLock = false;
    for (const id of nowLocked) {
      if (!lockedIdsAtPhaseStart.has(id)) {
        placedNewLock = true;
        break;
      }
    }
    if (placedNewLock) {
      advancePhase();
      return;
    }
    // render()のたびにハンドエリアのDOMが作り直されるため、ハイライトも毎回再適用する
    // （reconcileMovePhaseがマスハイライトを毎回再適用しているのと同じ考え方）。
    updateLockPhaseHandHighlight(player);
    return;
  }
  if (currentPhase === "hand") {
    // ユーザー報告「手札があるのにハンドフェイズが飛ばされました」の修正。以前は
    // hasUsableHandEffect()（DSL構造化データを持つカードだけ）を見て自動スキップ
    // していたが、まだDSL化されていない手札効果カードを見落として飛ばしてしまう
    // バグだった。手札が空になった（コスト等で使い切った）場合だけ自動で進み、
    // それ以外はスキップボタン（手動）を待つ。ユーザー報告「手札にカウンターロック
    // のみ持っていて使えるカードがないのにムーブフェイズへ自動で移行しなかった」への
    // 対応で、反応時専用カードだけが残った場合（handHasOnlyReactiveOnlyCards）も
    // 同様に自動で進める。
    if (
      isAutoPhaseSkipEnabled() &&
      !handEffectBusy &&
      !skipTransitionPending &&
      !hasUsableLockedFirstOrEternal(player) &&
      (handIsEmpty(player) || handHasNoUsableCards(player))
    )
      advancePhase();
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
  document.body.classList.remove("phase-move-picking");
}

function reconcileMovePhase(player) {
  if (performingFallback || moveActionTaken || awaitingFallbackPick) return;
  const piece = getSelfPiece(player);
  if (!piece || piece.location.zone !== "cell") return;
  // ユーザー指摘「紫のキューブ ディメンションの効果文『通常の移動』とはムーブ
  // フェイズで通常行う移動のこと。ジャンプ台みたいに２マス先がハイライトされて
  // いなければならない」。isMovementBoostActiveThisTurn（card-effect-engine.js、
  // ANNOUNCE_MOVEMENT_BOOST_THIS_TURN）が立っている間だけ、通常の1マス隣接
  // （count:1・atOnce:false）ではなくジャンプ台と同じ2マス先・一気に（count:2・
  // atOnce:true）で候補を計算する。接触の対象範囲（隣接のみ）はこの効果の対象外
  // （効果文はあくまで「移動」についてであり「接触」ではないため）。
  const boosted = isMovementBoostActiveThisTurn(player);
  // マルメゴで橙が出た時の「このターン移動できない」を強制する（不具合#57）。移動候補を空にして
  // ハイライトを出さず（＝タップ移動も発火しない）、下の手動ドラッグ移動もmain.js側で弾く。
  // 接触は禁止しない（効果文は移動のみ）ので contactCandidates はそのまま計算する。移動候補も
  // 接触相手も無い場合は既存のフォールバック（隣へ山札から1枚裏向きに置く＝「移動先が無い」時と
  // 同じ扱い、ルール上も妥当）が働く。
  const moveCandidates = isMovementDisabledThisTurn(player) ? [] : getMoveCandidates(piece.location, boosted ? 2 : 1, boosted);
  const contactCandidates = getContactableCells(piece.location, player);
  clearMovableHighlights();
  // ユーザー要望「移動先ハイライト時、範囲外のトーンを落としてほしい。ジャンプ台の時と
  // 同じように」。card-effect-picking-cellsと同じ「候補以外を暗くする」bodyクラスを流用する。
  document.body.classList.toggle("phase-move-picking", moveCandidates.length > 0 || contactCandidates.length > 0);
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
    if (emptyCells.length > 0) {
      // ユーザー要望（ルール修正）: 移動先も接触相手も無い場合は「隣の任意の1マスへ山札から
      // 1枚“裏向き”に置く」。従来は先頭マスへ自動配置＋表向き公開だったが、正しくは
      // プレイヤー自身が置き先マスを選び、中身は誰にも分からない裏向きにする。候補が1つ
      // だけなら選ばせる必要はないのでそのまま置く。reconcileMovePhaseは繰り返し呼ばれるため
      // awaitingFallbackPickでピック中の再入を防ぐ（fire-and-forget）。
      if (emptyCells.length === 1 || !pickLocationHelper) {
        performMoveFallbackAndEndTurn(player, emptyCells[0]);
      } else {
        awaitingFallbackPick = true;
        Promise.resolve()
          .then(async () => {
            const dest = await pickLocationHelper(
              emptyCells,
              "移動先も接触相手もありません。山札から裏向きに1枚置くマスを選んでください"
            );
            if (dest) await performMoveFallbackAndEndTurn(player, dest);
          })
          .catch((err) => console.error("move fallback pick failed", err))
          .finally(() => {
            awaitingFallbackPick = false;
          });
      }
    }
  }
}

async function performMoveFallbackAndEndTurn(player, location) {
  performingFallback = true;
  try {
    // ルール修正（ユーザー要望）: マスに置いたカードは“裏向き”のまま＝中身は誰にも
    // 分からない。マスへの配置はstate.jsのfaceUpForLocationにより既定で裏向きになるため、
    // 以前あったflipToken（表向きにする）とannounceHandPickups（中身を全員へ公開）は行わない。
    if (isOnlineMode()) {
      try {
        await drawFromPile("deck", location);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("performMoveFallbackAndEndTurn failed", err);
        renderHelper?.();
        return;
      }
    } else {
      drawFromPile("deck", location);
    }
    playSound("cardPlace");
    renderHelper?.();
    // ユーザー報告（続き95）「優先権が相手から自分に戻らない」の原因調査で判明:
    // nextTurn()はturnPlayerを次のプレイヤーへ進めるだけで、priorityPlayerには一切
    // 触れない（state.jsのNEXT_TURNリデューサー参照）。priorityPlayerを新しい
    // turnPlayerへ合わせる処理は本来turn-timer.js側のhandleTurnTransition
    // （state.turnPlayerの変化を検知して実行）に委ねられているが、オンライン中は
    // 「次の手番になる本人のクライアントだけが送信する」設計（複数クライアントの
    // 二重送信を避けるため）になっている。そのため、本人のブラウザがバックグラウンド
    // タブになっていて処理が一時的に遅れている・届いていない間は、priorityPlayerが
    // 古いプレイヤーのまま取り残されてしまう窓ができていた（このムーブフェイズの
    // 「移動/接触候補が無い→山札から1枚置いてターン終了」というルール上の救済
    // フォールバックは、これを実行した「元のturnPlayer」自身のクライアント上でしか
    // 走らないため、次のturnPlayer本人のクライアントの状態に一切依存せずここで
    // 完結させておきたい）。次のturnPlayerをNEXT_TURNリデューサーと同じSEAT_ORDER
    // 基準で自前に計算し、このフォールバックを実行した（＝確実に動いている）
    // クライアント自身から直接setPriorityStateを送っておくことで、その窓を埋める
    // （下のensureSkipButtonの15秒回復と同じ「turn-timer.js側の関数は循環import
    // （turn-timer.js→main.js→phase-automation.js）になるため呼べず、state.jsの
    // setPriorityStateを直接呼ぶ」パターン）。
    const priorityPlayerBeforeEnd = getState().priorityPlayer;
    if (priorityPlayerBeforeEnd) {
      const activePlayers = getState().activePlayers;
      const order = SEAT_ORDER.filter((p) => activePlayers.includes(p));
      const idx = order.indexOf(player);
      const nextPlayer = idx === -1 ? null : order[(idx + 1) % order.length];
      if (nextPlayer) {
        const target = isPseudoCpuTarget(nextPlayer);
        logAction("diag-pseudo-cpu", { phase: "performMoveFallbackAndEndTurn", nextPlayer, isPseudoCpuModeActive: isPseudoCpuModeActive(), isPseudoCpuTarget: target });
        const recoveryMs = target ? getPseudoCpuDeadlineMs() : 15000;
        setPriorityState({ player: nextPlayer, deadline: Date.now() + recoveryMs, phase: "base" });
      }
    }
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
