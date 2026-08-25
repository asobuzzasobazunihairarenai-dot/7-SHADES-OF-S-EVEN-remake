// アプリ内でカードを「イラスト＋アプリ側のテキスト」で組み立てるレンダラ（試作・フェーズ1）。
// ユーザー相談: 現在カード画像に焼き込まれているタイトル・効果文を、アプリ側のテキスト表示に
// 置き換えたい（ブランク画像＋テキスト重ね）。将来的には正方形イラストのみからアプリ内で
// 全要素を合成し、多言語化もテキスト差し替えだけで行いたい、という構想。
//
// フェーズ1の方針: 土台画像は、全カードにcardId名で既にある cards-illust（枠＋全面イラスト、
// assets/cards-illust/${id}.webp）を使い、下半分にCSSのテキストパネル（タイトル・★基本/●到達/
// ■手札・フレーバー）を重ねる。これで連番の「テキスト無し」ブランク画像のマッピング待ちに
// ならず、33枚すべて今すぐ表示できる。あなたが見本イラスト・枠・仕切り線のアセットを用意したら、
// フェーズ2でこのCSSパネルを本物のアセットへ差し替える。
//
// テキストの元データは src/card-text.js（カード効果　テキスト.txt から生成、印字カードと一致）。
// 効果文の言い回しはこの権威ある元テキストをそのまま使う（card-effects.js の generateEffectText は
// エンジン用・将来の多言語テンプレート用に別途残す）。

import { getCardDefinition, getCardIllustPath } from "./cards-data.js";
import { getCardText } from "./card-text.js";

// 7色は既存パレット（style.css の --color-*）を使う。虹・白・黒・ノワールは単色の
// フォールバック（color-mix / border-color / box-shadow はグラデーションを受け付けないため、
// パネルの色味・仕切り線には必ず単色を使う）。
const SOLID_ACCENT = {
  red: "#c70025",
  orange: "#ee781f",
  yellow: "#fabe00",
  green: "#22ac38",
  blue: "#1bb8ce",
  pink: "#f19ec2",
  purple: "#915da3",
  rainbow: "#b07cc6",
  white: "#c9c0a8",
  black: "#3a3a44",
  noir: "#3a3a44",
};

function accentFor(color) {
  return SOLID_ACCENT[color] || "#888888";
}

// セクション本文（\n区切り。"・"始まりの行は選択肢）を行要素の配列にする。
function buildLines(text) {
  const frag = document.createDocumentFragment();
  const rawLines = String(text || "").split("\n").filter((s) => s.length > 0);
  for (const line of rawLines) {
    const div = document.createElement("div");
    if (line.startsWith("・")) {
      div.className = "card-face-subline";
      div.textContent = line;
    } else {
      div.className = "card-face-textline";
      div.textContent = line;
    }
    frag.appendChild(div);
  }
  return frag;
}

// 1つの効果セクション（基本/到達/手札）を、マーカー付きの行ブロックにする。
function buildSection(kind, marker, text) {
  if (!text) return null;
  const row = document.createElement("div");
  row.className = `card-face-effect is-${kind}`;
  const mk = document.createElement("span");
  mk.className = `card-face-marker is-${kind}`;
  mk.textContent = marker;
  mk.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "card-face-effect-body";
  body.appendChild(buildLines(text));
  row.appendChild(mk);
  row.appendChild(body);
  return row;
}

// カード面のDOMを組み立てて返す。呼び出し側は幅（と正方形のaspect-ratio）を与えるだけでよい。
// 中の文字はコンテナクエリ（cqw）でカード幅に比例して伸縮するので、どのサイズでも崩れない。
export function buildCardFace(cardId, { showFlavor = true, showFooter = true } = {}) {
  const def = getCardDefinition(cardId);
  const text = getCardText(cardId) || {};
  const color = def?.color || "white";
  const accent = accentFor(color);

  const face = document.createElement("div");
  face.className = "card-face";
  face.dataset.cardId = cardId || "";
  face.dataset.color = color;
  face.style.setProperty("--card-accent", accent);
  face.style.backgroundImage = `url("${getCardIllustPath(cardId)}")`;

  // フレーバー（上部・イラストの上に薄く重ねる）
  if (showFlavor && text.flavor) {
    const fl = document.createElement("div");
    fl.className = "card-face-flavor";
    fl.textContent = text.flavor;
    face.appendChild(fl);
  }

  // 下部テキストパネル（タイトル＋効果文）
  const panel = document.createElement("div");
  panel.className = "card-face-panel";

  const title = document.createElement("div");
  title.className = "card-face-title";
  title.textContent = def?.name || cardId || "";
  panel.appendChild(title);

  const effects = document.createElement("div");
  effects.className = "card-face-effects";
  const basic = buildSection("basic", "★", text.basic);
  const arrival = buildSection("arrival", "●", text.arrival);
  const hand = buildSection("hand", "■", text.hand);
  if (basic) effects.appendChild(basic);
  if (arrival) effects.appendChild(arrival);
  if (hand) effects.appendChild(hand);
  panel.appendChild(effects);

  face.appendChild(panel);

  if (showFooter) {
    const footer = document.createElement("div");
    footer.className = "card-face-footer";
    footer.textContent = "7 Shades of S:even  Asobuzz llc";
    face.appendChild(footer);
  }

  return face;
}
