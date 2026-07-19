// 駒がカードの上に乗った（到達した）ことを知らせる、画面中央に大きく表示される一時的な
// モーダル。カードが裏向きだった場合は先に自動でオープンしてから呼ばれる
// （main.jsのmaybeTriggerCardArrival/onDragEnd、および手動でのダブルクリックオープン時も参照）。
// 数秒で自動的に消える。サイズ・表示時間は管理者モードの「カード到達モーダル」グループで
// 調整できる（--card-arrival-modal-size・--card-arrival-modal-duration）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";

function getDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--card-arrival-modal-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 3 : seconds) * 1000;
}

let currentModal = null;
let currentTimer = null;

export function showCardArrivalModal(cardId) {
  // 短時間で連続して別のカードに到達した場合、前のモーダルを消して最新のものだけ表示する。
  if (currentModal) {
    clearTimeout(currentTimer);
    currentModal.remove();
    currentModal = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "card-arrival-modal";
  const img = document.createElement("img");
  img.src = getCardImagePath(cardId);
  img.alt = def.name;
  modal.appendChild(img);
  document.body.appendChild(modal);
  currentModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  currentTimer = setTimeout(() => {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
      if (currentModal === modal) currentModal = null;
    }, 300);
  }, getDurationMs());
}
