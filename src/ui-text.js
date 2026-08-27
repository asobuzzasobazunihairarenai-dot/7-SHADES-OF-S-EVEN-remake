// アプリのUI文言（メニュー・ボタン等）の多言語化。カードのテキスト(card-text)とは別レイヤー。
// t(key, params) が現在の言語(getLang)の文字列を返す。未定義キーは ja にフォールバックし、
// ja にも無ければキー文字列をそのまま返す（開発中の抜けが画面に見えるように）。
// params は {name} 形式のプレースホルダを置換する（例: t("home.comingSoon", {label:"X"})）。
//
// UI英語化は段階的に進める。まずは最も目に付く画面（ホーム）から。翻訳済みのキーだけを
// ここに足していき、各ファイルはハードコード文字列を t("...") に置き換える。
import { getLang } from "./i18n.js";

const UI = {
  ja: {
    // --- ホーム画面（home-screen.js） ---
    "home.subtitle": "ホーム",
    "home.tile.tutorial": "物語チュートリアル",
    "home.tile.match": "CPUマッチ＆フレンドリーマッチ",
    "home.tile.ranked": "フリーマッチ（ランク戦）",
    "home.tile.shop": "ショップ",
    "home.tile.ranking": "ランキング",
    "home.tile.mypage": "マイページ／マイデッキ編集",
    "home.tile.codex": "図鑑／ルールブック",
    "home.tile.news": "お知らせ／更新情報",
    "home.comingSoon": "「{label}」は近日公開予定です。お楽しみに！",
    "home.comingSoonBadge": "近日公開",
    "home.newBadge": "NEW",
    "home.matchChoice.title": "対戦モードを選択",
    "home.matchChoice.friendly": "フレンドリーマッチ",
    "home.matchChoice.friendlyDesc": "オンラインで対戦（部屋を作る／参加する）",
    "home.matchChoice.cpu": "CPU戦（1人用）",
    "home.matchChoice.cpuDesc": "この端末でCPUと対戦（ログイン不要）",
    "home.matchChoice.difficultyLabel": "🤖 CPUの強さ（CPU戦のみ）",
    "home.matchChoice.difficultyHint": "新人＝ランダム／中級・上級＝賢い思考／最強＝伏せカードののぞき見あり",
    "home.matchChoice.countLabel": "👥 人数（CPU戦のみ）",
    "home.matchChoice.countHint": "あなた＋CPU（3人・4人はCPUが2体・3体に増えます）",
    "home.rankLabel": "あなたのランク",
    "home.rankAboutTitle": "ランク戦について",
    "home.waitingBadge": "🟢 {count}人が対戦募集中！",
    "common.back": "← 戻る",
    // --- CPUの強さ・人数（home / options 共有） ---
    "cpu.diff.rookie": "新人",
    "cpu.diff.intermediate": "中級",
    "cpu.diff.advanced": "上級",
    "cpu.diff.master": "最強",
    "cpu.count.2": "2人",
    "cpu.count.3": "3人",
    "cpu.count.4": "4人",
  },
  en: {
    // --- Home screen ---
    "home.subtitle": "Home",
    "home.tile.tutorial": "Story Tutorial",
    "home.tile.match": "CPU & Friendly Match",
    "home.tile.ranked": "Free Match (Ranked)",
    "home.tile.shop": "Shop",
    "home.tile.ranking": "Rankings",
    "home.tile.mypage": "My Page / Deck Editor",
    "home.tile.codex": "Codex / Rulebook",
    "home.tile.news": "News / Updates",
    "home.comingSoon": "“{label}” is coming soon. Stay tuned!",
    "home.comingSoonBadge": "Coming soon",
    "home.newBadge": "NEW",
    "home.matchChoice.title": "Choose a match mode",
    "home.matchChoice.friendly": "Friendly Match",
    "home.matchChoice.friendlyDesc": "Play online (create or join a room)",
    "home.matchChoice.cpu": "CPU Match (solo)",
    "home.matchChoice.cpuDesc": "Play against the CPU on this device (no login)",
    "home.matchChoice.difficultyLabel": "🤖 CPU strength (CPU match only)",
    "home.matchChoice.difficultyHint": "Rookie = random / Intermediate & Advanced = smart AI / Master = peeks at face-down cards",
    "home.matchChoice.countLabel": "👥 Players (CPU match only)",
    "home.matchChoice.countHint": "You + CPU (3 / 4 players add 2 / 3 CPUs)",
    "home.rankLabel": "Your rank",
    "home.rankAboutTitle": "About ranked play",
    "home.waitingBadge": "🟢 {count} looking for a match!",
    "common.back": "← Back",
    // --- CPU strength / player count (shared home / options) ---
    "cpu.diff.rookie": "Rookie",
    "cpu.diff.intermediate": "Intermediate",
    "cpu.diff.advanced": "Advanced",
    "cpu.diff.master": "Master",
    "cpu.count.2": "2 players",
    "cpu.count.3": "3 players",
    "cpu.count.4": "4 players",
  },
};

export function t(key, params) {
  const lang = getLang();
  let s = (UI[lang] && UI[lang][key]) ?? UI.ja[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  }
  return s;
}
