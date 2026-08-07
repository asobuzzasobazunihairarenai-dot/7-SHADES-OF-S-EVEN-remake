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
import { GATE_POSITIONS, SIDE_TO_SEAT, SEAT_TO_SIDE, SEAT_ORDER, COLORS } from "./board-layout.js";
import { getPlayerName } from "./player-identity.js";
import { getCardDefinition } from "./cards-data.js";
import { announceHandPickups } from "./hand-announcer.js";
import { isFlightAnimationDisabled, isArrivalEffectDisabled } from "./motion-prefs.js";
import { logAction } from "./action-log.js";

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

function findAttackerPiece(attacker) {
  return getState().tokens.find((t) => t.kind === "piece" && t.player === attacker);
}

// attackerの駒が、参加中の別プレイヤーのゲートに乗っているか判定する。
// 乗っていればそのプレイヤー（侵攻された側）の座席を返し、そうでなければnull。
// exportして、オンラインでターン終了前に「自分が今侵攻しているか」を判定し、奪う札を
// 事前に選ばせる（main.jsのendTurn、ゲート侵攻の自分で選ぶ機能）のに使う。
export function findInvadedDefender(attacker) {
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

// ユーザー要望「自動処理モードでないときに、ゲート侵攻成功条件を満たした状態で
// ターン終了ボタンを押したら『ゲート侵攻処理を自動で行いますか？』的な確認モーダルを
// 出してほしい」。main.js側が、実際にrunGateInvasionsIfNeededを呼ぶ前に「そもそも
// 該当者がいるか」だけを判定するための軽量チェック（findInvadedDefenderの判定を
// 全プレイヤー分繰り返すだけで、実際の処理は一切行わない）。
export function hasAnyGateInvasionCandidate() {
  return SEAT_ORDER.filter((p) => getState().activePlayers.includes(p)).some((attacker) => findInvadedDefender(attacker) !== null);
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

// ユーザー要望「ゲート侵攻成功時、相手の手札を半分奪うときも相手の手札から実際に
// 奪うステップを入れよう！（スリカエとかみたいに）」への対応。以前はshuffle+slice
// で無作為抽選した結果をそのままモーダルで告知するだけだったが、スリカエ・接触と
// 同じ「裏向きの手札から儀式的に選ぶ」演出を挟む（main.jsのrequestOpponentHand
// RitualPickをcount回連続で呼ぶ）。実際にどれが選ばれるかは表示順のシャッフルで
// 保証されるため、無作為性はこれまで通り保たれる。main.jsのDOM操作に依存する
// ため、他の演出（registerEternalAnimHelpers等）と同じ「register helper」注入
// パターンで main.js から渡してもらう。
let stealHandRitualHelper = null; // async (defender, count) => Array<token>
export function registerGateInvasionStealHelper(fn) {
  stealHandRitualHelper = fn;
}

// ①手札を半分（端数切り捨て）無作為に奪う。奪うカードはすべて「非公開情報」
// （相手の手札は誰にも見えていなかった情報のため）として扱う。
function runStealHand(attacker, defender, onDone) {
  const defenderHand = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender
  );
  const count = Math.floor(defenderHand.length / 2);
  // ユーザー報告「オンライン対戦でゲート侵攻の演出（儀式的な手札選び）が表示されない」の
  // 調査用（続き59）。演出が出ない場合に「そもそもここに来ていないのか」「helperが
  // 未登録なのか」「count=0で不発扱いになっているのか」を後から区別できるよう記録する。
  logAction("gate-invasion", {
    step: "steal-hand",
    attacker,
    defender,
    defenderHandCount: defenderHand.length,
    count,
    hasRitualHelper: !!stealHandRitualHelper,
  });
  if (count === 0) {
    showBonusStepModal(`${getPlayerName(attacker)}はゲート侵攻成功！\n${getPlayerName(defender)}の手札は枚数が半分未満のため、奪えるカードはありません。`, onDone);
    return;
  }
  showBonusStepModal(`${getPlayerName(attacker)}はゲート侵攻成功！\n${getPlayerName(defender)}の手札${count}枚を無作為に奪います。`, async () => {
    // ユーザー要望2026-08-07「複数枚奪う時、1枚ごとに実際に自分の手札へ描画。今はまとめて最後」。
    // 儀式ヘルパー（1枚ずつ選んで中央に見せる）経由なら、選ぶたびにその1枚を手札へ移して再描画する。
    const stolenTokens = stealHandRitualHelper
      ? await stealHandRitualHelper(defender, count, (t) => {
          gateInvasionStealHand(attacker, [t.id]);
          notifyChange();
        })
      : shuffled(defenderHand).slice(0, count);
    // ヘルパーが無いフォールバック（無作為・儀式なし）の時だけ、ここでまとめて移す。
    if (!stealHandRitualHelper) gateInvasionStealHand(attacker, stolenTokens.map((t) => t.id));
    notifyChange();
    announceHandPickups(attacker, stolenTokens.map((t) => ({ cardId: t.cardId, wasPublic: false })));
    onDone();
  });
}

// ユーザー要望「ゲート侵攻によりエターナルカードを手に入れるときの演出を取り入れたい」
// への対応（採用案「3Dフリップ＋色バースト」）。実際の見た目の演出自体は main.js が
// 握っている（board-layout/DOM座標・spawnArrivalBurst/flyGhost等、盤面描画に依存する
// 部品が必要なため、setup-animation.js等と同じ「main.jsから注入してもらう」パターン）。
// 呼び出し時点ではまだ状態(state)を一切変えていない演出専用の関数で、
// (attacker, cardId, cardDef, onAnimDone) を受け取り、演出が終わったらonAnimDone()を呼ぶ。
let eternalAnimHelper = null; // (attacker, cardId, cardDef, onAnimDone) => void
export function registerEternalAnimHelpers(fn) {
  eternalAnimHelper = fn;
}

// ②エターナルカードを1枚無作為に獲得し、自分のロックエリアの対応する色にロックする。
// そのスロットに既に何か（ファーストカードを除く）あれば、先に手札へ加える
// （ロック上のカードは常に表向き＝公開情報として扱う）。
function runEternal(attacker, onDone) {
  const eternalPile = getState().piles.eternal;
  const willUseAnim = !!eternalAnimHelper && !isFlightAnimationDisabled() && !isArrivalEffectDisabled();
  // ユーザー報告「オンライン対戦でゲート侵攻の演出（3Dフリップ＋色バースト）が
  // 表示されない」の調査用（続き59）。演出条件（helper登録・アニメーション設定）を
  // 記録し、後から「そもそも条件を満たしていないのか」を区別できるようにする。
  logAction("gate-invasion", {
    step: "eternal",
    attacker,
    eternalPileEmpty: eternalPile.length === 0,
    hasAnimHelper: !!eternalAnimHelper,
    flightDisabled: isFlightAnimationDisabled(),
    arrivalEffectDisabled: isArrivalEffectDisabled(),
    willUseAnim,
  });
  if (eternalPile.length === 0) {
    showBonusStepModal(`${getPlayerName(attacker)}はエターナルカードを獲得するはずでしたが、盤面の外のエターナルカードはもう残っていません。`, onDone);
    return;
  }
  const cardId = eternalPile[eternalPile.length - 1];
  const def = getCardDefinition(cardId);
  const side = SEAT_TO_SIDE[attacker];
  const colorIndex = COLORS.indexOf(def.color);
  const bumpedTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === colorIndex && !t.cardId.startsWith("first-")
  );
  function applyAndFinish() {
    gateInvasionEternal(attacker, cardId);
    notifyChange();
    announceHandPickups(attacker, bumpedTokens.map((t) => ({ cardId: t.cardId, wasPublic: true })));
    onDone();
  }
  // 「移動アニメーション」「到達・ロック演出」のどちらかが無効化されている間は、
  // 演出を飛ばして従来通りのOKモーダルだけにする（他の演出と同じ配慮）。
  if (willUseAnim) {
    eternalAnimHelper(attacker, cardId, def, applyAndFinish);
  } else {
    showBonusStepModal(`${getPlayerName(attacker)}はエターナルカード「${def.name}」を獲得！\n自分のロックエリアにロックします。`, applyAndFinish);
  }
}

// ③④自分のゲートにあるカードを全て手札に加え、ゲートに帰還する。
// ゲート上のカードは表向き/裏向きどちらもあり得るため、各カード自身のfaceUpに従う。
function runReturnHome(attacker, onDone) {
  const side = SEAT_TO_SIDE[attacker];
  const homeGate = GATE_POSITIONS[side];
  const gateTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === homeGate.row && t.location.col === homeGate.col
  );
  showBonusStepModal(`${getPlayerName(attacker)}は自分のゲートにあるカードをすべて回収し、ゲートに帰還します。`, () => {
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
  // ユーザー報告「オンライン対戦でゲート侵攻の演出が表示されない」の調査用（続き59）。
  // この関数自体がどのクライアントで・誰を対象に呼ばれたか（そもそも該当者を検知した
  // かどうか）を記録し、「演出が表示されない」原因が①検知自体がされていない
  // ②検知はされているが演出条件を満たしていない、のどちらかを後から区別できるようにする。
  logAction("gate-invasion", { step: "check", order, candidates: order.map((p) => ({ attacker: p, defender: findInvadedDefender(p) })) });
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
