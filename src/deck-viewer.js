// 「山札一覧」: テキストデータ(cards-data.js)と実際のカード画像(assets/cards/)がちゃんと
// 紐づいているかを目視確認するためのデバッグ用ビューア。通常カード・エターナルカード・
// ファーストカードそれぞれのタイトル・画像・枚数をグリッドで一覧表示し、タイルをクリックすると
// ルール補足テキストが開閉できる。管理者モードと同様、ゲーム本編のUIではなく開発用ツール。

import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS, getCardImagePath } from "./cards-data.js";

// タイルとその下に差し込む補足テキスト行の2つを返す（呼び出し側でgridに両方appendする。
// 補足はgrid-column:1/-1で全幅に広げ、クリックしたタイルの直後にだけ表示されるようにする）。
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

  const note = document.createElement("div");
  note.textContent = def.note || "（補足なし）";
  note.style.cssText = `
    display: none; grid-column: 1 / -1; text-align: left; padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3); border-radius: 0.25rem; font-size: 0.75rem;
    line-height: 1.5; font-family: sans-serif; color: #e2e8f0;
  `;

  tile.addEventListener("click", () => {
    note.style.display = note.style.display === "none" ? "block" : "none";
  });

  return { tile, note };
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
    const { tile, note } = buildCardTile(def);
    grid.appendChild(tile);
    grid.appendChild(note);
  }
  section.appendChild(grid);
  return section;
}

function buildPanel() {
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

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;";
  const titleEl = document.createElement("div");
  titleEl.textContent = "山札一覧";
  titleEl.style.cssText = "font-weight: bold;";
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  closeBtn.style.cssText = "padding: 0.3rem 0.6rem; background: #475569; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  header.appendChild(titleEl);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  panel.appendChild(buildSection("通常カード", NORMAL_CARDS));
  panel.appendChild(buildSection("エターナルカード", ETERNAL_CARDS));
  panel.appendChild(buildSection("ファーストカード", FIRST_CARDS));

  return { panel, closeBtn };
}

function buildBackdrop() {
  const backdrop = document.createElement("div");
  backdrop.id = "deck-viewer-backdrop";
  backdrop.style.cssText = "position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 2000; display: none;";
  return backdrop;
}

function buildToggleButton(open, close) {
  const btn = document.createElement("button");
  btn.textContent = "📋 山札一覧";
  btn.style.cssText = `
    position: fixed; top: 1rem; right: 1rem; z-index: 1001;
    padding: 0.4rem 0.7rem; background: rgba(15, 23, 32, 0.85); color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.4rem; cursor: pointer;
    font-family: sans-serif; font-size: 0.75rem;
  `;
  btn.addEventListener("click", open);
  return btn;
}

export function initDeckViewer() {
  const { panel, closeBtn } = buildPanel();
  const backdrop = buildBackdrop();

  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
  }
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  const toggleBtn = buildToggleButton(open, close);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}
