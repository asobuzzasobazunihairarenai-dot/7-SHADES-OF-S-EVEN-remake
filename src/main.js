// Phase 1: 盤面・手札・山札等を描画し、駒とカードをドラッグ操作で自由に動かせるようにする。
// ルール処理は行わない（ユドナリウムコネクトのような手動サンドボックス）。

import { initAdminMode } from "./admin.js";
import { initDeckViewer } from "./deck-viewer.js";
import { getState, moveToken, sendTokenToPile, drawFromPile, flipToken } from "./state.js";
import { getCardDefinition, getCardImagePath, getCardBackImagePath } from "./cards-data.js";

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
  COLORS.forEach((color, index) => {
    const slot = document.createElement("div");
    slot.className = "lock-slot";
    slot.dataset.side = side;
    slot.dataset.index = String(index);
    slot.style.borderColor = `var(--color-${color})`;
    slot.style.color = `var(--color-${color})`; // CSS側のbox-shadow: currentColorで使う
    // 以前は視認性確保のため塗りつぶしにしていたが、z-index修正で表示問題が解決したので、
    // 枠線とうっすらしたグロー(box-shadow)だけの控えめな色分けに戻した。
    el.appendChild(slot);
  });
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
  const playmatBg = document.createElement("div");
  playmatBg.className = "playmat-bg";
  arena.appendChild(playmatBg); // 最初に追加＝他の要素の背面に描画される
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
  // 相手の手札は弧をつけない：3D変形と組み合わさると非対称に見えてしまうため回転のみのシンプルな扇にする
  const arcStrength = isSelf ? 8 : 0;
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

function buildPlayerZone(side, label, player, isSelf) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = "label";
  nameEl.textContent = label;

  const orientation = side === "left" || side === "right" ? "vertical" : "horizontal";

  const handEl = document.createElement("div");
  handEl.className = "hand-area";
  handEl.dataset.player = player;
  const fanEl = document.createElement("div");
  fanEl.className = `hand-fan ${isSelf ? "is-self" : "is-opponent"}`;

  const handTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player
  );

  // .hand-areaは見た目だけでなく、カードをドロップする際の当たり判定(findDropTarget)にも
  // 使われる。固定サイズ(以前はwidth:100%=盤面と同じ幅)のままだと実際に見えている手札の
  // 範囲よりずっと広くなり、ロックエリアの帯と干渉してしまう。手札3枚の時を基準サイズ
  // (--hand-{player}-size、管理者モードで調整可能)とし、枚数に比例して自動で伸縮させる。
  // 扇が伸びる方向(横=horizontal、縦=vertical)にだけ効かせ、反対方向は固定のまま。
  const baseSize = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(`--hand-${player.toLowerCase()}-size`)
  );
  const scale = Math.max(handTokens.length, 2) / 3;
  const sizeRem = (Number.isNaN(baseSize) ? 10 : baseSize) * scale;
  if (orientation === "horizontal") handEl.style.width = `${sizeRem}rem`;
  else handEl.style.height = `${sizeRem}rem`;

  const layout = layoutFan(handTokens.length, orientation, isSelf, side);
  handTokens.forEach((token, i) => {
    const cardEl = document.createElement("div");
    // 自分の手札は常に中身が見える（物理カードを自分で持っているのと同じ）。
    // 他プレイヤーの手札は中身を明かさず、常に裏向きの見た目にする。
    // カード画像自体にタイトル・色・効果まで描かれているので、背景画像を敷くだけでよい。
    if (isSelf) {
      cardEl.className = "hand-card is-self";
      cardEl.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
    } else {
      cardEl.className = "hand-card is-facedown";
      cardEl.style.backgroundImage = `url("${getCardBackImagePath(token.cardId)}")`;
    }
    cardEl.dataset.tokenId = token.id;
    const card = layout[i];
    cardEl.style.transform = `translateX(${card.spreadX}px) translateY(${card.spreadY}px) rotate(${card.angle}deg)`;
    fanEl.appendChild(cardEl);
  });
  handEl.appendChild(fanEl);

  zone.appendChild(nameEl);
  zone.appendChild(handEl);
  return zone;
}

// 枚数に応じて厚みのある山を作る（山札・エターナルカード用。将来は盤面マスのスタックにも流用する）。
// 1枚あたり0.6px、最低0.15rem（0枚でも山があるように見える最低限の厚み）。
// imagePathを渡すと、その画像を背景に敷く（山札/エターナルは常に裏面画像、捨て場は
// 空でなければ一番上のカードの実際の絵柄）。
function buildCardStack(count, pileClass, pileLabel, imagePath) {
  const stack = document.createElement("div");
  stack.className = "stack";
  const heightPx = Math.max(2.4, count * 0.6);
  stack.style.setProperty("--stack-height", `${heightPx}px`);

  const top = document.createElement("div");
  top.className = `stack-top ${pileClass}`;
  if (imagePath) top.style.backgroundImage = `url("${imagePath}")`;
  const nameEl = document.createElement("div");
  nameEl.textContent = pileLabel;
  const countEl = document.createElement("div");
  countEl.className = "stack-count";
  countEl.textContent = `${count}枚`;
  top.appendChild(nameEl);
  top.appendChild(countEl);
  stack.appendChild(top);

  // 側面にtop面と同じカード柄を敷くと、薄い帯に絵柄が引き伸ばされて見苦しいため、
  // 側面は常に無地（CSS側で薄いグレー）のままにする。4面（前後左右）すべて用意しないと、
  // 見る角度によって存在しない面から奥が透けて見えてしまう（駒(.piece)と同じ理由）。
  for (const wallClass of ["stack-front", "stack-back", "stack-left", "stack-right"]) {
    const wall = document.createElement("div");
    wall.className = wallClass;
    stack.appendChild(wall);
  }

  return stack;
}

const PILE_CONFIG = {
  deck: { gridArea: "deck", pileClass: "pile-deck", label: "山札", backImage: "assets/cards/back-normal.png" },
  eternal: { gridArea: "eternal", pileClass: "pile-eternal", label: "永久", backImage: "assets/cards/back-eternal.png" },
  first: { gridArea: "first", pileClass: "pile-first", label: "ファースト", backImage: "assets/cards/back-first.png" },
  discard: { gridArea: "discard", pileClass: "pile-discard", label: "捨て場" },
};

// 枚数はゾーン外の別ラベルではなく、山自体（stack-top）の表示に含める。
// 山札・エターナルは常に裏面画像（裏向き積みのため中身は明かさない）。捨て場だけはルール上
// 「表向きに積む」場所なので、空でなければ一番上のカードの実際の画像・名前を表示する。
function buildPileZone(pileKey) {
  const config = PILE_CONFIG[pileKey];
  const zone = document.createElement("div");
  zone.className = `zone zone-${config.gridArea} pile-zone`;
  zone.dataset.pile = pileKey;

  const pileArray = getState().piles[pileKey];
  const count = pileArray.length;
  let label = config.label;
  let imagePath = config.backImage;
  if (pileKey === "discard" && count > 0) {
    const topId = pileArray[pileArray.length - 1];
    label = getCardDefinition(topId).name;
    imagePath = getCardImagePath(topId);
  }
  const stack = buildCardStack(count, config.pileClass, label, imagePath);
  stack.dataset.pile = pileKey;
  zone.appendChild(stack);
  return zone;
}

// 駒は、ユドナリウム(TK11235/udonarium)のterrain（地形）コンポーネントの技法を移植して構築する。
// 「床」を高さ分持ち上げ、4枚の壁を角ごとのtransform-originで側面に貼り付ける、真のpreserve-3d立方体。
// 各面の見え方（どれだけ側面が見えるか）はブラウザの3D計算に任せるため、
// 駒の位置によるJS側の手動調整（leanFactor等）は不要になった。
// 駒の見た目（画像素材/駒スキン、assets/pieces/にコピー）。柄付きの正方形テクスチャを
// 5面（上面+4つの壁）すべてに敷く。各壁は既存のfilter/brightnessで陰影がつくので、
// 単色時と同じ見た目のロジックがそのまま画像にも効く。
function buildCubePiece(color) {
  const piece = document.createElement("div");
  piece.className = "piece";
  const skinUrl = `url("assets/pieces/${color}.png")`;

  const top = document.createElement("div");
  top.className = "piece-face piece-top";
  top.style.backgroundImage = skinUrl;
  piece.appendChild(top);

  for (const wallClass of ["piece-wall-back", "piece-wall-front", "piece-wall-left", "piece-wall-right"]) {
    const wall = document.createElement("div");
    wall.className = `piece-face ${wallClass}`;
    wall.style.backgroundImage = skinUrl;
    piece.appendChild(wall);
  }

  return piece;
}

function findLocationElement(table, location) {
  if (location.zone === "cell") {
    return table.querySelector(`.cell[data-row="${location.row}"][data-col="${location.col}"]`);
  }
  if (location.zone === "lock") {
    return table.querySelector(`.lock-slot[data-side="${location.side}"][data-index="${location.index}"]`);
  }
  return null;
}

// 盤面マスの上に直接置かれたカードを表す簡易な見た目（手札の外に出たカードは扇の仕組みが
// 使えないため、セル/ロックスロットにフィットするだけの平たいカードにする）。
// 表向きなら実際のカード画像を、裏向きなら裏面の画像を敷く。ダブルクリックで表裏を切り替えられる
// （initFlipHandlers参照）。
function buildFlatCard(token) {
  const card = document.createElement("div");
  if (token.faceUp) {
    card.className = "board-card";
    card.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
  } else {
    card.className = "board-card is-facedown";
    card.style.backgroundImage = `url("${getCardBackImagePath(token.cardId)}")`;
  }
  return card;
}

// 盤面マス／ロックスロットの上にある駒・カードを両方描画する（手札の中のカードは
// buildPlayerZoneが別途担当する）。
// 同じマス/ロックスロットに重なっているカード(kind:"card"のみ、駒は数えない)をグループ化する。
// 戻り値はlocationごとのトークン配列（state.tokens内の並び順＝下から上への重なり順）。
function getCardStackGroups() {
  const groups = new Map();
  for (const token of getState().tokens) {
    if (token.kind !== "card") continue;
    if (token.location.zone !== "cell" && token.location.zone !== "lock") continue;
    const key =
      token.location.zone === "cell"
        ? `cell-${token.location.row}-${token.location.col}`
        : `lock-${token.location.side}-${token.location.index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(token);
  }
  return groups;
}

function renderBoardTokens(table) {
  for (const token of getState().tokens) {
    if (token.location.zone !== "cell" && token.location.zone !== "lock") continue;
    const host = findLocationElement(table, token.location);
    if (!host) continue;
    const el = token.kind === "piece" ? buildCubePiece(token.color) : buildFlatCard(token);
    el.dataset.tokenId = token.id;
    host.appendChild(el);
    // 駒・カードはセルより大きくはみ出すことがあるため、隣のマス（DOM順で後にあるもの）に
    // 隠されないよう最前面にする
    if (host.classList.contains("cell")) host.style.zIndex = "10";
  }

  // 2枚以上重なっているマス/ロックスロットには、一番上のカードに「+N」バッジを付ける。
  // バッジにカーソルを合わせると、重なっている全カードを一覧で拡大表示できる
  // （updateHover/updatePreviewが.stack-badgeを特別扱いする）。
  for (const tokens of getCardStackGroups().values()) {
    if (tokens.length < 2) continue;
    const topToken = tokens[tokens.length - 1];
    const topEl = table.querySelector(`[data-token-id="${topToken.id}"]`);
    if (!topEl) continue;
    const badge = document.createElement("div");
    badge.className = "stack-badge";
    badge.textContent = `+${tokens.length}`;
    badge.dataset.stackTokens = tokens.map((t) => t.id).join(",");
    topEl.appendChild(badge);
  }
}

function render() {
  const table = document.getElementById("game-table");
  table.innerHTML = "";
  // arena（プレイマット画像を含む）を最初に追加する＝DOM順で一番背面にする。
  // 後に追加した手札・山札・捨て場・エターナルは、画面上で座標が重なってもプレイマットより
  // 手前に描画される（盤面のマス目の枠線と同じ「高さ」で表示される、という要望に対応）。
  table.appendChild(buildArena());
  table.appendChild(buildPlayerZone("bottom", "プレイヤーA（自分）", "A", true));
  table.appendChild(buildPlayerZone("left", "プレイヤーB", "B", false));
  table.appendChild(buildPlayerZone("top", "プレイヤーC", "C", false));
  table.appendChild(buildPlayerZone("right", "プレイヤーD", "D", false));
  table.appendChild(buildPileZone("deck"));
  table.appendChild(buildPileZone("eternal"));
  table.appendChild(buildPileZone("first"));
  table.appendChild(buildPileZone("discard"));
  renderBoardTokens(table);
  fitTableToViewport();
}

// 画面サイズが変わっても手札などが見切れないよう、テーブル全体をビューポートに収まる
// 倍率へ動的に縮小・拡大する。rem基準の固定サイズレイアウトのままでも、外側のscale
// だけをJSで調整することでウィンドウサイズへの追従を実現する。
function fitTableToViewport() {
  const table = document.getElementById("game-table");
  const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
  // scale()は2軸(X/Y)しか縮小しないため、駒の高さ等のtranslateZ(奥行き)がそのまま残り、
  // 画面を小さくするほど駒が奥行き方向にだけ間延びして見えるバグがあった。
  // scale3d()でZ軸も同じ倍率にすることで、縮小しても駒の縦横比が保たれるようにする。
  table.style.transform = `rotateX(${tilt}) scale3d(1, 1, 1)`;
  const rect = table.getBoundingClientRect();
  const availW = window.innerWidth * 0.94;
  const availH = window.innerHeight * 0.94;
  const scale = Math.min(availW / rect.width, availH / rect.height, 1.15);
  table.style.transform = `rotateX(${tilt}) scale3d(${scale}, ${scale}, ${scale})`;
}

let resizeTimer;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitTableToViewport, 100);
});

// --- ドラッグ操作 ---------------------------------------------------------
// ルールを一切適用しない自由な移動なので、「掴んだ物を離した場所」を見て状態を更新するだけの
// シンプルな仕組みにする。ドラッグ中は実体を動かさず、カーソルに追従する「ゴースト」だけを
// 画面全体(document.body)に浮かせて表示する。盤面自体がperspective+rotateXで傾いた3D空間の
// 中にあるため、ドラッグ中の要素をその中で動かそうとすると座標計算が複雑になる。ゴーストを
// 3D空間の外(body直下)に置いてカーソルに1:1で追従させる方が単純かつ確実。
// ドロップ位置の判定はelementsFromPoint()で「その座標にある要素」を調べ、盤面マス／ロック
// スロット／手札エリア／山札等のどれに該当するかをclosest()で特定する。

let dragSession = null;

// ドラッグ開始対象の特定は、各要素にpointerdownを直接付ける方式ではなく、#game-table全体に
// 1つだけ付けたリスナーの中でelementsFromPoint()を使って手動で判定する。
// 理由（ハマりどころ）: このアプリの盤面はperspective+rotateXの3D階層が何段も入れ子に
// なっており、ネイティブのヒットテスト（＝どの要素がpointerdownを受け取るか。elementFromPoint
// と同じ仕組み）が、実際に描画されている見た目と食い違うことがある。特に自分の手札
// （.hand-fan.is-selfがrotateX(-40deg)+translateZ(2.4rem)で大きく持ち上げられ、カメラに
// ほぼ正対する角度になっている）は、見た目には正しくカードが手前に描画されているのに、
// ネイティブのヒットテストだけがその奥にある.zone-bottom（何もリスナーの無い平坦なコンテナ）
// を返してしまい、カード自体にpointerdownイベントが一切届かず「触れない」状態になっていた。
// 一方でelementsFromPoint()（複数形）は実際の見た目通りに.hand-cardを最前面として正しく
// 返すことを確認できたため、要素個別のリスナーに頼らずelementsFromPoint()で自前判定する
// 方式に統一した（ドロップ先の判定は元々この方式だった）。
function findDraggableAt(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const piece = el.closest(".piece");
    if (piece) return { el: piece, tokenId: piece.dataset.tokenId, kind: "piece" };
    // 盤面マス／ロックスロットに直接置かれたカードは、手札のカードと違ってダブルクリックで
    // 表裏を反転できる対象なので区別しておく(isBoardCard)。
    const boardCard = el.closest(".board-card");
    if (boardCard) return { el: boardCard, tokenId: boardCard.dataset.tokenId, kind: "card", isBoardCard: true };
    const handCard = el.closest(".hand-card");
    if (handCard) return { el: handCard, tokenId: handCard.dataset.tokenId, kind: "card" };
    const stack = el.closest(".stack[data-pile]");
    if (stack) return { el: stack, kind: "pile", pile: stack.dataset.pile };
  }
  return null;
}

// マウスカーソルの下にある「つかめる/対象になる」要素をハイライトする（ドラッグはしない、
// ホバーだけ）。findDraggableAt()と同じ優先順位（駒＞カード＞山）で判定するので、駒がカードの
// 上に乗っている時に「今クリックしたらどっちが掴めるか」がハイライトで分かるようになる。
// 加えて、何も乗っていない空のマス／ロックスロットもホバー対象にする（掴めるものが無くても
// マス自体を示したいため）。
function findHoverTarget(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    // 「+N」バッジ（重なりカードの一覧表示）は一番手前にあるので最優先で判定する。
    const badge = el.closest(".stack-badge");
    if (badge) return badge;
    const piece = el.closest(".piece");
    if (piece) return piece;
    const boardCard = el.closest(".board-card");
    if (boardCard) return boardCard;
    const handCard = el.closest(".hand-card");
    if (handCard) return handCard;
    const stack = el.closest(".stack[data-pile]");
    if (stack) return stack;
    const cell = el.closest(".cell");
    if (cell) return cell;
    const lockSlot = el.closest(".lock-slot");
    if (lockSlot) return lockSlot;
  }
  return null;
}

let hoverEl = null;

function clearHover() {
  if (hoverEl) hoverEl.classList.remove("hover-active");
  hoverEl = null;
}

// ホバー/右クリック中の要素が「中身の見える表向きカード」なら、そのcardIdを返す
// （それ以外はnull）。自分の手札(is-self)は常に中身が見える。盤面/ロックのカードは
// token.faceUpを見る。捨て場はルール上表向きに積まれているので、空でなければ一番上の
// カードだけ対象になる（山札・エターナル・ファーストは裏向き積みなので中身を明かさない）。
function getVisibleCardId(el) {
  if (el.classList.contains("hand-card")) {
    if (!el.classList.contains("is-self")) return null;
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    return token ? token.cardId : null;
  }
  if (el.classList.contains("board-card")) {
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    return token && token.faceUp ? token.cardId : null;
  }
  if (el.matches(".stack[data-pile]") && el.dataset.pile === "discard") {
    const pile = getState().piles.discard;
    return pile.length > 0 ? pile[pile.length - 1] : null;
  }
  return null;
}

function getPreviewImagePath(el) {
  const cardId = getVisibleCardId(el);
  return cardId ? getCardImagePath(cardId) : null;
}

let previewEl = null;
function getPreviewEl() {
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = "card-preview";
    document.body.appendChild(previewEl);
  }
  return previewEl;
}

let stackPreviewEl = null;
function getStackPreviewEl() {
  if (!stackPreviewEl) {
    stackPreviewEl = document.createElement("div");
    stackPreviewEl.id = "stack-preview";
    document.body.appendChild(stackPreviewEl);
  }
  return stackPreviewEl;
}

// 「+N」バッジにカーソルを合わせた時、重なっている全カードを横一列で拡大表示する。
// 各カードは自分自身のfaceUpに従って表向き/裏向きの画像を出す（下に潜んでいる裏向きの
// カードの中身を、一覧表示によって覗けてしまわないようにするため）。
function showStackPreview(badge, clientX, clientY) {
  const ids = badge.dataset.stackTokens.split(",");
  const tokens = ids.map((id) => getState().tokens.find((t) => t.id === id)).filter(Boolean);
  const panel = getStackPreviewEl();
  panel.innerHTML = "";
  for (const token of tokens) {
    const card = document.createElement("div");
    card.className = "stack-preview-card";
    const imagePath = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
    card.style.backgroundImage = `url("${imagePath}")`;
    panel.appendChild(card);
  }
  positionPreviewPanel(panel, clientX, clientY);
  panel.style.display = "flex";
}

// #card-previewと#stack-previewで共通の位置決め処理。拡大の起点は左下端（＝カーソル付近）に
// 固定し、そこから右上方向へ広がるようにする。left/bottom（topではなく）で位置決めしている
// のがポイント：中身のサイズが変わってもleft/bottomの基準点自体はズレない。画面右端を
// はみ出す場合だけ、右上ではなく左上方向へ表示先を切り替える。
function positionPreviewPanel(panel, clientX, clientY) {
  const offset = 20;
  let left = clientX + offset;
  const panelWidthPx = panel.getBoundingClientRect().width || parseFloat(getComputedStyle(panel).width);
  if (left + panelWidthPx > window.innerWidth) left = clientX - offset - panelWidthPx;
  const bottom = window.innerHeight - clientY + offset;
  panel.style.left = `${left}px`;
  panel.style.bottom = `${bottom}px`;
  panel.style.top = "";
}

function updatePreview(el, clientX, clientY) {
  const preview = getPreviewEl();
  const stackPreview = getStackPreviewEl();

  if (el && el.classList.contains("stack-badge")) {
    preview.style.display = "none";
    showStackPreview(el, clientX, clientY);
    return;
  }
  stackPreview.style.display = "none";

  const imagePath = el ? getPreviewImagePath(el) : null;
  if (!imagePath) {
    preview.style.display = "none";
    return;
  }
  preview.style.backgroundImage = `url("${imagePath}")`;
  positionPreviewPanel(preview, clientX, clientY);
  preview.style.display = "block";
}

function updateHover(clientX, clientY) {
  // ドラッグ中はドロップ先ハイライト(.drop-target-active)と役割が被って紛らわしいので休止する。
  if (dragSession) {
    clearHover();
    updatePreview(null);
    return;
  }
  const next = findHoverTarget(clientX, clientY);
  if (next !== hoverEl) {
    clearHover();
    if (next) next.classList.add("hover-active");
    hoverEl = next;
  }
  updatePreview(next, clientX, clientY);
}

function initHoverHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("pointermove", (e) => updateHover(e.clientX, e.clientY));
  table.addEventListener("pointerleave", () => {
    clearHover();
    updatePreview(null);
  });
}

// --- 右クリックメニュー ---------------------------------------------------
// ゲーム内では常にブラウザ標準の右クリックメニューを出さないようにし、代わりに専用メニューを
// 出す。対象の判定は、dblclickと同じ理由でネイティブのe.targetを信用せず、ここでも
// elementsFromPoint()ベースのfindHoverTarget()を使う。中身の分かるカード以外（駒や空マス等）は
// 今のところメニュー項目が無いので、ブラウザメニューを消すだけに留める。
let contextMenuEl = null;

function closeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

function showCardNoteModal(cardId) {
  const def = getCardDefinition(cardId);
  if (!def) return;
  const modal = document.createElement("div");
  modal.id = "card-note-modal";
  const title = document.createElement("div");
  title.className = "card-note-title";
  title.textContent = def.name;
  const body = document.createElement("div");
  body.className = "card-note-body";
  body.textContent = def.note || "（補足なし）";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  closeBtn.addEventListener("click", () => modal.remove());
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(closeBtn);
  document.body.appendChild(modal);
}

function showContextMenu(clientX, clientY, cardId) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.id = "card-context-menu";
  const item = document.createElement("button");
  item.textContent = "カード補足を見る";
  item.addEventListener("click", () => {
    closeContextMenu();
    showCardNoteModal(cardId);
  });
  menu.appendChild(item);
  menu.style.left = `${clientX}px`;
  menu.style.top = `${clientY}px`;
  document.body.appendChild(menu);
  contextMenuEl = menu;
}

function initContextMenuHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("contextmenu", (e) => {
    e.preventDefault(); // ゲームの盤面上では常にブラウザの既定メニューを出さない
    const hit = findHoverTarget(e.clientX, e.clientY);
    const cardId = hit ? getVisibleCardId(hit) : null;
    if (!cardId) {
      closeContextMenu();
      return;
    }
    showContextMenu(e.clientX, e.clientY, cardId);
  });
  document.addEventListener("pointerdown", (e) => {
    if (contextMenuEl && !contextMenuEl.contains(e.target)) closeContextMenu();
  });
}

// ダブルクリックでの表裏反転は、ネイティブの`dblclick`イベントではなく、ドラッグと同じ
// elementsFromPoint()ベースの判定に統合して自前実装する。
// 理由（ハマりどころ）: `dblclick`もpointerdown同様ネイティブのヒットテスト(target)に頼る
// イベントのため、自分の手札で起きたのと同じ「見た目と当たり判定がズレる」3D階層特有の問題で
// 正しく発火しないことがあった（ユーザー報告：「ダブルクリックで裏返せない」）。ドラッグ開始
// 判定は既にelementsFromPoint()で確実に動いているため、同じ判定結果を使って「同じカードに
// 400ms以内に2回pointerdownがあったか」を見ることでダブルクリック相当を検出する。
let lastFlipClick = { tokenId: null, time: 0 };
const DOUBLE_CLICK_MS = 400;

function initDragHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const hit = findDraggableAt(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();

    if (hit.isBoardCard) {
      const now = Date.now();
      const isDoubleClick = hit.tokenId === lastFlipClick.tokenId && now - lastFlipClick.time < DOUBLE_CLICK_MS;
      lastFlipClick = { tokenId: hit.tokenId, time: now };
      if (isDoubleClick) {
        flipToken(hit.tokenId);
        render();
        lastFlipClick = { tokenId: null, time: 0 }; // 3連続クリックを2回分のダブルクリックにしない
        return;
      }
    }

    if (hit.kind === "pile") startPileDrag(e, hit.pile);
    else startTokenDrag(e, hit.tokenId, hit.kind, hit.el);
  });
}

function createGhost(kind, tokenId) {
  const token = getState().tokens.find((t) => t.id === tokenId);
  if (kind === "piece") {
    // 駒はドラッグ中も立方体のまま見せる。3D空間の外(document.body直下)に置くゴーストでも
    // 見た目を保てるよう、perspective+盤面と同じ傾きを与えた入れ子(outer/inner)の中に
    // 本物の.pieceを丸ごと入れる（buildCubePieceをそのまま再利用）。
    const outer = document.createElement("div");
    outer.className = "drag-ghost drag-ghost-piece-outer";
    const inner = document.createElement("div");
    inner.className = "drag-ghost-piece-inner";
    const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
    inner.style.transform = `rotateX(${tilt})`;
    inner.appendChild(buildCubePiece(token.color));
    outer.appendChild(inner);
    document.body.appendChild(outer);
    return outer;
  }

  const ghost = document.createElement("div");
  // ドラッグ元のDOMクラス（.is-self等）に頼ると、手札の外(.board-card)から拾った場合に
  // 対応するクラスが無くて判定を誤るため、必ずstateの実データ(faceUp)を見て決める。
  const faceClass = token && token.faceUp ? "is-self" : "is-facedown";
  ghost.className = `hand-card ${faceClass} drag-ghost`;
  const imagePath = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
  ghost.style.backgroundImage = `url("${imagePath}")`;
  document.body.appendChild(ghost);
  return ghost;
}

function positionGhost(ghost, clientX, clientY) {
  ghost.style.transform = `translate(${clientX}px, ${clientY}px) translate(-50%, -50%)`;
}

function startTokenDrag(e, tokenId, kind, sourceEl) {
  const ghost = createGhost(kind, tokenId);
  positionGhost(ghost, e.clientX, e.clientY);
  // ドラッグ中は元の場所の実体を隠す（ゴーストと二重に見えたり、掴んでいるはずのカードが
  // 手札に残ったまま見えたりしないようにするため）。dropの成否にかかわらず必ずrender()で
  // DOMが作り直されるので、明示的に元に戻す処理は不要。
  sourceEl.style.visibility = "hidden";
  dragSession = { tokenId, kind, ghost, pileSource: null, highlightEl: null };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  updateDropHighlight(e.clientX, e.clientY);
}

function startPileDrag(e, pileKey) {
  const pileArray = getState().piles[pileKey];
  if (pileArray.length === 0) return; // 空の山からは引けない
  const topCardId = pileArray[pileArray.length - 1];
  const ghost = document.createElement("div");
  // 捨て場は表向きに積まれている（ルール通り）ので一番上のカードの実物画像を、
  // 山札・エターナルは裏向き積みなので裏面画像をゴーストに表示する。
  if (pileKey === "discard") {
    ghost.className = "hand-card is-self drag-ghost";
    ghost.style.backgroundImage = `url("${getCardImagePath(topCardId)}")`;
  } else {
    ghost.className = "hand-card is-facedown drag-ghost";
    ghost.style.backgroundImage = `url("${getCardBackImagePath(topCardId)}")`;
  }
  document.body.appendChild(ghost);
  positionGhost(ghost, e.clientX, e.clientY);
  dragSession = { tokenId: null, kind: "card", ghost, pileSource: pileKey, highlightEl: null };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  updateDropHighlight(e.clientX, e.clientY);
}

function onDragMove(e) {
  if (!dragSession) return;
  positionGhost(dragSession.ghost, e.clientX, e.clientY);
  updateDropHighlight(e.clientX, e.clientY);
}

// ドラッグ中、今離すとどこに置かれるかを光らせて示す。findDropTarget()が返す実際の
// 対象要素(el)に.drop-target-activeクラスを付け外しするだけなので、レイアウトには影響しない。
function updateDropHighlight(clientX, clientY) {
  const result = findDropTarget(clientX, clientY, dragSession.kind);
  const nextEl = result ? result.el : null;
  if (dragSession.highlightEl === nextEl) return;
  if (dragSession.highlightEl) dragSession.highlightEl.classList.remove("drop-target-active");
  if (nextEl) nextEl.classList.add("drop-target-active");
  dragSession.highlightEl = nextEl;
}

function findDropTarget(clientX, clientY, kind) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    // 盤面マス／ロックスロットは駒・カード共通の移動先（ルール適用なしの自由配置のため）。
    const cell = el.closest(".cell");
    if (cell) return { location: { zone: "cell", row: Number(cell.dataset.row), col: Number(cell.dataset.col) }, el: cell };
    const lockSlot = el.closest(".lock-slot");
    if (lockSlot) {
      return {
        location: { zone: "lock", side: lockSlot.dataset.side, index: Number(lockSlot.dataset.index) },
        el: lockSlot,
      };
    }
    if (kind === "card") {
      const handArea = el.closest(".hand-area");
      if (handArea) return { location: { zone: "hand", player: handArea.dataset.player }, el: handArea };
      const pileZone = el.closest(".pile-zone");
      if (pileZone) {
        // ハイライトは.pile-zone（グリッド上の枠、実際の山より大きくズレて見える）ではなく、
        // 実際に見えている山(.stack)自体に付ける。サイズ・位置とも見た目と一致する。
        const stackEl = pileZone.querySelector(".stack") || pileZone;
        return { location: { zone: "pile", pile: pileZone.dataset.pile }, el: stackEl };
      }
    }
  }
  return null;
}

function onDragEnd(e) {
  if (!dragSession) return;
  const { tokenId, kind, ghost, pileSource, highlightEl } = dragSession;
  ghost.remove();
  if (highlightEl) highlightEl.classList.remove("drop-target-active");
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  document.body.style.userSelect = "";

  const dropResult = findDropTarget(e.clientX, e.clientY, kind);
  const dropTarget = dropResult ? dropResult.location : null;
  dragSession = null;

  if (pileSource) {
    // 山からは手札だけでなく盤面マス・ロックスロットへも直接置ける（ルール適用なしの自由な
    // 移動のため）。ただし山(pile)自体へは置けない——山は個々のカードを保持せず残り枚数
    // だけを持つ構造なので、"zone: pile"を新しいカードの置き場所にはできない。
    if (dropTarget && dropTarget.zone !== "pile") drawFromPile(pileSource, dropTarget);
    render(); // 引けた場合も引けなかった場合も、必ず再描画する（drawFromPile後にrenderし忘れると
    // 状態は更新済みなのに画面に反映されず、次に別の操作でrender()が走った時にまとめて
    // 反映されたように見えるバグになる。これが実際に起きていたので、必ずここで呼ぶ）。
    return;
  }

  if (!dropTarget) {
    render();
    return;
  }
  if (dropTarget.zone === "pile") sendTokenToPile(tokenId, dropTarget.pile);
  else moveToken(tokenId, dropTarget);
  render();
}

// 管理者モードのスライダーには、CSS変数を変えるだけでは反映されない値（--hand-*-sizeなど、
// JS側でgetComputedStyleして読み取り、inline styleとして適用しているもの）があるため、
// 変更のたびに再描画してもらう。
window.addEventListener("admin:change", render);

render();
initDragHandlers();
initHoverHandlers();
initContextMenuHandlers();
initAdminMode();
initDeckViewer();
