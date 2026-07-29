// 勝利条件（docs/rulebook.md「Victory Conditions」）: 「自分のロックエリアに7色のカードを
// 全てロックした瞬間に勝利する。」main.jsのrender()の最後に毎回checkForVictory()を呼んでもらい、
// 参加中の各プレイヤーについて7色すべてのロックスロットが埋まっているかを判定、初めて達成した
// 瞬間だけ派手な勝利モーダルを出す（一度出したプレイヤーは、以後同じ対戦中は出し直さない）。

import { getState, isOnlineMode, subscribe } from "./state.js";
import { COLORS, SEAT_TO_SIDE } from "./board-layout.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { getAvatarVariant, applyAvatarContent } from "./avatar-render.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { playVictoryBgm } from "./sound.js";
import { showPostGamePanel } from "./post-game-panel.js";
import { awardMatchCurrency } from "./online.js";
import { refreshCurrencyDisplay } from "./currency-display.js";
import { showCurrencyAwardModal } from "./currency-award-modal.js";
import { showRankRevealModal } from "./rank-reveal-modal.js";
import { showMatchPersonalResultModal } from "./match-personal-result-modal.js";

// ユーザー要望「勝利モーダルが5秒ぐらいしっかり出た後に、『戦績確認・もう一度遊ぶ』
// モーダル（勝利者へのコメント依頼を含む）が出るようにしてほしい」への対応。以前は
// 両方のモーダルを同じタイミングで同時に出しており、画面上で重なって表示が
// ごちゃついてしまっていた（ユーザー報告のスクリーンショットで確認）。勝利モーダルを
// 最低でもこの時間は表示してから、閉じた（自動 or 手動どちらでも）タイミングで
// 次のモーダルへ引き継ぐ。
const VICTORY_MODAL_MIN_DISPLAY_MS = 5000;

let announcedPlayers = new Set();

// セットアップウィザードの手順1（盤面リセット）が走った時に呼ぶ。新しい対戦の開始なので、
// 前回の対戦で誰が勝っていたかの記録をリセットし、同じプレイヤーが再度勝った時にも
// きちんとモーダルが出るようにする。
export function resetVictoryTracking() {
  announcedPlayers = new Set();
}

// ユーザー報告（続き86）「勝利後、まだ盤面のタイマーが止まらず自動処理が継続されて
// しまっている」への対応。checkForVictory()は勝利モーダルを出すだけで、turnPlayer・
// priorityPlayer等のゲーム進行用の状態を一切書き換えないため、ターンタイマー
// （turn-timer.js）も自動処理（phase-automation.js）も勝利後もそれまで通り動き
// 続けてしまっていた。誰かが既に勝利済みかどうかを、両モジュールから軽量に
// 確認できるようにする。
export function hasAnyoneWon() {
  return announcedPlayers.size > 0;
}

// ユーザー報告「勝利した時、勝利モーダル、勝利BGMが鳴らなくなりました」の原因調査で
// 発見した不具合への対応。announcedPlayers（座席A〜Dの単純な集合、部屋・対局をまたいで
// 同じ変数を使い回す）をクリアする経路が、以前は(a)ローカルのセットアップウィザード
// 手順1と(b)post-game-panel.jsの「もう一度遊ぶ」ボタンの2箇所だけの手動呼び出しに
// 限られていた。しかしオンライン対戦の「ゲームを開始する」（online.jsのstartGame→
// サーバー側のBOOTSTRAP_GAME）は、そのどちらの経路も経由しない（サーバー側で完結する
// ため）。そのため一度でもどこかで座席Aが勝つと、以後の（別の部屋・別の対局を含む）
// 座席Aの勝利が二度と演出されなくなっていた。turnPlayerがnull→非nullに変わった瞬間
// （online-ui.jsが部屋モーダルの自動クローズに使っているのと同じ「新しい対局が始まった」
// 検知パターン）を汎用的に拾い、どの経路で始まった対局でも確実にリセットされるようにする
// （既存の2箇所の手動呼び出しは無害な二重呼び出しとして残す）。
let wasGameStartedForVictoryTracking = false;
subscribe(() => {
  const started = Boolean(getState().turnPlayer);
  if (started && !wasGameStartedForVictoryTracking) {
    resetVictoryTracking();
  }
  wasGameStartedForVictoryTracking = started;
});

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

function showVictoryModal(player, onClose) {
  playVictoryBgm();
  const modal = document.createElement("div");
  modal.id = "victory-modal";
  let done = false;
  const close = () => {
    if (done) return;
    done = true;
    clearTimeout(autoCloseTimer);
    backdrop.remove();
    modal.remove();
    onClose?.();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10500 });

  // ユーザー要望「勝利モーダルにはアバターも大きく表示させてください」。
  // 手前(front)向きの、その時点の実際のアバター（覚醒/激昂版への差し替えは含まない、
  // 勝利の瞬間の「素」の姿を見せたいため常にgetPlayerAvatarの値をそのまま使う）。
  const avatarEl = document.createElement("div");
  avatarEl.className = "victory-modal-avatar";
  applyAvatarContent(avatarEl, getAvatarVariant(getPlayerAvatar(player), "front"));

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
  modal.appendChild(avatarEl);
  modal.appendChild(trophy);
  modal.appendChild(title);
  modal.appendChild(subtitle);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);

  // ユーザー要望「勝利モーダルが5秒ぐらいしっかり出た後に次のモーダルが出るように」。
  // 早く閉じたい人のために✕/背景クリックでの手動クローズも引き続き効くが（この場合は
  // すぐにonCloseへ進む）、何もしなければ最低でもこの時間は表示され続ける。
  const autoCloseTimer = setTimeout(close, VICTORY_MODAL_MIN_DISPLAY_MS);
}

export function checkForVictory() {
  for (const player of getState().activePlayers) {
    if (announcedPlayers.has(player)) continue;
    if (hasAllSevenLocked(player)) {
      announcedPlayers.add(player);
      // ユーザー要望「ゲーム終了時にコメント記入→戦績確認・もう一度遊ぶボタン」＋
      // （続き87）「勝利時にお金を獲得した演出モーダルが欲しい」「勝利後、自分の順位を
      // 表示させたい」への対応。オンライン対戦の全員の画面に出す（実際に戦績システムへ
      // 書き込むのは勝者本人の画面だけ——post-game-panel.js内でgetSelfSeat()===
      // winnerSeatを見て判定する）。ローカルモードでは対象外（対戦記録・通貨・
      // ランキングいずれも意味を持つのはオンライン対戦のみのため）。
      // 勝利モーダル→通貨獲得モーダル→順位モーダル→戦績パネル、の順に必ず1つずつ
      // 閉じてから次を出す（続き48「勝利モーダルが5秒ぐらいしっかり出た後に次の
      // モーダルが出るように」の教訓通り、同時に出すと画面が重なってごちゃつくため）。
      // awardMatchCurrency()自身がサーバー側で「1ゲーム1回」に制限するため、
      // 全クライアント（勝者本人・傍観者それぞれ）がここを通っても二重付与にはならない
      // （online.jsのso7_award_match_currencyコメント参照）。playerは今まさに7色揃えた
      // 本人＝勝者の座席なので、そのままボーナス対象の座席として渡す。
      showVictoryModal(player, async () => {
        if (!isOnlineMode()) return;
        try {
          const amount = await awardMatchCurrency(player);
          refreshCurrencyDisplay();
          // 0は「他クライアントが先に付与済みだった」場合なので演出は出さない
          // （online.jsのawardMatchCurrencyコメント参照）。
          if (amount > 0) await showCurrencyAwardModal(amount);
        } catch (err) {
          console.error("awardMatchCurrency failed", err);
        }
        try {
          // 戦績システムと未連携・ランキング対象外（対戦数が少なすぎる等）の場合は
          // 何も表示せず即座に戻る（rank-reveal-modal.js参照）。
          await showRankRevealModal();
        } catch (err) {
          console.error("showRankRevealModal failed", err);
        }
        // ユーザー要望（続き95）「対戦終了時の個人結果を実装」。勝者/敗者を問わず
        // 全員の画面に、今回1対局限りのスタッツ・順位（3-4人戦）を見せる
        // （rank-reveal-modal.jsの戦績システム全体の通算順位とは別物）。
        try {
          await showMatchPersonalResultModal({ activePlayers: getState().activePlayers, winnerSeat: player });
        } catch (err) {
          console.error("showMatchPersonalResultModal failed", err);
        }
        const { activePlayers } = getState();
        showPostGamePanel({ activePlayers, winnerSeat: player });
      });
    }
  }
}
