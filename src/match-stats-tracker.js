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

let stats = {}; // { [seat]: { contactsMade: number, cardsUsed: number } }

function ensureSeat(seat) {
  if (!stats[seat]) stats[seat] = { contactsMade: 0, cardsUsed: 0 };
  return stats[seat];
}

// 新しい対局が始まる（セットアップウィザードの盤面リセット）たびに呼ぶ
// （victory.jsのresetVictoryTrackingと同じタイミング）。
export function resetMatchStats() {
  stats = {};
}

export function getMatchStats(seat) {
  const s = ensureSeat(seat);
  return { contactsMade: s.contactsMade, cardsUsed: s.cardsUsed };
}

function bumpLocally(seat, stat) {
  ensureSeat(seat)[stat]++;
}

// 実際にこの座席の行動としてカウントする側（自分の操作）が呼ぶ。ローカルで即座に
// 反映しつつ、オンライン中は他クライアント（相手・傍観者）にも同じ値を伝える。
function record(seat, stat) {
  bumpLocally(seat, stat);
  if (isOnlineMode()) broadcastMatchStatEvent({ seat, stat });
}

export function recordContactMade(seat) {
  record(seat, "contactsMade");
}
export function recordCardUsed(seat) {
  record(seat, "cardsUsed");
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
  onMatchStatEvents(({ seat, stat }) => {
    if (seat === getSelfSeat()) return;
    bumpLocally(seat, stat);
  });
}
