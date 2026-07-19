// 盤面のレイアウトに関する固定定数。main.js（描画）とstate.js（セットアップウィザードの
// アクション）の両方から参照するため、どちらか一方に属させると重複・ズレの元になることから
// 独立したモジュールに切り出した。

// 7色の並び順。ロックエリアの各スロットのindex(0-6)や駒・ファーストカードの色と対応する。
export const COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

// 場（7x7の計49マス）の中で「ゲート」にあたるマス（各辺の中央）。
export const GATE_POSITIONS = {
  top: { row: 0, col: 3 },
  bottom: { row: 6, col: 3 },
  left: { row: 3, col: 0 },
  right: { row: 3, col: 6 },
};

// 座席(A/B/C/D)と、盤面の辺(top/bottom/left/right)の対応。Aが自分（手前）、以降時計回り。
export const SEAT_TO_SIDE = { A: "bottom", B: "left", C: "top", D: "right" };

// SEAT_TO_SIDEの逆引き（あるゲートの辺から、そのゲートの持ち主の座席を引く。
// 相手ゲート侵攻ボーナスの判定=「駒がどの座席のゲートに乗っているか」に使う）。
export const SIDE_TO_SEAT = { bottom: "A", left: "B", top: "C", right: "D" };

// 時計回りの座席順（ターン順・セットアップ時のファーストカード配布順に使う）。
export const SEAT_ORDER = ["A", "B", "C", "D"];

// 以前はAだけ「プレイヤーA（自分）」と「自分」の文字を名前自体に焼き込んでいたが、
// オンライン対戦では「自分」がAとは限らないため、単なる座席名に統一した。「（自分）」の
// 表示は、実際に見ている本人にだけ意味のある場所（main.jsのupdateSelfHandStatus、
// 自分専用ステータス）で動的に付け足すようにしている。
export const SEAT_LABELS = { A: "プレイヤーA", B: "プレイヤーB", C: "プレイヤーC", D: "プレイヤーD" };

// --- 盤面のビューア視点回転 ---------------------------------------------------------
// 自分がA以外の座席で参加していても、常に自分の座席が画面手前(bottom)に来るようにする
// ための表示専用の回転計算。row/col・side・座席の「実データ」は一切変更せず（ゲーム
// ルール・サーバー同期・drag/dropの当たり判定は全部このモジュールのimportしていない
// 実データを使い続ける）、「実データ→画面上どこに描画するか」の対応だけをここで計算する。
// このモジュールはgetSelfSeat()（online.js）を一切importしない依存の無い葉モジュールの
// ままにする（online.js→state.js→board-layout.jsという既存の依存の向きがあるため、
// ここから逆にonline.jsを参照すると循環importになる）。回転量(steps)は必ず呼び出し元
// （main.js）がgetSelfSeat()から計算し、引数として渡す設計にしている。

// 画面上の辺(top/bottom/left/right)が、盤面を時計回りに90度回転させるたびに
// どう入れ替わるかの並び順。
const SIDE_CW = ["top", "right", "bottom", "left"];

// 自分の座席(selfSeat)を画面手前(bottom)に持ってくるために、盤面を時計回りに
// 何回(90度単位)回転させる必要があるかを返す。A=0, B=3, C=2, D=1。
export function getRotationSteps(selfSeat) {
  return (4 - SEAT_ORDER.indexOf(selfSeat)) % 4;
}

// 盤面7x7マスの実座標(row,col)を、steps回(90度単位、時計回り)回転させた
// 「表示用」座標に変換する（データ自体は変えない。描画位置の計算専用）。
export function rotateCell(row, col, steps) {
  const N = 7;
  switch (((steps % 4) + 4) % 4) {
    case 1:
      return { row: col, col: N - 1 - row };
    case 2:
      return { row: N - 1 - row, col: N - 1 - col };
    case 3:
      return { row: N - 1 - col, col: row };
    default:
      return { row, col };
  }
}

// side文字列("top"等)をsteps回(90度単位、時計回り)回転させた表示用sideを返す。
export function rotateSide(side, steps) {
  const idx = SIDE_CW.indexOf(side);
  return SIDE_CW[(idx + ((steps % 4) + 4) % 4) % 4];
}
