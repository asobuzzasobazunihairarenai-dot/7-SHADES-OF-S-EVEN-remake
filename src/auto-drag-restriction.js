// 自動処理モードでの「ルールに反した自由なドラッグ」を制限する設定（ユーザー要望）。
// 既定はON（制限あり）。自動処理モード中は、掴めるのは自分の手札カードだけになり、駒・
// 盤面/ロックのカード・山札・捨て場・エターナル/ファースト束・相手の手札は掴めなくなる。
// さらに、自分の手札カードでも不正なドロップ（ロック不可タイミングでのロック、効果を使えない
// タイミングでの場ドロップ発動、山や相手の手札への配置など）は弾く（main.jsのfindDraggableAt/
// onDragEndを参照）。駒の移動は「移動フェイズで光る移動先マスをタップ」する正規の方法で従来
// どおり行える。
//
// 管理者だけがオプション画面からこの制限を解除できる（制限が無い方がテストしやすいため）。
// 解除状態はこの端末に保存する（localStorage）。

const STORAGE_KEY = "so7-auto-drag-restriction";

let enabled = true;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved !== null) enabled = saved === "1";
} catch (e) {
  /* localStorage不可の環境では既定（ON）のまま */
}

export function isAutoDragRestrictionEnabled() {
  return enabled;
}

export function setAutoDragRestrictionEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch (e) {
    /* 保存できなくても現在の実行中は反映される */
  }
}
