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
import { openMyDeckList } from "./my-deck-list.js";

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

  // でかでかとした「マイデッキ編集」ボタン（ユーザー要望2026-08-11）。位置・サイズは
  // 管理者モードのCSS変数(--profile-mydeck-*)で調整可能（admin.js参照）。押すとデッキ一覧へ、
  // 戻る時はこのマイページを開き直す（元のonClose＝ホームへの導線は保つ）。
  const mydeckBtn = document.createElement("button");
  mydeckBtn.type = "button";
  mydeckBtn.id = "profile-mydeck-btn";
  mydeckBtn.innerHTML = `<span class="profile-mydeck-icon">🃏</span><span class="profile-mydeck-label">マイデッキ編集</span>`;
  mydeckBtn.addEventListener("click", () => {
    closeProfilePage();
    openMyDeckList(() => openProfilePage(onClose));
  });
  overlayEl.appendChild(mydeckBtn);

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
