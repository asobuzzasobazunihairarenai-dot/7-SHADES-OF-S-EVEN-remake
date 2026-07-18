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

// 手札を扇状に並べる。中央のカードほど高く、外側ほど回転がつく（トランプを持っている感じ）。
// orientation: "horizontal"（上下のプレイヤー）は左右に扇状、"vertical"（左右のプレイヤー）は
// カードは回転させず上下に積む（回転させると扇ごと横倒しになってしまうため）。
function layoutFan(count, orientation) {
  if (orientation === "vertical") {
    const spacing = 1.4; // rem
    return Array.from({ length: count }, (_, i) => {
      const centerOffset = i - (count - 1) / 2;
      return { angle: 0, spreadX: 0, spreadY: centerOffset * spacing };
    });
  }
  const maxSpread = Math.min(50, count * 11); // 度。枚数が多いほど広がるが上限あり
  const step = count > 1 ? maxSpread / (count - 1) : 0;
  const start = -maxSpread / 2;
  return Array.from({ length: count }, (_, i) => {
    const angle = count > 1 ? start + step * i : 0;
    const centerOffset = i - (count - 1) / 2;
    const lift = -Math.abs(centerOffset) * 6; // 中央が高く、外側が下がる弧
    const spreadX = centerOffset * 1.6; // rem。カード同士の水平間隔
    return { angle, spreadX, spreadY: lift / 16, liftPx: lift };
  });
}

function buildPlayerZone(side, label, handCount) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = "label";
  nameEl.textContent = label;

  const orientation = side === "left" || side === "right" ? "vertical" : "horizontal";

  const handEl = document.createElement("div");
  handEl.className = "hand-area";
  const fanEl = document.createElement("div");
  fanEl.className = "hand-fan";

  for (const card of layoutFan(handCount, orientation)) {
    const cardEl = document.createElement("div");
    cardEl.className = "hand-card";
    const liftPx = card.liftPx ?? 0;
    cardEl.style.transform =
      orientation === "vertical"
        ? `translateY(${card.spreadY}rem)`
        : `translateX(${card.spreadX}rem) translateY(${liftPx}px) rotate(${card.angle}deg)`;
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

function buildCubePiece(color) {
  const piece = document.createElement("div");
  piece.className = "piece";
  for (const faceClass of ["face-top", "face-front", "face-side"]) {
    const face = document.createElement("div");
    face.className = `face ${faceClass}`;
    face.style.background = `var(--color-${color})`;
    piece.appendChild(face);
  }
  return piece;
}

function placeDummyPieces(tableEl) {
  const pieceColors = { top: "red", bottom: "pink", left: "purple", right: "blue" };
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const cell = tableEl.querySelector(`.cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
    if (!cell) continue;
    cell.appendChild(buildCubePiece(pieceColors[side]));
  }
}

function render() {
  const table = document.getElementById("game-table");
  table.innerHTML = "";
  table.appendChild(buildPlayerZone("top", "プレイヤーA", 3));
  table.appendChild(buildPlayerZone("bottom", "プレイヤーC", 4));
  table.appendChild(buildPlayerZone("left", "プレイヤーD", 2));
  table.appendChild(buildPlayerZone("right", "プレイヤーB", 5));
  table.appendChild(buildPileZone("deck", "山札", "pile-deck", "山札"));
  table.appendChild(buildPileZone("eternal", "エターナル", "pile-eternal", "永久"));
  table.appendChild(buildPileZone("discard", "捨て場", "pile-discard", "捨て場"));
  table.appendChild(buildArena());
  placeDummyPieces(table);
}

render();
