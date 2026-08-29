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
import { t } from "./ui-text.js"; // UI英語化フェーズ6（既定の座席名「プレイヤーA」→「Player A」）
import { isOnlineMode, getSelfSeat, getSyncedIdentity, updateMyIdentity } from "./online.js";
import { getState } from "./state.js";

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
  "avatar-red-king": "avatarName.red",
  "avatar-orange-fox-king": "avatarName.orange",
  "avatar-yellow-light-king": "avatarName.yellow",
  "avatar-green-forest-king": "avatarName.green",
  "avatar-blue-ice-sea-king": "avatarName.blue",
  "avatar-pink-queen": "avatarName.pink",
  "avatar-purple-elder-queen": "avatarName.purple",
};
export const AVATAR_OPTIONS = [
  ...AVATAR_COLORS.map((color) => `assets/avatars/${color}-front.webp`),
  ...KING_AVATARS.map((k) => `assets/avatars/${k}-front.webp`),
  // エイドス・ノワールはショップ/アバター選択肢から除外（NPC専用。ユーザー要望2026-08-09）。
  // チュートリアルは tutorial-battle.js が画像パスを直接使うため、この除外の影響を受けない。
];

// 有料アバター base → { label, cost }。国王は各200、エイドス・ノワールは500（ユーザー指定）。
// 表示名は中立的に（メモリ[[king-enraged-avatar-source-gaps]]の通りbasenameと絵柄が食い違う
// ことがあるため細かな呼称は避ける）。
const PAID_AVATARS = {
  ...Object.fromEntries(KING_AVATARS.map((b) => [b, { label: KING_AVATAR_LABELS[b] ? t(KING_AVATAR_LABELS[b]) : b, cost: 200 }])),
};

// 特殊アバター「記憶を失った青年」（無料）。ユーザー指定で、選んだプレイヤーの駒の色に
// 合わせて青年の色が変わる。実体は座席ごとに解決するためセンチネル値で保持する
// （resolveAvatarValue参照）。
export const PROTAGONIST_AVATAR = "protagonist";
// ユーザー要望「青年アバターは、ゲーム開始前は灰色、開始後は自分のファーストカードの色に
// なる」。この色＝その座席の駒の色で、駒はstate.jsのSETUP_ASSIGN_FIRST_CARDSで
// 「配られたファーストカードと同色（piece.color=def.color）」として初めて作られる。
// 座席固定の色（A=赤…）ではなく、ランダムに配られた実際の色を反映するのが正しい
// （座席Aでも青のファーストカードなら青の青年になる）。よって：
//   ・自分（その座席）に紐づく駒がまだ盤上に無い＝ゲーム開始前 → 灰色（gray）
//   ・駒があれば → その駒の色（＝ファーストカードの色）
// getState()は実行時にだけ呼ぶ（モジュール評価時には呼ばない）ので、state.jsとの
// import順による初期化(TDZ)問題は起きない。
function protagonistColorForSeat(seat) {
  try {
    const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === seat);
    if (piece && piece.color) return piece.color;
  } catch {
    /* state未初期化などは灰色にフォールバック */
  }
  return "gray";
}
export function protagonistPathForSeat(seat) {
  return `assets/avatars/protagonist-${protagonistColorForSeat(seat)}-front.webp`;
}

// 「（基本）託された者たち」アバター（基本7色アバター＝assets/avatars/${color}-front.webp）。
// ユーザー要望2026-08-09「CPU戦のCPUアバターは、CPUのファーストカードの色によって
// 『（基本）託された者たち』のアバターにしたい」への対応。青年（PROTAGONIST_AVATAR）と全く
// 同じく、その座席の駒の色（＝配られたファーストカードの色）に描画時へ解決するセンチネル。
// 色アバターは覚醒/激昂・左右向きのバリエーションも揃っている（avatar-render.jsが導出）。
export const ENTRUSTED_AVATAR = "entrusted";
export function entrustedPathForSeat(seat) {
  const color = protagonistColorForSeat(seat); // 駒の色。駒がまだ無ければ "gray"
  if (AVATAR_COLORS.includes(color)) return `assets/avatars/${color}-front.webp`;
  // 駒がまだ配られていない（色未確定）一瞬のプレースホルダ。基本セットに gray は無いため、
  // 中立的な青年の灰色を流用する（駒が置かれ次第、上の色アバターへ解決される）。
  return "assets/avatars/protagonist-gray-front.webp";
}
// センチネル（"protagonist"／"entrusted"）を、その座席の駒の色に対応する実際の画像パスへ
// 解決する。それ以外の値（通常のパス・Google画像・絵文字等）はそのまま返す。
export function resolveAvatarValue(seat, raw) {
  if (raw === PROTAGONIST_AVATAR) return protagonistPathForSeat(seat);
  if (raw === ENTRUSTED_AVATAR) return entrustedPathForSeat(seat);
  return raw;
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

// ユーザー要望2026-08-07「アバターのデフォを『記憶を失った青年』に」。全席の既定を青年
// （PROTAGONIST_AVATARセンチネル）にする。getPlayerAvatar→resolveAvatarValueが、その席の
// 駒の色（ゲーム開始前は灰色）の画像へ解決する。未選択のユーザー・座席はこれが既定になる。
const DEFAULT_AVATARS = {
  A: PROTAGONIST_AVATAR,
  B: PROTAGONIST_AVATAR,
  C: PROTAGONIST_AVATAR,
  D: PROTAGONIST_AVATAR,
};

let customNames = {};
let avatars = { ...DEFAULT_AVATARS };

// ローカル（アカウント未ログイン）で名前・アバターを変更しても再起動で「プレイヤーA」等の既定に
// 戻ってしまう不具合への対応。名前・アバターを localStorage にも保存し、起動時に復元する。
// ログイン時は online.js の loadMyPreferences が so7_user_profiles の値で上書きする（アカウントが
// 優先＝端末をまたいで引き継がれる）。localStorage はあくまで「この端末のローカルなフォールバック」。
const STORE_NAMES = "so7-player-names";
const STORE_AVATARS = "so7-player-avatars";
(function loadLocalIdentity() {
  try {
    const n = JSON.parse(localStorage.getItem(STORE_NAMES) || "null");
    if (n && typeof n === "object") customNames = { ...n };
  } catch {
    /* 破損時は既定のまま */
  }
  try {
    const a = JSON.parse(localStorage.getItem(STORE_AVATARS) || "null");
    if (a && typeof a === "object") avatars = { ...DEFAULT_AVATARS, ...a };
  } catch {
    /* 破損時は既定のまま */
  }
})();
function saveLocalNames() {
  try {
    localStorage.setItem(STORE_NAMES, JSON.stringify(customNames));
  } catch {
    /* 保存不可でもその場の値は効く */
  }
}
function saveLocalAvatars() {
  try {
    localStorage.setItem(STORE_AVATARS, JSON.stringify(avatars));
  } catch {
    /* 保存不可でもその場の値は効く */
  }
}

// 名前を設定していない座席の既定表示名。board-layout.jsのSEAT_LABELSは「日本語の原文」で、
// 座席の識別子としてコード内でも使われているため、そちらは触らずここで表示用に翻訳する
// （英語なら "Player A"）。プレイヤーが自分で付けた名前(customNames/同期値)はそのまま尊重する。
function defaultSeatLabel(seat) {
  return t("game.seat", { seat }) || SEAT_LABELS[seat];
}

export function getPlayerName(seat) {
  if (isOnlineMode()) {
    const synced = getSyncedIdentity(seat)?.name;
    if (synced) return synced;
    // オンライン中、自分以外の座席はローカルの customNames[]（＝この端末で入力した値）に
    // フォールバックしない。過去のゲームで自分がこの座席に座っていた等で自分の名前が
    // 残っていると、相手が未設定・ロスター未取得の一瞬にその名前が相手の枠へ漏れる
    // （getPlayerAvatarと同根の不具合）。同期値が無ければ座席ラベルを返す。
    if (seat !== getSelfSeat()) return defaultSeatLabel(seat);
  }
  return customNames[seat] || defaultSeatLabel(seat);
}

export function setPlayerName(seat, name) {
  const trimmed = name.trim();
  customNames[seat] = trimmed || null;
  saveLocalNames();
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
  saveLocalAvatars();
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
