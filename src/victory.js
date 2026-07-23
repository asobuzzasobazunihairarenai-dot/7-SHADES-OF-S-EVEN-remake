// 勝利条件（docs/rulebook.md「Victory Conditions」）: 「自分のロックエリアに7色のカードを
// 全てロックした瞬間に勝利する。」main.jsのrender()の最後に毎回checkForVictory()を呼んでもらい、
// 参加中の各プレイヤーについて7色すべてのロックスロットが埋まっているかを判定、初めて達成した
// 瞬間だけ派手な勝利モーダルを出す（一度出したプレイヤーは、以後同じ対戦中は出し直さない）。

import { getState, isOnlineMode } from "./state.js";
import { COLORS, SEAT_TO_SIDE } from "./board-layout.js";
import { getPlayerName } from "./player-identity.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { playSound } from "./sound.js";
import { showPostGamePanel } from "./post-game-panel.js";

let announcedPlayers = new Set();

// セットアップウィザードの手順1（盤面リセット）が走った時に呼ぶ。新しい対戦の開始なので、
// 前回の対戦で誰が勝っていたかの記録をリセットし、同じプレイヤーが再度勝った時にも
// きちんとモーダルが出るようにする。
export function resetVictoryTracking() {
  announcedPlayers = new Set();
}

// ユーザー要望「残りロックエリアの数が3つになったらアバターを変更したい」用。
// そのプレイヤーの7色のロックスロットのうち、何色ロック済みかを返す（0〜7）。
export function getLockedCount(player) {
  const side = SEAT_TO_SIDE[player];
  const lockedIndexes = new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side)
      .map((t) => t.location.index)
  );
  return lockedIndexes.size;
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

// 「最後のロック承認」機能（main.js）用: あるプレイヤーのロックエリアの空きスロット
// (newIndex)にカードを1枚ロックしたと仮定した場合、それによって7色すべてが揃う
// （＝勝利になる）かどうかを判定する。既に埋まっているスロットへの判定は「今回の追加では
// 変化なし」としてfalseを返す（置き換えではなく新規ロックのみを対象にするため）。
export function wouldCompleteLockWithNewIndex(player, newIndex) {
  const side = SEAT_TO_SIDE[player];
  const lockedIndexes = new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side)
      .map((t) => t.location.index)
  );
  if (lockedIndexes.has(newIndex)) return false;
  lockedIndexes.add(newIndex);
  return COLORS.every((_color, index) => lockedIndexes.has(index));
}

function showVictoryModal(player) {
  playSound("victory");
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
      // ユーザー要望「ゲーム終了時にコメント記入→戦績確認・もう一度遊ぶボタン」。
      // オンライン対戦の全員の画面に出す（実際に戦績システムへ書き込むのは、
      // 勝者本人の画面だけ——post-game-panel.js内でgetSelfSeat()===winnerSeatを
      // 見て判定する）。ローカルモードでは対象外（対戦記録として意味を持つのは
      // オンライン対戦のみのため）。
      if (isOnlineMode()) {
        const { activePlayers } = getState();
        showPostGamePanel({ activePlayers, winnerSeat: player });
      }
    }
  }
}
