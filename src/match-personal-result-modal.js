// ユーザー要望（続き95）「以前相談した対戦終了時の個人結果を実装しましょう」。
// 表示内容はユーザー確認済み: 「各プレイヤーの試合内スタッツ」＋「順位（3-4人戦）」。
// rank-reveal-modal.js（戦績システム全体の通算順位）とは別物で、あくまで今回の
// 1対局限りの結果——victory.jsのcheckForVictory()から、勝者・敗者を問わず全員の
// 画面に出す（勝者だけに絞る理由が無いため）。
//
// 「試合内スタッツ」はロックした色数・手札残り枚数に加え（続き97）、接触回数・
// 使用したカード枚数（match-stats-tracker.js参照、対局中の操作をリアルタイムに
// 集計するトラッカー）も表示する。
// 「順位」はロック色数の多い順（同数は同順位）。2人戦は勝者/敗者の2択で自明なため
// 順位表は出さず、自分のスタッツだけを見せる。

import { createBackdrop, createModalCloseX } from "./ui-helpers.js";
import { getState } from "./state.js";
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { getSelfSeat } from "./online.js";
import { SEAT_TO_SIDE } from "./board-layout.js";
import { applyAvatarContent } from "./avatar-render.js";
import { getMatchStats, getMostUsedCardOverall, getMostUsedCardForSeat, getLockHistory } from "./match-stats-tracker.js";
import { getCardImagePath, getCardDefinition } from "./cards-data.js";
import { showCardFace } from "./card-face-display.js";
import { getCardName } from "./card-text.js"; // UI英語化フェーズ13: 表示用のカード名
import { t } from "./ui-text.js"; // UI英語化フェーズ13

const SVGNS = "http://www.w3.org/2000/svg";
// その座席の駒の色（＝プレイヤーの色）を実際のCSS変数値で返す（折れ線の色に使う）。
function seatColorHex(seat) {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === seat);
  const color = piece?.color;
  if (!color) return "#94a3b8";
  const v = getComputedStyle(document.documentElement).getPropertyValue(`--color-${color}`).trim();
  return v || "#94a3b8";
}

// ターンごとの各プレイヤーのロック枚数の折れ線グラフ（SVG、外部ライブラリ不要）。
// ユーザー要望「どこで逆転したのか見れて楽しそう」。データが2点以上ある時だけ描く。
function buildLockLineChart(activePlayers, winnerSeat) {
  const history = getLockHistory();
  // 対戦終了時点（勝利の瞬間のロック）が最後のターン遷移に乗らないことがあるため、現在値を
  // 最後の点として補う。
  const curTurn = getState().turnNumber ?? (history.length ? history[history.length - 1].turn + 1 : 1);
  const curCounts = {};
  for (const seat of activePlayers) curCounts[seat] = getLockedCountForSeat(seat);
  const points = history.slice();
  if (!points.length || points[points.length - 1].turn !== curTurn) points.push({ turn: curTurn, counts: curCounts });
  else points[points.length - 1] = { turn: curTurn, counts: curCounts };
  if (points.length < 2) return null; // 短すぎて折れ線にならない

  const W = 340;
  const H = 190;
  const padL = 26;
  const padR = 12;
  const padT = 12;
  const padB = 34;
  const x0 = padL;
  const x1 = W - padR;
  const y0 = H - padB; // ロック0の位置（下）
  const y1 = padT; // ロック7の位置（上）
  const turns = points.map((p) => p.turn);
  const minT = Math.min(...turns);
  const maxT = Math.max(...turns);
  const xFor = (t) => x0 + (maxT === minT ? 0.5 : (t - minT) / (maxT - minT)) * (x1 - x0);
  const yFor = (v) => y0 + (Math.max(0, Math.min(7, v)) / 7) * (y1 - y0);

  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("class", "match-lock-chart");

  const mk = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  };
  // Y軸の目盛り（0〜7）＋横グリッド線。
  for (let v = 0; v <= 7; v++) {
    svg.appendChild(mk("line", { x1: x0, y1: yFor(v), x2: x1, y2: yFor(v), stroke: "rgba(255,255,255,0.12)", "stroke-width": 1 }));
    const lbl = mk("text", { x: x0 - 4, y: yFor(v) + 3, "text-anchor": "end", "font-size": 8, fill: "rgba(255,255,255,0.6)" });
    lbl.textContent = String(v);
    svg.appendChild(lbl);
  }
  // X軸ラベル（最初と最後のターン）。
  for (const t of [minT, maxT]) {
    const lbl = mk("text", { x: xFor(t), y: H - 20, "text-anchor": "middle", "font-size": 8, fill: "rgba(255,255,255,0.6)" });
    lbl.textContent = `T${t}`;
    svg.appendChild(lbl);
  }
  // 各プレイヤーの折れ線＋凡例。
  const legend = document.createElement("div");
  legend.className = "match-lock-chart-legend";
  activePlayers.forEach((seat, i) => {
    const color = seatColorHex(seat);
    const isWinner = seat === winnerSeat;
    const ptsStr = points.map((p) => `${xFor(p.turn)},${yFor(p.counts[seat] ?? 0)}`).join(" ");
    svg.appendChild(mk("polyline", { points: ptsStr, fill: "none", stroke: color, "stroke-width": isWinner ? 3 : 2, "stroke-linejoin": "round", "stroke-linecap": "round", opacity: 0.95 }));
    for (const p of points) svg.appendChild(mk("circle", { cx: xFor(p.turn), cy: yFor(p.counts[seat] ?? 0), r: isWinner ? 2.6 : 2, fill: color }));
    const item = document.createElement("span");
    item.className = "match-lock-chart-legend-item";
    const dot = document.createElement("span");
    dot.className = "match-lock-chart-legend-dot";
    dot.style.background = color;
    item.appendChild(dot);
    item.appendChild(document.createTextNode(`${isWinner ? "🏆 " : ""}${getPlayerName(seat)}`));
    legend.appendChild(item);
  });

  const wrap = document.createElement("div");
  wrap.className = "match-lock-chart-wrap";
  wrap.appendChild(svg);
  wrap.appendChild(legend);
  return wrap;
}

const AUTO_CLOSE_MS = 7000;

// 無色カード（白・黒）はロックエリアに「置く」ことはできてもロックではない（victory.jsと
// 同じ扱い）。順位・グラフの集計でも無色を数えない。
function isColorlessLockCard(cardId) {
  const color = getCardDefinition(cardId)?.color;
  return color === "white" || color === "black";
}
function getLockedCountForSeat(seat) {
  const side = SEAT_TO_SIDE[seat];
  const lockedIndexes = new Set(
    getState()
      .tokens.filter(
        (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && !isColorlessLockCard(t.cardId)
      )
      .map((t) => t.location.index)
  );
  return lockedIndexes.size;
}

function getHandCountForSeat(seat) {
  return getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat).length;
}

// 戻り値のPromiseはモーダルが閉じた（自動/手動どちらでも）タイミングでresolveする
// （victory.js側で他のエピローグモーダルとの順番を制御するため、currency-award-modal.js
// 等と同じパターン）。
export function showMatchPersonalResultModal({ activePlayers, winnerSeat }) {
  return new Promise((resolve) => {
    const selfSeat = getSelfSeat();
    const standings = activePlayers
      .map((seat) => ({ seat, locked: getLockedCountForSeat(seat), hand: getHandCountForSeat(seat) }))
      .sort((a, b) => b.locked - a.locked);
    let rank = 0;
    let prevLocked = null;
    const ranked = standings.map((entry, i) => {
      if (entry.locked !== prevLocked) rank = i + 1;
      prevLocked = entry.locked;
      return { ...entry, rank };
    });
    const selfEntry = ranked.find((e) => e.seat === selfSeat);

    const modal = document.createElement("div");
    modal.id = "match-personal-result-modal";
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      clearTimeout(autoCloseTimer);
      backdrop.remove();
      modal.remove();
      resolve();
    };
    const backdrop = createBackdrop(close, { dim: true, zIndex: 10530 });

    const title = document.createElement("div");
    title.className = "match-personal-result-title";
  title.textContent = t("mpr.title");
    modal.appendChild(title);

    // 3人以上の対局だけ順位表を見せる（2人戦は勝者/敗者の2択で自明なため）。
    if (activePlayers.length >= 3) {
      const list = document.createElement("div");
      list.className = "match-personal-result-standings";
      for (const entry of ranked) {
        const row = document.createElement("div");
        row.className = "match-personal-result-row";
        if (entry.seat === selfSeat) row.classList.add("is-self");
        if (entry.seat === winnerSeat) row.classList.add("is-winner");

        const rankEl = document.createElement("div");
        rankEl.className = "match-personal-result-rank";
    rankEl.textContent = t("mpr.rankN", { n: entry.rank });
        row.appendChild(rankEl);

        const avatarEl = document.createElement("div");
        avatarEl.className = "match-personal-result-avatar";
        applyAvatarContent(avatarEl, getPlayerAvatar(entry.seat));
        row.appendChild(avatarEl);

        const nameEl = document.createElement("div");
        nameEl.className = "match-personal-result-name";
        nameEl.textContent = `${entry.seat === winnerSeat ? "🏆 " : ""}${getPlayerName(entry.seat)}`;
        row.appendChild(nameEl);

        const lockedEl = document.createElement("div");
        lockedEl.className = "match-personal-result-locked";
    lockedEl.textContent = t("mpr.lockedN", { n: entry.locked });
        row.appendChild(lockedEl);

        list.appendChild(row);
      }
      modal.appendChild(list);
    }

    if (selfEntry) {
      const { contactsMade, cardsUsed } = getMatchStats(selfSeat);
      const selfBlock = document.createElement("div");
      selfBlock.className = "match-personal-result-self";
      const selfTitle = document.createElement("div");
      selfTitle.className = "match-personal-result-self-title";
    selfTitle.textContent = t("mpr.yours");
      selfBlock.appendChild(selfTitle);
      const selfStats = document.createElement("div");
      selfStats.className = "match-personal-result-self-stats";
    selfStats.textContent = t("mpr.selfStats", { locked: selfEntry.locked, hand: selfEntry.hand });
      selfBlock.appendChild(selfStats);
      const selfStats2 = document.createElement("div");
      selfStats2.className = "match-personal-result-self-stats-sub";
    selfStats2.textContent = t("mpr.selfStats2", { contacts: contactsMade, cards: cardsUsed });
      selfBlock.appendChild(selfStats2);
      modal.appendChild(selfBlock);
    }

    // MVPカード（この対戦で最も使われたカード。全体＝全座席合計、あなた＝自分の座席）。
    // ユーザー要望「対戦終了時に全体MVPカード・自分MVPカードを表示したい」。
    const overallMvp = getMostUsedCardOverall();
    const selfMvp = getMostUsedCardForSeat(selfSeat);
    if (overallMvp || selfMvp) {
      const mvpBlock = document.createElement("div");
      mvpBlock.className = "match-personal-result-mvp";
      const mvpTitle = document.createElement("div");
      mvpTitle.className = "match-personal-result-self-title";
    mvpTitle.textContent = t("mpr.mvpTitle");
      mvpBlock.appendChild(mvpTitle);
      const row = document.createElement("div");
      row.className = "match-personal-result-mvp-row";
      const makeCol = (labelText, mvp) => {
        const col = document.createElement("div");
        col.className = "match-personal-result-mvp-col";
        const lbl = document.createElement("div");
        lbl.className = "match-personal-result-mvp-label";
        lbl.textContent = labelText;
        col.appendChild(lbl);
        if (mvp) {
          const img = document.createElement("div");
          img.className = "match-personal-result-mvp-card";
          showCardFace(img, mvp.cardId, getCardImagePath(mvp.cardId));
          img.setAttribute("aria-label", getCardDefinition(mvp.cardId)?.name ?? "");
          col.appendChild(img);
          const name = document.createElement("div");
          name.className = "match-personal-result-mvp-name";
      name.textContent = t("mpr.mvpName", { name: getCardName(mvp.cardId) || getCardDefinition(mvp.cardId)?.name || mvp.cardId, n: mvp.count });
          col.appendChild(name);
        } else {
          const none = document.createElement("div");
          none.className = "match-personal-result-mvp-name";
      none.textContent = t("mpr.noUse");
          col.appendChild(none);
        }
        return col;
      };
    row.appendChild(makeCol(t("mpr.overall"), overallMvp));
    row.appendChild(makeCol(t("mpr.you"), selfMvp));
      mvpBlock.appendChild(row);
      modal.appendChild(mvpBlock);
    }

    // ターンごとのロック枚数の折れ線グラフ（どこで逆転したか等）。
    const chart = buildLockLineChart(activePlayers, winnerSeat);
    if (chart) {
      const chartBlock = document.createElement("div");
      chartBlock.className = "match-personal-result-chart";
      const chartTitle = document.createElement("div");
      chartTitle.className = "match-personal-result-self-title";
    chartTitle.textContent = t("mpr.chartTitle");
      chartBlock.appendChild(chartTitle);
      chartBlock.appendChild(chart);
      modal.appendChild(chartBlock);
    }

    modal.appendChild(createModalCloseX(close));
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    // ユーザー要望（変更）: 対戦終了時のモーダルは自動で次へ進まない。✕/背景クリックでのみ閉じる。
    const autoCloseTimer = null;
  });
}
