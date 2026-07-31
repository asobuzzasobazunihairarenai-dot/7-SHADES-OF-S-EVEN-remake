// デプロイ検知＆更新案内（ユーザー要望「プログラムが更新されたことを検知してブラウザ更新を
// 促せる？」）。デプロイのたびに中身が変わる version.json を定期取得し、ページ読み込み時の値と
// 変わっていたら「新しいバージョンがあります」バナーを出す。強制リロードはしない——対局の
// 途中で勝手に更新されると困るので、ユーザーが好きなタイミングで「更新する」を押す運用にする。
//
// version.json はコミットのたびに .git/hooks/pre-commit が自動更新する（＝デプロイのたびに必ず
// 値が変わる）。取得は必ず cache:"no-store" ＋クエリでキャッシュを回避する。

import { APP_VERSION } from "./app-version.js";

const CHECK_INTERVAL_MS = 60000; // 60秒ごと
// 基準は「今実行しているコードのバージョン」（APP_VERSION、JSと一緒にキャッシュされる）。
// 以前は「最初にversion.jsonを取得した値」を基準にしていたが、GitHub PagesはJSを短時間
// キャッシュする一方version.jsonはキャッシュ無視で取得するため、「古いJSが動いているのに
// version.jsonだけ最新」というズレの時に基準が最新版になってしまい、更新を検知できず
// バナーが出ないまま次の再検証で勝手に更新される、という不具合があった（ユーザー報告）。
// 実行中コード自身の版を基準にすれば、古いコードが動いている限り最新version.jsonと必ず
// 食い違うので確実に検知できる。
let loadedVersion = APP_VERSION;
let updateAvailable = false; // 新しいバージョンを検知済みか
let dismissed = false; // このセッションでユーザーがバナーを閉じたか（新バージョンが来たら解除）

// バナーを今出してよいかの判定（ユーザー要望「対局中は出さない、終われば出す」）。main.jsが
// setUpdateBannerGateで「対局中でない時だけtrue」を渡す。未設定なら常に出してよい扱い。
let canShowBanner = () => true;
export function setUpdateBannerGate(fn) {
  canShowBanner = typeof fn === "function" ? fn : () => true;
}

// 状況（対局の終了等）が変わった時にmain.jsから呼び、出せる状態なら出す。
export function reevaluateUpdateBanner() {
  maybeShowBanner();
}

function maybeShowBanner() {
  if (!updateAvailable || dismissed) return;
  if (document.getElementById("update-available-banner")) return;
  if (!canShowBanner()) return; // 対局中などは保留（後でreevaluateされた時に出す）
  showUpdateBanner();
}

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
  if (document.getElementById("update-available-banner")) return;
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
    // 一度閉じたらこのセッションでは再表示しない（対局終了のたびに何度も出て煩わしくならない
    // ように）。さらに新しいバージョンが来た時はcheck()側でdismissedを解除して再度出す。
    dismissed = true;
  });

  banner.appendChild(label);
  banner.appendChild(reloadBtn);
  banner.appendChild(closeBtn);
  document.body.appendChild(banner);
}

async function check() {
  const v = await fetchVersion();
  if (!v) return;
  if (v !== loadedVersion) {
    updateAvailable = true;
    dismissed = false; // 新バージョン検知時は、以前閉じていても改めて出せるようにする
    maybeShowBanner(); // 対局中なら保留され、reevaluateUpdateBanner()で後から出る
  }
}

export function initUpdateChecker() {
  check(); // 実行中コード(APP_VERSION)とサーバー最新版をすぐ照合
  setInterval(check, CHECK_INTERVAL_MS);
  // タブに戻ってきた時にも即チェック（放置後に戻ってきた人にすぐ気づかせる）。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check();
  });
}
