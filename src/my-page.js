// ユーザー要望「マイページを新設したい。アバター変更・現アバター・プレイヤー名・
// 対戦数・勝利数・勝率・勝率順位・対戦数順位・登録年月日などを載せたい」への対応。
// 画面右上のオプションアイコンの隣の人マークアイコン、または左下の巨大アバターの
// クリックで開く（main.js側で配線）。

import { getCurrentUser, getSelfSeat, syncMyStatsProfile, getSelfRank, fetchMyTitleStats, fetchMyTitleKey, saveMyTitleKey } from "./online.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ10
// ランク戦の現ランク（フェーズ4/6）。戦績システムの順位とは別物のランク戦専用のランク。
import { rankName } from "./rank-badge.js";
import { buildRankShowcase } from "./rank-showcase.js";
import { showRankExplanationModal } from "./rank-explain.js";
import { isProfileLayoutEditMode } from "./profile-layout-editor.js";
import { getPlayerName, getPlayerAvatar, setPlayerName } from "./player-identity.js";
import { fetchStatsProfile } from "./stats-profile.js";
import { TITLE_DEFS, computeUnlockedTitleKeys, getTitleGroups, formatTitle } from "./titles.js";
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
  return t("mypage.date", { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() });
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
  syncBtn.textContent = t("mypage.L96");
  syncBtn.style.cssText =
    "padding: 0.4rem 0.9rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); " +
    "border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.8rem;";

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "opening-login-info-btn";
  infoBtn.textContent = "i";
  infoBtn.title = t("mypage.L105");
  infoBtn.addEventListener("click", () => {
    openIconDetailModal(t("mypage.L107"), [
      t("mypage.L108"),
      t("mypage.L109"),
      t("mypage.L110"),
    ]);
  });

  const statusEl = document.createElement("div");
  statusEl.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-top: 0.3rem; min-height: 1.2em;";

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true;
    statusEl.textContent = t("mypage.L119");
    try {
      await syncMyStatsProfile(getPlayerName(seat), getPlayerAvatar(seat));
      statusEl.textContent = t("mypage.L122");
    } catch (err) {
      console.error("syncMyStatsProfile failed", err);
      status.textContent = t("mypage.error", { msg: err.message ?? err });
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
    valueWrap.style.flexWrap = "";
    valueWrap.style.maxWidth = "";
    valueWrap.innerHTML = "";
    // ユーザー要望「『変更』ボタンはいらない。鉛筆アイコンを小さく載せつつ、名前を直接
    // クリックすると入力画面にする」。名前自体をクリック可能にし、隣に小さな鉛筆(✎)を添える。
    const nameEl = document.createElement("span");
    nameEl.textContent = getPlayerName(seat);
    nameEl.className = "my-page-row-value";
    nameEl.style.cssText = "font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer;";
    nameEl.title = t("mypage.L165");
    nameEl.addEventListener("click", renderEdit);
    const pencil = document.createElement("span");
    pencil.textContent = "✎";
    pencil.title = t("mypage.L169");
    pencil.className = "my-page-name-pencil";
    pencil.style.cssText = "flex: 0 0 auto; color: #94a3b8; cursor: pointer; font-size: 0.8rem; opacity: 0.8;";
    pencil.addEventListener("click", renderEdit);
    valueWrap.appendChild(nameEl);
    valueWrap.appendChild(pencil);
  }

  function renderEdit() {
    valueWrap.innerHTML = "";
    // ユーザー報告2026-08-28「保存/取消ボタンが実績のところに食い込む」への対応（続き316→318）。
    // この行(name)はレイアウト上 scale 3 前後で拡大表示されるため、横に伸ばすと隣の実績へ
    // 大きくはみ出す。当初はボタンを下段へ回り込ませたが、ユーザーから「下にはもうスペースが
    // ないので横でいい」との指示（続き318）。**横一列のまま、入力欄の幅を絞って**収める。
    valueWrap.style.flexWrap = "nowrap";
    valueWrap.style.maxWidth = "12rem";
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 20;
    input.value = getPlayerName(seat);
    input.className = "my-page-name-input";
    input.style.cssText = "flex: 0 1 auto; width: 5.5rem; min-width: 0; padding: 0.2rem 0.4rem; background: rgba(0,0,0,0.35); border: 1px solid rgba(148,163,184,0.4); border-radius: 0.3rem; color: #e2e8f0; font-size: 0.85rem;";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.textContent = t("mypage.L193");
    saveBtn.className = "my-page-name-save";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.textContent = t("mypage.L197");
    cancelBtn.className = "my-page-name-cancel";
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
  titleEl.textContent = t("mypage.L252");
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
  bgAvatar.title = t("mypage.L290");
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
  avatarImg.title = t("mypage.L290");
  avatarImg.addEventListener("click", () => avatarPickerFn?.()); // ユーザー要望2026-08-16
  // ユーザー要望2026-08-28（続き319）「アバター変更ボタンは無くしてアバターをクリックしたら
  // 変えれるようにしましょうか！」。ボタン（と、その枠のダサさ）ごと撤去した。
  // アバター画像自体には元々クリックでピッカーを開く処理があるが、profile-layout-editor が
  // 非編集時に "avatar" ブロックへ pointer-events:none を当てている（巨大な四角い当たり判定が
  // 周囲のクリックを奪う「見えない枠」対策）ため、画像側だけ pointer-events:auto に戻し、
  // さらに clip-path で円形に切り抜いて**四隅では反応しない**ようにしてある（style.css参照）。
  avatarWrap.appendChild(avatarImg);
  body.appendChild(avatarWrap);

  // ユーザー要望2026-08-28（続き317）「マイページの称号はもうスペースがないので名前の上を
  // 称号にしませんか？そこに載せるのはお気に入りだけで、クリックすると称号モーダルが出る」。
  // 名前と同じレイアウトブロック（data-layout-key="name"）の中に、名前の上へ1行だけ置く。
  const nameBlock = document.createElement("div");
  nameBlock.dataset.layoutKey = "name";
  nameBlock.className = "my-page-name-block";
  const favTitleEl = document.createElement("button");
  favTitleEl.type = "button";
  favTitleEl.className = "my-page-fav-title";
  favTitleEl.textContent = t("mypage.L322"); // 実際の値は下の非同期部分で入れ替える
  favTitleEl.title = t("mypage.L323");
  favTitleEl.addEventListener("click", () => openTitleCollectionModal(favTitleEl));
  nameBlock.appendChild(favTitleEl);
  nameBlock.appendChild(buildEditableNameRow(seat));
  body.appendChild(nameBlock);
  refreshFavoriteTitleLabel(favTitleEl).catch((err) => console.error("refreshFavoriteTitleLabel failed", err));

  // 着せ替え一式（ユーザー要望「マイページに駒スキン・カード裏・プレマ・背景・ペットの
  // 変更できるやつを置いて」）。各ボタンは既存のピッカーを開くだけ。
  const cosmeticsWrap = document.createElement("div");
  cosmeticsWrap.dataset.layoutKey = "cosmetics";
  cosmeticsWrap.className = "my-page-cosmetics";
  const cosmeticsTitle = document.createElement("div");
  cosmeticsTitle.className = "my-page-cosmetics-title";
  cosmeticsTitle.textContent = t("mypage.L337");
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
        thumb.textContent = t("mypage.L369");
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
  addCosmetic(t("mypage.L380"), () => openPieceSkinPicker(), () => getSkinImagePath(getMyPieceColor() || "red"));
  addCosmetic(t("mypage.L381"), () => openCardBackSkinPicker(), () => backImagePath("normal", getCardBackSetIndex()));
  addCosmetic(t("mypage.L382"), () => openPlaymatPicker(), () => getSelectedPlaymatPath());
  addCosmetic(t("mypage.L383"), () => openBackgroundPicker(), () => getSelectedBackgroundPath());
  addCosmetic(t("mypage.L384"), () => openPetPicker(), () => {
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
  statusEl.textContent = t("mypage.L410");
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
    loginMsg.textContent = t("mypage.L425");
    loginMsg.style.cssText = "margin-bottom: 0.5rem;";
    const loginBtn = document.createElement("button");
    loginBtn.type = "button";
    loginBtn.textContent = t("mypage.L429");
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
  statsGroup.appendChild(buildStatRow(t("mypage.L445"), `${percent}%（${owned}/${total}）`));

  let profile;
  try {
    profile = await fetchStatsProfile(user.id);
  } catch (err) {
    console.error("fetchStatsProfile failed", err);
    statusEl.textContent = t("mypage.L452");
    return;
  }

  if (!profile.linked) {
    statusEl.innerHTML = "";
    statusEl.style.textAlign = "left";
    const linkMsg = document.createElement("div");
    linkMsg.textContent =
      t("mypage.L461");
    linkMsg.style.cssText = "margin-bottom: 0.5rem; line-height: 1.5;";
    const linkBtn = document.createElement("button");
    linkBtn.type = "button";
    linkBtn.textContent = t("mypage.L465");
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
  linkedNote.textContent = t("mypage.L482");
  linkedNote.style.cssText = "font-size: 0.7rem; color: #94a3b8; text-align: right; margin: 0 0 0.2rem;";
  statsGroup.appendChild(linkedNote);
  // 【注意】ここは英語化の一括置換で一度壊れた箇所（2026-08-31にユーザー報告で発覚）。
  // 元は「引数を取る関数」だったのに `const rankText = rank ? ... : ...` という**即値**に化け、
  // さらに存在しない `addRow()` が生成されていた。結果、この関数がここで例外を投げて
  // 実績（対戦数・勝利数・勝率・順位・登録年月日）が丸ごと出なくなっていた。
  const rankText = (rank) => (rank ? t("mypage.rankOf", { rank, total: profile.totalRankedPlayers }) : t("mypage.L485"));
  statsGroup.appendChild(buildStatRow(t("mypage.L486"), t("mypage.matchesN", { n: profile.matchesCount })));
  statsGroup.appendChild(buildStatRow(t("mypage.L487"), t("mypage.winsN", { n: profile.winsCount })));
  statsGroup.appendChild(buildStatRow(t("mypage.L488"), `${profile.winRate}%`));
  statsGroup.appendChild(buildStatRow(t("mypage.L489"), rankText(profile.winRateRank)));
  statsGroup.appendChild(buildStatRow(t("mypage.L490"), rankText(profile.matchCountRank)));
  statsGroup.appendChild(buildStatRow(t("mypage.L491"), formatDate(profile.createdAt)));
  // ユーザー要望で手動の「戦績システムと同期する」ボタンは撤去（名前/アバターは変更した瞬間に
  // 自動同期＝online.jsのautoSyncStatsIdentity、対局開始・勝利時の自動同期もそのまま）。
  // buildStatsSyncRowは将来また必要になった時のため関数自体は残してある。

  // 称号は名前の上のバッジ＋クリックで開くモーダルへ移した（続き317）。
  // 【この場所に置かないこと（続き316の教訓）】以前は称号のチップ列を statsGroup（実績の枠）の
  // 中に入れていたため、applyProfileLayout の width:max-content で**枠ごと横に広がり**、実績の
  // 各行（display:flex + justify-content:space-between）の数値が画面外へ押し出されて「ラベル
  // だけ見えて数値が消える」不具合になった。実績の枠には横長になるものを足さないこと。
}

// 名前の上に出す「お気に入りの称号」バッジの表示を最新にする（続き317）。
// 未設定・未連携・未ログインなら「＋ 称号を選ぶ」という控えめな誘い文句にする
// （押せばモーダルが開き、そこで初めて取得状況が分かる）。
async function refreshFavoriteTitleLabel(el) {
  if (!el) return;
  let label = null;
  try {
    label = formatTitle(await fetchMyTitleKey());
  } catch (err) {
    label = null;
  }
  if (!document.body.contains(el)) return;
  el.textContent = label || t("mypage.L515");
  el.classList.toggle("is-empty", !label);
}

// 称号コレクションのモーダル（続き317、ユーザー要望「名前の上を称号にして、クリックすると
// 称号モーダルが出るように」）。中身は renderTitleCollection をそのまま流用する。
function openTitleCollectionModal(favTitleEl) {
  if (document.getElementById("title-collection-modal")) return;
  const backdrop = createBackdrop(() => close(), { dim: true, zIndex: 10700 });
  const modal = document.createElement("div");
  modal.id = "title-collection-modal";
  modal.appendChild(createModalCloseX(() => close()));
  const body = document.createElement("div");
  modal.appendChild(body);
  function close() {
    modal.remove();
    backdrop.remove();
    // 閉じた時に、名前の上のバッジへ選び直した結果を反映する。
    refreshFavoriteTitleLabel(favTitleEl).catch(() => {});
  }
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  renderTitleCollection(body).catch((err) => console.error("renderTitleCollection failed", err));
}

// 称号コレクション（ユーザー要望2026-08-28「称号はコレクションしていく感じで！その中から１つ
// お気に入りを選んでステータスに明示するイメージ」）。解禁は保存せず、その場の戦績から毎回
// 判定する（titles.js のコメント参照）。選んだ1つだけを players.title_key へ保存する。
async function renderTitleCollection(container) {
  container.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "my-page-titles-heading";
  heading.textContent = t("mypage.L547");
  container.appendChild(heading);

  const status = document.createElement("div");
  status.className = "my-page-titles-status";
  status.textContent = t("mypage.L552");
  container.appendChild(status);

  const [stats, currentKey] = await Promise.all([fetchMyTitleStats(), fetchMyTitleKey()]);
  const unlocked = new Set(computeUnlockedTitleKeys(stats));
  let selectedKey = currentKey;

  status.textContent = t("mypage.titleProgress", { got: unlocked.size, total: TITLE_DEFS.length });

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
        chip.innerHTML = has
          ? `<span>${t(def.labelKey)}</span>`
          : `<span class="my-page-title-icon">🔒</span><span>？？？</span>`;
        chip.title = has
          ? t("mypage.titleTip", { desc: t(def.descKey), extra: selectedKey === def.key ? t("mypage.titleTipUnset") : "" })
          : t("mypage.titleLocked", { desc: t(def.descKey) });
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
              const favEl = document.querySelector(".my-page-fav-title");
              if (favEl) refreshFavoriteTitleLabel(favEl).catch(() => {});
            } catch (err) {
              console.error("saveMyTitleKey failed", err);
              alert(t("mypage.saveFailed", { msg: err.message ?? err }));
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
  title.textContent = t("mypage.L637");
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
    note.textContent = t("mypage.L651");
    container.appendChild(note);
  }
  container.style.display = "flex";
  // クリックでランク戦の説明モーダルを開く（ユーザー要望2026-08-17）。ただしレイアウト編集モード中は
  // この要素をドラッグ移動するので、編集中はモーダルを開かない。
  container.style.cursor = "pointer";
  container.title = t("mypage.L658");
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
    tooltip: t("mypage.L703"),
  });
  captionEl.textContent = t("mypage.L252");
  wireIconButtonClick(launcherBtn, {
    detailTitle: t("mypage.L252"),
    detailParagraphs: [t("mypage.L708")],
    onAction: () => (profilePageOpenerFn ? profilePageOpenerFn() : open()),
  });
  getOptionArea().appendChild(launcherBtn);
}
