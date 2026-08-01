// ユーザー要望「マイページを新設したい。アバター変更・現アバター・プレイヤー名・
// 対戦数・勝利数・勝率・勝率順位・対戦数順位・登録年月日などを載せたい」への対応。
// 画面右上のオプションアイコンの隣の人マークアイコン、または左下の巨大アバターの
// クリックで開く（main.js側で配線）。

import { getCurrentUser, getSelfSeat, syncMyStatsProfile } from "./online.js";
import { getPlayerName, getPlayerAvatar, setPlayerName } from "./player-identity.js";
import { fetchStatsProfile } from "./stats-profile.js";
import { openStatsPlayerLinkModal } from "./stats-player-link.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { openOnlinePanel } from "./online-ui.js";
import { getShopCompletionStats } from "./shop-content.js";
import { getOptionArea } from "./option-area.js";
import { openPieceSkinPicker } from "./piece-skins.js";
import { openCardBackSkinPicker } from "./card-back-skins.js";
import { openPlaymatPicker } from "./playmat.js";
import { openBackgroundPicker } from "./background.js";
import { openPetPicker } from "./pet-skins.js";
import { applyProfileLayout } from "./profile-layout-editor.js";

// main.jsのopenAvatarPicker()はmain.js内のローカル関数（circular importを避けるための
// 既存パターン、admin.js等と同じ）。main.js側からregisterAvatarPickerHelper()で
// 注入してもらう。
let avatarPickerFn = null;
export function registerAvatarPickerHelper(fn) {
  avatarPickerFn = fn;
}

// ユーザー要望（続き77）「オプションエリアのマイページアイコンを押しても全画面マイ
// ページに遷移してください」。profile-page.jsのopenProfilePage()はrenderMyPageBody
// （このファイル）を呼ぶため、直接importすると循環参照になる——avatarPickerFnと同じ
// 注入パターンで解決する（main.js側でregisterProfilePageOpener(openProfilePage)する）。
let profilePageOpenerFn = null;
export function registerProfilePageOpener(fn) {
  profilePageOpenerFn = fn;
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

// ユーザー要望「マイページでも名前を変えれるようにしてください」。buildStatRowと同じ
// 見た目だが、値の右側に「✎」ボタンを置き、押すとその場で入力欄＋保存/キャンセルに
// 切り替わる。保存時はsetPlayerName（=ローカル更新＋online.jsのupdateMyIdentity経由で
// サーバーの座席ロスターへも反映）を呼ぶ。戦績システムへの反映は下部の同期ボタンの担当。
function buildEditableNameRow(seat) {
  const row = document.createElement("div");
  row.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px solid rgba(148, 163, 184, 0.12); font-size: 0.85rem;";

  const labelEl = document.createElement("span");
  labelEl.textContent = "プレイヤー名";
  labelEl.style.cssText = "color: #94a3b8; flex: 0 0 auto;";
  row.appendChild(labelEl);

  const valueWrap = document.createElement("div");
  valueWrap.style.cssText = "display: flex; align-items: center; gap: 0.4rem; flex: 1 1 auto; justify-content: flex-end; min-width: 0;";
  row.appendChild(valueWrap);

  function renderView() {
    valueWrap.innerHTML = "";
    // ユーザー要望「『変更』ボタンはいらない。鉛筆アイコンを小さく載せつつ、名前を直接
    // クリックすると入力画面にする」。名前自体をクリック可能にし、隣に小さな鉛筆(✎)を添える。
    const nameEl = document.createElement("span");
    nameEl.textContent = getPlayerName(seat);
    nameEl.style.cssText = "font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;";
    nameEl.title = "クリックして名前を変更";
    nameEl.addEventListener("click", renderEdit);
    const pencil = document.createElement("span");
    pencil.textContent = "✎";
    pencil.title = "名前を変更";
    pencil.style.cssText = "flex: 0 0 auto; color: #94a3b8; cursor: pointer; font-size: 0.8rem; opacity: 0.8;";
    pencil.addEventListener("click", renderEdit);
    valueWrap.appendChild(nameEl);
    valueWrap.appendChild(pencil);
  }

  function renderEdit() {
    valueWrap.innerHTML = "";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = getPlayerName(seat);
    input.style.cssText = "flex: 1 1 auto; min-width: 0; padding: 0.2rem 0.4rem; background: rgba(0,0,0,0.35); border: 1px solid rgba(148,163,184,0.4); border-radius: 0.3rem; color: #e2e8f0; font-size: 0.85rem;";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = "保存";
    saveBtn.style.cssText = "flex: 0 0 auto; padding: 0.2rem 0.6rem; background: #be185d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.75rem;";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = "取消";
    cancelBtn.style.cssText = "flex: 0 0 auto; padding: 0.2rem 0.5rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.75rem;";
    const save = () => {
      const next = input.value.trim();
      if (next) setPlayerName(seat, next);
      renderView();
    };
    saveBtn.addEventListener("click", save);
    cancelBtn.addEventListener("click", renderView);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
      else if (e.key === "Escape") renderView();
    });
    valueWrap.appendChild(input);
    valueWrap.appendChild(saveBtn);
    valueWrap.appendChild(cancelBtn);
    input.focus();
    input.select();
  }

  renderView();
  return row;
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

  panel._render = () => renderMyPageBody(body, close);
  return panel;
}

// ユーザー要望（続き74）「プロフィール／マイページを画面全体版に作り直す」への対応で、
// モーダル(buildPanel)・画面全体版(profile-page.js)の両方から呼べるよう、中身を
// 作る部分だけを独立した関数として切り出した（アバター・プレイヤー名・戦績の
// 取得ロジック自体は完全に共通、見た目の器（モーダルか画面全体か）だけが違う）。
export async function renderMyPageBody(body, close) {
  body.innerHTML = "";

  const seat = getSelfSeat();

  // 巨大な半透明アバター（ユーザー要望）。DOMの先頭＝最背面に置く飾り。レイアウト編集モードで
  // 位置・大きさ（scale）を自由に調整できる（もっと巨大にもできるよう scale 上限を拡大済み）。
  // 画像を div で包む——編集モードの width:max-content が“中の画像の指定幅(12rem)”になり、
  // scale での拡縮が予測どおりになる（生imgだと画像の実解像度が基準になり巨大化しすぎるため）。
  const bgAvatar = document.createElement("div");
  bgAvatar.className = "my-page-bg-avatar";
  bgAvatar.dataset.layoutKey = "avatar-bg";
  const bgAvatarImg = document.createElement("img");
  bgAvatarImg.src = getPlayerAvatar(seat);
  bgAvatarImg.alt = "";
  bgAvatar.appendChild(bgAvatarImg);
  body.appendChild(bgAvatar);

  const avatarWrap = document.createElement("div");
  avatarWrap.dataset.layoutKey = "avatar"; // レイアウト編集モードの識別子（profile-layout-editor.js）
  avatarWrap.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 1rem;";
  const avatarImg = document.createElement("img");
  avatarImg.className = "my-page-avatar-img"; // アバター変更時に差し替えるための識別子（#4）
  avatarImg.src = getPlayerAvatar(seat);
  avatarImg.alt = "";
  avatarImg.style.cssText = "width: 6rem; height: 6rem; border-radius: 50%; object-fit: cover;";
  const changeBtn = document.createElement("button");
  changeBtn.type = "button";
  changeBtn.textContent = "アバター変更";
  changeBtn.style.cssText = "padding: 0.3rem 0.8rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.8rem;";
  changeBtn.addEventListener("click", () => avatarPickerFn?.());
  // ユーザー要望「アバター変更ボタンを別にして」。レイアウト編集で個別に動かせるよう、
  // アバター画像(avatar)とは別の要素(avatar-change)として並べる。
  changeBtn.dataset.layoutKey = "avatar-change";
  avatarWrap.appendChild(avatarImg);
  body.appendChild(avatarWrap);
  body.appendChild(changeBtn);

  const nameRow = buildEditableNameRow(seat);
  nameRow.dataset.layoutKey = "name";
  body.appendChild(nameRow);

  // 着せ替え一式（ユーザー要望「マイページに駒スキン・カード裏・プレマ・背景・ペットの
  // 変更できるやつを置いて」）。各ボタンは既存のピッカーを開くだけ。
  const cosmeticsWrap = document.createElement("div");
  cosmeticsWrap.dataset.layoutKey = "cosmetics";
  cosmeticsWrap.className = "my-page-cosmetics";
  const cosmeticsTitle = document.createElement("div");
  cosmeticsTitle.className = "my-page-cosmetics-title";
  cosmeticsTitle.textContent = "🎨 着せ替え";
  cosmeticsWrap.appendChild(cosmeticsTitle);
  const cosmeticsGrid = document.createElement("div");
  cosmeticsGrid.className = "my-page-cosmetics-grid";
  const addCosmetic = (label, onClick) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "my-page-cosmetic-btn";
    b.textContent = label;
    b.addEventListener("click", onClick);
    cosmeticsGrid.appendChild(b);
  };
  addCosmetic("🎲 駒スキン", () => openPieceSkinPicker());
  addCosmetic("🂠 カード裏", () => openCardBackSkinPicker());
  addCosmetic("🟩 プレイマット", () => openPlaymatPicker());
  addCosmetic("🖼 背景", () => openBackgroundPicker());
  addCosmetic("🐥 ペット", () => openPetPicker());
  cosmeticsWrap.appendChild(cosmeticsGrid);
  body.appendChild(cosmeticsWrap);

  // 実績・戦績のテキスト群は1つのグループにまとめる（ユーザー要望「一旦それらでグループでいい」）。
  // レイアウト編集モードでも "stats" という1ブロックとして扱えるようにする。
  const statsGroup = document.createElement("div");
  statsGroup.className = "my-page-stats-group";
  statsGroup.dataset.layoutKey = "stats";
  body.appendChild(statsGroup);

  const statusEl = document.createElement("div");
  statusEl.textContent = "戦績を読み込み中…";
  statusEl.style.cssText = "text-align: center; color: #94a3b8; padding: 0.8rem 0;";
  statsGroup.appendChild(statusEl);

  // ユーザー報告「マイページを開くと一瞬“古いレイアウト”が見える」。原因は、この関数が
  // 要素を自然な縦並びで先に描き、戦績のawait後にようやくレイアウト（PROFILE_LAYOUT）が
  // 適用されていたため。同期構築が終わったここで一度適用し、最初から所定位置に置く（戦績は
  // 後から埋まるが、6ブロックは既に配置済みなのでチラつかない）。
  applyProfileLayout(body);

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
  statsGroup.appendChild(buildStatRow("アイテムコンプリート率", `${percent}%（${owned}/${total}）`));

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
  statsGroup.appendChild(buildStatRow("対戦数", `${profile.matchesCount}戦`));
  statsGroup.appendChild(buildStatRow("勝利数", `${profile.winsCount}勝`));
  statsGroup.appendChild(buildStatRow("勝率", `${profile.winRate}%`));
  statsGroup.appendChild(buildStatRow("勝率順位", rankText(profile.winRateRank)));
  statsGroup.appendChild(buildStatRow("対戦数順位", rankText(profile.matchCountRank)));
  statsGroup.appendChild(buildStatRow("登録年月日", formatDate(profile.createdAt)));
  // ユーザー要望で手動の「戦績システムと同期する」ボタンは撤去（名前/アバターは変更した瞬間に
  // 自動同期＝online.jsのautoSyncStatsIdentity、対局開始・勝利時の自動同期もそのまま）。
  // buildStatsSyncRowは将来また必要になった時のため関数自体は残してある。
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

  // ユーザー報告「マイページでアバターを変更してもマイページのアバターの見た目が変わらない」。
  // アバター等の変更はwindowの"admin:change"イベントで通知される（online.jsのupdateMyIdentity・
  // 各着せ替えピッカー）。マイページが開いている間だけ、通知を受けて表示中のアバター画像
  // （本体・巨大背面）を最新に差し替える（全体の再描画は戦績の再取得を伴い重いので画像だけ更新）。
  window.addEventListener("admin:change", () => {
    if (panel.style.display === "none") return;
    const src = getPlayerAvatar(getSelfSeat());
    panel.querySelectorAll(".my-page-avatar-img, .my-page-bg-avatar img").forEach((img) => {
      img.src = src;
    });
  });

  // ユーザー要望「画面右上のオプションアイコンの隣に人マークのアイコンを作り、
  // それを押すとマイページモーダルが開く」。options-menu.jsの「⚙ オプション」
  // ボタンと同じ部品（icon-action-button.js）・同じ「アイコンのみ」見た目にする。
  // 続き77: 押した時の遷移先を、この場でのモーダル（open）から画面全体のマイページ
  // （profile-page.js）へ変更した。
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
    onAction: () => (profilePageOpenerFn ? profilePageOpenerFn() : open()),
  });
  getOptionArea().appendChild(launcherBtn);
}
