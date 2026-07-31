// ホーム画面（続き73、ユーザー要望「HUERISE→タイトル画面→ホーム画面」）。
// オープニング画面でログインを終えた後、今までは直接「オンラインで続ける」パネル
// （部屋の作成/参加）へ進んでいたが、その手前にナビゲーションのハブとなる画面を
// 挟む。今回のスコープは「ハブ画面のみ先に（実装済みの2つは実際に開く、残りは
// 近日公開の見た目だけ）」——ユーザーが実装範囲を明示的に選んだ結果。
//
// 実装済み2枚（フレンドリーマッチ／ショップ）は、押すと既存のパネルをそのまま開く
// （online-ui.js/shop.jsの既存コード・見た目は一切変更しない）。それ以外の6枚は
// クリックしても何も始まらず、「近日公開」の軽いトースト表示だけを返す。

import { subscribe, getState } from "./state.js";
import { openOnlinePanel } from "./online-ui.js";
import { openShopPanel } from "./shop.js";
// ユーザー要望（続き74）「プロフィール／マイページは画面全体版にしましょう」への
// 対応で新設したページ（profile-page.js、中身はmy-page.jsの既存ロジックを再利用）。
import { openProfilePage } from "./profile-page.js";
// ユーザー要望「図鑑については山札一覧をとりあえず流用してください」。deck-viewer.js
// は元々「開発用ツール」と明記された既存のモーダルだが、「とりあえず」の指示のため
// 画面全体版には作り直さず、そのまま配線するだけに留めた。
import { openDeckViewer } from "./deck-viewer.js";
import { openCodexPage } from "./codex-page.js";
// ユーザー要望「ランキングを実装しましょう」への対応で新設したページ。
import { openRankingPage } from "./ranking-page.js";
// チュートリアルCPU戦（台本化された練習試合）。完全ローカル機能。
import { startTutorialBattle, registerTutorialHomeOpener } from "./tutorial-battle.js";
// お知らせ／更新情報（デプロイのたびに概要を追記）。
import { openChangelogModal, hasUnreadChangelog } from "./changelog.js";

let overlayEl = null;
let toastEl = null;
let toastTimer = null;

// ホーム背景画像(2MB超)を起動時に先読みしておく（ユーザー報告「ホームに入る時に一瞬黒い
// 画面が出る」の対策）。読み込み済みなら、ホームを開いた瞬間から背景画像が表示され暗転しない。
const homeBgPreload = new Image();
homeBgPreload.src = "assets/home-bg.png";

// icon: 画像が無い時のフォールバック絵文字。image: ユーザー作成のホーム画面アイコン
// （assets/home-icons/、枠なしでそのまま表示する）。
const TILES = [
  {
    icon: "🎓",
    image: "assets/home-icons/tutorial.webp",
    label: "チュートリアルCPU戦",
    status: "ready",
    onOpen: () => {
      // チュートリアル終了時にホーム画面へ戻れるよう、開くタイミングでopenHomeScreenを注入する。
      registerTutorialHomeOpener(() => openHomeScreen());
      closeHomeScreen();
      startTutorialBattle();
    },
  },
  { icon: "🤝", image: "assets/home-icons/friend-match.webp", label: "フレンドリーマッチ", status: "ready", onOpen: () => openOnlinePanel() },
  { icon: "🏆", image: "assets/home-icons/rank-match.webp", label: "フリーマッチ（ランク戦）", status: "soon" },
  { icon: "🛒", image: "assets/home-icons/shop.webp", label: "ショップ", status: "ready", onOpen: () => openShopPanel() },
  {
    icon: "📊",
    image: "assets/home-icons/ranking.webp",
    label: "ランキング",
    status: "ready",
    onOpen: () => {
      closeHomeScreen();
      openRankingPage(() => openHomeScreen());
    },
  },
  {
    icon: "👤",
    image: "assets/home-icons/my-page.webp",
    label: "プロフィール／マイページ",
    status: "ready",
    onOpen: () => {
      closeHomeScreen();
      openProfilePage(() => openHomeScreen());
    },
  },
  {
    icon: "📖",
    image: "assets/home-icons/rulebook.webp",
    label: "図鑑／ルールブック",
    status: "ready",
    onOpen: () => {
      // ユーザー要望「山札一覧＋ヘルプを全画面で並べて表示」。全画面の図鑑ページを開く。
      closeHomeScreen();
      openCodexPage(() => openHomeScreen());
    },
  },
  { icon: "📰", image: "assets/home-icons/news.webp", label: "お知らせ／更新情報", status: "ready", onOpen: () => openChangelogModal(), showNewIfUnread: () => hasUnreadChangelog() },
];

// 「近日公開」タイルを押した時の軽いトースト。モーダルを挟むほどの重さは不要
// なため、数秒で自動的に消える控えめな通知にする。
function showComingSoonToast(label) {
  if (!overlayEl) return;
  clearTimeout(toastTimer);
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.id = "home-screen-toast";
    overlayEl.appendChild(toastEl);
  }
  toastEl.textContent = `「${label}」は近日公開予定です。お楽しみに！`;
  toastEl.classList.add("is-visible");
  toastTimer = setTimeout(() => toastEl?.classList.remove("is-visible"), 2400);
}

function buildTile(tile) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = tile.status === "ready" ? "home-screen-tile" : "home-screen-tile is-soon";

  const iconEl = document.createElement("div");
  iconEl.className = "home-screen-tile-icon";
  if (tile.image) {
    // ユーザー作成のアイコン画像をそのまま表示（枠なし）。読み込み失敗時は絵文字へフォールバック。
    const img = document.createElement("img");
    img.src = tile.image;
    img.alt = "";
    img.className = "home-screen-tile-icon-img";
    img.addEventListener("error", () => {
      iconEl.textContent = tile.icon;
    });
    iconEl.appendChild(img);
  } else {
    iconEl.textContent = tile.icon;
  }
  btn.appendChild(iconEl);

  const labelEl = document.createElement("div");
  labelEl.className = "home-screen-tile-label";
  labelEl.textContent = tile.label;
  btn.appendChild(labelEl);

  if (tile.status === "soon") {
    const badge = document.createElement("div");
    badge.className = "home-screen-tile-badge";
    badge.textContent = "近日公開";
    btn.appendChild(badge);
  }

  // 未読お知らせがあれば「NEW」バッジ（ユーザー要望）。
  if (tile.showNewIfUnread && tile.showNewIfUnread()) {
    const newBadge = document.createElement("div");
    newBadge.className = "home-screen-tile-new-badge";
    newBadge.textContent = "NEW";
    btn.appendChild(newBadge);
  }

  btn.addEventListener("click", () => {
    if (tile.status !== "ready") {
      showComingSoonToast(tile.label);
      return;
    }
    tile.onOpen();
    // 開いた後は未読でなくなるので、このタイルのNEWバッジを消す（お知らせはモーダルで
    // ホーム画面の上に開くため、ホーム自体は残る）。
    if (tile.showNewIfUnread && !tile.showNewIfUnread()) {
      btn.querySelector(".home-screen-tile-new-badge")?.remove();
    }
  });
  return btn;
}

export function openHomeScreen() {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "home-screen";

  const title = document.createElement("div");
  title.id = "home-screen-title";
  title.textContent = "7 SHADES OF S:EVEN";
  overlayEl.appendChild(title);

  const subtitle = document.createElement("div");
  subtitle.id = "home-screen-subtitle";
  subtitle.textContent = "ホーム";
  overlayEl.appendChild(subtitle);

  const grid = document.createElement("div");
  grid.id = "home-screen-grid";
  for (const tile of TILES) grid.appendChild(buildTile(tile));
  overlayEl.appendChild(grid);

  document.body.appendChild(overlayEl);
  // ユーザー要望（続き75）「ホーム画面やプロフ全画面でも上のオプションエリアのアイコン等は
  // 表示していてください」。full-screen-page-active共通クラス（style.css参照）。
  document.body.classList.add("full-screen-page-active");
}

export function closeHomeScreen() {
  overlayEl?.remove();
  overlayEl = null;
  toastEl = null;
  clearTimeout(toastTimer);
  document.body.classList.remove("full-screen-page-active");
}

// ユーザー報告（続き74）「『ゲームを開始する』を押してもホーム画面が消えません」。
// online-ui.jsのinitOnlineUi()が部屋モーダル(#online-panel)を自動で閉じるのと
// 全く同じ「turnPlayerがnull→非nullに変わった瞬間だけを検知する」パターンを、
// ホーム画面自身にも独立して適用する（online-ui.js側の実装に依存せず、ホーム画面が
// 開いている間はどの経路でゲームが始まってもここで確実に閉じる）。
let wasGameStarted = false;
subscribe(() => {
  const started = Boolean(getState().turnPlayer);
  if (started && !wasGameStarted && overlayEl) closeHomeScreen();
  wasGameStarted = started;
});
