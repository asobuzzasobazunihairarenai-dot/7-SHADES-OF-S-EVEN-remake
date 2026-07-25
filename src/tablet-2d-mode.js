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

// ユーザー報告「10年前のタブレットで、対局中も再起動後の再読み込みも、盤面の一部が
// 白く壊れて表示される（Safari・Chromeどちらでも同じ）」への対応。GPU合成負荷が
// 原因とほぼ確定している既存の「タブレット点滅」と同系統の症状と判断した
// （iOSでは"Chrome"を含む全ブラウザが実質同じWebKitエンジンを使うため、ブラウザを
// 変えても症状が同じなのは、アプリ側のバグというより端末のGPU/描画エンジンの限界を
// 示す傍証になる）。壊れた画面では「オプション→2D表示に切り替える」を自分でタップ
// するのも難しいことがあるため、URLに`?flat=1`を付けて開くだけで自動的に2D表示
// （3D合成を使わない代替レイアウト）で起動できるようにした
// （例: https://.../?flat=1、`?room=`と併用可）。
function isFlatModeForcedByUrl() {
  try {
    return new URLSearchParams(window.location.search).get("flat") === "1";
  } catch (err) {
    return false;
  }
}

let enabled = isFlatModeForcedByUrl() || localStorage.getItem(STORAGE_KEY) === "1";
// ?flat=1で開いた時は、次回以降このURLを付け直さなくても2D表示のままになるよう、
// 通常の手動トグルと同じくlocalStorageにも書き込んでおく。
if (isFlatModeForcedByUrl()) localStorage.setItem(STORAGE_KEY, "1");
const listeners = [];

function apply() {
  document.body.classList.toggle("diagnostic-flatten-3d", enabled);
  // ハマりどころ（重大、ユーザー報告「2Dから3Dに戻したら盤面の傾きが変な風になる」）:
  // .game-tableの実際のtransformはmain.jsのapplyNormalFit/applyBoardZoomFitが
  // table.style.transformへ直接書き込む（インラインスタイル）方式で、resizeイベント
  // をきっかけに再計算される。このクラスをtoggleするだけでは誰も再計算のきっかけを
  // 作らないため、2D表示中に計算・書き込まれた値（2D専用の傾き・パン・拡大率）が
  // インラインスタイルとしてそのまま残り、3Dへ戻した後もそれが（本来の3D用の値を
  // 上書きしたまま）居座ってしまっていた。resizeイベントを発火させて確実に
  // 再計算させる。
  window.dispatchEvent(new Event("resize"));
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
