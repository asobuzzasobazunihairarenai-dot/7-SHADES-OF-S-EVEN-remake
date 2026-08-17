// シーズン終了報酬モーダル（docs/ranked-spec.md「シーズン終了時のランク報酬」）。
// 新シーズンに初めてログイン/ランクに触れた時、前シーズンの到達ランク（ピーク）に応じた
// 通貨が既に付与されている。この画面はそれを「先月の報酬」として1回だけ見せる祝賀モーダル。
// 通貨自体はサーバー側（so7_ranked_apply_delta のシーズン切替）で付与済みなので、この画面は
// 表示に徹し、閉じたら呼び出し側が so7_ranked_claim_reward で未受取記録をクリアする。

import { createBackdrop } from "./ui-helpers.js";
import { buildRankBadgeImage, rankName } from "./rank-badge.js";
import { isContinuousGlowDisabled } from "./motion-prefs.js";

// { season:"2026-07", rank:0..6, amount:int }。閉じたら resolve する Promise を返す
// （呼び出し側が await して、その後 claimSeasonReward() を呼ぶ）。
export function showSeasonRewardModal({ season, rank, amount }) {
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
    modal.id = "season-reward-modal";
    if (!isContinuousGlowDisabled()) modal.classList.add("is-celebrating");

    const title = document.createElement("div");
    title.className = "season-reward-title";
    title.textContent = "🎉 シーズン報酬";
    modal.appendChild(title);

    const sub = document.createElement("div");
    sub.className = "season-reward-sub";
    sub.textContent = season ? `先月（${season}）の到達ランク` : "先月の到達ランク";
    modal.appendChild(sub);

    // 背後に回る金色の放射バースト（祝賀感）。reduce-glow時は静止。
    const burst = document.createElement("div");
    burst.className = "season-reward-burst";
    modal.appendChild(burst);

    const badgeWrap = document.createElement("div");
    badgeWrap.className = "season-reward-badge";
    badgeWrap.appendChild(buildRankBadgeImage(rank, { animated: true, size: "8rem" }));
    modal.appendChild(badgeWrap);

    const rname = document.createElement("div");
    rname.className = "season-reward-rankname";
    rname.textContent = rankName(rank);
    modal.appendChild(rname);

    const reward = document.createElement("div");
    reward.className = "season-reward-amount";
    const coin = document.createElement("img");
    coin.className = "season-reward-coin";
    coin.src = "assets/icons/currency.png";
    coin.alt = "通貨";
    reward.appendChild(coin);
    const amt = document.createElement("span");
    amt.className = "season-reward-amount-num";
    amt.textContent = `+${amount ?? 0}`;
    reward.appendChild(amt);
    modal.appendChild(reward);

    const note = document.createElement("div");
    note.className = "season-reward-note";
    note.textContent = "報酬はすでに残高に加算されています。ショップで使えます。";
    modal.appendChild(note);

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "season-reward-claim";
    btn.textContent = "受け取る";
    btn.addEventListener("click", close);
    modal.appendChild(btn);

    document.body.appendChild(modal);
  });
}
