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
import { setStatsProfileClient } from "./stats-profile.js";
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
// stats-profile.js（マイページ・ランク表示）は依存の無い葉モジュールのため、ここから
// importして直接クライアントを渡す（循環importの心配が無い）。
setStatsProfileClient(client);

// ハマりどころ（重大、実際のユーザー報告で確認）: 上のsignInWithGoogle/
// signInWithMagicLinkの戻り先を常に「素の」URLにする修正だけでは、既に壊れた
// ハッシュ（`##access_token=...#access_token=...`のように複数連結されたもの）が
// 今まさにURLバーに残っているユーザーは救えない（そのURLをそのまま再利用してもう一度
// ログインし直そうとすると、この修正後も結局その場に残った壊れたハッシュがそのまま
// redirectToの元になってしまうケースが起こり得るため）。Supabase自身のハッシュ検出
// 処理（detectSessionInUrl）が一通り終わるのに十分な猶予（2秒、早すぎるとSupabase自身
// の処理より先に消してしまいセッション確立を阻害する）を置いてから、結果の成否に
// 関わらずURLから確実にハッシュを取り除いておく。これにより、既に壊れたURLで開いて
// しまった場合でも、次にログインし直す時には必ずクリーンな状態から始められる。
if (client && typeof window !== "undefined" && window.location.hash.includes("access_token")) {
  setTimeout(() => {
    if (window.location.hash.includes("access_token")) {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, 2000);
}

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

// ハマりどころ（重大、実際のユーザー報告のリダイレクト後URLで確認）: 戻り先に
// window.location.hrefをそのまま使うと、そのURLに既に#access_token=...のような
// ハッシュが残っていた場合（何らかの理由で一度でもSupabase側のハッシュ検出に
// 失敗して消えずに残ったケース）、次のログイン試行のredirectTo/emailRedirectToにも
// その古いハッシュがそのまま乗ってしまう。すると戻ってきた時、Googleから渡された
// 新しいハッシュがその末尾にそのまま連結され、`##access_token=...#access_token=...`
// のような壊れたURLになってしまう（実際に発生を確認）。連結された結果token_typeの
// 値が"bearer#access_token=..."のように壊れ、Supabase側がセッションを確立できなく
// なり、以降何度ログインし直してもこの1点で恒久的に失敗し続けるようになっていた。
// 戻り先には常にハッシュを取り除いた「素の」URLを使うことで、この連鎖を防ぐ。
function cleanRedirectUrl() {
  return window.location.origin + window.location.pathname + window.location.search;
}

export async function signInWithMagicLink(email) {
  return withLog("マジックリンク送信", async () => {
    if (!client) throw new Error("Supabaseクライアントが初期化されていません");
    // Supabase側の「Site URL」は姉妹プロジェクト（戦績管理システム）用のポートに設定されて
    // いるため、明示的に「今開いているこのページ」を戻り先として指定する（ホスト/ポートが
    // 変わっても常に正しく動くように）。ただしこのURLはSupabaseダッシュボード
    // 「Authentication > URL Configuration」のRedirect URLs欄で許可されている必要がある。
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: cleanRedirectUrl() },
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
      options: { redirectTo: cleanRedirectUrl() },
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

// ハマりどころ: sound_volume_opening_bgm列をここ・下のSELECT文に追加してみたところ、
// まだ本番のSupabase側にその列が存在しない間は「1つの列が無いだけでSELECT文全体が
// エラーになり、他の設定（ロックエリア表示・音量・モーダル表示時間等）まで丸ごと
// 読み込めなくなる」という重大な副作用が判明したため、いったん元に戻した。
// supabase_setup_so7.sql末尾のalter tableを実際にSupabase側で実行し終えたら、
// 改めてここと下のSELECT文にsound_volume_opening_bgmを追加する（それまではオプション
// メニューのBGM音量スライダーはそのセッション内だけ有効で、アカウントへの永続化は
// まだ効かない）。
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

// playmat.js/card-back-skins.js/background.jsはどれもsaveMyPreference()を使うために
// このファイルを直接importしているため、online.js側からそれらを直接importし返すと
// player-identity.js/piece-skins.jsと同じ理由で循環importになる。上のidentityApplierFnと
// 同じ「main.jsから実際の適用ロジックを注入してもらう」パターンで、ログイン直後に
// 保存済みのプレイマット/カード裏面/背景画像を反映する。
let appearanceApplierFn = null;
export function registerAppearanceApplier(fn) {
  appearanceApplierFn = fn;
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

// ユーザー要望「駒スキンやプレイマット等のアカウントに紐づく設定を初期化するボタンを
// 設置したい」への対応。options-menu.jsの基本設定から呼ばれる。名前・アバター・駒
// スキン・プレイマット・カード裏面・背景画像を既定値に戻す（ロックエリア表示や
// 音量、アニメーション設定等は対象外——ユーザーの例示（駒スキン・プレイマット）に
// 沿った「見た目・キャラクター設定」だけに絞った）。呼び出し元がこの後ページを
// 再読み込みする想定のため、ここではサーバー側の値を戻すだけで、各モジュールの
// ローカル状態までは触らない（再読み込み時のloadMyPreferences()が正しい既定値を
// 読み直してくれる）。
export async function resetMyAppearanceSettings() {
  if (!cachedUser) return;
  const { error } = await client
    .from("so7_user_profiles")
    .update({
      display_name: null,
      avatar: null,
      piece_skin_index: 0,
      playmat_id: null,
      card_back_set_index: 0,
      background_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", cachedUser.id);
  if (error) throw error;
  // custom_avatar_url列はまだ本番に存在しない環境があり得るため（supabase_setup_so7.sqlの
  // 追加分が未実行）、fetchMyCustomAvatarUrlと同じ理由で別クエリにし、失敗してもこの関数
  // 全体は成功扱いのまま進める。
  try {
    const { error: customAvatarError } = await client
      .from("so7_user_profiles")
      .update({ custom_avatar_url: null })
      .eq("user_id", cachedUser.id);
    if (customAvatarError) throw customAvatarError;
  } catch (err) {
    console.error("custom_avatar_urlのリセットに失敗しました（列が未追加の可能性）", err);
  }
}

// ユーザー要望「アップロードしたアバター画像を、アバター変更時に一覧に出るように
// してほしい」への対応。custom_avatar_url列をloadMyPreferences()の大きなSELECT文には
// 混ぜず、あえて独立したクエリにしてある——過去に「まだ本番のSupabase側に存在しない
// 列を1つでもSELECT文に混ぜると、それだけで文全体がエラーになり他の設定（名前・
// アバター・音量等）まで丸ごと読み込めなくなる」という重大な副作用が判明した経緯が
// あるため（このファイル内の他の箇所のコメント参照）。この列は
// supabase_setup_so7.sqlの追加分をまだ実行していない環境でも、ここだけが
// 失敗して(catchでnullを返す)他の機能に影響しないようにする。
export async function fetchMyCustomAvatarUrl() {
  if (!cachedUser) return null;
  try {
    const { data, error } = await client
      .from("so7_user_profiles")
      .select("custom_avatar_url")
      .eq("user_id", cachedUser.id)
      .maybeSingle();
    if (error) throw error;
    return data?.custom_avatar_url ?? null;
  } catch (err) {
    console.error("fetchMyCustomAvatarUrl failed (未実行のsupabase_setup_so7.sql追加分がある可能性)", err);
    return null;
  }
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
        "display_name, avatar, piece_skin_index, playmat_id, card_back_set_index, background_id"
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
  appearanceApplierFn?.({
    playmatId: data.playmat_id || null,
    cardBackSetIndex: typeof data.card_back_set_index === "number" ? data.card_back_set_index : null,
    backgroundId: data.background_id || null,
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
    subscribeToGame(gameId, { announceJoin: true });
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
  const channelToClose = broadcastChannel;
  stopHeartbeat();
  currentGameId = null;
  currentSeat = null;
  broadcastChannel = null;
  // ハマりどころ: rosterをここでリセットしないと、退室後も直前にいた部屋の
  // メンバー情報（getSyncedIdentity）が残ったままになる。「この部屋を離れる」を
  // 押した後パネルが閉じずに部屋一覧へ戻る（online-ui.js）ようになったことで、
  // isOnlinePanelOpen()がtrueのまま盤面のB/C/D表示判定が続くため、この古い
  // ロスターのせいで既にいない部屋のダミーアバターが残り続けてしまう。
  roster = {};
  setOnlineMode(false);
  notifyListeners();

  if (gameIdToLeave) {
    try {
      const { error } = await client.rpc("so7_leave_room", { p_game_id: gameIdToLeave });
      if (error) console.error("so7_leave_room failed", error);
      else if (channelToClose) {
        // 入室時（joinRoomのannounceJoin）と対称。待機中に自分が抜けたことを、
        // 座席削除が終わった直後・チャンネルを閉じる直前に他メンバーへ伝える
        // （ユーザー要望の「リアルタイムで着席」の裏返しとして、退室時も待機中の
        // 並びがすぐ詰め直されるようにする）。
        channelToClose.send({ type: "broadcast", event: "identity_changed", payload: {} });
      }
    } catch (err) {
      console.error("so7_leave_room failed", err);
    }
  }
  if (channelToClose) client?.removeChannel(channelToClose);
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
// ユーザー要望「（戦績管理システムに）勝利しなくても対戦に参加すれば登録されるように
// してほしい」への対応。以前はvictory.js（勝利した瞬間）からgetOrCreateStatsPlayer()を
// 呼ぶ経路しか無く、対局が最後まで終わらなかった場合は誰も登録されなかった。
// startGame()（＝「ゲームを開始する」を押した本人）から、座席が決まった直後に参加者
// 全員を登録する。この時点ではこのクライアントのローカルroster（updateIdentityRoster
// 経由、state_changed Broadcastを待って初めて更新される）がまだ最新とは限らないため、
// so7_game_seatsを直接読み直して確実な座席一覧を得る。失敗してもゲーム開始自体は
// 継続できるよう、呼び出し元ではawaitしない（fire and forget）。
async function registerParticipantsAsStatsPlayers(gameId) {
  const { data: seatRows, error } = await client
    .from("so7_game_seats")
    .select("user_id, display_name, avatar")
    .eq("game_id", gameId);
  if (error) {
    console.error("registerParticipantsAsStatsPlayers failed", error);
    return;
  }
  for (const row of seatRows ?? []) {
    if (!row.user_id) continue;
    try {
      const avatarUrl = row.avatar ? new URL(row.avatar, window.location.href).href : null;
      await getOrCreateStatsPlayer(row.user_id, row.display_name, avatarUrl);
    } catch (err) {
      console.error("getOrCreateStatsPlayer failed (game start registration)", err);
    }
  }
}

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
    const result = await callAction({ type: "BOOTSTRAP_GAME", includeBlackWhite, timerConfig });
    registerParticipantsAsStatsPlayers(gameId).catch((err) =>
      console.error("registerParticipantsAsStatsPlayers failed", err)
    );
    return result;
  });
}

// --- 「もう一度遊ぶ」（ユーザー要望） -----------------------------------------------
// 対局終了後、まだこの部屋にいる（last_seenが新しい）全員が「もう一度遊ぶ」を押した
// 時点で、誰かのクライアントが自動でstartGame()を呼んで再開する。BOOTSTRAP_GAMEは
// 呼ばれた時点でso7_game_seatsに残っている座席だけで座席を割り振り直す既存の仕組みが
// あるため、「続けたくない人は部屋を抜ける、残った人がもう一度遊ぶを押せばその人数で
// 再開」という形が自然に実現できる（supabase_setup_so7.sqlのrematch_ready参照）。

// ハートビート間隔(HEARTBEAT_MS=25秒)より十分長い猶予を持たせた「まだこの部屋に
// いる」判定のしきい値。これより古いlast_seenの座席は「既にブラウザを閉じた」と
// みなし、全員揃うのを待つ対象から除外する。
const REMATCH_FRESH_MS = 70000;

export async function setRematchReady(ready) {
  if (!currentGameId || !currentSeat) return;
  const { error } = await client
    .from("so7_game_seats")
    .update({ rematch_ready: ready })
    .eq("game_id", currentGameId)
    .eq("seat", currentSeat);
  if (error) throw error;
}

// 今この部屋にいる座席のうち、まだ生きている（last_seenが新しい）ものだけを対象に、
// 全員がrematch_ready=trueかどうかを調べる。1人だけ（全員抜けた等）ならまだ再開しない。
async function checkRematchReadiness(gameId) {
  const { data, error } = await client.from("so7_game_seats").select("seat, rematch_ready, last_seen").eq("game_id", gameId);
  if (error) throw error;
  const now = Date.now();
  const freshSeats = (data ?? []).filter((s) => s.seat && now - new Date(s.last_seen).getTime() < REMATCH_FRESH_MS);
  const allReady = freshSeats.length >= 2 && freshSeats.every((s) => s.rematch_ready);
  return { allReady, freshSeats };
}

// post-game-panel.jsが「もう一度遊ぶ」待ち中に定期的に呼ぶ。全員揃っていれば
// startGame()を呼んで実際に再開する（複数クライアントが同時に「揃った」と気づいて
// 二重にBOOTSTRAP_GAMEを呼ばないよう、fresh+ready座席の中でアルファベット順最初の
// 座席のクライアントだけが実行する決定的なタイブレークにしてある）。戻り値は
// 「このクライアントが再開を実行したか」（呼び出し元が待機UIを閉じる判断に使う
// 必要は無い——実際に再開したかどうかはgetState()の変化で全クライアントが検知する）。
export async function maybeTriggerRematch(gameId) {
  const { allReady, freshSeats } = await checkRematchReadiness(gameId);
  if (!allReady) return false;
  const triggerSeat = freshSeats.map((s) => s.seat).sort()[0];
  if (getSelfSeat() !== triggerSeat) return false;
  await startGame(gameId);
  return true;
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
    // identity_changedと同じ、既にsubscribeToGame()で購読済みのbroadcastChannelを再利用する
    // （以前はここで毎回client.channel(...)を新規に呼んでいたため、購読側と送信側が別々の
    // チャンネルインスタンスになっており、下記のself:true設定が実際には効いていなかった
    // ——押した本人の画面で優先権譲渡ボタンを押しても自分の基本時間タイマーが止まらない、
    // というユーザー報告バグの根本原因）。
    if (broadcastChannel) {
      await broadcastChannel.send({ type: "broadcast", event: "priority_changed", payload: { patch } });
    }
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

// 部屋の参加人数（座席の有無に関わらず）が変わった可能性がある瞬間（updateIdentityRoster
// が呼ばれるたび）に通知する。online-ui.jsの部屋パネルが、開いている間だけ待機人数・
// 待機中アバターの表示をその場で最新化するために使う（notifyListeners()は盤面の駒移動
// 等でも毎回呼ばれてしまうため、それとは別に「ロスターが変わったかもしれない」専用の
// 通知にした）。
const rosterChangeListeners = [];
export function onRosterChange(fn) {
  rosterChangeListeners.push(fn);
  return () => {
    const i = rosterChangeListeners.indexOf(fn);
    if (i >= 0) rosterChangeListeners.splice(i, 1);
  };
}

// --- 戦績管理システムとの連携（Phase 1: 対戦結果の自動登録） -------------------------
// 姉妹プロジェクト「7 SHADES OF S:EVEN 戦績管理システム」と全く同じSupabase
// プロジェクトを共有しているため、そちらのplayers/matchesテーブルへ直接
// insertする（supabase_setup_stats_integration.sql参照。players.user_id・
// matches.sourceの2列だけ例外的に追加してもらった）。プレイヤー行自体の登録
// （getOrCreateStatsPlayer）はstartGame()（対局参加時）とvictory.js（勝利した瞬間）の
// 両方から呼ばれる——ユーザー要望「勝利しなくても対戦に参加すれば登録されるように
// してほしい」への対応で対局開始時にも呼ぶようにした。対戦記録自体(matches行)の
// 登録はこれまで通りvictory.js経由のsubmitStatsMatchResult()からだけ。

// requestStatsPlayerLink()で申請中（まだ管理者が承認していない）のuser_id連携先が
// あれば、そのプレイヤーのidを返す。ハマりどころ（重大、ユーザー報告で発覚）:
// 「連携申請→承認前に勝利→新規プレイヤーとして自動登録（承認待ち）」という順で
// 進んだ後、管理者が「編集承認待ち」（連携申請）と「登録承認待ち」（自動登録された
// 重複）の両方を承認してしまうと、同一人物なのに別々の2行が両方approvedのまま
// 恒久的に残ってしまう。根本原因は「重複が承認待ちとして登録されること」自体では
// なく、そもそも連携申請中は重複を作らずに済ませられるはずなのにgetOrCreateStatsPlayer()
// がそれを考慮していなかったこと。ここで先に確認することで、重複の発生自体を防ぐ。
async function findPendingLinkedPlayerId(userId) {
  const { data, error } = await client.from("players").select("id").eq("edit_pending->>userId", userId).limit(1);
  if (error) throw error;
  return data?.[0]?.id ?? null;
}

// 認証済みユーザー(userId)に対応する戦績プレイヤー行のidを取得、無ければ作成する。
// 一度リンクしたら以降は同じ行を使い続ける（ユーザー要望「Googleアカウント等で
// 既に登録済みとわかれば新たに登録は行わない」への対応）。
// ユーザー要望「再戦時にプレイヤー名を変更していれば戦績システムの方も変更される
// ようにしたい。またその時のアバターも登録されるようにしたい」への対応として、
// 既存行が見つかった場合も名前・アバターを対戦のたびに現在値へ同期する
// （変わっていなければ実質no-op）。
async function getOrCreateStatsPlayer(userId, displayName, avatarUrl) {
  const { data: existing, error: selectError } = await client
    .from("players")
    .select("id, name, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) throw selectError;

  if (existing) {
    const patch = {};
    if (displayName && displayName !== existing.name) patch.name = displayName;
    if (avatarUrl && avatarUrl !== existing.avatar_url) patch.avatar_url = avatarUrl;
    if (Object.keys(patch).length > 0) {
      const { error: updateError } = await client.from("players").update(patch).eq("id", existing.id);
      if (updateError) throw updateError;
    }
    return existing.id;
  }

  // user_idでの直接リンクはまだ無いが、連携申請（edit_pending）が承認待ちの相手が
  // いればそちらを使う（新規重複を作らない）。この行自体はまだ承認前なので、
  // name/avatar_urlを直接書き換えたりはしない（承認フローを迂回することになるため）。
  const pendingLinkedId = await findPendingLinkedPlayerId(userId);
  if (pendingLinkedId) return pendingLinkedId;

  // 戦績管理システムのplayers.idはtext主キーでDB側のデフォルト値が無く、姉妹プロジェクト
  // 自身（index.html）もクライアント側で"p_"+Date.now()という形のidを生成してから
  // insertしている（DBに生成を任せていない）。ここで単に{user_id,name,status}だけを
  // insertするとid列がnullのままnot null制約違反になる（ユーザー報告で確認した実際の
  // エラー: 23502 null value in column "id"）ため、同じ命名規則でidを生成して渡す。
  // ユーザー要望「(アカウント連携前に対戦してしまい)既存プレイヤーではなく新規の
  // 重複プレイヤーが自動登録されてしまう場合、承認前プレイヤーとして登録できるように
  // したい。それ以外は承認済みプレイヤーと同一に扱ってよい」への対応。姉妹プロジェクト
  // 自身の「プレイヤー登録申請」も既定でstatus='pending'（承認待ち）になる仕組みが
  // 既にあり、管理者コンソールの「承認待ちのプレイヤー登録申請」欄にそのまま表示・
  // 承認/却下できる。自動登録もこの既存の仕組みに素直に乗せる（以前は'approved'で
  // 即時反映していたが、無審査でプレイヤーが増え続けるのは望ましくないため変更した）。
  const { data: created, error: insertError } = await client
    .from("players")
    .insert({
      id: `p_${Date.now()}`,
      user_id: userId,
      name: displayName || "プレイヤー",
      avatar_url: avatarUrl || "",
      status: "pending",
    })
    .select("id")
    .single();
  if (insertError) throw insertError;
  return created.id;
}

// ユーザー要望「アバターやプレイヤー名を変更した時、戦績システムにも反映できるように、
// マイページに戦績システムと同期するためのボタンを追加してほしい」への対応。
// getOrCreateStatsPlayer()自体は既にstartGame()（対局開始時）・victory.js（勝利時）
// から呼ばれ、名前・アバターが変わっていれば同期する仕組みを持っているが、それは
// 「次に対局するまで」待たないと反映されない。マイページから任意のタイミングで
// 手動同期できるようにする。
// ハマりどころ: 呼び出し元（my-page.js）はplayer-identity.jsのgetPlayerName/
// getPlayerAvatar()で「今まさに表示されている実効値」を持っているが、online.js側で
// player-identity.jsを直接importすると循環import（player-identity.js→online.js）に
// なるため、ここでは呼び出し元に計算してもらった値を引数で受け取るだけにする。
export async function syncMyStatsProfile(displayName, avatarPath) {
  if (!cachedUser) throw new Error("ログインしていません");
  const avatarUrl = avatarPath ? new URL(avatarPath, window.location.href).href : null;
  await getOrCreateStatsPlayer(cachedUser.id, displayName, avatarUrl);
}

// ユーザー要望「戦績管理システムにすでに登録済みで、でもデジタル版を初めてやる人の
// ために、戦績管理システムのプレイヤー登録をアカウントに紐づける設定を設けたい」
// への対応（options-menu.jsの基本設定から呼ばれる）。
//
// 選択肢に出す一覧は「まだどのアカウントとも紐づいていない、承認済みのプレイヤー」
// のみに絞る（user_id is null かつ status='approved'）。既に誰かと紐づいている
// プレイヤーを選べてしまうと紐づけの奪い合いになるため。
export async function listUnlinkedStatsPlayers() {
  const { data, error } = await client
    .from("players")
    .select("id, name, avatar_url")
    .is("user_id", null)
    .eq("status", "approved")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

// 選んだプレイヤーへの紐づけを申請する。ユーザー要望「このプレイヤー引継ぎは戦績
// 管理システムのプレイヤー編集承認待ちに行く」——実際にuser_id列を書き換えるのでは
// なく、姉妹プロジェクトの既存の「プロフィール編集承認」の仕組み（players.edit_pending、
// 管理者コンソールの「承認待ちのプロフィール編集申請」欄）に相乗りする形で申請する。
// edit_pendingの形は姉妹プロジェクト（index.htmlのsavePlayerEdit）が使っている
// {name, discordId, avatar}と同じ形に、新しく userId を足しただけにしてある
// （name/discordId/avatarは元の値のまま持たせる＝「名前やアバターは変えない、
// アカウント紐づけだけ申請する」という意味になる。姉妹プロジェクト側の表示・
// 承認処理は元々この3項目が必ず入っている前提で書かれているため、あえて空にしない）。
// 承認されればapprovePlayerEdit()がuser_id列へ書き込む（index.html側を対応済み）。
//
// ゲーム内のアバター・名前は、承認を待たずこの場で選んだプレイヤーのものへ即座に
// 変更する（ユーザー要望「そうするとゲーム内のアバターと名前がそれになる」）。
export async function requestStatsPlayerLink(playerId) {
  const user = await getCurrentUser();
  if (!user) throw new Error("not logged in");
  const { data: player, error: selectError } = await client
    .from("players")
    .select("id, name, discord_id, avatar_url")
    .eq("id", playerId)
    .maybeSingle();
  if (selectError) throw selectError;
  if (!player) throw new Error("player not found");

  const { error: updateError } = await client
    .from("players")
    .update({
      edit_pending: {
        name: player.name,
        discordId: player.discord_id ?? "",
        avatar: player.avatar_url ?? "",
        userId: user.id,
      },
    })
    .eq("id", playerId);
  if (updateError) throw updateError;

  await updateMyIdentity({ name: player.name, avatar: player.avatar_url || undefined });
  return player;
}

// victory-summary-image.jsのgenerateVictorySummaryCanvasは、piece-skins.js/
// player-identity.js経由でonline.js自身を参照する（getSelfSeat等）ため、online.js側から
// 直接importすると循環importになる。setup-animation.js/remote-move-animator.js等と同じ
// 「main.jsから注入してもらう」既存パターンで回避する。
let generateVictorySummaryCanvasFn = null;
export function registerVictorySummaryHelper(fn) {
  generateVictorySummaryCanvasFn = fn;
}

// 勝利の瞬間の対戦記録の「証拠画像」を生成し、戦績管理システムと共有している
// Supabase Storageの`match-proofs`バケット（姉妹プロジェクトが証拠画像アップロードに
// 使っているのと同じバケット）へアップロードして公開URLを返す。
//
// 当初はhtml2canvas系ライブラリで実際の盤面(#scene)をそのまま撮影していたが、
// この盤面はpreserve-3d + perspectiveの3D合成やcolor-mix()を多用しており、
// html2canvasでは色・カード柄がまともに再現できなかった（ユーザー報告で複数回確認）。
// 3D合成を撮影の瞬間だけ無効化する案（body.diagnostic-flatten-3d、元々は
// タブレット点滅の原因切り分け用の管理者トグル）も試したが、html2canvas自体が
// 無限にハングする致命的な副作用があったため断念した。そこで方針を変え、DOM解析
// ライブラリを一切使わず、victory-summary-image.jsでCanvas 2D APIへ直接
// 「盤面49マスの状態・各プレイヤーのロックエリア（7色）・各プレイヤーの手札」を
// 描画したサマリー画像を自作することにした。失敗しても対戦記録自体の登録は
// 止めたくないため、ここで発生した例外は呼び出し元へ伝播させずnullを返すだけにする。
// 一時的な調査用ログ（[stats-debug]）: 「証拠画像が登録されなかった」報告の原因特定用。
// このコード自体が複数箇所で「失敗しても対戦記録の登録は止めない」ためにnullを黙って
// 返す設計になっており、以前のエラーログ（upload failed等）が今回は出ていなかった
// ことから、どの分岐で止まったのかログが無いと切り分けできない。原因が分かり次第
// このログ群は削除する。
async function captureVictoryScreenshot(gameId, { activePlayers, winnerSeat }) {
  try {
    if (!generateVictorySummaryCanvasFn) {
      console.warn("[stats-debug] captureVictoryScreenshot: generateVictorySummaryCanvasFnが未登録");
      return null;
    }
    const canvas = await generateVictorySummaryCanvasFn({ activePlayers, winnerSeat });
    console.log("[stats-debug] canvas生成完了", canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
      console.warn("[stats-debug] captureVictoryScreenshot: canvas.toBlobがnullを返した");
      return null;
    }
    console.log("[stats-debug] blob生成完了", blob.size, "bytes");
    const path = `digital-${gameId}-${Date.now()}.png`;
    const { error: uploadError } = await client.storage.from("match-proofs").upload(path, blob, {
      contentType: "image/png",
    });
    if (uploadError) {
      console.error("captureVictoryScreenshot upload failed", uploadError);
      return null;
    }
    console.log("[stats-debug] Storageアップロード成功", path);
    const { data } = client.storage.from("match-proofs").getPublicUrl(path);
    console.log("[stats-debug] publicUrl", data?.publicUrl);
    return data?.publicUrl ?? null;
  } catch (err) {
    console.error("captureVictoryScreenshot failed", err);
    return null;
  }
}

// ユーザー要望「アバター画像を自分でアップロードできるようにしたい。画像はWebPに
// 変換してからサーバーに保存する」への対応。専用のSupabase Storageバケット
// "avatars"（supabase_setup_avatars.sql参照、要ダッシュボード/SQLでの事前セットアップ）
// へ、{user_id}.webpという固定パスで保存する（アップロードのたびに上書き、履歴は
// 残さない——同じ人が何度も試しても際限なく増えないようにするため）。実際のファイル
// 読み込み・正方形クロップ・WebP変換はavatar-upload.js側（ブラウザのCanvas API）で
// 行い、ここでは既にWebP化されたBlobを受け取ってアップロードするだけにする。
export async function uploadAvatarImage(blob) {
  return withLog("アバター画像のアップロード", async () => {
    if (!client) throw new Error("Supabaseクライアントが初期化されていません");
    const user = await getCurrentUser();
    if (!user) throw new Error("ログインしてください");
    const path = `${user.id}.webp`;
    const { error: uploadError } = await client.storage.from("avatars").upload(path, blob, {
      contentType: "image/webp",
      upsert: true,
    });
    if (uploadError) throw uploadError;
    const { data } = client.storage.from("avatars").getPublicUrl(path);
    if (!data?.publicUrl) throw new Error("画像URLの取得に失敗しました");
    // 上書きアップロードのたびに同じURLになるため、ブラウザ/CDNのキャッシュにより
    // 古い画像のまま見えてしまうことがある。末尾にタイムスタンプを付け、毎回別の
    // URLとして扱われるようにする（画像自体はサーバー上で1枚に保たれたまま）。
    const urlWithCacheBuster = `${data.publicUrl}?v=${Date.now()}`;
    // ユーザー要望「アップロードしたらアバター変更時に一覧に出るようにしてほしい」への
    // 対応。現在選んでいるavatar（他プレイヤーにも見える）とは別に、アップロードした
    // 画像そのものをcustom_avatar_urlへ保存しておく（列が無ければsaveMyPreference側で
    // エラーがログに出るだけで、アップロード自体は成功扱いのまま進める）。
    saveMyPreference({ custom_avatar_url: urlWithCacheBuster }).catch((err) =>
      console.error("custom_avatar_urlの保存に失敗しました", err)
    );
    return urlWithCacheBuster;
  });
}

// オンライン対戦が勝利で終わった瞬間、victory.jsから（勝者本人の画面からだけ、
// 二重登録防止のため）呼ばれる。参加した座席全員を戦績システムのプレイヤーとして
// 解決（未登録なら自動登録）し、対戦記録を1件登録する。ユーザー要望により、
// 手動登録と同じく「証拠画像（勝利時の盤面スクリーンショット）を添えて、
// 承認待ち(pending)として登録する」形にした（当初は証拠画像無し・承認不要の
// 即時反映だったが、戦績管理システム本来の不正防止の仕組みをそのまま活かしたい
// とのことで変更した）。
// feedbackはユーザー要望「ゲーム終了時に戦績システムにゲームのコメントを記入する
// 記入欄を出現させる（パス可能）」への対応。post-game-panel.jsが、証拠画像の生成・
// アップロードとは独立して、勝者の入力（または空文字＝パス）を待ってから渡す
// （待つ間、証拠画像自体は先行して生成できる処理なので、ここではawaitせず
// 呼び出し元に委ねる設計にはせず、単純にfeedbackが決まってから呼んでもらう形にした
// ——同時に2回submitStatsMatchResultが走ることは無い前提のため、シンプルさを優先）。
export async function submitStatsMatchResult({ activePlayers, winnerSeat, feedback }) {
  if (!client || !currentGameId) return;
  const { data: gameRow, error: gameError } = await client
    .from("so7_games")
    .select("created_at")
    .eq("id", currentGameId)
    .maybeSingle();
  if (gameError) throw gameError;
  if (!gameRow) return;

  const memberIds = [];
  let winnerId = null;
  for (const seat of activePlayers) {
    const identity = getSyncedIdentity(seat);
    if (!identity?.userId) continue; // 座席にログインユーザーが紐づいていない（通常は起こらない）
    // identity.avatarは、Googleアカウントのアバターなら既に絶対URL、ローカルの
    // アバター選択肢（player-identity.jsのAVATAR_OPTIONS）なら"assets/avatars/..."という
    // このアプリ自身から見た相対パスのどちらかが入っている。戦績管理システムは別ドメイン/
    // パスで動いているため、相対パスのままだとその側の起点で解決されて壊れる
    // （実在しない画像になる）。new URL()で常に絶対URLへ変換してから渡す
    // （既に絶対URLの場合はそのまま維持される）。
    const avatarUrl = identity.avatar ? new URL(identity.avatar, window.location.href).href : null;
    const playerId = await getOrCreateStatsPlayer(identity.userId, identity.name, avatarUrl);
    memberIds.push(playerId);
    if (seat === winnerSeat) winnerId = playerId;
  }
  if (memberIds.length === 0 || !winnerId) return;

  const durationMinutes = Math.max(1, Math.round((Date.now() - new Date(gameRow.created_at).getTime()) / 60000));
  // 以前はDOMを実際にスクリーンショットしていたため、最後のロックの視覚的な演出
  // （飛翔・到達バースト・ロックスタンプ、合計2.5秒前後）が終わるまで待つ必要があった。
  // 今はgetState()のtokensから直接描画するCanvas生成（victory-summary-image.js）に
  // 切り替えたため、状態自体は承認完了時点で既に確定しており待つ必要が無い。
  const proofImageUrl = await captureVictoryScreenshot(currentGameId, { activePlayers, winnerSeat });

  // players同様、matches.idもtext主キーでDB側のデフォルトが無く、created_atもbigint
  // （姉妹プロジェクトはDate.now()のミリ秒エポックをそのまま入れている、timestamptzでは
  // ない）。姉妹プロジェクト（index.html）と同じ命名規則・形式で明示的に渡す。
  const { error: matchError } = await client.from("matches").insert({
    id: `m_${Date.now()}`,
    date: new Date().toISOString().slice(0, 10),
    members: memberIds,
    winner_id: winnerId,
    duration_minutes: durationMinutes,
    proof_image_url: proofImageUrl,
    created_at: Date.now(),
    status: "pending",
    source: "digital",
    feedback: feedback || "",
  });
  if (matchError) throw matchError;
}

// ユーザー要望「オンラインで部屋を作ったら、入室してきた相手がCBDの順に（＝2人だけなら
// 対面のCに）リアルタイムで着席していくようにしたい」への対応。本当の対局用の座席は
// 引き続きゲーム開始時（so7-apply-action Edge FunctionのBOOTSTRAP_GAME）にランダムで
// 決まる（このマッピングとは無関係）が、それより前の待機中は誰にも座席(seat列)が
// 割り当てられていないため、盤面周囲のアバター表示（buildPlayerZone、player-identity.js
// 経由でこのrosterを参照する）が空のままだった。ここでは「本当の座席がまだ無い間だけ」、
// 入室時刻(joined_at)順に仮の座席を割り当てて見た目上だけ着席させる。自分自身は含めない
// （自分の名前・アバターは常にローカルの値がそのまま使われるため、rosterに乗せる必要が
// 無い）。C（自分の対面）→B（左）→D（右）の順で埋める。
const PREVIEW_SEAT_ORDER = ["C", "B", "D"];

async function updateIdentityRoster(gameId) {
  const { data: seatRows, error } = await client
    .from("so7_game_seats")
    .select("seat, user_id, display_name, avatar, piece_skin_index, joined_at")
    .eq("game_id", gameId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  const nextRoster = {};
  const unseatedOthers = [];
  for (const r of seatRows ?? []) {
    if (r.seat) {
      nextRoster[r.seat] = {
        name: r.display_name || null,
        avatar: r.avatar || null,
        pieceSkinIndex: r.piece_skin_index ?? 0,
        userId: r.user_id,
      };
      if (cachedUser && r.user_id === cachedUser.id) currentSeat = r.seat;
    } else if (!cachedUser || r.user_id !== cachedUser.id) {
      unseatedOthers.push(r);
    }
  }
  unseatedOthers.forEach((r, i) => {
    const previewSeat = PREVIEW_SEAT_ORDER[i];
    if (!previewSeat || nextRoster[previewSeat]) return; // 既に本座席が決まっている枠は上書きしない
    nextRoster[previewSeat] = {
      name: r.display_name || null,
      avatar: r.avatar || null,
      pieceSkinIndex: r.piece_skin_index ?? 0,
      userId: r.user_id,
    };
  });
  roster = nextRoster;
  for (const fn of rosterChangeListeners) fn();
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
          : r.zone === "publicDraw"
          ? { zone: "publicDraw", player: r.hand_player }
          : { zone: "hand", player: r.hand_player };
      const token = { id: r.token_id, kind: r.kind, location };
      if (r.kind === "card") {
        token.cardId = r.card_id; // 見えない場合はnull（buildFlatCard等はcardId未確定の描画に
        // 対応していないため、この最小構成では「隠れているカードの見た目」の描画は
        // 次回以降の課題として明記する）。
        token.faceUp = r.face_up;
        if (r.reveal_source) token.revealSource = r.reveal_source;
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
      // ハマりどころ（ユーザー報告「オンラインで最後のロックの承認拒否モーダルが出ない」）:
      // supabase_setup_so7.sqlのso7_apply_and_commitはpending_final_lockカラムを正しく
      // 読み書きしているが、ここのhydrateState()に渡すオブジェクトにこのフィールドが
      // 抜けていたため、fetchAndHydrate()が呼ばれるたび（自分の操作直後・他プレイヤーの
      // state_changed Broadcast受信時のいずれも）にstate.pendingFinalLockがundefinedへ
      // 上書きされ、final-lock-approval.jsのバナーが常に非表示扱いになっていた。
      pendingFinalLock: gameRow.pending_final_lock ?? null,
      // 接触の承認待ち（ユーザー要望「接触を無効にする効果のカードがあるので承認/拒否
      // モーダルを出す」）。pendingFinalLockと全く同じ理由でここに含める必要がある——
      // hydrateState()はstateを丸ごと置き換えるため、ここで渡し忘れるとfetchAndHydrate()の
      // たびにstate.pendingContactがundefinedへ上書きされ、承認モーダルが常に非表示に
      // なってしまう。
      pendingContact: gameRow.pending_contact ?? null,
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

function subscribeToGame(gameId, { announceJoin = false } = {}) {
  if (broadcastChannel) client.removeChannel(broadcastChannel);
  // config.broadcast.self:trueが無いと、Supabase Realtimeのデフォルト（自分が送信した
  // broadcastは自分自身には配信されない）のせいで、identity_changed/priority_changedを
  // 送信した本人のクライアントだけがその場で反映されず、他プレイヤーの操作を待つまで
  // 自分の変更が自分の画面に見えない、という不具合の温床になっていた
  // （優先権譲渡ボタンを押しても自分の基本時間タイマーが止まらない、というユーザー報告の
  // 根本原因の一つ）。state_changedはEdge Function側から送られる別経路のため影響しない。
  broadcastChannel = client
    .channel(`game:${gameId}`, { config: { broadcast: { self: true } } })
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
    .subscribe((status) => {
      // ユーザー要望「部屋に入ってきたら、待機中の他メンバーにもリアルタイムで（＝
      // 相手側が何か操作するのを待たずに）伝わってほしい」への対応。channel購読が
      // 実際に確立してから送らないと、.subscribe()呼び出し直後はまだサーバー側の
      // ハンドシェイクが終わっておらず、送信したbroadcastが届かないことがあるため
      // （SUBSCRIBEDコールバックを待つのが公式に推奨される送信タイミング）。
      if (status === "SUBSCRIBED" && announceJoin) {
        broadcastChannel.send({ type: "broadcast", event: "identity_changed", payload: {} });
      }
    });
  setOnlineMode(true);
  setOnlineTransport(callAction);
  setPriorityTransport(updatePriorityState);
  // fetchAndHydrate()（ネットワーク往復あり）を待たず、この場で即座に再描画を強制する。
  // これが無いと、部屋に参加した直後のわずかな間だけ、まだisOnlineMode()が反映される前の
  // 画面（セットアップウィザード等のローカル専用ボタンがまだ押せる状態）が残ってしまう。
  notifyListeners();
  fetchAndHydrate(gameId).catch(() => {});
}
