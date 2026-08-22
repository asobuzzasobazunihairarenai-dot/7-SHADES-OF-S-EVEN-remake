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

import { setFlightAnimationDisabled, setArrivalEffectDisabled, setContinuousGlowDisabled } from "./motion-prefs.js";

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

// 2.5D実験（続き242。ユーザー要望2026-08-22「駒/山が2D化するのは寂しい→2.5Dを試す。
// ただし本編には影響しないように」）。フラット合成（perspective/preserve-3dを使わない＝
// ちらつきの根本対応）の中で、駒・山を「上面＋側面2枚を2Dで描いた立体トークン」に
// 見せる実験。本編（PCの3D・通常のフラット表示）には一切影響させないため、既定OFF・
// `?iso=1` で開いた時だけ有効（localStorageに保存、`?iso=0`で解除）。2.5Dはフラット
// 合成の中でしか意味がないので、iso有効時はフラット表示も自動的に有効化する。
const ISO_STORAGE_KEY = "so7-iso25d";
function isoUrlParam() {
  try {
    return new URLSearchParams(window.location.search).get("iso");
  } catch (err) {
    return null;
  }
}
let iso25d = false;
{
  const p = isoUrlParam();
  if (p === "1") iso25d = true;
  else if (p === "0") iso25d = false;
  else iso25d = localStorage.getItem(ISO_STORAGE_KEY) === "1";
  // URLで明示された時は次回以降のために保存（?flat=1と同じ考え方）。
  if (p === "1" || p === "0") localStorage.setItem(ISO_STORAGE_KEY, iso25d ? "1" : "0");
}

let enabled = isFlatModeForcedByUrl() || iso25d || localStorage.getItem(STORAGE_KEY) === "1";
// ?flat=1で開いた時は、次回以降このURLを付け直さなくても2D表示のままになるよう、
// 通常の手動トグルと同じくlocalStorageにも書き込んでおく。iso有効時もフラットが前提。
if (isFlatModeForcedByUrl() || iso25d) localStorage.setItem(STORAGE_KEY, "1");

// ユーザー報告「2D表示は既にオンにしていたが、Firefoxを入れて試しても途中で画面の
// 半分が壊れる」への対応。2D表示（perspective/preserve-3d）を切っても直らなかった
// ことから、犯人は3D変形ではなく`filter: blur()`・`mix-blend-mode`を使う演出
// （オープニング画面の7色オーラの軌跡・到達演出のバースト・常時光る演出等、
// いずれもGPU合成が重い）だと判断した。motion-prefs.jsの「アニメーションを
// 減らす」3設定はセッション限りで持続しない仕様のため、`?flat=1`で開いた時は
// まとめて有効化しておく（オプション画面の3つのチェックボックスを壊れた画面上で
// 個別にタップしてもらう必要が無いようにするため）。
if (isFlatModeForcedByUrl() || isoUrlParam() === "1") {
  setFlightAnimationDisabled(true);
  setArrivalEffectDisabled(true);
  setContinuousGlowDisabled(true);
}
const listeners = [];

function apply() {
  document.body.classList.toggle("diagnostic-flatten-3d", enabled);
  // 2.5D実験フラグ（iso有効時はフラットも必ずオン＝enabled優先）。本編には影響しない
  // よう、body.iso25d は ?iso=1 で明示された時だけ付く。
  document.body.classList.toggle("iso25d", iso25d && enabled);
  // ハマりどころ（重大、ユーザー報告「2Dから3Dに戻したら盤面の傾きが変な風になる」）:
  // .game-tableの実際のtransformはmain.jsのapplyNormalFit/applyBoardZoomFitが
  // table.style.transformへ直接書き込む（インラインスタイル）方式で、resizeイベント
  // をきっかけに再計算される。このクラスをtoggleするだけでは誰も再計算のきっかけを
  // 作らないため、2D表示中に計算・書き込まれた値（2D専用の傾き・パン・拡大率）が
  // インラインスタイルとしてそのまま残り、3Dへ戻した後もそれが（本来の3D用の値を
  // 上書きしたまま）居座ってしまっていた。resizeイベントを発火させて確実に
  // 再計算させる。
  window.dispatchEvent(new Event("resize"));
  updateModeBadge();
  for (const fn of listeners) fn(enabled);
}

// 「今どの描画モードか」を画面左上に小さく表示する（続き243。ユーザーが ?iso=1 と ?flat=1 の
// どちらが効いているか判別できず混乱したため）。フラット/iso が有効な時だけ出す＝本編（通常の
// 3D表示）では一切出ない。pointer-events:none で操作の邪魔もしない。
function updateModeBadge() {
  let badge = document.getElementById("so7-render-mode-badge");
  if (!enabled) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "so7-render-mode-badge";
    badge.style.cssText =
      "position:fixed;left:4px;top:4px;z-index:2147483647;pointer-events:none;" +
      "font:700 11px/1.2 monospace;color:#fff;background:rgba(0,0,0,0.62);" +
      "padding:2px 6px;border-radius:4px;white-space:nowrap;";
    document.body.appendChild(badge);
  }
  badge.textContent = iso25d ? "描画: 2.5D (iso)" : "描画: 2D (素・駒フラット)";
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

// 2.5D実験（続き242）。iso有効時はフラットも必ずオンにする（2.5Dは2D合成の中でしか
// 意味がないため）。setIso25dMode(false)ではフラット自体は変えない（フラットは別設定）。
export function isIso25dMode() {
  return iso25d && enabled;
}
export function setIso25dMode(value) {
  iso25d = !!value;
  localStorage.setItem(ISO_STORAGE_KEY, iso25d ? "1" : "0");
  if (iso25d) {
    enabled = true;
    localStorage.setItem(STORAGE_KEY, "1");
  }
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
