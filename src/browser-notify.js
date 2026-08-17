// ブラウザ通知（Notification API）＋ファビコン点滅の共有ヘルパー。
//
// 背景（続き186→続き187）: 「スマホで別画面を開いている間は音を鳴らさない」対応で playSound を
// document.hidden 中は no-op にしたため、ランク戦の「相手が待っています／相手が見つかりました」の
// 通知音が、まさに知らせたい“別タブ/別アプリを見ている”状況で鳴らなくなった。そこで別タブ/別アプリに
// いても届く手段＝OS のブラウザ通知（クリックでこのタブに戻れる。音は OS 側が鳴らすので、アプリ内の
// 効果音ゲート〈document.hidden〉とは無関係にユーザーの OS 通知設定に従う）と、タブに戻る前でも
// 気づけるファビコン点滅を用意する。
//
// 使い方:
//  - ユーザー操作の中で ensureNotifyPermission() を呼んで許可を取っておく（ランク戦の通知設定を
//    ONにした時・マッチメイクを開始した時など。ブラウザは「ユーザー操作起点」でないと許可を求められない）。
//  - 通知したい時に showBrowserNotification({title, body, tag, onClick}) を呼ぶ。既定では
//    「タブが隠れている時だけ」OS 通知を出す（前面で見ている時はアプリ内バナー等で足りるため）。
//  - 併せて startFaviconAlert()/stopFaviconAlert() でファビコンを点滅させる。

let originalFaviconHref = null;
let faviconLinkEl = null;
let faviconFlashTimer = null;
let faviconStopTimer = null;
let alertIconDataUrl = null;

// 許可を求める（ユーザー操作の文脈で呼ぶこと）。冪等: default の時だけ requestPermission する。
export async function ensureNotifyPermission() {
  try {
    if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
    if (Notification.permission === "default") {
      return await Notification.requestPermission();
    }
    return Notification.permission; // "granted" | "denied"
  } catch (err) {
    return "unsupported";
  }
}

export function canNotify() {
  return typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";
}

// OS のブラウザ通知を出す。requireHidden=true（既定）の時は、タブが前面に見えている間は出さない
// （前面ならアプリ内の見た目で足りる）。クリックするとこのタブにフォーカスし onClick を呼ぶ。
// 戻り値: 実際に出したら true。
export function showBrowserNotification({ title, body = "", tag = "so7", onClick = null, requireHidden = true } = {}) {
  try {
    if (requireHidden && typeof document !== "undefined" && !document.hidden) return false;
    if (!canNotify()) return false;
    const n = new Notification(title, { body, tag, renotify: true, icon: getAlertIconDataUrl() });
    n.onclick = () => {
      try {
        window.focus();
      } catch {}
      try {
        n.close();
      } catch {}
      if (typeof onClick === "function") {
        try {
          onClick();
        } catch (err) {
          console.error("browser notification onClick failed", err);
        }
      }
    };
    return true;
  } catch (err) {
    return false;
  }
}

// ---- ファビコン点滅 ----

function getAlertIconDataUrl() {
  if (alertIconDataUrl) return alertIconDataUrl;
  try {
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const ctx = c.getContext("2d");
    // 緑の丸に白フチ（「相手がいる！」の緑を踏襲）。
    ctx.beginPath();
    ctx.arc(16, 16, 14, 0, Math.PI * 2);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
    // 中央に感嘆符
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", 16, 17);
    alertIconDataUrl = c.toDataURL("image/png");
  } catch (err) {
    alertIconDataUrl = "";
  }
  return alertIconDataUrl;
}

function ensureFaviconLink() {
  if (faviconLinkEl && document.head.contains(faviconLinkEl)) return faviconLinkEl;
  faviconLinkEl = document.querySelector('link[rel~="icon"]');
  if (!faviconLinkEl) {
    faviconLinkEl = document.createElement("link");
    faviconLinkEl.rel = "icon";
    document.head.appendChild(faviconLinkEl);
  }
  if (originalFaviconHref == null) originalFaviconHref = faviconLinkEl.getAttribute("href") || "";
  return faviconLinkEl;
}

// ファビコンを「通知アイコン⇔元」で点滅させる（既定で maxMs 後に自動停止）。
export function startFaviconAlert(maxMs = 30000) {
  const link = ensureFaviconLink();
  const alert = getAlertIconDataUrl();
  if (!alert) return;
  if (faviconFlashTimer) return; // 既に点滅中
  link.setAttribute("href", alert); // 開始と同時にアラートアイコンへ（すぐ気づけるように）
  let on = true;
  faviconFlashTimer = setInterval(() => {
    on = !on;
    link.setAttribute("href", on ? alert : originalFaviconHref || alert);
  }, 800);
  faviconStopTimer = setTimeout(stopFaviconAlert, maxMs);
}

export function stopFaviconAlert() {
  if (faviconFlashTimer) {
    clearInterval(faviconFlashTimer);
    faviconFlashTimer = null;
  }
  if (faviconStopTimer) {
    clearTimeout(faviconStopTimer);
    faviconStopTimer = null;
  }
  if (faviconLinkEl && originalFaviconHref != null) {
    faviconLinkEl.setAttribute("href", originalFaviconHref);
  }
}
