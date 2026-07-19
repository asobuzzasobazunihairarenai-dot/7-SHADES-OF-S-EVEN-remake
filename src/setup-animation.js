// セットアップの各ステップ（ファーストカード配布・盤面へのカード配置）を、演出付きで
// 見せるアニメーション。state.js側のアクション自体は既存通り一括（同期的）に確定させ、
// このモジュールは「確定済みの最終状態を、画面上でどう段階的に見せるか」だけを担当する
// （状態変更を分割して何度もdispatchするわけではない）。
//
// game-setup.js（呼び出し元）とmain.js（実際のDOM構築処理・render()を持つ）の間で
// 循環importにならないよう、main.jsが起動時にregisterRenderHelpers()で必要な関数
// （render・findLocationElement）を注入してくれるのを待つ設計にしている。

import { getState } from "./state.js";
import { playSound } from "./sound.js";
import { getCardImagePath, getCardBackImagePath } from "./cards-data.js";

let helpers = null; // { render }

export function registerRenderHelpers(h) {
  helpers = h;
}

// 画面全体を覆う透明な受け皿。クリックすると残りを即座に完了させる。
function showSkipOverlay() {
  const overlay = document.createElement("div");
  overlay.id = "setup-animation-skip-overlay";
  const hint = document.createElement("div");
  hint.className = "setup-animation-skip-hint";
  hint.textContent = "クリックでスキップ";
  overlay.appendChild(hint);
  document.body.appendChild(overlay);
  return overlay;
}

function rectCenter(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// ソース位置(fromRect)からターゲット位置(toRect)へ、指定画像を敷いた正方形のゴーストを
// CSSトランジションで飛ばす。ドラッグ中のゴースト(main.jsのcreateGhost)と同じく
// document.body直下に3D空間の外から浮かべる方式（盤面の3D変形を気にしなくてよい）。
function flyCard(fromRect, toRect, imagePath, faceDown, durationMs) {
  const ghost = document.createElement("div");
  ghost.className = `setup-fly-card${faceDown ? " is-facedown" : ""}`;
  ghost.style.backgroundImage = `url("${imagePath}")`;
  ghost.style.width = `${fromRect.width}px`;
  ghost.style.height = `${fromRect.height}px`;
  const from = rectCenter(fromRect);
  ghost.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)`;
  document.body.appendChild(ghost);

  const done = new Promise((resolve) => {
    // 1フレーム後にトランジション先を設定する（開始状態が描画されてから動かさないと
    // トランジション自体が発火しないため）。
    requestAnimationFrame(() => {
      const to = rectCenter(toRect);
      const scale = toRect.width / fromRect.width;
      ghost.style.transition = `transform ${durationMs}ms ease-in-out`;
      ghost.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) scale(${scale})`;
    });
    setTimeout(() => {
      ghost.remove();
      resolve();
    }, durationMs + 20);
  });
  return { ghost, done };
}

// 参加人数分（最大4枚）のファーストカードが、ファーストカードの山からロックエリアへ
// 1枚ずつ飛んでいき、着地すると通常のロック演出（到達効果の柱状オーラ＋ロック画像の
// 拡大フェードアウト＋各効果音）がそのまま流れる（main.jsのtriggerLockEffectと同じ演出、
// ユーザー指定）。駒は今回ここではまだ登場させず、is-setup-pendingのまま隠しておく
// （盤面49マスが埋まった後、animateBoardFilled側でまとめて登場させる）。
export async function animateFirstCardsDealt() {
  if (!helpers) return;
  helpers.render();

  const state = getState();
  const lockTokens = state.tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "lock" && t.cardId.startsWith("first-")
  );
  if (lockTokens.length === 0) return;

  const table = document.getElementById("game-table");
  const firstPileEl = document.querySelector('.stack[data-pile="first"]');
  if (!table || !firstPileEl) return;

  const cardEntries = [];
  for (const token of lockTokens) {
    const el = table.querySelector(`[data-token-id="${token.id}"]`);
    if (el) {
      el.classList.add("is-setup-pending");
      cardEntries.push({ token, el });
    }
  }
  // 駒は表示だけ隠しておく（登場自体はanimateBoardFilledの最後にまとめて行う）。
  for (const token of state.tokens.filter((t) => t.kind === "piece")) {
    const el = table.querySelector(`[data-token-id="${token.id}"]`);
    if (el) el.classList.add("is-setup-pending");
  }

  let skipped = false;
  const ghosts = [];
  const overlay = showSkipOverlay();
  overlay.addEventListener(
    "click",
    () => {
      skipped = true;
    },
    { once: true }
  );

  const STAGGER_MS = 550;
  const FLIGHT_MS = 500;

  for (const { token, el } of cardEntries) {
    if (skipped) break;
    const fromRect = firstPileEl.getBoundingClientRect();
    const toRect = el.getBoundingClientRect();
    const { ghost, done } = flyCard(fromRect, toRect, getCardImagePath(token.cardId), false, FLIGHT_MS);
    ghosts.push(ghost);
    await done;
    if (skipped) break;
    el.classList.remove("is-setup-pending");
    if (helpers.triggerLockEffect) helpers.triggerLockEffect(token.cardId, token.location);
    await new Promise((r) => setTimeout(r, Math.max(80, STAGGER_MS - FLIGHT_MS)));
  }

  // スキップされた場合、まだ届いていない分をまとめて即座に表示する（駒はここでは出さない）。
  for (const { el } of cardEntries) el.classList.remove("is-setup-pending");
  for (const ghost of ghosts) ghost.remove();
  overlay.remove();
}

// 山札をシャッフルする効果音を鳴らしてから、49マスへ1枚ずつテンポよく（合計3〜4秒程度）
// カードを配っていく演出。1枚ごとの着地を律儀に待たず、次のカードを少し早めに送り出す
// ことで複数枚が同時に飛んでいるように見せる（ディーラーが手早く配る感じ）。
export async function animateBoardFilled() {
  if (!helpers) return;
  helpers.render();

  const state = getState();
  const cellTokens = state.tokens
    .filter((t) => t.kind === "card" && t.location.zone === "cell")
    .sort((a, b) => a.location.row - b.location.row || a.location.col - b.location.col);
  if (cellTokens.length === 0) return;

  const table = document.getElementById("game-table");
  const deckPileEl = document.querySelector('.stack[data-pile="deck"]');
  if (!table || !deckPileEl) return;

  const entries = [];
  for (const token of cellTokens) {
    const el = table.querySelector(`[data-token-id="${token.id}"]`);
    if (el) {
      el.classList.add("is-setup-pending");
      entries.push({ token, el });
    }
  }

  playSound("deckShuffle");

  let skipped = false;
  const ghosts = [];
  const overlay = showSkipOverlay();
  overlay.addEventListener(
    "click",
    () => {
      skipped = true;
    },
    { once: true }
  );

  const STAGGER_MS = 70;
  const FLIGHT_MS = 180;

  for (const { token, el } of entries) {
    if (skipped) break;
    const fromRect = deckPileEl.getBoundingClientRect();
    const toRect = el.getBoundingClientRect();
    const { ghost, done } = flyCard(fromRect, toRect, getCardBackImagePath(token.cardId), true, FLIGHT_MS);
    ghosts.push(ghost);
    done.then(() => {
      el.classList.remove("is-setup-pending");
      playSound("cardPlace");
    });
    await new Promise((r) => setTimeout(r, STAGGER_MS));
  }

  // 残り（スキップ時、またはまだ飛び終わっていないカード）を全部即座に表示する。
  for (const { el } of entries) el.classList.remove("is-setup-pending");
  for (const ghost of ghosts) ghost.remove();
  overlay.remove();

  // 盤面49マスが埋め終わったところで、ステップ1（animateFirstCardsDealt）で隠しておいた
  // 駒をまとめて登場させる。フェードイン（.pieceの既存transition）に、到達演出の光の柱
  // （spawnArrivalBurst）＋到達効果音を重ねて流用する（ユーザー指定）。
  const pieceEntries = state.tokens
    .filter((t) => t.kind === "piece")
    .map((token) => ({ token, el: table.querySelector(`[data-token-id="${token.id}"]`) }))
    .filter(({ el }) => el && el.classList.contains("is-setup-pending"));
  for (const { token, el } of pieceEntries) {
    el.classList.remove("is-setup-pending");
    playSound("arrivalEffect");
    if (helpers.spawnArrivalBurst && helpers.findLocationElement) {
      const hostEl = helpers.findLocationElement(table, token.location);
      if (hostEl) helpers.spawnArrivalBurst(hostEl, token.color);
    }
  }
}
