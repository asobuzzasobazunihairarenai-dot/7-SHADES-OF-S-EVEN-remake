// チュートリアルCPU戦の「インバトル・ヒント」＋演出UI（src/tutorial-battle.js の
// シナリオ・ドライバから使う）。
//  - ブロッキング説明: 中央/左端のコールアウト＋「次へ」「戻る」ボタン。盤面操作は止める。
//  - ノンブロッキング小ヒント: 画面下部の帯（pointer-events:none）。操作を止めない。
//  - スポットライト: 盤面全体を暗くし、強調対象のマス/駒/ロックエリアだけを「穴」で
//    明るく切り抜く（ユーザー要望「現状全体が暗い。対象にスポットライトを当てて」）。
//  - 吹き出し: 要素の近くに「自分の駒」等のラベル。
//  - 警告: 「そこへは移動できません」等の一時表示。
//  - 「↻ チュートリアルをはじめから」ボタン。
//
// 盤面要素の近くに固定配置する吹き出し・スポットライトの穴は、bodyに掛かるステージ
// transform（main.jsのSTAGE_WIDTH×STAGE_HEIGHT仮想解像度）を考慮する必要があるため、
// main.jsからstageClientToLocal/stageDeltaを注入してもらう。

let stageClientToLocalFn = null;
let stageDeltaFn = null;
let stageWidth = 1600;
let stageHeight = 900;
export function registerTutorialBattleUiHelpers({ stageClientToLocal, stageDelta, stageWidth: w, stageHeight: h }) {
  stageClientToLocalFn = stageClientToLocal;
  stageDeltaFn = stageDelta;
  if (w) stageWidth = w;
  if (h) stageHeight = h;
}

let stylesInjected = false;
let scrimEl = null;
let spotlightEl = null;
let calloutEl = null;
let calloutTitleEl = null;
let calloutBodyEl = null;
let calloutBackEl = null;
let calloutButtonEl = null;
let tipEl = null;
let warningEl = null;
let restartBtnEl = null;
let quitBtnEl = null;
let bubbleLayerEl = null;

let highlightedEls = [];

const STYLE = `
#tutorial-battle-scrim {
  position: fixed; inset: 0; z-index: 40000; display: none;
  background: rgba(4, 8, 14, 0.55);
}
/* スポットライト（暗幕＋穴）。SVGマスクで対象だけ切り抜く。純粋に見た目用（操作は透過）。 */
#tutorial-battle-spotlight { position: fixed; inset: 0; z-index: 40001; display: none; pointer-events: none; }
#tutorial-battle-spotlight svg { position: absolute; inset: 0; width: 100%; height: 100%; }
#tutorial-battle-callout {
  position: fixed; z-index: 40010; display: none;
  width: min(26rem, 44vw); max-height: 80vh; overflow-y: auto;
  background: linear-gradient(160deg, rgba(23, 32, 46, 0.98), rgba(15, 23, 32, 0.98));
  border: 1px solid rgba(148, 163, 184, 0.45);
  border-radius: 0.8rem; padding: 1.2rem 1.3rem 1rem;
  box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.55);
  color: #e2e8f0; font-family: sans-serif;
}
#tutorial-battle-callout.tb-pos-center { left: 50%; top: 50%; transform: translate(-50%, -50%); }
#tutorial-battle-callout.tb-pos-left { left: 2rem; top: 50%; right: auto; transform: translateY(-50%); }
#tutorial-battle-callout .tb-callout-title {
  font-size: 1.12rem; font-weight: 700; margin-bottom: 0.7rem; color: #fbbf24;
  display: flex; align-items: center; gap: 0.45rem;
}
#tutorial-battle-callout .tb-callout-title img { width: 1.9rem; height: 1.9rem; flex: 0 0 auto; }
#tutorial-battle-callout .tb-callout-body p { margin: 0 0 0.6rem 0; line-height: 1.7; font-size: 0.9rem; }
#tutorial-battle-callout .tb-callout-body p.tb-note { font-size: 0.8rem; color: #94a3b8; }
#tutorial-battle-callout .tb-callout-body .tb-body-bullets {
  margin: 0 0 0.6rem 0; padding-left: 1.2rem; line-height: 1.7; font-size: 0.9rem;
}
#tutorial-battle-callout .tb-callout-body .tb-body-bullets li { margin-bottom: 0.35rem; }
#tutorial-battle-callout .tb-callout-body .tb-body-image {
  display: block; margin: 0.4rem auto 0.7rem; width: 6.5rem; height: 6.5rem;
  border-radius: 0.6rem; background: rgba(0,0,0,0.25); padding: 0.4rem; box-sizing: border-box;
}
/* 到達したカードの拡大表示（カード比率＝縦長）。ユーザー要望「カードの拡大が小さい」。
   ただしモーダルがスクロールしない範囲に収める（縦を取りすぎない）。 */
#tutorial-battle-callout .tb-callout-body .tb-body-card {
  display: block; margin: 0.3rem auto 0.8rem; width: 12rem; max-width: 80%; height: auto;
  border-radius: 0.6rem; box-shadow: 0 0.5rem 1.5rem rgba(0,0,0,0.55);
  animation: tb-card-pop 0.35s ease-out;
}
/* #4: ホバー／長押しで出すカード拡大ポップアップ。チュートリアルのモーダル(spotlight z:40001)より
   前面・画面中央・クリック透過。縦長カード比率のまま高さを画面に合わせて大きく見せる。 */
.tb-body-card-zoom {
  position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
  height: min(80vh, 34rem); width: auto; max-width: 92vw;
  border-radius: 0.8rem; box-shadow: 0 1rem 3rem rgba(0,0,0,0.7);
  z-index: 100300; pointer-events: none;
  animation: tb-card-pop 0.18s ease-out;
}
/* アイコン＋説明文の横並び（到達効果アイコンの拡大図を文の左に置く）。 */
#tutorial-battle-callout .tb-callout-body .tb-body-icontext {
  display: flex; align-items: center; gap: 0.7rem; margin: 0.2rem 0 0.6rem;
}
#tutorial-battle-callout .tb-callout-body .tb-body-icontext img {
  width: 4.5rem; height: 4.5rem; flex: 0 0 auto;
  border-radius: 0.5rem; background: rgba(0,0,0,0.25); padding: 0.35rem; box-sizing: border-box;
}
#tutorial-battle-callout .tb-callout-body .tb-body-icontext span { font-size: 0.9rem; line-height: 1.6; }
@keyframes tb-card-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
#tutorial-battle-callout .tb-callout-buttons { display: flex; justify-content: space-between; align-items: center; margin-top: 0.8rem; gap: 0.5rem; }
#tutorial-battle-callout .tb-callout-back {
  padding: 0.45rem 0.9rem; border: 1px solid rgba(148,163,184,0.5); border-radius: 0.5rem; cursor: pointer;
  font-family: sans-serif; font-size: 0.85rem; background: rgba(15,23,32,0.6); color: #cbd5e1;
}
#tutorial-battle-callout .tb-callout-back:hover { filter: brightness(1.15); }
#tutorial-battle-callout .tb-callout-next {
  padding: 0.5rem 1.2rem; border: none; border-radius: 0.5rem; cursor: pointer; margin-left: auto;
  font-family: sans-serif; font-size: 0.9rem; font-weight: 700;
  background: linear-gradient(160deg, #f59e0b, #d97706); color: #1f2937;
}
#tutorial-battle-callout .tb-callout-next:hover { filter: brightness(1.08); }
#tutorial-battle-tip {
  position: fixed; left: 50%; bottom: 8.5rem; transform: translateX(-50%);
  z-index: 40012; display: none; pointer-events: none; max-width: min(34rem, 90vw);
  background: rgba(15, 23, 32, 0.94); border: 1px solid rgba(251, 191, 36, 0.65);
  border-radius: 0.6rem; padding: 0.6rem 1rem;
  color: #fde68a; font-family: sans-serif; font-size: 0.92rem; line-height: 1.5;
  text-align: center; box-shadow: 0 0.4rem 1.4rem rgba(0, 0, 0, 0.5);
}
#tutorial-battle-warning {
  position: fixed; left: 50%; top: 30%; transform: translateX(-50%);
  z-index: 40015; display: none; pointer-events: none;
  background: rgba(127, 29, 29, 0.96); border: 1px solid rgba(248, 113, 113, 0.8);
  border-radius: 0.6rem; padding: 0.6rem 1.1rem;
  color: #fecaca; font-family: sans-serif; font-size: 0.95rem; font-weight: 700;
  box-shadow: 0 0.4rem 1.4rem rgba(0, 0, 0, 0.5);
}
#tutorial-battle-warning.tb-show { display: block; animation: tb-warning-pop 0.25s ease-out; }
@keyframes tb-warning-pop { from { transform: translateX(-50%) scale(0.8); opacity: 0; } to { transform: translateX(-50%) scale(1); opacity: 1; } }
/* チュートリアルを完全に終了してホームへ戻るボタン（ユーザー要望「左上に終了ボタンを
   新設」）。はじめから(restart)ボタンの上に積み、終了＝赤系で区別する。 */
#tutorial-battle-quit {
  position: fixed; left: 1rem; top: 0.6rem; z-index: 40013; display: none;
  padding: 0.35rem 0.7rem; border: 1px solid rgba(248, 113, 113, 0.6); border-radius: 0.4rem;
  background: rgba(69, 10, 10, 0.85); color: #fecaca; cursor: pointer;
  font-family: sans-serif; font-size: 0.75rem;
}
#tutorial-battle-quit:hover { filter: brightness(1.15); }
/* 終了ボタンを上に置いた分、はじめからボタンはその下へ（重ならないよう間隔を確保）。 */
#tutorial-battle-restart {
  position: fixed; left: 1rem; top: 2.9rem; z-index: 40013; display: none;
  padding: 0.35rem 0.7rem; border: 1px solid rgba(148, 163, 184, 0.5); border-radius: 0.4rem;
  background: rgba(15, 23, 32, 0.85); color: #e2e8f0; cursor: pointer;
  font-family: sans-serif; font-size: 0.75rem;
}
#tutorial-battle-restart:hover { filter: brightness(1.12); }
#tutorial-battle-bubbles { position: fixed; inset: 0; z-index: 40011; pointer-events: none; }
#tutorial-battle-bubbles .tb-bubble {
  position: absolute; transform: translate(-50%, -100%);
  background: #fbbf24; color: #1f2937; font-family: sans-serif; font-size: 0.82rem; font-weight: 700;
  padding: 0.25rem 0.6rem; border-radius: 0.5rem; white-space: nowrap;
  box-shadow: 0 0.3rem 0.9rem rgba(0, 0, 0, 0.45);
}
#tutorial-battle-bubbles .tb-bubble::after {
  content: ""; position: absolute; left: 50%; top: 100%; transform: translateX(-50%);
  border: 0.35rem solid transparent; border-top-color: #fbbf24;
}
/* スポットライトの穴の中で、対象をさらに点滅で強調する外枠（outlineは競合しにくい）。 */
.tb-hl { animation: tb-hl-blink 1.05s ease-in-out infinite; outline: 0.22rem solid rgba(56, 189, 248, 0.95); outline-offset: -0.1rem; border-radius: 0.2rem; }
.tb-hl-strong { animation: tb-hl-blink-strong 0.85s ease-in-out infinite; outline: 0.28rem solid rgba(251, 191, 36, 1); outline-offset: -0.05rem; }
@keyframes tb-hl-blink { 0%,100% { outline-color: rgba(56,189,248,0.3); } 50% { outline-color: rgba(56,189,248,0.95); } }
@keyframes tb-hl-blink-strong { 0%,100% { outline-color: rgba(251,191,36,0.4); } 50% { outline-color: rgba(251,191,36,1); } }
`;

function ensureUi() {
  if (!stylesInjected) {
    const style = document.createElement("style");
    style.id = "tutorial-battle-styles";
    style.textContent = STYLE;
    document.head.appendChild(style);
    stylesInjected = true;
  }
  if (scrimEl) return;

  scrimEl = document.createElement("div");
  scrimEl.id = "tutorial-battle-scrim";
  document.body.appendChild(scrimEl);

  spotlightEl = document.createElement("div");
  spotlightEl.id = "tutorial-battle-spotlight";
  document.body.appendChild(spotlightEl);

  bubbleLayerEl = document.createElement("div");
  bubbleLayerEl.id = "tutorial-battle-bubbles";
  document.body.appendChild(bubbleLayerEl);

  calloutEl = document.createElement("div");
  calloutEl.id = "tutorial-battle-callout";
  calloutTitleEl = document.createElement("div");
  calloutTitleEl.className = "tb-callout-title";
  calloutBodyEl = document.createElement("div");
  calloutBodyEl.className = "tb-callout-body";
  const buttonRow = document.createElement("div");
  buttonRow.className = "tb-callout-buttons";
  calloutBackEl = document.createElement("button");
  calloutBackEl.type = "button";
  calloutBackEl.className = "tb-callout-back";
  calloutBackEl.textContent = "← 戻る";
  calloutButtonEl = document.createElement("button");
  calloutButtonEl.type = "button";
  calloutButtonEl.className = "tb-callout-next";
  buttonRow.appendChild(calloutBackEl);
  buttonRow.appendChild(calloutButtonEl);
  calloutEl.appendChild(calloutTitleEl);
  calloutEl.appendChild(calloutBodyEl);
  calloutEl.appendChild(buttonRow);
  document.body.appendChild(calloutEl);

  tipEl = document.createElement("div");
  tipEl.id = "tutorial-battle-tip";
  document.body.appendChild(tipEl);

  warningEl = document.createElement("div");
  warningEl.id = "tutorial-battle-warning";
  document.body.appendChild(warningEl);

  quitBtnEl = document.createElement("button");
  quitBtnEl.type = "button";
  quitBtnEl.id = "tutorial-battle-quit";
  quitBtnEl.textContent = "× チュートリアルを終了する";
  document.body.appendChild(quitBtnEl);

  restartBtnEl = document.createElement("button");
  restartBtnEl.type = "button";
  restartBtnEl.id = "tutorial-battle-restart";
  restartBtnEl.textContent = "↻ チュートリアルをはじめから";
  document.body.appendChild(restartBtnEl);
}

// ブロッキング説明を表示。body は段落の配列（文字列 / {text,note} / {image}）。
// position: "center" | "left"（省略時 "left"）。icon: タイトル横の小アイコン。
// showBack/onBack: 「戻る」ボタンの表示と押下時コールバック。
export function showBlockingHint({ title, body = [], buttonLabel = "次へ", onNext, position = "left", icon = null, showBack = false, onBack = null }) {
  ensureUi();
  hideTip();
  calloutTitleEl.innerHTML = "";
  if (icon) {
    const img = document.createElement("img");
    img.src = icon;
    img.alt = "";
    calloutTitleEl.appendChild(img);
  }
  calloutTitleEl.appendChild(document.createTextNode(title ?? ""));
  calloutBodyEl.innerHTML = "";
  for (const paragraph of body) {
    if (typeof paragraph === "string") {
      const p = document.createElement("p");
      p.textContent = paragraph;
      calloutBodyEl.appendChild(p);
    } else if (paragraph.image) {
      const img = document.createElement("img");
      img.className = "tb-body-image";
      img.src = paragraph.image;
      img.alt = "";
      calloutBodyEl.appendChild(img);
    } else if (paragraph.cardImage) {
      // 実物のカードを大きく見せる（到達したカードの拡大表示）。カードは縦長のため
      // .tb-body-imageの正方形ではなくカード比率の専用クラスにする。
      const img = document.createElement("img");
      img.className = "tb-body-card";
      img.src = paragraph.cardImage;
      img.alt = "";
      // #4（ユーザー要望2026-08-14）: ホバー（PC）／長押し（モバイル）でカードをさらに大きく
      // 画面中央に拡大表示する。モーダル(spotlight z:40001)より前面(z:100300)・クリック透過。
      img.style.cursor = "zoom-in";
      img.title = "ホバー／長押しで拡大";
      const showZoom = () => {
        document.querySelectorAll(".tb-body-card-zoom").forEach((el) => el.remove());
        const z = document.createElement("img");
        z.className = "tb-body-card-zoom";
        z.src = paragraph.cardImage;
        z.alt = "";
        document.body.appendChild(z);
      };
      const hideZoom = () => document.querySelectorAll(".tb-body-card-zoom").forEach((el) => el.remove());
      img.addEventListener("mouseenter", showZoom);
      img.addEventListener("mouseleave", hideZoom);
      img.addEventListener("touchstart", (e) => { e.preventDefault(); showZoom(); }, { passive: false });
      img.addEventListener("touchend", hideZoom);
      img.addEventListener("touchcancel", hideZoom);
      calloutBodyEl.appendChild(img);
    } else if (paragraph.iconText) {
      // アイコンと説明文を横並びにする（縦に積むとスクロールが必要になる対策。
      // ユーザー要望「到達効果アイコンの横に文章を持ってくる」）。
      const row = document.createElement("div");
      row.className = "tb-body-icontext";
      const img = document.createElement("img");
      img.src = paragraph.iconText.image;
      img.alt = "";
      const span = document.createElement("span");
      span.textContent = paragraph.iconText.text;
      row.appendChild(img);
      row.appendChild(span);
      calloutBodyEl.appendChild(row);
    } else if (paragraph.bullets) {
      // 箇条書き（フェイズの説明など、並列の項目を分かりやすく）。
      const ul = document.createElement("ul");
      ul.className = "tb-body-bullets";
      for (const item of paragraph.bullets) {
        const li = document.createElement("li");
        li.textContent = item;
        ul.appendChild(li);
      }
      calloutBodyEl.appendChild(ul);
    } else {
      const p = document.createElement("p");
      p.textContent = paragraph.text;
      if (paragraph.note) p.className = "tb-note";
      calloutBodyEl.appendChild(p);
    }
  }
  calloutButtonEl.textContent = buttonLabel;
  calloutButtonEl.onclick = () => {
    if (onNext) onNext();
  };
  calloutBackEl.style.display = showBack ? "" : "none";
  calloutBackEl.onclick = () => {
    if (onBack) onBack();
  };
  calloutEl.classList.remove("tb-pos-center", "tb-pos-left");
  calloutEl.classList.add(position === "center" ? "tb-pos-center" : "tb-pos-left");
  scrimEl.style.display = "block";
  calloutEl.style.display = "block";
}

export function hideBlockingHint() {
  if (scrimEl) scrimEl.style.display = "none";
  if (calloutEl) calloutEl.style.display = "none";
}

export function showTip(text) {
  ensureUi();
  tipEl.innerHTML = "";
  const arrow = document.createElement("span");
  arrow.textContent = "👉 ";
  const span = document.createElement("span");
  span.textContent = text;
  tipEl.appendChild(arrow);
  tipEl.appendChild(span);
  tipEl.style.display = "block";
}

export function hideTip() {
  if (tipEl) tipEl.style.display = "none";
}

// 対象要素の実画面矩形を、ステージのローカル座標へ変換して返す（無ければnull）。
function stageRectOf(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  if (stageClientToLocalFn && stageDeltaFn) {
    const tl = stageClientToLocalFn(rect.left, rect.top);
    return { x: tl.x, y: tl.y, w: stageDeltaFn(rect.width), h: stageDeltaFn(rect.height) };
  }
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

// 盤面要素の点滅ハイライト＋スポットライト（穴あき暗幕）。targets: [{ selector, strong }]。
// render()で盤面DOMが作り直されるため、状態変化のたびに再適用する。
export function setHighlights(targets = []) {
  ensureUi();
  clearHighlights();
  const rects = [];
  for (const { selector, strong } of targets) {
    for (const el of document.querySelectorAll(selector)) {
      el.classList.add(strong ? "tb-hl-strong" : "tb-hl");
      highlightedEls.push(el);
      const r = stageRectOf(el);
      if (r) rects.push(r);
    }
  }
  if (rects.length > 0) {
    buildSpotlight(rects);
    // スポットライトが暗幕を担うので、クリック遮断用のscrimは透明にする。
    if (scrimEl) scrimEl.style.background = "transparent";
  } else {
    clearSpotlight();
    if (scrimEl) scrimEl.style.background = "rgba(4, 8, 14, 0.55)";
  }
}

function buildSpotlight(rects) {
  const pad = 8;
  const holes = rects
    .map((r) => `<rect x="${r.x - pad}" y="${r.y - pad}" width="${r.w + pad * 2}" height="${r.h + pad * 2}" rx="10" ry="10" fill="black"/>`)
    .join("");
  spotlightEl.innerHTML = `
    <svg viewBox="0 0 ${stageWidth} ${stageHeight}" preserveAspectRatio="none">
      <defs><mask id="tb-spot-mask"><rect x="0" y="0" width="${stageWidth}" height="${stageHeight}" fill="white"/>${holes}</mask></defs>
      <rect x="0" y="0" width="${stageWidth}" height="${stageHeight}" fill="rgba(4,8,14,0.66)" mask="url(#tb-spot-mask)"/>
    </svg>`;
  spotlightEl.style.display = "block";
}

function clearSpotlight() {
  if (spotlightEl) {
    spotlightEl.style.display = "none";
    spotlightEl.innerHTML = "";
  }
}

export function clearHighlights() {
  for (const el of highlightedEls) el.classList.remove("tb-hl", "tb-hl-strong");
  highlightedEls = [];
  clearSpotlight();
}

// 吹き出しラベル。targets: [{ selector, text }]。要素の上端中央に固定配置する。
export function setBubbles(targets = []) {
  ensureUi();
  bubbleLayerEl.innerHTML = "";
  for (const { selector, text } of targets) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const r = stageRectOf(el);
    if (!r) continue;
    const bubble = document.createElement("div");
    bubble.className = "tb-bubble";
    bubble.textContent = text;
    bubble.style.left = `${r.x + r.w / 2}px`;
    bubble.style.top = `${r.y - 6}px`;
    bubbleLayerEl.appendChild(bubble);
  }
}

export function clearBubbles() {
  if (bubbleLayerEl) bubbleLayerEl.innerHTML = "";
}

let warningTimer = null;
export function flashWarning(text, ms = 1800) {
  ensureUi();
  warningEl.textContent = text;
  warningEl.classList.remove("tb-show");
  void warningEl.offsetWidth;
  warningEl.classList.add("tb-show");
  clearTimeout(warningTimer);
  warningTimer = setTimeout(() => warningEl.classList.remove("tb-show"), ms);
}

export function showRestartButton(onRestart) {
  ensureUi();
  restartBtnEl.onclick = () => {
    if (onRestart) onRestart();
  };
  restartBtnEl.style.display = "block";
}
export function hideRestartButton() {
  if (restartBtnEl) restartBtnEl.style.display = "none";
}

export function showQuitButton(onQuit) {
  ensureUi();
  quitBtnEl.onclick = () => {
    if (onQuit) onQuit();
  };
  quitBtnEl.style.display = "block";
}
export function hideQuitButton() {
  if (quitBtnEl) quitBtnEl.style.display = "none";
}

export function teardownTutorialBattleUi() {
  hideBlockingHint();
  hideTip();
  clearHighlights();
  clearBubbles();
  clearTimeout(warningTimer);
  scrimEl?.remove();
  spotlightEl?.remove();
  calloutEl?.remove();
  tipEl?.remove();
  warningEl?.remove();
  restartBtnEl?.remove();
  quitBtnEl?.remove();
  bubbleLayerEl?.remove();
  scrimEl = spotlightEl = calloutEl = tipEl = warningEl = restartBtnEl = quitBtnEl = bubbleLayerEl = null;
  calloutTitleEl = calloutBodyEl = calloutBackEl = calloutButtonEl = null;
}
