// 「盤面をWebGLで描く」かどうかの設定だけを持つ、依存の無い極小モジュール
// （auto-phase-skip-setting.js / board-card-display.js と同じ作法）。
//
// なぜ board-3d.js から分けるのか: board-3d.js は three.js（700KB弱）を静的importしている。
// 設定を読むだけのために options-menu.js からそれをimportすると、オプションを開くだけで
// three.js まで読み込むことになる。設定値だけをここに置き、実際の描画モジュールは
// 「使う時に動的import」する形にしておく。
//
// この設定は**アカウントに同期しない**（端末の性能に依る設定なので、端末ごとに決まるのが
// 自然。2D表示と同じ考え方）。

const KEY = "so7-board-3d-enabled";

// 2026-09-05から既定ON。iPhone/iPadのチカチカ・強制終了がこの描画で解消したことを実機で
// 確認できたため（それ以前は管理者モードの試験機能だった）。
export function isBoard3dEnabled() {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch (err) {
    return true;
  }
}

export function setBoard3dEnabledSetting(on) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch (err) {
    /* 保存できなくてもそのセッションでは効く */
  }
}
