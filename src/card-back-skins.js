// カード裏面セットの選択: プレイヤー自身だけの見た目の好み。他プレイヤーの画面には
// 一切反映されない（updateMyIdentity()等、盤面共有の仕組みとは別経路）。ユーザー要望
// 「一旦はこの仕様（自分だけ）で、将来的にはSTORYモード等で裏面が全員向けに変わるように
// もしたい」を反映し、他プレイヤーへ配る仕組みは意図的に持たせていない。
// 一方で「アカウントに紐づけてほしい」という要望を受け、選択自体はログイン中なら
// so7_user_profiles（名前・アバター・駒スキンと同じ、ユーザーごとに1行の永続プロフィール）
// に保存し、ログインするたびに復元されるようにした（online.jsのsaveMyPreference/
// registerAppearanceApplier参照）。未ログインの間はこれまで通りページ再読み込みで標準に戻る。
//
// 「通常カード」「エターナルカード」「ファーストカード」の裏面は、物理カードの
// デザインセットに相当するため常にセットとして一括で切り替わる（個別には選べない）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

// 0=標準（assets/cards/back-{eternal,first,normal}.webp）。
// 1=画像素材/カード裏面追加/追加旧（旧称「追加1」、assets/cards/back-{eternal,first,normal}-1.png）。
// 2〜9=画像素材/カード裏面追加/追加{赤,橙,黄,緑,青,桃,紫,黒}（各色テーマのセット）。
// 10=画像素材/カード裏面追加/追加古（「旧」とは別デザインの「古」バリエーション、
// 元画像がwebpのため他の追加セット(1〜9、png)と違いbackImagePath側でwebp扱いにしている）。
// 今後セットが増えたらこの配列とSET_LABELSに追記するだけでよい（ピッカーのグリッドも自動で増える）。
const CARD_BACK_SETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
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
  10: "古",
};

let selectedSetIndex = 0;

export function getCardBackSetIndex() {
  return selectedSetIndex;
}

// ログイン直後、アカウントに保存済みの選択を読み込んで適用する時にも使う
// （online.jsのloadMyPreferences経由、registerAppearanceApplier参照）。
export function setCardBackSetIndex(idx) {
  if (!CARD_BACK_SETS.includes(idx)) return;
  selectedSetIndex = idx;
  helpers?.render();
}

export function backImagePath(kind, idx) {
  const suffix = idx === 0 ? "" : `-${idx}`;
  // 標準セット(0)と「古」セット(10、元画像が既にwebpだった)はWebP、それ以外の追加セット
  // (1〜9、画像素材/カード裏面追加/配下)は未変換のままPNGなので、拡張子をセットごとに
  // 出し分ける必要がある。
  const ext = idx === 0 || idx === 10 ? "webp" : "png";
  return `assets/cards/back-${kind}${suffix}.${ext}`;
}

// setup-animation.js/remote-move-animator.jsと同じ「main.jsから自分の関数を注入してもらう」
// 循環import回避パターン。セット変更直後、自分の画面にも即座に反映させるためだけに使う。
// ハマりどころ: online.jsのsaveMyPreference()もこのパターンでinjectする必要がある
// （render等とは別の理由）。cards-data.jsがこのファイルをimportしており、もしこのファイルが
// online.js（→state.js→cards-data.js）を直接importすると、cards-data.js→card-back-skins.js
// →online.js→state.js→cards-data.jsという循環importになり、NORMAL_CARDS等の初期化順序が
// 崩れてTDZエラー（"Cannot access 'NORMAL_CARDS' before initialization"）でアプリ全体が
// 起動しなくなる（実際に発生させて原因特定済み）。savePreferenceもmain.js経由で注入する
// ことでこれを回避する。
let helpers = null; // { render, savePreference }
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
      setCardBackSetIndex(idx);
      helpers?.savePreference?.({ card_back_set_index: idx }).catch((err) => console.error("saveMyPreference failed", err));
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
