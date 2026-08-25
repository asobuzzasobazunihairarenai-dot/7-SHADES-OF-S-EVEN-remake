// カード面レンダラ（card-renderer.js）の開発用プレビュー。全カードを「イラスト＋アプリ側テキスト」
// で組み立てて一覧表示し、サイズスライダーで拡縮して「どのサイズでも崩れないか」を確認する
// （フェーズ1の試作確認ツール。ゲーム本編のUIではない）。
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { buildCardFace } from "./card-renderer.js";
import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS } from "./cards-data.js";

let overlayEl = null;
let backdropEl = null;

function allCardIds() {
  return [...NORMAL_CARDS, ...ETERNAL_CARDS, ...FIRST_CARDS].map((c) => c.id);
}

function buildGrid(widthRem) {
  const grid = document.createElement("div");
  grid.className = "card-render-preview-grid";
  grid.style.setProperty("--preview-card-w", `${widthRem}rem`);
  for (const id of allCardIds()) {
    const cell = document.createElement("div");
    cell.className = "card-render-preview-cell";
    cell.appendChild(buildCardFace(id));
    grid.appendChild(cell);
  }
  return grid;
}

function buildOverlay(close) {
  const ov = document.createElement("div");
  ov.id = "card-render-preview";

  const header = document.createElement("div");
  header.className = "card-render-preview-header";

  const title = document.createElement("div");
  title.className = "card-render-preview-title";
  title.textContent = "🖼 カード表示プレビュー（イラスト＋アプリ側テキスト）";
  header.appendChild(title);

  const sizeWrap = document.createElement("label");
  sizeWrap.className = "card-render-preview-size";
  const sizeLabel = document.createElement("span");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "5";
  slider.max = "30";
  slider.step = "0.5";
  slider.value = "16";
  const updateLabel = () => { sizeLabel.textContent = `カードサイズ: ${slider.value}rem`; };
  updateLabel();
  slider.addEventListener("input", () => {
    updateLabel();
    const grid = ov.querySelector(".card-render-preview-grid");
    if (grid) grid.style.setProperty("--preview-card-w", `${slider.value}rem`);
  });
  sizeWrap.appendChild(sizeLabel);
  sizeWrap.appendChild(slider);
  header.appendChild(sizeWrap);

  header.appendChild(createModalCloseX(close));
  ov.appendChild(header);

  const scroll = document.createElement("div");
  scroll.className = "card-render-preview-scroll";
  scroll.appendChild(buildGrid(Number(slider.value)));
  ov.appendChild(scroll);

  return ov;
}

export function openCardRenderPreview() {
  if (overlayEl) return;
  const close = () => {
    overlayEl?.remove();
    backdropEl?.remove();
    overlayEl = null;
    backdropEl = null;
  };
  backdropEl = createBackdrop(close, { dim: true, zIndex: 2759 });
  overlayEl = buildOverlay(close);
  document.body.appendChild(overlayEl);
}
