// 「宣言されていない変数への代入」を全 src から探す常設の検査。
//
// 【なぜ必要か】UI英語化の一括置換（続き323〜329）が、行ごと差し替える際に**周りのコードを
// 巻き込んで壊す**事故を何度も起こしている:
//   ・続き325 … t() の import 漏れ（"t is not defined"）
//   ・続き342 … ローカル変数 t が翻訳関数を隠す（"t is not a function"）
//   ・続き347 … 存在しない addRow() の呼び出し／アロー関数の殻が消える
//   ・続き411 … metaEl / codeEl / btn / status など**別の関数の変数名**へ代入していた
//               （オンラインの部屋一覧とロビーが約1週間まるごと壊れていた）
// この壊れ方は `node --input-type=module --check` も `npm test` もスモークも素通りする
// （実行されない分岐なので）。実際に画面を開くまで気づけないため、静的に見つける必要がある。
//
// 使い方: node tools/check-undeclared.mjs   （問題があれば終了コード1）
import fs from "node:fs";
import path from "node:path";

const SRC = "src";
// ブラウザ/JSの組み込み。ここに無い名前が「宣言されていない」と出たら、まず本物の壊れを疑う。
const GLOBALS = new Set([
  "window","document","navigator","location","history","localStorage","sessionStorage","console",
  "Math","JSON","Date","Object","Array","String","Number","Boolean","Promise","Map","Set","Error",
  "RegExp","Symbol","Intl","URL","Blob","File","FormData","Image","Audio","Event","performance",
  "crypto","fetch","alert","confirm","prompt","setTimeout","setInterval","clearTimeout","clearInterval",
  "requestAnimationFrame","cancelAnimationFrame","getComputedStyle","matchMedia","structuredClone",
  "globalThis","self","process","module","exports","screen","Notification","THREE","undefined","NaN","Infinity",
]);

function collectDecls(lines) {
  const s = new Set();
  const add = (n) => n && s.add(n);
  for (const l of lines) {
    let m;
    if ((m = l.match(/^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/))) add(m[1]);
    if ((m = l.match(/^\s*(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/))) add(m[1]);
    if ((m = l.match(/^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/))) add(m[1]);
    if ((m = l.match(/^\s*(?:const|let|var)\s*[{[]([^}\]]*)[}\]]/))) {
      for (const part of m[1].split(",")) {
        const n = part.split(":").pop().split("=")[0].trim().replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(n)) add(n);
      }
    }
    if ((m = l.match(/^\s*import\s+([^;]*?)\s+from/))) {
      for (const part of m[1].replace(/[{}]/g, " ").split(",")) {
        const n = part.includes(" as ") ? part.split(" as ").pop().trim() : part.trim();
        if (/^[A-Za-z_$][\w$]*$/.test(n)) add(n);
      }
    }
    for (const fa of l.match(/\(([^()]*)\)\s*(?:=>|\{)/g) || []) {
      const inner = fa.slice(fa.indexOf("(") + 1, fa.lastIndexOf(")"));
      for (const part of inner.replace(/[{}[\]]/g, " ").split(",")) {
        const n = part.split(":").pop().split("=")[0].trim().replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(n)) add(n);
      }
    }
    if ((m = l.match(/(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/))) add(m[1]);
    if ((m = l.match(/catch\s*\(\s*([A-Za-z_$][\w$]*)/))) add(m[1]);
    for (const mm of l.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) add(mm[1]);
    for (const mm of l.matchAll(/\.(?:forEach|map|filter|find|some|every|reduce|sort|flatMap)\s*\(\s*\(?\s*([A-Za-z_$][\w$]*)/g)) add(mm[1]);
  }
  return s;
}

const files = fs.readdirSync(SRC).filter((f) => f.endsWith(".js")).map((f) => path.join(SRC, f));
const problems = [];
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  // モジュール直下（列0の宣言）
  const moduleDecls = collectDecls(
    lines.filter((l) => /^(?:export\s+)?(?:const|let|var|async\s+function|function|class|import)\b/.test(l)),
  );
  // トップレベル関数のブロックを切り出し、その中の宣言だけを「見える名前」とする
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^(?:export\s+)?(?:async\s+)?(?:function\b|const\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?[({])/.test(lines[i])) continue;
    let depth = 0, started = false, j = i;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) { if (ch === "{") { depth++; started = true; } else if (ch === "}") depth--; }
      if (started && depth <= 0) break;
    }
    blocks.push({ start: i, end: Math.min(j, lines.length - 1) });
    i = j;
  }
  const check = (lineNo, line, visible) => {
    const m = line.match(/^\s*([A-Za-z_$][\w$]*)\s*\.\s*[\w$]+\s*(?:\.\s*[\w$]+\s*)*=[^=]/);
    if (!m) return;
    const name = m[1];
    if (visible.has(name) || moduleDecls.has(name) || GLOBALS.has(name)) return;
    problems.push(`${file}:${lineNo}  ${name} は見えない変数  | ${line.trim().slice(0, 100)}`);
  };
  for (const b of blocks) {
    const body = lines.slice(b.start, b.end + 1);
    const local = collectDecls(body);
    body.forEach((l, k) => check(b.start + k + 1, l, local));
  }
}

if (problems.length) {
  console.log(problems.join("\n"));
  console.log(`\n❌ ${problems.length} 件（宣言されていない／別の関数の変数へ代入している）`);
  process.exitCode = 1;
} else {
  console.log(`✅ 問題なし（${files.length} ファイル）`);
}
