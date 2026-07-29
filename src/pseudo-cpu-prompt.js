// ユーザー要望（続き98）「疑似CPUモードを開始するを押すと、全プレイヤーに自分も
// 疑似CPUになるかのモーダルが出るようにしてほしい」→ 続き108でユーザー自身が
// 「もう最初のはい/いいえモーダルはやめて、ゲームを開始するの時に疑似CPUモードを
// オンにしていたら、全プレイヤーのオプション内の疑似CPUモードにチェックされる
// ようにしてほしい」と方針転換。
//
// 経緯: 続き101で「有効化した瞬間にRealtime Broadcastで確認モーダルを出す」設計を
// 「部屋作成者が『ゲームを開始する』を押した瞬間の設定を対局全体の固定値として
// サーバーに同期する」仕組みに変更したが、その後も「はい/いいえ」の確認モーダル
// 自体は残していた（続き107でセットアップ演出後まで表示を遅らせる等、クリックが
// 正しく反映されるよう手を尽くしたが、ユーザー自身の実機確認でも「モーダルを押しても
// うまく疑似CPUモードにならなかった。手動でオプションのチェックボックスをONにしたら
// うまくいった」という結果になった）。モーダルのクリック自体を経由させず、この対局の
// timerConfig.pseudoCpuModeEnabledが同期された時点で、確認を挟まず全員のローカルな
// pseudoCpuIncludeSelfを直接ONにする（オプション画面のチェックボックスも見た目上
// チェック済みになる）ことで、クリックの反映漏れという不確実な経路そのものを無くす。
// 「自分の座席は手動で操作したい」という人は、対局開始後にオプション→自動処理・
// タイマーのチェックを自分の意思で外せばよい（続き107で移設済みの、誰でも触れる
// チェックボックス）。

import { isOnlineMode, getCurrentGameId, getSyncedTimerConfig } from "./online.js";
import { subscribe } from "./state.js";
import { setPseudoCpuIncludeSelf, isPseudoCpuIncludeSelf } from "./admin.js";
import { logAction } from "./action-log.js";

// 1対局につき1回だけ自動ONにする（同じ対局の以降の状態変化のたびに実行し直さない
// ため）。新しい対局はgame_idが変わるため、この変数の値と一致しなくなり自然に
// 再度実行できる。
let autoEnabledForGameId = null;
export function initPseudoCpuPrompt() {
  subscribe(() => {
    if (!isOnlineMode()) return;
    const gameId = getCurrentGameId();
    if (!gameId || gameId === autoEnabledForGameId) return;
    const synced = getSyncedTimerConfig();
    if (!synced?.pseudoCpuModeEnabled) return;
    autoEnabledForGameId = gameId;
    setPseudoCpuIncludeSelf(true);
    // ユーザー報告（続き106〜108）「確認モーダルを押しても疑似CPUモードが反映されない
    // ことがある」の経緯を踏まえ、devtools無しで検証できるよう記録を残す。
    logAction("diag-pseudo-cpu", {
      phase: "pseudoCpuAutoEnabled",
      isPseudoCpuIncludeSelfAfterSet: isPseudoCpuIncludeSelf(),
    });
    window.dispatchEvent(new CustomEvent("admin:change"));
    // ユーザー要望（続き99）「ONしたら現在持っている基本時間及び砂時計は0にして
    // ください」。turn-timer.js側のリスナーが、今まさに自分の番なら即座に反映する。
    window.dispatchEvent(new CustomEvent("pseudo-cpu-settings-changed"));
  });
}
