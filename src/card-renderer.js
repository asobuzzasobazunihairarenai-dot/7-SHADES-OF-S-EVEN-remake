// アプリ内でカードを「テキスト無しブランク画像＋アプリ側テキスト」で組み立てるレンダラ。
// ユーザー合意: 枠・仕切り線の装飾・イラスト・エンブレム・色枠は画像（assets/cards-blank/）が
// 持ち、タイトル・効果文・フレーバー・能力名などの「テキストだけ」をアプリが重ねて表示する。
// これにより効果文の修正が全表示へ即反映でき、将来の多言語化もテキスト差し替えだけで済む。
//
// カードは3レイアウトで別物（ユーザー指摘「ファーストはまたデザインが異なる」）:
//  - normal : フレーバー(上) ＋ 下部に タイトル＋●到達＋■手札（下パネル領域に重ねる）
//  - eternal: フレーバー(上) ＋ 下部に タイトル＋★基本＋■手札（能力名《》は■文にインライン）
//  - first  : ★基本(上) ＋ タイトル(中上) ＋ 《能力名》(中) ＋ ■手札(下)。イラスト無し・エンブレム中心。
// 効果セクションを仕切る「おしゃれな横線」はアプリ側（CSS）で描く（ユーザー依頼）。
//
// テキストの元データは src/card-text.js（カード効果　テキスト.txt から生成、印字カードと一致）。
// ★基本 / ●到達 / Θ効果名(subtitle) / ■手札 / Ωフレーバー。

import { getCardDefinition, getCardBlankPath } from "./cards-data.js";
import { getCardText, getCardName } from "./card-text.js";
import { getLang } from "./i18n.js";
import { LAYOUT, cardTypeOf, groupOf } from "./card-layout-config.js";

// 能力名《》・マーカー等の色味には単色を使う（color-mix/border-color はグラデーション不可）。
const SOLID_ACCENT = {
  red: "#c70025", orange: "#ee781f", yellow: "#fabe00", green: "#22ac38",
  blue: "#1bb8ce", pink: "#f19ec2", purple: "#915da3",
  rainbow: "#b07cc6", white: "#c9c0a8", black: "#3a3a44", noir: "#3a3a44",
};
function accentFor(color) { return SOLID_ACCENT[color] || "#888888"; }

// セクション本文（\n区切り。"・"始まりの行は選択肢）を行要素にする。
function buildLines(text) {
  const frag = document.createDocumentFragment();
  for (const line of String(text || "").split("\n").filter((s) => s.length > 0)) {
    const div = document.createElement("div");
    div.className = line.startsWith("・") ? "card-face-subline" : "card-face-textline";
    div.textContent = line;
    frag.appendChild(div);
  }
  return frag;
}

// 効果セクション（★基本/●到達/■手札）を、マーカー付きの行ブロックにする。
// ●到達・■手札のマーカーは正式なアイコン画像（CSS background-image、is-arrival/is-hand）。
// ★基本はマーカー非表示（印字カードに合わせる）。
// opts.effectClass で要素クラスを、opts.markerKind でマーカー種別を上書き可（null でマーカー無し）。
function buildSection(kind, text, opts = {}) {
  const row = document.createElement("div");
  row.className = `card-face-effect ${opts.effectClass || `is-${kind}`}`;
  const markerKind = opts.markerKind === null ? null : (opts.markerKind || kind);
  if (markerKind !== null) {
    const mk = document.createElement("span");
    mk.className = `card-face-marker is-${markerKind}`;
    mk.setAttribute("aria-hidden", "true");
    row.appendChild(mk);
  }
  const body = document.createElement("div");
  body.className = "card-face-effect-body";
  body.appendChild(buildLines(text));
  row.appendChild(body);
  return row;
}

// ファーストの手札効果を「【…】（…）」の部分（追色コスト）と、それ以降の効果本文に分ける。
// 例:「【追色１】（これと同色の…得る。）捨て場の…加える。」→ { cost:"【追色１】（…）", rest:"捨て場の…" }
// 括弧は全角（）でも半角()でも可（多言語対応：英語は 【Color Cost 1】(...) のようにASCII括弧を使う）。
function splitFirstHandCost(text) {
  const m = String(text || "").match(/^(【[^】]*】\s*[（(][^）)]*[）)])\s*([\s\S]*)$/);
  if (!m) return null;
  return { cost: m[1], rest: m[2].trim() };
}

// タイトルにふりがな（ルビ）を振る。titleRuby は空白区切りの読み（例 "ぐれん　かざん"）で、
// タイトル中の「漢字の連続」に順番で対応する（紅蓮→ぐれん, 火山→かざん）。数が合わない時は
// 誤ったルビを避けてルビ無しにフォールバックする。
const KANJI_RE = /[一-鿿々〆〇]/;
function applyTitleRuby(el, name, rubyStr) {
  el.textContent = "";
  const readings = String(rubyStr || "").split(/[\s　]+/).filter(Boolean);
  if (!readings.length) { el.textContent = name; return; }
  // name を「漢字の連続」と「それ以外」のランに分割
  const runs = [];
  let i = 0;
  while (i < name.length) {
    const isK = KANJI_RE.test(name[i]);
    let j = i + 1;
    while (j < name.length && KANJI_RE.test(name[j]) === isK) j++;
    runs.push({ text: name.slice(i, j), kanji: isK });
    i = j;
  }
  const kanjiRunCount = runs.filter((r) => r.kanji).length;
  if (kanjiRunCount !== readings.length) { el.textContent = name; return; }
  let ri = 0;
  for (const run of runs) {
    if (run.kanji) {
      // 【#194】<ruby>/<rt> は使わない。Safari が ruby 内部ボックスへの position 指定を
      // 尊重せず、ルビが行の高さを食ってタイトルが下へ押し出される（＝効果文と重なる）ため。
      // 普通の span なら、どのエンジンでも「ベースの真上に浮かせる」が同じように効く。
      const base = document.createElement("span");
      base.className = "card-face-title-run";
      base.textContent = run.text;
      const rt = document.createElement("span");
      rt.className = "card-face-title-rt";
      rt.setAttribute("aria-hidden", "true"); // 読み上げでは本文（漢字）だけでよい
      rt.textContent = readings[ri++];
      base.appendChild(rt);
      el.appendChild(base);
    } else {
      el.appendChild(document.createTextNode(run.text));
    }
  }
}

function divEl(cls, textContent) {
  const el = document.createElement("div");
  el.className = cls;
  if (textContent != null) el.textContent = textContent;
  return el;
}

// 仕切り線（黒系の線のみ・中央のダイヤは無し）。効果セットの各効果の間に置く。
function buildDivider() {
  const d = document.createElement("div");
  d.className = "card-face-divider";
  d.setAttribute("aria-hidden", "true");
  return d;
}


// ===== 効果文が「印刷された枠」からはみ出さないよう、文字サイズを自動で縮める =====
// ブランク画像を実測すると、下パネルの下辺はカード高さの約95.4%（ファーストは約94.9%）。
// テキストがそこを越えると、枠の外（イラストの上）に文がはみ出して見える
// （実例: なないろの欠片は日本語でも英語でもはみ出していた）。
//
// カード面の寸法は全て cqw（カード幅比）なので、はみ出すかどうかは「カードid＋言語」だけで決まり、
// 表示サイズには依らない。そこで初回だけ画面外で実測し、収まる倍率（--cf-fit）を求めて覚えておく。
// CSSの font-size は全て calc(… * var(--cf-fit, 1)) になっている（tools/gen-cardface-css.mjs）。
const FIT_LIMIT_PCT = 94.2; // 枠の下辺の少し内側（余白を見込む）
const FIT_MIN = 0.72;       // これ以上は縮めない（小さすぎると読めないため）
const FIT_STEP = 0.02;
const fitCache = new Map(); // "cardId|lang" -> 倍率
let measuringFit = false;   // 実測中の再帰防止（実測用の面は自動フィットを掛けない）

// 実測用の隠しホスト（カード1枚分。container-type: inline-size が cqw の基準になる）。
let fitHostEl = null;
function getFitHost() {
  if (fitHostEl && fitHostEl.isConnected) return fitHostEl;
  fitHostEl = document.createElement("div");
  fitHostEl.setAttribute("aria-hidden", "true");
  fitHostEl.style.cssText =
    "position:fixed;left:-99999px;top:0;width:433px;height:433px;pointer-events:none;" +
    "visibility:hidden;container-type:inline-size;z-index:-1;";
  document.body.appendChild(fitHostEl);
  return fitHostEl;
}

// face 内の一番下のテキストの下端が、カード高さの何%かを返す。
function deepestTextPct(face, hostRect) {
  let deepest = 0;
  for (const el of face.querySelectorAll(".card-face-flavor, .card-face-title, .card-face-subtitle, .card-face-effect, .card-face-fx")) {
    const r = el.getBoundingClientRect();
    if (r.height === 0) continue;
    const pct = ((r.bottom - hostRect.top) / hostRect.height) * 100;
    if (pct > deepest) deepest = pct;
  }
  return deepest;
}

// このカード（現在の言語）が枠に収まる倍率を求める。1 なら縮小不要。
function computeFit(cardId) {
  if (typeof document === "undefined" || !document.body) return 1;
  const host = getFitHost();
  measuringFit = true;
  try {
    host.innerHTML = "";
    const face = buildCardFace(cardId);
    host.appendChild(face);
    const hostRect = host.getBoundingClientRect();
    let fit = 1;
    while (deepestTextPct(face, hostRect) > FIT_LIMIT_PCT && fit > FIT_MIN) {
      fit = Math.round((fit - FIT_STEP) * 100) / 100;
      face.style.setProperty("--cf-fit", String(fit));
    }
    host.innerHTML = "";
    return fit;
  } catch (e) {
    return 1; // 実測できない環境でも従来通り（等倍）に倒す
  } finally {
    measuringFit = false;
  }
}

function fitFor(cardId) {
  if (measuringFit || !cardId) return 1;
  const key = cardId + "|" + getLang();
  if (!fitCache.has(key)) fitCache.set(key, computeFit(cardId));
  return fitCache.get(key);
}

// カード面エディタ（card-render-preview.js）が配置用のCSS変数をいじった時に呼ぶ。
// 変数が変われば収まり方も変わるため、覚えている倍率を捨てて測り直させる。
export function clearCardFaceFitCache() {
  fitCache.clear();
}

// カード面のDOMを組み立てて返す。各テキスト要素は種別ごとに絶対配置（CSS＝card-layout-config.js由来）。
// 中の文字はコンテナクエリ(cqw)でカード幅に比例＝どのサイズでも比率が崩れない。
// その種別の config に定義された要素だけを描画する（＝必ず位置ルールが存在する）。
// 効果は fx スロットがあれば「基本/到達/手札」を1つのセット(.card-face-fx)にまとめ、上から詰めて
// 各効果の間に仕切り線を置く。fx が無い種別（first）は基本/手札を個別に絶対配置する。
export function buildCardFace(cardId, { showFlavor = true } = {}) {
  const def = getCardDefinition(cardId);
  const text = getCardText(cardId) || {};
  const color = def?.color || "white";
  const type = cardTypeOf(cardId);
  const slots = LAYOUT[groupOf(cardId)] || {};

  const face = document.createElement("div");
  face.className = "card-face";
  face.dataset.cardId = cardId || "";
  face.dataset.color = color;
  face.dataset.cardType = type;
  face.dataset.lang = getLang(); // 英語用レイアウト上書き（style.css の .card-face[data-lang="en"]）用

  face.style.setProperty("--card-accent", accentFor(color));
  face.style.backgroundImage = `url("${getCardBlankPath(cardId)}")`;

  // 個別に絶対配置する要素（config にスロットがある時だけ描画）。
  if ("flavor" in slots && showFlavor && text.flavor) {
    face.appendChild(divEl("card-face-flavor", text.flavor));
  }
  if ("title" in slots) {
    const title = divEl("card-face-title");
    // 表示名は言語データの name（非ja）→ 無ければ cards-data.js の日本語名。
    const displayName = getCardName(cardId) || def?.name || cardId || "";
    applyTitleRuby(title, displayName, text.titleRuby);
    face.appendChild(title);
  }
  if ("sub" in slots && text.subtitle) face.appendChild(divEl("card-face-subtitle", text.subtitle));

  if ("fx" in slots) {
    // 効果セット：基本→到達→手札を上から詰め、間に仕切り線。
    const sections = [];
    if (text.basic) sections.push(buildSection("basic", text.basic));
    if (text.arrival) sections.push(buildSection("arrival", text.arrival));
    if (text.hand) sections.push(buildSection("hand", text.hand));
    if (sections.length) {
      const fx = document.createElement("div");
      fx.className = "card-face-fx";
      sections.forEach((sec, i) => {
        if (i > 0) fx.appendChild(buildDivider());
        fx.appendChild(sec);
      });
      face.appendChild(fx);
    }
  } else {
    // first: 効果も個別に絶対配置。手札効果は「【追色】部分」と「効果本文」を別要素に分ける。
    if ("basic" in slots && text.basic) face.appendChild(buildSection("basic", text.basic));
    if ("arrival" in slots && text.arrival) face.appendChild(buildSection("arrival", text.arrival));
    if ("hand" in slots && text.hand) {
      const split = ("handcost" in slots) ? splitFirstHandCost(text.hand) : null;
      if (split) {
        // ■アイコンは独立要素（左位置調整）。テキスト（【追色】部分＋本文）はマーカー無し・中央。
        if ("handicon" in slots) {
          const ic = document.createElement("span");
          ic.className = "card-face-hand-icon";
          ic.setAttribute("aria-hidden", "true");
          face.appendChild(ic);
        }
        face.appendChild(buildSection("hand", split.cost, { effectClass: "is-hand-cost", markerKind: null }));
        if (split.rest) face.appendChild(buildSection("hand", split.rest, { markerKind: null }));
      } else {
        face.appendChild(buildSection("hand", text.hand));
      }
    }
  }

  const fit = fitFor(cardId);
  if (fit !== 1) face.style.setProperty("--cf-fit", String(fit));

  return face;
}
