// カード裏面セットの選択: プレイヤー自身だけの見た目の好み。updateMyIdentity()等で
// サーバーへ送らない、他プレイヤーの画面には一切反映されない、ページ再読み込みで
// デフォルト（標準）に戻る、純粋にローカルの表示設定（motion-prefs.jsと同じ
// 「永続化しない」方針）。ユーザー要望「一旦はこの仕様（自分だけ）で、将来的には
// STORYモード等で裏面が全員向けに変わるようにもしたい」を反映し、今回は意図的に
// サーバー同期の仕組みを持たせていない（全員向けに変える仕組みが必要になったら、
// このモジュールとは別に、state.js/online.js側の同期の仕組みとして追加する想定）。
//
// 「通常カード」「エターナルカード」「ファーストカード」の裏面は、物理カードの
// デザインセットに相当するため常にセットとして一括で切り替わる（個別には選べない）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

// 0=標準（assets/cards/back-{eternal,first,normal}.png）。
// 1=画像素材/カード裏面追加/追加旧（旧称「追加1」、assets/cards/back-{eternal,first,normal}-1.png）。
// 2〜9=画像素材/カード裏面追加/追加{赤,橙,黄,緑,青,桃,紫,黒}（各色テーマのセット）。
// 今後セットが増えたらこの配列とSET_LABELSに追記するだけでよい（ピッカーのグリッドも自動で増える）。
const CARD_BACK_SETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const SET_LABELS = {
  0: "標準",
  1: "旧",
  2: "赤",
  3: "橙",
  4: "黄",
  5: "緑",
  6: "青",
  7: "桃",
  8: "紫",
  9: "黒",
};

let selectedSetIndex = 0;

export function getCardBackSetIndex() {
  return selectedSetIndex;
}

export function backImagePath(kind, idx) {
  const suffix = idx === 0 ? "" : `-${idx}`;
  return `assets/cards/back-${kind}${suffix}.png`;
}

// setup-animation.js/remote-move-animator.jsと同じ「main.jsから自分の関数を注入してもらう」
// 循環import回避パターン。セット変更直後、自分の画面にも即座に反映させるためだけに使う。
let helpers = null; // { render }
export function registerCardBackSkinHelpers(h) {
  helpers = h;
}

export function openCardBackSkinPicker() {
  const modal = document.createElement("div");
  modal.id = "card-back-skin-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "カード裏面を選択（自分の画面にだけ反映されます）";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid";
  for (const idx of CARD_BACK_SETS) {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch";
    if (selectedSetIndex === idx) swatch.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = backImagePath("normal", idx);
    img.alt = SET_LABELS[idx] ?? `追加${idx}`;
    swatch.appendChild(img);
    swatch.addEventListener("click", () => {
      selectedSetIndex = idx;
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
