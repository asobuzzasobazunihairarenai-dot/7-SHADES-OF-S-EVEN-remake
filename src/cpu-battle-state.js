// ローカル1人用「CPU戦」の状態＋設定を持つ、依存ゼロの極小モジュール。
// 進行中フラグ（isCpuBattleActive）を phase-automation.js / main.js / turn-timer.js が参照して
// 「今のターンプレイヤー(CPU)も自動処理で駆動するか」「CPUの1手ごとの持ち時間」等を判断する。
// cpu-battle.js 本体は game-setup.js 等を import するため、そこから直接 import すると循環参照に
// なり得る。フラグと設定だけをここに切り出し、何も import しないことで循環を断つ。
// 設定は端末に保存する好み（localStorage）。オプションの基本設定から変更できる。

let active = false;

export function isCpuBattleActive() {
  return active;
}

export function setCpuBattleActive(v) {
  active = !!v;
}

// --- CPUの速さ（1手ごとの「考える間」＝疑似CPUの持ち時間） ---------------------------------
// ユーザー要望「CPUの行動が早すぎて（ザ・ギャンブル等の）モーダルが読み取れない。速度を
// ゆっくり／普通／早いで選べるようにしたい」。値は「CPUがその席で1手打つまでの持ち時間(ms)」で、
// 長いほどモーダルをゆっくり読める。turn-timer.js の freshBaseDeadlineFor がCPU戦のCPU席に対して
// この値を使う（通常の疑似CPU deadline の代わり）。
const SPEED_KEY = "so7-cpu-battle-speed"; // 'slow' | 'normal' | 'fast'
const SPEED_MS = { slow: 3200, normal: 1500, fast: 700 };

let cpuSpeed = "normal";
try {
  const saved = localStorage.getItem(SPEED_KEY);
  if (saved && SPEED_MS[saved]) cpuSpeed = saved;
} catch {
  /* localStorageが使えなくても既定値で動く */
}

export function getCpuSpeed() {
  return cpuSpeed;
}
export function setCpuSpeed(v) {
  if (!SPEED_MS[v]) return;
  cpuSpeed = v;
  try {
    localStorage.setItem(SPEED_KEY, v);
  } catch {
    /* 保存できなくてもそのセッションでは効く */
  }
}
// CPUの1手ごとの持ち時間(ms)。speedに応じて返す。
export function getCpuStepDeadlineMs() {
  return SPEED_MS[cpuSpeed] ?? SPEED_MS.normal;
}
