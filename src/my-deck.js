// マイデッキ戦（マイデッキ.txtの暫定ルール）のデータ・所持・検証・保存を担う葉モジュール。
// cards-data.js以外に依存させない（online.js等を直接importするとcards-data.js側の
// 循環import／TDZの温床になるため。card-back-skins.jsと同じinject方針で永続化だけ後付けする）。
//
// 用語:
//  ・通常カード = NORMAL_CARDS（7色×2種＋虹＋白黒）。ファースト/エターナルは対象外。
//  ・スペシャルカード = 無色(白黒)・なないろの欠片・ONLY(未実装)。1枚につき非スペシャルの
//    通常カードを3枚入れる必要がある（3:1税）。
//  ・所持 = 現状は0thEDITIONの基本セットを全員が初期所持している前提。所持数は
//    NORMAL_CARDSのcount（色落ちキャット1、白/黒各2、他は7）。将来カードが増えて所持の
//    概念が本格化したら getOwnedCount をアカウント所持データとマージするだけでよい。

import { NORMAL_CARDS, getCardDefinition } from "./cards-data.js";

// スペシャルカード判定に使う色（3:1税の対象）。ONLYカードは未実装なので現状は白黒＋虹。
export const SPECIAL_CARD_COLORS = new Set(["white", "black", "rainbow"]);

export function isSpecialDeckCard(cardId) {
  const def = getCardDefinition(cardId);
  return !!def && SPECIAL_CARD_COLORS.has(def.color);
}

// ルール定数。
export const MIN_DECK_SIZE = 7;         // 7枚以上でなければならない。
export const MAX_SAME_NAME_COUNT = 7;   // 同名は7枚まで。
export const SPECIAL_TAX_RATIO = 3;     // スペシャル1枚につき非スペシャル3枚。

// 通常カードの逆引き（所持数・マイデッキ可否の判定を高速化）。
const NORMAL_BY_ID = new Map(NORMAL_CARDS.map((c) => [c.id, c]));

export function isDeckableCard(cardId) {
  return NORMAL_BY_ID.has(cardId);
}

// マイデッキに入れられるカード一覧（＝通常カードのみ）。ビルダーの「所持カード」欄に並べる。
export function getDeckableCards() {
  return NORMAL_CARDS.slice();
}

// 所持枚数。現状は基本セットのcountがそのまま所持数。
export function getOwnedCount(cardId) {
  return NORMAL_BY_ID.get(cardId)?.count ?? 0;
}

// このカードをデッキに入れられる最大枚数（所持数と同名上限7の小さい方）。
export function maxCopiesFor(cardId) {
  return Math.min(getOwnedCount(cardId), MAX_SAME_NAME_COUNT);
}

// deck: { [cardId]: count } 形式。合計・スペシャル内訳と、破っているルールの一覧を返す。
export function validateDeck(deck) {
  const errors = [];
  let total = 0;
  let specialCount = 0;
  let nonSpecialCount = 0;

  for (const [cardId, rawCount] of Object.entries(deck || {})) {
    const count = Number(rawCount) || 0;
    if (count <= 0) continue;
    const def = getCardDefinition(cardId);
    if (!isDeckableCard(cardId)) {
      errors.push(`「${def?.name ?? cardId}」は通常カードではないためマイデッキに入れられません。`);
      continue;
    }
    const max = maxCopiesFor(cardId);
    if (count > max) {
      errors.push(`「${def.name}」は${max}枚までしか入れられません（現在${count}枚）。`);
    }
    total += count;
    if (isSpecialDeckCard(cardId)) specialCount += count;
    else nonSpecialCount += count;
  }

  if (total < MIN_DECK_SIZE) {
    errors.push(`デッキは${MIN_DECK_SIZE}枚以上必要です（現在${total}枚）。`);
  }

  const requiredNonSpecial = specialCount * SPECIAL_TAX_RATIO;
  if (nonSpecialCount < requiredNonSpecial) {
    errors.push(
      `スペシャルカード${specialCount}枚には非スペシャルの通常カードが${requiredNonSpecial}枚必要です（現在${nonSpecialCount}枚）。`,
    );
  }

  return { ok: errors.length === 0, errors, total, specialCount, nonSpecialCount, requiredNonSpecial };
}

// ── 永続化 ───────────────────────────────────────────────────────────────
// フェーズ1は端末ローカル(localStorage)に保存する。オンライン対戦で相手に裏面を見せる
// フェーズでは、アカウント(so7_user_profiles)にも保存して同期する（online.js経由で
// registerMyDeckPersistenceにより注入する。card-back-skins.jsのsavePreferenceと同じ方針）。
const STORAGE_KEY = "so7-my-deck-v1";
let cachedDeck = null;
let persistHelper = null;

export function registerMyDeckPersistence(fn) {
  persistHelper = fn;
}

// ログイン時にアカウント保存済みのデッキを流し込むための入口（online.js経由）。
export function setMyDeckFromAccount(deck) {
  if (!deck || typeof deck !== "object") return;
  cachedDeck = normalizeDeck(deck);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedDeck));
  } catch {
    /* localStorage不可でも致命的ではない */
  }
}

function normalizeDeck(deck) {
  const out = {};
  for (const [cardId, rawCount] of Object.entries(deck || {})) {
    const count = Number(rawCount) || 0;
    if (count > 0 && isDeckableCard(cardId)) out[cardId] = count;
  }
  return out;
}

export function getMyDeck() {
  if (!cachedDeck) {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      cachedDeck = raw ? normalizeDeck(JSON.parse(raw)) : {};
    } catch {
      cachedDeck = {};
    }
  }
  return { ...cachedDeck };
}

export function saveMyDeck(deck) {
  cachedDeck = normalizeDeck(deck);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedDeck));
  } catch {
    /* 保存できなくてもUI上は編集を続けられる */
  }
  // ログイン中ならアカウントにも保存（未注入なら何もしない）。
  try {
    persistHelper?.({ ...cachedDeck });
  } catch (err) {
    console.error("saveMyDeck persist failed", err);
  }
  return { ...cachedDeck };
}

// 合計枚数（マイデッキが空か・7枚以上あるかの簡易判定に使う）。
export function deckTotal(deck) {
  let total = 0;
  for (const v of Object.values(deck || {})) total += Number(v) || 0;
  return total;
}
