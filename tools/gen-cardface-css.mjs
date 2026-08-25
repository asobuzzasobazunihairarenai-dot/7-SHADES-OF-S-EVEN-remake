// src/card-layout-config.js からカード面のCSS（各テキスト要素の絶対配置・種別ごと）を生成し、
// src/style.css の該当ブロックへ差し込む。配置を変えたら `node tools/gen-cardface-css.mjs` で再生成。
// 位置・サイズは全て cqw（カード幅比）＝カードをどのサイズで表示しても比率が崩れない。
import { readFileSync, writeFileSync } from "node:fs";
import { LAYOUT, TYPE_GROUP, ELEMENT_META, cfVar } from "../src/card-layout-config.js";

const CSS_PATH = new URL("../src/style.css", import.meta.url);

// フォント（ユーザー指定）: フレーバー・タイトル＝FOT-マティス ProN M / 効果文＝ヒラギノ角ゴ Pro W6。
const FONT_TITLE = `"FOT-マティス ProN M", "FOT-Matisse ProN M", "Yu Mincho", serif`;
const FONT_EFFECT = `"ヒラギノ角ゴ Pro W6", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ ProN W6", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;

const BASE = `/* ===== カード面レンダラ（card-renderer.js）＝テキスト無しブランク画像＋アプリ側テキスト ===== */
/* 位置・サイズは種別ごとに要素単位で --cf-{n|e|f}-{要素}-{x|y|w|s} で調整（既定は各var()第2引数）。
   この位置ルールは tools/gen-cardface-css.mjs が src/card-layout-config.js から自動生成する。 */
.card-face {
  position: relative; aspect-ratio: 1 / 1; container-type: size;
  background-size: cover; background-position: center;
  border-radius: 4cqw; overflow: hidden; color: #2a2320;
  box-shadow: 0 0.6cqw 1.6cqw rgba(0, 0, 0, 0.35); user-select: none;
}
/* 効果セット（fx）＝基本/到達/手札を上から順に詰める。間に仕切り線（各効果の中間）。 */
.card-face-fx { display: flex; flex-direction: column; gap: 1.4cqw; }
.card-face-effect { display: flex; gap: 0.45em; align-items: flex-start; font-family: ${FONT_EFFECT}; }
.card-face-effect-body { flex: 1; min-width: 0; }
.card-face-textline { font-size: 1em; line-height: 1.28; }
.card-face-subline { font-size: 0.92em; line-height: 1.26; padding-left: 1.6em; opacity: 0.92; }
/* ●到達・■手札は正式アイコン（CSSはsrc/なので ../assets/ 参照）。★基本はマーカー無し。 */
.card-face-marker { flex: 0 0 auto; width: 1.25em; height: 1.25em; margin-top: 0.12em; background-size: contain; background-repeat: no-repeat; background-position: center; }
.card-face-marker.is-basic { display: none; }
.card-face-marker.is-arrival { background-image: url("../assets/icons/effect-arrival.png"); }
.card-face-marker.is-hand { background-image: url("../assets/icons/effect-hand.png"); }
/* おしゃれな仕切り線（中央に小さな菱形）。効果セットの各効果の間に置く。 */
.card-face-divider { display: flex; align-items: center; height: 1.2cqw; }
.card-face-divider::before, .card-face-divider::after { content: ""; height: 0.22cqw; flex: 1; background: linear-gradient(to right, transparent, color-mix(in srgb, var(--card-accent, #888) 55%, transparent)); }
.card-face-divider::after { background: linear-gradient(to left, transparent, color-mix(in srgb, var(--card-accent, #888) 55%, transparent)); }
.card-face-divider-gem { width: 1.4cqw; height: 1.4cqw; margin: 0 0.9cqw; transform: rotate(45deg); background: var(--card-accent, #888); opacity: 0.7; }
/* タイトルは全て黒文字（ユーザー指定）。ファーストのみ中央寄せ。フォント＝FOT-マティス。 */
.card-face-title { font-family: ${FONT_TITLE}; font-weight: 500; line-height: 1.08; letter-spacing: 0.2cqw; color: #141414; text-align: left; }
.card-face[data-card-type="first"] .card-face-title { text-align: center; }
/* rt は display:ruby-text のままだと transform は効かないが position:relative + top は効く（実測）。
   ルビは漢字の上に配置されたまま top（＝--cf-*-ruby-oy）で上下に微調整できる。 */
.card-face-title rt { position: relative; font-weight: 500; line-height: 1; color: #141414; font-family: ${FONT_TITLE}; }
/* 能力名《》はタイトルと同じフォント。 */
.card-face-subtitle { font-family: ${FONT_TITLE}; font-weight: 500; text-align: center; color: color-mix(in srgb, var(--card-accent, #555) 55%, #201a16); }
/* フレーバーは斜体にしない（ユーザー指摘）。フォント＝FOT-マティス。 */
.card-face-flavor { font-family: ${FONT_TITLE}; font-style: normal; text-align: center; color: #fff; line-height: 1.25; text-shadow: 0 0.4cqw 1cqw rgba(0, 0, 0, 0.85), 0 0 0.4cqw rgba(0, 0, 0, 0.6); }
/* ファーストは文字が全て白（ユーザー指定）。効果は全て中央揃え・ただしアイコン(マーカー)は左揃え。 */
.card-face[data-card-type="first"] .card-face-title,
.card-face[data-card-type="first"] .card-face-title rt,
.card-face[data-card-type="first"] .card-face-subtitle,
.card-face[data-card-type="first"] .card-face-effect { color: #fff; text-shadow: 0 0.3cqw 0.8cqw rgba(0, 0, 0, 0.7), 0 0 0.4cqw rgba(0, 0, 0, 0.5); }
.card-face[data-card-type="first"] .card-face-effect-body { text-align: center; }
/* エディタ用：要素ごとの枠（どこに何があるか分かるように） */
.card-face.cf-outline .card-face-title,
.card-face.cf-outline .card-face-flavor,
.card-face.cf-outline .card-face-subtitle,
.card-face.cf-outline .card-face-fx,
.card-face.cf-outline .card-face-effect { outline: 0.25cqw dashed rgba(0, 150, 255, 0.85); outline-offset: 0.3cqw; }
`;

// 通常・エターナルは同じグループ(std)の変数を参照＝位置調整が共通（ユーザー要望）。first は別(f)。
const TYPES = ["normal", "eternal", "first"];
let gen = "\n/* --- 各テキスト要素の絶対配置（自動生成：card-layout-config.js） --- */\n";
for (const type of TYPES) {
  const group = TYPE_GROUP[type];
  const slots = LAYOUT[group];
  for (const [el, d] of Object.entries(slots)) {
    if (el === "ruby") {
      // ルビは絶対配置ではなく、タイトル内の rt の font-size と上下微調整(position:relative + top)。
      gen += `.card-face[data-card-type="${type}"] .card-face-title rt {`
        + ` font-size: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
        + ` top: var(${cfVar(group, el, "oy")}, ${d.oy}cqw);`
        + ` }\n`;
      continue;
    }
    const sel = ELEMENT_META[el].sel;
    gen += `.card-face[data-card-type="${type}"] ${sel} {`
      + ` position: absolute;`
      + ` left: var(${cfVar(group, el, "x")}, ${d.x}cqw);`
      + ` top: var(${cfVar(group, el, "y")}, ${d.y}cqw);`
      + ` width: var(${cfVar(group, el, "w")}, ${d.w}cqw);`
      + ` font-size: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
      + ` }\n`;
  }
}

const NEW = BASE + gen;

const css = readFileSync(CSS_PATH, "utf8");
const lines = css.split(/\r?\n/);
const startIdx = lines.findIndex((l) => l.includes("カード面レンダラ（card-renderer.js"));
const endIdx = lines.findIndex((l) => l.includes("カード面エディタ（card-render-preview.js"));
if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) throw new Error("markers not found: " + startIdx + "," + endIdx);
lines.splice(startIdx, endIdx - startIdx, NEW);
const out = lines.join("\n");
writeFileSync(CSS_PATH, out, "utf8");
const o = (out.match(/{/g) || []).length, c = (out.match(/}/g) || []).length;
console.log("gen-cardface-css: spliced. braces", o, c, o === c ? "BALANCED" : "MISMATCH");
