// マイデッキ一覧（複数デッキ、MTGAのデッキ箱一覧風。ユーザー要望2026-08-11）。
// ホームの「🃏 マイデッキ編成」から開く入口。デッキ箱が並び、クリックで編集、「＋」で新規作成、
// 各箱の複製/削除ができる。編集は my-deck-builder.js（1デッキを編集）を開く。

import { syncFullScreenPageActive } from "./option-area.js";
import { getCardImagePath } from "./cards-data.js";
import { getAllDecks, createDeck, deleteDeck, duplicateDeck, validateDeck, deckTotal } from "./my-deck.js";
import { openMyDeckBuilder } from "./my-deck-builder.js";

// デッキ箱のアクセント色（ファーストカードの色）。
const MDL_COLOR_HEX = {
  red: "#c70025",
  orange: "#ee781f",
  yellow: "#fabe00",
  green: "#22ac38",
  blue: "#1bb8ce",
  pink: "#f19ec2",
  purple: "#915da3",
};

let overlayEl = null;
let gridEl = null;
let onCloseCb = null;

// デッキの代表カード（枚数が最多、同数なら並び順が先）のcardId。空なら null。
function representativeCardId(deck) {
  let best = null;
  let bestCount = 0;
  for (const [cardId, count] of Object.entries(deck.cards || {})) {
    if (count > bestCount) {
      best = cardId;
      bestCount = count;
    }
  }
  return best;
}

function buildDeckBox(deck) {
  const box = document.createElement("div");
  box.className = "mdl-deck";
  if (deck.firstColor) box.dataset.color = deck.firstColor;

  const art = document.createElement("div");
  art.className = "mdl-deck-art";
  const rep = representativeCardId(deck);
  if (rep) {
    const img = document.createElement("img");
    img.src = getCardImagePath(rep);
    img.alt = "";
    img.loading = "lazy";
    art.appendChild(img);
  }
  const accent = deck.firstColor ? MDL_COLOR_HEX[deck.firstColor] : "#64748b";
  art.style.setProperty("--mdl-accent", accent);
  box.appendChild(art);

  const nameRow = document.createElement("div");
  nameRow.className = "mdl-deck-name";
  nameRow.textContent = deck.name || "マイデッキ";
  box.appendChild(nameRow);

  const meta = document.createElement("div");
  meta.className = "mdl-deck-meta";
  const total = deckTotal(deck.cards);
  const valid = validateDeck(deck.cards).ok;
  const colorChip = deck.firstColor
    ? `<span class="mdl-deck-chip" style="background:${MDL_COLOR_HEX[deck.firstColor]}"></span>`
    : "";
  meta.innerHTML =
    `${colorChip}<span class="mdl-deck-count">${total}枚</span>` +
    `<span class="mdl-deck-valid ${valid ? "is-ok" : "is-ng"}">${valid ? "✓" : "未完成"}</span>`;
  box.appendChild(meta);

  // 箱クリックで編集。
  box.addEventListener("click", () => editDeck(deck.id));

  // 複製・削除（箱の隅の小ボタン。クリックは箱の編集へ伝播させない）。
  const actions = document.createElement("div");
  actions.className = "mdl-deck-actions";
  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.className = "mdl-deck-action";
  dupBtn.title = "複製";
  dupBtn.textContent = "⧉";
  dupBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    duplicateDeck(deck.id);
    renderGrid();
  });
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "mdl-deck-action mdl-deck-action-del";
  delBtn.title = "削除";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`「${deck.name || "マイデッキ"}」を削除しますか？`)) {
      deleteDeck(deck.id);
      renderGrid();
    }
  });
  actions.append(dupBtn, delBtn);
  box.appendChild(actions);

  return box;
}

function buildNewBox() {
  const box = document.createElement("button");
  box.type = "button";
  box.className = "mdl-deck mdl-deck-new";
  box.setAttribute("aria-label", "新しいデッキを作成");
  const plus = document.createElement("div");
  plus.className = "mdl-deck-new-plus";
  plus.textContent = "＋";
  box.appendChild(plus);
  const label = document.createElement("div");
  label.className = "mdl-deck-new-label";
  label.textContent = "新しいデッキ";
  box.appendChild(label);
  box.addEventListener("click", () => {
    const deck = createDeck("新しいデッキ");
    editDeck(deck.id);
  });
  return box;
}

function renderGrid() {
  if (!gridEl) return;
  gridEl.innerHTML = "";
  gridEl.appendChild(buildNewBox());
  for (const deck of getAllDecks()) gridEl.appendChild(buildDeckBox(deck));
}

// 編集画面へ（一覧を閉じ、戻る時に一覧を開き直す）。
function editDeck(deckId) {
  const cb = onCloseCb;
  closeMyDeckList();
  openMyDeckBuilder(deckId, () => openMyDeckList(cb));
}

export function openMyDeckList(onClose) {
  if (overlayEl) return;
  onCloseCb = onClose;

  overlayEl = document.createElement("div");
  overlayEl.id = "my-deck-list-page";

  const header = document.createElement("div");
  header.id = "mdl-header";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "mdl-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeMyDeckList();
    onClose?.();
  });
  header.appendChild(backBtn);
  const title = document.createElement("div");
  title.id = "mdl-title";
  title.textContent = "🃏 マイデッキ";
  header.appendChild(title);
  overlayEl.appendChild(header);

  gridEl = document.createElement("div");
  gridEl.id = "mdl-grid";
  overlayEl.appendChild(gridEl);

  document.body.appendChild(overlayEl);
  syncFullScreenPageActive();
  renderGrid();
}

export function closeMyDeckList() {
  overlayEl?.remove();
  overlayEl = null;
  gridEl = null;
}
