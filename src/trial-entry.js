// 【2026-09-11・ユーザー要望】試遊の入口。アナログ版のクラウドファンディングのページから
// （戦績管理システム経由で）来た、まだ登録していない人のためのもの。
// URL に ?trial が付いている時だけ、タイトル画面でログインの代わりに
// 「遊び方を教わりながら遊ぶ／すぐにCPUと対戦する」を出す（opening-screen.js）。
// 初回のサウンド設定モーダルも出さない（main.js）——遊び始めるまでの手順を減らすため。
// 音量は既定のまま始まり、あとからオプションで変えられる。

export function isTrialEntry() {
  try {
    return new URLSearchParams(window.location.search).has("trial");
  } catch {
    return false;
  }
}

// ログインへ進む時に呼ぶ。Googleログインはページを離れて「今のURL」へ戻ってくるので、
// ?trial を残したままだと、ログインし終えた人にまた試遊の入口が出てしまう。
export function clearTrialParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("trial")) return;
    url.searchParams.delete("trial");
    history.replaceState(null, "", url.pathname + url.search + url.hash);
  } catch {
    /* URLを書き換えられなくても、遊ぶこと自体には影響しない */
  }
}
