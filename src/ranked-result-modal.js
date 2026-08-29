// ランク対局の結果後に、自分の新しいランク（段位・七色ゲージ or レジェンドポイント）と
// 勝敗を表示するモーダル（フェーズ3）。docs/ranked-spec.md参照。
// 昇格した場合（promotedFrom）は「七色ゲージ完成→称号変化」の昇格演出を出す（フェーズ6）。
// 昇格でない場合は「反映後の現在ランク＋勝敗」を確実に見せる。

import { createBackdrop } from "./ui-helpers.js";
import { rankNames } from "./rank-badge.js"; // UI英語化フェーズ13: 段位名（使う時に解決）
import { buildRankShowcase, lightGem, dimGem } from "./rank-showcase.js";
import { isContinuousGlowDisabled } from "./motion-prefs.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

const GEM_STEP_MS = 520; // ジェムを1個ずつ点灯/消灯する間隔（ゆっくり）
const GEM_START_DELAY = 500; // モーダルが出てから最初のジェムが灯るまでの溜め

// UI英語化フェーズ13: 段位名は rank-badge.js の rankNames()（使う時に解決）を共用する。

// { won:boolean, rank:0..6, gauge:0..6, legendPoints:int, note?:string, promotedFrom?:0..6 }。
// promotedFrom が数値かつ rank より小さい時＝昇格として昇格演出を出す（シーズン中は降格なしなので
// rank 増加＝昇格のみ）。閉じたら解決する Promise を返す（victory.jsが順番にモーダルを見せるために
// awaitできる）。note は放置敗北など「なぜこの結果か」を1行添える任意のテキスト。
export function showRankedResultModal({ won, rank, gauge, legendPoints, note, promotedFrom, fromRank, fromGauge }) {
  const promoted = typeof promotedFrom === "number" && promotedFrom < rank;
  // ジェムを1個ずつ増減させる演出ができるか（開始ゲージが分かる＆レジェンド＝LPでない）。
  const canAnimateGems = rank < 6 && typeof fromGauge === "number";
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
  heading.textContent = promoted ? t("rrm.rankUp") : won ? t("rrm.won") : t("rrm.lost");
    inner.appendChild(heading);

    if (note) {
      const noteEl = document.createElement("div");
      noteEl.className = "ranked-result-note";
      noteEl.textContent = note;
      inner.appendChild(noteEl);
    }

    // 称号バッジ＋U型ゲージ＋宝石の合成ヒーロー表示。ジェムは開始ゲージから1個ずつ増える演出を出す
    // （ユーザー要望「ゲージをもらうときゆっくり1個ずつもらう演出」）。昇格時は before(旧ランク)の
    // ゲージを完成→称号変化→after(新ランク)の繰越ゲージを1個ずつ、という流れにする。
    const stage = document.createElement("div");
    stage.className = "ranked-result-showcase-stage" + (promoted ? " is-promote" : "");
    if (promoted) {
      // 背後の金色バースト（回転する放射状の光）。reduce-glow時は静止。
      const burst = document.createElement("div");
      burst.className = "ranked-result-burst" + (isContinuousGlowDisabled() ? " is-static" : "");
      stage.appendChild(burst);
      // 昇格前バッジ：旧ランク。開始ゲージ(fromGauge)から表示し、7まで1個ずつ点灯させてゲージ完成を見せる。
      const beforeStartGauge = canAnimateGems ? fromGauge : 7;
      const beforeShowcase = buildRankShowcase(promotedFrom, beforeStartGauge, 0, { effects: true });
      beforeShowcase.classList.add("ranked-result-before");
      // 昇格後バッジ：新ランク＋繰越ゲージ（アニメ版）。演出時は0から始め、後で1個ずつ点灯。
      const afterStartGauge = canAnimateGems ? 0 : gauge;
      const afterShowcase = buildRankShowcase(rank, afterStartGauge, legendPoints, { effects: true });
      afterShowcase.classList.add("ranked-result-after");
      stage.appendChild(beforeShowcase);
      stage.appendChild(afterShowcase);

      if (canAnimateGems) {
        // 1) before のゲージを fromGauge → 7 まで1個ずつ点灯（ゲージ完成）。
        let t = GEM_START_DELAY;
        for (let i = fromGauge; i < 7; i++) {
          const idx = i;
          timers.push(setTimeout(() => lightGem(beforeShowcase, idx), t));
          t += GEM_STEP_MS;
        }
        // 2) 完成を少し味わってから crossfade（称号が変わる）。
        const transitionAt = t + 450;
        timers.push(setTimeout(() => stage.classList.add("is-transitioned"), transitionAt));
        // 3) crossfade後、after の繰越ゲージ 0 → gauge を1個ずつ点灯。
        let t2 = transitionAt + 750;
        for (let i = 0; i < gauge; i++) {
          const idx = i;
          timers.push(setTimeout(() => lightGem(afterShowcase, idx), t2));
          t2 += GEM_STEP_MS;
        }
      } else {
        // 開始ゲージ不明（reconnect等）：従来通り一拍おいて crossfade するだけ。
        timers.push(setTimeout(() => stage.classList.add("is-transitioned"), 1400));
      }
    } else {
      // 昇格なし：開始ゲージから最終ゲージへ1個ずつ増減させる。
      const startGauge = canAnimateGems ? fromGauge : gauge;
      const showcase = buildRankShowcase(rank, startGauge, legendPoints, { effects: true });
      stage.appendChild(showcase);
      if (canAnimateGems && gauge !== fromGauge) {
        let t = GEM_START_DELAY;
        if (gauge > fromGauge) {
          for (let i = fromGauge; i < gauge; i++) {
            const idx = i;
            timers.push(setTimeout(() => lightGem(showcase, idx), t));
            t += GEM_STEP_MS;
          }
        } else {
          // 減少（敗北）：後ろ（右側＝紫寄り）から1個ずつ消灯。
          for (let i = fromGauge - 1; i >= gauge; i--) {
            const idx = i;
            timers.push(setTimeout(() => dimGem(showcase, idx), t));
            t += GEM_STEP_MS;
          }
        }
      }
    }
    inner.appendChild(stage);

    if (promoted) {
      const promoLine = document.createElement("div");
      promoLine.className = "ranked-result-promote-line";
      promoLine.textContent = t("rrm.promo", { from: rankNames()[promotedFrom] ?? "", to: rankNames()[rank] ?? "" });
      inner.appendChild(promoLine);
    }

    const rankName = document.createElement("div");
    rankName.className = "ranked-result-rank";
    rankName.textContent = rankNames()[rank] ?? rankNames()[0];
    inner.appendChild(rankName);

    if (rank >= 6) {
      const lp = document.createElement("div");
      lp.className = "ranked-result-lp";
    lp.textContent = t("rrm.lp", { n: legendPoints ?? 0 });
      inner.appendChild(lp);
    } else {
      const gaugeText = document.createElement("div");
      gaugeText.className = "ranked-result-gauge-text";
    gaugeText.textContent = t("rrm.gauge", { n: gauge ?? 0 });
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
