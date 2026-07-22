// プレイマットの選択。画像素材/プレイマット/配下に複数色（白・黒＋ゲームの7色テーマ）が
// 用意されたため、セットアップウィザードの手順0、および左下の自分専用ステータスエリア
// （main.jsのプレイマットアイコン）から選べるようにする（デフォルトは白）。他の実物画像
// 素材と同じ理由でgit管理外（.gitignoreの/assets/playmats/参照）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

export const PLAYMAT_OPTIONS = [
  { id: "white", label: "白", path: "assets/playmats/white.webp" },
  { id: "black", label: "黒", path: "assets/playmats/black.webp" },
  { id: "red", label: "赤", path: "assets/playmats/red.webp" },
  { id: "orange", label: "橙", path: "assets/playmats/orange.webp" },
  { id: "yellow", label: "黄", path: "assets/playmats/yellow.webp" },
  { id: "green", label: "緑", path: "assets/playmats/green.webp" },
  { id: "blue", label: "青", path: "assets/playmats/blue.webp" },
  { id: "pink", label: "桃", path: "assets/playmats/pink.webp" },
  { id: "purple", label: "紫", path: "assets/playmats/purple.webp" },
  { id: "white-old", label: "白（旧）", path: "assets/playmats/white-old.webp" },
  { id: "blue-old", label: "青（旧）", path: "assets/playmats/blue-old.webp" },
  // 「古」バリエーション（9色分、既存の「旧」とは別デザイン）。
  { id: "red-aged", label: "赤（古）", path: "assets/playmats/red-aged.webp" },
  { id: "orange-aged", label: "橙（古）", path: "assets/playmats/orange-aged.webp" },
  { id: "yellow-aged", label: "黄（古）", path: "assets/playmats/yellow-aged.webp" },
  { id: "green-aged", label: "緑（古）", path: "assets/playmats/green-aged.webp" },
  { id: "blue-aged", label: "青（古）", path: "assets/playmats/blue-aged.webp" },
  { id: "pink-aged", label: "桃（古）", path: "assets/playmats/pink-aged.webp" },
  { id: "purple-aged", label: "紫（古）", path: "assets/playmats/purple-aged.webp" },
  { id: "white-aged", label: "白（古）", path: "assets/playmats/white-aged.webp" },
  { id: "black-aged", label: "黒（古）", path: "assets/playmats/black-aged.webp" },
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
