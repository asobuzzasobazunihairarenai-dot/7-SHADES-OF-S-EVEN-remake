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
import { t } from "./ui-text.js"; // UI英語化フェーズ13

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

// #233「タイマーをONにするボタンってずっとでっぱなしだったっけ？」（2026-09-04）。
// このボタンは基本時間アイコンを押すと出るポップオーバーだが、閉じる手段が
// 「もう一度アイコンを押す」しか無かったため、うっかり触れると対局中ずっと画面に
// 出たままになっていた（フェイズ案内板の上に重なる）。普通のポップオーバーと同じく
// **他の場所を触ったら閉じる**ようにし、放置された時のために時間でも閉じる。
const POPOVER_AUTO_CLOSE_MS = 10000;
let popoverAutoCloseTimer = null;
let outsideCloseBound = false;
function closeTimerTogglePopover() {
  if (!popoverOpen) return;
  popoverOpen = false;
  updateTimerToggleButton();
}
function bindOutsideClose() {
  if (outsideCloseBound) return;
  outsideCloseBound = true;
  // capture で拾う（盤面側が pointerdown を止めることがあるため）。閉じるだけで
  // イベント自体は止めない＝下の操作は今まで通り効く。
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!popoverOpen) return;
      const el = e.target instanceof Element ? e.target : null;
      // 自分自身（ボタン）と、開閉の起点である基本時間アイコンの上は無視する
      // （アイコンは自前のトグルで閉じるため、ここで閉じると二重で開き直してしまう）。
      if (el?.closest("#timer-toggle-button") || el?.closest(".turn-timer-base-clock")) return;
      closeTimerTogglePopover();
    },
    true
  );
}

// turn-timer.jsの基本時間アイコンから呼ばれる開閉トグル。
export function toggleTimerTogglePopover() {
  popoverOpen = !popoverOpen;
  updateTimerToggleButton();
  clearTimeout(popoverAutoCloseTimer);
  if (popoverOpen) {
    bindOutsideClose();
    popoverAutoCloseTimer = setTimeout(closeTimerTogglePopover, POPOVER_AUTO_CLOSE_MS);
  }
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
    clearTimeout(popoverAutoCloseTimer);
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
  buttonEl.textContent = currentEnabled ? t("tt.turnOff") : t("tt.turnOn");
  buttonEl.disabled = streak >= 3 || !!pending;
  buttonEl.title = streak >= 3 ? t("tt.blocked") : t("tt.tip");
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
  title.textContent = t("tt.proposal", { name: getPlayerName(pending.requester), onOff: pending.nextEnabled ? t("tt.on") : t("tt.off") });
  bannerEl.appendChild(title);

  const status = document.createElement("div");
  status.className = "final-lock-approval-status";
  status.textContent = canRespond
    ? t("tt.needYou", { name: getPlayerName(approver) })
    : t("tt.waiting", { name: getPlayerName(approver) });
  bannerEl.appendChild(status);

  if (canRespond) {
    const buttons = document.createElement("div");
    buttons.className = "final-lock-approval-buttons";
    const approveBtn = document.createElement("button");
    approveBtn.className = "final-lock-approval-approve";
    approveBtn.type = "button";
    approveBtn.textContent = t("tt.approve");
    approveBtn.addEventListener("click", () => respondHandler?.(true));
    const rejectBtn = document.createElement("button");
    rejectBtn.className = "final-lock-approval-reject";
    rejectBtn.type = "button";
    rejectBtn.textContent = t("tt.reject");
    rejectBtn.addEventListener("click", () => respondHandler?.(false));
    buttons.appendChild(approveBtn);
    buttons.appendChild(rejectBtn);
    bannerEl.appendChild(buttons);
  }
}
