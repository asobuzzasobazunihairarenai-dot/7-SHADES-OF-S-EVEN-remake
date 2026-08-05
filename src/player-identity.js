// プレイヤーの表示名・アバターを管理する。名前はいつでも自由に変更できる（デフォルトは
// board-layout.jsのSEAT_LABELS）。アバターは実物の画像素材（画像素材/アバター/アバター1、
// 7色×正面/左向き/右向きの3方向）をassets/avatars/${color}-{front,left,right}.webpとして
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
// 追加アバター「各国の国王」（ユーザー提供、画像素材/アバター/各国の国王）。既存の色アバターと
// 同じ命名規約（{base}-{front|left|right}.webp、覚醒=-awakened / 激昂=-enraged 接尾辞）に
// リネームして assets/avatars/ へ配置済みなので、avatar-render.js の getAvatarVariant /
// getAwakenedVariant / getEnragedVariant がそのまま向き・状態を導出できる。選択肢の正規値は
// 常に front 版。
const KING_AVATARS = [
  "avatar-red-king",
  "avatar-orange-fox-king",
  "avatar-yellow-light-king",
  "avatar-green-forest-king",
  "avatar-blue-ice-sea-king",
  "avatar-pink-queen",
  "avatar-purple-elder-queen",
];
const KING_AVATAR_LABELS = {
  "avatar-red-king": "赤の国王",
  "avatar-orange-fox-king": "橙の国王",
  "avatar-yellow-light-king": "黄の国王",
  "avatar-green-forest-king": "緑の国王",
  "avatar-blue-ice-sea-king": "青の国王",
  "avatar-pink-queen": "桃の女王",
  "avatar-purple-elder-queen": "紫の女王",
};
// 謎めいた案内人 エイドス・ノワール（1キャラ・有料500、ユーザー指定）。
const EIDOS_NOIR = "eidos-noir";

export const AVATAR_OPTIONS = [
  ...AVATAR_COLORS.map((color) => `assets/avatars/${color}-front.webp`),
  ...KING_AVATARS.map((k) => `assets/avatars/${k}-front.webp`),
  `assets/avatars/${EIDOS_NOIR}-front.webp`,
];

// 有料アバター base → { label, cost }。国王は各200、エイドス・ノワールは500（ユーザー指定）。
// 表示名は中立的に（メモリ[[king-enraged-avatar-source-gaps]]の通りbasenameと絵柄が食い違う
// ことがあるため細かな呼称は避ける）。
const PAID_AVATARS = {
  ...Object.fromEntries(KING_AVATARS.map((b) => [b, { label: KING_AVATAR_LABELS[b] || b, cost: 200 }])),
  [EIDOS_NOIR]: { label: "謎めいた案内人 エイドス・ノワール", cost: 500 },
};

// 特殊アバター「記憶を失った青年」（無料）。ユーザー指定で、選んだプレイヤーの駒の色に
// 合わせて青年の色が変わる。実体は座席ごとに解決するためセンチネル値で保持する
// （resolveAvatarValue参照）。駒の色は座席で固定（state.jsのPIECE_START順）。
export const PROTAGONIST_AVATAR = "protagonist";
const SEAT_PIECE_COLOR = { A: "red", B: "orange", C: "yellow", D: "green" };
export function protagonistPathForSeat(seat) {
  return `assets/avatars/protagonist-${SEAT_PIECE_COLOR[seat] || "gray"}-front.webp`;
}
// センチネル（"protagonist"）を、その座席の駒の色に対応する実際の画像パスへ解決する。
// それ以外の値（通常のパス・Google画像・絵文字等）はそのまま返す。
export function resolveAvatarValue(seat, raw) {
  return raw === PROTAGONIST_AVATAR ? protagonistPathForSeat(seat) : raw;
}

// アバター相対パスから base名（.../{base}-front.webp → base）を取り出す。
function avatarBaseOf(avatar) {
  const m = typeof avatar === "string" && avatar.match(/\/([^/]+)-front\.webp$/);
  return m ? m[1] : null;
}
// アバター相対パス → ショップのitemKey（有料アバターだけ非null）。色アバター・青年・
// アップロード画像・Googleプロフィール画像はnull（無料・ロック不要）。
export function getAvatarItemKey(avatar) {
  const base = avatarBaseOf(avatar);
  return base && PAID_AVATARS[base] ? `avatar:${base}` : null;
}
// そのアバターの価格（有料なら数値、無料ならnull）。ピッカーのロックバッジ表示に使う。
export function getAvatarCost(avatar) {
  const base = avatarBaseOf(avatar);
  return base && PAID_AVATARS[base] ? PAID_AVATARS[base].cost : null;
}
// ショップ（shop-content.jsの「アバター」カテゴリ）へ渡す商品一覧（有料アバターのみ）。
export function getAvatarShopItems() {
  return Object.entries(PAID_AVATARS).map(([base, info]) => ({
    itemKey: `avatar:${base}`,
    label: info.label,
    cost: info.cost,
    imagePath: `assets/avatars/${base}-front.webp`,
  }));
}

const DEFAULT_AVATARS = {
  A: "assets/avatars/red-front.webp",
  B: "assets/avatars/orange-front.webp",
  C: "assets/avatars/yellow-front.webp",
  D: "assets/avatars/green-front.webp",
};

let customNames = {};
let avatars = { ...DEFAULT_AVATARS };

export function getPlayerName(seat) {
  if (isOnlineMode()) {
    const synced = getSyncedIdentity(seat)?.name;
    if (synced) return synced;
    // オンライン中、自分以外の座席はローカルの customNames[]（＝この端末で入力した値）に
    // フォールバックしない。過去のゲームで自分がこの座席に座っていた等で自分の名前が
    // 残っていると、相手が未設定・ロスター未取得の一瞬にその名前が相手の枠へ漏れる
    // （getPlayerAvatarと同根の不具合）。同期値が無ければ座席ラベルを返す。
    if (seat !== getSelfSeat()) return SEAT_LABELS[seat];
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

// 保存されている生のアバター値（画像パス or センチネル"protagonist" or Google画像URL等）。
// ピッカーの選択判定（青年センチネルが選ばれているか）に使う。
export function getRawPlayerAvatar(seat) {
  if (isOnlineMode()) {
    const synced = getSyncedIdentity(seat)?.avatar;
    if (synced) return synced;
    // オンライン中、自分以外の座席はローカルの avatars[]（＝この端末で自分が選んだ値）に
    // フォールバックしない。avatarsは座席キーで、getSelfSeat()が過去のゲーム/待機中の
    // プレビュー座席と変わると、以前の自分の座席キーに自分のアバターが残る。相手が
    // 未設定・ロスター未取得の一瞬にそのキーへ相手の描画がフォールバックすると、相手の
    // 枠へ「自分のアバター」が漏れて表示される（ユーザー報告「相手のアバターが自分の
    // アバターになっている時がある」の原因）。同期値が無ければその座席の既定色を返す。
    if (seat !== getSelfSeat()) return DEFAULT_AVATARS[seat] || DEFAULT_AVATARS.A;
  }
  return avatars[seat] || DEFAULT_AVATARS[seat];
}
// 実際に描画に使うアバター（センチネル"protagonist"はその座席の駒の色の画像へ解決する）。
export function getPlayerAvatar(seat) {
  return resolveAvatarValue(seat, getRawPlayerAvatar(seat));
}

export function setPlayerAvatar(seat, avatar) {
  avatars[seat] = avatar;
  if (seat === getSelfSeat()) {
    updateMyIdentity({ avatar }).catch((err) => console.error("updateMyIdentity failed", err));
  }
  // ユーザー報告「アバターを変更してもマイページの巨大アバターが変わらない」。アバター変更を
  // 各所（盤面render・マイページ）へ即通知する。avatars[seat]は上で同期的に更新済みなので、
  // これを受けて getPlayerAvatar() を読めば新しい値が返る。
  window.dispatchEvent(new CustomEvent("admin:change"));
}

// 全座席分まとめて必要になる場面（アバター一括描画等）向けの便利関数。
export function getAllSeats() {
  return SEAT_ORDER;
}
