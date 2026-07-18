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

function buildPlayerZone(side, label, handCount) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = "label";
  nameEl.textContent = label;
  const handEl = document.createElement("div");
  handEl.className = "hand-area";
  for (let i = 0; i < handCount; i++) {
    const card = document.createElement("div");
    card.className = "hand-card";
    handEl.appendChild(card);
  }
  zone.appendChild(nameEl);
  zone.appendChild(handEl);
  return zone;
}

function buildSharedPiles() {
  const zone = document.createElement("div");
  zone.className = "zone zone-shared shared-piles";

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = "共有";
  zone.appendChild(label);

  const deck = document.createElement("div");
  deck.className = "pile pile-deck";
  deck.textContent = "山札";
  zone.appendChild(deck);

  const discard = document.createElement("div");
  discard.className = "pile pile-discard";
  discard.textContent = "捨て場";
  zone.appendChild(discard);

  const eternal = document.createElement("div");
  eternal.className = "pile pile-eternal";
  eternal.textContent = "永久";
  zone.appendChild(eternal);

  return zone;
}

function placeDummyPieces(tableEl) {
  const pieceColors = { top: "red", bottom: "pink", left: "purple", right: "blue" };
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const cell = tableEl.querySelector(`.cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
    if (!cell) continue;
    const piece = document.createElement("div");
    piece.className = "piece";
    piece.style.background = `var(--color-${pieceColors[side]})`;
    cell.appendChild(piece);
  }
}

function render() {
  const table = document.getElementById("game-table");
  table.innerHTML = "";
  table.appendChild(buildPlayerZone("top", "プレイヤーA", 3));
  table.appendChild(buildPlayerZone("bottom", "プレイヤーC", 4));
  table.appendChild(buildPlayerZone("left", "プレイヤーD", 2));
  table.appendChild(buildPlayerZone("right", "プレイヤーB", 5));
  table.appendChild(buildSharedPiles());
  table.appendChild(buildArena());
  placeDummyPieces(table);
}

render();
