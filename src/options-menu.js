// 画面右上の「⚙ オプション」ボタン。押すと開発者/管理者向けの各種ツールや、プレイヤーが
// その場で切り替えたい基本設定をまとめた小さなドロップダウンが開く。以前は「⚙ 管理者モード」が
// 単独のボタンとして左上にあったが、ここに統合し、左上はゲームタイトル表示用に空けた。

import { openAdminPanel } from "./admin.js";
import { isLockAreaBarVisible, setLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible, setLockColorVisible } from "./lock-color.js";
import { createBackdrop } from "./ui-helpers.js";

function buildMenuItem(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "options-menu-item";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildSectionTitle(text) {
  const el = document.createElement("div");
  el.className = "options-menu-section-title";
  el.textContent = text;
  return el;
}

function buildCheckboxRow(label, checked, onChange) {
  const row = document.createElement("label");
  row.className = "options-menu-checkbox-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.addEventListener("change", () => onChange(checkbox.checked));
  const span = document.createElement("span");
  span.textContent = label;
  row.appendChild(checkbox);
  row.appendChild(span);
  return row;
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

  panel.appendChild(buildSectionTitle("基本設定"));
  panel.appendChild(
    buildCheckboxRow("ロックエリアバーを表示する", isLockAreaBarVisible(), (checked) => {
      setLockAreaBarVisible(checked);
      window.dispatchEvent(new CustomEvent("admin:change"));
    })
  );
  panel.appendChild(
    buildCheckboxRow("ロックエリアの色を表示する", isLockColorVisible(), (checked) => {
      setLockColorVisible(checked);
      window.dispatchEvent(new CustomEvent("admin:change"));
    })
  );

  const divider = document.createElement("div");
  divider.className = "options-menu-divider";
  panel.appendChild(divider);

  panel.appendChild(
    buildMenuItem("⚙ 管理者モード", () => {
      close();
      openAdminPanel();
    })
  );

  // ツールパネルなので背景は暗くしない。外側クリックで閉じる（統一ルール）。
  // ハマりどころ: このパネル自体のz-index(901)は他パネル(999〜1000)より低くしてあるため、
  // backdropも合わせて低くしないと（以前ここを999のままにしていた）、backdropがパネルより
  // 手前に来てパネル内のボタン・チェックボックスへのクリックを奪ってしまい、
  // 「管理者モードを押しても開かない」「チェックボックスが外せない」という形で症状が出る。
  const backdrop = createBackdrop(close, { dim: false, zIndex: 890 });
  backdrop.style.display = "none";

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "options-menu-button";
  toggleBtn.textContent = "⚙ オプション";
  toggleBtn.addEventListener("click", open);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}
