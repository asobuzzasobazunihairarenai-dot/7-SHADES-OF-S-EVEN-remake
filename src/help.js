// ヘルプページ（ユーザー要望「オプションの横にヘルプボタンを作り、押すとチュートリアルや
// 説明書の内容を網羅しているページを出したい」）。tutorial.jsのチュートリアル手順が持つ
// 説明文（基本ルール）・help-content.js（用語集・よくある質問、説明書.txtから採録）を
// 読み物として一覧表示する。
//
// ユーザー要望「ヘルプ画面のトップは見やすいように項目を並べ表示しクリックするとその
// モーダルが出るようにする」への対応で、トップは「基本ルール/用語集/よくある質問」の
// 折りたたみ一覧（項目名だけのボタン）にし、個別の内容は専用の小さなモーダルで見せる
// 構成にした。
//
// ユーザー要望「オプション画面にあった『チュートリアルを見る』をヘルプ画面に移設」への
// 対応で、options-menu.js側の同項目は削除し、ここへ移した。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getHelpSections, startTutorial } from "./tutorial.js";
import { GLOSSARY, FAQ_CATEGORIES, DIGITAL_FEATURES } from "./help-content.js";

// 個別の説明を表示する小さなモーダル（トップの一覧からのクリックで開く。icon-action-button.js
// のopenIconDetailModalと同じ「1個だけ使い回す」パターンだが、ヘルプ画面自身の裏に
// 重ねて出す必要があるためこのモジュール専用に持つ）。
let itemModalBackdrop = null;
let itemModalEl = null;
let itemModalTitleEl = null;
let itemModalBodyEl = null;

function closeItemModal() {
  if (itemModalBackdrop) itemModalBackdrop.style.display = "none";
  if (itemModalEl) itemModalEl.style.display = "none";
}

function ensureItemModal() {
  if (itemModalEl) return;
  itemModalBackdrop = createBackdrop(closeItemModal, { dim: true, zIndex: 2510 });
  itemModalBackdrop.style.display = "none";

  itemModalEl = document.createElement("div");
  itemModalEl.id = "help-item-modal";
  itemModalEl.style.display = "none";
  itemModalEl.appendChild(createModalCloseX(closeItemModal));

  itemModalTitleEl = document.createElement("div");
  itemModalTitleEl.className = "help-item-modal-title";
  itemModalEl.appendChild(itemModalTitleEl);

  itemModalBodyEl = document.createElement("div");
  itemModalBodyEl.className = "help-item-modal-body";
  itemModalEl.appendChild(itemModalBodyEl);

  document.body.appendChild(itemModalBackdrop);
  document.body.appendChild(itemModalEl);
}

function openItemModal(title, bodyParagraphs, icon) {
  ensureItemModal();
  itemModalTitleEl.innerHTML = "";
  if (icon) {
    const img = document.createElement("img");
    img.className = "help-item-modal-icon";
    img.src = icon;
    img.alt = "";
    itemModalTitleEl.appendChild(img);
  }
  itemModalTitleEl.appendChild(document.createTextNode(title));
  itemModalBodyEl.innerHTML = "";
  for (const paragraph of bodyParagraphs) {
    const p = document.createElement("p");
    p.className = "help-item-modal-paragraph";
    p.textContent = paragraph;
    itemModalBodyEl.appendChild(p);
  }
  itemModalBackdrop.style.display = "block";
  itemModalEl.style.display = "block";
}

function buildIndexButton(label, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "help-index-item";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

// 大分類（基本ルール/用語集/よくある質問）1つぶんの折りたたみ。
function buildIndexSection(titleText, contentEl) {
  const details = document.createElement("details");
  details.className = "help-index-section";
  const summary = document.createElement("summary");
  summary.textContent = titleText;
  details.appendChild(summary);
  details.appendChild(contentEl);
  return details;
}

function buildFlatList(buttons) {
  const list = document.createElement("div");
  list.className = "help-index-list";
  for (const btn of buttons) list.appendChild(btn);
  return list;
}

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "help-panel";

  const titleEl = document.createElement("div");
  titleEl.id = "help-panel-title";
  titleEl.textContent = "❓ ヘルプ";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  const tutorialBtn = document.createElement("button");
  tutorialBtn.type = "button";
  tutorialBtn.id = "help-panel-tutorial-btn";
  tutorialBtn.textContent = "🎓 チュートリアルを見る";
  tutorialBtn.addEventListener("click", () => {
    close();
    startTutorial();
  });
  panel.appendChild(tutorialBtn);

  const list = document.createElement("div");
  list.id = "help-panel-list";

  // 基本ルール（tutorial.jsの説明文をそのまま流用、二重管理を避ける）。
  const ruleButtons = getHelpSections().map((section) =>
    buildIndexButton(section.title, () =>
      openItemModal(section.title, [...section.body, ...(section.footer ?? [])], section.icon)
    )
  );
  list.appendChild(buildIndexSection("📖 基本ルール", buildFlatList(ruleButtons)));

  // ユーザー要望「ヘルプの説明に、デジタル版独自のことも記載する項目を追加してください」。
  // 手札から出したカードが自動で裏表になる・駒スキン等のカスタマイズなど、物理版には
  // 無いこのデジタル版だけの機能をまとめた（help-content.js）。
  const digitalButtons = DIGITAL_FEATURES.map((entry) => buildIndexButton(entry.title, () => openItemModal(entry.title, entry.body)));
  list.appendChild(buildIndexSection("🖥️ デジタル版だけの機能", buildFlatList(digitalButtons)));

  // 用語集（help-content.js、説明書.txtの基本用語集を採録）。
  const glossaryButtons = GLOSSARY.map((entry) => buildIndexButton(entry.term, () => openItemModal(entry.term, entry.body)));
  list.appendChild(buildIndexSection("🔤 用語集", buildFlatList(glossaryButtons)));

  // よくある質問（カテゴリごとにさらに折りたたみをネストする）。
  const faqList = document.createElement("div");
  faqList.className = "help-index-list";
  for (const cat of FAQ_CATEGORIES) {
    const catButtons = cat.items.map((item) => buildIndexButton(item.question, () => openItemModal(item.question, item.answer)));
    const catSection = buildIndexSection(cat.category, buildFlatList(catButtons));
    catSection.classList.add("help-index-subsection");
    faqList.appendChild(catSection);
  }
  list.appendChild(buildIndexSection("💬 よくある質問", faqList));

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
    detailParagraphs: ["ルールの説明・用語集・よくある質問を確認できます。"],
    onAction: open,
  });
  document.body.appendChild(launcherBtn);
}
