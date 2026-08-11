// マイデッキ編成の画面全体ページ（モーダルではないフルスクリーンページ）。
// ユーザー要望2026-08-11: MTGAのデッキ編集画面風に刷新。上＝所持カードのコレクション
// （アート表示＋所持◇ピップ、クリックで1枚追加／右クリックで1枚削除）、下＝現在のデッキ
// （色順に並ぶ ×N のミニカード、クリックで1枚削除）、上部バーに合計・有効判定・「完了」。
// 検証（7枚以上・同名7まで・所持超過・スペシャルの3:1税）と保存は my-deck.js のまま活かす。

import { getCardImagePath, getCardDefinition } from "./cards-data.js";
import { syncFullScreenPageActive } from "./option-area.js";
import {
  getDeckableCards,
  getOwnedCount,
  maxCopiesFor,
  isSpecialDeckCard,
  validateDeck,
  getDeckById,
  saveDeck,
  FIRST_COLORS,
  MIN_DECK_SIZE,
  SPECIAL_TAX_RATIO,
} from "./my-deck.js";
// デッキごとの駒スキン・ペット・裏面の選択に使うピッカー（onSelectでグローバルを変えず値だけ
// 受け取る）は、クリック時に動的importする。静的importにすると piece-skins→shop-content→
// piece-skins の循環でモジュール評価順が崩れ、SKIN_VARIANTS のTDZ→起動時ブラックスクリーンに
// なるため（[[circular-import-tdz-and-no-cache-bust]]。実際にハーネスで発生を確認）。
// サムネイル用の値も同様に、必要な軽い分だけインライン化／pet-skinsは遅延ロードする。

// カード裏面画像のパス（card-back-skins.js backImagePath と同じロジックをインライン化して
// 静的importを避ける）。
function backPathFor(idx) {
  const suffix = idx === 0 ? "" : `-${idx}`;
  const ext = idx === 0 || idx === 10 ? "webp" : "png";
  return `assets/cards/back-normal${suffix}.${ext}`;
}
// ペットのサムネ用に pet-skins を遅延ロードして保持（{ PET_OPTIONS, petSpriteSrc }）。
let petMod = null;

// ファースト色のチップ表示色。
const MDB_COLOR_HEX = {
  red: "#c70025",
  orange: "#ee781f",
  yellow: "#fabe00",
  green: "#22ac38",
  blue: "#1bb8ce",
  pink: "#f19ec2",
  purple: "#915da3",
};

// デッキ一覧の並び順（色→スペシャル）。MTGAのように種類ごとにまとめて見せる。
const COLOR_ORDER = ["red", "orange", "yellow", "green", "blue", "pink", "purple", "rainbow", "white", "black"];

let overlayEl = null;
let collectionEl = null;
let deckListEl = null;
let summaryEl = null;
let saveBtn = null;
let nameInput = null;
let settingsEl = null;
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

// ── ホバー拡大プレビュー・右クリックのカード補足（ゲーム画面と同等。ユーザー要望2026-08-11）──
let previewEl = null;
function getPreviewEl() {
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = "mdb-preview";
    const img = document.createElement("img");
    previewEl.appendChild(img);
    document.body.appendChild(previewEl);
  }
  return previewEl;
}
function showPreview(cardId, x, y) {
  const p = getPreviewEl();
  p.querySelector("img").src = getCardImagePath(cardId);
  p.classList.add("is-visible");
  movePreview(x, y);
}
function movePreview(x, y) {
  if (!previewEl) return;
  const w = previewEl.offsetWidth || 240;
  const h = previewEl.offsetHeight || 240;
  const pad = 18;
  let left = x + pad;
  let top = y - h / 2;
  if (left + w > window.innerWidth - 6) left = x - w - pad;
  if (left < 6) left = 6;
  if (top < 6) top = 6;
  if (top + h > window.innerHeight - 6) top = window.innerHeight - h - 6;
  previewEl.style.left = `${left}px`;
  previewEl.style.top = `${top}px`;
}
function hidePreview() {
  previewEl?.classList.remove("is-visible");
}
// カード要素にホバー拡大を付ける共通処理。
function attachHoverPreview(el, cardId) {
  el.addEventListener("mouseenter", (e) => showPreview(cardId, e.clientX, e.clientY));
  el.addEventListener("mousemove", (e) => movePreview(e.clientX, e.clientY));
  el.addEventListener("mouseleave", hidePreview);
}

let noteMenuEl = null;
function hideNoteMenu() {
  noteMenuEl?.remove();
  noteMenuEl = null;
}
function showNoteMenu(cardId, x, y) {
  hideNoteMenu();
  hidePreview();
  noteMenuEl = document.createElement("div");
  noteMenuEl.id = "mdb-note-menu";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "mdb-note-menu-btn";
  btn.textContent = "📄 カード補足を見る";
  btn.addEventListener("click", () => {
    hideNoteMenu();
    showCardNoteModal(cardId);
  });
  noteMenuEl.appendChild(btn);
  document.body.appendChild(noteMenuEl);
  const w = noteMenuEl.offsetWidth || 170;
  const h = noteMenuEl.offsetHeight || 44;
  noteMenuEl.style.left = `${Math.min(x, window.innerWidth - w - 6)}px`;
  noteMenuEl.style.top = `${Math.min(y, window.innerHeight - h - 6)}px`;
  // メニュー外クリック／右クリックで閉じる（次のイベントで）。
  setTimeout(() => {
    document.addEventListener("click", hideNoteMenu, { once: true });
    document.addEventListener("contextmenu", hideNoteMenu, { once: true });
  }, 0);
}
// 右クリックで補足メニュー→カード補足モーダル（ゲーム画面の showCardNoteModal と同じ見た目。
// #card-note-modal* のCSSを流用）。
function showCardNoteModal(cardId) {
  const def = getCardDefinition(cardId);
  if (!def) return;
  const backdrop = document.createElement("div");
  backdrop.id = "card-note-modal-backdrop";
  const modal = document.createElement("div");
  modal.id = "card-note-modal";
  const content = document.createElement("div");
  content.className = "card-note-content";
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
  textCol.append(title, body);
  content.append(img, textCol);
  const closeBtn = document.createElement("button");
  closeBtn.className = "card-note-close";
  closeBtn.type = "button";
  closeBtn.textContent = "閉じる";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  modal.append(content, closeBtn);
  document.body.append(backdrop, modal);
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

  // 左クリックで追加。右クリックはカード補足メニュー。ホバーで拡大プレビュー（ゲーム画面と同等）。
  tile.addEventListener("click", () => addCard(card));
  tile.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showNoteMenu(card.id, e.clientX, e.clientY);
  });
  attachHoverPreview(tile, card.id);

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
      showNoteMenu(card.id, e.clientX, e.clientY);
    });
    attachHoverPreview(entry, card.id);
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
  hidePreview(); // クリックで要素が作り直されるので、古い拡大プレビューは消しておく
  for (const card of getDeckableCards()) refreshCollectionCard(card);
  rebuildDeckList();
  refreshSummary();
}

// ── デッキ設定（ファースト色・駒スキン・ペット・裏面。ユーザー要望2026-08-11）────────
function pieceThumbSrc(color, idx) {
  const c = color || "red"; // 色未定（ランダム）は赤で仮表示
  return idx ? `assets/pieces/${c}-${idx}.webp` : `assets/pieces/${c}.webp`;
}
function refreshSettingsRow() {
  if (!settingsEl || !currentDeck) return;
  settingsEl.querySelectorAll(".mdb-color-chip").forEach((chip) => {
    chip.classList.toggle("is-selected", (chip.dataset.color || "") === (currentDeck.firstColor || ""));
  });
  const pieceImg = settingsEl.querySelector(".mdb-setting-piece img");
  if (pieceImg) pieceImg.src = pieceThumbSrc(currentDeck.firstColor, currentDeck.pieceSkinIndex ?? 0);
  const backImg = settingsEl.querySelector(".mdb-setting-back img");
  if (backImg) backImg.src = backPathFor(currentDeck.cardBackSetIndex ?? 0);
  const petFace = settingsEl.querySelector(".mdb-setting-pet .mdb-setting-face");
  if (petFace) {
    petFace.innerHTML = "";
    const idx = currentDeck.petIndex ?? 0;
    if (petMod) {
      const opt = petMod.PET_OPTIONS[idx] || petMod.PET_OPTIONS[0];
      if (opt?.sprite) {
        const im = document.createElement("img");
        im.src = petMod.petSpriteSrc(opt.sprite, "front", "static");
        im.alt = "";
        petFace.appendChild(im);
      } else {
        petFace.textContent = opt?.emoji ?? "🚫";
      }
    } else {
      // pet-skins 読み込み前は仮アイコン（読み込み後にrefreshで差し替わる）。
      petFace.textContent = "🐾";
    }
  }
}
function buildSettingsRow() {
  const wrap = document.createElement("div");
  wrap.id = "mdb-settings";

  // ファースト色（ランダム＋7色）。マイデッキ戦ではこの色のファースト＆駒で戦う。
  const colorSetting = document.createElement("div");
  colorSetting.className = "mdb-setting mdb-setting-color";
  const colorLabel = document.createElement("span");
  colorLabel.className = "mdb-setting-label";
  colorLabel.textContent = "ファースト色";
  colorSetting.appendChild(colorLabel);
  const chips = document.createElement("div");
  chips.className = "mdb-color-chips";
  const rnd = document.createElement("button");
  rnd.type = "button";
  rnd.className = "mdb-color-chip mdb-color-chip-random";
  rnd.dataset.color = "";
  rnd.title = "ランダム（対戦開始時に決定）";
  rnd.textContent = "ランダム";
  rnd.addEventListener("click", () => {
    currentDeck.firstColor = null;
    refreshSettingsRow();
  });
  chips.appendChild(rnd);
  for (const color of FIRST_COLORS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "mdb-color-chip";
    chip.dataset.color = color;
    chip.style.background = MDB_COLOR_HEX[color];
    chip.title = color;
    chip.addEventListener("click", () => {
      currentDeck.firstColor = color;
      refreshSettingsRow();
    });
    chips.appendChild(chip);
  }
  colorSetting.appendChild(chips);
  wrap.appendChild(colorSetting);

  const pieceBtn = document.createElement("button");
  pieceBtn.type = "button";
  pieceBtn.className = "mdb-setting-btn mdb-setting-piece";
  pieceBtn.innerHTML = `<span class="mdb-setting-thumb"><img alt=""></span><span class="mdb-setting-label">駒スキン</span>`;
  pieceBtn.addEventListener("click", async () => {
    const { openPieceSkinPicker } = await import("./piece-skins.js");
    openPieceSkinPicker({
      previewColor: currentDeck.firstColor || undefined,
      selectedIndex: currentDeck.pieceSkinIndex ?? 0,
      onSelect: (idx) => {
        currentDeck.pieceSkinIndex = idx;
        refreshSettingsRow();
      },
    });
  });
  wrap.appendChild(pieceBtn);

  const petBtn = document.createElement("button");
  petBtn.type = "button";
  petBtn.className = "mdb-setting-btn mdb-setting-pet";
  petBtn.innerHTML = `<span class="mdb-setting-face"></span><span class="mdb-setting-label">ペット</span>`;
  petBtn.addEventListener("click", async () => {
    const { openPetPicker } = await import("./pet-skins.js");
    openPetPicker({
      selectedIndex: currentDeck.petIndex ?? 0,
      onSelect: (idx) => {
        currentDeck.petIndex = idx;
        refreshSettingsRow();
      },
    });
  });
  wrap.appendChild(petBtn);

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "mdb-setting-btn mdb-setting-back";
  backBtn.innerHTML = `<span class="mdb-setting-thumb"><img alt=""></span><span class="mdb-setting-label">裏面</span>`;
  backBtn.addEventListener("click", async () => {
    const { openCardBackSkinPicker } = await import("./card-back-skins.js");
    openCardBackSkinPicker({
      selectedIndex: currentDeck.cardBackSetIndex ?? 0,
      onSelect: (idx) => {
        currentDeck.cardBackSetIndex = idx;
        refreshSettingsRow();
      },
    });
  });
  wrap.appendChild(backBtn);

  settingsEl = wrap;
  refreshSettingsRow();
  // ペットのサムネ用に pet-skins を遅延ロード（静的importを避けるため。読み込めたら差し替え）。
  if (!petMod) {
    import("./pet-skins.js")
      .then((m) => {
        petMod = m;
        refreshSettingsRow();
      })
      .catch(() => {});
  }
  return wrap;
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
    `所持カードをクリックで追加・右クリックで補足。ホバーで拡大。${MIN_DECK_SIZE}枚以上／同名7まで／SP1枚につき非SPを${SPECIAL_TAX_RATIO}枚。`;
  overlayEl.appendChild(hint);

  // デッキ設定（ファースト色・駒スキン・ペット・裏面）。
  overlayEl.appendChild(buildSettingsRow());

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
  hideNoteMenu();
  previewEl?.remove();
  previewEl = null;
  overlayEl?.remove();
  overlayEl = null;
  collectionEl = null;
  deckListEl = null;
  summaryEl = null;
  saveBtn = null;
  nameInput = null;
  settingsEl = null;
  currentDeck = null;
}
