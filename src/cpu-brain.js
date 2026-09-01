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
    // 自ゲート防衛（占有）。ユーザー指摘2026-08-08「自ゲートに乗られた時点で侵攻はもう手遅れ」。
    // 実効的な防御は“乗られる前に自駒で自ゲートを占有する”こと——相手は占有マスへ着地できず
    // 接触どまりになり（main.jsの移動候補は占有マスを除外）、接触では攻撃側はその場に留まる
    // （state.js RESPOND_CONTACT）ため、ゲート侵攻（＝ゲートへの着地）が成立しない。よって相手駒が
    // 自ゲートに接近（マンハッタン距離≤2）している時に自ゲートへ移動する手を高く評価する。
    const onMyGateHere = ctx.myGate && here.row === ctx.myGate.row && here.col === ctx.myGate.col;
    if (onMyGateHere) {
      const threatened = ctx.oppPieceCells.some(
        (p) => Math.abs(p.row - ctx.myGate.row) + Math.abs(p.col - ctx.myGate.col) <= 2
      );
      if (threatened) score += 5; // 侵攻が迫っている時だけ自ゲートを固める（普段は前進を優先）
    }
    // カウンターロック未所持時は、相手駒の隣（＝次の相手ターンに接触され、手札を奪われ自ゲートへ
    // 戻される危険な位置）で終わるのを避ける（ユーザー報告#59-②「無防備なのに隣に来る」）。ペナルティは
    // ゲート接近1マス分(+3)を上回る−4にして、単なる前進のために不用意に隣で終わらないようにする。
    // 例外1: 自ゲート占有（上の防衛）は避けない。例外2: 相手ゲートへの着地（＝ゲート侵攻）は、
    // 侵攻がこのターン終了時に解決してから相手の手番が来るため、その後に隣接していても手遅れで
    // 無関係。侵攻(+6)を潰さないようペナルティ対象外にする。
    if (!ctx.hasCounterLock && ctx.oppPieceCells.length > 0) {
      const adjToOpp = ctx.oppPieceCells.some((p) => Math.abs(p.row - here.row) + Math.abs(p.col - here.col) === 1);
      const landingOnOppGate = gateSeat && gateSeat !== seat && ctx.activePlayers.includes(gateSeat);
      if (adjToOpp && !onMyGateHere && !landingOnOppGate) score -= 4;
    }
  } else if (c.occupantPlayer && c.occupantPlayer !== seat) {
    // ④接触（体当たり）。攻めの体当たりはカウンターロック所持時のみ（未所持で不用意に接触しない、
    // ユーザー方針2026-08-08）。上級以上は相手が自分以上に進んでいれば高評価。
    // ※「自ゲート上の侵入者への体当たり」は、相手のターン終了時に侵攻が既に解決しているため
    //   そもそも発生しない“手遅れ”の状況（ユーザー指摘）。ここでは特別扱いしない。
    if (ctx.hasCounterLock) {
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

export function chooseDeclaredColors(cardId, requiredCount, driveSeat) {
  const state = getState();
  const seek = cardId !== "yellow-gamble"; // ギャンブルだけ「当てたくない」、それ以外(試練)は「当てたい」
  const n = Math.max(1, requiredCount || 1);

  // 最強: 山札の一番上（次に引かれる/置かれる）をのぞき見する。ただし不具合報告#53
  // 「最強CPUだと試練の儀式などを当てすぎる」への対応で、seek（試練の儀式＝当てたい）側では
  // のぞき見しない。のぞき見すると宣言色が必ず当たり続けて儀式が延々と続き（実測40連続以上、
  // 盤面を延々と移動）、強すぎて理不尽になるため。seek側は下の「フェアな残り枚数推定」に任せ、
  // 最強でも「確率的に賢く当てにいく」程度に留める。のぞき見はギャンブル（当てたくない＝自分の
  // 不利を避けたいだけで無限連鎖にはならない）側でのみ使う。
  if (isCpuPeekAllowed() && !seek) {
    const deck = state.piles?.deck ?? [];
    const topColors = [];
    for (let i = 0; i < n && i < deck.length; i++) {
      topColors.push(getCardDefinition(deck[deck.length - 1 - i])?.color);
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
  // ユーザー要望2026-09-01「パーティの効果では2マスオープンを選ばないように（非合理なことが
  // 多いので）」。マイナスにしておくと、**他に選べる選択肢がある限り絶対に選ばれず**、
  // 2枚オープンしか使えない状況（移動先も場のカードも無い）でだけ選ばれる（＝不発を避ける）。
  "pink-party": { pickup: 3, move: 2, "open-two": -10 },
  // 選べる罠（blue-choosable-trap）: いずれも損だが、被害の小さい順に。ゲート強制移動(カード損失
  // 無し)＞手札半分捨て（札は失うがロックは無事）＞ロックを1枚捨て（色が減る＝勝利が遠のく最悪）。
  "blue-choosable-trap": { "forced-move-to-own-gate": 3, "discard-half-hand": 2, "discard-one-locked-card": 1 },
  // なないろの欠片（rainbow-shard）: 2枚揃った時に使う想定なので、単なる1枚ドローより「2枚ロック＋2枚
  // ドロー」を優先（handEffectValueForで2枚所持時のみ価値を付けているため、通常ここはlock-pairが選ばれる）。
  "rainbow-shard": { "lock-pair": 2, draw: 1 },
  // 誘惑の黒の烙印★(a)「ロックしなかったら1枚ドローしてよい」のはい/いいえ（confirmGenericYesNoの
  // id="yes"/"no"）。ただの無料ドローで損は無いので、CPUは常に「ドローする」を選ぶ（不具合#115:
  // これが未登録だとchooseEffectOptionが50/50のランダムになり、烙印2枚でも0〜2枚とばらついていた）。
  "black-contract-brand": { yes: 1, no: 0 },
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

// 参加中の相手のうち「あと1色で7色勝利」の人が必要としている色の集合（不具合報告#201）。
// その色の表向きカードを場から回収してしまえば、相手の勝ち筋を1つ潰せる。
function opponentsLastNeededColors(state, seat) {
  const out = new Set();
  for (const p of state.activePlayers ?? []) {
    if (p === seat) continue;
    const missing = [...neededColors(state, p)];
    if (missing.length === 1) out.add(missing[0]);
  }
  return out;
}

export function chooseEffectCell(candidates, driveSeat) {
  if (!candidates || candidates.length === 0) return null;
  const state = getState();
  const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];
  // 優先1: 相手ゲートに乗れる候補（ゲート侵攻セットアップ）。
  const gates = activeOpponentGateCells(state, driveSeat);
  const gateCandidates = candidates.filter((c) => gates.some((g) => g.row === c.row && g.col === c.col));
  if (gateCandidates.length > 0) return rand(gateCandidates);
  // 優先2: 相手の“あと1色”を潰す（不具合報告#201「私が後、緑を集めれば勝ちの段階でCPUが
  // パーティに到達したが、盤面の緑のカードを回収しなかった」）。相手が6色ロック済み＝あと1色で
  // 勝ちの時、その色の表向きカードが候補にあれば回収して勝ち筋を断つ。自分が要る色を取る
  // （下の優先4）より、相手の勝利を止める方を先にする。
  const denyColors = opponentsLastNeededColors(state, driveSeat);
  if (denyColors.size > 0) {
    const denyCandidates = candidates.filter((c) => {
      const card = topFaceUpCardAt(state, c.row, c.col);
      return card?.color && denyColors.has(card.color);
    });
    if (denyCandidates.length > 0) return rand(denyCandidates);
  }
  // 優先3: 自ゲート防衛。相手の侵攻経路上のカードがあれば拾って踏み台を潰す（進めなくする）。
  const defensiveCandidates = candidates.filter((c) => topFaceUpCardAt(state, c.row, c.col) && blocksOpponentInvasionStep(state, driveSeat, c));
  if (defensiveCandidates.length > 0) return rand(defensiveCandidates);
  // 優先4: 場のジャンプ台は積極的に手札に加える（ユーザー要望2026-08-08。機動力/防衛の道具）。
  const jumpPadCandidates = candidates.filter((c) => topFaceUpCardAt(state, c.row, c.col)?.cardId === "red-jump-pad");
  if (jumpPadCandidates.length > 0) return rand(jumpPadCandidates);
  // 優先5: まだ要る色の“表向き”カードがあるマス（拾えば7色勝利へ前進）。
  const needed = neededColors(state, driveSeat);
  const neededCardCandidates = candidates.filter((c) => {
    const card = topFaceUpCardAt(state, c.row, c.col);
    return card?.color && needed.has(card.color);
  });
  if (neededCardCandidates.length > 0) return rand(neededCardCandidates);
  // 優先6: 目的の無いマス選択（パーティの2枚オープンの伏せマス等、上の表向き条件に当てはまらない
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
// --- CPUの手札効果の価値評価（ユーザー要望2026-08-09「Bをやって最終的に全カード」） ----------
// chooseHandEffectCard が使う「そのカードの手札効果を今使うと得か」の評価。0以下は使わない。
// canUseHandEffect（追色コスト・使用回数・自動処理ON）は呼び出し元(main.js)で既にフィルタ済み
// なので、ここでは「コストは払える前提で、実際に意味のある効果か（対象がいる/不発でない/損しない）」
// を状況で評価する。カードごとにswitchで足していく＝段階的に全カードへ広げられる構造にした。
// 未対応カードは default:0（＝使わない）。載っていない＝バグではなく「まだ賢く撃てない」状態。

// 盤面のカードのあるマスが、駒から withinCells 以内（マンハッタン距離）に1つでもあるか。
// withinCells=Infinity で盤面全体（＝カードが1枚でも場にあるか）。回収系（収穫と種まき・
// ハーベスト・ゲンテクニーク）が空撃ちで追色を無駄にしないためのガード。駒位置は既存のpieceCellOf。
function boardHasPickableCardWithin(state, seat, withinCells) {
  const cardCells = state.tokens.filter((t) => t.kind === "card" && t.location.zone === "cell");
  if (cardCells.length === 0) return false;
  if (!Number.isFinite(withinCells)) return true;
  const loc = pieceCellOf(state, seat);
  if (!loc) return false;
  return cardCells.some((t) => Math.abs(t.location.row - loc.row) + Math.abs(t.location.col - loc.col) <= withinCells);
}
// 手札が min 枚以上の相手が1人でもいるか（セレスティア等の妨害が実際に効くか）。手札枚数は
// 公開情報なので難易度に依らず判定してよい。
function anyOpponentHandAtLeast(state, seat, min) {
  const opps = (state.activePlayers || []).filter((p) => p !== seat);
  return opps.some(
    (p) => state.tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p).length >= min
  );
}
function manhattan(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
// 盤面に駒がいる相手が1人でもいるか（プレゼント等「相手の隣に置く」系が空撃ちしないためのガード）。
function anyOpponentPieceOnBoard(state, seat) {
  return (state.activePlayers || []).some((p) => p !== seat && !!pieceCellOf(state, p));
}
// 相手ゲートまでの最短距離（activeOpponentGateCellsは既存のものを再利用。{row,col}の配列を返す）。
function distToNearestOppGate(cell, state, seat) {
  const gates = activeOpponentGateCells(state, seat);
  if (!cell || gates.length === 0) return Infinity;
  return Math.min(...gates.map((g) => manhattan(cell, g)));
}
// 相手の駒のマスのうち、CPUの駒から range 以内（マンハッタン）のもの（マスチェンジの対象候補）。
function opponentPieceCellsWithin(state, seat, range) {
  const loc = pieceCellOf(state, seat);
  if (!loc) return [];
  const opps = (state.activePlayers || []).filter((p) => p !== seat);
  return state.tokens
    .filter((t) => t.kind === "piece" && t.location.zone === "cell" && opps.includes(t.player) && manhattan(t.location, loc) <= range)
    .map((t) => t.location);
}
// --- E: 進行・ロック系＋パーティのゲート侵攻コンボ用ヘルパー（ユーザー要望2026-08-09）---
function ownGateCell(seat) {
  const g = GATE_POSITIONS[SEAT_TO_SIDE[seat]];
  return g ? { row: g.row, col: g.col } : null;
}
function cellHasCard(state, row, col) {
  return state.tokens.some((t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
}
function cellHasPiece(state, row, col) {
  return state.tokens.some((t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
}
// 相手の駒が自分のゲートから within 以内にいる（＝ゲート侵攻が迫っている）か。コノハナサクヤで
// 引き剥がす判断に使う（ユーザー案: 相手の自ゲート侵攻間近に引き剥がす）。
function opponentThreateningOwnGate(state, seat, within) {
  const gate = ownGateCell(seat);
  if (!gate) return false;
  const opps = (state.activePlayers || []).filter((p) => p !== seat);
  return state.tokens.some(
    (t) => t.kind === "piece" && t.location.zone === "cell" && opps.includes(t.player) && manhattan(t.location, gate) <= within
  );
}
// CPUの駒の within 以内（マンハッタン）に伏せカードがあるか（サフランで進行先を偵察する判断）。
function faceDownCardWithin(state, seat, within) {
  const loc = pieceCellOf(state, seat);
  if (!loc) return false;
  return state.tokens.some(
    (t) => t.kind === "card" && t.location.zone === "cell" && !t.faceUp && manhattan(t.location, loc) <= within
  );
}
// パーティのゲート侵攻コンボ: CPUの駒が「カードも駒も無い相手ゲート」の隣にいるか。そこにパーティを
// 伏せて置けば、同ターンのムーブフェイズでそのゲートへ乗れて（移動はカードのあるマスにしか行けない）、
// パーティは踏んでも安全（選択肢式）なので確実にゲート侵攻できる。
function adjacentToCardlessOpponentGate(state, seat) {
  const loc = pieceCellOf(state, seat);
  if (!loc) return false;
  return activeOpponentGateCells(state, seat).some(
    (g) => manhattan(loc, g) === 1 && !cellHasCard(state, g.row, g.col) && !cellHasPiece(state, g.row, g.col)
  );
}
// そのプレイヤーが実際にロックしている“色”の数（無色カードは除外＝勝利判定と同じ数え方）。7で勝利。
function distinctLockedColorCount(state, seat) {
  const side = SEAT_TO_SIDE[seat];
  const idxs = new Set();
  for (const t of state.tokens) {
    if (t.kind !== "card" || t.location.zone !== "lock" || t.location.side !== side) continue;
    const col = getCardDefinition(t.cardId)?.color;
    if (col && COLORS.includes(col)) idxs.add(t.location.index);
  }
  return idxs.size;
}
function cpuHandHas(state, seat, cardId) {
  return state.tokens.some((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat && t.cardId === cardId);
}
// 相手が「7色目リーチ(6色ロック)で、かつ欠けている色のカード（または虹）を手札に実際に持っている
// ＝次ターン勝てる」ことが“分かる”か。相手の手札は非公開なので、のぞき見できる最強(isCpuPeekAllowed)の
// 時だけ確定判定する（ユーザー指定2026-08-10「相手が最後のロックカードを持っていると分かる時のみ」）。
function opponentCanWinNextTurn(state, seat) {
  if (!isCpuPeekAllowed()) return false; // 相手の手札を見られない＝持っているか分からない
  for (const p of (state.activePlayers || []).filter((x) => x !== seat)) {
    if (distinctLockedColorCount(state, p) < COLORS.length - 1) continue; // 6色未満はリーチでない
    const side = SEAT_TO_SIDE[p];
    const locked = new Set();
    for (const t of state.tokens) {
      if (t.kind === "card" && t.location.zone === "lock" && t.location.side === side) {
        const col = getCardDefinition(t.cardId)?.color;
        if (col && COLORS.includes(col)) locked.add(col);
      }
    }
    const missing = COLORS.filter((c) => !locked.has(c));
    const hand = state.tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p);
    if (hand.some((t) => t.cardId === "rainbow-shard" || missing.includes(getCardDefinition(t.cardId)?.color))) return true;
  }
  return false;
}
// ディメンション判定: 1マスでは届かない「マンハッタン距離ちょうど2」のマスに、相手ゲート、または
// 表向きでまだ要る色のカードがある（＝2マス移動がちょうど得になる）か。カードがあり駒がいないマスのみ。
function beneficialTwoMoveExists(state, seat) {
  const loc = pieceCellOf(state, seat);
  if (!loc) return false;
  const gates = activeOpponentGateCells(state, seat);
  const needed = neededColors(state, seat);
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      if (Math.abs(dr) + Math.abs(dc) !== 2) continue;
      const row = loc.row + dr;
      const col = loc.col + dc;
      if (row < 0 || row > 6 || col < 0 || col > 6) continue;
      if (!cellHasCard(state, row, col) || cellHasPiece(state, row, col)) continue;
      if (gates.some((g) => g.row === row && g.col === col)) return true; // 相手ゲートに2マスで乗れる＝侵攻
      const top = topFaceUpCardAt(state, row, col);
      if (top?.color && needed.has(top.color)) return true; // 表向きの要る色に2マスで届く
    }
  }
  return false;
}

// 1枚の手札効果カードの価値（大きいほど優先。0以下は使わない）。
function handEffectValueFor(card, seat, state, handCount) {
  switch (card.cardId) {
    // --- 既存（維持。回収系は空撃ち防止のガードを追加）---
    case "orange-harvest-sow": // 収穫と種まき: 盤面の1枚を回収して1枚置く（手札の質UP）
      return boardHasPickableCardWithin(state, seat, Infinity) ? 2 : 0;
    case "green-growing-trees": // 増殖する樹々: 山札から3枚を裏向き配置（軽い盤面展開）
      return 1;
    case "blue-slum-official": // スラム上がり: 自分を捨ててから「手札1枚以下なら2枚ドロー」。使用前2枚以下の時だけ得
      return handCount <= 2 ? 2 : 0;
    // --- B: 明快で得なカード（ユーザー要望2026-08-09）---
    case "eternal-yellow": // ドムス・ネロ: 2枚ドロー（相手全員は1枚）。1v1でも純増。1/turn・コストはcanUseHandEffect担保
      return 3;
    case "first-red": // フェニックス: 捨て場の上から2番目を回収。捨て場が2枚以上ある時だけ有効
      return (state.piles?.discard?.length ?? 0) >= 2 ? 2 : 0;
    case "first-orange": // ハーベスト: 2マス以内の1枚を回収
      return boardHasPickableCardWithin(state, seat, 2) ? 2 : 0;
    case "eternal-purple": // ゲンテクニーク: 任意の1マスを回収して山札から置き直す
      return boardHasPickableCardWithin(state, seat, Infinity) ? 2 : 0;
    case "first-blue": // セレスティア: 手札2枚以上の相手全員から1枚ずつ捨てさせる（妨害）。対象がいる時だけ
      return anyOpponentHandAtLeast(state, seat, 2) ? 2 : 0;
    case "eternal-green": // マンズウッド: 1枚ドロー（微益・手札循環）
      return 1;
    case "eternal-blue": // プリドゥエン: 山札から2枚を裏向き配置（軽い盤面展開）
      return 1;
    // --- C: 妨害・攻撃系（ユーザー要望2026-08-09、状況ガード付き。実行は共にマス選択で自動解決可）---
    case "orange-mass-change": { // マスチェンジ: 3マス以内の相手と入替。CPUが相手ゲートに近づき、かつ入替後に
      // 相手（CPUの元マスへ移る）がCPUより侵攻に近くならない時だけ使う（ユーザー要望2026-08-09:
      // 入替で相手の方がゲートに近づいてしまうなら、相手を利するのでやらない）。
      const myCell = pieceCellOf(state, seat);
      if (!myCell) return 0;
      const myOldDist = distToNearestOppGate(myCell, state, seat);
      for (const p of (state.activePlayers || []).filter((x) => x !== seat)) {
        const oppCell = pieceCellOf(state, p);
        if (!oppCell || manhattan(oppCell, myCell) > 3) continue;
        const cpuNewDist = distToNearestOppGate(oppCell, state, seat); // CPUはoppCellへ移る
        if (!(cpuNewDist < myOldDist)) continue; // 前進しないなら不要
        const oppNewInvadeDist = distToNearestOppGate(myCell, state, p); // 相手はmyCellへ→相手が侵攻できるゲートまでの距離
        if (oppNewInvadeDist < cpuNewDist) continue; // 相手の方がゲートに近くなる＝相手を利する→やらない
        return 2;
      }
      return 0;
    }
    case "eternal-red": { // ワイナウエア: 任意の1マスのカードを全捨て。(1)2枚以上積まれたマス（clutter）か、
      // (2)相手がまだ必要な色の“表向き”盤面カード（拾われると相手を利する）を潰せる時だけ、低優先。
      // 注意: eternal-redは盤面マスのカードのみ対象で、ロックエリアのロック済みカードは壊せない
      //（ユーザー案「相手のロックした色を破壊」はこのカードでは不可）。
      const cardCells = state.tokens.filter((t) => t.kind === "card" && t.location.zone === "cell");
      const stacks = {};
      for (const t of cardCells) {
        const k = t.location.row + "," + t.location.col;
        stacks[k] = (stacks[k] ?? 0) + 1;
      }
      if (Object.values(stacks).some((n) => n >= 2)) return 1;
      const oppNeeds = new Set();
      for (const p of (state.activePlayers || []).filter((x) => x !== seat)) for (const c of neededColors(state, p)) oppNeeds.add(c);
      return cardCells.some((t) => t.faceUp && oppNeeds.has(getCardDefinition(t.cardId)?.color)) ? 1 : 0;
    }
    // --- D: 配置・トラップ系（ユーザー要望2026-08-09。カード枚数が減らない=実質お得なものを先行）---
    case "pink-present": // プレゼント: 相手の隣に伏せて置き1枚ドロー（keepsCardOnUseで手札枚数±0＋ドローの上振れ）。相手が盤上にいる時だけ
      return anyOpponentPieceOnBoard(state, seat) ? 1 : 0;
    // --- E: 進行・ロック系＋パーティのゲート侵攻コンボ（ユーザー要望2026-08-09）---
    case "pink-party": // パーティ: ゲート侵攻コンボ。カードも駒も無い相手ゲートの隣にいる時だけ、そのゲートに
      // パーティを伏せて置く→同ターンに乗って侵攻（踏んでも安全）。それ以外はカード損なので使わない。最優先級。
      return adjacentToCardlessOpponentGate(state, seat) ? 4 : 0;
    case "purple-trial-ritual": // 試練の儀式: 山札から隣に置いて移動、宣言色が続けば連鎖＝無償の機動力＋盤面前進（宣言はchooseDeclaredColorsが担当）
      return 2;
    case "eternal-pink": // コノハナサクヤ: 相手を自分の隣へ引き寄せる。相手が自ゲート侵攻間近（2マス以内）な時に引き剥がすのが有効。追色はcanUseHandEffect担保
      return opponentThreateningOwnGate(state, seat, 2) ? 2 : 0;
    case "first-yellow": // サフラン: 2マス以内を最大4枚オープン。最強はのぞき見済で無意味なので非対象。進行先に伏せカードがある時だけ（同ターンの移動判断に活きる）
      return !isCpuPeekAllowed() && faceDownCardWithin(state, seat, 2) ? 1 : 0;
    case "first-pink": // セレナーデ: 【追色1】手札を1枚ロック（最後のロック以外）。ロックフェイズとは別にもう1色進む＝
      // 勝利へ明確に前進。使用可否（ロックできる手札あり＋追色コスト＋1ターン1回）はcanUseHandEffectが担保。
      return 3;
    // --- F: ハイリスク系（ユーザー要望2026-08-10。厳しめ条件で、危険が低い時だけ使う）---
    case "yellow-gamble": { // ザ・ギャンブル: 宣言色が公開ドローに出ると手札全捨て。CPUは残枚数が最少の2色を宣言する
      // ので、その2色が枯れかけ（推定残り合計≤2）＝当たる危険が低い時だけ使う（実質ほぼ安全なドロー）。
      // 手札2枚以上（DISCARD_ONE）はcanUseHandEffectが担保。
      const rem = remainingByColorFair(state, seat);
      const twoLowestSum = Object.values(rem).sort((a, b) => a - b).slice(0, 2).reduce((s, n) => s + n, 0);
      return twoLowestSum <= 2 ? 2 : 0;
    }
    case "eternal-orange": { // マルメゴ: 4枚ドロー、橙が出たら手札全捨て＋移動不可。橙が枯れかけ（推定残り≤1）かつ
      // 手札が少ない（≤2＝外れても失う分が小さく、むしろ補充したい）時だけ使う。追色（橙）はcanUseHandEffect担保。
      const rem = remainingByColorFair(state, seat);
      return (rem.orange ?? 99) <= 1 && handCount <= 2 ? 3 : 0;
    }
    case "black-faded-cat": { // 色落ちキャット(手札): 手札を全捨てして1枚ドロー。捨てて損する札（まだ要る色・貴重札）が
      // 他に1枚も無い＝手札が全部“不要札”の時だけ、入れ替えのために使う。
      const others = state.tokens.filter(
        (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat && t.id !== card.id
      );
      if (others.length === 0) return 0; // 捨てる他札が無い＝ただの自己捨て+1ドローで無意味
      const needed = neededColors(state, seat);
      const allJunk = others.every((t) => {
        if (isPreciousCard(t.cardId)) return false; // 貴重札は残す
        const col = getCardDefinition(t.cardId)?.color;
        if (!col || !COLORS.includes(col)) return false; // 白黒虹等は安全側で「捨ててよくない」
        return !needed.has(col); // 既にロック済みの色＝不要
      });
      return allJunk ? 1 : 0;
    }
    // --- 追加（ユーザー案2026-08-10。条件が明確に判定できるものだけ）---
    case "white-radiance": // なないろの巨光: 全員3枚ドロー＋フェイズ終了。通常は相手も利するので使わないが、相手が
      // 次ターン確実に勝てる（6色リーチ＋欠け色を手札に所持）と“分かって”いて、かつ自分がゴメンナサイ
      // 非所持の“詰み”の時だけ、ゴメンナサイを引き当てて阻止するための決死のドローに使う（ユーザー指定で
      // 「相手が最後のロックカードを持っていると分かる時のみ」＝相手手札が見える最強のみ発動）。
      return opponentCanWinNextTurn(state, seat) && !cpuHandHas(state, seat, "purple-sorry") ? 3 : 0;
    case "rainbow-shard": { // なないろの欠片: 貴重札なので通常は温存(0)。2枚揃った時だけ「2枚ロック＋2枚ドロー」で使う
      // （lock-pairはOPTION_RANKで優先。単体温存は追色コスト/セレナーデのロック対象として手動で活かす想定）。
      const shardCount = state.tokens.filter(
        (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat && t.cardId === "rainbow-shard"
      ).length;
      return shardCount >= 2 ? 2 : 0;
    }
    case "first-purple": // ディメンション: 【追色1】このターン2マス移動。1マスでは届かない距離2のマスが相手ゲート/表向きの
      // 要る色の時だけ使う（ちょうど届く時のみ得。ユーザー案）。追色コストはcanUseHandEffect担保。
      return beneficialTwoMoveExists(state, seat) ? 2 : 0;
    case "first-green": // 奇跡の森(first): 【追色1】2枚公開ドロー（ターン終了で捨てる、1/turn）。引いた札はこのターン
      // 使える（publicDrawも手札扱いにしたのでCPUも使用可能になった。ユーザー指摘2026-08-10）。緑が既に
      // ロック済み＝追色コストが実質タダの時だけ、「引いて今ターン使えるものがあれば使う」ために撃つ。
      // 緑がまだ要る色なら温存。使用可否（別の緑あり＋1/turn）はcanUseHandEffectが担保。
      return !neededColors(state, seat).has("green") ? 1 : 0;
    // --- 意図的に自動使用しない: 配置トラップ系(専用コンボ要) ほか ---
    default:
      return 0;
  }
}

export function chooseHandEffectCard(usableCards, driveSeat) {
  if (!usableCards || usableCards.length === 0) return null;
  const state = getState();
  const handCount = state.tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === driveSeat
  ).length;
  let best = null;
  let bestScore = 0; // 0以下（未対応／今は使うべきでない）は採用しない
  for (const t of usableCards) {
    const score = handEffectValueFor(t, driveSeat, state, handCount);
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

// セレナーデ/カウンターロック等の「手札を1枚ロックする」時に、どれをロックするかの選択（ユーザー
// 要望2026-08-10）。ロックは“手放す”のと真逆で、価値の高い札こそロックしたい。優先:
//   ①なないろの欠片（本来ロックしづらい貴重札を1色に変換できる＝一番活かせる）
//   ②まだ要る色のカード（ロックすれば7色勝利へ前進）
//   ③その他。
// chooseHandCardToken（手放す用）とは逆基準。候補は tokenId の集合（呼び出し側でロック可能札に絞り済み）。
export function chooseHandCardToLock(tokenIds, driveSeat) {
  const ids = [...(tokenIds || [])];
  if (ids.length === 0) return null;
  const state = getState();
  const needed = neededColors(state, driveSeat);
  const tokens = ids.map((id) => state.tokens.find((t) => t.id === id)).filter(Boolean);
  if (tokens.length === 0) return ids[0];
  const lockValue = (t) => {
    if (t.cardId === "rainbow-shard") return 3; // 虹を1色に変換＝最優先（他の手段ではロックしづらい）
    const color = getCardDefinition(t.cardId)?.color;
    if (color && COLORS.includes(color) && needed.has(color)) return 2; // まだ要る色
    return 1;
  };
  tokens.sort((a, b) => lockValue(b) - lockValue(a));
  return tokens[0].id;
}

// スリカエ（手品師の技）で相手に「渡す」1枚を選ぶ自動代行（ユーザー要望2026-08-08
// 「未ロック＝まだ要る色のカードはなるべく渡さない」）。渡す＝失う＋相手に与える、の両面から
// 一番渡してよい札を選ぶ: ①自分がまだ要る色は渡さない（進行を失う）②相手がまだ要る色も渡さない
// （相手を助ける）③自分も相手もロック済みの色＝双方に無害＝最も渡してよい。強い/貴重札は温存。
export function chooseSwapGiveCard(tokenIds, giverSeat, targetSeat) {
  const ids = [...(tokenIds || [])];
  if (ids.length === 0) return null;
  const state = getState();
  const myNeeded = neededColors(state, giverSeat);
  const theirNeeded = neededColors(state, targetSeat);
  const tokens = ids.map((id) => state.tokens.find((t) => t.id === id)).filter(Boolean);
  if (tokens.length === 0) return ids[0];
  const giveability = (t) => {
    const color = getCardDefinition(t.cardId)?.color;
    let g = 0;
    if (color && COLORS.includes(color)) {
      if (myNeeded.has(color)) g -= 3; // 自分がまだ要る色は渡したくない
      else g += 2; // 自分はロック済み＝手放してよい
      if (theirNeeded.has(color)) g -= 2; // 相手がまだ要る色は与えたくない（助けない）
      else g += 1; // 相手もロック済み＝与えても無害
    }
    if (isPreciousCard(t.cardId)) g -= 4; // 強い/リアクション/虹/ファースト/エターナルは温存
    return g;
  };
  tokens.sort((a, b) => giveability(b) - giveability(a));
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

// 対象プレイヤーの選択（スリカエ/マスチェンジ/プレゼント手札/結ばれの一本桜 等、アバターを選ぶ効果）。
// 従来はCPUも常にランダムに選んでいた（2人戦なら相手は1人＝実質決定的だが、3-4人戦＝続き226で
// 対応、では“誰を狙うか”は本当の戦略判断）。カードを問わず「最も脅威な相手＝ロック数が多い＝勝ちに
// 近いリーダー」を狙う汎用ヒューリスティック（奪う/入れ替える/引き寄せる系の妨害効果はこれが正しく、
// それ以外の効果でも妥当な既定）。同数はロックでなく手札枚数の多い相手、それも同数なら無作為。
// 候補は座席の配列/集合（呼び出し側で自分を除いた相手だけに絞り済み）。
export function chooseTargetPlayer(players, driveSeat) {
  const arr = [...(players || [])];
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  const state = getState();
  const locks = lockCountBySeat(state);
  const handCount = {};
  for (const t of state.tokens) {
    if (t.kind === "card" && t.location.zone === "hand") {
      handCount[t.location.player] = (handCount[t.location.player] ?? 0) + 1;
    }
  }
  let best = null;
  let bestKey = -Infinity;
  const scored = arr.map((p) => ({ p, lk: locks[p] ?? 0, hc: handCount[p] ?? 0 }));
  for (const s of scored) {
    const key = s.lk * 100 + s.hc; // ロック数優先、同数は手札枚数
    if (key > bestKey) {
      bestKey = key;
      best = [s];
    } else if (key === bestKey) {
      best.push(s);
    }
  }
  return best[Math.floor(Math.random() * best.length)].p; // 同点は無作為
}
