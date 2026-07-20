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
  setPriorityTransport,
  hydrateState,
  isOnlineMode,
  notifyListeners,
  applyRemotePriorityPatch,
} from "./state.js";
import { SEAT_ORDER } from "./board-layout.js";
import { markSelfHandled } from "./self-handled-tokens.js";
import { setLastActionInfo } from "./last-action-info.js";
import {
  isTurnTimerEnabled,
  getInitialHourglassStock,
  getMaxHourglassStock,
  getRopeBaseSeconds,
  getRopeExtensionSeconds,
  getTurnsToReplenishHourglass,
  getReducedBaseSeconds,
} from "./admin.js";
import { setLockAreaBarVisible } from "./lock-area-bar.js";
import { setLockColorVisible } from "./lock-color.js";
import { setSoundVolume } from "./sound.js";
import {
  setFlightAnimationDisabled,
  setArrivalEffectDisabled,
  setContinuousGlowDisabled,
} from "./motion-prefs.js";
import { SHORTCUT_TARGETS, setShortcut } from "./player-buttons.js";

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
    const wasLoggedIn = !!cachedUser;
    cachedUser = session?.user ?? null;
    // ログインした瞬間（未ログイン→ログイン済みへの変化）だけ、アカウントに紐づけて
    // 保存しておいた基本設定・ショートカットを読み込んで適用する。
    if (!wasLoggedIn && cachedUser) {
      loadMyPreferences().catch((err) => console.error("loadMyPreferences failed", err));
    }
    for (const fn of authChangeListeners) fn(cachedUser);
  });
}

// --- 基本設定・ショートカットのアカウント永続化 --------------------------------------
// オプションの「基本設定」（ロックエリアバー表示・ロックエリア色表示・効果音の音量・
// アニメーション削減3項目・モーダル表示時間3項目）とショートカットキーを、名前/アバター/
// 駒スキンと同じso7_user_profiles（ユーザーごとに1行の永続プロフィール）に含めて
// アカウントに紐づける。

const PREFERENCE_DURATION_VARS = {
  gate_invasion_modal_duration: "--gate-invasion-modal-step-duration",
  card_arrival_modal_duration: "--card-arrival-modal-duration",
  hand_pickup_toast_duration: "--hand-pickup-toast-duration",
};

// player-identity.js/piece-skins.jsはどちらもこのファイルを直接importしている
// （isOnlineMode/getSelfSeat/getSyncedIdentity/updateMyIdentity）ため、online.js側から
// それらを直接importし返すと循環importになる。setup-animation.js等と同じ「main.jsから
// 実際の適用ロジックを注入してもらう」パターンで回避する。ログイン直後、部屋に入る前でも
// 名前・アバター・駒スキンが「初期化されて見える」（実際にはso7_user_profilesに保存済み
// なのに、部屋に入るまでローカル表示側に反映する経路が無かった）というユーザー報告への
// 対応。
let identityApplierFn = null;
export function registerIdentityApplier(fn) {
  identityApplierFn = fn;
}

// ログイン済みならso7_user_profilesへ{user_id, ...patch, updated_at}をupsertするだけの
// 薄い関数。未ログインの間は何もしない（ローカル/未ログインでの利用を妨げないため）。
export async function saveMyPreference(patch) {
  if (!cachedUser) return;
  const { error } = await client
    .from("so7_user_profiles")
    .upsert({ user_id: cachedUser.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) console.error("saveMyPreference failed", error);
}

// ログイン直後に呼ばれ、保存済みの基本設定・ショートカットを各モジュールへ反映する。
export async function loadMyPreferences() {
  if (!cachedUser) return;
  const { data, error } = await client
    .from("so7_user_profiles")
    .select(
      "lock_area_bar_visible, lock_color_visible, sound_volume, flight_animation_disabled, " +
        "arrival_effect_disabled, continuous_glow_disabled, gate_invasion_modal_duration, " +
        "card_arrival_modal_duration, hand_pickup_toast_duration, shortcuts, " +
        "display_name, avatar, piece_skin_index"
    )
    .eq("user_id", cachedUser.id)
    .maybeSingle();
  if (error) {
    console.error("loadMyPreferences failed", error);
    return;
  }
  if (!data) return; // 初回ログイン等、まだ何も保存していない場合はDBのデフォルト値のまま

  if (typeof data.lock_area_bar_visible === "boolean") setLockAreaBarVisible(data.lock_area_bar_visible);
  if (typeof data.lock_color_visible === "boolean") setLockColorVisible(data.lock_color_visible);
  if (typeof data.sound_volume === "number") setSoundVolume(data.sound_volume);
  if (typeof data.flight_animation_disabled === "boolean") setFlightAnimationDisabled(data.flight_animation_disabled);
  if (typeof data.arrival_effect_disabled === "boolean") setArrivalEffectDisabled(data.arrival_effect_disabled);
  if (typeof data.continuous_glow_disabled === "boolean") {
    setContinuousGlowDisabled(data.continuous_glow_disabled);
    document.body.classList.toggle("reduce-glow", data.continuous_glow_disabled);
  }
  for (const [column, cssVar] of Object.entries(PREFERENCE_DURATION_VARS)) {
    if (typeof data[column] === "number") {
      document.documentElement.style.setProperty(cssVar, String(data[column]));
    }
  }
  if (data.shortcuts && typeof data.shortcuts === "object") {
    for (const { id } of SHORTCUT_TARGETS) {
      setShortcut(id, data.shortcuts[id] ?? null);
    }
  }
  identityApplierFn?.({
    name: data.display_name || null,
    avatar: data.avatar || null,
    pieceSkinIndex: typeof data.piece_skin_index === "number" ? data.piece_skin_index : null,
  });
  window.dispatchEvent(new CustomEvent("admin:change"));
}

// --- 部屋の作成・参加・一覧 ---------------------------------------------------------

// 「ブラウザを閉じて放置」を検知するためのハートビート。参加中（ロビーでも対局中でも）は
// ずっと一定間隔で自分の座席のlast_seenを更新し続ける（leaveGame()が呼ばれるまで停止しない）。
// 更新に失敗しても致命的ではない（一定時間送れなければ、次に誰かがlistOpenRooms()を
// 呼んだ時にso7_cleanup_stale_roomsが片付ける——ロビー中の個別座席の掃除も、対局が
// 全員分放置された場合の部屋ごとの掃除も、しきい値の違いはあれ同じ仕組みで行う）。
const HEARTBEAT_MS = 25000;
let heartbeatIntervalId = null;

function stopHeartbeat() {
  if (heartbeatIntervalId) {
    clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = null;
  }
}

function startHeartbeat(gameId, userId) {
  stopHeartbeat();
  heartbeatIntervalId = setInterval(async () => {
    try {
      await client
        .from("so7_game_seats")
        .update({ last_seen: new Date().toISOString() })
        .eq("game_id", gameId)
        .eq("user_id", userId);
    } catch (err) {
      // 送れなくても致命的ではない（上のコメント参照）。
    }
  }, HEARTBEAT_MS);
}

// 部屋を新規作成し、作成者自身もその部屋に参加する（座席はまだ選ばない/決まらない。
// 「ゲームを開始する」を押した瞬間にso7-apply-action Edge Function側で参加者全員へ
// ランダムに割り振られる）。部屋idの生成・パスワードのハッシュ化はサーバー側の
// so7_create_room（SECURITY DEFINER）が行う——クライアントの入力をそのまま主キーとして
// 信頼しないため、また平文パスワードをテーブルへ直接書かせないため。戻り値はroom id
// （URLの?room=に使う）。
export async function createRoom(name, password) {
  return withLog("部屋の作成", async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("ログインしてください");
    const { data: gameId, error } = await client.rpc("so7_create_room", {
      room_name: name || null,
      room_password: password || null,
    });
    if (error) throw error;
    await joinRoom(gameId, password);
    return gameId;
  });
}

// 部屋に参加する（座席は選ばない。1ユーザーにつき1部屋1行、既に参加済みならUNIQUE制約
// 違反になる）。パスワード照合と座席行の作成をサーバー側のso7_join_room
// （SECURITY DEFINER）に一本化してある——クライアント側だけでパスワードを確認してから
// so7_game_seatsへ直接insertする方式だと、devtools/curlから直接REST APIを叩けば
// パスワードを一切入力せずに参加できてしまう（so7_game_seats_insertポリシー自体は
// user_id=auth.uid()のみのチェックで、パスワードの有無を関知できないため）。
// 永続プロフィール（so7_user_profiles）からの初期値反映もso7_join_room側で行う。
export async function joinRoom(gameId, passwordAttempt) {
  return withLog("部屋に参加", async () => {
    const user = await getCurrentUser();
    if (!user) throw new Error("ログインしてください");

    const { error } = await client.rpc("so7_join_room", {
      p_game_id: gameId,
      p_password_attempt: passwordAttempt ?? null,
    });
    if (error) {
      if (String(error.message ?? "").includes("duplicate key")) {
        throw new Error("既にこの部屋に参加しています");
      }
      if (String(error.message ?? "").includes("invalid_password")) {
        throw new Error("パスワードが違います");
      }
      throw error;
    }
    currentGameId = gameId;
    currentSeat = null; // ゲーム開始時にランダムに割り当てられる
    subscribeToGame(gameId);
    startHeartbeat(gameId, user.id);
  });
}

// 開いている（まだ始まっていない）部屋の一覧。so7_games_listビューはパスワードの
// ハッシュ自体を一切含まず、has_password（真偽値）だけを返す。一覧を取る前に必ず
// so7_cleanup_stale_roomsを呼び、ブラウザを閉じて放置された部屋を掃除してから
// 取得する（定期実行cronジョブ等を使わない、「次に誰かが一覧を見た時に掃除される」方式）。
export async function listOpenRooms() {
  try {
    // supabase-jsの.rpc()は失敗時に例外をthrowするのではなく{error}を返すため、
    // 分割代入で明示的に受け取って確認する必要がある（awaitしただけでは失敗に
    // 気づけない）。
    const { error: cleanupErr } = await client.rpc("so7_cleanup_stale_rooms");
    if (cleanupErr) console.error("so7_cleanup_stale_rooms failed", cleanupErr);
  } catch (err) {
    console.error("so7_cleanup_stale_rooms failed", err);
  }
  const { data, error } = await client.from("so7_games_list").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

// 自分がまだ座席を持ったままの、対局中（status<>'open'）の部屋一覧。誤って「この部屋を
// 離れる」を押した・ブラウザを閉じて放置した等で今画面には出ていないが、so7_leave_room側の
// 変更によりサーバー上には座席がまだ残っている対局を、部屋一覧画面から見つけて再開できる
// ようにするためのもの。so7_game_seats/so7_gamesとも既存のRLS（using(true)）でそのまま
// 読めるため、専用のSECURITY DEFINER関数は不要。
export async function getMyActiveGames() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await client
    .from("so7_game_seats")
    .select("game_id, so7_games(name, status)")
    .eq("user_id", user.id);
  if (error) throw error;
  return (data ?? [])
    .filter((row) => row.so7_games && row.so7_games.status !== "open")
    .map((row) => ({ id: row.game_id, name: row.so7_games.name || "セブンの部屋" }));
}

// 部屋名（ゲーム開始後も含め、部屋にいる間ずっと表示するため）。so7_games_listは
// status='openの部屋しか含まないため、開始後の部屋にも使えるようso7_gamesから直接取る
// （name列自体は秘匿の必要が無い、既存のso7_games_select using(true)のまま読める）。
export async function getRoomName(gameId) {
  const { data, error } = await client.from("so7_games").select("name").eq("id", gameId).maybeSingle();
  if (error) throw error;
  return data?.name || "セブンの部屋";
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

// 「この部屋を離れる」ボタンから呼ぶ。ローカルの後始末を先に済ませてからサーバー側の
// 座席削除を行う（so7_leave_room、SECURITY DEFINER。全員抜けた部屋が一覧に残り続ける
// バグへの対応）——サーバー側呼び出しが失敗しても、アプリ自体の利用は継続できるように
// するため。失敗して座席が残っても、いずれso7_cleanup_stale_roomsが回収する。
export async function leaveGame() {
  const gameIdToLeave = currentGameId;
  stopHeartbeat();
  if (broadcastChannel) {
    client?.removeChannel(broadcastChannel);
    broadcastChannel = null;
  }
  currentGameId = null;
  currentSeat = null;
  setOnlineMode(false);

  if (gameIdToLeave) {
    try {
      const { error } = await client.rpc("so7_leave_room", { p_game_id: gameIdToLeave });
      if (error) console.error("so7_leave_room failed", error);
    } catch (err) {
      console.error("so7_leave_room failed", err);
    }
  }
}

// --- アクション送信（so7-apply-action Edge Function） -------------------------------

async function callAction(action) {
  return withLog(`アクション送信(${action.type})`, async () => {
    if (!currentGameId) throw new Error("部屋に参加していません");
    // 「誰が・何をした結果か」を、この後届くブロードキャストのこだま/直後の
    // fetchAndHydrate()より前に記録しておく（turn-timer.jsのonStateChangeがオンライン中に
    // 「本当に優先権保持者本人の操作か」を判定するのに使う。last-action-info.js参照）。
    setLastActionInfo({ actorSeat: getSelfSeat(), actionType: action.type });
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
export async function startGame(gameId, { includeBlackWhite = false, timerEnabled } = {}) {
  return withLog("ゲーム開始", async () => {
    const count = await getMemberCount(gameId);
    if (count < 2) throw new Error("2人以上揃ってから開始してください");
    // ターンタイマー設定（基本時間・延長時間・初期/最大砂時計数・補充ターン数・有効/無効）は
    // includeBlackWhiteと同じく、開始ボタンを押した本人のその時点の設定を対局全体の固定値
    // として1回だけ送る（プレイヤーごとに異なると不公平になるため、対局中は変更しない）。
    // 有効/無効(enabled)だけは、部屋の状況パネル（online-ui.js）に専用のチェックボックスが
    // あるためそちらの値(timerEnabled)を優先する——管理者モードの奥にあるチェックボックスは
    // 気づかれにくく、オンラインでタイマーが使えないという報告の原因になっていたため。
    // timerEnabledが渡されなかった場合（呼び出し元の想定外の使い方）だけ、admin.jsの
    // ローカル設定にフォールバックする。
    const timerConfig = {
      enabled: timerEnabled !== undefined ? timerEnabled : isTurnTimerEnabled(),
      initialHourglassStock: getInitialHourglassStock(),
      maxHourglassStock: getMaxHourglassStock(),
      ropeBaseSeconds: getRopeBaseSeconds(),
      ropeExtensionSeconds: getRopeExtensionSeconds(),
      turnsToReplenishHourglass: getTurnsToReplenishHourglass(),
      reducedBaseSeconds: getReducedBaseSeconds(),
    };
    return callAction({ type: "BOOTSTRAP_GAME", includeBlackWhite, timerConfig });
  });
}

// ターンタイマー（優先権・砂時計）の状態更新。隠す必要の無い公開情報のため、
// so7-apply-action Edge Functionを経由させず、updateMyIdentity()と同じ「クライアントから
// 直接テーブルへ書き込む」パターンを踏襲する。priority_player/priority_deadline/
// priority_phaseは最後に書いた人が勝つ素朴な上書き（優先権譲渡ボタン自体が「誰でも
// 押せる自己申告制」のため）。hourglassStockだけは座席ごとの差分マージが必要（他座席の
// 値を巻き込んで上書きしないため）で、PostgRESTのUPDATEはSQL式を送れないため専用の
// SECURITY DEFINER関数(so7_merge_hourglass_stock)経由にする。
export async function updatePriorityState(patch) {
  return withLog("優先権状態の更新", async () => {
    if (!currentGameId) return;
    const dbPatch = {};
    if (patch.player !== undefined) dbPatch.priority_player = patch.player;
    if (patch.deadline !== undefined) dbPatch.priority_deadline = patch.deadline;
    if (patch.phase !== undefined) dbPatch.priority_phase = patch.phase;
    if (Object.keys(dbPatch).length > 0) {
      const { error } = await client.from("so7_games").update(dbPatch).eq("id", currentGameId);
      if (error) throw error;
    }
    if (patch.hourglassStock !== undefined) {
      const { error } = await client.rpc("so7_merge_hourglass_stock", {
        p_game_id: currentGameId,
        p_delta: patch.hourglassStock,
      });
      if (error) throw error;
    }
    await client.channel(`game:${currentGameId}`).send({
      type: "broadcast",
      event: "priority_changed",
      payload: { patch },
    });
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
    if (!user) return;
    const patch = {};
    if (name !== undefined) patch.display_name = name;
    if (avatar !== undefined) patch.avatar = avatar;
    if (pieceSkinIndex !== undefined) patch.piece_skin_index = pieceSkinIndex;
    if (Object.keys(patch).length === 0) return;

    // ユーザーごとの永続プロフィールへは、部屋に入っているかどうかに関わらず常に反映する
    // （ゲームをまたいで名前/アバター/駒スキンを覚えておくため）。以前はcurrentGameIdが
    // 無いと関数全体が即returnしていたため、部屋に参加する「前」にアバター等を変更しても
    // 実際にはサーバーへ何も送られていなかった——自分の画面には選択が即座に反映されて
    // 見えるため一見成功しているようだが、その後joinRoom()が最初の座席行を作る時点では
    // 永続プロフィールがまだ空/古いままなので、初期値として拾われず、相手プレイヤーには
    // 反映されない（もう一度部屋の中で選び直すと初めて動く、というユーザー報告の原因）。
    const { error: profileErr } = await client
      .from("so7_user_profiles")
      .upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (profileErr) console.error("so7_user_profiles upsert failed", profileErr);

    if (!currentGameId) return; // 部屋に入っていない間はso7_game_seats側の更新は対象外

    const { error } = await client
      .from("so7_game_seats")
      .update(patch)
      .eq("game_id", currentGameId)
      .eq("user_id", user.id);
    if (error) throw error;

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

    // hydrateState()より前にsyncedTimerConfigを更新する必要がある。hydrateState()は
    // 内部でnotifyListeners()を同期的に呼び、turn-timer.jsのonStateChangeがその場で
    // isTurnTimerEnabled()（synced優先）を参照するため、後から代入すると「ゲーム開始
    // 直後の最初のhydrateではまだsyncedTimerConfigがnullのまま＝ローカルのadmin設定
    // （デフォルトOFF）にフォールバックしてタイマーが初期化されず、次に何か操作して
    // 2回目のhydrateが起きて初めてsyncedTimerConfigが反映され動き出す」というバグが
    // あった（ユーザー報告: 「オンにしたのにゲーム開始後、何かクリックするまでタイマーが
    // 作動しない」）。
    syncedTimerConfig = gameRow.timer_config ?? null;
    hydrateState({
      tokens,
      piles,
      activePlayers: gameRow.active_players ?? [],
      turnPlayer: gameRow.turn_player,
      turnNumber: gameRow.turn_number,
      roundNumber: gameRow.round_number,
      startPlayer: gameRow.start_player,
      priorityPlayer: gameRow.priority_player,
      priorityDeadline: gameRow.priority_deadline,
      priorityPhase: gameRow.priority_phase,
      hourglassStock: gameRow.hourglass_stock ?? {},
    });
  });
}

// ターンタイマー設定（対局開始時に部屋作成者のローカル設定を1回だけ固定したもの）。
// admin.jsの各getterはturn-timer.js側で「オンライン中はこちらを優先」というラップを
// 経由して参照される（admin.js自体はonline.jsをimportしない、循環import回避のため）。
let syncedTimerConfig = null;
export function getSyncedTimerConfig() {
  return syncedTimerConfig;
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
      // 「誰が・何をした結果の変化か」を、この後のhydrateより前に記録しておく
      // （自分自身の操作の「こだま」も他プレイヤーの操作も同じこの経路を通る）。
      if (payload?.actorSeat) {
        setLastActionInfo({ actorSeat: payload.actorSeat, actionType: payload.actionType });
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
    // 優先権状態（ターンタイマー）の変化。隠す必要の無い情報のため、state_changedと違い
    // 再取得はせず、パッチそのものを直接マージする（updatePriorityState参照）。
    .on("broadcast", { event: "priority_changed" }, ({ payload }) => {
      if (payload?.patch) applyRemotePriorityPatch(payload.patch);
    })
    .subscribe();
  setOnlineMode(true);
  setOnlineTransport(callAction);
  setPriorityTransport(updatePriorityState);
  // fetchAndHydrate()（ネットワーク往復あり）を待たず、この場で即座に再描画を強制する。
  // これが無いと、部屋に参加した直後のわずかな間だけ、まだisOnlineMode()が反映される前の
  // 画面（セットアップウィザード等のローカル専用ボタンがまだ押せる状態）が残ってしまう。
  notifyListeners();
  fetchAndHydrate(gameId).catch(() => {});
}
