// プレイマットの選択。画像素材/プレイマット/配下に複数色（白・黒＋ゲームの7色テーマ）が
// 用意されたため、セットアップウィザードの手順0、および左下の自分専用ステータスエリア
// （main.jsのプレイマットアイコン）から選べるようにする（デフォルトは白）。他の実物画像
// 素材と同じ理由でgit管理外（.gitignoreの/assets/playmats/参照）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

export const PLAYMAT_OPTIONS = [
  { id: "white", label: "白", path: "assets/playmats/white.png" },
  { id: "black", label: "黒", path: "assets/playmats/black.png" },
  { id: "red", label: "赤", path: "assets/playmats/red.png" },
  { id: "orange", label: "橙", path: "assets/playmats/orange.png" },
  { id: "yellow", label: "黄", path: "assets/playmats/yellow.png" },
  { id: "green", label: "緑", path: "assets/playmats/green.png" },
  { id: "blue", label: "青", path: "assets/playmats/blue.png" },
  { id: "pink", label: "桃", path: "assets/playmats/pink.png" },
  { id: "purple", label: "紫", path: "assets/playmats/purple.png" },
  { id: "white-old", label: "白（旧）", path: "assets/playmats/white-old.png" },
  { id: "blue-old", label: "青（旧）", path: "assets/playmats/blue-old.png" },
];

let selectedPlaymatId = "white";

export function getSelectedPlaymatId() {
  return selectedPlaymatId;
}

export function setSelectedPlaymatId(id) {
  if (PLAYMAT_OPTIONS.some((p) => p.id === id)) selectedPlaymatId = id;
}

export function getSelectedPlaymatPath() {
  return PLAYMAT_OPTIONS.find((p) => p.id === selectedPlaymatId).path;
}

// setup-animation.js/card-back-skins.js等と同じ「main.jsから自分のrenderを注入してもらう」
// 循環import回避パターン。ピッカーで選び直した直後に盤面へ即反映するためだけに使う。
let helpers = null; // { render }
export function registerPlaymatHelpers(h) {
  helpers = h;
}

// 左下の自分専用ステータスエリアからいつでも選び直せるピッカー（card-back-skins.jsの
// openCardBackSkinPicker()と同じ見た目・構造）。プレイマットは全プレイヤーに反映される
// 見た目（盤面そのものの背景画像）のため、駒スキン等とは異なりオンライン同期の対象に
// なりうるが、今回はまずローカルの見た目切り替えのみ実装する。
export function openPlaymatPicker() {
  const modal = document.createElement("div");
  modal.id = "playmat-picker-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "プレイマットを選択";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid";
  for (const option of PLAYMAT_OPTIONS) {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch";
    if (selectedPlaymatId === option.id) swatch.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = option.path;
    img.alt = option.label;
    swatch.appendChild(img);
    swatch.addEventListener("click", () => {
      selectedPlaymatId = option.id;
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
