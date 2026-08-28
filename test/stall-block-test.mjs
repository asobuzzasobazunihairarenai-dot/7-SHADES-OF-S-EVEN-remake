// 停止バグ（続き321）の回帰テスト。「メインスレッドが1〜2秒詰まると、疑似CPUの短い持ち時間の
// 窓を tick が観測できず、タイムアウト自動処理のラッチが下りないまま盤面が永久停止する」ことの
// 決定的な再現。CPU自己対戦中、「デッドラインが更新された瞬間」をページ内で捕まえて、その窓を
// まるごと覆うように同期ブロックし、その後ゲームが進むかを見る。
//
//   node test/stall-block-test.mjs     … 6回試して「停止 0回」ならPASS
//
// 修正前のコードでは1回目で必ず停止する（実測）。修正後は12/12で復帰することを確認済み。
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const ROOT = "D:/7 SHADES OF SEVEN remake デジタル版";
const PORT = 8802;
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".woff2": "font/woff2", ".ico": "image/x-icon" };
const server = await new Promise((r) => { const s = http.createServer((req, res) => { let p = decodeURIComponent((req.url || "/").split("?")[0]); if (p === "/") p = "/index.html"; const fp = path.join(ROOT, p); if (!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); res.end("404"); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" }); fs.createReadStream(fp).pipe(res); }); s.listen(PORT, () => r(s)); });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await page.addInitScript(() => { try { localStorage.setItem("so7-intros-all-off","1"); localStorage.setItem("so7-bugreport-intro-hidden","1"); localStorage.setItem("so7-action-confirm-enabled","0"); localStorage.setItem("so7-bgm-intro-shown-v1","1"); localStorage.setItem("so7-disable-update-checker","1"); localStorage.setItem("so7-tutorial-completed","1"); } catch(e){} });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.evaluate(async () => {
  const online = await import("/src/online.js"); try { await online.signOut?.(); } catch(e){}
  const cpu = await import("/src/cpu-battle.js"); const admin = await import("/src/admin.js");
  admin.setPseudoCpuModeEnabled?.(true);
  await cpu.startCpuBattle(2);
  admin.setPseudoCpuIncludeSelf?.(true);
  await cpu.runCpuBattleSetup({ count: 2 });
  admin.setPseudoCpuIncludeSelf?.(true);
  try { const os = await import("/src/opening-screen.js"); os.forceCloseOpeningScreen?.(); } catch(e){}
});
const sig = () => page.evaluate(async () => {
  const s = (await import("/src/state.js")).getState();
  const toks = (s.tokens||[]).map((t)=>{const l=t.location||{};return `${t.id}:${l.zone}:${l.row??""}:${l.col??""}:${l.index??""}:${l.player??""}:${t.faceUp?1:0}`;}).sort().join(",");
  return `${s.turnNumber}|${s.priorityPlayer}|${s.priorityDeadline}|${toks}`;
});
// ページ内で「デッドラインが更新された瞬間」を20ms間隔で捕まえ、その場で同期ブロックに入る
// （＝新しい持ち時間の窓を tick が1回も観測できない状況を確実に作る）。
const blockRightAfterNewDeadline = () => page.evaluate(async () => {
  const st = await import("/src/state.js");
  let prev = st.getState().priorityDeadline;
  return await new Promise((resolve) => {
    const id = setInterval(() => {
      const d = st.getState().priorityDeadline;
      if (d !== prev && d) {
        clearInterval(id);
        const until = d + 700;
        const started = Date.now();
        while (Date.now() < until) {}
        resolve(Date.now() - started);
      }
      prev = d;
    }, 20);
  });
});
let frozen = 0, trials = 0;
for (let i = 0; i < 6; i++) {
  const blocked = await blockRightAfterNewDeadline();
  trials++;
  const before = await sig();
  let recovered = false;
  for (let j = 0; j < 10; j++) { await page.waitForTimeout(1000); if ((await sig()) !== before) { recovered = true; break; } }
  if (!recovered) { frozen++; console.log(`試行${trials}(block ${blocked}ms): ❌ 10秒間まったく進展なし（停止）`); break; }
  console.log(`試行${trials}(block ${blocked}ms): ✅ 復帰`);
  const won = await page.evaluate(async () => (await import("/src/victory.js")).hasAnyoneWon?.());
  if (won) { console.log("（決着したので終了）"); break; }
}
console.log(`結果: ${trials}回中 ${frozen}回 停止`);
await browser.close(); server.close();
