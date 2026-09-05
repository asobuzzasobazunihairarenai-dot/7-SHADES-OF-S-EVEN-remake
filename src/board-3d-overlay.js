// 【このファイルを消してはいけない・2026-09-05 #264】
// 現在の board-3d.js は、このファイルを import していない（続き422でキャンバスを盤面DOMの
// 奥へ移し、演出を手前へ逃がす必要が無くなったため）。それでも**削除してはいけない**。
//
// 一度これを消した結果、実際に起きたこと:
//   古い board-3d.js をキャッシュに持っている端末（iPhone）が、そこから
//   `./board-3d-overlay.js` を読もうとして 404 になり、
//   「Importing a module script failed」で **WebGL描画が丸ごと起動しなくなった**。
//   しかも起動に失敗するとそのファイルは「読み込み済みリソース」に載らないので、
//   更新時の再取得（update-checker の refreshCachedAssets）の対象からも外れ、
//   **古いキャッシュのまま永久に直らない**という袋小路になった。
//
// 【原則】公開済みのモジュールファイルは消さない。使わなくなっても、中身を空にするか
// この形で残す（数KBのファイル1つと、端末が起動不能になる事故は釣り合わない）。
//
// 盤面のWebGL描画中に、「DOMで描いている演出」をキャンバスの手前へ逃がすための小さな層。
//
// 【なぜ必要か】WebGLのキャンバスは盤面のDOMより**手前**（z-index:5）に置いてある
// （board-3d.js 冒頭の説明参照。1枚のキャンバスはDOMの重なり順の途中に割り込めないため、
// 「手前に来るべきもの＝カード・駒・山」だけをWebGLへ移す設計）。その結果、盤面のDOMに
// 載せている演出——手番の駒のグロー、到達バースト、ロックの刻印、ロック中でも使える
// カードの周回する光——は必ずキャンバスの裏側になり、WebGLが描くカードやマスの板に
// 覆われて見えなくなる（ユーザー報告2026-09-05「自ターン時の駒のカラーEFFECTが
// しっかり光っていない」）。
//
// 【やり方】演出そのものはCSSのまま使い、置き場所だけをキャンバスより手前の層へ移す。
// 位置と大きさは「元の要素が画面上のどこに、どれだけの大きさで映っているか」を実測して
// 合わせる。WebGL側で光を描き直すより確実で、「常時光る演出をやめる」等の既存の設定も
// そのまま効く。
//
// 【このファイルが何もimportしない理由】board-3d.js は three.js（700KB弱）を静的import
// している。main.js からこの層を使うためにあちらを静的importすると、起動しただけで
// three.js を読み込むことになる。ここは依存ゼロの葉モジュールにして、両方から使えるようにする
// （board-3d-setting.js と同じ作法）。

const LAYER_ID = "board-3d-glow-layer";

// WebGLで盤面を描いている最中か。board-3d.js が描画中だけ body に付ける印を見る
// （設定値ではなく「実際に描いているか」で判断する。描いていない時は今までどおりDOMのままでよい）。
export function isBoardOverlayActive() {
  return typeof document !== "undefined" && document.body.classList.contains("board-3d-on");
}

function getScene() {
  return document.querySelector(".scene");
}

// キャンバスより手前の層（無ければ作る）。.scene の中に、キャンバスより後ろ（＝手前に描かれる）
// 位置へ置く。
export function getOverlayLayer() {
  const scene = getScene();
  if (!scene) return null;
  let layer = document.getElementById(LAYER_ID);
  if (layer && layer.parentElement === scene) return layer;
  layer?.remove();
  layer = document.createElement("div");
  layer.id = LAYER_ID;
  scene.appendChild(layer);
  return layer;
}

export function removeOverlayLayer() {
  document.getElementById(LAYER_ID)?.remove();
}

// 元の要素が「この層の座標系」でどこに来るかを求める。
// 【重要】getBoundingClientRect() が返すのは実画面の座標だが、このアプリは 1600x900 の
// ステージを body ごと拡大／縮小しているので（applyViewportStage）、その値をそのまま
// left/top に入れると**変形が二重にかかる**（続き351で勝利演出が丸ごとズレた原因）。
// 「画面上の大きさ ÷ レイアウト上の大きさ」で割り戻す。
export function sceneLocalBox(el) {
  const scene = getScene();
  if (!scene || !el) return null;
  const sr = scene.getBoundingClientRect();
  const scale = scene.clientWidth > 0 && sr.width > 0 ? sr.width / scene.clientWidth : 1;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    left: (r.left - sr.left) / scale,
    top: (r.top - sr.top) / scale,
    width: r.width / scale,
    height: r.height / scale,
  };
}

function applyBox(el, box) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
}

// 一時的な演出（到達バースト・ロックの刻印など）を、元の置き場所と同じ位置・大きさで
// キャンバスの手前に出す。ttlMs 後に自分で片付ける。
// 置けなかった時は false を返すので、呼び出し側は従来どおりDOMへ入れればよい。
export function mountOverlayEffect(hostEl, effectEl, ttlMs) {
  const layer = getOverlayLayer();
  const box = sceneLocalBox(hostEl);
  if (!layer || !box) return false;
  const holder = document.createElement("div");
  holder.className = "board-3d-effect-box";
  applyBox(holder, box);
  holder.appendChild(effectEl);
  layer.appendChild(holder);
  setTimeout(() => holder.remove(), ttlMs);
  return true;
}

// 常時出ている演出（手番の駒のグロー、ロック中でも使えるカードの周回する光）の「逃がし先」。
// 元の要素 -> 手前に置いた空の箱、の対応を持ち、毎フレーム位置を合わせ直す。
const mirrors = new Map();

export function clearOverlayMirrors() {
  for (const el of mirrors.values()) el.remove();
  mirrors.clear();
}

// sources: [{ el, className, vars }] — el と同じ位置・大きさの空の箱を作り、className の
// クラスを付ける（CSS側でそのクラスに演出を書いておく）。vars は引き継ぐCSS変数。
export function syncOverlayMirrors(sources) {
  if (!sources.length && !mirrors.size) return;
  const layer = getOverlayLayer();
  if (!layer) return;
  const seen = new Set();
  for (const src of sources) {
    const box = sceneLocalBox(src.el);
    if (!box) continue;
    let el = mirrors.get(src.el);
    if (!el) {
      el = document.createElement("div");
      layer.appendChild(el);
      mirrors.set(src.el, el);
    }
    seen.add(src.el);
    if (el.className !== src.className) el.className = src.className;
    for (const [name, value] of Object.entries(src.vars || {})) {
      if (value) el.style.setProperty(name, value);
    }
    applyBox(el, box);
  }
  for (const [src, el] of mirrors) {
    if (!seen.has(src)) {
      el.remove();
      mirrors.delete(src);
    }
  }
}
