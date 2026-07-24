// オンライン対戦での「相手ゲート侵攻ボーナス」通知。サーバー（so7-apply-action.ts）が
// ターン終了時に自動で判定・適用済みのため、ローカル版のような「OKを押すまで進まない」
// 確認ポップアップではなく、既に起きたことを1件ずつ・画面中央のモーダルで、時間が来たら
// 自動的に次へ進む形で伝える（同時に何件も右下トーストが積み重なって読めなくなっていた
// 問題を解消するため）。見た目はローカル版gate-invasion.jsのshowBonusStepModalを踏襲する。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { getSelfSeat } from "./online.js";
import { isPickupVisible, getPlayerNameOrYou } from "./hand-announcer.js";
import { createModalCloseX } from "./ui-helpers.js";
import { getState } from "./state.js";

// 攻撃側本人の画面だけは、fetchAndHydrate()後の自分の手札として実際のcardIdが見えている
// （RLSで自分の手札はマスクされないため）。それ以外の閲覧者には解決しない
// （isPickupVisibleがwasPublic:falseかつ本人以外を弾くため、渡しても表示には使われないが、
// 念のため自分以外の視点では常にnullのままにする）。
function resolveIfSelf(attacker, tokenId) {
  if (attacker !== getSelfSeat()) return null;
  return getState().tokens.find((t) => t.id === tokenId)?.cardId ?? null;
}

function getStepDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--gate-invasion-modal-step-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 3.5 : seconds) * 1000;
}

// pickups: [{cardId, wasPublic}, ...]。公開/非公開の出し分けはhand-announcer.jsの
// isPickupVisibleと同じ基準（announceHandPickupsの右下トーストと矛盾しないように）。
function buildCardsHtml(player, pickups) {
  const visible = pickups.filter((p) => isPickupVisible(p, player));
  const hiddenCount = pickups.length - visible.length;
  const cardsHtml = visible
    .map((p) => {
      const def = getCardDefinition(p.cardId);
      return `
        <div class="gate-invasion-modal-card">
          <img src="${getCardImagePath(p.cardId)}" alt="${def.name}" />
          <div class="gate-invasion-modal-card-name">${def.name}</div>
        </div>
      `;
    })
    .join("");
  const hiddenNote = hiddenCount > 0 ? `<div class="gate-invasion-modal-hidden-note">＋非公開のカード${hiddenCount}枚</div>` : "";
  return `<div class="gate-invasion-modal-cards">${cardsHtml}</div>${hiddenNote}`;
}

// events（gateInvasionEventsの配列）を、ローカル版と同じ粒度のステップ列に展開する。
function buildSteps(events) {
  const steps = [];
  for (const ev of events) {
    steps.push({ text: `${getPlayerNameOrYou(ev.attacker)}が${getPlayerNameOrYou(ev.defender)}のゲートに侵攻！` });

    if (ev.stolenCount > 0) {
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}はゲート侵攻成功！\n${getPlayerNameOrYou(ev.defender)}の手札${ev.stolenCount}枚を無作為に奪いました。`,
        cardsHtml: buildCardsHtml(ev.attacker, ev.stolenTokenIds.map((id) => ({ cardId: resolveIfSelf(ev.attacker, id), wasPublic: false }))),
      });
    } else {
      steps.push({ text: `${getPlayerNameOrYou(ev.attacker)}はゲート侵攻成功！\n${getPlayerNameOrYou(ev.defender)}の手札枚数が半分未満のため、奪えるカードはありません。` });
    }

    if (ev.eternalCardId) {
      const def = getCardDefinition(ev.eternalCardId);
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}はエターナルカード「${def.name}」を獲得！\n自分のロックエリアにロックします。`,
        cardsHtml: buildCardsHtml(ev.attacker, [{ cardId: ev.eternalCardId, wasPublic: true }]),
      });
      if (ev.bumpedCards.length > 0) {
        steps.push({
          text: `ロックスロットにあったカードが弾き出され、${getPlayerNameOrYou(ev.attacker)}の手札に加わりました。`,
          cardsHtml: buildCardsHtml(ev.attacker, ev.bumpedCards.map((b) => ({ cardId: b.cardId, wasPublic: true }))),
        });
      }
    } else {
      steps.push({ text: `${getPlayerNameOrYou(ev.attacker)}はエターナルカードを獲得するはずでしたが、盤面の外のエターナルカードはもう残っていません。` });
    }

    if (ev.gateCards.length > 0) {
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}は自分のゲートにあるカードをすべて回収し、ゲートに帰還します。`,
        cardsHtml: buildCardsHtml(
          ev.attacker,
          ev.gateCards.map((g) => ({
            // 裏向きだったカード(wasPublic:false)はサーバーがcardIdを送ってこない
            // （非攻撃者に見せてはいけないため）。攻撃側自身の画面だけは、移動後の
            // 自分の手札として実際に見えているので、resolveIfSelfで解決する。
            cardId: g.wasPublic ? g.cardId : resolveIfSelf(ev.attacker, g.tokenId),
            wasPublic: g.wasPublic,
          }))
        ),
      });
    } else {
      steps.push({ text: `${getPlayerNameOrYou(ev.attacker)}は自分のゲートに帰還します。` });
    }
  }
  return steps;
}

let queue = [];
let currentTimer = null;
let modalEl = null;
let backdropEl = null;

// ユーザー報告「ターン告知がゲート侵攻モーダルと被る」への対応。main.jsがターン告知を
// 出す前に「今このモーダル列は表示中/待機中か」を確認できるようにする
// （online.jsのisGateInvasionPendingと合わせて使う——こちらはキューが実際に積まれてから
// 空になるまでの間をカバーし、そちらは積まれる直前の一瞬をカバーする）。
export function isGateInvasionQueueActive() {
  return queue.length > 0 || !!modalEl;
}

let onQueueDrainedFn = null;
export function registerOnGateInvasionQueueDrained(fn) {
  onQueueDrainedFn = fn;
}

function closeCurrent() {
  if (currentTimer) {
    clearTimeout(currentTimer);
    currentTimer = null;
  }
  if (modalEl) modalEl.remove();
  if (backdropEl) backdropEl.remove();
  modalEl = null;
  backdropEl = null;
}

function showStep(step) {
  backdropEl = document.createElement("div");
  backdropEl.style.cssText = "position: fixed; inset: 0; z-index: 10001; background: rgba(0, 0, 0, 0.55);";

  modalEl = document.createElement("div");
  const size = getComputedStyle(document.documentElement).getPropertyValue("--gate-invasion-modal-size").trim() || "28rem";
  modalEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(${size}, 92vw); background: rgba(15, 23, 32, 0.98);
    border: 1px solid rgba(251, 191, 36, 0.5); border-radius: 0.5rem; padding: 1.2rem;
    z-index: 10002; font-family: sans-serif; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;

  const title = document.createElement("div");
  title.textContent = "相手ゲート侵攻ボーナス";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; color: #fbbf24;";

  const body = document.createElement("div");
  body.style.cssText = "font-size: 0.9rem; line-height: 1.7; margin-bottom: 0.8rem; white-space: pre-wrap;";
  body.textContent = step.text;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "スキップ";
  skipBtn.style.cssText =
    "padding: 0.4rem 1.4rem; background: rgba(148, 163, 184, 0.25); color: #e2e8f0; border: none; border-radius: 0.25rem; cursor: pointer; margin-top: 0.4rem;";
  skipBtn.addEventListener("click", () => {
    queue = [];
    closeCurrent();
    onQueueDrainedFn?.();
  });

  modalEl.appendChild(createModalCloseX(() => {
    queue = [];
    closeCurrent();
    onQueueDrainedFn?.();
  }));
  modalEl.appendChild(title);
  modalEl.appendChild(body);
  if (step.cardsHtml) {
    const cardsWrap = document.createElement("div");
    cardsWrap.innerHTML = step.cardsHtml;
    modalEl.appendChild(cardsWrap);
  }
  modalEl.appendChild(skipBtn);

  document.body.appendChild(backdropEl);
  document.body.appendChild(modalEl);

  currentTimer = setTimeout(() => {
    closeCurrent();
    advance();
  }, getStepDurationMs());
}

function advance() {
  if (queue.length === 0) {
    onQueueDrainedFn?.();
    return;
  }
  const step = queue.shift();
  showStep(step);
}

// events: so7-apply-action.tsのstate_changed Broadcastペイロードに載っているgateInvasionEvents。
// 既に表示中/待機中のキューがあれば、その末尾に新しいステップを追加する（連続してゲート侵攻が
// 起きた場合でも、既存の表示を中断せず順番に見せる）。
export function enqueueGateInvasionSteps(events) {
  const newSteps = buildSteps(events);
  const wasEmpty = queue.length === 0 && !modalEl;
  queue.push(...newSteps);
  if (wasEmpty) advance();
}
