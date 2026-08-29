// ヘルプページのデータ（用語集・よくある質問・デジタル版独自機能）の言語ディスパッチャ。
// 日本語の原本は help-content.ja.js（説明書.txt からの採録）、英語は help-content.en.js。
// card-text.js（カード面テキスト）と同じ考え方: 現在の言語(i18n)を見て中身を選ぶ。
//
// 【重要】これらは「関数」で返す。以前は定数をそのまま export していたが、それだと
// 読み込んだ瞬間の言語で中身が固定され、あとから言語を切り替えても変わらなくなる
// （UI英語化フェーズ7で PILE_CONFIG に対して同じ問題を踏んだ）。呼び出し側は
// 表示のたびに getGlossary() のように呼ぶこと。
import { getLang } from "./i18n.js";
import { DIGITAL_FEATURES, GLOSSARY, FAQ_CATEGORIES } from "./help-content.ja.js";
import { DIGITAL_FEATURES_EN, GLOSSARY_EN, FAQ_CATEGORIES_EN } from "./help-content.en.js";

const BY_LANG = {
  ja: { features: DIGITAL_FEATURES, glossary: GLOSSARY, faq: FAQ_CATEGORIES },
  en: { features: DIGITAL_FEATURES_EN, glossary: GLOSSARY_EN, faq: FAQ_CATEGORIES_EN },
};

function pack() {
  return BY_LANG[getLang()] || BY_LANG.ja;
}

export function getDigitalFeatures() {
  return pack().features;
}

export function getGlossary() {
  return pack().glossary;
}

export function getFaqCategories() {
  return pack().faq;
}
