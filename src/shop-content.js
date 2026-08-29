// ショップのカタログ（ユーザー要望「駒スキンやアバター、カード裏面、プレイマット背景を
// 購入できるようにします」）。各カテゴリの実際の項目一覧・価格は、それぞれの持ち主モジュール
// （piece-skins.js/card-back-skins.js/playmat.js/background.js）が唯一の正として持ち、
// ここではその集計だけを行う（ラベル・id・価格の複製を避けるため）。
//
// ユーザー確認済み: 駒スキン・カード裏面・プレイマット・背景は現在すでに全項目無料だが、
// まだ既存ユーザーがいないため、今回から各カテゴリの標準（既定）項目だけ無料のまま残し、
// それ以外は有料にする（各モジュールのgetXShopItems()参照）。価格はまだ具体的な指定が
// 無いため、対局終了ごとの通貨獲得額（50、supabase_setup_so7.sqlのso7_award_match_currency
// 参照）を基準にしたプレースホルダー値にしてある。実際の金額は後で調整すること。
import { getSkinShopItems } from "./piece-skins.js";
import { getCardBackShopItems } from "./card-back-skins.js";
import { getPlaymatShopItems } from "./playmat.js";
import { getBackgroundShopItems } from "./background.js";
import { getPetShopItems } from "./pet-skins.js";
import { getAvatarShopItems } from "./player-identity.js";
import { isItemUnlocked } from "./online.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

// label は多言語化のため labelKey（ui-text.js のキー）で持ち、表示側（shop.js）が t() で解決する。
export const SHOP_CATEGORIES = [
  { key: "piece-skin", labelKey: "shop.cat.pieceSkin", items: getSkinShopItems() },
  { key: "card-back", labelKey: "shop.cat.cardBack", items: getCardBackShopItems() },
  { key: "playmat", labelKey: "shop.cat.playmat", items: getPlaymatShopItems() },
  { key: "background", labelKey: "shop.cat.background", items: getBackgroundShopItems() },
  // ユーザー要望「ペットをショップに。全て有料・初期は未所持・少し高め（500→300）」。
  { key: "pet", labelKey: "shop.cat.pet", items: getPetShopItems() },
  // ユーザー要望「国王アバターはショップで200で有料に」。色アバターは無料のまま、
  // 国王/女王アバターだけを有料商品として並べる（getAvatarShopItems）。
  { key: "avatar", labelKey: "shop.cat.avatar", items: getAvatarShopItems() },
  // ユーザー要望2026-08-12「作成できるマイデッキは基本2個。ショップで上限を+2できる（100コイン）」。
  // 購入するとisItemUnlocked("mydeck-extra-slots")がtrueになり、my-deck-list.jsが maxDeckSlots で
  // 作成上限を2→4に上げる。見た目上の画像はマイデッキアイコンを流用。
  {
    key: "mydeck",
    labelKey: "shop.cat.mydeck",
    items: [
      {
        itemKey: "mydeck-extra-slots",
        labelKey: "shop.item.deckSlots",
        cost: 100,
        imagePath: "assets/icons/my-deck.svg",
      },
    ],
  },
];

// ユーザー要望「ショップ画面とマイページにアイテムコンプリート率を表示したい」への対応。
// 全カテゴリの項目数のうち、無料(cost===0)または既に購入済みの項目の割合を返す
// （未ログインの間はisItemUnlockedが常にtrueを返すため100%になる——ローカル/オフライン
// プレイを制限しない既存方針と同じ理由）。
export function getShopCompletionStats() {
  let owned = 0;
  let total = 0;
  for (const category of SHOP_CATEGORIES) {
    for (const item of category.items) {
      total++;
      if (item.cost === 0 || isItemUnlocked(item.itemKey)) owned++;
    }
  }
  return { owned, total, percent: total > 0 ? Math.round((owned / total) * 100) : 0 };
}
