// ゲーム内通貨の所持金額表示（ユーザー要望「ヘルプボタンの横に通貨アイコンと所持金額を
// 表示させたい」）。#help-button・#my-page-button・#options-menu-buttonと同じ並びの
// さらに左隣（画面右上）に置く常設ウィジェット。未ログイン・ローカルモードでは通貨自体が
// 存在しない（アカウントに紐づく残高のため）ので0のまま表示する。
// ユーザー要望「所持金表示のアイコンをクリックすると『ショップ』『所持金について』の
// 二つのプルダウンが出るようにしてほしい」への対応で、クリック時に直接ショップ
// （shop.js、online.jsのopenShop経由）を開くのをやめ、小さな2択メニューを出すように
// した。「所持金について」はお金がどんな時にもらえるかの説明パネルを開く。

import { getCachedUser, getMyCurrencyBalance, openShop } from "./online.js";
import { getOptionArea } from "./option-area.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { toStageLocalRect, STAGE_WIDTH } from "./main.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

let amountEl = null;
let displayButtonEl = null;

export function initCurrencyDisplay() {
  const el = document.createElement("button");
  el.type = "button";
  el.id = "currency-display";
  el.title = t("cur.iconTip");
  el.addEventListener("click", () => toggleCurrencyMenu(el));
  displayButtonEl = el;

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

  getOptionArea().appendChild(el);
}

// クリックのたびに開閉をトグルする小さな2択メニュー（「常駐ツールパネル向け」の
// 非ディム背景クリックで閉じる、ui-helpers.jsのcreateBackdrop dim:false）。
let currentMenu = null;
let currentMenuBackdrop = null;
function closeCurrencyMenu() {
  currentMenu?.remove();
  currentMenuBackdrop?.remove();
  currentMenu = null;
  currentMenuBackdrop = null;
}
function toggleCurrencyMenu(anchorEl) {
  if (currentMenu) {
    closeCurrencyMenu();
    return;
  }
  // ユーザー報告「出てくるボタンが所持金アイコンのすぐ下ではなく、大きく離れた
  // 位置に出る」の原因: #currency-dropdown-menuはposition:fixedでdocument.body
  // 直下に置かれるが、bodyにはステージの拡大縮小transform（applyViewportStage、
  // main.js）がかかっており、CSSの仕様上これがposition:fixed/absoluteな子孫の
  // 新しい基準（containing block）になる。そのためgetBoundingClientRect()が返す
  // 生の実画面ピクセルをそのままtop/rightに使うと、実際にはステージのローカル
  // 座標系（1600x900固定の仮想解像度）の値として再解釈されてしまい、実際の位置と
  // ズレる（cursor-position機能やturn-timer.jsの警告バッジ位置決めで既に踏んでいた
  // のと同じ「position:fixedな子孫はステージのローカル座標に変換してから使う」問題）。
  const rect = toStageLocalRect(anchorEl.getBoundingClientRect());
  const backdrop = createBackdrop(closeCurrencyMenu, { dim: false, zIndex: 9500 });
  const menu = document.createElement("div");
  menu.id = "currency-dropdown-menu";
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.right = `${STAGE_WIDTH - rect.right}px`;

  const shopBtn = document.createElement("button");
  shopBtn.type = "button";
  shopBtn.textContent = t("cur.shop");
  shopBtn.addEventListener("click", () => {
    closeCurrencyMenu();
    openShop();
  });
  menu.appendChild(shopBtn);

  const aboutBtn = document.createElement("button");
  aboutBtn.type = "button";
  aboutBtn.textContent = t("cur.about");
  aboutBtn.addEventListener("click", () => {
    closeCurrencyMenu();
    showCurrencyAboutPanel();
  });
  menu.appendChild(aboutBtn);

  document.body.appendChild(backdrop);
  document.body.appendChild(menu);
  currentMenu = menu;
  currentMenuBackdrop = backdrop;
}

// 「所持金について」——お金がどんな時にもらえるかの説明。実際の金額は
// supabase_setup_so7.sqlのso7_award_match_currency/so7_claim_daily_login_bonusの
// デフォルト値（呼び出し側であるonline.jsのawardMatchCurrency/claimDailyLoginBonus
// はどちらも金額を明示せずデフォルトのまま呼んでいるため、実際に適用される値と一致）
// をそのまま案内文に反映している。金額を変えたら、ここも一緒に直すこと。
function showCurrencyAboutPanel() {
  const backdrop = createBackdrop(close, { dim: true, zIndex: 9600 });
  const panel = document.createElement("div");
  panel.id = "currency-about-panel";
  function close() {
    backdrop.remove();
    panel.remove();
  }
  const title = document.createElement("div");
  title.className = "currency-about-title";
  title.textContent = t("cur.aboutTitle");
  panel.appendChild(title);

  const list = document.createElement("ul");
  list.className = "currency-about-list";
  const items = [
    t("cur.about1"),
    t("cur.about2"),
    t("cur.about3"),
  ];
  for (const text of items) {
    const li = document.createElement("li");
    li.textContent = text;
    list.appendChild(li);
  }
  panel.appendChild(list);

  panel.appendChild(createModalCloseX(close));
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
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

// ユーザー要望「対戦終了時にお金がもらえる演出を追加したい」への対応。通貨アイコンを
// 一瞬光らせる(is-pulsing、transformではなくfilterで表現——#currency-display自体は
// 位置調整用のtransformを既に持っているため、同じプロパティを2箇所から操作すると
// 後勝ちで上書きされてしまう。他の演出でも使っている教訓)のと、「+N」の文字が
// アイコンから浮かび上がって消えていく演出を同時に行う。victory.jsのcheckForVictory()
// から、online.jsのawardMatchCurrency()が返した「自分が実際に受け取った額」が
// 1以上の時だけ呼ばれる。
export function showCurrencyAwardEffect(amount) {
  const el = document.getElementById("currency-display");
  if (!el || amount <= 0) return;

  el.classList.remove("is-pulsing");
  void el.offsetWidth; // 同じアニメーションを連続で再生できるよう、一度リフローを挟んで再スタートさせる
  el.classList.add("is-pulsing");
  setTimeout(() => el.classList.remove("is-pulsing"), 900);

  const rect = el.getBoundingClientRect();
  const floatEl = document.createElement("div");
  floatEl.className = "currency-award-float";
  floatEl.textContent = `+${amount}`;
  floatEl.style.left = `${rect.left + rect.width / 2}px`;
  floatEl.style.top = `${rect.top}px`;
  document.body.appendChild(floatEl);
  setTimeout(() => floatEl.remove(), 1700);
}
