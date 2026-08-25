// カード効果テキスト.txt を cardId -> {basic, arrival, hand, flavor} に構造化するパーサ（検証用）。
import { readFileSync } from "node:fs";

const TXT = "./カード効果　テキスト.txt";

// cards-data.js の名前↔id（手打ちで転記。パーサ検証専用）。
const NAME_TO_ID = {
  "ジャンプ台": "red-jump-pad",
  "カウンターロック": "red-counter-lock",
  "マスチェンジ": "orange-mass-change",
  "収穫と種まき": "orange-harvest-sow",
  "手品師の技 -スリカエ-": "yellow-sleight-of-hand",
  "ザ・ギャンブル": "yellow-gamble",
  "合同建設": "green-joint-construction",
  "増殖する樹々": "green-growing-trees",
  "スラム上がりの役人": "blue-slum-official",
  "選べる罠": "blue-choosable-trap",
  "パーティー": "pink-party",
  "プレゼント": "pink-present",
  "試練の儀式": "purple-trial-ritual",
  "ゴメンナサイッ！": "purple-sorry",
  "なないろの欠片": "rainbow-shard",
  "なないろの巨光": "white-radiance",
  "白の意思の覚醒": "white-awakening",
  "色落ちキャット": "black-faded-cat",
  "誘惑の黒の烙印": "black-contract-brand",
  "黒の契約の烙印": "black-contract-brand", // 旧名
  "紅蓮の火山 ワイナウエア": "eternal-red",
  "禁断の果実 マルメゴ": "eternal-orange",
  "黄金の宮殿 ドムス・ネロ": "eternal-yellow",
  "奇跡の森 マンズウッド": "eternal-green",
  "月下の漂流船 プリドゥエン": "eternal-blue",
  "結ばれの一本桜 コノハナサクヤ": "eternal-pink",
  "終わりなき化学 ゲンテクニーク": "eternal-purple",
  "赤のキューブ フェニックス": "first-red",
  "橙のキューブ ハーベスト": "first-orange",
  "黄のキューブ サフラン": "first-yellow",
  "緑のキューブ ヴァーディアン": "first-green",
  "青のキューブ セレスティア": "first-blue",
  "桃のキューブ セレナーデ": "first-pink",
  "紫のキューブ ディメンション": "first-purple",
  "黒のキューブ ノワール": "first-noir",
};

const norm = (s) => s.replace(/[\s\u3000]/g, "").replace(/[－ー−]/g, "-");
const idByNorm = new Map(Object.entries(NAME_TO_ID).map(([n, id]) => [norm(n), id]));

const raw = readFileSync(TXT, "utf8");
const lines = raw.split(/\r?\n/);

const SEP = /^[＿_]{3,}$/;
const result = {};
let cur = null;
let inNote = false;
let activeSection = null; // 直近に見た ● or ■（効果セクション中の "・" 選択肢はここに追記）

const append = (id, key, text) => { result[id][key] += (result[id][key] ? "\n" : "") + text; };

let pendingRuby = ""; // "・名前"行の直前にある全角スペース始まりの読み行（例: "　ぐれん　かざん"）
const RUBY_LINE = /^[ 　]+\S/; // 行頭が空白（半角/全角）で始まる
const HAS_KANA = /[぀-ゟ]/;

for (const line of lines) {
  const t = line.trim();
  if (SEP.test(t)) { cur = null; inNote = false; activeSection = null; pendingRuby = ""; continue; }
  // ふりがな行: "・名前"の直前、行頭が空白で、ひらがなを含み、マーカーで始まらない行を保留する。
  if (!inNote && RUBY_LINE.test(line) && HAS_KANA.test(t) && !t.startsWith("・") && !/^[★●■ΩΘ※]/.test(t)) {
    pendingRuby = t; continue;
  }
  if (t.startsWith("・")) {
    const text = t.slice(1).trim();
    // 効果セクション中（●や■の後）の "・" は選択肢＝そのセクションへ追記。それ以外は新カード名。
    if (cur && activeSection && !inNote) { append(cur.id, activeSection, "・" + text); pendingRuby = ""; continue; }
    const id = idByNorm.get(norm(text));
    cur = id ? { id, name: text } : null;
    inNote = false; activeSection = null;
    if (id) result[id] = { flavor: "", basic: "", subtitle: "", arrival: "", hand: "", titleRuby: pendingRuby };
    else if (text) console.warn("UNMATCHED name:", JSON.stringify(text));
    pendingRuby = "";
    continue;
  }
  pendingRuby = "";
  if (!cur) continue;
  if (t.startsWith("※")) { inNote = true; activeSection = null; continue; }
  if (inNote) continue;
  if (t.startsWith("Ω")) result[cur.id].flavor = t.slice(1).trim();
  else if (t.startsWith("Θ")) { result[cur.id].subtitle = t.slice(1).trim(); activeSection = null; }
  else if (t.startsWith("★")) { append(cur.id, "basic", t.slice(1).trim()); activeSection = "basic"; }
  else if (t.startsWith("●")) { append(cur.id, "arrival", t.slice(1).trim()); activeSection = "arrival"; }
  else if (t.startsWith("■")) { append(cur.id, "hand", t.slice(1).trim()); activeSection = "hand"; }
  else if (activeSection && t) { append(cur.id, activeSection, t); } // 折り返しの続き行
}

const ids = Object.keys(result);
console.log("matched cards:", ids.length);
const expected = new Set(Object.values(NAME_TO_ID));
const missing = [...expected].filter((id) => !result[id]);
console.log("missing (expected but not parsed):", missing);

// サンプル出力
for (const id of ["red-jump-pad", "red-counter-lock", "first-red", "eternal-pink", "rainbow-shard"]) {
  console.log("\n---", id, "---");
  console.log(JSON.stringify(result[id], null, 2));
}

// --- src/card-text.js を生成 ---
import { writeFileSync } from "node:fs";
const ORDER = [
  "red-jump-pad","red-counter-lock","orange-mass-change","orange-harvest-sow",
  "yellow-sleight-of-hand","yellow-gamble","green-joint-construction","green-growing-trees",
  "blue-slum-official","blue-choosable-trap","pink-party","pink-present",
  "purple-trial-ritual","purple-sorry","rainbow-shard","white-radiance","white-awakening",
  "black-faded-cat","black-contract-brand",
  "eternal-red","eternal-orange","eternal-yellow","eternal-green","eternal-blue","eternal-pink","eternal-purple",
  "first-red","first-orange","first-yellow","first-green","first-blue","first-pink","first-purple","first-noir",
];
const q = (s) => JSON.stringify(s || "");
let out = `// AUTO-GENERATED（カード効果　テキスト.txt から scratchpad/parse-card-text.mjs で生成）。手編集しないこと。\n`;
out += `// アプリ内でカードのタイトル横に重ねて表示する「表示用テキスト」。★基本効果 / ●到達効果 / ■手札効果 / flavor(Ω)。\n`;
out += `// 元テキスト（テキスト印字カードと一致）を単一の情報源として持つ。将来の多言語化では\n`;
out += `// このファイルを ja とし、同じ cardId キーで別言語ファイルを追加する。\n`;
out += `export const CARD_TEXT = {\n`;
for (const id of ORDER) {
  const r = result[id];
  if (!r) { console.warn("ORDER missing in result:", id); continue; }
  out += `  ${JSON.stringify(id)}: { flavor: ${q(r.flavor)}, titleRuby: ${q(r.titleRuby)}, basic: ${q(r.basic)}, subtitle: ${q(r.subtitle)}, arrival: ${q(r.arrival)}, hand: ${q(r.hand)} },\n`;
}
out += `};\n\nexport function getCardText(cardId) {\n  return CARD_TEXT[cardId] || null;\n}\n`;
writeFileSync("./src/card-text.js", out, "utf8");
console.log("\nwrote src/card-text.js (" + ORDER.length + " cards)");
