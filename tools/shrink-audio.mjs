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
// 【原盤フォルダは名前で決め打ちしない】2026-09-09にユーザーが「音声/BGM」を
// 「音声/BGM（オリジナル）」へリネームし、決め打ちしていたパスが壊れた。以後は
// 「音声/ の中で BGM で始まり、原盤ファイルが実在するフォルダ」を探す方式にしてある。
//
// 使い方: node tools/shrink-audio.mjs [--dry]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const AUDIO_DIR = path.join(ROOT, "音声");          // gitignore対象（原盤はローカルのみ）
const OUT_DIR = path.join(ROOT, "assets", "sounds"); // 配信用（ここがゲームから読まれる）
const BITRATE = "96k";

// loop を指定すると繋ぎ目の無いループ素材にする（start/length/crossfade は秒）。
// archive は「音声/BGM（ループ編集、サイズ縮小等）」へ残す控えの名前（ユーザー依頼2026-09-09）。
// mp3 を true にすると、その控えに mp3 版も作る（ユドンリウムコネクト等、m4a を受け付けない
// 場所で使うため。m4a からの変換ではなく原盤から作り直すので二重圧縮にならない）。
const JOBS = [
  { src: "プレイヤー待機中_待機の水鏡.mp3", out: "waiting-bgm.m4a",
    archive: "プレイヤー待機中_待機の水鏡_113秒ループ",
    loop: { start: 68, length: 113, crossfade: 3 },
    note: "ホーム画面とマッチング待ち。5:23の原曲は本編が0:20〜4:40で、その中の1:08から113秒" },
  { src: "青の国　ドゥエン.mp3", out: "blue-bgm.m4a",
    archive: "青の国　ドゥエン_90秒ループ", mp3: true,
    loop: { start: 3, length: 90, crossfade: 3 },
    note: "青の国の対戦BGM。原曲2:34は2:30から終わりに入るので、その手前で90秒を取る。" +
          "2026-09-09時点でゲームからは未接続（いつ流すかが未決定）。ユドコネ版で使う予定。" },
  { src: "ゲーム時_七色の戦場.mp3", out: "game-bgm.m4a",
    archive: "ゲーム時_七色の戦場_縮小のみ", note: "対戦中。原曲がほぼ一定なのでそのまま" },
  { src: "オープニング.mp3", out: "opening-bgm.m4a",
    archive: "オープニング_縮小のみ", note: "タイトル画面" },
  { src: "勝利時.mp3", out: "victory-bgm.m4a",
    archive: "勝利時_縮小のみ", note: "勝利演出。ループしないので短いまま" },
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

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// 「BGM」で始まるフォルダのうち、原盤が実在する方を原盤フォルダ、もう一方を控えフォルダとする。
function findDirs() {
  const subs = fs.readdirSync(AUDIO_DIR).filter((s) => s.startsWith("BGM") && isDir(path.join(AUDIO_DIR, s)));
  const srcDir = subs.map((s) => path.join(AUDIO_DIR, s))
    .find((p) => JOBS.some((j) => fs.existsSync(path.join(p, j.src))));
  if (!srcDir) throw new Error(`原盤フォルダが見つかりません（${AUDIO_DIR} の中を確認してください）`);
  const archiveName = subs.find((s) => path.join(AUDIO_DIR, s) !== srcDir) || "BGM（ループ編集、サイズ縮小等）";
  const archiveDir = path.join(AUDIO_DIR, archiveName);
  fs.mkdirSync(archiveDir, { recursive: true });
  return { srcDir, archiveDir };
}

function loopArgs(loop) {
  const { start: s, length: L, crossfade: X } = loop;
  return ["-filter_complex",
    `[0:a]atrim=${s}:${s + X},asetpts=PTS-STARTPTS[head];` +
    `[0:a]atrim=${s + X}:${s + L},asetpts=PTS-STARTPTS[body];` +
    `[0:a]atrim=${s + L}:${s + L + X},asetpts=PTS-STARTPTS[tail];` +
    `[tail][head]acrossfade=d=${X}:c1=tri:c2=tri[blend];` +
    `[blend][body]concat=n=2:v=0:a=1[out]`,
    "-map", "[out]"];
}

const dry = process.argv.includes("--dry");
const ffmpeg = findFfmpeg();
const { srcDir, archiveDir } = findDirs();
const mb = (n) => (n / 1048576).toFixed(2);
console.log(`原盤: ${path.basename(srcDir)}  控え: ${path.basename(archiveDir)}\n`);
let before = 0, after = 0;

for (const job of JOBS) {
  const src = path.join(srcDir, job.src);
  const out = path.join(OUT_DIR, job.out);
  if (!fs.existsSync(src)) { console.log(`⚠ 原盤が無い: ${job.src}（飛ばします）`); continue; }
  if (dry) { console.log(`(dry) ${job.src} -> ${job.out}`); continue; }

  // カバー画像が埋め込まれた mp3 があるので、ループしない時は -vn で落とす
  // （付けたままだと m4a コンテナに書き出せずエラーになる）
  const shape = job.loop ? loopArgs(job.loop) : ["-vn", "-map_metadata", "-1"];
  execFileSync(ffmpeg, ["-v", "error", "-y", "-i", src, ...shape,
    "-c:a", "aac", "-b:a", BITRATE, "-ar", "44100", out]);

  const srcSize = fs.statSync(src).size, outSize = fs.statSync(out).size;
  before += srcSize; after += outSize;
  console.log(`${job.out.padEnd(16)} ${mb(srcSize).padStart(6)}MB -> ${mb(outSize).padStart(6)}MB` +
              (job.loop ? `  [${job.loop.length}秒ループ]` : ""));

  if (job.archive) {
    fs.copyFileSync(out, path.join(archiveDir, job.archive + ".m4a"));
    if (job.mp3) {
      execFileSync(ffmpeg, ["-v", "error", "-y", "-i", src, ...shape,
        "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100",
        path.join(archiveDir, job.archive + ".mp3")]);
    }
  }
}
if (!dry) console.log(`\n合計 ${mb(before)}MB -> ${mb(after)}MB`);
