// ユーザー要望「マイページを新設したい。アバター変更・現アバター・プレイヤー名・
// 対戦数・勝利数・勝率・勝率順位・対戦数順位・登録年月日などを載せたい」への対応。
// 画面右上のオプションアイコンの隣の人マークアイコン、または左下の巨大アバターの
// クリックで開く（main.js側で配線）。

import { getCurrentUser, getSelfSeat, syncMyStatsProfile, getSelfRank, fetchMyTitleStats, fetchMyTitleKey, saveMyTitleKey } from "./online.js";
// ランク戦の現ランク（フェーズ4/6）。戦績システムの順位とは別物のランク戦専用のランク。
import { rankName } from "./rank-badge.js";
import { buildRankShowcase } from "./rank-showcase.js";
import { showRankExplanationModal } from "./rank-explain.js";
import { isProfileLayoutEditMode } from "./profile-layout-editor.js";
import { getPlayerName, getPlayerAvatar, setPlayerName } from "./player-identity.js";
import { fetchStatsProfile } from "./stats-profile.js";
import { TITLE_DEFS, computeUnlockedTitleKeys, getTitleGroups } from "./titles.js";
import { openStatsPlayerLinkModal } from "./stats-player-link.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { openOnlinePanel } from "./online-ui.js";
import { getShopCompletionStats } from "./shop-content.js";
import { getOptionArea } from "./option-area.js";
import { openPieceSkinPicker, getSkinImagePath, getMyPieceColor } from "./piece-skins.js";
import { openCardBackSkinPicker, getCardBackSetIndex, backImagePath } from "./card-back-skins.js";
import { openPlaymatPicker, getSelectedPlaymatPath } from "./playmat.js";
import { openBackgroundPicker, getSelectedBackgroundPath } from "./background.js";
import { openPetPicker, getSelectedPetIndex, PET_OPTIONS, petSpriteSrc } from "./pet-skins.js";
import { applyProfileLayout } from "./profile-layout-editor.js";

// main.jsのopenAvatarPicker()はmain.js内のローカル関数（circular importを避けるための
// 既存パターン、admin.js等と同じ）。main.js側からregisterAvatarPickerHelper()で
// 注入してもらう。
let avatarPickerFn = null;

// マイページ着せ替えの「選択中」サムネ更新用（ユーザー要望「それぞれ何に着せ替え中か
// 分かるように」）。各ボタンが自分のサムネを描き直す関数を登録し、着せ替え変更の合図
// （各モジュールが飛ばす window "admin:change"）で全部まとめて更新する。リスナーは1個だけ
// 張り（多重登録防止）、参照する配列はマイページを開くたびに作り直す（＝閉じた後の古い
// ボタンを触らない・リークしない）。
let cosmeticThumbRefreshers = [];
let cosmeticChangeHooked = false;
function ensureCosmeticChangeHook() {
  if (cosmeticChangeHooked) return;
  cosmeticChangeHooked = true;
  window.addEventListener("admin:change", () => {
    for (const fn of cosmeticThumbRefreshers) fn();
  });
}

// アバター変更(admin:change)で、開いているマイページ（モーダル版・全画面版どちらも）の
// アバター画像を即座に差し替える。モジュール読み込み時に1度だけ登録する（DOMに該当要素が
// 無ければ何もしないのでリークしない）。以前はモーダルのopen()内でだけ登録していたため、
// 全画面版(profile-page.js、renderMyPageBodyを直接呼ぶ)ではアバターが即時更新されず、
// 入り直すまで変わらなかった（ユーザー報告）。
if (typeof window !== "undefined") {
  window.addEventListener("admin:change", () => {
    const imgs = document.querySelectorAll(".my-page-avatar-img, .my-page-bg-avatar img");
    if (imgs.length === 0) return;
    const src = getPlayerAvatar(getSelfSeat());
    imgs.forEach((img) => {
      img.src = src;
    });
  });
}
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
  // ライトテーマ(body.theme-light)から色を上書きするためのクラス（既定ダークの見た目は
  // インラインstyleのまま変わらない。style.cssの .my-page-row* 参照）。
  row.className = "my-page-row";
  row.style.cssText = "display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; padding: 0.3rem 0; border-bottom: 1px solid rgba(148, 163, 184, 0.12); font-size: 0.85rem;";

  // ユーザー要望2026-08-16「『プレイヤー名○○』の『プレイヤー名』表記を無くす」。ラベルは
  // 出さず、名前（＋鉛筆）だけを表示する。左寄せにして名前が主役になるようにする。
  const valueWrap = document.createElement("div");
  valueWrap.style.cssText = "display: flex; align-items: center; gap: 0.4rem; flex: 1 1 auto; justify-content: flex-start; min-width: 0;";
  row.appendChild(valueWrap);

  function renderView() {
    valueWrap.innerHTML = "";
    // ユーザー要望「『変更』ボタンはいらない。鉛筆アイコンを小さく載せつつ、名前を直接
    // クリックすると入力画面にする」。名前自体をクリック可能にし、隣に小さな鉛筆(✎)を添える。
    const nameEl = document.createElement("span");
    nameEl.textContent = getPlayerName(seat);
    nameEl.className = "my-page-row-value";
    nameEl.style.cssText = "font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;";
    nameEl.title = "クリックして名前を変更";
    nameEl.addEventListener("click", renderEdit);
    const pencil = document.createElement("span");
    pencil.textContent = "✎";
    pencil.title = "名前を変更";
    pencil.className = "my-page-name-pencil";
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
    input.className = "my-page-name-input";
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
  row.className = "my-page-row";
  row.style.cssText = "display: flex; justify-content: space-between; padding: 0.3rem 0; border-bottom: 1px solid rgba(148, 163, 184, 0.12); font-size: 0.85rem;";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  labelEl.className = "my-page-row-label";
  labelEl.style.cssText = "color: #94a3b8;";
  const valueEl = document.createElement("span");
  valueEl.textContent = value;
  valueEl.className = "my-page-row-value";
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
  // ユーザー要望2026-08-16「マイページのアバタークリックでアバターを変えれるように」。
  // 大アバター（背面の飾り）自体を押してもピッカーを開く。レイアウト編集モード中は
  // ドラッグ移動を優先したいので、編集モードでない時だけ反応させる（editMode判定は無いため
  // pointer-events は常時autoにし、クリックでピッカーを開く。編集モードのドラッグは
  // profile-layout-editor側がpointerdownを拾うので競合しない）。
  bgAvatar.style.cursor = "pointer";
  bgAvatar.title = "クリックしてアバターを変更";
  bgAvatar.addEventListener("click", () => avatarPickerFn?.());
  body.appendChild(bgAvatar);

  const avatarWrap = document.createElement("div");
  avatarWrap.dataset.layoutKey = "avatar"; // レイアウト編集モードの識別子（profile-layout-editor.js）
  avatarWrap.style.cssText = "display: flex; flex-direction: column; align-items: center; gap: 0.5rem; margin-bottom: 1rem;";
  const avatarImg = document.createElement("img");
  avatarImg.className = "my-page-avatar-img"; // アバター変更時に差し替えるための識別子（#4）
  avatarImg.src = getPlayerAvatar(seat);
  avatarImg.alt = "";
  avatarImg.style.cssText = "width: 6rem; height: 6rem; border-radius: 50%; object-fit: cover; cursor: pointer;";
  avatarImg.title = "クリックしてアバターを変更";
  avatarImg.addEventListener("click", () => avatarPickerFn?.()); // ユーザー要望2026-08-16
  const changeBtn = document.createElement("button");
  changeBtn.type = "button";
  changeBtn.textContent = "アバター変更";
  changeBtn.className = "my-page-change-btn";
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
  // このマイページ分のサムネ更新関数を貯め直す（開くたびにリセット）。
  cosmeticThumbRefreshers = [];
  ensureCosmeticChangeHook();
  const addCosmetic = (label, onClick, thumbSrcFn) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "my-page-cosmetic-btn";
    const labelEl = document.createElement("span");
    labelEl.className = "my-page-cosmetic-label";
    labelEl.textContent = label;
    const thumb = document.createElement("span");
    thumb.className = "my-page-cosmetic-thumb";
    const refresh = () => {
      let src = null;
      try {
        src = thumbSrcFn?.();
      } catch {
        src = null;
      }
      thumb.innerHTML = "";
      if (src) {
        thumb.classList.remove("is-none");
        const img = document.createElement("img");
        img.src = src;
        img.alt = "";
        thumb.appendChild(img);
      } else {
        thumb.classList.add("is-none");
        thumb.textContent = "なし";
      }
    };
    refresh();
    cosmeticThumbRefreshers.push(refresh);
    b.appendChild(labelEl);
    b.appendChild(thumb);
    b.addEventListener("click", onClick);
    cosmeticsGrid.appendChild(b);
  };
  // thumbSrcFn: 今選択中のアイテムの画像パス（無し/取得不可なら null → 「なし」表示）。
  addCosmetic("🎲 駒スキン", () => openPieceSkinPicker(), () => getSkinImagePath(getMyPieceColor() || "red"));
  addCosmetic("🂠 カード裏", () => openCardBackSkinPicker(), () => backImagePath("normal", getCardBackSetIndex()));
  addCosmetic("🟩 プレイマット", () => openPlaymatPicker(), () => getSelectedPlaymatPath());
  addCosmetic("🖼 背景", () => openBackgroundPicker(), () => getSelectedBackgroundPath());
  addCosmetic("🐥 ペット", () => openPetPicker(), () => {
    const o = PET_OPTIONS[getSelectedPetIndex()];
    return o?.sprite ? petSpriteSrc(o.sprite, "front", "static") : null;
  });
  cosmeticsWrap.appendChild(cosmeticsGrid);
  body.appendChild(cosmeticsWrap);

  // ランク戦の現ランク（rank-badge.js、フェーズ4/6）。下の戦績システムの「順位」とは別物の
  // ランク戦専用の段位。ログイン済みならgetSelfRankが行を自動作成して返すので常に表示できる
  // （ランクSQL未デプロイ・未ログイン時は非表示のまま＝graceful）。
  const rankGroup = document.createElement("div");
  rankGroup.className = "my-page-rank-group";
  rankGroup.dataset.layoutKey = "ranked-rank";
  rankGroup.style.display = "none";
  body.appendChild(rankGroup);
  renderMyPageRankedRank(rankGroup);

  // 実績・戦績のテキスト群は1つのグループにまとめる（ユーザー要望「一旦それらでグループでいい」）。
  // レイアウト編集モードでも "stats" という1ブロックとして扱えるようにする。
  const statsGroup = document.createElement("div");
  statsGroup.className = "my-page-stats-group";
  statsGroup.dataset.layoutKey = "stats";
  body.appendChild(statsGroup);

  const statusEl = document.createElement("div");
  statusEl.textContent = "戦績を読み込み中…";
  statusEl.className = "my-page-status";
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
  // ユーザー要望2026-08-28「戦績システムとの連携済み表示は基本設定のところではなくて、
  // マイページに小さくさらっとあった方が良い」。オプションの基本設定にあった大きめの連携
  // カード（options-menu.jsのbuildStatsPlayerLinkRow）は撤去し、ここに一行で出す。
  // 未連携の場合は上の分岐で「連携する」ボタンを出しているので、ここは連携済みのみ。
  const linkedNote = document.createElement("div");
  linkedNote.textContent = "🏆 戦績管理システムと連携済み";
  linkedNote.style.cssText = "font-size: 0.7rem; color: #94a3b8; text-align: right; margin: 0 0 0.2rem;";
  statsGroup.appendChild(linkedNote);
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

  // 称号コレクション（続き313）。戦績システムと連携済みの人だけ（保存先が players.title_key のため）。
  const titlesWrap = document.createElement("div");
  titlesWrap.className = "my-page-titles";
  statsGroup.appendChild(titlesWrap);
  renderTitleCollection(titlesWrap).catch((err) => console.error("renderTitleCollection failed", err));
}

// 称号コレクション（ユーザー要望2026-08-28「称号はコレクションしていく感じで！その中から１つ
// お気に入りを選んでステータスに明示するイメージ」）。解禁は保存せず、その場の戦績から毎回
// 判定する（titles.js のコメント参照）。選んだ1つだけを players.title_key へ保存する。
async function renderTitleCollection(container) {
  container.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "my-page-titles-heading";
  heading.textContent = "称号";
  container.appendChild(heading);

  const status = document.createElement("div");
  status.className = "my-page-titles-status";
  status.textContent = "読み込み中…";
  container.appendChild(status);

  const [stats, currentKey] = await Promise.all([fetchMyTitleStats(), fetchMyTitleKey()]);
  const unlocked = new Set(computeUnlockedTitleKeys(stats));
  let selectedKey = currentKey;

  status.textContent = `獲得 ${unlocked.size} / ${TITLE_DEFS.length}　（クリックでお気に入りに設定）`;

  const grid = document.createElement("div");
  grid.className = "my-page-titles-grid";
  container.appendChild(grid);

  const renderChips = () => {
    grid.innerHTML = "";
    for (const group of getTitleGroups()) {
      const g = document.createElement("div");
      g.className = "my-page-titles-group";
      const gh = document.createElement("div");
      gh.className = "my-page-titles-group-name";
      gh.textContent = group.name;
      g.appendChild(gh);
      const row = document.createElement("div");
      row.className = "my-page-titles-row";
      for (const def of group.titles) {
        const has = unlocked.has(def.key);
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "my-page-title-chip";
        chip.classList.toggle("is-locked", !has);
        chip.classList.toggle("is-selected", has && selectedKey === def.key);
        // ユーザー要望2026-08-28「称号の名前だけ伏せましょう。『？？？』にしておいてホバーすると
        // 条件だけは表示します」。何を目指せばいいかは分かるが、名前は取ってからのお楽しみにする。
        chip.innerHTML = `<span class="my-page-title-icon">${has ? def.icon : "🔒"}</span><span>${has ? def.label : "？？？"}</span>`;
        chip.title = has
          ? `${def.desc}／クリックでお気に入りに設定${selectedKey === def.key ? "（もう一度押すと解除）" : ""}`
          : `未取得：${def.desc}`;
        if (has) {
          chip.addEventListener("click", async () => {
            const next = selectedKey === def.key ? null : def.key;
            chip.disabled = true;
            try {
              await saveMyTitleKey(next);
              selectedKey = next;
              renderChips();
              // 左下のステータス表示へ即反映（main.jsが購読している。importの循環を避けるため
              // 関数呼び出しではなくイベントで伝える）。
              window.dispatchEvent(new CustomEvent("self-title-changed"));
            } catch (err) {
              console.error("saveMyTitleKey failed", err);
              status.textContent = `保存に失敗しました: ${err.message ?? err}`;
            } finally {
              chip.disabled = false;
            }
          });
        }
        row.appendChild(chip);
      }
      g.appendChild(row);
      grid.appendChild(g);
    }
  };
  renderChips();
}

// マイページのランク戦・段位バッジを非同期で描画。未ログイン（getSelfRankがundefined）や
// ランクSQL未デプロイ（RPCエラー）の時は例外を握りつぶして非表示のままにする。
async function renderMyPageRankedRank(container) {
  // ユーザー報告2026-08-16「ランク表示が見当たらない。見える位置に配置して」。以前は
  // getSelfRankが失敗（ランクSQL未デプロイ等）すると早期returnで非表示のままだったため、
  // 「消えた」ように見えていた。常にスロットを表示し、取得できない時は未取得の一言を出す。
  let info = null;
  try {
    info = await getSelfRank();
  } catch {
    info = null;
  }
  if (!document.body.contains(container)) return;
  container.innerHTML = "";
  const title = document.createElement("div");
  title.className = "my-page-rank-title";
  title.textContent = "ランク戦の段位";
  container.appendChild(title);
  if (info) {
    // バッジ＋U型ゲージ＋宝石の合成表示（rank-showcase.js）をコンパクトに縮小して出す。
    container.appendChild(
      buildRankShowcase(info.rank ?? 0, info.gauge ?? 0, info.legend_points ?? 0, { scale: 0.6 })
    );
    const nm = document.createElement("div");
    nm.className = "my-page-rank-name";
    nm.textContent = rankName(info.rank ?? 0);
    container.appendChild(nm);
  } else {
    const note = document.createElement("div");
    note.className = "my-page-rank-none";
    note.textContent = "未取得（ランク戦をプレイすると表示）";
    container.appendChild(note);
  }
  container.style.display = "flex";
  // クリックでランク戦の説明モーダルを開く（ユーザー要望2026-08-17）。ただしレイアウト編集モード中は
  // この要素をドラッグ移動するので、編集中はモーダルを開かない。
  container.style.cursor = "pointer";
  container.title = "ランク戦について";
  container.onclick = () => {
    if (isProfileLayoutEditMode()) return;
    showRankExplanationModal();
  };
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

  // アバター変更の即時反映は、モジュール先頭で1度だけ登録した admin:change リスナーが担う
  // （モーダル版・全画面版の両方に効く。以前ここで毎回登録していたのが原因で全画面版が
  // 更新されなかった＋開くたびに多重登録していた）。

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
