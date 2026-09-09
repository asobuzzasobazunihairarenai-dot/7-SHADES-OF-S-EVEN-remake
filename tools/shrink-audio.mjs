// BGMを配信用に軽量化するツール（tools/shrink-assets.mjs の音声版）。
//
// 【なぜ必要か】2026-09-09に実測したところ、assets/sounds は 14MB あり、その96%がBGM4曲だった。
// ビットレートが188〜256kbpsと過剰（victory-bgm は47秒で256kbps）で、ゲームのBGMには要らない品質。
// 効果音が上に重なる用途なら 96kbps AAC で違いは分からない。
//
// 【なぜ AAC (.m4a) か】mp3 の同じ音質を半分の容量で出せて、iPhone を含む全ブラウザで確実に再生
// できる。Opus はさらに小さいが、古い iOS で再生できない端末が残るのでこのアプリでは採らない
// （このプロジェクトは iOS の不具合を何度も踏んでいる＝#223 ほか）。
//
// 【ループの作り方】Suno等が出すのは「イントロ→展開→アウトロ」の“曲”で、ゲームに必要な
// 「繋ぎ目のないループ素材」ではない。そのまま loop=true で鳴らすと2周目の頭で必ず途切れる。
// そこで loop 指定があれば、末尾 crossfade 秒を先頭へ重ねて繋ぎ目を消す:
//     head = [start, start+X] / body = [start+X, start+L] / tail = [start+L, start+L+X]
//     出力 = crossfade(tail→head) + body   （長さはちょうど L 秒）
// こうすると body の終わりが tail に自然につながり、その tail が head へ溶ける＝繋ぎ目が消える。
//
// 【ループ点の決め方（重要・推測でやらないこと）】開始位置と長さは耳ではなく測って決めた。
// 1kHz に落とした波形の RMS で曲の構造（イントロ/本編/アウトロ）を出し、8kHz・24バンドの
// 周波数指紋の余弦類似度で「開始位置とその L 秒後がどれだけ似ているか」を採点する。
// 待機BGMは開始位置を変えても 113秒 が繰り返し最良に出た＝曲自体が約113秒周期。
// 青の国ドゥエンは同じく約75秒周期（90秒も0.99超なので、繰り返しが目立たない90秒を採用）。
// 採点スクリプトは使い捨てにしたので、次に曲を足す時は同じ手順をここに書き足すこと。
//
// 【フェードインはここでやらない】ファイルに焼き込むとループのたびにフェードインして、
// せっかく消した繋ぎ目が復活する。再生開始時にアプリ側（src/sound.js）でかけること。
//
// 使い方: node tools/shrink-audio.mjs [--dry]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC_DIR = path.join(ROOT, "音声", "BGM");   // gitignore対象（原盤はローカルのみ）
const OUT_DIR = path.join(ROOT, "assets", "sounds");
const BITRATE = "96k";

// loop を指定すると繋ぎ目の無いループ素材にする（start/length/crossfade は秒）。
const JOBS = [
  { src: "プレイヤー待機中_待機の水鏡.mp3", out: "waiting-bgm.m4a",
    loop: { start: 68, length: 113, crossfade: 3 },
    note: "ホーム画面とマッチング待ち。5:23の原曲は本編が0:20〜4:40で、その中の1:08から113秒" },
  { src: "青の国　ドゥエン.mp3", out: "blue-bgm.m4a",
    loop: { start: 3, length: 90, crossfade: 3 },
    note: "青の国の対戦BGM。原曲2:34は2:30から終わりに入るので、その手前で90秒を取る" },
  { src: "ゲーム時_七色の戦場.mp3", out: "game-bgm.m4a", note: "対戦中。原曲がほぼ一定なのでそのまま" },
  { src: "オープニング.mp3",       out: "opening-bgm.m4a", note: "タイトル画面" },
  { src: "勝利時.mp3",             out: "victory-bgm.m4a", note: "勝利演出。ループしないので短いまま" },
];

function findFfmpeg() {
  const candidates = [
    "ffmpeg",
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Links", "ffmpeg.exe"),
  ];
  for (const c of candidates) {
    try { execFileSync(c, ["-version"], { stdio: "ignore" }); return c; } catch { /* 次を試す */ }
  }
  throw new Error("ffmpeg が見つかりません。`winget install --id Gyan.FFmpeg -e` で入ります。");
}

const dry = process.argv.includes("--dry");
const ffmpeg = findFfmpeg();
const mb = (n) => (n / 1048576).toFixed(2);
let before = 0, after = 0;

for (const job of JOBS) {
  const src = path.join(SRC_DIR, job.src);
  const out = path.join(OUT_DIR, job.out);
  if (!fs.existsSync(src)) { console.log(`⚠ 原盤が無い: ${job.src}（飛ばします）`); continue; }

  const args = ["-v", "error", "-y", "-i", src];
  if (job.loop) {
    const { start: s, length: L, crossfade: X } = job.loop;
    // -vn 相当: カバー画像が埋め込まれた mp3 があるので、filter_complex では音声だけを扱う
    args.push("-filter_complex",
      `[0:a]atrim=${s}:${s + X},asetpts=PTS-STARTPTS[head];` +
      `[0:a]atrim=${s + X}:${s + L},asetpts=PTS-STARTPTS[body];` +
      `[0:a]atrim=${s + L}:${s + L + X},asetpts=PTS-STARTPTS[tail];` +
      `[tail][head]acrossfade=d=${X}:c1=tri:c2=tri[blend];` +
      `[blend][body]concat=n=2:v=0:a=1[out]`,
      "-map", "[out]");
  } else {
    // カバー画像を落とす（付いている mp3 があり、付けたままだと m4a に書き出せない）
    args.push("-vn", "-map_metadata", "-1");
  }
  args.push("-c:a", "aac", "-b:a", BITRATE, "-ar", "44100", out);

  const srcSize = fs.statSync(src).size;
  before += srcSize;
  if (dry) { console.log(`(dry) ${job.src} -> ${job.out}`); continue; }
  execFileSync(ffmpeg, args);
  const outSize = fs.statSync(out).size;
  after += outSize;
  console.log(`${job.out.padEnd(16)} ${mb(srcSize).padStart(6)}MB -> ${mb(outSize).padStart(6)}MB` +
              (job.loop ? `  [${job.loop.length}秒ループ]` : ""));
}
if (!dry) console.log(`\n合計 ${mb(before)}MB -> ${mb(after)}MB`);
