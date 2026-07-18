// 画面右上の「⚙ オプション」ボタン。押すと開発者/管理者向けの各種ツールへのリンクをまとめた
// 小さなドロップダウンが開く（今のところ「管理者モード」のみ）。以前は「⚙ 管理者モード」が
// 単独のボタンとして左上にあったが、ここに統合し、左上はゲームタイトル表示用に空けた。

import { openAdminPanel } from "./admin.js";
import { createBackdrop } from "./ui-helpers.js";

function buildMenuItem(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "options-menu-item";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

export function initOptionsMenu() {
  const panel = document.createElement("div");
  panel.id = "options-menu-panel";
  panel.style.display = "none";

  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
  }

  panel.appendChild(
    buildMenuItem("⚙ 管理者モード", () => {
      close();
      openAdminPanel();
    })
  );

  // ツールパネルなので背景は暗くしない。外側クリックで閉じる（統一ルール）。
  const backdrop = createBackdrop(close, { dim: false, zIndex: 999 });
  backdrop.style.display = "none";

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "options-menu-button";
  toggleBtn.textContent = "⚙ オプション";
  toggleBtn.addEventListener("click", open);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}
