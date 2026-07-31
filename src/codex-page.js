// 図鑑／ルールブックの全画面版（ユーザー要望「山札一覧とヘルプの内容が並ぶ全画面表示に」）。
// 山札一覧（deck-viewer.jsのbuildDeckSections）とルール・ヘルプ（help.jsのbuildHelpList）を
// 1つの全画面ページに縦に並べる。ホーム画面(home-screen.js)から開き、戻るとホームへ帰る。
// 器の作り方はランキング/プロフィールの全画面版と同じ（フルスクリーン・戻るボタン・中央寄せ）。

import { openDeckViewer } from "./deck-viewer.js";
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

  // ユーザー要望「図鑑ではカード画像たちは一旦山札一覧に収納しておいて」。カードのグリッドを
  // 直接並べる代わりに、山札一覧（deck-viewer.js、全画面）を開くボタンだけを置く。
  const deckHeading = document.createElement("div");
  deckHeading.className = "codex-section-heading";
  deckHeading.textContent = "📋 山札一覧（カード一覧）";
  content.appendChild(deckHeading);
  const deckBtn = document.createElement("button");
  deckBtn.type = "button";
  deckBtn.className = "codex-open-deck-btn";
  deckBtn.textContent = "📋 山札一覧を開く";
  deckBtn.style.cssText =
    "display: block; margin: 0.4rem 0 0.4rem; padding: 0.6rem 1.2rem; background: rgba(125,211,252,0.12); " +
    "border: 1px solid rgba(125,211,252,0.5); border-radius: 0.5rem; color: #e2e8f0; cursor: pointer; " +
    "font-family: sans-serif; font-size: 0.95rem;";
  deckBtn.addEventListener("click", () => openDeckViewer());
  content.appendChild(deckBtn);

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
