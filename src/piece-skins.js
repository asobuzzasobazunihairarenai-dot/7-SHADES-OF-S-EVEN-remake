// 駒スキン選択: 色ごとに使うスキンのバリエーション（0=標準、1〜3=画像素材/駒スキン追加の
// 追加セット）を保持し、いつでも自由に変更できるようにする。駒の色自体はファーストカードで
// 固定なので、選べるのは「自分の駒と同じ色の中のスキンバリエーション」だけ
// （色が変わるわけではない）。選択は色ごとに保持するため、対戦を通して座席の色が変わっても
// 同じ色なら同じスキンが使われる。
// トリガーとなるUI（駒の立体サムネイル）は左下の自分専用ステータスエリア側（main.js）に
// あるため、このモジュールはデータ管理とピッカーのモーダルだけを持つ。
//
// オンライン対戦では、他プレイヤーの駒スキンは自分のブラウザのローカル推測値ではなく、
// online.jsが同期取得した座席ロスター（getSyncedIdentity）を優先する。ローカルの
// skinIndexByColorは「色」で保持しているが、同期データは「座席」ごと（so7_game_seats）に
// 持っているため、getSkinImagePathに座席を渡せる場面ではオンライン中はそちらを優先する。

import { getState } from "./state.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getSelfSeat, isOnlineMode, getSyncedIdentity, updateMyIdentity } from "./online.js";

const SKIN_VARIANTS = [0, 1, 2, 3, 4, 5]; // 0=標準（assets/pieces/${color}.png）

let skinIndexByColor = {};

// seat: 分かる場合（盤面上の駒を描画する時等）は渡すと、オンライン中はその座席の同期済み
// スキン選択を優先する。省略時（自分専用ステータスのプレビュー等）はローカルの色ベースの
// 選択にフォールバックする。
export function getSkinImagePath(color, seat) {
  let idx = skinIndexByColor[color] || 0;
  if (isOnlineMode() && seat) {
    const synced = getSyncedIdentity(seat)?.pieceSkinIndex;
    if (typeof synced === "number") idx = synced;
  }
  return idx === 0 ? `assets/pieces/${color}.png` : `assets/pieces/${color}-${idx}.png`;
}

export function getMyPieceColor() {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === getSelfSeat());
  return piece ? piece.color : null;
}

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

export function openPieceSkinPicker() {
  const color = getMyPieceColor();
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
      if (isOnlineMode()) {
        updateMyIdentity({ pieceSkinIndex: idx }).catch((err) => console.error("updateMyIdentity failed", err));
      }
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
