// ユーザー要望「戦績管理システムにすでに登録済みで、でもデジタル版を初めてやる人の
// ために、戦績管理システムのプレイヤー登録をアカウントに紐づける設定を設けたい」。
// オプションの基本設定から開く、一覧選択モーダル。まだどのアカウントとも紐づいて
// いない承認済みプレイヤーの一覧（online.jsのlistUnlinkedStatsPlayers）から1つ選ぶと、
// requestStatsPlayerLink()経由で戦績管理システムの「プロフィール編集承認」待ちに
// 申請が飛ぶ（実際にuser_idが紐づくのは管理者が承認した後）。ゲーム内の名前・
// アバターは承認を待たずこの場で選んだプレイヤーのものへ即座に切り替わる。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { listUnlinkedStatsPlayers, requestStatsPlayerLink } from "./online.js";

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "stats-player-link-panel";
  panel.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(28rem, 92vw); max-height: 80vh; overflow-y: auto;
    background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4);
    border-radius: 0.5rem; padding: 1rem; z-index: 2201;
    font-family: sans-serif; font-size: 0.85rem; color: #e2e8f0;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
    display: none;
  `;

  const titleEl = document.createElement("div");
  titleEl.textContent = "戦績管理システムのプレイヤーと連携";
  titleEl.style.cssText = "font-weight: bold; margin-bottom: 0.4rem; padding-right: 1.6rem;";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  const hint = document.createElement("div");
  hint.textContent =
    "すでに戦績管理システムに登録されているプレイヤーの中から自分を選ぶと、アカウントとの連携を申請します（管理者の承認後に反映されます）。";
  hint.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.7rem; line-height: 1.5;";
  panel.appendChild(hint);

  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.placeholder = "名前で検索…";
  searchInput.style.cssText = `
    width: 100%; box-sizing: border-box; padding: 0.4rem 0.6rem; margin-bottom: 0.6rem;
    background: rgba(0, 0, 0, 0.3); border: 1px solid rgba(148, 163, 184, 0.3);
    border-radius: 0.3rem; color: #e2e8f0; font-size: 0.85rem;
  `;
  panel.appendChild(searchInput);

  const statusEl = document.createElement("div");
  statusEl.style.cssText = "font-size: 0.8rem; color: #94a3b8; padding: 0.6rem 0;";
  panel.appendChild(statusEl);

  const listEl = document.createElement("div");
  listEl.style.cssText = "display: flex; flex-direction: column; gap: 0.3rem;";
  panel.appendChild(listEl);

  let allPlayers = [];

  function buildPlayerRow(player) {
    const row = document.createElement("button");
    row.type = "button";
    row.style.cssText = `
      display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left;
      padding: 0.4rem 0.5rem; background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(148, 163, 184, 0.15); border-radius: 0.3rem; cursor: pointer;
      color: #e2e8f0; font-family: sans-serif; font-size: 0.85rem;
    `;
    const avatar = document.createElement("img");
    avatar.src = player.avatar_url || "assets/avatars/red-front.webp";
    avatar.alt = "";
    avatar.style.cssText = "width: 1.8rem; height: 1.8rem; border-radius: 50%; object-fit: cover; flex-shrink: 0;";
    row.appendChild(avatar);
    const name = document.createElement("span");
    name.textContent = player.name;
    row.appendChild(name);
    row.addEventListener("click", () => showConfirm(player));
    return row;
  }

  function renderList(filterText) {
    listEl.innerHTML = "";
    const needle = filterText.trim().toLowerCase();
    const filtered = needle ? allPlayers.filter((p) => p.name.toLowerCase().includes(needle)) : allPlayers;
    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.textContent = needle ? "該当するプレイヤーがいません。" : "連携可能なプレイヤーがいません。";
      empty.style.cssText = "font-size: 0.8rem; color: #94a3b8; padding: 0.4rem 0;";
      listEl.appendChild(empty);
      return;
    }
    for (const player of filtered) {
      listEl.appendChild(buildPlayerRow(player));
    }
  }

  function showConfirm(player) {
    listEl.style.display = "none";
    searchInput.style.display = "none";
    statusEl.innerHTML = "";
    statusEl.style.color = "#e2e8f0";

    const avatar = document.createElement("img");
    avatar.src = player.avatar_url || "assets/avatars/red-front.webp";
    avatar.alt = "";
    avatar.style.cssText = "width: 3rem; height: 3rem; border-radius: 50%; object-fit: cover; display: block; margin: 0 auto 0.4rem;";
    statusEl.appendChild(avatar);

    const msg = document.createElement("div");
    msg.textContent = `「${player.name}」さんとして連携を申請しますか？（承認までは自動でこの名前・アバターになります）`;
    msg.style.cssText = "text-align: center; margin-bottom: 0.7rem;";
    statusEl.appendChild(msg);

    const btnRow = document.createElement("div");
    btnRow.style.cssText = "display: flex; gap: 0.5rem; justify-content: center;";
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.textContent = "連携を申請する";
    confirmBtn.style.cssText =
      "padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.85rem;";
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.textContent = "戻る";
    backBtn.style.cssText =
      "padding: 0.4rem 0.9rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.85rem;";
    backBtn.addEventListener("click", () => {
      statusEl.innerHTML = "";
      listEl.style.display = "";
      searchInput.style.display = "";
    });
    confirmBtn.addEventListener("click", async () => {
      confirmBtn.disabled = true;
      confirmBtn.textContent = "申請中…";
      try {
        await requestStatsPlayerLink(player.id);
        statusEl.innerHTML = "";
        const done = document.createElement("div");
        done.textContent = `「${player.name}」さんとの連携を申請しました。管理者の承認をお待ちください。`;
        done.style.cssText = "text-align: center; color: #86efac;";
        statusEl.appendChild(done);
      } catch (err) {
        console.error("requestStatsPlayerLink failed", err);
        confirmBtn.disabled = false;
        confirmBtn.textContent = "連携を申請する";
        const errEl = document.createElement("div");
        errEl.textContent = "申請に失敗しました。通信環境を確認してもう一度お試しください。";
        errEl.style.cssText = "text-align: center; color: #fca5a5; margin-top: 0.4rem;";
        statusEl.appendChild(errEl);
      }
    });
    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(backBtn);
    statusEl.appendChild(btnRow);
  }

  searchInput.addEventListener("input", () => renderList(searchInput.value));

  panel._reset = async () => {
    listEl.style.display = "";
    searchInput.style.display = "";
    searchInput.value = "";
    statusEl.textContent = "読み込み中…";
    listEl.innerHTML = "";
    try {
      allPlayers = await listUnlinkedStatsPlayers();
      statusEl.textContent = "";
      renderList("");
    } catch (err) {
      console.error("listUnlinkedStatsPlayers failed", err);
      statusEl.textContent = "一覧の取得に失敗しました。通信環境を確認してください。";
    }
  };

  return panel;
}

let openFn = null;

export function openStatsPlayerLinkModal() {
  openFn?.();
}

export function initStatsPlayerLinkModal() {
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
    panel._reset();
  }
  openFn = open;

  const panel = buildPanel(close);
  const backdrop = createBackdrop(close, { dim: true, zIndex: 2200 });
  backdrop.style.display = "none";

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}
