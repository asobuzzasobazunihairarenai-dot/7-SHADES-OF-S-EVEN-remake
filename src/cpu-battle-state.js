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

// --- CPU自動スキップ ON/OFF ＋ 手動送りの1手チケット -----------------------------------
// ユーザー要望「CPUの行動が速すぎて読み取れない（特にザ・ギャンブル）。適当な場所を
// クリックするまでCPUのモーダルを進めない仕様がほしい」。ONなら従来通りCPUがモーダルを
// 自動で進める。OFFなら、CPUのモーダルは画面クリックで「1手ずつ」進む。
// 実装: main.js の performPriorityTimeoutAutoAction のモーダル解決(branch①)を、OFF時は
// 「チケットが1枚あるときだけ」解決するように門番する。画面クリックで1枚発券(releaseCpuStep)、
// モーダル1つ解決するごとに1枚消費(consumeCpuStep)。移動やロック等モーダル以外は従来通り。
const AUTOSKIP_KEY = "so7-cpu-battle-autoskip"; // 'on' | 'off'
let autoSkip = true;
try {
  if (localStorage.getItem(AUTOSKIP_KEY) === "off") autoSkip = false;
} catch {
  /* 使えなくても既定(ON)で動く */
}
export function isCpuAutoSkipEnabled() {
  return autoSkip;
}
export function setCpuAutoSkipEnabled(v) {
  autoSkip = !!v;
  try {
    localStorage.setItem(AUTOSKIP_KEY, autoSkip ? "on" : "off");
  } catch {
    /* 保存できなくてもそのセッションでは効く */
  }
  if (autoSkip) stepTicket = false; // ONに戻したら未消費チケットは破棄
}

// --- CPUの強さ（思考レベル） -----------------------------------------------------------
// ユーザー要望2026-08-07「CPUを賢くしたい。現状の完全ランダムを『新人』とし、段階的に
// 強くする。最上位の『最強』だけは伏せカードののぞき見OK」。
//   rookie（新人）     : 現状どおり完全ランダム（既存の疑似CPU挙動）。
//   intermediate（中級）: 移動先を評価（相手ゲート侵攻・自分がまだ必要な色・自滅カード回避）。
//   advanced（上級）    : 中級＋相手の進行度を見て接触で妨害する等の相手考慮。
//   master（最強）      : 上級＋伏せカードののぞき見（非公開情報も使って最善手を選ぶ）。
// 実際の手選びは cpu-brain.js が担当し、performPriorityTimeoutAutoAction（main.js）から使う。
const DIFFICULTY_KEY = "so7-cpu-battle-difficulty"; // 'rookie' | 'intermediate' | 'advanced' | 'master'
const DIFFICULTIES = ["rookie", "intermediate", "advanced", "master"];
let cpuDifficulty = "rookie";
try {
  const saved = localStorage.getItem(DIFFICULTY_KEY);
  if (saved && DIFFICULTIES.includes(saved)) cpuDifficulty = saved;
} catch {
  /* localStorageが使えなくても既定(新人)で動く */
}
export function getCpuDifficulty() {
  return cpuDifficulty;
}
export function setCpuDifficulty(v) {
  if (!DIFFICULTIES.includes(v)) return;
  cpuDifficulty = v;
  try {
    localStorage.setItem(DIFFICULTY_KEY, v);
  } catch {
    /* 保存できなくてもそのセッションでは効く */
  }
}
// 賢い思考を使うか（新人以外）。
export function isCpuBrainSmart() {
  return cpuDifficulty !== "rookie";
}
// 非公開情報（伏せカード等）ののぞき見を許すか（最強のみ）。
export function isCpuPeekAllowed() {
  return cpuDifficulty === "master";
}
// 相手プレイヤーの状況を考慮するか（上級以上）。
export function isCpuOpponentAware() {
  return cpuDifficulty === "advanced" || cpuDifficulty === "master";
}

let stepTicket = false;
export function releaseCpuStep() {
  stepTicket = true;
}
export function consumeCpuStep() {
  if (stepTicket) {
    stepTicket = false;
    return true;
  }
  return false;
}
