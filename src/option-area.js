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
