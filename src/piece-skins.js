// 駒スキン選択: 使うスキンのバリエーション（0=標準、1〜5=画像素材/駒スキン追加の
// 「追加1」〜「追加5」フォルダに対応）を1つだけ保持し、いつでも自由に変更できるようにする。
// 駒の色自体はファーストカードで固定なので、選べるのは「自分の駒と同じ色の中のスキン
// バリエーション」だけ（色が変わるわけではない）。
// 以前は色ごとに別々のバリエーション番号を覚える設計（skinIndexByColor）だったが、
// ユーザー要望により「バリエーション番号（例:『追加1』）はユーザー1人につき1つの好みで、
// ゲームをまたいで駒の色が変わってもそのフォルダ内の該当色スキンを引き継ぐ」という
// 仕様に変更した（例: 赤の駒で「追加1」を選んでいれば、別のゲームで橙の駒になっても
// 「追加1」フォルダの橙が使われる）。
// トリガーとなるUI（駒の立体サムネイル）は左下の自分専用ステータスエリア側（main.js）に
// あるため、このモジュールはデータ管理とピッカーのモーダルだけを持つ。
//
// オンライン対戦では、他プレイヤーの駒スキンは自分のブラウザのローカル推測値ではなく、
// online.jsが同期取得した座席ロスター（getSyncedIdentity）を優先する。自分自身の座席に
// ついては、ローカルで実際に選び直した（またはログイン時にso7_user_profilesから復元
// された）好みのバリエーション番号を優先し、それが無ければ同期ロスターにフォールバックする
// （リロード直後、まだローカルの好みが復元される前の一瞬もsyncedへ正しくフォールバック
// できるようにするため）。

import { getState } from "./state.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getSelfSeat, isOnlineMode, getSyncedIdentity, updateMyIdentity } from "./online.js";

const SKIN_VARIANTS = [0, 1, 2, 3, 4, 5]; // 0=標準（assets/pieces/${color}.png）

let preferredSkinIndex = 0;
let hasLocalPreference = false;

// online.jsのloadMyPreferences()（ログイン直後）から、so7_user_profiles.piece_skin_indexを
// 復元するために呼ばれる。updateMyIdentity()による書き戻しは行わない（読み込みなので）。
export function setLocalPreferredSkinIndex(idx) {
  if (typeof idx !== "number") return;
  preferredSkinIndex = idx;
  hasLocalPreference = true;
}

// setup-animation.js/remote-move-animator.jsと同じ「main.jsから自分の関数を注入してもらう」
// 循環import回避パターン。スキン変更直後、自分の画面にも即座に反映させるためだけに使う
// （main.js自体はexportを持たない静的サイトのため、直接importできない）。
let helpers = null; // { render }
export function registerPieceSkinHelpers(h) {
  helpers = h;
}

// seat: 分かる場合（盤面上の駒を描画する時等）は渡すと、オンライン中はその座席の同期済み
// スキン選択を優先する。
// 自分の座席（seat省略時、またはseat===getSelfSeat()）については、ローカルに好みの
// バリエーション番号があればそれを最優先する（クリック直後の即時反映・ログイン時の
// so7_user_profiles復元、どちらもhasLocalPreferenceをtrueにする）。それが無ければ
// （リロード直後でまだ復元が終わっていない一瞬など）同期ロスターへフォールバックする。
// 他の座席は常に同期ロスターのみを見る（自分の好みのバリエーション番号を他人に押し付け
// ないため）。
export function getSkinImagePath(color, seat) {
  const isSelf = !seat || seat === getSelfSeat();
  let idx = 0;
  if (isSelf && hasLocalPreference) {
    idx = preferredSkinIndex;
  } else if (isOnlineMode() && seat) {
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
    if ((hasLocalPreference ? preferredSkinIndex : 0) === idx) swatch.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = idx === 0 ? `assets/pieces/${color}.png` : `assets/pieces/${color}-${idx}.png`;
    img.alt = idx === 0 ? "標準" : `追加${idx}`;
    swatch.appendChild(img);
    swatch.addEventListener("click", () => {
      setLocalPreferredSkinIndex(idx);
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
