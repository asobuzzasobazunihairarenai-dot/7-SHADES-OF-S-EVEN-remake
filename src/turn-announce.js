// ターン終了ボタンを押して手番が次のプレイヤーへ渡った瞬間、画面中央に一時的に
// 次のプレイヤー名を派手に表示する演出（ユーザー要望）＋効果音「ターン切替」。
// 呼び出し元(main.js)がturnPlayerの変化を検知した時だけannounceTurnChange()を呼ぶ
// （このモジュール自体は「今どのプレイヤーの番か」を判定するロジックを持たない、
// 表示専用のトースト部品）。

import { playSound } from "./sound.js";
import { getPlayerName } from "./player-identity.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ6

// onComplete: トーストが完全に消え終わった（フェードアウトのremoveまで完了した）瞬間に
// 呼ばれる任意コールバック。ユーザー報告「『○○のターン』の表示がちゃんと消えてから
// フェイズのモーダル表示に移ってほしい」への対応で、呼び出し元(main.js)が
// phase-automation.jsのフェイズ自動開始をこのコールバックまで待たせるために使う。
//
// 【ユーザー要望2026-09-05・②「ターンの始まりにもう一声」】モーダルを増やすと待ち時間が
// 伸びるので、**今のモーダルの出方を変える**形にした（表示時間は2.2秒のまま）。
//   ・opts.side …… その人の席の辺（bottom/left/top/right）。**その方向から光が走ってくる**。
//     誰の番かが、名前を読む前に体で分かる。
//   ・opts.color …… その人の駒の色。枠と光をその色にする（今までは全員おなじ金色だった）。
//   ・opts.isSelf … 自分の番の時だけ、名前が一拍だけ大きく脈打つ。
export function announceTurnChange(player, onComplete, opts = {}) {
  playSound("turnSwitch");
  const { side = null, color = null, isSelf = false } = opts;
  // 光の帯は画面全体を横切るので、中央のトーストとは別の層（クリックを一切拾わない）に置く。
  if (side) {
    const sweep = document.createElement("div");
    sweep.className = "turn-announce-sweep";
    sweep.dataset.from = side;
    if (color && color !== "rainbow") sweep.style.setProperty("--turn-announce-color", `var(--color-${color})`);
    document.body.appendChild(sweep);
    setTimeout(() => sweep.remove(), 1200);
  }
  const el = document.createElement("div");
  el.id = "turn-announce-toast";
  const label = document.createElement("div");
  label.className = isSelf ? "turn-announce-label is-self" : "turn-announce-label";
  if (color && color !== "rainbow") label.style.setProperty("--turn-announce-color", `var(--color-${color})`);
  label.textContent = t("game.turnOf", { name: getPlayerName(player) });
  el.appendChild(label);
  document.body.appendChild(el);
  // トースト系の既存演出（獲得ポップアップ等）と同じ「一瞬待ってからopacity/transformの
  // クラスを付ける」パターン（appendChild直後に付けると、ブラウザがトランジションの
  // 開始状態自体を描画しないことがあるため）。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.add("show"));
  });
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => {
      el.remove();
      onComplete?.();
    }, 500);
  }, 2200);
}
