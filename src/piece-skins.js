// 駒スキン選択: 色ごとに使うスキンのバリエーション（0=標準、1〜3=画像素材/駒スキン追加の
// 追加セット）を保持し、いつでも自由に変更できるようにする。駒の色自体はファーストカードで
// 固定なので、選べるのは「自分の駒と同じ色の中のスキンバリエーション」だけ
// （色が変わるわけではない）。選択は色ごとに保持するため、対戦を通して座席の色が変わっても
// 同じ色なら同じスキンが使われる。

import { getState } from "./state.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

const SKIN_VARIANTS = [0, 1, 2, 3]; // 0=標準（assets/pieces/${color}.png）

let skinIndexByColor = {};

export function getSkinImagePath(color) {
  const idx = skinIndexByColor[color] || 0;
  return idx === 0 ? `assets/pieces/${color}.png` : `assets/pieces/${color}-${idx}.png`;
}

function myPieceColor() {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === "A");
  return piece ? piece.color : null;
}

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

function openPicker() {
  const color = myPieceColor();
  if (!color) return;

  const modal = document.createElement("div");
  modal.id = "piece-skin-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "駒スキンを選択";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid";
  for (const idx of SKIN_VARIANTS) {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch";
    if ((skinIndexByColor[color] || 0) === idx) swatch.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = idx === 0 ? `assets/pieces/${color}.png` : `assets/pieces/${color}-${idx}.png`;
    img.alt = idx === 0 ? "標準" : `追加${idx}`;
    swatch.appendChild(img);
    swatch.addEventListener("click", () => {
      skinIndexByColor[color] = idx;
      notifyChange();
      close();
    });
    grid.appendChild(swatch);
  }

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(grid);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

let toggleBtnEl = null;

function buildToggleButton() {
  const btn = document.createElement("button");
  btn.id = "piece-skin-button";
  btn.textContent = "🎨 駒スキン";
  btn.addEventListener("click", openPicker);
  document.body.appendChild(btn);
  return btn;
}

// 自分の駒がまだ無い（セットアップ未実施）間は非表示にする。render()の度に呼んでもらう。
export function updatePieceSkinButton() {
  if (!toggleBtnEl) return;
  toggleBtnEl.style.display = myPieceColor() ? "block" : "none";
}

export function initPieceSkins() {
  toggleBtnEl = buildToggleButton();
}
