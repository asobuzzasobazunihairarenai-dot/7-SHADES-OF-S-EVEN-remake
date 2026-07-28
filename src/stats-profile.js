// ユーザー要望「戦績システムと連携しているプレイヤーはステータスエリアにランクを
// 表示させたい。マイページも新設したい（対戦数・勝率・各種順位等）」への対応。
//
// 戦績管理システム（姉妹プロジェクト、G:\...\index.html）は、ランク（色付きリング）・
// 対戦数・勝率・順位のいずれも事前計算してDBへ保存してはおらず、players/matchesの
// 生データを毎回クライアント側で集計している（computePlayerStats/getTierInfo等、
// index.htmlのコメント参照）。同じ結果になるよう、ここでも同じロジックを複製する
// （姉妹プロジェクト側のテーブル・計算方法を変える権限は無いため、独自にサーバー側の
// ビュー等を新設するのではなく、姉妹プロジェクトと全く同じ「クライアントで集計」
// 方式を踏襲するのが最も食い違いが起きにくい）。

let client = null;
export function setStatsProfileClient(supabaseClient) {
  client = supabaseClient;
}

// 姉妹プロジェクトのgetTierInfo(matchCount, customColor)をそのまま複製したもの
// （index.html参照）。customColorは今のところデジタル版側では設定手段が無いため
// 常にnullで呼ぶが、将来のために引数だけ残す。
export function getTierInfo(matchCount, customColor) {
  if (customColor) {
    return { type: "ring", color: customColor, glow: null, label: "カスタムカラー" };
  }
  if (matchCount >= 15) {
    return { type: "rainbow", label: "レインボーレジェンド" };
  }
  if (matchCount >= 10) {
    return { type: "ring", color: "#0a0a0a", glow: "rgba(0,0,0,0.7)", label: "ブラックマスター" };
  }
  if (matchCount >= 8) {
    return { type: "ring", color: "#ffffff", glow: "rgba(255,255,255,0.9)", label: "ホワイトマスター" };
  }
  const tierColors = ["transparent", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"];
  const tierLabels = ["テスター見習い", "レッドテスター", "オレンジテスター", "イエローテスター", "グリーンテスター", "ブルーテスター", "ピンクテスター", "パープルテスター"];
  const idx = Math.min(matchCount, 7);
  return { type: "ring", color: tierColors[idx], glow: null, label: tierLabels[idx] };
}

// players/matchesの生データから、姉妹プロジェクトのcomputePlayerStats()と同じ計算で
// 全プレイヤー分のmatchesCount/winsCount/winRateを求める。
function computeAllPlayerStats(players, matches) {
  const stats = new Map();
  for (const p of players) {
    stats.set(p.id, {
      id: p.id,
      matchesCount: p.seed_matches_count || 0,
      winsCount: p.seed_wins_count || 0,
    });
  }
  for (const m of matches) {
    if (m.status !== "approved") continue;
    for (const memberId of m.members || []) {
      const s = stats.get(memberId);
      if (!s) continue;
      s.matchesCount += 1;
      if (m.winner_id === memberId) s.winsCount += 1;
    }
  }
  for (const s of stats.values()) {
    s.winRate = s.matchesCount > 0 ? Math.round((s.winsCount / s.matchesCount) * 100) : 0;
  }
  return stats;
}

// 順位を求める（同率は同順位、姉妹プロジェクトのdense-rank表示とは違い単純な
// competition rankingにしてある——「自分は全体の何位か」を知るのが目的のため、
// 表彰台形式の3位までの特別扱いは不要）。
function rankOf(sortedIds, targetId) {
  const idx = sortedIds.indexOf(targetId);
  return idx < 0 ? null : idx + 1;
}

// 認証済みユーザー(userId)が戦績システムのどのプレイヤーと連携しているかを調べ、
// 連携していればその人の対戦数・勝率・各種順位・ランク（色付きリング）等をまとめて
// 返す。連携していなければ{linked:false}を返す。
export async function fetchStatsProfile(userId) {
  if (!client || !userId) return { linked: false };

  const { data: me, error: meError } = await client
    .from("players")
    .select("id, name, avatar_url, custom_triangle_color, status, created_at, seed_matches_count, seed_wins_count")
    .eq("user_id", userId)
    .maybeSingle();
  if (meError) throw meError;
  if (!me) return { linked: false };

  const [{ data: players, error: playersError }, { data: matches, error: matchesError }] = await Promise.all([
    client.from("players").select("id, status, is_staff, seed_matches_count, seed_wins_count"),
    client.from("matches").select("members, winner_id, status"),
  ]);
  if (playersError) throw playersError;
  if (matchesError) throw matchesError;

  // 順位の対象は、姉妹プロジェクトのランキング表示と同じく承認済み・スタッフ除外。
  const rankablePlayers = (players ?? []).filter((p) => p.status === "approved" && !p.is_staff);
  const statsById = computeAllPlayerStats(rankablePlayers, matches ?? []);

  const myStats = statsById.get(me.id) ?? { matchesCount: 0, winsCount: 0, winRate: 0 };

  const byMatchCount = [...statsById.values()].sort(
    (a, b) => b.matchesCount - a.matchesCount || b.winsCount - a.winsCount || b.winRate - a.winRate
  );
  const byWinRate = [...statsById.values()].sort(
    (a, b) => b.winRate - a.winRate || b.winsCount - a.winsCount || b.matchesCount - a.matchesCount
  );

  return {
    linked: true,
    playerId: me.id,
    name: me.name,
    avatarUrl: me.avatar_url,
    createdAt: me.created_at,
    matchesCount: myStats.matchesCount,
    winsCount: myStats.winsCount,
    winRate: myStats.winRate,
    tier: getTierInfo(myStats.matchesCount, me.custom_triangle_color),
    matchCountRank: rankOf(byMatchCount.map((s) => s.id), me.id),
    winRateRank: rankOf(byWinRate.map((s) => s.id), me.id),
    totalRankedPlayers: statsById.size,
  };
}

// ユーザー要望（続き74）「ランキングを実装しましょう。勝率ランキング/勝利数ランキング/
// 対戦数ランキングでどうだろう？」への対応。fetchStatsProfile()が既に全プレイヤー分の
// 集計（statsById/byMatchCount/byWinRate）を内部で計算していたことが分かったため、
// それを流用する形で新設した（新しいテーブル・RPCは不要、姉妹プロジェクトのDBに
// 対する読み取り専用クエリを1つ増やしただけ）。fetchStatsProfile()と違い、これは
// 「自分」ではなく「プレイヤー名・アバターを含む上位N件」を返す必要があるため、
// playersのselectにname/avatar_urlを追加している。
//
// ユーザー要望（続き75）「勝率ランキングは、対戦経験が極端に少ないプレイヤーが
// 数試合だけで上位に入ってしまわないように、実際に対戦したことがあるプレイヤーの
// 『平均対戦数』の50%を超える対戦数のプレイヤーのみが対象になる、という戦績システム
// 側と同じルールにしてほしい」。固定の最低対戦数（続き74時点では3戦固定だった）を
// やめ、「対戦数>0のプレイヤーの平均対戦数の50%」を動的なボーダーとして計算する。
function computeWinRateEligibilityBorder(allStats) {
  const withMatches = allStats.filter((s) => s.matchesCount > 0);
  if (withMatches.length === 0) return 0;
  const avg = withMatches.reduce((sum, s) => sum + s.matchesCount, 0) / withMatches.length;
  return avg * 0.5;
}

// 「①勝率→②勝利数→③対戦数の順で比較し、すべて同じ場合は同順位として併記する」
// （戦績システム側と同じ順位付けルール）。sorted配列は既にこの3キーで並べ替え済み
// である前提で、隣り合う行のキーが完全一致していれば同じ順位を、そうでなければ
// その時点のインデックス+1（＝標準的な競技順位、同率の分だけ次の順位が飛ぶ）を振る。
function assignCompetitionRanks(sorted, keyOf) {
  const ranked = [];
  let lastKey = null;
  let lastRank = 0;
  sorted.forEach((s, i) => {
    const key = keyOf(s);
    const rank = lastKey && key.every((v, idx) => v === lastKey[idx]) ? lastRank : i + 1;
    ranked.push({ stats: s, rank });
    lastKey = key;
    lastRank = rank;
  });
  return ranked;
}

export async function fetchLeaderboard(limit = 20) {
  if (!client) return { winRate: [], wins: [], matches: [] };

  const [{ data: players, error: playersError }, { data: matches, error: matchesError }] = await Promise.all([
    client.from("players").select("id, name, avatar_url, status, is_staff, seed_matches_count, seed_wins_count"),
    client.from("matches").select("members, winner_id, status"),
  ]);
  if (playersError) throw playersError;
  if (matchesError) throw matchesError;

  const rankablePlayers = (players ?? []).filter((p) => p.status === "approved" && !p.is_staff);
  const statsById = computeAllPlayerStats(rankablePlayers, matches ?? []);
  const nameById = new Map(rankablePlayers.map((p) => [p.id, { name: p.name, avatarUrl: p.avatar_url }]));

  function toRows(ranked) {
    return ranked.slice(0, limit).map(({ stats: s, rank }) => ({
      rank,
      playerId: s.id,
      name: nameById.get(s.id)?.name ?? "?",
      avatarUrl: nameById.get(s.id)?.avatarUrl ?? null,
      matchesCount: s.matchesCount,
      winsCount: s.winsCount,
      winRate: s.winRate,
    }));
  }

  const all = [...statsById.values()];
  const winRateBorder = computeWinRateEligibilityBorder(all);
  const byWinRateSorted = all
    .filter((s) => s.matchesCount > winRateBorder)
    .sort((a, b) => b.winRate - a.winRate || b.winsCount - a.winsCount || b.matchesCount - a.matchesCount);
  const byWinsSorted = [...all].sort((a, b) => b.winsCount - a.winsCount || b.winRate - a.winRate || b.matchesCount - a.matchesCount);
  const byMatchesSorted = [...all].sort((a, b) => b.matchesCount - a.matchesCount || b.winsCount - a.winsCount || b.winRate - a.winRate);

  const byWinRate = assignCompetitionRanks(byWinRateSorted, (s) => [s.winRate, s.winsCount, s.matchesCount]);
  const byWins = assignCompetitionRanks(byWinsSorted, (s) => [s.winsCount, s.winRate, s.matchesCount]);
  const byMatches = assignCompetitionRanks(byMatchesSorted, (s) => [s.matchesCount, s.winsCount, s.winRate]);

  return { winRate: toRows(byWinRate), wins: toRows(byWins), matches: toRows(byMatches) };
}
