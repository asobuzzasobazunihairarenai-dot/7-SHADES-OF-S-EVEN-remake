// マイページのレイアウト編集モード（管理者専用・ユーザー要望）。保存はしない——管理者
// （製作者）がドラッグで移動・端のハンドルでリサイズして配置を決め、「テキスト出力」した
// 設定を製作者がこの PROFILE_LAYOUT へ焼き込む運用（admin.jsのCSS変数調整と同じ思想）。
//
// マイページ本体(renderMyPageBodyのコンテナ)の各「直下要素」を、コンテナ基準の絶対座標(px)
// ＋サイズ(px)で配置する。各要素には data-layout-key（明示が無ければ "auto-<index>"）を割り
// 当て、PROFILE_LAYOUT[key] があればその位置・サイズで固定する。
//
// 注意: マイページはbodyのステージtransform(scale)の内側にあるため、ドラッグ量(実画面px)は
// stageのscaleで割ってローカルpxへ直してから反映する。

// ★製作者が焼き込む配置（key -> {x,y,w,h}、単位px）。空なら従来どおり自然な縦並び。
export const PROFILE_LAYOUT = {};

const HANDLE_DIRS = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const MIN_SIZE = 24;

let editMode = false;
let rerenderFn = null;

export function registerProfileLayoutHelpers({ rerender } = {}) {
  rerenderFn = typeof rerender === "function" ? rerender : null;
}
export function isProfileLayoutEditMode() {
  return editMode;
}
export function setProfileLayoutEditMode(on) {
  editMode = !!on;
  rerenderFn?.(); // マイページを描き直してハンドル/ツールバーを反映
}

// bodyのステージscaleを読む（実画面px→ローカルpx換算用）。
function getStageScale() {
  const t = getComputedStyle(document.body).transform;
  const m = /matrix\(([^)]+)\)/.exec(t || "");
  if (m) {
    const a = parseFloat(m[1].split(",")[0]);
    if (a > 0) return a;
  }
  return 1;
}

// renderMyPageBody の後に呼ぶ。PROFILE_LAYOUT適用＋（編集モードなら）ドラッグ/リサイズ配線。
// レイアウト編集/焼き込み時の作業キャンバス幅（px）。マイページのカードは通常24rem固定で
// 狭く、右へ動かすと絶対配置要素が右端の“見えない壁”で潰れる（ユーザー報告）。編集/焼き込み
// 中はカードを広げ、要素にも実寸の固定幅を与えて潰れないようにする。焼き込み側もこの同じ幅で
// レイアウトされるので、全ユーザーで見た目が一致する。
const CANVAS_WIDTH_PX = 960;

export function applyProfileLayout(container) {
  if (!container) return;
  container.classList.toggle("profile-layout-editing", editMode);
  container.style.position = "relative";

  const layoutActive = editMode || Object.keys(PROFILE_LAYOUT).length > 0;
  // 作業キャンバスを広げる（カード＝container.parentElement を含めて）。
  const card = container.parentElement;
  if (layoutActive) {
    if (card) {
      card.style.width = `${CANVAS_WIDTH_PX}px`;
      card.style.maxWidth = "96vw";
    }
    container.style.width = "100%";
  } else {
    if (card) {
      card.style.width = "";
      card.style.maxWidth = "";
    }
    container.style.width = "";
  }

  const children = [...container.children].filter((el) => !el.classList.contains("profile-layout-toolbar"));
  const cr = container.getBoundingClientRect();
  const stageScale = getStageScale();
  // 絶対配置に変える前に、全要素の現在の位置・サイズをまとめて測る（1つずつ絶対化すると
  // 後続要素の測定がズレるため）。幅も実寸で取り込み、右へ動かしても潰れないようにする。
  const measured = children.map((el, i) => {
    const key = el.dataset.layoutKey || `auto-${i}`;
    el.dataset.layoutKey = key;
    const r = el.getBoundingClientRect();
    return {
      el,
      key,
      x: Math.round((r.left - cr.left) / stageScale + container.scrollLeft),
      y: Math.round((r.top - cr.top) / stageScale + container.scrollTop),
      w: Math.max(1, Math.round(r.width / stageScale)),
    };
  });

  let maxBottom = 0;
  for (const m of measured) {
    let cfg = PROFILE_LAYOUT[m.key];
    if (!cfg) {
      if (!editMode) continue; // 焼き込みも編集も無ければ自然流しのまま
      cfg = PROFILE_LAYOUT[m.key] = { x: m.x, y: m.y, w: m.w, scale: 1 }; // 編集開始時に現状を取り込む
    }
    if (typeof cfg.scale !== "number") cfg.scale = 1;
    if (typeof cfg.w !== "number") cfg.w = m.w;
    const el = m.el;
    el.style.position = "absolute";
    el.style.left = `${cfg.x}px`;
    el.style.top = `${cfg.y}px`;
    el.style.width = `${cfg.w}px`; // 実寸を固定＝右へ動かしても“壁”で潰れない
    el.style.margin = "0";
    el.style.boxSizing = "border-box";
    el.style.transformOrigin = "top left";
    // 高さは指定せず、中身の自然なサイズを scale で拡大縮小する（枠だけ大きくなって中身が
    // 変わらない問題への対応・ユーザー要望）。幅は固定だがscaleで一緒に拡大される。
    el.style.transform = `scale(${cfg.scale})`;
    maxBottom = Math.max(maxBottom, cfg.y + el.offsetHeight * cfg.scale);
    if (editMode) makeEditable(el, container);
  }
  if (layoutActive) {
    container.style.minHeight = `${maxBottom + 40}px`;
  }
  if (editMode) ensureToolbar(container);
}

function makeEditable(el) {
  if (el._layoutEditable) return;
  el._layoutEditable = true;
  el.classList.add("profile-layout-item");

  // 移動: ハンドル以外を掴んでドラッグ。
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (e.target.closest(".profile-layout-handle")) return;
    e.preventDefault();
    e.stopPropagation();
    const cfg = PROFILE_LAYOUT[el.dataset.layoutKey];
    if (!cfg) return;
    const scale = getStageScale();
    const sx = e.clientX;
    const sy = e.clientY;
    const ox = cfg.x;
    const oy = cfg.y;
    const move = (ev) => {
      cfg.x = Math.round(ox + (ev.clientX - sx) / scale);
      cfg.y = Math.round(oy + (ev.clientY - sy) / scale);
      el.style.left = `${cfg.x}px`;
      el.style.top = `${cfg.y}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  // リサイズ: 8方向のハンドル。
  for (const dir of HANDLE_DIRS) {
    const handle = document.createElement("div");
    handle.className = `profile-layout-handle handle-${dir}`;
    handle.addEventListener("pointerdown", (e) => startResize(e, el, dir));
    el.appendChild(handle);
  }
}

function startResize(e, el) {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const cfg = PROFILE_LAYOUT[el.dataset.layoutKey];
  if (!cfg) return;
  // 要素の左上（＝transform-originの拡大基準点）を固定点にし、そこからのポインタ距離の比で
  // 一様スケールする。これで枠だけでなく中身のアイコン・文字も一緒に拡大縮小される。
  const rect = el.getBoundingClientRect();
  const originX = rect.left;
  const originY = rect.top;
  const startDist = Math.max(8, Math.hypot(e.clientX - originX, e.clientY - originY));
  const origScale = cfg.scale || 1;
  const move = (ev) => {
    const curDist = Math.hypot(ev.clientX - originX, ev.clientY - originY);
    let next = origScale * (curDist / startDist);
    next = Math.min(6, Math.max(0.2, next));
    cfg.scale = Math.round(next * 100) / 100;
    el.style.transform = `scale(${cfg.scale})`;
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

function ensureToolbar(container) {
  if (container.querySelector(".profile-layout-toolbar")) return;
  const bar = document.createElement("div");
  bar.className = "profile-layout-toolbar";

  const label = document.createElement("span");
  label.textContent = "レイアウト編集中";
  bar.appendChild(label);

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.textContent = "テキスト出力";
  exportBtn.addEventListener("click", showExport);
  bar.appendChild(exportBtn);

  // 初期化（ユーザー要望）: 焼き込み配置を全て捨てて自然な既定レイアウトへ戻す。
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "初期化";
  resetBtn.addEventListener("click", resetLayout);
  bar.appendChild(resetBtn);

  container.appendChild(bar);
}

function resetLayout() {
  for (const k of Object.keys(PROFILE_LAYOUT)) delete PROFILE_LAYOUT[k];
  rerenderFn?.(); // 編集モード中なら自然位置を取り込み直して並べ直す
}

// 現在のPROFILE_LAYOUTを、そのままコードへ貼れるJSリテラルとして出す。
function buildExportText() {
  const lines = Object.keys(PROFILE_LAYOUT)
    .sort()
    .map((k) => {
      const c = PROFILE_LAYOUT[k];
      return `  ${JSON.stringify(k)}: { x: ${c.x}, y: ${c.y}, w: ${c.w ?? 0}, scale: ${c.scale ?? 1} },`;
    });
  return `export const PROFILE_LAYOUT = {\n${lines.join("\n")}\n};`;
}

function showExport() {
  const existing = document.getElementById("profile-layout-export");
  if (existing) existing.remove();
  const wrap = document.createElement("div");
  wrap.id = "profile-layout-export";
  const ta = document.createElement("textarea");
  ta.value = buildExportText();
  ta.readOnly = true;
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "閉じる";
  closeBtn.addEventListener("click", () => wrap.remove());
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "コピー";
  copyBtn.addEventListener("click", () => {
    ta.select();
    try {
      navigator.clipboard?.writeText(ta.value);
    } catch (err) {
      /* clipboard不可でも選択状態にはなる */
    }
  });
  wrap.appendChild(ta);
  const row = document.createElement("div");
  row.className = "profile-layout-export-row";
  row.appendChild(copyBtn);
  row.appendChild(closeBtn);
  wrap.appendChild(row);
  document.body.appendChild(wrap);
  ta.focus();
  ta.select();
}
