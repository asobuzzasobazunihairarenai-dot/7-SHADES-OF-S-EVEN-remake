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
import { onFlatten2dModeChange } from "./tablet-2d-mode.js"; // 2D切替時の診断ログ用（#2調査）

const PET_EMOJI = "🐥"; // 既定（pet-skins.jsの選択が使えない時のフォールバック）

// 位置・大きさ・追従速度は管理者モードから微調整できる（ユーザー要望）。管理者パネルの
// スライダーは :root のCSS変数を書き換える方式（admin.jsのsetVar）なので、ここではその
// CSS変数を読むだけにして統合する。値が変わるたびadmin.jsが "admin:change" を投げるので、
// それを拾ってキャッシュし直す（毎フレームgetComputedStyleしないための最適化）。
const DEFAULTS = {
  dist: 0.9, // 駒中心からゲート方向への距離（駒幅比）。駒に乗らないよう少し離す。
  lift: 0.05, // 高さ微調整（＋で少し上へ）
  size: 0.85, // 駒の幅に対するペットの大きさ倍率
  follow: 0.16, // 追従の強さ（小さいほど遅れて＝ゆっくり追う。0〜1）
  wander: 0.35, // ゲート側で歩き回る範囲（駒幅比。0で歩き回らない。駒側へは行かない）
  liveliness: 1.0, // 跳ねる／飛ぶ動きの激しさ（0で大人しい）
  orbitRadius: 1.1, // 「駒を一周」の半径（駒幅比）
  orbitSquash: 0.42, // 一周の縦の潰し（1=真円、小さいほど平たい楕円＝地面を回る感じ）
  orbitDur: 3.4, // 一周にかける秒数
  orbitOffsetX: 0, // 一周の中心を横にずらす（駒幅比）
  orbitOffsetY: 0, // 一周の中心を縦にずらす（駒幅比。−で上＝奥側を持ち上げて駒に埋まらないように）
};
const CSS_VARS = {
  dist: "--pet-dist",
  lift: "--pet-lift",
  size: "--pet-size",
  follow: "--pet-follow",
  wander: "--pet-wander",
  liveliness: "--pet-liveliness",
  orbitRadius: "--pet-orbit-radius",
  orbitSquash: "--pet-orbit-squash",
  orbitDur: "--pet-orbit-dur",
  orbitOffsetX: "--pet-orbit-offset-x",
  orbitOffsetY: "--pet-orbit-offset-y",
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

  // 診断（ユーザー報告2026-08-13「スマホの2Dでペットが描画されない」#2）: この環境（デスクトップ/
  // モバイルエミュ）では2Dでもペットは正常表示され再現できないため、実機での実態を掴む用。
  // 2D/3D切替の少し後に、各ペットの表示状態・実画面位置・レイヤーの矩形をコンソールへ出す
  // （bug-report.jsが自動でコンソールを不具合報告に添付する）。ログのみで挙動は変えない。
  try {
    onFlatten2dModeChange?.((is2d) => {
      setTimeout(() => {
        try {
          const layer = document.getElementById("piece-pet-layer");
          const lr = layer?.getBoundingClientRect();
          const vw = window.innerWidth, vh = window.innerHeight;
          const petInfo = [...pets.values()].map((p) => {
            const cs = getComputedStyle(p.el);
            const r = p.el.getBoundingClientRect();
            const spOn = p.sprite.style.display !== "none";
            return {
              disp: cs.display,
              spr: spOn ? (p.sprite.getAttribute("src") || "").split("/").pop() : "emoji:" + (p.emojiChar || ""),
              x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
              onScreen: r.right > 0 && r.bottom > 0 && r.x < vw && r.y < vh,
            };
          });
          console.log(
            "[diag-pet-2d]",
            JSON.stringify({
              is2d,
              viewport: `${vw}x${vh}`,
              layer: lr ? { x: Math.round(lr.x), y: Math.round(lr.y), w: Math.round(lr.width), h: Math.round(lr.height), disp: layer ? getComputedStyle(layer).display : "?" } : "no-layer",
              pets: petInfo,
            })
          );
        } catch (e) {
          /* 診断失敗は無視 */
        }
      }, 900);
    });
  } catch (e) {
    /* onFlatten2dModeChange未提供でも無害 */
  }
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
    x: 0,
    y: 0,
    placed: false,
    phase: Math.random() * Math.PI * 2, // 小刻みホップの位相（絵文字用）
    hopFreq: rand(0.6, 1.4), // ホップの速さ（個体差）
    hopAmp: rand(0.14, 0.28), // ホップの高さ（個体差）
    // 行動スケジューラ（ユーザー要望: 待機↔行動を交互に。行動の後は必ず待機を挟む）。
    // behState: idle / walk / jump / yawn / ear / orbit。behUntilで次の遷移時刻を管理。
    behState: "idle",
    behUntil: now + rand(500, 1400),
    walkTX: 0, // 歩きの目標（ステージ座標。ゲート側に限定）
    walkTY: 0,
    jumpStart: -1, // 進行中のジャンプ開始時刻（-1で無し）
    jumpDur: 0,
    jumpH: 0,
    orbitStart: -1, // 進行中の「駒を一周」開始時刻（-1で無し）
    orbitDur: 0,
    orbitDir: 1, // 回る向き（＋1/−1）
    emojiChar: "", // 現在表示中の絵文字（変わった時だけ差し替える）
  };
}

// スプライトペット（キュビット等）のフレームを、現在の移動速度から向き・モーションを
// 決めて差し替える。向きは速度の大きい軸で判定（横優先）、ほぼ静止なら直前の向きを維持。
// モーション: ジャンプ中→jump、歩行速度以上→walk、それ以外→待機（idle/yawn/earを時々切替）。
const SPRITE_SIZE_RATIO = 1.35; // 絵文字fontPxに対する画像サイズ倍率（駒に乗らない程度に控えめ）
function updateSprite(pet, spriteName, fontPx, behState) {
  const sp = Math.hypot(pet.vx, pet.vy);
  // 向き: 速度の大きい軸で判定。ほぼ静止なら直前の向きを維持。
  if (sp > 0.35) {
    if (Math.abs(pet.vx) >= Math.abs(pet.vy)) {
      pet.facing = pet.vx > 0 ? "right" : "left";
    } else {
      pet.facing = pet.vy > 0 ? "front" : "back"; // 画面下へ＝手前＝正面、上へ＝奥＝後ろ
    }
  } else if ((behState === "idle" || behState === "yawn" || behState === "ear") && pet.facing === "back") {
    // 駒を奥へ進めた後などに後ろ向きのまま固まると寂しいので、待機に入ったら正面へ向き直る。
    pet.facing = "front";
  }
  // モーション: ジャンプ中→jump、移動中→walk、それ以外は行動状態(yawn/ear)か待機(idle)。
  let motion;
  if (behState === "jump") motion = "jump";
  else if (sp > 0.5) motion = "walk";
  else if (behState === "yawn") motion = "yawn";
  else if (behState === "ear") motion = "ear";
  else motion = "idle";
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
    // 「駒の裏に回ったら駒に隠れる」表現用の駒の縦位置（ステージ座標）。
    const pieceTopLocal = clientToLocal(cx, r.top).y;
    const pieceBottomLocal = clientToLocal(cx, r.bottom).y;
    const pieceHalfWLocal = deltaToLocal(r.width) / 2;

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

    // ゲート側の単位ベクトル: away=駒から離れる方向、lat=ゲート側に沿った横方向。
    // 歩き回りはこの2方向だけに限定し、駒の上へ乗らないようにする（ユーザー要望）。
    let awayX = 0;
    let awayY = 1;
    let latX = 1;
    let latY = 0;
    if (side === "top") {
      awayY = -1;
    } else if (side === "left") {
      awayX = -1;
      awayY = 0;
      latX = 0;
      latY = 1;
    } else if (side === "right") {
      awayX = 1;
      awayY = 0;
      latX = 0;
      latY = 1;
    }

    // --- 行動スケジューラ（ユーザー要望: 行動の度に必ず待機を挟む）------------------------
    // 待機↔行動を交互に。待機明けにランダムな行動を選び、行動後は必ず待機へ戻る。
    if (now >= pet.behUntil) {
      if (pet.behState === "idle") {
        const roll = Math.random();
        if (roll < 0.3) {
          // 歩く: ゲート側を横方向 or 少し離れる方向へ（駒には近づかない）。
          pet.behState = "walk";
          const w = Math.max(0.12, tuning.wander) * localSize;
          const lat = rand(-1, 1) * w;
          const away = rand(0, 0.5) * w;
          pet.walkTX = anchor.x + latX * lat + awayX * away;
          pet.walkTY = anchor.y + latY * lat + awayY * away;
          pet.behUntil = now + rand(900, 1600);
        } else if (roll < 0.52) {
          pet.behState = "jump";
          pet.jumpStart = now;
          pet.jumpDur = rand(420, 700);
          pet.jumpH = rand(1.2, 2.4) * fontPx;
          pet.behUntil = now + pet.jumpDur;
        } else if (roll < 0.7) {
          pet.behState = "yawn";
          pet.behUntil = now + rand(1600, 2600);
        } else if (roll < 0.86) {
          pet.behState = "ear";
          pet.behUntil = now + rand(1400, 2400);
        } else {
          // 駒を一周（軌跡は管理者モードで調整可能: --pet-orbit-radius/squash/dur）。
          pet.behState = "orbit";
          pet.orbitStart = now;
          pet.orbitDur = Math.max(1000, tuning.orbitDur * 1000);
          pet.orbitDir = Math.random() < 0.5 ? 1 : -1;
          pet.behUntil = now + pet.orbitDur;
        }
      } else {
        // 行動が終わった → 必ず待機へ戻る。
        pet.jumpStart = -1;
        pet.orbitStart = -1;
        pet.behState = "idle";
        pet.behUntil = now + rand(900, 2200);
      }
    }

    // 目標位置。orbit=駒を一周、walk=ゲート側の目標、それ以外=ホーム（ゲート側アンカー）。
    let targetX;
    let targetY;
    let ease;
    if (pet.behState === "orbit") {
      const t = (now - pet.orbitStart) / pet.orbitDur;
      const ang = pet.orbitDir * t * Math.PI * 2;
      const radius = tuning.orbitRadius * localSize;
      // 一周の中心を管理者オフセットでずらせる（駒に埋まる時は縦を上げる＝orbitOffsetYを−に）。
      const ocx = center.x + tuning.orbitOffsetX * localSize;
      const ocy = center.y + tuning.orbitOffsetY * localSize;
      targetX = ocx + Math.cos(ang) * radius;
      targetY = ocy + Math.sin(ang) * radius * tuning.orbitSquash;
      ease = 0.2;
    } else if (pet.behState === "walk") {
      targetX = pet.walkTX;
      targetY = pet.walkTY;
      ease = Math.min(1, Math.max(0.02, tuning.follow));
    } else {
      // idle / jump / yawn / ear: ホーム（ゲート側アンカー）に留まる。駒が動けばアンカーを追う。
      targetX = anchor.x;
      targetY = anchor.y;
      ease = Math.min(1, Math.max(0.02, tuning.follow));
    }
    // ユーザー要望「駒の移動についていくとき、もっとついていくと可愛い」。目標（アンカー）が
    // 遠い＝駒が今まさに移動した時は、離れているほど強く追う（駆け足で追いかける見た目）。
    // 近づけば通常のゆったり追従に戻る。orbit中は一定の周回イージングを保つため対象外。
    if (pet.behState !== "orbit" && pet.placed) {
      const dist = Math.hypot(targetX - pet.x, targetY - pet.y);
      const farRatio = dist / Math.max(1, localSize); // 駒何個ぶん離れているか
      ease = Math.max(ease, Math.min(0.6, tuning.follow + farRatio * 0.2));
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

    // ジャンプの縦オフセット（behState==="jump"の間だけ放物線で跳ねる）。
    let jumpOffset = 0;
    if (pet.behState === "jump" && pet.jumpStart >= 0) {
      const t = (now - pet.jumpStart) / pet.jumpDur;
      jumpOffset = pet.jumpH * 4 * t * (1 - t);
    }
    // スプライトはwebpのアニメで生き物感が出るので、CSSの小刻みホップは足さない（ジャンプのみ）。
    // 絵文字は待機中だけ小さくホップさせて生き物っぽさを出す。
    const idleBob =
      !isSprite && pet.behState === "idle"
        ? Math.abs(Math.sin((now / 300) * pet.hopFreq + pet.phase)) * fontPx * pet.hopAmp
        : 0;
    const hop = reduceMotion ? 0 : (idleBob + jumpOffset) * tuning.liveliness;

    pet.el.style.fontSize = `${fontPx}px`;
    pet.el.style.transform = `translate(${pet.x}px, ${pet.y}px) translate(-50%, -100%)`;
    // 駒の裏へ回った時は駒に隠れて見えるようにする（ユーザー要望）。盤面は#sceneで1枚に
    // 合成される3Dシーンのため、z-indexで駒とペットを個別に前後させられない。そこで、ペットが
    // 駒より奥（＝足元が駒の底より上）かつ横位置が駒に重なっている時だけ、ペットの「駒の上端より
    // 下（＝駒に隠れる部分）」をclipで隠し、駒の上に頭だけ出ているように見せる近似を使う。
    // ユーザー報告2026-08-17「2D表示でペットが見えない。一瞬たまに見える」。この「駒の裏へ
    // 回ったら隠す」clipは、盤面が1枚に合成される3Dシーンでの疑似オクルージョン。2D表示
    // （body.diagnostic-flatten-3d、perspective:none＋全要素transform-style:flat）では盤面が
    // 平面化され、この幾何（pet.yと駒の上端/下端の上下関係）が崩れて hideBottom が大きくなり、
    // ペットの大半がclipで隠れてしまう（歩行/ジャンプでpet.yが動いた瞬間だけclipから外れて
    // 「一瞬たまに見える」）。2D表示では疑似オクルージョン自体が無意味なのでclipを掛けない。
    const flat2d = document.body.classList.contains("diagnostic-flatten-3d");
    const behindPiece = !flat2d && pet.y < pieceBottomLocal - deltaToLocal(r.height * 0.08);
    const overlapX = Math.abs(pet.x - center.x) < pieceHalfWLocal * 1.05;
    if (behindPiece && overlapX) {
      const hideBottom = Math.max(0, pet.y - pieceTopLocal); // 要素の下からこのpxぶんを隠す
      pet.el.style.clipPath = `inset(0px 0px ${hideBottom}px 0px)`;
    } else if (pet.el.style.clipPath) {
      pet.el.style.clipPath = "";
    }
    if (isSprite) {
      updateSprite(pet, opt.sprite, fontPx, pet.behState);
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
