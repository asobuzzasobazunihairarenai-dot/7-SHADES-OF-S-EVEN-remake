// ユーザー要望（続き98）「疑似CPUモードを開始するを押すと、全プレイヤーに自分も
// 疑似CPUになるかのモーダルが出るようにしてほしい」。
//
// 続き101で設計変更: 当初は「有効化した瞬間にRealtime Broadcastで他クライアントへ
// 伝え、確認モーダルを出す」という仕組みだったが、実機（2クライアント）テストで
// 相手に反映されないケースがあり信頼できないと判明した
// （ユーザー報告「やはり相手に設定が反映されません」）。timerEnabled/
// includeBlackWhite等と同じ「部屋作成者が『ゲームを開始する』を押した瞬間の設定を
// 対局全体の固定値としてサーバーに同期する」既存の確実な仕組みに乗せることにした
// （online.jsのstartGame()参照）。
//
// このモジュールは、オンライン対戦でこの対局のtimerConfig.pseudoCpuModeEnabledが
// trueだと初めて判明した瞬間（1対局につき1回だけ）、全員（部屋作成者自身も含む——
// ルーム作成時のチェックボックス1つでは「自分の番も自動化するか」までは決まらない
// 個人の選択のため）に「あなたも自分の番を自動プレイにしますか？」の確認モーダルを
// 出す。「はい」を選んだ人だけ自分自身のpseudoCpuIncludeSelf（続き97、個人設定の
// ままsyncしない）をONにする。

import { isOnlineMode, getCurrentGameId, getSyncedTimerConfig } from "./online.js";
import { subscribe } from "./state.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { setPseudoCpuIncludeSelf, isPseudoCpuIncludeSelf } from "./admin.js";
import { logAction } from "./action-log.js";

function showPseudoCpuJoinPrompt() {
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
  body.textContent = "この対局は疑似CPUモード（自動選択のテスト）が有効です。あなたも自分の番を自動プレイ（疑似CPU）にしますか？";
  modal.appendChild(body);

  const buttons = document.createElement("div");
  buttons.className = "contact-approval-buttons";
  const yesBtn = document.createElement("button");
  yesBtn.type = "button";
  yesBtn.className = "contact-approval-approve";
  yesBtn.textContent = "✅ はい";
  yesBtn.addEventListener("click", () => {
    setPseudoCpuIncludeSelf(true);
    // ユーザー報告（続き106）「『はい』を押しても基本時間が1秒に反映されないことがある」の
    // 原因調査用。クリックハンドラ自体が実際に呼ばれ、setPseudoCpuIncludeSelf(true)の
    // 直後にisPseudoCpuIncludeSelf()が本当にtrueへ変わっているかをアクションログに残す
    // （devtoolsを開かずに検証できるようにするため）。falseのままならクリック自体が
    // 届いていない/呼ばれていない別の問題、trueになっているのに以降の挙動がおかしいなら
    // このモーダルより後段（turn-timer.js側の反映）の問題と切り分けられる。
    logAction("diag-pseudo-cpu", {
      phase: "pseudoCpuJoinPrompt-yesClicked",
      isPseudoCpuIncludeSelfAfterSet: isPseudoCpuIncludeSelf(),
    });
    window.dispatchEvent(new CustomEvent("admin:change"));
    // ユーザー要望（続き99）「ONしたら現在持っている基本時間及び砂時計は0にして
    // ください」。turn-timer.js側のリスナーが、今まさに自分の番なら即座に反映する。
    window.dispatchEvent(new CustomEvent("pseudo-cpu-settings-changed"));
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

// 1対局につき1回だけ出す（同じ対局の以降の状態変化のたびに出し直さないため）。
// 新しい対局はgame_idが変わるため、この変数の値と一致しなくなり自然に再度出せる。
let promptedForGameId = null;
export function initPseudoCpuPrompt() {
  subscribe(() => {
    if (!isOnlineMode()) return;
    const gameId = getCurrentGameId();
    if (!gameId || gameId === promptedForGameId) return;
    const synced = getSyncedTimerConfig();
    if (!synced?.pseudoCpuModeEnabled) return;
    promptedForGameId = gameId;
    showPseudoCpuJoinPrompt();
  });
}
