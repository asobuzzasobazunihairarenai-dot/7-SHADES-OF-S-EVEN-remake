// ターン終了ボタンを押して手番が次のプレイヤーへ渡った瞬間、画面中央に一時的に
// 次のプレイヤー名を派手に表示する演出（ユーザー要望）＋効果音「ターン切替」。
// 呼び出し元(main.js)がturnPlayerの変化を検知した時だけannounceTurnChange()を呼ぶ
// （このモジュール自体は「今どのプレイヤーの番か」を判定するロジックを持たない、
// 表示専用のトースト部品）。

import { playSound } from "./sound.js";
import { getPlayerName } from "./player-identity.js";

// onComplete: トーストが完全に消え終わった（フェードアウトのremoveまで完了した）瞬間に
// 呼ばれる任意コールバック。ユーザー報告「『○○のターン』の表示がちゃんと消えてから
// フェイズのモーダル表示に移ってほしい」への対応で、呼び出し元(main.js)が
// phase-automation.jsのフェイズ自動開始をこのコールバックまで待たせるために使う。
export function announceTurnChange(player, onComplete) {
  playSound("turnSwitch");
  const el = document.createElement("div");
  el.id = "turn-announce-toast";
  const label = document.createElement("div");
  label.className = "turn-announce-label";
  label.textContent = `${getPlayerName(player)} のターン`;
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
