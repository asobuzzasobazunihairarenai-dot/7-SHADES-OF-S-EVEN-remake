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
import { setCpuBattleActive, setSeatLoadout, clearSeatLoadouts, getCpuPlayerCount } from "./cpu-battle-state.js";
import { resetGame, setupMyDeckMode } from "./state.js";
// マイデッキ戦（本気エイドス戦）用。my-deck.jsはcards-data.jsだけに依存する葉モジュールなので
// ここから安全にimportできる（online.js等は経由しない）。
import { getSelectedDeckId, getDeckById, makeRandomDeck } from "./my-deck.js";

const CPU_SEAT = "C"; // 2人対戦の相手席（AUTO_SEATS_BY_COUNT[2] = ["A","C"]）

// CPU戦のプレイ人数ごとの座席（game-setup.js の AUTO_SEATS_BY_COUNT と一致）。あなた=A、残りがCPU。
const SEATS_BY_COUNT = { 2: ["A", "C"], 3: ["A", "B", "C"], 4: ["A", "B", "C", "D"] };
// 全座席（人数を切り替えても前回のCPU席の名前/アバターが残らないよう、後始末で全部を戻すのに使う）。
const ALL_SEATS = ["A", "B", "C", "D"];
// count人対戦のCPU座席（A以外）を返す。
function cpuSeatsFor(count) {
  const seats = SEATS_BY_COUNT[count] || SEATS_BY_COUNT[2];
  return seats.filter((s) => s !== "A");
}

// CPUの思考時間（＝疑似CPU対象席の基本時間）。短すぎると演出を読む前に次々進んでしまうため、
// 手が見える程度の間を置く。
const CPU_THINK_MS = 1300;
// あなた(A)側の基本時間。実質“急かされない”ようにするための長め設定（15分）。
const HUMAN_BASE_SECONDS = 900;

// オープニング画面の「CPU戦」ボタンから呼ぶ。設定を整え、盤面を空にして（オープニングの
// 裏で）準備する。この後に呼び出し側が close() で盤面を見せ、続けて runCpuBattleSetup() を
// 呼ぶ——そうすると空の盤面の上でセットアップ演出（ファースト配布→盤面配置）が実際に見える。
export async function startCpuBattle(count = getCpuPlayerCount()) {
  // このセッションを「CPU戦」として印を付ける。これが立っている間、ローカルでは自分(A)の番
  // だけでなくCPU席の番も自動処理（フェイズ進行＋自動アクション）で駆動される
  // （phase-automation.js / main.js の getAutoDriveSeat 参照）。
  setCpuBattleActive(true);
  // CPU戦の間だけ、右上の「🎲 セットアップ」ウィザードのボタン／パネルをCSSで隠す
  // （ユーザー要望2026-08-07: CPU対戦時は不要）。オンライン時の非表示と同じ仕組み。
  document.body.classList.add("cpu-battle-mode");
  // A以外の全座席（人数に応じて C / B,C / B,C,D）を疑似CPU（自分以外）で自動化。A は手動のまま。
  setPseudoCpuModeEnabled(true);
  setPseudoCpuIncludeSelf(false);
  setPseudoCpuDeadlineMs(CPU_THINK_MS);
  // フェイズ自動進行が前提（CPUの番を自動で流すため）。既定でONだが念のため明示的に有効化する。
  setAutoProcessingEnabled(true);
  // 疑似CPUの自動プレイはタイマー tick で駆動されるため、タイマーを有効化する。
  setTurnTimerEnabled(true);
  // あなた(A)は時間切れで急かされないよう基本時間を長めに（CPU席はこの値を使わない）。
  setRopeBaseSeconds(HUMAN_BASE_SECONDS);
  // 人数切替で前回のCPU席の名前/アバターが残らないよう、まず全席をクリア。
  for (const seat of ALL_SEATS) {
    setPlayerName(seat, "");
    setPlayerAvatar(seat, null);
  }
  const cpuSeats = cpuSeatsFor(count);
  cpuSeats.forEach((seat, i) => {
    // 相手席の表示名。1体なら「CPU」、複数なら「CPU 1」「CPU 2」…（tutorial-battle.js と同じ setPlayerName）。
    setPlayerName(seat, cpuSeats.length === 1 ? "CPU" : `CPU ${i + 1}`);
    // CPUのアバターは「（基本）託された者たち」＝基本7色アバターを、CPUのファーストカードの色に
    // 連動させる（ユーザー要望2026-08-09）。青年と同じセンチネル方式で、駒が配られ次第その色の
    // アバターへ描画時に解決される（player-identity.js entrustedPathForSeat）。
    setPlayerAvatar(seat, ENTRUSTED_AVATAR);
  });
  // 前回の対戦のデッキ見た目オーバーライドが残らないようクリア（本気エイドス戦で座席ごとに
  // 設定→teardownで消すが、念のため開始時にも消す）。
  clearSeatLoadouts();
  // 起動時の既定盤面（テスト用に4人が座った状態）を空にしておく。こうすると close() で
  // 盤面を見せた瞬間に4人がちらつかず、空の盤面から配布演出を見せられる。
  resetGame();
}

// CPU戦を後始末する（eidos-story.jsのteardownStoryBattleを一般化した版）。ランク戦の
// 「待機中CPU練習」で、マッチ成立時にCPU練習を畳んでオンライン対局へ移る前に呼ぶ。
// 疑似CPU・タイマー・cpu-battle印を全て解除し、相手席の名前/アバターを戻し、盤面を空にする。
// オンライン対局はこの後 subscribeToGame の isOnlineMode/同期timer_config が権威になるので、
// ローカルのpseudoCpu/timerフラグを落としておけば練習のCPU駆動が対局に混入しない。
export async function teardownCpuBattle() {
  setCpuBattleActive(false);
  document.body.classList.remove("cpu-battle-mode");
  setPseudoCpuModeEnabled(false);
  setPseudoCpuIncludeSelf(false);
  setTurnTimerEnabled(false);
  clearSeatLoadouts();
  // 全CPU席（人数に依らず）の名前/アバターを戻す。
  for (const seat of ALL_SEATS) {
    setPlayerName(seat, "");
    setPlayerAvatar(seat, null);
  }
  resetGame(); // 練習の盤面を同期的に空にする
  try {
    const { forceCloseGateInvasionModal } = await import("./gate-invasion-modal.js");
    forceCloseGateInvasionModal();
  } catch (err) {
    /* 無ければ何もしない */
  }
  try {
    const { resetVictoryTracking } = await import("./victory.js");
    resetVictoryTracking(); // 練習で勝利していても、次にまた勝利演出が出るように記録をクリア
  } catch (err) {
    console.error("resetVictoryTracking failed", err);
  }
}

// オープニングを閉じて盤面を見せた「後」に呼ぶ。空の盤面の上で、2人対戦(A/C)のセットアップ
// を演出付き（quickStartのファースト配布・盤面配置アニメ）で実際に見せながら開始する。
export async function runCpuBattleSetup({ noirSeat = null, noirBrands = false, myDeck = false, myDeckA = null, count = getCpuPlayerCount() } = {}) {
  // noirSeat: エイドス物語戦で相手(C)のファースト・駒を黒(noir)にする（配布アニメーションの前に
  // 適用されるので最初から黒く見える）。通常のCPU戦ではnull（＝差し替えなし）。
  // noirBrands: 本気エイドス戦で、ノワールの両端スロットに「誘惑の黒の烙印」を置いて開始する。
  // myDeck: 本気エイドス戦でマイデッキ戦（マイデッキ戦.txt）を有効化する。
  // myDeckA: ユーザー要望2026-08-16「本気エイドス戦でもオンライン戦同様に、マイデッキを選ぶ
  //   ウィンドウを出し、ファースト（開始色）・駒スキン・ペット・裏面まで全部反映してほしい」。
  //   呼び出し側(eidos-story.js)がデッキ選択ウィンドウ(openDeckSelect)で確定した「解決済みデッキ」
  //   {cards, firstColor, pieceSkinIndex, petIndex, cardBackSetIndex} を渡す。無ければ従来通り
  //   「現在選択中のマイデッキ」→おまかせランダムにフォールバックする。
  //
  // まず A のデッキを確定する（開始色を quickStart へ渡す必要があるので配布前に決める）。
  let deckA = null;
  if (myDeck) {
    deckA = myDeckA && myDeckA.cards && Object.keys(myDeckA.cards).length > 0 ? myDeckA : null;
    if (!deckA) {
      const selId = getSelectedDeckId();
      const saved = selId ? getDeckById(selId) : null;
      deckA = saved?.cards && Object.keys(saved.cards).length > 0 ? saved : { cards: makeRandomDeck().cards };
    }
    // 選んだデッキの見た目（駒スキン・ペット・裏面）を A の座席へ一時オーバーライド（グローバル
    // 設定は汚さない。piece-skins/pet-skins/main.jsのcardBackImageForTokenが参照）。配布演出の前に
    // 設定しておくことで、最初の駒・裏面から正しい見た目になる。
    setSeatLoadout("A", {
      pieceSkinIndex: deckA.pieceSkinIndex,
      petIndex: deckA.petIndex,
      cardBackSetIndex: deckA.cardBackSetIndex,
    });
  }
  // 開始色（ファーストカード）を A に反映（デッキに色があれば。おまかせデッキも resolveDeck で
  // ランダム色が確定しているので常に色が入る）。C はノワールへ差し替わるので指定しない。
  const firstColors = deckA?.firstColor ? { A: deckA.firstColor } : null;
  // 本気エイドス戦(myDeck)は必ず2人。通常のCPU戦は count(2〜4)人。
  const seatCount = myDeck ? 2 : count;
  await quickStart(seatCount, false, false, noirSeat, noirBrands, firstColors);
  if (myDeck && deckA) {
    // A: 確定したデッキ、C(エイドス): おまかせランダム（ユーザー合意: エイドスのデッキは一旦
    // ランダム）。cardsは{cardId:count}なので展開＋シャッフルして「一番上=末尾」のcardId配列に
    // してから setupMyDeckMode でパイルとして持たせる。
    const cardsC = makeRandomDeck().cards;
    setupMyDeckMode({ A: expandAndShuffleDeck(deckA.cards), C: expandAndShuffleDeck(cardsC) });
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
