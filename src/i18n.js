// アプリの表示言語（多言語化の土台）。まずはカードのテキスト表示（タイトル・効果・フレーバー）に使う。
// 既定は日本語(ja)。依存ゼロの葉モジュール（他を import しない）。
//
// 現状のスコープ: 翻訳済みなのは「カードのテキスト」だけ（card-text.ja/en.js）。メニュー等のUIは
// まだ日本語のまま（英語UIは今後）。言語セレクタ（options-menuの基本設定）で ja/en を切り替えると、
// この設定が保存(localStorage)され、カード面がその言語で再描画される。
// - `?lang=en` はURLパラメータでの一時上書き（保存しない）。
// - カード面エディタの言語切替は「プレビュー専用の一時オーバーライド」(setPreviewLang/
//   clearPreviewLang)を使う＝保存もゲームへの反映もしない（エディタで英語を見てもゲームは変わらない）。
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
  // 保存済みの言語設定（言語セレクタで選んだ値）。エディタは setPreviewLang（非保存）を使うので、
  // この KEY に書くのは setLang（＝本物の言語セレクタ）だけ＝エディタのプレビューが漏れる心配は無い。
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && SUPPORTED_LANGS.includes(saved)) return saved;
  } catch {}
  return DEFAULT_LANG;
}

export function getLang() {
  if (previewOverride) return previewOverride;
  if (current == null) {
    current = load();
    try { document.documentElement.setAttribute("lang", current); } catch {}
  }
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
