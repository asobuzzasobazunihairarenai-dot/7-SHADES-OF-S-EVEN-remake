// 起動直後に表示するオープニング画面。「ローカル」「オンライン」の2択メニューを持つ、
// ユーザー提供の背景画像(assets/opening.webp)がゆっくりフェードインする単純なゲート。
// ゲーム本体は裏で従来通りすぐに初期化・描画されている（このモジュールは純粋な見た目の
// 最前面オーバーレイであり、ゲームロジック自体には一切関与しない）。「ローカル」は
// このオーバーレイを閉じるだけ（＝今までの初期画面がそのまま現れる、ローカルモードは
// 元々デフォルトの起動状態のため特別な処理は不要）。「オンライン」は閉じた上で、
// 右上の「🌐」ステータスから開くのと同じopenOnlinePanel()を呼ぶ。

import { openOnlinePanel } from "./online-ui.js";

// フェードアウトのCSSトランジション時間と合わせる（style.cssの#opening-screen.is-closing参照）。
const CLOSE_TRANSITION_MS = 600;

export function initOpeningScreen() {
  const overlay = document.createElement("div");
  overlay.id = "opening-screen";

  const bg = document.createElement("div");
  bg.className = "opening-screen-bg";
  bg.style.backgroundImage = 'url("assets/opening.webp")';
  overlay.appendChild(bg);

  const dim = document.createElement("div");
  dim.className = "opening-screen-dim";
  overlay.appendChild(dim);

  const content = document.createElement("div");
  content.className = "opening-screen-content";

  // 背景画像自体に既にタイトルロゴ（「7 SHADES OF S:EVEN」「運命の7つの贈り物」）が
  // 描き込まれているため、重複する文字は追加しない。メニューだけを画面下寄りに置く。
  const menu = document.createElement("div");
  menu.className = "opening-screen-menu";
  content.appendChild(menu);

  function close(after) {
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.style.display = "none";
      if (after) after();
    }, CLOSE_TRANSITION_MS);
  }

  function buildMenuButton(label, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "opening-screen-menu-btn";
    btn.textContent = label;
    btn.addEventListener("click", onClick);
    menu.appendChild(btn);
  }

  buildMenuButton("ローカル", () => close());
  buildMenuButton("オンライン", () => close(openOnlinePanel));

  overlay.appendChild(content);
  document.body.appendChild(overlay);
}
