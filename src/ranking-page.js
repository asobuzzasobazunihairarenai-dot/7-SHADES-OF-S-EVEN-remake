// ランキングの画面全体版（続き74）。ユーザー要望「ランキングを実装しましょう。勝率
// ランキング/勝利数ランキング/対戦数ランキングでどうだろう？」。fetchLeaderboard()
// （stats-profile.js、fetchStatsProfile()が元々内部で持っていた全プレイヤー集計を
// 流用して新設）が返す3種類のトップN（既定20件）をタブで切り替えて表示する。
// home-screen.js/profile-page.jsと同じ「画面全体のページ、モーダルではない」構造。

import { fetchLeaderboard } from "./stats-profile.js";

let overlayEl = null;
let listEl = null;
let statusEl = null;
let activeTab = "winRate";

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

function renderTab() {
  if (!cachedLeaderboard) return;
  listEl.innerHTML = "";
  const tab = TABS.find((t) => t.key === activeTab);
  const rows = cachedLeaderboard[activeTab];
  if (!rows || rows.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ranking-page-empty";
    empty.textContent = "まだランキング対象のプレイヤーがいません。";
    listEl.appendChild(empty);
    return;
  }
  for (const row of rows) listEl.appendChild(buildRow(row, tab.valueLabel));
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
  backBtn.textContent = "← ホームへ戻る";
  backBtn.addEventListener("click", () => {
    closeRankingPage();
    onClose?.();
  });
  overlayEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.id = "ranking-page-title";
  title.textContent = "📊 ランキング";
  overlayEl.appendChild(title);

  const card = document.createElement("div");
  card.id = "ranking-page-card";
  overlayEl.appendChild(card);

  card.appendChild(buildTabs());

  statusEl = document.createElement("div");
  statusEl.id = "ranking-page-status";
  statusEl.textContent = "読み込み中…";
  card.appendChild(statusEl);

  listEl = document.createElement("div");
  listEl.id = "ranking-page-list";
  card.appendChild(listEl);

  document.body.appendChild(overlayEl);

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
  overlayEl?.remove();
  overlayEl = null;
  listEl = null;
  statusEl = null;
  cachedLeaderboard = null;
}
