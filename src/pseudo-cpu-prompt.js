// ユーザー要望（続き98）「疑似CPUモードを開始するを押すと、全プレイヤーに自分も
// 疑似CPUになるかのモーダルが出るようにしてほしい」。admin.jsの疑似CPUモード
// チェックボックス（isPseudoCpuModeEnabled、続き97）は、ONにした瞬間プレーンな
// DOM CustomEvent（pseudo-cpu-mode-started）を投げるだけにしてある（admin.js自体は
// online.jsを直接importしない設計を保つため）。ここでその合図を受け取り、オンライン中
// なら他の全プレイヤーへRealtime Broadcastで伝え、受け取った側（開始した本人以外）に
// 「あなたも疑似CPUになりますか？」の確認モーダルを出す。「はい」を選んだ人だけ、
// 自分自身のpseudoCpuModeEnabled/pseudoCpuIncludeSelfをONにする（自分の番も含めて
// 自動化＝完全に観戦に徹する）。開始した本人は既にチェックボックスで明示的に選択済み
// のため対象外（自分以外にだけ届ける、hand_effect_use等の既存パターンと同じ）。
// ローカルモードは対象外（「全プレイヤー」に意味を持つのはオンライン対戦のみ）。

import { isOnlineMode, getSelfSeat, broadcastPseudoCpuModeStarted, onPseudoCpuModeStartedEvents } from "./online.js";
import { getPlayerName } from "./player-identity.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { setPseudoCpuModeEnabled, setPseudoCpuIncludeSelf } from "./admin.js";

function showPseudoCpuJoinPrompt(fromPlayer) {
  const modal = document.createElement("div");
  modal.id = "pseudo-cpu-join-prompt";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10612 });

  const title = document.createElement("div");
  title.className = "contact-approval-title";
  title.textContent = "🤖 疑似CPUモード";
  modal.appendChild(title);

  const body = document.createElement("div");
  body.className = "contact-approval-body";
  body.textContent =
    `${getPlayerName(fromPlayer)}さんが疑似CPUモード（自動選択のテスト）を開始しました。` +
    "あなたも自分の番を自動プレイ（疑似CPU）にしますか？";
  modal.appendChild(body);

  const buttons = document.createElement("div");
  buttons.className = "contact-approval-buttons";
  const yesBtn = document.createElement("button");
  yesBtn.type = "button";
  yesBtn.className = "contact-approval-approve";
  yesBtn.textContent = "✅ はい";
  yesBtn.addEventListener("click", () => {
    setPseudoCpuModeEnabled(true);
    setPseudoCpuIncludeSelf(true);
    window.dispatchEvent(new CustomEvent("admin:change"));
    close();
  });
  const noBtn = document.createElement("button");
  noBtn.type = "button";
  noBtn.className = "contact-approval-reject";
  noBtn.textContent = "🚫 いいえ";
  noBtn.addEventListener("click", close);
  buttons.appendChild(yesBtn);
  buttons.appendChild(noBtn);
  modal.appendChild(buttons);

  modal.appendChild(createModalCloseX(close));
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

export function initPseudoCpuPrompt() {
  window.addEventListener("pseudo-cpu-mode-started", () => {
    if (!isOnlineMode()) return;
    broadcastPseudoCpuModeStarted({ fromPlayer: getSelfSeat() });
  });
  onPseudoCpuModeStartedEvents(({ fromPlayer }) => {
    if (fromPlayer === getSelfSeat()) return;
    showPseudoCpuJoinPrompt(fromPlayer);
  });
}
