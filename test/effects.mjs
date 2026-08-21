// カード効果の決定的ユニットテスト（続き236、ユーザー要望2026-08-20「テスト関係を強化」）。
//
//   node test/effects.mjs
//
// 目的: 一番バグが多い「カード効果」そのものの“正しい結果”を、状態を作って効果を1回走らせて
// アサートする。自己対戦スモーク（クラッシュ/不変条件/詰みを広く見る）が届かない「この効果は
// この状況で正確にこう動くべき」をピンポイントで固定する回帰ネット。#147/#152/パーティー/
// 試練の儀式など、これまで実機でしか確認できなかった検証を恒久化する。
//
// しくみ: card-effect-engine.js の runArrivalEffect/runHandEffect は、状態を getState()（本物の
// state.js）から読み、状態変更・選択は helpers.* に委譲する。ここでは helpers を差し替え、
//   ・状態変更（moveAndSync/discardAndSync/drawCards/flipCard/placeFromDeck/swapPieces 等）→ 本物の
//     state.js のアクション（moveToken/sendTokenToPile/drawFromPile/flipToken/swapPieceLocations）を dispatch
//   ・選択（pickLocation/pickHandCard/pickPlayer/pickDiscardCost/pickArrivalOption/pickHandEffectOption/
//     declareColors 等）→ ケースに書いた台本(picks)を順に返す
//   ・演出/音/通知（announce*/celebrate/delay/…）→ no-op
// にする。つまり「本物の効果ロジック＋本物の state 遷移」を、DOM/演出/選択の層だけ差し替えて検証する。
// エンジンの動詞実装・選択肢の使用可否・コスト・色一致ルール等（＝エンジン層のバグ）を捕まえる
// （main.jsのDOM層＝露出到達コンボの発火/飛翔演出などは対象外。あちらは自己対戦スモーク＋実機で）。
//
// 前提: `npm install`（playwright）＋ `npx playwright install chromium` 済み。デプロイには含まれない。

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8797;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff",
};

// ケース定義＋アサーションは effect-cases.mjs（Node/ブラウザ共通）、1ケースの実行は
// ブラウザ内の effect-runner.mjs（page.evaluate で動的import）に分離した（続き240）。
// これによりアプリ内「オールテスト」ボタンからも同じ 53 ケースを走らせられる。
import { CASES, checkExpect } from "./effect-cases.mjs";

// -------------------- 実行 --------------------
async function main() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const fp = path.join(ROOT, p);
    fs.readFile(fp, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      res.end(d);
    });
  });
  await new Promise((r) => srv.listen(PORT, r));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("so7-disable-update-checker", "1");
      localStorage.setItem("so7-bgm-intro-shown-v1", "1");
      localStorage.setItem("so7-intros-all-off", "1");
    } catch (e) {}
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  for (const c of CASES) {
    const res = await page.evaluate(async (spec) => {
      const r = await import("/test/effect-runner.mjs");
      return await r.runOneCase(spec);
    }, c);

    if (res && res.error) {
      fail++;
      console.log(`❌ ${c.name}\n   例外: ${res.error.split("\n")[0]}`);
      continue;
    }
    const fails = [];
    for (const exp of c.expect) {
      const msg = checkExpect(res, exp);
      if (msg) fails.push(msg);
    }
    if (fails.length === 0) {
      pass++;
      console.log(`✅ ${c.name}`);
    } else {
      fail++;
      console.log(`❌ ${c.name}`);
      for (const m of fails) console.log(`   - ${m}`);
      if (process.env.DEBUG_CALLS) {
        console.log(`   calls: ${JSON.stringify(res.calls)}`);
        if (res.diag) console.log(`   diag: ${JSON.stringify(res.diag)}`);
      }
    }
  }

  console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` ❌ (${fail} FAIL)` : " ✅"));
  await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });

