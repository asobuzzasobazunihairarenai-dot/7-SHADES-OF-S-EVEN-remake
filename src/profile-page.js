// プロフィール／マイページの画面全体版（続き74）。ユーザー要望「画面全体を使うように
// したい」。実際のデータ取得・描画ロジックはmy-page.js（アバター変更・戦績表示等、
// 元々モーダルとして実装済みだった）のrenderMyPageBody()をそのまま呼ぶだけで、
// ここでは「画面全体の器」だけを新しく用意する。ホーム画面(home-screen.js)と同じ
// 「フルスクリーンのページ、モーダルではない」見た目・構造にした。

import { renderMyPageBody } from "./my-page.js";
import { applyProfileLayout, registerProfileLayoutHelpers } from "./profile-layout-editor.js";
import { syncFullScreenPageActive } from "./option-area.js";
import { closeShopPanel } from "./shop.js";
// マイデッキ編集はマイページ内の大ボタンへ移設（ユーザー要望2026-08-11）。
// ユーザー要望2026-08-16「ボタンの代わりにメインデッキのビジュアルを置き、その下に編集ボタン」。
import { openMyDeckList, representativeCardId } from "./my-deck-list.js";
import { getSelectedDeckId, getDeckById, getAllDecks } from "./my-deck.js";
import { getCardIllustPath, getCardImagePath } from "./cards-data.js";

let overlayEl = null;
let bodyEl = null;

// 編集モードのオン/オフや再描画要求で、開いていればマイページ本体を作り直す。
registerProfileLayoutHelpers({
  rerender: () => {
    if (bodyEl) renderProfileBody();
  },
});

async function renderProfileBody() {
  if (!bodyEl) return;
  await renderMyPageBody(bodyEl, closeProfilePage);
  applyProfileLayout(bodyEl); // PROFILE_LAYOUT適用＋編集モードなら移動/リサイズ配線
}

export function openProfilePage(onClose) {
  if (overlayEl) return;
  // #2026-08-16: ショップを開いたままだと裏に残るため、遷移先を開く時はショップを閉じる
  // （プロフィールはショップより前面だが、他ページと挙動を揃える。ショップ未表示なら安全なno-op）。
  closeShopPanel();
  overlayEl = document.createElement("div");
  overlayEl.id = "profile-page";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "profile-page-back";
  // ユーザー指摘（続き84）「戻る場所はホームとは限らない（オプションエリアの
  // アイコンから直接開く経路もある）ので単に『戻る』でいい」。
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeProfilePage();
    onClose?.();
  });
  overlayEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.id = "profile-page-title";
  title.textContent = "👤 マイページ";
  overlayEl.appendChild(title);

  // マイページ右下：メインデッキのビジュアル＋その下に「マイデッキ編集」ボタン
  // （ユーザー要望2026-08-16）。ビジュアル・ボタンどちらを押してもデッキ一覧（編集画面）へ。
  // 位置・サイズは管理者モードのCSS変数(--profile-maindeck-*、admin.js)で調整可能。
  const openEditor = () => {
    closeProfilePage();
    openMyDeckList(() => openProfilePage(onClose));
  };
  const mydeckWrap = document.createElement("div");
  mydeckWrap.id = "profile-maindeck";

  const badge = document.createElement("div");
  badge.className = "profile-maindeck-badge";
  badge.textContent = "🏅 メインデッキ";
  mydeckWrap.appendChild(badge);

  const cover = document.createElement("button");
  cover.type = "button";
  cover.className = "profile-maindeck-cover";
  cover.title = "マイデッキを編集する";
  cover.addEventListener("click", openEditor);
  // メインデッキ（getSelectedDeckId）を表示。無ければ先頭のデッキ、それも無ければ「未設定」。
  const mainDeck = getDeckById(getSelectedDeckId()) || getAllDecks()[0] || null;
  if (mainDeck) {
    if (mainDeck.firstColor) cover.style.setProperty("--maindeck-accent", `var(--color-${mainDeck.firstColor})`);
    const art = document.createElement("div");
    art.className = "profile-maindeck-art";
    const rep = representativeCardId(mainDeck);
    if (rep) {
      const img = document.createElement("img");
      img.src = getCardIllustPath(rep); // テキスト無しのイラスト版（ケース表面と同じ）
      img.addEventListener("error", () => { img.src = getCardImagePath(rep); }, { once: true });
      img.alt = "";
      art.appendChild(img);
    }
    cover.appendChild(art);
    const nm = document.createElement("div");
    nm.className = "profile-maindeck-name";
    nm.textContent = mainDeck.name || "マイデッキ";
    cover.appendChild(nm);
  } else {
    cover.classList.add("is-empty");
    cover.textContent = "メインデッキ未設定";
  }
  mydeckWrap.appendChild(cover);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.id = "profile-maindeck-edit";
  editBtn.innerHTML = `<span class="profile-maindeck-edit-icon">🃏</span><span>マイデッキ編集</span>`;
  editBtn.addEventListener("click", openEditor);
  mydeckWrap.appendChild(editBtn);

  overlayEl.appendChild(mydeckWrap);

  const card = document.createElement("div");
  card.id = "profile-page-card";
  overlayEl.appendChild(card);

  bodyEl = document.createElement("div");
  card.appendChild(bodyEl);

  document.body.appendChild(overlayEl);
  // ユーザー要望（続き75）「ホーム画面やプロフ全画面でも上のオプションエリアのアイコン等は
  // 表示していてください」。full-screen-page-active共通クラス（style.css参照）。
  syncFullScreenPageActive();

  // renderMyPageBodyの第2引数closeは「モーダルを閉じてから他の画面を開く」導線
  // （ログインする／連携するボタン等）で使われる。画面全体版でも同じ導線を保つため、
  // ここでのcloseもこのページ自体を閉じる処理にする。レイアウト編集モードの適用込みで描く。
  renderProfileBody();
}

export function closeProfilePage() {
  overlayEl?.remove();
  overlayEl = null;
  bodyEl = null;
  syncFullScreenPageActive();
}
