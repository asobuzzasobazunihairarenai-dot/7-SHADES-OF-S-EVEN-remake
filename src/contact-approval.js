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
import { t } from "./ui-text.js"; // UI英語化フェーズ6

let modalEl = null;
let backdropEl = null;
let respondHandler = null;
let checkCounterLockEligibility = null;
let useCounterLockHandler = null;
let isPseudoCpuTargetCheck = null;
let isSelfCpuSubstitutedCheck = null; // AFK代行中の自席か（main.jsから注入）
let cpuCounterLockDecider = null; // CPU防御側がカウンターロックを使うべきか（main.jsのブレインから注入。#59-①）
let pseudoCpuCounterLockAutoDeclineInFlight = false;

export function registerContactApprovalHandler(fn) {
  respondHandler = fn;
}

// isPseudoCpuTarget（続き106）: main.jsのisPseudoCpuTarget（turn-timer.js由来）を
// このファイルへ直接importすると、contact-approval.js→turn-timer.js→main.js→
// contact-approval.jsという3方向の循環参照になってしまう（phase-automation.jsが
// turn-timer.jsを直接importできないのと同じ理由）。checkEligibility/onUseCounterLock
// と同じ「main.js側から関数を注入してもらう」既存パターンをそのまま拡張して回避する。
export function registerCounterLockHelpers({ checkEligibility, onUseCounterLock, isPseudoCpuTarget, isSelfCpuSubstituted, cpuDecider }) {
  checkCounterLockEligibility = checkEligibility;
  useCounterLockHandler = onUseCounterLock;
  isPseudoCpuTargetCheck = isPseudoCpuTarget;
  if (isSelfCpuSubstituted) isSelfCpuSubstitutedCheck = isSelfCpuSubstituted;
  if (cpuDecider) cpuCounterLockDecider = cpuDecider;
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
  const counterLockEligible = canRespond && !!checkCounterLockEligibility?.(pending.defender);
  const hasCounterLock = counterLockEligible && autoMode;
  // 自動処理モードON・応答可能・リアクションカード無し、の場合はボタン自体を出さない
  // （main.js側のcheckCounterLockAutoApproval()が自動で承認して先へ進める。final-lock-
  // approval.jsのゴメンナサイと同じ「使えない人にはボタンを見せてもチラつくだけ」の考え方）。
  // #229: オンラインでは「使えない人」にも承認ボタンを出す（黙って自動承認しない）。
  // 隠すのはローカル（1画面で全席を操作するCPU戦など）だけ。
  if (canRespond && autoMode && !hasCounterLock && !isOnlineMode()) {
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
  // AFK代行中の自席が接触された時も、カウンターロックを持っていても使わずに承認する（CPU戦と
  // 同じ挙動。放置で止まらないように。ユーザー要望2026-08-08）。
  const autoDeclineDefender =
    isPseudoCpuTargetCheck?.(pending.defender) ||
    (isSelfCpuSubstitutedCheck?.() && pending.defender === getSelfSeat());
  // CPU（または自席AFK代行）が防御側でカウンターロックを持っている時は、その判断を完全自動化し、
  // 人間には絶対にモーダルを見せない（#59-③: 人間がCPUに接触した時に「カウンターロックを使い
  // ますか？」モーダルが漏れて出ていた）。ブレインが「使う」と判断すれば実際に使い（#59-①）、
  // でなければ承認する。多重発火はinFlightで防ぐが、in-flight中でもモーダルは組み立てずに返す
  // （＝どのタイミングでも人間に判断モーダルを漏らさない）。
  //
  // 【2026-09-07】オンラインの**疑似CPUの席**にも広げた。それまでこの自動判断は「カウンター
  // ロックを持っている時」だけで、持っていない時のオンラインは**人間用の承認ボタンを出して
  // 待つ**だけだった（#229「使えない人にも承認を押してもらう」＝人間向けの方針）。誰も座って
  // いない席ではそれを押す人がおらず、45秒の自動承認まで対局が丸ごと止まる。実測: オンライン
  // の決着まで対戦が turn 11 で pendingContact {attacker:"C",defender:"A"} のまま停止した。
  // ・広げたのは**疑似CPUモードの席だけ**（スモークテスト・観戦）。AFK代行の席は従来どおり
  //   45秒待つ——**全員に同じ時間**が与えられることが、#229 の「早く通った＝持っていない」
  //   という情報漏れを防ぐ仕組みそのものだから。誰も座っていないテスト用の席にはその配慮は
  //   要らない（人間の対戦相手がいない）。
  // ・canRespond はオンラインでは「自分が防御側本人」を意味するので、**自分の席の分を自分の
  //   画面が答えるだけ**＝相手や観戦者が代わりに答えてしまうことはない。
  const onlineAutoSeat = isOnlineMode() && !!isPseudoCpuTargetCheck?.(pending.defender);
  if (canRespond && autoDeclineDefender && (hasCounterLock || onlineAutoSeat)) {
    hideImmediately();
    if (!pseudoCpuCounterLockAutoDeclineInFlight) {
      pseudoCpuCounterLockAutoDeclineInFlight = true;
      const useIt = counterLockEligible && !!cpuCounterLockDecider?.(pending.defender);
      Promise.resolve(useIt ? useCounterLockHandler?.() : respondHandler?.(true)).finally(() => {
        pseudoCpuCounterLockAutoDeclineInFlight = false;
      });
    }
    return;
  }
  modalEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "contact-approval-title";
  title.textContent = t("game.contact.title");
  modalEl.appendChild(title);

  const body = document.createElement("div");
  body.className = "contact-approval-body";
  if (hasCounterLock) {
    body.textContent = t("game.contact.bodyCounter", {
      attacker: getPlayerName(pending.attacker),
      defender: getPlayerName(pending.defender),
    });
  } else {
    const names = { attacker: getPlayerName(pending.attacker), defender: getPlayerName(pending.defender) };
    body.textContent = canRespond ? t("game.contact.bodySelf", names) : t("game.contact.bodyWait", names);
  }
  modalEl.appendChild(body);

  if (canRespond) {
    const buttons = document.createElement("div");
    buttons.className = "contact-approval-buttons";
    if (hasCounterLock) {
      const useBtn = document.createElement("button");
      useBtn.className = "contact-approval-approve";
      useBtn.type = "button";
      useBtn.textContent = t("game.contact.useCounter");
      useBtn.addEventListener("click", () => {
        hideImmediately();
        useCounterLockHandler?.();
      });
      const declineBtn = document.createElement("button");
      declineBtn.className = "contact-approval-reject";
      declineBtn.type = "button";
      declineBtn.textContent = t("game.contact.declineCounter");
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
      approveBtn.textContent = t("game.contact.approve");
      approveBtn.addEventListener("click", () => {
        hideImmediately();
        respondHandler?.(true);
      });
      buttons.appendChild(approveBtn);
      // 【2026-09-07・ユーザー判断】「拒否する」は**カード効果の自動処理がオフの時だけ**出す。
      // ルールブック（docs/rulebook.md 198/332行）では接触は申し込んだ側の一方的な行動で、
      // 接触された側に断る権利は無い（唯一の対抗手段が275行のカウンターロック＝カードの効果）。
      // 自動処理モードでこのボタンを出していると、**誰でもあらゆる接触を無条件に断れる**
      // ——接触は相手の手札を減らす主要な攻め手なので、勝敗に直結する抜け道になっていた。
      //
      // なぜ紛れ込んだか: この「承認／拒否」の2択はもともと**自己申告で処理する形**
      // （ユドンリウムコネクト風＝自動処理オフ）のUIで、そこでは「カードの効果で接触を防いだ」
      // 等をプレイヤー自身が申告するための正当な選択肢。自動処理モードのローカル戦では
      // そもそもこのモーダルを出さない（上の分岐で main.js が自動承認する）ので表に出なかったが、
      // **オンラインだけ #229「使えない人にも承認ボタンを出す」（＝早く通った人＝持っていない、
      // という情報漏れを防ぐため）で表示するようにしたため、拒否まで一緒に出てしまっていた**。
      // 承認ボタンは残るので #229 の狙い（全員が同じように1回押す）はそのまま成立する。
      if (!autoMode) {
        const rejectBtn = document.createElement("button");
        rejectBtn.className = "contact-approval-reject";
        rejectBtn.type = "button";
        rejectBtn.textContent = t("game.contact.reject");
        rejectBtn.addEventListener("click", () => {
          hideImmediately();
          respondHandler?.(false);
        });
        buttons.appendChild(rejectBtn);
      }
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
