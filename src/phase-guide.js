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
import { isAutoPhaseSkipEnabled, setAutoPhaseSkipEnabled } from "./auto-phase-skip-setting.js";

// tutorial.jsのチュートリアル手順から、フェイズの説明文をそのまま使い回すためexportする
// （説明文の二重管理を避ける）。
export const PHASES = [
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
    // ユーザー要望「チュートリアルの『ムーブフェイズ』について文章が多くて少し読むのが
    // おっくうになる。文字の装飾や挿絵等で読む気にさせることできる？」への対応。
    // ルール内容自体は変えず、1つの長い文をより短い複数のbodyに分割し、行動ごとに
    // 絵文字の見出し（🚶移動/🤝接触/📥その他）を付けて視覚的に区切った（この配列は
    // phase-guide.js自身のクリック詳細モーダル・tutorial.jsのチュートリアル・
    // help.jsの静的ヘルプページの3箇所で共有されているため、ここを直せば3箇所とも
    // 改善される）。
    detail: [
      "ムーブフェイズでは、次のどちらか一方を必ず行います。",
      "🚶 移動：自分の隣（前後左右の4マス）の、カードだけが置かれたマスへ駒を置きます。",
      "　カードが裏向きならオープンします。表向きなら「到達」効果が発動し、そのカードは原則そのまま手札に加わります。",
      "　相手の駒がいるマスへは移動できません。",
      "🤝 接触：隣にいる相手の駒を選び、その相手の手札から無作為に1枚もらいます。",
      "　接触された相手は自分のゲートへ強制移動します（接触した自分自身は動きません）。",
      "📥 隣に「カード」も「相手の駒」も無い場合：隣の任意の1マスへ山札から1枚表向きに置いてターンを終了します。",
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

// ユーザー要望「自動フェイズスキップのオン/オフボタンを、フェイズ案内板のロックアイコンの
// 左隣に新設したい。ONなら今まで通り自動でフェイズを送る、OFFなら自分でスキップを押すまで
// 送らない（ロックできる手札が無いこと等を相手に悟られないため）」。スキップボタンは
// バー末尾（右側）にappendされるため、この常設トグルはバー先頭（左側）に置いて干渉を避ける。
function buildAutoSkipToggleButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "phase-auto-skip-toggle";
  btn.classList.add("icon-action-button", "phase-auto-skip-toggle");

  const iconWrap = document.createElement("span");
  iconWrap.className = "icon-action-button-icon-wrap";
  const glyph = document.createElement("span");
  glyph.className = "phase-auto-skip-toggle-glyph";
  glyph.textContent = "⏭";
  const stateBadge = document.createElement("span");
  stateBadge.className = "phase-auto-skip-toggle-state";
  iconWrap.appendChild(glyph);
  iconWrap.appendChild(stateBadge);

  const caption = document.createElement("span");
  caption.className = "icon-action-button-caption";
  caption.textContent = "自動送り";

  btn.appendChild(iconWrap);
  btn.appendChild(caption);

  const sync = () => {
    const on = isAutoPhaseSkipEnabled();
    btn.classList.toggle("is-on", on);
    btn.classList.toggle("is-off", !on);
    stateBadge.textContent = on ? "ON" : "OFF";
    btn.title = on
      ? "フェイズ自動送り: ON（することが無いフェイズは自動でスキップします）"
      : "フェイズ自動送り: OFF（自分でスキップを押すまでフェイズを送りません。ロックできる手札が無いこと等を相手に悟られません）";
  };
  btn.addEventListener("click", () => {
    setAutoPhaseSkipEnabled(!isAutoPhaseSkipEnabled());
    sync();
  });
  sync();
  return btn;
}

export function initPhaseGuide() {
  const bar = document.createElement("div");
  bar.id = "phase-guide-bar";
  bar.appendChild(buildAutoSkipToggleButton()); // ロックアイコンの左隣（バー先頭）
  for (const phase of PHASES) {
    bar.appendChild(buildPhaseButton(phase));
  }
  document.body.appendChild(bar);
}
