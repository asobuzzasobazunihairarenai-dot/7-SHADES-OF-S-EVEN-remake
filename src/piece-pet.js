// 駒に遅れて追従する飾りのペット（ユーザー要望・ゲームには一切関係ない見た目だけの要素）。
// 盤面の各駒（.piece[data-token-id]）に絵文字のペットが1匹つき、駒が動くと少し遅れてトコトコ
// 追いかけてくる。盤面の駒は立体(3D)だが、ペットは常に正面を向く平面スプライト（ビルボード）
// にする——絵文字はもともと平面のグリフなので、無理に立体化せず「足元の影＋上下のホップ」で
// 生き物感を出す方が自然で軽い。
//
// 座標系の注意（重要・実機でペットが駒とズレて出た不具合の原因）: このオーバーレイ
// (#piece-pet-layer)はbody直下にあり、bodyにはステージのtransform（translate+scale、
// main.jsのapplyViewportStage参照）が掛かっている。そのため中の要素は「ステージのローカル座標
// （1600×900）」で配置される。一方 getBoundingClientRect() は実画面ピクセルを返すので、駒の
// 画面位置をそのまま translate に使うとステージのscale/offsetぶんズレる。ドラッグゴーストと
// 同じく stageClientToLocal() で画面座標→ステージ座標へ変換し、サイズも stageDelta() で
// ローカル単位に直してから使う（main.jsから注入してもらう）。
//
// ドラッグ中のゴーストや自分ステータス欄の小さな駒サムネイルはbuildCubePiece()を data-token-id
// 無しで使うため、セレクタ .piece[data-token-id] には引っかからない＝盤面の本物の駒だけが対象。

const PET_EMOJI = "🐥"; // 仮のペット（後で着せ替え／本番画像に差し替え予定・ここを変えるだけ）

// 位置・大きさ・追従速度は管理者モードから微調整できる（ユーザー要望）。管理者パネルの
// スライダーは :root のCSS変数を書き換える方式（admin.jsのsetVar）なので、ここではその
// CSS変数を読むだけにして統合する。値が変わるたびadmin.jsが "admin:change" を投げるので、
// それを拾ってキャッシュし直す（毎フレームgetComputedStyleしないための最適化）。
const DEFAULTS = {
  offsetX: 0.55, // 駒の横幅に対する右方向オフセット（＋で右・−で左）
  offsetY: 0.12, // 駒の足元からの縦オフセット（＋で少し上）
  size: 0.85, // 駒の幅に対するペットの大きさ倍率
  follow: 0.16, // 追従の強さ（小さいほど遅れて＝ゆっくり追う。0〜1）
};
const CSS_VARS = {
  offsetX: "--pet-offset-x",
  offsetY: "--pet-offset-y",
  size: "--pet-size",
  follow: "--pet-follow",
};
let tuning = { ...DEFAULTS };
function refreshTuning() {
  const cs = getComputedStyle(document.documentElement);
  const next = { ...DEFAULTS };
  for (const key in CSS_VARS) {
    const v = parseFloat(cs.getPropertyValue(CSS_VARS[key]));
    if (Number.isFinite(v)) next[key] = v;
  }
  tuning = next;
}

// 画面座標→ステージ座標の変換（main.jsから注入）。未注入時は等倍フォールバック。
let clientToLocal = (x, y) => ({ x, y });
let deltaToLocal = (px) => px;
export function registerPiecePetHelpers({ stageClientToLocal, stageDelta } = {}) {
  if (typeof stageClientToLocal === "function") clientToLocal = stageClientToLocal;
  if (typeof stageDelta === "function") deltaToLocal = stageDelta;
}

let layerEl = null;
const pets = new Map(); // tokenId -> { el, emoji, x, y, placed, phase }
let running = false;
let reduceMotion = false;

export function initPiecePets() {
  if (layerEl) return;
  layerEl = document.createElement("div");
  layerEl.id = "piece-pet-layer";
  document.body.appendChild(layerEl);
  try {
    reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch (e) {
    /* 非対応環境はホップありのまま */
  }
  refreshTuning();
  // 管理者スライダーで --pet-* を変えたら拾い直す（admin.jsが値変更ごとに投げる）。
  window.addEventListener("admin:change", refreshTuning);
  running = true;
  requestAnimationFrame(tick);
}

function makePet() {
  const el = document.createElement("div");
  el.className = "piece-pet";
  const shadow = document.createElement("div");
  shadow.className = "piece-pet-shadow";
  const emoji = document.createElement("div");
  emoji.className = "piece-pet-emoji";
  emoji.textContent = PET_EMOJI;
  el.appendChild(shadow);
  el.appendChild(emoji);
  layerEl.appendChild(el);
  return { el, emoji, x: 0, y: 0, placed: false, phase: Math.random() * Math.PI * 2 };
}

function tick(now) {
  if (!running) return;
  requestAnimationFrame(tick);
  if (!layerEl) return;
  const seen = new Set();
  for (const piece of document.querySelectorAll(".piece[data-token-id]")) {
    if (piece.classList.contains("is-setup-pending")) continue; // 配布演出中の駒は対象外
    const r = piece.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // 非表示（レイアウト外）はスキップ
    const id = piece.dataset.tokenId;
    seen.add(id);
    let pet = pets.get(id);
    if (!pet) {
      pet = makePet();
      pets.set(id, pet);
    }
    // 目標＝駒の足元＋オフセット（まず実画面座標で出し、ステージ座標へ変換する）。
    const screenX = r.left + r.width / 2 + r.width * tuning.offsetX;
    const screenY = r.bottom - r.width * tuning.offsetY;
    const local = clientToLocal(screenX, screenY);
    if (!pet.placed) {
      pet.x = local.x;
      pet.y = local.y;
      pet.placed = true;
    } else {
      const f = Math.min(1, Math.max(0.02, tuning.follow));
      pet.x += (local.x - pet.x) * f;
      pet.y += (local.y - pet.y) * f;
    }
    // 大きさもステージ座標（ローカル単位）に直す。駒の画面幅→ローカル幅へ変換。
    const localSize = deltaToLocal(r.width);
    const fontPx = Math.max(10, localSize * tuning.size);
    const hop = reduceMotion ? 0 : Math.abs(Math.sin(now / 260 + pet.phase)) * fontPx * 0.22;
    pet.el.style.fontSize = `${fontPx}px`;
    // 底辺中央を足元(pet.x,pet.y)へ。
    pet.el.style.transform = `translate(${pet.x}px, ${pet.y}px) translate(-50%, -100%)`;
    pet.emoji.style.transform = `translateY(${-hop}px)`; // 絵文字だけホップ（影は接地に残る）
  }
  for (const [id, pet] of pets) {
    if (!seen.has(id)) {
      pet.el.remove();
      pets.delete(id);
    }
  }
}
