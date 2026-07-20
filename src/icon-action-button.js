// アイコン+キャプション形式のボタンで共通する部品。
// アイコン部分をクリックすると本来の操作を実行し、アイコンにカーソルを重ねると簡易説明
// （ホバーツールチップ）、キャプション文字をクリックすると詳細説明のモーダルが開く
// （フェイズ案内板・優先権譲渡と同じ「ホバー=簡易、クリック=詳細」パターンを踏襲し、
// CSSクラスもphase-guide-tooltip/phase-guide-modal-*を共用する）。
//
// 呼び出し側の既存の<button id="...">要素はそのまま（id・disabled・player-buttons.jsの
// ドラッグ/ショートカット機構）に一切手を入れず、中身（innerHTML）と1つのclickリスナーだけを
// このモジュールに差し替えてもらう設計。キャプション文字列は動的に変わるボタン（盤面拡大・
// ターン終了）もあるため、後から書き換えられるようcaptionEl参照を返す。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

let modalBackdrop = null;
let modalEl = null;
let modalTitleEl = null;
let modalBodyEl = null;

function closeIconDetailModal() {
  if (modalBackdrop) modalBackdrop.style.display = "none";
  if (modalEl) modalEl.style.display = "none";
}

function ensureModal() {
  if (modalEl) return;
  modalBackdrop = createBackdrop(closeIconDetailModal, { dim: true, zIndex: 10100 });
  modalBackdrop.style.display = "none";

  modalEl = document.createElement("div");
  modalEl.id = "icon-action-detail-modal";
  modalEl.style.display = "none";
  modalEl.appendChild(createModalCloseX(closeIconDetailModal));

  modalTitleEl = document.createElement("div");
  modalTitleEl.className = "phase-guide-modal-title";
  modalEl.appendChild(modalTitleEl);

  modalBodyEl = document.createElement("div");
  modalBodyEl.className = "phase-guide-modal-body";
  modalEl.appendChild(modalBodyEl);

  document.body.appendChild(modalBackdrop);
  document.body.appendChild(modalEl);
}

export function openIconDetailModal(title, paragraphs) {
  ensureModal();
  modalTitleEl.textContent = title;
  modalBodyEl.innerHTML = "";
  for (const paragraph of paragraphs) {
    const p = document.createElement("p");
    p.style.cssText = "margin: 0 0 0.6rem 0; line-height: 1.6;";
    p.textContent = paragraph;
    modalBodyEl.appendChild(p);
  }
  modalBackdrop.style.display = "block";
  modalEl.style.display = "block";
}

// btn（既存の<button>要素）の中身を、アイコン+キャプションのDOM構造に差し替える。
// 戻り値のcaptionEl/tooltipElに後からtextContentを設定すれば、キャプション文字・ホバー説明を
// 動的に更新できる（例: ターン終了ボタンは「今誰の番か」に応じてtooltipの文言が変わる）。
export function buildIconButtonContent(btn, { icon, tooltip }) {
  btn.classList.add("icon-action-button");
  btn.innerHTML = "";

  const iconWrap = document.createElement("span");
  iconWrap.className = "icon-action-button-icon-wrap";
  const img = document.createElement("img");
  img.className = "icon-action-button-icon-img";
  img.src = icon;
  img.alt = "";
  iconWrap.appendChild(img);
  const tooltipEl = document.createElement("span");
  tooltipEl.className = "phase-guide-tooltip";
  tooltipEl.textContent = tooltip ?? "";
  iconWrap.appendChild(tooltipEl);
  btn.appendChild(iconWrap);

  const captionEl = document.createElement("span");
  captionEl.className = "icon-action-button-caption";
  btn.appendChild(captionEl);

  return { captionEl, tooltipEl };
}

// btnのclickリスナーを1つだけ登録する。キャプション文字（.icon-action-button-caption）への
// クリックは詳細モーダルを開くだけにし、それ以外（アイコン等）へのクリックは本来の操作
// (onAction)を実行する。ショートカットキー経由のbtn.click()はtarget=btn自身になるため
// 常にonAction側に分類される。
export function wireIconButtonClick(btn, { detailTitle, detailParagraphs, onAction }) {
  btn.addEventListener("click", (e) => {
    if (e.target.closest(".icon-action-button-caption")) {
      e.stopPropagation();
      openIconDetailModal(detailTitle, detailParagraphs);
      return;
    }
    onAction(e);
  });
}
