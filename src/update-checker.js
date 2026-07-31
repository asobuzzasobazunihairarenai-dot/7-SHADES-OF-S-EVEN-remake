// デプロイ検知＆更新案内（ユーザー要望「プログラムが更新されたことを検知してブラウザ更新を
// 促せる？」）。デプロイのたびに中身が変わる version.json を定期取得し、ページ読み込み時の値と
// 変わっていたら「新しいバージョンがあります」バナーを出す。強制リロードはしない——対局の
// 途中で勝手に更新されると困るので、ユーザーが好きなタイミングで「更新する」を押す運用にする。
//
// version.json はコミットのたびに .git/hooks/pre-commit が自動更新する（＝デプロイのたびに必ず
// 値が変わる）。取得は必ず cache:"no-store" ＋クエリでキャッシュを回避する。

const CHECK_INTERVAL_MS = 60000; // 60秒ごと
let loadedVersion = null; // ページを開いた時点のバージョン（最初の取得で確定）
let bannerShown = false;

async function fetchVersion() {
  try {
    const res = await fetch(`version.json?cb=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.v ?? null;
  } catch (err) {
    return null; // 通信失敗時は黙ってスキップ（次の間隔で再試行）
  }
}

function showUpdateBanner() {
  if (bannerShown || document.getElementById("update-available-banner")) return;
  bannerShown = true;
  const banner = document.createElement("div");
  banner.id = "update-available-banner";

  const label = document.createElement("span");
  label.className = "update-banner-label";
  label.textContent = "🔄 新しいバージョンがあります";

  const reloadBtn = document.createElement("button");
  reloadBtn.type = "button";
  reloadBtn.className = "update-banner-reload";
  reloadBtn.textContent = "更新する";
  reloadBtn.addEventListener("click", () => location.reload());

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "update-banner-close";
  closeBtn.setAttribute("aria-label", "閉じる");
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", () => {
    banner.remove();
    // 閉じても、次にバージョンがさらに変わったらまた出せるようにフラグは戻す。
    bannerShown = false;
  });

  banner.appendChild(label);
  banner.appendChild(reloadBtn);
  banner.appendChild(closeBtn);
  document.body.appendChild(banner);
}

async function check() {
  const v = await fetchVersion();
  if (!v) return;
  if (loadedVersion === null) {
    loadedVersion = v; // 初回＝このセッションの基準バージョン
    return;
  }
  if (v !== loadedVersion) showUpdateBanner();
}

export function initUpdateChecker() {
  check(); // 基準バージョンを確定
  setInterval(check, CHECK_INTERVAL_MS);
  // タブに戻ってきた時にも即チェック（放置後に戻ってきた人にすぐ気づかせる）。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
}
