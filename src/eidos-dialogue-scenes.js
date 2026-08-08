// エイドス会話の「本番シーン」登録所（ユーザー要望2026-08-08 §6/§7）。セリフは画面や
// tutorial-battle.js に直書きせず、ここにデータとして分離する。決定稿は別途受領予定のため、
// 現時点では SCENES は空（本番用の仮セリフは入れない＝§6）。決定稿が届いたら各シーンの steps を
// このファイルに流し込むだけでよい。表示機構（eidos-dialogue-ui.js）とは疎結合。
//
// 会話ステップのスキーマ（§6。将来のセリフ修正・多言語・分岐追加に耐える形）:
//   {
//     id:            string        // 会話ステップID（分岐の遷移先指定に使える）
//     speaker:       string        // 話者名（例 "案内人エイドス"）
//     text:          string        // セリフ本文（将来 i18nキー化も可能）
//     portrait:      string        // 立ち絵ID（eidos-portraits.jsのID。既定 "normal_front"）
//     portraitSide:  "left"|"right"// 立ち絵の表示位置（既定 left）
//     sept:          boolean       // セプトを表示するか
//     septPortrait:  string        // セプトの画像ID（eidos-portraits.jsのID。既定 "sept_normal"）
//     typewriter:    boolean       // 文字送り有無（既定 true。falseで即時表示）
//     choices:       [{ label, value }]  // 選択肢（§3。valueは呼び出し側が進行判断に使う）
//     // ↓ シーン単位のメタ（steps配列ではなくシーン側に持たせる項目）:
//   }
//   SCENES[sceneId] = {
//     steps: [...上記ステップ],
//     once:        boolean   // 一度だけ表示（既読なら以後出さない）
//     replayable:  boolean   // 再閲覧可能（回想などから見返せる）
//     nextEvent:   string    // 会話後に起こすゲームイベントの識別子（呼び出し側が解釈）
//   }
//
// 進行に対応するシーンID（§7の実装対象8場面）。文字列は将来の保存キーにも流用できるよう固定。
export const EIDOS_SCENE = {
  INTRO: "intro", // 初登場
  TUTORIAL_DONE: "tutorial_done", // 通常チュートリアル終了後
  EASY_WIN: "easy_win", // 易しいエイドス戦の勝利時
  EASY_LOSE: "easy_lose", // 易しいエイドス戦の敗北時
  HARD_UNLOCK: "hard_unlock", // 強いエイドス戦の解放時
  HARD_LOSE: "hard_lose", // 強いエイドス戦の敗北時
  HARD_FIRST_WIN: "hard_first_win", // 強いエイドス戦の初勝利時
  SEPT_AWARD: "sept_award", // セプト獲得時
};

// 本番シーン登録所。★決定稿受領後にここへ steps を投入する（現時点は意図的に空）。
const SCENES = {
  // [EIDOS_SCENE.INTRO]: { steps: [...], once: true, replayable: true, nextEvent: "start-tutorial" },
  // ...
};

export function getEidosScene(id) {
  return SCENES[id] || null;
}
export function hasEidosScene(id) {
  return !!SCENES[id];
}
