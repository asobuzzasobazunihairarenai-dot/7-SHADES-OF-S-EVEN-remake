// ホーム画面への追加（PWAインストール）の案内（ユーザー要望2026-09-02
// 「ブラウザでアプリを開いたユーザーに対し、PWAを案内してボタン一つで自動でホームに追加
//   することはできますか？」）。
//
// 結論（できること・できないこと）:
//   ・Android の Chrome / Edge など … **ボタン一つでできる**。ブラウザが出す
//     `beforeinstallprompt` イベントを捕まえておき、こちらのボタンが押された時に
//     `prompt()` を呼ぶと、OS標準の「ホーム画面に追加しますか？」が出る。
//   ・iPhone / iPad の Safari … **ボタン一つではできない**（Appleが同等のAPIを実装して
//     いないため、どのサイトも自動追加はできない）。共有ボタン →「ホーム画面に追加」の
//     手順を案内するしかない。この画面ではその手順を図解の代わりに文章で出す。
//   ・既にホーム画面から起動している（standalone）人には何も出さない。
//
// 出し方: ホーム画面の下部に控えめな一行の案内を出す。「あとで」を押した端末には
// しばらく（14日）出さない。追加が完了したら二度と出さない。
import { t } from "./ui-text.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { isTouchPrimaryDevice } from "./device-detect.js";

const DISMISS_KEY = "so7-pwa-install-dismissed-at";
const DISMISS_DAYS = 14;

let deferredPrompt = null;
let bannerEl = null;

// ブラウザが「インストールできる」と判断した時に飛んでくる。既定の案内バーを止めて
// （preventDefault）、こちらのタイミングで prompt() できるよう取っておく。
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    refreshBanner();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 3650 * 24 * 60 * 60 * 1000));
    } catch (err) {
      /* localStorageが使えなくても致命的ではない */
    }
    bannerEl?.remove();
    bannerEl = null;
  });
}

// 既にホーム画面から起動しているか（追加済み）。
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator?.standalone === true;
}

function isIos() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  // iPadOS はデスクトップ表示だと Macintosh を名乗るので、タッチの有無も見る。
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
}

function isDismissed() {
  try {
    const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return Number.isFinite(until) && Date.now() < until;
  } catch (err) {
    return false;
  }
}

function dismissForAWhile() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
  } catch (err) {
    /* 保存できなくてもこのセッション中は消えたままになる */
  }
  bannerEl?.remove();
  bannerEl = null;
}

// 案内を出す条件: 追加済みでない・「あとで」の有効期間中でない・
// （Androidなどで prompt が使える／iOSで手順を案内できる）のどれか。
function shouldOffer() {
  if (isStandalone()) return false;
  if (isDismissed()) return false;
  return Boolean(deferredPrompt) || isIos();
}

function refreshBanner() {
  if (!bannerEl) return;
  bannerEl.style.display = shouldOffer() ? "flex" : "none";
}

// iPhone/iPad 用の手順モーダル（ボタン一つで追加できないため、やり方を案内する）。
function showIosHowTo() {
  const backdrop = createBackdrop(() => close(), { dim: true, zIndex: 10450 });
  const modal = document.createElement("div");
  modal.id = "pwa-install-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const title = document.createElement("div");
  title.className = "pwa-install-modal-title";
  title.textContent = t("pwa.iosTitle");
  modal.appendChild(title);
  const list = document.createElement("ol");
  list.className = "pwa-install-modal-steps";
  for (const key of ["pwa.iosStep1", "pwa.iosStep2", "pwa.iosStep3"]) {
    const li = document.createElement("li");
    li.textContent = t(key);
    list.appendChild(li);
  }
  modal.appendChild(list);
  const note = document.createElement("div");
  note.className = "pwa-install-modal-note";
  note.textContent = t("pwa.iosNote");
  modal.appendChild(note);
  modal.appendChild(createModalCloseX(close));
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// ホーム画面の下部に差し込む案内バー。呼び出し側（home-screen.js）は、これを
// appendChild するだけでよい（出す条件を満たさない時は非表示の要素が返る）。
export function buildPwaInstallBanner() {
  bannerEl = document.createElement("div");
  bannerEl.id = "pwa-install-banner";

  const text = document.createElement("div");
  text.className = "pwa-install-text";
  // PCで「ホーム画面に追加」と言われても意味が通らない（ユーザー報告2026-09-05
  // 「スマホではないのにホーム画面への追加推奨モーダルが出ています」）。同じ機能でも、
  // 端末によって呼び方が違うので言い方を変える（PC＝アプリとしてインストール）。
  text.textContent = t(isTouchPrimaryDevice() ? "pwa.bannerText" : "pwa.bannerTextDesktop");
  bannerEl.appendChild(text);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "pwa-install-add";
  addBtn.textContent = t(isTouchPrimaryDevice() ? "pwa.addBtn" : "pwa.addBtnDesktop");
  addBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      addBtn.disabled = true;
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        deferredPrompt = null;
        if (choice?.outcome === "accepted") {
          bannerEl?.remove();
          bannerEl = null;
          return;
        }
      } catch (err) {
        /* ブラウザ側で拒否された等。案内は残しておく */
      }
      addBtn.disabled = false;
      refreshBanner();
      return;
    }
    // iOS など、ボタン一つで追加できない環境では手順を案内する。
    showIosHowTo();
  });
  bannerEl.appendChild(addBtn);

  const laterBtn = document.createElement("button");
  laterBtn.type = "button";
  laterBtn.className = "pwa-install-later";
  laterBtn.textContent = t("pwa.laterBtn");
  laterBtn.addEventListener("click", dismissForAWhile);
  bannerEl.appendChild(laterBtn);

  refreshBanner();
  return bannerEl;
}
