// ユーザー要望「ランクリングを、ロックエリアのファーストカード/エターナルカードの
// 「周回演出」（style.cssのeffect-orbit）みたいに、枠をその色の発光体がくるくる回る
// 感じにしたい。残像も欲しい。残像の量・発光体のサイズ・スピードを管理者モードで
// 調整したい」への対応。
//
// 既存のeffect-orbitはカード（矩形）の四隅を4点キーフレームで直線的に結ぶ方式だが、
// ランクリングは正円のため、そのままでは角ばった軌道になってしまう。ここでは
// requestAnimationFrameで角度を進め、三角関数(cos/sin)で正円上の位置を都度計算する。
// 残像は、opening-screen.jsの7色の人魂と同じ「過去の角度の履歴を薄く重ねて描く」方式
// （履歴の本数＝残像の量）。発光体の色自体は要素を作らずCSS変数(--rank-ring-color)の
// 継承に任せる（main.js側で.self-status-rank-ring自身にセット済み）。
//
// 「アニメーションを減らす」設定（motion-prefs.js）がONの間は、常時動き続ける演出という
// 点でロックエリアの周回演出と同じ扱いにし、回転を止めて発光体を1つだけ12時位置に
// 固定表示する（完全に消すと「ランクが付いている」こと自体が分かりにくくなるため）。

import { isContinuousGlowDisabled } from "./motion-prefs.js";

let container = null;
let dots = [];
let history = [];
let angleDeg = 0;
let lastTime = null;
let rafId = null;

function readNumber(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}

function ensureDotCount(count) {
  while (dots.length < count) {
    const dot = document.createElement("div");
    dot.className = "rank-ring-orbit-dot";
    container.appendChild(dot);
    dots.push(dot);
  }
  while (dots.length > count) {
    dots.pop().remove();
  }
}

function renderStatic() {
  ensureDotCount(1);
  const orbSize = readNumber("--rank-ring-orbit-size", 0.4);
  const dot = dots[0];
  dot.style.left = "50%";
  dot.style.top = "0%";
  dot.style.width = `${orbSize}rem`;
  dot.style.height = `${orbSize}rem`;
  dot.style.opacity = "1";
  dot.style.transform = "translate(-50%, -50%) scale(1)";
}

function tick(time) {
  if (!container) return;
  if (isContinuousGlowDisabled()) {
    renderStatic();
    lastTime = null;
    rafId = requestAnimationFrame(tick);
    return;
  }

  if (lastTime === null) lastTime = time;
  const dtSec = (time - lastTime) / 1000;
  lastTime = time;

  const revolutionSec = Math.max(0.2, readNumber("--rank-ring-orbit-speed", 7.6));
  const trailLength = Math.max(1, Math.round(readNumber("--rank-ring-orbit-trail-length", 23)));
  const orbSize = readNumber("--rank-ring-orbit-size", 0.4);

  angleDeg = (angleDeg + (dtSec / revolutionSec) * 360) % 360;

  history.unshift(angleDeg);
  if (history.length > trailLength) history.length = trailLength;

  ensureDotCount(history.length);

  for (let i = 0; i < dots.length; i++) {
    // -90degして12時方向を起点(0deg)にする。
    const rad = ((history[i] - 90) * Math.PI) / 180;
    const ratio = 1 - i / dots.length; // 1(先頭・本体) 〜 ほぼ0(一番古い残像)
    const dot = dots[i];
    dot.style.left = `${50 + Math.cos(rad) * 50}%`;
    dot.style.top = `${50 + Math.sin(rad) * 50}%`;
    dot.style.width = `${orbSize}rem`;
    dot.style.height = `${orbSize}rem`;
    dot.style.opacity = String(ratio);
    dot.style.transform = `translate(-50%, -50%) scale(${0.5 + ratio * 0.5})`;
  }

  rafId = requestAnimationFrame(tick);
}

export function setRankRingOrbitContainer(el) {
  container = el;
}

export function startRankRingOrbit() {
  if (rafId || !container) return;
  lastTime = null;
  rafId = requestAnimationFrame(tick);
}

export function stopRankRingOrbit() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  lastTime = null;
  history = [];
  for (const dot of dots) dot.remove();
  dots = [];
}
