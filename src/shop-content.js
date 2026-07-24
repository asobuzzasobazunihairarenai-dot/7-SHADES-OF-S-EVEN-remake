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
import { isItemUnlocked } from "./online.js";

export const SHOP_CATEGORIES = [
  { key: "piece-skin", label: "🎲 駒スキン", items: getSkinShopItems() },
  { key: "card-back", label: "🂠 カード裏面", items: getCardBackShopItems() },
  { key: "playmat", label: "🟩 プレイマット", items: getPlaymatShopItems() },
  { key: "background", label: "🖼️ 背景画像", items: getBackgroundShopItems() },
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
