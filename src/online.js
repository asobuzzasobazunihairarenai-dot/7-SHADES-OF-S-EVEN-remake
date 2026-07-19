// オンライン対戦（第一弾・最小構成）のクライアント側の窓口。
// supabase-jsは姉妹プロジェクト（7 SHADES OF S:EVEN 戦績管理システム）と同じCDN UMD版を
// index.htmlで読み込み、同じSupabaseプロジェクトに相乗りする（テーブルはso7_プレフィックスで
// 完全に分離、詳細はsupabase_setup_so7.sqlのコメント参照）。
//
// 責務: マジックリンクログイン、部屋の作成/参加（座席選択）、アクションの送信
// （so7-apply-action Edge Function呼び出し）、サーバー状態の取得とstate.jsへの反映
// （hydrateState）、Broadcastでの変化通知の購読。
//
// 隠し情報（山札の中身・他プレイヤーの手札）はso7_game_tokens_visible /
// so7_game_piles_visibleという「見える範囲だけ返すビュー」からしか読まない。生テーブルへの
// 直接アクセスはRLSで拒否されているため、このファイルが山札の並び順等を知ることはできない
// （＝ローカルモードと違い、このクライアント側コードは意図的に「全部は見えない」）。

import {
  setOnlineMode,
  setOnlineTransport,
  hydrateState,
  isOnlineMode,
  notifyListeners,
} from "./state.js";

// state.jsの方が唯一の真実（main.jsも同じ関数をstate.jsから直接importして使う）。
// ここでは呼び出し側（online-ui.js）の利便性のためだけに再エクスポートする。
export { isOnlineMode };
import { SEAT_TO_SIDE, SEAT_ORDER } from "./board-layout.js";

const SUPABASE_URL = "https://prnddzrnblfysggiuzmo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YFYWr0FghhXbrqNQJ9Jzgw_hu31kvw9";
const EDGE_FUNCTION_NAME = "so7-apply-action";

// index.htmlでCDN UMD版(<script src=".../supabase.js">)を読み込んでいる前提。
// グローバルの`supabase`オブジェクトが無ければオンライン機能自体を無効化する
// （ローカルモードだけは引き続き使えるようにするため、ここでは例外を投げない）。
const client = typeof window !== "undefined" && window.supabase
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

let currentGameId = null;
let currentSeat = null;
let broadcastChannel = null;
let authChangeListeners = [];

export function isOnlineAvailable() {
  return !!client;
}

// --- 認証（メールのマジックリンク） -----------------------------------------------

export async function signInWithMagicLink(email) {
  if (!client) throw new Error("Supabaseクライアントが初期化されていません");
  // Supabase側の「Site URL」は姉妹プロジェクト（戦績管理システム）用のポートに設定されて
  // いるため、明示的に「今開いているこのページ」を戻り先として指定する（ホスト/ポートが
  // 変わっても常に正しく動くように）。ただしこのURLはSupabaseダッシュボード
  // 「Authentication > URL Configuration」のRedirect URLs欄で許可されている必要がある。
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  });
  if (error) throw error;
}

export async function getCurrentUser() {
  if (!client) return null;
  const { data } = await client.auth.getUser();
  return data?.user ?? null;
}

export async function signOut() {
  if (!client) return;
  await client.auth.signOut();
  leaveGame();
}

// ログイン状態が変わるたび（マジックリンクのリンクを踏んだ直後など）に呼ばれる。
// online-ui.jsがログイン画面の表示切り替えに使う。
export function onAuthChange(fn) {
  authChangeListeners.push(fn);
  return () => {
    authChangeListeners = authChangeListeners.filter((f) => f !== fn);
  };
}
if (client) {
  client.auth.onAuthStateChange((_event, session) => {
    for (const fn of authChangeListeners) fn(session?.user ?? null);
  });
}

// --- 部屋の作成・参加 --------------------------------------------------------------

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// 部屋を新規作成し、作成者自身を座席Aとして登録する。戻り値はroom id（URLの?room=に使う）。
export async function createRoom() {
  const user = await getCurrentUser();
  if (!user) throw new Error("ログインしてください");
  const gameId = generateRoomId();
  const { error: gameErr } = await client.from("so7_games").insert({ id: gameId });
  if (gameErr) throw gameErr;
  await claimSeat(gameId, "A");
  return gameId;
}

// 指定した座席で部屋に参加する。既に他の人がその座席を使っていればUNIQUE制約違反になる
// （so7_game_seatsの unique(game_id, seat)）。
export async function claimSeat(gameId, seat) {
  const user = await getCurrentUser();
  if (!user) throw new Error("ログインしてください");
  const { error } = await client.from("so7_game_seats").insert({ game_id: gameId, seat, user_id: user.id });
  if (error) {
    if (String(error.message ?? "").includes("duplicate key")) {
      throw new Error("その座席は既に使われています");
    }
    throw error;
  }
  currentGameId = gameId;
  currentSeat = seat;
  subscribeToGame(gameId);
}

// 今この部屋に参加済みの座席一覧（{seat, side}の配列、SEAT_ORDER順）を返す。
// BOOTSTRAP_GAMEのplayers引数や座席選択UIの「空いている席」判定に使う。
export async function getJoinedSeats(gameId) {
  const { data, error } = await client.from("so7_game_seats").select("seat").eq("game_id", gameId);
  if (error) throw error;
  const seats = (data ?? []).map((r) => r.seat);
  return SEAT_ORDER.filter((s) => seats.includes(s)).map((s) => ({ player: s, side: SEAT_TO_SIDE[s] }));
}

export function getCurrentGameId() {
  return currentGameId;
}

export function getMySeat() {
  return currentSeat;
}

export function leaveGame() {
  if (broadcastChannel) {
    client?.removeChannel(broadcastChannel);
    broadcastChannel = null;
  }
  currentGameId = null;
  currentSeat = null;
  setOnlineMode(false);
}

// --- アクション送信（so7-apply-action Edge Function） -------------------------------

async function callAction(action) {
  if (!currentGameId) throw new Error("部屋に参加していません");
  const { data, error } = await client.functions.invoke(EDGE_FUNCTION_NAME, {
    body: { game_id: currentGameId, action },
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error ?? "アクションが失敗しました");
  return data;
}

// ゲーム開始（セットアップウィザードの代わり）。部屋に参加済みの座席を集めて
// BOOTSTRAP_GAMEを送る。
export async function startGame(gameId, { includeBlackWhite = false } = {}) {
  const players = await getJoinedSeats(gameId);
  if (players.length < 2) throw new Error("2人以上揃ってから開始してください");
  return callAction({ type: "BOOTSTRAP_GAME", players, includeBlackWhite });
}

// --- サーバー状態の取得・反映 --------------------------------------------------------

// so7_games・so7_game_tokens_visible・so7_game_piles_visibleを取得し、state.jsの
// getState()と同じ形に組み直してhydrateState()へ渡す。DRAW_FROM_PILEの応答に含まれる
// revealedCardIdはここでは扱わない（呼び出し元がcallAction()の戻り値から直接使う）。
export async function fetchAndHydrate(gameId) {
  const [{ data: gameRow, error: gameErr }, { data: tokenRows, error: tokenErr }, { data: pileRows, error: pileErr }] =
    await Promise.all([
      client.from("so7_games").select("*").eq("id", gameId).maybeSingle(),
      client.from("so7_game_tokens_visible").select("*").eq("game_id", gameId).order("order_index", { ascending: true }),
      client.from("so7_game_piles_visible").select("*").eq("game_id", gameId),
    ]);
  if (gameErr) throw gameErr;
  if (tokenErr) throw tokenErr;
  if (pileErr) throw pileErr;
  if (!gameRow) return;

  const tokens = (tokenRows ?? []).map((r) => {
    const location =
      r.zone === "cell"
        ? { zone: "cell", row: r.row, col: r.col }
        : r.zone === "lock"
        ? { zone: "lock", side: r.side, index: r.idx }
        : { zone: "hand", player: r.hand_player };
    const token = { id: r.token_id, kind: r.kind, location };
    if (r.kind === "card") {
      token.cardId = r.card_id; // 見えない場合はnull（buildFlatCard等はcardId未確定の描画に
      // 対応していないため、この最小構成では「隠れているカードの見た目」の描画は
      // 次回以降の課題として明記する）。
      token.faceUp = r.face_up;
    } else {
      token.color = r.color;
      token.player = r.piece_player;
    }
    return token;
  });

  const piles = { deck: [], eternal: [], first: [], discard: [] };
  for (const r of pileRows ?? []) {
    piles[r.pile_name] = r.pile_name === "discard" ? r.cards ?? [] : new Array(r.card_count ?? 0).fill(null);
  }

  hydrateState({
    tokens,
    piles,
    activePlayers: gameRow.active_players ?? [],
    turnPlayer: gameRow.turn_player,
    turnNumber: gameRow.turn_number,
    roundNumber: gameRow.round_number,
    startPlayer: gameRow.start_player,
  });
}

function subscribeToGame(gameId) {
  if (broadcastChannel) client.removeChannel(broadcastChannel);
  broadcastChannel = client
    .channel(`game:${gameId}`)
    .on("broadcast", { event: "state_changed" }, () => {
      fetchAndHydrate(gameId).catch((err) => console.error("fetchAndHydrate failed", err));
    })
    .subscribe();
  setOnlineMode(true);
  setOnlineTransport(callAction);
  // fetchAndHydrate()（ネットワーク往復あり）を待たず、この場で即座に再描画を強制する。
  // これが無いと、部屋に参加した直後のわずかな間だけ、まだisOnlineMode()が反映される前の
  // 画面（セットアップウィザード等のローカル専用ボタンがまだ押せる状態）が残ってしまう。
  notifyListeners();
  fetchAndHydrate(gameId).catch((err) => console.error("fetchAndHydrate failed", err));
}
