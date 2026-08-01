// ランキングの画面全体版（続き74）。ユーザー要望「ランキングを実装しましょう。勝率
// ランキング/勝利数ランキング/対戦数ランキングでどうだろう？」。fetchLeaderboard()
// （stats-profile.js、fetchStatsProfile()が元々内部で持っていた全プレイヤー集計を
// 流用して新設）が返す3種類のトップN（既定20件）をタブで切り替えて表示する。
// home-screen.js/profile-page.jsと同じ「画面全体のページ、モーダルではない」構造。

import { fetchLeaderboard } from "./stats-profile.js";
import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getOptionArea } from "./option-area.js";

let overlayEl = null;
let listEl = null;
let statusEl = null;
let activeTab = "winRate";
let infoBackdropEl = null;
let infoModalEl = null;

const TABS = [
  { key: "winRate", label: "勝率", valueLabel: (row) => `${row.winRate}%` },
  { key: "wins", label: "勝利数", valueLabel: (row) => `${row.winsCount}勝` },
  { key: "matches", label: "対戦数", valueLabel: (row) => `${row.matchesCount}戦` },
];

let cachedLeaderboard = null;

function buildRow(row, valueLabel) {
  const item = document.createElement("div");
  item.className = "ranking-page-row";
  if (row.rank <= 3) item.classList.add(`is-top${row.rank}`);
  // ユーザー要望「ランキングで自分がハイライト（点滅など）で強調されていると分かりやすい」。
  // fetchLeaderboardが返す myPlayerId と一致する行を強調する（CSSのis-selfで点滅ハイライト）。
  if (row.playerId && cachedLeaderboard && row.playerId === cachedLeaderboard.myPlayerId) {
    item.classList.add("is-self");
  }

  const rankEl = document.createElement("div");
  rankEl.className = "ranking-page-row-rank";
  rankEl.textContent = `${row.rank}`;
  item.appendChild(rankEl);

  if (row.avatarUrl) {
    const avatarEl = document.createElement("img");
    avatarEl.className = "ranking-page-row-avatar";
    avatarEl.src = row.avatarUrl;
    avatarEl.alt = "";
    item.appendChild(avatarEl);
  }

  const nameEl = document.createElement("div");
  nameEl.className = "ranking-page-row-name";
  nameEl.textContent = row.name;
  item.appendChild(nameEl);

  const valueEl = document.createElement("div");
  valueEl.className = "ranking-page-row-value";
  valueEl.textContent = valueLabel(row);
  item.appendChild(valueEl);

  return item;
}

// ユーザー要望「3つのランキング（勝率・勝利数・対戦数）を、タブ切替ではなく横に同時表示に。
// 横に余白がたくさんあるし、マイページ同様に枠も不要」。listEl の中に3カラムを並べる。
function renderTab() {
  if (!cachedLeaderboard || !listEl) return;
  listEl.innerHTML = "";
  for (const tab of TABS) {
    const col = document.createElement("div");
    col.className = "ranking-page-column";

    const heading = document.createElement("div");
    heading.className = "ranking-page-column-heading";
    heading.textContent = tab.label;
    col.appendChild(heading);

    const rows = cachedLeaderboard[tab.key];
    if (!rows || rows.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ranking-page-empty";
      empty.textContent = "まだ対象のプレイヤーがいません。";
      col.appendChild(empty);
    } else {
      for (const row of rows) col.appendChild(buildRow(row, tab.valueLabel));
    }
    listEl.appendChild(col);
  }
}

// ユーザー要望（続き77）「ランキングページにランキングルールをiマークで載せておいて
// ください」。同順位の決め方・勝率ランキングの参加基準（動的ボーダー）を説明する
// 簡易モーダル。他の簡易モーダルと同じcreateBackdrop/createModalCloseXパターン。
function closeInfoModal() {
  infoBackdropEl?.remove();
  infoBackdropEl = null;
  infoModalEl?.remove();
  infoModalEl = null;
}

function openInfoModal() {
  if (infoModalEl) return;
  infoBackdropEl = createBackdrop(closeInfoModal, { dim: true, zIndex: 1610 });
  infoModalEl = document.createElement("div");
  infoModalEl.id = "ranking-info-modal";

  const title = document.createElement("div");
  title.id = "ranking-info-modal-title";
  title.textContent = "ランキングのルール";
  infoModalEl.appendChild(title);

  const body = document.createElement("div");
  body.id = "ranking-info-modal-body";
  const border = cachedLeaderboard?.winRateBorder;
  const average = cachedLeaderboard?.winRateAverageMatches;
  const borderLine =
    typeof border === "number" && typeof average === "number"
      ? `現在の実対戦者の平均対戦数: ${average.toFixed(1)}回 → 参加基準(ボーダー): ${border.toFixed(1)}回を超える対戦数`
      : null;
  const lines = [
    "・勝率TOP3ランキングは、対戦経験が極端に少ないプレイヤーが数試合だけで上位に入ってしまわないように、実際に対戦したことがあるプレイヤーの「平均対戦数」の50%を超える対戦数のプレイヤーのみが対象になります。",
    ...(borderLine ? [borderLine] : []),
    "・同順位の決め方: ①勝率 → ②勝利数 → ③対戦数 の順で比較し、すべて同じ場合は同順位として併記します。",
  ];
  for (const line of lines) {
    const p = document.createElement("p");
    p.textContent = line;
    body.appendChild(p);
  }
  infoModalEl.appendChild(body);
  infoModalEl.appendChild(createModalCloseX(closeInfoModal));

  document.body.appendChild(infoModalEl);
}

function buildTabs() {
  const tabsEl = document.createElement("div");
  tabsEl.id = "ranking-page-tabs";
  for (const tab of TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "ranking-page-tab" + (tab.key === activeTab ? " is-active" : "");
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
      activeTab = tab.key;
      for (const el of tabsEl.children) el.classList.remove("is-active");
      btn.classList.add("is-active");
      renderTab();
    });
    tabsEl.appendChild(btn);
  }
  return tabsEl;
}

export async function openRankingPage(onClose) {
  if (overlayEl) return;
  overlayEl = document.createElement("div");
  overlayEl.id = "ranking-page";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "ranking-page-back";
  // ユーザー指摘（続き84）「戻る場所はホームとは限らない（オプションエリアの
  // アイコンから直接開く経路もある）ので単に『戻る』でいい」。
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeRankingPage();
    onClose?.();
  });
  overlayEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.id = "ranking-page-title";
  const titleText = document.createElement("span");
  titleText.textContent = "📊 ランキング";
  title.appendChild(titleText);

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.id = "ranking-page-info-btn";
  infoBtn.textContent = "ⓘ";
  infoBtn.title = "ランキングのルールを見る";
  infoBtn.addEventListener("click", openInfoModal);
  title.appendChild(infoBtn);

  overlayEl.appendChild(title);

  // ユーザー要望「枠は不要・3ランキングを横に同時表示」。囲う枠(#ranking-page-card)は撤去し、
  // 3カラムのリスト(#ranking-page-list、CSSでflex横並び)を直接ページに置く。タブも廃止。
  statusEl = document.createElement("div");
  statusEl.id = "ranking-page-status";
  statusEl.textContent = "読み込み中…";
  overlayEl.appendChild(statusEl);

  listEl = document.createElement("div");
  listEl.id = "ranking-page-list";
  overlayEl.appendChild(listEl);

  document.body.appendChild(overlayEl);
  // ユーザー要望（続き75）「ホーム画面やプロフ全画面でも上のオプションエリアのアイコン等は
  // 表示していてください」。full-screen-page-active共通クラス（style.css参照）。
  document.body.classList.add("full-screen-page-active");

  try {
    cachedLeaderboard = await fetchLeaderboard();
    statusEl.remove();
    statusEl = null;
    renderTab();
  } catch (err) {
    console.error("fetchLeaderboard failed", err);
    if (statusEl) statusEl.textContent = "ランキングの取得に失敗しました。通信環境を確認してください。";
  }
}

export function closeRankingPage() {
  closeInfoModal();
  overlayEl?.remove();
  overlayEl = null;
  listEl = null;
  statusEl = null;
  cachedLeaderboard = null;
  document.body.classList.remove("full-screen-page-active");
}

// ユーザー要望（続き77）「オプションエリアにランキングアイコンを追加したいです。
// ヘルプアイコンとマイページアイコンの間にお願いします」。my-page.js/help.jsと同じ
// 部品（icon-action-button.js）・同じ「アイコンのみ」見た目にする。option-areaから
// はいつでも開けるため、戻るボタンはこのページ自体を閉じるだけでよい（onCloseなし）。
export function initRankingIcon() {
  const btn = document.createElement("button");
  btn.id = "ranking-page-button";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/ranking.svg",
    tooltip: "ランキングを開きます",
  });
  captionEl.textContent = "ランキング";
  wireIconButtonClick(btn, {
    detailTitle: "ランキング",
    detailParagraphs: ["勝率・勝利数・対戦数のランキングを確認できます。"],
    onAction: () => openRankingPage(),
  });
  getOptionArea().appendChild(btn);
}
