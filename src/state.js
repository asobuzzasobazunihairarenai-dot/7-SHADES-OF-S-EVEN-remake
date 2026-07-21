// Phase 1で最初に導入する、最小限のゲーム状態管理（Redux風のstate+action）。
// プロジェクト方針として「状態変更は全てactionとして表現し、現在の状態+action→次の状態、という
// 純粋な形にする」ことを最初から決めていた。駒・カードのドラッグ操作はこのアプリで初めての
// 「実際に状態が変わる」機能なので、ここでその形を導入する。今はルール処理をしないサンドボックス
// なので、持っているのは「どのオブジェクト(駒/カード)が今どこにあるか」と「各山の中身（実カード
// のid配列）」だけ。将来docs/game-state-design.mdの本格的なGameState設計へ拡張し、オンライン
// 非同期化する際は同じactionをサーバーに送って同期する流れにそのまま乗せる想定。

import { NORMAL_CARDS, ETERNAL_CARDS, FIRST_CARDS } from "./cards-data.js";
import { COLORS, GATE_POSITIONS, SEAT_ORDER, SEAT_TO_SIDE } from "./board-layout.js";

let nextId = 1;
const uid = (prefix) => `${prefix}-${nextId++}`;

const PIECE_START = [
  { color: "red", location: { zone: "cell", row: 6, col: 3 } },
  { color: "orange", location: { zone: "cell", row: 3, col: 0 } },
  { color: "yellow", location: { zone: "cell", row: 0, col: 3 } },
  { color: "green", location: { zone: "cell", row: 3, col: 6 } },
];

// 座席ごとの初期手札枚数。実カードを山札からこの枚数だけ配る。
const HAND_START = { A: 4, B: 2, C: 3, D: 5 };

function shuffled(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// カード定義(count付き)から、実際の枚数分だけid配列に展開する（例: count:7のカードは
// 同じidが7つ並んだ配列になる。同じ絵柄のカードが複数あるのは物理カードと同じ）。
function expandDeck(cardDefs) {
  const ids = [];
  for (const def of cardDefs) {
    for (let i = 0; i < (def.count ?? 1); i++) ids.push(def.id);
  }
  return ids;
}

function createInitialState() {
  const tokens = [];
  for (const p of PIECE_START) {
    tokens.push({ id: uid("piece"), kind: "piece", color: p.color, location: p.location });
  }

  // 山札(通常カード112枚)をシャッフルし、そこから各プレイヤーの初期手札を配る。
  // pilesは「配列の末尾＝一番上」という約束で、popが「引く」、pushが「積む」に対応する。
  const deck = shuffled(expandDeck(NORMAL_CARDS));
  for (const [player, count] of Object.entries(HAND_START)) {
    for (let i = 0; i < count; i++) {
      const cardId = deck.pop();
      tokens.push({
        id: uid("card"),
        kind: "card",
        cardId,
        faceUp: player === "A", // 自分の手札だけ表向き（＝盤面等に出た時に中身が見える）
        location: { zone: "hand", player },
      });
    }
  }

  const eternal = shuffled(expandDeck(ETERNAL_CARDS));
  // ファーストカードは本来ゲーム開始時に各プレイヤーへ1枚ずつ自動配布されるものだが、
  // Phase1はセットアップ自動化のスコープ外。他の山と同じ「シャッフルされた山」として置き、
  // 手動でドラッグして配れるようにするだけに留める。
  const first = shuffled(expandDeck(FIRST_CARDS));

  return {
    tokens,
    piles: { deck, eternal, first, discard: [] },
    // ターン管理: セットアップウィザードの手順1（参加座席確定）・手順3（スタートプレイヤー決定）
    // でそれぞれ設定されるまでは空/nullのまま（＝まだ「ターン」という概念が始まっていない）。
    activePlayers: [],
    turnPlayer: null,
    // 通算ターン数・ラウンド数。手順3でスタートプレイヤーが決まった瞬間にどちらも1から始まり、
    // NEXT_TURNのたびにturnNumberが+1、参加座席を一周してスタート地点の座席に戻るたびに
    // roundNumberが+1になる（「プレイヤー全員のターンが終わったら1ラウンド」というルール）。
    // 「一周した」の基準はSEAT_ORDER上の先頭（＝座席Aとは限らない）ではなく、実際に選ばれた
    // スタートプレイヤー(startPlayer)そのものにする必要があるため、別途保持しておく。
    turnNumber: null,
    roundNumber: null,
    startPlayer: null,
    // ターンタイマー（ロープ・砂時計・優先権）: src/turn-timer.js参照。ゲーム開始まで
    // null/空のまま（turn-timer.js自身がturnPlayerのnull→非nullへの変化を検知して初期化
    // する。SET_TURN_PLAYER側では関知しない）。強制力は持たせない設計のため、ここに置く
    // 値は全て「表示のための記録」であり、これ自体がゲーム進行を止めたりはしない。
    // 「砂時計を使わずに何ターン経過したか」はturn-timer.js内のローカル変数で追跡する
    // （見た目に影響しない内部カウンタのため、共有stateには持たせない）。
    priorityPlayer: null,
    priorityDeadline: null,
    priorityPhase: null, // "base"（ロープ非表示）| "extension"（ロープ表示、砂時計消費中）
    hourglassStock: {},
  };
}

let state = createInitialState();
const listeners = [];

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.push(fn);
  return () => {
    const i = listeners.indexOf(fn);
    if (i >= 0) listeners.splice(i, 1);
  };
}

// --- オンライン対戦（第一弾・最小構成、src/online.jsが使う） -----------------------------
// online.jsが部屋に参加すると、以降moveToken/drawFromPile/flipToken/setTurnPlayer/nextTurn
// の5つだけ、ローカルのdispatch()の代わりにonlineTransport（online.jsがso7-apply-action
// Edge Functionを呼ぶ関数）を使うようになる。他9つのアクション・resetGameはローカル専用の
// まま変更しない（セットアップウィザード・ゲート侵攻ボーナス等は今回のオンライン対戦の
// スコープ外のため）。サーバー側で実際に状態が変わると、online.jsがBroadcast通知を受けて
// hydrateState()を呼び、ここでlistenersに通知することで既存のrender()がそのまま動く
// （main.jsがsubscribe(render)を1回呼ぶだけで済む設計）。
let onlineMode = false;
let onlineTransport = null;

export function setOnlineMode(active) {
  onlineMode = active;
}

export function isOnlineMode() {
  return onlineMode;
}

export function setOnlineTransport(fn) {
  onlineTransport = fn;
}

// online.jsがサーバーから取得した最新状態を、そのままローカルのstateとして採用する。
export function hydrateState(newState) {
  state = newState;
  for (const fn of listeners) fn(state);
}

// stateの中身は変えず、listeners（main.jsのrender()）にだけ「今すぐ再描画して」と伝える。
// setOnlineMode(true)の直後にonline.jsが呼ぶことで、サーバーからの最初の取得（非同期・
// ネットワーク往復あり）を待たずに、その場でセットアップウィザード等のボタンを隠す
// （body.is-online-modeクラスの反映）ようにするため。これが無いと、部屋に参加した直後の
// わずかな間だけローカル専用のボタンがまだ押せてしまうことがあった。
export function notifyListeners() {
  for (const fn of listeners) fn(state);
}

// 新しく盤面に現れるカード（手札から出す、山から引く）の表裏を決める。
// 手札に加わる時は持ち主本人（A）にだけ見える表向き、ロックエリアは物理ルール通り原則
// 表向き（「ロックする：カード1枚を...表向きで置くこと」）、それ以外（盤面マスへ新規に
// 置かれる時）は基本裏向き（物理カードを裏向きで置くのと同じ。中身を見せたければ
// ダブルクリックでめくる）。
function faceUpForLocation(location) {
  if (location.zone === "hand") return location.player === "A";
  if (location.zone === "lock") return true;
  if (location.zone === "publicDraw") return true; // 公開ドロー：誰が引いたか常に見える
  return false;
}

const isTable = (location) => location.zone === "cell" || location.zone === "lock";

// 「公開ドロー」ボタンで引いたカード（publicDraw）は、手札シャッフル・ターン終了の
// どちらかが起きた時点で通常の手札へ合流する（見た目上の扱いを含め、以降は普通の
// 手札カードと同じになる）。
function mergePublicDrawIntoHand(tokens, player) {
  return tokens.map((t) =>
    t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === player
      ? { ...t, location: { zone: "hand", player } }
      : t
  );
}

function reduce(current, action) {
  switch (action.type) {
    case "MOVE_TOKEN": {
      const token = current.tokens.find((t) => t.id === action.tokenId);
      if (!token) return current;
      const next = { ...token, location: action.location };
      // ロックエリアへの移動は移動元を問わず常に表向きにする（物理ルール通り）。それ以外の
      // 場・ロックエリア同士の移動（例: マス→マス、ロック→ロック）は、既に表向き/裏向きが
      // 決まっているカードをただ動かすだけなので表裏を変えない。手札から場へ出す時・
      // 場/ロックから手札に加える時だけ、新しい置き場所に応じて表裏を決め直す。
      if (token.kind === "card") {
        if (action.location.zone === "lock") {
          next.faceUp = true;
        } else if (!(isTable(token.location) && isTable(action.location))) {
          next.faceUp = faceUpForLocation(action.location);
        }
      }
      // 動かしたトークンを配列の末尾に移す。renderBoardTokens()はtokens配列の順番通りに
      // appendChildするため、同じマスに複数枚重なっている時は「配列の後ろにあるもの」ほど
      // 描画が後＝画面上で手前(一番上)になる。末尾に移さないと、元々配列の前方にあった
      // トークンを後から同じマスへ動かしても見た目上「潜り込む」ことがあった。
      const rest = current.tokens.filter((t) => t.id !== action.tokenId);
      return { ...current, tokens: [...rest, next] };
    }
    case "SEND_TOKEN_TO_PILE": {
      const token = current.tokens.find((t) => t.id === action.tokenId);
      if (!token) return current;
      const tokens = current.tokens.filter((t) => t.id !== action.tokenId);
      const piles = { ...current.piles, [action.pile]: [...current.piles[action.pile], token.cardId] };
      return { ...current, tokens, piles };
    }
    case "DRAW_FROM_PILE": {
      const pileArray = current.piles[action.pile];
      if (pileArray.length === 0) return current;
      const cardId = pileArray[pileArray.length - 1];
      const piles = { ...current.piles, [action.pile]: pileArray.slice(0, -1) };
      const faceUp = faceUpForLocation(action.location);
      const newToken = { id: uid("card"), kind: "card", cardId, faceUp, location: action.location };
      return { ...current, piles, tokens: [...current.tokens, newToken] };
    }
    // 自分の手札を並べ替える（画面左下の「手札シャッフル」ボタン）。カード自体の入れ替わりは
    // 無い（顔ぶれは変わらない）ので、どのカードを持っているかを推測されにくくする、
    // 見た目上の並び替え演出。handTokens内の相対順だけをシャッフルし、他のトークンとの
    // 配列内の相対位置（＝盤面上の重なり順）には影響させない。
    case "SHUFFLE_HAND": {
      // シャッフル前に、まだ手札へ合流していない公開ドローのカードがあれば先に合流させる
      // （合流した分もまとめてシャッフル対象になる）。合流対象が無ければ従来通り何もしない
      // （currentをそのまま返す＝オンライン側の「変化なしなら書き込みをスキップ」判定に乗る）。
      const hasPendingPublicDraw = current.tokens.some(
        (t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === action.player
      );
      const mergedTokens = hasPendingPublicDraw ? mergePublicDrawIntoHand(current.tokens, action.player) : current.tokens;
      const handTokens = mergedTokens.filter(
        (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === action.player
      );
      if (handTokens.length < 2) {
        if (!hasPendingPublicDraw) return current;
        return { ...current, tokens: mergedTokens }; // シャッフルはしないが合流だけ反映する
      }
      const others = mergedTokens.filter(
        (t) => !(t.kind === "card" && t.location.zone === "hand" && t.location.player === action.player)
      );
      return { ...current, tokens: [...others, ...shuffled(handTokens)] };
    }
    case "FLIP_TOKEN": {
      const tokens = current.tokens.map((t) =>
        t.id === action.tokenId && t.kind === "card" ? { ...t, faceUp: !t.faceUp } : t
      );
      return { ...current, tokens };
    }
    // セットアップウィザード（game-setup.js）の「１：ファーストカードを配り、駒を配置する」
    // の起点として、盤面を完全に空の状態に戻す。ルールブック通り「初期手札なし」の状態から
    // 組み立て直すため、現在ある駒・カード（手札含む）を全て消し、山札・エターナル・
    // ファーストの3つの山を新しくシャッフルし直す（捨て場は空にする）。
    case "RESET_GAME": {
      return {
        tokens: [],
        piles: {
          deck: shuffled(expandDeck(NORMAL_CARDS)),
          eternal: shuffled(expandDeck(ETERNAL_CARDS)),
          first: shuffled(expandDeck(FIRST_CARDS)),
          discard: [],
        },
        activePlayers: [],
        turnPlayer: null,
        turnNumber: null,
        roundNumber: null,
        startPlayer: null,
        priorityPlayer: null,
        priorityDeadline: null,
        priorityPhase: null,
        hourglassStock: {},
      };
    }
    // セットアップウィザードの手順1: 参加している座席（action.players、時計回り順）に
    // ファーストカードの山から1枚ずつ配り、そのカードと同色のロックエリアへ表向きでロックする
    // （物理ルール「ロックした状態でゲーム開始」）。同時に、そのカードと同色の駒を
    // そのプレイヤーのゲートに置く（「ファーストカードと同色の駒が自分の駒となる」）。
    // 参加座席の一覧もここでstate.activePlayersに記録し、以降のターン管理（NEXT_TURN）で使う。
    case "SETUP_ASSIGN_FIRST_CARDS": {
      const firstPile = [...current.piles.first];
      const newTokens = [];
      for (const { player, side } of action.players) {
        if (firstPile.length === 0) break;
        const cardId = firstPile.pop();
        const def = FIRST_CARDS.find((c) => c.id === cardId);
        const colorIndex = COLORS.indexOf(def.color);
        newTokens.push({
          id: uid("card"),
          kind: "card",
          cardId,
          faceUp: true,
          location: { zone: "lock", side, index: colorIndex },
        });
        newTokens.push({
          id: uid("piece"),
          kind: "piece",
          color: def.color,
          player, // 相手ゲート侵攻ボーナス判定（gate-invasion.js）で「この駒は誰のものか」を引くために必要
          location: { zone: "cell", ...GATE_POSITIONS[side] },
        });
      }
      return {
        ...current,
        tokens: [...current.tokens, ...newTokens],
        piles: { ...current.piles, first: firstPile },
        activePlayers: action.players.map((p) => p.player),
      };
    }
    // セットアップウィザードの手順3: ターンプレイヤーを設定する（無作為に選ぶのはgame-setup.js側）。
    // ここが「ターン」という概念の起点なので、通算ターン数・ラウンド数も1から始める。
    // startPlayerも記録しておく（NEXT_TURNで「一周した」を判定する基準にするため。
    // SEAT_ORDER上の先頭＝座席Aとは限らないので、実際に選ばれたこのプレイヤーを基準にする）。
    case "SET_TURN_PLAYER": {
      return { ...current, turnPlayer: action.player, turnNumber: 1, roundNumber: 1, startPlayer: action.player };
    }
    // ターンタイマー（src/turn-timer.js）専用。優先権の所在・現在の窓が燃え尽きる時刻・
    // 今が「基本時間（ロープ非表示）」か「延長（ロープ表示、砂時計を1個仮消費中）」か・
    // 座席ごとの砂時計の残り数を、1回のアクションでまとめて更新する（以前は
    // SET_PRIORITY/SET_HOURGLASS_STOCKという2つの別アクションだったが、オンライン化に
    // あたり「1つの論理的なイベント（例: ターン開始時の全員分の砂時計初期化＋優先権付与）を
    // 1回のサーバー往復で原子的に書き込みたい」という理由で1本化した）。patchの各
    // フィールドは省略可（undefinedのものは変更しない）。hourglassStockだけは「差分の
    // マージ」であり全置換ではない——呼び出し側が古いスナップショットから丸ごと組み立てて
    // 送ると、他の座席が別経路で確定させた変更を上書きして消してしまう「失われた更新」の
    // 危険があるため。
    case "SET_PRIORITY_STATE": {
      const patch = action.patch ?? {};
      return {
        ...current,
        ...(patch.player !== undefined ? { priorityPlayer: patch.player } : {}),
        ...(patch.deadline !== undefined ? { priorityDeadline: patch.deadline } : {}),
        ...(patch.phase !== undefined ? { priorityPhase: patch.phase } : {}),
        ...(patch.hourglassStock !== undefined
          ? { hourglassStock: { ...current.hourglassStock, ...patch.hourglassStock } }
          : {}),
      };
    }
    // 「ターンを次のプレイヤーへ渡す」ボタン。参加座席(activePlayers)を時計回り順に絞り込み、
    // 現在のturnPlayerの次の座席へ進める（末尾の次は先頭に戻る）。次の座席がstartPlayer
    // （実際に選ばれたスタートプレイヤー、座席Aとは限らない）に戻った時だけラウンド数を+1する
    // （「プレイヤー全員のターンが終わったら1ラウンド」）。
    case "NEXT_TURN": {
      if (!current.turnPlayer || current.activePlayers.length === 0) return current;
      const order = SEAT_ORDER.filter((p) => current.activePlayers.includes(p));
      const idx = order.indexOf(current.turnPlayer);
      const next = order[(idx + 1) % order.length];
      // ターンを終えるプレイヤー自身の公開ドローが残っていれば、ここで手札へ合流させる。
      const tokens = mergePublicDrawIntoHand(current.tokens, current.turnPlayer);
      return {
        ...current,
        tokens,
        turnPlayer: next,
        turnNumber: (current.turnNumber ?? 1) + 1,
        roundNumber: next === current.startPlayer ? (current.roundNumber ?? 1) + 1 : (current.roundNumber ?? 1),
      };
    }
    // セットアップウィザードの手順2: 山札（無色/白黒カードはaction.includeBlackWhiteに応じて
    // 含めるかどうか選べる）をシャッフルし、場の7×7＝49マスに1枚ずつ裏向きで配置する。
    // 再実行しても安全なように、まず場のカード（駒は除く）だけを一旦取り除いてから配り直す。
    case "SETUP_FILL_BOARD": {
      const tokensWithoutBoardCards = current.tokens.filter(
        (t) => !(t.kind === "card" && t.location.zone === "cell")
      );
      let pool = expandDeck(NORMAL_CARDS);
      if (!action.includeBlackWhite) {
        pool = pool.filter((cardId) => {
          const def = NORMAL_CARDS.find((c) => c.id === cardId);
          return def.color !== "white" && def.color !== "black";
        });
      }
      const shuffledPool = shuffled(pool);
      const boardCardIds = shuffledPool.slice(0, 49);
      const remainingDeck = shuffledPool.slice(49);
      const newTokens = [];
      let i = 0;
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
          newTokens.push({ id: uid("card"), kind: "card", cardId: boardCardIds[i], faceUp: false, location: { zone: "cell", row, col } });
          i++;
        }
      }
      return {
        ...current,
        tokens: [...tokensWithoutBoardCards, ...newTokens],
        piles: { ...current.piles, deck: remainingDeck },
      };
    }
    // 山札が切れた時のルール（docs/rulebook.md「こんな時は」）: 「捨て場のカードをそのまま
    // 裏向きにして山札とする。シャッフルはしない。」物理的には「捨て場の山をそのままひっくり
    // 返して山札にする」動作にあたるため、並び順を反転させる（捨て場で一番下＝一番古く
    // 捨てられたカードが、ひっくり返すことで新しい山札の一番上＝最初に引かれるカードになる）。
    case "REFILL_DECK_FROM_DISCARD": {
      return {
        ...current,
        piles: { ...current.piles, deck: [...current.piles.discard].reverse(), discard: [] },
      };
    }
    // 相手ゲート侵攻ボーナス（docs/rulebook.md「Gate Invasion Bonus」）①: 侵攻された側
    // (action.defender)の手札を半分（端数切り捨て）無作為に、侵攻した側(action.attacker)の
    // 手札へ移す。実際にどのカードが対象かは呼び出し側（gate-invasion.js）が事前に無作為抽選し、
    // action.tokenIdsとして渡す（ポップアップの文言に「N枚」と事前に出すため、枚数だけでなく
    // 対象そのものも先に決めてから見せる必要があった）。
    case "GATE_INVASION_STEAL_HAND": {
      const idSet = new Set(action.tokenIds);
      const tokens = current.tokens.map((t) =>
        idSet.has(t.id)
          ? { ...t, location: { zone: "hand", player: action.attacker }, faceUp: faceUpForLocation({ zone: "hand", player: action.attacker }) }
          : t
      );
      return { ...current, tokens };
    }
    // 相手ゲート侵攻ボーナス②: エターナルカードの山から1枚（action.cardId、呼び出し側が既に
    // pop位置を確認済み）を、侵攻した側のロックエリアの対応する色のスロットへ表向きでロックする。
    // そのスロットに既に何か（ファーストカードを除く）があれば、先に手札へ加える
    // （ルール「ロックする箇所に既にカードがある場合、全て手札に加える」）。
    case "GATE_INVASION_ETERNAL": {
      const eternalPile = current.piles.eternal.slice(0, -1);
      const def = ETERNAL_CARDS.find((c) => c.id === action.cardId);
      const colorIndex = COLORS.indexOf(def.color);
      const side = SEAT_TO_SIDE[action.attacker];
      const bumpedIds = new Set(
        current.tokens
          .filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === colorIndex && !t.cardId.startsWith("first-"))
          .map((t) => t.id)
      );
      const tokens = current.tokens.map((t) =>
        bumpedIds.has(t.id)
          ? { ...t, location: { zone: "hand", player: action.attacker }, faceUp: faceUpForLocation({ zone: "hand", player: action.attacker }) }
          : t
      );
      const newEternalToken = {
        id: uid("card"),
        kind: "card",
        cardId: action.cardId,
        faceUp: true,
        location: { zone: "lock", side, index: colorIndex },
      };
      return {
        ...current,
        tokens: [...tokens, newEternalToken],
        piles: { ...current.piles, eternal: eternalPile },
      };
    }
    // 相手ゲート侵攻ボーナス③④: 侵攻した側の自分のゲートにあるカードを全て手札に加え、
    // その駒を自分のゲートへ強制移動する（侵攻中に乗っていた相手ゲートから帰還する）。
    case "GATE_INVASION_RETURN_HOME": {
      const side = SEAT_TO_SIDE[action.attacker];
      const homeGate = GATE_POSITIONS[side];
      const gateCardIds = new Set(
        current.tokens
          .filter((t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === homeGate.row && t.location.col === homeGate.col)
          .map((t) => t.id)
      );
      const tokens = current.tokens.map((t) => {
        if (gateCardIds.has(t.id)) {
          return { ...t, location: { zone: "hand", player: action.attacker }, faceUp: faceUpForLocation({ zone: "hand", player: action.attacker }) };
        }
        if (t.kind === "piece" && t.player === action.attacker) {
          return { ...t, location: { zone: "cell", ...homeGate } };
        }
        return t;
      });
      return { ...current, tokens };
    }
    default:
      return current;
  }
}

function dispatch(action) {
  state = reduce(state, action);
  for (const fn of listeners) fn(state);
}

export function moveToken(tokenId, location) {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "MOVE_TOKEN", tokenId, location });
  dispatch({ type: "MOVE_TOKEN", tokenId, location });
}

export function sendTokenToPile(tokenId, pile) {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "SEND_TOKEN_TO_PILE", tokenId, pile });
  dispatch({ type: "SEND_TOKEN_TO_PILE", tokenId, pile });
}

export function drawFromPile(pile, location) {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "DRAW_FROM_PILE", pile, location });
  dispatch({ type: "DRAW_FROM_PILE", pile, location });
}

export function flipToken(tokenId) {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "FLIP_TOKEN", tokenId });
  dispatch({ type: "FLIP_TOKEN", tokenId });
}

export function shuffleHand(player) {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "SHUFFLE_HAND", player });
  dispatch({ type: "SHUFFLE_HAND", player });
}

export function resetGame() {
  dispatch({ type: "RESET_GAME" });
}

// players: [{ player: "A", side: "bottom" }, ...]（座席の時計回り順、game-setup.jsが組み立てる）
export function setupAssignFirstCards(players) {
  dispatch({ type: "SETUP_ASSIGN_FIRST_CARDS", players });
}

export function setupFillBoard(includeBlackWhite) {
  dispatch({ type: "SETUP_FILL_BOARD", includeBlackWhite });
}

export function refillDeckFromDiscard() {
  dispatch({ type: "REFILL_DECK_FROM_DISCARD" });
}

export function setTurnPlayer(player) {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "SET_TURN_PLAYER", player });
  dispatch({ type: "SET_TURN_PLAYER", player });
}

export function nextTurn() {
  if (onlineMode && onlineTransport) return onlineTransport({ type: "NEXT_TURN" });
  dispatch({ type: "NEXT_TURN" });
}

// ターンタイマー（src/turn-timer.js）専用。優先権状態は隠す必要のない公開情報（誰の
// 優先権か・残り砂時計数は全員に見えるべき情報）のため、moveToken等のようなso7-apply-action
// Edge Function経由の楽観的並行制御は使わず、updateMyIdentity()と同じ「クライアントから
// 直接テーブルへ書き込む」パターンを踏襲する。そのため既存のonlineTransport（callAction用）
// とは別の、優先権専用の注入ポイントを新設する（online.js⇄state.jsの循環import回避の
// ための既存パターンの踏襲。online.jsのsubscribeToGame()がsetPriorityTransport()経由で
// 実際の書き込み関数を注入する）。
let priorityTransport = null;
export function setPriorityTransport(fn) {
  priorityTransport = fn;
}
export function setPriorityState(patch) {
  if (onlineMode && priorityTransport) return priorityTransport(patch);
  dispatch({ type: "SET_PRIORITY_STATE", patch });
}

// online.jsが"priority_changed"のBroadcastを受け取った時に使う、優先権状態だけの
// 軽量な部分更新。hydrateState()（盤面全体の総入れ替え）とは別に、隠す必要のないこの
// 情報だけを直接マージするための専用エントリポイント。reduce()を経由しない点は
// hydrateState()自体が既に持つ「サーバー由来の状態をactionを介さず直接適用する」という
// 前例の延長。
export function applyRemotePriorityPatch(patch) {
  state = {
    ...state,
    ...(patch.player !== undefined ? { priorityPlayer: patch.player } : {}),
    ...(patch.deadline !== undefined ? { priorityDeadline: patch.deadline } : {}),
    ...(patch.phase !== undefined ? { priorityPhase: patch.phase } : {}),
    ...(patch.hourglassStock !== undefined
      ? { hourglassStock: { ...state.hourglassStock, ...patch.hourglassStock } }
      : {}),
  };
  notifyListeners();
}

// tokenIds: 侵攻した側(attacker)が奪う、侵攻された側の手札トークンid（呼び出し側が無作為抽選済み）
export function gateInvasionStealHand(attacker, tokenIds) {
  dispatch({ type: "GATE_INVASION_STEAL_HAND", attacker, tokenIds });
}

// cardId: エターナルの山の一番上（＝呼び出し側が無作為抽選の結果として確認済み）のカードid
export function gateInvasionEternal(attacker, cardId) {
  dispatch({ type: "GATE_INVASION_ETERNAL", attacker, cardId });
}

export function gateInvasionReturnHome(attacker) {
  dispatch({ type: "GATE_INVASION_RETURN_HOME", attacker });
}
