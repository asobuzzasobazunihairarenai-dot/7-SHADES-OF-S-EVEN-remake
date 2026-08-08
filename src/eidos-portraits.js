// エイドス／セプトの会話用「立ち絵」画像を、会話データ側で指定した“画像ID”から実ファイルパスへ
// 解決する対応表（ユーザー要望2026-08-08 §5）。会話コンポーネントにはパスを直書きせず、必ずこの
// モジュール経由で解決する。素材が未配置（null）の画像IDは、エイドスは normal_front、セプトは
// sept_normal へフォールバックする（sept_normal も未配置なら null＝非表示）。
//
// 素材が用意でき次第、下の null を実パスに差し替えるだけでよい（会話データもUIも変更不要）。
// 推奨配置先（報告済み）:
//   エイドス: assets/avatars/eidos-noir-{guiding,thinking,battle-calm,battle-serious,acknowledging}.webp
//   セプト  : assets/dialogue/sept/sept-{normal,interested,joy,threat}.webp

// エイドスの画像ID → パス。normal_* は既存素材、それ以外は素材待ち（null）。
const EIDOS_PORTRAITS = {
  normal_front: "assets/avatars/eidos-noir-front.webp",
  normal_left: "assets/avatars/eidos-noir-left.webp",
  normal_right: "assets/avatars/eidos-noir-right.webp",
  // --- 会話用の追加ポーズ（素材未配置。配置後にパスを入れる） ---
  guiding: null, // 手を差し出す案内ポーズ
  thinking: null, // 口元に手を添えた思考・観察
  battle_calm: null, // 余裕のある戦闘構え
  battle_serious: null, // 本気の戦闘構え
  acknowledging: null, // プレイヤーを認めるポーズ
};
const EIDOS_FALLBACK_ID = "normal_front";

// セプト（会話用単体の表情差分）の画像ID → パス。全て素材待ち（null）。既存の
// assets/pets/sept/ はペット追従スプライト用で役割が違うため使わない。
const SEPT_PORTRAITS = {
  sept_normal: null, // 通常
  sept_interested: null, // 興味
  sept_joy: null, // 喜び
  sept_threat: null, // 威嚇
};
const SEPT_FALLBACK_ID = "sept_normal";

// エイドスの立ち絵パスを解決する。未知ID/素材未配置は normal_front へフォールバック。
export function resolveEidosPortrait(id) {
  const path = EIDOS_PORTRAITS[id] ?? null;
  if (path) return path;
  return EIDOS_PORTRAITS[EIDOS_FALLBACK_ID];
}

// その画像IDの専用素材が実在するか（フォールバックでなく本来の絵が出せるか）。UIの出し分けや
// 開発時の確認に使う。
export function hasEidosPortrait(id) {
  return !!EIDOS_PORTRAITS[id];
}

// セプトの立ち絵パスを解決する。専用素材が無ければ sept_normal、それも無ければ null（非表示）。
export function resolveSeptPortrait(id) {
  const path = SEPT_PORTRAITS[id] ?? null;
  if (path) return path;
  return SEPT_PORTRAITS[SEPT_FALLBACK_ID] ?? null;
}

export function hasSeptPortrait(id) {
  return !!SEPT_PORTRAITS[id];
}
