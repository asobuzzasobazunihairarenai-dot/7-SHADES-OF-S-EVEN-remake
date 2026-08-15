// 手札効果の自動処理まわりのUI部品2つ。
// ①showHandEffectUseModal: 「このカードを使用します」の告知モーダル（ユーザー要望
//   「手札効果を使用したら、このカードが使用されるよ！って知らしめるモーダルをしっかりと
//   出したい」への対応、続き42で「到達拡大モーダルの位置に表示・同じく消えないように・
//   全員に見えるように」という要望に合わせて位置・消え方をcard-arrival.jsの
//   showCardArrivalModalと完全に揃えた——ただし独立したDOM/タイマーを持つ別コンポーネント
//   のままにしてある（到達モーダルと同時に出ても片方がもう片方を意図せず消してしまわない
//   ように）。全員に見せる部分（オンライン中の配信）はmain.js側の責務
//   （broadcastHandEffectUse/onHandEffectUseEvents）。
// ②showHandEffectOptionPicker: 選択肢が2つ以上ある手札効果（なないろの欠片等）で、
//   どれを使うか選ばせるモーダル（ユーザー要望「効果選択モーダルを出してください。
//   使用できない方はグレー表示。」）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { isCardArrivalModalPersistent } from "./admin.js";

function getUseModalDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--card-arrival-modal-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 3 : seconds) * 1000;
}

let currentUseModal = null;
let currentUseModalTimer = null;

export function showHandEffectUseModal(cardId, optionLabel) {
  if (currentUseModal) {
    clearTimeout(currentUseModalTimer);
    currentUseModal.remove();
    currentUseModal = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "hand-effect-use-modal";

  function dismiss() {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
      if (currentUseModal === modal) currentUseModal = null;
    }, 300);
  }

  const label = document.createElement("div");
  label.className = "hand-effect-use-modal-label";
  label.textContent = "使用";
  modal.appendChild(label);

  const img = document.createElement("img");
  img.src = getCardImagePath(cardId);
  img.alt = def?.name ?? cardId;
  modal.appendChild(img);

  const nameEl = document.createElement("div");
  nameEl.className = "hand-effect-use-modal-name";
  nameEl.textContent = optionLabel ? `${def?.name ?? cardId}（${optionLabel}）` : (def?.name ?? cardId);
  modal.appendChild(nameEl);

  const persistent = isCardArrivalModalPersistent();
  if (!persistent) {
    // card-arrival.jsのpinBtnと同じ「消えないようにする」ボタン（デフォルトの
    // 「消えない」設定の間は最初から消えないため、このボタン自体が不要）。
    const pinBtn = document.createElement("button");
    pinBtn.className = "card-arrival-modal-pin";
    pinBtn.textContent = "📌 消えないようにする";
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      clearTimeout(currentUseModalTimer);
      pinBtn.remove();
    });
    modal.appendChild(pinBtn);
  }

  modal.appendChild(createModalCloseX(dismiss));
  modal.addEventListener("click", dismiss);

  document.body.appendChild(modal);
  currentUseModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  if (!persistent) {
    currentUseModalTimer = setTimeout(dismiss, getUseModalDurationMs());
  }
}

// ユーザー要望「ターンを終了したら、出っ放しの到達拡大モーダルがあれば全員閉じる
// ようにしてください」と同じ理由で、この使用モーダルも即座に閉じられるようにする
// （main.jsのturnPlayer変化検知から呼ばれる、hideCardArrivalModalImmediatelyと対）。
export function hideHandEffectUseModalImmediately() {
  if (!currentUseModal) return;
  clearTimeout(currentUseModalTimer);
  currentUseModal.remove();
  currentUseModal = null;
}

let currentReasonModal = null;
let currentReasonModalTimer = null;
// 直前のモーダルの dismiss（Promise解決＋document capture click リスナー除去）への参照。
// 別の効果理由モーダルが割り込んで来た時、古いモーダルをDOMから消すだけでなく、その
// await を必ず解決しリスナーも外すために使う（下記の「Promiseリーク」修正、不具合#1関連）。
let currentReasonModalDismiss = null;
// main.jsのannounceEffectReasonForEffect/announceEffectFizzleForEffectが、次の
// モーダル（色宣言等）を出す前にこのモーダル自身の表示・フェードアウトが完全に終わる
// のを待つ時に使う（ユーザー報告「試練の儀式のおめでとうモーダルが出てから次の色宣言
// モーダルまでが早すぎて読めない」——呼び出し元の待ち時間がこのモーダル自身の表示
// 時間より短く、次のモーダルが重なって出てしまっていたのが原因）。dismiss()のフェード
// アウト分(300ms)も含めてexportする。
export const REASON_MODAL_DURATION_MS = 2600;
export const REASON_MODAL_TOTAL_MS = REASON_MODAL_DURATION_MS + 300;

// ユーザー要望「カウンターロックの到達効果について『あなたは１番少なくロックしている
// ので１枚ドローします』みたいなモーダルを出してからドローしてください。ほかの効果も
// プレイヤーが何が起きたのかわかるようになるべくモーダルで教えてあげてください」への
// 対応。showHandEffectUseModalと同じ「使い捨てDOM要素、数秒で自動的に消える」
// パターンだが、こちらは「このカードを使う」ではなく「なぜこの効果が発動したか」を
// 説明する自由文を表示する。対象を選ぶ・マスを選ぶ等それ自体で結果が見て分かる効果には
// 使わず、盤面全体の状況判断（カウンターロックの「一番少ない」等）が必要な効果にだけ
// 使う想定。
// holdUntilClick=true の時は自動で消えず、モーダルのクリック／✕／画面どこかのクリックで
// 初めて閉じる（＝CPU戦の自動スキップOFFで、CPUの結果通知をプレイヤーが読み終えるまで
// 止めるため）。戻り値は「閉じたら解決するPromise」（呼び出し側が待てるように）。
export function showEffectReasonModal(cardId, text, { holdUntilClick = false } = {}) {
  if (currentReasonModal) {
    clearTimeout(currentReasonModalTimer);
    // 不具合#1（関連）: 以前はここで currentReasonModal.remove() でDOMから消すだけで、
    // その Promise を resolve せず docClickHandler も外していなかった。そのため、CPUが
    // 概念上並行して別の効果理由モーダル（例: 烙印ドローの告知）を出すと、held=true で
    // クリック待ちだったカウンターロックの announce がここで“置き換え”られて promise が
    // 永久に未解決になり、useCounterLockOnContact の await announceEffectReasonForEffect が
    // ハングして「手札を1枚ロックしますか？」まで進めなくなる窓があった。前のモーダルの
    // dismiss を必ず呼んで await を解決＋リスナー除去する（見た目上は即消えるだけ）。
    if (currentReasonModalDismiss) {
      currentReasonModalDismiss();
      currentReasonModalDismiss = null;
    }
    currentReasonModal.remove();
    currentReasonModal = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "effect-reason-modal";

  return new Promise((resolve) => {
    let settled = false;
    let docClickHandler = null;
    function dismiss() {
      if (settled) return;
      settled = true;
      if (currentReasonModalDismiss === dismiss) currentReasonModalDismiss = null;
      if (docClickHandler) document.removeEventListener("click", docClickHandler, true);
      modal.classList.remove("show");
      setTimeout(() => {
        modal.remove();
        if (currentReasonModal === modal) currentReasonModal = null;
      }, 300);
      resolve();
    }

    // カードに紐づかない汎用のお知らせ（マイデッキからのドロー等、cardIdがカード定義に無い場合）は
    // カード名行を出さず本文だけを見せる（「null」等が出ないように）。
    if (def) {
      const nameEl = document.createElement("div");
      nameEl.className = "effect-reason-modal-name";
      nameEl.textContent = def.name ?? cardId;
      modal.appendChild(nameEl);
    }

    const textEl = document.createElement("div");
    textEl.className = "effect-reason-modal-text";
    textEl.textContent = text;
    modal.appendChild(textEl);

    modal.appendChild(createModalCloseX(dismiss));
    modal.addEventListener("click", dismiss);

    document.body.appendChild(modal);
    currentReasonModal = modal;
    currentReasonModalDismiss = dismiss;
    requestAnimationFrame(() => modal.classList.add("show"));
    if (holdUntilClick) {
      // 自動で消さず、画面のどこをクリックしても閉じる。モーダル出現の同一クリックで
      // 即閉じしないよう、次フレームからリスナーを付ける。
      requestAnimationFrame(() => {
        if (settled) return;
        docClickHandler = () => dismiss();
        document.addEventListener("click", docClickHandler, true);
      });
    } else {
      currentReasonModalTimer = setTimeout(dismiss, REASON_MODAL_DURATION_MS);
    }
  });
}

let currentReceivedModal = null;
let currentReceivedModalBackdrop = null;
let currentReceivedModalTimer = null;
const RECEIVED_MODAL_DURATION_MS = 3200;

// ユーザー要望「スリカエなどで渡されたカードは何が渡されたのか大きくモーダルで
// 表示してわかるようにしてほしい」。受け取る側は相手の手札の中身をそもそも
// 知らないため、手品師の技等で自分の手札に新しく加わったカードが何なのかを
// 画面中央に大きく表示する。showHandEffectUseModal（左上・小さめ・非ブロッキング）
// とは違い見逃されると困る情報のため、儀式的ピック系モーダルと同じく画面中央・
// 背景ディム付きにする（main.jsのswapHandCardWithOpponentForEffect、およびオンライン
// 時はbroadcastCardReceived/onCardReceivedEvents経由で受け取る側自身の画面にだけ出す）。
export function showCardReceivedModal(cardId, subtitle, { labelText = "受け取った" } = {}) {
  if (currentReceivedModal) {
    clearTimeout(currentReceivedModalTimer);
    currentReceivedModalBackdrop?.remove();
    currentReceivedModal.remove();
    currentReceivedModal = null;
    currentReceivedModalBackdrop = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "card-received-modal";

  // 戻り値は「閉じたら解決するPromise」（呼び出し側が複数枚を順番に見せたい時に await できる）。
  return new Promise((resolve) => {
    let settled = false;
    function dismiss() {
      modal.classList.remove("show");
      currentReceivedModalBackdrop?.remove();
      currentReceivedModalBackdrop = null;
      setTimeout(() => {
        modal.remove();
        if (currentReceivedModal === modal) currentReceivedModal = null;
      }, 300);
      if (!settled) {
        settled = true;
        resolve();
      }
    }

    const backdrop = createBackdrop(dismiss, { dim: true, zIndex: 10640 });
    currentReceivedModalBackdrop = backdrop;

    const label = document.createElement("div");
    label.className = "card-received-modal-label";
    label.textContent = labelText;
    modal.appendChild(label);

    const img = document.createElement("img");
    img.src = getCardImagePath(cardId);
    img.alt = def?.name ?? cardId;
    modal.appendChild(img);

    const nameEl = document.createElement("div");
    nameEl.className = "card-received-modal-name";
    nameEl.textContent = def?.name ?? cardId;
    modal.appendChild(nameEl);

    if (subtitle) {
      const subtitleEl = document.createElement("div");
      subtitleEl.className = "card-received-modal-subtitle";
      subtitleEl.textContent = subtitle;
      modal.appendChild(subtitleEl);
    }

    modal.appendChild(createModalCloseX(dismiss));
    modal.addEventListener("click", dismiss);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    currentReceivedModal = modal;
    requestAnimationFrame(() => modal.classList.add("show"));
    currentReceivedModalTimer = setTimeout(dismiss, RECEIVED_MODAL_DURATION_MS);
  });
}

// 複数枚を1つの中央モーダルにまとめて見せる（ユーザー要望2026-08-13「ゲート侵攻で奪ったカードは
// 複数枚でも画面中央にモーダルで表示したい」）。showCardReceivedModalの複数枚版。cardIdがnull
// （オンラインの非公開札）はgetCardImagePath側が裏面を返す。閉じたら解決するPromiseを返す。
export function showMultipleCardsReceivedModal(cardIds, subtitle, { labelText = "奪った" } = {}) {
  if (currentReceivedModal) {
    clearTimeout(currentReceivedModalTimer);
    currentReceivedModalBackdrop?.remove();
    currentReceivedModal.remove();
    currentReceivedModal = null;
    currentReceivedModalBackdrop = null;
  }
  const ids = Array.isArray(cardIds) ? cardIds : [];
  const modal = document.createElement("div");
  modal.className = "card-received-modal card-received-modal-multi";
  return new Promise((resolve) => {
    let settled = false;
    function dismiss() {
      modal.classList.remove("show");
      currentReceivedModalBackdrop?.remove();
      currentReceivedModalBackdrop = null;
      setTimeout(() => {
        modal.remove();
        if (currentReceivedModal === modal) currentReceivedModal = null;
      }, 300);
      if (!settled) {
        settled = true;
        resolve();
      }
    }
    const backdrop = createBackdrop(dismiss, { dim: true, zIndex: 10640 });
    currentReceivedModalBackdrop = backdrop;

    const label = document.createElement("div");
    label.className = "card-received-modal-label";
    label.textContent = `${labelText}（${ids.length}枚）`;
    modal.appendChild(label);

    const row = document.createElement("div");
    row.className = "card-received-modal-cards";
    for (const cardId of ids) {
      const def = getCardDefinition(cardId);
      const cell = document.createElement("div");
      cell.className = "card-received-modal-card";
      const img = document.createElement("img");
      img.src = getCardImagePath(cardId);
      img.alt = def?.name ?? cardId ?? "";
      cell.appendChild(img);
      const nm = document.createElement("div");
      nm.className = "card-received-modal-name";
      nm.textContent = def?.name ?? "";
      cell.appendChild(nm);
      row.appendChild(cell);
    }
    modal.appendChild(row);

    if (subtitle) {
      const subtitleEl = document.createElement("div");
      subtitleEl.className = "card-received-modal-subtitle";
      subtitleEl.textContent = subtitle;
      modal.appendChild(subtitleEl);
    }

    modal.appendChild(createModalCloseX(dismiss));
    modal.addEventListener("click", dismiss);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    currentReceivedModal = modal;
    requestAnimationFrame(() => modal.classList.add("show"));
    currentReceivedModalTimer = setTimeout(dismiss, RECEIVED_MODAL_DURATION_MS);
  });
}

// optionsWithUsability: [{ id, label, usable, ... }]。選ばれたoptionを解決するPromiseを返す。
// カード効果は原則キャンセルできない（ユーザー方針）ため、使える選択肢のどれかを
// 選ぶまでこのモーダルから抜けられない（呼び出し元は必ず1つ以上usable:trueの選択肢が
// ある状態でだけこの関数を呼ぶこと）。
// onReady（省略可）: モーダル表示直後に、外部から強制決着させるための内部finish関数を
// 1回だけ渡すコールバック（main.jsのpickOptionForEffect参照。タイムアウトによる
// 自動代行performPriorityTimeoutAutoActionが、このモーダルを放置されたまま固まらせず
// 代わりに選べるようにするためのフック）。
export function showHandEffectOptionPicker(cardId, optionsWithUsability, onReady, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const def = getCardDefinition(cardId);
    const backdrop = document.createElement("div");
    backdrop.className = `hand-effect-option-picker-backdrop${hidden ? " is-cpu-hidden" : ""}`;
    const modal = document.createElement("div");
    modal.className = `hand-effect-option-picker${hidden ? " is-cpu-hidden" : ""}`;
    const peekHint = document.createElement("div");
    peekHint.className = "hand-effect-option-picker-peek-hint";
    peekHint.textContent = "盤面を確認中…クリックで選択画面に戻ります";

    let settled = false;
    let isPeeking = false;
    function finish(option) {
      if (settled) return;
      settled = true;
      backdrop.remove();
      modal.remove();
      peekHint.remove();
      resolve(option ?? null);
    }
    onReady?.(finish);

    // ユーザー要望「パーティの到達効果時の選択モーダルが盤面を隠していて見にくい。
    // 『盤面を見る』ボタンをモーダル内に追加し、押すと盤面を確認できるように
    // してほしい。適当にクリックすると選択モーダルに戻る」。backdrop（画面全体を
    // 覆う当たり判定）自体は透明になっても残したまま、modalだけを隠すことで、
    // 盤面が実際にクリックできてしまう（誤操作になる）のを防ぎつつ見た目だけ
    // 覗けるようにする。
    function setPeeking(value) {
      isPeeking = value;
      backdrop.classList.toggle("is-peeking", value);
      modal.classList.toggle("is-peeking", value);
      peekHint.classList.toggle("show", value);
    }

    const titleEl = document.createElement("div");
    titleEl.className = "hand-effect-option-picker-title";
    titleEl.textContent = `${def?.name ?? cardId} の効果を選択してください`;
    modal.appendChild(titleEl);

    const img = document.createElement("img");
    img.className = "hand-effect-option-picker-img";
    img.src = getCardImagePath(cardId);
    img.alt = def?.name ?? cardId;
    modal.appendChild(img);

    const peekBtn = document.createElement("button");
    peekBtn.type = "button";
    peekBtn.className = "hand-effect-option-picker-peek-btn";
    peekBtn.textContent = "盤面を見る";
    peekBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setPeeking(true);
    });
    modal.appendChild(peekBtn);

    const list = document.createElement("div");
    list.className = "hand-effect-option-picker-list";
    for (const option of optionsWithUsability) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "hand-effect-option-picker-btn";
      btn.textContent = option.label ?? option.id;
      if (!option.usable) {
        btn.disabled = true;
        btn.classList.add("is-unusable");
      } else {
        btn.addEventListener("click", () => finish(option));
      }
      list.appendChild(btn);
    }
    modal.appendChild(list);

    // ユーザー報告「パーティの効果選択モーダルも、関係ないとこをクリックすると
    // 消えちゃいます」＋「カード効果は原則キャンセルできません」。declareColorsForEffect
    // と同じ理由でキャンセル手段を一切設けない（backdropクリック・✕ボタン共に無し）。
    // backdropのクリックは「盤面を覗いている最中なら元に戻す」だけの役割に限定する
    // （setPeeking(true)でない限り、backdropクリックは何も起きない）。
    backdrop.addEventListener("click", () => {
      if (isPeeking) setPeeking(false);
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    document.body.appendChild(peekHint);
    requestAnimationFrame(() => {
      backdrop.classList.add("show");
      modal.classList.add("show");
    });
  });
}
