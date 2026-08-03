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

  // 自分の対戦数・勝利数は、スタッフであっても正しく表示する（バグ修正）。
  // ユーザー報告「戦績システムでは YGM は 16戦11勝なのに、アプリのマイページは0戦」。
  // 原因: 以前は「承認済み かつ スタッフ除外」のプレイヤーだけで集計し、その集計から
  // 自分の成績(myStats)も引いていたため、自分がスタッフだと自分の対戦数まで0になっていた
  // （戦績システム側は集計自体にはスタッフも含め、ランキングからだけ除外している）。
  // → 集計は「承認済み全員（スタッフ含む）」で行い、スタッフ除外は“順位付けの母集団”だけに適用する。
  const approvedPlayers = (players ?? []).filter((p) => p.status === "approved");
  const statsById = computeAllPlayerStats(approvedPlayers, matches ?? []);

  const myStats = statsById.get(me.id) ?? { matchesCount: 0, winsCount: 0, winRate: 0 };

  // 順位は、姉妹プロジェクトのランキング表示と同じく承認済み・スタッフ除外の母集団で求める。
  const staffIds = new Set((players ?? []).filter((p) => p.is_staff).map((p) => p.id));
  const rankableStats = [...statsById.values()].filter((s) => !staffIds.has(s.id));
  const byMatchCount = [...rankableStats].sort(
    (a, b) => b.matchesCount - a.matchesCount || b.winsCount - a.winsCount || b.winRate - a.winRate
  );
  const byWinRate = [...rankableStats].sort(
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
    totalRankedPlayers: rankableStats.length,
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
// 続き77: ランキングページのiマーク（ルール説明）が実際の現在値を表示できるよう、
// ボーダーだけでなく元になった平均対戦数も一緒に返す。
function computeWinRateEligibilityBorder(allStats) {
  const withMatches = allStats.filter((s) => s.matchesCount > 0);
  if (withMatches.length === 0) return { border: 0, average: 0 };
  const average = withMatches.reduce((sum, s) => sum + s.matchesCount, 0) / withMatches.length;
  return { border: average * 0.5, average };
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
    client.from("players").select("id, name, avatar_url, status, is_staff, seed_matches_count, seed_wins_count, user_id"),
    client.from("matches").select("members, winner_id, status"),
  ]);
  if (playersError) throw playersError;
  if (matchesError) throw matchesError;

  // ユーザー要望「ランキングで自分がハイライト（点滅など）で強調されていると分かりやすい」。
  // 今ログインしているアカウントに紐づく戦績プレイヤーのidを求め、返り値に含める
  // （ランキングページ側で自分の行に強調クラスを付ける）。
  let myPlayerId = null;
  try {
    const { data: authData } = await client.auth.getUser();
    const uid = authData?.user?.id;
    if (uid) myPlayerId = (players ?? []).find((p) => p.user_id === uid)?.id ?? null;
  } catch (e) {
    /* 取得できなくてもランキング自体は表示する */
  }

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
  const { border: winRateBorder, average: winRateAverageMatches } = computeWinRateEligibilityBorder(all);
  const byWinRateSorted = all
    .filter((s) => s.matchesCount > winRateBorder)
    .sort((a, b) => b.winRate - a.winRate || b.winsCount - a.winsCount || b.matchesCount - a.matchesCount);
  const byWinsSorted = [...all].sort((a, b) => b.winsCount - a.winsCount || b.winRate - a.winRate || b.matchesCount - a.matchesCount);
  const byMatchesSorted = [...all].sort((a, b) => b.matchesCount - a.matchesCount || b.winsCount - a.winsCount || b.winRate - a.winRate);

  const byWinRate = assignCompetitionRanks(byWinRateSorted, (s) => [s.winRate, s.winsCount, s.matchesCount]);
  const byWins = assignCompetitionRanks(byWinsSorted, (s) => [s.winsCount, s.winRate, s.matchesCount]);
  const byMatches = assignCompetitionRanks(byMatchesSorted, (s) => [s.matchesCount, s.winsCount, s.winRate]);

  return {
    winRate: toRows(byWinRate),
    wins: toRows(byWins),
    matches: toRows(byMatches),
    winRateAverageMatches,
    winRateBorder,
    myPlayerId,
  };
}

// ユーザー要望（続き87）「勝利後、まだ盤面のタイマーが…」ではなく「勝利後、自分の順位を
// 表示させたい」への対応。fetchLeaderboard()はtoRows()でtop N（既定20件）に絞ってしまう
// ため、20位より下の自分の順位までは分からない。fetchLeaderboard()と全く同じ集計処理を
// 内部で流用しつつ、絞り込む前の全順位からplayerIdの行を1件だけ探す専用関数を新設した
// （勝率ランキングは対象人数自体がwinRateBorderで絞られるため、対象外の場合はnullを返す
// ——rank-reveal-modal.js側で「ランキング対象外」表示に回す）。
export async function fetchPlayerRank(playerId, category = "winRate") {
  if (!client) return null;

  const [{ data: players, error: playersError }, { data: matches, error: matchesError }] = await Promise.all([
    client.from("players").select("id, name, avatar_url, status, is_staff, seed_matches_count, seed_wins_count"),
    client.from("matches").select("members, winner_id, status"),
  ]);
  if (playersError) throw playersError;
  if (matchesError) throw matchesError;

  const rankablePlayers = (players ?? []).filter((p) => p.status === "approved" && !p.is_staff);
  const statsById = computeAllPlayerStats(rankablePlayers, matches ?? []);
  const all = [...statsById.values()];

  let ranked;
  if (category === "wins") {
    ranked = assignCompetitionRanks(
      [...all].sort((a, b) => b.winsCount - a.winsCount || b.winRate - a.winRate || b.matchesCount - a.matchesCount),
      (s) => [s.winsCount, s.winRate, s.matchesCount]
    );
  } else if (category === "matches") {
    ranked = assignCompetitionRanks(
      [...all].sort((a, b) => b.matchesCount - a.matchesCount || b.winsCount - a.winsCount || b.winRate - a.winRate),
      (s) => [s.matchesCount, s.winsCount, s.winRate]
    );
  } else {
    const { border: winRateBorder } = computeWinRateEligibilityBorder(all);
    ranked = assignCompetitionRanks(
      all
        .filter((s) => s.matchesCount > winRateBorder)
        .sort((a, b) => b.winRate - a.winRate || b.winsCount - a.winsCount || b.matchesCount - a.matchesCount),
      (s) => [s.winRate, s.winsCount, s.matchesCount]
    );
  }

  const found = ranked.find(({ stats }) => stats.id === playerId);
  if (!found) return null;
  return { rank: found.rank, totalRanked: ranked.length, ...found.stats };
}
