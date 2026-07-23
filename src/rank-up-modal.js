// ユーザー要望「勝利時ランクアップした場合に何かモーダル出したい」への対応。
// post-game-panel.js（勝者が戦績システムへコメントを登録するタイミング）から、
// この対戦が承認されればランク（stats-profile.jsのgetTierInfo、対戦数に応じた
// 色付きリング）が上がるかどうかを判定して呼ばれる。
//
// ハマりどころ（設計判断）: 実際の対戦記録(matches行)は管理者の承認待ち(pending)の
// 状態で登録されるため、承認されるまでは戦績システム側のmatchesCountは実際には
// 増えない。しかし「勝った瞬間に気持ちよく祝いたい」という趣旨からすると、承認を
// 待ってから（数分〜数日後、プレイヤーはもう見ていない可能性が高い）通知しても
// 意味が薄い。そのため、呼び出し元（post-game-panel.js）は「この対戦が承認された
// 場合の見込みのランク」を対戦前の対戦数+1として楽観的に計算し、実際にティアが
// 変わる場合だけこのモーダルを呼ぶ。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

function buildBadge(tier, { large } = {}) {
  const badge = document.createElement("div");
  badge.className = `rank-up-modal-badge${large ? " is-large" : ""}${tier.type === "rainbow" ? " is-rainbow" : ""}`;
  if (tier.type !== "rainbow") {
    badge.style.setProperty("--rank-up-badge-color", tier.color);
  }
  return badge;
}

export function showRankUpModal({ fromTier, toTier }) {
  const modal = document.createElement("div");
  modal.id = "rank-up-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10700 });

  const closeX = createModalCloseX(close);
  closeX.classList.add("rank-up-modal-close");
  modal.appendChild(closeX);

  const title = document.createElement("div");
  title.className = "rank-up-modal-title";
  title.textContent = "🎉 ランクアップ！";
  modal.appendChild(title);

  const row = document.createElement("div");
  row.className = "rank-up-modal-row";
  row.appendChild(buildBadge(fromTier));

  const arrow = document.createElement("div");
  arrow.className = "rank-up-modal-arrow";
  arrow.textContent = "→";
  row.appendChild(arrow);

  row.appendChild(buildBadge(toTier, { large: true }));
  modal.appendChild(row);

  const subtitle = document.createElement("div");
  subtitle.className = "rank-up-modal-subtitle";
  subtitle.textContent = `「${fromTier.label}」から「${toTier.label}」になりました（対戦記録の承認後に反映されます）`;
  modal.appendChild(subtitle);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
