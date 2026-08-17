// Web Push（タブ/ブラウザを閉じていても届く本物のプッシュ通知）のクライアント側。続き198。
// browser-notify.js の Notification API は「タブが生きている間」だけで、閉じると届かない。
// ランク戦のレディチェック（対戦開始を押さないと弾かれる）を見逃さないよう、Service Worker
// (sw.js) 経由で OS プッシュ通知を出す。
//
// ⚠️ セットアップ（ユーザー側の作業が必要。設定が済むまでこの機能は“無効”で害なくスキップされる）:
//  1. ローカルで `npx web-push generate-vapid-keys` を実行し VAPID 鍵ペアを生成する。
//  2. その "Public Key" を下の VAPID_PUBLIC_KEY に貼る（公開してよい＝コミットOK）。
//  3. "Private Key" は Supabase の Edge Function シークレット VAPID_PRIVATE_KEY に設定する
//     （秘密。コミットしない。ダッシュボードの Edge Functions → Secrets、または CLI）。
//     あわせて VAPID_SUBJECT に mailto:あなたのメール を設定する。
//  4. supabase_setup_so7.sql の so7_push_subscriptions / so7_save_push_subscription を SQL Editor で実行。
//  5. supabase/functions/so7-send-push.ts をデプロイ（so7-apply-action と同じ手順）。

import { saveMyPushSubscription } from "./online.js";

// ↓ web-push generate-vapid-keys の "Public Key"（公開してよい）。秘密鍵は Edge Function の
// シークレット VAPID_PRIVATE_KEY 側（so7-send-push.ts）に設定する。
const VAPID_PUBLIC_KEY = "BNWYNH2sOb-VyKSphibmfSiGClWsJQwbSXWjzsx-nLIqW6Y4S2OTSHWpsRymwmiVaaEMdECTcP5UjUF7WnrXDuk";

export function isPushConfigured() {
  return typeof VAPID_PUBLIC_KEY === "string" && VAPID_PUBLIC_KEY.length > 20;
}

export function isPushSupported() {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window
  );
}

let registerPromise = null;

// Service Worker を登録（起動時に1回。通知許可が無くても無害）。
export function initPushNotify() {
  if (!isPushSupported()) return Promise.resolve(null);
  if (registerPromise) return registerPromise;
  // 相対パス "sw.js" は現在のページURL基準で解決される。GitHub Pages のサブパス配信でも
  // …/7-SHADES-OF-S-EVEN-remake/sw.js を指し、スコープはそのディレクトリ（＝アプリ全体）になる。
  registerPromise = navigator.serviceWorker
    .register("sw.js")
    .then((reg) => reg)
    .catch((err) => {
      console.error("Service Worker register failed", err);
      return null;
    });
  return registerPromise;
}

// base64url の VAPID 公開鍵を pushManager.subscribe が要求する Uint8Array に変換する。
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// 通知許可が granted になった後に呼ぶ（購読して自席の subscription をサーバーへ保存）。冪等。
// 既に購読済みならその subscription を保存し直すだけ（endpoint が変わった時の追随のため）。
export async function subscribeToPush() {
  try {
    if (!isPushSupported() || !isPushConfigured()) return false;
    if (typeof Notification !== "undefined" && Notification.permission !== "granted") return false;
    const reg = await initPushNotify();
    if (!reg) return false;
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = typeof sub.toJSON === "function" ? sub.toJSON() : null;
    if (json && json.endpoint && json.keys && json.keys.p256dh && json.keys.auth) {
      await saveMyPushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
      return true;
    }
    return false;
  } catch (err) {
    console.error("subscribeToPush failed", err);
    return false;
  }
}
