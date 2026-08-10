// オンライン対戦のゲーム開始時に一度だけ出す「不具合報告のお願い」案内（ユーザー要望
// 2026-08-10）。画面を暗転し、オプションエリアの不具合報告アイコン(#self-status-bug-report)
// の位置をスポットライト（リング＋アイコンの複製）で浮かび上がらせて説明する。
// 「今後は表示しない」を押すと以後は二度と出さない（localStorage）。
//
// 実アイコンをそのまま暗転の上へ透かすのは重ね順（#option-areaの独自スタッキング）に依存して
// 崩れやすいため、暗転レイヤーの上に「同じアイコン画像の複製＋光るリング」を実アイコンの座標に
// 重ねて描く方式にした（重ね順に左右されず確実にフォーカスが当たって見える）。

import { createModalCloseX } from "./ui-helpers.js";

const HIDE_KEY = "so7-bug-report-intro-hidden-v1";
const BUG_ICON_SRC = "assets/icons/bug-report.svg";

let rootEl = null;
let ringEl = null;

export function isBugReportIntroHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === "1";
  } catch {
    return false;
  }
}

function positionRing() {
  if (!ringEl) return;
  const icon = document.getElementById("self-status-bug-report");
  if (!icon) {
    ringEl.style.display = "none";
    return;
  }
  const r = icon.getBoundingClientRect();
  if (!r.width || !r.height) {
    ringEl.style.display = "none";
    return;
  }
  const pad = 10;
  ringEl.style.display = "flex";
  ringEl.style.left = `${r.left - pad}px`;
  ringEl.style.top = `${r.top - pad}px`;
  ringEl.style.width = `${r.width + pad * 2}px`;
  ringEl.style.height = `${r.height + pad * 2}px`;
}

function closeIntro() {
  window.removeEventListener("resize", positionRing);
  rootEl?.remove();
  rootEl = null;
  ringEl = null;
}

// 開始告知（showStartPlayerModal）が閉じた直後などに呼ぶ。既に非表示設定・アイコン未構築なら
// 何もしない（安全に空振りする）。
export function maybeShowBugReportIntro() {
  if (rootEl) return;
  if (isBugReportIntroHidden()) return;
  // アイコンがまだレイアウトされていない場合は案内しない（指す対象が無いため）。
  const icon = document.getElementById("self-status-bug-report");
  if (!icon) return;

  rootEl = document.createElement("div");
  rootEl.id = "bug-report-intro";
  // 暗転部分のクリックで閉じる（モーダル本体はstopPropagationで閉じない）。
  rootEl.addEventListener("click", closeIntro);

  // フォーカス用リング＋アイコン複製。
  ringEl = document.createElement("div");
  ringEl.id = "bug-report-intro-ring";
  const ringImg = document.createElement("img");
  ringImg.className = "bug-report-intro-ring-img";
  ringImg.src = BUG_ICON_SRC;
  ringImg.alt = "";
  ringEl.appendChild(ringImg);
  rootEl.appendChild(ringEl);

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
  positionRing();
  window.addEventListener("resize", positionRing);
}
