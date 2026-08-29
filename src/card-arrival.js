// 駒がカードの上に乗った（到達した）ことを知らせる、画面右上に固定表示される一時的な
// モーダル。カードが裏向きだった場合は先に自動でオープンしてから呼ばれる
// （main.jsのmaybeTriggerCardArrival/onDragEnd、および手動でのダブルクリックオープン時も参照）。
// 数秒で自動的に消える。サイズ・表示時間は管理者モードの「カード到達モーダル」グループで
// 調整できる（--card-arrival-modal-size・--card-arrival-modal-duration）。
// 中央ではなく右上に固定表示しているのは、モーダル表示中も盤面上の「駒がそのカードに
// 乗っている姿」を隠さずに見えるようにするため。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { buildCardBox } from "./card-face-display.js";
import { createModalCloseX } from "./ui-helpers.js";
import { isCardArrivalModalPersistent } from "./admin.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

function getDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--card-arrival-modal-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 3 : seconds) * 1000;
}

let currentModal = null;
let currentTimer = null;

// ユーザー要望2026-08-08「到達カードモーダルはターン終了で消えるが、まだ読みたい人もいる。
// 『キープ』ボタンを新設し、押したらそのカードはターンを跨いでも消えないように」。キープした
// モーダルはcurrentModal管理から外し（自動消滅・ターン終了の一括クローズ・次の到達での置き換えの
// 対象外にし）、✕で手動で閉じるまで残す。複数キープした時に重ならないよう縦に少しずつずらす。
const keptModals = new Set();
function repositionKeptModals() {
  let i = 0;
  for (const m of keptModals) {
    m.style.setProperty("--kept-index", String(i));
    i += 1;
  }
}

// ユーザー要望「ターンを終了したら、出っ放しの到達拡大モーダルがあれば全員閉じるように
// してください」への対応。デフォルトでは消えない設定（isCardArrivalModalPersistent）の
// ため、効果処理中に見ながら操作している間はよいが、ターンが終わっても開いたままだと
// 次のプレイヤーの邪魔になる。main.js側がturnPlayerの変化（＝全クライアントに同期される
// タイミング）を検知して呼ぶ。
export function hideCardArrivalModalImmediately() {
  if (!currentModal) return;
  clearTimeout(currentTimer);
  currentModal.remove();
  currentModal = null;
}

// options.showAddToHand: 到達した駒の持ち主が自分自身の時だけtrue（main.jsのtriggerCardArrival
// 側で判定済み、ここでは受け取った真偽値をそのまま反映するだけ）。
// options.onAddToHand: ボタンを押した時に呼ぶコールバック（実際の状態変更・同期はmain.js側の
// 責務、このモジュールはUIの表示に徹する）。
export function showCardArrivalModal(cardId, options = {}) {
  // 短時間で連続して別のカードに到達した場合、前のモーダルを消して最新のものだけ表示する。
  if (currentModal) {
    clearTimeout(currentTimer);
    currentModal.remove();
    currentModal = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "card-arrival-modal";

  let kept = false; // 「キープ」で残す指定にしたか
  function dismiss() {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
      if (currentModal === modal) currentModal = null;
      if (keptModals.delete(modal)) repositionKeptModals();
    }, 300);
  }

  const label = document.createElement("div");
  label.className = "card-arrival-modal-label";
  label.textContent = t("ca.label");
  modal.appendChild(label);

  const box = buildCardBox(cardId, getCardImagePath(cardId));
  box.setAttribute("role", "img");
  box.setAttribute("aria-label", def.name);
  modal.appendChild(box);

  const persistent = isCardArrivalModalPersistent();
  if (!persistent) {
    // 自動で消えるのを止めて、手動で✕を押すまで表示し続けられるようにするボタン
    // （デフォルトの「消えない」設定の間は最初から消えないため、このボタン自体が不要）。
    const pinBtn = document.createElement("button");
    pinBtn.className = "card-arrival-modal-pin";
    pinBtn.textContent = t("ca.pin");
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // モーダル本体のクリックで即座に消えてしまわないように
      clearTimeout(currentTimer);
      pinBtn.remove(); // 止めた後はこのボタン自体は不要（触る/✕でいつでも閉じられる）
    });
    modal.appendChild(pinBtn);
  }

  modal.appendChild(createModalCloseX(dismiss));

  // 「キープ」ボタン（ユーザー要望2026-08-08）。押すと自動消滅タイマーを止め、currentModal管理
  // から外して、ターン終了の一括クローズや次の到達での置き換えの対象外にする（＝ターンを跨いでも
  // ✕で閉じるまで残る）。押した後はボタン自体を消す。
  const keepBtn = document.createElement("button");
  keepBtn.className = "card-arrival-modal-keep";
    keepBtn.textContent = t("ca.keep");
  keepBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // モーダル本体クリックでの即クローズを防ぐ
    kept = true;
    clearTimeout(currentTimer);
    if (currentModal === modal) currentModal = null; // 管理スロットから外す
    modal.classList.add("is-kept");
    keptModals.add(modal);
    repositionKeptModals();
    keepBtn.remove();
    const pin = modal.querySelector(".card-arrival-modal-pin");
    if (pin) pin.remove(); // 「消えないように」はキープに包含されるので不要
  });
  modal.appendChild(keepBtn);

  // 到達した駒の持ち主が自分自身の時だけ表示する（main.jsのtriggerCardArrivalで判定済み）。
  // 右下に配置（ユーザー指定）。
  if (options.showAddToHand) {
    const addBtn = document.createElement("button");
    addBtn.className = "card-arrival-modal-add-to-hand";
    addBtn.textContent = t("ca.addToHand");
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // モーダル本体のクリックによる即座のdismissを防ぐ
      options.onAddToHand?.();
      dismiss();
    });
    modal.appendChild(addBtn);
  }

  // カードを見ながら到達効果を処理し終えたら、モーダルに触れるだけで閉じられるようにする
  // （「デフォルトは消えない」設定と対になる操作）。ただしキープ中は、誤って本体クリックで
  // 閉じてしまわないよう✕でのみ閉じる。
  modal.addEventListener("click", () => {
    if (!kept) dismiss();
  });

  document.body.appendChild(modal);
  currentModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  if (!persistent) {
    currentTimer = setTimeout(dismiss, getDurationMs());
  }
}
