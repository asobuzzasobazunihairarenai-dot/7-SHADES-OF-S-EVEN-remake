// Phase 1: 盤面・手札・山札等を描画し、駒とカードをドラッグ操作で自由に動かせるようにする。
// ルール処理は行わない（ユドナリウムコネクトのような手動サンドボックス）。

import {
  initAdminMode,
  getUsableLockedEffect,
  isGatePedestalVisible,
  isSelfBoardAvatarVisible,
  isSelfNameLabelVisible,
  registerStartPlayerPreviewHelper,
  registerAuraPreviewHelper,
  registerRankRingPreviewHelper,
} from "./admin.js";
import { initDeckViewer, openDeckViewer } from "./deck-viewer.js";
import { initStatsPlayerLinkModal } from "./stats-player-link.js";
import { initMyPage, openMyPage, registerAvatarPickerHelper } from "./my-page.js";
import { initHelpButton } from "./help.js";
import { initCurrencyDisplay, refreshCurrencyDisplay } from "./currency-display.js";
import { initShop, openShopPanel } from "./shop.js";
import { initGameSetup, previewStartPlayerModal } from "./game-setup.js";
import { initOptionsMenu } from "./options-menu.js";
import { runGateInvasionsIfNeeded } from "./gate-invasion.js";
import { announceHandPickups, announceCardLocked } from "./hand-announcer.js";
import { enqueueGateInvasionSteps } from "./gate-invasion-modal.js";
import { checkForVictory, wouldCompleteLockWithNewIndex, getLockedCount, resetVictoryTracking } from "./victory.js";
import { registerVictoryHelpers } from "./post-game-panel.js";
import { announceTurnChange } from "./turn-announce.js";
import {
  buildFinalLockApprovalBanner,
  updateFinalLockApprovalBanner,
  registerFinalLockApprovalHandler,
} from "./final-lock-approval.js";
import {
  buildContactApprovalModal,
  updateContactApprovalModal,
  registerContactApprovalHandler,
} from "./contact-approval.js";
import {
  getSkinImagePath,
  getMyPieceColor,
  openPieceSkinPicker,
  registerPieceSkinHelpers,
  setLocalPreferredSkinIndex,
} from "./piece-skins.js";
import {
  openCardBackSkinPicker,
  registerCardBackSkinHelpers,
  backImagePath as cardBackSetImagePath,
  getCardBackSetIndex,
  setCardBackSetIndex,
  getCardBackSetColorVar,
} from "./card-back-skins.js";
import { openPlaymatPicker, registerPlaymatHelpers, getSelectedPlaymatPath, setSelectedPlaymatId } from "./playmat.js";
import { openBackgroundPicker, registerBackgroundHelpers, getSelectedBackgroundPath, setSelectedBackgroundId } from "./background.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getPlayerName, getPlayerAvatar, setPlayerName, setPlayerAvatar, AVATAR_OPTIONS } from "./player-identity.js";
import { applyAvatarContent, getAvatarVariant, getAwakenedVariant, getEnragedVariant } from "./avatar-render.js";
import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { buildAvatarUploadSection } from "./avatar-upload.js";
import { isLockAreaBarVisible, setLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible } from "./lock-color.js";
import { isArrivalEffectDisabled, isFlightAnimationDisabled } from "./motion-prefs.js";
import { rectCenter, flyGhost } from "./ghost-flight.js";
import { showCardArrivalModal } from "./card-arrival.js";
import { initPlayerButtons } from "./player-buttons.js";
import { initQuickStart } from "./quick-start.js";
import { initPhaseGuide } from "./phase-guide.js";
import { initTutorialAutoStart, registerTutorialStageHelpers } from "./tutorial.js";
import { initTurnTimer } from "./turn-timer.js";
import { initIconRearrange } from "./icon-rearrange.js";
import { initSelfStatusRearrange } from "./self-status-rearrange.js";
import { initInteractionModeToggle } from "./interaction-mode.js";
import { initDeviceDetect, isTouchPrimaryDevice } from "./device-detect.js";
import { registerRenderHelpers, animateFirstCardsDealt, animateBoardFilled } from "./setup-animation.js";
import {
  registerRemoteMoveAnimatorHelpers,
  handleHydrate as handleRemoteMoveHydrate,
  skipNextHydrateDiff,
  reapplyActiveHighlights,
} from "./remote-move-animator.js";
import { markSelfHandled } from "./self-handled-tokens.js";
import {
  getState,
  moveToken,
  sendTokenToPile,
  drawFromPile,
  flipToken,
  shuffleHand,
  nextTurn,
  refillDeckFromDiscard,
  subscribe,
  isOnlineMode,
  requestFinalLock,
  respondFinalLock,
  requestContact,
  respondContact,
} from "./state.js";
import { initOnlineUi, openOnlinePanel, isOnlineIntentActive } from "./online-ui.js";
import { initOpeningScreen, previewOpeningAuras } from "./opening-screen.js";
import {
  getSelfSeat,
  getCachedUser,
  getCurrentUser,
  getCurrentGameId,
  onAuthChange,
  fetchAndHydrate,
  onGateInvasionEvents,
  getSyncedIdentity,
  getGoogleAvatarUrl,
  getGoogleDisplayName,
  fetchMyCustomAvatarUrl,
  getRoomName,
  registerIdentityApplier,
  registerAppearanceApplier,
  registerFirstGoogleLoginPrompter,
  saveMyPreference,
  registerVictorySummaryHelper,
  registerShopOpener,
  isItemUnlocked,
  openShop,
} from "./online.js";
import { fetchStatsProfile, getTierInfo } from "./stats-profile.js";
import { setRankRingOrbitContainer, startRankRingOrbit } from "./rank-ring-orbit.js";
import { generateVictorySummaryCanvas } from "./victory-summary-image.js";
import { playSound, initGameBgmAutoStart } from "./sound.js";
import { getCardDefinition, getCardImagePath, getCardBackImagePath } from "./cards-data.js";
import {
  COLORS,
  GATE_POSITIONS,
  SEAT_TO_SIDE,
  SIDE_TO_SEAT,
  SEAT_ORDER,
  getRotationSteps,
  rotateCell,
  rotateSide,
  getFinalLockApprovalOrder,
} from "./board-layout.js";

// セットアップの配布演出（setup-animation.js）が、render()で新しくDOM要素を作らせる
// 「前」に登録しておく、まだ登場させたくないトークンidの集合。render()の後から
// classList.addで隠す方式だと、理論上は同期処理で一瞬たりとも見えないはずでも、
// 実際のブラウザでは一瞬フルに見えてから隠れる「フラッシュ」が起きることがあった
// （盤面49マス一斉配置後の駒、49マスのカード配布開始直前、いずれも報告あり）。
// render()がトークンの要素を作る「その場」でこの集合を見て最初からopacity:0にしておけば、
// 見えてしまう一瞬自体が存在しなくなる。
let setupPendingTokenIds = new Set();
function setSetupPendingTokenIds(ids) {
  setupPendingTokenIds = ids;
}

// side引数は常に「実際の物理side」（ゲート/座席と紐づく本当のside）を渡す。
// ロックエリア自体の判定（トークンのdataset.side・手番ハイライト）は全てこのsideを使う。
// stepsはビューア視点回転量（main.jsのrender()参照）で、CSSクラス名（＝画面上の表示位置）
// だけをrotateSide()で変換する。他は一切変更しないため、既存のロックエリアCSS
// （Dの180度回転補正・effect-side-flip等）はそのまま正しく動く。
function buildLockArea(side, steps = 0) {
  const el = document.createElement("div");
  const turnPlayer = getState().turnPlayer;
  const isTurnSide = turnPlayer && SEAT_TO_SIDE[turnPlayer] === side;
  const displaySide = rotateSide(side, steps);
  el.className = `lock-area lock-${displaySide}${isTurnSide ? " is-turn-player" : ""}`;
  COLORS.forEach((color, index) => {
    const slot = document.createElement("div");
    slot.className = "lock-slot";
    slot.dataset.side = side;
    slot.dataset.index = String(index);
    // オプションメニューの「基本設定」でオフにされていれば、色の上書きをせずCSS側の
    // デフォルト（無色のグレー枠）のままにする。
    if (isLockColorVisible()) {
      slot.style.borderColor = `var(--color-${color})`;
      slot.style.color = `var(--color-${color})`; // CSS側のbox-shadow: currentColorで使う
    }
    // 以前は視認性確保のため塗りつぶしにしていたが、z-index修正で表示問題が解決したので、
    // 枠線とうっすらしたグロー(box-shadow)だけの控えめな色分けに戻した。
    el.appendChild(slot);
  });
  return el;
}

// ゲートマスを台座のように少し高く見せる装飾（管理者モードでオンオフ可能、
// isGatePedestalVisible参照）。駒(.piece)の「床+壁」技法（buildCubePiece参照）と同じ
// preserve-3d構成だが、.cell自身は一切transformしない（既存の駒/カード位置決めは
// .cellのZ=0を基準にしているため、ここを動かすと全部ズレる）。代わりに装飾専用の
// 子要素だけを浮かせることで、既存の当たり判定・描画コードを無改修のまま台座を追加できる。
// pointer-events:noneなので駒/カードのドラッグ判定(elementsFromPoint)には一切影響しない。
function buildGatePedestal() {
  const pedestal = document.createElement("div");
  pedestal.className = "gate-pedestal";
  for (const face of ["top", "wall-front", "wall-back", "wall-left", "wall-right"]) {
    const el = document.createElement("div");
    el.className = `gate-pedestal-face gate-pedestal-${face}`;
    pedestal.appendChild(el);
  }
  return pedestal;
}

// row/col・dataset.row/colは常に「実際のマス座標」（drag/drop・findLocationElement等が
// 引き続きこれを使う）。stepsが0でなければ、CSS Gridの行/列を明示指定して見た目の位置
// だけをrotateCell()で回転させる（暗黙のDOM順配置を上書きする。行/列は1始まりのため+1）。
function buildBoard(steps = 0) {
  const board = document.createElement("div");
  board.className = "board";
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 7; col++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      const isGate = Object.values(GATE_POSITIONS).some((g) => g.row === row && g.col === col);
      if (isGate) {
        cell.classList.add("is-gate");
        if (isGatePedestalVisible()) cell.appendChild(buildGatePedestal());
      }
      cell.dataset.row = String(row);
      cell.dataset.col = String(col);
      if (steps % 4 !== 0) {
        const { row: dr, col: dc } = rotateCell(row, col, steps);
        cell.style.gridRow = String(dr + 1);
        cell.style.gridColumn = String(dc + 1);
      }
      board.appendChild(cell);
    }
  }
  return board;
}

// ロックエリアと盤面(49マス)の間に置く装飾バー。画像自体は横長（画像素材/ロックエリアバー/）
// なので、外側の位置決め用ボックス（top/bottomはそのまま、left/rightは幅高さを入れ替えた
// 縦長）と、中の画像用要素（常に横長のまま、left/rightだけCSSでrotate(90deg)）を分けている。
// こうすることで、回転による見た目上のズレを位置決めの計算に混ぜずに済む。
// 装飾のみでゲームデータを持たないため、表示位置(rotateSide結果)をそのままクラス名に使う。
function buildLockAreaBar(side, steps = 0) {
  const outer = document.createElement("div");
  const displaySide = rotateSide(side, steps);
  outer.className = `lock-area-bar lock-area-bar-${displaySide}`;
  outer.style.display = isLockAreaBarVisible() ? "block" : "none";
  const img = document.createElement("div");
  img.className = "lock-area-bar-image";
  outer.appendChild(img);
  return outer;
}

function buildArena(steps = 0) {
  const arena = document.createElement("div");
  arena.className = "arena";
  // 背景画像（ユーザー提供、プレイマットよりさらに大きい背景イメージ）。プレイマットより
  // 先にappendChildすることで、DOM順・z-index(0<1)の両方で確実にプレイマットの背面に
  // なるようにする。画像パスはCSSのurl()（style.cssからの相対パスになり404になる）では
  // なくJS側でinline styleとして敷く（他の実物画像アセットと同じ理由）。
  const backgroundBg = document.createElement("div");
  backgroundBg.className = "table-background-bg";
  backgroundBg.style.backgroundImage = `url("${getSelectedBackgroundPath()}")`;
  arena.appendChild(backgroundBg);
  const playmatBg = document.createElement("div");
  playmatBg.className = "playmat-bg";
  playmatBg.style.backgroundImage = `url("${getSelectedPlaymatPath()}")`;
  arena.appendChild(playmatBg); // 最初に追加＝他の要素の背面に描画される
  arena.appendChild(buildLockAreaBar("top", steps));
  arena.appendChild(buildLockAreaBar("bottom", steps));
  arena.appendChild(buildLockAreaBar("left", steps));
  arena.appendChild(buildLockAreaBar("right", steps));
  arena.appendChild(buildLockArea("top", steps));
  arena.appendChild(buildLockArea("left", steps));
  arena.appendChild(buildBoard(steps));
  arena.appendChild(buildLockArea("right", steps));
  arena.appendChild(buildLockArea("bottom", steps));
  return arena;
}

// 手札を扇状に並べる。中央のカードを基準に、外側ほど回転がつき、盤面から遠ざかる向きに
// 少し逃げる弧を描く（トランプを持っている感じ）。上下(horizontal)は左右に、
// 左右(vertical)は上下に扇が開く。個々のカードを少しずつ回転させるだけなので、
// 扇コンテナ全体を90度回転させていた以前の方式（カード自体が横倒しになるバグがあった）とは違う。
// isSelf: 自分の手札は大きく扇状に開く。他プレイヤーの手札は裏向き・密集させて控えめに見せる。
const ARC_SIGN = { top: -1, bottom: 1, left: -1, right: 1 }; // 盤面から遠ざかる方向

function layoutFan(count, orientation, isSelf, side) {
  const maxSpread = isSelf ? Math.min(50, count * 11) : Math.min(24, count * 6); // 度
  const step = count > 1 ? maxSpread / (count - 1) : 0;
  const start = -maxSpread / 2;
  // すべてpx単位（1rem=16px換算）。カード同士の間隔
  const spacing = isSelf ? 48 : orientation === "vertical" ? 17.6 : 14.4;
  // 相手の手札は弧をつけない：3D変形と組み合わさると非対称に見えてしまうため回転のみのシンプルな扇にする
  const arcStrength = isSelf ? 8 : 0;
  const arcSign = ARC_SIGN[side];

  return Array.from({ length: count }, (_, i) => {
    const angle = count > 1 ? start + step * i : 0;
    const centerOffset = i - (count - 1) / 2;
    const arc = Math.abs(centerOffset) * arcStrength * arcSign; // 中央が基準、外側ほど盤面から離れる
    if (orientation === "vertical") {
      return { angle, spreadX: arc, spreadY: centerOffset * spacing };
    }
    return { angle, spreadX: centerOffset * spacing, spreadY: arc };
  });
}

function buildPlayerZone(side, player, isSelf) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = `label${player === getState().turnPlayer ? " is-turn-player" : ""}`;
  nameEl.textContent = getPlayerName(player);

  // アバターは「手札の後ろ側」に見えるよう、手札(.hand-area)より先にDOMへ足す
  // （同じ場所で重なった時、後から足した手札側が手前に描画される）。管理者モードで
  // 位置・サイズを調整できる（--avatar-{a,b,c,d}-pos-x/y・--avatar-{a,b,c,d}-size）。
  // 画面上の位置（手前/左/奥/右）に応じて、実物の駒のように盤面中央を向くよう
  // アバター画像の向き（正面/左向き/右向き）を差し替える（ユーザー要望）。
  const AVATAR_DIRECTION_BY_SIDE = { bottom: "front", left: "right", top: "front", right: "left" };
  const avatarEl = document.createElement("div");
  avatarEl.className = `player-avatar${player === getState().turnPlayer ? " is-turn-player" : ""}`;
  let avatarSrc = getAvatarVariant(getPlayerAvatar(player), AVATAR_DIRECTION_BY_SIDE[side]);
  // ユーザー要望「残りロックエリアの数が3つになったら覚醒版(アバター2)、1つになったら
  // 激昂版(アバター3)に変更してほしい」。7色中4色ロック済み＝残り3つで覚醒、6色ロック済み
  // ＝残り1つで激昂。ロックはGATE_INVASION_ETERNALで手札へ戻されることもあるため、
  // 毎回のrender()で都度判定し直す（一度切り替わったら固定、ではなくその時点の実際の
  // ロック数に追従する）。
  const lockedCount = getLockedCount(player);
  if (lockedCount >= 6) avatarSrc = getEnragedVariant(avatarSrc);
  else if (lockedCount >= 4) avatarSrc = getAwakenedVariant(avatarSrc);
  applyAvatarContent(avatarEl, avatarSrc);

  const orientation = side === "left" || side === "right" ? "vertical" : "horizontal";

  const handEl = document.createElement("div");
  handEl.className = "hand-area";
  handEl.dataset.player = player;
  const fanEl = document.createElement("div");
  fanEl.className = `hand-fan ${isSelf ? "is-self" : "is-opponent"}`;

  const handTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player
  );

  // .hand-areaは見た目だけでなく、カードをドロップする際の当たり判定(findDropTarget)にも
  // 使われる。固定サイズ(以前はwidth:100%=盤面と同じ幅)のままだと実際に見えている手札の
  // 範囲よりずっと広くなり、ロックエリアの帯と干渉してしまう。手札3枚の時を基準サイズ
  // (--hand-{a,b,c,d}-size、管理者モードで調整可能)とし、枚数に比例して自動で伸縮させる。
  // 扇が伸びる方向(横=horizontal、縦=vertical)にだけ効かせ、反対方向は固定のまま。
  // 注意: このCSS変数は座席(player)ではなく画面上の表示位置(side)に紐づく
  // （例: --hand-a-sizeは常に「画面手前(bottom)」用のサイズ。ビューア視点回転により
  // bottom位置に座席B/C/Dが来ることがあるため、player.toLowerCase()ではなくsideから
  // 変数名を組み立てる必要がある）。
  const HAND_VAR_LETTER = { bottom: "a", left: "b", top: "c", right: "d" };
  const baseSize = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue(`--hand-${HAND_VAR_LETTER[side]}-size`)
  );
  const scale = Math.max(handTokens.length, 2) / 3;
  const sizeRem = (Number.isNaN(baseSize) ? 10 : baseSize) * scale;
  if (orientation === "horizontal") handEl.style.width = `${sizeRem}rem`;
  else handEl.style.height = `${sizeRem}rem`;

  const layout = layoutFan(handTokens.length, orientation, isSelf, side);
  handTokens.forEach((token, i) => {
    const cardEl = document.createElement("div");
    // 自分の手札は常に中身が見える（物理カードを自分で持っているのと同じ）。
    // 他プレイヤーの手札は中身を明かさず、常に裏向きの見た目にする。
    // カード画像自体にタイトル・色・効果まで描かれているので、背景画像を敷くだけでよい。
    if (isSelf) {
      cardEl.className = "hand-card is-self";
      cardEl.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
    } else {
      cardEl.className = "hand-card is-facedown";
      cardEl.style.backgroundImage = `url("${getCardBackImagePath(token.cardId)}")`;
    }
    cardEl.dataset.tokenId = token.id;
    const card = layout[i];
    cardEl.style.transform = `translateX(${card.spreadX}px) translateY(${card.spreadY}px) rotate(${card.angle}deg)`;
    // ひょこっと持ち上げ演出（initHandPeek参照）が、この基準となる扇の位置に戻せるよう
    // 保持しておく（後からtranslateZを追加する時、この文字列に追記する形にする）。
    if (isSelf) cardEl.dataset.baseTransform = cardEl.style.transform;
    fanEl.appendChild(cardEl);
  });
  handEl.appendChild(fanEl);

  // 手札公開エリア: 盤面のそば・プレイヤー名の下あたりに置く、表向きカードの公開表示場所
  // （ユーザー要望）。2通りの経路でカードが集まる: (1) 手札からドラッグで手動配置＝
  // 手札効果の使用を宣言する時などに使う（findDropTarget参照、revealSource:"manual"）、
  // (2) 「公開ドロー」ボタン（buildPublicDrawButton参照）で山から直接引く
  // （revealSource:"draw"）。どちらも扇状の手札には直接入らず、手札シャッフル/ターン終了を
  // 押すと通常の手札へまとめて合流する（state.jsのmergePublicDrawIntoHand参照）。誰が
  // 置いた/引いたかは公開情報なので、自分以外の座席分も常に表向きで表示する（普段の手札とは
  // 違い、ここではisSelfによる出し分けをしない）。各カードの下に「捨てる」ボタンが付き、
  // 押すとその場で捨て場へ送れる。
  const handRevealEl = document.createElement("div");
  handRevealEl.className = `hand-reveal-area hand-reveal-${side}`;
  handRevealEl.dataset.player = player;
  const handRevealTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === player
  );
  handRevealTokens.forEach((token) => {
    const slot = document.createElement("div");
    slot.className = "hand-reveal-slot";
    const cardEl = document.createElement("div");
    // revealSourceが無い（あり得ない想定だが安全側で）場合は手動配置扱いにしておく。
    cardEl.className = `hand-reveal-card${token.revealSource === "draw" ? " is-drawn" : " is-manual"}`;
    cardEl.dataset.tokenId = token.id;
    cardEl.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
    const badge = document.createElement("span");
    badge.className = "hand-reveal-badge";
    badge.textContent = token.revealSource === "draw" ? "🎴 公開ドロー" : "📣 宣言";
    cardEl.appendChild(badge);
    const discardBtn = document.createElement("button");
    discardBtn.className = "hand-reveal-discard-btn";
    discardBtn.type = "button";
    discardBtn.textContent = "🗑 捨てる";
    // ハマりどころ（ユーザー報告「捨てるボタンが押せない」の根本原因）: このボタンは
    // .hand-area/.hand-reveal-area等と同じ深いperspective+rotateXの3D階層の中にあり、
    // 実機で検証したところdocument.elementFromPoint()（単数形、実際のマウス/クリック
    // イベントがヒットテストに使うのと同じAPI）がこの領域では見た目と食い違い、
    // ボタンの真上でクリックしても#game-tableが受け取ってしまうことを確認した
    // （elementsFromPoint()＝複数形なら正しくボタンを最前面として返す）。他の全ての
    // カード/駒操作が採用しているのと同じ対策＝ネイティブのclickに頼らず、
    // #game-tableのpointerdownハンドラ側でelementsFromPoint()を使った自前判定
    // （findDiscardButtonAt参照）で拾う方式に統一する。tokenIdだけdatasetに残す。
    discardBtn.dataset.tokenId = token.id;
    slot.appendChild(cardEl);
    slot.appendChild(discardBtn);
    handRevealEl.appendChild(slot);
  });

  // 自分の盤面横の名前ラベルは不要とのご要望により、デフォルト非表示にした（管理者
  // モードでオンオフ可能）。B/C/Dは常時表示のまま。
  if (!isSelf || isSelfNameLabelVisible()) zone.appendChild(nameEl);
  // 自分(A)の盤面アバターは、左下の大きい背面アバターと重複して冗長との要望により
  // デフォルト非表示にした（管理者モードでオンオフ可能）。B/C/Dは常時表示のまま。
  if (!isSelf || isSelfBoardAvatarVisible()) zone.appendChild(avatarEl);
  zone.appendChild(handEl);
  zone.appendChild(handRevealEl);
  return zone;
}

// 手札公開エリアのカードを捨て場へ送る（各カードの「捨てる」ボタン）。ドラッグ操作の
// sendTokenToPile呼び出し（onDragEndのpile-drop分岐）と同じパターン。
async function discardFromHandReveal(tokenId) {
  if (isOnlineMode()) {
    try {
      await sendTokenToPile(tokenId, "discard");
      markSelfHandled([tokenId]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("sendTokenToPile failed", err);
      render();
    }
    return;
  }
  sendTokenToPile(tokenId, "discard");
  render();
}

// 枚数に応じて厚みのある山を作る（山札・エターナルカード用。将来は盤面マスのスタックにも流用する）。
// 1枚あたり0.6px、最低0.15rem（0枚でも山があるように見える最低限の厚み）。
// imagePathを渡すと、その画像を背景に敷く（山札/エターナルは常に裏面画像、捨て場は
// 空でなければ一番上のカードの実際の絵柄）。名前・枚数は常時表示のテキストではなく、
// ホバー時のツールチップ（updatePileTooltip参照）でだけ見せるようにしている。
function buildCardStack(count, pileClass, imagePath) {
  const stack = document.createElement("div");
  stack.className = "stack";
  const heightPx = Math.max(2.4, count * 0.6);
  stack.style.setProperty("--stack-height", `${heightPx}px`);
  // ユーザー要望「カードが束になってる時の側面の色を、カード裏面の色に対応した
  // 雰囲気の色に自動で変更できますか」への対応。色テーマ付きの裏面セット（赤〜黒）を
  // 選んでいる間だけ、その色を側面に反映する（標準/旧/古の3セットはnullが返り、
  // CSS側のフォールバック=従来通りの無地グレーのままになる）。
  const sideColor = getCardBackSetColorVar(getCardBackSetIndex());
  if (sideColor) stack.style.setProperty("--stack-side-color", sideColor);
  else stack.style.removeProperty("--stack-side-color");

  const top = document.createElement("div");
  top.className = `stack-top ${pileClass}`;
  if (imagePath) {
    top.style.backgroundImage = `url("${imagePath}")`;
  } else {
    // 0枚の時は、CSS側の色付きフォールバック背景（.pile-deck等）を打ち消して透明にする
    // （捨て場が空の時と同じ「中身が無いとわかる」見た目にする。imagePathがnullでも
    // フォールバック背景のせいで満杯の山があるように見えてしまっていたのを修正）。
    top.style.backgroundImage = "none";
    top.style.backgroundColor = "transparent";
  }
  stack.appendChild(top);

  // 側面にtop面と同じカード柄を敷くと、薄い帯に絵柄が引き伸ばされて見苦しいため、
  // 側面は無地のままにする（色は上のsideColorに従う、既定は薄いグレー）。4面
  // （前後左右）すべて用意しないと、見る角度によって存在しない面から奥が透けて
  // 見えてしまう（駒(.piece)と同じ理由）。
  for (const wallClass of ["stack-front", "stack-back", "stack-left", "stack-right"]) {
    const wall = document.createElement("div");
    wall.className = wallClass;
    stack.appendChild(wall);
  }

  return stack;
}

// backImageKindは「通常/エターナル/ファースト」のどの裏面画像セットを使うかの種別
// （card-back-skins.jsのbackImagePath()第1引数）。選ばれているセット番号は
// getCardBackSetIndex()を毎回参照する（プレイヤー自身の好みでいつでも変わり得るため、
// ここで固定パスとして持たない）。
const PILE_CONFIG = {
  deck: { gridArea: "deck", pileClass: "pile-deck", label: "山札", backImageKind: "normal" },
  eternal: { gridArea: "eternal", pileClass: "pile-eternal", label: "エターナルカード", backImageKind: "eternal" },
  first: { gridArea: "first", pileClass: "pile-first", label: "ファーストカード", backImageKind: "first" },
  discard: { gridArea: "discard", pileClass: "pile-discard", label: "捨て場" },
};

// 名前・枚数のテキストはゾーン外の別ラベルにも山自体にも常時表示しない。ホバー時のツール
// チップ（getPileTooltipText参照）でだけ見せる。山札・エターナルは常に裏面画像（裏向き積み
// のため中身は明かさない）。捨て場だけはルール上「表向きに積む」場所なので、空でなければ
// 一番上のカードの実際の画像を表示する。
function buildPileZone(pileKey) {
  const config = PILE_CONFIG[pileKey];
  const zone = document.createElement("div");
  zone.className = `zone zone-${config.gridArea} pile-zone`;
  zone.dataset.pile = pileKey;

  const pileArray = getState().piles[pileKey];
  const count = pileArray.length;
  // 0枚の時はどの山も画像なし（透明）にする。捨て場は空でなければ一番上のカードの実物、
  // それ以外（山札・エターナル・ファースト）は裏向き積みのため常に共通の裏面画像。
  let imagePath = null;
  if (count > 0) {
    imagePath =
      pileKey === "discard"
        ? getCardImagePath(pileArray[pileArray.length - 1])
        : cardBackSetImagePath(config.backImageKind, getCardBackSetIndex());
  }
  const stack = buildCardStack(count, config.pileClass, imagePath);
  stack.dataset.pile = pileKey;
  zone.appendChild(stack);
  return zone;
}

// 駒は、ユドナリウム(TK11235/udonarium)のterrain（地形）コンポーネントの技法を移植して構築する。
// 「床」を高さ分持ち上げ、4枚の壁を角ごとのtransform-originで側面に貼り付ける、真のpreserve-3d立方体。
// 各面の見え方（どれだけ側面が見えるか）はブラウザの3D計算に任せるため、
// 駒の位置によるJS側の手動調整（leanFactor等）は不要になった。
// 駒の見た目（画像素材/駒スキン、assets/pieces/にコピー）。柄付きの正方形テクスチャを
// 5面（上面+4つの壁）すべてに敷く。各壁は既存のfilter/brightnessで陰影がつくので、
// 単色時と同じ見た目のロジックがそのまま画像にも効く。
function buildCubePiece(color, seat) {
  const piece = document.createElement("div");
  piece.className = "piece";
  const skinUrl = `url("${getSkinImagePath(color, seat)}")`;

  const top = document.createElement("div");
  top.className = "piece-face piece-top";
  top.style.backgroundImage = skinUrl;
  piece.appendChild(top);

  for (const wallClass of ["piece-wall-back", "piece-wall-front", "piece-wall-left", "piece-wall-right"]) {
    const wall = document.createElement("div");
    wall.className = `piece-face ${wallClass}`;
    wall.style.backgroundImage = skinUrl;
    piece.appendChild(wall);
  }

  // 見た目（立方体）とは別に、ホバー/掴む判定のためだけの透明な当たり判定エリアを重ねる。
  // --piece-hitbox-scale（管理者モードで調整可）でサイズだけ独立に拡大縮小できるようにし、
  // 立体の見た目を変えずに「掴みやすさ」を微調整できるようにした。.pieceの子要素なので
  // findDraggableAt/findHoverTargetの.closest(".piece")はそのままここでも正しく機能する。
  const hitbox = document.createElement("div");
  hitbox.className = "piece-hitbox";
  piece.appendChild(hitbox);

  return piece;
}

function findLocationElement(table, location) {
  if (location.zone === "cell") {
    return table.querySelector(`.cell[data-row="${location.row}"][data-col="${location.col}"]`);
  }
  if (location.zone === "lock") {
    return table.querySelector(`.lock-slot[data-side="${location.side}"][data-index="${location.index}"]`);
  }
  return null;
}

// 盤面マスの上に直接置かれたカードを表す簡易な見た目（手札の外に出たカードは扇の仕組みが
// 使えないため、セル/ロックスロットにフィットするだけの平たいカードにする）。
// 表向きなら実際のカード画像を、裏向きなら裏面の画像を敷く。ダブルクリックで表裏を切り替えられる
// （initFlipHandlers参照）。
function buildFlatCard(token) {
  const card = document.createElement("div");
  if (token.faceUp) {
    card.className = "board-card";
    card.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
  } else {
    card.className = "board-card is-facedown";
    card.style.backgroundImage = `url("${getCardBackImagePath(token.cardId)}")`;
  }
  // ロックしていても手札効果が使えるカード（ファーストカード・エターナルカード）は、
  // ロックエリア内にある間だけ定期的に目立たせる（普段は「原則ロックしたカードの手札効果は
  // 使えない」ため、この2種類だけが特別だと分かりやすくするため）。演出は管理者モードで
  // 「回る球」（デフォルト）と「斜めに光る帯」を切り替えられる。球の色はそのカード自身の色
  // （cards-data.jsのcolor）に合わせる。以前はロックスロットの色（token.location.index）を
  // 使っていたが、他プレイヤーの効果でスロットとカードの色がズレて置かれる状況もあり得るため、
  // カード自身の色を優先するよう修正した。
  if (token.location.zone === "lock" && token.cardId && (token.cardId.startsWith("first-") || token.cardId.startsWith("eternal-"))) {
    const effect = getUsableLockedEffect();
    card.classList.add("is-usable-while-locked", `effect-${effect}`);
    const cardColor = getCardDefinition(token.cardId).color;
    card.style.setProperty("--usable-locked-color", `var(--color-${cardColor})`);
  }
  return card;
}

// 盤面マス／ロックスロットの上にある駒・カードを両方描画する（手札の中のカードは
// buildPlayerZoneが別途担当する）。
// 同じマス/ロックスロットに重なっているカード(kind:"card"のみ、駒は数えない)をグループ化する。
// 戻り値はlocationごとのトークン配列（state.tokens内の並び順＝下から上への重なり順）。
function getCardStackGroups() {
  const groups = new Map();
  for (const token of getState().tokens) {
    if (token.kind !== "card") continue;
    if (token.location.zone !== "cell" && token.location.zone !== "lock") continue;
    const key =
      token.location.zone === "cell"
        ? `cell-${token.location.row}-${token.location.col}`
        : `lock-${token.location.side}-${token.location.index}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(token);
  }
  return groups;
}

// 指定locationに重なっているカードのうち、一番上（getCardStackGroupsの並び順で最後＝
// 一番最後に動かされたもの）のトークンを返す。無ければnull。
function findTopCardAt(location) {
  if (location.zone !== "cell" && location.zone !== "lock") return null;
  const key =
    location.zone === "cell" ? `cell-${location.row}-${location.col}` : `lock-${location.side}-${location.index}`;
  const group = getCardStackGroups().get(key);
  return group && group.length > 0 ? group[group.length - 1] : null;
}

// 指定locationに駒が1つでもいるか（複数枚重なっていてもtrueを返すだけで十分な用途向け）。
function hasPieceAt(location) {
  if (location.zone !== "cell" && location.zone !== "lock") return false;
  return getState().tokens.some((t) => {
    if (t.kind !== "piece" || t.location.zone !== location.zone) return false;
    return location.zone === "cell"
      ? t.location.row === location.row && t.location.col === location.col
      : t.location.side === location.side && t.location.index === location.index;
  });
}

// 到達モーダルの「このカードを手札に加える」ボタン用: そのマス/ロックスロットにいる駒の
// 持ち主（座席）を返す（複数枚重なることは無い想定、最初に見つかったものを返す）。
function getPieceOwnerAt(location) {
  if (location.zone !== "cell" && location.zone !== "lock") return null;
  const piece = getState().tokens.find((t) => {
    if (t.kind !== "piece" || t.location.zone !== location.zone) return false;
    return location.zone === "cell"
      ? t.location.row === location.row && t.location.col === location.col
      : t.location.side === location.side && t.location.index === location.index;
  });
  return piece ? piece.player : null;
}

// 山から直接手札へドローした直後、新しく加わったトークンidを特定する。オンライン中の
// drawFromPile()応答にはトークンidが含まれない（revealedCardId=カードの中身のみ）ため、
// ドロー前に取得しておいた手札トークンidの集合と突き合わせて差分から見つける
// （remote-move-animator.jsのmarkSelfHandled対象を決めるために使う）。
function findNewHandTokenIds(player, beforeIds) {
  return getState()
    .tokens.filter((t) => t.location.zone === "hand" && t.location.player === player && !beforeIds.has(t.id))
    .map((t) => t.id);
}

// 演出中（柱状バースト・ロックスタンプ）は、そのマス/ロックスロット自体のz-indexを
// 一時的に引き上げる。柱の高さがマスの3倍以上あるなど演出が隣のマス/ロックスロットへ
// 視覚的にはみ出すため、DOM順で後にある隣接スロット（通常はそちらが手前に描画される）
// の下に演出が隠れてしまうことがあった（プレイヤーDのロックエリアは並び順を正すため
// 祖先ごと180度回転しており、DOM順と画面上の上下関係が逆転しているため特に顕著だった）。
// バースト→ロックスタンプと同じマスで演出が連続することがあるため、参照カウント方式で
// 「最後の演出が終わるまでz-indexを元に戻さない」ようにしている。
function bumpEffectZIndex(hostEl, ttlMs) {
  if (hostEl.__effectZCount === undefined) hostEl.__effectZCount = 0;
  if (hostEl.__effectZCount === 0) {
    hostEl.__effectPrevZIndex = hostEl.style.zIndex;
    hostEl.style.zIndex = "50";
  }
  hostEl.__effectZCount += 1;
  setTimeout(() => {
    hostEl.__effectZCount -= 1;
    if (hostEl.__effectZCount <= 0) {
      hostEl.__effectZCount = 0;
      hostEl.style.zIndex = hostEl.__effectPrevZIndex || "";
    }
  }, ttlMs);
}

// プレイヤーD・Cのロックエリア(.lock-right/.lock-top)は7色スロットの並び順を正すため
// 祖先自体に180度回転を掛けている（style.css参照）。柱状バースト・ロックスタンプは
// どの辺でも常に画面の「上方向」に伸びる向きで作られているため、そのままだとD・C側だけ
// 上下逆さまに表示されてしまう。これらの子孫であれば、演出用の使い捨て要素をもう一枚の
// position:absolute; inset:0な入れ子（.effect-side-flip、180度回転）で包み、
// 祖先の回転を打ち消す。中身の座標系（center基準の配置・アニメーション）は
// 180度回転しても中心位置は変わらないため、この入れ子を挟んでも見た目のズレは生じない。
function appendEffectHost(hostEl, effectEl, ttlMs) {
  bumpEffectZIndex(hostEl, ttlMs);
  if (hostEl.closest(".lock-right") || hostEl.closest(".lock-top")) {
    const flip = document.createElement("div");
    flip.className = "effect-side-flip";
    flip.appendChild(effectEl);
    hostEl.appendChild(flip);
    setTimeout(() => flip.remove(), ttlMs);
  } else {
    hostEl.appendChild(effectEl);
    setTimeout(() => effectEl.remove(), ttlMs);
  }
}

// そのマス/ロックスロット自体が指定色で発光する柱状のオーラ演出（枠の縁取り
// .arrival-effect-frame＋太さの違う柱3本.arrival-effect-flame系＋根本の光の輪
// .arrival-effect-ring の3層構成）。到達演出・ロック演出の両方から流用する共通部分。
// CSSアニメーションが終わる頃（一番長いものでも1.3s）に合わせてまとめてDOMから消す。
// 虹（なないろの欠片、cards-data.jsのcolor: "rainbow"）は単色のCSS変数では表現できない
// （border-color/box-shadow/color-mix()はグラデーションを受け付けない）ため、
// .is-rainbowクラスを付けてCSS側で柱・光の輪を虹色に個別上書きする。
function spawnArrivalBurst(hostEl, color) {
  if (isArrivalEffectDisabled()) return null;
  const burst = document.createElement("div");
  burst.className = color === "rainbow" ? "arrival-effect-burst is-rainbow" : "arrival-effect-burst";
  if (color !== "rainbow") {
    burst.style.setProperty("--arrival-effect-color", `var(--color-${color})`);
  }

  const frame = document.createElement("div");
  frame.className = "arrival-effect-frame";
  burst.appendChild(frame);

  burst.appendChild(Object.assign(document.createElement("div"), { className: "arrival-effect-flame" }));
  burst.appendChild(Object.assign(document.createElement("div"), { className: "arrival-effect-flame arrival-effect-flame-mid" }));
  burst.appendChild(Object.assign(document.createElement("div"), { className: "arrival-effect-flame arrival-effect-flame-core" }));

  const ring = document.createElement("div");
  ring.className = "arrival-effect-ring";
  burst.appendChild(ring);

  appendEffectHost(hostEl, burst, 1400);
  return burst;
}

// 到達したカードをその場からそのプレイヤーの手札へ加える（到達モーダルの
// 「このカードを手札に加える」ボタン）。ボタン自体は到達した本人の画面にしか出さないが、
// クリック時点で改めてstateを見直し、既に無くなっている（誰かが動かした等）場合は
// 何もしない。
async function addArrivedCardToHand(location, player) {
  const token = findTopCardAt(location);
  if (!token) return;
  if (isOnlineMode()) {
    try {
      await moveToken(token.id, { zone: "hand", player });
      markSelfHandled([token.id]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("moveToken failed", err);
      render();
      return;
    }
  } else {
    moveToken(token.id, { zone: "hand", player });
  }
  announceHandPickups(player, [{ cardId: token.cardId, wasPublic: token.faceUp }]);
  render();
  // ハマりどころ（ユーザー報告「表向きが2枚重なっていて上のカードを手札に加えても、
  // 下の表向きカードの到達コンボが発動しない」）: ドラッグ&ドロップでの移動は全て
  // maybeTriggerCardArrivalForExposedCard()を呼んでいたが、到達モーダルの「このカードを
  // 手札に加える」ボタン経由の移動だけこの呼び出しが抜けていた。
  maybeTriggerCardArrivalForExposedCard(location);
}

// 到達演出一式（右上モーダル＋そのマス自体が発光する柱状のオーラ＋効果音）をまとめて行う。
// 柱の色はカード自身の色に合わせる（--color-*をそのまま使う）。到達した駒の持ち主にだけ
// 「このカードを手札に加える」ボタンを出す（ユーザー要望）。
function triggerCardArrival(cardId, location) {
  const player = getPieceOwnerAt(location);
  const showAddToHand = !!player && player === getSelfSeat();
  showCardArrivalModal(cardId, {
    showAddToHand,
    onAddToHand: () => addArrivedCardToHand(location, player),
  });
  playSound("arrivalEffect");
  const table = document.getElementById("game-table");
  const hostEl = findLocationElement(table, location);
  if (!hostEl) return;
  const color = getCardDefinition(cardId).color;
  spawnArrivalBurst(hostEl, color);
}

// カードの中心を起点に、ロック画像がカードよりも大きく拡大しながらフェードアウトする
// ワンショット演出（到達演出の柱と同じ「使い捨てDOM要素」パターン）。ロックされている間
// ずっと表示され続ける仕様ではなく、ロックした瞬間だけの一発演出（ユーザー指定）。
const LOCK_STAMP_DURATION_MS = 900;
function spawnLockStamp(hostEl) {
  if (isArrivalEffectDisabled()) return null;
  const stamp = document.createElement("div");
  stamp.className = "lock-stamp-burst";
  appendEffectHost(hostEl, stamp, LOCK_STAMP_DURATION_MS);
  return stamp;
}

// カードが新しくロックされた瞬間の演出。到達演出と同じ柱状のオーラ＋到達効果音をそのマスに
// 流用し、そのオーラがほぼ収まってから（重ねず順番に）ロック画像がカードより大きく拡大
// しながらフェードアウトする演出とロック効果音を続けて行う（ユーザー指定の順序）。
// 白黒（無色）カードは呼び出し元(maybeAnnounceLock)側で既に除外済み。
// 一連の演出が完全に終わるタイミングで解決するPromiseを返す（呼び出し元は基本的に
// fire-and-forestで無視して構わないが、setup-animation.jsのようにこの後すぐrender()で
// DOM全体を作り直してしまう場面では、演出中の要素が消えてしまわないよう完了を待つ必要がある。
// ファーストカードのロックで最初のプレイヤー以外にロック画像が表示されないバグの真因が
// これだった：setTimeoutで捕まえていたhostElが、演出完了前に後続のrender()でDOMごと
// 作り直されて画面から切り離され、そこに追加されても見えなくなっていた）。
function triggerLockEffect(cardId, location) {
  const table = document.getElementById("game-table");
  const hostEl = findLocationElement(table, location);
  if (!hostEl) return Promise.resolve();
  const color = getCardDefinition(cardId).color;
  playSound("arrivalEffect");
  spawnArrivalBurst(hostEl, color);
  return new Promise((resolve) => {
    setTimeout(() => {
      playSound("lock");
      spawnLockStamp(hostEl);
      setTimeout(resolve, LOCK_STAMP_DURATION_MS);
    }, 1300);
  });
}

// 駒がカードの上に乗った瞬間の演出。表向きのカードならそのまま到達モーダルを表示する。
// 裏向きの場合は自動でオープンせず、駒の近くに「オープンする/しない」の選択肢を出し、
// 選んでもらってから（オープンする場合のみ）到達モーダルを表示する。
// onResolved: 到達判定が完全に決着した（何もしなかった/表向きで即座に処理した/裏向きで
// ユーザーがオープンする・しないを選び終えた）タイミングで呼ばれる省略可能なコールバック。
// ユーザー報告「接触の結果モーダルが、オープンする/しないの選択より先に（同時に）出て、
// 不透明な結果モーダルの下に選択肢が隠れて見えなくなる」への対応として、respondToContact
// （main.js）がこれを使い、結果モーダルの表示を「オープンする/しないの決着後」まで
// 遅らせる。
function maybeTriggerCardArrival(dropTarget, pieceTokenId, onResolved) {
  if (!dropTarget) {
    onResolved?.();
    return;
  }
  const card = findTopCardAt(dropTarget);
  if (!card) {
    onResolved?.();
    return;
  }
  if (!card.faceUp) {
    promptCardOpen(pieceTokenId, card, onResolved);
    return;
  }
  triggerCardArrival(card.cardId, card.location);
  onResolved?.();
}

// maybeTriggerCardArrivalの「表向きの場合のみ」の部分だけを切り出したもの。
// remote-move-animator.jsが、他プレイヤーの駒の到達を再現する時に使う——裏向きカードの
// 場合の「オープンする/しない」対話的選択肢(promptCardOpen)は、自分が動かしてもいない駒に
// ついて出すと混乱を招くため、あえて出さない（安全側に倒したスコープ決定）。
function triggerCardArrivalIfFaceUp(location) {
  const card = findTopCardAt(location);
  if (card && card.faceUp) triggerCardArrival(card.cardId, card.location);
}

// 逆方向（駒が既にいるマス/ロックスロットへ、表向きのカードを新しく置いた/動かした時）にも
// 到達演出を出す。今までは駒側が動いた時しか到達判定していなかったが、カード側が動いて
// 駒の下に潜り込むケースでも同じように到達したことにしてほしい、というユーザー要望への対応。
// 裏向きのカードの場合は対象外（駒が裏向きカードに乗った時の「オープンする/しない」選択の
// ような自動オープンの仕組みはここでは設けない。ユーザーの要望が表向きの場合のみのため）。
function maybeTriggerCardArrivalForCard(dropTarget, cardId, faceUp) {
  if (!dropTarget || !faceUp) return;
  if (!hasPieceAt(dropTarget)) return;
  triggerCardArrival(cardId, dropTarget);
}

// もう一つの逆方向: 駒が既に乗っているマス/ロックスロットで、複数枚重なったカードの
// 一番上（＝駒が直接触れているカード）が山・手札・別のマス/ロックスロットへ動いてどいた
// 結果、下に隠れていた別のカードが新しく一番上になった場合も「到達」として扱う
// （ユーザー要望）。新しく一番上になったカードが表向きの場合のみ（裏向きの場合の
// 自動オープン/確認プロンプトはこの経路では設けない。maybeTriggerCardArrivalと違い
// 「駒自身は動いていない」ため、駒側のドラッグ操作に紐づく`promptCardOpen`の仕組みに
// 素直には乗らないため）。呼び出し元はカードの移動が確定しrender()済みの後に呼ぶこと
// （findTopCardAt/hasPieceAtは最新のstateを参照するため、render()自体は必須ではないが、
// 他の到達演出呼び出しと同じタイミングに揃えてある）。
function maybeTriggerCardArrivalForExposedCard(location) {
  if (!location || (location.zone !== "cell" && location.zone !== "lock")) return;
  if (!hasPieceAt(location)) return;
  triggerCardArrivalIfFaceUp(location);
}

// 「オープンする/しない」の選択アイコン。同時に1つだけ表示する（新しく駒が別のカードに
// 乗ったら、前のプロンプトは消えて新しい方だけになる）。
let openPromptEl = null;

function closeOpenPrompt() {
  if (openPromptEl) {
    openPromptEl.remove();
    openPromptEl = null;
  }
}

function promptCardOpen(pieceTokenId, card, onResolved) {
  closeOpenPrompt();
  const pieceEl = document.querySelector(`.piece[data-token-id="${pieceTokenId}"]`);
  if (!pieceEl) {
    onResolved?.();
    return;
  }
  // getBoundingClientRect()は実画面座標だが、promptはposition:fixedでステージ内に
  // 描画されるため、ステージのローカル座標に変換してから使う（ユーザー報告「オープン
  // する/しないボタンがだいぶ遠くに表示される」の原因。ステージ導入時の見落とし）。
  const rect = toStageLocalRect(pieceEl.getBoundingClientRect());

  const prompt = document.createElement("div");
  prompt.className = "card-open-prompt";
  prompt.style.left = `${rect.left + (rect.right - rect.left) / 2}px`;
  prompt.style.top = `${rect.top}px`;

  const yesBtn = document.createElement("button");
  yesBtn.className = "card-open-prompt-yes";
  yesBtn.textContent = "👁 オープンする";
  yesBtn.addEventListener("click", async () => {
    if (isOnlineMode()) {
      // オンライン中はflipToken()がローカルstateを書き換えず、サーバーへの
      // リクエストを送るだけ（Promiseを返す）。awaitせずすぐrender()すると
      // 反転前の古い状態のまま描画・演出判定してしまうため、応答を待ってから
      // fetchAndHydrate()で明示的に再同期してから続ける。
      try {
        await flipToken(card.id);
        markSelfHandled([card.id]);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("flipToken failed", err);
        render();
        onResolved?.();
        return;
      }
    } else {
      flipToken(card.id);
    }
    playSound("cardFlip");
    closeOpenPrompt();
    render();
    // オンライン中、オープン前のcardは裏向き（RLSマスクによりcardIdがnull）だった時点の
    // クロージャ値のままなので、そのまま到達演出に使うとgetCardDefinition(null)が
    // undefinedを返しshowCardArrivalModal内でクラッシュし、演出全体（サウンド・光の柱含む）
    // が失敗する（オープンした本人の画面だけ到達演出が出ないバグの原因だった）。
    // fetchAndHydrate()後のフレッシュな状態から改めて取得する。
    const freshCard = getState().tokens.find((t) => t.id === card.id);
    if (freshCard) triggerCardArrival(freshCard.cardId, freshCard.location);
    onResolved?.();
  });

  const noBtn = document.createElement("button");
  noBtn.className = "card-open-prompt-no";
  noBtn.textContent = "🚫 オープンしない";
  noBtn.addEventListener("click", () => {
    closeOpenPrompt();
    onResolved?.();
  });

  prompt.appendChild(yesBtn);
  prompt.appendChild(noBtn);
  document.body.appendChild(prompt);
  openPromptEl = prompt;
}

// --- 接触（ムーブフェイズの選択肢、ユーザー要望「接触処理の自動化」） ------------------
// 自分の駒を隣の相手の駒がいるマスへドラッグ＆ドロップすると（クリックだけでの選択は
// 既存のドラッグ処理に奪われて反応しないというユーザー報告があったため、ドラッグそのものを
// トリガーにした）、駒は元のマスへ戻り（＝実際には一切移動させない）、代わりに「接触する」
// ボタンが浮かぶ（promptCardOpenと同じ「オープンする/しない」浮遊プロンプトの見た目を
// 流用）。押すと「本当に接触しますか？」の確認モーダルが挟まり、OKでrequestContact()を
// 呼んで接触される側（defender）の承認待ちになる（ゲート侵攻ボーナスと同じ「確認→
// 自動処理」ではなく、最後のロック承認REQUEST_FINAL_LOCK/RESPOND_FINAL_LOCKと同じ
// 「要求→承認/拒否」の2段階——ユーザー要望「接触を無効にする効果のカードが存在するので、
// 接触されるプレイヤーには承認/拒否モーダルを出す」への対応）。承認されて初めて、相手の
// 手札から無作為に1枚もらい、相手はゲートへ強制移動する。そのゲートに表向きのカードが
// あった場合の到達効果は、通常の移動と全く同じ経路（オンライン中はremote-move-animator.js
// が hydrateState後の差分検知で自動的に検知する）で、相手自身の画面に通常通りの到達
// モーダルが出る（respondToContact参照）。
let contactPromptEl = null;

function closeContactPrompt() {
  if (contactPromptEl) {
    contactPromptEl.remove();
    contactPromptEl = null;
  }
}

function isAdjacentCell(a, b) {
  const dr = Math.abs(a.row - b.row);
  const dc = Math.abs(a.col - b.col);
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1);
}

// ユーザー要望「接触の時、奪った側は何を奪ったか、奪われた側は何を奪われたかを画面中央に
// モーダルで出す」への対応。role:"attacker"/"defender"はオンライン中に各自の画面へ、
// role:"both"はローカルモード（1画面で両者を見ているため）に使う。cardIdがnullの場合は
// 「相手の手札が無く何も奪えなかった/奪われなかった」の文面にする。
function openContactResultModal({ role, attacker, defender, cardId }) {
  const modal = document.createElement("div");
  modal.id = "contact-result-modal";
  const close = () => {
    modal.remove();
  };
  // ハマりどころ: このモーダルは承認直後、「オープンする/しないの選択」(promptCardOpen)や
  // 到達モーダル(card-arrival-modal)とほぼ同時に出ることがある。他の確認モーダルと同じ
  // 全画面の暗いbackdrop（クリックで閉じる）を付けると、それらの後ろに隠れた対話的
  // ボタンへのクリックを丸ごと奪ってしまい、押せなくなるバグになっていた。そのため
  // このモーダルだけbackdrop無し（結果を知らせるだけの通知的な位置づけ）にしてある。

  const title = document.createElement("div");
  title.className = "contact-result-title";
  title.textContent = "🤝 接触の結果";
  modal.appendChild(title);

  const cardDef = cardId ? getCardDefinition(cardId) : null;
  const body = document.createElement("div");
  body.className = "contact-result-body";
  const lines = [];
  if (role === "attacker" || role === "both") {
    lines.push(
      cardDef
        ? `${getPlayerName(defender)}から「${cardDef.name}」を奪いました！`
        : `${getPlayerName(defender)}の手札が無く、何も奪えませんでした。`
    );
  }
  if (role === "defender" || role === "both") {
    lines.push(
      cardDef
        ? `${getPlayerName(attacker)}に「${cardDef.name}」を奪われました…`
        : `${getPlayerName(attacker)}に接触されましたが、手札が無く何も奪われませんでした。`
    );
  }
  body.textContent = lines.join("\n");
  modal.appendChild(body);

  if (cardDef) {
    const img = document.createElement("img");
    img.className = "contact-result-card-image";
    img.src = getCardImagePath(cardId);
    img.alt = cardDef.name;
    modal.appendChild(img);
  }

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "contact-result-ok";
  okBtn.textContent = "閉じる";
  okBtn.addEventListener("click", close);
  modal.appendChild(okBtn);

  modal.appendChild(createModalCloseX(close));
  document.body.appendChild(modal);
}

// オンライン中、接触を申し込んだ本人（attacker）の画面は、defender自身がrespondContact()を
// 呼ぶまで結果を知る手段が無い（サーバーへの要求を送るだけで応答を待たない設計のため）。
// 申し込んだ瞬間の自分の手札IDを覚えておき、承認/拒否されてpendingContactが消えた
// 瞬間（render()から呼ばれるcheckContactAttackerResolution参照）に、手札に増えている
// 新しいカードが無いか比較する形で検知する（defender自身の手札は常に本人にだけ実際の
// cardIdが見えるのと同じく、attacker自身の手札も本人には常に実際のcardIdが見えるため、
// この比較だけで十分——サーバーから別途通知をもらう必要が無い）。
let contactAttackerSnapshot = null;

function checkContactAttackerResolution() {
  if (!contactAttackerSnapshot) return;
  if (getState().pendingContact) return; // まだ承認/拒否されていない
  const { attacker, defender, handIdsBefore } = contactAttackerSnapshot;
  contactAttackerSnapshot = null;
  const newCard = getState().tokens.find(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === attacker && !handIdsBefore.has(t.id)
  );
  // 拒否された場合はnewCardが無いまま＝何も表示しない（承認されたが奪えるカードが
  // 無かった場合と見分けがつかないが、ユーザー要望は「奪った/奪われた」結果の通知のため、
  // 何も起きていない可能性がある時に無言なのは実害が無い）。
  if (newCard) {
    openContactResultModal({ role: "attacker", attacker, defender, cardId: newCard.cardId });
  }
}

function openContactConfirmModal(attacker, defender) {
  const modal = document.createElement("div");
  modal.id = "contact-confirm-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10600 });

  const title = document.createElement("div");
  title.className = "contact-confirm-title";
  title.textContent = "本当に接触しますか？";

  const body = document.createElement("div");
  body.className = "contact-confirm-body";
  body.textContent = `${getPlayerName(attacker)}が${getPlayerName(
    defender
  )}に接触を申し込みます。承認されると、相手の手札から無作為に1枚もらい、相手は自分のゲートへ強制移動します。`;

  const btnRow = document.createElement("div");
  btnRow.className = "contact-confirm-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "contact-confirm-cancel";
  cancelBtn.type = "button";
  cancelBtn.textContent = "キャンセル";
  cancelBtn.addEventListener("click", close);

  const okBtn = document.createElement("button");
  okBtn.className = "contact-confirm-ok";
  okBtn.type = "button";
  okBtn.textContent = "🤝 接触を申し込む";
  okBtn.addEventListener("click", async () => {
    okBtn.disabled = true;
    cancelBtn.disabled = true;
    try {
      if (isOnlineMode()) {
        // checkContactAttackerResolution()参照: 承認/拒否の結果を自分の画面で知るために、
        // 申し込んだ瞬間の自分の手札IDを覚えておく。
        contactAttackerSnapshot = {
          attacker,
          defender,
          handIdsBefore: new Set(
            getState()
              .tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === attacker)
              .map((t) => t.id)
          ),
        };
        await requestContact(attacker, defender);
        await fetchAndHydrate(getCurrentGameId());
      } else {
        requestContact(attacker, defender);
      }
      render();
    } catch (err) {
      console.error("requestContact failed", err);
      contactAttackerSnapshot = null;
    } finally {
      close();
    }
  });

  btnRow.appendChild(cancelBtn);
  btnRow.appendChild(okBtn);

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(btnRow);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

function showContactPrompt(attacker, defender, anchorPieceTokenId) {
  closeContactPrompt();
  const pieceEl = document.querySelector(`.piece[data-token-id="${anchorPieceTokenId}"]`);
  if (!pieceEl) return;
  const rect = toStageLocalRect(pieceEl.getBoundingClientRect());

  const prompt = document.createElement("div");
  prompt.className = "card-open-prompt";
  prompt.style.left = `${rect.left + (rect.right - rect.left) / 2}px`;
  prompt.style.top = `${rect.top}px`;

  const contactBtn = document.createElement("button");
  contactBtn.className = "card-open-prompt-yes";
  contactBtn.textContent = "🤝 接触する";
  contactBtn.addEventListener("click", () => {
    closeContactPrompt();
    openContactConfirmModal(attacker, defender);
  });

  prompt.appendChild(contactBtn);
  document.body.appendChild(prompt);
  contactPromptEl = prompt;
}

document.addEventListener("pointerdown", (e) => {
  if (contactPromptEl && !contactPromptEl.contains(e.target)) closeContactPrompt();
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ユーザー要望「接触するときアニメーションを設定できますか」への対応（縮小版として合意
// 済み——理想の「カメラが横に回り込んで駒2つを真横から捉える」演出は、今の3D盤面が
// 見下ろし視点をtilt/zoom/panで微調整するだけの設計で任意の2駒を真横から捉えるカメラ
// ワークを想定していないため、大掛かりな作り直しが必要でリスクが高いと判断し見送った。
// 代わりにカメラは動かさず、既存の「使い捨てDOM演出」の部品——到達演出の柱状オーラ
// (spawnArrivalBurst)・remote-move-animator.jsと同じ飛翔ゴースト(flyGhost)——を
// 組み合わせている）。
//
// ユーザー報告「タックル演出が早すぎて何が起きたかよくわからない」への対応で、以下の
// 5段階＋各段階の秒数を管理者モードで調整できるようにした（--contact-anim-*）:
// ①承認から演出開始までの間 →②気合を入れる（到達演出のオーラを自分の駒のマスで流用、
// 演出時間は到達演出自体と揃えているため設定項目には含めない）→③助走（後ろに引く）→
// ④タックル（前へ突進、衝突エフェクト）→⑤ゲートまで戻る（駒の飛翔、playContactFlight）。
// ①〜④は状態（state）を一切変えない見た目だけのワンショット演出のため、respondContact()
// で実際に駒を動かす「前」に行う（このタイミングの都合はrespondToContact参照）。
function getContactAnimSeconds(varName, fallback) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  const seconds = parseFloat(raw);
  return Number.isNaN(seconds) ? fallback : seconds;
}

async function playContactLunge({ attackerEl, defenderFromRect, attackerRect, defenderFromLocation, attackerFromLocation, attackerColor }) {
  const table = document.getElementById("game-table");
  const dx = defenderFromRect.left + defenderFromRect.width / 2 - (attackerRect.left + attackerRect.width / 2);
  const dy = defenderFromRect.top + defenderFromRect.height / 2 - (attackerRect.top + attackerRect.height / 2);
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const LUNGE_PX = 26;
  const RUNUP_PX = 8;

  // ①承認されてから演出が始まるまでの「間」。
  await wait(getContactAnimSeconds("--contact-anim-pre-delay", 2) * 1000);

  // ②気合を入れる。到達演出と同じ柱状オーラを、自分（attacker）の駒がいるマスで
  // 発光させる。この演出時間自体は到達演出そのものと揃えているため、個別の設定項目には
  // していない（ユーザー指定「到達EFFECTアニメ流用」）。
  playSound("arrivalEffect");
  const attackerHostEl = table ? findLocationElement(table, attackerFromLocation) : null;
  if (attackerHostEl) spawnArrivalBurst(attackerHostEl, attackerColor);
  await wait(1400);

  // ③助走（後ろに引く）。駒本体はこの後respondContact()→render()でDOMごと作り直される
  // ため、ここで付けたtransform/transitionの後片付けは不要。
  const runupMs = getContactAnimSeconds("--contact-anim-runup-duration", 3) * 1000;
  attackerEl.style.transition = `transform ${runupMs}ms ease-in`;
  attackerEl.style.transform = `translate(${-ux * RUNUP_PX}px, ${-uy * RUNUP_PX}px)`;
  await wait(runupMs);

  // ④タックル（前へ突進、衝突エフェクト）。
  const tackleMs = getContactAnimSeconds("--contact-anim-tackle-duration", 1) * 1000;
  attackerEl.style.transition = `transform ${tackleMs}ms cubic-bezier(0.3, 0, 0.7, 1)`;
  attackerEl.style.transform = `translate(${ux * LUNGE_PX}px, ${uy * LUNGE_PX}px)`;
  await wait(tackleMs);
  playSound("arrivalEffect");
  const hostEl = table ? findLocationElement(table, defenderFromLocation) : null;
  if (hostEl) spawnArrivalBurst(hostEl, attackerColor);
  await wait(300);

  // 突進した駒を元の位置へ戻す。呼び出し元がこの直後にrespondContact()→render()で
  // DOMを作り直す前に、戻りきるまで待つ（途中で作り直すと戻りアニメが切れて見える）。
  attackerEl.style.transition = "transform 220ms ease-out";
  attackerEl.style.transform = "translate(0px, 0px)";
  await wait(220);
}

// 駒が実際に移動した「後」に呼ぶ。相手の駒がゲートへ飛んでいく見た目を作る。render()で
// 新しい位置に駒を作る「前」にsetSetupPendingTokenIdsへ登録しておくことで、一瞬フルに
// 見えてから隠れる「フラッシュ」を防ぐ（セットアップ配布演出と同じ考え方）。
async function playContactFlight(defenderPieceId, defenderFromRect) {
  setSetupPendingTokenIds(new Set([defenderPieceId]));
  render();
  const table = document.getElementById("game-table");
  const newDefenderEl = table?.querySelector(`.piece[data-token-id="${defenderPieceId}"]`);
  const defenderToken = getState().tokens.find((t) => t.id === defenderPieceId);
  if (newDefenderEl && defenderToken) {
    const toRect = newDefenderEl.getBoundingClientRect();
    const { done } = flyGhost(
      defenderFromRect,
      toRect,
      getSkinImagePath(defenderToken.color, defenderToken.player),
      "setup-fly-card",
      getContactAnimSeconds("--contact-anim-flight-duration", 2) * 1000
    );
    await done;
  }
  setSetupPendingTokenIds(new Set());
}

// 接触されたプレイヤー（defender）が承認/拒否モーダル（contact-approval.js）で応答した
// 時に呼ばれる。承認された場合だけ、respondToFinalLockと同じ理由でローカルモードは
// 明示的に到達判定を呼ぶ必要がある（remote-move-animator.jsはisOnlineMode()で早期return
// する設計のため）。
async function respondToContact(approve) {
  const pendingBefore = getState().pendingContact;
  if (!pendingBefore) return;
  const { attacker, defender } = pendingBefore;
  // 承認された場合の到達判定・奪われたカードの特定に使うため、駒のID・手札の中身は
  // 実際の効果が適用される前（＝ここではまだ何も変わっていない間）に確保しておく
  // （駒自体は消えずlocationだけ変わるのでIDは不変）。defender自身の手札は常に本人に
  // 実際のcardIdが見えているため、ここで捕まえておけば「何を奪われたか」をサーバーに
  // 問い合わせ直さずそのまま特定できる。
  const defenderPieceId = getState().tokens.find((t) => t.kind === "piece" && t.player === defender)?.id;
  const attackerPieceId = getState().tokens.find((t) => t.kind === "piece" && t.player === attacker)?.id;
  const defenderHandBefore = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender
  );
  function findStolenCard() {
    const afterIds = new Set(
      getState()
        .tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender)
        .map((t) => t.id)
    );
    return defenderHandBefore.find((t) => !afterIds.has(t.id)) ?? null;
  }

  // タックル演出のため、状態を変える(respondContact)前に「動く前」のDOM情報を確保して
  // おく——stateが変わった瞬間、下の汎用render()リスナー(subscribe)が同期的にDOMを
  // 作り直してしまうため、後から取り直すことができない。「移動アニメーション」設定が
  // 無効、駒のDOM要素が見当たらない等の場合はtackleがnullのままとなり、後段が
  // 従来通りのフォールバック（即座にrender()だけ）になる。
  let tackle = null;
  if (approve && defenderPieceId && attackerPieceId && !isFlightAnimationDisabled()) {
    const table = document.getElementById("game-table");
    const attackerEl = table?.querySelector(`.piece[data-token-id="${attackerPieceId}"]`);
    const defenderEl = table?.querySelector(`.piece[data-token-id="${defenderPieceId}"]`);
    const defenderToken = getState().tokens.find((t) => t.id === defenderPieceId);
    const attackerToken = getState().tokens.find((t) => t.id === attackerPieceId);
    if (table && attackerEl && defenderEl && defenderToken && attackerToken) {
      tackle = {
        attackerEl,
        defenderFromRect: defenderEl.getBoundingClientRect(),
        attackerRect: attackerEl.getBoundingClientRect(),
        defenderFromLocation: defenderToken.location,
        attackerFromLocation: attackerToken.location,
        attackerColor: attackerToken.color,
      };
    }
  }

  if (tackle) {
    // 汎用render()リスナー・remote-move-animator.jsを一時停止し、この後の
    // respondContact()による状態変化で盤面が勝手に作り直されないようにする
    // （suppressGenericRenderForOnlineStartと同じパターン）。
    suppressGenericRenderForContactTackle = true;
    await playContactLunge(tackle);
  }

  if (isOnlineMode()) {
    try {
      await respondContact(approve);
      // ユーザー要望「接触でゲートに飛ばされる際、カードが裏向きならオープンするか
      // しないかのボタンを出す」への対応。承認した本人（defender自身の画面）だけ、
      // 通常の移動と同じ完全な到達判定（maybeTriggerCardArrival、裏向きなら
      // オープンする/しないの選択も出す）を行いたいので、remote-move-animator.jsの
      // 状態差分検知（他プレイヤーの画面向け、triggerCardArrivalIfFaceUp＝表向きのみで
      // 選択は出さない）による二重発火を防ぐため、先にmarkSelfHandledしておく
      // （moveToken等の他のオンライン処理と同じパターン）。
      if (approve && defenderPieceId) markSelfHandled([defenderPieceId]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("respondContact failed", err);
      suppressGenericRenderForContactTackle = false;
      render();
      return;
    }
  } else {
    respondContact(approve);
  }

  if (tackle) {
    await playContactFlight(defenderPieceId, tackle.defenderFromRect);
    suppressGenericRenderForContactTackle = false;
  } else if (approve) {
    playSound("piecePlace");
  }
  render();

  if (approve && defenderPieceId) {
    // 到達プロンプト/モーダルの位置決めに実際のDOM座標(getBoundingClientRect)を使うため、
    // render()で盤面を描き直した後でなければ呼べない。
    const defenderPiece = getState().tokens.find((t) => t.id === defenderPieceId);
    // ユーザー要望「奪われた側は何を奪われたかをモーダルで出す」への対応。オンライン中は
    // defender自身の画面にだけ表示する（attacker側はcheckContactAttackerResolution参照）。
    // ローカルモードは1画面で両者を見ているため、role:"both"で両方の文面を一度に出す。
    // ハマりどころ（ユーザー報告「接触され側でオープンする/しないの選択が出ない（実際には
    // 出ているが、この結果モーダルの不透明な背景に隠れて見えなかった）」）: 到達判定
    // （裏向きなら「オープンする/しない」の選択）と同時にこの結果モーダルを出すと、
    // 結果モーダルの方が手前に重なって選択肢を覆い隠してしまう。到達判定が完全に決着した
    // 後（表向きなら即座に、裏向きならユーザーが選び終えた後）まで表示を遅らせることで
    // 解決する（maybeTriggerCardArrivalのonResolvedコールバック参照）。
    const showResultModal = () => {
      const stolen = findStolenCard();
      openContactResultModal({
        role: isOnlineMode() ? "defender" : "both",
        attacker,
        defender,
        cardId: stolen?.cardId ?? null,
      });
    };
    if (defenderPiece) maybeTriggerCardArrival(defenderPiece.location, defenderPiece.id, showResultModal);
    else showResultModal();
  }
}

function renderBoardTokens(table) {
  for (const token of getState().tokens) {
    if (token.location.zone !== "cell" && token.location.zone !== "lock") continue;
    const host = findLocationElement(table, token.location);
    if (!host) continue;
    const el = token.kind === "piece" ? buildCubePiece(token.color, token.player) : buildFlatCard(token);
    el.dataset.tokenId = token.id;
    // セットアップ配布演出中、まだ登場させたくないトークンは最初からopacity:0にしておく
    // （setup-animation.jsのanimateFirstCardsDealt/animateBoardFilled参照）。
    if (setupPendingTokenIds.has(token.id)) el.classList.add("is-setup-pending");
    // 手番プレイヤーの駒だけを、その駒自身の色でゆっくり柔らかく発光させる
    // （ロックエリア/名前ラベルの手番演出とは別に、盤面上でも手番の駒がすぐ分かるように）。
    // 「自分」に限定していたのは誤りで、B/C/Dのターンでもそれぞれの駒が光る必要がある。
    if (token.kind === "piece" && token.player === getState().turnPlayer) {
      el.classList.add("is-my-turn-glow");
      el.style.setProperty("--piece-turn-glow-color", `var(--color-${token.color})`);
    }
    host.appendChild(el);
    // 駒・カードはセルより大きくはみ出すことがあるため、隣のマス（DOM順で後にあるもの）に
    // 隠されないよう最前面にする
    if (host.classList.contains("cell")) host.style.zIndex = "10";
  }

  // 2枚以上重なっているマス/ロックスロットには、一番上のカードに「+N」バッジを付ける。
  // バッジにカーソルを合わせると、重なっている全カードを一覧で拡大表示できる
  // （updateHover/updatePreviewが.stack-badgeを特別扱いする）。
  for (const tokens of getCardStackGroups().values()) {
    if (tokens.length < 2) continue;
    const topToken = tokens[tokens.length - 1];
    const topEl = table.querySelector(`[data-token-id="${topToken.id}"]`);
    if (!topEl) continue;
    const badge = document.createElement("div");
    badge.className = "stack-badge";
    badge.textContent = `+${tokens.length}`;
    badge.dataset.stackTokens = tokens.map((t) => t.id).join(",");
    topEl.appendChild(badge);
  }
}

function render() {
  // オンライン対戦（第一弾）ではまだサーバー側にポートしていないアクション（セットアップ
  // ウィザード・クイックスタート・手札シャッフル）に繋がるボタンを隠す（style.css参照）。
  // 「オンラインで続ける」を押した直後、まだ部屋を選んでいない間はisOnlineMode()自体は
  // まだfalseのままだが、その段階からローカル専用UIを隠したいため、online-ui.jsの
  // isOnlineIntentActive()（「オンラインで続ける」を一度でも押したか。部屋を選ばずに
  // パネルを閉じても、いったんtrueになったら二度と戻らない一方向のラッチ——
  // ユーザー要望「モーダルを閉じたら今見えている背景を維持してほしい」への対応）
  // もあわせて見る。
  document.body.classList.toggle("is-online-mode", isOnlineMode() || isOnlineIntentActive());
  updateSelfStatusOnlineWidget();
  const table = document.getElementById("game-table");
  table.innerHTML = "";
  // オンライン対戦では「自分」が実際にログインしている座席になる（ローカルモードでは
  // これまで通り常にA、src/online.jsのgetSelfSeat()参照）。stepsは「自分の座席を画面手前
  // (bottom)に持ってくるには盤面を時計回りに何回(90度単位)回転させるか」（0ならA視点の
  // 従来通りの見た目と完全に同じ、board-layout.js参照）。
  const self = getSelfSeat();
  const steps = getRotationSteps(self);
  // arena（プレイマット画像を含む）を最初に追加する＝DOM順で一番背面にする。
  // 後に追加した手札・山札・捨て場・エターナルは、画面上で座標が重なってもプレイマットより
  // 手前に描画される（盤面のマス目の枠線と同じ「高さ」で表示される、という要望に対応）。
  table.appendChild(buildArena(steps));
  // セットアップ手順1で参加座席(activePlayers)が確定した後は、参加していない座席の
  // アバター・名前・手札ゾーンごと表示しない（例: 2人プレイなのに4人分のアバターが
  // 出てしまっていたバグの修正）。まだセットアップ前（activePlayers==[]）の間は、
  // 従来通り4人分をプレビューとして表示しておく。
  const { activePlayers } = getState();
  // ユーザー報告「オンラインの部屋で参加者が自分1人だけなのにB/C/Dにアバターが
  // 表示されている」への対応。ローカルモード（サンドボックス）ではセットアップ前の
  // 4人分プレビュー表示は従来通り便利なため維持するが、オンラインモードでは
  // 「本当にその部屋にいる人」（自分自身、または実際に入室済みの人＝roster/
  // getSyncedIdentityに載っている座席、待機中はrank-ring-orbit.jsではなく
  // online.jsのupdateIdentityRosterが割り当てる仮の座席）だけを表示し、
  // まだ誰も入っていない席は非表示にする。
  const isActive = (player) => {
    if (activePlayers.length > 0) return activePlayers.includes(player);
    // 「オンラインで続ける」を押した直後、まだ部屋を選んでいない間もisOnlineIntentActive()で
    // 拾う（isOnlineMode()の直後の説明コメント参照）。
    if (isOnlineMode() || isOnlineIntentActive()) return player === self || !!getSyncedIdentity(player);
    return true;
  };
  for (const seat of SEAT_ORDER) {
    if (!isActive(seat)) continue;
    const displaySide = rotateSide(SEAT_TO_SIDE[seat], steps);
    table.appendChild(buildPlayerZone(displaySide, seat, self === seat));
  }
  table.appendChild(buildPileZone("deck"));
  table.appendChild(buildPileZone("eternal"));
  table.appendChild(buildPileZone("first"));
  table.appendChild(buildPileZone("discard"));
  renderBoardTokens(table);
  // ハマりどころ（ユーザー報告「連続で置いたり取ったりすると前のアニメが強制的に
  // 消える」）: このrender()は状態が変わるたびに盤面を丸ごと作り直す
  // （上のtable.innerHTML=""）ため、直前の操作で点滅中だったマスのDOM要素も
  // 問答無用で消えてしまっていた。remote-move-animator.jsが「今どこがまだ点滅中か」を
  // DOM要素ではなく論理的な位置で覚えているので、作り直した直後にそれをこの新しい
  // 要素へ再度貼り付け直してもらう。
  reapplyActiveHighlights(table);
  fitTableToViewport();
  updateEndTurnButton();
  updateDrawButton();
  updatePublicDrawButton();
  updateHandShuffleButton();
  updateSelfHandStatus();
  updateTurnRoundCounter();
  updateFinalLockApprovalBanner();
  updateContactApprovalModal();
  checkContactAttackerResolution();
  checkForVictory();
}

// 画面サイズが変わっても手札などが見切れないよう、テーブル全体をビューポートに収まる
// 倍率へ動的に縮小・拡大する。rem基準の固定サイズレイアウトのままでも、外側のscale
// だけをJSで調整することでウィンドウサイズへの追従を実現する。
function fitTableToViewport() {
  if (boardZoomLevel > 0) {
    applyBoardZoomFit(boardZoomLevel);
    return;
  }
  applyNormalFit();
}

// ユーザー報告「タブレットで自分の手札が見えない」の根本原因（実測で特定）:
// #game-table自身のgetBoundingClientRect()は、rotateX(-40deg)+translateZ(2.4rem)で
// カメラ側へ大きく持ち上げられている自分の手札(.hand-fan.is-self)の実際の描画範囲を
// 過小評価する（3D変形された子要素の見た目の広がりを、深い perspective 階層越しの
// バウンディングボックス計算が正しく反映しないという、このプロジェクトで繰り返し
// 確認されてきたのと同じ系統の問題）。実測では、scale=1の時点で#game-table自身の
// bottomより自分の手札の実際のbottomが約150px下にはみ出していた。PCの背の高い
// ウィンドウでは余白に紛れて気付きにくいが、タブレットの横向き（縦幅が狭い）では
// その分だけ手札が画面下端の外へ切れて見えなくなっていた。
// 対策: フィット計算の基準を#game-table自身の矩形だけでなく、実際に3D変形されている
// 各手札(.hand-fan)の描画範囲も含めた「実効矩形」に広げる。
// getBoundingClientRect()は常に実画面のピクセルを返すが、bodyがステージのtransform
// （translate+scale、applyViewportStage参照）を持つようになったため、実画面座標のままだと
// STAGE_WIDTH/STAGE_HEIGHTという固定の仮想解像度と直接比較できない。ステージのローカル
// 座標（stageScale=1・オフセット無しだったとした場合の座標）に変換してから使う。
export function toStageLocalRect(r) {
  return {
    top: (r.top - currentStageOffsetY) / currentStageScale,
    bottom: (r.bottom - currentStageOffsetY) / currentStageScale,
    left: (r.left - currentStageOffsetX) / currentStageScale,
    right: (r.right - currentStageOffsetX) / currentStageScale,
  };
}

function getEffectiveFitRect(table) {
  const tableRect = table.getBoundingClientRect();
  // .hand-fan自身ではなく個々の.hand-cardを見る（扇状の回転は個々のカードのtransformで
  // 付けているため、.hand-fan自身の矩形はその突き出しを含まない。measureHandFanExtent
  // 参照）。ここは初期見積もりなので、以降の実測補正ループほど厳密でなくてもよいが、
  // 同じ理由で最初から.hand-cardを使っておく。
  // ハマりどころ（ユーザー報告「Aの手札にカードが加わると画面全体が遠景になる」）:
  // 手札は扇の枚数が増えるほど個々のカードのtranslateY・rotateが大きくなり、下端(bottom)が
  // どんどん深く伸びる（実測で確認済み）。この下端は「あえて画面下端から見切れる」設計
  // （手札は上の部分が少し見えていればよい）なので、幅/高さの初期見積もりには含めない。
  // 上端(top)・左右(left/right)は引き続き含める（手札が完全に画面外へ消えたり、
  // 扇が左右にはみ出すのを防ぐため）。
  let top = tableRect.top;
  let bottom = tableRect.bottom;
  let left = tableRect.left;
  let right = tableRect.right;
  for (const card of table.querySelectorAll(".hand-card")) {
    const r = card.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  // width/heightは差分（オフセットの影響を受けない）なので、ステージの倍率で割るだけで
  // ローカル座標系の値になる。
  return { width: (right - left) / currentStageScale, height: (bottom - top) / currentStageScale };
}

// 現在適用中のtransform（rotateX+scale3d、translateは変えない）のまま、実際に画面に
// 描画されている自分/他プレイヤーの手札の最大到達範囲（上下左右、ステージのローカル
// 座標系）を実測する。
// ハマりどころ: 親の.hand-fan自身のgetBoundingClientRect()は、扇状に個別回転している
// 子の.hand-card（親のレイアウトサイズには反映されない、見た目だけの transform）の
// 実際の突き出しを含んでくれない（.hand-fan単体で測ると再び過小評価してしまう）。
// 必ず個々の.hand-cardを直接測る。
function measureHandFanExtent(table) {
  const fans = table.querySelectorAll(".hand-card");
  let top = Infinity;
  let bottom = -Infinity;
  let left = Infinity;
  let right = -Infinity;
  for (const fan of fans) {
    const rReal = fan.getBoundingClientRect();
    if (rReal.width === 0 && rReal.height === 0) continue; // 空の手札（駒だけ等）は無視
    const r = toStageLocalRect(rReal);
    top = Math.min(top, r.top);
    bottom = Math.max(bottom, r.bottom);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
  }
  return { top, bottom, left, right };
}

// ユーザー要望「タブレット2D位置調整にカメラ視点位置・盤面のアスペクト比の調整を
// 追加してほしい」への対応。applyNormalFit/applyBoardZoomFitはtable.style.transform
// へ直接書き込む（インラインスタイル）ため、CSS側で body.diagnostic-flatten-3d
// .game-table {...} のようなオーバーライドを用意しても、インラインスタイルが常に
// スタイルシートより優先されて効かない（実測で確認済み）。そのため、2D表示中は
// これらの関数自身が2D表示専用のCSS変数（--table-tilt-flat・--table-flat-offset-x/y・
// --table-scale-flat）を読んで計算に織り込む。
function getFlatTableAdjustments() {
  const style = getComputedStyle(document.documentElement);
  if (!document.body.classList.contains("diagnostic-flatten-3d")) {
    return { tilt: style.getPropertyValue("--table-tilt").trim(), offsetX: "0rem", offsetY: "0rem", scaleMultiplier: 1 };
  }
  return {
    tilt: style.getPropertyValue("--table-tilt-flat").trim() || "0deg",
    offsetX: style.getPropertyValue("--table-flat-offset-x").trim() || "0rem",
    offsetY: style.getPropertyValue("--table-flat-offset-y").trim() || "0rem",
    scaleMultiplier: parseFloat(style.getPropertyValue("--table-scale-flat")) || 1,
  };
}

function applyNormalFit() {
  const table = document.getElementById("game-table");
  const { tilt, offsetX: flatOffsetX, offsetY: flatOffsetY, scaleMultiplier } = getFlatTableAdjustments();
  // scale()は2軸(X/Y)しか縮小しないため、駒の高さ等のtranslateZ(奥行き)がそのまま残り、
  // 画面を小さくするほど駒が奥行き方向にだけ間延びして見えるバグがあった。
  // scale3d()でZ軸も同じ倍率にすることで、縮小しても駒の縦横比が保たれるようにする。
  table.style.transformOrigin = "";
  table.style.transform = `rotateX(${tilt}) scale3d(1, 1, 1)`;
  const rect = getEffectiveFitRect(table);
  // ステージ方式（画面の縦横比固定）導入により、テーブルが実際に収まるべき「キャンバス」は
  // 常に固定のSTAGE_WIDTH×STAGE_HEIGHT（bodyのローカル座標系）になった。実際のウィンドウ
  // サイズは別レイヤー（applyViewportStage）が吸収するため、ここではwindow.innerWidth/
  // innerHeightを一切参照しない。
  const availW = STAGE_WIDTH * 0.94;
  const availH = STAGE_HEIGHT * 0.94;
  const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--camera-zoom")) || 1;
  // マウスホイールでの手動ズーム(manualZoom)・中クリックドラッグでの手動移動(manualPanX/Y)を
  // 自動フィットの結果にさらに上乗せする。2D表示中はscaleMultiplier（--table-scale-flat、
  // 既定1＝変化なし）もさらに掛け合わせる。
  let scale = Math.min(availW / rect.width, availH / rect.height, 1.15) * zoom * manualZoom * scaleMultiplier;

  const applyScale = (s) => {
    table.style.transform = `translate(calc(${manualPanX}rem + ${flatOffsetX}), calc(var(--camera-offset-y) + ${manualPanY}rem + ${flatOffsetY})) rotateX(${tilt}) scale3d(${s}, ${s}, ${s})`;
  };
  applyScale(scale);

  // ユーザー報告「タブレットで自分の手札が見えない」への対応（実測で根本原因を特定、
  // getEffectiveFitRectのコメント参照）。rotateX+perspectiveが絡む3D変形の中では、
  // 「変形前の矩形の比率」と「実際に画面上で必要な縮小率」が単純な比例関係にならない
  // （transform-originが手札の実際の重心ではなく#game-table自身の中心にあるため）。
  // このプロジェクトで繰り返し有効だった「3D越しの計算より実測」の方針に従い、上のscaleを
  // 一旦適用した上で実際の手札の画面上の到達範囲を実測し、まだ画面外にはみ出していれば、
  // 別のscaleでもう一度実測した2点から線形関係（scale3dの拡大率は常に線形）を逆算して
  // ちょうど収まるscaleを直接求める。数回繰り返して精度を上げる（各回、境界からの誤差が
  // 大幅に縮むため、3回もあれば十分収束する）。
  //
  // ハマりどころ（ユーザー報告「マウスホイールでズームインできなくなった」）: この補正を
  // hasManualView（手動ズーム/パン中かどうか）を問わず常に実行していたため、ユーザーが
  // ホイールでズームインしてmanualZoomを増やしても、直後にこの補正が「はみ出している」と
  // 判定して即座に縮め戻してしまい、ズームインが効かなくなっていた（ズームアウトは
  // 常に安全側なので影響を受けず、そちらだけ効いているように見えた）。自動フィット
  // （hasManualViewがfalseの間）の時だけ補正するようにし、ユーザーが意図的にズーム/パン
  // した後は、はみ出しを許容してでもその操作を尊重する。
  if (hasManualView) {
    currentTableScale = scale;
    return;
  }
  const marginW = STAGE_WIDTH * 0.03;
  const marginH = STAGE_HEIGHT * 0.03;
  const bounds = {
    top: marginH,
    bottom: STAGE_HEIGHT - marginH,
    left: marginW,
    right: STAGE_WIDTH - marginW,
  };
  // ユーザー要望「Aの手札は上の部分がちらっと見えていればよく、画面全体を遠景にしてまで
  // 手札全体を収める必要はない」に対応するため、下端方向だけは手札の下端(e.bottom)ではなく
  // 上端(e.top)を基準に判定する。つまり「手札の一番奥側（board寄り）の縁が画面下端の
  // 余白より上に少しでも顔を出していればOK」という緩い基準にし、手札の残り（近側の大部分）が
  // 画面下端の外へ大きくはみ出すのは許容する（元々「あえて画面下端から見切れる位置に
  // 配置」していた意図的な見た目に近い状態）。タブレットで手札が完全に見えなくなる
  // （e.topごと画面外に落ちる）不具合への対策はこれでも引き続き機能する。
  const worstOverflow = (e) => Math.max(e.top - bounds.bottom, bounds.top - e.top, e.right - bounds.right, bounds.left - e.left);
  for (let i = 0; i < 3 && scale > 0.05; i++) {
    const e1 = measureHandFanExtent(table);
    // ハマりどころ（ユーザー報告「セットアップ直後は遠景になり、ドローすると戻る」）:
    // セットアップ直後は誰の手札もまだ0枚のことがあり、measureHandFanExtentが空のまま
    // （top/leftがInfinity、bottom/rightが-Infinity）を返す。上のworstOverflowは
    // 「下端方向だけe.topを見る」よう変更済みのため、e.topがInfinityのままだと
    // Infinity - bounds.bottomが+Infinityになり「巨大なはみ出し」と誤判定されて
    // scaleが際限なく縮められてしまっていた（手札が1枚も無い＝この判定自体が
    // 無意味なので、そもそも判定しない）。
    if (!Number.isFinite(e1.top)) break;
    const overflow1 = worstOverflow(e1);
    if (overflow1 <= 0.5) break;
    const scale2 = scale * 0.85;
    applyScale(scale2);
    const e2 = measureHandFanExtent(table);
    // はみ出しが最も大きかった辺について、2点(scale, 値)(scale2, 値)から線形補間し、
    // ちょうど境界に収まるscaleを求める。
    let edge1;
    let edge2;
    let bound;
    if (e1.top - bounds.bottom === overflow1) {
      edge1 = e1.top;
      edge2 = e2.top;
      bound = bounds.bottom;
    } else if (bounds.top - e1.top === overflow1) {
      edge1 = e1.top;
      edge2 = e2.top;
      bound = bounds.top;
    } else if (e1.right - bounds.right === overflow1) {
      edge1 = e1.right;
      edge2 = e2.right;
      bound = bounds.right;
    } else {
      edge1 = e1.left;
      edge2 = e2.left;
      bound = bounds.left;
    }
    const slope = (edge2 - edge1) / (scale2 - scale);
    if (Number.isFinite(slope) && slope !== 0) {
      const solvedScale = scale + (bound - edge1) / slope;
      scale = Number.isFinite(solvedScale) && solvedScale > 0 ? Math.min(solvedScale, scale) : scale2;
    } else {
      scale = scale2;
    }
    applyScale(scale);
  }
  currentTableScale = scale;
}

// 「盤面拡大」: プレイヤーA（手前）のロックエリアが画面下端、プレイヤーC（奥）のロックエリアが
// 画面上端にほぼ収まる倍率までズームアップする。scaleは常にtransform-origin（拡大の基準点）
// を中心に働くため、A側ロック〜C側ロックの中間点を基準点に設定してから拡大することで、
// 中間点の画面上の位置を変えずに（＝結果的に上下対称に）その区間全体を引き伸ばせる。
// ボタンは「盤面拡大(level1)」→「もっと拡大(level2)」→「元に戻す(level0)」の3段階トグルで、
// 基準点(A〜C間の中間点)はどちらのレベルでも同じ。倍率・位置の微調整分だけレベルごとに
// 別のCSS変数（--board-zoom-{,2-}margin/offset-x/y）を持たせ、管理者モードから別々に調整できる。
function applyBoardZoomFit(level) {
  const table = document.getElementById("game-table");
  const { tilt, offsetX: flatOffsetX, offsetY: flatOffsetY, scaleMultiplier } = getFlatTableAdjustments();
  table.style.transformOrigin = "";
  table.style.transform = `rotateX(${tilt}) scale3d(1, 1, 1)`;

  const lockBottom = document.querySelector(".lock-bottom");
  const lockTop = document.querySelector(".lock-top");
  if (!lockBottom || !lockTop) return;

  const style = getComputedStyle(document.documentElement);
  const prefix = level === 2 ? "--board-zoom-2-" : "--board-zoom-";
  const referenceHeight = parseFloat(style.getPropertyValue(`${prefix}reference-height`)) || 900;

  // ハマりどころ（重要、--camera-perspective-origin-yをrem固定にしただけでは直らなかった）:
  // .sceneは`display:flex; align-items:center; height:100vh;`でテーブルを常に「今の
  // ウィンドウの高さ」で上下中央寄せしている。ウィンドウの高さが変わるとテーブル自体の画面上の
  // 垂直位置が動き、rotateXで傾いたテーブルと3D遠近感(perspective)の消失点との相対距離が
  // 変わるため、たとえ消失点自体の絶対位置を固定していても「見た目の縦幅」が
  // ウィンドウサイズに応じて変わってしまっていた。対策として、getBoundingClientRect()で
  // 測定する一瞬だけ.sceneの高さを基準値(reference-height)に強制し、「常に基準の高さの
  // ウィンドウで見た時と同じ状態」を再現してから測定し、直後に元の高さへ戻す
  // （この間は同期的なJS処理内で完結するため、画面には一切ちらつかない）。
  const scene = document.querySelector(".scene");
  const originalSceneHeight = scene.style.height;
  scene.style.height = `${referenceHeight}px`;
  const tableRect = table.getBoundingClientRect();
  const bottomRect = lockBottom.getBoundingClientRect();
  const topRect = lockTop.getBoundingClientRect();
  scene.style.height = originalSceneHeight;

  const spanTop = topRect.top;
  const spanBottom = bottomRect.bottom;
  const spanHeight = spanBottom - spanTop;
  const spanMidY = (spanTop + spanBottom) / 2;
  const originYPercent = ((spanMidY - tableRect.top) / tableRect.height) * 100;

  // 理論上はここでちょうど画面いっぱいになるはずだが、手札・アバター等の飛び出しや
  // ブラウザごとのレンダリング誤差で微妙にズレる（手前のロックエリアが見切れる、等）ことが
  // あったため、余白率・XY位置を管理者モードから追加で微調整できるようにした。
  const marginFrac = parseFloat(style.getPropertyValue(`${prefix}margin`)) || 0.98;
  const offsetX = style.getPropertyValue(`${prefix}offset-x`).trim() || "0rem";
  const offsetY = style.getPropertyValue(`${prefix}offset-y`).trim() || "0rem";
  const zoom = parseFloat(style.getPropertyValue("--camera-zoom")) || 1;
  // 実際のウィンドウの高さではなく、上で測定に使ったのと同じ固定の基準値
  // （--board-zoom-*-reference-height、px）を倍率計算にも使う。これで拡大結果は
  // ウィンドウサイズに一切依存しなくなる（基準値と大きく違う高さのウィンドウでは
  // 上下が見切れたり余白が出たりし得るが、その場合は基準値側を調整して合わせる）。
  //
  // ただし基準値（デフォルト800px）より実際のウィンドウが低い場合、この理屈のままだと
  // 拡大率が「800pxの画面で見た時と同じ」になるよう計算されるため、実際にはそれより
  // 低いウィンドウでは中身がはみ出し、画面上端に近いプレイヤーCのアバターが見切れて
  // しまうバグがあった（ユーザー報告）。基準値の代わりに「基準値と実際のウィンドウの
  // 高さの小さい方」を使うことで、基準値以上の高さのウィンドウでは従来通りの
  // サイズ非依存の拡大率を維持しつつ、基準値より低いウィンドウでは実際に収まる分だけ
  // 拡大率を自動的に下げ、はみ出し・見切れを防ぐ。
  // アバター・手札は測定対象のspan（ロック〜ロック間）自体からさらにはみ出す位置に配置
  // されているため、実際のウィンドウの高さぴったりまで許容すると、その分だけまだ見切れが
  // 残ってしまう（実測: 700px高のウィンドウで約26pxはみ出し）。安全率をかけて少し余裕を
  // 持たせる。
  // ステージ方式導入により、実際のウィンドウ高さではなく固定のSTAGE_HEIGHTを基準にする
  // （実際のウィンドウへの適応はapplyViewportStageが別レイヤーで担当するため）。
  const effectiveHeight = STAGE_HEIGHT < referenceHeight ? STAGE_HEIGHT * 0.85 : referenceHeight;
  table.style.transformOrigin = `50% ${originYPercent}%`;
  // マウスホイールでの手動ズーム(manualZoom)も、盤面拡大の倍率にさらに上乗せする。
  // 2D表示中はscaleMultiplier（--table-scale-flat、既定1＝変化なし）もさらに掛け合わせる。
  const scale = ((effectiveHeight * marginFrac) / spanHeight) * zoom * manualZoom * scaleMultiplier;
  // カメラのY軸オフセット(--camera-offset-y)・中クリックドラッグでの手動移動(manualPanX/Y)は
  // 盤面拡大レベルごとのoffset-x/yとは独立に、常時一定量を追加でずらす（先に適用することで、
  // 拡大時のtranslateOriginや倍率計算には影響させない）。2D表示専用のパン
  // （--table-flat-offset-x/y、実質的な「カメラ視点位置」）も同様にここへ足す。
  table.style.transform = `translate(calc(${manualPanX}rem + ${flatOffsetX}), calc(var(--camera-offset-y) + ${manualPanY}rem + ${flatOffsetY})) translate(${offsetX}, ${offsetY}) rotateX(${tilt}) scale3d(${scale}, ${scale}, ${scale})`;
  currentTableScale = scale;
}

// 0=通常, 1=盤面拡大, 2=もっと拡大。ボタンを押すたびに0→1→2→0…と巡回する。
let boardZoomLevel = 0;

// #game-tableに現在適用されているscale3d()の倍率。ドラッグ中のゴースト（3D空間の外＝
// document.body直下に置くため、#game-tableのscale3dの影響を受けない）のサイズをこの値に
// 合わせるために使う（applyNormalFit/applyBoardZoomFitの末尾で更新）。
let currentTableScale = 1;

// マウスホイールでの自由なズーム・中クリックドラッグでの視点移動。「盤面拡大」ボタンの
// 3段階トグルとは別枠で、常にその時点の表示（通常時／盤面拡大時どちらでも）に上乗せする形で
// 効く倍率・平行移動。hasManualViewがtrueの間は「盤面拡大」ボタンの見た目・挙動が
// 「🔄 最初の視点に戻る」に切り替わる（updateBoardZoomButtonLabel参照）。
let manualZoom = 1;
let manualPanX = 0; // rem
let manualPanY = 0; // rem
let hasManualView = false;

function cycleBoardZoom() {
  boardZoomLevel = (boardZoomLevel + 1) % 3;
  fitTableToViewport();
}

function resetManualView() {
  manualZoom = 1;
  manualPanX = 0;
  manualPanY = 0;
  hasManualView = false;
}

// --- 「拡大率登録」機能（盤面拡大ボタンの再設計） ----------------------------------
// マウスホイール/ピンチ/中クリックドラッグで自由に調整した画角(manualZoom/manualPanX/Y)を
// 「登録」しておくと、次回以降は通常表示の状態から「盤面拡大」ボタンを押すだけで
// （従来の拡大→もっと拡大→元に戻す、の3段階サイクルの代わりに）一気にその画角へ
// ジャンプできるようにする機能。ブラウザのlocalStorageに保存し、次回ページを開いた
// 時にも引き継がれる（他プレイヤーには一切共有されない、自分のブラウザだけの設定）。
const BOARD_ZOOM_REGISTERED_VIEW_KEY = "so7-board-zoom-registered-view";

function loadRegisteredBoardZoomView() {
  try {
    const raw = localStorage.getItem(BOARD_ZOOM_REGISTERED_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.zoom === "number" && typeof parsed?.panX === "number" && typeof parsed?.panY === "number") {
      return parsed;
    }
  } catch {
    // 壊れた値が入っていた場合は無視して未登録扱いにする。
  }
  return null;
}

let registeredBoardZoomView = loadRegisteredBoardZoomView();

function saveRegisteredBoardZoomView(view) {
  registeredBoardZoomView = view;
  try {
    localStorage.setItem(BOARD_ZOOM_REGISTERED_VIEW_KEY, JSON.stringify(view));
  } catch {
    // プライベートブラウジング等でlocalStorageが使えなくても、今回のセッション中は
    // registeredBoardZoomView自体は有効なまま動作を続けられるようにする。
  }
}

// 正式なアイコン画像がまだ無いため、差し替えまでの仮アイコンとしてシンプルなインラインSVGを
// 使う（assets/icons/へのファイル追加が要らず、コードだけで完結する）。
function dummyIconDataUri(svgInner) {
  return "data:image/svg+xml," + encodeURIComponent(svgInner);
}
const DUMMY_ICON_RETURN_TO_VIEW = dummyIconDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>'
);
const DUMMY_ICON_REGISTER_VIEW = dummyIconDataUri(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>'
);

// --- 画面の縦横比を固定するステージ方式 -------------------------------------------------
// ユーザー要望「画面の縦横比を固定したい。合わない画面は上下端か左右端に黒帯でよい」。
// bodyをstyle.css側で固定の仮想解像度(--stage-width/-height、STAGE_WIDTH/STAGE_HEIGHTと
// 常に一致させること)の箱にしてあり、ここではその箱を実際のウィンドウに収まる倍率で
// scaleし、中央に来るようtranslateする。CSSのtransformは position:fixed/absolute な
// 子孫にとって新しい基準（containing block）になる仕様のため、これだけで既存の
// ほぼ全てのオーバーレイUI（アイコンボタン・モーダル・ドラッグゴースト等）が、実装を
// 変えずに自動的に「このステージに対してfixed」になる。
export const STAGE_WIDTH = 1600;
export const STAGE_HEIGHT = 900;
let currentStageScale = 1;
let currentStageOffsetX = 0;
let currentStageOffsetY = 0;

function applyViewportStage() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  const offsetX = (window.innerWidth - STAGE_WIDTH * scale) / 2;
  const offsetY = (window.innerHeight - STAGE_HEIGHT * scale) / 2;
  document.body.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  currentStageScale = scale;
  currentStageOffsetX = offsetX;
  currentStageOffsetY = offsetY;
}

// マウス/タッチイベントのclientX/clientYは常に「実画面のピクセル」で、ステージの
// transform（上のapplyViewportStage）の影響を受けない。ステージ内の要素へその座標を
// そのままstyle.left/top等として使う箇所（ドラッグゴースト・コンテキストメニュー・
// 各種ツールチップ等の「カーソルの位置に何かを表示する」処理）は、この関数で
// ステージのローカル座標（bodyの1600x900の座標系）に変換してから使う必要がある。
// elementsFromPoint()・getBoundingClientRect()は両方とも実画面座標のままで一貫している
// ため、当たり判定目的の比較には使わない（変換すると逆にズレる）。
export function stageClientToLocal(clientX, clientY) {
  return {
    x: (clientX - currentStageOffsetX) / currentStageScale,
    y: (clientY - currentStageOffsetY) / currentStageScale,
  };
}

// ドラッグの移動量（差分）をステージのローカル座標系に変換する（オフセットは差分では
// 打ち消し合うため、倍率で割るだけでよい）。
export function stageDelta(px) {
  return px / currentStageScale;
}

let resizeTimer;
window.addEventListener("resize", () => {
  applyViewportStage();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(fitTableToViewport, 100);
});

// --- ドラッグ操作 ---------------------------------------------------------
// ルールを一切適用しない自由な移動なので、「掴んだ物を離した場所」を見て状態を更新するだけの
// シンプルな仕組みにする。ドラッグ中は実体を動かさず、カーソルに追従する「ゴースト」だけを
// 画面全体(document.body)に浮かせて表示する。盤面自体がperspective+rotateXで傾いた3D空間の
// 中にあるため、ドラッグ中の要素をその中で動かそうとすると座標計算が複雑になる。ゴーストを
// 3D空間の外(body直下)に置いてカーソルに1:1で追従させる方が単純かつ確実。
// ドロップ位置の判定はelementsFromPoint()で「その座標にある要素」を調べ、盤面マス／ロック
// スロット／手札エリア／山札等のどれに該当するかをclosest()で特定する。

let dragSession = null;

// タッチ操作中、1本指の長押しプレビュー/ドラッグ判定(startTouchHoldOrDrag)が進行中の場合に
// その中断関数を置く場所。2本目の指が触れてピンチズーム(initCameraControls)が始まった瞬間、
// これを呼んで安全に打ち切る（ドラッグへ昇格済みならcancelDragSession()で位置を戻す）。
let activeSingleTouchAbort = null;

// ドラッグ開始対象の特定は、各要素にpointerdownを直接付ける方式ではなく、#game-table全体に
// 1つだけ付けたリスナーの中でelementsFromPoint()を使って手動で判定する。
// 理由（ハマりどころ）: このアプリの盤面はperspective+rotateXの3D階層が何段も入れ子に
// なっており、ネイティブのヒットテスト（＝どの要素がpointerdownを受け取るか。elementFromPoint
// と同じ仕組み）が、実際に描画されている見た目と食い違うことがある。特に自分の手札
// （.hand-fan.is-selfがrotateX(-40deg)+translateZ(2.4rem)で大きく持ち上げられ、カメラに
// ほぼ正対する角度になっている）は、見た目には正しくカードが手前に描画されているのに、
// ネイティブのヒットテストだけがその奥にある.zone-bottom（何もリスナーの無い平坦なコンテナ）
// を返してしまい、カード自体にpointerdownイベントが一切届かず「触れない」状態になっていた。
// 一方でelementsFromPoint()（複数形）は実際の見た目通りに.hand-cardを最前面として正しく
// 返すことを確認できたため、要素個別のリスナーに頼らずelementsFromPoint()で自前判定する
// 方式に統一した（ドロップ先の判定は元々この方式だった）。
// ハマりどころ: 以前は要素ごとに「駒？カード？山？」と優先順位付きで1回だけ判定していたが、
// これだと「カードの上に駒が乗っている」時、そのカードのDOM要素がたまたま駒より後で描画されて
// 手前に来ていると（同じマス内で描画順が後になっただけの理由で）、elementsFromPointの並びで
// カードの方が駒より先に出てきてしまい、本来最優先のはずの駒より先にカードとして判定・確定
// してしまうことがあった（駒の当たり判定を追加した後、駒の「下の方」だけ掴めなくなる、
// という形で発覚）。優先順位（駒＞盤面カード＞手札カード＞山）を「要素ごと」ではなく
// 「種類ごと」に全要素を舐めてから確定するように直し、描画順に関係なく常に駒を最優先で
// 拾えるようにした。
// 手札公開エリアの「捨てる」ボタン専用の当たり判定（findDraggableAtと同じ理由で
// elementsFromPoint()を使う。ネイティブのclickイベントに任せると3D階層の中で
// ヒットテストが狂うため、pointerdown側で先回りして拾う）。
function findDiscardButtonAt(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const btn = el.closest(".hand-reveal-discard-btn");
    if (btn) return btn;
  }
  return null;
}

function findDraggableAt(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const piece = el.closest(".piece");
    if (piece) return { el: piece, tokenId: piece.dataset.tokenId, kind: "piece" };
  }
  for (const el of elements) {
    // 盤面マス／ロックスロットに直接置かれたカードは、手札のカードと違ってダブルクリックで
    // 表裏を反転できる対象なので区別しておく(isBoardCard)。
    const boardCard = el.closest(".board-card");
    if (boardCard) return { el: boardCard, tokenId: boardCard.dataset.tokenId, kind: "card", isBoardCard: true };
  }
  for (const el of elements) {
    // 手札公開エリアのカードも「場のカードと同じように扱えるように」というユーザー要望で、
    // .board-cardと同じ扱い（つかんで動かせる・ダブルクリックで表裏反転できる）にする。
    const revealCard = el.closest(".hand-reveal-card");
    if (revealCard) return { el: revealCard, tokenId: revealCard.dataset.tokenId, kind: "card", isBoardCard: true };
  }
  for (const el of elements) {
    const handCard = el.closest(".hand-card");
    if (handCard) return { el: handCard, tokenId: handCard.dataset.tokenId, kind: "card" };
  }
  for (const el of elements) {
    const stack = el.closest(".stack[data-pile]");
    if (stack) return { el: stack, kind: "pile", pile: stack.dataset.pile };
  }
  return null;
}

// マウスカーソルの下にある「つかめる/対象になる」要素をハイライトする（ドラッグはしない、
// ホバーだけ）。findDraggableAt()と同じ優先順位（駒＞カード＞山）で判定するので、駒がカードの
// 上に乗っている時に「今クリックしたらどっちが掴めるか」がハイライトで分かるようになる。
// 加えて、何も乗っていない空のマス／ロックスロットもホバー対象にする（掴めるものが無くても
// マス自体を示したいため）。
function findHoverTarget(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  // findDraggableAtと同じ理由（描画順に関係なく優先順位を種類ごとに確定させるため）で
  // 二段階に分けている。
  for (const el of elements) {
    // 「+N」バッジ（重なりカードの一覧表示）は一番手前にあるので最優先で判定する。
    const badge = el.closest(".stack-badge");
    if (badge) return badge;
  }
  for (const el of elements) {
    const piece = el.closest(".piece");
    if (piece) return piece;
  }
  for (const el of elements) {
    const boardCard = el.closest(".board-card");
    if (boardCard) return boardCard;
  }
  for (const el of elements) {
    const revealCard = el.closest(".hand-reveal-card");
    if (revealCard) return revealCard;
  }
  for (const el of elements) {
    const handCard = el.closest(".hand-card");
    if (handCard) return handCard;
  }
  for (const el of elements) {
    const stack = el.closest(".stack[data-pile]");
    if (stack) return stack;
  }
  for (const el of elements) {
    const cell = el.closest(".cell");
    if (cell) return cell;
  }
  for (const el of elements) {
    const lockSlot = el.closest(".lock-slot");
    if (lockSlot) return lockSlot;
  }
  return null;
}

let hoverEl = null;

function clearHover() {
  if (hoverEl) hoverEl.classList.remove("hover-active");
  hoverEl = null;
}

// ホバー/右クリック中の要素が「中身の見える表向きカード」なら、そのcardIdを返す
// （それ以外はnull）。自分の手札(is-self)は常に中身が見える。盤面/ロックのカードは
// token.faceUpを見る。捨て場はルール上表向きに積まれているので、空でなければ一番上の
// カードだけ対象になる（山札・エターナル・ファーストは裏向き積みなので中身を明かさない）。
// 「+N」バッジは一番上のカードそのものとして扱う。
function getVisibleCardId(el) {
  if (el.classList.contains("stack-badge")) {
    const ids = el.dataset.stackTokens.split(",");
    const topToken = getState().tokens.find((t) => t.id === ids[ids.length - 1]);
    return topToken && topToken.faceUp ? topToken.cardId : null;
  }
  if (el.classList.contains("hand-card")) {
    if (!el.classList.contains("is-self")) return null;
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    return token ? token.cardId : null;
  }
  if (el.classList.contains("board-card")) {
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    return token && token.faceUp ? token.cardId : null;
  }
  if (el.classList.contains("hand-reveal-card")) {
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    return token && token.faceUp ? token.cardId : null;
  }
  if (el.matches(".stack[data-pile]") && el.dataset.pile === "discard") {
    const pile = getState().piles.discard;
    return pile.length > 0 ? pile[pile.length - 1] : null;
  }
  return null;
}

function getPreviewImagePath(el) {
  const cardId = getVisibleCardId(el);
  return cardId ? getCardImagePath(cardId) : null;
}

let previewEl = null;
function getPreviewEl() {
  if (!previewEl) {
    previewEl = document.createElement("div");
    previewEl.id = "card-preview";
    document.body.appendChild(previewEl);
  }
  return previewEl;
}

// 山（山札・エターナル・ファースト・捨て場）にカーソルを乗せた時に見せる「名前 N枚」の
// 小さなテキスト。常時表示だったラベル・枚数をやめた代わりに、ホバー時だけ見えるようにする。
function getPileTooltipText(el) {
  if (!el.matches(".stack[data-pile]")) return null;
  const pileKey = el.dataset.pile;
  const config = PILE_CONFIG[pileKey];
  const pileArray = getState().piles[pileKey];
  const count = pileArray.length;
  let label = config.label;
  if (pileKey === "discard" && count > 0) {
    label = getCardDefinition(pileArray[pileArray.length - 1]).name;
  }
  return `${label}　${count}枚`;
}

// 相手（自分以外）の手札にカーソルを合わせた時、中身は明かさず枚数だけを教える
// （手札の中身自体は非公開情報のため、getVisibleCardId等と同じ考え方で自分の手札は除外する）。
function getHandTooltipText(el) {
  if (!el.classList.contains("hand-card") || el.classList.contains("is-self")) return null;
  const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
  if (!token) return null;
  const player = token.location.player;
  const count = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player
  ).length;
  return `${getPlayerName(player)}　手札${count}枚`;
}

let pileTooltipEl = null;
function getPileTooltipEl() {
  if (!pileTooltipEl) {
    pileTooltipEl = document.createElement("div");
    pileTooltipEl.id = "pile-tooltip";
    document.body.appendChild(pileTooltipEl);
  }
  return pileTooltipEl;
}

function updatePileTooltip(el, clientX, clientY) {
  const tooltip = getPileTooltipEl();
  const text = el ? getPileTooltipText(el) || getHandTooltipText(el) : null;
  if (!text) {
    tooltip.style.display = "none";
    return;
  }
  tooltip.textContent = text;
  // ステージ方式導入により、tooltipはbody（ステージ）に対してfixedになったため、
  // clientX/clientY（常に実画面座標）をステージのローカル座標に変換してから使う
  // （stageClientToLocal参照）。
  const local = stageClientToLocal(clientX, clientY);
  tooltip.style.left = `${local.x + 16}px`;
  tooltip.style.top = `${local.y + 16}px`;
  tooltip.style.display = "block";
}

// #card-previewの位置決め。拡大の起点は左下端（＝カーソル付近）に固定し、そこから右上方向へ
// 広がるようにする。left/bottom（topではなく）で位置決めしているのがポイント：
// --card-preview-size（管理者モードで調整可能）を変えてもleft/bottomの基準点自体はズレず、
// 大きさだけが変わる。画面右端・上端をはみ出す場合だけ、表示方向を反転する
// （盤面奥のカードをホバーすると上端で見切れる、という報告への対応）。
function positionPreviewPanel(panel, clientX, clientY) {
  const offset = 20;
  const cs = getComputedStyle(panel);
  const panelWidthPx = parseFloat(cs.width);
  const panelHeightPx = parseFloat(cs.height);
  // ステージ方式導入により、panelはbody（ステージ）に対してfixedになったため、
  // clientX/clientY（常に実画面座標）をステージのローカル座標に変換してから使う
  // （stageClientToLocal参照）。画面端の判定もSTAGE_WIDTH/STAGE_HEIGHT基準にする。
  const local = stageClientToLocal(clientX, clientY);
  const { x: clientXLocal, y: clientYLocal } = local;

  let left = clientXLocal + offset;
  if (left + panelWidthPx > STAGE_WIDTH) left = clientXLocal - offset - panelWidthPx;
  panel.style.left = `${left}px`;

  if (clientYLocal - offset - panelHeightPx < 0) {
    // 上方向に広げると画面上端をはみ出す→カーソルの下方向に広げる
    panel.style.top = `${clientYLocal + offset}px`;
    panel.style.bottom = "";
  } else {
    panel.style.bottom = `${STAGE_HEIGHT - clientYLocal + offset}px`;
    panel.style.top = "";
  }
}

function updatePreview(el, clientX, clientY) {
  const preview = getPreviewEl();
  updatePileTooltip(el, clientX, clientY);

  const imagePath = el ? getPreviewImagePath(el) : null;
  if (!imagePath) {
    preview.style.display = "none";
    return;
  }
  preview.style.backgroundImage = `url("${imagePath}")`;
  positionPreviewPanel(preview, clientX, clientY);
  preview.style.display = "block";
}

function updateHover(clientX, clientY) {
  // ドラッグ中はドロップ先ハイライト(.drop-target-active)と役割が被って紛らわしいので休止する。
  if (dragSession) {
    clearHover();
    updatePreview(null);
    return;
  }
  const next = findHoverTarget(clientX, clientY);
  if (next !== hoverEl) {
    clearHover();
    if (next) next.classList.add("hover-active");
    hoverEl = next;
  }
  updatePreview(next, clientX, clientY);
}

function initHoverHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("pointermove", (e) => updateHover(e.clientX, e.clientY));
  table.addEventListener("pointerleave", () => {
    clearHover();
    updatePreview(null);
  });
}

// 自分の手札をあえて画面下部で見切れさせている場合向け（ユーザー要望）: PCではホバーで、
// タブレットではタップで、カーソル/タップ位置にある1枚だけが「ひょこっと」持ち上がる
// （--hand-a-peek-liftで持ち上げ量を管理者モードから調整可能）。以前は手札全体を
// 持ち上げていたが、「1枚だけひょこっと出るようにしたい」という要望を受け、個々の
// カード（.hand-card.is-self）単位の当たり判定・演出に作り直した。自分の手札は常に
// 画面手前（.zone-bottom）に来る（視点回転済み）ため、この1箇所だけを見ればよい。
// カードの当たり判定は、扇状に並ぶ各カードの矩形(getBoundingClientRect)にカーソル/タップ
// 座標が含まれるかで判定する（重なっている場合はDOM順で最後＝扇の上に描画されている
// カードを優先する）。
// ハマりどころ（重要、以前の「手札全体」版から引き継ぎ）: クラス(.is-peeked)の付け外し＋
// カスタムプロパティをcalc()経由でtransformに反映する方式は、深いpreserve-3d階層の中では
// 既存ノードのtransformが再計算されず効かないことが判明済み（render()でDOMごと作り直した
// 直後の新規ノードでは正しく反映される）。そのため、クラス切替には頼らず、transform
// プロパティ自体をJSから直接書き換える。各カードの基準となる扇の位置(cardEl.dataset.
// baseTransform、buildPlayerZone参照)にtranslateZを追記する形にし、解除時はこの基準値へ
// そのまま戻す。
let peekedCardEl = null;
function setPeekedCard(cardEl) {
  if (peekedCardEl === cardEl) return;
  if (peekedCardEl) peekedCardEl.style.transform = peekedCardEl.dataset.baseTransform ?? "";
  peekedCardEl = cardEl;
  if (!cardEl) return;
  const lift = getComputedStyle(document.documentElement).getPropertyValue("--hand-a-peek-lift").trim() || "3rem";
  // ハマりどころ（ユーザー報告「引っ込む方向になっちゃってる」）: 当初はtranslateZ(lift)
  // （カメラ側へのポップ量）を追記していた。実測したところ、カードの基準transform
  // （rotate(angle)deg）の後にtranslateZを追記すると、既に傾いている手札全体
  // （.hand-areaのrotateX(-40deg)）の座標系の都合で、画面上は「大きくなる（カメラに
  // 近づく効果は出る）が同時に下方向へ沈む」という、意図と逆の見え方になっていた
  // （getBoundingClientRect実測: widthは増えるがtopも増える＝下に動く）。カードの
  // 基準transform（rotateより前のtranslateX/Y段階、画面のY軸にほぼ対応する）に対して
  // 追加のtranslateY(-lift)を使う方式に変更し、実測で「上に持ち上がる」動きになる
  // ことを確認した。
  cardEl.style.transform = `${cardEl.dataset.baseTransform ?? ""} translateY(-${lift})`;
}
// カーソル/タップ座標に重なる自分の手札カードのうち、中心が最も近い1枚を返す（無ければ
// null）。ハマりどころ: 扇状に回転したカードのgetBoundingClientRect()は、見た目の菱形より
// かなり大きい軸並行の矩形になるため、隣接カードの矩形と広く重なり合う。「矩形に含まれる
// 最後（DOM順）のもの」で判定すると、実際にカーソルの真下にあるカードとは違う、隣の
// カードが選ばれてしまうことがあった（実測で確認）。矩形に含まれるものの中から、中心点との
// 距離が最も近いものを選ぶことで、見た目通りの1枚に絞れるようにした。
function findSelfHandCardAt(clientX, clientY) {
  const cards = document.querySelectorAll(".zone-bottom .hand-area .hand-card.is-self");
  let best = null;
  let bestDist = Infinity;
  for (const el of cards) {
    const r = el.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dist = (clientX - cx) ** 2 + (clientY - cy) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  return best;
}
function initHandPeek() {
  window.addEventListener("pointermove", (e) => {
    if (isTouchPrimaryDevice()) return; // タブレットはタップ専用（下のpointerdown参照）
    setPeekedCard(findSelfHandCardAt(e.clientX, e.clientY));
  });
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (!isTouchPrimaryDevice()) return;
      // ハマりどころ: e.target.closest(...)によるネイティブのヒットテストは、深い
      // preserve-3d階層の中では実際に見えている要素と食い違うことがある（このプロジェクトで
      // 繰り返し確認済み）。pointermove側と同じ、矩形の座標包含判定に揃える。
      setPeekedCard(findSelfHandCardAt(e.clientX, e.clientY));
    },
    // キャプチャフェーズにはしない: 手札のドラッグ開始判定(#game-tableのpointerdown)を
    // 妨げてはいけないため、素直にbubbleフェーズで拾うだけの読み取り専用リスナーにする
    // （preventDefault/stopPropagationは一切呼ばない）。
    false
  );
}

// --- 右クリックメニュー ---------------------------------------------------
// ゲーム内では常にブラウザ標準の右クリックメニューを出さないようにし、代わりに専用メニューを
// 出す。対象の判定は、dblclickと同じ理由でネイティブのe.targetを信用せず、ここでも
// elementsFromPoint()ベースのfindHoverTarget()を使う。中身の分かるカード以外（駒や空マス等）は
// 今のところメニュー項目が無いので、ブラウザメニューを消すだけに留める。
let contextMenuEl = null;

function closeContextMenu() {
  if (contextMenuEl) {
    contextMenuEl.remove();
    contextMenuEl = null;
  }
}

function showCardNoteModal(cardId) {
  const def = getCardDefinition(cardId);
  if (!def) return;
  const backdrop = document.createElement("div");
  backdrop.id = "card-note-modal-backdrop";
  const modal = document.createElement("div");
  modal.id = "card-note-modal";
  const img = document.createElement("img");
  img.className = "card-note-image";
  img.src = getCardImagePath(cardId);
  img.alt = def.name;
  const textCol = document.createElement("div");
  textCol.className = "card-note-text-col";
  const title = document.createElement("div");
  title.className = "card-note-title";
  title.textContent = def.name;
  const body = document.createElement("div");
  body.className = "card-note-body";
  body.textContent = def.note || "（補足なし）";
  textCol.appendChild(title);
  textCol.appendChild(body);
  const content = document.createElement("div");
  content.className = "card-note-content";
  content.appendChild(img);
  content.appendChild(textCol);
  const closeBtn = document.createElement("button");
  closeBtn.className = "modal-close-x";
  closeBtn.textContent = "×";
  closeBtn.setAttribute("aria-label", "閉じる");
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);
  modal.appendChild(closeBtn);
  modal.appendChild(content);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// 重なっているカードを一覧表示する、ホバーではなく常時表示・要クローズのモーダル
// （ホバー式の一覧は「何枚も重なっていると表示が難しい」との理由で廃止し、これに置き換えた）。
// 各カードは自分自身のfaceUpに従って表向き/裏向きの画像を出す（下に潜む裏向きカードの
// 中身を一覧表示によって覗けてしまわないようにするため）。下から上への重なり順で表示する。
function showStackModal(tokenIds) {
  const tokens = tokenIds.map((id) => getState().tokens.find((t) => t.id === id)).filter(Boolean);
  const modal = document.createElement("div");
  modal.id = "stack-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });
  const title = document.createElement("div");
  title.className = "stack-modal-title";
  title.textContent = `重なっているカード（${tokens.length}枚・下から上の順）`;
  const list = document.createElement("div");
  list.className = "stack-modal-list";
  for (const token of tokens) {
    const card = document.createElement("div");
    card.className = "stack-modal-card";
    const imagePath = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
    card.style.backgroundImage = `url("${imagePath}")`;
    list.appendChild(card);
  }
  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(list);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// 右クリックされた要素(.board-cardまたは.stack-badge)が2枚以上重なっているマス/ロックスロットの
// 一部なら、そのグループの全トークンidを下から上の順で返す（重なっていなければnull）。
function getStackTokensAt(el) {
  if (el.classList.contains("stack-badge")) {
    return el.dataset.stackTokens.split(",");
  }
  if (el.classList.contains("board-card")) {
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    if (!token) return null;
    for (const tokens of getCardStackGroups().values()) {
      if (tokens.length >= 2 && tokens.some((t) => t.id === token.id)) {
        return tokens.map((t) => t.id);
      }
    }
  }
  return null;
}

function showContextMenu(clientX, clientY, items) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.id = "card-context-menu";
  for (const { label, onClick } of items) {
    const item = document.createElement("button");
    item.textContent = label;
    item.addEventListener("click", () => {
      closeContextMenu();
      onClick();
    });
    menu.appendChild(item);
  }
  // ステージ方式導入により、menuはbody（ステージ）に対してfixedになったため、
  // clientX/clientY（常に実画面座標）をステージのローカル座標に変換してから使う。
  const local = stageClientToLocal(clientX, clientY);
  menu.style.left = `${local.x}px`;
  menu.style.top = `${local.y}px`;
  document.body.appendChild(menu);
  contextMenuEl = menu;
}

// ユーザー要望「裏面カードで右クリック→裏面変更」への対応。右クリックされた要素が
// 「今まさに裏向き（カード裏面画像）を表示している」かどうかを判定する。findHoverTarget
// が拾い得る各種要素ごとに、裏向きの意味が異なるため個別に見る。
function isFaceDownCardElement(el) {
  if (el.classList.contains("board-card")) return el.classList.contains("is-facedown");
  if (el.classList.contains("hand-card")) return !el.classList.contains("is-self"); // 他人の手札は常に裏向き
  if (el.classList.contains("hand-reveal-card")) {
    const token = getState().tokens.find((t) => t.id === el.dataset.tokenId);
    return token ? !token.faceUp : false;
  }
  if (el.classList.contains("stack-badge")) {
    const ids = el.dataset.stackTokens.split(",");
    const topToken = getState().tokens.find((t) => t.id === ids[ids.length - 1]);
    return topToken ? !topToken.faceUp : false;
  }
  if (el.matches(".stack[data-pile]")) {
    // 山札・エターナル・ファーストは常に裏向き積み。捨て場は表向き積みのため対象外。
    return el.dataset.pile === "deck" || el.dataset.pile === "eternal" || el.dataset.pile === "first";
  }
  return false;
}

// ユーザー要望「駒を右クリック」「マットを右クリック」「背景を右クリック」
// 「ロックエリアバーを右クリック」への対応。これらはfindHoverTarget（カード/駒/山/
// マス目専用、ドラッグ判定と共有しているため既存の挙動を変えたくない）には含めない、
// 「今の見た目を決めているレイヤー」を専用に探す。
// ハマりどころ: この3種類（.lock-area-bar/.playmat-bg/.table-background-bg）は
// クリックがピース/マス目に通り抜けるようpointer-events:noneが指定されているため、
// document.elementsFromPoint()では（findHoverTargetと違い）そもそも一切拾えない。
// そのため見た目の重なり順（ロックエリアバー→プレイマット→背景の順、arena内の
// z-index 2/1/0と対応）通りに、各要素のgetBoundingClientRect()へ座標が収まっているか
// を自前で判定する。また.lock-area-barは上下左右4辺ぶん個別の要素があるため、
// querySelectorAllで全辺をチェックする。
function findAppearanceLayerAt(clientX, clientY) {
  const pointInRect = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  };
  for (const bar of document.querySelectorAll(".lock-area-bar")) {
    if (pointInRect(bar)) return "lockAreaBar";
  }
  if (pointInRect(document.querySelector(".playmat-bg"))) return "playmat";
  if (pointInRect(document.querySelector(".table-background-bg"))) return "background";
  return null;
}

function initContextMenuHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("contextmenu", (e) => {
    e.preventDefault(); // ゲームの盤面上では常にブラウザの既定メニューを出さない
    const hit = findHoverTarget(e.clientX, e.clientY);
    const items = [];

    if (hit) {
      const cardId = getVisibleCardId(hit);
      const stackTokenIds = getStackTokensAt(hit);
      if (cardId) {
        items.push({ label: "カード補足を見る", onClick: () => showCardNoteModal(cardId) });
      }
      if (stackTokenIds) {
        items.push({ label: "重なっているカードを見る", onClick: () => showStackModal(stackTokenIds) });
      }
      // ユーザー要望「裏面カードで右クリック→裏面変更」「駒を右クリック→スキン変更」
      // 「山札を右クリック→山札一覧」への対応。同じ要素に複数の項目が同時に出ることもある
      // （例: 山札を右クリックすると「裏面デザインを変更」と「山札一覧を見る」の両方）。
      if (isFaceDownCardElement(hit)) {
        items.push({ label: "カード裏面デザインを変更", onClick: () => openCardBackSkinPicker() });
      }
      if (hit.matches(".stack[data-pile]") && hit.dataset.pile === "deck") {
        items.push({ label: "山札一覧を見る", onClick: () => openDeckViewer() });
      }
      if (hit.classList.contains("piece")) {
        items.push({ label: "駒スキンを変更", onClick: () => openPieceSkinPicker() });
      }
    }
    if (items.length === 0) {
      // ユーザー要望「マットを右クリック」「背景を右クリック」「ロックエリアバーを
      // 右クリック→隠す」への対応。findHoverTargetが何か拾っていても（例: 何も置かれて
      // いない.cellや.lock-slot）、そこから項目が1つも出なかった場合はまだ「実質的に
      // 何もない場所」なので、その下に見えているレイヤーを判定する。盤面49マスの大半は
      // .cellがプレイマットの真上に重なっているため、hitがnullの時だけに絞ると
      // 「マス目の外側の細い余白」でしかマット変更を出せなくなってしまう。
      const layer = findAppearanceLayerAt(e.clientX, e.clientY);
      if (layer === "lockAreaBar") {
        items.push({
          label: "ロックエリアバーを隠す",
          onClick: () => {
            setLockAreaBarVisible(false);
            render();
            openIconDetailModal("ロックエリアバーを隠しました", [
              "画面右上の「⚙ オプション」→「基本設定」の「ロックエリアバーを表示する」を" +
                "チェックすると、いつでも元に戻せます。",
            ]);
          },
        });
      } else if (layer === "playmat") {
        items.push({ label: "プレイマットを変更", onClick: () => openPlaymatPicker() });
      } else if (layer === "background") {
        items.push({ label: "背景画像を変更", onClick: () => openBackgroundPicker() });
      }
    }

    if (items.length === 0) {
      closeContextMenu();
      return;
    }
    showContextMenu(e.clientX, e.clientY, items);
  });
  document.addEventListener("pointerdown", (e) => {
    if (contextMenuEl && !contextMenuEl.contains(e.target)) closeContextMenu();
    if (openPromptEl && !openPromptEl.contains(e.target)) closeOpenPrompt();
  });
}

// ユーザー要望「効果音『ボタン押す』を追加しました。いろんなボタンに適用してください。
// アイコンには不要です」への対応。アプリ内のボタンは非常に多くのファイルに散らばって
// いるため、1つ1つにplaySound()を書き足す代わりに、document全体で<button>のクリックを
// 拾うグローバルな委譲リスナーにした。アイコンボタン（.icon-action-button、手札
// シャッフル・盤面拡大・マイページ等の右下/右上のアイコン群）だけは要望通り対象外にする。
function initButtonClickSound() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn || btn.disabled) return;
    if (btn.classList.contains("icon-action-button")) return;
    playSound("buttonPress");
  });
}

// ダブルクリックでの表裏反転は、ネイティブの`dblclick`イベントではなく、ドラッグと同じ
// elementsFromPoint()ベースの判定に統合して自前実装する。
// 理由（ハマりどころ）: `dblclick`もpointerdown同様ネイティブのヒットテスト(target)に頼る
// イベントのため、自分の手札で起きたのと同じ「見た目と当たり判定がズレる」3D階層特有の問題で
// 正しく発火しないことがあった（ユーザー報告：「ダブルクリックで裏返せない」）。ドラッグ開始
// 判定は既にelementsFromPoint()で確実に動いているため、同じ判定結果を使って「同じカードに
// 400ms以内に2回pointerdownがあったか」を見ることでダブルクリック相当を検出する。
let lastFlipClick = { tokenId: null, time: 0 };
const DOUBLE_CLICK_MS = 400;

function initDragHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("pointerdown", async (e) => {
    if (e.button !== 0) return;
    // 「捨てる」ボタンはfindDraggableAtの対象外（駒でもカードでも山でもない）だが、
    // 同じ3D階層のヒットテスト問題を受けるため、先に専用の当たり判定で拾っておく
    // （buildPlayerZoneのdiscardBtn生成部のコメント参照）。
    const discardBtn = findDiscardButtonAt(e.clientX, e.clientY);
    if (discardBtn) {
      e.preventDefault();
      discardFromHandReveal(discardBtn.dataset.tokenId);
      return;
    }
    const hit = findDraggableAt(e.clientX, e.clientY);
    if (!hit) return;
    e.preventDefault();

    if (hit.isBoardCard) {
      const now = Date.now();
      const isDoubleClick = hit.tokenId === lastFlipClick.tokenId && now - lastFlipClick.time < DOUBLE_CLICK_MS;
      lastFlipClick = { tokenId: hit.tokenId, time: now };
      if (isDoubleClick) {
        // オープンする前のカードを見ておく。「駒がすでに乗っている裏向きカードを手動で
        // オープンした」場合も、その瞬間に初めて表向きカードの上に駒がいる状態になるため、
        // 到達モーダルの対象にする（表向き→裏向きに戻す方向の時は対象外）。
        const cardToken = getState().tokens.find((t) => t.id === hit.tokenId);
        if (isOnlineMode()) {
          // オンライン中はflipToken()がローカルstateを書き換えないため、awaitして
          // fetchAndHydrate()で明示的に再同期してから演出判定する（promptCardOpenの
          // 「オープンする」ボタンと同じ考え方）。
          try {
            await flipToken(hit.tokenId);
            markSelfHandled([hit.tokenId]);
            await fetchAndHydrate(getCurrentGameId());
          } catch (err) {
            console.error("flipToken failed", err);
            render();
            lastFlipClick = { tokenId: null, time: 0 };
            return;
          }
        } else {
          flipToken(hit.tokenId);
        }
        playSound("cardFlip");
        const freshToken = getState().tokens.find((t) => t.id === hit.tokenId);
        if (cardToken && !cardToken.faceUp && freshToken && hasPieceAt(freshToken.location)) {
          triggerCardArrival(freshToken.cardId, freshToken.location);
        }
        render();
        lastFlipClick = { tokenId: null, time: 0 }; // 3連続クリックを2回分のダブルクリックにしない
        return;
      }
    }

    // タッチ/ペンでは「マウスホバーで拡大プレビュー」に相当する操作が無く、指で押さえても
    // 即座にドラッグ（つまむ）が始まってしまうため、中身を確認する手段が無かった
    // （ユーザー報告: タブレットで長押しすると代わりにブラウザの文字選択が出てしまう）。
    // 動かさずに押さえ続けた場合はドラッグの代わりに拡大プレビューを表示し、途中で動かせば
    // 通常通りドラッグへ切り替える。マウスは従来通り即座にドラッグを開始する（ホバーは
    // 別途pointermoveだけで機能しているため変更不要）。
    if (e.pointerType === "touch" || e.pointerType === "pen") {
      startTouchHoldOrDrag(e, hit);
      return;
    }

    if (hit.kind === "pile") startPileDrag(e, hit.pile);
    else startTokenDrag(e, hit.tokenId, hit.kind, hit.el);
  });
}

const TOUCH_HOLD_MS = 450; // これ以上動かさずに押さえ続けたら「長押し」＝プレビュー表示
const TOUCH_HOLD_MOVE_CANCEL_PX = 10; // これ以上動いたら長押しをやめて通常のドラッグに切り替える

function startTouchHoldOrDrag(e, hit) {
  const startX = e.clientX;
  const startY = e.clientY;
  let settled = false; // ドラッグ開始・タイムアウト・指離しのいずれかが起きたらtrue
  let peeking = false;

  function cleanupListeners() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }
  function releaseAbortSlot() {
    if (activeSingleTouchAbort === abort) activeSingleTouchAbort = null;
  }

  const timer = setTimeout(() => {
    if (settled) return;
    settled = true;
    peeking = true;
    updateHover(startX, startY); // 既存のホバー処理（ハイライト＋拡大プレビュー）をそのまま流用
  }, TOUCH_HOLD_MS);

  function onMove(ev) {
    if (settled) return;
    const dx = ev.clientX - startX;
    const dy = ev.clientY - startY;
    if (Math.hypot(dx, dy) < TOUCH_HOLD_MOVE_CANCEL_PX) return;
    settled = true;
    clearTimeout(timer);
    cleanupListeners();
    // 長押し判定より先に指が動いた＝ドラッグとして開始する（このmoveイベント分もすぐに反映する）。
    if (hit.kind === "pile") startPileDrag(e, hit.pile);
    else startTokenDrag(e, hit.tokenId, hit.kind, hit.el);
    onDragMove(ev);
  }

  function onUp() {
    clearTimeout(timer);
    cleanupListeners();
    if (peeking) {
      clearHover();
      updatePreview(null);
    }
    settled = true;
    releaseAbortSlot();
  }

  // 2本目の指が触れてピンチズーム(initCameraControls)が始まった時に外部から呼ばれる中断関数。
  // まだ待機中/プレビュー中ならそのまま安全に打ち切り、既にドラッグへ昇格していれば
  // cancelDragSession()で位置を戻す（ピンチはほぼ一瞬で2本目が触れるため、大抵は
  // ドラッグへ昇格する前=待機中のうちに打ち切れる）。
  function abort() {
    clearTimeout(timer);
    cleanupListeners();
    if (peeking) {
      clearHover();
      updatePreview(null);
    }
    if (dragSession) cancelDragSession();
    settled = true;
    releaseAbortSlot();
  }
  activeSingleTouchAbort = abort;

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function createGhost(kind, tokenId) {
  const token = getState().tokens.find((t) => t.id === tokenId);
  if (kind === "piece") {
    // 駒はドラッグ中も立方体のまま見せる。3D空間の外(document.body直下)に置くゴーストでも
    // 見た目を保てるよう、perspective+盤面と同じ傾きを与えた入れ子(outer/inner)の中に
    // 本物の.pieceを丸ごと入れる（buildCubePieceをそのまま再利用）。
    const outer = document.createElement("div");
    outer.className = "drag-ghost drag-ghost-piece-outer";
    const inner = document.createElement("div");
    inner.className = "drag-ghost-piece-inner";
    const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
    inner.style.transform = `rotateX(${tilt})`;
    inner.appendChild(buildCubePiece(token.color, token.player));
    outer.appendChild(inner);
    document.body.appendChild(outer);
    return outer;
  }

  const ghost = document.createElement("div");
  // ドラッグ元のDOMクラス（.is-self等）に頼ると、手札の外(.board-card)から拾った場合に
  // 対応するクラスが無くて判定を誤るため、必ずstateの実データ(faceUp)を見て決める。
  const faceClass = token && token.faceUp ? "is-self" : "is-facedown";
  ghost.className = `hand-card ${faceClass} drag-ghost`;
  const imagePath = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
  ghost.style.backgroundImage = `url("${imagePath}")`;
  document.body.appendChild(ghost);
  return ghost;
}

function positionGhost(ghost, clientX, clientY) {
  // ハマりどころ: ゴーストは3D空間の外(document.body直下)に置いているため、盤面拡大時に
  // #game-tableへ適用されるscale3d()の影響を受けず、拡大した盤面上の駒/カードに対して
  // ゴーストだけ小さいまま（相対的に「すごく小っちゃい」）に見えるバグがあった。
  // translate(-50%,-50%)の後にscale3d()を続けることで、カーソル位置を中心にしたまま
  // 盤面と同じ倍率で見た目のサイズだけを合わせる（percentageのtranslateは変形前の
  // レイアウトサイズが基準のため、この順序でも位置がズレない）。
  // ステージ方式導入により、ghostはbody（ステージ）に対してfixedになったため、
  // clientX/clientY（常に実画面座標）をステージのローカル座標に変換してから使う。
  const local = stageClientToLocal(clientX, clientY);
  ghost.style.transform = `translate(${local.x}px, ${local.y}px) translate(-50%, -50%) scale3d(${currentTableScale}, ${currentTableScale}, ${currentTableScale})`;
}

function startTokenDrag(e, tokenId, kind, sourceEl) {
  const ghost = createGhost(kind, tokenId);
  positionGhost(ghost, e.clientX, e.clientY);
  // ドラッグ中は元の場所の実体を隠す（ゴーストと二重に見えたり、掴んでいるはずのカードが
  // 手札に残ったまま見えたりしないようにするため）。dropの成否にかかわらず必ずrender()で
  // DOMが作り直されるので、明示的に元に戻す処理は不要。
  sourceEl.style.visibility = "hidden";
  // 自分・相手を問わず、手札のカードを掴んだ瞬間に「抜き取る」効果音を鳴らす。
  const draggedToken = getState().tokens.find((t) => t.id === tokenId);
  if (draggedToken && draggedToken.kind === "card" && draggedToken.location.zone === "hand") {
    playSound("cardDraw");
  }
  dragSession = { tokenId, kind, ghost, pileSource: null, highlightEl: null };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  updateDropHighlight(e.clientX, e.clientY);
}

function startPileDrag(e, pileKey) {
  const pileArray = getState().piles[pileKey];
  if (pileArray.length === 0) {
    // 「1枚ドロー」ボタンはensureDeckAvailable()経由で山札切れ時に補充確認モーダルを出すが、
    // 山札を直接ドラッグして引こうとした時はこのガードで即座に抜けるだけで、モーダルが
    // 一切出ないまま「掴んでも何も起きない」だけの挙動になっていた（ユーザー報告のバグ）。
    // 山札(deck)が対象の時だけ、ここでも同じ補充確認を出す（捨て場も空なら何もしない）。
    if (pileKey === "deck") ensureDeckAvailable(() => {});
    return;
  }
  const topCardId = pileArray[pileArray.length - 1];
  const ghost = document.createElement("div");
  // 捨て場は表向きに積まれている（ルール通り）ので一番上のカードの実物画像を、
  // 山札・エターナルは裏向き積みなので裏面画像をゴーストに表示する。
  if (pileKey === "discard") {
    ghost.className = "hand-card is-self drag-ghost";
    ghost.style.backgroundImage = `url("${getCardImagePath(topCardId)}")`;
  } else {
    ghost.className = "hand-card is-facedown drag-ghost";
    ghost.style.backgroundImage = `url("${getCardBackImagePath(topCardId)}")`;
  }
  document.body.appendChild(ghost);
  positionGhost(ghost, e.clientX, e.clientY);
  // 山札から掴んだ瞬間にも「抜き取る」効果音を鳴らす（捨て場・エターナル等からは対象外）。
  if (pileKey === "deck") playSound("cardDraw");
  dragSession = { tokenId: null, kind: "card", ghost, pileSource: pileKey, highlightEl: null };
  document.body.style.userSelect = "none";
  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragEnd);
  updateDropHighlight(e.clientX, e.clientY);
}

function onDragMove(e) {
  if (!dragSession) return;
  positionGhost(dragSession.ghost, e.clientX, e.clientY);
  updateDropHighlight(e.clientX, e.clientY);
}

// ピンチズーム開始等、ドラッグを「ドロップ」ではなく「無かったことにして」打ち切りたい時に
// 呼ぶ。onDragEnd()と違い、どこにも移動させず（stateは一切変更せず）ゴースト・ハイライトの
// 後始末だけ行い、render()で元の状態に戻す。
function cancelDragSession() {
  if (!dragSession) return;
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  if (dragSession.highlightEl) dragSession.highlightEl.classList.remove("drop-target-active");
  dragSession.ghost.remove();
  document.body.style.userSelect = "";
  dragSession = null;
  render();
}

// ドラッグ中、今離すとどこに置かれるかを光らせて示す。findDropTarget()が返す実際の
// 対象要素(el)に.drop-target-activeクラスを付け外しするだけなので、レイアウトには影響しない。
function updateDropHighlight(clientX, clientY) {
  const result = findDropTarget(clientX, clientY, dragSession.kind);
  const nextEl = result ? result.el : null;
  if (dragSession.highlightEl === nextEl) return;
  if (dragSession.highlightEl) dragSession.highlightEl.classList.remove("drop-target-active");
  if (nextEl) nextEl.classList.add("drop-target-active");
  dragSession.highlightEl = nextEl;
}

function findDropTarget(clientX, clientY, kind) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    // 盤面マス／ロックスロットは駒・カード共通の移動先（ルール適用なしの自由配置のため）。
    const cell = el.closest(".cell");
    if (cell) return { location: { zone: "cell", row: Number(cell.dataset.row), col: Number(cell.dataset.col) }, el: cell };
    const lockSlot = el.closest(".lock-slot");
    if (lockSlot) {
      return {
        location: { zone: "lock", side: lockSlot.dataset.side, index: Number(lockSlot.dataset.index) },
        el: lockSlot,
      };
    }
    if (kind === "card") {
      const handArea = el.closest(".hand-area");
      if (handArea) return { location: { zone: "hand", player: handArea.dataset.player }, el: handArea };
      // 手札公開エリア: 手札のカードをここへドラッグすると「宣言」として表向きに公開できる
      // （手札効果の使用を宣言する時などに活用、location.zone:"publicDraw"はDRAW_FROM_PILE
      // 由来の「公開ドロー」と共有。state.jsのMOVE_TOKENケースがrevealSource:"manual"を
      // 自動で付与し、公開ドローと視覚的に区別する）。
      const handRevealArea = el.closest(".hand-reveal-area");
      if (handRevealArea) {
        return { location: { zone: "publicDraw", player: handRevealArea.dataset.player }, el: handRevealArea };
      }
      const pileZone = el.closest(".pile-zone");
      if (pileZone) {
        // ハイライトは.pile-zone（グリッド上の枠、実際の山より大きくズレて見える）ではなく、
        // 実際に見えている山(.stack)自体に付ける。サイズ・位置とも見た目と一致する。
        const stackEl = pileZone.querySelector(".stack") || pileZone;
        return { location: { zone: "pile", pile: pileZone.dataset.pile }, el: stackEl };
      }
    }
  }
  return null;
}

// カードがロックエリアへ動いた時のロック演出（柱状のオーラ流用＋ロックスタンプの拡大登場＋
// 効果音）は、新しくロックした時だけでなく、ロックエリア同士の移動（別のロックスロットへ
// 動かした時）でも出す（ユーザー要望）。ただし「ロックした」トーストは新しくロックエリアに
// 入った瞬間だけに絞る（wasAlreadyLocked=trueならロックエリア内/間の移動なので対象外。
// 既に公開済みの情報を動かしただけで、トーストで再度知らせる必要は無いため）。白黒（無色）
// カードをロックエリアへ「置く」ことはルール上ロックしたことにはならない
// （docs/cards.mdの黒カード補足参照）ため、トースト・演出とも対象外とする。ロック演出は
// そのマスのDOM要素（render()済みであること）が必要なため、この関数はrender()の後に呼ぶこと。
function maybeAnnounceLock(dropTarget, cardId, wasAlreadyLocked) {
  if (!dropTarget || dropTarget.zone !== "lock") return;
  const def = getCardDefinition(cardId);
  if (!def || def.color === "white" || def.color === "black") return;
  if (!wasAlreadyLocked) {
    const player = SIDE_TO_SEAT[dropTarget.side];
    announceCardLocked(player, cardId);
  }
  triggerLockEffect(cardId, dropTarget);
}

// 最後のロック承認バナー（final-lock-approval.js）の承認/却下ボタンから呼ばれる。
// オンライン中は、演出（ロックの光の柱等）を自分で手動発火せず、remote-move-animator.js
// （subscribe()経由で全クライアント共通、自分自身の操作も含めて動く）に任せる——他の
// 承認者が最後の承認をした場合、この演出は「自分の操作」ではなく「サーバーから届いた
// 変化」として検知される必要があるため、自分が最後の承認者だった場合も同じ経路に
// 統一する（自分だけ特別扱いすると二重発火・見た目の不一致が起きるリスクがある）。
// ローカルモードはremote-move-animator.jsが動かない（isOnlineMode()で早期returnする設計）
// ため、ここで直接演出を発火する必要がある。
async function respondToFinalLock(approve) {
  const pendingBefore = getState().pendingFinalLock;
  if (!pendingBefore) return;
  if (isOnlineMode()) {
    try {
      await respondFinalLock(approve);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("respondFinalLock failed", err);
    }
    render();
    return;
  }
  respondFinalLock(approve);
  render();
  if (approve && !getState().pendingFinalLock) {
    const movedToken = getState().tokens.find((t) => t.id === pendingBefore.tokenId);
    if (movedToken) {
      playSound("cardPlace");
      maybeAnnounceLock(pendingBefore.location, movedToken.cardId, false);
    }
  }
}

async function onDragEnd(e) {
  if (!dragSession) return;
  const { tokenId, kind, ghost, pileSource, highlightEl } = dragSession;
  ghost.remove();
  if (highlightEl) highlightEl.classList.remove("drop-target-active");
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragEnd);
  document.body.style.userSelect = "";

  const dropResult = findDropTarget(e.clientX, e.clientY, kind);
  const dropTarget = dropResult ? dropResult.location : null;
  dragSession = null;

  // 移動前の位置を覚えておく（moveToken/sendTokenToPile等で状態が書き換わる前に取得する
  // 必要がある）。カードが盤面/ロックスロットから離れた結果、駒の下で新しいカードが
  // 露出するケースの「到達」判定（maybeTriggerCardArrivalForExposedCard）に使う。以前は
  // kind==="card"の時だけ計算していたが、下の「移動元と移動先が同じ場合はmoveToken
  // 自体を呼ばない」ガードでkindを問わず使うようになったため、駒も含めて常に計算する
  // （呼び出し側は従来通りkind==="card"の時だけこの値を使うため、駒については実質
  // 無害な追加計算が増えるだけ）。
  const cardSourceLocation = getState().tokens.find((t) => t.id === tokenId)?.location ?? null;

  if (pileSource) {
    // 山からは手札だけでなく盤面マス・ロックスロットへも直接置ける（ルール適用なしの自由な
    // 移動のため）。ただし山(pile)自体へは置けない——山は個々のカードを保持せず残り枚数
    // だけを持つ構造なので、"zone: pile"を新しいカードの置き場所にはできない。
    // ロック演出はそのマスのDOM要素が必要なため、render()の後で呼ぶ（lockAnnounceCardIdに
    // 一旦覚えておく）。
    let lockAnnounceCardId = null;
    if (dropTarget && dropTarget.zone !== "pile") {
      if (isOnlineMode()) {
        // オンライン対戦では山の中身はサーバーにしか無い（so7_game_piles_visibleは
        // deck/eternal/firstの中身を一切返さない）ため、ローカル版のような「先読み」は
        // できない。drawFromPile()（オンライン中はEdge Functionを呼ぶtransportを返す）の
        // 応答を待ち、実際に引けたカードをそこから受け取る。
        const handBeforeForPileDrop =
          dropTarget.zone === "hand"
            ? new Set(
                getState()
                  .tokens.filter((t) => t.location.zone === "hand" && t.location.player === dropTarget.player)
                  .map((t) => t.id)
              )
            : null;
        let result = null;
        try {
          result = await drawFromPile(pileSource, dropTarget);
        } catch (err) {
          console.error("drawFromPile failed", err);
          render();
          return;
        }
        const revealedCardId = result?.revealedCardId ?? null;
        if (dropTarget.zone === "hand") {
          if (revealedCardId) {
            announceHandPickups(dropTarget.player, [{ cardId: revealedCardId, wasPublic: pileSource === "discard" }]);
          }
          // 山からの直接ドロー(手札行き)も、remote-move-animator.jsの差分検知が「新規出現」
          // として拾うようになった（相手プレイヤーへのカード獲得通知を出すため）。自分自身の
          // 操作を二重に通知しないよう、新しいトークンを特定して処理済みマークする。
          try {
            await fetchAndHydrate(getCurrentGameId());
          } catch (err) {
            console.error("fetchAndHydrate failed", err);
            render();
            return;
          }
          markSelfHandled(findNewHandTokenIds(dropTarget.player, handBeforeForPileDrop));
          return;
        }
        // 盤面マス/ロックスロットへの直接ドローはレスポンスにcardIdが含まれない
        // （サーバーは手札行き以外の場合、山の中身を教えない）ため、fetchAndHydrate()で
        // 再同期してから、実際に置かれた新しいトークンをgetState()経由で見つける必要がある
        // （これをしないと、以前は再同期前の古いgetState()を使ってしまい、演出判定が
        // 正しく行われなかった）。
        try {
          await fetchAndHydrate(getCurrentGameId());
        } catch (err) {
          console.error("fetchAndHydrate failed", err);
          render();
          return;
        }
        const drawnToken = findTopCardAt(dropTarget);
        if (drawnToken) {
          markSelfHandled([drawnToken.id]);
          playSound("cardPlace");
          lockAnnounceCardId = drawnToken.cardId;
        }
      } else {
        // drawFromPile()が山の中身を書き換えてしまう前に、一番上のカードを確認しておく
        // （捨て場からの取得は元々表向きに積まれている＝公開情報、山札/エターナル/ファーストは
        // 裏向き積み＝非公開情報として扱う）。
        const pileArray = getState().piles[pileSource];
        const cardId = pileArray.length > 0 ? pileArray[pileArray.length - 1] : null;
        if (dropTarget.zone === "hand") {
          if (cardId) {
            const player = dropTarget.player;
            drawFromPile(pileSource, dropTarget);
            announceHandPickups(player, [{ cardId, wasPublic: pileSource === "discard" }]);
            render();
            return;
          }
        } else {
          drawFromPile(pileSource, dropTarget);
          if (cardId) {
            playSound("cardPlace");
            lockAnnounceCardId = cardId;
          }
        }
      }
    }
    render(); // 引けた場合も引けなかった場合も、必ず再描画する（drawFromPile後にrenderし忘れると
    // 状態は更新済みなのに画面に反映されず、次に別の操作でrender()が走った時にまとめて
    // 反映されたように見えるバグになる。これが実際に起きていたので、必ずここで呼ぶ）。
    if (lockAnnounceCardId) {
      maybeAnnounceLock(dropTarget, lockAnnounceCardId, false);
      const topToken = findTopCardAt(dropTarget);
      if (topToken) maybeTriggerCardArrivalForCard(dropTarget, topToken.cardId, topToken.faceUp);
    }
    return;
  }

  if (!dropTarget) {
    render();
    return;
  }
  // 接触（ユーザー要望「接触処理の自動化」、main.js冒頭の接触関連コードのコメント参照）:
  // 自分の駒を隣の相手の駒がいるマスへドロップした場合、実際には移動させず（moveTokenを
  // 呼ばない＝駒は元のマスのまま）、代わりに「接触する」ボタンを出す。isAdjacentCell()は
  // cardSourceLocation（このドラッグが始まる前の駒の位置）を基準にするため、遠くの
  // マスへ相手の駒を跨いで動かした場合（隣接していない）は対象外——その場合は下の
  // 通常のmoveTokenにフォールスルーし、従来通り自由に重ねて置ける（Phase1方針
  // 「ルール適用は一切しない」）。
  if (kind === "piece" && dropTarget.zone === "cell" && cardSourceLocation?.zone === "cell" && isAdjacentCell(cardSourceLocation, dropTarget)) {
    const draggedToken = getState().tokens.find((t) => t.id === tokenId);
    const opponentPiece = getState().tokens.find(
      (t) =>
        t.kind === "piece" &&
        t.location.zone === "cell" &&
        t.location.row === dropTarget.row &&
        t.location.col === dropTarget.col &&
        t.player !== draggedToken?.player
    );
    if (draggedToken && opponentPiece) {
      render(); // moveTokenを呼んでいないので、駒は自動的に元の位置のまま描かれる(=見た目のスナップバック)
      showContactPrompt(draggedToken.player, opponentPiece.player, opponentPiece.id);
      return;
    }
  }
  if (dropTarget.zone === "pile") {
    if (isOnlineMode()) {
      // オンライン中はsendTokenToPile()がローカルstateを書き換えず、サーバーへの
      // リクエストのPromiseを返すだけ（onDragEnd冒頭のdrawFromPileと同じ考え方）。
      // 捨てたカードがサイレントに元に戻って見えるバグを防ぐため、必ず再同期する。
      try {
        await sendTokenToPile(tokenId, dropTarget.pile);
        markSelfHandled([tokenId]);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("sendTokenToPile failed", err);
      }
    } else {
      sendTokenToPile(tokenId, dropTarget.pile);
    }
  } else {
    // 手札に「新しく」加わる時（今までは手札に無かった、または別プレイヤーの手札から移ってきた
    // 時）だけ、何を得たか知らせるポップアップを出す。同じ手札の中で位置を動かしただけの時は
    // 対象外。
    if (dropTarget.zone === "hand") {
      const token = getState().tokens.find((t) => t.id === tokenId);
      const alreadyInThisHand = token && token.location.zone === "hand" && token.location.player === dropTarget.player;
      if (token && !alreadyInThisHand) {
        const wasPublic = token.location.zone === "cell" || token.location.zone === "lock" ? token.faceUp : false;
        const cardId = token.cardId; // hydrate後にtokenが古い参照になるため先に捕捉しておく
        if (isOnlineMode()) {
          try {
            await moveToken(tokenId, dropTarget);
            markSelfHandled([tokenId]);
            await fetchAndHydrate(getCurrentGameId());
          } catch (err) {
            console.error("moveToken failed", err);
            render();
            return;
          }
        } else {
          moveToken(tokenId, dropTarget);
        }
        announceHandPickups(dropTarget.player, [{ cardId, wasPublic }]);
        render();
        maybeTriggerCardArrivalForExposedCard(cardSourceLocation);
        return;
      }
    }
    // 最後のロック承認（ユーザー要望）: このカードをロックすると、そのロックエリアの
    // 持ち主が7色すべて揃って勝利になる場合、通常のmoveTokenを呼ばず、他の参加プレイヤー
    // 全員（左隣から時計回り）の承認を待つ専用フローへ切り替える。既に別の承認待ちが
    // 進行中の場合は二重に開始しない（その場合は通常通りreturnせずフォールスルーする
    // ことはない——下の通常処理に進んでしまうと承認無しでロックできてしまうため、
    // ここでは「進行中なら何もしない」を明示的にreturnする）。
    if (kind === "card" && dropTarget.zone === "lock") {
      if (getState().pendingFinalLock) {
        render();
        return;
      }
      const ownerSeat = SIDE_TO_SEAT[dropTarget.side];
      if (ownerSeat && wouldCompleteLockWithNewIndex(ownerSeat, dropTarget.index)) {
        const queue = getFinalLockApprovalOrder(ownerSeat, getState().activePlayers);
        if (queue.length > 0) {
          if (isOnlineMode()) {
            try {
              await requestFinalLock(tokenId, dropTarget, ownerSeat, queue);
              await fetchAndHydrate(getCurrentGameId());
            } catch (err) {
              console.error("requestFinalLock failed", err);
            }
          } else {
            requestFinalLock(tokenId, dropTarget, ownerSeat, queue);
          }
          render();
          return;
        }
        // 承認すべき他の参加プレイヤーがいない（1人でのテストプレイ等）場合は、承認不要で
        // そのまま通常通りロックする（このifブロックを素通りし、下の既存処理へ進む）。
      }
    }
    // ドラッグ元と移動先が完全に同じ場所（クリックしただけで実際には動かしていない）
    // 場合は、moveToken自体を呼ばない（重要・オンラインでのダブルクリック不具合の
    // 根本原因）。以前はここで無条件にmoveTokenを呼んでいたため、盤面のカードを普通に
    // クリックしただけ（＝ダブルクリックでめくろうとした時の1回目のクリックも含む）でも
    // 「同じ場所への移動」という実質no-opのオンライン同期リクエストが毎回発生していた。
    // ダブルクリックでは、1回目のクリックが発生させるこのno-opなmoveTokenのサーバー
    // 往復（バージョン管理されたso7_apply_and_commit経由）と、2回目のクリックが発生させる
    // flipTokenの往復が短い間隔で連続することになり、後から届いた方がversion_conflictで
    // 静かに失敗する（コンソールにエラーが出るだけで、ユーザーには何も表示されない）
    // ことがあった——ローカルモードでは該当する競合の仕組み自体が無いため再現しなかった
    // （ユーザー報告「オンラインでは裏向きカードをダブルクリックで開けないが、ローカルでは
    // できる」の根本原因と判断）。
    const isSameLocation =
      cardSourceLocation &&
      cardSourceLocation.zone === dropTarget.zone &&
      (dropTarget.zone === "cell"
        ? cardSourceLocation.row === dropTarget.row && cardSourceLocation.col === dropTarget.col
        : cardSourceLocation.side === dropTarget.side && cardSourceLocation.index === dropTarget.index);
    if (isSameLocation) {
      render();
      return;
    }
    const token = getState().tokens.find((t) => t.id === tokenId);
    const wasAlreadyLocked = !!token && token.location.zone === "lock";
    if (isOnlineMode()) {
      // オンライン中はmoveToken()がローカルstateを書き換えないため、awaitせずすぐ
      // render()・演出関数を呼ぶと移動前の古い状態のまま判定してしまい、到達演出・
      // ロック演出・効果音が正しく発火しない（発火してもズレたデータで発火する）
      // バグになっていた。応答を待ち、fetchAndHydrate()で明示的に再同期してから続ける。
      try {
        await moveToken(tokenId, dropTarget);
        markSelfHandled([tokenId]);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("moveToken failed", err);
        render();
        return;
      }
    } else {
      moveToken(tokenId, dropTarget);
    }
    if (kind === "card") playSound("cardPlace");
    if (kind === "piece") playSound("piecePlace");
    render();
    // 到達プロンプト/モーダル・ロック演出の位置決めに実際のDOM座標(getBoundingClientRect)を
    // 使うため、どちらもrender()で盤面を描き直した後でなければ呼べない。
    if (token) maybeAnnounceLock(dropTarget, token.cardId, wasAlreadyLocked);
    if (kind === "piece") maybeTriggerCardArrival(dropTarget, tokenId);
    if (kind === "card") {
      const movedToken = getState().tokens.find((t) => t.id === tokenId);
      if (movedToken) maybeTriggerCardArrivalForCard(dropTarget, movedToken.cardId, movedToken.faceUp);
      // 移動元と移動先が同じ場合は、上のisSameLocationガードで既にreturn済みのため、
      // ここに到達する時点で移動元と移動先は必ず異なる（重なりの中で並び替えただけ、
      // という「同じマスへ移動」のケースは、そもそもここまで到達しない）。
      maybeTriggerCardArrivalForExposedCard(cardSourceLocation);
    }
    return;
  }
  render();
  if (kind === "card") maybeTriggerCardArrivalForExposedCard(cardSourceLocation);
}

// --- オンライン対戦（第一弾・最小構成）の入り口 -------------------------------------
// 以前は右上に独立した「🌐」テキストボタンだったが、ユーザー要望により左下の自分専用
// ステータスエリア（#self-hand-status、buildSelfHandStatus参照）内へ統合し、状態を
// アイコン画像（ログアウト中/ログイン中/入室中の3種）で表現するようにした。
let selfStatusOnlineEl = null;
let selfStatusOnlineCaptionEl = null;
let selfStatusOnlineTooltipEl = null;

const ONLINE_STATUS_ICONS = {
  loggedOut: "assets/icons/status-logged-out.svg",
  loggedIn: "assets/icons/status-logged-in.svg",
  inRoom: "assets/icons/status-in-room.svg",
};

function buildSelfStatusOnlineWidget() {
  const btn = document.createElement("button");
  btn.id = "self-status-online";
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, {
    icon: ONLINE_STATUS_ICONS.loggedOut,
    tooltip: "",
  });
  selfStatusOnlineCaptionEl = captionEl;
  selfStatusOnlineTooltipEl = tooltipEl;
  wireIconButtonClick(btn, {
    detailTitle: "オンライン対戦",
    detailParagraphs: [
      "ログインすると、離れた場所にいる友達と部屋を作って対局できます（ログアウト中/ログイン中/入室中の3つの状態をアイコンで表します）。",
      "入室中は、アイコンの下に部屋名が小さく表示されます。クリックすると部屋の詳細（参加人数・退室等）を開けます。",
    ],
    onAction: openOnlinePanel,
  });
  selfStatusOnlineEl = btn;
  return btn;
}

// 部屋名は改名不可（作成時に固定）なので、gameIdごとに1回だけ取得してキャッシュする
// （render()のたびに呼ばれるupdateSelfStatusOnlineWidget()から毎回DB問い合わせしないため）。
let cachedRoomNameGameId = null;
let cachedRoomName = null;

// ログイン中かどうか・どの部屋にいるかを、パネルを開かなくてもアイコン+キャプションだけで
// さりげなく分かるようにする。部屋名の表示は非同期取得のため、取得できるまでは部屋コードを
// 暫定表示し、取得でき次第キャプションを差し替える。
function updateSelfStatusOnlineWidget() {
  if (!selfStatusOnlineEl) return;
  const img = selfStatusOnlineEl.querySelector(".icon-action-button-icon-img");
  const gameId = getCurrentGameId();
  if (gameId) {
    img.src = ONLINE_STATUS_ICONS.inRoom;
    selfStatusOnlineTooltipEl.textContent = "オンライン対戦中です。クリックで部屋の詳細を開きます";
    if (cachedRoomNameGameId === gameId) {
      selfStatusOnlineCaptionEl.textContent = cachedRoomName;
    } else {
      selfStatusOnlineCaptionEl.textContent = gameId;
      getRoomName(gameId)
        .then((name) => {
          cachedRoomNameGameId = gameId;
          cachedRoomName = name;
          updateSelfStatusOnlineWidget();
        })
        .catch(() => {});
    }
  } else if (getCachedUser()) {
    img.src = ONLINE_STATUS_ICONS.loggedIn;
    selfStatusOnlineTooltipEl.textContent = "ログイン中です。クリックでオンライン対戦の部屋一覧を開きます";
    selfStatusOnlineCaptionEl.textContent = "ログイン中";
  } else {
    img.src = ONLINE_STATUS_ICONS.loggedOut;
    selfStatusOnlineTooltipEl.textContent = "オンライン対戦を始めるにはログインしてください";
    selfStatusOnlineCaptionEl.textContent = "オンライン";
  }
}

// --- ターンを次のプレイヤーへ渡すボタン ---------------------------------------------
// セットアップウィザードの手順3でスタートプレイヤーが決まって初めて意味を持つ操作なので、
// state.turnPlayerがまだnullの間は非表示にする。プレイヤー自身が操作するボタンなので、
// 管理者モード等の開発者向けツール（左上/右上）とは離し、画面右下に置く。
let endTurnButtonEl = null;
let endTurnTooltipEl = null;

function buildEndTurnButton() {
  const btn = document.createElement("button");
  btn.id = "end-turn-button";
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/end-turn.svg",
    tooltip: "",
  });
  captionEl.textContent = "ターン終了";
  endTurnTooltipEl = tooltipEl;
  wireIconButtonClick(btn, {
    detailTitle: "ターン終了",
    detailParagraphs: [
      "自分のターンを終え、次のプレイヤーへ手番を渡します。",
      "相手のゲートに自分の駒が乗っている場合、ターン終了時に「相手ゲート侵攻ボーナス」が自動的に処理されます。",
    ],
    onAction: () => {
      // オンライン中、自分の手番でない間はupdateEndTurnButton()側でdisabled=trueに
      // しているはずだが、念のためここでも二重にガードする（他人のターンを勝手に
      // 終了させられてしまうバグの再発防止）。
      if (isOnlineMode() && getSelfSeat() !== getState().turnPlayer) return;
      // ゲート侵攻ボーナス(GATE_INVASION_*)は、so7-apply-action.ts側でNEXT_TURN処理に
      // 統合済み（サーバー側で自動判定・自動適用される）。オンライン中にrunGateInvasionsIfNeeded()
      // を呼ぶとローカルだけに二重適用されサーバーの状態と食い違ってしまうため、
      // オンライン中はnextTurn()だけを直接呼ぶ。
      if (isOnlineMode()) {
        nextTurn();
        return;
      }
      // 侵攻条件を満たしている参加プレイヤーが誰もいなければrunGateInvasionsIfNeededは
      // 即座にdone()を呼ぶだけなので、普段のターン終了と体感は変わらない。満たしていれば
      // （手番プレイヤー本人とは限らない。効果等で自分のターンでなくても相手ゲートに
      // 駒がいることはあり得るため、手番プレイヤーに限らず全参加プレイヤーを対象にする）
      // ボーナス処理の3つのポップアップが終わってから初めてnextTurn()が呼ばれる。
      runGateInvasionsIfNeeded(() => {
        nextTurn();
        render();
      });
    },
  });
  document.body.appendChild(btn);
  return btn;
}

function updateEndTurnButton() {
  if (!endTurnButtonEl) return;
  const turnPlayer = getState().turnPlayer;
  if (!turnPlayer) {
    endTurnButtonEl.style.display = "none";
    return;
  }
  endTurnButtonEl.style.display = "flex";
  // オンライン中は「今誰のターンか」を明示し、自分の手番でない間は押せないようにする
  // （以前は誰でも他人のターンを終了させられてしまっていた）。ローカルモードは
  // 1人で全座席を操作する前提のため、従来通り常に有効・宛先の座席名を表示する。
  // 動的な文言はキャプション（常に「ターン終了」固定）ではなく、ホバー時のツールチップへ
  // 表示するようにした（キャプションは他の右下ボタンと揃えて短く固定したいため）。
  if (isOnlineMode() && getSelfSeat() !== turnPlayer) {
    if (endTurnTooltipEl) endTurnTooltipEl.textContent = `今は${getPlayerName(turnPlayer)}のターン中です`;
    endTurnButtonEl.disabled = true;
  } else {
    if (endTurnTooltipEl) {
      endTurnTooltipEl.textContent = isOnlineMode() ? "自分のターンを終了します" : `${getPlayerName(turnPlayer)}のターンを終了します`;
    }
    endTurnButtonEl.disabled = false;
  }
}

// OKボタン1つだけのシンプルな確認モーダル（山札切れの補充確認に使う）。ゲームの状態に
// 関わる必須の確認のため、✕ボタンや外側クリックでは閉じられないようにしてある
// （他のパネル/モーダルの「✕＋外クリックで閉じる」統一ルールの、意図的な例外）。
function showConfirmModal(title, text, onOk) {
  const modal = document.createElement("div");
  modal.id = "confirm-modal";
  const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10001 });
  const titleEl = document.createElement("div");
  titleEl.className = "confirm-modal-title";
  titleEl.textContent = title;
  const bodyEl = document.createElement("div");
  bodyEl.className = "confirm-modal-body";
  bodyEl.textContent = text;
  const okBtn = document.createElement("button");
  okBtn.textContent = "OK";
  okBtn.className = "confirm-modal-ok";
  okBtn.addEventListener("click", () => {
    backdrop.remove();
    modal.remove();
    onOk();
  });
  modal.appendChild(titleEl);
  modal.appendChild(bodyEl);
  modal.appendChild(okBtn);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// 山札が空の状態で引こうとした時のルール（docs/rulebook.md「こんな時は」）:
// 「捨て場のカードをそのまま裏向きにして山札とする。シャッフルはしない。」
// 山札に残りがあれば何もせずすぐにonReady()を呼ぶ。空でも捨て場が空ならこれ以上引ける
// カードが無いので、確認モーダルを出さずそのままonReady()を呼ぶ（drawFromPile側が
// 空振りするだけで安全なため）。
function ensureDeckAvailable(onReady) {
  const state = getState();
  if (state.piles.deck.length > 0 || state.piles.discard.length === 0) {
    onReady();
    return;
  }
  // REFILL_DECK_FROM_DISCARDはオンライン対戦（第一弾）にまだポートしていないため、
  // オンライン中はこの自動補充を行わない（山が本当に空ならサーバー側のDRAW_FROM_PILEが
  // 何もせず返してくるだけ）。
  if (isOnlineMode()) {
    onReady();
    return;
  }
  showConfirmModal(
    "山札が空になりました",
    "捨て場のカードをノーシャッフルで山札にします。",
    () => {
      refillDeckFromDiscard();
      render();
      onReady();
    }
  );
}

// --- 「盤面拡大」ボタン ----------------------------------------------------------
// 押すたびに 盤面拡大 → もっと拡大 → 元に戻す、と3段階を巡回する（これは「拡大率登録」が
// 未登録の間だけの、従来通りの挙動）。state.turnPlayerの有無に関係なく常に使える表示上の
// 機能なので、非表示にする条件は無い。
// マウスホイールでのズーム・中クリックドラッグでの視点移動（initCameraControls参照）を
// 一度でも使うと、このボタンは「元の画角に戻る」に切り替わる（アイコンも切り替わる、
// updateBoardZoomButtonLabel参照）。この状態の間だけ、その上に点滅する「拡大率登録」
// ボタン（buildBoardZoomRegisterButton）が現れ、押すと今の画角をlocalStorageに保存する。
// 一度登録すると、以後は通常表示から「盤面拡大」ボタンを押した瞬間に3段階サイクルの
// 代わりに登録した画角へ直接ジャンプするようになる（cycleBoardZoomは登録が無い間の
// フォールバック挙動として残している）。
const BOARD_ZOOM_LABELS = ["盤面拡大", "もっと拡大", "元に戻す"];

let boardZoomButtonEl = null;
let boardZoomTooltipEl = null;
let boardZoomIconImgEl = null;
let boardZoomRegisterButtonEl = null;

function updateBoardZoomButtonLabel() {
  const btn = boardZoomButtonEl;
  if (!btn) return;
  if (hasManualView) {
    if (boardZoomTooltipEl) boardZoomTooltipEl.textContent = "元の画角に戻る";
    if (boardZoomIconImgEl) boardZoomIconImgEl.src = DUMMY_ICON_RETURN_TO_VIEW;
    btn.classList.add("is-active");
    btn.classList.remove("is-zoom-2");
  } else {
    btn.classList.toggle("is-active", boardZoomLevel > 0);
    btn.classList.toggle("is-zoom-2", boardZoomLevel === 2);
    if (boardZoomTooltipEl) boardZoomTooltipEl.textContent = BOARD_ZOOM_LABELS[boardZoomLevel];
    if (boardZoomIconImgEl) boardZoomIconImgEl.src = "assets/icons/board-zoom.svg";
  }
  updateBoardZoomRegisterButtonPosition();
}

// 「拡大率登録」ボタンは、盤面拡大ボタン自体がドラッグ再配置（player-buttons.js/
// icon-rearrange.js）で動くことがあるため、固定オフセットではなく毎回
// getBoundingClientRect()から位置を計算し直す（そのすぐ上に浮かべる）。
function updateBoardZoomRegisterButtonPosition() {
  if (!boardZoomRegisterButtonEl || !boardZoomButtonEl) return;
  if (!hasManualView) {
    boardZoomRegisterButtonEl.style.display = "none";
    return;
  }
  boardZoomRegisterButtonEl.style.display = "flex";
  // getBoundingClientRect()は常に実画面座標なので、position:fixedな移動先の
  // style.left/topに使う前にステージのローカル座標へ変換する必要がある。
  const rect = toStageLocalRect(boardZoomButtonEl.getBoundingClientRect());
  boardZoomRegisterButtonEl.style.left = `${rect.left + (rect.right - rect.left) / 2}px`;
  boardZoomRegisterButtonEl.style.top = `${rect.top - 10}px`;
}

function buildBoardZoomButton() {
  const btn = document.createElement("button");
  btn.id = "board-zoom-button";
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/board-zoom.svg",
    tooltip: BOARD_ZOOM_LABELS[0],
  });
  captionEl.textContent = "盤面拡大";
  boardZoomTooltipEl = tooltipEl;
  boardZoomIconImgEl = btn.querySelector(".icon-action-button-icon-img");
  wireIconButtonClick(btn, {
    detailTitle: "盤面拡大",
    detailParagraphs: [
      "盤面全体をズームして見やすくします。まだ画角を登録していない間は、押すたびに「拡大」→「もっと拡大」→「元に戻す」の3段階を切り替えます。",
      "マウスホイールでの自由なズームや中クリックドラッグでの視点移動を一度でも使うと、代わりに「元の画角に戻る」ボタンに変わります。その間だけ現れる点滅した「拡大率登録」ボタンを押すと、今の画角を登録できます。登録後は、通常表示からこのボタンを押すと登録した画角へ一気に切り替わります。",
    ],
    onAction: () => {
      if (hasManualView) {
        resetManualView();
        boardZoomLevel = 0;
        fitTableToViewport();
        updateBoardZoomButtonLabel();
        return;
      }
      if (registeredBoardZoomView) {
        manualZoom = registeredBoardZoomView.zoom;
        manualPanX = registeredBoardZoomView.panX;
        manualPanY = registeredBoardZoomView.panY;
        hasManualView = true;
        fitTableToViewport();
        updateBoardZoomButtonLabel();
        return;
      }
      cycleBoardZoom();
      updateBoardZoomButtonLabel();
    },
  });
  document.body.appendChild(btn);
  return btn;
}

// 点滅して目立つ「拡大率登録」ボタン。手動でズーム/移動している間（hasManualView）だけ
// 「盤面拡大」ボタンの真上に浮かんで現れる。押すと今の画角(manualZoom/manualPanX/Y)を
// registeredBoardZoomViewとして保存する（再度押せば上書きできる）。
// アイコンは正式なものが用意でき次第差し替える仮のプレースホルダー。
function buildBoardZoomRegisterButton() {
  const btn = document.createElement("button");
  btn.id = "board-zoom-register-button";
  btn.style.display = "none";
  const { tooltipEl } = buildIconButtonContent(btn, {
    icon: DUMMY_ICON_REGISTER_VIEW,
    tooltip: "この画角を登録する［仮アイコン］",
  });
  // 小さなバッジ的な位置づけのボタンのため、キャプション文字（クリックで詳細説明を開く
  // 仕組み）は無し。ホバーの簡易説明だけで十分と判断した。
  btn.querySelector(".icon-action-button-caption")?.remove();
  btn.addEventListener("click", () => {
    saveRegisteredBoardZoomView({ zoom: manualZoom, panX: manualPanX, panY: manualPanY });
    btn.classList.add("is-just-registered");
    setTimeout(() => btn.classList.remove("is-just-registered"), 600);
  });
  document.body.appendChild(btn);
  return btn;
}

// マウスホイールでの自由なズームイン/アウトと、中クリック（ホイール押し込み）ドラッグでの
// 視点移動。「盤面拡大」ボタンの3段階トグルの上に、常にさらに上乗せする形で効く
// （manualZoom/manualPanX/Y、applyNormalFit/applyBoardZoomFit参照）。
function initCameraControls() {
  const scene = document.querySelector(".scene");
  if (!scene) return;

  scene.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      manualZoom = Math.min(4, Math.max(0.3, manualZoom * factor));
      hasManualView = true;
      fitTableToViewport();
      updateBoardZoomButtonLabel();
    },
    { passive: false }
  );

  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

  // 中クリックのデフォルト動作（ブラウザのオートスクロールモード等）を抑止する。
  scene.addEventListener("mousedown", (e) => {
    if (e.button === 1) e.preventDefault();
  });
  scene.addEventListener("auxclick", (e) => {
    if (e.button === 1) e.preventDefault();
  });

  scene.addEventListener("pointerdown", (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    panning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = manualPanX;
    panOriginY = manualPanY;
  });
  window.addEventListener("pointermove", (e) => {
    if (!panning) return;
    const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    // ステージ方式導入により、clientX/clientYの差分（常に実画面ピクセル）は、remに変換する
    // 前にステージのローカルピクセルへ変換する必要がある（stageDelta参照。オフセットは
    // 差分では打ち消し合うため、倍率で割るだけでよい）。
    manualPanX = panOriginX + stageDelta(e.clientX - panStartX) / rootFontSizePx;
    manualPanY = panOriginY + stageDelta(e.clientY - panStartY) / rootFontSizePx;
    hasManualView = true;
    fitTableToViewport();
    updateBoardZoomButtonLabel();
  });
  window.addEventListener("pointerup", (e) => {
    if (e.button === 1) panning = false;
  });

  // タブレット等でのピンチズーム（2本指）。ブラウザ標準のピンチズーム（ページ全体が拡縮され、
  // 固定配置のアイコン類まで一緒に動いてしまう）はindex.htmlのviewport meta
  // （maximum-scale=1.0, user-scalable=no）＋.sceneのtouch-action:noneで無効化済みのため、
  // ここでは.scene上の指の動きだけを見て、代わりにmanualZoomを直接動かす（マウスホイールと
  // 全く同じ入り口）。
  const activeTouches = new Map(); // pointerId -> {x, y}
  let pinchStartDist = null;
  let pinchStartZoom = 1;

  function touchDistance() {
    const pts = Array.from(activeTouches.values());
    if (pts.length < 2) return null;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  scene.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;
    const isSecondFinger = activeTouches.size >= 1 && !activeTouches.has(e.pointerId);
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (isSecondFinger) {
      // 2本指目が触れた＝ピンチ操作の開始とみなす。1本指用の長押しプレビュー/ドラッグ判定
      // (startTouchHoldOrDrag)が既に進行中なら安全に打ち切る（掴んだままピンチしても
      // 駒/カードが動いてしまわないようにするため）。
      if (activeSingleTouchAbort) activeSingleTouchAbort();
      pinchStartDist = null; // 次のmoveで改めて基準距離を取り直す
    }
  });
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType !== "touch" || !activeTouches.has(e.pointerId)) return;
    activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activeTouches.size !== 2) return;
    const dist = touchDistance();
    if (dist == null) return;
    if (pinchStartDist == null) {
      pinchStartDist = dist;
      pinchStartZoom = manualZoom;
      return;
    }
    manualZoom = Math.min(4, Math.max(0.3, pinchStartZoom * (dist / pinchStartDist)));
    hasManualView = true;
    fitTableToViewport();
    updateBoardZoomButtonLabel();
  });
  function releaseTouch(e) {
    if (e.pointerType !== "touch") return;
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) pinchStartDist = null;
  }
  window.addEventListener("pointerup", releaseTouch);
  window.addEventListener("pointercancel", releaseTouch);
}

// --- 「手札シャッフル」ボタン ------------------------------------------------------
// 自分(A)の手札の並び順をシャッフルする（カードの中身自体は変わらない、見た目上の
// 並び替え演出）。turnPlayerの有無に関係なく常に使える表示上の機能なので、非表示にする
// 条件は無いが、手札が0〜1枚（シャッフルしても見た目が変わらない）の間は押せなくする。
let handShuffleButtonEl = null;

function buildHandShuffleButton() {
  const btn = document.createElement("button");
  btn.id = "hand-shuffle-button";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/hand-shuffle.svg",
    tooltip: "自分の手札の並び順をシャッフルします（カードの中身は変わりません）",
  });
  captionEl.textContent = "手札シャッフル";
  wireIconButtonClick(btn, {
    detailTitle: "手札シャッフル",
    detailParagraphs: [
      "自分の手札の並び順だけをシャッフルします。カードの中身（持っている手札）自体は変わりません。",
      "相手に手の内を推測されにくくするための、見た目上の演出です。",
    ],
    onAction: () => {
      animateHandShuffle(getSelfSeat());
    },
  });
  document.body.appendChild(btn);
  return btn;
}

// 手札を中央に1束・裏向きにまとめる→その場で数枚が出たり入ったりする（シャッフルして
// いる感）→元の手札の状態（同じスロット位置、新しい並び）に戻る、という演出。手札の枚数が
// 変わらない限り扇の各スロット位置(layoutFan)自体はシャッフル前後で同じなので、「本物の
// カードを隠す→裏面画像だけのゴーストを旧スロット位置から中央へ集める→数枚だけその場で
// 出し入れする→shuffleHand()で実際の並びを変えてrender()→ゴーストを同じスロット位置へ
// 戻して本物を出す」という流れだけでよい。ゴーストは終始裏向き（束の中身は見せない）の
// ため、各カードの実際の絵柄を個別に持ち回す必要が無く、1枚の裏面画像を使い回せる。
async function animateHandShuffle(seat) {
  const fanEl = document.querySelector(`.hand-area[data-player="${seat}"] .hand-fan`);
  const cardEls = fanEl ? Array.from(fanEl.querySelectorAll(".hand-card")) : [];
  if (isFlightAnimationDisabled() || cardEls.length < 2) {
    shuffleHand(seat);
    playSound("handShuffle");
    render();
    return;
  }

  handShuffleButtonEl.disabled = true;

  const slotRects = cardEls.map((el) => el.getBoundingClientRect());
  const centerRect = slotRects[Math.floor(slotRects.length / 2)];
  cardEls.forEach((el) => {
    el.style.visibility = "hidden";
  });

  const backImage = getCardBackImagePath(null); // 自分の手札は常に通常カードのため裏面は1種類固定
  // ハマりどころ（ユーザー報告: シャッフル中の裏向きカードが上部だけ切れて見える）:
  // 自分の手札(.hand-card.is-self)はrotateX(-40deg)+translateZ(2.4rem)の強い3D傾きの中に
  // あるため、getBoundingClientRect()が返す幅/高さは「画面に投影された後の遠近感で
  // 縮んだ（本来は正方形なのに台形に見える）見た目のサイズ」であり、真の正方形ではない。
  // これをそのままゴースト（3D空間の外＝傾きの影響を受けない平面）の幅/高さに使うと、
  // 正方形の裏面画像をbackground-size:coverで敷いた時に非対称にトリミングされてしまう。
  // 位置決め(rectCenter)には引き続き投影後の座標が必要だが、サイズには
  // getComputedStyle()（3D変形前の、CSSで指定した本来の正方形サイズ）を使う。
  const slotSizes = cardEls.map((el) => {
    const cs = getComputedStyle(el);
    return { width: parseFloat(cs.width), height: parseFloat(cs.height) };
  });
  const ghosts = slotRects.map((rect, i) => {
    const g = document.createElement("div");
    g.className = "hand-shuffle-ghost";
    g.style.backgroundImage = `url("${backImage}")`;
    g.style.width = `${slotSizes[i].width}px`;
    g.style.height = `${slotSizes[i].height}px`;
    // rectCenter()はgetBoundingClientRect()由来の実画面座標を返すため、gはdocument.body直下
    // （ステージのtransformの影響下）に置く以上、ステージのローカル座標に変換してから使う。
    const fromReal = rectCenter(rect);
    const from = stageClientToLocal(fromReal.x, fromReal.y);
    g.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%)`;
    document.body.appendChild(g);
    return g;
  });

  const GATHER_MS = 320;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  const centerReal = rectCenter(centerRect);
  const to = stageClientToLocal(centerReal.x, centerReal.y);
  ghosts.forEach((g, i) => {
    // 少し重なりをずらして本物の束のように見せる（中央寄りほどズレが小さい）。
    const stackOffset = (i - (ghosts.length - 1) / 2) * 1.2;
    g.style.transition = `transform ${GATHER_MS}ms ease-in-out`;
    g.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) translate(${stackOffset}px, ${stackOffset}px)`;
  });
  await new Promise((resolve) => setTimeout(resolve, GATHER_MS + 30));

  playSound("handShuffle");

  // 束の中から数枚だけ、ずらしたタイミングでその場に軽くポップして戻る
  // （＝出し入れしている感）。全員一斉に震えるのではなく、一部だけ動くことで
  // 「触っている」印象を出す。
  const POP_MS = 500;
  const POP_STAGGER_MS = 130;
  const popIndices = [];
  const pool = ghosts.map((_, i) => i);
  const popCount = Math.min(4, pool.length);
  for (let i = 0; i < popCount; i++) {
    const j = Math.floor(Math.random() * pool.length);
    popIndices.push(pool.splice(j, 1)[0]);
  }
  popIndices.forEach((idx, order) => {
    const g = ghosts[idx];
    g.style.setProperty("--pop-delay", `${order * POP_STAGGER_MS}ms`);
    g.classList.add("is-popping");
  });
  const totalPopMs = POP_STAGGER_MS * (popCount - 1) + POP_MS;
  await new Promise((resolve) => setTimeout(resolve, totalPopMs));
  ghosts.forEach((g) => g.classList.remove("is-popping"));

  shuffleHand(seat);
  render();

  const newFanEl = document.querySelector(`.hand-area[data-player="${seat}"] .hand-fan`);
  const newCardEls = newFanEl ? Array.from(newFanEl.querySelectorAll(".hand-card")) : [];
  newCardEls.forEach((el) => {
    el.style.visibility = "hidden";
  });
  const newRects = newCardEls.map((el) => el.getBoundingClientRect());

  const RESTORE_MS = 320;
  ghosts.forEach((g, i) => {
    const targetReal = rectCenter(newRects[i] || centerRect);
    const target = stageClientToLocal(targetReal.x, targetReal.y);
    g.style.transition = `transform ${RESTORE_MS}ms ease-in-out`;
    g.style.transform = `translate(${target.x}px, ${target.y}px) translate(-50%, -50%)`;
  });
  await new Promise((resolve) => setTimeout(resolve, RESTORE_MS + 30));

  newCardEls.forEach((el) => {
    el.style.visibility = "";
  });
  ghosts.forEach((g) => g.remove());
  updateHandShuffleButton();
}

function updateHandShuffleButton() {
  if (!handShuffleButtonEl) return;
  const selfSeat = getSelfSeat();
  const handCount = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === selfSeat
  ).length;
  // 公開ドローで引いたカードが残っている間は、実際にシャッフルする意味が無い枚数
  // （手札0〜1枚）でも押せるようにする——押すと公開ドロー分が手札へ合流するため。
  const hasPendingPublicDraw = getState().tokens.some(
    (t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === selfSeat
  );
  handShuffleButtonEl.disabled = handCount < 2 && !hasPendingPublicDraw;
}

// --- ゲームタイトル表示 -----------------------------------------------------------
// 画面左上（以前は「⚙ 管理者モード」ボタンがあった場所。オプションメニューに統合して
// 空いたスペースにタイトルを表示する）。
function buildGameTitle() {
  const el = document.createElement("div");
  el.id = "game-title";
  el.textContent = "7 SHADES OF S:EVEN remake";
  document.body.appendChild(el);
  return el;
}

// --- スポットライトモードの暗幕オーバーレイ ------------------------------------------
// 実際の明るさ切り替えはCSS（body.spotlight-modeクラスの有無、style.css参照）が担当する。
// ここでは要素をDOMに1つ作るだけでよい。
function buildSpotlightOverlay() {
  const el = document.createElement("div");
  el.id = "spotlight-overlay";
  document.body.appendChild(el);
  return el;
}

// --- ターン数・ラウンド数の表示 ----------------------------------------------------
// 画面右上、山札一覧ボタンのさらに上にさりげなく表示する。turnNumber/roundNumberが
// まだnull（セットアップ手順3が未実行）の間は非表示にする。
let turnRoundCounterEl = null;

function buildTurnRoundCounter() {
  const el = document.createElement("div");
  el.id = "turn-round-counter";
  document.body.appendChild(el);
  return el;
}

function updateTurnRoundCounter() {
  if (!turnRoundCounterEl) return;
  const { turnNumber, roundNumber } = getState();
  if (!turnNumber) {
    turnRoundCounterEl.style.display = "none";
    return;
  }
  turnRoundCounterEl.style.display = "block";
  turnRoundCounterEl.textContent = `ターン ${turnNumber} ／ ラウンド ${roundNumber}`;
}

// --- 「1枚ドロー」ボタン ---------------------------------------------------------
// 自分（押した本人）が山札から1枚引いて自分の手札に加える、簡易操作用のショートカット。
// このゲームには手番でなくても自分の判断で引ける場面があるため、手番プレイヤーに
// 限定しない（押した本人が常に受け取る。以前は誤ってgetState().turnPlayerへ
// ドローしていたため、オンライン中に他人が押すと手番プレイヤーの手札が増えてしまう
// バグがあった）。「ターンを次のプレイヤーへ渡す」ボタンと同じ理由で、
// state.turnPlayerがまだnullの間（ゲーム開始前）は非表示にする。
let drawButtonEl = null;

function buildDrawButton() {
  const btn = document.createElement("button");
  btn.id = "draw-button";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/draw.svg",
    tooltip: "山札から1枚引いて手札に加えます",
  });
  captionEl.textContent = "1枚ドロー";
  wireIconButtonClick(btn, {
    detailTitle: "1枚ドロー",
    detailParagraphs: [
      "山札の一番上のカードを1枚引いて、自分の手札に加えます。",
      "山札が無くなった場合は、捨て場を裏向きのまま新しい山札とします（シャッフルはしません）。",
    ],
    onAction: () => {
      if (!getState().turnPlayer) return;
      const player = getSelfSeat();
      ensureDeckAvailable(async () => {
        if (isOnlineMode()) {
          // 山の中身はサーバーにしか無く先読みできないため、drawFromPile()（オンライン中は
          // transportを返す）の応答を待ち、実際に引けたカードをそこから受け取る
          // （onDragEndの山ドロー分岐と同じ考え方）。
          const handBefore = new Set(
            getState()
              .tokens.filter((t) => t.location.zone === "hand" && t.location.player === player)
              .map((t) => t.id)
          );
          let result = null;
          try {
            result = await drawFromPile("deck", { zone: "hand", player });
          } catch (err) {
            console.error("drawFromPile failed", err);
            return;
          }
          if (result?.revealedCardId) {
            playSound("cardDraw");
            announceHandPickups(player, [{ cardId: result.revealedCardId, wasPublic: false }]);
          }
          // 山からの直接ドローで新しく手札に加わったトークンも、remote-move-animator.jsの
          // 差分検知が「新規出現」として拾うようになった（相手プレイヤーへのカード獲得通知を
          // 出すため）。自分自身の操作を二重に通知しないよう、新しいトークンを特定して
          // 処理済みマークする（レスポンスにトークンidが含まれないため、直前の手札idと
          // 突き合わせて差分から見つける）。
          try {
            await fetchAndHydrate(getCurrentGameId());
          } catch (err) {
            console.error("fetchAndHydrate failed", err);
          }
          markSelfHandled(findNewHandTokenIds(player, handBefore));
          return;
        }
        const pileArray = getState().piles.deck;
        if (pileArray.length === 0) return; // 捨て場も空で、これ以上引けるカードが無い
        const cardId = pileArray[pileArray.length - 1];
        drawFromPile("deck", { zone: "hand", player });
        playSound("cardDraw");
        announceHandPickups(player, [{ cardId, wasPublic: false }]);
        render();
      });
    },
  });
  document.body.appendChild(btn);
  return btn;
}

function updateDrawButton() {
  if (!drawButtonEl) return;
  drawButtonEl.style.display = getState().turnPlayer ? "flex" : "none";
}

let publicDrawButtonEl = null;

// 「公開ドロー」ボタン。通常の「1枚ドロー」と同じく山札から1枚引くが、扇状の手札には
// 直接加えず、常に表向きで手札付近の専用エリア（buildPlayerZoneのpublicDrawEl参照）に
// 並べる。手札シャッフル・ターン終了のどちらかを行うと通常の手札へ合流する
// （state.jsのmergePublicDrawIntoHand参照）。「1枚ドロー」と同じく、押した本人が
// 手番かどうかは問わない（誰でも自分の分だけ引ける）。
function buildPublicDrawButton() {
  const btn = document.createElement("button");
  btn.id = "public-draw-button";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/public-draw.svg",
    tooltip: "山札から1枚、表向きで公開ドローします",
  });
  captionEl.textContent = "公開ドロー";
  wireIconButtonClick(btn, {
    detailTitle: "公開ドロー",
    detailParagraphs: [
      "山札の一番上のカードを1枚引き、表向きのまま手札の近くに公開して並べます（扇状の手札には直接入りません）。",
      "「手札シャッフル」または「ターンを終了する」を押すと、公開ドローしたカードがまとめて通常の手札へ合流します。",
    ],
    onAction: () => {
      if (!getState().turnPlayer) return;
      const player = getSelfSeat();
      ensureDeckAvailable(async () => {
        if (isOnlineMode()) {
          let result = null;
          try {
            result = await drawFromPile("deck", { zone: "publicDraw", player });
          } catch (err) {
            console.error("drawFromPile failed", err);
            return;
          }
          if (result?.revealedCardId) {
            playSound("cardDraw");
            announceHandPickups(player, [{ cardId: result.revealedCardId, wasPublic: true }]);
          }
          try {
            await fetchAndHydrate(getCurrentGameId());
          } catch (err) {
            console.error("fetchAndHydrate failed", err);
          }
          return;
        }
        const pileArray = getState().piles.deck;
        if (pileArray.length === 0) return;
        const cardId = pileArray[pileArray.length - 1];
        drawFromPile("deck", { zone: "publicDraw", player });
        playSound("cardDraw");
        announceHandPickups(player, [{ cardId, wasPublic: true }]);
        render();
      });
    },
  });
  document.body.appendChild(btn);
  return btn;
}

function updatePublicDrawButton() {
  if (!publicDrawButtonEl) return;
  publicDrawButtonEl.style.display = getState().turnPlayer ? "flex" : "none";
}

// --- 自分専用ステータス（手札枚数・名前・アバター） --------------------------------
// 他のプレイヤーには見せない、自分専用の常時表示ステータス。手札は扇状に表示されると
// 重なって数えづらいため、画面の隅に「今何枚持っているか」を数字で出しておく。
// あわせて自分の名前・アバターもここから変更できるようにする（変更内容は盤面のラベルや
// 各種ポップアップの表記にもそのまま反映される。player-identity.js参照）。
let selfHandStatusEl = null;
let selfStatusNameEl = null;
let selfStatusPieceThumbEl = null;
let selfStatusCardBackThumbEl = null;
let selfStatusPlaymatThumbEl = null;
let selfStatusBackgroundThumbEl = null;
let selfStatusHandCountEl = null;
let selfStatusInfoEl = null;
let selfStatusLargeAvatarEl = null;
let selfStatusRankRingEl = null;

// ユーザー要望「戦績システムと連携しているプレイヤーはステータスエリアにランクを
// 表示させたい」。stats-profile.jsのgetTierInfo()と同じ形のtierオブジェクト
// （{type:'ring',color,glow} または {type:'rainbow'}、もしくは連携無しならnull）を
// 受け取り、リング要素の見た目を更新する。
// ユーザー要望「ランクリングは常時表示されていてください」への対応。戦績システムと
// 未連携・未ログインの間は、実際のティア（getTierInfo）が求められないため、この
// 中立的な色（アプリ全体で補助テキストに使っている灰色と同じ）をそのまま代わりに使う。
const UNLINKED_RANK_TIER = { type: "ring", color: "#94a3b8", glow: null, label: "未連携" };

function updateSelfStatusRankRing(tier) {
  if (!selfStatusRankRingEl) return;
  selfStatusRankRingEl.classList.remove("is-visible", "is-solid", "is-glow", "is-rainbow");
  selfStatusRankRingEl.style.removeProperty("--rank-ring-color");
  selfStatusRankRingEl.style.removeProperty("--rank-ring-glow");
  if (!tier) tier = UNLINKED_RANK_TIER;
  selfStatusRankRingEl.classList.add("is-visible");
  if (tier.type === "rainbow") {
    selfStatusRankRingEl.classList.add("is-rainbow");
    startRankRingOrbit();
    return;
  }
  selfStatusRankRingEl.classList.add("is-solid");
  selfStatusRankRingEl.style.setProperty("--rank-ring-color", tier.color);
  if (tier.glow) {
    selfStatusRankRingEl.classList.add("is-glow");
    selfStatusRankRingEl.style.setProperty("--rank-ring-glow", tier.glow);
  }
  startRankRingOrbit();
}

async function openAvatarPicker() {
  const modal = document.createElement("div");
  modal.id = "avatar-picker-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "avatar-picker-modal-title";
  title.textContent = "アバターを選択";

  const grid = document.createElement("div");
  grid.className = "avatar-picker-modal-grid";

  // Googleログインの場合、プロフィール画像も選択肢の1つとして追加する（絵文字より先頭に置く）。
  const googleAvatarUrl = getGoogleAvatarUrl();
  if (googleAvatarUrl) {
    const googleSwatch = document.createElement("button");
    googleSwatch.className = "avatar-picker-swatch";
    googleSwatch.title = "Googleのプロフィール画像を使う";
    if (getPlayerAvatar(getSelfSeat()) === googleAvatarUrl) googleSwatch.classList.add("is-selected");
    applyAvatarContent(googleSwatch, googleAvatarUrl);
    googleSwatch.addEventListener("click", () => {
      setPlayerAvatar(getSelfSeat(), googleAvatarUrl);
      render();
      close();
    });
    grid.appendChild(googleSwatch);
  }

  // ユーザー要望「アバター画像をアップロードしたらアバター変更時に一覧に出るように
  // してほしい。もちろん他のプレイヤーの一覧には出ない」への対応。so7_user_profiles
  // （本人しか読み書きできないRLS）に保存された、自分がアップロードした画像を
  // 選択肢の1つとして出す（Google同様、他プレイヤーには一切見えない自分専用の選択肢）。
  const customAvatarUrl = await fetchMyCustomAvatarUrl();
  if (customAvatarUrl) {
    const customSwatch = document.createElement("button");
    customSwatch.className = "avatar-picker-swatch";
    customSwatch.title = "アップロードした画像を使う";
    if (getPlayerAvatar(getSelfSeat()) === customAvatarUrl) customSwatch.classList.add("is-selected");
    applyAvatarContent(customSwatch, customAvatarUrl);
    customSwatch.addEventListener("click", () => {
      setPlayerAvatar(getSelfSeat(), customAvatarUrl);
      render();
      close();
    });
    grid.appendChild(customSwatch);
  }

  for (const avatar of AVATAR_OPTIONS) {
    const swatch = document.createElement("button");
    swatch.className = "avatar-picker-swatch";
    if (getPlayerAvatar(getSelfSeat()) === avatar) swatch.classList.add("is-selected");
    applyAvatarContent(swatch, avatar);
    swatch.addEventListener("click", () => {
      setPlayerAvatar(getSelfSeat(), avatar);
      render();
      close();
    });
    grid.appendChild(swatch);
  }

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(grid);
  // ユーザー要望「アバター画像を自分でアップロードできるようにしたい」への対応。
  modal.appendChild(
    buildAvatarUploadSection((url) => {
      setPlayerAvatar(getSelfSeat(), url);
      render();
      close();
    })
  );
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// ユーザー要望「Googleで初めてログインするとき、アバターやニックネームはこれでいいですか
// というモーダルを出し、自動でGoogleの名前やサムネを設定してほしい」への対応。
// online.jsのloadMyPreferences()が「so7_user_profilesにまだ行が無い＝初回ログイン」かつ
// Googleログインの場合に呼ぶ（registerFirstGoogleLoginPrompter参照）。openAvatarPicker()と
// 中身のグリッドはほぼ同じだが、選んだ瞬間にモーダルを閉じず、その場でプレビューだけ
// 差し替えて名前欄と一緒に確認できるようにしてある。
async function openFirstLoginProfileModal() {
  const seat = getSelfSeat();
  const googleName = getGoogleDisplayName();
  const googleAvatarUrl = getGoogleAvatarUrl();
  // 自動で設定（ユーザー要望）。この時点ではまだ部屋に入っていないため、getSelfSeat()は
  // 常に"A"を返す（registerIdentityApplierのコールバックと同じ理由）。
  if (googleName) setPlayerName(seat, googleName);
  if (googleAvatarUrl) setPlayerAvatar(seat, googleAvatarUrl);
  render();

  const modal = document.createElement("div");
  modal.id = "first-login-profile-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  // z-indexは#opening-screen（50000）より確実に高くしておく必要がある——Googleログインは
  // OAuthのページ遷移を伴うため、まだタイトル/オープニング画面を閉じていない状態で戻って
  // くることが多く、そのタイミングでこのモーダルが裏に隠れてしまわないようにするため。
  const backdrop = createBackdrop(close, { dim: true, zIndex: 50100 });

  const title = document.createElement("div");
  title.className = "first-login-profile-title";
  title.textContent = "🎉 プロフィールの確認";
  modal.appendChild(title);

  const body = document.createElement("div");
  body.className = "first-login-profile-body";
  body.textContent = "Googleアカウントのニックネームと画像から自動で設定しました。このまま始めますか？ここで変更もできます。";
  modal.appendChild(body);

  const avatarPreview = document.createElement("div");
  avatarPreview.className = "first-login-profile-avatar-preview";
  applyAvatarContent(avatarPreview, getPlayerAvatar(seat));
  modal.appendChild(avatarPreview);

  const grid = document.createElement("div");
  grid.className = "first-login-profile-avatar-grid";
  function addAvatarSwatch(avatarValue, label) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "avatar-picker-swatch";
    if (label) swatch.title = label;
    if (getPlayerAvatar(seat) === avatarValue) swatch.classList.add("is-selected");
    applyAvatarContent(swatch, avatarValue);
    swatch.addEventListener("click", () => {
      setPlayerAvatar(seat, avatarValue);
      applyAvatarContent(avatarPreview, avatarValue);
      grid.querySelectorAll(".avatar-picker-swatch").forEach((el) => el.classList.remove("is-selected"));
      swatch.classList.add("is-selected");
      render();
    });
    grid.appendChild(swatch);
  }
  if (googleAvatarUrl) addAvatarSwatch(googleAvatarUrl, "Googleのプロフィール画像を使う");
  const customAvatarUrl = await fetchMyCustomAvatarUrl();
  if (customAvatarUrl) addAvatarSwatch(customAvatarUrl, "アップロードした画像を使う");
  for (const avatar of AVATAR_OPTIONS) addAvatarSwatch(avatar, "");
  modal.appendChild(grid);

  const nameLabel = document.createElement("div");
  nameLabel.className = "first-login-profile-name-label";
  nameLabel.textContent = "ニックネーム";
  modal.appendChild(nameLabel);

  const nameInput = document.createElement("input");
  nameInput.className = "first-login-profile-name-input";
  nameInput.maxLength = 12;
  nameInput.value = getPlayerName(seat);
  const commitName = () => {
    if (nameInput.value.trim()) setPlayerName(seat, nameInput.value);
    render();
  };
  nameInput.addEventListener("blur", commitName);
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") nameInput.blur();
  });
  modal.appendChild(nameInput);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "first-login-profile-ok";
  okBtn.textContent = "この内容で始める";
  okBtn.addEventListener("click", () => {
    commitName();
    close();
  });
  modal.appendChild(okBtn);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

function startEditingName() {
  const input = document.createElement("input");
  input.className = "self-status-name-input";
  input.value = getPlayerName(getSelfSeat());
  input.maxLength = 12;
  const commit = () => {
    if (input.value.trim()) setPlayerName(getSelfSeat(), input.value);
    render();
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") input.blur();
    if (e.key === "Escape") {
      input.value = getPlayerName(getSelfSeat());
      input.blur();
    }
  });
  selfStatusNameEl.replaceWith(input);
  input.focus();
  input.select();
}

// 自分専用ステータスの4アイコン（アバター・駒スキン・カード裏面・オンライン状態）のうち、
// buildIconButtonContent()を使わない3つ（見た目がアイコン+キャプション形式ではなく、
// それぞれ独自の中身を持つため）に、既存の.phase-guide-tooltip（フェイズ案内板・
// アイコンボタン共通のホバー簡易説明）と同じ見た目のツールチップを追加する共通ヘルパー。
// ネイティブのtitle属性（ブラウザ既定の遅いツールチップ）は使わず、アプリ全体で統一
// されたこのスタイルに揃える。
// ハマりどころ: アバター(applyAvatarContent)・駒スキン(updateSelfHandStatus内)は
// render()のたびに中身を丸ごと作り直す（textContent/innerHTMLのリセットを伴う）ため、
// 一度だけ追加したツールチップがその瞬間に一緒に消えてしまう。既存のツールチップが
// あれば使い回し、無ければ作る（直接の子要素だけを見る）ようにして、
// updateSelfHandStatus()側から中身の再構築のたびに呼び直しても安全にした。
function addSimpleTooltip(btn, text) {
  let tooltipEl = null;
  for (const child of btn.children) {
    if (child.classList.contains("phase-guide-tooltip")) {
      tooltipEl = child;
      break;
    }
  }
  if (!tooltipEl) {
    tooltipEl = document.createElement("span");
    tooltipEl.className = "phase-guide-tooltip";
    btn.appendChild(tooltipEl);
  }
  tooltipEl.textContent = text;
}

function buildSelfHandStatus() {
  const el = document.createElement("div");
  el.id = "self-hand-status";

  // 背面に大きく表示する自分のアバター（ユーザー要望「ステータスエリアにラップするように
  // 大きめの自分アバターを表示したい」）。以前あった小さいアバターアイコンはこれに
  // 統合し撤去した。クリックでアバター選択ピッカーが開く。ステータスエリアでは常に
  // 右向き（"right"）のバリエーションを表示する（ユーザー指定）。
  selfStatusLargeAvatarEl = document.createElement("div");
  selfStatusLargeAvatarEl.className = "self-status-large-avatar";
  // ユーザー要望「左下の巨大アバターを押してもマイページが開くようにしたい」。
  // 以前はここで直接openAvatarPicker()を呼んでいたが、マイページ側に「アバター変更」
  // ボタンとして移した（my-page.js参照）。
  selfStatusLargeAvatarEl.addEventListener("click", openMyPage);
  addSimpleTooltip(selfStatusLargeAvatarEl, "クリックしてマイページを開く");

  // ユーザー要望「戦績システムと連携しているプレイヤーはステータスエリアにランクを
  // 表示させたい」。stats-profile.jsのtierに従ってupdateSelfStatusRankRing()が
  // クラス・CSS変数を反映する（avatar-imageより一回り大きく、背面のリングとして表示）。
  // ハマりどころ（実機検証で発覚）: 当初selfStatusLargeAvatarElの子要素として追加して
  // いたが、avatar-render.jsのapplyAvatarContent()は初回（まだimg.avatar-imageが
  // 無い）に`el.textContent = ""`で子要素を丸ごと消してから<img>を作る実装のため、
  // updateSelfHandStatus()が最初に一度呼ばれた瞬間にこのリングごと消えてしまって
  // いた。selfStatusLargeAvatarElの「兄弟」にすることで、applyAvatarContent()の
  // 対象（selfStatusLargeAvatarElの中身）を一切変更せずに済むようにした。
  selfStatusRankRingEl = document.createElement("div");
  selfStatusRankRingEl.className = "self-status-rank-ring";
  el.appendChild(selfStatusRankRingEl);
  setRankRingOrbitContainer(selfStatusRankRingEl);

  el.appendChild(selfStatusLargeAvatarEl);

  // 駒スキンの選択もここに集約する（以前は別の独立したボタンだった）。実際の駒と同じ
  // buildCubePiece()をそのまま使い、立体のまま小さく表示する（ドラッグ中のゴーストと同じ
  // 「perspective+盤面と同じ傾きを持つ入れ子」のテクニックで、3D空間の外でも立方体に見せる）。
  selfStatusPieceThumbEl = document.createElement("button");
  selfStatusPieceThumbEl.className = "self-status-piece-thumb";
  selfStatusPieceThumbEl.addEventListener("click", openPieceSkinPicker);
  addSimpleTooltip(selfStatusPieceThumbEl, "クリックして駒スキンを変更");

  // カード裏面セットの選択（自分だけの見た目の好み、card-back-skins.js参照）。
  // 駒と違い自分の色に依存しない・ゲーム開始前でも常に選べるため、非表示にする条件は無い。
  selfStatusCardBackThumbEl = document.createElement("button");
  selfStatusCardBackThumbEl.className = "self-status-card-back-thumb";
  selfStatusCardBackThumbEl.addEventListener("click", openCardBackSkinPicker);
  const cardBackThumbImg = document.createElement("img");
  selfStatusCardBackThumbEl.appendChild(cardBackThumbImg);
  addSimpleTooltip(selfStatusCardBackThumbEl, "クリックしてカード裏面を変更（自分の画面にだけ反映されます）");

  // プレイマットの選択（playmat.js参照）。カード裏面と違い盤面の背景そのものなので、
  // 全プレイヤーの画面に見た目上反映される（現状はこのブラウザのローカル選択のみ、
  // オンライン同期は今回のスコープ外）。
  selfStatusPlaymatThumbEl = document.createElement("button");
  selfStatusPlaymatThumbEl.className = "self-status-playmat-thumb";
  selfStatusPlaymatThumbEl.addEventListener("click", openPlaymatPicker);
  const playmatThumbImg = document.createElement("img");
  selfStatusPlaymatThumbEl.appendChild(playmatThumbImg);
  addSimpleTooltip(selfStatusPlaymatThumbEl, "クリックしてプレイマットを変更");

  // 背景画像の選択（background.js参照）。プレイマットのすぐ隣に、同じ大きさで配置する
  // （ユーザー要望）。CSSはプレイマットアイコンのクラスをそのまま流用し、サイズ・位置だけ
  // 独自のCSS変数（--self-status-icon-background-*）で個別調整できるようにする。
  selfStatusBackgroundThumbEl = document.createElement("button");
  selfStatusBackgroundThumbEl.className = "self-status-playmat-thumb self-status-background-thumb";
  selfStatusBackgroundThumbEl.addEventListener("click", openBackgroundPicker);
  const backgroundThumbImg = document.createElement("img");
  selfStatusBackgroundThumbEl.appendChild(backgroundThumbImg);
  addSimpleTooltip(selfStatusBackgroundThumbEl, "クリックして背景画像を変更");

  const info = document.createElement("div");
  info.className = "self-status-info";
  selfStatusInfoEl = info;

  selfStatusNameEl = document.createElement("div");
  selfStatusNameEl.className = "self-status-name";
  selfStatusNameEl.title = "クリックして名前を変更";
  selfStatusNameEl.addEventListener("click", startEditingName);

  selfStatusHandCountEl = document.createElement("div");
  selfStatusHandCountEl.className = "self-status-hand-count";

  info.appendChild(selfStatusNameEl);
  info.appendChild(selfStatusHandCountEl);

  // 駒スキン・カード裏面・プレイマット・オンライン状態の4つのアイコンをグリッドにまとめる
  // （アバターは背面の大きいアバターに統合したため、このグリッドからは撤去した）。
  const iconGrid = document.createElement("div");
  iconGrid.className = "self-status-icon-grid";
  iconGrid.appendChild(selfStatusPieceThumbEl);
  iconGrid.appendChild(selfStatusCardBackThumbEl);
  iconGrid.appendChild(selfStatusPlaymatThumbEl);
  iconGrid.appendChild(selfStatusBackgroundThumbEl);
  iconGrid.appendChild(buildSelfStatusOnlineWidget());

  el.appendChild(iconGrid);
  el.appendChild(info);
  document.body.appendChild(el);
  return el;
}

function updateSelfHandStatus() {
  if (!selfHandStatusEl) return;
  const count = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === getSelfSeat()
  ).length;
  let selfAvatarSrc = getAvatarVariant(getPlayerAvatar(getSelfSeat()), "right");
  const selfLockedCount = getLockedCount(getSelfSeat());
  if (selfLockedCount >= 6) selfAvatarSrc = getEnragedVariant(selfAvatarSrc);
  else if (selfLockedCount >= 4) selfAvatarSrc = getAwakenedVariant(selfAvatarSrc);
  applyAvatarContent(selfStatusLargeAvatarEl, selfAvatarSrc);
  // ハマりどころ: applyAvatarContent()の直後は毎回tooltip要素も一緒に消えている
  // ため（同じ理由でリングも消えていた、buildSelfHandStatusのコメント参照）、
  // ここで都度re-addする必要がある。文言はbuildSelfHandStatus側と揃える。
  addSimpleTooltip(selfStatusLargeAvatarEl, "クリックしてマイページを開く");

  // セットアップ前（自分の駒の色がまだ決まっていない間）でも、選んだバリエーション番号
  // 自体は色に依存しない好みなので、先に見た目を確認・選べるよう常に表示する
  // （ユーザー要望）。実際の色がまだ無い間はCOLORS[0]の見た目で仮表示する。
  const myColor = getMyPieceColor() || COLORS[0];
  selfStatusPieceThumbEl.style.display = "flex";
  selfStatusPieceThumbEl.innerHTML = "";
  const inner = document.createElement("div");
  inner.className = "self-status-piece-thumb-inner";
  const tilt = getComputedStyle(document.documentElement).getPropertyValue("--table-tilt").trim();
  inner.style.transform = `rotateX(${tilt})`;
  inner.appendChild(buildCubePiece(myColor, getSelfSeat()));
  selfStatusPieceThumbEl.appendChild(inner);
  addSimpleTooltip(selfStatusPieceThumbEl, "クリックして駒スキンを変更");

  selfStatusCardBackThumbEl.querySelector("img").src = cardBackSetImagePath("normal", getCardBackSetIndex());
  selfStatusPlaymatThumbEl.querySelector("img").src = getSelectedPlaymatPath();
  selfStatusBackgroundThumbEl.querySelector("img").src = getSelectedBackgroundPath();

  // startEditingName()が.self-status-nameを一時的に<input>へ差し替えるため、render()の
  // たびに毎回ここで作り直す（差し替え後の入力欄はrender()時点で既にblur済みのはず）。
  if (!selfStatusNameEl.isConnected) {
    const fresh = document.createElement("div");
    fresh.className = "self-status-name";
    fresh.title = "クリックして名前を変更";
    fresh.addEventListener("click", startEditingName);
    selfHandStatusEl.querySelector(".self-status-name-input")?.replaceWith(fresh);
    selfStatusNameEl = fresh;
  }
  // 「（自分）」はここ（実際に見ている本人にしか意味を持たない場所）でだけ動的に付け足す。
  // SEAT_LABELS側にはもう含めていない（「自分」がAとは限らないため）。
  selfStatusNameEl.textContent = `${getPlayerName(getSelfSeat())}（自分）`;
  selfStatusHandCountEl.textContent = `手札：${count}枚`;
}

// オープニング画面（ローカル/オンラインの2択メニュー）を、ゲーム本体の初期化より先に
// 画面へ追加しておく。ゲーム自体はこれまで通りすぐ裏で初期化・描画されるため、後段の
// 処理を待たせる必要はない（単純な最前面オーバーレイとしてゲート役を果たすだけ）。
initOpeningScreen();

// 管理者モードのスライダーには、CSS変数を変えるだけでは反映されない値（--hand-*-sizeなど、
// JS側でgetComputedStyleして読み取り、inline styleとして適用しているもの）があるため、
// 変更のたびに再描画してもらう。
window.addEventListener("admin:change", render);

endTurnButtonEl = buildEndTurnButton();
drawButtonEl = buildDrawButton();
publicDrawButtonEl = buildPublicDrawButton();
selfHandStatusEl = buildSelfHandStatus();
boardZoomButtonEl = buildBoardZoomButton();
boardZoomRegisterButtonEl = buildBoardZoomRegisterButton();
handShuffleButtonEl = buildHandShuffleButton();
applyViewportStage();
render();
initDragHandlers();
initHoverHandlers();
initHandPeek();
initContextMenuHandlers();
initButtonClickSound();
initCameraControls();
initAdminMode();
initDeckViewer();
initStatsPlayerLinkModal();
initMyPage();
initHelpButton();
initCurrencyDisplay();
initShop();
registerShopOpener(openShopPanel);
registerAvatarPickerHelper(openAvatarPicker);
initGameSetup();
registerStartPlayerPreviewHelper(previewStartPlayerModal);
registerAuraPreviewHelper(previewOpeningAuras);
registerVictorySummaryHelper(generateVictorySummaryCanvas);
registerVictoryHelpers({ getLockedCount, resetVictoryTracking });
initOptionsMenu();
initPlayerButtons();
initQuickStart();
initPhaseGuide();
registerTutorialStageHelpers({ stageClientToLocal, stageDelta, stageWidth: STAGE_WIDTH, stageHeight: STAGE_HEIGHT });
initTutorialAutoStart();
initGameBgmAutoStart();
initTurnTimer();
initIconRearrange();
initSelfStatusRearrange();
initInteractionModeToggle();
initDeviceDetect();
registerRenderHelpers({ render, triggerLockEffect, spawnArrivalBurst, findLocationElement, setSetupPendingTokenIds });
registerPieceSkinHelpers({ render });
registerCardBackSkinHelpers({ render, savePreference: saveMyPreference, isItemUnlocked, openShop });
registerPlaymatHelpers({ render });
registerBackgroundHelpers({ render });
// ログイン直後（online.jsのloadMyPreferences）に、保存済みの名前・アバター・駒スキンを
// ローカルの表示側（player-identity.js/piece-skins.js）へ反映する。部屋に入る前は
// getSelfSeat()が常に"A"を返すため、ここではまだ「A」という固定座席への適用でよい
// （実際に部屋へ入った後は、それぞれのモジュールが自動的に同期ロスター優先へ切り替わる）。
// isOnlineMode()はこの時点ではまだfalseのため、setPlayerName/setPlayerAvatarが内部で
// 行うupdateMyIdentity()への書き戻しは発生しない（読み込んだ値をそのまま書き戻すだけの
// 無駄なネットワーク往復を避けられる）。
registerIdentityApplier(({ name, avatar, pieceSkinIndex }) => {
  const seat = getSelfSeat();
  if (name) setPlayerName(seat, name);
  if (avatar) setPlayerAvatar(seat, avatar);
  if (typeof pieceSkinIndex === "number") setLocalPreferredSkinIndex(pieceSkinIndex);
  render();
});
registerFirstGoogleLoginPrompter(() => {
  openFirstLoginProfileModal().catch((err) => console.error("openFirstLoginProfileModal failed", err));
});
// ユーザー要望「プレイマット・カード裏面・背景変更をアカウントに紐づけてほしい」。
// ログイン直後、online.jsのloadMyPreferences()がso7_user_profilesから読み込んだ値を
// ここで実際に反映する（各setter自体が内部でrenderを済ませるが、念のためこの後も
// render()を呼び、初回ログイン等で他の初期化と競合してもズレが残らないようにする）。
registerAppearanceApplier(({ playmatId, cardBackSetIndex, backgroundId }) => {
  if (playmatId) setSelectedPlaymatId(playmatId);
  if (typeof cardBackSetIndex === "number") setCardBackSetIndex(cardBackSetIndex);
  if (backgroundId) setSelectedBackgroundId(backgroundId);
  render();
});
registerRemoteMoveAnimatorHelpers({
  setSetupPendingTokenIds,
  maybeAnnounceLock,
  maybeTriggerCardArrivalForCard,
  maybeTriggerCardArrivalForExposedCard,
  triggerCardArrivalIfFaceUp,
  announceHandPickups,
  findLocationElement,
});
registerFinalLockApprovalHandler(respondToFinalLock);
registerContactApprovalHandler(respondToContact);
buildGameTitle();
buildSpotlightOverlay();
buildFinalLockApprovalBanner();
buildContactApprovalModal();
turnRoundCounterEl = buildTurnRoundCounter();
updateTurnRoundCounter();

// オンラインでゲームが開始された瞬間（turnPlayerがnull→非nullに変わった瞬間、
// online-ui.jsの部屋モーダル自動クローズと同じ検知方法）に、ローカル版のセットアップ配布
// アニメーションを再生する。
//
// 重要なハマりどころ: 当初「このリスナーをsubscribe(render)より前に登録すれば、
// pendingIdsを設定した直後に走る通常のrender()が正しく隠れた状態で描画するはず」という
// 設計だったが、実際には効かなかった。原因は、async関数（animateFirstCardsDealt）を
// awaitせず呼び出しても、その関数本体は最初のawaitに達するまで「同期的に」実行される
// というJSの仕様。animateFirstCardsDealt自身が内部でhelpers.render()を呼んでから
// pendingIdsを空に戻す処理まで、全てこのリスナーの実行中（＝hydrateState()のリスナー
// ループが次のリスナーへ進む前）に同期的に完了してしまう。そのため、次に
// subscribe(render)（下）が呼ばれる頃には既にpendingIdsが空になっており、
// 配布済みの盤面がそのままフルに表示されてしまっていた（ユーザー報告:
// 「最初から駒とカード49枚が並んでいて、ファーストカード配布後に一旦消えて
// 並べ直すアニメが始まる」）。
// 対策: アニメーション実行中は下の汎用render()リスナー自体を丸ごとスキップする
// フラグ(suppressGenericRenderForOnlineStart)を導入した。アニメーション関数が
// 自前で呼ぶhelpers.render()（このsubscribe()経由ではない直接呼び出し）は
// このフラグの影響を受けないため、配布アニメーション自体は今まで通り正しく動く。
let wasOnlineGameStarted = false;
let suppressGenericRenderForOnlineStart = false;
// respondToContact()のタックル演出（playContactLunge/playContactFlight）中、同じ理由で
// 汎用render()リスナー・remote-move-animator.jsを一時停止するためのフラグ。
let suppressGenericRenderForContactTackle = false;
subscribe(() => {
  const started = Boolean(getState().turnPlayer);
  if (isOnlineMode() && started && !wasOnlineGameStarted) {
    suppressGenericRenderForOnlineStart = true;
    setSetupPendingTokenIds(new Set(getState().tokens.map((t) => t.id)));
    animateFirstCardsDealt()
      .then(() => animateBoardFilled())
      .finally(() => {
        suppressGenericRenderForOnlineStart = false;
        // 配布アニメーション中はremote-move-animator.js自体が丸ごと呼ばれず
        // previousTokensByIdが更新されないため、再開後の最初のhydrateは診断せず
        // ベースラインだけ更新させる（そうしないと配布済みの全トークンが「新規出現」に
        // 見えてしまい、駒を初めて動かした瞬間にゲーム開始時のロック演出が再発生する
        // バグの原因になっていた）。
        skipNextHydrateDiff();
      });
  }
  wasOnlineGameStarted = started;
});

// 他プレイヤーの操作をBroadcast経由で受動的に受け取った時の演出・アニメーション・通知
// （remote-move-animator.js）。移動前の実DOM要素の位置(getBoundingClientRect)を、下の
// 汎用render()リスナーがDOMを作り直す「前」に取得する必要があるため、必ずrenderリスナーより
// 前に登録する。オンラインゲーム開始アニメーション中は、盤面が丸ごと配布演出用に隠されて
// いる最中のため競合しないよう休止する。
subscribe(() => {
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle) return;
  handleRemoteMoveHydrate();
});

// ターン終了時の中央告知（ユーザー要望）: turnPlayerが「非null→別の非null」へ変わった
// 瞬間だけ announceTurnChange() を呼ぶ。「null→非null」（セットアップ完了・スタート
// プレイヤー決定の瞬間）は対象外——そちらは既存の「３：スタートプレイヤー決定」モーダルが
// 別途案内するため、二重表示を避ける。turn-timer.jsのhandleTurnTransitionと同じ
// 「turnPlayerの変化を検知する」考え方だが、こちらは表示専用でstateへは一切書き込まない
// 独立した仕組みにした（ローカル・オンラインどちらの経路で変化してもこのsubscribe一本で
// 拾えるため、onDragEnd側やターン終了ボタン側に個別の呼び出しを増やす必要が無い）。
let prevTurnPlayerForAnnouncement = null;
subscribe(() => {
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle) return;
  const { turnPlayer } = getState();
  if (prevTurnPlayerForAnnouncement !== null && turnPlayer !== null && turnPlayer !== prevTurnPlayerForAnnouncement) {
    announceTurnChange(turnPlayer);
  }
  prevTurnPlayerForAnnouncement = turnPlayer;
});

// 直近でrender()に反映済みの状態の軽量な指紋（フィンガープリント）。オンライン中、
// 自分の操作1回につき実際にはhydrateState()が2回呼ばれることがある——①onDragEnd等が
// 明示的に呼ぶfetchAndHydrate()によるものと、②online.jsのsubscribeToGame()が持つ、
// 全員向けの共通Broadcastハンドラが、同じ操作の「こだま」を受信して呼ぶもの
// （so7-apply-action.tsはコミット後、HTTPレスポンスとBroadcast送信を別々に行っているため、
// 到着順序も保証されない）。②が①の直後に届くと、①で追加した到達演出/ロック演出のDOM要素
// （spawnArrivalBurst等）が、中身は同じはずの②由来のrender()（table.innerHTML=""で
// 盤面DOM全体を作り直す）によって再生中に消されてしまい、「自分の操作でも到達演出が
// 見えない/途中で消える」というユーザー報告の原因になっていた。
// 対策として、次のrenderリスナーは「今のgetState()が直前にrender()した内容と実質的に
// 同一か」を比較し、同一なら（＝直前の内容の再送に過ぎないなら）render()自体をスキップする。
// isOnlineMode()も指紋に含めるのは、online.jsのsubscribeToGame()がsetOnlineMode(true)の
// 直後に呼ぶnotifyListeners()（tokensは変化しないが、is-online-modeクラスを即座に反映する
// ためだけの強制再描画）が、この重複排除によって誤ってスキップされないようにするため。
// ロスター（名前・アバター・駒スキン）も指紋に含めるのは、online.jsのidentity_changed
// Broadcastハンドラが盤面トークンを一切変えずにnotifyListeners()だけ呼ぶため——含めないと
// 相手が名前/アバター/駒スキンを変更しても、盤面側の指紋が一致してrender()自体が
// スキップされ、変更が画面に反映されないバグになっていた。pendingFinalLock（最後のロック
// 承認、final-lock-approval.js参照）も同じ理由で指紋に含める——他の参加プレイヤーが
// 承認/却下しても盤面のトークン自体はまだ動いていない（承認完了までは何も動かさない設計の
// ため）ことがあり、含めないと自分以外の画面で承認バナーの状態（「今誰の承認待ちか」）が
// 更新されずに固まって見えるバグになる。
let lastRenderedFingerprint = null;
function computeStateFingerprint(state) {
  const tokenParts = state.tokens
    .map((t) => {
      const l = t.location;
      const loc =
        l.zone === "cell" ? `c:${l.row},${l.col}` : l.zone === "lock" ? `l:${l.side},${l.index}` : `h:${l.player}`;
      return `${t.id}|${loc}|${t.faceUp ? 1 : 0}|${t.cardId ?? ""}`;
    })
    .sort()
    .join(";");
  const rosterParts = state.activePlayers
    .map((seat) => {
      const identity = getSyncedIdentity(seat);
      return `${seat}:${identity?.name ?? ""}:${identity?.avatar ?? ""}:${identity?.pieceSkinIndex ?? ""}`;
    })
    .join(";");
  return [
    isOnlineMode() ? 1 : 0,
    // ユーザー報告「『オンラインで続ける』を押した直後の盤面（部屋を選ぶ前）が
    // テストモードのままB/C/Dにダミーアバターが出ている」への対応でisActive()の
    // 判定にisOnlineIntentActive()を加えたが、この指紋にも含めないと、部屋を選ばずに
    // パネルを閉じた時（getState()自体は変化しない）にrender()がスキップされてしまい、
    // 盤面がオンライン風の見た目のまま元に戻らなくなる（isOnlineMode()をここに含めて
    // いるのと同じ理由）。
    isOnlineIntentActive() ? 1 : 0,
    state.turnPlayer ?? "",
    state.turnNumber ?? "",
    state.roundNumber ?? "",
    state.activePlayers.join(","),
    tokenParts,
    rosterParts,
    state.pendingFinalLock ? `${state.pendingFinalLock.tokenId}|${state.pendingFinalLock.queue.join(",")}` : "",
    // pendingContact（接触の承認待ち、contact-approval.js参照）もpendingFinalLockと同じ
    // 理由で指紋に含める——盤面のトークン自体はまだ動いていないため、含めないと接触された
    // 本人以外の画面で承認モーダルの状態が更新されずに固まって見えるバグになる。
    state.pendingContact ? `${state.pendingContact.attacker}>${state.pendingContact.defender}` : "",
  ].join("|");
}

// オンライン対戦（第一弾・最小構成）の入り口。online.jsが部屋に参加するとisOnlineMode()が
// trueになり、moveToken等の一部アクションがサーバー経由になる。サーバー側の変化はBroadcast
// 通知→hydrateState()経由でここのsubscribe(render)が拾って再描画する（既存の各所の手動
// render()呼び出しはローカルモードのためにそのまま残してある）。上のオンラインゲーム開始
// アニメーション中だけは、このリスナーの発火をスキップする（理由は上のコメント参照）。
subscribe(() => {
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle) return;
  const fingerprint = computeStateFingerprint(getState());
  if (fingerprint === lastRenderedFingerprint) return;
  lastRenderedFingerprint = fingerprint;
  render();
});
initOnlineUi();
// ログイン/ログアウト直後は部屋の作成・参加を伴わない（＝state.js側のnotifyListeners()が
// 発火しない）ことがあるため、オンライン状態ウィジェットを常に最新に保つには
// online.js自身のonAuthChangeも別途subscribeしておく必要がある。
onAuthChange(render);
updateSelfStatusOnlineWidget();

// ユーザー要望「戦績システムと連携しているプレイヤーはステータスエリアにランクを
// 表示させたい」。ログイン状態が変わるたび（マイページでの連携直後も含む）に
// 取得し直す。ユーザー要望「ランクリングは常時表示されていてください」への対応で、
// 連携していない・未ログインの場合もリングは消さず、updateSelfStatusRankRing側の
// 中立的な既定表示（UNLINKED_RANK_TIER）にフォールバックする。
async function refreshSelfStatusRankRing() {
  const user = await getCurrentUser();
  if (!user) {
    updateSelfStatusRankRing(null);
    return;
  }
  try {
    const profile = await fetchStatsProfile(user.id);
    updateSelfStatusRankRing(profile.linked ? profile.tier : null);
  } catch (err) {
    console.error("refreshSelfStatusRankRing failed", err);
  }
}
onAuthChange(refreshSelfStatusRankRing);
refreshSelfStatusRankRing();

// ユーザー要望「ヘルプボタンの横に通貨アイコンと所持金額を表示させたい」。ログイン状態が
// 変わるたび（ログイン/ログアウト直後）に残高を読み直す。対局終了時の付与・shop.jsでの
// 購入直後もそれぞれの呼び出し元から直接refreshCurrencyDisplay()を呼ぶ。
onAuthChange(refreshCurrencyDisplay);
refreshCurrencyDisplay();

// 管理者モードの「ランクリングの位置・太さ」スライダー用プレビュー（admin.jsの
// registerRankRingPreviewHelper経由で呼ばれる、previewStartPlayerModalと同じ
// 注入パターン）。実際の戦績連携状況に関わらず、レインボー柄（最も複雑な見た目）を
// 仮表示して位置・太さを調整できるようにする。スライダーを操作している間は
// 何度も呼ばれるが、そのたびにタイマーを延長するだけで実害はない。放置すると
// 30秒後に自動で本来の表示（refreshSelfStatusRankRing）に戻る。
let rankRingPreviewTimer = null;
function previewRankRing() {
  updateSelfStatusRankRing(getTierInfo(15));
  clearTimeout(rankRingPreviewTimer);
  rankRingPreviewTimer = setTimeout(() => {
    rankRingPreviewTimer = null;
    refreshSelfStatusRankRing();
  }, 30000);
}
registerRankRingPreviewHelper(previewRankRing);

// 相手ゲート侵攻ボーナスが発生した時（誰がターン終了を押したかに関わらず、部屋の全員に
// 届く。online.jsのsubscribeToGame()参照）、1件ずつ画面中央のモーダルで自動送りしながら
// 知らせる（gate-invasion-modal.js）。以前は右下トーストを間隔なく連続で出していたため、
// 何が起きたか分からないほど積み重なってしまっていた。
onGateInvasionEvents((events) => {
  enqueueGateInvasionSteps(events);
});
