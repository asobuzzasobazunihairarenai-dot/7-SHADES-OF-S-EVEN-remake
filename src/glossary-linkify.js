// 説明書の「基本用語集」(help-content.js GLOSSARY)の用語を、ルール説明・チュートリアル等の
// 文中で見つけてクリック可能にし、押すと定義ポップアップを出す（ユーザー要望2026-08-12
// 「文中の用語をクリックすると用語定義が表示されるように」）。
//
// 使い方: 段落テキストを p.textContent = text の代わりに linkifyGlossary(p, text) で流し込む。

import { getGlossary } from "./help-content.js";
import { createBackdrop } from "./ui-helpers.js";
import { getLang } from "./i18n.js";
import { t } from "./ui-text.js";

// 用語→定義の対応。最長一致にするため、用語を長い順に並べて正規表現を組む
// （JSの選択|は左優先なので、長い候補を先に置くと同じ位置での最長一致になる）。
// UI英語化フェーズ8: 言語ごとに作り直す（用語集そのものが言語で入れ替わるため）。読み込み時に
// 1回だけ作ってしまうと、あとから言語を切り替えても古い言語の用語のまま残ってしまう。
let glossaryCache = null;
function glossaryTables() {
  const lang = getLang();
  if (glossaryCache && glossaryCache.lang === lang) return glossaryCache;
  const glossary = getGlossary();
  const bodyByTerm = new Map(glossary.map((g) => [g.term, g.body]));
  // 日本語: 1文字の用語（「場」「駒」「隣」等）は、より長い語の中に紛れて誤マッチする
  // （例:「場合」「捨て場」の"場"、「隣接」の"隣"）。語境界が曖昧なので2文字以上だけを対象にする。
  // 英語: 語境界(\b)で区切れるが、"move" "hand" のようなありふれた単語まで全部リンクになると
  // かえって読みにくい。英語の用語は大文字始まり（Lock Area / Arrival Effect 等）なので、
  // 大小を区別したうえで4文字以上だけを対象にする。
  // 除外した語も、他の語の定義文から辿れるよう bodyByTerm には全語を残す。
  const minLen = lang === "ja" ? 2 : 4;
  const terms = glossary
    .map((g) => g.term)
    .filter((term) => term.length >= minLen)
    .sort((a, b) => b.length - a.length);
  const escaped = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const source = "(" + escaped.join("|") + ")";
  const re = escaped.length ? new RegExp(lang === "ja" ? source : "\\b" + source + "\\b", "g") : null;
  glossaryCache = { lang, bodyByTerm, re };
  return glossaryCache;
}

// text 中の用語をクリック可能な span に、それ以外を通常テキストにして pEl へ追加する。
export function linkifyGlossary(pEl, text) {
  const { re: TERM_RE } = glossaryTables();
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
    span.title = t("help.glossary.tip");
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
  const body = glossaryTables().bodyByTerm.get(term);
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
  closeBtn.textContent = t("game.confirm.close");
  closeBtn.addEventListener("click", closeGlossaryPopup);
  popupEl.appendChild(closeBtn);

  document.body.appendChild(popupBackdrop);
  document.body.appendChild(popupEl);
}
