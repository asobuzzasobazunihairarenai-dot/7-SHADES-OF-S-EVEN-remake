// Service Worker — Web Push（タブ/ブラウザを閉じていても届く本物のプッシュ通知）。続き198。
// ランク戦の「対戦相手が見つかりました！（レディチェック）」を、別タブどころかブラウザを
// 閉じていても受け取れるようにするのが主目的（browser-notify.js の Notification API は
// “タブが生きている間”だけで、閉じると届かないため）。
//
// 配置場所の注意: GitHub Pages はリポジトリをサブパス（…/7-SHADES-OF-S-EVEN-remake/）で
// 配信するため、この sw.js を「リポジトリ直下」に置くことで …/7-SHADES-OF-S-EVEN-remake/sw.js
// として配信され、Service Worker のスコープが同ディレクトリ（＝アプリ全体）になる。
// src/ 以下に置くとスコープが /src/ に限定されてしまうので、必ずリポジトリ直下に置く。

self.addEventListener("install", () => {
  // 新しい SW を即座に有効化（更新の反映を早める）。
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// プッシュ受信 → OS 通知を表示。userVisibleOnly:true で購読しているため、push のたびに
// 必ず通知を出す必要がある（ブラウザが強制する）。同じ tag を使うと OS 側で1つにまとまる
// （前面タブが Notification API で出したものとも tag が同じなら二重に積まれない）。
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: event.data && typeof event.data.text === "function" ? event.data.text() : "お知らせ" };
  }
  const title = data.title || "7 SHADES OF S:EVEN";
  const options = {
    body: data.body || "",
    tag: data.tag || "so7-push",
    renotify: true,
    icon: data.icon || undefined,
    badge: data.badge || undefined,
    data: { url: data.url || "./" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知クリック → 既に開いているタブがあればフォーカス、無ければアプリを開く。
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) {
          try {
            await client.focus();
          } catch (e) {
            /* focus できなくても続行 */
          }
          return;
        }
      }
      if (self.clients.openWindow) {
        try {
          await self.clients.openWindow(targetUrl);
        } catch (e) {
          /* openWindow 失敗は握りつぶす */
        }
      }
    })()
  );
});
