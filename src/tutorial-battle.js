// チュートリアルCPU戦（ホーム画面「🎓 チュートリアルCPU戦」タイル）。
//
// 初心者が1人でCPU(=C)を相手に、決められた展開を必ずなぞりながらルールを体で覚える
// 「台本化された練習試合（フルヤラセ）」。設計方針・段階は
// C:\Users\user\.claude\plans\abundant-churning-whisper.md 参照。
//
// 重要な設計判断（調査で判明）: フェイズ自動処理（phase-automation.js
// reconcilePhaseAutomation）は turnPlayer===getSelfSeat() の時だけ有効で、ローカルでは
// getSelfSeat()が常に "A" のため、疑似CPUエンジンは非自席(C)の手番を進められない。
// そこで本モジュールを「唯一の振付師」とし、CPU(=C)の手番は既存のアクション
// （moveToken/nextTurn 等）を直接呼んで台本通りに実行する（Phase D/E）。タイマー・
// 疑似CPUフラグには依存しない。カード効果/到達効果の自動処理（card-effect-engine.js、
// 既定ON）はそのまま活かす。
//
// 完全ローカル機能（サーバー/オンライン非関与）。

import { setupTutorialScenario, setTurnPlayer, subscribe, getState, moveToken, tutorialLockCard, hydrateState, flipToken, nextTurn, drawFromPile } from "./state.js";
import { resetVictoryTracking } from "./victory.js";
import { resetMatchStats } from "./match-stats-tracker.js";
import { resetHandEffectUsage, isAutoProcessingEnabled, setAutoProcessingEnabled } from "./card-effect-engine.js";
import { SEAT_TO_SIDE, GATE_POSITIONS, COLORS } from "./board-layout.js";
import { getCardImagePath } from "./cards-data.js";
import { setPlayerName, setPlayerAvatar } from "./player-identity.js";

// チュートリアルCPU戦の相手（案内人エイドス）の表示名とアバター（ユーザー要望2026-08-08）。
// 正式名は「謎めいた案内人 エイドス・ノワール」、通称「案内人エイドス」。アバターは既存の
// 有料アバター eidos-noir（front/left/right・盤面の向きは自動で切替）を流用する。
const EIDOS_NAME = "案内人エイドス";
const EIDOS_AVATAR = "assets/avatars/eidos-noir-front.webp";
import {
  showBlockingHint,
  hideBlockingHint,
  showTip,
  hideTip,
  setHighlights,
  clearHighlights,
  setBubbles,
  clearBubbles,
  flashWarning,
  showRestartButton,
  hideRestartButton,
  showQuitButton,
  teardownTutorialBattleUi,
} from "./tutorial-battle-ui.js";

// 5枚ロック演出で使うロック効果アニメ（main.jsのtriggerLockEffect）を注入してもらう
// （setup-animation.js等と同じ「main.jsから実装を渡してもらう」パターン。循環import回避）。
let triggerLockEffectHelper = null;
let playScriptedContactHelper = null;
let flyBoardCardToHandHelper = null;
let flyDrawnCardToHandHelper = null;
export function registerTutorialBattleHelpers({ triggerLockEffect, playScriptedContact, flyBoardCardToHand, flyDrawnCardToHand } = {}) {
  triggerLockEffectHelper = triggerLockEffect ?? null;
  playScriptedContactHelper = playScriptedContact ?? null;
  flyBoardCardToHandHelper = flyBoardCardToHand ?? null;
  flyDrawnCardToHandHelper = flyDrawnCardToHand ?? null;
}

// チュートリアル終了時にホーム画面へ戻すための注入（home-screen.jsがtutorial-battle.jsを
// importしているため、逆向きに直接importすると循環参照になる。home-screen.js側から
// openHomeScreenを渡してもらう）。ユーザー要望「チュートリアルが終了したらホーム画面へ」。
let openHomeFn = null;
export function registerTutorialHomeOpener(fn) {
  openHomeFn = fn ?? null;
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
// 「○○のターン」トーストが完全に消えるまでの時間（turn-announce.js: 2200ms表示＋500ms
// フェード）＋余白。CPUの駒移動がトーストと被らないよう、これだけ待ってから動かす。
const TURN_ANNOUNCE_MS = 2900;

// --- 台本の色・カード割り当て ---------------------------------------------------------
// あなた(A)=赤、CPU(C)=青。ロックエリアは「残り2色（緑・紫）」の状態から始める。
// アーク（ユーザー確認済み）:
//  ターン1: 目の前の「ゴメンナサイ」に到達して到達効果（さらに1マス移動）を実際に体験
//           →紫カードを入手／手札効果を体験／接触を体験。
//  ターン2: 紫をロック（6色目）→相手ゲートへ侵攻→ゲート侵攻ボーナスでエターナル（緑）を
//           獲得・ロック（7色目）→勝利。
const SELF_SEAT = "A";
const CPU_SEAT = "C";
const SELF_COLOR = "red";
const CPU_COLOR = "blue";

// ターン1で入手・ロックする色（ゴメンナサイ＝紫）と、ターン2の最後にロックして勝つ色
// （ゲート侵攻ボーナスのエターナル＝緑）。この2色のスロットだけ空けて始める。
const FIRST_TARGET_COLOR = "purple";
export const WINNING_COLOR = "green";

// 開始時にロックされているのは、あなた(A)のファーストカード（赤）だけ。ここから始め、
// 導入の演出で残り4色（橙・黄・青・桃）が順にロックされ、緑と紫を残した「あと2色」になる。
const INITIAL_LOCK = { color: SELF_COLOR, cardId: "first-red" };
// 導入演出で、あとから順にロックされる4色（緑・紫以外の残り）。実際のゲームで集めてきた
// 体で通常カードを使う。
const REVEAL_LOCKS = [
  { color: "orange", cardId: "orange-mass-change" },
  { color: "yellow", cardId: "yellow-gamble" },
  { color: "blue", cardId: "blue-slum-official" },
  { color: "pink", cardId: "pink-party" },
];

// あなたの駒({6,3})の1マス前(={5,3})に、表向きの「ゴメンナサイ」(紫)を置く。ここへ移動して
// 到達効果（さらに1マス移動）を体験し、紫カードを手札に加える。row0=奥(C側),row6=手前(A側)
// なので「前へ進む」=rowを1減らす。
const ARRIVAL_CELL = { row: 5, col: 3, cardId: "purple-sorry" };
// ゴメンナサイの到達効果「さらに1マス移動できる」を台本で見せる時の、追加で進むマス(={4,3})。
const ARRIVAL_BONUS_CELL = { row: 4, col: 3 };
// CPUターンで、CPUの駒がジャンプ台等で近づいてくる先。あなたの駒(={4,3})の隣(={3,3})に
// 来させ、ターン2で「接触」を体験できるようにする。
const CPU_APPROACH_MID = { row: 2, col: 3 }; // 一気に接近する途中（ジャンプ台の見せ場）
const CPU_ADJ_CELL = { row: 3, col: 3 }; // あなたの隣

// ターン2ハンドフェイズ: 「プレゼント」の手札効果で、相手(CPU={3,3})の隣の空きマス{2,3}へ
// 裏向きで置く。{2,3}は盤面セットアップで空マスにしておく（buildScenario参照）。
const HAND_EFFECT_CARD = "pink-present";
const PRESENT_CELL = { row: 2, col: 3 };
// プレゼントの手札効果で「相手の隣に置く」候補＝CPU({3,3})の上下左右4マス。プレイヤーに
// 選ばせる（ユーザー要望「相手の周り4マスをハイライト→マス選択」）。
const PRESENT_TARGET_CELLS = [
  { row: CPU_ADJ_CELL.row - 1, col: CPU_ADJ_CELL.col }, // {2,3}
  { row: CPU_ADJ_CELL.row + 1, col: CPU_ADJ_CELL.col }, // {4,3}
  { row: CPU_ADJ_CELL.row, col: CPU_ADJ_CELL.col - 1 }, // {3,2}
  { row: CPU_ADJ_CELL.row, col: CPU_ADJ_CELL.col + 1 }, // {3,4}
];
// ターン2ムーブフェイズの接触で、CPU(defender)が強制移動する自分のゲート（上辺中央）。
const CPU_GATE = GATE_POSITIONS[SEAT_TO_SIDE[CPU_SEAT]]; // {row:0,col:3}
// 接触後のCPUターンで、CPUがゲートから1マス出る先（ターン3で相手ゲートを空けるため）。
const CPU_LEAVE_CELL = { row: 1, col: 3 };

// あなたの初期手札は「空」で始める（物理ルール通り＝1ターン目はまだ手札が無いので
// ムーブフェイズから始まる、という説明をチュートリアルで見せるため）。ターン2ハンド
// フェイズの「プレゼント」、ターン3の「ジャンプ台」は、必要になったタイミングで山札から
// 引く形（＝練習用に配る）にする。山札の並びはDECK_ORDER参照。
const SELF_HAND = [];
// CPUの初期手札（接触で1枚奪う体験のため数枚持たせる。中身は裏向きで見えない）。
const CPU_HAND = ["blue-choosable-trap", "pink-present", "orange-harvest-sow"];

// 盤面49マスの裏向きフィラー（表向きの特別マス以外を埋める）。中身は裏向きで見えないため
// 決定的な循環リストで十分。
const FILLER_CARDS = [
  "red-counter-lock",
  "orange-harvest-sow",
  "yellow-sleight-of-hand",
  "green-joint-construction",
  "blue-choosable-trap",
  "pink-present",
  "purple-trial-ritual",
];

// 山札（残り）・エターナルの決定的な並び。末尾＝一番上＝最初に引かれる、という既存の約束。
// 開始手札を空にしたので、練習で使うカードはこの山札の上から順に「配る（引く）」:
//  ①ターン2ハンドフェイズ開始で pink-present を配る（一番上）
//  ②その pink-present の手札効果『1枚ドロー』で orange-harvest-sow（中立の橙）を引く
//  ③ターン3のムーブ前に red-jump-pad を配る
// 従って上から: pink-present, orange-harvest-sow, red-jump-pad の順（＝配列の末尾から）。
const DECK_ORDER = ["yellow-gamble", "orange-mass-change", "blue-slum-official", "pink-party", "purple-sorry", "red-jump-pad", "orange-harvest-sow", "pink-present"];
// 末尾＝一番上＝最初に引かれる。ターン2の相手ゲート侵攻ボーナスで「緑」のエターナルを
// 獲得させたいので、eternal-green を一番上に置く。
const ETERNAL_ORDER = ["eternal-red", "eternal-purple", "eternal-pink", "eternal-blue", "eternal-yellow", "eternal-orange", "eternal-green"];

// 決定的なシナリオ盤面（state.jsのTUTORIAL_SCENARIO_SETUPが解釈する形）を組み立てる。
function buildScenario() {
  const selfSide = SEAT_TO_SIDE[SELF_SEAT]; // "bottom"
  const cpuSide = SEAT_TO_SIDE[CPU_SEAT]; // "top"

  const pieces = [
    { color: SELF_COLOR, player: SELF_SEAT, location: { zone: "cell", ...GATE_POSITIONS[selfSide] } },
    { color: CPU_COLOR, player: CPU_SEAT, location: { zone: "cell", ...GATE_POSITIONS[cpuSide] } },
  ];

  // 開始時は赤のファーストカード1枚だけロック済み（残り5色は導入演出で順にロックする）。
  const locks = [{ side: selfSide, color: INITIAL_LOCK.color, cardId: INITIAL_LOCK.cardId }];

  // 49マスを裏向きフィラーで埋め、特別マスだけ決め打ちで上書きする。
  //  {5,3}=ゴメンナサイ(表向き、最初の到達先)。
  //  {4,3}=ゴメンナサイの「さらに1マス移動」で開く移動先。緑・紫（=このアークの入手対象色）は
  //        避け、赤（既ロック色）のカウンターロックにしておく（連鎖で開いても手札の勝敗計画に
  //        影響しない。到達効果は「1番少なくロックしているなら1ドロー」で、このプレイヤーは
  //        不発になり“不発”の実例にもなる）。
  const board = [];
  let fillerIndex = 0;
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      if (row === ARRIVAL_CELL.row && col === ARRIVAL_CELL.col) {
        board.push({ row, col, cardId: ARRIVAL_CELL.cardId, faceUp: true });
      } else if (row === ARRIVAL_BONUS_CELL.row && col === ARRIVAL_BONUS_CELL.col) {
        board.push({ row, col, cardId: "red-counter-lock", faceUp: false });
      } else if (row === PRESENT_CELL.row && col === PRESENT_CELL.col) {
        // ターン2の「プレゼント」手札効果でここへ裏向きに置くため、空マスにしておく。
        continue;
      } else {
        board.push({ row, col, cardId: FILLER_CARDS[fillerIndex % FILLER_CARDS.length], faceUp: false });
        fillerIndex++;
      }
    }
  }

  return {
    activePlayers: [SELF_SEAT, CPU_SEAT],
    pieces,
    hands: { [SELF_SEAT]: SELF_HAND, [CPU_SEAT]: CPU_HAND },
    locks,
    board,
    piles: { deck: [...DECK_ORDER], eternal: [...ETERNAL_ORDER], first: [], discard: [] },
  };
}

// --- チュートリアル対戦がアクティブかどうか（既存のtutorial.js初回オーバーレイの二重
// 発火を抑制するために公開する。tutorial.jsのinitTutorialAutoStartが参照する） ----------
let battleActive = false;
export function isTutorialBattleActive() {
  return battleActive;
}

// --- 盤面上のセル・DOMセレクタ（台本のハイライト/吹き出し/前方誘導に使う） --------------
const GATE_CELL = GATE_POSITIONS[SEAT_TO_SIDE[SELF_SEAT]]; // {row:6,col:3}
const FRONT_CELL = { row: ARRIVAL_CELL.row, col: ARRIVAL_CELL.col }; // {5,3}（目の前のゴメンナサイ）
const LEFT_CELL = { row: GATE_CELL.row, col: GATE_CELL.col - 1 }; // {6,2}
const RIGHT_CELL = { row: GATE_CELL.row, col: GATE_CELL.col + 1 }; // {6,4}
// ゴメンナサイ到達後の「さらに1マス移動」ボーナス移動：{5,3}から前方{4,3}（カウンターロック）を
// 選ばせる（左右{5,2}{5,4}は警告のみ）。
const BONUS_FRONT = { row: ARRIVAL_BONUS_CELL.row, col: ARRIVAL_BONUS_CELL.col }; // {4,3}
const BONUS_LEFT = { row: FRONT_CELL.row, col: FRONT_CELL.col - 1 }; // {5,2}
const BONUS_RIGHT = { row: FRONT_CELL.row, col: FRONT_CELL.col + 1 }; // {5,4}
// T1で入手・手札化するカード（到達順）。ゴメンナサイ(紫)→カウンターロック(赤)。
const ARRIVAL_BONUS_CARD = "red-counter-lock"; // {4,3}に伏せてあり、ボーナス移動でオープン
const cellSel = (c) => `.cell[data-row="${c.row}"][data-col="${c.col}"]`;
const LOCK_AREA_SEL = ".lock-bottom";
const PHASE_GUIDE_SEL = "#phase-guide-bar"; // 右下のフェイズ案内板（ロック/ハンド/ムーブ）
const slotSel = (color) => `.lock-slot[data-side="${SEAT_TO_SIDE[SELF_SEAT]}"][data-index="${COLORS.indexOf(color)}"]`;
const GREEN_SLOT_SEL = slotSel(WINNING_COLOR); // 緑（ターン2の最終ロック）
const PURPLE_SLOT_SEL = slotSel(FIRST_TARGET_COLOR); // 紫（ターン1で入手）
const SELF_PIECE_SEL = `${cellSel(GATE_CELL)} .piece`; // 導入時点では駒はゲートにいる
const CPU_PIECE_SEL = `${cellSel(GATE_POSITIONS[SEAT_TO_SIDE[CPU_SEAT]])} .piece`;
const ARRIVAL_ICON = "assets/icons/arrival-effect.png";
const HAND_EFFECT_ICON = "assets/icons/hand-effect.png";

// --- シナリオ・ドライバ ----------------------------------------------------------------
// 台本を線形のステップ配列として持ち、state.jsのsubscribe()で状態変化を監視して進める。
// ステップ種類:
//  - narrate:      ブロッキング説明（暗幕＋右端/中央コールアウト＋「次へ」ボタンで手動進行）。
//  - reveal:       演出だけを実行して自動で次へ（5枚ロック演出など）。
//  - playerAction: ノンブロッキング小ヒント＋盤面ハイライトで操作を促し、想定操作を検知して
//                  自動で次へ。moveGateを持つステップは「前方以外へ動いたら差し戻して警告」する。
// visuals（highlights/bubbles）は盤面がrender()で作り直されるため、状態変化のたびに再適用する。
let steps = [];
let stepIndex = -1;
let unsubscribe = null;
let scriptRunning = false; // 台本が自分でmoveToken等を呼んでいる間の再入防止
let savedAutoProcessing = null; // チュートリアル前の自動処理設定（終了時に戻す）
let tapHandlerAttached = false; // タップ操作用のdocumentクリックリスナーを付けているか

function selfPiece(state) {
  return state.tokens.find((t) => t.kind === "piece" && t.player === SELF_SEAT);
}
function selfPieceAt(state, cell) {
  const p = selfPiece(state);
  return p && p.location.zone === "cell" && p.location.row === cell.row && p.location.col === cell.col;
}
function selfHasCardInHand(state, cardId) {
  return state.tokens.some(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === SELF_SEAT && t.cardId === cardId
  );
}
// あなた(A)のロックエリアに、指定色のカードがロックされているか。
function selfHasLockedColor(state, color) {
  const side = SEAT_TO_SIDE[SELF_SEAT];
  const idx = COLORS.indexOf(color);
  return state.tokens.some(
    (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === idx
  );
}
// あなた(A)の手札にあるカードのうち、指定cardIdの手札カードのDOMセレクタ（動的ハイライト用）。
function selfHandCardSelector(state, cardId) {
  const t = state.tokens.find(
    (x) => x.kind === "card" && x.location.zone === "hand" && x.location.player === SELF_SEAT && x.cardId === cardId
  );
  return t ? `.hand-card[data-token-id="${t.id}"]` : null;
}
// あなた(A)の駒を「今いるマス」で常にスポットライトするためのハイライト指定（動的）。
// ユーザー要望「（T1の到達演出の間）駒はずっとスポットライト」。駒が移動しても追従する。
function selfPieceHl(state, { strong = true } = {}) {
  const p = selfPiece(state);
  if (!p || p.location.zone !== "cell") return [];
  return [{ selector: `${cellSel({ row: p.location.row, col: p.location.col })} .piece`, strong }];
}
// 相手（CPU=エイドス）の駒＋アバターを照らす（ユーザー要望2026-08-14: 相手のターンの案内で
// 画面フォーカスを相手のアバターと駒に当てる）。駒は現在地のマス、アバターは data-player 指定。
function cpuPieceAndAvatarHl(state, { strong = true } = {}) {
  const hls = [{ selector: `.player-avatar[data-player="${CPU_SEAT}"]`, strong }];
  const p = state.tokens.find((t) => t.kind === "piece" && t.player === CPU_SEAT);
  if (p && p.location.zone === "cell") {
    hls.push({ selector: `${cellSel({ row: p.location.row, col: p.location.col })} .piece`, strong });
  }
  return hls;
}
// 盤面のマスにある指定カード（cardId）のDOMセレクタ（拡大表示ではなく点滅ハイライト用）。
function boardCardSelectorAt(cell) {
  return `${cellSel(cell)} .board-card`;
}

function buildSteps() {
  return [
    // 0: 導入。モーダルは画面左側に出す旨を説明する（ユーザー要望）。
    {
      kind: "narrate",
      title: "チュートリアルCPU戦へようこそ",
      body: [
        "これから、CPUを相手にした練習試合で遊び方を覚えていきます。",
        "説明のモーダルは、盤面を見ながら読めるように画面の左側に表示します。",
      ],
      buttonLabel: "はじめる →",
    },
    // 1: 目標＋ロックエリアの位置（点滅ハイライト）。
    {
      kind: "narrate",
      title: "目標・勝利条件",
      body: [
        "目標は、自分のロックエリアに7色すべてのカードを集めてロックすることです。",
        "あなたのロックエリアはここです。",
      ],
      highlights: [{ selector: LOCK_AREA_SEL, strong: true }],
      buttonLabel: "次へ",
    },
    // 2: 3フェイズの説明（右下のフェイズ案内板をスポットライト）。丁寧に1枚ずつ。
    {
      kind: "narrate",
      title: "1ターンの流れ",
      body: [
        "1ターンは「ロック → ハンド → ムーブ」の3つのフェイズを、この順番で行います。",
        "画面の右下にある「フェイズ案内板」が、今どのフェイズかを教えてくれます。",
      ],
      highlights: [{ selector: PHASE_GUIDE_SEL, strong: true }],
      buttonLabel: "次へ",
    },
    // 2b: 各フェイズの中身（箇条書き）＋「1ターン目は手札が無いのでムーブから」。
    {
      kind: "narrate",
      title: "3つのフェイズ",
      body: [
        { bullets: [
          "ロック：手札のカードをロックエリアに置く",
          "ハンド：手札のカードの効果を使う",
          "ムーブ：駒を動かす",
        ] },
        "1ターン目はまだ手札が無いので、ロックとハンドは飛ばして、ムーブフェイズ（駒を動かす）から始めます。",
      ],
      highlights: [{ selector: PHASE_GUIDE_SEL, strong: true }],
      buttonLabel: "次へ",
    },
    // 2c: 「あと2色（緑・紫）から始める」（ロックエリアを強調）。
    {
      kind: "narrate",
      title: "この練習の状況",
      body: [
        "この練習では、あなたはあと2色（緑と紫）を残すところから始めます。実際に手を動かしながら覚えていきましょう。",
      ],
      highlights: [{ selector: LOCK_AREA_SEL }],
      buttonLabel: "次へ",
    },
    // 3: ファーストカード以外の4色が順にロックされる演出（自動で次へ）。
    {
      kind: "reveal",
      tip: "これまで集めてきたカードをロックしていきます…",
      runReveal: revealFiveLocks,
    },
    // 4: 自分の駒・相手の駒（点滅＋吹き出し）。
    {
      kind: "narrate",
      title: "あなたと相手の駒",
      body: [
        "画面手前の赤い駒があなたの駒です。",
        "奥にいる青い駒が対戦相手（CPU）です。",
      ],
      highlights: [
        { selector: SELF_PIECE_SEL, strong: true },
        { selector: CPU_PIECE_SEL },
      ],
      bubbles: [
        { selector: SELF_PIECE_SEL, text: "自分の駒" },
        { selector: CPU_PIECE_SEL, text: "相手の駒" },
      ],
      buttonLabel: "次へ",
    },
    // 5: 空いている2スロット（緑・紫）を点滅ハイライト。
    {
      kind: "narrate",
      title: "あと2色！",
      body: [
        "あなたのロックエリアで空いているのは「緑」と「紫」の2つのスロットです。",
        "この2色をそろえれば、7色そろって勝利です。まずは目の前のカードで「紫」を手に入れにいきましょう。",
      ],
      highlights: [
        { selector: GREEN_SLOT_SEL, strong: true },
        { selector: PURPLE_SLOT_SEL, strong: true },
      ],
      buttonLabel: "次へ",
    },
    // 6: ムーブ（前方誘導）。前方＝目の前の「ゴメンナサイ」。左右前方3マスをハイライトし前方を最強調。
    //    チュートリアル中はタップ移動のみ（駒のドラッグは無効、main.jsのfindDraggableAt参照）。
    //    前方以外へ動こうとしたら差し戻して警告する。
    {
      kind: "playerAction",
      // ここで手番開始（自動処理はOFFなのでフェイズ待ちは起きない）。タップ移動の
      // リスナー付与はUI表示側(showStepUi)で行う（戻る操作での復帰時にも再付与するため）。
      onEnter: () => setTurnPlayer(SELF_SEAT),
      onLeave: detachTapHandler,
      tip: "あなたの駒を、1マス前の「ゴメンナサイ」のカードへタップで動かしましょう。",
      highlights: (state) => [
        { selector: cellSel(FRONT_CELL), strong: true },
        { selector: cellSel(LEFT_CELL) },
        { selector: cellSel(RIGHT_CELL) },
        ...selfPieceHl(state),
      ],
      moveGate: true,
      gateFrom: GATE_CELL, // 誤って動いた時の差し戻し先
      gateFront: FRONT_CELL, // 受理する移動先（ゴメンナサイ{5,3}）
      gateSides: [LEFT_CELL, RIGHT_CELL],
      gateWarn: "今回は、目の前の「ゴメンナサイ」のカードへ進みましょう。",
      advanceWhen: (state) => selfPieceAt(state, FRONT_CELL),
      onAccept: () => playArrivalBurst(FRONT_CELL, ARRIVAL_CELL.cardId), // 到達演出（柱状バースト）だけ
    },
    // 7: ゴメンナサイ拡大＋到達効果の説明（ユーザー指定の文面）。駒はスポットライト継続。
    {
      kind: "narrate",
      title: "到達効果",
      icon: ARRIVAL_ICON,
      body: [
        { cardImage: getCardImagePath(ARRIVAL_CELL.cardId) },
        "表向きのカードに駒を乗せると「到達」となり、そのカードの到達効果が自動的に発動します。",
        { iconText: { image: ARRIVAL_ICON, text: "カード効果欄にあるこのアイコンは「到達効果」を表す目印です。" } },
      ],
      highlights: (state) => selfPieceHl(state),
      buttonLabel: "次へ",
    },
    // 8: 「さらに1マス移動できる」の説明→この後プレイヤーがボーナス移動を選ぶ。
    {
      kind: "narrate",
      title: "到達効果",
      icon: ARRIVAL_ICON,
      body: [
        "いま到達した「ゴメンナサイ」の到達効果は『さらに1マス移動できる』です。駒をもう1マス奥へ進めましょう。移動先のカードもオープンされます（＝そこでも到達効果が発動します）。",
      ],
      highlights: (state) => selfPieceHl(state),
      buttonLabel: "次へ",
    },
    // 9: ボーナス移動（プレイヤーが前方を選ぶ）。{5,3}→前方{4,3}。左右{5,2}{5,4}は警告のみ。
    {
      kind: "playerAction",
      tip: "駒をもう1マス、奥（前方）のマスへタップで進めましょう。",
      highlights: (state) => [
        { selector: cellSel(BONUS_FRONT), strong: true },
        { selector: cellSel(BONUS_LEFT) },
        { selector: cellSel(BONUS_RIGHT) },
        ...selfPieceHl(state),
      ],
      moveGate: true,
      gateFrom: FRONT_CELL, // 差し戻し先はゴメンナサイのマス
      gateFront: BONUS_FRONT, // 受理する移動先（カウンターロック{4,3}）
      gateSides: [BONUS_LEFT, BONUS_RIGHT],
      gateWarn: "今回は、奥（前方）のマスへ進みましょう。",
      advanceWhen: (state) => selfPieceAt(state, BONUS_FRONT),
      // 移動先{4,3}のカード（カウンターロック）をオープンし、そこでも到達演出を出す。
      onAccept: async () => {
        const dest = getState().tokens.find(
          (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === BONUS_FRONT.row && t.location.col === BONUS_FRONT.col
        );
        if (dest && !dest.faceUp) flipToken(dest.id);
        await playArrivalBurst(BONUS_FRONT, ARRIVAL_BONUS_CARD);
      },
    },
    // 10: 「処理が全て終わってから紫が手札へ」→次へでゆっくり吸い込みアニメ。
    {
      kind: "narrate",
      title: "到達効果",
      icon: ARRIVAL_ICON,
      body: [
        "到達効果の処理が全て終わってから、到達したカード（紫）が手札に加わります。",
      ],
      highlights: (state) => [{ selector: boardCardSelectorAt(FRONT_CELL), strong: true }, ...selfPieceHl(state)],
      buttonLabel: "次へ",
      // 次へで、ゴメンナサイ(紫)を盤面{5,3}からゆっくり手札へ吸い込む。
      afterNext: () => suctionCardToHand(ARRIVAL_CELL.cardId, FRONT_CELL),
    },
    // 11: 紫が手札に入ったことの確認。手札の紫カードを強調。
    {
      kind: "narrate",
      title: "「紫」が手札に入りました",
      body: [
        "これで手札に「紫」のカードが入りました。この後のロックフェイズでロックすれば6色目になります。",
      ],
      highlights: (state) => {
        const sel = selfHandCardSelector(state, ARRIVAL_CELL.cardId);
        return [...(sel ? [{ selector: sel, strong: true }] : []), ...selfPieceHl(state)];
      },
      buttonLabel: "次へ",
    },
    // 12: カウンターロック拡大＋「不発でも処理は終わったとみなす」→次へでゆっくり手札へ。
    {
      kind: "narrate",
      title: "到達効果",
      icon: ARRIVAL_ICON,
      body: [
        { cardImage: getCardImagePath(ARRIVAL_BONUS_CARD) },
        "移動先の「カウンターロック」にも到達しましたが、今回は条件を満たさず不発でした。",
        { text: "※条件を満たさず不発に終わったカードも、処理が終わったとみなされます。", note: true },
      ],
      highlights: (state) => [{ selector: boardCardSelectorAt(BONUS_FRONT), strong: true }, ...selfPieceHl(state)],
      buttonLabel: "次へ",
      // 次へで、カウンターロック(赤)を盤面{4,3}からゆっくり手札へ吸い込む。
      afterNext: () => suctionCardToHand(ARRIVAL_BONUS_CARD, BONUS_FRONT),
    },
    // 13: 1ターン目を終了して相手（CPU）の番へ。
    {
      kind: "narrate",
      title: "ターンを終了する",
      body: [
        "あなたの1ターン目はここまでです。手札には「紫（ゴメンナサイッ！）」と「赤（カウンターロック）」が入りました。",
        "自分の行動が済んだら「ターンを終了」して、相手（CPU）に手番を渡します。",
      ],
      highlights: (state) => selfPieceHl(state),
      buttonLabel: "ターンを終了する →",
    },
    // 10.5: CPUターンの前置き（ユーザー要望「いきなり赤の隣に来るのは不自然。『チュートリアル
    //       のため一気に赤の駒の隣に移動します』とモーダルで明示する」）。「次へ」で実際の移動を再生。
    {
      kind: "narrate",
      title: "相手（CPU）のターン",
      body: [
        "ここからは相手（CPU）の番です。本来CPUは自分のゲートから少しずつ近づいてきますが、",
        "このチュートリアルでは、接触を体験してもらうため、CPUの駒を一気にあなたの駒の隣へ移動させます。",
      ],
      // #5: 相手の番なので、画面フォーカスを相手（エイドス）のアバターと駒に当てる。
      highlights: (state) => cpuPieceAndAvatarHl(state, { strong: true }),
      buttonLabel: "CPUを動かす →",
      afterNext: scriptCpuApproach, // 「次へ」で実際にCPUを動かす
    },
    // 11: ターン2の案内（ロックフェイズ）。紫スロットとロックエリアを強調。
    {
      kind: "narrate",
      title: "あなたのターン2 ― ロックフェイズ",
      body: [
        "ここからあなたのターン2です。ターンは「ロック → ハンド → ムーブ」の順に進みます。",
        "まずロックフェイズ。さっき手に入れた「紫」のカードをロックして6色目にしましょう。",
      ],
      highlights: [
        { selector: PURPLE_SLOT_SEL, strong: true },
        { selector: LOCK_AREA_SEL },
      ],
      buttonLabel: "次へ",
    },
    // 12: 紫をロックする（プレイヤー操作＝手札の紫をタップで自動ロック。ユーザー要望
    //     「ゴメンナサイのロックはドロップではなく手札をタップで自動でロック」）。
    {
      kind: "playerAction",
      tip: "手札の「紫」のカードをクリックして、紫のスロットにロックしましょう。",
      handEffectCard: ARRIVAL_CELL.cardId, // 紫(purple-sorry)をクリック/タップで起動
      onHandEffect: scriptLockPurple,
      highlights: (state) => {
        const arr = [{ selector: PURPLE_SLOT_SEL, strong: true }];
        const cardSel = selfHandCardSelector(state, ARRIVAL_CELL.cardId);
        if (cardSel) arr.unshift({ selector: cardSel, strong: true });
        return arr;
      },
    },
    // 13: ロック完了。残りは緑だけ。
    {
      kind: "narrate",
      title: "6色目をロック！",
      body: [
        "紫をロックして6色そろいました。残るは「緑」の1色だけです。",
        "この後、ハンドフェイズで手札効果を使い、ムーブフェイズで相手に「接触」してみましょう。",
      ],
      highlights: [{ selector: GREEN_SLOT_SEL, strong: true }],
      buttonLabel: "次へ",
    },
    // 14: ハンドフェイズの案内（手札効果とは）。開始手札は空なので、練習用に「プレゼント」を
    //     ここで1枚配る（「次へ」で山札の一番上＝プレゼントを手札へ）。
    {
      kind: "narrate",
      title: "ハンドフェイズ ― 手札効果",
      body: [
        "次はハンドフェイズです。手札のカードには、盤面に出す代わりに手札のまま使える「手札効果」を持つものがあります。",
        "手札効果を体験するため、練習用に「プレゼント」のカードを1枚お配りします。",
      ],
      buttonLabel: "カードを受け取る →",
      afterNext: deliverTopDeckCard, // 山札の一番上（pink-present）を手札へ
    },
    // 15: 配ったプレゼントの説明（カード拡大＋手札効果アイコンの説明。到達効果モーダルと同様）。
    {
      kind: "narrate",
      title: "ハンドフェイズ ― 手札効果",
      icon: HAND_EFFECT_ICON,
      body: [
        { cardImage: getCardImagePath(HAND_EFFECT_CARD) },
        "「プレゼント」が手札に入りました。この手札効果は『相手の隣にカードを置き、さらに1枚ドローする』です。",
        { iconText: { image: HAND_EFFECT_ICON, text: "カード効果欄にあるこのアイコンは「手札効果」を表す目印です。" } },
      ],
      highlights: (state) => {
        const sel = selfHandCardSelector(state, HAND_EFFECT_CARD);
        return sel ? [{ selector: sel, strong: true }] : [];
      },
      buttonLabel: "次へ",
    },
    // 15: プレゼントの手札効果を使う（プレイヤー操作＝手札のカードをタップ）。タップしたら
    //     置き場所の選択（次ステップ）へ進む。
    {
      kind: "playerAction",
      tip: "手札の「プレゼント」をタップして、手札効果を使いましょう。",
      handEffectCard: HAND_EFFECT_CARD,
      onHandEffect: async () => {}, // タップで置き場所選択ステップへ進むだけ（配置は次ステップ）
      highlights: (state) => {
        const sel = selfHandCardSelector(state, HAND_EFFECT_CARD);
        return sel ? [{ selector: sel, strong: true }] : [];
      },
    },
    // 16: 置き場所を選ぶ（相手の周り4マスをハイライト→タップで配置＋1枚ドロー）。
    {
      kind: "playerAction",
      tip: "「プレゼント」を置くマスを選びましょう（相手＝CPU先生の隣の4マス）。",
      placeCells: PRESENT_TARGET_CELLS,
      onPlace: placePresentAt,
      highlights: PRESENT_TARGET_CELLS.map((c) => ({ selector: cellSel(c), strong: true })),
    },
    // 17: 手札効果の結果。
    {
      kind: "narrate",
      title: "手札効果を使いました",
      body: [
        "「プレゼント」を相手（CPU先生）の隣のマスに裏向きで置き、山札から1枚ドローしました。",
        "このように、ハンドフェイズでは手札のカードを効果として使えます（使ったカードは基本的に使用前に捨て札へ移りますが、今回のようにそのカードの処遇が書かれていればそれに従います）。",
      ],
      buttonLabel: "次へ",
    },
    // 17: ムーブフェイズ＝接触の案内。
    {
      kind: "narrate",
      title: "ムーブフェイズ ― 接触",
      body: [
        "最後はムーブフェイズです。移動の代わりに、隣にいる相手の駒へ「接触」することができます。",
        "接触すると相手の手札を1枚（無作為に）奪い、その相手は自分のゲートへ強制的に戻されます。隣のCPUに接触してみましょう。",
      ],
      highlights: [
        { selector: `${cellSel(CPU_ADJ_CELL)} .piece`, strong: true },
        { selector: cellSel(CPU_ADJ_CELL) },
      ],
      buttonLabel: "次へ",
    },
    // 18: 接触する（プレイヤー操作＝隣のCPUの駒のマスをタップ）。
    {
      kind: "playerAction",
      tip: "隣にいる相手（CPU）の駒をタップして「接触」しましょう。",
      contactCell: CPU_ADJ_CELL,
      onContact: scriptContact,
      highlights: [
        { selector: `${cellSel(CPU_ADJ_CELL)} .piece`, strong: true },
        { selector: cellSel(CPU_ADJ_CELL) },
      ],
    },
    // 19: 接触の結果。
    {
      kind: "narrate",
      title: "接触しました！",
      body: [
        "相手（CPU）の手札を1枚奪い、CPUは自分のゲート（盤面の奥）へ強制移動で戻されました。",
        "相手は自分のゲートにカードがあったので、そのカードもオープンし到達します。",
      ],
      buttonLabel: "ターンを終了する →",
    },
    // 20: CPU（相手）の台本ターン。ゲートから1マス出てくる（自動で次へ）。
    {
      kind: "reveal",
      tip: "相手（CPU）のターンです。ゲートから出て動きます…",
      runReveal: scriptCpuLeaveGate,
    },
    // === ターン3: 空いた相手ゲートへ侵攻 → ゲート侵攻ボーナスでエターナル「緑」→ 7色で勝利 ===
    // 21: ターン3の導入（あなたのターン。相手ゲートが空いている）。
    {
      kind: "narrate",
      title: "ターン3 ― 最後の仕上げ",
      body: [
        "あなたのターンです。CPU先生がゲートから出たので、盤面の奥にある相手のゲートが空いています。",
        "ムーブフェイズで、その空いた相手ゲートへ攻め込みましょう。ターン終了時に相手ゲートへ自分の駒が乗っていると「相手ゲート侵攻ボーナス」が発生します。",
      ],
      highlights: (state) => [{ selector: cellSel(CPU_GATE), strong: true }, ...selfPieceHl(state)],
      buttonLabel: "次へ",
    },
    // 22: 相手ゲートへ移動（プレイヤー操作）。台本上は一気に到達する（ジャンプ台のイメージ）。
    {
      kind: "playerAction",
      tip: "空いている相手のゲート（ハイライト）をタップして攻め込みましょう。",
      moveGate: true,
      gateFrom: ARRIVAL_BONUS_CELL, // 現在地（{4,3}）＝差し戻し先
      gateFront: CPU_GATE, // 受理する移動先（相手ゲート{0,3}）
      gateSides: [],
      gateWarn: "空いている相手のゲート（ハイライト）へ進みましょう。",
      advanceWhen: (state) => selfPieceAt(state, CPU_GATE),
      highlights: (state) => [{ selector: cellSel(CPU_GATE), strong: true }, ...selfPieceHl(state)],
    },
    // 23: ゲート到達。ターン終了でゲート侵攻ボーナス。
    {
      kind: "narrate",
      title: "相手ゲートに到達！",
      body: [
        "相手のゲートに自分の駒が乗りました。この状態でターンを終了すると「相手ゲート侵攻ボーナス」が発生します。",
        "ボーナスでは、相手の手札を半分奪い、盤外の「エターナルカード」を1枚獲得して自分のロックエリアにロックできます。今回は緑のエターナルカードが手に入ります。",
      ],
      highlights: (state) => selfPieceHl(state),
      buttonLabel: "ターンを終了する →",
    },
    // 24: ゲート侵攻ボーナスの台本演出（エターナル緑を獲得＆ロック＝7色目）。
    {
      kind: "reveal",
      tip: "相手ゲート侵攻ボーナス発生中… エターナルカード「緑」を獲得！",
      runReveal: scriptGateInvasionWin,
    },
    // 25: 勝利。
    {
      kind: "narrate",
      title: "7色そろえて勝利！ 🎉",
      body: [
        "エターナルカード「緑」をロックし、7色すべてがそろいました。あなたの勝ちです！",
        "ロック・ハンド・ムーブの3フェイズ、到達効果、手札効果、接触、そして相手ゲート侵攻ボーナスまで体験できました。これで基本はバッチリです。おつかれさまでした！",
      ],
      buttonLabel: "とじる",
      isLast: true,
    },
  ];
}

// 現在のステップのハイライト/吹き出しを（再）適用する。render()で盤面DOMが作り直される
// たびに呼ぶ必要があるため、onDriverStateからも呼ぶ。
function applyStepVisuals(step) {
  // highlights/bubbles は配列、または「現在の状態から配列を返す関数」（動的セレクタ用）。
  const hl = typeof step.highlights === "function" ? step.highlights(getState()) : (step.highlights ?? []);
  const bb = typeof step.bubbles === "function" ? step.bubbles(getState()) : (step.bubbles ?? []);
  setHighlights(hl);
  setBubbles(bb);
}

// 各ステップに入った時点の盤面状態のスナップショット（「戻る」で盤面ごと巻き戻すため）。
let restStateFor = [];
const cloneState = () => structuredClone(getState());

// index番目のステップから「戻る」時の戻り先（revealステップは瞬間的なので飛ばす）。
function prevBackTarget(index) {
  for (let i = index - 1; i >= 0; i--) {
    if (steps[i] && steps[i].kind !== "reveal" && restStateFor[i] !== undefined) return i;
  }
  return null;
}

// ステップのUI（モーダル/ヒント/ハイライト/タップ）を表示する。状態の副作用(onEnter)は
// 含まない（「戻る」で復帰する時はスナップショットから状態を戻すため、UIだけ出し直す）。
function showStepUi(step, index) {
  if (step.kind === "narrate") {
    showBlockingHint({
      title: step.title,
      body: step.body,
      buttonLabel: step.buttonLabel ?? "次へ",
      position: step.position ?? "left",
      icon: step.icon ?? null,
      showBack: prevBackTarget(index) !== null,
      onBack: () => goBack(index),
      onNext: async () => {
        if (step.isLast) {
          finishTutorialBattle();
          return;
        }
        // afterNext（例: カードを手札へゆっくり吸い込むアニメ）があれば、モーダルを閉じて
        // 実行してから次へ。実行中はドライバの再入を止める。
        if (step.afterNext) {
          hideBlockingHint();
          clearHighlights();
          scriptRunning = true;
          try {
            await step.afterNext();
          } finally {
            scriptRunning = false;
          }
        }
        goToStep(index + 1);
      },
    });
    applyStepVisuals(step);
  } else if (step.kind === "playerAction") {
    hideBlockingHint();
    showTip(step.tip);
    applyStepVisuals(step);
    if (step.moveGate || step.handEffectCard || step.contactCell || step.placeCells) attachTapHandler();
  }
}

async function goToStep(index) {
  const prev = steps[stepIndex];
  if (prev && prev.onLeave) prev.onLeave();
  detachTapHandler(); // 前のplayerActionステップのタップリスナーを確実に外す
  clearHighlights();
  clearBubbles();

  stepIndex = index;
  const step = steps[index];
  if (!step) {
    finishTutorialBattle();
    return;
  }
  if (step.onEnter) step.onEnter();
  // このステップに入った時点の状態を記録（「戻る」で復帰できるように）。
  restStateFor[index] = cloneState();

  if (step.kind === "reveal") {
    hideBlockingHint();
    if (step.tip) showTip(step.tip);
    scriptRunning = true;
    try {
      if (step.runReveal) await step.runReveal();
    } finally {
      scriptRunning = false;
    }
    hideTip();
    goToStep(index + 1);
    return;
  }
  showStepUi(step, index);
}

// 「戻る」: 1つ前の（revealでない）ステップへ戻り、盤面もその時点のスナップショットへ復元する。
function goBack(fromIndex) {
  const target = prevBackTarget(fromIndex);
  if (target === null) return;
  const prev = steps[fromIndex];
  if (prev && prev.onLeave) prev.onLeave();
  detachTapHandler();
  clearHighlights();
  clearBubbles();
  hideTip();
  // スナップショットの復元中はドライバの再入（onDriverState）を止める。
  scriptRunning = true;
  stepIndex = target;
  const snap = restStateFor[target];
  if (snap) hydrateState(structuredClone(snap));
  scriptRunning = false;
  showStepUi(steps[target], target);
}

function onDriverState(state) {
  const step = steps[stepIndex];
  if (!step || scriptRunning) return;

  // 盤面が作り直されているのでハイライト/吹き出しを再適用（narrate/playerActionとも）。
  if (step.kind === "narrate" || step.kind === "playerAction") applyStepVisuals(step);

  if (step.kind !== "playerAction") return;

  // 前方誘導ステップ: 駒が前方(gateFront)へ来たら受理、それ以外のマスへ動いたら差し戻して警告。
  // 受理する移動先(gateFront)・差し戻し先(gateFrom)はステップごとに指定する（初回移動と
  // ボーナス移動で位置が違うため）。
  if (step.moveGate) {
    const front = step.gateFront ?? FRONT_CELL;
    const from = step.gateFrom ?? GATE_CELL;
    const p = selfPiece(state);
    if (p && p.location.zone === "cell") {
      const atFront = p.location.row === front.row && p.location.col === front.col;
      const atFrom = p.location.row === from.row && p.location.col === from.col;
      if (!atFront && !atFrom) {
        // 前方以外へ動いた → 差し戻して警告（誤操作を物理的に無かったことにする）。
        scriptRunning = true;
        moveToken(p.id, { zone: "cell", ...from });
        scriptRunning = false;
        flashWarning(step.gateWarn ?? "今回は、ハイライトされたマスへ進みましょう。");
        return;
      }
    }
  }

  if (step.advanceWhen && step.advanceWhen(state)) {
    hideTip();
    const runAccept = async () => {
      scriptRunning = true;
      try {
        if (step.onAccept) await step.onAccept();
      } finally {
        scriptRunning = false;
      }
      goToStep(stepIndex + 1);
    };
    runAccept();
  }
}

// --- 台本の演出 ------------------------------------------------------------------------

// 導入演出: ファーストカード以外の5色を順にロックする（1枚ずつ、ロック効果アニメ付き）。
async function revealFiveLocks() {
  const side = SEAT_TO_SIDE[SELF_SEAT];
  for (const lock of REVEAL_LOCKS) {
    tutorialLockCard(side, lock.color, lock.cardId);
    if (triggerLockEffectHelper) {
      triggerLockEffectHelper(lock.cardId, { zone: "lock", side, index: COLORS.indexOf(lock.color) });
    }
    await delay(520);
  }
  await delay(300);
}

// 到達演出（柱状バースト＋効果音）だけを出す。指定マスの指定カードの色で光らせる。
// T1は「到達→拡大→説明→ボーナス移動→手札化」を1手ずつステップに分けたため、演出と
// 状態変化（移動・手札化）を別々の小関数に分解している（旧acquireArrivalCardを分割）。
async function playArrivalBurst(cell, cardId) {
  const card = getState().tokens.find(
    (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === cell.row && t.location.col === cell.col && t.cardId === cardId
  );
  if (card && triggerLockEffectHelper) triggerLockEffectHelper(card.cardId, card.location);
  await delay(650);
}

// 盤面のマスにある指定カードを、ドロー演出のようにゆっくり手札へ吸い込む（flyBoardCardToHand
// ＝main.jsから注入）。演出が終わってから実際に手札へ移す（MOVE_TOKENが手札(A)への移動で
// 自動的に表向きにする）。
async function suctionCardToHand(cardId, cell) {
  const token = getState().tokens.find(
    (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === cell.row && t.location.col === cell.col && t.cardId === cardId
  );
  if (!token) return;
  if (flyBoardCardToHandHelper) await flyBoardCardToHandHelper(token.id, SELF_SEAT);
  moveToken(token.id, { zone: "hand", player: SELF_SEAT });
}

// 山札の一番上を、山札→手札の飛翔アニメ付きで1枚引く（flyDrawnCardToHand＝main.jsから注入。
// 「1枚ドロー」ボタンや手札効果のドローと同じ演出）。ユーザー要望「ドローはちゃんと山札から
// 持ってくるアニメを使って」。
async function drawTopDeckAnimated() {
  const deck = getState().piles?.deck ?? [];
  const topCardId = deck[deck.length - 1]; // 末尾＝一番上＝次に引かれる
  if (!topCardId) return;
  if (flyDrawnCardToHandHelper) await flyDrawnCardToHandHelper(SELF_SEAT, topCardId);
  drawFromPile("deck", { zone: "hand", player: SELF_SEAT });
  await delay(200);
}

// 練習用に山札の一番上のカードを手札へ配る（開始手札を空にした代わり。DECK_ORDERの
// 一番上に、配りたいカードを順に積んである）。
async function deliverTopDeckCard() {
  await drawTopDeckAnimated();
  await delay(150);
}

// CPU（相手）の台本ターン。ジャンプ台等で一気に近づき、あなたの駒の隣({3,3})へ来る。
// ターン管理はnextTurn()で A→C→A と進める（自動処理OFFなのでフェイズ待ち等は起きない）。
// CPUが移動した先のマスのカードをオープンして手札に加える台本演出（ユーザー要望）。実際の
// 「移動＝移動先が裏向きならオープンし到達、そのカードは原則手札に加わる」を一応見せる。
// オープン（表向き）を一瞬見せてから、CPUの手札へ移す（CPUの手札は裏向き＝中身は見えない）。
async function cpuPickupCardAt(cell) {
  const card = getState().tokens.find(
    (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === cell.row && t.location.col === cell.col
  );
  if (!card) return;
  if (!card.faceUp) {
    flipToken(card.id);
    await delay(700); // オープンを見せる
  }
  moveToken(card.id, { zone: "hand", player: CPU_SEAT }); // 手札へ（CPUの手札なので裏向きになる）
  await delay(400);
}

async function scriptCpuApproach() {
  nextTurn(); // あなた(A) → CPU(C)：相手のターン
  // 「CPU先生のターン」トースト（turn-announce.js＝2200ms表示＋500msフェード）が完全に
  // 消えてから駒を動かす（ユーザー要望「表示が被って移動が見えない」）。
  await delay(TURN_ANNOUNCE_MS);
  const cpu = getState().tokens.find((t) => t.kind === "piece" && t.player === CPU_SEAT);
  if (cpu) {
    moveToken(cpu.id, { zone: "cell", ...CPU_APPROACH_MID }); // 一気に接近（ジャンプ台の見せ場）
    await delay(800);
    moveToken(cpu.id, { zone: "cell", ...CPU_ADJ_CELL }); // あなたの隣へ
    await delay(800);
    await cpuPickupCardAt(CPU_ADJ_CELL); // 移動先のカードをオープンして手札に加える演出
  }
  nextTurn(); // CPU(C) → あなた(A)：ターン2
  await delay(500);
}

// ターン2ロックフェイズ: 手札の「紫（ゴメンナサイ）」をタップで自動ロックする。手札から
// ロックエリアの紫スロットへ移す（MOVE_TOKENがロックへの移動で自動的に表向きにする）。
async function scriptLockPurple() {
  const side = SEAT_TO_SIDE[SELF_SEAT];
  const idx = COLORS.indexOf(FIRST_TARGET_COLOR); // 紫
  const purple = getState().tokens.find(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === SELF_SEAT && t.cardId === ARRIVAL_CELL.cardId
  );
  if (purple) {
    moveToken(purple.id, { zone: "lock", side, index: idx });
    if (triggerLockEffectHelper) triggerLockEffectHelper(purple.cardId, { zone: "lock", side, index: idx });
  }
  await delay(500);
}

// ターン2ハンドフェイズ: 「プレゼント」の手札効果を台本再現する。プレイヤーが選んだ相手の
// 隣のマス(cell)へ、手札のプレゼントを置き（MOVE_TOKENが場への移動で自動的に裏向きにする）、
// 山札から1枚ドローする。
async function placePresentAt(cell) {
  const present = getState().tokens.find(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === SELF_SEAT && t.cardId === HAND_EFFECT_CARD
  );
  if (present) moveToken(present.id, { zone: "cell", ...cell });
  await delay(500);
  await drawTopDeckAnimated(); // プレゼントの「1枚ドロー」（山札→手札の飛翔アニメ付き）
  await delay(200);
}

// ターン2ムーブフェイズ: 隣のCPUへの「接触」を台本再現する。承認フロー（pendingContact）
// には乗らず、タックル演出＋結果モーダル（main.jsのplayScriptedContact）を流用し、状態
// 変化＝CPUの手札を1枚奪う＋CPUを自分のゲートへ強制移動、はapplyStateChangeで行う。
async function scriptContact() {
  // スポットライト（暗幕、z-index 40001）が接触タックル演出や結果モーダル（z-index 10621）
  // より前面にあり、それらを暗く覆ってしまう（ユーザー報告「接触の結果モーダルが暗い」）。
  // 接触の間はハイライトを消しておく（scriptRunning中はonDriverStateが再適用しないので消えたまま）。
  clearHighlights();
  const state = getState();
  const attacker = state.tokens.find((t) => t.kind === "piece" && t.player === SELF_SEAT);
  const defender = state.tokens.find((t) => t.kind === "piece" && t.player === CPU_SEAT);
  const cpuHand = state.tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === CPU_SEAT
  );
  const stolen = cpuHand[0] ?? null;

  const applyStateChange = () => {
    // 相手の手札を1枚あなたの手札へ（MOVE_TOKENが手札(A)への移動で自動的に表向きにする）。
    if (stolen) moveToken(stolen.id, { zone: "hand", player: SELF_SEAT });
    // 相手を自分のゲートへ強制移動する（ゲートのカードへの到達＝オープン＆手札入りは、タックル
    // 演出が終わった後に下の cpuPickupCardAt で行う）。
    if (defender) moveToken(defender.id, { zone: "cell", ...CPU_GATE });
  };

  if (playScriptedContactHelper) {
    await playScriptedContactHelper({
      attackerPieceId: attacker?.id,
      defenderPieceId: defender?.id,
      attacker: SELF_SEAT,
      defender: CPU_SEAT,
      stolenCardId: stolen?.cardId ?? null,
      role: "attacker", // 1人プレイなので「あなたが奪った」側の文面だけ出す
      applyStateChange,
    });
  } else {
    applyStateChange();
  }
  // #6（ユーザー報告2026-08-14）: 強制移動は「移動」なので、移動先＝エイドスのゲートのカードに
  // 到達する。以前は表向きにするだけで場に残っていたので、オープンしてエイドスの手札に加える
  // （到達後の既定処理＝カードを手札へ。CPUの移動先ピックアップと同じ cpuPickupCardAt を流用）。
  if (defender) await cpuPickupCardAt(CPU_GATE);
  await delay(300);
}

// 接触後のCPUターン: CPUがゲート({0,3})から1マス出る({1,3})。ターン3で相手ゲートを
// 空けておくため（自動で次へ）。
async function scriptCpuLeaveGate() {
  nextTurn(); // あなた(A) → CPU(C)
  await delay(TURN_ANNOUNCE_MS); // 「CPU先生のターン」トーストが消えてから動かす
  const cpu = getState().tokens.find((t) => t.kind === "piece" && t.player === CPU_SEAT);
  if (cpu) {
    moveToken(cpu.id, { zone: "cell", ...CPU_LEAVE_CELL });
    await delay(800);
    await cpuPickupCardAt(CPU_LEAVE_CELL); // 移動先のカードをオープンして手札に加える演出
  }
  nextTurn(); // CPU(C) → あなた(A)：ターン3
  await delay(400);
}

// ターン3の相手ゲート侵攻ボーナスを台本再現する。auto-processingはOFF（実ゲート侵攻フローは
// 走らない）なので、盤外のエターナルの山の一番上（＝eternal-green）を緑のロックスロットへ直接
// 引き出してロックする＝「エターナル獲得＆ロック」の見せ場。これで緑（7色目）が埋まり7色そろう。
// 勝利演出はmain.jsのcheckForVictoryをチュートリアル中はスキップしているため、次の台本ステップ
// （勝利ナレーション）で締める。
async function scriptGateInvasionWin() {
  const side = SEAT_TO_SIDE[SELF_SEAT];
  const greenIdx = COLORS.indexOf(WINNING_COLOR); // 緑
  await delay(700);
  drawFromPile("eternal", { zone: "lock", side, index: greenIdx });
  await delay(450);
  if (triggerLockEffectHelper) triggerLockEffectHelper(`eternal-${WINNING_COLOR}`, { zone: "lock", side, index: greenIdx });
  await delay(1100);
}

// --- タップ操作（前方移動・手札効果・接触） --------------------------------------------
// ドラッグ移動は既存のonDragEnd(main.js)がそのまま担うが、タップでも操作できるように、
// 該当ステップの間だけdocumentにクリックリスナーを付ける（手札カードは#game-tableの
// 外にあるためdocumentに付ける）。想定操作だけを受け付け、想定外は無視/警告する。
function attachTapHandler() {
  if (tapHandlerAttached) return;
  // captureフェーズで登録する。ゲーム本体の手札カード/盤面のハンドラより先に（トップダウンで）
  // このハンドラが動くようにするため。
  // clickは盤面のマス（移動・接触）用。手札カードは「掴む(ドラッグ)」挙動がpointerdownで
  // 先に走り、clickが発火しない/カードが動いてしまう（ユーザー報告「プレゼントをクリック
  // してもカードを掴むだけで手札効果が発動しない」）ため、手札効果ステップはpointerdownを
  // 先取りして、掴む前に効果を起動する。
  document.addEventListener("click", onTutorialTap, true);
  document.addEventListener("pointerdown", onTutorialPointerDown, true);
  tapHandlerAttached = true;
}
function detachTapHandler() {
  if (!tapHandlerAttached) return;
  document.removeEventListener("click", onTutorialTap, true);
  document.removeEventListener("pointerdown", onTutorialPointerDown, true);
  tapHandlerAttached = false;
}
// 手札カード・相手駒・配置候補マスへのpointerdownを「掴む」前に横取りして、想定の操作
// （手札効果／接触／カード配置）を起動する。draggableに奪われてclickが発火しない対策。
function onTutorialPointerDown(e) {
  const step = steps[stepIndex];
  if (!step || scriptRunning) return;
  const elements = document.elementsFromPoint(e.clientX, e.clientY);

  // 手札効果ステップ: 対象の手札カードを掴む前に効果を起動。
  if (step.handEffectCard) {
    const sel = selfHandCardSelector(getState(), step.handEffectCard);
    if (!sel) return;
    const handCards = [];
    for (const el of elements) {
      const hc = el.closest?.(".hand-card");
      if (hc && !handCards.includes(hc)) handCards.push(hc);
    }
    const target = closestHandCardByCenter(handCards, e.clientX, e.clientY);
    if (target && target.matches(sel)) {
      e.stopPropagation();
      e.preventDefault();
      runTappedAction(step.onHandEffect);
    }
    return;
  }

  // 接触ステップ／配置ステップ: 目的のマス（相手駒のマス／配置候補マス）への操作を先取り。
  if (step.contactCell || step.placeCells) {
    const cells = [];
    for (const el of elements) {
      const c = el.closest?.(".cell");
      if (c && !cells.includes(c)) cells.push(c);
    }
    const hit = (cell) => cells.some((c) => Number(c.dataset.row) === cell.row && Number(c.dataset.col) === cell.col);
    if (step.contactCell && hit(step.contactCell)) {
      e.stopPropagation();
      e.preventDefault();
      runTappedAction(step.onContact);
      return;
    }
    if (step.placeCells) {
      const target = step.placeCells.find((c) => hit(c));
      if (target) {
        e.stopPropagation();
        e.preventDefault();
        runTappedAction(() => step.onPlace(target));
      }
    }
  }
}
async function onTutorialTap(e) {
  const step = steps[stepIndex];
  if (!step || scriptRunning) return;

  // 3D盤面ではネイティブclickのe.targetが（preserve-3dの階層のせいで）実際に見えている
  // 要素と食い違うため、コードベース共通の方式（main.jsのfindDraggableAt等）と同じく
  // document.elementsFromPoint()で座標直下の要素を上から調べる。
  const elements = document.elementsFromPoint(e.clientX, e.clientY);

  // 手札効果ステップ: 指定の手札カードをタップしたら効果を実行して次へ。
  if (step.handEffectCard) {
    const sel = selfHandCardSelector(getState(), step.handEffectCard);
    const handCards = [];
    for (const el of elements) {
      const hc = el.closest?.(".hand-card");
      if (hc && !handCards.includes(hc)) handCards.push(hc);
    }
    const target = closestHandCardByCenter(handCards, e.clientX, e.clientY);
    if (target && sel && target.matches(sel)) {
      e.stopPropagation();
      e.preventDefault();
      await runTappedAction(step.onHandEffect);
    }
    return;
  }

  // 座標直下の全ての.cellを集める。3Dで手前の駒（今いるマスの駒）が奥の移動先マスを
  // 視覚的に隠すため、「最前面の.cell 1つ」だと自駒のいるマスばかり拾ってしまい、目的の
  // マスが取れない（ユーザー報告「ボーナス移動の移動先クリックが効かない。掴んでDropは
  // できる」＝ドラッグ中は駒が浮くので隠れないが、クリック時は駒が居座って隠す、が原因）。
  // 候補全部を集めて「目的のマスが含まれるか」で判定する。
  const cells = [];
  for (const el of elements) {
    const c = el.closest?.(".cell");
    if (c && !cells.includes(c)) cells.push(c);
  }
  const hitCell = (cell) => cells.some((c) => Number(c.dataset.row) === cell.row && Number(c.dataset.col) === cell.col);

  // 接触ステップ: 隣のCPUの駒のマスをタップしたら接触を実行して次へ。
  if (step.contactCell) {
    if (hitCell(step.contactCell)) {
      e.stopPropagation();
      e.preventDefault();
      await runTappedAction(step.onContact);
    }
    return;
  }

  // 配置ステップ: 候補マスをタップしたらそこへカードを置いて次へ。
  if (step.placeCells) {
    const target = step.placeCells.find((c) => hitCell(c));
    if (target) {
      e.stopPropagation();
      e.preventDefault();
      await runTappedAction(() => step.onPlace(target));
    }
    return;
  }

  // 前方移動ステップ: 受理する移動先(gateFront)へ移動。左右(gateSides)は警告のみ。
  if (step.moveGate) {
    const front = step.gateFront ?? FRONT_CELL;
    const sides = step.gateSides ?? [LEFT_CELL, RIGHT_CELL];
    if (hitCell(front)) {
      e.stopPropagation();
      e.preventDefault();
      const p = selfPiece(getState());
      if (p) {
        scriptRunning = true;
        moveToken(p.id, { zone: "cell", ...front });
        scriptRunning = false;
        // moveToken後の状態でadvanceWhenを評価させるため、明示的にドライバへ通知する。
        onDriverState(getState());
      }
    } else if (sides.some((s) => hitCell(s))) {
      flashWarning(step.gateWarn ?? "今回は、ハイライトされたマスへ進みましょう。");
    }
  }
}

// 重なり合う手札カード候補の中から、クリック座標に一番近い中心のものを選ぶ
// （main.jsのclosestByCenterと同じ考え方。扇形レイアウトの重なり対策）。
function closestHandCardByCenter(candidates, clientX, clientY) {
  let best = null;
  let bestDist = Infinity;
  for (const el of candidates) {
    const r = el.getBoundingClientRect();
    const dx = clientX - (r.left + r.width / 2);
    const dy = clientY - (r.top + r.height / 2);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  return best;
}

// タップで起動する台本アクション（手札効果・接触）を実行し、終わったら次のステップへ。
async function runTappedAction(action) {
  hideTip();
  scriptRunning = true;
  try {
    if (action) await action();
  } finally {
    scriptRunning = false;
  }
  goToStep(stepIndex + 1);
}

// --- 開始/終了 -------------------------------------------------------------------------

// チュートリアルCPU戦を開始する。決定的な台本盤面を構築し、導入解説→（各ステップの
// 振付）へ進む。自動処理（フェイズ自動進行・実カード効果）はチュートリアル中はOFFにし、
// 進行は全て台本(このモジュール)が制御する（フルヤラセ）。
export function startTutorialBattle() {
  resetVictoryTracking();
  resetMatchStats();
  resetHandEffectUsage();

  // 自動処理をOFFにして台本駆動にする（終了時に元へ戻す）。
  savedAutoProcessing = isAutoProcessingEnabled();
  setAutoProcessingEnabled(false);

  battleActive = true;
  setupTutorialScenario(buildScenario());
  setPlayerName(CPU_SEAT, EIDOS_NAME); // 相手(C)の表示名＝案内人エイドス（終了時にリセット）
  setPlayerAvatar(CPU_SEAT, EIDOS_AVATAR);
  // 手番をあなた(A)にしておく。フェイズ案内板（#phase-guide-bar）はturnPlayerがnullの間は
  // 非表示のため、導入のフェイズ説明でスポットライトを当てられるよう最初から表示させる。
  setTurnPlayer(SELF_SEAT);

  steps = buildSteps();
  restStateFor = [];
  if (!unsubscribe) unsubscribe = subscribe(onDriverState);
  showRestartButton(restartTutorialBattle);
  // 左上の「終了する」ボタン（ユーザー要望）。押すと確認のうえチュートリアルを畳んで
  // ホーム画面へ戻る（finishTutorialBattle）。
  showQuitButton(() => {
    if (window.confirm("チュートリアルを終了してホーム画面に戻りますか？")) {
      finishTutorialBattle();
    }
  });
  goToStep(0);
}

// 「↻ チュートリアルをはじめから」。今の進行を畳んで最初からやり直す。
export function restartTutorialBattle() {
  // いったん後始末してから、盤面ごと作り直して0ステップ目へ。
  const prev = steps[stepIndex];
  if (prev && prev.onLeave) prev.onLeave();
  clearHighlights();
  clearBubbles();
  hideBlockingHint();
  hideTip();
  resetVictoryTracking();
  resetMatchStats();
  resetHandEffectUsage();
  battleActive = true;
  setupTutorialScenario(buildScenario());
  setPlayerName(CPU_SEAT, EIDOS_NAME);
  setPlayerAvatar(CPU_SEAT, EIDOS_AVATAR);
  setTurnPlayer(SELF_SEAT); // フェイズ案内板を最初から表示（startTutorialBattle参照）
  steps = buildSteps();
  restStateFor = [];
  goToStep(0);
}

// チュートリアル対戦を終了/中断する（UIを片付け、監視を解除し、設定を元へ戻す）。
export function finishTutorialBattle() {
  battleActive = false;
  detachTapHandler();
  setPlayerName(CPU_SEAT, ""); // 案内人エイドスの表示名をリセット（通常対戦に持ち越さない）
  setPlayerAvatar(CPU_SEAT, null); // アバターも既定へ戻す
  teardownTutorialBattleUi();
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  if (savedAutoProcessing !== null) {
    setAutoProcessingEnabled(savedAutoProcessing);
    savedAutoProcessing = null;
  }
  stepIndex = -1;
  // ユーザー要望「チュートリアルが終了したら画面を閉じてホーム画面へ」。
  if (openHomeFn) openHomeFn();
}
