// 管理者ダッシュボード（独立ページ、admin-dashboard.html参照）。ユーザー要望「登録
// ユーザーのユーザー名とアドレスを一覧したい。ログイン履歴もさかのぼれるようにしたい。
// 小さい窓だと見にくいので独自のウインドウを立ち上げてほしい」への対応。
//
// ゲーム本体（src/main.js以下）とは完全に切り離した、このページ専用の軽量なモジュール。
// online.jsを再利用すると、ゲームのDOM構造（#game-table等）を前提にした巨大な
// モジュール群を丸ごと読み込むことになり無駄が大きいため、Supabaseクライアントを
// 自前で1つだけ作る（online.jsと同じURL/匿名キー、どちらも公開情報）。ログイン
// セッション自体はSupabaseが同じオリジンのlocalStorageに保存するため、ゲーム画面で
// 既にログイン済みの管理者アカウントなら、このページを開いた時点で自動的に
// ログイン状態が引き継がれる。
// アクセス制限の実体はサーバー側（supabase_setup_so7.sqlの各RPC内部でauth.jwt()の
// メールアドレスをチェック）にあり、ここでのisAdmin判定は表示の出し分けだけ。

const SUPABASE_URL = "https://prnddzrnblfysggiuzmo.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_YFYWr0FghhXbrqNQJ9Jzgw_hu31kvw9";
const ADMIN_EMAIL = "asobuzz.asobazunihairarenai@gmail.com";
const VISIT_LOG_PAGE_SIZE = 200;

const client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const statusEl = document.getElementById("dashboard-status");
const contentEl = document.getElementById("dashboard-content");
const userListStatusEl = document.getElementById("user-list-status");
const userListBody = document.querySelector("#user-list-table tbody");
const visitLogStatusEl = document.getElementById("visit-log-status");
const visitLogBody = document.querySelector("#visit-log-table tbody");
const visitLogMoreBtn = document.getElementById("visit-log-more-btn");
const bugReportStatusEl = document.getElementById("bug-report-status");
const bugReportBody = document.querySelector("#bug-report-table tbody");

function formatDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ja-JP");
}

function buildRow(cells) {
  const tr = document.createElement("tr");
  for (const text of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    tr.appendChild(td);
  }
  return tr;
}

async function loadUserList() {
  userListStatusEl.textContent = "読み込み中...";
  const { data, error } = await client.rpc("so7_get_admin_user_list");
  if (error) {
    userListStatusEl.textContent = `取得に失敗しました: ${error.message}`;
    return;
  }
  userListStatusEl.textContent = `${data.length}件`;
  userListBody.innerHTML = "";
  for (const row of data) {
    userListBody.appendChild(
      buildRow([row.display_name || "(未設定)", row.email || "-", formatDateTime(row.created_at), formatDateTime(row.last_seen_at)])
    );
  }
}

let visitLogOffset = 0;
async function loadVisitLogPage() {
  visitLogMoreBtn.disabled = true;
  visitLogStatusEl.textContent = "読み込み中...";
  const { data, error } = await client.rpc("so7_get_admin_visit_log", {
    p_limit: VISIT_LOG_PAGE_SIZE,
    p_offset: visitLogOffset,
  });
  if (error) {
    visitLogStatusEl.textContent = `取得に失敗しました: ${error.message}`;
    visitLogMoreBtn.disabled = false;
    return;
  }
  for (const row of data) {
    visitLogBody.appendChild(buildRow([formatDateTime(row.created_at), row.display_name || "(匿名/未ログイン)", row.email || "-"]));
  }
  visitLogOffset += data.length;
  visitLogStatusEl.textContent = `${visitLogOffset}件を表示中`;
  visitLogMoreBtn.disabled = data.length < VISIT_LOG_PAGE_SIZE;
  if (data.length < VISIT_LOG_PAGE_SIZE) visitLogMoreBtn.textContent = "これ以上ありません";
}

visitLogMoreBtn.addEventListener("click", () => {
  loadVisitLogPage().catch((err) => {
    visitLogStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
  });
});

async function loadBugReports() {
  bugReportStatusEl.textContent = "読み込み中...";
  const { data, error } = await client.rpc("so7_get_admin_bug_reports");
  if (error) {
    bugReportStatusEl.textContent = `取得に失敗しました: ${error.message}`;
    return;
  }
  bugReportStatusEl.textContent = `${data.length}件`;
  bugReportBody.innerHTML = "";
  for (const row of data) {
    const tr = document.createElement("tr");
    const reporter = row.display_name || row.email || "(匿名/未ログイン)";
    for (const text of [formatDateTime(row.created_at), reporter, row.comment || "-"]) {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    }
    // 「詳細」: アクションログ・コンソールログ・状況を別ウィンドウで全文表示する。
    const detailTd = document.createElement("td");
    const detailBtn = document.createElement("button");
    detailBtn.type = "button";
    detailBtn.textContent = "詳細";
    detailBtn.addEventListener("click", () => {
      const ctx = row.context ? JSON.stringify(row.context, null, 2) : "(なし)";
      const full =
        `【不具合報告 #${row.id}】 ${formatDateTime(row.created_at)}\n報告者: ${reporter}\n\n` +
        `■コメント\n${row.comment || ""}\n\n` +
        `■状況\n${ctx}\n\n` +
        `■コンソールログ\n${row.console_log || "(なし)"}\n\n` +
        `■アクションログ\n${row.action_log || "(なし)"}\n`;
      const w = window.open("", "_blank");
      if (w) {
        const pre = w.document.createElement("pre");
        pre.style.cssText = "white-space: pre-wrap; word-break: break-word; font-family: monospace; padding: 1rem;";
        pre.textContent = full;
        w.document.body.appendChild(pre);
        w.document.title = `不具合報告 #${row.id}`;
      } else {
        alert(full);
      }
    });
    detailTd.appendChild(detailBtn);
    tr.appendChild(detailTd);
    bugReportBody.appendChild(tr);
  }
}

async function init() {
  if (!client) {
    statusEl.textContent = "Supabaseの読み込みに失敗しました。";
    return;
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    statusEl.textContent = "このページは管理者アカウントでログインしている場合のみ表示できます。ゲーム画面で管理者アカウントにログインしてから、このページを開き直してください。";
    return;
  }
  statusEl.style.display = "none";
  contentEl.style.display = "block";
  await Promise.all([
    loadUserList().catch((err) => {
      userListStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
    }),
    loadVisitLogPage().catch((err) => {
      visitLogStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
    }),
    loadBugReports().catch((err) => {
      bugReportStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
    }),
  ]);
}

init();
