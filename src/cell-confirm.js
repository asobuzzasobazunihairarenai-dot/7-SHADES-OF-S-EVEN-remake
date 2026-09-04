// 「このマスでいいですか？」の確認モーダル（ユーザー要望2026-09-01）。
// カード効果でマスを選ぶ時、押した直後に確定してしまうと押し間違いが取り返せないため、
// 一度だけ確認を挟む。confirmTouchAction（ロック前・手札使用前の確認）と同じ考え方だが、
// **設定は別に持つ**——マス選択は頻度が段違いに高く、「こちらだけ切りたい」が自然なため。
//
// 【配置の注意（ユーザー指摘）】モーダルが盤面に被ると、選んだマス自体が隠れて
// 「どのマスを確認されているのか」が分からなくなる。そこで
//   ・背景は暗くしない（盤面を見せたまま）
//   ・パネルは**選んだマスのすぐ隣**（右上→右下→左上→左下の順に、収まる所）に出す
//     （2026-09-01のユーザー指摘「上に出たり下に出たりはユーザビリティに欠ける」。
//      以前は画面の上端/下端に出していたが、視線が飛ぶのでマスの隣に固定した）
//   ・選んだマスを強く光らせる
// の3点で、必ず対象マスが見えている状態で確認できるようにする。
import { t } from "./ui-text.js";
import { createBackdrop, createOpenGuard } from "./ui-helpers.js";
// 【重要】body 自体がステージ変形(translate+scale)を持つので、実画面座標をそのまま
// left/top に入れると二重にかかる（続き355）。必ずローカル座標へ直してから使う。
import { stageClientToLocal, showQuickNote } from "./main.js";

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
// opts.titleKey: 見出しの文言キー（既定「このマスでいいですか？」）。相手の駒を選ぶ場面では
// 「この相手でいいですか？」に差し替える（不具合報告#207）。
export function confirmCellChoice(cellEl, hint, opts = {}) {
  if (!enabled) return Promise.resolve(true);
  return new Promise((resolve) => {
    // 対象マスを強く光らせる（確認中どのマスの話か一目で分かるように）。
    cellEl?.classList.add("cell-confirm-target");

    // 開いた直後の合成クリック除け（#236）。このモーダルは**選んだマスのすぐ隣**に出るので、
    // マスをタップして指を離した位置にボタンが現れることがある。実際、報告 #236 は
    // 「今後このモーダルを表示しない」が知らないうちに押されて設定が切れていた。
    const guard = createOpenGuard();

    // 盤面を隠さないため dim しない。クリックは受け止めて誤操作を防ぐ。
    const backdrop = createBackdrop(() => {}, { dim: false, zIndex: 10610 });
    const modal = document.createElement("div");
    modal.id = "cell-confirm-modal";

    const titleEl = document.createElement("div");
    titleEl.className = "cell-confirm-title";
    titleEl.textContent = t(opts.titleKey || "game.cellConfirm.title");
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
    yesBtn.addEventListener("click", () => { if (guard()) return; finish(true); });
    const noBtn = document.createElement("button");
    noBtn.className = "contact-approval-reject";
    noBtn.type = "button";
    noBtn.textContent = t("game.cellConfirm.redo");
    noBtn.addEventListener("click", () => { if (guard()) return; finish(false); });
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
      if (guard()) return;
      setCellConfirmEnabled(false);
      // 何が起きたのか分かるように一言残す（#236: 押した覚えがないまま切れていて、
      // 「モーダルが出ない不具合」に見えていた）。戻し方もここで伝える。
      try { showQuickNote?.(t("game.cellConfirm.turnedOff")); } catch (err) { /* 出せなくても致命的ではない */ }
      finish(true);
    });
    modal.appendChild(dontShow);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    placeNextToCell(modal, cellEl);
  });
}

// 選んだマスの「すぐ右上」に出す。画面からはみ出す時だけ、右下→左上→左下 の順に回して
// 収まる場所へ置く（どれも入らなければ最後に画面内へ寄せる）。上下に飛ぶのではなく
// **必ずマスの隣**なので、視線が動かず分かりやすい（ユーザー要望2026-09-01）。
// 【座標】getBoundingClientRect は実画面座標、モーダルは body（ステージ変形あり）の中に
// あるので left/top はローカル座標。必ず stageClientToLocal / stageDelta で変換する。
function placeNextToCell(modal, cellEl) {
  const rect = cellEl?.getBoundingClientRect();
  if (!rect || rect.width < 1) {
    // マスが測れない時だけ、従来どおり画面下端の中央に出す（保険）。
    modal.classList.add("is-fallback");
    return;
  }
  const mr = modal.getBoundingClientRect(); // 実画面でのモーダルの大きさ
  const gap = 10; // マスとの隙間(実画面px)
  const margin = 8; // 画面端からの最小余白(実画面px)
  // 候補: ①右上 ②右下 ③左上 ④左下（ユーザー指定の優先順）
  const candidates = [
    { x: rect.right + gap, y: rect.top - mr.height - gap },
    { x: rect.right + gap, y: rect.bottom + gap },
    { x: rect.left - mr.width - gap, y: rect.top - mr.height - gap },
    { x: rect.left - mr.width - gap, y: rect.bottom + gap },
  ];
  const fits = (p) =>
    p.x >= margin && p.y >= margin && p.x + mr.width <= innerWidth - margin && p.y + mr.height <= innerHeight - margin;
  let pos = candidates.find(fits);
  if (!pos) {
    // どれも収まらない小さい画面: 右上を基準に画面内へ押し込む。
    const p = candidates[0];
    pos = {
      x: Math.max(margin, Math.min(innerWidth - mr.width - margin, p.x)),
      y: Math.max(margin, Math.min(innerHeight - mr.height - margin, p.y)),
    };
  }
  const local = stageClientToLocal(pos.x, pos.y);
  modal.classList.add("is-anchored");
  modal.style.left = `${local.x}px`;
  modal.style.top = `${local.y}px`;
}
