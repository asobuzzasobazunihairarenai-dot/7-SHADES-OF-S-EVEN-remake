// マイデッキ編成の画面全体ページ（ranking-page.js/profile-page.jsと同じ「モーダルではない
// フルスクリーンページ」構造）。所持している通常カードを並べ、＋/−で枚数を増減してデッキを
// 組む。ルール違反（7枚未満・同名/所持超過・スペシャルの3:1税）はフッターにリアルタイム表示し、
// 満たしていない間は保存できない。保存先はmy-deck.js（フェーズ1はlocalStorage、後でアカウント同期）。

import { getCardImagePath } from "./cards-data.js";
import { syncFullScreenPageActive } from "./option-area.js";
import {
  getDeckableCards,
  getOwnedCount,
  maxCopiesFor,
  isSpecialDeckCard,
  validateDeck,
  getMyDeck,
  saveMyDeck,
  MIN_DECK_SIZE,
  SPECIAL_TAX_RATIO,
} from "./my-deck.js";

let overlayEl = null;
let gridEl = null;
let summaryEl = null;
let saveBtn = null;
let toastTimer = null;
// 編集中のデッキ（{ [cardId]: count }）。開いた時点でのgetMyDeck()のコピーを編集し、保存で確定。
let workingDeck = {};

function countOf(cardId) {
  return Number(workingDeck[cardId]) || 0;
}

function setCount(cardId, next) {
  const clamped = Math.max(0, Math.min(next, maxCopiesFor(cardId)));
  if (clamped <= 0) delete workingDeck[cardId];
  else workingDeck[cardId] = clamped;
}

function showToast(msg) {
  if (!overlayEl) return;
  let toast = overlayEl.querySelector("#my-deck-page-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "my-deck-page-toast";
    overlayEl.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast?.classList.remove("is-visible"), 2200);
}

function buildCardTile(card) {
  const tile = document.createElement("div");
  tile.className = "my-deck-card";
  tile.dataset.cardId = card.id;
  if (isSpecialDeckCard(card.id)) tile.classList.add("is-special");

  const imgWrap = document.createElement("div");
  imgWrap.className = "my-deck-card-img-wrap";
  const img = document.createElement("img");
  img.className = "my-deck-card-img";
  img.src = getCardImagePath(card.id);
  img.alt = card.name;
  img.loading = "lazy";
  imgWrap.appendChild(img);

  // スペシャルカードは3:1税の対象であることが一目で分かるようバッジを付ける。
  if (isSpecialDeckCard(card.id)) {
    const badge = document.createElement("span");
    badge.className = "my-deck-card-special-badge";
    badge.textContent = "SP";
    badge.title = "スペシャルカード（1枚につき非スペシャルの通常カードが3枚必要）";
    imgWrap.appendChild(badge);
  }
  // 現在の投入枚数（0なら非表示）を画像の隅に重ねる。
  const countBadge = document.createElement("span");
  countBadge.className = "my-deck-card-count-badge";
  imgWrap.appendChild(countBadge);

  tile.appendChild(imgWrap);

  const name = document.createElement("div");
  name.className = "my-deck-card-name";
  name.textContent = card.name;
  tile.appendChild(name);

  const owned = document.createElement("div");
  owned.className = "my-deck-card-owned";
  owned.textContent = `所持 ${getOwnedCount(card.id)}`;
  tile.appendChild(owned);

  const controls = document.createElement("div");
  controls.className = "my-deck-card-controls";

  const minus = document.createElement("button");
  minus.type = "button";
  minus.className = "my-deck-card-btn my-deck-card-minus";
  minus.textContent = "−";
  minus.setAttribute("aria-label", `${card.name}を1枚減らす`);
  minus.addEventListener("click", () => {
    setCount(card.id, countOf(card.id) - 1);
    refreshTile(tile, card);
    refreshSummary();
  });

  const num = document.createElement("span");
  num.className = "my-deck-card-num";

  const plus = document.createElement("button");
  plus.type = "button";
  plus.className = "my-deck-card-btn my-deck-card-plus";
  plus.textContent = "＋";
  plus.setAttribute("aria-label", `${card.name}を1枚増やす`);
  plus.addEventListener("click", () => {
    const before = countOf(card.id);
    setCount(card.id, before + 1);
    if (countOf(card.id) === before) {
      showToast(`「${card.name}」はこれ以上入れられません（上限${maxCopiesFor(card.id)}枚）。`);
    }
    refreshTile(tile, card);
    refreshSummary();
  });

  controls.appendChild(minus);
  controls.appendChild(num);
  controls.appendChild(plus);
  tile.appendChild(controls);

  refreshTile(tile, card);
  return tile;
}

function refreshTile(tile, card) {
  const n = countOf(card.id);
  const max = maxCopiesFor(card.id);
  tile.classList.toggle("is-in-deck", n > 0);
  const num = tile.querySelector(".my-deck-card-num");
  if (num) num.textContent = String(n);
  const badge = tile.querySelector(".my-deck-card-count-badge");
  if (badge) {
    badge.textContent = n > 0 ? `×${n}` : "";
    badge.classList.toggle("is-visible", n > 0);
  }
  const minus = tile.querySelector(".my-deck-card-minus");
  const plus = tile.querySelector(".my-deck-card-plus");
  if (minus) minus.disabled = n <= 0;
  if (plus) plus.disabled = n >= max;
}

function refreshSummary() {
  if (!summaryEl) return;
  const result = validateDeck(workingDeck);
  summaryEl.innerHTML = "";

  const counts = document.createElement("div");
  counts.className = "my-deck-summary-counts";
  counts.innerHTML =
    `<span class="my-deck-summary-total">合計 <b>${result.total}</b>枚</span>` +
    `<span class="my-deck-summary-sub">通常 ${result.nonSpecialCount}／スペシャル ${result.specialCount}</span>`;
  summaryEl.appendChild(counts);

  const status = document.createElement("div");
  status.className = "my-deck-summary-status " + (result.ok ? "is-ok" : "is-ng");
  if (result.ok) {
    status.textContent = "✓ このデッキは有効です";
  } else {
    const ul = document.createElement("ul");
    ul.className = "my-deck-summary-errors";
    for (const e of result.errors) {
      const li = document.createElement("li");
      li.textContent = e;
      ul.appendChild(li);
    }
    status.appendChild(ul);
  }
  summaryEl.appendChild(status);

  if (saveBtn) saveBtn.disabled = !result.ok;
}

export function openMyDeckBuilder(onClose) {
  if (overlayEl) return;
  workingDeck = getMyDeck();

  overlayEl = document.createElement("div");
  overlayEl.id = "my-deck-page";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "my-deck-page-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeMyDeckBuilder();
    onClose?.();
  });
  overlayEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.id = "my-deck-page-title";
  title.textContent = "🃏 マイデッキ編成";
  overlayEl.appendChild(title);

  const desc = document.createElement("div");
  desc.id = "my-deck-page-desc";
  desc.textContent =
    `所持している通常カードから${MIN_DECK_SIZE}枚以上でデッキを組みます。同名は7枚まで。` +
    `スペシャルカード(SP)1枚につき、非スペシャルの通常カードが${SPECIAL_TAX_RATIO}枚必要です。`;
  overlayEl.appendChild(desc);

  gridEl = document.createElement("div");
  gridEl.id = "my-deck-page-grid";
  for (const card of getDeckableCards()) {
    gridEl.appendChild(buildCardTile(card));
  }
  overlayEl.appendChild(gridEl);

  const footer = document.createElement("div");
  footer.id = "my-deck-page-footer";

  summaryEl = document.createElement("div");
  summaryEl.id = "my-deck-page-summary";
  footer.appendChild(summaryEl);

  saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "my-deck-page-save";
  saveBtn.textContent = "保存する";
  saveBtn.addEventListener("click", () => {
    const result = validateDeck(workingDeck);
    if (!result.ok) {
      showToast("ルールを満たしていないため保存できません。");
      return;
    }
    saveMyDeck(workingDeck);
    showToast("マイデッキを保存しました。");
  });
  footer.appendChild(saveBtn);

  overlayEl.appendChild(footer);

  document.body.appendChild(overlayEl);
  syncFullScreenPageActive();
  refreshSummary();
}

export function closeMyDeckBuilder() {
  clearTimeout(toastTimer);
  overlayEl?.remove();
  overlayEl = null;
  gridEl = null;
  summaryEl = null;
  saveBtn = null;
}
