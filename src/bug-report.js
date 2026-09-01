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
  uploadBugShot,
} from "./online.js";
import { getActionLogText } from "./action-log.js";
import { getBlackboxSummary } from "./crash-blackbox.js";
import { getPlayerName } from "./player-identity.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { APP_VERSION } from "./app-version.js";
import { getState } from "./state.js";
import { isCpuBattleActive, isSelfCpuSubstituted } from "./cpu-battle-state.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13
import { buildCardFace } from "./card-renderer.js";

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

// #187「手札が見えなくなる」の調査用。報告した瞬間の自分の手札の見え方を記録する。
// 再現手順が分からない（こちらでは再現できていない）不具合なので、次に起きた時に
// 「要素が無いのか／中身が空なのか／画面の外に出ているのか／透明なのか」を切り分けられる
// ようにしておく。中身（カード名）は載せない＝ここに隠し情報は入らない。
// 添付画像の下ごしらえ（ユーザー要望2026-08-29「不具合報告に任意でスクショを貼れるように」）。
// 長辺を1600pxまで縮めてWebPにする（元がPNGのスクショだと数MBになるため）。切り抜きはしない
// ——不具合の場所が画面の端にあることも多いので、画面全体をそのまま見たい。
const SHOT_MAX_DIMENSION = 1600;
const SHOT_WEBP_QUALITY = 0.82;
const SHOT_MAX_INPUT_BYTES = 10 * 1024 * 1024;

async function fileToShotBlob(file) {
  const objectUrl = URL.createObjectURL(file);
  let img;
  try {
    img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(t("bug.attachFailedInline")));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) throw new Error(t("bug.attachFailedInline"));
  const scale = Math.min(1, SHOT_MAX_DIMENSION / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", SHOT_WEBP_QUALITY));
  if (!blob) throw new Error(t("bug.attachFailedInline"));
  return blob;
}

// #194 の切り分け用（2026-09-01）。カード面（buildCardFace）を画面外に1枚描いて、
// タイトル・ルビ・効果文が「カード面の高さの何%の位置か」を測って返す。
// 手元のChromiumでは タイトル52.5% / 効果文58% になる。実機（iOS Safari）でこれが
// ずれていれば、ruby が行の高さを食っているという仮説が裏付けられる。
// 文字（カード名・効果文）は載せない＝隠し情報も個人情報も入らない。
function gatherCardFaceSnapshot() {
  try {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-9999px;top:0;width:300px;height:300px;pointer-events:none;";
    // ルビ付きのカード（収穫と種まき）で測る。無い場合はここで例外になり null を返す。
    host.appendChild(buildCardFace("orange-harvest-sow"));
    document.body.appendChild(host);
    const face = host.querySelector(".card-face");
    const fr = face.getBoundingClientRect();
    const pct = (el, key) => {
      if (!el || !fr.height) return null;
      const r = el.getBoundingClientRect();
      return { top: +(((r.top - fr.top) / fr.height) * 100).toFixed(1), h: +((r.height / fr.height) * 100).toFixed(1) };
    };
    const out = {
      face: [Math.round(fr.width), Math.round(fr.height)],
      title: pct(face.querySelector(".card-face-title")),
      rt: pct(face.querySelector(".card-face-title rt")),
      effect: pct(face.querySelector(".card-face-effect")),
      divider: pct(face.querySelector(".card-face-divider")),
      // 書体が実際に当たっているか（Webフォントが読めていないと行の高さも変わる）。
      titleFont: getComputedStyle(face.querySelector(".card-face-title") || face).fontFamily.slice(0, 60),
      fontsReady: typeof document.fonts?.status === "string" ? document.fonts.status : "unknown",
    };
    host.remove();
    return out;
  } catch (err) {
    return { error: String(err).slice(0, 120) };
  }
}

function gatherHandSnapshot() {
  try {
    const st = getState();
    const seat = getSelfSeat();
    const handTokens = (st?.tokens ?? []).filter(
      (t) => t.kind === "card" && t.location?.zone === "hand" && t.location.player === seat
    ).length;
    const els = [...document.querySelectorAll(".hand-card.is-self")];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cards = els.slice(0, 12).map((el) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const mount = el.querySelector(":scope > .card-face-mount");
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
        onScreen: r.right > 0 && r.left < vw && r.bottom > 0 && r.top < vh,
        vis: cs.visibility,
        disp: cs.display,
        op: cs.opacity,
        bg: cs.backgroundImage === "none" ? "none" : "image",
        face: mount ? mount.children.length : -1, // -1=マウント自体が無い、0=空
      };
    });
    return { seat, handTokens, elements: els.length, viewport: vw + "x" + vh, cards };
  } catch (e) {
    return { error: String(e).slice(0, 120) };
  }
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
    hand: gatherHandSnapshot(), // #187: 手札が見えなくなる件の切り分け用
    cardFace: gatherCardFaceSnapshot(), // #194: カード面のタイトル/ルビ/効果文の位置（実機の実測値）
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

let pasteHandler = null; // 報告モーダルが開いている間だけ有効な Ctrl+V 受け取り
function close() {
  if (pasteHandler) { window.removeEventListener("paste", pasteHandler); pasteHandler = null; }
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

  // --- 画像の添付（任意。ユーザー要望2026-08-29）--------------------------------
  // 選択・貼り付け(Ctrl+V)・ドラッグ＆ドロップの3通りで受け取り、送る直前にWebPへ縮めてから
  // Storageへ上げる。画像の送信に失敗しても、本文とログの送信は必ず行う。
  let shotBlob = null;
  const attachWrap = document.createElement("div");
  attachWrap.className = "bug-report-attach";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.style.display = "none";

  const attachBtn = document.createElement("button");
  attachBtn.type = "button";
  attachBtn.className = "bug-report-attach-btn";
  attachBtn.textContent = t("bug.attach");
  attachBtn.addEventListener("click", () => fileInput.click());

  const attachHint = document.createElement("div");
  attachHint.className = "bug-report-attach-hint";
  attachHint.textContent = t("bug.attachHint");

  const preview = document.createElement("div");
  preview.className = "bug-report-attach-preview";
  preview.style.display = "none";
  const previewImg = document.createElement("img");
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "bug-report-attach-remove";
  removeBtn.textContent = t("bug.attachRemove");
  removeBtn.addEventListener("click", () => setShot(null));
  preview.append(previewImg, removeBtn);

  function setShot(file) {
    if (previewImg.src) URL.revokeObjectURL(previewImg.src);
    if (!file) {
      shotBlob = null;
      previewImg.removeAttribute("src");
      preview.style.display = "none";
      attachBtn.style.display = "";
      return;
    }
    shotBlob = file;
    previewImg.src = URL.createObjectURL(file);
    preview.style.display = "";
    attachBtn.style.display = "none";
    status.classList.remove("is-error");
    status.textContent = "";
  }
  function acceptFile(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) { status.textContent = t("bug.attachBadType"); status.classList.add("is-error"); return; }
    if (file.size > SHOT_MAX_INPUT_BYTES) { status.textContent = t("bug.attachTooBig"); status.classList.add("is-error"); return; }
    setShot(file);
  }
  fileInput.addEventListener("change", () => acceptFile(fileInput.files?.[0]));
  // Ctrl+V でスクリーンショットをそのまま貼れるように（この報告モーダルが開いている間だけ）。
  const onPaste = (e) => {
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type?.startsWith("image/"));
    if (!item) return;
    const file = item.getAsFile();
    if (file) { e.preventDefault(); acceptFile(file); }
  };
  window.addEventListener("paste", onPaste);
  pasteHandler = onPaste; // close() で外す
  // ドラッグ＆ドロップ
  attachWrap.addEventListener("dragover", (e) => { e.preventDefault(); attachWrap.classList.add("is-dragover"); });
  attachWrap.addEventListener("dragleave", () => attachWrap.classList.remove("is-dragover"));
  attachWrap.addEventListener("drop", (e) => {
    e.preventDefault();
    attachWrap.classList.remove("is-dragover");
    acceptFile(e.dataTransfer?.files?.[0]);
  });
  attachWrap.append(attachBtn, preview, attachHint, fileInput);

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
      const context = gatherContext();
      // 画像は「送れたら添える」扱い。失敗しても本文とログの送信は必ず行う
      // （バケット未作成＝SQL未実行や、未ログインでも報告自体は成立させる）。
      let shotWarning = "";
      if (shotBlob) {
        status.textContent = t("bug.uploadingShot");
        try {
          const blob = await fileToShotBlob(shotBlob);
          context.shotUrl = await uploadBugShot(blob);
        } catch (err) {
          console.error("uploadBugShot failed", err);
          shotWarning = t("bug.shotFailed");
        }
        status.textContent = isOnlineMode() ? t("bug.sendingOnline") : t("bug.sending");
      }
      await submitBugReport({
        comment,
        actionLog,
        consoleLog,
        context,
      });
      status.classList.remove("is-error");
      status.textContent = shotWarning ? t("bug.sent") + " " + shotWarning : t("bug.sent");
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
  modalEl.appendChild(attachWrap);
  modalEl.appendChild(status);
  modalEl.appendChild(actions);

  document.body.appendChild(backdropEl);
  document.body.appendChild(modalEl);
  textarea.focus();
}
