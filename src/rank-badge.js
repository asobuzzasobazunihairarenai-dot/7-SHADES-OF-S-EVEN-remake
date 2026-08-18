// ランク称号バッジの共有部品（ランク戦フェーズ6「称号アート反映」）。docs/ranked-spec.md参照。
// 素材は assets/rank-badges/ に英名でコピー済み（静止版＝{key}.webp のみ）。
// ユーザー要望2026-08-18: アニメ版バッジ（-animated.webp）は使わないことにした（フォルダから削除）。
// 常時表示も獲得/昇格・シーズン報酬のヒーロー表示も、すべて静止版を使う。ヒーロー表示では
// buildRankBadgeImage(effects:true) で静止バッジに湯気のようなオーラ＋表面の光沢EFFECTを重ねる。
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
// 称号バッジの画像要素。size はCSSサイズ（例 "6rem"）。
// effects=true のときは、静止バッジの周りに湯気のような幻想的なオーラを漂わせ、表面に光沢の
// 光沢スイープを走らせるエフェクト付きのラッパー（div.rank-badge-fx）で包んで返す（対戦終了後の
// ランク結果・シーズン報酬のヒーロー表示用。ユーザー要望2026-08-18）。それ以外は素の img を返す。
// ※アニメ版バッジ（-animated.webp）は使わなくなった（ユーザーがフォルダから削除）。常に静止版を使う。
export function buildRankBadgeImage(rank, { size = "6rem", effects = false } = {}) {
  const img = document.createElement("img");
  img.className = "rank-badge-image";
  img.src = rankBadgeStaticPath(rank);
  img.alt = `${rankName(rank)}ランク`;
  img.draggable = false;
  if (!effects) {
    img.style.width = size;
    img.style.height = size;
    return img;
  }
  const fx = document.createElement("div");
  fx.className = "rank-badge-fx";
  fx.style.width = size;
  fx.style.height = size;
  const aura = document.createElement("div");
  aura.className = "rank-badge-aura";
  const gloss = document.createElement("div");
  gloss.className = "rank-badge-gloss";
  fx.appendChild(aura); // 背面: 漂うオーラ
  fx.appendChild(img); // 中央: 静止バッジ
  fx.appendChild(gloss); // 前面: 表面の光沢（pointer-events:none）
  return fx;
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
// バッジ背景（魔法陣風の同心円、1254×1254。バッジの背面に重ねる。ユーザー追加2026-08-16）。
export const RANK_GAUGE_BADGE_BG = "assets/rank-gauge/badge-bg.webp";
// 枠は正方形1254×1254（旧1536×1024から差し替え。U字は下側に配置）。
export const RANK_GAUGE_FRAME_RATIO = 1; // 高さ/幅
export const GEM_FILES = [
  "gem-01-red",
  "gem-02-orange",
  "gem-03-yellow",
  "gem-04-green",
  "gem-05-blue",
  "gem-06-pink",
  "gem-07-purple",
];
// 枠(正方形1254×1254)に対する各ソケット中心の位置（%）。U字は下側に配置、左上→下中央→右上。
// ※ラスター枠に合わせた実測ベースの推定値。調整モード（rank-showcase.js）で微調整できる。
export const DEFAULT_U_SOCKETS = [
  { x: 14, y: 39 }, // 1 赤（左上）
  { x: 21, y: 55 }, // 2 橙
  { x: 33.5, y: 68 }, // 3 黄
  { x: 50, y: 70.5 }, // 4 緑（下中央）
  { x: 66.5, y: 68 }, // 5 青
  { x: 79, y: 55 }, // 6 桃
  { x: 86, y: 39 }, // 7 紫（右上）
];
const U_SOCKETS = DEFAULT_U_SOCKETS;

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
export function buildRankBadge(rank, gauge, legendPoints, { effects = false, size = "6rem", showName = true, showGauge = true } = {}) {
  const box = document.createElement("div");
  box.className = "rank-badge-box";
  box.appendChild(buildRankBadgeImage(rank, { effects, size }));
  if (showName) {
    const name = document.createElement("div");
    name.className = "rank-badge-name";
    name.textContent = rankName(rank);
    box.appendChild(name);
  }
  if (showGauge) box.appendChild(buildSevenColorGauge(rank, gauge, legendPoints));
  return box;
}
