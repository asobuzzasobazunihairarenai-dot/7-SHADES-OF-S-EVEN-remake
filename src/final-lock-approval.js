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
// 【CPU強化 2026-08-08】承認者がローカルCPU戦のCPU席の時に真を返す判定（main.jsから注入）。
// 真の時はバナーの承認/ゴメンナサイのボタンを人間に出さず「CPUの承認を待っています…」表示に
// する（人間がCPUの代わりに承認・発動してしまうのを防ぐ。実際の承認/ゴメンナサイ発動は
// main.jsのcheckCpuFinalLockApprovalが自動で行う）。
let isApproverAutoDriven = null;
export function registerApproverAutoDrivenCheck(fn) {
  isApproverAutoDriven = fn;
}

// ユーザー要望2026-08-08（#36a）「『ゴメンナサイを使う』を押した後は『ロックエリアの奪う
// カードを選んでください』的な案内に切り替わってほしい」。押してから奪う札を選び終えるまでの間、
// main.js側がこれをtrueにする。その間バナーは承認/ゴメンナサイのボタンを引っ込め、案内だけ出す。
let gomennasaiPicking = false;
export function setGomennasaiPicking(v) {
  gomennasaiPicking = !!v;
}

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

// 直近に描画したバナー内容の署名。render()は対局中ひっきりなしに呼ばれ、そのたびに
// このバナーを作り直す（innerHTML=""）と、ユーザーがボタンを押す瞬間にDOMごと差し替わり
// クリックが取りこぼされる（ユーザー報告「ゴメンナサイを使うを押しても何も起きない」の
// 主因）。中身が変わらない限り作り直さないよう、署名が一致する間はDOMをそのまま残す。
let lastBannerSignature = null;
function hideBanner() {
  if (lastBannerSignature === null) return;
  bannerEl.classList.remove("is-visible");
  bannerEl.innerHTML = "";
  lastBannerSignature = null;
}

export function updateFinalLockApprovalBanner() {
  if (!bannerEl) return;
  const pending = getState().pendingFinalLock;
  if (!pending || pending.queue.length === 0) {
    hideBanner();
    return;
  }
  const approver = pending.queue[0];
  // ローカルモードは1人で全座席を操作するテスト用途のため、既存の「座席を持っていれば
  // 何でも動かせる」方針を踏襲し、常にボタンを押せるようにする。オンライン中だけ、
  // 実際にその座席でログインしている本人にだけ操作を許可する。
  // ローカルCPU戦でCPU席が承認者の時は、人間に操作させず「待っています…」表示にする。
  const autoDriven = !!isApproverAutoDriven?.(approver);
  const canRespond = (!isOnlineMode() || getSelfSeat() === approver) && !autoDriven;
  // #36a: 「ゴメンナサイを使う」を押して奪う札を選んでいる最中は、承認/却下ボタンを引っ込め、
  // 「ロックエリアから奪うカードを選んでください」の案内だけに切り替える。
  if (gomennasaiPicking && canRespond) {
    const signature = "gomennasai-picking|" + approver;
    if (signature === lastBannerSignature) {
      bannerEl.classList.add("is-visible");
      return;
    }
    lastBannerSignature = signature;
    bannerEl.classList.add("is-visible");
    bannerEl.innerHTML = "";
    const title = document.createElement("div");
    title.className = "final-lock-approval-title";
    title.textContent = "🍬 ゴメンナサイ";
    bannerEl.appendChild(title);
    const status = document.createElement("div");
    status.className = "final-lock-approval-status";
    status.textContent = "ロックエリアから奪うカードを選んでください";
    bannerEl.appendChild(status);
    return;
  }
  // ユーザー確認済み方針「コストを払える人だけが却下（＝妨害）できる」。払えない
  // 承認者にはボタン自体を見せず、バナー全体を隠す（main.js側のcheckGomennasaiAuto
  // Approval()がこの承認者を検知し、自動で承認して先へ進める。「あなたの承認が
  // 必要です」と見せておいてすぐ消えるチラつきを避けるため、最初から出さない）。
  const isEligibleForGomennasai = canRespond && !!checkGomennasaiEligibility?.(approver);
  if (canRespond && !isEligibleForGomennasai) {
    hideBanner();
    return;
  }
  // 中身が変わらない限り作り直さない（作り直すと連打レンダーにクリックを奪われる）。
  // 署名には表示に効く全要素（挑戦者/承認者/操作可否/ゴメンナサイ可否＋表示名）を含める。
  const signature = [
    pending.attacker,
    approver,
    canRespond,
    isEligibleForGomennasai,
    getPlayerName(pending.attacker),
    getPlayerName(approver),
  ].join("|");
  if (signature === lastBannerSignature) {
    bannerEl.classList.add("is-visible"); // 念のため可視状態は維持
    return;
  }
  lastBannerSignature = signature;
  bannerEl.classList.add("is-visible");
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
