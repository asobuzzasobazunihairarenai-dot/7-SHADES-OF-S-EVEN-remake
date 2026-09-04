// 盤面のWebGL描画（three.js）— iPhoneのチカチカ／強制終了対策の第1段（2026-09-04）。
//
// 【なぜ作るのか】
// 今の盤面は 49マス・カード・駒・プレイマットが**全部バラバラのHTML要素**で、ブラウザは
// それぞれに合成レイヤーとテクスチャを用意して重ね合わせている。iOSはこの「枚数」と
// そのためのGPUメモリに厳しく、限界に近づくとチラつき、超えるとページごと落ちる（#223）。
// three.jsは**1枚のキャンバスにまとめて描く**ので、この重ね合わせの負担そのものが消える。
//
// 【この段の設計（重要）】
// ゲームのロジックやDOM構造は一切作り直さない。やることは
//   「#game-table の中で **背景画像を描いている要素** を探し、その要素が画面上のどこに
//     どう映るはずかを計算して、同じ絵をWebGLで描く。元のDOMからは絵だけ剥がす」
// だけ。つまり **CSS 3D → WebGL の変換器**であって、盤面の作り直しではない。
// これにより:
//   ・タップ判定（elementsFromPoint ベースの自前方式）は**そのまま**動く。DOMの箱は残す。
//   ・管理者モードの位置調整スライダーも**そのまま**効く（CSSの値を読んで描くため）。
//   ・カード面の文字・多言語・自動フィットも影響を受けない（この段では文字は元のDOMのまま）。
//   ・失敗しても設定を戻せば完全に元通り（既定はOFF）。
//
// 【投影の一致】
// CSSの perspective は「(perspective-origin, P) にカメラを置き、z=0 の平面に投影する」
// ピンホールカメラそのもの。three.js 側でも同じ位置・同じ視錐台（画面の中心とカメラの
// 真下がズレるので**軸をずらした視錐台**）を作れば、DOMの当たり判定と描いた絵がピクセル
// 単位で一致する。位置は各要素の offsetLeft/offsetTop（＝変形前のレイアウト座標）と
// computed transform を root まで積み上げて求める——CSSの計算を二重に書かない。

import * as THREE from "../vendor/three.module.min.js";
import { subscribe } from "./state.js";
import { logAction } from "./action-log.js";

let renderer = null;
let scene = null;
let camera = null;
let canvasEl = null;
let rootGroup = null;
let rafId = null;
let active = false;
let needsRebuild = true;
let rebuildTimer = null;
let unsubscribe = null;

// 要素 → その要素を描いているメッシュ。作り直しを避けて使い回す。
const meshByElement = new Map();
// 同じ要素が「画像の板」と「形の板」を両方持つことがある（例: 盤面のカードは、絵はWebGL、
// 枠線もWebGL）。混ざらないように別のMapで持つ。
const shapeMeshByElement = new Map();
// 画像URL → テクスチャ。同じカード裏面などを何度も読み込まない。
const textureCache = new Map();
const textureLoader = new THREE.TextureLoader();

// この段で「絵を担当する」要素。ここに挙げたものだけWebGLで描き、CSS側では絵を消す
// （src/style.css の body.board-3d-on 参照）。枠線・光彩・文字は今まで通りDOMのまま。
// 【除外メモ】.table-background-bg（一番外側の「床」の絵）はここに入れない。
// 4.75倍に拡大された巨大な板で、傾けると地平線の彼方まで伸びる（実測で画面座標
// -59197〜60799px）。しかも background-size:contain なので箱と絵の縦横比が違い、板に
// そのまま貼ると伸びてしまう。要素は1つだけで合成レイヤーの数の問題には関係しないため、
// これはCSSのままにしておく。
// 【同じ理由で .playmat-bg も除外】キャンバスは1枚なので、DOMの重なり順の“途中”に
// 割り込めない（プレイマットはマスの枠線より奥、カードは手前）。ここではキャンバスを
// 盤面のDOMより**手前**に置き、手前に来るべきもの（カード・駒・山）だけをWebGLに移す。
// プレイマットと床は画像1枚ずつで、合成レイヤーが増える原因ではないためCSSのままでよい。
const PAINT_SELECTOR = [
  ".board-card",
  ".piece-face",
  ".stack-top",
  ".stack-front",
  ".stack-back",
  ".stack-left",
  ".stack-right",
].join(",");

// 【第2段（2026-09-04）】画像だけでなく、**マスとロックスロットの「形」**（角丸の枠と
// 薄い背景色）もWebGLで描く。狙いは合成レイヤーの枚数を減らすこと——iOSは preserve-3d の
// 中の要素ひとつひとつに合成レイヤーを作るので、49マス＋28スロットが「何も塗らない箱」に
// なれば、その分の描画コストが丸ごと消える（実測: 盤面の中で何かを塗っているDOM要素が
// 156 → 26 になった）。
//
// 【これらは画像を持たないので、CSSの値からその場でテクスチャを作る】
// 枠線・背景色・角丸の値は getComputedStyle から読む。ただしWebGL描画中はその値を
// **こちら側で剥がしている**ので、読む瞬間だけ剥がすルールを一時的に無効化する
// （stripSheet.disabled）。剥がすのは背景色と枠線の色だけで、**枠線の太さは残す**
// （box-sizing の都合でレイアウトが変わってしまうため）。outline（選択中のマスの光る枠）と
// box-shadow（ロックスロットのグロー）は剥がさない——箱の内側/外側に描かれるもので、
// WebGLの板（枠だけ・中は透明）に隠されないため、今までどおりDOMのまま動く。
const SHAPE_SELECTOR = ".cell, .lock-slot, .board-card";
let stripSheet = null;
function ensureStripSheet() {
  if (stripSheet) return stripSheet;
  const el = document.createElement("style");
  el.id = "board-3d-shape-strip";
  el.textContent =
    "body.board-3d-on .cell, body.board-3d-on .lock-slot, body.board-3d-on .board-card {" +
    "background-color: transparent !important; border-color: transparent !important; }" +
    // ロックスロットのグロー（枠の外側にぼんやり広がる色）もWebGL側で描くので剥がす。
    "body.board-3d-on .lock-slot { box-shadow: none !important; }";
  document.head.appendChild(el);
  stripSheet = el.sheet;
  return stripSheet;
}

// 角丸の枠＋背景色を1枚の小さな画像として作る（同じ見た目のものは使い回す）。
const shapeTextures = new Map();
function shapeTexture(key, spec) {
  let tex = shapeTextures.get(key);
  if (tex) return tex;
  const scale = 2; // 縁がギザギザにならない程度の解像度で十分（1辺は最大256pxに抑える）
  const pad = spec.pad || 0;
  const fullW = spec.w + pad * 2;
  const fullH = spec.h + pad * 2;
  const cw = Math.max(4, Math.min(256, Math.round(fullW * scale)));
  const ch = Math.max(4, Math.min(256, Math.round(fullH * scale)));
  const sx = cw / fullW;
  const sy = ch / fullH;
  const padX = pad * sx;
  const padY = pad * sy;
  const cv = document.createElement("canvas");
  cv.width = cw;
  cv.height = ch;
  const g = cv.getContext("2d");
  const r = Math.max(0, spec.r) * Math.min(sx, sy);
  const bw = spec.bw * Math.min(sx, sy);
  const path = (inset) => {
    const x = padX + inset, y = padY + inset, w = cw - padX * 2 - inset * 2, h = ch - padY * 2 - inset * 2;
    const rr = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    g.beginPath();
    g.moveTo(x + rr, y);
    g.lineTo(x + w - rr, y);
    g.quadraticCurveTo(x + w, y, x + w, y + rr);
    g.lineTo(x + w, y + h - rr);
    g.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    g.lineTo(x + rr, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - rr);
    g.lineTo(x, y + rr);
    g.quadraticCurveTo(x, y, x + rr, y);
    g.closePath();
  };
  // グロー（外側のぼかし）。枠と同じ形をぼかして描くだけ。
  if (spec.glow) {
    g.save();
    g.shadowColor = spec.glow.color;
    g.shadowBlur = spec.glow.blur * Math.min(sx, sy) * 2; // canvasのぼかしはCSSのおよそ半分の広がり
    g.shadowOffsetX = spec.glow.dx * sx;
    g.shadowOffsetY = spec.glow.dy * sy;
    path(-spec.glow.spread * Math.min(sx, sy));
    g.strokeStyle = spec.glow.color;
    g.lineWidth = Math.max(1, bw);
    g.stroke();
    g.restore();
  }
  if (spec.bg && spec.bg !== "transparent") {
    path(0);
    g.fillStyle = spec.bg;
    g.fill();
  }
  if (bw > 0.2 && spec.bc && spec.bc !== "transparent") {
    path(bw / 2);
    g.lineWidth = bw;
    g.strokeStyle = spec.bc;
    g.stroke();
  }
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // 画像テクスチャと同じ理由（CSSはYが下向き。#238）
  shapeTextures.set(key, tex);
  // 保険: 想定外の理由で種類が増え続けても、メモリを食い潰さないよう古い順に捨てる。
  while (shapeTextures.size > 48) {
    const oldest = shapeTextures.keys().next().value;
    shapeTextures.get(oldest)?.dispose();
    shapeTextures.delete(oldest);
  }
  return tex;
}

// --- 色の読み取り --------------------------------------------------------------------
// CSSの色は rgb()/rgba() とは限らない。**アニメーションやトランジションの最中、Chromeは
// computed値を oklab(...) で返す**ことがある（実測で判明。マスの背景色が
// "oklab(0.83 0.013 0.17 / 0.11)" になっていた）。文字列を自前で解釈すると取りこぼすので、
// 1x1のcanvasに実際に塗って読み返す＝**ブラウザ自身に解釈させる**。どんな書き方の色でも
// 正しく rgba に直せる。同じ文字列は何度も出るのでキャッシュする。
let colorCanvasCtx = null;
const colorCache = new Map();
function parseCssColor(c) {
  if (!c || c === "transparent" || c === "none") return null;
  const hit = colorCache.get(c);
  if (hit !== undefined) return hit;
  let out = null;
  try {
    if (!colorCanvasCtx) {
      const cv = document.createElement("canvas");
      cv.width = 1;
      cv.height = 1;
      colorCanvasCtx = cv.getContext("2d", { willReadFrequently: true });
    }
    const g = colorCanvasCtx;
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = "#000";
    g.fillStyle = c;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    // getImageData は「黒の上に重ねた結果」ではなく素の値（アルファ付き）を返す。
    out = { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  } catch (err) {
    out = null;
  }
  colorCache.set(c, out);
  if (colorCache.size > 512) colorCache.delete(colorCache.keys().next().value);
  return out;
}

// 色を少しだけ丸めた文字列にする。CSSのトランジション中は色が連続的に変わるので、そのまま
// テクスチャの見分けに使うと**1フレームごとに新しいテクスチャが増える**（＝メモリを
// 食い潰す。iOSのために減らしているのに本末転倒）。見た目に分からない程度に段階を
// 粗くして、使い回しが効くようにする。
function quantColor(c) {
  const v = parseCssColor(c);
  if (!v) return null;
  const q = (n) => Math.round(n / 8) * 8;
  const a = Math.round(v.a * 20) / 20;
  return `rgba(${q(v.r)}, ${q(v.g)}, ${q(v.b)}, ${a})`;
}

// 透明かどうか。
function isVisibleColor(c) {
  const v = parseCssColor(c);
  return !!v && v.a > 0.01;
}

// computed の box-shadow から、外側へ広がるグロー1つ分を取り出す（inset・複数指定は扱わない）。
// 例: "rgb(199, 0, 37) 0px 0px 2.4px 0.8px"
function parseBoxShadow(v) {
  if (!v || v === "none" || v.includes("inset")) return null;
  // 色の部分（先頭）と、そのあとの px 値だけを取り出す。色の書き方は問わない。
  const px = v.match(/(-?[\d.]+)px/g);
  if (!px || px.length < 2) return null;
  const color = v.slice(0, v.indexOf(px[0])).trim();
  if (!isVisibleColor(color)) return null;
  const n = px.map((x) => parseFloat(x));
  const blur = n[2] || 0;
  const spread = n[3] || 0;
  if (blur <= 0 && spread <= 0) return null;
  return { color: quantColor(color), dx: n[0], dy: n[1], blur, spread };
}

// 直前に読んだ結果と、その時刻。マス・スロットの枠線や背景色は滅多に変わらないので、
// 毎回の作り直しで読み直すのはもったいない（読むには剥がすルールの一時無効化＝スタイルの
// 全再計算が2回かかる）。一定間隔でだけ読み直し、間は前回の結果を使い回す。
let lastShapeSpecs = new Map();
let lastShapeReadAt = 0;
const SHAPE_READ_INTERVAL_MS = 400;

// 剥がすルールを一瞬だけ無効化して、CSSが本来意図している値を読む。
function readShapeSpecs(table, force) {
  const now = performance.now();
  if (!force && now - lastShapeReadAt < SHAPE_READ_INTERVAL_MS) {
    // 前回の結果のうち、まだ画面にある要素の分だけを使う。
    for (const el of [...lastShapeSpecs.keys()]) {
      if (!el.isConnected) lastShapeSpecs.delete(el);
    }
    return lastShapeSpecs;
  }
  lastShapeReadAt = now;
  return (lastShapeSpecs = readShapeSpecsNow(table));
}

function readShapeSpecsNow(table) {
  const sheet = ensureStripSheet();
  const specs = new Map();
  const wasDisabled = sheet ? sheet.disabled : true;
  if (sheet) sheet.disabled = true;
  try {
    for (const el of table.querySelectorAll(SHAPE_SELECTOR)) {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w <= 0 || h <= 0) continue;
      const cs = getComputedStyle(el);
      const bg = isVisibleColor(cs.backgroundColor) ? quantColor(cs.backgroundColor) : null;
      const bc = isVisibleColor(cs.borderTopColor) ? quantColor(cs.borderTopColor) : null;
      const bw = parseFloat(cs.borderTopWidth) || 0;
      // 外側へ広がるグロー（inset は箱の内側なので対象外＝DOMのまま）。
      const glow = parseBoxShadow(cs.boxShadow);
      if (!bg && (!bc || bw <= 0) && !glow) continue; // 何も塗らない箱は板を作らない
      specs.set(el, {
        w, h, bg, bc, bw,
        r: parseFloat(cs.borderTopLeftRadius) || 0,
        glow,
        pad: glow ? Math.ceil(glow.blur + glow.spread + 2) : 0,
      });
    }
  } finally {
    if (sheet) sheet.disabled = wasDisabled === true ? true : false;
  }
  return specs;
}

function getScene() {
  return document.querySelector(".scene");
}
function getTable() {
  return document.getElementById("game-table");
}

// --- 変形の積み上げ ------------------------------------------------------------------
// el の「root から見た」変形行列を求める。ブラウザがやっているのと同じ順序で
//   （祖先の) translate(offsetLeft, offsetTop) → 自分の transform（transform-origin 込み）
// を積む。offsetLeft/offsetTop は transform の影響を受けない“レイアウト上の位置”なので、
// CSS 側の計算（grid・margin・padding）を一切写さずに済む。
function matrixFromComputedTransform(el) {
  const cs = getComputedStyle(el);
  const tr = cs.transform;
  const m = new THREE.Matrix4();
  if (!tr || tr === "none") return m;
  const nums = tr.match(/matrix3?d?\(([^)]+)\)/);
  if (!nums) return m;
  const v = nums[1].split(",").map((s) => parseFloat(s));
  if (tr.startsWith("matrix3d")) {
    // CSSのmatrix3dは列優先の16個。three.jsのset()は行優先なので入れ替える。
    m.set(v[0], v[4], v[8], v[12], v[1], v[5], v[9], v[13], v[2], v[6], v[10], v[14], v[3], v[7], v[11], v[15]);
  } else {
    // 2Dのmatrix(a,b,c,d,e,f)
    m.set(v[0], v[2], 0, v[4], v[1], v[3], 0, v[5], 0, 0, 1, 0, 0, 0, 0, 1);
  }
  // transform-origin の分だけ前後に平行移動する（CSSと同じ扱い）。
  const origin = (cs.transformOrigin || "0px 0px").split(" ").map((s) => parseFloat(s) || 0);
  const ox = origin[0] ?? 0;
  const oy = origin[1] ?? 0;
  const oz = origin[2] ?? 0;
  const pre = new THREE.Matrix4().makeTranslation(ox, oy, oz);
  const post = new THREE.Matrix4().makeTranslation(-ox, -oy, -oz);
  return pre.multiply(m).multiply(post);
}

// el の左上を原点とする座標系へ移す行列（root からの相対）。CSS座標系（Yは下向き）のまま返す。
function localMatrixTo(el, root) {
  const chain = [];
  let node = el;
  while (node && node !== root) {
    chain.push(node);
    node = node.offsetParent;
    if (!node) break;
  }
  const m = new THREE.Matrix4();
  for (let i = chain.length - 1; i >= 0; i--) {
    const n = chain[i];
    m.multiply(new THREE.Matrix4().makeTranslation(n.offsetLeft, n.offsetTop, 0));
    m.multiply(matrixFromComputedTransform(n));
  }
  return m;
}

// --- テクスチャ ----------------------------------------------------------------------
function backgroundImageUrl(el) {
  // 【重要】computed style は読まない。3D描画がONの間は CSS 側（body.board-3d-on）が
  // background-image を none に上書きしているため、computed からは常に none が返る
  // （最初これで「板が0枚」になった）。盤面の絵はすべて main.js が**インラインstyleで**
  // 設定しているので、そちらを直接読む。
  const bg = el.style.backgroundImage;
  if (!bg || bg === "none") return null;
  const m = bg.match(/url\((['"]?)(.*?)\1\)/);
  return m ? m[2] : null;
}

function getTexture(url) {
  let tex = textureCache.get(url);
  if (!tex) {
    tex = textureLoader.load(url, () => scheduleRender());
    tex.colorSpace = THREE.SRGBColorSpace;
    // 【重要】three.jsの既定(flipY=true)は「Yが上向き」の座標系向け。ここではCSSの座標系
    // （Yが下向き）のまま板を並べているので、そのままだと絵が**上下逆さま**に貼られる
    // （実測: ロックしたカードの文字が上下反転して見えた＝#238。カード裏面はほぼ上下対称の
    // 柄なので気づきにくく、表向きのロックカードで初めて分かった）。
    tex.flipY = false;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.anisotropy = renderer ? Math.min(4, renderer.capabilities.getMaxAnisotropy()) : 1;
    textureCache.set(url, tex);
  }
  return tex;
}

// --- 見え方（祖先まで見る）------------------------------------------------------------
// CSSでは opacity / visibility は**祖先から継承して効く**。WebGL側はその要素だけを見て
// 描くので、親が消しているものまで描いてしまう。実際 #240 は「セットアップ中、駒の親
// （.piece）が opacity:0 で隠れているのに、子の .piece-face を全部描いてしまい、まだ出て
// いないはずの駒が変な形で見えていた」というもの。root まで遡って実効値を求める。
function effectiveVisual(el, root) {
  let opacity = 1;
  let node = el;
  while (node && node !== root) {
    const cs = getComputedStyle(node);
    if (cs.display === "none" || cs.visibility === "hidden") return { opacity: 0, hidden: true };
    const o = parseFloat(cs.opacity);
    if (Number.isFinite(o)) opacity *= o;
    node = node.parentElement;
  }
  return { opacity, hidden: opacity <= 0.001 };
}

// マス（.cell / .lock-slot）に掛かっている「暗転オーバーレイ」を色として取り込む。
// ムーブフェイズ等では ::after で黒い半透明の膜をマスの上に重ねて、選べないマスを暗く
// 見せている（body.phase-move-picking のルール参照）。ところがWebGLのキャンバスは盤面の
// DOMより**手前**にあるので、カードの絵だけがその膜の上に出てしまい「カードだけ明るく、
// 周りが真っ暗＝濃い影が付いたように見える」状態になっていた（#238）。膜の色をそのまま
// 板の色に混ぜて、DOMと同じ見え方に戻す。
function overlayTint(el, root) {
  // el 自身がマス／ロックスロットのこともある（第2段でこれらの「形」もWebGLで描くように
  // なったため）。自分から見始めてよい——.board-card 等はここに当たらないので素通りする。
  let node = el;
  while (node && node !== root) {
    if (node.classList.contains("cell") || node.classList.contains("lock-slot")) {
      const v = parseCssColor(getComputedStyle(node, "::after").backgroundColor || "");
      if (v && v.a > 0.02) return { r: v.r / 255, g: v.g / 255, b: v.b / 255, a: v.a };
      return null;
    }
    node = node.parentElement;
  }
  return null;
}

// --- 走査してメッシュを作る -----------------------------------------------------------
const QUAD = new THREE.PlaneGeometry(1, 1);

function ensureMesh(el, url) {
  let mesh = meshByElement.get(el);
  if (!mesh) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(QUAD, mat);
    meshByElement.set(el, mesh);
    rootGroup.add(mesh);
  }
  if (mesh.material.map?.__url !== url) {
    const tex = getTexture(url);
    tex.__url = url;
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
  }
  return mesh;
}

function ensureShapeMesh(el, spec) {
  const key =
    spec.w + "x" + spec.h + "|" + spec.r + "|" + spec.bw + "|" + spec.bc + "|" + spec.bg +
    "|" + (spec.glow ? spec.glow.color + spec.glow.blur + "/" + spec.glow.spread : "");
  let mesh = shapeMeshByElement.get(el);
  if (!mesh) {
    const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    mesh = new THREE.Mesh(QUAD, mat);
    shapeMeshByElement.set(el, mesh);
    rootGroup.add(mesh);
  }
  if (mesh.userData.shapeKey !== key) {
    mesh.userData.shapeKey = key;
    mesh.material.map = shapeTexture(key, spec);
    mesh.material.needsUpdate = true;
  }
  return mesh;
}

function rebuild() {
  const table = getTable();
  if (!table || !rootGroup) return;
  const seen = new Set();
  const seenShapes = new Set();
  // マス・ロックスロットの「形」は先に読む（この中だけ剥がすルールを外すため、
  // 後段の走査とは分けてある）。
  const shapeSpecs = readShapeSpecs(table);
  const els = table.querySelectorAll(PAINT_SELECTOR + "," + SHAPE_SELECTOR);
  // DOMの並び順＝重なり順。手前のものを少しだけカメラ側へ寄せて、同じ平面上の
  // カードと駒がZファイティング（ちらつき）を起こさないようにする。
  let order = 0;
  for (const el of els) {
    const shape = shapeSpecs.get(el);
    const url = backgroundImageUrl(el);
    if (!url && !shape) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const vis = effectiveVisual(el, table);
    if (vis.hidden) continue;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (w <= 0 || h <= 0) continue;
    const base = localMatrixTo(el, table);
    const tint = overlayTint(el, table);
    // 1つの要素が「絵の板」と「形の板（枠線・背景色・グロー）」の両方を持つことがある
    // （盤面のカード＝絵はWebGL・枠線もWebGL）。CSSと同じく、枠線は絵の上に描く。
    const place = (mesh, pad) => {
      const m = base.clone();
      // 板は「左上原点・幅w高さh」。PlaneGeometryは中心原点なので中心へずらす。
      // グロー（外へ広がるぼかし）がある時はその分だけ一回り大きくする（中心は同じ）。
      m.multiply(new THREE.Matrix4().makeTranslation(w / 2, h / 2, 0));
      m.multiply(new THREE.Matrix4().makeScale(w + pad * 2, h + pad * 2, 1));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(m);
      mesh.material.opacity = vis.opacity;
      if (tint) {
        // 膜が上に重なった時の見え方（元の色 * (1-a) + 膜の色 * a）を板の色として先に作る。
        mesh.material.color.setRGB(1 - tint.a + tint.r * tint.a, 1 - tint.a + tint.g * tint.a, 1 - tint.a + tint.b * tint.a);
      } else {
        mesh.material.color.setRGB(1, 1, 1);
      }
      mesh.userData.domIndex = order++;
      mesh.visible = true;
    };
    if (url) {
      seen.add(el);
      place(ensureMesh(el, url), 0);
    }
    if (shape) {
      seenShapes.add(el);
      place(ensureShapeMesh(el, shape), shape.pad || 0);
    }
  }
  // 消えた要素のメッシュを片付ける（カードが手札へ戻った等）。
  for (const [el, mesh] of meshByElement) {
    if (seen.has(el)) continue;
    rootGroup.remove(mesh);
    mesh.material.dispose();
    meshByElement.delete(el);
  }
  for (const [el, mesh] of shapeMeshByElement) {
    if (seenShapes.has(el)) continue;
    rootGroup.remove(mesh);
    mesh.material.dispose();
    shapeMeshByElement.delete(el);
  }
  needsRebuild = false;
  needsSort = true; // 板の位置が変わったので並べ替え直す
}

// --- カメラ（CSSのperspectiveと同じ投影）----------------------------------------------
function syncCamera() {
  const sceneEl = getScene();
  const table = getTable();
  if (!sceneEl || !table) return false;
  const rect = sceneEl.getBoundingClientRect();
  const W = sceneEl.clientWidth;
  const H = sceneEl.clientHeight;
  if (W <= 0 || H <= 0) return false;
  const cs = getComputedStyle(sceneEl);
  const P = parseFloat(cs.perspective) || 1000;
  const po = (cs.perspectiveOrigin || "50% 50%").split(" ").map((s) => parseFloat(s) || 0);
  const ox = po[0] ?? W / 2;
  const oy = po[1] ?? H / 2;

  // キャンバスの大きさ（実ピクセル）。iOSのメモリを考えて解像度は2倍までに抑える。
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (canvasEl.width !== Math.round(W * dpr) || canvasEl.height !== Math.round(H * dpr)) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    canvasEl.style.width = `${W}px`;
    canvasEl.style.height = `${H}px`;
  }

  // カメラは (ox, oy, P)。CSSはY下向きなので、シーン側はYを反転して置く。
  camera.position.set(ox, -oy, P);
  camera.up.set(0, 1, 0);
  camera.lookAt(ox, -oy, 0);
  // 軸をずらした視錐台。near = P（z=0 の平面までの距離）。
  // 【実測で判明】near を P（z=0 の平面までの距離）にすると、盤面は 42度 傾いていて手前側が
  // カメラに近づくため、**手前半分がまるごと near で切り取られる**（画面の真ん中に水平の
  // 切れ目ができた）。CSSは z<perspective なら手前でも描くので、near はずっと近くに置き、
  // 視錐台の縁も同じ比率で縮める（同じ投影のまま near だけ手前へ動かす）。
  const near = Math.max(1, P * 0.02);
  const k = near / P;
  camera.projectionMatrix.makePerspective((0 - ox) * k, (W - ox) * k, (0 + oy) * k, (-H + oy) * k, near, P + 40000, THREE.WebGLCoordinateSystem);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();

  // ルート＝#game-table の変形。.scene 内での位置（レイアウト）＋自身のtransform。
  const tRect = table.getBoundingClientRect();
  void tRect;
  const m = localMatrixTo(table, sceneEl);
  // CSS座標（Y下）→ three座標（Y上）へ。Yを反転する行列で挟む。
  const flip = new THREE.Matrix4().makeScale(1, -1, 1);
  const root = new THREE.Matrix4().multiplyMatrices(flip, m);
  rootGroup.matrixAutoUpdate = false;
  if (!rootGroup.matrix.equals(root)) {
    rootGroup.matrix.copy(root);
    needsSort = true; // 盤面の見え方が変わったので前後関係を計算し直す
  }
  return true;
}

// --- ループ --------------------------------------------------------------------------
function scheduleRender() {
  // rAFループが回っているので、次のフレームで自然に反映される。
}

// 重なり順を「カメラからの遠さ」で決める（#241）。
// 板は半透明を含むので深度バッファ(depthWrite)を使わず、描く順番だけで重なりを決めている。
// 最初はDOMの並び順をそのまま使っていたが、CSSの3D（preserve-3d）は**実際のZ位置**で
// 前後を決めるため、駒（translateZで持ち上がっている）より後ろのDOMにあるカードが駒の上に
// 描かれてしまっていた。毎フレーム、板の中心のワールドZ（カメラは z=P から -z を見ている
// ので、Zが大きいほど手前）で並べ替える。同じ高さのもの（盤面のカード同士）はDOM順に従う。
const _center = new THREE.Vector3();
const _world = new THREE.Matrix4();
function allMeshes() {
  return [...meshByElement.values(), ...shapeMeshByElement.values()];
}

let needsSort = true;
function sortByDepth() {
  if (!needsSort) return;
  needsSort = false;
  const list = [];
  for (const mesh of allMeshes()) {
    _world.multiplyMatrices(rootGroup.matrix, mesh.matrix);
    _center.set(0, 0, 0).applyMatrix4(_world);
    list.push({ mesh, z: _center.z, i: mesh.userData.domIndex ?? 0 });
  }
  list.sort((a, b) => (a.z !== b.z ? a.z - b.z : a.i - b.i));
  for (let i = 0; i < list.length; i++) list[i].mesh.renderOrder = i;
}

// 実機での重さを見るための計測（管理者モードの表示・不具合報告用）。ヘッドレスのテスト環境は
// GPUが無くWebGLをCPUで描くため、そこでの数値は実機の参考にならない——必ず実機で見る。
let lastRebuildMs = 0;
let lastDrawMs = 0;
let frameAvgMs = 0;
let lastFrameAt = 0;

// 実機での重さを、行動ログにも定期的に残す（ユーザー要望2026-09-05「ログに出力するように
// するのはどうでしょう？」）。管理者パネルを開いていなくても、不具合報告や📜行動ログから
// 実機の数値をそのまま読める——ヘッドレスのテスト環境はGPUが無いので、実機の数値だけが頼り。
// 20秒に1回だけ（ログを埋めない）。
const LOG_INTERVAL_MS = 20000;
let lastStatsLogAt = 0;
function maybeLogStats() {
  const now = performance.now();
  // 1回目は「まだ何も描いていない」状態で出ても意味が無いので、動き出して5秒経ってから。
  if (!lastStatsLogAt) {
    lastStatsLogAt = now - (LOG_INTERVAL_MS - 5000);
    return;
  }
  if (now - lastStatsLogAt < LOG_INTERVAL_MS) return;
  lastStatsLogAt = now;
  try {
    const st = getBoard3dStats();
    logAction("diag-board3d", {
      quads: st.quads,
      shapes: st.shapes,
      textures: st.textures,
      frameMs: st.frameMs,
      drawMs: st.drawMs,
      rebuildMs: st.rebuildMs,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
      canvas: canvasEl ? canvasEl.width + "x" + canvasEl.height : null,
    });
  } catch (err) {
    /* 記録できなくても描画は続ける */
  }
}

function frame() {
  if (!active) return;
  rafId = requestAnimationFrame(frame);
  const t0 = performance.now();
  maybeLogStats();
  if (lastFrameAt) frameAvgMs = frameAvgMs * 0.9 + (t0 - lastFrameAt) * 0.1;
  lastFrameAt = t0;
  if (needsRebuild) {
    rebuild();
    lastRebuildMs = performance.now() - t0;
  }
  if (!syncCamera()) return;
  sortByDepth();
  const t1 = performance.now();
  renderer.render(scene, camera);
  lastDrawMs = lastDrawMs * 0.8 + (performance.now() - t1) * 0.2;
}

function markDirty() {
  needsRebuild = true;
}

// --- 起動・停止 ----------------------------------------------------------------------
function ensureRenderer() {
  if (renderer) return true;
  const sceneEl = getScene();
  if (!sceneEl) return false;
  canvasEl = document.createElement("canvas");
  canvasEl.id = "board-3d-canvas";
  // 盤面のDOM（当たり判定用に残す）より手前、UI（ボタン・モーダル）より奥に置く。
  canvasEl.style.cssText =
    "position:absolute; left:0; top:0; pointer-events:none; z-index:5;";
  sceneEl.appendChild(canvasEl);
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch (err) {
    console.error("board-3d: WebGLRenderer failed", err);
    canvasEl.remove();
    canvasEl = null;
    return false;
  }
  renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera();
  rootGroup = new THREE.Group();
  scene.add(rootGroup);
  // iOSはWebGLの描画を打ち切ることがある（メモリ不足など）。その時は黙って
  // 従来のCSS描画へ戻す——真っ黒な盤面のまま操作不能、という状態を作らない。
  canvasEl.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    console.warn("board-3d: WebGL context lost — CSS描画に戻します");
    setBoard3dActive(false);
  });
  return true;
}

export function isBoard3dActive() {
  return active;
}

export function setBoard3dActive(on) {
  if (on === active) return active;
  if (on) {
    if (!ensureRenderer()) return false;
    active = true;
    document.body.classList.add("board-3d-on");
    needsRebuild = true;
    unsubscribe = subscribe(() => markDirty());
    window.addEventListener("resize", markDirty);
    // 保険: 状態変更を伴わない見た目の変化（管理者モードのスライダー等）にも追随する。
    rebuildTimer = setInterval(markDirty, 500);
    rafId = requestAnimationFrame(frame);
  } else {
    active = false;
    document.body.classList.remove("board-3d-on");
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    clearInterval(rebuildTimer);
    rebuildTimer = null;
    window.removeEventListener("resize", markDirty);
    unsubscribe?.();
    unsubscribe = null;
    for (const mesh of allMeshes()) {
      rootGroup?.remove(mesh);
      mesh.material.dispose();
    }
    meshByElement.clear();
    shapeMeshByElement.clear();
    lastStatsLogAt = 0;
    if (renderer) renderer.clear();
  }
  return active;
}

// 描画中の枚数など（管理者モードの表示・不具合報告用）。
export function getBoard3dStats() {
  return {
    active,
    quads: meshByElement.size + shapeMeshByElement.size,
    shapes: shapeMeshByElement.size,
    tinted: allMeshes().filter((m) => m.material.color.getHex() !== 0xffffff).length,
    textures: textureCache.size + shapeTextures.size,
    rebuildMs: +lastRebuildMs.toFixed(1),
    drawMs: +lastDrawMs.toFixed(2),
    frameMs: +frameAvgMs.toFixed(1),
  };
}

// --- 検証用 --------------------------------------------------------------------------
// 指定の要素をWebGL側で描いている板の「画面上の四隅」を返す。DOM の
// getBoundingClientRect と突き合わせて、投影がCSSと一致しているかを実測で確かめるためのもの
// （このプロジェクトの他の3D関連と同じく、理屈で合わせずに必ず数値で確認する）。
export function debugProjectElement(el) {
  const mesh = meshByElement.get(el);
  const sceneEl = getScene();
  if (!mesh || !sceneEl || !camera) return null;
  camera.updateMatrixWorld(true);
  rootGroup.updateMatrixWorld(true);
  const W = sceneEl.clientWidth;
  const H = sceneEl.clientHeight;
  const world = new THREE.Matrix4().multiplyMatrices(rootGroup.matrix, mesh.matrix);
  const mvp = new THREE.Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .multiply(world);
  const pts = [];
  for (const [x, y] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
    const v = new THREE.Vector4(x, y, 0, 1).applyMatrix4(mvp);
    pts.push([((v.x / v.w) * 0.5 + 0.5) * W, (-(v.y / v.w) * 0.5 + 0.5) * H]);
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const r = sceneEl.getBoundingClientRect();
  return {
    // 画面座標（getBoundingClientRect と同じ基準）へ直して返す。
    left: Math.min(...xs) + r.left,
    right: Math.max(...xs) + r.left,
    top: Math.min(...ys) + r.top,
    bottom: Math.max(...ys) + r.top,
  };
}

// 検証用: その要素を描いている板の「描く順番」（大きいほど手前）。#241（駒がカードに
// 隠れる）のように重なり順が問題になった時、目で見て判断せず数値で確かめるために使う。
export function debugShapeKeys() {
  return [...shapeTextures.keys()];
}

export function debugRenderOrder(el) {
  const mesh = meshByElement.get(el);
  return mesh ? mesh.renderOrder : null;
}
