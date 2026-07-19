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
// 今回ポートしているアクションは6種類のみ（MOVE_TOKEN / DRAW_FROM_PILE / FLIP_TOKEN /
// SET_TURN_PLAYER / NEXT_TURN / 新設BOOTSTRAP_GAME）。それ以外（セットアップウィザードの
// 個別ステップ・ゲート侵攻ボーナス等）はローカルモード専用のまま、次回以降のスコープ。

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
  | { zone: "hand"; player: string };

type Token = {
  id: string;
  kind: "card" | "piece";
  cardId?: string;
  faceUp?: boolean;
  color?: string;
  player?: string;
  location: Location;
};

type Piles = { deck: string[]; eternal: string[]; first: string[]; discard: string[] };

type GameState = {
  tokens: Token[];
  piles: Piles;
  activePlayers: string[];
  turnPlayer: string | null;
  turnNumber: number | null;
  roundNumber: number | null;
  startPlayer: string | null;
};

// オンライン版では手札の表裏フラグをローカル版のような「自分がAかどうか」で決める必要が
// ない（マスキングはso7_game_seatsの持ち主判定だけで行うため）。ロックエリアは物理ルール通り
// 常に表向き、盤面マスへの新規配置は裏向き、という部分だけ移植する。
function faceUpForLocation(location: Location): boolean {
  if (location.zone === "hand") return true;
  if (location.zone === "lock") return true;
  return false;
}
const isTable = (l: Location) => l.zone === "cell" || l.zone === "lock";

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
      return { ...current, piles, tokens: [...current.tokens, newToken] };
    }
    case "FLIP_TOKEN": {
      const tokens = current.tokens.map((t) =>
        t.id === action.tokenId && t.kind === "card" ? { ...t, faceUp: !t.faceUp } : t
      );
      return { ...current, tokens };
    }
    case "SET_TURN_PLAYER": {
      return { ...current, turnPlayer: action.player, turnNumber: 1, roundNumber: 1, startPlayer: action.player };
    }
    case "NEXT_TURN": {
      if (!current.turnPlayer || current.activePlayers.length === 0) return current;
      const order = SEAT_ORDER.filter((p) => current.activePlayers.includes(p));
      const idx = order.indexOf(current.turnPlayer);
      const next = order[(idx + 1) % order.length];
      return {
        ...current,
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
      };
    }
    default:
      return current;
  }
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
        : { zone: "hand", player: r.hand_player };
    const token: Token = { id: r.token_id, kind: r.kind, location };
    if (r.kind === "card") {
      token.cardId = r.card_id;
      token.faceUp = r.face_up;
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
    hand_player: loc.zone === "hand" ? loc.player : null,
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

    // 座席確認: 呼び出し元がこのゲームのいずれかの座席を持っているか。BOOTSTRAP_GAMEは
    // 部屋作成直後・座席登録の流れの中で叩く想定だが、それでも「座席を持っている」ことは
    // 変わらず要求する（部屋を作った人が最初の座席Aを登録してから呼ぶ、という流れにする）。
    const { data: seatRow } = await db
      .from("so7_game_seats")
      .select("seat")
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!seatRow) return json({ ok: false, error: "not_seated" }, 403);

    const { state: current, version } = await loadState(db, gameId);
    const next = reduce(current, action);

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
    const gamesPatch = {
      active_players: next.activePlayers,
      turn_player: next.turnPlayer,
      turn_number: next.turnNumber,
      round_number: next.roundNumber,
      start_player: next.startPlayer,
    };

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

    // 他のクライアントへ「変わったよ」とだけ知らせる（データ自体は載せない。受け取った側は
    // 自分が見えるビューを取り直す）。
    await db.channel(`game:${gameId}`).send({ type: "broadcast", event: "state_changed", payload: {} });

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
