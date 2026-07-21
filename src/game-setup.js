// 「セットアップウィザード」: 物理版の説明書(docs/rulebook.md「Game Preparation」)にある
// ゲーム準備の手順を、ボタン操作でその通りに再現するツール。
// パネルを開くと、まず「プレイ人数選択・白黒（無色）カードを山札に含めるか」の設定フォームが
// 展開された状態で表示され、「決定」するまでは１〜３のステップに進めない
// （設定を済ませないと１〜３が実行できないように、あえてボタンを表示しない設計）。
// 決定すると、フォームの代わりに以下のステップボタンが現れる。
// １: ファーストカードを配り、駒を配置する（このステップの最初に盤面を完全リセットする）
// ２: 山札をシャッフルして盤面49マスに裏向きで配置する
// ３: スタートプレイヤーを無作為に決める（以降のターン管理の起点にもなる）
// のいずれかを個別に、または「１〜３を一気に行う」でまとめて実行できる。
// １・２はそれぞれ、対応する配布演出（setup-animation.js）の再生が終わるまで待ってから
// 次のステップに進む（「１〜３を一気に行う」でスタートプレイヤー発表が演出の途中に
// 割り込んでこないようにするため）。

import { resetGame, setupAssignFirstCards, setupFillBoard, setTurnPlayer } from "./state.js";
import { isManualSeatMode } from "./admin.js";
import { SEAT_TO_SIDE, SEAT_ORDER } from "./board-layout.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { resetVictoryTracking } from "./victory.js";
import { PLAYMAT_OPTIONS, getSelectedPlaymatId, setSelectedPlaymatId } from "./playmat.js";
import { animateFirstCardsDealt, animateBoardFilled } from "./setup-animation.js";
import { applyAvatarContent } from "./avatar-render.js";

// 2人/3人プレイ時、座席自動選択モード（管理者モードのトグルがオフの時）で使う座席。
// 2人=対面(A・C)、3人=Dを除いた3隅。4人は常に全員。
const AUTO_SEATS_BY_COUNT = {
  2: ["A", "C"],
  3: ["A", "B", "C"],
  4: ["A", "B", "C", "D"],
};

// ステップ0で決めた内容。未設定（＝フォームをまだ「決定」していない）ならnull。
let config = null;
let bodyEl = null; // パネル内の可変領域（設定フォーム⇄ステップボタンをここで差し替える）
let closePanel = null; // 「１〜３を一気に行う」完了時にパネルを自動で閉じるために使う

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

function activePlayersOrdered() {
  return SEAT_ORDER.filter((p) => config.activePlayers.includes(p));
}

// スタートプレイヤー発表にのみ使う、シンプルなbackdrop+モーダル（外側クリック・✕ボタンの
// 両方で閉じられる、ui-helpers.jsの共通部品を使う）。
// fadeIn:trueにすると、いきなり表示せず少し溜めてからフェードインする
// （スタートプレイヤー決定のような「発表」演出に重みを持たせるため）。
function buildSimpleModal({ widthRem = 24, fadeIn = false } = {}) {
  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(${widthRem}rem, 92vw); max-height: 85vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 1rem; z-index: 10002;
    font-family: sans-serif; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });
  modal.appendChild(createModalCloseX(close));
  if (fadeIn) {
    backdrop.style.opacity = "0";
    modal.style.opacity = "0";
    modal.style.transition = "opacity 0.7s ease";
    backdrop.style.transition = "opacity 0.7s ease";
  }
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  if (fadeIn) {
    // 「パッと」ではなく一呼吸置いてから見せたいので、appendの直後ではなく
    // 少し溜めてからフェードインを開始する。
    setTimeout(() => {
      backdrop.style.opacity = "1";
      modal.style.opacity = "1";
    }, 500);
  }
  return { backdrop, modal, close };
}

function showStartPlayerModal(player) {
  const { modal } = buildSimpleModal({ widthRem: 20, fadeIn: true });
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; font-size: 0.95rem;";
  title.textContent = "３：スタートプレイヤー決定";

  // 誰から始まるかが一目で分かるよう、アバターと名前を大きく見せる
  // （文字だけの通知だと地味で見落としやすい、という要望への対応）。
  const avatarEl = document.createElement("div");
  avatarEl.className = "start-player-avatar";
  avatarEl.style.cssText = "font-size: 4rem; text-align: center; line-height: 1; margin: 0.4rem 0;";
  applyAvatarContent(avatarEl, getPlayerAvatar(player));

  const nameEl = document.createElement("div");
  nameEl.style.cssText = "font-size: 1.5rem; font-weight: bold; text-align: center; color: #7dd3fc; margin-bottom: 0.6rem;";
  nameEl.textContent = getPlayerName(player);

  const body = document.createElement("div");
  body.style.cssText = "font-size: 0.9rem; line-height: 1.6; text-align: center;";
  body.textContent = "からスタートです！（以降、時計回りにターンを進めてください）";

  modal.appendChild(title);
  modal.appendChild(avatarEl);
  modal.appendChild(nameEl);
  modal.appendChild(body);
}

// パネル内に「０：プレイ人数選択、白黒カード確認」のフォームを直接展開する
// （以前は別ウィンドウのダイアログだったが、決定するまで１〜３に進めないことを
// 分かりやすくするため、パネルの一部として常に見える形にした）。
function buildConfigForm() {
  const wrapper = document.createElement("div");

  const title = document.createElement("div");
  title.textContent = "０：プレイ人数選択、白黒カード確認";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem;";
  wrapper.appendChild(title);

  const manualMode = isManualSeatMode();
  let getActivePlayers; // 決定ボタン押下時に呼び、有効な座席の配列を返す関数

  if (manualMode) {
    const note = document.createElement("div");
    note.style.cssText = "font-size: 0.72rem; opacity: 0.8; margin-bottom: 0.4rem;";
    note.textContent = "使う座席を選んでください（2〜4人）。";
    wrapper.appendChild(note);

    const checkboxes = {};
    for (const p of SEAT_ORDER) {
      const row = document.createElement("label");
      row.style.cssText = "display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem; cursor: pointer;";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = config ? config.activePlayers.includes(p) : true;
      checkboxes[p] = cb;
      const span = document.createElement("span");
      span.textContent = getPlayerName(p);
      row.appendChild(cb);
      row.appendChild(span);
      wrapper.appendChild(row);
    }
    getActivePlayers = () => SEAT_ORDER.filter((p) => checkboxes[p].checked);
  } else {
    const note = document.createElement("div");
    note.style.cssText = "font-size: 0.8rem; margin-bottom: 0.4rem;";
    note.textContent = "プレイ人数：";
    wrapper.appendChild(note);

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
    wrapper.appendChild(radioRow);
    getActivePlayers = () => {
      const count = [2, 3, 4].find((c) => radios[c].checked) ?? 4;
      return AUTO_SEATS_BY_COUNT[count];
    };
  }

  const errorEl = document.createElement("div");
  errorEl.style.cssText = "color: #f87171; font-size: 0.75rem; margin-bottom: 0.4rem; display: none;";
  wrapper.appendChild(errorEl);

  const bwRow = document.createElement("label");
  bwRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; margin: 0.5rem 0; cursor: pointer;";
  const bwCheckbox = document.createElement("input");
  bwCheckbox.type = "checkbox";
  bwCheckbox.checked = config ? config.includeBlackWhite : false;
  const bwSpan = document.createElement("span");
  bwSpan.textContent = "白黒（無色）カードを山札に含める";
  bwRow.appendChild(bwCheckbox);
  bwRow.appendChild(bwSpan);
  wrapper.appendChild(bwRow);

  const bwNote = document.createElement("div");
  bwNote.style.cssText = "font-size: 0.68rem; opacity: 0.7; margin-bottom: 0.7rem;";
  bwNote.textContent = "説明書では、初めてプレイする時は白黒（無色）カードを外すことを勧めています（デフォルトでは含めません）。";
  wrapper.appendChild(bwNote);

  const playmatNote = document.createElement("div");
  playmatNote.style.cssText = "font-size: 0.8rem; margin-bottom: 0.4rem;";
  playmatNote.textContent = "プレイマット：";
  wrapper.appendChild(playmatNote);

  const playmatRow = document.createElement("div");
  playmatRow.style.cssText = "display: flex; flex-wrap: wrap; gap: 0.5rem 0.8rem; margin-bottom: 0.7rem;";
  const currentPlaymatId = getSelectedPlaymatId();
  const playmatRadios = {};
  for (const option of PLAYMAT_OPTIONS) {
    const row = document.createElement("label");
    row.style.cssText = "display: flex; align-items: center; gap: 0.3rem; cursor: pointer;";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "game-setup-playmat";
    radio.value = option.id;
    radio.checked = option.id === currentPlaymatId;
    playmatRadios[option.id] = radio;
    const span = document.createElement("span");
    span.textContent = option.label;
    row.appendChild(radio);
    row.appendChild(span);
    playmatRow.appendChild(row);
  }
  wrapper.appendChild(playmatRow);

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "決定";
  confirmBtn.style.cssText = "width: 100%; padding: 0.4rem; background: #0891b2; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  confirmBtn.addEventListener("click", () => {
    const activePlayers = getActivePlayers();
    if (activePlayers.length < 2) {
      errorEl.textContent = "2人以上選択してください。";
      errorEl.style.display = "block";
      return;
    }
    config = { activePlayers, includeBlackWhite: bwCheckbox.checked };
    const chosenPlaymat = PLAYMAT_OPTIONS.find((o) => playmatRadios[o.id].checked);
    setSelectedPlaymatId(chosenPlaymat ? chosenPlaymat.id : "white");
    notifyChange(); // プレイマットはこの時点で即座に見た目へ反映したい
    renderPanelBody();
  });
  wrapper.appendChild(confirmBtn);

  return wrapper;
}

// 決定済みの設定に基づき、１〜３のステップボタンを表示する
// （設定変更リンクからいつでも０のフォームに戻れる）。
function buildStepButtons() {
  const wrapper = document.createElement("div");

  const statusLine = document.createElement("div");
  const seatsText = activePlayersOrdered().join("・");
  const bwText = config.includeBlackWhite ? "含める" : "含めない";
  statusLine.textContent = `設定: ${config.activePlayers.length}人（${seatsText}）／白黒カード: ${bwText}`;
  statusLine.style.cssText = "font-size: 0.72rem; opacity: 0.8; margin-bottom: 0.3rem;";
  wrapper.appendChild(statusLine);

  const changeLink = document.createElement("button");
  changeLink.textContent = "⚙ 設定を変更（０に戻る）";
  changeLink.style.cssText = "display: block; width: 100%; margin-bottom: 0.6rem; padding: 0.3rem; background: transparent; color: #7dd3fc; border: 1px solid rgba(125,211,252,0.4); border-radius: 0.25rem; cursor: pointer; font-size: 0.72rem;";
  changeLink.addEventListener("click", () => {
    renderPanelBody(true);
  });
  wrapper.appendChild(changeLink);

  const steps = [
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
    wrapper.appendChild(btn);
  }

  return wrapper;
}

function renderPanelBody(forceForm = false) {
  if (!bodyEl) return;
  bodyEl.innerHTML = "";
  bodyEl.appendChild(!config || forceForm ? buildConfigForm() : buildStepButtons());
}

async function runStep1() {
  resetGame();
  resetVictoryTracking(); // 新しい対戦の開始なので、以前の勝利済みプレイヤーの記録も忘れる
  const players = activePlayersOrdered().map((player) => ({ player, side: SEAT_TO_SIDE[player] }));
  setupAssignFirstCards(players);
  await animateFirstCardsDealt();
}

async function runStep2() {
  setupFillBoard(config.includeBlackWhite);
  await animateBoardFilled();
}

function runStep3() {
  const players = activePlayersOrdered();
  const startPlayer = players[Math.floor(Math.random() * players.length)];
  setTurnPlayer(startPlayer);
  notifyChange();
  showStartPlayerModal(startPlayer);
}

async function runAll() {
  await runStep1();
  await runStep2();
  runStep3();
  if (closePanel) closePanel();
}

// クイックスタート（quick-start.js、画面右上の人数アイコン）用。通常のウィザードの
// 「０：プレイ人数選択」を経由せず、指定した人数・無色カードの有無で直接０〜３を実行する。
// 座席自動選択モード（管理者モードのトグルがオフ）を前提にした人数固定の座席割り当てになる
// （手動座席選択モードの時に「2人プレイで特定の2席だけ選ぶ」といった細かい指定はできない。
// その場合は従来通りウィザードの０から手動で設定してもらう）。
export async function quickStart(count, includeBlackWhite) {
  const activePlayers = AUTO_SEATS_BY_COUNT[count];
  if (!activePlayers) return;
  config = { activePlayers, includeBlackWhite };
  if (bodyEl) renderPanelBody();
  await runAll();
}

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "game-setup-panel";
  panel.style.cssText = `
    position: fixed; top: 4.2rem; right: 1rem; z-index: 1000;
    background: rgba(15, 23, 32, 0.95); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 0.75rem; width: 19rem;
    font-family: sans-serif; font-size: 0.8rem; color: #e2e8f0;
    display: none;
  `;

  const title = document.createElement("div");
  title.textContent = "セットアップウィザード";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.5rem; padding-right: 1.6rem;";
  panel.appendChild(title);
  panel.appendChild(createModalCloseX(close));

  bodyEl = document.createElement("div");
  panel.appendChild(bodyEl);
  renderPanelBody();

  return panel;
}

function buildToggleButton(open) {
  const btn = document.createElement("button");
  btn.id = "game-setup-toggle-button";
  btn.className = "header-tool-button";
  btn.textContent = "🎲 セットアップ";
  btn.style.cssText = `
    position: fixed; top: 4.2rem; right: 1rem; z-index: 1001;
    padding: 0.4rem 0.7rem; background: rgba(15, 23, 32, 0.85); color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.4rem; cursor: pointer;
    font-family: sans-serif; font-size: 0.75rem;
  `;
  btn.addEventListener("click", open);
  return btn;
}

export function initGameSetup() {
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
    // インラインスタイルはCSSの `body.is-online-mode #game-setup-toggle-button { display: none; }`
    // より常に優先されてしまう。"block"を直接指定していたため、一度でもこのパネルを
    // 閉じる操作（ウィザードの通常利用・クイックスタート完了時の自動クローズ含む）が
    // 行われると、その後オンラインの部屋に参加してもこのボタンが二度と隠れなくなる
    // バグがあった。removeProperty()でインラインスタイルそのものを外し、CSS側の
    // カスケード（オンラインモード時の非表示規則を含む）に判断を委ねる。
    toggleBtn.style.removeProperty("display");
  }
  closePanel = close;
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
    toggleBtn.style.display = "none";
  }

  const panel = buildPanel(close);
  // ツールパネルなので背景は暗くしない（盤面を見ながら操作したいため）。
  const backdrop = createBackdrop(close, { dim: false, zIndex: 999 });
  const toggleBtn = buildToggleButton(open);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}
