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
