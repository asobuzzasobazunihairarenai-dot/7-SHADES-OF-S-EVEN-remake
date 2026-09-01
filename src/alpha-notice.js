// 「このアプリはα版（テスト中）です」のお知らせ（ユーザー要望2026-09-01）。
// ホーム画面を開いた時に出す。**テスターに気づいてもらうのが目的**なので、
//   ・アプリを開くたびに1回は出す（sessionStorage。ホームへ戻るたびには出ない＝しつこくない）
//   ・「今後このモーダルを表示しない」を押した人にはこの端末で二度と出さない（localStorage）
// という2段構えにした。文面は**初めての人・作り手でない人**に向けて、専門用語を使わずに書く。
import { t } from "./ui-text.js";
import { createBackdrop } from "./ui-helpers.js";

const NEVER_KEY = "so7-alpha-notice-never"; // 端末に永続（今後表示しない）
const SESSION_KEY = "so7-alpha-notice-shown"; // このセッションで表示済み

function neverAgain() {
  try {
    return localStorage.getItem(NEVER_KEY) === "1";
  } catch (err) {
    return false;
  }
}
function shownThisSession() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch (err) {
    return false;
  }
}
function markShown() {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch (err) {
    /* 使えない環境でも致命的ではない */
  }
}

// ホーム画面を開いた時に呼ぶ。出す条件を満たさなければ何もしない。
export function maybeShowAlphaNotice() {
  if (neverAgain() || shownThisSession()) return;
  markShown();
  showAlphaNotice();
}

export function showAlphaNotice() {
  if (document.getElementById("alpha-notice-modal")) return;
  // 背景は暗くする（読んでほしいお知らせなので、他の操作は一旦止める）。
  const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 2700 });
  const modal = document.createElement("div");
  modal.id = "alpha-notice-modal";

  const title = document.createElement("div");
  title.className = "alpha-notice-title";
  title.textContent = t("alpha.title");
  modal.appendChild(title);

  const lead = document.createElement("div");
  lead.className = "alpha-notice-lead";
  lead.textContent = t("alpha.lead");
  modal.appendChild(lead);

  // 箇条書き。1項目＝アイコン＋見出し＋やさしい説明の3点セットにして、読み飛ばしにくくする。
  const list = document.createElement("div");
  list.className = "alpha-notice-list";
  for (const [icon, headKey, bodyKey] of [
    ["🐛", "alpha.p1.head", "alpha.p1.body"],
    ["💬", "alpha.p2.head", "alpha.p2.body"],
    ["🔄", "alpha.p3.head", "alpha.p3.body"],
  ]) {
    const row = document.createElement("div");
    row.className = "alpha-notice-item";
    const ic = document.createElement("div");
    ic.className = "alpha-notice-icon";
    ic.textContent = icon;
    const textWrap = document.createElement("div");
    const head = document.createElement("div");
    head.className = "alpha-notice-item-head";
    head.textContent = t(headKey);
    const body = document.createElement("div");
    body.className = "alpha-notice-item-body";
    body.textContent = t(bodyKey);
    textWrap.appendChild(head);
    textWrap.appendChild(body);
    row.appendChild(ic);
    row.appendChild(textWrap);
    list.appendChild(row);
  }
  modal.appendChild(list);

  const thanks = document.createElement("div");
  thanks.className = "alpha-notice-thanks";
  thanks.textContent = t("alpha.thanks");
  modal.appendChild(thanks);

  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "alpha-notice-ok";
  okBtn.textContent = t("alpha.ok");
  okBtn.addEventListener("click", close);
  modal.appendChild(okBtn);

  const never = document.createElement("button");
  never.type = "button";
  never.className = "alpha-notice-never";
  never.textContent = t("alpha.never");
  never.addEventListener("click", () => {
    try {
      localStorage.setItem(NEVER_KEY, "1");
    } catch (err) {
      /* 使えない環境でも致命的ではない */
    }
    close();
  });
  modal.appendChild(never);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
