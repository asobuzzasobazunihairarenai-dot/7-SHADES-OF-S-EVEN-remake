// 勝利演出（victory-celebration.js）のシミュレーター。管理者モードの「勝利演出」グループの
// 『プレビューを開く』から呼ぶ。dissolve-preview.js（V4/V5のシミュレーター）と同じ作法:
//
//   **パラメータは全て CSS 変数（--vic-*）**。このシミュレーターはその変数を書き換えるだけで、
//   本番の演出も同じ変数を読む。だから「シミュレーターと本番で数値が分かれる」ことが起きない。
//   気に入った値は「設定をコピー」でJSONとして取り出し、style.css の :root へ焼き込む。
//
// 実際のゲームを最後までプレイしなくても、いま見えている盤面に対して演出を再生できる。
// 本番のプレイヤーには出ない（管理者モード配下）。
// 【重要】victory-celebration.js は player-identity/state/card-face-display 等を辿るため、
// ここで静的importすると admin.js → victory-preview.js → … → admin.js の循環になり、
// 起動時に TDZ（Cannot access ... before initialization）でアプリごと落ちる（実際に踏んだ）。
// このシミュレーターは開いた時にしか使わないので、必要になった瞬間に動的importする。
let vcMod = null;
async function vc() {
  if (!vcMod) vcMod = await import("./victory-celebration.js");
  return vcMod;
}
import { SEAT_ORDER, SEAT_LABELS } from "./board-layout.js";
import { getState } from "./state.js";

let overlay = null;

// [CSS変数, ラベル, 最小, 最大, 刻み, 既定]
const SLIDERS = [
  ["--vic-speed", "全体の速さ（大きいほど速い）", 0.5, 2.5, 0.05, 1],
  ["--vic-color-step", "1色ごとの間隔", 0.3, 2.5, 0.05, 1],
  ["--vic-gather-speed", "キューブへ集まる速さ", 0.4, 2.5, 0.05, 1],
  ["--vic-stream", "光の帯・霧の量", 0.2, 2.5, 0.05, 1],
  ["--vic-pulse-count", "脈動の回数", 1, 6, 1, 3],
  ["--vic-pulse-power", "脈動の強さ", 0.3, 2.5, 0.05, 1],
  ["--vic-shake", "画面振動の強さ", 0, 3, 0.05, 1],
  ["--vic-flash-speed", "白飛びが広がる速さ", 0.4, 2.5, 0.05, 1],
  ["--vic-white", "白の濃さ（背景の残り具合）", 0.5, 0.98, 0.01, 0.88],
  ["--vic-residue", "白の中の七色残光", 0, 3, 0.05, 1],
  ["--vic-avatar-size", "勝者アバターの大きさ(vmin)", 8, 30, 0.5, 16],
  ["--vic-hold", "勝利表示を見せる長さ", 0.3, 3, 0.05, 1],
  ["--vic-fan", "ロックした7枚を扇状に見せる（0=出さない / 1=出す）", 0, 1, 1, 1],
];

// プリセット（チャッピー案の4種）。値は CSS変数そのもの。
const PRESETS = {
  標準版: {},
  短縮版: { "--vic-speed": 2.2, "--vic-hold": 0.5, "--vic-fan": 0 },
  派手版: { "--vic-stream": 1.8, "--vic-pulse-power": 1.6, "--vic-residue": 2, "--vic-shake": 1.6, "--vic-speed": 0.85 },
  軽量版: { "--vic-stream": 0.35, "--vic-residue": 0.3, "--vic-shake": 0, "--vic-speed": 1.6, "--vic-fan": 0 },
};

const STAGES = ["WAIT", "COLORS", "GATHER", "PULSE", "FLASH", "VICTORY", "RESULT"];

function readVar(key, fb) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(key));
  return Number.isFinite(v) ? v : fb;
}
function setVar(key, value) {
  document.documentElement.style.setProperty(key, String(value));
}

export function openVictoryPreview() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "victory-preview";

  const panel = document.createElement("div");
  panel.className = "victory-preview-panel";

  const head = document.createElement("div");
  head.className = "victory-preview-head";
  const title = document.createElement("div");
  title.className = "victory-preview-title";
  title.textContent = "🏆 勝利演出シミュレーター";
  const close = document.createElement("button");
  close.type = "button";
  close.className = "victory-preview-close";
  close.textContent = "✕";
  close.addEventListener("click", closePreview);
  head.append(title, close);

  // --- 現在の段 ---------------------------------------------------------------
  const stageRow = document.createElement("div");
  stageRow.className = "victory-preview-stages";
  const stageEls = {};
  for (const name of STAGES) {
    const chip = document.createElement("span");
    chip.className = "victory-preview-stage";
    chip.textContent = name;
    stageEls[name] = chip;
    stageRow.appendChild(chip);
  }
  vc().then((m) => m.setVictoryStageListener((name) => {
    for (const [k, el] of Object.entries(stageEls)) el.classList.toggle("is-current", k === name);
  }));

  // --- 勝者の選択 --------------------------------------------------------------
  const who = document.createElement("div");
  who.className = "victory-preview-row";
  const whoLabel = document.createElement("span");
  whoLabel.textContent = "勝者";
  const whoSel = document.createElement("select");
  const active = getState().activePlayers?.length ? getState().activePlayers : SEAT_ORDER;
  for (const seat of active) {
    const opt = document.createElement("option");
    opt.value = seat;
    opt.textContent = SEAT_LABELS[seat] ?? seat;
    whoSel.appendChild(opt);
  }
  who.append(whoLabel, whoSel);

  // --- 再生ボタン --------------------------------------------------------------
  const play = document.createElement("div");
  play.className = "victory-preview-play";
  const status = document.createElement("span");
  status.className = "victory-preview-status";
  const mkPlay = (label, speedMul) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", async () => {
      const m = await vc();
      if (m.isVictoryCelebrationRunning()) return;
      const before = readVar("--vic-speed", 1);
      if (speedMul !== 1) setVar("--vic-speed", before * speedMul);
      status.textContent = "再生中…";
      overlay.classList.add("is-playing"); // パネルを薄くして演出を見せる
      try {
        const res = await m.playVictoryCelebration(whoSel.value, { keepWhite: false });
        res?.dismiss?.();
      } finally {
        if (speedMul !== 1) setVar("--vic-speed", before);
        overlay.classList.remove("is-playing");
        status.textContent = "";
        for (const el of Object.values(stageEls)) el.classList.remove("is-current");
      }
    });
    return b;
  };
  play.append(mkPlay("▶ 再生", 1), mkPlay("0.5倍", 0.5), mkPlay("1.5倍", 1.5), status);

  // --- プリセット --------------------------------------------------------------
  const presetRow = document.createElement("div");
  presetRow.className = "victory-preview-row";
  const presetLabel = document.createElement("span");
  presetLabel.textContent = "プリセット";
  presetRow.appendChild(presetLabel);
  for (const [name, values] of Object.entries(PRESETS)) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    b.addEventListener("click", () => {
      // まず全部を既定へ戻してから、プリセットの差分だけ当てる
      for (const [key, , , , , fb] of SLIDERS) setVar(key, fb);
      for (const [key, v] of Object.entries(values)) setVar(key, v);
      refreshSliders();
    });
    presetRow.appendChild(b);
  }

  // --- スライダー --------------------------------------------------------------
  const body = document.createElement("div");
  body.className = "victory-preview-body";
  const inputs = [];
  for (const [key, label, min, max, step, fb] of SLIDERS) {
    const row = document.createElement("label");
    row.className = "victory-preview-slider";
    const name = document.createElement("span");
    name.className = "victory-preview-slider-label";
    name.textContent = label;
    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(readVar(key, fb));
    const val = document.createElement("span");
    val.className = "victory-preview-slider-value";
    val.textContent = input.value;
    input.addEventListener("input", () => {
      setVar(key, input.value);
      val.textContent = input.value;
    });
    inputs.push({ key, input, val, fb });
    row.append(name, input, val);
    body.appendChild(row);
  }
  function refreshSliders() {
    for (const { key, input, val, fb } of inputs) {
      input.value = String(readVar(key, fb));
      val.textContent = input.value;
    }
  }

  // --- 出力 --------------------------------------------------------------------
  const foot = document.createElement("div");
  foot.className = "victory-preview-foot";
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = "設定をコピー（JSON）";
  copyBtn.addEventListener("click", async () => {
    const out = {};
    for (const [key, , , , , fb] of SLIDERS) out[key] = readVar(key, fb);
    const text = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "コピーしました！";
    } catch (e) {
      copyBtn.textContent = "コピー失敗（下を手動で選択）";
      outEl.style.display = "block";
      outEl.value = text;
    }
    setTimeout(() => (copyBtn.textContent = "設定をコピー（JSON）"), 1600);
  });
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.textContent = "既定に戻す";
  resetBtn.addEventListener("click", () => {
    for (const [key] of SLIDERS) document.documentElement.style.removeProperty(key);
    refreshSliders();
  });
  const outEl = document.createElement("textarea");
  outEl.className = "victory-preview-out";
  outEl.style.display = "none";
  foot.append(copyBtn, resetBtn);

  panel.append(head, stageRow, who, play, presetRow, body, foot, outEl);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}

export function closePreview() {
  vcMod?.setVictoryStageListener?.(null);
  overlay?.remove();
  overlay = null;
}
