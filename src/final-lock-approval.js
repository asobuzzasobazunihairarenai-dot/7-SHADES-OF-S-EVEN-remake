// 最後のロック承認バナー（画面上部中央、常設）: state.jsのpendingFinalLockを見て、
// 「誰が最後のロックに挑戦中か」「今誰の承認待ちか」を表示し、承認/却下ボタンを出す。
// ユーザー要望「最後のロックをしようとした時は他プレイヤー全員の承認が必要。左隣から
// 時計回りに承認を得られればロックでき勝利となる」を実装したもの。
//
// 実際の状態変更（respondFinalLock呼び出し・オンライン中のfetchAndHydrate・演出の発火）は
// main.jsが握っている（isOnlineMode()・fetchAndHydrate・triggerLockEffect等、必要な依存を
// 既に持っているため）。このモジュール自体はGROUPS/TOGGLE_SECTIONS等と同じ「表示専用」の
// 役割に徹し、ボタンが押された時にmain.jsから注入されたハンドラを呼ぶだけにする
// （setup-animation.js/remote-move-animator.jsと同じ「main.jsから注入してもらう」既存パターン）。

import { getState } from "./state.js";
import { isOnlineMode, getSelfSeat } from "./online.js";
import { getPlayerName } from "./player-identity.js";

let bannerEl = null;
let respondHandler = null;
// ゴメンナサイの最後のロック割り込み（続き64、ユーザー確認済み方針「コストを払える
// 人だけが却下（＝妨害）できる」）。checkEligibilityは承認者の座席を受け取り、
// ゴメンナサイ＋追色1コストを払えるなら真を返す（main.jsのfindGomennasaiEligibility）。
// 払えない承認者にはボタン自体を出さない（main.js側のcheckGomennasaiAutoApproval()が
// 自動で承認する）。
let checkGomennasaiEligibility = null;
let useGomennasaiHandler = null;

export function registerFinalLockApprovalHandler(fn) {
  respondHandler = fn;
}

export function registerGomennasaiHelpers({ checkEligibility, onUseGomennasai }) {
  checkGomennasaiEligibility = checkEligibility;
  useGomennasaiHandler = onUseGomennasai;
}

export function buildFinalLockApprovalBanner() {
  bannerEl = document.createElement("div");
  bannerEl.id = "final-lock-approval-banner";
  document.body.appendChild(bannerEl);
  return bannerEl;
}

export function updateFinalLockApprovalBanner() {
  if (!bannerEl) return;
  const pending = getState().pendingFinalLock;
  if (!pending || pending.queue.length === 0) {
    bannerEl.classList.remove("is-visible");
    bannerEl.innerHTML = "";
    return;
  }
  bannerEl.classList.add("is-visible");
  const approver = pending.queue[0];
  // ローカルモードは1人で全座席を操作するテスト用途のため、既存の「座席を持っていれば
  // 何でも動かせる」方針を踏襲し、常にボタンを押せるようにする。オンライン中だけ、
  // 実際にその座席でログインしている本人にだけ操作を許可する。
  const canRespond = !isOnlineMode() || getSelfSeat() === approver;
  // ユーザー確認済み方針「コストを払える人だけが却下（＝妨害）できる」。払えない
  // 承認者にはボタン自体を見せず、バナー全体を隠す（main.js側のcheckGomennasaiAuto
  // Approval()がこの承認者を検知し、自動で承認して先へ進める。「あなたの承認が
  // 必要です」と見せておいてすぐ消えるチラつきを避けるため、最初から出さない）。
  const isEligibleForGomennasai = canRespond && !!checkGomennasaiEligibility?.(approver);
  if (canRespond && !isEligibleForGomennasai) {
    bannerEl.classList.remove("is-visible");
    bannerEl.innerHTML = "";
    return;
  }
  bannerEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "final-lock-approval-title";
  title.textContent = `🔒 ${getPlayerName(pending.attacker)} さんが最後のロックに挑戦中！`;
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
    buttons.appendChild(approveBtn);
    // ゴメンナサイを持っていて追色1を払える場合だけ、却下の代わりにこのボタンを出す
    // （続き64）。使うと相手が既に持っているロック1枚を奪ってから、相手の新しい
    // ロック自体は承認したのと同じ扱いで進む（card-effects.jsのpurple-sorryコメント
    // 参照）。
    const gomennasaiBtn = document.createElement("button");
    gomennasaiBtn.className = "final-lock-approval-reject";
    gomennasaiBtn.type = "button";
    gomennasaiBtn.textContent = "🍬 ゴメンナサイを使う";
    gomennasaiBtn.addEventListener("click", () => useGomennasaiHandler?.());
    buttons.appendChild(gomennasaiBtn);
    bannerEl.appendChild(buttons);
  }
}
