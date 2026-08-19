// UI/DOMの不変条件チェッカー（続き229、ユーザー相談2026-08-19）。
// game-invariants.js は「状態(state)」を見るが、こちらは「実際のDOM」を見る読み取り専用の検査。
// 状態は正しいのに“見た目・操作”が壊れる系のバグ——特に過去いちばん再発が多かった
// 「オーバーレイ/z-index系（透明な幽霊が click を奪う・閉じ残りモーダルが盤面を覆う・
// ボタンが背面に隠れて押せない）」——を、スモークテスト中にDOMから自動検知するための第一歩。
//
// 実プレイには一切影響しない: DOMも状態も一切変更しない純粋な検査で、スモークテスト中だけ呼ばれる。
// 依存ゼロの葉モジュール（何もimportしない）にして、in-app（smoke-test-runner.js）と
// Node版ヘッドレス（test/smoke.mjs の page.evaluate 内）の両方から使える。

// 一覧表示用のメタ（code＝下の add(code,...) と対応、label/desc＝人間向け）。状態側の
// INVARIANT_DEFS（game-invariants.js）と対になる、UI/DOM側の一覧の単一の情報源。
export const UI_INVARIANT_DEFS = [
  {
    code: "blocking-overlay",
    label: "幽霊オーバーレイなし",
    desc: "盤面中央を覆う全画面の“操作を奪う”レイヤーが無い（透明な捕獲層／閉じ残りモーダル。中央のモーダルは対象外＝正しく上に出ていれば検知されない）",
  },
  {
    code: "button-blocked",
    label: "常設ボタンが押せる（背面に隠れていない）",
    desc: "右上のオプション/ヘルプ/ランキング/マイページ等・右下のドロー/ターン終了等の常設操作ボタンが、表示中なら実際にヒットテストで到達可能（幽霊/閉じ残りに覆われて押せなくなっていない）。※モーダルが正しく開いている間は覆われて当然なので、この検査は能動テスト（clean状態）専用でスモークのポーリングでは呼ばない",
  },
];

// 「常設の操作ボタン」（表示中なら必ずクリックできるべきもの）のセレクタ一覧。過去に「透明な
// 幽霊／閉じ残りオーバーレイがクリックを奪う」「ボタンが背面に隠れて押せない」（#1/#134/#194 等）が
// 繰り返し出た対象。いずれも body 直下の position:fixed（3D盤面の外）なので getBoundingClientRect＋
// elementFromPoint が実ビューポート座標で一貫し、ヒットテストが安定する。
const KEY_CONTROL_SELECTORS = [
  "#options-menu-button", // 右上：オプション
  "#help-button", // 右上：ヘルプ
  "#ranking-page-button", // 右上：ランキング
  "#my-page-button", // 右上：マイページ
  "#currency-display", // 右上：所持金
  "#discord-link-button", // 右上：Discord
  "#fullscreen-toggle-button", // 右上：全画面
  "#board-view-toggle-button", // 右上：2D/3D切替
  "#self-status-bug-report", // 不具合報告
  "#end-turn-button", // 右下：ターン終了
  "#board-zoom-button", // 右下：盤面拡大
  "#hand-shuffle-button", // 右下：手札シャッフル
  "#draw-button", // 右下：1枚ドロー
  "#public-draw-button", // 右下：公開ドロー
];

// 要素が「見えていて操作可能」か（display:none/visibility:hidden/opacity:0/pointer-events:none/
// サイズ0 は対象外＝そもそも押せない・押す想定でないので検査しない）。
function isReachableCandidate(el) {
  if (!el) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") return false;
  if (parseFloat(cs.opacity || "1") < 0.05) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 3 || r.height < 3) return false;
  // 画面外は検査しない（見えていないので押す対象でない）。
  if (r.right <= 0 || r.bottom <= 0 || r.left >= window.innerWidth || r.top >= window.innerHeight) return false;
  return true;
}

// el（またはボタンの子孫）が hit にヒットしているか。ボタン内のラベル/アイコン/ツールチップ等の
// 子要素が返ってきても「そのボタンに届いている」とみなす。
function hitsButton(button, hit) {
  return !!hit && (hit === button || button.contains(hit) || (hit.closest && hit.closest("#" + button.id) === button));
}

// 常設ボタンの到達性を能動チェックする（読み取り専用・副作用なし）。表示中の各ボタンについて、
// 矩形内の複数点（中央＋四隅の内側）で elementFromPoint し、1点でもそのボタン/子孫に届けば
// 「押せる」。どの点も別要素に奪われていれば「背面に隠れて押せない」＝違反として報告する。
// ※スモークのポーリング（自己対戦中）では呼ばない——モーダルが正しく開いている間はボタンが
//   覆われて当然（誤検知になる）。clean状態での能動テスト（smoke panel のボタン／Node の --buttons）専用。
export function checkButtonReachability() {
  const v = [];
  if (typeof document === "undefined" || !document.body || typeof window === "undefined") return v;
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return v;

  for (const sel of KEY_CONTROL_SELECTORS) {
    const button = document.querySelector(sel);
    if (!button || !button.id) continue;
    if (!isReachableCandidate(button)) continue;
    const r = button.getBoundingClientRect();
    const inX = r.width * 0.25, inY = r.height * 0.25;
    const pts = [
      [r.left + r.width / 2, r.top + r.height / 2], // 中央
      [r.left + inX, r.top + inY],
      [r.right - inX, r.top + inY],
      [r.left + inX, r.bottom - inY],
      [r.right - inX, r.bottom - inY],
    ];
    let reachable = false;
    let coverAt = null;
    for (const [px, py] of pts) {
      if (px < 0 || py < 0 || px >= w || py >= h) continue;
      const hit = document.elementFromPoint(Math.round(px), Math.round(py));
      if (hitsButton(button, hit)) {
        reachable = true;
        break;
      }
      if (!coverAt) coverAt = hit;
    }
    if (!reachable) {
      const cs = coverAt ? getComputedStyle(coverAt) : null;
      v.push({
        code: "button-blocked",
        msg: `常設ボタン ${sel} が背面に隠れて押せません（${coverAt ? describeEl(coverAt) : "?"} が覆っている, z-index:${cs ? cs.zIndex : "?"}）`,
        detail: {
          button: sel,
          cover: coverAt ? describeEl(coverAt) : null,
          coverId: coverAt && coverAt.id ? coverAt.id : null,
          coverZ: cs ? cs.zIndex : null,
          coverTransparent: cs ? isVisuallyTransparent(cs) : null,
        },
      });
    }
  }
  return v;
}

// 要素を短く説明する（診断ログ用）。
function describeEl(el) {
  if (!el) return "?";
  if (el.id) return "#" + el.id;
  const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : "";
  return (el.tagName || "?").toLowerCase() + cls;
}

// cs.backgroundColor がほぼ透明（alpha≈0）かつ背景画像なし＝視覚的に透明（＝幽霊の可能性が高い）。
function isVisuallyTransparent(cs) {
  const bg = cs.backgroundColor || "";
  const noImage = !cs.backgroundImage || cs.backgroundImage === "none";
  // rgba(...,0) / transparent を透明とみなす。
  const m = bg.match(/rgba?\(([^)]+)\)/);
  let alpha = 1;
  if (bg === "transparent") alpha = 0;
  else if (m) {
    const parts = m[1].split(",").map((s) => s.trim());
    alpha = parts.length >= 4 ? parseFloat(parts[3]) : 1;
  }
  return noImage && alpha <= 0.02;
}

// el（またはその近い祖先）が「盤面を覆う大きな固定オーバーレイ」なら、その要素を返す。無ければ null。
// 判定: position:fixed かつ pointer-events が有効（＝クリックを奪う）かつ、矩形がビューポート中央を
// 覆い、面積がビューポートの45%以上。面積で見るのは、このアプリの body に stage 変形（scale＋
// letterbox）がかかっており position:fixed 要素の矩形＝“縮小されたステージ”になるため、幅/高さ単体の
// %だと letterbox で取りこぼす一方、面積なら「盤面を覆うバックドロップ(≈60〜90%)」と「中央の
// モーダルの箱(≈6〜15%)」がはっきり分かれるから（誤検知しにくい）。スモークパネルは対象外。
function fullscreenFixedOverlayAt(el, w, h, cx, cy) {
  const vpArea = w * h;
  let node = el;
  for (let i = 0; i < 5 && node && node !== document.body && node !== document.documentElement; i++) {
    // スモークテストのパネル自身は対象外（テストの道具であって盤面の妨げではない）。
    if (node.id === "smoke-test-panel" || (node.closest && node.closest("#smoke-test-panel"))) return null;
    const cs = getComputedStyle(node);
    if (cs.position === "fixed" && cs.pointerEvents !== "none") {
      const r = node.getBoundingClientRect();
      const coversCenter = r.left <= cx && r.right >= cx && r.top <= cy && r.bottom >= cy;
      if (coversCenter && r.width * r.height >= vpArea * 0.45) return node;
    }
    node = node.parentElement;
  }
  return null;
}

// DOMの不変条件を検査する（読み取り専用）。戻り値: [{ code, msg, detail }]（空＝違反なし）。
// document が無い環境（baseline計算時等）では空配列。
export function checkUiInvariants() {
  const v = [];
  if (typeof document === "undefined" || !document.body || typeof window === "undefined") return v;
  const w = window.innerWidth, h = window.innerHeight;
  if (!w || !h) return v;
  const cx = Math.round(w / 2), cy = Math.round(h / 2);

  // 幽霊/閉じ残りオーバーレイ検知:
  // 盤面中央（≒ビューポート中央）にヒットする最前面の要素が「全画面の固定オーバーレイ」なら、
  // その上に何も無い＝バックドロップ単体が中央を覆っている＝幽霊 or 閉じ残り。
  // 正しく開いている中央モーダルは、モーダル本体（小さい箱）が中央を覆うので elementFromPoint は
  // “モーダルの箱”を返す＝全画面ではない＝検知されない（誤検知しない設計）。
  const el = document.elementFromPoint(cx, cy);
  if (el) {
    const overlay = fullscreenFixedOverlayAt(el, w, h, cx, cy);
    if (overlay) {
      const cs = getComputedStyle(overlay);
      const transparent = isVisuallyTransparent(cs);
      v.push({
        code: "blocking-overlay",
        msg: `盤面中央を全画面オーバーレイが覆っています: ${describeEl(overlay)} (z-index:${cs.zIndex})${transparent ? "／透明＝幽霊の可能性大" : ""}`,
        detail: { el: describeEl(overlay), id: overlay.id || null, cls: (typeof overlay.className === "string" ? overlay.className : "") || null, z: cs.zIndex, transparent },
      });
    }
  }

  return v;
}
