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
    // ⑤方向性（ユーザー要望2026-08-08「ゲート侵攻/接触/自ゲート防衛を狙う動きを」）。ランダムで
    // うろつかず、目的を持って動くよう、相手ゲートへの“近づき度”を強めに加点する。
    // 不具合#38「最短ルートを選ばない」対応: 途中のカード拾い（要る色+1／収穫+2等）に負けて
    // 寄り道しないよう、1マス近づく＝+3（旧+1.5から増強）。ゲート直行を明確に優先させる。
    const here = { row: c.row, col: c.col };
    if (ctx.myCell && ctx.oppGates.length > 0) {
      score += (minDistTo(ctx.myCell, ctx.oppGates) - minDistTo(here, ctx.oppGates)) * 3;
    }
    // 接触狙い（相手駒へ近づく）は「カウンターロック所持時のみ」（ユーザー方針2026-08-08:
    // カウンターロックが無いのにむやみに相手の隣へ行かない＝接触は相手に主導権を渡すと危険）。
    if (ctx.hasCounterLock && ctx.myCell && ctx.oppPieceCells.length > 0) {
      score += (minDistTo(ctx.myCell, ctx.oppPieceCells) - minDistTo(here, ctx.oppPieceCells)) * (ctx.oppAware ? 0.8 : 0.4);
    }
    // カウンターロック未所持時は、相手駒の隣（＝接触されうる位置）に留まるのを避ける。
    // ただし自ゲート上（＝侵入者を迎え撃つ防衛位置）は例外で避けない。
    if (!ctx.hasCounterLock && ctx.oppPieceCells.length > 0) {
      const adjToOpp = ctx.oppPieceCells.some((p) => Math.abs(p.row - here.row) + Math.abs(p.col - here.col) === 1);
      const onMyGate = ctx.myGate && here.row === ctx.myGate.row && here.col === ctx.myGate.col;
      if (adjToOpp && !onMyGate) score -= 1.5;
    }
  } else if (c.occupantPlayer && c.occupantPlayer !== seat) {
    // ④接触（体当たり）＝相手をゲートへ戻す妨害。
    // 自ゲート防衛: その相手が自分のゲートに乗って侵攻しようとしているなら、カウンターロックの
    // 有無に関わらず接触で追い返す（防衛は常に有効。ユーザー方針の例外「接触で相手の侵攻を阻止
    // できるなら隣接可」に相当）。
    const onMyGate = ctx.myGate && c.row === ctx.myGate.row && c.col === ctx.myGate.col;
    if (onMyGate) {
      score += 3;
    } else if (ctx.hasCounterLock) {
      // 攻めの体当たりはカウンターロック所持時のみ（未所持で不用意に接触しない）。上級以上は
      // 相手が自分以上に進んでいれば高評価。
      const theirLocks = ctx.locks[c.occupantPlayer] ?? 0;
      const myLocks = ctx.locks[seat] ?? 0;
      if (ctx.oppAware && theirLocks >= myLocks) score += 2;
      else score += 0.3;
    }
  }
  return score;
}

// cell から cells 群への最小マンハッタン距離。
function minDistTo(cell, cells) {
  let m = Infinity;
  for (const g of cells) {
    const d = Math.abs(g.row - cell.row) + Math.abs(g.col - cell.col);
    if (d < m) m = d;
  }
  return m;
}

// 移動/接触の候補（enriched: {el, isMove, row, col, topCardId, topFaceUp, occupantPlayer}）から
// 最善手を選ぶ。候補が無ければ null。同点はランダムに1つ。
export function chooseMoveCandidate(candidates, driveSeat) {
  if (!candidates || candidates.length === 0) return null;
  const state = getState();
  const active = state.activePlayers ?? [];
  const oppPieceCells = state.tokens
    .filter((t) => t.kind === "piece" && t.player !== driveSeat && active.includes(t.player) && t.location.zone === "cell")
    .map((t) => ({ row: t.location.row, col: t.location.col }));
  const myGatePos = GATE_POSITIONS[SEAT_TO_SIDE[driveSeat]] || null;
  const ctx = {
    peek: isCpuPeekAllowed(),
    oppAware: isCpuOpponentAware(),
    activePlayers: active,
    locks: lockCountBySeat(state),
    needed: neededColors(state, driveSeat),
    // 方向性スコア用（ユーザー要望2026-08-08）。
    myCell: pieceCellOf(state, driveSeat),
    oppGates: activeOpponentGateCells(state, driveSeat),
    oppPieceCells,
    myGate: myGatePos ? { row: myGatePos.row, col: myGatePos.col } : null,
    // カウンターロックを手札に持っているか（接触の攻め/守りの判断に使う。ユーザー方針2026-08-08）。
    hasCounterLock: state.tokens.some(
      (t) => t.kind === "card" && t.cardId === "red-counter-lock" && t.location.zone === "hand" && t.location.player === driveSeat
    ),
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
// そのマスの一番上の“表向き”カード（{cardId, color}）。裏向き/無しはnull（表向きは公開情報＝フェア）。
function topFaceUpCardAt(state, row, col) {
  const cards = state.tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === row && t.location.col === col
  );
  const top = cards[cards.length - 1]; // 末尾＝一番上（1番上の原則）
  if (!top || !top.faceUp) return null;
  return { cardId: top.cardId, color: getCardDefinition(top.cardId)?.color ?? null };
}

// そのマスのカードを取り除くと、相手のゲート侵攻の踏み台を1つ潰せるか（ユーザー要望2026-08-08
// 「人間のゲート侵攻を予測して移動予定先のカードを無くす」）。移動は移動先にカードが必要なため、
// 侵攻経路上のカードを拾ってしまえば相手はそのマスへ進めない。判定: 自分のゲートを脅かしている
// （近い）相手駒に隣接し、かつ自分のゲートにその相手駒より近いマス＝相手の“次の一歩”。
function blocksOpponentInvasionStep(state, seat, cell) {
  const gatePos = GATE_POSITIONS[SEAT_TO_SIDE[seat]];
  if (!gatePos) return false;
  const gateCell = { row: gatePos.row, col: gatePos.col };
  const distToGate = (p) => Math.abs(p.row - gateCell.row) + Math.abs(p.col - gateCell.col);
  const cellDist = distToGate(cell);
  const active = state.activePlayers ?? [];
  for (const t of state.tokens) {
    if (t.kind !== "piece" || t.player === seat || !active.includes(t.player) || t.location.zone !== "cell") continue;
    const opp = { row: t.location.row, col: t.location.col };
    const oppDist = distToGate(opp);
    const adjacent = Math.abs(cell.row - opp.row) + Math.abs(cell.col - opp.col) === 1;
    if (oppDist <= 4 && adjacent && cellDist < oppDist) return true; // 相手が侵攻中で、cellはその踏み台
  }
  return false;
}

export function chooseEffectCell(candidates, driveSeat) {
  if (!candidates || candidates.length === 0) return null;
  const state = getState();
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // 優先1: 相手ゲートに乗れる候補（ゲート侵攻セットアップ）。
  const gates = activeOpponentGateCells(state, driveSeat);
  const gateCandidates = candidates.filter((c) => gates.some((g) => g.row === c.row && g.col === c.col));
  if (gateCandidates.length > 0) return rand(gateCandidates);
  // 優先2: 自ゲート防衛。相手の侵攻経路上のカードがあれば拾って踏み台を潰す（進めなくする）。
  const defensiveCandidates = candidates.filter((c) => topFaceUpCardAt(state, c.row, c.col) && blocksOpponentInvasionStep(state, driveSeat, c));
  if (defensiveCandidates.length > 0) return rand(defensiveCandidates);
  // 優先3: 場のジャンプ台は積極的に手札に加える（ユーザー要望2026-08-08。機動力/防衛の道具）。
  const jumpPadCandidates = candidates.filter((c) => topFaceUpCardAt(state, c.row, c.col)?.cardId === "red-jump-pad");
  if (jumpPadCandidates.length > 0) return rand(jumpPadCandidates);
  // 優先4: まだ要る色の“表向き”カードがあるマス（拾えば7色勝利へ前進）。
  const needed = neededColors(state, driveSeat);
  const neededCardCandidates = candidates.filter((c) => {
    const card = topFaceUpCardAt(state, c.row, c.col);
    return card?.color && needed.has(card.color);
  });
  if (neededCardCandidates.length > 0) return rand(neededCardCandidates);
  // 優先5: 目的の無いマス選択（パーティの2枚オープンの伏せマス等、上の表向き条件に当てはまらない
  // 場合）でも、完全ランダムで“無関係なところ”を選ばない（不具合#39対応）。相手ゲートに最も近い
  // マスを選ぶ＝侵攻ルート上の伏せカードを偵察する、という目的を持たせる。相手ゲートが無ければ
  // 従来どおりランダム。
  const gateCells = activeOpponentGateCells(state, driveSeat);
  if (gateCells.length > 0) {
    let best = Infinity;
    const scored = candidates.map((c) => {
      const d = minDistTo({ row: c.row, col: c.col }, gateCells);
      if (d < best) best = d;
      return { c, d };
    });
    const closest = scored.filter((x) => x.d <= best).map((x) => x.c);
    return rand(closest);
  }
  return rand(candidates);
}

// --- 手札効果の能動使用（ユーザー要望2026-08-08「CPUに手札効果を使わせる」）-----------------
// まずは「明確に得で安全な効果」だけを能動的に使う保守的な第一歩。リスクのある効果
// （ザ・ギャンブル＝手札全捨ての危険、対象が読みにくい効果 等）は使わない（テーブルに載せない）。
// 値が正のカードの中で最も高いものを使う。無ければ null（使わずスキップ）。
const HAND_EFFECT_VALUE = {
  "orange-harvest-sow": 2, // 収穫と種まき: 場のカードを1枚手札に得て1枚置く＝手札の質を上げる（安全）
  "green-growing-trees": 1, // 増殖する樹々: 何もないマスに山札から置く＝盤面展開（軽い得）
};

export function chooseHandEffectCard(usableCards, driveSeat) {
  if (!usableCards || usableCards.length === 0) return null;
  const state = getState();
  const handCount = state.tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === driveSeat
  ).length;
  const valueOf = (t) => {
    let v = HAND_EFFECT_VALUE[t.cardId] ?? 0;
    // スラム上がりの役人: 使用時にこのカードを捨ててから「手札が1枚以下なら2枚ドロー」を判定する
    // （＝使用前の手札が2枚以下の時だけ得。3枚以上だと不発でただ1枚失うので使わない）。
    if (t.cardId === "blue-slum-official") v = handCount <= 2 ? 2 : 0;
    return v;
  };
  let best = null;
  let bestScore = 0; // 0以下（未登録／今は使うべきでない）は採用しない
  for (const t of usableCards) {
    const score = valueOf(t);
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return best;
}

// 強い/残しておきたいカード（リアクション札・虹・ファースト/エターナル）。手放す時は避け、
// 奪う時は狙う。
function isPreciousCard(cardId) {
  return (
    cardId === "rainbow-shard" ||
    cardId === "purple-sorry" ||
    cardId === "red-counter-lock" ||
    (cardId || "").startsWith("first-") ||
    (cardId || "").startsWith("eternal-")
  );
}

// 手札から1枚「手放す」時（コスト支払い・場に置く・捨てる等、requestHandCardChoiceForEffectの
// 自動代行）に、一番手放してよいカードを選ぶ。ロック済みの色＝冗長で手放しやすい、まだ要る色・
// 強い札＝残したい。候補は tokenId の集合（Set/配列）。
export function chooseHandCardToken(tokenIds, driveSeat) {
  const ids = [...(tokenIds || [])];
  if (ids.length === 0) return null;
  const state = getState();
  const needed = neededColors(state, driveSeat); // まだロックしていない色
  const tokens = ids.map((id) => state.tokens.find((t) => t.id === id)).filter(Boolean);
  if (tokens.length === 0) return ids[0];
  const discardability = (t) => {
    const color = getCardDefinition(t.cardId)?.color;
    let d = 0;
    if (color && COLORS.includes(color)) d += needed.has(color) ? -2 : 2; // 要る色は残す/ロック済みは手放してよい
    if (isPreciousCard(t.cardId)) d -= 3; // 強い/リアクション札は残す
    return d;
  };
  tokens.sort((a, b) => discardability(b) - discardability(a));
  return tokens[0].id;
}

// 相手の手札から1枚奪う（スリカエ・接触・ゲート侵攻）自動代行。中級・上級は相手の手札の中身が
// 見えない（非公開）ためランダム。最強のみ、のぞき見して一番価値の高い札を奪う（自分がまだ要る色＝
// 奪えば自分がロックできる／相手の強いリアクション札を無力化／強力なカード）。
export function chooseOpponentHandCardToSteal(tokens, driveSeat) {
  const arr = [...(tokens || [])];
  if (arr.length === 0) return null;
  if (!isCpuPeekAllowed()) return arr[Math.floor(Math.random() * arr.length)];
  const state = getState();
  const needed = neededColors(state, driveSeat);
  const value = (t) => {
    const color = getCardDefinition(t.cardId)?.color;
    let v = 0;
    if (color && COLORS.includes(color) && needed.has(color)) v += 3; // まだ要る色を奪えば自分がロックできる
    if (isPreciousCard(t.cardId)) v += 2; // 強い/リアクション札を奪って無力化
    return v;
  };
  return arr.slice().sort((a, b) => value(b) - value(a))[0];
}
