// 背景画像の選択。画像素材/背景/配下に複数種類（現在3種）が用意されたため、プレイマットと
// 同じ「左下の自分専用ステータスエリアのアイコンから選べる」方式にする。他の実物画像素材と
// 同じ理由でgit管理外（.gitignoreの/assets/backgrounds/参照）。
// ユーザー要望「アカウントに紐づけてほしい」を受け、ログイン中はso7_user_profilesに保存し
// ログインするたびに復元する（online.jsのsaveMyPreference/registerAppearanceApplier参照）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { saveMyPreference, isItemUnlocked, openShop } from "./online.js";

export const BACKGROUND_OPTIONS = [
  { id: "1", label: "背景1", path: "assets/backgrounds/1.webp" },
  // ユーザーが追加した高画質版（元画像はpng、2.5MB超のため読み込みがやや重い点は
  // 承知の上でラインナップに追加）。
  { id: "1-hq", label: "背景1（高画質）", path: "assets/backgrounds/1-hq.png" },
  { id: "2", label: "背景2", path: "assets/backgrounds/2.webp" },
  { id: "3", label: "背景3", path: "assets/backgrounds/3.webp" },
];

let selectedBackgroundId = "1";

export function getSelectedBackgroundPath() {
  return BACKGROUND_OPTIONS.find((b) => b.id === selectedBackgroundId).path;
}

// ユーザー要望「背景画像を購入できるようにする」への対応。既定の「背景1」は無料、
// 高画質版は少し高め、それ以外は均一価格にした。まだ具体的な金額指定が無い
// プレースホルダー（対局終了ごとの通貨獲得額50、supabase_setup_so7.sqlの
// so7_award_match_currency参照、が基準）。実際の値は後で調整すること。
function getBackgroundCost(id) {
  if (id === "1") return 0;
  if (id === "1-hq") return 150;
  return 100;
}

// shop-content.js（ショップのカタログ）がこのまま使えるよう、このモジュール自身の
// BACKGROUND_OPTIONSを唯一の正としてitem一覧を組み立てて返す。
export function getBackgroundShopItems() {
  return BACKGROUND_OPTIONS.map((b) => ({
    itemKey: `background:${b.id}`,
    label: b.label,
    cost: getBackgroundCost(b.id),
  }));
}

// ログイン直後、アカウントに保存済みの選択を読み込んで適用する時にも使う
// （online.jsのloadMyPreferences経由、registerAppearanceApplier参照）。
export function setSelectedBackgroundId(id) {
  if (!BACKGROUND_OPTIONS.some((b) => b.id === id)) return;
  selectedBackgroundId = id;
  helpers?.render();
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
    // ユーザー要望「背景画像を購入できるようにする」への対応。未所持の有料背景は
    // 選べないようにし、代わりにショップを開く。
    const itemKey = `background:${option.id}`;
    const cost = getBackgroundCost(option.id);
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
        openShop("background");
        return;
      }
      setSelectedBackgroundId(option.id);
      saveMyPreference({ background_id: option.id }).catch((err) => console.error("saveMyPreference failed", err));
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
