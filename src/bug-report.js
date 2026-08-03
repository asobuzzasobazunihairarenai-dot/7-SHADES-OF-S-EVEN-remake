// アプリ内「不具合報告」（ユーザー要望）。オプションメニューから開けるモーダルでコメントを
// 入力して送ると、その時点のアクションログ・コンソールログ・状況（バージョン/UA/画面/部屋ID）を
// 自動で添付して so7_bug_reports へ保存する（online.jsのsubmitBugReport）。管理者は管理者
// ダッシュボードの「不具合報告」から一覧を読める（so7_get_admin_bug_reports経由）。
//
// メール通知（「私に届く」）については、外部メール配信サービス（Resend等）を使うSupabase
// Edge Functionが別途必要なため、まずはDB保存＋管理者ダッシュボード表示で確実に届くように
// している。メール送信は後からEdge Functionを足せば、このinsertをトリガーに送れる。

import { submitBugReport } from "./online.js";
import { getActionLogText } from "./action-log.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { APP_VERSION } from "./app-version.js";

// ---- コンソールログの簡易リングバッファ（起動時にconsoleをフックして直近を保持する） ----
const CONSOLE_BUFFER_MAX = 300;
const consoleBuffer = [];
let consoleHooked = false;

function installConsoleCapture() {
  if (consoleHooked) return;
  consoleHooked = true;
  // console.log/info/debug は「包む」とdevtoolsの出力元表示が全部bug-report.jsになって
  // しまい（ユーザーが貼ったログが全部 bug-report.js:45 になる不具合）デバッグの妨げに
  // なるため、包まない。捕捉するのは重要度が高く頻度の低い warn/error だけにする
  // （通常のログは元々アクションログ側に十分残っている）。
  const levels = ["warn", "error"];
  for (const level of levels) {
    const original = console[level]?.bind(console);
    if (!original) continue;
    console[level] = (...args) => {
      try {
        const text = args
          .map((a) => {
            if (typeof a === "string") return a;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(" ");
        const ts = new Date().toISOString().slice(11, 23);
        consoleBuffer.push(`[${ts}] ${level.toUpperCase()}: ${text}`);
        if (consoleBuffer.length > CONSOLE_BUFFER_MAX) consoleBuffer.shift();
      } catch {
        /* キャプチャ失敗は無視（元のログ出力は必ず行う） */
      }
      original(...args);
    };
  }
  // 未捕捉エラーも拾う（スタックまで残す）。
  window.addEventListener("error", (e) => {
    const ts = new Date().toISOString().slice(11, 23);
    consoleBuffer.push(`[${ts}] UNCAUGHT: ${e?.message ?? ""} @ ${e?.filename ?? ""}:${e?.lineno ?? ""}`);
    if (consoleBuffer.length > CONSOLE_BUFFER_MAX) consoleBuffer.shift();
  });
  window.addEventListener("unhandledrejection", (e) => {
    const ts = new Date().toISOString().slice(11, 23);
    consoleBuffer.push(`[${ts}] UNHANDLED_REJECTION: ${String(e?.reason?.message ?? e?.reason ?? "")}`);
    if (consoleBuffer.length > CONSOLE_BUFFER_MAX) consoleBuffer.shift();
  });
}
installConsoleCapture();

function getConsoleLogText() {
  return consoleBuffer.join("\n");
}

function gatherContext() {
  let roomId = null;
  try {
    // 部屋IDはURLハッシュ/クエリに載っていることがある。無ければnull。
    roomId = new URLSearchParams(location.search).get("game") || null;
  } catch {
    /* noop */
  }
  return {
    version: APP_VERSION,
    userAgent: navigator.userAgent,
    screen: `${window.innerWidth}x${window.innerHeight}`,
    href: location.href,
    roomId,
    at: new Date().toISOString(),
  };
}

let modalEl = null;
let backdropEl = null;

function close() {
  modalEl?.remove();
  backdropEl?.remove();
  modalEl = null;
  backdropEl = null;
}

export function openBugReportModal() {
  if (modalEl) return;
  backdropEl = createBackdrop(close, { dim: true, zIndex: 10040 });
  modalEl = document.createElement("div");
  modalEl.id = "bug-report-modal";

  const title = document.createElement("div");
  title.className = "bug-report-title";
  title.textContent = "🐛 不具合報告";

  const desc = document.createElement("div");
  desc.className = "bug-report-desc";
  desc.textContent =
    "気づいた不具合や気になったことを書いて送ってください。送信すると、その時点のアクションログ・コンソールログ・状況（バージョン等）も自動で添付されます。";

  const textarea = document.createElement("textarea");
  textarea.className = "bug-report-textarea";
  textarea.placeholder = "例: ゲート侵攻でエターナル獲得の演出が崩れた。相手のペットが表示されない、など。";
  textarea.rows = 6;

  const status = document.createElement("div");
  status.className = "bug-report-status";

  const actions = document.createElement("div");
  actions.className = "bug-report-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "bug-report-cancel";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", close);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "bug-report-submit";
  submitBtn.textContent = "送信する";
  submitBtn.addEventListener("click", async () => {
    const comment = textarea.value.trim();
    if (!comment) {
      status.textContent = "内容を入力してください。";
      status.classList.add("is-error");
      return;
    }
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "送信中…";
    try {
      await submitBugReport({
        comment,
        actionLog: getActionLogText(),
        consoleLog: getConsoleLogText(),
        context: gatherContext(),
      });
      status.classList.remove("is-error");
      status.textContent = "送信しました。ありがとうございます！";
      submitBtn.textContent = "送信済み";
      setTimeout(close, 1400);
    } catch (err) {
      console.error("submitBugReport failed", err);
      status.classList.add("is-error");
      status.textContent =
        "送信に失敗しました（未実行のSQL追加分がある可能性）。お手数ですがアクションログを直接お送りください。";
      submitBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(submitBtn);

  modalEl.appendChild(createModalCloseX(close));
  modalEl.appendChild(title);
  modalEl.appendChild(desc);
  modalEl.appendChild(textarea);
  modalEl.appendChild(status);
  modalEl.appendChild(actions);

  document.body.appendChild(backdropEl);
  document.body.appendChild(modalEl);
  textarea.focus();
}
