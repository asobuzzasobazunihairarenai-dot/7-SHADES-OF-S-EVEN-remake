// カード効果の自動処理エンジン（試作）。src/card-effects.jsの構造化データ（動詞＋
// パラメータ）を実際にゲーム状態へ適用する。ユーザー確認済み方針:
// ・基本設定でON/OFFを選べる（デフォルトOFF、既存の自己申告プレイを壊さないため）。
// ・構造化データを持つカード（今はパイロット5枚のうち、既存の「到達」トリガーに
//   乗せられる3枚: ゴメンナサイッ！・ジャンプ台・収穫と種まき）だけを自動処理の対象にし、
//   それ以外の全カードは今まで通り自己申告のまま。
//
// スコープ外（今回はまだ未対応、要フォローアップ）: 手札効果（■）の自動処理。
// 現状のアプリには「手札効果を今使った」という宣言のプログラム的なトリガーが存在しない
// （手札公開エリアへドラッグする、という見た目だけの自己申告に留まっている）。奇跡の森・
// 黄金の宮殿ドムス・ネロ（どちらも手札効果のみ）はCARD_EFFECTSにデータこそあるが、今回は
// 呼び出されない。手札効果の「使用する」ボタンのようなUIを別途作ってから対応する。
//
// このモジュール自身はDOM操作を一切行わない（main.jsから、実際に駒・カードを動かす
// 関数とプレイヤーに選ばせる関数を`helpers`として渡してもらう、他の箇所と同じ
// 「呼び出し元に注入してもらう」設計）。

import { getState } from "./state.js";
import { VERBS, TARGET_SELECTIONS, CARD_EFFECTS } from "./card-effects.js";

// ユーザー確認済み「効果自動処理は基本設定でON/OFFを選べるように」。他の「アニメーションを
// 減らす」設定（motion-prefs.js）と同じくセッション限りの設定（ページ再読み込みで
// デフォルトのOFFに戻る）。まだ試験運用中の機能のため、アカウントへの永続化はしない。
let autoProcessingEnabled = false;
export function isAutoProcessingEnabled() {
  return autoProcessingEnabled;
}
export function setAutoProcessingEnabled(v) {
  autoProcessingEnabled = !!v;
}

// このカードの到達効果を自動処理してよいか（設定がON、かつ構造化データを持っている）。
export function canAutoProcessArrival(cardId) {
  return autoProcessingEnabled && !!CARD_EFFECTS[cardId]?.arrival;
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

// moveの候補マスを計算する（純粋関数、DOM不要）。atOnce（一気に）の場合は中間マスの
// カード・駒の有無を問わない（ユーザー確認済みのルール解釈）。それ以外（今回のパイロット
// 範囲ではcount:1のみ）は、通常の移動ルール通り「移動先にカードが必要、駒が既にいる
// マスは不可」を課す。
export function getMoveCandidates(fromLocation, count, atOnce) {
  const candidates = [];
  for (const { dr, dc } of DIRECTIONS) {
    const row = fromLocation.row + dr * count;
    const col = fromLocation.col + dc * count;
    if (!inBounds(row, col)) continue;
    if (!atOnce) {
      if (!hasCardAt(row, col) || hasPieceAt(row, col)) continue;
    }
    candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 「任意の1マス」（カードがあるマスに限る、1マスの1枚を対象にする効果向け）の候補一覧。
export function getAnyCellWithCardCandidates() {
  const candidates = [];
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      if (hasCardAt(row, col)) candidates.push({ zone: "cell", row, col });
    }
  }
  return candidates;
}

// 1つのactionを実行する。helpers:
//   moveAndSync(tokenId, location): 実際にトークンを動かし、オンライン中の同期・
//     再描画まで面倒を見る（main.jsのaddArrivedCardToHand等と同じ責務）。
//   pickLocation(candidates): プレイヤーに候補マスの中から1つ選んでもらう
//     （候補が1つしかなければ選ばせずそのまま採用してよい、呼び出し元の裁量）。
//   pickHandCard(player): プレイヤーに自分の手札から1枚選んでもらう（手札トークンを返す）。
async function runAction(action, ctx, helpers) {
  switch (action.verb) {
    case VERBS.MOVE: {
      const candidates = getMoveCandidates(ctx.pieceLocation, action.count, !!action.atOnce);
      if (candidates.length === 0) return; // 善処の原則: 選べる先が無ければ何もしない
      const dest = candidates.length === 1 ? candidates[0] : await helpers.pickLocation(candidates);
      if (!dest) return;
      await helpers.moveAndSync(ctx.pieceTokenId, dest);
      ctx.pieceLocation = dest;
      ctx.arrivedAt = dest; // 呼び出し元が「移動の結果、新しいマスに到達した」連鎖判定に使う
      return;
    }
    case VERBS.DRAW: {
      // 手札効果トリガーが無いため現状呼ばれないが、動詞自体は将来の再利用のため実装しておく。
      // TODO: draw実行にはdrawFromPile("deck", {zone:"hand", player})相当の処理が必要
      // （main.js側のオンライン同期込みヘルパーがまだ無いため未実装）。
      return;
    }
    case VERBS.PICKUP_TO_HAND: {
      const candidates = getAnyCellWithCardCandidates();
      if (candidates.length === 0) return;
      const chosen = candidates.length === 1 ? candidates[0] : await helpers.pickLocation(candidates);
      if (!chosen) return;
      const token = getState().tokens.find(
        (t) =>
          t.kind === "card" &&
          t.location.zone === "cell" &&
          t.location.row === chosen.row &&
          t.location.col === chosen.col
      );
      if (!token) return;
      await helpers.moveAndSync(token.id, { zone: "hand", player: ctx.player });
      if (action.target?.saveAs) ctx.selections[action.target.saveAs] = chosen;
      return;
    }
    case VERBS.PLACE_CARD: {
      // 今回のパイロット（収穫と種まき）はdestination.selection===SAME_ASの1パターンのみ。
      // 「任意のマスに置く」（selection未指定）はまだ未対応（該当するパイロットが無いため）。
      if (action.destination?.selection !== TARGET_SELECTIONS.SAME_AS) {
        console.warn("card-effect-engine: place_cardのdestination.selectionが未対応です", action);
        return;
      }
      const dest = ctx.selections[action.destination.ref];
      if (!dest) return;
      const handToken = await helpers.pickHandCard(ctx.player);
      if (!handToken) return;
      await helpers.moveAndSync(handToken.id, { zone: "cell", row: dest.row, col: dest.col });
      return;
    }
    default:
      console.warn(`card-effect-engine: 未対応の動詞 "${action.verb}"`);
  }
}

// 到達効果を自動処理する。ctx: { cardId, player, pieceTokenId, cardTokenId, pieceLocation }。
// 戻り値: 効果中にmoveが発生し新しいマスへ到達した場合はその場所（呼び出し元が続けて
// そのマスの到達判定を行うために使う）、それ以外はnull。
export async function runArrivalEffect(ctx, helpers) {
  const effectDef = CARD_EFFECTS[ctx.cardId]?.arrival;
  if (!effectDef) return null;
  const runCtx = { player: ctx.player, pieceTokenId: ctx.pieceTokenId, pieceLocation: ctx.pieceLocation, selections: {}, arrivedAt: null };
  for (const action of effectDef.actions) {
    await runAction(action, runCtx, helpers);
  }
  // 既定動作（到達効果処理後にこのカード自身を手札に加える）。明示的にfalseの時だけ省略する
  // （docs/cards.mdの凡例通り）。
  if (effectDef.addsCardToHandAfter !== false) {
    await helpers.moveAndSync(ctx.cardTokenId, { zone: "hand", player: ctx.player });
  }
  return runCtx.arrivedAt;
}
