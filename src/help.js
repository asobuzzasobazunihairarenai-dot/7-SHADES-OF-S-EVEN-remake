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
import { getGlossary, getFaqCategories, getDigitalFeatures } from "./help-content.js"; // UI英語化フェーズ8: 表示のたびに現在の言語で取り直す
import { getRankExplainSections } from "./rank-explain.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ8
import { linkifyGlossary } from "./glossary-linkify.js";
import { getOptionArea } from "./option-area.js";
import { closeShopPanel } from "./shop.js";
import { closeProfilePage } from "./profile-page.js";
// 全画面ページを同時に1つだけにする（関数内でのみ使う遅延束縛なので循環importでも安全）。
import { closeRankingPage } from "./ranking-page.js";

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
    // 文中の基本用語集の用語をクリック可能にする（押すと定義ポップアップ。ユーザー要望）。
    linkifyGlossary(p, paragraph);
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
  titleEl.textContent = t("help.title");
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  const tutorialBtn = document.createElement("button");
  tutorialBtn.type = "button";
  tutorialBtn.id = "help-panel-tutorial-btn";
  tutorialBtn.textContent = t("help.tutorialBtn");
  tutorialBtn.addEventListener("click", () => {
    close();
    startTutorial();
  });
  panel.appendChild(tutorialBtn);

  panel.appendChild(buildHelpList());
  return panel;
}

// ヘルプの索引リスト（基本ルール・デジタル版機能・用語集・よくある質問）だけを組み立てて返す。
// 図鑑／ルールブックの全画面版（codex-page.js）からも使う。
export function buildHelpList() {
  const list = document.createElement("div");
  list.className = "help-panel-list";

  // 基本ルール（tutorial.jsの説明文をそのまま流用、二重管理を避ける）。
  const ruleButtons = getHelpSections().map((section) =>
    buildIndexButton(section.title, () =>
      openItemModal(section.title, [...section.body, ...(section.footer ?? [])], section.icon)
    )
  );
  list.appendChild(buildIndexSection(t("help.sec.rules"), buildFlatList(ruleButtons)));

  // ユーザー要望「ヘルプの説明に、デジタル版独自のことも記載する項目を追加してください」。
  const digitalButtons = getDigitalFeatures().map((entry) => buildIndexButton(entry.title, () => openItemModal(entry.title, entry.body)));
  list.appendChild(buildIndexSection(t("help.sec.digital"), buildFlatList(digitalButtons)));

  // ランク戦（フリーマッチ）の説明（rank-explain.js と共有。ホーム/マイページのランク表示クリックと同じ内容）。
  const rankedButtons = getRankExplainSections().map((section) => buildIndexButton(section.title, () => openItemModal(section.title, section.body)));
  list.appendChild(buildIndexSection(t("help.sec.ranked"), buildFlatList(rankedButtons)));

  // 用語集（help-content.js、説明書.txtの基本用語集を採録）。
  const glossaryButtons = getGlossary().map((entry) => buildIndexButton(entry.term, () => openItemModal(entry.term, entry.body)));
  list.appendChild(buildIndexSection(t("help.sec.glossary"), buildFlatList(glossaryButtons)));

  // よくある質問（カテゴリごとにさらに折りたたみをネストする）。
  const faqList = document.createElement("div");
  faqList.className = "help-index-list";
  for (const cat of getFaqCategories()) {
    const catButtons = cat.items.map((item) => buildIndexButton(item.question, () => openItemModal(item.question, item.answer)));
    const catSection = buildIndexSection(cat.category, buildFlatList(catButtons));
    catSection.classList.add("help-index-subsection");
    faqList.appendChild(catSection);
  }
  list.appendChild(buildIndexSection(t("help.sec.faq"), faqList));

  return list;
}

let openFn = null;
let closeFn = null;
// 他の全画面ページ（プロフィール/ランキング）を開く時にヘルプを閉じるための外部close。
// 未初期化・未表示なら安全なno-op。
export function closeHelpPanel() {
  closeFn?.();
}

export function openHelpPanel() {
  // #2026-08-16: ショップから開くとヘルプ(2501)がショップ(2601)の背面に隠れるため、先に
  // ショップを閉じてから開く（ショップ未表示なら安全なno-op）。
  closeShopPanel();
  // ユーザー報告2026-08-18「マイページ画面でオプションエリアの『ヘルプ』を押しても反応しない」。
  // マイページ(#profile-page z:2650)はヘルプ(2501)より前面のため、閉じないと背面に隠れて
  // クリックできない。先にマイページを閉じる（未表示なら安全なno-op）。
  closeProfilePage();
  closeRankingPage();
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
  closeFn = close;

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
    tooltip: t("help.iconTip"),
  });
  captionEl.textContent = t("help.iconCaption");
  wireIconButtonClick(launcherBtn, {
    detailTitle: t("help.iconCaption"),
    detailParagraphs: [t("help.iconDetail")],
    onAction: open,
  });
  getOptionArea().appendChild(launcherBtn);
}
