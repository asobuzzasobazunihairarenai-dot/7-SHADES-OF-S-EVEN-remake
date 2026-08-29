// エイドス会話の「本番シーン」登録所（ユーザー要望2026-08-08 §6/§7 / 決定稿）。セリフは画面や
// tutorial-battle.js に直書きせず、ここにデータとして分離する。決定稿（2026-08-08受領）をそのまま
// 反映。表示機構（eidos-dialogue-ui.js）とは疎結合で、runEidosDialogue(scene.steps, ...) に渡す。
//
// 文章表現の方針（決定稿）: 物語会話ではセリフ末尾の句点「。」を使わない。1ステップは概ね2行以内。
// 複数行は "\n" で区切る（UIが改行表示する）。
//
// 会話ステップのスキーマ（§6。将来のセリフ修正・多言語・分岐追加に耐える形）:
//   {
//     id:          string          // ステップID（分岐 next / choice.next の遷移先指定に使う）
//     speaker:     string          // 話者の表示名（t("story.name.eidos") / t("story.name.youth") / t("story.name.sept")）
//     side:        "left"|"right"|"sept" // 発話者＝ハイライト対象。left=主人公 right=エイドス
//     protagonist: string          // 主人公の立ち絵ID（eidos-portraits.js。左に表示）
//     eidos:       string          // エイドスの立ち絵ID（右に表示）
//     sept:        string          // セプトを中央下に出す時だけ、その立ち絵ID（省略=非表示）
//     text:        string          // セリフ本文（"\n"で改行）
//     typewriter:  boolean         // 文字送り有無（既定true。falseで即時表示）
//     choices:     [{ label, value?, next? }] // next=同一シーン内の遷移先ID / value=会話終了して呼出側へ返す
//     next:        string          // このステップの次に進む先ID（分岐後に本筋へ合流する時など）
//     fx:          { bgDim?, auraDark?, auraGray? } // 演出フック（best-effort）
//   }
//   SCENES[sceneId] = {
//     steps: [...],
//     fadeInFromBlack: boolean  // 開始を暗転から徐々に明るく（SCENE1）
//     once:        boolean      // 一度だけ表示（既読なら以後出さない）
//     replayable:  boolean      // 回想などから見返せる
//     nextEvent:   string       // 会話後に起こすゲームイベント識別子（呼び出し側が解釈）
//     nextScene:   string       // 会話を閉じずに続けて再生する次シーンID
//     stateUpdate: string[]     // 完了時に保存する進行フラグ（永続化は承認後に実装）
//   }
//
// 進行に対応するシーンID（決定稿の会話IDに合わせて固定。保存キーにも流用可）。
import { t } from "./ui-text.js"; // UI英語化フェーズ9
import { getLang } from "./i18n.js";

export const EIDOS_SCENE = {
  FIRST_ENCOUNTER: "eidos_first_encounter", // SCENE1 初登場
  OPERATION_TUTORIAL_COMPLETE: "operation_tutorial_complete", // SCENE2 操作チュートリアル終了後
  INTERMEDIATE_FIRST_WIN: "eidos_intermediate_first_win", // SCENE3 易しい戦・初勝利
  INTERMEDIATE_LOSS: "eidos_intermediate_loss", // SCENE4 易しい戦・敗北
  ADVANCED_UNLOCKED: "eidos_advanced_unlocked", // SCENE5 強い戦・解放
  ADVANCED_LOSS: "eidos_advanced_loss", // SCENE6 強い戦・敗北
  ADVANCED_FIRST_WIN: "eidos_advanced_first_win", // SCENE7 強い戦・初勝利
  SEPT_REWARD: "sept_reward", // SCENE8 セプト獲得
};





// UI英語化フェーズ9: 読み込み時に組み立てると、その時の言語で台詞が固定されてしまう。
// 呼ぶたびに（言語が変わっていれば）作り直す。
let scenesCache = null;
let scenesCacheLang = null;
function getScenes() {
  if (scenesCache && scenesCacheLang === getLang()) return scenesCache;
  scenesCacheLang = getLang();
  scenesCache = buildScenes();
  return scenesCache;
}
function buildScenes() {
  const EIDOS = t("story.name.eidos");
  const YOUTH = t("story.name.youth");
  const SEPT = t("story.name.sept");
  return {
  // ============ SCENE 1: エイドス初登場 ============
  [EIDOS_SCENE.FIRST_ENCOUNTER]: {
    once: true,
    replayable: true,
    fadeInFromBlack: true,
    nextEvent: "start-operation-tutorial",
    stateUpdate: ["eidos_intro_seen"],
    steps: [
      { id: "1-1", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.1-1") },
      { id: "1-2", speaker: YOUTH, side: "left", protagonist: "youth_silent", eidos: "thinking", text: t("story.1-2") },
      { id: "1-3", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "normal_left", text: t("story.1-3") },
      { id: "1-4", speaker: YOUTH, side: "left", protagonist: "youth_silent", eidos: "thinking", text: t("story.1-4") },
      { id: "1-5", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.1-5") },
      {
        id: "1-5b",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_silent",
        eidos: "guiding",
        text: t("story.1-5b"),
        input: { field: "playerName", default: t("story.1-5b.default"), placeholder: t("story.1-5b.placeholder"), maxLength: 12, confirmLabel: t("story.1-5b.confirm") },
      },
      { id: "1-6", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "normal_left", text: t("story.1-6") },
      { id: "1-7", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.1-7") },
      { id: "1-8", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "normal_left", text: t("story.1-8") },
      { id: "1-9", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "thinking", text: t("story.1-9") },
      {
        id: "1-10",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_alert",
        eidos: "guiding",
        text: t("story.1-10"),
        choices: [
          { label: t("story.1-10.c1"), next: "1-11A" },
          { label: t("story.1-10.c2"), next: "1-11B" },
        ],
      },
      { id: "1-11A", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", text: t("story.1-11A"), next: "1-12" },
      { id: "1-11B", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.1-11B"), next: "1-12" },
      { id: "1-12", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", text: t("story.1-12") },
    ],
  },

  // ============ SCENE 2: 操作チュートリアル終了後 ============
  [EIDOS_SCENE.OPERATION_TUTORIAL_COMPLETE]: {
    once: true,
    stateUpdate: ["tutorial_completed"],
    steps: [
      { id: "2-1", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: t("story.2-1") },
      { id: "2-2", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.2-2") },
      { id: "2-3", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "normal_left", text: t("story.2-3") },
      { id: "2-4", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "battle_calm", text: t("story.2-4") },
      {
        id: "2-5",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_normal",
        eidos: "battle_calm",
        text: t("story.2-5"),
        choices: [
          { label: t("story.2-5.c1"), value: "start-intermediate-battle" },
          { label: t("story.2-5.c2"), value: "home" },
        ],
      },
    ],
  },

  // ============ SCENE 3: 易しいエイドス戦・勝利 ============
  [EIDOS_SCENE.INTERMEDIATE_FIRST_WIN]: {
    once: true,
    nextScene: EIDOS_SCENE.ADVANCED_UNLOCKED, // 会話を閉じず、そのまま強い戦解放へ
    stateUpdate: ["eidos_easy_cleared", "eidos_hard_unlocked"],
    steps: [
      { id: "3-1", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.3-1") },
      { id: "3-2", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "acknowledging", text: t("story.3-2") },
      { id: "3-3", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "acknowledging", text: t("story.3-3") },
      { id: "3-4", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.3-4") },
      { id: "3-5", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "battle_calm", text: t("story.3-5") },
      { id: "3-6", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "battle_calm", text: t("story.3-6") },
    ],
  },

  // ============ SCENE 4: 易しいエイドス戦・敗北 ============
  [EIDOS_SCENE.INTERMEDIATE_LOSS]: {
    once: false,
    steps: [
      { id: "4-1", speaker: EIDOS, side: "right", protagonist: "youth_silent", eidos: "normal_left", text: t("story.4-1") },
      { id: "4-2", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", text: t("story.4-2") },
      {
        id: "4-3",
        speaker: YOUTH,
        side: "left",
        protagonist: "youth_alert",
        eidos: "normal_left",
        text: t("story.4-3"),
        choices: [
          { label: t("story.4-3.c1"), value: "retry-intermediate-battle" },
          { label: t("story.2-5.c2"), value: "home" },
        ],
      },
    ],
  },

  // ============ SCENE 5: 強いエイドス戦・解放（SCENE3から連続） ============
  [EIDOS_SCENE.ADVANCED_UNLOCKED]: {
    once: false,
    steps: [
      { id: "5-1", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "battle_serious", fx: { bgDim: true, auraDark: true, auraGray: true }, text: t("story.5-1") },
      {
        id: "5-2",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_alert",
        eidos: "battle_serious",
        fx: { bgDim: true, auraDark: true },
        text: t("story.5-2"),
        choices: [
          { label: t("story.5-2.c1"), value: "start-advanced-battle" },
          { label: t("story.5-2.c2"), value: "home" },
        ],
      },
    ],
  },

  // ============ SCENE 6: 強いエイドス戦・敗北 ============
  [EIDOS_SCENE.ADVANCED_LOSS]: {
    once: false,
    steps: [
      { id: "6-1", speaker: EIDOS, side: "right", protagonist: "youth_silent", eidos: "battle_serious", text: t("story.6-1") },
      { id: "6-2", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: t("story.6-2") },
      {
        id: "6-3",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_alert",
        eidos: "battle_calm",
        text: t("story.6-3"),
        choices: [
          { label: t("story.6-3.c1"), value: "retry-advanced-battle" },
          { label: t("story.2-5.c2"), value: "home" },
        ],
      },
    ],
  },

  // ============ SCENE 7: 強いエイドス戦・初勝利 ============
  [EIDOS_SCENE.ADVANCED_FIRST_WIN]: {
    once: true,
    nextScene: EIDOS_SCENE.SEPT_REWARD, // 会話を閉じず、そのままセプト獲得へ
    stateUpdate: ["eidos_hard_cleared"],
    steps: [
      { id: "7-1", speaker: EIDOS, side: "right", protagonist: "youth_resonating", eidos: "battle_serious", fx: { auraGray: true }, text: t("story.7-1") },
      { id: "7-2", speaker: EIDOS, side: "right", protagonist: "youth_resonating", eidos: "thinking", fx: { auraGray: true }, text: t("story.7-2") },
      { id: "7-3", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "thinking", text: t("story.7-3") },
      { id: "7-4", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "normal_left", text: t("story.7-4") },
      { id: "7-5", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: t("story.7-5") },
      { id: "7-6", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: t("story.7-6") },
      { id: "7-7", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "thinking", text: t("story.7-7") },
    ],
  },

  // ============ SCENE 8: セプト獲得（SCENE7から連続） ============
  [EIDOS_SCENE.SEPT_REWARD]: {
    once: true,
    grantItem: "pet:sept", // 付与に成功したら sept_awarded を保存（永続化は承認後に実装）
    stateUpdate: ["sept_awarded"],
    steps: [
      { id: "8-1", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "thinking", sept: "sept_interested", text: t("story.8-1") },
      { id: "8-2", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "normal_left", sept: "sept_interested", text: t("story.8-2") },
      { id: "8-3", speaker: YOUTH, side: "left", protagonist: "youth_normal", eidos: "normal_left", sept: "sept_normal", text: t("story.8-3") },
      { id: "8-4", speaker: SEPT, side: "sept", protagonist: "youth_normal", eidos: "normal_left", sept: "sept_joy", typewriter: false, text: t("story.8-4") },
      { id: "8-5", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", sept: "sept_joy", text: t("story.8-5") },
      { id: "8-6", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", sept: "sept_joy", text: t("story.8-6") },
      {
        id: "8-7",
        speaker: "",
        side: "sept",
        protagonist: "youth_normal",
        eidos: "guiding",
        sept: "sept_joy",
        typewriter: false,
        text: t("story.8-7"),
        choices: [
          { label: t("story.8-7.c1"), value: "set-sept" },
          { label: t("story.8-7.c2"), value: "keep-sept" },
        ],
      },
    ],
  },
  };
}

export function getEidosScene(id) {
  return getScenes()[id] || null;
}
export function hasEidosScene(id) {
  return !!getScenes()[id];
}
