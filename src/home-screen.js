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
import { syncFullScreenPageActive } from "./option-area.js";
import { openCodexPage } from "./codex-page.js";
// ユーザー要望「ランキングを実装しましょう」への対応で新設したページ。
import { openRankingPage } from "./ranking-page.js";
// チュートリアルCPU戦（台本化された練習試合）。完全ローカル機能。
import { startTutorialBattle, registerTutorialHomeOpener } from "./tutorial-battle.js";
// 案内人エイドスの物語チュートリアル（オンボーディング）のフロー制御。🎓タイルはこの入口へ。
import { startEidosStory } from "./eidos-story.js";
// ローカル1人用CPU戦（cpu-battle.js）はCPU選択時に動的import（下の openMatchChoiceModal 参照）。
// ※静的importにすると、cpu-battle.js が芋づる式に読み込む依存（game-setup.js→…）でモジュール
//   評価順が変わり、online.js↔phase-automation.js の循環参照が表面化して
//   「Cannot access 'phaseChangeEventListeners' before initialization」で起動時に真っ黒になった
//   （不具合2026-08-08）。必要時だけ読み込む動的importにして静的な依存辺を作らない。
// お知らせ／更新情報（デプロイのたびに概要を追記）。
import { openChangelogModal, hasUnreadChangelog } from "./changelog.js";
// CPU戦の強さ選択（対戦モード選択モーダルで選べるようにする。ユーザー要望2026-08-09）。
// cpu-battle-state.js は依存ゼロの葉モジュールなので静的importでも循環参照の心配はない
// （cpu-battle.js 本体の動的importとは別物）。選んだ値は端末に保存され、CPU戦開始時に効く。
import { getCpuDifficulty, setCpuDifficulty } from "./cpu-battle-state.js";

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
    label: "物語チュートリアル",
    status: "ready",
    onOpen: () => {
      // 案内人エイドスの物語オーケストレーターへ。初回は導入シーン→操作チュートリアルの順で進む。
      // 終了/中断時にホームへ戻れるよう openHomeScreen を渡す（startEidosStoryが内部で
      // registerTutorialHomeOpenerに配線する）。
      closeHomeScreen();
      startEidosStory({ openHome: () => openHomeScreen() });
    },
  },
  { icon: "🤝", image: "assets/home-icons/friend-match.webp", label: "CPUマッチ＆フレンドリーマッチ", status: "ready", onOpen: () => openMatchChoiceModal() },
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
    // マイデッキ編集はマイページ内の大ボタンへ移設（ユーザー要望2026-08-11）。ラベルもそれに合わせる。
    label: "マイページ／マイデッキ編集",
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

// ユーザー要望2026-08-08「ホームの『フレンドリーマッチ』を『CPUマッチ＆フレンドリーマッチ』に
// 変更し、押すとフレンドリーマッチかCPU戦かを選ぶ巨大モーダルを出す。その後は既存のモーダル/
// フローへ」。ここでその選択モーダルを出す。選んだ後はそれぞれ既存の導線に合流する:
//   ・フレンドリーマッチ → openOnlinePanel()（既存の部屋作成/参加パネル）
//   ・CPU戦 → opening-screen.js のCPU戦ボタンと同じ startCpuBattle→盤面表示→runCpuBattleSetup
let matchChoiceEl = null;
function closeMatchChoiceModal() {
  matchChoiceEl?.remove();
  matchChoiceEl = null;
}
function openMatchChoiceModal() {
  if (!overlayEl || matchChoiceEl) return;
  const back = document.createElement("div");
  back.id = "home-match-choice";

  const panel = document.createElement("div");
  panel.className = "home-match-choice-panel";

  const title = document.createElement("div");
  title.className = "home-match-choice-title";
  title.textContent = "対戦モードを選択";
  panel.appendChild(title);

  const options = document.createElement("div");
  options.className = "home-match-choice-options";

  const makeOption = (icon, label, desc, onPick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "home-match-choice-option";
    const iconEl = document.createElement("div");
    iconEl.className = "home-match-choice-option-icon";
    iconEl.textContent = icon;
    const labelEl = document.createElement("div");
    labelEl.className = "home-match-choice-option-label";
    labelEl.textContent = label;
    const descEl = document.createElement("div");
    descEl.className = "home-match-choice-option-desc";
    descEl.textContent = desc;
    btn.append(iconEl, labelEl, descEl);
    btn.addEventListener("click", onPick);
    options.appendChild(btn);
    return btn;
  };

  makeOption("🤝", "フレンドリーマッチ", "オンラインで対戦（部屋を作る／参加する）", () => {
    closeMatchChoiceModal();
    openOnlinePanel(); // 既存の部屋モーダルへ（ホームは背後に残り、対局開始で自動で閉じる）
  });
  makeOption("🤖", "CPU戦（1人用）", "この端末でCPUと対戦（ログイン不要）", async () => {
    closeMatchChoiceModal();
    closeHomeScreen();
    try {
      // 動的import（静的依存辺を作らないため。上の import 撤去のコメント参照）。
      const { startCpuBattle, runCpuBattleSetup } = await import("./cpu-battle.js");
      await startCpuBattle();
      // 盤面が見えてからセットアップ演出（ファースト配布→盤面配置）を始める。
      setTimeout(() => {
        runCpuBattleSetup().catch((err) => console.error("runCpuBattleSetup failed", err));
      }, 60);
    } catch (err) {
      console.error("CPU battle start failed", err);
    }
  });

  panel.appendChild(options);

  // CPU戦用の「CPUの強さ」選択（ユーザー要望2026-08-09）。ここで選ぶと即 setCpuDifficulty で
  // 端末に保存され、上の「CPU戦（1人用）」を押した時にその強さで始まる。フレンドリーマッチには
  // 影響しない（CPU戦専用の設定）。基本設定のセグメント（options-menu.js buildCpuDifficultyRow）
  // と同じ選択肢・同じ保存先を使うので、どちらで変えても一貫する。
  const diff = document.createElement("div");
  diff.className = "home-match-choice-difficulty";
  const diffLabel = document.createElement("div");
  diffLabel.className = "home-match-choice-difficulty-label";
  diffLabel.textContent = "🤖 CPUの強さ（CPU戦のみ）";
  diff.appendChild(diffLabel);
  const seg = document.createElement("div");
  seg.className = "home-match-choice-segment";
  const segButtons = [];
  const refreshSeg = () => {
    const cur = getCpuDifficulty();
    for (const b of segButtons) b.classList.toggle("is-selected", b.dataset.v === cur);
  };
  for (const [v, text] of [
    ["rookie", "新人"],
    ["intermediate", "中級"],
    ["advanced", "上級"],
    ["master", "最強"],
  ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-match-choice-segment-btn";
    b.dataset.v = v;
    b.textContent = text;
    b.addEventListener("click", () => {
      setCpuDifficulty(v);
      refreshSeg();
    });
    seg.appendChild(b);
    segButtons.push(b);
  }
  diff.appendChild(seg);
  const diffHint = document.createElement("div");
  diffHint.className = "home-match-choice-difficulty-hint";
  diffHint.textContent = "新人＝ランダム／中級・上級＝賢い思考／最強＝伏せカードののぞき見あり";
  diff.appendChild(diffHint);
  refreshSeg();
  panel.appendChild(diff);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "home-match-choice-cancel";
  cancel.textContent = "← 戻る";
  cancel.addEventListener("click", closeMatchChoiceModal);
  panel.appendChild(cancel);

  // 背景クリックでも閉じる（パネル内クリックは伝播させない）。
  back.addEventListener("click", closeMatchChoiceModal);
  panel.addEventListener("click", (e) => e.stopPropagation());

  back.appendChild(panel);
  overlayEl.appendChild(back);
  matchChoiceEl = back;
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
  syncFullScreenPageActive();
}

export function closeHomeScreen() {
  overlayEl?.remove();
  overlayEl = null;
  toastEl = null;
  matchChoiceEl = null; // overlayElごと消えるので参照だけリセット
  clearTimeout(toastTimer);
  syncFullScreenPageActive();
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
