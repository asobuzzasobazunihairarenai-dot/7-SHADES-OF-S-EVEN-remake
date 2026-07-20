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
import { SEAT_ORDER } from "./board-layout.js";
import { markSelfHandled } from "./self-handled-tokens.js";

// state.jsの方が唯一の真実（main.jsも同じ関数をstate.jsから直接importして使う）。
// ここでは呼び出し側（online-ui.js）の利便性のためだけに再エクスポートする。
export { isOnlineMode };

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

// --- デバッグログ（画面から内容を確認・コピーできるようにする） -----------------------------
// 「Failed to send a request to the Edge Function」のような、ブラウザの開発者ツールを
// 開かないと詳細が分からないエラーが起きた時に、非エンジニアのユーザーでも状況を
// 報告しやすくするための簡易ログ。姉妹プロジェクト（戦績管理システム）の
// デバッグログ機能と同じ考え方。ただしCORSブロックなど、ブラウザがJS側に理由を
// 一切渡さない種類のエラーは、この仕組みでも詳細までは分からない（その場合は
// ブラウザの開発者ツール(F12)のNetworkタブを直接見る必要がある旨、UI側で案内する）。
const debugLogEntries = [];
function logDebug(context, err) {
  const time = new Date().toLocaleTimeString("ja-JP");
  let detail = err?.message ?? String(err);
  if (err?.name) detail = `${err.name}: ${detail}`;
  if (err?.status !== undefined) detail += `（status: ${err.status}）`;
  if (err?.context?.status !== undefined) detail += `（context.status: ${err.context.status}）`;
  debugLogEntries.push(`[${time}] ${context}: ${detail}`);
  if (debugLogEntries.length > 50) debugLogEntries.shift();
  console.error(`[online.js] ${context}`, err);
}
export function getDebugLog() {
  return debugLogEntries.length ? debugLogEntries.join("\n") : "（まだログはありません）";
}
export function clearDebugLog() {
  debugLogEntries.length = 0;
}
async function withLog(context, fn) {
  try {
    return await fn();
  } catch (err) {
    logDebug(context, err);
    throw err;
  }
}

// --- 認証（メールのマジックリンク） -----------------------------------------------

export async function signInWithMagicLink(email) {
  return withLog("マジックリンク送信", async () => {
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
  });
}

// Googleアカウントでログイン。実際にGoogleのログイン画面へ遷移し、成功すると
// emailRedirectToで指定したこのページへ戻ってくる（マジックリンクと違い、ページ遷移を
// 伴う）。事前にSupabaseダッシュボード「Authentication > Sign In / Providers > Google」で
// Google Cloud Console発行のクライアントID/シークレットを設定し有効化しておく必要がある。
export async function signInWithGoogle() {
  return withLog("Googleログイン", async () => {
    if (!client) throw new Error("Supabaseクライアントが初期化されていません");
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.href },
    });
    if (error) throw error;
  });
}

// メールアドレス不要の匿名ログイン（ユドナリウムのような手軽さ）。ページ遷移せずその場で
// 完了し、確実にユニークなauth.uid()が発行されるため、隠し情報のマスキング（RLS）は
// メール/Googleログインと全く同じ仕組みのまま機能する。事前にSupabaseダッシュボード
// 「Authentication > Sign In / Providers」の「Anonymous Sign-Ins」を有効化しておく必要がある。
// ブラウザを変えたりデータを消したりすると同じ人として戻ってこられなくなる点に注意。
export async function signInAnonymously() {
  return withLog("匿名ログイン", async () => {
    if (!client) throw new Error("Supabaseクライアントが初期化されていません");
    const { error } = await client.auth.signInAnonymously();
    if (error) throw error;
  });
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

// ゲート侵攻ボーナスが発生した時（誰がターン終了を押したかに関わらず、部屋の全クライアント）
// に呼ばれる。main.jsがトースト通知を出すのに使う。onAuthChangeと同じ単純なpub/subパターン。
let gateInvasionEventListeners = [];
export function onGateInvasionEvents(fn) {
  gateInvasionEventListeners.push(fn);
  return () => {
    gateInvasionEventListeners = gateInvasionEventListeners.filter((f) => f !== fn);
  };
}
// main.jsのヘッダーボタン（「🌐 オンライン」）のラベルを、ログイン状態が分かるように
// 動的に変える時など、awaitせず同期的に「今ログイン中かどうか」を知りたい場面のために
// キャッシュしておく（getCurrentUser()は毎回サーバーに問い合わせる非同期関数のため）。
let cachedUser = null;
export function getCachedUser() {
  return cachedUser;
}

// Googleログインの場合、Supabaseのuser_metadataにGoogle側のプロフィール画像URLが
// 入っている（マッピング先のキー名は環境によりavatar_url/pictureのどちらのこともあるため
// 両方フォールバックする）。匿名ログイン等では両方とも無く、nullを返す。
export function getGoogleAvatarUrl() {
  return cachedUser?.user_metadata?.avatar_url ?? cachedUser?.user_metadata?.picture ?? null;
}
if (client) {
  client.auth.onAuthStateChange((_event, session) => {
    cachedUser = session?.user ?? null;
    for (const fn of authChangeListeners) fn(cachedUser);
  });
}

// --- 部屋の作成・参加 --------------------------------------------------------------

function generateRoomId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

// 部屋を新規作成し、作成者自身もその部屋に参加する（座席はまだ選ばない/決まらない。
// 「ゲームを開始する」を押した瞬間にso7-apply-action Edge Function側で参加者全員へ
// ランダムに割り振られる）。戻り値はroom id（URLの?room=に使う）。
export async function createRoom() {
  return withLog("部屋の作成", async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("ログインしてください");
    const gameId = generateRoomId();
    const { error: gameErr } = await client.from("so7_games").insert({ id: gameId });
    if (gameErr) throw gameErr;
    await joinRoom(gameId);
    return gameId;
  });
}

// 部屋に参加する（座席は選ばない。1ユーザーにつき1部屋1行、既に参加済みならUNIQUE制約
// 違反になる）。
export async function joinRoom(gameId) {
  return withLog("部屋に参加", async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("ログインしてください");

    // 永続プロフィール（so7_user_profiles）があれば、その値を最初の座席行にそのまま
    // 使う。無ければ列を省略しDB側のデフォルト（display_name/avatarはnull、
    // piece_skin_indexは0）に任せる。取得に失敗しても部屋参加自体は続行してよい
    // （単に前回の設定が引き継がれないだけ）。
    const seatRow = { game_id: gameId, user_id: user.id };
    const { data: profile } = await client
      .from("so7_user_profiles")
      .select("display_name, avatar, piece_skin_index")
      .eq("user_id", user.id)
      .maybeSingle();
    if (profile) {
      if (profile.display_name) seatRow.display_name = profile.display_name;
      if (profile.avatar) seatRow.avatar = profile.avatar;
      if (typeof profile.piece_skin_index === "number") seatRow.piece_skin_index = profile.piece_skin_index;
    }

    const { error } = await client.from("so7_game_seats").insert(seatRow);
    if (error) {
      if (String(error.message ?? "").includes("duplicate key")) {
        throw new Error("既にこの部屋に参加しています");
      }
      throw error;
    }
    currentGameId = gameId;
    currentSeat = null; // ゲーム開始時にランダムに割り当てられる
    subscribeToGame(gameId);
  });
}

// 今この部屋に参加している人数（座席未定でもカウントする）。
// 「ゲームを開始する」ボタンを2人以上揃ってから出す判定に使う。
export async function getMemberCount(gameId) {
  const { count, error } = await client
    .from("so7_game_seats")
    .select("*", { count: "exact", head: true })
    .eq("game_id", gameId);
  if (error) throw error;
  return count ?? 0;
}

export function getCurrentGameId() {
  return currentGameId;
}

export function getMySeat() {
  return currentSeat;
}

// main.js等の描画側が「自分の手札・自分専用ステータス」をどの座席として扱うかに使う。
// ローカルモードでは常に"A"（これまでの「1人で全座席を動かす」前提を完全に維持する）。
// オンラインモードでは実際に割り当てられた座席を返す（ゲーム開始前や割り当て未反映の間は
// フォールバックとして"A"）。getMySeat()はオンラインでない時・座席未割り当ての間はnullを
// 返す「部屋UI用の正直な値」として役割を分けている（部屋パネルの「今の座席」表示に使う）。
export function getSelfSeat() {
  // 検証用の一時的な抜け道: ?debugSeat=B のようにURLへ付けると、ローカルモードのままでも
  // B/C/Dの視点（盤面のビューア視点回転）を確認できる。本番の座席割り当てには一切影響しない
  // （callAction等はcurrentSeatを直接参照するため、このデバッグ値の影響を受けない）。
  const debugSeat = new URLSearchParams(window.location.search).get("debugSeat");
  if (debugSeat && SEAT_ORDER.includes(debugSeat)) return debugSeat;
  return isOnlineMode() ? currentSeat || "A" : "A";
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
  return withLog(`アクション送信(${action.type})`, async () => {
    if (!currentGameId) throw new Error("部屋に参加していません");
    const { data, error } = await client.functions.invoke(EDGE_FUNCTION_NAME, {
      body: { game_id: currentGameId, action },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.error ?? "アクションが失敗しました");
    return data;
  });
}

// ゲーム開始（セットアップウィザードの代わり）。座席の割り当てはso7-apply-action
// Edge Function側が部屋の参加者を見てランダムに行う（クライアント側では組み立てない）。
export async function startGame(gameId, { includeBlackWhite = false } = {}) {
  return withLog("ゲーム開始", async () => {
    const count = await getMemberCount(gameId);
    if (count < 2) throw new Error("2人以上揃ってから開始してください");
    return callAction({ type: "BOOTSTRAP_GAME", includeBlackWhite });
  });
}

// --- サーバー状態の取得・反映 --------------------------------------------------------

// 座席ごとのプレイヤー名・アバター・駒スキン選択のキャッシュ（{seat: {name, avatar,
// pieceSkinIndex, userId}}）。src/player-identity.js・src/piece-skins.jsがオンライン中に
// これを参照する。fetchAndHydrate()のたびに全座席分を取り直すほか、identity_changed
// Broadcast受信時にも単独で取り直す（updateIdentityRoster参照）。
let roster = {};

export function getSyncedIdentity(seat) {
  return roster[seat] ?? null;
}

async function updateIdentityRoster(gameId) {
  const { data: seatRows, error } = await client
    .from("so7_game_seats")
    .select("seat, user_id, display_name, avatar, piece_skin_index")
    .eq("game_id", gameId);
  if (error) throw error;
  const nextRoster = {};
  for (const r of seatRows ?? []) {
    if (!r.seat) continue;
    nextRoster[r.seat] = {
      name: r.display_name || null,
      avatar: r.avatar || null,
      pieceSkinIndex: r.piece_skin_index ?? 0,
      userId: r.user_id,
    };
    if (cachedUser && r.user_id === cachedUser.id) currentSeat = r.seat;
  }
  roster = nextRoster;
}

// 名前・アバター・駒スキンは隠すべき情報ではないため、so7-apply-action Edge Functionを
// 経由させず、joinRoom()と同じ「クライアントから直接テーブルへ書き込む」パターンを踏襲する。
export async function updateMyIdentity({ name, avatar, pieceSkinIndex } = {}) {
  return withLog("プレイヤー情報の更新", async () => {
    const user = await getCurrentUser();
    if (!user || !currentGameId) return;
    const patch = {};
    if (name !== undefined) patch.display_name = name;
    if (avatar !== undefined) patch.avatar = avatar;
    if (pieceSkinIndex !== undefined) patch.piece_skin_index = pieceSkinIndex;
    if (Object.keys(patch).length === 0) return;

    const { error } = await client
      .from("so7_game_seats")
      .update(patch)
      .eq("game_id", currentGameId)
      .eq("user_id", user.id);
    if (error) throw error;

    // ユーザーごとの永続プロフィールにも同時に反映する（ゲームをまたいで名前/アバター/
    // 駒スキンを覚えておくため。so7_game_seatsはゲームごとの行のため、これが無いと
    // 新しい部屋に参加するたびに白紙に戻ってしまう）。失敗してもso7_game_seats側の
    // 更新自体は既に成功しているため、このエラーで全体を失敗扱いにはしない。
    const { error: profileErr } = await client
      .from("so7_user_profiles")
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (profileErr) console.error("so7_user_profiles upsert failed", profileErr);

    // 自分のローカルキャッシュにも即座に反映（次の再取得を待たなくても自分の画面には
    // すぐ反映されるように）。
    if (currentSeat) {
      roster[currentSeat] = {
        ...(roster[currentSeat] ?? { userId: user.id }),
        ...(name !== undefined ? { name } : {}),
        ...(avatar !== undefined ? { avatar } : {}),
        ...(pieceSkinIndex !== undefined ? { pieceSkinIndex } : {}),
      };
    }

    // 他クライアントへ速やかに伝える（盤面のstate_changedとは無関係の情報のため別イベント名
    // にする。次の何らかの操作を待たずに、名前変更等がすぐ他プレイヤーへ伝わるようにする）。
    if (broadcastChannel) {
      broadcastChannel.send({ type: "broadcast", event: "identity_changed", payload: {} });
    }
  });
}

// so7_games・so7_game_tokens_visible・so7_game_piles_visibleを取得し、state.jsの
// getState()と同じ形に組み直してhydrateState()へ渡す。DRAW_FROM_PILEの応答に含まれる
// revealedCardIdはここでは扱わない（呼び出し元がcallAction()の戻り値から直接使う）。
export async function fetchAndHydrate(gameId) {
  return withLog("状態の取得", async () => {
    const [
      { data: gameRow, error: gameErr },
      { data: tokenRows, error: tokenErr },
      { data: pileRows, error: pileErr },
    ] = await Promise.all([
      client.from("so7_games").select("*").eq("id", gameId).maybeSingle(),
      client.from("so7_game_tokens_visible").select("*").eq("game_id", gameId).order("order_index", { ascending: true }),
      client.from("so7_game_piles_visible").select("*").eq("game_id", gameId),
      // 参加時点では自分の座席がまだ決まっていない（null）。「ゲームを開始する」が押されて
      // Edge Function側でランダムに割り当てられた後、この取得のたびに拾い直すことで
      // 自分の座席を知る（実際に割り当てが反映されるのはBroadcast経由でこの関数が
      // 再度呼ばれた時）。座席ロスター（名前・アバター・駒スキン含む全座席分）も同時に
      // 更新する。
      updateIdentityRoster(gameId),
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
  });
}

function subscribeToGame(gameId) {
  if (broadcastChannel) client.removeChannel(broadcastChannel);
  broadcastChannel = client
    .channel(`game:${gameId}`)
    .on("broadcast", { event: "state_changed" }, ({ payload }) => {
      // ゲート侵攻ボーナスが発生した場合、そのイベントで動いたトークンidを
      // fetchAndHydrate()（＝内部のhydrateState()、ひいてはremote-move-animator.jsの
      // 差分検知）より前にmarkSelfHandledしておく。ゲート侵攻の通知は
      // gate-invasion-modal.js側が専用の中央モーダルで既に案内するため、汎用の差分検知に
      // よる二重の演出・通知（右下トースト等）を防ぐ。fetchAndHydrate()のthen()の後で
      // マークしても、その時点で既にhydrateState()（＝差分検知）は完了してしまっている
      // ため遅い——ここで先にマークする必要がある。
      if (payload?.gateInvasionEvents?.length) {
        const ids = [];
        for (const ev of payload.gateInvasionEvents) {
          ids.push(...(ev.stolenTokenIds ?? []));
          ids.push(...(ev.bumpedCards ?? []).map((b) => b.tokenId));
          ids.push(...(ev.gateCards ?? []).map((g) => g.tokenId));
        }
        markSelfHandled(ids);
      }
      fetchAndHydrate(gameId)
        .then(() => {
          // 盤面の再取得（自分の手札等、隠し情報の解決に必要）が終わってから通知する。
          if (payload?.gateInvasionEvents?.length) {
            for (const fn of gateInvasionEventListeners) fn(payload.gateInvasionEvents);
          }
        })
        .catch(() => {});
    })
    // 名前・アバター・駒スキンの変更は盤面のstate_changedとは別イベントで通知される
    // （updateMyIdentity参照）。ロスターだけ取り直し、notifyListeners()でrender()を
    // 促す（トークン等は変わっていないためfetchAndHydrate()丸ごとは呼ばない）。
    .on("broadcast", { event: "identity_changed" }, () => {
      updateIdentityRoster(gameId)
        .then(() => notifyListeners())
        .catch(() => {});
    })
    .subscribe();
  setOnlineMode(true);
  setOnlineTransport(callAction);
  // fetchAndHydrate()（ネットワーク往復あり）を待たず、この場で即座に再描画を強制する。
  // これが無いと、部屋に参加した直後のわずかな間だけ、まだisOnlineMode()が反映される前の
  // 画面（セットアップウィザード等のローカル専用ボタンがまだ押せる状態）が残ってしまう。
  notifyListeners();
  fetchAndHydrate(gameId).catch(() => {});
}
