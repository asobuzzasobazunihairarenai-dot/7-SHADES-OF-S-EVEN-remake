// 開発用スモークテスト（無ビルドのバニラESMアプリを、ヘッドレスChromiumで実際に起動して回す）。
//
//   node test/smoke.mjs            … 2人・8ターン点検
//   node test/smoke.mjs 3          … 3人（4も可）
//   node test/smoke.mjs 3 --full   … 決着まで（勝者が出るまで）回す
//   node test/smoke.mjs --nav      … 画面遷移の背面バグチェックだけ（自己対戦しない・続き231）
//
// ★このNode版は「タブを前面に保つ必要がない」のが利点（ユーザー要望2026-08-19「前面維持がつらい、
//   別作業したい」）。ヘッドレスChromiumを別プロセスで起動するので、あなたのブラウザは一切関係なく、
//   バックグラウンドタブのタイマースロットル（in-appスモークが遅くなる原因）も受けない。ターミナルで
//   走らせておいて、その間ずっと別作業ができる。
//
// やること: 静的サーバでアプリを配信 → Chromiumで開く → CPU戦を開始し「全席とも自動」
// （疑似CPU includeSelf）にして自己対戦させ、ターンが進むのを監視する。目的は、今回の
// #86/#87（効果エンジン/到達まわりの回帰）のような「実際にプレイして初めて壊れる」不具合を、
// 手で遊ばなくても1コマンドで早期に捕まえること。判定:
//   - コンソールエラー / 未捕捉例外が1件でも出たら FAIL
//   - 不変条件違反（状態の壊れ。in-app版と同じ game-invariants.js）を検知したら FAIL
//   - ターンが規定回数まで進めば PASS（健全に対戦が進んだ）／--full は勝者が出れば PASS
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
// CLI引数: 人数（2/3/4）と --full（決着まで）。
const ARGS = process.argv.slice(2);
const PLAYER_COUNT = [2, 3, 4].includes(Number(ARGS.find((a) => /^[234]$/.test(a)))) ? Number(ARGS.find((a) => /^[234]$/.test(a))) : 2;
const RUN_TO_COMPLETION = ARGS.includes("--full") || ARGS.includes("--completion");
// --nav: 画面遷移の背面バグチェック（続き231）だけを1回実行して終了（自己対戦はしない）。
const RUN_NAV = ARGS.includes("--nav");
// 連続実行の回数（in-app版「連続実行 N回」に相当。ユーザー要望2026-08-19）。
//   node test/smoke.mjs 3 --repeat 5   … 3人を5回連続で回す
const REPEAT = (() => {
  let n = NaN;
  const i = ARGS.findIndex((a) => a === "--repeat" || a === "-r");
  if (i >= 0) n = parseInt(ARGS[i + 1], 10);
  const eq = ARGS.find((a) => a.startsWith("--repeat="));
  if (eq) n = parseInt(eq.split("=")[1], 10);
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : 1;
})();
const TARGET_TURN = 8; // ここまで進めば十分健全とみなす（回帰検出には十分な手数）
const STALL_MS = 30000; // ターンがこの時間まったく進まなければ「詰み」とみなす
// 3-4人は1局が長いので制限時間を人数に比例（in-app版と同じ考え方）。決着まで＝最大12分。
// 続き321: 180秒→300秒に緩めた。試練の儀式のような「1ターンの中で何度も繰り返す」到達効果に
// 当たると、止まっていないのに8ターンへ到達する前に制限時間を迎えてFAILになっていた（実測: 進行は
// 続いているのにturn7で時間切れ）。本当の停止は上の STALL_MS（30秒まったく状態が変化しない）で
// 検出するので、こちらはあくまで暴走防止の上限として長めに取る。
const HARD_TIMEOUT_MS = RUN_TO_COMPLETION ? 720000 : Math.round(300000 * (PLAYER_COUNT / 2));

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

// テストのログを画面とファイルの両方へ出す（ユーザー報告2026-09-03「気づいたらログがない」）。
// 端末の表示は消えることがある（バッファのクリア・ウィンドウを閉じた等）。ファイルに残して
// おけば後から確実に読めるし、不具合報告にもそのまま貼れる。ログは test-logs/ に置く
// （.gitignore 済み。実行のたびに1ファイル、古いものは自分で消す運用）。
const LOG_DIR = path.join(ROOT, "test-logs");
const LOG_PATH = path.join(
  LOG_DIR,
  "smoke-" + stamp() + ".log"
);
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}
let logStream = null;
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
} catch {
  /* 書けない環境でも画面表示だけで動く */
}
function toLine(args) {
  return args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
}
for (const level of ["log", "error", "warn"]) {
  const orig = console[level].bind(console);
  console[level] = (...args) => {
    try {
      logStream?.write(toLine(args) + String.fromCharCode(10));
    } catch {
      /* ignore */
    }
    orig(...args);
  };
}
console.log("[smoke] ログの保存先: " + LOG_PATH);

function log(...a) { console.log("[smoke]", ...a); }

// 1試合ぶんを回して結果を返す。allErrors はページ全体のエラー配列（run()で1度だけ登録した
// listenerが積む）。errStart で「この試合中に新たに出たエラー」だけを切り出す。
async function playOneGame(page, allErrors) {
  const errStart = allErrors.length;
  const gameErrors = [];
  const pushErr = (m) => { gameErrors.push(m); };

  // CPU戦を開始し、全席とも自動（疑似CPU includeSelf）にして自己対戦させる。includeSelf は
  // runCpuBattleSetup の「前」に立てるのが重要——turn 1（A席）のタイマーが張られる時点で
  // A も疑似CPU対象になっていないと、A が人間扱い（長い持ち時間）で動かず停滞するため。
  // 連続実行の2試合目以降も startCpuBattle が resetGame するので盤面は作り直される。
  const baselineCardCount = await page.evaluate(async (count) => {
    const online = await import("/src/online.js");
    try { await online.signOut?.(); } catch (e) {}
    const cpu = await import("/src/cpu-battle.js");
    const admin = await import("/src/admin.js");
    admin.setPseudoCpuModeEnabled?.(true);
    await cpu.startCpuBattle(count);
    admin.setPseudoCpuIncludeSelf?.(true); // setup前に：A席も自動化
    await cpu.runCpuBattleSetup({ count });
    admin.setPseudoCpuIncludeSelf?.(true); // 念のため再設定（startCpuBattleがfalseに戻すため）
    // オープニング画面（#opening-screen, z50000）を閉じて盤面を露出させる。閉じないと盤面中央を
    // 覆ったままになり、UI不変条件チェック（幽霊オーバーレイ検知）が実際の盤面を検査できない。
    try { const os = await import("/src/opening-screen.js"); os.forceCloseOpeningScreen?.(); } catch (e) {}
    // セットアップ直後のカード総数を baseline に（以後、総数が変われば「カードが増減」＝バグ）。
    try {
      const gi = await import("/src/game-invariants.js");
      const s = (await import("/src/state.js")).getState();
      return typeof gi.countCards === "function" ? gi.countCards(s) : null;
    } catch (e) { return null; }
  }, PLAYER_COUNT);
  log(`CPU self-play started (${PLAYER_COUNT}p, all seats auto)${RUN_TO_COMPLETION ? " — run to completion" : ""}` + (baselineCardCount != null ? `, baseline cards ${baselineCardCount}` : ""));

  const started = Date.now();
  let lastTurn = 0;
  let lastProgressAt = Date.now();
  let lastStateSig = "";
  const invariantViolations = [];
  const seenViolations = new Set();
  let prevPollSigs = [];

  while (true) {
    await page.waitForTimeout(1500);
    if (allErrors.length > errStart || gameErrors.length) break;

    const snap = await page.evaluate(async (baseline) => {
      const s = (await import("/src/state.js")).getState();
      let won = false;
      try {
        // 勝利判定は victory.js（phase-automation.js には無い＝旧コードは常に未検知だった。続き226で修正）。
        const vic = await import("/src/victory.js");
        won = typeof vic.hasAnyoneWon === "function" ? vic.hasAnyoneWon() : false;
      } catch (e) {}
      // 不変条件（in-app版と同じ）。状態(game-invariants.js)＋UI/DOM(ui-invariants.js)。続き229。
      let viols = [];
      try {
        const gi = await import("/src/game-invariants.js");
        viols = gi.checkInvariants(s, { baselineCardCount: baseline }) || [];
      } catch (e) {}
      try {
        const ui = await import("/src/ui-invariants.js");
        viols = viols.concat(ui.checkUiInvariants() || []);
      } catch (e) {}
      // 状態の活動署名（in-app版と同じ。ターン番号だけでなくトークン位置・山の枚数の変化も見る＝
      // ゲート侵攻など1ターン内で長く続く処理も「進行中」と判定でき、誤STALLを防ぐ。続き226）。
      let sig = "";
      try {
        const toks = (s.tokens || [])
          .map((t) => { const l = t.location || {}; return `${t.id}:${l.zone || ""}:${l.row ?? ""}:${l.col ?? ""}:${l.index ?? ""}:${l.side ?? ""}:${l.player ?? ""}:${t.faceUp ? 1 : 0}`; })
          .sort().join(",");
        const piles = Object.values(s.piles || {}).map((a) => (Array.isArray(a) ? a.length : 0)).join(",");
        sig = `${s.turnNumber ?? ""}|${s.priorityPlayer ?? ""}|${piles}|${toks}`;
      } catch (e) {}
      return {
        turnNumber: s.turnNumber ?? 0,
        turnPlayer: s.turnPlayer ?? null,
        tokens: Array.isArray(s.tokens) ? s.tokens.length : 0,
        won,
        viols,
        sig,
      };
    }, baselineCardCount);

    // 不変条件違反（続き223: 入れ替え等の一過性overlap誤検知を避け、連続2ポーリング続いた違反だけ本物）。
    const nowSigs = [];
    for (const vio of snap.viols || []) {
      const sig = vio.code + "|" + (vio.detail ? JSON.stringify(vio.detail) : vio.msg);
      nowSigs.push(sig);
      if (seenViolations.has(sig)) continue;
      if (!prevPollSigs.includes(sig)) continue;
      seenViolations.add(sig);
      invariantViolations.push({ turn: snap.turnNumber, ...vio });
      log(`❗INVARIANT[${vio.code}] T${snap.turnNumber}: ${vio.msg}`);
    }
    prevPollSigs = nowSigs;

    if (snap.won) { log("someone won at turn", snap.turnNumber, "— healthy finish"); break; }
    if (snap.tokens < 40) { pushErr(`board looks corrupted: only ${snap.tokens} tokens`); break; }

    // 状態が変われば「活動あり」＝STALLタイマーをリセット（ターン内の長い処理も進行とみなす）。
    if (snap.sig && snap.sig !== lastStateSig) {
      lastStateSig = snap.sig;
      lastProgressAt = Date.now();
    }
    if (snap.turnNumber > lastTurn) {
      lastTurn = snap.turnNumber;
      lastProgressAt = Date.now();
      log(`turn ${snap.turnNumber} (player ${snap.turnPlayer}, tokens ${snap.tokens})`);
    }
    // 決着までモードでなければ8ターン到達で健全とみなす。決着までは勝者が出るまで続ける。
    if (!RUN_TO_COMPLETION && lastTurn >= TARGET_TURN) { log("reached target turn", TARGET_TURN, "— PASS"); break; }
    if (Date.now() - lastProgressAt > STALL_MS) { pushErr(`STALLED: no turn progress for ${STALL_MS / 1000}s (stuck at turn ${lastTurn})`); break; }
    if (Date.now() - started > HARD_TIMEOUT_MS) { pushErr(`hard timeout after ${HARD_TIMEOUT_MS / 1000}s (reached turn ${lastTurn})`); break; }
  }

  if (invariantViolations.length) {
    const codes = [...new Set(invariantViolations.map((x) => x.code))].join(", ");
    pushErr(`不変条件違反 ${invariantViolations.length}件（${codes}）— 状態が壊れています`);
  }

  // この試合で新たに出たページ側エラー（console.error / pageerror）＋この試合固有のエラー。
  const pageErrsThisGame = allErrors.slice(errStart);
  const combined = [...pageErrsThisGame, ...gameErrors];

  // 失敗時は原因追跡用にアクションログの末尾を出す。
  if (combined.length) {
    try {
      const tail = await page.evaluate(async () => {
        const al = await import("/src/action-log.js");
        const t = al.getActionLogText ? al.getActionLogText() : "";
        return t.split("\n").slice(-25).join("\n");
      });
      log("--- action log tail ---\n" + tail);
    } catch (e) {}
  }
  return { errors: combined, turnsReached: lastTurn };
}

async function run() {
  const server = await startServer();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const allErrors = [];
  page.on("console", (m) => { if (m.type() === "error") allErrors.push("CONSOLE.error: " + m.text()); });
  page.on("pageerror", (e) => allErrors.push("PAGEERROR: " + (e && e.message ? e.message : String(e))));

  // ゲーム開始時の説明モーダル等を抑制して自動進行を邪魔しない（テスト環境の都合）。
  await page.addInitScript(() => {
    try {
      localStorage.setItem("so7-intros-all-off", "1");
      localStorage.setItem("so7-bugreport-intro-hidden", "1");
      localStorage.setItem("so7-action-confirm-enabled", "0");
      // 初回起動のBGM設定モーダル（全画面dim backdrop, z-index 100050）を抑制。これが出っ放しだと
      // 盤面中央をずっと覆い、UI不変条件チェック（幽霊オーバーレイ検知）が実際の盤面を見られない。
      localStorage.setItem("so7-bgm-intro-shown-v1", "1");
      // 自動アップデート（version.jsonのズレでlocation.reload）がテスト中に評価を中断するのを防ぐ（続き231）。
      localStorage.setItem("so7-disable-update-checker", "1");
      // 盤面のWebGL描画（2026-09-05から既定ON）をテストでは切る。ヘッドレスChromiumには
      // GPUが無くWebGLをCPUで描くため、1フレーム600ms超まで落ちて「進んでいないだけ」を
      // 停止と誤検知する（実測でオンラインの決着まで対戦がこれで失敗した）。ここで見たいのは
      // ゲームの進行であって描画性能ではないので、従来のCSS描画で回す。
      localStorage.setItem("so7-board-3d-enabled", "0");
    } catch (e) {}
  });

  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(3000);

  const bootChildren = await page.evaluate(() => document.body.children.length);
  if (bootChildren < 20) throw new Error(`boot looks broken: body has only ${bootChildren} children`);
  log("booted OK (body children:", bootChildren + ")");

  // --nav: 画面遷移の背面バグチェックだけ実行して終了。アイドル状態（未ログイン・非対局）だと
  // ページが不安定でモジュール評価が中断されることがあるため、自己対戦と同じ安定した状態
  // （signOut＋CPU戦セットアップ＋オープニング画面クローズ）にしてから nav チェックを回す。
  // nav チェックは z-index 比較でページ同士の重なり順を見る（ゲームのモーダルは無視）ので、
  // 対局中でも問題なく検査できる。
  if (RUN_NAV) {
    await page.evaluate(async () => {
      const online = await import("/src/online.js");
      try { await online.signOut?.(); } catch (e) {}
      const cpu = await import("/src/cpu-battle.js");
      const admin = await import("/src/admin.js");
      admin.setPseudoCpuModeEnabled?.(true);
      await cpu.startCpuBattle(2);
      await cpu.runCpuBattleSetup({ count: 2 });
      try { const os = await import("/src/opening-screen.js"); os.forceCloseOpeningScreen?.(); } catch (e) {}
    });
    await page.waitForTimeout(1500);
    const viols = await page.evaluate(async () => {
      const nav = await import("/src/nav-layering-check.js");
      return (await nav.checkNavigationLayering()).map((v) => v.msg);
    });
    await browser.close();
    server.close();
    if (viols.length) {
      log(`画面遷移チェック: 背面バグ ${viols.length}件`);
      for (const m of viols) log(" ❗" + m);
      return { passCount: 0, total: 1, firstFailure: { i: 1, res: { errors: viols } } };
    }
    log("画面遷移チェック: 背面バグなし ✅");
    return { passCount: 1, total: 1, firstFailure: null };
  }

  // 連続実行（--repeat N）。1試合ずつ回し、各試合の PASS/FAIL を集計する。
  const results = [];
  let firstFailure = null;
  for (let i = 1; i <= REPEAT; i++) {
    if (REPEAT > 1) log(`━━━━ ${i}/${REPEAT}回目 ━━━━`);
    let res;
    try {
      res = await playOneGame(page, allErrors);
    } catch (e) {
      res = { errors: ["EXCEPTION: " + (e && e.message ? e.message : String(e))], turnsReached: 0 };
    }
    const passed = res.errors.length === 0;
    results.push(res);
    log(`${REPEAT > 1 ? i + "回目: " : ""}${passed ? "PASS ✅" : "FAIL ❌ — " + res.errors.join(" / ")}`);
    if (!passed && !firstFailure) firstFailure = { i, res };
  }

  await browser.close();
  server.close();

  const passCount = results.filter((r) => r.errors.length === 0).length;
  return { passCount, total: results.length, firstFailure };
}

run()
  .then(({ passCount, total, firstFailure }) => {
    if (passCount < total) {
      const f = firstFailure;
      console.error(`\n[smoke] FAIL: ${passCount}/${total} PASS` + (f ? `（最初の失敗=${f.i}回目）:\n - ` + f.res.errors.join("\n - ") : ""));
      process.exit(1);
    }
    console.log(`\n[smoke] PASS ✅ (${passCount}/${total})`);
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n[smoke] ERROR:", err);
    process.exit(1);
  });
