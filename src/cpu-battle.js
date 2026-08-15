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
import { setPlayerName, setPlayerAvatar, ENTRUSTED_AVATAR } from "./player-identity.js";
import { setAutoProcessingEnabled } from "./card-effect-engine.js";
import { setCpuBattleActive } from "./cpu-battle-state.js";
import { resetGame, setupMyDeckMode } from "./state.js";
// マイデッキ戦（本気エイドス戦）用。my-deck.jsはcards-data.jsだけに依存する葉モジュールなので
// ここから安全にimportできる（online.js等は経由しない）。
import { getSelectedDeckId, getDeckById, makeRandomDeck } from "./my-deck.js";

const CPU_SEAT = "C"; // 2人対戦の相手席（AUTO_SEATS_BY_COUNT[2] = ["A","C"]）

// CPUの思考時間（＝疑似CPU対象席の基本時間）。短すぎると演出を読む前に次々進んでしまうため、
// 手が見える程度の間を置く。
const CPU_THINK_MS = 1300;
// あなた(A)側の基本時間。実質“急かされない”ようにするための長め設定（15分）。
const HUMAN_BASE_SECONDS = 900;

// オープニング画面の「CPU戦」ボタンから呼ぶ。設定を整え、盤面を空にして（オープニングの
// 裏で）準備する。この後に呼び出し側が close() で盤面を見せ、続けて runCpuBattleSetup() を
// 呼ぶ——そうすると空の盤面の上でセットアップ演出（ファースト配布→盤面配置）が実際に見える。
export async function startCpuBattle() {
  // このセッションを「CPU戦」として印を付ける。これが立っている間、ローカルでは自分(A)の番
  // だけでなくCPU(C)の番も自動処理（フェイズ進行＋自動アクション）で駆動される
  // （phase-automation.js / main.js の getAutoDriveSeat 参照）。
  setCpuBattleActive(true);
  // CPU戦の間だけ、右上の「🎲 セットアップ」ウィザードのボタン／パネルをCSSで隠す
  // （ユーザー要望2026-08-07: CPU対戦時は不要）。オンライン時の非表示と同じ仕組み。
  document.body.classList.add("cpu-battle-mode");
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
  // CPUのアバターは「（基本）託された者たち」＝基本7色アバターを、CPUのファーストカードの色に
  // 連動させる（ユーザー要望2026-08-09）。青年と同じセンチネル方式で、駒が配られ次第その色の
  // アバターへ描画時に解決される（player-identity.js entrustedPathForSeat）。
  setPlayerAvatar(CPU_SEAT, ENTRUSTED_AVATAR);
  // 起動時の既定盤面（テスト用に4人が座った状態）を空にしておく。こうすると close() で
  // 盤面を見せた瞬間に4人がちらつかず、空の盤面から配布演出を見せられる。
  resetGame();
}

// オープニングを閉じて盤面を見せた「後」に呼ぶ。空の盤面の上で、2人対戦(A/C)のセットアップ
// を演出付き（quickStartのファースト配布・盤面配置アニメ）で実際に見せながら開始する。
export async function runCpuBattleSetup({ noirSeat = null, noirBrands = false, myDeck = false, myDeckCardsA = null } = {}) {
  // noirSeat: エイドス物語戦で相手(C)のファースト・駒を黒(noir)にする（配布アニメーションの前に
  // 適用されるので最初から黒く見える）。通常のCPU戦ではnull（＝差し替えなし）。
  // noirBrands: 本気エイドス戦で、ノワールの両端スロットに「誘惑の黒の烙印」を置いて開始する。
  // myDeck: 本気エイドス戦でマイデッキ戦（マイデッキ戦.txt）を有効化する。
  // myDeckCardsA: ユーザー要望2026-08-16「本気エイドス戦でもオンライン戦同様にマイデッキを選ぶ
  //   ウィンドウを出したい」。呼び出し側(eidos-story.js)がデッキ選択ウィンドウ(openDeckSelect)で
  //   確定した {cardId:count} を渡す。指定があればそれを、無ければ従来通り「現在選択中のマイデッキ」
  //   （それも無ければおまかせランダム）を A のデッキにする。
  await quickStart(2, false, false, noirSeat, noirBrands);
  if (myDeck) {
    // A(あなた): 選択ウィンドウで確定したデッキ（無ければ現在選択中→おまかせランダム）。
    // C(エイドス): おまかせランダム（ユーザー合意: エイドスのデッキは一旦ランダム）。cardsは
    // {cardId:count}なので展開＋シャッフルして「一番上=末尾」のcardId配列にしてから
    // setupMyDeckMode でパイルとして持たせる。
    let cardsA = myDeckCardsA && Object.keys(myDeckCardsA).length > 0 ? myDeckCardsA : null;
    if (!cardsA) {
      const selId = getSelectedDeckId();
      const deckA = selId ? getDeckById(selId) : null;
      cardsA = deckA?.cards && Object.keys(deckA.cards).length > 0 ? deckA.cards : makeRandomDeck().cards;
    }
    const cardsC = makeRandomDeck().cards;
    setupMyDeckMode({ A: expandAndShuffleDeck(cardsA), C: expandAndShuffleDeck(cardsC) });
  }
}

// {cardId:count} を、シャッフル済みの cardId 配列（末尾＝一番上）へ展開する。state.jsの内部
// shuffled()に相当する処理をここに小さく持つ（state.jsをmy-deck.jsに依存させないための分担）。
function expandAndShuffleDeck(cards) {
  const flat = [];
  for (const [cardId, count] of Object.entries(cards || {})) {
    for (let i = 0; i < count; i++) flat.push(cardId);
  }
  for (let i = flat.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [flat[i], flat[j]] = [flat[j], flat[i]];
  }
  return flat;
}
