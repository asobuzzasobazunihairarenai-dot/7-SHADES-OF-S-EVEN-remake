// 駒がカードの上に乗った（到達した）ことを知らせる、画面右上に固定表示される一時的な
// モーダル。カードが裏向きだった場合は先に自動でオープンしてから呼ばれる
// （main.jsのmaybeTriggerCardArrival/onDragEnd、および手動でのダブルクリックオープン時も参照）。
// 数秒で自動的に消える。サイズ・表示時間は管理者モードの「カード到達モーダル」グループで
// 調整できる（--card-arrival-modal-size・--card-arrival-modal-duration）。
// 中央ではなく右上に固定表示しているのは、モーダル表示中も盤面上の「駒がそのカードに
// 乗っている姿」を隠さずに見えるようにするため。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { createModalCloseX } from "./ui-helpers.js";

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

  function dismiss() {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
      if (currentModal === modal) currentModal = null;
    }, 300);
  }

  const label = document.createElement("div");
  label.className = "card-arrival-modal-label";
  label.textContent = "到達";
  modal.appendChild(label);

  const img = document.createElement("img");
  img.src = getCardImagePath(cardId);
  img.alt = def.name;
  modal.appendChild(img);

  // 自動で消えるのを止めて、手動で✕を押すまで表示し続けられるようにするボタン。
  const pinBtn = document.createElement("button");
  pinBtn.className = "card-arrival-modal-pin";
  pinBtn.textContent = "📌 消えないようにする";
  pinBtn.addEventListener("click", () => {
    clearTimeout(currentTimer);
    pinBtn.remove(); // 止めた後はこのボタン自体は不要（✕でいつでも閉じられる）
  });
  modal.appendChild(pinBtn);

  modal.appendChild(createModalCloseX(dismiss));

  document.body.appendChild(modal);
  currentModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  currentTimer = setTimeout(dismiss, getDurationMs());
}
