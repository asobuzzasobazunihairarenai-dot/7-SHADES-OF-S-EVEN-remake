// マイデッキ編成ページのチュートリアル（ユーザー要望2026-08-28「マイデッキ編集画面に
// チュートリアルを表示させたいです」）。
//
// 盤面のチュートリアル（tutorial.js）とは**別実装**にしてある。理由:
//  ・tutorial.js は「暗幕＋スポットライトの穴」を実画面座標で開けるため、bodyのステージ
//    transform(scale)を打ち消す座標変換（stageClientToLocal）を main.js から注入してもらう
//    必要があり、盤面のstate購読とも結びついている。デッキ編集ページに持ち込むには
//    その配線ごと引き回すことになる。
//  ・こちらは**座標計算を一切しない**方式にした——対象の要素に一時的なCSSクラス
//    （.mdb-tut-highlight）を付けて光らせ、説明は画面下部に固定したパネルに出す。
//    ステージのscaleが何倍でも、要素が動いても、常に正しい位置が光る（ズレようがない）。
//
// 初回だけ自動表示し、以降はヘッダーの「？ 使い方」からいつでも見返せる（localStorage）。

import { t } from "./ui-text.js"; // UI英語化フェーズ9

const SEEN_KEY = "so7-deck-builder-tutorial-seen";

// UI英語化フェーズ9: 呼ぶたびに現在の言語で組み立てる（定数にすると読み込み時の言語で固定される）。
function getSteps() {
  return [
  {
    selector: null,
    title: t("mdbtut.s0.title"),
    body: [
      t("mdbtut.s0.b1"),
      t("mdbtut.s0.b2"),
    ],
  },
  {
    selector: "#mdb-collection",
    title: t("mdbtut.s1.title"),
    body: [
      t("mdbtut.s1.b1"),
      t("mdbtut.s1.b2"),
      t("mdbtut.s1.b3"),
    ],
  },
  {
    selector: "#mdb-deck-list",
    title: t("mdbtut.s2.title"),
    body: [
      t("mdbtut.s2.b1"),
      t("mdbtut.s2.b2"),
    ],
  },
  {
    selector: "#mdb-deck-case",
    title: t("mdbtut.s3.title"),
    body: [
      t("mdbtut.s3.b1"),
      t("mdbtut.s3.b2"),
      t("mdbtut.s3.b3"),
    ],
  },
  {
    selector: "#mdb-settings",
    title: t("mdbtut.s4.title"),
    body: [
      t("mdbtut.s4.b1"),
      t("mdbtut.s4.b2"),
    ],
  },
  {
    selector: "#mdb-summary",
    title: t("mdbtut.s5.title"),
    body: [
      t("mdbtut.s5.b1"),
      t("mdbtut.s5.b2"),
      t("mdbtut.s5.b3"),
    ],
  },
  {
    selector: "#mdb-save",
    title: t("mdbtut.s6.title"),
    body: [
      t("mdbtut.s6.b1"),
      t("mdbtut.s6.b2"),
    ],
  },
  ];
}

let overlayEl = null;
let stepIndex = 0;
let highlightedEl = null;

function hasSeen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch (err) {
    return false;
  }
}
function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch (err) {
    /* localStorageが使えなくても動作自体は問題ない */
  }
}

function clearHighlight() {
  if (highlightedEl) {
    highlightedEl.classList.remove("mdb-tut-highlight");
    highlightedEl = null;
  }
}

function renderStep() {
  const step = getSteps()[stepIndex];
  if (!overlayEl || !step) return;
  clearHighlight();
  // 対象があれば光らせる。無い（まだ描画されていない等）場合は説明だけを出す。
  if (step.selector) {
    const target = document.querySelector(step.selector);
    if (target) {
      target.classList.add("mdb-tut-highlight");
      highlightedEl = target;
      // 画面外なら見える位置まで送る（下段のデッキ一覧などはスクロールしていることがある）。
      target.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }
  overlayEl.querySelector(".mdb-tut-title").textContent = step.title;
  overlayEl.querySelector(".mdb-tut-body").innerHTML = step.body.map((t) => `<p>${t}</p>`).join("");
  overlayEl.querySelector(".mdb-tut-progress").textContent = `${stepIndex + 1} / ${getSteps().length}`;
  overlayEl.querySelector(".mdb-tut-prev").disabled = stepIndex === 0;
  overlayEl.querySelector(".mdb-tut-next").textContent = stepIndex === getSteps().length - 1 ? t("mdbtut.btn.start") : t("mdbtut.btn.next");
}

export function closeDeckBuilderTutorial() {
  clearHighlight();
  overlayEl?.remove();
  overlayEl = null;
  markSeen();
}

export function startDeckBuilderTutorial() {
  if (overlayEl) return;
  stepIndex = 0;

  overlayEl = document.createElement("div");
  overlayEl.id = "mdb-tutorial";
  overlayEl.innerHTML = `
    <div class="mdb-tut-panel">
      <div class="mdb-tut-head">
        <span class="mdb-tut-title"></span>
        <span class="mdb-tut-progress"></span>
      </div>
      <div class="mdb-tut-body"></div>
      <div class="mdb-tut-buttons">
        <button type="button" class="mdb-tut-skip">${t("mdbtut.btn.skip")}</button>
        <span class="mdb-tut-spacer"></span>
        <button type="button" class="mdb-tut-prev">${t("mdbtut.btn.back")}</button>
        <button type="button" class="mdb-tut-next">次へ</button>
      </div>
    </div>
  `;
  // 説明パネルは画面下部に固定する（暗幕は張らない＝チュートリアル中も実際に触って試せる）。
  overlayEl.querySelector(".mdb-tut-skip").addEventListener("click", closeDeckBuilderTutorial);
  overlayEl.querySelector(".mdb-tut-prev").addEventListener("click", () => {
    if (stepIndex > 0) {
      stepIndex--;
      renderStep();
    }
  });
  overlayEl.querySelector(".mdb-tut-next").addEventListener("click", () => {
    if (stepIndex < getSteps().length - 1) {
      stepIndex++;
      renderStep();
    } else {
      closeDeckBuilderTutorial();
    }
  });
  document.body.appendChild(overlayEl);
  renderStep();
}

// マイデッキ編成ページを開いた時に呼ぶ。初回だけ自動で出す。
export function maybeAutoStartDeckBuilderTutorial() {
  if (hasSeen()) return;
  // ページの要素が揃ってから光らせたいので、描画直後の1フレーム後に開始する。
  setTimeout(() => startDeckBuilderTutorial(), 300);
}
