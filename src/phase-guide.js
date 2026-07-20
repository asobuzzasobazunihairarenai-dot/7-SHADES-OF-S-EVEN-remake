// フェイズ案内板: 画面最下部中央に「ロック」「ハンド」「ムーブ」の3つを常設表示する。
// ホバーで簡易説明のツールチップ、クリックで詳細説明のモーダルを表示する（docs/rulebook.md
// 「The Flow of Your Turn」の内容をそのまま要約）。
// 現時点ではstate.jsに「今どのフェイズか」という状態が無いため、あくまで静的な案内として
// 実装する（強制力なし、自己申告のPhase1方針のまま）。将来、効果処理の全自動化にあわせて
// フェイズ状態を持たせた時、この案内板の該当ボタンを発光させる形で「今のフェイズ」を
// 示せるようにする想定（そのための土台として、ボタンをフェイズidで識別できるようにしてある）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

const PHASES = [
  {
    id: "lock",
    label: "ロック",
    short: "手札を1枚だけロックできます（任意）",
    detail: [
      "あなたの手札を1枚だけロックしてもよい（ロックしなくてもよい）。",
      "ロックしたカードは原則、手札ではなくなり手札効果を使用できない（例外: ファーストカードとエターナルカードの手札効果は特別に使用できる）。",
    ],
  },
  {
    id: "hand",
    label: "ハンド",
    short: "手札を何枚でも使えます（任意）",
    detail: [
      "あなたの手札を何枚でも使ってもよい（使わなくてもよい）。手札効果はそのカード自身を捨てることで得ることができる。",
      "使用する時以外、手札は原則、相手に見せないようにプレイする。手札枚数に上限はない。",
    ],
  },
  {
    id: "move",
    label: "ムーブ",
    short: "「移動」か「接触」のどちらかを必ず行います",
    detail: [
      "以下のどちらか一方を必ず行わなければならない。",
      "◆隣のマスに「移動」する：自分の隣（前後左右の4マス）の、カードのみが置かれたマスに自分の駒を置く。そのマスの一番上のカードが裏向きならオープンする。表向きのカードの上に駒が乗ったら「到達」効果を得て、処理後は原則そのカードを手札に加える。相手の駒があるマスには移動できない。",
      "◆隣の相手に「接触」する：自分の隣にいる相手の駒を選び、その相手の手札を無作為に1枚もらう。その相手は自分のゲートへ強制移動する（接触した自分自身は移動しない）。",
      "※「カード」も「相手の駒」も隣に無い場合は、隣の任意の1マスへ山札から1枚表向きに置いてターンを終了する。",
    ],
  },
];

let modalBackdrop = null;
let modalEl = null;
let modalTitleEl = null;
let modalBodyEl = null;

function openPhaseModal(phase) {
  modalTitleEl.textContent = `${phase.label}フェイズ`;
  modalBodyEl.innerHTML = "";
  for (const paragraph of phase.detail) {
    const p = document.createElement("p");
    p.style.cssText = "margin: 0 0 0.6rem 0; line-height: 1.6;";
    p.textContent = paragraph;
    modalBodyEl.appendChild(p);
  }
  modalBackdrop.style.display = "block";
  modalEl.style.display = "block";
}

function closePhaseModal() {
  modalBackdrop.style.display = "none";
  modalEl.style.display = "none";
}

function buildModal() {
  modalBackdrop = createBackdrop(closePhaseModal, { dim: true, zIndex: 10100 });
  modalBackdrop.style.display = "none";

  modalEl = document.createElement("div");
  modalEl.id = "phase-guide-modal";
  modalEl.style.display = "none";
  modalEl.appendChild(createModalCloseX(closePhaseModal));

  modalTitleEl = document.createElement("div");
  modalTitleEl.className = "phase-guide-modal-title";
  modalEl.appendChild(modalTitleEl);

  modalBodyEl = document.createElement("div");
  modalBodyEl.className = "phase-guide-modal-body";
  modalEl.appendChild(modalBodyEl);

  document.body.appendChild(modalBackdrop);
  document.body.appendChild(modalEl);
}

function buildPhaseButton(phase) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "phase-guide-item";
  btn.dataset.phase = phase.id;

  const labelEl = document.createElement("span");
  labelEl.className = "phase-guide-item-label";
  labelEl.textContent = phase.label;
  btn.appendChild(labelEl);

  const tooltip = document.createElement("span");
  tooltip.className = "phase-guide-tooltip";
  tooltip.textContent = phase.short;
  btn.appendChild(tooltip);

  btn.addEventListener("click", () => openPhaseModal(phase));

  return btn;
}

export function initPhaseGuide() {
  buildModal();

  const bar = document.createElement("div");
  bar.id = "phase-guide-bar";
  for (const phase of PHASES) {
    bar.appendChild(buildPhaseButton(phase));
  }
  document.body.appendChild(bar);
}
