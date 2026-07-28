// 「タイマーをオン、オフ」ボタン（続き64、ユーザー要望「タイマーをオン、オフできる
// ボタンを追加してほしい。押すと参加プレイヤー全員に承認拒否モーダルが出ます。拒否が
// ３回続いたらそのプレイヤーはこの対局中このボタンを押せなくなる」）。
// state.jsのpendingFinalLock/final-lock-approval.jsと全く同じ「承認待ちキューを見て
// 自動でバナー表示、押されたらmain.jsから注入されたハンドラを呼ぶ」設計。CSSは
// final-lock-approval-*のクラスをそのまま流用する（見た目は同じ「何かを承認/却下する」
// バナーのため、新しいクラスを増やさずに済ませる）。
//
// オンライン対戦専用の機能（対局全体で固定のtimer_config.enabledを、対局中に全員の
// 合意で書き換える機能のため）。ローカルモードは1人で全座席を操作しゲーム開始時点の
// 設定がそのまま使われるだけで十分なため、ボタン自体を表示しない。

import { getState } from "./state.js";
import { isOnlineMode, getSelfSeat, getSyncedTimerConfig, getTimerToggleRejectStreak } from "./online.js";
import { getFinalLockApprovalOrder } from "./board-layout.js";
import { getPlayerName } from "./player-identity.js";

let buttonEl = null;
let bannerEl = null;
let requestHandler = null; // main.jsから注入: (nextEnabled, queue) => void
let respondHandler = null; // main.jsから注入: (approve) => void
// ユーザー要望（続き68）「タイマーをオフにするボタンは基本時間アイコンを押すと
// ひょこっと出てくる仕様にしたい」。以前は常時#phase-guide-bar内に並んでいたが、
// 基本時間アイコン（turn-timer.jsのbaseClockEl）クリックで開閉するポップオーバーに
// 変更した。この開閉状態自体はrender()のたびに失われては困るので、モジュール
// ローカル変数として保持する。
let popoverOpen = false;

export function registerTimerToggleHandlers({ onRequest, onRespond }) {
  requestHandler = onRequest;
  respondHandler = onRespond;
}

// turn-timer.jsの基本時間アイコンから呼ばれる開閉トグル。
export function toggleTimerTogglePopover() {
  popoverOpen = !popoverOpen;
  updateTimerToggleButton();
}

export function buildTimerToggleButton() {
  const bar = document.getElementById("phase-guide-bar");
  if (!bar) return;
  buttonEl = document.createElement("button");
  buttonEl.type = "button";
  buttonEl.id = "timer-toggle-button";
  bar.appendChild(buttonEl);
  buttonEl.addEventListener("click", () => {
    const state = getState();
    if (state.pendingTimerToggle) return; // 既に別の承認待ちが進行中
    const selfSeat = getSelfSeat();
    if (getTimerToggleRejectStreak(selfSeat) >= 3) return;
    const currentEnabled = getSyncedTimerConfig()?.enabled ?? false;
    const queue = getFinalLockApprovalOrder(selfSeat, state.activePlayers);
    requestHandler?.(!currentEnabled, queue);
    // 申請を送ったらポップオーバーは閉じる（この後の状況はbannerEl側が引き継いで表示する）。
    popoverOpen = false;
    updateTimerToggleButton();
  });
}

export function updateTimerToggleButton() {
  if (!buttonEl) return;
  if (!isOnlineMode() || !getState().turnPlayer || !popoverOpen) {
    buttonEl.style.display = "none";
    return;
  }
  buttonEl.style.display = "";
  const selfSeat = getSelfSeat();
  const streak = getTimerToggleRejectStreak(selfSeat);
  const pending = getState().pendingTimerToggle;
  const currentEnabled = getSyncedTimerConfig()?.enabled ?? false;
  buttonEl.textContent = currentEnabled ? "⏳ タイマーをOFFにする" : "⏳ タイマーをONにする";
  buttonEl.disabled = streak >= 3 || !!pending;
  buttonEl.title = streak >= 3 ? "却下が3回連続したため、この対局中は使えません" : "参加プレイヤー全員の承認でタイマーのON/OFFを切り替えます";
}

export function buildTimerToggleBanner() {
  bannerEl = document.createElement("div");
  bannerEl.id = "timer-toggle-approval-banner";
  document.body.appendChild(bannerEl);
  return bannerEl;
}

export function updateTimerToggleBanner() {
  if (!bannerEl) return;
  const pending = getState().pendingTimerToggle;
  if (!pending || pending.queue.length === 0) {
    bannerEl.classList.remove("is-visible");
    bannerEl.innerHTML = "";
    return;
  }
  bannerEl.classList.add("is-visible");
  const approver = pending.queue[0];
  const canRespond = !isOnlineMode() || getSelfSeat() === approver;
  bannerEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "final-lock-approval-title";
  title.textContent = `⏳ ${getPlayerName(pending.requester)} さんがタイマーを${pending.nextEnabled ? "ON" : "OFF"}にすることを提案中！`;
  bannerEl.appendChild(title);

  const status = document.createElement("div");
  status.className = "final-lock-approval-status";
  status.textContent = canRespond
    ? `あなた（${getPlayerName(approver)}）の承認が必要です`
    : `${getPlayerName(approver)} さんの承認を待っています…`;
  bannerEl.appendChild(status);

  if (canRespond) {
    const buttons = document.createElement("div");
    buttons.className = "final-lock-approval-buttons";
    const approveBtn = document.createElement("button");
    approveBtn.className = "final-lock-approval-approve";
    approveBtn.type = "button";
    approveBtn.textContent = "✅ 承認する";
    approveBtn.addEventListener("click", () => respondHandler?.(true));
    const rejectBtn = document.createElement("button");
    rejectBtn.className = "final-lock-approval-reject";
    rejectBtn.type = "button";
    rejectBtn.textContent = "🚫 却下する";
    rejectBtn.addEventListener("click", () => respondHandler?.(false));
    buttons.appendChild(approveBtn);
    buttons.appendChild(rejectBtn);
    bannerEl.appendChild(buttons);
  }
}
