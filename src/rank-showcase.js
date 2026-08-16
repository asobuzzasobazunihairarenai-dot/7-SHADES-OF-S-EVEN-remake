// ランク称号バッジ＋U型七色ゲージ＋宝石を合成した「ヒーロー表示」の共通部品と、その位置・
// サイズ関係を実際に見ながら調整する編集モード（ユーザー要望2026-08-16「管理者モードに
// ランクバッジ・ランクゲージ・ランクジェムの位置サイズ調整モードを追加。押すと実際に出てきて
// 調整できる方が良いよね？」）。中立宝石は使わない（ユーザー確認済み）。
//
// 調整結果は下の RANK_SHOWCASE（bake対象のJSリテラル）へ焼き込む運用（profile-layout-editorや
// admin.jsのCSS変数調整と同じ思想）。編集モードでドラッグ移動／ホイールでサイズ変更し、
// 「座標を出力」で得たリテラルを開発者に渡す。

import { buildRankBadgeImage, rankGemPath, RANK_GAUGE_FRAME_U, RANK_GAUGE_BADGE_BG } from "./rank-badge.js";

// ★製作者が焼き込む「バッジ背景＋U型ゲージ＋宝石＋バッジ」の配置（ユーザーが調整モードで調整）。
// 枠は正方形1254×1254（U字は下側、バッジは中央）。badgeX/badgeY は枠中央からのオフセット（rem）。
export const RANK_SHOWCASE = {
  gaugeSize: 20, // 枠（正方形）の幅＝高さ（rem）。
  gemSize: 15, // 宝石の大きさ（枠幅に対する%）。ソケットにフィットさせる。
  badgeSize: 11, // 称号バッジの大きさ（rem）。中央の魔法陣内に収める。
  badgeX: 0, // バッジの水平オフセット（rem、＋で右）。枠中央基準。
  badgeY: 0, // バッジの垂直オフセット（rem、＋で下）。枠中央基準。
  bgSize: 100, // バッジ背景（魔法陣）の大きさ（枠幅に対する%）。既定100＝枠いっぱい。
  bgX: 0, // 背景の水平オフセット（rem、＋で右）。枠中央基準。
  bgY: 0, // 背景の垂直オフセット（rem、＋で下）。枠中央基準。
  sockets: [
    { x: 14, y: 39 },
    { x: 21, y: 55 },
    { x: 33.5, y: 68 },
    { x: 50, y: 70.5 },
    { x: 66.5, y: 68 },
    { x: 79, y: 55 },
    { x: 86, y: 39 },
  ],
};

function litCount(rank, gauge) {
  const r = Number.isFinite(rank) ? Math.round(rank) : 0;
  if (r >= 6) return 7; // レジェンドは満杯＝完成した冠
  return Math.max(0, Math.min(7, gauge ?? 0));
}

const FRAME_RATIO = 1; // 正方形（高さ/幅）

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
  const bg = box.querySelector(".rank-showcase-bg");
  if (bg) bg.style.width = `${cfg.bgSize}%`;
}

// バッジ上端が枠の上へはみ出す量（rem）。中央基準なので badge top = gaugeSize/2 + badgeY - badgeSize/2。
function badgeTopOverflowRem() {
  const cfg = RANK_SHOWCASE;
  const badgeTop = cfg.gaugeSize / 2 + cfg.badgeY - cfg.badgeSize / 2;
  return Math.max(0, -badgeTop);
}

// バッジ＋U型ゲージ＋宝石の合成ブロック。scale で全体を等倍縮小できる（ホーム/マイページの
// コンパクト表示用。バッジ・宝石・ゲージの関係を保ったまま小さくなる）。
// editable=true で編集モード（ドラッグ／ホイール）を配線し、onChange で変更を通知する。
// レイヤーは DOM順（後ろ→前）: バッジ背景 → U型ゲージ枠 → 宝石 → バッジ。
export function buildRankShowcase(rank, gauge, legendPoints, { animated = false, editable = false, onChange, scale = 1 } = {}) {
  const cfg = RANK_SHOWCASE;
  const box = document.createElement("div");
  box.className = "rank-showcase" + (editable ? " is-editable" : "");
  box.style.width = `${cfg.gaugeSize}rem`;
  box.style.setProperty("--rank-ugauge-gem", `${cfg.gemSize}%`);

  // バッジ背景（魔法陣、最背面）。既定は枠いっぱい（bgSize100・中央）だが、調整モードで
  // 大きさ・位置をずらせる（宝石・バッジと同じく枠中央基準）。
  const bg = document.createElement("img");
  bg.className = "rank-showcase-bg";
  bg.src = RANK_GAUGE_BADGE_BG;
  bg.alt = "";
  bg.draggable = false;
  bg.style.width = `${cfg.bgSize}%`;
  bg.style.left = `calc(50% + ${cfg.bgX}rem)`;
  bg.style.top = `calc(50% + ${cfg.bgY}rem)`;
  box.appendChild(bg);

  // U型ゲージ枠（枠いっぱい）。
  const frame = document.createElement("img");
  frame.className = "rank-showcase-frame";
  frame.src = RANK_GAUGE_FRAME_U;
  frame.alt = "";
  frame.draggable = false;
  box.appendChild(frame);

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
  badge.style.top = `calc(50% + ${cfg.badgeY}rem)`;
  box.appendChild(badge);

  if (editable) {
    wireShowcaseEditing(box, badge, gems, bg, onChange);
    return box;
  }

  // 等倍縮小表示（コンパクト表示）：footprintを縮小後サイズに合わせるためラッパーで包む。
  if (scale !== 1) {
    // バッジが枠の上へはみ出す分の高さをラッパー上部に確保しておくと、上に置くラベル
    // （「あなたのランク」等）がバッジと重ならない（どんな設定でも自動追従）。
    const overflowTopRem = badgeTopOverflowRem() * scale;
    const frameWRem = cfg.gaugeSize * scale;
    const frameHRem = cfg.gaugeSize * FRAME_RATIO * scale;
    const wrap = document.createElement("div");
    wrap.className = "rank-showcase-scale";
    wrap.style.width = `${frameWRem}rem`;
    wrap.style.height = `${frameHRem + overflowTopRem}rem`;
    box.style.position = "absolute";
    box.style.top = `${overflowTopRem}rem`; // 枠を下げてバッジの上端をラッパー上端に合わせる
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
  else if (which === "bg") cfg.bgSize = clamp(round1(cfg.bgSize + dir * 2), 20, 200);
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
function wireShowcaseEditing(box, badge, gems, bg, onChange) {
  const cfg = RANK_SHOWCASE;
  const notify = () => onChange?.();

  // ── ドラッグ移動（種別: "badge" / "bg" ＝rem中央基準、"gem" ＝枠に対する%）──
  function startDrag(target, e) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const kind = target === badge ? "badge" : target === bg ? "bg" : "gem";
    const gi = kind === "gem" ? Number(target.dataset.gemIndex) : -1;
    const s = stageScale();
    const frame = box.getBoundingClientRect();
    const base =
      kind === "badge"
        ? { x: cfg.badgeX, y: cfg.badgeY }
        : kind === "bg"
          ? { x: cfg.bgX, y: cfg.bgY }
          : { x: cfg.sockets[gi].x, y: cfg.sockets[gi].y };
    const move = (ev) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (kind === "badge") {
        // バッジ：rem（実画面px→ローカルpx→rem）
        cfg.badgeX = round1(base.x + dx / s / 16);
        cfg.badgeY = round1(base.y + dy / s / 16);
        badge.style.left = `calc(50% + ${cfg.badgeX}rem)`;
        badge.style.top = `calc(50% + ${cfg.badgeY}rem)`;
      } else if (kind === "bg") {
        // 背景：rem（バッジと同じ中央基準）
        cfg.bgX = round1(base.x + dx / s / 16);
        cfg.bgY = round1(base.y + dy / s / 16);
        bg.style.left = `calc(50% + ${cfg.bgX}rem)`;
        bg.style.top = `calc(50% + ${cfg.bgY}rem)`;
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
  // 背景は最背面＝空いた領域（宝石・バッジ以外）を掴んで移動できる。
  bg.addEventListener("pointerdown", (e) => startDrag(bg, e));

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
    `  bgSize: ${c.bgSize},\n` +
    `  bgX: ${c.bgX},\n` +
    `  bgY: ${c.bgY},\n` +
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
  title.textContent = "🏅 ランクバッジ・ゲージ調整モード（バッジ／宝石／背景をドラッグで移動）";
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
  bar.appendChild(sizeCtl("背景", "bg"));

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
