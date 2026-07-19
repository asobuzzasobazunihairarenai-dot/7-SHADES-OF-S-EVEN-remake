// Phase 1: 盤面・手札・山札等を描画し、駒とカードをドラッグ操作で自由に動かせるようにする。
// ルール処理は行わない（ユドナリウムコネクトのような手動サンドボックス）。

import { initAdminMode, getUsableLockedEffect } from "./admin.js";
import { initDeckViewer } from "./deck-viewer.js";
import { initGameSetup } from "./game-setup.js";
import { initOptionsMenu } from "./options-menu.js";
import { runGateInvasionsIfNeeded } from "./gate-invasion.js";
import { announceHandPickups, announceCardLocked } from "./hand-announcer.js";
import { checkForVictory } from "./victory.js";
import { getSkinImagePath, getMyPieceColor, openPieceSkinPicker } from "./piece-skins.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getPlayerName, getPlayerAvatar, setPlayerName, setPlayerAvatar, AVATAR_OPTIONS } from "./player-identity.js";
import { getSelectedPlaymatPath } from "./playmat.js";
import { isLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible } from "./lock-color.js";
import { showCardArrivalModal } from "./card-arrival.js";
import { initPlayerButtons } from "./player-buttons.js";
import { initQuickStart } from "./quick-start.js";
import { getState, moveToken, sendTokenToPile, drawFromPile, flipToken, shuffleHand, nextTurn, refillDeckFromDiscard } from "./state.js";
import { playSound } from "./sound.js";
import { getCardDefinition, getCardImagePath, getCardBackImagePath } from "./cards-data.js";
import { COLORS, GATE_POSITIONS, SEAT_TO_SIDE, SIDE_TO_SEAT } from "./board-layout.js";

function buildLockArea(side) {
  const el = document.createElement("div");
  const turnPlayer = getState().turnPlayer;
  const isTurnSide = turnPlayer && SEAT_TO_SIDE[turnPlayer] === side;
  el.className = `lock-area lock-${side}${isTurnSide ? " is-turn-player" : ""}`;
  COLORS.forEach((color, index) => {
    const slot = document.createElement("div");
    slot.className = "lock-slot";
    slot.dataset.side = side;
    slot.dataset.index = String(index);
    // オプションメニューの「基本設定」でオフにされていれば、色の上書きをせずCSS側の
    // デフォルト（無色のグレー枠）のままにする。
    if (isLockColorVisible()) {
      slot.style.borderColor = `var(--color-${color})`;
      slot.style.color = `var(--color-${color})`; // CSS側のbox-shadow: currentColorで使う
    }
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

// ロックエリアと盤面(49マス)の間に置く装飾バー。画像自体は横長（画像素材/ロックエリアバー/）
// なので、外側の位置決め用ボックス（top/bottomはそのまま、left/rightは幅高さを入れ替えた
// 縦長）と、中の画像用要素（常に横長のまま、left/rightだけCSSでrotate(90deg)）を分けている。
// こうすることで、回転による見た目上のズレを位置決めの計算に混ぜずに済む。
function buildLockAreaBar(side) {
  const outer = document.createElement("div");
  outer.className = `lock-area-bar lock-area-bar-${side}`;
  outer.style.display = isLockAreaBarVisible() ? "block" : "none";
  const img = document.createElement("div");
  img.className = "lock-area-bar-image";
  outer.appendChild(img);
  return outer;
}

function buildArena() {
  const arena = document.createElement("div");
  arena.className = "arena";
  const playmatBg = document.createElement("div");
  playmatBg.className = "playmat-bg";
  playmatBg.style.backgroundImage = `url("${getSelectedPlaymatPath()}")`;
  arena.appendChild(playmatBg); // 最初に追加＝他の要素の背面に描画される
  arena.appendChild(buildLockAreaBar("top"));
  arena.appendChild(buildLockAreaBar("bottom"));
  arena.appendChild(buildLockAreaBar("left"));
  arena.appendChild(buildLockAreaBar("right"));
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

function buildPlayerZone(side, player, isSelf) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = `label${player === getState().turnPlayer ? " is-turn-player" : ""}`;
  nameEl.textContent = getPlayerName(player);

  // アバターは「手札の後ろ側」に見えるよう、手札(.hand-area)より先にDOMへ足す
  // （同じ場所で重なった時、後から足した手札側が手前に描画される）。管理者モードで
  // 位置・サイズを調整できる（--avatar-{a,b,c,d}-pos-x/y・--avatar-size）。
  const avatarEl = document.createElement("div");
  avatarEl.className = `player-avatar${player === getState().turnPlayer ? " is-turn-player" : ""}`;
  avatarEl.textContent = getPlayerAvatar(player);

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
  zone.appendChild(avatarEl);
  zone.appendChild(handEl);
  return zone;
}

// 枚数に応じて厚みのある山を作る（山札・エターナルカード用。将来は盤面マスのスタックにも流用する）。
// 1枚あたり0.6px、最低0.15rem（0枚でも山があるように見える最低限の厚み）。
// imagePathを渡すと、その画像を背景に敷く（山札/エターナルは常に裏面画像、捨て場は
// 空でなければ一番上のカードの実際の絵柄）。名前・枚数は常時表示のテキストではなく、
// ホバー時のツールチップ（updatePileTooltip参照）でだけ見せるようにしている。
function buildCardStack(count, pileClass, imagePath) {
  const stack = document.createElement("div");
  stack.className = "stack";
  const heightPx = Math.max(2.4, count * 0.6);
  stack.style.setProperty("--stack-height", `${heightPx}px`);

  const top = document.createElement("div");
  top.className = `stack-top ${pileClass}`;
  if (imagePath) {
    top.style.backgroundImage = `url("${imagePath}")`;
  } else {
    // 0枚の時は、CSS側の色付きフォールバック背景（.pile-deck等）を打ち消して透明にする
    // （捨て場が空の時と同じ「中身が無いとわかる」見た目にする。imagePathがnullでも
    // フォールバック背景のせいで満杯の山があるように見えてしまっていたのを修正）。
    top.style.backgroundImage = "none";
    top.style.backgroundColor = "transparent";
  }
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
  eternal: { gridArea: "eternal", pileClass: "pile-eternal", label: "エターナルカード", backImage: "assets/cards/back-eternal.png" },
  first: { gridArea: "first", pileClass: "pile-first", label: "ファーストカード", backImage: "assets/cards/back-first.png" },
  discard: { gridArea: "discard", pileClass: "pile-discard", label: "捨て場" },
};

// 名前・枚数のテキストはゾーン外の別ラベルにも山自体にも常時表示しない。ホバー時のツール
// チップ（getPileTooltipText参照）でだけ見せる。山札・エターナルは常に裏面画像（裏向き積み
// のため中身は明かさない）。捨て場だけはルール上「表向きに積む」場所なので、空でなければ
// 一番上のカードの実際の画像を表示する。
function buildPileZone(pileKey) {
  const config = PILE_CONFIG[pileKey];
  const zone = document.createElement("div");
  zone.className = `zone zone-${config.gridArea} pile-zone`;
  zone.dataset.pile = pileKey;

  const pileArray = getState().piles[pileKey];
  const count = pileArray.length;
  // 0枚の時はどの山も画像なし（透明）にする。捨て場は空でなければ一番上のカードの実物、
  // それ以外（山札・エターナル・ファースト）は裏向き積みのため常に共通の裏面画像。
  let imagePath = null;
  if (count > 0) {
    imagePath = pileKey === "discard" ? getCardImagePath(pileArray[pileArray.length - 1]) : config.backImage;
  }
  const stack = buildCardStack(count, config.pileClass, imagePath);
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
  const skinUrl = `url("${getSkinImagePath(color)}")`;

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

  // 見た目（立方体）とは別に、ホバー/掴む判定のためだけの透明な当たり判定エリアを重ねる。
  // --piece-hitbox-scale（管理者モードで調整可）でサイズだけ独立に拡大縮小できるようにし、
  // 立体の見た目を変えずに「掴みやすさ」を微調整できるようにした。.pieceの子要素なので
  // findDraggableAt/findHoverTargetの.closest(".piece")はそのままここでも正しく機能する。
  const hitbox = document.createElement("div");
  hitbox.className = "piece-hitbox";
  piece.appendChild(hitbox);

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
  // ロックしていても手札効果が使えるカード（ファーストカード・エターナルカード）は、
  // ロックエリア内にある間だけ定期的に目立たせる（普段は「原則ロックしたカードの手札効果は
  // 使えない」ため、この2種類だけが特別だと分かりやすくするため）。演出は管理者モードで
  // 「回る球」（デフォルト）と「斜めに光る帯」を切り替えられる。球の色はそのカード自身の色
  // （cards-data.jsのcolor）に合わせる。以前はロックスロットの色（token.location.index）を
  // 使っていたが、他プレイヤーの効果でスロットとカードの色がズレて置かれる状況もあり得るため、
  // カード自身の色を優先するよう修正した。
  if (token.location.zone === "lock" && (token.cardId.startsWith("first-") || token.cardId.startsWith("eternal-"))) {
    const effect = getUsableLockedEffect();
    card.classList.add("is-usable-while-locked", `effect-${effect}`);
    const cardColor = getCardDefinition(token.cardId).color;
    card.style.setProperty("--usable-locked-color", `var(--color-${cardColor})`);
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

// 指定locationに重なっているカードのうち、一番上（getCardStackGroupsの並び順で最後＝
// 一番最後に動かされたもの）のトークンを返す。無ければnull。
function findTopCardAt(location) {
  if (location.zone !== "cell" && location.zone !== "lock") return null;
  const key =
    location.zone === "cell" ? `cell-${location.row}-${location.col}` : `lock-${location.side}-${location.index}`;
  const group = getCardStackGroups().get(key);
  return group && group.length > 0 ? group[group.length - 1] : null;
}

// 指定locationに駒が1つでもいるか（複数枚重なっていてもtrueを返すだけで十分な用途向け）。
function hasPieceAt(location) {
  if (location.zone !== "cell" && location.zone !== "lock") return false;
  return getState().tokens.some((t) => {
    if (t.kind !== "piece" || t.location.zone !== location.zone) return false;
    return location.zone === "cell"
      ? t.location.row === location.row && t.location.col === location.col
      : t.location.side === location.side && t.location.index === location.index;
  });
}

// 駒がカードの上に乗った瞬間の演出。表向きのカードならそのまま到達モーダルを表示する。
// 裏向きの場合は自動でオープンせず、駒の近くに「オープンする/しない」の選択肢を出し、
// 選んでもらってから（オープンする場合のみ）到達モーダルを表示する。
function maybeTriggerCardArrival(dropTarget, pieceTokenId) {
  if (!dropTarget) return;
  const card = findTopCardAt(dropTarget);
  if (!card) return;
  if (!card.faceUp) {
    promptCardOpen(pieceTokenId, card);
    return;
  }
  showCardArrivalModal(card.cardId);
}

// 「オープンする/しない」の選択アイコン。同時に1つだけ表示する（新しく駒が別のカードに
// 乗ったら、前のプロンプトは消えて新しい方だけになる）。
let openPromptEl = null;

function closeOpenPrompt() {
  if (openPromptEl) {
    openPromptEl.remove();
    openPromptEl = null;
  }
}

function promptCardOpen(pieceTokenId, card) {
  closeOpenPrompt();
  const pieceEl = document.querySelector(`.piece[data-token-id="${pieceTokenId}"]`);
  if (!pieceEl) return;
  const rect = pieceEl.getBoundingClientRect();

  const prompt = document.createElement("div");
  prompt.className = "card-open-prompt";
  prompt.style.left = `${rect.left + rect.width / 2}px`;
  prompt.style.top = `${rect.top}px`;

  const yesBtn = document.createElement("button");
  yesBtn.className = "card-open-prompt-yes";
  yesBtn.textContent = "👁 オープンする";
  yesBtn.addEventListener("click", () => {
    flipToken(card.id);
    playSound("cardFlip");
    closeOpenPrompt();
    render();
    showCardArrivalModal(card.cardId);
  });

  const noBtn = document.createElement("button");
  noBtn.className = "card-open-prompt-no";
  noBtn.textContent = "🚫 オープンしない";
  noBtn.addEventListener("click", () => closeOpenPrompt());

  prompt.appendChild(yesBtn);
  prompt.appendChild(noBtn);
  document.body.appendChild(prompt);
  openPromptEl = prompt;
}

function renderBoardTokens(table) {
  for (const token of getState().tokens) {
    if (token.location.zone !== "cell" && token.location.zone !== "lock") continue;
    const host = findLocationElement(table, token.location);
    if (!host) continue;
    const el = token.kind === "piece" ? buildCubePiece(token.color) : buildFlatCard(token);
    el.dataset.tokenId = token.id;
    // 手番プレイヤーの駒だけを、その駒自身の色でゆっくり柔らかく発光させる
    // （ロックエリア/名前ラベルの手番演出とは別に、盤面上でも手番の駒がすぐ分かるように）。
    // 「自分」に限定していたのは誤りで、B/C/Dのターンでもそれぞれの駒が光る必要がある。
    if (token.kind === "piece" && token.player === getState().turnPlayer) {
      el.classList.add("is-my-turn-glow");
      el.style.setProperty("--piece-turn-glow-color", `var(--color-${token.color})`);
    }
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
  table.appendChild(buildPlayerZone("bottom", "A", true));
  table.appendChild(buildPlayerZone("left", "B", false));
  table.appendChild(buildPlayerZone("top", "C", false));
  table.appendChild(buildPlayerZone("right", "D", false));
  table.appendChild(buildPileZone("deck"));
  table.appendChild(buildPileZone("eternal"));
  table.appendChild(buildPileZone("first"));
  table.appendChild(buildPileZone("discard"));
  renderBoardTokens(table);
  fitTableToViewport();
  updateEndTurnButton();
  updateDrawButton();
  updateHandShuffleButton();
  updateSelfHandStatus();
  checkForVictory();
}

// 画面サイズが変わっても手札などが見切れないよう、テーブル全体をビューポートに収まる
// 倍率へ動的に縮小・拡大する。rem基準の固定サイズレイアウトのままでも、外側のscale
// だけをJSで調整することでウィンドウサイズへの追従を実現する。
function fitTableToViewport() {
  if (boardZoomLevel > 0) {
    applyBoardZoomFit(boardZoomLevel);
    return;
  }
  applyNormalFit();
}

function applyNormalFit() {
  const table = document.getElementById("game-table");
  const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
  // scale()は2軸(X/Y)しか縮小しないため、駒の高さ等のtranslateZ(奥行き)がそのまま残り、
  // 画面を小さくするほど駒が奥行き方向にだけ間延びして見えるバグがあった。
  // scale3d()でZ軸も同じ倍率にすることで、縮小しても駒の縦横比が保たれるようにする。
  table.style.transformOrigin = "";
  table.style.transform = `rotateX(${tilt}) scale3d(1, 1, 1)`;
  const rect = table.getBoundingClientRect();
  const availW = window.innerWidth * 0.94;
  const availH = window.innerHeight * 0.94;
  const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--camera-zoom")) || 1;
  const scale = Math.min(availW / rect.width, availH / rect.height, 1.15) * zoom;
  table.style.transform = `translate(0, var(--camera-offset-y)) rotateX(${tilt}) scale3d(${scale}, ${scale}, ${scale})`;
  currentTableScale = scale;
}

// 「盤面拡大」: プレイヤーA（手前）のロックエリアが画面下端、プレイヤーC（奥）のロックエリアが
// 画面上端にほぼ収まる倍率までズームアップする。scaleは常にtransform-origin（拡大の基準点）
// を中心に働くため、A側ロック〜C側ロックの中間点を基準点に設定してから拡大することで、
// 中間点の画面上の位置を変えずに（＝結果的に上下対称に）その区間全体を引き伸ばせる。
// ボタンは「盤面拡大(level1)」→「もっと拡大(level2)」→「元に戻す(level0)」の3段階トグルで、
// 基準点(A〜C間の中間点)はどちらのレベルでも同じ。倍率・位置の微調整分だけレベルごとに
// 別のCSS変数（--board-zoom-{,2-}margin/offset-x/y）を持たせ、管理者モードから別々に調整できる。
function applyBoardZoomFit(level) {
  const table = document.getElementById("game-table");
  const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
  table.style.transformOrigin = "";
  table.style.transform = `rotateX(${tilt}) scale3d(1, 1, 1)`;

  const lockBottom = document.querySelector(".lock-bottom");
  const lockTop = document.querySelector(".lock-top");
  if (!lockBottom || !lockTop) return;
  const tableRect = table.getBoundingClientRect();
  const bottomRect = lockBottom.getBoundingClientRect();
  const topRect = lockTop.getBoundingClientRect();

  const spanTop = topRect.top;
  const spanBottom = bottomRect.bottom;
  const spanHeight = spanBottom - spanTop;
  const spanMidY = (spanTop + spanBottom) / 2;
  const originYPercent = ((spanMidY - tableRect.top) / tableRect.height) * 100;

  // 理論上はここでちょうど画面いっぱいになるはずだが、手札・アバター等の飛び出しや
  // ブラウザごとのレンダリング誤差で微妙にズレる（手前のロックエリアが見切れる、等）ことが
  // あったため、余白率・XY位置を管理者モードから追加で微調整できるようにした。
  const style = getComputedStyle(document.documentElement);
  const prefix = level === 2 ? "--board-zoom-2-" : "--board-zoom-";
  const marginFrac = parseFloat(style.getPropertyValue(`${prefix}margin`)) || 0.98;
  const offsetX = style.getPropertyValue(`${prefix}offset-x`).trim() || "0rem";
  const offsetY = style.getPropertyValue(`${prefix}offset-y`).trim() || "0rem";
  const zoom = parseFloat(style.getPropertyValue("--camera-zoom")) || 1;

  table.style.transformOrigin = `50% ${originYPercent}%`;
  const scale = ((window.innerHeight * marginFrac) / spanHeight) * zoom;
  // カメラのY軸オフセット(--camera-offset-y)は盤面拡大レベルごとのoffset-x/yとは独立に、
  // 常時一定量を追加でずらす（先に適用することで、拡大時のtranslateOriginや倍率計算には
  // 影響させない）。
  table.style.transform = `translate(0, var(--camera-offset-y)) translate(${offsetX}, ${offsetY}) rotateX(${tilt}) scale3d(${scale}, ${scale}, ${scale})`;
  currentTableScale = scale;
}

// 0=通常, 1=盤面拡大, 2=もっと拡大。ボタンを押すたびに0→1→2→0…と巡回する。
let boardZoomLevel = 0;

// #game-tableに現在適用されているscale3d()の倍率。ドラッグ中のゴースト（3D空間の外＝
// document.body直下に置くため、#game-tableのscale3dの影響を受けない）のサイズをこの値に
// 合わせるために使う（applyNormalFit/applyBoardZoomFitの末尾で更新）。
let currentTableScale = 1;

function cycleBoardZoom() {
  boardZoomLevel = (boardZoomLevel + 1) % 3;
  fitTableToViewport();
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
// ハマりどころ: 以前は要素ごとに「駒？カード？山？」と優先順位付きで1回だけ判定していたが、
// これだと「カードの上に駒が乗っている」時、そのカードのDOM要素がたまたま駒より後で描画されて
// 手前に来ていると（同じマス内で描画順が後になっただけの理由で）、elementsFromPointの並びで
// カードの方が駒より先に出てきてしまい、本来最優先のはずの駒より先にカードとして判定・確定
// してしまうことがあった（駒の当たり判定を追加した後、駒の「下の方」だけ掴めなくなる、
// という形で発覚）。優先順位（駒＞盤面カード＞手札カード＞山）を「要素ごと」ではなく
// 「種類ごと」に全要素を舐めてから確定するように直し、描画順に関係なく常に駒を最優先で
// 拾えるようにした。
function findDraggableAt(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const piece = el.closest(".piece");
    if (piece) return { el: piece, tokenId: piece.dataset.tokenId, kind: "piece" };
  }
  for (const el of elements) {
    // 盤面マス／ロックスロットに直接置かれたカードは、手札のカードと違ってダブルクリックで
    // 表裏を反転できる対象なので区別しておく(isBoardCard)。
    const boardCard = el.closest(".board-card");
    if (boardCard) return { el: boardCard, tokenId: boardCard.dataset.tokenId, kind: "card", isBoardCard: true };
  }
  for (const el of elements) {
    const handCard = el.closest(".hand-card");
    if (handCard) return { el: handCard, tokenId: handCard.dataset.tokenId, kind: "card" };
  }
  for (const el of elements) {
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
  // findDraggableAtと同じ理由（描画順に関係なく優先順位を種類ごとに確定させるため）で
  // 二段階に分けている。
  for (const el of elements) {
    // 「+N」バッジ（重なりカードの一覧表示）は一番手前にあるので最優先で判定する。
    const badge = el.closest(".stack-badge");
    if (badge) return badge;
  }
  for (const el of elements) {
    const piece = el.closest(".piece");
    if (piece) return piece;
  }
  for (const el of elements) {
    const boardCard = el.closest(".board-card");
    if (boardCard) return boardCard;
  }
  for (const el of elements) {
    const handCard = el.closest(".hand-card");
    if (handCard) return handCard;
  }
  for (const el of elements) {
    const stack = el.closest(".stack[data-pile]");
    if (stack) return stack;
  }
  for (const el of elements) {
    const cell = el.closest(".cell");
    if (cell) return cell;
  }
  for (const el of elements) {
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
// 「+N」バッジは一番上のカードそのものとして扱う。
function getVisibleCardId(el) {
  if (el.classList.contains("stack-badge")) {
    const ids = el.dataset.stackTokens.split(",");
    const topToken = getState().tokens.find((t) => t.id === ids[ids.length - 1]);
    return topToken && topToken.faceUp ? topToken.cardId : null;
  }
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

// 山（山札・エターナル・ファースト・捨て場）にカーソルを乗せた時に見せる「名前 N枚」の
// 小さなテキスト。常時表示だったラベル・枚数をやめた代わりに、ホバー時だけ見えるようにする。
function getPileTooltipText(el) {
  if (!el.matches(".stack[data-pile]")) return null;
  const pileKey = el.dataset.pile;
  const config = PILE_CONFIG[pileKey];
  const pileArray = getState().piles[pileKey];
  const count = pileArray.length;
  let label = config.label;
  if (pileKey === "discard" && count > 0) {
    label = getCardDefinition(pileArray[pileArray.length - 1]).name;
  }
  return `${label}　${count}枚`;
}

// 相手（自分以外）の手札にカーソルを合わせた時、中身は明かさず枚数だけを教える
// （手札の中身自体は非公開情報のため、getVisibleCardId等と同じ考え方で自分の手札は除外する）。
function getHandTooltipText(el) {
  if (!el.classList.contains("hand-card") || el.classList.contains("is-self")) return null;
  const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
  if (!token) return null;
  const player = token.location.player;
  const count = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player
  ).length;
  return `${getPlayerName(player)}　手札${count}枚`;
}

let pileTooltipEl = null;
function getPileTooltipEl() {
  if (!pileTooltipEl) {
    pileTooltipEl = document.createElement("div");
    pileTooltipEl.id = "pile-tooltip";
    document.body.appendChild(pileTooltipEl);
  }
  return pileTooltipEl;
}

function updatePileTooltip(el, clientX, clientY) {
  const tooltip = getPileTooltipEl();
  const text = el ? getPileTooltipText(el) || getHandTooltipText(el) : null;
  if (!text) {
    tooltip.style.display = "none";
    return;
  }
  tooltip.textContent = text;
  tooltip.style.left = `${clientX + 16}px`;
  tooltip.style.top = `${clientY + 16}px`;
  tooltip.style.display = "block";
}

// #card-previewの位置決め。拡大の起点は左下端（＝カーソル付近）に固定し、そこから右上方向へ
// 広がるようにする。left/bottom（topではなく）で位置決めしているのがポイント：
// --card-preview-size（管理者モードで調整可能）を変えてもleft/bottomの基準点自体はズレず、
// 大きさだけが変わる。画面右端・上端をはみ出す場合だけ、表示方向を反転する
// （盤面奥のカードをホバーすると上端で見切れる、という報告への対応）。
function positionPreviewPanel(panel, clientX, clientY) {
  const offset = 20;
  const cs = getComputedStyle(panel);
  const panelWidthPx = parseFloat(cs.width);
  const panelHeightPx = parseFloat(cs.height);

  let left = clientX + offset;
  if (left + panelWidthPx > window.innerWidth) left = clientX - offset - panelWidthPx;
  panel.style.left = `${left}px`;

  if (clientY - offset - panelHeightPx < 0) {
    // 上方向に広げると画面上端をはみ出す→カーソルの下方向に広げる
    panel.style.top = `${clientY + offset}px`;
    panel.style.bottom = "";
  } else {
    panel.style.bottom = `${window.innerHeight - clientY + offset}px`;
    panel.style.top = "";
  }
}

function updatePreview(el, clientX, clientY) {
  const preview = getPreviewEl();
  updatePileTooltip(el, clientX, clientY);

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
  const backdrop = document.createElement("div");
  backdrop.id = "card-note-modal-backdrop";
  const modal = document.createElement("div");
  modal.id = "card-note-modal";
  const img = document.createElement("img");
  img.className = "card-note-image";
  img.src = getCardImagePath(cardId);
  img.alt = def.name;
  const textCol = document.createElement("div");
  textCol.className = "card-note-text-col";
  const title = document.createElement("div");
  title.className = "card-note-title";
  title.textContent = def.name;
  const body = document.createElement("div");
  body.className = "card-note-body";
  body.textContent = def.note || "（補足なし）";
  textCol.appendChild(title);
  textCol.appendChild(body);
  const content = document.createElement("div");
  content.className = "card-note-content";
  content.appendChild(img);
  content.appendChild(textCol);
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close-x";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "閉じる");
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  modal.appendChild(closeBtn);
  modal.appendChild(content);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// 重なっているカードを一覧表示する、ホバーではなく常時表示・要クローズのモーダル
// （ホバー式の一覧は「何枚も重なっていると表示が難しい」との理由で廃止し、これに置き換えた）。
// 各カードは自分自身のfaceUpに従って表向き/裏向きの画像を出す（下に潜む裏向きカードの
// 中身を一覧表示によって覗けてしまわないようにするため）。下から上への重なり順で表示する。
function showStackModal(tokenIds) {
  const tokens = tokenIds.map((id) => getState().tokens.find((t) => t.id === id)).filter(Boolean);
  const modal = document.createElement("div");
  modal.id = "stack-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });
  const title = document.createElement("div");
  title.className = "stack-modal-title";
  title.textContent = `重なっているカード（${tokens.length}枚・下から上の順）`;
  const list = document.createElement("div");
  list.className = "stack-modal-list";
  for (const token of tokens) {
    const card = document.createElement("div");
    card.className = "stack-modal-card";
    const imagePath = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
    card.style.backgroundImage = `url("${imagePath}")`;
    list.appendChild(card);
  }
  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(list);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// 右クリックされた要素(.board-cardまたは.stack-badge)が2枚以上重なっているマス/ロックスロットの
// 一部なら、そのグループの全トークンidを下から上の順で返す（重なっていなければnull）。
function getStackTokensAt(el) {
  if (el.classList.contains("stack-badge")) {
    return el.dataset.stackTokens.split(",");
  }
  if (el.classList.contains("board-card")) {
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    if (!token) return null;
    for (const tokens of getCardStackGroups().values()) {
      if (tokens.length >= 2 && tokens.some((t) => t.id === token.id)) {
        return tokens.map((t) => t.id);
      }
    }
  }
  return null;
}

function showContextMenu(clientX, clientY, items) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.id = "card-context-menu";
  for (const { label, onClick } of items) {
    const item = document.createElement("button");
    item.textContent = label;
    item.addEventListener("click", () => {
      closeContextMenu();
      onClick();
    });
    menu.appendChild(item);
  }
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
    const stackTokenIds = hit ? getStackTokensAt(hit) : null;
    if (!cardId && !stackTokenIds) {
      closeContextMenu();
      return;
    }
    const items = [];
    if (cardId) {
      items.push({ label: "カード補足を見る", onClick: () => showCardNoteModal(cardId) });
    }
    if (stackTokenIds) {
      items.push({ label: "重なっているカードを見る", onClick: () => showStackModal(stackTokenIds) });
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
  document.addEventListener("pointerdown", (e) => {
    if (contextMenuEl && !contextMenuEl.contains(e.target)) closeContextMenu();
    if (openPromptEl && !openPromptEl.contains(e.target)) closeOpenPrompt();
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
        // オープンする前のカードを見ておく。「駒がすでに乗っている裏向きカードを手動で
        // オープンした」場合も、その瞬間に初めて表向きカードの上に駒がいる状態になるため、
        // 到達モーダルの対象にする（表向き→裏向きに戻す方向の時は対象外）。
        const cardToken = getState().tokens.find((t) => t.id === hit.tokenId);
        flipToken(hit.tokenId);
        playSound("cardFlip");
        if (cardToken && !cardToken.faceUp && hasPieceAt(cardToken.location)) {
          showCardArrivalModal(cardToken.cardId);
        }
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
  // ハマりどころ: ゴーストは3D空間の外(document.body直下)に置いているため、盤面拡大時に
  // #game-tableへ適用されるscale3d()の影響を受けず、拡大した盤面上の駒/カードに対して
  // ゴーストだけ小さいまま（相対的に「すごく小っちゃい」）に見えるバグがあった。
  // translate(-50%,-50%)の後にscale3d()を続けることで、カーソル位置を中心にしたまま
  // 盤面と同じ倍率で見た目のサイズだけを合わせる（percentageのtranslateは変形前の
  // レイアウトサイズが基準のため、この順序でも位置がズレない）。
  ghost.style.transform = `translate(${clientX}px, ${clientY}px) translate(-50%, -50%) scale3d(${currentTableScale}, ${currentTableScale}, ${currentTableScale})`;
}

function startTokenDrag(e, tokenId, kind, sourceEl) {
  const ghost = createGhost(kind, tokenId);
  positionGhost(ghost, e.clientX, e.clientY);
  // ドラッグ中は元の場所の実体を隠す（ゴーストと二重に見えたり、掴んでいるはずのカードが
  // 手札に残ったまま見えたりしないようにするため）。dropの成否にかかわらず必ずrender()で
  // DOMが作り直されるので、明示的に元に戻す処理は不要。
  sourceEl.style.visibility = "hidden";
  // 自分・相手を問わず、手札のカードを掴んだ瞬間に「抜き取る」効果音を鳴らす。
  const draggedToken = getState().tokens.find((t) => t.id === tokenId);
  if (draggedToken && draggedToken.kind === "card" && draggedToken.location.zone === "hand") {
    playSound("cardDraw");
  }
  dragSession = { tokenId, kind, ghost, pileSource: null, highlightEl: null };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  updateDropHighlight(e.clientX, e.clientY);
}

function startPileDrag(e, pileKey) {
  const pileArray = getState().piles[pileKey];
  if (pileArray.length === 0) {
    // 「1枚ドロー」ボタンはensureDeckAvailable()経由で山札切れ時に補充確認モーダルを出すが、
    // 山札を直接ドラッグして引こうとした時はこのガードで即座に抜けるだけで、モーダルが
    // 一切出ないまま「掴んでも何も起きない」だけの挙動になっていた（ユーザー報告のバグ）。
    // 山札(deck)が対象の時だけ、ここでも同じ補充確認を出す（捨て場も空なら何もしない）。
    if (pileKey === "deck") ensureDeckAvailable(() => {});
    return;
  }
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
  // 山札から掴んだ瞬間にも「抜き取る」効果音を鳴らす（捨て場・エターナル等からは対象外）。
  if (pileKey === "deck") playSound("cardDraw");
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

// カードが新しくロックエリアに入った瞬間だけ「ロックした」トーストを出す
// （wasAlreadyLocked=trueならロックエリア内で位置を動かしただけなので対象外）。
// 白黒（無色）カードをロックエリアへ「置く」ことはルール上ロックしたことにはならない
// （docs/cards.mdの黒カード補足参照）ため、その2色は除外する。
function maybeAnnounceLock(dropTarget, cardId, wasAlreadyLocked) {
  if (!dropTarget || dropTarget.zone !== "lock" || wasAlreadyLocked) return;
  const def = getCardDefinition(cardId);
  if (!def || def.color === "white" || def.color === "black") return;
  const player = SIDE_TO_SEAT[dropTarget.side];
  announceCardLocked(player, cardId);
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
    if (dropTarget && dropTarget.zone !== "pile") {
      // drawFromPile()が山の中身を書き換えてしまう前に、一番上のカードを確認しておく
      // （捨て場からの取得は元々表向きに積まれている＝公開情報、山札/エターナル/ファーストは
      // 裏向き積み＝非公開情報として扱う）。
      const pileArray = getState().piles[pileSource];
      const cardId = pileArray.length > 0 ? pileArray[pileArray.length - 1] : null;
      if (dropTarget.zone === "hand") {
        if (cardId) {
          const player = dropTarget.player;
          drawFromPile(pileSource, dropTarget);
          announceHandPickups(player, [{ cardId, wasPublic: pileSource === "discard" }]);
          render();
          return;
        }
      } else {
        drawFromPile(pileSource, dropTarget);
        if (cardId) {
          maybeAnnounceLock(dropTarget, cardId, false);
          playSound("cardPlace");
        }
      }
    }
    render(); // 引けた場合も引けなかった場合も、必ず再描画する（drawFromPile後にrenderし忘れると
    // 状態は更新済みなのに画面に反映されず、次に別の操作でrender()が走った時にまとめて
    // 反映されたように見えるバグになる。これが実際に起きていたので、必ずここで呼ぶ）。
    return;
  }

  if (!dropTarget) {
    render();
    return;
  }
  if (dropTarget.zone === "pile") {
    sendTokenToPile(tokenId, dropTarget.pile);
  } else {
    // 手札に「新しく」加わる時（今までは手札に無かった、または別プレイヤーの手札から移ってきた
    // 時）だけ、何を得たか知らせるポップアップを出す。同じ手札の中で位置を動かしただけの時は
    // 対象外。
    if (dropTarget.zone === "hand") {
      const token = getState().tokens.find((t) => t.id === tokenId);
      const alreadyInThisHand = token && token.location.zone === "hand" && token.location.player === dropTarget.player;
      if (token && !alreadyInThisHand) {
        const wasPublic = token.location.zone === "cell" || token.location.zone === "lock" ? token.faceUp : false;
        moveToken(tokenId, dropTarget);
        announceHandPickups(dropTarget.player, [{ cardId: token.cardId, wasPublic }]);
        render();
        return;
      }
    }
    const token = getState().tokens.find((t) => t.id === tokenId);
    const wasAlreadyLocked = !!token && token.location.zone === "lock";
    moveToken(tokenId, dropTarget);
    if (token) maybeAnnounceLock(dropTarget, token.cardId, wasAlreadyLocked);
    if (kind === "card") playSound("cardPlace");
    render();
    // 到達プロンプト/モーダルの位置決めに駒の実際のDOM座標(getBoundingClientRect)を使うため、
    // render()で盤面を描き直した後でなければ呼べない。
    if (kind === "piece") maybeTriggerCardArrival(dropTarget, tokenId);
    return;
  }
  render();
}

// --- ターンを次のプレイヤーへ渡すボタン ---------------------------------------------
// セットアップウィザードの手順3でスタートプレイヤーが決まって初めて意味を持つ操作なので、
// state.turnPlayerがまだnullの間は非表示にする。プレイヤー自身が操作するボタンなので、
// 管理者モード等の開発者向けツール（左上/右上）とは離し、画面右下に置く。
let endTurnButtonEl = null;

function buildEndTurnButton() {
  const btn = document.createElement("button");
  btn.id = "end-turn-button";
  btn.addEventListener("click", () => {
    // 侵攻条件を満たしている参加プレイヤーが誰もいなければrunGateInvasionsIfNeededは
    // 即座にdone()を呼ぶだけなので、普段のターン終了と体感は変わらない。満たしていれば
    // （手番プレイヤー本人とは限らない。効果等で自分のターンでなくても相手ゲートに
    // 駒がいることはあり得るため、手番プレイヤーに限らず全参加プレイヤーを対象にする）
    // ボーナス処理の3つのポップアップが終わってから初めてnextTurn()が呼ばれる。
    runGateInvasionsIfNeeded(() => {
      nextTurn();
      render();
    });
  });
  document.body.appendChild(btn);
  return btn;
}

function updateEndTurnButton() {
  if (!endTurnButtonEl) return;
  const turnPlayer = getState().turnPlayer;
  if (!turnPlayer) {
    endTurnButtonEl.style.display = "none";
    return;
  }
  endTurnButtonEl.style.display = "block";
  endTurnButtonEl.textContent = `${getPlayerName(turnPlayer)}のターンを終了 →`;
}

// OKボタン1つだけのシンプルな確認モーダル（山札切れの補充確認に使う）。ゲームの状態に
// 関わる必須の確認のため、✕ボタンや外側クリックでは閉じられないようにしてある
// （他のパネル/モーダルの「✕＋外クリックで閉じる」統一ルールの、意図的な例外）。
function showConfirmModal(title, text, onOk) {
  const modal = document.createElement("div");
  modal.id = "confirm-modal";
  const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10001 });
  const titleEl = document.createElement("div");
  titleEl.className = "confirm-modal-title";
  titleEl.textContent = title;
  const bodyEl = document.createElement("div");
  bodyEl.className = "confirm-modal-body";
  bodyEl.textContent = text;
  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";
  okBtn.className = "confirm-modal-ok";
  okBtn.addEventListener("click", () => {
    backdrop.remove();
    modal.remove();
    onOk();
  });
  modal.appendChild(titleEl);
  modal.appendChild(bodyEl);
  modal.appendChild(okBtn);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// 山札が空の状態で引こうとした時のルール（docs/rulebook.md「こんな時は」）:
// 「捨て場のカードをそのまま裏向きにして山札とする。シャッフルはしない。」
// 山札に残りがあれば何もせずすぐにonReady()を呼ぶ。空でも捨て場が空ならこれ以上引ける
// カードが無いので、確認モーダルを出さずそのままonReady()を呼ぶ（drawFromPile側が
// 空振りするだけで安全なため）。
function ensureDeckAvailable(onReady) {
  const state = getState();
  if (state.piles.deck.length > 0 || state.piles.discard.length === 0) {
    onReady();
    return;
  }
  showConfirmModal(
    "山札が空になりました",
    "捨て場のカードをノーシャッフルで山札にします。",
    () => {
      refillDeckFromDiscard();
      render();
      onReady();
    }
  );
}

// --- 「盤面拡大」ボタン ----------------------------------------------------------
// 押すたびに 盤面拡大 → もっと拡大 → 元に戻す、と3段階を巡回する。
// state.turnPlayerの有無に関係なく常に使える表示上の機能なので、非表示にする条件は無い。
const BOARD_ZOOM_LABELS = ["🔍 盤面拡大", "🔍 もっと拡大", "🔍 元に戻す"];

function buildBoardZoomButton() {
  const btn = document.createElement("button");
  btn.id = "board-zoom-button";
  btn.textContent = BOARD_ZOOM_LABELS[0];
  btn.addEventListener("click", () => {
    cycleBoardZoom();
    btn.classList.toggle("is-active", boardZoomLevel > 0);
    btn.classList.toggle("is-zoom-2", boardZoomLevel === 2);
    btn.textContent = BOARD_ZOOM_LABELS[boardZoomLevel];
  });
  document.body.appendChild(btn);
  return btn;
}

// --- 「手札シャッフル」ボタン ------------------------------------------------------
// 自分(A)の手札の並び順をシャッフルする（カードの中身自体は変わらない、見た目上の
// 並び替え演出）。turnPlayerの有無に関係なく常に使える表示上の機能なので、非表示にする
// 条件は無いが、手札が0〜1枚（シャッフルしても見た目が変わらない）の間は押せなくする。
let handShuffleButtonEl = null;

function buildHandShuffleButton() {
  const btn = document.createElement("button");
  btn.id = "hand-shuffle-button";
  btn.textContent = "🔀 手札シャッフル";
  btn.addEventListener("click", () => {
    shuffleHand("A");
    playSound("handShuffle");
    render();
  });
  document.body.appendChild(btn);
  return btn;
}

function updateHandShuffleButton() {
  if (!handShuffleButtonEl) return;
  const handCount = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === "A"
  ).length;
  handShuffleButtonEl.disabled = handCount < 2;
}

// --- ゲームタイトル表示 -----------------------------------------------------------
// 画面左上（以前は「⚙ 管理者モード」ボタンがあった場所。オプションメニューに統合して
// 空いたスペースにタイトルを表示する）。
function buildGameTitle() {
  const el = document.createElement("div");
  el.id = "game-title";
  el.textContent = "7 SHADES OF S:EVEN remake";
  document.body.appendChild(el);
  return el;
}

// --- 「1枚ドロー」ボタン ---------------------------------------------------------
// 手番プレイヤーが山札から1枚引いて自分の手札に加える、簡易操作用のショートカット。
// 「ターンを次のプレイヤーへ渡す」ボタンと同じ理由で、state.turnPlayerがまだnullの間は
// 非表示にする。
let drawButtonEl = null;

function buildDrawButton() {
  const btn = document.createElement("button");
  btn.id = "draw-button";
  btn.textContent = "1枚ドロー";
  btn.addEventListener("click", () => {
    const player = getState().turnPlayer;
    if (!player) return;
    ensureDeckAvailable(() => {
      const pileArray = getState().piles.deck;
      if (pileArray.length === 0) return; // 捨て場も空で、これ以上引けるカードが無い
      const cardId = pileArray[pileArray.length - 1];
      drawFromPile("deck", { zone: "hand", player });
      playSound("cardDraw");
      announceHandPickups(player, [{ cardId, wasPublic: false }]);
      render();
    });
  });
  document.body.appendChild(btn);
  return btn;
}

function updateDrawButton() {
  if (!drawButtonEl) return;
  drawButtonEl.style.display = getState().turnPlayer ? "block" : "none";
}

// --- 自分専用ステータス（手札枚数・名前・アバター） --------------------------------
// 他のプレイヤーには見せない、自分専用の常時表示ステータス。手札は扇状に表示されると
// 重なって数えづらいため、画面の隅に「今何枚持っているか」を数字で出しておく。
// あわせて自分の名前・アバターもここから変更できるようにする（変更内容は盤面のラベルや
// 各種ポップアップの表記にもそのまま反映される。player-identity.js参照）。
let selfHandStatusEl = null;
let selfStatusNameEl = null;
let selfStatusAvatarEl = null;
let selfStatusPieceThumbEl = null;
let selfStatusHandCountEl = null;

function openAvatarPicker() {
  const modal = document.createElement("div");
  modal.id = "avatar-picker-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "avatar-picker-modal-title";
  title.textContent = "アバターを選択";

  const grid = document.createElement("div");
  grid.className = "avatar-picker-modal-grid";
  for (const avatar of AVATAR_OPTIONS) {
    const swatch = document.createElement("button");
    swatch.className = "avatar-picker-swatch";
    if (getPlayerAvatar("A") === avatar) swatch.classList.add("is-selected");
    swatch.textContent = avatar;
    swatch.addEventListener("click", () => {
      setPlayerAvatar("A", avatar);
      render();
      close();
    });
    grid.appendChild(swatch);
  }

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(grid);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

function startEditingName() {
  const input = document.createElement("input");
  input.className = "self-status-name-input";
  input.value = getPlayerName("A");
  input.maxLength = 12;
  const commit = () => {
    if (input.value.trim()) setPlayerName("A", input.value);
    render();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = getPlayerName("A");
      input.blur();
    }
  });
  selfStatusNameEl.replaceWith(input);
  input.focus();
  input.select();
}

function buildSelfHandStatus() {
  const el = document.createElement("div");
  el.id = "self-hand-status";

  selfStatusAvatarEl = document.createElement("button");
  selfStatusAvatarEl.className = "self-status-avatar";
  selfStatusAvatarEl.title = "クリックしてアバターを変更";
  selfStatusAvatarEl.addEventListener("click", openAvatarPicker);

  // 駒スキンの選択もここに集約する（以前は別の独立したボタンだった）。実際の駒と同じ
  // buildCubePiece()をそのまま使い、立体のまま小さく表示する（ドラッグ中のゴーストと同じ
  // 「perspective+盤面と同じ傾きを持つ入れ子」のテクニックで、3D空間の外でも立方体に見せる）。
  selfStatusPieceThumbEl = document.createElement("button");
  selfStatusPieceThumbEl.className = "self-status-piece-thumb";
  selfStatusPieceThumbEl.title = "クリックして駒スキンを変更";
  selfStatusPieceThumbEl.addEventListener("click", openPieceSkinPicker);

  const info = document.createElement("div");
  info.className = "self-status-info";

  selfStatusNameEl = document.createElement("div");
  selfStatusNameEl.className = "self-status-name";
  selfStatusNameEl.title = "クリックして名前を変更";
  selfStatusNameEl.addEventListener("click", startEditingName);

  selfStatusHandCountEl = document.createElement("div");
  selfStatusHandCountEl.className = "self-status-hand-count";

  info.appendChild(selfStatusNameEl);
  info.appendChild(selfStatusHandCountEl);
  el.appendChild(selfStatusAvatarEl);
  el.appendChild(selfStatusPieceThumbEl);
  el.appendChild(info);
  document.body.appendChild(el);
  return el;
}

function updateSelfHandStatus() {
  if (!selfHandStatusEl) return;
  const count = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === "A"
  ).length;
  selfStatusAvatarEl.textContent = getPlayerAvatar("A");

  const myColor = getMyPieceColor();
  selfStatusPieceThumbEl.style.display = myColor ? "flex" : "none";
  if (myColor) {
    selfStatusPieceThumbEl.innerHTML = "";
    const inner = document.createElement("div");
    inner.className = "self-status-piece-thumb-inner";
    const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
    inner.style.transform = `rotateX(${tilt})`;
    inner.appendChild(buildCubePiece(myColor));
    selfStatusPieceThumbEl.appendChild(inner);
  }

  // startEditingName()が.self-status-nameを一時的に<input>へ差し替えるため、render()の
  // たびに毎回ここで作り直す（差し替え後の入力欄はrender()時点で既にblur済みのはず）。
  if (!selfStatusNameEl.isConnected) {
    const fresh = document.createElement("div");
    fresh.className = "self-status-name";
    fresh.title = "クリックして名前を変更";
    fresh.addEventListener("click", startEditingName);
    selfHandStatusEl.querySelector(".self-status-name-input")?.replaceWith(fresh);
    selfStatusNameEl = fresh;
  }
  selfStatusNameEl.textContent = getPlayerName("A");
  selfStatusHandCountEl.textContent = `手札：${count}枚`;
}

// 管理者モードのスライダーには、CSS変数を変えるだけでは反映されない値（--hand-*-sizeなど、
// JS側でgetComputedStyleして読み取り、inline styleとして適用しているもの）があるため、
// 変更のたびに再描画してもらう。
window.addEventListener("admin:change", render);

endTurnButtonEl = buildEndTurnButton();
drawButtonEl = buildDrawButton();
selfHandStatusEl = buildSelfHandStatus();
buildBoardZoomButton();
handShuffleButtonEl = buildHandShuffleButton();
render();
initDragHandlers();
initHoverHandlers();
initContextMenuHandlers();
initAdminMode();
initDeckViewer();
initGameSetup();
initOptionsMenu();
initPlayerButtons();
initQuickStart();
buildGameTitle();
