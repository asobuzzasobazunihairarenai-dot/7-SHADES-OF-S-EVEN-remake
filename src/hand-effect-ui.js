// 手札効果の自動処理まわりのUI部品2つ。
// ①showHandEffectUseModal: 「このカードを使用します」の告知モーダル（ユーザー要望
//   「手札効果を使用したら、このカードが使用されるよ！って知らしめるモーダルをしっかりと
//   出したい」への対応）。card-arrival.jsのshowCardArrivalModalと同じ「使い捨てDOM要素、
//   数秒で自動的に消える」パターンだが、ラベルが「到達」ではなく「使用」になる。
// ②showHandEffectOptionPicker: 選択肢が2つ以上ある手札効果（なないろの欠片等）で、
//   どれを使うか選ばせるモーダル（ユーザー要望「効果選択モーダルを出してください。
//   使用できない方はグレー表示。」）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

let currentUseModal = null;
let currentUseModalTimer = null;

const USE_MODAL_DURATION_MS = 2200;

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

  modal.appendChild(createModalCloseX(dismiss));
  modal.addEventListener("click", dismiss);

  document.body.appendChild(modal);
  currentUseModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  currentUseModalTimer = setTimeout(dismiss, USE_MODAL_DURATION_MS);
}

let currentReasonModal = null;
let currentReasonModalTimer = null;
const REASON_MODAL_DURATION_MS = 2600;

// ユーザー要望「カウンターロックの到達効果について『あなたは１番少なくロックしている
// ので１枚ドローします』みたいなモーダルを出してからドローしてください。ほかの効果も
// プレイヤーが何が起きたのかわかるようになるべくモーダルで教えてあげてください」への
// 対応。showHandEffectUseModalと同じ「使い捨てDOM要素、数秒で自動的に消える」
// パターンだが、こちらは「このカードを使う」ではなく「なぜこの効果が発動したか」を
// 説明する自由文を表示する。対象を選ぶ・マスを選ぶ等それ自体で結果が見て分かる効果には
// 使わず、盤面全体の状況判断（カウンターロックの「一番少ない」等）が必要な効果にだけ
// 使う想定。
export function showEffectReasonModal(cardId, text) {
  if (currentReasonModal) {
    clearTimeout(currentReasonModalTimer);
    currentReasonModal.remove();
    currentReasonModal = null;
  }
  const def = getCardDefinition(cardId);
  const modal = document.createElement("div");
  modal.className = "effect-reason-modal";

  function dismiss() {
    modal.classList.remove("show");
    setTimeout(() => {
      modal.remove();
      if (currentReasonModal === modal) currentReasonModal = null;
    }, 300);
  }

  const nameEl = document.createElement("div");
  nameEl.className = "effect-reason-modal-name";
  nameEl.textContent = def?.name ?? cardId;
  modal.appendChild(nameEl);

  const textEl = document.createElement("div");
  textEl.className = "effect-reason-modal-text";
  textEl.textContent = text;
  modal.appendChild(textEl);

  modal.appendChild(createModalCloseX(dismiss));
  modal.addEventListener("click", dismiss);

  document.body.appendChild(modal);
  currentReasonModal = modal;
  requestAnimationFrame(() => modal.classList.add("show"));
  currentReasonModalTimer = setTimeout(dismiss, REASON_MODAL_DURATION_MS);
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
export function showCardReceivedModal(cardId, subtitle) {
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

  function dismiss() {
    modal.classList.remove("show");
    currentReceivedModalBackdrop?.remove();
    currentReceivedModalBackdrop = null;
    setTimeout(() => {
      modal.remove();
      if (currentReceivedModal === modal) currentReceivedModal = null;
    }, 300);
  }

  const backdrop = createBackdrop(dismiss, { dim: true, zIndex: 10640 });
  currentReceivedModalBackdrop = backdrop;

  const label = document.createElement("div");
  label.className = "card-received-modal-label";
  label.textContent = "受け取った";
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
}

// optionsWithUsability: [{ id, label, usable, ... }]。選ばれたoptionを解決するPromiseを返す
// （閉じるボタン・背景クリックではnullを解決する）。
export function showHandEffectOptionPicker(cardId, optionsWithUsability) {
  return new Promise((resolve) => {
    const def = getCardDefinition(cardId);
    const backdrop = document.createElement("div");
    backdrop.className = "hand-effect-option-picker-backdrop";
    const modal = document.createElement("div");
    modal.className = "hand-effect-option-picker";
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

    modal.appendChild(createModalCloseX(() => finish(null)));
    backdrop.addEventListener("click", () => {
      if (isPeeking) {
        setPeeking(false);
        return;
      }
      finish(null);
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
