// カード面の各テキスト要素の配置設定を1箇所にまとめる。
// card-renderer.js / style.css / card-render-preview.js（エディタ）で共有し、ズレを防ぐ。
// 位置・サイズは全て cqw（カード幅比）。x=左, y=上, w=幅, s=文字サイズ, oy=上下微調整(ルビ)。
// style.css の各 var(..., 既定) の「既定値」と一致させること
// （tools/gen-cardface-css.mjs がこの設定からCSSを生成する）。
//
// レイアウトは2グループ:
//  - std  : 通常カード と エターナルカード（位置調整は共通・ユーザー要望）。効果は fx＝基本/到達/手札を
//           1セットで上から詰め、間に仕切り線。
//  - first: ファーストカード（基本→タイトル→能力名→手札の交互配置。効果も個別。文字は全て白・効果中央）。

export const LAYOUT = {
  std: {
    flavor:  { x: 6, y: 5, w: 88, s: 2.5 },
    title:   { x: 6, y: 52.5, w: 90, s: 3.9 },
    ruby:    { s: 1.8, oy: 0, props: ["s", "oy"] },
    fx:      { x: 6, y: 58, w: 88, s: 3.2 },
    // ★基本は fx内で font-size・幅・左位置(margin-left)を個別に調整（到達/手札とは別）。
    fxbasic: { s: 2.7, w: 80, mx: 8, props: ["s", "w", "mx"] },
    icon:    { s: 6.6, props: ["s"] }, // ●/■アイコンのサイズ（cqw）
    gap:     { s: 1.5, props: ["s"] }, // アイコン→文の間隔（cqw）
  },
  // first は中央配置（左位置Xは不要）＝タイトル/能力名/効果文は中央。ただし■アイコンだけは
  // 独立要素(handicon)にして左位置Xを持つ（ユーザー要望「アイコンは中央でなく左位置調整」）。
  first: {
    basic:    { y: 6.5, w: 58, s: 2.8, props: ["y", "w", "s"] },
    title:    { y: 23.5, w: 90, s: 3.5, props: ["y", "w", "s"] },
    ruby:     { s: 1.6, oy: 0, props: ["s", "oy"] },
    sub:      { y: 58.5, w: 90, s: 3.8, props: ["y", "w", "s"] },
    handicon: { x: 9, y: 69, s: 8, props: ["x", "y", "s"] }, // ■アイコン（左基準の絶対配置・中央ではない）
    handcost: { y: 69, w: 64.5, s: 2.9, props: ["y", "w", "s"] }, // 手札効果の【追色N】（…）部分（中央・マーカー無し）
    hand:     { y: 82.5, w: 61.5, s: 2.9, props: ["y", "w", "s"] }, // 手札効果の本文（中央・マーカー無し）
  },
};

// カード種別 → レイアウトグループ（通常・エターナルは共通の std）。
export const TYPE_GROUP = { normal: "std", eternal: "std", first: "first" };
// グループ → CSS変数の接頭文字。
const GROUP_LETTER = { std: "s", first: "f" };

// 要素 → CSSセレクタ・表示名・種類。effect=マーカー付き効果行, fx=効果セットのコンテナ, ruby=ふりがな。
export const ELEMENT_META = {
  flavor:  { sel: ".card-face-flavor",            labelJa: "フレーバー",       kind: "text" },
  title:   { sel: ".card-face-title",             labelJa: "タイトル",         kind: "text" },
  ruby:    { sel: ".card-face-title rt",          labelJa: "ふりがな(ルビ)",   kind: "ruby" },
  sub:     { sel: ".card-face-subtitle",          labelJa: "能力名《》",       kind: "text" },
  basic:   { sel: ".card-face-effect.is-basic",   labelJa: "★基本効果",       kind: "effect" },
  arrival: { sel: ".card-face-effect.is-arrival", labelJa: "●到達効果",       kind: "effect" },
  hand:    { sel: ".card-face-effect.is-hand",    labelJa: "■手札効果",       kind: "effect" },
  handcost:{ sel: ".card-face-effect.is-hand-cost", labelJa: "手札効果の【追色】部分", kind: "effect" },
  handicon:{ sel: ".card-face-hand-icon",         labelJa: "■アイコン（手札効果）", kind: "iconpos", sLabel: "大きさ" },
  fx:      { sel: ".card-face-fx",                labelJa: "効果（基本/到達/手札）", kind: "fx" },
  fxbasic: { sel: ".card-face-fx .card-face-effect.is-basic", labelJa: "★基本効果（サイズ・幅・左位置）", kind: "size", sLabel: "文字サイズ" },
  icon:    { sel: ".card-face-marker",            labelJa: "アイコンのサイズ", kind: "iconsize", sLabel: "大きさ" },
  gap:     { sel: ".card-face-effect",            labelJa: "アイコン→文の間隔", kind: "gap", sLabel: "間隔" },
};

export const TYPE_LABEL = { normal: "通常", eternal: "エターナル", first: "ファースト" };
// エディタでグループを説明する見出し。
export const GROUP_LABEL = { std: "通常／エターナル（共通）", first: "ファースト" };

export function cardTypeOf(cardId) {
  if (cardId?.startsWith("first-")) return "first";
  if (cardId?.startsWith("eternal-")) return "eternal";
  return "normal";
}
export function groupOf(cardId) { return TYPE_GROUP[cardTypeOf(cardId)]; }

// CSS変数名: --cf-{s|f}-{element}-{x|y|w|s|oy}
export function cfVar(group, el, prop) {
  return `--cf-${GROUP_LETTER[group]}-${el}-${prop}`;
}

// その要素で調整するプロパティ（既定は x/y/w/s。ルビ等は config の props で上書き）。
export function propsFor(slot) {
  return slot?.props || ["x", "y", "w", "s"];
}

// エディタのスライダー範囲。
export const PROP_RANGE = {
  x:  { min: 0,   max: 95, step: 0.5, unit: "cqw", label: "左位置(X)" },
  y:  { min: 0,   max: 95, step: 0.5, unit: "cqw", label: "上位置(Y)" },
  w:  { min: 20,  max: 98, step: 0.5, unit: "cqw", label: "幅" },
  s:  { min: 1.0, max: 9,  step: 0.1, unit: "cqw", label: "文字サイズ" },
  oy: { min: -4,  max: 4,  step: 0.1, unit: "cqw", label: "上下微調整" },
  mx: { min: -30, max: 30, step: 0.5, unit: "cqw", label: "左位置(ずらし)" },
};
