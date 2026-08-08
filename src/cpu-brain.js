// ローカルCPU戦の「賢いCPU」の思考。performPriorityTimeoutAutoAction（main.js）の各選択
// （まずは移動先）で、完全ランダム（新人）の代わりに評価値の高い手を選ぶ。難易度は
// cpu-battle-state.js が持つ（新人＝ここを使わずランダム／中級・上級・最強でここを使う）。
//
// 設計方針:
//  - 効果を厳密にシミュレーションはしない（19種のカード効果を正確に読み切るのはコストと
//    不確実性が高い）。代わりに「確信の持てる少数の指標」だけで堅実に評価する:
//      ①相手ゲートへの着地＝ターン終了時にゲート侵攻（手札半分＋エターナル獲得）＝最重要。
//      ②明確に自滅な到達カード（選べる罠・ザ・ギャンブル等）はマイナス。
//      ③まだロックしていない色のカードに着地＝手札に加われば7色勝利へ前進＝ゆるくプラス。
//      ④接触（体当たりで相手をゲートへ戻す妨害）は、相手が自分より進んでいれば価値が高い。
//  - 伏せカードは「非公開情報」。中級・上級は中立(0)扱い。最強(のぞき見)だけ中身を見て評価。
//  - 同点の手が複数あればその中からランダムに選ぶ（ロボット的な一本道を避ける）。
// main.js を import しない（循環回避）。DOM/スタック順に依存する情報（着地マスの一番上の
// カード・駒の持ち主）は main.js 側で調べて enriched candidate として渡してもらう。

import { getState } from "./state.js";
import { getCardDefinition } from "./cards-data.js";
import { GATE_POSITIONS, SIDE_TO_SEAT, SEAT_TO_SIDE, COLORS } from "./board-layout.js";
import { isCpuPeekAllowed, isCpuOpponentAware } from "./cpu-battle-state.js";

// カードごとの「そのマスに着地して到達効果を受けるのが得か損か」の大まかな評価値。
// 確信の持てるものだけ載せる（不明・中立なカードは 0 のまま＝載せない）。過剰な決めつけで
// かえって弱くしないよう、明確に自滅な系はマイナス、明確にカード得な系はプラスに留める。
const ARRIVAL_VALUE = {
  "blue-choosable-trap": -3, // 選べる罠: 手札半分捨て/強制移動/ロック捨て…どれかを必ず被る
  "yellow-gamble": -1, // ザ・ギャンブル: 手札全捨てのリスク
  "pink-present": -1, // プレゼント: 最少ロックの相手を利する可能性
  "orange-harvest-sow": 2, // 収穫と種まき: カード回収（手札得）
  "green-growing-trees": 1, // 増殖する樹々: カード配置
  "purple-trial-ritual": 1, // 試練の儀式: 連続移動（機動力）
  "red-jump-pad": 1, // ジャンプ台: 大きく移動（機動力）
  "black-contract-brand": 1,
};

// このマスがどの座席のゲートか（ゲートでなければ null）。GATE_POSITIONS/着地候補はどちらも
// state 絶対座標（performPriorityTimeoutAutoAction が dataset.row/col をそのまま state
// location に使っている）なので、そのまま突き合わせられる。
function gateSeatAt(row, col) {
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    if (pos.row === row && pos.col === col) return SIDE_TO_SEAT[side];
  }
  return null;
}

// 各座席のロック枚数（進行度の目安）。ロックゾーンのカードを side→seat で数える。
function lockCountBySeat(state) {
  const counts = {};
  for (const t of state.tokens) {
    if (t.kind !== "card" || t.location.zone !== "lock") continue;
    const seat = SIDE_TO_SEAT[t.location.side];
    if (!seat) continue;
    counts[seat] = (counts[seat] ?? 0) + 1;
  }
  return counts;
}

// seat がまだロックしていない色の集合（着地して手札に加われば勝利へ前進する色）。
function neededColors(state, seat) {
  const side = SEAT_TO_SIDE[seat];
  const locked = new Set();
  for (const t of state.tokens) {
    if (t.kind !== "card" || t.location.zone !== "lock" || t.location.side !== side) continue;
    const c = COLORS[t.location.index];
    if (c) locked.add(c);
  }
  return new Set(COLORS.filter((c) => !locked.has(c)));
}

function scoreMove(c, seat, ctx) {
  let score = 0;
  const gateSeat = gateSeatAt(c.row, c.col);

  if (c.isMove) {
    // ①相手ゲートへの着地＝ターン終了時にゲート侵攻。最重要。
    if (gateSeat && gateSeat !== seat && ctx.activePlayers.includes(gateSeat)) score += 6;
    // 自分のゲートに戻っても侵攻ボーナスは無いので、他に良い手があればそちらを優先。
    if (gateSeat === seat) score -= 0.5;

    // ②③着地カードの評価（表向き、または最強ののぞき見時のみ中身が分かる）。
    const known = c.topCardId && (c.topFaceUp || ctx.peek);
    if (known) {
      score += ARRIVAL_VALUE[c.topCardId] ?? 0;
      const def = getCardDefinition(c.topCardId);
      if (def && ctx.needed.has(def.color)) score += 1; // まだ要る色
    }
  } else if (c.occupantPlayer && c.occupantPlayer !== seat) {
    // ④接触（体当たり）＝相手をゲートへ戻す妨害。上級以上は相手が自分以上に進んでいれば
    // 高評価。中級でも妨害自体は概ね悪くないので軽く前向き。
    const theirLocks = ctx.locks[c.occupantPlayer] ?? 0;
    const myLocks = ctx.locks[seat] ?? 0;
    if (ctx.oppAware && theirLocks >= myLocks) score += 2;
    else score += 0.3;
  }
  return score;
}

// 移動/接触の候補（enriched: {el, isMove, row, col, topCardId, topFaceUp, occupantPlayer}）から
// 最善手を選ぶ。候補が無ければ null。同点はランダムに1つ。
export function chooseMoveCandidate(candidates, driveSeat) {
  if (!candidates || candidates.length === 0) return null;
  const state = getState();
  const ctx = {
    peek: isCpuPeekAllowed(),
    oppAware: isCpuOpponentAware(),
    activePlayers: state.activePlayers ?? [],
    locks: lockCountBySeat(state),
    needed: neededColors(state, driveSeat),
  };
  let best = -Infinity;
  const scored = candidates.map((c) => {
    const s = scoreMove(c, driveSeat, ctx);
    if (s > best) best = s;
    return { c, s };
  });
  const top = scored.filter((x) => x.s >= best - 0.01).map((x) => x.c);
  return top[Math.floor(Math.random() * top.length)];
}

// --- 色宣言（ザ・ギャンブル／試練の儀式）の思考 ---------------------------------------------
// ザ・ギャンブル(yellow-gamble): 宣言色が公開ドローに出ると手札を全部捨てる＝「当てたくない」。
//   → 引かれにくい（残りが少ない）色を最少数だけ宣言する。
// 試練の儀式(purple-trial-ritual): 置いたカードが宣言色なら儀式が続く＝「当てたい」。
//   → 出やすい（残りが多い）色を宣言する。
// 中級・上級は公開情報から各色の残り枚数を推定（フェア）。最強のみ山札(順序)をのぞき見して確実な宣言。

const TOTAL_PER_COLOR = 14; // 各7色 = 2種 × 7枚（通常カードのみが山札に入る）

// 公開情報から推定した「まだ引かれ得る各色の枚数」。CPUから見えているカード（ロック・表向きの
// 盤面・自分の手札・公開ドロー・捨て場）を全体(14)から引く。相手の手札・伏せカードは不明として残す。
function remainingByColorFair(state, seat) {
  const gone = {};
  for (const c of COLORS) gone[c] = 0;
  const bump = (cardId) => {
    const col = getCardDefinition(cardId)?.color;
    if (COLORS.includes(col)) gone[col] += 1;
  };
  for (const t of state.tokens) {
    if (t.kind !== "card") continue;
    const loc = t.location;
    const visible =
      loc.zone === "lock" ||
      (loc.zone === "cell" && t.faceUp) ||
      loc.zone === "publicDraw" ||
      (loc.zone === "hand" && loc.player === seat);
    if (visible) bump(t.cardId);
  }
  for (const cardId of state.piles?.discard ?? []) bump(cardId);
  const remaining = {};
  for (const c of COLORS) remaining[c] = Math.max(0, TOTAL_PER_COLOR - gone[c]);
  return remaining;
}

// base に足りない分を、残り枚数の多い(common=true)／少ない(false)順で重複なく補って n 色にする。
function fillColors(base, n, state, seat, common) {
  const remaining = remainingByColorFair(state, seat);
  const sorted = COLORS.slice().sort((a, b) => (common ? remaining[b] - remaining[a] : remaining[a] - remaining[b]));
  const out = [...base];
  for (const c of sorted) {
    if (out.length >= n) break;
    if (!out.includes(c)) out.push(c);
  }
  return out.slice(0, n);
}

export function chooseDeclaredColors(cardId, requiredCount, driveSeat) {
  const state = getState();
  const seek = cardId !== "yellow-gamble"; // ギャンブルだけ「当てたくない」、それ以外(試練)は「当てたい」
  const n = Math.max(1, requiredCount || 1);

  // 最強: 山札の一番上（次に引かれる/置かれる）をのぞき見して確実に宣言する。
  if (isCpuPeekAllowed()) {
    const deck = state.piles?.deck ?? [];
    const topColors = [];
    for (let i = 0; i < n && i < deck.length; i++) {
      topColors.push(getCardDefinition(deck[deck.length - 1 - i])?.color);
    }
    if (seek) {
      // 試練: 次に置かれる山札の一番上の色を宣言に含める（虹＝全色扱いなら何を宣言しても当たる）。
      const top = topColors[0];
      const base = top && COLORS.includes(top) ? [top] : [];
      return fillColors(base, n, state, driveSeat, true);
    }
    // ギャンブル: これから引かれる n 枚の色を避けて宣言する（虹があれば全色に当たるので避けられない）。
    const hasRainbow = topColors.includes("rainbow");
    if (!hasRainbow) {
      const drawn = new Set(topColors.filter((c) => COLORS.includes(c)));
      const remaining = remainingByColorFair(state, driveSeat);
      // 引かれない色の中から、さらに残りが少ない色を優先して n 色選ぶ（この先の再抽選にも強い）。
      const safe = COLORS.filter((c) => !drawn.has(c)).sort((a, b) => remaining[a] - remaining[b]);
      if (safe.length >= n) return safe.slice(0, n);
    }
    // 避けられない場合は下の一般ロジック（残り最少）で妥協。
  }

  // 中級・上級: スカーシティ推定で宣言。seek=残りが多い色、avoid=残りが少ない色。
  const remaining = remainingByColorFair(state, driveSeat);
  const sorted = COLORS.slice().sort((a, b) => remaining[b] - remaining[a]); // 多い順
  return seek ? sorted.slice(0, n) : sorted.slice(-n);
}

// --- 効果の選択肢（パーティ／選べる罠 等）の思考 ------------------------------------------
// 選択肢はカードごとに意味が違うため、id で分かるカードだけ賢く選び、不明なカードは usable の
// 中からランダム（新人相当）にフォールバックする。usableCandidates は usable:true のものだけが
// 渡ってくる前提（呼び出し側で絞り込み済み）。
const OPTION_RANK = {
  // パーティー（pink-party）: 場のカードを手札に得る(pickup)＞1マス移動(move)＞2枚オープン(open-two)。
  // 高いほど良い。
  "pink-party": { pickup: 3, move: 2, "open-two": 1 },
  // 選べる罠（blue-choosable-trap）: いずれも損だが、被害の小さい順に。ゲート強制移動(カード損失
  // 無し)＞手札半分捨て（札は失うがロックは無事）＞ロックを1枚捨て（色が減る＝勝利が遠のく最悪）。
  "blue-choosable-trap": { "forced-move-to-own-gate": 3, "discard-half-hand": 2, "discard-one-locked-card": 1 },
};

// --- ゲート侵攻の状況判断（ユーザー要望2026-08-08「ゲート侵攻に重きを」） ---------------------
function pieceCellOf(state, seat) {
  const p = state.tokens.find((t) => t.kind === "piece" && t.player === seat);
  return p && p.location.zone === "cell" ? { row: p.location.row, col: p.location.col } : null;
}
function activeOpponentGateCells(state, seat) {
  const active = state.activePlayers ?? [];
  const cells = [];
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const owner = SIDE_TO_SEAT[side];
    if (owner && owner !== seat && active.includes(owner)) cells.push({ row: pos.row, col: pos.col });
  }
  return cells;
}
// 今まさに相手ゲートに乗っている（＝このままターン終了でゲート侵攻できる）か。
function isOnActiveOpponentGate(state, seat) {
  const cell = pieceCellOf(state, seat);
  if (!cell) return false;
  return activeOpponentGateCells(state, seat).some((g) => g.row === cell.row && g.col === cell.col);
}
// 1マス（上下左右）移動で相手ゲートに乗れるか。
function canReachOpponentGateInOneStep(state, seat) {
  const cell = pieceCellOf(state, seat);
  if (!cell) return false;
  return activeOpponentGateCells(state, seat).some((g) => Math.abs(g.row - cell.row) + Math.abs(g.col - cell.col) === 1);
}

export function chooseEffectOption(cardId, usableCandidates, driveSeat) {
  if (!usableCandidates || usableCandidates.length === 0) return null;
  const rankMap = OPTION_RANK[cardId];
  if (!rankMap) {
    // 未対応のカード（ザ・ギャンブルの公開方式・なないろの欠片のロック先等）は無理に評価せず
    // ランダム（新人相当）。
    return usableCandidates[Math.floor(Math.random() * usableCandidates.length)];
  }
  const state = getState();
  const rankOf = (opt) => {
    let r = rankMap[opt.id] ?? 0;
    // ゲート侵攻重視（ユーザー要望2026-08-08）:
    // ・パーティの「1マス移動」で相手ゲートに乗れるなら、拾うより移動を優先（侵攻セットアップ）。
    if (cardId === "pink-party" && opt.id === "move" && canReachOpponentGateInOneStep(state, driveSeat)) r = 5;
    // ・選べる罠の「自ゲートへ強制移動」は、今まさに相手ゲートに乗って侵攻できる状況なら避ける
    //   （自ゲートへ戻ると侵攻が消える）。手札半分捨て等の方がマシ。
    if (cardId === "blue-choosable-trap" && opt.id === "forced-move-to-own-gate" && isOnActiveOpponentGate(state, driveSeat)) r = -1;
    return r;
  };
  let best = null;
  let bestScore = -Infinity;
  for (const opt of usableCandidates) {
    const score = rankOf(opt);
    if (score > bestScore) {
      bestScore = score;
      best = opt;
    }
  }
  return best ?? usableCandidates[0];
}

// 効果中のマス選択（type:"cell"の自動代行）用。候補に相手ゲートがあればそこを最優先で選ぶ
// （パーティの1マス移動先・試練の隣接マス等でゲートへ向かう＝侵攻セットアップ）。無ければ
// ランダム（新人相当）。ユーザー要望2026-08-08「ゲート侵攻に重きを」。
export function chooseEffectCell(candidates, driveSeat) {
  if (!candidates || candidates.length === 0) return null;
  const state = getState();
  const gates = activeOpponentGateCells(state, driveSeat);
  const gateCandidates = candidates.filter((c) => gates.some((g) => g.row === c.row && g.col === c.col));
  const pool = gateCandidates.length > 0 ? gateCandidates : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}
