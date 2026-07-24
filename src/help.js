// ヘルプページ（ユーザー要望「オプションの横にヘルプボタンを作り、押すとチュートリアルや
// 説明書の内容を網羅しているページを出したい」）。tutorial.jsのチュートリアル手順が持つ
// 説明文をそのまま読み物として一覧表示する（getHelpSections、二重管理を避ける）。
// チュートリアル本体と違い、対話的なハイライト・仮想盤面は行わない静的なページのため、
// ゲームが始まっていない・オンライン画面など、いつでもどこでも開ける。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getHelpSections } from "./tutorial.js";

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "help-panel";

  const titleEl = document.createElement("div");
  titleEl.id = "help-panel-title";
  titleEl.textContent = "❓ ヘルプ";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  const list = document.createElement("div");
  list.id = "help-panel-list";
  for (const section of getHelpSections()) {
    const sectionEl = document.createElement("div");
    sectionEl.className = "help-panel-section";

    const headerEl = document.createElement("div");
    headerEl.className = "help-panel-section-title";
    if (section.icon) {
      const iconEl = document.createElement("img");
      iconEl.className = "help-panel-section-icon";
      iconEl.src = section.icon;
      iconEl.alt = "";
      headerEl.appendChild(iconEl);
    }
    const headerText = document.createElement("span");
    headerText.textContent = section.title;
    headerEl.appendChild(headerText);
    sectionEl.appendChild(headerEl);

    for (const paragraph of section.body) {
      const p = document.createElement("p");
      p.className = "help-panel-paragraph";
      p.textContent = paragraph;
      sectionEl.appendChild(p);
    }
    if (section.footer) {
      for (const paragraph of section.footer) {
        const p = document.createElement("p");
        p.className = "help-panel-footer";
        p.textContent = paragraph;
        sectionEl.appendChild(p);
      }
    }
    list.appendChild(sectionEl);
  }
  panel.appendChild(list);
  return panel;
}

let openFn = null;

export function openHelpPanel() {
  openFn?.();
}

export function initHelpButton() {
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
  }
  openFn = open;

  const panel = buildPanel(close);
  const backdrop = createBackdrop(close, { dim: true, zIndex: 2500 });
  backdrop.style.display = "none";
  panel.style.display = "none";

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  const launcherBtn = document.createElement("button");
  launcherBtn.id = "help-button";
  const { captionEl } = buildIconButtonContent(launcherBtn, {
    icon: "assets/icons/help.svg",
    tooltip: "ヘルプを開きます",
  });
  captionEl.textContent = "ヘルプ";
  wireIconButtonClick(launcherBtn, {
    detailTitle: "ヘルプ",
    detailParagraphs: ["ルールの説明を一覧で確認できます。"],
    onAction: open,
  });
  document.body.appendChild(launcherBtn);
}
