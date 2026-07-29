// ユーザー要望（続き95）「以前相談した対戦終了時の個人結果を実装しましょう」。
// 表示内容はユーザー確認済み: 「各プレイヤーの試合内スタッツ」＋「順位（3-4人戦）」。
// rank-reveal-modal.js（戦績システム全体の通算順位）とは別物で、あくまで今回の
// 1対局限りの結果——victory.jsのcheckForVictory()から、勝者・敗者を問わず全員の
// 画面に出す（勝者だけに絞る理由が無いため）。
//
// 「試合内スタッツ」は現時点ではロックした色数・手札残り枚数のみ（接触回数・使用した
// カード枚数等は、そもそも対局中にカウントする仕組みがまだ無いため今回は対象外。
// 必要になったら別途カウンターを追加する）。
// 「順位」はロック色数の多い順（同数は同順位）。2人戦は勝者/敗者の2択で自明なため
// 順位表は出さず、自分のスタッツだけを見せる。

import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { getState } from "./state.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { getSelfSeat } from "./online.js";
import { SEAT_TO_SIDE } from "./board-layout.js";
import { applyAvatarContent } from "./avatar-render.js";

const AUTO_CLOSE_MS = 7000;

function getLockedCountForSeat(seat) {
  const side = SEAT_TO_SIDE[seat];
  const lockedIndexes = new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side)
      .map((t) => t.location.index)
  );
  return lockedIndexes.size;
}

function getHandCountForSeat(seat) {
  return getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat).length;
}

// 戻り値のPromiseはモーダルが閉じた（自動/手動どちらでも）タイミングでresolveする
// （victory.js側で他のエピローグモーダルとの順番を制御するため、currency-award-modal.js
// 等と同じパターン）。
export function showMatchPersonalResultModal({ activePlayers, winnerSeat }) {
  return new Promise((resolve) => {
    const selfSeat = getSelfSeat();
    const standings = activePlayers
      .map((seat) => ({ seat, locked: getLockedCountForSeat(seat), hand: getHandCountForSeat(seat) }))
      .sort((a, b) => b.locked - a.locked);
    let rank = 0;
    let prevLocked = null;
    const ranked = standings.map((entry, i) => {
      if (entry.locked !== prevLocked) rank = i + 1;
      prevLocked = entry.locked;
      return { ...entry, rank };
    });
    const selfEntry = ranked.find((e) => e.seat === selfSeat);

    const modal = document.createElement("div");
    modal.id = "match-personal-result-modal";
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
    title.className = "match-personal-result-title";
    title.textContent = "📊 対戦結果";
    modal.appendChild(title);

    // 3人以上の対局だけ順位表を見せる（2人戦は勝者/敗者の2択で自明なため）。
    if (activePlayers.length >= 3) {
      const list = document.createElement("div");
      list.className = "match-personal-result-standings";
      for (const entry of ranked) {
        const row = document.createElement("div");
        row.className = "match-personal-result-row";
        if (entry.seat === selfSeat) row.classList.add("is-self");
        if (entry.seat === winnerSeat) row.classList.add("is-winner");

        const rankEl = document.createElement("div");
        rankEl.className = "match-personal-result-rank";
        rankEl.textContent = `${entry.rank}位`;
        row.appendChild(rankEl);

        const avatarEl = document.createElement("div");
        avatarEl.className = "match-personal-result-avatar";
        applyAvatarContent(avatarEl, getPlayerAvatar(entry.seat));
        row.appendChild(avatarEl);

        const nameEl = document.createElement("div");
        nameEl.className = "match-personal-result-name";
        nameEl.textContent = `${entry.seat === winnerSeat ? "🏆 " : ""}${getPlayerName(entry.seat)}`;
        row.appendChild(nameEl);

        const lockedEl = document.createElement("div");
        lockedEl.className = "match-personal-result-locked";
        lockedEl.textContent = `${entry.locked}/7色`;
        row.appendChild(lockedEl);

        list.appendChild(row);
      }
      modal.appendChild(list);
    }

    if (selfEntry) {
      const selfBlock = document.createElement("div");
      selfBlock.className = "match-personal-result-self";
      const selfTitle = document.createElement("div");
      selfTitle.className = "match-personal-result-self-title";
      selfTitle.textContent = "あなたの結果";
      selfBlock.appendChild(selfTitle);
      const selfStats = document.createElement("div");
      selfStats.className = "match-personal-result-self-stats";
      selfStats.textContent = `ロック ${selfEntry.locked}/7色・手札 ${selfEntry.hand}枚`;
      selfBlock.appendChild(selfStats);
      modal.appendChild(selfBlock);
    }

    modal.appendChild(createModalCloseX(close));
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    const autoCloseTimer = setTimeout(close, AUTO_CLOSE_MS);
  });
}
