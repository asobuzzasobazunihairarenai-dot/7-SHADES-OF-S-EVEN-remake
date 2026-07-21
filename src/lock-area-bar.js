// ロックエリアバー: ロックエリアと盤面(49マス)の間に置く装飾画像（画像素材/ロックエリアバー/を
// assets/lock-area-bar.webpとしてコピー、他の実物画像素材と同じ理由でgit管理外）。
// 表示/非表示はオプションメニューの「基本設定」から切り替える（main.jsのrender()の度に
// isLockAreaBarVisible()を見て4本のdisplayを切り替える）。位置・大きさは管理者モードから。

let visible = true;

export function isLockAreaBarVisible() {
  return visible;
}

export function setLockAreaBarVisible(next) {
  visible = next;
}
