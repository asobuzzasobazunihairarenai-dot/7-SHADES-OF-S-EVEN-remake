// 開発用の会話テストデータ（ユーザー要望2026-08-08 §6）。本番のセリフ（決定稿）とは完全に分離し、
// 本番画面のどのフローからも呼ばれない。表示機構（eidos-dialogue-ui.js）の見た目・操作確認専用。
// プレビューは開発コンソールから window.__eidosDialogueDemo() を実行する（main.jsが登録。UIボタン
// 等の本番導線からは一切呼ばない）。仮のセリフはあくまで機構確認用のダミーで、本番には出ない。

import { runEidosDialogue } from "./eidos-dialogue-ui.js";

// 機構確認用のダミー会話（本番セリフではない）。立ち絵位置・セプト表示・文字送り・選択肢を一通り確認。
const DEV_FIXTURE_STEPS = [
  {
    id: "demo-1",
    speaker: "案内人エイドス",
    text: "（開発用ダミー）これは会話パネルの表示確認用テキストです。タップかEnter/Spaceで進みます。",
    portrait: "normal_front",
    portraitSide: "left",
  },
  {
    id: "demo-2",
    speaker: "案内人エイドス",
    text: "（開発用ダミー）文字送り中にタップすると全文が即時表示され、全文表示後のタップで次へ進みます。",
    portrait: "normal_right",
    portraitSide: "right",
  },
  {
    id: "demo-3",
    speaker: "案内人エイドス",
    text: "（開発用ダミー）セプトも表示できます（素材未配置時はフォールバック＝非表示）。",
    portrait: "normal_front",
    portraitSide: "left",
    sept: true,
    septPortrait: "sept_normal",
  },
  {
    id: "demo-choice",
    speaker: "案内人エイドス",
    text: "（開発用ダミー）選択肢の確認です。どうしますか？",
    portrait: "normal_front",
    portraitSide: "left",
    choices: [
      { label: "挑戦する", value: "challenge" },
      { label: "あとで挑戦する", value: "later" },
    ],
  },
];

// コンソールから呼ぶプレビュー関数（戻り値のPromiseで結果が分かる）。
export async function runEidosDialogueDemo() {
  const result = await runEidosDialogue(DEV_FIXTURE_STEPS);
  // 開発確認用にコンソールへ結果を出す（本番導線ではない）。
  console.log("[eidos dialogue demo] result:", result);
  return result;
}
