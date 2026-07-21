// タブレット等のタッチ操作向け「駒/カード 一時グレー表示」トグルボタン。誤操作防止のため、
// カードだけ触りたい時は駒を、駒だけ触りたい時はカードを、それぞれ一時的にグレー表示＋
// タップ操作不可にできる。マウス操作が前提のPCでは誤操作の心配が薄く、画面も窮屈になる
// だけのため、タッチ主体の端末（"hover:none かつ pointer:coarse" — device-detect.js参照）
// でのみボタン自体を表示する。
//
// 以前は1つのボタンが4状態（通常→駒グレー→通常（カードアイコン）→カードグレー→通常）を
// 巡回する仕組みだったが、「駒消し」「カード消し」を分かりやすく独立したボタンに分けたい
// という要望を受け、2つの独立したトグルボタンに作り直した。ユーザーの指定により、
// 同時に両方ONにはできない（片方をONにすると、もう片方は自動的にOFFになる）——駒と
// カードが両方グレー表示になって盤面に触れなくなる事故を防ぐため。
// 実際にグレー表示/操作不可にする処理自体はCSS側（body.pieces-interaction-hidden /
// body.cards-interaction-hidden、style.css参照、旧実装と同じクラス名をそのまま使う）に
// 任せ、このモジュールはbodyクラスの付け外しとボタンの見た目更新だけを行う。

import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { isTouchPrimaryDevice, TOUCH_MEDIA_QUERY } from "./device-detect.js";

let piecesHidden = false;
let cardsHidden = false;

let pieceBtnEl = null;
let pieceTooltipEl = null;
let cardBtnEl = null;
let cardTooltipEl = null;

const PIECE_TOOLTIP = {
  off: "駒を一時的にグレー表示にして操作できなくします（カードだけ触りたい時に）",
  on: "タップすると駒を元に戻します",
};
const CARD_TOOLTIP = {
  off: "カードを一時的にグレー表示にして操作できなくします（駒だけ触りたい時に）",
  on: "タップするとカードを元に戻します",
};

function applyBodyClasses() {
  document.body.classList.toggle("pieces-interaction-hidden", piecesHidden);
  document.body.classList.toggle("cards-interaction-hidden", cardsHidden);
}

function updateButtons() {
  if (pieceBtnEl) {
    pieceBtnEl.classList.toggle("is-glowing", piecesHidden);
    pieceTooltipEl.textContent = piecesHidden ? PIECE_TOOLTIP.on : PIECE_TOOLTIP.off;
  }
  if (cardBtnEl) {
    cardBtnEl.classList.toggle("is-glowing", cardsHidden);
    cardTooltipEl.textContent = cardsHidden ? CARD_TOOLTIP.on : CARD_TOOLTIP.off;
  }
}

function togglePieces() {
  piecesHidden = !piecesHidden;
  if (piecesHidden) cardsHidden = false; // 同時ONは禁止（ユーザー指定）
  applyBodyClasses();
  updateButtons();
}

function toggleCards() {
  cardsHidden = !cardsHidden;
  if (cardsHidden) piecesHidden = false;
  applyBodyClasses();
  updateButtons();
}

function updateVisibility() {
  const visible = isTouchPrimaryDevice();
  if (pieceBtnEl) pieceBtnEl.style.display = visible ? "" : "none";
  if (cardBtnEl) cardBtnEl.style.display = visible ? "" : "none";
}

export function initInteractionModeToggle() {
  pieceBtnEl = document.createElement("button");
  pieceBtnEl.id = "piece-hide-button";
  const { captionEl: pieceCaption, tooltipEl: pTooltip } = buildIconButtonContent(pieceBtnEl, {
    icon: "assets/icons/piece-transparency.svg",
    tooltip: PIECE_TOOLTIP.off,
  });
  pieceTooltipEl = pTooltip;
  pieceCaption.textContent = "駒消し";
  wireIconButtonClick(pieceBtnEl, {
    detailTitle: "駒消し（誤操作防止）",
    detailParagraphs: [
      "タブレット等での誤操作を防ぐためのボタンです。押すと駒を一時的にグレー表示にして操作できなくします（カードだけ触りたい時に）。もう一度押すと元に戻ります。",
      "「カード消し」と同時にはONにできません（両方ONにすると盤面に何も触れなくなってしまうため）。",
    ],
    onAction: togglePieces,
  });
  document.body.appendChild(pieceBtnEl);

  cardBtnEl = document.createElement("button");
  cardBtnEl.id = "card-hide-button";
  const { captionEl: cardCaption, tooltipEl: cTooltip } = buildIconButtonContent(cardBtnEl, {
    icon: "assets/icons/card-transparency.svg",
    tooltip: CARD_TOOLTIP.off,
  });
  cardTooltipEl = cTooltip;
  cardCaption.textContent = "カード消し";
  wireIconButtonClick(cardBtnEl, {
    detailTitle: "カード消し（誤操作防止）",
    detailParagraphs: [
      "タブレット等での誤操作を防ぐためのボタンです。押すとカードを一時的にグレー表示にして操作できなくします（駒だけ触りたい時に）。もう一度押すと元に戻ります。",
      "「駒消し」と同時にはONにできません（両方ONにすると盤面に何も触れなくなってしまうため）。",
    ],
    onAction: toggleCards,
  });
  document.body.appendChild(cardBtnEl);

  updateButtons();
  updateVisibility();

  // マウスの接続/切断等でポインタ種別が動的に変わる場合にも表示/非表示を追従させる。
  const mql = window.matchMedia(TOUCH_MEDIA_QUERY);
  if (mql.addEventListener) mql.addEventListener("change", updateVisibility);
  else if (mql.addListener) mql.addListener(updateVisibility);
}
