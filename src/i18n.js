// アプリの表示言語（多言語化の土台）。まずはカードのテキスト表示に使う。既定は日本語(ja)。
// 依存ゼロの葉モジュール（他を import しない）。
//
// 重要（現状）: アプリ内にはまだ「言語セレクタ」が無い（英語UIは未完成のWIP）。ゲームは常に ja。
// - 言語を保存(localStorage)して読み戻すのは、将来アプリ内セレクタ＋アカウント同期を実装してから。
//   それまで load() は保存値を読まない（旧・カード面エディタのプレビューが localStorage に残した
//   "en" 等がゲームに漏れて英語表示になってしまうのを防ぐ。ユーザー報告2026-08-27）。
// - `?lang=en` はその1回の読み込み限りのテスト用（保存しない）。
// - カード面エディタの言語切替は「プレビュー専用の一時オーバーライド」(setPreviewLang/
//   clearPreviewLang)を使う＝保存もゲームへの反映もしない。
const KEY = "so7-lang";
export const SUPPORTED_LANGS = ["ja", "en"];
export const DEFAULT_LANG = "ja";
export const LANG_LABEL = { ja: "日本語", en: "English" };

let current = null;
let previewOverride = null; // カード面エディタのプレビュー用（非保存・ゲームへ影響しない）

function load() {
  // ?lang=en のようなURLパラメータでの上書き（この読み込み限り・保存しない）。
  try {
    const p = new URLSearchParams(location.search).get("lang");
    if (p && SUPPORTED_LANGS.includes(p)) return p;
  } catch {}
  // アプリ内に言語セレクタが無い間は既定(ja)固定（保存値は読まない）。
  return DEFAULT_LANG;
}

export function getLang() {
  if (previewOverride) return previewOverride;
  if (current == null) current = load();
  return current;
}

const listeners = new Set();
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// 将来のアプリ内言語セレクタ用（保存する）。今はどこからも呼ばれない
// （エディタは setPreviewLang を使う）。将来 load() で保存値を読み戻す実装とセットで有効化する。
export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang) || lang === getLang()) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch {}
  try { document.documentElement.setAttribute("lang", lang); } catch {}
  for (const fn of listeners) { try { fn(lang); } catch {} }
}

// カード面エディタのプレビュー用の一時オーバーライド（保存しない・ゲームの言語は変えない）。
export function setPreviewLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) return;
  previewOverride = lang;
  for (const fn of listeners) { try { fn(getLang()); } catch {} }
}
export function clearPreviewLang() {
  previewOverride = null;
  for (const fn of listeners) { try { fn(getLang()); } catch {} }
}
