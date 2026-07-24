// ショップ（ユーザー要望「ゲーム内通貨を実装し、駒スキンやアバター、カード裏面、
// プレイマット背景を購入できるようにする」）。通貨表示（currency-display.js）をクリック
// するか、各ピッカー（piece-skins.js等）でロックされた項目をクリックすると開く
// （online.jsのregisterShopOpener経由、main.jsが注入する）。
//
// ユーザー要望「商品の見た目がわかるといい。見た目を並べてそこに金額を載せるのが
// わかりやすいかな？おしゃれに並べてください」への対応。カテゴリをタブで切り替え、
// 選んだカテゴリの中身を画像カードのグリッドで表示する（旧・折りたたみ+テキスト行の
// 一覧から作り直した）。各カードの画像は各モジュールのgetXShopItems()が返す
// imagePathをそのまま使う。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getCachedUser, getMyCurrencyBalance, isItemUnlocked, purchaseItem } from "./online.js";
import { refreshCurrencyDisplay } from "./currency-display.js";
import { SHOP_CATEGORIES } from "./shop-content.js";

let panelEl = null;
let backdropEl = null;
let balanceEl = null;
let statusEl = null;
let tabsEl = null;
let gridEl = null;
let activeCategoryKey = SHOP_CATEGORIES[0]?.key ?? null;

function close() {
  if (panelEl) panelEl.style.display = "none";
  if (backdropEl) backdropEl.style.display = "none";
}

function setStatus(text, isError) {
  if (!statusEl) return;
  statusEl.textContent = text ?? "";
  statusEl.classList.toggle("is-error", !!isError);
}

// so7_purchase_itemが投げる例外メッセージ（supabase_setup_so7.sql参照）をそのまま
// ユーザー向けの日本語に変換する。
function describePurchaseError(err) {
  const message = String(err?.message ?? err ?? "");
  if (message.includes("insufficient_balance")) return "通貨が足りません。";
  if (message.includes("already_owned")) return "既に所持しています。";
  if (message.includes("not_authenticated")) return "ログインしてください。";
  return `購入に失敗しました（${message}）`;
}

function buildItemCard(item) {
  const card = document.createElement("div");
  card.className = "shop-item-card";

  const thumb = document.createElement("div");
  thumb.className = "shop-item-thumb";
  const img = document.createElement("img");
  img.src = item.imagePath;
  img.alt = item.label;
  thumb.appendChild(img);

  const owned = item.cost === 0 || isItemUnlocked(item.itemKey);
  if (!owned) {
    thumb.classList.add("is-locked");
    const lockBadge = document.createElement("span");
    lockBadge.className = "shop-item-thumb-lock";
    lockBadge.textContent = "🔒";
    thumb.appendChild(lockBadge);
  }
  card.appendChild(thumb);

  const labelEl = document.createElement("div");
  labelEl.className = "shop-item-card-label";
  labelEl.textContent = item.label;
  card.appendChild(labelEl);

  const footer = document.createElement("div");
  footer.className = "shop-item-card-footer";
  if (owned) {
    const ownedEl = document.createElement("span");
    ownedEl.className = "shop-item-owned";
    ownedEl.textContent = item.cost === 0 ? "無料" : "所持済み";
    footer.appendChild(ownedEl);
  } else {
    const buyBtn = document.createElement("button");
    buyBtn.type = "button";
    buyBtn.className = "shop-item-buy";
    buyBtn.textContent = `🪙 ${item.cost}`;
    buyBtn.addEventListener("click", async () => {
      if (!getCachedUser()) {
        setStatus("購入にはログインが必要です。", true);
        return;
      }
      buyBtn.disabled = true;
      setStatus("購入中...");
      try {
        await purchaseItem(item.itemKey, item.cost);
        setStatus(`「${item.label}」を購入しました！`);
        await Promise.all([refreshCurrencyDisplay(), refreshBalance()]);
        renderGrid();
      } catch (err) {
        setStatus(describePurchaseError(err), true);
        buyBtn.disabled = false;
      }
    });
    footer.appendChild(buyBtn);
  }
  card.appendChild(footer);

  return card;
}

function renderGrid() {
  gridEl.innerHTML = "";
  const category = SHOP_CATEGORIES.find((c) => c.key === activeCategoryKey) ?? SHOP_CATEGORIES[0];
  if (!category) return;
  for (const item of category.items) {
    gridEl.appendChild(buildItemCard(item));
  }
}

function renderTabs() {
  tabsEl.innerHTML = "";
  for (const category of SHOP_CATEGORIES) {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "shop-tab";
    if (category.key === activeCategoryKey) tab.classList.add("is-active");
    tab.textContent = category.label;
    tab.addEventListener("click", () => {
      activeCategoryKey = category.key;
      renderTabs();
      renderGrid();
    });
    tabsEl.appendChild(tab);
  }
}

async function refreshBalance() {
  if (!balanceEl) return;
  const user = getCachedUser();
  if (!user) {
    balanceEl.textContent = "ログインすると通貨を貯められます";
    return;
  }
  const balance = await getMyCurrencyBalance();
  balanceEl.textContent = `所持通貨: 🪙 ${balance}`;
}

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "shop-panel";

  const titleEl = document.createElement("div");
  titleEl.id = "shop-panel-title";
  const titleIcon = document.createElement("img");
  titleIcon.src = "assets/icons/store.png";
  titleIcon.alt = "";
  titleEl.appendChild(titleIcon);
  titleEl.appendChild(document.createTextNode("ショップ"));
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  balanceEl = document.createElement("div");
  balanceEl.id = "shop-panel-balance";
  panel.appendChild(balanceEl);

  statusEl = document.createElement("div");
  statusEl.id = "shop-panel-status";
  panel.appendChild(statusEl);

  tabsEl = document.createElement("div");
  tabsEl.id = "shop-panel-tabs";
  panel.appendChild(tabsEl);

  gridEl = document.createElement("div");
  gridEl.id = "shop-panel-grid";
  panel.appendChild(gridEl);

  return panel;
}

// initialCategoryKeyが指定されていれば、そのタブを選んだ状態で開く（ピッカー側の
// ロック項目クリックから開いた時に、関連カテゴリへ直接誘導するため）。
function focusCategory(categoryKey) {
  if (!categoryKey) return;
  if (!SHOP_CATEGORIES.some((c) => c.key === categoryKey)) return;
  activeCategoryKey = categoryKey;
}

export function openShopPanel(initialCategoryKey) {
  setStatus("");
  focusCategory(initialCategoryKey);
  renderTabs();
  renderGrid();
  refreshBalance();
  panelEl.style.display = "block";
  backdropEl.style.display = "block";
}

export function initShop() {
  panelEl = buildPanel();
  backdropEl = createBackdrop(close, { dim: true, zIndex: 2600 });
  backdropEl.style.display = "none";
  panelEl.style.display = "none";
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
}
