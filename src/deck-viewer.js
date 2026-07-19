// 「山札一覧」: テキストデータ(cards-data.js)と実際のカード画像(assets/cards/)がちゃんと
// 紐づいているかを目視確認するためのデバッグ用ビューア。通常カード・エターナルカード・
// ファーストカードそれぞれのタイトル・画像・枚数をグリッドで一覧表示し、タイルをクリックすると
// カードの拡大画像とルール補足テキストをまとめたモーダルが開く。管理者モードと同様、
// ゲーム本編のUIではなく開発用ツール。

import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS, getCardImagePath } from "./cards-data.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

let showCardModal = null; // initDeckViewer内で実体を設定する

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

  tile.addEventListener("click", () => showCardModal(def));

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
  panel.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(68rem, 96vw); max-height: 92vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 1rem; z-index: 2001;
    font-family: sans-serif; font-size: 0.85rem; color: #e2e8f0;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    display: none;
  `;

  const titleEl = document.createElement("div");
  titleEl.textContent = "山札一覧";
  titleEl.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; padding-right: 1.6rem;";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  panel.appendChild(buildSection("通常カード", NORMAL_CARDS));
  panel.appendChild(buildSection("エターナルカード", ETERNAL_CARDS));
  panel.appendChild(buildSection("ファーストカード", FIRST_CARDS));

  return panel;
}

function buildToggleButton(open) {
  const btn = document.createElement("button");
  btn.className = "header-tool-button";
  btn.textContent = "📋 山札一覧";
  // top: 1.8remは右上ボタン列の中で一番上。真上に#turn-round-counter（通算ターン数・
  // ラウンド数の表示）があるため、それと重ならないよう少し下げてある。
  btn.style.cssText = `
    position: fixed; top: 1.8rem; right: 1rem; z-index: 1001;
    padding: 0.4rem 0.7rem; background: rgba(15, 23, 32, 0.85); color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.4rem; cursor: pointer;
    font-family: sans-serif; font-size: 0.75rem;
  `;
  btn.addEventListener("click", open);
  return btn;
}

export function initDeckViewer() {
  showCardModal = buildCardModal();

  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
    toggleBtn.style.display = "block";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
    toggleBtn.style.display = "none";
  }

  const panel = buildPanel(close);
  const backdrop = createBackdrop(close, { dim: true, zIndex: 2000 });
  // ハマりどころ: 他のパネル（admin.js/options-menu.js等）と違い、ここだけ生成直後に
  // display:noneを付け忘れていたため、ページを開いた瞬間から画面全体が薄暗いbackdropで
  // 覆われていた（deck-viewer自体は右上のボタンからしか開かないので、backdropの意図しない
  // 表示に気付きにくかった）。1回目のクリックはこのbackdrop自身をclose()するだけに消費され、
  // 実際にはマウスがまだ動いていない（クリックだけでは新しいpointermoveが発生しない）ため、
  // 盤面のホバー演出が効き始めるにはもう1回の操作が必要になる、という体感になっていた。
  backdrop.style.display = "none";
  const toggleBtn = buildToggleButton(open);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}
