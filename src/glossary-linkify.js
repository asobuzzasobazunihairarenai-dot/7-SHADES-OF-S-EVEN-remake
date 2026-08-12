// 説明書の「基本用語集」(help-content.js GLOSSARY)の用語を、ルール説明・チュートリアル等の
// 文中で見つけてクリック可能にし、押すと定義ポップアップを出す（ユーザー要望2026-08-12
// 「文中の用語をクリックすると用語定義が表示されるように」）。
//
// 使い方: 段落テキストを p.textContent = text の代わりに linkifyGlossary(p, text) で流し込む。

import { GLOSSARY } from "./help-content.js";
import { createBackdrop } from "./ui-helpers.js";

// 用語→定義の対応。最長一致にするため、用語を長い順に並べて正規表現を組む
// （JSの選択|は左優先なので、長い候補を先に置くと同じ位置での最長一致になる）。
const BODY_BY_TERM = new Map(GLOSSARY.map((g) => [g.term, g.body]));
// 1文字の用語（「場」「駒」「隣」等）は、より長い語の中に紛れて誤マッチする
// （例:「場合」「捨て場」の"場"、「隣接」の"隣"）。日本語は語境界が曖昧なので、
// 誤リンクの弊害の方が大きい1文字語はリンク対象から除外する（2文字以上のみ対象。
// 除外した語も、他の語の定義文の中で辿れるよう BODY_BY_TERM 自体は全語保持する）。
const TERMS_BY_LENGTH = GLOSSARY.map((g) => g.term)
  .filter((t) => t.length >= 2)
  .sort((a, b) => b.length - a.length);
const ESCAPED = TERMS_BY_LENGTH.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
const TERM_RE = ESCAPED.length ? new RegExp("(" + ESCAPED.join("|") + ")", "g") : null;

// text 中の用語をクリック可能な span に、それ以外を通常テキストにして pEl へ追加する。
export function linkifyGlossary(pEl, text) {
  if (!TERM_RE || !text) {
    pEl.appendChild(document.createTextNode(text ?? ""));
    return;
  }
  let last = 0;
  for (const m of text.matchAll(TERM_RE)) {
    if (m.index > last) pEl.appendChild(document.createTextNode(text.slice(last, m.index)));
    const term = m[0];
    const span = document.createElement("span");
    span.className = "glossary-term";
    span.textContent = term;
    span.title = "用語の意味を見る";
    span.addEventListener("click", (e) => {
      e.stopPropagation();
      showGlossaryPopup(term);
    });
    pEl.appendChild(span);
    last = m.index + term.length;
  }
  if (last < text.length) pEl.appendChild(document.createTextNode(text.slice(last)));
}

let popupEl = null;
let popupBackdrop = null;

export function closeGlossaryPopup() {
  popupBackdrop?.remove();
  popupEl?.remove();
  popupBackdrop = null;
  popupEl = null;
}

export function showGlossaryPopup(term) {
  const body = BODY_BY_TERM.get(term);
  if (!body) return;
  closeGlossaryPopup(); // 既存のポップアップは閉じてから（用語の中の用語を辿る＝差し替え）

  // ヘルプ項目モーダル等より前面。背景クリックで閉じる。
  popupBackdrop = createBackdrop(closeGlossaryPopup, { dim: true, zIndex: 10700 });
  popupEl = document.createElement("div");
  popupEl.className = "glossary-popup";

  const titleEl = document.createElement("div");
  titleEl.className = "glossary-popup-title";
  titleEl.textContent = `🔤 ${term}`;
  popupEl.appendChild(titleEl);

  for (const line of body) {
    const p = document.createElement("p");
    p.className = "glossary-popup-paragraph";
    // 定義文の中の用語もクリック可能に（辿れるように）。
    linkifyGlossary(p, line);
    popupEl.appendChild(p);
  }

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "glossary-popup-close";
  closeBtn.textContent = "閉じる";
  closeBtn.addEventListener("click", closeGlossaryPopup);
  popupEl.appendChild(closeBtn);

  document.body.appendChild(popupBackdrop);
  document.body.appendChild(popupEl);
}
