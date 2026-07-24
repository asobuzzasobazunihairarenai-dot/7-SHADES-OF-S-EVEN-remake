// ユーザー要望「マイページを新設したい。アバター変更・現アバター・プレイヤー名・
// 対戦数・勝利数・勝率・勝率順位・対戦数順位・登録年月日などを載せたい」への対応。
// 画面右上のオプションアイコンの隣の人マークアイコン、または左下の巨大アバターの
// クリックで開く（main.js側で配線）。

import { getCurrentUser, getSelfSeat, syncMyStatsProfile } from "./online.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { fetchStatsProfile } from "./stats-profile.js";
import { openStatsPlayerLinkModal } from "./stats-player-link.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { openOnlinePanel } from "./online-ui.js";
import { getShopCompletionStats } from "./shop-content.js";

// main.jsのopenAvatarPicker()はmain.js内のローカル関数（circular importを避けるための
// 既存パターン、admin.js等と同じ）。main.js側からregisterAvatarPickerHelper()で
// 注入してもらう。
let avatarPickerFn = null;
export function registerAvatarPickerHelper(fn) {
  avatarPickerFn = fn;
}

function formatDate(isoString) {
  if (!isoString) return "-";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

// ユーザー要望「アバターやプレイヤー名を変更した時、戦績システムにも反映できるように、
// マイページに戦績システムと同期するためのボタンを追加してください。iボタンで説明も
// 追加してください」への対応。avatar-upload.jsのアップロード注意書きボタンと同じ
// 「小さいiボタン→openIconDetailModal」パターンを踏襲する。
function buildStatsSyncRow(seat) {
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin-top: 0.8rem;";

  const row = document.createElement("div");
  row.style.cssText = "display: flex; align-items: center; gap: 0.4rem;";

  const syncBtn = document.createElement("button");
  syncBtn.type = "button";
  syncBtn.textContent = "🔄 戦績システムと同期する";
  syncBtn.style.cssText =
    "padding: 0.4rem 0.9rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); " +
    "border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.8rem;";

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "opening-login-info-btn";
  infoBtn.textContent = "i";
  infoBtn.title = "同期についての説明";
  infoBtn.addEventListener("click", () => {
    openIconDetailModal("戦績システムとの同期について", [
      "アバターやプレイヤー名を戦績管理システム（対戦記録・ランキングを管理する姉妹サイト）側にも反映します。",
      "通常は対局を開始した時・勝利した時に自動的に同期されますが、今すぐ反映したい場合はこのボタンを押してください。",
      "戦績管理システムのプレイヤーと連携済みのアカウントでのみ使えます。",
    ]);
  });

  const statusEl = document.createElement("div");
  statusEl.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-top: 0.3rem; min-height: 1.2em;";

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    statusEl.textContent = "同期中…";
    try {
      await syncMyStatsProfile(getPlayerName(seat), getPlayerAvatar(seat));
      statusEl.textContent = "同期しました。";
    } catch (err) {
      console.error("syncMyStatsProfile failed", err);
      statusEl.textContent = `エラー: ${err.message ?? err}`;
    } finally {
      syncBtn.disabled = false;
    }
  });

  row.appendChild(syncBtn);
  row.appendChild(infoBtn);
  wrap.appendChild(row);
  wrap.appendChild(statusEl);
  return wrap;
}

function buildStatRow(label, value) {
  const row = document.createElement("div");
  row.style.cssText = "display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid rgba(148, 163, 184, 0.12); font-size: 0.85rem;";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  labelEl.style.cssText = "color: #94a3b8;";
  const valueEl = document.createElement("span");
  valueEl.textContent = value;
  valueEl.style.cssText = "font-weight: bold;";
  row.appendChild(labelEl);
  row.appendChild(valueEl);
  return row;
}

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "my-page-panel";
  panel.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(24rem, 92vw); max-height: 85vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.6rem; padding: 1.2rem; z-index: 2301;
    font-family: sans-serif; font-size: 0.85rem; color: #e2e8f0;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    display: none;
  `;

  const titleEl = document.createElement("div");
  titleEl.textContent = "マイページ";
  titleEl.style.cssText = "font-weight: bold; margin-bottom: 0.6rem; padding-right: 1.6rem;";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  const body = document.createElement("div");
  panel.appendChild(body);

  async function render() {
    body.innerHTML = "";

    const seat = getSelfSeat();
    const avatarWrap = document.createElement("div");
    avatarWrap.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 1rem;";
    const avatarImg = document.createElement("img");
    avatarImg.src = getPlayerAvatar(seat);
    avatarImg.alt = "";
    avatarImg.style.cssText = "width: 6rem; height: 6rem; border-radius: 50%; object-fit: cover;";
    const changeBtn = document.createElement("button");
    changeBtn.type = "button";
    changeBtn.textContent = "アバター変更";
    changeBtn.style.cssText = "padding: 0.3rem 0.8rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.8rem;";
    changeBtn.addEventListener("click", () => avatarPickerFn?.());
    avatarWrap.appendChild(avatarImg);
    avatarWrap.appendChild(changeBtn);
    body.appendChild(avatarWrap);

    body.appendChild(buildStatRow("プレイヤー名", getPlayerName(seat)));

    const statusEl = document.createElement("div");
    statusEl.textContent = "戦績を読み込み中…";
    statusEl.style.cssText = "text-align: center; color: #94a3b8; padding: 0.8rem 0;";
    body.appendChild(statusEl);

    const user = await getCurrentUser();
    if (!user) {
      statusEl.innerHTML = "";
      const loginMsg = document.createElement("div");
      loginMsg.textContent = "ログインすると戦績（対戦数・勝率・順位等）が表示されます。";
      loginMsg.style.cssText = "margin-bottom: 0.5rem;";
      const loginBtn = document.createElement("button");
      loginBtn.type = "button";
      loginBtn.textContent = "ログインする";
      loginBtn.style.cssText =
        "padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.85rem;";
      loginBtn.addEventListener("click", () => {
        close();
        openOnlinePanel();
      });
      statusEl.appendChild(loginMsg);
      statusEl.appendChild(loginBtn);
      return;
    }

    // ユーザー要望「ショップ画面とマイページにアイテムコンプリート率を表示したい」。
    // 戦績システムとの連携状況とは無関係（アカウントの通貨/所持アイテムの話のため）に、
    // ログインさえしていれば常に表示する。
    const { owned, total, percent } = getShopCompletionStats();
    body.appendChild(buildStatRow("アイテムコンプリート率", `${percent}%（${owned}/${total}）`));

    let profile;
    try {
      profile = await fetchStatsProfile(user.id);
    } catch (err) {
      console.error("fetchStatsProfile failed", err);
      statusEl.textContent = "戦績の取得に失敗しました。通信環境を確認してください。";
      return;
    }

    if (!profile.linked) {
      statusEl.innerHTML = "";
      statusEl.style.textAlign = "left";
      const linkMsg = document.createElement("div");
      linkMsg.textContent =
        "まだ戦績管理システムのプレイヤーと連携していません。既に登録済みの方は下のボタンから連携できます（未登録の方は、オンライン対戦に参加すると自動的に新規登録されます）。";
      linkMsg.style.cssText = "margin-bottom: 0.5rem; line-height: 1.5;";
      const linkBtn = document.createElement("button");
      linkBtn.type = "button";
      linkBtn.textContent = "連携する";
      linkBtn.style.cssText = "padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.85rem;";
      linkBtn.addEventListener("click", () => {
        close();
        openStatsPlayerLinkModal();
      });
      statusEl.appendChild(linkMsg);
      statusEl.appendChild(linkBtn);
      return;
    }

    statusEl.remove();
    const rankText = (rank) => (rank ? `${rank}位 / ${profile.totalRankedPlayers}人中` : "集計対象外（承認待ち等）");
    body.appendChild(buildStatRow("対戦数", `${profile.matchesCount}戦`));
    body.appendChild(buildStatRow("勝利数", `${profile.winsCount}勝`));
    body.appendChild(buildStatRow("勝率", `${profile.winRate}%`));
    body.appendChild(buildStatRow("勝率順位", rankText(profile.winRateRank)));
    body.appendChild(buildStatRow("対戦数順位", rankText(profile.matchCountRank)));
    body.appendChild(buildStatRow("登録年月日", formatDate(profile.createdAt)));
    body.appendChild(buildStatsSyncRow(seat));
  }

  panel._render = render;
  return panel;
}

let openFn = null;

export function openMyPage() {
  openFn?.();
}

export function initMyPage() {
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
    panel._render();
  }
  openFn = open;

  const panel = buildPanel(close);
  const backdrop = createBackdrop(close, { dim: true, zIndex: 2300 });
  backdrop.style.display = "none";

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);

  // ユーザー要望「画面右上のオプションアイコンの隣に人マークのアイコンを作り、
  // それを押すとマイページモーダルが開く」。options-menu.jsの「⚙ オプション」
  // ボタンと同じ部品（icon-action-button.js）・同じ「アイコンのみ」見た目にする。
  const launcherBtn = document.createElement("button");
  launcherBtn.id = "my-page-button";
  const { captionEl } = buildIconButtonContent(launcherBtn, {
    icon: "assets/icons/my-page.svg",
    tooltip: "マイページを開きます",
  });
  captionEl.textContent = "マイページ";
  wireIconButtonClick(launcherBtn, {
    detailTitle: "マイページ",
    detailParagraphs: ["自分のアバター・戦績（対戦数・勝率・順位等）を確認できます。"],
    onAction: open,
  });
  document.body.appendChild(launcherBtn);
}
