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

// --- 「盤面のDOMを描き直したので、WebGL側も作り直して」の合図 ---------------------------
// 【#297「移動で移動先に着地するとき一瞬駒が消えます」】盤面のWebGL描画は
// ①ゲーム状態が変わった時 ②500msごとの保険 の2つでしか作り直していなかった。ところが
// 駒の着地では「隠していた駒を戻すためだけの render()」が走る——状態は何も変わらないので
// ①では拾われず、②までの最大0.5秒、実物の駒は**箱はあるが絵が無い**状態になる。
// ゴーストは着地の2フレーム後に消えるので、その差が「一瞬消える」に見えていた。
// render() から毎回この合図を送れば、次のフレームで必ず描き直される。
// ここに置くのは board-3d.js が three.js を静的importしているため（main.js から直接
// importすると起動時に700KB弱を読み込むことになる）。実際の描画モジュールが動いている時だけ
// 中身が入り、止まっている時は何もしない空関数のまま。
let invalidator = null;
export function setBoard3dInvalidator(fn) {
  invalidator = typeof fn === "function" ? fn : null;
}
export function invalidateBoard3d() {
  try {
    invalidator?.();
  } catch (err) {
    /* 描画の作り直しの合図なので、失敗しても描画以外に影響はさせない */
  }
}

// --- 「今すぐ描き直して」（同じフレームのうちに） -----------------------------------------
// 【#301/#302】飛翔演出は、実物のカード・駒を `style.visibility` で直接隠したり見せたりする
// （ゴーストと二重に見えないようにするため）。これは **render() を通らない DOM の変化**なので、
// 上の invalidateBoard3d（render() から送る合図）では拾えない。しかも仮に拾えても、実際に
// 描き直されるのは**次のフレーム**——実機のログでは1フレームが 60〜200ms あるので、その間
// 「箱はあるが絵が無い」状態が見えてしまう（＝「駒が一瞬フレームだけになる」「ロックカードが
// 一瞬消える」）。
// そこで「その場で（同期的に）作り直して描く」口を用意する。実物を見せた直後・ゴーストを
// 消す直前に呼べば、DOMの変化とWebGLの絵が**同じ描画のタイミング**で入れ替わる。
//
// ★演出を書く時のルール: 盤面の実物を `visibility` で隠す／見せたら、その直後に
//   flushBoard3d() を呼ぶこと。render() を呼んでいる場合も、ゴーストを消す前に呼ぶ。
let flusher = null;
export function setBoard3dFlusher(fn) {
  flusher = typeof fn === "function" ? fn : null;
}
export function flushBoard3d() {
  try {
    flusher?.();
  } catch (err) {
    /* 描き直しの失敗で演出そのものを止めない */
  }
}
