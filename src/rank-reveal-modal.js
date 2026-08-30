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
import { t } from "./ui-text.js"; // UI英語化フェーズ11
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
    numberEl.textContent = t("rrm.place", { n: to });
    onSettled();
    return;
  }
  const start = performance.now();
  function frame(now) {
    // #189: この変数を t にすると翻訳関数 t を隠して "t is not a function" になる。
    const progress = Math.min(1, (now - start) / CLIMB_DURATION_MS);
    const eased = easeOutCubic(progress);
    const current = Math.round(from - (from - to) * eased);
    numberEl.textContent = t("rrm.place", { n: current });
    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      numberEl.textContent = t("rrm.place", { n: to });
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

  // ユーザー要望「対戦終了後のランキング表示は、実際のランキング画面のようなアバターと名前が
  // 連なっているものを、最下位から登っていく見た目にしたい」。数字だけのクライミングをやめ、
  // 勝率ランキングの全対象を一覧で出し、ハイライトを最下位から自分の順位まで登らせる。
  let lb;
  try {
    lb = await fetchLeaderboard(1000);
  } catch (err) {
    console.error("fetchLeaderboard (rank reveal) failed", err);
    return;
  }
  const rows = lb.winRate || [];
  const myIndex = rows.findIndex((r) => r.playerId === profile.playerId);
  if (myIndex < 0) return showNotRankedModal("below-border"); // 勝率ランキングの対象外

  const myRank = rows[myIndex].rank;
  const previousRank = getStoredLastRank();
  storeLastRank(myRank);

  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "rank-reveal-modal";
    modal.classList.add("is-climb");
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      backdrop.remove();
      modal.remove();
      resolve();
    };
    const backdrop = createBackdrop(close, { dim: true, zIndex: 10530 });

    const title = document.createElement("div");
    title.className = "rank-reveal-modal-title";
    title.textContent = t("rankrevealmodal.L119");
    modal.appendChild(title);

    const list = document.createElement("div");
    list.className = "rank-reveal-climb-list";
    const rowEls = rows.map((row) => {
      const item = document.createElement("div");
      item.className = "rank-reveal-climb-row";
      if (row.playerId === profile.playerId) item.classList.add("is-self");
      const rankEl = document.createElement("span");
      rankEl.className = "rr-rank";
      rankEl.textContent = `${row.rank}`;
      item.appendChild(rankEl);
      if (row.avatarUrl) {
        const av = document.createElement("img");
        av.className = "rr-avatar";
        av.src = row.avatarUrl;
        av.alt = "";
        item.appendChild(av);
      }
      const nameEl = document.createElement("span");
      nameEl.className = "rr-name";
      nameEl.textContent = row.name; // textContentで安全に表示
      item.appendChild(nameEl);
      const valEl = document.createElement("span");
      valEl.className = "rr-val";
      valEl.textContent = `${row.winRate}%`;
      item.appendChild(valEl);
      list.appendChild(item);
      return item;
    });
    modal.appendChild(list);

    const deltaEl = document.createElement("div");
    deltaEl.className = "rank-reveal-modal-delta";
    modal.appendChild(deltaEl);

    modal.appendChild(createModalCloseX(close));
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    // ハイライトを最下位(一番下の行)から自分の行まで登らせる。各ステップでその行を中央へ
    // スクロールして「上がっていく」動きを見せ、到達したら自分の行を強調（is-arrived）する。
    const lastIndex = rows.length - 1;
    let currentHi = -1;
    const setFocus = (idx) => {
      if (currentHi >= 0 && rowEls[currentHi]) rowEls[currentHi].classList.remove("is-climb-focus");
      currentHi = idx;
      const el = rowEls[idx];
      if (el) {
        el.classList.add("is-climb-focus");
        el.scrollIntoView({ block: "center" });
      }
    };
    const settle = () => {
      setFocus(myIndex);
      rowEls[myIndex]?.classList.add("is-arrived");
      if (previousRank != null && previousRank !== myRank) {
        const diff = previousRank - myRank; // 正なら順位アップ
        deltaEl.textContent = diff > 0 ? t("rrm.up", { n: diff }) : t("rrm.down", { n: Math.abs(diff) });
        deltaEl.classList.add(diff > 0 ? "is-up" : "is-down");
      } else if (previousRank === myRank) {
        deltaEl.textContent = t("rankrevealmodal.L181");
      }
    };
    setFocus(lastIndex);
    if (lastIndex <= myIndex) {
      settle();
    } else {
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / CLIMB_DURATION_MS);
        const eased = easeOutCubic(t);
        const idx = Math.round(lastIndex - (lastIndex - myIndex) * eased);
        if (idx !== currentHi) setFocus(idx);
        if (t < 1) requestAnimationFrame(frame);
        else settle();
      };
      requestAnimationFrame(frame);
    }
  });
}

// 未ランクインの理由ごとの説明文と、必要ならCTA（ログイン導線）。
function explainNotRanked(reason) {
  switch (reason) {
    case "not-logged-in":
      return {
        text: t("rankrevealmodal.L207"),
        ctaLabel: t("rankrevealmodal.L208"),
        ctaAction: () => signInWithGoogle().catch((err) => console.error("signInWithGoogle failed", err)),
      };
    case "guest":
      return {
        text: t("rankrevealmodal.L213"),
        ctaLabel: t("rankrevealmodal.L208"),
        ctaAction: () => signInWithGoogle().catch((err) => console.error("signInWithGoogle failed", err)),
      };
    case "not-linked":
      return {
        text: t("rankrevealmodal.L219"),
      };
    case "below-border":
      return {
        text: t("rankrevealmodal.L223"),
      };
    default:
      return { text: t("rankrevealmodal.L226") };
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
    title.textContent = t("rankrevealmodal.L119");
    modal.appendChild(title);

    const list = document.createElement("div");
    list.className = "rank-reveal-leaderboard";
    if (topRows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "rank-reveal-leaderboard-empty";
      empty.textContent = t("rankrevealmodal.L267");
      list.appendChild(empty);
    } else {
      for (const row of topRows) {
        const item = document.createElement("div");
        item.className = "rank-reveal-leaderboard-row";
        const rankEl = document.createElement("span");
        rankEl.className = "rr-rank";
        rankEl.textContent = t("rrm.place", { n: row.rank });
        const nameEl = document.createElement("span");
        nameEl.className = "rr-name";
        nameEl.textContent = row.name; // textContentでユーザー名を安全に表示
        const valEl = document.createElement("span");
        valEl.className = "rr-val";
        valEl.textContent = t("rrm.winRate", { n: row.winRate });
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
