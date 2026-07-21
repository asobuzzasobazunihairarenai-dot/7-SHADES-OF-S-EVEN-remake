// 管理者モードの「アイコン再配置モード」。ONの間、対象の6つのアイコンボタン
// (#hand-shuffle-button/#board-zoom-button/#draw-button/#public-draw-button/
// #end-turn-button/#options-menu-button)を画面上で直接つまんでドラッグし、自由な位置へ
// ずらせるようにする。
//
// 実装方針: 各ボタンの基準位置（bottom/right、player-buttons.jsが並び替えのために書き換える
// bottom値も含む）は一切変更せず、そこからのズレだけを専用のCSS変数
// (--icon-pos-*-x/-y、style.css側で各ボタンのtransform: translate()として適用済み、
// admin.jsのGROUPSにスライダーとしても登録済みなので「出力をコピー」にも自動的に含まれる)
// へ書き込む。これにより、ドラッグでの再配置とスライダーでの微調整のどちらからでも
// 同じ1つの値を共有でき、既存の位置計算コードには一切手を入れずに済む。
//
// 既存のplayer-buttons.jsは、手札シャッフル/盤面拡大/1枚ドローの3ボタンに「掴んで離すと
// スロットが入れ替わる」という別のドラッグを、icon-action-button.jsは全ボタンにクリックで
// 本来の操作/詳細モーダルを開く仕組みを、それぞれボタン自身へのbubble(既定)リスナーとして
// 既に持っている。同じボタンに素朴にリスナーを足すだけだと、実際にどちらが先に発火するかは
// クリック位置（ボタン自身が直接のtargetか、中の<img>等の子要素がtargetか）によって変わって
// しまい不安定になる。document自体へcapture:trueで委譲リスナーを登録すれば、キャプチャ
// フェーズ（常にターゲット本体のリスナーより先に完了する）で確実に先取りしてstopPropagation()
// できるため、登録順やクリック位置に左右されず安定して割り込める。

import { isIconRearrangeMode } from "./admin.js";

const SELECTOR =
  "#hand-shuffle-button, #board-zoom-button, #draw-button, #public-draw-button, #end-turn-button, #options-menu-button";

const VAR_BY_ID = {
  "hand-shuffle-button": ["--icon-pos-hand-shuffle-x", "--icon-pos-hand-shuffle-y"],
  "board-zoom-button": ["--icon-pos-board-zoom-x", "--icon-pos-board-zoom-y"],
  "draw-button": ["--icon-pos-draw-x", "--icon-pos-draw-y"],
  "public-draw-button": ["--icon-pos-public-draw-x", "--icon-pos-public-draw-y"],
  "end-turn-button": ["--icon-pos-end-turn-x", "--icon-pos-end-turn-y"],
  "options-menu-button": ["--icon-pos-options-x", "--icon-pos-options-y"],
};

function remToPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function currentRem(varName) {
  const inline = document.documentElement.style.getPropertyValue(varName).trim();
  const parsed = parseFloat(inline || getComputedStyle(document.documentElement).getPropertyValue(varName));
  return Number.isFinite(parsed) ? parsed : 0;
}

function startDrag(btn, varX, varY, e) {
  const startX = e.clientX;
  const startY = e.clientY;
  const remPx = remToPx();
  const baseX = currentRem(varX);
  const baseY = currentRem(varY);
  btn.classList.add("is-rearranging");

  function onMove(ev) {
    const dxRem = (ev.clientX - startX) / remPx;
    const dyRem = (ev.clientY - startY) / remPx;
    document.documentElement.style.setProperty(varX, `${(baseX + dxRem).toFixed(2)}rem`);
    document.documentElement.style.setProperty(varY, `${(baseY + dyRem).toFixed(2)}rem`);
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    btn.classList.remove("is-rearranging");
    // ドラッグ完了時点でだけ、管理者モードのスライダー表示・出力欄を更新してもらう
    // （移動中に毎回更新すると出力欄の再計算が細かく走り続けて無駄なため）。
    window.dispatchEvent(new CustomEvent("admin:icon-rearrange-change"));
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function onPointerDownCapture(e) {
  if (!isIconRearrangeMode()) return;
  const btn = e.target.closest(SELECTOR);
  if (!btn) return;
  const vars = VAR_BY_ID[btn.id];
  if (!vars) return;
  e.preventDefault();
  e.stopPropagation();
  startDrag(btn, vars[0], vars[1], e);
}

function onClickCapture(e) {
  if (!isIconRearrangeMode()) return;
  const btn = e.target.closest(SELECTOR);
  if (!btn) return;
  // 再配置モード中はクリック（詳細モーダル/本来の操作/並び替えドラッグの確定クリック）を
  // 一切発生させない。
  e.preventDefault();
  e.stopPropagation();
}

export function initIconRearrange() {
  document.addEventListener("pointerdown", onPointerDownCapture, true);
  document.addEventListener("click", onClickCapture, true);
}
