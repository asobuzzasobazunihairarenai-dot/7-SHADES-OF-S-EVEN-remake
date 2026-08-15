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
//     speaker:     string          // 話者の表示名（"案内人エイドス" / "記憶を失った青年" / "セプト"）
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

const EIDOS = "案内人エイドス";
const YOUTH = "記憶を失った青年";
const SEPT = "セプト";

const SCENES = {
  // ============ SCENE 1: エイドス初登場 ============
  [EIDOS_SCENE.FIRST_ENCOUNTER]: {
    once: true,
    replayable: true,
    fadeInFromBlack: true,
    nextEvent: "start-operation-tutorial",
    stateUpdate: ["eidos_intro_seen"],
    steps: [
      { id: "1-1", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "……ようやく目を覚ましたか" },
      { id: "1-2", speaker: YOUTH, side: "left", protagonist: "youth_silent", eidos: "thinking", text: "ここは……どこだ" },
      { id: "1-3", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "normal_left", text: "それを尋ねる前に、自分が誰なのかは分かるか？" },
      { id: "1-4", speaker: YOUTH, side: "left", protagonist: "youth_silent", eidos: "thinking", text: "……分からない" },
      { id: "1-5", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "名前も、ここへ来るまでの記憶もない、か" },
      {
        id: "1-5b",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_silent",
        eidos: "guiding",
        text: "名は、これから進む君を指し示す標だ\nでは、私は君を何と呼べばいい？",
        input: { field: "playerName", default: "アッシュ", placeholder: "名前を入力", maxLength: 12, confirmLabel: "これでいく" },
      },
      { id: "1-6", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "normal_left", text: "この世界はファルベンド\n七つの国が、七つの色を治めていた世界だ" },
      { id: "1-7", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "だが今、その色は世界から失われている" },
      { id: "1-8", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "normal_left", text: "それでも君の中には、まだ何かが残っているらしい" },
      { id: "1-9", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "thinking", text: "俺の中に……？" },
      {
        id: "1-10",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_alert",
        eidos: "guiding",
        text: "ああ\n君に七つの色を集める力があるのか、確かめさせてもらう",
        choices: [
          { label: "何をすればいい？", next: "1-11A" },
          { label: "お前は何者だ？", next: "1-11B" },
        ],
      },
      { id: "1-11A", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", text: "まずは盤面での動き方を覚えることだ", next: "1-12" },
      { id: "1-11B", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "私はエイドス・ノワール\n今は、君を導く者とだけ答えておこう", next: "1-12" },
      { id: "1-12", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", text: "心配はいらない\n動き方は、私が一つずつ教える" },
    ],
  },

  // ============ SCENE 2: 操作チュートリアル終了後 ============
  [EIDOS_SCENE.OPERATION_TUTORIAL_COMPLETE]: {
    once: true,
    stateUpdate: ["tutorial_completed"],
    steps: [
      { id: "2-1", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: "ひととおりの動きは理解したようだな" },
      { id: "2-2", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "だが、教えられた通りに動くことと\n自分で道を選ぶことは違う" },
      { id: "2-3", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "normal_left", text: "次は、あんたと戦うのか？" },
      { id: "2-4", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "battle_calm", text: "話が早くて助かる\n今度は私も、決められた通りには動かない" },
      {
        id: "2-5",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_normal",
        eidos: "battle_calm",
        text: "君自身の判断で、七つの色を集めてみせろ",
        choices: [
          { label: "エイドスに挑戦する", value: "start-intermediate-battle" },
          { label: "あとで挑戦する", value: "home" },
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
      { id: "3-1", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "……なるほど" },
      { id: "3-2", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "acknowledging", text: "教えた動きをなぞっただけではない\n自分で盤面を読み、勝ち筋を選んだか" },
      { id: "3-3", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "acknowledging", text: "これで、俺に力があると分かったのか？" },
      { id: "3-4", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "可能性があることは分かった\nだが、まだ確信には足りない" },
      { id: "3-5", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "battle_calm", text: "まだ戦うつもりか" },
      { id: "3-6", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "battle_calm", text: "次は試すための戦いではない\n私も本気で君を止める" },
    ],
  },

  // ============ SCENE 4: 易しいエイドス戦・敗北 ============
  [EIDOS_SCENE.INTERMEDIATE_LOSS]: {
    once: false,
    steps: [
      { id: "4-1", speaker: EIDOS, side: "right", protagonist: "youth_silent", eidos: "normal_left", text: "焦る必要はない" },
      { id: "4-2", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", text: "目の前の色だけではなく\n相手が次に欲しがる色も見てみるといい" },
      {
        id: "4-3",
        speaker: YOUTH,
        side: "left",
        protagonist: "youth_alert",
        eidos: "normal_left",
        text: "……もう一度だ",
        choices: [
          { label: "再挑戦する", value: "retry-intermediate-battle" },
          { label: "あとで挑戦する", value: "home" },
        ],
      },
    ],
  },

  // ============ SCENE 5: 強いエイドス戦・解放（SCENE3から連続） ============
  [EIDOS_SCENE.ADVANCED_UNLOCKED]: {
    once: false,
    steps: [
      { id: "5-1", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "battle_serious", fx: { bgDim: true, auraDark: true, auraGray: true }, text: "ここから先は、先ほどと同じにはいかない" },
      {
        id: "5-2",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_alert",
        eidos: "battle_serious",
        fx: { bgDim: true, auraDark: true },
        text: "それでも進むと言うなら\n君の力がどこまで届くのか、見せてもらおう",
        choices: [
          { label: "本気のエイドスに挑戦する", value: "start-advanced-battle" },
          { label: "準備してから挑む", value: "home" },
        ],
      },
    ],
  },

  // ============ SCENE 6: 強いエイドス戦・敗北 ============
  [EIDOS_SCENE.ADVANCED_LOSS]: {
    once: false,
    steps: [
      { id: "6-1", speaker: EIDOS, side: "right", protagonist: "youth_silent", eidos: "battle_serious", text: "今のままでは、私には届かない" },
      { id: "6-2", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "thinking", text: "だが、届かないことと\n届く可能性がないことは同じではない" },
      {
        id: "6-3",
        speaker: EIDOS,
        side: "right",
        protagonist: "youth_alert",
        eidos: "battle_calm",
        text: "盤面を見直せ\n君が選ばなかった道に、答えが残っている",
        choices: [
          { label: "もう一度挑戦する", value: "retry-advanced-battle" },
          { label: "あとで挑戦する", value: "home" },
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
      { id: "7-1", speaker: EIDOS, side: "right", protagonist: "youth_resonating", eidos: "battle_serious", fx: { auraGray: true }, text: "……その力" },
      { id: "7-2", speaker: EIDOS, side: "right", protagonist: "youth_resonating", eidos: "thinking", fx: { auraGray: true }, text: "七つの色のどれとも違う\nそれなのに、すべての色へ手を伸ばせる" },
      { id: "7-3", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "thinking", text: "俺が何者なのか、知っているのか？" },
      { id: "7-4", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "normal_left", text: "……いや\n今の私にも、答えまでは見えない" },
      { id: "7-5", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: "だが、君が前へ進める者だということは分かった" },
      { id: "7-6", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: "私の負けだ\n君の力を認めよう" },
      { id: "7-7", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "thinking", text: "……どうやら、もう一人\n君を認めた者がいるらしい" },
    ],
  },

  // ============ SCENE 8: セプト獲得（SCENE7から連続） ============
  [EIDOS_SCENE.SEPT_REWARD]: {
    once: true,
    grantItem: "pet:sept", // 付与に成功したら sept_awarded を保存（永続化は承認後に実装）
    stateUpdate: ["sept_awarded"],
    steps: [
      { id: "8-1", speaker: YOUTH, side: "left", protagonist: "youth_alert", eidos: "thinking", sept: "sept_interested", text: "これは……？" },
      { id: "8-2", speaker: EIDOS, side: "right", protagonist: "youth_alert", eidos: "normal_left", sept: "sept_interested", text: "セプトだ\n警戒心の強い存在だが、君には興味があるらしい" },
      { id: "8-3", speaker: YOUTH, side: "left", protagonist: "youth_normal", eidos: "normal_left", sept: "sept_normal", text: "俺について来るのか？" },
      { id: "8-4", speaker: SEPT, side: "sept", protagonist: "youth_normal", eidos: "normal_left", sept: "sept_joy", typewriter: false, text: "キュッ！" },
      { id: "8-5", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "acknowledging", sept: "sept_joy", text: "答えは決まったようだな" },
      { id: "8-6", speaker: EIDOS, side: "right", protagonist: "youth_normal", eidos: "guiding", sept: "sept_joy", text: "連れていくといい\n君が七つの色を追うなら、きっと力になる" },
      {
        id: "8-7",
        speaker: "",
        side: "sept",
        protagonist: "youth_normal",
        eidos: "guiding",
        sept: "sept_joy",
        typewriter: false,
        text: "ペット『セプト』を獲得しました",
        choices: [
          { label: "セプトをセットする", value: "set-sept" },
          { label: "あとで", value: "keep-sept" },
        ],
      },
    ],
  },
};

export function getEidosScene(id) {
  return SCENES[id] || null;
}
export function hasEidosScene(id) {
  return !!SCENES[id];
}
