// カード使用演出（Canvas 2D）。ChatGPT試作のV4/V5を現アプリへ移植（ユーザー提供 2026-08-18）。
//   V4: 使用カードがランダムに端から霧散し、カード色の残光・湯気が画面右側へ流れる（通常使用）。
//   V5: 追色コストのカードが使用カードへ吸い込まれ→2回脈動＋発光→V4の霧散、の連続（追色使用）。
// 炎ではなくカード色の神秘的な湯気/霧/オーラ。白・黒・七色対応。スマホは粒子数を抑える。
// 演出レイヤーのみ（ゲームロジック・状態は一切変更しない）。canvasはステージ(body)直下・
// pointer-events:none で、ステージ座標(1600×900)にそのまま描く（他の演出ゴーストと同じ考え方）。
import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { isArrivalEffectDisabled } from "./motion-prefs.js";
import { isTouchPrimaryDevice } from "./device-detect.js";

const STAGE_W = 1600;
const STAGE_H = 900;

// 演出パラメータは管理者モードで調整できるよう CSS変数から読む（--table-tilt等と同じ方式）。
// mist/residue はスマホで間引く。速さ(speed)は小さいほど“ゆっくり長い”演出になる。
function readDissolveSettings(mobile) {
  const cs = getComputedStyle(document.documentElement);
  const num = (name, fb) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fb;
  };
  return {
    speed: Math.max(0.3, num("--dissolve-speed", 0.85)),
    mist: num("--dissolve-mist", 1) * (mobile ? 0.55 : 1),
    residue: num("--dissolve-residue", 1) * (mobile ? 0.6 : 1),
    cardSize: num("--dissolve-card-size", 340),
  };
}
// 残光・発光に使う“鮮やかな”効果色（盤面パレット--color-*はくすみ気味なので、演出用に彩度を上げた値）。
const DISSOLVE_HEX = {
  red: "#ff405c",
  orange: "#ff8a32",
  yellow: "#ffd84a",
  green: "#42e58a",
  blue: "#49a8ff",
  pink: "#ff74c8",
  purple: "#a875ff",
  white: "#e9f3ff",
  black: "#343849",
};
const RAINBOW_RGB = [
  [255, 64, 92],
  [255, 138, 50],
  [255, 216, 74],
  [66, 229, 138],
  [73, 168, 255],
  [255, 116, 200],
  [168, 117, 255],
];

function hexRgb(hex) {
  return { r: parseInt(hex.slice(1, 3), 16), g: parseInt(hex.slice(3, 5), 16), b: parseInt(hex.slice(5, 7), 16) };
}
function noise(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}
function colorInfoFor(cardId) {
  const c = getCardDefinition(cardId)?.color;
  if (c === "rainbow") return { rainbow: true, hex: "#69dcff", glow: "#ffffff" };
  const hex = DISSOLVE_HEX[c] || "#e9f3ff";
  return { rainbow: false, hex, glow: c === "black" ? "#67677c" : hex };
}

const imgCache = new Map();
function loadImage(src) {
  if (imgCache.has(src)) return Promise.resolve(imgCache.get(src));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      imgCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// 使用演出を再生。costCardId があれば V5（追色）、無ければ V4（通常）。
//   opts.costStart: {x,y}（ステージ座標）= 追色カードの飛び出し元（省略時はカード左下）。
//   opts.onShowModal: 使用カードが霧散し切る頃に1回だけ呼ぶ（呼び出し側が右の使用モーダルを出す）。
// 完了（残光が消えるまで）で解決する Promise を返す。演出OFF時は即 onShowModal して解決。
export async function playCardDissolve(usedCardId, opts = {}) {
  const { costCardId = null, costStart = null, onShowModal } = opts;
  if (isArrivalEffectDisabled()) {
    onShowModal?.();
    return;
  }
  const isV5 = !!costCardId;
  const [cardImg, costImg] = await Promise.all([
    loadImage(getCardImagePath(usedCardId)),
    costCardId ? loadImage(getCardImagePath(costCardId)) : Promise.resolve(null),
  ]);
  const usedColor = colorInfoFor(usedCardId);
  const costColor = costCardId ? colorInfoFor(costCardId) : usedColor;

  const canvas = document.createElement("canvas");
  canvas.className = "card-dissolve-canvas";
  canvas.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:10660;";
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // clientWidth/Height はステージ座標(1600×900、変形前のレイアウトサイズ)。
  const W = canvas.clientWidth || STAGE_W;
  const H = canvas.clientHeight || STAGE_H;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 追色カード侵食用のオフスクリーン
  const costCanvas = document.createElement("canvas");
  costCanvas.width = costCanvas.height = 256;
  const costCtx = costCanvas.getContext("2d");

  const mobile = isTouchPrimaryDevice();
  const { speed, mist, residue, cardSize } = readDissolveSettings(mobile);

  const cx = W * 0.5;
  const cy = H * 0.5 - 8;
  const w = Math.min(cardSize, W * 0.42);
  const h = w;

  // 追色の飛び出し元（省略時はカード左下）
  const startX = costStart ? costStart.x : cx - w * 0.62;
  const startY = costStart ? costStart.y : cy + h * 0.72;

  // 使用カードが霧散し始めるまでの前置き時間（V5＝吸収+脈動+発光、V4＝無し）
  const PRELUDE = isV5 ? 2.12 : 0;

  return new Promise((resolve) => {
    let raf = 0;
    let started = 0;
    let modalShown = false;
    let done = false;
    /** @type {Array<any>} */
    let particles = [];
    // シード式の侵食パターン（複数箇所からランダムに侵食＝方眼にならない）
    const seeds = Array.from({ length: 4 + Math.floor(Math.random() * 3) }, (_, i) => {
      const edge = i % 4;
      const p = 0.12 + Math.random() * 0.76;
      return {
        x: edge === 1 ? 0.5 : edge === 3 ? -0.5 : p - 0.5,
        y: edge === 0 ? -0.5 : edge === 2 ? 0.5 : p - 0.5,
        start: Math.random() * 0.24,
        rate: 0.65 + Math.random() * 0.55,
      };
    });

    const spawn = (x, y, n) => {
      for (let i = 0; i < n; i++) {
        const k = Math.random();
        particles.push({
          x,
          y,
          vx: 105 + Math.random() * 95, // 右へ流れる
          vy: -34 + Math.random() * 44, // わずかに上（右の使用モーダルの方）
          life: 0,
          max: 0.78 + Math.random() * 0.55,
          size: 2 + Math.random() * (k < 0.38 ? 15 : 6),
          spin: (Math.random() - 0.5) * 4,
          rot: Math.random() * 6.28,
          alpha: 0.4 + Math.random() * 0.55,
        });
      }
    };
    const spawnCost = (x, y, n, col) => {
      for (let i = 0; i < n; i++)
        particles.push({
          x,
          y,
          vx: -12 + Math.random() * 30,
          vy: -12 - Math.random() * 38,
          life: 0,
          max: 0.42 + Math.random() * 0.42,
          size: 5 + Math.random() * 12,
          spin: (Math.random() - 0.5) * 2,
          rot: Math.random() * 6.28,
          alpha: 0.5 + Math.random() * 0.35,
          cost: true,
          color: col,
        });
    };

    const rounded = (x, y, ww, hh, r) => {
      ctx.beginPath();
      ctx.roundRect(x, y, ww, hh, r);
    };
    // 使用カードを描画し、active中は progress に応じてシード侵食（destination-out）で消す。
    const drawCard = (t) => {
      const progress = Math.max(0, Math.min(1, (t - 0.12) / 0.72));
      ctx.save();
      rounded(cx - w / 2, cy - h / 2, w, h, 10);
      ctx.fillStyle = "#111725";
      ctx.fill();
      if (cardImg) {
        ctx.save();
        rounded(cx - w / 2, cy - h / 2, w, h, 10);
        ctx.clip();
        ctx.drawImage(cardImg, cx - w / 2, cy - h / 2, w, h);
        ctx.restore();
      }
      if (progress > 0) {
        ctx.globalCompositeOperation = "destination-out";
        const cell = 2;
        for (let yy = -h / 2; yy < h / 2; yy += cell)
          for (let xx = -w / 2; xx < w / 2; xx += cell) {
            let gone = 0;
            for (const s of seeds) {
              const local = Math.max(0, (progress - s.start) * s.rate);
              const dist = Math.hypot(xx / w - s.x, yy / h - s.y);
              gone = Math.max(
                gone,
                (local -
                  dist +
                  noise(xx * 0.065 + s.x * 9, yy * 0.065 + s.y * 7) * 0.13 +
                  Math.sin(xx * 0.06 + yy * 0.04 + t * 2 + s.x * 5) * 0.025) *
                  17
              );
            }
            if (gone > 0) {
              ctx.globalAlpha = Math.min(1, gone);
              ctx.fillRect(cx + xx, cy + yy, cell + 3, cell + 3);
            }
          }
        if (progress > 0.94) {
          ctx.globalAlpha = Math.min(1, (progress - 0.94) * 18);
          ctx.fillRect(cx - w / 2 - 3, cy - h / 2 - 3, w + 6, h + 6);
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    };

    const frame = (ms) => {
      if (done) return;
      const rawT = (ms - started) / 1000 * speed;
      const t = isV5 ? Math.max(0, rawT - PRELUDE) : rawT;
      ctx.clearRect(0, 0, W, H);

      // 使用カードが霧散し切る頃に右の使用モーダルを出す（1回）
      if (!modalShown && t > 0.55) {
        modalShown = true;
        try {
          onShowModal?.();
        } catch {}
      }

      // 霧散中の残滓を、カード内部のシード位置から湧かせる（外から突然出さない）
      if (t < 1.03) {
        const p = Math.max(0, Math.min(1, (t - 0.08) / 0.72));
        if (Math.random() < 0.76 * mist) {
          const s = seeds[Math.floor(Math.random() * seeds.length)] || { x: 0, y: 0, start: 0, rate: 1 };
          const a = Math.random() * Math.PI * 2;
          const r = Math.max(0, p - s.start) * s.rate * w;
          let x = cx + s.x * w + Math.cos(a) * r;
          let y = cy + s.y * h + Math.sin(a) * r;
          x = Math.max(cx - w * 0.5 + 14, Math.min(cx + w * 0.5 - 14, x));
          y = Math.max(cy - h * 0.5 + 12, Math.min(cy + h * 0.5 - 12, y));
          spawn(x, y, Math.ceil(2.2 * residue));
        }
        if (Math.random() < 0.2 * mist) spawn(cx - w / 2 + 14 + Math.random() * (w - 28), cy - h / 2 + 12 + Math.random() * (h - 24), 1);
      }

      // V5の脈動(ドクン ドクン)・発光・残照
      const beat = isV5 && rawT > 0.88 && rawT < 1.55 ? Math.exp(-Math.pow((rawT - 0.88 - 0.12) / 0.06, 2)) + 0.85 * Math.exp(-Math.pow((rawT - 0.88 - 0.42) / 0.075, 2)) : 0;
      const flash = isV5 && rawT > 1.52 && rawT < PRELUDE ? Math.pow(Math.sin(((rawT - 1.52) / 0.6) * Math.PI), 0.58) : 0;
      const afterglow = isV5 && rawT >= PRELUDE && t < 1.05 ? Math.max(0, 1 - t * 0.72) : 0;
      const usedRgb = hexRgb(usedColor.glow);

      if (beat > 0) {
        const impact = Math.min(1, beat);
        const shakeX = Math.sin(rawT * 118) * 3.2 * impact;
        const shakeY = Math.cos(rawT * 91) * 2.1 * impact;
        const beatScale = 1 + beat * 0.055;
        ctx.save();
        ctx.translate(cx + shakeX, cy + shakeY);
        ctx.rotate(Math.sin(rawT * 67) * 0.008 * impact);
        ctx.scale(beatScale, beatScale);
        ctx.translate(-cx, -cy);
        // 色残像（RGBズレのブラー）
        ctx.save();
        ctx.globalAlpha = 0.2 * impact;
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = `blur(${2.5 + impact * 3}px) drop-shadow(5px 0 1px rgba(255,70,90,.7)) drop-shadow(-5px 0 1px rgba(70,190,255,.65))`;
        drawCard(t);
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.72 + 0.2 * (1 - impact);
        ctx.filter = `blur(${impact * 1.8}px)`;
        drawCard(t);
        ctx.restore();
        ctx.restore();
      } else if (flash > 0) {
        ctx.save();
        ctx.filter = `brightness(${1 + flash * 3.6}) saturate(${1 + flash * 0.8}) blur(${flash * 1.1}px) drop-shadow(0 0 ${18 + flash * 38}px ${usedColor.glow})`;
        drawCard(t);
        ctx.restore();
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.72);
        fg.addColorStop(0, `rgba(${usedRgb.r},${usedRgb.g},${usedRgb.b},${flash * 0.92})`);
        fg.addColorStop(0.42, `rgba(${usedRgb.r},${usedRgb.g},${usedRgb.b},${flash * 0.64})`);
        fg.addColorStop(1, "transparent");
        ctx.fillStyle = fg;
        ctx.fillRect(cx - w * 0.78, cy - h * 0.78, w * 1.56, h * 1.56);
        ctx.restore();
      } else {
        drawCard(t);
      }

      if (afterglow > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const ag = ctx.createRadialGradient(cx, cy, w * 0.08, cx, cy, w * 0.7);
        ag.addColorStop(0, `rgba(${usedRgb.r},${usedRgb.g},${usedRgb.b},${afterglow * 0.48})`);
        ag.addColorStop(0.5, `rgba(${usedRgb.r},${usedRgb.g},${usedRgb.b},${afterglow * 0.26})`);
        ag.addColorStop(1, "transparent");
        ctx.fillStyle = ag;
        ctx.shadowColor = usedColor.glow;
        ctx.shadowBlur = 34 * afterglow;
        ctx.fillRect(cx - w * 0.76, cy - h * 0.76, w * 1.52, h * 1.52);
        ctx.restore();
      }

      // V5の追色カード（吸い込み＋侵食）
      if (isV5) {
        const q = Math.min(1, rawT / 0.9);
        const e = 1 - Math.pow(1 - q, 3);
        const sx = startX + (cx - startX) * e;
        const sy = startY + (cy - startY) * e - Math.sin(Math.PI * q) * h * 0.28;
        const sz = w * (0.48 - 0.22 * q);
        const cr = hexRgb(costColor.hex);
        if (rawT < 0.9 && costImg) {
          ctx.save();
          if (q > 0) {
            // 吸い込みの尾（カード色の軌跡）
            ctx.globalAlpha = 0.22 * (1 - q);
            ctx.strokeStyle = `rgba(${cr.r},${cr.g},${cr.b},.8)`;
            ctx.lineWidth = 12 * (1 - q) + 3;
            ctx.lineCap = "round";
            ctx.shadowColor = costColor.hex;
            ctx.shadowBlur = 18;
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.quadraticCurveTo((startX + cx) / 2, Math.min(startY, cy) - h * 0.18, sx, sy);
            ctx.stroke();
          }
          const er = Math.max(0, (q - 0.18) / 0.82); // 移動中に追色カード自体も霧散
          costCtx.clearRect(0, 0, 256, 256);
          costCtx.globalCompositeOperation = "source-over";
          costCtx.globalAlpha = 1;
          costCtx.drawImage(costImg, 0, 0, 256, 256);
          if (er > 0) {
            costCtx.globalCompositeOperation = "destination-out";
            for (let yy = 0; yy < 256; yy += 3)
              for (let xx = 0; xx < 256; xx += 3) {
                const dist = Math.hypot(xx, 256 - yy) / 362;
                const wave = er * 1.28 + noise(xx * 0.055, yy * 0.055) * 0.16 + Math.sin((xx + yy) * 0.04 + q * 5) * 0.025;
                const gone = (wave - dist) * 14;
                if (gone > 0) {
                  costCtx.globalAlpha = Math.min(1, gone);
                  costCtx.fillRect(xx, yy, 6, 6);
                }
              }
            costCtx.globalCompositeOperation = "source-over";
            costCtx.globalAlpha = 1;
          }
          if (q > 0.2 && q < 0.94 && Math.random() < 0.62) spawnCost(sx - sz * 0.2, sy + sz * 0.18, 1, [cr.r, cr.g, cr.b]);
          ctx.globalAlpha = 1 - Math.max(0, (q - 0.98) / 0.02);
          ctx.shadowColor = costColor.hex;
          ctx.shadowBlur = 12;
          ctx.drawImage(costCanvas, sx - sz / 2, sy - sz / 2, sz, sz);
          ctx.restore();
        }
        if (beat > 0) {
          const pulse = Math.min(1, beat);
          const pg = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.43);
          pg.addColorStop(0, `rgba(${cr.r},${cr.g},${cr.b},${pulse * 0.38})`);
          pg.addColorStop(1, "transparent");
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.fillStyle = pg;
          ctx.fillRect(cx - w * 0.5, cy - h * 0.5, w, h);
          ctx.restore();
        }
      }

      // 残滓（湯気）の更新・描画
      const rgb = hexRgb(usedColor.hex);
      particles = particles.filter((pp) => pp.life < pp.max);
      for (const pp of particles) {
        pp.life += 0.016 * speed;
        pp.x += pp.vx * 0.016;
        pp.y += pp.vy * 0.016;
        if (pp.cost) {
          pp.vx *= 0.985;
          pp.vy -= 0.18;
        } else {
          pp.vx += 0.55; // 右へ加速
          pp.vy += Math.sin(pp.life * 9 + pp.rot) * 0.18;
        }
        pp.rot += pp.spin * 0.016;
        const a = Math.sin(Math.min(1, pp.life / pp.max) * Math.PI) * pp.alpha;
        ctx.save();
        ctx.translate(pp.x, pp.y);
        ctx.rotate(pp.rot);
        ctx.globalCompositeOperation = "lighter";
        const ri = Math.abs(Math.floor(pp.rot * 997)) % 7;
        const rc = RAINBOW_RGB[ri];
        const base = pp.color || [rgb.r, rgb.g, rgb.b];
        ctx.shadowColor = pp.cost ? `rgba(${base[0]},${base[1]},${base[2]},.8)` : usedColor.rainbow ? "#ffffff" : usedColor.hex;
        const pc = pp.cost
          ? `rgba(${base[0]},${base[1]},${base[2]},${a * 0.42})`
          : usedColor.rainbow
          ? `rgba(${rc[0]},${rc[1]},${rc[2]},${a * 0.48})`
          : `rgba(${rgb.r},${rgb.g},${rgb.b},${a * 0.32})`;
        const pw = pp.size * (1.2 + pp.life * 1.8);
        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, pw);
        grad.addColorStop(0, pc);
        grad.addColorStop(0.45, pc);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.shadowBlur = 14;
        ctx.scale(pp.cost ? 1 : 1.9, pp.cost ? 1.5 : 0.72); // 横に伸びた湯気
        ctx.beginPath();
        ctx.arc(Math.sin(pp.life * 7 + pp.rot) * pp.size * 0.35, 0, pw, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (t > 1.25 && particles.length === 0) {
        finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const finish = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      canvas.remove();
      if (!modalShown) {
        modalShown = true;
        try {
          onShowModal?.();
        } catch {}
      }
      resolve();
    };

    // 保険: 何かで終わらない場合でも必ず片付ける（総尺は 1/speed に比例するので speed を織り込む）
    const safety = setTimeout(finish, ((PRELUDE + 2.5) / speed + 1) * 1000);
    const origResolve = resolve;
    resolve = (v) => {
      clearTimeout(safety);
      origResolve(v);
    };

    started = performance.now();
    raf = requestAnimationFrame(frame);
  });
}
