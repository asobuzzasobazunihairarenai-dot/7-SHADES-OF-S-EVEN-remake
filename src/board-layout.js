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
