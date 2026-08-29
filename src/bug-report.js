// アプリ内「不具合報告」（ユーザー要望）。オプションメニューから開けるモーダルでコメントを
// 入力して送ると、その時点のアクションログ・コンソールログ・状況（バージョン/UA/画面/部屋ID）を
// 自動で添付して so7_bug_reports へ保存する（online.jsのsubmitBugReport）。管理者は管理者
// ダッシュボードの「不具合報告」から一覧を読める（so7_get_admin_bug_reports経由）。
//
// メール通知（「私に届く」）については、外部メール配信サービス（Resend等）を使うSupabase
// Edge Functionが別途必要なため、まずはDB保存＋管理者ダッシュボード表示で確実に届くように
// している。メール送信は後からEdge Functionを足せば、このinsertをトリガーに送れる。

import {
  submitBugReport,
  isOnlineMode,
  getSelfSeat,
  onBugLogRequestEvents,
  broadcastBugLogRequest,
  onBugLogResponseEvents,
  broadcastBugLogResponse,
} from "./online.js";
import { getActionLogText } from "./action-log.js";
import { getBlackboxSummary } from "./crash-blackbox.js";
import { getPlayerName } from "./player-identity.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { APP_VERSION } from "./app-version.js";
import { getState } from "./state.js";
import { isCpuBattleActive, isSelfCpuSubstituted } from "./cpu-battle-state.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

// ---- コンソールログの簡易リングバッファ（起動時にconsoleをフックして直近を保持する） ----
const CONSOLE_BUFFER_MAX = 300;
const consoleBuffer = [];
let consoleHooked = false;

function installConsoleCapture() {
  if (consoleHooked) return;
  consoleHooked = true;
  // index.htmlの最初期インラインスクリプトが既にconsoleを包んでwindow.__so7ConsoleBufferへ
  // 蓄積している場合は、そちら（Tailwind等のモジュール前ログも取れる）を使うのでここでは
  // 二重に包まない。getConsoleLogText()がwindow.__so7ConsoleBufferを優先して読む。
  if (typeof window !== "undefined" && Array.isArray(window.__so7ConsoleBuffer)) return;
  // ユーザー報告「不具合報告でコンソールを取得できていません」。以前は warn/error だけを
  // 包んでいたため、console.log/info しか出ていない対局では添付が「(なし)」になっていた。
  // 不具合報告に載せる目的では log/info も拾う必要があるので全レベルを包む。
  // トレードオフ: console.log/info を包むと devtools の出力元表示がこの wrapper
  // （bug-report.js）になる（本来の呼び出し元の行が見えなくなる）。ただし今はアプリが
  // 自動でコンソールを添付するので、devtoolsを手でコピーする前提自体が薄れており許容する。
  // なお高頻度のデバッグログ（remote-move-animatorのBLINK_DEBUG等）は既定でオフにして
  // あるので、300件のリングバッファが無意味なログで溢れることはない。
  const levels = ["log", "info", "warn", "error"];
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
  // 最初期インラインスクリプト（index.html）のバッファがあればそれを優先（モジュール前の
  // ログまで含む）。無い環境（テスト等）ではこのモジュール内のフォールバックバッファを使う。
  const early = typeof window !== "undefined" ? window.__so7ConsoleBuffer : null;
  return (Array.isArray(early) ? early : consoleBuffer).join("\n");
}

// ---- 対戦相手のログ収集（ユーザー要望「不具合報告時に相手全員のログも取得したい」） ----
// このモジュールはmain.jsから起動時にeager importされる（installConsoleCaptureのため）ので、
// ここで応答リスナーを常時登録しておけば、自分が報告者でなくても、他プレイヤーの報告時の
// 収集要求に自分のログを返せる。状態は一切変えない、online.jsの合図の上に乗るだけの処理。
onBugLogRequestEvents((payload) => {
  if (!payload || !payload.requestId) return;
  try {
    const seat = getSelfSeat();
    broadcastBugLogResponse({
      requestId: payload.requestId,
      seat,
      name: getPlayerName(seat),
      actionLog: getActionLogText(),
      consoleLog: getConsoleLogText(),
    });
  } catch (err) {
    console.error("bug log response failed", err);
  }
});

// 報告者側: 全プレイヤーへ収集要求をbroadcastし、一定時間だけ応答を集める。realtimeの
// 取りこぼし対策に何度か再送する（delegateToPlayerForEffectの再送と同じ考え方）。
// 自分自身の応答は（送信元には基本echoされないうえ）別途本文に添付するため座席で弾く。
async function collectPeerLogs(timeoutMs = 2500) {
  if (!isOnlineMode()) return [];
  const requestId = `buglog-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const selfSeat = getSelfSeat();
  const responses = new Map(); // seat（無ければname）-> { seat, name, actionLog, consoleLog }
  const unregister = onBugLogResponseEvents((payload) => {
    if (!payload || payload.requestId !== requestId) return;
    if (payload.seat && payload.seat === selfSeat) return;
    responses.set(payload.seat ?? payload.name ?? String(responses.size), payload);
  });
  broadcastBugLogRequest({ requestId });
  await new Promise((resolve) => {
    const resend = setInterval(() => broadcastBugLogRequest({ requestId }), 800);
    setTimeout(() => {
      clearInterval(resend);
      resolve();
    }, timeoutMs);
  });
  unregister();
  return [...responses.values()];
}

// 収集した自分＋相手のログを、見出し付きで1本のテキストに束ねる（so7_bug_reportsの
// action_log/console_log列にそのまま入れる。新しい列やSQLの追加は不要）。
function sectionLabel(name, seat, kind, extra = "") {
  return `==== ${name ?? "?"}（${seat ?? "?"}${extra}）の${kind} ====`;
}
function buildCombinedLogs(peers) {
  let actionLog = getActionLogText();
  let consoleLog = getConsoleLogText();
  // オフライン/単独時は従来通り自分のぶんだけをそのまま返す（見出しも付けない）。
  if (!isOnlineMode()) return { actionLog, consoleLog };
  const selfSeat = getSelfSeat();
  const selfName = getPlayerName(selfSeat);
  actionLog = `${sectionLabel(selfName, selfSeat, "アクションログ", "／報告者")}\n${actionLog || "(なし)"}`;
  consoleLog = `${sectionLabel(selfName, selfSeat, "コンソール", "／報告者")}\n${consoleLog || "(なし)"}`;
  for (const p of peers) {
    actionLog += `\n\n${sectionLabel(p.name, p.seat, "アクションログ")}\n${p.actionLog || "(なし)"}`;
    consoleLog += `\n\n${sectionLabel(p.name, p.seat, "コンソール")}\n${p.consoleLog || "(なし)"}`;
  }
  return { actionLog, consoleLog };
}

function gatherContext() {
  let roomId = null;
  try {
    // 部屋IDはURLハッシュ/クエリに載っていることがある。無ければnull。
    roomId = new URLSearchParams(location.search).get("game") || null;
  } catch {
    /* noop */
  }
  // ユーザー要望2026-08-08（#48）: 不具合報告に「オンライン/ローカル/CPU戦のどれか」「各座席が
  // 人間かCPUか」等の対局コンテキストを載せる（後から状況を切り分けやすくするため）。
  let gameContext = null;
  try {
    const st = getState();
    gameContext = {
      mode: isOnlineMode() ? "online" : isCpuBattleActive() ? "cpu-battle(1P)" : "local",
      selfSeat: getSelfSeat(),
      activePlayers: st?.activePlayers ?? null,
      turnPlayer: st?.turnPlayer ?? null,
      selfCpuSubstituted: isSelfCpuSubstituted(), // 自席がAFKでCPU代行中か
    };
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
    gameContext,
    // リロードを跨ぐブラックボックス（crash-blackbox.js）: メモリのピーク・遷移種別・前回セッションの
    // 不審終了（＝落ちてタイトルに戻った疑い）を載せる。「スマホでたまに落ちる」原因追跡用。
    blackbox: (() => {
      try {
        return getBlackboxSummary();
      } catch {
        return null;
      }
    })(),
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
  title.textContent = t("bug.title");

  const desc = document.createElement("div");
  desc.className = "bug-report-desc";
  desc.textContent = t("bug.desc");

  const textarea = document.createElement("textarea");
  textarea.className = "bug-report-textarea";
  textarea.placeholder = t("bug.placeholder");
  textarea.rows = 6;

  const status = document.createElement("div");
  status.className = "bug-report-status";

  const actions = document.createElement("div");
  actions.className = "bug-report-actions";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "bug-report-cancel";
  cancelBtn.textContent = t("bug.cancel");
  cancelBtn.addEventListener("click", close);

  const submitBtn = document.createElement("button");
  submitBtn.type = "button";
  submitBtn.className = "bug-report-submit";
  submitBtn.textContent = t("bug.submit");
  submitBtn.addEventListener("click", async () => {
    const comment = textarea.value.trim();
    if (!comment) {
      status.textContent = t("bug.needText");
      status.classList.add("is-error");
      return;
    }
    submitBtn.disabled = true;
    cancelBtn.disabled = true;
    status.classList.remove("is-error");
    status.textContent = isOnlineMode() ? t("bug.sendingOnline") : t("bug.sending");
    try {
      const peers = await collectPeerLogs();
      const { actionLog, consoleLog } = buildCombinedLogs(peers);
      await submitBugReport({
        comment,
        actionLog,
        consoleLog,
        context: gatherContext(),
      });
      status.classList.remove("is-error");
      status.textContent = t("bug.sent");
      submitBtn.textContent = t("bug.sentBtn");
      setTimeout(close, 1400);
    } catch (err) {
      console.error("submitBugReport failed", err);
      status.classList.add("is-error");
      status.textContent =
      status.textContent = t("bug.failed");
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
