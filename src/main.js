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
  registerAdminAuthHelpers,
  refreshAdminOnlySection,
} from "./admin.js";
import { logAction, initActionLogPanel } from "./action-log.js";
import { initDeckViewer, openDeckViewer } from "./deck-viewer.js";
import { initStatsPlayerLinkModal } from "./stats-player-link.js";
import { initMyPage, registerAvatarPickerHelper, registerProfilePageOpener } from "./my-page.js";
import { openProfilePage } from "./profile-page.js";
import { initRankingIcon } from "./ranking-page.js";
import { openEmotePicker } from "./emote.js";
import { initCardDevMode, registerCardDevModeArrivalHelpers } from "./card-dev-mode.js";
import {
  canAutoProcessArrival,
  runArrivalEffect,
  canUseHandEffect,
  runHandEffect,
  canPayHandEffectCost,
  hasHandEffectData,
  isHandEffectReactiveOnly,
  isAutoProcessingEnabled,
  setAutoProcessingEnabled,
  isHandEffectUsableAnytime,
  getMoveCandidates,
  getAnyCellWithCardCandidates,
  findSameColorDiscardCandidates,
  rotatedActivePlayersFrom,
} from "./card-effect-engine.js";
import {
  reconcilePhaseAutomation,
  registerPhaseAutomationHelpers,
  isHandPhaseActive,
  setHandEffectBusy,
  isHandEffectBusy,
  isMovePhaseActive,
  markPhaseMoveActionTaken,
  setTurnAnnounceActive,
  getCurrentPhase,
  isCardLockable,
  forceEndCurrentPhase,
} from "./phase-automation.js";
import { initHelpButton } from "./help.js";
import { initDiscordLink } from "./discord-link.js";
import { initBoardViewToggle } from "./board-view-toggle.js";
import { getOptionArea } from "./option-area.js";
import { initCurrencyDisplay, refreshCurrencyDisplay, showCurrencyAwardEffect } from "./currency-display.js";
import { initShop, openShopPanel } from "./shop.js";
import { initGameSetup, previewStartPlayerModal, showStartPlayerModal } from "./game-setup.js";
import { initOptionsMenu } from "./options-menu.js";
import {
  runGateInvasionsIfNeeded,
  registerEternalAnimHelpers,
  registerGateInvasionStealHelper,
  hasAnyGateInvasionCandidate,
} from "./gate-invasion.js";
import { announceHandPickups, announceCardLocked, announceDrawCount } from "./hand-announcer.js";
import { enqueueGateInvasionSteps, isGateInvasionQueueActive, registerOnGateInvasionQueueDrained, reapplyGateInvasionModal, registerGateInvasionModalEternalAnim, registerGateInvasionModalStealAnim } from "./gate-invasion-modal.js";
import { checkForVictory, wouldCompleteLockWithNewIndex, getLockedCount, resetVictoryTracking, hasAnyoneWon } from "./victory.js";
import { recordContactMade, recordCardUsed, recordLockSnapshot, initMatchStatsTracker } from "./match-stats-tracker.js";
import { initPseudoCpuPrompt } from "./pseudo-cpu-prompt.js";
import { registerVictoryHelpers } from "./post-game-panel.js";
import { announceTurnChange } from "./turn-announce.js";
import {
  buildFinalLockApprovalBanner,
  updateFinalLockApprovalBanner,
  registerFinalLockApprovalHandler,
  registerGomennasaiHelpers,
} from "./final-lock-approval.js";
import {
  buildTimerToggleButton,
  updateTimerToggleButton,
  buildTimerToggleBanner,
  updateTimerToggleBanner,
  registerTimerToggleHandlers,
} from "./timer-toggle.js";
import {
  buildContactApprovalModal,
  updateContactApprovalModal,
  registerContactApprovalHandler,
  hideContactApprovalModalImmediately,
  registerCounterLockHelpers,
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
import { openPetPicker, registerPetHelpers, getSelectedPetIndex, PET_OPTIONS } from "./pet-skins.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getPlayerName, getPlayerAvatar, setPlayerName, setPlayerAvatar, AVATAR_OPTIONS } from "./player-identity.js";
import { applyAvatarContent, getAvatarVariant, getAwakenedVariant, getEnragedVariant } from "./avatar-render.js";
import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { buildAvatarUploadSection } from "./avatar-upload.js";
import { isLockAreaBarVisible, setLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible } from "./lock-color.js";
import { isArrivalEffectDisabled, isFlightAnimationDisabled } from "./motion-prefs.js";
import { rectCenter, flyGhost } from "./ghost-flight.js";
import { showCardArrivalModal, hideCardArrivalModalImmediately } from "./card-arrival.js";
import {
  showHandEffectUseModal,
  hideHandEffectUseModalImmediately,
  showHandEffectOptionPicker,
  showEffectReasonModal,
  showCardReceivedModal,
  REASON_MODAL_TOTAL_MS,
} from "./hand-effect-ui.js";
import { initPlayerButtons } from "./player-buttons.js";
import { initQuickStart } from "./quick-start.js";
import { initPhaseGuide } from "./phase-guide.js";
import { initUpdateChecker, setUpdateBannerGate, reevaluateUpdateBanner } from "./update-checker.js";
import { initTutorialAutoStart, registerTutorialStageHelpers } from "./tutorial.js";
// チュートリアルCPU戦（台本化された練習試合）へ、ロック効果アニメとステージ座標変換を注入する。
import { registerTutorialBattleHelpers, isTutorialBattleActive } from "./tutorial-battle.js";
import { isAutoDragRestrictionEnabled } from "./auto-drag-restriction.js";
import { initPiecePets, registerPiecePetHelpers } from "./piece-pet.js";
// 「ロック前・手札使用前」の確認モーダルを出すかどうかの設定（全デバイス共通、
// 「今後表示しない」でオフ・オプションの基本設定でオンに戻せる）。
import { isActionConfirmEnabled, setActionConfirmEnabled } from "./action-confirm-prefs.js";
import { registerTutorialBattleUiHelpers } from "./tutorial-battle-ui.js";
import { initTurnTimer, transferPriorityTo, isPseudoCpuTarget } from "./turn-timer.js";
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
  suppressNextHandDrawDiff,
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
  requestTimerToggle,
  respondTimerToggle,
  requestAutoProcessingToggle,
  respondAutoProcessingToggle,
  requestContact,
  respondContact,
} from "./state.js";
import { initOnlineUi, openOnlinePanel, isOnlineIntentActive } from "./online-ui.js";
import { initOpeningScreen, previewOpeningAuras } from "./opening-screen.js";
import {
  getSelfSeat,
  isSpectatingGame,
  getSpectateMode,
  leaveGame,
  getCachedUser,
  getCurrentUser,
  getCurrentGameId,
  onAuthChange,
  fetchAndHydrate,
  onGateInvasionEvents,
  broadcastContactTackle,
  onContactTackleEvents,
  broadcastContactApproved,
  onContactApprovedEvents,
  broadcastContactPickResolved,
  onContactPickResolvedEvents,
  broadcastRitualPickStarted,
  onRitualPickStartedEvents,
  broadcastRitualPickHover,
  onRitualPickHoverEvents,
  broadcastRitualPickEnded,
  onRitualPickEndedEvents,
  broadcastCardReceived,
  onCardReceivedEvents,
  broadcastHandEffectUse,
  onHandEffectUseEvents,
  broadcastEffectReason,
  onEffectReasonEvents,
  broadcastColorsDeclared,
  onColorsDeclaredEvents,
  broadcastColorsResolved,
  onColorsResolvedEvents,
  broadcastAutoProcessingResolved,
  onAutoProcessingResolvedEvents,
  broadcastArrivalDelegateRequest,
  onArrivalDelegateRequestEvents,
  broadcastArrivalDelegateResolved,
  onArrivalDelegateResolvedEvents,
  broadcastCursorPosition,
  onCursorPositionEvents,
  broadcastAnytimeCheckpoint,
  onAnytimeCheckpointEvents,
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
  claimDailyLoginBonus,
  isAdminUser,
  adminGrantCurrency,
  getAdminStats,
  isGateInvasionPending,
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
  // 手品師の技（ユーザー要望「駒ではなくアバターを選択して相手を選ぶ」）用。
  // どのプレイヤーのアバターかをクリック判定側（requestPlayerChoiceForEffect）が
  // 特定できるようにする。
  avatarEl.dataset.player = player;
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
  // ユーザー要望「管理者モードにスマホ用の調整項目を追加、自分の手札のサイズも」→
  // 「自分の手札位置サイズ回転は2D表示時限定にしてください」。--hand-a-sizeはCSSの
  // var()フォールバックチェーンではなくここでJSが直接読んでインラインwidth/heightに
  // 反映する実装のため、スマホ専用の上書きもJS側で「スマホ・かつ2D表示中なら-phone値を
  // 優先、それ以外は通常値」という同じ考え方で判定する（CSS側のtransform/回転を
  // body.diagnostic-flatten-3d.is-phone-deviceに揃えたのと同じ条件）。
  const rootStyle = getComputedStyle(document.documentElement);
  const phoneOverrideRaw =
    document.body.classList.contains("is-phone-device") && document.body.classList.contains("diagnostic-flatten-3d")
      ? rootStyle.getPropertyValue(`--hand-${HAND_VAR_LETTER[side]}-size-phone`).trim()
      : "";
  const baseSize = parseFloat(phoneOverrideRaw || rootStyle.getPropertyValue(`--hand-${HAND_VAR_LETTER[side]}-size`));
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
    const spectateAll = isSpectatingGame() && getSpectateMode() === "all";
    if (isSpectatingGame()) {
      // 観戦中は「自分の座席」の概念を使わない。allモードは全プレイヤーの手札を表向き
      // （god-view）、publicモードは全て裏向き（公開情報のみ）。自分専用の演出は付けない。
      if (spectateAll && token.cardId) {
        cardEl.className = "hand-card is-self";
        cardEl.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
      } else {
        cardEl.className = "hand-card is-facedown";
        cardEl.style.backgroundImage = `url("${getCardBackImagePath(token.cardId)}")`;
      }
    } else if (isSelf) {
      cardEl.className = "hand-card is-self";
      cardEl.style.backgroundImage = `url("${getCardImagePath(token.cardId)}")`;
      // ユーザー要望「白と黒のカードは自分の手札内でそれぞれの色の湯気のような神秘的な
      // オーラで纏われている演出を入れたい」。自分の手札だけが実際の色を知っている
      // （相手の手札は常に裏向きのため対象外）。
      const cardColor = getCardDefinition(token.cardId).color;
      if (cardColor === "white" || cardColor === "black") {
        cardEl.classList.add("has-mystic-aura", `aura-${cardColor}`);
      }
      // ユーザー要望「収穫と種まき等で獲得したカードを、手札の中で効果が終わるまで
      // 光らせてほしい」。render()はtable.innerHTML=""で毎回作り直されるため、DOM要素の
      // 参照ではなくtokenIdで状態を持ち、描画のたびにここで再適用する。
      if (token.id === glowingEffectHandTokenId || glowingDrawnHandTokenIds.has(token.id)) cardEl.classList.add("card-effect-just-acquired-glow");
      // ユーザー要望「スリカエを所持しているときは常に手札のスリカエに対し特殊な
      // EFFECTでめだたせてください」。「いつでも使える」＝持っている間ずっと使用可能な
      // ことを伝える常設演出（is-anytime-usable-glow、style.css参照）。
      if (isHandEffectUsableAnytime(token.cardId)) cardEl.classList.add("is-anytime-usable-glow");
      // ユーザー要望「ハンドフェイズに『善処の原則』等により使えない手札はトーンダウン
      // させてください」。自動処理モード中・ハンドフェイズ中に限り、構造化された
      // 手札効果データを持つのに今は使えない（使用回数上限・コスト不足・条件未達等、
      // canUseHandEffectがまとめて判定する）カードを視覚的に沈める。自動処理モードOFF
      // 中はcanUseHandEffect自体が常にfalseを返す（自己申告プレイの前提のため）ので、
      // 誤って全カードが沈んでしまわないようisAutoProcessingEnabled()も条件に含める。
      // ユーザー報告「『ゴメンナサイ』や『カウンターロック』は相手がロックや接触を
      // してこなければ使えないのでハンドフェイズで通常はトーンダウンさせるべき」への
      // 対応。これらは反応時専用でhandEffectデータ自体を持たないため、上の
      // hasHandEffectData前提の判定には乗らない——isHandEffectReactiveOnlyを別途見て、
      // Hand Phase中は常にトーンダウン対象にする（反応のタイミングでない限り絶対に
      // 使えないため、canUseHandEffect相当の可否判定は不要）。
      // ユーザー報告（続き68）「スリカエなどの効果でカードを返す時の選択対象としては
      // カウンターロックなども選べるはずなのに、トーンオフされたままで選びにくい」。
      // このトーンダウンは「今このカードの手札効果を自分から使えるか」の判定であり、
      // 「他の効果(activeEffectPicker.type==="hand")がこのカードを対象として選べるか」
      // とは別の話——スリカエ等は使用可否に関係なく手札の中身を対象に選べる。今まさに
      // このカードが選択待ちの候補になっている間は、トーンダウン自体を適用しない。
      const isEffectPickerCandidate =
        activeEffectPicker?.type === "hand" && activeEffectPicker.tokenIds.has(token.id);
      if (
        !isEffectPickerCandidate &&
        isAutoProcessingEnabled() &&
        isHandPhaseActive() &&
        ((hasHandEffectData(token.cardId) && !canUseHandEffect(token.cardId, token.id, player)) ||
          isHandEffectReactiveOnly(token.cardId))
      ) {
        cardEl.classList.add("hand-card-effect-unusable");
      }
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
    slot.appendChild(cardEl);
    // ユーザー要望「自動処理モードでは、公開エリアの捨てるボタンは非表示にする」。
    // 自動処理モードON中はターン終了時に公開カードが自動的に手札へ合流し捨て場処理も
    // エンジン側で行うため、手動の捨てるボタンは不要（かつ誤操作の元）。
    if (!isAutoProcessingEnabled()) {
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
      slot.appendChild(discardBtn);
    }
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
// ユーザー報告（続き72）「ザ・ギャンブルで宣言色が出た（＝手札を全て捨てるはずの
// ケース）のに、手札が２枚残ってしまう」。DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED
// （card-effect-engine.js）はhelpers.discardAndSync（＝この関数）を対象カードの数だけ
// 連続してawaitする単純なforループで呼んでいる。オンライン対戦中、他プレイヤーの
// 操作やターンタイマーの定期再同期等と重なって`version_conflict`等で1回失敗すると、
// 以前はcatchでconsole.errorへ流すだけでリトライせず、そのカード1枚だけが手札に
// 取り残されたまま何事もなかったかのように次のカードへ進んでいた（ローカルモードの
// 単体テストでは再現しない、オンライン特有の競合が原因と判断）。1回だけ、最新状態を
// 取り直してから同じ捨て操作をリトライするようにし、単発の一時的な競合では取りこぼさ
// ないようにする。
async function discardFromHandReveal(tokenId) {
  if (isOnlineMode()) {
    try {
      await sendTokenToPile(tokenId, "discard");
      markSelfHandled([tokenId]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("sendTokenToPile failed, retrying once after resync", err);
      try {
        await fetchAndHydrate(getCurrentGameId());
        // 既に何らかの理由でこのトークンが手札/公開エリアに無ければ（他経路で既に
        // 処理済み等）、再送する必要が無い。
        if (getState().tokens.find((t) => t.id === tokenId)) {
          await sendTokenToPile(tokenId, "discard");
          markSelfHandled([tokenId]);
          await fetchAndHydrate(getCurrentGameId());
        }
      } catch (retryErr) {
        console.error("sendTokenToPile retry failed", retryErr);
        render();
      }
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

// ユーザー要望「カード効果の自動処理」への対応。card-effect-engine.jsに実際の状態変更を
// 委譲し、ここではDOM操作が必要な3つのヘルパーだけを注入する（他の箇所と同じ「main.jsから
// 実際の関数を渡してもらう」パターン、ただしこちらは呼び出し元が直接引数で渡す形）。
// soundName（省略可）: card-effect-engine.jsのVERBS.MOVEがaction.soundをそのまま
// 渡してくる。ジャンプ台等、カードごとに専用の効果音を鳴らしたい場合だけ指定される
// （ユーザー要望「ジャンプ台で移動するときに専用の効果音を使ってください」）。未指定の
// 他のMOVEアクションは従来通り無音のまま。
// ユーザー報告「カウンターロックに到達した際、その下にマスチェンジが表向きで
// あったのに到達コンボが発生しないまま相手のターンに移った」の原因: 自動処理
// エンジン（card-effect-engine.jsのrunArrivalEffect）が、効果処理後にこのカード
// 自身を手札へ動かす既定動作でこのmoveAndSyncを呼ぶが、手動処理側の
// addArrivedCardToHand（到達モーダルの「手札に加える」ボタン）と違い、動かした
// 元のマスで新しく一番上になったカードの到達コンボ（maybeTriggerCardArrivalFor
// ExposedCard）を呼んでいなかった。SWAP_POSITION・FORCED_MOVE_TO_OWN_GATE等、
// このヘルパーはカード以外（駒）の移動にも広く使われているが、
// maybeTriggerCardArrivalForExposedCard自身が「移動元がcell/lockゾーンかつまだ
// 駒が乗っているか」を確認してから何もしなければ安全に無視するため、移動元を
// 記録して移動後に常に呼ぶだけで、駒の移動等の他の呼び出し元には影響しない。
// suppressArrival（省略可）: 試練の儀式（RITUAL_PLACE_MOVE_REPEAT）・マスチェンジ等の
// 入れ替え（swapPiecesForEffect）専用（続き59）。ユーザー報告「試練の儀式で本来
// 到達効果が発動しないはずの足元のカードが、相手のターン開始時に発動してしまう」の
// 原因: これらの効果はローカルの実行者自身はctx.arrivedAtをセットしないことで
// 正しく到達を抑制するが、オンライン対戦で他プレイヤーの操作を再現する
// remote-move-animator.jsは「駒の位置が変わって表向きカードの上にいる＝到達した」
// という単純な差分検知だけで動くため、この抑制を知らずに誤って発火させてしまって
// いた。moveToken()にsuppressArrivalを渡し、同期される駒トークン自身に
// arrivalSuppressedフラグとして記録することで、remote-move-animator.js側も
// これを見て判断できるようにする。
async function moveAndSyncForEffect(tokenId, location, soundName, suppressArrival) {
  const fromLocation = getState().tokens.find((t) => t.id === tokenId)?.location ?? null;
  if (isOnlineMode()) {
    try {
      await moveToken(tokenId, location, suppressArrival);
      markSelfHandled([tokenId]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("moveAndSyncForEffect failed", err);
    }
  } else {
    moveToken(tokenId, location, suppressArrival);
  }
  if (soundName) playSound(soundName);
  maybeTriggerCardArrivalForExposedCard(fromLocation);
}

// PLACE_CARDのsource:"self"用（ジャンプ台の手札効果等）。手札からマスへの移動は
// 既定で裏向きになる（state.jsのfaceUpForLocation）ため、表向き指定のカードだけ
// 移動直後にこれでめくる。移動直後は必ず裏向きになっているとstate.js側の実装から
// 保証できるため、トグル式のflipToken()を1回呼ぶだけで確実に表向きにできる。
async function flipToFaceUpForEffect(tokenId) {
  if (isOnlineMode()) {
    try {
      await flipToken(tokenId);
      markSelfHandled([tokenId]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("flipToFaceUpForEffect failed", err);
    }
  } else {
    flipToken(tokenId);
  }
}

// ジャンプ台の手札効果（PLACE_CARD source:"self" faceUp:true）専用。ユーザー報告
// 「自分の駒の下にジャンプ台を表向きに置いたのに到達効果が発動しなかった」の原因:
// 通常のドラッグ&ドロップでの配置はmaybeTriggerCardArrivalForCardを呼んでいるが、
// このカード自身を効果で置く経路（card-effect-engine.jsのPLACE_CARD、flipCardの後）
// にはその呼び出しが無かった。flipToFaceUpForEffectでめくった直後の最新state
// （faceUp/location）を読み直して、同じ判定関数にそのまま渡す。
function maybeTriggerArrivalForPlacedCardForEffect(location, cardId) {
  maybeTriggerCardArrivalForCard(location, cardId, true);
}

// PLACE_CARDのsource:"deck"用（終わりなき化学ゲンテクニーク・月下の漂流船プリドゥエン等）。
// 山札の一番上を、手札を経由せず直接そのマスへ裏向きで置く（performMoveFallbackAndEndTurn
// と同じ考え方）。
async function placeFromDeckForEffect(location) {
  if (isOnlineMode()) {
    try {
      await drawFromPile("deck", location);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("placeFromDeckForEffect failed", err);
      return;
    }
  } else {
    drawFromPile("deck", location);
  }
  playSound("cardPlace");
}

// SWAP_POSITION用（マスチェンジ等）。自分の駒と、targetLocationにいる相手の駒の位置を
// 入れ替える。「移動」ではないため（docs/cards.md補足）、到達判定・自動オープンは
// 一切行わない——呼び出し元（card-effect-engine.jsのrunAction）もctx.arrivedAtを
// セットしないため、これ単体で完結する。
async function swapPiecesForEffect(pieceTokenId, fromLocation, targetLocation) {
  const opponentPiece = getState().tokens.find(
    (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === targetLocation.row && t.location.col === targetLocation.col
  );
  if (!opponentPiece) return;
  // 「入れ替え」であり「移動」ではないため到達効果を得ない（docs/cards.md補足）。
  // 続き59のsuppressArrival（remote-move-animator.jsが誤って到達を再現しないように
  // するためのフラグ）を、入れ替わる両方の駒に付ける。
  await moveAndSyncForEffect(opponentPiece.id, { zone: "cell", row: fromLocation.row, col: fromLocation.col }, undefined, true);
  await moveAndSyncForEffect(pieceTokenId, targetLocation, undefined, true);
  // ユーザー要望「マスチェンジで入れ替わるときアニメで効果音を使用してください」。
  playSound("swap");
  render();
}

// 元々は手品師の技専用（ユーザー要望「一応、儀式的に相手の手札が裏向きの状態のまま
// 画面中央に拡大表示されてその中から選ぶ方式にしたい」）だったが、respondToContact
// （接触でカードを奪う時、ユーザー要望「スリカエの時同様、儀式的に裏向きの手札から
// カードを奪うステップを入れてください」）からも呼ばれる汎用の関数になった。
// targetPlayerは「相手」とは限らない——接触の場合はdefender自身の手札を、defender
// 自身の画面でこの通り儀式的に見せて選ばせる（自分の手札なので隠し情報の覗き見には
// ならない）。どちらの用途でも、ルール上「無作為に」を満たす必要があるため、実際に
// どのカードが選ばれるかは表示"順"をシャッフルすることで保証する——プレイヤーは
// 裏向きのカードを見た目上選んでいるが、中身（＝どの位置に何があるか）は分からない
// ため、実質的に無作為な選択になる。
// excludeTokenIds（省略可、Set）: ゲート侵攻ボーナスの「手札を半分奪う」のように
// 同じ相手の手札から複数枚を連続で儀式的に選ばせる時、既に選び終えた分を次回の
// 候補から除外するために使う（stealHandCardsRitualForGateInvasion参照）。
function requestOpponentHandRitualPick(targetPlayer, hint, excludeTokenIds) {
  return new Promise((resolve) => {
    const theirHand = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === targetPlayer && !excludeTokenIds?.has(t.id)
    );
    if (theirHand.length === 0) {
      resolve(null);
      return;
    }
    const shuffled = [...theirHand].sort(() => Math.random() - 0.5);
    // ユーザー要望「奪われる側もドキドキできるように、奪われる側にも表向きで表示
    // されて相手のマウスがどこにホバーされているかわかるようにしてほしい」。
    // targetPlayerが本物の相手（自分の手札を自分で見せているcontactのdefenderの
    // ケースは対象外＝targetPlayer===自分の時は覗き見にならないためそもそも実況
    // 不要）の時だけ、開始・ホバー移動・終了の3つの合図を送る。並び順（token id
    // 配列）を一緒に送ることで、相手の画面でも同じ左右位置に同じカードを表向きで
    // 表示でき、「今どの位置にカーソルがあるか」をindexだけで一致させられる。
    const isRitualBroadcastTarget = isOnlineMode() && targetPlayer !== getSelfSeat();
    if (isRitualBroadcastTarget) {
      broadcastRitualPickStarted({ targetPlayer, order: shuffled.map((t) => t.id) });
    }
    // ユーザー報告（続き99）「相手の手札選択モーダルが処理されず置いてけぼりに
    // なっている」への対応。このモーダルは活動中ずっとactiveEffectPickerに未登録
    // だったため、performPriorityTimeoutAutoAction()（続き95でoption/colorsにも
    // 対応済み）が代わりに解決する手段が無かった。cell/hand/player/option/colorsと
    // 同じパターンでtype:"opponentHand"として登録し、タイムアウト時にランダムな
    // 1枚を選べるようにする。settled二重呼び防止のため、通常のクリック/背景クリック
    // による決着もこの同じfinish()経由に統一する。
    let settled = false;
    function finish(token) {
      if (settled) return;
      settled = true;
      activeEffectPicker = null;
      backdrop.remove();
      modal.remove();
      if (isRitualBroadcastTarget) broadcastRitualPickEnded({ targetPlayer, pickedTokenId: token?.id ?? null });
      resolve(token ?? null);
    }
    const backdrop = createBackdrop(() => finish(null), { dim: true, zIndex: 10620 });
    const modal = document.createElement("div");
    modal.id = "sleight-ritual-modal";
    const title = document.createElement("div");
    title.className = "sleight-ritual-title";
    const pickHint = hint || `${getPlayerName(targetPlayer)}の手札から1枚選んでください`;
    // ユーザー要望「スリカエで1枚引っこ抜く前にシャッフル演出が欲しい」。まず一定時間、
    // 裏向きの手札をシャッフルしている演出を見せてから（この間はクリック不可）、実際の
    // 選択に移る。
    title.textContent = "シャッフル中…";
    modal.appendChild(title);
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "sleight-ritual-cards";
    const n = shuffled.length;
    shuffled.forEach((token, index) => {
      const cardEl = document.createElement("div");
      cardEl.className = "sleight-ritual-card";
      cardEl.style.backgroundImage = `url("${getCardBackImagePath(token.cardId)}")`;
      // シャッフル演出用: 1枚ごとに中央へ寄せる横移動量・回転（左右交互）・段差の開始遅延を設定。
      cardEl.style.setProperty("--shuffle-x", `${((n - 1) / 2 - index) * 1.1}rem`);
      cardEl.style.setProperty("--shuffle-rot", `${index % 2 === 0 ? 9 : -9}deg`);
      cardEl.style.animationDelay = `${(index % 4) * 0.06}s`;
      if (isRitualBroadcastTarget) {
        cardEl.addEventListener("pointerenter", () => broadcastRitualPickHover({ targetPlayer, index }));
      }
      cardEl.addEventListener("click", () => finish(token));
      cardsWrap.appendChild(cardEl);
    });
    modal.appendChild(cardsWrap);
    activeEffectPicker = { type: "opponentHand", tokens: shuffled, resolve: finish };
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    // シャッフル演出中はカードのクリックを無効化（is-shuffling→CSSでpointer-events:none）。
    // 演出が終わったらクリック可能にし、案内文を本来のピック文言へ切り替える。
    modal.classList.add("is-shuffling");
    const SHUFFLE_MS = 1100;
    setTimeout(() => {
      if (settled) return;
      modal.classList.remove("is-shuffling");
      title.textContent = pickHint;
    }, SHUFFLE_MS);
  });
}

// requestOpponentHandRitualPickの実況を受け取る側（対象＝targetPlayer自身）専用の
// 表示。自分の手札は自分にはもともと全て見えている情報のため、ここでは実際の
// cardIdを使って表向きで表示してよい（隠し情報の覗き見にはならない）。相手の
// マウス位置（broadcastRitualPickHoverのindex）に対応する位置のカードだけ光らせる。
let ritualPickWatchBackdrop = null;
let ritualPickWatchModal = null;
let ritualPickWatchTitleEl = null;
let ritualPickWatchCardEls = [];
let ritualPickWatchRevealTimer = null;
// ユーザー報告「奪う側に出る裏向きの手札と、奪われる側に出る表向きの手札の順番が
// 異なってしまっている」の調査用の防御策。マウスを素早く複数枚の上で動かしてから
// クリックすると、ホバー位置のbroadcast（ritual_pick_hover）が実際の結果
// （ritual_pick_ended）より後にネットワーク経由で届くことが理論上あり得る——その
// 場合、既にrevealRitualPickWatchResultで確定表示した後に、古いホバー位置がまた
// is-hoveredとして再表示され、確定した「奪われたカード」と矛盾する見た目になる。
// 一度確定した後は、以降のホバー通知を無視することでこれを防ぐ。
let ritualPickWatchResolved = false;
function closeRitualPickWatch() {
  clearTimeout(ritualPickWatchRevealTimer);
  ritualPickWatchRevealTimer = null;
  ritualPickWatchBackdrop?.remove();
  ritualPickWatchModal?.remove();
  ritualPickWatchBackdrop = null;
  ritualPickWatchModal = null;
  ritualPickWatchTitleEl = null;
  ritualPickWatchCardEls = [];
  ritualPickWatchResolved = false;
}
function openRitualPickWatch(order) {
  closeRitualPickWatch();
  const player = getSelfSeat();
  const tokensById = new Map(getState().tokens.filter((t) => t.kind === "card").map((t) => [t.id, t]));
  ritualPickWatchBackdrop = createBackdrop(() => {}, { dim: true, zIndex: 10619 });
  ritualPickWatchModal = document.createElement("div");
  ritualPickWatchModal.id = "sleight-ritual-modal";
  ritualPickWatchTitleEl = document.createElement("div");
  ritualPickWatchTitleEl.className = "sleight-ritual-title";
  ritualPickWatchTitleEl.textContent = "相手があなたの手札から1枚選んでいます…";
  ritualPickWatchModal.appendChild(ritualPickWatchTitleEl);
  const cardsWrap = document.createElement("div");
  cardsWrap.className = "sleight-ritual-cards";
  ritualPickWatchCardEls = order.map((tokenId) => {
    const token = tokensById.get(tokenId);
    const cardEl = document.createElement("div");
    cardEl.className = "sleight-ritual-card";
    cardEl.dataset.tokenId = tokenId;
    cardEl.style.backgroundImage = `url("${token ? getCardImagePath(token.cardId) : getCardBackImagePath(null)}")`;
    cardsWrap.appendChild(cardEl);
    return cardEl;
  });
  ritualPickWatchModal.appendChild(cardsWrap);
  document.body.appendChild(ritualPickWatchBackdrop);
  document.body.appendChild(ritualPickWatchModal);
}
// ユーザー要望「スリカエなどで手札が奪われる際に、奪われるカードが決まったら、
// そのカードを拡大し『このカードが奪われました』的な感じでわかるようにして
// ほしい」。ritual_pick_endedが選ばれたトークンid（pickedTokenId）を伴っている
// 場合（＝キャンセルではなく実際に選ばれて終わった場合）は、即座に閉じずに
// そのカードだけ拡大・発光させ、他のカードは薄暗くしてしばらく見せてから閉じる。
function revealRitualPickWatchResult(pickedTokenId) {
  if (!ritualPickWatchModal) return;
  ritualPickWatchResolved = true;
  if (ritualPickWatchTitleEl) ritualPickWatchTitleEl.textContent = "このカードが奪われました！";
  for (const el of ritualPickWatchCardEls) {
    const isPicked = el.dataset.tokenId === pickedTokenId;
    el.classList.remove("is-hovered");
    el.classList.toggle("is-stolen-reveal", isPicked);
    el.classList.toggle("is-not-picked", !isPicked);
  }
  clearTimeout(ritualPickWatchRevealTimer);
  ritualPickWatchRevealTimer = setTimeout(() => closeRitualPickWatch(), 1600);
}
onRitualPickStartedEvents(({ targetPlayer, order }) => {
  if (getSelfSeat() !== targetPlayer) return;
  openRitualPickWatch(order);
});
onRitualPickHoverEvents(({ targetPlayer, index }) => {
  if (getSelfSeat() !== targetPlayer) return;
  if (ritualPickWatchResolved) return;
  for (const el of ritualPickWatchCardEls) el.classList.remove("is-hovered");
  ritualPickWatchCardEls[index]?.classList.add("is-hovered");
});
onRitualPickEndedEvents(({ targetPlayer, pickedTokenId }) => {
  if (getSelfSeat() !== targetPlayer) return;
  if (pickedTokenId) {
    revealRitualPickWatchResult(pickedTokenId);
  } else {
    closeRitualPickWatch();
  }
});
onCardReceivedEvents(({ targetPlayer, cardId, subtitle }) => {
  if (getSelfSeat() !== targetPlayer) return;
  showCardReceivedModal(cardId, subtitle);
});
// ユーザー要望「カード効果を使用するために手札から使用するカードをドロップした時は、
// 自分を含め何のカードの使用が宣言されたか全員にわかるように表示してほしい」。
// 使った本人（fromPlayer）は既にannounceHandEffectUseForEffect内でローカル表示済み
// なので、ここでは自分以外からの通知だけを表示する。
onHandEffectUseEvents(({ fromPlayer, cardId, optionLabel }) => {
  if (fromPlayer === getSelfSeat()) return;
  showHandEffectUseModal(cardId, optionLabel);
  playSound("arrivalEffect");
  // ユーザー要望（続き76）「手札効果使用宣言の直後にも割り込みモーダルを出す」。
  // オンライン中、この宣言をした本人以外の全クライアントにもこの経路で届くため、
  // ここでも自分自身のいつでも使えるカードを確認する（本人側はannounceHandEffect
  // UseForEffect内で既に発火済み）。
  triggerAnytimeInterruptCheckpoint(getSelfSeat());
});
// ユーザー要望（続き70）「試練の儀式やザギャンブルでの結果は相手にもモーダルで
// 教えてあげてください」。使った本人は既にannounceEffectReasonForEffect内で
// ローカル表示済みなので、ここでは自分以外からの通知だけを表示する。
onEffectReasonEvents(({ fromPlayer, cardId, text }) => {
  if (fromPlayer === getSelfSeat()) return;
  showEffectReasonModal(cardId, text);
});
// ユーザー要望「試練の儀式やザ・ギャンブルなどで色宣言するとき相手が何色を宣言したかを
// 見える化したい」（続き62、続き65で丸い色アイコン＋常駐表示に改訂）。宣言した本人は
// 自分の操作（confirmBtnのクリックハンドラ）で既にshowDeclaredColorsIndicatorを
// 呼んでいるため、ここでは自分以外からの通知だけを表示する（onHandEffectUseEventsと
// 同じ考え方）。
onColorsDeclaredEvents(({ fromPlayer, colors }) => {
  if (fromPlayer === getSelfSeat()) return;
  showDeclaredColorsIndicator(fromPlayer, colors);
});
// 続き65: 色宣言の結果が判明した合図。自分自身の操作で判明した場合は
// announceColorsResolvedForEffect側で既にローカル表示を消しているため、ここでは
// 他プレイヤーからの通知だけを処理する（二重dismissしても実害は無いが、他の
// on*Eventsハンドラと同じ「自分以外だけ」の考え方に揃える）。
onColorsResolvedEvents(() => {
  dismissDeclaredColorsIndicator();
});

// ユーザー要望「全員のマウスカーソルの位置が全員に見える化したい。アバターとその
// プレイヤーの色、名前が載っているとわかりやすい」。オンライン中だけ、自分の
// マウス位置をステージのローカル座標（stageClientToLocal、STAGE_WIDTH×STAGE_HEIGHTの
// 固定仮想解像度——実際のウィンドウサイズに関わらず全クライアント共通の座標系）に
// 変換して間引きながら送信し（mousemoveはそのままだと頻度が高すぎるため）、他
// プレイヤーの位置を自分の画面にアバター・色・名前付きで表示する。ローカル対戦は
// 1画面共有のため対象外（isOnlineMode()チェック）。
const CURSOR_BROADCAST_INTERVAL_MS = 80;
let lastCursorBroadcastAt = 0;
window.addEventListener("mousemove", (e) => {
  if (!isOnlineMode()) return;
  const now = Date.now();
  if (now - lastCursorBroadcastAt < CURSOR_BROADCAST_INTERVAL_MS) return;
  lastCursorBroadcastAt = now;
  // ユーザー報告「Aが自分のゲートを指しても、Bの画面ではBのゲートを指しているように
  // 見える」への対応（続き52）で、盤面(#game-table)自身の矩形を基準にした割合座標
  // (u,v)へ回転をかけて送受信するようにしたが、その後ユーザーが実際に2画面で比較した
  // ところ、一方の画面ではズレていた。原因（実測で確認）: #game-table自身は
  // rotateX(-40deg)の3D傾き演出がかかっており、その`getBoundingClientRect()`は
  // 実際に描画されているマスの位置と単純な線形比例関係にならない（手前の行ほど
  // 実際の間隔が広く、奥の行ほど狭い——fitTableToViewport側で「3D変形された子要素の
  // 見た目の広がりをバウンディングボックス計算が正しく反映しない」と既に指摘・
  // 対策されていたのと同じ系統の問題、getEffectiveFitRect参照）。そのため
  // #game-table全体を単純に線形補間する方式では、送信側と受信側でウィンドウ
  // サイズ等が違うと誤差の出方も変わり、ズレて見えていた。
  // 対策: 盤面全体の矩形で線形補間するのをやめ、実際にクリック当たり判定で使って
  // いるのと同じ`elementsFromPoint`でカーソル直下の実際の`.cell`要素を探し、その
  // 「実座標(row,col)」＋「そのマス自身の矩形内でのどこか（0〜1の割合）」という
  // 形で送る。マス自身の矩形はgetBoundingClientRect()で正しく実際の描画位置を
  // 反映しており、かつdata-row/colは常に実座標（回転の影響を受けない、buildBoard
  // 参照）なので、送受信のどちらでも回転計算が一切不要になる（受信側は自分の画面で
  // 同じrow/colのマスを探し、その矩形に当てはめるだけでよい）。盤面上のマスを
  // 指していない（手札エリア等）場合だけ、従来通りステージ全体の座標をそのまま送る
  // フォールバックにする。
  const elements = document.elementsFromPoint(e.clientX, e.clientY);
  const cellEl = elements.map((el) => el.closest(".cell")).find(Boolean);
  if (cellEl) {
    const cellRect = cellEl.getBoundingClientRect();
    if (cellRect.width <= 0 || cellRect.height <= 0) return;
    const offsetX = (e.clientX - cellRect.left) / cellRect.width;
    const offsetY = (e.clientY - cellRect.top) / cellRect.height;
    broadcastCursorPosition({
      player: getSelfSeat(),
      mode: "cell",
      row: Number(cellEl.dataset.row),
      col: Number(cellEl.dataset.col),
      offsetX,
      offsetY,
    });
    return;
  }
  // ユーザー要望「カーソルの座標補正が49マスの範囲にしか及んでいない。ロックエリアにも
  // 拡大してほしい」（続き66）への対応。盤面マスと全く同じ考え方（実座標＋マス自身の
  // 矩形内での割合）で、ロックスロット（.lock-slot、data-side/data-indexが実座標）も
  // 対象に加える。
  const lockSlotEl = elements.map((el) => el.closest(".lock-slot")).find(Boolean);
  if (lockSlotEl) {
    const slotRect = lockSlotEl.getBoundingClientRect();
    if (slotRect.width <= 0 || slotRect.height <= 0) return;
    const offsetX = (e.clientX - slotRect.left) / slotRect.width;
    const offsetY = (e.clientY - slotRect.top) / slotRect.height;
    broadcastCursorPosition({
      player: getSelfSeat(),
      mode: "lock",
      side: lockSlotEl.dataset.side,
      index: Number(lockSlotEl.dataset.index),
      offsetX,
      offsetY,
    });
    return;
  }
  // ユーザー要望「盤面の外（ロックエリアより外）ではカーソル位置を相手に表示しない」。
  // 盤面マス（cell）でもロックスロット（lock）でもない場所（手札エリア・盤外・各種ボタン等）に
  // カーソルがある間は、座標を送らず「盤外にいる」合図だけ送り、相手側のカーソル表示を即座に消す。
  broadcastCursorPosition({ player: getSelfSeat(), mode: "hide" });
});

const remoteCursorEls = new Map(); // player -> { el, hideTimer }
const REMOTE_CURSOR_HIDE_MS = 3000; // 相手のカーソルがしばらく動かない/届かなくなったら消す

function ensureRemoteCursorEl(player) {
  let entry = remoteCursorEls.get(player);
  if (entry) return entry;
  const el = document.createElement("div");
  el.className = "remote-cursor";
  const avatarEl = document.createElement("div");
  avatarEl.className = "remote-cursor-avatar";
  applyAvatarContent(avatarEl, getPlayerAvatar(player));
  const nameEl = document.createElement("div");
  nameEl.className = "remote-cursor-name";
  nameEl.textContent = getPlayerName(player);
  el.appendChild(avatarEl);
  el.appendChild(nameEl);
  document.body.appendChild(el);
  entry = { el, hideTimer: null };
  remoteCursorEls.set(player, entry);
  return entry;
}
onCursorPositionEvents((payload) => {
  const { player } = payload;
  if (getSelfSeat() === player) return;
  if (!getState().activePlayers.includes(player)) return;
  const table = document.getElementById("game-table");
  if (!table) return;
  // 盤外（mode:"hide"）の合図が来たら、その相手のカーソル表示を即座に隠す（座標が
  // 来ないので新規生成もしない。まだ一度も出ていなければ何もしない）。
  if (payload.mode === "hide") {
    const existing = remoteCursorEls.get(player);
    if (existing) {
      clearTimeout(existing.hideTimer);
      existing.el.style.display = "none";
    }
    return;
  }
  const entry = ensureRemoteCursorEl(player);
  // 送信側と同じ理由（mousemoveハンドラのコメント参照）で、盤面上のマスを指していた
  // 場合（mode:"cell"）は自分の画面で同じrow/colのマスを探し、その実際の矩形に
  // 当てはめる——回転計算は一切不要（data-row/colは常に実座標のため）。盤面外
  // だった場合（mode:"stage"）だけ、従来通りステージ座標をそのまま使う。
  let x, y;
  if (payload.mode === "cell") {
    const cellEl = table.querySelector(`.cell[data-row="${payload.row}"][data-col="${payload.col}"]`);
    if (!cellEl) return;
    const rect = toStageLocalRect(cellEl.getBoundingClientRect());
    x = rect.left + payload.offsetX * (rect.right - rect.left);
    y = rect.top + payload.offsetY * (rect.bottom - rect.top);
  } else if (payload.mode === "lock") {
    // 続き66: ロックエリアも盤面マスと同じ「実座標＋矩形内の割合」方式で復元する。
    const lockSlotEl = table.querySelector(`.lock-slot[data-side="${payload.side}"][data-index="${payload.index}"]`);
    if (!lockSlotEl) return;
    const rect = toStageLocalRect(lockSlotEl.getBoundingClientRect());
    x = rect.left + payload.offsetX * (rect.right - rect.left);
    y = rect.top + payload.offsetY * (rect.bottom - rect.top);
  } else {
    x = payload.x;
    y = payload.y;
  }
  // 駒の色は対局中に変わらないが、駒自体がまだ配置されていない（セットアップ中）
  // 場合もあるため、届くたびに読み直す（一度も見つからなければ無地のまま）。
  const color = getState().tokens.find((t) => t.kind === "piece" && t.player === player)?.color;
  if (color) entry.el.style.setProperty("--cursor-color", `var(--color-${color})`);
  entry.el.style.left = `${x}px`;
  entry.el.style.top = `${y}px`;
  entry.el.style.display = "flex";
  clearTimeout(entry.hideTimer);
  entry.hideTimer = setTimeout(() => {
    entry.el.style.display = "none";
  }, REMOTE_CURSOR_HIDE_MS);
});

// SWAP_RANDOM_HAND_CARD用（手品師の技）。docs/cards.mdの実際の順序は「相手の
// 手札から無作為に1枚、あなたの手札に加える」→「あなたの手札から1枚、その相手の
// 手札に加える」で、返すカードは"受け取った後"の自分の手札から選ぶ——つまり直前に
// 奪ったカード自身も返却候補に含まれる。
// ユーザー報告「直前に奪ったカードも返すカードとして選べるはずなのに、奪った
// カードが手札に加わっていない状態で返すカードを選ばされる」への対応で、先に
// theirCardを自分の手札へ実際に移してから（オンライン中はここでfetchAndHydrateが
// 走り、盗んだカードの正体が自分のクライアントに正しく反映される）、返すカードを
// 選ばせる順序に変更した。返却選択をキャンセル（backdropクリック等）した場合は、
// 受け取りも巻き戻して効果全体を安全に中断できるようにする（以前の「まだ何も
// 動かしていない」前提が崩れるため、この巻き戻しが必要になった）。
async function swapHandCardWithOpponentForEffect(player, targetPlayer) {
  const theirCard = await requestOpponentHandRitualPick(targetPlayer, `${getPlayerName(targetPlayer)}の手札（裏向き）から1枚選んでください`);
  if (!theirCard) return;
  await moveAndSyncForEffect(theirCard.id, { zone: "hand", player });
  const myCard = await requestHandCardChoiceForEffect(player, "相手に渡すカードを手札から選択してください");
  if (!myCard) {
    await moveAndSyncForEffect(theirCard.id, { zone: "hand", player: targetPlayer });
    return;
  }
  await moveAndSyncForEffect(myCard.id, { zone: "hand", player: targetPlayer });
  playSound("cardPlace");
  // ユーザー要望「スリカエなどで渡されたカードは何が渡されたのか大きくモーダルで
  // 表示してわかるようにしてほしい」。受け取る側（targetPlayer）は相手の手札の
  // 中身を知らないため、渡し終えた直後に何を受け取ったのか大きく見せる。
  const subtitle = `${getPlayerName(player)}から受け取りました`;
  if (isOnlineMode() && targetPlayer !== getSelfSeat()) {
    broadcastCardReceived({ targetPlayer, cardId: myCard.cardId, subtitle });
  } else {
    showCardReceivedModal(myCard.cardId, subtitle);
  }
  render();
}

// ゲート侵攻ボーナス①「手札を半分奪う」専用。defenderの裏向きの手札からcount枚を
// 儀式的に選ぶ（requestOpponentHandRitualPickをcount回連続で呼ぶ、excludeTokenIds
// で既に選んだ分を次回の候補から除外する）。gate-invasion.jsはローカル対戦専用
// （オンライン中は無作為抽選をサーバー側で行う設計）のため、ここも1画面共有の
// ローカル対戦だけを対象にすればよい。
async function stealHandCardsRitualForGateInvasion(defender, count) {
  const stolen = [];
  const excludeTokenIds = new Set();
  for (let i = 0; i < count; i++) {
    const token = await requestOpponentHandRitualPick(
      defender,
      `${getPlayerName(defender)}の手札（裏向き）から奪うカードを選んでください（${i + 1}/${count}）`,
      excludeTokenIds
    );
    if (!token) break;
    stolen.push(token);
    excludeTokenIds.add(token.id);
  }
  return stolen;
}

// ユーザー要望「カード効果を使用するために手札から使用するカードをドロップした時は、
// 自分を含め何のカードの使用が宣言されたか全員にわかるように表示してください」。
// 自分の画面ではその場でshowHandEffectUseModalを表示しつつ、オンライン中は
// broadcastHandEffectUseで他の全プレイヤーへも同じ通知を送る（onHandEffectUseEvents
// 参照、自分自身の分は二重表示にならないよう除外している）。ローカル対戦は1画面
// 共有のため、ローカル表示だけで全員に見えている。
function announceHandEffectUseForEffect(cardId, optionLabel, player) {
  showHandEffectUseModal(cardId, optionLabel);
  // ユーザー要望「手札効果の使用が宣言されたときの効果音が欲しい。到達時の効果音を
  // 流用でよい」（続き62）。
  playSound("arrivalEffect");
  if (isOnlineMode()) {
    broadcastHandEffectUse({ fromPlayer: getSelfSeat(), cardId, optionLabel });
  }
  // ユーザー要望（続き76）「手札効果使用宣言の直後にも割り込みモーダルを出す」。
  triggerAnytimeInterruptCheckpoint(player ?? getSelfSeat());
}

// ユーザー要望「カウンターロックの到達効果について『あなたは１番少なくロックしている
// ので１枚ドローします』みたいなモーダルを出してからドローしてください。ほかの効果も
// プレイヤーが何が起きたのかわかるようになるべくモーダルで教えてあげてください」への
// 対応。モーダルを一瞬見せてから続きの処理へ進めるよう、少し間を空けてから返す
// （PHASE_SKIP_ADVANCE_DELAY_MSと同じ「読む時間を確保する」考え方）。
// ユーザー報告「試練の儀式のおめでとうモーダルが出てから次の色宣言モーダルまでが早すぎて
// 読めない」の原因: このモーダル自身の表示時間はhand-effect-ui.jsのREASON_MODAL_
// DURATION_MS（2600ms、フェードアウト分300msを含めるとREASON_MODAL_TOTAL_MS）だが、
// 呼び出し元はここで1200msしか待たずに次の処理（試練の儀式なら再度の色宣言モーダル）へ
// 進んでしまい、このモーダルがまだフェードアウトし切っていないうちに次のモーダルが
// 重なって出てしまっていた。表示モーダル自身の全表示時間と揃えて待つようにした
// （呼び出し元全てに影響するが、「次のモーダルと重ならないようにする」という目的自体は
// どの呼び出し元でも共通のため）。
async function announceEffectReasonForEffect(cardId, text) {
  showEffectReasonModal(cardId, text);
  // ユーザー要望（続き70）「試練の儀式やザギャンブルでの結果は相手にもモーダルで
  // 教えてあげてください」。以前は実行者本人の画面にしか表示していなかった。
  // hand_effect_useと同じ「見た目だけの合図」パターンで他プレイヤーへも中継する。
  if (isOnlineMode()) {
    broadcastEffectReason({ fromPlayer: getSelfSeat(), cardId, text });
  }
  await wait(REASON_MODAL_TOTAL_MS);
}

// ユーザー要望「選ぶ系の効果（選べる罠・パーティ・なないろの欠片 等）で、プレイヤーが
// 何を選んだかを全プレイヤーにモーダルで知らせる。今後の選ぶ系はすべてこの方針」。
// 既存の「効果理由モーダル（announceEffectReason: ローカル表示＋他クライアントへ中継）」
// をそのまま流用し、テキストだけ「○○が『△△』を選びました」に整形する。
async function announceEffectChoiceForEffect(cardId, player, optionLabel) {
  const label = String(optionLabel ?? "").trim();
  const text = label ? `${getPlayerName(player)}が「${label}」を選びました。` : `${getPlayerName(player)}が選択しました。`;
  await announceEffectReasonForEffect(cardId, text);
}

// ユーザー要望「効果が不発だった場合（例: マスチェンジで３マス以内に相手がいない等）は
// 『不発のためこのカードを手札に加えます』的なモーダルを出しましょう」。addsToHandは
// card-effects.jsのeffectDef.addsCardToHandAfterに対応する（false指定のカード＝
// ジャンプ台や黒の契約の烙印が不発になった場合は、このカード自身が手札には加わらない
// ため文言を分ける——盤面にそのまま残る）。announceEffectReasonForEffectと同じ理由で
// モーダル自身の全表示時間と揃えて待つ。
async function announceEffectFizzleForEffect(cardId, addsToHand) {
  showEffectReasonModal(cardId, addsToHand ? "不発のため、このカードを手札に加えます。" : "不発のため、何も起きませんでした。");
  await wait(REASON_MODAL_TOTAL_MS);
}

// なないろの欠片のhandEffectOptionsピッカーと全く同じUI（showHandEffectOptionPicker）を
// 選べる罠の到達効果でも流用する。「手札効果」専用に見える関数名だが実際は
// cardId・{id,label,usable}の配列だけを見る汎用コンポーネントのため問題なく使い回せる。
async function pickArrivalOptionForEffect(cardId, optionsWithUsability) {
  return pickOptionForEffect(cardId, optionsWithUsability);
}

// ユーザー要望（続き95）「タイムアウトで離脱者の選択をランダム/最有力候補で自動代行する」
// をshowHandEffectOptionPickerにも適用するための薄いラッパー。activeEffectPicker
// （cell/hand/player）と同じ「タイムアウト時にperformPriorityTimeoutAutoActionが
// 代わりに解決できるよう登録する」パターンをこのモーダルにも広げる。ここで登録した
// 選択肢自体は盤面のクリック判定（上のpointerdownリスナー）を通らない（モーダル自身の
// ボタンclickで完結する）ため、そちらのハンドラ側でtype:"option"/"colors"は
// 素通りさせるようガードを追加している（下のpointerdownリスナー参照）。
function pickOptionForEffect(cardId, optionsWithUsability) {
  return showHandEffectOptionPicker(cardId, optionsWithUsability, (resolveFn) => {
    activeEffectPicker = { type: "option", options: optionsWithUsability, resolve: resolveFn };
  }).then((option) => {
    activeEffectPicker = null;
    return option;
  });
}

// ザ・ギャンブル/試練の儀式専用: 色を宣言する（複数選択）モーダル。requirement:
// {minCount}なら「N色以上」（Nより多く選んでもよい）、{exactCount}なら「ちょうどN色」。
// COLORS（７色、白黒無色・虹は対象外）から選ばせ、確定ボタンは条件を満たすまで無効。
// ユーザー報告「画面の関係のないところをクリックしたらモーダルが消えちゃいました」＋
// 「カード効果は原則キャンセルできません。✕ボタンは不要です」への対応: 色宣言は必須の
// 作業（既にコストを払って効果を発動済みの状態）のため、キャンセルする手段を一切
// 設けない（backdropクリック・✕ボタン共に無し）。「宣言する」ボタンを押すまで
// 必ずこのモーダルに留まる。
const COLOR_LABEL_JA = { red: "赤", orange: "橙", yellow: "黄", green: "緑", blue: "青", pink: "桃", purple: "紫" };

// ユーザー要望（続き65）「宣言色の見える化は、色の漢字より選ぶ時に出てくる丸い色
// アイコンの方がわかりやすい。中央に表示されたらすっとそのまま画面左側にモーダルが
// 移行するのがいい。あと実際何色が出るか変わるまではモーダルを継続したい」への対応。
// showEffectReasonModal（数秒で自動的に消える汎用モーダル）とは別の専用UIにした
// （結果が判明するまで消えないようにするため、タイマーを持たせられない）。
let declaredColorsIndicatorEl = null;
function showDeclaredColorsIndicator(fromPlayer, colors) {
  dismissDeclaredColorsIndicator();
  const el = document.createElement("div");
  el.className = "declared-colors-indicator";
  const title = document.createElement("div");
  title.className = "declared-colors-indicator-title";
  title.textContent = `${getPlayerName(fromPlayer)}が宣言`;
  el.appendChild(title);
  const swatches = document.createElement("div");
  swatches.className = "declared-colors-indicator-swatches";
  for (const color of colors) {
    const dot = document.createElement("div");
    dot.className = "declared-colors-indicator-swatch";
    dot.style.setProperty("--swatch-color", `var(--color-${color})`);
    dot.title = COLOR_LABEL_JA[color] ?? color;
    swatches.appendChild(dot);
  }
  el.appendChild(swatches);
  document.body.appendChild(el);
  declaredColorsIndicatorEl = el;
  // 画面中央に出た直後は目立たせ、少し経ったら画面左側の隅へすっと移行して常駐させる
  // （CSSのtransitionで実際の移動アニメーションを担う、.is-cornerクラス参照）。
  requestAnimationFrame(() => {
    setTimeout(() => el.classList.add("is-corner"), 900);
  });
}
function dismissDeclaredColorsIndicator() {
  if (!declaredColorsIndicatorEl) return;
  declaredColorsIndicatorEl.remove();
  declaredColorsIndicatorEl = null;
}
// 色宣言の結果が判明した瞬間（試練の儀式のカードが置かれた／ザ・ギャンブルの公開ドローが
// 終わった）にcard-effect-engine.jsから呼ばれる。ローカルの表示を消し、オンライン中は
// 他プレイヤーにも「消してよい」と伝える。
function announceColorsResolvedForEffect() {
  dismissDeclaredColorsIndicator();
  if (isOnlineMode()) broadcastColorsResolved();
}

// cardId/player（続き62）: 確定した宣言色を他プレイヤーへ見える化するための
// broadcastColorsDeclared用。呼び出し元（card-effect-engine.jsのVERBS.DECLARE_COLORS）
// はctx.cardId/ctx.playerを既に持っているため、そのまま渡してもらう。
function declareColorsForEffect(requirement, cardId, player) {
  return new Promise((resolve) => {
    const selected = new Set();
    const isExact = requirement.exactCount != null;
    const required = isExact ? requirement.exactCount : requirement.minCount;

    let settled = false;
    let isPeeking = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      activeEffectPicker = null;
      backdrop.remove();
      modal.remove();
      peekHint.remove();
      resolve(result);
    }
    // ユーザー要望（続き95）「タイムアウトで離脱者の選択をランダム/最有力候補で自動代行
    // する」。activeEffectPicker（cell/hand/player/option）と同じパターンでこの色宣言
    // モーダルもtype:"colors"として登録し、performPriorityTimeoutAutoActionが放置された
    // 宣言を代わりに済ませられるようにする。盤面のクリック判定（pointerdownリスナー）は
    // このtypeを素通りさせる（下のガード参照）——このモーダル自身のボタンclickで完結する。
    activeEffectPicker = { type: "colors", requirement, resolve: finish };
    // ユーザー要望「作業を促すモーダルには『盤面を見る』ボタンをつけてほしい」
    // （showHandEffectOptionPickerと同じ仕組み）。createBackdrop()はinlineスタイルで
    // 背景色を付けているため、CSSクラスの切り替えではなく直接styleを書き換える。
    function setPeeking(value) {
      isPeeking = value;
      backdrop.style.background = value ? "transparent" : "rgba(0, 0, 0, 0.6)";
      modal.classList.toggle("is-peeking", value);
      peekHint.classList.toggle("show", value);
    }
    const peekHint = document.createElement("div");
    peekHint.className = "hand-effect-option-picker-peek-hint";
    peekHint.textContent = "盤面を確認中…クリックで選択画面に戻ります";

    const backdrop = createBackdrop(() => {
      if (isPeeking) setPeeking(false);
    }, { dim: true, zIndex: 10630 });
    const modal = document.createElement("div");
    modal.className = "declare-colors-modal";

    const title = document.createElement("div");
    title.className = "declare-colors-modal-title";
    title.textContent = isExact ? `色を${required}色宣言してください` : `${required}色以上、色を宣言してください`;
    modal.appendChild(title);

    const peekBtn = document.createElement("button");
    peekBtn.type = "button";
    peekBtn.className = "hand-effect-option-picker-peek-btn";
    peekBtn.textContent = "盤面を見る";
    peekBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setPeeking(true);
    });
    modal.appendChild(peekBtn);

    const grid = document.createElement("div");
    grid.className = "declare-colors-modal-grid";
    const swatchButtons = [];
    for (const color of COLORS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "declare-colors-modal-swatch";
      btn.style.setProperty("--swatch-color", `var(--color-${color})`);
      btn.title = COLOR_LABEL_JA[color] ?? color;
      btn.addEventListener("click", () => {
        if (selected.has(color)) selected.delete(color);
        else selected.add(color);
        btn.classList.toggle("is-selected", selected.has(color));
        updateConfirmState();
      });
      swatchButtons.push(btn);
      grid.appendChild(btn);
    }
    modal.appendChild(grid);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "declare-colors-modal-confirm";
    confirmBtn.textContent = "宣言する";
    confirmBtn.addEventListener("click", () => {
      const chosen = [...selected];
      if (isOnlineMode()) broadcastColorsDeclared({ fromPlayer: player, cardId, colors: chosen });
      // 続き65: 宣言した本人にも、結果が判明するまで残る常駐表示を出す（再宣言を
      // 繰り返す試練の儀式で「自分が何を宣言したか」を思い出せるように）。
      showDeclaredColorsIndicator(player, chosen);
      finish(chosen);
    });
    modal.appendChild(confirmBtn);

    function updateConfirmState() {
      const ok = isExact ? selected.size === required : selected.size >= required;
      confirmBtn.disabled = !ok;
    }
    updateConfirmState();

    document.body.appendChild(peekHint);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  });
}

// ザ・ギャンブル専用: player分の公開ドロー（表向き、publicDrawゾーン）をcount回行う。
// 「公開ドロー」ボタン（buildPublicDrawButton）と同じ経路（drawFromPile("deck",
// {zone:"publicDraw",player})）をcount回ループするだけの、効果専用の一般化版。
// 山札が途中で尽きたらそこで打ち切る（善処の原則）。戻り値は実際に引けたcardIdの配列。
async function publicDrawForEffect(player, count) {
  const drawnCardIds = [];
  for (let i = 0; i < count; i++) {
    if (isOnlineMode()) {
      try {
        const result = await drawFromPile("deck", { zone: "publicDraw", player });
        if (result?.revealedCardId) drawnCardIds.push(result.revealedCardId);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("publicDrawForEffect failed", err);
        break;
      }
    } else {
      const pileArray = getState().piles.deck;
      if (pileArray.length === 0) break;
      const cardId = pileArray[pileArray.length - 1];
      drawFromPile("deck", { zone: "publicDraw", player });
      drawnCardIds.push(cardId);
    }
  }
  if (drawnCardIds.length > 0) {
    playSound("cardDraw");
    announceHandPickups(player, drawnCardIds.map((cardId) => ({ cardId, wasPublic: true })));
  }
  render();
  return drawnCardIds;
}

// 奇跡の森 マンズウッド専用（PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END）:
// publicDrawForEffectと同じ公開ドローを行うが、戻り値がcardIdの配列ではなく実際の
// トークンid（あとで「このターン終了時にこれを捨てる」と覚えておくために必要、
// publicDrawForEffect自体はザ・ギャンブルの色一致判定用にcardIdの配列を返す設計の
// ため、戻り値の形を変えずに新しい関数として用意した）。drawCardsForEffectの
// findNewHandTokenIdsと同じ「前後の差分で新規トークンを特定する」パターンを
// publicDrawゾーンに対して使う。
async function publicDrawReturningTokensForEffect(player, count) {
  const before = new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === player)
      .map((t) => t.id)
  );
  await publicDrawForEffect(player, count);
  return getState()
    .tokens.filter((t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === player && !before.has(t.id))
    .map((t) => t.id);
}

// 試練の儀式専用: 山札の一番上を指定マスへ表向きで直接置き、置いたカードのcardIdを
// 返す（RITUAL_PLACE_MOVE_REPEATが置いたカードの色を判定するために必要）。
// placeFromDeckForEffect（増殖する樹々等、裏向き専用）とは別に用意した表向き版。
async function placeFromDeckFaceUpForEffect(location) {
  if (isOnlineMode()) {
    try {
      await drawFromPile("deck", location);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("placeFromDeckFaceUpForEffect failed", err);
      return null;
    }
  } else {
    drawFromPile("deck", location);
  }
  let token = findTopCardAt(location);
  if (!token) return null;
  if (!token.faceUp) {
    if (isOnlineMode()) {
      try {
        await flipToken(token.id);
        markSelfHandled([token.id]);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("placeFromDeckFaceUpForEffect flip failed", err);
        return null;
      }
    } else {
      flipToken(token.id);
    }
    playSound("cardFlip");
  }
  playSound("cardPlace");
  render();
  token = findTopCardAt(location);
  return token?.cardId ?? null;
}

// 合同建設専用: 「何もないマス」＝カードも駒も無いマス全て（範囲制限なし、盤面全体）。
function getEmptyCellCandidatesForEffect() {
  const candidates = [];
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      const occupied = getState().tokens.some(
        (t) => t.location.zone === "cell" && t.location.row === row && t.location.col === col && (t.kind === "card" || t.kind === "piece")
      );
      if (!occupied) candidates.push({ zone: "cell", row, col });
    }
  }
  return candidates;
}

// 合同建設専用: 「山札から」か「手札から」かを選ばせる小さな2択モーダル。
function requestPlaceSourceChoiceForEffect() {
  return new Promise((resolve) => {
    let settled = false;
    function finish(result) {
      if (settled) return;
      settled = true;
      activeEffectPicker = null;
      backdrop.remove();
      modal.remove();
      // performPriorityTimeoutAutoAction()側（type:"option"の分岐）はoptions配列の
      // 要素（{id,label,usable}）をそのまま渡してくるため、id部分だけ取り出す。
      // 手動クリック側は元々"deck"/"hand"の文字列を直接渡している（呼び出し元の
      // runJointConstructionTaskがsource==="hand"を文字列比較しているため、両者を
      // 同じ文字列に正規化する）。
      resolve(typeof result === "string" ? result : (result?.id ?? null));
    }
    // ユーザー報告「山札も手札もグレーアウトして押すことができません」の原因: このbackdropの
    // z-index（10625）が、流用しているモーダル本体（#sleight-ritual-modal、CSS側の
    // 固定z-index:10621）より高かったため、backdropがモーダルの手前に重なってしまい、
    // ボタンへのクリックが全てbackdrop側（＝キャンセル扱い）に奪われていた。
    // requestOpponentHandRitualPick等、同じ#sleight-ritual-modalを使う他の箇所と同じ
    // 10620（モーダル本体より低い値）に合わせて修正。
    const backdrop = createBackdrop(() => finish(null), { dim: true, zIndex: 10620 });
    const modal = document.createElement("div");
    // 見た目は儀式的ピックモーダルと同じ紫系スタイルを流用する。
    modal.id = "sleight-ritual-modal";
    const title = document.createElement("div");
    title.className = "sleight-ritual-title";
    title.textContent = "どこから置きますか？";
    modal.appendChild(title);
    const buttonsWrap = document.createElement("div");
    buttonsWrap.className = "place-source-choice-buttons";
    const deckBtn = document.createElement("button");
    deckBtn.type = "button";
    deckBtn.textContent = "🂠 山札から";
    deckBtn.addEventListener("click", () => finish("deck"));
    const handBtn = document.createElement("button");
    handBtn.type = "button";
    handBtn.textContent = "🖐 手札から";
    handBtn.addEventListener("click", () => finish("hand"));
    buttonsWrap.appendChild(deckBtn);
    buttonsWrap.appendChild(handBtn);
    modal.appendChild(buttonsWrap);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    // ユーザー報告（続き104、2クライアント実機テスト中に発見）「合同建設の『どこから
    // 置きますか？』モーダルだけ、疑似CPU対象がタイムアウトしても永久にフリーズする」
    // の原因: このモーダルだけactiveEffectPickerに未登録で、performPriorityTimeoutAutoAction
    // の①番の分岐（本コメント2373行目付近）が「解決待ちの選択が存在する」ことを
    // 検知できていなかった。cell/hand/player/colors/opponentHandと同じ登録パターンに
    // 合わせ、type:"option"（なないろの欠片等と同じ2択以上の選択肢モーダル用）として
    // 登録することで、他の効果選択モーダルと同じくタイムアウト時にランダムな
    // usable:true選択肢へ自動的に解決されるようにする。
    activeEffectPicker = {
      type: "option",
      options: [
        { id: "deck", label: "山札から", usable: true },
        { id: "hand", label: "手札から", usable: true },
      ],
      resolve: finish,
    };
  });
}

// 合同建設専用のタスクハンドラ。「何もない2マスに山札または手札から1枚ずつ裏向きで
// 置く」を、実際にこのプレイヤー本人の画面で（自分の番なら直接、他プレイヤーの番なら
// delegateToPlayerForEffect経由で）解決する。
async function runJointConstructionTask(player) {
  // ユーザー要望によりマス数を２→１に変更（続き51）。
  const emptyCells = getEmptyCellCandidatesForEffect();
  if (emptyCells.length === 0) return false; // 善処の原則: 置ける空きマスが無ければ何もしない
  // ユーザー指摘「『空いてるマス』ではなく『何もないマス』」——getEmptyCellCandidatesForEffect
  // 自体は元々「カードも駒も無いマス」を正しく候補にしていたが、案内文の言葉遣いだけ
  // 「空いている」になっていた。docs/cards.mdの表記に合わせて「何もない」に統一する。
  const dest = await requestCellChoiceForEffect(emptyCells, "何もないマスを選択してください");
  if (!dest) return false;
  const source = await requestPlaceSourceChoiceForEffect();
  if (!source) return false;
  if (source === "hand") {
    const handToken = await requestHandCardChoiceForEffect(player, "そのマスに置くカードを手札から選択してください");
    if (!handToken) return false;
    await moveAndSyncForEffect(handToken.id, { zone: "cell", row: dest.row, col: dest.col });
  } else {
    await placeFromDeckForEffect({ zone: "cell", row: dest.row, col: dest.col });
  }
  return true;
}

// スラム上がりの役人専用のタスクハンドラ。「手札が3枚になるまで自分で選んで捨てる」。
// 「ドロー」＝「山札から手札に加える」ため、公開ドロー（publicDrawゾーン）にある
// 分もここでの枚数カウントに含める（続き55、card-effect-engine.jsのgetHandTokens()と
// 同じ定義）。
async function runSlumOfficialDiscardTask(player) {
  let discardedAny = false;
  while (true) {
    const handCount = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.player === player && (t.location.zone === "hand" || t.location.zone === "publicDraw")
    ).length;
    if (handCount <= 3) break;
    const chosen = await requestHandCardChoiceForEffect(player, `手札が3枚になるまで捨ててください（あと${handCount - 3}枚）`);
    if (!chosen) break;
    await discardFromHandReveal(chosen.id);
    discardedAny = true;
  }
  return discardedAny;
}

// パーティー専用のタスクハンドラ。3択（移動/拾う/2枚オープン）から1つ選んで実行する。
// 選べる罠と同じshowHandEffectOptionPickerを流用し、選べない選択肢（候補0件）は
// グレー表示にする（善処の原則）。
async function runPartyOptionTask(player) {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === player);
  const moveCandidates = piece ? getMoveCandidates(piece.location, 1, false) : [];
  const boardCardCells = getAnyCellWithCardCandidates();
  const faceDownBoardCells = boardCardCells.filter((loc) => {
    const token = getState().tokens.find(
      (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === loc.row && t.location.col === loc.col
    );
    return token && !token.faceUp;
  });
  const options = [
    { id: "move", label: "１マス移動し、移動先の到達効果は得ない。", usable: moveCandidates.length > 0 },
    { id: "pickup", label: "場の任意の１枚をあなたの手札に加える。", usable: boardCardCells.length > 0 },
    { id: "open-two", label: "場の任意の２枚をオープンする。", usable: faceDownBoardCells.length >= 2 },
  ];
  if (!options.some((o) => o.usable)) return false;
  const chosen = await pickOptionForEffect("pink-party", options);
  if (!chosen) return false;
  // パーティで各プレイヤーが選んだ内容を全員に告知（choose-effect-reveal方針）。
  await announceEffectChoiceForEffect("pink-party", player, chosen.label);
  if (chosen.id === "move") {
    const dest = moveCandidates.length === 1 ? moveCandidates[0] : await requestCellChoiceForEffect(moveCandidates, "移動先のマスを選択してください");
    if (!dest) return false;
    // ユーザー報告「パーティの『1マス移動し移動先の効果を得ない』で移動先の到達効果が
    // 発動してしまう」の原因: ここでsuppressArrival(第4引数)を渡していなかったため、
    // 移動した駒トークンのarrivalSuppressedフラグが立たないままだった。このクライアント
    // 自身はこの下で明示的にtriggerCardArrivalを呼ばないため問題は起きないが、
    // remote-move-animator.jsは駒の位置の差分だけを見て「表向きカードの上にいる＝
    // 到達した」と判断し、arrivalSuppressedを見て初めて抑制する（続き59、試練の儀式・
    // マスチェンジと同じ理由）ため、フラグが立っていないと再同期時（オンライン中は
    // 自分自身のクライアントも含む）に誤って到達効果が発動してしまっていた。
    // card-effect-engine.jsのRITUAL_PLACE_MOVE_REPEAT（試練の儀式）と同じくtrueを渡す。
    await moveAndSyncForEffect(piece.id, dest, undefined, true);
    // ユーザー指摘「『移動』の定義にはオープンまで含まれる」（docs/rulebook.md「移動:
    // 自分の駒を、現在のマスからカードの置かれた別のマスに置き、そのカードが裏向きなら、
    // オープンする。」）。この選択肢は「移動先の到達効果は得ない」だけで「移動」自体は
    // 通常通り行うため、到達効果（triggerCardArrival）は呼ばないまま、移動先が裏向き
    // カードだった場合はオープンだけ行う。
    const destToken = findTopCardAt(dest);
    if (destToken && !destToken.faceUp) {
      await flipToFaceUpForEffect(destToken.id);
    }
    return true;
  }
  if (chosen.id === "pickup") {
    const dest = boardCardCells.length === 1 ? boardCardCells[0] : await requestCellChoiceForEffect(boardCardCells, "手札に加えるカードのあるマスを選択してください");
    if (!dest) return false;
    const token = findTopCardAt(dest);
    if (!token) return false;
    const wasFaceUp = token.faceUp;
    await moveAndSyncForEffect(token.id, { zone: "hand", player });
    onEffectCardAcquiredToHand(token.id, token.cardId, wasFaceUp);
    return true;
  }
  // open-two: 2枚選んでオープンする（手札に加えず、その場でめくるだけ）。
  const firstDest = await requestCellChoiceForEffect(faceDownBoardCells, "オープンするカードのあるマスを選択してください（1/2）");
  if (!firstDest) return false;
  const firstToken = findTopCardAt(firstDest);
  if (firstToken) await flipToFaceUpForEffect(firstToken.id);
  const remaining = faceDownBoardCells.filter((c) => !(c.row === firstDest.row && c.col === firstDest.col));
  if (remaining.length === 0) return true;
  const secondDest =
    remaining.length === 1 ? remaining[0] : await requestCellChoiceForEffect(remaining, "オープンするカードのあるマスを選択してください（2/2）");
  if (!secondDest) return true;
  const secondToken = findTopCardAt(secondDest);
  if (secondToken) await flipToFaceUpForEffect(secondToken.id);
  return true;
}

// 合同建設・スラム上がりの役人・パーティー共通: このタスクを「今この画面を見ている
// プレイヤー」が実際に解決する。delegateToPlayerForEffectから、自分の番ならその場で、
// 他プレイヤーの番ならbroadcast経由で対象プレイヤー本人の画面から呼ばれる。
async function runDelegatedArrivalTask(player, taskType) {
  if (taskType === "joint-construction") return runJointConstructionTask(player);
  if (taskType === "slum-official-discard") return runSlumOfficialDiscardTask(player);
  if (taskType === "party-option") return runPartyOptionTask(player);
  return false;
}

// 合同建設・スラム上がりの役人・パーティー専用: 効果の使用者（コーディネーター）が
// 対象プレイヤーへ選択を委任する。自分自身の番、またはローカル対戦（1画面共有）なら
// その場で直接解決する。オンライン中の他プレイヤーの番は、broadcast往復
// （online.jsのbroadcastArrivalDelegateRequest/Resolved）で対象プレイヤー本人の
// 画面に委任し、終わるまで待つ。
async function delegateToPlayerForEffect(player, taskType) {
  if (!isOnlineMode() || player === getSelfSeat()) {
    return runDelegatedArrivalTask(player, taskType);
  }
  // 続き75診断ログ: オンライン中の「全員がそれぞれ選ぶ」効果（パーティー等）の
  // 委任がどこで止まっているかを追えるようにする。
  logAction("diag-delegate", { phase: "request", player, taskType, turnPlayer: getState().turnPlayer });
  // ユーザー要望「手札効果で相手に選択をさせるカードなどでは優先権をその相手に渡す
  // ようにしてください」。接触の強制移動（transferPriorityTo(defender)、上の
  // respondContact周りの処理参照）と同じ考え方——合同建設・スラム上がりの役人・
  // パーティー等の「全員がそれぞれ選ぶ」効果で、相手の画面が選択待ちになっている間、
  // 手番プレイヤーがターン終了ボタンを押して相手の解決を置き去りにしてしまわないよう、
  // 委任している間だけ優先権をその相手へ一時的に移す。
  const turnPlayer = getState().turnPlayer;
  transferPriorityTo(player);
  // ユーザー報告「パーティに到達して効果の処理が終わっているのにターンが自動終了
  // せず、ターン終了ボタンも押せない」の調査で判明: 実際には「全員がそれぞれ選ぶ」
  // 効果（パーティー・合同建設・スラム上がりの役人）が、まだ選んでいない別の
  // プレイヤーの選択を正しく待っているだけだった（ローカルモードで両方の選択を
  // 実際に行うと正しく終了することを確認済み）。ただしオンライン中は、その相手の
  // 選択待ちの間、手番プレイヤーの画面には何も表示されず「固まった」ように見えて
  // しまう（相手のピッカー自体は相手本人の画面にしか出ないため）。既存の候補選択中
  // バナー（showEffectPickerHint）を使い、「待っている」ことだけでも伝える。
  showEffectPickerHint(`${getPlayerName(player)}さんの選択を待っています…`);
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  broadcastArrivalDelegateRequest({ player, taskType, requestId });
  const result = await new Promise((resolve) => {
    const unregister = onArrivalDelegateResolvedEvents((payload) => {
      if (payload.requestId !== requestId) return;
      unregister();
      resolve(payload.result);
    });
  });
  hideEffectPickerHint();
  logAction("diag-delegate", { phase: "resolved", player, taskType, result, returningPriorityTo: turnPlayer });
  transferPriorityTo(turnPlayer);
  return result;
}
// 受け手側: 自分宛ての委任リクエストが届いたら、このクライアント（＝対象プレイヤー
// 本人の画面）で実際に解決し、結果を送り返す。
onArrivalDelegateRequestEvents(({ player, taskType, requestId }) => {
  if (getSelfSeat() !== player) return;
  runDelegatedArrivalTask(player, taskType)
    .then((result) => broadcastArrivalDelegateResolved({ requestId, result }))
    .catch((err) => {
      console.error("runDelegatedArrivalTask failed", err);
      broadcastArrivalDelegateResolved({ requestId, result: false });
    });
});

// ユーザー報告「移動先候補のハイライトをクリックしても自動で移動しない」の原因調査で
// 判明: この盤面は3D的な傾き（テーブル演出）を持つため、駒・カードのドラッグは
// ネイティブのclickイベント（当たり判定がズレる。initDragHandlers直前のコメント参照）
// ではなく、#game-tableに1つだけ付けたpointerdownリスナー内でelementsFromPoint()を
// 使った自前の当たり判定に統一されている。以前の実装は個々のマス/手札カード要素へ
// 直接addEventListener("click", ...)していたため、その要素の上に乗っているカード等の
// pointerdownをinitDragHandlers側が先に処理してドラッグ開始・preventDefault()してしまい、
// 後続のclickイベント自体が発火しなかった（＝盤面上のカードがあるマスでは常に無反応）。
// 対応として、候補選択中は他の全ての盤面操作より先に割り込む必要があるため、
// captureフェーズのpointerdownリスナーを1つだけ用意し、選択待ち中はそれ以外の
// ヒットテスト・ドラッグ開始を一切通さない（ユーザー要望「盤面全体49マスに対し
// 移動候補しかクリックできないようにする」にも対応）。
// { type: "cell", candidates, resolve } | { type: "hand", tokenIds: Set, resolve } |
// { type: "player", players: Set, resolve } | { type: "option", options, resolve }
// （showHandEffectOptionPicker、続き95） | { type: "colors", requirement, resolve }
// （declareColorsForEffect、続き95） | { type: "opponentHand", tokens, resolve }
// （requestOpponentHandRitualPick、続き99）。"option"/"colors"/"opponentHand"は
// 盤面のクリック判定を使わずモーダル自身のボタン/カードで完結するため、盤面
// ヒットテスト用の下のpointerdownリスナーはこの3つを素通りさせる（該当箇所の
// ガード参照）。
let activeEffectPicker = null;
// ユーザー報告（続き106）「優先権が委任されたまま自動プレイが反応せず止まる」の対策で
// turn-timer.js側から使う。activeEffectPickerは「自分の画面が今まさに選択待ちか」という
// ローカルなUI状態にすぎず、state.priorityPlayer（誰の優先権か）とは独立した概念のため、
// 優先権を見ずにこれだけを監視する安全網（turn-timer.jsのtick()参照）に必要。
export function hasActiveEffectPicker() {
  return activeEffectPicker !== null;
}

// ユーザー報告「ジャンプ台の到達効果の移動先ハイライト時、ブラウザを最小化して
// また開きなおすとハイライトが消えてしまっている」。render()はstateが変わる
// たびに盤面（マス・手札・アバター）のDOM要素を丸ごと作り直すため、選択待ち中に
// 何らかの理由でrender()が呼ばれる（最小化からの復帰でも起こり得る）と、
// requestCellChoiceForEffect等が直接付けたハイライトclassは古い（今はもう
// 画面に無い）要素に残ったまま、新しい要素には引き継がれない。
// pendingPlacementLocations/justPlacedLocationsと同じ「render()の末尾で毎回
// 論理的な候補から貼り直す」パターンをactiveEffectPickerにも適用する。
function reapplyEffectPickerHighlights(table) {
  if (!activeEffectPicker) return;
  if (activeEffectPicker.type === "cell") {
    for (const loc of activeEffectPicker.candidates) {
      const el = findLocationElement(table, loc);
      if (el) el.classList.add("card-effect-target-cell");
    }
  } else if (activeEffectPicker.type === "hand") {
    for (const tokenId of activeEffectPicker.tokenIds) {
      const el = document.querySelector(`.hand-card[data-token-id="${tokenId}"], .hand-reveal-card[data-token-id="${tokenId}"]`);
      if (el) el.classList.add("card-effect-target-cell");
    }
  } else if (activeEffectPicker.type === "player") {
    for (const player of activeEffectPicker.players) {
      const el = document.querySelector(`.player-avatar[data-player="${player}"]`);
      if (el) el.classList.add("card-effect-target-avatar");
    }
  }
}

// ユーザー要望「収穫と種まきで獲得したカードを手札の中で効果が終わるまで光らせる」
// 「置き直す先のマスをハイライトして忘れないようにする」への対応。render()が
// table.innerHTML=""で毎回作り直すため、DOM要素の参照ではなくtokenId/locationで
// 状態を持ち、buildPlayerZone（手札）とrender()末尾（マス）でその都度再適用する。
// ユーザー要望「ドローで得たカードは手札の中で数秒ハイライトしてください（これは
// ほかのドローの時も共通です）」への対応で、単一のtokenIdではなく複数同時に光らせ
// られるSetに拡張し、各トークンごとに固定時間（DRAW_GLOW_HIGHLIGHT_MS）で自動的に
// 消えるようにした（効果全体の完了を待つ旧仕様のglowingEffectHandTokenIdとは別物）。
const glowingDrawnHandTokenIds = new Set();
const DRAW_GLOW_HIGHLIGHT_MS = 4000;
function glowHandTokensBriefly(tokenIds) {
  const ids = tokenIds.filter(Boolean);
  if (ids.length === 0) return;
  for (const id of ids) glowingDrawnHandTokenIds.add(id);
  render();
  setTimeout(() => {
    for (const id of ids) glowingDrawnHandTokenIds.delete(id);
    render();
  }, DRAW_GLOW_HIGHLIGHT_MS);
}
let glowingEffectHandTokenId = null;
// ユーザー要望「収穫と種まきの置き直す先のマスをハイライトして忘れないように」に加え、
// ユーザー報告「増殖する樹々の手札効果で、マスを選択するとき、どのマスが選択済みかが
// わかりづらい」への対応。PICKUP_TO_HANDでは常に1件だが、PLACE_CARDのCHOOSE（同じ効果
// 内でN回連続してマスを選ばせる場合、例: 増殖する樹々の「任意の3マスに置く」）では
// 選ぶたびに追加されて複数同時に貼りっぱなしになるためSetで持つ（justPlacedLocationsと
// 同じ「row,colキー文字列」形式）。
let pendingPlacementLocations = new Set();
// ユーザー要望「配置系効果は配置後ここに配置したよがわかるように配置場所をしっかり
// ハイライトしてください。マスの枠だけでなくカードの面もね！」。上のpendingPlacement
// Locationsは「これから置く場所」（置く前）の目印だが、こちらは「今まさに置いた場所」
// （置いた後）の目印で、効果全体の完了を待たず一定時間で自動的に消える（数秒で消える他の
// 演出と同じ考え方、対象マスは複数になり得るためSetで持つ）。
let justPlacedLocations = new Set();
let justPlacedClearTimer = null;

document.addEventListener(
  "pointerdown",
  (e) => {
    if (e.button !== 0) return;
    // ユーザー報告（続き76）「スマホでファーストカードサフランを使おうとタップしたら、
    // 画面が暗めになって手札以外のタップが効かなくなった。オプションボタンも
    // 触れなくなっていてログを渡せない」。原因判明: このリスナーはdocument全体に
    // capture:trueで付けており、activeEffectPicker（カード効果の候補選択待ち、
    // 例: サフランの追色コスト＝同じ色の手札を選ぶ）が立っている間は、盤面上の
    // 候補以外へのタップも含めて無条件にe.preventDefault()/e.stopPropagation()を
    // 呼んでいた——盤外の#option-area（オプション/ヘルプ/マイページ等）へのタップも
    // 巻き添えで無効化されてしまい、選択に失敗すると（候補の当たり判定を外す等）
    // 一切の復旧手段が無いまま画面全体が固まって見える状態になっていた。#option-area
    // 内のタップだけは、盤面の選択状態に関係なく常に通常通り機能させる（ここで早期
    // returnし、preventDefault/stopPropagationを一切呼ばない）。
    if (e.target.closest("#option-area")) return;
    if (!activeEffectPicker) {
      // ユーザー要望「ムーブフェイズでの移動先ハイライトをクリックしたら自動で移動する」。
      // カード効果の候補選択（activeEffectPicker）と同じ「3D傾き演出のためネイティブ
      // clickは使えず、elementsFromPoint()による自前の当たり判定＋captureフェーズで
      // 他の全ての盤面操作より先に割り込む」手法をそのまま使う。
      if (isMovePhaseActive()) {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of elements) {
          const cellEl = el.closest(".cell");
          if (!cellEl) continue;
          const isMoveTarget = cellEl.classList.contains("phase-move-highlight");
          const isContactTarget = cellEl.classList.contains("phase-contact-highlight");
          if (isMoveTarget || isContactTarget) {
            e.preventDefault();
            e.stopPropagation();
            const location = { zone: "cell", row: Number(cellEl.dataset.row), col: Number(cellEl.dataset.col) };
            // ハマりどころ: markPhaseMoveActionTaken()はハイライトのクラス（.phase-move-
            // highlight等）をすぐに剥がすため、isMoveTarget/isContactTargetは呼ぶ前に
            // 判定・変数へ保存しておく必要がある（後から判定するとクラスが既に無く
            // なっていて、意図せず「接触」扱いになってしまうバグがあった）。
            if (isMoveTarget) {
              // 移動はこのクリックで確定するので、ここで行動済みにする。
              markPhaseMoveActionTaken();
              performPhaseMoveToCell(location);
            } else {
              // ユーザー報告「自動処理モードで、ムーブフェイズで接触しようと相手の駒を
              // クリックしてそれをキャンセルしたら、ターン終了しちゃいました」。接触は
              // このクリックの時点ではまだ「申し込みの確認モーダル」を出すだけで確定して
              // いない（キャンセルできる／相手の承認も要る）。ここで先にmarkPhaseMove
              // ActionTaken()を呼んでしまうと、moveActionTaken=trueかつpendingContactも
              // 無い状態になり、computeShouldEmphasize()が「これ以上何も起きない」と誤判定
              // してreconcileAutoEndTurnが自動でターンを終わらせてしまっていた。行動済みに
              // するのは実際に接触が成立した時（submitContactProposal内、requestContact成功後）
              // まで遅らせる。キャンセル時はハイライトも残るので、そのまま別の移動/接触を
              // やり直せる。
              performPhaseContact(location);
            }
          }
          return;
        }
      }
      // ユーザー要望「ロックフェイズでロックできるカードが光りますが、クリックで自動で
      // ロックされるようにもしてください。ドロップでもロックできるのは継続で」。
      // ハイライト（.phase-lock-highlight）を光らせている判定基準と同じisCardLockable()
      // をそのまま使い、クリックされたカードを対応する色のロックスロットへ直接動かす。
      if (getCurrentPhase() === "lock") {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of elements) {
          const cardEl = el.closest(".hand-card");
          if (!cardEl) continue;
          if (cardEl.classList.contains("phase-lock-highlight")) {
            e.preventDefault();
            e.stopPropagation();
            performLockPhaseClick(cardEl.dataset.tokenId);
          }
          return;
        }
      }
      return;
    }
    // ユーザー要望（続き95）「タイムアウトで離脱者の選択をランダム/最有力候補で自動
    // 代行する」への対応でactiveEffectPickerにtype:"option"/"colors"（showHandEffect
    // OptionPicker・declareColorsForEffectのモーダル）を追加した。この2つは盤面の
    // マス/手札/アバターのクリック判定ではなく、モーダル自身のボタンclickで完結する
    // ため、ここで盤面全体のクリックを丸ごと奪ってしまう（下のpreventDefault/
    // stopPropagation）と、モーダルのボタン自体が押せなくなってしまう。cell/hand/
    // player以外のtypeはここで素通りさせる。
    if (activeEffectPicker.type !== "cell" && activeEffectPicker.type !== "hand" && activeEffectPicker.type !== "player") return;
    e.preventDefault();
    e.stopPropagation();
    const picker = activeEffectPicker;
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    if (picker.type === "cell") {
      for (const el of elements) {
        // 「これ以上選ばない」スキップボタン（任意選択の効果、requestCellChoiceForEffectの
        // options.allowSkip参照）。このハンドラがstopPropagationするためボタン自身のclickは
        // 届かないので、ここで拾ってresolve(null)（＝もう選ばない）にする。
        if (el.closest("#card-effect-skip-button")) {
          activeEffectPicker = null;
          picker.resolve(null);
          return;
        }
        const cellEl = el.closest(".cell");
        if (cellEl) {
          const row = Number(cellEl.dataset.row);
          const col = Number(cellEl.dataset.col);
          const match = picker.candidates.find((c) => c.zone === "cell" && c.row === row && c.col === col);
          if (match) {
            activeEffectPicker = null;
            picker.resolve(match);
          }
          return;
        }
        // なないろの欠片のLOCK_PAIR等、候補がロックスロットの場合（getOwnLockSlotCandidates
        // 参照）。以前はここに無く、ロックスロットをクリックしても何も起きないバグだった。
        const lockSlotEl = el.closest(".lock-slot");
        if (lockSlotEl) {
          const side = lockSlotEl.dataset.side;
          const index = Number(lockSlotEl.dataset.index);
          const match = picker.candidates.find((c) => c.zone === "lock" && c.side === side && c.index === index);
          if (match) {
            activeEffectPicker = null;
            picker.resolve(match);
          }
          return;
        }
      }
      return;
    }
    if (picker.type === "hand") {
      for (const el of elements) {
        const cardEl = el.closest(".hand-card") ?? el.closest(".hand-reveal-card");
        if (!cardEl) continue;
        if (picker.tokenIds.has(cardEl.dataset.tokenId)) {
          activeEffectPicker = null;
          const token = getState().tokens.find((t) => t.id === cardEl.dataset.tokenId);
          picker.resolve(token ?? null);
        }
        return;
      }
    }
    if (picker.type === "player") {
      // 手品師の技（ユーザー要望「駒ではなくアバターを選択して相手を選ぶ」）用。
      for (const el of elements) {
        const avatarEl = el.closest(".player-avatar");
        if (!avatarEl) continue;
        const player = avatarEl.dataset.player;
        if (picker.players.has(player)) {
          activeEffectPicker = null;
          picker.resolve(player);
        }
        return;
      }
    }
  },
  { capture: true }
);

// ユーザー要望「ムーブフェイズでの移動先ハイライトをクリックしたら自動で移動し、移動先が
// 裏向きだったら自動でオープンしてほしい」への対応。通常のドラッグ移動と違い、裏向き
// カードでも「オープンする/しない」を尋ねず自動で開く（runAutoArrivalEffectの連鎖時と
// 同じ考え方——フェイズ自動進行の一部なので、着地後の判断もそこまで自動で進めるのが自然）。
async function performPhaseMoveToCell(location) {
  const player = getSelfSeat();
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === player);
  if (!piece) return;
  // ユーザー要望（続き77）「移動もロックも宣言と処理を分けてください」。実際に状態を
  // 動かす直前を「移動宣言」の瞬間とみなして発火する（処理側は下のtriggerCardArrival
  // 完了後、既存の通り）。
  fireAnytimeCheckpoint(player);
  if (isOnlineMode()) {
    try {
      await moveToken(piece.id, location);
      markSelfHandled([piece.id]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("performPhaseMoveToCell failed", err);
      render();
      return;
    }
  } else {
    moveToken(piece.id, location);
  }
  playSound("piecePlace");
  render();
  const card = findTopCardAt(location);
  if (!card) return;
  if (!card.faceUp) {
    if (isOnlineMode()) {
      try {
        await flipToken(card.id);
        markSelfHandled([card.id]);
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("performPhaseMoveToCell auto-open failed", err);
        return;
      }
    } else {
      flipToken(card.id);
    }
    playSound("cardFlip");
    render();
  }
  const freshCard = getState().tokens.find((t) => t.id === card.id);
  // ユーザー要望（続き76）「移動処理の直後にも割り込みモーダルを出す」。到達効果の
  // 自動処理が終わるまで待ってから発火させる（onFullyResolvedが無いと、到達効果の
  // 処理中フラグ(arrivalEffectAutoProcessing)がまだ立っている間にチェックポイントが
  // isAnyEffectProcessingBusy()で無条件にブロックされてしまう）。
  if (freshCard) triggerCardArrival(freshCard.cardId, location, () => fireAnytimeCheckpoint(player));
  else fireAnytimeCheckpoint(player);
}

// ロックフェイズのロック可能ハイライト（.phase-lock-highlight）をクリックした時。
// ドラッグ&ドロップでロックスロットへ動かした時（onDragEndのkind==="card"分岐、
// maybeAnnounceLock参照）と全く同じ結果になるよう、同じ関数・同じ順序（移動→
// 効果音→render()→ロック演出）で処理する。ロック先はカード自身の色に対応する
// 1つのスロットに一意に決まる（isCardLockableと同じ判定基準）。
async function performLockPhaseClick(tokenId) {
  const player = getSelfSeat();
  const token = getState().tokens.find((t) => t.id === tokenId);
  if (!token || !isCardLockable(token, player)) return;
  // ユーザー報告（続き85）「スマホでロックするとき手札効果の使用時同様の
  // 『ロックしますか？』的なモーダルが出ていない。誤操作防止の観点から出して
  // ほしい」。ドラッグ&ドロップでロックスロットへ動かした時（onDragEnd参照）は
  // 既にconfirmTouchActionを挟んでいたが、ロックフェイズのハイライトを直接
  // タップするこの経路（オートモード中、スマホでは主にこちらを使うと思われる）
  // には無かった。confirmTouchAction自体がタッチ端末以外では常にtrueを即座に
  // 返すため、PC側の挙動には影響しない。
  if (!(await confirmTouchAction(`${getCardDefinition(token.cardId).name}をロックしますか？`))) return;
  const color = getCardDefinition(token.cardId).color;
  const dropTarget = { zone: "lock", side: SEAT_TO_SIDE[player], index: COLORS.indexOf(color) };
  // 最後のロック承認: ドラッグ&ドロップ経路（onDragEndのkind==="card"分岐）と同じく、この
  // ロックで持ち主が7色すべて揃って勝利になる場合は、通常のmoveTokenを呼ばず、他の参加
  // プレイヤー全員の承認を待つ専用フローへ切り替える。
  // ユーザー報告「最後のロックの時に、ゴメンナサイとなないろの欠片を持っているのに止め
  // られなかった」の原因: この click/タップ経路（自動処理モードで主に使われる。人間の
  // タップ＝2238、疑似CPUの自動ロック＝2542の両方がここを通る）だけがこの分岐を持って
  // おらず、7色目のロックが承認を挟まずそのまま成立してしまい、割り込みでゴメンナサイを
  // 使う機会（final-lock-approval.js の承認バナー）が一切出なかった。ドラッグ経路と同じ
  // 処理をここにも移植する。ロックエリアの持ち主はロックする本人（player）自身。
  if (getState().pendingFinalLock) {
    render();
    return;
  }
  if (wouldCompleteLockWithNewIndex(player, dropTarget.index)) {
    const queue = getFinalLockApprovalOrder(player, getState().activePlayers);
    if (queue.length > 0) {
      // ロック宣言の瞬間としてチェックポイントを発火（ドラッグ経路と同じ）。
      fireAnytimeCheckpoint(player);
      if (isOnlineMode()) {
        try {
          await requestFinalLock(tokenId, dropTarget, player, queue);
          await fetchAndHydrate(getCurrentGameId());
        } catch (err) {
          console.error("requestFinalLock (lock phase click) failed", err);
        }
      } else {
        requestFinalLock(tokenId, dropTarget, player, queue);
      }
      render();
      return;
    }
    // 承認すべき他の参加プレイヤーがいない（1人でのテストプレイ等）場合は、承認不要で
    // 下の通常のロック処理へフォールスルーする。
  }
  // ユーザー要望（続き77）「移動もロックも宣言と処理を分けてください」。実際に状態を
  // 動かす直前を「ロック宣言」の瞬間とみなして発火する（処理側はmaybeAnnounceLock内、
  // 既存の通り）。
  fireAnytimeCheckpoint(player);
  if (isOnlineMode()) {
    try {
      await moveToken(tokenId, dropTarget);
      markSelfHandled([tokenId]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("performLockPhaseClick failed", err);
      render();
      return;
    }
  } else {
    moveToken(tokenId, dropTarget);
  }
  playSound("cardPlace");
  render();
  maybeAnnounceLock(dropTarget, token.cardId, false);
}

// ムーブフェイズの接触可能ハイライトをクリックした時。接触の実処理自体は既存の
// 「接触する/しない」確認プロンプトへそのままつなぐ（接触は他プレイヤーの承認が
// 絡む・DSL自動処理のスコープ外のため、ここでは宣言の入口だけを自動化する）。
function performPhaseContact(location) {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === getSelfSeat());
  const opponentPiece = getState().tokens.find(
    (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === location.row && t.location.col === location.col
  );
  if (!piece || !opponentPiece) return;
  showContactPrompt(piece.player, opponentPiece.player, opponentPiece.id);
}

function pickRandomFrom(arrayOrSet) {
  const arr = Array.isArray(arrayOrSet) ? arrayOrSet : [...arrayOrSet];
  if (arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ユーザー要望「タイマーが切れた場合、自動でスキップまたはターン終了をするように
// してください。なお移動先や効果の選択などの途中の場合はランダムで選択させるように
// してください。ロックフェイズのロックやハンドフェイズの手札使用は任意なので普通に
// スキップでいいです」。turn-timer.js側のtick()が、優先権保持者自身の砂時計を完全に
// 使い切った（stock<=0、警告表示になる）瞬間に一度だけ呼ぶ（このゲーム全体の
// 「座席を持っていれば何でも自由に操作できる、強制力の無い自己申告制」という設計
// 方針は変えず、あくまで「本人がタイムアウトした」という自己申告的な状況の続きとして、
// 本人のクライアント上でだけ行う——turn-timer.js側がgetSelfSeat()===priorityPlayerを
// 確認してから呼ぶ）。
// 優先度: ①効果解決中の候補選択待ち（activeEffectPicker、マス/手札/アバター/効果選択肢/
// 色宣言——続き95でoption・colorsを追加し、離脱者に放置された選択モーダル全般をカバー）→
// ②ムーブフェイズで移動/接触の候補待ち→③ロック/ハンドフェイズ（任意のため単純
// スキップ）。①②は「必ず何かしなければならない」場面のためランダムに1つ選んで実行し、
// ③は「何もしなくても進められる」場面のためフェイズを進めるだけにする。該当する状況が
// 無ければ何もしない（isAutoProcessingEnabled()がOFFでフェイズ自体を追跡していない
// 場合等、従来通り警告表示のみに留める）。
// 戻り値: 何も起きなければfalse、①②が起きればtrue、③（本当の意味でのスキップ）が
// 起きれば"skip"（turn-timer.js側が15秒回復の対象を区別するための専用値）。
export function performPriorityTimeoutAutoAction() {
  if (activeEffectPicker) {
    const picker = activeEffectPicker;
    activeEffectPicker = null;
    if (picker.type === "cell") {
      const choice = pickRandomFrom(picker.candidates);
      picker.resolve(choice);
    } else if (picker.type === "hand") {
      const tokenId = pickRandomFrom([...picker.tokenIds]);
      const token = tokenId ? getState().tokens.find((t) => t.id === tokenId) : null;
      picker.resolve(token ?? null);
    } else if (picker.type === "player") {
      picker.resolve(pickRandomFrom([...picker.players]));
    } else if (picker.type === "option") {
      // ユーザー要望（続き95）「タイムアウトで離脱者の選択をランダム/最有力候補で
      // 自動代行する」。なないろの欠片・選べる罠・ザ・ギャンブル・パーティーの選択肢
      // モーダル用。使えない選択肢（usable:false）を誤って選ばないよう、使える
      // 選択肢だけの中からランダムに1つ選ぶ（呼び出し元は必ず1つ以上usable:trueが
      // ある状態でしかこのモーダルを開かないため、ここが空になることは無い想定）。
      const usable = picker.options.filter((o) => o.usable);
      picker.resolve(pickRandomFrom(usable));
    } else if (picker.type === "colors") {
      // ザ・ギャンブル/試練の儀式の色宣言モーダル用。「N色以上」「ちょうどN色」の
      // どちらでも、必要数ちょうどをCOLORS（７色）からランダムに重複無しで選べば
      // 両方の条件を満たす。
      const required = picker.requirement.exactCount ?? picker.requirement.minCount ?? 1;
      const pool = [...COLORS];
      const chosen = [];
      for (let i = 0; i < required && pool.length > 0; i++) {
        chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      picker.resolve(chosen);
    } else if (picker.type === "opponentHand") {
      // ユーザー報告（続き99）「相手の手札選択モーダルが処理されず置いてけぼりに
      // なっている」。スリカエ・接触の奪うカード選択（requestOpponentHandRitualPick）
      // 用。裏向きの中から見た目上は等確率に選ぶだけでよいため、単純にランダムな
      // 1枚を選ぶ。
      picker.resolve(pickRandomFrom(picker.tokens));
    }
    return true;
  }
  const phase = getCurrentPhase();
  if (phase === "move" && isMovePhaseActive()) {
    const table = document.getElementById("game-table");
    const candidates = table
      ? [
          ...[...table.querySelectorAll(".cell.phase-move-highlight")].map((el) => ({ el, isMove: true })),
          ...[...table.querySelectorAll(".cell.phase-contact-highlight")].map((el) => ({ el, isMove: false })),
        ]
      : [];
    const chosen = pickRandomFrom(candidates);
    if (chosen) {
      const location = { zone: "cell", row: Number(chosen.el.dataset.row), col: Number(chosen.el.dataset.col) };
      // 接触は成立時（submitContactProposal内）まで行動済みにしない。移動はここで確定。
      if (chosen.isMove) {
        markPhaseMoveActionTaken();
        performPhaseMoveToCell(location);
      } else performPhaseContact(location);
      return true;
    }
  }
  // ユーザー要望（続き104）「疑似CPUモードでロックフェイズも自動でロックするように
  // して、本当に対戦終了まで自動で行けるようにする」。ロック自体は本来「任意」
  // （自己申告制なので普通にスキップでいい、というのが元々のユーザー方針）だが、
  // 疑似CPUモード対象の座席に限っては、勝利条件（7色ロック）へ実際に進めるため、
  // ロックできるカードがあればランダムに1枚選んでロックする（performLockPhaseClick、
  // 手動クリックと全く同じ経路——確認モーダル・音・演出・オンライン同期すべて共通）。
  // ロックできるカードが無ければ、疑似CPU対象でも通常通りスキップする。
  if (phase === "lock") {
    const player = getSelfSeat();
    const isTarget = isPseudoCpuTarget(player);
    const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
    const lockable = isTarget ? hand.filter((t) => isCardLockable(t, player)) : [];
    // ユーザー報告（続き106）「ロックが1枚目から増えない・タイムアウト時の自動ロックが
    // できていない」の原因調査用。この分岐に実際に到達したか、isPseudoCpuTargetが
    // falseで最初からスキップされているのか、trueなのに手札のロック可能枚数が0枚
    // だっただけなのか（0枚なら仕様通り。1枚以上なのに実際にロックされないなら別の
    // バグ）を区別できるよう記録する。
    logAction("diag-pseudo-cpu", {
      phase: "lockAutoPlay-check",
      player,
      isPseudoCpuTarget: isTarget,
      handCount: hand.length,
      handColors: hand.map((t) => getCardDefinition(t.cardId)?.color ?? null),
      lockableCount: lockable.length,
    });
    if (isTarget && lockable.length > 0) {
      const chosen = pickRandomFrom(lockable);
      performLockPhaseClick(chosen.id);
      return true;
    }
  }
  if (phase === "lock" || phase === "hand") {
    forceEndCurrentPhase();
    // ユーザー要望「時間切れによるスキップが発生したら15秒回復させてください」。
    // ロック/ハンドフェイズのスキップだけが本当の意味での「スキップ」（何もせず
    // 先送りにするだけ、他の分岐のような実際の盤面操作を伴わない）ため、呼び出し元
    // （turn-timer.js）がこの結果だけを区別して優先権の基本時間を回復できるよう、
    // true/falseではなく専用の文字列を返す。
    return "skip";
  }
  return false;
}

// ユーザー要望「プレイヤーに作業をさせる場合は『移動先のマスを選択してください』などの
// モーダルを出して案内するようにしてほしい」への対応。ハイライトだけでは何をすればいいか
// 分かりにくいという指摘のため、選択中は画面上部に案内文を出す（盤面操作の邪魔をしない
// pointer-events:noneのバナー、モーダルのように操作を止めない）。
let effectPickerHintEl = null;
function showEffectPickerHint(text) {
  if (!effectPickerHintEl) {
    effectPickerHintEl = document.createElement("div");
    effectPickerHintEl.id = "card-effect-picker-hint";
    document.body.appendChild(effectPickerHintEl);
  }
  effectPickerHintEl.textContent = text;
  effectPickerHintEl.classList.add("show");
}
function hideEffectPickerHint() {
  effectPickerHintEl?.classList.remove("show");
}

// 「任意選択（してもよい）」の効果——黄のキューブ サフランの『2マス以内を4枚まで開いても
// よい』等——で、マス選択中に「これ以上選ばない／やめる」を可能にするスキップボタン。
// ユーザー報告「サフランが4枚まで“必ず”オープンさせられる（やめられない）」への対応。
// クリック検知は、盤面のクリックを奪うcapture:trueのpointerdownハンドラ（activeEffectPicker
// のcell分岐）側で#card-effect-skip-buttonを拾って行う（このボタン自身に付けたclickは、
// そのハンドラのstopPropagationで届かないため）。elementsFromPoint()で拾えるよう
// pointer-events:auto（button既定）にしておく。
let effectSkipButtonEl = null;
function showEffectSkipButton(label) {
  if (!effectSkipButtonEl) {
    effectSkipButtonEl = document.createElement("button");
    effectSkipButtonEl.id = "card-effect-skip-button";
    effectSkipButtonEl.type = "button";
    document.body.appendChild(effectSkipButtonEl);
  }
  effectSkipButtonEl.textContent = label;
  effectSkipButtonEl.classList.add("show");
}
function hideEffectSkipButton() {
  effectSkipButtonEl?.classList.remove("show");
}

// 効果の対象マスをプレイヤーに選ばせる（候補マスをハイライトし、クリックを待つ）。
// options.allowSkip=true の時は「これ以上選ばない」スキップボタンを出す（optionalな
// 「してもよい」効果で早期終了できるように）。スキップされた場合は resolve(null)。
function requestCellChoiceForEffect(candidates, hint, options = {}) {
  return new Promise((resolve) => {
    const table = document.getElementById("game-table");
    const entries = (table ? candidates.map((loc) => ({ loc, el: findLocationElement(table, loc) })) : []).filter(
      (e) => e.el
    );
    if (entries.length === 0) {
      resolve(null);
      return;
    }
    for (const entry of entries) entry.el.classList.add("card-effect-target-cell");
    document.body.classList.add("card-effect-picking-cells");
    if (hint) showEffectPickerHint(hint);
    if (options.allowSkip) showEffectSkipButton(options.skipLabel ?? "これ以上選ばない");
    activeEffectPicker = {
      type: "cell",
      candidates,
      resolve: (loc) => {
        for (const entry of entries) entry.el.classList.remove("card-effect-target-cell");
        document.body.classList.remove("card-effect-picking-cells");
        hideEffectPickerHint();
        hideEffectSkipButton();
        resolve(loc);
      },
    };
  });
}

// 効果で使う手札カードをプレイヤーに選ばせる（自分の手札カードをハイライトし、クリックを待つ）。
// tokenIdFilter（Set、省略可）を渡すと、その中に含まれる手札カードだけを候補にする
// （「追色」コストで同じ色の手札だけを選ばせる用途、ユーザー要望「捨てられる手札が
// 無い場合は警告を出す」の前段——実際に選ばせる候補自体を絞り込む）。
// 「ドロー」＝「山札から手札に加える」ため、公開ドロー（.hand-reveal-area、publicDraw
// ゾーン）にある分も選択候補に含める（続き55、card-effect-engine.jsのgetHandTokens()と
// 同じ定義。ヴァーディアンの効果で公開ドローされた2枚が選べる罠の「手札を半分捨てる」で
// 選べなかった不具合の対応）。
function requestHandCardChoiceForEffect(player, hint, tokenIdFilter) {
  return new Promise((resolve) => {
    const handArea = document.querySelector(`.hand-area[data-player="${player}"]`);
    const revealArea = document.querySelector(`.hand-reveal-area[data-player="${player}"]`);
    const allCardEls = [
      ...(handArea ? handArea.querySelectorAll(".hand-card") : []),
      ...(revealArea ? revealArea.querySelectorAll(".hand-reveal-card") : []),
    ];
    const cardEls = tokenIdFilter ? allCardEls.filter((el) => tokenIdFilter.has(el.dataset.tokenId)) : allCardEls;
    if (cardEls.length === 0) {
      resolve(null);
      return;
    }
    for (const el of cardEls) el.classList.add("card-effect-target-cell");
    document.body.classList.add("card-effect-picking-hand");
    if (hint) showEffectPickerHint(hint);
    activeEffectPicker = {
      type: "hand",
      tokenIds: new Set(cardEls.map((el) => el.dataset.tokenId)),
      resolve: (token) => {
        for (const el of cardEls) el.classList.remove("card-effect-target-cell");
        document.body.classList.remove("card-effect-picking-hand");
        hideEffectPickerHint();
        resolve(token);
      },
    };
  });
}

// 手品師の技専用（ユーザー要望「駒ではなくアバターを選択して相手を選ぶ」）。
// candidatesは座席の配列（例: ["B","C"]）。マスチェンジ等のpickLocationと同じ
// 「候補をハイライトしてクリックを待つ」形だが、対象がマス/手札カードではなく
// プレイヤーのアバターであるため専用の関数にした。
function requestPlayerChoiceForEffect(candidates, hint) {
  return new Promise((resolve) => {
    const entries = candidates
      .map((player) => ({ player, el: document.querySelector(`.player-avatar[data-player="${player}"]`) }))
      .filter((e) => e.el);
    if (entries.length === 0) {
      resolve(null);
      return;
    }
    for (const entry of entries) entry.el.classList.add("card-effect-target-avatar");
    if (hint) showEffectPickerHint(hint);
    activeEffectPicker = {
      type: "player",
      players: new Set(candidates),
      resolve: (player) => {
        for (const entry of entries) entry.el.classList.remove("card-effect-target-avatar");
        hideEffectPickerHint();
        resolve(player);
      },
    };
  });
}

// ユーザー要望「収穫と種まきについて獲得したカードを何を獲得したかモーダルで表示し、
// 手札の中で効果が終わるまで光らせてください」。既存のannounceHandPickups（他の
// カード獲得と同じ見た目のトースト）で「何を得たか」を知らせ、glowingEffectHandTokenIdを
// 立てて手札内で光らせ続ける（clearEffectUiHighlightsが呼ばれるまで）。
function onEffectCardAcquiredToHand(tokenId, cardId, wasFaceUp) {
  announceHandPickups(getSelfSeat(), [{ cardId, wasPublic: wasFaceUp }]);
  glowingEffectHandTokenId = tokenId;
  render();
}

// ユーザー要望「どこに置かれるのかを忘れないように置かれるマスをハイライトしてください」。
// PLACE_CARDのCHOOSE（増殖する樹々の手札効果等、同じ効果内でN回連続してマスを選ばせる場合）
// では選ぶたびに呼ばれ、既存の選択は消さずに積み重なる（置き直し前提のPICKUP_TO_HANDでは
// 従来通り1件のみ）。
function markEffectPlacementTarget(location) {
  pendingPlacementLocations.add(`${location.row},${location.col}`);
  render();
}

// ユーザー要望「配置後ここに配置したよがわかるように配置場所をしっかりハイライトして
// ください。マスの枠だけでなくカードの面もね」。PLACE_CARD系のアクションが実際に
// 置き終えた直後に呼ぶ（card-effect-engine.jsのrunActionから、helpers.markPlacedLocation
// 経由）。効果全体の完了（clearEffectUiHighlights）を待たず、一定時間で自動的に消える。
const JUST_PLACED_HIGHLIGHT_MS = 3000;
function markEffectJustPlaced(location) {
  justPlacedLocations.add(`${location.row},${location.col}`);
  clearTimeout(justPlacedClearTimer);
  justPlacedClearTimer = setTimeout(() => {
    justPlacedLocations.clear();
    render();
  }, JUST_PLACED_HIGHLIGHT_MS);
  render();
}

// 効果全体（例: 収穫と種まきの2段階）が完了した後、上の2つのハイライトをクリアする。
// justPlacedLocationsは独立したタイマーで自動的に消えるため、ここでは対象外
// （効果がすぐ終わっても、置いた場所の余韻はしばらく見えていてほしいため）。
function clearEffectUiHighlights() {
  glowingEffectHandTokenId = null;
  pendingPlacementLocations.clear();
}

// 到達効果の処理後、その盤面カードが手札に加わる時の「吸い込まれる」演出（ユーザー要望
// 「自動処理モードで到達後、カードが実際に手札へ吸い込まれて加わるアニメを入れたい」）。
// ドロー演出(flyDrawnCardToHand)と同じ飛翔ゴースト方式だが、飛び元は山札ではなく、その
// カードが今いる盤面マス。飛んでいる間は元のカードを隠してゴーストだけ飛ばし、着地後に
// 呼び出し側(card-effect-engine.jsのmoveAndSync)が実際に手札へ移す。移動アニメーションを
// 減らす設定中はスキップ。card-effect-engine.jsへhelpers.flyCardToHandとして注入する。
async function flyBoardCardToHand(tokenId, player) {
  if (isFlightAnimationDisabled()) return;
  const token = getState().tokens.find((t) => t.id === tokenId);
  if (!token) return;
  const cardEl = document.querySelector(`.board-card[data-token-id="${tokenId}"]`);
  const handArea = document.querySelector(`.hand-area[data-player="${player}"]`);
  if (!cardEl || !handArea) return;
  const fromRect = cardEl.getBoundingClientRect();
  const toRect = handArea.getBoundingClientRect();
  cardEl.style.visibility = "hidden"; // 元カードを隠してゴーストだけ飛ばす（着地後のrenderで消える）
  const img = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
  // ユーザー要望「もう少しゆっくり手札に入っていってほしい」。ドロー演出(500ms)より少し長め。
  const { done } = flyGhost(fromRect, toRect, img, "setup-fly-card", 800);
  await done;
}

// ドロー枚数の演出（山札から手札への飛翔ゴースト）。ユーザー要望「山札から１枚手札に
// 加わるアニメが欲しい」。裏向きの私的ドローのため、飛んでいる間は常に裏面画像
// （setup-animation.jsの初回配布演出と同じ考え方）。移動アニメーションを減らす設定
// （motion-prefs.js）中は演出自体をスキップする。
async function flyDrawnCardToHand(player, cardId) {
  if (isFlightAnimationDisabled()) return;
  const deckEl = document.querySelector('.stack[data-pile="deck"]');
  const handArea = document.querySelector(`.hand-area[data-player="${player}"]`);
  if (!deckEl || !handArea) return;
  const fromRect = deckEl.getBoundingClientRect();
  const toRect = handArea.getBoundingClientRect();
  const { done } = flyGhost(fromRect, toRect, getCardBackImagePath(cardId), "setup-fly-card is-facedown", 500);
  await done;
}

// 手札効果のDRAW動詞用。playerの手札へ山札からcount枚引く（オンライン同期込み、
// 「1枚ドロー」ボタンと同じ考え方をcount回・任意のplayer向けに一般化したもの）。
// ユーザー要望「「●枚ドローします。」的なモーダルも欲しいです。全員に。」「山札から
// 手札に加わるアニメが欲しい」「獲得ポップアップは1枚ずつではなくまとめて」への対応。
async function drawCardsForEffect(player, count) {
  if (count > 0) announceDrawCount(player, count);
  const pickups = [];
  const drawnTokenIds = [];
  for (let i = 0; i < count; i++) {
    // ユーザー要望「ドローで得たカードは手札の中で数秒ハイライトしてください」用に、
    // ドロー前後の手札トークンidの差分から新しく増えた1枚を特定する（山札からの
    // 応答自体にトークンidが含まれないため、findNewHandTokenIdsと同じ考え方）。
    const handBefore = new Set(
      getState()
        .tokens.filter((t) => t.location.zone === "hand" && t.location.player === player)
        .map((t) => t.id)
    );
    if (isOnlineMode()) {
      try {
        // ユーザー要望「ドローという事象に共通のアニメを設定したほうがいいのでは」
        // への対応で追加したremote-move-animator.jsの汎用ドロー演出（他プレイヤー・
        // 観戦者向け）が、この直後のfetchAndHydrate()で自分自身の画面にも二重に
        // 発火してしまわないよう、先に1回分だけ抑制を予約しておく（自分の分は
        // この下で直接flyDrawnCardToHandを呼んで演出済みのため）。
        suppressNextHandDrawDiff(player);
        const result = await drawFromPile("deck", { zone: "hand", player });
        if (result?.revealedCardId) {
          playSound("cardDraw");
          // ゴーストが飛んでいる間はまだrender()しない（実カードが先に一瞬見えてしまう
          // 「二重表示」を避けるため、setup-animation.jsと同じ考え方）。着地後にrender()。
          await flyDrawnCardToHand(player, result.revealedCardId);
          render();
          pickups.push({ cardId: result.revealedCardId, wasPublic: false });
        }
        await fetchAndHydrate(getCurrentGameId());
        drawnTokenIds.push(...findNewHandTokenIds(player, handBefore));
      } catch (err) {
        console.error("drawCardsForEffect failed", err);
        break;
      }
    } else {
      const pileArray = getState().piles.deck;
      if (pileArray.length === 0) break; // 山札が尽きたら諦める（善処の原則）
      const cardId = pileArray[pileArray.length - 1];
      drawFromPile("deck", { zone: "hand", player });
      playSound("cardDraw");
      await flyDrawnCardToHand(player, cardId);
      render();
      pickups.push({ cardId, wasPublic: false });
      drawnTokenIds.push(...findNewHandTokenIds(player, handBefore));
    }
  }
  // ユーザー要望「獲得ポップアップは1枚ずつ出るのではなく、まとめて1回出てほしい」
  // （複数枚ドローする効果で連続表示が煩雑だったため）。
  if (pickups.length > 0) announceHandPickups(player, pickups);
  if (drawnTokenIds.length > 0) glowHandTokensBriefly(drawnTokenIds);
}

// 赤のキューブ フェニックス専用（PICKUP_DISCARD_SECOND_FROM_TOP、card-effect-engine.js
// 参照）: 捨て場の一番上を1枚、playerの手札へ引く。drawCardsForEffectの「山札」版と
// 同じ考え方だが、対象が「捨て場」（既に表向き公開済みの情報）である点だけが違う。
// DRAW_FROM_PILEアクション自体はpile名を問わない汎用アクション（ローカルのstate.js・
// サーバー側so7-apply-action.ts両方とも同じ）で、"revealedCardId"もdestinationが
// hand zoneでありさえすれば返るため、"discard"を指定するだけでサーバー側の変更なしに
// そのまま使える。戻り値は実際に引けたトークン（山が尽きていれば無いのでnull）。
async function drawFromDiscardForEffect(player) {
  const handBefore = new Set(
    getState()
      .tokens.filter((t) => t.location.zone === "hand" && t.location.player === player)
      .map((t) => t.id)
  );
  if (isOnlineMode()) {
    try {
      const result = await drawFromPile("discard", { zone: "hand", player });
      if (!result?.revealedCardId) return null;
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("drawFromDiscardForEffect failed", err);
      return null;
    }
  } else {
    if (getState().piles.discard.length === 0) return null;
    drawFromPile("discard", { zone: "hand", player });
  }
  render();
  const newTokenId = findNewHandTokenIds(player, handBefore)[0];
  return newTokenId ? getState().tokens.find((t) => t.id === newTokenId) : null;
}

// 青のキューブ セレスティア専用（DISCARD_RANDOM_FROM_QUALIFYING_OPPONENTS）:
// targetPlayerの裏向きの手札から、儀式的に（見た目上ランダムに）1枚選ぶ。中身を
// 手札に加えるのではなく捨てるための選出のため、requestOpponentHandRitualPick
// そのままでよい（選んだ後どう処理するかは呼び出し元＝card-effect-engine.js側の責務）。
function pickRandomFromOpponentHandForEffect(targetPlayer) {
  return requestOpponentHandRitualPick(targetPlayer, `${getPlayerName(targetPlayer)}の手札（裏向き）から無作為に1枚選んでください`);
}

// docs/rulebook.md「いつでも使える」の定義: 「効果等の何らかの『処理中』は使用
// できない（ゲート侵攻ボーナスも処理中に含まれる）」。ゲート侵攻だけでなく、
// 他の効果の対象選択待ち（activeEffectPicker）・手札効果の解決中
// （phase-automation.jsのhandEffectBusy）も全て「処理中」に含まれる。
// ユーザー報告（続き83）「『いつでも使える』の使うか確認モーダルが出ている最中に
// ターンが切り替わってしまった。完全にモーダルが閉じられるまではほかの自動処理は
// ストップしなければならない」への対応で、このモーダル自体の表示中
// （anytimeInterruptModalEl）も「処理中」に含める。
export function isAnyEffectProcessingBusy() {
  return (
    isGateInvasionPending() ||
    isGateInvasionQueueActive() ||
    isHandEffectBusy() ||
    activeEffectPicker !== null ||
    anytimeInterruptModalEl !== null
  );
}

// --- 「いつでも使える」割り込みチェックポイント（続き76、予約制の廃止／続き77で拡張） ---
// ユーザー要望「予約制は廃止したい。その代わり、宣言（ロック宣言・手札効果使用宣言・
// 接触宣言・移動宣言）の直後、処理（ロック処理・カード効果処理・接触処理・移動処理）の
// 直後に毎回、いつでも使えるカードを持っているプレイヤーには使うかどうかのモーダルを
// 出す」への対応。
// 質問への回答で固まった仕様:
// ・モーダルには対象プレイヤーが持つ「いつでも使える」カード全てを並べ、各カードに
//   「使う」ボタンを置く（押すとその場でそのまま発動、ドラッグ操作は不要）。
// ・モーダルはブロッキングにしない。数秒で自動的に閉じ、閉じてもゲームの進行は
//   止めない（何もしなければそのまま次へ進む）。
// ・複数プレイヤーに見せる必要がある場面（ローカル対戦、1画面で全員操作）では、
//   処理順の原則（効果の使用者/宣言者から時計回り）に沿って1人ずつ順番に見せる。
// ・行動した本人を含む全員が対象（自分の宣言/処理の直後に自分自身のいつでも使える
//   カードを使いたい場合にも対応するため）。
// ・「今後このモーダルを出さない」を選べる。以後はチェックポイントが来ても一切
//   モーダルを出さない。フェイズ案内板の「割り込みモーダル再開」ボタン
//   （buildAnytimeInterruptResumeButton参照）で再度有効化できる。
//
// 続き77: ロック・移動も、実際に状態を動かす直前（宣言）／動かした直後（処理）の
// 2段階でチェックポイントを発火するよう拡張した（performLockPhaseClick・
// performPhaseMoveToCell・ドラッグ&ドロップハンドラ・requestFinalLockの呼び出し
// 直前がそれぞれ「宣言」、maybeAnnounceLock・到達効果解決後のonFullyResolvedが
// 「処理」）。また、online.jsに新設したanytime_checkpoint broadcast
// （broadcastAnytimeCheckpoint/onAnytimeCheckpointEvents、hand_effect_use等と同じ
// 「見た目だけの合図」パターンでso7-apply-action.tsは経由しない）に乗せることで、
// ロック・移動・接触・カード効果処理の全チェックポイントがオンライン中も行動した
// 本人以外のクライアントへ届くようにした（fireAnytimeCheckpoint参照）。手札効果
// 使用宣言だけは引き続き既存のhand_effect_use経路で届いているため、この新しい
// broadcastには乗せていない。
let anytimeInterruptOptedOut = false;
let anytimeInterruptQueue = []; // ローカル対戦で複数プレイヤー分を順番に見せるための待ち行列
let anytimeInterruptModalEl = null;
let anytimeInterruptTimer = null;
let resumeAnytimeInterruptButtonEl = null;
const ANYTIME_INTERRUPT_MODAL_DURATION_MS = 6000;

function getAnytimeUsableHandTokensFor(player) {
  return getState().tokens.filter(
    (t) =>
      t.kind === "card" &&
      t.location.zone === "hand" &&
      t.location.player === player &&
      isHandEffectUsableAnytime(t.cardId) &&
      canUseHandEffect(t.cardId, t.id, player)
  );
}

function closeAnytimeInterruptModal() {
  clearTimeout(anytimeInterruptTimer);
  anytimeInterruptTimer = null;
  anytimeInterruptModalEl?.remove();
  anytimeInterruptModalEl = null;
}

function updateResumeAnytimeInterruptButton() {
  if (!resumeAnytimeInterruptButtonEl) return;
  resumeAnytimeInterruptButtonEl.style.display = anytimeInterruptOptedOut ? "block" : "none";
}

function buildAnytimeInterruptResumeButton() {
  const bar = document.getElementById("phase-guide-bar");
  if (!bar) return;
  resumeAnytimeInterruptButtonEl = document.createElement("button");
  resumeAnytimeInterruptButtonEl.type = "button";
  resumeAnytimeInterruptButtonEl.id = "anytime-interrupt-resume-button";
  resumeAnytimeInterruptButtonEl.textContent = "🔔 割り込みモーダル再開";
  resumeAnytimeInterruptButtonEl.title = "「今後このモーダルを出さない」を選んだ後、いつでも使える効果の割り込みモーダルをまた表示させます。";
  resumeAnytimeInterruptButtonEl.style.display = "none";
  resumeAnytimeInterruptButtonEl.addEventListener("click", () => {
    anytimeInterruptOptedOut = false;
    updateResumeAnytimeInterruptButton();
  });
  bar.appendChild(resumeAnytimeInterruptButtonEl);
}

function advanceAnytimeInterruptQueue() {
  if (anytimeInterruptQueue.length === 0) return;
  const player = anytimeInterruptQueue.shift();
  const tokens = getAnytimeUsableHandTokensFor(player);
  if (tokens.length === 0) {
    advanceAnytimeInterruptQueue();
    return;
  }
  showAnytimeInterruptModal(player, tokens);
}

function showAnytimeInterruptModal(player, tokens) {
  closeAnytimeInterruptModal();
  const modal = document.createElement("div");
  modal.id = "anytime-interrupt-modal";

  const title = document.createElement("div");
  title.className = "contact-approval-title";
  title.textContent =
    !isOnlineMode() && player !== getSelfSeat()
      ? `${getPlayerName(player)}：いつでも使えるカードがあります`
      : "いつでも使えるカードがあります";
  modal.appendChild(title);

  const list = document.createElement("div");
  list.id = "anytime-interrupt-modal-list";
  for (const token of tokens) {
    const row = document.createElement("div");
    row.className = "anytime-interrupt-modal-row";
    const name = document.createElement("span");
    name.className = "anytime-interrupt-modal-row-name";
    name.textContent = getCardDefinition(token.cardId).name;
    row.appendChild(name);
    const useBtn = document.createElement("button");
    useBtn.type = "button";
    useBtn.className = "anytime-interrupt-modal-row-use";
    useBtn.textContent = "使う";
    useBtn.addEventListener("click", () => {
      // 誰かがこのチェックポイントで割り込んだら、待ち行列の残り（他プレイヤー分）は
      // 打ち切る——割り込みで状況自体が変わるため、古い前提のまま続けても意味が無い。
      anytimeInterruptQueue = [];
      closeAnytimeInterruptModal();
      render();
      // ユーザー報告（続き83）「相手のターン中にスリカエで割り込んだ時、使用後に
      // 相手に優先権が戻らず自分のタイムアウトをただ待つ状況になった」の原因:
      // respondToContact・delegateToPlayerForEffectは「一時的に優先権を相手へ移し、
      // 終わったら手番プレイヤーへ戻す」を必ず行っているが、この「いつでも使える」
      // 割り込みの実行経路（このuseBtnクリック）だけは元々優先権に一切触れて
      // いなかった。手番プレイヤー以外が割り込んだ場合、その解決の間だけ優先権を
      // 割り込んだ本人へ移し、終わったら手番プレイヤーへ戻す（同じ考え方）。
      const turnPlayer = getState().turnPlayer;
      if (turnPlayer) transferPriorityTo(player);
      runAutoHandEffect(token.cardId, token.id, player).finally(() => {
        if (turnPlayer) transferPriorityTo(turnPlayer);
      });
    });
    row.appendChild(useBtn);
    list.appendChild(row);
  }
  modal.appendChild(list);

  const optOutRow = document.createElement("label");
  optOutRow.id = "anytime-interrupt-modal-optout";
  const optOutCheckbox = document.createElement("input");
  optOutCheckbox.type = "checkbox";
  optOutCheckbox.addEventListener("change", () => {
    if (optOutCheckbox.checked) {
      anytimeInterruptOptedOut = true;
      updateResumeAnytimeInterruptButton();
    }
  });
  const optOutLabel = document.createElement("span");
  optOutLabel.textContent = "今後このモーダルを出さない";
  optOutRow.appendChild(optOutCheckbox);
  optOutRow.appendChild(optOutLabel);
  modal.appendChild(optOutRow);

  document.body.appendChild(modal);
  anytimeInterruptModalEl = modal;
  anytimeInterruptTimer = setTimeout(() => {
    closeAnytimeInterruptModal();
    advanceAnytimeInterruptQueue();
  }, ANYTIME_INTERRUPT_MODAL_DURATION_MS);
}

// 宣言/処理のチェックポイントから呼ぶ。afterPlayerは効果の使用者/宣言者
// （処理順の原則の起点）。既に何か他の処理中（isAnyEffectProcessingBusy）なら、
// その処理が終わった後の次のチェックポイントに任せて今回は何もしない
// （「処理中は使用できない」といういつでも使える自体の定義とも整合する）。
function triggerAnytimeInterruptCheckpoint(afterPlayer) {
  logAction("diag-anytime-checkpoint", {
    afterPlayer,
    optedOut: anytimeInterruptOptedOut,
    busy: isAnyEffectProcessingBusy(),
    gateInvasionPending: isGateInvasionPending(),
    gateInvasionQueueActive: isGateInvasionQueueActive(),
    handEffectBusy: isHandEffectBusy(),
    pickerActive: activeEffectPicker !== null,
    modalAlreadyShowing: !!anytimeInterruptModalEl,
  });
  if (anytimeInterruptOptedOut) return;
  if (isAnyEffectProcessingBusy()) return;
  if (anytimeInterruptModalEl) return; // 既に1件表示中なら重ねない
  const order = isOnlineMode() ? [getSelfSeat()] : rotatedActivePlayersFrom(afterPlayer);
  anytimeInterruptQueue = order;
  advanceAnytimeInterruptQueue();
}

// 続き77: オンライン中、ロック・移動・接触の宣言/処理チェックポイントを行動した本人
// 以外のクライアントにも届ける薄いラッパー。手札効果使用宣言だけは既存の
// hand_effect_use経路（announceHandEffectUseForEffect/onHandEffectUseEvents）で
// 既に自分以外へ届いているため、ここには乗せない。呼び出し側は今後
// triggerAnytimeInterruptCheckpointを直接呼ばず、原則こちらを使う。
function fireAnytimeCheckpoint(afterPlayer) {
  triggerAnytimeInterruptCheckpoint(afterPlayer);
  if (isOnlineMode()) broadcastAnytimeCheckpoint({ afterPlayer });
}
// 他クライアントからの合図の受信側。自分自身が送った合図のこだま（broadcastChannelは
// self:trueのため自分にも返ってくる）は、afterPlayerが自分の座席と一致するかでは
// 判別できない（afterPlayerは「宣言/処理した本人」であり受信者の座席とは無関係の
// 値のため）。ただし届いた時点で既に自分のtriggerAnytimeInterruptCheckpointが
// （同期的に）先に呼ばれてモーダルを出し始めているのが通常のため、こちらは単に
// 同じ関数をもう一度呼ぶだけでよい——2回目の呼び出しは「既にモーダル表示中」
// ガードで自然にサイレントno-opになる（hand_effect_use受信側と同じ考え方）。
onAnytimeCheckpointEvents(({ afterPlayer }) => {
  triggerAnytimeInterruptCheckpoint(afterPlayer);
});

// ユーザー要望「スマホ・タブレットでの操作について、ロックフェイズでロックカードを選択した時
// 『このカードをロックしますか？』の念押しモーダルが欲しい。ハンドフェイズも同様に
// 『このカードを使用しますか？』の念押しモーダルが欲しい。これらは誤操作防止の観点から
// です」（続き62）。PCのマウス操作は誤操作の心配が薄い（interaction-mode.jsの「駒消し/
// カード消し」ボタンと同じ判断基準）ため、タッチ操作主体の端末（isTouchPrimaryDevice）
// でだけ確認を挟み、PCでは従来通り一発で確定する。contact-approval-*クラスを
// 流用した汎用Yes/Noモーダル。
// ロックする前・手札を使う前の確認モーダル。ユーザー要望で、以前は「タッチ端末のみ」
// だったのを全デバイス共通にし、表示するかどうかを設定(isActionConfirmEnabled)で
// 切り替えられるようにした。設定がOFF（＝今後表示しない）の間は、モーダルを出さず即実行する。
function confirmTouchAction(title) {
  // チュートリアルCPU戦の進行中は、台本が各操作を誘導するのでこの確認は出さない
  // （スポットライト等の演出と重なって見えなくなるのも防ぐ）。
  if (!isActionConfirmEnabled() || isTutorialBattleActive()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10610 });
    const modal = document.createElement("div");
    modal.id = "touch-action-confirm-modal";

    const titleEl = document.createElement("div");
    titleEl.className = "contact-approval-title";
    titleEl.textContent = title;
    modal.appendChild(titleEl);

    const buttons = document.createElement("div");
    buttons.className = "contact-approval-buttons";
    const yesBtn = document.createElement("button");
    yesBtn.className = "contact-approval-approve";
    yesBtn.type = "button";
    yesBtn.textContent = "✅ はい";
    const finish = (result) => {
      backdrop.remove();
      modal.remove();
      resolve(result);
    };
    yesBtn.addEventListener("click", () => finish(true));
    const noBtn = document.createElement("button");
    noBtn.className = "contact-approval-reject";
    noBtn.type = "button";
    noBtn.textContent = "🚫 いいえ";
    noBtn.addEventListener("click", () => finish(false));
    buttons.appendChild(yesBtn);
    buttons.appendChild(noBtn);
    modal.appendChild(buttons);

    // 「今後このモーダルを表示しない」。押すと以後この確認を出さない設定にして、今回の
    // 操作はそのまま実行（＝はい扱い）する。再表示はオプションの基本設定から戻せる。
    const dontShow = document.createElement("button");
    dontShow.id = "touch-action-confirm-dontshow";
    dontShow.type = "button";
    dontShow.textContent = "今後このモーダルを表示しない";
    dontShow.addEventListener("click", () => {
      setActionConfirmEnabled(false);
      saveMyPreference({ action_confirm_enabled: false }); // アカウントにも保存（別端末で共有）
      finish(true);
    });
    modal.appendChild(dontShow);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  });
}

// confirmTouchActionと同じcontact-approval-*流用の汎用Yes/Noモーダルだが、こちらは
// 誤操作防止用ではなく本当の任意選択（「〜してもよい」効果）向けのため、端末に関係なく
// 常に表示する（続き89、カウンターロックの「あなたの手札を1枚ロックしてもよい」用に新設）。
function confirmGenericYesNo(title, { yesLabel = "はい", noLabel = "いいえ" } = {}) {
  return new Promise((resolve) => {
    const finish = (result) => {
      activeEffectPicker = null;
      backdrop.remove();
      modal.remove();
      resolve(result);
    };
    const backdrop = createBackdrop(() => finish(false), { dim: true, zIndex: 10610 });
    const modal = document.createElement("div");
    modal.id = "generic-confirm-modal";

    const titleEl = document.createElement("div");
    titleEl.className = "contact-approval-title";
    titleEl.textContent = title;
    modal.appendChild(titleEl);

    const buttons = document.createElement("div");
    buttons.className = "contact-approval-buttons";
    const yesBtn = document.createElement("button");
    yesBtn.className = "contact-approval-approve";
    yesBtn.type = "button";
    yesBtn.textContent = `✅ ${yesLabel}`;
    yesBtn.addEventListener("click", () => finish(true));
    const noBtn = document.createElement("button");
    noBtn.className = "contact-approval-reject";
    noBtn.type = "button";
    noBtn.textContent = `🚫 ${noLabel}`;
    noBtn.addEventListener("click", () => finish(false));
    buttons.appendChild(yesBtn);
    buttons.appendChild(noBtn);
    modal.appendChild(buttons);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    // ユーザー報告（続き106）「優先権が委任されたまま自動プレイが反応せず止まる」の
    // 調査中に発見: このモーダル（カウンターロックの「手札を1枚ロックしてもよい」等、
    // 本当の任意選択向け汎用Yes/No）だけがactiveEffectPickerに未登録で、続き105で
    // 修正した合同建設の「どこから置きますか？」と全く同じ穴だった。ここも同じく
    // type:"option"（はい/いいえの2択）として登録し、疑似CPU対象がタイムアウトした
    // 場合にランダムなusable:true選択肢へ自動解決されるようにする。
    activeEffectPicker = {
      type: "option",
      options: [
        { id: "yes", label: yesLabel, usable: true },
        { id: "no", label: noLabel, usable: true },
      ],
      resolve: (option) => finish(option?.id === "yes"),
    };
  });
}

// ユーザー要望「①通常の手札カードは、ハンドフェイズかつ手札エリア外で放すと手札効果が
// 発動する」「②エターナル/ファーストカードは、ハンドフェイズでクリックすると追色コストを
// 選ぶ流れに移行する」への対応の実行部。cardTokenIdは効果を使うカード自身。
async function runAutoHandEffect(cardId, cardTokenId, player) {
  setHandEffectBusy(true);
  try {
    const usedSuccessfully = await runHandEffect(
      { cardId, cardTokenId, player },
      {
        discardAndSync: discardFromHandReveal,
        drawCards: drawCardsForEffect,
        pickDiscardCost: (candidates, hint) => requestHandCardChoiceForEffect(player, hint, new Set(candidates.map((t) => t.id))),
        moveAndSync: moveAndSyncForEffect,
        flyCardToHand: flyBoardCardToHand,
        pickLocation: requestCellChoiceForEffect,
        pickHandCard: requestHandCardChoiceForEffect,
        onCardAcquiredToHand: onEffectCardAcquiredToHand,
        markPlacementTarget: markEffectPlacementTarget,
        markPlacedLocation: markEffectJustPlaced,
        placeFromDeck: placeFromDeckForEffect,
        swapPieces: swapPiecesForEffect,
        announceUse: announceHandEffectUseForEffect,
        pickHandEffectOption: pickOptionForEffect,
        // ジャンプ台の手札効果（これをゲート以外の任意のマスに表向きで置く）用。
        flipCard: flipToFaceUpForEffect,
        // 表向きに置いた先に既に駒がいた場合の到達判定（続き62）用。
        maybeTriggerArrivalForPlacedCard: maybeTriggerArrivalForPlacedCardForEffect,
        // 手品師の技の効果（アバターで相手を選び、手札を1枚ずつ交換する）用。
        pickPlayer: requestPlayerChoiceForEffect,
        swapRandomHandCard: swapHandCardWithOpponentForEffect,
        announceEffectReason: announceEffectReasonForEffect,
        announceEffectChoice: announceEffectChoiceForEffect,
        // 効果結果お知らせ（続き）用に、効果側でプレイヤー名を文面へ埋め込めるようにする。
        getPlayerName,
        // 色宣言の結果が判明した合図（続き65）。
        announceColorsResolved: announceColorsResolvedForEffect,
        // 試練の儀式・合同建設の手札効果（「上記の到達時の効果を得る」で到達効果と
        // 同じactionsをそのまま実行する、inheritsArrival参照）用。到達効果側には
        // 既にあったが、手札効果側にはまだ無かったので追加した。
        declareColors: declareColorsForEffect,
        placeFromDeckFaceUp: placeFromDeckFaceUpForEffect,
        delegateToPlayer: delegateToPlayerForEffect,
        // なないろの巨光・スラム上がりの役人・ザ・ギャンブルの「このフェイズを
        // 終了する。」用。
        endCurrentPhase: forceEndCurrentPhase,
        // ユーザー報告「ザ・ギャンブルで宣言色が出てしまったときに、手札がすべて
        // 捨てられず止まってしまっている」の調査で発見: ザ・ギャンブルの手札効果
        // （INHERIT_ARRIVAL_ACTIONS経由で到達効果のPUBLIC_DRAW_MATCHING_DECLARED_
        // COLOR_COUNTアクションを実行する）がこのpublicDrawヘルパーを呼ぶが、
        // 到達効果側（runAutoArrivalEffect）には元々あったのに手札効果側の
        // このオブジェクトには無かったため、TypeError（helpers.publicDraw is not a
        // function）が投げられ、runHandEffectOptionのアクションループに
        // try/catchが無いことも相まって、以降のアクション（宣言色一致判定・
        // 手札全捨て・フェイズ終了）が一切実行されないまま効果全体が静かに
        // 止まっていた（コンソールにエラーは出るがユーザー画面には何も表示されない）。
        publicDraw: publicDrawForEffect,
        // 赤のキューブ フェニックス（PICKUP_DISCARD_SECOND_FROM_TOP）・青のキューブ
        // セレスティア（DISCARD_RANDOM_FROM_QUALIFYING_OPPONENTS）用。
        drawFromDiscard: drawFromDiscardForEffect,
        pickRandomFromOpponentHand: pickRandomFromOpponentHandForEffect,
        // 奇跡の森 マンズウッド（PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END）用。
        publicDrawReturningTokens: publicDrawReturningTokensForEffect,
        markDiscardAtTurnEnd,
      }
    );
    clearEffectUiHighlights();
    // ユーザー要望（続き97）「接触回数やカード使用枚数など詳細スタッツを実装」。
    // runHandEffect()はコストが払えない・選択肢を選ばず終える等で発動できなかった
    // 場合はfalseを返す（card-effect-engine.jsのrunHandEffect参照）ため、実際に
    // 発動できた時だけカウントする。
    if (usedSuccessfully) recordCardUsed(player, cardId);
  } finally {
    // ユーザー報告（続き94）「合同建設をハンドフェイズで最後に使用して手札を
    // 使い切ったのに自動でハンドフェイズが終わらなかった」の原因: 直前まではここで
    // render()を呼んだ「直後」にsetHandEffectBusy(false)していたため、この
    // render()（→reconcilePhaseAutomation()→「手札が空か」の判定）はまだ
    // handEffectBusy===trueのまま実行されており、判定条件
    // `!handEffectBusy && (handIsEmpty(player) || ...)`が常にfalseになって
    // ハンドフェイズの自動終了がブロックされていた。setHandEffectBusy(false)を
    // 呼んだ「後」にrender()するよう順序を入れ替え、正しいbusy状態で
    // reconcilePhaseAutomation()が判定できるようにした。合同建設・スラム上がりの
    // 役人・パーティーのように、全員への委任(delegateToPlayer)で処理が長引く
    // 効果ほどこの隙間に引っかかりやすかった。
    setHandEffectBusy(false);
    // ユーザー要望（続き76/77）「カード効果処理の直後にも割り込みモーダルを出す」。
    // 続き77でanytime_checkpoint broadcastに乗せ、オンライン中も他クライアントへ届く
    // ようにした。
    fireAnytimeCheckpoint(player);
    render();
  }
}

async function runAutoArrivalEffect(cardId, location, player) {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === player);
  const cardToken = findTopCardAt(location);
  if (!piece || !cardToken) return;
  const arrivedAt = await runArrivalEffect(
    { cardId, player, pieceTokenId: piece.id, cardTokenId: cardToken.id, pieceLocation: location },
    {
      moveAndSync: moveAndSyncForEffect,
      flyCardToHand: flyBoardCardToHand,
      pickLocation: requestCellChoiceForEffect,
      pickHandCard: requestHandCardChoiceForEffect,
      onCardAcquiredToHand: onEffectCardAcquiredToHand,
      markPlacementTarget: markEffectPlacementTarget,
      markPlacedLocation: markEffectJustPlaced,
      placeFromDeck: placeFromDeckForEffect,
      swapPieces: swapPiecesForEffect,
      // カウンターロックの到達効果（１番少なくロックしているなら1枚ドロー）用。
      // 手札効果側（runAutoHandEffect）は既にdrawCardsを持っていたが、到達効果側には
      // まだ無かったので追加した。
      drawCards: drawCardsForEffect,
      // 手品師の技の到達効果（アバターで相手を選び、手札を1枚ずつ交換する）用。
      pickPlayer: requestPlayerChoiceForEffect,
      swapRandomHandCard: swapHandCardWithOpponentForEffect,
      // カウンターロックの「あなたは１番少なくロックしているので1枚ドローします」等、
      // 発動理由を一言説明するモーダル用。
      announceEffectReason: announceEffectReasonForEffect,
      announceEffectChoice: announceEffectChoiceForEffect,
      // 効果結果お知らせ（続き）用に、効果側でプレイヤー名を文面へ埋め込めるようにする。
      getPlayerName,
      // 色宣言の結果が判明した合図（続き65）。
      announceColorsResolved: announceColorsResolvedForEffect,
      // 白の意思の覚醒（場の全ての表向きのカードを捨てる）用。手札効果側は
      // 追色コストの支払いで元々discardAndSyncを持っていたが、到達効果側には
      // まだ無かったので追加した。
      discardAndSync: discardFromHandReveal,
      // ユーザー要望「効果が不発だった場合は『不発のためこのカードを手札に加えます』
      // 的なモーダルを出す」用。
      announceFizzle: announceEffectFizzleForEffect,
      // 選べる罠（arrivalOptions）・ザ・ギャンブル・試練の儀式用。
      pickArrivalOption: pickArrivalOptionForEffect,
      declareColors: declareColorsForEffect,
      publicDraw: publicDrawForEffect,
      placeFromDeckFaceUp: placeFromDeckFaceUpForEffect,
      // 合同建設・スラム上がりの役人・パーティー用。
      delegateToPlayer: delegateToPlayerForEffect,
    }
  );
  clearEffectUiHighlights();
  render();
  // moveアクションの結果、新しいマスへ「到達」した場合は、通常の移動と同じように続けて
  // そのマスの到達判定を行う（次のカードも構造化データを持っていればそのまま自動処理が
  // 連鎖し、持っていなければ通常の自己申告モーダルにそのまま自然に戻る）。ユーザー要望
  // 「移動先のカードが裏向きなら自動でオープンするようにしたい」への対応で、通常の
  // 「オープンする/しない」を尋ねるプロンプトは出さず、自動処理の連鎖中はここで
  // そのままオープンしてから続ける。
  if (arrivedAt) {
    const nextCard = findTopCardAt(arrivedAt);
    if (nextCard) {
      if (!nextCard.faceUp) {
        if (isOnlineMode()) {
          try {
            await flipToken(nextCard.id);
            markSelfHandled([nextCard.id]);
            await fetchAndHydrate(getCurrentGameId());
          } catch (err) {
            console.error("auto-open failed", err);
            return;
          }
        } else {
          flipToken(nextCard.id);
        }
        playSound("cardFlip");
        render();
      }
      const freshCard = getState().tokens.find((t) => t.id === nextCard.id);
      // ユーザー報告「ジャンプ台→ゴメンナサイ→選べる罠の順に到達が発生した時、
      // ゴメンナサイの移動処理が自動で行われてしまうとともにターンも切り替えられて
      // しまった」の原因: triggerCardArrivalは呼び出し元を待たせないfire-and-forget
      // 関数（onFullyResolvedコールバックで完了を伝える設計）のため、ここで素の呼び出し
      // （awaitせず）にすると、この連鎖1段先（ゴメンナサイ）のtriggerCardArrivalが
      // さらに1800ms待ってrunAutoArrivalEffectを開始する「前」に、この関数
      // （1段前・ジャンプ台側のrunAutoArrivalEffect）のPromiseが先に解決してしまい、
      // 呼び出し元のarrivalEffectAutoProcessingが（本当はまだ選べる罠まで連鎖が
      // 続いているのに）falseに戻ってしまっていた。onFullyResolvedを使い、この
      // 1段先の連鎖（選べる罠まで含む）が完全に終わるまでここで待つようにする。
      if (freshCard) {
        await new Promise((resolve) => triggerCardArrival(freshCard.cardId, arrivedAt, resolve));
      }
    }
  }
}

// ユーザー要望「到達効果の処理が終わったら原則ターンを終了します。なのでターン
// 終了アイコンを強調してターン終了を促そう」。自動処理中の到達効果が実際に処理
// されている間はtrueにし、updateEndTurnButton()側で「処理中はまだ強調しない」
// 判定に使う（isMovePhaseActive()がfalseになるのはmarkPhaseMoveActionTaken()の
// 時点＝移動/接触した瞬間で、その後の到達効果処理より先に来てしまうため、
// 「本当に全部終わったか」はこのフラグで別途追跡する必要がある）。
// ユーザー報告「パーティーの効果が一周する前にゲート侵攻処理が始まってターンが切り替わって
// しまった」への対応。以前はboolean1個で「到達効果の自動処理中か」を持っていたが、到達効果の
// 処理中に別の到達効果が入れ子で走る（例: パーティーが全員に選択を委任している最中、他プレイヤー
// の移動が再同期されてremote-move-animator由来の到達判定が別途走る等）と、内側の処理の
// finallyでフラグがfalseに戻され、外側のパーティーがまだ一周し切っていないのに「もう何も
// 処理していない」と誤判定されてしまう（→自動ターン終了・ゲート侵攻処理が割り込む窓が開く）。
// 入れ子に強いよう、boolフラグではなく深さカウンタにして「1つでも処理中なら true」とする。
let arrivalEffectProcessingDepth = 0;
function isArrivalEffectProcessing() {
  return arrivalEffectProcessingDepth > 0;
}

// spawnArrivalBurstのCSSアニメーション自体の長さ（1400ms、appendEffectHostのttlMs引数と
// 揃える）。ユーザー要望「到達アニメが完全終了して一息ついた後に効果モーダルを出す」への
// 対応で、効果処理の開始をこの長さ＋一息つく間だけ遅らせるのに使う。
const ARRIVAL_BURST_DURATION_MS = 1400;
const ARRIVAL_EFFECT_START_PAUSE_MS = 400;

// 到達演出一式（右上モーダル＋そのマス自体が発光する柱状のオーラ＋効果音）をまとめて行う。
// 柱の色はカード自身の色に合わせる（--color-*をそのまま使う）。到達した駒の持ち主にだけ
// 「このカードを手札に加える」ボタンを出す（ユーザー要望）。
// onFullyResolved（省略可）: maybeTriggerCardArrival参照。自動処理なら実際の
// 非同期処理が終わるまで待ってから、手動（ボタン）モードならモーダルを出した
// 時点ですぐに呼ぶ（クリックそのものは待たない——onResolvedと同じ精度）。
function triggerCardArrival(cardId, location, onFullyResolved) {
  const player = getPieceOwnerAt(location);
  const showAddToHand = !!player && player === getSelfSeat();
  // 診断（到達コンボ不発の調査）: どのブランチ（自動実行 or 手動モーダルのみ）に入るかを
  // 決める材料を全部残す。ユーザー報告「パーティを取って露出したジャンプ台の到達効果が
  // 起きない（モーダルは出る）」の切り分け用。auto=false ならモーダルのみ＝効果は動かない。
  logAction("arrival", {
    cardId,
    location,
    player,
    self: getSelfSeat(),
    showAddToHand,
    canAuto: canAutoProcessArrival(cardId),
    auto: showAddToHand && canAutoProcessArrival(cardId),
    depth: arrivalEffectProcessingDepth,
  });

  // ユーザー要望「カード効果の自動処理」。設定がONで、このカードが構造化データを持ち、
  // かつ「今まさに到達した本人の画面」の場合、「このカードを手札に加える」ボタンの
  // 代わりに効果そのものを自動実行する。ただしユーザー報告「自動処理モードでは到達
  // 拡大モーダルが相手の画面にしか出ない」への対応として、本人の画面にも
  // （ボタン無し・自動で消える表示専用の）同じ拡大モーダルを出す——効果は自動で
  // 進んでも、自分がどのカードに到達したかは見えないと分かりにくいため。
  if (showAddToHand && canAutoProcessArrival(cardId)) {
    arrivalEffectProcessingDepth++;
    // 続き75診断ログ: ユーザー報告「ムーブフェイズがきれいに終わったのにターンが
    // 終了されなかった」の調査用。このフラグがtrueのまま戻らなくなっていないか
    // （下のfinallyでの解除ログと突き合わせて確認する）を後から追えるようにする。
    logAction("diag-arrival-processing", { cardId, phase: "start" });
    showCardArrivalModal(cardId, { showAddToHand: false });
    playSound("arrivalEffect");
    const table = document.getElementById("game-table");
    const hostEl = findLocationElement(table, location);
    if (hostEl) spawnArrivalBurst(hostEl, getCardDefinition(cardId).color);
    // ユーザー要望「到達アニメが完全終了して一息ついた後に効果モーダルを出すように
    // してください」。以前はspawnArrivalBurst（柱状のオーラ、ARRIVAL_BURST_DURATION_MS
    // ぶんの一発演出）と同時にrunAutoArrivalEffectを並行して開始していたため、
    // 効果自体が最初に出すモーダル（色宣言等）がまだオーラの燃え上がり中に重なって
    // 出てしまっていた。オーラが完全に消えるまで待ち、さらに一息つく間（ARRIVAL_
    // EFFECT_START_PAUSE_MS）を置いてから効果処理を開始する。画面右上の到達拡大
    // モーダル（showCardArrivalModal）自体はデフォルトで自動的には消えない設定
    // （isCardArrivalModalPersistent）のため、これは待たずそのまま表示し続ける
    // （効果処理中も見えていてよい単なる情報表示のため）。アニメーション演出を
    // 無効にする設定（isArrivalEffectDisabled）の間はそもそも演出が流れないため、
    // 待たずに即座に効果処理を始める。
    (async () => {
      if (!isArrivalEffectDisabled()) {
        await wait(ARRIVAL_BURST_DURATION_MS + ARRIVAL_EFFECT_START_PAUSE_MS);
      }
      try {
        await runAutoArrivalEffect(cardId, location, player);
      } catch (err) {
        console.error("runAutoArrivalEffect failed", err);
        logAction("diag-arrival-processing", { cardId, phase: "error", message: String(err?.message ?? err) });
      } finally {
        arrivalEffectProcessingDepth = Math.max(0, arrivalEffectProcessingDepth - 1);
        logAction("diag-arrival-processing", { cardId, phase: "end", depth: arrivalEffectProcessingDepth });
        onFullyResolved?.();
        render();
      }
    })();
    return;
  }

  showCardArrivalModal(cardId, {
    showAddToHand,
    onAddToHand: () => addArrivedCardToHand(location, player),
  });
  onFullyResolved?.();
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
// onFullyResolved（省略可）: onResolvedより後、実際の到達効果処理そのものが
// 完全に終わった（自動処理ならその非同期処理まで含めて）タイミングで呼ばれる。
// onResolved自体は「オープンする/しないの選択が決着した瞬間」に発火するだけで、
// 自動処理の非同期処理はまだ走っている最中のことが多いため、優先権の返却
// （respondToContact参照）のような「本当に全部終わってから」が必要な用途向け。
function maybeTriggerCardArrival(dropTarget, pieceTokenId, onResolved, onFullyResolved) {
  // チュートリアルCPU戦の進行中は、到達（表向き）も「オープンする/しない」（裏向き）も
  // 台本側(tutorial-battle.js)が制御するため、通常のドラッグ経路のこの分岐は出さない
  // （前方以外への誤移動時に自ゲートで「オープンする/しない」が出てしまう不具合の対策）。
  if (isTutorialBattleActive()) {
    onResolved?.();
    onFullyResolved?.();
    return;
  }
  if (!dropTarget) {
    onResolved?.();
    onFullyResolved?.();
    return;
  }
  const card = findTopCardAt(dropTarget);
  if (!card) {
    onResolved?.();
    onFullyResolved?.();
    return;
  }
  if (!card.faceUp) {
    promptCardOpen(pieceTokenId, card, onResolved, onFullyResolved);
    return;
  }
  triggerCardArrival(card.cardId, card.location, onFullyResolved);
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
  // 診断（到達コンボ不発の調査）: パーティ等で上のカードが取り除かれ、下のカードが露出
  // した時にこの経路が実際に呼ばれ、駒がいて・表向きのカードを見つけて到達を起こせるかを
  // 記録する。ユーザー報告「パーティを取って露出したジャンプ台の到達効果が起きない」用。
  const top = location && (location.zone === "cell" || location.zone === "lock") ? findTopCardAt(location) : null;
  logAction("diag-exposed-arrival", {
    location,
    zoneOk: !!location && (location.zone === "cell" || location.zone === "lock"),
    hasPiece: !!location && hasPieceAt(location),
    topCardId: top?.cardId ?? null,
    topFaceUp: top?.faceUp ?? null,
  });
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

// 「オープンする」を選んだ（または自動処理モードで自動的にそう決まった）時の実処理。
// 元はyesBtnのクリックハンドラの中身だけだったが、続き70でユーザー要望「自動処理
// モードでは『移動』『強制移動』の場合で移動先が裏なら原則自動でオープンする」に
// 対応するため、手動クリックと自動処理の両方から呼べるよう単独の関数に切り出した。
async function openCardNow(card, onResolved, onFullyResolved) {
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
      onFullyResolved?.();
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
  if (freshCard) triggerCardArrival(freshCard.cardId, freshCard.location, onFullyResolved);
  else onFullyResolved?.();
  onResolved?.();
}

function promptCardOpen(pieceTokenId, card, onResolved, onFullyResolved) {
  closeOpenPrompt();
  // ユーザー要望（続き70）「接触されたプレイヤーがゲートに強制移動するとき、ゲートの
  // カードが裏向きなら自動でそれをオープンしてください。自動処理モードでは『移動』
  // 『強制移動』の場合で移動先が裏なら原則自動でオープンします」。このmaybeTrigger
  // CardArrival→promptCardOpenの経路は通常の移動(main.jsのドラッグ&ドロップ)と
  // 接触の強制移動(respondToContact)の両方から共通で呼ばれるため、ここ1箇所で
  // 分岐させれば両方に効く。手動の「オープンする/しない」プロンプト自体を出さず、
  // 即座にopenCardNow()を呼ぶ。
  if (isAutoProcessingEnabled()) {
    openCardNow(card, onResolved, onFullyResolved);
    return;
  }
  const pieceEl = document.querySelector(`.piece[data-token-id="${pieceTokenId}"]`);
  if (!pieceEl) {
    onResolved?.();
    onFullyResolved?.();
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
  yesBtn.addEventListener("click", () => openCardNow(card, onResolved, onFullyResolved));

  const noBtn = document.createElement("button");
  noBtn.className = "card-open-prompt-no";
  noBtn.textContent = "🚫 オープンしない";
  noBtn.addEventListener("click", () => {
    closeOpenPrompt();
    onResolved?.();
    onFullyResolved?.();
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
function openContactResultModal({ role, attacker, defender, cardId, onClose = null }) {
  const modal = document.createElement("div");
  modal.id = "contact-result-modal";
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modal.remove();
    onClose?.();
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

// ユーザー報告（続き106）「疑似CPUモードでもムーブフェイズで駒を接触可能なマスへ
// 誘導するところまでは自動でも、その先の『接触する』浮遊ボタン→『本当に接触しますか？』
// 確認モーダルの2段階が自動化されておらず、疑似CPU対象がここで詰んでいた」への対応。
// 実際に接触を申し込む処理そのもの（okBtnクリックハンドラの中身）をここへ切り出し、
// 通常のボタンクリックからも、疑似CPU対象が自動でスキップする経路からも同じ処理を
// 呼べるようにする。
async function submitContactProposal(attacker, defender) {
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
    // 接触が実際に成立した（pendingContactが立った）ので、ここで初めてムーブフェイズの
    // 「1手」を消費済みにする。クリック/ドラッグ/疑似CPUのどの経路も最終的にここを通る
    // ため、接触の行動済み化はこの1箇所に集約する（クリック時点で先に消費してしまうと、
    // 確認モーダルをキャンセルした時にmoveActionTaken=trueのまま自動でターンが終わって
    // しまう——ユーザー報告への対応）。
    markPhaseMoveActionTaken();
    render();
    // ユーザー要望（続き76/77）「接触宣言の直後にも割り込みモーダルを出す」。
    fireAnytimeCheckpoint(attacker);
  } catch (err) {
    console.error("requestContact failed", err);
    contactAttackerSnapshot = null;
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
      await submitContactProposal(attacker, defender);
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
  // ユーザー報告（続き106）「疑似CPUモードで接触可能なマスへ移動した後、『接触する』
  // ボタン→確認モーダルの2段階が自動化されておらず詰んでいた」への対応。疑似CPU対象の
  // 座席は、この2段階の手動確認UIを一切出さず、即座に接触を申し込む（既存の手動フローと
  // 同じsubmitContactProposalを直接呼ぶだけなので、承認/拒否・演出・オンライン同期は
  // すべて共通のまま）。
  if (isPseudoCpuTarget(attacker)) {
    submitContactProposal(attacker, defender);
    return;
  }
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

// チュートリアルCPU戦（tutorial-battle.js）の「接触」を台本で忠実に再現する。実際の
// respondToContactの承認フロー（pendingContact→承認/拒否モーダル→requestOpponentHand
// RitualPick）には乗らず、既存のタックル演出（playContactLunge/playContactFlight）と
// 結果モーダル（openContactResultModal）だけを流用する。状態変化（相手の手札を1枚奪う・
// 相手をゲートへ強制移動）は、呼び出し側（tutorial-battle.js）が渡すapplyStateChange
// コールバックで行う——本来のタックル演出が「駒を動かす前＝lunge」「動かした後＝flight」
// に分かれている順序をそのまま保つため。全てローカルの見た目だけの処理。
export async function playScriptedContact({ attackerPieceId, defenderPieceId, applyStateChange, attacker, defender, stolenCardId, role = "both" } = {}) {
  let tackle = null;
  if (!isFlightAnimationDisabled()) {
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
    // タックル演出中はこの後の状態変化で盤面が勝手に作り直されないよう汎用render()を止める
    // （respondToContact本来の処理と同じパターン）。
    suppressGenericRenderForContactTackle = true;
    await playContactLunge(tackle);
  }
  // 状態変化（tutorial-battle.jsが渡す: 相手の手札を1枚奪う＋相手をゲートへ強制移動）。
  applyStateChange?.();
  if (tackle) {
    await playContactFlight(defenderPieceId, tackle.defenderFromRect);
    suppressGenericRenderForContactTackle = false;
  } else {
    playSound("piecePlace");
  }
  render();
  // 結果モーダルは、閉じられるまで待つ（呼び出し側＝チュートリアルが、閉じたのを見てから
  // 次のモーダルへ進めるように）。ユーザー要望「接触の結果のモーダルを閉じるタイミングを
  // 作ってください」。
  await new Promise((resolve) => {
    openContactResultModal({ role, attacker, defender, cardId: stolenCardId ?? null, onClose: resolve });
  });
}

// --- エターナルカード獲得演出（ユーザー要望「ゲート侵攻によりエターナルカードを手に
// 入れるときの演出を取り入れたい」、採用案「3Dフリップ＋色バースト」） ------------------
// gate-invasion.jsのrunEternal()から、実際に状態を変える「前」に呼ばれる（見た目だけの
// ワンショット演出のため、タックル演出と同じ理由でstate変更前に行う）。
// ①エターナル山札が一瞬黒く発光→②山札から画面中央へ裏向きのまま飛んでいく→③中央で
// 虹色の縁取りが揺らめきながら少し溜める→④3Dフリップで表向きに反転、反転と同時に
// そのカードの色でバースト演出＋効果音→⑤その色でしばらく脈打つように光る→⑥自分の
// ロックエリアへ向けて飛んでいく、の6段階。各段階の秒数は管理者モードの「✨ 演出」→
// 「エターナルカード獲得演出」で調整できる（--eternal-anim-*、getContactAnimSecondsは
// 汎用実装のためそのまま流用）。
function getEternalRevealCenterRect(pileRect) {
  const scale = 2.1;
  const width = pileRect.width * scale;
  const height = pileRect.height * scale;
  return {
    left: window.innerWidth / 2 - width / 2,
    top: window.innerHeight / 2 - height / 2,
    width,
    height,
  };
}

async function playEternalAcquisitionAnim(attacker, cardId, cardDef, onDone) {
  const table = document.getElementById("game-table");
  const pileEl = table?.querySelector('.zone[data-pile="eternal"]');
  if (!table || !pileEl) {
    onDone();
    return;
  }
  const side = SEAT_TO_SIDE[attacker];
  const colorIndex = COLORS.indexOf(cardDef.color);
  const lockEl = findLocationElement(table, { zone: "lock", side, index: colorIndex });
  const pileRect = pileEl.getBoundingClientRect();
  const centerRect = getEternalRevealCenterRect(pileRect);

  // ①エターナル山札が一瞬黒く発光する（「これから何かが起きる」予告）。
  playSound("arrivalEffect");
  spawnArrivalBurst(pileEl, "black");
  await wait(getContactAnimSeconds("--eternal-anim-glow-duration", 1) * 1000);

  // ②山札から画面中央へ、裏向きのまま飛んでいく。
  const flightMs = getContactAnimSeconds("--eternal-anim-flight-duration", 1.5) * 1000;
  const { done: flightDone } = flyGhost(pileRect, centerRect, getCardBackImagePath(cardId), "setup-fly-card", flightMs);
  await flightDone;

  // ③中央で虹色の縁取りが揺らめきながら少し溜める（まだ裏向きのまま）。
  const reveal = document.createElement("div");
  reveal.className = "eternal-reveal-card is-suspense";
  reveal.style.left = `${centerRect.left}px`;
  reveal.style.top = `${centerRect.top}px`;
  reveal.style.width = `${centerRect.width}px`;
  reveal.style.height = `${centerRect.height}px`;
  const inner = document.createElement("div");
  inner.className = "eternal-reveal-card-inner";
  const backFace = document.createElement("div");
  backFace.className = "eternal-reveal-card-face is-back";
  backFace.style.backgroundImage = `url("${getCardBackImagePath(cardId)}")`;
  const frontFace = document.createElement("div");
  frontFace.className = "eternal-reveal-card-face is-front";
  frontFace.style.backgroundImage = `url("${getCardImagePath(cardId)}")`;
  inner.appendChild(backFace);
  inner.appendChild(frontFace);
  reveal.appendChild(inner);
  document.body.appendChild(reveal);
  await wait(getContactAnimSeconds("--eternal-anim-suspense-duration", 1.5) * 1000);

  // ④3Dフリップで表向きに反転。反転と同時にそのカードの色でバースト演出＋効果音。
  reveal.classList.remove("is-suspense");
  reveal.style.setProperty("--eternal-reveal-color", `var(--color-${cardDef.color})`);
  playSound("arrivalEffect");
  reveal.classList.add("is-bursting");
  const flipMs = getContactAnimSeconds("--eternal-anim-flip-duration", 1) * 1000;
  inner.style.transitionDuration = `${flipMs}ms`;
  inner.classList.add("is-flipped");
  await wait(flipMs);
  reveal.classList.remove("is-bursting");

  // ⑤その色でしばらく脈打つように光る。
  reveal.classList.add("is-revealed");
  await wait(getContactAnimSeconds("--eternal-anim-hold-duration", 2) * 1000);

  // ⑥自分のロックエリアへ向けて飛んでいく。ロックスロットのDOMが見当たらない
  // （通常起きないはずだが念のため）場合は、その場でフェードせずそのまま消す。
  reveal.remove();
  if (lockEl) {
    const lockRect = lockEl.getBoundingClientRect();
    const returnMs = getContactAnimSeconds("--eternal-anim-return-duration", 1) * 1000;
    const { done: returnDone } = flyGhost(centerRect, lockRect, getCardImagePath(cardId), "setup-fly-card", returnMs);
    await returnDone;
  }
  onDone();
}

// オンラインのゲート侵攻で「手札を奪う」演出（ユーザー要望「スリカエの時のような奪う演出を
// オンラインでも出したい」）。ローカルは対話的な儀式ピック（stealHandCardsRitualForGateInvasion）
// だが、オンラインはサーバーが既に無作為抽選済みのため同じ対話は再現できない。代わりに、
// 奪われた側の手札エリアから攻撃側の手札エリアへ、count枚ぶんのカード裏ゴーストを少しずつ
// 飛ばす純演出にする。gate-invasion-modal.jsの奪取ステップから注入経由で呼ぶ。
async function playGateInvasionStealAnim(attacker, defender, count, onDone) {
  const fromEl = document.querySelector(`.hand-area[data-player="${defender}"]`);
  const toEl = document.querySelector(`.hand-area[data-player="${attacker}"]`);
  if (isFlightAnimationDisabled() || !fromEl || !toEl || !count || count <= 0) {
    onDone();
    return;
  }
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();
  playSound("arrivalEffect");
  const flights = [];
  for (let i = 0; i < count; i++) {
    const { done } = flyGhost(fromRect, toRect, getCardBackImagePath(null), "setup-fly-card is-facedown", 700);
    flights.push(done);
    await wait(220); // 1枚ずつ間を置いて飛ばす（複数枚が重ならず「奪っている」感を出す）
  }
  await Promise.all(flights);
  onDone();
}

// broadcastContactApprovedを受けたattacker側が、儀式的ピックを終えて
// broadcastContactPickResolvedを送り返すまでの間、defender側で待つためのPromise。
// attacker/defenderの組み合わせが今のpendingContactと一致する初回の1件だけを拾う
// （複数回発火することは無い想定だが、念のため一致確認する）。
function waitForContactPickResolved(attacker, defender) {
  return new Promise((resolve) => {
    const unregister = onContactPickResolvedEvents((payload) => {
      if (payload.attacker !== attacker || payload.defender !== defender) return;
      unregister();
      resolve(payload.stolenCardId ?? null);
    });
  });
}

// broadcastContactApprovedを受け取ったattacker本人の画面で、defenderの裏向きの手札
// から儀式的に1枚選び、その結果（token id）をdefenderへ送り返す。攻撃されたdefender
// が承認した瞬間に呼ばれる（respondToContact参照）。
async function resolveContactRitualPickAsAttacker({ attacker, defender }) {
  const stolen = await requestOpponentHandRitualPick(
    defender,
    `${getPlayerName(defender)}の手札（裏向き）から奪う1枚を選んでください`
  );
  broadcastContactPickResolved({ attacker, defender, stolenCardId: stolen?.id ?? null });
}

// 接触されたプレイヤー（defender）が承認/拒否モーダル（contact-approval.js）で応答した
// 時に呼ばれる。承認された場合だけ、respondToFinalLockと同じ理由でローカルモードは
// 明示的に到達判定を呼ぶ必要がある（remote-move-animator.jsはisOnlineMode()で早期return
// する設計のため）。
async function respondToContact(approve) {
  const pendingBefore = getState().pendingContact;
  if (!pendingBefore) return;
  const { attacker, defender } = pendingBefore;
  // ユーザー要望（続き97）「接触回数やカード使用枚数など詳細スタッツを実装」。
  // 承認された（＝実際にカードを奪う・強制移動が起きる）場合だけをattacker視点の
  // 「接触回数」としてカウントする（拒否された接触は何も起きていないため対象外）。
  if (approve) recordContactMade(attacker);
  // 承認された場合の到達判定・奪われたカードの特定に使うため、駒のID・手札の中身は
  // 実際の効果が適用される前（＝ここではまだ何も変わっていない間）に確保しておく
  // （駒自体は消えずlocationだけ変わるのでIDは不変）。defender自身の手札は常に本人に
  // 実際のcardIdが見えているため、ここで捕まえておけば「何を奪われたか」をサーバーに
  // 問い合わせ直さずそのまま特定できる。
  const defenderPieceId = getState().tokens.find((t) => t.kind === "piece" && t.player === defender)?.id;
  const attackerPieceId = getState().tokens.find((t) => t.kind === "piece" && t.player === attacker)?.id;
  // ユーザー報告「Aが既にBのゲートにいるためBが強制移動で帰れない場合、優先権が
  // Bに移ったままAに戻らずタイムアウトになった」の原因を追うために、強制移動前の
  // 駒の位置を確保しておく（state.jsのRESPOND_CONTACTは「1マスに駒は1つ」の原則で
  // ゲートが埋まっている場合はdefenderの駒を一切動かさない仕様——ユーザー確認済み）。
  const defenderLocationBefore = getState().tokens.find((t) => t.id === defenderPieceId)?.location ?? null;
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

  // ユーザー要望「接触でカードを奪うときも、スリカエの時同様、儀式的に裏向きの手札
  // からカードを奪うステップを入れてください」＋その後の訂正「接触した側(attacker)が
  // 裏向きの手札から選ぶべきで、接触された側(defender)が選ぶ形になっているのは
  // 逆」への対応。実際に選ぶ主体は常にattacker（defenderの裏向きの手札を覗いて選ぶ）
  // にする必要がある。respondToContact()自体はcontact-approval.jsのcanRespond判定で
  // defender本人の画面からしか呼ばれない（承認/拒否ボタンがdefenderにしか出ない）ため、
  // オンライン中はここでattacker側の画面へ「選んでいいよ」の合図
  // （broadcastContactApproved）を送り、attacker側が選び終えた結果
  // （broadcastContactPickResolved）が届くまで待つ。ローカル対戦は1画面を全員で
  // 共有しているため、この往復は不要——そのままattacker視点の案内文でdefenderの
  // 手札を選ばせる（requestOpponentHandRitualPick自体はtargetPlayer＝defenderの
  // 手札を見せるだけで、呼び出し元が誰であるかは問わない）。
  let stolenCardId;
  if (approve && defenderHandBefore.length > 0) {
    if (isOnlineMode()) {
      broadcastContactApproved({ attacker, defender });
      // attacker側がbackdropクリック等でピックをキャンセルした場合はstolenCardId:null
      // が届く。ここでdefenderをいつまでも待たせるわけにいかないため、その場合は
      // サーバー側のフォールバック（無作為に1枚）に委ねる（RESPOND_CONTACTケース
      // 参照、stolenCardIdが渡らなければ従来通りサーバーが乱数で選ぶ）。
      const resolved = await waitForContactPickResolved(attacker, defender);
      stolenCardId = resolved ?? undefined;
    } else {
      const chosenCard = await requestOpponentHandRitualPick(
        defender,
        `${getPlayerName(attacker)}が、${getPlayerName(defender)}の手札（裏向き）から奪う1枚を選んでください`
      );
      if (!chosenCard) return;
      stolenCardId = chosenCard.id;
    }
  }

  // ユーザー報告「接触されてゲートのカードに到達して到達効果処理しないといけないけど、
  // ターンが切り替わっちゃってる」への対応。defenderの強制移動→ゲート到達効果の解決が
  // 終わるまで優先権をdefenderへ移すのは従来からの設計だが、以前はその移譲を
  // タックル演出が終わった後（＝respondContactでpendingContactが既に消えた後）に
  // 行っていた。そのため、attacker側のクライアントが「pendingContact=null かつ優先権は
  // まだ自分」という一瞬を掴むと、reconcileAutoEndTurnが「これ以上何も起きない」と誤判定
  // してdefenderのゲート到達効果を置き去りにしたままターンを終わらせてしまう窓があった。
  // 優先権をdefenderへ移す処理を、pendingContactを消すrespondContactより前に繰り上げる
  // ことで、この窓を塞ぐ（優先権の返却は従来通り finishContactResolution が行う）。
  // ピック選択のキャンセル（上の early return）より後・状態変更より前のこの位置で行う。
  if (approve && defenderPieceId) {
    logAction("diag-delegate", { phase: "contact-request", defender, turnPlayer: getState().turnPlayer });
    transferPriorityTo(defender);
  }

  // タックル演出のため、状態を変える(respondContact)前に「動く前」のDOM情報を確保して
  // おく——stateが変わった瞬間、下の汎用render()リスナー(subscribe)が同期的にDOMを
  // 作り直してしまうため、後から取り直すことができない。「移動アニメーション」設定が
  // 無効、駒のDOM要素が見当たらない等の場合はtackleがnullのままとなり、後段が
  // 従来通りのフォールバック（即座にrender()だけ）になる。
  let tackle = null;
  if (approve && defenderPieceId && attackerPieceId) {
    const attackerTokenForBroadcast = getState().tokens.find((t) => t.id === attackerPieceId);
    // ユーザー要望「接触タックル演出は参加者全員の画面に表示されるようにして」への対応。
    // 以前はこの演出が承認した本人（defender）の画面だけで再現されていた。実際に駒を
    // 動かす（respondContact）より前に、他のクライアント（attacker・傍観者）へも
    // 「これから始まる」と伝える（online.jsのbroadcastContactTackle参照）。この
    // クライアント自身の「移動アニメーションを無効にする」設定とは関係なく、他の
    // 参加者はそれぞれ自分の設定に従って再生するかどうかを決めるため、常に送る。
    if (isOnlineMode() && attackerTokenForBroadcast) {
      broadcastContactTackle({
        attackerPieceId,
        defenderPieceId,
        attackerColor: attackerTokenForBroadcast.color,
        defenderSeat: defender,
      });
    }
    if (!isFlightAnimationDisabled()) {
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
      await respondContact(approve, stolenCardId);
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
    respondContact(approve, stolenCardId);
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
    // ハマりどころ①（ユーザー報告「接触され側でオープンする/しないの選択が出ない（実際には
    // 出ているが、この結果モーダルの不透明な背景に隠れて見えなかった）」）: 到達判定
    // （裏向きなら「オープンする/しない」の選択）と同時にこの結果モーダルを出すと、
    // 結果モーダルの方が手前に重なって選択肢を覆い隠してしまう。
    // ハマりどころ②（ユーザー報告「接触した後、ターン終了が押せなくなっている」）:
    // ①の対策でonResolved（オープンする/しないの決着直後）まで遅らせただけでは
    // 不十分だった——強制移動先のカードが自動処理可能な到達効果を持ち、かつその効果が
    // パーティー・選べる罠・ザ・ギャンブルの色宣言等プレイヤーの選択を要するものだった
    // 場合、その選択モーダルがまだ表示されている最中にこの結果モーダル（backdrop無しだが
    // 中央に固定表示・z-index 10621）が重なって選択肢を覆い隠し、選べなくなる
    // →runAutoArrivalEffectが永遠に完了しない→優先権がdefenderに渡ったまま戻らず、
    // ターンプレイヤーのターン終了ボタンが永久に無効化されたままになっていた。
    // 到達判定・自動処理が完全に終わった後（onFullyResolved）まで表示を遅らせることで
    // 解決する。
    const showResultModal = () => {
      const stolen = findStolenCard();
      openContactResultModal({
        role: isOnlineMode() ? "defender" : "both",
        attacker,
        defender,
        cardId: stolen?.cardId ?? null,
      });
    };
    // ユーザー要望「接触されたプレイヤーは自分のゲートに強制移動しますが、その際、
    // 一度そのプレイヤーに優先権を移してください。強制移動もカードをオープンして
    // 到達効果が発動するので、その処理が終われば優先権をターンプレイヤーに戻し
    // ましょう」。defenderの強制移動によるオープン/到達効果解決の間だけ、優先権を
    // defenderへ一時的に移す（ターンプレイヤーがその間にターン終了ボタンを押して
    // defenderの解決を置き去りにしないよう、updateEndTurnButton側で優先権を
    // 持たないプレイヤーのターン終了ボタンを無効化している）。
    // ※この優先権の移譲（transferPriorityTo(defender)）と"contact-request"診断ログは、
    //   pendingContactを消すrespondContactより前（上の「approve && defenderPieceId」ブロック）へ
    //   繰り上げ済み。ここでは優先権の「返却」(finishContactResolution)だけを行う。
    const finishContactResolution = () => {
      logAction("diag-delegate", { phase: "contact-resolved", defender, returningPriorityTo: getState().turnPlayer });
      showResultModal();
      transferPriorityTo(getState().turnPlayer);
      // ユーザー要望（続き76/77）「接触処理の直後にも割り込みモーダルを出す」。
      fireAnytimeCheckpoint(defender);
    };
    // ユーザー報告（続き83）「Aが既にBのゲートにいてBが強制移動で帰れない場合、
    // 優先権がBに移ったままAに戻らずタイムアウトになった」の原因: state.jsの
    // RESPOND_CONTACT側は「1マスに駒は1つ」の原則でゲートが埋まっている場合
    // defenderの駒を一切動かさない仕様だが、ここでは移動の有無を見ずに常に
    // maybeTriggerCardArrival(defenderPiece.location, ...)を呼んでいたため、
    // 実際には動いていない（＝ずっと前からそこに立っている、既に到達済みの）
    // 駒についてもう一度到達効果を再発火させてしまっていた。この「本来起きて
    // いないはずの到達」の再処理が完了しない・選択待ちのまま埋もれる等で、
    // onFullyResolved（finishContactResolution）が呼ばれず優先権が戻らなかった
    // と考えられる。強制移動が実際に起きた場合（位置が変わった場合）だけ到達
    // 判定を行うようにし、動かなかった場合は到達判定自体をスキップして直接
    // 解決する。
    const defenderActuallyMoved =
      defenderPiece &&
      defenderLocationBefore &&
      (defenderLocationBefore.zone !== defenderPiece.location.zone ||
        defenderLocationBefore.row !== defenderPiece.location.row ||
        defenderLocationBefore.col !== defenderPiece.location.col);
    if (defenderPiece && defenderActuallyMoved)
      maybeTriggerCardArrival(defenderPiece.location, defenderPiece.id, undefined, finishContactResolution);
    else {
      finishContactResolution();
    }
  }
}

// ユーザー要望（続き89）「自動処理モードでは、接触に対するリアクションカード
// （カウンターロック等）を持っているかどうかを判定し、それを持っていればそのカードを
// 使うかどうかのモーダルが出るようにしてほしい」への対応。card-effects.jsの
// "red-counter-lock"は手札効果データを持たない反応専用カード（handEffectReactiveOnly）
// のため、findGomennasaiEligibility/useGomennasaiOnFinalLockと同じく専用の判定・
// 実行関数をここに直接実装する。カウンターロックにはゴメンナサイのような追加コスト
// （追色等）が無いため、単に手札に持っているかどうかだけを見ればよい。
function findCounterLockToken(seat) {
  return (
    getState().tokens.find(
      (t) => t.kind === "card" && t.cardId === "red-counter-lock" && t.location.zone === "hand" && t.location.player === seat
    ) ?? null
  );
}

// ユーザー確認済み方針（ゴメンナサイのcheckGomennasaiAutoApproval）と同じ考え方
// 「使えない人には見せずに自動で先へ進める」を接触にも適用する。自動処理モードOFF
// 中は従来通り常に手動の承認/拒否のままにする（自己申告プレイの前提のため、
// このガードごと何もしない）。render()の末尾から毎回呼ばれる。
let counterLockAutoApprovalInFlight = false;
function checkCounterLockAutoApproval() {
  const pending = getState().pendingContact;
  if (!pending || counterLockAutoApprovalInFlight || !isAutoProcessingEnabled()) return;
  if (isOnlineMode() && getSelfSeat() !== pending.defender) return;
  if (findCounterLockToken(pending.defender)) return; // 使えるなら自動承認せず本人の選択を待つ
  counterLockAutoApprovalInFlight = true;
  Promise.resolve(respondToContact(true)).finally(() => {
    counterLockAutoApprovalInFlight = false;
  });
}

// contact-approval.jsの「🛡️ カウンターロックを使う」ボタンから呼ばれる。docs/cards.md
// 「あなたへの接触の宣言時に使える。その接触を無効にする。あなたの手札を１枚ロック
// してもよい。」の通り、①接触を無効化する（respondToContact(false)は既存の「拒否する」
// ボタンと全く同じ経路——state.jsのRESPOND_CONTACTがpendingContactを消すだけで手札は
// 奪われず強制移動も起きない）②カウンターロック自身を捨てる（手札効果は自身を捨てる
// ことで得る、というこのゲーム共通のコスト）③「してもよい」なので、ロックできる手札が
// 残っていれば任意でロックさせる、の順に行う。
//
// ハマりどころ（実機テストで発見）: 当初は①②を逆順（先に捨ててから無効化）にしていた。
// discardFromHandReveal()はローカルモードだと同期的にrender()を呼び、その中で
// checkCounterLockAutoApproval()も走る——この時点でまだpendingContactは残ったままだが
// カウンターロックは既に手札から消えているため「使えるカードが無い」と誤判定され、
// 自分のrespondToContact(false)より先に自動でrespondToContact(true)（承認）が
// 発火してしまっていた（2回目の呼び出しはpendingContactが既にnullのため無害だが、
// 意図した「無効化」ではなく「承認」が先に成立してしまう）。無効化を先に行い
// pendingContactを即座にnullへ落としてから捨てることで、この競合を防ぐ。
async function useCounterLockOnContact() {
  const pending = getState().pendingContact;
  if (!pending) return;
  const defender = pending.defender;
  const token = findCounterLockToken(defender);
  if (!token) return;
  await respondToContact(false);
  await discardFromHandReveal(token.id);

  const remainingHand = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender
  );
  const lockableTokens = remainingHand.filter((t) => isCardLockable(t, defender));
  if (lockableTokens.length === 0) return; // 善処の原則: ロックできるカードが無ければ何も聞かずに終わる
  const wantsToLock = await confirmGenericYesNo(
    "🛡️ カウンターロックの効果で、手札を1枚ロックエリアにロックしますか？（任意）",
    { yesLabel: "ロックする", noLabel: "しない" }
  );
  if (!wantsToLock) return;
  const lockableIds = new Set(lockableTokens.map((t) => t.id));
  const chosen =
    lockableTokens.length === 1
      ? lockableTokens[0]
      : await requestHandCardChoiceForEffect(defender, "ロックする手札を選択してください", lockableIds);
  if (!chosen) return;
  const color = getCardDefinition(chosen.cardId).color;
  const dropTarget = { zone: "lock", side: SEAT_TO_SIDE[defender], index: COLORS.indexOf(color) };
  if (isOnlineMode()) {
    try {
      await moveToken(chosen.id, dropTarget);
      markSelfHandled([chosen.id]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("useCounterLockOnContact (optional lock) failed", err);
      render();
      return;
    }
  } else {
    moveToken(chosen.id, dropTarget);
  }
  playSound("cardPlace");
  render();
  maybeAnnounceLock(dropTarget, chosen.cardId, false);
}

// ユーザー要望「接触タックル演出は参加者全員の画面に表示されるようにして」への対応。
// 承認した本人（defender、respondToContact参照）以外の全クライアント（attacker・
// 傍観者）が、online.jsのcontact_tackle broadcastを受けてここを通る。まだ実際の
// 状態変更（respondContact）が届く前の時点で呼ばれるため、自分の画面のDOM座標を
// そのまま「動く前」の情報として使える。
async function waitForTokenLocationChange(tokenId, fromLocation, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  const fromJson = JSON.stringify(fromLocation);
  while (Date.now() < deadline) {
    const token = getState().tokens.find((t) => t.id === tokenId);
    if (token && JSON.stringify(token.location) !== fromJson) return true;
    await wait(100);
  }
  return false;
}

async function playContactTackleForBystander({ attackerPieceId, defenderPieceId, attackerColor }) {
  if (isFlightAnimationDisabled()) return;
  const table = document.getElementById("game-table");
  const attackerEl = table?.querySelector(`.piece[data-token-id="${attackerPieceId}"]`);
  const defenderEl = table?.querySelector(`.piece[data-token-id="${defenderPieceId}"]`);
  const attackerToken = getState().tokens.find((t) => t.id === attackerPieceId);
  const defenderToken = getState().tokens.find((t) => t.id === defenderPieceId);
  if (!table || !attackerEl || !defenderEl || !attackerToken || !defenderToken) return;
  const defenderFromRect = defenderEl.getBoundingClientRect();
  const defenderFromLocation = defenderToken.location;

  // respondToContact()と同じ理由で、実際の状態変更（このすぐ後にstate_changed
  // broadcastで届く）が汎用render()リスナー・remote-move-animator.jsに横取りされない
  // よう一時停止する。markSelfHandledも、remote-move-animator.js自身の差分検知による
  // 素の飛翔ゴーストとの二重演出を防ぐために必要。
  markSelfHandled([defenderPieceId]);
  suppressGenericRenderForContactTackle = true;
  // ユーザー報告「接触アニメ中に接触した側の画面にモーダルが表示されたままになる」
  // への対応。このクライアント（attacker・傍観者）では、汎用render()が上のフラグで
  // 演出終了まで止まるため、その間にstate.pendingContactがnullになってもモーダルの
  // 更新が届かない。演出を始める時点でcontact-approval.js側へ直接、即座に隠すよう
  // 伝える（defender本人が承認/拒否ボタンを押した時のhideImmediately()と同じ考え方）。
  hideContactApprovalModalImmediately();
  try {
    await playContactLunge({
      attackerEl,
      defenderFromRect,
      attackerRect: attackerEl.getBoundingClientRect(),
      defenderFromLocation,
      attackerFromLocation: attackerToken.location,
      attackerColor,
    });
    // タックル演出自体（数秒）の間に、実際の状態変更がほぼ確実に届いているはずだが、
    // 万一まだの場合に備えて少し待つ（最大4秒）。それでも届かなければ諦めて
    // render()だけで最新状態に追従する。
    await waitForTokenLocationChange(defenderPieceId, defenderFromLocation, 4000);
    await playContactFlight(defenderPieceId, defenderFromRect);
  } finally {
    suppressGenericRenderForContactTackle = false;
    render();
  }
}

function renderBoardTokens(table) {
  for (const token of getState().tokens) {
    if (token.location.zone !== "cell" && token.location.zone !== "lock") continue;
    const host = findLocationElement(table, token.location);
    if (!host) continue;
    const el = token.kind === "piece" ? buildCubePiece(token.color, token.player) : buildFlatCard(token);
    el.dataset.tokenId = token.id;
    if (token.kind === "piece") {
      // 飾りペット(piece-pet.js)が「駒の自ゲート側」に立てるよう、画面上のゲート方向
      // （盤面回転で自分が手前に来た後の表示上のside）を持たせておく。通常の対局では駒に
      // playerが入るが、初期配置(state.jsのPIECE_START)ではplayerが無くcolorだけのため、
      // showAllPieceNameBubblesと同じ「色→座席（COLORSの並び＝各座席の担当色）」で補う。
      const owner = token.player ?? SEAT_ORDER[COLORS.indexOf(token.color)] ?? null;
      const gateSide = owner ? rotateSide(SEAT_TO_SIDE[owner], getRotationSteps(getSelfSeat())) : null;
      if (gateSide) el.dataset.gateSide = gateSide;
      if (owner) el.dataset.owner = owner; // 飾りペットが所有者の選択した絵文字を出すため
    }
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
    // ユーザー報告「スマホで2D表示時に、駒をまだ触ってない状態で駒が描画されないことが
    // ある。見えない駒を触ると描画される」。.pieceの元々のwill-change:transformコメントに
    // ある「初回のコンポジットレイヤー確立に失敗するWebKit系の不具合」と同系統と判断した。
    // 2D表示(body.diagnostic-flatten-3d)は`* { transform-style: flat !important; }`で
    // 全要素のコンポジット方式を丸ごと変えてしまうため、新しく生成される駒がこの変化後の
    // 初回描画に失敗しやすいと考えられる。触る（render()で作り直される）と直る＝
    // 一度でも作り直せば正しく描けることは分かっているため、appendChild直後に
    // display一時トグルで強制的に作り直させ、初回描画を確定させる。
    if (token.kind === "piece" && document.body.classList.contains("diagnostic-flatten-3d")) {
      // ハマりどころ: 2回試した「同じ要素のdisplayを一瞬トグルして強制再描画」
      // （同期的トグル→ダメ、2フレーム遅延トグル→それでも直らないとの報告）は
      // どちらも効かなかった。「触る（掴んで動かす）と直る」の実体は、render()が
      // 状態変化のたびにDOMを"作り直す"こと——つまり同じ要素へのdisplayトグル程度
      // ではなく、要素そのものを一度捨てて真新しいDOM要素に置き換えることで
      // 初めて直っている。displayトグルは同じ要素・同じコンポジットレイヤーの
      // 使い回しのままなので、レイヤー確立自体が壊れている場合は効果が無かったと
      // 考えられる。実際に「作り直す」動作を再現するため、appendChildした直後の
      // 要素を（数フレーム後に）丸ごと破棄し、buildCubePieceで新規に組み立て直した
      // 要素へ差し替える。
      const classNameSnapshot = el.className;
      const styleCssTextSnapshot = el.style.cssText;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!el.isConnected || !el.parentNode) return;
          const replacement = buildCubePiece(token.color, token.player);
          replacement.dataset.tokenId = token.id;
          replacement.className = classNameSnapshot;
          replacement.style.cssText = styleCssTextSnapshot;
          el.parentNode.replaceChild(replacement, el);
        });
      });
    }
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

// ハマりどころ: この2つは元々render()の定義よりずっと後ろ（オンライン対戦の入り口
// 付近）で宣言されていた。render()自身は「関数宣言」なのでファイルのどこからでも
// 呼べてしまうため、何らかの経路でrender()の定義より後ろ・この宣言より前のタイミングで
// 呼ばれると、let変数の初期化前アクセス（TDZ）でReferenceErrorになる実害があった
// （テスト用にhydrateState()を直接叩いた時に発覚）。render()自身がこの2つを参照する
// ため、render()の定義より前（＝実行時に必ず先に評価される位置）へ移した。
let suppressGenericRenderForOnlineStart = false;
// respondToContact()のタックル演出（playContactLunge/playContactFlight）中、同じ理由で
// 汎用render()リスナー・remote-move-animator.jsを一時停止するためのフラグ。
let suppressGenericRenderForContactTackle = false;

// 観戦中の告知バナー（ユーザー要望）。観戦モード（すべて/公開）を表示し、観戦をやめる導線を出す。
let spectatorBannerEl = null;
function updateSpectatorBanner() {
  if (isSpectatingGame()) {
    if (!spectatorBannerEl) {
      spectatorBannerEl = document.createElement("div");
      spectatorBannerEl.id = "spectator-banner";
      const label = document.createElement("span");
      label.className = "spectator-banner-label";
      const exitBtn = document.createElement("button");
      exitBtn.type = "button";
      exitBtn.className = "spectator-banner-exit";
      exitBtn.textContent = "観戦をやめる";
      exitBtn.addEventListener("click", () => leaveGame().catch((err) => console.error("leaveGame (spectator) failed", err)));
      spectatorBannerEl.appendChild(label);
      spectatorBannerEl.appendChild(exitBtn);
      document.body.appendChild(spectatorBannerEl);
      spectatorBannerEl._label = label;
    }
    spectatorBannerEl._label.textContent =
      getSpectateMode() === "all" ? "👀 観戦中（すべて見える）" : "👀 観戦中（公開情報のみ）";
    spectatorBannerEl.style.display = "flex";
  } else if (spectatorBannerEl) {
    spectatorBannerEl.style.display = "none";
  }
}

function render() {
  updateSpectatorBanner();
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
    const online = isOnlineMode() || isOnlineIntentActive();
    // オンラインで「対局開始前」（＝サーバーがまだBOOTSTRAP_GAMEしておらずturnPlayerが
    // 未設定）の間は、activePlayersがローカルの古いサンドボックス値のまま残っていることが
    // ある（部屋主が入室前に4人ローカル対局をセットアップしていた等）。この場合に
    // activePlayers.lengthで先に判定してしまうと、後から入室した人の仮座席（roster）が
    // 無視され、部屋主の画面で対面の席が空のままになる（ユーザー報告「相手が着席しても
    // 部屋主側に出ない」の原因）。開始前はactivePlayersを見ず、必ずroster/自分自身で
    // 判定する。開始後（turnPlayerあり）は従来通りactivePlayers（＝実参加者）で判定。
    if (online && !getState().turnPlayer) return player === self || !!getSyncedIdentity(player);
    if (activePlayers.length > 0) return activePlayers.includes(player);
    // 「オンラインで続ける」を押した直後、まだ部屋を選んでいない間もisOnlineIntentActive()で
    // 拾う（isOnlineMode()の直後の説明コメント参照）。
    if (online) return player === self || !!getSyncedIdentity(player);
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
  reapplyEffectPickerHighlights(table);
  // ユーザー要望「収穫と種まきの置き直し先を忘れないようにハイライトしてほしい」＋
  // 「増殖する樹々の手札効果で、マスを選択するとき、どのマスが選択済みかがわかりづらい」。
  // pendingPlacementLocationsが選択の対象候補（activeEffectPicker）とは別に、
  // PLACE_CARDが完了する（main.jsのclearEffectUiHighlightsが呼ばれる）まで
  // 再表示のたびに貼り直す。
  for (const key of pendingPlacementLocations) {
    const [row, col] = key.split(",").map(Number);
    const targetEl = findLocationElement(table, { zone: "cell", row, col });
    if (targetEl) targetEl.classList.add("card-effect-placement-target");
  }
  // ユーザー要望「配置後ここに配置したよがわかるように配置場所をしっかりハイライト
  // してください。マスの枠だけでなくカードの面もね」。
  for (const key of justPlacedLocations) {
    const [row, col] = key.split(",").map(Number);
    const targetEl = findLocationElement(table, { zone: "cell", row, col });
    if (targetEl) targetEl.classList.add("card-effect-just-placed");
  }
  fitTableToViewport();
  updateEndTurnButton();
  updateDrawButton();
  updatePublicDrawButton();
  updateHandShuffleButton();
  updateSelfHandStatus();
  updateTurnRoundCounter();
  updateFinalLockApprovalBanner();
  checkGomennasaiAutoApproval();
  updateTimerToggleButton();
  updateTimerToggleBanner();
  updateAutoProcessingToggleBanner();
  updateContactApprovalModal();
  checkCounterLockAutoApproval();
  checkContactAttackerResolution();
  // ゲート侵攻演出のモーダルがrender等でDOMから外れていたら貼り直す保険（オンラインで
  // 演出が出ないという報告への対応。gate-invasion-modal.jsのreapplyGateInvasionModal参照）。
  reapplyGateInvasionModal();
  // チュートリアルCPU戦は台本で勝利演出を出すため、実ゲームの勝利判定（オンライン向けの
  // 勝利モーダル・通貨・ランキング等）はスキップする。
  if (!isTutorialBattleActive()) checkForVictory();
  // 更新バナーは対局中は保留。対局終了・ホーム復帰などで状況が変わったここで再評価する。
  reevaluateUpdateBanner();
  // ユーザー要望「効果自動処理がオンの時はフェイズも自動で流れるようにしよう」。
  // render()のたびに「今のフェイズでもう次へ進めるか」を判定する（他の再適用系処理
  // ・reapplyActiveHighlights等と同じ「呼び出し元がrender()の末尾で毎回呼ぶ」設計）。
  // ユーザー報告「オンラインでゲームを開始した後、盤面にカードを並べている間に
  // フェイズモーダルが始まってしまう」の原因: オンライン配布演出
  // （animateFirstCardsDealt/animateBoardFilled）は演出の見た目を進めるため自前で
  // 直接render()を呼ぶ（subscribe(render)経由の汎用リスナー自体はsuppressGeneric
  // RenderForOnlineStartで止めてあるが、演出関数自身の直接呼び出しはその対象外）。
  // render()がそのたびに無条件でreconcilePhaseAutomation()を呼んでいたため、
  // turnPlayerが既に非nullになっている配布演出の最中でも反応してしまっていた。
  // 演出中はこの判定自体をスキップする。
  if (!suppressGenericRenderForOnlineStart) reconcilePhaseAutomation();
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

// 手札の扇形レイアウトはrotate()で傾けているため、隣り合う2枚のカードの実際の
// 矩形が指のかなり広い範囲で重なり合う（カード自体が大きく、扇の開き幅が狭い時ほど
// 顕著——ユーザー報告「セレナーデをクリックしても何も起きない」の根本原因）。
// document.elementsFromPoint()は重なっている位置ではDOM順で手前（後の兄弟）の
// カードを常に返すため、素朴に「最初に見つかった.hand-card」を採用すると、
// クリックした本人の意図（見た目上どのカードのつもりだったか）と食い違うことがある。
// elementsFromPoint()の結果に含まれる.hand-card候補全てを集め、各カード自身の
// getBoundingClientRect()の中心とクリック座標との距離が一番近いものを選ぶことで、
// 重なりの中でも「どちらのカードに近いか」を優先させる（DOM順への依存をやめる）。
function closestByCenter(candidates, clientX, clientY) {
  let best = null;
  let bestDist = Infinity;
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const dx = clientX - (rect.left + rect.width / 2);
    const dy = clientY - (rect.top + rect.height / 2);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  }
  return best;
}

// 自動処理モードの操作制限が今効いているか（ユーザー要望）。自動処理ON＋制限ON＋観戦でない
// ＋チュートリアルでない時だけ。管理者はオプションから制限を解除できる（isAutoDragRestriction
// Enabled）。auto-drag-restriction.js参照。
function autoDragRestrictionActive() {
  return (
    isAutoProcessingEnabled() &&
    isAutoDragRestrictionEnabled() &&
    !isSpectatingGame() &&
    !isTutorialBattleActive()
  );
}

// 制限中に「掴んでよい」唯一の対象＝自分の手札カード（zone hand / publicDraw）。
function isOwnGrabbableCard(tokenId) {
  const t = getState().tokens.find((x) => x.id === tokenId);
  return (
    !!t &&
    t.kind === "card" &&
    (t.location.zone === "hand" || t.location.zone === "publicDraw") &&
    t.location.player === getSelfSeat()
  );
}

function findDraggableAt(clientX, clientY) {
  // 観戦者は読み取り専用。掴める対象を一切返さない（ドラッグ・接触・ロック等を封じる）。
  if (isSpectatingGame()) return null;
  const elements = document.elementsFromPoint(clientX, clientY);
  // 自動処理モードの操作制限（ユーザー要望）: 掴めるのは自分の手札カードだけにし、駒・盤面/
  // ロックのカード・山（山札/捨て場/エターナル/ファースト）・相手の手札は掴めなくする。駒の
  // 移動は移動フェイズの移動先マスのタップ（上のcaptureハンドラ）で従来どおり可能。
  const restrict = autoDragRestrictionActive();
  // チュートリアルCPU戦中は、掴める対象を「自分(A)の駒」と「手札カード（ロックのための
  // ドラッグに使う）」だけに絞る。ユーザー要望「盤面のカードを掴めなくして」＋「隣のCPUの駒を
  // クリックしても掴むだけで接触が起こらない」への対応——相手(CPU)の駒と盤面カードを掴めなく
  // すれば、それらへのクリックはドラッグ開始に奪われず、チュートリアル側のクリック判定
  // （接触・移動）が正しく発火する。
  const tutorial = isTutorialBattleActive();
  for (const el of elements) {
    const piece = el.closest(".piece");
    if (piece) {
      // チュートリアル中は駒のドラッグ＆ドロップを無効化し、タップ移動だけにする（ユーザー要望）。
      // 掴めなくすることで、駒への操作はドラッグ開始に奪われず、チュートリアル側のタップ判定
      // （移動・接触）へそのまま渡る。
      if (tutorial) continue;
      if (restrict) continue; // 自動処理モードの制限: 駒は掴めない（移動はタップで行う）
      return { el: piece, tokenId: piece.dataset.tokenId, kind: "piece" };
    }
  }
  for (const el of elements) {
    // 盤面マス／ロックスロットに直接置かれたカードは、手札のカードと違ってダブルクリックで
    // 表裏を反転できる対象なので区別しておく(isBoardCard)。
    const boardCard = el.closest(".board-card");
    if (boardCard) {
      if (tutorial) break; // チュートリアル中は盤面カードを掴めなくする
      if (restrict) break; // 自動処理モードの制限: 盤面・ロックエリアのカードは掴めない
      return { el: boardCard, tokenId: boardCard.dataset.tokenId, kind: "card", isBoardCard: true };
    }
  }
  for (const el of elements) {
    // 手札公開エリアのカードも「場のカードと同じように扱えるように」というユーザー要望で、
    // .board-cardと同じ扱い（つかんで動かせる・ダブルクリックで表裏反転できる）にする。
    const revealCard = el.closest(".hand-reveal-card");
    if (revealCard) {
      if (tutorial) break;
      // 自動処理モードの制限: 手札公開エリア（自分のもの）は掴める（効果発動のため）。
      // 他人のものは掴めない。
      if (restrict && !isOwnGrabbableCard(revealCard.dataset.tokenId)) break;
      return { el: revealCard, tokenId: revealCard.dataset.tokenId, kind: "card", isBoardCard: true };
    }
  }
  // 手札は「実際に手前に見えている（elementsFromPoint()の先頭＝最前面）」カードを掴む対象に
  // する。以前はclosestByCenter（中心距離）だったが、ユーザー要望で持ち上げ(findSelfHandCardAt)・
  // プレビュー(findHoverTarget)と揃えて“見えているカード”方式に統一した（3つが常に一致する）。
  for (const el of elements) {
    const handCard = el.closest(".hand-card");
    if (handCard) {
      // 自動処理モードの制限: 自分の手札カードだけ掴める（相手の手札は掴めない）。
      if (restrict && !isOwnGrabbableCard(handCard.dataset.tokenId)) continue;
      return { el: handCard, tokenId: handCard.dataset.tokenId, kind: "card" };
    }
  }
  for (const el of elements) {
    const stack = el.closest(".stack[data-pile]");
    if (stack) {
      if (restrict) break; // 自動処理モードの制限: 山札・捨て場・エターナル/ファースト束は掴めない
      return { el: stack, kind: "pile", pile: stack.dataset.pile };
    }
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
  // ユーザー要望「手札のホバー検知を厳格に。手札は一部重なって描画されるので、実際に手前に
  // 見えている部分をホバーした時だけ、そのカードが反応する（ひょこっと出てくる）ようにしたい」。
  // クリック(findDraggableAt)は「掴みたいカードを中心距離で拾う」寛容な判定のままにするが、
  // ホバー（プレビュー拡大・ハイライト）は elementsFromPoint の先頭＝実際に最前面に見えている
  // .hand-card をそのまま採用する（見えているスリバー＝そのカード、という直感に合わせる）。
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

// #card-previewの位置決め。既定はカーソルの右上方向に広げるが、画面端をはみ出す場合は
// 表示方向を反転させ、さらに最後にステージ内へクランプする。
// ユーザー報告「拡大表示が画面の端で見切れるときがある」への対応：以前は右端・上端で
// 方向を反転するだけだったため、(1)反転後にカーソルが左端寄り/下端寄りだと今度は左端・
// 下端で見切れる、(2)反転してもパネルがカーソル位置より大きいと反対側にはみ出す、
// という取りこぼしがあった。left/topを算出したうえで必ずステージ内に収まるよう
// クランプして、どの端でも見切れないようにする。
function positionPreviewPanel(panel, clientX, clientY) {
  const offset = 20;
  const margin = 8;
  const cs = getComputedStyle(panel);
  const panelWidthPx = parseFloat(cs.width);
  const panelHeightPx = parseFloat(cs.height);
  // ステージ方式導入により、panelはbody（ステージ）に対してfixedになったため、
  // clientX/clientY（常に実画面座標）をステージのローカル座標に変換してから使う
  // （stageClientToLocal参照）。画面端の判定もSTAGE_WIDTH/STAGE_HEIGHT基準にする。
  const local = stageClientToLocal(clientX, clientY);
  const { x: clientXLocal, y: clientYLocal } = local;

  // 横: 既定はカーソル右。右端をはみ出すならカーソル左へ。最後にステージ内へクランプ。
  let left = clientXLocal + offset;
  if (left + panelWidthPx > STAGE_WIDTH) left = clientXLocal - offset - panelWidthPx;
  left = Math.max(margin, Math.min(left, STAGE_WIDTH - panelWidthPx - margin));

  // 縦: 既定はカーソル上方向へ広げる。上端をはみ出すなら下方向へ。最後にステージ内へクランプ。
  let top = clientYLocal - offset - panelHeightPx;
  if (top < 0) top = clientYLocal + offset;
  top = Math.max(margin, Math.min(top, STAGE_HEIGHT - panelHeightPx - margin));

  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  panel.style.bottom = "";
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

// ユーザー要望「駒にカーソルをかざすと全部の駒にプレイヤー名が吹き出すようにしたい」。
// 盤面は3Dに傾いているため駒に文字を直に載せると読みづらい。カード拡大プレビュー
// （#card-preview）と同じく、各駒の画面上の位置をステージ座標へ変換し、駒の上に画面座標の
// 吹き出しをかぶせる方式にする。どれか1つの駒にホバーしている間、全ての駒の名前を同時に出す。
let pieceNameBubbleEls = [];
let pieceNameBubblesShown = false;
function hideAllPieceNameBubbles() {
  for (const el of pieceNameBubbleEls) el.remove();
  pieceNameBubbleEls = [];
  pieceNameBubblesShown = false;
}
function showAllPieceNameBubbles() {
  hideAllPieceNameBubbles();
  const pieces = document.querySelectorAll("#game-table .piece[data-token-id]");
  for (const pieceEl of pieces) {
    const token = getState().tokens.find((t) => t.id === pieceEl.dataset.tokenId);
    if (!token) continue;
    // 通常の対局では駒トークンにplayer（座席）が入っているが、1画面検証用の初期配置
    // （state.jsのPIECE_START）ではplayerが無くcolorだけを持つ。その場合は色→座席
    // （COLORSの並び＝各座席の担当色）で座席を割り出してフォールバックする。
    const player = token.player ?? SEAT_ORDER[COLORS.indexOf(token.color)] ?? null;
    if (!player) continue;
    const rect = toStageLocalRect(pieceEl.getBoundingClientRect());
    const bubble = document.createElement("div");
    bubble.className = "piece-name-bubble";
    bubble.dataset.player = player;
    bubble.textContent = getPlayerName(player);
    bubble.style.left = `${(rect.left + rect.right) / 2}px`;
    bubble.style.top = `${rect.top}px`;
    document.body.appendChild(bubble);
    pieceNameBubbleEls.push(bubble);
  }
  pieceNameBubblesShown = pieceNameBubbleEls.length > 0;
}

function updateHover(clientX, clientY) {
  // ドラッグ中はドロップ先ハイライト(.drop-target-active)と役割が被って紛らわしいので休止する。
  if (dragSession) {
    clearHover();
    updatePreview(null);
    hideAllPieceNameBubbles();
    return;
  }
  const next = findHoverTarget(clientX, clientY);
  if (next !== hoverEl) {
    clearHover();
    if (next) next.classList.add("hover-active");
    hoverEl = next;
  }
  updatePreview(next, clientX, clientY);
  // 駒にホバーしている間だけ、全駒の名前吹き出しを出す（駒→駒の移動では作り直さない）。
  const isPieceHover = !!(next && next.classList && next.classList.contains("piece"));
  if (isPieceHover && !pieceNameBubblesShown) showAllPieceNameBubbles();
  else if (!isPieceHover && pieceNameBubblesShown) hideAllPieceNameBubbles();
}

function initHoverHandlers() {
  const table = document.getElementById("game-table");
  table.addEventListener("pointermove", (e) => updateHover(e.clientX, e.clientY));
  table.addEventListener("pointerleave", () => {
    clearHover();
    updatePreview(null);
    hideAllPieceNameBubbles();
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
// カーソル/タップ座標にある自分の手札カードを返す（無ければnull）。
// ユーザー要望（最新）「実際に手前に見えているカードをホバーすると、そのカードが
// ひょこっと持ち上がるようにしたい（緑にカーソルを合わせているのに紫が持ち上がるのを直す）」。
// 手札は扇状に一部重なって描画されるため、以前は掴む/プレビュー判定と揃える目的で
// closestByCenter（中心距離が一番近い1枚）にしていたが、それだと「見えているスリバー」と
// 別のカードが選ばれることがあった。elementsFromPoint()は重なり位置で「実際に最前面に
// 描画されている（＝見えている）」カードを先頭に返すため、その先頭をそのまま採用する
// （findHoverTarget/findDraggableAtの手札分岐も同じ“最前面”方式に統一済み——持ち上げ・
// プレビュー・掴むが常に一致する）。
function findSelfHandCardAt(clientX, clientY) {
  const elements = document.elementsFromPoint(clientX, clientY);
  for (const el of elements) {
    const handCard = el.closest(".hand-card.is-self");
    if (handCard && handCard.closest(".zone-bottom .hand-area")) return handCard;
  }
  return null;
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

// 捨て札一覧（ユーザー要望「捨て札の山を右クリックで捨て札一覧を見れるように」）。捨て場は
// ルール上「表向きに積む」場所なので中身を隠す必要は無い。piles.discardはcardIdの配列
// （末尾＝一番上）で、一番上（＝最後に捨てられたカード）を先頭に並べる。showStackModalと
// 同じ見た目（#stack-modal / .stack-modal-*）を流用する。
function showDiscardListModal() {
  const discard = getState().piles.discard;
  const modal = document.createElement("div");
  modal.id = "stack-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });
  const title = document.createElement("div");
  title.className = "stack-modal-title";
  title.textContent = discard.length > 0 ? `捨て札一覧（${discard.length}枚・上から順）` : "捨て札一覧";
  const list = document.createElement("div");
  list.className = "stack-modal-list";
  if (discard.length === 0) {
    const empty = document.createElement("div");
    empty.textContent = "捨て札はありません。";
    empty.style.cssText = "color: #94a3b8; padding: 1rem;";
    list.appendChild(empty);
  } else {
    for (let i = discard.length - 1; i >= 0; i--) {
      const cardId = discard[i];
      const card = document.createElement("div");
      card.className = "stack-modal-card";
      card.style.backgroundImage = `url("${getCardImagePath(cardId)}")`;
      card.title = getCardDefinition(cardId)?.name ?? "";
      list.appendChild(card);
    }
  }
  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(list);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// showStackModalのクリック可能版。重なったカード（ファースト＋エターナル等）から、ハンド
// フェイズで使う1枚をクリックで選ばせる（ユーザー要望「1色のロックエリアに2枚あるとき、
// クリックで2枚を出してどちらを使うか選べるように。現状は上のカードしか使えない」）。
// 選ばれたトークンを返す（キャンセル＝backdrop/✕クリックはnull）。
function pickStackedLockCard(tokens, hint) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.id = "stack-modal";
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      backdrop.remove();
      modal.remove();
      resolve(val);
    };
    const backdrop = createBackdrop(() => finish(null), { zIndex: 10001 });
    const title = document.createElement("div");
    title.className = "stack-modal-title";
    title.textContent = hint ?? "使うカードを選んでください（下から上の順）";
    const list = document.createElement("div");
    list.className = "stack-modal-list";
    for (const token of tokens) {
      const card = document.createElement("div");
      card.className = "stack-modal-card is-pickable";
      const imagePath = token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
      card.style.backgroundImage = `url("${imagePath}")`;
      if (token.faceUp) card.title = getCardDefinition(token.cardId)?.name ?? "";
      card.addEventListener("click", () => finish(token));
      list.appendChild(card);
    }
    modal.appendChild(createModalCloseX(() => finish(null)));
    modal.appendChild(title);
    modal.appendChild(list);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  });
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
      if (hit.matches(".stack[data-pile]") && hit.dataset.pile === "discard") {
        items.push({ label: "捨て札一覧を見る", onClick: () => showDiscardListModal() });
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

    // ユーザー要望「ハンドフェイズで手札を掴んだら『場にドロップで手札効果が発動します』的な
    // モーダルを中央に出して」。掴んだのが手札効果を持つ自分の手札カードなら、中央にヒントを出す
    // （ドロップ／キャンセルで消える。maybeShowHandDropHint参照）。
    maybeShowHandDropHint(hit);

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

// ハンドフェイズで手札効果を持つ自分の手札カードを掴んだ時、「場にドロップすると手札効果が
// 発動します」と中央に案内する（ユーザー要望）。自動処理モードON・ハンドフェイズ中のみ
// （＝場にドロップで実際に手札効果が起動する状況のみ）。ドラッグの邪魔をしないよう
// pointer-events:none、ドロップ/キャンセル/一定時間で消す。
let handDropHintEl = null;
let handDropHintTimer = null;
function maybeShowHandDropHint(hit) {
  if (!hit || hit.kind !== "card") return;
  if (!isAutoProcessingEnabled() || !isHandPhaseActive()) return;
  const token = getState().tokens.find((t) => t.id === hit.tokenId);
  if (!token || token.location.zone !== "hand" || token.location.player !== getSelfSeat()) return;
  if (!hasHandEffectData(token.cardId)) return;
  showHandDropHint();
}
function showHandDropHint() {
  if (!handDropHintEl) {
    handDropHintEl = document.createElement("div");
    handDropHintEl.id = "hand-drop-hint";
    handDropHintEl.textContent = "そのカードを場にドロップすると、手札効果が発動します。";
    document.body.appendChild(handDropHintEl);
  }
  handDropHintEl.classList.add("show");
  clearTimeout(handDropHintTimer);
  handDropHintTimer = setTimeout(hideHandDropHint, 4000);
}
function hideHandDropHint() {
  clearTimeout(handDropHintTimer);
  if (handDropHintEl) handDropHintEl.classList.remove("show");
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

  function onUp(ev) {
    clearTimeout(timer);
    cleanupListeners();
    if (peeking) {
      clearHover();
      updatePreview(null);
    } else {
      // ユーザー報告「スマホで、ハンドフェイズにファーストカードがタップで使用できません」
      // （続き62）。ファーストカード/エターナルカードの「動かさずクリックで使う」判定は
      // onDragEnd側のisSameLocation分岐でしか行っていないが、タッチでは①TOUCH_HOLD_MSの
      // 長押しでpeeking、②TOUCH_HOLD_MOVE_CANCEL_PXを超える移動でドラッグ昇格、の
      // どちらも起きない「素早いタップ」だとstartTokenDrag自体が一度も呼ばれず、
      // onDragEndへ到達できていなかった（マウスは常に即座にstartTokenDragするため
      // この抜け穴が無く、タッチ特有のバグだった）。この場合はドラッグを開始してから
      // 同じ座標のまま即座に終了させ、マウスの「動かさずクリック」と全く同じ経路
      // （isSameLocation判定）を通す。
      if (hit.kind === "pile") startPileDrag(e, hit.pile);
      else startTokenDrag(e, hit.tokenId, hit.kind, hit.el);
      onDragEnd(ev);
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
    // 山札が空の時に直接ドラッグしようとした場合、このガードで即座に抜けてしまう。
    // 山札(deck)が対象の時だけ、ここでもensureDeckAvailable()を呼んで捨て場からの
    // 自動補充（ノーシャッフル）を走らせる（捨て場も空なら何もしない）。補充後にもう一度
    // ドラッグすれば引ける。
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
  hideHandDropHint();
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
    // ユーザー要望（続き76）「ロック処理の直後にも割り込みモーダルを出す」。宣言側は
    // 続き77でperformLockPhaseClick・ドラッグ&ドロップハンドラ・requestFinalLock
    // それぞれの実際に動かす直前に追加したため、ここは「処理」側の1回。
    fireAnytimeCheckpoint(player);
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

// ゴメンナサイの「相手が最後のロックを宣言した時に使える」手札効果（続き64）。
// card-effects.jsのpurple-sorryのコメント参照——本来のhandEffect（Hand Phaseの
// 自己申告）とは別種のトリガー（ロック承認フローへの割り込み）のため、通常の
// runHandEffectには乗せず、ここに直接実装する。seatが「ゴメンナサイを手札に
// 持っていて、かつ追色1（他の紫のカード1枚）を払えるか」を返す（払えなければnull）。
function findGomennasaiEligibility(seat) {
  const sorryToken = getState().tokens.find(
    (t) => t.kind === "card" && t.cardId === "purple-sorry" && t.location.zone === "hand" && t.location.player === seat
  );
  if (!sorryToken) return null;
  const costCandidates = findSameColorDiscardCandidates(sorryToken.id, "purple", seat);
  if (costCandidates.length === 0) return null;
  return { sorryToken, costCandidates };
}

// ユーザー確認済み方針「コストを払える人だけが却下（＝妨害）できる」への対応。
// 承認待ちの先頭がゴメンナサイを使えない座席の場合、ボタンを見せる意味が無いため
// 自動的に承認する（final-lock-approval.jsのcheckGomennasaiEligibility注入により
// バナー自体も出さない）。render()のたびに毎回チェックする既存パターンを踏襲。
// 多重発火防止のガード付き。
let gomennasaiAutoApprovalInFlight = false;
function checkGomennasaiAutoApproval() {
  const pending = getState().pendingFinalLock;
  if (!pending || pending.queue.length === 0 || gomennasaiAutoApprovalInFlight) return;
  const approver = pending.queue[0];
  if (isOnlineMode() && getSelfSeat() !== approver) return;
  if (findGomennasaiEligibility(approver)) return; // 使えるなら自動承認せず本人の選択を待つ
  gomennasaiAutoApprovalInFlight = true;
  Promise.resolve(respondToFinalLock(true)).finally(() => {
    gomennasaiAutoApprovalInFlight = false;
    // ハマりどころ: respondToFinalLock自体がrender()を呼ぶため、この承認処理の最中に
    // 次の承認者（queue[1]）に対するcheckGomennasaiAutoApproval()の再入が一度発生するが、
    // その時点ではまだgomennasaiAutoApprovalInFlightがtrueのままなのでガードで弾かれ、
    // 何もしないまま終わる。その後この.finally()でフラグを戻すだけで放置すると、次に
    // 誰かが何か操作するまで次の承認者が永遠にチェックされないまま止まってしまう
    // （承認待ち複数人が全員ゴメンナサイを使えない場合、2人目以降で承認が止まる
    // バグとして実機テストで発見）。フラグを戻した直後にもう一度自分自身を呼び、
    // 次の承認者（いれば）を続けてチェックする。
    checkGomennasaiAutoApproval();
  });
}

// 「🍬 ゴメンナサイを使う」ボタンから呼ばれる（続き64）。相手（攻撃側）が既に
// ロックしている1枚を選んで奪い、追色1（自分の手札から紫のカード1枚）を払ってから、
// 通常の承認と同じ扱いで進める（card-effects.jsのpurple-sorryコメント参照——相手の
// 新しいロック自体はその後成立するが、既存の1枚を失うため結局7色揃わない）。
// ファースト/エターナルカードは他のカードの効果の対象にならないため候補から除外する
// （docs/rulebook.md、card-effect-engine.jsのisTargetableByOtherCardEffectsと同じ判定）。
async function useGomennasaiOnFinalLock() {
  const pending = getState().pendingFinalLock;
  if (!pending) return;
  const selfSeat = getSelfSeat();
  const eligibility = findGomennasaiEligibility(selfSeat);
  if (!eligibility) return;
  const attackerSide = SEAT_TO_SIDE[pending.attacker];
  const attackerLockedTokens = getState().tokens.filter(
    (t) =>
      t.kind === "card" &&
      t.location.zone === "lock" &&
      t.location.side === attackerSide &&
      !t.cardId?.startsWith("eternal-") &&
      !t.cardId?.startsWith("first-")
  );
  if (attackerLockedTokens.length === 0) return; // 善処の原則: 奪える対象が無ければ何もしない
  const candidates = attackerLockedTokens.map((t) => t.location);
  const dest =
    candidates.length === 1 ? candidates[0] : await requestCellChoiceForEffect(candidates, "奪うロックカードを選択してください");
  if (!dest) return;
  const target = attackerLockedTokens.find((t) => t.location.side === dest.side && t.location.index === dest.index);
  if (!target) return;
  const costChosen =
    eligibility.costCandidates.length === 1
      ? eligibility.costCandidates[0]
      : await requestHandCardChoiceForEffect(
          selfSeat,
          "捨てる紫のカードを手札から選択してください",
          new Set(eligibility.costCandidates.map((t) => t.id))
        );
  if (!costChosen) return;
  await discardFromHandReveal(costChosen.id);
  if (isOnlineMode()) {
    try {
      await moveToken(target.id, { zone: "hand", player: selfSeat });
      markSelfHandled([target.id]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("moveToken (gomennasai steal) failed", err);
    }
  } else {
    moveToken(target.id, { zone: "hand", player: selfSeat });
  }
  announceHandPickups(selfSeat, [{ cardId: target.cardId, wasPublic: true }]);
  render();
  await respondToFinalLock(true);
}

// 「タイマーをオン、オフ」の承認バナーから呼ばれる（続き64）。最後のロック承認と違い、
// 実際にtimer_config.enabledを書き換える処理自体はso7-apply-action.ts側の
// RESPOND_TIMER_TOGGLEケースが（全員承認が完了した瞬間に）行うため、ここでは
// fetchAndHydrate()で結果を取り込むだけでよい（オンライン専用機能のため、
// timer-toggle.js側がisOnlineMode()でボタン自体を隠しており、ローカルモードの
// 分岐は不要）。
async function respondToTimerToggle(approve) {
  if (!getState().pendingTimerToggle) return;
  try {
    await respondTimerToggle(approve);
    await fetchAndHydrate(getCurrentGameId());
  } catch (err) {
    console.error("respondTimerToggle failed", err);
  }
  render();
}

async function requestTimerToggleFor(nextEnabled, queue) {
  try {
    await requestTimerToggle(getSelfSeat(), nextEnabled, queue);
    await fetchAndHydrate(getCurrentGameId());
  } catch (err) {
    console.error("requestTimerToggle failed", err);
  }
  render();
}

// 自動処理モードのオン/オフ承認バナー（続き66、ユーザー要望「1人だけ自動処理モード
// とかだと変な挙動になっちゃいそうなので全員が同じモードの方が良い」）。タイマー
// オン/オフと同じ承認キューだが、専用のボタンは持たず、options-menu.jsの既存
// チェックボックスがオンライン中だけ承認申請を送る形にする（buildAutoProcessing
// ToggleRow参照）。final-lock-approval-*と同じCSSクラスを流用する。
let autoProcessingToggleBannerEl = null;
function buildAutoProcessingToggleBanner() {
  autoProcessingToggleBannerEl = document.createElement("div");
  autoProcessingToggleBannerEl.id = "auto-processing-toggle-approval-banner";
  document.body.appendChild(autoProcessingToggleBannerEl);
}
function updateAutoProcessingToggleBanner() {
  const bannerEl = autoProcessingToggleBannerEl;
  if (!bannerEl) return;
  const pending = getState().pendingAutoProcessingToggle;
  if (!pending || pending.queue.length === 0) {
    bannerEl.classList.remove("is-visible");
    bannerEl.innerHTML = "";
    return;
  }
  bannerEl.classList.add("is-visible");
  const approver = pending.queue[0];
  const canRespond = !isOnlineMode() || getSelfSeat() === approver;
  bannerEl.innerHTML = "";

  const title = document.createElement("div");
  title.className = "final-lock-approval-title";
  title.textContent = `⚙️ ${getPlayerName(pending.requester)} さんが自動処理モードを${pending.nextEnabled ? "ON" : "OFF"}にすることを提案中！`;
  bannerEl.appendChild(title);

  const status = document.createElement("div");
  status.className = "final-lock-approval-status";
  status.textContent = canRespond
    ? `あなた（${getPlayerName(approver)}）の承認が必要です`
    : `${getPlayerName(approver)} さんの承認を待っています…`;
  bannerEl.appendChild(status);

  if (canRespond) {
    const buttons = document.createElement("div");
    buttons.className = "final-lock-approval-buttons";
    const approveBtn = document.createElement("button");
    approveBtn.className = "final-lock-approval-approve";
    approveBtn.type = "button";
    approveBtn.textContent = "✅ 承認する";
    approveBtn.addEventListener("click", () => respondToAutoProcessingToggle(true));
    const rejectBtn = document.createElement("button");
    rejectBtn.className = "final-lock-approval-reject";
    rejectBtn.type = "button";
    rejectBtn.textContent = "🚫 却下する";
    rejectBtn.addEventListener("click", () => respondToAutoProcessingToggle(false));
    buttons.appendChild(approveBtn);
    buttons.appendChild(rejectBtn);
    bannerEl.appendChild(buttons);
  }
}
// ユーザー要望通りoptions-menu.jsのチェックボックスから直接呼べるよう、main.jsの
// windowスコープにエクスポートするのではなく、state.js経由でoptions-menu.js自身が
// requestAutoProcessingToggleを直接呼ぶ設計にした（options-menu.buildAutoProcessing
// ToggleRow参照）。ここでは応答（承認/却下ボタン）と、全員承認が完了した瞬間の
// 反映だけを担当する。
async function respondToAutoProcessingToggle(approve) {
  const pendingBefore = getState().pendingAutoProcessingToggle;
  if (!pendingBefore) return;
  try {
    await respondAutoProcessingToggle(approve);
    await fetchAndHydrate(getCurrentGameId());
  } catch (err) {
    console.error("respondAutoProcessingToggle failed", err);
  }
  // 自分が最後の承認者だった場合（queueが1つだけ残っていて、かつ承認した場合）に反映する。
  // ハマりどころ（実機テストで発覚）: ローカルモードにはbroadcastChannelが存在しない
  // （online.jsのsubscribeToGame()経由でしか生成されない）ため、broadcastAutoProcessing
  // Resolvedだけに頼ると何も起きない（そもそもoptions-menu.js側がisOnlineMode()で
  // ローカルモードをこの承認フロー自体から外しているので通常は再現しないが、念のため
  // 自分自身には直接反映しておく）。オンライン中は他クライアントへ伝える必要があるため
  // 追加でbroadcastする（自分自身にも同じ値がもう一度届くが、setAutoProcessingEnabledは
  // 同じ値を2回呼んでも無害）。
  if (approve && pendingBefore.queue.length === 1 && !getState().pendingAutoProcessingToggle) {
    setAutoProcessingEnabled(pendingBefore.nextEnabled);
    if (isOnlineMode()) broadcastAutoProcessingResolved({ nextEnabled: pendingBefore.nextEnabled });
  }
  render();
}
onAutoProcessingResolvedEvents(({ nextEnabled }) => {
  setAutoProcessingEnabled(nextEnabled);
  render();
});

async function onDragEnd(e) {
  hideHandDropHint(); // 掴んだ時に出した「場にドロップで発動」ヒントを消す
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
  // 自動処理モードの操作制限（ユーザー要望）: 自分の手札カードのドラッグは「正規の使い方」だけ
  // 許可する——(1)自分の手札内での並べ替え、(2)ロックフェイズに正しい色スロットへロック、
  // (3)使用可能なタイミングでの手札効果の発動（場＝手札/ロック/山以外へドロップ）。それ以外
  // （山札/捨て場/エターナル/ファースト等の山へ置く、盤面マスへ自由配置、相手の手札へ入れる、
  // ロック不可タイミングでのロック、使えないタイミングでの効果発動狙いドロップ）は全て
  // スナップバックで弾く。findDraggableAtで既に「掴めるのは自分の手札カードだけ」に絞って
  // いるが、念のためownerも確認する。実際のロック確定・重複/色チェックや効果発動は下の既存
  // 処理が担い、ここは「不正なタイミング・行き先」を先に落とす役目。
  if (autoDragRestrictionActive() && kind === "card" && isOwnGrabbableCard(tokenId)) {
    const draggedToken = getState().tokens.find((t) => t.id === tokenId);
    const cardId = draggedToken?.cardId;
    const toOwnHand = dropTarget.zone === "hand" && dropTarget.player === getSelfSeat();
    const cardColor = cardId ? getCardDefinition(cardId)?.color : null;
    const toLock =
      dropTarget.zone === "lock" &&
      getCurrentPhase() === "lock" &&
      cardId !== "rainbow-shard" &&
      cardColor &&
      COLORS[dropTarget.index] === cardColor; // ロックフェイズに一致色スロットへだけ許可
    const isEternalOrFirst = cardId?.startsWith("eternal-") || cardId?.startsWith("first-");
    const usableAnytime = cardId ? isHandEffectUsableAnytime(cardId) : false;
    const effectTimingOK = isHandPhaseActive() || (usableAnytime && !isAnyEffectProcessingBusy());
    const toBoardForEffect =
      dropTarget.zone !== "hand" &&
      dropTarget.zone !== "lock" &&
      dropTarget.zone !== "pile" &&
      !isEternalOrFirst &&
      !!cardId &&
      hasHandEffectData(cardId) &&
      effectTimingOK; // 効果を今使えるカードを、場へドロップした時だけ許可
    if (!toOwnHand && !toLock && !toBoardForEffect) {
      render(); // 許可されない行き先はスナップバック（moveToken/sendTokenToPileへは進ませない）
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
    // ユーザー要望「①通常の手札カードは、ハンドフェイズかつ手札エリア外で放すと
    // 手札効果が発動するようにしたい」。実際にはどこへも置かず（moveTokenを呼ばない）
    // 元の手札位置へスナップバックさせつつ、その場で手札効果を解決する（「接触」ドラッグ
    // ＝隣の相手駒へドロップしても実際には移動させず専用フローへ切り替える、という
    // 既存パターンと同じ考え方）。エターナル/ファーストカードは②のクリック方式を
    // 使うためここでは対象外（is-usable-while-lockedの光る演出と同じ判定基準を流用）。
    // ユーザー要望「スリカエ（『いつでも使える』手札効果）はハンドフェイズ以外でも
    // ドラッグで発動できるようにしてほしい。ただし効果の処理中は不可、その間に
    // ドラッグしたら予約扱いにして、使えるタイミングになったら確認モーダルを出す」。
    // ユーザー報告により、この「処理中」はゲート侵攻処理だけでなく、他の効果の
    // 対象選択待ちや手札効果の解決中も含む（isAnyEffectProcessingBusy参照、
    // docs/rulebook.md「いつでも使える」の定義通り）。
    // ユーザー報告「自動処理モードでないときにスリカエがロックエリアや場に置けない」
    // の原因: この分岐全体が自動処理ON/OFFを問わず素通りしていたため、OFF中に
    // スリカエをドラッグすると（isUsableAnytimeがtrueのまま、canUseHandEffect等の
    // 判定はautoProcessingEnabledをチェックして常にfalseを返すため）何もせず
    // returnしてしまい、通常のドロップ（ロックエリア/盤面への配置）まで到達
    // できなくなっていた。自動処理OFF中はこの特別扱い自体が不要（手札効果の自動
    // 発動という概念自体が自動処理モードの機能のため）なので、isAutoProcessing
    // Enabled()もまとめてガードする。
    // ユーザー要望（続き70）「ハンドフェイズで手札公開エリアから盤面に放り投げたら
    // 手札から放り投げるのと同様に手札効果を発動させてください」。手札公開エリア
    // （ザ・ギャンブルの公開ドロー等、location.zone==="publicDraw"）のカードも、
    // 通常の手札(zone==="hand")と全く同じ「ハンドフェイズ外でドロップしたら手札効果を
    // 発動する」対象に含める。
    if (
      isAutoProcessingEnabled() &&
      kind === "card" &&
      (cardSourceLocation?.zone === "hand" || cardSourceLocation?.zone === "publicDraw") &&
      cardSourceLocation.player === getSelfSeat() &&
      dropTarget.zone !== "hand"
    ) {
      const draggedToken = getState().tokens.find((t) => t.id === tokenId);
      const isUsableAnytime = draggedToken && isHandEffectUsableAnytime(draggedToken.cardId);
      const effectProcessingBusy = isAnyEffectProcessingBusy();
      if (isUsableAnytime && effectProcessingBusy) {
        // ユーザー要望（続き76）「いつでも使える効果の予約制は廃止したい。代わりに
        // 宣言/処理の直後に毎回、割り込みモーダルを出す」。処理中にドラッグで
        // 割り込もうとしても、以前のような「予約」はもう行わない——正式な割り込み
        // 手段は各チェックポイントで出る割り込みモーダルの「使う」ボタンに一本化した
        // （triggerAnytimeInterruptCheckpoint参照）。ドラッグは元の位置へ戻すだけ。
        render();
        return;
      }
      if (draggedToken && (isHandPhaseActive() || (isUsableAnytime && !effectProcessingBusy))) {
        if (
          !draggedToken.cardId?.startsWith("eternal-") &&
          !draggedToken.cardId?.startsWith("first-") &&
          hasHandEffectData(draggedToken.cardId)
        ) {
          render();
          if (canUseHandEffect(draggedToken.cardId, draggedToken.id, cardSourceLocation.player)) {
            if (await confirmTouchAction(`${getCardDefinition(draggedToken.cardId).name}を使用しますか？`)) {
              runAutoHandEffect(draggedToken.cardId, draggedToken.id, cardSourceLocation.player);
            }
          } else if (!canPayHandEffectCost(draggedToken.cardId, draggedToken.id, cardSourceLocation.player)) {
            alert("捨てられる同じ色のカードが手札にありません。");
          }
          return;
        }
      }
    }
    // ユーザー要望「ロックするときも該当のロックエリア以外には置けないようにしてください」
    // （自動処理モード限定）。このアプリは元々「ルール適用は一切しない」自由配置方針
    // （findDropTarget付近のコメント参照）だが、自動処理モードはフェイズの流れ自体を
    // 積極的に案内・制御する方針のため、そちらに限りロックスロットの色不一致を弾く
    // （スナップバックのみ、通常のmoveTokenへは進ませない）。なないろの欠片は基本効果
    // 「ロックフェイズではロックできない」の通り常に対象外。無色（白/黒）カードは
    // 「置いても『ロックした』扱いにならない」ため、どのスロットに置いても実害が無く
    // 対象外のまま。
    if (kind === "card" && dropTarget.zone === "lock" && isAutoProcessingEnabled()) {
      const draggedToken = getState().tokens.find((t) => t.id === tokenId);
      const color = draggedToken ? getCardDefinition(draggedToken.cardId)?.color : null;
      const isRainbow = draggedToken?.cardId === "rainbow-shard";
      const isColorless = color === "white" || color === "black";
      if (isRainbow || (!isColorless && color && COLORS[dropTarget.index] !== color)) {
        render();
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
          // ユーザー要望（続き77）「移動もロックも宣言と処理を分けてください」。最後の
          // ロックは承認を待つ特別なフローのため、実際に承認済みでロックが確定する
          // タイミング（respondToFinalLock→maybeAnnounceLock、既存の処理側）とは別に、
          // ここ（承認依頼を出す＝宣言した瞬間）でも発火させる。
          fireAnytimeCheckpoint(getSelfSeat());
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
      if (kind === "card") {
        const clickedToken = getState().tokens.find((t) => t.id === tokenId);
        const clickPlayer =
          cardSourceLocation.zone === "hand"
            ? cardSourceLocation.player
            : cardSourceLocation.zone === "lock"
              ? SIDE_TO_SEAT[cardSourceLocation.side]
              : null;
        const isEternalOrFirst =
          clickedToken?.cardId?.startsWith("eternal-") || clickedToken?.cardId?.startsWith("first-");
        // ユーザー要望「1色のロックエリアに2枚（ファースト＋エターナル等）ある場合、その
        // スロットをクリックしたら2枚が出てどちらをハンドフェイズで使うか選べるように。
        // 現状は一番上のカードしか使えない」。同じ色スロットに手札効果を使える候補（エター
        // ナル/ファースト）が2枚以上重なっているなら、まずどれを使うかピッカーで選ばせる。
        let useToken = clickedToken;
        if (isHandPhaseActive() && clickPlayer === getSelfSeat() && cardSourceLocation.zone === "lock") {
          const stacked = getState().tokens.filter(
            (t) =>
              t.kind === "card" &&
              t.location.zone === "lock" &&
              t.location.side === cardSourceLocation.side &&
              t.location.index === cardSourceLocation.index
          );
          const usableStacked = stacked.filter(
            (t) => (t.cardId.startsWith("eternal-") || t.cardId.startsWith("first-")) && hasHandEffectData(t.cardId)
          );
          if (usableStacked.length >= 2) {
            const chosen = await pickStackedLockCard(stacked, "ハンドフェイズで使うカードを選んでください");
            if (!chosen) {
              render();
              return;
            }
            useToken = chosen;
          }
        }
        const useIsEternalOrFirst = useToken?.cardId?.startsWith("eternal-") || useToken?.cardId?.startsWith("first-");
        // (A) エターナル/ファースト（従来）: ハンドフェイズでそのカードをクリックすると、
        // 追色コストを手札から選ぶ流れに移行する（手札・ロックエリアのどちらにある間でも）。
        if (
          isHandPhaseActive() &&
          useToken &&
          clickPlayer === getSelfSeat() &&
          useIsEternalOrFirst &&
          hasHandEffectData(useToken.cardId)
        ) {
          render();
          if (canUseHandEffect(useToken.cardId, useToken.id, clickPlayer)) {
            if (await confirmTouchAction(`${getCardDefinition(useToken.cardId).name}を使用しますか？`)) {
              runAutoHandEffect(useToken.cardId, useToken.id, clickPlayer);
            }
          } else if (!canPayHandEffectCost(useToken.cardId, useToken.id, clickPlayer)) {
            alert("捨てられる同じ色のカードが手札にありません。");
          }
          return;
        }
        // (B) 通常の手札カード（ユーザー要望「自動処理モードで、手札を掴んで場にドロップする
        // ほかに、手札をそのままクリックでも使用できるようにしたい」）。ドラッグで場に出して
        // 発動する既存経路(上のdropTarget.zone!=="hand"分岐)と全く同じ判定・確認・コスト
        // 処理を、クリック（同位置離し）でも呼べるようにする。対象は自分の手札にある
        // エターナル/ファースト以外の、手札効果を持つカード。
        if (
          isAutoProcessingEnabled() &&
          clickedToken &&
          clickPlayer === getSelfSeat() &&
          cardSourceLocation.zone === "hand" &&
          !isEternalOrFirst &&
          hasHandEffectData(clickedToken.cardId)
        ) {
          const isUsableAnytime = isHandEffectUsableAnytime(clickedToken.cardId);
          const effectProcessingBusy = isAnyEffectProcessingBusy();
          if (isUsableAnytime && effectProcessingBusy) {
            render();
            return;
          }
          if (isHandPhaseActive() || (isUsableAnytime && !effectProcessingBusy)) {
            render();
            if (canUseHandEffect(clickedToken.cardId, clickedToken.id, clickPlayer)) {
              if (await confirmTouchAction(`${getCardDefinition(clickedToken.cardId).name}を使用しますか？`)) {
                runAutoHandEffect(clickedToken.cardId, clickedToken.id, clickPlayer);
              }
            } else if (!canPayHandEffectCost(clickedToken.cardId, clickedToken.id, clickPlayer)) {
              alert("捨てられる同じ色のカードが手札にありません。");
            }
            return;
          }
        }
      }
      render();
      return;
    }
    // ユーザー要望「自動処理モードではロックエリアのカードは掴めないようにして
    // ください」（続き65）。厳密には「掴めない」のではなく「ロックエリアから動かせ
    // ない」——エターナル/ファーストカードをロックエリアに置いたまま使う
    // （isSameLocationのクリック経路）は上のブロックで既に処理済みのため、ここに
    // 到達する時点で実際に別の場所へ動かそうとしている。自動処理中に既に
    // ロックされたカードを誤ってドラッグで動かしてしまうと盤面が壊れやすいため、
    // その場合はスナップバックする。
    if (kind === "card" && cardSourceLocation?.zone === "lock" && isAutoProcessingEnabled()) {
      render();
      return;
    }
    const token = getState().tokens.find((t) => t.id === tokenId);
    const wasAlreadyLocked = !!token && token.location.zone === "lock";
    if (kind === "card" && dropTarget.zone === "lock") {
      if (!(await confirmTouchAction(`${getCardDefinition(token?.cardId)?.name ?? "このカード"}をロックしますか？`))) {
        render();
        return;
      }
    }
    // ユーザー要望（続き77）「移動もロックも宣言と処理を分けてください」。実際に状態を
    // 動かす直前を「宣言」の瞬間とみなして発火する（処理側は下、既存の通り）。
    if (kind === "card" && dropTarget.zone === "lock") {
      fireAnytimeCheckpoint(getSelfSeat());
    } else if (kind === "piece") {
      fireAnytimeCheckpoint(token?.player ?? getSelfSeat());
    }
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
    // ドラッグでの駒移動も、タップ移動（markPhaseMoveActionTaken、上の移動ハイライトの
    // クリック経路）と同じく移動フェイズの「1手（移動 or 接触は1回だけ）」を消費させる。
    // これが無いと、ドラッグで移動した後も移動フェイズが有効なまま残り（ハイライトも残り）、
    // もう1マス動けて到達が連鎖してしまう——ユーザー報告「相手ゲートに移動→選べる罠に到達→
    // 効果処理後、また移動させられた」の原因。手番プレイヤー自身の駒を移動フェイズ中に
    // ドラッグで動かした時だけ消費する（他座席の駒・移動フェイズ外は対象外）。
    if (kind === "piece" && token && token.player === getState().turnPlayer && isMovePhaseActive()) {
      markPhaseMoveActionTaken();
    }
    render();
    // 到達プロンプト/モーダル・ロック演出の位置決めに実際のDOM座標(getBoundingClientRect)を
    // 使うため、どちらもrender()で盤面を描き直した後でなければ呼べない。
    if (token) maybeAnnounceLock(dropTarget, token.cardId, wasAlreadyLocked);
    if (kind === "piece") {
      // ユーザー要望（続き76）「移動処理の直後にも割り込みモーダルを出す」。移動先の
      // 到達効果がまだ処理中の間はisAnyEffectProcessingBusy()がtrueになり
      // チェックポイントが無条件にブロックされてしまうため、onFullyResolvedで
      // 到達効果まで含めて完全に終わった後まで待ってから発火させる（onResolvedの
      // 時点ではまだ自動処理が終わっていないことがあるため不十分）。
      maybeTriggerCardArrival(dropTarget, tokenId, undefined, () => {
        if (token) fireAnytimeCheckpoint(token.player);
      });
    }
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

// ユーザー要望「ムーブフェイズが終わったら少し間をおいて自動でターン終了をしてください。
// ただしムーブフェイズでの移動による到達効果の処理終了が必ずしもムーブフェイズの終了では
// ない（到達コンボやスリカエの割り込み等がある）ので、そういったものが一切なく何も
// 起こらないことを確認してからターン終了してください」への対応。下のupdateEndTurnButton()
// が既に算出している`shouldEmphasize`（自動処理ON・優先権あり・移動フェイズで移動/接触
// 済み・到達効果の自動処理も完了、の全てを満たす＝「これ以上何も起きない」ことを保証する
// 既存の判定、ボタンを光らせる演出に使っていたもの）をそのまま流用する。新しい状態管理を
// 増やさず、「光っている＝安全」を「光り続けたら自動でクリックする」に拡張するだけにする。
// 一定時間（他の自動遷移と合わせてPHASE_SKIP_ADVANCE_DELAY_MSと同じ1500ms）継続して
// 初めて発火し、その間にshouldEmphasizeがfalseに戻ったら（コンボが連鎖した等）待ち直す。
const AUTO_END_TURN_DELAY_MS = 1500;
let autoEndTurnTimer = null;
function reconcileAutoEndTurn(shouldEmphasize) {
  if (shouldEmphasize) {
    if (autoEndTurnTimer) return;
    autoEndTurnTimer = setTimeout(() => {
      autoEndTurnTimer = null;
      // ユーザー報告「収穫と種まきの到達効果処理が始まったばかりなのにターンが
      // 自動で終了してしまう」「接触を申し込んでいる最中にターンが終了してしまう」
      // の原因: armされた時点のshouldEmphasizeを信じてそのままクリックしていたが、
      // render()はstate.js側のdispatch（moveToken等）が起きた時にしか呼ばれない
      // ため、「移動した直後・到達効果の自動処理がまだ始まる前（arrivalEffect
      // AutoProcessingがまだfalseの一瞬）」にたまたまrender()が走ってarmされて
      // しまうと、その後カード効果の候補選択待ち（DOM操作のみでrender()を呼ばない）
      // のような「stateの変化を伴わない待ち」が続く間はshouldEmphasizeが再評価
      // されず、armされた時の古い「安全」判定のまま1.5秒後に発火していた。発火
      // 時点で必ずcomputeShouldEmphasize()を呼び直し、その時点のライブな状態
      // （arrivalEffectAutoProcessing・pendingContact等、render()を経由しない
      // プレーンなJS変数も含む）で再確認してからでないとクリックしない。
      if (computeShouldEmphasize()) endTurnButtonEl?.click();
    }, AUTO_END_TURN_DELAY_MS);
  } else if (autoEndTurnTimer) {
    clearTimeout(autoEndTurnTimer);
    autoEndTurnTimer = null;
  }
}

// 奇跡の森 マンズウッド専用（PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END）:「ターン終了時、
// それらを捨てる」の実現方法。公開ドロー（publicDrawゾーン）自体は、ターン終了時に
// 自動で手札へ合流する（mergePublicDrawIntoHand、state.js/so7-apply-action.ts両方に
// 実装済み、SHUFFLE_HAND/NEXT_TURN共通）設計のため、この効果専用に「合流ではなく
// 捨てる」動作を新しくリデューサー側（ローカル・サーバー両方）に追加するのは避け、
// 代わりにターン終了ボタンが実際にnextTurn()を呼ぶ直前（＝合流処理が走るより前）に、
// 対象トークンを先に捨ててしまうことで実現する（先に捨ててしまえば、後続の合流処理
// には何も残っていない）。プレイヤーごとに「このターン終了時に捨てるべきトークンid」を
// 覚えておくだけの、ゲーム状態には一切書き込まないメモリ上のMap（新しいサーバー
// アクション・DBスキーマ変更が不要なため、この効果だけのためにEdge Functionへ手を
// 入れずに済む）。
const pendingTurnEndDiscards = new Map(); // player -> Set<tokenId>
function markDiscardAtTurnEnd(player, tokenIds) {
  if (!tokenIds?.length) return;
  const set = pendingTurnEndDiscards.get(player) ?? new Set();
  for (const id of tokenIds) set.add(id);
  pendingTurnEndDiscards.set(player, set);
}
async function flushPendingTurnEndDiscards(player) {
  const set = pendingTurnEndDiscards.get(player);
  if (!set || set.size === 0) return;
  pendingTurnEndDiscards.delete(player);
  for (const tokenId of set) {
    // 既に何らかの理由で盤面/publicDrawゾーンから無くなっている可能性もゼロではない
    // ため（善処の原則）、現存するトークンだけ捨てる。
    if (getState().tokens.some((t) => t.id === tokenId)) {
      await discardFromHandReveal(tokenId);
    }
  }
}

// ユーザー要望「自動処理モードでないときに、ゲート侵攻成功条件を満たした状態で
// ターン終了ボタンを押したら『ゲート侵攻処理を自動で行いますか？』的な確認モーダルを
// 画面中央に出してほしい」。#contact-confirm-modal（接触の申込確認）と同じ画面中央・
// キャンセル/OK2択のスタイルを流用する（backdrop/✕クリックは「いいえ」扱い——こちらは
// 単に「自分で処理する」という有効な選択肢のため、キャンセル不可にする必要はない）。
function showGateInvasionAutoProcessConfirmModal(onYes, onNo) {
  const modal = document.createElement("div");
  modal.id = "contact-confirm-modal";
  let settled = false;
  const close = (result) => {
    if (settled) return;
    settled = true;
    backdrop.remove();
    modal.remove();
    if (result) onYes();
    else onNo();
  };
  const backdrop = createBackdrop(() => close(false), { dim: true, zIndex: 10600 });

  const title = document.createElement("div");
  title.className = "contact-confirm-title";
  title.textContent = "ゲート侵攻ボーナス";

  const body = document.createElement("div");
  body.className = "contact-confirm-body";
  body.textContent = "相手ゲート侵攻ボーナスの発生条件を満たしています。自動で処理しますか？";

  const btnRow = document.createElement("div");
  btnRow.className = "contact-confirm-buttons";

  const noBtn = document.createElement("button");
  noBtn.className = "contact-confirm-cancel";
  noBtn.type = "button";
  noBtn.textContent = "いいえ（自分で処理する）";
  noBtn.addEventListener("click", () => close(false));

  const yesBtn = document.createElement("button");
  yesBtn.className = "contact-confirm-ok";
  yesBtn.type = "button";
  yesBtn.textContent = "自動で処理する";
  yesBtn.addEventListener("click", () => close(true));

  btnRow.appendChild(noBtn);
  btnRow.appendChild(yesBtn);
  modal.appendChild(title);
  modal.appendChild(body);
  modal.appendChild(btnRow);
  modal.appendChild(createModalCloseX(() => close(false)));
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

// ユーザー報告（続き95）「接触/ムーブフェイズの救済フォールバック後、優先権が相手から
// 自分に戻らない」の調査で判明した根本原因（phase-automation.jsのperformMoveFallback
// AndEndTurn内の同種コメント参照）: nextTurn()はturnPlayerを進めるだけでpriorityPlayerには
// 触れず、本来の同期役（turn-timer.jsのhandleTurnTransition）は「次のturnPlayer本人の
// クライアントだけが送信する」設計のため、その本人のブラウザが一時的に反応できない間は
// priorityPlayerが古いプレイヤーのまま取り残されてしまう。手動のターン終了ボタンでも
// 同じ経路（nextTurn()を呼ぶだけ）を使っているため、同じ窓が起き得る。ここでも次の
// turnPlayerを自前に計算し、このボタンを押した（＝確実に動いている）クライアント自身
// から直接transferPriorityToを呼んでおくことで、その窓を埋める。
function transferPriorityToNextTurnPlayer(currentTurnPlayer) {
  const activePlayers = getState().activePlayers;
  const order = SEAT_ORDER.filter((p) => activePlayers.includes(p));
  const idx = order.indexOf(currentTurnPlayer);
  const next = idx === -1 ? null : order[(idx + 1) % order.length];
  if (next) transferPriorityTo(next);
}

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
    onAction: async () => {
      // オンライン中、自分の手番でない間・優先権を持っていない間はupdateEndTurnButton()側で
      // disabled=trueにしているはずだが、念のためここでも二重にガードする（他人のターンを
      // 勝手に終了させられてしまうバグの再発防止）。
      let turnPlayerBeforeEnd;
      {
        const s = getState();
        if (isOnlineMode() && getSelfSeat() !== s.turnPlayer) return;
        if (isOnlineMode() && s.priorityPlayer && getSelfSeat() !== s.priorityPlayer) return;
        turnPlayerBeforeEnd = s.turnPlayer;
      }
      // 奇跡の森 マンズウッド専用: このターン中に「ターン終了時に捨てる」と予約された
      // トークンがあれば、実際にnextTurn()を呼ぶ前（＝publicDrawの手札合流処理が走る
      // より前）に先に捨てておく（markDiscardAtTurnEnd参照）。
      await flushPendingTurnEndDiscards(turnPlayerBeforeEnd);
      // ゲート侵攻ボーナス(GATE_INVASION_*)は、so7-apply-action.ts側でNEXT_TURN処理に
      // 統合済み（サーバー側で自動判定・自動適用される）。オンライン中にrunGateInvasionsIfNeeded()
      // を呼ぶとローカルだけに二重適用されサーバーの状態と食い違ってしまうため、
      // オンライン中はnextTurn()だけを直接呼ぶ。
      if (isOnlineMode()) {
        transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
        nextTurn();
        return;
      }
      // 侵攻条件を満たしている参加プレイヤーが誰もいなければrunGateInvasionsIfNeededは
      // 即座にdone()を呼ぶだけなので、普段のターン終了と体感は変わらない。満たしていれば
      // （手番プレイヤー本人とは限らない。効果等で自分のターンでなくても相手ゲートに
      // 駒がいることはあり得るため、手番プレイヤーに限らず全参加プレイヤーを対象にする）
      // ボーナス処理の3つのポップアップが終わってから初めてnextTurn()が呼ばれる。
      // ユーザー要望「自動処理モードでないときに、ゲート侵攻成功条件を満たした状態で
      // ターン終了ボタンを押したら『自動で行いますか？』的な確認モーダルを出してほしい」。
      // 自動処理モードOFF＝プレイヤーが自分でルールを適用する方針のため、条件を満たして
      // いる場合だけ先に確認を挟む（満たしていなければ従来通り即座にnextTurn()）。
      if (!isAutoProcessingEnabled() && hasAnyGateInvasionCandidate()) {
        showGateInvasionAutoProcessConfirmModal(
          () => {
            runGateInvasionsIfNeeded(() => {
              transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
              nextTurn();
              render();
            });
          },
          () => {
            transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
            nextTurn();
            render();
          }
        );
        return;
      }
      runGateInvasionsIfNeeded(() => {
        transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
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
  const state = getState();
  const turnPlayer = state.turnPlayer;
  if (!turnPlayer) {
    endTurnButtonEl.style.display = "none";
    return;
  }
  // ユーザー要望（続き74）「自動処理モード時はターン終了を非表示にしてください」。
  // 見た目を隠すだけで、この関数の残り（disabled判定・自動クリックのreconcile
  // AutoEndTurn）はそのまま動かし続ける——非表示中もJSからの.click()は機能するため、
  // 自動処理モードの自動ターン終了（下のreconcileAutoEndTurn参照）はこれまで通り
  // 働く。緊急時の手動操作はoptions-menu.jsの「緊急ターン終了」ボタンに譲る。
  endTurnButtonEl.style.display = isAutoProcessingEnabled() ? "none" : "flex";
  // オンライン中は「今誰のターンか」を明示し、自分の手番でない間は押せないようにする
  // （以前は誰でも他人のターンを終了させられてしまっていた）。ローカルモードは
  // 1人で全座席を操作する前提のため、従来通り常に有効・宛先の座席名を表示する。
  // 動的な文言はキャプション（常に「ターン終了」固定）ではなく、ホバー時のツールチップへ
  // 表示するようにした（キャプションは他の右下ボタンと揃えて短く固定したいため）。
  // ユーザー要望「優先権が無い間はターン終了ボタンを押せないことにします」。接触の
  // 強制ゲート移動で一時的にdefenderへ優先権を渡している最中（transferPriorityTo参照）に
  // turnPlayer本人がターンを終了してしまうと、defender側の到達効果解決を置き去りに
  // してしまうため。priorityPlayerがまだ一度も初期化されていない（＝ターンタイマー機能
  // 自体が無効、admin.jsのデフォルトOFF）場合はstate.priorityPlayerがnullのままなので、
  // その場合は従来通りturnPlayer判定だけで制限しない。
  if (isOnlineMode() && getSelfSeat() !== turnPlayer) {
    if (endTurnTooltipEl) endTurnTooltipEl.textContent = `今は${getPlayerName(turnPlayer)}のターン中です`;
    endTurnButtonEl.disabled = true;
  } else if (isOnlineMode() && state.priorityPlayer && getSelfSeat() !== state.priorityPlayer) {
    if (endTurnTooltipEl) endTurnTooltipEl.textContent = `今は${getPlayerName(state.priorityPlayer)}が優先権を持っています`;
    endTurnButtonEl.disabled = true;
  } else {
    if (endTurnTooltipEl) {
      endTurnTooltipEl.textContent = isOnlineMode() ? "自分のターンを終了します" : `${getPlayerName(turnPlayer)}のターンを終了します`;
    }
    endTurnButtonEl.disabled = false;
  }
  const shouldEmphasize = computeShouldEmphasize();
  endTurnButtonEl.classList.toggle("is-emphasized", shouldEmphasize);
  reconcileAutoEndTurn(shouldEmphasize);
}

// ユーザー要望「到達効果の処理が終わったら原則ターンを終了します。なのでターン
// 終了アイコンを強調してターン終了を促そう」。ムーブフェイズで既に移動/接触
// した（isMovePhaseActive()がfalseになった）が、フェイズ自体はまだ"move"の
// まま＝到達効果の自動処理がまだ走っているかもしれない間はarrivalEffect
// AutoProcessingで待ち、それも終わったところで強調表示にする。ユーザー報告
// 「接触を申し込んでいる最中にターンが終了してしまう」への対応でstate.
// pendingContactも見る——接触は承認待ちの間、乗り込んだ側の到達効果処理が
// まだ始まってすらいない（arrivalEffectAutoProcessingがfalseのまま）ため、
// これが無いと承認待ち中に安全と誤判定してしまう。updateEndTurnButton()（render()
// 経由）だけでなく、reconcileAutoEndTurn()のタイマー発火時点でも同じ関数を呼び直して
// 「armした時点の古い判定」に頼らないようにする（endTurnButtonEl.disabledのような
// render()でしか更新されないDOM属性ではなく、getState()等のライブな値だけを見る）。
function isEndTurnDisabledNow(state) {
  if (!state.turnPlayer) return true;
  if (isOnlineMode() && getSelfSeat() !== state.turnPlayer) return true;
  if (isOnlineMode() && state.priorityPlayer && getSelfSeat() !== state.priorityPlayer) return true;
  return false;
}
// 続き75診断ログ用: computeShouldEmphasize()の結果（true/falseの二値）が前回の
// render()から変わった時だけ、内訳を1件記録する（render()のたびに毎回記録すると
// アクションログ300件の上限をあっという間に埋めてしまうため、変化点だけに絞る）。
let lastShouldEmphasizeLogged = null;
function computeShouldEmphasize() {
  // ユーザー報告（続き86）「勝利後、まだ盤面のタイマーが止まらず自動処理が継続
  // されてしまっている」。誰かが既に勝利していれば自動ターン終了も不要。
  if (hasAnyoneWon()) return false;
  const state = getState();
  const autoProcessingEnabled = isAutoProcessingEnabled();
  const endTurnDisabled = isEndTurnDisabledNow(state);
  const isMovePhase = getCurrentPhase() === "move";
  const moveStillActive = isMovePhaseActive();
  const gateInvasionPending = isGateInvasionPending();
  const gateInvasionQueueActive = isGateInvasionQueueActive();
  const handEffectBusyNow = isHandEffectBusy();
  const pickerActive = activeEffectPicker !== null;
  // ユーザー報告（続き83）「『いつでも使える』の使うか確認モーダルが出ている最中に
  // ターンが切り替わってしまった」。isAnyEffectProcessingBusy()には既に追加済みだが、
  // computeShouldEmphasize()自体は同じ判定を（診断ログの内訳表示のため）自前で
  // 再計算しているため、ここにも同じ理由で追加する必要がある。
  const anytimeInterruptModalShowing = anytimeInterruptModalEl !== null;
  const result =
    autoProcessingEnabled &&
    !endTurnDisabled &&
    isMovePhase &&
    !moveStillActive &&
    !isArrivalEffectProcessing() &&
    !state.pendingContact &&
    // ユーザー要望「ほかのカードでも同様な事象が見受けられる、総チェック可能か」への
    // 対応。isAnyEffectProcessingBusy()は「ゲート侵攻処理中・その通知ポップアップ
    // 表示中・手札効果解決中・何らかの候補選択待ち」を1つにまとめた既存の判定
    // （手品師の技の『いつでも使える』が処理中に発動できてしまうバグの修正で
    // 新設済み、上のコメント参照）。到達効果の処理中（arrivalEffectAutoProcessing）
    // 以外にも、ムーブフェイズ中に「いつでも使える」手札効果（スリカエ等）を使った
    // 場合や、ゲート侵攻ボーナスの通知ポップアップが続いている場合など、同じ
    // 「まだ何か処理中なのに安全と誤判定してターンを終了してしまう」構造の抜け漏れが
    // 他にもあり得るため、既存のこの判定にもそのまま乗せることで網羅的にする。
    !(gateInvasionPending || gateInvasionQueueActive || handEffectBusyNow || pickerActive || anytimeInterruptModalShowing);
  if (result !== lastShouldEmphasizeLogged) {
    lastShouldEmphasizeLogged = result;
    logAction("diag-should-emphasize", {
      result,
      autoProcessingEnabled,
      endTurnDisabled,
      isMovePhase,
      moveStillActive,
      arrivalEffectAutoProcessing: isArrivalEffectProcessing(),
      pendingContact: !!state.pendingContact,
      gateInvasionPending,
      gateInvasionQueueActive,
      handEffectBusyNow,
      pickerActive,
      anytimeInterruptModalShowing,
      turnPlayer: state.turnPlayer,
      priorityPlayer: state.priorityPlayer,
      selfSeat: getSelfSeat(),
    });
  }
  return result;
}

// 山札が空の状態で引こうとした時のルール（docs/rulebook.md「こんな時は」）:
// 「捨て場のカードをそのまま裏向きにして山札とする。シャッフルはしない。」
// 山札に残りがあれば何もせずすぐにonReady()を呼ぶ。空でも捨て場が空ならこれ以上引ける
// カードが無いので、確認モーダルを出さずそのままonReady()を呼ぶ（drawFromPile側が
// 空振りするだけで安全なため）。
function ensureDeckAvailable(onReady) {
  const state = getState();
  // 山札に残りがある／捨て場も空でこれ以上補充できない場合は、そのまま引きに行く。
  if (state.piles.deck.length > 0 || state.piles.discard.length === 0) {
    onReady();
    return;
  }
  // オンライン中はサーバー側のDRAW_FROM_PILE（so7-apply-action.ts）が引く直前に捨て場から
  // 自動補充するため、ここでは何もせずそのまま引きに行く（山の中身はサーバーにしか無く
  // 先読みもできないので、クライアント側での事前補充は不要）。
  if (isOnlineMode()) {
    onReady();
    return;
  }
  // ローカル: ユーザー要望「山札がなくなったら、自動でノーシャッフルで捨て場のカードを
  // 山札にします」。以前は確認モーダルを出していたが、確認を挟まず自動で補充する。
  // 引く処理（onReady内）が山札の一番上を先読みしてから引くため、先にここで補充しておく。
  // 実際の並べ替え（ノーシャッフル＝捨て場をひっくり返す）はREFILL_DECK_FROM_DISCARD側。
  refillDeckFromDiscard();
  render();
  onReady();
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

// ユーザー要望（続き74）「自動処理モード時は手札シャッフル/1枚ドロー/公開ドロー/
// ターン終了を非表示にしてください」。これらはいずれも自動処理モードがフェイズ進行
// ごと自動で代替する操作のため、手動版のボタンは不要かつ紛らわしい。緊急時の
// エスケープハッチとして、ターン終了だけはoptions-menu.js側に「緊急ターン終了」を
// 別途新設する（この関数はあくまで通常のターン終了ボタン自体を隠すだけ）。
function updateHandShuffleButton() {
  if (!handShuffleButtonEl) return;
  handShuffleButtonEl.style.display = isAutoProcessingEnabled() ? "none" : "flex";
  if (isAutoProcessingEnabled()) return;
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
  getOptionArea().appendChild(el);
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
          const newTokenIds = findNewHandTokenIds(player, handBefore);
          markSelfHandled(newTokenIds);
          // ユーザー要望「ドローで得たカードは手札の中で数秒ハイライトしてください
          // （ほかのドローの時も共通）」。
          glowHandTokensBriefly(newTokenIds);
          return;
        }
        const pileArray = getState().piles.deck;
        if (pileArray.length === 0) return; // 捨て場も空で、これ以上引けるカードが無い
        const cardId = pileArray[pileArray.length - 1];
        const handBeforeLocal = new Set(
          getState()
            .tokens.filter((t) => t.location.zone === "hand" && t.location.player === player)
            .map((t) => t.id)
        );
        drawFromPile("deck", { zone: "hand", player });
        playSound("cardDraw");
        announceHandPickups(player, [{ cardId, wasPublic: false }]);
        render();
        glowHandTokensBriefly(findNewHandTokenIds(player, handBeforeLocal));
      });
    },
  });
  document.body.appendChild(btn);
  return btn;
}

function updateDrawButton() {
  if (!drawButtonEl) return;
  drawButtonEl.style.display = getState().turnPlayer && !isAutoProcessingEnabled() ? "flex" : "none";
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
  publicDrawButtonEl.style.display = getState().turnPlayer && !isAutoProcessingEnabled() ? "flex" : "none";
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
let selfStatusPetThumbEl = null;
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
  // ユーザー要望（続き78）「左下の巨大アバターを押すとマイページではなくエモートを
  // 選べるようにしたい」。マイページへの入口は続き77でオプションエリアのアイコンだけで
  // 足りるようになった（ユーザー確認済み）ため、ここはエモート専用に転用する
  // （emote.js参照）。
  selfStatusLargeAvatarEl.addEventListener("click", () => openEmotePicker(selfStatusLargeAvatarEl));
  addSimpleTooltip(selfStatusLargeAvatarEl, "クリックしてエモートを選ぶ");

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

  // ペット変更アイコン（ユーザー要望「背景変更アイコンの隣にペット変更アイコンを追加」）。
  // 駒に追従する飾りペットの絵文字を選ぶ。現在の選択を絵文字で表示する（updateSelfStatusで更新）。
  selfStatusPetThumbEl = document.createElement("button");
  selfStatusPetThumbEl.className = "self-status-playmat-thumb self-status-pet-thumb";
  selfStatusPetThumbEl.addEventListener("click", openPetPicker);
  addSimpleTooltip(selfStatusPetThumbEl, "クリックしてペットを変更");

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
  iconGrid.appendChild(selfStatusPetThumbEl); // カード裏面の右隣（ユーザー要望）
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
  addSimpleTooltip(selfStatusLargeAvatarEl, "クリックしてエモートを選ぶ");

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
  if (selfStatusPetThumbEl) selfStatusPetThumbEl.textContent = PET_OPTIONS[getSelectedPetIndex()]?.emoji ?? "🐥";

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
// initAdminMode()は管理者パネルのDOM（各TOGGLE_SECTIONSのbuildContent含む）をここで
// 一度だけ構築するため、「🔐 管理者専用」セクションが参照するadminAuthHelpersは
// この呼び出しより前に登録し終えている必要がある（後で登録すると、パネルが既に
// 「読み込み中...」の内容のまま固まってしまう）。
registerAdminAuthHelpers({ isAdminUser, adminGrantCurrency, getAdminStats });
initAdminMode();
initDeckViewer();
initStatsPlayerLinkModal();
initMyPage();
initCardDevMode();
initActionLogPanel();
registerCardDevModeArrivalHelpers({ triggerCardArrival, runAutoHandEffect, render });
registerPhaseAutomationHelpers({ render, findTopCardAt });
initHelpButton();
initRankingIcon();
initUpdateChecker(); // デプロイ検知＆更新案内バナー（version.jsonを定期チェック）
initPiecePets(); // 駒に遅れて追従する飾りのペット（見た目だけ・ゲームには無関係）
// ユーザー要望「更新バナーは対局中は出さない、対局が終われば出す」。対局が進行中
// （参加者が居て・手番があり・まだ誰も勝っていない）またはチュートリアル中は保留し、
// それ以外（ホーム画面・対局終了後）でだけ出す。判定が変わるたびrender()末尾で再評価する。
function isInGameForBanner() {
  const st = getState();
  const inMatch = (st.activePlayers?.length ?? 0) > 0 && !!st.turnPlayer && !hasAnyoneWon();
  return inMatch || isTutorialBattleActive();
}
setUpdateBannerGate(() => !isInGameForBanner());
initDiscordLink();
initBoardViewToggle(); // Discordアイコンと残金表示の間に2D/3D切り替えアイコンを置く（順序＝追加順）
initCurrencyDisplay();
initShop();
registerShopOpener(openShopPanel);
registerAvatarPickerHelper(openAvatarPicker);
registerProfilePageOpener(() => openProfilePage());
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
registerTutorialBattleUiHelpers({ stageClientToLocal, stageDelta, stageWidth: STAGE_WIDTH, stageHeight: STAGE_HEIGHT });
registerPiecePetHelpers({ stageClientToLocal, stageDelta }); // 飾りペットの座標をステージ座標へ
registerTutorialBattleHelpers({ triggerLockEffect, playScriptedContact, flyBoardCardToHand, flyDrawnCardToHand });
initTutorialAutoStart();
initGameBgmAutoStart();
initTurnTimer();
initMatchStatsTracker();
initPseudoCpuPrompt();
initIconRearrange();
initSelfStatusRearrange();
initInteractionModeToggle();
initDeviceDetect();
registerRenderHelpers({ render, triggerLockEffect, spawnArrivalBurst, findLocationElement, setSetupPendingTokenIds });
registerPieceSkinHelpers({ render });
registerCardBackSkinHelpers({ render, savePreference: saveMyPreference, isItemUnlocked, openShop });
registerPlaymatHelpers({ render });
registerBackgroundHelpers({ render });
registerPetHelpers({ render });
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
registerGomennasaiHelpers({ checkEligibility: findGomennasaiEligibility, onUseGomennasai: useGomennasaiOnFinalLock });
registerTimerToggleHandlers({ onRequest: requestTimerToggleFor, onRespond: respondToTimerToggle });
registerContactApprovalHandler(respondToContact);
registerCounterLockHelpers({
  checkEligibility: findCounterLockToken,
  onUseCounterLock: useCounterLockOnContact,
  isPseudoCpuTarget,
});
registerEternalAnimHelpers(playEternalAcquisitionAnim);
registerGateInvasionStealHelper(stealHandCardsRitualForGateInvasion);
// オンラインのゲート侵攻（サーバー処理→受信モーダル経路）でも、ローカルと同じエターナル獲得の
// 派手な演出（3Dフリップ＋色バースト）を出す（ユーザー要望）。純演出関数のため両経路で共用できる。
registerGateInvasionModalEternalAnim(playEternalAcquisitionAnim);
// 同じくオンラインのゲート侵攻で「手札を奪う」飛翔演出を出す（ユーザー要望）。
registerGateInvasionModalStealAnim(playGateInvasionStealAnim);
buildGameTitle();
buildSpotlightOverlay();
buildFinalLockApprovalBanner();
buildTimerToggleButton();
buildTimerToggleBanner();
buildAutoProcessingToggleBanner();
buildAnytimeInterruptResumeButton();
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
        // オンライン対戦では「３：スタートプレイヤー決定」モーダルがどこからも呼ばれて
        // おらず（ローカルのgame-setup.js runStep3専用だった）、誰から始まるのかが
        // 画面に一切告知されないままだった（ユーザー報告「自動処理モードでオンライン対戦時、
        // スタートプレイヤー決定モーダルが表示されません」）。配布アニメーションが終わった
        // このタイミングで、サーバーが決めたスタートプレイヤー(turnPlayer)を告知する。
        // blocksInput:false・自動で閉じる保険付きなので、直後のreconcilePhaseAutomation()
        // による自動処理進行を妨げない。
        const starter = getState().turnPlayer;
        if (starter) showStartPlayerModal(starter);
        // 演出中はrender()内のreconcilePhaseAutomation()呼び出しを丸ごとスキップして
        // いた（上のsuppressGenericRenderForOnlineStart参照）ため、演出が終わった今
        // 改めて呼んでおかないと、フェイズ自動進行がいつまでも始まらないままになって
        // しまう（演出最後のrender()呼び出し自体はこのflagがまだtrueの間に起きるため）。
        reconcilePhaseAutomation();
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
// ユーザー報告「ゲート侵攻自動処理が完全に終わってから『○○のターン』の表示を出して
// ほしい。現在ゲート侵攻モーダル１枚目と被ってしまっている」への対応。オンライン中、
// turnPlayerの変化そのものはゲート侵攻の判定・適用と同じstate_changed broadcastの
// hydrateで同期的に起きるが、それを画面中央のモーダル列として案内するgate-invasion-modal.js
// 側は、まだ隠し情報の解決(fetchAndHydrate完了後)を待ってから始まるため一瞬遅れる
// （online.jsのisGateInvasionPending参照）。今回の変化にゲート侵攻が伴う場合は告知を
// 保留し、モーダル列が実際に始まって・空になったタイミング
// （registerOnGateInvasionQueueDrained）で改めて告知する。
let prevTurnPlayerForAnnouncement = null;
let pendingTurnAnnouncePlayer = null;
registerOnGateInvasionQueueDrained(() => {
  if (pendingTurnAnnouncePlayer !== null) {
    setTurnAnnounceActive(true);
    announceTurnChange(pendingTurnAnnouncePlayer, () => setTurnAnnounceActive(false));
    pendingTurnAnnouncePlayer = null;
  }
});
subscribe(() => {
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle) return;
  const { turnPlayer } = getState();
  if (prevTurnPlayerForAnnouncement !== null && turnPlayer !== null && turnPlayer !== prevTurnPlayerForAnnouncement) {
    // ユーザー要望「ターンごとの各プレイヤーのロック枚数を折れ線グラフで」。ターンが
    // 切り替わった＝1ターン終わった時点の全プレイヤーのロック枚数を記録する
    // （getLockedCountは無色を除外済み＝victory.jsと同じ集計）。
    const st = getState();
    const counts = {};
    for (const seat of st.activePlayers ?? []) counts[seat] = getLockedCount(seat);
    recordLockSnapshot(st.turnNumber, counts);
    // ユーザー要望「ターンを終了したら、出っ放しの到達拡大モーダルがあれば全員閉じる
    // ようにしてください」。turnPlayerの変化はオンライン中も全クライアントに同期される
    // ため、ここで閉じれば「全員」の画面で閉じることになる。使用モーダルも同じ位置・
    // 同じ「消えない」設定を共有するようになった（続き42）ため、一緒に閉じる。
    hideCardArrivalModalImmediately();
    hideHandEffectUseModalImmediately();
    if (isGateInvasionPending() || isGateInvasionQueueActive()) {
      pendingTurnAnnouncePlayer = turnPlayer;
    } else {
      setTurnAnnounceActive(true);
      announceTurnChange(turnPlayer, () => setTurnAnnounceActive(false));
    }
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
  // ロスターは activePlayers ではなく全席(SEAT_ORDER)を走査する。対局開始前(activePlayers==[])は
  // online.jsのupdateIdentityRosterが入室順にプレビュー席(C→B→D)へ他プレイヤーを載せるが、
  // activePlayersだけを見ていると、この着席がフィンガープリントに全く反映されず（tokens・
  // turnPlayer等も変わらないためバイト一致してしまい）、後から入室した人が着席しても
  // render()自体がスキップされて部屋主の画面に相手が出ない、というバグの原因になっていた
  // （ユーザー報告「部屋主の画面に後から入室した人が着席しない」の真因。onRosterChange→
  // notifyListeners()は発火していたが、このフィンガープリント重複排除で握り潰されていた）。
  // 対局中は非参加席の同期IDが無い（updateIdentityRosterが実席のみ載せる）ため、SEAT_ORDER
  // 全走査でも従来の挙動と一致する。
  const rosterParts = SEAT_ORDER
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
    // ユーザー報告（続き92）「タイマーをOFFにすることを提案中モーダルがOFFにした後も
    // 消えてくれません」の原因調査で発覚: pendingTimerToggle/pendingAutoProcessingToggle
    // （timer-toggle.js/updateAutoProcessingToggleBanner参照）が指紋に含まれていな
    // かった。承認が完了してpendingTimerToggleがnullに戻る瞬間、盤面のトークン・
    // ターン・ロスター等は何も変わらないため指紋が変化前とバイト一致してしまい、
    // render()自体が丸ごとスキップされてバナーが消えないまま固まっていた
    // （pendingFinalLock/pendingContactと全く同じ理由）。
    state.pendingTimerToggle
      ? `${state.pendingTimerToggle.requester}|${state.pendingTimerToggle.nextEnabled ? 1 : 0}|${state.pendingTimerToggle.queue.join(",")}`
      : "",
    state.pendingAutoProcessingToggle
      ? `${state.pendingAutoProcessingToggle.requester}|${state.pendingAutoProcessingToggle.nextEnabled ? 1 : 0}|${state.pendingAutoProcessingToggle.queue.join(",")}`
      : "",
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

// ユーザー要望「管理者モードで自分の通貨を自由に増やせるように」「サイトの利用状況を
// 見られるように」。管理者パネルの「🔐 管理者専用」セクションはinitAdminMode()時点
// （まだ未ログイン）で一度だけ構築されるため、ログイン/ログアウトの度に中身を
// 作り直してもらう必要がある（admin.jsのrenderAdminOnlySectionContent参照）。
onAuthChange(refreshAdminOnlySection);

// ユーザー確認済み「ログインボーナス（日次）」。ログインした瞬間（未ログイン→ログイン済み
// への変化）だけ、1日1回のログインボーナスを受け取りに行く（online.jsのclaimDailyLoginBonus
// 自身が「本日分は受け取り済みか」をサーバー側で判定するため、呼び出し側は毎回気軽に
// 呼んでよい）。もらえた時だけ画面下に小さく通知する。
let wasLoggedInForDailyBonus = !!getCachedUser();
onAuthChange((user) => {
  const isLoggedIn = !!user;
  if (!wasLoggedInForDailyBonus && isLoggedIn) {
    claimDailyLoginBonus()
      .then((amount) => {
        if (amount > 0) {
          showDailyBonusToast(amount);
          // ユーザー要望「お金がもらえるときの演出が欲しい」——対局終了時
          // （victory.jsのcheckForVictory）だけでなく、お金が増えるタイミング全て
          // （このログインボーナスも含む）で同じ通貨アイコンのパルス＋「+N」演出
          // を出し、見た目を統一する。
          showCurrencyAwardEffect(amount);
          refreshCurrencyDisplay();
        }
      })
      .catch((err) => console.error("claimDailyLoginBonus failed", err));
  }
  wasLoggedInForDailyBonus = isLoggedIn;
});

function showDailyBonusToast(amount) {
  const toast = document.createElement("div");
  toast.id = "daily-bonus-toast";
  toast.textContent = `🪙 ログインボーナス +${amount}！`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

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
  // 続き75診断ログ: ユーザー報告「ゲート侵攻成功時の演出が作動しなかった」の調査用。
  // online.js側のbroadcast受信ログ(diag-gate-invasion-broadcast)と突き合わせ、
  // このクライアントまで実際に届いたか・enqueueGateInvasionStepsを呼んだかを追う。
  logAction("diag-gate-invasion-received", { count: events?.length ?? 0 });
  enqueueGateInvasionSteps(events);
});

// ユーザー要望「接触タックル演出は参加者全員の画面に表示されるようにして」への対応。
// 承認した本人（defender、respondToContact内で直接再生する）以外の全員がここを通る。
onContactTackleEvents((payload) => {
  if (getSelfSeat() === payload.defenderSeat) return;
  playContactTackleForBystander(payload).catch((err) => console.error("playContactTackleForBystander failed", err));
});

// ユーザー要望「接触した側(attacker)が裏向きの手札から選ぶように」への対応。
// defenderが承認した瞬間に届く合図（broadcastContactApproved）を全クライアントが
// 受け取るが、実際に儀式的ピックを行うのは自分がattacker本人の時だけ。
onContactApprovedEvents((payload) => {
  if (getSelfSeat() !== payload.attacker) return;
  resolveContactRitualPickAsAttacker(payload).catch((err) => console.error("resolveContactRitualPickAsAttacker failed", err));
});
