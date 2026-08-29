// 最後のロック（7色目＝勝利が決まるロック）の演出「色が還る」。
// 2026-08-30に初版、同日「大分しょぼい・もっと丁寧に」という指摘を受けて作り直した版。
//
// 物語の骨子（ui-text.js の opening.story.*）に合わせている:
// 世界から「色」が消え、国宝キューブだけが色を具現化する力を持つ——だから7色が揃った瞬間は
// 「世界に色が還る」瞬間として見せる。
//
// 【初版が物足りなかった理由と、その直し方】
//  (1) 演出が画面の端（自分のロックエリア）だけで起きていて、視線の中心で何も起きなかった
//      → 7色の光が中央へ集まり、中央で七芒星として結実してから弾ける段を足した
//  (2) 幕が薄く（明るさ0.72）「時が止まった」感じが出ていなかった
//      → 明るさ0.25まで落とし、周囲を暗くするビネットも足した
//  (3) 波が細い輪1本で一瞬だった
//      → 太い輪＋追いかける2本目＋画面全体の色戻りに分け、さらに光の粒が舞い上がるようにした
//  (4) 段が5つしかなく、間（ため）が無かった
//      → 9段構成にして、各段の前後に「止まる時間」を入れた
//
// 呼び出し側（victory.js）は `await playFinalLockCelebration(player)` してからモーダルを出す。
//
// 【重要・このプロジェクトの既知の罠】盤面は perspective + rotateX + preserve-3d の3D階層なので、
// その祖先に CSS の `filter` を付けると3Dが平坦化して壊れる（CLAUDE.md「教訓2」）。そのため
// 「彩度を落とす」は盤面自身にfilterを掛けるのではなく、**上に重ねたオーバーレイの backdrop-filter**
// で行う（オーバーレイは3D階層の外なので盤面に影響しない）。駒・スロットの発光も box-shadow のみ。

import { COLORS, SEAT_TO_SIDE } from "./board-layout.js";
import { playSound } from "./sound.js";
import { isFlightAnimationDisabled } from "./motion-prefs.js";

// 各段の長さ（ms）。合計 ≒ 6.2秒。
const T = {
  hush: 350, // ① 息を呑む（幕が下りて時が止まる）
  hushHold: 200, //    …止まったまま少し置く
  slotStep: 170, // ② 7色が1つずつ灯る（×7）
  slotHold: 320, //    …7つ灯った状態で溜める
  gather: 640, // ③ 7色の光が画面中央へ集まる
  starForm: 440, // ④ 中央で七芒星として結実する
  starHold: 300, //    …結実したまま溜める
  burst: 760, // ⑤ 七芒星が弾け、虹の波が広がって色が還る
  flash: 320, // ⑥ 閃光＋勝者のキューブが光る
  settle: 550, // ⑦ 光の粒が舞い落ちる
  afterglow: 1100, // ⑧ 余韻（何も起きない時間）
};
// 「駒やカードが飛ぶ動きをやめる」設定の人向けの簡易版（合計約1.4秒）。
const T_LIGHT = {
  hush: 120, hushHold: 60, slotStep: 70, slotHold: 120, gather: 0, starForm: 0, starHold: 0,
  burst: 300, flash: 200, settle: 0, afterglow: 500,
};

const wait = (ms) => (ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve());

function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// 勝者のロックエリアの中心（画面座標）。見つからなければ画面中央。
function findLockAreaCenter(player) {
  const side = SEAT_TO_SIDE[player];
  const table = document.getElementById("game-table");
  const area = table ? table.querySelector(`.lock-area.lock-${side}, .lock-${side}`) : null;
  const el = area || table;
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return centerOf(el);
}

// 勝者のロックスロット（7色分）を色の並び順で返す。
function findLockSlots(player) {
  const side = SEAT_TO_SIDE[player];
  const table = document.getElementById("game-table");
  if (!table) return [];
  return COLORS.map((_, index) => table.querySelector(`.lock-slot[data-side="${side}"][data-index="${index}"]`)).filter(
    Boolean
  );
}

function findWinnerPiece(player) {
  const table = document.getElementById("game-table");
  // 駒のDOMには data-owner（所有者の座席）が入っている（renderBoardTokens参照）。
  return table ? table.querySelector(`.piece[data-owner="${player}"]`) : null;
}

let running = false;
export function isFinalLockCelebrationRunning() {
  return running;
}

// 演出を再生し、余韻まで終わったら解決する Promise を返す。
// 例外が起きても必ず解決する（演出のせいで勝利モーダルが出ないことがあってはならない）。
export async function playFinalLockCelebration(player) {
  if (running) return;
  running = true;
  const light = isFlightAnimationDisabled();
  const t = light ? T_LIGHT : T;
  let root = null;
  const slots = findLockSlots(player);
  const piece = findWinnerPiece(player);
  try {
    const from = findLockAreaCenter(player);
    const mid = { x: window.innerWidth / 2, y: window.innerHeight * 0.45 };
    root = document.createElement("div");
    root.id = "final-lock-celebration";
    root.setAttribute("aria-hidden", "true");
    root.style.setProperty("--flc-x", `${mid.x}px`);
    root.style.setProperty("--flc-y", `${mid.y}px`);
    root.style.setProperty("--flc-from-x", `${from.x}px`);
    root.style.setProperty("--flc-from-y", `${from.y}px`);
    const reach = Math.hypot(Math.max(mid.x, window.innerWidth - mid.x), Math.max(mid.y, window.innerHeight - mid.y));
    root.style.setProperty("--flc-reach", `${Math.ceil(reach * 1.2)}px`);
    root.style.setProperty("--flc-hush", `${t.hush}ms`);
    root.style.setProperty("--flc-gather", `${t.gather}ms`);
    root.style.setProperty("--flc-star-form", `${t.starForm}ms`);
    root.style.setProperty("--flc-burst", `${t.burst}ms`);
    root.style.setProperty("--flc-flash", `${t.flash}ms`);
    root.style.setProperty("--flc-settle", `${t.settle}ms`);

    const veil = document.createElement("div");
    veil.className = "flc-veil";
    // 七芒星は疑似要素だと細くて見えなかったので、実要素で組む（中心の光球＋7本の光条＋回るリング）。
    const star = document.createElement("div");
    star.className = "flc-star";
    const core = document.createElement("div");
    core.className = "flc-star-core";
    const ring = document.createElement("div");
    ring.className = "flc-star-ring";
    star.append(ring, core);
    COLORS.forEach((color, i) => {
      const ray = document.createElement("div");
      ray.className = "flc-star-ray";
      ray.style.setProperty("--flc-ray-color", `var(--color-${color})`);
      // 七芒星なので7方向（真上から時計回りに 360/7 度ずつ）
      ray.style.setProperty("--flc-ray-angle", `${-90 + (360 / 7) * i}deg`);
      star.appendChild(ray);
    });
    const wave = document.createElement("div");
    wave.className = "flc-wave";
    const wave2 = document.createElement("div");
    wave2.className = "flc-wave flc-wave-2";
    const flash = document.createElement("div");
    flash.className = "flc-flash";
    const motes = document.createElement("div");
    motes.className = "flc-motes";
    root.append(veil, star, wave, wave2, flash, motes);
    document.body.appendChild(root);

    // ① 息を呑む
    requestAnimationFrame(() => root.classList.add("is-hushed"));
    await wait(t.hush);
    await wait(t.hushHold);

    // ② 7色が1つずつ灯る。灯るたびに、その色の光の筋がロックエリアから中央へ伸びていく。
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      slot.classList.add("is-final-flare");
      playSound("lock");
      if (!light) spawnBeam(root, slot, mid, COLORS[i], t.gather + t.starForm);
      await wait(t.slotStep);
    }
    await wait(t.slotHold);

    // ③ 7色の光が中央へ集まる
    if (!light) {
      playSound("cardDraw");
      root.classList.add("is-gathering");
      await wait(t.gather);

      // ④ 中央で七芒星として結実する
      playSound("arrivalEffect");
      root.classList.add("is-star");
      await wait(t.starForm);
      await wait(t.starHold);
    }

    // ⑤ 弾けて色が還る（虹の波が2重に広がり、通過に合わせて幕が消える）
    playSound("jump");
    root.classList.add("is-burst");
    root.classList.remove("is-hushed");
    await wait(t.burst);

    // ⑥ 閃光＋勝者のキューブ
    playSound("turnSwitch");
    root.classList.add("is-flash");
    piece?.classList.add("is-final-flare-piece");
    await wait(t.flash);
    root.classList.remove("is-flash");

    // ⑦ 光の粒が舞い落ちる
    if (!light) {
      spawnMotes(motes, mid, t.settle + 400);
      root.classList.add("is-settling");
      await wait(t.settle);
    }

    // ⑧ 余韻（何も起きない時間。ここを置かずにモーダルを出すと演出が途切れて見える）
    await wait(t.afterglow);
  } catch (err) {
    console.error("[so7] playFinalLockCelebration failed", err);
  } finally {
    for (const s of slots) s.classList.remove("is-final-flare");
    piece?.classList.remove("is-final-flare-piece");
    root?.remove();
    running = false;
  }
}

// ロックスロットから画面中央へ伸びる、その色の光の筋。
function spawnBeam(root, slot, to, color, lifeMs) {
  const from = centerOf(slot);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const beam = document.createElement("div");
  beam.className = "flc-beam";
  beam.style.left = `${from.x}px`;
  beam.style.top = `${from.y}px`;
  beam.style.width = `${len}px`;
  beam.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  beam.style.setProperty("--flc-beam-color", `var(--color-${color})`);
  root.appendChild(beam);
  setTimeout(() => beam.remove(), lifeMs + 900);
}

// 中央から舞い上がって落ちる光の粒。
function spawnMotes(host, at, lifeMs) {
  for (let i = 0; i < 28; i++) {
    const m = document.createElement("div");
    m.className = "flc-mote";
    const angle = (Math.PI * 2 * i) / 28 + (i % 3) * 0.2;
    const dist = 90 + (i % 7) * 42;
    m.style.left = `${at.x}px`;
    m.style.top = `${at.y}px`;
    m.style.setProperty("--flc-mote-dx", `${Math.cos(angle) * dist}px`);
    m.style.setProperty("--flc-mote-dy", `${Math.sin(angle) * dist - 40}px`);
    m.style.setProperty("--flc-mote-color", `var(--color-${COLORS[i % COLORS.length]})`);
    m.style.animationDelay = `${(i % 6) * 60}ms`;
    host.appendChild(m);
    setTimeout(() => m.remove(), lifeMs + 800);
  }
}
