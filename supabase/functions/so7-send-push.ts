// Supabase Edge Function: so7-send-push
// 役割: 指定ユーザー（複数可）へ Web Push 通知を送る。タブ/ブラウザを閉じていても届く
//       （Service Worker sw.js が受け取って OS 通知を出す）。主用途はランク戦のマッチ成立
//       （レディチェック開始）で、相手を対戦へ呼び戻すこと。docs/ranked-spec.md 参照。
//
// デプロイ方法(Supabaseダッシュボード、so7-apply-action.tsと同じ運用):
//   1. 左メニュー「Edge Functions」→「Deploy a new function」
//   2. Function name: so7-send-push
//   3. このファイルの中身をまるごと貼り付けて Deploy
//   4. Secrets（Edge Functions → Settings/Secrets、または CLI）に VAPID 鍵を設定:
//        VAPID_PUBLIC_KEY  = web-push generate-vapid-keys の Public Key
//        VAPID_PRIVATE_KEY = 同 Private Key（秘密）
//        VAPID_SUBJECT     = mailto:あなたのメールアドレス
//   5. SQL Editor で supabase_setup_so7.sql を実行し so7_push_subscriptions /
//      so7_save_push_subscription を作成しておくこと。
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY は Supabase が自動で
// 環境変数として渡す。VAPID_* は上記の通り自分で Secrets に設定する必要がある。
//
// 濫用防止: 認証済みユーザーであっても、任意の相手へは送れない。呼び出し元と「同じ
// so7_ranked_pending_match（レディチェック待ちのグループ）」に居る相手にだけ送れる
// （＝ランクのマッチ成立通知という正規用途に限定）。

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  try {
    if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return json({ ok: false, error: "vapid_not_configured" }, 500);
    }

    // 認証（呼び出し元）。
    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "unauthorized" }, 401);
    const callerId = userData.user.id;

    const reqBody = await req.json();
    const targetUserIds: string[] = Array.isArray(reqBody.targetUserIds) ? reqBody.targetUserIds : [];
    const title: string = typeof reqBody.title === "string" ? reqBody.title : "7 SHADES OF S:EVEN";
    const bodyText: string = typeof reqBody.body === "string" ? reqBody.body : "";
    const url: string = typeof reqBody.url === "string" ? reqBody.url : "./";
    const tag: string = typeof reqBody.tag === "string" ? reqBody.tag : "so7-push";
    if (targetUserIds.length === 0) return json({ ok: true, sent: 0, skipped: "no_targets" });

    const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 濫用防止: 呼び出し元と同じ pending_match に居る相手だけを送信先として許可する。
    const { data: matches } = await db
      .from("so7_ranked_pending_match")
      .select("players")
      .contains("players", [callerId]);
    const allowed = new Set<string>();
    for (const m of matches ?? []) {
      for (const p of (m.players ?? []) as string[]) allowed.add(p);
    }
    const targets = targetUserIds.filter((id) => id && id !== callerId && allowed.has(id));
    if (targets.length === 0) return json({ ok: true, sent: 0, skipped: "no_shared_match" });

    // 送信先の subscription を引く。
    const { data: subs, error: subErr } = await db
      .from("so7_push_subscriptions")
      .select("endpoint, p256dh, auth_key")
      .in("user_id", targets);
    if (subErr) return json({ ok: false, error: "subscription_lookup_failed" }, 500);
    if (!subs || subs.length === 0) return json({ ok: true, sent: 0, skipped: "no_subscriptions" });

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    const payload = JSON.stringify({ title, body: bodyText, url, tag });

    let sent = 0;
    const expired: string[] = [];
    for (const s of subs) {
      const subscription = {
        endpoint: s.endpoint as string,
        keys: { p256dh: s.p256dh as string, auth: s.auth_key as string },
      };
      try {
        await webpush.sendNotification(subscription, payload);
        sent++;
      } catch (err) {
        // 404/410 = 期限切れ/解除済みの subscription。掃除する。
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) expired.push(s.endpoint as string);
        else console.error("push send failed", code, (err as Error)?.message);
      }
    }
    if (expired.length > 0) {
      await db.from("so7_push_subscriptions").delete().in("endpoint", expired);
    }
    return json({ ok: true, sent, total: subs.length, cleaned: expired.length });
  } catch (err) {
    console.error("so7-send-push error", err);
    return json({ ok: false, error: (err as Error)?.message ?? "error" }, 500);
  }
});
