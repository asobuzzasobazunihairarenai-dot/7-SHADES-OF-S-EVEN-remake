// チュートリアル機能: 初めてゲームを開始した時、実際の盤面のUI要素を1つずつハイライトし
// ながら遊び方を説明する「ステップ形式のオーバーレイ」。ユーザー要望「チュートリアル機能を
// 実装したい」への対応。
//
// 設計方針:
// ・説明文はできるだけ既存のもの（phase-guide.jsのロック/ハンド/ムーブフェイズの説明）を
//   再利用し、二重管理を避ける。
// ・ハイライト対象は`document.querySelector`で毎回探し直す（自分の手札・ロックエリアは
//   #game-tableの中身で、render()のたびに丸ごと作り直されるため、要素参照を1度だけ
//   キャッシュすると次のrender()で参照が古くなってしまう）。state.jsのsubscribe()で
//   状態が変わるたびに再計算する。
// ・対象が無い（要素がまだ存在しない・DOM上から消えた）ステップは、画面中央に説明だけを
//   出す（スポットライトの穴は表示しない）。
// ・一度最後まで見た/スキップしたらlocalStorageに記録し、次回以降は自動表示しない
//   （オプションメニューから「チュートリアルを見る」でいつでも見返せる）。アカウントを
//   またいだ同期は行わない（このフラグだけのためにso7_user_profilesへ新しい列を足すのは
//   過剰と判断した）。
// ・盤面の実際の操作を妨げないよう、表示中は暗幕（#tutorial-scrim）がクリックを受け止め、
//   進行は必ずコールアウト自身のボタンで行う（ハイライト中の本物のボタンを押させて
//   実際の処理を発火させてしまうと、チュートリアル中に意図せずゲームが進んでしまうため）。

import { getState, subscribe } from "./state.js";
import { PHASES } from "./phase-guide.js";

const STORAGE_KEY = "so7-tutorial-completed";

function hasCompletedTutorial() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch (err) {
    return false;
  }
}

function markTutorialCompleted() {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch (err) {
    // localStorageが使えない環境でも致命的ではない（次回また自動表示されるだけ）
  }
}

const phaseStep = (phase) => ({
  target: () => document.getElementById(`phase-guide-${phase.id}-button`),
  title: `${phase.label}フェイズ`,
  body: phase.detail,
});

const STEPS = [
  {
    target: () => null,
    title: "7 SHADES OF S:EVEN の遊び方",
    body: [
      "目標は、自分のロックエリアに7色すべてのカードを集めてロックすることです。",
      "基本の流れを、実際の画面を見ながら順番に確認していきましょう。",
    ],
  },
  {
    target: () => document.querySelector(".zone-bottom .hand-area"),
    title: "あなたの手札",
    body: [
      "画面手前に表示されているのがあなたの手札です。相手プレイヤーには中身が見えません。",
      "1ターンの中で「ロック」「ハンド」「ムーブ」の3つのフェイズを順番に行います。",
    ],
  },
  phaseStep(PHASES[0]),
  phaseStep(PHASES[1]),
  phaseStep(PHASES[2]),
  {
    target: () => document.querySelector(".lock-bottom"),
    title: "あなたのロックエリア",
    body: [
      "ここがあなたのロックエリアです。7色すべてのスロットが埋まった瞬間に勝利となります。",
      "ムーブフェイズで表向きのカードに駒を乗せると手札に加わるので、そのカードを後でここへロックしましょう。",
    ],
  },
  {
    target: () => document.getElementById("end-turn-button"),
    title: "ターン終了",
    body: ["自分の行動が済んだら、このボタンで自分のターンを終えて次のプレイヤーへ手番を渡します。"],
  },
  {
    target: () => document.getElementById("options-menu-button"),
    title: "困ったときは",
    body: [
      "画面右上の「⚙ オプション」から、いつでもこのチュートリアルを見返せます。",
      "音量やロックエリアバーの表示など、基本的な設定もここから行えます。",
    ],
  },
  {
    target: () => null,
    title: "以上で基本の流れは終わりです",
    body: ["あとは実際に対戦しながら覚えていきましょう。健闘を祈ります！"],
  },
];

let overlayEl = null;
let scrimEl = null;
let spotlightEl = null;
let calloutEl = null;
let titleEl = null;
let bodyEl = null;
let backBtn = null;
let nextBtn = null;
let skipBtn = null;
let progressEl = null;

let currentStepIndex = 0;
let isActive = false;
let unsubscribeStateWatch = null;
let wasGameStartedForTutorial = false;

function ensureOverlay() {
  if (overlayEl) return;

  overlayEl = document.createElement("div");
  overlayEl.id = "tutorial-overlay";

  scrimEl = document.createElement("div");
  scrimEl.id = "tutorial-scrim";
  overlayEl.appendChild(scrimEl);

  spotlightEl = document.createElement("div");
  spotlightEl.id = "tutorial-spotlight";
  overlayEl.appendChild(spotlightEl);

  calloutEl = document.createElement("div");
  calloutEl.id = "tutorial-callout";

  titleEl = document.createElement("div");
  titleEl.className = "tutorial-callout-title";
  calloutEl.appendChild(titleEl);

  bodyEl = document.createElement("div");
  bodyEl.className = "tutorial-callout-body";
  calloutEl.appendChild(bodyEl);

  progressEl = document.createElement("div");
  progressEl.className = "tutorial-callout-progress";
  calloutEl.appendChild(progressEl);

  const buttonRow = document.createElement("div");
  buttonRow.className = "tutorial-callout-buttons";

  skipBtn = document.createElement("button");
  skipBtn.type = "button";
  skipBtn.className = "tutorial-callout-skip";
  skipBtn.textContent = "スキップ";
  skipBtn.addEventListener("click", () => finishTutorial());

  backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.className = "tutorial-callout-back";
  backBtn.textContent = "戻る";
  backBtn.addEventListener("click", () => goToStep(currentStepIndex - 1));

  nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "tutorial-callout-next";
  nextBtn.textContent = "次へ";
  nextBtn.addEventListener("click", () => {
    if (currentStepIndex >= STEPS.length - 1) {
      finishTutorial();
    } else {
      goToStep(currentStepIndex + 1);
    }
  });

  buttonRow.appendChild(skipBtn);
  buttonRow.appendChild(backBtn);
  buttonRow.appendChild(nextBtn);
  calloutEl.appendChild(buttonRow);

  overlayEl.appendChild(calloutEl);
  document.body.appendChild(overlayEl);

  window.addEventListener("resize", () => {
    if (isActive) positionForCurrentStep();
  });
}

// ホバープレビュー(main.jsのpositionPreviewPanel)と同じ考え方: 対象の近くに出しつつ、
// 画面端をはみ出す場合は反対側へ逃がす。チュートリアルは#game-table等の3D「ステージ」の
// 外（document.body直下、position:fixed）に置くため、getBoundingClientRect()の実画面
// 座標をそのまま使ってよい（ステージのローカル座標変換は不要）。
function positionCallout(targetRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;
  const calloutRect = calloutEl.getBoundingClientRect();

  if (!targetRect) {
    calloutEl.style.left = `${vw / 2}px`;
    calloutEl.style.top = `${vh / 2}px`;
    calloutEl.style.transform = "translate(-50%, -50%)";
    return;
  }

  let left = targetRect.left + targetRect.width / 2;
  let top = targetRect.bottom + margin;
  let transform = "translate(-50%, 0)";

  // 下にはみ出す場合は対象の上に出す
  if (top + calloutRect.height > vh - margin) {
    top = targetRect.top - margin;
    transform = "translate(-50%, -100%)";
  }
  // 左右にはみ出す場合は画面内に収める
  const halfWidth = calloutRect.width / 2;
  if (left - halfWidth < margin) left = margin + halfWidth;
  if (left + halfWidth > vw - margin) left = vw - margin - halfWidth;

  calloutEl.style.left = `${left}px`;
  calloutEl.style.top = `${top}px`;
  calloutEl.style.transform = transform;
}

function positionForCurrentStep() {
  const step = STEPS[currentStepIndex];
  const target = step.target();
  if (target) {
    const rect = target.getBoundingClientRect();
    spotlightEl.style.display = "block";
    spotlightEl.style.left = `${rect.left}px`;
    spotlightEl.style.top = `${rect.top}px`;
    spotlightEl.style.width = `${rect.width}px`;
    spotlightEl.style.height = `${rect.height}px`;
    positionCallout(rect);
  } else {
    spotlightEl.style.display = "none";
    positionCallout(null);
  }
}

function renderStep() {
  const step = STEPS[currentStepIndex];
  titleEl.textContent = step.title;
  bodyEl.innerHTML = "";
  for (const paragraph of step.body) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    bodyEl.appendChild(p);
  }
  progressEl.textContent = `${currentStepIndex + 1} / ${STEPS.length}`;
  backBtn.disabled = currentStepIndex === 0;
  nextBtn.textContent = currentStepIndex >= STEPS.length - 1 ? "始める" : "次へ";
  // 最初と最後のステップ（対象なし）はスキップする意味が薄いため、それ以外の間だけ出す。
  skipBtn.style.visibility = currentStepIndex === 0 || currentStepIndex === STEPS.length - 1 ? "hidden" : "visible";
  positionForCurrentStep();
}

function goToStep(index) {
  currentStepIndex = Math.max(0, Math.min(STEPS.length - 1, index));
  renderStep();
}

export function startTutorial() {
  ensureOverlay();
  isActive = true;
  overlayEl.classList.add("is-visible");
  goToStep(0);
  if (!unsubscribeStateWatch) {
    // 自分の手札・ロックエリアは#game-tableの中身で、render()のたびに作り直される
    // ため、ゲーム状態が変わるたびに対象要素を探し直して位置を追従させる。
    unsubscribeStateWatch = subscribe(() => {
      if (isActive) positionForCurrentStep();
    });
  }
}

function finishTutorial() {
  isActive = false;
  overlayEl?.classList.remove("is-visible");
  if (unsubscribeStateWatch) {
    unsubscribeStateWatch();
    unsubscribeStateWatch = null;
  }
  markTutorialCompleted();
}

// ユーザー要望「実際の初回プレイ中に本物のUI要素をハイライトしていく」への対応。
// turnPlayerがnull→非nullに変わった瞬間（＝新しい対局が実際に始まった、victory.jsの
// announcedPlayersリセットと同じ検知パターン）を拾い、まだ一度もチュートリアルを
// 見ていない（or スキップしていない）人にだけ自動表示する。
export function initTutorialAutoStart() {
  subscribe(() => {
    const started = Boolean(getState().turnPlayer);
    if (started && !wasGameStartedForTutorial && !hasCompletedTutorial()) {
      // セットアップ完了時に自動表示される「スタートプレイヤー決定」モーダル
      // （game-setup.js）と表示タイミングが重なって騒がしくならないよう、
      // 少し間を置いてから出す。
      setTimeout(() => startTutorial(), 1200);
    }
    wasGameStartedForTutorial = started;
  });
}
