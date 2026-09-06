// ランク戦「対戦相手を募集中の人が現れたら知らせる」通知（続き162）。docs/ranked-spec.md。
// プレイ人口が少ない間のコールドスタート対策の軽量版：アプリを開いている人向けに、待機
// プレイヤーが現れたらタブ点滅＋音＋バナーで知らせる（閉じていても届くプッシュ通知は次フェーズ）。
// 設定はこの端末に保存（localStorage）: 有効/無効・通知OK時間帯（開始/終了の「時」）。
//
// 挙動: 有効かつログイン中かつ「対局中でない」時、約20秒ごとに so7_ranked_poll（pollRanked）で
// 待機人数を見る。自分がキュー/対局中の時は通知しない（自分の待機画面が別途知らせる）。
// 待機人数が 0→1以上 に変わった瞬間（＝相手が現れた）に、時間帯内かつクールダウン外なら通知する。

import { pollRanked, getCurrentUser, isOnlineMode } from "./online.js";
import { playSound } from "./sound.js";
import {
  ensureNotifyPermission,
  showBrowserNotification,
  startFaviconAlert,
  stopFaviconAlert,
} from "./browser-notify.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13
import { registerSyncedPref } from "./pref-registry.js";

const KEY_ENABLED = "so7-ranked-notify-enabled";
const KEY_START = "so7-ranked-notify-start";
const KEY_END = "so7-ranked-notify-end";
const POLL_MS = 20000;
const COOLDOWN_MS = 5 * 60 * 1000; // 連続通知の抑制（5分）
const FLASH_MS = 25000; // タブ点滅の最長時間

let enabled = false;
let winStart = 9; // 通知OK時間帯の開始（時、0-23）
let winEnd = 23; // 通知OK時間帯の終了（時、0-23）
try {
  enabled = localStorage.getItem(KEY_ENABLED) === "1";
  const s = parseInt(localStorage.getItem(KEY_START), 10);
  const e = parseInt(localStorage.getItem(KEY_END), 10);
  if (Number.isInteger(s) && s >= 0 && s <= 23) winStart = s;
  if (Number.isInteger(e) && e >= 0 && e <= 23) winEnd = e;
} catch {
  /* 読めなければ既定（無効・9〜23時） */
}

export function isRankedNotifyEnabled() {
  return enabled;
}
export function getRankedNotifyWindow() {
  return { start: winStart, end: winEnd };
}
export function setRankedNotifyEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(KEY_ENABLED, enabled ? "1" : "0");
  } catch {}
  if (enabled) {
    // ユーザー操作（設定をONにした）の文脈で、別タブ/別アプリにいても届くブラウザ通知の許可を取っておく。
    void ensureNotifyPermission();
    startPoller();
  } else stopPoller();
}
export function setRankedNotifyWindow(start, end) {
  if (Number.isInteger(start) && start >= 0 && start <= 23) winStart = start;
  if (Number.isInteger(end) && end >= 0 && end <= 23) winEnd = end;
  try {
    localStorage.setItem(KEY_START, String(winStart));
    localStorage.setItem(KEY_END, String(winEnd));
  } catch {}
}

function withinWindow() {
  const h = new Date().getHours();
  if (winStart === winEnd) return true; // 開始＝終了＝終日OK
  if (winStart < winEnd) return h >= winStart && h < winEnd;
  return h >= winStart || h < winEnd; // 日をまたぐ時間帯（例 22時→翌6時）
}

let pollTimer = null;
let prevWaiting = 0;
let lastNotifyAt = 0;

async function tick() {
  if (!enabled) return;
  if (isOnlineMode()) return; // 対局中は対象外（自分が遊んでいる）
  const user = await getCurrentUser();
  if (!user) return;
  let res;
  try {
    res = await pollRanked();
  } catch {
    return;
  }
  if (!res) return;
  const count = res.waiting_count || 0;
  const iAmQueued = res.state && res.state !== "none"; // 自分がキュー/対局中は通知しない
  if (
    !iAmQueued &&
    prevWaiting < 1 &&
    count >= 1 &&
    withinWindow() &&
    Date.now() - lastNotifyAt > COOLDOWN_MS &&
    // 【#295】ここでもう一度確かめるのが要点。関数の先頭で isOnlineMode() を見てから、
    // getCurrentUser() と pollRanked() の2回の通信（数秒かかることがある）を挟んでいるので、
    // その間に対局が始まっていることがある。「先頭で確かめたから大丈夫」は、間に待ち時間が
    // 1msでもあれば破れる（続き437の総点検と同じ形）。出す直前の事実で判定する。
    !isOnlineMode()
  ) {
    fireNotification();
    lastNotifyAt = Date.now();
  }
  // 自分がキュー中は基準を0にしておき、抜けた後に相手が居れば改めて通知できるようにする。
  prevWaiting = iAmQueued ? 0 : count;
}

function startPoller() {
  stopPoller();
  void tick(); // 即時1回
  pollTimer = setInterval(() => void tick(), POLL_MS);
}
function stopPoller() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// main.jsの起動時に1回呼ぶ。有効ならポーリングを開始する。
export function initRankedNotify() {
  if (enabled) startPoller();
}

// ---- 通知（タブ点滅＋音＋バナー） ----

let bannerEl = null;
let titleFlashTimer = null;
let titleFlashStop = null;
let originalTitle = null;

function startTitleFlash() {
  if (titleFlashTimer) return;
  originalTitle = document.title;
  let on = false;
  titleFlashTimer = setInterval(() => {
    on = !on;
  document.title = on ? t("rn.tabTitle") : originalTitle;
  }, 900);
  titleFlashStop = setTimeout(stopTitleFlash, FLASH_MS);
}
function stopTitleFlash() {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (titleFlashStop) {
    clearTimeout(titleFlashStop);
    titleFlashStop = null;
  }
  if (originalTitle != null) {
    document.title = originalTitle;
    originalTitle = null;
  }
}

// 【#295】バナーは出しっぱなしで数十秒残る。その間に対局が始まったら（ホームから
// ランク戦に参加した・部屋に入った等）、盤面の上に「参加する」バナーが乗ったままになる。
// 表示中だけ様子を見て、対局が始まっていたら自分で引っ込む。
let bannerWatchTimer = null;
function startBannerWatch() {
  stopBannerWatch();
  bannerWatchTimer = setInterval(() => {
    if (!bannerEl) {
      stopBannerWatch();
      return;
    }
    if (isOnlineMode()) dismissBanner();
  }, 1000);
}
function stopBannerWatch() {
  if (bannerWatchTimer) {
    clearInterval(bannerWatchTimer);
    bannerWatchTimer = null;
  }
}

function dismissBanner() {
  bannerEl?.remove();
  bannerEl = null;
  stopBannerWatch();
  stopTitleFlash();
  stopFaviconAlert();
}

function openHomeFromNotify() {
  import("./home-screen.js")
    .then(({ openHomeScreen }) => openHomeScreen())
    .catch((err) => console.error("openHomeScreen from ranked-notify failed", err));
}

function fireNotification() {
  try {
    playSound("arrivalEffect"); // 前面で見ている時用（隠れている間は sound.js 側で鳴らない）
  } catch {
    /* 音は best-effort */
  }
  startTitleFlash();
  startFaviconAlert();
  // 別タブ/別アプリを見ている（＝アプリ内の音・バナーに気づけない）時は、OS のブラウザ通知で知らせる。
  showBrowserNotification({
      title: t("rn.notifyTitle"),
      body: t("rn.notifyBody"),
    tag: "so7-ranked-waiting",
    onClick: openHomeFromNotify,
  });
  if (bannerEl) return; // 既に表示中なら重ねない
  bannerEl = document.createElement("div");
  bannerEl.id = "ranked-notify-banner";

  const text = document.createElement("span");
  text.className = "ranked-notify-banner-text";
  text.textContent = t("rn.bannerText");
  bannerEl.appendChild(text);

  const joinBtn = document.createElement("button");
  joinBtn.type = "button";
  joinBtn.className = "ranked-notify-banner-join";
  joinBtn.textContent = t("rn.join");
  joinBtn.addEventListener("click", async () => {
    dismissBanner();
    // 【#306】「参加するボタン押したけどモーダルが消えただけで何も起きません」。
    // 以前は**ホーム画面を開くだけ**で、そこからランク戦タイルを押すのは利用者任せだった。
    // ホームが既に開いていれば見た目に何も起きず、タイトル画面やオープニングが手前にある時は
    // その裏でホームが開くだけ＝やはり何も起きない。ボタンの文言どおり**ランク戦へ直行**する。
    // 動的importで静的な循環依存を避ける（ranked-notify.js は online.js に依存しているため）。
    try {
      if (isOnlineMode()) return; // 既に対局中なら何もしない（バナー側の見張りでも消えるが念のため）
      // 手前に被さっている画面をどけてから進む（オープニングが出ている間は何も見えないため）。
      try {
        const { forceCloseOpeningScreen } = await import("./opening-screen.js");
        forceCloseOpeningScreen?.();
      } catch (err) {
        /* オープニングが無い状態なら何もしなくてよい */
      }
      const home = await import("./home-screen.js");
      home.closeHomeScreen?.();
      const { startRankedMatchmaking } = await import("./ranked-match.js");
      await startRankedMatchmaking(() => home.openHomeScreen());
    } catch (err) {
      console.error("ranked matchmaking from notify failed", err);
      try {
        const { openHomeScreen } = await import("./home-screen.js");
        openHomeScreen();
      } catch (e) {
        /* ここまで来たら諦める（バナーは既に閉じている） */
      }
    }
  });
  bannerEl.appendChild(joinBtn);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ranked-notify-banner-close";
  closeBtn.textContent = "✕";
  closeBtn.setAttribute("aria-label", t("rn.close"));
  closeBtn.addEventListener("click", dismissBanner);
  bannerEl.appendChild(closeBtn);

  document.body.appendChild(bannerEl);
  startBannerWatch();
  // バナー自体は一定時間で自動的に消す（点滅は別途 FLASH_MS で止まる）。
  setTimeout(() => {
    if (bannerEl) dismissBanner();
  }, FLASH_MS + 5000);
}

// ユーザー要望2026-09-02「ランク戦通知を促したい。ホームのランクマッチのところに“通知を
// オンにしませんか”的なバッジを出す。あとランク戦待ちの時にも促す」。
// 「まだONにしていない人にだけ勧める」判定と、その場でONにする入口をここにまとめる
// （ホーム画面と待機画面の両方から同じものを使う）。
export function shouldSuggestRankedNotify() {
  // まだONにしていない人にだけ勧める。ブラウザ通知が使えない/拒否済みの環境でも勧めてよい——
  // この設定の本体は「アプリを開いている間のタブ点滅・音・バナー」で、ブラウザ通知はその上乗せ
  // だから（設定の説明文もその通り）。
  return !enabled;
}

// 勧めに応じてONにする。ユーザー操作の文脈なので、ここでブラウザの許可も取りにいく
// （setRankedNotifyEnabled が ensureNotifyPermission を呼ぶ）。
export function enableRankedNotifyFromPrompt() {
  setRankedNotifyEnabled(true);
}


// アカウントにも保存する（pref-registry.js 参照）。通知の時間帯は「その人の生活時間」なので
// 端末ごとより本人に紐づく方が自然。
registerSyncedPref("rankedNotify", () => {
  const w = getRankedNotifyWindow();
  return { enabled: isRankedNotifyEnabled(), start: w.start, end: w.end };
}, (v) => {
  if (!v || typeof v !== "object") return;
  if (typeof v.start === "number" && typeof v.end === "number") setRankedNotifyWindow(v.start, v.end);
  if (typeof v.enabled === "boolean") setRankedNotifyEnabled(v.enabled);
});
