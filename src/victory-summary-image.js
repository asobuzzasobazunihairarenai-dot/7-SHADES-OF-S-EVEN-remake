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
import { getPlayerName, getPlayerAvatar } from "./player-identity.js";
import { getSelectedBackgroundPath } from "./background.js";
import { COLORS, GATE_POSITIONS, SIDE_TO_SEAT, SEAT_TO_SIDE, SEAT_ORDER } from "./board-layout.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

const BOARD_N = 7;
const CELL = 52;
const CELL_GAP = 3;
const BOARD_PX = BOARD_N * CELL + (BOARD_N - 1) * CELL_GAP;
const PAD = 24;
// ユーザー要望（続き95）「戦績システムに貼る対戦結果画像、ロック状況などは盤面の
// 雰囲気に合わせて盤面の各辺にあった方が自然でわかりやすい。全体を正方形画像で」。
// 以前の「盤面を左、各プレイヤーのロックエリアを右カラムに縦積み」という横長
// レイアウトをやめ、実際のゲーム画面と同じく「盤面を中央に置き、各プレイヤーの
// ロックエリアをそのプレイヤーのゲートがある辺の外側に配置する」十字型レイアウトに
// 変更した。BANDは各辺の帯の厚み（アバター・名前・ロック7色・手札枚数を収める）。
const BAND = 96;
const AVATAR_SIZE = 36;
const LOCK_SLOT = 48;
const LOCK_GAP = 3;
const LOCK_STRIP_LEN = COLORS.length * LOCK_SLOT + (COLORS.length - 1) * LOCK_GAP;
const TITLE_H = 92;

function loadImage(src, { crossOrigin } = {}) {
  return new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }
    const img = new Image();
    // アバターはGoogleアカウントのものだと外部ドメイン(googleusercontent.com)の
    // 画像になり得る。crossOrigin無しでcanvasに描画するとcanvasが「汚染」され、
    // 後段のcanvas.toBlob()がSecurityErrorで失敗する（同一オリジンのカード/駒画像
    // では起こらないため、呼び出し側がアバターの時だけ指定する）。
    if (crossOrigin) img.crossOrigin = crossOrigin;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null); // 読み込めなくても全体の生成は止めない
    img.src = src;
  });
}

function getPieceColor(state, seat) {
  const piece = state.tokens.find((t) => t.kind === "piece" && t.player === seat);
  return piece ? piece.color : null;
}

// Canvas 2DのfillStyle/strokeStyleは`var(--color-red)`のようなCSS変数参照をそのまま
// 解釈できない（DOM要素のstyleプロパティ経由でしか効かない）ため、実際に解決済みの
// 色値を:rootから読み出す。sound.jsのgetPerSoundVolumeと同じ考え方。
function resolveColorVar(color) {
  if (!color) return "#94a3b8";
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--color-${color}`).trim();
  return raw || "#94a3b8";
}

// ユーザー要望「背景を追加すると文字が見にくくなると思うので文字に背景を追加する
// などの対策」。実際のゲーム背景画像を敷くと、その柄次第で白文字が読みづらくなり
// 得るため、文字の後ろに半透明の黒い角丸パネルを敷いて常に読めるようにする。
function drawTextPanel(ctx, x, y, w, h, radius = 6) {
  ctx.save();
  ctx.fillStyle = "rgba(8, 10, 16, 0.6)";
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
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
// アバターは別キャッシュ（座席id→Image）にする。crossOrigin指定がカード/駒画像とは
// 異なるため（loadImage参照）、同じURLキーのMapに混ぜない。
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
  const avatarCache = new Map();
  let backgroundImg = null;
  await Promise.all([
    ...[...urls].map(async (url) => {
      cache.set(url, await loadImage(url));
    }),
    ...seats.map(async (seat) => {
      avatarCache.set(seat, await loadImage(getPlayerAvatar(seat), { crossOrigin: "anonymous" }));
    }),
    (async () => {
      backgroundImg = await loadImage(getSelectedBackgroundPath());
    })(),
  ]);
  return { cache, avatarCache, backgroundImg };
}

// 各プレイヤーの帯（ゲートのある辺の外側）を1つ描く。top/bottomは横向き（名前行＋
// アバター/ロック7色/手札枚数を左右方向に並べる）、left/rightは縦向き（同じ内容を
// 上下方向に並べる）。boardX/boardY/boardPxは盤面の描画位置・一辺の長さ。
function drawSideBand(ctx, { side, seat, isWinner, state, img, avatarCache, boardX, boardY }) {
  const color = getPieceColor(state, seat);
  const gateColor = resolveColorVar(color);
  const crown = isWinner ? "🏆 " : "";
  const nameLabel = `${crown}${getPlayerName(seat)}${color ? `（${color}）` : ""}`;
  const handCount = state.tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat
  ).length;
  const avatarImg = avatarCache.get(seat);
  const horizontal = side === "top" || side === "bottom";

  // 帯の矩形（盤面の外側、その辺いっぱいの長さ×BANDの厚み）。
  const rect = horizontal
    ? { x: boardX, y: side === "top" ? boardY - BAND : boardY + BOARD_PX, w: BOARD_PX, h: BAND }
    : { x: side === "left" ? boardX - BAND : boardX + BOARD_PX, y: boardY, w: BAND, h: BOARD_PX };

  ctx.save();
  ctx.font = "bold 15px sans-serif";
  const nameW = ctx.measureText(nameLabel).width;

  if (horizontal) {
    // 中身（アバター＋ロック7色）の合計幅で中央寄せする（帯の幅=盤面幅より少し
    // はみ出してもBANDの余白（コーナー部分）に収まる想定）。
    const contentW = AVATAR_SIZE + 8 + LOCK_STRIP_LEN;
    const contentX = rect.x + (rect.w - contentW) / 2;
    const nameY = side === "top" ? rect.y + 16 : rect.y + BAND - 28;
    const rowY = side === "top" ? rect.y + 26 : rect.y + 6;

    drawTextPanel(ctx, rect.x + (rect.w - Math.max(nameW + 12, contentW)) / 2 - 6, nameY - 15, Math.max(nameW + 12, contentW) + 12, 20, 5);
    ctx.fillStyle = isWinner ? "#facc15" : "#e2e8f0";
    ctx.fillText(nameLabel, rect.x + (rect.w - nameW) / 2, nameY);

    // アバター（円形）。
    const avatarCx = contentX + AVATAR_SIZE / 2;
    const avatarCy = rowY + AVATAR_SIZE / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatarImg) ctx.drawImage(avatarImg, contentX, rowY, AVATAR_SIZE, AVATAR_SIZE);
    else {
      ctx.fillStyle = "#374151";
      ctx.fillRect(contentX, rowY, AVATAR_SIZE, AVATAR_SIZE);
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = gateColor;
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.stroke();

    // ロック7色（アバターの右隣、横並び）。
    const lockX0 = contentX + AVATAR_SIZE + 8;
    for (let i = 0; i < COLORS.length; i++) {
      const x = lockX0 + i * (LOCK_SLOT + LOCK_GAP);
      drawLockSlot(ctx, state, img, seat, i, x, rowY);
    }

    // 手札枚数（ロック行のさらに外側、帯の端の空きに小さく表示）。
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.textAlign = "right";
    ctx.fillText(t("vsi.handN", { n: handCount }), rect.x + rect.w, side === "top" ? rowY + 44 : nameY - 24);
    ctx.textAlign = "left";
  } else {
    const contentH = AVATAR_SIZE + 8 + LOCK_STRIP_LEN;
    const contentY = rect.y + (rect.h - contentH) / 2;
    const colX = side === "left" ? rect.x + BAND - LOCK_SLOT - 14 : rect.x + 14;
    const avatarCx = colX + LOCK_SLOT / 2;
    const avatarCy = contentY + AVATAR_SIZE / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatarImg) ctx.drawImage(avatarImg, avatarCx - AVATAR_SIZE / 2, contentY, AVATAR_SIZE, AVATAR_SIZE);
    else {
      ctx.fillStyle = "#374151";
      ctx.fillRect(avatarCx - AVATAR_SIZE / 2, contentY, AVATAR_SIZE, AVATAR_SIZE);
    }
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = gateColor;
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.stroke();

    const lockY0 = contentY + AVATAR_SIZE + 8;
    for (let i = 0; i < COLORS.length; i++) {
      const y = lockY0 + i * (LOCK_SLOT + LOCK_GAP);
      drawLockSlot(ctx, state, img, seat, i, colX, y);
    }

    // 名前・手札枚数は縦帯の幅(BAND)に収まるよう回転せず短く配置する。
    ctx.font = "bold 13px sans-serif";
    ctx.fillStyle = isWinner ? "#facc15" : "#e2e8f0";
    drawTextPanel(ctx, rect.x + 2, contentY - 20, rect.w - 4, 18, 5);
    const shortName = `${crown}${getPlayerName(seat)}`;
    const shortW = ctx.measureText(shortName).width;
    ctx.fillText(shortName, rect.x + Math.max(2, (rect.w - shortW) / 2), contentY - 6);

    ctx.font = "11px sans-serif";
    ctx.fillStyle = "#e2e8f0";
    const handText = t("vsi.handN", { n: handCount });
    const handW = ctx.measureText(handText).width;
    ctx.fillText(handText, rect.x + Math.max(2, (rect.w - handW) / 2), lockY0 + LOCK_STRIP_LEN + 16);
  }
  ctx.restore();
}

function drawLockSlot(ctx, state, img, seat, colorIndex, x, y) {
  const side = SEAT_TO_SIDE[seat];
  const locked = state.tokens.find(
    (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === colorIndex
  );
  if (locked) {
    drawCover(ctx, img(getCardImagePath(locked.cardId)), x, y, LOCK_SLOT, LOCK_SLOT, 4);
  } else {
    ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
    ctx.fillRect(x, y, LOCK_SLOT, LOCK_SLOT);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
    ctx.strokeRect(x, y, LOCK_SLOT, LOCK_SLOT);
  }
}

// 勝利の瞬間の対戦記録の「証拠画像」を生成し、canvasを返す（アップロードはonline.js側の
// 呼び出し元が行う）。activePlayers/winnerSeatはvictory.jsのcheckForVictoryから渡される
// ものと同じ形。durationMinutes（続き95で追加）: online.jsのsubmitStatsMatchResultが
// 対局開始からの経過分数を計算して渡す（matches.duration_minutesと同じ値）。
//
// レイアウト（続き95、ユーザー要望「盤面の各辺に各プレイヤーの情報があった方が自然」
// 「全体を正方形に」）: 盤面を中央に据え、各プレイヤーのロックエリア・アバター・
// 手札枚数を、そのプレイヤーのゲートがある辺（SEAT_TO_SIDE）の外側の帯に配置する
// 十字型レイアウト。以前の「盤面＋右カラム」という横長2カラム構成をやめた。
export async function generateVictorySummaryCanvas({ activePlayers, winnerSeat, durationMinutes }) {
  const state = getState();
  const seats = SEAT_ORDER.filter((s) => activePlayers.includes(s));
  const { cache: images, avatarCache, backgroundImg } = await preloadImages(state, seats);
  const img = (url) => images.get(url) ?? null;

  const width = PAD * 2 + BAND * 2 + BOARD_PX;
  const height = TITLE_H + PAD + BAND * 2 + BOARD_PX + PAD;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  // 背景。ユーザー要望「背景をゲームで使用している背景に変えたい」——
  // background.jsのgetSelectedBackgroundPath()（プレイヤーが選択中の背景、
  // #sceneの外周に敷いているものと同じ画像）をcanvas全面にcoverで敷く。
  // 読み込めなかった場合は元の単色に フォールバックする。
  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);
  if (backgroundImg) {
    drawCover(ctx, backgroundImg, 0, 0, width, height, 0);
    // 背景画像の柄によっては文字が読みにくくなるため、全体に薄暗いオーバーレイを
    // 重ねて最低限のコントラストを確保する（この上にさらに個々のテキストパネルも敷く）。
    ctx.fillStyle = "rgba(6, 8, 14, 0.35)";
    ctx.fillRect(0, 0, width, height);
  }

  // タイトル・日付・勝者・プレイ時間（全幅、上部）。ユーザー要望「文字に背景を追加
  // するなど対策」＋（続き95）「画像にプレイ時間も記載してほしい」。
  drawTextPanel(ctx, PAD - 10, 8, width - (PAD - 10) * 2, TITLE_H - 16, 8);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText(t("vsi.header"), PAD, 30);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#cbd5e1";
  const durationText = durationMinutes != null ? t("vsi.duration", { n: durationMinutes }) : "";
  // ユーザー要望「戦績画像にターン数とラウンド数も明記」。state.roundNumber/turnNumberは
  // NEXT_TURNごとに更新される通算値（state.js参照）。
  const trText =
    state.roundNumber != null || state.turnNumber != null
      ? t("vsi.rounds", { round: state.roundNumber ?? "-", turn: state.turnNumber ?? "-" })
      : "";
  ctx.fillText(`${new Date().toISOString().slice(0, 10)}${durationText}${trText}`, PAD, 50);
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#facc15";
  ctx.fillText(t("vsi.winner", { name: getPlayerName(winnerSeat) }), PAD, 74);

  // 盤面 7x7（中央）。
  const gateSeatByCellKey = new Map();
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const seat = SIDE_TO_SEAT[side];
    if (seats.includes(seat)) gateSeatByCellKey.set(`${pos.row},${pos.col}`, seat);
  }
  const boardX = PAD + BAND;
  const boardY = TITLE_H + PAD + BAND;
  const cellTokens = state.tokens.filter((t) => t.location.zone === "cell");
  for (let row = 0; row < BOARD_N; row++) {
    for (let col = 0; col < BOARD_N; col++) {
      const x = boardX + col * (CELL + CELL_GAP);
      const y = boardY + row * (CELL + CELL_GAP);
      const card = cellTokens.find((t) => t.kind === "card" && t.location.row === row && t.location.col === col);
      const piece = cellTokens.find((t) => t.kind === "piece" && t.location.row === row && t.location.col === col);
      const gateSeat = gateSeatByCellKey.get(`${row},${col}`);
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x, y, CELL, CELL);
      if (card) {
        drawCover(ctx, img(card.faceUp ? getCardImagePath(card.cardId) : getCardBackImagePath(card.cardId)), x, y, CELL, CELL, 3);
      }
      if (piece) {
        // ユーザー報告「駒が右下になっちゃってる」→マス中央に描くよう修正。
        const r = CELL * 0.22;
        const cx = x + CELL / 2;
        const cy = y + CELL / 2;
        const pieceImg = img(getSkinImagePath(piece.color, piece.player));
        if (pieceImg) {
          ctx.drawImage(pieceImg, cx - r, cy - r, r * 2, r * 2);
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = "#e2e8f0";
          ctx.fill();
        }
      }
      if (gateSeat) {
        const gateColor = resolveColorVar(getPieceColor(state, gateSeat));
        ctx.lineWidth = 3;
        ctx.strokeStyle = gateColor;
        ctx.strokeRect(x + 1.5, y + 1.5, CELL - 3, CELL - 3);
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(226, 232, 240, 0.15)";
      ctx.strokeRect(x, y, CELL, CELL);
    }
  }

  // 各プレイヤーの帯（ゲートのある辺の外側）。
  for (const seat of seats) {
    drawSideBand(ctx, {
      side: SEAT_TO_SIDE[seat],
      seat,
      isWinner: seat === winnerSeat,
      state,
      img,
      avatarCache,
      boardX,
      boardY,
    });
  }

  return canvas;
}
