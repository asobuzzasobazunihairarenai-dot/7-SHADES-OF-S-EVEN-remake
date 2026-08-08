// 盤面のカードを「イラストのみ画像」で表示するかどうかの設定だけを持つ、依存の無い極小モジュール。
// ユーザー要望「盤面（場・捨て場・ロックエリア）のカードは遠景で文字が読めないので、イラスト
// だけのカード画像で映えさせたい。ホバー拡大や手札は通常のテキストあり画像のままで」。
//
// この端末のみの見た目設定（localStorage、相手には同期しない——盤面の描画に使う画像を選ぶだけで
// ゲーム状態には一切影響しないため）。auto-phase-skip-setting.jsと同じく「何もimportしない葉
// モジュール」にして、cards-data.js/main.js/options-menu.js等どこからimportしても循環・評価順の
// 問題が起きないようにする。

const STORAGE_KEY = "so7-board-illust-only";
// ユーザー要望2026-08-08: 既定をON（イラストのみ表示）にする。未設定（新規端末）はON、
// 明示的にOFF("0")にしたことがある端末はその選択を尊重する。
let illustOnly = true;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  illustOnly = stored === null ? true : stored === "1";
} catch (e) {
  /* localStorageが読めなければ既定ON */
}

export function isBoardIllustOnly() {
  return illustOnly;
}

export function setBoardIllustOnly(v) {
  illustOnly = !!v;
  try {
    localStorage.setItem(STORAGE_KEY, illustOnly ? "1" : "0");
  } catch (e) {
    /* 保存できなくても実行中は反映される */
  }
  // 盤面を再描画させる（main.jsがadmin:changeでrender()する既存の仕組みに相乗り）。
  window.dispatchEvent(new CustomEvent("admin:change"));
}
