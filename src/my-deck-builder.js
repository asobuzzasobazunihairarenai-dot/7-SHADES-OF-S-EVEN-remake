// マイデッキ編成の画面全体ページ（モーダルではないフルスクリーンページ）。
// ユーザー要望2026-08-11: MTGAのデッキ編集画面風に刷新。上＝所持カードのコレクション
// （アート表示＋所持◇ピップ、クリックで1枚追加／右クリックで1枚削除）、下＝現在のデッキ
// （色順に並ぶ ×N のミニカード、クリックで1枚削除）、上部バーに合計・有効判定・「完了」。
// 検証（7枚以上・同名7まで・所持超過・スペシャルの3:1税）と保存は my-deck.js のまま活かす。

import { getCardImagePath } from "./cards-data.js";
import { syncFullScreenPageActive } from "./option-area.js";
import {
  getDeckableCards,
  getOwnedCount,
  maxCopiesFor,
  isSpecialDeckCard,
  validateDeck,
  getDeckById,
  saveDeck,
  MIN_DECK_SIZE,
  SPECIAL_TAX_RATIO,
} from "./my-deck.js";

// デッキ一覧の並び順（色→スペシャル）。MTGAのように種類ごとにまとめて見せる。
const COLOR_ORDER = ["red", "orange", "yellow", "green", "blue", "pink", "purple", "rainbow", "white", "black"];

let overlayEl = null;
let collectionEl = null;
let deckListEl = null;
let summaryEl = null;
let saveBtn = null;
let nameInput = null;
let toastTimer = null;
// 編集中のデッキ（メタ情報。cardsはworkingDeckで別管理し、保存時に合流）。
let currentDeck = null;
// 編集中のデッキ（{ [cardId]: count }）。開いた時点でのgetMyDeck()のコピーを編集し、保存で確定。
let workingDeck = {};
// cardId → コレクションカードのDOM（変更時に状態だけ更新するため保持）。
const collectionTiles = new Map();

function countOf(cardId) {
  return Number(workingDeck[cardId]) || 0;
}

function setCount(cardId, next) {
  const clamped = Math.max(0, Math.min(next, maxCopiesFor(cardId)));
  if (clamped <= 0) delete workingDeck[cardId];
  else workingDeck[cardId] = clamped;
}

function addCard(card) {
  const before = countOf(card.id);
  setCount(card.id, before + 1);
  if (countOf(card.id) === before) {
    showToast(`「${card.name}」はこれ以上入れられません（上限${maxCopiesFor(card.id)}枚）。`);
    return;
  }
  onDeckChanged();
}

function removeCard(card) {
  if (countOf(card.id) <= 0) return;
  setCount(card.id, countOf(card.id) - 1);
  onDeckChanged();
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

// ── コレクション（上段） ─────────────────────────────────────────────────
function buildCollectionCard(card) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "mdb-col-card";
  tile.dataset.cardId = card.id;
  if (isSpecialDeckCard(card.id)) tile.classList.add("is-special");
  tile.setAttribute("aria-label", `${card.name}をデッキに追加`);

  const art = document.createElement("div");
  art.className = "mdb-col-card-art";
  const img = document.createElement("img");
  img.src = getCardImagePath(card.id);
  img.alt = card.name;
  img.loading = "lazy";
  art.appendChild(img);

  if (isSpecialDeckCard(card.id)) {
    const sp = document.createElement("span");
    sp.className = "mdb-col-card-sp";
    sp.textContent = "SP";
    sp.title = "スペシャルカード（1枚につき非スペシャルの通常カードが3枚必要）";
    art.appendChild(sp);
  }
  const countBadge = document.createElement("span");
  countBadge.className = "mdb-col-card-count";
  art.appendChild(countBadge);
  tile.appendChild(art);

  // 所持枚数ぶんの◇ピップ（MTGA風）。デッキに入っている枚数ぶんを点灯させる。
  const pips = document.createElement("div");
  pips.className = "mdb-col-card-pips";
  const owned = getOwnedCount(card.id);
  for (let i = 0; i < owned; i++) {
    const pip = document.createElement("span");
    pip.className = "mdb-col-card-pip";
    pips.appendChild(pip);
  }
  tile.appendChild(pips);

  const name = document.createElement("div");
  name.className = "mdb-col-card-name";
  name.textContent = card.name;
  tile.appendChild(name);

  // 左クリックで追加、右クリックで1枚削除（MTGA風）。
  tile.addEventListener("click", () => addCard(card));
  tile.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    removeCard(card);
  });

  collectionTiles.set(card.id, tile);
  refreshCollectionCard(card);
  return tile;
}

function refreshCollectionCard(card) {
  const tile = collectionTiles.get(card.id);
  if (!tile) return;
  const n = countOf(card.id);
  const max = maxCopiesFor(card.id);
  tile.classList.toggle("is-in-deck", n > 0);
  tile.classList.toggle("is-maxed", n >= max);
  const badge = tile.querySelector(".mdb-col-card-count");
  if (badge) {
    badge.textContent = n > 0 ? `×${n}` : "";
    badge.classList.toggle("is-visible", n > 0);
  }
  const pipEls = tile.querySelectorAll(".mdb-col-card-pip");
  pipEls.forEach((pip, i) => pip.classList.toggle("is-lit", i < n));
}

// ── 現在のデッキ（下段） ─────────────────────────────────────────────────
function rebuildDeckList() {
  if (!deckListEl) return;
  deckListEl.innerHTML = "";
  const cards = getDeckableCards()
    .filter((c) => countOf(c.id) > 0)
    .sort((a, b) => COLOR_ORDER.indexOf(a.color) - COLOR_ORDER.indexOf(b.color));
  if (cards.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mdb-deck-empty";
    empty.textContent = "上のカードをクリックしてデッキに追加してください。";
    deckListEl.appendChild(empty);
    return;
  }
  for (const card of cards) {
    const n = countOf(card.id);
    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "mdb-deck-entry";
    if (isSpecialDeckCard(card.id)) entry.classList.add("is-special");
    entry.setAttribute("aria-label", `${card.name}を1枚減らす`);

    const art = document.createElement("div");
    art.className = "mdb-deck-entry-art";
    const img = document.createElement("img");
    img.src = getCardImagePath(card.id);
    img.alt = card.name;
    img.loading = "lazy";
    art.appendChild(img);
    const cnt = document.createElement("span");
    cnt.className = "mdb-deck-entry-count";
    cnt.textContent = `×${n}`;
    art.appendChild(cnt);
    entry.appendChild(art);

    const nm = document.createElement("div");
    nm.className = "mdb-deck-entry-name";
    nm.textContent = card.name;
    entry.appendChild(nm);

    entry.addEventListener("click", () => removeCard(card));
    entry.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      addCard(card); // 右クリックで1枚増やす（対称）
    });
    deckListEl.appendChild(entry);
  }
}

// ── サマリー（上部バー）＋保存 ───────────────────────────────────────────
function refreshSummary() {
  if (!summaryEl) return;
  const result = validateDeck(workingDeck);
  summaryEl.innerHTML = "";

  const counts = document.createElement("div");
  counts.className = "mdb-summary-counts";
  counts.innerHTML =
    `<span class="mdb-summary-total"><b>${result.total}</b><small>枚</small></span>` +
    `<span class="mdb-summary-sub">通常 ${result.nonSpecialCount} ／ SP ${result.specialCount}</span>`;
  summaryEl.appendChild(counts);

  const status = document.createElement("div");
  status.className = "mdb-summary-status " + (result.ok ? "is-ok" : "is-ng");
  if (result.ok) {
    status.textContent = "✓ このデッキは有効です";
  } else {
    const ul = document.createElement("ul");
    ul.className = "mdb-summary-errors";
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

// 追加/削除のたびに、変わったカードのコレクション表示・デッキ一覧・サマリーを更新する。
function onDeckChanged() {
  for (const card of getDeckableCards()) refreshCollectionCard(card);
  rebuildDeckList();
  refreshSummary();
}

export function openMyDeckBuilder(deckId, onClose) {
  if (overlayEl) return;
  currentDeck = getDeckById(deckId);
  if (!currentDeck) {
    // 万一デッキが見つからない場合は一覧へ戻す。
    onClose?.();
    return;
  }
  workingDeck = { ...currentDeck.cards };
  collectionTiles.clear();

  overlayEl = document.createElement("div");
  overlayEl.id = "my-deck-page";
  overlayEl.classList.add("mdb-mtga");

  // 上部バー: 戻る／デッキ名入力／サマリー／完了。
  const header = document.createElement("div");
  header.id = "mdb-header";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "my-deck-page-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeMyDeckBuilder();
    onClose?.();
  });
  header.appendChild(backBtn);

  nameInput = document.createElement("input");
  nameInput.id = "mdb-name-input";
  nameInput.type = "text";
  nameInput.maxLength = 24;
  nameInput.value = currentDeck.name || "";
  nameInput.placeholder = "デッキ名";
  nameInput.setAttribute("aria-label", "デッキ名");
  header.appendChild(nameInput);

  summaryEl = document.createElement("div");
  summaryEl.id = "mdb-summary";
  header.appendChild(summaryEl);

  saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.id = "mdb-save";
  saveBtn.textContent = "完了（保存）";
  saveBtn.addEventListener("click", () => {
    const result = validateDeck(workingDeck);
    if (!result.ok) {
      showToast("ルールを満たしていないため保存できません。");
      return;
    }
    const name = (nameInput?.value || "").trim() || "マイデッキ";
    saveDeck({ ...currentDeck, name, cards: workingDeck });
    currentDeck.name = name;
    showToast("マイデッキを保存しました。");
  });
  header.appendChild(saveBtn);
  overlayEl.appendChild(header);

  // 使い方の一言（MTGAより控えめに）。
  const hint = document.createElement("div");
  hint.id = "mdb-hint";
  hint.textContent =
    `所持カードをクリックで追加・右クリックで削除。${MIN_DECK_SIZE}枚以上／同名7まで／SP1枚につき非SPを${SPECIAL_TAX_RATIO}枚。`;
  overlayEl.appendChild(hint);

  // 上段: コレクション。
  collectionEl = document.createElement("div");
  collectionEl.id = "mdb-collection";
  for (const card of getDeckableCards()) collectionEl.appendChild(buildCollectionCard(card));
  overlayEl.appendChild(collectionEl);

  // 下段: 現在のデッキ。
  const deckPanel = document.createElement("div");
  deckPanel.id = "mdb-deck-panel";
  const deckPanelTitle = document.createElement("div");
  deckPanelTitle.id = "mdb-deck-panel-title";
  deckPanelTitle.textContent = "現在のデッキ";
  deckPanel.appendChild(deckPanelTitle);
  deckListEl = document.createElement("div");
  deckListEl.id = "mdb-deck-list";
  deckPanel.appendChild(deckListEl);
  overlayEl.appendChild(deckPanel);

  document.body.appendChild(overlayEl);
  syncFullScreenPageActive();
  onDeckChanged();
}

export function closeMyDeckBuilder() {
  clearTimeout(toastTimer);
  collectionTiles.clear();
  overlayEl?.remove();
  overlayEl = null;
  collectionEl = null;
  deckListEl = null;
  summaryEl = null;
  saveBtn = null;
  nameInput = null;
  currentDeck = null;
}
