// 画像アセットを「実際に表示される大きさ」に見合う解像度へ縮める道具（#223 対策）。
//
// なぜ必要か（続き389の調査）: iPhone でCPU戦中にアプリが落ちてタイトルへ戻る不具合(#223)の
// 実測調査で、4人CPU戦の最中に **展開後 290MB** ぶんの画像がブラウザに載っていることが分かった。
// 画像は「ファイルサイズ」ではなく「幅×高さ×4バイト」でメモリを食う——例えば 1254x1254 の
// アバターは、ファイルが 100KB でも展開すると **6.0MB**。iOS Safari は端末のメモリが厳しくなると
// ページのプロセスごと落とす（＝報告にあった「タイトル画面に戻る」）ので、ここを減らすのが
// もっとも効く。実測の内訳: ペット77MB / アイコン63MB / アバター60MB / 駒20MB。
//   極端な例: assets/playmats/black.webp は 5000x5000 ＝ **展開すると1枚で95MB**。
//
// 方針: 元絵（gitignore下の「画像素材/」に原本がある）はそのままに、配信用の assets/ だけを
// 「表示される最大の大きさ × 高DPIぶんの余裕」まで落とす。下の TARGETS がその対応表。
//
//   node tools/shrink-assets.mjs --dry   … 何がどれだけ縮むか一覧するだけ（書き換えない）
//   node tools/shrink-assets.mjs         … 実行（assets/ を上書き。git管理下なので戻せる）
//
// 実装メモ: 追加のライブラリを入れずに済ませるため、リサイズと再エンコードは
// Playwright の Chromium（テストで既に使っている）の canvas でやる。webp は品質0.92の非可逆、
// png は png のまま（拡張子は変えない＝コード側の参照を一切触らずに済む）。
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

// フォルダごとの上限（長辺px）。「そこに表示される最大サイズ × 2〜3倍（高DPI）」で決めている。
const TARGETS = [
  // 盤面のマット: 画面上でおよそ1000px。拡大表示もあるので余裕を持って2048。
  { dir: "assets/playmats", max: 2048 },
  // 立ち絵（物語）で最大およそ500px表示。盤面・左下では数十px。
  { dir: "assets/avatars", max: 768 },
  // 拡大プレビュー（20rem=320px）が最大。
  { dir: "assets/cards", max: 768 },
  // 駒は盤面で約45px、ショップでも約80px。
  { dir: "assets/pieces", max: 384 },
  // ペットは追従スプライトで数十px（既に512の絵柄が5体あり、それが基準）。
  { dir: "assets/pets", max: 512 },
  // UIアイコンはどれも100px以下。
  { dir: "assets/icons", max: 256 },
  { dir: "assets/rank-badges", max: 256 },
  { dir: "assets/rank-gauge", max: 1024 },
  { dir: "assets/home-icons", max: 512 },
  // 直下の大物（オープニングのロゴ等）。背景は全画面なので触らない。
  { file: "assets/opening.webp", max: 1600 },
  { file: "assets/opening-start-btn.png", max: 1024 },
  { file: "assets/lock-icon.webp", max: 512 },
  { file: "assets/lock-area-bar.webp", max: 1024 },
];

const EXTS = new Set([".png", ".webp", ".jpg", ".jpeg"]);
const SEP = String.fromCharCode(92);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXTS.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

const jobs = [];
for (const t of TARGETS) {
  const files = t.file ? [path.join(ROOT, t.file)] : walk(path.join(ROOT, t.dir));
  for (const f of files) if (fs.existsSync(f)) jobs.push({ file: f, max: t.max });
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto("about:blank");

let done = 0, skipped = 0, beforeDec = 0, afterDec = 0, beforeBytes = 0, afterBytes = 0;
for (const job of jobs) {
  const rel = job.file.slice(ROOT.length + 1).split(SEP).join("/");
  const buf = fs.readFileSync(job.file);
  const ext = path.extname(job.file).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const result = await page.evaluate(
    async ({ dataUrl, max, mime }) => {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error("decode failed"));
        i.src = dataUrl;
      });
      const long = Math.max(img.naturalWidth, img.naturalHeight);
      if (long <= max) return { skip: true, w: img.naturalWidth, h: img.naturalHeight };
      const k = max / long;
      const w = Math.max(1, Math.round(img.naturalWidth * k));
      const h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const ctx = c.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, w, h);
      const out = c.toDataURL(mime, 0.92);
      return { skip: false, w, h, ow: img.naturalWidth, oh: img.naturalHeight, out };
    },
    { dataUrl: `data:${mime};base64,${buf.toString("base64")}`, max: job.max, mime },
  );
  if (result.skip) { skipped++; continue; }
  const outBuf = Buffer.from(result.out.split(",")[1], "base64");
  beforeDec += result.ow * result.oh * 4;
  afterDec += result.w * result.h * 4;
  beforeBytes += buf.length;
  afterBytes += outBuf.length;
  if (!DRY) fs.writeFileSync(job.file, outBuf);
  done++;
  if (DRY && done <= 12) {
    console.log(`  ${rel}  ${result.ow}x${result.oh} → ${result.w}x${result.h}  (${(buf.length / 1024).toFixed(0)}KB → ${(outBuf.length / 1024).toFixed(0)}KB)`);
  }
}
await browser.close();

const mb = (n) => (n / 1048576).toFixed(0) + "MB";
console.log(`\n${DRY ? "[下見]" : "[実行]"} 縮小 ${done}枚 / そのまま ${skipped}枚`);
console.log(`展開後メモリ: ${mb(beforeDec)} → ${mb(afterDec)}（${(beforeDec / Math.max(1, afterDec)).toFixed(1)}分の1）`);
console.log(`ファイル容量: ${mb(beforeBytes)} → ${mb(afterBytes)}`);
if (DRY) console.log("※ --dry なので1枚も書き換えていません。");
