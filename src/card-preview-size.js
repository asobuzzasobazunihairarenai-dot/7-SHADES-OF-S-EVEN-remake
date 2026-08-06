// カード拡大プレビューのサイズ（CSS変数 --card-preview-size）を端末に保存し、起動時に復元する。
// このサイズは純粋な「見た目の好み」で、初回設定モーダル(first-run-bgm.js)とオプションの
// 基本設定(options-menu.js)の両方から調整できる。どちらで変えても次回以降まで保たれるよう、
// localStorageへ保存する。
//
// 補足: 管理者モードのCSS変数調整はセッション限りの運用（admin.jsの方針コメント参照）だが、
// これは一般ユーザー向けの明示的な好み設定なので、端末に保存して継続させるのが自然と判断した。
// 保存が無ければ style.css の :root 既定値（20rem）がそのまま使われる。

const KEY = "so7-card-preview-size-rem";
const MIN = 8;
const MAX = 36;

function clamp(v) {
  return Math.min(MAX, Math.max(MIN, v));
}

// 起動時に一度呼ぶ。保存済みの好みがあればCSS変数へ復元する（無ければ何もしない＝既定値）。
export function applyStoredCardPreviewSize() {
  try {
    const v = parseFloat(localStorage.getItem(KEY));
    if (Number.isFinite(v)) {
      document.documentElement.style.setProperty("--card-preview-size", `${clamp(v)}rem`);
    }
  } catch {
    /* localStorageが使えない環境でも既定サイズで問題なく動く */
  }
}

// スライダー操作時に呼ぶ。CSS変数へ即反映し、端末へ保存し、再描画を促す（admin:change）。
export function setCardPreviewSize(rem) {
  const v = clamp(rem);
  document.documentElement.style.setProperty("--card-preview-size", `${v}rem`);
  try {
    localStorage.setItem(KEY, String(v));
  } catch {
    /* 保存できなくても、そのセッションの間は見た目に反映される */
  }
  window.dispatchEvent(new CustomEvent("admin:change"));
  return v;
}
