// ペット選択（駒に追従する飾りペット piece-pet.js の見た目）。ダミーの絵文字7種から選べる。
// 選択はこの端末に保存（localStorage）。駒スキン等と同じく「左下ステータスエリアのアイコン」
// と「マイページ」から開けるピッカーを提供する。
//
// 現状は自分の駒に自分の選択を反映するローカル方式。将来は駒スキン(piece-skins.js)と同じく
// 座席ごとにオンライン同期して「相手の画面にも自分のペットが出る」ようにする予定
// （getPetEmojiForSeat が同期ロスターを見るように差し替えるだけで済むよう分離してある）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getSelfSeat } from "./online.js";

// ダミーの7種（後で本番の絵／スプライトに差し替え予定）。index 0 が既定。
export const PET_OPTIONS = [
  { emoji: "🐥", label: "ひよこ" },
  { emoji: "🐱", label: "ねこ" },
  { emoji: "🐶", label: "いぬ" },
  { emoji: "🐰", label: "うさぎ" },
  { emoji: "🐹", label: "ハムスター" },
  { emoji: "🦊", label: "きつね" },
  { emoji: "🐉", label: "ドラゴン" },
  { emoji: null, label: "なし（非表示）" }, // ペットを表示しない（ユーザー要望）
];

const STORAGE_KEY = "so7-pet-index";
let selectedIndex = 0;
try {
  const s = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (Number.isInteger(s) && PET_OPTIONS[s]) selectedIndex = s;
} catch (e) {
  /* 保存が読めなければ既定(0) */
}

export function getSelectedPetIndex() {
  return selectedIndex;
}
export function setSelectedPetIndex(i) {
  if (!PET_OPTIONS[i]) return;
  selectedIndex = i;
  try {
    localStorage.setItem(STORAGE_KEY, String(i));
  } catch (e) {
    /* 保存できなくても実行中は反映される */
  }
  notifyChange();
  helpers?.render?.();
}

// 座席seatのペット絵文字。自分の座席の駒だけローカル選択（「なし」を選ぶと null=非表示）を
// 反映し、それ以外（相手・座席不明）は既定を返す。
// ハマりどころ（ユーザー報告「オンラインで自分のペットを変えたら相手のペットも変わる」）:
// 以前は `!seat`（座席不明）でも自分の選択を返していたため、駒のdata-ownerが空のとき
// （token.playerが無く色→座席の補完も外れた等）に相手の駒へ自分のペットが漏れていた。
// 自分の選択は「seatが自分の座席と明示的に一致する時だけ」返す（座席同期は将来対応 TODO(sync)）。
export function getPetEmojiForSeat(seat) {
  const self = getSelfSeat();
  if (seat && self && seat === self) return PET_OPTIONS[selectedIndex].emoji; // null なら非表示
  return PET_OPTIONS[0].emoji; // 相手・座席不明は既定
}

// main.jsからrender()を注入（他の着せ替えモジュールと同じ循環import回避パターン）。
let helpers = null;
export function registerPetHelpers(h) {
  helpers = h;
}
function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

export function openPetPicker() {
  const modal = document.createElement("div");
  modal.id = "pet-picker-modal";
  modal.className = "piece-skin-modal"; // 既存のピッカー見た目を流用
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "ペットを選択";

  const note = document.createElement("div");
  note.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin: -0.4rem 0 0.8rem;";
  note.textContent = "駒に追従する飾りのペットです（仮の絵文字7種）。ゲームには影響しません。";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid pet-picker-grid";
  PET_OPTIONS.forEach((opt, idx) => {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch pet-picker-swatch";
    if (idx === selectedIndex) swatch.classList.add("is-selected");
    const face = document.createElement("span");
    face.className = "pet-picker-emoji";
    face.textContent = opt.emoji ?? "🚫"; // 「なし」は🚫で表す
    const label = document.createElement("span");
    label.className = "pet-picker-label";
    label.textContent = opt.label;
    swatch.appendChild(face);
    swatch.appendChild(label);
    swatch.addEventListener("click", () => {
      setSelectedPetIndex(idx);
      close();
    });
    grid.appendChild(swatch);
  });

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(note);
  modal.appendChild(grid);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
