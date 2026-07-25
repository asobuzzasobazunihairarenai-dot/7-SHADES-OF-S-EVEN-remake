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

// ユーザー指摘「２マス先とは２マス移動できる範囲のことなので斜め隣のマスも対象」。
// atOnce（一気に）の「Nマス先」は、上下左右の単位移動をN回組み合わせて届く範囲全体を指し、
// 直線上のNマス先（4方向）だけでなく、方向を途中で変えた結果届く斜め隣接マスも含む
// （例: N=2なら、直線上の2マス先4方向＋「上に1＋右に1」のような組み合わせで届く
// 斜め隣接4方向＝合計8マス）。数学的には「そのマスからマンハッタン距離がちょうどN」の
// マス全て。N=1の場合はこの式でも従来通り上下左右4マスのみになる（斜めは距離2以上でしか
// 出現しないため）。
function enumerateManhattanRing(count) {
  const offsets = [];
  for (let drAbs = 0; drAbs <= count; drAbs++) {
    const dcAbs = count - drAbs;
    const drs = drAbs === 0 ? [0] : [drAbs, -drAbs];
    const dcs = dcAbs === 0 ? [0] : [dcAbs, -dcAbs];
    for (const dr of drs) {
      for (const dc of dcs) offsets.push({ dr, dc });
    }
  }
  return offsets;
}

// moveの候補マスを計算する（純粋関数、DOM不要）。ユーザー指摘を受けdocs/rulebook.mdの
// 「移動」の定義を確認: 「移動」とは自分の駒を、現在のマスから"カードの置かれた"別のマスに
// 置くこと（カードの無いマスにも置けるのは「強制移動」という別の用語で、ジャンプ台の
// 効果文にその語は出てこない）。またルール上、駒は物理的に1マスに1つまでなので、既に
// 駒がいるマスへは移動できない。atOnce（一気に）が唯一免除するのは「1マス目（＝経路の
// 途中のマス）のカード・駒の有無」（rulebook.md 289行目補足）であり、最終的な移動先
// （このコードが計算する候補そのもの）には適用されない。そのため、移動先が「カードあり・
// 駒なし」であることは、atOnceの有無に関わらず常に課す（旧実装はatOnce時にこの判定自体を
// 丸ごとスキップしており、駒のいるマスや空きマスまで候補に出てしまうバグだった）。
export function getMoveCandidates(fromLocation, count, atOnce) {
  const candidates = [];
  const offsets = atOnce
    ? enumerateManhattanRing(count)
    : DIRECTIONS.map(({ dr, dc }) => ({ dr: dr * count, dc: dc * count }));
  for (const { dr, dc } of offsets) {
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    if (!hasCardAt(row, col) || hasPieceAt(row, col)) continue;
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
//   pickLocation(candidates, hint): プレイヤーに候補マスの中から1つ選んでもらう
//     （候補が1つしかなければ選ばせずそのまま採用してよい、呼び出し元の裁量）。hintは
//     「何を選ぶ場面か」をプレイヤーに案内する短い文（ユーザー要望「移動先のマスを
//     選択してください、等の案内を出してほしい」への対応）。
//   pickHandCard(player, hint): プレイヤーに自分の手札から1枚選んでもらう（手札トークンを返す）。
//   onCardAcquiredToHand(tokenId, cardId): PICKUP_TO_HANDで手札に加わったカードを
//     「何を獲得したか」表示し、後で置き直すまで手札内で光らせる（ユーザー要望）。省略可。
//   markPlacementTarget(location): PICKUP_TO_HANDで拾った元のマスを「ここに置き直す」
//     目印としてハイライトし続ける（ユーザー要望「どこに置かれるか忘れないように」）。省略可。
async function runAction(action, ctx, helpers) {
  switch (action.verb) {
    case VERBS.MOVE: {
      const candidates = getMoveCandidates(ctx.pieceLocation, action.count, !!action.atOnce);
      if (candidates.length === 0) return; // 善処の原則: 選べる先が無ければ何もしない
      const dest = candidates.length === 1 ? candidates[0] : await helpers.pickLocation(candidates, "移動先のマスを選択してください");
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
      const chosen =
        candidates.length === 1 ? candidates[0] : await helpers.pickLocation(candidates, "手札に加えるカードのあるマスを選択してください");
      if (!chosen) return;
      const token = getState().tokens.find(
        (t) =>
          t.kind === "card" &&
          t.location.zone === "cell" &&
          t.location.row === chosen.row &&
          t.location.col === chosen.col
      );
      if (!token) return;
      const wasFaceUp = token.faceUp; // 手札に入ると自動で表向きになるため、移動前の状態を保持しておく
      await helpers.moveAndSync(token.id, { zone: "hand", player: ctx.player });
      helpers.onCardAcquiredToHand?.(token.id, token.cardId, wasFaceUp);
      if (action.target?.saveAs) {
        ctx.selections[action.target.saveAs] = chosen;
        helpers.markPlacementTarget?.(chosen);
      }
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
      const handToken = await helpers.pickHandCard(ctx.player, "そのマスに置くカードを手札から選択してください");
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
