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

// ブラウザ標準の許可ダイアログは「○○が通知の表示を求めています」だけで“何の通知か”が
// 伝わらず不審に見える（ユーザー報告2026-08-18）。そこで、いきなり本物の許可を求める前に、
// まずアプリ内で「何のための通知か」を説明するモーダル（プリパーミッション）を出し、
// ユーザーが「許可する」を選んだ時だけ本物の Notification.requestPermission() を呼ぶ。
// 返り値: "granted" | "denied" | "default"(今はしない) | "unsupported"。
// - 既に許可/拒否済み、または未対応なら、説明モーダルは出さずそのまま返す（冪等）。
// - 「今はしない」を選んだ場合はこのセッション中は二度と出さない（しつこくしない）。
let notifyPrimeDismissedThisSession = false;
export function primeNotifyPermission({ title = "通知でお知らせします", body = "", allowLabel = "🔔 通知を許可する" } = {}) {
  return new Promise((resolve) => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) {
        resolve("unsupported");
        return;
      }
      if (Notification.permission !== "default") {
        resolve(Notification.permission); // 既に許可/拒否済み＝説明不要
        return;
      }
      if (notifyPrimeDismissedThisSession) {
        resolve("default");
        return;
      }
      const overlay = document.createElement("div");
      overlay.style.cssText =
        "position:fixed;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.72);";
      const card = document.createElement("div");
      card.style.cssText =
        "max-width:22rem;margin:1rem;background:linear-gradient(160deg,#232c3d,#141a26);border:2px solid #ffd77a;border-radius:1rem;box-shadow:0 0 40px rgba(255,200,90,0.35);padding:1.6rem 1.7rem;color:#f1f5f9;text-align:center;";
      const h = document.createElement("div");
      h.style.cssText = "font-size:1.15rem;font-weight:700;color:#ffd77a;margin-bottom:0.7rem;";
      h.textContent = "🔔 " + title;
      card.appendChild(h);
      const p = document.createElement("div");
      p.style.cssText = "font-size:0.9rem;line-height:1.6;color:#cbd5e1;margin-bottom:1.1rem;";
      p.textContent = body;
      card.appendChild(p);
      const finish = (result) => {
        overlay.remove();
        resolve(result);
      };
      const allow = document.createElement("button");
      allow.type = "button";
      allow.style.cssText =
        "display:block;width:100%;box-sizing:border-box;padding:0.7rem;border:none;border-radius:0.7rem;background:linear-gradient(160deg,#ffd77a,#f0a93a);color:#241a08;font-size:1rem;font-weight:700;cursor:pointer;margin-bottom:0.6rem;";
      allow.textContent = allowLabel;
      allow.addEventListener("click", async () => {
        allow.disabled = true;
        const perm = await ensureNotifyPermission(); // ここで初めて本物のブラウザ許可ダイアログが出る
        finish(perm);
      });
      card.appendChild(allow);
      const later = document.createElement("button");
      later.type = "button";
      later.style.cssText =
        "display:block;width:100%;box-sizing:border-box;padding:0.5rem;border:1px solid rgba(255,255,255,0.25);border-radius:0.6rem;background:transparent;color:#cbd5e1;font-size:0.85rem;cursor:pointer;";
      later.textContent = "今はしない";
      later.addEventListener("click", () => {
        notifyPrimeDismissedThisSession = true;
        finish("default");
      });
      card.appendChild(later);
      overlay.appendChild(card);
      document.body.appendChild(overlay);
    } catch (err) {
      resolve("unsupported");
    }
  });
}

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
