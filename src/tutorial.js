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
import { GATE_POSITIONS, SEAT_TO_SIDE } from "./board-layout.js";
import { getSelfSeat } from "./online.js";
import { getCardDefinition, getCardImagePath } from "./cards-data.js";

// ハマりどころ（ユーザー報告のスクリーンショットで発覚、実際の環境依存の不具合）:
// このモジュールの要素（#tutorial-overlay等）はdocument.body直下に置いているが、
// main.jsの「ステージ方式」（STAGE_WIDTH×STAGE_HEIGHTの仮想解像度でbody自体に
// transform: translate()+scale()をかけ、実際のウィンドウサイズに収める仕組み）により、
// body配下のposition:fixed要素は「実画面」ではなく「このステージ」を基準にfixedに
// なる。target.getBoundingClientRect()自体は常に実画面座標を返す（main.jsの
// stageClientToLocalのコメント参照）ため、これをそのままstyle.left/top/width/height
// に使うと、ウィンドウサイズがSTAGE_WIDTH×STAGE_HEIGHT(1600×900)と一致しない限り
// （＝ほぼ常に）スケール分だけズレる。1280×800前後のウィンドウでは倍率が0.8倍程度に
// なるため、対戦相手同士でもウィンドウサイズが違えばズレ方も変わり得る
// （「片方のブラウザでは正常だった」という報告と一致する）。main.js→tutorial.jsの
// import（initTutorialAutoStart）が既にあるため、tutorial.js→main.jsの直接importは
// 循環importになる。card-back-skins.js等と同じ「main.jsから注入してもらう」
// パターンで、実画面座標→ステージのローカル座標への変換関数を受け取る。
let stageClientToLocalFn = null;
let stageDeltaFn = null;
let stageWidth = 1600;
let stageHeight = 900;
export function registerTutorialStageHelpers({ stageClientToLocal, stageDelta, stageWidth: w, stageHeight: h }) {
  stageClientToLocalFn = stageClientToLocal;
  stageDeltaFn = stageDelta;
  if (w) stageWidth = w;
  if (h) stageHeight = h;
}

// 実画面座標のDOMRect相当のオブジェクトを、ステージのローカル座標系（position:fixed
// 要素にそのまま使える値）へ変換する。まだmain.jsからの注入が済んでいない
// （register呼び出し前）場合は変換せずそのまま返す（スケール1相当のフォールバック）。
function toStageRect(rect) {
  if (!stageClientToLocalFn || !stageDeltaFn) return rect;
  const local = stageClientToLocalFn(rect.left, rect.top);
  return {
    left: local.x,
    top: local.y,
    width: stageDeltaFn(rect.width),
    height: stageDeltaFn(rect.height),
  };
}

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

// ユーザー報告「『相手ゲート侵攻ボーナス』の説明で自分のゲートにクローズアップしている
// ので相手のゲートにクローズアップしてください」への対応。相手ゲート侵攻ボーナスは
// 「自分の駒」が「相手のゲート」に乗ったまま終了した時のボーナスなので、説明すべきは
// 相手側のゲートマス。activePlayersの中から自分以外の座席を1つ選び、その座席の
// ゲートマス（GATE_POSITIONS、盤面の物理座標）を探す。ボード自体は視点回転により
// 見た目の位置（grid-row/grid-column）だけが変わり、.cellのdata-row/data-colは常に
// 物理座標のまま（main.jsのbuildBoard参照）なので、回転を気にせずこの座標だけで引ける。
function getOpponentGateCell() {
  const selfSeat = getSelfSeat();
  const { activePlayers } = getState();
  const candidates = activePlayers.length > 0 ? activePlayers : ["A", "B", "C", "D"];
  const opponentSeat = candidates.find((seat) => seat !== selfSeat);
  if (!opponentSeat) return null;
  const side = SEAT_TO_SIDE[opponentSeat];
  const pos = GATE_POSITIONS[side];
  if (!pos) return null;
  return document.querySelector(`.cell[data-row="${pos.row}"][data-col="${pos.col}"]`);
}

// ユーザー要望「ムーブフェイズ、実際に駒を移動できる範囲をハイライトさせたりできる？」
// への対応。自分の駒の現在地から前後左右のマスを（有効/無効を厳密に判定せず）ざっくり
// 示す軽量版。本物の移動・接触を実際にシミュレーションして動かして見せるのは、
// ghost-flight.js/setup-animation.js相当の使い捨てアニメーションを新たに組む必要があり
// 実装コストとstate.jsの本物の状態を一切変えずに済ませる慎重さの両面でリスクが大きい
// ため、今回はこの「範囲だけをハイライトする」軽量版にとどめた。
function getSelfPieceAdjacentCells() {
  const selfSeat = getSelfSeat();
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === selfSeat && t.location.zone === "cell");
  if (!piece) return [];
  const { row, col } = piece.location;
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  return deltas
    .map(([dr, dc]) => [row + dr, col + dc])
    .filter(([r, c]) => r >= 0 && r <= 6 && c >= 0 && c <= 6)
    .map(([r, c]) => document.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`))
    .filter(Boolean);
}

let moveRangeCellEls = [];
function clearMoveRangeHighlight() {
  for (const el of moveRangeCellEls) el.classList.remove("tutorial-move-range");
  moveRangeCellEls = [];
}
function applyMoveRangeHighlight() {
  clearMoveRangeHighlight();
  moveRangeCellEls = getSelfPieceAdjacentCells();
  for (const el of moveRangeCellEls) el.classList.add("tutorial-move-range");
}

// ユーザー要望「手札効果の説明、実際のカード画面で説明」への対応。手札効果の説明として
// 見せる具体例。「赤・ジャンプ台」は効果自体がシンプルで、初めての人向けの例として
// 分かりやすいと判断した（他のカードに差し替えたい場合はこのidを変えるだけでよい）。
const HAND_EFFECT_EXAMPLE_CARD_ID = "red-jump-pad";

function buildCardExampleEl() {
  const def = getCardDefinition(HAND_EFFECT_EXAMPLE_CARD_ID);
  const wrap = document.createElement("div");
  wrap.className = "tutorial-card-example";
  const img = document.createElement("img");
  img.className = "tutorial-card-example-image";
  img.src = getCardImagePath(HAND_EFFECT_EXAMPLE_CARD_ID);
  img.alt = def?.name ?? "";
  const textCol = document.createElement("div");
  textCol.className = "tutorial-card-example-text";
  const name = document.createElement("div");
  name.className = "tutorial-card-example-name";
  name.textContent = def?.name ?? "";
  textCol.appendChild(name);
  if (def?.note) {
    const note = document.createElement("div");
    note.className = "tutorial-card-example-note";
    note.textContent = def.note;
    textCol.appendChild(note);
  }
  wrap.appendChild(img);
  wrap.appendChild(textCol);
  return wrap;
}

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
      "対局の進行とともに、ドローや駒の移動でここにカードが増えていきます。",
      "1ターンの中で「ロック」「ハンド」「ムーブ」の3つのフェイズを順番に行います。",
      "※このチュートリアルでは説明のために手札を持たせていますが、実際の最初のターンでは手札は0枚から始まります。",
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
    title: "もっと詳しく知りたいですか？",
    body: [
      "以上が基本の流れです。ここで終えても十分に対戦を楽しめます。",
      "「到達効果」「手札効果」「相手ゲート侵攻ボーナス」など、もう少し踏み込んだルールも見てみますか？",
    ],
    isBranch: true,
  },
  {
    // ユーザー要望「『ムーブフェイズの移動範囲ハイライト』についてチュートリアルの
    // どの部分に組み込まれているでしょうか？『ムーブフェイズでの移動』についての
    // モーダルを1つ立ち上げそこで説明するのがよさそうです」への対応。以前は「到達効果」
    // ステップに間借りしていたため、ハイライトの意図が伝わりにくかった。移動そのものの
    // 説明と、到達効果の説明を別ステップに分けた。
    target: () => document.getElementById("phase-guide-move-button"),
    title: "ムーブフェイズでの移動",
    body: [
      "自分の隣（前後左右の4マス）へ移動するか、隣にいる相手の駒に接触するか、どちらか一方を必ず行います。",
      "黄色い枠で囲んだマスが、あなたの駒が今動ける方向の目安です（駒がいるマスとカードの無いマスへは移動できません）。",
    ],
    highlightMoveRange: true,
  },
  {
    // ユーザー要望「この後に接触についてもモーダルで説明を」への対応。移動と同じ
    // ムーブフェイズの選択肢だが、効果が全く違う（カードではなく相手プレイヤーが
    // 対象）ため独立したステップにした。
    target: () => document.getElementById("phase-guide-move-button"),
    title: "接触",
    body: [
      "隣にいる相手の駒を選んで「接触」すると、その相手の手札から無作為に1枚もらえます。",
      "接触された相手は、自分のゲートへ強制的に移動させられます（接触した自分自身は移動しません）。",
    ],
  },
  {
    target: () => document.getElementById("phase-guide-move-button"),
    title: "到達効果",
    icon: "assets/icons/arrival-effect.png",
    body: [
      "移動先の表向きのカードに駒を乗せると「到達」となり、到達効果が自動的に発動します。発動し終わったら、そのカードは原則そのまま手札に加わります。",
      "カードには、乗った瞬間に発動する「到達効果」と、手札から捨てて発動する「手札効果」の2種類が書かれていることがあります。",
    ],
  },
  {
    target: () => document.querySelector(".zone-bottom .hand-area"),
    title: "手札効果（実際のカードで見てみましょう）",
    icon: "assets/icons/hand-effect.png",
    body: [
      "手札のカードは、捨てることで「手札効果」を使えます。効果の内容はカードごとに異なり、カード自体に書かれています。",
      "例えばこのカードの手札効果:",
    ],
    renderExtra: (container) => container.appendChild(buildCardExampleEl()),
    footer: ["盤面のカードを右クリック→「カード補足を見る」でも、いつでも同じように詳細を確認できます。"],
    wide: true,
  },
  {
    // ユーザー要望「『手札公開エリアへドラッグして使用宣言してから使うと相手に
    // わかりやすい』という説明は別モーダルで組み込んでください」への対応。以前は
    // 手札効果ステップの脚注に間借りしていたが、実際の「手札公開エリア」
    // （main.jsの.hand-reveal-area、自分の分は常に.hand-reveal-bottom）自体を
    // 指し示せる独立したステップに切り出した。
    target: () => document.querySelector(".hand-reveal-bottom"),
    title: "手札公開エリアで使用を宣言する",
    body: [
      "手札効果を使う前に、一度そのカードをこの「手札公開エリア」（プレイヤー名の下あたり）へドラッグしてみましょう。",
      "「このカードを使います」という宣言になり、相手にも分かりやすくなります（公開ドローで引いたカードも、ここに表向きで並びます）。",
    ],
  },
  {
    target: () => getOpponentGateCell(),
    title: "相手ゲート侵攻ボーナス",
    body: [
      "相手のゲート（各辺の中央のマス、これはその一例です）に自分の駒を置いたままターンを終えると、「相手ゲート侵攻ボーナス」が発生します。",
      "相手の手札を半分奪ったり、エターナルカードを獲得したりできる、対局を大きく動かすチャンスです。",
      "ボタン操作は不要で、条件を満たせば自動的に処理されます。",
    ],
  },
  {
    target: () => null,
    title: "以上で応用ルールも含めて終わりです",
    body: ["ここまで理解していれば十分に対戦を楽しめます。健闘を祈ります！"],
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
let finishHereBtn = null;
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

  // ユーザー要望「チュートリアルの続きを作りたい。『もっと詳しく説明しますか？』的な
  // やつを」への対応。isBranch:trueのステップ（基本の流れを終えた直後）だけ、通常の
  // 次へ/スキップの代わりにこのボタンを出す。「ここで終わる」を押した場合は
  // スキップと同じくfinishTutorial()（＝以後自動表示しない）を呼ぶ。
  finishHereBtn = document.createElement("button");
  finishHereBtn.type = "button";
  finishHereBtn.className = "tutorial-callout-skip";
  finishHereBtn.textContent = "ここで終わる";
  finishHereBtn.addEventListener("click", () => finishTutorial());

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
  buttonRow.appendChild(finishHereBtn);
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
// 画面端をはみ出す場合は反対側へ逃がす。この要素自身がステージ（body）配下の
// position:fixedのため、画面端の判定は実際のウィンドウサイズではなく、main.jsの
// positionPreviewPanelと同じくSTAGE_WIDTH/STAGE_HEIGHT基準で行う。引数の
// targetStageRectは既にtoStageRect()でステージのローカル座標へ変換済みのものとする。
function positionCallout(targetStageRect) {
  const margin = 16;
  const calloutRect = calloutEl.getBoundingClientRect();
  // calloutEl自身の実際の見た目サイズ(getBoundingClientRect、既にステージのscale込み)を
  // 幅・高さの比較に使うため、ステージのローカルサイズへ変換しておく。
  const calloutW = stageDeltaFn ? stageDeltaFn(calloutRect.width) : calloutRect.width;
  const calloutH = stageDeltaFn ? stageDeltaFn(calloutRect.height) : calloutRect.height;

  if (!targetStageRect) {
    calloutEl.style.left = `${stageWidth / 2}px`;
    calloutEl.style.top = `${stageHeight / 2}px`;
    calloutEl.style.transform = "translate(-50%, -50%)";
    return;
  }

  let left = targetStageRect.left + targetStageRect.width / 2;
  let top = targetStageRect.top + targetStageRect.height + margin;
  let transform = "translate(-50%, 0)";

  // 下にはみ出す場合は対象の上に出す
  if (top + calloutH > stageHeight - margin) {
    top = targetStageRect.top - margin;
    transform = "translate(-50%, -100%)";
  }
  // 左右にはみ出す場合は画面内に収める
  const halfWidth = calloutW / 2;
  if (left - halfWidth < margin) left = margin + halfWidth;
  if (left + halfWidth > stageWidth - margin) left = stageWidth - margin - halfWidth;

  calloutEl.style.left = `${left}px`;
  calloutEl.style.top = `${top}px`;
  calloutEl.style.transform = transform;
}

function positionForCurrentStep() {
  const step = STEPS[currentStepIndex];
  const target = step.target();
  if (target) {
    const realRect = target.getBoundingClientRect();
    const rect = toStageRect(realRect);
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
  // 自分の駒の移動範囲ハイライト（.cellは#game-tableの中身でrenderのたびに作り直される
  // ため、対象要素のスポットライトと同じくこの関数が呼ばれるたびに探し直す）。
  if (step.highlightMoveRange) {
    applyMoveRangeHighlight();
  } else {
    clearMoveRangeHighlight();
  }
}

function renderStep() {
  const step = STEPS[currentStepIndex];
  titleEl.innerHTML = "";
  // ユーザー提供の到達効果/手札効果アイコンを、該当ステップだけタイトルの横に添える。
  if (step.icon) {
    const iconImg = document.createElement("img");
    iconImg.className = "tutorial-callout-title-icon";
    iconImg.src = step.icon;
    iconImg.alt = "";
    titleEl.appendChild(iconImg);
  }
  titleEl.appendChild(document.createTextNode(step.title));
  // ユーザー要望「カードはもっともっと大きく」への対応で、カード例を出すステップだけ
  // コールアウト自体も広げる（style.cssの#tutorial-callout.is-wide参照）。
  calloutEl.classList.toggle("is-wide", Boolean(step.wide));
  bodyEl.innerHTML = "";
  for (const paragraph of step.body) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    bodyEl.appendChild(p);
  }
  step.renderExtra?.(bodyEl);
  if (step.footer) {
    for (const paragraph of step.footer) {
      const p = document.createElement("p");
      p.className = "tutorial-callout-footer";
      p.textContent = paragraph;
      bodyEl.appendChild(p);
    }
  }
  progressEl.textContent = `${currentStepIndex + 1} / ${STEPS.length}`;
  backBtn.disabled = currentStepIndex === 0;

  if (step.isBranch) {
    // 「もっと詳しく知りたいですか？」の分岐ステップ: 通常の次へ/スキップの代わりに
    // 「詳しく見る」（＝次のステップへ進む）/「ここで終わる」を出す。
    nextBtn.textContent = "詳しく見る";
    nextBtn.style.display = "";
    finishHereBtn.style.display = "";
    skipBtn.style.visibility = "hidden";
  } else {
    finishHereBtn.style.display = "none";
    nextBtn.style.display = "";
    nextBtn.textContent = currentStepIndex >= STEPS.length - 1 ? "始める" : "次へ";
    // 最初と最後のステップ（対象なし）はスキップする意味が薄いため、それ以外の間だけ出す。
    skipBtn.style.visibility = currentStepIndex === 0 || currentStepIndex === STEPS.length - 1 ? "hidden" : "visible";
  }
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
  clearMoveRangeHighlight();
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
