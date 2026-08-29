// プロフィール／マイページの画面全体版（続き74）。ユーザー要望「画面全体を使うように
// したい」。実際のデータ取得・描画ロジックはmy-page.js（アバター変更・戦績表示等、
// 元々モーダルとして実装済みだった）のrenderMyPageBody()をそのまま呼ぶだけで、
// ここでは「画面全体の器」だけを新しく用意する。ホーム画面(home-screen.js)と同じ
// 「フルスクリーンのページ、モーダルではない」見た目・構造にした。

import { renderMyPageBody } from "./my-page.js";
import { applyProfileLayout, registerProfileLayoutHelpers } from "./profile-layout-editor.js";
import { syncFullScreenPageActive } from "./option-area.js";
import { closeShopPanel } from "./shop.js";
// 全画面ページ（プロフィール/ランキング/ヘルプ）は同時に1つだけにする。開く時に他を閉じることで、
// オプションエリアのアイコンを交互に押した時にDOMが背面に取り残されて開かなくなる不具合を防ぐ。
// 関数内でのみ使う遅延束縛なので相互import（循環）でも安全。
import { closeRankingPage } from "./ranking-page.js";
import { closeHelpPanel } from "./help.js";
// マイデッキ編集はマイページ内の大ボタンへ移設（ユーザー要望2026-08-11）。
// ユーザー要望2026-08-16「ボタンの代わりにメインデッキのビジュアル（3D箱）を置き、その下に編集ボタン」。
import { openMyDeckList, buildDeckCaseArt } from "./my-deck-list.js";
import { getSelectedDeckId, getDeckById, getAllDecks } from "./my-deck.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

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
  // ユーザー報告2026-08-18「マイページ/ランキングを交互に押すと途中でランキングが開かなくなる
  // （背面に行っている）」。原因は openRankingPage は profile を閉じるのに openProfilePage は
  // ranking を閉じていなかった非対称——ranking のDOMが背面に取り残され、その overlayEl も
  // 残るため次の ranking 押下が `if(overlayEl) return` で早期returnしていた。開く時に他の全画面
  // ページを閉じて対称にする（未表示なら安全なno-op）。
  closeRankingPage();
  closeHelpPanel();
  overlayEl = document.createElement("div");
  overlayEl.id = "profile-page";

  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "profile-page-back";
  // ユーザー指摘（続き84）「戻る場所はホームとは限らない（オプションエリアの
  // アイコンから直接開く経路もある）ので単に『戻る』でいい」。
  backBtn.textContent = t("pp.back");
  backBtn.addEventListener("click", () => {
    closeProfilePage();
    onClose?.();
  });
  overlayEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.id = "profile-page-title";
  title.textContent = t("pp.title");
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

  // 「メインデッキ」ラベル（ユーザー要望2026-08-16：テキスト横のアイコン🏅は不要）。
  const badge = document.createElement("div");
  badge.className = "profile-maindeck-badge";
    badge.textContent = t("pp.mainDeck");
  mydeckWrap.appendChild(badge);

  const cover = document.createElement("button");
  cover.type = "button";
  cover.className = "profile-maindeck-cover";
    cover.title = t("pp.editDeckTip");
  cover.addEventListener("click", openEditor);
  // メインデッキ（getSelectedDeckId）を3D立体ケースで表示。無ければ先頭のデッキ、それも
  // 無ければ「未設定」。ケースはデッキ一覧と同じ共通部品（buildDeckCaseArt）を流用。
  const mainDeck = getDeckById(getSelectedDeckId()) || getAllDecks()[0] || null;
  if (mainDeck) {
    cover.appendChild(buildDeckCaseArt(mainDeck)); // 3D立体ケース（MTGAデッキボックス風）
    const nm = document.createElement("div");
    nm.className = "profile-maindeck-name";
      nm.textContent = mainDeck.name || t("pp.myDeck");
    cover.appendChild(nm);
  } else {
    cover.classList.add("is-empty");
      cover.textContent = t("pp.noMainDeck");
  }
  mydeckWrap.appendChild(cover);

  // 「マイデッキ編集」ボタン（ユーザー要望2026-08-16：ボタン枠は不要＝テキストリンク調）。
  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.id = "profile-maindeck-edit";
  // ユーザー要望2026-08-16「マイデッキ編集ボタンの絵文字アイコンは不要」。
    editBtn.innerHTML = `<span>${t("pp.editDeck")}</span>`;
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
