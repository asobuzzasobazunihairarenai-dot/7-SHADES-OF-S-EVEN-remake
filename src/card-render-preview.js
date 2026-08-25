// カード面レンダラ（card-renderer.js）の開発用プレビュー＋位置・サイズ調整ツール。
// 全カードを「テキスト無しブランク画像＋アプリ側テキスト」で組み立てて一覧表示し、
// サイズスライダーで拡縮（どのサイズでも崩れないか確認）、および種別ごとの位置・サイズを
// スライダーで微調整できる（--cf-* 変数を書き換える）。調整結果は localStorage に保存し、
// 「出力をコピー」で現在値のCSSスニペットを出せる（開発者が style.css の既定値へ焼き込む運用）。
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { buildCardFace } from "./card-renderer.js";
import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS } from "./cards-data.js";

let overlayEl = null;
let backdropEl = null;

const STORE_KEY = "so7-cardface-tune";

// 種別ごとの調整項目（--cf-* 変数）。def は style.css の var() 既定と一致させる。
const TUNE_GROUPS = [
  {
    group: "通常カード",
    items: [
      { v: "--cf-n-scale", label: "文字サイズ", min: 0.6, max: 1.6, step: 0.02, def: 1, unit: "" },
      { v: "--cf-n-top", label: "テキスト枠の上端", min: 40, max: 75, step: 0.5, def: 55, unit: "%" },
      { v: "--cf-n-flavor-top", label: "フレーバー上位置", min: 0, max: 12, step: 0.2, def: 2.6, unit: "cqw" },
    ],
  },
  {
    group: "エターナルカード",
    items: [
      { v: "--cf-e-scale", label: "文字サイズ", min: 0.6, max: 1.6, step: 0.02, def: 1, unit: "" },
      { v: "--cf-e-top", label: "テキスト枠の上端", min: 40, max: 75, step: 0.5, def: 58, unit: "%" },
      { v: "--cf-e-flavor-top", label: "フレーバー上位置", min: 0, max: 12, step: 0.2, def: 2.6, unit: "cqw" },
    ],
  },
  {
    group: "ファーストカード",
    items: [
      { v: "--cf-f-scale", label: "文字サイズ", min: 0.6, max: 1.6, step: 0.02, def: 1, unit: "" },
      { v: "--cf-f-basic-top", label: "★基本 上位置", min: 0, max: 40, step: 0.5, def: 4, unit: "cqw" },
      { v: "--cf-f-title-top", label: "タイトル 上位置", min: 0, max: 60, step: 0.5, def: 21, unit: "cqw" },
      { v: "--cf-f-sub-top", label: "《能力名》上位置", min: 0, max: 90, step: 0.5, def: 55, unit: "cqw" },
      { v: "--cf-f-hand-top", label: "■手札 上位置", min: 0, max: 95, step: 0.5, def: 63, unit: "cqw" },
    ],
  },
];
const ALL_ITEMS = TUNE_GROUPS.flatMap((g) => g.items);

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch { return {}; }
}
function saveAll(map) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch {}
}
// 保存済みの値を :root（documentElement）へ適用（プレビューを開かなくても効くように起動時にも呼べる）。
export function applySavedCardFaceTuning() {
  const saved = loadSaved();
  for (const it of ALL_ITEMS) {
    if (saved[it.v] != null) document.documentElement.style.setProperty(it.v, saved[it.v] + it.unit);
  }
}

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

function buildTuner() {
  const saved = loadSaved();
  const wrap = document.createElement("details");
  wrap.className = "card-render-preview-tuner";
  const sum = document.createElement("summary");
  sum.textContent = "⚙ 位置・サイズ調整（種別ごと）";
  wrap.appendChild(sum);

  const body = document.createElement("div");
  body.className = "cf-tuner-body";

  for (const g of TUNE_GROUPS) {
    const gEl = document.createElement("div");
    gEl.className = "cf-tuner-group";
    const gt = document.createElement("div");
    gt.className = "cf-tuner-group-title";
    gt.textContent = g.group;
    gEl.appendChild(gt);
    for (const it of g.items) {
      const row = document.createElement("label");
      row.className = "cf-tuner-row";
      const name = document.createElement("span");
      name.className = "cf-tuner-label";
      name.textContent = it.label;
      const slider = document.createElement("input");
      slider.type = "range";
      slider.min = String(it.min); slider.max = String(it.max); slider.step = String(it.step);
      slider.value = String(saved[it.v] != null ? saved[it.v] : it.def);
      const val = document.createElement("span");
      val.className = "cf-tuner-val";
      const update = () => {
        val.textContent = slider.value + it.unit;
        document.documentElement.style.setProperty(it.v, slider.value + it.unit);
        const map = loadSaved(); map[it.v] = Number(slider.value); saveAll(map);
      };
      update();
      slider.addEventListener("input", update);
      row.appendChild(name); row.appendChild(slider); row.appendChild(val);
      gEl.appendChild(row);
    }
    body.appendChild(gEl);
  }

  const btnRow = document.createElement("div");
  btnRow.className = "cf-tuner-btns";
  const outBtn = document.createElement("button");
  outBtn.type = "button";
  outBtn.textContent = "出力をコピー";
  outBtn.addEventListener("click", () => {
    const map = loadSaved();
    const lines = ALL_ITEMS
      .filter((it) => map[it.v] != null && map[it.v] !== it.def)
      .map((it) => `  ${it.v}: ${map[it.v]}${it.unit};`);
    const css = ":root {\n" + (lines.length ? lines.join("\n") : "  /* 既定から変更なし */") + "\n}";
    navigator.clipboard?.writeText(css).catch(() => {});
    outBtn.textContent = "コピーしました！";
    setTimeout(() => { outBtn.textContent = "出力をコピー"; }, 1400);
  });
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "リセット";
  resetBtn.addEventListener("click", () => {
    for (const it of ALL_ITEMS) document.documentElement.style.removeProperty(it.v);
    saveAll({});
    // スライダー表示を既定へ戻す（再描画）
    const fresh = buildTuner();
    fresh.open = true;
    wrap.replaceWith(fresh);
  });
  btnRow.appendChild(outBtn);
  btnRow.appendChild(resetBtn);
  body.appendChild(btnRow);

  wrap.appendChild(body);
  return wrap;
}

function buildOverlay(close) {
  const ov = document.createElement("div");
  ov.id = "card-render-preview";

  const header = document.createElement("div");
  header.className = "card-render-preview-header";

  const title = document.createElement("div");
  title.className = "card-render-preview-title";
  title.textContent = "🖼 カード表示プレビュー（テキスト無し画像＋アプリ側テキスト）";
  header.appendChild(title);

  const sizeWrap = document.createElement("label");
  sizeWrap.className = "card-render-preview-size";
  const sizeLabel = document.createElement("span");
  const slider = document.createElement("input");
  slider.type = "range"; slider.min = "5"; slider.max = "30"; slider.step = "0.5"; slider.value = "16";
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

  ov.appendChild(buildTuner());

  const scroll = document.createElement("div");
  scroll.className = "card-render-preview-scroll";
  scroll.appendChild(buildGrid(Number(slider.value)));
  ov.appendChild(scroll);

  return ov;
}

export function openCardRenderPreview() {
  if (overlayEl) return;
  applySavedCardFaceTuning();
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
