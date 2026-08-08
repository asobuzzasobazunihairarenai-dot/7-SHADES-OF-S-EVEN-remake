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

// --- AFK時のCPU代行（ユーザー要望2026-08-08） ------------------------------------------------
// タイマーが連続で規定回数タイムアップしたプレイヤーを、そのプレイヤー自身の端末が疑似CPUに
// 切り替えて代行する（本人が接続中で放置＝AFKのケースが主対象）。本人には「CPUに切替中です。
// 復帰しますか？」を表示し、押せば操作権が戻る。回数のしきい値・代行CPUの強さは管理者だけが
// 基本設定から変更できる（下のgetter/setter、options-menu.jsで管理者にだけ表示）。
// 実際の駆動は main.js の isCpuBrainDriving がこの isSelfCpuSubstituted() を見て行う。
const AFK_ENABLED_KEY = "so7-afk-cpu-enabled"; // 'on' | 'off'
const AFK_THRESHOLD_KEY = "so7-afk-cpu-threshold"; // 連続タイムアップ回数
const AFK_DIFFICULTY_KEY = "so7-afk-cpu-difficulty"; // 代行CPUの強さ（DIFFICULTIESのいずれか）
let afkEnabled = true;
let afkThreshold = 3;
let afkDifficulty = "intermediate";
try {
  if (localStorage.getItem(AFK_ENABLED_KEY) === "off") afkEnabled = false;
  const t = parseInt(localStorage.getItem(AFK_THRESHOLD_KEY) || "", 10);
  if (Number.isFinite(t) && t >= 1 && t <= 20) afkThreshold = t;
  const d = localStorage.getItem(AFK_DIFFICULTY_KEY);
  if (d && DIFFICULTIES.includes(d)) afkDifficulty = d;
} catch {
  /* 既定値で動く */
}
export function isAfkCpuTakeoverEnabled() {
  return afkEnabled;
}
export function setAfkCpuTakeoverEnabled(v) {
  afkEnabled = !!v;
  try {
    localStorage.setItem(AFK_ENABLED_KEY, afkEnabled ? "on" : "off");
  } catch {}
}
export function getAfkTimeoutThreshold() {
  return afkThreshold;
}
export function setAfkTimeoutThreshold(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v) || v < 1 || v > 20) return;
  afkThreshold = v;
  try {
    localStorage.setItem(AFK_THRESHOLD_KEY, String(v));
  } catch {}
}
export function getAfkCpuDifficulty() {
  return afkDifficulty;
}
export function setAfkCpuDifficulty(v) {
  if (!DIFFICULTIES.includes(v)) return;
  afkDifficulty = v;
  try {
    localStorage.setItem(AFK_DIFFICULTY_KEY, v);
  } catch {}
}

// 自席がAFK代行中か（このクライアント自身の状態。オンラインでも自分の席だけを対象にする）。
let selfCpuSubstituted = false;
// 連続タイムアップ回数（手動操作でリセット）。
let consecutiveTimeouts = 0;
export function isSelfCpuSubstituted() {
  return selfCpuSubstituted;
}
export function setSelfCpuSubstituted(v) {
  selfCpuSubstituted = !!v;
  if (!selfCpuSubstituted) consecutiveTimeouts = 0;
}
export function getConsecutiveTimeouts() {
  return consecutiveTimeouts;
}
// 自席のタイムアップを1回記録。しきい値に達したらtrue（＝代行開始すべき）を返す。
export function recordSelfTimeout() {
  consecutiveTimeouts += 1;
  return afkEnabled && consecutiveTimeouts >= afkThreshold;
}
// 手動操作があった（＝本人在席）のでカウンタをリセット。代行中は解除しない（復帰ボタン専用）。
export function resetTimeoutStreak() {
  consecutiveTimeouts = 0;
}

// 実効の難易度（AFK代行中はAFK用の強さ、それ以外はCPU戦の強さ）。cpu-brain.jsが使う思考レベルの
// 判定（isCpuBrainSmart/isCpuPeekAllowed/isCpuOpponentAware）はこれを基準にするので、代行中は
// 自動的にAFK用の強さで指す。
function activeDifficulty() {
  return selfCpuSubstituted ? afkDifficulty : cpuDifficulty;
}
// 賢い思考を使うか（新人以外）。
export function isCpuBrainSmart() {
  return activeDifficulty() !== "rookie";
}
// 非公開情報（伏せカード等）ののぞき見を許すか（最強のみ）。
export function isCpuPeekAllowed() {
  return activeDifficulty() === "master";
}
// 相手プレイヤーの状況を考慮するか（上級以上）。
export function isCpuOpponentAware() {
  return activeDifficulty() === "advanced" || activeDifficulty() === "master";
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

// ユーザー要望2026-08-08: 対戦ロビーの「🤖 疑似CPUモード（テスト用）を使う」チェックボックスは
// いったん不要なので、管理者モードで表示/非表示を切り替えられるように。既定は非表示。
// この端末のみの設定（localStorage）。leafモジュール(cpu-battle-state.js)に置くことで、
// online-ui.js（表示側）と admin.js（切替UI側）の両方から循環importなしに参照できる。
const LOBBY_PSEUDO_CPU_TOGGLE_KEY = "so7-lobby-pseudo-cpu-toggle-visible";
let lobbyPseudoCpuToggleVisible = false;
try {
  lobbyPseudoCpuToggleVisible = localStorage.getItem(LOBBY_PSEUDO_CPU_TOGGLE_KEY) === "1";
} catch {
  /* 読めなくても既定(非表示)で動く */
}
export function isLobbyPseudoCpuToggleVisible() {
  return lobbyPseudoCpuToggleVisible;
}
export function setLobbyPseudoCpuToggleVisible(v) {
  lobbyPseudoCpuToggleVisible = !!v;
  try {
    localStorage.setItem(LOBBY_PSEUDO_CPU_TOGGLE_KEY, v ? "1" : "0");
  } catch {
    /* 保存できなくてもそのセッションでは効く */
  }
}
