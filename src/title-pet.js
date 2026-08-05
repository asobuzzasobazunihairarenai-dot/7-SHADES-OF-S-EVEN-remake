// タイトル画面のペット散歩演出（ユーザー要望）。キュビットが画面左から右へ、途中で
// 立ち止まったり伸びをしたり（idle/yawn/ear/jump）しながら右端へ見切れていく。見切れたら
// 次は左端からノクスアエル幼体が登場し、以降この2匹が交互に繰り返す。純粋な飾りで、
// ゲームには一切影響しない。
//
// オープニングオーバーレイ(#opening-screen)が閉じてDOMから外れたら、RAFループは
// layer.isConnected===false を見て自動的に止まる（closeフックは不要）。piece-pet.jsと同じく
// スプライトは1モーション=1枚の画像で、動き（歩行）は translateX で表現する。

import { petSpriteSrc } from "./pet-skins.js";

const WALKERS = ["cubit", "noxael", "sept", "rubel"]; // 登場するペット（ランダムに選ぶ）
const WALK_SPEED = 130; // px/秒（ステージ座標）。ゆっくりお散歩する速さ
const STEP_SWAP_MS = 220; // 歩行中に walk/static を切り替えて“歩いてる感”を出す間隔
const REDUCE =
  typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function rand(a, b) {
  return a + Math.random() * (b - a);
}

export function startTitlePetWalk(overlay) {
  if (!overlay) return;
  const layer = document.createElement("div");
  layer.className = "title-pet-layer";
  overlay.appendChild(layer);

  const img = document.createElement("img");
  img.className = "title-pet";
  img.alt = "";
  layer.appendChild(img);

  let widx = 0;
  let sprite = WALKERS[0];
  let x = 0;
  let hop = 0;
  let phase = "walk"; // walk / pause
  let phaseUntil = 0;
  let nextPauseAt = 0;
  let stepSwapAt = 0;
  let stepFrame = 0;
  let pauseMotion = "idle";
  let lastSrc = "";
  let lastT = performance.now();

  const petW = () => img.clientWidth || 90;

  function setSprite(dir, motion) {
    const src = petSpriteSrc(sprite, dir, motion);
    if (src !== lastSrc) {
      img.src = src;
      lastSrc = src;
    }
  }

  function beginWalker() {
    // ユーザー要望「ランダムに登場」。直前と同じにならないよう選び直す（1匹しか無ければそのまま）。
    let next = WALKERS[Math.floor(Math.random() * WALKERS.length)];
    if (WALKERS.length > 1) {
      while (next === sprite) next = WALKERS[Math.floor(Math.random() * WALKERS.length)];
    }
    sprite = next;
    lastSrc = "";
    x = -petW() - 20;
    hop = 0;
    phase = "walk";
    const now = performance.now();
    nextPauseAt = now + rand(1200, 2600);
    stepSwapAt = 0;
  }

  function tick(now) {
    if (!layer.isConnected) return; // オーバーレイが閉じたら自動停止（RAFを再登録しない）
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const width = layer.clientWidth || 800;

    if (phase === "walk") {
      x += WALK_SPEED * dt;
      hop = 0;
      if (now >= stepSwapAt) {
        stepSwapAt = now + STEP_SWAP_MS;
        stepFrame ^= 1;
      }
      setSprite("right", stepFrame ? "walk" : "static");
      // 画面内にいる間だけ、たまに立ち止まって何かする。
      if (now >= nextPauseAt && x > 0 && x < width - petW()) {
        phase = "pause";
        pauseMotion = ["idle", "yawn", "ear", "jump"][Math.floor(Math.random() * 4)];
        phaseUntil = now + rand(1100, 2200);
      }
      if (x > width + petW() + 20) {
        // 右端へ見切れた → 次のペットが左端から登場
        widx += 1;
        beginWalker();
      }
    } else {
      setSprite("front", pauseMotion);
      hop = pauseMotion === "jump" ? -Math.abs(Math.sin(now / 120)) * 12 : 0;
      if (now >= phaseUntil) {
        phase = "walk";
        nextPauseAt = now + rand(1400, 3000);
      }
    }
    img.style.transform = `translateX(${x}px) translateY(${hop}px)`;
    requestAnimationFrame(tick);
  }

  if (REDUCE) {
    // 動きを抑える設定では歩かせず、静止したペットを1匹だけ左寄りに置く。
    setSprite("front", "static");
    img.style.transform = "translateX(18%)";
    return;
  }
  beginWalker();
  requestAnimationFrame(tick);
}
