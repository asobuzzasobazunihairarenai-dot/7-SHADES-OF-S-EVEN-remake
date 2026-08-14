// 案内人エイドスの物語チュートリアル（オンボーディング）のフロー制御＝オーケストレーター。
// シーン台本(eidos-dialogue-scenes.js)と対話UI(eidos-dialogue-ui.js)、操作チュートリアル
// (tutorial-battle.js)、CPU戦(cpu-battle.js)を、進捗に応じて順に繋ぐ。
//
// 【Phase 1（今ここ）】進捗は localStorage に保存（DB不要・ゲストでも動く）。まず
//   「ホームの🎓タイル → 導入シーン(初回のみ) → 既存の操作チュートリアル」までを配線。
//   操作チュートリアル完了後の弱/強エイドス戦・勝敗シーン・Sept獲得は後続の増分で追加する
//   （complete/abort の区別や CPU戦の起動・復帰フックが要るため段階的に）。
// 【Phase 2（後日・要ユーザーのSQL）】進捗のアカウント同期(so7_user_profiles列)＋Septの
//   実アンロック(so7_grant_item RPC)。今は localStorage の sept_awarded フラグのみ。
//
// see [[eidos-tutorial-story]], [[circular-import-tdz-and-no-cache-bust]]。

import { runEidosDialogue } from "./eidos-dialogue-ui.js";
import { getEidosScene, EIDOS_SCENE } from "./eidos-dialogue-scenes.js";
import { startTutorialBattle, registerTutorialHomeOpener } from "./tutorial-battle.js";

// 進捗フラグ（localStorage、端末ローカル。Phase 2でアカウント同期）。
// intro_seen / tutorial_completed / easy_cleared / hard_unlocked / hard_cleared / sept_awarded
const PROGRESS_KEY = "so7-eidos-progress-v1";
function readProgress() {
  try {
    return JSON.parse(localStorage.getItem(PROGRESS_KEY) || "{}") || {};
  } catch {
    return {};
  }
}
export function isEidosProgress(flag) {
  return !!readProgress()[flag];
}
export function setEidosProgress(flag, value) {
  const p = readProgress();
  p[flag] = !!value;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* 保存不可でも進行は続ける */
  }
}
export function getEidosProgress() {
  return readProgress();
}

// 指定シーンを再生（台本が無ければ何もしない。nextScene連鎖は runEidosDialogue 側が辿る）。
async function playScene(sceneId) {
  const scene = getEidosScene(sceneId);
  if (!scene) return null;
  try {
    return await runEidosDialogue(scene.steps, { fadeInFromBlack: !!scene.fadeInFromBlack });
  } catch (err) {
    console.error("runEidosDialogue failed", err);
    return null;
  }
}

// ホームの「🎓 チュートリアルCPU戦（物語）」タイルから呼ぶ入口。進捗に応じて出し分ける。
// openHome: 操作チュートリアルを終了/中断した時の戻り先（home-screen.jsから注入）。
export async function startEidosStory({ openHome } = {}) {
  // 操作チュートリアル終了時の戻り先（既存挙動）を維持する。
  registerTutorialHomeOpener(() => openHome?.());
  // 導入シーン（案内人エイドスとの邂逅）は「まだ操作チュートリアルを完了していない間」は毎回
  // 再生し、完了すると出さない（tutorial_completed は後続の増分で完了時にセットする）。以前は
  // intro_seen（一度でも見たら二度と出さない）でゲートしていたが、一度見ると再表示できず
  // 「会話が出ずチュートリアルから始まる」状態になっていた（ユーザー報告2026-08-14）。
  if (!isEidosProgress("tutorial_completed")) {
    await playScene(EIDOS_SCENE.FIRST_ENCOUNTER);
    setEidosProgress("intro_seen", true); // 記録用（今のゲートは tutorial_completed 側）
  }
  startTutorialBattle();
}
