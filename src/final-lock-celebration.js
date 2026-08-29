// 最後のロック（7色目＝勝利が決まるロック）の演出「色が還る」（ユーザー選択・2026-08-30）。
//
// 物語の骨子（ui-text.js の opening.story.* / eidos-dialogue-scenes.js）に合わせた演出:
// 世界から「色」が消え、国宝キューブだけが色を具現化する力を持つ——だから7色が揃った瞬間は
// 「世界に色が還る」瞬間として見せる。
//
//   ① 時が止まる      … 盤面の色と明るさを落とし、勝者のロックエリアだけをスポットライトで残す
//   ② 7色が順に灯る    … 赤→橙→黄→緑→青→桃→紫の順にスロットが1つずつ光る（音も1色ずつ）
//   ③ 色が還る        … 7色目で虹の波がロックエリアから盤面いっぱいに広がり、通ったところから色が戻る
//   ④ 閃光           … 白くフラッシュし、勝者のキューブ（駒）が強く光る
//   ⑤ 余韻           … 何も起きない時間を置いてから、呼び出し側が勝利モーダルを出す
//
// 呼び出し側（victory.js）は `await playFinalLockCelebration(player)` してからモーダルを出すこと。
// これが無かったため、以前は7色目がハマった次の描画でいきなり勝利モーダルが出ていた。
//
// 【重要・このプロジェクトの既知の罠】盤面は perspective + rotateX + preserve-3d の3D階層なので、
// その祖先に CSS の `filter` を付けると3Dが平坦化して壊れる（CLAUDE.md「教訓2」）。そのため
// 「彩度を落とす」は盤面自身にfilterを掛けるのではなく、**上に重ねたオーバーレイの backdrop-filter**
// で行う（オーバーレイは3D階層の外なので盤面に影響しない）。backdrop-filter が使えない環境では
// 暗い幕だけになるが、演出としては成立する。

import { COLORS, SEAT_TO_SIDE } from "./board-layout.js";
import { playSound } from "./sound.js";
import { isFlightAnimationDisabled } from "./motion-prefs.js";

// 各段階の長さ（ms）。合計 ≒ 3.8秒。
const T = {
  veilIn: 350, // ① 時が止まる
  slotStep: 150, // ② 1色あたりの間隔（×7）
  slotHold: 260, // ② 7色目が灯ってから波が出るまでの溜め
  wave: 900, // ③ 虹の波が広がりきるまで
  flash: 320, // ④ 閃光
  afterglow: 1200, // ⑤ 余韻（ここが「終わってから移る」ための間）
};
// 「駒やカードが飛ぶ動きをやめる」設定の人向けの簡易版（合計約1.0秒）。
const T_LIGHT = { veilIn: 120, slotStep: 60, slotHold: 120, wave: 260, flash: 200, afterglow: 400 };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 勝者のロックエリアの中心（画面座標）。見つからなければ画面中央。
function findLockAreaCenter(player) {
  const side = SEAT_TO_SIDE[player];
  const table = document.getElementById("game-table");
  const area = table ? table.querySelector(`.lock-area.lock-${side}, .lock-${side}`) : null;
  const el = area || table;
  if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
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
  if (running) return; // 二重再生の保険
  running = true;
  // 動きを減らしたい人には簡易版（合計約1秒）。常時光る演出だけを切っている人は本編のまま
  // （これは「一度きりの演出」なので、常時光る演出の設定とは別物と考える）。
  const light = isFlightAnimationDisabled();
  const t = light ? T_LIGHT : T;
  let root = null;
  const slots = findLockSlots(player);
  const piece = findWinnerPiece(player);
  try {
    const center = findLockAreaCenter(player);
    root = document.createElement("div");
    root.id = "final-lock-celebration";
    root.setAttribute("aria-hidden", "true");
    root.style.setProperty("--flc-x", `${center.x}px`);
    root.style.setProperty("--flc-y", `${center.y}px`);
    // 波が画面のどこからでも端まで届く半径
    const reach = Math.hypot(Math.max(center.x, window.innerWidth - center.x), Math.max(center.y, window.innerHeight - center.y));
    root.style.setProperty("--flc-reach", `${Math.ceil(reach * 1.15)}px`);
    root.style.setProperty("--flc-veil-in", `${t.veilIn}ms`);
    root.style.setProperty("--flc-wave", `${t.wave}ms`);
    root.style.setProperty("--flc-flash", `${t.flash}ms`);

    const veil = document.createElement("div");
    veil.className = "flc-veil";
    const wave = document.createElement("div");
    wave.className = "flc-wave";
    const flash = document.createElement("div");
    flash.className = "flc-flash";
    root.append(veil, wave, flash);
    document.body.appendChild(root);

    // ① 時が止まる
    requestAnimationFrame(() => root.classList.add("is-veiled"));
    await wait(t.veilIn);

    // ② 7色が順に灯る
    for (let i = 0; i < slots.length; i++) {
      slots[i].classList.add("is-final-flare");
      playSound("lock");
      await wait(t.slotStep);
    }
    await wait(t.slotHold);

    // ③ 色が還る（虹の波。通過に合わせて幕を消す）
    playSound("arrivalEffect");
    root.classList.add("is-wave");
    root.classList.remove("is-veiled");
    await wait(t.wave);

    // ④ 閃光＋勝者のキューブが光る
    playSound("turnSwitch");
    root.classList.add("is-flash");
    piece?.classList.add("is-final-flare-piece");
    await wait(t.flash);

    // ⑤ 余韻（何も起こらない時間。ここを置かずにモーダルを出すと演出が途切れて見える）
    root.classList.remove("is-flash");
    await wait(t.afterglow);
  } catch (err) {
    // 演出が失敗しても勝敗の進行は止めない
    console.error("[so7] playFinalLockCelebration failed", err);
  } finally {
    for (const s of slots) s.classList.remove("is-final-flare");
    piece?.classList.remove("is-final-flare-piece");
    root?.remove();
    running = false;
  }
}
