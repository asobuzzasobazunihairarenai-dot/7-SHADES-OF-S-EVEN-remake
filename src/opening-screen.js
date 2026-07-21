// 起動直後に表示するオープニング画面。ユーザー提供の背景画像(assets/opening.webp)が
// ゆっくりフェードインする単純なゲート。ゲーム本体は裏で従来通りすぐに初期化・描画されて
// いる（このモジュールは純粋な見た目の最前面オーバーレイであり、ゲームロジック自体には
// 一切関与しない）。
//
// 従来は「ローカル」「オンライン」の2択メニューだったが、オンライン対戦を主軸に据える
// ため、ログイン画面を主役にした構成に変更した（マジックリンクはもう主要な手段ではない
// ため後述の「その他のログイン方法」に格納し、ゲストログインを主ボタンにした）。
// 「ローカル」はこのオーバーレイを閉じるだけ（＝今までの初期画面がそのまま現れる、
// ローカルモードは元々デフォルトの起動状態のため特別な処理は不要）は引き続き
// 小さなリンクとして残してある。

import { openOnlinePanel } from "./online-ui.js";
import {
  isOnlineAvailable,
  signInAnonymously,
  signInWithGoogle,
  signInWithMagicLink,
  getCurrentUser,
  signOut,
} from "./online.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

// フェードアウトのCSSトランジション時間と合わせる（style.cssの#opening-screen.is-closing参照）。
const CLOSE_TRANSITION_MS = 600;

// ゲストログインの注意書き用の詳細モーダル。既存のphase-guide-modal-*クラス（フェイズ案内板・
// アイコンボタン等と共通のホバー=簡易/クリック=詳細パターン）をそのまま流用する。
let infoModalBackdrop = null;
let infoModalEl = null;
let infoModalTitleEl = null;
let infoModalBodyEl = null;

function closeInfoModal() {
  if (infoModalBackdrop) infoModalBackdrop.style.display = "none";
  if (infoModalEl) infoModalEl.style.display = "none";
}

function ensureInfoModal() {
  if (infoModalEl) return;
  infoModalBackdrop = createBackdrop(closeInfoModal, { dim: true, zIndex: 51000 });
  infoModalBackdrop.style.display = "none";

  infoModalEl = document.createElement("div");
  infoModalEl.id = "opening-login-info-modal";
  infoModalEl.style.display = "none";
  infoModalEl.appendChild(createModalCloseX(closeInfoModal));

  infoModalTitleEl = document.createElement("div");
  infoModalTitleEl.className = "phase-guide-modal-title";
  infoModalEl.appendChild(infoModalTitleEl);

  infoModalBodyEl = document.createElement("div");
  infoModalBodyEl.className = "phase-guide-modal-body";
  infoModalEl.appendChild(infoModalBodyEl);

  document.body.appendChild(infoModalBackdrop);
  document.body.appendChild(infoModalEl);
}

function openInfoModal(title, paragraphs) {
  ensureInfoModal();
  infoModalTitleEl.textContent = title;
  infoModalBodyEl.innerHTML = "";
  for (const paragraph of paragraphs) {
    const p = document.createElement("p");
    p.style.cssText = "margin: 0 0 0.6rem 0; line-height: 1.6;";
    p.textContent = paragraph;
    infoModalBodyEl.appendChild(p);
  }
  infoModalBackdrop.style.display = "block";
  infoModalEl.style.display = "block";
}

export function initOpeningScreen() {
  const overlay = document.createElement("div");
  overlay.id = "opening-screen";

  const bg = document.createElement("div");
  bg.className = "opening-screen-bg";
  bg.style.backgroundImage = 'url("assets/opening.webp")';
  overlay.appendChild(bg);

  const dim = document.createElement("div");
  dim.className = "opening-screen-dim";
  overlay.appendChild(dim);

  const content = document.createElement("div");
  content.className = "opening-screen-content";

  const card = document.createElement("div");
  card.className = "opening-login-card";
  content.appendChild(card);

  overlay.appendChild(content);
  document.body.appendChild(overlay);

  function close(after) {
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.style.display = "none";
      if (after) after();
    }, CLOSE_TRANSITION_MS);
  }

  function buildLocalLink() {
    const link = document.createElement("button");
    link.type = "button";
    link.className = "opening-login-local-link";
    link.textContent = "ローカルでプレイ（ログイン不要）";
    link.addEventListener("click", () => close());
    return link;
  }

  async function renderCard() {
    card.innerHTML = "";

    const available = isOnlineAvailable();
    const user = available ? await getCurrentUser() : null;

    if (!available) {
      const msg = document.createElement("div");
      msg.className = "opening-login-status";
      msg.textContent = "オンライン機能を読み込めませんでした。ローカルでプレイできます。";
      card.appendChild(msg);
      card.appendChild(buildLocalLink());
      return;
    }

    if (user) {
      const title = document.createElement("div");
      title.className = "opening-login-title";
      title.textContent = `🌐 ログイン中（${user.email || "匿名ユーザー"}）`;
      card.appendChild(title);

      const row = document.createElement("div");
      row.className = "opening-login-primary-row";
      const continueBtn = document.createElement("button");
      continueBtn.type = "button";
      continueBtn.className = "opening-login-primary-btn";
      continueBtn.textContent = "オンラインで続ける";
      continueBtn.addEventListener("click", () => close(openOnlinePanel));
      row.appendChild(continueBtn);
      card.appendChild(row);

      card.appendChild(buildLocalLink());

      const logoutBtn = document.createElement("button");
      logoutBtn.type = "button";
      logoutBtn.className = "opening-login-signout-link";
      logoutBtn.textContent = "ログアウト";
      logoutBtn.addEventListener("click", async () => {
        await signOut();
        renderCard();
      });
      card.appendChild(logoutBtn);
      return;
    }

    // 未ログイン: ゲストログインを主目的にした画面。
    const status = document.createElement("div");
    status.className = "opening-login-status";

    const primaryRow = document.createElement("div");
    primaryRow.className = "opening-login-primary-row";

    const guestBtn = document.createElement("button");
    guestBtn.type = "button";
    guestBtn.className = "opening-login-primary-btn";
    guestBtn.textContent = "ゲストでログイン";
    guestBtn.addEventListener("click", async () => {
      guestBtn.disabled = true;
      status.textContent = "ログイン中...";
      try {
        await signInAnonymously();
        await renderCard();
      } catch (err) {
        status.textContent = `エラー: ${err.message ?? err}`;
        guestBtn.disabled = false;
      }
    });
    primaryRow.appendChild(guestBtn);

    const infoBtn = document.createElement("button");
    infoBtn.type = "button";
    infoBtn.className = "opening-login-info-btn";
    infoBtn.textContent = "i";
    infoBtn.title = "ゲストログインについて";
    infoBtn.addEventListener("click", () => {
      openInfoModal("ゲストログインについて", [
        "メールアドレスの登録・確認は不要で、今すぐそのままオンライン対戦に参加できます。",
        "ただし一度ログアウトしたり、別の端末・別のブラウザからアクセスすると同じアカウントには" +
          "戻れません（ゲストアカウントを後から引き継ぐ手段は現在ありません）。",
        "何度も遊ぶ予定がある場合や、名前・アバター・駒スキン等の設定を長く使い続けたい場合は、" +
          "下の「その他のログイン方法」からGoogleでログインすることをおすすめします。",
      ]);
    });
    primaryRow.appendChild(infoBtn);

    card.appendChild(primaryRow);
    card.appendChild(status);
    card.appendChild(buildLocalLink());

    // その他のログイン方法（右下、折りたたみ）: Googleログイン・マジックリンクをここに格納する。
    const moreRow = document.createElement("div");
    moreRow.className = "opening-login-more-row";
    moreRow.textContent = "その他のログイン方法 ▾";
    card.appendChild(moreRow);

    const moreSection = document.createElement("div");
    moreSection.className = "opening-login-more-section";
    card.appendChild(moreSection);

    moreRow.addEventListener("click", () => {
      const opening = moreSection.style.display !== "flex";
      moreSection.style.display = opening ? "flex" : "none";
      moreRow.textContent = opening ? "その他のログイン方法 ▴" : "その他のログイン方法 ▾";
    });

    const googleBtn = document.createElement("button");
    googleBtn.type = "button";
    googleBtn.className = "opening-login-secondary-btn";
    googleBtn.textContent = "Googleでログイン";
    googleBtn.addEventListener("click", async () => {
      googleBtn.disabled = true;
      try {
        await signInWithGoogle();
      } catch (err) {
        status.textContent = `エラー: ${err.message ?? err}`;
        googleBtn.disabled = false;
      }
    });
    moreSection.appendChild(googleBtn);

    const divider = document.createElement("div");
    divider.className = "opening-login-divider";
    divider.textContent = "── または ──";
    moreSection.appendChild(divider);

    const emailInput = document.createElement("input");
    emailInput.type = "email";
    emailInput.placeholder = "メールアドレス";
    emailInput.className = "opening-login-email-input";
    moreSection.appendChild(emailInput);

    const magicBtn = document.createElement("button");
    magicBtn.type = "button";
    magicBtn.className = "opening-login-secondary-btn";
    magicBtn.textContent = "マジックリンクを送る";
    magicBtn.addEventListener("click", async () => {
      if (!emailInput.value) return;
      magicBtn.disabled = true;
      status.textContent = "送信中...";
      try {
        await signInWithMagicLink(emailInput.value);
        status.textContent = "メールを確認し、届いたリンクを開いてください。";
      } catch (err) {
        status.textContent = `エラー: ${err.message ?? err}`;
      } finally {
        magicBtn.disabled = false;
      }
    });
    moreSection.appendChild(magicBtn);
  }

  renderCard();
}
