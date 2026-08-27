// マイデッキ戦の「デッキ選択」オーバーレイ（ユーザー要望2026-08-11、F4）。
// 開始時に全員へ出す（60秒）。ロビーからも事前選択に使える。自分のデッキから1つ選ぶか、
// 「おまかせ」でランダム7枚。タイムアップ時は自動でランダム。選んだ結果（解決済みデッキ）を
// onResolved で返す（呼び出し側 online.js が座席へ保存する）。
//
// 解決済みデッキ = { deckId, name, cards, firstColor, pieceSkinIndex, petIndex, cardBackSetIndex, random }。
// firstColor が null のデッキはここでランダムな色に確定する（対戦では色が要るため）。

import { getCardImagePath } from "./cards-data.js";
import { getAllDecks, makeRandomDeck, createDeck, validateDeck, deckTotal, FIRST_COLORS } from "./my-deck.js";

const MDS_COLOR_HEX = {
  red: "#c70025",
  orange: "#ee781f",
  yellow: "#fabe00",
  green: "#22ac38",
  blue: "#1bb8ce",
  pink: "#f19ec2",
  purple: "#915da3",
};

let overlayEl = null;
let countdownTimer = null;
let resolvedOnce = false;
let onResolvedCb = null;

function randomFirstColor() {
  return FIRST_COLORS[Math.floor(Math.random() * FIRST_COLORS.length)];
}

// デッキ（保存形）を対戦用に解決する。firstColorが無ければランダムに確定。
function resolveDeck(deck, random = false) {
  return {
    deckId: deck.id ?? null,
    name: deck.name ?? "マイデッキ",
    cards: { ...deck.cards },
    firstColor: deck.firstColor || randomFirstColor(),
    pieceSkinIndex: typeof deck.pieceSkinIndex === "number" ? deck.pieceSkinIndex : null,
    petIndex: typeof deck.petIndex === "number" ? deck.petIndex : null,
    cardBackSetIndex: typeof deck.cardBackSetIndex === "number" ? deck.cardBackSetIndex : null,
    random,
  };
}

function finish(resolved) {
  if (resolvedOnce) return;
  resolvedOnce = true;
  clearInterval(countdownTimer);
  const cb = onResolvedCb;
  closeDeckSelect();
  cb?.(resolved);
}

function representativeCardId(deck) {
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

function buildDeckBox(deck) {
  const valid = validateDeck(deck.cards).ok;
  const box = document.createElement("button");
  box.type = "button";
  box.className = "mds-deck" + (valid ? "" : " is-invalid");
  box.disabled = !valid;

  const art = document.createElement("div");
  art.className = "mds-deck-art";
  const accent = deck.firstColor ? MDS_COLOR_HEX[deck.firstColor] : "#64748b";
  art.style.setProperty("--mds-accent", accent);
  const rep = representativeCardId(deck);
  if (rep) {
    const img = document.createElement("img");
    img.src = getCardImagePath(rep);
    img.alt = "";
    img.loading = "lazy";
    art.appendChild(img);
  }
  box.appendChild(art);

  const name = document.createElement("div");
  name.className = "mds-deck-name";
  name.textContent = deck.name || "マイデッキ";
  box.appendChild(name);

  const meta = document.createElement("div");
  meta.className = "mds-deck-meta";
  meta.textContent = valid ? `${deckTotal(deck.cards)}枚` : "未完成（使用不可）";
  box.appendChild(meta);

  if (valid) box.addEventListener("click", () => finish(resolveDeck(deck, false)));
  return box;
}

function renderBody(bodyEl) {
  bodyEl.innerHTML = "";
  const decks = getAllDecks();
  if (decks.length === 0) {
    const empty = document.createElement("div");
    empty.className = "mds-empty";
    empty.textContent = "使えるデッキがありません。「おまかせ」でランダムに組むか、「新規作成」で作れます。";
    bodyEl.appendChild(empty);
  } else {
    const grid = document.createElement("div");
    grid.className = "mds-grid";
    for (const deck of decks) grid.appendChild(buildDeckBox(deck));
    bodyEl.appendChild(grid);
  }
}

// durationSec: カウントダウン秒数（0以下でカウントダウン無し＝ロビーからの事前選択用）。
// onHome: 指定するとアクション行に「🏠 ホームに戻る」ボタンを出す（ユーザー要望：デッキ選択
// まで来てからやめたい時に、戻る手段が無く詰まっていた）。対局が既に始まっている最中の
// デッキ選択（main.jsのshowDeckSelect）では抜けられると困るので、渡すのは対局開始前の
// 入口（ランク戦のマッチング前・物語の本気エイドス戦の開始前）だけにしている。
export function openDeckSelect({ durationSec = 60, onResolved, subtitle, onHome } = {}) {
  if (overlayEl) return;
  resolvedOnce = false;
  onResolvedCb = onResolved;

  overlayEl = document.createElement("div");
  overlayEl.id = "my-deck-select";

  const panel = document.createElement("div");
  panel.id = "mds-panel";

  const title = document.createElement("div");
  title.id = "mds-title";
  title.textContent = "🃏 使用するマイデッキを選択";
  panel.appendChild(title);

  const sub = document.createElement("div");
  sub.id = "mds-subtitle";
  sub.textContent = subtitle || "デッキを選ぶか「おまかせ」を押してください。";
  panel.appendChild(sub);

  let countdownEl = null;
  if (durationSec > 0) {
    countdownEl = document.createElement("div");
    countdownEl.id = "mds-countdown";
    panel.appendChild(countdownEl);
  }

  const body = document.createElement("div");
  body.id = "mds-body";
  panel.appendChild(body);
  renderBody(body);

  const actions = document.createElement("div");
  actions.id = "mds-actions";
  const rndBtn = document.createElement("button");
  rndBtn.type = "button";
  rndBtn.className = "mds-action mds-action-random";
  rndBtn.textContent = "🎲 おまかせ（ランダム7枚）";
  rndBtn.addEventListener("click", () => finish(resolveDeck(makeRandomDeck("おまかせデッキ"), true)));
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "mds-action mds-action-new";
  newBtn.textContent = "＋ 新規作成";
  newBtn.addEventListener("click", async () => {
    // 選択中に新しいデッキを作る。編集を閉じたらこの選択オーバーレイの一覧を作り直す
    // （カウントダウンは継続。ピッカー同様に動的importでTDZ回避）。
    const deck = createDeck("新しいデッキ");
    const { openMyDeckBuilder } = await import("./my-deck-builder.js");
    if (overlayEl) overlayEl.style.display = "none";
    openMyDeckBuilder(deck.id, () => {
      if (overlayEl) {
        overlayEl.style.display = "";
        renderBody(body);
      }
    });
  });
  actions.append(rndBtn, newBtn);
  if (typeof onHome === "function") {
    const homeBtn = document.createElement("button");
    homeBtn.type = "button";
    homeBtn.className = "mds-action mds-action-home";
    homeBtn.textContent = "🏠 ホームに戻る";
    homeBtn.addEventListener("click", () => {
      if (resolvedOnce) return;
      resolvedOnce = true; // カウントダウンの自動確定（finish）が後から走らないように
      clearInterval(countdownTimer);
      closeDeckSelect();
      onHome();
    });
    actions.appendChild(homeBtn);
  }
  panel.appendChild(actions);

  overlayEl.appendChild(panel);
  document.body.appendChild(overlayEl);

  if (durationSec > 0) {
    let remain = Math.ceil(durationSec);
    const tick = () => {
      countdownEl.textContent = `残り ${remain} 秒（時間切れでランダムになります）`;
      if (remain <= 0) {
        finish(resolveDeck(makeRandomDeck("おまかせデッキ"), true));
        return;
      }
      remain -= 1;
    };
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
}

export function closeDeckSelect() {
  clearInterval(countdownTimer);
  countdownTimer = null;
  overlayEl?.remove();
  overlayEl = null;
}

export function isDeckSelectOpen() {
  return !!overlayEl;
}
