// ショップ（ユーザー要望「ゲーム内通貨を実装し、駒スキンやアバター、カード裏面、
// プレイマット背景を購入できるようにする」）。通貨表示（currency-display.js）をクリック
// するか、各ピッカー（piece-skins.js等）でロックされた項目をクリックすると開く
// （online.jsのregisterShopOpener経由、main.jsが注入する）。
//
// ユーザー要望「商品の見た目がわかるといい。見た目を並べてそこに金額を載せるのが
// わかりやすいかな？おしゃれに並べてください」＋「ショップのビジュアルはMTGAストアの
// 感じを目指したい。モーダルではなく画面全体を使って表示させよう」への対応。
// カテゴリをタブで切り替え、選んだカテゴリの中身を大きめの画像カードのグリッドで
// 表示する（旧・折りたたみ+テキスト行の一覧から作り直した）。中央固定の小さいモーダル
// から、画面全体を使う専用ページ的な表示に変更したため、外側クリックで閉じる
// backdropはもう不要（パネル自体が画面全体を覆うため、外側＝押せる場所が存在しない）。
// 閉じるのは右上の✕ボタンのみ。各カードの画像は各モジュールのgetXShopItems()が返す
// imagePathをそのまま使う。

import { getCachedUser, getMyCurrencyBalance, isItemUnlocked, purchaseItem } from "./online.js";
import { refreshCurrencyDisplay } from "./currency-display.js";
import { SHOP_CATEGORIES, getShopCompletionStats } from "./shop-content.js";
import { getSkinImagePathForVariant } from "./piece-skins.js";

let panelEl = null;
let balanceEl = null;
let completionEl = null;
let statusEl = null;
let tabsEl = null;
let gridEl = null;
let activeCategoryKey = SHOP_CATEGORIES[0]?.key ?? null;

function close() {
  if (panelEl) panelEl.style.display = "none";
  // ショップを閉じたら上部オプションエリアの前面化フラグも外す。
  document.body.classList.remove("shop-open");
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

  // ユーザー要望2026-08-08「MTGAストアのように、商品ごとに背景を用意したい。暫定として
  // 商品そのものを半透明で巨大化した画像を背景にする」。商品画像を拡大・ぼかし・半透明で
  // カード背面に敷く（下端はマスクで薄くして文字を読みやすく）。CSSは .shop-item-bg 参照。
  const bg = document.createElement("div");
  bg.className = "shop-item-bg";
  bg.style.backgroundImage = `url("${item.imagePath}")`;
  card.appendChild(bg);

  const thumb = document.createElement("div");
  thumb.className = "shop-item-thumb";
  const img = document.createElement("img");
  img.src = item.imagePath;
  img.alt = item.label;
  thumb.appendChild(img);

  const owned = item.cost === 0 || isItemUnlocked(item.itemKey);
  // ユーザー要望「ショップのビジュアルはMTGA(Magic: The Gathering Arena)ストアの感じを
  // 目指したい。一つ一つの商品を目立たせてかっこよく並べたい」への対応。所持状況は
  // 画像の隅にリボン風バッジで見せ（MTGAの「SALE」等のリボンと同じ発想）、下段の
  // ボタンは価格だけに専念させる。
  const ribbon = document.createElement("span");
  ribbon.className = "shop-item-ribbon";
  if (owned) {
    ribbon.classList.add(item.cost === 0 ? "is-free" : "is-owned");
    ribbon.textContent = item.cost === 0 ? "無料" : "所持済み";
    thumb.appendChild(ribbon);
  } else {
    thumb.classList.add("is-locked");
    const lockBadge = document.createElement("span");
    lockBadge.className = "shop-item-thumb-lock";
    lockBadge.textContent = "🔒";
    thumb.appendChild(lockBadge);
  }
  card.appendChild(thumb);

  // ユーザー要望（続き84）「駒スキンは1種類につき7色あるが、今は赤しか見えていない。
  // 7色見られるようにしたい」。piece-skins.jsのgetSkinShopItems()が付けている
  // previewColors/variantがある項目（駒スキンのみ）だけ、サムネイル下に色スウォッチの
  // 行を出す。クリックするとそのカードの画像だけをその場で差し替える（実際に使う色は
  // ファーストカードで決まるため、ここでの色選択は見た目の確認用）。
  if (item.previewColors && typeof item.variant === "number") {
    const swatchRow = document.createElement("div");
    swatchRow.className = "shop-item-color-swatches";
    let activeSwatch = null;
    for (const color of item.previewColors) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "shop-item-color-swatch";
      swatch.style.setProperty("--swatch-color", `var(--color-${color})`);
      swatch.title = color;
      if (color === item.previewColors[0]) {
        swatch.classList.add("is-active");
        activeSwatch = swatch;
      }
      swatch.addEventListener("click", () => {
        img.src = getSkinImagePathForVariant(color, item.variant);
        activeSwatch?.classList.remove("is-active");
        swatch.classList.add("is-active");
        activeSwatch = swatch;
      });
      swatchRow.appendChild(swatch);
    }
    card.appendChild(swatchRow);
  }

  const labelEl = document.createElement("div");
  labelEl.className = "shop-item-card-label";
  labelEl.textContent = item.label;
  card.appendChild(labelEl);

  const footer = document.createElement("div");
  footer.className = "shop-item-card-footer";
  if (owned) {
    // リボンで既に伝えているため、下段は空けておく（MTGAの所持済みカードも
    // ボタン枠を残したまま空ける見た目に近い）。
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
    if (completionEl) completionEl.textContent = "";
    return;
  }
  const balance = await getMyCurrencyBalance();
  balanceEl.textContent = `所持通貨: 🪙 ${balance}`;
  // ユーザー要望「ショップ画面とマイページにアイテムコンプリート率を表示したい」への対応。
  if (completionEl) {
    const { owned, total, percent } = getShopCompletionStats();
    completionEl.textContent = `🏆 コレクション達成率: ${percent}%（${owned}/${total}）`;
  }
}

// ユーザー要望「モーダルではなく画面全体を使って表示させよう」への対応。ヘッダー
// （タイトル・残高・達成率・閉じるボタン）を上部に固定し、タブ＋商品グリッドは
// その下の残り全高を使ってスクロールする、という2段構成にした。
function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "shop-panel";

  const header = document.createElement("div");
  header.id = "shop-panel-header";

  // ユーザー要望（続き85）「ショップもほかの全画面ページに合わせ、『戻る』ボタンを
  // 左上に設置してください。右上の×ボタンは削除で」。profile-page.js/
  // ranking-page.jsと同じ「← 戻る」文言・左上配置に揃える。
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "shop-panel-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", close);
  header.appendChild(backBtn);

  const titleEl = document.createElement("div");
  titleEl.id = "shop-panel-title";
  const titleIcon = document.createElement("img");
  titleIcon.src = "assets/icons/store.png";
  titleIcon.alt = "";
  titleEl.appendChild(titleIcon);
  titleEl.appendChild(document.createTextNode("ショップ"));
  header.appendChild(titleEl);

  const headerInfo = document.createElement("div");
  headerInfo.id = "shop-panel-header-info";
  balanceEl = document.createElement("div");
  balanceEl.id = "shop-panel-balance";
  headerInfo.appendChild(balanceEl);
  completionEl = document.createElement("div");
  completionEl.id = "shop-panel-completion";
  headerInfo.appendChild(completionEl);
  header.appendChild(headerInfo);

  panel.appendChild(header);

  statusEl = document.createElement("div");
  statusEl.id = "shop-panel-status";
  panel.appendChild(statusEl);

  tabsEl = document.createElement("div");
  tabsEl.id = "shop-panel-tabs";
  panel.appendChild(tabsEl);

  gridEl = document.createElement("div");
  gridEl.id = "shop-panel-grid";
  // MTGA風の横スクロール帯（ユーザー要望2026-08-08）。PCでは縦ホイールを横スクロールへ変換して
  // 直感的に流せるようにする（横方向にはみ出している時だけ。タッチは横スワイプでそのまま動く）。
  gridEl.addEventListener(
    "wheel",
    (e) => {
      if (e.deltaY === 0 || e.deltaX !== 0) return; // 元々横入力（トラックパッド等）はそのまま
      if (gridEl.scrollWidth <= gridEl.clientWidth) return; // 横に溢れていなければ何もしない
      gridEl.scrollLeft += e.deltaY;
      e.preventDefault();
    },
    { passive: false }
  );
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
  panelEl.style.display = "flex";
  // ユーザー報告2026-08-08「ショップで画面上端の黒帯（オプションエリア）が見えない」。ショップは
  // z-index:2601でオプションエリア(通常900/全画面ページ時1600)を覆うため、開いている間だけ
  // オプションエリアをショップより前面へ引き上げる（style.cssの body.shop-open #option-area 参照）。
  document.body.classList.add("shop-open");
}

export function initShop() {
  panelEl = buildPanel();
  panelEl.style.display = "none";
  document.body.appendChild(panelEl);
}
