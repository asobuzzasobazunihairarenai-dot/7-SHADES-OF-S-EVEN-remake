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
// オンライン対戦でも優先権状態（誰の優先権か・残り砂時計数）はso7_gamesへ直接同期される
// （state.jsのsetPriorityState/online.jsのupdatePriorityState参照）。基本時間・延長時間等の
// パラメータは対局開始時に部屋作成者の設定で全員共通に固定される（不公平にならないよう、
// online.jsのstartGame()が送るtimerConfig参照）。

import { getState, subscribe, setPriorityState, isOnlineMode } from "./state.js";
import {
  toStageLocalRect,
  STAGE_WIDTH,
  performPriorityTimeoutAutoAction,
  isAnyEffectProcessingBusy,
  hasActiveEffectPicker,
  updateEndTurnButton,
  syncCpuStepHint,
} from "./main.js";
import { SEAT_ORDER, SEAT_TO_SIDE, getRotationSteps, rotateSide } from "./board-layout.js";
import { getSelfSeat, getSyncedTimerConfig, getCurrentGameId, fetchAndHydrate, isSpectatingGame, isRankedGame } from "./online.js";
// フェイズ自動処理の再評価（phase-automation.js）。本来はrender()のたびに呼ばれるが、
// パーティー等の「全員がそれぞれ選ぶ」効果は非同期の委任で完了し、その完了が必ずしも
// render()を伴わない。すると優先権やフェイズが変わっても再評価されず、
//  ・ターン状態表示が取り残される（#5「タイマーは相手に移ったのに『優先権はあなたに』のまま」）
//  ・処理が終わったのにターンの自動終了が起きない（#5続報）
// といった食い違いが起きる。タイマーと同じtickでも再評価を回して確実に追いつく。
// reconcilePhaseAutomation自体が「render()のたびに何度呼ばれてもよい」冪等な設計
// （自動アクションは実行済みガード付き）なので、tick頻度で呼んでも安全。
// turn-timer.jsとphase-automation.jsは互いにimportしていない（片方向のみ）ため循環参照は起きない。
import { reconcilePhaseAutomation, isSetupRevealActive } from "./phase-automation.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { consumeLastActionInfo } from "./last-action-info.js";
import { applyAvatarContent } from "./avatar-render.js";
import {
  isTurnTimerEnabled as isTurnTimerEnabledLocal,
  getInitialHourglassStock as getInitialHourglassStockLocal,
  getMaxHourglassStock as getMaxHourglassStockLocal,
  getRopeBaseSeconds as getRopeBaseSecondsLocal,
  getRopeExtensionSeconds as getRopeExtensionSecondsLocal,
  getTurnsToReplenishHourglass as getTurnsToReplenishHourglassLocal,
  getReducedBaseSeconds as getReducedBaseSecondsLocal,
  isPseudoCpuModeEnabled as isPseudoCpuModeEnabledLocal,
  isPseudoCpuIncludeSelf,
  getPseudoCpuDeadlineMs,
} from "./admin.js";
import { isOpponentBaseTimerVisible } from "./motion-prefs.js";
import { toggleTimerTogglePopover } from "./timer-toggle.js";
import { hasAnyoneWon } from "./victory.js";
import { isCpuBattleActive, getCpuStepDeadlineMs, isSelfCpuSubstituted, recordSelfTimeout } from "./cpu-battle-state.js";
import { isAutoProcessingEnabled } from "./card-effect-engine.js";
import { logAction } from "./action-log.js";

// オンライン対戦中は、ゲーム開始時に固定された対局全体共通の設定（timer_config、
// 部屋作成者のその時点のローカル設定を1回だけ書き込んだもの）を優先する——プレイヤーごとに
// 異なる基本時間・砂時計数だと不公平になるため。ローカルモード、またはオンラインでもまだ
// 対局が始まっていない間は、従来通り自分のadmin.jsのローカル設定を使う（getPlayerName等が
// 既に使っている「オンラインなら同期値優先、無ければローカル値」というこのプロジェクト
// 共通のパターンを踏襲）。
// export: オンラインスモーク監視（smoke-test-runner.js）が「この部屋はタイマーが有効か
// （＝自動プレイが進む前提を満たすか）」を判定するのに使う。
export function isTurnTimerEnabled() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? !!synced.enabled : isTurnTimerEnabledLocal();
}
function getInitialHourglassStock() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? synced.initialHourglassStock : getInitialHourglassStockLocal();
}
function getMaxHourglassStock() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? synced.maxHourglassStock : getMaxHourglassStockLocal();
}
function getRopeBaseSeconds() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? synced.ropeBaseSeconds : getRopeBaseSecondsLocal();
}
function getRopeExtensionSeconds() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? synced.ropeExtensionSeconds : getRopeExtensionSecondsLocal();
}
function getTurnsToReplenishHourglass() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? synced.turnsToReplenishHourglass : getTurnsToReplenishHourglassLocal();
}
function getReducedBaseSeconds() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? synced.reducedBaseSeconds : getReducedBaseSecondsLocal();
}
// ユーザー報告（続き101）「疑似CPUモードを開始しても相手に反映されない」への対応。
// 続き98の「有効化した瞬間にRealtime Broadcastで他クライアントへ伝える」設計は
// 実機テストで反映されないケースがあり信頼できないと判明した。timerEnabled等と
// 同じ「部屋作成者が『ゲームを開始する』を押した瞬間の設定を対局全体の固定値として
// 使う」既存の確実な仕組みに乗せる（online.jsのstartGame()参照）。「自分も含める」
// (isPseudoCpuIncludeSelf)は引き続き各クライアント自身のローカル設定のまま
// （対局中いつでも自由に変更できる、個人の選択のため同期しない）。
function isPseudoCpuModeActive() {
  const synced = isOnlineMode() && getSyncedTimerConfig();
  return synced ? !!synced.pseudoCpuModeEnabled : isPseudoCpuModeEnabledLocal();
}

// オンライン中、MOVE_TOKEN等の「本物のゲーム操作」だけを優先権保持者の行動とみなす
// （SET_PRIORITY_STATE自身やターン交代アクションは対象外）。DRAW_FROM_MY_DECKは
// マイデッキ戦（ランク戦含む）の「ロックする代わりにマイデッキから1枚引く」——これも
// 意思決定を伴う行動なので回復対象に含める（ユーザー要望2026-08-16）。ローカルモードは
// そもそもactionType判定を通らない（下のonStateChange参照）ため元から回復対象。
const REAL_ACTION_TYPES = new Set(["MOVE_TOKEN", "DRAW_FROM_PILE", "FLIP_TOKEN", "SEND_TOKEN_TO_PILE", "DRAW_FROM_MY_DECK"]);

// 「何かアクション」時の回復量（秒）。ユーザー確定仕様2026-08-16。
const ACTION_RECOVERY_SECONDS = 20;

let baseClockEl = null; // フェイズ案内板の中に出す、基本時間の残り秒数表示（常時表示、カウント中でない時は自分の砂時計残数の表示に切り替わる）
let baseClockLabelEl = null;
let baseClockHourglassIconEl = null;
let baseClockHourglassCountEl = null;
let ropeEl = null; // 画面中央のロープ本体（延長中だけ表示）
let ropeStrandEl = null;
let ropeTipEl = null;
let ropeHourglassCountEl = null;
let ropeHourglassIconEl = null;
let warningEl = null;
let priorityReturnWarningEl = null; // 手番でない座席が優先権を持ったままタイムオーバーした時の警告
let transferButtonsEl = null;
let transferModalBackdrop = null;
let transferModalEl = null;

let prevTurnPlayer = null;

// オンライン中、ターン交代の瞬間（state.turnPlayerが変わった瞬間）から、それに対応する
// priorityPlayerの更新（次の手番になる本人のクライアントが書き込み、ブロードキャストが
// 一往復する分のラグがある）がサーバーから届くまでの間、まだ「前のターンプレイヤー用の
// 古いpriorityPlayer/priorityDeadline」しか見えていない一時的な窓ができる
// （ユーザー報告バグの根本原因: この窓の間にtick()や本人行動の判定が古い値を見て動作
// してしまうと、「相手のターンなのに自分の基本時間が減る」「たまに相手にだけロープが
// 表示される」といった不整合になる）。この変数がnullでない間は、tick()・onStateChangeの
// 双方が「新しいturnPlayerに一致するpriorityPlayerが届くまでは何もしない」よう待機する。
let awaitingPriorityForTurnPlayer = null;

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

// 自分自身が発行したdispatch（setPriorityState）による通知で、onStateChangeが無限に
// 再入しないようにする再入防止フラグ（remote-move-animator.jsのskipNextHydrateDiffと
// 同じ考え方）。ローカルモードのdispatch()は同期的なので有効に機能するが、オンライン中の
// setPriorityStateは非同期（サーバー往復あり）のため、このフラグ自体はオンライン側の
// 保護には寄与しない——オンライン側は代わりにonStateChange内のactorSeat/actionType判定で
// 自分自身の書き込みの「こだま」を正しく扱う（REAL_ACTION_TYPESに含まれないため自然に
// 除外される）。
let applyingOwnUpdate = false;
function withGuard(fn) {
  applyingOwnUpdate = true;
  try {
    fireAndForget(fn());
  } finally {
    applyingOwnUpdate = false;
  }
}

// オンライン中のsetPriorityStateはPromiseを返す（callAction等と同じ非同期の書き込み）。
// version_conflict等の失敗は、他クライアントが同じ結論に先に到達しただけなので無視して
// よい（決定的な再計算のため、次のtick/onStateChangeで自然に収束する）。ローカルモードでは
// setPriorityStateがundefinedを返すだけなので、Promise.resolve()でラップしても無害。
function fireAndForget(maybePromise) {
  Promise.resolve(maybePromise).catch(() => {});
}

// ユーザー要望（続き97）「疑似的に1秒でタイムアウトするようにする疑似CPUモード」。
// 自動選択(performPriorityTimeoutAutoAction)のテスト用に、対象座席の基本時間を
// 常に1秒・砂時計を常に0個扱いにして、優先権のタイムアウトを疑似的に即発生させる。
// デフォルトの対象は「自分以外」（ユーザー確認済み）——ローカルモードでは自分(A)
// 以外の座席が自動で進み、自分の番だけ手動操作できる。「自分も含める」をONにすると
// 自分の番も含めて全座席が自動進行し、対局を最初から最後まで観戦に徹することができる。
// オンライン中は、この設定自体はこのクライアントのローカル値のまま（他のターン
// タイマー設定と違いsyncしない）で、performPriorityTimeoutAutoAction()自体が
// 「本人（getSelfSeat()===priorityPlayer）のクライアント上でだけ実行される」という
// 既存の制約（updateTimeoutWarnings参照）を受けるため、実際に効果があるのは
// 「自分も含める」がONの時の自分自身の番だけになる（他人の座席を勝手に自動操作
// することはできない、という既存のセキュリティ上の制約はそのまま維持される）。
// 疑似CPUの基本時間はオプションで可変（admin.jsのgetPseudoCpuDeadlineMs、既定1000ms）。
// ユーザー要望（続き104）「疑似CPUモードでロックフェイズも自動でロックするようにして、
// 本当に対戦終了まで自動で行けるようにする」。main.js側のperformPriorityTimeoutAutoAction
// （ロックフェイズのタイムアウト処理）から同じ判定を使えるようexportする（main.js⇄
// turn-timer.jsは既に双方向importが確立済み——main.jsはtransferPriorityTo等を、
// turn-timer.jsはperformPriorityTimeoutAutoAction等をお互いにimportしている）。
export function isPseudoCpuTarget(seat) {
  if (!isPseudoCpuModeActive()) return false;
  return isPseudoCpuIncludeSelf() || seat !== getSelfSeat();
}

// その座席が既に砂時計を使い始めている（＝そのターン中に1個でも正式消費している）場合は、
// 行動で得られる基本時間の窓を短く抑える（デフォルト上限10秒、管理者モードで調整可）。
// まだ使っていなければ通常の基本時間をまるまる与える。
function freshBaseDeadlineFor(seat) {
  // ユーザー要望（続き102）「疑似CPUモードが適用されない原因をアクションログで
  // 確認できるようにしてほしい」。優先権が渡る/基本時間を仕切り直すたびに（tick()の
  // 200ms間隔とは違い、この関数自体は実際にターンや優先権が変わった時だけ呼ばれる
  // ため、ログが埋まる心配は無い）、疑似CPU判定に関わる値を全部まとめて記録する。
  // これで「サーバーから届いた値」「有効/無効の最終判定」「自分の座席かどうか」の
  // どこで意図と食い違っているかが後から追える。
  // AFK代行中の自席は、CPUがすぐ指せるよう短い持ち時間にする（疑似CPUと同じ持ち時間。
  // ユーザー要望2026-08-08）。オンラインでも自分の席だけが対象。
  if (isSelfCpuSubstituted() && seat === getSelfSeat()) {
    return Date.now() + getPseudoCpuDeadlineMs();
  }
  const target = isPseudoCpuTarget(seat);
  // 以前ここに診断ログ(diag-pseudo-cpu freshBaseDeadlineFor)を毎回出していたが、頻度が高く
  // 行動ログのリングバッファ(300件)を埋め尽くして、ゲーム画面の行動ログが「まだ記録が
  // ありません」になる原因になっていた（ユーザー報告）。調査目的は済んだので削除する。
  if (target) {
    // CPU戦（ローカル1人用）では、CPUの1手ごとの持ち時間を「CPUの速さ」設定から取る
    // （ゆっくり／普通／早い。ユーザー要望「CPUが速すぎてモーダルが読めない」）。それ以外
    // （オンラインの疑似CPU等）は従来通り getPseudoCpuDeadlineMs()。
    const ms = isCpuBattleActive() && !isOnlineMode() ? getCpuStepDeadlineMs() : getPseudoCpuDeadlineMs();
    return Date.now() + ms;
  }
  // #125（ユーザー要望2026-08-16）「相手のパーティの到達効果などで自分に優先権が移るとき
  // 基本時間30秒から始まるようにしてほしい」。freshBaseDeadlineForは、ターン開始・優先権
  // 譲渡（transferPriorityTo）といった「新しい持ち時間を与える」grant経路で使われる。以前は
  // hourglassUsedThisTurnがtrueの席には短縮上限（reducedBaseSeconds=10秒）を適用していたが、
  // 続き130の新しい回復モデル（行動で基本時間に+20 or ロープに+20）では「砂時計を使い始めた
  // 後は基本時間を短縮する」という旧概念自体が行動回復側に置き換わっており、grant経路まで
  // 短縮する必要はもう無い。譲渡された優先権も常に満額の基本時間から始める（getReducedBaseSeconds
  // の管理者スライダーは無害なので残置するが、この経路では参照しない）。
  return Date.now() + getRopeBaseSeconds() * 1000;
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

// 「何かアクション」時の回復（ユーザー確定仕様2026-08-16）。
//  ・ロープ未出現（そのターンまだ砂時計を使い始めていない = hourglassUsedThisTurn=false）:
//      基本時間の残りに +20秒。ただし上限は基本時間の初期値（ropeBaseSeconds、既定30秒）。
//      ＝残りが多い時は30秒で頭打ち、少ない時は+20秒される。
//  ・ロープ出現後（hourglassUsedThisTurn=true）:
//      基本時間はもう回復しない（凍結）。代わりにロープ（延長）の残りに +20秒。上限は
//      延長の満タン（ropeExtensionSeconds、既定30秒）。砂時計は減らさない（＝アクションで
//      ロープを保たせる／持ち越しではなく現在のロープを継ぎ足す）。砂時計が尽きている
//      （stock<=0）場合はもう回復できない（タイムアウトのまま）。
// 砂時計の消費（ロープが行動なく燃え尽きたら1個）・補充（3ターン無消費で+1）は従来のまま。
function applyActionRecovery(state) {
  const seat = state.priorityPlayer;
  if (!seat) return;
  // 疑似CPU/AFK代行席は、行動しても短い持ち時間のまま（すぐ次の自動手へ）。
  // freshBaseDeadlineForがこれらの席に短い値（getPseudoCpuDeadlineMs/getCpuStepDeadlineMs）を返す。
  if (isPseudoCpuTarget(seat) || (isSelfCpuSubstituted() && seat === getSelfSeat())) {
    withGuard(() => setPriorityState({ deadline: freshBaseDeadlineFor(seat), phase: "base" }));
    return;
  }
  const now = Date.now();
  if (!hourglassUsedThisTurn[seat]) {
    // ロープ未出現: 基本時間を追加回復（上限 = 基本時間の初期値）。
    const capMs = getRopeBaseSeconds() * 1000;
    const leftMs = state.priorityDeadline - now;
    const newMs = Math.min(leftMs + ACTION_RECOVERY_SECONDS * 1000, capMs);
    // player は含めない（保持者は変えない。onStateChange/tickの書き込みコメント参照）。
    withGuard(() => setPriorityState({ deadline: now + newMs, phase: "base" }));
  } else {
    // ロープ出現後: 基本時間は凍結、ロープを追加回復（上限 = 延長の満タン）。砂時計残0なら回復不可。
    const stock = state.hourglassStock[seat] ?? 0;
    if (stock <= 0) return;
    const capMs = getRopeExtensionSeconds() * 1000;
    // 今ロープが燃えている（phase extension）ならその残りに加算、そうでなければ0から。
    const leftMs = state.priorityPhase === "extension" ? Math.max(0, state.priorityDeadline - now) : 0;
    const newMs = Math.min(leftMs + ACTION_RECOVERY_SECONDS * 1000, capMs);
    withGuard(() => setPriorityState({ deadline: now + newMs, phase: "extension" }));
  }
}

// カード効果の意思決定（色宣言・選択肢の確定など、盤面dispatchを伴わない純粋な選択）を
// プレイヤーが行った時に、外部（main.js）から呼んでもらう回復フック。onStateChangeの
// dispatch経路（MOVE_TOKEN等）と同じapplyActionRecoveryを共有する。「1つの意思決定が
// 確定した時に1回だけ」呼ぶこと（複数選択の途中クリックごとには呼ばない＝無限回復防止。
// マス/手札/奪う手札の複数選択はここではなく実際のdispatchで回復するので、こちらには
// 付けない）。
export function notifyPlayerDecision() {
  if (!isTurnTimerEnabled()) return;
  const state = getState();
  if (!state.priorityPlayer) return;
  // オンライン中は優先権保持者本人のクライアントだけが書き込む（onStateChangeと同じ方針）。
  if (isOnlineMode() && getSelfSeat() !== state.priorityPlayer) return;
  // 疑似CPU/CPU/AFK代行席は、この「意思決定・フェイズ移行時の追加回復」を行わない。これらの
  // ボット席にとって「持ち時間の残り」＝次の自動手までの思考時間であり、回復は人間のための
  // 便宜。フェイズ移行（特に空フェイズの自動スキップ）や意思決定のたびに締切を新しい持ち時間へ
  // リセットすると、ボットが1手ごとに余分に待たされて極端に遅くなる（スモークテストが7ターンで
  // 150秒タイムアウトする原因＝続き131でこの回復を追加した副作用）。1手ごとのペース配分は
  // onStateChange（実際のdispatch）側のapplyActionRecoveryが担うので、こちらの追加回復は
  // ボットにはスキップしてよい（人間プレイヤーの回復挙動は従来通り）。
  const seat = state.priorityPlayer;
  if (isPseudoCpuTarget(seat) || (isSelfCpuSubstituted() && seat === getSelfSeat())) return;
  applyActionRecovery(state);
}

// ターンプレイヤーの交代（ゲーム開始時のnull→非nullも含む）を検知した時の処理。
// hourglassUsedThisTurn/turnsWithoutHourglass/pausedExtensionRemainingMsはタブごとの
// ローカル変数のため、全クライアントが同じ順序で同じonStateChangeを処理する限り自然に
// 一致し続ける——ローカルの簿記自体は全クライアントで行うが、サーバーへの実際の送信は
// 「次の手番になる本人」のクライアントだけが担当する（オンライン中、複数クライアントが
// 同時に送信して無駄な書き込みが重なるのを防ぐ。次に自分がこの座席の担当になった時の
// ために、送信しないクライアントも同じ計算は続けておく必要がある）。
function handleTurnTransition(prevPlayer, nextPlayer, activePlayers) {
  let patch = null;
  if (prevPlayer === null && nextPlayer !== null) {
    // ゲーム開始。参加座席全員の砂時計を初期値にし、優先権をスタートプレイヤーへ渡す
    // （基本時間から開始、ロープは非表示）。
    const hourglassStock = {};
    for (const seat of activePlayers) {
      hourglassUsedThisTurn[seat] = false;
      turnsWithoutHourglass[seat] = 0;
      pausedExtensionRemainingMs[seat] = null;
      hourglassStock[seat] = getInitialHourglassStock();
    }
    patch = { hourglassStock, player: nextPlayer, deadline: freshBaseDeadlineFor(nextPlayer), phase: "base" };
  } else if (prevPlayer !== null && nextPlayer !== null && prevPlayer !== nextPlayer) {
    // 通常のターン交代。離れる座席が「そのターン中に一度も砂時計を正式に消費しなかったか」
    // を評価し、3ターン（管理者モードで調整可）連続なら砂時計を1個補充する。
    // ハマりどころ（ユーザー報告「ターンをもらうとき基本時間が10秒からスタートすることが
    // ある」）: 新しいターンプレイヤーの「基本時間短縮」フラグのリセット
    // (hourglassUsedThisTurn[nextPlayer] = false)を、以前はfreshBaseDeadlineFor(nextPlayer)
    // の呼び出しより後に行っていた。nextPlayerが自分の前回のターンで既に砂時計を使い始めて
    // いた場合、このフラグは次に自分のターンが回ってくるまでtrueのまま残り続けるため、
    // リセット前にfreshBaseDeadlineForを呼ぶと古いtrueを見て短縮された基本時間
    // （デフォルト上限10秒）を返してしまっていた。フラグのリセットをdeadline計算より
    // 先に行うよう順序を入れ替えて修正した。
    hourglassUsedThisTurn[nextPlayer] = false;
    pausedExtensionRemainingMs[nextPlayer] = null;
    patch = { player: nextPlayer, deadline: freshBaseDeadlineFor(nextPlayer), phase: "base" };
    if (!hourglassUsedThisTurn[prevPlayer]) {
      turnsWithoutHourglass[prevPlayer] = (turnsWithoutHourglass[prevPlayer] ?? 0) + 1;
      if (turnsWithoutHourglass[prevPlayer] >= getTurnsToReplenishHourglass()) {
        turnsWithoutHourglass[prevPlayer] = 0;
        const current = getState().hourglassStock[prevPlayer] ?? 0;
        const next = Math.min(getMaxHourglassStock(), current + 1);
        if (next !== current) patch.hourglassStock = { [prevPlayer]: next }; // 差分のみ（全置換しない）
      }
    } else {
      turnsWithoutHourglass[prevPlayer] = 0;
    }
  }
  if (!patch) return;
  if (isOnlineMode() && getSelfSeat() !== nextPlayer) return; // 送信は次の手番になる本人だけ
  withGuard(() => setPriorityState(patch));
}

function onStateChange(state) {
  if (applyingOwnUpdate) return;
  if (!isTurnTimerEnabled()) return;
  // セットアップ完了（スタートプレイヤー告知が閉じる）までは、turnPlayerが確定していても
  // タイマーを初期化しない（ユーザー要望2026-08-11「セットアップが完全に完了してから
  // タイマースタート」）。完了後は tick() の ensureInitializedIfNeeded() が新鮮な持ち時間で
  // 起動する。ここで初期化してしまうと、告知が閉じるまでの数秒〜8秒が持ち時間から削られる。
  if (isSetupRevealActive()) return;
  const tp = state.turnPlayer;
  if (tp !== prevTurnPlayer) {
    if (prevTurnPlayer === null && state.priorityPlayer) {
      // 他のクライアントが既にこのゲームの優先権システムを初期化済み。このタブの
      // prevTurnPlayerがnullなのは、対局途中でリロード/再参加してモジュールが今
      // 読み込まれたばかりだからで、本当のゲーム開始ではない——ローカルの追跡変数だけ
      // 合わせ、進行中の砂時計残数を勝手に初期値へ巻き戻すような再初期化はしない。
      prevTurnPlayer = tp;
      return;
    }
    handleTurnTransition(prevTurnPlayer, tp, state.activePlayers);
    // ターンが変わった瞬間から、新しいturnPlayerに一致するpriorityPlayerがまだ届いて
    // いない可能性がある間、tick()等が古いpriorityPlayer/priorityDeadlineに基づいて
    // 誤動作しないようにする（下記の待機ガード参照）。
    if (isOnlineMode()) awaitingPriorityForTurnPlayer = tp;
    prevTurnPlayer = tp;
    return;
  }
  // ターン交代直後、新しいturnPlayerに一致するpriorityPlayerがまだ届いていない間は、
  // 以降の「本人が行動した」判定・ロープ表示の更新を一切行わない（古い値のまま動くと
  // 「相手のターンなのに自分の基本時間が減る」等の不整合になるため）。一致を確認できた
  // 時点でガードを解除し、通常の判定に戻る。
  if (awaitingPriorityForTurnPlayer !== null) {
    if (state.priorityPlayer === awaitingPriorityForTurnPlayer) {
      awaitingPriorityForTurnPlayer = null;
    } else {
      return;
    }
  }
  if (!state.priorityPlayer) return;

  // オンライン中は、この状態変化が本当に優先権保持者本人の「本物のゲーム操作」による
  // ものかを確認する（online.jsが各アクション実行時に記録するactorSeat/actionTypeを
  // 消費して判定。last-action-info.js参照）。ローカルモードはこの判定を行わず、従来通り
  // 「ターン交代以外の状態変化＝優先権保持者が行動した」という前提のまま（1人が全座席を
  // 操作するローカルモードでは常に正しいヒューリスティック）。
  if (isOnlineMode()) {
    const info = consumeLastActionInfo();
    if (!info || !REAL_ACTION_TYPES.has(info.actionType) || info.actorSeat !== state.priorityPlayer) return;
    // 重要（ユーザー報告バグの根本原因）: このactorSeat判定は、優先権保持者本人の
    // 操作を検知した全クライアント（本人の画面・相手の画面・観戦者、全員）で真になる。
    // handleTurnTransitionは「次の手番になる本人だけが送信する」よう既に制限されて
    // いるのに、こちらは制限が無かったため、2人対戦では両方のクライアントが同時に
    // （それぞれ別々のDate.now()を使って）setPriorityStateを書き込み合っていた。
    // 最後に書き込んだ方が勝つ素朴な上書きのため、基本時間が意図せず両者で消費されたり、
    // ターン終了時にphase:"base"へ戻すはずの書き込みが、直後に届いた別クライアントの
    // 古い（phase:"extension"のままの）書き込みで上書きされてロープが消えない、
    // といった不整合が起きていた。handleTurnTransitionと同じ「本人のクライアントだけが
    // 書き込む」方針に揃え、優先権保持者本人以外はここで書き込まないようにする。
    if (getSelfSeat() !== state.priorityPlayer) return;
  }

  // 優先権を持つ座席が何か行動した＝行動回復（applyActionRecovery：ロープ未出現なら基本時間
  // に+20秒、ロープ出現後ならロープに+20秒。ユーザー確定仕様2026-08-16）。
  // 重要（オンラインの委譲/優先権返却バグの根本対策）: applyActionRecoveryの書き込みには
  // player を含めない。含めると、カード効果の委譲（パーティー・合同建設・スラム上がりの役人）で
  // 一時的に相手へ優先権を貸している間、相手クライアントの“まだ更新前の古い priorityPlayer”に
  // 基づくリフレッシュが、コーディネーター側の「優先権を手番プレイヤーへ戻す」書き込み
  // （player 指定あり）を last-writer-wins で上書きしてしまい、「委譲後に優先権が即座に戻らず、
  // 相手がタイムアウトして初めて戻る」という不具合になる。優先権の保持者(player)は、明示的な
  // 譲渡/返却(transferPriorityTo)・ターン交代・座席初期化・タイムアウト時の返却でのみ書き換える。
  applyActionRecovery(state);
}

// --- フェイズ案内板の中に出す、基本時間の残り秒数表示 -----------------------------------
// ユーザー報告「画面左に砂時計残数、画面右に基本時間と目線が飛ぶ」への対応で、以前は
// 別々だった左下の自分専用砂時計バッジ（buildSelfStock/updateSelfStock、削除済み）を
// 廃止し、この基本時間表示1箇所に統合した。カウント中（誰かの基本時間が進行中）は
// 従来通り秒数＋そのプレイヤーの砂時計残数を表示し、カウント中でない間（延長ロープが
// 燃えている・優先権がまだ確定していない等）も表示自体は消さず、自分自身の砂時計残数
// だけを静かに表示し続ける「常時表示」の器にする（updateBaseClock参照）。

// ユーザー要望「ムーブフェイズの横にフェイズアイコンの丸枠と同じものの中に時間表示して
// 統一感を出したい」への対応。従来の横長バー表示をやめ、ロック/ハンド/ムーブと同じ
// 丸いアイコンボタンの見た目（icon-action-button.js共通CSSをそのまま流用）にし、
// アイコン画像の代わりに残り秒数の数字を丸枠の中央に表示する。
function buildBaseClock() {
  const bar = document.getElementById("phase-guide-bar");
  if (!bar) return;
  baseClockEl = document.createElement("div");
  baseClockEl.className = "icon-action-button turn-timer-base-clock";
  baseClockEl.style.display = "none";
  const iconWrap = document.createElement("span");
  iconWrap.className = "icon-action-button-icon-wrap";
  baseClockLabelEl = document.createElement("span");
  baseClockLabelEl.className = "turn-timer-base-clock-value";
  iconWrap.appendChild(baseClockLabelEl);
  baseClockEl.appendChild(iconWrap);
  // ユーザー要望「砂時計残機数を基本時間の隣に表示させたい」。基本時間表示は既に
  // 「優先権保持者が誰か」を駒の色で示しているため、その同じ人物の砂時計残数を
  // 丸枠の角に小さく添える（ロープ先端の砂時計バッジと同じ構造）。
  const hourglassBadge = document.createElement("div");
  hourglassBadge.className = "turn-timer-base-clock-hourglass";
  baseClockHourglassIconEl = document.createElement("img");
  baseClockHourglassIconEl.className = "turn-timer-base-clock-hourglass-icon";
  baseClockHourglassIconEl.alt = "";
  hourglassBadge.appendChild(baseClockHourglassIconEl);
  baseClockHourglassCountEl = document.createElement("span");
  baseClockHourglassCountEl.className = "turn-timer-base-clock-hourglass-count";
  hourglassBadge.appendChild(baseClockHourglassCountEl);
  iconWrap.appendChild(hourglassBadge);
  const caption = document.createElement("span");
  caption.className = "icon-action-button-caption";
  caption.textContent = "基本時間";
  baseClockEl.appendChild(caption);
  // ユーザー要望（続き68）「タイマーをオフにするボタンは基本時間アイコンを押すと
  // ひょこっと出てくる仕様にしたい」。timer-toggle.js側にポップオーバーの開閉状態を
  // 持たせ、ここではクリックをそのまま中継するだけにする。
  baseClockEl.addEventListener("click", toggleTimerTogglePopover);
  bar.appendChild(baseClockEl);
}

function updateBaseClock(state) {
  if (!baseClockEl) return;
  // CPU戦（1人用）では、CPUを自動で動かすためにタイマー機能自体は有効にしているが、
  // 人間側に基本時間の数字（900秒など）を見せる必要はない（ユーザー要望）。表示だけ隠す。
  if (isCpuBattleActive()) {
    setDisplayIfChanged(baseClockEl, "none");
    return;
  }
  if (!isTurnTimerEnabled() || !state.turnPlayer) {
    setDisplayIfChanged(baseClockEl, "none");
    return;
  }
  baseClockEl.style.display = "flex"; // タイマー機能が有効な間は常時表示（詳しくは上のコメント参照）

  const counting =
    !!state.priorityPlayer && state.priorityPhase === "base" && !!state.priorityDeadline && state.priorityDeadline - Date.now() > 0;
  // ユーザー要望「相手の基本時間のカウントダウンを表示/非表示できるようにしてほしい」。
  // 自分自身の分は常に見せる。相手の分は設定（デフォルトOFF）に従う。
  const isSelfCounting = counting && state.priorityPlayer === getSelfSeat();
  const showCountdown = counting && (isSelfCounting || isOpponentBaseTimerVisible());

  if (showCountdown) {
    const remainingSec = Math.max(0, Math.ceil((state.priorityDeadline - Date.now()) / 1000));
    baseClockLabelEl.textContent = `${remainingSec}`;
    // ユーザー報告「両方のプレイヤーで基本時間が減っていくように見える」への対応。
    // この表示はロープ（延長時間）と同じく、優先権保持者が誰であっても全プレイヤーの
    // 画面に同じ1つの数字が見える設計（単一の共有stateをそのまま描画しているだけで、
    // 実際に2人分独立したタイマーが動いているわけではない）。ただし従来は誰の基本時間かの
    // 表示が無く、見ている本人には「自分の分が減っている」ように誤解されやすかった。
    // ロープと同じ「優先権保持者の駒の色で縁取りする」方式で誰の分か色分けし、詳細は
    // ホバー説明（title）に譲る。
    baseClockEl.title = `${getPlayerName(state.priorityPlayer)}の基本時間`;
    const color = getPieceColor(state.priorityPlayer);
    baseClockEl.style.setProperty("--turn-timer-base-clock-color", color ? `var(--color-${color})` : "#38bdf8");
    const hourglassIconPath = getHourglassIconPath(color);
    if (hourglassIconPath) {
      baseClockHourglassIconEl.src = hourglassIconPath;
      baseClockHourglassIconEl.style.display = "";
    } else {
      baseClockHourglassIconEl.style.display = "none";
    }
    baseClockHourglassCountEl.textContent = state.hourglassStock[state.priorityPlayer] ?? 0;
    const totalSeconds = hourglassUsedThisTurn[state.priorityPlayer]
      ? Math.min(getRopeBaseSeconds(), getReducedBaseSeconds())
      : getRopeBaseSeconds();
    const ratio = remainingSec / totalSeconds;
    baseClockEl.classList.toggle("is-warning", ratio <= 0.5 && ratio > 0.2);
    baseClockEl.classList.toggle("is-critical", ratio <= 0.2);
    return;
  }

  // カウント中でない（延長ロープが燃えている・優先権未確定・相手の基本時間が非表示設定）
  // 間は、秒数の代わりに自分自身の砂時計残数だけを静かに表示するフォールバック状態にする
  // （ユーザー報告「画面左に砂時計残数、画面右に基本時間と目線が飛ぶ」への対応。以前は
  // 左下に別枠であった常設の自分専用バッジを廃止し、この1箇所へ統合した）。
  const selfSeat = getSelfSeat();
  baseClockLabelEl.textContent = "";
  baseClockEl.title = "自分の砂時計残数";
  const selfColor = getPieceColor(selfSeat);
  baseClockEl.style.setProperty("--turn-timer-base-clock-color", selfColor ? `var(--color-${selfColor})` : "rgba(226, 232, 240, 0.5)");
  const selfHourglassIconPath = getHourglassIconPath(selfColor);
  if (selfHourglassIconPath) {
    baseClockHourglassIconEl.src = selfHourglassIconPath;
    baseClockHourglassIconEl.style.display = "";
  } else {
    baseClockHourglassIconEl.style.display = "none";
  }
  baseClockHourglassCountEl.textContent = state.hourglassStock[selfSeat] ?? 0;
  baseClockEl.classList.remove("is-warning", "is-critical");
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
  ropeHourglassIconEl = document.createElement("img");
  ropeHourglassIconEl.className = "turn-timer-rope-hourglass-icon";
  ropeHourglassIconEl.alt = "";
  hourglass.appendChild(ropeHourglassIconEl);
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

// ユーザーが追加した色別の砂時計アイコン（画像素材/アイコン/砂時計/）。ロープ先端・自分専用
// ステータスの砂時計バッジは、それぞれ「今誰の砂時計か」の駒の色に合わせて表示を切り替える。
const HOURGLASS_ICON_BY_COLOR = {
  red: "assets/icons/hourglass-red.webp",
  orange: "assets/icons/hourglass-orange.webp",
  yellow: "assets/icons/hourglass-yellow.webp",
  green: "assets/icons/hourglass-green.webp",
  blue: "assets/icons/hourglass-blue.webp",
  pink: "assets/icons/hourglass-pink.webp",
  purple: "assets/icons/hourglass-purple.webp",
};
function getHourglassIconPath(color) {
  return HOURGLASS_ICON_BY_COLOR[color] ?? null;
}

// tick()から高頻度に呼ばれる、DOM更新だけを行う軽量な部分（stateへのdispatchは行わない）。
function updateRope(state) {
  // CPU戦では基本時間・延長ロープの表示は隠す（updateBaseClockと同じ理由）。
  if (isCpuBattleActive()) {
    setDisplayIfChanged(ropeEl, "none");
    return;
  }
  const inExtension =
    isTurnTimerEnabled() && state.turnPlayer && state.priorityPlayer && state.priorityPhase === "extension";
  if (!inExtension) {
    setDisplayIfChanged(ropeEl, "none");
    return;
  }
  setDisplayIfChanged(ropeEl, "block");
  const totalMs = getRopeExtensionSeconds() * 1000;
  const remaining = state.priorityDeadline - Date.now();
  const ratio = Math.max(0, Math.min(1, remaining / totalMs));
  ropeStrandEl.style.width = `${ratio * 100}%`;
  ropeTipEl.style.left = `${ratio * 100}%`;
  const color = getPieceColor(state.priorityPlayer);
  ropeEl.style.setProperty("--turn-timer-rope-color", color ? `var(--color-${color})` : "#eab308");
  const iconPath = getHourglassIconPath(color);
  if (iconPath) {
    ropeHourglassIconEl.src = iconPath;
    ropeHourglassIconEl.style.display = "";
  } else {
    ropeHourglassIconEl.style.display = "none";
  }
  ropeHourglassCountEl.textContent = state.hourglassStock[state.priorityPlayer] ?? 0;
  ropeEl._nameEl.textContent = `${getPlayerName(state.priorityPlayer)}の砂時計が燃えています`;
}

// --- #end-turn-buttonのそばに出す警告バッジ ---------------------------------------------

function buildWarning() {
  warningEl = document.createElement("div");
  warningEl.className = "turn-timer-warning";
  // 自動折返しに任せると文字の途中(max-widthとフォント幅の兼ね合い)で改行位置が
  // 不自然な場所になってしまうことがあったため、意味の区切り（「終えて」/「ください」）で
  // 明示的に2行に分ける。
  const line1 = document.createElement("span");
  line1.textContent = "ムーブフェイズを終えて";
  const line2 = document.createElement("span");
  line2.textContent = "ターンを終了してください";
  warningEl.appendChild(line1);
  warningEl.appendChild(document.createElement("br"));
  warningEl.appendChild(line2);
  warningEl.style.display = "none";
  document.body.appendChild(warningEl);
}

// ハマりどころ（ユーザー報告「タブレットで手札やロックバー付近が周期的にチカチカする、
// カメラ距離を変えても直らない」）: tick()は無効時・優先権未確定時も含め200msごとに
// 必ず呼ばれ続けるが、以前はこの関数も含め毎回`style.display = "none"`等を無条件に
// 書き込んでいた。値が既に同じでも実際にDOMへ書き込みが発生していたため、一部の
// タブレットGPUではこの高頻度な（無意味な）再書き込みがpreserve-3d階層全体の
// 再コンポジットを誘発し、手札やロックバー等ページ内の離れた場所が「全く同じ
// タイミングで」同時にチカチカする一因になっていた可能性がある（複数の無関係な
// 領域が完全に同期してチカチカするのは、単一要素の角度依存の問題ではなく、こうした
// 周期的な全体再描画の方が説明として自然）。値が変わる時だけ書き込むようにする。
function setDisplayIfChanged(el, value) {
  if (el && el.style.display !== value) el.style.display = value;
}

function updateWarning(shouldShow) {
  if (!warningEl) return;
  const endTurnBtn = document.getElementById("end-turn-button");
  if (!shouldShow || !endTurnBtn || getComputedStyle(endTurnBtn).display === "none") {
    setDisplayIfChanged(warningEl, "none");
    endTurnBtn?.classList.remove("turn-timer-warning-glow");
    return;
  }
  // 「1枚ドロー」ボタン等、#end-turn-buttonの真上に縦に積まれている他のボタンと重なって
  // いた（ボタンの上に表示する方式だった）ため、縦積みの列とは重ならない列の左側へ表示する
  // よう変更した。あわせてボタン自体にも点滅する縁取りを付け、警告テキストが画面外にはみ
  // 出す狭い画面でも「ここが光っている」ことだけは必ず伝わるようにしている。
  endTurnBtn.classList.add("turn-timer-warning-glow");
  // getBoundingClientRect()は実画面座標だが、warningElはposition:fixedでステージ内に
  // 描画されるため、ステージのローカル座標系（STAGE_WIDTH基準）に変換してから使う。
  const rect = toStageLocalRect(endTurnBtn.getBoundingClientRect());
  warningEl.style.top = `${rect.top + (rect.bottom - rect.top) / 2}px`;
  warningEl.style.right = `${STAGE_WIDTH - rect.left + 12}px`;
  warningEl.style.left = "auto";
  warningEl.style.display = "block";
}

// ユーザー要望「手番じゃないのに優先権を持っていてタイムオーバーになった場合は、優先権を
// 手番プレイヤーに返してくださいという警告を出してほしい」への対応。updateWarning
// （ムーブフェイズを終えてターンを終了してください＝優先権保持者=手番プレイヤーの時用）と
// 同じ「赤いバッジ＋対象の光る縁取り」の見た目を、対象を#priority-transfer-buttonsに
// 変えて再利用する。
function buildPriorityReturnWarning() {
  priorityReturnWarningEl = document.createElement("div");
  priorityReturnWarningEl.className = "turn-timer-warning";
  const line1 = document.createElement("span");
  line1.textContent = "優先権を手番プレイヤーに";
  const line2 = document.createElement("span");
  line2.textContent = "返してください";
  priorityReturnWarningEl.appendChild(line1);
  priorityReturnWarningEl.appendChild(document.createElement("br"));
  priorityReturnWarningEl.appendChild(line2);
  priorityReturnWarningEl.style.display = "none";
  document.body.appendChild(priorityReturnWarningEl);
}

function updatePriorityReturnWarning(shouldShow) {
  if (!priorityReturnWarningEl) return;
  if (!shouldShow || !transferButtonsEl || getComputedStyle(transferButtonsEl).display === "none") {
    setDisplayIfChanged(priorityReturnWarningEl, "none");
    transferButtonsEl?.classList.remove("turn-timer-warning-glow");
    return;
  }
  transferButtonsEl.classList.add("turn-timer-warning-glow");
  const rect = toStageLocalRect(transferButtonsEl.getBoundingClientRect());
  priorityReturnWarningEl.style.top = `${rect.top + (rect.bottom - rect.top) / 2}px`;
  priorityReturnWarningEl.style.right = `${STAGE_WIDTH - rect.left + 12}px`;
  priorityReturnWarningEl.style.left = "auto";
  priorityReturnWarningEl.style.display = "block";
}

// --- 優先権譲渡ボタン（三角形配置、円の中はアバター・枠は駒の色） ------------------------

const TRANSFER_EXPLANATION = [
  "優先権とは「次に行動すべきプレイヤー」を表します。通常はターンプレイヤーが持っていますが、カードの効果などで一時的に他のプレイヤーへ移ることがあります（今はカード効果の自動処理が無いため、実際に効果が発生したらこのボタンで手動・自己申告的に表現してください）。",
  "円形のボタンを押すと、そのプレイヤーへ優先権を譲渡します。誰でも押せます（押した本人が今優先権を持っているかは問いません、このゲーム全体の自己申告制と同じ考え方です）。",
  "ボタンの枠の色はそのプレイヤーの駒の色、円の中は登録されているアバターです。",
];

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
  // ユーザー要望（続き92）「優先権譲渡アイコンの表示は自動処理モードでは非表示でいいと
  // 思います。その代わり優先権が相手にある間はその旨を右下の『自分のターン相手の
  // ターン』表示のところに表示した方が良い気がします」。自動処理モード中は自己申告の
  // 出番自体が無い（optionally表示するphase-automation.jsのturn-status側に譲る）ため、
  // ここでアイコン自体を丸ごと隠す。
  if (!isTurnTimerEnabled() || !state.turnPlayer || isAutoProcessingEnabled()) {
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

  // ユーザー要望「優先権譲渡のアイコン群に4アイコンを囲むようにひし形の枠をつけたい。
  // 4アイコンの中央に『優先権譲渡』のテキストを持ってきてほしい」への対応。上下左右の
  // 4アイコン（下のforループでdata-pos="top"/"left"/"right"/"self"として配置される）の
  // 中心同士をちょうど結ぶ大きさの正方形を45度回転させることで、視覚的に「ひし形」を
  // 作る（style.cssの.priority-transfer-diamond参照）。ハマりどころ: この関数の冒頭で
  // 毎回grid.innerHTML=""しているため、以前はbuildTransferButtons()側で1回だけ
  // 作っていたが、次の再描画で消えてしまっていた。ここ（再描画の内側）で毎回作り
  // 直す必要がある。
  const diamond = document.createElement("div");
  diamond.className = "priority-transfer-diamond";
  grid.appendChild(diamond);

  // 「優先権譲渡」ラベル。フェイズ案内板のボタンと同じ「ホバーで簡易説明・クリックで詳細
  // 説明」パターン（説明文はTRANSFER_EXPLANATION参照）。4アイコンの中央（グリッドの
  // 中心セル、元々空き）に配置する。
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
  grid.appendChild(label);

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
    // ユーザー要望「優先権を誰が持っているのか明確にしたい」への対応。今まさに優先権を
    // 持っている座席のボタンだけ光らせる（has-priority、style.css参照）。
    if (seat === state.priorityPlayer) btn.classList.add("has-priority");
    btn.dataset.pos = isSelf ? "self" : rotateSide(SEAT_TO_SIDE[seat], steps);
    const color = getPieceColor(seat);
    btn.style.borderColor = color ? `var(--color-${color})` : "rgba(255, 255, 255, 0.5)";
    applyAvatarContent(btn, getPlayerAvatar(seat));
    btn.title = isSelf
      ? seat === state.priorityPlayer
        ? "自分に優先権を戻す（現在優先権を保持中）"
        : "自分に優先権を戻す"
      : seat === state.priorityPlayer
        ? `${getPlayerName(seat)}に優先権を渡す（現在優先権を保持中）`
        : `${getPlayerName(seat)}に優先権を渡す`;
    // 優先権の譲渡自体も「行動」の一種として扱い、freshBaseDeadlineForで基本時間の窓を
    // 仕切り直す（既に砂時計を使い始めている座席への譲渡は、短縮された基本時間になる——
    // 譲渡を繰り返して時間を稼ぐ抜け道を作らないため）。
    btn.addEventListener("click", () =>
      fireAndForget(setPriorityState({ player: seat, deadline: freshBaseDeadlineFor(seat), phase: "base" }))
    );
    grid.appendChild(btn);
  }
}

// --- ティック（描画のみ。stateへのdispatchは基本/延長時間切れの遷移のみ） -------------------
// 誰のtick()が実際に書き込むかは制限しない——handleTurnTransitionとは異なり、tick()は
// 「優先権保持者本人がブラウザを閉じている間はロープが誰にも報告されず凍りついたまま」
// という事態を避けるための保険なので、あえて優先権保持者以外のクライアントも報告できる
// ようにしておく。同じ入力（synced state）からは同じ結果しか計算されない冪等な処理なので、
// 複数クライアントが同時に書き込んでも安全に収束する（後から失敗した側はversion_conflict
// 等を無視するだけでよい、fireAndForget参照）。

// ユーザー報告バグ「優先権を譲渡して失ったはずなのに、自分にも相手にもタイマーが動き
// 続けてしまう」への対策。優先権の同期は"priority_changed"というRealtime Broadcastの
// 到達だけに頼っており（updateMyIdentity等と同じ「隠す必要の無い公開情報を直接テーブルへ
// 書き込む」パターン）、盤面のトークン移動のような他の同期経路と違って、broadcastが
// 届かなかった場合に自動で辻褄を合わせる仕組みが無かった。WebSocketベースのRealtime
// broadcastは、タブのバックグラウンド化・一時的な接続の途切れ等でメッセージが届かない
// ことが現実にあり得るため（この環境では2つの本物の別アカウントを使った再現ができず、
// 確定原因の特定はできなかったが、最も筋の通る説明として対応する）、数秒おきに
// so7_gamesの現在値を直接取り直す「安全網」の定期再同期を追加した。broadcastが正しく
// 届いている限りは無害な重複取得に過ぎず、万一broadcastが失われても数秒以内に
// 必ず正しい状態へ収束するようになる。
let ticksSincePriorityResync = 0;
const PRIORITY_RESYNC_EVERY_TICKS = 15; // tick()は200ms間隔なので約3秒に1回

// ユーザー報告（続き106、実機2クライアントテストで発見）「カード効果等で優先権が
// 一時的に他プレイヤーへ委譲された状態のまま、疑似CPUの自動プレイが反応せず止まって
// しまう」の根本原因: performPriorityTimeoutAutoAction()のactiveEffectPicker解決は
// updateTimeoutWarnings経由でしか呼ばれず、それは常に「今まさにstate.priorityPlayerを
// 保持しているクライアント」だけに限定されたゲート（本人の識別でしか操作を送信できない
// というセキュリティ上の制約、918行目付近参照）の内側にある。しかし接触で相手の手札から
// 奪うカードを選ぶ処理（respondToContact→resolveContactRitualPickAsAttacker、
// requestOpponentHandRitualPickでactiveEffectPickerに登録される）は、優先権を
// 「奪われる側（defender）」が保持している間に、「奪う側（attacker）」自身の画面で
// 選ばせる——つまりこの選択が発生する瞬間、選ぶ本人（attacker）はstate.priorityPlayerを
// 保持していないため、上記ゲートを永遠に通過できず、attacker自身の疑似CPU設定が
// ONでも自動で選ばれることが無かった（defender側は「優先権はあなたに」の表示のまま、
// 自分の画面には何も選択待ちが無いように見えるため、原因が分かりにくい）。
// 対策として、「自分の画面で今まさに選択待ちのactiveEffectPickerがあるかどうか」は
// 本来ゲーム上の優先権とは無関係の「自分のローカルなUI状態」でしかないという点に着目し、
// state.priorityPlayerを見ずに独立して監視する安全網を追加する。自分が疑似CPU対象
// （isPseudoCpuTarget(getSelfSeat())）で、かつactiveEffectPickerが一定時間
// （PSEUDO_CPU_DEADLINE_MS相当）居座り続けていたら、優先権の状態に関わらず
// performPriorityTimeoutAutoAction()を呼んで解決する。
let ticksWithLocalEffectPickerPending = 0;
const TICK_INTERVAL_MS = 200; // setInterval(tick, 200)と一致させる
// 基本時間が可変になったので、判定に使うtick数も都度計算する（下のtick()内で参照）。
function pseudoCpuLocalPickerTimeoutTicks() {
  return Math.max(1, Math.round(getPseudoCpuDeadlineMs() / TICK_INTERVAL_MS));
}

// ユーザー要望「タイマーが切れた場合、自動でスキップまたはターン終了をするように
// してください。移動先や効果の選択などの途中の場合はランダムで選択させるように」。
// 完全にタイムアウトした（isTimedOut===true）瞬間に1回だけ試す。performPriorityTimeout
// AutoAction()（main.js）が実際に何か行えば、その行動自体が新しい状態変化を起こし、
// 次のtickでは（remaining>0またはstock消費で）isTimedOut=falseに戻るはずなので二重
// 発火の心配は無い。何もしなかった場合（対応する状況が無かった）はフラグを立てず、
// 状況が変わり次第また試せるようにする。
let timedOutAutoActionFired = false;

// #138（ユーザー要望2026-08-18）: ランク戦の「相手主導の放置敗北」。手番プレイヤーのタブが
// 凍結する等で、その手番プレイヤー本人のクライアントでしか動かないタイムアウト自動処理が
// 進まず対局が固まった場合、起きている側（相手）がそれを検知して勝ちを確定する
// （spec「切断・一定時間放置 → 相手の勝ち」）。誤発火（生きているのに落ちていると誤判定）を
// 避けるため、非常に保守的に判定する:
//   - オンラインのランク対局で、自分は手番プレイヤーではない（＝起きて待っている側）
//   - 手番プレイヤーが優先権を保持したまま（委譲中の一時的な状態ではない）
//   - その優先権デッドラインが完全に切れている
//   - かつ、ゲーム状態が「まったく変化しない」まま一定時間（OPPONENT_AFK_FORFEIT_MS）続く
// 生きている手番プレイヤーは、デッドラインが切れれば自分のクライアントで数秒以内に自動処理
// （フェイズスキップ＝+15秒回復でデッドライン更新／移動＝トークン変化／ターン終了＝turnNumber
// 変化）を行い、それが下の署名を変える＝カウンタがリセットされる。よって署名が長時間まったく
// 変わらない＝手番プレイヤーのクライアントが本当に止まっている、と判断できる。tick()自身の
// 定期再同期(fetchAndHydrate)で状態は数秒おきに最新化されるため、古いローカル状態での誤判定も
// 起きにくい。自分のタブが凍結していた場合の誤判定を避けるため、復帰(visibilitychange)時に
// カウンタをリセットして手番プレイヤーに「生きている」と示す猶予を必ず与える。
const OPPONENT_AFK_FORFEIT_MS = 110000; // 約110秒まったく進展が無ければ放置とみなす（保守的）
let opponentAfkStaleSince = 0; // 署名が変わらなくなった時刻（0＝監視していない）
let opponentAfkStaleSig = null;
let opponentAfkForfeitDispatched = false;
function opponentAfkStateSig(state) {
  // 「手番プレイヤーが進展したか」を捉える最小の署名: ターン番号・優先権保持者・デッドライン
  //（フェイズ進行は+15秒回復でデッドラインが変わる）＋全トークンの位置（実際の移動）。
  let tk = "";
  for (const t of state.tokens) {
    const l = t.location || {};
    tk += `${t.id}:${l.zone}${l.row ?? ""}${l.col ?? ""}${l.side ?? ""}${l.index ?? ""}${l.player ?? ""};`;
  }
  return `${state.turnNumber}|${state.priorityPlayer}|${state.priorityDeadline}|${tk}`;
}
export function resetOpponentAfkWatch() {
  opponentAfkStaleSince = 0;
  opponentAfkStaleSig = null;
  // conditions が満たされない間（通常プレイ中はデッドラインが切れていない＝毎tickここに来る）に
  // dispatchフラグも落とすことで、実質「1つの放置状況につき1回」＋新しい対局では自然にリセット。
  opponentAfkForfeitDispatched = false;
}
function checkOpponentAfkForfeit(state) {
  // 条件を満たさなければ監視をリセットして戻る。
  if (
    !isOnlineMode() ||
    !isRankedGame() ||
    !state.turnPlayer ||
    getSelfSeat() === state.turnPlayer || // 自分が手番＝落とす対象＝ここでは対象外
    state.priorityPlayer !== state.turnPlayer || // 委譲中（接触・全員選択等）は対象外
    !state.priorityDeadline ||
    Date.now() <= state.priorityDeadline // まだデッドラインが残っている＝タイムアウトしていない
  ) {
    resetOpponentAfkWatch();
    return;
  }
  const sig = opponentAfkStateSig(state);
  if (sig !== opponentAfkStaleSig) {
    // 進展があった（署名が変わった）＝手番プレイヤーは生きている。監視を仕切り直す。
    opponentAfkStaleSig = sig;
    opponentAfkStaleSince = Date.now();
    return;
  }
  // 署名が変わらないまま経過中。閾値を超えたら放置敗北を確定する。
  if (opponentAfkStaleSince && Date.now() - opponentAfkStaleSince >= OPPONENT_AFK_FORFEIT_MS) {
    if (opponentAfkForfeitDispatched) return; // 1対局につき1回
    opponentAfkForfeitDispatched = true;
    logAction("diag-ranked-opponent-afk", {
      loserSeat: state.turnPlayer,
      selfSeat: getSelfSeat(),
      staleMs: Date.now() - opponentAfkStaleSince,
    });
    window.dispatchEvent(new CustomEvent("ranked-opponent-afk", { detail: { loserSeat: state.turnPlayer } }));
  }
}

// タイムオーバー時、2種類の警告のどちらを出すかをまとめて切り替える。優先権保持者が
// 手番プレイヤー本人ならupdateWarning（ムーブフェイズを終えて〜）、手番プレイヤーで
// ない座席が優先権を持ったままタイムオーバーしているならupdatePriorityReturnWarning
// （優先権を手番プレイヤーに返してください）——ユーザー要望「手番じゃないのに優先権を
// 持っていてタイムオーバーになった場合」への対応。isTimedOut=falseの間は両方消す。
function updateTimeoutWarnings(state, isTimedOut) {
  if (!isTimedOut) {
    timedOutAutoActionFired = false;
    updateWarning(false);
    updatePriorityReturnWarning(false);
    return;
  }
  // 本人（今まさにタイムアウトした優先権保持者）のクライアント上でだけ自動行動を
  // 起こす——ゲーム操作は本人の識別で送信する必要があるため、他クライアントからは
  // 何もしない（ローカルモードは1人が全座席を操作する前提なので、誰の番でも行う）。
  if (!isOnlineMode() || getSelfSeat() === state.priorityPlayer) {
    // ユーザー要望（続き68）「優先権を戻す前に効果の処理中であれば効果を完了してから
    // にしてください。例えばカードを置く場所を選んでいる途中でタイムアウトになれば、
    // 自動で置く場所を選び、カードを置くまでを完了させてから優先権を手放してください」。
    // isAnyEffectProcessingBusy()（activeEffectPicker等、docs/rulebook.mdの「処理中」の
    // 判定と同じもの）が真の間は、下の「優先権をターンプレイヤーへ戻す」判定より先に
    // performPriorityTimeoutAutoAction()の①番の分岐（activeEffectPickerをランダムに
    // 解決する）だけを繰り返し実行する。1回の解決で効果が完全に終わるとは限らない
    // （続けて次の選択が必要な効果もある）ため、ここではtimedOutAutoActionFiredを
    // 立てずに即return し、200ms後の次のtick()で改めてこの分岐に入り直す——選択待ちが
    // 無くなるまで自然に繰り返され、無くなった時点で初めて下の優先権の判定に進む。
    if (isAnyEffectProcessingBusy()) {
      performPriorityTimeoutAutoAction();
      return;
    }
    if (!timedOutAutoActionFired) {
      // （以前ここに診断ログ diag-pseudo-cpu updateTimeoutWarnings-firstTimeout を出していたが、
      // 「1タイムアウトにつき1回」という前提が崩れる場合があった——下の
      // performPriorityTimeoutAutoAction()が何もできず false を返し続けると timedOutAutoActionFired
      // が立たないまま毎tick再入し、行動ログを埋め尽くして「まだ記録がありません」になる
      // 原因になっていた。ユーザー報告。調査目的は済んだので削除。）
      // ユーザー要望（続き67、経緯: 当初「ハンドフェイズでタイムアウトを迎えたのに
      // 自動スキップされない」という報告を受け、いったん「本人のタブがバックグラウンド化
      // していると誰もスキップできない」という別の仮説で調査を進めていたが、後の
      // やり取りで実際の意図は違うと判明した）「ターンプレイヤー以外が優先権を持って
      // いてタイムアウトしたら、その行動をスキップして優先権をターンプレイヤーに戻す。
      // それでターンプレイヤーに優先権が戻り、そこでタイムアウトすればそのフェイズが
      // 自動でスキップされるように」。
      //
      // 手番でない座席（例: 接触の一時的な優先権譲渡等）が優先権を持ったままタイム
      // アウトした場合、performPriorityTimeoutAutoAction()（phase-automation.jsの
      // currentPhase参照）は何もしなかった（原因判明: currentPhase自体がターン
      // プレイヤー本人のクライアントでしか追跡されていない値のため、手番でない
      // 座席の画面では常にnull/無関係な値になり、moveフェイズ/lock・handフェイズの
      // どちらの分岐にも一致せずfalseで抜けていた）。ここでその場合を先に判定し、
      // 「本人の代わりに何かを実行する」のではなく「優先権譲渡ボタンを本人が押すのと
      // 全く同じ書き込みで優先権をターンプレイヤーへ自動的に返す」ようにする。
      // ターンプレイヤー側は改めて自分の基本時間からやり直せ、そこでもタイムアウト
      // すれば下のperformPriorityTimeoutAutoAction()が通常通りフェイズを自動
      // スキップする（この2段目は元々あったロジックがそのまま機能する）。
      // ただし、優先権を持っているのが疑似CPU（CPU戦のCPU席）の場合は、ここで手番プレイヤーへ
      // 返してはいけない（不具合#31）。パーティ・合同建設などの委任効果でCPUに一時的に優先権を
      // 渡している最中、「選んだ結果の通知モーダル」を数秒表示している間は activeEffectPicker が
      // 一瞬 null になり isAnyEffectProcessingBusy() が false になる。その隙にこの分岐が発火して
      // CPUから手番プレイヤー（人間）へ優先権を奪い返してしまうと、その直後にCPUが出す次の選択
      // ピッカー（例: パーティ「2枚オープン」のマス選択）が、人間の長い持ち時間の優先権のまま
      // 誰にも自動解決されず永久に止まる。CPUの委任中はここでは返さず、下の
      // performPriorityTimeoutAutoAction に任せる（ピッカーが出れば解決、無ければ何もしないだけ。
      // 委任が終われば delegateToPlayerForEffect の finally が優先権を手番プレイヤーへ戻す）。
      if (state.turnPlayer && state.priorityPlayer !== state.turnPlayer && !isPseudoCpuTarget(state.priorityPlayer)) {
        timedOutAutoActionFired = true;
        withGuard(() =>
          setPriorityState({ player: state.turnPlayer, deadline: freshBaseDeadlineFor(state.turnPlayer), phase: "base" })
        );
      } else {
        const result = performPriorityTimeoutAutoAction();
        timedOutAutoActionFired = !!result;
        // AFK代行（ユーザー要望2026-08-08）: オンラインで自席が時間切れ自動処理された回数を数え、
        // しきい値に達したら自席をCPU代行に切り替える（main.js側でフラグON・「復帰しますか？」
        // モーダル表示・相手への通知を行う）。代行中の（CPUの短時間）タイムアウトは数えない。
        if (result && isOnlineMode() && getSelfSeat() === state.priorityPlayer && !isSelfCpuSubstituted()) {
          if (recordSelfTimeout()) {
            window.dispatchEvent(new CustomEvent("afk-cpu-threshold-reached"));
          }
        }
        // ユーザー要望「時間切れによるスキップが発生したら15秒回復させてください」。
        // ロック/ハンドフェイズの自動スキップ（"skip"）は盤面操作を一切伴わないため、
        // ムーブフェイズの移動/接触や候補のランダム選択（moveToken等の実際の操作を
        // 伴い、onStateChange側の「本人の本物の操作」判定で自然に基本時間がリセット
        // される）と違って、何もしないとpriorityDeadlineが切れたままになってしまう。
        if (result === "skip") {
          // ユーザー報告（続き99）「疑似CPUモードの時、回復すると基本時間が15秒とか
          // まで行ってしまう」。この15秒回復はfreshBaseDeadlineFor()を経由しない
          // 直書きのため、isPseudoCpuTargetの対象座席にもそのまま15秒を与えてしまって
          // いた。対象座席にはfreshBaseDeadlineFor経由で通常の持ち時間を与える。
          // ユーザー要望（2026-08-07）「CPUがロックした後、食い気味でハンドフェイズに
          // 移行する。『ゆっくり』の時は少し間を持たせたい」——ここを固定のpseudo持ち時間
          // (1.3秒)で直書きしていたため、速度設定に関係なくロック→ハンドの間が短かった。
          // freshBaseDeadlineForはCPU戦のCPU席にgetCpuStepDeadlineMs()（速度設定）を返すので、
          // 「ゆっくり」なら間もその分長くなる。
          const deadline = isPseudoCpuTarget(state.priorityPlayer)
            ? freshBaseDeadlineFor(state.priorityPlayer)
            : Date.now() + 15000;
          withGuard(() => setPriorityState({ player: state.priorityPlayer, deadline, phase: "base" }));
        }
      }
    }
  }
  const priorityHolderIsTurnPlayer = state.priorityPlayer === state.turnPlayer;
  // ハマりどころ（ユーザー報告「相手にも『ムーブフェイズを終えてターンを終了してください』
  // が表示される」）: このstateはオンライン中は全クライアント共有のため、従来は
  // 「誰の画面か」を一切見ずにpriorityHolderIsTurnPlayerだけで判定していた。しかし
  // updateWarning/updatePriorityReturnWarningはどちらも「本人にしか押せないボタンを
  // 指して行動を促す」表示のため、オンライン中は「今この画面を見ている自分がその
  // 警告の対象本人か」も条件に加える必要がある（ローカルモードは全座席を1人で
  // 操作する前提のため、従来通り誰の番でも表示する）。
  const selfIsTurnPlayer = !isOnlineMode() || getSelfSeat() === state.turnPlayer;
  const selfIsPriorityPlayer = !isOnlineMode() || getSelfSeat() === state.priorityPlayer;
  updateWarning(priorityHolderIsTurnPlayer && selfIsTurnPlayer);
  updatePriorityReturnWarning(!priorityHolderIsTurnPlayer && selfIsPriorityPlayer);
}

function tick() {
  // CPU戦の「クリックで進める」案内は、現在の状態から毎tick出し消しする（#29/#30対策。
  // main.js syncCpuStepHint参照）。以降の早期returnに関係なく必ず更新したいので先頭で呼ぶ。
  syncCpuStepHint();
  // 観戦者は読み取り専用。タイマーの自動行動・優先権書き込みを一切させない（表示も出さない）。
  if (isSpectatingGame()) {
    updateWarning(false);
    updatePriorityReturnWarning(false);
    setDisplayIfChanged(ropeEl, "none");
    setDisplayIfChanged(baseClockEl, "none");
    return;
  }
  // セットアップ完了（スタートプレイヤー告知が閉じる）まではタイマーを一切動かさない
  // （ユーザー要望2026-08-11）。表示もカウントも自動処理の再評価も行わず、完了後の
  // 次tickから通常動作＋下の ensureInitializedIfNeeded() で新鮮な持ち時間で起動する。
  if (isSetupRevealActive()) {
    updateWarning(false);
    updatePriorityReturnWarning(false);
    setDisplayIfChanged(ropeEl, "none");
    setDisplayIfChanged(baseClockEl, "none");
    return;
  }
  // セットアップ完了直後にターン1のタイマーを起動する（onStateChangeはセットアップ中の
  // turnPlayer確定を無視しているため、ここで初期化する）。初期化済み・優先権保持中・
  // タイマーOFFのときは self-guard で no-op なので毎tick呼んでよい。
  ensureInitializedIfNeeded();
  // タイマーOFF時はロープ・基本時間・警告の表示は出さない。ただし #66 対策として、この後の
  // 自動処理の再評価（reconcilePhaseAutomation / updateEndTurnButton）・選択待ちの強制解決・
  // オンラインの優先権リシンクは、タイマーONと同様に tick でも回す必要がある。でないと、接触
  // 解決で優先権が非同期のBroadcastで手番プレイヤーへ戻った後、render依存だけでは再評価を
  // 取りこぼし「効果は終わったのにターンが進まない」状態で固まる（#66。timerONなら元々tickが
  // 拾っていた#8対策と同じ穴が、timerOFFのtick早期returnで塞がれていなかった）。ここでは表示を
  // 消すだけにして return せず、下のバックストップ群まで進む。ロープ/基本時間/デッドラインの
  // enforcement はこの関数末尾手前の `if (!isTurnTimerEnabled()) return;` で確実にスキップする。
  if (!isTurnTimerEnabled()) {
    updateWarning(false);
    updatePriorityReturnWarning(false);
    setDisplayIfChanged(ropeEl, "none");
    setDisplayIfChanged(baseClockEl, "none");
  }
  // ユーザー報告（続き86）「勝利後、まだ盤面のタイマーが止まらず自動処理が継続
  // されてしまっている」。誰かが既に勝利していれば、以後は優先権もタイマーも
  // 意味を持たないため、表示を消して以降の処理も止める。
  if (hasAnyoneWon()) {
    updateWarning(false);
    updatePriorityReturnWarning(false);
    setDisplayIfChanged(ropeEl, "none");
    setDisplayIfChanged(baseClockEl, "none");
    return;
  }
  // フェイズ自動処理をタイマーと同じtickで再評価する（#5）。ターン状態表示の更新に加え、
  // 「処理が終わったのにターンが自動終了しない」も、render()を伴わない非同期完了を
  // ここで拾って解消する。冪等なので毎tick呼んでよい（詳細はimport箇所のコメント参照）。
  reconcilePhaseAutomation();
  // 自動ターン終了の判定（computeShouldEmphasize→reconcileAutoEndTurn）も同じtickで
  // 回す（#8「パーティーを相手に取られた後、優先権は自分に戻るのにターンが相手へ移行
  // しない」）。パーティー等の委任効果は優先権を相手→自分へ非同期のbroadcastで戻すため、
  // 到達処理のfinallyでのrender()時点ではまだ優先権がローカルに反映されておらず（＝
  // endTurnDisabledがtrueのまま）shouldEmphasizeがfalseと評価され、自動ターン終了が
  // arm（1.5秒タイマー）されないまま取り残されていた。優先権がローカルに戻った後は
  // render()が必ずしも走らないため、tickで再評価して確実にarmする。reconcileAutoEndTurnは
  // arm済みなら何もしない冪等設計＋発火時にcomputeShouldEmphasize()を再確認するので、
  // tick頻度で呼んでも早すぎる終了は起きない。
  updateEndTurnButton();
  // ユーザー報告（続き106）「優先権が委任されたまま自動プレイが反応せず止まる」の
  // 根本原因（このファイル798行目付近の解説参照）への対策。state.priorityPlayerを
  // 誰が保持しているかに関係なく、「自分の画面に今まさに選択待ちのactiveEffectPickerが
  // あるか」だけを独立して監視する。疑似CPU対象で、かつ一定時間（PSEUDO_CPU_DEADLINE_MS
  // 相当）居座っていたら、優先権の状態を問わず解決する。
  // AFK代行中の自席も同様に、居座っている選択待ちを自動解決する（ユーザー要望2026-08-08。
  // ゴメンナサイの奪う札/追色コスト選択など、リアクション処理中のピッカーもここで解決される）。
  if ((isPseudoCpuTarget(getSelfSeat()) || isSelfCpuSubstituted()) && hasActiveEffectPicker()) {
    ticksWithLocalEffectPickerPending++;
    if (ticksWithLocalEffectPickerPending >= pseudoCpuLocalPickerTimeoutTicks()) {
      ticksWithLocalEffectPickerPending = 0;
      logAction("diag-pseudo-cpu", { phase: "localEffectPicker-forceResolve", selfSeat: getSelfSeat() });
      performPriorityTimeoutAutoAction();
    }
  } else {
    ticksWithLocalEffectPickerPending = 0;
  }
  // 優先権の安全網の定期再同期（上のコメント参照）。オンライン中だけ、数秒おきに
  // fetchAndHydrate()（盤面全体の再取得、tokens/piles/priority全部含む）を呼び、
  // broadcastの取りこぼしがあってもここで必ず追いつけるようにする。
  if (isOnlineMode()) {
    ticksSincePriorityResync++;
    if (ticksSincePriorityResync >= PRIORITY_RESYNC_EVERY_TICKS) {
      ticksSincePriorityResync = 0;
      const gameId = getCurrentGameId();
      if (gameId) fetchAndHydrate(gameId).catch(() => {});
    }
  }
  // #66: タイマーOFFはここまで（自動処理の再評価・選択待ち解決・優先権リシンクのバックストップ）
  // だけ回し、以降のロープ/基本時間/デッドラインの表示・時間制限（enforcement）は一切行わない。
  // 表示は上の冒頭ブロックで既に消してある。
  if (!isTurnTimerEnabled()) return;
  const state = getState();
  // #138: ランク戦の相手主導の放置敗北検知（起きている側が、手番プレイヤーの完全な放置を
  // 検知して勝ちを確定する）。timer有効＝ランク対局でも常に有効なのでここで毎tick見る。
  checkOpponentAfkForfeit(state);
  if (!state.turnPlayer) {
    updateWarning(false);
    updatePriorityReturnWarning(false);
    setDisplayIfChanged(ropeEl, "none");
    setDisplayIfChanged(baseClockEl, "none");
    return;
  }
  // ユーザー要望「基本時間の砂時計残数表示を常時表示にしたい」への対応。優先権がまだ
  // 確定していない間（対局開始直後の一瞬等）も、基本時間の表示枠自体は消さず自分の
  // 砂時計残数だけを表示し続ける（updateBaseClockのフォールバック分岐）。ロープ・警告は
  // 優先権が無いと意味を持たないため従来通り非表示にする。
  if (!state.priorityPlayer || !state.priorityDeadline) {
    updateWarning(false);
    updatePriorityReturnWarning(false);
    setDisplayIfChanged(ropeEl, "none");
    updateBaseClock(state);
    return;
  }
  // ターン交代直後、新しいturnPlayerに一致するpriorityPlayerがまだ届いていない間は、
  // 古い（前のターンプレイヤー用の）priorityPlayer/priorityDeadlineに基づいてロープや
  // 基本時間の消費を進めてしまわないよう、何も表示せず・何も書き込まずに待つ
  // （onStateChangeと同じガード。ユーザー報告バグ「相手のターンなのに自分の基本時間が
  // 減る」「たまに相手にだけロープが表示される」の根本原因への対策）。
  if (awaitingPriorityForTurnPlayer !== null) {
    if (state.priorityPlayer === awaitingPriorityForTurnPlayer) {
      awaitingPriorityForTurnPlayer = null;
    } else {
      updateWarning(false);
      updatePriorityReturnWarning(false);
      setDisplayIfChanged(ropeEl, "none");
      updateBaseClock(state);
      return;
    }
  }
  updateRope(state);
  updateBaseClock(state);

  const remaining = state.priorityDeadline - Date.now();
  if (remaining > 0) {
    updateTimeoutWarnings(state, false);
    return;
  }

  // 疑似CPUモードの対象座席は、実際に保持している砂時計数に関わらず常に0個扱いにし、
  // 延長ロープを一切出さず即座にタイムアウトさせる（isPseudoCpuTarget参照）。
  const stock = isPseudoCpuTarget(state.priorityPlayer) ? 0 : (state.hourglassStock[state.priorityPlayer] ?? 0);

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
      // player は含めない（保持者は変えない。上の onStateChange の書き込みのコメント参照）。
      withGuard(() =>
        setPriorityState({
          deadline: Date.now() + extensionDurationMsFor(state.priorityPlayer),
          phase: "extension",
        })
      );
    } else {
      updateTimeoutWarnings(state, true);
    }
    return;
  }

  // 延長ロープも燃え尽きた＝行動が無いまま延長時間を使い切った。ここで初めて砂時計を
  // 正式に1個消費する。まだ残っていれば連続してもう1本ロープを燃やす
  // （＝「回復した基本時間を使い切ったらまた砂時計が作動する」）。
  // stockが既に0の場合（この分岐に前回既に入っていて消費し切っている）は、ここで
  // 何もdispatchせず素通りする（後述のphase:"base"への遷移で既に安定状態のはず）。
  if (stock <= 0) {
    updateTimeoutWarnings(state, true);
    return;
  }
  const nextStock = stock - 1;
  if (nextStock > 0) {
    // player は含めない（保持者は変えない。上の onStateChange の書き込みのコメント参照）。
    withGuard(() =>
      setPriorityState({
        hourglassStock: { [state.priorityPlayer]: nextStock },
        deadline: Date.now() + getRopeExtensionSeconds() * 1000,
        phase: "extension",
      })
    );
    updateTimeoutWarnings(state, false);
  } else {
    // 最後の1個も使い切った。ロープを消して警告表示だけの安定状態(phase:"base")に戻す
    // （ここで一度だけdispatchすれば、以降は上のstock<=0の早期returnで毎ティックの
    // 無駄な再dispatchを避けられる）。
    // player は含めない（保持者は変えない。上の onStateChange の書き込みのコメント参照）。
    withGuard(() =>
      setPriorityState({
        hourglassStock: { [state.priorityPlayer]: nextStock },
        deadline: state.priorityDeadline,
        phase: "base",
      })
    );
    updateTimeoutWarnings(state, true);
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

// ユーザー要望「接触されたプレイヤーは自分のゲートに強制移動しますが、その際、
// 一度そのプレイヤーに優先権を移してください。強制移動もカードをオープンして到達
// 効果が発動するので、その処理が終われば優先権をターンプレイヤーに戻しましょう」。
// 優先権譲渡ボタン（上のグリッド生成コード）とまったく同じ書き込みを、プログラムから
// 呼べるようにしたもの。この対局でまだ一度も優先権が初期化されていない（＝ターン
// タイマー機能自体が無効、admin.jsのデフォルトOFF）場合はstate.priorityPlayerが
// ずっとnullのままなので、その場合は原則何もしない（優先権という概念自体が使われて
// いない対局に、この呼び出しだけでpriorityPlayerを生やしてしまわないようにする）。
//
// #61（2026-08-10）: 接触解決中の「防御側へ優先権を移してターンを保持する」仕組みは、
// この early-return のせいでタイマーOFFの対局（priorityPlayer が終始 null）では
// 丸ごと無効化され、防御側の到達効果処理中にターンプレイヤーが NEXT_TURN を送って
// しまう不具合になっていた。接触解決のように「タイマーOFFでも一時的に優先権で手番を
// 保持したい」ケースだけ initializeIfUnset:true を渡し、null からでも初期化できるように
// する。タイマーOFFでは tick() が早期returnするためタイマー自体は起動せず（表示・
// enforcement なし）、優先権譲渡ボタン/返却警告も isTurnTimerEnabled() で隠れるため、
// 見た目・時間制限は一切変わらない。効くのは isEndTurnDisabledNow() 等の「優先権を
// 持たない席のターン終了を止める」ガードだけ＝まさに必要な保持だけが有効になる。
export function transferPriorityTo(player, { initializeIfUnset = false } = {}) {
  const state = getState();
  if (!state.priorityPlayer && !initializeIfUnset) return;
  fireAndForget(setPriorityState({ player, deadline: freshBaseDeadlineFor(player), phase: "base" }));
}

export function initTurnTimer() {
  buildBaseClock();
  buildRope();
  buildWarning();
  buildPriorityReturnWarning();
  buildTransferButtons();
  subscribe((state) => {
    onStateChange(state);
    updateBaseClock(state);
    rebuildTransferButtons();
  });
  window.addEventListener("admin:change", () => {
    ensureInitializedIfNeeded();
    updateBaseClock(getState());
    rebuildTransferButtons();
    if (!isTurnTimerEnabled()) {
      setDisplayIfChanged(ropeEl, "none");
      setDisplayIfChanged(baseClockEl, "none");
    }
  });
  // ユーザー要望（続き99）「(疑似CPUモードを)ONしたら現在持っている基本時間及び
  // 砂時計は0にしてください」。admin.js側の2つのチェックボックス（有効化・自分も
  // 含める）が変わった瞬間に発火する（admin.js参照）。今まさに優先権を持っている
  // 座席がある場合、freshBaseDeadlineFor()を通して即座に基本時間を引き直す
  // （isPseudoCpuTargetの対象になった座席なら1秒へ縮む、対象でなければ普段通りの
  // 値になるだけで無害）。オンライン中は、自分の座席以外にこの即時反映を及ぼすと
  // 「自分の設定変更だけで、まだ何もしていない本物の相手の基本時間を勝手に縮める」
  // ことになってしまう（transferPriorityToにはgetSelfSeat()ガードが無いため、
  // 呼べば実際に書き込めてしまう）。tick()自身の受動的な監視（他クライアントが
  // オフラインの時の保険）とは違い、こちらは「自分の設定変更」という能動的な
  // トリガーのため、自分の座席の番の時だけに限定する（ローカルモードは1人が全座席を
  // 操作する前提のため、従来通り誰の番でも反映してよい）。
  window.addEventListener("pseudo-cpu-settings-changed", () => {
    const state = getState();
    if (!state.priorityPlayer) return;
    if (isOnlineMode() && state.priorityPlayer !== getSelfSeat()) return;
    fireAndForget(setPriorityState({ player: state.priorityPlayer, deadline: freshBaseDeadlineFor(state.priorityPlayer), phase: "base" }));
  });
  // 復帰時の追いつき（#138、2026-08-18）。ブラウザはタブを長くバックグラウンド化すると
  // タブごと凍結する（Web Workerのtickも止まる）ため、タイマーが完全に止まり、優先権保持者の
  // タイムアウト自動処理（本人のクライアントでしか動かない）が進まず対局が固まる。タブに戻った
  // 瞬間に①盤面全体を即再同期（broadcast取りこぼしの回復）②タイムアウト自動処理の再評価フラグを
  // リセット（凍結前に立っていた場合の再発火を許す）③即tick、を行って素早く追いつく。
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (isOnlineMode()) {
      const gameId = getCurrentGameId();
      if (gameId) fetchAndHydrate(gameId).catch(() => {});
    }
    timedOutAutoActionFired = false; // 凍結中に立っていたフラグを解除して再評価させる
    ticksSincePriorityResync = 0;
    // #138: 自分のタブが凍結していた場合、復帰直後に古い（凍結前の）状態で誤って相手を
    // 放置敗北させないよう、相手AFK監視を仕切り直して手番プレイヤーに猶予を与える。
    resetOpponentAfkWatch();
    tick();
  });
  startTickLoop();
}

// tick()を回すループ。素直にsetInterval(tick, 200)にすると、ブラウザのタブが非アクティブ
// （バックグラウンド）の間はメインスレッドのタイマーが強く絞られる／事実上止まるため、
// 疑似CPUの自動プレイやタイムアウト処理が進まなくなる（ユーザー報告「疑似CPUモードの時、
// ブラウザがアクティブでないと止まってしまう」）。タイミングは全てDate.now()基準なので
// 「tickが呼ばれさえすれば」よく、Web Workerのタイマー（ページ非表示でも多少絞られるだけで
// 止まらない）から定期的にtickを叩く。Worker生成に失敗する環境では従来のsetIntervalへ
// フォールバックする（前面では実質同じ挙動）。
function startTickLoop() {
  try {
    const workerSrc = "setInterval(function(){ postMessage(0); }, 200);";
    const blob = new Blob([workerSrc], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    worker.onmessage = () => tick();
    return;
  } catch (e) {
    // CSP等でWorker/blobが使えない環境。前面では従来通り動くフォールバック。
    console.warn("tick worker unavailable, falling back to setInterval", e);
  }
  setInterval(tick, 200);
}
