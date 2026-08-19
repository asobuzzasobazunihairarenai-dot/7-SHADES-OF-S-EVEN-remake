// デプロイ検知＆更新案内（ユーザー要望「プログラムが更新されたことを検知してブラウザ更新を
// 促せる？」）。デプロイのたびに中身が変わる version.json を定期取得し、ページ読み込み時の値と
// 変わっていたら「新しいバージョンがあります」バナーを出す。強制リロードはしない——対局の
// 途中で勝手に更新されると困るので、ユーザーが好きなタイミングで「更新する」を押す運用にする。
//
// version.json はコミットのたびに .git/hooks/pre-commit が自動更新する（＝デプロイのたびに必ず
// 値が変わる）。取得は必ず cache:"no-store" ＋クエリでキャッシュを回避する。

import { APP_VERSION } from "./app-version.js";
import { markCleanExit } from "./crash-blackbox.js";

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
let latestVersion = null; // サーバー側の最新版（バナーの「更新」対象。更新試行の記録に使う）
let dismissed = false; // このセッションでユーザーがバナーを閉じたか（新バージョンが来たら解除）

const UPDATE_ATTEMPT_KEY = "so7-update-attempt"; // 直近に「更新する」で目指した版（sessionStorage）

// 直前の更新試行が空振りだったか（＝「更新する」を押してリロードしたのに、まだ古いコードが
// 動いている）。GitHub Pagesは全アセットをmax-age=600でキャッシュするため、環境によっては
// cache:"reload"での取り直しでも反映されないことがある。その場合だけハードリフレッシュを案内する。
function priorUpdateAttemptFailed() {
  try {
    const attempted = sessionStorage.getItem(UPDATE_ATTEMPT_KEY);
    return !!attempted && attempted !== APP_VERSION;
  } catch (e) {
    return false;
  }
}

// 今動いているコードが、前回目指した版に追いついていたら記録を消す（更新成功）。
function clearAttemptIfCaughtUp() {
  try {
    const attempted = sessionStorage.getItem(UPDATE_ATTEMPT_KEY);
    if (attempted && attempted === APP_VERSION) sessionStorage.removeItem(UPDATE_ATTEMPT_KEY);
  } catch (e) {
    /* sessionStorage不可の環境では何もしない */
  }
}

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

// 「更新する」の本体。GitHub Pagesはindex.html・JS・CSSを全てmax-age=600でキャッシュするため、
// 普通のlocation.reload()（ソフト再読み込み）ではサブリソース（JS）が古いキャッシュから
// 再利用され、コードが更新されない（＝バナーが延々と再表示される。ユーザー報告）。そこで
// 再読み込み前に、今読み込まれている同一オリジンのJS/CSS＋index.htmlを cache:"reload" で
// 取り直してHTTPキャッシュを最新へ更新してから reload する。これで通常はハードリフレッシュ
// 無しで反映される。
async function refreshCachedAssets() {
  const urls = new Set();
  try {
    for (const entry of performance.getEntriesByType("resource")) {
      const name = (entry.name || "").split("#")[0];
      if (!name.startsWith(location.origin)) continue;
      if (entry.initiatorType === "script" || entry.initiatorType === "link" || /\.(?:m?js|css)(?:\?|$)/.test(name)) {
        urls.add(name);
      }
    }
  } catch (e) {
    /* performance API不可なら下のindex.htmlだけ更新して続行 */
  }
  urls.add(location.href.split("#")[0].split("?")[0]); // index.html自身
  await Promise.all([...urls].map((u) => fetch(u, { cache: "reload" }).catch(() => {})));
}

async function applyUpdate(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "更新中…";
  }
  try {
    if (latestVersion) sessionStorage.setItem(UPDATE_ATTEMPT_KEY, latestVersion);
  } catch (e) {
    /* sessionStorage不可でも続行 */
  }
  try {
    await refreshCachedAssets();
  } catch (e) {
    /* 取り直しに失敗してもreloadは試みる */
  }
  markCleanExit(); // 更新リロードは意図的＝ブラックボックスに「不審な落下」と誤検知させない。
  location.reload();
}

function showUpdateBanner() {
  if (document.getElementById("update-available-banner")) return;
  const banner = document.createElement("div");
  banner.id = "update-available-banner";

  const row = document.createElement("div");
  row.className = "update-banner-row";

  const label = document.createElement("span");
  label.className = "update-banner-label";
  label.textContent = "🔄 新しいバージョンがあります";

  const reloadBtn = document.createElement("button");
  reloadBtn.type = "button";
  reloadBtn.className = "update-banner-reload";
  reloadBtn.textContent = "更新する";
  reloadBtn.addEventListener("click", () => applyUpdate(reloadBtn));

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

  row.appendChild(label);
  row.appendChild(reloadBtn);
  row.appendChild(closeBtn);
  banner.appendChild(row);

  // 前回「更新する」を押したのに反映されなかった場合だけ、ハードリフレッシュの手順を添える
  // （ユーザー要望「戸惑わないようにハードリフレッシュの案内も入れる」）。通常は出さない。
  if (priorUpdateAttemptFailed()) {
    banner.classList.add("has-hint");
    const hint = document.createElement("div");
    hint.className = "update-banner-hint";
    const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || "");
    const combo = isMac ? "⌘ + Shift + R" : "Ctrl + Shift + R";
    hint.textContent = `うまく更新されない場合は、キーボードで ${combo} を押して再読み込みしてください。`;
    banner.appendChild(hint);
  }

  document.body.appendChild(banner);
}

// isInitial: ページ読み込み直後の初回チェックか。初回はまだタイトル画面で失うものが無いため、
// 新版を検知したら「更新する」を押させずに自動で1回だけ更新してよい（＝再訪ユーザーが常に最新で
// 始められる。ユーザー要望「バージョン付き等で常に最新が届くように」への、無ビルドでの対応）。
async function check(isInitial = false) {
  const v = await fetchVersion();
  if (!v) return;
  latestVersion = v;
  if (v !== loadedVersion) {
    updateAvailable = true;
    dismissed = false; // 新バージョン検知時は、以前閉じていても改めて出せるようにする
    // 自動更新の条件: 初回（読み込み直後）＆ 対局中でない（canShowBanner）＆ 直前の更新試行が
    // 空振りでない（priorUpdateAttemptFailed=false）。空振り済みなら自動でループさせず、
    // バナー＋ハードリフレッシュ案内に委ねる。既存のUPDATE_ATTEMPT_KEYで「自動更新は最大1回」に
    // 制限され、applyUpdate内でmarkCleanExit()するのでブラックボックスに落下と誤検知されない。
    if (isInitial && canShowBanner() && !priorUpdateAttemptFailed()) {
      applyUpdate();
      return;
    }
    maybeShowBanner(); // 対局中なら保留され、reevaluateUpdateBanner()で後から出る
  }
}

export function initUpdateChecker() {
  // スモークテスト等の自動テスト環境では自動リロードが検査を中断するため無効化できる
  // （続き231。本番では誰も設定しないフラグ）。dev で version.json と app-version.js が一時的に
  // ズレている時、check(true) の自動リロードがヘッドレスの評価を破壊するのを防ぐ。
  try {
    if (localStorage.getItem("so7-disable-update-checker") === "1") return;
  } catch (e) {}
  // リソース計測バッファを広げておく（既定250だと画像等で溢れてJSモジュールの記録が
  // 取りこぼされ得るため）。refreshCachedAssets()が全JS/CSSを確実に取り直せるようにする保険。
  try {
    performance.setResourceTimingBufferSize(1000);
  } catch (e) {
    /* 非対応環境は無視 */
  }
  clearAttemptIfCaughtUp(); // 前回の更新が成功していれば試行記録を消す（＝ハード案内を出さない）
  check(true); // 初回＝読み込み直後。新版なら（対局中でなければ）自動で最新へ更新する
  setInterval(() => check(false), CHECK_INTERVAL_MS); // 以降はバナーのみ（勝手に画面を切り替えない）
  // タブに戻ってきた時にも即チェック（放置後に戻ってきた人にすぐ気づかせる）。バナー提示のみ。
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) check(false);
  });
}
