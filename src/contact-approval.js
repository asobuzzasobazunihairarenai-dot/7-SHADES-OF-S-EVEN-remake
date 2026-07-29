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
//
// ユーザー要望（続き89）「自動処理モードでは、カウンターロックのような接触に対する
// リアクションカードがあるかどうかを判定し、それを持っていればそのカードを使うか
// どうかのモーダルが出るようにしてほしい」への対応。本来ルール上「接触」自体は
// 拒否できる行為ではなく（docs/rulebook.md参照）、この「承認/拒否」の2択はカウンター
// ロックのような無効化カードを使うための便宜的な実装だった。自動処理モードOFF中
// （自己申告プレイの前提）は従来通りの承認/拒否のままにするが、自動処理モードON中は
// final-lock-approval.jsのゴメンナサイと同じパターンで、実際にリアクションカードを
// 持っている場合だけボタンを見せ（持っていなければmain.jsのcheckCounterLockAuto
// Approval()が自動で承認して先へ進める）、ボタンの文言も「使う/使わない」に変える。

import { getState } from "./state.js";
import { isOnlineMode, getSelfSeat } from "./online.js";
import { getPlayerName } from "./player-identity.js";
import { isAutoProcessingEnabled } from "./card-effect-engine.js";

let modalEl = null;
let backdropEl = null;
let respondHandler = null;
let checkCounterLockEligibility = null;
let useCounterLockHandler = null;
let isPseudoCpuTargetCheck = null;
let pseudoCpuCounterLockAutoDeclineInFlight = false;

export function registerContactApprovalHandler(fn) {
  respondHandler = fn;
}

// isPseudoCpuTarget（続き106）: main.jsのisPseudoCpuTarget（turn-timer.js由来）を
// このファイルへ直接importすると、contact-approval.js→turn-timer.js→main.js→
// contact-approval.jsという3方向の循環参照になってしまう（phase-automation.jsが
// turn-timer.jsを直接importできないのと同じ理由）。checkEligibility/onUseCounterLock
// と同じ「main.js側から関数を注入してもらう」既存パターンをそのまま拡張して回避する。
export function registerCounterLockHelpers({ checkEligibility, onUseCounterLock, isPseudoCpuTarget }) {
  checkCounterLockEligibility = checkEligibility;
  useCounterLockHandler = onUseCounterLock;
  isPseudoCpuTargetCheck = isPseudoCpuTarget;
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
  const autoMode = isAutoProcessingEnabled();
  const hasCounterLock = canRespond && autoMode && !!checkCounterLockEligibility?.(pending.defender);
  // 自動処理モードON・応答可能・リアクションカード無し、の場合はボタン自体を出さない
  // （main.js側のcheckCounterLockAutoApproval()が自動で承認して先へ進める。final-lock-
  // approval.jsのゴメンナサイと同じ「使えない人にはボタンを見せてもチラつくだけ」の考え方）。
  if (canRespond && autoMode && !hasCounterLock) {
    modalEl.classList.remove("is-visible");
    if (backdropEl) {
      backdropEl.remove();
      backdropEl = null;
    }
    modalEl.innerHTML = "";
    return;
  }
  // ユーザー報告（続き106）「疑似CPUモードで対象の座席がたまたまカウンターロックを
  // 持っている時、『使う/使わない』の選択がここで止まっていた」への対応。main.js側の
  // checkCounterLockAutoApproval()は「リアクションカードを持っている場合は本人の選択を
  // 待つ」という仕様上、疑似CPU対象でもここは素通りしてしまう。ここでその座席が
  // 疑似CPU対象なら、カウンターロックは使わず（＝任意なのでスキップと同じ考え方）
  // 承認する側へ即座に進める。counterLockAutoApprovalInFlightと同じ「同じ処理を
  // 二重に発火させない」ガードをこのモジュール内に持たせる。
  if (canRespond && hasCounterLock && isPseudoCpuTargetCheck?.(pending.defender) && !pseudoCpuCounterLockAutoDeclineInFlight) {
    pseudoCpuCounterLockAutoDeclineInFlight = true;
    hideImmediately();
    Promise.resolve(respondHandler?.(true)).finally(() => {
      pseudoCpuCounterLockAutoDeclineInFlight = false;
    });
    return;
  }
  modalEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "contact-approval-title";
  title.textContent = "🤝 接触の申し込み";
  modalEl.appendChild(title);

  const body = document.createElement("div");
  body.className = "contact-approval-body";
  if (hasCounterLock) {
    body.textContent = `${getPlayerName(pending.attacker)}があなた（${getPlayerName(
      pending.defender
    )}）に接触を申し込んでいます。あなたは「カウンターロック」を持っています。使いますか？（使うとこの接触は無効になります）`;
  } else {
    body.textContent = canRespond
      ? `${getPlayerName(pending.attacker)}があなた（${getPlayerName(
          pending.defender
        )}）に接触を申し込んでいます。承認すると、手札から無作為に1枚渡し、あなたは自分のゲートへ強制移動します。`
      : `${getPlayerName(pending.attacker)}が${getPlayerName(pending.defender)}に接触を申し込み中… 相手の承認を待っています。`;
  }
  modalEl.appendChild(body);

  if (canRespond) {
    const buttons = document.createElement("div");
    buttons.className = "contact-approval-buttons";
    if (hasCounterLock) {
      const useBtn = document.createElement("button");
      useBtn.className = "contact-approval-approve";
      useBtn.type = "button";
      useBtn.textContent = "🛡️ カウンターロックを使う";
      useBtn.addEventListener("click", () => {
        hideImmediately();
        useCounterLockHandler?.();
      });
      const declineBtn = document.createElement("button");
      declineBtn.className = "contact-approval-reject";
      declineBtn.type = "button";
      declineBtn.textContent = "使わない（承認する）";
      declineBtn.addEventListener("click", () => {
        hideImmediately();
        respondHandler?.(true);
      });
      buttons.appendChild(useBtn);
      buttons.appendChild(declineBtn);
    } else {
      const approveBtn = document.createElement("button");
      approveBtn.className = "contact-approval-approve";
      approveBtn.type = "button";
      approveBtn.textContent = "✅ 承認する";
      approveBtn.addEventListener("click", () => {
        hideImmediately();
        respondHandler?.(true);
      });
      const rejectBtn = document.createElement("button");
      rejectBtn.className = "contact-approval-reject";
      rejectBtn.type = "button";
      rejectBtn.textContent = "🚫 拒否する";
      rejectBtn.addEventListener("click", () => {
        hideImmediately();
        respondHandler?.(false);
      });
      buttons.appendChild(approveBtn);
      buttons.appendChild(rejectBtn);
    }
    modalEl.appendChild(buttons);
  }
}

// ユーザー報告「接触演出時に『接触申し込みモーダル』が消えずに演出を邪魔している」への
// 対応。承認/拒否ボタンを押した直後、respondToContact()のタックル演出中は
// suppressGenericRenderForContactTackleにより汎用render()（このモーダルの更新も含む）が
// 一時停止されるため、state.pendingContactの消滅を待つupdateContactApprovalModal()任せに
// すると演出が終わるまでこのモーダルが残ってしまっていた。ボタンを押した時点で応答は
// 確定しているので、state更新を待たずその場で即座に隠す。
//
// ユーザー報告「接触アニメ中に接触した側（attacker・傍観者）の画面にモーダルが
// 表示されたままになる」への対応で、main.jsのplayContactTackleForBystander
// （defender以外の全クライアントが接触タックル演出を再生する関数）からも
// 同じタイミングで呼べるようexportした。あちら側も同様にsuppressGenericRender
// ForContactTackleで汎用render()を止めて演出中の状態変化での作り直しを防いでいるため、
// 演出が終わってrender()が再開するまでこのモーダルの更新が届かず、演出中ずっと
// 残ってしまっていた。演出を始める時点でこちらも即座に隠す。
export function hideContactApprovalModalImmediately() {
  hideImmediately();
}
function hideImmediately() {
  modalEl?.classList.remove("is-visible");
  if (backdropEl) {
    backdropEl.remove();
    backdropEl = null;
  }
  if (modalEl) modalEl.innerHTML = "";
}
