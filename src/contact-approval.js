// 接触の承認/拒否モーダル（画面中央）: state.jsのpendingContactを見て、「誰が誰に接触を
// 申し込んでいるか」「承認待ちか」を表示し、接触された本人（defender）にだけ承認/拒否
// ボタンを出す。ユーザー要望「接触を無効にする効果のカードが存在するので、接触される
// プレイヤーには承認/拒否モーダルを出す」を実装したもの（最後のロック承認
// final-lock-approval.jsと同じ「表示専用、main.jsから注入されたハンドラを呼ぶだけ」の
// 役割分担だが、あちらは常設バナー、こちらはユーザーが明示的に「モーダル」を指定した
// ため中央の確認モーダルにしてある）。
//
// 実際の状態変更（respondContact呼び出し・オンライン中のfetchAndHydrate・到達判定の発火）は
// main.jsが握っている（既存のrespondToFinalLockと同じ理由）。

import { getState } from "./state.js";
import { isOnlineMode, getSelfSeat } from "./online.js";
import { getPlayerName } from "./player-identity.js";

let modalEl = null;
let backdropEl = null;
let respondHandler = null;

export function registerContactApprovalHandler(fn) {
  respondHandler = fn;
}

export function buildContactApprovalModal() {
  modalEl = document.createElement("div");
  modalEl.id = "contact-approval-modal";
  document.body.appendChild(modalEl);
  return modalEl;
}

export function updateContactApprovalModal() {
  if (!modalEl) return;
  const pending = getState().pendingContact;
  if (!pending) {
    modalEl.classList.remove("is-visible");
    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
    modalEl.innerHTML = "";
    return;
  }
  modalEl.classList.add("is-visible");
  if (!backdropEl) {
    backdropEl = document.createElement("div");
    backdropEl.id = "contact-approval-backdrop";
    document.body.appendChild(backdropEl);
  }
  // ローカルモードは1人で全座席を操作するテスト用途のため、既存の「座席を持っていれば
  // 何でも動かせる」方針を踏襲し、常にボタンを押せるようにする。オンライン中だけ、
  // 実際に接触された本人（defender）にだけ応答を許可する。
  const canRespond = !isOnlineMode() || getSelfSeat() === pending.defender;
  modalEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "contact-approval-title";
  title.textContent = "🤝 接触の申し込み";
  modalEl.appendChild(title);

  const body = document.createElement("div");
  body.className = "contact-approval-body";
  body.textContent = canRespond
    ? `${getPlayerName(pending.attacker)}があなた（${getPlayerName(
        pending.defender
      )}）に接触を申し込んでいます。承認すると、手札から無作為に1枚渡し、あなたは自分のゲートへ強制移動します。`
    : `${getPlayerName(pending.attacker)}が${getPlayerName(pending.defender)}に接触を申し込み中… 相手の承認を待っています。`;
  modalEl.appendChild(body);

  if (canRespond) {
    const buttons = document.createElement("div");
    buttons.className = "contact-approval-buttons";
    const approveBtn = document.createElement("button");
    approveBtn.className = "contact-approval-approve";
    approveBtn.type = "button";
    approveBtn.textContent = "✅ 承認する";
    approveBtn.addEventListener("click", () => respondHandler?.(true));
    const rejectBtn = document.createElement("button");
    rejectBtn.className = "contact-approval-reject";
    rejectBtn.type = "button";
    rejectBtn.textContent = "🚫 拒否する";
    rejectBtn.addEventListener("click", () => respondHandler?.(false));
    buttons.appendChild(approveBtn);
    buttons.appendChild(rejectBtn);
    modalEl.appendChild(buttons);
  }
}
