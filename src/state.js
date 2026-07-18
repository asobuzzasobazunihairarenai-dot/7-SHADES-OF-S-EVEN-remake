// Phase 1で最初に導入する、最小限のゲーム状態管理（Redux風のstate+action）。
// プロジェクト方針として「状態変更は全てactionとして表現し、現在の状態+action→次の状態、という
// 純粋な形にする」ことを最初から決めていた。駒・カードのドラッグ操作はこのアプリで初めての
// 「実際に状態が変わる」機能なので、ここでその形を導入する。今はルール処理をしないサンドボックス
// なので、持っているのは「どのオブジェクト(駒/カード)が今どこにあるか」と「山の残り枚数」だけ。
// 将来docs/game-state-design.mdのGameState設計へ拡張し、オンライン非同期化する際は
// 同じactionをサーバーに送って同期する流れにそのまま乗せる想定。

let nextId = 1;
const uid = (prefix) => `${prefix}-${nextId++}`;

const PIECE_START = [
  { color: "red", location: { zone: "cell", row: 6, col: 3 } },
  { color: "orange", location: { zone: "cell", row: 3, col: 0 } },
  { color: "yellow", location: { zone: "cell", row: 0, col: 3 } },
  { color: "green", location: { zone: "cell", row: 3, col: 6 } },
];

// 座席ごとの初期手札枚数（ダミー。実カードデータはまだ未接続）。
const HAND_START = { A: 4, B: 2, C: 3, D: 5 };

function createInitialState() {
  const tokens = [];
  for (const p of PIECE_START) {
    tokens.push({ id: uid("piece"), kind: "piece", color: p.color, location: p.location });
  }
  for (const [player, count] of Object.entries(HAND_START)) {
    for (let i = 0; i < count; i++) {
      tokens.push({ id: uid("card"), kind: "card", faceUp: player === "A", location: { zone: "hand", player } });
    }
  }
  return {
    tokens,
    piles: { deck: 112 - 49, eternal: 7, discard: 0 },
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

function reduce(current, action) {
  switch (action.type) {
    case "MOVE_TOKEN": {
      const tokens = current.tokens.map((t) => (t.id === action.tokenId ? { ...t, location: action.location } : t));
      return { ...current, tokens };
    }
    case "SEND_TOKEN_TO_PILE": {
      const exists = current.tokens.some((t) => t.id === action.tokenId);
      if (!exists) return current;
      const tokens = current.tokens.filter((t) => t.id !== action.tokenId);
      const piles = { ...current.piles, [action.pile]: current.piles[action.pile] + 1 };
      return { ...current, tokens, piles };
    }
    case "DRAW_FROM_PILE": {
      if (current.piles[action.pile] <= 0) return current;
      const piles = { ...current.piles, [action.pile]: current.piles[action.pile] - 1 };
      const faceUp = action.location.zone === "hand" && action.location.player === "A";
      const newToken = { id: uid("card"), kind: "card", faceUp, location: action.location };
      return { ...current, piles, tokens: [...current.tokens, newToken] };
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
