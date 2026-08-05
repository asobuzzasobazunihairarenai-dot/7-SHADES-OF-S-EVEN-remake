# 不具合報告のメール通知（Google Apps Script ＋ Supabase Database Webhook）

不具合報告（`so7_bug_reports` テーブルへの INSERT）が入るたびに、管理者の Gmail
（`asobuzz.asobazunihairarenai@gmail.com`）へメールで知らせる仕組み。

- **アプリ本体のコード変更は不要**（サーバー側の設定だけで完結）。
- 追加サービス・費用なし。あなた自身の Gmail から送信する。
- 秘密の値（シークレット・URL）は**このリポジトリには入れない**（Apps Script と
  Supabase ダッシュボードにだけ入れる）。下のコードのシークレットはダミー。

セキュリティの考え方: Apps Script のウェブアプリ URL は「誰でも実行可」で公開になるため、
第三者が直接叩いても送信しないよう、URL の `?secret=...` を Apps Script 側で照合する。
シークレットはダッシュボード（Webhook 設定）にだけ置き、リポジトリには残さない。

---

## 手順1: Google Apps Script を作る（5分）

1. https://script.google.com/ を開き **「新しいプロジェクト」**。
2. 既定の `Code.gs` の中身を、下のコードで**丸ごと置き換える**。
3. `SHARED_SECRET` を**自分だけが知る長いランダム文字列**に変える
   （例: パスワード生成で 40 文字くらい。記号は URL 用に英数字のみが無難）。
4. 保存（💾）。
5. 右上 **「デプロイ」→「新しいデプロイ」** →歯車で種類 **「ウェブアプリ」** を選択。
   - 説明: 任意（例「so7 bug report mail」）
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
   - **「デプロイ」** → 初回は権限承認（自分の Gmail 送信を許可）。
6. 表示される **ウェブアプリの URL**（`https://script.google.com/macros/s/.../exec`）を控える。

```javascript
// 7 SHADES OF S:EVEN — 不具合報告のメール通知（Google Apps Script）
// Supabase の Database Webhook から POST される新規 so7_bug_reports 行を、
// 管理者の Gmail へメールで知らせる。

// ▼ 自分だけが知る長いランダム文字列に変えること（英数字推奨）。
//   Supabase 側の Webhook URL の ?secret=... と一致させる。
const SHARED_SECRET = 'REPLACE_WITH_A_LONG_RANDOM_STRING';
const NOTIFY_TO = 'asobuzz.asobazunihairarenai@gmail.com';

function doPost(e) {
  try {
    // 認証: 一致しなければ何も送らない（Apps Script はヘッダーを読めないため ?secret= で渡す）。
    const secret = e && e.parameter && e.parameter.secret;
    if (secret !== SHARED_SECRET) {
      return ContentService.createTextOutput('forbidden');
    }
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    // Supabase の Database Webhook は { type, table, record, old_record, schema } 形式。
    const row = payload.record || payload || {};
    const id = row.id != null ? String(row.id) : '(不明)';
    const created = row.created_at || new Date().toISOString();
    const comment = row.comment || '(コメントなし)';
    const userId = row.user_id || '(匿名/未ログイン)';

    const subject = '【7SHADES】新しい不具合報告 #' + id;
    const bodyLines = [
      '新しい不具合報告が届きました。',
      '',
      '日時: ' + created,
      'ID: ' + id,
      '報告者 user_id: ' + userId,
      '',
      '■コメント',
      comment,
      '',
      '※コンソールログ・アクションログ・状況（context）の全文は、',
      '　管理者ダッシュボードの「🐛 不具合報告」→ 該当行の「詳細」で確認できます。',
    ];
    MailApp.sendEmail(NOTIFY_TO, subject, bodyLines.join('\n'));
    return ContentService.createTextOutput('ok');
  } catch (err) {
    // 失敗しても Supabase 側の INSERT には影響しない（Webhook は非同期）。
    return ContentService.createTextOutput('error: ' + err);
  }
}
```

---

## 手順2: Supabase の Database Webhook を作る（3分）

1. Supabase ダッシュボード → 対象プロジェクト → 左メニュー **Database → Webhooks**。
2. **「Create a new hook」**。
   - Name: `bug-report-email`（任意）
   - Table: **`so7_bug_reports`**
   - Events: **Insert** のみチェック
   - Type: **HTTP Request**
   - Method: **POST**
   - URL: **`<手順1のウェブアプリURL>?secret=<手順1のSHARED_SECRET>`**
     - 例: `https://script.google.com/macros/s/AKfy.../exec?secret=abcd1234...`
   - HTTP Headers: 既定のまま（`Content-Type: application/json` があれば OK）
3. **保存**。

これで、誰かが不具合報告を送信 → `so7_bug_reports` に INSERT → Webhook が
Apps Script を叩く → あなたの Gmail にメールが届く、という流れになります。

---

## 動作確認

- アプリの「🐛 不具合報告」から自分でテスト送信して、数十秒以内にメールが来るか確認。
- 来ない場合:
  - Apps Script の URL 末尾が `/exec`（`/dev` ではない）か。
  - Webhook URL の `?secret=` が Apps Script の `SHARED_SECRET` と**完全一致**か。
  - Supabase の Webhook のログ（Database → Webhooks → 該当 hook）で送信結果を確認。
  - Apps Script の「実行数」ログ（左メニューの実行数）でエラーが出ていないか。

## 補足

- 迷惑メール扱いされる場合は、届いたメールを「迷惑メールではない」に。
- 件数が多くて煩わしくなったら、Apps Script 側で「1 時間に N 件までまとめる」等の制御も
  後から追加できます（必要になったら言ってください）。
