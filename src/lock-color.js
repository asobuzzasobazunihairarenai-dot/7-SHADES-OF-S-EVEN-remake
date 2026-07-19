// ロックエリアの各スロットの色分け（枠線・グロー）の表示/非表示。デフォルトは表示。
// オフにすると、7色の色分けをせず全スロット共通の控えめなグレーの枠だけになる
// （main.jsのbuildLockAreaがこのフラグを見て、borderColor/colorの上書きをスキップする。
// CSS側の.lock-slotのデフォルト値がそのまま「無色」表示になる）。
// 表示/非表示はオプションメニューの「基本設定」から切り替える。

let visible = true;

export function isLockColorVisible() {
  return visible;
}

export function setLockColorVisible(next) {
  visible = next;
}
