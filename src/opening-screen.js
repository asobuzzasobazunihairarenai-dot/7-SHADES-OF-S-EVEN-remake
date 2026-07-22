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
//
// ログインカードは背景のタイトルロゴにいきなり重なって見えるとの指摘があったため、
// 起動直後は小さな「ログイン」ボタンだけを表示し、押した時だけカードを開く2段階構成に
// 変更した（カード自体にも右上の✕でボタン表示へ戻せる、開き直してもオーバーレイ全体は
// 閉じない）。

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
import { playOpeningBgm, stopOpeningBgm } from "./sound.js";

// フェードアウトのCSSトランジション時間と合わせる（style.cssの#opening-screen.is-closing、
// .opening-start-gate.is-closing参照）。
const CLOSE_TRANSITION_MS = 600;

// ユーザー要望「最初真っ白な画面にSTARTボタン、周りに7色のオーラが漂う。押したら
// BGM開始＋タイトル画像フェードイン＋ストーリーテロップ（クリックで飛ばせる）→
// ログインボタン出現」への対応。以下の7色は既存のCOLORS(board-layout.js)と同じ並びだが、
// ここは単なる装飾演出でゲームロジックとは無関係なため、循環import回避のため独自に
// 定数を持つ（board-layout.jsを経由する理由が無い）。
const AURA_COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

const STORY_LINES = [
  "ここは異世界「ファルベンド」",
  "世界は「色」で満ちている",
  "",
  "この世界には、7つの国があり",
  "各国はそれぞれの色を治めている",
  "そして、均衡は保たれ平和を築いていた",
  "",
  "しかし、世界の「色」は突如――",
  "",
  "消えた",
  "",
  "各国は、それぞれ国宝を有していた",
  "それはその国の「色」を纏った「キューブ」",
  "しかし、なぜかその「キューブ」だけは",
  "「色」を失わなかった",
  "",
  "色を失った世界で民は輝きを失い途方にくれていた",
  "",
  "やがて各国の国王は",
  "その「キューブ」の「特殊な力」に気付く",
  "",
  "そうそれは、「色」を「具現化する力」だった",
  "",
  "「色」はこの世のあらゆるものと",
  "密接に関わっている",
  "",
  "モノ、記憶、能力、あらゆるものに",
  "",
  "ある時「キューブ」の力が国王に語りかける",
  "",
  "-7つの色を集めよ-",
  "",
  "7つの色を集めたら　一体どうなるのか",
  "",
  "各国のそれぞれの野望、思惑、理想が交錯する中",
  "",
  "7色を巡る戦いが",
  "",
  "今、はじまる",
];

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

  // 起動直後はこの小さなボタンだけを表示する（背景のタイトルロゴと重ならないように）。
  // 押すとカードが開く。ログイン済みかどうかで文言を変える（非同期に取得するため、
  // 判明するまでは無難な「ログイン」のまま）。
  const loginToggleBtn = document.createElement("button");
  loginToggleBtn.type = "button";
  loginToggleBtn.className = "opening-screen-menu-btn";
  loginToggleBtn.textContent = "ログイン";
  content.appendChild(loginToggleBtn);

  const card = document.createElement("div");
  card.className = "opening-login-card";
  card.style.display = "none";
  content.appendChild(card);

  overlay.appendChild(content);

  // ユーザー要望の演出一式: 起動直後は真っ白な画面+7色のオーラ+STARTボタンだけを見せ
  // （.opening-start-gateがbg/dim/contentを覆い隠す）、STARTを押した瞬間にBGM再生・
  // タイトル画像フェードイン・ストーリーテロップ表示という3段階へ進める。
  const storyCrawl = document.createElement("div");
  storyCrawl.className = "opening-story-crawl";
  storyCrawl.style.display = "none";
  const crawlText = document.createElement("div");
  crawlText.className = "opening-story-crawl-text";
  for (const line of STORY_LINES) {
    const p = document.createElement("p");
    if (line === "") {
      p.className = "is-blank";
      p.innerHTML = "&nbsp;";
    } else {
      p.textContent = line;
    }
    crawlText.appendChild(p);
  }
  storyCrawl.appendChild(crawlText);
  const crawlSkipHint = document.createElement("div");
  crawlSkipHint.className = "opening-story-crawl-skip-hint";
  crawlSkipHint.textContent = "クリックでスキップ";
  storyCrawl.appendChild(crawlSkipHint);
  overlay.appendChild(storyCrawl);

  const startGate = document.createElement("div");
  startGate.className = "opening-start-gate";
  for (const color of AURA_COLORS) {
    const aura = document.createElement("div");
    aura.className = `opening-aura opening-aura-${color}`;
    startGate.appendChild(aura);
  }
  const startBtn = document.createElement("button");
  startBtn.type = "button";
  startBtn.className = "opening-start-btn";
  startBtn.textContent = "START";
  startGate.appendChild(startBtn);
  overlay.appendChild(startGate);

  document.body.appendChild(overlay);

  function close(after) {
    // ユーザー要望「音楽もフェードアウトしてほしい」。オーバーレイのフェードアウトと
    // 同じ時間をかけて音量を下げる。
    stopOpeningBgm(CLOSE_TRANSITION_MS);
    overlay.classList.add("is-closing");
    setTimeout(() => {
      overlay.style.display = "none";
      if (after) after();
    }, CLOSE_TRANSITION_MS);
  }

  function revealContent() {
    overlay.classList.add("stage-content");
  }

  // テロップの表示秒数はCSS側（--opening-story-crawl-duration、style.css参照）で
  // calc(var(...))として直接持たせている（JSでanimationDurationを後から上書きする
  // 方式は、display変更とduration上書きが同じ同期処理内でも間に合わずアニメーションが
  // 0秒で終わってしまう不具合があったため廃止した）。
  function showStoryCrawl() {
    storyCrawl.style.display = "flex";
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      storyCrawl.style.display = "none";
      revealContent();
    }
    storyCrawl.addEventListener("click", finish);
    crawlText.addEventListener("animationend", finish);
  }

  function beginTitleSequence() {
    overlay.classList.add("stage-title");
    showStoryCrawl();
  }

  startBtn.addEventListener("click", () => {
    playOpeningBgm();
    startGate.classList.add("is-closing");
    setTimeout(() => {
      startGate.style.display = "none";
      beginTitleSequence();
    }, CLOSE_TRANSITION_MS);
  });

  function showCard() {
    loginToggleBtn.style.display = "none";
    card.style.display = "flex";
    renderCard();
  }

  function hideCard() {
    card.style.display = "none";
    loginToggleBtn.style.display = "inline-block";
  }

  loginToggleBtn.addEventListener("click", showCard);

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
    card.appendChild(createModalCloseX(hideCard));

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

  // 起動直後にログイン状態を確認する。Googleログインはページ遷移を伴うため、認証完了後は
  // ブラウザがこのページへ丸ごとリロードして戻ってくる（＝initOpeningScreen()が最初から
  // 実行し直される）。この時、小さい「ログイン」ボタンのままだと「オンラインで続ける」
  // モーダルに気づけず、あたかもログインが失敗したかのように見えてしまう
  // （ユーザー報告）。ログイン済みと判明した場合は、カードを自動的に開いて
  // 「オンラインで続ける」をすぐ提示する（このカードは未ログイン時のカードと違い
  // タイトル+ボタン1つ+リンク2つだけの簡素な内容のため、タイトルロゴへの重なりは
  // 軽微で許容できる）。未ログインの間は引き続き小さいボタンのまま（タイトルロゴとの
  // 重なりを避けるための前回の対応を維持）。
  (async () => {
    if (!isOnlineAvailable()) return;
    const user = await getCurrentUser();
    if (user) showCard();
  })();
}
