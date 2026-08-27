// アプリの表示言語（多言語化の土台）。まずはカードのテキスト表示に使う。既定は日本語(ja)。
// この端末に localStorage で保存。将来アカウント同期する場合は so7_user_profiles に lang 列を1つ
// 足して online.js の loadMyPreferences/saveMyPreference に載せるだけ（既存の設定同期と同じ形）。
// 依存ゼロの葉モジュール（他を import しない）。
const KEY = "so7-lang";
export const SUPPORTED_LANGS = ["ja", "en"];
export const DEFAULT_LANG = "ja";
export const LANG_LABEL = { ja: "日本語", en: "English" };

let current = null;

function load() {
  // ?lang=en のようなURLパラメータでの上書き（テスト・共有用。指定したら保存する）。
  try {
    const p = new URLSearchParams(location.search).get("lang");
    if (p && SUPPORTED_LANGS.includes(p)) {
      try { localStorage.setItem(KEY, p); } catch {}
      return p;
    }
  } catch {}
  try {
    const v = localStorage.getItem(KEY);
    if (SUPPORTED_LANGS.includes(v)) return v;
  } catch {}
  return DEFAULT_LANG;
}

export function getLang() {
  if (current == null) current = load();
  return current;
}

const listeners = new Set();
export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function setLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang) || lang === getLang()) return;
  current = lang;
  try { localStorage.setItem(KEY, lang); } catch {}
  try { document.documentElement.setAttribute("lang", lang); } catch {}
  for (const fn of listeners) { try { fn(lang); } catch {} }
}
