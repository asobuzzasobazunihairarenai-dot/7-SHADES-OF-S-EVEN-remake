// Phase 1 milestone 1a: 静的レイアウト確認用。ゲームロジックはまだ繋がず、ダミーデータのみ描画する。

const COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

const GATE_POSITIONS = {
  top: { row: 0, col: 3 },
  bottom: { row: 6, col: 3 },
  left: { row: 3, col: 0 },
  right: { row: 3, col: 6 },
};

function buildLockArea(side) {
  const el = document.createElement("div");
  el.className = `lock-area lock-${side}`;
  for (const color of COLORS) {
    const slot = document.createElement("div");
    slot.className = "lock-slot";
    slot.style.borderColor = `var(--color-${color})`;
    el.appendChild(slot);
  }
  return el;
}

function buildBoard() {
  const board = document.createElement("div");
  board.className = "board";
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const isGate = Object.values(GATE_POSITIONS).some((g) => g.row === row && g.col === col);
      if (isGate) cell.classList.add("is-gate");
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      board.appendChild(cell);
    }
  }
  return board;
}

function buildArena() {
  const arena = document.createElement("div");
  arena.className = "arena";
  arena.appendChild(buildLockArea("top"));
  arena.appendChild(buildLockArea("left"));
  arena.appendChild(buildBoard());
  arena.appendChild(buildLockArea("right"));
  arena.appendChild(buildLockArea("bottom"));
  return arena;
}

// 手札を扇状に並べる。中央のカードを基準に、外側ほど回転がつき、盤面から遠ざかる向きに
// 少し逃げる弧を描く（トランプを持っている感じ）。上下(horizontal)は左右に、
// 左右(vertical)は上下に扇が開く。個々のカードを少しずつ回転させるだけなので、
// 扇コンテナ全体を90度回転させていた以前の方式（カード自体が横倒しになるバグがあった）とは違う。
// isSelf: 自分の手札は大きく扇状に開く。他プレイヤーの手札は裏向き・密集させて控えめに見せる。
const ARC_SIGN = { top: -1, bottom: 1, left: -1, right: 1 }; // 盤面から遠ざかる方向

function layoutFan(count, orientation, isSelf, side) {
  const maxSpread = isSelf ? Math.min(50, count * 11) : Math.min(24, count * 6); // 度
  const step = count > 1 ? maxSpread / (count - 1) : 0;
  const start = -maxSpread / 2;
  // すべてpx単位（1rem=16px換算）。カード同士の間隔
  const spacing = isSelf ? 48 : orientation === "vertical" ? 17.6 : 14.4;
  const arcStrength = isSelf ? 8 : 4; // px。外側のカードが盤面から逃げる強さ
  const arcSign = ARC_SIGN[side];

  return Array.from({ length: count }, (_, i) => {
    const angle = count > 1 ? start + step * i : 0;
    const centerOffset = i - (count - 1) / 2;
    const arc = Math.abs(centerOffset) * arcStrength * arcSign; // 中央が基準、外側ほど盤面から離れる
    if (orientation === "vertical") {
      return { angle, spreadX: arc, spreadY: centerOffset * spacing };
    }
    return { angle, spreadX: centerOffset * spacing, spreadY: arc };
  });
}

function buildPlayerZone(side, label, handCount, isSelf) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = "label";
  nameEl.textContent = label;

  const orientation = side === "left" || side === "right" ? "vertical" : "horizontal";

  const handEl = document.createElement("div");
  handEl.className = "hand-area";
  const fanEl = document.createElement("div");
  fanEl.className = `hand-fan ${isSelf ? "is-self" : "is-opponent"}`;

  for (const card of layoutFan(handCount, orientation, isSelf, side)) {
    const cardEl = document.createElement("div");
    cardEl.className = `hand-card ${isSelf ? "is-self" : "is-facedown"}`;
    cardEl.style.transform = `translateX(${card.spreadX}px) translateY(${card.spreadY}px) rotate(${card.angle}deg)`;
    fanEl.appendChild(cardEl);
  }
  handEl.appendChild(fanEl);

  zone.appendChild(nameEl);
  zone.appendChild(handEl);
  return zone;
}

function buildPileZone(gridArea, label, pileClass, pileLabel) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${gridArea} pile-zone`;

  const labelEl = document.createElement("div");
  labelEl.className = "label";
  labelEl.textContent = label;
  zone.appendChild(labelEl);

  const pile = document.createElement("div");
  pile.className = `pile ${pileClass}`;
  pile.textContent = pileLabel;
  zone.appendChild(pile);

  return zone;
}

// 駒は、ユドナリウム(TK11235/udonarium)のterrain（地形）コンポーネントの技法を移植して構築する。
// 「床」を高さ分持ち上げ、4枚の壁を角ごとのtransform-originで側面に貼り付ける、真のpreserve-3d立方体。
// 各面の見え方（どれだけ側面が見えるか）はブラウザの3D計算に任せるため、
// 駒の位置によるJS側の手動調整（leanFactor等）は不要になった。
function buildCubePiece(color) {
  const piece = document.createElement("div");
  piece.className = "piece";

  const top = document.createElement("div");
  top.className = "piece-face piece-top";
  top.style.background = `var(--color-${color})`;
  piece.appendChild(top);

  for (const wallClass of ["piece-wall-back", "piece-wall-front", "piece-wall-left", "piece-wall-right"]) {
    const wall = document.createElement("div");
    wall.className = `piece-face ${wallClass}`;
    wall.style.background = `var(--color-${color})`;
    piece.appendChild(wall);
  }

  return piece;
}

function placeDummyPieces(tableEl) {
  // 座席は手前(南)=A, 左(西)=B, 奥(北)=C, 右(東)=D。盤面を上から見て時計回り(A→B→C→D)。
  const pieceColors = { bottom: "red", left: "orange", top: "yellow", right: "green" };
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const cell = tableEl.querySelector(`.cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
    if (!cell) continue;
    cell.appendChild(buildCubePiece(pieceColors[side]));
    // 駒はセルより大きくはみ出すため、隣のマス（DOM順で後にあるもの）に隠されないよう最前面にする
    cell.style.zIndex = "10";
  }
}

function render() {
  const table = document.getElementById("game-table");
  table.innerHTML = "";
  table.appendChild(buildPlayerZone("bottom", "プレイヤーA（自分）", 4, true));
  table.appendChild(buildPlayerZone("left", "プレイヤーB", 2, false));
  table.appendChild(buildPlayerZone("top", "プレイヤーC", 3, false));
  table.appendChild(buildPlayerZone("right", "プレイヤーD", 5, false));
  table.appendChild(buildPileZone("deck", "山札", "pile-deck", "山札"));
  table.appendChild(buildPileZone("eternal", "エターナル", "pile-eternal", "永久"));
  table.appendChild(buildPileZone("discard", "捨て場", "pile-discard", "捨て場"));
  table.appendChild(buildArena());
  placeDummyPieces(table);
}

render();
