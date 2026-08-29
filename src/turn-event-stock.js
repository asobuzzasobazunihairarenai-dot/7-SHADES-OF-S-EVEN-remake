// #4（ユーザー確定仕様）: 獲得／捨て／ドロー／奪取などの「中央でフラッシュするお知らせ」を、
// 消えてしまう代わりに右下のボタン列の上へ横帯（ストック）として積み、ターンが変わるたびに
// まとめて掃除する。
//
// 決まった仕様（ユーザー回答）:
//   ・中央表示は残す。一瞬フラッシュしてからストックへ飛ばす。
//   ・対象は全員分（自分だけでなく相手の獲得・捨ても並べる）。
//   ・掃除は「誰のでもターンが変わるたび」。
//   ・置き場所は右下のアクションボタン列のさらに上に横帯。
//   ・「何によってドロー／捨てをしたか」も簡単に添える（reason）。
//
// 依存は葉モジュールのみ（循環importなし）。表示の中身(html)は呼び出し側（hand-announcer.js）が
// 作った文字列をそのまま保持し、チップをクリックした時に再表示する。

import { showCardFace } from "./card-face-display.js";
import { getCardImagePath } from "./cards-data.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { getState } from "./state.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

let stripEl = null;
let listEl = null;
let detailEl = null;
let detailBackdropEl = null;
const entries = [];

function ensureStrip() {
  if (stripEl) return stripEl;
  stripEl = document.createElement("div");
  stripEl.id = "turn-event-stock";
  const label = document.createElement("div");
  label.id = "turn-event-stock-label";
  label.textContent = t("tes.title");
  stripEl.appendChild(label);
  listEl = document.createElement("div");
  listEl.id = "turn-event-stock-list";
  stripEl.appendChild(listEl);
  document.body.appendChild(stripEl);
  updateVisibility();
  return stripEl;
}

function updateVisibility() {
  if (!stripEl) return;
  stripEl.style.display = entries.length > 0 ? "flex" : "none";
}

// 中央フラッシュの着地点（ストックの右端＝次に積まれる位置）。まだチップが無い時は
// ストック自体の中央を返す。
export function getTurnEventStockTargetRect() {
  ensureStrip();
  // 非表示の間はrectが取れないので、一時的に見えない状態で測る。
  const wasHidden = stripEl.style.display === "none";
  if (wasHidden) {
    stripEl.style.visibility = "hidden";
    stripEl.style.display = "flex";
  }
  const rect = listEl.getBoundingClientRect();
  const last = listEl.lastElementChild?.getBoundingClientRect();
  if (wasHidden) {
    stripEl.style.display = "none";
    stripEl.style.visibility = "";
  }
  if (last) return last;
  return rect;
}

function closeDetail() {
  detailEl?.remove();
  detailEl = null;
  detailBackdropEl?.remove();
  detailBackdropEl = null;
}

function openDetail(entry) {
  closeDetail();
  detailBackdropEl = createBackdrop(closeDetail, { dim: true, zIndex: 10700 });
  detailEl = document.createElement("div");
  detailEl.id = "turn-event-stock-detail";
  detailEl.appendChild(createModalCloseX(closeDetail));
  const body = document.createElement("div");
  body.innerHTML = entry.html;
  detailEl.appendChild(body);
  document.body.appendChild(detailBackdropEl);
  document.body.appendChild(detailEl);
  body.querySelectorAll(".hand-pickup-toast-img[data-cardface-id]").forEach((el) => {
    const id = el.dataset.cardfaceId;
    showCardFace(el, id, getCardImagePath(id));
  });
}

// 「今はどのターンか」を表す鍵。main.jsのrender()（掃除の判定）と、hand-announcer.jsの
// 中央フラッシュ（そのフラッシュがどのターンの出来事だったか）で同じ定義を使うため、
// ここに一本化する。
export function getTurnEventStockKey() {
  const state = getState();
  return `${state.turnNumber ?? 0}:${state.turnPlayer ?? "-"}`;
}

// entry: { icon, label, html, cardId? }
// turnKey: その出来事が起きた時点のターン鍵（省略可）。#184（ユーザー報告2026-08-28
// 「ターン終わりにあったスリカエが次のターンに残っていた」）: 中央フラッシュは最大1.8秒
// 表示してから約0.4秒かけて右下へ飛ぶため、ターン終了間際の出来事はチップが積まれる頃には
// もう次のターンに入っていることがある。掃除（clearTurnEventStock）は既に済んだ後なので、
// 前のターンの出来事だけが next turn の帯に取り残される。積む瞬間にもターンを確かめ、
// 変わっていたら積まない（中央フラッシュは既に見えているので情報は失われない）。
export function pushTurnEventStock(entry, turnKey = null) {
  if (turnKey !== null && turnKey !== getTurnEventStockKey()) return;
  ensureStrip();
  entries.push(entry);
  const chip = document.createElement("button");
  chip.type = "button";
  chip.className = "turn-event-stock-chip";
  chip.title = entry.label || "";
  const face = document.createElement("div");
  face.className = "turn-event-stock-chip-face";
  if (entry.cardId) {
    showCardFace(face, entry.cardId, getCardImagePath(entry.cardId));
  } else {
    face.textContent = entry.icon || "🔔";
    face.classList.add("is-icon");
  }
  chip.appendChild(face);
  const badge = document.createElement("div");
  badge.className = "turn-event-stock-chip-badge";
  badge.textContent = entry.icon || "🔔";
  chip.appendChild(badge);
  chip.addEventListener("click", () => openDetail(entry));
  listEl.appendChild(chip);
  updateVisibility();
  // 新しいものが右端に積まれるので、はみ出したら右端へスクロールして見せる。
  listEl.scrollLeft = listEl.scrollWidth;
  requestAnimationFrame(() => chip.classList.add("show"));
}

// 「誰のでもターンが変わるたび」に掃除する（main.jsのrender()から、turnNumber/turnPlayerの
// 変化を見て呼ばれる）。
export function clearTurnEventStock() {
  entries.length = 0;
  if (listEl) listEl.innerHTML = "";
  closeDetail();
  updateVisibility();
}
