// プレイヤーの表示名・アバターを管理する。名前はいつでも自由に変更できる（デフォルトは
// board-layout.jsのSEAT_LABELS）。アバターは今のところ、画像素材を用意していないので
// 絵文字のダミーセットから選ぶだけの簡易実装（AVATAR_OPTIONS）。
// 座席(A/B/C/D)ごとに保持するだけで、誰がどのプレイヤーかという実データ（state.jsの
// activePlayers/turnPlayer等）とは独立している——名前やアバターを変えてもゲームの
// 進行ロジックには一切影響しない、純粋に表示用の情報だから。

import { SEAT_LABELS, SEAT_ORDER } from "./board-layout.js";

export const AVATAR_OPTIONS = ["🦊", "🐸", "🐙", "🦉", "🐲", "🦄", "🐧", "🦁", "🐺", "🐢", "🐬", "🦋"];

const DEFAULT_AVATARS = { A: "🦊", B: "🐸", C: "🐙", D: "🦉" };

let customNames = {};
let avatars = { ...DEFAULT_AVATARS };

export function getPlayerName(seat) {
  return customNames[seat] || SEAT_LABELS[seat];
}

export function setPlayerName(seat, name) {
  const trimmed = name.trim();
  customNames[seat] = trimmed || null;
}

export function getPlayerAvatar(seat) {
  return avatars[seat] || DEFAULT_AVATARS[seat];
}

export function setPlayerAvatar(seat, avatar) {
  avatars[seat] = avatar;
}

// 全座席分まとめて必要になる場面（アバター一括描画等）向けの便利関数。
export function getAllSeats() {
  return SEAT_ORDER;
}
