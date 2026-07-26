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
import { VERBS, TARGETS, TARGET_SELECTIONS, CARD_EFFECTS } from "./card-effects.js";
import { getCardDefinition } from "./cards-data.js";
import { COLORS, SEAT_TO_SIDE, SIDE_TO_SEAT, GATE_POSITIONS } from "./board-layout.js";

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

// ユーザー確認済み「手品師の技の『いつでも使える』はゲート侵攻処理を含む効果の処理中
// 以外はいつでも使えるという意味」。main.js側がこれを見て、ハンドフェイズ以外でも
// ドラッグでの発動を許可するかどうかを判断する（handEffectOptionsを持つカード
// ＝複数選択肢のあるカードにはこの概念は今のところ無いため対象外）。
export function isHandEffectUsableAnytime(cardId) {
  return !!CARD_EFFECTS[cardId]?.handEffect?.usableAnytime;
}

// --- 手札効果（■）の自動処理 -----------------------------------------------------------
// 「１ターンに１度のみ」等の使用回数制限（黄金の宮殿）は、セッション限りの試験運用の方針
// （アカウントには一切保存しない）に合わせ、このモジュール内のメモリだけで追跡する。
// キーは`${cardId}:${player}`、値は{turnNumber, count}（state.jsのturnNumberが変われば
// 新しいターンとみなしリセットする——NEXT_TURNのたびに+1されるだけの単純増加値のため、
// 「前回記録した時のturnNumberと今のturnNumberが違う」で「ターンが変わった」を判定できる）。
const handEffectUsage = new Map();
function usageKey(cardId, player) {
  return `${cardId}:${player}`;
}
function usageCountThisTurn(cardId, player) {
  const entry = handEffectUsage.get(usageKey(cardId, player));
  if (!entry || entry.turnNumber !== getState().turnNumber) return 0;
  return entry.count;
}
function isUnderUsageLimit(usageLimit, cardId, player) {
  if (!usageLimit) return true;
  if (usageLimit.per !== "turn") return true; // 今回のパイロットは"turn"のみ対応
  return usageCountThisTurn(cardId, player) < usageLimit.count;
}
function recordHandEffectUsage(cardId, player) {
  handEffectUsage.set(usageKey(cardId, player), { turnNumber: getState().turnNumber, count: usageCountThisTurn(cardId, player) + 1 });
}

// テスト中に発覚したバグの修正: resetGame()するとstate.jsのturnNumberは1から再スタートする
// ため、前のゲームで既に「turnNumber:1で1回使用済み」と記録されていたカードが、新しい
// ゲームのturnNumber:1でも誤って「もう使った」扱いになってしまっていた（handEffectUsageは
// このモジュールのメモリに残り続け、resetGame()では一切クリアされないため）。ゲームを
// リセットする箇所（game-setup.js）から呼んでもらう。
export function resetHandEffectUsage() {
  handEffectUsage.clear();
}

// 「追色」コスト（同色の別カードを手札から捨てる）で実際に捨てられる候補。cardTokenIdは
// 効果を使おうとしている本人のカード自身（同じ色でも自分自身は対象外）。
// ユーザー指摘＋docs/cards.mdの「なないろの欠片」記載（「★ これはすべての色であり、
// ロックフェイズではロックできない。」）確認: なないろの欠片は「すべての色」を兼ねる
// ため、追色コストとしてはどの色の代わりにも使える。
function findSameColorDiscardCandidates(cardTokenId, color, player) {
  return getState().tokens.filter((t) => {
    if (t.kind !== "card" || t.location.zone !== "hand" || t.location.player !== player || t.id === cardTokenId) return false;
    if (t.cardId === "rainbow-shard") return true;
    return getCardDefinition(t.cardId)?.color === color;
  });
}

// 手札効果データを「選択肢の配列」に正規化する。単一handEffectのカード（今までの
// 大半）は1件だけの配列として扱い（id:"default"）、handEffectOptionsを持つカード
// （なないろの欠片等、複数選択肢を持つ手札効果）はそのまま返す。呼び出し元（main.js）が
// 「選択肢が1つならモーダル無しでそのまま実行、2つ以上なら選ばせる」を共通の形で
// 書けるようにするための正規化。
export function getHandEffectOptions(cardId) {
  const def = CARD_EFFECTS[cardId];
  if (!def) return [];
  if (def.handEffectOptions) return def.handEffectOptions;
  if (def.handEffect) return [{ id: "default", label: null, ...def.handEffect }];
  return [];
}

// 1つの選択肢が今使えるか（設定ON・使用回数制限内・コストを払える・
// requiresPairInHand等の追加条件を満たす、の全てを満たすか）。
export function isHandEffectOptionUsable(cardId, cardTokenId, player, option) {
  if (!autoProcessingEnabled) return false;
  if (!isUnderUsageLimit(option.usageLimit, cardId, player)) return false;
  if (option.cost?.verb === VERBS.DISCARD_SAME_COLOR) {
    const color = getCardDefinition(cardId)?.color;
    const candidates = findSameColorDiscardCandidates(cardTokenId, color, player);
    if (candidates.length < option.cost.count) return false;
  }
  if (option.requiresPairInHand) {
    const count = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player && t.cardId === cardId
    ).length;
    if (count < 2) return false;
  }
  return true;
}

// このカードの手札効果を今使ってよいか（いずれかの選択肢が使えるか）。トリガーUI側
// （main.js）が「使用する」操作を有効にするかどうかの判定にも、Hand Phaseの自動
// スキップ判定にも使う共通関数。
export function canUseHandEffect(cardId, cardTokenId, player) {
  return getHandEffectOptions(cardId).some((opt) => isHandEffectOptionUsable(cardId, cardTokenId, player, opt));
}

// このカードが構造化された手札効果データを持っているか（使用可否は問わない）。
// main.js側の「クリックしたが手札効果自体を持っていないカードなら何もしない」判定用。
export function hasHandEffectData(cardId) {
  return getHandEffectOptions(cardId).length > 0;
}

// コスト（追色）だけを見て払えるかどうか（使用回数制限・自動処理ON/OFFは問わない）。
// ユーザー要望「追色コストになるカードが手札に無い場合はその旨の警告を出す」ための、
// canUseHandEffectより細かい判定（何が原因で使えないかをUI側が案内できるようにする）。
// 選択肢が複数ある場合は、コストだけ見ていずれか1つでも払えればtrue（コスト以外の
// 条件、例えばrequiresPairInHandは問わない——「捨てられる手札が無い」という別種の
// 警告の判定専用のため）。
export function canPayHandEffectCost(cardId, cardTokenId, player) {
  const options = getHandEffectOptions(cardId);
  if (options.length === 0) return true;
  return options.some((opt) => {
    if (opt.cost?.verb !== VERBS.DISCARD_SAME_COLOR) return true;
    const color = getCardDefinition(cardId)?.color;
    return findSameColorDiscardCandidates(cardTokenId, color, player).length >= opt.cost.count;
  });
}

// 自分の手札の中に、今すぐ使える手札効果カードが1枚でもあるか（Hand Phaseの自動スキップ
// 判定用）。
export function hasUsableHandEffect(player) {
  return getState().tokens.some(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player && canUseHandEffect(t.cardId, t.id, player)
  );
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

// 「任意のNマス」（カードの有無を問わない、山札から置く先を選ばせる効果向け）の候補一覧。
function getAllCellCandidates() {
  const candidates = [];
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// enumerateManhattanRing（ちょうど距離N）を0からNまで積み重ねた「N マス以内」
// （自分のいるマスも含む、距離0〜N全て）の候補。「２マス以内」等の効果文の実際の判定範囲
// （docs/cards.md「仮にNマス移動する場合に移動できる範囲」）に対応する。
function enumerateManhattanDisk(maxCount) {
  const offsets = [];
  for (let d = 0; d <= maxCount; d++) offsets.push(...enumerateManhattanRing(d));
  return offsets;
}

// 「Nマス以内のカードがあるマス」の候補（橙のキューブ ハーベスト等）。
function getCellsWithCardWithinRange(fromLocation, range) {
  const candidates = [];
  for (const { dr, dc } of enumerateManhattanDisk(range)) {
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    if (!hasCardAt(row, col)) continue;
    candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 「Nマス以内にいる相手の駒のマス」の候補（マスチェンジ等）。自分のいるマス自身は
// 対象外（自分自身との入れ替えは意味を成さないため）。
function getOpponentPieceCellsWithinRange(fromLocation, range, player) {
  const candidates = [];
  for (const { dr, dc } of enumerateManhattanDisk(range)) {
    if (dr === 0 && dc === 0) continue;
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    const piece = getState().tokens.find(
      (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col && t.player !== player
    );
    if (piece) candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 手品師の技専用: 距離を問わず、盤面上にいる相手全員の駒のマス（マスチェンジの
// 「Nマス以内」と違い範囲指定が無いカードのため、getOpponentPieceCellsWithinRangeは
// 使わず全マス走査する）。
function getAllOpponentPieceCells(player) {
  return getState()
    .tokens.filter((t) => t.kind === "piece" && t.location.zone === "cell" && t.player !== player)
    .map((t) => ({ zone: "cell", row: t.location.row, col: t.location.col }));
}

// なないろの欠片のLOCK_PAIR専用: 自分のロックエリアの7色スロット全部（埋まっている
// スロットも含む——通常の「1色1枚まで」占有チェックの対象外の特殊ロックのため）。
function getOwnLockSlotCandidates(player) {
  const side = SEAT_TO_SIDE[player];
  return COLORS.map((_, index) => ({ zone: "lock", side, index }));
}

// カウンターロック専用: 指定プレイヤーが実際にロックしている枚数。
function countLockedCardsFor(player) {
  return getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && SIDE_TO_SEAT[t.location.side] === player).length;
}

// カウンターロック専用: 「１番少なくロックしている」＝参加している全プレイヤーの中で
// ロック枚数が最少（同率首位も含む——docs/cards.md補足「ロックしている枚数が
// １番少ないことである」の一般的な解釈、他の「１番多い/少ない」系カードと同じ）。
function isFewestLocked(player) {
  const counts = getState().activePlayers.map((p) => countLockedCardsFor(p));
  if (counts.length === 0) return false;
  return countLockedCardsFor(player) === Math.min(...counts);
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
      const dest =
        candidates.length === 1 && !ctx.forcePrompt ? candidates[0] : await helpers.pickLocation(candidates, "移動先のマスを選択してください");
      if (!dest) return;
      // ユーザー要望「ジャンプ台で移動するときに専用の効果音を使ってください」。
      // action.sound（DSL側で指定した場合のみ）をそのままhelpers.moveAndSyncへ
      // 渡す。指定が無い他のMOVEアクションは従来通り無音のまま。
      await helpers.moveAndSync(ctx.pieceTokenId, dest, action.sound);
      ctx.pieceLocation = dest;
      ctx.arrivedAt = dest; // 呼び出し元が「移動の結果、新しいマスに到達した」連鎖判定に使う
      return;
    }
    case VERBS.DRAW: {
      // target: SELF（自分だけ）/ALL_OPPONENTS（対象は自分以外の参加座席それぞれ、
      // 1人ずつ指定枚数）。helpers.drawCards(player, count)はplayerごとに1回呼ぶ。
      const players =
        action.target === TARGETS.ALL_OPPONENTS ? getState().activePlayers.filter((p) => p !== ctx.player) : [ctx.player];
      for (const p of players) {
        await helpers.drawCards(p, action.count);
      }
      return;
    }
    case VERBS.PICKUP_TO_HAND: {
      // withinCells指定時（橙のキューブ ハーベスト等）は「Nマス以内」に絞る。未指定なら
      // 従来通り盤面全体（収穫と種まき等）。
      const candidates =
        action.withinCells != null ? getCellsWithCardWithinRange(ctx.pieceLocation, action.withinCells) : getAnyCellWithCardCandidates();
      if (candidates.length === 0) return;
      const chosen =
        candidates.length === 1 && !ctx.forcePrompt
          ? candidates[0]
          : await helpers.pickLocation(candidates, "手札に加えるカードのあるマスを選択してください");
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
      // destination.selection: SAME_AS（収穫と種まき・終わりなき化学ゲンテクニーク等、
      // 同じ効果内の別アクションで既に選んだマスへ置き直す）／CHOOSE（月下の漂流船
      // プリドゥエン等、その場でN個のマスを選ばせる。action.countがマス数）。
      let destinations = [];
      if (action.destination?.selection === TARGET_SELECTIONS.SAME_AS) {
        const dest = ctx.selections[action.destination.ref];
        if (dest) destinations = [dest];
      } else if (action.destination?.selection === TARGET_SELECTIONS.CHOOSE) {
        const pickCount = action.count ?? 1;
        // ユーザー要望「ジャンプ台の手札効果」：「これをゲート以外の任意のマスに」
        // 置く場合、ゲートマスは候補から外す（destination.excludeGates）。
        const cellCandidates = action.destination?.excludeGates
          ? getAllCellCandidates().filter((c) => !Object.values(GATE_POSITIONS).some((g) => g.row === c.row && g.col === c.col))
          : getAllCellCandidates();
        for (let i = 0; i < pickCount; i++) {
          const dest = await helpers.pickLocation(cellCandidates, "カードを置くマスを選択してください");
          if (!dest) break;
          destinations.push(dest);
        }
      } else {
        console.warn("card-effect-engine: place_cardのdestination.selectionが未対応です", action);
        return;
      }
      for (const dest of destinations) {
        if (action.source === "self") {
          // ジャンプ台の手札効果専用: このカード自身（手札にある効果カード本体）を
          // 盤面へ置く。他の手札からの選択とは違い相手に選ばせる必要が無い。
          await helpers.moveAndSync(ctx.cardTokenId, { zone: "cell", row: dest.row, col: dest.col });
          // 手札→マスの移動は既定で裏向きになる（state.jsのfaceUpForLocation）ため、
          // 表向き指定の時だけ明示的にめくる。
          if (action.faceUp) await helpers.flipCard?.(ctx.cardTokenId);
        } else if (action.source === "hand") {
          const handToken = await helpers.pickHandCard(ctx.player, "そのマスに置くカードを手札から選択してください");
          if (!handToken) continue;
          await helpers.moveAndSync(handToken.id, { zone: "cell", row: dest.row, col: dest.col });
        } else {
          // "deck"（山札）: 手札からではなく山札の一番上を直接そのマスへ置く。
          await helpers.placeFromDeck(dest);
        }
        // ユーザー要望「配置後ここに配置したよがわかるように配置場所をしっかり
        // ハイライトしてください。マスの枠だけでなくカードの面も」。
        helpers.markPlacedLocation?.(dest);
      }
      return;
    }
    case VERBS.SWAP_POSITION: {
      // 「入れ替え」であり「移動」ではないため（docs/cards.md補足）、到達判定は連鎖させない
      // （ctx.arrivedAtをセットしない）。
      const candidates = getOpponentPieceCellsWithinRange(ctx.pieceLocation, action.count, ctx.player);
      if (candidates.length === 0) return;
      // ユーザー要望「３マス以内の相手をハイライトしてプレイヤーに選ばせるステップを
      // 踏んでください（対象が１人でも）」＋「到達効果でも手札効果と同じように相手を
      // 選ぶステップを入れてください」。他のアクション（MOVE等）は「候補が1つなら
      // テンポ優先で自動採用、手札効果だけforcePromptで強制」という設計だが、
      // 入れ替えは結果の重さが違うため、到達・手札のどちらの経路でも
      // （ctx.forcePromptに関係なく）常にプレイヤーに選ばせる。
      const target = await helpers.pickLocation(candidates, "入れ替える相手のマスを選択してください");
      if (!target) return;
      await helpers.swapPieces(ctx.pieceTokenId, ctx.pieceLocation, target);
      ctx.pieceLocation = target;
      return;
    }
    case VERBS.LOCK_PAIR: {
      // なないろの欠片専用: これを含めた同名2枚を、任意の1箇所（自分のロックエリアの
      // 好きな色スロット、通常の1色1枚の占有チェックは対象外の特殊ロック）へまとめて置く。
      const partner = getState().tokens.find(
        (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === ctx.player && t.cardId === "rainbow-shard" && t.id !== ctx.cardTokenId
      );
      if (!partner) return;
      const candidates = getOwnLockSlotCandidates(ctx.player);
      const dest = await helpers.pickLocation(candidates, "ロックする場所を選択してください");
      if (!dest) return;
      await helpers.moveAndSync(ctx.cardTokenId, dest);
      await helpers.moveAndSync(partner.id, dest);
      return;
    }
    case VERBS.DRAW_IF_FEWEST_LOCKED: {
      if (isFewestLocked(ctx.player)) {
        await helpers.drawCards(ctx.player, 1);
      }
      return;
    }
    case VERBS.SWAP_RANDOM_HAND_CARD: {
      // 手品師の技専用: マスチェンジのSWAP_POSITIONと同じ「相手の駒をクリックして
      // 選ぶ」UIを流用する（範囲制限が無いので候補は全相手の駒）。
      const candidates = getAllOpponentPieceCells(ctx.player);
      if (candidates.length === 0) return;
      const target = await helpers.pickLocation(candidates, "手札を交換する相手を選択してください");
      if (!target) return;
      const targetPiece = getState().tokens.find(
        (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === target.row && t.location.col === target.col
      );
      if (!targetPiece) return;
      await helpers.swapRandomHandCard(ctx.player, targetPiece.player);
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
  // ハマりどころ: このctx（このファイル冒頭のドキュメントコメント通り本来
  // cardTokenIdを含むはず）にcardTokenIdが抜けていた。runAction内でctx.cardTokenId
  // を参照するアクション（現状はPLACE_CARDのsource:"self"）が実行時に必ずundefined
  // を受け取ってしまうバグだったため、ここで明示的に引き継ぐ。
  const runCtx = {
    player: ctx.player,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: ctx.pieceTokenId,
    pieceLocation: ctx.pieceLocation,
    selections: {},
    arrivedAt: null,
  };
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

// 選ばれた1つの選択肢を実際に実行する（runHandEffectの内部処理を切り出したもの）。
async function runHandEffectOption(ctx, option, helpers) {
  // ユーザー要望「手札効果を使用したら、このカードが使用されるよ！って知らしめる
  // モーダルをしっかりと出したい」。実際の状態変更（捨てる・コスト支払い等）より前、
  // 「このカードを使う」と決まった瞬間に出す。
  helpers.announceUse?.(ctx.cardId, option.label);
  // ユーザー指摘: 手札効果は「原則まず最初にそのカードを捨てて効果を発動する」。
  // 凡例（docs/cards.md）「効果カード自身の処遇の記載がなければ、効果発動時に
  // このカードを捨てる」の「発動時に」は、追色コストの支払いやアクション実行より
  // 前——最初のステップだという指摘。実際、スラム上がりの役人の手札効果補足
  // 「あなたの手札が１枚以下ならの時の手札のカウントの際にこのカード自身は含まない」
  // の通り、後続のアクションが「捨てた後の手札状態」を参照する効果が実在するため、
  // 単なる見た目の順序の話ではなく実際に先に捨てておく必要がある。エターナル/
  // ファーストカードは基本効果「これの手札効果はこれがロックされていても使える」の
  // 通り消費されない特別枠のため、このデフォルトの対象外（cardIdの命名規則で判定、
  // main.js側の他の分岐と同じ基準）。なないろの欠片の「２枚をロックする」選択肢の
  // ように、選択肢自体がこのカードを別の形で処遇する場合はkeepsCardOnUseで上書きする。
  if (!option.keepsCardOnUse && !ctx.cardId.startsWith("eternal-") && !ctx.cardId.startsWith("first-")) {
    await helpers.discardAndSync(ctx.cardTokenId);
  }
  if (option.cost?.verb === VERBS.DISCARD_SAME_COLOR) {
    const color = getCardDefinition(ctx.cardId)?.color;
    const candidates = findSameColorDiscardCandidates(ctx.cardTokenId, color, ctx.player);
    // ユーザー要望「追色カードを手札から選択するステップを踏んでください」。候補が
    // 1枚でも自動採用せず、常にpickDiscardCostのステップを踏ませる。
    const chosen = await helpers.pickDiscardCost(candidates, `捨てる${color === "white" || color === "black" ? "" : "同じ色の"}カードを手札から選択してください`);
    if (!chosen) return false;
    await helpers.discardAndSync(chosen.id);
  }
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === ctx.player);
  // ハマりどころ: このruncCtxにcardTokenIdが抜けていたため、runAction内で
  // ctx.cardTokenIdを参照するアクション（LOCK_PAIRの「自分自身は除外して同名の
  // もう1枚を探す」判定、PLACE_CARDのsource:"self"等）が実行時に必ずundefinedを
  // 受け取ってしまうバグだった（LOCK_PAIRの場合、`t.id !== ctx.cardTokenId`が
  // 常にtrueになり除外が効かなくなる）。ctx.cardTokenIdをそのまま引き継ぐ。
  const runCtx = {
    player: ctx.player,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: piece?.id ?? null,
    pieceLocation: piece?.location ?? null,
    selections: {},
    arrivedAt: null,
    // ユーザー要望「対象が１人でもハイライトして選ばせるステップを踏んでください」。
    // 到達効果（runArrivalEffect）は従来通り候補1つなら自動採用のまま
    // （テンポを優先、今回の要望の対象外）——手札効果だけこのフラグで切り替える。
    forcePrompt: true,
  };
  for (const action of option.actions) {
    await runAction(action, runCtx, helpers);
  }
  recordHandEffectUsage(ctx.cardId, ctx.player);
  return true;
}

// 手札効果を自動処理する。ctx: { cardId, cardTokenId, player }。helpers（moveAndSync等の
// 既存分に加えて）:
//   discardAndSync(tokenId): 「追色」コストで実際にカードを1枚捨てる（オンライン同期込み）。
//   pickDiscardCost(candidates, hint): 追色コストの候補（同色の手札トークン配列）から
//     1枚選ばせる。
//   pickHandEffectOption(cardId, optionsWithUsability): 選択肢が2つ以上ある手札効果
//     （なないろの欠片等）で、どれを使うか選ばせる。optionsWithUsabilityの各要素は
//     `{...option, usable}` — usable:falseの選択肢はグレー表示にする（ユーザー要望）。
//     選ばれたoptionオブジェクト（またはキャンセル時null）を返す。
//   drawCards(player, count): 山札からplayerの手札へcount枚引く（オンライン同期込み）。
//   placeFromDeck(location): 山札の一番上を直接そのマスへ裏向きで置く（オンライン同期込み、
//     PLACE_CARDのsource:"deck"用）。
//   swapPieces(pieceTokenId, fromLocation, toLocation): 自分の駒と、toLocationにいる相手の
//     駒の位置を入れ替える（SWAP_POSITION用）。
//   announceUse(cardId, optionLabel): 「このカードを使用します」の告知モーダルを出す。
// マスチェンジ等、手札効果でも到達効果と同じアクション（PICKUP_TO_HAND・PLACE_CARD・
// SWAP_POSITION等）を使うカードが出てきたため、到達効果と同じrunAction()ディスパッチャを
// 共有する。自分の駒はplayerから引ける（盤面上に必ず1つだけ存在するため、呼び出し元から
// 別途渡してもらう必要は無い）。
// 戻り値: 実際に発動できた（コストを払えた）ならtrue、使用回数制限・コスト不足・
// 選択肢を選ばず終わった等で発動できなかったならfalse（呼び出し元がその旨を案内するために使う）。
export async function runHandEffect(ctx, helpers) {
  const options = getHandEffectOptions(ctx.cardId);
  if (options.length === 0) return false;
  if (!canUseHandEffect(ctx.cardId, ctx.cardTokenId, ctx.player)) return false;
  let chosenOption;
  if (options.length === 1) {
    chosenOption = options[0];
  } else {
    // ユーザー要望「手札効果は２つあります。効果選択モーダルを出してください。
    // 使用できない方はグレー表示。」
    const optionsWithUsability = options.map((opt) => ({
      ...opt,
      usable: isHandEffectOptionUsable(ctx.cardId, ctx.cardTokenId, ctx.player, opt),
    }));
    chosenOption = await helpers.pickHandEffectOption(ctx.cardId, optionsWithUsability);
    if (!chosenOption) return false;
  }
  return runHandEffectOption(ctx, chosenOption, helpers);
}
