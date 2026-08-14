// 開発用スモークテスト（無ビルドのバニラESMアプリを、ヘッドレスChromiumで実際に起動して回す）。
//
//   node test/smoke.mjs
//
// やること: 静的サーバでアプリを配信 → Chromiumで開く → CPU戦を開始し「両席とも自動」
// （疑似CPU includeSelf）にして自己対戦させ、ターンが進むのを監視する。目的は、今回の
// #86/#87（効果エンジン/到達まわりの回帰）のような「実際にプレイして初めて壊れる」不具合を、
// 手で遊ばなくても1コマンドで早期に捕まえること。判定:
//   - コンソールエラー / 未捕捉例外が1件でも出たら FAIL
//   - ターンが規定回数まで進めば PASS（健全に対戦が進んだ）
//   - ターンが一定時間まったく進まなければ「詰み」= FAIL（勝敗がついた場合を除く）
// 終了コード 0=PASS / 1=FAIL（CIやコミット前フックからも使える）。
//
// 前提: `npm install` 済み（playwright）＋ `npx playwright install chromium` 済み。
// このファイル・package.json・node_modules はデプロイ（GitHub Pages）には一切含まれない。

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8795;
const TARGET_TURN = 8; // ここまで進めば十分健全とみなす（回帰検出には十分な手数）
const STALL_MS = 30000; // ターンがこの時間まったく進まなければ「詰み」とみなす
const HARD_TIMEOUT_MS = 180000;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff",
  ".ttf": "font/ttf", ".ico": "image/x-icon",
};

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
    if (p === "/") p = "/index.html";
    const fp = path.join(ROOT, p);
    if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) {
      res.writeHead(404); res.end("404"); return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(fp).pipe(res);
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

function log(...a) { console.log("[smoke]", ...a); }

async function run() {
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE.error: " + m.text()); });
  page.on("pageerror", (e) => errors.push("PAGEERROR: " + (e && e.message ? e.message : String(e))));

  // ゲーム開始時の説明モーダル等を抑制して自動進行を邪魔しない（テスト環境の都合）。
  await page.addInitScript(() => {
    try {
      localStorage.setItem("so7-intros-all-off", "1");
      localStorage.setItem("so7-bugreport-intro-hidden", "1");
      localStorage.setItem("so7-action-confirm-enabled", "0");
    } catch (e) {}
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(3000);

  const bootChildren = await page.evaluate(() => document.body.children.length);
  if (bootChildren < 20) throw new Error(`boot looks broken: body has only ${bootChildren} children`);
  log("booted OK (body children:", bootChildren + ")");

  // CPU戦を開始し、両席とも自動（疑似CPU includeSelf）にして自己対戦させる。includeSelf は
  // runCpuBattleSetup の「前」に立てるのが重要——turn 1（A席）のタイマーが張られる時点で
  // A も疑似CPU対象になっていないと、A が人間扱い（長い持ち時間）で動かず停滞するため。
  await page.evaluate(async () => {
    const online = await import("/src/online.js");
    try { await online.signOut?.(); } catch (e) {}
    const cpu = await import("/src/cpu-battle.js");
    const admin = await import("/src/admin.js");
    admin.setPseudoCpuModeEnabled?.(true);
    await cpu.startCpuBattle();
    admin.setPseudoCpuIncludeSelf?.(true); // setup前に：A席も自動化
    await cpu.runCpuBattleSetup();
    admin.setPseudoCpuIncludeSelf?.(true); // 念のため再設定（startCpuBattleがfalseに戻すため）
  });
  log("CPU self-play started (both seats auto)");

  const started = Date.now();
  let lastTurn = 0;
  let lastProgressAt = Date.now();

  while (true) {
    await page.waitForTimeout(1500);
    if (errors.length) break;

    const snap = await page.evaluate(async () => {
      const s = (await import("/src/state.js")).getState();
      let won = false;
      try {
        const pa = await import("/src/phase-automation.js");
        won = typeof pa.hasAnyoneWon === "function" ? pa.hasAnyoneWon() : false;
      } catch (e) {}
      return {
        turnNumber: s.turnNumber ?? 0,
        turnPlayer: s.turnPlayer ?? null,
        tokens: Array.isArray(s.tokens) ? s.tokens.length : 0,
        won,
      };
    });

    if (snap.won) { log("someone won at turn", snap.turnNumber, "— healthy finish"); break; }
    if (snap.tokens < 40) { errors.push(`board looks corrupted: only ${snap.tokens} tokens`); break; }

    if (snap.turnNumber > lastTurn) {
      lastTurn = snap.turnNumber;
      lastProgressAt = Date.now();
      log(`turn ${snap.turnNumber} (player ${snap.turnPlayer}, tokens ${snap.tokens})`);
    }
    if (lastTurn >= TARGET_TURN) { log("reached target turn", TARGET_TURN, "— PASS"); break; }
    if (Date.now() - lastProgressAt > STALL_MS) { errors.push(`STALLED: no turn progress for ${STALL_MS / 1000}s (stuck at turn ${lastTurn})`); break; }
    if (Date.now() - started > HARD_TIMEOUT_MS) { errors.push(`hard timeout after ${HARD_TIMEOUT_MS / 1000}s (reached turn ${lastTurn})`); break; }
  }

  // 失敗時は原因追跡用にアクションログの末尾を出す。
  if (errors.length) {
    try {
      const tail = await page.evaluate(async () => {
        const al = await import("/src/action-log.js");
        const t = al.getActionLogText ? al.getActionLogText() : "";
        return t.split("\n").slice(-25).join("\n");
      });
      log("--- action log tail ---\n" + tail);
    } catch (e) {}
  }

  await browser.close();
  server.close();
  return errors;
}

run()
  .then((errors) => {
    if (errors.length) {
      console.error("\n[smoke] FAIL:\n - " + errors.join("\n - "));
      process.exit(1);
    }
    console.log("\n[smoke] PASS ✅");
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n[smoke] ERROR:", err);
    process.exit(1);
  });
