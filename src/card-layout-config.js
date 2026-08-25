// カード面の各テキスト要素の配置（種別ごと）の設定を1箇所にまとめる。
// card-renderer.js / style.css / card-render-preview.js（エディタ）で共有し、ズレを防ぐ。
// 位置・サイズは全て cqw（カード幅に対する割合）。x=左, y=上, w=幅, s=文字サイズ。
// これらは style.css の各要素の var(..., 既定) の「既定値」と一致させること
// （tools/gen-cardface-css.mjs がこの設定からCSSを生成する）。

export const CARD_LAYOUT = {
  normal: {
    flavor:  { x: 6,   y: 2.6, w: 88, s: 3 },
    title:   { x: 4.8, y: 54,  w: 90, s: 4.8 },
    basic:   { x: 4.8, y: 61,  w: 90, s: 2.9 },
    arrival: { x: 4.8, y: 66,  w: 90, s: 3.2 },
    hand:    { x: 4.8, y: 80,  w: 90, s: 3.2 },
  },
  eternal: {
    flavor:  { x: 6,   y: 2.6, w: 88, s: 3 },
    title:   { x: 4.8, y: 57,  w: 90, s: 4.6 },
    basic:   { x: 4.8, y: 65,  w: 90, s: 3 },
    hand:    { x: 4.8, y: 77,  w: 90, s: 3.2 },
  },
  first: {
    basic:   { x: 5.5, y: 4,   w: 89, s: 3 },
    title:   { x: 5,   y: 21,  w: 90, s: 4.6 },
    sub:     { x: 5,   y: 55,  w: 90, s: 3.8 },
    hand:    { x: 5.5, y: 63,  w: 89, s: 3.2 },
  },
};

// 要素 → CSSセレクタ・表示名・種類（effect はマーカー付きの効果行）。
export const ELEMENT_META = {
  flavor:  { sel: ".card-face-flavor",            labelJa: "フレーバー",   kind: "text" },
  title:   { sel: ".card-face-title",             labelJa: "タイトル",     kind: "text" },
  sub:     { sel: ".card-face-subtitle",          labelJa: "能力名《》",   kind: "text" },
  basic:   { sel: ".card-face-effect.is-basic",   labelJa: "★基本効果",   kind: "effect" },
  arrival: { sel: ".card-face-effect.is-arrival", labelJa: "●到達効果",   kind: "effect" },
  hand:    { sel: ".card-face-effect.is-hand",    labelJa: "■手札効果",   kind: "effect" },
};

export const TYPE_LABEL = { normal: "通常", eternal: "エターナル", first: "ファースト" };
const TYPE_LETTER = { normal: "n", eternal: "e", first: "f" };

export function cardTypeOf(cardId) {
  if (cardId?.startsWith("first-")) return "first";
  if (cardId?.startsWith("eternal-")) return "eternal";
  return "normal";
}

// CSS変数名: --cf-{n|e|f}-{element}-{x|y|w|s}
export function cfVar(type, el, prop) {
  return `--cf-${TYPE_LETTER[type]}-${el}-${prop}`;
}

// エディタのスライダー範囲。
export const PROP_RANGE = {
  x: { min: 0, max: 95, step: 0.5, unit: "cqw", label: "左位置(X)" },
  y: { min: 0, max: 95, step: 0.5, unit: "cqw", label: "上位置(Y)" },
  w: { min: 20, max: 98, step: 0.5, unit: "cqw", label: "幅" },
  s: { min: 1.5, max: 9, step: 0.1, unit: "cqw", label: "文字サイズ" },
};
