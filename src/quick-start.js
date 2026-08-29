// クイックスタート: 画面右上に「無色あり/なし」の切り替えと「2人/3人/4人」のボタンを常設し、
// 押すだけでセットアップウィザードの０〜３を一気に実行できるようにする（通常のウィザードを
// 開かずに素早く対戦を始めたい時向け）。無色カードの選択はデフォルトで「無色なし」
// （説明書の「初めてプレイする時は外すと簡単」という推奨に合わせる、ウィザード本体の
// デフォルトと同じ）。

import { quickStart } from "./game-setup.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

let includeBlackWhite = false;

function buildToggle() {
  const wrap = document.createElement("div");
  wrap.className = "quick-start-toggle";

  const noneBtn = document.createElement("button");
  noneBtn.textContent = t("qs.noColorless");
  const someBtn = document.createElement("button");
  someBtn.textContent = t("qs.withColorless");

  function refresh() {
    noneBtn.classList.toggle("is-selected", !includeBlackWhite);
    someBtn.classList.toggle("is-selected", includeBlackWhite);
  }
  noneBtn.addEventListener("click", () => {
    includeBlackWhite = false;
    refresh();
  });
  someBtn.addEventListener("click", () => {
    includeBlackWhite = true;
    refresh();
  });
  refresh();

  wrap.appendChild(noneBtn);
  wrap.appendChild(someBtn);
  return wrap;
}

function buildCountButtons() {
  const wrap = document.createElement("div");
  wrap.className = "quick-start-counts";
  for (const count of [2, 3, 4]) {
    const btn = document.createElement("button");
    btn.textContent = t("qs.countN", { n: count });
    btn.title = t("qs.tip");
    btn.addEventListener("click", () => quickStart(count, includeBlackWhite));
    wrap.appendChild(btn);
  }
  return wrap;
}

export function initQuickStart() {
  const bar = document.createElement("div");
  bar.id = "quick-start-bar";
  bar.appendChild(buildToggle());
  bar.appendChild(buildCountButtons());
  document.body.appendChild(bar);
}
