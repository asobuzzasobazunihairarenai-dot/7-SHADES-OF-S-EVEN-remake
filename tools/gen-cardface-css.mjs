// src/card-layout-config.js からカード面のCSS（各テキスト要素の絶対配置・種別ごと）を生成し、
// src/style.css の該当ブロックへ差し込む。配置を変えたら `node tools/gen-cardface-css.mjs` で再生成。
// 位置・サイズは全て cqw（カード幅比）＝カードをどのサイズで表示しても比率が崩れない。
import { readFileSync, writeFileSync } from "node:fs";
import { CARD_LAYOUT, ELEMENT_META, cfVar } from "../src/card-layout-config.js";

const CSS_PATH = new URL("../src/style.css", import.meta.url);

const BASE = `/* ===== カード面レンダラ（card-renderer.js）＝テキスト無しブランク画像＋アプリ側テキスト ===== */
/* 位置・サイズは種別ごとに要素単位で --cf-{n|e|f}-{要素}-{x|y|w|s} で調整（既定は各var()第2引数）。
   この位置ルールは tools/gen-cardface-css.mjs が src/card-layout-config.js から自動生成する。 */
.card-face {
  position: relative; aspect-ratio: 1 / 1; container-type: size;
  background-size: cover; background-position: center;
  border-radius: 4cqw; overflow: hidden; color: #2a2320;
  box-shadow: 0 0.6cqw 1.6cqw rgba(0, 0, 0, 0.35); user-select: none;
}
/* 効果行（マーカー＋本文）。文字は effect の font-size を em 基準に継承＝要素ごとのサイズ変数で一括拡縮。 */
.card-face-effect { display: flex; gap: 0.45em; align-items: flex-start; }
.card-face-effect-body { flex: 1; min-width: 0; }
.card-face-textline { font-size: 1em; line-height: 1.28; }
.card-face-subline { font-size: 0.92em; line-height: 1.26; padding-left: 1.6em; opacity: 0.92; }
/* ●到達・■手札は正式アイコン（CSSはsrc/なので ../assets/ 参照）。★基本はマーカー無し。 */
.card-face-marker { flex: 0 0 auto; width: 1.25em; height: 1.25em; margin-top: 0.12em; background-size: contain; background-repeat: no-repeat; background-position: center; }
.card-face-marker.is-basic { display: none; }
.card-face-marker.is-arrival { background-image: url("../assets/icons/effect-arrival.png"); }
.card-face-marker.is-hand { background-image: url("../assets/icons/effect-hand.png"); }
/* タイトルは全て黒文字（ユーザー指定）。ファーストのみ中央寄せ。 */
.card-face-title { font-weight: 800; line-height: 1.08; letter-spacing: 0.2cqw; color: #141414; text-align: left; }
.card-face[data-card-type="first"] .card-face-title { text-align: center; }
.card-face-title rt { font-size: 0.4em; font-weight: 600; line-height: 1; color: #141414; }
.card-face-subtitle { font-weight: 700; text-align: center; color: color-mix(in srgb, var(--card-accent, #555) 55%, #201a16); }
.card-face-flavor { font-style: italic; text-align: center; color: #fff; line-height: 1.25; text-shadow: 0 0.4cqw 1cqw rgba(0, 0, 0, 0.85), 0 0 0.4cqw rgba(0, 0, 0, 0.6); }
/* エディタ用：要素ごとの枠（どこに何があるか分かるように） */
.card-face.cf-outline .card-face-title,
.card-face.cf-outline .card-face-flavor,
.card-face.cf-outline .card-face-subtitle,
.card-face.cf-outline .card-face-effect { outline: 0.25cqw dashed rgba(0, 150, 255, 0.85); outline-offset: 0.3cqw; }
`;

const TYPES = ["normal", "eternal", "first"];
let gen = "\n/* --- 各テキスト要素の絶対配置（自動生成：card-layout-config.js） --- */\n";
for (const type of TYPES) {
  const slots = CARD_LAYOUT[type];
  for (const [el, d] of Object.entries(slots)) {
    const sel = ELEMENT_META[el].sel;
    gen += `.card-face[data-card-type="${type}"] ${sel} {`
      + ` position: absolute;`
      + ` left: var(${cfVar(type, el, "x")}, ${d.x}cqw);`
      + ` top: var(${cfVar(type, el, "y")}, ${d.y}cqw);`
      + ` width: var(${cfVar(type, el, "w")}, ${d.w}cqw);`
      + ` font-size: var(${cfVar(type, el, "s")}, ${d.s}cqw);`
      + ` }\n`;
  }
}

const NEW = BASE + gen;

const css = readFileSync(CSS_PATH, "utf8");
const lines = css.split(/\r?\n/);
const startIdx = lines.findIndex((l) => l.includes("カード面レンダラ（card-renderer.js"));
const endIdx = lines.findIndex((l) => l.includes("カード表示プレビュー（card-render-preview.js"));
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) throw new Error("markers not found: " + startIdx + "," + endIdx);
lines.splice(startIdx, endIdx - startIdx, NEW);
const out = lines.join("\n");
writeFileSync(CSS_PATH, out, "utf8");
const o = (out.match(/{/g) || []).length, c = (out.match(/}/g) || []).length;
console.log("gen-cardface-css: spliced. braces", o, c, o === c ? "BALANCED" : "MISMATCH");
