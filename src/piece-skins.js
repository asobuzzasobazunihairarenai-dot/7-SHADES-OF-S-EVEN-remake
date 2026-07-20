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

// setup-animation.js/remote-move-animator.jsと同じ「main.jsから自分の関数を注入してもらう」
// 循環import回避パターン。スキン変更直後、自分の画面にも即座に反映させるためだけに使う
// （main.js自体はexportを持たない静的サイトのため、直接importできない）。
let helpers = null; // { render }
export function registerPieceSkinHelpers(h) {
  helpers = h;
}

// seat: 分かる場合（盤面上の駒を描画する時等）は渡すと、オンライン中はその座席の同期済み
// スキン選択を優先する。
// この色について「今のページ読み込み以降にローカルで実際に選び直したか」
// （skinIndexByColorに自分でセットしたか）を優先し、それが無ければ同期ロスターを使う。
// 以前は「自分の座席かどうか」で分岐しており、スキン変更直後は即座に自分の画面へ反映
// できる利点があった一方、ページを再読み込みするとskinIndexByColorが空に戻るため、
// 自分の座席は常に標準スキン(0)に見えてしまう（相手の画面にはサーバーに保存済みの
// 正しいスキンが表示されるのに、自分の画面だけリロードで消える）というバグがあった。
// 「ローカルに実際の上書きがあるかどうか」で判定することで、変更直後の即時反映（クリック
// ハンドラがskinIndexByColorへ書き込んでからrenderするため）と、リロード後も同期ロスター
// （so7_user_profiles由来、参加時にso7_game_seatsへ複製済み）から正しく復元される、
// 両方を同時に満たせる。
export function getSkinImagePath(color, seat) {
  const hasLocalOverride = Object.prototype.hasOwnProperty.call(skinIndexByColor, color);
  let idx = hasLocalOverride ? skinIndexByColor[color] : 0;
  if (isOnlineMode() && seat && !hasLocalOverride) {
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
      // 名前・アバターの編集(main.js)は変更直後に直接render()を呼んでいるが、ここは
      // それが漏れていたため、駒スキンを変えても選んだ本人の画面にすら反映されない
      // バグになっていた（駒スキンだけ相手にも自分にも反映されない、という報告の原因）。
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
