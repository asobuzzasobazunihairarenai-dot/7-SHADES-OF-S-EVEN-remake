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
import { t } from "./ui-text.js";
import { onLangChange } from "./i18n.js";
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
// ランク戦フェーズ4/6: 現ランクをホームに常時表示（称号バッジ静止版＋七色ゲージ）。
import { getSelfRank, pollRanked, getCurrentUser } from "./online.js";
import { rankName } from "./rank-badge.js";
import { buildRankShowcase } from "./rank-showcase.js";
import { showRankExplanationModal } from "./rank-explain.js";
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
import { getCpuDifficulty, setCpuDifficulty, getCpuPlayerCount, setCpuPlayerCount } from "./cpu-battle-state.js";
import { maybeShowAlphaNotice } from "./alpha-notice.js";

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
    labelKey: "home.tile.tutorial",
    status: "ready",
    onOpen: () => {
      // 案内人エイドスの物語オーケストレーターへ。初回は導入シーン→操作チュートリアルの順で進む。
      // 終了/中断時にホームへ戻れるよう openHomeScreen を渡す（startEidosStoryが内部で
      // registerTutorialHomeOpenerに配線する）。
      closeHomeScreen();
      startEidosStory({ openHome: () => openHomeScreen() });
    },
  },
  { icon: "🤝", image: "assets/home-icons/friend-match.webp", labelKey: "home.tile.match", status: "ready", onOpen: () => openMatchChoiceModal() },
  {
    icon: "🏆",
    image: "assets/home-icons/rank-match.webp",
    labelKey: "home.tile.ranked",
    status: "ready",
    showWaitingCount: true, // 続き162: 今何人が対戦相手を募集中かをタイルに表示（コールドスタート対策）
    onOpen: async () => {
      // ランク戦のマッチメイキング（フェーズ2b、ranked-match.js）。cpu-battle.jsと同じく
      // 動的importで静的な依存辺を作らない（循環参照の回避）。ホームは閉じ、キャンセル/失敗時は
      // openHomeScreen()で戻す（ranked-match.js側にonExitとして注入）。
      closeHomeScreen();
      try {
        const { startRankedMatchmaking } = await import("./ranked-match.js");
        await startRankedMatchmaking(() => openHomeScreen());
      } catch (err) {
        console.error("ranked matchmaking start failed", err);
        openHomeScreen();
      }
    },
  },
  { icon: "🛒", image: "assets/home-icons/shop.webp", labelKey: "home.tile.shop", status: "ready", onOpen: () => openShopPanel() },
  {
    icon: "📊",
    image: "assets/home-icons/ranking.webp",
    labelKey: "home.tile.ranking",
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
    labelKey: "home.tile.mypage",
    status: "ready",
    onOpen: () => {
      closeHomeScreen();
      openProfilePage(() => openHomeScreen());
    },
  },
  {
    icon: "📖",
    image: "assets/home-icons/rulebook.webp",
    labelKey: "home.tile.codex",
    status: "ready",
    onOpen: () => {
      // ユーザー要望「山札一覧＋ヘルプを全画面で並べて表示」。全画面の図鑑ページを開く。
      closeHomeScreen();
      openCodexPage(() => openHomeScreen());
    },
  },
  { icon: "📰", image: "assets/home-icons/news.webp", labelKey: "home.tile.news", status: "ready", onOpen: () => openChangelogModal(), showNewIfUnread: () => hasUnreadChangelog() },
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
  toastEl.textContent = t("home.comingSoon", { label });
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
  title.textContent = t("home.matchChoice.title");
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

  makeOption("🤝", t("home.matchChoice.friendly"), t("home.matchChoice.friendlyDesc"), () => {
    closeMatchChoiceModal();
    openOnlinePanel(); // 既存の部屋モーダルへ（ホームは背後に残り、対局開始で自動で閉じる）
  });
  makeOption("🤖", t("home.matchChoice.cpu"), t("home.matchChoice.cpuDesc"), async () => {
    closeMatchChoiceModal();
    closeHomeScreen();
    try {
      // 動的import（静的依存辺を作らないため。上の import 撤去のコメント参照）。
      const { startCpuBattle, runCpuBattleSetup } = await import("./cpu-battle.js");
      const count = getCpuPlayerCount();
      await startCpuBattle(count);
      // 盤面が見えてからセットアップ演出（ファースト配布→盤面配置）を始める。
      setTimeout(() => {
        runCpuBattleSetup({ count }).catch((err) => console.error("runCpuBattleSetup failed", err));
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
  diffLabel.textContent = t("home.matchChoice.difficultyLabel");
  diff.appendChild(diffLabel);
  const seg = document.createElement("div");
  seg.className = "home-match-choice-segment";
  const segButtons = [];
  const refreshSeg = () => {
    const cur = getCpuDifficulty();
    for (const b of segButtons) b.classList.toggle("is-selected", b.dataset.v === cur);
  };
  for (const [v, key] of [
    ["rookie", "cpu.diff.rookie"],
    ["intermediate", "cpu.diff.intermediate"],
    ["advanced", "cpu.diff.advanced"],
    ["master", "cpu.diff.master"],
  ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-match-choice-segment-btn";
    b.dataset.v = v;
    b.textContent = t(key);
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
  diffHint.textContent = t("home.matchChoice.difficultyHint");
  diff.appendChild(diffHint);
  refreshSeg();
  panel.appendChild(diff);

  // CPU戦の人数選択（2〜4人。続き226）。あなた＋残りがCPU（2人=あなた+CPU1体、3人=+2体、4人=+3体）。
  const cnt = document.createElement("div");
  cnt.className = "home-match-choice-difficulty";
  const cntLabel = document.createElement("div");
  cntLabel.className = "home-match-choice-difficulty-label";
  cntLabel.textContent = t("home.matchChoice.countLabel");
  cnt.appendChild(cntLabel);
  const cntSeg = document.createElement("div");
  cntSeg.className = "home-match-choice-segment";
  const cntButtons = [];
  const refreshCnt = () => {
    const cur = getCpuPlayerCount();
    for (const b of cntButtons) b.classList.toggle("is-selected", Number(b.dataset.v) === cur);
  };
  for (const [v, key] of [
    [2, "cpu.count.2"],
    [3, "cpu.count.3"],
    [4, "cpu.count.4"],
  ]) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "home-match-choice-segment-btn";
    b.dataset.v = String(v);
    b.textContent = t(key);
    b.addEventListener("click", () => {
      setCpuPlayerCount(v);
      refreshCnt();
    });
    cntSeg.appendChild(b);
    cntButtons.push(b);
  }
  cnt.appendChild(cntSeg);
  const cntHint = document.createElement("div");
  cntHint.className = "home-match-choice-difficulty-hint";
  cntHint.textContent = t("home.matchChoice.countHint");
  cnt.appendChild(cntHint);
  refreshCnt();
  panel.appendChild(cnt);

  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "home-match-choice-cancel";
  cancel.textContent = t("common.back");
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
  labelEl.textContent = t(tile.labelKey);
  btn.appendChild(labelEl);

  if (tile.status === "soon") {
    const badge = document.createElement("div");
    badge.className = "home-screen-tile-badge";
    badge.textContent = t("home.comingSoonBadge");
    btn.appendChild(badge);
  }

  // 未読お知らせがあれば「NEW」バッジ（ユーザー要望）。
  if (tile.showNewIfUnread && tile.showNewIfUnread()) {
    const newBadge = document.createElement("div");
    newBadge.className = "home-screen-tile-new-badge";
    newBadge.textContent = t("home.newBadge");
    btn.appendChild(newBadge);
  }

  // 続き162: ランク戦タイルに「今◯人が対戦相手を募集中」を表示（コールドスタート対策）。
  // 既定は非表示。openHomeScreen の待機人数ポーラー(updateRankedWaitingBadge)が更新する。
  if (tile.showWaitingCount) {
    const waitBadge = document.createElement("div");
    waitBadge.className = "home-screen-tile-waiting-badge";
    waitBadge.style.display = "none";
    btn.appendChild(waitBadge);
  }

  btn.addEventListener("click", () => {
    if (tile.status !== "ready") {
      showComingSoonToast(t(tile.labelKey));
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
  subtitle.textContent = t("home.subtitle");
  overlayEl.appendChild(subtitle);

  // 現ランク表示（ログイン済みかつランクデータがある時だけ非同期で出す）。押すとランキングへ。
  const rankArea = document.createElement("div");
  rankArea.id = "home-screen-rank";
  rankArea.style.display = "none";
  overlayEl.appendChild(rankArea);
  renderHomeRank(rankArea);

  const grid = document.createElement("div");
  grid.id = "home-screen-grid";
  for (const tile of TILES) grid.appendChild(buildTile(tile));
  overlayEl.appendChild(grid);

  document.body.appendChild(overlayEl);
  // ユーザー要望（続き75）「ホーム画面やプロフ全画面でも上のオプションエリアのアイコン等は
  // 表示していてください」。full-screen-page-active共通クラス（style.css参照）。
  syncFullScreenPageActive();
  startRankedWaitingPoll(); // ランク戦タイルの待機人数表示（続き162）
  // ユーザー要望2026-09-01「ホーム画面に行く時に、現在このアプリはα版です、デバッグに
  // 協力してください的なモーダルを素人にもわかりやすく出したい」。アプリを開くたびに1回だけ
  // 出す（ホームへ戻るたびには出さない）。詳しくは alpha-notice.js を参照。
  maybeShowAlphaNotice();
}

// ホーム画面の現ランク表示を非同期で描画する。未ログイン（getSelfRankがundefined）や
// ランクSQL未デプロイ（RPCエラー）の時は例外を握りつぶして非表示のままにする（graceful）。
async function renderHomeRank(container) {
  let info = null;
  try {
    info = await getSelfRank();
  } catch {
    return; // RPC未デプロイ等 → 非表示のまま
  }
  // 描画中にホーム画面が閉じられていたら何もしない。
  if (!info || !overlayEl || !overlayEl.contains(container)) return;
  container.innerHTML = "";
  const label = document.createElement("div");
  label.className = "home-rank-label";
  label.textContent = t("home.rankLabel");
  container.appendChild(label);
  // バッジ＋U型ゲージ＋宝石の合成表示（rank-showcase.js）を左上にコンパクトに出す（大きな
   // グリッドと重ならないよう控えめに。位置・サイズは管理者モードで調整可）。
  container.appendChild(
    buildRankShowcase(info.rank ?? 0, info.gauge ?? 0, info.legend_points ?? 0, { scale: 0.4 })
  );
  const nm = document.createElement("div");
  nm.className = "home-rank-name";
  nm.textContent = rankName(info.rank ?? 0);
  container.appendChild(nm);
  container.style.display = "flex";
  // クリックでランク戦の説明モーダルを開く（ユーザー要望2026-08-17）。以前は勝率等のランキング
  // 画面へ遷移していたが、それは戦績システムの「順位」でランク戦の段位とは別物のため紛らわしく、
  // 一旦「表示専用」にしていた。今回、ランクの仕組みを説明するモーダルへの入口にした。
  container.style.cursor = "pointer";
  container.title = t("home.rankAboutTitle");
  container.onclick = () => showRankExplanationModal();
}

// 続き162: ランク戦タイルの「今◯人が対戦相手を募集中」表示。ホーム画面が開いている間だけ、
// 待機人数を定期取得してタイルのバッジを更新する（コールドスタート対策。入る前に状況が見える）。
let rankedWaitTimer = null;
async function updateRankedWaitingBadge() {
  if (!overlayEl) return;
  const badge = overlayEl.querySelector(".home-screen-tile-waiting-badge");
  if (!badge) return;
  const user = await getCurrentUser();
  if (!user) {
    badge.style.display = "none";
    return;
  }
  let res;
  try {
    res = await pollRanked();
  } catch {
    return;
  }
  if (!overlayEl || !res) return;
  const count = res.waiting_count || 0;
  if (count >= 1) {
    badge.textContent = t("home.waitingBadge", { count });
    badge.style.display = "";
  } else {
    badge.style.display = "none";
  }
}
function startRankedWaitingPoll() {
  stopRankedWaitingPoll();
  void updateRankedWaitingBadge();
  rankedWaitTimer = setInterval(() => void updateRankedWaitingBadge(), 15000);
}
function stopRankedWaitingPoll() {
  if (rankedWaitTimer) {
    clearInterval(rankedWaitTimer);
    rankedWaitTimer = null;
  }
}

export function closeHomeScreen() {
  stopRankedWaitingPoll();
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

// 言語切替（options-menuの言語セレクタ）でホーム画面が開いていれば作り直す（開いていない時は
// 次に開いた時点でt()が新しい言語で組む）。マッチ選択モーダルは開き直さない（開いていれば
// closeHomeScreenでoverlayごと消えるが、稀なケースなので許容）。
onLangChange(() => {
  if (overlayEl) {
    closeHomeScreen();
    openHomeScreen();
  }
});
