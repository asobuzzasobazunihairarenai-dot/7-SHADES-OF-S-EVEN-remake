// ゲーム状態の不変条件チェッカー（続き164、ユーザー要望2026-08-17「①から」）。
// docs/ranked-spec.md ではなくスモークテストのバグ検出用。「絶対に成り立つはずの条件」を
// 状態から検査し、破れたものを {code, msg, detail} の配列で返す純粋関数。読み取り専用。
//
// 狙い: ゲームが止まらなくても“状態が壊れている”系のバグ（例: #132 スリカエで奪えず渡しただけ、
// 二重発火でカードが増減）を、どの経路でバグっても“結果の壊れ方”で捕まえる。個別のエラー監視より
// 一般的で、人間対戦でのバグ報告の負担を減らす。smoke-test-runner.js から毎ポーリング呼ばれる。

import { COLORS, SEAT_ORDER } from "./board-layout.js";
import { getCardDefinition } from "./cards-data.js";

// 山（piles）の中のカード枚数を数える。deck/eternal/first/discard に加え、マイデッキ戦の
// "myDeck-<seat>" パイルも含めるため、piles配下のあらゆる配列の長さを再帰的に合計する。
function countPileCards(piles) {
  let n = 0;
  const walk = (v) => {
    if (Array.isArray(v)) n += v.length;
    else if (v && typeof v === "object") for (const x of Object.values(v)) walk(x);
  };
  walk(piles ?? {});
  return n;
}

// 状態のカード総数（カードトークン + 山の枚数）。スモークが設定直後に baseline として記録する。
export function countCards(state) {
  const tokens = Array.isArray(state?.tokens) ? state.tokens : [];
  const cardTokens = tokens.filter((t) => t.kind === "card").length;
  return cardTokens + countPileCards(state?.piles);
}

// baselineCardCount を渡すと「カード総数の保存」も検査する（渡さなければスキップ）。
// 戻り値: [{ code, msg, detail }]。空配列＝違反なし。
export function checkInvariants(state, { baselineCardCount } = {}) {
  const v = [];
  const add = (code, msg, detail) => v.push({ code, msg, detail });
  if (!state || !Array.isArray(state.tokens)) {
    add("no-state", "state または state.tokens が無い");
    return v;
  }
  const tokens = state.tokens;
  const active = Array.isArray(state.activePlayers) ? state.activePlayers : [];

  // 1) トークンidの重複（クローン系バグ）。
  const idSeen = new Set();
  for (const t of tokens) {
    if (idSeen.has(t.id)) add("dup-token-id", `トークンidが重複: ${t.id}`, { id: t.id });
    else idSeen.add(t.id);
  }

  // 2) 位置の妥当性 & 3) 同じマスに駒が2つ以上（1マス1駒の原則）。
  const cellPieceCount = new Map(); // "row,col" -> 駒の数
  for (const t of tokens) {
    const loc = t.location;
    if (!loc || typeof loc !== "object") {
      add("invalid-location", `location が不正: ${t.id}`, { id: t.id, loc });
      continue;
    }
    if (loc.zone === "cell") {
      if (!(loc.row >= 0 && loc.row <= 6 && loc.col >= 0 && loc.col <= 6)) {
        add("invalid-location", `セル座標が範囲外: ${t.id} (${loc.row},${loc.col})`, { id: t.id, loc });
      }
      if (t.kind === "piece") {
        const k = `${loc.row},${loc.col}`;
        cellPieceCount.set(k, (cellPieceCount.get(k) ?? 0) + 1);
      }
    } else if (loc.zone === "lock") {
      if (!(loc.index >= 0 && loc.index <= 6)) add("invalid-location", `ロックindexが範囲外: ${t.id}`, { id: t.id, loc });
      if (!["bottom", "left", "top", "right"].includes(loc.side)) add("invalid-location", `ロックsideが不正: ${t.id}`, { id: t.id, loc });
    } else if (loc.zone === "hand" || loc.zone === "publicDraw") {
      if (!SEAT_ORDER.includes(loc.player)) add("invalid-location", `${loc.zone}のplayerが不正: ${t.id}`, { id: t.id, loc });
    } else {
      add("invalid-location", `未知のzone: ${t.id} zone=${loc.zone}`, { id: t.id, loc });
    }
  }
  for (const [k, count] of cellPieceCount) {
    if (count > 1) add("piece-overlap", `1マスに駒が${count}個: (${k})`, { cell: k, count });
  }

  // 4) 座席ごとに駒は1つ（セットアップ後）。駒は対局中に生成/破棄されない。
  if (active.length > 0) {
    for (const seat of active) {
      const n = tokens.filter((t) => t.kind === "piece" && t.player === seat).length;
      if (n !== 1) add("piece-count", `座席${seat}の駒が${n}個（1のはず）`, { seat, count: n });
    }
  }

  // 5/6) turnPlayer / priorityPlayer は activePlayers 内。
  if (active.length > 0) {
    if (state.turnPlayer != null && !active.includes(state.turnPlayer)) {
      add("turn-player", `turnPlayer=${state.turnPlayer} が activePlayers に無い`, { turnPlayer: state.turnPlayer, active });
    }
    if (state.priorityPlayer != null && !active.includes(state.priorityPlayer)) {
      add("priority-player", `priorityPlayer=${state.priorityPlayer} が activePlayers に無い`, { priorityPlayer: state.priorityPlayer, active });
    }
  }

  // 7) 未知の cardId（カード定義に無い）。null（非公開の裏向き等）は対象外。
  for (const t of tokens) {
    if (t.kind === "card" && t.cardId != null && !getCardDefinition(t.cardId)) {
      add("unknown-cardid", `未知のcardId: ${t.cardId} (${t.id})`, { id: t.id, cardId: t.cardId });
    }
  }

  // 8) ロックの色一致（通常色カードが違う色のロックスロットに入っていないか）。ロックは原則
  //    スロットの色のカードしか入らない（続き112）。noir等の「置いているだけ」(placed)・虹
  //    (rainbow=任意)・無色(white/black)・未知は除外。
  for (const t of tokens) {
    if (t.kind !== "card" || t.location?.zone !== "lock" || t.cardId == null || t.placed) continue;
    const def = getCardDefinition(t.cardId);
    if (!def) continue;
    const color = def.color;
    if (color === "rainbow" || color === "white" || color === "black") continue;
    if (COLORS.includes(color) && color !== COLORS[t.location.index]) {
      add("lock-color", `ロックの色不一致: ${t.cardId}(${color}) が index=${t.location.index}(${COLORS[t.location.index]}) のスロットに`, {
        id: t.id,
        cardId: t.cardId,
        color,
        index: t.location.index,
      });
    }
  }

  // 9) カード総数の保存（baseline が渡された時だけ）。カードトークン + 山の合計は一定のはず。
  //    ※ 効果の多段適用の途中を偶然ポーリングすると一時的にズレる可能性があるため、smoke側は
  //      「同じ違反が続いたら本物」という判断ができるよう detail に総数を含める。
  if (typeof baselineCardCount === "number") {
    const total = countCards(state);
    if (total !== baselineCardCount) {
      add("card-conservation", `カード総数が変化: ${total}（開始時 ${baselineCardCount}）`, { total, baseline: baselineCardCount });
    }
  }

  return v;
}
