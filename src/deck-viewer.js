// 「山札一覧」: テキストデータ(cards-data.js)と実際のカード画像(assets/cards/)がちゃんと
// 紐づいているかを目視確認するためのデバッグ用ビューア。通常カード・エターナルカードそれぞれの
// タイトル・画像・枚数を一覧表示し、各カードに「補足」ボタンを付けてルール補足テキストを
// 開閉できるようにする。管理者モードと同様、ゲーム本編のUIではなく開発用ツール。

import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS, getCardImagePath } from "./cards-data.js";

function buildCardRow(def) {
  const row = document.createElement("div");
  row.style.cssText = `
    display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem;
    padding: 0.5rem 0.2rem; border-bottom: 1px solid rgba(148, 163, 184, 0.2);
  `;

  const img = document.createElement("img");
  img.src = getCardImagePath(def.id);
  img.alt = def.name;
  img.loading = "lazy";
  img.style.cssText = "width: 3.4rem; height: 3.4rem; object-fit: cover; border-radius: 0.3rem; flex-shrink: 0;";
  row.appendChild(img);

  const info = document.createElement("div");
  info.style.cssText = "flex: 1; min-width: 8rem;";
  const title = document.createElement("div");
  title.textContent = def.name;
  title.style.cssText = "font-weight: bold;";
  const countEl = document.createElement("div");
  countEl.textContent = `${def.count ?? 1}枚`;
  countEl.style.cssText = "opacity: 0.7; font-size: 0.8em; margin-top: 0.1rem;";
  info.appendChild(title);
  info.appendChild(countEl);
  row.appendChild(info);

  const noteBtn = document.createElement("button");
  noteBtn.textContent = "補足";
  noteBtn.style.cssText = `
    flex-shrink: 0; padding: 0.25rem 0.6rem; background: #334155; color: #fff;
    border: none; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;
  `;
  row.appendChild(noteBtn);

  const noteText = document.createElement("div");
  noteText.textContent = def.note || "（補足なし）";
  noteText.style.cssText = `
    display: none; width: 100%; margin-top: 0.4rem; padding: 0.5rem;
    background: rgba(0, 0, 0, 0.3); border-radius: 0.25rem; font-size: 0.78rem;
    line-height: 1.5; opacity: 0.9;
  `;
  noteBtn.addEventListener("click", () => {
    const open = noteText.style.display !== "none";
    noteText.style.display = open ? "none" : "block";
    noteBtn.textContent = open ? "補足" : "補足を隠す";
  });
  row.appendChild(noteText);

  return row;
}

function buildSection(title, cardDefs) {
  const section = document.createElement("div");
  section.style.cssText = "margin-bottom: 1.2rem;";

  const heading = document.createElement("div");
  heading.textContent = `${title}（${cardDefs.length}種）`;
  heading.style.cssText = `
    font-weight: bold; color: #7dd3fc; margin-bottom: 0.3rem;
    border-bottom: 1px solid rgba(148, 163, 184, 0.3); padding-bottom: 0.3rem;
  `;
  section.appendChild(heading);

  for (const def of cardDefs) section.appendChild(buildCardRow(def));
  return section;
}

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "deck-viewer-panel";
  panel.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(30rem, 92vw); max-height: 85vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 1rem; z-index: 2001;
    font-family: sans-serif; font-size: 0.85rem; color: #e2e8f0;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    display: none;
  `;

  const header = document.createElement("div");
  header.style.cssText = "display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.6rem;";
  const titleEl = document.createElement("div");
  titleEl.textContent = "山札一覧（データと画像の紐づき確認用）";
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
