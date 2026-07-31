// 図鑑／ルールブックの全画面版（ユーザー要望「山札一覧とヘルプの内容が並ぶ全画面表示に」）。
// 山札一覧（deck-viewer.jsのbuildDeckSections）とルール・ヘルプ（help.jsのbuildHelpList）を
// 1つの全画面ページに縦に並べる。ホーム画面(home-screen.js)から開き、戻るとホームへ帰る。
// 器の作り方はランキング/プロフィールの全画面版と同じ（フルスクリーン・戻るボタン・中央寄せ）。

import { buildDeckSections } from "./deck-viewer.js";
import { buildHelpList } from "./help.js";

let overlayEl = null;

export function openCodexPage(onClose) {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "codex-page";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "codex-page-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeCodexPage();
    onClose?.();
  });
  overlayEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.id = "codex-page-title";
  title.textContent = "📖 図鑑／ルールブック";
  overlayEl.appendChild(title);

  const content = document.createElement("div");
  content.id = "codex-page-content";

  const deckHeading = document.createElement("div");
  deckHeading.className = "codex-section-heading";
  deckHeading.textContent = "📋 山札一覧";
  content.appendChild(deckHeading);
  content.appendChild(buildDeckSections());

  const helpHeading = document.createElement("div");
  helpHeading.className = "codex-section-heading";
  helpHeading.textContent = "📖 ルール・ヘルプ";
  content.appendChild(helpHeading);
  content.appendChild(buildHelpList());

  overlayEl.appendChild(content);
  document.body.appendChild(overlayEl);
  // ホーム/プロフィール全画面と同じく、上のオプションエリアのアイコンは表示したままにする。
  document.body.classList.add("full-screen-page-active");
}

export function closeCodexPage() {
  overlayEl?.remove();
  overlayEl = null;
  document.body.classList.remove("full-screen-page-active");
}
