// ゲーム内通貨の所持金額表示（ユーザー要望「ヘルプボタンの横に通貨アイコンと所持金額を
// 表示させたい」）。#help-button・#my-page-button・#options-menu-buttonと同じ並びの
// さらに左隣（画面右上）に置く常設ウィジェット。未ログイン・ローカルモードでは通貨自体が
// 存在しない（アカウントに紐づく残高のため）ので0のまま表示する。クリックするとショップ
// （shop.js）が開く（online.jsのopenShop経由、main.jsが実際の関数を注入する）。

import { getCachedUser, getMyCurrencyBalance, openShop } from "./online.js";

let amountEl = null;

export function initCurrencyDisplay() {
  const el = document.createElement("button");
  el.type = "button";
  el.id = "currency-display";
  el.title = "ショップを開きます";
  el.addEventListener("click", () => openShop());

  // ユーザーが格納した専用アイコン（画像素材/アイコン/通貨.png）を使う。絵文字🪙は
  // フォールバックとして残さず、この画像に一本化した。
  const icon = document.createElement("img");
  icon.id = "currency-display-icon";
  icon.src = "assets/icons/currency.png";
  icon.alt = "";
  el.appendChild(icon);

  amountEl = document.createElement("span");
  amountEl.id = "currency-display-amount";
  amountEl.textContent = "0";
  el.appendChild(amountEl);

  document.body.appendChild(el);
}

// 対局終了時の付与(online.jsのawardMatchCurrency)・shop.jsでの購入の後など、残高が
// 変わり得るタイミングで呼び直す。ログイン状態が変わった時（online.jsのonAuthChange）にも
// main.js側から呼ばれる。
export async function refreshCurrencyDisplay() {
  if (!amountEl) return;
  const user = getCachedUser();
  if (!user) {
    amountEl.textContent = "0";
    return;
  }
  const balance = await getMyCurrencyBalance();
  amountEl.textContent = String(balance);
}
