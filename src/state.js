// Phase 1で最初に導入する、最小限のゲーム状態管理（Redux風のstate+action）。
// プロジェクト方針として「状態変更は全てactionとして表現し、現在の状態+action→次の状態、という
// 純粋な形にする」ことを最初から決めていた。駒・カードのドラッグ操作はこのアプリで初めての
// 「実際に状態が変わる」機能なので、ここでその形を導入する。今はルール処理をしないサンドボックス
// なので、持っているのは「どのオブジェクト(駒/カード)が今どこにあるか」と「各山の中身（実カード
// のid配列）」だけ。将来docs/game-state-design.mdの本格的なGameState設計へ拡張し、オンライン
// 非同期化する際は同じactionをサーバーに送って同期する流れにそのまま乗せる想定。

import { NORMAL_CARDS, ETERNAL_CARDS } from "./cards-data.js";

let nextId = 1;
const uid = (prefix) => `${prefix}-${nextId++}`;

const PIECE_START = [
  { color: "red", location: { zone: "cell", row: 6, col: 3 } },
  { color: "orange", location: { zone: "cell", row: 3, col: 0 } },
  { color: "yellow", location: { zone: "cell", row: 0, col: 3 } },
  { color: "green", location: { zone: "cell", row: 3, col: 6 } },
];

// 座席ごとの初期手札枚数。実カードを山札からこの枚数だけ配る。
const HAND_START = { A: 4, B: 2, C: 3, D: 5 };

function shuffled(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// カード定義(count付き)から、実際の枚数分だけid配列に展開する（例: count:7のカードは
// 同じidが7つ並んだ配列になる。同じ絵柄のカードが複数あるのは物理カードと同じ）。
function expandDeck(cardDefs) {
  const ids = [];
  for (const def of cardDefs) {
    for (let i = 0; i < (def.count ?? 1); i++) ids.push(def.id);
  }
  return ids;
}

function createInitialState() {
  const tokens = [];
  for (const p of PIECE_START) {
    tokens.push({ id: uid("piece"), kind: "piece", color: p.color, location: p.location });
  }

  // 山札(通常カード112枚)をシャッフルし、そこから各プレイヤーの初期手札を配る。
  // pilesは「配列の末尾＝一番上」という約束で、popが「引く」、pushが「積む」に対応する。
  const deck = shuffled(expandDeck(NORMAL_CARDS));
  for (const [player, count] of Object.entries(HAND_START)) {
    for (let i = 0; i < count; i++) {
      const cardId = deck.pop();
      tokens.push({
        id: uid("card"),
        kind: "card",
        cardId,
        faceUp: player === "A", // 自分の手札だけ表向き（＝盤面等に出た時に中身が見える）
        location: { zone: "hand", player },
      });
    }
  }

  const eternal = shuffled(expandDeck(ETERNAL_CARDS));

  return {
    tokens,
    piles: { deck, eternal, discard: [] },
  };
}

let state = createInitialState();
const listeners = [];

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

// ドロップ先のゾーンから、カードが表向きになるかどうかを決める。
// 手札effect加わる時は持ち主本人にだけ見える表向き、それ以外（盤面マス・ロックスロット）は
// 基本裏向き（物理カードを裏向きで置くのと同じ。中身を見せたければダブルクリックでめくる）。
function faceUpForLocation(location) {
  if (location.zone === "hand") return location.player === "A";
  return false;
}

function reduce(current, action) {
  switch (action.type) {
    case "MOVE_TOKEN": {
      const tokens = current.tokens.map((t) => {
        if (t.id !== action.tokenId) return t;
        const next = { ...t, location: action.location };
        if (t.kind === "card") next.faceUp = faceUpForLocation(action.location);
        return next;
      });
      return { ...current, tokens };
    }
    case "SEND_TOKEN_TO_PILE": {
      const token = current.tokens.find((t) => t.id === action.tokenId);
      if (!token) return current;
      const tokens = current.tokens.filter((t) => t.id !== action.tokenId);
      const piles = { ...current.piles, [action.pile]: [...current.piles[action.pile], token.cardId] };
      return { ...current, tokens, piles };
    }
    case "DRAW_FROM_PILE": {
      const pileArray = current.piles[action.pile];
      if (pileArray.length === 0) return current;
      const cardId = pileArray[pileArray.length - 1];
      const piles = { ...current.piles, [action.pile]: pileArray.slice(0, -1) };
      const faceUp = faceUpForLocation(action.location);
      const newToken = { id: uid("card"), kind: "card", cardId, faceUp, location: action.location };
      return { ...current, piles, tokens: [...current.tokens, newToken] };
    }
    case "FLIP_TOKEN": {
      const tokens = current.tokens.map((t) =>
        t.id === action.tokenId && t.kind === "card" ? { ...t, faceUp: !t.faceUp } : t
      );
      return { ...current, tokens };
    }
    default:
      return current;
  }
}

function dispatch(action) {
  state = reduce(state, action);
  for (const fn of listeners) fn(state);
}

export function moveToken(tokenId, location) {
  dispatch({ type: "MOVE_TOKEN", tokenId, location });
}

export function sendTokenToPile(tokenId, pile) {
  dispatch({ type: "SEND_TOKEN_TO_PILE", tokenId, pile });
}

export function drawFromPile(pile, location) {
  dispatch({ type: "DRAW_FROM_PILE", pile, location });
}

export function flipToken(tokenId) {
  dispatch({ type: "FLIP_TOKEN", tokenId });
}
