// カードや駒を、開始位置(fromRect)から終了位置(toRect)へ飛ばして見せる、CSSトランジション
// ベースのゴースト飛翔。document.body直下に3D空間の外から浮かべる方式（ドラッグ中の
// ゴースト=main.jsのcreateGhostや、セットアップ配布演出と同じ考え方。盤面の3D変形を
// 気にしなくてよい）。元々はsetup-animation.js専用だったが、オンライン対戦で他プレイヤーの
// 操作を再現するremote-move-animator.jsでも同じ技法が必要になったため、共有モジュールとして
// 独立させた。

export function rectCenter(rect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

import { isFlightAnimationDisabled } from "./motion-prefs.js";

// imagePath: 飛んでいる間に表示する画像（表向き/裏向き/駒スキン等、呼び出し側が決める）。
// className: ゴースト要素に付けるCSSクラス（見た目の基本形はこちら任せ。カード用の
// setup-fly-card等、呼び出し側で用意する）。
export function flyGhost(fromRect, toRect, imagePath, className, durationMs) {
  const ghost = document.createElement("div");
  ghost.className = className;
  ghost.style.backgroundImage = `url("${imagePath}")`;
  ghost.style.width = `${fromRect.width}px`;
  ghost.style.height = `${fromRect.height}px`;

  if (isFlightAnimationDisabled()) {
    // 「移動アニメーション」設定がオフの間は飛翔（CSSトランジション）自体を省略する。
    // ただし呼び出し元は{ghost, done}の形を前提に後始末（ghost.remove()等）をしている
    // ため、互換性のため要素自体は作り、最終位置に置いてすぐ消す形にする。
    const to = rectCenter(toRect);
    ghost.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%)`;
    document.body.appendChild(ghost);
    const done = new Promise((resolve) => {
      requestAnimationFrame(() => {
        ghost.remove();
        resolve();
      });
    });
    return { ghost, done };
  }

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
