// オンライン対戦のスモークテスト（実際のSupabaseに部屋を作り、複数のブラウザで対戦させる）。
//
//   node test/online-smoke.mjs        … 2人・8ターン点検
//   node test/online-smoke.mjs 4      … 4人（3も可）
//   node test/online-smoke.mjs 4 --full   … 決着まで
//
// なぜ必要か（ユーザーと確認した優先順位の①）: 既存の test/smoke.mjs は「1台の中だけで動く
// CPU戦」しか回していない。ところが実際に報告される不具合はほぼオンライン対戦（特に4人）で、
// 「順番」「通信」「複数クライアントの食い違い」が絡むため手元で再現できず、毎回ログから
// 推理して直していた。ここではプレイヤーの数だけ独立したブラウザ（別ログイン）を立ち上げて
// 本物の対戦を回し、次の4つを機械的に見張る:
//   1. どのクライアントでもコンソールエラー／未捕捉例外が出ないこと
//   2. どのクライアントでも不変条件（盤面の壊れ）が出ないこと
//   3. ターンが進み続けること（＝止まらない）
//   4. 全クライアントの盤面が一致すること（オンライン特有。ここが本命）
//
// 注意: 本物のSupabase（本番プロジェクト）に接続する。テスト用インスタンスは無いため、実行すると
//   ・ゲストアカウント（匿名ログイン）が人数分できる
//   ・部屋（so7_games）と対局データが1件できる
//   終了時に必ず退室して片付けるが、アカウント自体は残る。普段の `npm test` には含めない
//   （手で実行する時だけ動かす）。ランク戦ではなく通常の部屋を使うので、誰かのレートに
//   影響することはない。
//
// 前提: `npm install` 済み（playwright）＋ `npx playwright install chromium` 済み。

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8796; // ローカルCPU戦のスモーク(8795)と別ポート＝同時に走らせても衝突しない
const ARGS = process.argv.slice(2);
const PLAYER_COUNT = [2, 3, 4].includes(Number(ARGS.find((a) => /^[234]$/.test(a)))) ? Number(ARGS.find((a) => /^[234]$/.test(a))) : 2;
const RUN_TO_COMPLETION = ARGS.includes("--full") || ARGS.includes("--completion");
const KEEP_OPEN = ARGS.includes("--keep"); // 失敗時に画面を残して観察したい時用
// クライアントごとに独立したブラウザを立てるか。既定は1つのブラウザを共有する（軽い）。
// 共有だと「前面の1枚以外はブラウザ側でタイマーが抑制される」ため更新が遅れることがあるが、
// それは食い違い検知の側で「取り直したら揃うか」で切り分ける。--isolated を付けると
// 抑制自体が起きないぶん厳密になる代わりに、人数分のブラウザを起動するので重い。
const ISOLATED = ARGS.includes("--isolated");

const TARGET_TURN = 8;
const STALL_MS = 45000; // オンラインは通信の往復があるぶんローカルより緩める
const HARD_TIMEOUT_MS = RUN_TO_COMPLETION ? 900000 : Math.round(420000 * (PLAYER_COUNT / 2));
// 全クライアントの盤面が「一度も一致しないまま」この時間続いたら食い違い（desync）とみなす。
// 1クライアントだけ一瞬遅れるのは正常なので、瞬間的な不一致では落とさない。
const DESYNC_TOLERANCE_MS = 30000;
const PSEUDO_CPU_DEADLINE_MS = 1500; // 各席の自動プレイの間隔（短すぎると通信が追いつかない）

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

function log(...a) { console.log("[online]", ...a); }

// ページ内で何かを評価する。読み込み直後は（アプリ側の初期化・ServiceWorkerの制御開始などで）
// 実行コンテキストが作り直されることがあり、その瞬間に評価すると Playwright が
// 「Resulting promise was garbage collected」等で失敗する。数回まで静かに再試行する。
async function evalSafe(page, fn, arg, tries = 5) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      return await page.evaluate(fn, arg);
    } catch (e) {
      lastErr = e;
      const m = String(e && e.message);
      if (!/garbage collected|Execution context was destroyed|Target closed|navigation/i.test(m)) throw e;
      await page.waitForTimeout(700);
    }
  }
  throw lastErr;
}

// 1クライアント分のブラウザを用意する。contextを分けるとlocalStorage/Cookieが独立するので、
// 同じブラウザの中でも「別のプレイヤー」として別々にログインできる。
const LAUNCH_ARGS = [
  "--disable-background-timer-throttling",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
];
async function openClient(sharedBrowser, index, errors) {
  const browser = sharedBrowser || (await chromium.launch({ args: LAUNCH_ARGS }));
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await context.addInitScript(() => {
    try {
      // 自動更新のリロードは検査を壊すので止める（smoke.mjsと同じ）。
      localStorage.setItem("so7-disable-update-checker", "1");
    } catch (e) {}
  });
  const page = await context.newPage();
  const tag = "p" + (index + 1);
  page.on("pageerror", (e) => errors.push("[" + tag + "] pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const text = m.text();
    // 外部リソース（フォント等）の取得失敗はアプリの不具合ではないので無視する。
    // 409 は「同じ結論に他クライアントが先に到達した」時の version_conflict で、アプリ側が
    // 意図的に無視する正常系（online.js の fireAndForget のコメント参照）。ブラウザが出す
    // 「Failed to load resource」もブラウザ由来なので、失敗の判定には使わない。
    if (/favicon|fonts\.gstatic|net::ERR_|Failed to load resource/.test(text)) return;
    errors.push("[" + tag + "] console: " + text);
  });
  // 人数分のブラウザが同時に立ち上がると、ローカルの静的サーバーへのアクセスが一気に来るので
  // 余裕を持たせる（既定の30秒だと足りないことがあった）。
  await page.goto("http://localhost:" + PORT + "/index.html", { timeout: 90000 });
  // 盤面が組み上がる＝アプリの初期化が済んだ合図。固定の待ち時間より確実。
  await page.waitForFunction(() => document.querySelectorAll(".cell").length >= 49, null, { timeout: 30000 });
  // オープニング画面を閉じて盤面を露出させる（UI不変条件の検査が実際の盤面を見られるように）。
  await evalSafe(page, async () => {
    try { const os = await import("/src/opening-screen.js"); os.forceCloseOpeningScreen?.(); } catch (e) {}
    return true;
  });
  return { browser: sharedBrowser ? null : browser, context, page, tag };
}

// ゲストとしてログインし、疑似CPU（自分の席も自動）を有効にする。
async function signInAndPrepare(page, deadlineMs) {
  return evalSafe(page, async (ms) => {
    const online = await import("/src/online.js");
    try { await online.signOut?.(); } catch (e) {}
    await online.signInAnonymously();
    const user = await online.getCurrentUser();
    const admin = await import("/src/admin.js");
    // 自席も自動で動かす（オンラインでは各クライアントが自分の席だけを動かすので、
    // 全員がこれをONにすることで全席が自動になる）。
    admin.setPseudoCpuIncludeSelf?.(true);
    admin.setPseudoCpuDeadlineMs?.(ms);
    admin.setTurnTimerEnabled?.(true);
    return { userId: user?.id ?? null };
  }, deadlineMs);
}

// 各クライアントの状態スナップショット（共有stateの署名つき）。
async function snapshot(client) {
  return evalSafe(client.page, async () => {
    const s = (await import("/src/state.js")).getState();
    let won = false;
    try {
      const vic = await import("/src/victory.js");
      won = vic.hasAnyoneWon?.() ?? false;
    } catch (e) {}
    let viols = [];
    try {
      const gi = await import("/src/game-invariants.js");
      viols = gi.checkInvariants(s, {}) || [];
    } catch (e) {}
    try {
      const ui = await import("/src/ui-invariants.js");
      viols = viols.concat(ui.checkUiInvariants() || []);
    } catch (e) {}
    let seat = null;
    try {
      seat = (await import("/src/online.js")).getSelfSeat();
    } catch (e) {}
    // 共有state（全員で一致していなければならない部分）だけの署名。
    const toks = (s.tokens || [])
      .map((t) => {
        const l = t.location || {};
        return [t.id, l.zone || "", l.row ?? "", l.col ?? "", l.index ?? "", l.side ?? "", l.player ?? "", t.faceUp ? 1 : 0].join(":");
      })
      .sort()
      .join(",");
    const piles = Object.entries(s.piles || {})
      .map(([k, v]) => k + ":" + (Array.isArray(v) ? v.length : 0))
      .sort()
      .join(",");
    return {
      seat,
      turnNumber: s.turnNumber ?? 0,
      turnPlayer: s.turnPlayer ?? null,
      tokens: Array.isArray(s.tokens) ? s.tokens.length : 0,
      won,
      viols,
      sig: [s.turnNumber ?? "", s.turnPlayer ?? "", piles, toks].join("|"),
    };
  });
}

// 止まった時に、各クライアントが「何を待っているのか」を集める。
async function dumpDiagnostics(clients) {
  for (const c of clients) {
    try {
      const d = await evalSafe(c.page, async () => {
        const out = {};
        try {
          const main = await import("/src/main.js");
          out.stall = main.getStallDiagnostics?.() ?? null;
        } catch (e) { out.stall = "n/a"; }
        try {
          const pa = await import("/src/phase-automation.js");
          out.phase = pa.getCurrentPhase?.() ?? null;
        } catch (e) {}
        try {
          const st = (await import("/src/state.js")).getState();
          out.priority = st.priorityPlayer ?? null;
          out.turn = st.turnPlayer ?? null;
          out.deadlineIn = st.priorityDeadline ? Math.round((st.priorityDeadline - Date.now()) / 1000) : null;
        } catch (e) {}
        try {
          const log = await import("/src/action-log.js");
          const txt = log.getActionLogText?.() ?? "";
          out.tail = txt.split(String.fromCharCode(10)).filter((l) => l.trim()).slice(-6);
        } catch (e) {}
        return out;
      });
      log("  [" + c.tag + "] phase=" + d.phase + " turn=" + d.turn + " priority=" + d.priority + " deadlineIn=" + d.deadlineIn + "s");
      log("    stall:", JSON.stringify(d.stall));
      for (const line of d.tail || []) log("    |", line.slice(0, 200));
    } catch (e) {
      log("  [" + c.tag + "] diagnostics failed: " + e.message);
    }
  }
}

async function run() {
  const server = await startServer();
  const errors = [];
  const clients = [];
  let gameId = null;
  let failed = null;
  const fail = (m) => { if (!failed) failed = m; log("FAIL:", m); };

  log("starting: " + PLAYER_COUNT + " players" + (RUN_TO_COMPLETION ? " (run to completion)" : "") + (ISOLATED ? " [isolated]" : ""));
  log("browsers are starting up — this takes 30-60s before the match begins. please wait.");
  const sharedBrowser = ISOLATED ? null : await chromium.launch({ args: LAUNCH_ARGS });
  try {
    for (let i = 0; i < PLAYER_COUNT; i++) {
      log("opening client " + (i + 1) + "/" + PLAYER_COUNT + " ...");
      clients.push(await openClient(sharedBrowser, i, errors));
    }
    log(PLAYER_COUNT + " clients opened");

    for (const c of clients) {
      log(c.tag + " signing in as guest ...");
      const info = await signInAndPrepare(c.page, PSEUDO_CPU_DEADLINE_MS);
      log(c.tag + " signed in as guest (" + (info.userId || "?").slice(0, 8) + ")");
    }

    // 部屋を作る（通常部屋。ランク戦ではないので誰のレートにも影響しない）。
    gameId = await clients[0].page.evaluate(async () => {
      const online = await import("/src/online.js");
      return online.createRoom("smoke " + new Date().toISOString().slice(11, 19), null, false);
    });
    log("room created:", gameId);

    for (const c of clients.slice(1)) {
      await c.page.evaluate(async (id) => {
        const online = await import("/src/online.js");
        await online.joinRoom(id, null);
      }, gameId);
      log(c.tag + " joined");
    }

    // 全員が入ったことをホスト側から確認してから開始する。
    for (let i = 0; i < 20; i++) {
      const n = await clients[0].page.evaluate(async (id) => {
        const online = await import("/src/online.js");
        return online.getMemberCount(id);
      }, gameId);
      if (n >= PLAYER_COUNT) break;
      await clients[0].page.waitForTimeout(500);
    }

    await clients[0].page.evaluate(async (id) => {
      const online = await import("/src/online.js");
      await online.startGame(id, { includeBlackWhite: false, timerEnabled: true, pseudoCpuModeEnabled: true });
    }, gameId);
    log("game started — watching");

    const started = Date.now();
    let lastTurn = 0;
    let lastProgressAt = Date.now();
    let lastAgreeAt = Date.now();
    let lastSig = "";
    const seenViolations = new Set();
    let prevPollSigs = [];
    let seatsLogged = false;

    while (true) {
      await clients[0].page.waitForTimeout(2000);
      if (errors.length) { fail("client error: " + errors[0]); break; }

      const snaps = [];
      for (const c of clients) snaps.push(Object.assign({ tag: c.tag }, await snapshot(c)));

      if (!seatsLogged && snaps.every((s) => s.seat)) {
        seatsLogged = true;
        log("seats:", snaps.map((s) => s.tag + "=" + s.seat).join(" "));
        if (new Set(snaps.map((s) => s.seat)).size !== snaps.length) {
          fail("seat collision: " + snaps.map((s) => s.seat).join(","));
          break;
        }
      }

      // 不変条件（2回連続で出たものだけ本物とみなす＝入れ替え途中の一過性を除く）。
      const nowSigs = [];
      for (const s of snaps) {
        for (const vio of s.viols || []) {
          const sig = [s.tag, vio.code, vio.detail ? JSON.stringify(vio.detail) : vio.msg].join("|");
          nowSigs.push(sig);
          if (seenViolations.has(sig) || !prevPollSigs.includes(sig)) continue;
          seenViolations.add(sig);
          fail("INVARIANT[" + vio.code + "] " + s.tag + " T" + s.turnNumber + ": " + vio.msg);
        }
      }
      prevPollSigs = nowSigs;
      if (failed) break;

      const leader = snaps.reduce((a, b) => (b.turnNumber > a.turnNumber ? b : a), snaps[0]);
      if (leader.turnNumber > lastTurn) {
        lastTurn = leader.turnNumber;
        lastProgressAt = Date.now();
        log("turn " + leader.turnNumber + " (player " + leader.turnPlayer + ", tokens " + leader.tokens + ")");
      }
      if (leader.sig !== lastSig) { lastSig = leader.sig; lastProgressAt = Date.now(); }

      // オンライン特有の本命チェック: 全員の盤面が一致しているか。
      const allAgree = snaps.every((s) => s.sig === snaps[0].sig);
      if (allAgree) lastAgreeAt = Date.now();
      else if (Date.now() - lastAgreeAt > DESYNC_TOLERANCE_MS) {
        const disagreedMs = Date.now() - lastAgreeAt;
        // 本当に状態がズレているのか、単に更新が届いていないだけなのかを切り分ける:
        // 全員に「今の正解」をサーバーから取り直させて、それでも揃わなければ本物の食い違い。
        log("clients disagreed for " + Math.round(disagreedMs / 1000) + "s — forcing a resync to check");
        for (const c of clients) {
          try {
            await evalSafe(c.page, async () => {
              const online = await import("/src/online.js");
              const id = online.getCurrentGameId?.();
              if (id) await online.fetchAndHydrate(id);
              return true;
            });
          } catch (e) { /* 取り直しに失敗したクライアントは下の再判定で分かる */ }
        }
        await clients[0].page.waitForTimeout(3000);
        const after = [];
        for (const c of clients) after.push(Object.assign({ tag: c.tag }, await snapshot(c)));
        if (after.every((s2) => s2.sig === after[0].sig)) {
          // 取り直したら揃った＝状態は壊れていない。届くのが遅れていただけなので続行する
          // （※実機で本当に「更新が来ない」なら、それはそれで体験上の問題なので記録は残す）。
          log("resync fixed it — updates were just late, continuing");
          lastAgreeAt = Date.now();
          continue;
        }
        const diff = after.map((s2) => s2.tag + ":T" + s2.turnNumber + "/" + s2.tokens).join(" vs ");
        fail("DESYNC: clients still disagree after a forced resync (" + Math.round(disagreedMs / 1000) + "s) (" + diff + ")");
        // どこが食い違ったのかを具体的に出す（先頭数件）。
        const base = new Set(after[0].sig.split("|")[3].split(","));
        for (const s2 of after.slice(1)) {
          const mine = new Set(s2.sig.split("|")[3].split(","));
          const onlyBase = [...base].filter((x) => !mine.has(x)).slice(0, 4);
          const onlyMine = [...mine].filter((x) => !base.has(x)).slice(0, 4);
          log("  diff " + after[0].tag + " only:", onlyBase.join(" / ") || "(none)");
          log("  diff " + s2.tag + " only:", onlyMine.join(" / ") || "(none)");
          const p0 = after[0].sig.split("|")[2], p1 = s2.sig.split("|")[2];
          if (p0 !== p1) log("  piles " + after[0].tag + ":", p0, " / " + s2.tag + ":", p1);
        }
        break;
      }

      if (snaps.some((s) => s.won)) { log("someone won at turn", leader.turnNumber, "— healthy finish"); break; }
      if (snaps.some((s) => s.tokens > 0 && s.tokens < 40)) { fail("board looks corrupted (tokens: " + snaps.map((s) => s.tokens).join(",") + ")"); break; }
      if (!RUN_TO_COMPLETION && lastTurn >= TARGET_TURN) { log("reached target turn", TARGET_TURN, "— PASS"); break; }
      if (Date.now() - lastProgressAt > STALL_MS) {
        fail("STALLED: no progress for " + STALL_MS / 1000 + "s (turn " + lastTurn + ")");
        await dumpDiagnostics(clients);
        break;
      }
      if (Date.now() - started > HARD_TIMEOUT_MS) {
        fail("hard timeout after " + HARD_TIMEOUT_MS / 1000 + "s (turn " + lastTurn + ")");
        await dumpDiagnostics(clients);
        break;
      }
    }
  } catch (e) {
    fail("exception: " + e.message);
  } finally {
    // 後片付け: 全員退室してログアウトする（本番DBにテストの部屋を残さない）。
    for (const c of clients) {
      try {
        await c.page.evaluate(async () => {
          const online = await import("/src/online.js");
          try { await online.leaveGame(); } catch (e) {}
          try { await online.signOut(); } catch (e) {}
        });
      } catch (e) { /* ページが既に閉じている等は無視 */ }
    }
    if (!KEEP_OPEN || !failed) {
      for (const c of clients) {
        try { await c.context.close(); } catch (e) {}
        if (c.browser) { try { await c.browser.close(); } catch (e) {} }
      }
      if (sharedBrowser) { try { await sharedBrowser.close(); } catch (e) {} }
    }
    server.close();
  }

  if (errors.length && !failed) failed = "client error: " + errors[0];
  if (failed) {
    log("FAIL");
    for (const e of errors.slice(0, 5)) log("  -", e);
    // process.exit() は Windows のパイプ出力を切り捨てることがあるので使わない
    // （終了コードだけ立てて自然に終わらせる）。
    process.exitCode = 1;
    return;
  }
  log("PASS");
  process.exitCode = 0;
}

run();
