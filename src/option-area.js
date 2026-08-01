// ユーザー要望「オプション・マイページ・ヘルプ・金額表示・ターンラウンド数を『オプション
// エリア』としてまとめて位置・サイズ調整できるようにしてほしい」への対応。
// この5つのボタン/表示はそれぞれ別のファイル（help.js/currency-display.js/
// options-menu.js/my-page.js/main.js）で個別にdocument.bodyへappendChildされていたが、
// 「まとめて動かす・まとめて拡大縮小する」を実現するには実際に共通の親要素(transformの
// 基準点)を持たせる必要があるため、ここへ生成ロジックを一本化し、各ファイルは
// document.body.appendChild(...)の代わりにgetOptionArea().appendChild(...)を呼ぶ形にする。
// #option-areaのCSS（position/transform）はstyle.css側を参照。
let el = null;

export function getOptionArea() {
  if (!el) {
    el = document.createElement("div");
    el.id = "option-area";
    document.body.appendChild(el);
  }
  return el;
}

// body.full-screen-page-active は「全画面ページ（ホーム/プロフィール/ランキング/図鑑）が
// 開いている間、オプションエリアを前面に出す」ための共通クラス。以前は各ページが個別に
// add/removeしていたが、ランキング等をホームに重ねて開いてから閉じると、ホームがまだ
// 開いているのにクラスがremoveされてオプションエリアが盤面の裏へ回る（消える）バグがあった
// （ユーザー報告）。開いている全画面ページが1つでも残っていればON、無ければOFFに、DOMの
// 実状から毎回同期する。各ページのopen/closeの最後にこれを呼ぶ。
export function syncFullScreenPageActive() {
  const anyOpen = document.querySelector("#home-screen, #profile-page, #ranking-page, #codex-page");
  document.body.classList.toggle("full-screen-page-active", !!anyOpen);
}
