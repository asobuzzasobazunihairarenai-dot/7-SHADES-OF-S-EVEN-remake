// ローカル1人用「CPU戦」。新しいAIは書かず、既存の「疑似CPUモード」（合法手をランダムに
// 選ぶ自動プレイ。performPriorityTimeoutAutoAction）をそのまま“CPU戦”として表に出す薄い
// ラッパー。あなた(A)対CPU(C)の2人対戦をローカルで開始し、C席を疑似CPU（＝自分以外）に
// 設定するだけで、C席がムーブ・ロック・ハンド・各種選択・接触まで自動で進む。
//
// 仕組み上の要点:
// - ローカルモードでは getSelfSeat()==="A" 固定。疑似CPUの対象は「自分以外」なので、
//   includeSelf=false のままで C 席だけが自動化される（A は今まで通り手動）。
// - 疑似CPUの自動プレイはターンタイマーの tick に乗って駆動される（turn-timer.js の
//   tick() は isTurnTimerEnabled() が false だと早期 return する）。よってタイマーを
//   有効化する。あなた(A)側が時間切れで急かされないよう、基本時間は長めに設定する
//   （疑似CPU対象=C はこの値ではなく getPseudoCpuDeadlineMs() を使うため影響しない）。
// - 2人対戦の座席は game-setup.js の AUTO_SEATS_BY_COUNT[2] = ["A","C"]。

import {
  setPseudoCpuModeEnabled,
  setPseudoCpuIncludeSelf,
  setPseudoCpuDeadlineMs,
  setTurnTimerEnabled,
  setRopeBaseSeconds,
} from "./admin.js";
import { quickStart } from "./game-setup.js";
import { setPlayerName } from "./player-identity.js";
import { setAutoProcessingEnabled } from "./card-effect-engine.js";
import { setCpuBattleActive } from "./cpu-battle-state.js";

const CPU_SEAT = "C"; // 2人対戦の相手席（AUTO_SEATS_BY_COUNT[2] = ["A","C"]）

// CPUの思考時間（＝疑似CPU対象席の基本時間）。短すぎると演出を読む前に次々進んでしまうため、
// 手が見える程度の間を置く。
const CPU_THINK_MS = 1300;
// あなた(A)側の基本時間。実質“急かされない”ようにするための長め設定（15分）。
const HUMAN_BASE_SECONDS = 900;

// オープニング画面の「CPU戦」ボタンから呼ぶ。設定を整えてローカル2人対戦を開始する。
// close()（オープニングを閉じて盤面を見せる）の後に呼ぶ想定——quickStart のセットアップ
// 演出（ファースト配布・盤面配置）が盤面上で見えるようにするため。
export async function startCpuBattle() {
  // このセッションを「CPU戦」として印を付ける。これが立っている間、ローカルでは自分(A)の番
  // だけでなくCPU(C)の番も自動処理（フェイズ進行＋自動アクション）で駆動される
  // （phase-automation.js / main.js の getAutoDriveSeat 参照）。
  setCpuBattleActive(true);
  // C席を疑似CPU（自分以外）で自動化。A は手動のまま。
  setPseudoCpuModeEnabled(true);
  setPseudoCpuIncludeSelf(false);
  setPseudoCpuDeadlineMs(CPU_THINK_MS);
  // フェイズ自動進行が前提（CPUの番を自動で流すため）。既定でONだが念のため明示的に有効化する。
  setAutoProcessingEnabled(true);
  // 疑似CPUの自動プレイはタイマー tick で駆動されるため、タイマーを有効化する。
  setTurnTimerEnabled(true);
  // あなた(A)は時間切れで急かされないよう基本時間を長めに（CPU=C はこの値を使わない）。
  setRopeBaseSeconds(HUMAN_BASE_SECONDS);
  // 相手席の表示名を「CPU」に（tutorial-battle.js と同じ setPlayerName の使い方）。
  setPlayerName(CPU_SEAT, "CPU");
  // 2人対戦(A/C)をローカルで開始（0〜3のセットアップを一気に実行）。
  await quickStart(2, false);
}
