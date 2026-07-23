// ユーザー要望「マイページを新設したい。アバター変更・現アバター・プレイヤー名・
// 対戦数・勝利数・勝率・勝率順位・対戦数順位・登録年月日などを載せたい」への対応。
// 画面右上のオプションアイコンの隣の人マークアイコン、または左下の巨大アバターの
// クリックで開く（main.js側で配線）。

import { getCurrentUser, getSelfSeat } from "./online.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { fetchStatsProfile } from "./stats-profile.js";
import { openStatsPlayerLinkModal } from "./stats-player-link.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { openOnlinePanel } from "./online-ui.js";

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
        "まだ戦績管理システムのプレイヤーと連携していません。既に登録済みの方は下のボタンから連携できます（未登録の方は、オンライン対戦で一度勝利すると自動的に新規登録されます）。";
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
