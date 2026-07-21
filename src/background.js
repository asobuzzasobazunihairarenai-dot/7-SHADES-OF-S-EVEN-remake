// 背景画像の選択。画像素材/背景/配下に複数種類（現在3種）が用意されたため、プレイマットと
// 同じ「左下の自分専用ステータスエリアのアイコンから選べる」方式にする。他の実物画像素材と
// 同じ理由でgit管理外（.gitignoreの/assets/backgrounds/参照）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

export const BACKGROUND_OPTIONS = [
  { id: "1", label: "背景1", path: "assets/backgrounds/1.webp" },
  { id: "2", label: "背景2", path: "assets/backgrounds/2.webp" },
  { id: "3", label: "背景3", path: "assets/backgrounds/3.webp" },
];

let selectedBackgroundId = "1";

export function getSelectedBackgroundPath() {
  return BACKGROUND_OPTIONS.find((b) => b.id === selectedBackgroundId).path;
}

// setup-animation.js/playmat.js等と同じ「main.jsから自分のrenderを注入してもらう」
// 循環import回避パターン。ピッカーで選び直した直後に盤面へ即反映するためだけに使う。
let helpers = null; // { render }
export function registerBackgroundHelpers(h) {
  helpers = h;
}

// 左下の自分専用ステータスエリアからいつでも選び直せるピッカー（playmat.jsの
// openPlaymatPicker()と同じ見た目・構造）。プレイマットと同じく全プレイヤーに反映される
// 見た目（盤面の背景そのもの）だが、まずはローカルの見た目切り替えのみ実装する。
export function openBackgroundPicker() {
  const modal = document.createElement("div");
  modal.id = "background-picker-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "背景画像を選択";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid";
  for (const option of BACKGROUND_OPTIONS) {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch";
    if (selectedBackgroundId === option.id) swatch.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = option.path;
    img.alt = option.label;
    swatch.appendChild(img);
    swatch.addEventListener("click", () => {
      selectedBackgroundId = option.id;
      helpers?.render();
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
