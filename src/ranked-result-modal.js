// ランク対局の結果後に、自分の新しいランク（段位・七色ゲージ or レジェンドポイント）と
// 勝敗を表示するモーダル（フェーズ3）。docs/ranked-spec.md参照。
// 昇格した場合（promotedFrom）は「七色ゲージ完成→称号変化」の昇格演出を出す（フェーズ6）。
// 昇格でない場合は「反映後の現在ランク＋勝敗」を確実に見せる。

import { createBackdrop } from "./ui-helpers.js";
import { buildRankShowcase } from "./rank-showcase.js";
import { isContinuousGlowDisabled } from "./motion-prefs.js";

const RANK_NAMES = ["ブロンズ", "シルバー", "ゴールド", "プラチナ", "ダイヤモンド", "マスター", "レジェンド"];

// { won:boolean, rank:0..6, gauge:0..6, legendPoints:int, note?:string, promotedFrom?:0..6 }。
// promotedFrom が数値かつ rank より小さい時＝昇格として昇格演出を出す（シーズン中は降格なしなので
// rank 増加＝昇格のみ）。閉じたら解決する Promise を返す（victory.jsが順番にモーダルを見せるために
// awaitできる）。note は放置敗北など「なぜこの結果か」を1行添える任意のテキスト。
export function showRankedResultModal({ won, rank, gauge, legendPoints, note, promotedFrom }) {
  const promoted = typeof promotedFrom === "number" && promotedFrom < rank;
  return new Promise((resolve) => {
    let backdrop = null;
    let modal = null;
    const timers = [];
    const close = () => {
      for (const t of timers) clearTimeout(t);
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
    heading.className = "ranked-result-heading " + (promoted ? "is-promote" : won ? "is-win" : "is-lose");
    heading.textContent = promoted ? "🎉 ランクアップ！" : won ? "🏆 勝利！ ランクポイント獲得" : "ランクポイント減少";
    inner.appendChild(heading);

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.className = "ranked-result-note";
      noteEl.textContent = note;
      inner.appendChild(noteEl);
    }

    // 称号バッジ＋U型ゲージ＋宝石の合成ヒーロー表示。昇格時は before→after のクロスフェードで
    // 「ゲージ完成→称号変化」を見せる。
    const stage = document.createElement("div");
    stage.className = "ranked-result-showcase-stage" + (promoted ? " is-promote" : "");
    if (promoted) {
      // 背後の金色バースト（回転する放射状の光）。reduce-glow時は静止。
      const burst = document.createElement("div");
      burst.className = "ranked-result-burst" + (isContinuousGlowDisabled() ? " is-static" : "");
      stage.appendChild(burst);
      // 昇格前バッジ：旧ランク＋七色ゲージ満杯（＝ゲージ完成の瞬間）。最初に表示し、後でフェードアウト。
      const beforeShowcase = buildRankShowcase(promotedFrom, 7, 0, { animated: false });
      beforeShowcase.classList.add("ranked-result-before");
      // 昇格後バッジ：新ランク＋繰越ゲージ（アニメ版）。最初は小さく透明→ポップして出現。
      const afterShowcase = buildRankShowcase(rank, gauge, legendPoints, { animated: true });
      afterShowcase.classList.add("ranked-result-after");
      stage.appendChild(beforeShowcase);
      stage.appendChild(afterShowcase);
      // 一拍おいてから crossfade（ゲージ完成を見せてから称号が変わる）。
      timers.push(
        setTimeout(() => {
          stage.classList.add("is-transitioned");
        }, 1400)
      );
    } else {
      stage.appendChild(buildRankShowcase(rank, gauge, legendPoints, { animated: true }));
    }
    inner.appendChild(stage);

    if (promoted) {
      const promoLine = document.createElement("div");
      promoLine.className = "ranked-result-promote-line";
      promoLine.textContent = `${RANK_NAMES[promotedFrom] ?? ""} → ${RANK_NAMES[rank] ?? ""} 昇格！`;
      inner.appendChild(promoLine);
    }

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
