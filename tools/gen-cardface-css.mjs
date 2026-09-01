// src/card-layout-config.js からカード面のCSS（各テキスト要素の絶対配置・種別ごと）を生成し、
// src/style.css の該当ブロックへ差し込む。配置を変えたら `node tools/gen-cardface-css.mjs` で再生成。
// 位置・サイズは全て cqw（カード幅比）＝カードをどのサイズで表示しても比率が崩れない。
import { readFileSync, writeFileSync } from "node:fs";
import { LAYOUT, TYPE_GROUP, ELEMENT_META, cfVar, propsFor } from "../src/card-layout-config.js";

const CSS_PATH = new URL("../src/style.css", import.meta.url);

// フォント（ユーザー指定）: フレーバー・タイトル＝FOT-マティス ProN M / 効果文＝ヒラギノ角ゴ Pro W6。
// フォント（ユーザー指定）。印刷物は タイトル系＝FOT-マティス ProN M / 効果文＝ヒラギノ角ゴ Pro W6 だが、
// どちらも市販・OS付属で、Windows/Android には入っていない（＝人によって別の書体で表示されてしまう）。
// そこで 2026-08-30、ユーザーが見比べて選んだ組み合わせ（しっぽり明朝B1 / Noto Sans JP、どちらも
// オープンソースのWebフォント）を先頭に置き、**全員が同じ見た目**になるようにした。
// 読み込みは index.html の Google Fonts の link（無い/届かない時は下の順に手元のフォントへ落ちる）。
// 太さが重要: ヒラギノ角ゴ W6 は画面上でかなり黒く出るため、代替フォントは 800〜900 まで上げないと
// 印刷物より細く見える（ユーザーが実際に見比べて確認）。太さは各ルールの font-weight で指定する。
const FONT_TITLE = `"Shippori Mincho B1", "FOT-マティス ProN M", "FOT-Matisse ProN M", "Yu Mincho", serif`;
const FONT_EFFECT = `"Noto Sans JP", "ヒラギノ角ゴ Pro W6", "Hiragino Kaku Gothic Pro", "ヒラギノ角ゴ ProN W6", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif`;

const BASE = `/* ===== カード面レンダラ（card-renderer.js）＝テキスト無しブランク画像＋アプリ側テキスト ===== */
/* 【重要】このブロックは tools/gen-cardface-css.mjs が丸ごと差し替える自動生成領域。
   ここを直接編集しても、次に再生成した時に消える（#188 で実際に3つのルールが消えた）。
   直したい時は tools/gen-cardface-css.mjs の BASE を編集してから再生成すること。 */
/* 位置・サイズは種別ごとに要素単位で --cf-{n|e|f}-{要素}-{x|y|w|s} で調整（既定は各var()第2引数）。
   この位置ルールは tools/gen-cardface-css.mjs が src/card-layout-config.js から自動生成する。
   文字サイズは全て var(--cf-fit, 1) 倍される＝効果文が枠からはみ出すカードだけ、card-renderer.js の
   自動フィット（fitCardFace）がこの変数を 1 未満にして収める。 */
.card-face {
  position: relative; aspect-ratio: 1 / 1; container-type: size;
  background-size: cover; background-position: center;
  border-radius: 4cqw; overflow: hidden; color: #2a2320;
  box-shadow: 0 0.6cqw 1.6cqw rgba(0, 0, 0, 0.35); user-select: none;
  /* 手札等の祖先コンテナが text-align:center を持つため、明示的に左寄せへ戻す
     （効果本文が中央寄せになる不具合の修正。フレーバー/サブタイトル/ファーストの
     効果本文は各自 text-align:center を明示しているので影響しない）。 */
  text-align: left;
}
/* カードスロット（.hand-card/.board-card/.hand-reveal-card/#card-preview/.stack-top 等）に
   inset:0 で被せるマウント。スロットの角丸に合わせてクリップ、スロット自身の影・比率に従う。
   container-type:size は基底 .card-face から継承（inset:0 で確定サイズになり cqw が解決する）。
   【重要】border-radius: inherit を外すと、基底の border-radius: 4cqw が「マウント自身ではなく
   祖先のコンテナ（無ければビューポート）」を基準に解決されるため、カードが丸く切り抜かれて
   見える（#188 の症状）。ここは必ず inherit のままにすること。 */
.card-face.card-face-mount {
  position: absolute; inset: 0; width: 100%; height: 100%;
  aspect-ratio: auto; border-radius: inherit; box-shadow: none;
  pointer-events: none;
}
/* モーダル等の「1枚のカード表示箱」（buildCardBox）。正方形・角丸/枠/影は呼び出し側のCSSで指定。
   テキストモードは .card-face-mount を内包、画像モードは背景画像（cover）。 */
.card-box {
  position: relative; aspect-ratio: 1 / 1; overflow: hidden;
  background-size: cover; background-position: center; background-repeat: no-repeat;
  border-radius: inherit;
}
/* 効果セット（fx）＝基本/到達/手札を上から順に詰める。間に仕切り線（各効果の中間）。 */
.card-face-fx { display: flex; flex-direction: column; gap: 1.4cqw; }
.card-face-effect { display: flex; gap: 0.45em; align-items: flex-start; font-family: ${FONT_EFFECT}; font-weight: 900; }
.card-face-effect-body { flex: 1; min-width: 0; }
.card-face-textline { font-size: 1em; line-height: 1.28; }
/* 「・」選択肢行は左インデントを設けず、普通に左詰め（ユーザー要望）。 */
.card-face-subline { font-size: 1em; line-height: 1.28; padding-left: 0; }
/* ●到達・■手札は正式アイコン（CSSはsrc/なので ../assets/ 参照）。★基本はマーカー無し。 */
.card-face-marker { flex: 0 0 auto; width: 1.25em; height: 1.25em; margin-top: 0.12em; background-size: contain; background-repeat: no-repeat; background-position: center; }
.card-face-marker.is-basic { display: none; }
.card-face-marker.is-arrival { background-image: url("../assets/icons/effect-arrival.png"); }
.card-face-marker.is-hand { background-image: url("../assets/icons/effect-hand.png"); }
/* ファーストの■アイコンは独立要素（左位置Xで配置・中央ではない。サイズは handicon-s）。 */
.card-face-hand-icon { background-image: url("../assets/icons/effect-hand.png"); background-size: contain; background-repeat: no-repeat; background-position: center; }
/* 仕切り線は原本に合わせて黒系で統一（各効果の間に置く。中央のダイヤは無し＝黒線のみ）。 */
.card-face-divider { display: flex; align-items: center; height: 1.2cqw; }
.card-face-divider::before { content: ""; height: 0.22cqw; flex: 1; background: rgba(20, 20, 20, 0.8); }
/* タイトルは全て黒文字（ユーザー指定）。ファーストのみ中央寄せ。フォント＝FOT-マティス。 */
.card-face-title { font-family: ${FONT_TITLE}; font-weight: 800; line-height: 1.08; letter-spacing: 0.2cqw; color: #141414; text-align: left; }
.card-face[data-card-type="first"] .card-face-title { text-align: center; }
/* ルビは絶対配置で base の「上」に浮かせる＝タイトルの行高に影響しない
   （ルビ有無でタイトルの縦位置がズレない）。各漢字ランを基準に中央に置き、
   translateY(=--cf-*-ruby-oy) で上下微調整（正=下）。
   【#194・重要】以前は <ruby>/<rt> で組んでいたが、**Safari は ruby 内部ボックス(rt)への
   position 指定を尊重しない**ため、iOS ではルビが行の高さを食ってタイトルが下へ押し出され、
   効果文と重なっていた（Chromiumでは正常なので手元では再現しなかった）。ruby 内部ボックスを
   やめて普通の span (.card-face-title-run / -rt) で組むことで、どのエンジンでも同じになる。
   古い ruby/rt セレクタも残してあるので、万一 ruby で組まれても崩れない。 */
.card-face-title ruby,
.card-face-title .card-face-title-run { position: relative; display: inline-block; }
.card-face-title rt,
.card-face-title .card-face-title-rt { position: absolute; left: 50%; bottom: 100%; white-space: nowrap; font-weight: 700; line-height: 1; color: #141414; font-family: ${FONT_TITLE}; }
/* 能力名《》はタイトルと同じフォント。 */
.card-face-subtitle { font-family: ${FONT_TITLE}; font-weight: 800; text-align: center; color: color-mix(in srgb, var(--card-accent, #555) 55%, #201a16); }
/* フレーバーは斜体にしない（ユーザー指摘）。フォント＝FOT-マティス。 */
.card-face-flavor { font-family: ${FONT_TITLE}; font-weight: 600; font-style: normal; text-align: center; color: #fff; line-height: 1.25; text-shadow: 0 0.4cqw 1cqw rgba(0, 0, 0, 0.85), 0 0 0.4cqw rgba(0, 0, 0, 0.6); }
/* ファーストは文字が全て白（ユーザー指定）。効果は全て中央揃え・ただしアイコン(マーカー)は左揃え。 */
.card-face[data-card-type="first"] .card-face-title,
.card-face[data-card-type="first"] .card-face-title rt,
.card-face[data-card-type="first"] .card-face-title .card-face-title-rt,
.card-face[data-card-type="first"] .card-face-subtitle,
.card-face[data-card-type="first"] .card-face-effect { color: #fff; text-shadow: 0 0.3cqw 0.8cqw rgba(0, 0, 0, 0.7), 0 0 0.4cqw rgba(0, 0, 0, 0.5); }
.card-face[data-card-type="first"] .card-face-effect-body { text-align: center; }
/* エディタ用：要素ごとの枠（どこに何があるか分かるように） */
.card-face.cf-outline .card-face-title,
.card-face.cf-outline .card-face-flavor,
.card-face.cf-outline .card-face-subtitle,
.card-face.cf-outline .card-face-fx,
.card-face.cf-outline .card-face-hand-icon,
.card-face.cf-outline .card-face-effect { outline: 0.25cqw dashed rgba(0, 150, 255, 0.85); outline-offset: 0.3cqw; }
`;

// 通常・エターナルは同じグループ(std)の変数を参照＝位置調整が共通（ユーザー要望）。first は別(f)。
const TYPES = ["normal", "eternal", "first"];
let gen = "\n/* --- 各テキスト要素の絶対配置（自動生成：card-layout-config.js） --- */\n";
for (const type of TYPES) {
  const group = TYPE_GROUP[type];
  const slots = LAYOUT[group];
  for (const [el, d] of Object.entries(slots)) {
    const sel = ELEMENT_META[el].sel;
    if (el === "ruby") {
      // rt の font-size と、中央寄せ＋上下微調整(translateY=oy)。rt は絶対配置(base の上)なので
      // 行高に影響せず、ルビ有無でタイトル位置がズレない。
      gen += `.card-face[data-card-type="${type}"] .card-face-title rt,\n.card-face[data-card-type="${type}"] .card-face-title .card-face-title-rt {`
        + ` font-size: calc(var(${cfVar(group, el, "s")}, ${d.s}cqw) * var(--cf-fit, 1));`
        + ` transform: translateX(-50%) translateY(var(${cfVar(group, el, "oy")}, ${d.oy}cqw));`
        + ` }\n`;
      continue;
    }
    if (el === "icon") {
      // アイコン（●/■マーカー）のサイズ（cqw）。
      gen += `.card-face[data-card-type="${type}"] ${sel} {`
        + ` width: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
        + ` height: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
        + ` }\n`;
      continue;
    }
    if (el === "handicon") {
      // ■アイコンを独立要素として左基準で絶対配置（中央ではない）。width=height=s(cqw)。
      gen += `.card-face[data-card-type="${type}"] ${sel} {`
        + ` position: absolute;`
        + ` left: var(${cfVar(group, el, "x")}, ${d.x}cqw);`
        + ` top: var(${cfVar(group, el, "y")}, ${d.y}cqw);`
        + ` width: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
        + ` height: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
        + ` }\n`;
      continue;
    }
    if (el === "gap") {
      // アイコン→文の間隔（効果行 flex の gap、cqw）。
      gen += `.card-face[data-card-type="${type}"] ${sel} {`
        + ` gap: var(${cfVar(group, el, "s")}, ${d.s}cqw);`
        + ` }\n`;
      continue;
    }
    if (el === "fxbasic") {
      // fx内の★基本だけ、font-size・幅・左位置(margin-left)を個別に上書き（到達/手札とは別）。
      gen += `.card-face[data-card-type="${type}"] ${sel} {`
        + ` font-size: calc(var(${cfVar(group, el, "s")}, ${d.s}cqw) * var(--cf-fit, 1));`
        + ` width: var(${cfVar(group, el, "w")}, ${d.w}cqw);`
        + ` margin-left: var(${cfVar(group, el, "mx")}, ${d.mx}cqw);`
        + ` }\n`;
      continue;
    }
    const props = propsFor(d);
    if (!props.includes("x") && !props.includes("y")) {
      // 位置を持たない＝サイズだけの上書き（例: fxbasic＝★基本の文字サイズ）。
      gen += `.card-face[data-card-type="${type}"] ${sel} {`
        + ` font-size: calc(var(${cfVar(group, el, "s")}, ${d.s}cqw) * var(--cf-fit, 1));`
        + ` }\n`;
      continue;
    }
    if (!props.includes("x")) {
      // 左位置Xを持たない＝中央配置（first）。left:50% + translateX(-50%) で幅の中央に置く。
      gen += `.card-face[data-card-type="${type}"] ${sel} {`
        + ` position: absolute; left: 50%; transform: translateX(-50%);`
        + ` top: var(${cfVar(group, el, "y")}, ${d.y}cqw);`
        + ` width: var(${cfVar(group, el, "w")}, ${d.w}cqw);`
        + ` font-size: calc(var(${cfVar(group, el, "s")}, ${d.s}cqw) * var(--cf-fit, 1));`
        + ` }\n`;
      continue;
    }
    // 左位置Xを持つ＝左基準の絶対配置（std）。
    gen += `.card-face[data-card-type="${type}"] ${sel} {`
      + ` position: absolute;`
      + ` left: var(${cfVar(group, el, "x")}, ${d.x}cqw);`
      + ` top: var(${cfVar(group, el, "y")}, ${d.y}cqw);`
      + ` width: var(${cfVar(group, el, "w")}, ${d.w}cqw);`
      + ` font-size: calc(var(${cfVar(group, el, "s")}, ${d.s}cqw) * var(--cf-fit, 1));`
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
