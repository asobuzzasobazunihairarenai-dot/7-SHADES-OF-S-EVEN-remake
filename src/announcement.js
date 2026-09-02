// 全員へのお知らせ（ユーザー要望2026-09-02「テスターに連絡したい。メールは送れないので、
// まずはアプリ内で確実に届く形から」）。管理者が管理者ダッシュボードから投稿した最新の1件を、
// ホーム画面を開いた時に一度だけモーダルで出す。
//
// 既読はこの端末に保存する（localStorage、お知らせのidを覚えるだけ）。サーバーに既読を
// 持たせないのは、「誰が読んだか」を集める必要が無く、端末ごとに1回見えれば目的を果たすため。
// より新しいお知らせが投稿されればidが上がるので、また1回だけ出る。
import { fetchLatestAnnouncement } from "./online.js";
import { createBackdrop } from "./ui-helpers.js";
import { t } from "./ui-text.js";

const SEEN_KEY = "so7-announcement-seen-id";

function seenId() {
  try {
    return parseInt(localStorage.getItem(SEEN_KEY), 10) || 0;
  } catch (err) {
    return 0;
  }
}
function markSeen(id) {
  try {
    localStorage.setItem(SEEN_KEY, String(id));
  } catch (err) {
    /* 使えない環境でも致命的ではない（毎回出るだけ） */
  }
}

// ホーム画面を開いた時に呼ぶ。未読のお知らせがあれば出す。取得に失敗したら何もしない
// （未ログイン・SQL未実行・通信エラー。アプリの動作は妨げない）。
export async function maybeShowAnnouncement() {
  let a = null;
  try {
    a = await fetchLatestAnnouncement();
  } catch (err) {
    return;
  }
  if (!a || !a.id || a.id <= seenId()) return;
  markSeen(a.id);
  showAnnouncementModal(a);
}

export function showAnnouncementModal(a) {
  if (document.getElementById("announcement-modal")) return;
  const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 2700 });
  const modal = document.createElement("div");
  modal.id = "announcement-modal";

  const badge = document.createElement("div");
  badge.className = "announcement-badge";
  badge.textContent = t("ann.badge");
  modal.appendChild(badge);

  const title = document.createElement("div");
  title.className = "announcement-title";
  title.textContent = a.title || "";
  modal.appendChild(title);

  const body = document.createElement("div");
  body.className = "announcement-body";
  // 改行をそのまま活かす（管理者が書いた文章の見た目を保つ）。HTMLは入れない（textContent）。
  body.textContent = a.body || "";
  modal.appendChild(body);

  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "announcement-ok";
  okBtn.textContent = t("ann.ok");
  okBtn.addEventListener("click", close);
  modal.appendChild(okBtn);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
