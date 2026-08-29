// ランク戦（フリーマッチ）の説明。ホーム画面・マイページのランク表示をクリックした時に出す
// 説明モーダル（ユーザー要望2026-08-17）と、ヘルプページの「🏆 ランク戦について」項目の両方で
// 使う共有コンテンツ。docs/ranked-spec.md の v1 仕様をプレイヤー向けにやさしく要約したもの。

import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ8

// help.js の openItemModal と同じ { title, body:[段落...] } 形式。ヘルプの索引にもそのまま並べる。
// UI英語化フェーズ8: 定数ではなく関数で返す（読み込み時に固定すると言語切替に追随しないため。
// 本文は ui-text.js の rankex.* にある）。呼び出し側は表示のたびに getRankExplainSections() を呼ぶ。
export function getRankExplainSections() {
  return [
    { title: t("rankex.s1.title"), body: [t("rankex.s1.b1"), t("rankex.s1.b2"), t("rankex.s1.b3"), t("rankex.s1.b4")] },
    { title: t("rankex.s2.title"), body: [t("rankex.s2.b1"), t("rankex.s2.b2"), t("rankex.s2.b3"), t("rankex.s2.b4")] },
    { title: t("rankex.s3.title"), body: [t("rankex.s3.b1"), t("rankex.s3.b2"), t("rankex.s3.b3"), t("rankex.s3.b4")] },
    { title: t("rankex.s4.title"), body: [t("rankex.s4.b1"), t("rankex.s4.b2")] },
    { title: t("rankex.s5.title"), body: [t("rankex.s5.b1"), t("rankex.s5.b2"), t("rankex.s5.b3")] },
    { title: t("rankex.s6.title"), body: [t("rankex.s6.b1"), t("rankex.s6.b2"), t("rankex.s6.b3")] },
  ];
}

let modalEl = null;
let backdropEl = null;

function closeModal() {
  backdropEl?.remove();
  modalEl?.remove();
  backdropEl = null;
  modalEl = null;
}

// ランク表示（ホーム／マイページ）クリックで出す、全セクションを1枚にまとめたスクロール可能な
// 説明モーダル。どこから開いても最前面に出るよう十分高い z-index を使う。
export function showRankExplanationModal() {
  if (modalEl) return;
  backdropEl = createBackdrop(closeModal, { dim: true, zIndex: 20190 });
  document.body.appendChild(backdropEl);

  modalEl = document.createElement("div");
  modalEl.id = "rank-explain-modal";

  const titleEl = document.createElement("div");
  titleEl.className = "rank-explain-title";
  titleEl.textContent = t("rankex.title");
  modalEl.appendChild(titleEl);
  modalEl.appendChild(createModalCloseX(closeModal));

  const body = document.createElement("div");
  body.className = "rank-explain-body";
  for (const section of getRankExplainSections()) {
    const h = document.createElement("div");
    h.className = "rank-explain-section-title";
    h.textContent = section.title;
    body.appendChild(h);
    for (const line of section.body) {
      const p = document.createElement("p");
      p.className = "rank-explain-paragraph";
      p.textContent = line;
      body.appendChild(p);
    }
  }
  modalEl.appendChild(body);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "rank-explain-ok";
  okBtn.textContent = "OK";
  okBtn.addEventListener("click", closeModal);
  modalEl.appendChild(okBtn);

  document.body.appendChild(modalEl);
}
