// エイドス／主人公／セプトの会話用「立ち絵」画像を、会話データ側で指定した“画像ID”から実ファイル
// パスへ解決する対応表（ユーザー要望2026-08-08 §5 / 決定稿）。会話コンポーネントにはパスを直書き
// せず、必ずこのモジュール経由で解決する。専用ポーズ素材がまだ無いIDは、実在する近い絵へマッピング
// する（＝「存在しないファイル名を推測して実装しない」方針。IDは意味単位のままなので、専用素材が
// 追加されたら下の対応表を差し替えるだけでよく、会話データもUIも変更不要）。
//
// 素材の割り当て根拠（実画像を目視確認して割り当て。ユーザー方針「安易に反転せず内容で割り当てる」）:
//   主人公「記憶を失った青年」= 灰色（無色＝記憶喪失）の protagonist-gray-*。左に配置しエイドスへ
//     顔を向けるため right（右向き）を基本に使う。フードで顔は陰になっており向きの主張は弱い。
//   エイドス = 右に配置し主人公へ顔を向けるため left（左向き）を基本に使う。left/front/awakened/
//     enraged の4系統しか無いため、意味ポーズ（thinking/guiding/acknowledging等）は近い実絵へ集約。
//     battle_serious は enraged（かなり強い表情。ユーザーの「威圧的すぎない」意向とはやや外れるため、
//     専用の“本気だが冷静”な素材が用意できたら差し替え推奨）。
//   セプト = 既存のペット追従スプライト assets/pets/sept/ の front フレームを表情差分として流用。
//     （会話シーンでは初期はエイドスの立ち絵にセプトが同梱されているため、単体表示はSCENE8のみ。）

// --- 主人公（記憶を失った青年） ---
const PROTAGONIST_PORTRAITS = {
  youth_normal: "assets/avatars/protagonist-gray-right.webp", // 通常（エイドスへ顔を向ける）
  youth_silent: "assets/avatars/protagonist-gray-front.webp", // 沈黙・うつむき気味
  youth_alert: "assets/avatars/protagonist-gray-right.webp", // 警戒・注視（フードで表情差は出ないため通常と同絵）
  youth_resonating: "assets/avatars/protagonist-gray-right-awakened.webp", // 力が共鳴（灰色のオーラが反応）
};
const PROTAGONIST_FALLBACK_ID = "youth_normal";

// --- エイドス ---
const EIDOS_PORTRAITS = {
  normal_front: "assets/avatars/eidos-noir-front.webp",
  normal_left: "assets/avatars/eidos-noir-left.webp",
  normal_right: "assets/avatars/eidos-noir-right.webp",
  // 会話用の意味ポーズ（専用素材が無いため実在する近い絵へ集約）。
  thinking: "assets/avatars/eidos-noir-front.webp", // 思考・観察（正面の落ち着いた表情）
  guiding: "assets/avatars/eidos-noir-left.webp", // 案内（主人公の方を向く）
  acknowledging: "assets/avatars/eidos-noir-left.webp", // 認める（主人公の方を向く）
  battle_calm: "assets/avatars/eidos-noir-left-awakened.webp", // 余裕のある戦闘構え（紫のオーラ）
  battle_serious: "assets/avatars/eidos-noir-left-enraged.webp", // 本気の戦闘構え（強い気配・要差し替え候補）
};
const EIDOS_FALLBACK_ID = "normal_left"; // 右配置＝左向きを既定に

// --- セプト（既存ペットスプライトの front フレームを表情差分に流用） ---
const SEPT_PORTRAITS = {
  sept_normal: "assets/pets/sept/sept-front-static.webp", // 通常
  sept_interested: "assets/pets/sept/sept-front-ear.webp", // 興味（耳を立てる）
  sept_joy: "assets/pets/sept/sept-front-jump.webp", // 喜び（跳ねる）
  sept_threat: "assets/pets/sept/sept-front-yawn.webp", // 威嚇（口を開ける・暫定流用）
};
const SEPT_FALLBACK_ID = "sept_normal";

// 主人公の立ち絵パスを解決する。未知IDは youth_normal へフォールバック。
export function resolveProtagonistPortrait(id) {
  return PROTAGONIST_PORTRAITS[id] ?? PROTAGONIST_PORTRAITS[PROTAGONIST_FALLBACK_ID];
}
export function hasProtagonistPortrait(id) {
  return !!PROTAGONIST_PORTRAITS[id];
}

// エイドスの立ち絵パスを解決する。未知IDは normal_left へフォールバック。
export function resolveEidosPortrait(id) {
  return EIDOS_PORTRAITS[id] ?? EIDOS_PORTRAITS[EIDOS_FALLBACK_ID];
}
export function hasEidosPortrait(id) {
  return !!EIDOS_PORTRAITS[id];
}

// セプトの立ち絵パスを解決する。未知IDは sept_normal、それも無ければ null（非表示）。
export function resolveSeptPortrait(id) {
  return SEPT_PORTRAITS[id] ?? SEPT_PORTRAITS[SEPT_FALLBACK_ID] ?? null;
}
export function hasSeptPortrait(id) {
  return !!SEPT_PORTRAITS[id];
}
