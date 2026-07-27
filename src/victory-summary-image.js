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

const BOARD_N = 7;
const CELL = 52;
const CELL_GAP = 3;
const PAD = 28;
// ユーザー要望「手札・ロックエリアのカードを正方形にして」「アバターを手札の横に
// 大きく、手札と同じくらいに」。カード・アバターとも同じ正方形サイズを共有する。
const CARD_SIZE = 68;
const AVATAR_SIZE = CARD_SIZE;
const CARD_GAP = 6;
const ROW_LABEL_H = 26;

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

// 勝利の瞬間の対戦記録の「証拠画像」を生成し、canvasを返す（アップロードはonline.js側の
// 呼び出し元が行う）。activePlayers/winnerSeatはvictory.jsのcheckForVictoryから渡される
// ものと同じ形。
//
// レイアウト（ユーザー要望「横長画像にしたい」）: 盤面を左カラム、各プレイヤーの
// ロックエリア・手札を右カラムに縦に並べる横並び2カラム構成にした（以前は盤面の下に
// 全プレイヤー分を縦に積んでいたため、正方形に近い盤面の分だけ縦長になっていた）。
export async function generateVictorySummaryCanvas({ activePlayers, winnerSeat }) {
  const state = getState();
  const seats = SEAT_ORDER.filter((s) => activePlayers.includes(s));
  const { cache: images, avatarCache, backgroundImg } = await preloadImages(state, seats);
  const img = (url) => images.get(url) ?? null;

  const handTokensBySeat = new Map(
    seats.map((seat) => [
      seat,
      state.tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === seat),
    ])
  );

  const boardPx = BOARD_N * CELL + (BOARD_N - 1) * CELL_GAP;
  const sectionGap = 10;
  // 1プレイヤー分＝名前ラベル＋（アバター＋ロックエリア7色）＋隙間＋手札枚数の
  // テキスト行。手札は絵を描かなくなった（枚数だけ）ため、その分の高さは
  // ROW_LABEL_Hだけで済む（続き44、ユーザー要望「手札は枚数表示だけでいい」「各
  // ロック結果の隣にアバターを配置」）。
  const playerBlockH = ROW_LABEL_H + CARD_SIZE + sectionGap + ROW_LABEL_H + 12;
  // 横幅を決めるのはロック行（アバター1枠＋7色）。手札行はもう絵を描かないため
  // 横幅には関与しない。
  const cardsAcross = 1 + COLORS.length;

  const titleH = 74;
  const colGap = 36;
  const leftColW = PAD * 2 + boardPx;
  const rightColW = PAD + cardsAcross * (CARD_SIZE + CARD_GAP);
  const width = leftColW + colGap + rightColW;
  const bodyH = Math.max(boardPx, seats.length * playerBlockH);
  const height = titleH + PAD + bodyH + PAD;

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

  // タイトル・日付・勝者（全幅、上部）。ユーザー要望「文字に背景を追加するなど対策」。
  drawTextPanel(ctx, PAD - 10, 8, width - (PAD - 10) * 2, titleH - 16, 8);
  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 22px sans-serif";
  ctx.fillText("7 SHADES OF S:EVEN デジタル版 - 対戦記録", PAD, 30);
  ctx.font = "14px sans-serif";
  ctx.fillStyle = "#cbd5e1";
  ctx.fillText(new Date().toISOString().slice(0, 10), PAD, 50);
  ctx.font = "bold 18px sans-serif";
  ctx.fillStyle = "#facc15";
  ctx.fillText(`🏆 勝者: ${getPlayerName(winnerSeat)}`, PAD, 70);

  // 左カラム: 盤面 7x7
  // ユーザー要望「各ゲート誰がどのゲートかわかるようにしてください」。GATE_POSITIONSの
  // 4マス（row,col）に、その辺の持ち主（SIDE_TO_SEAT、参加していない辺はnull）を
  // 対応付けておき、盤面描画時にそのマスだけ持ち主の駒の色で縁取り＋名前ラベルを出す。
  const gateSeatByCellKey = new Map();
  for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
    const seat = SIDE_TO_SEAT[side];
    if (seats.includes(seat)) gateSeatByCellKey.set(`${pos.row},${pos.col}`, seat);
  }
  const boardX = PAD;
  const boardY = titleH + PAD;
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
        ctx.font = "bold 11px sans-serif";
        const label = getPlayerName(gateSeat);
        const labelW = ctx.measureText(label).width + 6;
        ctx.fillStyle = "rgba(8, 10, 16, 0.75)";
        ctx.fillRect(x + 2, y + 2, Math.min(labelW, CELL - 4), 14);
        ctx.fillStyle = gateColor;
        ctx.save();
        ctx.beginPath();
        ctx.rect(x + 2, y + 2, CELL - 4, 14);
        ctx.clip();
        ctx.fillText(label, x + 4, y + 12);
        ctx.restore();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(226, 232, 240, 0.15)";
      ctx.strokeRect(x, y, CELL, CELL);
    }
  }

  // 右カラム: プレイヤーごとのロックエリア・手札
  const rightX = leftColW + colGap;
  let y = boardY;
  for (const seat of seats) {
    const isWinner = seat === winnerSeat;
    const side = SEAT_TO_SIDE[seat];
    const color = getPieceColor(state, seat);

    drawTextPanel(ctx, rightX - 8, y - 4, rightColW - PAD, ROW_LABEL_H, 6);
    ctx.font = "bold 16px sans-serif";
    ctx.fillStyle = isWinner ? "#facc15" : "#e2e8f0";
    const crown = isWinner ? "🏆 " : "";
    ctx.fillText(`${crown}${getPlayerName(seat)}${color ? `（${color}）` : ""}`, rightX, y + 16);

    // ユーザー要望「各ロック結果の隣にアバターを配置しましょう」。以前は手札の列の
    // 先頭に置いていたアバターを、ロックエリアの列の先頭（CARD_SIZE四方、AVATAR_SIZE
    // と共通）に移した。
    const lockY = y + ROW_LABEL_H;
    const avatarImg = avatarCache.get(seat);
    const avatarCx = rightX + AVATAR_SIZE / 2;
    const avatarCy = lockY + AVATAR_SIZE / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarCx, avatarCy, AVATAR_SIZE / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    if (avatarImg) {
      ctx.drawImage(avatarImg, rightX, lockY, AVATAR_SIZE, AVATAR_SIZE);
    } else {
      ctx.fillStyle = "#374151";
      ctx.fillRect(rightX, lockY, AVATAR_SIZE, AVATAR_SIZE);
    }
    ctx.restore();

    // ロックエリア（7色分、揃っている色だけ実際のカード絵を表示。正方形）。
    // アバターの分だけ右にずらして並べる。
    for (let i = 0; i < COLORS.length; i++) {
      const x = rightX + AVATAR_SIZE + CARD_GAP + i * (CARD_SIZE + CARD_GAP);
      const locked = state.tokens.find(
        (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === i
      );
      if (locked) {
        drawCover(ctx, img(getCardImagePath(locked.cardId)), x, lockY, CARD_SIZE, CARD_SIZE, 4);
      } else {
        ctx.fillStyle = "rgba(148, 163, 184, 0.12)";
        ctx.fillRect(x, lockY, CARD_SIZE, CARD_SIZE);
        ctx.strokeStyle = "rgba(148, 163, 184, 0.35)";
        ctx.strokeRect(x, lockY, CARD_SIZE, CARD_SIZE);
      }
    }

    // 手札。ユーザー要望「手札は枚数表示だけで何を持っていたかは無しでいい、画面が
    // すっきりする」への対応でカード絵の列は描かず、枚数だけをテキストで示す
    // （ハマりどころだった「他プレイヤーの手札の中身はこのクライアントから元々見えない」
    // 問題自体も、絵を描かなくなったことで自然に解消する）。
    const handY = lockY + CARD_SIZE + sectionGap;
    const hand = handTokensBySeat.get(seat) ?? [];
    drawTextPanel(ctx, rightX - 8, handY - 2, rightColW - PAD, ROW_LABEL_H - 6, 6);
    ctx.font = "14px sans-serif";
    ctx.fillStyle = "#e2e8f0";
    ctx.fillText(`手札: ${hand.length}枚`, rightX, handY + 12);

    y += playerBlockH;
  }

  return canvas;
}
