// 起動直後に表示するオープニング画面。ユーザー提供の背景画像(assets/opening.webp)が
// ゆっくりフェードインする単純なゲート。ゲーム本体は裏で従来通りすぐに初期化・描画されて
// いる（このモジュールは純粋な見た目の最前面オーバーレイであり、ゲームロジック自体には
// 一切関与しない）。
//
// 従来は「ローカル」「オンライン」の2択メニューだったが、オンライン対戦を主軸に据える
// ため、ログイン画面を主役にした構成に変更した（マジックリンクはもう主要な手段ではない
// ため後述の「その他のログイン方法」に格納し、ゲストログインを主ボタンにした）。
// 「ローカル」はこのオーバーレイを閉じるだけ（＝今までの初期画面がそのまま現れる、
// ローカルモードは元々デフォルトの起動状態のため特別な処理は不要）は引き続き
// 小さなリンクとして残してある。
//
// ログインカードは背景のタイトルロゴにいきなり重なって見えるとの指摘があったため、
// 起動直後は小さな「ログイン」ボタンだけを表示し、押した時だけカードを開く2段階構成に
// 変更した（カード自体にも右上の✕でボタン表示へ戻せる、開き直してもオーバーレイ全体は
// 閉じない）。

import { openOnlinePanel } from "./online-ui.js";
import { maybeShowTablet2dWarning } from "./tablet-2d-warning.js";
import {
  isOnlineAvailable,
  signInAnonymously,
  signInWithGoogle,
  signInWithMagicLink,
  getCurrentUser,
  signOut,
} from "./online.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { playOpeningBgm, stopOpeningBgm } from "./sound.js";

// フェードアウトのCSSトランジション時間と合わせる（style.cssの#opening-screen.is-closing、
// .opening-start-gate.is-closing参照）。
const CLOSE_TRANSITION_MS = 600;

// ユーザー要望「1画面で複数人が遊べるモードは、実際にはそういう遊び方をさせる予定が
// 無いので『テストモード』画面とし、ログインカードからは削除して右下に小さいボタンだけを
// 常時置きたい。押すとログインを求め、ログイン完了後は『オンラインで続ける』を挟まず
// そのまま盤面（今までの『ローカルでプレイ』と同じ画面）へ直接進む」への対応。
// Googleログイン・マジックリンクは成功するとページがまるごと再読み込みされて戻ってくる
// ため（initOpeningScreen()がもう一度最初から実行される）、in-memoryな変数では
// 「テストモード経由だった」という状態を覚えていられない。sessionStorageに一時保存し、
// このタブが閉じられるまで（あるいは実際にテストモードへ抜けた時点で）だけ持続させる。
const TEST_MODE_STORAGE_KEY = "so7-test-mode-login-pending";
// ハマりどころ（ユーザー報告「ログアウトしてGoogleでログインし直したら『オンラインで
// 続ける』が出なくなった」）: このフラグを「1」のような単純な真偽値として持たせ、
// 消費される（ログイン完了を検知する）まで無期限に残す実装だと、以前テストモードを
// 試した際に何らかの理由で消費されずに残ってしまった場合、ずっと後になって全く無関係に
// 行った通常のログインまで「テストモード経由だった」と誤認され、close()が呼ばれて
// オープニング画面ごと閉じてしまう（＝「オンラインで続ける」が一切出ない）——実際に
// sessionStorageへ直接「1」をセットしてページを再読み込みし、この症状を再現して
// 確認した。対策として、セットした時刻を持たせ、一定時間（Googleログイン/マジック
// リンクの往復に十分な時間だが、それより後の無関係な操作には影響しない程度の短さ）を
// 過ぎていたら自動的に無効扱いにする。
const TEST_MODE_REQUEST_MAX_AGE_MS = 3 * 60 * 1000;
function isTestModeRequested() {
  const raw = sessionStorage.getItem(TEST_MODE_STORAGE_KEY);
  if (!raw) return false;
  const setAt = Number(raw);
  if (!Number.isFinite(setAt) || Date.now() - setAt > TEST_MODE_REQUEST_MAX_AGE_MS) {
    sessionStorage.removeItem(TEST_MODE_STORAGE_KEY);
    return false;
  }
  return true;
}
function setTestModeRequested(value) {
  if (value) sessionStorage.setItem(TEST_MODE_STORAGE_KEY, String(Date.now()));
  else sessionStorage.removeItem(TEST_MODE_STORAGE_KEY);
}

// ユーザー要望「最初真っ白な画面にSTARTボタン、周りに7色のオーラが漂う。押したら
// BGM開始＋タイトル画像フェードイン＋ストーリーテロップ（クリックで飛ばせる）→
// ログインボタン出現」への対応。以下の7色は既存のCOLORS(board-layout.js)と同じ並びだが、
// ここは単なる装飾演出でゲームロジックとは無関係なため、循環import回避のため独自に
// 定数を持つ（board-layout.jsを経由する理由が無い）。
const AURA_COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

const STORY_LINES = [
  "ここは異世界「ファルベンド」",
  "世界は「色」で満ちている",
  "",
  "この世界には、7つの国があり",
  "各国はそれぞれの色を治めている",
  "そして、均衡は保たれ平和を築いていた",
  "",
  "しかし、世界の「色」は突如――",
  "",
  "消えた",
  "",
  "各国は、それぞれ国宝を有していた",
  "それはその国の「色」を纏った「キューブ」",
  "しかし、なぜかその「キューブ」だけは",
  "「色」を失わなかった",
  "",
  "色を失った世界で民は輝きを失い途方にくれていた",
  "",
  "やがて各国の国王は",
  "その「キューブ」の「特殊な力」に気付く",
  "",
  "そうそれは、「色」を「具現化する力」だった",
  "",
  "「色」はこの世のあらゆるものと",
  "密接に関わっている",
  "",
  "モノ、記憶、能力、あらゆるものに",
  "",
  "ある時「キューブ」の力が国王に語りかける",
  "",
  "-7つの色を集めよ-",
  "",
  "7つの色を集めたら　一体どうなるのか",
  "",
  "各国のそれぞれの野望、思惑、理想が交錯する中",
  "",
  "7色を巡る戦いが",
  "",
  "今、はじまる",
];

// ユーザー要望「7色の人魂は、ただの丸ではなく軌跡（同じ道を戻らず動く）が欲しい。
// 輪郭はぼやけている方がいい」への対応。CSSの@keyframesは必ず一定周期で同じ経路を
// 繰り返してしまう（無限ループなので、いずれ全く同じ軌道をなぞり直す）ため、JSで
// 毎フレーム「ランダムな目的地へゆっくり近づき、着いたらまた別のランダムな目的地を
// 選び直す」という徒歩（ワンダリング）アルゴリズムで動かし、真に反復しない軌道にした。
// 「軌跡」自体は、本体の位置履歴を数フレーム分覚えておき、過去の位置に薄い残像を
// 重ねて表示する（彗星の尾と同じ仕組み）ことで表現する。
// ユーザー要望「大きさ・軌跡の長さ・スピードを管理者モードで調整したい」に対応し、
// 固定値ではなくCSS変数から都度読み取る（admin.jsの「オープニングの7色の人魂」
// グループ参照）。
function getAuraCssNumber(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const n = parseFloat(raw);
  return Number.isNaN(n) ? fallback : n;
}

function startAuraTrails(container) {
  const trailLength = Math.max(1, Math.round(getAuraCssNumber("--opening-aura-trail-length", 10)));
  const sizeRem = getAuraCssNumber("--opening-aura-size", 12);
  // ユーザー要望「もっとゆったりと動き回ってほしい」を受けて基準速度を半分程度に
  // 落とした。--opening-aura-speedは管理者モードで動かせる倍率（既定1）。
  const speedMultiplier = getAuraCssNumber("--opening-aura-speed", 1);
  const auras = AURA_COLORS.map((color) => {
    const wrap = document.createElement("div");
    wrap.className = "opening-aura-wrap";
    wrap.style.setProperty("--aura-color", `var(--color-${color})`);
    const dots = [];
    // 残像は末尾(古い)から先に描画し、本体(先頭、一番新しい)を最後に描画することで
    // 本体が常に一番手前に重なるようにする。
    for (let i = 0; i < trailLength; i++) {
      const dot = document.createElement("div");
      dot.className = "opening-aura-dot";
      dot.style.width = `${sizeRem}rem`;
      dot.style.height = `${sizeRem}rem`;
      wrap.appendChild(dot);
      dots.push(dot);
    }
    container.appendChild(wrap);
    const startX = 10 + Math.random() * 80;
    const startY = 10 + Math.random() * 80;
    return {
      dots,
      x: startX,
      y: startY,
      targetX: 10 + Math.random() * 80,
      targetY: 10 + Math.random() * 80,
      speed: (0.015 + Math.random() * 0.015) * speedMultiplier,
      history: Array.from({ length: trailLength }, () => ({ x: startX, y: startY })),
    };
  });

  let running = true;
  let rafId = null;

  function pickNewTarget(aura) {
    aura.targetX = 10 + Math.random() * 80;
    aura.targetY = 10 + Math.random() * 80;
  }

  function tick() {
    if (!running) return;
    for (const aura of auras) {
      const dx = aura.targetX - aura.x;
      const dy = aura.targetY - aura.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 3) pickNewTarget(aura);
      aura.x += dx * aura.speed;
      aura.y += dy * aura.speed;

      aura.history.pop();
      aura.history.unshift({ x: aura.x, y: aura.y });

      // 残像を古い順(配列の末尾、履歴の一番過去)から先に位置決めし、本体（履歴[0]）は
      // 最後に一番不透明・一番大きく描く。
      for (let i = aura.dots.length - 1; i >= 0; i--) {
        const pos = aura.history[i];
        const dot = aura.dots[i];
        const ratio = 1 - i / aura.dots.length; // 1(本体) 〜 ほぼ0(一番古い残像)
        dot.style.left = `${pos.x}%`;
        dot.style.top = `${pos.y}%`;
        dot.style.opacity = String(ratio * 0.85);
        dot.style.transform = `translate(-50%, -50%) scale(${0.4 + ratio * 0.7})`;
      }
    }
    rafId = requestAnimationFrame(tick);
  }
  rafId = requestAnimationFrame(tick);

  // STARTボタンが押されてゲート自体が不要になったら、無駄にrequestAnimationFrameを
  // 回し続けないよう停止する（呼び出し元に停止関数を返す）。
  return function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  };
}

// ユーザー要望「設定しようとする時は疑似的にオープニングの人魂の画面になるように
// してほしい」への対応。admin.jsのregisterAuraPreviewHelper経由で注入される
// （admin.js→opening-screen.jsの直接importは循環importになるため、game-setup.jsの
// previewStartPlayerModalと同じ注入パターンを使う）。スライダーに触れた瞬間・
// ドラッグ中の値変更のたびに呼ばれる想定（admin.js参照）。既に開いていれば
// 中身を最新の値で作り直すだけ、閉じていれば新しく開く。一定時間操作が無ければ
// 自動で閉じる（クリックでも即座に閉じられる）。
const AURA_PREVIEW_AUTO_CLOSE_MS = 30000;
let auraPreviewOverlay = null;
let auraPreviewStop = null;
let auraPreviewCloseTimeoutId = null;

function closeAuraPreview() {
  auraPreviewStop?.();
  auraPreviewStop = null;
  auraPreviewOverlay?.remove();
  auraPreviewOverlay = null;
  clearTimeout(auraPreviewCloseTimeoutId);
}

export function previewOpeningAuras() {
  if (auraPreviewOverlay) {
    // 既に開いている＝ドラッグ中の値変化を反映するため中身を作り直す。
    auraPreviewStop?.();
    auraPreviewOverlay.innerHTML = "";
  } else {
    auraPreviewOverlay = document.createElement("div");
    auraPreviewOverlay.id = "opening-aura-preview";
    auraPreviewOverlay.title = "クリックで閉じる";
    auraPreviewOverlay.addEventListener("click", closeAuraPreview);
    document.body.appendChild(auraPreviewOverlay);
  }
  auraPreviewStop = startAuraTrails(auraPreviewOverlay);
  clearTimeout(auraPreviewCloseTimeoutId);
  auraPreviewCloseTimeoutId = setTimeout(closeAuraPreview, AURA_PREVIEW_AUTO_CLOSE_MS);
}

// ゲストログインの注意書き用の詳細モーダル。既存のphase-guide-modal-*クラス（フェイズ案内板・
// アイコンボタン等と共通のホバー=簡易/クリック=詳細パターン）をそのまま流用する。
let infoModalBackdrop = null;
let infoModalEl = null;
let infoModalTitleEl = null;
let infoModalBodyEl = null;

function closeInfoModal() {
  if (infoModalBackdrop) infoModalBackdrop.style.display = "none";
  if (infoModalEl) infoModalEl.style.display = "none";
}

function ensureInfoModal() {
  if (infoModalEl) return;
  infoModalBackdrop = createBackdrop(closeInfoModal, { dim: true, zIndex: 51000 });
  infoModalBackdrop.style.display = "none";

  infoModalEl = document.createElement("div");
  infoModalEl.id = "opening-login-info-modal";
  infoModalEl.style.display = "none";
  infoModalEl.appendChild(createModalCloseX(closeInfoModal));

  infoModalTitleEl = document.createElement("div");
  infoModalTitleEl.className = "phase-guide-modal-title";
  infoModalEl.appendChild(infoModalTitleEl);

  infoModalBodyEl = document.createElement("div");
  infoModalBodyEl.className = "phase-guide-modal-body";
  infoModalEl.appendChild(infoModalBodyEl);

  document.body.appendChild(infoModalBackdrop);
  document.body.appendChild(infoModalEl);
}

function openInfoModal(title, paragraphs) {
  ensureInfoModal();
  infoModalTitleEl.textContent = title;
  infoModalBodyEl.innerHTML = "";
  for (const paragraph of paragraphs) {
    const p = document.createElement("p");
    p.style.cssText = "margin: 0 0 0.6rem 0; line-height: 1.6;";
    p.textContent = paragraph;
    infoModalBodyEl.appendChild(p);
  }
  infoModalBackdrop.style.display = "block";
  infoModalEl.style.display = "block";
}

export function initOpeningScreen() {
  const overlay = document.createElement("div");
  overlay.id = "opening-screen";

  const bg = document.createElement("div");
  bg.className = "opening-screen-bg";
  bg.style.backgroundImage = 'url("assets/opening.webp")';
  overlay.appendChild(bg);

  const dim = document.createElement("div");
  dim.className = "opening-screen-dim";
  overlay.appendChild(dim);

  const content = document.createElement("div");
  content.className = "opening-screen-content";

  // 起動直後はこの小さなボタンだけを表示する（背景のタイトルロゴと重ならないように）。
  // 押すとカードが開く。ログイン済みかどうかで文言を変える（非同期に取得するため、
  // 判明するまでは無難な「ログイン」のまま）。
  const loginToggleBtn = document.createElement("button");
  loginToggleBtn.type = "button";
  loginToggleBtn.className = "opening-screen-menu-btn";
  loginToggleBtn.textContent = "ログイン";
  content.appendChild(loginToggleBtn);

  const card = document.createElement("div");
  card.className = "opening-login-card";
  card.style.display = "none";
  content.appendChild(card);

  overlay.appendChild(content);

  // ユーザー要望「右下端に小さく『テストモード』ボタン」。.opening-screen-content自身が
  // transform（translateY）を持っているため、その子にすると position:fixed の基準が
  // 画面全体ではなくその細い縦長カラムになってしまう（実機検証で発覚）。#opening-screen
  // （transform無し）の直接の子にすることで、main.jsのステージ方式により画面全体
  // （1600x900の仮想解像度）基準の右下に固定される。表示タイミングだけはログインボタンと
  // 揃えたいので、CSS側で#opening-screen.stage-content時にopacityが上がるようにする
  // （style.css参照）。
  const testModeBtn = document.createElement("button");
  testModeBtn.type = "button";
  testModeBtn.className = "opening-test-mode-btn";
  testModeBtn.textContent = "テストモード";
  testModeBtn.title = "1画面で複数人分を動かせる検証用の盤面へ直接進みます（開発・動作確認用）";
  overlay.appendChild(testModeBtn);

  // ユーザー要望の演出一式: 起動直後は真っ白な画面+7色のオーラ+STARTボタンだけを見せ
  // （.opening-start-gateがbg/dim/contentを覆い隠す）、STARTを押した瞬間にBGM再生・
  // タイトル画像フェードイン・ストーリーテロップ表示という3段階へ進める。
  const storyCrawl = document.createElement("div");
  storyCrawl.className = "opening-story-crawl";
  storyCrawl.style.display = "none";
  const crawlText = document.createElement("div");
  crawlText.className = "opening-story-crawl-text";
  for (const line of STORY_LINES) {
    const p = document.createElement("p");
    if (line === "") {
      p.className = "is-blank";
      p.innerHTML = "&nbsp;";
    } else {
      p.textContent = line;
    }
    crawlText.appendChild(p);
  }
  storyCrawl.appendChild(crawlText);
  const crawlSkipHint = document.createElement("div");
  crawlSkipHint.className = "opening-story-crawl-skip-hint";
  crawlSkipHint.textContent = "クリックでスキップ";
  storyCrawl.appendChild(crawlSkipHint);
  overlay.appendChild(storyCrawl);

  const startGate = document.createElement("div");
  startGate.className = "opening-start-gate";
  const stopAuras = startAuraTrails(startGate);
  // ユーザー提供のボタン画像（画像素材/オープニング画面/スタートボタン「HUERISE」.png、
  // assets/opening-start-btn.pngへコピー済み、assets/opening.webpと同じ運用）に
  // 差し替えた。以前はテキスト"START"の丸ボタンだったが、見た目を画像そのものに
  // 任せるため、ボタン自体は透明な当たり判定の器にし、中に画像を1枚だけ入れる。
  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "opening-start-btn";
  const startBtnImg = document.createElement("img");
  startBtnImg.src = "assets/opening-start-btn.png";
  startBtnImg.alt = "START";
  startBtn.appendChild(startBtnImg);
  startGate.appendChild(startBtn);
  overlay.appendChild(startGate);

  document.body.appendChild(overlay);

  function close(after) {
    // ユーザー要望「音楽もフェードアウトしてほしい」。オーバーレイのフェードアウトと
    // 同じ時間をかけて音量を下げる。
    stopOpeningBgm(CLOSE_TRANSITION_MS);
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.style.display = "none";
      if (after) after();
      // ユーザー要望「2D表示の警告は、オープニング画面が終わり盤面画面に移行する
      // タイミングで出したい」。「オンラインで続ける」「ローカルでプレイ」等、
      // オープニング画面から抜けるボタンは全てこのclose()を経由するため、ここが
      // 「実際に盤面側の画面が見え始める」タイミングとして一番自然（以前はページ
      // 読み込み直後、オープニング画面がまだ表示されている段階で出していた）。
      maybeShowTablet2dWarning();
    }, CLOSE_TRANSITION_MS);
  }

  function revealContent() {
    overlay.classList.add("stage-content");
  }

  // テロップの表示秒数はCSS側（--opening-story-crawl-duration、style.css参照）で
  // calc(var(...))として直接持たせている（JSでanimationDurationを後から上書きする
  // 方式は、display変更とduration上書きが同じ同期処理内でも間に合わずアニメーションが
  // 0秒で終わってしまう不具合があったため廃止した）。
  function showStoryCrawl() {
    storyCrawl.style.display = "flex";
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      storyCrawl.style.display = "none";
      revealContent();
    }
    storyCrawl.addEventListener("click", finish);
    crawlText.addEventListener("animationend", finish);
  }

  function beginTitleSequence() {
    overlay.classList.add("stage-title");
    showStoryCrawl();
  }

  // ユーザー報告「オープニングでログインしたら一番最初に戻る（＝START演出・
  // ストーリーテロップをもう一度見せられる）んじゃなくて、『オンラインで続ける』
  // モーダルに戻ってほしい」への対応。既存のshowCard()はログインカードを開くだけで、
  // STARTボタンの白い画面やストーリーテロップ自体はスキップしないままだった
  // （＝ユーザーからは「最初から」に見える）。ここでSTART演出・テロップの両方を
  // 飛ばして一気にカードの見える段階まで進める。BGMは自動再生扱いになりブラウザの
  // 自動再生ポリシーでどうせブロックされる（ユーザー操作を経ていないため）ので、
  // ここでは鳴らそうとしない。
  function skipIntroToContent() {
    stopAuras();
    startGate.style.display = "none";
    storyCrawl.style.display = "none";
    overlay.classList.add("stage-title", "stage-content");
  }

  // ユーザー要望「優しく、すごくゆっくり、完全に消えない（透過率50%と0%＝不透明度
  // 100%と50%の間）を繰り返す点滅」。最初のフェードイン(opening-screen-rise-in、
  // 2.5秒後開始・4秒かけて0→1)が終わってから、無限に繰り返す点滅アニメーションへ
  // 切り替える（2つのanimationを同じopacityプロパティに同時指定すると重なる瞬間の
  // 挙動が読みにくいため、animationendで確実に区切る）。
  startBtn.addEventListener(
    "animationend",
    (e) => {
      if (e.animationName === "opening-screen-rise-in") {
        startBtn.classList.add("is-blinking");
      }
    },
    { once: true }
  );

  startBtn.addEventListener("click", () => {
    playOpeningBgm();
    startGate.classList.add("is-closing");
    stopAuras();
    setTimeout(() => {
      startGate.style.display = "none";
      beginTitleSequence();
    }, CLOSE_TRANSITION_MS);
  });

  function showCard() {
    loginToggleBtn.style.display = "none";
    card.style.display = "flex";
    renderCard();
  }

  function hideCard() {
    card.style.display = "none";
    loginToggleBtn.style.display = "inline-block";
    // カードを✕で閉じた（＝ログインを完了せずに引き返した）場合、テストモード経由で
    // あったという記憶は捨てる。捨てておかないと、この後に通常の「ログイン」ボタンから
    // 入り直してログインした時、本来出るはずの「オンラインで続ける」カードが誤って
    // スキップされてしまう。
    setTestModeRequested(false);
  }

  loginToggleBtn.addEventListener("click", () => {
    setTestModeRequested(false);
    showCard();
  });

  // ユーザー要望「テストモードを押すと、ログインするか求められ（『オンラインで続ける』は
  // 表示せず）、そのまま盤面へ直接進む。既にログイン済みならそのまま盤面へ」への対応。
  testModeBtn.addEventListener("click", async () => {
    if (!isOnlineAvailable()) {
      // オンライン機能自体が読み込めていない場合はログインのしようが無いため、
      // そのまま盤面へ進む（今までの「ローカルでプレイ」の障害時フォールバックと同じ扱い）。
      close();
      return;
    }
    const user = await getCurrentUser();
    if (user) {
      close();
      return;
    }
    setTestModeRequested(true);
    showCard();
  });

  function buildLocalLink() {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "opening-login-local-link";
    link.textContent = "ローカルでプレイ（ログイン不要）";
    link.addEventListener("click", () => close());
    return link;
  }

  async function renderCard() {
    card.innerHTML = "";
    card.appendChild(createModalCloseX(hideCard));

    const available = isOnlineAvailable();
    const user = available ? await getCurrentUser() : null;

    // テストモード経由でログインし終えた場合、「オンラインで続ける」を挟まずそのまま
    // 盤面へ進む（Googleログイン・マジックリンクはページ再読み込みを伴うため、ここが
    // ログイン完了後に必ず通る唯一の場所になる。ゲストログインの即時ケースは
    // guestBtnのクリックハンドラ側で先に処理して、このカードを一瞬でも見せないように
    // している）。
    if (available && user && isTestModeRequested()) {
      setTestModeRequested(false);
      close();
      return;
    }

    if (!available) {
      const msg = document.createElement("div");
      msg.className = "opening-login-status";
      msg.textContent = "オンライン機能を読み込めませんでした。ローカルでプレイできます。";
      card.appendChild(msg);
      card.appendChild(buildLocalLink());
      return;
    }

    if (user) {
      const title = document.createElement("div");
      title.className = "opening-login-title";
      title.textContent = `🌐 ログイン中（${user.email || "匿名ユーザー"}）`;
      card.appendChild(title);

      const row = document.createElement("div");
      row.className = "opening-login-primary-row";
      const continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "opening-login-primary-btn";
      continueBtn.textContent = "オンラインで続ける";
      continueBtn.addEventListener("click", () => close(openOnlinePanel));
      row.appendChild(continueBtn);
      card.appendChild(row);

      const logoutBtn = document.createElement("button");
      logoutBtn.type = "button";
      logoutBtn.className = "opening-login-signout-link";
      logoutBtn.textContent = "ログアウト";
      logoutBtn.addEventListener("click", async () => {
        setTestModeRequested(false);
        await signOut();
        renderCard();
      });
      card.appendChild(logoutBtn);
      return;
    }

    // ユーザー要望「テストモード経由で開いたことが分かるようにしたい」への対応
    // （右下の小さいボタンは他の装飾と近く誤クリックしやすいため、ここで開いている
    // カードが未ログイン時のものと全く同じ見た目だと、テストモード経由だと気づかないまま
    // Googleログイン等を進めてしまい、後で「オンラインで続ける」が出ないと戸惑う恐れが
    // あった）。テストモード経由の間は目立つ色のヒントを出し、✕で引き返せることも伝える。
    if (isTestModeRequested()) {
      const testModeHint = document.createElement("div");
      testModeHint.className = "opening-login-status";
      testModeHint.style.cssText =
        "background: rgba(250, 204, 21, 0.12); border: 1px solid rgba(250, 204, 21, 0.5); " +
        "border-radius: 0.3rem; padding: 0.5rem 0.7rem; margin-bottom: 0.6rem; font-size: 0.75rem; line-height: 1.5;";
      testModeHint.textContent =
        "🧪 テストモード：ログイン完了後、「オンラインで続ける」を経由せず直接検証用の盤面へ進みます。" +
        "通常のオンライン対戦をしたい場合は右上の✕で引き返してください。";
      card.appendChild(testModeHint);
    }

    // 未ログイン: ゲストログインを主目的にした画面。
    const status = document.createElement("div");
    status.className = "opening-login-status";

    const primaryRow = document.createElement("div");
    primaryRow.className = "opening-login-primary-row";

    const guestBtn = document.createElement("button");
    guestBtn.type = "button";
    guestBtn.className = "opening-login-primary-btn";
    guestBtn.textContent = "ゲストでログイン";
    guestBtn.addEventListener("click", async () => {
      guestBtn.disabled = true;
      status.textContent = "ログイン中...";
      try {
        await signInAnonymously();
        // テストモード経由の場合、ゲストログインはページ遷移を伴わずその場で完了する
        // ため、renderCard()の再描画（＝「オンラインで続ける」カード）を経由させず
        // ここで直接盤面へ進む。
        if (isTestModeRequested()) {
          setTestModeRequested(false);
          close();
          return;
        }
        await renderCard();
      } catch (err) {
        status.textContent = `エラー: ${err.message ?? err}`;
        guestBtn.disabled = false;
      }
    });
    primaryRow.appendChild(guestBtn);

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "opening-login-info-btn";
    infoBtn.textContent = "i";
    infoBtn.title = "ゲストログインについて";
    infoBtn.addEventListener("click", () => {
      openInfoModal("ゲストログインについて", [
        "メールアドレスの登録・確認は不要で、今すぐそのままオンライン対戦に参加できます。",
        "ただし一度ログアウトしたり、別の端末・別のブラウザからアクセスすると同じアカウントには" +
          "戻れません（ゲストアカウントを後から引き継ぐ手段は現在ありません）。",
        "何度も遊ぶ予定がある場合や、名前・アバター・駒スキン等の設定を長く使い続けたい場合は、" +
          "下の「その他のログイン方法」からGoogleでログインすることをおすすめします。",
      ]);
    });
    primaryRow.appendChild(infoBtn);

    card.appendChild(primaryRow);
    card.appendChild(status);

    // その他のログイン方法（右下、折りたたみ）: Googleログイン・マジックリンクをここに格納する。
    const moreRow = document.createElement("div");
    moreRow.className = "opening-login-more-row";
    moreRow.textContent = "その他のログイン方法 ▾";
    card.appendChild(moreRow);

    const moreSection = document.createElement("div");
    moreSection.className = "opening-login-more-section";
    card.appendChild(moreSection);

    moreRow.addEventListener("click", () => {
      const opening = moreSection.style.display !== "flex";
      moreSection.style.display = opening ? "flex" : "none";
      moreRow.textContent = opening ? "その他のログイン方法 ▴" : "その他のログイン方法 ▾";
    });

    const googleBtn = document.createElement("button");
    googleBtn.type = "button";
    googleBtn.className = "opening-login-secondary-btn";
    googleBtn.textContent = "Googleでログイン";
    googleBtn.addEventListener("click", async () => {
      googleBtn.disabled = true;
      try {
        await signInWithGoogle();
      } catch (err) {
        status.textContent = `エラー: ${err.message ?? err}`;
        googleBtn.disabled = false;
      }
    });
    moreSection.appendChild(googleBtn);

    const divider = document.createElement("div");
    divider.className = "opening-login-divider";
    divider.textContent = "── または ──";
    moreSection.appendChild(divider);

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "メールアドレス";
    emailInput.className = "opening-login-email-input";
    moreSection.appendChild(emailInput);

    const magicBtn = document.createElement("button");
    magicBtn.type = "button";
    magicBtn.className = "opening-login-secondary-btn";
    magicBtn.textContent = "マジックリンクを送る";
    magicBtn.addEventListener("click", async () => {
      if (!emailInput.value) return;
      magicBtn.disabled = true;
      status.textContent = "送信中...";
      try {
        await signInWithMagicLink(emailInput.value);
        status.textContent = "メールを確認し、届いたリンクを開いてください。";
      } catch (err) {
        status.textContent = `エラー: ${err.message ?? err}`;
      } finally {
        magicBtn.disabled = false;
      }
    });
    moreSection.appendChild(magicBtn);
  }

  // 起動直後にログイン状態を確認する。Googleログインはページ遷移を伴うため、認証完了後は
  // ブラウザがこのページへ丸ごとリロードして戻ってくる（＝initOpeningScreen()が最初から
  // 実行し直される）。この時、小さい「ログイン」ボタンのままだと「オンラインで続ける」
  // モーダルに気づけず、あたかもログインが失敗したかのように見えてしまう
  // （ユーザー報告）。ログイン済みと判明した場合は、カードを自動的に開いて
  // 「オンラインで続ける」をすぐ提示する（このカードは未ログイン時のカードと違い
  // タイトル+ボタン1つ+リンク2つだけの簡素な内容のため、タイトルロゴへの重なりは
  // 軽微で許容できる）。未ログインの間は引き続き小さいボタンのまま（タイトルロゴとの
  // 重なりを避けるための前回の対応を維持）。
  (async () => {
    if (!isOnlineAvailable()) return;
    const user = await getCurrentUser();
    if (user) {
      skipIntroToContent();
      showCard();
    }
  })();
}
