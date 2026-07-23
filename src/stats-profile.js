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
