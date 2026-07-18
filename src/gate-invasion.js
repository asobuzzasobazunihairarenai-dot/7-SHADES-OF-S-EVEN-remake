// 「相手ゲート侵攻ボーナス」(docs/rulebook.md「Gate Invasion Bonus」)の自動処理。
// 「ターン終了」ボタンが押された瞬間、参加中のいずれかのプレイヤーの駒が別プレイヤーの
// ゲートに乗っていれば発生条件を満たす（自分のゲート・空席のゲートは対象外）。
// 判定は手番プレイヤーに限らない——「あなたのターン、相手のターンどちらでも発生する」
// というルール通り、何らかの効果で自分のターンでなくても相手ゲートに駒がいることは
// あり得るため、参加している全プレイヤーの駒を毎回チェックする。
// 該当プレイヤーごとに、①手札を半分（端数切り捨て）奪う → ②エターナルカードを1枚獲得し
// ロック → ③自分のゲートのカードを回収してゲートに帰還、の3段階を、それぞれ内容を予告する
// ポップアップ→OKで実行、という形で順番に自動処理する。該当者がいない時は何もせずdone()を呼ぶ。

import { getState, gateInvasionStealHand, gateInvasionEternal, gateInvasionReturnHome } from "./state.js";
import { GATE_POSITIONS, SIDE_TO_SEAT, SEAT_TO_SIDE, SEAT_ORDER, COLORS, SEAT_LABELS } from "./board-layout.js";
import { getCardDefinition } from "./cards-data.js";
import { announceHandPickups } from "./hand-announcer.js";

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

function findAttackerPiece(attacker) {
  return getState().tokens.find((t) => t.kind === "piece" && t.player === attacker);
}

// attackerの駒が、参加中の別プレイヤーのゲートに乗っているか判定する。
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

// ①手札を半分（端数切り捨て）無作為に奪う。奪うカードはすべて「非公開情報」
// （相手の手札は誰にも見えていなかった情報のため）として扱う。
function runStealHand(attacker, defender, onDone) {
  const defenderHand = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender
  );
  const count = Math.floor(defenderHand.length / 2);
  const stolenTokens = shuffled(defenderHand).slice(0, count);
  const countText = count > 0 ? `${count}枚を無作為に奪います。` : "枚数が半分未満のため、奪えるカードはありません。";
  showBonusStepModal(`${SEAT_LABELS[attacker]}はゲート侵攻成功！\n${SEAT_LABELS[defender]}の手札${countText}`, () => {
    gateInvasionStealHand(attacker, stolenTokens.map((t) => t.id));
    notifyChange();
    announceHandPickups(attacker, stolenTokens.map((t) => ({ cardId: t.cardId, wasPublic: false })));
    onDone();
  });
}

// ②エターナルカードを1枚無作為に獲得し、自分のロックエリアの対応する色にロックする。
// そのスロットに既に何か（ファーストカードを除く）あれば、先に手札へ加える
// （ロック上のカードは常に表向き＝公開情報として扱う）。
function runEternal(attacker, onDone) {
  const eternalPile = getState().piles.eternal;
  if (eternalPile.length === 0) {
    showBonusStepModal(`${SEAT_LABELS[attacker]}はエターナルカードを獲得するはずでしたが、盤面の外のエターナルカードはもう残っていません。`, onDone);
    return;
  }
  const cardId = eternalPile[eternalPile.length - 1];
  const def = getCardDefinition(cardId);
  const side = SEAT_TO_SIDE[attacker];
  const colorIndex = COLORS.indexOf(def.color);
  const bumpedTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === colorIndex && !t.cardId.startsWith("first-")
  );
  showBonusStepModal(`${SEAT_LABELS[attacker]}はエターナルカード「${def.name}」を獲得！\n自分のロックエリアにロックします。`, () => {
    gateInvasionEternal(attacker, cardId);
    notifyChange();
    announceHandPickups(attacker, bumpedTokens.map((t) => ({ cardId: t.cardId, wasPublic: true })));
    onDone();
  });
}

// ③④自分のゲートにあるカードを全て手札に加え、ゲートに帰還する。
// ゲート上のカードは表向き/裏向きどちらもあり得るため、各カード自身のfaceUpに従う。
function runReturnHome(attacker, onDone) {
  const side = SEAT_TO_SIDE[attacker];
  const homeGate = GATE_POSITIONS[side];
  const gateTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === homeGate.row && t.location.col === homeGate.col
  );
  showBonusStepModal(`${SEAT_LABELS[attacker]}は自分のゲートにあるカードをすべて回収し、ゲートに帰還します。`, () => {
    gateInvasionReturnHome(attacker);
    notifyChange();
    announceHandPickups(attacker, gateTokens.map((t) => ({ cardId: t.cardId, wasPublic: t.faceUp })));
    onDone();
  });
}

function runBonusFor(attacker, defender, done) {
  runStealHand(attacker, defender, () => {
    runEternal(attacker, () => {
      runReturnHome(attacker, done);
    });
  });
}

// 「ターン終了」ボタンから呼ぶ。参加中の全プレイヤー（時計回り順）を対象に、相手ゲートに
// 駒が乗っているかどうかを判定する。該当者がいなければ即座にdone()を呼ぶ（＝通常通りすぐ
// 次のプレイヤーへターンを渡してよい）。複数人が同時に該当する場合は時計回り順に1人ずつ
// 処理し、全員分終わってから初めてdone()を呼ぶ。
export function runGateInvasionsIfNeeded(done) {
  const order = SEAT_ORDER.filter((p) => getState().activePlayers.includes(p));
  function processNext(index) {
    if (index >= order.length) {
      done();
      return;
    }
    const attacker = order[index];
    const defender = findInvadedDefender(attacker);
    if (!defender) {
      processNext(index + 1);
      return;
    }
    runBonusFor(attacker, defender, () => processNext(index + 1));
  }
  processNext(0);
}
