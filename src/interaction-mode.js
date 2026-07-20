// タブレット等のタッチ操作向け「駒/カード 一時グレー表示」トグルボタン。誤操作防止のため、
// カードだけ触りたい時は駒を、駒だけ触りたい時はカードを、それぞれ一時的にグレー表示＋
// タップ操作不可にできる。マウス操作が前提のPCでは誤操作の心配が薄く、画面も窮屈になる
// だけのため、タッチ主体の端末（"hover:none かつ pointer:coarse" — ホバーできず入力精度が
// 粗い、タブレット/スマホの標準的な検知方法。トラックパッド付きノートPC等は
// hover:hover/pointer:fineのまま検知されないため対象外になる）でのみボタン自体を表示する。
//
// クリックのたびに以下の4状態を巡回する:
//   normal（通常、駒アイコン表示） → pieces-hidden（駒グレー表示中、同じ駒アイコンが発光）
//   → cards-normal（通常に戻り、カードアイコン表示） → cards-hidden（カードグレー表示中、
//   カードアイコンが発光） → normal に戻る
// 実際にグレー表示/操作不可にする処理自体はCSS側（body.pieces-interaction-hidden /
// body.cards-interaction-hidden、style.css参照）に任せ、このモジュールはbodyクラスの
// 付け外しとボタンの見た目更新だけを行う。

import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";

const STATES = ["normal", "pieces-hidden", "cards-normal", "cards-hidden"];

const TOOLTIP_BY_STATE = {
  normal: "駒を一時的にグレー表示にして操作できなくします（カードだけ触りたい時に）",
  "pieces-hidden": "タップすると駒を元に戻します",
  "cards-normal": "カードを一時的にグレー表示にして操作できなくします（駒だけ触りたい時に）",
  "cards-hidden": "タップするとカードを元に戻します",
};

const TOUCH_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

let state = "normal";
let btnEl = null;
let iconImgEl = null;
let tooltipEl = null;

function isTouchPrimaryDevice() {
  return window.matchMedia(TOUCH_MEDIA_QUERY).matches;
}

function applyBodyClasses() {
  document.body.classList.toggle("pieces-interaction-hidden", state === "pieces-hidden");
  document.body.classList.toggle("cards-interaction-hidden", state === "cards-hidden");
}

function updateButton() {
  if (!btnEl) return;
  const showingPieceIcon = state === "normal" || state === "pieces-hidden";
  const glowing = state === "pieces-hidden" || state === "cards-hidden";
  btnEl.classList.toggle("is-glowing", glowing);
  if (iconImgEl) iconImgEl.src = showingPieceIcon ? "assets/icons/piece-transparency.svg" : "assets/icons/card-transparency.svg";
  if (tooltipEl) tooltipEl.textContent = TOOLTIP_BY_STATE[state];
}

function advance() {
  const idx = STATES.indexOf(state);
  state = STATES[(idx + 1) % STATES.length];
  applyBodyClasses();
  updateButton();
}

function updateVisibility() {
  if (!btnEl) return;
  btnEl.style.display = isTouchPrimaryDevice() ? "" : "none";
}

export function initInteractionModeToggle() {
  btnEl = document.createElement("button");
  btnEl.id = "interaction-mode-button";
  const { captionEl, tooltipEl: tEl } = buildIconButtonContent(btnEl, {
    icon: "assets/icons/piece-transparency.svg",
    tooltip: TOOLTIP_BY_STATE.normal,
  });
  tooltipEl = tEl;
  iconImgEl = btnEl.querySelector(".icon-action-button-icon-img");
  captionEl.textContent = "誤操作防止";
  wireIconButtonClick(btnEl, {
    detailTitle: "誤操作防止（駒/カードのグレー表示）",
    detailParagraphs: [
      "タブレット等での誤操作を防ぐためのボタンです。押すたびに「駒をグレー表示にして操作できなくする」→「元に戻してカードをグレー表示にする」→「通常に戻る」の順に切り替わります。",
      "カードだけを触りたい時は駒を、駒だけを触りたい時はカードを、それぞれ一時的にグレー表示＋タップ無効にできます。アイコンが光っている間がグレー表示中です。",
    ],
    onAction: advance,
  });
  document.body.appendChild(btnEl);
  updateButton();
  updateVisibility();

  // マウスの接続/切断等でポインタ種別が動的に変わる場合にも表示/非表示を追従させる。
  const mql = window.matchMedia(TOUCH_MEDIA_QUERY);
  if (mql.addEventListener) mql.addEventListener("change", updateVisibility);
  else if (mql.addListener) mql.addListener(updateVisibility);
}
