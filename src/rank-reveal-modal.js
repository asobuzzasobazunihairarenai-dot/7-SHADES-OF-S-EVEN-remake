// ユーザー要望（続き87）「勝利後、まだ盤面のタイマーが…」の別要望「勝利後、自分の
// 順位を表示させたい。最下位から順位が上がっていき、自分の順位のところで自分が
// 強調されている感じがいい。出来れば前回から何位アップ、ダウンがわかるといい」
// への対応。ranking-page.js（画面全体版、上位N件の一覧）とは別に、勝利エピローグ用に
// 「自分の順位（何位より下でも良い）」だけをクライミング演出付きで見せる専用モーダル。
//
// 対象カテゴリは、ranking-page.jsの既定タブと同じ「勝率」に固定した（3種類全部を
// 出すと勝利直後の演出として重くなるため）。
// 前回順位との比較はサーバーに保存せず、localStorage（このブラウザ限定、
// tutorial.jsのSTORAGE_KEYと同じ考え方）に前回値を持たせるだけの軽量な実装にした。

import { createBackdrop } from "./ui-helpers.js";
import { getCurrentUser } from "./online.js";
import { fetchStatsProfile, fetchPlayerRank } from "./stats-profile.js";

const AUTO_CLOSE_MS = 6000;
const CLIMB_DURATION_MS = 1800;
const LAST_RANK_STORAGE_KEY = "so7-last-winrate-rank";

function getStoredLastRank() {
  try {
    const raw = localStorage.getItem(LAST_RANK_STORAGE_KEY);
    return raw === null ? null : Number(raw);
  } catch (err) {
    return null;
  }
}

function storeLastRank(rank) {
  try {
    localStorage.setItem(LAST_RANK_STORAGE_KEY, String(rank));
  } catch (err) {
    // localStorageが使えない環境でも致命的ではない（前回比較が出ないだけ）
  }
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// 「最下位から順位が上がっていく」演出。fromは表示上の開始値（＝最下位）、toが
// 実際の自分の順位。requestAnimationFrameで自前に緩急をつける（数字が小さいほど
// 良い順位なので、大きい数字から減っていく形が「上位へ上がっていく」に対応する）。
function animateClimb(numberEl, from, to, onSettled) {
  if (from <= to) {
    numberEl.textContent = `${to}位`;
    onSettled();
    return;
  }
  const start = performance.now();
  function frame(now) {
    const t = Math.min(1, (now - start) / CLIMB_DURATION_MS);
    const eased = easeOutCubic(t);
    const current = Math.round(from - (from - to) * eased);
    numberEl.textContent = `${current}位`;
    if (t < 1) {
      requestAnimationFrame(frame);
    } else {
      numberEl.textContent = `${to}位`;
      onSettled();
    }
  }
  requestAnimationFrame(frame);
}

// 表示できる材料が揃わない場合（未連携・ランキング対象外・未ログイン等）は何もせず
// 即resolveする——victory.js側の呼び出し連鎖を止めないため。
export async function showRankRevealModal() {
  const user = await getCurrentUser();
  if (!user) return;

  let profile;
  try {
    profile = await fetchStatsProfile(user.id);
  } catch (err) {
    console.error("fetchStatsProfile (rank reveal) failed", err);
    return;
  }
  if (!profile.linked) return;

  let rankInfo;
  try {
    rankInfo = await fetchPlayerRank(profile.playerId, "winRate");
  } catch (err) {
    console.error("fetchPlayerRank (rank reveal) failed", err);
    return;
  }
  if (!rankInfo) return;

  const previousRank = getStoredLastRank();
  storeLastRank(rankInfo.rank);

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "rank-reveal-modal";
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      clearTimeout(autoCloseTimer);
      backdrop.remove();
      modal.remove();
      resolve();
    };
    const backdrop = createBackdrop(close, { dim: true, zIndex: 10530 });

    const title = document.createElement("div");
    title.className = "rank-reveal-modal-title";
    title.textContent = "🏆 勝率ランキング";
    modal.appendChild(title);

    const numberEl = document.createElement("div");
    numberEl.className = "rank-reveal-modal-number";
    numberEl.textContent = `${rankInfo.totalRanked}位`;
    modal.appendChild(numberEl);

    const deltaEl = document.createElement("div");
    deltaEl.className = "rank-reveal-modal-delta";
    modal.appendChild(deltaEl);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    animateClimb(numberEl, rankInfo.totalRanked, rankInfo.rank, () => {
      numberEl.classList.add("is-settled");
      if (previousRank != null && previousRank !== rankInfo.rank) {
        const diff = previousRank - rankInfo.rank; // 正なら順位アップ（数字が小さくなった）
        deltaEl.textContent = diff > 0 ? `▲${diff} 上昇` : `▼${Math.abs(diff)} 下降`;
        deltaEl.classList.add(diff > 0 ? "is-up" : "is-down");
      } else if (previousRank === rankInfo.rank) {
        deltaEl.textContent = "→ 前回と同じ順位";
      }
    });

    const autoCloseTimer = setTimeout(close, AUTO_CLOSE_MS);
  });
}
