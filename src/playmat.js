// プレイマットの選択。画像素材/プレイマット/配下に複数色（白・黒＋ゲームの7色テーマ）が
// 用意されたため、セットアップウィザードの手順0、および左下の自分専用ステータスエリア
// （main.jsのプレイマットアイコン）から選べるようにする（デフォルトは白）。他の実物画像
// 素材と同じ理由でgit管理外（.gitignoreの/assets/playmats/参照）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { saveMyPreference, isItemUnlocked, openShop } from "./online.js";

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

// ログイン直後、アカウントに保存済みの選択を読み込んで適用する時にも使う
// （online.jsのloadMyPreferences経由、registerAppearanceApplier参照）。呼び出し元を問わず
// 見た目へすぐ反映されるよう、ここでrenderまで済ませておく。
export function setSelectedPlaymatId(id) {
  if (!PLAYMAT_OPTIONS.some((p) => p.id === id)) return;
  selectedPlaymatId = id;
  helpers?.render();
}

export function getSelectedPlaymatPath() {
  return PLAYMAT_OPTIONS.find((p) => p.id === selectedPlaymatId).path;
}

// ユーザー要望「プレイマットを購入できるようにする」への対応。既定の「白」は無料、
// 「黒」は安価、「旧」「古」バリエーションは少し高め、それ以外(7色)は均一価格にした。
// まだ具体的な金額指定が無いプレースホルダー（対局終了ごとの通貨獲得額50、
// supabase_setup_so7.sqlのso7_award_match_currency参照、が基準）。実際の値は後で
// 調整すること。
function getPlaymatCost(id) {
  if (id === "white") return 0;
  if (id === "black") return 60;
  if (id.endsWith("-old") || id.endsWith("-aged")) return 100;
  return 80;
}

// shop-content.js（ショップのカタログ）がこのまま使えるよう、このモジュール自身の
// PLAYMAT_OPTIONSを唯一の正としてitem一覧を組み立てて返す。
export function getPlaymatShopItems() {
  return PLAYMAT_OPTIONS.map((p) => ({
    itemKey: `playmat:${p.id}`,
    label: p.label,
    cost: getPlaymatCost(p.id),
    imagePath: p.path,
  }));
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
    // ユーザー要望「プレイマットを購入できるようにする」への対応。未所持の有料マットは
    // 選べないようにし、代わりにショップを開く。
    const itemKey = `playmat:${option.id}`;
    const cost = getPlaymatCost(option.id);
    const locked = cost > 0 && !isItemUnlocked(itemKey);
    if (locked) {
      swatch.classList.add("is-locked");
      const lockBadge = document.createElement("span");
      lockBadge.className = "piece-skin-swatch-lock";
      lockBadge.textContent = `🔒${cost}`;
      swatch.appendChild(lockBadge);
    }
    swatch.addEventListener("click", () => {
      if (locked) {
        close();
        openShop("playmat");
        return;
      }
      setSelectedPlaymatId(option.id);
      // ユーザー要望「プレイマット変更をアカウントに紐づけてほしい」。未ログインの間は
      // saveMyPreference側が何もしないので、ローカルでの見た目切り替えは従来通り機能する。
      saveMyPreference({ playmat_id: option.id }).catch((err) => console.error("saveMyPreference failed", err));
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
