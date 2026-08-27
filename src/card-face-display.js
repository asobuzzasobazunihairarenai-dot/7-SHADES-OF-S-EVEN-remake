// カード面の表示モード（テキスト合成 / 画像）と、スロットへの表示ヘルパー。
// 既定は「テキスト」（アプリ側でブランク画像＋タイトル・効果文・フレーバーを合成して描画）。
// 管理者モードで「画像」（従来の焼き込み画像）に切り替え可能（この端末のみ・localStorage）。
//
// showCardFace(el, cardId, imageUrl):
//  - テキストモード: buildCardFace(cardId) を el に inset:0 のオーバーレイ(.card-face-mount)として
//    被せ、el の背景画像は消す。el の他の子（バッジ・グロー用の擬似要素・ロックスタンプ等）は
//    そのまま残す（オーバーレイは先頭に挿入＝背面）。
//  - 画像モード（または cardId 不明）: 従来通り el に背景画像を敷き、マウントがあれば撤去する。
//
// ドラッグ中のゴースト・飛翔演出・canvas（victory-summary / card-dissolve）は DOM スロットでは
// ないため対象外（常に画像/canvasのまま）。
import { buildCardFace } from "./card-renderer.js";

const STORE_KEY = "so7-card-face-mode";
let mode = null; // "text" | "image"（遅延ロード）

function load() {
  if (mode) return mode;
  try {
    mode = localStorage.getItem(STORE_KEY) === "image" ? "image" : "text"; // 既定=text
  } catch {
    mode = "text";
  }
  return mode;
}

export function getCardFaceMode() {
  return load();
}
export function isCardFaceTextMode() {
  return load() === "text";
}
export function setCardFaceMode(m) {
  mode = m === "image" ? "image" : "text";
  try {
    localStorage.setItem(STORE_KEY, mode);
  } catch {
    /* 保存不可でもその場のモードは効く */
  }
}

// スロット el 直下のマウント（.card-face-mount）を取り除く。
export function clearCardFaceMount(el) {
  if (!el) return;
  const prev = el.querySelector(":scope > .card-face-mount");
  if (prev) prev.remove();
}

// el に「表向きカードの見た目」を表示する。テキストモードならカード面を合成して被せ、
// 画像モードなら imageUrl を背景に敷く。
export function showCardFace(el, cardId, imageUrl) {
  if (!el) return;
  const prev = el.querySelector(":scope > .card-face-mount");
  if (isCardFaceTextMode() && cardId) {
    el.style.backgroundImage = "none";
    // 同じカードのマウントが既にあれば作り直さない（無駄なDOM再構築を避ける・ホバー等で有効）。
    if (prev && prev.dataset.mountCardId === cardId) return;
    if (prev) prev.remove();
    const face = buildCardFace(cardId);
    face.classList.add("card-face-mount");
    face.dataset.mountCardId = cardId;
    el.insertBefore(face, el.firstChild);
  } else {
    if (prev) prev.remove();
    if (imageUrl) el.style.backgroundImage = `url("${imageUrl}")`;
  }
}
