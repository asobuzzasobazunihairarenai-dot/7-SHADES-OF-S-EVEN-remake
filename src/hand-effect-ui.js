// 手札効果の自動処理まわりのUI部品2つ。
// ①showHandEffectUseModal: 「このカードを使用します」の告知モーダル（ユーザー要望
//   「手札効果を使用したら、このカードが使用されるよ！って知らしめるモーダルをしっかりと
//   出したい」への対応）。card-arrival.jsのshowCardArrivalModalと同じ「使い捨てDOM要素、
//   数秒で自動的に消える」パターンだが、ラベルが「到達」ではなく「使用」になる。
// ②showHandEffectOptionPicker: 選択肢が2つ以上ある手札効果（なないろの欠片等）で、
//   どれを使うか選ばせるモーダル（ユーザー要望「効果選択モーダルを出してください。
//   使用できない方はグレー表示。」）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { createModalCloseX } from "./ui-helpers.js";

let currentUseModal = null;
let currentUseModalTimer = null;

const USE_MODAL_DURATION_MS = 2200;

export function showHandEffectUseModal(cardId, optionLabel) {
  if (currentUseModal) {
    clearTimeout(currentUseModalTimer);
    currentUseModal.remove();
    currentUseModal = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "hand-effect-use-modal";

  function dismiss() {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
      if (currentUseModal === modal) currentUseModal = null;
    }, 300);
  }

  const label = document.createElement("div");
  label.className = "hand-effect-use-modal-label";
  label.textContent = "使用";
  modal.appendChild(label);

  const img = document.createElement("img");
  img.src = getCardImagePath(cardId);
  img.alt = def?.name ?? cardId;
  modal.appendChild(img);

  const nameEl = document.createElement("div");
  nameEl.className = "hand-effect-use-modal-name";
  nameEl.textContent = optionLabel ? `${def?.name ?? cardId}（${optionLabel}）` : (def?.name ?? cardId);
  modal.appendChild(nameEl);

  modal.appendChild(createModalCloseX(dismiss));
  modal.addEventListener("click", dismiss);

  document.body.appendChild(modal);
  currentUseModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  currentUseModalTimer = setTimeout(dismiss, USE_MODAL_DURATION_MS);
}

// optionsWithUsability: [{ id, label, usable, ... }]。選ばれたoptionを解決するPromiseを返す
// （閉じるボタン・背景クリックではnullを解決する）。
export function showHandEffectOptionPicker(cardId, optionsWithUsability) {
  return new Promise((resolve) => {
    const def = getCardDefinition(cardId);
    const backdrop = document.createElement("div");
    backdrop.className = "hand-effect-option-picker-backdrop";
    const modal = document.createElement("div");
    modal.className = "hand-effect-option-picker";

    let settled = false;
    function finish(option) {
      if (settled) return;
      settled = true;
      backdrop.remove();
      modal.remove();
      resolve(option ?? null);
    }

    const titleEl = document.createElement("div");
    titleEl.className = "hand-effect-option-picker-title";
    titleEl.textContent = `${def?.name ?? cardId} の効果を選択してください`;
    modal.appendChild(titleEl);

    const img = document.createElement("img");
    img.className = "hand-effect-option-picker-img";
    img.src = getCardImagePath(cardId);
    img.alt = def?.name ?? cardId;
    modal.appendChild(img);

    const list = document.createElement("div");
    list.className = "hand-effect-option-picker-list";
    for (const option of optionsWithUsability) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hand-effect-option-picker-btn";
      btn.textContent = option.label ?? option.id;
      if (!option.usable) {
        btn.disabled = true;
        btn.classList.add("is-unusable");
      } else {
        btn.addEventListener("click", () => finish(option));
      }
      list.appendChild(btn);
    }
    modal.appendChild(list);

    modal.appendChild(createModalCloseX(() => finish(null)));
    backdrop.addEventListener("click", () => finish(null));

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      backdrop.classList.add("show");
      modal.classList.add("show");
    });
  });
}
