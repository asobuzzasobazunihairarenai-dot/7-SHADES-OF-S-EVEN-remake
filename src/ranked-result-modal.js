// ランク対局の結果後に、自分の新しいランク（段位・七色ゲージ or レジェンドポイント）と
// 勝敗を簡易表示するモーダル（フェーズ3）。docs/ranked-spec.md参照。
// 昇格演出（七色ゲージ完成→称号変化）や before→after のアニメーションはフェーズ6（称号アート）で。
// ここでは「反映後の現在ランク＋勝敗」を確実に見せることを目的とする。

import { createBackdrop } from "./ui-helpers.js";

const RANK_NAMES = ["ブロンズ", "シルバー", "ゴールド", "プラチナ", "ダイヤモンド", "マスター", "レジェンド"];
const GAUGE_COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

// { won:boolean, rank:0..6, gauge:0..6, legendPoints:int }。閉じたら解決するPromiseを返す
// （victory.jsが順番にモーダルを見せるためにawaitできる）。
export function showRankedResultModal({ won, rank, gauge, legendPoints }) {
  return new Promise((resolve) => {
    let backdrop = null;
    let modal = null;
    const close = () => {
      backdrop?.remove();
      modal?.remove();
      resolve();
    };
    backdrop = createBackdrop(close, { dim: true, zIndex: 20100 });
    document.body.appendChild(backdrop);

    modal = document.createElement("div");
    modal.id = "ranked-result-modal";
    const inner = document.createElement("div");
    inner.className = "ranked-result-inner";

    const heading = document.createElement("div");
    heading.className = "ranked-result-heading " + (won ? "is-win" : "is-lose");
    heading.textContent = won ? "🏆 勝利！ ランクポイント獲得" : "ランクポイント減少";
    inner.appendChild(heading);

    const rankName = document.createElement("div");
    rankName.className = "ranked-result-rank";
    rankName.textContent = RANK_NAMES[rank] ?? "ブロンズ";
    inner.appendChild(rankName);

    if (rank >= 6) {
      const lp = document.createElement("div");
      lp.className = "ranked-result-lp";
      lp.textContent = `レジェンドポイント: ${legendPoints ?? 0}`;
      inner.appendChild(lp);
    } else {
      const gaugeEl = document.createElement("div");
      gaugeEl.className = "ranked-result-gauge";
      for (let i = 0; i < 7; i++) {
        const dot = document.createElement("div");
        dot.className = "ranked-result-dot" + (i < (gauge ?? 0) ? " is-lit" : "");
        dot.style.setProperty("--dot-color", `var(--color-${GAUGE_COLORS[i]})`);
        gaugeEl.appendChild(dot);
      }
      inner.appendChild(gaugeEl);
      const gaugeText = document.createElement("div");
      gaugeText.className = "ranked-result-gauge-text";
      gaugeText.textContent = `${gauge ?? 0} / 7 （揃うと昇格）`;
      inner.appendChild(gaugeText);
    }

    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.className = "ranked-result-ok";
    okBtn.textContent = "OK";
    okBtn.addEventListener("click", close);
    inner.appendChild(okBtn);

    modal.appendChild(inner);
    document.body.appendChild(modal);
  });
}
