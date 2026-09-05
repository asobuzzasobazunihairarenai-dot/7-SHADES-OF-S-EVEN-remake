// カード効果ユニットテストのブラウザ内ランナー（続き240で test/effects.mjs から分離）。
// ブラウザ専用: /src を import するため Node から直接 import してはいけない
// （Playwright の page.evaluate 内、またはアプリ内オールテストから import して使う）。
// 相対パスで import する（GitHub Pages はサブパス /7-SHADES-…/ 配下配信のため、絶対 /src/…
// だとサブパスが抜けて 404 になる／アプリの singleton と別インスタンスになる。test/ から見て ../src/）。
import * as st from "../src/state.js";
import * as eng from "../src/card-effect-engine.js";

// 1ケース分を実行して最終 state 等を返す（アサーションは effect-cases.js の checkExpect が行う）。
export async function runOneCase(spec) {
  st.setOnlineMode(false);
  eng.setAutoProcessingEnabled(true); // 手札効果は canUseHandEffect→isHandEffectOptionUsable が自動処理ONを要求
  eng.resetHandEffectUsage?.(); // 「1ターンに1度」等の使用回数をケース間でリセット
  const hydrated = JSON.parse(JSON.stringify(spec.state));
  // 実ゲームの状態は turnNumber を必ず持つ。未指定だと isHandEffectDisabledThisTurn の
  // 「handEffectDisabledUntilTurn.get(id)(=undefined) === turnNumber(=undefined)」が誤って
  // true になり手札効果が使用不可になるため、数値の既定を入れておく（テスト用の補正）。
  if (typeof hydrated.turnNumber !== "number") hydrated.turnNumber = 1;
  st.hydrateState(hydrated);

  const picks = spec.picks || {};
  const cursors = {};
  const nextPick = (type) => {
    const arr = picks[type] || [];
    const i = cursors[type] || 0;
    cursors[type] = i + 1;
    return arr[i];
  };
  const callLog = [];
  const S = () => st.getState();
  const findToken = (id) => S().tokens.find((t) => t.id === id);

  // 選択候補(candidates)から、台本の指定に一致する候補を返す。指定は {row,col} / {zone,side,index} /
  // "index:N" / トークンid（handCard用）/ 生の値（player/option/colors）。
  const resolveLocation = (spec2, candidates) => {
    if (spec2 === "skip") return null; // 「これ以上選ばない」（allowSkip の効果を明示的に終了）
    if (spec2 == null) return candidates && candidates[0];
    if (typeof spec2 === "string" && spec2.startsWith("index:")) return candidates[parseInt(spec2.slice(6), 10)];
    if (spec2 && spec2.zone === "lock") return (candidates || []).find((c) => c.zone === "lock" && c.side === spec2.side && c.index === spec2.index) || spec2;
    if (spec2 && typeof spec2.row === "number") return (candidates || []).find((c) => c.zone === "cell" && c.row === spec2.row && c.col === spec2.col) || { zone: "cell", row: spec2.row, col: spec2.col };
    return spec2;
  };

  const helpers = {
    // --- 状態変更（本物の state.js を dispatch）---
    moveAndSync: async (tokenId, location, sound, suppressArrival) => { callLog.push(["moveAndSync", tokenId, location]); st.moveToken(tokenId, location, suppressArrival); },
    // 第2引数は本物（main.js の discardFromHandReveal）ではオプション（{silent}/{noBurn}）。
    // 昔ここを「捨て先の山」として受けていた名残があったので、文字列の時だけ山名として扱う。
    discardAndSync: async (tokenId, opts) => {
      const pile = typeof opts === "string" ? opts : "discard";
      callLog.push(["discard", tokenId, pile]);
      st.sendTokenToPile(tokenId, pile);
    },
    drawCards: async (player, count) => { callLog.push(["draw", player, count]); for (let i = 0; i < count; i++) st.drawFromPile("deck", { zone: "hand", player }); },
    flipCard: async (tokenId) => { callLog.push(["flip", tokenId]); const t = findToken(tokenId); if (t && !t.faceUp) st.flipToken(tokenId); },
    placeFromDeck: async (location, faceUp) => { callLog.push(["placeFromDeck", location, faceUp]); st.drawFromPile("deck", location); if (faceUp) { const top = S().tokens.filter((t)=>t.kind==="card"&&t.location.zone===location.zone&&(location.zone==="cell"?t.location.row===location.row&&t.location.col===location.col:t.location.side===location.side&&t.location.index===location.index)); const last = top[top.length-1]; if (last && !last.faceUp) st.flipToken(last.id); } },
    placeFromDeckReveal: async (location) => { callLog.push(["placeFromDeckReveal", location]); st.drawFromPile("deck", location); },
    swapPieces: async (pieceTokenId, fromLocation, targetLocation) => {
      callLog.push(["swap", pieceTokenId, targetLocation]);
      const opp = S().tokens.find((t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === targetLocation.row && t.location.col === targetLocation.col);
      if (!opp) return;
      st.swapPieceLocations(pieceTokenId, opp.id, true); // 本物と同じ原子的入れ替え(ローカル)
    },
    // 相手(target)と自分(player)で手札を1枚ずつ入れ替える（無作為＝先頭で代用）。
    swapRandomHandCard: async (player, target) => {
      callLog.push(["swapRandomHandCard", player, target]);
      const handOf = (p) => S().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p);
      const mine = handOf(player)[0];
      const theirs = handOf(target)[0];
      if (theirs) st.moveToken(theirs.id, { zone: "hand", player });
      if (mine) st.moveToken(mine.id, { zone: "hand", player: target });
    },
    // 相手pの手札から1枚（無作為＝先頭で代用）をトークンで返す。engine が .id を discardAndSync する。
    pickRandomFromOpponentHand: async (p) => {
      const tok = S().tokens.find((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p);
      callLog.push(["pickRandomFromOpponentHand", p, tok && tok.id]); return tok || null;
    },
    // 捨て場の一番上を手札へ引く（トークンを返す）。first-red の「上から2番目」処理で使う。
    drawFromDiscard: async (player) => {
      const before = new Set(S().tokens.map((t) => t.id));
      st.drawFromPile("discard", { zone: "hand", player });
      const nw = S().tokens.find((t) => !before.has(t.id) && t.location.zone === "hand" && t.location.player === player);
      callLog.push(["drawFromDiscard", nw && nw.cardId]); return nw || null;
    },
    // N枚を公開ドローゾーン(publicDraw)へ引く。返り値: cardId配列（gamble）/ token id配列（first-green等）。
    publicDrawThenReveal: async (player, count) => { const ids = []; for (let i = 0; i < count; i++) { const b = new Set(S().tokens.map((t) => t.id)); st.drawFromPile("deck", { zone: "publicDraw", player }); const nw = S().tokens.find((t) => !b.has(t.id)); if (nw) ids.push(nw.cardId); } callLog.push(["publicDrawThenReveal", player, count]); return ids; },
    publicDraw: async (player, count) => { const ids = []; for (let i = 0; i < count; i++) { const b = new Set(S().tokens.map((t) => t.id)); st.drawFromPile("deck", { zone: "publicDraw", player }); const nw = S().tokens.find((t) => !b.has(t.id)); if (nw) ids.push(nw.cardId); } callLog.push(["publicDraw", player, count]); return ids; },
    publicDrawReturningTokens: async (player, count) => { const ids = []; for (let i = 0; i < count; i++) { const b = new Set(S().tokens.map((t) => t.id)); st.drawFromPile("deck", { zone: "publicDraw", player }); const nw = S().tokens.find((t) => !b.has(t.id)); if (nw) ids.push(nw.id); } callLog.push(["publicDrawReturningTokens", player, count]); return ids; },

    // --- 選択（台本を消費）---
    pickLocation: async (candidates) => { const r = resolveLocation(nextPick("location"), candidates); callLog.push(["pickLocation", r]); return r; },
    pickHandCard: async (player, filter) => {
      const want = nextPick("handCard");
      let tok = null;
      if (want && typeof want === "string" && want.startsWith("index:")) { const hand = S().tokens.filter((t)=>t.kind==="card"&&t.location.zone==="hand"&&t.location.player===player); tok = hand[parseInt(want.slice(6),10)]; }
      else if (want) tok = findToken(want);
      callLog.push(["pickHandCard", tok && tok.id]); return tok || null;
    },
    pickDiscardCost: async (candidates) => {
      // 追色コスト。engine は返り値の .id / .cardId を読む＝トークンを返す必要がある。
      const want = nextPick("discardCost");
      let tok = null;
      if (want && typeof want === "string" && want.startsWith("index:")) tok = (candidates || [])[parseInt(want.slice(6), 10)];
      else if (want) tok = (candidates || []).find((c) => c.id === want) || findToken(want);
      else tok = (candidates || [])[0];
      callLog.push(["pickDiscardCost", tok && tok.id]); return tok || null;
    },
    pickPlayer: async () => { const r = nextPick("player"); callLog.push(["pickPlayer", r]); return r; },
    // 選択肢モーダル: engine は選ばれた「オプションのオブジェクト」（.id/.actions/.usable）を期待する。
    // 台本には id 文字列を書く → 渡された options 配列から id 一致のオブジェクトを返す。
    pickArrivalOption: async (cardId, options) => { const want = nextPick("option"); const o = (options || []).find((x) => x.id === want) || null; callLog.push(["pickArrivalOption", want]); return o; },
    pickHandEffectOption: async (cardId, options) => { const want = nextPick("option"); const o = (options || []).find((x) => x.id === want) || null; callLog.push(["pickHandEffectOption", want]); return o; },
    declareColors: async () => { const r = nextPick("colors"); callLog.push(["declareColors", r]); return r; },
    gambleReveal: async () => { const r = nextPick("gamble"); callLog.push(["gambleReveal", r]); return r; },
    delegateToPlayer: async (p, taskType) => { callLog.push(["delegateToPlayer", p, taskType]); return false; },
    isLoopMoveDest: () => false,
    isCpuDriving: () => false,
    getPlayerName: (p) => p,

    // --- 演出/音/通知/その他（no-op）---
    announceCardAddedToHand: () => {}, announceColorsResolved: () => {}, announceDrawTargets: () => {},
    announceEffectChoice: () => {}, announceEffectNotice: () => {}, announceEffectReason: async () => {},
    announceFizzle: async () => {}, announceSteppedCard: () => {}, announceUse: () => {},
    beginPublicDrawDefer: () => {}, endPublicDrawDefer: () => {}, celebrate: () => {}, delay: async () => {},
    endCurrentPhase: () => { callLog.push(["endCurrentPhase"]); }, flyCardToHand: async () => {},
    markDiscardAtTurnEnd: (player, ids) => { callLog.push(["markDiscardAtTurnEnd", player, ids]); }, markPlacedLocation: () => {}, markPlacementTarget: () => {},
    maybeTriggerArrivalForPlacedCard: async () => {}, onCardAcquiredToHand: () => {},
    playAdditionalColorUse: () => {}, recordMoveVisited: () => {}, startSuspenseSound: () => {},
    stopSuspenseSound: () => {}, triggerArrivalAtIfFaceUp: async () => {},
  };

  // 手札効果ケースの失敗調査用の軽い診断（DEBUG_CALLS 時のみ出力）。
  let diag = null;
  if (spec.kind === "hand") {
    try {
      const opts = eng.getHandEffectOptions(spec.ctx.cardId);
      diag = {
        canUse: eng.canUseHandEffect(spec.ctx.cardId, spec.ctx.cardTokenId, spec.ctx.player),
        options: opts.map((o) => ({ label: o.label, cost: o.cost, actions: o.actions, inh: o.inheritsArrival, usable: eng.isHandEffectOptionUsable(spec.ctx.cardId, spec.ctx.cardTokenId, spec.ctx.player, o) })),
      };
    } catch (e) { diag = { probeError: String(e) }; }
  }
  try {
    if (spec.kind === "arrival") await eng.runArrivalEffect(spec.ctx, helpers);
    else await eng.runHandEffect(spec.ctx, helpers);
  } catch (e) {
    return { error: String(e && e.stack || e), calls: callLog, tokens: S().tokens, piles: S().piles, diag };
  }
  return { calls: callLog, tokens: S().tokens, piles: S().piles, diag };
}
