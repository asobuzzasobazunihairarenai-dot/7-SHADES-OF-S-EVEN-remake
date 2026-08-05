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
// ユーザー要望「登録ユーザー一覧・ログイン履歴・不具合報告は直近5件のみ表示し、あとは
// 『すべて表示』ボタンで見せたい」。各リストとも最初はこの件数だけ描画する。
const INITIAL_ROWS = 5;

const client = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const statusEl = document.getElementById("dashboard-status");
const contentEl = document.getElementById("dashboard-content");
const userListStatusEl = document.getElementById("user-list-status");
const userListBody = document.querySelector("#user-list-table tbody");
const userListShowAllBtn = document.getElementById("user-list-show-all-btn");
const visitLogStatusEl = document.getElementById("visit-log-status");
const visitLogBody = document.querySelector("#visit-log-table tbody");
const visitLogMoreBtn = document.getElementById("visit-log-more-btn");
const bugReportStatusEl = document.getElementById("bug-report-status");
const bugReportBody = document.querySelector("#bug-report-table tbody");
const bugReportShowAllBtn = document.getElementById("bug-report-show-all-btn");

// 一括取得したリスト用の共通「直近5件だけ描画し、残りは『すべて表示』ボタンで出す」処理。
// rows: 全行（新しい順で来る前提）、makeRow: 1行のtr要素を作る関数、showAllBtn: 展開ボタン。
function renderCollapsibleRows(tbody, rows, makeRow, showAllBtn) {
  tbody.innerHTML = "";
  for (const row of rows.slice(0, INITIAL_ROWS)) tbody.appendChild(makeRow(row));
  if (rows.length > INITIAL_ROWS) {
    showAllBtn.style.display = "";
    showAllBtn.disabled = false;
    showAllBtn.textContent = `すべて表示（残り${rows.length - INITIAL_ROWS}件）`;
    showAllBtn.onclick = () => {
      for (const row of rows.slice(INITIAL_ROWS)) tbody.appendChild(makeRow(row));
      showAllBtn.style.display = "none";
    };
  } else {
    showAllBtn.style.display = "none";
  }
}

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
  userListStatusEl.textContent = `${data.length}件（直近${Math.min(INITIAL_ROWS, data.length)}件を表示）`;
  renderCollapsibleRows(
    userListBody,
    data,
    (row) => buildRow([row.display_name || "(未設定)", row.email || "-", formatDateTime(row.created_at), formatDateTime(row.last_seen_at)]),
    userListShowAllBtn
  );
}

// 訪問記録はサーバー側ページング（VISIT_LOG_PAGE_SIZE件ずつ）。ユーザー要望に合わせ、
// 最初は直近INITIAL_ROWS件だけ描画し、残りの取得済み分は「すべて表示」で出す。全部出し
// 切った後はサーバーにまだ続きがあれば「さらに読み込む」で次ページを取れる（従来の機能は維持）。
let visitLogOffset = 0;
let visitLogHasMore = true;
let visitLogPendingBuffer = []; // 取得済みだがまだ描画していない行（初回の直近5件を除いた残り）
function appendVisitRows(rows) {
  for (const row of rows) {
    visitLogBody.appendChild(buildRow([formatDateTime(row.created_at), row.display_name || "(匿名/未ログイン)", row.email || "-"]));
  }
}
async function fetchVisitLogPage() {
  const { data, error } = await client.rpc("so7_get_admin_visit_log", {
    p_limit: VISIT_LOG_PAGE_SIZE,
    p_offset: visitLogOffset,
  });
  if (error) throw error;
  visitLogOffset += data.length;
  visitLogHasMore = data.length === VISIT_LOG_PAGE_SIZE;
  return data;
}
function refreshVisitLogButton() {
  if (visitLogPendingBuffer.length > 0) {
    visitLogMoreBtn.style.display = "";
    visitLogMoreBtn.disabled = false;
    visitLogMoreBtn.textContent = `すべて表示（残り${visitLogPendingBuffer.length}件${visitLogHasMore ? "＋" : ""}）`;
  } else if (visitLogHasMore) {
    visitLogMoreBtn.style.display = "";
    visitLogMoreBtn.disabled = false;
    visitLogMoreBtn.textContent = "さらに読み込む";
  } else {
    visitLogMoreBtn.style.display = "none";
  }
  visitLogStatusEl.textContent = `${visitLogBody.childElementCount}件を表示中`;
}
async function loadVisitLogInitial() {
  visitLogStatusEl.textContent = "読み込み中...";
  const data = await fetchVisitLogPage();
  appendVisitRows(data.slice(0, INITIAL_ROWS));
  visitLogPendingBuffer = data.slice(INITIAL_ROWS);
  refreshVisitLogButton();
}

visitLogMoreBtn.addEventListener("click", async () => {
  visitLogMoreBtn.disabled = true;
  try {
    if (visitLogPendingBuffer.length > 0) {
      // まず取得済みの残りを一気に描画する（「すべて表示」）。
      appendVisitRows(visitLogPendingBuffer);
      visitLogPendingBuffer = [];
    } else {
      // 取得済みは出し切っているので、次ページをサーバーから読む（「さらに読み込む」）。
      const data = await fetchVisitLogPage();
      appendVisitRows(data);
    }
    refreshVisitLogButton();
  } catch (err) {
    visitLogStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
    visitLogMoreBtn.disabled = false;
  }
});

async function loadBugReports() {
  bugReportStatusEl.textContent = "読み込み中...";
  const { data, error } = await client.rpc("so7_get_admin_bug_reports");
  if (error) {
    bugReportStatusEl.textContent = `取得に失敗しました: ${error.message}`;
    return;
  }
  bugReportStatusEl.textContent = `${data.length}件（直近${Math.min(INITIAL_ROWS, data.length)}件を表示）`;
  renderCollapsibleRows(bugReportBody, data, makeBugReportRow, bugReportShowAllBtn);
}

function makeBugReportRow(row) {
  const tr = document.createElement("tr");
  const reporter = row.display_name || row.email || "(匿名/未ログイン)";
  const cells = [formatDateTime(row.created_at), reporter, row.comment || "-"];
  cells.forEach((text, i) => {
    const td = document.createElement("td");
    td.textContent = text;
    // ユーザー報告「コメントが長いと表が横に伸びて『詳細』ボタンが画面外へ押し出され、
    // 横スクロールしないと押せない」。コメント列（index 2）だけ幅を制限して1行に省略表示し
    // （…）、全文はホバーのtitleと「詳細」ポップアップで見られるようにする。これで表全体の
    // 横幅が一定に収まり、詳細ボタンが常に見える位置に残る。
    if (i === 2) {
      td.style.maxWidth = "40rem";
      td.style.overflow = "hidden";
      td.style.textOverflow = "ellipsis";
      td.style.whiteSpace = "nowrap";
      td.title = text;
    }
    tr.appendChild(td);
  });
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
  return tr;
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
    loadVisitLogInitial().catch((err) => {
      visitLogStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
    }),
    loadBugReports().catch((err) => {
      bugReportStatusEl.textContent = `取得に失敗しました: ${err.message ?? err}`;
    }),
  ]);
}

init();
