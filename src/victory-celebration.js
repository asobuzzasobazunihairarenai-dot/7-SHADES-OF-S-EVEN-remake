// 勝利演出「七色、集結」（2026-08-30、ユーザーとチャッピー案の擦り合わせで確定）。
//
// 【物語の線引き・重要】7色を集めたことで「世界に色が戻った」とは、まだ物語上確定していない
// （ユーザー確定）。だからこの演出では**色が世界に還る様子を見せない**。七色は勝者の国宝キューブへ
// 吸い込まれ、そのあと何が起きたのかは**強烈な白い光で覆い隠す**。断定する文言も出さない
// （出すのは「七色、集結 / VICTORY / 勝者名」だけ。勝者にも敗者にも同じものを出す）。
//
// 【段】WAIT → COLORS → GATHER → PULSE → FLASH → VICTORY →（リザルトへ）
//   WAIT    盤面操作を止め、BGMを短くフェードダウンして「間」を作る
//   COLORS  勝者のロックエリアの7色が 赤→橙→黄→緑→青→桃→紫 の順に発光（後半ほど速く）
//           →7色そろったところで一度だけ同時に強く光る
//   GATHER  七色が帯・霧のように揺れながらキューブへ向かい、周囲を短く旋回してから吸い込まれる
//           （直線のレーザーにしない・水色一色に混ぜない＝7色が見分けられること）
//   PULSE   キューブが3回脈動（後ろほど強い）。わずかな拡大・発光・色残像・ごく小さな画面振動
//   FLASH   キューブ中心から白が全画面へ。真っ白にはせず盤面の輪郭がうっすら残る＋淡い七色の残光
//   VICTORY 白を保ったまま、アバターと「七色、集結 / VICTORY / 勝者名」を浮かび上がらせる
//
// 【描き分け】盤面の位置に依るもの（スロットの発光・キューブの脈動）は DOM/CSS、位置に依らない
// 大量描画（光の帯・霧・白飛び・残光）は Canvas。card-dissolve.js（V4/V5）と同じ作法で、
// canvas は body 直下・ステージ座標・pointer-events:none の独立レイヤーにする。
// ゲームロジックには一切触れない（勝敗・戦績登録は victory.js 側で演出より先に確定済み）。
//
// 【パラメータ】全て CSS 変数から読む（--vic-*）。管理者モードのシミュレーター
// （victory-preview.js）が同じ変数を書き換えるので、**シミュレーターと本番で数値が分かれない**。

import { COLORS, SEAT_TO_SIDE } from "./board-layout.js";
import { playSound, stopGameBgm } from "./sound.js";
import { isFlightAnimationDisabled } from "./motion-prefs.js";
import { isTouchPrimaryDevice } from "./device-detect.js";
import { getState } from "./state.js";
import { buildCardBox } from "./card-face-display.js";
import { getCardImagePath } from "./cards-data.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { applyAvatarContent } from "./avatar-render.js";
import { t } from "./ui-text.js";

// 盤面パレット(--color-*)はくすみ気味なので、演出用に彩度を上げた色を使う
// （card-dissolve.js の DISSOLVE_HEX と同じ考え方・同じ値）。
const VIVID = {
  red: "#ff405c", orange: "#ff8a32", yellow: "#ffd84a", green: "#42e58a",
  blue: "#49a8ff", pink: "#ff74c8", purple: "#a875ff",
};

// 各段の基準の長さ（ms）。--vic-speed で全体を伸縮する。
const BASE = {
  hush: 300, // WAIT: BGMフェード
  hushHold: 400, //    間
  colorFirst: 260, // COLORS: 1色目の間隔（後半に向けて colorLast まで詰める）
  colorLast: 120,
  colorAllFlare: 420, //    7色そろっての同時発光
  fan: 780, // （任意）ロックした7枚が中央に扇状に並ぶ段
  fanHold: 200,
  gather: 950, // GATHER: キューブへ吸い込まれるまで
  pulse: 380, // PULSE: 1回あたり（×回数）
  flash: 560, // FLASH: 白が全画面を覆うまで
  victoryIn: 520, // VICTORY: 文字とアバターが浮かび上がる
  victoryHold: 1200, //    見せている時間
};

function readSettings() {
  const cs = getComputedStyle(document.documentElement);
  const num = (name, fb) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fb;
  };
  const mobile = isTouchPrimaryDevice();
  return {
    speed: Math.max(0.3, num("--vic-speed", 1)), // 大きいほど速い
    colorStep: num("--vic-color-step", 1), // 1色ごとの間隔の倍率
    gatherSpeed: Math.max(0.3, num("--vic-gather-speed", 1)),
    stream: num("--vic-stream", 1) * (mobile ? 0.5 : 1), // 光の帯・霧の量
    pulseCount: Math.max(1, Math.round(num("--vic-pulse-count", 3))),
    pulsePower: num("--vic-pulse-power", 1),
    shake: num("--vic-shake", 1) * (mobile ? 0.6 : 1),
    flashSpeed: Math.max(0.3, num("--vic-flash-speed", 1)),
    white: Math.min(0.98, Math.max(0.5, num("--vic-white", 0.88))), // 白の濃さ
    residue: num("--vic-residue", 1) * (mobile ? 0.6 : 1), // 白の中の七色残光
    avatarSize: num("--vic-avatar-size", 16), // vmin
    fan: num("--vic-fan", 1) >= 0.5, // ロックした7枚の扇を見せるか
    hold: num("--vic-hold", 1), // 勝利表示を見せる長さの倍率
    mobile,
  };
}

const wait = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const rectOf = (el) => el.getBoundingClientRect();
const centerOf = (el) => { const r = rectOf(el); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };

function findLockSlots(player) {
  const side = SEAT_TO_SIDE[player];
  const table = document.getElementById("game-table");
  if (!table) return [];
  return COLORS.map((_, i) => table.querySelector(`.lock-slot[data-side="${side}"][data-index="${i}"]`));
}
function findWinnerPiece(player) {
  const table = document.getElementById("game-table");
  return table ? table.querySelector(`.piece[data-owner="${player}"]`) : null;
}

let running = false;
let skipRequested = false;
export function isVictoryCelebrationRunning() {
  return running;
}
// 進行中の段を外へ伝える（シミュレーターのステージ表示に使う）。
let onStage = null;
export function setVictoryStageListener(fn) {
  onStage = fn;
}

// 演出を再生し、勝利表示まで終わったら解決する Promise を返す。
// opts.keepWhite: true なら白い幕を残したまま解決する（リザルトへ地続きで渡すため）。
//   → 呼び出し側は返り値の dismiss() を、リザルトの表示が終わってから呼ぶ。
// 例外が起きても必ず解決する（演出のせいでリザルトへ進めないことがあってはならない）。
export async function playVictoryCelebration(player, opts = {}) {
  const { keepWhite = true } = opts;
  if (running) return { dismiss: () => {} };
  running = true;
  skipRequested = false;
  const s = readSettings();
  const light = isFlightAnimationDisabled() || prefersReducedMotion();
  const sp = light ? 3.2 : s.speed; // 動きを減らす設定なら一気に短く
  const ms = (base) => Math.round(base / sp);

  const slots = findLockSlots(player).filter(Boolean);
  const piece = findWinnerPiece(player);
  let root = null;
  let cards = [];
  let flares = [];
  let ghost = null;
  let stopCanvas = null;
  const stage = (name) => { try { onStage?.(name); } catch (e) {} };

  try {
    root = buildRoot();
    document.body.appendChild(root);
    // タップ/クリックで残りを短縮できる（スキップしても勝敗・報酬・リザルトには影響しない）。
    const onSkip = () => { skipRequested = true; };
    root.addEventListener("pointerdown", onSkip);
    window.addEventListener("keydown", onSkip);
    root._cleanupSkip = () => { window.removeEventListener("keydown", onSkip); };

    const cube = piece ? centerOf(piece) : { x: innerWidth / 2, y: innerHeight * 0.5 };
    const cubeSize = piece ? rectOf(piece).width : 0;

    // --- WAIT: 操作を止め、BGMを短くフェードダウンして間を作る ---------------------
    stage("WAIT");
    document.body.classList.add("victory-celebration-active");
    try { stopGameBgm(ms(BASE.hush)); } catch (e) {}
    root.classList.add("is-hushed");
    await step(ms(BASE.hush) + ms(BASE.hushHold));

    // --- COLORS: 7色が順に発光 → 最後に同時発光 -----------------------------------
    stage("COLORS");
    flares = spawnSlotFlares(root.querySelector(".vic-slots"), slots);
    for (let i = 0; i < slots.length; i++) {
      flares[i]?.classList.add("is-lit");
      playSound("lock");
      // 前半はゆっくり、後半に向けてテンポを上げる
      const k = slots.length > 1 ? i / (slots.length - 1) : 1;
      const gap = BASE.colorFirst + (BASE.colorLast - BASE.colorFirst) * k;
      await step(ms(gap * s.colorStep));
    }
    flares.forEach((el) => el.classList.add("is-all"));
    playSound("arrivalEffect");
    await step(ms(BASE.colorAllFlare));

    // --- （任意）ロックした7枚が中央に扇状に並ぶ ----------------------------------
    if (s.fan && !light) {
      cards = spawnLockedCards(root, player, slots, { x: innerWidth / 2, y: innerHeight * 0.42 });
      if (cards.length) {
        playSound("cardDraw");
        requestAnimationFrame(() => cards.forEach((c) => c.classList.add("is-flying")));
        await step(ms(BASE.fan));
        await step(ms(BASE.fanHold));
        cards.forEach((c) => c.classList.add("is-absorbing"));
      }
    }

    // --- GATHER: 七色が帯・霧になってキューブへ吸い込まれる -------------------------
    stage("GATHER");
    playSound("cardDraw");
    if (!light) {
      stopCanvas = runGatherCanvas(root, slots, cube, s, ms(BASE.gather / s.gatherSpeed));
    }
    ghost = spawnGhostCube(root.querySelector(".vic-cubes"), piece, cube, cubeSize);
    ghost?.classList.add("is-charging");
    await step(ms(BASE.gather / s.gatherSpeed));
    cards.forEach((c) => c.remove());
    cards = [];

    // --- PULSE: キューブが脈動する（後ろほど強く） ---------------------------------
    stage("PULSE");
    for (let i = 0; i < s.pulseCount; i++) {
      const power = ((i + 1) / s.pulseCount) * s.pulsePower;
      pulseOnce(root, ghost, power, s.shake, ms(BASE.pulse));
      playSound("piecePlace");
      await step(ms(BASE.pulse));
    }

    // --- FLASH: 白い光が全画面を覆う（何が起きたかは見せない） ----------------------
    stage("FLASH");
    playSound("turnSwitch");
    root.style.setProperty("--vic-flash-x", `${cube.x}px`);
    root.style.setProperty("--vic-flash-y", `${cube.y}px`);
    root.style.setProperty("--vic-flash-ms", `${ms(BASE.flash / s.flashSpeed)}ms`);
    root.style.setProperty("--vic-white-alpha", String(s.white));
    root.classList.add("is-flash");
    if (stopCanvas) { stopCanvas(); stopCanvas = null; }
    await step(ms(BASE.flash / s.flashSpeed));

    // --- VICTORY: 白を保ったまま勝利表示 ------------------------------------------
    stage("VICTORY");
    buildVictoryText(root, player, s);
    requestAnimationFrame(() => root.classList.add("is-victory"));
    await step(ms(BASE.victoryIn));
    await step(ms(BASE.victoryHold * s.hold));

    stage("RESULT");
  } catch (err) {
    console.error("[so7] playVictoryCelebration failed", err);
  } finally {
    for (const c of cards) c.remove();
    // flares / ghost は root の子なので root ごと消える。盤面側には何も付けていない。
    if (stopCanvas) stopCanvas();
    document.body.classList.remove("victory-celebration-active");
    running = false;
  }

  // 白い幕を残したまま返す（リザルトが出てから dismiss してもらう）。
  const el = root;
  const dismiss = () => {
    if (!el) return;
    el._cleanupSkip?.();
    el.classList.add("is-dismissing");
    setTimeout(() => el.remove(), 700);
  };
  if (!keepWhite) dismiss();
  return { dismiss };

  // スキップされたら以降の待ちを一気に詰める
  async function step(msValue) {
    if (skipRequested) return wait(Math.min(60, msValue));
    return wait(msValue);
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    return false;
  }
}

function buildRoot() {
  const root = document.createElement("div");
  root.id = "victory-celebration";
  root.setAttribute("aria-hidden", "true");
  const veil = document.createElement("div");
  veil.className = "vic-veil";
  // 幕(.vic-veil)は backdrop-filter で盤面の彩度・明るさを落とすので、盤面側の要素を
  // いくら光らせても「暗転の裏側」になって色が出ない（ユーザー報告2026-08-30）。
  // 色を見せたいもの（スロットの光・脈動するキューブ）は、幕より手前のこのレイヤーに置く。
  const slotLayer = document.createElement("div");
  slotLayer.className = "vic-slots";
  const canvas = document.createElement("canvas");
  canvas.className = "vic-canvas";
  const cubeLayer = document.createElement("div");
  cubeLayer.className = "vic-cubes";
  const flash = document.createElement("div");
  flash.className = "vic-flash";
  const text = document.createElement("div");
  text.className = "vic-text";
  root.append(veil, slotLayer, canvas, cubeLayer, flash, text);
  return root;
}

// COLORS: 勝者のロックスロットと同じ位置・同じ色の光を、幕より手前に置き直す。
// （盤面のスロット自体を光らせると幕の backdrop-filter で色が沈んでしまうため。）
// 色は盤面パレットではなく演出用の VIVID を使う＝暗い幕の上でもはっきり色が分かる。
function spawnSlotFlares(layer, slots) {
  if (!layer) return [];
  return slots.map((slot, i) => {
    const r = rectOf(slot);
    const el = document.createElement("div");
    el.className = "vic-slot";
    el.style.left = `${r.left + r.width / 2}px`;
    el.style.top = `${r.top + r.height / 2}px`;
    el.style.width = `${Math.max(10, r.width)}px`;
    el.style.height = `${Math.max(10, r.height)}px`;
    el.style.setProperty("--vic-slot-rgb", hexToRgb(VIVID[COLORS[i]] || "#ffffff"));
    layer.appendChild(el);
    return el;
  });
}
function hexToRgb(hex) {
  const h = String(hex).replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

// PULSE: 実物の駒はそのままに、**少し半透明の疑似的な駒**を幕より手前に重ねて、
// こちらを脈動させる（ユーザー提案2026-08-30。以前は実物を光らせていたが、幕の裏で
// 暗くなるうえ、見えているのは白い丸が広がるだけになっていた）。
// 3D空間の外に置いても立方体に見えるよう、ドラッグゴースト(.drag-ghost-piece-outer/-inner)と
// 同じ「perspective + 盤面と同じ傾き」の入れ子を使う。中身は本物の .piece の複製なので、
// プレイヤーが選んでいる駒スキンがそのまま反映される。
function spawnGhostCube(layer, piece, cube, sizePx) {
  if (!layer || !piece) return null;
  const size = Math.max(18, sizePx || rectOf(piece).width);
  const outer = document.createElement("div");
  outer.className = "vic-cube";
  outer.style.left = `${cube.x}px`;
  outer.style.top = `${cube.y}px`;
  outer.style.width = `${size}px`;
  outer.style.height = `${size}px`;
  const inner = document.createElement("div");
  inner.className = "vic-cube-inner";
  const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim() || "42deg";
  const clone = piece.cloneNode(true);
  clone.classList.remove("is-my-turn-glow", "is-victory-charging", "is-victory-pulse", "hover-active");
  clone.removeAttribute("data-owner"); // 飾りペットを二重に出さない
  inner.appendChild(clone);
  outer.appendChild(inner);
  layer.appendChild(outer);
  // 盤面は fitTableToViewport の scale3d で拡大されているので、複製をそのまま置くと実物より
  // 小さく見える。CSS上の駒の幅（複製を置いてから測る＝確実に値が取れる）と画面上の実測幅の
  // 比で inner を拡大して、実物にぴったり重なる大きさにする。
  // scale() ではなく scale3d() を使う（scale() はZ軸＝壁の高さを縮めないので立方体が崩れる。
  // fitTableToViewport で同じ罠を踏んだのと同じ理由）。
  const cssW = parseFloat(getComputedStyle(clone).width) || size;
  const k = cssW > 0 ? size / cssW : 1;
  inner.style.transform = `rotateX(${tilt}) scale3d(${k}, ${k}, ${k})`;
  // 立方体は translateZ で持ち上がっている分だけ、箱の中心と「見えている立方体の中心」が
  // ずれる（実測すると実物の駒の少し上に浮いて見えた）。複製を置いた後に実際の見た目の
  // 中心を測り、その差だけ箱をずらして、実物にぴったり重なるようにする。
  const cr = rectOf(clone);
  if (cr.width > 0) {
    outer.style.left = `${cube.x + (cube.x - (cr.left + cr.width / 2))}px`;
    outer.style.top = `${cube.y + (cube.y - (cr.top + cr.height / 2))}px`;
  }
  return outer;
}

// 脈動のたびに、同じ疑似キューブが一回り大きく広がって消える残像を1つ置く。
function spawnCubeEcho(ghost, power) {
  if (!ghost?.parentNode) return;
  const echo = ghost.cloneNode(true);
  echo.classList.remove("is-charging", "is-pulse");
  echo.classList.add("is-echo");
  echo.style.setProperty("--vic-echo-power", String(power));
  ghost.parentNode.appendChild(echo);
  setTimeout(() => echo.remove(), 1200);
}

// キューブの脈動1回分（疑似キューブの拡大・発光＋残像＋ごく小さな画面振動）。
function pulseOnce(root, ghost, power, shake, durMs) {
  root.style.setProperty("--vic-pulse-power", String(power));
  root.style.setProperty("--vic-pulse-ms", `${durMs}ms`);
  root.classList.remove("is-pulsing");
  void root.offsetWidth; // アニメーションを再スタートさせる
  root.classList.add("is-pulsing");
  if (ghost) {
    ghost.classList.remove("is-pulse");
    void ghost.offsetWidth;
    ghost.style.setProperty("--vic-pulse-power", String(power));
    ghost.style.setProperty("--vic-pulse-ms", `${durMs}ms`);
    ghost.classList.add("is-pulse");
    spawnCubeEcho(ghost, power);
  }
  const amp = 2.2 * power * shake;
  document.documentElement.style.setProperty("--vic-shake-amp", `${amp}px`);
}

// 勝利表示（白い光の中に浮かび上がる）。文言は物語の意味を断定しないものだけ。
function buildVictoryText(root, player, s) {
  const box = root.querySelector(".vic-text");
  box.innerHTML = "";
  const avatar = document.createElement("div");
  avatar.className = "vic-avatar";
  avatar.style.fontSize = `${s.avatarSize}vmin`;
  applyAvatarContent(avatar, getPlayerAvatar(player));
  const lead = document.createElement("div");
  lead.className = "vic-lead";
  lead.textContent = t("vic.lead");
  const title = document.createElement("div");
  title.className = "vic-title";
  title.textContent = t("vic.title");
  const name = document.createElement("div");
  name.className = "vic-name";
  name.textContent = getPlayerName(player);
  box.append(avatar, lead, title, name);
}

// ロックした7枚を、いまロックエリアに見えている位置そのままで作り、中央へ扇状に集める。
function spawnLockedCards(root, player, slots, mid) {
  const side = SEAT_TO_SIDE[player];
  const state = getState();
  const vmin = Math.min(innerWidth, innerHeight) / 100;
  const out = [];
  COLORS.forEach((color, index) => {
    const token = state.tokens.find(
      (tk) => tk.kind === "card" && tk.location.zone === "lock" && tk.location.side === side && tk.location.index === index
    );
    const slot = slots[index];
    if (!token || !slot) return;
    const r = rectOf(slot);
    if (r.width === 0) return;
    const el = document.createElement("div");
    el.className = "vic-card";
    el.style.cssText = `left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;`;
    const offset = index - (COLORS.length - 1) / 2;
    el.style.setProperty("--vic-card-tx", `${mid.x - (r.left + r.width / 2) + offset * 9.2 * vmin}px`);
    el.style.setProperty("--vic-card-ty", `${mid.y - (r.top + r.height / 2) + Math.abs(offset) * 1.1 * vmin}px`);
    el.style.setProperty("--vic-card-rot", `${offset * 13}deg`);
    el.style.setProperty("--vic-card-scale", String((13 * vmin) / r.width));
    el.style.setProperty("--vic-card-color", VIVID[color] || "#fff");
    el.style.zIndex = String(10 + (7 - Math.abs(offset)));
    el.appendChild(buildCardBox(token.cardId, getCardImagePath(token.cardId)));
    root.appendChild(el);
    out.push(el);
  });
  return out;
}

// GATHER段のCanvas: 7色が帯・霧のように揺れながらキューブへ向かい、周囲を短く旋回してから
// 吸い込まれる。直線のレーザーにしない・7色が混ざって水色一色にならないようにする。
function runGatherCanvas(root, slots, cube, s, durMs) {
  const canvas = root.querySelector(".vic-canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || innerWidth;
  const H = canvas.clientHeight || innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 色ごとに、スロット→キューブへ向かう粒（帯を構成する）
  const perColor = Math.max(6, Math.round(22 * s.stream));
  const parts = [];
  COLORS.forEach((color, i) => {
    const slot = slots[i];
    if (!slot) return;
    const from = centerOf(slot);
    for (let k = 0; k < perColor; k++) {
      parts.push({
        color: VIVID[color] || "#fff",
        from,
        // 出発の遅れ（色ごとにずらして、帯が順に伸びていくように）
        delay: (i / COLORS.length) * 0.22 + (k / perColor) * 0.5,
        // 揺れ（直線にしないための横ぶれ）
        sway: (Math.sin(i * 3.1 + k * 1.7) * 0.5 + Math.sin(k * 0.9) * 0.5) * (60 + (k % 5) * 22),
        swayPhase: k * 0.7 + i,
        size: 2.4 + (k % 4) * 1.1,
        // 旋回（キューブの手前で短く回ってから吸い込まれる）
        spin: (k % 2 ? 1 : -1) * (0.7 + (k % 3) * 0.25),
      });
    }
  });

  let raf = 0;
  const t0 = performance.now();
  let stopped = false;
  function frame(now) {
    if (stopped) return;
    const tt = Math.min(1, (now - t0) / durMs);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = "lighter";
    for (const p of parts) {
      const local = (tt - p.delay) / (1 - p.delay);
      if (local <= 0) continue;
      const u = Math.min(1, local);
      // 手前90%は「揺れながら近づく」、最後10%で旋回して吸い込まれる
      const approach = Math.min(1, u / 0.9);
      const swirl = Math.max(0, (u - 0.9) / 0.1);
      const ease = approach * approach * (3 - 2 * approach);
      let x = p.from.x + (cube.x - p.from.x) * ease;
      let y = p.from.y + (cube.y - p.from.y) * ease;
      // 横ぶれ（進むほど収束）
      const wob = Math.sin(u * 6.2 + p.swayPhase) * p.sway * (1 - ease);
      const dx = cube.x - p.from.x;
      const dy = cube.y - p.from.y;
      const len = Math.hypot(dx, dy) || 1;
      x += (-dy / len) * wob;
      y += (dx / len) * wob;
      if (swirl > 0) {
        const ang = swirl * Math.PI * 2 * p.spin;
        const rad = 26 * (1 - swirl);
        x = cube.x + Math.cos(ang) * rad;
        y = cube.y + Math.sin(ang) * rad;
      }
      const alpha = Math.min(1, u * 3) * (1 - swirl * 0.5) * 0.85;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
      // 霧（薄く大きい残り）
      ctx.globalAlpha = alpha * 0.18 * s.stream;
      ctx.beginPath();
      ctx.arc(x, y, p.size * 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    ctx.clearRect(0, 0, W, H);
  };
}
