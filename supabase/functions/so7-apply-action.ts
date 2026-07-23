// Supabase Edge Function: so7-apply-action
// 役割: 7 SHADES OF S:EVEN オンライン対戦（第一弾・最小構成）で、クライアントから送られた
//       アクションを受け取り、盤面状態（山札・手札の中身など「隠すべき情報」を含む）を
//       サーバー側だけが知る形で更新する。クライアントは自分が見えるビュー
//       （so7_game_tokens_visible / so7_game_piles_visible）を通してしか状態を読めないため、
//       山札の並び順や他プレイヤーの手札を実際に読み書きできるのはこの関数だけ。
//
// デプロイ方法(Supabaseダッシュボード、notify-on-event.tsと同じ運用):
//   1. 左メニュー「Edge Functions」→「Deploy a new function」
//   2. Function name: so7-apply-action
//   3. このファイルの中身をまるごと貼り付けて Deploy
//   4. SQL Editorで supabase_setup_so7.sql を先に実行し、so7_apply_and_commit RPC・
//      各テーブル・ビューを作成しておくこと。
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY は Supabase が自動で
// 環境変数として渡してくれるので、自分で設定する必要はない。
//
// 権限チェックの方針: このアプリのPhase1方針「ルール適用は一切しない」(CLAUDE.md)に
// 合わせ、「呼び出し元がこのゲームのいずれかの座席を持っているか」だけを確認する。
// 「今の手番か」「このトークンは自分の物か」は問わない（ローカル版と同じ自由度）。
//
// ポートしているアクションはMOVE_TOKEN / DRAW_FROM_PILE / SEND_TOKEN_TO_PILE / FLIP_TOKEN /
// SHUFFLE_HAND / SET_TURN_PLAYER / NEXT_TURN / BOOTSTRAP_GAME / REQUEST_FINAL_LOCK /
// RESPOND_FINAL_LOCK。それ以外（セットアップウィザードの個別ステップ等）はローカルモード
// 専用のまま。「公開ドロー」ボタンは新しいアクション型を追加せず、DRAW_FROM_PILEを
// location.zone="publicDraw"で呼ぶだけなので追加のポートは不要（faceUpForLocation/
// mergePublicDrawIntoHand参照）。相手ゲート侵攻ボーナスはNEXT_TURNの処理直前に
// applyGateInvasions()として組み込み済み（隠し情報の無作為抽選が必要なため、サーバー側で
// 判定から適用まで行う。詳細は該当コメント参照）。REQUEST_FINAL_LOCK/RESPOND_FINAL_LOCK
// （最後のロック承認、src/state.jsと同じロジック）は隠す必要の無い公開情報のみを扱うため、
// 特別な権限チェックは無い（座席さえ持っていれば誰でも承認/却下できる、既存の
// 「座席を持っていれば何でも動かせる」方針のまま）。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ---------------------------------------------------------------------------
// src/board-layout.js・src/cards-data.jsからの複製。
// このEdge Functionはダッシュボードに直接貼り付けてデプロイする運用（ビルド無しの
// 静的サイト側からrelative importできない）ため、値をそのままコピーしている。
// 元ファイルの該当箇所を変更したら、こちらも忘れずに直すこと。
// ---------------------------------------------------------------------------
const COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];
const GATE_POSITIONS: Record<string, { row: number; col: number }> = {
  top: { row: 0, col: 3 },
  bottom: { row: 6, col: 3 },
  left: { row: 3, col: 0 },
  right: { row: 3, col: 6 },
};
const SEAT_TO_SIDE: Record<string, string> = { A: "bottom", B: "left", C: "top", D: "right" };
const SIDE_TO_SEAT: Record<string, string> = { bottom: "A", left: "B", top: "C", right: "D" };
const SEAT_ORDER = ["A", "B", "C", "D"];

const NORMAL_CARDS: { id: string; color: string; count: number }[] = [
  { id: "red-jump-pad", color: "red", count: 7 },
  { id: "red-counter-lock", color: "red", count: 7 },
  { id: "orange-mass-change", color: "orange", count: 7 },
  { id: "orange-harvest-sow", color: "orange", count: 7 },
  { id: "yellow-sleight-of-hand", color: "yellow", count: 7 },
  { id: "yellow-gamble", color: "yellow", count: 7 },
  { id: "green-joint-construction", color: "green", count: 7 },
  { id: "green-growing-trees", color: "green", count: 7 },
  { id: "blue-slum-official", color: "blue", count: 7 },
  { id: "blue-choosable-trap", color: "blue", count: 7 },
  { id: "pink-party", color: "pink", count: 7 },
  { id: "pink-present", color: "pink", count: 7 },
  { id: "purple-trial-ritual", color: "purple", count: 7 },
  { id: "purple-sorry", color: "purple", count: 7 },
  { id: "rainbow-shard", color: "rainbow", count: 7 },
  { id: "white-radiance", color: "white", count: 2 },
  { id: "white-awakening", color: "white", count: 2 },
  { id: "black-faded-cat", color: "black", count: 1 },
  { id: "black-contract-brand", color: "black", count: 2 },
];

const FIRST_CARDS: { id: string; color: string }[] = [
  { id: "first-red", color: "red" },
  { id: "first-orange", color: "orange" },
  { id: "first-yellow", color: "yellow" },
  { id: "first-green", color: "green" },
  { id: "first-blue", color: "blue" },
  { id: "first-pink", color: "pink" },
  { id: "first-purple", color: "purple" },
];

function shuffled<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function expandDeck(defs: { id: string; count?: number }[]): string[] {
  const ids: string[] = [];
  for (const def of defs) {
    for (let i = 0; i < (def.count ?? 1); i++) ids.push(def.id);
  }
  return ids;
}

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

// ---------------------------------------------------------------------------
// 型（src/state.jsのtokens/pilesと同じ形）
// ---------------------------------------------------------------------------
type Location =
  | { zone: "cell"; row: number; col: number }
  | { zone: "lock"; side: string; index: number }
  | { zone: "hand"; player: string }
  | { zone: "publicDraw"; player: string };

type Token = {
  id: string;
  kind: "card" | "piece";
  cardId?: string;
  faceUp?: boolean;
  color?: string;
  player?: string;
  location: Location;
  revealSource?: "manual" | "draw"; // 手札公開エリア（zone: "publicDraw"）内でのみ意味を持つ
};

type Piles = { deck: string[]; eternal: string[]; first: string[]; discard: string[] };

type PendingFinalLock = {
  tokenId: string;
  location: Location;
  attacker: string;
  queue: string[];
} | null;

type GameState = {
  tokens: Token[];
  piles: Piles;
  activePlayers: string[];
  turnPlayer: string | null;
  turnNumber: number | null;
  roundNumber: number | null;
  startPlayer: string | null;
  pendingFinalLock: PendingFinalLock;
};

// オンライン版では手札の表裏フラグをローカル版のような「自分がAかどうか」で決める必要が
// ない（マスキングはso7_game_seatsの持ち主判定だけで行うため）。ロックエリアは物理ルール通り
// 常に表向き、盤面マスへの新規配置は裏向き、という部分だけ移植する。
function faceUpForLocation(location: Location): boolean {
  if (location.zone === "hand") return true;
  if (location.zone === "lock") return true;
  if (location.zone === "publicDraw") return true; // 公開ドロー：誰が引いたか常に見える
  return false;
}
const isTable = (l: Location) => l.zone === "cell" || l.zone === "lock";

// 「公開ドロー」で引いたカードを、手札シャッフル・ターン終了のどちらかが起きた時点で
// 通常の手札へ合流させる（src/state.jsのmergePublicDrawIntoHandと同じロジック）。
function mergePublicDrawIntoHand(tokens: Token[], player: string): Token[] {
  return tokens.map((t) =>
    t.kind === "card" && t.location.zone === "publicDraw" && (t.location as { player: string }).player === player
      ? { ...t, location: { zone: "hand", player } }
      : t
  );
}

// ---------------------------------------------------------------------------
// reduce: src/state.jsのreduce()から、今回ポートする6ケースのみ移植したもの。
// ---------------------------------------------------------------------------
function reduce(current: GameState, action: any): GameState {
  switch (action.type) {
    case "MOVE_TOKEN": {
      const token = current.tokens.find((t) => t.id === action.tokenId);
      if (!token) return current;
      const next: Token = { ...token, location: action.location };
      if (token.kind === "card") {
        if (action.location.zone === "lock") {
          next.faceUp = true;
        } else if (!(isTable(token.location) && isTable(action.location))) {
          next.faceUp = faceUpForLocation(action.location);
        }
        // src/state.jsのMOVE_TOKENケースと同じ「手動配置」印付け。
        if (action.location.zone === "publicDraw" && token.location.zone !== "publicDraw") {
          next.revealSource = "manual";
        }
      }
      const rest = current.tokens.filter((t) => t.id !== action.tokenId);
      return { ...current, tokens: [...rest, next] };
    }
    case "DRAW_FROM_PILE": {
      const pileArray = current.piles[action.pile as keyof Piles];
      if (!pileArray || pileArray.length === 0) return current;
      const cardId = pileArray[pileArray.length - 1];
      const piles = { ...current.piles, [action.pile]: pileArray.slice(0, -1) };
      const faceUp = faceUpForLocation(action.location);
      const newToken: Token = { id: uid("card"), kind: "card", cardId, faceUp, location: action.location };
      if (action.location.zone === "publicDraw") newToken.revealSource = "draw";
      return { ...current, piles, tokens: [...current.tokens, newToken] };
    }
    case "SEND_TOKEN_TO_PILE": {
      const token = current.tokens.find((t) => t.id === action.tokenId);
      if (!token) return current;
      const tokens = current.tokens.filter((t) => t.id !== action.tokenId);
      const pileArray = current.piles[action.pile as keyof Piles];
      const piles = { ...current.piles, [action.pile]: [...pileArray, token.cardId] };
      return { ...current, tokens, piles };
    }
    case "FLIP_TOKEN": {
      const tokens = current.tokens.map((t) =>
        t.id === action.tokenId && t.kind === "card" ? { ...t, faceUp: !t.faceUp } : t
      );
      return { ...current, tokens };
    }
    // src/state.jsのSHUFFLE_HANDケースと同じロジック（手札シャッフルボタン）。
    // order_indexはコミット時に配列の並び順からそのまま再採番される（tokenToRow参照）ため、
    // ここで並び替えた配列を返すだけで、次回fetchAndHydrate時の手札の並びに反映される。
    case "SHUFFLE_HAND": {
      // src/state.jsのSHUFFLE_HANDケースと同じロジック。シャッフル前に、まだ手札へ
      // 合流していない公開ドローのカードがあれば先に合流させる。
      const hasPendingPublicDraw = current.tokens.some(
        (t) => t.kind === "card" && t.location.zone === "publicDraw" && (t.location as { player: string }).player === action.player
      );
      const mergedTokens = hasPendingPublicDraw ? mergePublicDrawIntoHand(current.tokens, action.player) : current.tokens;
      const handTokens = mergedTokens.filter(
        (t) => t.kind === "card" && t.location.zone === "hand" && (t.location as { player: string }).player === action.player
      );
      if (handTokens.length < 2) {
        if (!hasPendingPublicDraw) return current;
        return { ...current, tokens: mergedTokens };
      }
      const others = mergedTokens.filter(
        (t) => !(t.kind === "card" && t.location.zone === "hand" && (t.location as { player: string }).player === action.player)
      );
      return { ...current, tokens: [...others, ...shuffled(handTokens)] };
    }
    case "SET_TURN_PLAYER": {
      return { ...current, turnPlayer: action.player, turnNumber: 1, roundNumber: 1, startPlayer: action.player };
    }
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
        roundNumber: next === current.startPlayer ? (current.roundNumber ?? 1) + 1 : current.roundNumber ?? 1,
      };
    }
    // 新設: セットアップウィザードの代わりに、参加座席(action.players、時計回り順、
    // so7_game_seatsから組み立てる)へファーストカード+同色の駒を配り、盤面49マスへ
    // 山札を裏向きで配り、無作為にスタートプレイヤーを決める、という一連の初期化を
    // まとめて行う（SETUP_ASSIGN_FIRST_CARDS + SETUP_FILL_BOARD + SET_TURN_PLAYERの合体版）。
    case "BOOTSTRAP_GAME": {
      const players: { player: string; side: string }[] = action.players;
      const includeBlackWhite: boolean = !!action.includeBlackWhite;

      const firstPile = shuffled(expandDeck(FIRST_CARDS));
      const newTokens: Token[] = [];
      for (const { player, side } of players) {
        if (firstPile.length === 0) break;
        const cardId = firstPile.pop()!;
        const def = FIRST_CARDS.find((c) => c.id === cardId)!;
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
          player,
          location: { zone: "cell", ...GATE_POSITIONS[side] },
        });
      }

      let pool = expandDeck(NORMAL_CARDS);
      if (!includeBlackWhite) {
        pool = pool.filter((cardId) => {
          const def = NORMAL_CARDS.find((c) => c.id === cardId)!;
          return def.color !== "white" && def.color !== "black";
        });
      }
      const shuffledPool = shuffled(pool);
      const boardCardIds = shuffledPool.slice(0, 49);
      const remainingDeck = shuffledPool.slice(49);
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 7; col++) {
          const i = row * 7 + col;
          newTokens.push({
            id: uid("card"),
            kind: "card",
            cardId: boardCardIds[i],
            faceUp: false,
            location: { zone: "cell", row, col },
          });
        }
      }

      const activePlayers = players.map((p) => p.player);
      const startPlayer = activePlayers[Math.floor(Math.random() * activePlayers.length)];

      return {
        tokens: newTokens,
        piles: {
          deck: remainingDeck,
          eternal: shuffled(expandDeck(FIRST_CARDS.map((c) => ({ id: c.id, count: 1 })))), // placeholder, overwritten below
          first: firstPile,
          discard: [],
        },
        activePlayers,
        turnPlayer: startPlayer,
        turnNumber: 1,
        roundNumber: 1,
        startPlayer,
        pendingFinalLock: null,
      };
    }
    // 最後のロック承認①②（src/state.jsのREQUEST_FINAL_LOCK/RESPOND_FINAL_LOCKケースと
    // 同じロジック）。
    case "REQUEST_FINAL_LOCK": {
      if (current.pendingFinalLock) return current;
      return {
        ...current,
        pendingFinalLock: {
          tokenId: action.tokenId,
          location: action.location,
          attacker: action.attacker,
          queue: action.queue,
        },
      };
    }
    case "RESPOND_FINAL_LOCK": {
      const pending = current.pendingFinalLock;
      if (!pending) return current;
      if (!action.approve) {
        return { ...current, pendingFinalLock: null };
      }
      const queue = pending.queue.slice(1);
      if (queue.length === 0) {
        const token = current.tokens.find((t) => t.id === pending.tokenId);
        if (!token) return { ...current, pendingFinalLock: null };
        const next: Token = { ...token, location: pending.location, faceUp: true };
        const rest = current.tokens.filter((t) => t.id !== pending.tokenId);
        return { ...current, tokens: [...rest, next], pendingFinalLock: null };
      }
      return { ...current, pendingFinalLock: { ...pending, queue } };
    }
    default:
      return current;
  }
}

// ---------------------------------------------------------------------------
// 相手ゲート侵攻ボーナス（src/gate-invasion.js・src/state.jsからの移植）。
// ローカル版は「奪う手札」「エターナルの山の一番上」をクライアント側で無作為抽選していたが、
// オンラインではどちらも隠し情報（RLSでマスクされクライアントから見えない）のため、
// サーバー（このEdge Function、サービスロールキーでマスク無しアクセス）側で抽選から
// 確定まで行う。NEXT_TURNアクションの処理直前（reduce()を呼ぶ前）に、参加中の全プレイヤーを
// 時計回り順に走査して適用する。
// ---------------------------------------------------------------------------
type GateInvasionEvent = {
  attacker: string;
  defender: string;
  stolenCount: number;
  stolenTokenIds: string[]; // 中身は誰にも公開しない（攻撃側自身は次回fetchAndHydrate後に自分の手札として解決できる）
  eternalCardId: string | null; // ロックは常に表向き＝公開情報なので実際のcardIdをそのまま含めてよい
  bumpedCards: { tokenId: string; cardId: string }[]; // 同上、常に公開情報
  gateCards: { tokenId: string; cardId: string | null; wasPublic: boolean }[]; // 元のfaceUpに従う。裏向きだった分はcardIdをnullにする
};

function findInvadedDefender(state: GameState, attacker: string): string | null {
  const piece = state.tokens.find((t) => t.kind === "piece" && t.player === attacker);
  if (!piece || piece.location.zone !== "cell") return null;
  const loc = piece.location as { zone: "cell"; row: number; col: number };
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    if (pos.row !== loc.row || pos.col !== loc.col) continue;
    const defender = SIDE_TO_SEAT[side];
    if (defender === attacker) return null; // 自分のゲートは対象外
    if (!state.activePlayers.includes(defender)) return null; // 空席のゲートは対象外
    return defender;
  }
  return null;
}

function applyGateInvasions(initial: GameState): { state: GameState; events: GateInvasionEvent[] } {
  let state = initial;
  const events: GateInvasionEvent[] = [];
  const order = SEAT_ORDER.filter((p) => state.activePlayers.includes(p));

  for (const attacker of order) {
    const defender = findInvadedDefender(state, attacker);
    if (!defender) continue;

    // ①手札を半分（端数切り捨て）無作為に奪う
    const defenderHand = state.tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && (t.location as { player: string }).player === defender
    );
    const stealCount = Math.floor(defenderHand.length / 2);
    const stolen = shuffled(defenderHand).slice(0, stealCount);
    const stolenIds = new Set(stolen.map((t) => t.id));
    state = {
      ...state,
      tokens: state.tokens.map((t) =>
        stolenIds.has(t.id) ? { ...t, location: { zone: "hand", player: attacker }, faceUp: faceUpForLocation({ zone: "hand", player: attacker }) } : t
      ),
    };

    // ②エターナルカードを1枚無作為に獲得し、自分のロックエリアの対応する色にロックする。
    // そのスロットに既に何か（ファーストカードを除く）があれば、先に手札へ加える。
    let eternalCardId: string | null = null;
    const bumpedCards: { tokenId: string; cardId: string }[] = [];
    if (state.piles.eternal.length > 0) {
      const eternalPile = [...state.piles.eternal];
      eternalCardId = eternalPile.pop()!;
      const color = eternalCardId.replace(/^eternal-/, "");
      const colorIndex = COLORS.indexOf(color);
      const side = SEAT_TO_SIDE[attacker];
      const bumpedTokens = state.tokens.filter(
        (t) =>
          t.kind === "card" &&
          t.location.zone === "lock" &&
          (t.location as { side: string }).side === side &&
          (t.location as { index: number }).index === colorIndex &&
          !!t.cardId &&
          !t.cardId.startsWith("first-")
      );
      const bumpedIds = new Set(bumpedTokens.map((t) => t.id));
      for (const t of bumpedTokens) bumpedCards.push({ tokenId: t.id, cardId: t.cardId! });
      const newEternalToken: Token = {
        id: uid("card"),
        kind: "card",
        cardId: eternalCardId,
        faceUp: true,
        location: { zone: "lock", side, index: colorIndex },
      };
      state = {
        ...state,
        tokens: [
          ...state.tokens.map((t) =>
            bumpedIds.has(t.id)
              ? { ...t, location: { zone: "hand", player: attacker }, faceUp: faceUpForLocation({ zone: "hand", player: attacker }) }
              : t
          ),
          newEternalToken,
        ],
        piles: { ...state.piles, eternal: eternalPile },
      };
    }

    // ③自分のゲートにあるカードを全て手札に加え、ゲートに帰還する
    const side = SEAT_TO_SIDE[attacker];
    const homeGate = GATE_POSITIONS[side];
    const gateTokens = state.tokens.filter(
      (t) =>
        t.kind === "card" &&
        t.location.zone === "cell" &&
        (t.location as { row: number; col: number }).row === homeGate.row &&
        (t.location as { row: number; col: number }).col === homeGate.col
    );
    const gateCards = gateTokens.map((t) => ({
      tokenId: t.id,
      cardId: t.faceUp ? t.cardId ?? null : null,
      wasPublic: !!t.faceUp,
    }));
    const gateIds = new Set(gateTokens.map((t) => t.id));
    state = {
      ...state,
      tokens: state.tokens.map((t) => {
        if (gateIds.has(t.id)) {
          return { ...t, location: { zone: "hand", player: attacker }, faceUp: faceUpForLocation({ zone: "hand", player: attacker }) };
        }
        if (t.kind === "piece" && t.player === attacker) {
          return { ...t, location: { zone: "cell", ...homeGate } };
        }
        return t;
      }),
    };

    events.push({
      attacker,
      defender,
      stolenCount: stealCount,
      stolenTokenIds: [...stolenIds],
      eternalCardId,
      bumpedCards,
      gateCards,
    });
  }

  return { state, events };
}

// エターナルカード7種（各色1種）。BOOTSTRAP_GAMEのeternal山づくり専用に、上のreduce内の
// placeholderをここで正しい構成に差し替える（NORMAL_CARDS/FIRST_CARDSと同じ場所に
// まとめて置くと長くなりすぎるため、値だけここに分離した）。
const ETERNAL_CARD_IDS = [
  "eternal-red",
  "eternal-orange",
  "eternal-yellow",
  "eternal-green",
  "eternal-blue",
  "eternal-pink",
  "eternal-purple",
];

// ---------------------------------------------------------------------------
// DB <-> GameState 変換
// ---------------------------------------------------------------------------
async function loadState(db: any, gameId: string): Promise<{ state: GameState; version: number }> {
  const [{ data: gameRow }, { data: tokenRows }, { data: pileRows }] = await Promise.all([
    db.from("so7_games").select("*").eq("id", gameId).maybeSingle(),
    db.from("so7_game_tokens").select("*").eq("game_id", gameId).order("order_index", { ascending: true }),
    db.from("so7_game_piles").select("*").eq("game_id", gameId),
  ]);
  if (!gameRow) throw new Error("game_not_found");

  const tokens: Token[] = (tokenRows ?? []).map((r: any) => {
    const location: Location =
      r.zone === "cell"
        ? { zone: "cell", row: r.row, col: r.col }
        : r.zone === "lock"
        ? { zone: "lock", side: r.side, index: r.idx }
        : r.zone === "publicDraw"
        ? { zone: "publicDraw", player: r.hand_player }
        : { zone: "hand", player: r.hand_player };
    const token: Token = { id: r.token_id, kind: r.kind, location };
    if (r.kind === "card") {
      token.cardId = r.card_id;
      token.faceUp = r.face_up;
      if (r.reveal_source) token.revealSource = r.reveal_source;
    } else {
      token.color = r.color;
      token.player = r.piece_player;
    }
    return token;
  });

  const piles: Piles = { deck: [], eternal: [], first: [], discard: [] };
  for (const r of pileRows ?? []) {
    piles[r.pile_name as keyof Piles] = r.cards ?? [];
  }

  return {
    state: {
      tokens,
      piles,
      activePlayers: gameRow.active_players ?? [],
      turnPlayer: gameRow.turn_player,
      turnNumber: gameRow.turn_number,
      roundNumber: gameRow.round_number,
      startPlayer: gameRow.start_player,
      pendingFinalLock: gameRow.pending_final_lock ?? null,
    },
    version: gameRow.version,
  };
}

function tokenToRow(t: Token, orderIndex: number) {
  const loc: any = t.location;
  return {
    token_id: t.id,
    kind: t.kind,
    card_id: t.cardId ?? null,
    face_up: t.faceUp ?? false,
    color: t.color ?? null,
    piece_player: t.player ?? null,
    zone: loc.zone,
    row: loc.zone === "cell" ? loc.row : null,
    col: loc.zone === "cell" ? loc.col : null,
    side: loc.zone === "lock" ? loc.side : null,
    idx: loc.zone === "lock" ? loc.index : null,
    hand_player: loc.zone === "hand" || loc.zone === "publicDraw" ? loc.player : null,
    reveal_source: t.revealSource ?? null,
    order_index: orderIndex,
  };
}

// ブラウザ（別オリジンから動く静的サイト）から直接呼び出すため、CORS対応が必須。
// これが無いと、ブラウザが本番のPOSTリクエストの前に送る「OPTIONSプリフライト」に
// このFunctionが正しく応答できず、supabase-js側では「Failed to send a request to the
// Edge Function」という中身の分からないエラーになる（実際に何が悪いかはFunction側の
// ログを見ないと分からないため、原因特定しづらいハマりどころ）。
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  // ブラウザが本番リクエストの前に送るプリフライト確認。ここで204+CORSヘッダーを
  // 返さないと、実際のPOSTリクエスト自体が送信されない。
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const userId = userData.user.id;

    const body = await req.json();
    const gameId: string = body.game_id;
    const action = body.action;
    if (!gameId || !action?.type) return json({ ok: false, error: "bad_request" }, 400);

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 部屋の参加確認: 呼び出し元がこの部屋に参加しているか（so7_game_seatsに行があるか）。
    // 参加した時点ではまだ座席(seat)は決まっていない（「ゲームを開始する」を押した瞬間に
    // ランダムに割り振られる）ため、BOOTSTRAP_GAME以外のアクションだけ、実際に座席が
    // 割り当て済み（seatがnullでない）ことも追加で要求する。
    const { data: seatRow } = await db
      .from("so7_game_seats")
      .select("seat")
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!seatRow) return json({ ok: false, error: "not_seated" }, 403);
    if (action.type !== "BOOTSTRAP_GAME" && !seatRow.seat) {
      return json({ ok: false, error: "no_seat_assigned" }, 403);
    }

    let effectiveAction = action;
    if (action.type === "BOOTSTRAP_GAME") {
      // 参加時は座席を選ばせていないため、ここで部屋の参加者全員(so7_game_seats)を集めて
      // ランダムに座席(A/B/C/D、最大4人)を割り振り、書き戻す。ゲームロジック(reduce)の
      // BOOTSTRAP_GAMEケース自体は既存のまま（players引数を要求する形）なので、ここで
      // 組み立てたplayersを差し込む。
      const { data: memberRows, error: memberErr } = await db.from("so7_game_seats").select("user_id").eq("game_id", gameId);
      if (memberErr) return json({ ok: false, error: memberErr.message }, 500);
      const memberIds = (memberRows ?? []).map((r: any) => r.user_id as string);
      if (memberIds.length < 2) return json({ ok: false, error: "not_enough_players" }, 400);

      // 座席の並び順はローカル版(src/game-setup.jsのAUTO_SEATS_BY_COUNT)と揃える:
      // 2人なら対面(A・C)、3人ならA・B・C、4人なら全員。2人だけ隣同士(A・B)にならないよう
      // 特別扱いする。
      const seatsForCount: Record<number, string[]> = {
        2: ["A", "C"],
        3: ["A", "B", "C"],
        4: ["A", "B", "C", "D"],
      };
      const seatsToUse = seatsForCount[memberIds.length] ?? SEAT_ORDER.slice(0, memberIds.length);
      const shuffledIds = shuffled(memberIds).slice(0, seatsToUse.length);
      const assignments = shuffledIds.map((uid, i) => ({ userId: uid, seat: seatsToUse[i] }));
      for (const a of assignments) {
        const { error: updErr } = await db
          .from("so7_game_seats")
          .update({ seat: a.seat })
          .eq("game_id", gameId)
          .eq("user_id", a.userId);
        if (updErr) return json({ ok: false, error: updErr.message }, 500);
      }
      const players = assignments.map((a) => ({ player: a.seat, side: SEAT_TO_SIDE[a.seat] }));
      effectiveAction = { ...action, players };
    }

    const { state: current, version } = await loadState(db, gameId);

    // ターンを進める直前に、相手ゲート侵攻ボーナスの対象者がいないか全員分チェックし、
    // 該当すれば適用する（ローカル版のgate-invasion.jsと同じ判定・処理を、隠し情報の
    // 抽選が必要な分だけサーバー側で行う）。該当者がいなければworkingStateはcurrentのまま。
    let workingState = current;
    let gateInvasionEvents: GateInvasionEvent[] = [];
    if (effectiveAction.type === "NEXT_TURN") {
      const result = applyGateInvasions(workingState);
      workingState = result.state;
      gateInvasionEvents = result.events;
    }

    const next = reduce(workingState, effectiveAction);

    // BOOTSTRAP_GAMEのeternal placeholderを正しい構成に差し替える
    // （reduce()内で仮の値を入れているのはETERNAL_CARD_IDSの定義位置の都合のため）。
    if (action.type === "BOOTSTRAP_GAME") {
      next.piles.eternal = shuffled(ETERNAL_CARD_IDS);
    }

    if (next === current) {
      // 何も変わらなかった（例: 山が空でDRAW_FROM_PILEが不発）場合は書き込みをスキップ。
      return json({ ok: true, unchanged: true });
    }

    const tokensJson = next.tokens.map((t, i) => tokenToRow(t, i));
    const pilesJson = Object.entries(next.piles).map(([pile_name, cards]) => ({ pile_name, cards }));
    const gamesPatch: any = {
      active_players: next.activePlayers,
      turn_player: next.turnPlayer,
      turn_number: next.turnNumber,
      round_number: next.roundNumber,
      start_player: next.startPlayer,
    };
    // ターンタイマー設定（基本時間・延長時間・初期/最大砂時計数・補充ターン数・有効/無効）を
    // 対局全体で共通の値に固定する。includeBlackWhiteと同じく、BOOTSTRAP_GAME実行時に
    // 部屋作成者のその時点のローカル設定を1回だけ書き込み、以後は対局中変更しない
    // （src/online.jsのstartGame()参照）。優先権自体の状態（priorityPlayer等）はここを
    // 経由しない——updateMyIdentity()と同じ「クライアントから直接テーブルへ書き込む」
    // パターンで別途同期する（隠す必要の無い公開情報のため）。
    if (action.type === "BOOTSTRAP_GAME" && action.timerConfig) {
      gamesPatch.timer_config = action.timerConfig;
    }
    // 最後のロック承認: このアクションの時だけpending_final_lockを含める（保留が解消
    // された時はnullを明示的に含める）。それ以外のアクションはキー自体を含めないため、
    // SQL側のcoalesce()が現在値をそのまま維持する（supabase_setup_so7.sql参照）。
    if (effectiveAction.type === "REQUEST_FINAL_LOCK" || effectiveAction.type === "RESPOND_FINAL_LOCK") {
      gamesPatch.pending_final_lock = next.pendingFinalLock ?? null;
    }

    const { error: commitErr } = await db.rpc("so7_apply_and_commit", {
      p_game_id: gameId,
      p_expected_version: version,
      p_games_patch: gamesPatch,
      p_tokens: tokensJson,
      p_piles: pilesJson,
    });
    if (commitErr) {
      const isConflict = String(commitErr.message ?? "").includes("version_conflict");
      return json({ ok: false, error: isConflict ? "version_conflict" : commitErr.message }, isConflict ? 409 : 500);
    }

    // 「もう一度遊ぶ」機能（src/online.jsのcheckRematchReadiness/setRematchReady、
    // supabase_setup_so7.sqlのrematch_ready参照）: 新しい対局が始まったので、次の
    // 対局終了時にまた素の状態から使えるよう、この部屋の全座席のrematch_readyを
    // falseへ戻す。失敗しても対局開始自体は既に成功しているため致命的ではない
    // （次回「もう一度遊ぶ」を押した時に古いtrueが残っていても、全員分揃わなければ
    // どのみち再開しないだけ）。
    if (action.type === "BOOTSTRAP_GAME") {
      await db.from("so7_game_seats").update({ rematch_ready: false }).eq("game_id", gameId);
    }

    // 他のクライアントへ「変わったよ」と知らせる（盤面データ自体は載せない。受け取った側は
    // 自分が見えるビューを取り直す）。actorSeat/actionTypeは常に含める——隠す必要の無い
    // 情報（誰が何のアクションを行ったか）で、turn-timer.jsのonStateChangeがオンライン中に
    // 「本当に優先権保持者本人の操作でロープをリセットすべきか」を判定するのに使う
    // （src/last-action-info.js参照）。ゲート侵攻ボーナスが発生した場合だけ、公開しても
    // 問題ない範囲の情報（誰が誰に侵攻したか・奪った枚数・エターナルカードの種類等。
    // 奪った手札の中身そのものは含めない）をgateInvasionEventsとして追加で送る。
    await db.channel(`game:${gameId}`).send({
      type: "broadcast",
      event: "state_changed",
      payload: {
        actorSeat: seatRow.seat,
        actionType: effectiveAction.type,
        ...(gateInvasionEvents.length > 0 ? { gateInvasionEvents } : {}),
      },
    });

    // 山から自分の手札へ引いた場合だけ、獲得ポップアップ用に実際のcardIdを返す
    // （それ以外の場合、呼び出し元に山の中身を教えてはいけない）。
    let revealedCardId: string | null = null;
    if (action.type === "DRAW_FROM_PILE" && action.location?.zone === "hand") {
      const drawnToken = next.tokens[next.tokens.length - 1];
      if (drawnToken && drawnToken.location.zone === "hand" && drawnToken.location.player === seatRow.seat) {
        revealedCardId = drawnToken.cardId ?? null;
      }
    }

    return json({ ok: true, revealedCardId });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});
