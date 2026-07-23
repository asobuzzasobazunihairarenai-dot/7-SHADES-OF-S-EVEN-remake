// タブレットのGPU負荷起因の点滅（CLAUDE.md「タブレット点滅」参照、preserve-3d+
// perspectiveの疑似3D合成をこのタブレットのGPUが安定してレンダリングしきれていない
// ことがほぼ確定している）への当面の回避策。style.cssのbody.diagnostic-flatten-3d
// （元々はタブレット点滅の原因切り分け専用の管理者トグルで、perspective:none +
// 全要素transform-style:flatを強制する。見た目は崩れるが点滅は完全に消える）を、
// 「2D表示に切り替える」というプレイヤー向け機能としてそのまま流用する。
//
// admin.js（管理者モードのチェックボックス）とoptions-menu.js（プレイヤー向け基本
// 設定のチェックボックス）の両方から同じ状態を参照・変更できるよう、この状態自体を
// 独立したモジュールに切り出した。localStorageに保存し、次回このブラウザ/端末で
// 開いた時も同じ設定を引き継ぐ（アカウントに紐づくSupabase側の設定にはしない——
// これは「このタブレットのGPUが弱い」という端末固有の話で、他の端末（PC等）にまで
// 引き継ぐべき設定ではないため）。

const STORAGE_KEY = "so7-2d-mode";

let enabled = localStorage.getItem(STORAGE_KEY) === "1";
const listeners = [];

function apply() {
  document.body.classList.toggle("diagnostic-flatten-3d", enabled);
  for (const fn of listeners) fn(enabled);
}
apply();

export function isFlatten2dMode() {
  return enabled;
}

export function setFlatten2dMode(value) {
  enabled = !!value;
  localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  apply();
}

// admin.jsのチェックボックス・options-menu.jsのチェックボックスなど、他の場所から
// この状態が変わったことを知りたい時に使う（例: 片方のパネルを開いたまま、もう
// 片方でトグルされた場合の表示同期）。
export function onFlatten2dModeChange(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}
