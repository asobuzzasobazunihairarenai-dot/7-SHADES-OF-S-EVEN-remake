// 「自分の手札を画面下に固定する」設定（ユーザー要望2026-08-07）。ONにすると、自分の手札を
// 3D盤面の中（盤面ズームの影響を受ける）ではなく、ステータスエリアと同じく盤面ズームの外側の
// 固定オーバーレイ（画面下の平らな手札トレイ）に描画する。マウスホイールで盤面を拡大しても
// 手札が見切れず一定サイズ・一定位置で見える。OFF（既定）は従来通り盤面に馴染んだ斜めの手札。
//
// 実体は body.fixed-hand-mode クラスの付け外し＋端末保存（localStorage）だけ。実際に手札DOMを
// オーバーレイへ移す・固定位置に並べるのは main.js の render()／CSS 側が担当する。

const KEY = "so7-fixed-hand";

// ユーザー要望2026-08-08: 既定をON（手札を画面下に固定）にする。未設定（新規端末）はON、
// 明示的にOFF("off")にしたことがある端末はその選択を尊重する。
let enabled = true;
try {
  const stored = localStorage.getItem(KEY);
  enabled = stored === null ? true : stored === "on";
} catch {
  /* 使えなくても既定(ON)で動く */
}

export function isFixedHandEnabled() {
  return enabled;
}

// 起動時に一度呼ぶ。保存済みの状態を body クラスへ反映する。
export function applyStoredFixedHand() {
  document.body.classList.toggle("fixed-hand-mode", enabled);
}

export function setFixedHandEnabled(v) {
  enabled = !!v;
  document.body.classList.toggle("fixed-hand-mode", enabled);
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    /* 保存できなくてもそのセッションでは効く */
  }
  // 手札DOMをオーバーレイへ移す／戻すのは render() が判断するため、切り替え直後に再描画させる。
  window.dispatchEvent(new CustomEvent("admin:change"));
}
