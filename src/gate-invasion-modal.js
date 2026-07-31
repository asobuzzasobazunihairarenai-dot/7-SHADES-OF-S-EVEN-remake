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
import { logAction } from "./action-log.js";
import { isFlightAnimationDisabled, isArrivalEffectDisabled } from "./motion-prefs.js";

// ユーザー要望「ゲート侵攻のエターナル獲得のド派手な演出がオンラインで出ない（テストモードでは
// 出る）」。ローカル版(gate-invasion.js)はrunEternalでeternalAnimHelper（3Dフリップ＋色バースト）
// を再生するが、オンラインはサーバー処理＋この受信モーダル経路のため演出が載っていなかった。
// main.jsの純演出関数(playEternalAcquisitionAnim)をここに注入し、エターナル獲得ステップで
// モーダルの代わりに再生する（他の演出helperと同じregister注入パターン）。
let eternalAnimHelper = null; // (attacker, cardId, cardDef, onDone) => void
export function registerGateInvasionModalEternalAnim(fn) {
  eternalAnimHelper = fn;
}

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
      // buildStepsは各クライアントで動く（getSelfSeatは自分の視点）。奪われた本人には、
      // 奪われた自分のカードを一覧表示する（online.jsが手札消滅前に解決したdefenderStolenCards、
      // ユーザー要望）。攻撃者本人はresolveIfSelfで解決、それ以外の閲覧者には非公開のまま。
      const self = getSelfSeat();
      const stolenCardsHtml =
        self === ev.defender && ev.defenderStolenCards
          ? buildCardsHtml(ev.defender, ev.defenderStolenCards.map((c) => ({ cardId: c.cardId, wasPublic: false })))
          : buildCardsHtml(ev.attacker, (ev.stolenTokenIds ?? []).map((id) => ({ cardId: resolveIfSelf(ev.attacker, id), wasPublic: false })));
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}はゲート侵攻成功！\n${getPlayerNameOrYou(ev.defender)}の手札${ev.stolenCount}枚を無作為に奪いました。`,
        cardsHtml: stolenCardsHtml,
      });
    } else {
      steps.push({ text: `${getPlayerNameOrYou(ev.attacker)}はゲート侵攻成功！\n${getPlayerNameOrYou(ev.defender)}の手札枚数が半分未満のため、奪えるカードはありません。` });
    }

    if (ev.eternalCardId) {
      const def = getCardDefinition(ev.eternalCardId);
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}はエターナルカード「${def.name}」を獲得！\n自分のロックエリアにロックします。`,
        cardsHtml: buildCardsHtml(ev.attacker, [{ cardId: ev.eternalCardId, wasPublic: true }]),
        // 演出が使える環境では、このステップをモーダルの代わりに派手な3Dフリップ演出で見せる。
        eternalAnim: { attacker: ev.attacker, cardId: ev.eternalCardId },
      });
      if ((ev.bumpedCards ?? []).length > 0) {
        steps.push({
          text: `ロックスロットにあったカードが弾き出され、${getPlayerNameOrYou(ev.attacker)}の手札に加わりました。`,
          cardsHtml: buildCardsHtml(ev.attacker, (ev.bumpedCards ?? []).map((b) => ({ cardId: b.cardId, wasPublic: true }))),
        });
      }
    } else {
      steps.push({ text: `${getPlayerNameOrYou(ev.attacker)}はエターナルカードを獲得するはずでしたが、盤面の外のエターナルカードはもう残っていません。` });
    }

    if ((ev.gateCards ?? []).length > 0) {
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}は自分のゲートにあるカードをすべて回収し、ゲートに帰還します。`,
        cardsHtml: buildCardsHtml(
          ev.attacker,
          (ev.gateCards ?? []).map((g) => ({
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

// ユーザー要望「スリカエ（いつでも使える手札効果）をゲート侵攻処理中に使おうとした
// 場合は予約扱いにし、使えるタイミングになったら確認モーダルを出す」への対応で、
// main.jsの「ターン告知の重なり防止」に続く2つ目の利用者が現れたため、単一の
// コールバックを上書きする方式から複数登録できるリスナー配列方式に変更した
// （state.jsのsubscribe()・tablet-2d-mode.jsのonFlatten2dModeChange()と同じ形）。
const queueDrainedListeners = [];
export function registerOnGateInvasionQueueDrained(fn) {
  queueDrainedListeners.push(fn);
  return () => {
    const i = queueDrainedListeners.indexOf(fn);
    if (i >= 0) queueDrainedListeners.splice(i, 1);
  };
}
function notifyQueueDrained() {
  for (const fn of queueDrainedListeners) fn();
}

// render()から毎回呼ばれる保険（ユーザー報告「オンラインのゲート侵攻演出が出ない」対策）。
// 表示中のはずのモーダル/背景が何らかの理由でDOMから外れていたら、同じ要素をそのまま貼り
// 直す。timer（currentTimer）は生きたままなので、貼り直せば残りステップの自動送りも継続する。
// remote-move-animator.jsのreapplyActiveHighlights等と同じ「render()の末尾で毎回貼り直す」方式。
export function reapplyGateInvasionModal() {
  if (modalEl && !document.body.contains(modalEl)) {
    logAction("diag-gate-invasion-reattach", {});
    if (backdropEl && !document.body.contains(backdropEl)) document.body.appendChild(backdropEl);
    document.body.appendChild(modalEl);
  }
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
  // エターナル獲得ステップは、演出（3Dフリップ＋色バースト）が使える環境では、静的な
  // モーダルの代わりにローカル版と同じ派手な演出を再生する（ユーザー要望）。演出は盤面の
  // エターナル山・ロックスロットのDOM位置を読むため、盤面が見えているオンライン対局中に
  // そのまま動く。演出完了(onDone)で次のステップへ。演出が使えない設定・helper未注入の
  // 時は従来通り下のモーダル表示にフォールバックする。
  if (step.eternalAnim && eternalAnimHelper && !isFlightAnimationDisabled() && !isArrivalEffectDisabled()) {
    logAction("diag-gate-invasion-eternal-anim", { attacker: step.eternalAnim.attacker, cardId: step.eternalAnim.cardId });
    const { attacker, cardId } = step.eternalAnim;
    let advanced = false;
    const goNext = () => {
      if (advanced) return;
      advanced = true;
      advance();
    };
    try {
      eternalAnimHelper(attacker, cardId, getCardDefinition(cardId), goNext);
    } catch (err) {
      console.error("gate-invasion-modal eternal anim failed", err);
      goNext();
    }
    return;
  }

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
    notifyQueueDrained();
  });

  modalEl.appendChild(createModalCloseX(() => {
    queue = [];
    closeCurrent();
    notifyQueueDrained();
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
  // 調査用: showStepが実際にモーダルをDOMへ追加できたか（ここまで来れば画面に出ているはず）。
  logAction("diag-gate-invasion-showstep", { text: String(step?.text ?? "").slice(0, 24), inDom: document.body.contains(modalEl) });

  currentTimer = setTimeout(() => {
    closeCurrent();
    advance();
  }, getStepDurationMs());
}

function advance() {
  if (queue.length === 0) {
    notifyQueueDrained();
    return;
  }
  const step = queue.shift();
  // ユーザー報告（続き86）「ゲート侵攻時の手札を選ぶやつとかの演出が表示されて
  // いない」の調査用。このモーダル自体には元々try/catchが無く、showStep内の
  // どこか（buildCardsHtmlが参照するgetCardDefinition/getCardImagePath等）で
  // 想定外の値（存在しないcardId等）に当たって例外が飛ぶと、そこで静かに処理が
  // 止まり、以後キューに積まれた分も含めて二度と表示されなくなる
  // （queue/modalElの状態は最後に成功した時点のまま残り得るため、
  // isGateInvasionQueueActive()はtrueのまま固まって見える）。診断ログを残し、
  // 例外発生時はこのステップを諦めて次へ進めるようにする（無限に固まったままに
  // ならないようにする保険）。
  try {
    showStep(step);
  } catch (err) {
    console.error("gate-invasion-modal showStep failed", err);
    logAction("diag-gate-invasion-modal-error", { message: String(err?.message ?? err), stepText: step?.text });
    closeCurrent();
    advance();
  }
}

// events: so7-apply-action.tsのstate_changed Broadcastペイロードに載っているgateInvasionEvents。
// 既に表示中/待機中のキューがあれば、その末尾に新しいステップを追加する（連続してゲート侵攻が
// 起きた場合でも、既存の表示を中断せず順番に見せる）。
export function enqueueGateInvasionSteps(events) {
  let newSteps;
  try {
    newSteps = buildSteps(events);
  } catch (err) {
    console.error("gate-invasion-modal buildSteps failed", err);
    logAction("diag-gate-invasion-modal-error", { message: String(err?.message ?? err), phase: "buildSteps" });
    return;
  }
  // 保険（ユーザー報告「オンラインのゲート侵攻演出が出ない」対策）: modalElが残っているのに
  // 実際にはDOMから外れている（何らかの理由で消えた・作り直された）場合、staleとみなして
  // リセットする。これが残ったままだと wasEmpty=false になり、以後ゲート侵攻演出が二度と
  // 出なくなる（isGateInvasionQueueActive()だけtrueで固まる）。
  if (modalEl && !document.body.contains(modalEl)) {
    logAction("diag-gate-invasion-stale-modal", {});
    closeCurrent();
  }
  const wasEmpty = queue.length === 0 && !modalEl;
  // 調査用（ユーザー報告「オンラインのゲート侵攻演出が出ない」）: enqueue時点でwasEmptyが
  // falseだと、既存のmodalEl/queueが残っているとみなしてadvance()を呼ばず、演出が
  // 出ないまま詰まる。wasEmpty・残キュー・modalElの有無を記録して原因を切り分ける。
  logAction("diag-gate-invasion-enqueue", { newSteps: newSteps.length, wasEmpty, queueLenBefore: queue.length, hasModalEl: !!modalEl });
  queue.push(...newSteps);
  if (wasEmpty) advance();
}
