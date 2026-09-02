import { chromium } from "playwright";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const ROOT = process.cwd();
const MIME = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".png":"image/png",".webp":"image/webp",".mp3":"audio/mpeg",".svg":"image/svg+xml" };
const server = http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split("?")[0]); if(p==="/")p="/index.html"; const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end("nf");return;} res.writeHead(200,{"content-type":MIME[path.extname(f)]||"application/octet-stream","cache-control":"no-store"}); res.end(d);});});
await new Promise(r=>server.listen(8797,r));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport:{width:1280,height:800} });
await ctx.addInitScript(() => { try { localStorage.setItem("so7-disable-update-checker","1"); } catch(e){} });
const page = await ctx.newPage();
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log("NAV ->", f.url()); });
page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
await page.goto("http://localhost:8797/index.html");
console.log("goto done");
await page.waitForTimeout(3000);
try {
  const r = await page.evaluate(async () => {
    try { const os = await import("/src/opening-screen.js"); os.forceCloseOpeningScreen?.(); } catch (e) { return "import fail: " + e.message; }
    return "ok";
  });
  console.log("evaluate1:", r);
} catch (e) { console.log("evaluate1 threw:", e.message); }
await page.waitForTimeout(1500);
try {
  const r2 = await page.evaluate(async () => {
    const online = await import("/src/online.js");
    try { await online.signOut?.(); } catch (e) {}
    await online.signInAnonymously();
    const u = await online.getCurrentUser();
    return { userId: u?.id ?? null };
  });
  console.log("signin:", JSON.stringify(r2));
} catch (e) { console.log("signin threw:", e.message); }
await page.waitForTimeout(2000);
console.log("url now:", page.url());
await browser.close(); server.close();
