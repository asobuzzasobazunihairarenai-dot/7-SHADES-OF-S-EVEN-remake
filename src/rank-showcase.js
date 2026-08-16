// ランク称号バッジ＋U型七色ゲージ＋宝石を合成した「ヒーロー表示」の共通部品と、その位置・
// サイズ関係を実際に見ながら調整する編集モード（ユーザー要望2026-08-16「管理者モードに
// ランクバッジ・ランクゲージ・ランクジェムの位置サイズ調整モードを追加。押すと実際に出てきて
// 調整できる方が良いよね？」）。中立宝石は使わない（ユーザー確認済み）。
//
// 調整結果は下の RANK_SHOWCASE（bake対象のJSリテラル）へ焼き込む運用（profile-layout-editorや
// admin.jsのCSS変数調整と同じ思想）。編集モードでドラッグ移動／ホイールでサイズ変更し、
// 「座標を出力」で得たリテラルを開発者に渡す。

import { buildRankBadgeImage, rankGemPath, RANK_GAUGE_FRAME_U } from "./rank-badge.js";

// ★製作者が焼き込む「バッジ＋ゲージ＋宝石」の配置（ユーザーが調整モードで調整・2026-08-16）。
export const RANK_SHOWCASE = {
  gaugeSize: 20, // U型枠の幅（rem）。高さは 1536:1024 のaspectで自動。
  gemSize: 15, // 宝石の大きさ（枠幅に対する%）。ソケットにフィットさせる。
  badgeSize: 8, // 称号バッジの大きさ（rem）。
  badgeX: 0.1, // バッジの水平オフセット（rem、＋で右）。中央基準。
  badgeY: -1.7, // バッジの垂直位置（rem、枠の上端から。U字の開いた中央に置く）。
  sockets: [
    { x: 8.6, y: 23.5 },
    { x: 15.3, y: 49.8 },
    { x: 29, y: 68.4 },
    { x: 50, y: 76.2 },
    { x: 71, y: 68.4 },
    { x: 84.7, y: 49.4 },
    { x: 91.1, y: 23.5 },
  ],
};

function litCount(rank, gauge) {
  const r = Number.isFinite(rank) ? Math.round(rank) : 0;
  if (r >= 6) return 7; // レジェンドは満杯＝完成した冠
  return Math.max(0, Math.min(7, gauge ?? 0));
}

const FRAME_RATIO = 1024 / 1536; // 高さ / 幅

// バッジ／宝石／ゲージの大きさ（gaugeSize/gemSize/badgeSize）を box に反映する。ドラッグ位置は
// 別途 buildRankShowcase / drag で反映済み。編集モードのリサイズ後の再適用にも使う。
function applyShowcaseSizes(box) {
  const cfg = RANK_SHOWCASE;
  box.style.width = `${cfg.gaugeSize}rem`;
  box.style.setProperty("--rank-ugauge-gem", `${cfg.gemSize}%`);
  const badge = box.querySelector(".rank-showcase-badge");
  if (badge) {
    badge.style.width = `${cfg.badgeSize}rem`;
    badge.style.height = `${cfg.badgeSize}rem`;
  }
}

// バッジ＋U型ゲージ＋宝石の合成ブロック。scale で全体を等倍縮小できる（ホーム/マイページの
// コンパクト表示用。バッジ・宝石・ゲージの関係を保ったまま小さくなる）。
// editable=true で編集モード（ドラッグ／ホイール）を配線し、onChange で変更を通知する。
export function buildRankShowcase(rank, gauge, legendPoints, { animated = false, editable = false, onChange, scale = 1 } = {}) {
  const cfg = RANK_SHOWCASE;
  const box = document.createElement("div");
  box.className = "rank-showcase" + (editable ? " is-editable" : "");
  box.style.width = `${cfg.gaugeSize}rem`;
  box.style.setProperty("--rank-ugauge-gem", `${cfg.gemSize}%`);
  box.style.backgroundImage = `url("${RANK_GAUGE_FRAME_U}")`;

  const lit = litCount(rank, gauge);
  const gems = [];
  for (let i = 0; i < 7; i++) {
    const gem = document.createElement("img");
    gem.className = "rank-showcase-gem";
    gem.dataset.gemIndex = String(i);
    gem.src = rankGemPath(i);
    gem.alt = "";
    gem.draggable = false;
    gem.style.left = `${cfg.sockets[i].x}%`;
    gem.style.top = `${cfg.sockets[i].y}%`;
    if (i >= lit && !editable) gem.style.display = "none"; // 未点灯は非表示（編集時は全表示）
    if (i >= lit && editable) gem.style.opacity = "0.35"; // 編集時は未点灯を薄く出す
    box.appendChild(gem);
    gems.push(gem);
  }

  const badge = buildRankBadgeImage(rank, { animated, size: `${cfg.badgeSize}rem` });
  badge.classList.add("rank-showcase-badge");
  badge.style.left = `calc(50% + ${cfg.badgeX}rem)`;
  badge.style.top = `${cfg.badgeY}rem`;
  box.appendChild(badge);

  if (editable) {
    wireShowcaseEditing(box, badge, gems, onChange);
    return box;
  }

  // 等倍縮小表示（コンパクト表示）：footprintを縮小後サイズに合わせるためラッパーで包む。
  if (scale !== 1) {
    const wrap = document.createElement("div");
    wrap.className = "rank-showcase-scale";
    wrap.style.width = `calc(${cfg.gaugeSize}rem * ${scale})`;
    wrap.style.height = `calc(${cfg.gaugeSize}rem * ${FRAME_RATIO} * ${scale})`;
    box.style.position = "absolute";
    box.style.top = "0";
    box.style.left = "0";
    box.style.transformOrigin = "top left";
    box.style.transform = `scale(${scale})`;
    wrap.appendChild(box);
    return wrap;
  }
  return box;
}

// 編集モードのサイズ変更（ホイール／ボタン共通）。which: "badge"|"gem"|"gauge"、dir: +1/-1。
function resizeShowcase(box, which, dir) {
  const cfg = RANK_SHOWCASE;
  if (which === "badge") cfg.badgeSize = clamp(round1(cfg.badgeSize + dir * 0.3), 2, 24);
  else if (which === "gem") cfg.gemSize = clamp(round1(cfg.gemSize + dir * 0.5), 4, 40);
  else cfg.gaugeSize = clamp(round1(cfg.gaugeSize + dir * 0.5), 8, 40);
  applyShowcaseSizes(box);
}

// bodyのステージscale（実画面px→ローカルpx換算用）。
function stageScale() {
  const m = /matrix\(([^)]+)\)/.exec(getComputedStyle(document.body).transform || "");
  if (m) {
    const a = parseFloat(m[1].split(",")[0]);
    if (a > 0) return a;
  }
  return 1;
}

// 編集の配線：バッジ／宝石をドラッグで移動、ホイールでサイズ変更。RANK_SHOWCASE を直接更新し、
// 該当要素のstyleも即時に反映する（フル再描画しない）。
function wireShowcaseEditing(box, badge, gems, onChange) {
  const cfg = RANK_SHOWCASE;
  const notify = () => onChange?.();

  // ── ドラッグ移動 ──
  function startDrag(target, e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const gi = target === badge ? -1 : Number(target.dataset.gemIndex);
    const s = stageScale();
    const frame = box.getBoundingClientRect();
    const base =
      gi === -1
        ? { x: cfg.badgeX, y: cfg.badgeY }
        : { x: cfg.sockets[gi].x, y: cfg.sockets[gi].y };
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (gi === -1) {
        // バッジ：rem（実画面px→ローカルpx→rem）
        cfg.badgeX = round1(base.x + dx / s / 16);
        cfg.badgeY = round1(base.y + dy / s / 16);
        badge.style.left = `calc(50% + ${cfg.badgeX}rem)`;
        badge.style.top = `${cfg.badgeY}rem`;
      } else {
        // 宝石：枠に対する%（frameは実画面px、dxも実画面pxなので比率はscale非依存）
        cfg.sockets[gi].x = round1(base.x + (dx / frame.width) * 100);
        cfg.sockets[gi].y = round1(base.y + (dy / frame.height) * 100);
        target.style.left = `${cfg.sockets[gi].x}%`;
        target.style.top = `${cfg.sockets[gi].y}%`;
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      notify();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  badge.addEventListener("pointerdown", (e) => startDrag(badge, e));
  for (const g of gems) g.addEventListener("pointerdown", (e) => startDrag(g, e));

  // ── ホイールでサイズ変更（宝石の上＝宝石、バッジの上＝バッジ、枠の上＝ゲージ全体）──
  function onWheel(e) {
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    const t = e.target;
    const which = t === badge ? "badge" : t && t.classList && t.classList.contains("rank-showcase-gem") ? "gem" : "gauge";
    resizeShowcase(box, which, dir);
    notify();
  }
  box.addEventListener("wheel", onWheel, { passive: false });
}

function round1(v) {
  return Math.round(v * 10) / 10;
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// 現在の RANK_SHOWCASE を、そのままコードへ貼れるJSリテラルとして出す。
export function getRankShowcaseOutput() {
  const c = RANK_SHOWCASE;
  const sockets = c.sockets.map((s) => `    { x: ${s.x}, y: ${s.y} },`).join("\n");
  return (
    "export const RANK_SHOWCASE = {\n" +
    `  gaugeSize: ${c.gaugeSize},\n` +
    `  gemSize: ${c.gemSize},\n` +
    `  badgeSize: ${c.badgeSize},\n` +
    `  badgeX: ${c.badgeX},\n` +
    `  badgeY: ${c.badgeY},\n` +
    "  sockets: [\n" +
    sockets +
    "\n  ],\n};"
  );
}

// ── 調整モードのオーバーレイ ──
let editorOverlay = null;
function getEditorBox() {
  return editorOverlay?.querySelector(".rank-showcase");
}

export function openRankShowcaseEditor() {
  if (editorOverlay) return;
  const overlay = document.createElement("div");
  overlay.id = "rank-showcase-editor";
  editorOverlay = overlay;

  // ツールバー
  const bar = document.createElement("div");
  bar.className = "rank-showcase-editor-bar";
  const title = document.createElement("span");
  title.textContent = "🏅 ランクバッジ・ゲージ調整モード（バッジ／宝石をドラッグで移動）";
  bar.appendChild(title);

  // サイズ調整の＋/−ボタン（ホイールが使えない/使いにくい環境向け。ユーザー要望
  // 「バッジをゲージに対してもう少し大きくしたい。調整できるように」2026-08-16）。
  const sizeCtl = (label, which) => {
    const grp = document.createElement("span");
    grp.className = "rank-showcase-size-ctl";
    const lbl = document.createElement("span");
    lbl.textContent = label;
    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "−";
    minus.addEventListener("click", () => resizeShowcase(getEditorBox(), which, -1));
    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "＋";
    plus.addEventListener("click", () => resizeShowcase(getEditorBox(), which, +1));
    grp.append(lbl, minus, plus);
    return grp;
  };
  bar.appendChild(sizeCtl("バッジ", "badge"));
  bar.appendChild(sizeCtl("ゲージ", "gauge"));
  bar.appendChild(sizeCtl("宝石", "gem"));

  const outBtn = document.createElement("button");
  outBtn.type = "button";
  outBtn.textContent = "座標を出力";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "閉じる";
  closeBtn.addEventListener("click", closeRankShowcaseEditor);
  bar.appendChild(outBtn);
  bar.appendChild(closeBtn);
  overlay.appendChild(bar);

  // 出力欄
  const out = document.createElement("textarea");
  out.className = "rank-showcase-editor-out";
  out.readOnly = true;
  out.style.display = "none";
  outBtn.addEventListener("click", () => {
    out.value = getRankShowcaseOutput();
    out.style.display = "block";
    out.select();
    try {
      navigator.clipboard?.writeText(out.value);
    } catch {}
  });
  overlay.appendChild(out);

  // 合成表示（レジェンド＝全7宝石点灯で全部見える状態にして調整しやすく）
  const stage = document.createElement("div");
  stage.className = "rank-showcase-editor-stage";
  const showcase = buildRankShowcase(6, 7, 0, {
    animated: false,
    editable: true,
    onChange: () => {},
  });
  stage.appendChild(showcase);
  overlay.appendChild(stage);

  document.body.appendChild(overlay);
}

export function closeRankShowcaseEditor() {
  editorOverlay?.remove();
  editorOverlay = null;
}
