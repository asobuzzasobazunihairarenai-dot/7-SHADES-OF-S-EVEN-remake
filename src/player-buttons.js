// 「プレイヤー用ボタン」（手札シャッフル・盤面拡大・1枚ドロー、画面右下のボタン列）に
// 共通する機能をまとめたモジュール。ボタン自身の中身（クリック時の処理）はmain.js側で作るが、
// ここでは横断的な機能だけを扱う:
// - ドラッグ＆ドロップでの並び替え（掴んで離すと、離した場所のボタンと入れ替わる）
// - キーボードショートカットの割り当て（基本設定のUIから設定、値自体もここで保持する）
// - 右クリックで基本設定のショートカット設定欄を開く（実際に開く処理はoptions-menu.js側に
//   registerShortcutSettingsOpener()で登録してもらう）

export const PLAYER_BUTTONS = [
  { id: "hand-shuffle-button", label: "手札シャッフル" },
  { id: "board-zoom-button", label: "盤面拡大" },
  { id: "draw-button", label: "1枚ドロー" },
];

// 画面右下のスタックで、#end-turn-button（bottom: 1.2rem、このグループには含まれない）の
// 上に積む3つのスロットのbottom位置。orderの並び順（先頭が一番下）でそのまま対応する。
const SLOT_BOTTOM_REM = [4.4, 7.6, 10.8];

// ハマりどころ: 初期順をPLAYER_BUTTONS（ショートカット設定UIでの表示順）からそのまま
// 流用すると、その並び("hand-shuffle"→"board-zoom"→"draw")と実際のCSSデフォルトの
// 積み順(下から draw→board-zoom→hand-shuffle)が一致せず、ページを開いた瞬間に
// ボタンが勝手に入れ替わって見えるバグになる。ここは元のCSSの積み順（下から順）を
// 明示的に指定する（PLAYER_BUTTONSとは独立した配列にしておく）。
let order = ["draw-button", "board-zoom-button", "hand-shuffle-button"];
let shortcuts = {}; // { [buttonId]: "s" }（キーは小文字化して保持）

export function getShortcut(buttonId) {
  return shortcuts[buttonId] || null;
}

// 同じキーは1つのボタンにしか割り当てられないようにする（既に別のボタンに設定済みなら、
// そちらの割り当てを外してから新しい方に設定する）。
export function setShortcut(buttonId, key) {
  const normalized = key ? key.toLowerCase() : null;
  for (const id of Object.keys(shortcuts)) {
    if (id !== buttonId && shortcuts[id] === normalized) delete shortcuts[id];
  }
  if (normalized) shortcuts[buttonId] = normalized;
  else delete shortcuts[buttonId];
}

function applyPositions() {
  order.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.style.bottom = `${SLOT_BOTTOM_REM[i]}rem`;
  });
}

function reorder(draggedId, targetIndex) {
  const currentIndex = order.indexOf(draggedId);
  if (currentIndex === -1 || currentIndex === targetIndex) return;
  const next = [...order];
  next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, draggedId);
  order = next;
  applyPositions();
}

function slotIndexAt(clientY) {
  let bestIndex = 0;
  let bestDist = Infinity;
  order.forEach((slotId, i) => {
    const el = document.getElementById(slotId);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    const dist = Math.abs(clientY - cy);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  });
  return bestIndex;
}

// 掴んでから一定距離動くまではドラッグ扱いにしない（クリックと区別するため）。
const DRAG_START_THRESHOLD = 6;

function attachDrag(btn, id) {
  btn.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    let ghost = null;

    function onMove(ev) {
      if (!dragging) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.hypot(dx, dy) < DRAG_START_THRESHOLD) return;
        dragging = true;
        // 「ドロップするとこうなりますよ」の見た目をそのまま伝えるため、ボタン自身の
        // クローンをカーソルに追従させるゴーストにする。
        ghost = btn.cloneNode(true);
        ghost.className = `${btn.className} player-button-ghost`;
        ghost.style.left = "0";
        ghost.style.top = "0";
        ghost.style.right = "auto";
        document.body.appendChild(ghost);
        btn.classList.add("is-drag-source");
      }
      ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px) translate(-50%, -50%)`;
      const idx = slotIndexAt(ev.clientY);
      for (const slotId of order) {
        const el = document.getElementById(slotId);
        if (el) el.classList.toggle("drop-target-active", slotId !== id && order.indexOf(slotId) === idx);
      }
    }

    function onUp(ev) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      for (const slotId of order) {
        document.getElementById(slotId)?.classList.remove("drop-target-active");
      }
      if (!dragging) return;
      reorder(id, slotIndexAt(ev.clientY));
      ghost.remove();
      btn.classList.remove("is-drag-source");
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
}

let openShortcutSettingsFn = null;

// options-menu.js側から呼んでもらい、「基本設定」パネルを開いて該当ボタンの行までスクロール
// する処理を登録してもらう（このモジュール自身はオプションパネルの中身を知らないため）。
export function registerShortcutSettingsOpener(fn) {
  openShortcutSettingsFn = fn;
}

export function initPlayerButtons() {
  applyPositions();
  for (const { id } of PLAYER_BUTTONS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    attachDrag(btn, id);
    btn.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (openShortcutSettingsFn) openShortcutSettingsFn(id);
    });
  }
  window.addEventListener("keydown", (e) => {
    // 入力欄にフォーカスがある間（プレイヤー名編集・ショートカットキー設定中など）は
    // ショートカットとして奪わない。
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    const key = e.key.toLowerCase();
    const buttonId = Object.keys(shortcuts).find((id) => shortcuts[id] === key);
    if (!buttonId) return;
    const btn = document.getElementById(buttonId);
    if (btn && getComputedStyle(btn).display !== "none" && !btn.disabled) {
      e.preventDefault();
      btn.click();
    }
  });
}
