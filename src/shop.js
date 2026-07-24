// ショップ（ユーザー要望「ゲーム内通貨を実装し、駒スキンやアバター、カード裏面、
// プレイマット背景を購入できるようにする」）。通貨表示（currency-display.js）をクリック
// するか、各ピッカー（piece-skins.js等）でロックされた項目をクリックすると開く
// （online.jsのregisterShopOpener経由、main.jsが注入する）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getCachedUser, getMyCurrencyBalance, isItemUnlocked, purchaseItem } from "./online.js";
import { refreshCurrencyDisplay } from "./currency-display.js";
import { SHOP_CATEGORIES } from "./shop-content.js";

let panelEl = null;
let backdropEl = null;
let balanceEl = null;
let statusEl = null;
let listEl = null;

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

function buildItemRow(item) {
  const row = document.createElement("div");
  row.className = "shop-item-row";

  const labelEl = document.createElement("span");
  labelEl.className = "shop-item-label";
  labelEl.textContent = item.label;
  row.appendChild(labelEl);

  const owned = item.cost === 0 || isItemUnlocked(item.itemKey);
  if (owned) {
    const ownedEl = document.createElement("span");
    ownedEl.className = "shop-item-owned";
    ownedEl.textContent = item.cost === 0 ? "無料" : "所持済み";
    row.appendChild(ownedEl);
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
        renderList();
      } catch (err) {
        setStatus(describePurchaseError(err), true);
        buyBtn.disabled = false;
      }
    });
    row.appendChild(buyBtn);
  }

  return row;
}

function renderList() {
  listEl.innerHTML = "";
  for (const category of SHOP_CATEGORIES) {
    const details = document.createElement("details");
    details.className = "shop-category";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = category.label;
    details.appendChild(summary);

    const rows = document.createElement("div");
    rows.className = "shop-category-rows";
    for (const item of category.items) {
      rows.appendChild(buildItemRow(item));
    }
    details.appendChild(rows);
    listEl.appendChild(details);
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
  titleEl.textContent = "🛍️ ショップ";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  balanceEl = document.createElement("div");
  balanceEl.id = "shop-panel-balance";
  panel.appendChild(balanceEl);

  statusEl = document.createElement("div");
  statusEl.id = "shop-panel-status";
  panel.appendChild(statusEl);

  listEl = document.createElement("div");
  listEl.id = "shop-panel-list";
  panel.appendChild(listEl);

  return panel;
}

// initialCategoryKeyが指定されていれば、そのカテゴリだけ開いて他は畳んでおく
// （ピッカー側のロック項目クリックから開いた時に、関連カテゴリへ直接誘導するため）。
function focusCategory(categoryKey) {
  if (!categoryKey) return;
  const detailsList = [...listEl.querySelectorAll(".shop-category")];
  const categoryIndex = SHOP_CATEGORIES.findIndex((c) => c.key === categoryKey);
  if (categoryIndex === -1) return;
  detailsList.forEach((el, i) => {
    el.open = i === categoryIndex;
  });
  detailsList[categoryIndex]?.scrollIntoView({ block: "center" });
}

export function openShopPanel(initialCategoryKey) {
  setStatus("");
  renderList();
  refreshBalance();
  focusCategory(initialCategoryKey);
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
