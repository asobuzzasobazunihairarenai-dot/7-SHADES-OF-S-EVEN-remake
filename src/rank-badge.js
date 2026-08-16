// ランク称号バッジの共有部品（ランク戦フェーズ6「称号アート反映」）。docs/ranked-spec.md参照。
// 素材は assets/rank-badges/ に英名でコピー済み（静止版＝{key}.webp・アニメ版＝{key}-animated.webp）。
// 使い分け（spec）: 常時表示の一覧・ホーム等では軽い静止版、獲得/昇格演出ではアニメ版
// （レジェンドで約1.9MBと重いため）。
//
// getSelfRank()（online.js）が返すのは {season_id, rank:0..6, gauge:0..6, legend_points}。
// rank>=6（レジェンド）はゲージの代わりにレジェンドポイント(LP)を積み上げる。

export const RANK_KEYS = ["bronze", "silver", "gold", "platinum", "diamond", "master", "legend"];
export const RANK_NAMES = ["ブロンズ", "シルバー", "ゴールド", "プラチナ", "ダイヤモンド", "マスター", "レジェンド"];
// 七色ゲージの色（赤→橙→黄→緑→青→桃→紫。7ptで全色点灯→昇格）。
const GAUGE_COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

function clampRank(rank) {
  const r = Number.isFinite(rank) ? Math.round(rank) : 0;
  return Math.max(0, Math.min(RANK_KEYS.length - 1, r));
}

export function rankKey(rank) {
  return RANK_KEYS[clampRank(rank)];
}
export function rankName(rank) {
  return RANK_NAMES[clampRank(rank)];
}
export function rankBadgeStaticPath(rank) {
  return `assets/rank-badges/${rankKey(rank)}.webp`;
}
export function rankBadgeAnimatedPath(rank) {
  return `assets/rank-badges/${rankKey(rank)}-animated.webp`;
}

// 称号バッジの画像要素。size はCSSサイズ（例 "6rem"）。animated=trueでアニメ版。
export function buildRankBadgeImage(rank, { animated = false, size = "6rem" } = {}) {
  const img = document.createElement("img");
  img.className = "rank-badge-image" + (animated ? " is-animated" : "");
  img.src = animated ? rankBadgeAnimatedPath(rank) : rankBadgeStaticPath(rank);
  img.alt = `${rankName(rank)}ランク`;
  img.style.width = size;
  img.style.height = size;
  img.draggable = false;
  return img;
}

// 七色ゲージ（7ドット、gauge個点灯、色は --color-* を使用）。レジェンド(rank>=6)は
// ゲージの代わりにレジェンドポイントのテキストを返す。
export function buildSevenColorGauge(rank, gauge, legendPoints) {
  if (clampRank(rank) >= 6) {
    const lp = document.createElement("div");
    lp.className = "rank-badge-lp";
    lp.textContent = `レジェンドポイント ${legendPoints ?? 0}`;
    return lp;
  }
  const wrap = document.createElement("div");
  wrap.className = "rank-badge-gauge";
  const lit = Math.max(0, Math.min(7, gauge ?? 0));
  for (let i = 0; i < 7; i++) {
    const dot = document.createElement("div");
    dot.className = "rank-badge-dot" + (i < lit ? " is-lit" : "");
    dot.style.setProperty("--dot-color", `var(--color-${GAUGE_COLORS[i]})`);
    wrap.appendChild(dot);
  }
  return wrap;
}

// ── U型の七色ゲージ（豪華な枠に7つの宝石ソケット。ユーザー提供素材、2026-08-16）──
// assets/rank-gauge/frame-u.webp（1536×1024の枠）＋ gem-0N-<色>.webp（512×512の宝石）。
// ゲージが貯まるほど左（赤）→右（紫）へ宝石が点灯する。獲得演出/結果モーダル等のヒーロー表示用
// （小さいスロットは従来の7ドット buildSevenColorGauge を使う）。
export const RANK_GAUGE_FRAME_U = "assets/rank-gauge/frame-u.webp";
export const RANK_GAUGE_FRAME_LINE = "assets/rank-gauge/frame-line.webp";
const GEM_FILES = [
  "gem-01-red",
  "gem-02-orange",
  "gem-03-yellow",
  "gem-04-green",
  "gem-05-blue",
  "gem-06-pink",
  "gem-07-purple",
];
// 枠(1536×1024)に対する各ソケット中心の位置（%）。U字に沿って左上→下中央→右上。左右対称。
// ※ラスター枠に合わせた実測ベースの推定値。ズレる場合は数値を微調整（ユーザーのスクショで合わせる）。
const U_SOCKETS = [
  { x: 9.8, y: 24.4 }, // 1 赤（左上）
  { x: 15.6, y: 49.8 }, // 2 橙
  { x: 29.0, y: 68.4 }, // 3 黄
  { x: 50.0, y: 76.2 }, // 4 緑（下中央）
  { x: 71.0, y: 68.4 }, // 5 青
  { x: 84.4, y: 49.8 }, // 6 桃
  { x: 90.2, y: 24.4 }, // 7 紫（右上）
];

export function rankGemPath(i) {
  return `assets/rank-gauge/${GEM_FILES[Math.max(0, Math.min(6, i))]}.webp`;
}

// U型ゲージ。size は枠の「幅」（例 "20rem"）。高さはaspect-ratioで自動。
// レジェンド(rank>=6)は満杯（7つ点灯）の「完成した冠」として全宝石を灯す（LPは別途表示）。
export function buildUGauge(rank, gauge, legendPoints, { size = "20rem" } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "rank-ugauge";
  wrap.style.width = size;
  const lit = clampRank(rank) >= 6 ? 7 : Math.max(0, Math.min(7, gauge ?? 0));
  for (let i = 0; i < 7; i++) {
    if (i >= lit) continue; // 未点灯のソケットは枠の黒い空きソケットのまま
    const gem = document.createElement("img");
    gem.className = "rank-ugauge-gem";
    gem.src = rankGemPath(i);
    gem.alt = "";
    gem.draggable = false;
    gem.style.left = `${U_SOCKETS[i].x}%`;
    gem.style.top = `${U_SOCKETS[i].y}%`;
    // 点灯アニメ用のディレイ（左から順にポッと灯る）。
    gem.style.setProperty("--gem-delay", `${i * 0.08}s`);
    wrap.appendChild(gem);
  }
  return wrap;
}

// 称号バッジ＋段位名＋七色ゲージ（or LP）をまとめた縦積みの1ブロックを返す共通部品。
// showName/showGaugeで各要素の表示を制御（バッジだけ欲しい場面もあるため）。
export function buildRankBadge(rank, gauge, legendPoints, { animated = false, size = "6rem", showName = true, showGauge = true } = {}) {
  const box = document.createElement("div");
  box.className = "rank-badge-box";
  box.appendChild(buildRankBadgeImage(rank, { animated, size }));
  if (showName) {
    const name = document.createElement("div");
    name.className = "rank-badge-name";
    name.textContent = rankName(rank);
    box.appendChild(name);
  }
  if (showGauge) box.appendChild(buildSevenColorGauge(rank, gauge, legendPoints));
  return box;
}
