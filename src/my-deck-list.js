// マイデッキ一覧（複数デッキ、MTGAのデッキ箱一覧風。ユーザー要望2026-08-11）。
// ホームの「🃏 マイデッキ編成」から開く入口。デッキ箱が並び、クリックで編集、「＋」で新規作成、
// 各箱の複製/削除ができる。編集は my-deck-builder.js（1デッキを編集）を開く。

import { syncFullScreenPageActive } from "./option-area.js";
import { getCardImagePath, getCardIllustPath } from "./cards-data.js";
import { getAllDecks, createDeck, deleteDeck, duplicateDeck, validateDeck, deckTotal, maxDeckSlots, getSelectedDeckId, setSelectedDeckId } from "./my-deck.js";
import { openMyDeckBuilder } from "./my-deck-builder.js";
import { isItemUnlocked } from "./online.js";

// 作成できるマイデッキ数の上限（基本2、ショップで「マイデッキ枠 ＋2」を購入で4）。未ログイン/
// オフラインでは isItemUnlocked が常にtrueを返す＝上限4（ローカルプレイを制限しない既存方針）。
function currentDeckSlotLimit() {
  return maxDeckSlots(isItemUnlocked("mydeck-extra-slots"));
}

// デッキ箱のアクセント色（ファーストカードの色）。
const MDL_COLOR_HEX = {
  red: "#c70025",
  orange: "#ee781f",
  yellow: "#fabe00",
  green: "#22ac38",
  blue: "#1bb8ce",
  pink: "#f19ec2",
  purple: "#915da3",
};

let overlayEl = null;
let gridEl = null;
let onCloseCb = null;
// ペットのサムネ用に pet-skins を遅延ロード（静的importの循環TDZ回避。ピッカーと同じ方針）。
let petMod = null;

// 駒画像パス（色＋スキンindex）。裏面画像パス（card-back-skins backImagePath 同等をインライン化）。
function pieceThumbSrc(color, idx) {
  const c = color || "red";
  return idx ? `assets/pieces/${c}-${idx}.webp` : `assets/pieces/${c}.webp`;
}
function backPathFor(idx) {
  const suffix = idx === 0 ? "" : `-${idx}`;
  const ext = idx === 0 || idx === 10 || idx === 11 ? "webp" : "png";
  return `assets/cards/back-normal${suffix}.${ext}`;
}

// 立体ケースの表面に貼るカード。編集で選んだメインカード(deck.mainCardId)があり、実際に
// デッキに入っていればそれ。無ければ代表カード（枚数最多、同数なら並び順が先）。空なら null。
// profile-page.js（マイページのメインデッキビジュアル）からも使うためexport。
export function representativeCardId(deck) {
  if (deck.mainCardId && (deck.cards?.[deck.mainCardId] ?? 0) > 0) return deck.mainCardId;
  let best = null;
  let bestCount = 0;
  for (const [cardId, count] of Object.entries(deck.cards || {})) {
    if (count > bestCount) {
      best = cardId;
      bestCount = count;
    }
  }
  return best;
}

// デッキの3D立体ケース（MTGAデッキボックス風。斜め・厚み・少し開いた蓋・上から覗くカードの束）を
// 返す共通部品。マイデッキ一覧の各箱と、マイページのメインデッキビジュアル（profile-page.js）の
// 両方で使う。--mdl-accent を自身に設定するので、.mdl-deck の外（マイページ等）でもファースト色の
// アクセントが効く。前面(.mdl-deck-front)にメインカードのイラストを貼る。層: peek → lid → front。
export function buildDeckCaseArt(deck) {
  const art = document.createElement("div");
  art.className = "mdl-deck-art";
  art.style.setProperty("--mdl-accent", deck.firstColor ? MDL_COLOR_HEX[deck.firstColor] : "#64748b");
  const rep = representativeCardId(deck);
  const caseEl = document.createElement("div");
  caseEl.className = "mdl-deck-case";
  const peek = document.createElement("div");
  peek.className = "mdl-deck-peek";
  caseEl.appendChild(peek);
  const lid = document.createElement("div");
  lid.className = "mdl-deck-lid";
  caseEl.appendChild(lid);
  const front = document.createElement("div");
  front.className = "mdl-deck-front";
  if (rep) {
    const img = document.createElement("img");
    // 箱の表面は「イラストのみ」版（テキスト無しで綺麗）。無いカードはgetCardIllustPath内で通常画像へ。
    img.src = getCardIllustPath(rep);
    img.addEventListener("error", () => { img.src = getCardImagePath(rep); }, { once: true }); // 404保険
    img.alt = "";
    img.loading = "lazy";
    front.appendChild(img);
  }
  caseEl.appendChild(front);
  art.appendChild(caseEl);
  return art;
}

function buildDeckBox(deck) {
  const box = document.createElement("div");
  box.className = "mdl-deck";
  if (deck.firstColor) box.dataset.color = deck.firstColor;

  // メインデッキ（getSelectedDeckId）はCPU戦・ランク戦で実際に使うデッキ。バッジで明示。
  const isMain = deck.id === getSelectedDeckId();
  if (isMain) {
    box.classList.add("is-main");
    const badge = document.createElement("div");
    badge.className = "mdl-deck-main-badge";
    badge.textContent = "★ メイン";
    box.appendChild(badge);
  }

  const art = buildDeckCaseArt(deck);
  const accent = deck.firstColor ? MDL_COLOR_HEX[deck.firstColor] : "#64748b";
  box.style.setProperty("--mdl-accent", accent); // タイル全体で使う（背景を下まで伸ばすため）
  box.appendChild(art);

  const nameRow = document.createElement("div");
  nameRow.className = "mdl-deck-name";
  nameRow.textContent = deck.name || "マイデッキ";
  box.appendChild(nameRow);

  const meta = document.createElement("div");
  meta.className = "mdl-deck-meta";
  const total = deckTotal(deck.cards);
  const valid = validateDeck(deck.cards).ok;
  const colorChip = deck.firstColor
    ? `<span class="mdl-deck-chip" style="background:${MDL_COLOR_HEX[deck.firstColor]}"></span>`
    : "";
  meta.innerHTML =
    `${colorChip}<span class="mdl-deck-count">${total}枚</span>` +
    `<span class="mdl-deck-valid ${valid ? "is-ok" : "is-ng"}">${valid ? "✓" : "未完成"}</span>`;
  box.appendChild(meta);

  // 選択中のスキン（駒・ペット・裏面）を画像で並べる（ユーザー要望2026-08-11）。
  const cos = document.createElement("div");
  cos.className = "mdl-deck-cosmetics";
  const pieceCos = document.createElement("div");
  pieceCos.className = "mdl-cos";
  pieceCos.title = "駒スキン";
  const pieceImg = document.createElement("img");
  pieceImg.src = pieceThumbSrc(deck.firstColor, deck.pieceSkinIndex ?? 0);
  pieceImg.alt = "";
  pieceImg.loading = "lazy";
  pieceCos.appendChild(pieceImg);
  const petCos = document.createElement("div");
  petCos.className = "mdl-cos mdl-cos-pet";
  petCos.title = "ペット";
  const petIdx = deck.petIndex ?? 0;
  if (petMod) {
    const opt = petMod.PET_OPTIONS[petIdx] || petMod.PET_OPTIONS[0];
    if (opt?.sprite) {
      const im = document.createElement("img");
      im.src = petMod.petSpriteSrc(opt.sprite, "front", "static");
      im.alt = "";
      petCos.appendChild(im);
    } else {
      petCos.textContent = opt?.emoji ?? "🚫";
    }
  } else {
    petCos.textContent = "🐾";
  }
  const backCos = document.createElement("div");
  backCos.className = "mdl-cos";
  backCos.title = "裏面スキン";
  const backImg = document.createElement("img");
  backImg.src = backPathFor(deck.cardBackSetIndex ?? 0);
  backImg.alt = "";
  backImg.loading = "lazy";
  backCos.appendChild(backImg);
  cos.append(pieceCos, petCos, backCos);
  box.appendChild(cos);

  // 箱クリックで編集。
  box.addEventListener("click", () => editDeck(deck.id));

  // メイン設定・複製・削除（箱の隅の小ボタン。クリックは箱の編集へ伝播させない）。
  const actions = document.createElement("div");
  actions.className = "mdl-deck-actions";
  // メインデッキにする（★＝メイン中／☆＝メインにする）。ユーザー要望「メインデッキを設定できるように」。
  const mainBtn = document.createElement("button");
  mainBtn.type = "button";
  mainBtn.className = "mdl-deck-action mdl-deck-action-main" + (isMain ? " is-main" : "");
  mainBtn.title = isMain ? "メインデッキ（CPU戦・ランク戦で使うデッキ）" : "メインデッキにする";
  mainBtn.textContent = isMain ? "★" : "☆";
  mainBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isMain) return; // 既にメイン
    setSelectedDeckId(deck.id);
    renderGrid();
  });
  const dupBtn = document.createElement("button");
  dupBtn.type = "button";
  dupBtn.className = "mdl-deck-action";
  dupBtn.title = "複製";
  dupBtn.textContent = "⧉";
  dupBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const dup = duplicateDeck(deck.id, currentDeckSlotLimit());
    if (!dup) {
      alert("マイデッキの作成上限に達しています。ショップの「🃏 マイデッキ枠 ＋2」を購入すると増やせます。");
      return;
    }
    renderGrid();
  });
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "mdl-deck-action mdl-deck-action-del";
  delBtn.title = "削除";
  delBtn.textContent = "✕";
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (confirm(`「${deck.name || "マイデッキ"}」を削除しますか？`)) {
      deleteDeck(deck.id);
      renderGrid();
    }
  });
  actions.append(mainBtn, dupBtn, delBtn);
  box.appendChild(actions);

  return box;
}

function buildNewBox() {
  const box = document.createElement("button");
  box.type = "button";
  box.className = "mdl-deck mdl-deck-new";
  box.setAttribute("aria-label", "新しいデッキを作成");
  const plus = document.createElement("div");
  plus.className = "mdl-deck-new-plus";
  plus.textContent = "＋";
  box.appendChild(plus);
  const label = document.createElement("div");
  label.className = "mdl-deck-new-label";
  label.textContent = "新しいデッキ";
  box.appendChild(label);
  box.addEventListener("click", () => {
    const deck = createDeck("新しいデッキ", currentDeckSlotLimit());
    if (!deck) {
      // renderGridが上限時はこの箱を出さない想定だが、念のための保険。
      alert("マイデッキの作成上限に達しています。ショップの「🃏 マイデッキ枠 ＋2」を購入すると増やせます。");
      return;
    }
    editDeck(deck.id);
  });
  return box;
}

// 作成上限に達した時に「＋新規作成」の代わりに出す案内箱（ショップで増やせる旨）。
function buildLimitReachedBox(limit) {
  const box = document.createElement("div");
  box.className = "mdl-deck mdl-deck-new mdl-deck-limit";
  const icon = document.createElement("div");
  icon.className = "mdl-deck-new-plus";
  icon.textContent = "🔒";
  box.appendChild(icon);
  const label = document.createElement("div");
  label.className = "mdl-deck-new-label";
  label.textContent = `上限${limit}個（ショップで枠を増やせます）`;
  box.appendChild(label);
  return box;
}

function renderGrid() {
  if (!gridEl) return;
  gridEl.innerHTML = "";
  const decks = getAllDecks();
  const limit = currentDeckSlotLimit();
  // 上限未満のときだけ「＋新規作成」を出す。上限到達時はロック案内箱に差し替える。
  gridEl.appendChild(decks.length < limit ? buildNewBox() : buildLimitReachedBox(limit));
  for (const deck of decks) gridEl.appendChild(buildDeckBox(deck));
  // ペットのサムネ用に pet-skins を遅延ロード（読み込めたら一覧を描き直して差し替え）。
  if (!petMod) {
    import("./pet-skins.js")
      .then((m) => {
        petMod = m;
        renderGrid();
      })
      .catch(() => {});
  }
}

// 編集画面へ（一覧を閉じ、戻る時に一覧を開き直す）。
function editDeck(deckId) {
  const cb = onCloseCb;
  closeMyDeckList();
  openMyDeckBuilder(deckId, () => openMyDeckList(cb));
}

export function openMyDeckList(onClose) {
  if (overlayEl) return;
  onCloseCb = onClose;

  overlayEl = document.createElement("div");
  overlayEl.id = "my-deck-list-page";

  const header = document.createElement("div");
  header.id = "mdl-header";
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "mdl-back";
  backBtn.textContent = "← 戻る";
  backBtn.addEventListener("click", () => {
    closeMyDeckList();
    onClose?.();
  });
  header.appendChild(backBtn);
  const title = document.createElement("div");
  title.id = "mdl-title";
  title.textContent = "🃏 マイデッキ";
  header.appendChild(title);
  overlayEl.appendChild(header);

  gridEl = document.createElement("div");
  gridEl.id = "mdl-grid";
  overlayEl.appendChild(gridEl);

  document.body.appendChild(overlayEl);
  syncFullScreenPageActive();
  renderGrid();
}

export function closeMyDeckList() {
  overlayEl?.remove();
  overlayEl = null;
  gridEl = null;
  syncFullScreenPageActive(); // 閉じたらオプションエリアの前面化も解除（続き303）
}
