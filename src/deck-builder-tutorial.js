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

const SEEN_KEY = "so7-deck-builder-tutorial-seen";

const STEPS = [
  {
    selector: null,
    title: "マイデッキを作ろう",
    body: [
      "ここは、対戦で使う自分だけの山札（マイデッキ）を組む画面です。",
      "作ったデッキはランク戦・CPU戦などで使えます。まずは全体の流れを見ていきましょう。",
    ],
  },
  {
    selector: "#mdb-collection",
    title: "① 所持カードから選ぶ",
    body: [
      "上段はあなたが持っているカードの一覧です。",
      "カードを<b>クリックすると1枚デッキに入ります</b>。もう一度押せばもう1枚追加できます。",
      "カードの上にカーソルを置くと拡大表示、右クリックでそのカードの補足説明が読めます。",
    ],
  },
  {
    selector: "#mdb-deck-list",
    title: "② 今のデッキを確認する",
    body: [
      "下段が現在のデッキです。「×2」のように枚数が出ます。",
      "<b>クリックすると1枚だけデッキから戻せます</b>（間違えて入れた時はここから減らします）。",
    ],
  },
  {
    selector: "#mdb-deck-case",
    title: "③ 箱絵を決める",
    body: [
      "デッキの箱です。マイデッキ一覧やマイページに、この見た目で並びます。",
      "<b>カードをここへドラッグすると、その絵が箱絵になります</b>。",
      "指定しない間は、一番多く入れているカードが自動で表紙になります。",
    ],
  },
  {
    selector: "#mdb-settings",
    title: "④ デッキごとの見た目と色",
    body: [
      "ファーストカードの色（＝あなたが担当する色）と、駒スキン・ペット・カード裏面を、このデッキ専用に決められます。",
      "色は「ランダム」にしておくと、対戦開始時に自動で決まります。",
    ],
  },
  {
    selector: "#mdb-summary",
    title: "⑤ デッキのルール",
    body: [
      "ここに現在の枚数と、ルールを満たしているかが出ます。",
      "・<b>7枚以上</b>入れること<br>・<b>同じ名前のカードは7枚まで</b><br>・<b>SPカード1枚につき、SPでないカードが3枚必要</b>",
      "条件を満たすまで「完了（保存）」は押せません。",
    ],
  },
  {
    selector: "#mdb-save",
    title: "⑥ 保存して終わり",
    body: [
      "「完了（保存）」で保存します。デッキ名は上の欄からいつでも変更できます。",
      "それでは、あなただけのデッキを作ってみてください！",
    ],
  },
];

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
  const step = STEPS[stepIndex];
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
  overlayEl.querySelector(".mdb-tut-progress").textContent = `${stepIndex + 1} / ${STEPS.length}`;
  overlayEl.querySelector(".mdb-tut-prev").disabled = stepIndex === 0;
  overlayEl.querySelector(".mdb-tut-next").textContent = stepIndex === STEPS.length - 1 ? "はじめる" : "次へ";
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
        <button type="button" class="mdb-tut-skip">スキップ</button>
        <span class="mdb-tut-spacer"></span>
        <button type="button" class="mdb-tut-prev">戻る</button>
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
    if (stepIndex < STEPS.length - 1) {
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
