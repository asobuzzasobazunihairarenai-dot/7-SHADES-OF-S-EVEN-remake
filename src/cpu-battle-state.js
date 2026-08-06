// ローカル1人用「CPU戦」が進行中かどうかのフラグだけを持つ、依存ゼロの極小モジュール。
// これを phase-automation.js / main.js が参照して「今のターンプレイヤー(CPU)も自動処理で
// 駆動するかどうか」を判断する。cpu-battle.js 本体は game-setup.js 等を import するため、
// phase-automation.js から直接 import すると循環参照になり得る。フラグだけをここに切り出し、
// 何も import しないことで循環を断つ。

let active = false;

export function isCpuBattleActive() {
  return active;
}

export function setCpuBattleActive(v) {
  active = !!v;
}
