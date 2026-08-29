// 全画面表示の切り替えアイコン（ユーザー要望2026-08-18「ブラウザのタブ/URL欄/ブックマーク
// バーが邪魔なので全画面表示にしたい。オプションエリアの『不具合報告』と『2D/3D切替』の間、
// およびオプションメニュー内にボタンを追加」）。ブラウザの Fullscreen API を使う（ユーザー操作
// 起点でないと発動できない仕様のため、ボタンのクリックから呼ぶ）。iPhoneのSafariのように
// 要素の全画面化に非対応の環境では、ボタンを押しても何も起きない（安全にno-op）。
// board-view-toggle.js と同じ buildIconButtonContent / wireIconButtonClick パターン。

import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getOptionArea } from "./option-area.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

// 全画面の入/出アイコン（角ブラケット）。外部アセットに頼らずインラインSVGのdata URIで持つ。
function svgIcon(paths) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}
// 入る＝外向きの角（広がる）。出る＝内向きの角（縮む）。
const ICON_ENTER = svgIcon("<path d='M4 9V4h5'/><path d='M20 9V4h-5'/><path d='M4 15v5h5'/><path d='M20 15v5h-5'/>");
const ICON_EXIT = svgIcon("<path d='M9 4v5H4'/><path d='M15 4v5h5'/><path d='M9 20v-5H4'/><path d='M15 20v-5h5'/>");

function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}
export function isFullscreenActive() {
  return !!fullscreenElement();
}
// 全画面をトグルする。プレフィックス（Safari）差を吸収。失敗は握りつぶす。
export function toggleFullscreen() {
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    } else {
      const el = document.documentElement;
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    }
  } catch (e) {
    // ユーザーが拒否した／未対応など。何もしない。
  }
}
// 全画面が使えるか（ボタンの表示可否の判定用）。iPhoneのSafari等は非対応。
export function isFullscreenSupported() {
  const el = document.documentElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

// ユーザー要望2026-08-24「スマホ/タブレットで起動時に横向き警告が出るが、そもそも横向き固定に
// できないか」。Web からOSの回転ロックは解除できないが、全画面表示中は Screen Orientation API の
// lock('landscape') で横向きに固定できる（Android Chrome 等で有効）。iOS Safari は lock() 非対応の
// ため何も起きない＝安全にno-op（そちらは manifest.json の "orientation":"landscape" ＋ ホーム画面に
// 追加したPWAで横向き起動になる／通常タブは横向き警告オーバーレイのまま）。失敗は握りつぶす。
function tryLockLandscape() {
  try {
    const o = window.screen && window.screen.orientation;
    if (o && typeof o.lock === "function") {
      const p = o.lock("landscape");
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  } catch (e) {
    /* 未対応・全画面外など。何もしない。 */
  }
}
function tryUnlockOrientation() {
  try {
    if (window.screen && window.screen.orientation && typeof window.screen.orientation.unlock === "function") {
      window.screen.orientation.unlock();
    }
  } catch (e) {}
}

// 全画面状態が変わった時に外部（オプションメニューのトグル表示等）へ通知する。
const listeners = new Set();
export function onFullscreenChange(fn) {
  listeners.add(fn);
}
function notify() {
  // 全画面に入ったら横向きロックを試み、出たら解除する（上記参照）。
  if (isFullscreenActive()) tryLockLandscape();
  else tryUnlockOrientation();
  for (const fn of listeners) {
    try {
      fn(isFullscreenActive());
    } catch {}
  }
}
document.addEventListener("fullscreenchange", notify);
document.addEventListener("webkitfullscreenchange", notify);

export function initFullscreenToggle() {
  const btn = document.createElement("button");
  btn.id = "fullscreen-toggle-button";
  // 未対応環境では出さない（押しても何も起きないボタンを常設しないため）。
  if (!isFullscreenSupported()) return;
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, { icon: ICON_ENTER, tooltip: "" });
  const imgEl = btn.querySelector(".icon-action-button-icon-img");

  function applyState() {
    const on = isFullscreenActive();
    if (imgEl) imgEl.src = on ? ICON_EXIT : ICON_ENTER;
    captionEl.textContent = on ? t("fs.captionOff") : t("fs.captionOn");
    if (tooltipEl) tooltipEl.textContent = on ? t("fs.tipOn") : t("fs.tipOff");
  }
  applyState();

  wireIconButtonClick(btn, {
    detailTitle: t("fs.title"),
    detailParagraphs: [
      t("fs.detail1"),
      t("fs.detail2"),
      t("fs.detail3"),
    ],
    onAction: () => {
      toggleFullscreen();
      // 反映はfullscreenchangeイベントでも来るが、即時にも更新しておく。
      setTimeout(applyState, 0);
    },
  });

  onFullscreenChange(applyState);
  getOptionArea().appendChild(btn);
}
