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
  selectedBugReports.clear();
  updateBugReportSelectionLabel();
  renderCollapsibleRows(bugReportBody, data, makeBugReportRow, bugReportShowAllBtn);
}


// 報告1件を「そのまま貼れるテキスト」にする（詳細ウィンドウ・コピー機能で共用）。
function bugReportToText(row) {
  const reporter = row.display_name || row.email || "(匿名/未ログイン)";
  const ctx = row.context ? JSON.stringify(row.context, null, 2) : "(なし)";
  const shotUrl = bugReportShotUrl(row);
  return (
    `【不具合報告 #${row.id}】 ${formatDateTime(row.created_at)}\n報告者: ${reporter}\n\n` +
    (shotUrl ? `■添付画像\n${shotUrl}\n\n` : "") +
    `■コメント\n${row.comment || ""}\n\n` +
    `■状況\n${ctx}\n\n` +
    `■コンソールログ\n${row.console_log || "(なし)"}\n\n` +
    `■アクションログ\n${row.action_log || "(なし)"}\n`
  );
}
function bugReportShotUrl(row) {
  return row.context && typeof row.context.shotUrl === "string" ? row.context.shotUrl : null;
}

// 画像をクリップボードに載せるには PNG でなければならない（Chrome は image/webp を受け付けない）。
// 保存してあるのは WebP なので、canvas を通して PNG に変換する。
async function fetchShotAsPngBlob(url) {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("画像の取得に失敗: " + res.status);
  const blob = await res.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0);
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG変換に失敗"))), "image/png");
  });
}

// 1件を「画像＋テキスト」でコピーする。画像が無ければテキストだけ。
// 【制約】クリップボードに載せられる画像は1枚だけなので、複数選択のコピーでは
// 画像そのものではなくURLをテキストに含める（bugReportToText が既に入れている）。
async function copyBugReport(row, btn) {
  const text = bugReportToText(row);
  const shotUrl = bugReportShotUrl(row);
  const done = (msg) => {
    const before = btn.textContent;
    btn.textContent = msg;
    setTimeout(() => (btn.textContent = before), 1800);
  };
  try {
    if (shotUrl && window.ClipboardItem) {
      const png = await fetchShotAsPngBlob(shotUrl);
      await navigator.clipboard.write([
        new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "image/png": png }),
      ]);
      done("コピーしました");
      return;
    }
    await navigator.clipboard.writeText(text);
    done(shotUrl ? "テキストのみコピー" : "コピーしました");
  } catch (err) {
    try {
      await navigator.clipboard.writeText(text);
      done("テキストのみコピー");
    } catch (e2) {
      done("コピー失敗");
      console.error("copyBugReport failed", err, e2);
    }
  }
}

// チェックした報告をまとめてコピーする（テキストのみ。画像はURLで入る）。
const selectedBugReports = new Map();
async function copySelectedBugReports(btn) {
  const rows = [...selectedBugReports.values()];
  const before = btn.textContent;
  if (rows.length === 0) {
    btn.textContent = "選択がありません";
    setTimeout(() => (btn.textContent = before), 1800);
    return;
  }
  rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const text = rows.map(bugReportToText).join("\n\n" + "-".repeat(60) + "\n\n");
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = `${rows.length}件をコピーしました`;
  } catch (err) {
    btn.textContent = "コピー失敗";
    console.error("copySelectedBugReports failed", err);
  }
  setTimeout(() => (btn.textContent = before), 2200);
}

function makeBugReportRow(row) {
  const tr = document.createElement("tr");
  const reporter = row.display_name || row.email || "(匿名/未ログイン)";

  // 複数選択用のチェックボックス（チェックした報告は「選択をまとめてコピー」の対象）。
  const pickTd = document.createElement("td");
  pickTd.style.width = "2rem";
  const pick = document.createElement("input");
  pick.type = "checkbox";
  pick.addEventListener("change", () => {
    if (pick.checked) selectedBugReports.set(row.id, row);
    else selectedBugReports.delete(row.id);
    updateBugReportSelectionLabel();
  });
  pickTd.appendChild(pick);
  tr.appendChild(pickTd);

  const cells = [formatDateTime(row.created_at), reporter, row.comment || "-"];
  cells.forEach((text, i) => {
    const td = document.createElement("td");
    td.textContent = text;
    // ユーザー報告「コメントが長いと表が横に伸びて『詳細』ボタンが画面外へ押し出され、
    // 横スクロールしないと押せない」。コメント列（index 2）だけ幅を制限して1行に省略表示し
    // （…）、全文はホバーのtitleと「詳細」ポップアップで見られるようにする。
    if (i === 2) {
      td.style.maxWidth = "40rem";
      td.style.overflow = "hidden";
      td.style.textOverflow = "ellipsis";
      td.style.whiteSpace = "nowrap";
      td.title = text;
    } else {
      td.style.whiteSpace = "nowrap";
    }
    tr.appendChild(td);
  });

  // 画像が添付されている報告は、一覧の時点で分かるようにサムネイルを出す
  // （クリックで原寸を別タブ表示。context.shotUrl は bug-report.js が入れている）。
  // ユーザー報告2026-09-01「詳細ボタンが画像にかかっちゃってます」: 画像列に固定幅を与え、
  // サムネイル側も max-width:100% で列の外へはみ出さないようにする。
  const shotUrl = bugReportShotUrl(row);
  const shotTd = document.createElement("td");
  shotTd.style.cssText = "width: 7rem; min-width: 7rem; padding: 0.3rem;";
  if (shotUrl) {
    const link = document.createElement("a");
    link.href = shotUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.title = "クリックで原寸表示";
    const img = document.createElement("img");
    img.src = shotUrl;
    img.alt = "添付スクリーンショット";
    img.loading = "lazy";
    img.style.cssText =
      "width: 6rem; max-width: 100%; height: auto; border-radius: 0.25rem; border: 1px solid #334155; display: block;";
    link.appendChild(img);
    shotTd.appendChild(link);
  } else {
    shotTd.textContent = "-";
  }
  tr.appendChild(shotTd);

  // 「詳細」: アクションログ・コンソールログ・状況を別ウィンドウで全文表示する。
  const detailTd = document.createElement("td");
  detailTd.style.cssText = "white-space: nowrap; padding-left: 0.5rem;";
  // ユーザー要望2026-09-01「画像とテキスト一括コピー」。画像はPNGに変換してテキストと
  // 一緒にクリップボードへ載せる（そのままチャットへ貼れる）。
  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.textContent = shotUrl ? "画像＋テキストをコピー" : "テキストをコピー";
  copyBtn.style.cssText = "margin-right: 0.4rem;";
  copyBtn.addEventListener("click", () => copyBugReport(row, copyBtn));
  detailTd.appendChild(copyBtn);
  const detailBtn = document.createElement("button");
  detailBtn.type = "button";
  detailBtn.textContent = "詳細";
  detailBtn.addEventListener("click", () => {
    const full = bugReportToText(row);
    const w = window.open("", "_blank");
    if (w) {
      if (shotUrl) {
        const shot = w.document.createElement("img");
        shot.src = shotUrl;
        shot.alt = "添付スクリーンショット";
        shot.style.cssText = "max-width: 100%; height: auto; display: block; margin: 1rem; border: 1px solid #ccc;";
        w.document.body.appendChild(shot);
      }
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

// 「選択をまとめてコピー」ボタン（テーブルの下）。選択件数をボタン自身に出す。
const bugReportCopySelectedBtn = document.getElementById("bug-report-copy-selected-btn");
function updateBugReportSelectionLabel() {
  if (!bugReportCopySelectedBtn) return;
  const n = selectedBugReports.size;
  bugReportCopySelectedBtn.textContent = n > 0 ? `選択した${n}件をまとめてコピー` : "選択をまとめてコピー";
  bugReportCopySelectedBtn.disabled = n === 0;
}
bugReportCopySelectedBtn?.addEventListener("click", () => copySelectedBugReports(bugReportCopySelectedBtn));
updateBugReportSelectionLabel();
