// ユーザー要望（続き97）「接触回数やカード使用枚数など詳細スタッツを実装」への対応。
// match-personal-result-modal.js（対戦終了時の個人結果）が使う、対局内スタッツの
// トラッキング。この統計は勝敗判定・盤面状態のような「厳密な整合性が必要な公開情報」
// ではなく対戦終了時に見せる添え物のため、state.jsのreducer（バージョン管理・
// so7-apply-action.tsでのサーバー側検証付き）は経由させない。オンライン中は
// online.jsのbroadcastMatchStatEvent/onMatchStatEvents（hand_effect_use等と同じ
// Realtime Broadcastによる「見た目だけの合図」パターン）で全クライアントへ直接
// 伝え、各クライアントがローカルに集計する（サーバー側Edge Functionの変更・
// 再デプロイが不要というメリットもある。broadcastの取りこぼしがあれば集計が実態と
// ズレる可能性はあるが、参考スタッツとしては許容範囲と判断した）。

import { isOnlineMode, getSelfSeat } from "./online.js";
import { broadcastMatchStatEvent, onMatchStatEvents } from "./online.js";

// cardUsage: { [cardId]: 使用回数 }。ユーザー要望「対戦終了時に、全体MVPカード・自分MVP
// カード（この対戦で最も使われたカード）を表示したい」用に、cardId別の使用回数も持つ。
let stats = {}; // { [seat]: { contactsMade, cardsUsed, cardUsage: {cardId:count} } }
// ユーザー要望「対戦終了時に、ターンごとの各プレイヤーのロック枚数を折れ線グラフで表示
// したい。どこで逆転したのか見れて楽しそう」用。各ターン遷移時に全プレイヤーのロック
// 枚数をスナップショットする。ロック枚数は同期stateから各クライアントが同じ値を算出できる
// ため、この履歴はbroadcastせず各クライアントがローカルに記録する（cardUsage等の
// broadcast集計とは違い取りこぼしの心配が無い）。 [{ turn, counts: {seat:n} }]
let lockHistory = [];

function ensureSeat(seat) {
  if (!stats[seat]) stats[seat] = { contactsMade: 0, cardsUsed: 0, cardUsage: {} };
  return stats[seat];
}

// 新しい対局が始まる（セットアップウィザードの盤面リセット）たびに呼ぶ
// （victory.jsのresetVictoryTrackingと同じタイミング）。
export function resetMatchStats() {
  stats = {};
  lockHistory = [];
}

// 各ターン遷移時に、その時点の全プレイヤーのロック枚数を記録する（main.jsのターン変化
// 検知から呼ぶ）。同じturnで複数回呼ばれたら最新値で上書きする。
export function recordLockSnapshot(turn, countsBySeat) {
  if (turn == null) return;
  const counts = { ...countsBySeat };
  const existing = lockHistory.find((h) => h.turn === turn);
  if (existing) existing.counts = counts;
  else lockHistory.push({ turn, counts });
  lockHistory.sort((a, b) => a.turn - b.turn);
}
export function getLockHistory() {
  return lockHistory.map((h) => ({ turn: h.turn, counts: { ...h.counts } }));
}

export function getMatchStats(seat) {
  const s = ensureSeat(seat);
  return { contactsMade: s.contactsMade, cardsUsed: s.cardsUsed, cardUsage: { ...s.cardUsage } };
}

function bumpLocally(seat, stat, cardId) {
  const s = ensureSeat(seat);
  s[stat]++;
  // カード使用のときは、どのカードかも別途集計する（MVPカード算出用）。
  if (stat === "cardsUsed" && cardId) s.cardUsage[cardId] = (s.cardUsage[cardId] || 0) + 1;
}

// 実際にこの座席の行動としてカウントする側（自分の操作）が呼ぶ。ローカルで即座に
// 反映しつつ、オンライン中は他クライアント（相手・傍観者）にも同じ値を伝える。
function record(seat, stat, cardId) {
  bumpLocally(seat, stat, cardId);
  if (isOnlineMode()) broadcastMatchStatEvent({ seat, stat, cardId });
}

export function recordContactMade(seat) {
  record(seat, "contactsMade");
}
export function recordCardUsed(seat, cardId) {
  record(seat, "cardsUsed", cardId);
}

// MVPカード算出。全体（全座席合計）で最も使われたカード。
export function getMostUsedCardOverall() {
  const agg = {};
  for (const seat of Object.keys(stats)) {
    for (const [cardId, n] of Object.entries(stats[seat].cardUsage)) agg[cardId] = (agg[cardId] || 0) + n;
  }
  return topCardEntry(agg);
}
// 指定座席で最も使われたカード。
export function getMostUsedCardForSeat(seat) {
  return topCardEntry(stats[seat]?.cardUsage ?? {});
}
function topCardEntry(usageMap) {
  let bestCardId = null;
  let bestCount = 0;
  for (const [cardId, n] of Object.entries(usageMap)) {
    if (n > bestCount) {
      bestCount = n;
      bestCardId = cardId;
    }
  }
  return bestCardId ? { cardId: bestCardId, count: bestCount } : null;
}

// main.jsの他のinitXxx()と同じく、モジュールの読み込み順（online.js⇄main.js⇄
// match-stats-tracker.jsの循環import）に関係なく安全に登録できるよう、モジュール
// トップレベルで即座にonMatchStatEventsを呼ぶのではなく、明示的な初期化関数として
// 切り出した（main.jsの起動シーケンスから1回だけ呼んでもらう）。以前トップレベルで
// 直接呼んでいた時は、online.js側の`let matchStatEventListeners`がまだ初期化される
// 前にこちらの読み込みが先に走ってしまい、「Cannot access 'matchStatEventListeners'
// before initialization」というTDZエラーでアプリ全体が起動しなくなっていた。
export function initMatchStatsTracker() {
  // 他クライアントからの通知を受け取る側。hand_effect_use等の既存パターンと同じく、
  // 自分自身が送った分はここでは無視する（record()内で既にローカル加算済みのため、
  // 二重加算防止）。
  onMatchStatEvents(({ seat, stat, cardId }) => {
    if (seat === getSelfSeat()) return;
    bumpLocally(seat, stat, cardId);
  });
}
