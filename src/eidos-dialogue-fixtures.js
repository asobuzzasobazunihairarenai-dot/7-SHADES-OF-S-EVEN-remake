// 開発用の会話プレビュー（ユーザー要望2026-08-08 §6）。本番画面のどのフローからも呼ばれない。
// 表示機構（eidos-dialogue-ui.js）と決定稿シーン（eidos-dialogue-scenes.js）の見た目・操作確認専用。
// コンソールから:
//   window.__eidosDialogueDemo()            … 機構確認用の短いダミー会話（新スキーマ）
//   window.__eidosPlayScene("eidos_first_encounter") … 決定稿の実シーンを再生（本番導線ではない）
// 実シーンを連続再生（nextScene）まで含めて確認したい時は __eidosPlayScene が nextScene を辿る。

import { runEidosDialogue } from "./eidos-dialogue-ui.js";
import { getEidosScene } from "./eidos-dialogue-scenes.js";

// 機構確認用のダミー会話（本番セリフではない）。二人立ち絵・発話者ハイライト・セプト・選択肢を確認。
const DEV_FIXTURE_STEPS = [
  { id: "d1", speaker: "案内人エイドス", side: "right", protagonist: "youth_silent", eidos: "thinking", text: "（開発用ダミー）主人公は左、私は右に立つ 発話者が明るくなる" },
  { id: "d2", speaker: "記憶を失った青年", side: "left", protagonist: "youth_alert", eidos: "normal_left", text: "（開発用ダミー）今度は左の主人公が明るくなり、右の私が暗くなる" },
  { id: "d3", speaker: "セプト", side: "sept", protagonist: "youth_normal", eidos: "normal_left", sept: "sept_joy", typewriter: false, text: "キュッ！（中央下にセプト）" },
  {
    id: "d4",
    speaker: "案内人エイドス",
    side: "right",
    protagonist: "youth_normal",
    eidos: "guiding",
    text: "（開発用ダミー）選択肢の確認 両者とも通常の明るさに戻る",
    choices: [
      { label: "分岐A（次のダミーへ）", next: "d5" },
      { label: "終了（値を返す）", value: "demo-end" },
    ],
  },
  { id: "d5", speaker: "案内人エイドス", side: "right", protagonist: "youth_normal", eidos: "acknowledging", text: "（開発用ダミー）分岐Aに来た これで終了" },
];

export async function runEidosDialogueDemo() {
  const result = await runEidosDialogue(DEV_FIXTURE_STEPS);
  console.log("[eidos dialogue demo] result:", result);
  return result;
}

// 決定稿の実シーンを再生する（開発確認用）。nextScene があれば続けて再生する。
export async function playEidosScene(sceneId) {
  let id = sceneId;
  let last = null;
  while (id) {
    const scene = getEidosScene(id);
    if (!scene) {
      console.warn("[eidos scene] not found:", id);
      break;
    }
    last = await runEidosDialogue(scene.steps, { fadeInFromBlack: !!scene.fadeInFromBlack });
    console.log(`[eidos scene] ${id} ended:`, last, "meta:", {
      once: scene.once,
      nextEvent: scene.nextEvent,
      nextScene: scene.nextScene,
      stateUpdate: scene.stateUpdate,
      grantItem: scene.grantItem,
    });
    // choiceで終わった場合は本番では値に応じて分岐するが、プレビューでは nextScene だけ辿る。
    id = scene.nextScene || null;
  }
  return last;
}
