// 「相手ゲート侵攻ボーナス」(docs/rulebook.md「Gate Invasion Bonus」)の自動処理。
// 「ターン終了」ボタンが押された瞬間、手番プレイヤーの駒が参加中の別プレイヤーのゲートに
// 乗っていれば発生条件を満たす（自分のゲート・空席のゲートは対象外）。
// ①手札を半分（端数切り捨て）奪う → ②エターナルカードを1枚獲得しロック → ③自分のゲートの
// カードを回収してゲートに帰還、の3段階を、それぞれ内容を予告するポップアップ→OKで実行、
// という形で順番に自動処理する。条件を満たさない時は何もせずdone()を呼ぶ。

import { getState, gateInvasionStealHand, gateInvasionEternal, gateInvasionReturnHome } from "./state.js";
import { GATE_POSITIONS, SIDE_TO_SEAT, SEAT_LABELS } from "./board-layout.js";
import { getCardDefinition } from "./cards-data.js";

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

function findAttackerPiece(attacker) {
  return getState().tokens.find((t) => t.kind === "piece" && t.player === attacker);
}

// 手番プレイヤー(attacker)の駒が、参加中の別プレイヤーのゲートに乗っているか判定する。
// 乗っていればそのプレイヤー（侵攻された側）の座席を返し、そうでなければnull。
function findInvadedDefender(attacker) {
  const piece = findAttackerPiece(attacker);
  if (!piece || piece.location.zone !== "cell") return null;
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    if (pos.row !== piece.location.row || pos.col !== piece.location.col) continue;
    const defender = SIDE_TO_SEAT[side];
    if (defender === attacker) return null; // 自分のゲートは対象外
    if (!getState().activePlayers.includes(defender)) return null; // 空席のゲートは対象外
    return defender;
  }
  return null;
}

function showBonusStepModal(text, onOk) {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = "position: fixed; inset: 0; z-index: 10001; background: rgba(0, 0, 0, 0.55);";
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(26rem, 90vw); background: rgba(15, 23, 32, 0.98);
    border: 1px solid rgba(251, 191, 36, 0.5); border-radius: 0.5rem; padding: 1.2rem;
    z-index: 10002; font-family: sans-serif; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;
  const title = document.createElement("div");
  title.textContent = "相手ゲート侵攻ボーナス";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; color: #fbbf24;";
  const body = document.createElement("div");
  body.style.cssText = "font-size: 0.9rem; line-height: 1.7; margin-bottom: 1rem; white-space: pre-wrap;";
  body.textContent = text;
  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";
  okBtn.style.cssText = "padding: 0.4rem 1.4rem; background: #0891b2; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  okBtn.addEventListener("click", () => {
    backdrop.remove();
    modal.remove();
    onOk();
  });
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(okBtn);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

function shuffled(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function runStealHand(attacker, defender, onDone) {
  const defenderHand = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender
  );
  const count = Math.floor(defenderHand.length / 2);
  const tokenIds = shuffled(defenderHand).slice(0, count).map((t) => t.id);
  const countText = count > 0 ? `${count}枚を無作為に奪います。` : "枚数が半分未満のため、奪えるカードはありません。";
  showBonusStepModal(`${SEAT_LABELS[attacker]}はゲート侵攻成功！\n${SEAT_LABELS[defender]}の手札${countText}`, () => {
    gateInvasionStealHand(attacker, tokenIds);
    notifyChange();
    onDone();
  });
}

function runEternal(attacker, onDone) {
  const eternalPile = getState().piles.eternal;
  if (eternalPile.length === 0) {
    showBonusStepModal(`${SEAT_LABELS[attacker]}はエターナルカードを獲得するはずでしたが、盤面の外のエターナルカードはもう残っていません。`, onDone);
    return;
  }
  const cardId = eternalPile[eternalPile.length - 1];
  const def = getCardDefinition(cardId);
  showBonusStepModal(`${SEAT_LABELS[attacker]}はエターナルカード「${def.name}」を獲得！\n自分のロックエリアにロックします。`, () => {
    gateInvasionEternal(attacker, cardId);
    notifyChange();
    onDone();
  });
}

function runReturnHome(attacker, onDone) {
  showBonusStepModal(`${SEAT_LABELS[attacker]}は自分のゲートにあるカードをすべて回収し、ゲートに帰還します。`, () => {
    gateInvasionReturnHome(attacker);
    notifyChange();
    onDone();
  });
}

// 「ターン終了」ボタンから呼ぶ。侵攻条件を満たしていなければ即座にdone()を呼ぶ
// （＝通常通りすぐ次のプレイヤーへターンを渡してよい）。満たしていれば①→②→③の順で
// ポップアップ+自動処理を行い、すべて終わってから初めてdone()を呼ぶ。
export function runGateInvasionIfNeeded(attacker, done) {
  const defender = findInvadedDefender(attacker);
  if (!defender) {
    done();
    return;
  }
  runStealHand(attacker, defender, () => {
    runEternal(attacker, () => {
      runReturnHome(attacker, done);
    });
  });
}
