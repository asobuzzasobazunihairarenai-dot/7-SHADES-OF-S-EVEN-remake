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

import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { getCurrentUser, signInWithGoogle } from "./online.js";
import { fetchStatsProfile, fetchPlayerRank, fetchLeaderboard } from "./stats-profile.js";

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
  // ユーザー要望「自分がランキングに載っていない場合でも、ランキング自体は見せつつ、なぜ
  // 載っていないのかを説明し、原因が未ログイン/ゲストならログインを促す」。各早期returnの
  // 代わりに、状況（reason）を添えて未ランクイン用モーダルを出す。
  const user = await getCurrentUser();
  if (!user) return showNotRankedModal("not-logged-in");
  if (user.is_anonymous) return showNotRankedModal("guest");

  let profile;
  try {
    profile = await fetchStatsProfile(user.id);
  } catch (err) {
    console.error("fetchStatsProfile (rank reveal) failed", err);
    return;
  }
  if (!profile.linked) return showNotRankedModal("not-linked");

  let rankInfo;
  try {
    rankInfo = await fetchPlayerRank(profile.playerId, "winRate");
  } catch (err) {
    console.error("fetchPlayerRank (rank reveal) failed", err);
    return;
  }
  if (!rankInfo) return showNotRankedModal("below-border");

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

    // ユーザー要望（変更）: 対戦終了時のモーダルは自動で次へ進まない。✕/背景クリックでのみ閉じる。
    const autoCloseTimer = null;
  });
}

// 未ランクインの理由ごとの説明文と、必要ならCTA（ログイン導線）。
function explainNotRanked(reason) {
  switch (reason) {
    case "not-logged-in":
      return {
        text: "あなたはまだランキングに参加していません。ログインすると、オンライン対戦の結果が戦績に記録され、ランキングに参加できます。",
        ctaLabel: "Googleでログイン",
        ctaAction: () => signInWithGoogle().catch((err) => console.error("signInWithGoogle failed", err)),
      };
    case "guest":
      return {
        text: "ゲストプレイはランキングの対象外です。Googleアカウントでログインすると、対戦結果が記録され、ランキングに参加できるようになります。",
        ctaLabel: "Googleでログイン",
        ctaAction: () => signInWithGoogle().catch((err) => console.error("signInWithGoogle failed", err)),
      };
    case "not-linked":
      return {
        text: "まだ戦績が登録されていません。オンライン対戦を1戦プレイすると自動的に登録され、ランキングに参加できます。",
      };
    case "below-border":
      return {
        text: "対戦数がまだ少ないため、勝率ランキングの対象外です。もう少し対戦を重ねると対象になります。",
      };
    default:
      return { text: "あなたはまだランキングに参加していません。" };
  }
}

// 自分がランキングに載っていない時：勝率ランキングの上位一覧を見せつつ、載っていない理由を
// 説明し、原因が未ログイン/ゲストならログイン導線を出す（ユーザー要望）。表示材料が全く
// 取れない時（通信失敗等）は何もせず即resolveする（victory.jsのエピローグ連鎖を止めない）。
async function showNotRankedModal(reason) {
  let topRows = [];
  try {
    const lb = await fetchLeaderboard(10);
    topRows = lb.winRate || [];
  } catch (err) {
    console.error("fetchLeaderboard (rank reveal) failed", err);
  }

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "rank-reveal-modal";
    modal.classList.add("is-not-ranked");
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

    const list = document.createElement("div");
    list.className = "rank-reveal-leaderboard";
    if (topRows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "rank-reveal-leaderboard-empty";
      empty.textContent = "まだランキングデータがありません。";
      list.appendChild(empty);
    } else {
      for (const row of topRows) {
        const item = document.createElement("div");
        item.className = "rank-reveal-leaderboard-row";
        const rankEl = document.createElement("span");
        rankEl.className = "rr-rank";
        rankEl.textContent = `${row.rank}位`;
        const nameEl = document.createElement("span");
        nameEl.className = "rr-name";
        nameEl.textContent = row.name; // textContentでユーザー名を安全に表示
        const valEl = document.createElement("span");
        valEl.className = "rr-val";
        valEl.textContent = `勝率 ${row.winRate}%`;
        item.appendChild(rankEl);
        item.appendChild(nameEl);
        item.appendChild(valEl);
        list.appendChild(item);
      }
    }
    modal.appendChild(list);

    const { text, ctaLabel, ctaAction } = explainNotRanked(reason);
    const note = document.createElement("div");
    note.className = "rank-reveal-not-ranked-note";
    note.textContent = text;
    modal.appendChild(note);

    if (ctaLabel && ctaAction) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "rank-reveal-cta-btn";
      btn.textContent = ctaLabel;
      btn.addEventListener("click", () => {
        close();
        ctaAction();
      });
      modal.appendChild(btn);
    }

    modal.appendChild(createModalCloseX(close));
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    // ユーザー要望（変更）: 対戦終了時のモーダルは自動で次へ進まない。✕/背景クリックでのみ閉じる。
    const autoCloseTimer = null;
  });
}
