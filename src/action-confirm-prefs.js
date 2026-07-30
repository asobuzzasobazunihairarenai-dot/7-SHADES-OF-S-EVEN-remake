// 「ロックする前・手札を使う前」の確認モーダル（main.jsのconfirmTouchAction）を
// 表示するかどうかの設定。ユーザー要望「スマホ時にやっているロック前/手札使用前の確認
// モーダルを、PC・タブレットでも出す。モーダルには小さく『今後このモーダルを表示しない』を
// 置き、再表示はオプションの基本設定から戻せるように」。
//
// 以前は confirmTouchAction がタッチ端末でのみモーダルを出し、PCでは即実行していた。
// この設定を導入し、全デバイスで（この設定がONの間だけ）確認モーダルを出すようにする。
// オフ（＝今後表示しない）はこのブラウザに永続化する（localStorage）。ページを再読み込み
// しても保持され、オプションの基本設定のチェックで再度ONに戻せる。
const STORAGE_KEY = "so7-action-confirm-enabled";

function load() {
  try {
    // 既定は「表示する」(true)。明示的に "0" が保存されている時だけ非表示。
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch (err) {
    return true;
  }
}

let enabled = load();

export function isActionConfirmEnabled() {
  return enabled;
}

export function setActionConfirmEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch (err) {
    // localStorageが使えない環境でも致命的ではない（セッション内は保持される）
  }
  // オプション画面のチェックボックス表示を最新化するため（options-menu.jsが購読）。
  window.dispatchEvent(new CustomEvent("action-confirm-pref-changed"));
}
