// 「このマスでいいですか？」の確認モーダル（ユーザー要望2026-09-01）。
// カード効果でマスを選ぶ時、押した直後に確定してしまうと押し間違いが取り返せないため、
// 一度だけ確認を挟む。confirmTouchAction（ロック前・手札使用前の確認）と同じ考え方だが、
// **設定は別に持つ**——マス選択は頻度が段違いに高く、「こちらだけ切りたい」が自然なため。
//
// 【配置の注意（ユーザー指摘）】モーダルが盤面に被ると、選んだマス自体が隠れて
// 「どのマスを確認されているのか」が分からなくなる。そこで
//   ・背景は暗くしない（盤面を見せたまま）
//   ・選んだマスが画面の上半分なら下端、下半分なら上端にパネルを出す
//   ・選んだマスを強く光らせる
// の3点で、必ず対象マスが見えている状態で確認できるようにする。
import { t } from "./ui-text.js";
import { createBackdrop } from "./ui-helpers.js";

const STORAGE_KEY = "so7-cell-confirm-enabled";

function load() {
  try {
    // 既定は「表示する」(true)。明示的に "0" が保存されている時だけ非表示。
    return localStorage.getItem(STORAGE_KEY) !== "0";
  } catch (err) {
    return true;
  }
}

let enabled = load();

export function isCellConfirmEnabled() {
  return enabled;
}

export function setCellConfirmEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch (err) {
    // localStorageが使えない環境でも致命的ではない（セッション内は保持される）
  }
  // オプション画面のチェックボックス表示を最新化するため。
  window.dispatchEvent(new CustomEvent("cell-confirm-pref-changed"));
}

// 選んだマスの確認。true=このマスで確定 / false=選び直す。
// cellEl は選ばれたマス（.cell / .lock-slot）のDOM要素（無くても動く）。
export function confirmCellChoice(cellEl, hint) {
  if (!enabled) return Promise.resolve(true);
  return new Promise((resolve) => {
    // 対象マスを強く光らせる（確認中どのマスの話か一目で分かるように）。
    cellEl?.classList.add("cell-confirm-target");

    // 盤面を隠さないため dim しない。クリックは受け止めて誤操作を防ぐ。
    const backdrop = createBackdrop(() => {}, { dim: false, zIndex: 10610 });
    const modal = document.createElement("div");
    modal.id = "cell-confirm-modal";
    // 選んだマスが画面の上半分なら下端、下半分なら上端に出す（マスと重ならない側）。
    const rect = cellEl?.getBoundingClientRect();
    const cellInTopHalf = rect ? rect.top + rect.height / 2 < window.innerHeight / 2 : true;
    modal.classList.add(cellInTopHalf ? "is-bottom" : "is-top");

    const titleEl = document.createElement("div");
    titleEl.className = "cell-confirm-title";
    titleEl.textContent = t("game.cellConfirm.title");
    modal.appendChild(titleEl);
    if (hint) {
      const hintEl = document.createElement("div");
      hintEl.className = "cell-confirm-hint";
      hintEl.textContent = hint;
      modal.appendChild(hintEl);
    }

    const buttons = document.createElement("div");
    buttons.className = "contact-approval-buttons";
    const finish = (result) => {
      cellEl?.classList.remove("cell-confirm-target");
      backdrop.remove();
      modal.remove();
      resolve(result);
    };
    const yesBtn = document.createElement("button");
    yesBtn.className = "contact-approval-approve";
    yesBtn.type = "button";
    yesBtn.textContent = t("game.confirm.yes");
    yesBtn.addEventListener("click", () => finish(true));
    const noBtn = document.createElement("button");
    noBtn.className = "contact-approval-reject";
    noBtn.type = "button";
    noBtn.textContent = t("game.cellConfirm.redo");
    noBtn.addEventListener("click", () => finish(false));
    buttons.appendChild(yesBtn);
    buttons.appendChild(noBtn);
    modal.appendChild(buttons);

    // 「今後このモーダルを表示しない」。押すと以後この確認を出さず、今回はそのまま確定する。
    // 再表示はオプションの基本設定から戻せる。
    const dontShow = document.createElement("button");
    dontShow.className = "cell-confirm-dontshow";
    dontShow.type = "button";
    dontShow.textContent = t("game.confirm.never");
    dontShow.addEventListener("click", () => {
      setCellConfirmEnabled(false);
      finish(true);
    });
    modal.appendChild(dontShow);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  });
}
