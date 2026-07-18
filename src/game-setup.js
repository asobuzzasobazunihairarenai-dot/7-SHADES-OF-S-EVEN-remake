// 「セットアップウィザード」: 物理版の説明書(docs/rulebook.md「Game Preparation」)にある
// ゲーム準備の手順を、ボタン操作でその通りに再現するツール。
// ０: プレイ人数選択・白黒（無色）カードを山札に含めるか確認
// １: ファーストカードを配り、駒を配置する（このステップの最初に盤面を完全リセットする）
// ２: 山札をシャッフルして盤面49マスに裏向きで配置する
// ３: スタートプレイヤーを無作為に決める
// のいずれかを個別に、または「１〜３を一気に行う」でまとめて実行できる。
// 配布アニメーションは今回のスコープ外（機能を固めた後の別作業とする）。

import { resetGame, setupAssignFirstCards, setupFillBoard } from "./state.js";
import { isManualSeatMode } from "./admin.js";
import { SEAT_TO_SIDE, SEAT_ORDER, SEAT_LABELS } from "./board-layout.js";

// 2人/3人プレイ時、座席自動選択モード（管理者モードのトグルがオフの時）で使う座席。
// 2人=対面(A・C)、3人=Dを除いた3隅。4人は常に全員。
const AUTO_SEATS_BY_COUNT = {
  2: ["A", "C"],
  3: ["A", "B", "C"],
  4: ["A", "B", "C", "D"],
};

// ステップ0で決めた内容（次にステップ1/2/3を実行する時に使う）。未設定ならnull。
let config = null;

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

function activePlayersOrdered() {
  return SEAT_ORDER.filter((p) => config.activePlayers.includes(p));
}

// main.jsのrender()と同じ「シンプルなbackdrop+モーダル」パターン
// （外側クリック・✕ボタンの両方で閉じられるようにする）。
function buildSimpleModal({ widthRem = 24 } = {}) {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = "position: fixed; inset: 0; z-index: 10001;";
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(${widthRem}rem, 92vw); max-height: 85vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 1rem; z-index: 10002;
    font-family: sans-serif; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close-x";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "閉じる");
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  modal.appendChild(closeBtn);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  return { backdrop, modal, close };
}

function openConfigDialog() {
  const { modal, close } = buildSimpleModal({ widthRem: 26 });

  const title = document.createElement("div");
  title.textContent = "０：プレイ人数選択、白黒カード確認";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.8rem; font-size: 0.95rem;";
  modal.appendChild(title);

  const manualMode = isManualSeatMode();
  let getActivePlayers; // 決定ボタン押下時に呼び、有効な座席の配列を返す関数

  if (manualMode) {
    const note = document.createElement("div");
    note.style.cssText = "font-size: 0.75rem; opacity: 0.8; margin-bottom: 0.4rem;";
    note.textContent = "使う座席を選んでください（2〜4人）。";
    modal.appendChild(note);

    const checkboxes = {};
    for (const p of SEAT_ORDER) {
      const row = document.createElement("label");
      row.style.cssText = "display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; cursor: pointer;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = config ? config.activePlayers.includes(p) : true;
      checkboxes[p] = cb;
      const span = document.createElement("span");
      span.textContent = SEAT_LABELS[p];
      row.appendChild(cb);
      row.appendChild(span);
      modal.appendChild(row);
    }
    getActivePlayers = () => SEAT_ORDER.filter((p) => checkboxes[p].checked);
  } else {
    const note = document.createElement("div");
    note.style.cssText = "font-size: 0.8rem; margin-bottom: 0.4rem;";
    note.textContent = "プレイ人数：";
    modal.appendChild(note);

    const radioRow = document.createElement("div");
    radioRow.style.cssText = "display: flex; gap: 0.8rem; margin-bottom: 0.6rem;";
    const currentCount = config ? config.activePlayers.length : 4;
    const radios = {};
    for (const count of [2, 3, 4]) {
      const row = document.createElement("label");
      row.style.cssText = "display: flex; align-items: center; gap: 0.3rem; cursor: pointer;";
      const radio = document.createElement("input");
      radio.type = "radio";
      radio.name = "game-setup-player-count";
      radio.value = String(count);
      radio.checked = count === currentCount;
      radios[count] = radio;
      const span = document.createElement("span");
      span.textContent = `${count}人`;
      row.appendChild(radio);
      row.appendChild(span);
      radioRow.appendChild(row);
    }
    modal.appendChild(radioRow);
    getActivePlayers = () => {
      const count = [2, 3, 4].find((c) => radios[c].checked) ?? 4;
      return AUTO_SEATS_BY_COUNT[count];
    };
  }

  const errorEl = document.createElement("div");
  errorEl.style.cssText = "color: #f87171; font-size: 0.75rem; margin-bottom: 0.4rem; display: none;";
  modal.appendChild(errorEl);

  const bwRow = document.createElement("label");
  bwRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; margin: 0.6rem 0; cursor: pointer;";
  const bwCheckbox = document.createElement("input");
  bwCheckbox.type = "checkbox";
  bwCheckbox.checked = config ? config.includeBlackWhite : false;
  const bwSpan = document.createElement("span");
  bwSpan.textContent = "白黒（無色）カードを山札に含める";
  bwRow.appendChild(bwCheckbox);
  bwRow.appendChild(bwSpan);
  modal.appendChild(bwRow);

  const bwNote = document.createElement("div");
  bwNote.style.cssText = "font-size: 0.7rem; opacity: 0.7; margin-bottom: 0.8rem;";
  bwNote.textContent = "説明書では、初めてプレイする時は白黒（無色）カードを外すことを勧めています（デフォルトでは含めません）。";
  modal.appendChild(bwNote);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "決定";
  confirmBtn.style.cssText = "padding: 0.4rem 1rem; background: #0891b2; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  confirmBtn.addEventListener("click", () => {
    const activePlayers = getActivePlayers();
    if (activePlayers.length < 2) {
      errorEl.textContent = "2人以上選択してください。";
      errorEl.style.display = "block";
      return;
    }
    config = { activePlayers, includeBlackWhite: bwCheckbox.checked };
    updateStatusLine();
    close();
  });
  modal.appendChild(confirmBtn);
}

function showStartPlayerModal(player) {
  const { modal } = buildSimpleModal({ widthRem: 20 });
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; font-size: 0.95rem;";
  title.textContent = "３：スタートプレイヤー決定";
  const body = document.createElement("div");
  body.style.cssText = "font-size: 0.9rem; line-height: 1.6;";
  body.textContent = `${SEAT_LABELS[player]} からスタートです！（以降、時計回りにターンを進めてください）`;
  modal.appendChild(title);
  modal.appendChild(body);
}

// ステップ1/2/3のいずれかを押した時、まだステップ0が未実施ならまず設定ダイアログを開いて
// そこで止める（実行はせず、ユーザーに再度ボタンを押してもらう）。
function ensureConfig() {
  if (!config) {
    openConfigDialog();
    return false;
  }
  return true;
}

function runStep1() {
  if (!ensureConfig()) return;
  resetGame();
  const players = activePlayersOrdered().map((player) => ({ player, side: SEAT_TO_SIDE[player] }));
  setupAssignFirstCards(players);
  notifyChange();
}

function runStep2() {
  if (!ensureConfig()) return;
  setupFillBoard(config.includeBlackWhite);
  notifyChange();
}

function runStep3() {
  if (!ensureConfig()) return;
  const players = activePlayersOrdered();
  const startPlayer = players[Math.floor(Math.random() * players.length)];
  showStartPlayerModal(startPlayer);
}

function runAll() {
  if (!ensureConfig()) return;
  runStep1();
  runStep2();
  runStep3();
}

let statusLineEl = null;

function updateStatusLine() {
  if (!statusLineEl) return;
  if (!config) {
    statusLineEl.textContent = "設定: 未設定（まず「０」を実行してください）";
    return;
  }
  const seatsText = activePlayersOrdered().join("・");
  const bwText = config.includeBlackWhite ? "含める" : "含めない";
  statusLineEl.textContent = `設定: ${config.activePlayers.length}人（${seatsText}）／白黒カード: ${bwText}`;
}

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "game-setup-panel";
  panel.style.cssText = `
    position: fixed; top: 3.4rem; right: 1rem; z-index: 1000;
    background: rgba(15, 23, 32, 0.95); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 0.75rem; width: 19rem;
    font-family: sans-serif; font-size: 0.8rem; color: #e2e8f0;
    display: none;
  `;

  const title = document.createElement("div");
  title.textContent = "セットアップウィザード";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.4rem;";
  panel.appendChild(title);

  statusLineEl = document.createElement("div");
  statusLineEl.style.cssText = "font-size: 0.72rem; opacity: 0.8; margin-bottom: 0.6rem;";
  panel.appendChild(statusLineEl);
  updateStatusLine();

  const steps = [
    ["０：プレイ人数選択、白黒カード確認", openConfigDialog],
    ["１：ファーストカードを配り、駒を配置する", runStep1],
    ["２：盤面にカードを配置する", runStep2],
    ["３：スタートプレイヤーを決める", runStep3],
    ["１〜３を一気に行う", runAll],
  ];
  for (const [label, handler] of steps) {
    const btn = document.createElement("button");
    btn.textContent = label;
    btn.style.cssText = "display: block; width: 100%; margin-bottom: 0.4rem; padding: 0.4rem; background: #334155; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer; text-align: left;";
    btn.addEventListener("click", handler);
    panel.appendChild(btn);
  }

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  closeBtn.style.cssText = "width: 100%; margin-top: 0.3rem; padding: 0.3rem; background: #475569; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  panel.appendChild(closeBtn);

  return { panel, closeBtn };
}

function buildToggleButton(panel, closeBtn) {
  const btn = document.createElement("button");
  btn.textContent = "🎲 セットアップ";
  btn.style.cssText = `
    position: fixed; top: 3.4rem; right: 1rem; z-index: 1001;
    padding: 0.4rem 0.7rem; background: rgba(15, 23, 32, 0.85); color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.4rem; cursor: pointer;
    font-family: sans-serif; font-size: 0.75rem;
  `;
  let open = false;
  const setOpen = (next) => {
    open = next;
    panel.style.display = open ? "block" : "none";
    btn.style.display = open ? "none" : "block";
  };
  btn.addEventListener("click", () => setOpen(true));
  closeBtn.addEventListener("click", () => setOpen(false));
  return btn;
}

export function initGameSetup() {
  const { panel, closeBtn } = buildPanel();
  const btn = buildToggleButton(panel, closeBtn);
  document.body.appendChild(panel);
  document.body.appendChild(btn);
}
