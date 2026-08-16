// ランク対局の結果後に、自分の新しいランク（段位・七色ゲージ or レジェンドポイント）と
// 勝敗を簡易表示するモーダル（フェーズ3）。docs/ranked-spec.md参照。
// 昇格演出（七色ゲージ完成→称号変化）や before→after のアニメーションはフェーズ6（称号アート）で。
// ここでは「反映後の現在ランク＋勝敗」を確実に見せることを目的とする。

import { createBackdrop } from "./ui-helpers.js";
import { buildRankBadgeImage, buildUGauge } from "./rank-badge.js";

const RANK_NAMES = ["ブロンズ", "シルバー", "ゴールド", "プラチナ", "ダイヤモンド", "マスター", "レジェンド"];

// { won:boolean, rank:0..6, gauge:0..6, legendPoints:int, note?:string }。閉じたら解決する
// Promiseを返す（victory.jsが順番にモーダルを見せるためにawaitできる）。note は放置敗北など
// 「なぜこの結果か」を1行添える任意のテキスト。
export function showRankedResultModal({ won, rank, gauge, legendPoints, note }) {
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

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.className = "ranked-result-note";
      noteEl.textContent = note;
      inner.appendChild(noteEl);
    }

    // 称号アート（獲得/昇格演出なのでアニメ版、フェーズ6）。段位名の上に大きく見せる。
    inner.appendChild(buildRankBadgeImage(rank, { animated: true, size: "8rem" }));

    const rankName = document.createElement("div");
    rankName.className = "ranked-result-rank";
    rankName.textContent = RANK_NAMES[rank] ?? "ブロンズ";
    inner.appendChild(rankName);

    // 七色ゲージはU型のヒーロー表示（ユーザー提供素材2026-08-16）。
    inner.appendChild(buildUGauge(rank, gauge, legendPoints, { size: "20rem" }));
    if (rank >= 6) {
      const lp = document.createElement("div");
      lp.className = "ranked-result-lp";
      lp.textContent = `レジェンドポイント: ${legendPoints ?? 0}`;
      inner.appendChild(lp);
    } else {
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
