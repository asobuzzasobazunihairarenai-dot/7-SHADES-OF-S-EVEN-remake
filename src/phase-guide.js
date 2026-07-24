// フェイズ案内板: 「ロック」「ハンド」「ムーブ」フェイズを画面右下（他のアイコンボタン
// 群の近く）に、ユーザー提供のアイコン画像で常設表示する。以前はテキストラベルの3項目を
// 画面最下部中央に表示していたが、ユーザーが専用のアイコン画像（ロック/ハンド/ムーブ
// フェイズ.webp）を用意したのに合わせ、他のアイコンボタン（手札シャッフル等）と同じ
// 「アイコン+キャプション、ホバーで簡易説明・キャプションクリックで詳細説明」の見た目・
// 操作感に統一し、位置も右下へ引っ越した（icon-action-button.jsの共通部品をそのまま流用）。
// 現時点ではstate.jsに「今どのフェイズか」という状態が無いため、あくまで静的な案内として
// 実装する（強制力なし、自己申告のPhase1方針のまま）。将来、効果処理の全自動化にあわせて
// フェイズ状態を持たせた時、この案内板の該当ボタンを発光させる形で「今のフェイズ」を
// 示せるようにする想定（そのための土台として、ボタンをフェイズidで識別できるようにしてある）。

import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";

const PHASES = [
  {
    id: "lock",
    label: "ロック",
    icon: "assets/icons/lock-phase.webp",
    short: "手札を1枚だけロックできます（任意）",
    detail: [
      "あなたの手札を1枚だけロックしてもよい（ロックしなくてもよい）。",
      "ロックしたカードは原則、手札ではなくなり手札効果を使用できない（例外: ファーストカードとエターナルカードの手札効果は特別に使用できる）。",
    ],
  },
  {
    id: "hand",
    label: "ハンド",
    icon: "assets/icons/hand-phase.webp",
    short: "手札を何枚でも使えます（任意）",
    detail: [
      "あなたの手札を何枚でも使ってもよい（使わなくてもよい）。手札効果はそのカード自身を捨てることで得ることができる。",
      "使用する時以外、手札は原則、相手に見せないようにプレイする。手札枚数に上限はない。",
    ],
  },
  {
    id: "move",
    label: "ムーブ",
    icon: "assets/icons/move-phase.webp",
    short: "「移動」か「接触」のどちらかを必ず行います",
    detail: [
      "以下のどちらか一方を必ず行わなければならない。",
      "◆隣のマスに「移動」する：自分の隣（前後左右の4マス）の、カードのみが置かれたマスに自分の駒を置く。そのマスの一番上のカードが裏向きならオープンする。表向きのカードの上に駒が乗ったら「到達」効果を得て、処理後は原則そのカードを手札に加える。相手の駒があるマスには移動できない。",
      "◆隣の相手に「接触」する：自分の隣にいる相手の駒を選び、その相手の手札を無作為に1枚もらう。その相手は自分のゲートへ強制移動する（接触した自分自身は移動しない）。",
      "※「カード」も「相手の駒」も隣に無い場合は、隣の任意の1マスへ山札から1枚表向きに置いてターンを終了する。",
    ],
  },
];

function buildPhaseButton(phase) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = `phase-guide-${phase.id}-button`;
  btn.dataset.phase = phase.id;
  const { captionEl } = buildIconButtonContent(btn, { icon: phase.icon, tooltip: phase.short });
  captionEl.textContent = phase.label;
  wireIconButtonClick(btn, {
    detailTitle: `${phase.label}フェイズ`,
    detailParagraphs: phase.detail,
    // ユーザー要望「フェイズ案内板の詳細説明についてアイコンをクリックでも表示される
    // ようにしてほしい」。icon-action-button.jsの共通部品は本来「アイコン=実際の操作、
    // キャプション文字=詳細説明」という役割分担だが、このボタン群には実行すべき操作が
    // 元々無い（案内専用）。他のボタン（1枚ドロー等）と違ってicon-action-button.js側の
    // 共通挙動を変える必要は無く、このボタンだけonAction（アイコンクリック時）でも
    // キャプションクリックと同じ詳細モーダルを開けばよい。
    onAction: () => openIconDetailModal(`${phase.label}フェイズ`, phase.detail),
  });
  return btn;
}

export function initPhaseGuide() {
  const bar = document.createElement("div");
  bar.id = "phase-guide-bar";
  for (const phase of PHASES) {
    bar.appendChild(buildPhaseButton(phase));
  }
  document.body.appendChild(bar);
}
