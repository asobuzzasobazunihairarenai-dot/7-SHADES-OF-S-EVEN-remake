// CPU自己対戦が「まれに固まる」原因を突き止めるための調査用スクリプト（スモークの派生）。
//
//   node test/stall-probe.mjs [人数] [--repeat N]
//
// smoke.mjs と同じ手順で自己対戦を回し、状態がまったく変化しなくなったら（＝固まったら）
// その瞬間のページ内部を丸ごと吸い出して表示する: 進行中の選択待ち・処理中フラグ・
// 画面に出ているオーバーレイ（クリック待ちのモーダル）・アクションログの末尾。
// スモークは「固まった」ことしか分からないため、原因の切り分け専用にこちらを使う。
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8796;
const ARGS = process.argv.slice(2);
const PLAYER_COUNT = [2, 3, 4].includes(Number(ARGS.find((a) => /^[234]$/.test(a)))) ? Number(ARGS.find((a) => /^[234]$/.test(a))) : 2;
const REPEAT = (() => {
  const i = ARGS.findIndex((a) => a === "--repeat" || a === "-r");
  const n = i >= 0 ? parseInt(ARGS[i + 1], 10) : NaN;
  return Number.isFinite(n) && n >= 1 ? n : 6;
})();
const STALL_MS = 25000;
const TARGET_TURN = 10;

const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".ico": "image/x-icon" };
function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0]);
    if (p === "/") p = "/index.html";
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(fp).pipe(res);
  });
  return new Promise((r) => server.listen(PORT, () => r(server)));
}
const log = (...a) => console.log("[probe]", ...a);

async function dumpStall(page) {
  const info = await page.evaluate(async () => {
    const out = {};
    try {
      const s = (await import("/src/state.js")).getState();
      out.state = { turnNumber: s.turnNumber, turnPlayer: s.turnPlayer, priorityPlayer: s.priorityPlayer, deadlineInMs: s.priorityDeadline ? s.priorityDeadline - Date.now() : null, pendingContact: !!s.pendingContact, pendingFinalLock: !!s.pendingFinalLock };
    } catch (e) { out.stateErr = String(e); }
    try {
      const m = await import("/src/main.js");
      out.picker = m.hasActiveEffectPicker?.() ?? null;
      out.busy = m.isAnyEffectProcessingBusy?.() ?? null;
      out.stall = m.getStallDiagnostics?.() ?? null;
    } catch (e) { out.mainErr = String(e); }
    try {
      const pa = await import("/src/phase-automation.js");
      out.phase = pa.getCurrentPhase?.();
      out.handEffectBusy = pa.isHandEffectBusy?.();
      out.handEffectBusyStuckMs = pa.getHandEffectBusyStuckMs?.();
    } catch (e) { out.paErr = String(e); }
    try {
      const tt = await import("/src/turn-timer.js");
      out.turnTimerEnabled = tt.isTurnTimerEnabled?.();
      out.pseudoCpuTargetSelf = tt.isPseudoCpuTarget?.("A");
    } catch (e) { out.ttErr = String(e); }
    try {
      const on = await import("/src/online.js");
      out.spectating = on.isSpectatingGame?.();
      out.online = on.isOnlineMode?.();
      out.selfSeat = on.getSelfSeat?.();
    } catch (e) {}
    try {
      const pa = await import("/src/phase-automation.js");
      out.setupRevealActive = pa.isSetupRevealActive?.();
    } catch (e) {}
    try { out.autoPhaseSkip = (await import("/src/auto-phase-skip-setting.js")).isAutoPhaseSkipEnabled?.(); } catch (e) {}
    try { out.won = (await import("/src/victory.js")).hasAnyoneWon?.(); } catch (e) {}
    try { out.autoProcessing = (await import("/src/card-effect-engine.js")).isAutoProcessingEnabled?.(); } catch (e) {}
    // 手で1回だけ自動処理を呼んでみて、何が返るか（＝自動処理自体が壊れているのか、
    // それを呼ぶ側=tickのゲートで止まっているのか）を切り分ける。
    try {
      const m = await import("/src/main.js");
      out.manualAutoActionResult = String(m.performPriorityTimeoutAutoAction?.());
    } catch (e) { out.manualErr = String(e); }
    // 画面に出ている（クリック待ちかもしれない）オーバーレイを列挙する。
    out.overlays = [...document.body.children]
      .map((el) => {
        const cs = getComputedStyle(el);
        const z = parseInt(cs.zIndex, 10);
        if (cs.display === "none" || cs.visibility === "hidden") return null;
        if (!Number.isFinite(z) || z < 100) return null;
        const r = el.getBoundingClientRect();
        if (r.width < 20 || r.height < 20) return null;
        return { id: el.id || null, cls: el.className && typeof el.className === "string" ? el.className.slice(0, 80) : null, z, w: Math.round(r.width), h: Math.round(r.height), text: (el.textContent || "").trim().slice(0, 120) };
      })
      .filter(Boolean)
      .sort((a, b) => b.z - a.z);
    try {
      const al = await import("/src/action-log.js");
      out.tail = (al.getActionLogText ? al.getActionLogText() : "").split("\n").slice(-40).join("\n");
    } catch (e) {}
    return out;
  });
  log("=== STALL DUMP ===");
  log("state:", JSON.stringify(info.state));
  log("picker:", info.picker, "busy:", info.busy, "phase:", info.phase, "handEffectBusy:", info.handEffectBusy, "stuckMs:", info.handEffectBusyStuckMs);
  log("stallDiag:", JSON.stringify(info.stall));
  log("gates:", JSON.stringify({ turnTimerEnabled: info.turnTimerEnabled, pseudoCpuTargetSelf: info.pseudoCpuTargetSelf, spectating: info.spectating, online: info.online, selfSeat: info.selfSeat, setupRevealActive: info.setupRevealActive, autoPhaseSkip: info.autoPhaseSkip, won: info.won, autoProcessing: info.autoProcessing, manualAutoActionResult: info.manualAutoActionResult, manualErr: info.manualErr, ttErr: info.ttErr }));
  log("overlays:", JSON.stringify(info.overlays, null, 1));
  log("--- action log tail ---\n" + (info.tail || "(none)"));
}

async function playOne(page) {
  await page.evaluate(async (count) => {
    const online = await import("/src/online.js");
    try { await online.signOut?.(); } catch (e) {}
    const cpu = await import("/src/cpu-battle.js");
    const admin = await import("/src/admin.js");
    admin.setPseudoCpuModeEnabled?.(true);
    await cpu.startCpuBattle(count);
    admin.setPseudoCpuIncludeSelf?.(true);
    await cpu.runCpuBattleSetup({ count });
    admin.setPseudoCpuIncludeSelf?.(true);
    try { const os = await import("/src/opening-screen.js"); os.forceCloseOpeningScreen?.(); } catch (e) {}
  }, PLAYER_COUNT);
  let lastSig = "", lastAt = Date.now(), lastTurn = 0;
  while (true) {
    await page.waitForTimeout(1500);
    const snap = await page.evaluate(async () => {
      const s = (await import("/src/state.js")).getState();
      let won = false;
      try { const v = await import("/src/victory.js"); won = v.hasAnyoneWon?.() ?? false; } catch (e) {}
      const toks = (s.tokens || []).map((t) => { const l = t.location || {}; return `${t.id}:${l.zone}:${l.row ?? ""}:${l.col ?? ""}:${l.index ?? ""}:${l.player ?? ""}:${t.faceUp ? 1 : 0}`; }).sort().join(",");
      const piles = Object.values(s.piles || {}).map((a) => (Array.isArray(a) ? a.length : 0)).join(",");
      return { turnNumber: s.turnNumber ?? 0, won, sig: `${s.turnNumber}|${s.priorityPlayer}|${piles}|${toks}` };
    });
    if (snap.won) return "won";
    if (snap.sig !== lastSig) { lastSig = snap.sig; lastAt = Date.now(); }
    if (snap.turnNumber > lastTurn) { lastTurn = snap.turnNumber; log("turn", lastTurn); }
    if (lastTurn >= TARGET_TURN) return "ok";
    if (Date.now() - lastAt > STALL_MS) { await dumpStall(page); return "stalled"; }
  }
}

const server = await startServer();
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("[probe] CONSOLE.error:", m.text()); });
page.on("pageerror", (e) => console.log("[probe] PAGEERROR:", e.message));
await page.addInitScript(() => {
  try {
    localStorage.setItem("so7-intros-all-off", "1");
    localStorage.setItem("so7-bugreport-intro-hidden", "1");
    localStorage.setItem("so7-action-confirm-enabled", "0");
    localStorage.setItem("so7-bgm-intro-shown-v1", "1");
    localStorage.setItem("so7-disable-update-checker", "1");
  } catch (e) {}
});
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(3000);
let stalled = 0;
for (let i = 1; i <= REPEAT; i++) {
  log(`━━━ ${i}/${REPEAT} ━━━`);
  const r = await playOne(page);
  log(`${i}: ${r}`);
  if (r === "stalled") { stalled++; if (!process.argv.includes("--keep-going")) break; }
}
await browser.close();
server.close();
log(stalled ? "STALL を再現しました（上のダンプ参照）" : "今回は再現しませんでした");
process.exit(0);
