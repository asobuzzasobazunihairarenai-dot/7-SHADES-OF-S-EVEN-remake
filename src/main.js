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

// 手札を並べる。中央のカードほど高く、外側ほど回転がつく（トランプを持っている感じ）。
// orientation: "horizontal"（上下のプレイヤー）は左右に扇状、"vertical"（左右のプレイヤー）は
// カードは回転させず上下に積む（回転させると扇ごと横倒しになってしまうため）。
// isSelf: 自分の手札は大きく扇状に開く。他プレイヤーの手札は裏向き・密集させて控えめに見せる。
function layoutFan(count, orientation, isSelf) {
  if (orientation === "vertical") {
    const spacing = isSelf ? 1.4 : 0.9; // rem
    return Array.from({ length: count }, (_, i) => {
      const centerOffset = i - (count - 1) / 2;
      return { angle: 0, spreadX: 0, spreadY: centerOffset * spacing };
    });
  }
  const maxSpread = isSelf ? Math.min(50, count * 11) : Math.min(24, count * 6); // 度
  const step = count > 1 ? maxSpread / (count - 1) : 0;
  const start = -maxSpread / 2;
  const spacing = isSelf ? 3.0 : 0.9; // rem。カード同士の水平間隔（相手は重なりを強くする）
  return Array.from({ length: count }, (_, i) => {
    const angle = count > 1 ? start + step * i : 0;
    const centerOffset = i - (count - 1) / 2;
    const lift = isSelf ? -Math.abs(centerOffset) * 8 : 0; // 中央が高く、外側が下がる弧（相手は平ら）
    const spreadX = centerOffset * spacing;
    return { angle, spreadX, spreadY: lift / 16, liftPx: lift };
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

  for (const card of layoutFan(handCount, orientation, isSelf)) {
    const cardEl = document.createElement("div");
    cardEl.className = `hand-card ${isSelf ? "is-self" : "is-facedown"}`;
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

// 駒はユドナリウムの駒コンポーネントを参考に、複数面を組み立てる立方体ではなく、
// 非対称な太さ・濃淡のボーダーだけで立体感を出す方式にした（skewによる面組み立ては
// 隣マスへのはみ出し等で繰り返し崩れたため、より単純で壊れにくい手法に変更）。
const COLOR_HEX = {
  red: "#dc2626",
  orange: "#ea580c",
  yellow: "#ca8a04",
  green: "#16a34a",
  blue: "#0891b2",
  pink: "#db2777",
  purple: "#7e22ce",
};

function shade(hex, percent) {
  const num = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + Math.round(2.55 * percent));
  const g = clamp(((num >> 8) & 0xff) + Math.round(2.55 * percent));
  const b = clamp((num & 0xff) + Math.round(2.55 * percent));
  return `rgb(${r}, ${g}, ${b})`;
}

// leanFactor: -1(盤面左端)〜0(中央列)〜+1(盤面右端)。
// 中心から離れたマスほど側面がよく見える想定で、中心を向く側のボーダーを太く・濃くする。
function buildCubePiece(color, leanFactor = 0) {
  const piece = document.createElement("div");
  piece.className = "piece";
  const base = COLOR_HEX[color];

  piece.style.background = base;
  piece.style.borderTopColor = shade(base, 40); // 上面: 明るい
  piece.style.borderBottomColor = shade(base, -45); // 底: 暗い（影）

  const magnitude = 0.35 + 0.65 * Math.min(1, Math.abs(leanFactor));
  const visibleWidth = `${(0.55 * magnitude).toFixed(2)}rem`;
  const visibleColor = shade(base, -25); // 見えている側面: やや暗い
  const hiddenColor = shade(base, -10);
  if (leanFactor <= 0) {
    piece.style.borderRightWidth = visibleWidth;
    piece.style.borderRightColor = visibleColor;
    piece.style.borderLeftWidth = "0.12rem";
    piece.style.borderLeftColor = hiddenColor;
  } else {
    piece.style.borderLeftWidth = visibleWidth;
    piece.style.borderLeftColor = visibleColor;
    piece.style.borderRightWidth = "0.12rem";
    piece.style.borderRightColor = hiddenColor;
  }

  return piece;
}

function placeDummyPieces(tableEl) {
  // 座席は手前(南)=A, 左(西)=B, 奥(北)=C, 右(東)=D。盤面を上から見て時計回り(A→B→C→D)。
  const pieceColors = { bottom: "red", left: "orange", top: "yellow", right: "green" };
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const cell = tableEl.querySelector(`.cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
    if (!cell) continue;
    const leanFactor = (pos.col - 3) / 3;
    cell.appendChild(buildCubePiece(pieceColors[side], leanFactor));
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
