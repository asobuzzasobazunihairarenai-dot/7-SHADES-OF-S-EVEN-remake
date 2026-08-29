import { t } from "./ui-text.js"; // UI英語化フェーズ10（文言は ui-text.js の title.* にある）

// 称号（ユーザー要望2026-08-28「称号を作ってもいいかも。これはアプリ側から作る必要がありそう」
// →「称号はコレクションしていく感じで！その中から１つお気に入りを選んでステータスに明示する
// イメージ」）。
//
// 設計の要点:
//  ・**解禁は保存しない**。条件を満たしているかを、その都度いまの戦績から計算する（computeUnlockedTitleKeys）。
//    こうすると「解禁テーブル」が要らず、過去にさかのぼって自動的にコレクションが埋まり、後から条件を
//    調整しても矛盾が残らない。保存するのは「お気に入りに選んだ1つ」だけ。
//  ・**保存先は戦績管理システムの players.title_key**（1列）。so7_user_profiles は
//    「自分の行しか読めない」RLS（using (user_id = auth.uid())）なので、他人の称号を表示できない。
//    players は全員が読める（players_select using(true)）ため、戦績サイト側でも誰の称号でも表示できる。
//  ・称号の定義（キー→名前・アイコン）は戦績サイト側にも同じものを複製してある（getTierInfo等と同じ
//    やり方。姉妹サイトはこのファイルをimportできないため）。**片方を直したらもう片方も直すこと**。

// 判定に使う値の意味:
//   matchesCount / winsCount / winRate … 戦績システムの集計値（seed分を含む）
//   rank        … ランク戦の段位 0..6（ランク戦の記録が無ければ null）
//   bugReports  … 不具合報告の件数
export const TITLE_DEFS = [
  // ── 戦績（対戦数）──────────────────────────────────────────────
  { key: "debut", labelKey: "title.debut.label", descKey: "title.debut.desc", groupKey: "title.group.record",
    test: (s) => s.matchesCount >= 1 },
  { key: "regular", labelKey: "title.regular.label", descKey: "title.regular.desc", groupKey: "title.group.record",
    test: (s) => s.matchesCount >= 10 },
  { key: "veteran", labelKey: "title.veteran.label", descKey: "title.veteran.desc", groupKey: "title.group.record",
    test: (s) => s.matchesCount >= 30 },
  { key: "pillar", labelKey: "title.pillar.label", descKey: "title.pillar.desc", groupKey: "title.group.record",
    test: (s) => s.matchesCount >= 50 },
  // ── 戦績（勝利）────────────────────────────────────────────────
  { key: "first-win", labelKey: "title.first-win.label", descKey: "title.first-win.desc", groupKey: "title.group.record",
    test: (s) => s.winsCount >= 1 },
  { key: "winner5", labelKey: "title.winner5.label", descKey: "title.winner5.desc", groupKey: "title.group.record",
    test: (s) => s.winsCount >= 5 },
  { key: "winner10", labelKey: "title.winner10.label", descKey: "title.winner10.desc", groupKey: "title.group.record",
    test: (s) => s.winsCount >= 10 },
  // ── 戦績（勝率。試合数が少ないうちは付かないように10戦以上を条件にする）──────
  { key: "sharp", labelKey: "title.sharp.label", descKey: "title.sharp.desc", groupKey: "title.group.record",
    test: (s) => s.matchesCount >= 10 && s.winRate >= 50 },
  { key: "dominant", labelKey: "title.dominant.label", descKey: "title.dominant.desc", groupKey: "title.group.record",
    test: (s) => s.matchesCount >= 10 && s.winRate >= 70 },
  // ── ランク戦の段位 ──────────────────────────────────────────────
  { key: "ranked-debut", labelKey: "title.ranked-debut.label", descKey: "title.ranked-debut.desc", groupKey: "title.group.ranked",
    test: (s) => s.rank !== null && s.rank !== undefined },
  { key: "rank-gold", labelKey: "title.rank-gold.label", descKey: "title.rank-gold.desc", groupKey: "title.group.ranked",
    test: (s) => (s.rank ?? -1) >= 2 },
  { key: "rank-diamond", labelKey: "title.rank-diamond.label", descKey: "title.rank-diamond.desc", groupKey: "title.group.ranked",
    test: (s) => (s.rank ?? -1) >= 4 },
  { key: "rank-legend", labelKey: "title.rank-legend.label", descKey: "title.rank-legend.desc", groupKey: "title.group.ranked",
    test: (s) => (s.rank ?? -1) >= 6 },
  // ── 貢献（不具合報告。テストプレイを支えてくれた人への称号）────────────────
  { key: "reporter1", labelKey: "title.reporter1.label", descKey: "title.reporter1.desc", groupKey: "title.group.contrib",
    test: (s) => s.bugReports >= 1 },
  { key: "reporter5", labelKey: "title.reporter5.label", descKey: "title.reporter5.desc", groupKey: "title.group.contrib",
    test: (s) => s.bugReports >= 5 },
  { key: "reporter10", labelKey: "title.reporter10.label", descKey: "title.reporter10.desc", groupKey: "title.group.contrib",
    test: (s) => s.bugReports >= 10 },
];

export function getTitleDef(key) {
  return TITLE_DEFS.find((t) => t.key === key) ?? null;
}

// 表示用の称号名。未設定・未知のキーならnull。
// ユーザー要望2026-08-28（続き320）「称号についている絵文字は不要」＝アイコンは持たない。
export function formatTitle(key) {
  const def = getTitleDef(key);
  return def ? t(def.labelKey) : null;
}

// 今の戦績で解禁されている称号のキー一覧。stats に足りない項目は0/未設定として扱う
// （＝取得できていない情報のせいで誤って解禁扱いにはならない）。
export function computeUnlockedTitleKeys(stats) {
  const s = {
    matchesCount: stats?.matchesCount ?? 0,
    winsCount: stats?.winsCount ?? 0,
    winRate: stats?.winRate ?? 0,
    rank: stats?.rank ?? null,
    bugReports: stats?.bugReports ?? 0,
  };
  return TITLE_DEFS.filter((t) => {
    try {
      return !!t.test(s);
    } catch (err) {
      return false;
    }
  }).map((t) => t.key);
}

// グループ（戦績／ランク戦／貢献）ごとに並べ替えた定義一覧。コレクション表示用。
export function getTitleGroups() {
  const groups = [];
  for (const def of TITLE_DEFS) {
    const groupName = t(def.groupKey);
    let g = groups.find((x) => x.name === groupName);
    if (!g) {
      g = { name: groupName, titles: [] };
      groups.push(g);
    }
    g.titles.push(def);
  }
  return groups;
}
