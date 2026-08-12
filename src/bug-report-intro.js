// オンライン対戦のゲーム開始時に一度だけ出す「不具合報告のお願い」案内（ユーザー要望
// 2026-08-10）。画面を暗転し、オプションエリアの不具合報告アイコン(#self-status-bug-report)
// をフォーカス（光らせて）説明する。「今後は表示しない」を押すと以後は二度と出さない。
//
// #62/#63（2026-08-11）: 初版は「暗転レイヤーの上にアイコンの複製リングを座標計算(fixed+
// getBoundingClientRect)で重ねる」方式だったが、実機で位置がアイコンとズレる報告が出た
// （一度きりの座標計測がレイアウトと合わない／再現条件が読めない）。座標計算をやめ、
// 実アイコンそのものにフォーカス用クラスを付けて光らせ、#option-area を暗転より前面へ
// 一時的に上げて見せる方式へ変更した。実要素をそのまま光らせるので原理的にズレない。

import { createModalCloseX } from "./ui-helpers.js";

const HIDE_KEY = "so7-bug-report-intro-hidden-v1";

let rootEl = null;
let focusedIconEl = null;
let prevOptionAreaZ = null;

export function isBugReportIntroHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function closeIntro() {
  if (focusedIconEl) {
    focusedIconEl.classList.remove("bug-report-intro-focus");
    focusedIconEl = null;
  }
  // #option-area の z-index を元に戻す（暗転より前面へ上げていた分）。
  const oa = document.getElementById("option-area");
  if (oa && prevOptionAreaZ !== null) oa.style.zIndex = prevOptionAreaZ;
  prevOptionAreaZ = null;
  rootEl?.remove();
  rootEl = null;
}

// 開始告知（showStartPlayerModal）が閉じた直後などに呼ぶ。既に非表示設定・アイコン未構築なら
// 何もしない（安全に空振りする）。
// このページ読み込み（セッション）中に一度でも出したか。不具合#77: スマホで通信が頻繁に
// 切れて再接続するたびにゲーム開始フローが再実行され、この案内が何度も出てしまう報告への対策。
// 永続の「今後は表示しない」とは別に、1セッションでは最大1回だけ出す（再接続で連発しない）。
let shownThisSession = false;

export function maybeShowBugReportIntro() {
  if (rootEl) return;
  if (shownThisSession) return; // 再接続等でゲーム開始が再実行されても連発させない(#77)
  if (isBugReportIntroHidden()) return;
  // アイコンがまだレイアウトされていない場合は案内しない（指す対象が無いため）。
  const icon = document.getElementById("self-status-bug-report");
  if (!icon) return;
  shownThisSession = true;

  rootEl = document.createElement("div");
  rootEl.id = "bug-report-intro";
  // 暗転部分のクリックで閉じる（モーダル本体はstopPropagationで閉じない）。
  rootEl.addEventListener("click", closeIntro);

  // 実アイコンをそのまま光らせてフォーカス（座標計算をしないので絶対にズレない）。
  focusedIconEl = icon;
  icon.classList.add("bug-report-intro-focus");
  // #option-area(z:900)は暗転(rootEl z:10060)の裏に隠れてしまうので、暗転より前面へ一時的に
  // 上げて、光らせたアイコン（と上部の帯）を見せる。子はpointer-events:autoのまま。閉じる時に戻す。
  const oa = document.getElementById("option-area");
  if (oa) {
    prevOptionAreaZ = oa.style.zIndex || "";
    oa.style.zIndex = "10062";
  }

  // 説明モーダル。
  const modal = document.createElement("div");
  modal.id = "bug-report-intro-modal";
  modal.addEventListener("click", (e) => e.stopPropagation());

  const title = document.createElement("div");
  title.className = "bug-report-intro-title";
  title.textContent = "🐛 不具合報告のお願い";

  const desc = document.createElement("div");
  desc.className = "bug-report-intro-desc";
  desc.textContent =
    "ゲーム中やホーム画面などで不具合・気になる挙動があれば、画面上部の光っているこのアイコンからご報告をお願いいたします。" +
    "アクションログなども一緒に送信されるので、原因の特定にとても助かります。";

  const actions = document.createElement("div");
  actions.className = "bug-report-intro-actions";

  const hideBtn = document.createElement("button");
  hideBtn.type = "button";
  hideBtn.className = "bug-report-intro-hide";
  hideBtn.textContent = "今後は表示しない";
  hideBtn.addEventListener("click", () => {
    try {
      localStorage.setItem(HIDE_KEY, "1");
    } catch {
      /* 保存不可でも閉じる */
    }
    closeIntro();
  });

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "bug-report-intro-ok";
  okBtn.textContent = "OK";
  okBtn.addEventListener("click", closeIntro);

  actions.appendChild(hideBtn);
  actions.appendChild(okBtn);

  modal.appendChild(createModalCloseX(closeIntro));
  modal.appendChild(title);
  modal.appendChild(desc);
  modal.appendChild(actions);
  rootEl.appendChild(modal);

  document.body.appendChild(rootEl);
}
