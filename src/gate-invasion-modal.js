// オンライン対戦での「相手ゲート侵攻ボーナス」通知。サーバー（so7-apply-action.ts）が
// ターン終了時に自動で判定・適用済みのため、ローカル版のような「OKを押すまで進まない」
// 確認ポップアップではなく、既に起きたことを1件ずつ・画面中央のモーダルで、時間が来たら
// 自動的に次へ進む形で伝える（同時に何件も右下トーストが積み重なって読めなくなっていた
// 問題を解消するため）。見た目はローカル版gate-invasion.jsのshowBonusStepModalを踏襲する。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { showCardFace } from "./card-face-display.js";
import { getSelfSeat } from "./online.js";
import { isPickupVisible, getPlayerNameOrYou } from "./hand-announcer.js";
import { createModalCloseX, neutralModalSkin } from "./ui-helpers.js";
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
// 手札を奪う飛翔演出（ユーザー要望「スリカエの時のような奪う演出をオンラインでも」）。
let stealAnimHelper = null; // (attacker, defender, count, onDone) => void
export function registerGateInvasionModalStealAnim(fn) {
  stealAnimHelper = fn;
}
// 獲得予定エターナルの描画を「キューに積んだ時点」で先に隠すための注入
// （ユーザー報告「演出の前にエターナルがロックされて見えてしまい、演出直前に急に消える」）。
// オンラインはサーバーが先にロック状態を確定するため、演出が回ってくるまでの数秒間、獲得済み
// エターナルがロックエリアに見えてしまう。main.js側のrender抑制(suppressedEternalLockRender)を
// enqueue時点で立て、演出（着地）で「今ロックされた」ように見せる。解除は演出末尾と、保険として
// キュー枯渇時(registerOnGateInvasionQueueDrainedにmain.jsが登録)で行う。
let eternalPreHideHelper = null; // (attacker, cardId) => void
export function registerGateInvasionModalEternalPreHide(fn) {
  eternalPreHideHelper = fn;
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
      // カード画像は showStep 後に showCardFace で描画（テキスト/画像モード対応）。ここでは
      // data-cardface-id のプレースホルダーだけ置く。
      return `
        <div class="gate-invasion-modal-card">
          <div class="gate-invasion-modal-card-img" data-cardface-id="${p.cardId}"></div>
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
      // ①まず「ゲート侵攻成功！」の告知モーダルを出す（ユーザー報告「奪う演出が
      // 『ゲート侵攻成功』モーダルより先に出てしまう」への対応で、告知→演出→結果の順に
      // 並べ替えた。以前は告知＋一覧＋奪う演出を1ステップに詰め、演出を先に流していた）。
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}はゲート侵攻成功！\n${getPlayerNameOrYou(ev.defender)}の手札${ev.stolenCount}枚を無作為に奪います。`,
      });
      // ②告知のあとに奪う飛翔演出（スリカエ風の儀式）を再生し、完了してから奪ったカードの
      // 一覧モーダルを見せる（showStepがstealAnimを先に再生→同じステップを描き直す）。
      steps.push({
        text: `${getPlayerNameOrYou(ev.attacker)}は${getPlayerNameOrYou(ev.defender)}の手札${ev.stolenCount}枚を奪いました。`,
        cardsHtml: stolenCardsHtml,
        stealAnim: {
          attacker: ev.attacker,
          defender: ev.defender,
          count: ev.stolenCount,
          stolenTokenIds: ev.stolenTokenIds ?? [],
        },
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

// 残っているゲート侵攻モーダル（キュー＋表示中の1枚）を強制的に片付ける。勝利等でゲート侵攻の
// 途中で対局が終了/リセットされ、モーダルが盤面に取り残される事故(#107)の後始末に使う。
export function forceCloseGateInvasionModal() {
  queue = [];
  closeCurrent();
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
    // ユーザー報告「演出の前にすでにエターナルカードがロックされている（見えてしまう）」。
    // オンラインはサーバーが先に状態を適用（＝カードをロックスロットへ配置）してから演出が
    // 走るため、演出開始時点で獲得済みのカードがロック枠に見えてしまう（ローカル版は演出後に
    // ロックするので起きない）。演出（山札→中央でフリップ→ロックへ飛ぶ）の間だけ、実際に
    // ロックされたそのカード要素を隠し、演出完了時に表示して「今ロックされた」ように見せる。
    const lockedTok = getState().tokens.find(
      (t) => t.kind === "card" && t.cardId === cardId && t.location.zone === "lock"
    );
    const hideLockedCard = () => {
      const el = lockedTok ? document.querySelector(`[data-token-id="${lockedTok.id}"]`) : null;
      if (el) el.style.visibility = "hidden";
      return el;
    };
    let lockedEl = hideLockedCard();
    // 演出中にrender()で盤面が作り直されても隠し直す保険（要素が差し替わるため参照を取り直す）。
    const rehideTimer = setInterval(() => {
      if (lockedTok) lockedEl = hideLockedCard();
    }, 200);
    let advanced = false;
    const goNext = () => {
      if (advanced) return;
      advanced = true;
      clearInterval(rehideTimer);
      const el = lockedTok ? document.querySelector(`[data-token-id="${lockedTok.id}"]`) : null;
      if (el) el.style.visibility = "";
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

  // 手札を奪う飛翔演出（ユーザー要望）。奪取ステップでは、まず「奪う」飛翔演出を再生し、
  // 完了してから同じステップを描画し直して奪ったカードの一覧モーダルを見せる
  // （step._stealAnimDoneで2回目は演出を飛ばす）。演出が使えない環境ではそのまま一覧モーダルへ。
  if (
    step.stealAnim &&
    stealAnimHelper &&
    !step._stealAnimDone &&
    (step.stealAnim.count ?? 0) > 0 &&
    !isFlightAnimationDisabled() &&
    !isArrivalEffectDisabled()
  ) {
    step._stealAnimDone = true;
    logAction("diag-gate-invasion-steal-anim", { attacker: step.stealAnim.attacker, defender: step.stealAnim.defender, count: step.stealAnim.count });
    try {
      // stealAnimHelper（main.jsのplayGateInvasionStealRitual）にステップの奪取情報を丸ごと渡す
      // （attacker/defender/count/stolenTokenIds）。完了後に同じステップを描き直して一覧モーダルへ。
      stealAnimHelper(step.stealAnim, () => showStep(step));
    } catch (err) {
      console.error("gate-invasion-modal steal anim failed", err);
      showStep(step);
    }
    return;
  }

  backdropEl = document.createElement("div");
  backdropEl.style.cssText = "position: fixed; inset: 0; z-index: 10001; background: rgba(0, 0, 0, 0.55);";

  modalEl = document.createElement("div");
  const size = getComputedStyle(document.documentElement).getPropertyValue("--gate-invasion-modal-size").trim() || "28rem";
  const skin = neutralModalSkin();
  modalEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(${size}, 92vw); border-radius: 0.5rem; padding: 1.2rem;
    z-index: 10002; font-family: sans-serif; ${skin.panel}
  `;

  const title = document.createElement("div");
  title.textContent = "相手ゲート侵攻ボーナス";
  title.style.cssText = `font-weight: bold; margin-bottom: 0.6rem; color: ${skin.gold};`;

  const body = document.createElement("div");
  body.style.cssText = "font-size: 0.9rem; line-height: 1.7; margin-bottom: 0.8rem; white-space: pre-wrap;";
  body.textContent = step.text;

  const skipBtn = document.createElement("button");
  skipBtn.textContent = "スキップ";
  skipBtn.style.cssText =
    `padding: 0.4rem 1.4rem; ${skin.btn} border: none; border-radius: 0.25rem; cursor: pointer; margin-top: 0.4rem;`;
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
    // プレースホルダーにカード面（テキスト合成/画像）を描画する。
    cardsWrap.querySelectorAll(".gate-invasion-modal-card-img[data-cardface-id]").forEach((el) => {
      const id = el.dataset.cardfaceId;
      showCardFace(el, id, getCardImagePath(id));
    });
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
  // 新規シーケンス開始時のみ、獲得予定エターナルを先に隠す（issue: 演出前の見え／急な消え）。
  // 既存キューへの追加時は、進行中の演出が使う単一の抑制状態を上書きしないよう触らない。
  if (wasEmpty && eternalPreHideHelper) {
    const firstEternal = events.find((ev) => ev.eternalCardId);
    if (firstEternal) {
      try {
        eternalPreHideHelper(firstEternal.attacker, firstEternal.eternalCardId);
      } catch (err) {
        console.error("gate-invasion-modal eternal pre-hide failed", err);
      }
    }
  }
  if (wasEmpty) advance();
}
