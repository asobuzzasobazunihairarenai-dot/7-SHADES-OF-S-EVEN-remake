// プレイヤーの表示名・アバターを管理する。名前はいつでも自由に変更できる（デフォルトは
// board-layout.jsのSEAT_LABELS）。アバターは実物の画像素材（画像素材/アバター/アバター1、
// 7色×正面/左向き/右向きの3方向）をassets/avatars/${color}-{front,left,right}.pngとして
// コピーして使う（他の実物画像素材と同じ理由でgit管理外、.gitignoreの/assets/avatars/参照）。
// 以前の絵文字ダミーセットは撤去した。
// 座席(A/B/C/D)ごとに保持するだけで、誰がどのプレイヤーかという実データ（state.jsの
// activePlayers/turnPlayer等）とは独立している——名前やアバターを変えてもゲームの
// 進行ロジックには一切影響しない、純粋に表示用の情報だから。
//
// オンライン対戦では、他プレイヤーの名前・アバターは自分のブラウザのローカル推測値では
// なく、online.jsが同期取得した座席ロスター（getSyncedIdentity）を優先する。自分自身の
// 変更は、今まで通りローカル状態を即座に更新した上で、online.jsのupdateMyIdentity()経由で
// サーバーへも書き込む。呼び出し側（main.js・game-setup.js・gate-invasion.js・
// hand-announcer.js・victory.js）は一切変更不要——このモジュール内にオンライン対応を
// 閉じ込める設計。

import { SEAT_LABELS, SEAT_ORDER } from "./board-layout.js";
import { isOnlineMode, getSelfSeat, getSyncedIdentity, updateMyIdentity } from "./online.js";

// 色ごとに正面(front)・左向き(left)・右向き(right)の3バリエーションが用意されている
// （画像素材/アバター/アバター1参照）。「そのプレイヤーが選んだアバター」の正規の値としては
// 常にfront版を保持し、実際に表示する場所（盤面上の席・ステータスエリア等）に応じた
// 向きの差し替えはavatar-render.jsのgetAvatarVariant()で行う。
const AVATAR_COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];
export const AVATAR_OPTIONS = AVATAR_COLORS.map((color) => `assets/avatars/${color}-front.png`);

const DEFAULT_AVATARS = {
  A: "assets/avatars/red-front.png",
  B: "assets/avatars/orange-front.png",
  C: "assets/avatars/yellow-front.png",
  D: "assets/avatars/green-front.png",
};

let customNames = {};
let avatars = { ...DEFAULT_AVATARS };

export function getPlayerName(seat) {
  if (isOnlineMode()) {
    const synced = getSyncedIdentity(seat)?.name;
    if (synced) return synced;
  }
  return customNames[seat] || SEAT_LABELS[seat];
}

export function setPlayerName(seat, name) {
  const trimmed = name.trim();
  customNames[seat] = trimmed || null;
  if (seat === getSelfSeat()) {
    updateMyIdentity({ name: trimmed || null }).catch((err) => console.error("updateMyIdentity failed", err));
  }
}

export function getPlayerAvatar(seat) {
  if (isOnlineMode()) {
    const synced = getSyncedIdentity(seat)?.avatar;
    if (synced) return synced;
  }
  return avatars[seat] || DEFAULT_AVATARS[seat];
}

export function setPlayerAvatar(seat, avatar) {
  avatars[seat] = avatar;
  if (seat === getSelfSeat()) {
    updateMyIdentity({ avatar }).catch((err) => console.error("updateMyIdentity failed", err));
  }
}

// 全座席分まとめて必要になる場面（アバター一括描画等）向けの便利関数。
export function getAllSeats() {
  return SEAT_ORDER;
}
