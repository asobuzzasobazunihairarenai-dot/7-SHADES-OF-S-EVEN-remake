// 勝利条件（docs/rulebook.md「Victory Conditions」）: 「自分のロックエリアに7色のカードを
// 全てロックした瞬間に勝利する。」main.jsのrender()の最後に毎回checkForVictory()を呼んでもらい、
// 参加中の各プレイヤーについて7色すべてのロックスロットが埋まっているかを判定、初めて達成した
// 瞬間だけ派手な勝利モーダルを出す（一度出したプレイヤーは、以後同じ対戦中は出し直さない）。

import { getState } from "./state.js";
import { COLORS, SEAT_TO_SIDE } from "./board-layout.js";
import { getPlayerName } from "./player-identity.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

let announcedPlayers = new Set();

// セットアップウィザードの手順1（盤面リセット）が走った時に呼ぶ。新しい対戦の開始なので、
// 前回の対戦で誰が勝っていたかの記録をリセットし、同じプレイヤーが再度勝った時にも
// きちんとモーダルが出るようにする。
export function resetVictoryTracking() {
  announcedPlayers = new Set();
}

function hasAllSevenLocked(player) {
  const side = SEAT_TO_SIDE[player];
  const lockedIndexes = new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side)
      .map((t) => t.location.index)
  );
  return COLORS.every((_color, index) => lockedIndexes.has(index));
}

function showVictoryModal(player) {
  const modal = document.createElement("div");
  modal.id = "victory-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10500 });

  const trophy = document.createElement("div");
  trophy.className = "victory-modal-trophy";
  trophy.textContent = "🏆";

  const title = document.createElement("div");
  title.className = "victory-modal-title";
  title.textContent = `${getPlayerName(player)} の勝利！`;

  const subtitle = document.createElement("div");
  subtitle.className = "victory-modal-subtitle";
  subtitle.textContent = "7色すべてのカードをロックエリアに揃えました";

  const closeX = createModalCloseX(close);
  closeX.classList.add("victory-modal-close");

  modal.appendChild(closeX);
  modal.appendChild(trophy);
  modal.appendChild(title);
  modal.appendChild(subtitle);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

export function checkForVictory() {
  for (const player of getState().activePlayers) {
    if (announcedPlayers.has(player)) continue;
    if (hasAllSevenLocked(player)) {
      announcedPlayers.add(player);
      showVictoryModal(player);
    }
  }
}
