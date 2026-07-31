// 「山札一覧」: テキストデータ(cards-data.js)と実際のカード画像(assets/cards/)がちゃんと
// 紐づいているかを目視確認するためのデバッグ用ビューア。通常カード・エターナルカード・
// ファーストカードそれぞれのタイトル・画像・枚数をグリッドで一覧表示し、タイルをクリックすると
// カードの拡大画像とルール補足テキストをまとめたモーダルが開く。管理者モードと同様、
// ゲーム本編のUIではなく開発用ツール。

import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS, getCardImagePath } from "./cards-data.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

let showCardModal = null; // initDeckViewer内で実体を設定する

// ユーザー要望「山札一覧でホバーや長押しでカードを拡大表示できるように」。盤面の#card-preview
// とは別に、山札一覧（全画面パネル）専用の大きな拡大プレビューを持つ。ホバー（PC）と長押し
// （スマホ）で表示し、離すと消える。クリックは従来通り補足テキスト付きモーダル(showCardModal)。
let deckPreviewEl = null;
function getDeckPreviewEl() {
  if (!deckPreviewEl) {
    deckPreviewEl = document.createElement("img");
    deckPreviewEl.id = "deck-viewer-card-preview";
    deckPreviewEl.style.cssText = `
      position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(26rem, 82vw); max-height: 88vh; object-fit: contain;
      border-radius: 0.6rem; border: 2px solid rgba(255, 255, 255, 0.75);
      box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.75); pointer-events: none;
      z-index: 2300; display: none;
    `;
    document.body.appendChild(deckPreviewEl);
  }
  return deckPreviewEl;
}
function showDeckPreview(def) {
  const el = getDeckPreviewEl();
  el.src = getCardImagePath(def.id);
  el.alt = def.name;
  el.style.display = "block";
}
function hideDeckPreview() {
  if (deckPreviewEl) deckPreviewEl.style.display = "none";
}

function buildCardTile(def) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.style.cssText = `
    position: relative; display: flex; flex-direction: column; align-items: center;
    gap: 0.2rem; padding: 0.3rem; background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 0.4rem; cursor: pointer;
    font-family: sans-serif; color: #e2e8f0; text-align: center;
  `;

  const img = document.createElement("img");
  img.src = getCardImagePath(def.id);
  img.alt = def.name;
  img.loading = "lazy";
  img.style.cssText = "width: 4.2rem; height: 4.2rem; object-fit: cover; border-radius: 0.25rem;";
  tile.appendChild(img);

  const countBadge = document.createElement("div");
  countBadge.textContent = `×${def.count ?? 1}`;
  countBadge.style.cssText = `
    position: absolute; top: 0.15rem; right: 0.15rem; padding: 0 0.3rem;
    background: rgba(15, 23, 32, 0.85); border-radius: 0.5rem; font-size: 0.6rem;
  `;
  tile.appendChild(countBadge);

  const name = document.createElement("div");
  name.textContent = def.name;
  name.style.cssText = "font-size: 0.6rem; line-height: 1.2; max-height: 2.4em; overflow: hidden;";
  tile.appendChild(name);

  // ホバー（PC）で拡大プレビュー。
  tile.addEventListener("mouseenter", () => showDeckPreview(def));
  tile.addEventListener("mouseleave", hideDeckPreview);

  // 長押し（スマホ）で拡大プレビュー。長押しが発火した後のクリックは、補足モーダルを
  // 開かずプレビューを閉じるだけにする（長押しとタップを区別する）。
  let holdTimer = null;
  let didLongPress = false;
  tile.addEventListener(
    "touchstart",
    () => {
      didLongPress = false;
      holdTimer = setTimeout(() => {
        didLongPress = true;
        showDeckPreview(def);
      }, 300);
    },
    { passive: true }
  );
  const cancelHold = () => {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    hideDeckPreview();
  };
  tile.addEventListener("touchend", cancelHold);
  tile.addEventListener("touchmove", cancelHold);
  tile.addEventListener("touchcancel", cancelHold);

  tile.addEventListener("click", () => {
    if (didLongPress) {
      didLongPress = false;
      return; // 長押しプレビュー後のクリックは無視
    }
    hideDeckPreview();
    showCardModal(def);
  });

  return tile;
}

function buildSection(title, cardDefs) {
  const section = document.createElement("div");
  section.style.cssText = "margin-bottom: 0.8rem;";

  const heading = document.createElement("div");
  heading.textContent = `${title}（${cardDefs.length}種）`;
  heading.style.cssText = `
    font-weight: bold; color: #7dd3fc; margin-bottom: 0.4rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.3); padding-bottom: 0.3rem;
    font-family: sans-serif;
  `;
  section.appendChild(heading);

  const grid = document.createElement("div");
  grid.style.cssText = "display: grid; grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr)); gap: 0.5rem;";
  for (const def of cardDefs) {
    grid.appendChild(buildCardTile(def));
  }
  section.appendChild(grid);
  return section;
}

// タイルクリックで開く、カード拡大画像＋補足テキストのモーダル。
function buildCardModal() {
  const backdrop = document.createElement("div");
  backdrop.id = "deck-card-modal-backdrop";
  backdrop.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7); z-index: 2100; display: none;";

  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(38rem, 92vw); max-height: 85vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 1rem; z-index: 2101;
    font-family: sans-serif; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    display: none;
  `;

  // 拡大画像の右隣に補足テキストを並べ、縦スクロールをなるべく減らす
  // （狭い画面ではflex-wrapで縦積みにフォールバック）。
  const content = document.createElement("div");
  content.style.cssText = "display: flex; gap: 0.8rem; margin-bottom: 0.8rem; flex-wrap: wrap;";

  const img = document.createElement("img");
  img.style.cssText = "width: 14rem; flex-shrink: 0; border-radius: 0.4rem; display: block;";

  const textCol = document.createElement("div");
  textCol.style.cssText = "flex: 1; min-width: 12rem;";

  const name = document.createElement("div");
  name.style.cssText = "font-weight: bold; font-size: 1rem; margin-bottom: 0.4rem;";

  const note = document.createElement("div");
  note.style.cssText = `
    padding: 0.5rem; background: rgba(0, 0, 0, 0.3); border-radius: 0.25rem;
    font-size: 0.8rem; line-height: 1.5; white-space: pre-wrap;
  `;
  textCol.appendChild(name);
  textCol.appendChild(note);
  content.appendChild(img);
  content.appendChild(textCol);

  function close() {
    backdrop.style.display = "none";
    modal.style.display = "none";
  }
  function open(def) {
    img.src = getCardImagePath(def.id);
    img.alt = def.name;
    name.textContent = def.name;
    note.textContent = def.note || "（補足なし）";
    backdrop.style.display = "block";
    modal.style.display = "block";
  }

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(content);
  backdrop.addEventListener("click", close);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  return open;
}

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "deck-viewer-panel";
  // ユーザー要望「山札一覧は全画面表示にしましょう」。中央モーダルではなく画面いっぱいに
  // 広げ、中身は縦スクロールで見せる。
  panel.style.cssText = `
    position: fixed; inset: 0; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98);
    padding: 1rem 1.2rem 2rem; z-index: 2001;
    font-family: sans-serif; font-size: 0.85rem; color: #e2e8f0;
    display: none;
  `;

  const titleEl = document.createElement("div");
  titleEl.textContent = "山札一覧";
  titleEl.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; padding-right: 1.6rem;";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  panel.appendChild(buildDeckSections());

  return panel;
}

// 山札一覧の中身（3セクション）だけを組み立てて返す。図鑑／ルールブックの全画面版
// （codex-page.js）からも使う。カードのクリック→拡大は showCardModal（initDeckViewerで生成）
// を参照するため、initDeckViewer後に呼ぶこと。
export function buildDeckSections() {
  const wrap = document.createElement("div");
  wrap.appendChild(buildSection("通常カード", NORMAL_CARDS));
  wrap.appendChild(buildSection("エターナルカード", ETERNAL_CARDS));
  wrap.appendChild(buildSection("ファーストカード", FIRST_CARDS));
  return wrap;
}

let openDeckViewerFn = null;

// 「⚙ オプション」の中の「📋 山札一覧」項目から呼ぶ（以前は右上に専用ボタンがあったが、
// 右上のボタン列を整理するためオプションメニューに統合した）。
export function openDeckViewer() {
  openDeckViewerFn?.();
}

export function initDeckViewer() {
  showCardModal = buildCardModal();

  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
  }
  openDeckViewerFn = open;

  const panel = buildPanel(close);
  const backdrop = createBackdrop(close, { dim: true, zIndex: 2000 });
  // ハマりどころ: 他のパネル（admin.js/options-menu.js等）と違い、ここだけ生成直後に
  // display:noneを付け忘れていたため、ページを開いた瞬間から画面全体が薄暗いbackdropで
  // 覆われていた。1回目のクリックはこのbackdrop自身をclose()するだけに消費され、
  // 実際にはマウスがまだ動いていない（クリックだけでは新しいpointermoveが発生しない）ため、
  // 盤面のホバー演出が効き始めるにはもう1回の操作が必要になる、という体感になっていた。
  backdrop.style.display = "none";

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}
