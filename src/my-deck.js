// マイデッキ戦（マイデッキ.txtの暫定ルール）のデータ・所持・検証・保存を担う葉モジュール。
// cards-data.js以外に依存させない（online.js等を直接importするとcards-data.js側の
// 循環import／TDZの温床になるため。card-back-skins.jsと同じinject方針で永続化だけ後付けする）。
//
// v2（2026-08-11、ユーザー要望）: マイデッキを「複数」持てるようにした。1デッキ =
//   { id, name, cards:{cardId:count}, firstColor, pieceSkinIndex, petIndex, cardBackSetIndex }。
//   ファーストカードの色・駒スキン・ペット・裏面スキンもデッキごとに設定でき、マイデッキ戦では
//   その対戦の間だけプロフィール既定を上書きして使う。保存形は { decks:[...], selectedId }。
//
// 用語:
//  ・通常カード = NORMAL_CARDS（7色×2種＋虹＋白黒）。ファースト/エターナルは対象外。
//  ・スペシャルカード = 無色(白黒)・なないろの欠片・ONLY(未実装)。1枚につき非スペシャルの
//    通常カードを3枚入れる必要がある（3:1税）。
//  ・所持 = 現状は0thEDITIONの基本セットを全員が初期所持している前提。所持数は
//    NORMAL_CARDSのcount（色落ちキャット1、白/黒各2、他は7）。

import { NORMAL_CARDS, getCardDefinition } from "./cards-data.js";

export const SPECIAL_CARD_COLORS = new Set(["white", "black", "rainbow"]);
// ファーストカード（＝駒）に選べる7色。
export const FIRST_COLORS = ["red", "orange", "yellow", "green", "blue", "pink", "purple"];

export function isSpecialDeckCard(cardId) {
  const def = getCardDefinition(cardId);
  return !!def && SPECIAL_CARD_COLORS.has(def.color);
}

export const MIN_DECK_SIZE = 7;
export const MAX_SAME_NAME_COUNT = 7;
export const SPECIAL_TAX_RATIO = 3;
export const RANDOM_DECK_SIZE = 7; // おまかせ/タイムアップ時のランダムデッキ枚数

const NORMAL_BY_ID = new Map(NORMAL_CARDS.map((c) => [c.id, c]));
const NON_SPECIAL_CARDS = NORMAL_CARDS.filter((c) => !SPECIAL_CARD_COLORS.has(c.color));

export function isDeckableCard(cardId) {
  return NORMAL_BY_ID.has(cardId);
}
export function getDeckableCards() {
  return NORMAL_CARDS.slice();
}
export function getOwnedCount(cardId) {
  return NORMAL_BY_ID.get(cardId)?.count ?? 0;
}
export function maxCopiesFor(cardId) {
  return Math.min(getOwnedCount(cardId), MAX_SAME_NAME_COUNT);
}

// deck.cards（{ [cardId]: count }）を検証する。
export function validateDeck(cards) {
  const errors = [];
  let total = 0;
  let specialCount = 0;
  let nonSpecialCount = 0;
  for (const [cardId, rawCount] of Object.entries(cards || {})) {
    const count = Number(rawCount) || 0;
    if (count <= 0) continue;
    const def = getCardDefinition(cardId);
    if (!isDeckableCard(cardId)) {
      errors.push(`「${def?.name ?? cardId}」は通常カードではないためマイデッキに入れられません。`);
      continue;
    }
    const max = maxCopiesFor(cardId);
    if (count > max) errors.push(`「${def.name}」は${max}枚までしか入れられません（現在${count}枚）。`);
    total += count;
    if (isSpecialDeckCard(cardId)) specialCount += count;
    else nonSpecialCount += count;
  }
  if (total < MIN_DECK_SIZE) errors.push(`デッキは${MIN_DECK_SIZE}枚以上必要です（現在${total}枚）。`);
  const requiredNonSpecial = specialCount * SPECIAL_TAX_RATIO;
  if (nonSpecialCount < requiredNonSpecial) {
    errors.push(`スペシャルカード${specialCount}枚には非スペシャルの通常カードが${requiredNonSpecial}枚必要です（現在${nonSpecialCount}枚）。`);
  }
  return { ok: errors.length === 0, errors, total, specialCount, nonSpecialCount, requiredNonSpecial };
}

export function deckTotal(cards) {
  let total = 0;
  for (const v of Object.values(cards || {})) total += Number(v) || 0;
  return total;
}

// ── デッキ雛形・ランダム生成 ─────────────────────────────────────────────
function uid() {
  return `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
export function makeEmptyDeck(name) {
  return {
    id: uid(),
    name: name || "新しいデッキ",
    cards: {},
    firstColor: null, // null = 対戦開始時にランダム
    pieceSkinIndex: null, // null = プロフィール既定
    petIndex: null,
    cardBackSetIndex: null,
  };
}
// おまかせ/タイムアップ用: 非スペシャルの通常カードから7枚ジャスト＋ファースト色ランダム。
export function makeRandomDeck(name) {
  const deck = makeEmptyDeck(name || "おまかせデッキ");
  const cards = {};
  for (let i = 0; i < RANDOM_DECK_SIZE; i++) {
    // まだ上限(所持/同名7)に達していない非スペシャルカードから1枚選ぶ。
    const pool = NON_SPECIAL_CARDS.filter((c) => (cards[c.id] ?? 0) < maxCopiesFor(c.id));
    if (pool.length === 0) break;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    cards[pick.id] = (cards[pick.id] ?? 0) + 1;
  }
  deck.cards = cards;
  deck.firstColor = FIRST_COLORS[Math.floor(Math.random() * FIRST_COLORS.length)];
  return deck;
}

// ── 永続化（複数デッキのストア） ─────────────────────────────────────────
// フェーズ1は端末ローカル(localStorage)。ログイン中はアカウント(so7_user_profiles.my_deck)
// にも保存/復元する（online.js経由でregisterMyDeckPersistenceにより注入）。
const STORAGE_KEY = "so7-my-deck-v2";
const LEGACY_KEY = "so7-my-deck-v1"; // v1は単一デッキ {cardId:count} だった
let cachedStore = null;
let persistHelper = null;

export function registerMyDeckPersistence(fn) {
  persistHelper = fn;
}

function normalizeDeck(d) {
  if (!d || typeof d !== "object") return null;
  const cards = {};
  for (const [cardId, raw] of Object.entries(d.cards || {})) {
    const n = Number(raw) || 0;
    if (n > 0 && isDeckableCard(cardId)) cards[cardId] = n;
  }
  return {
    id: typeof d.id === "string" ? d.id : uid(),
    name: typeof d.name === "string" && d.name.trim() ? d.name : "デッキ",
    cards,
    firstColor: FIRST_COLORS.includes(d.firstColor) ? d.firstColor : null,
    pieceSkinIndex: typeof d.pieceSkinIndex === "number" ? d.pieceSkinIndex : null,
    petIndex: typeof d.petIndex === "number" ? d.petIndex : null,
    cardBackSetIndex: typeof d.cardBackSetIndex === "number" ? d.cardBackSetIndex : null,
  };
}

// 任意の保存値（v2ストア / v1単一 / 生の{cardId:count}）を { decks, selectedId } に正規化する。
function normalizeStore(raw) {
  // v2形式
  if (raw && typeof raw === "object" && Array.isArray(raw.decks)) {
    const decks = raw.decks.map(normalizeDeck).filter(Boolean);
    const selectedId = decks.some((d) => d.id === raw.selectedId) ? raw.selectedId : decks[0]?.id ?? null;
    return { decks, selectedId };
  }
  // v1/旧: 単一の {cardId:count} → 1デッキへ移行
  if (raw && typeof raw === "object") {
    const looksLikeCards = Object.values(raw).every((v) => typeof v === "number");
    if (looksLikeCards && Object.keys(raw).length > 0) {
      const d = makeEmptyDeck("マイデッキ");
      d.cards = normalizeDeck({ cards: raw }).cards;
      return { decks: [d], selectedId: d.id };
    }
  }
  return { decks: [], selectedId: null };
}

function loadStore() {
  if (cachedStore) return cachedStore;
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      cachedStore = normalizeStore(JSON.parse(rawV2));
      return cachedStore;
    }
    const rawV1 = localStorage.getItem(LEGACY_KEY);
    if (rawV1) {
      cachedStore = normalizeStore(JSON.parse(rawV1));
      persistStore(); // v2へ書き出しておく
      return cachedStore;
    }
  } catch {
    /* 破損時は空から */
  }
  cachedStore = { decks: [], selectedId: null };
  return cachedStore;
}

function persistStore() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedStore));
  } catch {
    /* 保存不可でも編集は続けられる */
  }
  try {
    persistHelper?.({ decks: cachedStore.decks, selectedId: cachedStore.selectedId });
  } catch (err) {
    console.error("saveMyDeck persist failed", err);
  }
}

// ログイン時にアカウント保存済みのストアを流し込む（online.js経由）。
export function setMyDeckFromAccount(raw) {
  cachedStore = normalizeStore(raw);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedStore));
  } catch {
    /* noop */
  }
}

// ── デッキCRUD ───────────────────────────────────────────────────────────
export function getAllDecks() {
  return loadStore().decks.map((d) => ({ ...d, cards: { ...d.cards } }));
}
export function getDeckById(id) {
  const d = loadStore().decks.find((x) => x.id === id);
  return d ? { ...d, cards: { ...d.cards } } : null;
}
export function getSelectedDeckId() {
  return loadStore().selectedId;
}
export function setSelectedDeckId(id) {
  const store = loadStore();
  if (store.decks.some((d) => d.id === id)) {
    store.selectedId = id;
    persistStore();
  }
}
export function createDeck(name) {
  const store = loadStore();
  const d = makeEmptyDeck(name);
  store.decks.push(d);
  store.selectedId = d.id;
  persistStore();
  return { ...d, cards: { ...d.cards } };
}
export function duplicateDeck(id) {
  const store = loadStore();
  const src = store.decks.find((d) => d.id === id);
  if (!src) return null;
  const copy = normalizeDeck({ ...src, cards: { ...src.cards } });
  copy.id = uid();
  copy.name = `${src.name} のコピー`;
  store.decks.push(copy);
  store.selectedId = copy.id;
  persistStore();
  return { ...copy, cards: { ...copy.cards } };
}
export function deleteDeck(id) {
  const store = loadStore();
  store.decks = store.decks.filter((d) => d.id !== id);
  if (store.selectedId === id) store.selectedId = store.decks[0]?.id ?? null;
  persistStore();
}
// エディタが確定したデッキ（1件）を保存する。無ければ追加、あれば置き換え。
export function saveDeck(deck) {
  const store = loadStore();
  const norm = normalizeDeck(deck);
  if (!norm) return;
  const i = store.decks.findIndex((d) => d.id === norm.id);
  if (i >= 0) store.decks[i] = norm;
  else store.decks.push(norm);
  store.selectedId = norm.id;
  persistStore();
  return { ...norm, cards: { ...norm.cards } };
}
