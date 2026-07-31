// 駒に遅れて追従する飾りのペット（ユーザー要望・ゲームには一切関係ない見た目だけの要素）。
// 盤面の各駒（.piece[data-token-id]）に絵文字のペットが1匹つき、駒が動くと少し遅れてトコトコ
// 追いかけてくる。盤面の駒は立体(3D)だが、ペットは常に正面を向く平面スプライト（ビルボード）
// にする——絵文字はもともと平面のグリフなので、無理に立体化せず「足元の影＋上下のホップ」で
// 生き物感を出す方が自然で軽い。
//
// 実装方針: ゲーム状態(state.js)には一切触れない純粋な装飾レイヤー。画面座標のオーバーレイ
// (#piece-pet-layer、pointer-events:none)を1枚だけ用意し、requestAnimationFrameのループで、
// 今DOMにある各駒の画面位置(getBoundingClientRect)へバネのように寄せていく（＝遅れて追従）。
// 駒はrender()のたびにDOMが作り直されるが、このレイヤーは作り直さず、tokenIdでペットを対応
// づけて位置だけ更新するので、駒の再生成やremote-move-animatorのアニメにも自然に追従する。
//
// ドラッグ中のゴーストや自分ステータス欄の小さな駒サムネイルはbuildCubePiece()を data-token-id
// 無しで使うため、セレクタ .piece[data-token-id] には引っかからない＝盤面の本物の駒だけが対象。

const PET_EMOJI = "🐥"; // 仮のペット（後で着せ替え／本番画像に差し替え予定・ここを変えるだけ）
const FOLLOW = 0.16; // 追従の強さ（小さいほど遅れて＝ゆっくり追いかける）
const OFFSET_X = 0.55; // 駒の横幅に対する右方向オフセット（駒の右隣に立つ）
const OFFSET_Y = 0.12; // 駒の足元より少し上に着地させる微調整

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
    // まだ登場前（配布演出中）の駒にはペットを出さない。
    if (piece.classList.contains("is-setup-pending")) continue;
    const r = piece.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue; // 非表示（レイアウト外）はスキップ
    const id = piece.dataset.tokenId;
    seen.add(id);
    let pet = pets.get(id);
    if (!pet) {
      pet = makePet();
      pets.set(id, pet);
    }
    const size = r.width;
    // 目標＝駒の足元の少し右（ビルボードの底辺中央がこの点に来るようにする）
    const tx = r.left + r.width / 2 + size * OFFSET_X;
    const ty = r.bottom - size * OFFSET_Y;
    if (!pet.placed) {
      pet.x = tx;
      pet.y = ty;
      pet.placed = true;
    } else {
      pet.x += (tx - pet.x) * FOLLOW;
      pet.y += (ty - pet.y) * FOLLOW;
    }
    const fontPx = Math.max(12, size * 0.85);
    const hop = reduceMotion ? 0 : Math.abs(Math.sin(now / 260 + pet.phase)) * fontPx * 0.22;
    pet.el.style.fontSize = `${fontPx}px`;
    // 底辺中央を足元(pet.x,pet.y)に合わせる。
    pet.el.style.transform = `translate(${pet.x}px, ${pet.y}px) translate(-50%, -100%)`;
    // 絵文字だけ上下にホップ（影は足元に残るので接地感が出る）。
    pet.emoji.style.transform = `translateY(${-hop}px)`;
  }
  // 盤面から消えた駒のペットは片付ける。
  for (const [id, pet] of pets) {
    if (!seen.has(id)) {
      pet.el.remove();
      pets.delete(id);
    }
  }
}
