// 戦績管理システムへ登録する「証拠画像」の生成（Phase 1後半での方針転換）。
//
// 当初はhtml2canvas(-pro)で実際の盤面(#scene)をそのまま撮影していたが、この盤面は
// preserve-3d + perspectiveの3D合成やcolor-mix()を多用しており、html2canvas系の
// ライブラリでは色・カード柄がまともに再現できなかった（ユーザー報告で複数回確認）。
// 3D合成を撮影の瞬間だけ無効化する案も試したが、html2canvas自体が無限にハングする
// 致命的な副作用があったため断念した（online.jsのcaptureVictoryScreenshotの
// コメント参照）。
//
// そこで方針を変え、DOM解析ライブラリを一切使わず、Canvas 2D APIへ直接
// 「盤面49マスの状態」「各プレイヤーのロックエリア（7色）」「各プレイヤーの手札」を
// 描画したサマリー画像を自作することにした。3D変形・color-mix()を経由しないため、
// この種の不具合が原理的に起こらない。
//
// 手札について: 「ゲームが終わった後だから中身を見せてもよいはず」は誤り——この画像を
// 生成しているのは勝者本人のクライアントだが、そのgetState()はso7_game_tokens_visible
// ビュー（online.js冒頭のコメント参照）がサーバー側でマスクした結果をそのまま反映して
// いるだけで、自分の手札はcardIdが見えるが他プレイヤーの手札は元々cardId:null・
// faceUp:falseのままになっている（ゲームの決着状態に関わらず、このクライアントには
// 他人の手札の中身を知る手段が無い）。よって描画時は盤面のマス目と同じく
// token.faceUpに従い、見えない手札はカード裏面で描く（下のdrawへのコメント参照）。

import { getState } from "./state.js";
import { getCardImagePath, getCardBackImagePath } from "./cards-data.js";
import { getSkinImagePath } from "./piece-skins.js";
import { getPlayerName } from "./player-identity.js";
import { COLORS, SEAT_TO_SIDE, SEAT_ORDER } from "./board-layout.js";

const BOARD_N = 7;
const CELL = 52;
const CELL_GAP = 3;
const PAD = 28;
const CARD_W = 60;
const CARD_H = 84;
const CARD_GAP = 6;
const ROW_LABEL_H = 26;

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 読み込めなくても全体の生成は止めない
    img.src = src;
  });
}

function getPieceColor(state, seat) {
  const piece = state.tokens.find((t) => t.kind === "piece" && t.player === seat);
  return piece ? piece.color : null;
}

function drawCover(ctx, img, x, y, w, h, radius = 4) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.clip();
  if (img) {
    // object-fit:cover相当。画像とdst枠のアスペクト比の差分だけ中央を切り出す。
    const srcRatio = img.width / img.height;
    const dstRatio = w / h;
    let sx = 0, sy = 0, sw = img.width, sh = img.height;
    if (srcRatio > dstRatio) {
      sw = img.height * dstRatio;
      sx = (img.width - sw) / 2;
    } else {
      sh = img.width / dstRatio;
      sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  } else {
    ctx.fillStyle = "#374151";
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

// getState()のtokensから、盤面・ロック・手札の描画に必要な画像URLを一通り集めて
// 先読みしておく（Canvas 2D の drawImage は読み込み完了済みのImageしか使えないため）。
async function preloadImages(state, seats) {
  const urls = new Set();
  for (const t of state.tokens) {
    if (t.kind === "card") {
      urls.add(t.faceUp ? getCardImagePath(t.cardId) : getCardBackImagePath(t.cardId));
    } else if (t.kind === "piece") {
      urls.add(getSkinImagePath(t.color, t.player));
    }
  }
  const cache = new Map();
  await Promise.all(
    [...urls].map(async (url) => {
      cache.set(url, await loadImage(url));
    })
  );
  return cache;
}

// 勝利の瞬間の対戦記録の「証拠画像」を生成し、canvasを返す（アップロードはonline.js側の
// 呼び出し元が行う）。activePlayers/winnerSeatはvictory.jsのcheckForVictoryから渡される
// ものと同じ形。
export async function generateVictorySummaryCanvas({ activePlayers, winnerSeat }) {
  const state = getState();
  const seats = SEAT_ORDER.filter((s) => activePlayers.includes(s));
  const images = await preloadImages(state, seats);
  const img = (url) => images.get(url) ?? null;

  const handTokensBySeat = new Map(
    seats.map((seat) => [
      seat,
      state.tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat),
    ])
  );
  const maxHandCount = Math.max(0, ...[...handTokensBySeat.values()].map((h) => h.length));

  const boardPx = BOARD_N * CELL + (BOARD_N - 1) * CELL_GAP;
  const sectionGap = 10;
  // 1プレイヤー分＝名前ラベル＋ロックエリア（7色）＋隙間＋手札ラベル＋手札の各行。
  const rowH = ROW_LABEL_H + CARD_H + sectionGap + ROW_LABEL_H + CARD_H + 20;
  const cardsAcross = Math.max(COLORS.length, maxHandCount, 1);
  const width = Math.max(PAD * 2 + boardPx, PAD * 2 + cardsAcross * (CARD_W + CARD_GAP));
  const titleH = 84;
  const height = titleH + PAD + boardPx + PAD + seats.length * rowH + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // 背景
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  // タイトル・日付・勝者
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("7 SHADES OF S:EVEN デジタル版 - 対戦記録", PAD, 34);
  ctx.font = "16px sans-serif";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(new Date().toISOString().slice(0, 10), PAD, 58);
  ctx.font = "bold 20px sans-serif";
  ctx.fillStyle = "#facc15";
  ctx.fillText(`🏆 勝者: ${getPlayerName(winnerSeat)}`, PAD, 82);

  // 盤面 7x7
  const boardX = PAD;
  const boardY = titleH + PAD;
  const cellTokens = state.tokens.filter((t) => t.location.zone === "cell");
  for (let row = 0; row < BOARD_N; row++) {
    for (let col = 0; col < BOARD_N; col++) {
      const x = boardX + col * (CELL + CELL_GAP);
      const y = boardY + row * (CELL + CELL_GAP);
      const card = cellTokens.find((t) => t.kind === "card" && t.location.row === row && t.location.col === col);
      const piece = cellTokens.find((t) => t.kind === "piece" && t.location.row === row && t.location.col === col);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x, y, CELL, CELL);
      if (card) {
        drawCover(ctx, img(card.faceUp ? getCardImagePath(card.cardId) : getCardBackImagePath(card.cardId)), x, y, CELL, CELL, 3);
      }
      if (piece) {
        const r = CELL * 0.22;
        const pieceImg = img(getSkinImagePath(piece.color, piece.player));
        if (pieceImg) {
          ctx.drawImage(pieceImg, x + CELL - r * 2 - 2, y + CELL - r * 2 - 2, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(x + CELL - r - 2, y + CELL - r - 2, r, 0, Math.PI * 2);
          ctx.fillStyle = "#e2e8f0";
          ctx.fill();
        }
      }
      ctx.strokeStyle = "rgba(226, 232, 240, 0.15)";
      ctx.strokeRect(x, y, CELL, CELL);
    }
  }

  // プレイヤーごとのロックエリア・手札
  let y = boardY + boardPx + PAD;
  for (const seat of seats) {
    const isWinner = seat === winnerSeat;
    const side = SEAT_TO_SIDE[seat];
    const color = getPieceColor(state, seat);

    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = isWinner ? "#facc15" : "#e2e8f0";
    const crown = isWinner ? "🏆 " : "";
    ctx.fillText(`${crown}${getPlayerName(seat)}${color ? `（${color}）` : ""}`, PAD, y + 16);

    // ロックエリア（7色分、揃っている色だけ実際のカード絵を表示）
    const lockY = y + ROW_LABEL_H;
    for (let i = 0; i < COLORS.length; i++) {
      const x = PAD + i * (CARD_W + CARD_GAP);
      const locked = state.tokens.find(
        (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === i
      );
      if (locked) {
        drawCover(ctx, img(getCardImagePath(locked.cardId)), x, lockY, CARD_W, CARD_H, 4);
      } else {
        ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
        ctx.fillRect(x, lockY, CARD_W, CARD_H);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.strokeRect(x, lockY, CARD_W, CARD_H);
      }
    }

    // 手札。ハマりどころ: ゲーム終了後でも、この証拠画像を生成しているクライアント
    // （勝者本人の画面）から見えるgetState()には、so7_game_tokens_visibleビューが
    // マスクした結果がそのまま入っている——自分の手札はfaceUp:true/cardIdありだが、
    // 他プレイヤーの手札はサーバー側で常にfaceUp:false・cardId:nullにされていて、
    // このクライアントには元々その中身を知る手段が無い（online.js冒頭のコメント
    // 参照）。「ゲームが終わったから見せてもよいはず」という理屈はサーバー側の
    // ビューには通用しないため、盤面のマス目と同じくtoken.faceUpに従い、見えない
    // 手札はカード裏面（getCardBackImagePathはcardId:nullでも既定の裏面にフォール
    // バックする）を描く。
    const handY = lockY + CARD_H + sectionGap;
    const hand = handTokensBySeat.get(seat) ?? [];
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#94a3b8";
    ctx.fillText(`手札（${hand.length}枚）`, PAD, handY + 12);
    const cardsY = handY + ROW_LABEL_H;
    hand.forEach((token, i) => {
      const x = PAD + i * (CARD_W + CARD_GAP);
      const src = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
      drawCover(ctx, img(src), x, cardsY, CARD_W, CARD_H, 4);
    });

    y += rowH;
  }

  return canvas;
}
