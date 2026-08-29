// カード面の「表示用テキスト」の言語ディスパッチャ。現在の言語(i18n)を見て、cardId ごとの
// テキストを返す。日本語(ja)は card-text.ja.js（生成物・原本）。別言語は card-text.<lang>.js を
// 同じ cardId キーで追加し、下の LANGS に載せるだけ。
//
// フォールバック方針（部分翻訳でも崩れないように）:
//  - そのカードが対象言語に無ければ、丸ごと ja を返す。
//  - 効果文/フレーバー/能力名は、対象言語のフィールドが空なら ja（原文）で表示（未訳の暫定表示）。
//  - titleRuby（ふりがな）は日本語専用。非ja言語では常に無し。
//  - カード名（name）は非ja言語のファイルだけが持つ。ja はここでは付けず、呼び出し側が
//    cards-data.js の日本語名にフォールバックする（getCardName 参照）。
import { getLang } from "./i18n.js";
import { CARD_TEXT_JA } from "./card-text.ja.js";
import { CARD_TEXT_EN } from "./card-text.en.js";
const LANGS = {
  ja: CARD_TEXT_JA,
  en: CARD_TEXT_EN,
};

export function getCardText(cardId) {
  const ja = CARD_TEXT_JA[cardId] || null;
  const lang = getLang();
  if (lang === "ja" || !LANGS[lang]) return ja;
  const loc = LANGS[lang][cardId];
  if (!loc) return ja;                       // 未翻訳カードは丸ごと ja
  if (!ja) return { ...loc, titleRuby: "" };
  const pick = (k) => (loc[k] != null && loc[k] !== "" ? loc[k] : ja[k]); // 空は原文(ja)へ
  return {
    titleRuby: "",                           // ルビは日本語専用（非jaは無し）
    flavor: pick("flavor"),
    subtitle: pick("subtitle"),
    basic: pick("basic"),
    arrival: pick("arrival"),
    hand: pick("hand"),
    name: loc.name || undefined,             // 表示名は getCardName でも引ける
  };
}

// 表示用カード名。非ja言語はテキストデータの name を返し、無ければ null
// （呼び出し側が cards-data.js の日本語名にフォールバックする）。
export function getCardName(cardId) {
  const lang = getLang();
  if (lang === "ja") return null;
  const name = LANGS[lang]?.[cardId]?.name;
  return name || null;
}

// カードの「補足」（右クリック→カード補足 / 山札一覧 / マイデッキ編集で出る解説文）。
// 日本語の原本は cards-data.js の note（アプリ全体の正）なので、ここでは非ja言語の訳だけを返し、
// 無ければ null（呼び出し側が cards-data.js の日本語 note にフォールバックする）。
export function getCardNote(cardId) {
  const lang = getLang();
  if (lang === "ja") return null;
  const note = LANGS[lang]?.[cardId]?.note;
  return note || null;
}
