// ユーザー要望（続き87）「勝利時にお金を獲得した演出モーダルが欲しい」への対応。
// currency-display.jsのshowCurrencyAwardEffect()（通貨アイコンが一瞬光る程度の
// 控えめな演出）とは別に、勝利エピローグ（勝利モーダルの後）でしっかり見せる
// 専用モーダルを新設した。victory.jsのcheckForVictory()から、awardMatchCurrency()が
// 返した「このクライアントが実際に受け取った額」が1以上の時だけ呼ばれる
// （0の場合＝他クライアントが先に付与済み、は今まで通り何も出さない）。

import { createBackdrop } from "./ui-helpers.js";

const AUTO_CLOSE_MS = 3200;

// 戻り値のPromiseは、モーダルが閉じた（自動 or 手動どちらでも）タイミングでresolveする。
// victory.js側でランキング演出・戦績パネルへの引き継ぎの順番を制御するために使う。
export function showCurrencyAwardModal(amount) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "currency-award-modal";
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      clearTimeout(autoCloseTimer);
      backdrop.remove();
      modal.remove();
      resolve();
    };
    const backdrop = createBackdrop(close, { dim: true, zIndex: 10520 });

    const coin = document.createElement("div");
    coin.className = "currency-award-modal-coin";
    coin.textContent = "💰";
    modal.appendChild(coin);

    const title = document.createElement("div");
    title.className = "currency-award-modal-title";
    title.textContent = "通貨を獲得！";
    modal.appendChild(title);

    const amountEl = document.createElement("div");
    amountEl.className = "currency-award-modal-amount";
    amountEl.textContent = `+${amount}`;
    modal.appendChild(amountEl);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    // ユーザー要望（変更）: 対戦終了時のモーダルは自動で次へ進まない。✕/背景クリックでのみ閉じる。
    const autoCloseTimer = null;
  });
}
