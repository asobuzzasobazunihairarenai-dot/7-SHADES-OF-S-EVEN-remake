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
import { COLORS, SEAT_TO_SIDE, SIDE_TO_SEAT, GATE_POSITIONS, SEAT_ORDER } from "./board-layout.js";

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
// 選べる罠のように`arrival`ではなく`arrivalOptions`（複数選択肢から1つ選ぶ形の
// 到達効果）でデータを持つカードも対象に含める。
export function canAutoProcessArrival(cardId) {
  return autoProcessingEnabled && !!(CARD_EFFECTS[cardId]?.arrival || CARD_EFFECTS[cardId]?.arrivalOptions);
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

// docs/rulebook.md「ファーストカード/エターナルカード: 他のカードの効果の対象に
// ならない（奪われたり捨てることはできない）」。ロックされていても、選べる罠の
// 「ロックしているカードを1枚捨てる」のような他カードの効果からは常に除外する。
function isTargetableByOtherCardEffects(cardId) {
  return !cardId?.startsWith("eternal-") && !cardId?.startsWith("first-");
}

// 選べる罠専用: arrivalOptionsの1つの選択肢が今選べるか（docs/cards.mdの善処の原則
// 条件を満たすか）。requiresMinHandSize/requiresNotAtOwnGate/requiresHasLockedCardの
// いずれかを満たさなければ選べない（指定の無い条件はチェックしない）。
function isArrivalOptionUsable(player, pieceLocation, option) {
  if (option.requiresMinHandSize != null) {
    const count = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player).length;
    if (count < option.requiresMinHandSize) return false;
  }
  if (option.requiresNotAtOwnGate) {
    const gate = GATE_POSITIONS[SEAT_TO_SIDE[player]];
    if (pieceLocation && pieceLocation.row === gate.row && pieceLocation.col === gate.col) return false;
  }
  if (option.requiresHasLockedCard) {
    // ユーザー報告「ファーストカード1枚しかロックしていないのに『ロックしている
    // カードを1枚捨てる』を選べてしまっている」。ファースト/エターナルカードは
    // 他のカードの効果の対象にならないため、それらを除いた「捨てられるロック
    // カード」の有無で判定する。
    const side = SEAT_TO_SIDE[player];
    const hasLocked = getState().tokens.some(
      (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && isTargetableByOtherCardEffects(t.cardId)
    );
    if (!hasLocked) return false;
  }
  return true;
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

// なないろの欠片のLOCK_PAIR専用: 自分のロックエリアの7色スロット全部（埋まっている
// スロットも含む——通常の「1色1枚まで」占有チェックの対象外の特殊ロックのため）。
function getOwnLockSlotCandidates(player) {
  const side = SEAT_TO_SIDE[player];
  return COLORS.map((_, index) => ({ zone: "lock", side, index }));
}

// 黒の契約の烙印専用: 自分のロックエリアの「空いている」スロットだけ（通常のロックと
// 違い色は問わない、getOwnLockSlotCandidatesと違って占有中のスロットは除外する）。
function getOwnEmptyLockSlotCandidates(player) {
  const side = SEAT_TO_SIDE[player];
  return getOwnLockSlotCandidates(player).filter(
    (slot) => !getState().tokens.some((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === slot.index)
  );
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

// 処理順の原則（docs/cards.md「複数のプレイヤーを対象にした効果は原則、効果の
// 使用者から時計回りに効果を処理する」）: SEAT_ORDERをplayerから始まるように
// 回転させる。プレゼント・色落ちキャット等、複数箇所で同じ回転を個別に書いて
// いたのをここへ集約した。
function rotatedActivePlayersFrom(player) {
  const order = SEAT_ORDER.filter((p) => getState().activePlayers.includes(p));
  const startIdx = order.indexOf(player);
  return startIdx >= 0 ? [...order.slice(startIdx), ...order.slice(0, startIdx)] : order;
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
// 戻り値: 実際に何かが起きたか（true）、候補が無い等で「善処の原則」により何も
// 起きなかったか（false）。ユーザー要望「効果が不発だった場合は『不発のためこのカードを
// 手札に加えます』的なモーダルを出してほしい」への対応でrunArrivalEffect側が使う
// （runHandEffectOption側は今のところこの戻り値を見ていない）。
async function runAction(action, ctx, helpers) {
  switch (action.verb) {
    case VERBS.MOVE: {
      const candidates = getMoveCandidates(ctx.pieceLocation, action.count, !!action.atOnce);
      if (candidates.length === 0) return false; // 善処の原則: 選べる先が無ければ何もしない
      const dest =
        candidates.length === 1 && !ctx.forcePrompt ? candidates[0] : await helpers.pickLocation(candidates, "移動先のマスを選択してください");
      if (!dest) return false;
      // ユーザー要望「ジャンプ台で移動するときに専用の効果音を使ってください」。
      // action.sound（DSL側で指定した場合のみ）をそのままhelpers.moveAndSyncへ
      // 渡す。指定が無い他のMOVEアクションは従来通り無音のまま。
      await helpers.moveAndSync(ctx.pieceTokenId, dest, action.sound);
      ctx.pieceLocation = dest;
      ctx.arrivedAt = dest; // 呼び出し元が「移動の結果、新しいマスに到達した」連鎖判定に使う
      return true;
    }
    case VERBS.DRAW: {
      // target: SELF（自分だけ）/ALL_OPPONENTS（対象は自分以外の参加座席それぞれ、
      // 1人ずつ指定枚数）。helpers.drawCards(player, count)はplayerごとに1回呼ぶ。
      const players =
        action.target === TARGETS.ALL_OPPONENTS
          ? getState().activePlayers.filter((p) => p !== ctx.player)
          : action.target === TARGETS.ALL_PLAYERS
            ? getState().activePlayers
            : [ctx.player];
      for (const p of players) {
        await helpers.drawCards(p, action.count);
      }
      return true;
    }
    case VERBS.PICKUP_TO_HAND: {
      // withinCells指定時（橙のキューブ ハーベスト等）は「Nマス以内」に絞る。未指定なら
      // 従来通り盤面全体（収穫と種まき等）。
      const candidates =
        action.withinCells != null ? getCellsWithCardWithinRange(ctx.pieceLocation, action.withinCells) : getAnyCellWithCardCandidates();
      if (candidates.length === 0) return false;
      const chosen =
        candidates.length === 1 && !ctx.forcePrompt
          ? candidates[0]
          : await helpers.pickLocation(candidates, "手札に加えるカードのあるマスを選択してください");
      if (!chosen) return false;
      const token = getState().tokens.find(
        (t) =>
          t.kind === "card" &&
          t.location.zone === "cell" &&
          t.location.row === chosen.row &&
          t.location.col === chosen.col
      );
      if (!token) return false;
      const wasFaceUp = token.faceUp; // 手札に入ると自動で表向きになるため、移動前の状態を保持しておく
      await helpers.moveAndSync(token.id, { zone: "hand", player: ctx.player });
      helpers.onCardAcquiredToHand?.(token.id, token.cardId, wasFaceUp);
      if (action.target?.saveAs) {
        ctx.selections[action.target.saveAs] = chosen;
        helpers.markPlacementTarget?.(chosen);
      }
      return true;
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
      } else if (action.destination?.selection === TARGET_SELECTIONS.ALL_WITHIN_RANGE) {
        // 増殖する樹々専用: プレイヤーが選ぶのではなく、範囲内の「何もないマス」
        // （カードも駒も無いマス）全てが自動的に対象になる。自分がいるマスは自分の
        // 駒があるため、hasPieceAtの判定で自然に除外される（特別扱い不要）。
        const range = action.destination.withinCells ?? 0;
        for (const { dr, dc } of enumerateManhattanDisk(range)) {
          const row = ctx.pieceLocation.row + dr;
          const col = ctx.pieceLocation.col + dc;
          if (!inBounds(row, col)) continue;
          if (hasCardAt(row, col) || hasPieceAt(row, col)) continue;
          destinations.push({ zone: "cell", row, col });
        }
      } else if (action.destination?.selection === TARGET_SELECTIONS.OWN_EMPTY_LOCK_SLOTS) {
        // 黒の契約の烙印専用: 自分のロックエリアの空いているスロット（色不問）から選ぶ。
        const candidates = getOwnEmptyLockSlotCandidates(ctx.player);
        if (candidates.length === 0) return false; // 善処の原則: 空きが無ければ何もしない
        const dest = await helpers.pickLocation(candidates, "カードを置くロックエリアを選択してください");
        if (dest) destinations = [dest];
      } else {
        console.warn("card-effect-engine: place_cardのdestination.selectionが未対応です", action);
        return false;
      }
      if (destinations.length === 0) return false;
      for (const dest of destinations) {
        if (action.source === "self") {
          // ジャンプ台の手札効果／黒の契約の烙印の到達効果専用: このカード自身
          // （効果カード本体）を盤面またはロックエリアへ置く。他の手札からの選択とは
          // 違い相手に選ばせる必要が無い。destは既に正しい形（cellまたはlock）で
          // 渡ってくるため、ここで作り直さずそのまま使う。
          await helpers.moveAndSync(ctx.cardTokenId, dest);
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
        // ハイライトしてください。マスの枠だけでなくカードの面も」。マスハイライト用の
        // ため、盤面（cell）への配置の時だけ呼ぶ（黒の契約の烙印のロックエリア配置は
        // 対象外——row/colを持たないロックスロットは元々この演出の対象外）。
        if (dest.zone === "cell") helpers.markPlacedLocation?.(dest);
      }
      return true;
    }
    case VERBS.SWAP_POSITION: {
      // 「入れ替え」であり「移動」ではないため（docs/cards.md補足）、到達判定は連鎖させない
      // （ctx.arrivedAtをセットしない）。
      const candidates = getOpponentPieceCellsWithinRange(ctx.pieceLocation, action.count, ctx.player);
      if (candidates.length === 0) return false;
      // ユーザー要望「３マス以内の相手をハイライトしてプレイヤーに選ばせるステップを
      // 踏んでください（対象が１人でも）」＋「到達効果でも手札効果と同じように相手を
      // 選ぶステップを入れてください」。他のアクション（MOVE等）は「候補が1つなら
      // テンポ優先で自動採用、手札効果だけforcePromptで強制」という設計だが、
      // 入れ替えは結果の重さが違うため、到達・手札のどちらの経路でも
      // （ctx.forcePromptに関係なく）常にプレイヤーに選ばせる。
      const target = await helpers.pickLocation(candidates, "入れ替える相手のマスを選択してください");
      if (!target) return false;
      await helpers.swapPieces(ctx.pieceTokenId, ctx.pieceLocation, target);
      ctx.pieceLocation = target;
      return true;
    }
    case VERBS.LOCK_PAIR: {
      // なないろの欠片専用: これを含めた同名2枚を、任意の1箇所（自分のロックエリアの
      // 好きな色スロット、通常の1色1枚の占有チェックは対象外の特殊ロック）へまとめて置く。
      const partner = getState().tokens.find(
        (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === ctx.player && t.cardId === "rainbow-shard" && t.id !== ctx.cardTokenId
      );
      if (!partner) return false;
      const candidates = getOwnLockSlotCandidates(ctx.player);
      const dest = await helpers.pickLocation(candidates, "ロックする場所を選択してください");
      if (!dest) return false;
      await helpers.moveAndSync(ctx.cardTokenId, dest);
      await helpers.moveAndSync(partner.id, dest);
      return true;
    }
    case VERBS.DRAW_IF_FEWEST_LOCKED: {
      if (!isFewestLocked(ctx.player)) return false;
      // ユーザー要望「カウンターロックの到達効果について『あなたは１番少なくロック
      // しているので１枚ドローします』みたいなモーダルを出してからドローして
      // ください」。判定条件（盤面全体のロック枚数比較）は見ただけでは分からないため、
      // 先に理由を説明してから実際にドローする。
      await helpers.announceEffectReason?.(ctx.cardId, "あなたは１番少なくロックしているので１枚ドローします。");
      await helpers.drawCards(ctx.player, 1);
      return true;
    }
    case VERBS.SWAP_RANDOM_HAND_CARD: {
      // 手品師の技専用。ユーザー要望「駒ではなくアバターを選択して相手を選ぶ」への
      // 対応で、マス/駒ベースのpickLocationではなく専用のpickPlayer（アバターを
      // クリックして選ぶ）を使う。実際の手札交換（相手の手札を裏向きのまま画面中央に
      // 表示して選ばせる「儀式」演出＋自分から渡すカードは自分で選べる）はhelpers側
      // （main.jsのswapHandCardWithOpponentForEffect）に委ねる。
      const opponents = getState().activePlayers.filter((p) => p !== ctx.player);
      if (opponents.length === 0) return false;
      const targetPlayer = await helpers.pickPlayer(opponents, "手札を交換する相手を選んでください（アバターをクリック）");
      if (!targetPlayer) return false;
      await helpers.swapRandomHandCard(ctx.player, targetPlayer);
      return true;
    }
    case VERBS.DRAW_ALL_FEWEST_LOCKED: {
      // プレゼント専用: カウンターロック（DRAW_IF_FEWEST_LOCKED、効果の使用者本人だけ
      // 判定）と違い、「該当する全員」がそれぞれドローする。処理順の原則（docs/cards.md
      // 「複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに処理する」）
      // に沿うよう、SEAT_ORDERをctx.playerから時計回りに並べ替えてから絞り込む。
      const qualifying = rotatedActivePlayersFrom(ctx.player).filter((p) => isFewestLocked(p));
      if (qualifying.length === 0) return false;
      await helpers.announceEffectReason?.(ctx.cardId, "１番少なくロックしている全員が１枚ドローします。");
      for (const p of qualifying) {
        await helpers.drawCards(p, 1);
      }
      return true;
    }
    case VERBS.DISCARD_ALL_FACEUP_ON_BOARD: {
      // 白の意思の覚醒専用: 盤面マスにある表向きのカード全てを捨てる（１番上の原則により
      // 「場」＝盤面マスの一番上のカードだけが対象、という前提はgetState().tokensの
      // location.zone==="cell"フィルタで自然に満たされる——重なりの下側は元々別トークンの
      // faceUp状態を問わず対象に含めてよいわけではないが、この効果は「表向きのカード」
      // 全部が対象という素直な読みのため、重なりの上下は区別せずfaceUp:trueの盤面
      // カード全てを対象にする）。
      const candidates = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "cell" && t.faceUp);
      if (candidates.length === 0) return false;
      for (const token of candidates) {
        await helpers.discardAndSync(token.id);
      }
      return true;
    }
    case VERBS.DISCARD_SELF: {
      // なないろの巨光・色落ちキャット専用: 既定動作（手札に加える）の代わりに
      // このカード自身を捨てる（effectDef.addsCardToHandAfter:falseと対で使う）。
      await helpers.discardAndSync(ctx.cardTokenId);
      return true;
    }
    case VERBS.ALL_PLAYERS_DISCARD_HAND_AND_DRAW: {
      // 色落ちキャット専用: 参加者全員が手札を全て捨ててから指定枚数ドローする
      // （処理順の原則に沿い、効果の使用者から時計回りに1人ずつ処理する）。
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        const handTokens = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p);
        for (const token of handTokens) {
          await helpers.discardAndSync(token.id);
        }
        await helpers.drawCards(p, action.count);
      }
      return true;
    }
    case VERBS.DISCARD_HALF_HAND: {
      // 選べる罠専用: 手札の半分（端数切り捨て、docs/rulebook.md「手札の半分」の
      // 定義通り）を、自分で選んで捨てる（ゲート侵攻ボーナスの「無作為に奪う」とは
      // 違い、これは自分自身の手札を自分で選ぶ効果のため隠し情報の抽選は不要）。
      const handTokens = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === ctx.player);
      const discardCount = Math.floor(handTokens.length / 2);
      if (discardCount === 0) return false;
      for (let i = 0; i < discardCount; i++) {
        const chosen = await helpers.pickHandCard(ctx.player, `捨てるカードを手札から選択してください（残り${discardCount - i}枚）`);
        if (!chosen) break;
        await helpers.discardAndSync(chosen.id);
      }
      return true;
    }
    case VERBS.FORCED_MOVE_TO_OWN_GATE: {
      // 選べる罠専用: 自分のゲートへ強制移動する。「移動」であり接触の強制移動と同じく
      // 到達判定は連鎖する（docs/cards.mdにSWAP_POSITION等のような「到達効果を得ない」
      // 旨の記載が無いため）。
      const gate = GATE_POSITIONS[SEAT_TO_SIDE[ctx.player]];
      const dest = { zone: "cell", row: gate.row, col: gate.col };
      if (ctx.pieceLocation.row === dest.row && ctx.pieceLocation.col === dest.col) return false; // 善処の原則: 既に自分のゲートにいるなら何もしない
      await helpers.moveAndSync(ctx.pieceTokenId, dest);
      ctx.pieceLocation = dest;
      ctx.arrivedAt = dest;
      return true;
    }
    case VERBS.DISCARD_ONE_LOCKED_CARD: {
      // 選べる罠専用: 自分のロックしているカードから1枚選んで捨てる。lock_pair等と同じく
      // ロックスロットの形（{zone:"lock",side,index}）をそのままpickLocationの候補として使う。
      // ファースト/エターナルカードは他のカードの効果の対象にならないため候補から除外する
      // （docs/rulebook.md、isArrivalOptionUsableのrequiresHasLockedCard判定と揃える）。
      const side = SEAT_TO_SIDE[ctx.player];
      const lockedTokens = getState().tokens.filter(
        (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && isTargetableByOtherCardEffects(t.cardId)
      );
      if (lockedTokens.length === 0) return false;
      const candidates = lockedTokens.map((t) => t.location);
      const dest = candidates.length === 1 ? candidates[0] : await helpers.pickLocation(candidates, "捨てるロックカードを選択してください");
      if (!dest) return false;
      const chosen = lockedTokens.find((t) => t.location.side === dest.side && t.location.index === dest.index);
      if (!chosen) return false;
      await helpers.discardAndSync(chosen.id);
      return true;
    }
    case VERBS.DECLARE_COLORS: {
      // ザ・ギャンブル（action.minCount、以上）/試練の儀式（action.count、固定数）
      // 共通。実際の選択UI（複数色から選ばせる）はhelpers側（main.jsのdeclareColorsForEffect）
      // に委ねる。選んだ色はctx.selectionsに保存し、後続のアクションから参照する。
      const chosen = await helpers.declareColors(action.minCount != null ? { minCount: action.minCount } : { exactCount: action.count });
      if (!chosen || chosen.length === 0) return false;
      ctx.selections.declaredColors = chosen;
      return true;
    }
    case VERBS.PUBLIC_DRAW_MATCHING_DECLARED_COLOR_COUNT: {
      // ザ・ギャンブル専用: 直前のDECLARE_COLORSで宣言した色の種類数分、公開ドローする。
      const declaredColors = ctx.selections.declaredColors;
      if (!declaredColors?.length) return false;
      const revealedCardIds = await helpers.publicDraw(ctx.player, declaredColors.length);
      ctx.selections.revealedCardIds = revealedCardIds;
      return revealedCardIds.length > 0;
    }
    case VERBS.DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED: {
      // ザ・ギャンブル専用: 公開ドローした中に宣言色が1つでもあれば、手札を全て捨てる。
      // 「ドロー」＝「山札から手札に加える」ため、この効果でドローしたカード（＝まだ
      // publicDrawゾーンにあり通常の手札には合流していない分）も対象に含める
      // （docs/cards.md補足）。
      const declaredColors = ctx.selections.declaredColors ?? [];
      const revealedCardIds = ctx.selections.revealedCardIds ?? [];
      const matches = revealedCardIds.some((cardId) => declaredColors.includes(getCardDefinition(cardId)?.color));
      if (!matches) return false;
      await helpers.announceEffectReason?.(ctx.cardId, "公開した中に宣言した色があったため、手札を全て捨てます。");
      const toDiscard = getState().tokens.filter(
        (t) =>
          t.kind === "card" &&
          ((t.location.zone === "hand" && t.location.player === ctx.player) ||
            (t.location.zone === "publicDraw" && t.location.player === ctx.player))
      );
      for (const token of toDiscard) {
        await helpers.discardAndSync(token.id);
      }
      return true;
    }
    case VERBS.RITUAL_PLACE_MOVE_REPEAT: {
      // 試練の儀式専用: 隣接するマスへ山札から1枚表向きで置く→そこへ移動
      // （到達効果は得ない、ctx.arrivedAtはセットしない）→置いたカードの色が宣言色
      // なら繰り返す。無限ループの安全弁として最大回数を設ける（実際には盤面の広さ・
      // 山札の残り枚数で自然に制限されるが、念のため）。
      // ユーザー報告「色を３色宣言しただけで終わってしまっている」の原因: 合同建設・
      // 増殖する樹々は実際の文言に明示的に「何もないマス」とあるためカードの無い
      // マスに限定していたが、試練の儀式の実際の文言「あなたの隣に山札から１枚
      // 表向きで置く。」にはその限定が無い（docs/cards.mdの「１番上の原則」の通り、
      // 既にカードのあるマスにも上から重ねて置ける）。誤ってhasCardAtでも候補を
      // 除外していたため、盤面がある程度埋まっている実戦ではほぼ常に候補0件になり、
      // 色宣言の直後で効果が止まってしまっていた。駒は1マスにつき1つまで
      // （docs/rulebook.md）なのでhasPieceAtの除外だけ残す。
      const declaredColors = ctx.selections.declaredColors;
      if (!declaredColors?.length) return false;
      let placedAny = false;
      const MAX_ITERATIONS = 20;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const adjacentCandidateCells = enumerateManhattanRing(1)
          .map(({ dr, dc }) => ({ row: ctx.pieceLocation.row + dr, col: ctx.pieceLocation.col + dc }))
          .filter(({ row, col }) => inBounds(row, col) && !hasPieceAt(row, col))
          .map(({ row, col }) => ({ zone: "cell", row, col }));
        if (adjacentCandidateCells.length === 0) break; // 善処の原則: 置ける隣接マスが無ければそこで終わる
        const dest =
          adjacentCandidateCells.length === 1
            ? adjacentCandidateCells[0]
            : await helpers.pickLocation(adjacentCandidateCells, "カードを置く隣接マスを選択してください");
        if (!dest) break;
        const placedCardId = await helpers.placeFromDeckFaceUp(dest);
        if (!placedCardId) break; // 山札切れ等
        placedAny = true;
        await helpers.moveAndSync(ctx.pieceTokenId, dest);
        ctx.pieceLocation = { row: dest.row, col: dest.col };
        const placedColor = getCardDefinition(placedCardId)?.color;
        if (!declaredColors.includes(placedColor)) break;
      }
      return placedAny;
    }
    case VERBS.ALL_PLAYERS_PLACE_TWO_CARDS_IN_EMPTY_CELLS: {
      // 合同建設専用: 全員がそれぞれ「何もない2マスに山札または手札から1枚裏向きで
      // 置く」を、処理順の原則に沿って1人ずつ行う。各プレイヤー自身の選択
      // （マス・山札か手札か・どのカードか）はhelpers.delegateToPlayerに委ねる
      // （main.js側：自分の番ならその場で、他プレイヤーの番ならオンライン中継で
      // 対象プレイヤー本人の画面に委任する）。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        if (await helpers.delegateToPlayer(p, "joint-construction")) hadEffect = true;
      }
      return hadEffect;
    }
    case VERBS.ALL_PLAYERS_DISCARD_TO_THREE: {
      // スラム上がりの役人専用: 全員がそれぞれ「手札が3枚になるまで自分で選んで
      // 捨てる」を、処理順の原則に沿って1人ずつ行う。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        if (await helpers.delegateToPlayer(p, "slum-official-discard")) hadEffect = true;
      }
      return hadEffect;
    }
    case VERBS.ALL_PLAYERS_CHOOSE_PARTY_OPTION: {
      // パーティー専用: 全員がそれぞれ3択から1つ選んで得る、を処理順の原則に沿って
      // 1人ずつ行う。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        if (await helpers.delegateToPlayer(p, "party-option")) hadEffect = true;
      }
      return hadEffect;
    }
    default:
      console.warn(`card-effect-engine: 未対応の動詞 "${action.verb}"`);
      return false;
  }
}

// 選べる罠専用: 「以下の効果のうち1つ得る」形の到達効果（arrivalOptions）を処理する。
// なないろの欠片のhandEffectOptionsと同じ考え方だが、選ぶのはこのカードの到達効果
// 自身なので、使えるプレイヤーは常にeffectの使用者本人（対象選択は不要）。
async function runArrivalOptionsEffect(ctx, options, helpers) {
  const runCtx = {
    player: ctx.player,
    cardId: ctx.cardId,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: ctx.pieceTokenId,
    pieceLocation: ctx.pieceLocation,
    selections: {},
    arrivedAt: null,
  };
  const usableOptions = options.filter((opt) => isArrivalOptionUsable(runCtx.player, runCtx.pieceLocation, opt));
  let hadEffect = false;
  if (usableOptions.length > 0) {
    const optionsWithUsability = options.map((opt) => ({ ...opt, usable: usableOptions.includes(opt) }));
    const chosen = await helpers.pickArrivalOption(ctx.cardId, optionsWithUsability);
    if (chosen) {
      for (const action of chosen.actions) {
        if (await runAction(action, runCtx, helpers)) hadEffect = true;
      }
    }
  }
  // docs/cards.md補足「全て選べないときは効果は不発となる。効果が不発の時は、この
  // カードをあなたの手札に加えるだけである」。選べる選択肢自体が無い場合に加え、
  // 選択肢はあったが（プレイヤーがピッカーをキャンセルした等で）結局何も起きなかった
  // 場合も同じ扱いにする。
  if (!hadEffect) {
    await helpers.announceFizzle?.(ctx.cardId, true);
  }
  await helpers.moveAndSync(ctx.cardTokenId, { zone: "hand", player: ctx.player });
  return runCtx.arrivedAt;
}

// 到達効果を自動処理する。ctx: { cardId, player, pieceTokenId, cardTokenId, pieceLocation }。
// 戻り値: 効果中にmoveが発生し新しいマスへ到達した場合はその場所（呼び出し元が続けて
// そのマスの到達判定を行うために使う）、それ以外はnull。
export async function runArrivalEffect(ctx, helpers) {
  // 選べる罠専用: `arrival`ではなく`arrivalOptions`でデータを持つカードは別経路。
  const arrivalOptions = CARD_EFFECTS[ctx.cardId]?.arrivalOptions;
  if (arrivalOptions) return runArrivalOptionsEffect(ctx, arrivalOptions, helpers);
  const effectDef = CARD_EFFECTS[ctx.cardId]?.arrival;
  if (!effectDef) return null;
  // ハマりどころ: このctx（このファイル冒頭のドキュメントコメント通り本来
  // cardTokenIdを含むはず）にcardTokenIdが抜けていた。runAction内でctx.cardTokenId
  // を参照するアクション（現状はPLACE_CARDのsource:"self"）が実行時に必ずundefined
  // を受け取ってしまうバグだったため、ここで明示的に引き継ぐ。
  const runCtx = {
    player: ctx.player,
    cardId: ctx.cardId,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: ctx.pieceTokenId,
    pieceLocation: ctx.pieceLocation,
    selections: {},
    arrivedAt: null,
  };
  let hadEffect = false;
  for (const action of effectDef.actions) {
    if (await runAction(action, runCtx, helpers)) hadEffect = true;
  }
  // ユーザー要望「効果が不発だった場合（例: マスチェンジで３マス以内に相手がいない等）
  // は『不発のためこのカードを手札に加えます』的なモーダルを出しましょう」。アクションが
  // 1つ以上あるのに1つも実際には起きなかった場合だけが対象——なないろの欠片のように
  // actions:[]（＝到達効果自体が元々存在しないカード）は「不発」ではなく仕様通りの
  // 「何もしない」なので、こちらは対象外にする。
  if (effectDef.actions.length > 0 && !hadEffect) {
    await helpers.announceFizzle?.(ctx.cardId, effectDef.addsCardToHandAfter !== false);
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
    cardId: ctx.cardId,
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
