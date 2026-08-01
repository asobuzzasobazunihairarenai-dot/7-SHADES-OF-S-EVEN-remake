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

import { getPetOptionForSeat, petSpriteSrc } from "./pet-skins.js";

const PET_EMOJI = "🐥"; // 既定（pet-skins.jsの選択が使えない時のフォールバック）

// 位置・大きさ・追従速度は管理者モードから微調整できる（ユーザー要望）。管理者パネルの
// スライダーは :root のCSS変数を書き換える方式（admin.jsのsetVar）なので、ここではその
// CSS変数を読むだけにして統合する。値が変わるたびadmin.jsが "admin:change" を投げるので、
// それを拾ってキャッシュし直す（毎フレームgetComputedStyleしないための最適化）。
const DEFAULTS = {
  dist: 0.7, // 駒中心からゲート方向への距離（駒幅比）
  lift: 0.05, // 高さ微調整（＋で少し上へ）
  size: 0.85, // 駒の幅に対するペットの大きさ倍率
  follow: 0.16, // 追従の強さ（小さいほど遅れて＝ゆっくり追う。0〜1）
  wander: 0.35, // 駒の周りをうろつく範囲（駒幅比。0で歩き回らない）
  liveliness: 1.0, // 跳ねる／飛ぶ動きの激しさ（0で大人しい）
};
const CSS_VARS = {
  dist: "--pet-dist",
  lift: "--pet-lift",
  size: "--pet-size",
  follow: "--pet-follow",
  wander: "--pet-wander",
  liveliness: "--pet-liveliness",
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

const rand = (a, b) => a + Math.random() * (b - a);

function makePet() {
  const el = document.createElement("div");
  el.className = "piece-pet";
  const shadow = document.createElement("div");
  shadow.className = "piece-pet-shadow";
  const emoji = document.createElement("div");
  emoji.className = "piece-pet-emoji";
  emoji.textContent = PET_EMOJI;
  // スプライトペット（キュビット等の画像）用の<img>。絵文字ペットの時は非表示。
  const sprite = document.createElement("img");
  sprite.className = "piece-pet-sprite";
  sprite.alt = "";
  sprite.style.display = "none";
  el.appendChild(shadow);
  el.appendChild(emoji);
  el.appendChild(sprite);
  layerEl.appendChild(el);
  const now = performance.now();
  // 各ペットに個別のランダムな癖を持たせて、全員が同じ動きにならないようにする（ユーザー要望）。
  return {
    el,
    emoji,
    sprite,
    spriteSrc: "", // 現在のスプライト画像パス（変わった時だけ差し替え）
    facing: "front", // 現在の向き（front/back/left/right）
    motion: "", // 現在のモーション（walk/idle/yawn/ear/jump/static）
    vx: 0, // 平滑化した移動速度（向き・歩き判定用）
    vy: 0,
    idleVariant: "idle", // 待機中に使うアニメ（idle/yawn/ear）を時々切り替える
    nextIdleSwitchT: now + rand(2500, 6000),
    x: 0,
    y: 0,
    placed: false,
    phase: Math.random() * Math.PI * 2, // 小刻みホップの位相
    hopFreq: rand(0.6, 1.4), // ホップの速さ（個体差）
    hopAmp: rand(0.14, 0.28), // ホップの高さ（個体差）
    wx: 0, // 現在のうろつきオフセット
    wy: 0,
    wtx: 0, // うろつきの目標オフセット
    wty: 0,
    nextWanderT: now + rand(0, 1500), // 次に歩く先を選ぶ時刻
    jumpStart: -1, // 進行中の大ジャンプ開始時刻（-1で無し）
    jumpDur: 0,
    jumpH: 0,
    nextJumpT: now + rand(1500, 5000), // 次に大ジャンプする時刻
    pausedUntil: 0, // この時刻まで立ち止まる
    nextPauseT: now + rand(3000, 8000), // 次に立ち止まる時刻
    orbitStart: -1, // 進行中の「駒を中心に一周」開始時刻（-1で無し）
    orbitDur: 0,
    orbitDir: 1, // 回る向き（＋1/−1）
    nextOrbitT: now + rand(5000, 12000), // 次に一周する時刻
    emojiChar: "", // 現在表示中の絵文字（変わった時だけ差し替える）
  };
}

// スプライトペット（キュビット等）のフレームを、現在の移動速度から向き・モーションを
// 決めて差し替える。向きは速度の大きい軸で判定（横優先）、ほぼ静止なら直前の向きを維持。
// モーション: ジャンプ中→jump、歩行速度以上→walk、それ以外→待機（idle/yawn/earを時々切替）。
const SPRITE_SIZE_RATIO = 2.0; // 絵文字fontPxに対する画像表示サイズ倍率（見た目を絵文字ペットに合わせる）
function updateSprite(pet, spriteName, now, fontPx, isJumping) {
  const sp = Math.hypot(pet.vx, pet.vy);
  if (sp > 0.35) {
    if (Math.abs(pet.vx) >= Math.abs(pet.vy)) {
      pet.facing = pet.vx > 0 ? "right" : "left";
    } else {
      pet.facing = pet.vy > 0 ? "front" : "back"; // 画面下へ＝手前＝正面、上へ＝奥＝後ろ
    }
  }
  let motion;
  if (isJumping) {
    motion = "jump";
  } else if (sp > 0.5) {
    motion = "walk";
  } else {
    if (now >= pet.nextIdleSwitchT) {
      const variants = ["idle", "yawn", "ear"];
      pet.idleVariant = variants[Math.floor(Math.random() * variants.length)];
      pet.nextIdleSwitchT = now + rand(2500, 6000);
    }
    motion = pet.idleVariant;
  }
  const size = Math.round(fontPx * SPRITE_SIZE_RATIO);
  pet.sprite.style.width = `${size}px`;
  pet.sprite.style.height = `${size}px`;
  const src = petSpriteSrc(spriteName, pet.facing, motion);
  if (pet.spriteSrc !== src) {
    pet.sprite.src = src;
    pet.spriteSrc = src;
    pet.motion = motion;
  }
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
    // アンカー＝駒の「自ゲート側」（画面上の方向。main.jsのdataset.gateSide）。実画面座標で
    // 求めてからステージ座標へ変換する。
    const side = piece.dataset.gateSide || "bottom";
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = tuning.dist * r.width;
    let ax = cx;
    let ay = r.bottom;
    if (side === "bottom") {
      ay = r.bottom + dist; // 手前（下）へ
    } else if (side === "top") {
      ay = r.top - dist; // 奥（上）へ
    } else if (side === "left") {
      ax = r.left - dist;
      ay = cy;
    } else if (side === "right") {
      ax = r.right + dist;
      ay = cy;
    }
    ay -= tuning.lift * r.width; // 高さ微調整
    const anchor = clientToLocal(ax, ay); // 自ゲート側のアンカー（通常時の立ち位置）
    const center = clientToLocal(cx, r.bottom - r.height * 0.2); // 駒の足元中央（一周の中心）
    const localSize = deltaToLocal(r.width);
    const fontPx = Math.max(10, localSize * tuning.size);

    // ペットを所有者の選択に合わせる（絵文字 or 画像スプライト）。「なし」選択時は
    // optのemojiがnull且つspriteも無い＝そのペットを非表示にする（ユーザー要望）。
    const owner = piece.dataset.owner || "";
    const opt = getPetOptionForSeat(owner);
    const isSprite = !!(opt && opt.sprite);
    const emojiChar = opt ? opt.emoji : null;
    if (!isSprite && !emojiChar) {
      pet.el.style.display = "none";
      continue; // このペットは表示しない
    }
    if (pet.el.style.display === "none") pet.el.style.display = "";
    // 絵文字表示とスプライト表示を切り替える（種類が変わった時だけDOMを触る）。
    if (isSprite) {
      if (pet.emoji.style.display !== "none") pet.emoji.style.display = "none";
      if (pet.sprite.style.display === "none") pet.sprite.style.display = "";
    } else {
      if (pet.sprite.style.display !== "none") pet.sprite.style.display = "none";
      if (pet.emoji.style.display === "none") pet.emoji.style.display = "";
      if (pet.emojiChar !== emojiChar) {
        pet.emoji.textContent = emojiChar;
        pet.emojiChar = emojiChar;
      }
    }

    // 立ち止まり（ランダムに止まる）。
    if (now >= pet.nextPauseT) {
      pet.pausedUntil = now + rand(500, 1800);
      pet.nextPauseT = now + rand(3500, 9000);
    }
    const paused = now < pet.pausedUntil;

    // 「駒を中心に一周テクテク」（ユーザー要望）。たまに発動し、一定時間かけて駒の周りを一周する。
    if (now >= pet.nextOrbitT && !paused && tuning.wander > 0) {
      pet.orbitStart = now;
      pet.orbitDur = rand(2600, 4200);
      pet.orbitDir = Math.random() < 0.5 ? 1 : -1;
      pet.nextOrbitT = now + rand(7000, 15000);
    }
    const orbiting = pet.orbitStart >= 0 && now < pet.orbitStart + pet.orbitDur;

    let targetX;
    let targetY;
    let ease;
    if (orbiting) {
      // 駒の足元中央を軸に円を描く（縦は遠近で潰す＝地面を回っているように見せる）。
      const t = (now - pet.orbitStart) / pet.orbitDur;
      const ang = pet.orbitDir * t * Math.PI * 2;
      const radius = Math.max(tuning.wander, 0.5) * localSize;
      targetX = center.x + Math.cos(ang) * radius;
      targetY = center.y + Math.sin(ang) * radius * 0.45;
      ease = 0.16; // 円に追いつける速さ
    } else {
      // 通常時: 自ゲート側アンカー＋うろつきオフセットへ。
      if (!paused) {
        if (now >= pet.nextWanderT) {
          const radius = tuning.wander * localSize;
          const angle = Math.random() * Math.PI * 2;
          const rr = Math.random() * radius;
          pet.wtx = Math.cos(angle) * rr;
          pet.wty = Math.sin(angle) * rr * 0.5;
          pet.nextWanderT = now + rand(800, 2600);
        }
        pet.wx += (pet.wtx - pet.wx) * 0.03;
        pet.wy += (pet.wty - pet.wy) * 0.03;
      }
      targetX = anchor.x + pet.wx;
      targetY = anchor.y + pet.wy;
      ease = Math.min(1, Math.max(0.02, tuning.follow));
    }
    const prevX = pet.x;
    const prevY = pet.y;
    const wasPlaced = pet.placed;
    if (!pet.placed) {
      pet.x = targetX;
      pet.y = targetY;
      pet.placed = true;
    } else {
      pet.x += (targetX - pet.x) * ease;
      pet.y += (targetY - pet.y) * ease;
    }
    // 移動速度を平滑化（向き・歩き判定に使う）。初回配置時は0のまま。
    const mvx = wasPlaced ? pet.x - prevX : 0;
    const mvy = wasPlaced ? pet.y - prevY : 0;
    pet.vx += (mvx - pet.vx) * 0.35;
    pet.vy += (mvy - pet.vy) * 0.35;

    // 大ジャンプ（たまに高く飛ぶ）。放物線で1回ぶん跳ねる。
    if (now >= pet.nextJumpT && !paused) {
      pet.jumpStart = now;
      pet.jumpDur = rand(380, 680);
      pet.jumpH = rand(1.0, 2.3) * fontPx;
      pet.nextJumpT = now + rand(2200, 6500);
    }
    let jumpOffset = 0;
    if (pet.jumpStart >= 0 && now < pet.jumpStart + pet.jumpDur) {
      const t = (now - pet.jumpStart) / pet.jumpDur;
      jumpOffset = pet.jumpH * 4 * t * (1 - t);
    }

    // 小刻みホップ（個体差の速さ・高さ）＋大ジャンプ。止まっている間はホップしない。
    const baseHop = paused ? 0 : Math.abs(Math.sin((now / 260) * pet.hopFreq + pet.phase)) * fontPx * pet.hopAmp;
    const hop = reduceMotion ? 0 : (baseHop + jumpOffset) * tuning.liveliness;

    pet.el.style.fontSize = `${fontPx}px`;
    pet.el.style.transform = `translate(${pet.x}px, ${pet.y}px) translate(-50%, -100%)`;
    if (isSprite) {
      const jumping = pet.jumpStart >= 0 && now < pet.jumpStart + pet.jumpDur;
      updateSprite(pet, opt.sprite, now, fontPx, jumping);
      pet.sprite.style.transform = `translateY(${-hop}px)`; // 画像だけホップ（影は接地に残る）
    } else {
      pet.emoji.style.transform = `translateY(${-hop}px)`; // 絵文字だけホップ（影は接地に残る）
    }
  }
  for (const [id, pet] of pets) {
    if (!seen.has(id)) {
      pet.el.remove();
      pets.delete(id);
    }
  }
}
