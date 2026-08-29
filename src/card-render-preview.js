// カード面レンダラ（card-renderer.js）の開発用プレビュー＋位置・サイズエディタ。
// 1枚を最大限大きく表示し、種別ごとに「要素単位」で 左位置(X)・上位置(Y)・幅・文字サイズ を
// スライダー＋数値入力で調整できる（--cf-* 変数を書き換え）。要素ごとに枠（点線）を表示。
// 調整は localStorage に保存し、「出力をコピー」で :root スニペットを出す（style.css の既定へ
// 焼き込む運用）。本編描画には未接続（このプレビューでのみ効く開発ツール）。
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { buildCardFace, clearCardFaceFitCache } from "./card-renderer.js";
import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS, getCardDefinition } from "./cards-data.js";
import {
  LAYOUT, ELEMENT_META, TYPE_LABEL, GROUP_LABEL, PROP_RANGE, groupOf, cfVar, propsFor,
} from "./card-layout-config.js";
import { getLang, setPreviewLang, clearPreviewLang, SUPPORTED_LANGS, LANG_LABEL } from "./i18n.js";

let overlayEl = null;
let backdropEl = null;

const STORE_KEY = "so7-cardface-layout-v3";

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "{}") || {}; } catch { return {}; }
}
function saveAll(map) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(map)); } catch {}
}
// 保存済みの --cf-* を documentElement に適用（全て cqw 単位）。
export function applySavedCardFaceTuning() {
  const saved = loadSaved();
  for (const [k, v] of Object.entries(saved)) {
    if (v != null) document.documentElement.style.setProperty(k, v + "cqw");
  }
}
function defOf(group, el, prop) { return LAYOUT[group]?.[el]?.[prop]; }
function curOf(group, el, prop) {
  const v = cfVar(group, el, prop);
  const saved = loadSaved();
  return saved[v] != null ? saved[v] : defOf(group, el, prop);
}
function setVar(group, el, prop, value) {
  const v = cfVar(group, el, prop);
  document.documentElement.style.setProperty(v, value + "cqw");
  clearCardFaceFitCache(); // 配置が変われば「枠に収まる倍率」も変わる
  const map = loadSaved(); map[v] = Number(value); saveAll(map);
}

function allCards() {
  return {
    normal: NORMAL_CARDS.map((c) => c.id),
    eternal: ETERNAL_CARDS.map((c) => c.id),
    first: FIRST_CARDS.map((c) => c.id),
  };
}

// 1つのプロパティ（X/Y/幅/サイズ）のスライダー＋数値入力（相互同期）。
function buildPropRow(group, el, prop, labelOverride) {
  const range = PROP_RANGE[prop];
  const row = document.createElement("div");
  row.className = "cf-ed-prop";
  const label = document.createElement("span");
  label.className = "cf-ed-prop-label";
  label.textContent = labelOverride || range.label;
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = String(range.min); slider.max = String(range.max); slider.step = String(range.step);
  const num = document.createElement("input");
  num.type = "number";
  num.min = String(range.min); num.max = String(range.max); num.step = String(range.step);
  num.className = "cf-ed-prop-num";
  const unit = document.createElement("span");
  unit.className = "cf-ed-prop-unit";
  unit.textContent = range.unit;

  const cur = curOf(group, el, prop);
  slider.value = String(cur); num.value = String(cur);
  const apply = (val) => {
    slider.value = String(val); num.value = String(val);
    setVar(group, el, prop, val);
  };
  slider.addEventListener("input", () => apply(slider.value));
  num.addEventListener("input", () => { if (num.value !== "") apply(num.value); });
  row.appendChild(label); row.appendChild(slider); row.appendChild(num); row.appendChild(unit);
  return row;
}

// 選択中カードのグループ（通常/エターナルは共通の std）の各要素に対する調整グループを作る。
function buildControls(cardId) {
  const group = groupOf(cardId);
  const wrap = document.createElement("div");
  wrap.className = "cf-ed-controls";
  const note = document.createElement("div");
  note.className = "cf-ed-groupnote";
  note.textContent = `調整対象: ${GROUP_LABEL[group]}`;
  wrap.appendChild(note);
  const slots = LAYOUT[group] || {};
  for (const el of Object.keys(slots)) {
    const g = document.createElement("div");
    g.className = "cf-ed-group";
    const gt = document.createElement("div");
    gt.className = "cf-ed-group-title";
    gt.textContent = ELEMENT_META[el]?.labelJa || el;
    g.appendChild(gt);
    const sLabel = ELEMENT_META[el]?.sLabel;
    for (const prop of propsFor(slots[el])) {
      g.appendChild(buildPropRow(group, el, prop, prop === "s" ? sLabel : undefined));
    }
    wrap.appendChild(g);
  }
  return wrap;
}

function buildOverlay(close) {
  const cards = allCards();
  const firstId = cards.normal[0];
  let currentId = firstId;

  const ov = document.createElement("div");
  ov.id = "card-render-editor";

  // ---- ヘッダー ----
  const header = document.createElement("div");
  header.className = "cf-ed-header";
  const title = document.createElement("div");
  title.className = "cf-ed-title";
  title.textContent = "🖼 カード面エディタ（要素ごとに位置・サイズ調整）";
  header.appendChild(title);

  // カード選択
  const picker = document.createElement("select");
  picker.className = "cf-ed-picker";
  for (const [type, ids] of Object.entries(cards)) {
    const og = document.createElement("optgroup");
    og.label = TYPE_LABEL[type];
    for (const id of ids) {
      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = (getCardDefinition(id)?.name || id);
      og.appendChild(opt);
    }
    picker.appendChild(og);
  }
  picker.value = currentId;
  header.appendChild(picker);

  // 言語切替（プレビュー用。カード面が現在の言語で表示される）
  const langSel = document.createElement("select");
  langSel.className = "cf-ed-picker cf-ed-lang";
  for (const lang of SUPPORTED_LANGS) {
    const opt = document.createElement("option");
    opt.value = lang; opt.textContent = LANG_LABEL[lang] || lang;
    langSel.appendChild(opt);
  }
  langSel.value = getLang();
  header.appendChild(langSel);

  // 要素枠トグル
  const outlineLabel = document.createElement("label");
  outlineLabel.className = "cf-ed-outline-toggle";
  const outlineCb = document.createElement("input");
  outlineCb.type = "checkbox"; outlineCb.checked = true;
  outlineLabel.appendChild(outlineCb);
  outlineLabel.appendChild(document.createTextNode(" 要素の枠を表示"));
  header.appendChild(outlineLabel);

  header.appendChild(createModalCloseX(close));
  ov.appendChild(header);

  // ---- 本体（左：大プレビュー / 右：調整） ----
  const bodyRow = document.createElement("div");
  bodyRow.className = "cf-ed-body";

  const stage = document.createElement("div");
  stage.className = "cf-ed-stage";
  const cardWrap = document.createElement("div");
  cardWrap.className = "cf-ed-cardwrap";
  stage.appendChild(cardWrap);

  const side = document.createElement("div");
  side.className = "cf-ed-side";

  const renderCard = () => {
    cardWrap.innerHTML = "";
    const face = buildCardFace(currentId);
    if (outlineCb.checked) face.classList.add("cf-outline");
    cardWrap.appendChild(face);
  };
  const renderControls = () => {
    side.innerHTML = "";
    side.appendChild(buildControls(currentId));
    // 出力・リセット
    const btnRow = document.createElement("div");
    btnRow.className = "cf-ed-btns";
    const outBtn = document.createElement("button");
    outBtn.type = "button"; outBtn.textContent = "出力をコピー";
    outBtn.addEventListener("click", () => {
      const map = loadSaved();
      const lines = [];
      for (const [k, v] of Object.entries(map)) if (v != null) lines.push(`  ${k}: ${v}cqw;`);
      lines.sort();
      const css = ":root {\n" + (lines.length ? lines.join("\n") : "  /* 既定から変更なし */") + "\n}";
      navigator.clipboard?.writeText(css).catch(() => {});
      outBtn.textContent = "コピーしました！";
      setTimeout(() => { outBtn.textContent = "出力をコピー"; }, 1400);
    });
    const resetBtn = document.createElement("button");
    resetBtn.type = "button"; resetBtn.textContent = "このグループをリセット";
    resetBtn.addEventListener("click", () => {
      const group = groupOf(currentId);
      const slots = LAYOUT[group] || {};
      const map = loadSaved();
      for (const el of Object.keys(slots)) {
        for (const prop of propsFor(slots[el])) {
          const v = cfVar(group, el, prop);
          document.documentElement.style.removeProperty(v);
          delete map[v];
        }
      }
      saveAll(map);
      clearCardFaceFitCache();
      renderControls();
      renderCard();
    });
    btnRow.appendChild(outBtn);
    btnRow.appendChild(resetBtn);
    side.appendChild(btnRow);
  };

  picker.addEventListener("change", () => {
    currentId = picker.value;
    renderCard();
    renderControls();
  });
  langSel.addEventListener("change", () => { setPreviewLang(langSel.value); renderCard(); });
  outlineCb.addEventListener("change", renderCard);

  bodyRow.appendChild(stage);
  bodyRow.appendChild(side);
  ov.appendChild(bodyRow);

  renderCard();
  renderControls();
  return ov;
}

export function openCardRenderPreview() {
  if (overlayEl) return;
  applySavedCardFaceTuning();
  // エディタの言語切替はプレビュー専用の一時オーバーライド（保存もゲームへの反映もしない）。閉じたら解除。
  const close = () => {
    clearPreviewLang();
    overlayEl?.remove();
    backdropEl?.remove();
    overlayEl = null;
    backdropEl = null;
  };
  backdropEl = createBackdrop(close, { dim: true, zIndex: 2759 });
  overlayEl = buildOverlay(close);
  document.body.appendChild(overlayEl);
}
