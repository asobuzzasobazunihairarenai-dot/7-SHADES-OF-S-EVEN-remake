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

// ★製作者が焼き込む配置（key -> {x,y,scale}、単位px）。空なら従来どおり自然な縦並び。
// ユーザー提供のエクスポートを焼き込み済み。avatar-bg（巨大半透明アバター）は新規追加のため
// 仮の初期値——編集モードで位置・大きさを調整し、再エクスポートして差し替えてください。
export const PROFILE_LAYOUT = {
  avatar: { x: -283, y: 7, scale: 6 },
  "avatar-bg": { x: -483, y: -206, scale: 4.5 },
  "avatar-change": { x: 174, y: 601, scale: 1.97 },
  cosmetics: { x: 418, y: 51, scale: 1.5 },
  name: { x: -268, y: 594, scale: 3.01 },
  // ランク表示（ranked-rank）は焼き込み漏れで従来の配置に無かった＝display:none解除後も
  // 自然流し（他要素は絶対配置で流れから外れている）で埋もれ「消えた」ように見えていた
  // （ユーザー報告2026-08-16）。焼き込むことで指定位置に絶対配置され表示される。
  "ranked-rank": { x: -451, y: -152, scale: 1 },
  stats: { x: 415, y: 255, scale: 1.88 },
};

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
  // 作業キャンバスを広げ、プロフィールを囲う枠（カードの背景・枠線）は消す（ユーザー要望
  // 「プロフィールを囲っている枠はもういらない」）。焼き込み側も同じ扱いで全ユーザー一致。
  const card = container.parentElement;
  // 全画面版(#profile-page)か、モーダル版(それ以外)かを判定する。全画面版はステージ全体を
  // 覆う器を持つ。
  const fullScreen = card && card.id === "profile-page-card" ? document.getElementById("profile-page") : null;
  if (layoutActive) {
    if (card) {
      card.style.width = `${CANVAS_WIDTH_PX}px`;
      card.style.maxWidth = "96vw";
      card.style.background = "none";
      card.style.border = "none";
      // ライトテーマの #profile-page-card は box-shadow を持つため、border/background を消しても
      // 透明な作業キャンバス(約960px)の周りにソフトな影が“白い枠”として残っていた（ユーザー報告
      // 2026-08-08）。枠を完全に消すため box-shadow も無効化する。
      card.style.boxShadow = "none";
      // ユーザー指摘「アプリは画面比率を固定しているので、見えない枠(クリップ)は不要。要素は
      // 左は戻るボタン・右はオプションアイコンのあたりまで、切れずに置けるようにしたい」。
      // カード(960pxのデザイン基準・中央寄せ)は座標の基準として残すが、はみ出しをクリップ
      // しない(overflow:visible)ことで、負のx(左)に置いた装飾アバターや右へ伸びる着せ替えが
      // カード端で切れず、固定ステージいっぱいまで見える。実際に切れるのは画面(ステージ)端のみ。
      // スクロール防止のクリップは、全画面版では外側の器(#profile-page＝ステージ全面)側で行う
      // （ステージ＝画面いっぱいなので内側では何も切れない）。モーダル版(小さい中央モーダル)は
      // 自身が器なので従来どおり自身でクリップする。編集モードは要素を掴めるようスクロール可。
      card.style.overflow = editMode ? "auto" : fullScreen ? "visible" : "hidden";
    }
    // 全画面版: スクロールは出さず、切れるのは画面端のみ（焼き込み時）。編集モードはドラッグで
    // 遠くの要素へ届くようスクロール可のまま。
    if (fullScreen) {
      fullScreen.style.overflow = editMode ? "auto" : "hidden";
    }
    container.style.width = "100%";
  } else {
    if (card) {
      card.style.width = "";
      card.style.maxWidth = "";
      card.style.background = "";
      card.style.border = "";
      card.style.boxShadow = "";
      card.style.overflow = "";
    }
    if (fullScreen) fullScreen.style.overflow = "";
    container.style.width = "";
  }

  const children = [...container.children].filter((el) => !el.classList.contains("profile-layout-toolbar"));
  const cr = container.getBoundingClientRect();
  const stageScale = getStageScale();
  // 絶対配置に変える前に、全要素の現在の位置をまとめて測る（1つずつ絶対化すると後続要素の
  // 測定がズレるため）。幅は取り込まず width:max-content にする——ユーザー報告「要素に対し枠が
  // 大きい」の原因は、フル幅(カード幅)を実寸として固定していたこと。max-contentなら枠が中身に
  // ぴったり付き、かつ位置に依存しないので右へ動かしても潰れない。
  const measured = children.map((el, i) => {
    const key = el.dataset.layoutKey || `auto-${i}`;
    el.dataset.layoutKey = key;
    const r = el.getBoundingClientRect();
    return {
      el,
      key,
      x: Math.round((r.left - cr.left) / stageScale + container.scrollLeft),
      y: Math.round((r.top - cr.top) / stageScale + container.scrollTop),
    };
  });

  let maxBottom = 0;
  let maxRight = 0;
  let minLeft = Infinity;
  let minTop = Infinity;
  const placed = [];
  for (const m of measured) {
    let cfg = PROFILE_LAYOUT[m.key];
    if (!cfg) {
      if (!editMode) continue; // 焼き込みも編集も無ければ自然流しのまま
      cfg = PROFILE_LAYOUT[m.key] = { x: m.x, y: m.y, scale: 1 }; // 編集開始時に現状を取り込む
    }
    if (typeof cfg.scale !== "number") cfg.scale = 1;
    const el = m.el;
    el.style.position = "absolute";
    el.style.left = `${cfg.x}px`;
    el.style.top = `${cfg.y}px`;
    el.style.width = "max-content"; // 中身にぴったりの枠（＋位置に依存せず潰れない）
    el.style.maxWidth = "100%";
    el.style.margin = "0";
    el.style.boxSizing = "border-box";
    el.style.transformOrigin = "top left";
    // 高さも指定せず、中身の自然なサイズを scale で一緒に拡大縮小する（枠だけ大きくなって
    // 中身が変わらない問題への対応・ユーザー要望）。
    el.style.transform = `scale(${cfg.scale})`;
    // ユーザー報告「マイページに見えない枠ができちゃってます」。大きくscaleした装飾アバター
    // （avatar・avatar-bg）は四角い当たり判定の透明な四隅が他要素の上に被さり、その範囲の
    // クリックを奪って「見えない枠」になっていた。焼き込み（非編集）表示ではこの2つの装飾を
    // クリック透過にする（変更は別ボタン avatar-change 側にあるのでアバター画像自体は
    // クリック不要）。編集モードでは掴んで動かすため透過しない。
    if (!editMode) {
      el.style.pointerEvents = m.key === "avatar" || m.key === "avatar-bg" ? "none" : "";
    } else {
      el.style.pointerEvents = "";
    }
    placed.push({ el, cfg, key: m.key });
    // 表示範囲（カードの大きさ／位置合わせ）の計算。巨大な背面アバター(avatar-bg、半透明の
    // 飾り)は「意図的にはみ出して背景いっぱいに広がる」要素なので範囲計算からは除外する
    // （含めると全体が大きくずれてしまう）。それ以外の要素（アバター本体・名前・着せ替え・
    // 戦績等）は左右上下すべての端を測り、全部が切れずに収まるようにする。
    if (m.key !== "avatar-bg") {
      maxBottom = Math.max(maxBottom, cfg.y + el.offsetHeight * cfg.scale);
      maxRight = Math.max(maxRight, cfg.x + el.offsetWidth * cfg.scale);
      minLeft = Math.min(minLeft, cfg.x);
      minTop = Math.min(minTop, cfg.y);
    }
    if (editMode) makeEditable(el, container);
  }
  if (layoutActive) {
    // カードはクリップしない（枠を撤去）ので、幅は960pxのデザイン基準のまま中央寄せで置き、
    // 高さだけ主要要素（背面アバターを除く）の下端に合わせておく（中央寄せ・レイアウトの基準）。
    // 背面アバターや着せ替えがこの基準の外へはみ出しても、画面（固定ステージ）端まで切れずに
    // 見える（外側の器 #profile-page 側でのみ画面端クリップ＝スクロール防止）。
    container.style.minHeight = `${maxBottom + 40}px`;
  }
  // 未使用になった計測値の参照だけ残さないよう明示（minLeft/minTop/maxRight/placedは
  // 将来また範囲計算が要る時のために計算自体は残してある）。
  void placed;
  void maxRight;
  void minLeft;
  void minTop;
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
    next = Math.min(20, Math.max(0.2, next)); // 上限を拡大（巨大半透明アバターをもっと大きくできるように）
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
      return `  ${JSON.stringify(k)}: { x: ${c.x}, y: ${c.y}, scale: ${c.scale ?? 1} },`;
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
