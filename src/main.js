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
import { logAction, initActionLogPanel, getActionLogText, getActionLogEntries } from "./action-log.js";
import { initDeckViewer, openDeckViewer } from "./deck-viewer.js";
import { initStatsPlayerLinkModal } from "./stats-player-link.js";
import { initMyPage, registerAvatarPickerHelper, registerProfilePageOpener } from "./my-page.js";
import { openProfilePage } from "./profile-page.js";
import { initRankingIcon } from "./ranking-page.js";
import { openEmotePicker, openEmoteMuteMenu } from "./emote.js";
import { initCardDevMode, registerCardDevModeArrivalHelpers } from "./card-dev-mode.js";
import {
  canAutoProcessArrival,
  runArrivalEffect,
  canUseHandEffect,
  runHandEffect,
  canPayHandEffectCost,
  getHandEffectUnusableReason,
  hasHandEffectData,
  isHandEffectReactiveOnly,
  isAutoProcessingEnabled,
  setAutoProcessingEnabled,
  isHandEffectUsableAnytime,
  getMoveCandidates,
  getAnyCellWithCardCandidates,
  findSameColorDiscardCandidates,
  rotatedActivePlayersFrom,
  isMovementDisabledThisTurn,
  getLockableHandTokensExceptFinal,
} from "./card-effect-engine.js";
import {
  reconcilePhaseAutomation,
  registerPhaseAutomationHelpers,
  isHandPhaseActive,
  setHandEffectBusy,
  isHandEffectBusy,
  getHandEffectBusyStuckMs,
  isMovePhaseActive,
  markPhaseMoveActionTaken,
  setTurnAnnounceActive,
  getCurrentPhase,
  isCardLockable,
  forceEndCurrentPhase,
  registerContractBrandHandler,
  registerMyDeckDrawAnnouncer,
  setSetupRevealActive,
  canDrawFromMyDeck,
} from "./phase-automation.js";
import { initHelpButton } from "./help.js";
import { initDiscordLink } from "./discord-link.js";
import { initBoardViewToggle } from "./board-view-toggle.js";
import { initFullscreenToggle } from "./fullscreen-toggle.js";
import { getOptionArea } from "./option-area.js";
import { openBugReportModal } from "./bug-report.js";
// リロードを跨ぐ“ブラックボックス”（「スマホでたまに落ちてタイトルに戻る」原因追跡用）。
// import した時点で自己初期化（心拍・エラー捕捉開始＋前回セッションの不審終了判定）される。
import { getBlackboxBootReport, setBlackboxContext } from "./crash-blackbox.js";
// アプリ内スモークテスト（タイトル右下・管理者のみ。ユーザー要望2026-08-14）。
import { openSmokeTestPanel } from "./smoke-test-runner.js";
// オンライン対戦開始時に一度だけ出す「不具合報告のお願い」案内（開始告知が閉じた直後に表示）。
import { maybeShowBugReportIntro, isBugReportIntroHidden } from "./bug-report-intro.js";
import { maybeShowGameStartIntros } from "./game-intros.js";
// マイデッキ戦: 保存したデッキをアカウント(so7_user_profiles.my_deck)へ反映する注入（下の
// registerMyDeckPersistence参照）。my-deck.js は cards-data.js のみ依存の葉モジュール。
import { registerMyDeckPersistence } from "./my-deck.js";
// マイデッキ戦F4: 開始時のデッキ選択オーバーレイ（my-deck-select.jsはmy-deck.js/cards-data.jsのみ
// 依存の葉。ピッカーは内部で動的importするのでここは静的でも循環しない）。
import { openDeckSelect, closeDeckSelect, isDeckSelectOpen } from "./my-deck-select.js";
import { initCurrencyDisplay, refreshCurrencyDisplay, showCurrencyAwardEffect } from "./currency-display.js";
import { showSeasonRewardModal } from "./ranked-season-reward-modal.js";
import { initShop, openShopPanel } from "./shop.js";
import { initGameSetup, previewStartPlayerModal, showStartPlayerModal } from "./game-setup.js";
import { initOptionsMenu } from "./options-menu.js";
import {
  runGateInvasionsIfNeeded,
  registerEternalAnimHelpers,
  registerGateInvasionStealHelper,
  registerReturnHomeRevealHelper,
  registerGateInvasionCpuChecker,
  hasAnyGateInvasionCandidate,
  findInvadedDefender,
  isLocalGateInvasionActive,
} from "./gate-invasion.js";
import { announceHandPickups, announceCardLocked, announceDrawCount } from "./hand-announcer.js";
import { enqueueGateInvasionSteps, isGateInvasionQueueActive, registerOnGateInvasionQueueDrained, reapplyGateInvasionModal, registerGateInvasionModalEternalAnim, registerGateInvasionModalStealAnim, registerGateInvasionModalEternalPreHide, forceCloseGateInvasionModal } from "./gate-invasion-modal.js";
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
  registerApproverAutoDrivenCheck,
  setGomennasaiPicking,
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
import { openPetPicker, registerPetHelpers, getSelectedPetIndex, PET_OPTIONS, petSpriteSrc, pushMyPetToProfile } from "./pet-skins.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import {
  getPlayerName,
  getPlayerAvatar,
  getRawPlayerAvatar,
  setPlayerName,
  setPlayerAvatar,
  AVATAR_OPTIONS,
  getAvatarItemKey,
  getAvatarCost,
  PROTAGONIST_AVATAR,
  protagonistPathForSeat,
} from "./player-identity.js";
import { applyAvatarContent, getAvatarVariant, getAwakenedVariant, getEnragedVariant } from "./avatar-render.js";
import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { buildAvatarUploadSection } from "./avatar-upload.js";
import { isLockAreaBarVisible, setLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible } from "./lock-color.js";
import { isArrivalEffectDisabled, isFlightAnimationDisabled } from "./motion-prefs.js";
import { playCardDissolve, isCardDissolvePlaying } from "./card-dissolve.js";
import { rectCenter, flyGhost } from "./ghost-flight.js";
import { showCardArrivalModal, hideCardArrivalModalImmediately } from "./card-arrival.js";
import {
  showHandEffectUseModal,
  hideHandEffectUseModalImmediately,
  showHandEffectOptionPicker,
  showEffectReasonModal,
  showCardReceivedModal,
  showMultipleCardsReceivedModal,
  REASON_MODAL_TOTAL_MS,
} from "./hand-effect-ui.js";
import { initPlayerButtons } from "./player-buttons.js";
import { initQuickStart } from "./quick-start.js";
import { initPhaseGuide } from "./phase-guide.js";
import { initUpdateChecker, setUpdateBannerGate, reevaluateUpdateBanner } from "./update-checker.js";
import { initTutorialAutoStart, registerTutorialStageHelpers } from "./tutorial.js";
// チュートリアルCPU戦（台本化された練習試合）へ、ロック効果アニメとステージ座標変換を注入する。
import { registerTutorialBattleHelpers, isTutorialBattleActive } from "./tutorial-battle.js";
// 開発用: エイドス会話パネルのプレビュー（本番導線からは呼ばない。コンソールで __eidosDialogueDemo()
// / __eidosPlayScene("eidos_first_encounter") ）。
import { runEidosDialogueDemo, playEidosScene } from "./eidos-dialogue-fixtures.js";
import { isAutoDragRestrictionEnabled } from "./auto-drag-restriction.js";
import { initPiecePets, registerPiecePetHelpers } from "./piece-pet.js";
// 「ロック前・手札使用前」の確認モーダルを出すかどうかの設定（全デバイス共通、
// 「今後表示しない」でオフ・オプションの基本設定でオンに戻せる）。
import { isActionConfirmEnabled, setActionConfirmEnabled } from "./action-confirm-prefs.js";
import { registerTutorialBattleUiHelpers } from "./tutorial-battle-ui.js";
import { initTurnTimer, transferPriorityTo, isPseudoCpuTarget, notifyPlayerDecision } from "./turn-timer.js";
import { initIconRearrange } from "./icon-rearrange.js";
import { initSelfStatusRearrange } from "./self-status-rearrange.js";
import { initInteractionModeToggle } from "./interaction-mode.js";
import { initDeviceDetect, isTouchPrimaryDevice } from "./device-detect.js";
import { initJankLogger } from "./jank-logger.js";
import { initRankedNotify } from "./ranked-notify.js";
import { initPushNotify, subscribeToPush } from "./push-notify.js";
import { registerRecommendedViewHelper } from "./tablet-2d-warning.js";
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
  swapPieceLocations,
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
  drawFromMyDeckLocal,
} from "./state.js";
import { initOnlineUi, openOnlinePanel, isOnlineIntentActive } from "./online-ui.js";
import { initOpeningScreen, previewOpeningAuras } from "./opening-screen.js";
import { maybeShowFirstRunBgmModal } from "./first-run-bgm.js";
import { applyStoredCardPreviewSize, getCardPreviewSide } from "./card-preview-size.js";
import { isFixedHandEnabled, applyStoredFixedHand } from "./fixed-hand.js";
import {
  isCpuBattleActive,
  isCpuAutoSkipEnabled,
  isCpuBrainSmart,
  isSelfCpuSubstituted,
  setSelfCpuSubstituted,
  resetTimeoutStreak,
  getSeatLoadout,
  setSeatLoadout,
} from "./cpu-battle-state.js";
import {
  chooseMoveCandidate,
  chooseDeclaredColors,
  chooseEffectOption,
  chooseEffectCell,
  chooseHandEffectCard,
  chooseHandCardToken,
  chooseHandCardToLock,
  chooseOpponentHandCardToSteal,
  chooseSwapGiveCard,
  chooseTargetPlayer,
} from "./cpu-brain.js";
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
  registerDeckSelectHandler,
  onDeckSelectionStartEvents,
  writeSelectedDeck,
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
  getGateInvasionStolenCardId,
  broadcastCardReceived,
  onCardReceivedEvents,
  broadcastHandEffectUse,
  onHandEffectUseEvents,
  broadcastEffectReason,
  onEffectReasonEvents,
  broadcastSteppedCardReveal,
  onSteppedCardRevealEvents,
  broadcastMassChangeSwap,
  onMassChangeSwapEvents,
  broadcastAfkCpuStatus,
  onAfkCpuStatusEvents,
  isRankedGame,
  broadcastRankedForfeit,
  onRankedForfeitEvents,
  reportRankedResult,
  getRankedResultInfo,
  markRankedResultShown,
  isRankedResultShown,
  getSelfRank,
  claimSeasonReward,
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
  registerGameGoneHandler,
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
import { playSound, initGameBgmAutoStart, initSoundUnlock, startHeartbeat, stopHeartbeat } from "./sound.js";
import { initScreenWakeLock } from "./wake-lock.js";
import { getCardDefinition, getCardImagePath, getCardBackImagePath, getCardIllustPath } from "./cards-data.js";
import { isBoardIllustOnly } from "./board-card-display.js";
import { showCardFace } from "./card-face-display.js";
import { onLangChange } from "./i18n.js";
import { t } from "./ui-text.js";
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

// AFK代行の状態（ユーザー要望2026-08-08）。モジュール評価の早い段階（最初のrender前）で初期化して
// おく必要があるため、ここで宣言する（buildPlayerZone/renderのupdateAfkCpuBannerが参照）。
const afkCpuStatusBySeat = {}; // 相手席の代行状態（seat -> bool）。自席は isSelfCpuSubstituted() を見る。
let afkCpuBannerEl = null;
function isAfkCpuSubstitutedSeat(seat) {
  if (seat === getSelfSeat()) return isSelfCpuSubstituted();
  return !!afkCpuStatusBySeat[seat];
}

function buildPlayerZone(side, player, isSelf) {
  const zone = document.createElement("div");
  zone.className = `zone zone-${side} player-zone`;
  const nameEl = document.createElement("div");
  nameEl.className = `label${player === getState().turnPlayer ? " is-turn-player" : ""}`;
  nameEl.textContent = getPlayerName(player);
  // AFK代行中の席には「🤖CPU操作中」を名前に添える（ユーザー要望2026-08-08。相手にも分かるように）。
  if (isAfkCpuSubstitutedSeat(player)) {
    const tag = document.createElement("span");
    tag.className = "afk-cpu-tag";
    tag.textContent = " 🤖CPU操作中";
    nameEl.appendChild(tag);
  }

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

  // ユーザー要望2026-08-28「自動処理モードでは、自分の公開カード（publicDraw）を別の手札公開
  // エリアではなく自分の手札の扇の中に、通常の手札と1枚分の隙間を空けて、目印（👁ハイライト）
  // 付きで並べたい」。自分＝isSelf・非観戦・自動処理モードの時だけ、扇の末尾に隙間1枚分を空けて
  // 公開カードを並べる（下の handRevealTokens はこの場合空にして重複表示を避ける）。
  const inlineRevealTokens =
    isSelf && !isSpectatingGame() && isAutoProcessingEnabled()
      ? getState().tokens.filter(
          (t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === player
        )
      : [];
  const revealGapSlots = inlineRevealTokens.length > 0 ? 1 : 0;
  const totalFanSlots = handTokens.length + revealGapSlots + inlineRevealTokens.length;

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
  const scale = Math.max(totalFanSlots, 2) / 3;
  const sizeRem = (Number.isNaN(baseSize) ? 10 : baseSize) * scale;
  if (orientation === "horizontal") handEl.style.width = `${sizeRem}rem`;
  else handEl.style.height = `${sizeRem}rem`;

  // 扇のスロット数は「通常の手札 ＋ 隙間1枚分 ＋ 公開カード」の合計（自動処理モードの自分のみ、
  // それ以外は隙間0・公開カード0なので実質 handTokens.length と同じ）。
  const layout = layoutFan(totalFanSlots, orientation, isSelf, side);
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
        showCardFace(cardEl, token.cardId, getCardImagePath(token.cardId));
      } else {
        cardEl.className = "hand-card is-facedown";
        cardEl.style.backgroundImage = `url("${cardBackImageForToken(token)}")`;
      }
    } else if (isSelf) {
      cardEl.className = "hand-card is-self";
      showCardFace(cardEl, token.cardId, getCardImagePath(token.cardId));
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
      cardEl.style.backgroundImage = `url("${cardBackImageForToken(token)}")`;
    }
    cardEl.dataset.tokenId = token.id;
    const card = layout[i];
    cardEl.style.transform = `translateX(${card.spreadX}px) translateY(${card.spreadY}px) rotate(${card.angle}deg)`;
    // ひょこっと持ち上げ演出（initHandPeek参照）が、この基準となる扇の位置に戻せるよう
    // 保持しておく（後からtranslateZを追加する時、この文字列に追記する形にする）。
    if (isSelf) cardEl.dataset.baseTransform = cardEl.style.transform;
    fanEl.appendChild(cardEl);
  });

  // ユーザー要望2026-08-28: 公開カード（publicDraw）を手札の扇の末尾に、隙間1枚分を空けて並べる。
  // 通常の手札と区別できるよう、公開されていることを示すハイライト（is-public-in-hand）と
  // 👁アイコンを付ける。findDraggableAtは.hand-cardとして掴め、手札効果のドラッグ発動は
  // token.location.zone（publicDraw）を見るため従来通り機能する。
  inlineRevealTokens.forEach((token, j) => {
    const cardEl = document.createElement("div");
    cardEl.className = "hand-card is-self is-public-in-hand";
    cardEl.dataset.tokenId = token.id;
    showCardFace(cardEl, token.cardId, getCardImagePath(token.cardId));
    const card = layout[handTokens.length + revealGapSlots + j];
    if (card) {
      cardEl.style.transform = `translateX(${card.spreadX}px) translateY(${card.spreadY}px) rotate(${card.angle}deg)`;
      cardEl.dataset.baseTransform = cardEl.style.transform;
    }
    const eye = document.createElement("span");
    eye.className = "hand-card-public-eye";
    eye.textContent = "👁";
    cardEl.appendChild(eye);
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
  // 自動処理モードの自分は公開カードを扇の中（上）に表示済みなので、ここでは重複して出さない
  // （エリア自体はドロップ先として残す）。それ以外（相手席・自動処理OFF）は従来通りここに並べる。
  const handRevealTokens =
    inlineRevealTokens.length > 0
      ? []
      : getState().tokens.filter(
          (t) => t.kind === "card" && t.location.zone === "publicDraw" && t.location.player === player
        );
  handRevealTokens.forEach((token) => {
    const slot = document.createElement("div");
    slot.className = "hand-reveal-slot";
    const cardEl = document.createElement("div");
    // revealSourceが無い（あり得ない想定だが安全側で）場合は手動配置扱いにしておく。
    cardEl.className = `hand-reveal-card${token.revealSource === "draw" ? " is-drawn" : " is-manual"}`;
    cardEl.dataset.tokenId = token.id;
    showCardFace(cardEl, token.cardId, getCardImagePath(token.cardId));
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
// #3（ユーザー要望2026-08-19「手札を捨てる時は手札のその場で焼失演出で」）: 手札/公開エリアの
// カードを捨てる瞬間、そのカードの位置・サイズで霧散(焼失)演出を出す（残骸はその場から上へ立ち上る）。
// 中身が分かる(cardId既知)手札/公開エリアのカードだけ——オンラインで裏向き/マスク中のカードや、
// ロック中カードの破棄(色落ちキャット等、盤面のカード)は対象外。fire-and-forget（実際の破棄は別途進む）。
function playHandCardBurn(tokenId) {
  try {
    const token = getState().tokens.find((t) => t.id === tokenId);
    if (!token || token.kind !== "card" || !token.cardId) return;
    if (token.location?.zone !== "hand" && token.location?.zone !== "publicDraw") return;
    if (!getCardDefinition(token.cardId)) return; // 中身不明(マスク)は出さない
    const clientRect = cardElRectForToken(tokenId);
    if (!clientRect || clientRect.width < 1) return;
    const s = toStageLocalRect(clientRect);
    playCardDissolve(token.cardId, {
      atRect: { x: s.left, y: s.top, w: s.right - s.left, h: s.bottom - s.top },
      inPlace: true,
    });
  } catch (_) {
    /* 演出失敗は無視（破棄自体には影響しない） */
  }
}

async function discardFromHandReveal(tokenId) {
  playHandCardBurn(tokenId); // #3: 捨てる瞬間、そのカードの位置で焼失演出（トークンが消える前に捕捉）
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
        ? getBoardCardImagePath(pileArray[pileArray.length - 1]) // 捨て場の一番上も盤面扱い（イラストのみ設定に従う）
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
// 盤面（セル・ロックスロット・捨て場）に敷く表向きカードの画像。イラストのみ表示が
// ONなら「イラストのみ版」を、OFFなら通常のテキストあり版を返す（ユーザー要望）。
// ホバー拡大・手札は呼び出し側で従来通りgetCardImagePath()を使うためここは通らない。
function getBoardCardImagePath(cardId) {
  return isBoardIllustOnly() ? getCardIllustPath(cardId) : getCardImagePath(cardId);
}

// ゲート侵攻のエターナル獲得演出中、そのエターナルが「こっそり先にロックエリアに入っている」
// ように見えないよう、演出が⑥（ロックスロットへ着地）を終えるまで実際のロックカードの描画だけを
// 隠す。状態自体は（オンラインではサーバーが確定済みで）既にロック済みだが、視覚だけを遅らせる。
// ユーザー要望「演出のタイミングでロックされたように見せたい」への対応。状態自体を遅らせる方式は
// アトミックなサーバー確定・切断時のdesync等の問題があるため採らない（playEternalAcquisitionAnim
// 末尾コメント参照）。{side, index, cardId} の完全一致でそのカード1枚だけを対象にする。
let suppressedEternalLockRender = null;
function isEternalLockRenderSuppressed(token) {
  const s = suppressedEternalLockRender;
  return (
    !!s &&
    token.location?.zone === "lock" &&
    token.location.side === s.side &&
    token.location.index === s.index &&
    token.cardId === s.cardId
  );
}

function buildFlatCard(token) {
  const card = document.createElement("div");
  // 上記の演出中は、このカードだけ場所を確保したまま不可視にする（着地演出後にrender()で戻す）。
  if (isEternalLockRenderSuppressed(token)) card.style.visibility = "hidden";
  if (token.faceUp) {
    card.className = "board-card";
    // 盤面・ロックエリアのカードは以前から「イラストのみ画像」を採用（テキスト合成の対象外）。
    card.style.backgroundImage = `url("${getBoardCardImagePath(token.cardId)}")`;
  } else {
    card.className = "board-card is-facedown";
    card.style.backgroundImage = `url("${cardBackImageForToken(token)}")`;
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
  // #152: 手札に加えるのは今の一番上のカード。これを抜けば下の別カードが新しく一番上になる
  // （＝到達コンボは正当に発動）。動かす前の一番上id（＝このカード自身）を控えて渡す。
  const prevTopId = token.id;
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
  maybeTriggerCardArrivalForExposedCard(location, false, prevTopId);
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
// awaitExposedArrival（省略時false）: 移動で下のカードが露出して到達（コンボ）が起きる場合に、
// それを完全に解決してから呼び出し元へ戻す。収穫と種まき（PICKUP_TO_HAND）のように「拾う→露出
// 到達を割り込み解決→種まき（同じマスへ置き直す）へ復帰」というルール（#85、ユーザー確認済み）を
// 満たすために使う。これをawaitしないと、露出到達と直後のPLACE（種まきの手札選択）が並行して走り、
// 種まきのピッカーが宙に浮く（手札が全部トーンオフのまま固着）不具合になっていた。他の呼び出し元は
// 従来通り撃ちっぱなし（false）で挙動を変えない。
async function moveAndSyncForEffect(tokenId, location, soundName, suppressArrival, awaitExposedArrival = false, skipExposedArrival = false) {
  const movingToken = getState().tokens.find((t) => t.id === tokenId);
  const fromLocation = movingToken?.location ?? null;
  // #152: 露出到達コンボは「マスの“一番上”のカードがどいて別のカードが新しく一番上になった」
  // 時だけ発動すべき（駒が新しいカードの表面に触れた瞬間＝到達）。試練の儀式のように、スタックの
  // 一番下（や中間）のカードを回収しても、駒が触れている一番上のカードは変わらない＝新しい接触では
  // ないので到達しない。そこで、動かす前にそのマスの一番上のカードidを控えておき、
  // maybeTriggerCardArrivalForExposedCard に渡して「一番上が入れ替わった時だけ」発動させる。
  const prevTopBeforeMove =
    fromLocation && (fromLocation.zone === "cell" || fromLocation.zone === "lock")
      ? findTopCardAt(fromLocation)?.id ?? null
      : null;
  // ③演出（#147・ユーザー報告2026-08-18）: カード効果による「カード→マス」配置にも着地演出を出す
  // （続き207ではドラッグ&ドロップのみだった。合同建設・増殖する樹々・ジャンプ台の手札効果等が該当）。
  // 移動前のカードDOM要素のrectを飛び元として捕捉しておく（駒の移動・手札行きは対象外）。
  // #2（ユーザー要望2026-08-19）: 手札→ロック（例: 桃のキューブ セレナーデの手札効果でロック）も
  // 同じ飛翔を出す（マスと同じ playCardCellLanding。ロック内での並び替えは対象外＝手札発の時だけ）。
  const landingToCellOrLock =
    location?.zone === "cell" || (location?.zone === "lock" && fromLocation?.zone === "hand");
  const landingSourceRect =
    movingToken?.kind === "card" && landingToCellOrLock ? cardElRectForToken(tokenId) : null;
  // ③演出（続き211・ユーザー要望2026-08-18）: 到達効果処理後にこのカードが手札へ入る等、「マス→手札」の
  // カード移動にも持ち上げ飛翔（playCardLiftToHand）を出す。飛び元＝移動前の盤面カードのrect。
  const liftSourceRect =
    movingToken?.kind === "card" && fromLocation?.zone === "cell" && location?.zone === "hand"
      ? cardElRectForToken(tokenId)
      : null;
  // #164: 飛翔ゴーストは「移動前に盤面で見えていた面」を見せる（表向きだったカードは表面で飛ぶ）。
  // 移動後は相手の手札で裏向きに描画され得るため、移動前のmovingTokenのfaceUp/cardIdから決める。
  const liftSourceImg = liftSourceRect
    ? movingToken.faceUp
      ? `url("${getCardImagePath(movingToken.cardId)}")`
      : `url("${getCardBackImagePath(movingToken.cardId)}")`
    : null;
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
  // #163: 呼び出し側が露出到達コンボを別途（明示的に順序制御して）発動する場合は、ここでの
  // 自動発動を抑止する（例: マスチェンジ自身の回収時。回収の露出コンボでB(相手)の到達がA(発動者)
  // より先に発動してしまうのを防ぎ、A→Bの処理順を保つため）。既定はfalse＝従来通り自動発動。
  const exposedArrival = skipExposedArrival
    ? Promise.resolve()
    : maybeTriggerCardArrivalForExposedCard(fromLocation, false, prevTopBeforeMove);
  if (awaitExposedArrival) await exposedArrival;
  // 続き212: 飛翔演出が完全に終わってから呼び出し側（engine）の次アクションへ進めるようawaitする。
  if (landingSourceRect) await playCardCellLanding(landingSourceRect, location, tokenId);
  if (liftSourceRect) await playCardLiftToHand(liftSourceRect, location.player, tokenId, liftSourceImg);
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
  // #93: 到達の完全解決で解決するPromiseをそのまま返す（engine側がawaitで待ち切れるように）。
  return maybeTriggerCardArrivalForCard(location, cardId, true);
}

// マスチェンジの入れ替えルール（ユーザー指定2026-08-08）用。指定マスの一番上のカードが
// 「表向き」で、かつ期待する駒(expectedPlayer)がそこにいる時だけ、その到達効果を発動して
// 完了まで待つ。「入れ替え」は移動ではないため裏向きは開かない＝表向きの時だけ発動する。
// 発動対象席がその効果の自動処理対象(getAutoDriveSeat)でない場合はtriggerCardArrival側が
// 拡大モーダルのみ出してonFullyResolvedを呼ぶ（既存の非自動到達と同じ挙動）ため、awaitは詰まらない。
async function triggerArrivalAtIfFaceUpForEffect(location, expectedPlayer) {
  if (!location) return;
  const top = findTopCardAt(location);
  if (!top || !top.faceUp) return;
  const owner = getPieceOwnerAt(location);
  if (!owner || (expectedPlayer && owner !== expectedPlayer)) return;
  await new Promise((resolve) => triggerCardArrival(top.cardId, location, resolve));
}

// PLACE_CARDのsource:"deck"用（終わりなき化学ゲンテクニーク・月下の漂流船プリドゥエン等）。
// 山札の一番上を、手札を経由せず直接そのマスへ裏向きで置く（performMoveFallbackAndEndTurn
// と同じ考え方）。
async function placeFromDeckForEffect(location) {
  const deckRect = location?.zone === "cell" ? deckStackRect() : null; // 着地演出の飛び元（山札）
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
  await playDeckToCellLanding(deckRect, location); // ③演出(#147): 山→マス配置にも着地演出（続き212: 完了まで待つ）
}

// 試練の儀式専用（ユーザー要望2026-08-08「オンラインもローカル同様のじらしフリップに」）。
// 山札の一番上を指定マスへ“裏向きのまま”置き、置いたカードのcardIdを返す。オンラインでは
// 伏せカードの中身がRLSで隠れて盤面から読めないため、revealToActorでサーバーに頼み、引いた
// 本人（リクエスト元）にだけ中身を返してもらう（盤面は伏せたまま＝他プレイヤーには見えない）。
// これで盤面を先にめくらずに中央じらしフリップができる。サーバー未再デプロイ時はnullを返し、
// 呼び出し側（RITUAL_PLACE_MOVE_REPEAT）が従来の「先に表向きにして判明」経路へフォールバックする。
async function placeFromDeckRevealForEffect(location) {
  const deckRect = location?.zone === "cell" ? deckStackRect() : null; // 着地演出の飛び元（山札）
  let revealedCardId = null;
  if (isOnlineMode()) {
    try {
      const result = await drawFromPile("deck", location, true);
      revealedCardId = result?.revealedCardId ?? null;
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("placeFromDeckRevealForEffect failed", err);
      return null;
    }
  } else {
    drawFromPile("deck", location);
    revealedCardId = findTopCardAt(location)?.cardId ?? null; // ローカルは全state可視で中身が読める
  }
  playSound("cardPlace");
  await playDeckToCellLanding(deckRect, location); // ③演出(#147): 試練の儀式の山→マス配置（続き212: 完了まで待つ）
  return revealedCardId;
}

// マスチェンジの入れ替え演出（ユーザー要望2026-08-08「お互いの駒が発光し、不安定な電撃の
// ような光で結ばれて入れ替わる」）。2駒の中心を、ジグザグの稲妻（一定間隔で形を作り直して
// “不安定”に見せる）で結ぶSVGを、ステージ座標に重ねる。呼び出し側が.remove()で消す。
function createSwapArc(rectA, rectB) {
  const la = stageClientToLocal(rectA.left + rectA.width / 2, rectA.top + rectA.height / 2);
  const lb = stageClientToLocal(rectB.left + rectB.width / 2, rectB.top + rectB.height / 2);
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("class", "swap-arc-svg");
  svg.style.cssText = `position:fixed; left:0; top:0; width:${STAGE_WIDTH}px; height:${STAGE_HEIGHT}px; pointer-events:none; z-index:9998; overflow:visible;`;
  // ユーザー要望2026-08-08: 鋭い実線の電撃ではなく「ぼやけた湯気のようなオーラの電撃」に。
  // 外側から aura(広くぼかしたオーラ)→glow(発光)→bolt(柔らかい芯) の3層で霞んだ光にする。
  const aura = document.createElementNS(NS, "polyline");
  aura.setAttribute("class", "swap-arc-bolt swap-arc-bolt-aura");
  const glow = document.createElementNS(NS, "polyline");
  glow.setAttribute("class", "swap-arc-bolt swap-arc-bolt-glow");
  const bolt = document.createElementNS(NS, "polyline");
  bolt.setAttribute("class", "swap-arc-bolt");
  svg.appendChild(aura);
  svg.appendChild(glow);
  svg.appendChild(bolt);
  document.body.appendChild(svg);
  const dx = lb.x - la.x;
  const dy = lb.y - la.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len; // 進行方向に垂直な単位ベクトル（ジグザグのぶれ方向）
  const py = dx / len;
  const regen = () => {
    const segs = 9;
    const pts = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const x = la.x + dx * t;
      const y = la.y + dy * t;
      const jitter = i === 0 || i === segs ? 0 : (Math.random() * 2 - 1) * 20;
      pts.push(`${(x + px * jitter).toFixed(1)},${(y + py * jitter).toFixed(1)}`);
    }
    const s = pts.join(" ");
    bolt.setAttribute("points", s);
    glow.setAttribute("points", s);
    aura.setAttribute("points", s);
  };
  regen();
  const flickerId = setInterval(regen, 95); // 95msごとに形を作り直して“ゆらめく湯気のような電撃”に
  return {
    remove() {
      clearInterval(flickerId);
      svg.remove();
    },
  };
}

// マスチェンジの入れ替え演出本体。①両駒を発光→②電撃アークで結ぶ→③実駒を隠してゴーストで
// お互いの位置へ飛翔。終了時、実駒は隠したまま（pending）にして呼び出し側の状態入れ替え＋
// renderで新しい位置に現れるようにする。演出オフ時は何もしない。
async function playMassChangeSwapAnimation(pieceAId, pieceBId) {
  if (isFlightAnimationDisabled()) return;
  const table = document.getElementById("game-table");
  const elA = table?.querySelector(`.piece[data-token-id="${pieceAId}"]`);
  const elB = table?.querySelector(`.piece[data-token-id="${pieceBId}"]`);
  const tokA = getState().tokens.find((t) => t.id === pieceAId);
  const tokB = getState().tokens.find((t) => t.id === pieceBId);
  if (!elA || !elB || !tokA || !tokB) return;
  const rectA = elA.getBoundingClientRect();
  const rectB = elB.getBoundingClientRect();
  // ①発光＋②電撃アーク。
  elA.classList.add("piece-swap-glow");
  elB.classList.add("piece-swap-glow");
  const arc = createSwapArc(rectA, rectB);
  playSound("swap");
  await wait(getContactAnimSeconds("--swap-anim-charge-duration", 0.8) * 1000);
  // ③実駒を隠してゴーストで入れ替え飛翔（お互いの位置へ）。
  setSetupPendingTokenIds(new Set([pieceAId, pieceBId]));
  render();
  const durMs = getContactAnimSeconds("--swap-anim-flight-duration", 0.6) * 1000;
  const gA = flyGhost(rectA, rectB, getSkinImagePath(tokA.color, tokA.player), "setup-fly-card", durMs);
  const gB = flyGhost(rectB, rectA, getSkinImagePath(tokB.color, tokB.player), "setup-fly-card", durMs);
  await Promise.all([gA.done, gB.done]);
  arc.remove();
  // pendingはここでは解除しない——呼び出し側が状態を入れ替えてrenderした後に解除する。
}

// 不具合#43: マスチェンジの入れ替え電撃演出を、実行者以外のクライアントでも見せる。実際の駒の
// 移動は通常の状態同期＋remote-move-animatorが担うため、ここでは駒を隠さず（ゴースト飛翔もせず）
// 両駒の発光＋電撃アークだけを一定時間重ねて見せる。ブロードキャスト受信時（入れ替え前＝駒がまだ
// 元の位置にいる間）に呼ばれる想定。
async function playMassChangeArcForRemote(pieceAId, pieceBId) {
  if (isFlightAnimationDisabled()) return;
  const table = document.getElementById("game-table");
  const elA = table?.querySelector(`.piece[data-token-id="${pieceAId}"]`);
  const elB = table?.querySelector(`.piece[data-token-id="${pieceBId}"]`);
  if (!elA || !elB) return;
  const rectA = elA.getBoundingClientRect();
  const rectB = elB.getBoundingClientRect();
  elA.classList.add("piece-swap-glow");
  elB.classList.add("piece-swap-glow");
  const arc = createSwapArc(rectA, rectB);
  playSound("swap");
  // チャージ＋飛翔ぶんの時間、アークと発光を見せる（実駒の入れ替えはこの間に状態同期で届き、
  // remote-move-animatorが飛翔させる）。
  const chargeMs = getContactAnimSeconds("--swap-anim-charge-duration", 0.8) * 1000;
  const flightMs = getContactAnimSeconds("--swap-anim-flight-duration", 0.6) * 1000;
  await wait(chargeMs + flightMs);
  arc.remove();
  elA.classList.remove("piece-swap-glow");
  elB.classList.remove("piece-swap-glow");
}

// SWAP_POSITION用（マスチェンジ等）。自分の駒と、targetLocationにいる相手の駒の位置を
// 入れ替える。「移動」ではないため（docs/cards.md補足）、この関数自体は到達判定・自動オープンを
// 行わない（到達効果の発動はcard-effect-engine.jsのSWAP_POSITION側でルールに沿って行う）。
async function swapPiecesForEffect(pieceTokenId, fromLocation, targetLocation) {
  const opponentPiece = getState().tokens.find(
    (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === targetLocation.row && t.location.col === targetLocation.col
  );
  if (!opponentPiece) return;
  // 不具合#43: 相手クライアントにも電撃アークを見せる。入れ替え（moveAndSync）の状態同期が届く
  // 前＝両駒がまだ元の位置にいる間に、ブロードキャストしておく（受信側は元位置間にアークを描く）。
  if (isOnlineMode()) broadcastMassChangeSwap({ fromPlayer: getSelfSeat(), pieceAId: pieceTokenId, pieceBId: opponentPiece.id });
  // 入れ替え演出（発光＋電撃アーク＋飛翔）。終了時、両駒はpendingで隠れている（演出ON時）。
  await playMassChangeSwapAnimation(pieceTokenId, opponentPiece.id);
  // 「入れ替え」であり「移動」ではないため到達効果を得ない（docs/cards.md補足）。
  // 続き59のsuppressArrival（remote-move-animator.jsが誤って到達を再現しないように
  // するためのフラグ）を、入れ替わる両方の駒に付ける。
  if (isOnlineMode()) {
    // オンラインは各MOVE_TOKENをサーバー（so7-apply-action）へ送る必要があるため従来通り2回に分ける。
    await moveAndSyncForEffect(opponentPiece.id, { zone: "cell", row: fromLocation.row, col: fromLocation.col }, undefined, true);
    await moveAndSyncForEffect(pieceTokenId, targetLocation, undefined, true);
  } else {
    // ローカルは原子的入れ替え（続き226）。2回のMOVE_TOKENに分けると、その間だけ両駒が片方の
    // マスに乗る一過性のpiece-overlapが生じ、スモークの不変条件チェッカーがFAILにしていた。
    swapPieceLocations(pieceTokenId, opponentPiece.id, true);
  }
  setSetupPendingTokenIds(new Set()); // 演出で隠していた分を解除
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
// revealLabels: 奪った札の中央表示ラベルを「自分視点」で出し分ける。takes=自分が取った時
// （奪った/受け取った）、loses=自分が奪われた/渡した時（奪われた/渡した）。1画面共有の
// ローカルでは見ているのは常に自分なので、CPUが自分から奪う時に「奪った」ではなく「奪われた」と
// 出す（ユーザー報告2026-08-07: スリカエで自分が受け取ったのに「渡した」と出て紛らわしい）。
function requestOpponentHandRitualPick(targetPlayer, hint, excludeTokenIds, revealLabels = { takes: "奪った", loses: "奪われた" }, options = {}) {
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
    async function finish(token) {
      if (settled) return;
      settled = true;
      activeEffectPicker = null;
      backdrop.remove();
      modal.remove();
      if (isRitualBroadcastTarget) broadcastRitualPickEnded({ targetPlayer, pickedTokenId: token?.id ?? null });
      // 奪った（受け取った）カードが何かを、画面中央に大きく見せて周知する（奪う側は裏向きしか
      // 見ていないため。ユーザー要望2026-08-07「スリカエ・ゲート侵攻で何を奪ったか分かるように」）。
      // showCardReceivedModalはこの画面にだけ出す（ブロードキャストしない）ので、1画面共有の
      // ローカルでもオンラインの引いた本人でも、それぞれの画面で見える。閉じる（クリック/自動）まで
      // 待ってから解決するので、複数枚（ゲート侵攻）でも1枚ずつ順番に見せられる。
      if (token) {
        // ユーザー要望2026-08-08「接触の“奪った”モーダルが出るタイミングで実際に手札へ加えたい」。
        // 呼び出し側が指定した時だけ、reveal（下）を出す前にこの1枚を実際に手札へ移す
        // （＝奪ったモーダルが出た時点で既に自分の手札に入っている）。RESPOND_CONTACTは
        // 「既に攻撃側の手札にある札は二重に奪わない」ように対応済み（state.js）。
        let revealCardId = token.cardId;
        if (options?.onPickedBeforeReveal) {
          try {
            await options.onPickedBeforeReveal(token);
            // 不具合#44: オンラインでは相手の手札のカードの中身(cardId)はRLSで隠れており、選んだ
            // 時点の token.cardId は null（→ null.webp）。onPickedBeforeReveal で自分の手札へ移した
            // 後は中身が判明するので、移動後の最新状態から cardId を取り直して正しく見せる。
            const fresh = getState().tokens.find((t) => t.id === token.id);
            if (fresh?.cardId) revealCardId = fresh.cardId;
          } catch (err) {
            console.error("onPickedBeforeReveal failed", err);
          }
        }
        // #67: オンラインの接触で攻撃側が奪う場合、相手の手札は裏向き（cardId が RLS で隠れ
        // null）で、この経路には onPickedBeforeReveal も無いため revealCardId が null になり
        // 「奪った」モーダルが null.webp の壊れた画像になる。しかも直後に
        // checkContactAttackerResolution() が“実際に手札へ入った本物のカード”で正しい結果
        // モーダルを出すので、この公開モーダルは冗長。呼び出し側が suppressReceivedReveal を
        // 指定した時はこの中央公開だけを省く（ライブのホバー実況 broadcast や実際のピックは
        // そのまま行う）。
        if (!options?.suppressReceivedReveal) {
          // 自分視点でラベル・文面を出し分ける。この札は targetPlayer → actor(手番) へ移る。
          const actor = getState().turnPlayer;
          const self = getSelfSeat();
          let labelText, sub;
          if (targetPlayer === self) {
            // 自分の手札が奪われる／渡す側。
            labelText = revealLabels.loses;
            sub = actor ? `${getPlayerName(actor)}に` : "";
          } else {
            // 取る側（自分が取る、または4人戦で他者が他者から取る）。
            labelText = revealLabels.takes;
            sub =
              actor && actor !== self && actor !== targetPlayer
                ? `${getPlayerName(actor)}が${getPlayerName(targetPlayer)}から`
                : `${getPlayerName(targetPlayer)}から`;
          }
          // ユーザー要望2026-08-28「接触時の『奪った』モーダルは、接触演出の直後の方が良い
          // （現在は直前に表示されている）」。deferReveal が指定された時は、ここで即座に
          // 中央の「奪った」表示を出さず、呼び出し側にその表示関数だけ渡す（呼び出し側が
          // タックル演出の後に await して出す）。他の呼び出し（スリカエ・ゲート侵攻）は
          // deferReveal 未指定なので従来通りその場で表示する。
          const doReveal = () => showCardReceivedModal(revealCardId, sub, { labelText });
          if (options?.deferReveal) options.deferReveal(doReveal);
          else await doReveal();
        }
      }
      resolve(token ?? null);
    }
    // ユーザー報告#10「スリカエでカードを選ぶとき、適当な場所（＝カード以外の背景）を
    // タップしたら、すり替えずに終わってしまった」。この儀式ピック（スリカエ・接触・ゲート
    // 侵攻の奪取）はいずれも“必ず1枚選ぶ”必須処理なので、背景タップでキャンセル（finish(null)）
    // されると効果が不発になってしまう。背景タップでは閉じない（＝カードを選ぶまで閉じない）
    // ようにする。放置時はタイムアウトで無作為に1枚選ばれる（performPriorityTimeoutAutoAction）。
    const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10620 });
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
      cardEl.style.backgroundImage = `url("${cardBackImageForToken(token)}")`;
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
    // CPUが奪う札を選ぶ番はこの儀式ピックモーダルを表示しない（自動で選ばれる。奪った結果は
    // 中央のカード表示で別途出る）。
    if (isCpuSelectingNow()) {
      backdrop.classList.add("is-cpu-hidden");
      modal.classList.add("is-cpu-hidden");
    }
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
// ゲート侵攻の奪取儀式で、奪われる側(defender)のモーダルキューが「儀式が終わるまで」待つための
// resolver。攻撃側のbroadcast(ended)でwatchが閉じた時に解決する（closeRitualPickWatch）。
// これが無いと、defender側のキューだけ先走って次の演出（エターナル獲得等）が始まってしまう
// （ユーザー報告「相手の手札を奪う儀式の最中に次の処理が始まる」）。
let gateInvasionStealWatchResolve = null;
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
  // 注意: ここ（closeRitualPickWatch）で待機を解除してはいけない。openRitualPickWatchは
  // 冒頭でcloseRitualPickWatch()を呼んで前のwatchを掃除するため、ここで解除すると「watchが
  // 開いた瞬間」に待機が解けてしまい、奪われる側のキューが先走る（ユーザー報告）。解除は
  // 「奪取が終わった合図(ended broadcast)」を受けた時だけ行う（onRitualPickEndedEvents参照）。
}
// options.title: 見出しの差し替え。
// カードの表向き表示は「自分のstateで見えるcardId」を第一に使い、（RLSで）見えない場合は
// online.jsのローカルキャッシュ getGateInvasionStolenCardId から引く。#162（情報漏洩）修正で、
// ゲート侵攻の儀式は以前 broadcast の overrides で奪ったカードの cardId を全員へ送っていた（漏洩）
// のをやめた。奪われた本人は、既にattackerの手札へ移動してマスクされた「奪われたカード」も、
// state_changed ハンドラが pre-hydrate state から解決してこのキャッシュに控えているため、
// ネットワークに cardId を出さずに自分のカードだけを表向きで見られる。
function openRitualPickWatch(order, options = {}) {
  closeRitualPickWatch();
  const tokensById = new Map(getState().tokens.filter((t) => t.kind === "card").map((t) => [t.id, t]));
  ritualPickWatchBackdrop = createBackdrop(() => {}, { dim: true, zIndex: 10619 });
  ritualPickWatchModal = document.createElement("div");
  ritualPickWatchModal.id = "sleight-ritual-modal";
  ritualPickWatchTitleEl = document.createElement("div");
  ritualPickWatchTitleEl.className = "sleight-ritual-title";
  ritualPickWatchTitleEl.textContent = options.title || "相手があなたの手札から1枚選んでいます…";
  ritualPickWatchModal.appendChild(ritualPickWatchTitleEl);
  const cardsWrap = document.createElement("div");
  cardsWrap.className = "sleight-ritual-cards";
  ritualPickWatchCardEls = order.map((tokenId) => {
    const token = tokensById.get(tokenId);
    const cardId = token?.cardId ?? getGateInvasionStolenCardId(tokenId) ?? null;
    const cardEl = document.createElement("div");
    cardEl.className = "sleight-ritual-card";
    cardEl.dataset.tokenId = tokenId;
    // 自分の手札（cardId判明）はテキスト合成、非公開(null)は裏面画像。
    showCardFace(cardEl, cardId, cardId ? getCardImagePath(cardId) : getCardBackImagePath(null));
    cardsWrap.appendChild(cardEl);
    return cardEl;
  });
  ritualPickWatchModal.appendChild(cardsWrap);
  document.body.appendChild(ritualPickWatchBackdrop);
  document.body.appendChild(ritualPickWatchModal);
}
// ゲート侵攻の儀式用: 複数枚の「奪われたカード」を一括で強調表示してから閉じる
// （スリカエの1枚版 revealRitualPickWatchResult の複数版）。
function revealRitualPickWatchResultMulti(tokenIds) {
  if (!ritualPickWatchModal) return;
  ritualPickWatchResolved = true;
  const stolenSet = new Set(tokenIds || []);
  if (ritualPickWatchTitleEl) ritualPickWatchTitleEl.textContent = "これらのカードが奪われました！";
  for (const el of ritualPickWatchCardEls) {
    const isPicked = stolenSet.has(el.dataset.tokenId);
    el.classList.remove("is-hovered");
    el.classList.toggle("is-stolen-reveal", isPicked);
    el.classList.toggle("is-not-picked", !isPicked);
  }
  clearTimeout(ritualPickWatchRevealTimer);
  ritualPickWatchRevealTimer = setTimeout(() => closeRitualPickWatch(), 2200);
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
onRitualPickStartedEvents(({ targetPlayer, order, title }) => {
  if (getSelfSeat() !== targetPlayer) return;
  openRitualPickWatch(order, { title });
});
onRitualPickHoverEvents(({ targetPlayer, index }) => {
  if (getSelfSeat() !== targetPlayer) return;
  if (ritualPickWatchResolved) return;
  for (const el of ritualPickWatchCardEls) el.classList.remove("is-hovered");
  ritualPickWatchCardEls[index]?.classList.add("is-hovered");
});
onRitualPickEndedEvents(({ targetPlayer, pickedTokenId, pickedTokenIds }) => {
  if (getSelfSeat() !== targetPlayer) return;
  if (pickedTokenIds?.length) {
    revealRitualPickWatchResultMulti(pickedTokenIds);
  } else if (pickedTokenId) {
    revealRitualPickWatchResult(pickedTokenId);
  } else {
    closeRitualPickWatch();
  }
  // ゲート侵攻の奪取儀式が本当に終わった合図。奪われる側で待っているモーダルキューを、
  // 奪われたカードを少し見せてから進める（closeRitualPickWatchでは解除しない。上の注意参照）。
  if (gateInvasionStealWatchResolve) {
    const delay = pickedTokenIds?.length ? 2300 : 200;
    setTimeout(() => {
      if (gateInvasionStealWatchResolve) {
        const r = gateInvasionStealWatchResolve;
        gateInvasionStealWatchResolve = null;
        r();
      }
    }, delay);
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
onHandEffectUseEvents(({ fromPlayer, cardId, optionLabel, mode, costCardId }) => {
  if (fromPlayer === getSelfSeat()) return;
  // 続き218: 相手の手札使用も、Canvas霧散演出→右の使用モーダルで見せる。追色使用(mode:v5)は
  // 追色カードの吸い込みも見せる（受信側は正確な手札位置が無いのでカード左下から吸い込む既定）。
  if (mode === "v5" && costCardId) playHandEffectUseV5(cardId, optionLabel, costCardId, null);
  else playHandEffectUseV4(cardId, optionLabel);
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
// 試練の儀式「踏んだカード」の中央じらしフリップ演出を、実行者以外の全プレイヤーにも再生する
// （ユーザー要望2026-08-08。踏んだカードは公開情報。本人はannounceSteppedCardForEffect内で
// ローカル再生済みなので、ここでは自分以外からの通知だけを再生する）。
onSteppedCardRevealEvents(({ fromPlayer, cardId, labelText }) => {
  if (fromPlayer === getSelfSeat()) return;
  playCenterCardFlipReveal(cardId, { labelText: labelText || "踏んだ" });
});
// 不具合#43: マスチェンジの入れ替え電撃演出を、実行者以外の全プレイヤーでも再生する。
// （実行者はswapPiecesForEffect内でローカル再生済み。受信側は入れ替え前の元位置間にアークを描く。）
onMassChangeSwapEvents(({ fromPlayer, pieceAId, pieceBId }) => {
  if (fromPlayer === getSelfSeat()) return; // 実行者本人はローカル再生済み
  playMassChangeArcForRemote(pieceAId, pieceBId);
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
  // スリカエは交換なので、奪ったカードの中央表示ラベルは「受け取った」にする（ゲート侵攻の
  // 一方的な奪取は既定の「奪った」）。requestOpponentHandRitualPick 側で theirCard を中央に見せる。
  // 不具合#44: 奪う札は「中央で見せる前」に自分の手札へ移す（onPickedBeforeReveal）。オンラインでは
  // 相手の手札の中身(cardId)がRLSで隠れており、移す前だと reveal が null.webp になるため、移動後に
  // 中身が判明した状態で見せる。移動はここで済むので、後段の重複した moveAndSync は行わない。
  const theirCard = await requestOpponentHandRitualPick(
    targetPlayer,
    `${getPlayerName(targetPlayer)}の手札（裏向き）から1枚選んでください`,
    undefined,
    { takes: "受け取った", loses: "渡した" },
    { onPickedBeforeReveal: async (token) => moveAndSyncForEffect(token.id, { zone: "hand", player }) }
  );
  if (!theirCard) return;
  // #132: 奪う処理（onPickedBeforeReveal内のmoveAndSyncForEffect）は、オンラインで
  // MOVE_TOKENが送信失敗（FunctionsFetchError等）した場合でも moveAndSyncForEffect が
  // エラーを握りつぶす（console.errorのみ）ため、theirCard は非nullで返ってしまう。
  // そのまま「渡す」へ進むと「奪えていないのに渡すだけ」になる（ユーザー報告: スリカエで
  // 相手から奪えず渡しただけに終わった）。ここで実際の状態を確認し、奪ったカードが自分の
  // 手札に来ていなければ交換を中止する（渡す処理へ進まない）。ローカルモードは moveToken が
  // 同期・失敗しないため常に true。
  const stolen = getState().tokens.find((t) => t.id === theirCard.id);
  const stealSucceeded = !!stolen && stolen.location.zone === "hand" && stolen.location.player === player;
  if (!stealSucceeded) {
    announceEffectReasonForEffect(
      "yellow-sleight-of-hand",
      "通信エラーで相手の手札を奪えなかったため、交換を中止しました。もう一度お試しください。"
    );
    return;
  }
  // 賢いCPUが渡す側の時は、渡す札を賢く選ぶ（ユーザー要望2026-08-08「未ロック＝まだ要る色は
  // なるべく渡さない」。自分の要る色・相手の要る色・貴重札を避け、双方ロック済みの色を優先）。
  // それ以外（人間・オンライン離脱代行）は従来どおり対話ピッカーで選ぶ。
  let myCard;
  if (isCpuBrainDriving(player)) {
    const handIds = getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player)
      .map((t) => t.id);
    const giveId = chooseSwapGiveCard(handIds, player, targetPlayer);
    myCard = getState().tokens.find((t) => t.id === giveId) || null;
  } else {
    myCard = await requestHandCardChoiceForEffect(player, "相手に渡すカードを手札から選択してください");
  }
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
    // オンライン: 受け取る相手(targetPlayer)本人の画面に、その相手が受け取ったカードを見せる。
    broadcastCardReceived({ targetPlayer, cardId: myCard.cardId, subtitle });
  } else {
    // ローカル（CPU戦・ホットシート）は1画面共有で、見ているのは常に自分。myCardは
    // player(実行者)→targetPlayerへ渡るので、自分視点でラベルを出し分ける（ユーザー報告
    // 2026-08-07: CPUが自分にスリカエした時、自分が受け取ったのに「渡した」と出て逆で紛らわしい）。
    const self = getSelfSeat();
    if (targetPlayer === self) {
      // 自分が受け取る（相手が自分に渡した）。
      showCardReceivedModal(myCard.cardId, `${getPlayerName(player)}から受け取りました`, { labelText: "受け取った" });
    } else {
      // 自分（または実行者）が相手へ渡す。
      showCardReceivedModal(myCard.cardId, `${getPlayerName(targetPlayer)}に渡しました`, { labelText: "渡した" });
    }
  }
  render();
}

// ゲート侵攻ボーナス①「手札を半分奪う」専用。defenderの裏向きの手札からcount枚を
// 儀式的に選ぶ（requestOpponentHandRitualPickをcount回連続で呼ぶ、excludeTokenIds
// で既に選んだ分を次回の候補から除外する）。gate-invasion.jsはローカル対戦専用
// （オンライン中は無作為抽選をサーバー側で行う設計）のため、ここも1画面共有の
// ローカル対戦だけを対象にすればよい。
// ユーザー報告#18: ゲート侵攻で「奪う札を選ぶモーダル」が「ゲート侵攻成功」の告知より先に
// 出てしまう。奪う札の選択はサーバーへNEXT_TURNを送る前（＝侵攻成功のブロードキャスト＝
// ターン後の告知キューより前）に行う必要があるため、選ぶモーダルの直前に、攻撃側本人の画面に
// だけ「ゲート侵攻成功！」の告知を先に出す。OK（または保険のタイムアウト）で閉じてから選択へ進む。
function announceGateInvasionSuccessBeforeStealPick(defender, count) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(safety);
      backdrop.remove();
      modal.remove();
      resolve();
    };
    const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10620 });
    const modal = document.createElement("div");
    modal.id = "gate-invasion-prepick-announce";
    modal.style.cssText =
      "position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(24rem, 92vw); background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(251, 191, 36, 0.5); border-radius: 0.5rem; padding: 1.3rem; z-index: 10621; font-family: sans-serif; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6); text-align: center;";
    const title = document.createElement("div");
    title.textContent = "🚩 ゲート侵攻成功！";
    title.style.cssText = "font-weight: bold; color: #fbbf24; font-size: 1.15rem; margin-bottom: 0.6rem;";
    const body = document.createElement("div");
    body.textContent = `${getPlayerName(defender)}の手札から、奪う${count}枚をこれから選びます。`;
    body.style.cssText = "font-size: 0.95rem; line-height: 1.7; margin-bottom: 1rem;";
    const okBtn = document.createElement("button");
    okBtn.type = "button";
    okBtn.textContent = "奪う札を選ぶ";
    okBtn.style.cssText =
      "padding: 0.55rem 1.6rem; background: #0891b2; border: none; border-radius: 0.35rem; color: #fff; font-weight: bold; font-size: 0.95rem; cursor: pointer;";
    okBtn.addEventListener("click", finish);
    modal.append(title, body, okBtn);
    document.body.append(backdrop, modal);
    // OKを押し忘れてもターン終了処理が詰まらないよう、一定時間で自動的に選択へ進める保険。
    const safety = setTimeout(finish, 10000);
  });
}

// ゲート侵攻の複数枚奪取用（ユーザー要望2026-08-13「複数枚奪える時は1枚ずつでなく一度に
// 複数選択したい」）。requestOpponentHandRitualPick（単発）を複数選択に拡張した版。相手の
// 裏向き手札をシャッフル演出後に表示し、必要枚数だけタップで選ぶ→確定でまとめて解決する。
// 「奪ったカードの確認」は呼び出し側(gate-invasion.js)の announceHandPickups が全枚数を1つの
// トーストにまとめて表示するので、ここでは1枚ずつの「奪った」中央モーダルは出さない
// （＝ユーザー要望「確認も複数枚同時に1つのモーダルで」を満たす）。オンラインは開始/終了だけ
// 実況し（1枚ずつのライブホバーは複数選択では煩雑なので省略）、結果はサーバー同期に委ねる。
function requestOpponentHandRitualMultiPick(targetPlayer, count) {
  return new Promise((resolve) => {
    const theirHand = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === targetPlayer
    );
    if (theirHand.length === 0) {
      resolve([]);
      return;
    }
    const need = Math.min(count, theirHand.length);
    const shuffled = [...theirHand].sort(() => Math.random() - 0.5);
    const isRitualBroadcastTarget = isOnlineMode() && targetPlayer !== getSelfSeat();
    if (isRitualBroadcastTarget) broadcastRitualPickStarted({ targetPlayer, order: shuffled.map((t) => t.id) });

    let settled = false;
    const finish = (tokens) => {
      if (settled) return;
      settled = true;
      activeEffectPicker = null;
      backdrop.remove();
      modal.remove();
      if (isRitualBroadcastTarget) broadcastRitualPickEnded({ targetPlayer, pickedTokenId: null });
      resolve(tokens);
    };

    // 背景タップでは閉じない（必ず選ぶ必須処理。単発版と同じ方針）。放置時はタイムアウトで無作為。
    const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10620 });
    const modal = document.createElement("div");
    modal.id = "sleight-ritual-modal";
    modal.classList.add("is-multi-pick");
    const title = document.createElement("div");
    title.className = "sleight-ritual-title";
    title.textContent = "シャッフル中…";
    modal.appendChild(title);
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "sleight-ritual-cards";
    const n = shuffled.length;
    const selected = new Set(); // tokenId
    const confirmBtn = document.createElement("button");
    confirmBtn.id = "sleight-ritual-multi-confirm";
    confirmBtn.type = "button";
    confirmBtn.className = "contact-approval-approve";
    const updateUi = () => {
      title.textContent = `奪うカードを${need}枚選んでください（${selected.size}/${need}）`;
      confirmBtn.textContent = `✅ 決定（${selected.size}/${need}枚）`;
      confirmBtn.disabled = selected.size !== need;
    };
    shuffled.forEach((token, index) => {
      const cardEl = document.createElement("div");
      cardEl.className = "sleight-ritual-card";
      cardEl.style.backgroundImage = `url("${cardBackImageForToken(token)}")`;
      cardEl.style.setProperty("--shuffle-x", `${((n - 1) / 2 - index) * 1.1}rem`);
      cardEl.style.setProperty("--shuffle-rot", `${index % 2 === 0 ? 9 : -9}deg`);
      cardEl.style.animationDelay = `${(index % 4) * 0.06}s`;
      cardEl.addEventListener("click", () => {
        if (modal.classList.contains("is-shuffling")) return; // 演出中は不可
        if (selected.has(token.id)) {
          selected.delete(token.id);
          cardEl.classList.remove("is-selected");
        } else {
          if (selected.size >= need) return; // 必要枚数まで
          selected.add(token.id);
          cardEl.classList.add("is-selected");
        }
        updateUi();
      });
      cardsWrap.appendChild(cardEl);
    });
    modal.appendChild(cardsWrap);
    confirmBtn.addEventListener("click", () => {
      if (selected.size !== need) return;
      finish(shuffled.filter((t) => selected.has(t.id)));
    });
    modal.appendChild(confirmBtn);

    // タイムアウト自動解決（opponentHandMulti）: need枚を無作為に選んで確定。
    activeEffectPicker = {
      type: "opponentHandMulti",
      tokens: shuffled,
      count: need,
      resolve: (tokens) => finish(tokens),
    };
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    if (isCpuSelectingNow()) {
      backdrop.classList.add("is-cpu-hidden");
      modal.classList.add("is-cpu-hidden");
    }
    // シャッフル演出中はクリック不可（単発版と同じ1100ms）。終わったら選択案内へ。
    modal.classList.add("is-shuffling");
    setTimeout(() => {
      if (settled) return;
      modal.classList.remove("is-shuffling");
      updateUi();
    }, 1100);
  });
}

// onPicked（省略可）: 1枚選ぶ（＋中央に「奪った」表示）ごとに呼ばれる。ローカルのゲート侵攻は
// これで「1枚ごとに実際に自分の手札へ移す」（ユーザー要望2026-08-07「複数枚奪う時、1枚ずつ
// 手札に描画。今はまとめて最後に加わる」）。オンラインは奪う札のidを集めるだけ（実際の移動は
// サーバー）なので onPicked を渡さない＝従来通りまとめて。
async function stealHandCardsRitualForGateInvasion(defender, count, onPicked) {
  // 2枚以上奪う時は複数選択UIでまとめて選ぶ（ユーザー要望2026-08-13。マイ異数が多いと1枚ずつは
  // 面倒）。1枚ずつの「奪った」中央モーダルは出さず、選び終えたら呼び出し側(gate-invasion.js)の
  // announceHandPickupsが全枚数を1トーストで見せる。1枚だけなら従来の単発ピック（シンプル）。
  if (count >= 2) {
    const tokens = await requestOpponentHandRitualMultiPick(defender, count);
    // ローカルは onPicked で1枚ずつ実際に手札へ移す（オンラインはidを集めるだけ＝サーバーが移す）。
    if (onPicked) {
      for (const token of tokens) await onPicked(token);
    }
    // 奪ったカードを画面中央のモーダルで、複数枚まとめて見せる（ユーザー要望2026-08-13
    // 「複数枚でも中央に奪ったカードが何かモーダルで表示したい」）。onPickedで手札へ移った後の
    // 最新cardIdを使う（ローカルは判明。オンラインは非公開でnull→getCardImagePathが裏面を返す）。
    const cardIds = tokens
      .map((t) => getState().tokens.find((x) => x.id === t.id)?.cardId ?? t.cardId ?? null)
      .filter(Boolean);
    if (cardIds.length > 0) {
      const self = getSelfSeat();
      const sub = self === defender ? "" : `${getPlayerName(defender)}から`;
      await showMultipleCardsReceivedModal(cardIds, sub, { labelText: "奪った" });
    }
    return tokens;
  }
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
    if (onPicked) await onPicked(token);
  }
  return stolen;
}

// 続き216（ユーザー要望2026-08-18）: 手札の使用が決定した時、画面中央にカードを拡大表示し、
// その色のオーラを纏いながら「燃えカス（embers）」になって崩れ消えていく演出。演出のあとに
// 右の使用モーダル（showHandEffectUseModal）が出る。カードの色→燃え色(--burn-color)を決める。
function handEffectBurnColor(cardId) {
  const c = getCardDefinition(cardId)?.color;
  if (c === "rainbow") return "#f6c945"; // 虹はグラデ不可（box-shadow/drop-shadow用の単色）→金
  if (c === "white") return "#eef2f7";
  if (c === "black") return "#8b95a3";
  if (c) return `var(--color-${c})`;
  return "#f6c945";
}
// 中央の「カード拡大→色オーラ→燃えカスになって消える」演出。ゴーストと同じdocument.body直下・
// pointer-events:none（下の盤面はクリック可能）。演出完了で解決するPromiseを返す。
function handBurnDurationSec() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--hand-burn-duration"));
  return Number.isFinite(v) && v > 0 ? v : 2.6;
}
function playHandEffectUseBurn(cardId) {
  if (isArrivalEffectDisabled()) return Promise.resolve();
  const durSec = handBurnDurationSec();
  const overlay = document.createElement("div");
  overlay.className = "hand-effect-burn-overlay";
  overlay.style.setProperty("--burn-color", handEffectBurnColor(cardId));
  const aura = document.createElement("div");
  aura.className = "hand-effect-burn-aura";
  overlay.appendChild(aura);
  const stage = document.createElement("div");
  stage.className = "hand-effect-burn-stage";
  const card = document.createElement("div");
  card.className = "hand-effect-burn-card";
  card.style.backgroundImage = `url("${getCardImagePath(cardId)}")`;
  if (getCardDefinition(cardId)?.color === "rainbow") card.classList.add("is-rainbow");
  stage.appendChild(card);
  // 燃えカス（rising embers）。カード面の各所からゆっくり立ち上って消える小さな粒。
  const embers = document.createElement("div");
  embers.className = "hand-effect-burn-embers";
  const EMBER_COUNT = 26;
  for (let i = 0; i < EMBER_COUNT; i++) {
    const e = document.createElement("i");
    // カード面(だいたい±50%)にランダム配置。燃え始め(約55%地点)以降に舞うようdelayを付ける
    // （尺--hand-burn-durationに比例。ホールドを長くしても燃えカスが燃焼フェーズに合う）。
    e.style.setProperty("--ex", `${(Math.random() * 2 - 1) * 46}%`);
    e.style.setProperty("--ey", `${(Math.random() * 2 - 1) * 50}%`);
    // 続き218（ユーザー要望「灰が右へ流れて集まりモーダルになる」）: 燃えカスは上昇ではなく
    // 右上（＝使用モーダルの方向）へ流れて集まる。中央→右の視線誘導。終点を右上のほぼ一点に
    // 寄せる（小さなばらつき）ことで“集まる”感を出す。
    e.style.setProperty("--etx", `${32 + (Math.random() * 2 - 1) * 4}rem`);
    e.style.setProperty("--ety", `${-17 + (Math.random() * 2 - 1) * 3}rem`);
    e.style.setProperty("--ers", `${0.5 + Math.random() * 1.1}`); // 粒サイズ倍率
    e.style.animationDelay = `${durSec * (0.5 + Math.random() * 0.22)}s`;
    e.style.animationDuration = `${durSec * (0.34 + Math.random() * 0.22)}s`;
    embers.appendChild(e);
  }
  stage.appendChild(embers);
  overlay.appendChild(stage);
  document.body.appendChild(overlay);
  return new Promise((resolve) => {
    // アニメーションはCSSキーフレーム（.hand-effect-burn-*）。カードの主アニメ終了で片付ける。
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      overlay.remove();
      resolve();
    };
    card.addEventListener("animationend", finish, { once: true });
    setTimeout(finish, durSec * 1000 + 700); // animationendが来ない環境用の保険（尺に追従）
  });
}
// 手札使用の演出（Canvas霧散＝card-dissolve.js。ユーザー提供のV4/V5試作を移植 2026-08-18）。
// V4（通常使用）: 使用カードがランダムに霧散し、カード色の湯気が右へ流れて、右の使用モーダルへ。
// V5（追色使用）: 追色カードが使用カードへ吸い込まれ→2回脈動＋発光→V4の霧散、の連続。
// 霧散し切る頃に右の使用モーダルを出す（onShowModal）。演出はpointer-events:noneで下の操作を
// 妨げない（続き214の方針を維持）。演出OFF時（isArrivalEffectDisabled）はモジュール側で即モーダル。
// V4（追色なし）
function playHandEffectUseV4(cardId, optionLabel) {
  playCardDissolve(cardId, { onShowModal: () => showHandEffectUseModal(cardId, optionLabel) });
}
// V5（追色あり）。costStart＝追色カードの飛び出し元（ステージ座標、省略時はカード左下）。
function playHandEffectUseV5(cardId, optionLabel, costCardId, costStart) {
  playCardDissolve(cardId, { costCardId, costStart, onShowModal: () => showHandEffectUseModal(cardId, optionLabel) });
}

// ユーザー要望「カード効果を使用するために手札から使用するカードをドロップした時は、
// 自分を含め何のカードの使用が宣言されたか全員にわかるように表示してください」。
// 自分の画面ではその場でshowHandEffectUseModalを表示しつつ、オンライン中は
// broadcastHandEffectUseで他の全プレイヤーへも同じ通知を送る（onHandEffectUseEvents
// 参照、自分自身の分は二重表示にならないよう除外している）。ローカル対戦は1画面
// 共有のため、ローカル表示だけで全員に見えている。
function announceHandEffectUseForEffect(cardId, optionLabel, player, opts) {
  // 行動ログ用（ユーザー要望「△△は〇〇の手札効果を得ました」。以前は手札効果がログに
  // 残っていなかった）。到達効果(arrival)と同じく「誰が・どのカードの手札効果を使ったか」を記録。
  logAction("hand-effect", { cardId, player: player ?? getSelfSeat() });
  // ユーザー要望（続き76）「手札効果使用宣言の直後にも割り込みモーダルを出す」。使用が
  // 決まった瞬間なので、追色あり/なしに関わらずここで（ログと合わせて）行う。
  triggerAnytimeInterruptCheckpoint(player ?? getSelfSeat());
  // V5（追色あり）は、コスト確定後に playAdditionalColorUseForEffect で「吸収→霧散」演出＋音＋
  // broadcastを出すため、ここでは視覚・音・broadcastを遅延する（deferVisual）。
  if (opts?.deferVisual) return;
  // 続き218（V4）: 中央の霧散演出→その後に右の使用モーダル。
  playHandEffectUseV4(cardId, optionLabel);
  // ユーザー要望「手札効果の使用が宣言されたときの効果音が欲しい。到達時の効果音を
  // 流用でよい」（続き62）。
  playSound("arrivalEffect");
  if (isOnlineMode()) {
    broadcastHandEffectUse({ fromPlayer: getSelfSeat(), cardId, optionLabel, mode: "v4" });
  }
}

// V5（追色あり）: 追色コスト確定後に呼ばれる（card-effect-engine.js の runHandEffectOption、
// discardAndSyncで捨てる“前”＝コスト札のDOMがまだ手札にある間に発火）。使用カードへ追色カードを
// 吸い込み→2回脈動＋発光→霧散→右の使用モーダル、の連続を出す。fire-and-forget（続き214の
// 非ブロック方針）。costStart は追色カードの手札DOM位置（ステージ座標）で、吸い込みの起点にする。
function playAdditionalColorUseForEffect(cardId, optionLabel, costTokenId) {
  const costCardId = getState().tokens.find((t) => t.id === costTokenId)?.cardId || null;
  const rect = cardElRectForToken(costTokenId);
  let costStart = null;
  if (rect) costStart = stageClientToLocal(rect.left + rect.width / 2, rect.top + rect.height / 2);
  playHandEffectUseV5(cardId, optionLabel, costCardId, costStart);
  playSound("arrivalEffect");
  if (isOnlineMode()) {
    broadcastHandEffectUse({ fromPlayer: getSelfSeat(), cardId, optionLabel, mode: "v5", costCardId });
  }
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
// CPU戦の自動スキップOFF中、CPUの番の「結果通知モーダル」をプレイヤーが読み終える（＝
// 画面をクリックする）まで止めているか。true の間だけ syncCpuStepHint が「クリックで次へ」
// の案内を出す。ユーザー要望（2026-08-07）「CPUが選ぶ時は自動で進めて、選んだ結果の通知
// モーダルで泊まるように。じゃないと自分が選ぶのかと錯覚する」。
let cpuResultHoldActive = false;
// 結果通知モーダルを、CPU戦の自動スキップOFF＋CPUの番のときはクリック待ちで表示し、
// それ以外は従来通り一定時間で自動的に消す。共通処理。
async function showAndAwaitEffectReason(cardId, text) {
  const hold =
    isCpuBattleActive() && !isOnlineMode() && !isCpuAutoSkipEnabled() && isPseudoCpuTarget(getState().turnPlayer);
  const done = showEffectReasonModal(cardId, text, { holdUntilClick: hold });
  if (hold) {
    cpuResultHoldActive = true;
    try {
      await done;
    } finally {
      cpuResultHoldActive = false;
    }
  } else {
    await wait(REASON_MODAL_TOTAL_MS);
  }
}
async function announceEffectReasonForEffect(cardId, text) {
  // ユーザー要望（続き70）「試練の儀式やザギャンブルでの結果は相手にもモーダルで
  // 教えてあげてください」。以前は実行者本人の画面にしか表示していなかった。
  // hand_effect_useと同じ「見た目だけの合図」パターンで他プレイヤーへも中継する。
  if (isOnlineMode()) {
    broadcastEffectReason({ fromPlayer: getSelfSeat(), cardId, text });
  }
  await showAndAwaitEffectReason(cardId, text);
}

// ユーザー要望2026-08-07「ザ・ギャンブルや試練の儀式で成功した時の“おめでとう”演出が
// 欲しい（案A＝紙吹雪＋大きな文字＋効果音）。ただし『おめでとう』はダサいので英語で。
// 試練は必ずハズレで終わるので、最後に『〇回成功！』を出す」。紙吹雪＋大きな見出しの
// お祝いオーバーレイ。tone:"success"は紙吹雪あり、"fail"は控えめ（残念用）。CPU戦の
// 結果ホールド（自動スキップOFF時はクリックまで表示）にも合わせる。
function showCelebrationModal(headline, sub, tone, { holdUntilClick } = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = `result-celebration tone-${tone}`;
    if (tone === "success") {
      const conf = document.createElement("div");
      conf.className = "result-celebration-confetti";
      const colors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#ec4899", "#a855f7"];
      for (let i = 0; i < 56; i++) {
        const p = document.createElement("i");
        p.style.left = Math.random() * 100 + "%";
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = Math.random() * 0.6 + "s";
        p.style.animationDuration = 1.7 + Math.random() * 1.3 + "s";
        p.style.setProperty("--drift", (Math.random() * 2 - 1) * 140 + "px");
        p.style.setProperty("--rot", Math.random() * 720 - 360 + "deg");
        conf.appendChild(p);
      }
      overlay.appendChild(conf);
    }
    const card = document.createElement("div");
    card.className = "result-celebration-card";
    const h = document.createElement("div");
    h.className = "result-celebration-headline";
    h.textContent = headline;
    card.appendChild(h);
    if (sub) {
      const s = document.createElement("div");
      s.className = "result-celebration-sub";
      s.textContent = sub;
      card.appendChild(s);
    }
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    // 既存SFX流用の祝福/残念の合図（専用ファンファーレ音源は未追加）。
    playSound(tone === "success" ? "lock" : "cardFlip");
    requestAnimationFrame(() => overlay.classList.add("show"));
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      overlay.classList.remove("show");
      setTimeout(() => overlay.remove(), 350);
      resolve();
    };
    if (holdUntilClick) {
      const onClick = () => {
        document.removeEventListener("pointerdown", onClick, true);
        finish();
      };
      // 出た瞬間の誤クリックで即閉じないよう少し待ってから受け付ける。
      setTimeout(() => document.addEventListener("pointerdown", onClick, true), 300);
    } else {
      setTimeout(finish, tone === "success" ? 2900 : 2200);
    }
  });
}

async function celebrateForEffect(cardId, { tone = "success", headline, sub } = {}) {
  // オンラインでは実行者の画面で紙吹雪を出し、相手には従来の結果テキストモーダルを中継する
  // （紙吹雪自体のブロードキャストは未対応。announceEffectReasonと同じ考え方）。
  if (isOnlineMode()) broadcastEffectReason({ fromPlayer: getSelfSeat(), cardId, text: sub || headline });
  const hold =
    isCpuBattleActive() && !isOnlineMode() && !isCpuAutoSkipEnabled() && isPseudoCpuTarget(getState().turnPlayer);
  if (hold) {
    cpuResultHoldActive = true;
    try {
      await showCelebrationModal(headline, sub, tone, { holdUntilClick: true });
    } finally {
      cpuResultHoldActive = false;
    }
  } else {
    await showCelebrationModal(headline, sub, tone, {});
  }
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

// 続き214（ユーザー報告2026-08-18「選べる罠で『手札を半分捨てる』を押した後、しばらく手札を
// クリックしても反応しない」）: 情報通知（「選べる相手が1人だけのため自動的に選択しました」等の
// 軽い案内）を“ブロックせず”に出す版。announceEffectReasonForEffectは約2.9秒awaitで待つため、
// 通知の直後に手札/マス選択が来ると、その待ち時間ずっと操作できなかった。この版はモーダルを出す
// だけで即returnし、モーダル自身の自動消去タイマー(REASON_MODAL_DURATION_MS)で自然に消える。
// CPU結果ホールド(cpuResultHoldActive)もかけない——読ませて止める必要のない軽い通知のため
// （止めるべき“結果”はannounceEffectReasonForEffectのまま）。他プレイヤーへの中継は従来通り行う。
function announceEffectNoticeForEffect(cardId, text) {
  if (isOnlineMode()) broadcastEffectReason({ fromPlayer: getSelfSeat(), cardId, text });
  showEffectReasonModal(cardId, text); // holdUntilClick=false・戻り値のPromiseは待たない
}

// ユーザー要望「効果が不発だった場合（例: マスチェンジで３マス以内に相手がいない等）は
// 『不発のためこのカードを手札に加えます』的なモーダルを出しましょう」。addsToHandは
// card-effects.jsのeffectDef.addsCardToHandAfterに対応する（false指定のカード＝
// ジャンプ台や黒の契約の烙印が不発になった場合は、このカード自身が手札には加わらない
// ため文言を分ける——盤面にそのまま残る）。announceEffectReasonForEffectと同じ理由で
// モーダル自身の全表示時間と揃えて待つ。
async function announceEffectFizzleForEffect(cardId, addsToHand) {
  await showAndAwaitEffectReason(cardId, addsToHand ? "不発のため、このカードを手札に加えます。" : "不発のため、何も起きませんでした。");
  return;
}

// 試練の儀式で「踏んだ（隣に置いて移動した）カード」が何かを画面中央に大きく見せて周知する
// （ユーザー要望2026-08-07「試練の儀式で何を踏んだか画面中央に出して知らしめたい」）。
// 中央カード“じらしフリップ”公開演出を、オンラインでは全プレイヤーに配信して再生する共通ヘルパー
// （ユーザー要望2026-08-08「他のカード効果の演出も同様に相手にも見せて」）。試練で踏んだカード・
// ギャンブルの公開カードなど、いずれも公開情報。実行者はローカルでも再生（awaitで待てる）、他
// クライアントは受信側で同じ演出を再生する（stepped_card_revealブロードキャスト）。
function revealCenterCardForAll(cardId, labelText) {
  if (isOnlineMode()) broadcastSteppedCardReveal({ fromPlayer: getSelfSeat(), cardId, labelText });
  return playCenterCardFlipReveal(cardId, { labelText });
}
// showCardReceivedModal（awaitable）を「踏んだ」ラベルで流用する。
function announceSteppedCardForEffect(cardId) {
  return revealCenterCardForAll(cardId, "踏んだ");
}

// プレゼントの到達効果（１番少なくロックしている全員がドロー）等で、「誰が対象か」を
// 画面中央にアバターで並べて周知する。ユーザー要望2026-08-07。CPU戦の自動スキップOFFで
// CPUの番のときはクリック待ちで表示（cpuResultHoldActive）、それ以外は一定時間で自動的に閉じる。
async function announceDrawTargetsForEffect(players, title) {
  const list = (players ?? []).filter(Boolean);
  if (list.length === 0) return;
  const hold =
    isCpuBattleActive() && !isOnlineMode() && !isCpuAutoSkipEnabled() && isPseudoCpuTarget(getState().turnPlayer);
  await new Promise((resolve) => {
    let settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      cpuResultHoldActive = false;
      backdrop.remove();
      modal.remove();
      resolve();
    }
    const backdrop = createBackdrop(finish, { dim: true, zIndex: 10640 });
    const modal = document.createElement("div");
    modal.className = "draw-targets-modal";
    const titleEl = document.createElement("div");
    titleEl.className = "draw-targets-modal-title";
    titleEl.textContent = title;
    modal.appendChild(titleEl);
    const row = document.createElement("div");
    row.className = "draw-targets-modal-avatars";
    for (const p of list) {
      const item = document.createElement("div");
      item.className = "draw-targets-modal-item";
      const avatarEl = document.createElement("div");
      avatarEl.className = "draw-targets-modal-avatar";
      applyAvatarContent(avatarEl, getPlayerAvatar(p));
      const nameEl = document.createElement("div");
      nameEl.className = "draw-targets-modal-name";
      nameEl.textContent = getPlayerName(p);
      item.appendChild(avatarEl);
      item.appendChild(nameEl);
      row.appendChild(item);
    }
    modal.appendChild(row);
    modal.appendChild(createModalCloseX(finish));
    modal.addEventListener("click", finish);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("show"));
    if (hold) cpuResultHoldActive = true;
    else setTimeout(finish, 2900);
  });
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
function pickOptionForEffect(cardId, optionsWithUsability, title) {
  // CPUが選ぶ番はこの選択肢モーダルを表示しない（自動で選ばれる。結果は別途通知）。
  const hidden = isCpuSelectingNow();
  return showHandEffectOptionPicker(
    cardId,
    optionsWithUsability,
    (resolveFn) => {
      // cardIdも持たせる（賢いCPUがカードごとに選択肢を評価するため。chooseEffectOption参照）。
      activeEffectPicker = { type: "option", options: optionsWithUsability, cardId, resolve: resolveFn };
    },
    { hidden, title } // title未指定なら既定「○○の効果を選択してください」（showHandEffectOptionPicker参照）
  ).then((option) => {
    activeEffectPicker = null;
    // 意思決定（選択肢の確定）＝行動として扱いタイマー回復（ユーザー要望2026-08-16）。
    // 選択肢モーダルは1回の確定で解決する単一決定なので、複数選択の無限回復にはならない。
    notifyPlayerDecision();
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
      // 宣言色を全員に見える化する。人間が「宣言する」を押した時だけでなく、疑似CPU/
      // タイムアウトの自動代行（performPriorityTimeoutAutoActionがpicker.resolve=finishを
      // 直接呼ぶ）でも必ず表示されるよう、確認ボタンのハンドラではなくここで行う
      // （ユーザー報告「疑似CPUが試練の儀式で何色を宣言したか分からないまま移動する」対応）。
      if (Array.isArray(result) && result.length) {
        // 行動ログ用（ユーザー要望「選択系もログに残す」）。宣言した実際の色を記録する。
        logAction("declare-colors", { player, cardId, colors: result });
        if (isOnlineMode()) broadcastColorsDeclared({ fromPlayer: player, cardId, colors: result });
        showDeclaredColorsIndicator(player, result);
        // 意思決定（色宣言の確定）＝行動として扱いタイマー回復（ユーザー要望2026-08-16）。
        // 1回の「宣言する」で確定する単一決定なので、複数選択の無限回復にはならない。
        notifyPlayerDecision();
      }
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
    // cardIdも持たせる（賢いCPUの色宣言が、ザ・ギャンブル=避ける/試練=当てる を区別するため）。
    activeEffectPicker = { type: "colors", requirement, cardId, resolve: finish };
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
    // 7色を七角形に並べる（ユーザー要望）: 緑=上・赤=左下から時計回り。COLORS は
    // [red,orange,yellow,green,blue,pink,purple]（緑=index3）。緑を上(θ=0)に置き、時計回りに
    // 51.43°ずつ進める → 赤は θ≈205.7°（左下）から時計回りに橙・黄・緑(上)・青・桃・紫。
    const R = 36; // 中心からの距離（%）
    COLORS.forEach((color, i) => {
      const theta = (i - 3) * ((2 * Math.PI) / 7); // 上(緑)を0とした時計回りの角度（rad）
      const x = 50 + R * Math.sin(theta);
      const y = 50 - R * Math.cos(theta);
      const slot = document.createElement("div");
      slot.className = "declare-colors-modal-slot";
      slot.style.left = `${x}%`;
      slot.style.top = `${y}%`;
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
      slot.appendChild(btn);
      grid.appendChild(slot);
    });
    modal.appendChild(grid);

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "declare-colors-modal-confirm";
    confirmBtn.textContent = "宣言する";
    confirmBtn.addEventListener("click", () => {
      // 宣言色の見える化（ブロードキャスト＋常駐表示）は finish() に集約したので、ここでは
      // 選択内容を渡して確定するだけ（人間・自動代行のどちらも同じ経路で必ず表示される）。
      finish([...selected]);
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
    // CPUが宣言する番はこの色宣言モーダルを表示しない（自動で宣言・解決される。人間が
    // 選ぶのかと混乱するため。結果は宣言色インジケータ／結果モーダルで別途出る）。
    if (isCpuSelectingNow()) {
      backdrop.classList.add("is-cpu-hidden");
      modal.classList.add("is-cpu-hidden");
      peekHint.classList.add("is-cpu-hidden");
    }
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

// #95: ザ・ギャンブルの公開ドロー。通常の publicDrawForEffect は「公開エリアに表向きで置いて
// 即描画」→ その後に中央じらしフリップ、の順で、フリップ前に公開エリアで見えてしまっていた。
// ここでは「①山から確定（オンラインはサーバー、ローカルはstate）だが公開エリアにはまだ描画しない
// →②中央じらしフリップで公開→③公開エリアに表向きで描画」の順に組み替える。戻り値は
// publicDrawForEffect と同じ cardId 配列（呼び出し側の宣言色一致判定はそのまま使える）。
async function publicDrawThenRevealForEffect(player, count) {
  const drawnCardIds = [];
  for (let i = 0; i < count; i++) {
    if (isOnlineMode()) {
      let cardId = null;
      try {
        // サーバーに公開ドローを確定させる（revealedCardIdは返るが、fetchAndHydrateするまで
        // このクライアントのstate/描画には反映されない＝公開エリアにはまだ出ない）。
        const result = await drawFromPile("deck", { zone: "publicDraw", player });
        cardId = result?.revealedCardId ?? null;
      } catch (err) {
        console.error("publicDrawThenRevealForEffect (online draw) failed", err);
        break;
      }
      if (!cardId) break;
      // 公開エリアに出す前に中央フリップで公開（全員に配信）。
      await revealCenterCardForAll(cardId, "ギャンブル公開");
      // state を最新化する。defer中は汎用render()が抑制されているので公開エリアにはまだ出ない
      // （最後に endPublicDrawDefer でまとめて描画する）。defer外なら従来どおりこの時点で出る。
      try {
        await fetchAndHydrate(getCurrentGameId());
      } catch (err) {
        console.error("publicDrawThenRevealForEffect (hydrate) failed", err);
      }
      drawnCardIds.push(cardId);
    } else {
      const pileArray = getState().piles.deck;
      if (pileArray.length === 0) break;
      const cardId = pileArray[pileArray.length - 1];
      // まだ山にあるうちに中央フリップで公開してから、公開エリアへ移す。
      await revealCenterCardForAll(cardId, "ギャンブル公開");
      drawFromPile("deck", { zone: "publicDraw", player });
      // defer中は描画しない（最後にまとめて）。defer外なら従来どおり即描画。
      if (!publicDrawDeferActive) render();
      drawnCardIds.push(cardId);
    }
  }
  // defer中は通知・描画を endPublicDrawDefer 側でまとめて行うので、ここでは何もしない
  // （＝じらしフリップが全部終わってから公開エリアに一斉に並ぶ。ユーザー要望2026-08-14）。
  if (!publicDrawDeferActive) {
    if (drawnCardIds.length > 0) {
      playSound("cardDraw");
      announceHandPickups(player, drawnCardIds.map((cardId) => ({ cardId, wasPublic: true })));
    }
    render();
  }
  return drawnCardIds;
}

// #95改: ザ・ギャンブルの公開ドロー中は「公開エリアへの描画」を全部の公開演出が終わるまで
// 遅延させる（ユーザー要望「全員にフリップで見せて、公開エリアへは演出が全部終わった後に並べる」）。
// begin で汎用render()を抑制（suppressGenericRenderForDrawFlight を流用）、end でまとめて描画する。
let publicDrawDeferActive = false;
let publicDrawDeferPrevSuppress = false;
function beginPublicDrawDeferForEffect() {
  publicDrawDeferActive = true;
  publicDrawDeferPrevSuppress = suppressGenericRenderForDrawFlight;
  suppressGenericRenderForDrawFlight = true;
}
function endPublicDrawDeferForEffect(player, revealedCardIds) {
  publicDrawDeferActive = false;
  suppressGenericRenderForDrawFlight = publicDrawDeferPrevSuppress;
  if (revealedCardIds && revealedCardIds.length > 0) {
    playSound("cardDraw");
    announceHandPickups(player, revealedCardIds.map((cardId) => ({ cardId, wasPublic: true })));
  }
  render(); // ここで初めて、公開したカードを公開エリアに一斉に並べる。
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
  const deckRect = location?.zone === "cell" ? deckStackRect() : null; // 着地演出の飛び元（山札）
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
  await playDeckToCellLanding(deckRect, location); // ③演出(#147): 試練の儀式(表向き)の山→マス配置（続き212: 完了まで待つ）
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
    // CPUが選ぶ番は「どこから置きますか？」モーダルを表示しない（自動で選ばれる）。
    if (isCpuSelectingNow()) {
      backdrop.classList.add("is-cpu-hidden");
      modal.classList.add("is-cpu-hidden");
    }
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

  // 【CPU強化 2026-08-08】賢いCPUは「置く効果」を目的的に使う。移動は“カードがあるマス”にしか
  // 行けない（card-effect-engine.js getMoveCandidates）ため:
  // ・相手ゲートが空きなら、そこへ山札から置いて「自分が侵攻するための足場」を作るのが最も有効。
  //   足場が無ければ空ゲートには着地できず＝侵攻できないため。相手ゲートに近い空きマスほど
  //   侵攻ルートの前進になる。
  // ・自分のゲートには置かない。空の自ゲートは着地不能で既に安全なのに、置くと相手に着地の
  //   足場を与えてしまう（自滅）。
  // ・山札から置く（手札を温存）。
  if (isCpuBrainDriving(player)) {
    const active = getState().activePlayers ?? [];
    const oppGates = [];
    for (const [side, pos] of Object.entries(GATE_POSITIONS)) {
      const owner = SIDE_TO_SEAT[side];
      if (owner && owner !== player && active.includes(owner)) oppGates.push({ row: pos.row, col: pos.col });
    }
    const myGatePos = GATE_POSITIONS[SEAT_TO_SIDE[player]];
    const isMyGate = (c) => myGatePos && c.row === myGatePos.row && c.col === myGatePos.col;
    const safe = emptyCells.filter((c) => !isMyGate(c));
    const pool = safe.length > 0 ? safe : emptyCells; // 万一自ゲートしか無ければやむを得ずそこ
    let dest;
    if (oppGates.length > 0) {
      // 相手ゲートに最も近い空きマス（相手ゲートそのものが空きなら距離0で最優先＝侵攻の足場）。
      const minDist = (c) => oppGates.reduce((m, g) => Math.min(m, Math.abs(g.row - c.row) + Math.abs(g.col - c.col)), Infinity);
      let best = Infinity;
      const scored = pool.map((c) => { const d = minDist(c); if (d < best) best = d; return { c, d }; });
      const closest = scored.filter((x) => x.d <= best).map((x) => x.c);
      dest = closest[Math.floor(Math.random() * closest.length)];
    } else {
      dest = pool[Math.floor(Math.random() * pool.length)];
    }
    await placeFromDeckForEffect({ zone: "cell", row: dest.row, col: dest.col });
    await announceEffectChoiceForEffect("green-joint-construction", player, "山札から１枚を裏向きで置く");
    return true;
  }
  // ユーザー指摘「『空いてるマス』ではなく『何もないマス』」——getEmptyCellCandidatesForEffect
  // 自体は元々「カードも駒も無いマス」を正しく候補にしていたが、案内文の言葉遣いだけ
  // 「空いている」になっていた。docs/cards.mdの表記に合わせて「何もない」に統一する。
  const dest = await requestCellChoiceForEffect(emptyCells, "何もないマスを選択してください");
  if (!dest) return false;
  // ユーザー要望2026-08-07: 手札（公開ドロー含む）が無い時は「山札から/手札から」を聞いても
  // 「手札から」は選べず無意味なので、その選択を出さず自動で山札から置き、「手札がないため
  // 山札から置きました」と全員に周知する（choose-effect-reveal方針に合わせ同じ告知モーダルを流用）。
  const handTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.player === player && (t.location.zone === "hand" || t.location.zone === "publicDraw")
  );
  if (handTokens.length === 0) {
    await placeFromDeckForEffect({ zone: "cell", row: dest.row, col: dest.col });
    await announceEffectChoiceForEffect("green-joint-construction", player, "手札がないため山札から置く");
    return true;
  }
  const source = await requestPlaceSourceChoiceForEffect();
  if (!source) return false;
  if (source === "hand") {
    const handToken = await requestHandCardChoiceForEffect(player, "そのマスに置くカードを手札から選択してください");
    if (!handToken) return false;
    await moveAndSyncForEffect(handToken.id, { zone: "cell", row: dest.row, col: dest.col });
    // ユーザー要望「合同建設で相手が山札から置いたのか手札から置いたのかを全員に周知」。
    await announceEffectChoiceForEffect("green-joint-construction", player, "手札から１枚を裏向きで置く");
  } else {
    await placeFromDeckForEffect({ zone: "cell", row: dest.row, col: dest.col });
    await announceEffectChoiceForEffect("green-joint-construction", player, "山札から１枚を裏向きで置く");
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
  // ルール上、到達中のパーティーカード自身も「場の任意の1枚」として手札に加えてよい
  // （ユーザー確認済み）。既定の add-to-hand 側（card-effect-engine.jsのrunArrivalEffect）が
  // 「そのカードがまだ盤面に残っている場合だけ」動かすので、別プレイヤーがパーティー自身を
  // 取っても手番プレイヤーが奪い返さない。よってここでは何も除外しない。
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
  // ユーザー要望2026-08-08「選択してからマスがハイライトされるまでの間が長い。『○○を選択
  // しました』モーダル中にすぐハイライトされていてもOK」。告知は待たずに走らせ（announced）、
  // すぐ下のマス選択（ハイライト）へ進む。ペーシング/CPU結果ホールドを保つため、最後に告知の
  // 完了をawaitしてから返す。
  const announced = announceEffectChoiceForEffect("pink-party", player, chosen.label);
  const result = await (async () => {
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
    onEffectCardAcquiredToHand(token.id, token.cardId, wasFaceUp, player);
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
  })();
  await announced;
  return result;
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
    // ローカルのCPU戦（#23）: 委任先が自分以外（＝CPU、疑似CPU対象）なら、人間が相手の選択を
    // 代行しなくて済むよう、その席へ一時的に優先権を移して疑似CPUに自動解決させる。優先権を
    // 移すとその席の基本時間は疑似CPUの短い持ち時間になり、選択ピッカーが時間切れで自動解決
    // される（performPriorityTimeoutAutoAction）。終わったら手番プレイヤーへ優先権を戻す。
    // 通常のローカル対戦（疑似CPU非対象）では従来通り、その場（人間）が解決する。
    if (!isOnlineMode() && player !== getSelfSeat() && isPseudoCpuTarget(player)) {
      const turnPlayer = getState().turnPlayer;
      transferPriorityTo(player);
      try {
        return await runDelegatedArrivalTask(player, taskType);
      } finally {
        transferPriorityTo(turnPlayer);
      }
    }
    // #27/#28: CPU戦でCPUの番に、自分（人間）へ委任された選択（パーティ・スラム上がりの役人等）が、
    // CPUの短い持ち時間の時間切れで疑似CPU（performPriorityTimeoutAutoAction）に勝手に解決されて
    // しまう問題への対応。自分への委任中は優先権を自分へ移し（＝人間の長い基本時間になり時間切れ
    // しない）、人間が選び終えてから手番プレイヤー（CPU）へ優先権を戻す。通常のローカル対戦
    // （CPU戦でない）では従来通り、その場で人間が解決する（優先権は動かさない）。
    if (!isOnlineMode() && isCpuBattleActive() && player === getSelfSeat() && getState().turnPlayer !== getSelfSeat()) {
      const turnPlayer = getState().turnPlayer;
      transferPriorityTo(player);
      try {
        return await runDelegatedArrivalTask(player, taskType);
      } finally {
        transferPriorityTo(turnPlayer);
      }
    }
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
    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      unregister();
      clearInterval(retryTimer);
      clearTimeout(giveUpTimer);
      resolve(val);
    };
    const unregister = onArrivalDelegateResolvedEvents((payload) => {
      if (payload.requestId !== requestId) return;
      finish(payload.result);
    });
    // 取りこぼし対策（#4）: 応答が来るまで数秒おきにリクエストを再送する。受け手側は
    // 同じrequestIdなら再実行せず結果を送り返すので二重実行にはならない。
    const retryTimer = setInterval(() => broadcastArrivalDelegateRequest({ player, taskType, requestId }), 5000);
    // それでも一定時間応答が無ければ諦めて先へ進む（永久固着を防ぐ善処の原則。実際には
    // ここまで待つ前に再送で復帰するはず）。
    const giveUpTimer = setTimeout(() => finish(false), 90000);
  });
  hideEffectPickerHint();
  logAction("diag-delegate", { phase: "resolved", player, taskType, result, returningPriorityTo: turnPlayer });
  transferPriorityTo(turnPlayer);
  return result;
}
// 受け手側: 自分宛ての委任リクエストが届いたら、このクライアント（＝対象プレイヤー
// 本人の画面）で実際に解決し、結果を送り返す。
// 委任リクエストの重複対策（ユーザー不具合報告#4「パーティで優先権が戻らない」の対策）。
// realtimeのブロードキャストは取りこぼされることがある（コンソールに「Realtime send()が
// RESTへフォールバック」の警告あり）。コーディネーター側は応答が来るまでリクエストを
// 再送するため、受け手側は同じrequestIdを二重に実行しないよう、状態を覚えておく:
//  ・"pending": 実行中の再送 → 無視（もう一度選ばせない）
//  ・結果あり: 完了済みの再送 → タスクを再実行せず、覚えている結果だけ送り返す
const processedDelegations = new Map(); // requestId -> result | "pending"
onArrivalDelegateRequestEvents(({ player, taskType, requestId }) => {
  if (getSelfSeat() !== player) return;
  const cached = processedDelegations.get(requestId);
  if (cached === "pending") return;
  if (cached !== undefined) {
    broadcastArrivalDelegateResolved({ requestId, result: cached });
    return;
  }
  processedDelegations.set(requestId, "pending");
  runDelegatedArrivalTask(player, taskType)
    .then((result) => {
      processedDelegations.set(requestId, result);
      broadcastArrivalDelegateResolved({ requestId, result });
    })
    .catch((err) => {
      console.error("runDelegatedArrivalTask failed", err);
      processedDelegations.set(requestId, false);
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
  // CPUが選択中は候補ハイライトを貼り直さない（人間に「選べる」ように見せない。混乱防止）。
  if (isCpuSelectingNow()) return;
  if (activeEffectPicker.type === "cell") {
    for (const loc of activeEffectPicker.candidates) {
      const el = findLocationElement(table, loc);
      if (el) el.classList.add("card-effect-target-cell");
    }
  } else if (activeEffectPicker.type === "hand") {
    for (const tokenId of activeEffectPicker.tokenIds) {
      const el = document.querySelector(`.hand-card[data-token-id="${tokenId}"], .hand-reveal-card[data-token-id="${tokenId}"]`);
      if (el) {
        el.classList.add("card-effect-target-cell");
        el.classList.remove("hand-card-effect-unusable");
      }
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
    // 不具合#82: 駒の上に出る「🤝 接触する」ボタン(.card-open-prompt)は駒の中心に置かれ、
    // 右側が“隣の移動先ハイライトのマス”に重なる。このcapture:trueハンドラはボタンを無視して
    // elementsFromPoint()で下のマスを拾うため、ボタンの右側を押すと「接触」ではなく「右へ移動」
    // が発火し、しかもボタン自身のclickは奪われて反応しない（＝左端しか効かない）。プロンプト上の
    // タップはボタン本来のclickに任せる（#option-areaと同じく早期return）。
    if (e.target.closest(".card-open-prompt")) return;
    // 不具合（ユーザー報告2026-08-16、本気エイドス戦のカウンターロック「手札を1枚ロックしますか？」で
    // 再々発）: 確認モーダル(#generic-confirm-modal)のボタンが押せない。調査で判明したこと——(1)覆い被さる
    // 要素は無い（続き115の自己診断runBlockerSelfCheckが「ボタンが最前面」と判定＝diag-modal-blockedが
    // 出ない）、(2)ホバーは効く（指カーソル＋明るくなる＝pointer-eventsは届く）、(3)手札は掴める
    // （captureフェーズのpointerdownは確実に発火している）、(4)pointer captureも使っていない。
    // つまり「通常のDOM clickだけが何かに握り潰されている」状態で、続き115の“透明オーバーレイ無害化”は
    // 空振り（覆いが無いので）。真因は静的解析では特定しきれなかったが、robust策として、確実に発火する
    // captureフェーズのpointerdownでこのモーダルのボタンを直接解決する（DOM clickに一切依存しない）。
    // confirmGenericYesNoはactiveEffectPicker(type:"option", resolve:(o)=>finish(o?.id==="yes"))を
    // 登録済みなので、そのresolveへ回すだけでよい（ボタン=.contact-approval-approve/-reject）。
    {
      const confirmBtn = e.target.closest(
        "#generic-confirm-modal .contact-approval-approve, #generic-confirm-modal .contact-approval-reject"
      );
      if (confirmBtn && activeEffectPicker?.type === "option" && typeof activeEffectPicker.resolve === "function") {
        e.preventDefault();
        e.stopPropagation();
        const isYes = confirmBtn.classList.contains("contact-approval-approve");
        const picker = activeEffectPicker;
        activeEffectPicker = null;
        picker.resolve(isYes ? { id: "yes" } : { id: "no" });
        return;
      }
    }
    if (!activeEffectPicker) {
      // ユーザー要望2026-08-17「相手のアバターをクリックすると『このプレイヤーのエモートを
      // 非表示』的なボタンが出るようにしたい」。選択待ち(activeEffectPicker)中は手品師の技等の
      // アバター選択が優先されるのでこのブロック自体入らない。カード/駒/手札が手前にある場合は
      // そちらを優先（elementsFromPointの手前から見て、先にそれらに当たったらアバター扱いしない）。
      {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of els) {
          if (el.closest(".hand-card, .hand-reveal-card, .board-card, .piece, .card-open-prompt, .stack, #option-area")) break;
          const av = el.closest(".player-avatar");
          if (av) {
            const p = av.dataset.player;
            if (p && p !== getSelfSeat() && getState().activePlayers.includes(p)) {
              e.preventDefault();
              e.stopPropagation();
              openEmoteMuteMenu(av, p, getPlayerName(p));
            }
            break;
          }
        }
      }
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
      // ハンドフェイズ: ロックされていても使えるカード（ファースト/エターナル、光っている
      // is-usable-while-locked）を自分がクリックしたら効果の使用フローへ。ドラッグ制限中でも
      // 掴めない盤面/ロックカードを使えるようにするため、掴む→放す経路ではなくここで割り込む。
      // ロックされていても使えるカード（ファースト/エターナル、is-usable-while-locked）を
      // 自分がクリックした時。ハンドフェイズなら使用フローへ。それ以外のタイミング（相手の
      // ターン等）では「何も起きない」と誤解されないよう、いつ使えるかを軽く案内する
      // （ユーザー報告「ファーストカードをクリックしても何も起きない」）。上にエターナルが
      // 重なっていても、tryUseLockedUsableCardがそのスロットの全カードから使えるものを
      // 選ばせる（2枚以上ならピッカー）ため、下のファーストも選べる。
      {
        const elements = document.elementsFromPoint(e.clientX, e.clientY);
        for (const el of elements) {
          const cardEl = el.closest(".board-card.is-usable-while-locked");
          if (!cardEl) continue;
          const tok = getState().tokens.find((t) => t.id === cardEl.dataset.tokenId);
          if (tok && tok.location.zone === "lock" && SIDE_TO_SEAT[tok.location.side] === getSelfSeat()) {
            e.preventDefault();
            e.stopPropagation();
            if (isHandPhaseActive()) {
              void tryUseLockedUsableCard(cardEl.dataset.tokenId);
            } else {
              showQuickNote("このカードの効果は、あなたのハンドフェイズ（自分のターン）に使えます。");
            }
            return;
          }
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
          } else if (picker.alertCells?.some((c) => c.row === row && c.col === col)) {
            // 既に選択済みのマス（別々のマスに置く効果）を再度クリックした → 注意する。
            alert(picker.alertMessage || "そのマスは選べません。");
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
        // ユーザー要望2026-08-08: 盤面拡大でロックエリアが画面外の時、ミニロックエリアの
        // スロットからも「捨てる/奪うロックカード」を選べるようにする（updateMiniLockAreaが
        // 候補スロットに data-side/data-index と .is-pick-target を付与している）。
        const miniLockSlotEl = el.closest(".mini-lock-slot.is-pick-target");
        if (miniLockSlotEl) {
          const side = miniLockSlotEl.dataset.side;
          const index = Number(miniLockSlotEl.dataset.index);
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
          const token = getState().tokens.find((t) => t.id === cardEl.dataset.tokenId);
          // 選べる候補が1枚しかない時は選択間違いの余地が無いので確認モーダルを出さず即確定する
          // （ユーザー要望2026-08-14）。tokenIdsは実際に選べる候補の集合（追色コスト等で絞られている
          // 場合はその枚数）なので、手札が1枚の時だけでなく「有効候補が1枚」の時も素通しになる。
          if (picker.tokenIds.size <= 1) {
            activeEffectPicker = null;
            picker.resolve(token ?? null);
            return;
          }
          // 自分の手札からカードを選ぶ確定操作にも、ロック/手札使用と同じ確認モーダルを挟む
          // （ユーザー要望2026-08-13。追色コスト・収穫と種まき等の手札選択が対象）。設定
          // (isActionConfirmEnabled)がOFFなら confirmTouchAction は即trueを返すので実質素通り。
          // 確認が閉じるまで activeEffectPicker は残す＝拒否したら選び直せる／候補ハイライトも保持。
          confirmTouchAction(picker.confirmTitle ?? "このカードを選びますか？", { cardId: token?.cardId }).then((ok) => {
            if (!ok) return; // いいえ＝ピッカー維持、選び直せる
            if (activeEffectPicker !== picker) return; // 念のため（待機中に状況が変わった場合）
            activeEffectPicker = null;
            picker.resolve(token ?? null);
          });
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
async function performPhaseMoveToCell(location, actingSeat = getSelfSeat()) {
  // actingSeat: 通常は自分の席。ローカルCPU戦では自動処理がCPU(C)の席を渡してくる。
  const player = actingSeat;
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === player);
  if (!piece) return;
  // ユーザー要望（続き77）「移動もロックも宣言と処理を分けてください」。実際に状態を
  // 動かす直前を「移動宣言」の瞬間とみなして発火する（処理側は下のtriggerCardArrival
  // 完了後、既存の通り）。
  fireAnytimeCheckpoint(player);
  // ユーザー報告#6: 移動確定〜到達開始の空白に自動ターン終了が割り込むのを防ぐガード
  // （beginPostMoveArrivalGuard参照）。着地先のカードがオンライン再同期を挟んで
  // triggerCardArrivalに至るまでの間、到達処理中扱いにしておく。finallyで必ず解除する。
  beginPostMoveArrivalGuard();
  try {
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
    // triggerCardArrivalは自動処理カードなら同期的にarrivalEffectProcessingDepthを上げる
    // ため、この直後のfinallyでガードを外しても到達処理の保持は途切れない。
    if (freshCard) triggerCardArrival(freshCard.cardId, location, () => fireAnytimeCheckpoint(player));
    else fireAnytimeCheckpoint(player);
  } finally {
    endPostMoveArrivalGuard();
  }
}

// ロックフェイズのロック可能ハイライト（.phase-lock-highlight）をクリックした時。
// ドラッグ&ドロップでロックスロットへ動かした時（onDragEndのkind==="card"分岐、
// maybeAnnounceLock参照）と全く同じ結果になるよう、同じ関数・同じ順序（移動→
// 効果音→render()→ロック演出）で処理する。ロック先はカード自身の色に対応する
// 1つのスロットに一意に決まる（isCardLockableと同じ判定基準）。
async function performLockPhaseClick(tokenId, { skipConfirm = false, actingSeat = getSelfSeat() } = {}) {
  // actingSeat: 通常は自分の席。ローカルCPU戦では自動処理がCPU(C)の席を渡してくる。
  const player = actingSeat;
  const token = getState().tokens.find((t) => t.id === tokenId);
  if (!token || !isCardLockable(token, player)) return;
  // ユーザー報告（続き85）「スマホでロックするとき手札効果の使用時同様の
  // 『ロックしますか？』的なモーダルが出ていない。誤操作防止の観点から出して
  // ほしい」。ドラッグ&ドロップでロックスロットへ動かした時（onDragEnd参照）は
  // 既にconfirmTouchActionを挟んでいたが、ロックフェイズのハイライトを直接
  // タップするこの経路（オートモード中、スマホでは主にこちらを使うと思われる）
  // には無かった。confirmTouchAction自体がタッチ端末以外では常にtrueを即座に
  // 返すため、PC側の挙動には影響しない。
  // 疑似CPUの自動ロック（performPriorityTimeoutAutoAction）等、自動実行の経路では確認
  // モーダルを出さない。出しても押す人がおらず、そのまま停止してしまうため（ユーザー報告
  // 「疑似CPUモードの時、ロックの確認モーダルで停止しました」）。人間のクリック/タップ経路は
  // 従来通りskipConfirm=falseで確認を挟む（isActionConfirmEnabled設定に従う）。
  if (!skipConfirm && !(await confirmTouchAction(`${getCardDefinition(token.cardId).name}をロックしますか？`, { cardId: token.cardId }))) return;
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
  // #2（ユーザー要望2026-08-19「ロックするときも、手札→マスに行くときの演出を付け足したい」）:
  // 手札→ロックスロットの飛翔（着地）演出の飛び元＝移動前の手札カードのrectを捕捉しておく。
  const lockSourceRect = cardElRectForToken(tokenId);
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
  if (lockSourceRect) playCardCellLanding(lockSourceRect, dropTarget, tokenId); // #2: 手札→ロックの飛翔
  maybeAnnounceLock(dropTarget, token.cardId, false);
}

// ムーブフェイズの接触可能ハイライトをクリックした時。接触の実処理自体は既存の
// 「接触する/しない」確認プロンプトへそのままつなぐ（接触は他プレイヤーの承認が
// 絡む・DSL自動処理のスコープ外のため、ここでは宣言の入口だけを自動化する）。
function performPhaseContact(location, actingSeat = getSelfSeat()) {
  // actingSeat: 通常は自分の席。ローカルCPU戦では自動処理がCPU(C)の席を渡してくる。
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === actingSeat);
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
// 自動処理が「今どの席を代行するか」。通常は自分の席。ローカルCPU戦ではCPU(C)の番も
// 自動で流すため、その時だけ今のターンプレイヤーを対象にする（phase-automation.js側の
// getAutoDriveSeatと同じ考え方。ここでは移動・ロック・接触の実行対象席として使う）。
function getAutoDriveSeat() {
  if (isCpuBattleActive() && !isOnlineMode()) return getState().turnPlayer || getSelfSeat();
  return getSelfSeat();
}

// 「自分のハンドフェイズ」か（＝自分のターン かつ ハンドフェイズ）。不具合報告2026-08-08:
// ローカルCPU戦では phase-automation が相手(C)のターン中も currentPhase を "hand" にする
// （A/C両席を1クライアントで駆動するため）。そのため isHandPhaseActive() だけを見ていた人間の
// 手札効果トリガー（タップ/ドラッグ）が、相手のハンドフェイズ中に自分の手札をタップしただけで
// 「このカードを使用しますか？」を出してしまっていた。人間の手札効果発動は自分のターンの
// ハンドフェイズに限定する（「いつでも使える」カードは別分岐なので影響しない）。オンラインでは
// 相手ターン中は currentPhase がターン境界でリセットされ isHandPhaseActive()=false のため元々出ない。
function isSelfHandPhase() {
  return isHandPhaseActive() && getState().turnPlayer === getSelfSeat();
}

// CPU戦で「賢いCPU（cpu-brain.js）」がこの席の手を選ぶべきか。ローカルCPU戦のCPU席
// （疑似CPU対象）で、難易度が新人より上（isCpuBrainSmart）の時だけtrue。
// あわせて、AFK代行中は自分の席をオンラインでも賢いCPUで駆動する（ユーザー要望2026-08-08。
// isCpuBrainSmartは代行中はAFK用の強さを見るので、AFK難易度が新人ならランダムになる）。
function isCpuBrainDriving(seat) {
  if (isSelfCpuSubstituted() && seat === getSelfSeat()) return isCpuBrainSmart();
  return isCpuBattleActive() && !isOnlineMode() && isPseudoCpuTarget(seat) && isCpuBrainSmart();
}

export function performPriorityTimeoutAutoAction() {
  // ローカルCPU戦ではCPU(C)の番を、それ以外は自分の席を代行する。
  const driveSeat = getAutoDriveSeat();
  if (activeEffectPicker) {
    // 不具合#33: ローカルCPU戦で、CPUのターン中でも“人間”が使うリアクション選択
    // （ゴメンナサイ等）は、優先権保持者がCPU(C)のままでもCPUのものではない。owner が
    // 疑似CPU対象でない席（＝人間）なら、CPUの時間切れ自動処理で勝手にランダム解決しない
    // （人間がじっくり選べるよう、その選択には手を出さず戻る）。オンライン等は owner を
    // 持たない/自席owner なので従来通り。
    if (isCpuBattleActive() && !isOnlineMode() && activeEffectPicker.owner && !isPseudoCpuTarget(activeEffectPicker.owner)) {
      return false;
    }
    // CPUの「選ぶ」モーダル（選択肢・色宣言・マス選択等）は、自動スキップON/OFFに関わらず
    // 常にここで自動解決する。ユーザー要望（2026-08-07）「CPUが選ぶ時は自動で進めて、
    // 選んだ結果の通知モーダルで泊まるように。じゃないと自分が選ぶのかと錯覚する」——
    // 以前はOFF時にこの選択モーダル自体をクリック待ちで止めていたため錯覚の原因になって
    // いた。止めるのは結果通知モーダル側（showAndAwaitEffectReason）に移した。
    const picker = activeEffectPicker;
    activeEffectPicker = null;
    if (picker.type === "cell") {
      // 賢いCPU（中級以上）は、候補に相手ゲートがあればそこを選ぶ（ゲート侵攻セットアップ）。
      // 新人・その他はランダム（従来通り）。
      const choice = isCpuBrainDriving(driveSeat)
        ? chooseEffectCell(picker.candidates, driveSeat)
        : pickRandomFrom(picker.candidates);
      picker.resolve(choice);
    } else if (picker.type === "hand") {
      // 賢いCPU（中級以上）は用途に応じて選ぶ。purpose:"lock"（セレナーデ/カウンターロックのロック対象）は
      // 「ロックしたい札＝虹や要る色を優先」(chooseHandCardToLock)、それ以外（追色コスト等で手放す）は
      // 「手放してよい札＝ロック済みの色等」(chooseHandCardToken)。新人は従来通りランダム。
      const tokenId = isCpuBrainDriving(driveSeat)
        ? picker.purpose === "lock"
          ? chooseHandCardToLock(picker.tokenIds, driveSeat)
          : chooseHandCardToken(picker.tokenIds, driveSeat)
        : pickRandomFrom([...picker.tokenIds]);
      const token = tokenId ? getState().tokens.find((t) => t.id === tokenId) : null;
      picker.resolve(token ?? null);
    } else if (picker.type === "player") {
      // 賢いCPU（中級以上）は「最も脅威な相手＝ロック数が多いリーダー」を狙う（3-4人戦で有効。
      // 2人戦は相手1人＝どちらでも同じ）。新人は従来通りランダム（chooseTargetPlayer参照）。
      picker.resolve(
        isCpuBrainDriving(driveSeat)
          ? chooseTargetPlayer([...picker.players], driveSeat)
          : pickRandomFrom([...picker.players])
      );
    } else if (picker.type === "option") {
      // ユーザー要望（続き95）「タイムアウトで離脱者の選択をランダム/最有力候補で
      // 自動代行する」。なないろの欠片・選べる罠・ザ・ギャンブル・パーティーの選択肢
      // モーダル用。使えない選択肢（usable:false）を誤って選ばないよう、使える
      // 選択肢だけの中からランダムに1つ選ぶ（呼び出し元は必ず1つ以上usable:trueが
      // ある状態でしかこのモーダルを開かないため、ここが空になることは無い想定）。
      const usable = picker.options.filter((o) => o.usable);
      // #120: cpuAutoResolveId が指定されていれば、難易度（新人/中級/…）に関わらず必ずその選択肢に
      // する。烙印ドローの「ドローする」のように、無条件で得な（戦略的な迷いが無い）選択を、
      // 新人CPUのランダムで取りこぼさないようにするため（既定=新人だと烙印を2枚引かないことがあった）。
      const forced = picker.cpuAutoResolveId ? usable.find((o) => o.id === picker.cpuAutoResolveId) : null;
      if (forced) {
        picker.resolve(forced);
      } else if (isCpuBrainDriving(driveSeat)) {
        // 賢いCPU（中級以上）は、カードごとに選択肢を評価して選ぶ（パーティ=拾う優先/選べる罠=被害最小
        // 等。chooseEffectOption参照）。新人・未対応カードは従来通りランダム。
        picker.resolve(chooseEffectOption(picker.cardId, usable, driveSeat));
      } else {
        picker.resolve(pickRandomFrom(usable));
      }
    } else if (picker.type === "colors") {
      // ザ・ギャンブル/試練の儀式の色宣言モーダル用。「N色以上」「ちょうどN色」の
      // どちらでも、必要数ちょうどをCOLORS（７色）から重複無しで選べば両方の条件を満たす。
      const required = picker.requirement.exactCount ?? picker.requirement.minCount ?? 1;
      // 賢いCPU（中級以上）は、ギャンブル=当てない/試練=当てる を狙って色を選ぶ。新人・その他は
      // 従来通りランダム。
      if (isCpuBrainDriving(driveSeat)) {
        picker.resolve(chooseDeclaredColors(picker.cardId, required, driveSeat));
      } else {
        const pool = [...COLORS];
        const chosen = [];
        for (let i = 0; i < required && pool.length > 0; i++) {
          chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
        }
        picker.resolve(chosen);
      }
    } else if (picker.type === "opponentHand") {
      // スリカエ・接触・ゲート侵攻の奪うカード選択（requestOpponentHandRitualPick）用。
      // 中級・上級は相手の手札が見えない（非公開）ためランダム。最強のみのぞき見して一番価値の
      // 高い札を奪う（chooseOpponentHandCardToStealが最強以外はランダムを返す）。新人はランダム。
      const choice = isCpuBrainDriving(driveSeat)
        ? chooseOpponentHandCardToSteal(picker.tokens, driveSeat)
        : pickRandomFrom(picker.tokens);
      picker.resolve(choice);
    } else if (picker.type === "opponentHandMulti") {
      // ゲート侵攻の複数枚奪取（requestOpponentHandRitualMultiPick）のタイムアウト/自動解決。
      // 相手の手札は非公開のため、需要枚数(count)を無作為に選んでまとめて確定する。
      const pool = [...picker.tokens];
      const chosen = [];
      for (let i = 0; i < picker.count && pool.length > 0; i++) {
        chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
      }
      picker.resolve(chosen);
    }
    return true;
  }
  // #117/#118: 手札効果の解決中（烙印★(b)の「2枚捨て＋烙印を場へ」を含む）は、CPUの次の
  // フェイズアクション（移動・ロック）を始めない。上のpicker解決ブロックはこのgateより前に
  // あるので、解決待ちの選択（★(b)の捨て札選択・置くマス選択等）は引き続き自動代行される。
  // フェイズ自動進行(lock→hand→move)自体もphase-automation.js側でhandEffectBusyを見て止まる。
  if (isHandEffectBusy()) return false;
  const phase = getCurrentPhase();
  if (phase === "move" && isMovePhaseActive()) {
    const table = document.getElementById("game-table");
    const candidates = table
      ? [
          ...[...table.querySelectorAll(".cell.phase-move-highlight")].map((el) => ({ el, isMove: true })),
          ...[...table.querySelectorAll(".cell.phase-contact-highlight")].map((el) => ({ el, isMove: false })),
        ]
      : [];
    // 賢いCPU（中級以上）は移動先を評価して選ぶ。着地マスの一番上のカード・駒の持ち主は
    // DOM/スタック順に依存するため、ここ（main.js）で調べて cpu-brain へ渡す。それ以外の
    // 経路（新人・オンライン離脱者代行等）は従来通りランダム。
    let chosen;
    if (isCpuBrainDriving(driveSeat) && candidates.length > 0) {
      const enriched = candidates.map((c) => {
        const row = Number(c.el.dataset.row);
        const col = Number(c.el.dataset.col);
        const location = { zone: "cell", row, col };
        const top = findTopCardAt(location);
        return {
          el: c.el,
          isMove: c.isMove,
          row,
          col,
          topCardId: top?.cardId ?? null,
          topFaceUp: !!top?.faceUp,
          occupantPlayer: getPieceOwnerAt(location),
        };
      });
      chosen = chooseMoveCandidate(enriched, driveSeat) || pickRandomFrom(candidates);
    } else {
      chosen = pickRandomFrom(candidates);
    }
    if (chosen) {
      const location = { zone: "cell", row: Number(chosen.el.dataset.row), col: Number(chosen.el.dataset.col) };
      // 接触は成立時（submitContactProposal内）まで行動済みにしない。移動はここで確定。
      if (chosen.isMove) {
        markPhaseMoveActionTaken();
        performPhaseMoveToCell(location, driveSeat);
      } else performPhaseContact(location, driveSeat);
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
    const player = driveSeat;
    const isTarget = isPseudoCpuTarget(player);
    const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
    // #116: ノワール(first-noir)が“置いてある”色スロットへは、ロックフェイズで普通にロックしない
    // （その色のカードで塞ぐと、ノワールの手札効果「そのマスにロック＋1ドロー＋1移動」の得な
    // ボーナスを捨ててしまう。ハンドフェイズでノワール効果を使う方が常に得——下のline 3828〜で
    // CPUは既にそれを最優先で使う）。ノワールの置かれた色スロットを予約し、その色の手札は
    // ロックフェイズの自動ロック候補から除外する（ノワール効果側が同じスロットを埋める）。
    const noirTok = getState().tokens.find(
      (t) => t.cardId === "first-noir" && t.location.zone === "lock" && SIDE_TO_SEAT[t.location.side] === player && t.placed
    );
    const noirReservedColor = noirTok ? COLORS[noirTok.location.index] ?? null : null;
    const lockable = isTarget
      ? hand.filter((t) => isCardLockable(t, player) && getCardDefinition(t.cardId)?.color !== noirReservedColor)
      : [];
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
      // ②CPU戦を強くする（2026-08-18）: 「どの色をロックするか」は、従来ここで全難易度 random だった
      // （＝賢いCPUでもロック色が運任せ＝これが「合法手をランダムに選ぶだけ」の主因の一つ）。賢いCPU
      // （中級以上・isCpuBrainDriving）は chooseHandCardToLock で評価して選ぶ（虹＝なないろの欠片や、
      // まだ揃っていない必要な色を優先。既にpicker "hand"のpurpose:"lock"で使っている実績のある関数を
      // 流用）。新人・オンライン疑似CPUは従来通り random にフォールバック。
      let chosen = null;
      if (isCpuBrainDriving(player)) {
        const chosenId = chooseHandCardToLock(
          lockable.map((t) => t.id),
          player
        );
        chosen = chosenId ? lockable.find((t) => t.id === chosenId) : null;
      }
      if (!chosen) chosen = pickRandomFrom(lockable);
      performLockPhaseClick(chosen.id, { skipConfirm: true, actingSeat: player }); // 自動実行なので確認モーダルは出さない
      return true;
    }
    // マイデッキ戦（ローカルの本気エイドス戦）: 「ロックする代わりにマイデッキから1枚引く」。
    // CPU(疑似CPU)は、ロックできるカードが無い時だけマイデッキから引く（＝ロックできる時は
    // 7色を揃える方を優先。単純方針、後で強化余地あり）。引いた後はロックの代替なので
    // ロックフェイズを終える（人間のマイデッキボタンが drawFromMyDeck→advancePhase するのと同じ）。
    if (isTarget && lockable.length === 0 && canDrawFromMyDeck(player)) {
      drawFromMyDeckLocal(player);
      announceMyDeckDraw(player); // 行動ログ＋中央モーダルで全プレイヤーに知らせる（ユーザー要望2026-08-15）
      forceEndCurrentPhase();
      return true;
    }
  }
  // #108: エイドスのノワール(first-noir)は開始時「置いている」だけの状態（まだ正式ロックでない＝
  // 7色カウント外）。その手札効果「そのマスにロックする＋3ドロー」は常に得なので、ロックエリアに
  // ある使えるfirst-noirがあればCPUは最優先で使う。CPUの一般的な手札効果スキャン（下）は手札/公開
  // エリアしか見ずロックエリアのこのカードを拾わないため、ここで別途拾う（これをやらないと本気戦の
  // エイドスはそのスロットを永久に埋められず7色を揃えられない）。
  if (phase === "hand" && !isHandEffectBusy() && (isCpuBrainDriving(driveSeat) || isPseudoCpuTarget(driveSeat))) {
    const noir = getState().tokens.find(
      (t) =>
        t.kind === "card" &&
        t.cardId === "first-noir" &&
        t.location.zone === "lock" &&
        SIDE_TO_SEAT[t.location.side] === driveSeat &&
        canUseHandEffect(t.cardId, t.id, driveSeat)
    );
    if (noir) {
      runAutoHandEffect(noir.cardId, noir.id, driveSeat);
      return true;
    }
  }
  // ユーザー要望2026-08-08「CPUに手札効果を能動的に使わせたい」。ハンドフェイズで、賢いCPU
  // （中級以上）は明確に得な手札効果があれば使う。runAutoHandEffectは人間のクリック使用と
  // 同じ経路で、内部の選択（マス/手札/色/選択肢）は後続のtickで自動代行が解決する。使うかどうか・
  // どのカードかは canUseHandEffect（使用回数・追色コスト・自動処理設定を考慮）＋cpu-brainの
  // 評価（得な効果だけ、無ければ使わない）で決める。
  if (phase === "hand" && isCpuBrainDriving(driveSeat) && !isHandEffectBusy()) {
    const player = driveSeat;
    // 手札公開エリア(publicDraw)のカードもルール上は「手札」（getHandTokensの定義と同じ扱い、
    // ユーザー指摘2026-08-10）。CPUも公開中のカード（奇跡の森 first-greenの一時ドロー等）の
    // 手札効果を使えるようにzoneに publicDraw を含める。
    const usable = getState().tokens.filter(
      (t) =>
        t.kind === "card" &&
        (t.location.zone === "hand" || t.location.zone === "publicDraw") &&
        t.location.player === player &&
        hasHandEffectData(t.cardId) &&
        canUseHandEffect(t.cardId, t.id, player)
    );
    const chosen = chooseHandEffectCard(usable, player);
    if (chosen) {
      // fire-and-forget（内部の選択待ちは後続tickの自動代行で解決される）。
      runAutoHandEffect(chosen.cardId, chosen.id, player);
      return true;
    }
  }
  // 手札効果を解決中（まだ選択モーダルは出ていないが処理中）の間は、フェイズを終わらせずに待つ
  // （CPUが手札効果を使い始めた直後の一瞬など。上のactiveEffectPicker分岐が選択を順次解決する）。
  if (isHandEffectBusy()) return false;
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

// CPU自動スキップOFFの時に、CPUの「結果通知モーダル」がクリック待ちで止まっている間だけ
// 「クリックして次へ」の案内を出す。CPUの選ぶモーダルは自動で解決されるので案内は出さない
// （ユーザー要望2026-08-07: 選ぶ所は自動、結果通知で止める）。
let cpuStepHintEl = null;
function showCpuStepHint() {
  if (!cpuStepHintEl) {
    cpuStepHintEl = document.createElement("div");
    cpuStepHintEl.id = "cpu-step-hint";
    cpuStepHintEl.textContent = "▶ クリックして次へ";
    document.body.appendChild(cpuStepHintEl);
  }
  cpuStepHintEl.classList.add("show");
}
function hideCpuStepHint() {
  if (cpuStepHintEl) cpuStepHintEl.classList.remove("show");
}
// 案内は、CPU戦の自動スキップOFFで、CPUの番の結果通知モーダルがクリック待ちの間だけ出す
// （cpuResultHoldActive、showAndAwaitEffectReason参照）。turn-timerのtick（約200msごと）から
// 毎回呼び、CPUの番が終わって自分の番になったら確実に消えるようにする（#29/#30対策）。
export function syncCpuStepHint() {
  if (cpuResultHoldActive) showCpuStepHint();
  else hideCpuStepHint();
}
// ローカルCPU戦で、CPU(疑似CPU)が選択待ちのモーダル（パーティ等の選択肢・色宣言・
// 到達のマス選択など、activeEffectPickerで登録されるもの）を持っている間は、人間が
// その選択を代わりに押せないようにする（ユーザー報告「CPUの選択肢を私が押せてしまう」）。
// capture段階でクリックを握り、下のモーダルのボタン等へは一切伝えない。CPUの選ぶモーダルは
// 自動スキップON/OFFに関わらずタイマーが自動で解決するので、その解決までのわずかな表示中に
// 人間が誤って（または結果通知だと思って）CPUの選択肢を押してしまわないよう握るだけ。
// （自分自身の選択＝優先権が人間の時は握らない）。
document.addEventListener(
  "click",
  (e) => {
    if (!isCpuBattleActive() || isOnlineMode()) return;
    if (!activeEffectPicker) return;
    const owner = getState().priorityPlayer || getAutoDriveSeat();
    if (!isPseudoCpuTarget(owner)) return; // 人間の選択待ちなら邪魔しない
    e.preventDefault();
    e.stopPropagation();
  },
  true
);

// ユーザー要望「プレイヤーに作業をさせる場合は『移動先のマスを選択してください』などの
// モーダルを出して案内するようにしてほしい」への対応。ハイライトだけでは何をすればいいか
// 分かりにくいという指摘のため、選択中は画面上部に案内文を出す（盤面操作の邪魔をしない
// pointer-events:noneのバナー、モーダルのように操作を止めない）。
let effectPickerHintEl = null;
// CPU戦で、今まさにCPU(疑似CPU)が優先権を持って選択中か（＝その選択は自動で解決される）。
// この間は「○○を選択してください」等の案内・候補ハイライトを人間に見せない（人間が自分で
// 選ぶのかと混乱するため。ユーザー要望2026-08-07「CPUの選択モーダルは非表示でよい。結果は欲しい」）。
// この「選ぶ」場面が、CPU（疑似CPU対象席）自身のものか。owner未指定なら現在の優先権保持者で
// 判定する（＝従来挙動：CPU自身のターン中の効果選択）。 owner を明示すると、その席が選ぶ主体
// として扱う——不具合#33: CPUのターン中に“人間”がゴメンナサイ等のリアクションを使うと、
// 優先権保持者はCPU(C)のままなので、owner未指定だと「CPUが選んでいる」と誤判定し、人間の
// 選択モーダルを隠して勝手にランダム自動解決してしまっていた。owner=人間の席 を渡せば誤判定を防ぐ。
function isCpuSelectingNow(owner) {
  if (!isCpuBattleActive() || isOnlineMode()) return false;
  const seat = owner ?? getState().priorityPlayer;
  return isPseudoCpuTarget(seat);
}
function showEffectPickerHint(text) {
  // CPUが選択中の「○○を選択してください」案内は出さない（結果通知は別途出す）。
  if (isCpuSelectingNow()) return;
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
    // CPUが選ぶ番はハイライト・案内・スキップボタンを出さない（自動で解決される。混乱防止）。
    // owner（この選択の主体）を渡せる——ゴメンナサイ等、CPUのターン中に人間が使うリアクション
    // 選択では owner=人間の席 を明示し、CPUのものと誤判定して隠さない/勝手に解決しないようにする(#33)。
    const cpuSelecting = isCpuSelectingNow(options.owner);
    if (!cpuSelecting) {
      for (const entry of entries) entry.el.classList.add("card-effect-target-cell");
      document.body.classList.add("card-effect-picking-cells");
    }
    if (hint) showEffectPickerHint(hint); // showEffectPickerHint内でCPU中は自動スキップ
    if (options.allowSkip && !cpuSelecting) showEffectSkipButton(options.skipLabel ?? "これ以上選ばない");
    activeEffectPicker = {
      type: "cell",
      owner: options.owner ?? null,
      candidates,
      // 既に選んだマス（候補外）をクリックした時に注意を出すため（プリドゥエン/増殖する樹々の
      // 「別々のマスに置く」用、card-effect-engine.jsのPLACE_CARD CHOOSEから渡る）。
      alertCells: options.alertCells ?? null,
      alertMessage: options.alertMessage ?? null,
      resolve: (loc) => {
        for (const entry of entries) entry.el.classList.remove("card-effect-target-cell");
        document.body.classList.remove("card-effect-picking-cells");
        hideEffectPickerHint();
        hideEffectSkipButton();
        resolve(loc);
        // ロック候補のミニロックハイライトを即座に消す（解決後）。
        updateMiniLockArea();
      },
    };
    // ロックスロットが候補の時、盤面拡大中でも即座にミニロックエリアへ選択ハイライトを反映する
    // （ユーザー要望2026-08-08。render()待ちにならないよう明示的に更新）。
    if (candidates.some((c) => c.zone === "lock")) updateMiniLockArea();
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
function requestHandCardChoiceForEffect(player, hint, tokenIdFilter, options = {}) {
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
    // 候補はハイライトし、直前のrender（activeEffectPicker未設定時）で付いた「使えない
     // カードの暗転」(hand-card-effect-unusable)が残っていれば剥がす。これが残ると、ロック
     // 済みカードの手札効果（tryUseLockedUsableCardが先にrender()する経路）で追色コストの
     // 候補が“暗転したまま枠だけ光る”状態になっていた（ユーザー報告「ハイライトされずトーン
     // オフ、でも選べる」）。以降のrenderではbuildPlayerZoneが候補を暗転対象から除外する。
    // CPUが選ぶ番は手札候補のハイライトを出さない（自動で選ばれる。混乱防止）。手札の選択は
    // 常にその手札の持ち主(player)が選ぶ主体なので、ownerはplayer。CPUのターン中でも人間の手札
    // 選択（ゴメンナサイの追色コスト等）はplayerが人間なら誤って自動解決しない(#33)。
    if (!isCpuSelectingNow(player)) {
      for (const el of cardEls) {
        el.classList.add("card-effect-target-cell");
        el.classList.remove("hand-card-effect-unusable");
      }
      document.body.classList.add("card-effect-picking-hand");
    }
    if (hint) showEffectPickerHint(hint);
    activeEffectPicker = {
      type: "hand",
      owner: player,
      // purpose:"lock" の時、CPUの自動解決は「手放す用(chooseHandCardToken)」ではなく「ロックする用
      // (chooseHandCardToLock＝虹や要る色を優先)」で選ぶ。セレナーデ/カウンターロックのロック対象選択用。
      purpose: options.purpose ?? null,
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
function requestPlayerChoiceForEffect(candidates, hint, options = {}) {
  return new Promise((resolve) => {
    const entries = candidates
      .map((player) => ({ player, el: document.querySelector(`.player-avatar[data-player="${player}"]`) }))
      .filter((e) => e.el);
    if (entries.length === 0) {
      resolve(null);
      return;
    }
    // CPUが選ぶ番は相手アバターのハイライトを出さない（自動で選ばれる。混乱防止）。
    // owner（選ぶ主体）を渡せる（#33、ゴメンナサイ等の人間リアクション対応）。
    if (!isCpuSelectingNow(options.owner)) {
      for (const entry of entries) entry.el.classList.add("card-effect-target-avatar");
    }
    if (hint) showEffectPickerHint(hint);
    activeEffectPicker = {
      type: "player",
      owner: options.owner ?? null,
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
// 不具合#35: 収穫と種まき等のPICKUP_TO_HANDで手札に加わったカードのお知らせ＋手札での発光。
// 以前は取得プレイヤーに関わらず getSelfSeat() で通知＆発光していたため、CPU戦でCPU(C)が
// 収穫と種まきで取ったカードが「あなた（＝画面の持ち主）が獲得」として中身ごと表示され、
// CPUの手札がバレていた。実際に取った player を受け取り、自分（この画面の席）が取った時
// だけ通知＆発光する（他席が取った時は何もしない——CPUの取得は伏せたまま）。
function onEffectCardAcquiredToHand(tokenId, cardId, wasFaceUp, player) {
  if (player !== undefined && player !== getSelfSeat()) return;
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
  const img = token.faceUp ? getCardImagePath(token.cardId) : cardBackImageForToken(token);
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

// 手札→手札の飛翔（ある席の手札エリアから別の席の手札エリアへカード1枚ぶんのゴーストを飛ばす）。
// ゲート侵攻/接触の「相手の手札を奪う」演出（オンラインのplayGateInvasionStealAnimと同じ考え方）を、
// チュートリアルでも“相手の手札から自分の手札へ”正しい軌道で見せるために注入する。faceUpなら表画像、
// でなければ裏画像で飛ばす。飛翔演出OFF・要素が無い時は何もしない（呼び出し側で実移動は別途行う）。
async function flyHandCardBetweenSeats(fromSeat, toSeat, cardId, faceUp = false) {
  if (isFlightAnimationDisabled()) return;
  const fromEl = document.querySelector(`.hand-area[data-player="${fromSeat}"]`);
  const toEl = document.querySelector(`.hand-area[data-player="${toSeat}"]`);
  if (!fromEl || !toEl) return;
  const img = faceUp ? getCardImagePath(cardId) : getCardBackImagePath(null);
  const cls = faceUp ? "setup-fly-card" : "setup-fly-card is-facedown";
  const { done } = flyGhost(fromEl.getBoundingClientRect(), toEl.getBoundingClientRect(), img, cls, 650);
  await done;
}

// ③演出（ユーザー要望2026-08-18）: カードを盤面マスに置くとき、手札からそのマスの真上(上空)へ
// 「すーーっと」滑って行き、上空で止まったら真下へ「ストン」と落として着地。着地の瞬間、マスの周りに
// 着地の風/ホコリ(landing puff)がふわっと舞う——というカード配置の演出。逆(マスのカードが手札に
// 入る)はplayCardLiftToHand。既存のsetup-fly-cardゴースト方式(document.body直下・3D空間の外・
// stage座標)を流用しつつ、flyGhostの単純な直線と違い「グライド→落下」の2段モーションにする。
// 演出中は実カードを隠しゴーストだけ動かし、着地後に実カードを見せる（fire-and-forget＝配置ロジック
// には一切影響しない後付けの飾り）。移動アニメーションOFF・要素欠落時は何もしない（実配置は
// 呼び出し側が既に済ませている）。durations等はここで微調整可。
// 続き213（ユーザー要望2026-08-18「飛翔アニメが全体的に早すぎる。管理者モードで細かく調整したい」）:
// 着地演出の各フェーズの時間・上空の高さを管理者モードのCSS変数（--card-landing-*）から読む。
// アニメ再生のたびにgetComputedStyleで読むので、管理者スライダーを動かせば即座に反映される。
function cardLandingTimings() {
  const cs = getComputedStyle(document.documentElement);
  const num = (name, fallback) => {
    const v = parseFloat(cs.getPropertyValue(name));
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    glide: num("--card-landing-glide-ms", 300), // 手札/山→上空の「すーーっと」
    hold: num("--card-landing-hold-ms", 130), // 上空で「ピタッ」と止まる間
    drop: num("--card-landing-drop-ms", 150), // 上空→マスの「ストン」（加速）
    liftScale: num("--card-landing-lift-scale", 1.08), // 上空の高さ＝駒の高さ×これ
  };
}
// 「上空」の高さ＝ほぼ駒の高さ（既定：駒の高さより ほんの少し上）。盤面の駒(.piece＝3D立方体)の
// 投影高さ×--card-landing-lift-scale。駒が無い時はマスの約半分で保険。
function cardLandingLiftPx(refRect) {
  const pieceEl = document.querySelector("#game-table .piece");
  const pieceH = pieceEl ? pieceEl.getBoundingClientRect().height : refRect.height * 0.5;
  return pieceH * cardLandingTimings().liftScale;
}
function spawnCardLandingPuff(cellRect) {
  const c = stageClientToLocal(cellRect.left + cellRect.width / 2, cellRect.top + cellRect.height / 2);
  const size = stageDelta(cellRect.width) * 1.7;
  const puff = document.createElement("div");
  puff.className = "card-landing-puff";
  puff.style.width = `${size}px`;
  puff.style.height = `${size}px`;
  puff.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`;
  const inner = document.createElement("div");
  inner.className = "card-landing-puff-inner";
  puff.appendChild(inner);
  document.body.appendChild(puff);
  inner.addEventListener("animationend", () => puff.remove(), { once: true });
  setTimeout(() => puff.remove(), 900); // animationendが来ない環境用の保険
}
// トークンの現在のカードDOM要素（手札/公開手札/盤面）のrectを返す（着地演出の飛び元用）。
function cardElRectForToken(tokenId) {
  const el = document.querySelector(
    `.hand-card[data-token-id="${tokenId}"], .hand-reveal-card[data-token-id="${tokenId}"], .board-card[data-token-id="${tokenId}"]`
  );
  return el ? el.getBoundingClientRect() : null;
}
// 山札の山のrect（山→マス配置の飛び元用）。
function deckStackRect() {
  const el = document.querySelector('.stack[data-pile="deck"]');
  return el ? el.getBoundingClientRect() : null;
}
// 山→マスの配置で、実際に置かれたカード（そのマスの一番上）に着地演出をかける共通ヘルパー。
function playDeckToCellLanding(deckRect, location) {
  if (!deckRect || location?.zone !== "cell") return Promise.resolve();
  const placed = findTopCardAt(location);
  if (placed) return playCardCellLanding(deckRect, location, placed.id);
  return Promise.resolve();
}
// 続き212（ユーザー要望2026-08-18）: 飛翔演出が完全に終わってから次のアクション（駒の移動等）へ
// 進めるよう、着地完了で解決するPromiseを返す。呼び出し側（placeFrom*・moveAndSyncForEffect）が
// awaitすると、engine側の `await helpers.placeFromDeckFaceUp(...)` 等が自然に着地を待ち切る。
function playCardCellLanding(sourceRect, cellLocation, tokenId) {
  if (isFlightAnimationDisabled() || !sourceRect) return Promise.resolve();
  const table = document.getElementById("game-table");
  if (!table) return Promise.resolve();
  const cellEl = findLocationElement(table, cellLocation);
  const cardEl = table.querySelector(`.board-card[data-token-id="${tokenId}"]`);
  if (!cellEl || !cardEl) return Promise.resolve();
  const cellRect = cellEl.getBoundingClientRect();
  const cardRect = cardEl.getBoundingClientRect(); // 着地先の実カード（＝マスのカード）の見た目サイズ
  const img = getComputedStyle(cardEl).backgroundImage;
  cardEl.style.visibility = "hidden"; // 実カードを隠してゴーストだけ動かす（着地後に見せる）
  const ghost = document.createElement("div");
  ghost.className = "setup-fly-card card-landing-ghost";
  ghost.style.backgroundImage = img;
  // 続き223（ユーザー要望2026-08-18「上空に止まるとき、カードがやたら小さい。マスのカードと同じ
  // サイズに」）: カードは正方形なのに、飛び元（山札の山＝横長で低い投影rect）のアスペクト比を
  // ゴーストに使い、さらに rotateX(--table-tilt) で縦を潰していたため、上空/着地で横長・低い＝小さく
  // 見えていた。ゴーストの基準サイズを「着地先の実カード(cardRect)」に合わせ、rotateXの縦潰し分を
  // 逆算(/cosT)して基準を縦に伸ばしておくことで、scale(1)+rotateX で cardRect と寸分同じに見せる。
  const flat2d = document.body.classList.contains("diagnostic-flatten-3d");
  const tiltDeg = flat2d ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--table-tilt")) || 42;
  const cosT = Math.max(0.35, Math.cos((tiltDeg * Math.PI) / 180));
  const baseW = cardRect.width;
  const baseH = cardRect.height / cosT; // rotateXで縦がcosT倍に潰れる分を逆算して基準を伸ばす
  ghost.style.width = `${stageDelta(baseW)}px`;
  ghost.style.height = `${stageDelta(baseH)}px`;
  const from = stageClientToLocal(sourceRect.left + sourceRect.width / 2, sourceRect.top + sourceRect.height / 2);
  const cellC = stageClientToLocal(cellRect.left + cellRect.width / 2, cellRect.top + cellRect.height / 2);
  const startScale = sourceRect.width / baseW; // 飛び元(山札/手札)の大きさから始まり、着地でscale(1)
  const liftLocal = stageDelta(cardLandingLiftPx(cellRect)); // 「上空」＝ほぼ駒の高さ
  // 続き215: 上空で止まる／マスに置かれる時のカードの角度を、盤面のカードと同じ角度(--table-tilt)に。
  // ゴーストは3D空間の外(document.body直下)なのでrotateXで寝かせる。2D表示中は盤面も平らなので傾けない。
  const boardTilt = flat2d ? "rotateX(0deg)" : `rotateX(${tiltDeg}deg)`;
  ghost.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) rotateX(0deg) scale(${startScale})`;
  document.body.appendChild(ghost);
  const t = cardLandingTimings();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      // フェーズ1: マスの真上(上空)へ すーーっと（強めの減速でピタッと止まる感＝easeOutExpo風）。
      // 同時にカードを盤面の角度へ寝かせる（上空のピタッで盤面と同じ角度・同じサイズになる）。
      ghost.style.transition = `transform ${t.glide}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      ghost.style.transform = `translate(${cellC.x}px, ${cellC.y - liftLocal}px) translate(-50%, -50%) ${boardTilt} scale(1)`;
    });
    setTimeout(() => {
      // フェーズ2: ストンと真下へ落下（加速＝ease-in）。上空で一拍(HOLD)止めてから落とす。盤面角度のまま。
      ghost.style.transition = `transform ${t.drop}ms cubic-bezier(0.6, 0, 0.9, 0.2)`;
      ghost.style.transform = `translate(${cellC.x}px, ${cellC.y}px) translate(-50%, -50%) ${boardTilt} scale(1)`;
    }, t.glide + t.hold);
    setTimeout(() => {
      spawnCardLandingPuff(cellRect); // 着地の風/ホコリ
      cardEl.style.visibility = ""; // 実カードを見せる
      requestAnimationFrame(() => requestAnimationFrame(() => ghost.remove()));
      resolve(); // 着地完了→次のアクションへ
    }, t.glide + t.hold + t.drop + 20);
  });
}
// 逆: マスのカードが手札に入るとき。持ち上がり(マスから上空へストン)→手札へすーーっと。風は
// 持ち上がりの瞬間（マス側）に舞う。sourceRect=移動前の盤面カードのrect（移動前に捕捉）。
// sourceImg: 飛翔ゴーストに使う画像（url("...")形式）。#164: 盤面で表向きだったカードが手札へ
// 回収される時、以前は移動先の手札要素の背景画像を読んでいたため、相手（自分以外）の手札は
// 裏向きで描画される＝表向きで場にあったカードが裏向きで飛んで見えるバグがあった。飛翔は
// 「盤面で見えていた面」を見せるべきなので、呼び出し側が移動前の見た目（表向きなら表面／
// 裏向きなら裏面）を渡す。省略時は従来通り移動先の手札要素→裏面フォールバック。
function playCardLiftToHand(sourceRect, player, tokenId, sourceImg = null) {
  if (isFlightAnimationDisabled() || !sourceRect) return Promise.resolve();
  const cardEl = document.querySelector(`.hand-card[data-token-id="${tokenId}"]`);
  const handArea = document.querySelector(`.hand-area[data-player="${player}"]`);
  const toRect = cardEl ? cardEl.getBoundingClientRect() : handArea ? handArea.getBoundingClientRect() : null;
  if (!toRect) return Promise.resolve();
  const img =
    sourceImg ||
    (cardEl ? getComputedStyle(cardEl).backgroundImage : getCardBackImagePath(null) && `url("${getCardBackImagePath(null)}")`);
  if (cardEl) cardEl.style.visibility = "hidden";
  spawnCardLandingPuff(sourceRect); // 持ち上がりのホコリ（マス側）
  const ghost = document.createElement("div");
  ghost.className = "setup-fly-card card-landing-ghost";
  if (img) ghost.style.backgroundImage = img;
  // 続き223: 飛び元＝盤面カード(sourceRect)は既にrotateXで縦が潰れた投影サイズなので、そこへさらに
  // rotateXを重ねると上空で二重に潰れて小さく見える。基準を /cosT で縦に伸ばし、scale(1)+rotateXで
  // 元の盤面カードと同サイズに見せる（手札へ着く時は平ら＝scaleで手札サイズへ）。
  const flat2d = document.body.classList.contains("diagnostic-flatten-3d");
  const tiltDeg = flat2d ? 0 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--table-tilt")) || 42;
  const cosT = Math.max(0.35, Math.cos((tiltDeg * Math.PI) / 180));
  const baseW = sourceRect.width;
  const baseH = sourceRect.height / cosT;
  ghost.style.width = `${stageDelta(baseW)}px`;
  ghost.style.height = `${stageDelta(baseH)}px`;
  const from = stageClientToLocal(sourceRect.left + sourceRect.width / 2, sourceRect.top + sourceRect.height / 2);
  const to = stageClientToLocal(toRect.left + toRect.width / 2, toRect.top + toRect.height / 2);
  const scale = toRect.width / baseW;
  const liftLocal = stageDelta(cardLandingLiftPx(sourceRect)); // 上空＝ほぼ駒の高さ
  // 続き215: 盤面のカード（＝盤面の傾き）から持ち上がるので、上空の間は盤面と同じ角度で寝かせ、
  // 手札へ着く時に平らに戻す。2D表示中は盤面カードも平らなので傾けない。
  const boardTilt = flat2d ? "rotateX(0deg)" : `rotateX(${tiltDeg}deg)`;
  ghost.style.transform = `translate(${from.x}px, ${from.y}px) translate(-50%, -50%) ${boardTilt} scale(1)`;
  document.body.appendChild(ghost);
  const t = cardLandingTimings();
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      // フェーズ1: マスから上空へ ストンと持ち上がる（加速＝ease-in）。盤面角度のまま。
      ghost.style.transition = `transform ${t.drop}ms cubic-bezier(0.4, 0, 0.9, 0.5)`;
      ghost.style.transform = `translate(${from.x}px, ${from.y - liftLocal}px) translate(-50%, -50%) ${boardTilt} scale(1)`;
    });
    setTimeout(() => {
      // フェーズ2: 手札へ すーーっと（減速＝ease-out）。上空で一拍(HOLD)止めてから戻す。手札で平らに。
      ghost.style.transition = `transform ${t.glide}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      ghost.style.transform = `translate(${to.x}px, ${to.y}px) translate(-50%, -50%) rotateX(0deg) scale(${scale})`;
    }, t.drop + t.hold);
    setTimeout(() => {
      if (cardEl) cardEl.style.visibility = "";
      requestAnimationFrame(() => requestAnimationFrame(() => ghost.remove()));
      resolve(); // 手札への飛翔完了→次のアクションへ
    }, t.drop + t.hold + t.glide + 20);
  });
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
        // 飛翔ゴーストが手札へ着地するまで、汎用render()リスナーによる先回り描画を止める
        // （#1「ドロー演出の前にもう手札にカードが加わっていた」）。drawFromPileの結果適用で
        // 走るnotifyListeners()→subscribe(render)を、着地後の手動render()まで抑止する。
        suppressGenericRenderForDrawFlight = true;
        const result = await drawFromPile("deck", { zone: "hand", player });
        if (result?.revealedCardId) {
          playSound("cardDraw");
          // ゴーストが飛んでいる間はまだrender()しない（実カードが先に一瞬見えてしまう
          // 「二重表示」を避けるため、setup-animation.jsと同じ考え方）。着地後にrender()。
          await flyDrawnCardToHand(player, result.revealedCardId);
          render();
          pickups.push({ cardId: result.revealedCardId, wasPublic: false });
        }
        // 着地後は解除（この後のfetchAndHydrate等は通常通り再描画させる）。
        suppressGenericRenderForDrawFlight = false;
        await fetchAndHydrate(getCurrentGameId());
        drawnTokenIds.push(...findNewHandTokenIds(player, handBefore));
      } catch (err) {
        console.error("drawCardsForEffect failed", err);
        break;
      } finally {
        suppressGenericRenderForDrawFlight = false; // 例外時も必ず解除
      }
    } else {
      const pileArray = getState().piles.deck;
      if (pileArray.length === 0) break; // 山札が尽きたら諦める（善処の原則）
      const cardId = pileArray[pileArray.length - 1];
      // オフラインでもdrawFromPileのdispatch→auto-renderが先回りするため同様に抑止する。
      suppressGenericRenderForDrawFlight = true;
      try {
        drawFromPile("deck", { zone: "hand", player });
        playSound("cardDraw");
        await flyDrawnCardToHand(player, cardId);
        render();
        pickups.push({ cardId, wasPublic: false });
        drawnTokenIds.push(...findNewHandTokenIds(player, handBefore));
      } finally {
        suppressGenericRenderForDrawFlight = false;
      }
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
  // ユーザー要望2026-08-08: セレスティアは相手の手札を「捨てさせる」効果で、自分の手札には
  // 加わらないため、中央の周知は「奪った／奪われた」ではなく「捨てさせた／捨てさせられた」にする。
  return requestOpponentHandRitualPick(
    targetPlayer,
    `${getPlayerName(targetPlayer)}の手札（裏向き）から無作為に1枚選んでください`,
    undefined,
    { takes: "捨てさせた", loses: "捨てさせられた" }
  );
}

// docs/rulebook.md「いつでも使える」の定義: 「効果等の何らかの『処理中』は使用
// できない（ゲート侵攻ボーナスも処理中に含まれる）」。ゲート侵攻だけでなく、
// 他の効果の対象選択待ち（activeEffectPicker）・手札効果の解決中
// （phase-automation.jsのhandEffectBusy）も全て「処理中」に含まれる。
// ユーザー報告（続き83）「『いつでも使える』の使うか確認モーダルが出ている最中に
// ターンが切り替わってしまった。完全にモーダルが閉じられるまではほかの自動処理は
// ストップしなければならない」への対応で、このモーダル自体の表示中
// （anytimeInterruptModalEl）も「処理中」に含める。
// 接触の結果モーダル（openContactResultModal）が1つでも開いている間はカウントが正になる。
// ユーザー要望2026-08-08（#40）「接触結果モーダルが閉じる前に次のターンが始まってしまう。
// ちゃんと閉じてから次のターンへ」——開いている間は自動ターン終了を止める。
let openContactResultModals = 0;

export function isAnyEffectProcessingBusy() {
  return (
    isGateInvasionPending() ||
    isGateInvasionQueueActive() ||
    isLocalGateInvasionActive() ||
    isHandEffectBusy() ||
    activeEffectPicker !== null ||
    anytimeInterruptModalEl !== null ||
    openContactResultModals > 0
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
function confirmTouchAction(title, { cardId = null } = {}) {
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

    // 対象カードの画像を添える（ユーザー要望2026-08-13「このカードを選びますか等の確認モーダルに
    // カード画像も添えたい」）。cardIdが渡された時だけ。ロック/使用/選択いずれの確認でも共通。
    if (cardId) {
      const cardImg = document.createElement("div");
      cardImg.className = "touch-action-confirm-card";
      showCardFace(cardImg, cardId, getCardImagePath(cardId));
      modal.appendChild(cardImg);
    }

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
function confirmGenericYesNo(title, { yesLabel = "はい", noLabel = "いいえ", owner = null, cardId = null, cpuAutoResolveId = null } = {}) {
  return new Promise((resolve) => {
    let done = false;
    let blockerCheckTimer = null;
    const finish = (result) => {
      // 二重発火（下のpointerdown＋click、またはdocument captureとの重複）を無害化する。
      if (done) return;
      done = true;
      activeEffectPicker = null;
      if (blockerCheckTimer) clearInterval(blockerCheckTimer);
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
    const noBtn = document.createElement("button");
    noBtn.className = "contact-approval-reject";
    noBtn.type = "button";
    noBtn.textContent = `🚫 ${noLabel}`;
    // 最終防衛（ユーザー報告2026-08-24、iPhone 15 Pro Max・CPU戦「カウンターロックの
    // 『ロックしますか？』でボタンをタップしてもハイライトはされるが何も起きない」の再々発）:
    // click にも document capture（3487行の pointerdown 割り込み）にも頼らず、ボタンに直接
    // pointerdown を付けて解決する。「タップでハイライトされる」＝touch（pointerdown）は確実に
    // ボタンへ届いている証拠なので、この直付け pointerdown は必ず発火する（iOSで click が
    // 生成されない/握り潰される事例でも解決できる）。finish は done ガード付きで二重発火に耐える。
    // touchstart も併記（一部の iOS/WebKit で pointerdown が来ないケースの保険。どれか1つ来れば良い）。
    const answer = (result) => (ev) => {
      // 直後の合成 click や document capture との二重処理を避けるため、既定動作を止める。
      if (ev.cancelable) ev.preventDefault();
      ev.stopPropagation();
      finish(result);
    };
    yesBtn.addEventListener("pointerdown", answer(true));
    noBtn.addEventListener("pointerdown", answer(false));
    yesBtn.addEventListener("touchstart", answer(true), { passive: false });
    noBtn.addEventListener("touchstart", answer(false), { passive: false });
    yesBtn.addEventListener("click", () => finish(true));
    noBtn.addEventListener("click", () => finish(false));
    buttons.appendChild(yesBtn);
    buttons.appendChild(noBtn);
    modal.appendChild(buttons);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
    // 診断＋自己防衛（ユーザー報告2026-08-16「カウンターロックの『ロックしますか？』でボタンも
    // 不具合報告アイコンも押せなくなった。PC・本気エイドス」）: このYes/Noモーダルは重要な確認の
    // ため、表示直後にボタンが「別の要素に覆われていないか」を自前でヒットテストする。覆われて
    // いたら (1)その要素の id/class/z-index/大きさ/pointer-events を行動ログに残し（再発時に犯人を
    // 特定できるように）、(2)それが「透明・全画面級・このモーダル外」の“幽霊オーバーレイ”なら
    // pointer-events:none を当てて無害化し、詰みを回避する（見た目のある要素・このモーダルの一部は
    // 触らない）。owner がCPU（is-cpu-hidden）の時は表示しないので対象外。
    let blockerReported = false;
    const runBlockerSelfCheck = () => {
      if (!modal.isConnected || modal.classList.contains("is-cpu-hidden")) return;
      for (const btn of [yesBtn, noBtn]) {
        const r = btn.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (!top || top === btn || btn.contains(top) || modal.contains(top)) continue;
        const cs = getComputedStyle(top);
        const tr = top.getBoundingClientRect();
        const desc = { id: top.id || null, cls: typeof top.className === "string" ? top.className : null, tag: top.tagName, z: cs.zIndex, pe: cs.pointerEvents, w: Math.round(tr.width), h: Math.round(tr.height) };
        logAction("diag-modal-blocked", { modal: "generic-confirm", ...desc });
        // ユーザー確認2026-08-16「同じ現象だと行動ログも押せない。F12コンソールなら確認できる」。
        // 画面全体が固まっていると📜行動ログ窓を開けずログをコピーできないため、犯人の情報を
        // F12コンソールにも必ず出す（何度も出ないよう1回だけ）。ユーザーはF12ログを貼れる。
        if (!blockerReported) {
          blockerReported = true;
          console.error("[so7][diag-modal-blocked] 確認モーダルのボタンが別要素に覆われています:", JSON.stringify(desc));
        }
        // 「見えないのにクリックを奪う」幽霊オーバーレイだけを無害化する。elementFromPointは
        // pointer-events:none の要素を素通りするので、ここで返る＝pointer-eventsを持って“捕まえて
        // いる”要素。かつ背景/不透明度が無い（＝目に見えない）なら、正規のモーダル/背景ではなく
        // 取り残された捕獲レイヤーとみなして pointer-events:none を当て、詰みを解く（見た目のある
        // 要素・このモーダル自身の背景 backdrop は触らない。stage の transform で大きさが当てに
        // ならないため面積は条件にしない）。無害化すると幽霊が画面全体でクリックを奪わなくなるため、
        // 確認ボタンだけでなく📜行動ログ・不具合報告アイコンも再び押せるようになる。
        const invisible = (cs.backgroundColor === "rgba(0, 0, 0, 0)" || cs.backgroundColor === "transparent" || parseFloat(cs.opacity) === 0) && cs.backgroundImage === "none";
        if (invisible && top !== backdrop) {
          top.style.pointerEvents = "none";
          logAction("diag-modal-blocked", { modal: "generic-confirm", action: "neutralized-pointer-events", id: desc.id, cls: desc.cls });
          console.error("[so7][diag-modal-blocked] 透明な捕獲レイヤーを無害化しました（pointer-events:none）:", JSON.stringify({ id: desc.id, cls: desc.cls, z: desc.z }));
        }
        break;
      }
    };
    // 表示直後と少し後、以降はモーダルが閉じるまで一定間隔で確認する（幽霊オーバーレイが
    // 遅れて出るケースにも対応。finishでclearInterval）。
    requestAnimationFrame(() => setTimeout(runBlockerSelfCheck, 60));
    setTimeout(runBlockerSelfCheck, 400);
    blockerCheckTimer = setInterval(runBlockerSelfCheck, 500);
    // CPUが答える番（CPUが防御側の接触承認・任意のはい/いいえ等）はこのモーダルを表示しない
    // （自動で解決される。人間が答えるのかと混乱するため）。owner（この選択の主体）を渡せる——
    // カウンターロックの「手札を1枚ロックしてもよい」等、相手（CPU）のターン中に人間の防御側が
    // 使うリアクションでは owner=人間の席 を明示する。そうしないと優先権保持者（＝攻撃側CPU）が
    // 選ぶと誤判定され、モーダルを隠して勝手に自動解決してしまう（不具合#58、#33と同根）。
    if (isCpuSelectingNow(owner)) {
      backdrop.classList.add("is-cpu-hidden");
      modal.classList.add("is-cpu-hidden");
    }
    // ユーザー報告（続き106）「優先権が委任されたまま自動プレイが反応せず止まる」の
    // 調査中に発見: このモーダル（カウンターロックの「手札を1枚ロックしてもよい」等、
    // 本当の任意選択向け汎用Yes/No）だけがactiveEffectPickerに未登録で、続き105で
    // 修正した合同建設の「どこから置きますか？」と全く同じ穴だった。ここも同じく
    // type:"option"（はい/いいえの2択）として登録し、疑似CPU対象がタイムアウトした
    // 場合にランダムなusable:true選択肢へ自動解決されるようにする。
    activeEffectPicker = {
      type: "option",
      owner, // 人間の防御側リアクション（#58）等では owner=人間の席。CPUの自動解決から守る。
      // #120: cardIdを渡せるようにする。以前は未指定だったため、賢いCPUのoption解決
      // （chooseEffectOption(picker.cardId, ...)）がcardId=undefinedでOPTION_RANKに載らず、
      // 常にランダム（yes/no 50%）になっていた。烙印ドローのYes/Noに cardId:"black-contract-brand"
      // を渡すと、OPTION_RANKの{yes:1,no:0}が効いて必ず「ドローする」になる（＝2枚とも引く）。
      cardId,
      // #120: 難易度に関わらずCPUが必ずこの選択肢を選ぶ（烙印ドロー=常に「ドローする」等）。
      cpuAutoResolveId,
      options: [
        { id: "yes", label: yesLabel, usable: true },
        { id: "no", label: noLabel, usable: true },
      ],
      resolve: (option) => finish(option?.id === "yes"),
    };
  });
}

// ロックエリアにある「ロックされていても手札効果が使えるカード」（ファースト/エターナル、
// is-usable-while-locked）をハンドフェイズにクリックした時の使用フロー。
// バグ修正（ユーザー報告「オンラインで橙のファースト/紫のエターナルがクリックしても使えない」）:
// 自動処理＋ドラッグ制限（既定ON、auto-drag-restriction.js）中は盤面/ロックのカードを掴めない
// ため、掴む→放すに依存していた従来の使用経路（下のonDragEnd内の分岐A）が発火せず、これらの
// カードが一切使えなくなっていた。ムーブ/ロックフェイズのクリック処理と同じ「captureフェーズの
// pointerdownで自前当たり判定して割り込む」方式で、掴めなくても使えるようにする。
// 画面中央下に短時間だけ出る軽いお知らせ（クリックしても「何も起きない」と誤解される
// のを防ぐ用途。モーダルほど重くない）。
let quickNoteEl = null;
let quickNoteTimer = null;
function showQuickNote(text) {
  if (quickNoteTimer) clearTimeout(quickNoteTimer);
  if (!quickNoteEl) {
    quickNoteEl = document.createElement("div");
    quickNoteEl.className = "quick-note-toast";
    document.body.appendChild(quickNoteEl);
  }
  quickNoteEl.textContent = text;
  quickNoteEl.classList.add("show");
  quickNoteTimer = setTimeout(() => {
    quickNoteEl?.classList.remove("show");
  }, 2200);
}

async function tryUseLockedUsableCard(tokenId) {
  const token = getState().tokens.find((t) => t.id === tokenId);
  if (!token || token.location.zone !== "lock") return;
  const owner = SIDE_TO_SEAT[token.location.side];
  if (owner !== getSelfSeat()) return;
  // 同じ色スロットに使えるカード（ファースト＋エターナル等）が2枚以上あればどれを使うか選ばせる。
  const stacked = getState().tokens.filter(
    (t) =>
      t.kind === "card" &&
      t.location.zone === "lock" &&
      t.location.side === token.location.side &&
      t.location.index === token.location.index
  );
  let useToken = token;
  // ユーザー要望「重なっているスロットは、使えないカード（ブースト等）も含めて“何が置いて
  // あるか”を確認できるよう必ず選択モーダルを出す。使えないカードを選んだら『使えない』と
  // 教える」。以前は“使える”カードが2枚以上ある時だけモーダルを出していたため、ドムスネロの
  // 下にブーストがある等の状況で下に何があるか確認できなかった。スロットに2枚以上あれば常に出す。
  if (stacked.length >= 2) {
    const chosen = await pickStackedLockCard(stacked, "このスロットのカード（使うカードを選んでください）");
    if (!chosen) {
      render();
      return;
    }
    useToken = chosen;
  }
  const isUsableKind =
    (useToken.cardId.startsWith("eternal-") || useToken.cardId.startsWith("first-")) && hasHandEffectData(useToken.cardId);
  if (!isUsableKind) {
    render();
    showQuickNote(`「${getCardDefinition(useToken.cardId).name}」は手札効果を使えないカードです。`);
    return;
  }
  render();
  if (canUseHandEffect(useToken.cardId, useToken.id, owner)) {
    if (await confirmTouchAction(`${getCardDefinition(useToken.cardId).name}を使用しますか？`, { cardId: useToken.cardId })) {
      runAutoHandEffect(useToken.cardId, useToken.id, owner);
    }
  } else if (!canPayHandEffectCost(useToken.cardId, useToken.id, owner)) {
    alert("捨てられる同じ色のカードが手札にありません。");
  } else {
    // 追色は払えるがcanUseHandEffectがfalse。不具合報告#52（まだ使っていないのに「使用済みの
    // 可能性がある」と出る）への対応で、正確な不許可理由を出す（使用回数だけでなく、ロックできる
    // 手札が無い／最後の1色＝勝利になるロックはできない等、実際の理由を伝える）。
    const reason =
      getHandEffectUnusableReason(useToken.cardId, useToken.id, owner) ||
      "今はこのカードの効果を使えません。";
    alert(reason);
  }
}

// ユーザー要望「①通常の手札カードは、ハンドフェイズかつ手札エリア外で放すと手札効果が
// 発動する」「②エターナル/ファーストカードは、ハンドフェイズでクリックすると追色コストを
// 選ぶ流れに移行する」への対応の実行部。cardTokenIdは効果を使うカード自身。
// （Step 3で手札効果の起動を直列化するラッパーを試したが、runAutoHandEffectが「常にトップレベル
//   起動」という前提が崩れており＝どこかで再入的に呼ばれる経路があり、直列化するとその再入が自分の
//   スロットを待って詰む＝スモークテストで2/4回STALLしたため撤回。並行実行の実害はStep1/2で
//   個別に塞いだので、危険な総直列化はしない。see [[effect-engine-queue]]。）
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
        recordMoveVisited,
        isLoopMoveDest,
        isCpuDriving: isSeatAutoDriven,
        flyCardToHand: flyBoardCardToHand,
        pickLocation: requestCellChoiceForEffect,
        pickHandCard: requestHandCardChoiceForEffect,
        onCardAcquiredToHand: onEffectCardAcquiredToHand,
        markPlacementTarget: markEffectPlacementTarget,
        markPlacedLocation: markEffectJustPlaced,
        placeFromDeck: placeFromDeckForEffect,
        placeFromDeckReveal: placeFromDeckRevealForEffect,
        swapPieces: swapPiecesForEffect,
        triggerArrivalAtIfFaceUp: triggerArrivalAtIfFaceUpForEffect,
        announceUse: announceHandEffectUseForEffect,
        // V5（追色使用）: コスト確定後に「吸収→霧散」演出を出す（続き218）。
        playAdditionalColorUse: playAdditionalColorUseForEffect,
        pickHandEffectOption: pickOptionForEffect,
        // ジャンプ台の手札効果（これをゲート以外の任意のマスに表向きで置く）用。
        flipCard: flipToFaceUpForEffect,
        // 試練の儀式で「踏んだカード」を中央にじらしフリップで見せる用（手札効果版でも使う）。
        announceSteppedCard: announceSteppedCardForEffect,
        // 表向きに置いた先に既に駒がいた場合の到達判定（続き62）用。
        maybeTriggerArrivalForPlacedCard: maybeTriggerArrivalForPlacedCardForEffect,
        // 手品師の技の効果（アバターで相手を選び、手札を1枚ずつ交換する）用。
        pickPlayer: requestPlayerChoiceForEffect,
        swapRandomHandCard: swapHandCardWithOpponentForEffect,
        announceEffectReason: announceEffectReasonForEffect,
        announceEffectNotice: announceEffectNoticeForEffect, // 続き214: 非ブロックの軽い通知
        celebrate: celebrateForEffect,
        gambleReveal: (cardId) => revealCenterCardForAll(cardId, "ギャンブル公開"),
        startSuspenseSound: startHeartbeat,
        stopSuspenseSound: stopHeartbeat,
        delay: (ms) => wait(ms),
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
        // #95: ザ・ギャンブルの公開ドローは、公開エリアに出す前に中央じらしフリップで公開する版を使う。
        publicDrawThenReveal: publicDrawThenRevealForEffect,
        // #95改: 公開エリアへの描画を「全部の公開演出が終わってから」まとめて行うための開始/終了。
        beginPublicDrawDefer: beginPublicDrawDeferForEffect,
        endPublicDrawDefer: endPublicDrawDeferForEffect,
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
      recordMoveVisited,
      isLoopMoveDest,
      isCpuDriving: isSeatAutoDriven,
      flyCardToHand: flyBoardCardToHand,
      pickLocation: requestCellChoiceForEffect,
      pickHandCard: requestHandCardChoiceForEffect,
      onCardAcquiredToHand: onEffectCardAcquiredToHand,
      // 到達効果の既定動作でこのカード自身を手札へ加えた時のカード獲得トースト（右下）。
      // 自分（この画面の見ている席）の獲得だけ出す——CPU戦でCPUの獲得まで毎回出すと煩いため。
      announceCardAddedToHand: (cardId, seat, wasFaceUp) => {
        if (seat !== getSelfSeat()) return;
        announceHandPickups(seat, [{ cardId, wasPublic: wasFaceUp }]);
      },
      markPlacementTarget: markEffectPlacementTarget,
      markPlacedLocation: markEffectJustPlaced,
      placeFromDeck: placeFromDeckForEffect,
      placeFromDeckReveal: placeFromDeckRevealForEffect,
      swapPieces: swapPiecesForEffect,
      triggerArrivalAtIfFaceUp: triggerArrivalAtIfFaceUpForEffect,
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
      announceEffectNotice: announceEffectNoticeForEffect, // 続き214: 非ブロックの軽い通知
      celebrate: celebrateForEffect,
      gambleReveal: (cardId) => revealCenterCardForAll(cardId, "ギャンブル公開"),
      startSuspenseSound: startHeartbeat,
      stopSuspenseSound: stopHeartbeat,
      delay: (ms) => wait(ms),
      announceEffectChoice: announceEffectChoiceForEffect,
      // プレゼントの到達効果等で「誰がドロー対象か」を画面中央にアバターで周知する用。
      announceDrawTargets: announceDrawTargetsForEffect,
      // 試練の儀式で「踏んだカード」を画面中央に見せる用。
      announceSteppedCard: announceSteppedCardForEffect,
      // 試練の儀式で、裏向きで置いたカードを中央フリップ公開後に盤面でも表向きにする用。
      flipCard: flipToFaceUpForEffect,
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
      // #95: ザ・ギャンブルの公開ドローは、公開エリアに出す前に中央じらしフリップで公開する版を使う。
      publicDrawThenReveal: publicDrawThenRevealForEffect,
      // #95改: 公開エリアへの描画を「全部の公開演出が終わってから」まとめて行うための開始/終了。
      beginPublicDrawDefer: beginPublicDrawDeferForEffect,
      endPublicDrawDefer: endPublicDrawDeferForEffect,
      // ザ・ギャンブルの「1枚ずつ公開する/全部公開する」モーダル用。手札効果側
      // (runAutoHandEffect)には元々あったが到達効果側に無く、到達で撃つと自動で
      // 全部公開されてしまっていた（ユーザー報告）。到達側にも同じヘルパーを渡す。
      pickHandEffectOption: pickOptionForEffect,
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

// 不具合報告#135「パーティ効果処理中に到達（ゲート侵攻）ボーナス処理が発動してしまった」。
// 原因: onGateInvasionEventsの受信時デフォルト待ちは isArrivalEffectProcessing() しか見て
// いなかった。パーティ等の「全員選ぶ」効果で自分が委任先（delegate）としてオプション選択の
// ピッカー(activeEffectPicker)を開いている最中は isArrivalEffectProcessing() が false のため、
// ゲート侵攻モーダルがそのピッカーに重なって開いてしまっていた（ログ: 相手側で pickerActive:true
// のままゲート侵攻 broadcast を受信）。到達処理に加え、選択ピッカー・手札効果処理・接触結果/
// いつでも使えるモーダルの表示中も「処理中」とみなして待たせる。ただし isAnyEffectProcessingBusy()
// と違いゲート侵攻自身の状態（Pending/QueueActive/Local）は含めない（含めると自分のキューで
// 永久に待ち続ける循環になるため）。
function isBusyForGateInvasionDeferral() {
  return (
    isArrivalEffectProcessing() ||
    activeEffectPicker !== null ||
    isHandEffectBusy() ||
    openContactResultModals > 0 ||
    anytimeInterruptModalEl !== null
  );
}

// 無意味なループ防止（#49、ユーザー方針「セブンではルール上無意味なループは禁止」）。1つの到達連鎖
// （ジャンプ台の連続移動等）で駒が通ったマスを記録し、そこへ戻る移動先を「ループ先」として扱う。
// リセットは「1回の移動アクションの起点」で行う（#50/#51）: (1)プレイヤーの移動（タップ/ドラッグ）は
// beginPostMoveArrivalGuardで、(2)効果由来の到達連鎖はtriggerCardArrivalの起点(depth===0)で。
// 移動アクション中は記録を保持して連鎖内の出戻りだけを検知し、次のアクションで必ずリセットされる。
// card-effect-engineのMOVEがrecordMoveVisited/isLoopMoveDestを使い、CPUはループ先を選ばず、
// 人間には警告して選ばせない。
// ユーザー要望2026-08-15: 以前は「この連鎖で1回でも通ったマスへは戻れない」だったが、周囲が
// 全部ジャンプ台で「起点のジャンプ台へ毎回戻る」ような正当な繰り返しをしたい場合がある。そこで
// 「一度でも禁止」ではなく「同じマスへは上限回数まで戻れる」回数制にする（真の無限ループは防ぎ
// つつ有限回の繰り返しは許す）。人間の上限は card-effect-engine.js の HUMAN_MOVE_REVISIT_LIMIT。
// CPUは無駄なバウンドを避けるため従来どおり厳格（limit=1）。判定側(isLoopMoveDest)に上限を渡す。
let moveChainVisitedCells = new Map(); // "row,col" → この連鎖でそのマスを通った回数
function recordMoveVisited(cell) {
  const key = cell && typeof cell.row === "number" ? `${cell.row},${cell.col}` : null;
  if (key) moveChainVisitedCells.set(key, (moveChainVisitedCells.get(key) || 0) + 1);
}
function isLoopMoveDest(cell, limit = 1) {
  if (!cell || typeof cell.row !== "number") return false;
  return (moveChainVisitedCells.get(`${cell.row},${cell.col}`) || 0) >= limit;
}
// その座席が自動操作（CPU戦のCPU席 or AFK代行中の自席）で駆動されているか。ループ先を人間に警告
// するのか、自動で避けるのかの分岐に使う。
function isSeatAutoDriven(seat) {
  return (
    (isCpuBattleActive() && !isOnlineMode() && isPseudoCpuTarget(seat)) ||
    (isSelfCpuSubstituted() && seat === getSelfSeat())
  );
}

// ユーザー報告「ゲートのマスのカードの到達処理が終わる前にゲート侵攻処理が始まってしまう」。
// サーバー駆動のゲート侵攻ブロードキャストは、そのカードの到達効果（例: スラム役人の“全員が
// 手札を3枚まで捨てる”）をローカルで解決している最中に届くことがあり、到達効果の解決を待たずに
// ゲート侵攻モーダルが割り込んで出ていた。到達処理中(arrivalEffectProcessingDepth>0)は
// イベントを一旦ためておき、到達処理が完全に終わった時点(depthが0へ戻った時)でまとめて再生する。
let pendingGateInvasionEvents = [];
function flushPendingGateInvasionEvents() {
  if (pendingGateInvasionEvents.length === 0) return;
  // #135: まだ他の処理中（ピッカー・手札効果等）なら流さず待つ。ピッカーが閉じた等で
  // 状態が変わるたびにrender()から再度呼ばれるので、処理が空いた次のタイミングで流れる。
  if (isBusyForGateInvasionDeferral()) return;
  const buffered = pendingGateInvasionEvents;
  pendingGateInvasionEvents = [];
  for (const events of buffered) {
    logAction("diag-gate-invasion-flush-after-arrival", { count: events?.length ?? 0 });
    enqueueGateInvasionSteps(events);
  }
}

// 【効果エンジンのキュー化・第一歩】remote-move-animator（他プレイヤー/CPUの手の再現＝差分検知）
// 由来の到達トリガ(fromDiff=true)は、こちらのエンジンが既に到達/効果チェーンを処理している
// 最中(arrivalEffectProcessingDepth>0)に割り込んで「別チェーン」を並行起動すると、同じ到達が
// 二重に走る（#86/#87/#96の二重発火の根）。そこで、処理中に来た差分トリガは即実行せず一旦
// 溜めておき、チェーンが完全に終わってdepthが0へ戻った時にまとめてflushする（既存の
// pendingGateInvasionEventsと同じdefer-flushパターン）。差分トリガはどこからもawaitされない
// （remote-move-animatorは投げっぱなし）ため遅延しても呼び出し側の待ち合わせは壊れない。flush時は
// maybe*関数がその時点のstateを再評価するので、エンジン側で既に解決済みの到達は自然に空振りする。
let pendingDiffArrivalTriggers = [];
function flushPendingDiffArrivalTriggers() {
  if (pendingDiffArrivalTriggers.length === 0) return;
  const buffered = pendingDiffArrivalTriggers;
  pendingDiffArrivalTriggers = [];
  logAction("diag-diff-arrival-flush", { count: buffered.length });
  for (const item of buffered) {
    if (item.kind === "card") maybeTriggerCardArrivalForCard(item.dropTarget, item.cardId, item.faceUp, true, item.respectPieceSuppression);
    else if (item.kind === "exposed") maybeTriggerCardArrivalForExposedCard(item.location, true, item.prevTopTokenId);
  }
}

// ユーザー報告#6: ムーブフェイズでザ・ギャンブルの到達効果を処理している最中に、相手の
// ターンへ勝手に移行してしまった（効果自体は最後まで処理できた）。
// 原因: 移動を確定（markPhaseMoveActionTakenでisMovePhaseActive()がfalse）してから、
// triggerCardArrivalが到達処理深度(arrivalEffectProcessingDepth)を上げるまでの間に、
// オンライン再同期（moveToken→hydrate、着地先が裏向きなら更にflipToken→hydrate）で
// 最大2秒ほどの空白が生じる。この空白の間はcomputeShouldEmphasize()がtrueのまま
// （移動済み・到達処理はまだ0）になるため、自動ターン終了タイマー(AUTO_END_TURN_DELAY_MS
// =1500ms)が到達効果の開始を待たずに発火してターンを終わらせていた。タイマー発火時の
// computeShouldEmphasize()再確認も、その時点でまだ到達処理が始まっていないためすり抜ける。
// 対策として「移動確定〜到達開始（または到達なしの確定）」を到達処理と同じ深度カウンタで
// 包み、この空白を塞ぐ。深度カウンタなので自動ターン終了だけでなく、isArrivalEffect
// Processing()で守っている割り込み（ゲート侵攻等）もまとめて抑止できる。移動経路ごとに
// 呼ぶ（highlightタップ経路=performPhaseMoveToCell、ドラッグ経路=onDragEnd）。
function beginPostMoveArrivalGuard() {
  // 不具合#50/#51: 移動→到達連鎖の間はこのガードで arrivalEffectProcessingDepth>0 に
  // なっているため、triggerCardArrival 側の「連鎖起点(depth===0)でループ記録をクリア」が
  // 効かず、前ターン/前アクションのマスが moveChainVisitedCells に残り続けて、同じジャンプ台の
  // 再利用（#50）や相手ゲートへのジャンプ（#51）が誤って「無意味なループ」と判定されていた。
  // ここが1回の移動アクションの起点なので、最外周（まだ到達処理が走っていない）の時だけ
  // ループ記録をリセットする。効果内のネスト移動（depth>0）では連鎖内ループ検知のため消さない。
  if (arrivalEffectProcessingDepth === 0) moveChainVisitedCells.clear();
  arrivalEffectProcessingDepth++;
}
function endPostMoveArrivalGuard() {
  arrivalEffectProcessingDepth = Math.max(0, arrivalEffectProcessingDepth - 1);
  // ガードを外した時点で本物の到達処理も走っていなければ、その間にためたゲート侵攻を流す
  // （triggerCardArrivalのfinallyと同じ後始末。到達が続く場合はdepth>0のままなので流さない）。
  if (arrivalEffectProcessingDepth === 0) flushPendingGateInvasionEvents();
}

// spawnArrivalBurstのCSSアニメーション自体の長さ（1400ms、appendEffectHostのttlMs引数と
// 揃える）。ユーザー要望「到達アニメが完全終了して一息ついた後に効果モーダルを出す」への
// 対応で、効果処理の開始をこの長さ＋一息つく間だけ遅らせるのに使う。
const ARRIVAL_BURST_DURATION_MS = 1400;
const ARRIVAL_EFFECT_START_PAUSE_MS = 400;

// ユーザー報告#7: 自分のターンで放置中に、自分のパーティ到達効果が二重に処理され（相手が
// パーティ効果を2回得る／自分のムーブフェイズのターンが終わらない）ていた。原因は、自分の
// 移動で発火した到達効果(triggerCardArrival)の自動処理中に、同じマス・同じカードの到達が
// もう一度triggerCardArrivalされ二重に走ること。二重発火の主経路はremote-move-animator.jsの
// 位置差分検知で、自席の駒の移動もmarkSelfHandledのTTL(4秒)切れやトークン再同期のタイミング
// によってはすり抜け、triggerCardArrivalIfFaceUpで同じ到達を再発火し得る。発火経路を全部
// 塞ぐより、「同じカード×同じマスの到達効果が自動処理中の間は、重複した到達発火を無視する」
// 冪等ガードを1箇所（ここ）に置くのが確実。処理開始でキーを登録し、finallyで必ず外す。
// ただしユーザー報告#11「ジャンプ台を往復したらターンが終わった」の通り、自分の効果チェーンが
// 同じマスへ正当に再到達する（ジャンプ台で戻る等）ケースは通す必要がある。そこで“無視”対象は
// remote-move-animator由来の重複発火だけ（triggerCardArrivalにopts.fromDiff=trueで渡る）に
// 限定し、自分の移動/効果チェーン(fromDiff無し)は常に処理する。往復のネストに耐えるよう、
// キーはSetではなくカウンタ(Map)で保持する。
const activeAutoArrivalKeys = new Map();
// #96: 同じ到達キーで「現在アクティブな処理のうち fromDiff（差分検知）由来のもの」の数。
// オンラインでは moveAndSync の fetchAndHydrate 由来の差分到達が move-chain より先に走ることが
// あり、順序次第で fromDiff→非fromDiff の並びになって「fromDiffの重複だけ弾く」既存ガードを
// すり抜けて二重実行される（ザ・ギャンブルの色宣言・公開・「1枚ずつ公開」モーダルが二重化した）。
// これを使い「どちらが先でも、片方が fromDiff で同じ到達が処理中なら二重発火として無視」する。
const activeAutoArrivalFromDiffKeys = new Map();
function autoArrivalKey(cardId, location) {
  const loc =
    location.zone === "cell"
      ? `cell:${location.row}:${location.col}`
      : location.zone === "lock"
        ? `lock:${location.side}:${location.index}`
        : String(location.zone);
  return `${cardId}@${loc}`;
}

// 到達演出一式（右上モーダル＋そのマス自体が発光する柱状のオーラ＋効果音）をまとめて行う。
// 柱の色はカード自身の色に合わせる（--color-*をそのまま使う）。到達した駒の持ち主にだけ
// 「このカードを手札に加える」ボタンを出す（ユーザー要望）。
// onFullyResolved（省略可）: maybeTriggerCardArrival参照。自動処理なら実際の
// 非同期処理が終わるまで待ってから、手動（ボタン）モードならモーダルを出した
// 時点ですぐに呼ぶ（クリックそのものは待たない——onResolvedと同じ精度）。
// opts.fromDiff: この呼び出しが remote-move-animator.js の位置差分検知（他席の移動の再現・
// 自席の移動の取りこぼし再発火）由来かどうか。#11の冪等ガードで、fromDiffの重複だけを無視する。
function triggerCardArrival(cardId, location, onFullyResolved, opts = {}) {
  // 新しい到達連鎖の起点でループ記録をリセットする（#49。連鎖中に通ったマスへの出戻りを検知するため）。
  if (arrivalEffectProcessingDepth === 0) moveChainVisitedCells.clear();
  const player = getPieceOwnerAt(location);
  const showAddToHand = !!player && player === getSelfSeat();
  // 到達効果を自動処理する対象席かどうか。通常は「自分の席」。ただしローカルCPU戦では
  // CPU(C)が到達した時もその効果を自動処理する必要がある（不具合#21: CPUの到達効果が
  // 発動しない）。getAutoDriveSeatはCPU戦のCPUの番なら今のターンプレイヤー(C)を返す。
  // 不具合#54/#75: 接触の強制移動で、接触された相手(defender)が自分のゲートのカードに到達
  // しても到達効果が処理されない（auto:false）ままだった。原因は、attackerのターン中は
  // getAutoDriveSeat() が turnPlayer(=attacker) を返すため、強制移動で優先権が一時的に
  // defenderへ移っていても、到達した本人(defender)が自動処理対象と見なされなかったこと。
  // #54では防御側がCPU席(isPseudoCpuTarget)の時だけ救済していたが、#75で「防御側が人間
  // (seat A)でも同じく不発（ゲートのジャンプ台の到達が動かない）」と判明。ローカル
  // （オンライン以外＝1クライアントで全員を操作）では、優先権保持者の到達をCPU・人間を問わず
  // 自動処理していた。#150（ユーザー報告2026-08-19「相手の足元にジャンプ台を置いたけど到達効果が
  // 発動しない」）: A のターンに A が相手(C)の駒の下へ表向きジャンプ台を置くと、到達の対象は C の駒
  // だが priorityPlayer は A のままなので処理されず駒が跳ばなかった。ローカルは1クライアントが全員を
  // 操作するので、**誰の駒の到達でも**自動処理してよい（auto処理はcanAutoProcessArrivalで別途ON/データ
  // 有りを判定するので、自動処理OFF時は従来通り発動しない。オンラインは各クライアントが自分の席の
  // 到達を処理する別経路のため対象外）。
  const forcedLocalArrival = !isOnlineMode() && !!player;
  const shouldAutoProcess = !!player && (player === getAutoDriveSeat() || forcedLocalArrival) && canAutoProcessArrival(cardId);
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
    auto: shouldAutoProcess,
    depth: arrivalEffectProcessingDepth,
  });

  // ユーザー要望「カード効果の自動処理」。設定がONで、このカードが構造化データを持ち、
  // かつ「今まさに到達した本人の画面」の場合、「このカードを手札に加える」ボタンの
  // 代わりに効果そのものを自動実行する。ただしユーザー報告「自動処理モードでは到達
  // 拡大モーダルが相手の画面にしか出ない」への対応として、本人の画面にも
  // （ボタン無し・自動で消える表示専用の）同じ拡大モーダルを出す——効果は自動で
  // 進んでも、自分がどのカードに到達したかは見えないと分かりにくいため。
  if (shouldAutoProcess) {
    // 不具合#49: ジャンプ台が2つちょうど2マス離れて置かれていると、着地→2マス移動→もう一方の
    // ジャンプ台に着地→2マス移動…と到達効果が無限に連鎖して固まる（実機で深度45+を確認）。
    // 到達効果の入れ子（連鎖）が異常に深くなったら安全弁として打ち切る。正当な連鎖（ジャンプ台→
    // パーティ→…等）は十数段で収まるため、余裕を持って20で止める。打ち切り時は駒はその場に留まる。
    const MAX_ARRIVAL_CHAIN_DEPTH = 20;
    if (arrivalEffectProcessingDepth >= MAX_ARRIVAL_CHAIN_DEPTH) {
      logAction("diag-arrival-processing", { cardId, phase: "max-depth-abort", depth: arrivalEffectProcessingDepth });
      onFullyResolved?.();
      return;
    }
    // 冪等ガード（#7/#11、activeAutoArrivalKeys参照）: 同じカード×マスの到達効果が既に自動
    // 処理中の時、remote-move-animator由来の重複発火(opts.fromDiff)だけを無視する。自分の
    // 効果チェーンの正当な再到達（ジャンプ台の往復など）は fromDiff 無しなので通す。
    const dedupKey = autoArrivalKey(cardId, location);
    const dedupKeyActive = activeAutoArrivalKeys.has(dedupKey);
    const dedupFromDiffActive = (activeAutoArrivalFromDiffKeys.get(dedupKey) || 0) > 0;
    // #7/#11/#96: 差分検知(fromDiff)と自分の効果チェーンが同じ到達を二重に発火するのを防ぐ。
    // どちらが先でも、片方が fromDiff で既にこの到達が処理中なら二重発火とみなして無視する
    // （#96: オンラインで fetchAndHydrate 由来の差分到達が move-chain より先に走り、その後
    // move-chain が非fromDiffで再発火して二重化した）。純粋な効果チェーン同士の再到達
    // （どちらも非fromDiff。ジャンプ台往復・入れ替え/接触で同マスへ戻る等）は従来どおり通す。
    if (dedupKeyActive && (opts.fromDiff || dedupFromDiffActive)) {
      logAction("diag-arrival-processing", {
        cardId,
        phase: "duplicate-skip",
        depth: arrivalEffectProcessingDepth,
        fromDiff: !!opts.fromDiff,
        fromDiffActive: dedupFromDiffActive,
      });
      onFullyResolved?.();
      return;
    }
    activeAutoArrivalKeys.set(dedupKey, (activeAutoArrivalKeys.get(dedupKey) || 0) + 1);
    if (opts.fromDiff) activeAutoArrivalFromDiffKeys.set(dedupKey, (activeAutoArrivalFromDiffKeys.get(dedupKey) || 0) + 1);
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
        // 安全弁: ザ・ギャンブル/試練の儀式の鼓動が、途中で例外が起きても鳴りっぱなしに
        // ならないよう、到達効果の完了時に必ず止める（stopHeartbeatは冪等）。
        stopHeartbeat();
        arrivalEffectProcessingDepth = Math.max(0, arrivalEffectProcessingDepth - 1);
        const remainCount = (activeAutoArrivalKeys.get(dedupKey) || 1) - 1;
        if (remainCount <= 0) activeAutoArrivalKeys.delete(dedupKey);
        else activeAutoArrivalKeys.set(dedupKey, remainCount);
        // #96: fromDiff由来のアクティブ数も対で減らす。
        if (opts.fromDiff) {
          const remainFromDiff = (activeAutoArrivalFromDiffKeys.get(dedupKey) || 1) - 1;
          if (remainFromDiff <= 0) activeAutoArrivalFromDiffKeys.delete(dedupKey);
          else activeAutoArrivalFromDiffKeys.set(dedupKey, remainFromDiff);
        }
        logAction("diag-arrival-processing", { cardId, phase: "end", depth: arrivalEffectProcessingDepth });
        onFullyResolved?.();
        render();
        // 到達処理が完全に終わったら、その間にたまっていたゲート侵攻演出を再生する（上記参照）。
        // あわせて、処理中に溜めておいた差分検知由来の到達トリガもここでflushする（二重発火防止）。
        if (arrivalEffectProcessingDepth === 0) {
          flushPendingGateInvasionEvents();
          flushPendingDiffArrivalTriggers();
        }
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

// 続き218・ロック演出「A：焼き付く刻印」（ユーザー要望）。ロックするスロットに、その色の
// オーラが渦を巻いて収束→焼き付く瞬間にフラッシュ＋衝撃波、という豪華版。中央にでかでか
// ではなく、ロックする“そのスロット”で起きる（どの色をどこにロックしたか分かるように）。
function lockCrestColorVar(color) {
  return color === "rainbow" ? "#f6c945" : `var(--color-${color})`;
}
// 収束（焼き付く前の“ため”）: 色のリングが外から渦を巻いてスロットへ縮む。
function spawnLockConverge(hostEl, color) {
  if (isArrivalEffectDisabled()) return;
  const el = document.createElement("div");
  el.className = "lock-converge";
  el.style.setProperty("--crest-color", lockCrestColorVar(color));
  appendEffectHost(hostEl, el, 1300);
}
// 焼き付く瞬間: 中央の閃光＋外へ広がる衝撃波の輪。
function spawnLockSear(hostEl, color) {
  if (isArrivalEffectDisabled()) return;
  const el = document.createElement("div");
  el.className = "lock-sear";
  el.style.setProperty("--crest-color", lockCrestColorVar(color));
  el.appendChild(Object.assign(document.createElement("div"), { className: "lock-sear-flash" }));
  el.appendChild(Object.assign(document.createElement("div"), { className: "lock-sear-shock" }));
  appendEffectHost(hostEl, el, 700);
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
  spawnLockConverge(hostEl, color); // 続き218「A：焼き付く刻印」: 色のオーラがスロットへ収束
  return new Promise((resolve) => {
    setTimeout(() => {
      playSound("lock");
      spawnLockSear(hostEl, color); // 焼き付く瞬間の閃光＋衝撃波
      spawnLockStamp(hostEl); // 刻印（ロック画像）が焼き付く
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
// 露出したカードの到達を発火する。呼び出し元が「到達（コンボ）が完全に解決してから続けたい」
// 場合に await できるよう、到達の完全解決で解決するPromiseを返す（triggerCardArrivalの
// onFullyResolvedは全経路で必ず呼ばれる＝5082行のfinally等、デッドロックしない）。await
// しない従来の呼び出し元は戻り値を無視するだけで挙動は変わらない。
function triggerCardArrivalIfFaceUp(location, fromDiff = false) {
  const card = findTopCardAt(location);
  if (card && card.faceUp) {
    return new Promise((resolve) => triggerCardArrival(card.cardId, card.location, resolve, { fromDiff }));
  }
  return Promise.resolve();
}

// 逆方向（駒が既にいるマス/ロックスロットへ、表向きのカードを新しく置いた/動かした時）にも
// 到達演出を出す。今までは駒側が動いた時しか到達判定していなかったが、カード側が動いて
// 駒の下に潜り込むケースでも同じように到達したことにしてほしい、というユーザー要望への対応。
// 裏向きのカードの場合は対象外（駒が裏向きカードに乗った時の「オープンする/しない」選択の
// ような自動オープンの仕組みはここでは設けない。ユーザーの要望が表向きの場合のみのため）。
function maybeTriggerCardArrivalForCard(dropTarget, cardId, faceUp, fromDiff = false, respectPieceSuppression = false) {
  // キュー化第一歩: 効果チェーン処理中に来た差分由来トリガは溜めてdepth0でflush（二重発火防止）。
  if (fromDiff && arrivalEffectProcessingDepth > 0) {
    pendingDiffArrivalTriggers.push({ kind: "card", dropTarget, cardId, faceUp, respectPieceSuppression });
    logAction("diag-diff-arrival-defer", { kind: "card", cardId, location: dropTarget, depth: arrivalEffectProcessingDepth });
    return Promise.resolve();
  }
  if (!dropTarget || !faceUp) return Promise.resolve();
  // 安全弁（不具合#76）: cardIdが未確定(null/undefined)のまま到達判定に入ると、
  // triggerCardArrival配下のgetCardDefinition(cardId).name等で落ちる。呼び出し側で
  // 反転後の最新cardIdを渡すのが本筋だが、万一nullが来たらここで黙って何もしない。
  if (!cardId) return Promise.resolve();
  if (!hasPieceAt(dropTarget)) return Promise.resolve();
  // #165: 「めくり(flip)」由来の再現（remote-move-animator）で、パーティ/試練の儀式/マスチェンジ等の
  // 「移動先の到達効果は得ない」移動が裏向きカードをオープンした場合、駒側にはarrivalSuppressedが
  // 立っているのにflip差分の到達判定がそれを見ず誤発火していた。respectPieceSuppression=true（flip由来）の
  // 時だけ、そのマスの駒がarrivalSuppressedなら到達を起こさない。通常のカード移動(move由来)は従来通り無条件。
  if (respectPieceSuppression) {
    const piece = getState().tokens.find((t) => {
      if (t.kind !== "piece") return false;
      const l = t.location;
      if (l.zone !== dropTarget.zone) return false;
      if (dropTarget.zone === "cell") return l.row === dropTarget.row && l.col === dropTarget.col;
      if (dropTarget.zone === "lock") return l.side === dropTarget.side && l.index === dropTarget.index;
      return false;
    });
    if (piece && piece.arrivalSuppressed) return Promise.resolve();
  }
  // キュー化第二歩(#93): 効果側（PLACE_CARDの表向き配置＝ジャンプ台や、複数オープン）がawaitして
  // 内側の到達チェーンを最後まで待ち切れるよう、到達の完全解決で解決するPromiseを返す。従来の
  // fire-and-forgetな呼び出し元（ドラッグ配置・remote-move-animator）は戻り値を無視するだけで挙動不変。
  // onFullyResolvedはtriggerCardArrivalの全経路で必ず呼ばれる（自動処理はfinally、非自動も明示呼び）
  // ためawaitがデッドロックすることは無い（#85と同じ実証済みパターン）。
  return new Promise((resolve) => triggerCardArrival(cardId, dropTarget, resolve, { fromDiff }));
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
// prevTopTokenId（省略可）: このマスから何かが動く「前」の一番上のカードのトークンid。
// #152（ユーザー報告2026-08-20）: 到達（コンボ）は「駒が“新しい表向きカードの表面”に触れた瞬間」
// にだけ起きる。つまり、あるマスの一番上のカードがどいて“別のカード”が新しく一番上になった時だけ。
// 試練の儀式のようにスタックの一番下（や中間）のカードを回収しても、駒が触れている一番上は
// 変わらない＝新しい接触ではないので到達しない。prevTopTokenId が渡され、動いた後も一番上の
// トークンidが変わっていなければ（＝一番上が入れ替わっていなければ）発動しない。
function maybeTriggerCardArrivalForExposedCard(location, fromDiff = false, prevTopTokenId = undefined) {
  // キュー化第一歩: 効果チェーン処理中に来た差分由来トリガは溜めてdepth0でflush（二重発火防止）。
  // この差分経路(fromDiff=true)はremote-move-animatorが投げっぱなしで呼ぶ＝戻り値をawaitしないため、
  // 遅延してPromise.resolve()を返しても待ち合わせは壊れない（#85のawaitはfromDiff=falseの別経路）。
  if (fromDiff && arrivalEffectProcessingDepth > 0) {
    pendingDiffArrivalTriggers.push({ kind: "exposed", location, prevTopTokenId });
    logAction("diag-diff-arrival-defer", { kind: "exposed", location, depth: arrivalEffectProcessingDepth });
    return Promise.resolve();
  }
  // 診断（到達コンボ不発の調査）: パーティ等で上のカードが取り除かれ、下のカードが露出
  // した時にこの経路が実際に呼ばれ、駒がいて・表向きのカードを見つけて到達を起こせるかを
  // 記録する。ユーザー報告「パーティを取って露出したジャンプ台の到達効果が起きない」用。
  const top = location && (location.zone === "cell" || location.zone === "lock") ? findTopCardAt(location) : null;
  // #152: 一番上が入れ替わっていない（＝抜けたのは一番下/中間のカードで、駒が触れている
  // 一番上のカードは変わっていない）なら、新しい接触ではないので到達しない。
  const topUnchanged = prevTopTokenId !== undefined && !!top && top.id === prevTopTokenId;
  logAction("diag-exposed-arrival", {
    location,
    zoneOk: !!location && (location.zone === "cell" || location.zone === "lock"),
    hasPiece: !!location && hasPieceAt(location),
    topCardId: top?.cardId ?? null,
    topFaceUp: top?.faceUp ?? null,
    prevTopTokenId: prevTopTokenId ?? null,
    topUnchanged,
  });
  if (topUnchanged) return Promise.resolve();
  if (!location || (location.zone !== "cell" && location.zone !== "lock")) return Promise.resolve();
  if (!hasPieceAt(location)) return Promise.resolve();
  // 到達（コンボ）の完全解決で解決するPromiseを返す（await可能。#85）。
  return triggerCardArrivalIfFaceUp(location, fromDiff);
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
  clampFloatingPromptIntoView(prompt); // 画面外はみ出しで一部しか押せなくなるのを防ぐ（#55）
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
  // #40: 開いている間は自動ターン終了を止める（isAnyEffectProcessingBusy/computeShouldEmphasize
  // が openContactResultModals を見る）ため、開いた数を数える。
  openContactResultModals += 1;
  // 時間でも閉じる（ユーザー要望#40）。ただしCPU戦（ローカルの疑似CPU対戦）では、結果を
  // しっかり確認できるよう自動では閉じず、クリックするまで残す（CPU結果ホールドと同じ方針）。
  // ただし——「閉じる操作をする人間がいない席」が防御側の時（自己対戦＝両席疑似CPUのスモーク
  // テストや、離席AI代行で防御側が疑似CPUのとき）は、このモーダルのonCloseが優先権返却
  // （finishContactResolution）のトリガーなのに誰もクリックせず、優先権が防御側に残ったまま
  // 手番プレイヤーへ戻らず詰む（実測: 12秒の保険タイマーより先に停止する）。その場合だけは
  // 0（無期限保持）にせず短時間で自動的に閉じて優先権を返す。人間が防御側の通常CPU戦では
  // 従来どおりクリックまで保持する。
  const defenderIsAuto = typeof isPseudoCpuTarget === "function" && isPseudoCpuTarget(defender);
  const autoCloseMs = defenderIsAuto ? 3500 : (isCpuBattleActive() && !isOnlineMode() ? 0 : 5000);
  let autoCloseTimer = null;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    if (autoCloseTimer) clearTimeout(autoCloseTimer);
    openContactResultModals = Math.max(0, openContactResultModals - 1);
    modal.remove();
    onClose?.();
  };
  if (autoCloseMs > 0) autoCloseTimer = setTimeout(close, autoCloseMs);
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
    const img = document.createElement("div");
    img.className = "contact-result-card-image";
    showCardFace(img, cardId, getCardImagePath(cardId));
    img.setAttribute("aria-label", cardDef.name);
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
  // ユーザー要望2026-08-17「接触の結果モーダルは不要」。以前はここで攻撃側に「奪ったカード」を
  // 出していたが、儀式ピック（奪う演出）で既に分かるため廃止。スナップショットのクリアだけ行う。
  contactAttackerSnapshot = null;
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
  clampFloatingPromptIntoView(prompt); // 画面外はみ出しで一部しか押せなくなるのを防ぐ（#55）
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
  // カード画像は正方形（#card-preview参照。1:1＋background-size:cover）。エターナル束
  // (pileRect)が少しでも縦長だと、reveal面のcoverで正方形カードの上下が切れてしまう
  // （ユーザー報告「ゲート侵攻時のエターナルのアップカードの上下が切れる」）。revealは
  // 束の長辺を基準にした正方形にして、カード全体がぴったり収まるようにする。
  // ユーザー報告2026-08-07「盤面を拡大した状態でエターナル演出が入ると、フリップする
  // エターナルが画面からはみ出す」。原因: pileRectは盤面ズームで拡大された実サイズなので、
  // ズームすると2.1倍のサイズが巨大化して画面外へはみ出していた。中央に出す演出なので、
  // ビューポートの短辺の一定割合を上限にして、ズーム倍率に関わらず必ず画面内に収める。
  // ユーザー報告2026-08-07「画面中央で止まった後、少しきゅっと拡大してからフリップする」。
  // 原因: 以前はここで正方形(size×size)を返していたが、飛翔ゴースト(flyGhost)はカードの
  // 縦横比のまま横幅比で一様拡大して着地する。着地した縦長カード→正方形revealへ受け渡す際、
  // ①縦横比が違うためサイズがカクッと変わり、②background-size:coverの正方形にカード絵を
  // 敷くと上下が切れて絵が拡大表示されるため「きゅっと拡大」して見えていた。
  // ユーザー報告2026-08-07（続き）「ゲート侵攻でエターナルがフリップするタイミングで上下が
  // 見切れる」。原因: 直前の修正で reveal を束pileRectの縦横比に合わせたが、エターナル束の
  // 要素は横長（実測 約245×199）である一方、カード画像は正方形(1:1、433×433)。横長の枠に
  // background-size:cover で正方形カードを敷くと上下が切れていた。カードが正方形なので reveal
  // も必ず正方形にする。飛翔ゴーストの始点も正方形にする（呼び出し側 squarePileRect）ので、
  // 受け渡しで縦横比が変わらず「きゅっと拡大」も起きない。大きさは束の短辺を基準に十分大きく、
  // かつビューポート短辺の60%以内（盤面ズームで巨大化して画面外へ出るのを防ぐ）。
  const base = Math.min(pileRect.width, pileRect.height);
  const size = Math.min(base * 2.6, Math.min(window.innerWidth, window.innerHeight) * 0.6);
  return {
    left: window.innerWidth / 2 - size / 2,
    top: window.innerHeight / 2 - size / 2,
    width: size,
    height: size,
  };
}

// ザ・ギャンブルの公開カードを、画面中央に大きく“じらしてフリップ”で見せる（ユーザー要望
// 2026-08-08「公開エリアだけでなく画面中央に大々的に、少しじらしてフリップして開く感じ」）。
// エターナル獲得と同じ正方形スケールXフリップを流用した簡易版（飛翔・ロック着地は無し）。
// 演出オフ設定中は既存のカード受け取りモーダルで簡潔に見せる。
async function playCenterCardFlipReveal(cardId, { labelText = "公開", suspenseMs = 850, holdMs = 850 } = {}) {
  if (isArrivalEffectDisabled()) {
    await showCardReceivedModal(cardId, "", { labelText });
    return;
  }
  const size = Math.min(window.innerWidth, window.innerHeight) * 0.5;
  const localCenter = stageClientToLocal(window.innerWidth / 2, window.innerHeight / 2);
  const w = stageDelta(size);
  const h = stageDelta(size);
  const reveal = document.createElement("div");
  reveal.className = "eternal-reveal-card is-suspense";
  reveal.style.left = `${localCenter.x - w / 2}px`;
  reveal.style.top = `${localCenter.y - h / 2}px`;
  reveal.style.width = `${w}px`;
  reveal.style.height = `${h}px`;
  const inner = document.createElement("div");
  inner.className = "eternal-reveal-card-inner";
  const back = document.createElement("div");
  back.className = "eternal-reveal-card-face is-back";
  back.style.backgroundImage = `url("${getCardBackImagePath(cardId)}")`;
  const front = document.createElement("div");
  front.className = "eternal-reveal-card-face is-front";
  showCardFace(front, cardId, getCardImagePath(cardId)); // 表面＝テキスト合成（画像モードは画像）
  front.style.opacity = "0";
  inner.append(back, front);
  reveal.appendChild(inner);
  document.body.appendChild(reveal);
  // ①じらし（裏向きのまま虹色の縁で少しためる）。
  await wait(suspenseMs);
  // ②スケールXフリップで表向きに（正方形なので上下は切れない）。
  reveal.classList.remove("is-suspense");
  const color = getCardDefinition(cardId)?.color;
  if (color) reveal.style.setProperty("--eternal-reveal-color", `var(--color-${color})`);
  playSound("cardFlip");
  reveal.classList.add("is-bursting");
  const half = 260;
  inner.style.transition = `transform ${half}ms ease-in`;
  inner.style.transform = "scaleX(0)";
  await wait(half);
  back.style.opacity = "0";
  front.style.opacity = "1";
  inner.style.transition = `transform ${half}ms ease-out`;
  inner.style.transform = "scaleX(1)";
  await wait(half);
  reveal.classList.remove("is-bursting");
  reveal.classList.add("is-revealed");
  await wait(holdMs);
  reveal.remove();
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
  // 着地先のロックスロットは、render()で盤面が作り直されると参照が切れるため、ここでは
  // 取得せず、着地する⑥の直前にライブな盤面から取り直す（下部コメント参照）。
  const pileRect = pileEl.getBoundingClientRect();
  // カードは正方形。飛翔の始点も束の中心を基準にした正方形にして、reveal(正方形)への
  // 受け渡しで縦横比が変わらない（上下が切れない・変形しない）ようにする。
  const srcSide = Math.min(pileRect.width, pileRect.height);
  const squarePileRect = {
    left: pileRect.left + (pileRect.width - srcSide) / 2,
    top: pileRect.top + (pileRect.height - srcSide) / 2,
    width: srcSide,
    height: srcSide,
  };
  const centerRect = getEternalRevealCenterRect(pileRect);

  // オンラインでは状態が既にロック済みで、そのままだと演出前からロックスロットにカードが
  // 見えてしまう（ユーザー報告「初めに速攻でエターナルがこっそりロックされる」）。演出が
  // ⑥で着地するまで、その1枚だけ描画を隠す。finallyで必ず戻す（“消えたまま”防止）。
  suppressedEternalLockRender = { side, index: colorIndex, cardId };
  render();
  try {
    // ①エターナル山札が一瞬黒く発光する（「これから何かが起きる」予告）。
    playSound("arrivalEffect");
    spawnArrivalBurst(pileEl, "black");
    await wait(getContactAnimSeconds("--eternal-anim-glow-duration", 1) * 1000);

  // ②山札から画面中央へ、裏向きのまま飛んでいく。
  const flightMs = getContactAnimSeconds("--eternal-anim-flight-duration", 1.5) * 1000;
  const { done: flightDone } = flyGhost(squarePileRect, centerRect, getCardBackImagePath(cardId), "setup-fly-card", flightMs);
  await flightDone;

  // ③中央で虹色の縁取りが揺らめきながら少し溜める（まだ裏向きのまま）。
  // ハマりどころ（ユーザー報告「エターナルカードが画面中央ではなく右下で見切れながらフリップ、
  // 裏面画像も上下見切れ」）: .eternal-reveal-cardはposition:fixedだが、body（ステージ）に
  // transform（translate+scale、applyViewportStage）が掛かっているためfixedはビューポートでは
  // なくステージ基準になる。centerRect（実画面座標、window.innerWidth/2基準）をそのまま
  // left/top/width/heightに入れるとステージのscale/offsetぶんズレて画面右下へ寄り、
  // ビューポート端で上下も見切れていた。flyGhost（ghost-flight.js）と同じく、画面中央を
  // stageClientToLocalでステージ座標へ、サイズをstageDeltaでステージ単位へ変換して使う
  // （こうするとflyGhostが飛ばす着地点とも一致する）。
  const revealLocalCenter = stageClientToLocal(window.innerWidth / 2, window.innerHeight / 2);
  const revealLocalW = stageDelta(centerRect.width);
  const revealLocalH = stageDelta(centerRect.height);
  const reveal = document.createElement("div");
  reveal.className = "eternal-reveal-card is-suspense";
  reveal.style.left = `${revealLocalCenter.x - revealLocalW / 2}px`;
  reveal.style.top = `${revealLocalCenter.y - revealLocalH / 2}px`;
  reveal.style.width = `${revealLocalW}px`;
  reveal.style.height = `${revealLocalH}px`;
  const inner = document.createElement("div");
  inner.className = "eternal-reveal-card-inner";
  // 裏面・表面を重ねて置き、不透明度の切り替えで差し替える（3Dの回転・backface-visibilityは
  // 使わない——下の④参照）。初期は裏面のみ表示。
  const backFace = document.createElement("div");
  backFace.className = "eternal-reveal-card-face is-back";
  backFace.style.backgroundImage = `url("${getCardBackImagePath(cardId)}")`;
  const frontFace = document.createElement("div");
  frontFace.className = "eternal-reveal-card-face is-front";
  showCardFace(frontFace, cardId, getCardImagePath(cardId)); // 表面＝テキスト合成（画像モードは画像）
  frontFace.style.opacity = "0";
  inner.appendChild(backFace);
  inner.appendChild(frontFace);
  reveal.appendChild(inner);
  document.body.appendChild(reveal);
  await wait(getContactAnimSeconds("--eternal-anim-suspense-duration", 1.5) * 1000);

  // ④横回転（scaleX）で表向きに反転。反転と同時にそのカードの色でバースト演出＋効果音。
  // ユーザー報告2026-08-07「スマホでフリップしても表にならず裏向きのまま」。原因は
  // rotateY＋backface-visibility＋preserve-3dの3Dフリップが一部モバイルで効かない
  // （bodyにステージ変形が掛かっていることも相まってpreserve-3dがフラット化し、裏面が
  // 表示されたままになる）こと。3Dに依存しない「横幅を0までつぶす→中間で絵を裏→表に
  // 差し替える→横幅を戻す」方式に変更し、全端末で確実に表向きになるようにした。
  reveal.classList.remove("is-suspense");
  reveal.style.setProperty("--eternal-reveal-color", `var(--color-${cardDef.color})`);
  playSound("arrivalEffect");
  reveal.classList.add("is-bursting");
  const flipMs = getContactAnimSeconds("--eternal-anim-flip-duration", 1) * 1000;
  const halfFlip = flipMs / 2;
  inner.style.transition = `transform ${halfFlip}ms ease-in`;
  inner.style.transform = "scaleX(0)";
  await wait(halfFlip);
  // 見えない瞬間（横幅0）で裏→表に差し替える。
  backFace.style.opacity = "0";
  frontFace.style.opacity = "1";
  inner.style.transition = `transform ${halfFlip}ms ease-out`;
  inner.style.transform = "scaleX(1)";
  await wait(halfFlip);
  reveal.classList.remove("is-bursting");

  // ⑤その色でしばらく脈打つように光る。
  reveal.classList.add("is-revealed");
  await wait(getContactAnimSeconds("--eternal-anim-hold-duration", 2) * 1000);

    // ⑥自分のロックエリアへ向けて飛んでいく。ロックスロットのDOMが見当たらない
    // （通常起きないはずだが念のため）場合は、その場でフェードせずそのまま消す。
    reveal.remove();
    // ハマりどころ（ユーザー報告「フリップ公開されたエターナルがロックエリアではなく画面
    // 左上に消えていく」）: 冒頭(line 4599)で取得したlockElは、その直後のrender()や演出中の
    // tick再描画で盤面が作り直され、既にDOMから切り離されている。切り離された要素の
    // getBoundingClientRect()は全て0を返すため、着地点が(0,0)＝画面左上になっていた。
    // 着地直前に必ずライブな盤面からロックスロットを取り直す。
    const liveTable = document.getElementById("game-table");
    const lockElNow = liveTable ? findLocationElement(liveTable, { zone: "lock", side, index: colorIndex }) : null;
    if (lockElNow) {
      const lockRect = lockElNow.getBoundingClientRect();
      const returnMs = getContactAnimSeconds("--eternal-anim-return-duration", 1) * 1000;
      const { done: returnDone } = flyGhost(centerRect, lockRect, getCardImagePath(cardId), "setup-fly-card", returnMs);
      await returnDone;
    }
  } finally {
    // 演出完了（⑥の着地）。ここで初めて実際のロックカードを表示へ戻す。例外・中断が起きても
    // 必ず解除して“エターナルが消えたまま”にならないようにする。
    suppressedEternalLockRender = null;
    render();
  }
  onDone();
}

// ゲート侵攻の「相手の手札を半分奪う」を、スリカエと同じ儀式演出で見せる（ユーザー要望⑩）。
// 攻撃側は“奪取前の手札”（相手の残り手札＝裏向き＋今まさに奪ったカード）を裏向きで並べ、
// 1枚ずつクリックして表向きにめくって奪う。奪われる側には自分の手札が表向きで見え、攻撃側の
// カーソル位置（ホバー）がわかる（スリカエと同じ broadcastRitualPick* を流用）。
// オンラインではサーバーが先に無作為抽選＆移動済みのため、結果は既に確定している——本演出は
// 純粋な見た目のみ（奪う枚数・カードは変えない）。安全のため、何があっても必ずonDone()を呼ぶ
// （呼ばないとゲート侵攻モーダルのキューが詰まる）。
async function playGateInvasionStealRitual(info, onDone) {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    try {
      onDone();
    } catch (e) {
      /* onDoneは次ステップへ進めるだけ。失敗しても握りつぶす */
    }
  };
  // どんな経路でも一定時間で必ず進める保険（キュー詰まり防止）。
  const safetyTimer = setTimeout(finish, 120000);
  try {
    const { attacker, defender, count, stolenTokenIds } = info;
    const self = getSelfSeat();
    // 攻撃側以外（奪われる側・観戦者）はここでは演出を持たない。奪われる側は攻撃側からの
    // broadcast（openRitualPickWatch）で表向きの手札を見る。観戦者は従来の飛翔演出を出す。
    if (self !== attacker) {
      if (self === defender) {
        // 奪われる側は、攻撃側からのbroadcastでopenRitualPickWatch（表向き＋ホバー）が開く。
        // その儀式が終わって watch が閉じるまで待ってから次の処理へ進める（即finish()すると
        // こちら側のキューだけ先走ってしまうユーザー報告への対応）。watchが開かない/閉じない
        // ネットワーク異常時は safetyTimer（30秒）で必ず進む。
        clearTimeout(safetyTimer);
        await new Promise((resolve) => {
          gateInvasionStealWatchResolve = resolve;
          setTimeout(resolve, 120000);
        });
        gateInvasionStealWatchResolve = null;
        finish();
      } else {
        clearTimeout(safetyTimer);
        playGateInvasionStealAnim(attacker, defender, count, finish);
      }
      return;
    }
    // ここから攻撃側本人。演出が無効な設定・素材不足なら従来の飛翔演出にフォールバック。
    const stolenTokens = (stolenTokenIds || []).map((id) => getState().tokens.find((t) => t.id === id)).filter(Boolean);
    if (isFlightAnimationDisabled() || isArrivalEffectDisabled() || stolenTokens.length === 0) {
      clearTimeout(safetyTimer);
      // 儀式をやらない（フォールバック）時は、奪われる側が待ち続けないよう終了合図だけは送る。
      broadcastRitualPickEnded({ targetPlayer: defender, pickedTokenIds: [] });
      playGateInvasionStealAnim(attacker, defender, count, finish);
      return;
    }
    // 奪取前の手札 = 相手の残り手札(自分にはcardId非公開＝裏) ＋ 奪ったカード(自分の手札に来て
    // いるのでcardIdが見える)。
    const remaining = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === defender
    );
    // #162（情報漏洩）修正: 以前はここで overrides = {tokenId: cardId} を作り broadcast に載せて
    // いたが、それは奪ったカードの中身を全チャンネル購読者（観戦者・無関係な3/4人目含む）へ
    // 送っていた＝秘匿すべきカードの漏洩だった。cardId は一切ブロードキャストしない。奪われる側は
    // 自分の手札の cardId を online.js のローカルキャッシュ（state_changed で pre-hydrate state から
    // 解決済み）から自力で引く（openRitualPickWatch 参照）。
    const order = [...remaining.map((t) => t.id), ...stolenTokens.map((t) => t.id)].sort(() => Math.random() - 0.5);
    const orderIndexOf = (tokenId) => order.indexOf(tokenId);

    // 奪われる側の実況（表向き＋ホバー）を開始。cardId は載せない（tokenId の並び順のみ）。
    broadcastRitualPickStarted({
      targetPlayer: defender,
      order,
      title: `${getPlayerName(attacker)}があなたの手札から${stolenTokens.length}枚を奪います…`,
    });

    // 攻撃側のモーダル（裏向き、sleight-ritual-modalの見た目を流用）。
    // ユーザー報告#9「クリックした裏向きカードと別のカードが反応した」。ゲート侵攻の奪取は
    // サーバーが無作為に決めており（＝プレイヤーが特定の札を選べるわけではない）、この
    // モーダルは決定済みの札を“めくって公開する”演出。しかし従来はスリカエの本物のピックと
    // 同じ見た目（各カードにcursor:pointer＋ホバーで浮く）だったため「この札を選んでいる」と
    // 誤解を招き、クリックした位置と別の位置の札がめくれて見えていた。is-steal-revealで
    // 個別カードの選択風の演出を消し（下のstyle.css）、めくりは常に左→右の順に統一する。
    const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10620 });
    const modal = document.createElement("div");
    modal.id = "sleight-ritual-modal";
    // #140: 以前は is-steal-reveal で個別カードのホバー演出を消していたが（「特定の札を選んで
    // いる」誤解を避けるため）、下記の通り「クリックした札がめくれる」ブラインドピックに変えた
    // ので、クリックできることを示すホバー演出は残す（is-steal-reveal は付けない）。
    const title = document.createElement("div");
    title.className = "sleight-ritual-title";
    title.textContent = "シャッフル中…";
    modal.appendChild(title);
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "sleight-ritual-cards";
    const n = order.length;
    const cardEls = order.map((tokenId, index) => {
      const el = document.createElement("div");
      el.className = "sleight-ritual-card";
      el.dataset.tokenId = tokenId;
      el.style.backgroundImage = `url("${getCardBackImagePath(null)}")`;
      el.style.setProperty("--shuffle-x", `${((n - 1) / 2 - index) * 1.1}rem`);
      el.style.setProperty("--shuffle-rot", `${index % 2 === 0 ? 9 : -9}deg`);
      el.style.animationDelay = `${(index % 4) * 0.06}s`;
      el.addEventListener("pointerenter", () => broadcastRitualPickHover({ targetPlayer: defender, index }));
      cardsWrap.appendChild(el);
      return el;
    });
    modal.appendChild(cardsWrap);
    modal.classList.add("is-shuffling");
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    await wait(1100); // シャッフル演出
    modal.classList.remove("is-shuffling");
    title.textContent = `タップして、奪う${stolenTokens.length}枚をめくろう…`;
    // 奪う札はサーバーが無作為に決めている（stolenTokens）。攻撃側にはどれも裏向きで区別が
    // 付かない＝ブラインド。#140「ホバー/クリックした札と別の札がめくれる」を解消するため、
    // 「クリックしたその札」をめくって奪った札を見せる（クリック位置＝めくる位置に一致）。
    // 奪う札自体はサーバー決定のまま変えないので公平（＝どの裏向き札を選んでも無作為に決まった
    // 札が出る、という“ブラインドで引く”体験）。奪われる側の実況は下で“実際に奪われる札”を
    // カードidで光らせるので、位置は違ってもカードの同一性で両画面が一致する。
    const revealOrder = [...stolenTokens].sort((a, b) => orderIndexOf(a.id) - orderIndexOf(b.id));

    // 1枚ずつ、クリックした裏向き札をめくって奪う。長時間まったく操作が無い（席を外した等）時だけ、
    // ゲート侵攻モーダルのキューが詰まらないよう、残りを一気にめくって終える最終手段を用意する。
    const revealedEls = new Set();
    let aborted = false;
    let pendingResolve = null;
    const onCardsClick = (e) => {
      if (!pendingResolve) return;
      if (e) {
        // 明示的なユーザークリック: まだめくっていない札の上でだけ受け付ける（既にめくった札や
        // 隙間のクリックは無視して、狙った札をめくれるようにする）。
        const clickedEl = e.target?.closest?.(".sleight-ritual-card");
        if (!clickedEl || revealedEls.has(clickedEl)) return;
        const r = pendingResolve;
        pendingResolve = null;
        r(clickedEl);
        return;
      }
      // 自動送り/放置（イベント無し）: 次の未めくり札を左から。
      const r = pendingResolve;
      pendingResolve = null;
      r(null);
    };
    cardsWrap.addEventListener("click", onCardsClick);
    const abandonTimer = setTimeout(() => {
      aborted = true;
      onCardsClick();
    }, 90000);
    // 疑似CPU/AFK代行が攻撃側の場合、誰もクリックしないので短い間隔で自動的にめくる
    // （90秒のabandonTimerを待たない＝スモークテスト/CPU戦がここで固まらない）。人間の攻撃側は
    // 従来通りクリックでじらせ、席を外したらabandonTimerで進む。
    let autoFlipTimer = null;
    if (isPseudoCpuTarget(attacker)) {
      autoFlipTimer = setInterval(() => onCardsClick(), 700);
    }
    for (let i = 0; i < stolenTokens.length; i++) {
      let clickedEl = null;
      if (!aborted) {
        clickedEl = await new Promise((resolve) => {
          pendingResolve = resolve;
        });
      }
      const tok = revealOrder[i];
      // クリックされた（まだめくっていない）札があればそこを、無ければ（自動送り/放置）まだ
      // めくっていない札を左から順にめくる。
      const el = clickedEl && !revealedEls.has(clickedEl) ? clickedEl : cardEls.find((c) => !revealedEls.has(c));
      if (el) {
        revealedEls.add(el);
        // 奪ったカードをめくって公開＝テキスト合成（裏面画像から表向きへ差し替え）。
        showCardFace(el, tok.cardId, getCardImagePath(tok.cardId));
        el.classList.add("is-stolen-reveal");
      }
      // 奪われる側は“実際に奪われる札(tok)”をその札の位置で光らせる（クリック位置ではなく
      // カードidベースなので、攻撃側のめくり位置と違っても奪われるカード自体は両画面で一致する）。
      broadcastRitualPickHover({ targetPlayer: defender, index: orderIndexOf(tok.id) });
      playSound("cardFlip");
      await wait(aborted ? 150 : 500);
    }
    clearTimeout(abandonTimer);
    if (autoFlipTimer) clearInterval(autoFlipTimer);
    cardsWrap.removeEventListener("click", onCardsClick);

    title.textContent = "奪いました！";
    // 奪われる側の実況に「これらが奪われた」を反映して閉じさせる。
    broadcastRitualPickEnded({ targetPlayer: defender, pickedTokenIds: stolenTokens.map((t) => t.id) });
    await wait(700);

    // 奪ったカードを攻撃側の手札へ飛ばしてからモーダルを閉じる。
    const toEl = document.querySelector(`.hand-area[data-player="${attacker}"]`);
    const toRect = toEl?.getBoundingClientRect();
    const flights = [];
    for (const tok of stolenTokens) {
      const el = cardEls[orderIndexOf(tok.id)];
      if (el && toRect) {
        const { done } = flyGhost(el.getBoundingClientRect(), toRect, getCardImagePath(tok.cardId), "setup-fly-card", 650);
        flights.push(done);
        await wait(160);
      }
    }
    await Promise.all(flights);
    backdrop.remove();
    modal.remove();
    clearTimeout(safetyTimer);
    finish();
  } catch (err) {
    console.error("playGateInvasionStealRitual failed", err);
    clearTimeout(safetyTimer);
    finish();
  }
}

// オンラインのゲート侵攻で「手札を奪う」演出（ユーザー要望「スリカエの時のような奪う演出を
// オンラインでも出したい」）。ローカルは対話的な儀式ピック（stealHandCardsRitualForGateInvasion）
// だが、オンラインはサーバーが既に無作為抽選済みのため同じ対話は再現できない。代わりに、
// 奪われた側の手札エリアから攻撃側の手札エリアへ、count枚ぶんのカード裏ゴーストを少しずつ
// 飛ばす純演出にする（儀式演出が使えない/フォールバック時に使う）。
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
    `${getPlayerName(defender)}の手札（裏向き）から奪う1枚を選んでください`,
    undefined,
    undefined,
    // #67: オンラインでは相手の手札が裏向き（cardId=null）なので、この時点の中央「奪った」
    // 公開は null.webp の壊れ画像になる。奪った本物のカードは直後に
    // checkContactAttackerResolution() が正しく中央表示するため、こちらの公開は省く。
    { suppressReceivedReveal: true }
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
  // ユーザー要望2026-08-28「『奪った』モーダルは接触演出の直後に」。ローカルの奪取儀式で
  // 選んだ後、中央の「奪った」表示関数をここに受け取り、タックル演出が終わってから出す。
  let deferredStealReveal = null;
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
        `${getPlayerName(attacker)}が、${getPlayerName(defender)}の手札（裏向き）から奪う1枚を選んでください`,
        undefined,
        undefined,
        {
          // 「奪った」モーダルが出るその瞬間に、実際に攻撃側の手札へ加える（ユーザー要望2026-08-08）。
          // ローカル専用（オンラインはサーバーのRESPOND_CONTACTが権威。ここで先に動かすと二重管理に
          // なるため）。RESPOND_CONTACT（state.js）は既に手札にある札を二重に奪わないよう対応済み。
          onPickedBeforeReveal: (token) => {
            moveToken(token.id, { zone: "hand", player: attacker });
            render();
          },
          // ユーザー要望2026-08-28「『奪った』モーダルは接触演出の直後に」。ここでは表示せず、
          // 表示関数だけ受け取ってタックル演出（下）の後で await して出す。
          deferReveal: (fn) => {
            deferredStealReveal = fn;
          },
        }
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
  // #69: 下の「保険タイマー」のidを関数スコープに置き、正常に finishContactResolution が
  // 走ったらキャンセルできるようにする（でないと、接触解決が正常に終わって次のターンへ
  // 移った後に保険が遅れて発火し、たまたま次の優先権保持者が defender と一致していると
  // 優先権を誤って手番プレイヤーへ戻し、余計なNEXT_TURN＝相手ターン飛ばし・優先権表示の
  // 乱れを起こす。#61で入れた保険が誤爆していた）。
  let contactSafetyTimer = null;
  if (approve && defenderPieceId) {
    const priorityBeforeTransfer = getState().priorityPlayer;
    logAction("diag-delegate", { phase: "contact-request", defender, turnPlayer: getState().turnPlayer });
    // #61修正: タイマーOFFの対局では priorityPlayer が null のままで、通常の
    // transferPriorityTo() は何もしない（＝接触解決中のターン保持が効かず、防御側の
    // 到達効果処理中にターンが進んでしまう）。ここは「タイマーOFFでも一時的に優先権で
    // 手番を保持したい」ケースなので initializeIfUnset:true で null からでも移譲する。
    transferPriorityTo(defender, { initializeIfUnset: true });
    // #61保険: タイマーOFFでは優先権返却の安全タイマー（turn-timerのtick）が動かないため、
    // 万一この後の解決(finishContactResolution)が呼ばれず優先権が防御側に残っても、ターンが
    // 恒久的に進めなくならないよう保険を仕込む。十分な猶予後に「まだ防御側が保持したまま・
    // 到達処理も終わっている」場合だけ手番プレイヤーへ強制返却する（正常時は既に返却済みで
    // 条件に掛からず無害）。この接触解決コードは防御側の端末で走るので isArrivalEffectProcessing()
    // はその端末の実状を正しく見られる。優先権の書き込みはサーバー永続でターンプレイヤーへ伝播する。
    {
      const heldTurnPlayer = getState().turnPlayer;
      contactSafetyTimer = setTimeout(() => {
        contactSafetyTimer = null;
        const s = getState();
        // 正常時は finishContactResolution が既にこのタイマーをクリアしているので、ここへは
        // 「本当に解決が返って来なかった（stuck）」場合しか来ない。念のため条件でも二重確認する。
        if (s.priorityPlayer === defender && s.turnPlayer === heldTurnPlayer && !isArrivalEffectProcessing()) {
          logAction("diag-contact-priority", { phase: "safety-return", defender, turnPlayer: heldTurnPlayer });
          transferPriorityTo(heldTurnPlayer);
        }
      }, 20000);
    }
    // #61診断: 接触解決中の「防御側へ優先権を移してターンを保持する」仕組みが効いたかを記録する。
    // タイマーOFFの対局では state.priorityPlayer が終始 null で、transferPriorityTo() は
    // 早期return（何もしない）。その場合 took:false になり、ターンプレイヤー側の
    // ターン終了ガード(isEndTurnDisabledNow)も効かず、防御側の到達効果処理中にターンが
    // 進んでしまう（=#61）。次回発生時にこの1行で確定できる。
    logAction("diag-contact-priority", {
      phase: "transfer-to-defender",
      defender,
      turnPlayer: getState().turnPlayer,
      priorityBefore: priorityBeforeTransfer,
      priorityAfter: getState().priorityPlayer,
      took: getState().priorityPlayer === defender,
    });
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

  // 接触演出の順序を後から追えるよう記録（ユーザー要望2026-08-18「順序がしっかりわかるよう
  // アクションログを強化して」）。tackle が null なら「なぜ演出無しか」も残す。
  logAction("diag-contact-tackle", {
    phase: tackle ? "lunge-start" : "no-anim",
    reason: tackle ? undefined : isFlightAnimationDisabled() ? "flight-anim-disabled" : "piece-dom-not-found",
    attacker,
    defender,
    online: isOnlineMode(),
  });
  if (tackle) {
    // 汎用render()リスナー・remote-move-animator.jsを一時停止し、この後の
    // respondContact()による状態変化で盤面が勝手に作り直されないようにする
    // （suppressGenericRenderForOnlineStartと同じパターン）。
    suppressGenericRenderForContactTackle = true;
    await playContactLunge(tackle);
    logAction("diag-contact-tackle", { phase: "lunge-end-state-move" });
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
    logAction("diag-contact-tackle", { phase: "flight-start" });
    await playContactFlight(defenderPieceId, tackle.defenderFromRect);
    suppressGenericRenderForContactTackle = false;
    logAction("diag-contact-tackle", { phase: "flight-end" });
  } else if (approve) {
    playSound("piecePlace");
  }
  render();

  // ユーザー要望2026-08-28「『奪った』モーダルは接触演出の直後に」。タックル演出（lunge→
  // move→flight）が終わってから、奪ったカードの中央表示を出す（閉じるまで await）。強制移動の
  // 到達処理（下）はその後に始まるので、到達効果の選択モーダルと重ならない。
  if (deferredStealReveal) {
    try {
      await deferredStealReveal();
    } catch (err) {
      console.error("deferred steal reveal failed", err);
    }
  }

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
    // #13: 強制移動の到達処理が終わったら優先権をターンプレイヤーへ返す（結果モーダルは
    // 到達より前に出すよう変更したため、ここでは結果モーダルは出さない。下参照）。
    const finishContactResolution = () => {
      // #69: 正常に解決できたので保険タイマーをキャンセルする（遅れて誤発火し、次のターンの
      // 優先権を巻き戻す事故を防ぐ）。
      if (contactSafetyTimer) {
        clearTimeout(contactSafetyTimer);
        contactSafetyTimer = null;
      }
      logAction("diag-delegate", { phase: "contact-resolved", defender, returningPriorityTo: getState().turnPlayer });
      // #61診断: 接触の到達効果解決が終わった時刻・状態を記録（diag-next-turnと突き合わせて
      // 「解決前にNEXT_TURNが飛んでいないか」を確認する）。
      logAction("diag-contact-priority", {
        phase: "finish",
        defender,
        priorityPlayer: getState().priorityPlayer,
        arrivalProcessing: isArrivalEffectProcessing(),
        turnPlayer: getState().turnPlayer,
      });
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
    const startForcedMoveArrival = async () => {
      if (defenderPiece && defenderActuallyMoved) {
        // #40-2: 接触の強制移動は「移動」なので、移動先が裏向きなら（防御側に「開く/開かない」を
        // 選ばせず）必ずオープンして到達効果を発動する（docs/rulebook.md「移動: …裏向きなら、
        // オープンする」）。従来は maybeTriggerCardArrival が裏向きに promptCardOpen を出していて、
        // 防御側が自ゲートに置かれた罠を開かず回避できてしまう／オンラインでは差分レースで
        // player:null になり不発だった。ここで先に必ず表向きにしてから到達判定へ渡す。
        const forcedCard = findTopCardAt(defenderPiece.location);
        if (forcedCard && !forcedCard.faceUp) {
          if (isOnlineMode()) {
            try {
              await flipToken(forcedCard.id);
              markSelfHandled([forcedCard.id]); // remote-move-animatorの差分再発火で二重にならないように
              await fetchAndHydrate(getCurrentGameId());
            } catch (err) {
              console.error("forced-move auto-open failed", err);
            }
          } else {
            flipToken(forcedCard.id);
            render();
          }
        }
        // 表向きになったので maybeTriggerCardArrival は promptCardOpen ではなく triggerCardArrival
        // 経路へ進む（防御側の到達として自動処理される）。
        maybeTriggerCardArrival(defenderPiece.location, defenderPiece.id, undefined, finishContactResolution);
      } else finishContactResolution();
    };
    // ユーザー報告#13「接触処理（何を奪われたかのモーダルも出て終わってから）、接触による
    // 強制移動の到達処理を行いたい」。順序を「結果モーダル→（閉じたら）強制移動の到達処理」に
    // する。結果モーダルを閉じてから到達を始めるので、到達効果の選択モーダルと結果モーダルが
    // 重ならず、以前この重なりを避けるため順序を「到達→結果」にしていた不具合も起きない。
    // 閉じ忘れで優先権がdefenderに残ったまま詰まらないよう、安全タイマーでも先へ進める。
    let forcedArrivalStarted = false;
    const proceedToForcedArrivalOnce = () => {
      if (forcedArrivalStarted) return;
      forcedArrivalStarted = true;
      startForcedMoveArrival();
    };
    // ユーザー要望2026-08-17「接触の結果モーダルは不要（駒の接触演出＋儀式ピックで、奪った/
    // 奪われたカードは既に分かるため）」。モーダルを出さず、そのまま強制移動の到達処理へ進む。
    proceedToForcedArrivalOnce();
  }
}

// --- 黒の契約の烙印の★基本効果（ユーザー要望2026-08-09。従来は未実装だった） ------------------
// 効果文: 「★あなたのロックフェイズにロックしないなら１枚ドローしてもよい。これの置かれた
// ロックエリアにロックしたなら、あなたの手札を２枚捨て、これを任意のマスに裏向きで置く。」
// ★は「基本効果（常時適用）」で、この烙印が“あなたのロックエリアに置かれている”間だけ働く。
// ●到達でロックエリアに置かれる（＝1枠を塞ぐ）ので、その呪いを解く/緩和する挙動を与える。
//   (b) ロックしたら: 手札2枚（色不問）を捨て、烙印を盤面へ裏向きで移す（＝枠が空く）。
//   (a) ロックしないなら: 1枚ドローしてもよい（枠を塞がれている見返り。clause aはlock→handの
//       遷移でphase-automationから onLockPhaseEndedWithoutLock 経由で呼ぶ）。
function findContractBrandInLockAreaOf(player) {
  const side = SEAT_TO_SIDE[player];
  return (
    getState().tokens.find(
      (t) => t.kind === "card" && t.cardId === "black-contract-brand" && t.location.zone === "lock" && t.location.side === side
    ) || null
  );
}
let contractBrandBusy = false;
// (b) ロックした時の処理。maybeAnnounceLockからfire-and-forgetで呼ぶ（同期のロック確定処理は
// 止めない）。手札2枚を捨て（CPUは自動、人間は選択。ownerはロックした本人＝turnPlayerなので
// #58のような他者ターン誤判定は起きない）、烙印を任意マスへ裏向き（faceUpForLocationでcellは
// 自動的に裏向き）で移す。
async function runContractBrandCurseOnLock(player, brandId) {
  if (contractBrandBusy) return;
  contractBrandBusy = true;
  // #117/#118: ★(b)は「手札2枚捨て＋烙印を任意マスへ裏向きで置く」を非同期（捨てる札の選択・
  // 置くマスの選択を含む）で行う。maybeAnnounceLockからfire-and-forgetで呼ばれるため、以前は
  // このマルチステップ処理が終わる前に、フェイズ自動進行（lock→hand→move）やCPUの次のロック/
  // 移動が並行して走り、「烙印を場に置く前にムーブフェイズになる」(#117)・処理中の別ロックで
  // 状態が乱れる(#118)不具合があった。handEffectBusy を立てて、★(b)が完全に終わるまでフェイズ
  // 進行・CPUの次アクション・自動ターン終了を止める（カウンターロック#106と同じ考え方。
  // performPriorityTimeoutAutoActionもpicker解決の後にhandEffectBusyで早期returnするよう対にした）。
  setHandEffectBusy(true);
  try {
    const brandName = getCardDefinition("black-contract-brand")?.name || "誘惑の黒の烙印";
    // (1) 「烙印スロットにロックした→手札2枚捨てる」を明示（ユーザー要望2026-08-15
    //     「今は何が起きたかあまりわからないまま過ぎていく」）。
    await announceEffectReasonForEffect(
      "black-contract-brand",
      `${getPlayerName(player)}が${brandName}の色のロックエリアにロックしました。${brandName}の効果で手札を2枚捨てます。`
    );
    for (let i = 0; i < 2; i++) {
      const hand = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player);
      if (hand.length === 0) break; // 手札が尽きたらそれ以上は捨てられない（善処）
      const ids = new Set(hand.map((t) => t.id));
      const chosen = hand.length === 1 ? hand[0] : await requestHandCardChoiceForEffect(player, `${brandName}：捨てる手札を選択してください`, ids);
      if (!chosen) break;
      await discardFromHandReveal(chosen.id);
    }
    const brand = getState().tokens.find((t) => t.id === brandId);
    if (brand && brand.location.zone === "lock") {
      const cells = [];
      for (let r = 0; r <= 6; r++) for (let c = 0; c <= 6; c++) cells.push({ zone: "cell", row: r, col: c });
      const dest = await requestCellChoiceForEffect(cells, `${brandName}を裏向きで置くマスを選択してください`, { owner: player });
      if (dest) {
        // #114（ユーザー要望2026-08-15）: ★(b)は「これを任意のマスに裏向きで置く」。ところが
        // MOVE_TOKENは「場(ロック)→場(マス)」の移動では表裏を変えない仕様（state.js参照）のため、
        // ●で表向きに置かれていた烙印が表向きのままマスに残ってしまっていた。移動後に表向きなら
        // flipToken で裏向きへ倒す（烙印は★(b)発火時点で常にロックエリアの表向きなので実質必ず倒す）。
        if (isOnlineMode()) {
          try {
            await moveToken(brandId, dest);
            markSelfHandled([brandId]);
            await fetchAndHydrate(getCurrentGameId());
            if (getState().tokens.find((t) => t.id === brandId)?.faceUp) {
              await flipToken(brandId);
              markSelfHandled([brandId]);
              await fetchAndHydrate(getCurrentGameId());
            }
          } catch (err) {
            console.error("runContractBrandCurseOnLock (relocate) failed", err);
          }
        } else {
          moveToken(brandId, dest);
          if (getState().tokens.find((t) => t.id === brandId)?.faceUp) flipToken(brandId);
        }
        render();
        // ユーザー要望2026-08-16「置く系の効果はどこに置いたか行動ログに記載してほしい」。烙印は
        // ロックエリアに表向きで見えていた公開カードなので、名前と座標を出してよい（revealName:true）。
        const brandCoord = actionLogCoordLabel(dest);
        logAction("place", { player, cardId: "black-contract-brand", location: dest, faceDown: true, revealName: true });
        // (2) 「烙印を盤面へ裏向きで置いた」を明示。ロックエリアから外れて盤面に移ったことが
        //     一目でわからないので、移動後に別モーダルで知らせる（どのマスに置いたかも添える）。
        await announceEffectReasonForEffect(
          "black-contract-brand",
          `${brandName}を盤面${brandCoord ? `の${brandCoord}` : ""}に裏向きで置きました。`
        );
      }
    }
    render();
  } finally {
    contractBrandBusy = false;
    setHandEffectBusy(false); // #117/#118: ★(b)が完全に終わったのでフェイズ進行を再開させる
  }
}
// (a) ロックフェイズを「ロックせずに」終えた時、烙印が自分のロックエリアにあるなら1枚ドローしてよい
// （任意）。phase-automation.jsのlock→hand遷移から呼ばれる（registerContractBrandHelpers）。
// #112（ユーザー要望2026-08-15）: ★は烙印1枚ごとの効果。本気エイドスはノワールの両端に烙印を
// 2枚置くため、ロックしなかった場合はロックエリアの烙印枚数分（＝2枚）ドローできる。1枚ずつ任意
// なので、枚数分だけ独立に「引くか？」を尋ねる（1枚目は引いて2枚目は見送る、も可能）。
async function offerContractBrandDrawIfNoLock(player) {
  if (contractBrandBusy) return;
  const brandCount = getState().tokens.filter(
    (t) => t.kind === "card" && t.cardId === "black-contract-brand" && t.location.zone === "lock" && t.location.side === SEAT_TO_SIDE[player]
  ).length;
  if (brandCount === 0) return;
  contractBrandBusy = true;
  // #120: ★(a)は烙印の枚数分ループして各回「引くか？」を尋ねる非同期処理だが、lock→hand遷移から
  // fire-and-forgetで呼ばれるため、以前はhandEffectBusyを立てておらず、ループの途中でCPUのハンド
  // フェイズのアクション（ノワールの手札効果等）が並行して割り込み、2枚目の烙印ドローが失われて
  // いた（＝2枚あるのに1枚しか引かない）。★(b)と同じく handEffectBusy を立てて、烙印ドローが全部
  // 終わるまでフェイズ進行・CPUの次アクションを止める（performPriorityTimeoutAutoActionはpicker
  // 解決の後にhandEffectBusyで早期returnするので、この間もYes/Noの自動応答自体は解決される）。
  setHandEffectBusy(true);
  try {
    const brandName = getCardDefinition("black-contract-brand")?.name || "誘惑の黒の烙印";
    for (let i = 0; i < brandCount; i++) {
      const label =
        brandCount > 1
          ? `🖋 ${brandName}：ロックしなかったので、烙印${brandCount}枚のうち${i + 1}枚目のドローができます。ドローしますか？（任意）`
          : `🖋 ${brandName}：ロックしなかったので1枚ドローできます。ドローしますか？（任意）`;
      const wantsDraw = await confirmGenericYesNo(label, {
        yesLabel: "ドローする",
        noLabel: "しない",
        owner: player,
        cardId: "black-contract-brand",
        // #120: 難易度=新人でも必ず「ドローする」に。烙印ドローは無条件で得なので取りこぼさない。
        cpuAutoResolveId: "yes",
      });
      if (!wantsDraw) continue;
      await drawCardsForEffect(player, 1);
      render();
      // 行動ログに烙印ドローを明示（ユーザー要望2026-08-15）。マイデッキと違い烙印ドローは
      // 共有山札からなので pile:"deck"。indexを持たせて、複数枚の烙印ドローが友好ログ窓の
      // 連続dedupで1行にまとまらないようにする（#120: 2枚引いたのが2行で見えるように）。
      logAction("brand-draw", { player, brandCount, index: i + 1 });
      // ★(a)ドローが実際に起きたことを明示（ユーザー要望2026-08-15「烙印ドローがわかりづらい」）。
      // CPU/疑似CPUは上のYes/Noが自動応答されるため、観戦者にはドローしたことが見えない。オンライン
      // 相手にも中継される（announceEffectReasonForEffectがbroadcastする）。
      await announceEffectReasonForEffect("black-contract-brand", `${getPlayerName(player)}はロックしなかったので、${brandName}の効果で1枚ドローしました。`);
    }
  } finally {
    contractBrandBusy = false;
    setHandEffectBusy(false);
  }
}

// マイデッキ戦（マイデッキ.txt）で「ロックする代わりにマイデッキから1枚引く」を行った時の
// お知らせ（ユーザー要望2026-08-15「マイデッキからのドローも行動ログに載せ、中央モーダルで
// 全プレイヤーに知らせて」）。マイデッキの中身は秘匿（各自の裏面で伏せる）なので、引いた
// カード名は明かさず「1枚引いた」事実だけを伝える。announceEffectReasonForEffectは中央モーダル
// ＋オンライン中は全プレイヤーへ中継（cardId=nullなのでカード名行は出ず本文だけ表示）。
function announceMyDeckDraw(player) {
  logAction("my-deck-draw", { player });
  void announceEffectReasonForEffect(null, `${getPlayerName(player)}がマイデッキから1枚ドローしました。`);
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

// #59-①: CPU防御側がカウンターロックを使うべきか（接触された時の判断。contact-approval.jsから
// 注入される cpuDecider）。新人（ブレイン非駆動）は使わない。中級以上は、今ロックできる手札が
// あれば「接触を無効化＋手札1枚ロック」でロック前進の分だけ明確に得なので使う。ロックできる
// 手札が無ければ温存して承認する（カウンターロックは貴重札のため）。判定時点でカウンターロック
// 自体は所持済み（呼び出し側の hasCounterLock で担保）。
function decideCpuUseCounterLock(defender) {
  if (!isCpuBrainDriving(defender)) return false;
  return getLockableHandTokensExceptFinal(defender).tokens.length > 0;
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
  // #106: カウンターロックの反応（①接触無効化→②カウンターロックを捨てる→③無効化の告知→
  // ④「手札を1枚ロックしますか？」の確認/選択）が全部終わるまで、相手(CPU)の手番が自動終了
  // しないように handEffectBusy を立てておく（computeShouldEmphasize が handEffectBusy を見て
  // 自動ターン終了を止める）。これをやらないと、①respondToContact(false) で pendingContact が
  // 消えた瞬間にCPUの自動ターン終了(NEXT_TURN)が走り、④の確認モーダルが相手のムーブフェイズ
  // 終了後（次の自分の手番）にずれて出てしまう（ユーザー報告#106）。finally で必ず下ろす
  // （取り残しは#93のセーフティ・ウォッチドッグも保険で解除する）。
  setHandEffectBusy(true);
  try {
  // 診断（カウンターロックの「ロックしますか？」で両ボタン押せず詰み、CPU戦報告）: どの席が
  // 使ったか・優先権・疑似CPU対象かを残す。再発時にログから原因（モーダルがCPU扱いで隠れた
  // /別のpickerがクリックを奪った等）を切り分けるため。
  logAction("diag-counter-lock", {
    phase: "use-start",
    defender,
    attacker: pending.attacker,
    priorityPlayer: getState().priorityPlayer,
    turnPlayer: getState().turnPlayer,
    selfSeat: getSelfSeat(),
    isPseudoCpuTargetDefender: isPseudoCpuTarget(defender),
  });
  await respondToContact(false);
  await discardFromHandReveal(token.id);

  // #90: 接触をカウンターロックで無効化したことを全プレイヤーに知らせる（[[effect-result-
  // notification-policy]]）。announceEffectReasonForEffectはオンラインでは全員へ中継し、
  // カウンターロックのカード画像付きモーダルを出す（CPU戦では結果ホールドでクリックまで残す）。
  await announceEffectReasonForEffect(
    "red-counter-lock",
    `${getPlayerName(defender)}のカウンターロックで、${getPlayerName(pending.attacker)}の接触は無効になりました。`
  );

  // カウンターロックの「あなたの手札を１枚ロックしてもよい」のロック可否は、通常のロック
  // フェイズの判定（isCardLockable。七色の欠片は常にロック不可）ではなく、ハンドフェイズの
  // 特殊ロック（セレナーデ等と同じ getLockableHandTokensExceptFinal）で判定する——カウンター
  // ロックは七色の欠片も単体でロックできる特殊効果だから（不具合#58: 七色の欠片しかロック
  // できない手札だと、isCardLockableが虹を除外するせいで案内モーダルが出なかった）。
  const { candidateSlotsFor, tokens: lockableTokens } = getLockableHandTokensExceptFinal(defender);
  logAction("diag-counter-lock", {
    phase: "before-confirm",
    defender,
    lockableCount: lockableTokens.length,
    // isCpuSelectingNow(defender) が true だとモーダルが is-cpu-hidden で隠れる（人間の防御側なら
    // false のはず）。activeEffectPicker.type が cell/hand/player だとクリックが奪われうる。
    activeEffectPickerType: activeEffectPicker ? activeEffectPicker.type : "none",
  });
  if (lockableTokens.length === 0) return; // 善処の原則: ロックできるカードが無ければ何も聞かずに終わる
  // owner=defender を明示（不具合#58）。カウンターロックは相手（CPU）のターン中に人間の
  // 防御側が使うため、owner を渡さないと優先権保持者＝攻撃側CPUの選択と誤判定され、この
  // モーダル・ピッカーが隠されてCPUの自動処理に勝手に解決されてしまう（#33と同根）。
  const wantsToLock = await confirmGenericYesNo(
    "🛡️ カウンターロックの効果で、手札を1枚ロックエリアにロックしますか？（任意）",
    { yesLabel: "ロックする", noLabel: "しない", owner: defender }
  );
  if (!wantsToLock) return;
  const lockableIds = new Set(lockableTokens.map((t) => t.id));
  // requestHandCardChoiceForEffect は owner=player(=defender) を自動で設定するのでそのままでよい。
  const chosen =
    lockableTokens.length === 1
      ? lockableTokens[0]
      : await requestHandCardChoiceForEffect(defender, "ロックする手札を選択してください", lockableIds, { purpose: "lock" });
  if (!chosen) return;
  // 七色の欠片・無色は色スロットが一意に定まらないので、置ける空きスロットから選ばせる
  // （候補が1つなら自動、複数なら「ロックする場所を選択してください」。セレナーデと同じ扱い）。
  const slots = candidateSlotsFor(chosen);
  if (slots.length === 0) return;
  const dropTarget =
    slots.length === 1 ? slots[0] : await requestCellChoiceForEffect(slots, "ロックする場所を選択してください", { owner: defender });
  if (!dropTarget) return;
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
  } finally {
    // #106: 反応が全経路（途中returnも含む）で終わったら handEffectBusy を必ず下ろす。
    setHandEffectBusy(false);
  }
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
// ドロー演出（flyDrawnCardToHand）の飛翔ゴーストが手札へ着地するまでの間、汎用render()
// リスナーを一時停止するためのフラグ（ユーザー報告「プレゼントのドローで、ドロー演出の
// 前にもう手札にカードが加わっていた」）。オンラインのdrawFromPileはonlineTransport経由で
// 結果をローカルへ適用しnotifyListeners()を発火するため、このsubscribe(render)が飛翔前に
// 先回りして実カードを手札に描いてしまっていた。着地後の手動render()まで抑止する。
let suppressGenericRenderForDrawFlight = false;

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
    // CPU戦（ローカル1人用）はA対Cの2人固定。セットアップ前（activePlayers==[]、盤面を空に
    // した直後～配布演出開始まで）に下の「4人プレビュー」を出すと、B・Dの席が一瞬見えて
    // しまう（ユーザー報告2026-08-07「一瞬やはりBとDが描画される」）。CPU戦の間はA/Cだけ表示する。
    if (isCpuBattleActive()) return player === "A" || player === "C";
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
  // 「手札を画面下に固定する」設定がONなら、自分の手札(扇＋公開ドロー)を盤面ズームの外側の
  // 固定オーバーレイへ移す（ユーザー要望2026-08-07）。OFFなら盤面内のまま。
  syncFixedHandOverlay(table);
  updateEndTurnButton();
  updateDrawButton();
  updatePublicDrawButton();
  updateHandShuffleButton();
  updateSelfHandStatus();
  updateTurnRoundCounter();
  updateAfkCpuBanner();
  updateFinalLockApprovalBanner();
  checkGomennasaiAutoApproval();
  checkCpuFinalLockApproval();
  updateTimerToggleButton();
  updateTimerToggleBanner();
  updateAutoProcessingToggleBanner();
  updateContactApprovalModal();
  checkCounterLockAutoApproval();
  checkContactAttackerResolution();
  // ランク戦は自動処理必須（docs/ranked-spec.md「自動処理必須・タイマー必須」）。タイマーは
  // サーバー同期のtimerConfigで強制されるが、自動処理はクライアントローカルの設定
  // （card-effect-engine.js）なので、ランク対局中はここで常にONへ強制する（reconnect・
  // 誤操作・オフ承認の取りこぼし対策）。setAutoProcessingEnabledは副作用の無い純粋な
  // ローカルsetterなので、毎render idempotentに呼んで安全。UI側（options-menu.js）でも
  // ランク中はトグルを固定するが、状態の最終的な担保はここで行う。
  if (isOnlineMode() && isRankedGame() && !isAutoProcessingEnabled()) {
    setAutoProcessingEnabled(true);
  }
  // ゲート侵攻演出のモーダルがrender等でDOMから外れていたら貼り直す保険（オンラインで
  // 演出が出ないという報告への対応。gate-invasion-modal.jsのreapplyGateInvasionModal参照）。
  reapplyGateInvasionModal();
  // #135: ピッカー・手札効果等の処理中に届いて保留していたゲート侵攻を、処理が空いた
  // タイミング（＝状態が変わってrenderが走った今）で流す。flush自体がbusyなら何もしない。
  flushPendingGateInvasionEvents();
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
  } else {
    applyNormalFit();
  }
  // ズーム/パン/リサイズ/再描画のたびに、自分のロックエリアが画面外へ出ていないか見て、
  // 出ていれば画面下中央のミニロックエリアを出す（ユーザー要望2026-08-07）。
  updateMiniLockArea();
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

// 相手の駒の真上に出すフローティングプロンプト（接触する／オープンする等）が画面外へ
// はみ出して一部しか押せなくなる問題への対応（不具合#55「接触するボタンが端っこしか
// 反応しない」）。これらは駒のtop中央を基準に transform: translate(-50%, -100%…) で
// 上へ持ち上げて出すため、対象の駒が盤面の上端近く（CPU戦の相手＝盤面奥＝画面上側など）に
// あると、ボタンが画面上端よりさらに上へ飛び出し、見えている下端しかクリックできなく
// なる（＝「端っこしか反応しない」）。#34で相手ステータスパネルとの前後関係（z-index）は
// 解決済みで、これはそれとは別の「画面外はみ出し」が原因。
// promptはposition:fixedだが body 自体が stage 変形（translate+scale）を持つため、
// 画面座標で測った必要シフト量を stageスケールで割ってから left/top（ステージローカル座標）へ
// 足し込む。append 直後の実測矩形（getBoundingClientRect＝変形適用後の画面座標）を使う。
function clampFloatingPromptIntoView(promptEl) {
  const margin = 6; // 画面端からの最小余白(px)
  const r = promptEl.getBoundingClientRect();
  if (!r.width || !r.height) return; // 非表示・未レイアウト時は何もしない
  let dxScreen = 0;
  let dyScreen = 0;
  if (r.left < margin) dxScreen = margin - r.left;
  else if (r.right > window.innerWidth - margin) dxScreen = window.innerWidth - margin - r.right;
  if (r.top < margin) dyScreen = margin - r.top;
  else if (r.bottom > window.innerHeight - margin) dyScreen = window.innerHeight - margin - r.bottom;
  if (!dxScreen && !dyScreen) return;
  const scale = currentStageScale || 1;
  const curLeft = parseFloat(promptEl.style.left) || 0;
  const curTop = parseFloat(promptEl.style.top) || 0;
  promptEl.style.left = `${curLeft + dxScreen / scale}px`;
  promptEl.style.top = `${curTop + dyScreen / scale}px`;
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
    return { tilt: style.getPropertyValue("--table-tilt").trim(), offsetX: "0rem", offsetY: "0rem", scaleMultiplier: 1, flat: false };
  }
  return {
    tilt: style.getPropertyValue("--table-tilt-flat").trim() || "0deg",
    offsetX: style.getPropertyValue("--table-flat-offset-x").trim() || "0rem",
    offsetY: style.getPropertyValue("--table-flat-offset-y").trim() || "0rem",
    scaleMultiplier: parseFloat(style.getPropertyValue("--table-scale-flat")) || 1,
    flat: true,
  };
}

// #game-tableの変形文字列を組み立てる（続き246）。
// 3Dモード（本編）は従来通り rotateX(θ) + scale3d(s,s,s)。これはZ軸(駒の高さtranslateZ)も
// 同率で縮小するために scale ではなく scale3d を使い、傾きは本物の3D回転(rotateX)。
// flat/iso表示では純2Dの scale(s, s*cosθ) にする——rotateX/scale3d は3D変形関数で、
// perspective:none 下でも #game-table を「3D合成レイヤー」にしてしまい、ピンチ（scale3dの
// 倍率変化）でこの重い3Dレイヤーが再ラスタライズされて、はみ出した2.5D側面が重なる隣の
// カード/ロックバーがちらつく一因になっていた（実機ログで「ピンチで明確にちらつく」と確認）。
// rotateX(θ)はperspective:none下では縦をcos(θ)倍する直交投影なので、2Dの scale(s, s*cosθ)で
// 見た目を完全に等価に再現でき、3D合成レイヤーを一切作らない。flatではZ軸の奥行き(translateZ)
// 自体が無い（フラット化されている）ので scale3d は不要。
function tableTransform(translatePart, tilt, s, flat) {
  const head = translatePart ? `${translatePart} ` : "";
  if (!flat) return `${head}rotateX(${tilt}) scale3d(${s}, ${s}, ${s})`;
  const deg = parseFloat(tilt) || 0;
  const cos = Math.cos((Math.abs(deg) * Math.PI) / 180);
  return `${head}scale(${s}, ${s * cos})`;
}

function applyNormalFit() {
  const table = document.getElementById("game-table");
  const { tilt, offsetX: flatOffsetX, offsetY: flatOffsetY, scaleMultiplier, flat } = getFlatTableAdjustments();
  // 3Dモードは scale3d（Z軸=駒の高さtranslateZも同率縮小）、flat/isoは純2D scale（tableTransform参照）。
  table.style.transformOrigin = "";
  table.style.transform = tableTransform("", tilt, 1, flat);
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
    table.style.transform = tableTransform(
      `translate(calc(${manualPanX}rem + ${flatOffsetX}), calc(var(--camera-offset-y) + ${manualPanY}rem + ${flatOffsetY}))`,
      tilt,
      s,
      flat,
    );
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
  const { tilt, offsetX: flatOffsetX, offsetY: flatOffsetY, scaleMultiplier, flat } = getFlatTableAdjustments();
  table.style.transformOrigin = "";
  table.style.transform = tableTransform("", tilt, 1, flat);

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
  table.style.transform = tableTransform(
    `translate(calc(${manualPanX}rem + ${flatOffsetX}), calc(var(--camera-offset-y) + ${manualPanY}rem + ${flatOffsetY})) translate(${offsetX}, ${offsetY})`,
    tilt,
    scale,
    flat,
  );
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

// スマホ/タブレット向けの「おすすめ表示（2D＋拡大）」で使う盤面拡大（ユーザー要望2026-08-17
// 「スマホでは2Dにしてさらに拡大状態にするのが一番見やすい。誘導を入れたい」）。手動ズームは
// リセットして素の盤面拡大レベル1にする。tablet-2d-warning.js からregister経由で呼ばれる。
function applyRecommendedMobileZoom() {
  resetManualView();
  boardZoomLevel = 1;
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
  // ユーザー報告2026-08-18「ブラウザ窓を画面の半分にすると盤面拡大時のミニロックエリアが
  // 見えなくなる（＝小さくなって読めない）」。ミニロックはステージ(body)の子でステージ倍率で
  // 一緒に縮むため、窓が狭い（倍率が小さい）とごく小さな帯になってしまう。ステージ倍率を
  // CSS変数に出し、ミニロックだけはこの倍率が小さい時に逆補正して一定の読める大きさを保つ
  // （#mini-lock-area(-top)のtransformで参照。倍率が十分大きい通常窓では補正1＝従来通り）。
  document.documentElement.style.setProperty("--stage-scale", String(scale));
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
  // #141: 盤面拡大中のミニロックエリアのスロット（is-usable/is-pick-target＝pointer-events:auto）を
  // クリックした時、その背面にある手札カードまで掴んで手札効果を誤発動させないようにする。
  // ミニロックのスロットは自前のclick（エターナル使用）／captureフェーズのピッカー（配置選択）が
  // 処理するので、盤面ドラッグ側はミニロック上のpointerdownを一切拾わない。
  if (elements.some((el) => el.closest(".mini-lock-slot"))) return null;
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
  const label = config.label;
  if (pileKey === "discard" && count > 0) {
    // ユーザー要望: 捨て場のツールチップは一番上のカード名ではなく「捨て場」と枚数を出す
    // （拡大プレビュー画像で一番上のカードは分かるため、テキストは山の名前でよい）。
    // 捨て場はダブルクリック／ダブルタップで一覧を開ける（右クリックの無い端末向けの導線）。
    return `${label}　${count}枚（ダブルタップで捨て札一覧）`;
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
    (t) =>
      t.kind === "card" &&
      (t.location.zone === "hand" || t.location.zone === "publicDraw") &&
      t.location.player === player
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

  // 横: 既定の展開方向はユーザー設定（右／左、既定は右）。設定側にはみ出す場合だけ反対側へ
  // 反転し、最後にステージ内へクランプする（ユーザー要望2026-08-07: 右拡大/左拡大を選べる）。
  let left;
  if (getCardPreviewSide() === "left") {
    left = clientXLocal - offset - panelWidthPx;
    if (left < 0) left = clientXLocal + offset; // 左がはみ出すなら右へ
  } else {
    left = clientXLocal + offset;
    if (left + panelWidthPx > STAGE_WIDTH) left = clientXLocal - offset - panelWidthPx; // 右がはみ出すなら左へ
  }
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

  // 続き223（ユーザー要望2026-08-18）: 手札使用の霧散演出(V4/V5)の再生中はホバー拡大を抑制する。
  // 使用モーダルを非表示設定にしていると、カードをクリックした直後のホバー拡大が霧散演出の上に
  // 被って演出が隠れてしまうため。演出が終われば通常のホバー拡大に戻る。
  const cardId = el && !isCardDissolvePlaying() ? getVisibleCardId(el) : null;
  if (!cardId) {
    preview.style.display = "none";
    return;
  }
  // テキストモードならカード面を合成して被せ、画像モードなら従来通り背景画像を敷く。
  showCardFace(preview, cardId, getCardImagePath(cardId));
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

// 「手札を画面下に固定する」設定用（fixed-hand.js、body.fixed-hand-mode）。ONの時、render()で
// 組み立て直した自分の手札(扇 .hand-area と公開ドロー .hand-reveal-area)を、盤面(#game-table、
// 盤面ズームのtransformが掛かる)の中から、盤面ズームの外側の固定オーバーレイ(#self-hand-overlay、
// bodyの子＝ステージ基準でfixed)へ移し替える。ドラッグ・持ち上げ・掴む・ドロップ・飛翔は全て
// 座標ベース(elementsFromPoint / getBoundingClientRect)なので、DOMの所属が変わっても機能する。
// オーバーレイはbody直下に1つだけ作って使い回し（render()毎に中身を空にして入れ替える）。
let selfHandOverlayEl = null;
function syncFixedHandOverlay(table) {
  if (!selfHandOverlayEl) {
    selfHandOverlayEl = document.createElement("div");
    selfHandOverlayEl.id = "self-hand-overlay";
    document.body.appendChild(selfHandOverlayEl);
    // 盤面(table)側のホバーリスナーはここには届かないため、拡大プレビュー用に独自に付ける
    // （updateHoverは座標ベースなのでそのまま使える）。
    selfHandOverlayEl.addEventListener("pointermove", (e) => updateHover(e.clientX, e.clientY));
    selfHandOverlayEl.addEventListener("pointerleave", () => {
      clearHover();
      updatePreview(null);
    });
  }
  selfHandOverlayEl.innerHTML = "";
  if (!isFixedHandEnabled()) {
    selfHandOverlayEl.style.display = "none";
    return;
  }
  selfHandOverlayEl.style.display = "";
  const self = getSelfSeat();
  const handArea = table.querySelector(`.hand-area[data-player="${self}"]`);
  if (handArea) selfHandOverlayEl.appendChild(handArea);
  const revealArea = table.querySelector(`.hand-reveal-area[data-player="${self}"]`);
  if (revealArea) selfHandOverlayEl.appendChild(revealArea);
}

// ユーザー要望2026-08-07「ロックエリアが見えなくなるくらい盤面を拡大した時、画面下中央に
// ミニロックエリアを出したい」。自分のロックエリア(.lock-area.lock-bottom＝視点回転で自分は
// 常に手前=bottom)の画面内可視率を測り、半分以上見えなくなったら、盤面ズームの外側の固定
// オーバーレイ(#mini-lock-area)に7色スロットのロック状況（勝利まであと何色か）を出す。
// fitTableToViewport（ズーム/パン/リサイズ/描画のたびに走る）から呼ばれる。
// 下(#mini-lock-area)＝自分＋ミニ捨て場、上(#mini-lock-area-top)＝相手プレイヤー（ユーザー要望
// 2026-08-07「相手のミニロックエリアは画面最上部に」）。名前の隣は「N/7」ではなく手札枚数を出す。
let miniLockAreaEl = null;
let miniLockAreaTopEl = null;
let miniLockAreaSig = null;
function updateMiniLockArea() {
  if (!miniLockAreaEl) {
    miniLockAreaEl = document.createElement("div");
    miniLockAreaEl.id = "mini-lock-area";
    document.body.appendChild(miniLockAreaEl);
  }
  if (!miniLockAreaTopEl) {
    miniLockAreaTopEl = document.createElement("div");
    miniLockAreaTopEl.id = "mini-lock-area-top";
    document.body.appendChild(miniLockAreaTopEl);
  }
  const table = document.getElementById("game-table");
  const state = getState();
  const self = getSelfSeat();
  const inGame = !!table && !!state.activePlayers?.includes(self) && !!state.turnPlayer && !isSpectatingGame();
  const lockAreaEl = inGame ? table.querySelector(".lock-area.lock-bottom") : null;
  let visibleFrac = 1;
  if (lockAreaEl) {
    const r = lockAreaEl.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      const ix = Math.max(0, Math.min(r.right, window.innerWidth) - Math.max(r.left, 0));
      const iy = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
      visibleFrac = (ix * iy) / (r.width * r.height);
    }
  }
  // 自分のロックエリアが半分以上見えていれば出さない（通常時・軽いズームでは邪魔しない）。
  if (!lockAreaEl || visibleFrac >= 0.5) {
    if (miniLockAreaEl.style.display !== "none") miniLockAreaEl.style.display = "none";
    if (miniLockAreaTopEl.style.display !== "none") miniLockAreaTopEl.style.display = "none";
    // ミニロック非表示 → 盤面の通常の手札公開エリアを元通り表示する。
    document.body.classList.remove("mini-lock-active");
    miniLockAreaSig = null;
    return;
  }
  miniLockAreaEl.style.display = "";
  miniLockAreaTopEl.style.display = "";
  // ユーザー要望2026-08-08: ミニロックエリア表示中は、自分（下側）の通常の手札公開エリアを隠す
  // （ミニロックの左隣にミニ手札公開エリアを出しており重複＝邪魔になるため）。CSSで .hand-reveal-bottom
  // を非表示にする（body.mini-lock-active）。相手側の公開エリアはそのまま。
  document.body.classList.add("mini-lock-active");
  const active = state.activePlayers ?? [];
  // 各プレイヤーのロック状況（player → {index: {cardId, tokenId}}）。location.sideは実座標の側。
  const lockByPlayer = {};
  for (const t of state.tokens) {
    if (t.kind !== "card" || t.location.zone !== "lock") continue;
    const p = SIDE_TO_SEAT[t.location.side];
    if (!p || !active.includes(p)) continue;
    (lockByPlayer[p] ??= {})[t.location.index] = { cardId: t.cardId, tokenId: t.id };
  }
  const handCountOf = (p) =>
    state.tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p).length;
  // ユーザー要望2026-08-07「手札公開エリア（publicDraw）も、ミニロックの左隣に左揃えで
  // ミニ手札公開エリアとして出したい（自分も相手も）」。各プレイヤーの公開ドローを集める。
  const revealByPlayer = {};
  for (const t of state.tokens) {
    if (t.kind !== "card" || t.location.zone !== "publicDraw") continue;
    const p = t.location.player;
    if (!active.includes(p)) continue;
    (revealByPlayer[p] ??= []).push(t);
  }
  const opponents = active.filter((p) => p !== self);
  const discard = state.piles?.discard ?? [];
  const discardTop = discard.length ? discard[discard.length - 1] : null;
  // ユーザー要望2026-08-08「捨てるロックカードを選ぶ時、ミニロックエリアでも選べるように」。
  // アクティブな「ロックカードを選ぶ」ピッカー（選べる罠のロック捨て・ゴメンナサイの奪取等、
  // candidatesがロックスロットのcell picker）の候補を拾い、該当ミニロックスロットを選択可能にする。
  const lockPickTargets =
    activeEffectPicker && activeEffectPicker.type === "cell"
      ? (activeEffectPicker.candidates || []).filter((c) => c.zone === "lock")
      : [];
  const isLockPickTarget = (side, index) => lockPickTargets.some((c) => c.side === side && c.index === index);
  // シグネチャ（変わっていなければ作り直さない）: 全員のロック内容＋手札枚数＋公開ドロー＋捨て場
  // ＋今選べるロック候補（ピッカーの出入りでハイライトを付け外しするため）。
  const sig =
    active
      .map(
        (p) =>
          p +
          ":" +
          COLORS.map((c, i) => lockByPlayer[p]?.[i]?.cardId || "").join(",") +
          ":h" + handCountOf(p) +
          ":r" + (revealByPlayer[p] ?? []).map((t) => t.cardId).join(",")
      )
      .join("|") +
    "|d" + discard.length + ":" + (discardTop || "") +
    "|pick" + lockPickTargets.map((c) => `${c.side}${c.index}`).join(",");
  if (sig === miniLockAreaSig) return;
  miniLockAreaSig = sig;

  const buildRow = (p, isSelf) => {
    const locked = lockByPlayer[p] ?? {};
    const playerRow = document.createElement("div");
    playerRow.className = `mini-lock-player${isSelf ? " is-self" : ""}`;
    // ミニ手札公開エリア（publicDraw）を最左に左揃えで置く（ユーザー要望2026-08-07）。
    const revealCards = revealByPlayer[p] ?? [];
    const miniReveal = document.createElement("div");
    miniReveal.className = "mini-hand-reveal";
    for (const t of revealCards) {
      const rc = document.createElement("div");
      rc.className = "mini-hand-reveal-card";
      rc.style.backgroundImage = `url("${getCardImagePath(t.cardId)}")`;
      miniReveal.appendChild(rc);
    }
    playerRow.appendChild(miniReveal);
    const label = document.createElement("div");
    label.className = "mini-lock-area-label";
    // 名前は控えめに、手札枚数は大きくアイコニックに（ユーザー要望「ミニロックの手札枚数が
    // 数字が小さくわかりづらい。少し大きめにアイコニックな表示に」）。
    const nameEl = document.createElement("span");
    nameEl.className = "mini-lock-area-name";
    nameEl.textContent = isSelf ? "自分" : getPlayerName(p);
    const handBadge = document.createElement("span");
    handBadge.className = "mini-lock-hand-badge";
    handBadge.title = "手札の枚数";
    const handIcon = document.createElement("span");
    handIcon.className = "mini-lock-hand-icon";
    handIcon.textContent = "🂠";
    const handNum = document.createElement("span");
    handNum.className = "mini-lock-hand-count";
    handNum.textContent = String(handCountOf(p));
    handBadge.appendChild(handIcon);
    handBadge.appendChild(handNum);
    label.appendChild(nameEl);
    label.appendChild(handBadge);
    playerRow.appendChild(label);
    const slots = document.createElement("div");
    slots.className = "mini-lock-area-slots";
    const side = SEAT_TO_SIDE[p];
    COLORS.forEach((color, index) => {
      const slot = document.createElement("div");
      slot.className = "mini-lock-slot";
      slot.style.setProperty("--slot-color", `var(--color-${color})`);
      // ロックの場所（side/index）を持たせ、ロック選択ピッカー中はミニロックからも選べるようにする。
      slot.dataset.side = side;
      slot.dataset.index = String(index);
      const entry = locked[index];
      if (entry) {
        slot.classList.add("is-locked");
        slot.style.backgroundImage = `url("${getCardImagePath(entry.cardId)}")`;
        // ロック中でも使えるカード（ファースト/エターナル）は、自分の分だけクリックで使える。
        if (isSelf && entry.cardId && (entry.cardId.startsWith("first-") || entry.cardId.startsWith("eternal-"))) {
          slot.classList.add("is-usable");
          slot.dataset.tokenId = entry.tokenId;
          slot.addEventListener("click", () => void tryUseLockedUsableCard(entry.tokenId));
        }
      }
      // 「捨てる/奪うロックカードを選ぶ」ピッカーの候補（ロック済みスロット）、および
      // #143: 誘惑の黒の烙印など「空きロックスロットに置く」配置ピッカーの候補（空きスロット）を、
      // entryの有無に関わらずミニロックでも選べるよう光らせる（盤面拡大中に拡大解除せず選べる）。
      // 実際のクリック解決は上部のcell picker用captureハンドラが .mini-lock-slot.is-pick-target を見て行う。
      if (isLockPickTarget(side, index)) slot.classList.add("is-pick-target");
      slots.appendChild(slot);
    });
    playerRow.appendChild(slots);
    return playerRow;
  };

  // 下（自分）＝自分のミニロック＋その右隣にミニ捨て場。
  miniLockAreaEl.innerHTML = "";
  if (active.includes(self)) {
    const wrap = document.createElement("div");
    wrap.className = "mini-lock-self-wrap";
    wrap.appendChild(buildRow(self, true));
    const disc = document.createElement("div");
    disc.className = "mini-discard";
    const discLabel = document.createElement("div");
    discLabel.className = "mini-lock-area-label";
    discLabel.textContent = `捨て場 ${discard.length}`;
    const discCard = document.createElement("div");
    discCard.className = "mini-discard-card";
    if (discardTop) {
      discCard.classList.add("has-card");
      discCard.style.backgroundImage = `url("${getCardImagePath(discardTop)}")`;
    }
    disc.appendChild(discLabel);
    disc.appendChild(discCard);
    wrap.appendChild(disc);
    miniLockAreaEl.appendChild(wrap);
  }
  // 上（相手）。
  miniLockAreaTopEl.innerHTML = "";
  for (const p of opponents) miniLockAreaTopEl.appendChild(buildRow(p, false));
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
    // 通常は盤面下部(.zone-bottom)の手札。「手札を画面下に固定する」ON時は固定オーバーレイ
    // (#self-hand-overlay)へ移しているので、そちらも持ち上げ対象にする。
    if (handCard && handCard.closest(".zone-bottom .hand-area, #self-hand-overlay")) return handCard;
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
  const img = document.createElement("div");
  img.className = "card-note-image";
  showCardFace(img, cardId, getCardImagePath(cardId));
  img.setAttribute("aria-label", def.name);
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
    const imagePath = token.faceUp ? getCardImagePath(token.cardId) : cardBackImageForToken(token);
    showCardFace(card, token.faceUp ? token.cardId : null, imagePath);
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
      showCardFace(card, cardId, getCardImagePath(cardId));
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
      const imagePath = token.faceUp ? getCardImagePath(token.cardId) : cardBackImageForToken(token);
      showCardFace(card, token.faceUp ? token.cardId : null, imagePath);
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
  // #151（ユーザー報告2026-08-19）: カードを右クリックしてもカード補足が出ず、代わりにブラウザ既定
  // メニューが出る。原因は contextmenu を #game-table にだけ張っていたため——#card-preview(ホバー
  // 拡大, z-index:10700)や到達モーダル等のfixedオーバーレイがカードの上に被って右クリックの実target
  // になると、game-tableのリスナーに届かず preventDefault されない（CPU自動処理中はこれらが頻繁に
  // 出るので起きやすい）。ドキュメント全体で受け、elementsFromPointベースの findHoverTarget（pe:none
  // のオーバーレイを素通りして下のカードを見つける、既存の当たり判定と同じ方式）で判定する。
  document.addEventListener("contextmenu", (e) => {
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

    // ゲーム要素(カード/山/レイヤー)を見つけた、または盤面(#game-table)上の右クリックなら
    // ブラウザ既定メニューを抑制（従来の「盤面上では既定メニューを出さない」挙動を維持）。
    // オプションパネル等の盤面外では既定に任せる（テキスト等で普通に右クリックできる）。
    const overGameArea = !!hit || !!(e.target && e.target.closest && e.target.closest("#game-table"));
    if (items.length === 0) {
      if (overGameArea) e.preventDefault();
      closeContextMenu();
      return;
    }
    e.preventDefault();
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
// 捨て場の山を「ダブルクリック／ダブルタップ」した時に捨て札一覧を開くための直近タップ時刻
// （右クリックの無いタブレット/スマホでも一覧を見られるように。ユーザー要望）。
let lastDiscardTapTime = 0;

function initDragHandlers() {
  const table = document.getElementById("game-table");
  // 掴む判定は findDraggableAt（座標ベース elementsFromPoint）なので、リスナーは document に付ける。
  // こうすると「手札を画面下に固定する」ONで自分の手札が盤面(table)の外の固定オーバーレイに
  // 移っていても、その手札を掴んでドラッグできる（tableに付けたままだとオーバーレイ上の
  // pointerdownがtableへ伝播せず掴めない）。掴める対象が無ければ即returnするので盤外への影響は無い。
  document.addEventListener("pointerdown", async (e) => {
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

    // 捨て場の山をダブルクリック／ダブルタップで捨て札一覧を開く（右クリックの無いタブレット/
    // スマホでも見られるように。ユーザー要望）。捨て場の一番上を掴む単発ドラッグは残したいので、
    // 盤面カードの反転と同じ「同じ対象へ一定時間内に2回」で判定する。1回目はそのまま下の通常処理
    // へ進める（タッチの素早いタップは同じ場所へ戻すだけ・マウスは同じ場所でドロップされるだけの
    // 無害な操作）。この判定はタッチ/マウス両方で効くよう、下のタッチ分岐より手前に置く。
    if (hit.kind === "pile" && hit.pile === "discard") {
      const now = Date.now();
      const isDoubleTap = now - lastDiscardTapTime < DOUBLE_CLICK_MS;
      lastDiscardTapTime = isDoubleTap ? 0 : now; // 3連タップを2回分に数えない
      if (isDoubleTap) {
        showDiscardListModal();
        return;
      }
    }

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
  const imagePath = token.faceUp ? getCardImagePath(token.cardId) : cardBackImageForToken(token);
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
    // 行動ログ用（ユーザー要望「何をロックしたかを行動ログに追加」）。全ロック経路が
    // ここを通る（performLockPhaseClick・ドラッグ&ドロップ・最後のロック承認）。
    logAction("lock", { cardId, player });
    announceCardLocked(player, cardId);
    // ユーザー要望（続き76）「ロック処理の直後にも割り込みモーダルを出す」。宣言側は
    // 続き77でperformLockPhaseドラッグ&ドロップハンドラ・requestFinalLock
    // それぞれの実際に動かす直前に追加したため、ここは「処理」側の1回。
    fireAnytimeCheckpoint(player);
    // 黒の契約の烙印の★(b): 「これの置かれた“色”のロックエリアにロックしたなら、手札2枚捨て、
    // これを任意のマスに裏向きで置く」（ユーザー訂正2026-08-09）。烙印は特定の色枠を塞いでおり、
    // その色をロックした時だけ外れる（他の色をロックしても外れない）。全ロック経路がここを通る
    // （烙印自身の●配置は moveAndSync 経由でここは通らない）。
    //
    // #111修正（2026-08-15）: 本気エイドスはノワールの両端に烙印を2枚置く。以前は
    // findContractBrandInLockAreaOf（先頭1枚しか返さない）を使い dropTarget.index と一致した時
    // だけ発火していたため、今ロックした色と“別の”烙印が先に見つかると★(b)が発火せず、烙印の
    // 上にカードがそのまま重なってしまっていた（＝烙印が外れず、見た目も崩れる）。今ロックした
    // 色スロット（side＋index）に置かれている烙印そのものを直接探すよう修正し、複数枚に対応。
    if (cardId !== "black-contract-brand") {
      const brand = getState().tokens.find(
        (t) =>
          t.kind === "card" &&
          t.cardId === "black-contract-brand" &&
          t.location.zone === "lock" &&
          t.location.side === dropTarget.side &&
          t.location.index === dropTarget.index
      );
      if (brand) {
        runContractBrandCurseOnLock(player, brand.id); // fire-and-forget（同期のロック処理は止めない）
      }
    }
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
  // 奪えるロックが攻撃側に1枚も無ければ（既存ロックが全てファースト/エターナル＝他効果の
  // 対象外の場合等）、ゴメンナサイを使っても奪う対象が無く何も起きない。ボタンを出す意味が
  // 無いのでnullを返し、checkGomennasaiAutoApprovalに自動承認させる（ユーザー報告「最後の
  // ロックの承認モーダルでゴメンナサイを使うを押しても何も起きない」対応——以前は所持と
  // コストだけ見てボタンを出していたため、奪える対象が無い局面で無反応になっていた）。
  const pending = getState().pendingFinalLock;
  const attackerSide = pending ? SEAT_TO_SIDE[pending.attacker] : null;
  const stealableLocks = attackerSide
    ? getState().tokens.filter(
        (t) =>
          t.kind === "card" &&
          t.location.zone === "lock" &&
          t.location.side === attackerSide &&
          !t.cardId?.startsWith("eternal-") &&
          !t.cardId?.startsWith("first-")
      )
    : [];
  if (stealableLocks.length === 0) return null;
  return { sorryToken, costCandidates, stealableLocks };
}

// ユーザー確認済み方針「コストを払える人だけが却下（＝妨害）できる」への対応。
// 承認待ちの先頭がゴメンナサイを使えない座席の場合、ボタンを見せる意味が無いため
// 自動的に承認する（final-lock-approval.jsのcheckGomennasaiEligibility注入により
// バナー自体も出さない）。render()のたびに毎回チェックする既存パターンを踏襲。
// 多重発火防止のガード付き。
let gomennasaiAutoApprovalInFlight = false;
// 不具合#36/#83: 人間が「ゴメンナサイを使う」を押して useGomennasaiOnFinalLock が進行している間、
// その処理の途中で追色コストを捨てた“瞬間”に findGomennasaiEligibility が一時的に null になる
// （紫カードが手札から消えるため）。この隙に checkGomennasaiAutoApproval が「使えない＝自動承認」
// と誤判定して先に承認→勝利確定してしまい、その後のゴメンナサイの奪取で相手のロックが1色欠けても
// 手遅れ（既に勝利宣言済み）になっていた。手動使用が進行中の間は自動承認を絶対にさせないフラグ。
let gomennasaiManualUseInFlight = false;
function checkGomennasaiAutoApproval() {
  const pending = getState().pendingFinalLock;
  if (!pending || pending.queue.length === 0 || gomennasaiAutoApprovalInFlight || gomennasaiManualUseInFlight) return;
  const approver = pending.queue[0];
  if (isOnlineMode() && getSelfSeat() !== approver) return;
  if (findGomennasaiEligibility(approver)) return; // 使えるなら自動承認せず本人の選択を待つ
  // 診断ログ（ユーザー報告「ゴメンナサイと追色コストを持っているのに最後のロック承認で使えな
  // かった」の調査用）: なぜ「使えない＝自動承認」と判定したのかを記録する。ゴメンナサイ本体が
  // 手札に無い(hasSorryInHand:false)のか、追色に使える紫カードが手札に無い(purpleForCost が空、
  // ゴメンナサイ自身は追色に使えない)のか、をこのログで切り分けられる。
  {
    const sorry = getState().tokens.find(
      (t) => t.kind === "card" && t.cardId === "purple-sorry" && t.location.zone === "hand" && t.location.player === approver
    );
    const purpleForCost = getState()
      .tokens.filter(
        (t) =>
          t.kind === "card" &&
          t.location.player === approver &&
          t.location.zone === "hand" &&
          t.id !== sorry?.id &&
          (t.cardId === "rainbow-shard" || getCardDefinition(t.cardId)?.color === "purple")
      )
      .map((t) => t.cardId);
    logAction("diag-gomennasai", {
      approver,
      hasSorryInHand: !!sorry,
      purpleForCost,
      note: "ゴメンナサイ使用不可と判定→自動承認します",
    });
  }
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

// 【CPU強化 2026-08-08】ローカルCPU戦で、相手（人間）が最後のロックを宣言し、承認キューの
// 先頭がCPU席（疑似CPU対象）になった時の自動処理。以前はこの局面で承認バナーの「承認/ゴメン
// ナサイを使う」ボタンが人間側に見えてしまい（canRespondがローカルでは常にtrue）、CPUが自分の
// ゴメンナサイで人間の勝利を阻止することが一切なく、しかもCPUがゴメンナサイを持っている場合は
// checkGomennasaiAutoApprovalが自動承認を保留するため承認が止まる恐れがあった。
// 賢いCPU（中級以上）はゴメンナサイを使えるなら必ず使って相手の勝利ロックを阻止する
// （負けを防ぐのは常に得なので難易度に依らず発動が正解）。新人CPUは使わずそのまま承認する。
// checkGomennasaiAutoApprovalが「ゴメンナサイを使えない席」は既に自動承認しているので、
// ここで扱うのは「先頭がCPU席かつゴメンナサイを使える」局面だけ。
let cpuFinalLockInFlight = false;
function checkCpuFinalLockApproval() {
  if (cpuFinalLockInFlight || gomennasaiAutoApprovalInFlight || gomennasaiManualUseInFlight) return;
  const pending = getState().pendingFinalLock;
  if (!pending || pending.queue.length === 0) return;
  const approver = pending.queue[0];
  // AFK代行（オンライン）: 承認者が自席で代行中なら、人間用のオンライン対応済み
  // useGomennasaiOnFinalLock を自動起動する（内部の奪う札/コストのピッカーはturn-timerの
  // 強制解決＋brainで自動解決される）。使えなければ checkGomennasaiAutoApproval が自動承認する。
  if (isSelfCpuSubstituted() && approver === getSelfSeat()) {
    if (!findGomennasaiEligibility(approver)) return;
    cpuFinalLockInFlight = true;
    Promise.resolve(useGomennasaiOnFinalLock()).finally(() => {
      cpuFinalLockInFlight = false;
      checkCpuFinalLockApproval();
    });
    return;
  }
  if (isOnlineMode() || !isCpuBattleActive()) return;
  if (!isPseudoCpuTarget(approver)) return; // 人間の承認は自動化しない（本人が選ぶ）
  const eligible = findGomennasaiEligibility(approver);
  if (!eligible) return; // 使えない席はcheckGomennasaiAutoApprovalが自動承認する
  cpuFinalLockInFlight = true;
  Promise.resolve()
    .then(async () => {
      if (isCpuBrainDriving(approver)) {
        await cpuUseGomennasaiOnFinalLock(approver, eligible, pending.attacker);
      } else {
        // 新人CPU: ゴメンナサイを持っていても防御に使わずそのまま承認（弱いCPUとして）。
        await respondToFinalLock(true);
      }
    })
    .finally(() => {
      cpuFinalLockInFlight = false;
      // gomennasaiAutoApprovalと同様、処理中のrender()で弾かれた再チェックを拾い直す。
      checkCpuFinalLockApproval();
    });
}

// CPUがゴメンナサイで奪うロックカードを選ぶ。奪うと攻撃側の7色が崩れて勝利を阻止でき、
// さらに自分の手札に加わる。①自分がまだロックしていない色（後で自分がロックできる）＞
// ②貴重カード（なないろの欠片等）＞③先頭、の優先で選ぶ。
function pickCpuGomennasaiStealTarget(seat, stealableLocks) {
  const mySide = SEAT_TO_SIDE[seat];
  const myLockedColors = new Set(
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === mySide)
      .map((t) => getCardDefinition(t.cardId).color)
  );
  const preciousIds = new Set(["rainbow-shard", "purple-sorry", "red-counter-lock"]);
  const scoreOf = (t) => {
    let s = 0;
    const def = getCardDefinition(t.cardId);
    if (!myLockedColors.has(def.color)) s += 3; // 自分がまだ持っていない色は再ロックの種になる
    if (preciousIds.has(t.cardId) || t.cardId?.startsWith("first-") || t.cardId?.startsWith("eternal-")) s += 2;
    return s;
  };
  return [...stealableLocks].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
}

// CPUがゴメンナサイの追色コストとして捨てる紫カードを選ぶ。貴重なカードは温存し、
// なるべく価値の低い紫を捨てる。
function pickCpuGomennasaiCost(costCandidates) {
  const preciousIds = new Set(["rainbow-shard", "purple-sorry", "red-counter-lock"]);
  const scoreOf = (t) => {
    let s = 0;
    if (preciousIds.has(t.cardId) || t.cardId?.startsWith("first-") || t.cardId?.startsWith("eternal-")) s -= 3;
    return s;
  };
  return [...costCandidates].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
}

// 賢いCPUがゴメンナサイを自動発動する（ローカルCPU戦専用）。useGomennasaiOnFinalLockの
// ローカル分岐を、対話ピッカーの代わりにCPUの自動選択で置き換えたもの。攻撃側のロックを
// 1枚奪い、追色1を払ってから通常どおり承認する（奪取で7色が崩れるため相手は勝利しない）。
async function cpuUseGomennasaiOnFinalLock(seat, eligibility, attacker) {
  if (!getState().pendingFinalLock) return;
  const target = pickCpuGomennasaiStealTarget(seat, eligibility.stealableLocks);
  const cost = pickCpuGomennasaiCost(eligibility.costCandidates);
  if (!target || !cost) {
    await respondToFinalLock(true);
    return;
  }
  // #102: 手札効果の使用宣言モーダル（＋行動ログに hand-effect を残す）を出す。以前は理由モーダル
  // だけで、ゴメンナサイを使った合図（手札効果使用モーダル）が出ていなかった。
  announceHandEffectUseForEffect("purple-sorry", "相手の最後のロックを阻止する", seat);
  await announceEffectReasonForEffect(
    "purple-sorry",
    `${getPlayerName(seat)}はゴメンナサイを使い、${getPlayerName(attacker)}のロックを1枚奪って最後のロックを阻止します！`
  );
  // #102: ゴメンナサイは手札効果＝発動時にこのカード自身を捨てる（追色コストとは別の話）。以前は
  // 追色コストしか捨てておらず、使ったゴメンナサイが手札に残ったままだった。本体→追色の順に捨てる。
  await discardFromHandReveal(eligibility.sorryToken.id);
  await discardFromHandReveal(cost.id);
  const costStillInHand = getState().tokens.find(
    (t) => t.id === cost.id && t.location.zone === "hand" && t.location.player === seat
  );
  if (costStillInHand) {
    // コストを払えなかった（想定外）。安全側に倒して普通に承認する。
    await respondToFinalLock(true);
    return;
  }
  moveToken(target.id, { zone: "hand", player: seat });
  // #102: 何を奪ったかを画面中央のモーダルで見せる（従来は小さいトーストだけだった）。
  showCardReceivedModal(
    target.cardId,
    `${getPlayerName(seat)}が${getPlayerName(attacker)}のロックエリアから奪いました`,
    { labelText: "奪った" }
  );
  announceHandPickups(seat, [{ cardId: target.cardId, wasPublic: true }]);
  render();
  await respondToFinalLock(true);
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
  // #36/#83: この使用が終わるまで自動承認を止める（追色コストを捨てた隙に自動承認→先に勝利
  // 宣言されるのを防ぐ）。以降のあらゆる経路（早期return・例外含む）で必ず下のfinallyで戻す。
  gomennasaiManualUseInFlight = true;
  // #36a: 「ゴメンナサイを使う」を押した瞬間から、承認バナーを「ロックエリアから奪うカードを
  // 選んでください」の案内に切り替える（奪う札を選び終える/中止するまで）。finallyで必ず戻す。
  setGomennasaiPicking(true);
  updateFinalLockApprovalBanner();
  try {
  // findGomennasaiEligibilityが「奪えるロックが1枚以上ある」ことまで確認済みなので、
  // ここでは同じ判定を再計算せずその結果を使う（ボタンが出ている＝必ず奪える対象がある）。
  const attackerLockedTokens = eligibility.stealableLocks;
  const candidates = attackerLockedTokens.map((t) => t.location);
  const dest =
    candidates.length === 1
      ? candidates[0]
      : await requestCellChoiceForEffect(candidates, "奪うロックカードを選択してください", { owner: selfSeat });
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
  // 追色コストが本当に手札から離れたか確認する。discardFromHandRevealは内部でサーバー
  // エラーを握りつぶす（500等の一時エラーを自前でリトライし、それも失敗したらconsole.error
  // して静かに戻る）ため、呼び出し側からは成否が分からない。ここで確認せずに奪取・承認まで
  // 進めると、コストを払えていないのにゴメンナサイが成立してしまう（ユーザー報告「追色
  // コストを捨てずに発動された気がします」＝ログに so7-apply-action の500エラーあり）。
  // まだ手札に残っていたら中止し、やり直してもらう。
  const costStillInHand = getState().tokens.find(
    (t) => t.id === costChosen.id && t.location.zone === "hand" && t.location.player === selfSeat
  );
  if (costStillInHand) {
    alert("追色コストを捨てられませんでした（通信エラーの可能性）。もう一度「ゴメンナサイを使う」を押してください。");
    render();
    return;
  }
  // #102: ゴメンナサイは手札効果＝発動時にこのカード自身も捨てる（追色コストとは別）。追色コストの
  // 支払いが確定した後に、ゴメンナサイ本体を捨てる（以前は本体が手札に残っていた）。
  await discardFromHandReveal(eligibility.sorryToken.id);
  // 不具合#36診断: ゴメンナサイで奪ったカード・奪う前後の攻撃側ロック内容を記録する
  // （奪ったのに相手が勝ってしまう報告の追跡用）。
  const attackerSeat = pending.attacker;
  const attackerSideForLog = SEAT_TO_SIDE[attackerSeat];
  const locksSnapshot = () =>
    getState()
      .tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === attackerSideForLog)
      .map((t) => ({ index: t.location.index, cardId: t.cardId }));
  logAction("diag-gomennasai-steal", { attacker: attackerSeat, stealingCardId: target.cardId, stealIndex: target.location.index, attackerLocksBefore: locksSnapshot() });
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
  // #102: 何を奪ったかを画面中央のモーダルで見せる（従来は小さいトーストだけだった）。
  showCardReceivedModal(
    target.cardId,
    `${getPlayerName(selfSeat)}が${getPlayerName(attackerSeat)}のロックエリアから奪いました`,
    { labelText: "奪った" }
  );
  announceHandPickups(selfSeat, [{ cardId: target.cardId, wasPublic: true }]);
  render();
  logAction("diag-gomennasai-steal", { attacker: attackerSeat, phase: "afterSteal", attackerLocksAfter: locksSnapshot() });
  await respondToFinalLock(true);
  logAction("diag-gomennasai-steal", { attacker: attackerSeat, phase: "afterFinalLock", attackerLocksAfter: locksSnapshot() });
  } finally {
    gomennasaiManualUseInFlight = false;
    setGomennasaiPicking(false);
    updateFinalLockApprovalBanner();
  }
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

  // ③演出用: ドラッグ元カードのDOM要素のrectを、状態が書き換わる（render）前に捕捉しておく。
  // カード配置の着地演出(playCardCellLanding)の「飛び元＝手札」、回収演出(playCardLiftToHand)の
  // 「飛び元＝盤面マス」に使う。掴んでいる間 visibility:hidden だがレイアウトは残るので rect は有効。
  let cardAnimSourceRect = null;
  if (kind === "card") {
    const srcEl = document.querySelector(
      `.hand-card[data-token-id="${tokenId}"], .hand-reveal-card[data-token-id="${tokenId}"], .board-card[data-token-id="${tokenId}"]`
    );
    if (srcEl) cardAnimSourceRect = srcEl.getBoundingClientRect();
  }

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
  // マルメゴで橙が出た時の「このターン移動できない」を手動移動でも強制する（不具合#57）。
  // 上の接触ブロックは既にreturn済みなので接触は弾かない。手番プレイヤー自身の駒を、
  // ムーブフェイズ中に、別のマスへ動かそうとした時だけ弾く（同じマスへ落とすだけ＝実質移動なしは許可）。
  if (
    kind === "piece" &&
    dropTarget.zone === "cell" &&
    cardSourceLocation?.zone === "cell" &&
    (cardSourceLocation.row !== dropTarget.row || cardSourceLocation.col !== dropTarget.col)
  ) {
    const movingToken = getState().tokens.find((t) => t.id === tokenId);
    if (movingToken && movingToken.player === getState().turnPlayer && isMovePhaseActive() && isMovementDisabledThisTurn(movingToken.player)) {
      render(); // moveTokenを呼んでいないので駒は元のマスへ戻る（スナップバック）
      alert("禁断の果実 マルメゴで橙が出たため、このターンは移動できません（接触は可能です）。");
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
    if (dropTarget.pile === "discard") playHandCardBurn(tokenId); // #3: 手札→捨て場のドラッグでも焼失演出（自己ゲート）
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
        // #152: 動かす前のマスの一番上id（＝掴んだこのカード自身）を控えて渡す。掴めるのは一番上の
        // カードなので、これを抜けば下の別カードが新しく一番上に＝到達コンボは正当に発動する。
        const prevTopAtSource =
          cardSourceLocation && (cardSourceLocation.zone === "cell" || cardSourceLocation.zone === "lock")
            ? findTopCardAt(cardSourceLocation)?.id ?? null
            : null;
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
        maybeTriggerCardArrivalForExposedCard(cardSourceLocation, false, prevTopAtSource);
        // ③演出（ユーザー要望2026-08-18の「逆もしかり」）: 盤面マスのカードが手札に入るときは、
        // 配置の逆——マスから上空へストンと持ち上がり（風はマス側）→手札へすーーっと。
        // #164: 盤面で表向きだったカード(wasPublic)は表面で飛ばす（相手の手札で裏向きに描画されても、
        // 見えていた面のまま飛ぶ）。裏向きだったカードは裏面のまま。
        if (cardSourceLocation?.zone === "cell") {
          const liftImg = wasPublic ? `url("${getCardImagePath(cardId)}")` : `url("${getCardBackImagePath(cardId)}")`;
          playCardLiftToHand(cardAnimSourceRect, dropTarget.player, tokenId, liftImg);
        }
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
      if (draggedToken && (isSelfHandPhase() || (isUsableAnytime && !effectProcessingBusy))) {
        if (
          !draggedToken.cardId?.startsWith("eternal-") &&
          !draggedToken.cardId?.startsWith("first-") &&
          hasHandEffectData(draggedToken.cardId)
        ) {
          render();
          if (canUseHandEffect(draggedToken.cardId, draggedToken.id, cardSourceLocation.player)) {
            if (await confirmTouchAction(`${getCardDefinition(draggedToken.cardId).name}を使用しますか？`, { cardId: draggedToken.cardId })) {
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
        if (isSelfHandPhase() && clickPlayer === getSelfSeat() && cardSourceLocation.zone === "lock") {
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
          isSelfHandPhase() &&
          useToken &&
          clickPlayer === getSelfSeat() &&
          useIsEternalOrFirst &&
          hasHandEffectData(useToken.cardId)
        ) {
          render();
          if (canUseHandEffect(useToken.cardId, useToken.id, clickPlayer)) {
            if (await confirmTouchAction(`${getCardDefinition(useToken.cardId).name}を使用しますか？`, { cardId: useToken.cardId })) {
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
          if (isSelfHandPhase() || (isUsableAnytime && !effectProcessingBusy)) {
            render();
            if (canUseHandEffect(clickedToken.cardId, clickedToken.id, clickPlayer)) {
              if (await confirmTouchAction(`${getCardDefinition(clickedToken.cardId).name}を使用しますか？`, { cardId: clickedToken.cardId })) {
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
      if (!(await confirmTouchAction(`${getCardDefinition(token?.cardId)?.name ?? "このカード"}をロックしますか？`, { cardId: token?.cardId }))) {
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
      // ユーザー報告#6: ドラッグ移動でも highlightタップ経路(performPhaseMoveToCell)と
      // 同じく「移動確定〜到達開始」の空白に自動ターン終了が割り込み得るため、同じガードで
      // 塞ぐ（beginPostMoveArrivalGuard参照）。自動処理ONの時だけ包む——自動ターン終了は
      // 自動処理ONでしか発火せず、かつ自動処理ONなら promptCardOpen→openCardNow 経路で
      // onFullyResolvedが必ず呼ばれるため（OFFの手動プロンプトはボタン未クリックの間
      // onFullyResolvedが来ずガードが残り続けてしまうので包まない）。
      const guardPostMoveArrival = isAutoProcessingEnabled();
      if (guardPostMoveArrival) beginPostMoveArrivalGuard();
      let postMoveGuardReleased = false;
      const releasePostMoveGuard = () => {
        if (!guardPostMoveArrival || postMoveGuardReleased) return;
        postMoveGuardReleased = true;
        endPostMoveArrivalGuard();
      };
      maybeTriggerCardArrival(dropTarget, tokenId, undefined, () => {
        releasePostMoveGuard();
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
      // ③演出（ユーザー要望2026-08-18）: 盤面マスへ置いたカードに着地演出（手札→上空へグライド→
      // ストンと落下→着地の風）。fire-and-forget＝実配置はもう済んでおり、実カードを一瞬隠して
      // ゴーストを飛ばすだけの飾り。#2（ユーザー要望2026-08-19「ロックするときも同じ演出を」）:
      // 手札→ロックスロットの時も同じ飛翔を出す（ロック演出＝maybeAnnounceLockのバースト/スタンプ
      // とは別レイヤーで共存）。ロック内での並び替え（lock→lock）は飛翔を出さない。
      if (dropTarget.zone === "cell") playCardCellLanding(cardAnimSourceRect, dropTarget, tokenId);
      else if (dropTarget.zone === "lock" && cardSourceLocation?.zone === "hand")
        playCardCellLanding(cardAnimSourceRect, dropTarget, tokenId);
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

// 不具合報告アイコン（オプションエリア、オンラインアイコンの左隣、ユーザー要望で外出し）。
// ユーザー提供のSVGアイコンに差し替え（2026-08-10）。他のアイコンと同じ buildIconButtonContent
// （imgベース）で組む。
function buildBugReportWidget() {
  const btn = document.createElement("button");
  btn.id = "self-status-bug-report";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/bug-report.svg",
    tooltip: "不具合報告（コメント＋ログを送信）",
  });
  captionEl.textContent = "不具合報告";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    openBugReportModal();
  });
  return btn;
}

// 行動ログのトグル（ユーザー要望「途中で離席した人が戻った時に何が起きたか見返せるログを、
// オプションアイコンとマイページアイコンの間のアイコンで開閉したい。オプションエリアの下
// あたりにログウィンドウを出す」）。同じアイコンをもう一度押すと消す。
let actionLogWindowEl = null;
let actionLogWindowTimer = null;
function isActionLogWindowOpen() {
  return !!actionLogWindowEl;
}
// ゲーム画面の行動ログは素人も読む（ユーザー要望）ため、技術ログではなく「誰が何をしたか」を
// 日本語でシンプルに出す。ノイズ（内部診断）は除外し、カードを出した／ゲート侵攻／色宣言等
// だけを、新しい順（上が最新）に並べる。
// 座席ごとのアクセント色（行動ログで「誰の手番か」を色分けするため。ユーザー要望）。
const ACTION_LOG_SEAT_ACCENT = { A: "#f87171", B: "#fbbf24", C: "#60a5fa", D: "#4ade80" };
// マス座標の見える化（ユーザー要望「移動先も座標でログ」）。盤面の絶対座標で、
// 列A〜G（左から）＋行1〜7（上から）。例: セル(row2,col3) → "D3"。iマークで説明する。
function actionLogCoordLabel(loc) {
  if (loc && loc.zone === "cell" && Number.isInteger(loc.row) && Number.isInteger(loc.col)) {
    return `${String.fromCharCode(65 + loc.col)}${loc.row + 1}`;
  }
  return null;
}
// 生の記録（getActionLogEntries）から、素人にも読める「誰が・何をしたか」の項目列を作る
// （古い→新しい順）。ノイズ（内部診断）は除外。同じ内容の連続はまとめる。
function buildFriendlyLogItems() {
  const items = [];
  let lastKey = null;
  for (const e of getActionLogEntries()) {
    let player = null;
    let msg = null;
    if (e.category === "arrival" && e.detail?.cardId) {
      // 以前は depth===0 だけを載せていたが、移動で到達した効果は beginPostMoveArrivalGuard が
      // 先に深度を1へ上げてから記録されるため depth は 1 以上になり、ほとんどの到達が
      // ログに出ていなかった（ユーザー報告2026-08-07「到達効果が発動したのに記録されてない
      // 時がある」＝手動オープンだけ depth 0 で出ていた）。深度は内部制御用なので、到達は
      // 深度に関わらず全部載せる（連鎖到達も含む。同一内容の連続は下の dedup でまとめる）。
      player = e.detail.player;
      const name = getCardDefinition(e.detail.cardId)?.name ?? e.detail.cardId;
      const co = actionLogCoordLabel(e.detail.location);
      msg = `「${name}」の到達効果を得ました${co ? `（${co}）` : ""}`;
    } else if (e.category === "hand-effect" && e.detail?.cardId) {
      player = e.detail.player;
      const name = getCardDefinition(e.detail.cardId)?.name ?? e.detail.cardId;
      msg = `「${name}」の手札効果を得ました`;
    } else if (e.category === "lock" && e.detail?.cardId) {
      player = e.detail.player;
      const name = getCardDefinition(e.detail.cardId)?.name ?? e.detail.cardId;
      msg = `「${name}」をロックしました`;
    } else if (e.category === "declare-colors" && e.detail?.colors?.length) {
      player = e.detail.player;
      const cols = e.detail.colors.map((c) => COLOR_LABEL_JA[c] ?? c).join("・");
      msg = `色を宣言しました：${cols}`;
    } else if (e.category === "my-deck-draw" && e.detail?.player) {
      // ユーザー報告#120: マイデッキからのドローが「📜行動ログ」（この友好ログ窓）に出ていなかった。
      // buildFriendlyLogItemsが my-deck-draw のケースを持たず else→continue で捨てていたため。
      player = e.detail.player;
      msg = "マイデッキから1枚ドローしました";
    } else if (e.category === "brand-draw" && e.detail?.player) {
      // ユーザー報告#120: 烙印ドローも同様に出ていなかった。brand-draw は1エントリ＝1枚のドロー。
      // 複数枚のときは「N枚目」を付けて、2枚とも別行で見えるようにする（連続dedud回避）。
      player = e.detail.player;
      const bc = e.detail.brandCount || 1;
      msg = bc > 1 ? `誘惑の黒の烙印の効果で1枚ドローしました（${e.detail.index || 1}枚目）` : "誘惑の黒の烙印の効果で1枚ドローしました";
    } else if (e.category === "place" && e.detail?.location) {
      // ユーザー要望2026-08-16「置く系の効果（例えば烙印）はどこに置いたか行動ログに記載してほしい」。
      // 座標を明示する。隠し情報保護のため、公開カード（烙印・効果カード自身・表向き配置）だけ
      // 名前を出し、山札/手札から裏向きで置いた（＝中身が非公開の）カードは名前を伏せて「カード」とする。
      player = e.detail.player;
      const co = actionLogCoordLabel(e.detail.location);
      const fd = e.detail.faceDown ? "裏向きで" : "";
      const where = co ? `（${co}）` : e.detail.location.zone === "lock" ? "（ロックエリア）" : "";
      if (e.detail.revealName && e.detail.cardId) {
        const name = getCardDefinition(e.detail.cardId)?.name ?? e.detail.cardId;
        msg = `「${name}」を${fd}置きました${where}`;
      } else {
        msg = `カードを${fd}置きました${where}`;
      }
    } else if (e.category === "diag-gate-invasion-received") {
      msg = "ゲート侵攻が発生しました";
    } else {
      continue;
    }
    const key = `${player}|${msg}`;
    if (key === lastKey) continue;
    lastKey = key;
    items.push({ turn: e.turn, round: e.round, player, msg, t: e.t });
  }
  return items;
}
function buildActionLogTurnHeader(item) {
  const header = document.createElement("div");
  header.className = "action-log-turn-header";
  const accent = item.player ? ACTION_LOG_SEAT_ACCENT[item.player] : "rgba(148,163,184,0.6)";
  header.style.setProperty("--log-accent", accent);
  if (item.player) {
    const av = document.createElement("img");
    av.className = "action-log-turn-avatar";
    av.src = getPlayerAvatar(item.player);
    av.alt = "";
    header.appendChild(av);
  }
  const label = document.createElement("span");
  label.className = "action-log-turn-label";
  const rt = [item.round != null ? `R${item.round}` : null, item.turn != null ? `T${item.turn}` : null].filter(Boolean).join("・");
  label.textContent = item.player ? `${rt ? rt + "　" : ""}${getPlayerName(item.player)}のターン` : rt || "—";
  header.appendChild(label);
  return header;
}
function buildActionLogEventRow(item) {
  const row = document.createElement("div");
  row.className = "action-log-event";
  const accent = item.player ? ACTION_LOG_SEAT_ACCENT[item.player] : "rgba(148,163,184,0.6)";
  row.style.setProperty("--log-accent", accent);
  const text = document.createElement("span");
  text.className = "action-log-event-text";
  text.textContent = item.player ? `${getPlayerName(item.player)}：${item.msg}` : item.msg;
  const time = document.createElement("span");
  time.className = "action-log-event-time";
  const d = new Date(item.t);
  time.textContent = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  row.appendChild(text);
  row.appendChild(time);
  return row;
}
// ユーザー要望「行動ログをターン/フェイズ/ラウンドで区切ると分かりやすい。誰のターンかを
// 色分けやアバターで」。新しい順（上が最新）に並べ、ターン番号が変わるたびに見出しを挟む。
function renderActionLogInto(body) {
  body.innerHTML = "";
  const items = buildFriendlyLogItems();
  if (items.length === 0) {
    body.textContent = "（まだ記録がありません）";
    return;
  }
  let prevTurn;
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.turn !== prevTurn) {
      prevTurn = it.turn;
      body.appendChild(buildActionLogTurnHeader(it));
    }
    body.appendChild(buildActionLogEventRow(it));
  }
}
function refreshActionLogWindow() {
  if (!actionLogWindowEl) return;
  const body = actionLogWindowEl.querySelector(".action-log-window-body");
  if (body) renderActionLogInto(body);
}
// 行動ログの説明モーダル（タイトル横のⓘから開く。ユーザー要望）。座標の読み方を中心に、
// 何が記録されるか・並び順・色分けの意味をまとめる。
function showActionLogInfoModal() {
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10620 });
  const modal = document.createElement("div");
  modal.id = "action-log-info-modal";
  const heading = document.createElement("div");
  heading.className = "action-log-info-modal-title";
  heading.textContent = "📜 行動ログの見かた";
  modal.appendChild(heading);
  const paras = [
    "新しい行動ほど上に表示されます。ラウンド（R）・ターン（T）ごとに区切られ、手番のプレイヤーはアバターと色で示されます。",
    "記録される内容：カードの到達効果、手札効果、色の宣言、ゲート侵攻 など。",
    "マス座標（例：C3）は盤面の絶対座標です。列は左から A・B・C…G、行は上から 1・2・3…7。C3 なら「左から3列目・上から3行目」のマスを指します（盤面の向きは各プレイヤーで回転しますが、座標は共通の基準です）。",
    "同じ内容が連続したときはまとめて1行にしています。",
  ];
  for (const p of paras) {
    const el = document.createElement("p");
    el.className = "action-log-info-modal-p";
    el.textContent = p;
    modal.appendChild(el);
  }
  modal.appendChild(createModalCloseX(close));
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
function openActionLogWindow() {
  if (actionLogWindowEl) return;
  actionLogWindowEl = document.createElement("div");
  actionLogWindowEl.id = "action-log-window";
  const title = document.createElement("div");
  title.className = "action-log-window-title";
  const titleText = document.createElement("span");
  titleText.textContent = "📜 行動ログ";
  title.appendChild(titleText);
  // ユーザー要望「タイトル横にiマークで、座標のことをはじめ行動ログの詳細な説明を載せる」。
  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "action-log-info-btn";
  infoBtn.textContent = "ⓘ";
  infoBtn.title = "行動ログの見かた";
  infoBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showActionLogInfoModal();
  });
  title.appendChild(infoBtn);
  // ユーザー要望2026-08-08「行動ログウィンドウに✕ボタンをつけて」。📜トグルだけでなく、
  // ウィンドウ自身の右上からも閉じられるようにする。
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "action-log-window-close";
  closeBtn.textContent = "✕";
  closeBtn.title = "閉じる";
  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    closeActionLogWindow();
  });
  title.appendChild(closeBtn);
  const body = document.createElement("div");
  body.className = "action-log-window-body";
  actionLogWindowEl.appendChild(title);
  actionLogWindowEl.appendChild(body);
  getOptionArea().appendChild(actionLogWindowEl);
  document.getElementById("self-status-action-log")?.classList.add("is-active");
  refreshActionLogWindow();
  // 開いている間は新しい行動が追記されるたびに追随する（軽い定期更新）。
  actionLogWindowTimer = setInterval(refreshActionLogWindow, 1500);
}
function closeActionLogWindow() {
  clearInterval(actionLogWindowTimer);
  actionLogWindowTimer = null;
  actionLogWindowEl?.remove();
  actionLogWindowEl = null;
  document.getElementById("self-status-action-log")?.classList.remove("is-active");
}
function buildActionLogToggleWidget() {
  const btn = document.createElement("button");
  btn.id = "self-status-action-log";
  const { captionEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/action-log.svg",
    tooltip: "行動ログの表示／非表示（離席復帰時の見返し用）",
  });
  captionEl.textContent = "ログ";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (isActionLogWindowOpen()) closeActionLogWindow();
    else openActionLogWindow();
  });
  return btn;
}

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
let endTurnCaptionEl = null;
// 静的キャプション/ツールチップの多言語更新用（refreshActionButtonLabels、onLangChangeで呼ぶ）。
let drawCaptionEl = null, drawTooltipEl = null;
let publicDrawCaptionEl = null, publicDrawTooltipEl = null;
let handShuffleCaptionEl = null, handShuffleTooltipEl = null;
let boardZoomCaptionEl = null;

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
// 不具合#20: ターン終了のonActionは非同期（ゲート侵攻の「奪う札を選ぶ」告知モーダル・
// ピック等でawaitする）。その待ち時間の一部はpickerActive等の「処理中」フラグが立たない
// ため、自動ターン終了(reconcileAutoEndTurn)がその隙にendTurnButtonEl.click()を繰り返し、
// onActionが多重に走ってモーダル/背景の重複・NEXT_TURNの連打・手札シャッフルの点滅を
// 起こしていた。onAction実行中は再入を弾くためのガード。
let endTurnActionInProgress = false;
// #130: オンライン中、nextTurn()はEdge Functionへの往復（非同期）で、ローカルの
// turnPlayer/turnNumberはサーバーの結果がhydrateで戻るまで変わらない。reconcileAutoEndTurnは
// shouldEmphasizeがtrueの間1.5秒ごとに再arm・再clickするため、往復が返る前に何度もNEXT_TURNを
// 送ってしまい、サーバーで順に適用されて相手のターンが飛ぶ（ログ実測: T1→T3、A(T2)が丸ごと
// スキップ）。「自動ターン終了を1回送ったら、実際にターンが進む（turnNumberが変わる）まで
// 再送しない」ためのゲート。万一NEXT_TURNが失われて進まなかった場合に永久ロックしないよう
// 安全タイムアウトで解除する。
let autoEndTurnPendingForTurn = null;
let autoEndTurnPendingSince = 0;
const AUTO_END_TURN_PENDING_TIMEOUT_MS = 8000;
function isEndTurnAdvancePending() {
  if (autoEndTurnPendingForTurn == null) return false;
  // 実際にターンが進んだ（turnNumberが変わった）＝反映済み。
  if (getState().turnNumber !== autoEndTurnPendingForTurn) {
    autoEndTurnPendingForTurn = null;
    return false;
  }
  // 安全タイムアウト（NEXT_TURNが失われて進まなかった場合の回復）。
  if (Date.now() - autoEndTurnPendingSince > AUTO_END_TURN_PENDING_TIMEOUT_MS) {
    autoEndTurnPendingForTurn = null;
    return false;
  }
  return true;
}
function markEndTurnAdvancePending() {
  autoEndTurnPendingForTurn = getState().turnNumber;
  autoEndTurnPendingSince = Date.now();
}
function reconcileAutoEndTurn(shouldEmphasize) {
  if (shouldEmphasize) {
    if (autoEndTurnTimer) return;
    autoEndTurnTimer = setTimeout(() => {
      autoEndTurnTimer = null;
      // #130: 直前に自動ターン終了を送っていて、まだサーバーからターン交代が
      // 戻ってきていない（turnNumberが変わっていない）間は再クリックしない。
      // これをしないとオンライン往復の遅延中にNEXT_TURNを連打して相手のターンが飛ぶ。
      if (isEndTurnAdvancePending()) return;
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
  captionEl.textContent = t("btn.endTurn.caption");
  endTurnCaptionEl = captionEl;
  endTurnTooltipEl = tooltipEl;
  wireIconButtonClick(btn, {
    detailTitle: () => t("btn.endTurn.caption"),
    detailParagraphs: () => [t("btn.endTurn.detail1"), t("btn.endTurn.detail2")],
    onAction: async () => {
      // 不具合#20: 実行中の再入を弾く（ゲート侵攻の告知/ピック等でawaitする間に自動ターン終了が
      // 再クリックして多重実行するのを防ぐ）。「自分の手番でない」等の正当な早期returnは、
      // ガードを立てる前に済ませておく（それらは副作用が無いため）。
      if (endTurnActionInProgress) return;
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
      endTurnActionInProgress = true;
      // 不具合#25: ガードは「NEXT_TURNまで完了した時点」で解除する。オンライン経路は同期的に
      // nextTurn後、ローカルのゲート侵攻経路はrunGateInvasionsIfNeededの完了コールバック後に解除
      // （runGateInvasionsIfNeededはfire-and-forgetなので、finallyで即解除すると侵攻演出の最中に
      // 自動ターン終了が再クリックして多重処理していた——OK連打・背景暗転・エターナル演出の連発）。
      // 万一どのコールバックにも到達しない事故に備え、安全タイムアウトでも必ず解除する。
      const guardSafety = setTimeout(() => {
        endTurnActionInProgress = false;
      }, 60000);
      const releaseGuard = () => {
        clearTimeout(guardSafety);
        endTurnActionInProgress = false;
      };
      try {
      // 奇跡の森 マンズウッド専用: このターン中に「ターン終了時に捨てる」と予約された
      // トークンがあれば、実際にnextTurn()を呼ぶ前（＝publicDrawの手札合流処理が走る
      // より前）に先に捨てておく（markDiscardAtTurnEnd参照）。
      await flushPendingTurnEndDiscards(turnPlayerBeforeEnd);
      // ゲート侵攻ボーナス(GATE_INVASION_*)は、so7-apply-action.ts側でNEXT_TURN処理に
      // 統合済み（サーバー側で自動判定・自動適用される）。オンライン中にrunGateInvasionsIfNeeded()
      // を呼ぶとローカルだけに二重適用されサーバーの状態と食い違ってしまうため、
      // オンライン中はnextTurn()だけを直接呼ぶ。
      if (isOnlineMode()) {
        // #130: 直前の自動/手動ターン終了がまだサーバーから戻ってきていない（ターンが
        // 進んでいない）間は、二重にNEXT_TURNを送らない（相手のターンが飛ぶのを防ぐ）。
        if (isEndTurnAdvancePending()) {
          releaseGuard();
          return;
        }
        // ゲート侵攻で奪う札は、ルール通りサーバーが「無作為に」決める。奪う演出（相手の
        // 裏向き手札から儀式的にめくる／相手側にはライブで見える）は、以前のような
        // ターン終了時の事前ピックではなく、侵攻ボーナスの受信キュー
        // （gate-invasion-modal.js → playGateInvasionStealRitual）で、
        // 侵攻→成功告知→奪う儀式→奪ったカード一覧→エターナル→帰還、という正しい順で見せる
        // （ユーザー要望「奪う手札を選択する儀式的な演出は必要／モーダルの順序」#126）。
        // これにより「手番プレイヤー以外の侵攻」でも儀式が出て、告知が二重になる問題も解消する。
        // #61診断: オンラインでNEXT_TURNを送る直前の状態を記録する。防御側の接触到達効果が
        // まだ処理中（他端末）なのにここへ来ていないか、優先権がnull（タイマーOFF＝保持機構が
        // 無効）でないかを、diag-contact-priority群と時刻で突き合わせて確定する。
        logAction("diag-next-turn", {
          turnPlayer: turnPlayerBeforeEnd,
          selfSeat: getSelfSeat(),
          priorityPlayer: getState().priorityPlayer,
          phase: getCurrentPhase(),
          arrivalProcessing: isArrivalEffectProcessing(),
          pendingContact: !!getState().pendingContact,
          contactResultModals: openContactResultModals,
          // #168診断: NEXT_TURN送信時点で、クライアントがゲート侵攻候補を検知しているか。
          // サーバーが侵攻イベントを出さない／クライアントが受信・演出しない、のどちらが原因かを
          // 後から切り分けるため、参加者ごとの侵攻先(findInvadedDefender)を記録する。gateInvadersが
          // 空でないのに以後 diag-gate-invasion-received/演出が出なければサーバー or 受信側の問題、
          // 空なら turn 終了時点で駒がゲート上に無かった（移動/検知漏れ）と切り分けられる。
          gateInvaders: getState()
            .activePlayers.map((atk) => ({ atk, def: findInvadedDefender(atk) }))
            .filter((x) => x.def !== null),
        });
        // #130: このターン(turnNumber)への NEXT_TURN を送った印を付ける。ターンが実際に
        // 進む（turnNumberが変わる）まで、reconcileAutoEndTurn/手動クリックの再送を止める。
        markEndTurnAdvancePending();
        transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
        nextTurn();
        releaseGuard();
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
              releaseGuard();
            });
          },
          () => {
            transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
            nextTurn();
            render();
            releaseGuard();
          }
        );
        return; // ガードは確認モーダルのコールバックで解除する（それまで再入を弾き続ける）
      }
      // ローカルのゲート侵攻はrunGateInvasionsIfNeededの完了コールバックまでガードを保持する
      // （侵攻演出中の自動ターン終了の多重発火を防ぐ。#25）。
      runGateInvasionsIfNeeded(() => {
        transferPriorityToNextTurnPlayer(turnPlayerBeforeEnd);
        nextTurn();
        render();
        releaseGuard();
      });
      } catch (err) {
        // 例外時は必ずガードを解除（詰まらせない）。正常系は各経路のreleaseGuardで解除済み。
        releaseGuard();
        throw err;
      }
    },
  });
  document.body.appendChild(btn);
  return btn;
}

// exportしてturn-timer.jsのtickからも呼ぶ（#8。下のreconcileAutoEndTurn／
// computeShouldEmphasizeを、render()を伴わない非同期の状態変化＝パーティー等の委任効果で
// 優先権が相手→自分へ戻った後などでも取りこぼさず再評価するため）。冒頭のendTurnButtonEl
// ガードにより、まだ生成前でも安全に何もしないで戻る。
export function updateEndTurnButton() {
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
    if (endTurnTooltipEl) endTurnTooltipEl.textContent = t("btn.endTurn.otherTurn", { name: getPlayerName(turnPlayer) });
    endTurnButtonEl.disabled = true;
  } else if (isOnlineMode() && state.priorityPlayer && getSelfSeat() !== state.priorityPlayer) {
    if (endTurnTooltipEl) endTurnTooltipEl.textContent = t("btn.endTurn.otherPriority", { name: getPlayerName(state.priorityPlayer) });
    endTurnButtonEl.disabled = true;
  } else {
    if (endTurnTooltipEl) {
      endTurnTooltipEl.textContent = isOnlineMode()
        ? t("btn.endTurn.tooltipSelf")
        : t("btn.endTurn.tooltipLocal", { name: getPlayerName(turnPlayer) });
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
  const gateInvasionQueueActive = isGateInvasionQueueActive() || isLocalGateInvasionActive();
  const handEffectBusyNow = isHandEffectBusy();
  const pickerActive = activeEffectPicker !== null;
  // ユーザー報告（続き83）「『いつでも使える』の使うか確認モーダルが出ている最中に
  // ターンが切り替わってしまった」。isAnyEffectProcessingBusy()には既に追加済みだが、
  // computeShouldEmphasize()自体は同じ判定を（診断ログの内訳表示のため）自前で
  // 再計算しているため、ここにも同じ理由で追加する必要がある。
  const anytimeInterruptModalShowing = anytimeInterruptModalEl !== null;
  // #40: 接触結果モーダルが開いている間は自動ターン終了を止める（閉じてから次のターンへ）。
  const contactResultModalShowing = openContactResultModals > 0;
  const result =
    autoProcessingEnabled &&
    !endTurnDisabled &&
    isMovePhase &&
    !moveStillActive &&
    !isArrivalEffectProcessing() &&
    !state.pendingContact &&
    !contactResultModalShowing &&
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
// 盤面拡大ボタンの3段階ラベル（多言語）。言語切替に追従するよう都度 t() で解決する。
function boardZoomLabels() {
  return [t("btn.boardZoom.label0"), t("btn.boardZoom.label1"), t("btn.boardZoom.label2")];
}

let boardZoomButtonEl = null;
let boardZoomTooltipEl = null;
let boardZoomIconImgEl = null;
let boardZoomRegisterButtonEl = null;

function updateBoardZoomButtonLabel() {
  const btn = boardZoomButtonEl;
  if (!btn) return;
  if (hasManualView) {
    if (boardZoomTooltipEl) boardZoomTooltipEl.textContent = t("btn.boardZoom.returnToView");
    if (boardZoomIconImgEl) boardZoomIconImgEl.src = DUMMY_ICON_RETURN_TO_VIEW;
    btn.classList.add("is-active");
    btn.classList.remove("is-zoom-2");
  } else {
    btn.classList.toggle("is-active", boardZoomLevel > 0);
    btn.classList.toggle("is-zoom-2", boardZoomLevel === 2);
    if (boardZoomTooltipEl) boardZoomTooltipEl.textContent = boardZoomLabels()[boardZoomLevel];
    if (boardZoomIconImgEl) boardZoomIconImgEl.src = "assets/icons/board-zoom.svg";
  }
  updateBoardZoomRegisterButtonPosition();
}

// 言語切替（onLangChange）時に、右下の常設アクションボタンの静的キャプション/ツールチップを
// 現在の言語へ更新する。ボタン自体はplayer-buttons.jsが位置・ドラッグ・ショートカットを
// id基準で管理しているため、要素を作り直さず中身のテキストだけ差し替える（状態依存の
// ツールチップは updateEndTurnButton / updateBoardZoomButtonLabel が担当）。
function refreshActionButtonLabels() {
  if (endTurnCaptionEl) endTurnCaptionEl.textContent = t("btn.endTurn.caption");
  if (boardZoomCaptionEl) boardZoomCaptionEl.textContent = t("btn.boardZoom.caption");
  if (drawCaptionEl) drawCaptionEl.textContent = t("btn.draw.caption");
  if (drawTooltipEl) drawTooltipEl.textContent = t("btn.draw.tooltip");
  if (publicDrawCaptionEl) publicDrawCaptionEl.textContent = t("btn.publicDraw.caption");
  if (publicDrawTooltipEl) publicDrawTooltipEl.textContent = t("btn.publicDraw.tooltip");
  if (handShuffleCaptionEl) handShuffleCaptionEl.textContent = t("btn.handShuffle.caption");
  if (handShuffleTooltipEl) handShuffleTooltipEl.textContent = t("btn.handShuffle.tooltip");
  updateBoardZoomButtonLabel(); // 盤面拡大の状態依存ツールチップも現在の言語で
  updateEndTurnButton(); // ターン終了の状態依存ツールチップも
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
    tooltip: boardZoomLabels()[0],
  });
  captionEl.textContent = t("btn.boardZoom.caption");
  boardZoomCaptionEl = captionEl;
  boardZoomTooltipEl = tooltipEl;
  boardZoomIconImgEl = btn.querySelector(".icon-action-button-icon-img");
  wireIconButtonClick(btn, {
    detailTitle: () => t("btn.boardZoom.caption"),
    detailParagraphs: () => [t("btn.boardZoom.detail1"), t("btn.boardZoom.detail2")],
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
  // ユーザー要望2026-08-08「スマホで指二本タップ状態で盤面を自由に画角調整できるように
  // してほしい。PCではマウスホイール押し込み(中クリックドラッグ)でできる」。以前は2本指は
  // ピンチ=ズームのみだったが、2本指の中点(重心)の移動でパン(manualPanX/Y)も同時に動かす
  // ようにして、中クリックドラッグと同じ自由な画角調整を指2本でできるようにした。
  const activeTouches = new Map(); // pointerId -> {x, y}
  let pinchStartDist = null;
  let pinchStartZoom = 1;
  let pinchStartCentroid = null; // {x, y} 実画面ピクセル
  let pinchStartPanX = 0;
  let pinchStartPanY = 0;

  function touchDistance() {
    const pts = Array.from(activeTouches.values());
    if (pts.length < 2) return null;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }
  function touchCentroid() {
    const pts = Array.from(activeTouches.values());
    if (pts.length < 2) return null;
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
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
    const centroid = touchCentroid();
    if (dist == null || centroid == null) return;
    if (pinchStartDist == null) {
      // 2本指が揃った瞬間を基準に取り直す（ズーム=指間距離、パン=中点の移動）。
      pinchStartDist = dist;
      pinchStartZoom = manualZoom;
      pinchStartCentroid = centroid;
      pinchStartPanX = manualPanX;
      pinchStartPanY = manualPanY;
      return;
    }
    manualZoom = Math.min(4, Math.max(0.3, pinchStartZoom * (dist / pinchStartDist)));
    // 2本指の中点の移動ぶんだけパンする。中クリックドラッグと同じく、実画面ピクセルの差分を
    // ステージのローカルピクセルへ変換(stageDelta)してからremへ換算する。
    const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    manualPanX = pinchStartPanX + stageDelta(centroid.x - pinchStartCentroid.x) / rootFontSizePx;
    manualPanY = pinchStartPanY + stageDelta(centroid.y - pinchStartCentroid.y) / rootFontSizePx;
    hasManualView = true;
    fitTableToViewport();
    updateBoardZoomButtonLabel();
  });
  function releaseTouch(e) {
    if (e.pointerType !== "touch") return;
    activeTouches.delete(e.pointerId);
    if (activeTouches.size < 2) {
      pinchStartDist = null;
      pinchStartCentroid = null;
    }
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
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/hand-shuffle.svg",
    tooltip: t("btn.handShuffle.tooltip"),
  });
  captionEl.textContent = t("btn.handShuffle.caption");
  handShuffleCaptionEl = captionEl;
  handShuffleTooltipEl = tooltipEl;
  wireIconButtonClick(btn, {
    detailTitle: () => t("btn.handShuffle.caption"),
    detailParagraphs: () => [t("btn.handShuffle.detail1"), t("btn.handShuffle.detail2")],
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
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/draw.svg",
    tooltip: t("btn.draw.tooltip"),
  });
  captionEl.textContent = t("btn.draw.caption");
  drawCaptionEl = captionEl;
  drawTooltipEl = tooltipEl;
  wireIconButtonClick(btn, {
    detailTitle: () => t("btn.draw.caption"),
    detailParagraphs: () => [t("btn.draw.detail1"), t("btn.draw.detail2")],
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
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, {
    icon: "assets/icons/public-draw.svg",
    tooltip: t("btn.publicDraw.tooltip"),
  });
  captionEl.textContent = t("btn.publicDraw.caption");
  publicDrawCaptionEl = captionEl;
  publicDrawTooltipEl = tooltipEl;
  wireIconButtonClick(btn, {
    detailTitle: () => t("btn.publicDraw.caption"),
    detailParagraphs: () => [t("btn.publicDraw.detail1"), t("btn.publicDraw.detail2")],
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
let selfStatusLargeAvatarGhostEl = null;
let selfStatusRankRingEl = null;

// ユーザー要望「戦績システムと連携しているプレイヤーはステータスエリアにランクを
// 表示させたい」。stats-profile.jsのgetTierInfo()と同じ形のtierオブジェクト
// （{type:'ring',color,glow} または {type:'rainbow'}、もしくは連携無しならnull）を
// 受け取り、リング要素の見た目を更新する。
// ユーザー要望「ランクリングは常時表示されていてください」への対応。戦績システムと
// 未連携・未ログインの間は、実際のティア（getTierInfo）が求められないため、この
// 中立的な色（アプリ全体で補助テキストに使っている灰色と同じ）をそのまま代わりに使う。
const UNLINKED_RANK_TIER = { type: "ring", color: "#94a3b8", glow: null, label: "未連携" };

// ユーザー報告「ランク表示（回転するオーブ）があるとアバターの背景が透明にならない。
// ただしランクリングの太さをスライダーで少しでも変えると背面が完全に透明になり、値を
// 元に戻しても透明なまま」。太さの“値”は無関係で、スライダー操作が:rootのカスタム
// プロパティを書き換える＝全体のスタイル再計算＋再描画を一度起こすことが直る条件——
// 典型的な「初回ペイントだけアバターの縁の放射状マスクが未適用」の合成バグ。オーブの
// box-shadow／虹ティアの連続filterアニメ(hue-rotate)が、兄弟であるマスク付きアバターの
// 初回ラスタライズに干渉して起きている。スライダーと同じ「一度きりの再描画」を、リングを
// 表示した直後に自動で起こしてやる。初回の（未適用の）ペイントが済んだ後でないと効かない
// ため次フレーム以降に実行し、その要素だけをdisplayトグル＋強制リフローで確実に再
// ラスタライズさせる（同期トグルなのでちらつきは出ない）。
function nudgeSelfStatusMaskedAvatarRepaint() {
  const run = () => {
    for (const host of [selfStatusLargeAvatarEl, selfStatusLargeAvatarGhostEl]) {
      const img = host?.querySelector(".avatar-image");
      if (!img) continue;
      const prev = img.style.display;
      img.style.display = "none";
      void img.offsetHeight; // 強制リフロー（none状態を確定させ、戻した時に確実に再描画させる）
      img.style.display = prev;
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(run));
}

function updateSelfStatusRankRing(tier) {
  if (!selfStatusRankRingEl) return;
  const wasVisible = selfStatusRankRingEl.classList.contains("is-visible");
  selfStatusRankRingEl.classList.remove("is-visible", "is-solid", "is-glow", "is-rainbow");
  selfStatusRankRingEl.style.removeProperty("--rank-ring-color");
  selfStatusRankRingEl.style.removeProperty("--rank-ring-glow");
  if (!tier) tier = UNLINKED_RANK_TIER;
  selfStatusRankRingEl.classList.add("is-visible");
  // リングが新しく表示された時だけ、マスク未適用の初回ペイントを補正する再描画を促す。
  if (!wasVisible) nudgeSelfStatusMaskedAvatarRepaint();
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
    // 国王アバターは有料（ショップで購入）。未所持ならロック表示にして、クリックで
    // アバターカテゴリのショップを開く（ペットピッカーと同じ挙動）。色アバターは
    // getAvatarItemKeyがnullを返す＝無料なので従来通りそのまま選べる。
    const itemKey = getAvatarItemKey(avatar);
    const locked = !!itemKey && !isItemUnlocked(itemKey);
    if (locked) {
      const cost = getAvatarCost(avatar) ?? 0;
      swatch.classList.add("is-locked");
      swatch.title = `🔒 ${cost}で購入`;
      const lockBadge = document.createElement("span");
      lockBadge.className = "avatar-picker-swatch-lock";
      lockBadge.textContent = `🔒${cost}`;
      swatch.appendChild(lockBadge);
    }
    swatch.addEventListener("click", () => {
      if (locked) {
        close();
        openShop?.("avatar");
        return;
      }
      setPlayerAvatar(getSelfSeat(), avatar);
      render();
      close();
    });
    grid.appendChild(swatch);
  }

  // 特殊アバター「記憶を失った青年」（無料）。選んだプレイヤーの駒の色に合わせて色が
  // 変わるため、保存値はセンチネル(PROTAGONIST_AVATAR)にする。プレビューは自分の座席の
  // 駒色版を表示する。
  {
    const swatch = document.createElement("button");
    swatch.className = "avatar-picker-swatch";
    swatch.title = "記憶を失った青年（駒の色に合わせて色が変わります）";
    if (getRawPlayerAvatar(getSelfSeat()) === PROTAGONIST_AVATAR) swatch.classList.add("is-selected");
    applyAvatarContent(swatch, protagonistPathForSeat(getSelfSeat()));
    swatch.addEventListener("click", () => {
      setPlayerAvatar(getSelfSeat(), PROTAGONIST_AVATAR);
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
  // ユーザー要望「半透明の背面アバターをクリックしてもエモートは出ないように」。背面ゴースト
  // 自体は pointer-events:none で既にクリック不可だが、本体アバターの当たり判定は四角い箱
  // （画像は円形なので四隅は透明で、そこには背面ゴーストが透けて見える）。その透明な四隅で
  // エモートが出ないよう、円の内側をクリックした時だけエモートを開く。
  selfStatusLargeAvatarEl.addEventListener("click", (e) => {
    const rect = selfStatusLargeAvatarEl.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    if (Math.hypot(dx, dy) > Math.min(rect.width, rect.height) / 2) return; // 円の外（四隅）は無視
    openEmotePicker(selfStatusLargeAvatarEl);
  });
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

  // ユーザー要望「不透明アバターの背面に、少しずらして半透明のアバターも表示したい」。
  // 本体と同じ画像をもう1枚、本体より前（DOM順で先）に追加して背面に薄く重ねる。
  // 中身はupdateSelfHandStatus()で本体と同じsrcを流し込む（applyAvatarContentが
  // 子要素を作り替えるため、本体と別要素にしておく）。
  selfStatusLargeAvatarGhostEl = document.createElement("div");
  selfStatusLargeAvatarGhostEl.className = "self-status-large-avatar-ghost";
  el.appendChild(selfStatusLargeAvatarGhostEl);

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
  // ユーザー要望「オンラインアイコンは右上のオプションエリアへ移設（残金アイコンの左）、
  // 部屋名はアイコンの右隣に表示」。ここ（ステータスエリア）には置かず、下の初期化で
  // オプションエリアの#currency-displayの手前に差し込む（initOnlineStatusWidgetInOptionArea）。

  el.appendChild(iconGrid);
  el.appendChild(info);
  document.body.appendChild(el);
  return el;
}

function updateSelfHandStatus() {
  if (!selfHandStatusEl) return;
  // ヴァーディアン等の「公開ドロー」で加えた札（publicDrawゾーン）も、ターン終了まで
  // 実質的に手札の一部（スラム上がりの役人の手札数え等も同様に扱う）なので枚数に含める。
  const count = getState().tokens.filter(
    (t) =>
      t.kind === "card" &&
      (t.location.zone === "hand" || t.location.zone === "publicDraw") &&
      t.location.player === getSelfSeat()
  ).length;
  let selfAvatarSrc = getAvatarVariant(getPlayerAvatar(getSelfSeat()), "right");
  const selfLockedCount = getLockedCount(getSelfSeat());
  if (selfLockedCount >= 6) selfAvatarSrc = getEnragedVariant(selfAvatarSrc);
  else if (selfLockedCount >= 4) selfAvatarSrc = getAwakenedVariant(selfAvatarSrc);
  applyAvatarContent(selfStatusLargeAvatarEl, selfAvatarSrc);
  // 背面の半透明アバター（ユーザー要望）にも同じ画像を反映する。
  if (selfStatusLargeAvatarGhostEl) applyAvatarContent(selfStatusLargeAvatarGhostEl, selfAvatarSrc);
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
  if (selfStatusPetThumbEl) {
    // スプライトペット（キュビット等）は画像サムネイル、絵文字ペットは文字で表示する。
    const petOpt = PET_OPTIONS[getSelectedPetIndex()];
    if (petOpt?.sprite) {
      selfStatusPetThumbEl.classList.remove("is-empty");
      let petImg = selfStatusPetThumbEl.querySelector("img");
      if (!petImg) {
        selfStatusPetThumbEl.textContent = "";
        petImg = document.createElement("img");
        petImg.alt = "";
        selfStatusPetThumbEl.appendChild(petImg);
      }
      const petSrc = petSpriteSrc(petOpt.sprite, "front", "static");
      if (petImg.getAttribute("src") !== petSrc) petImg.src = petSrc;
    } else if (petOpt?.emoji) {
      selfStatusPetThumbEl.classList.remove("is-empty");
      selfStatusPetThumbEl.querySelector("img")?.remove();
      selfStatusPetThumbEl.textContent = petOpt.emoji;
    } else {
      // 「なし（非表示）」を選んでいる時。以前は emoji が null のフォールバックで
      // ひよこ🐥が出てしまっていた（ユーザー報告）。実際のペットと紛らわしくないよう、
      // クリックはできる（ペット選択を開ける）ままにしつつ、薄い肉球プレースホルダーにする。
      selfStatusPetThumbEl.querySelector("img")?.remove();
      selfStatusPetThumbEl.textContent = "🐾";
      selfStatusPetThumbEl.classList.add("is-empty");
    }
  }

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
// カード拡大プレビューのサイズは端末に保存される好み設定。初回設定モーダルがその値を
// 初期値として読むより先に、保存済みの値をCSS変数へ復元しておく（毎回の起動で反映）。
applyStoredCardPreviewSize();
// 「手札を画面下に固定する」設定を body クラスへ復元（render()がこれを見て手札の描画先を決める）。
applyStoredFixedHand();
// 初回起動時だけ、オープニングの手前にサウンド／表示の設定モーダル（試聴ボタン付き）を出す。
maybeShowFirstRunBgmModal();

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
// アプリ内スモークテストの起動ボタン（タイトル右下・管理者ログイン時のみ。ユーザー要望2026-08-14）。
// 表示はCSSで body.opening-screen-active.is-admin-user の時だけ（下の updateAdminBodyClass が
// 認証変化に応じて is-admin-user を付け外しする）。押すと自己対戦スモークのパネルを開く。
(() => {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "smoke-test-launch-btn";
  btn.textContent = "🧪 スモークテスト";
  btn.title = "自己対戦でエラー・詰みを自動チェック（管理者用）";
  btn.addEventListener("click", () => openSmokeTestPanel());
  document.body.appendChild(btn);
  const updateAdminBodyClass = () => {
    try { document.body.classList.toggle("is-admin-user", !!isAdminUser()); } catch { /* noop */ }
  };
  updateAdminBodyClass();
  onAuthChange(updateAdminBodyClass); // 管理者アカウントでログイン/ログアウトした時に出し分けを更新
})();

// #93セーフティ・ウォッチドッグ: 手札効果解決フラグ(handEffectBusy)が「取り残し」で
// 恒久的に true のまま残ると、盤面が全カード・トーンオフのまま／スキップ不可で永久に詰む
// （実機報告#93: ジャンプ台の手札効果→連鎖到達で選べる罠まで解決した後、busyが解除されず停止）。
// 選択待ちの間は必ず activeEffectPicker が立つ（pickOptionForEffect等）ため、ピッカーも到達処理も
// 各種モーダルもゲート侵攻も一切無いのに一定時間 busy のままなら「取り残し」と断定し、安全に解除して
// 盤面を復帰させる（進行中の効果を中断するわけではなく、あくまで宙に浮いたフラグの後始末）。
// 根本原因の特定用に diag ログも残す。
setInterval(() => {
  try {
    if (getHandEffectBusyStuckMs() < 20000) return;
    // 何かが本当に処理待ち/表示中なら手を出さない（誤解除防止）。
    if (activeEffectPicker) return;
    if (isArrivalEffectProcessing()) return;
    if (openContactResultModals > 0) return;
    if (anytimeInterruptModalEl) return;
    if (isGateInvasionPending() || isGateInvasionQueueActive() || isLocalGateInvasionActive()) return;
    if (getState().pendingContact) return;
    logAction("diag-handeffect-busy-watchdog", {
      stuckMs: getHandEffectBusyStuckMs(),
      turnPlayer: getState().turnPlayer,
      selfSeat: getSelfSeat(),
    });
    setHandEffectBusy(false);
    render();
  } catch { /* noop: ウォッチドッグ自身で例外を投げても進行を止めない */ }
}, 5000);

initDeckViewer();
initStatsPlayerLinkModal();
initMyPage();
initCardDevMode();
initActionLogPanel();
// ブラックボックス: 前回セッションが不審に終わっていた（＝落ちてタイトルに戻った疑い）場合、
// その内訳（メモリのピーク・CPU戦/オンライン・遷移種別・直前エラー）をアクションログへ残す。
// こうしておくと、次に落ちた後に送られる不具合報告のログでその1行を見れば原因を絞り込める。
try {
  const bb = getBlackboxBootReport();
  if (bb) logAction("diag-crash-recovery", bb);
} catch {
  /* 診断ログの失敗はアプリ本体に影響させない */
}
// 現在が「対局中か・CPU戦かオンラインか」をブラックボックスへ随時反映（落ちた時にどの画面
// だったか分かるように）。変化時だけ書き込む（setBlackboxContext内でdedup）。
subscribe(() => {
  try {
    const started = Boolean(getState().turnPlayer);
    const mode = !started ? "title" : isOnlineMode() ? "online" : isCpuBattleActive() ? "cpu" : "local";
    setBlackboxContext({ inGame: started, mode });
  } catch {
    /* ignore */
  }
});
registerCardDevModeArrivalHelpers({ triggerCardArrival, runAutoHandEffect, render });
registerPhaseAutomationHelpers({ render, findTopCardAt, pickLocation: requestCellChoiceForEffect, notifyPlayerDecision });
initHelpButton();
initRankingIcon();
initUpdateChecker(); // デプロイ検知＆更新案内バナー（version.jsonを定期チェック）
initPiecePets(); // 駒に遅れて追従する飾りのペット（見た目だけ・ゲームには無関係）
// ユーザー要望「更新バナーは対局中は出さない、対局が終われば出す」。対局が進行中
// （参加者が居て・手番があり・まだ誰も勝っていない）またはチュートリアル中は保留し、
// それ以外（ホーム画面・対局終了後）でだけ出す。判定が変わるたびrender()末尾で再評価する。
function isInGameForBanner() {
  // CPU戦（1人用の気軽なソロ）は「対局中は保留」の対象から外し、更新バナーを出す。
  // オンライン対戦と違い、CPU戦は延々と続いても区切り（勝利・ホーム復帰）に来ないことが多く、
  // 対局中扱いだと新バージョンの通知が一度も出ないまま古い版で遊び続けてしまうため
  // （ユーザー報告: 修正済みなのに古い版で不具合を踏み続ける）。小さな上部バナーの通知で、
  // 押すかどうかはユーザー任せなので、CPU戦中に出ても実害は無い。
  if (isCpuBattleActive()) return false;
  const st = getState();
  const inMatch = (st.activePlayers?.length ?? 0) > 0 && !!st.turnPlayer && !hasAnyoneWon();
  return inMatch || isTutorialBattleActive();
}
setUpdateBannerGate(() => !isInGameForBanner());
initDiscordLink();
initBoardViewToggle(); // Discordアイコンと残金表示の間に2D/3D切り替えアイコンを置く（順序＝追加順）
initFullscreenToggle(); // 不具合報告と2D/3D切替の間に全画面表示アイコンを置く（位置はCSS）
initCurrencyDisplay();
// オンライン状態ウィジェットをオプションエリアの残金アイコン(#currency-display)の左隣へ
// 差し込む（ユーザー要望「オンラインアイコンを右上に移設・部屋名はアイコンの右隣に表示」）。
// initCurrencyDisplay()の直後なので#currency-displayは既に存在する。
(() => {
  const optionArea = document.getElementById("option-area");
  const currencyEl = document.getElementById("currency-display");
  if (!optionArea) return;
  const onlineWidget = buildSelfStatusOnlineWidget();
  optionArea.insertBefore(onlineWidget, currencyEl);
  // ユーザー要望「不具合報告は運用上重要なので、オプションメニューの中ではなく、オプション
  // エリアのオンライン表示の左隣に常設で外出しする」。見た目上はオンラインアイコンの左の
  // 位置（CSSの top/right で固定）に置くが、DOM上は #option-area ではなく body 直下へ付ける。
  // 理由（ユーザー要望「不具合報告ボタンだけ常に最前面に」）: #option-area は z-index:900 の
  // スタッキングコンテキストのため、その子であるこのボタンはゲーム中のモーダル(10500〜)より
  // 前面に出せず、モーダルの詰み時に押せなかった（＝ログを送れない）。body直下＋高いz-indexに
  // することで、どんなモーダルが出ていても常に押せて報告できる（フェイズ操作ボタン等は
  // #option-area のまま＝モーダルより後ろのままなので、リアクション中に誤操作でズレる副作用は
  // 出さない）。CSSは position:fixed のままなのでDOMの親が変わっても表示位置は同じ。
  document.body.appendChild(buildBugReportWidget());
  // 行動ログのトグルアイコン（オプションアイコンとマイページアイコンの間、位置はCSSで指定）。
  optionArea.appendChild(buildActionLogToggleWidget());
})();
initShop();
registerShopOpener(openShopPanel);
// 戻り時ガード（ユーザー要望2026-08-14）: 参加中の対局が掃除で消えていた場合、online.jsが後始末
// (leaveGame)を済ませた後にこれを呼ぶ。黒画面のまま固まらせず、通知してホームへ戻す。home-screen.jsは
// 動的importで読む（静的importにすると循環になりうるため。[[circular-import-tdz-and-no-cache-bust]]）。
registerGameGoneHandler(() => {
  try {
    alert("この対局は終了しました（部屋が閉じられました）。ホームに戻ります。");
  } catch { /* noop */ }
  import("./home-screen.js")
    .then((m) => m.openHomeScreen?.())
    .catch((err) => console.error("openHomeScreen after game-gone failed", err));
});
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
registerTutorialBattleHelpers({ triggerLockEffect, playScriptedContact, flyBoardCardToHand, flyDrawnCardToHand, flyHandCardBetweenSeats, playEternalAcquisitionAnim });
initTutorialAutoStart();
initGameBgmAutoStart();
initSoundUnlock(); // iOS等で効果音を鳴らすため、最初の操作でAudioContextをアンロック＆事前ロード
initScreenWakeLock(); // スマホ/タブレットの自動画面オフを防ぐ（wake-lock.js、対応環境のみ）
initTurnTimer();
initMatchStatsTracker();
initPseudoCpuPrompt();
initIconRearrange();
initSelfStatusRearrange();
initInteractionModeToggle();
initDeviceDetect();
initJankLogger(); // カクつき（重いフレーム）検知ログ（続き243。?jank=1/?iso=1/?flat=1/2D保存時のみ動く）
initRankedNotify(); // ランク戦の「待機プレイヤーが現れたら通知」（設定ONの端末のみポーリング開始）
// Web Push（続き198）: Service Workerを登録（許可が無くても無害）。既に通知許可済みの端末
// （前回許可した戻りユーザー）は、この時点で購読し直して自席subscriptionを保存しておく
// （endpointが変わった時の追随＋ログイン直後の再登録のため）。VAPID未設定なら中で無害にスキップ。
initPushNotify();
if (typeof Notification !== "undefined" && Notification.permission === "granted") {
  void subscribeToPush();
}
registerRecommendedViewHelper(applyRecommendedMobileZoom); // タブレット2D警告の「おすすめ表示（2D＋拡大）」で盤面拡大
registerRenderHelpers({ render, triggerLockEffect, spawnArrivalBurst, findLocationElement, setSetupPendingTokenIds });
registerPieceSkinHelpers({ render });
registerCardBackSkinHelpers({ render, savePreference: saveMyPreference, isItemUnlocked, openShop });
// マイデッキ戦（マイデッキ.txt）: デッキビルダーの保存をアカウント(so7_user_profiles.my_deck)へ
// も反映する。オンライン対戦開始時にサーバー(so7-apply-action)が各席のこの値を読み、シャッフル
// して配るため保存が必須。未ログイン/列未追加でもlocalStorageには保存済みで、ここは失敗しても無害。
registerMyDeckPersistence((deck) => saveMyPreference({ my_deck: deck }));
// マイデッキ戦F4: 開始時のデッキ選択オーバーレイを出す関数（ホストはonline.jsから直接、
// 非ホストはdeck_selection_start broadcastで呼ばれる）。選んだ結果を自分の座席へ保存する。
const showDeckSelect = (deadline) => {
  if (isDeckSelectOpen()) return;
  // deadlineが無い（null/未指定）＝タイマー無しの対局。カウントダウンを出さず、選ぶまで待つ
  // （durationSec 0 で my-deck-select 側がカウントダウン無しモードになる。ユーザー要望2026-08-14）。
  const durationSec = deadline ? Math.max(5, Math.ceil((deadline - Date.now()) / 1000)) : 0;
  openDeckSelect({ durationSec, onResolved: (r) => writeSelectedDeck(r) });
};
registerDeckSelectHandler(showDeckSelect);
onDeckSelectionStartEvents((payload) => showDeckSelect(payload?.deadline));
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
  // CPU戦で「CPU（自分以外の手番）の盤面操作」だけ、オンラインと同じ点滅＋矢印を出すための判定
  // （ユーザー要望2026-08-13）。remote-move-animator.jsのhandleHydrateが参照する。自分の手番中は
  // 差分検知しない＝自分の操作は点滅させない。
  shouldDiffLocalMoves: () =>
    isCpuBattleActive() && !isOnlineMode() && !!getState().turnPlayer && getState().turnPlayer !== getSelfSeat(),
});
registerFinalLockApprovalHandler(respondToFinalLock);
registerGomennasaiHelpers({ checkEligibility: findGomennasaiEligibility, onUseGomennasai: useGomennasaiOnFinalLock });
// ローカルCPU戦のCPU席が最後のロック承認者の時は、バナーを人間操作不可（待機表示）にする。
registerApproverAutoDrivenCheck((seat) => isCpuBattleActive() && !isOnlineMode() && isPseudoCpuTarget(seat));
registerTimerToggleHandlers({ onRequest: requestTimerToggleFor, onRespond: respondToTimerToggle });
registerContactApprovalHandler(respondToContact);
registerCounterLockHelpers({
  checkEligibility: findCounterLockToken,
  onUseCounterLock: useCounterLockOnContact,
  isPseudoCpuTarget,
  isSelfCpuSubstituted,
  cpuDecider: decideCpuUseCounterLock, // #59-①: CPUが接触された時にカウンターロックを使うか
});
registerEternalAnimHelpers(playEternalAcquisitionAnim);
registerGateInvasionStealHelper(stealHandCardsRitualForGateInvasion);
// CPU戦・スモークテスト（疑似CPU自己対戦）で、ゲート侵攻ボーナスの各ステップ告知モーダル
// （OKクリック待ち）を攻撃側がCPUなら自動で進める（ユーザー報告2026-08-17「ゲート侵攻処理を
// CPUは自動で進めれない」。isCpuSelectingNow=CPU戦中かつその席が疑似CPU対象）。
registerGateInvasionCpuChecker((seat) => isCpuSelectingNow(seat));
// 黒の契約の烙印の★(a)「ロックしないなら1枚ドローしてよい」（ユーザー要望2026-08-09）。
registerContractBrandHandler(offerContractBrandDrawIfNoLock);
registerMyDeckDrawAnnouncer(announceMyDeckDraw);
// ユーザー要望2026-08-08: ゲート侵攻で自ゲートのカードを回収した時、何を得たかを回収した本人の
// 画面だけに中央で大きく見せる（1枚ずつ、閉じる/タイムアップで次へ）。
registerReturnHomeRevealHelper(async (attacker, cards) => {
  if (attacker !== getSelfSeat()) return; // 回収した本人（自分）だけに見せる
  for (const c of cards) {
    await showCardReceivedModal(c.cardId, "自分のゲートから回収しました", { labelText: "回収した" });
  }
});
// オンラインのゲート侵攻（サーバー処理→受信モーダル経路）でも、ローカルと同じエターナル獲得の
// 派手な演出（3Dフリップ＋色バースト）を出す（ユーザー要望）。純演出関数のため両経路で共用できる。
registerGateInvasionModalEternalAnim(playEternalAcquisitionAnim);
// オンラインのゲート侵攻で「手札を奪う」儀式的な演出（ユーザー要望「奪う手札を選択する
// 儀式的な演出は必要／戻してください」#126）。以前はターン終了時の事前ピックに分けていたが、
// 順序が不自然（告知が二重・非手番プレイヤーの侵攻では出ない）だったため撤去し、この受信
// キュー側の1本に戻した。playGateInvasionStealRitualは視点ごとに動く：攻撃側本人は裏向きの
// 相手手札を儀式的にめくって奪う（奪う札はサーバーが無作為に決定済み＝ルール通り、演出は
// それを“めくって公開する”）、奪われる側はbroadcastでライブ実況（表向き＋ホバー）を見る、
// 観戦者は飛翔演出。演出無効設定・素材不足時は飛翔だけにフォールバックする。
registerGateInvasionModalStealAnim(playGateInvasionStealRitual);
// ユーザー報告「エターナル演出の前にエターナルがロックされて見えてしまい、演出直前に急に消える」。
// ゲート侵攻のステップをキューに積んだ時点で、獲得予定エターナル1枚の描画を先に抑制しておく
// （数秒後の演出が回ってくるまでロックエリアに見えてしまうのを防ぐ）。演出（着地）で復帰する。
registerGateInvasionModalEternalPreHide((attacker, cardId) => {
  const def = getCardDefinition(cardId);
  suppressedEternalLockRender = { side: SEAT_TO_SIDE[attacker], index: COLORS.indexOf(def.color), cardId };
  render();
});
// 保険: 演出が無効・素材不足でplayEternalAcquisitionAnimが走らずに抑制が解除されない事故を防ぐ。
// ゲート侵攻演出のキューが空（スキップ・閉じるも含む）になったら、残っている抑制を必ず解除する。
registerOnGateInvasionQueueDrained(() => {
  if (suppressedEternalLockRender) {
    suppressedEternalLockRender = null;
    render();
  }
});
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

// ===== AFK時のCPU代行（ユーザー要望2026-08-08） =====================================
// タイマーが連続で規定回数タイムアップした自席を、疑似CPUで代行する。本人には「CPUに
// 切替中です。復帰しますか？」バナーを出し、押せば操作権が戻る。相手席の代行状態は
// broadcastで受け取り、名前に「🤖CPU操作中」を添える（buildPlayerZone）。afkCpuStatusBySeat/
// afkCpuBannerEl/isAfkCpuSubstitutedSeat はファイル前半（buildPlayerZone付近）で宣言済み。
function buildAfkCpuBanner() {
  afkCpuBannerEl = document.createElement("div");
  afkCpuBannerEl.id = "afk-cpu-banner";
  document.body.appendChild(afkCpuBannerEl);
}
function updateAfkCpuBanner() {
  if (!afkCpuBannerEl) return;
  if (!isSelfCpuSubstituted()) {
    afkCpuBannerEl.classList.remove("is-visible");
    afkCpuBannerEl.innerHTML = "";
    return;
  }
  if (afkCpuBannerEl.classList.contains("is-visible")) return; // 既に表示中なら作り直さない
  afkCpuBannerEl.classList.add("is-visible");
  afkCpuBannerEl.innerHTML = "";
  const text = document.createElement("div");
  text.className = "afk-cpu-banner-text";
  text.textContent = "🤖 CPUに切替中です（放置のため自動操作中）。";
  afkCpuBannerEl.appendChild(text);
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "afk-cpu-banner-btn";
  btn.textContent = "復帰する";
  btn.addEventListener("click", exitAfkCpuSubstitution);
  afkCpuBannerEl.appendChild(btn);
}
function enterAfkCpuSubstitution() {
  if (isSelfCpuSubstituted()) return;
  setSelfCpuSubstituted(true);
  if (isOnlineMode()) broadcastAfkCpuStatus({ seat: getSelfSeat(), substituted: true });
  updateAfkCpuBanner();
  render();
}
function exitAfkCpuSubstitution() {
  if (!isSelfCpuSubstituted()) return;
  setSelfCpuSubstituted(false); // カウンタも0に戻る（setterの仕様）
  if (isOnlineMode()) broadcastAfkCpuStatus({ seat: getSelfSeat(), substituted: false });
  updateAfkCpuBanner();
  // 自分の手番中なら、疑似CPUの短い持ち時間ではなく通常の基本時間からやり直せるよう優先権を仕切り直す。
  const st = getState();
  if (st.priorityPlayer === getSelfSeat()) transferPriorityTo(getSelfSeat());
  render();
}
// #127（ユーザー要望2026-08-16）「ランク戦ではCPU切替ではなく敗北にしましょう」。
// ランク対局でAFK（連続タイムアップしきい値到達）した場合は、CPU代替に切り替えず、その席を
// 放置敗北（相手の勝ち）にする。放置した本人・相手の両方がこの finishRankedForfeit を呼ぶ
// （本人＝しきい値到達で、相手＝ranked_forfeit broadcast受信で）。reportRankedResultは
// ranked_result_applied で冪等なので二重反映にはならない。1クライアント内でも一度だけ実行する。
let rankedForfeitHandled = false;
// 放置敗北のときのレート反映用の順位表を作る。#188で reportRankedResult は
// (gameId, placements) に変わっているのに、finishRankedForfeit は旧シグネチャの winnerSeat
// （文字列）を渡したままだった＝placements として不正（Object.keys.length<2 で reportRankedResult
// が no-op）で、放置敗北のレートが一切反映されていなかった（2026-08-18に発見・修正）。
// 放置した席を最下位、残りを現在のロック色数で競技順位づけした placements を組み立てる
// （2人戦なら {相手:1, 放置者:2}）。
function buildForfeitPlacements(loserSeat) {
  const active = getState().activePlayers || [];
  const placements = {};
  const others = active.filter((p) => p !== loserSeat);
  for (const seat of others) {
    const myCount = getLockedCount(seat);
    const strictlyAhead = others.filter((o) => getLockedCount(o) > myCount).length;
    placements[seat] = 1 + strictlyAhead; // 残り同士の競技順位（1位〜）
  }
  placements[loserSeat] = active.length; // 放置者は最下位
  return placements;
}
// #144: ランク放置敗北などで対局を突然畳んでホームへ戻る際、その瞬間に表示中だった
// 盤面上の一時的なUI（到達拡大モーダル・手札効果使用モーダル・「〜を選択してください」の
// 候補ヒント・各種確認/儀式/選択肢モーダルとそのbackdrop・ゲート侵攻モーダル列）が
// 残り続けてホーム画面に被さる不具合の後始末。対局を離れる前提なので、既知の一時
// オーバーレイを一括で消してよい（選択待ちのactiveEffectPickerもnullにし、ハイライト・
// ヒントも消す。resolveは呼ばない＝対局を離れるので効果チェーンの続きは不要）。
function dismissAllInGameTransientUi() {
  try {
    activeEffectPicker = null;
    clearEffectUiHighlights();
    hideEffectPickerHint();
  } catch (e) { /* best-effort */ }
  try { hideCardArrivalModalImmediately(); } catch (e) {}
  try { hideHandEffectUseModalImmediately(); } catch (e) {}
  try { hideContactApprovalModalImmediately(); } catch (e) {}
  try { forceCloseGateInvasionModal(); } catch (e) {}
  // 効果フローの一時モーダル（選択肢・色宣言・儀式ピック・確認・接触結果・割り込み等）を
  // id/classでまとめて撤去する。z-indexが盤面より高くホーム画面(1500)に被さるため。
  const modalSelectors = [
    "#sleight-ritual-modal", "#gate-invasion-prepick-announce",
    ".hand-effect-option-picker", ".declare-colors-modal",
    "#generic-confirm-modal", "#touch-action-confirm-modal",
    "#contact-confirm-modal", "#contact-result-modal",
    "#anytime-interrupt-modal", ".card-open-prompt", ".contact-prompt",
    ".effect-reason-modal", ".card-received-modal", ".card-arrival-modal",
    ".hand-effect-use-modal",
  ];
  for (const sel of modalSelectors) {
    for (const el of document.querySelectorAll(sel)) {
      try { el.remove(); } catch (e) {}
    }
  }
  // 上記モーダルが使っていた透明/暗転backdrop（createBackdrop製＝子要素のない全画面fixed div）は
  // モーダル本体を消しても孤児として残るので、body直下の「中身が空の高z-indexな全画面div」を
  // 掃除する。ホーム画面や常設パネルは子要素を持つので誤って消さない。
  for (const el of document.querySelectorAll("body > div")) {
    try {
      if (el.children.length > 0) continue;
      const s = el.style;
      if (s.position !== "fixed") continue;
      const z = parseInt(s.zIndex, 10);
      if (!(z >= 10000)) continue;
      el.remove();
    } catch (e) {}
  }
}

async function finishRankedForfeit(loserSeat) {
  if (rankedForfeitHandled) return;
  rankedForfeitHandled = true;
  const gameId = getCurrentGameId();
  markRankedResultShown(gameId); // 復帰時検知が二重に出さないようマーク
  dismissAllInGameTransientUi(); // #144: 残留した到達モーダル・候補ヒント等を先に消す
  const active = getState().activePlayers || [];
  const winnerSeat = active.find((p) => p !== loserSeat) || null;
  const iWon = getSelfSeat() !== loserSeat;
  try {
    const placements = buildForfeitPlacements(loserSeat);
    if (gameId && Object.keys(placements).length >= 2) await reportRankedResult(gameId, placements);
  } catch (e) {
    console.error("reportRankedResult (forfeit) failed", e);
  }
  try {
    const { showRankedResultModal } = await import("./ranked-result-modal.js");
    const myRank = await getSelfRank();
    const note = iWon ? "相手が放置により敗北したため、あなたの勝ちです。" : "放置（時間切れが続いた）ため、あなたの敗北です。";
    await showRankedResultModal({
      won: iWon,
      rank: myRank ? myRank.rank : 0,
      gauge: myRank ? myRank.gauge : 0,
      legendPoints: myRank ? myRank.legend_points : 0,
      note,
    });
  } catch (e) {
    console.error("forfeit result modal failed", e);
  }
  try {
    await leaveGame();
  } catch (e) {
    console.error("leaveGame (forfeit) failed", e);
  }
  try {
    const home = await import("./home-screen.js");
    home.openHomeScreen?.();
  } catch (e) {
    console.error("openHomeScreen (forfeit) failed", e);
  }
}
// AFKしきい値到達時のハンドラ。ランク対局なら放置敗北、それ以外は従来通りCPU代替。
function onAfkThresholdReached() {
  if (isOnlineMode() && isRankedGame()) {
    const loserSeat = getSelfSeat();
    broadcastRankedForfeit({ loserSeat }); // 相手へ「放置敗北した」合図
    finishRankedForfeit(loserSeat);
    return;
  }
  enterAfkCpuSubstitution();
}
// 相手がランク対局で放置敗北した合図を受けたら、こちら（勝者）も結果反映＆表示してホームへ。
onRankedForfeitEvents(({ loserSeat }) => finishRankedForfeit(loserSeat));
// #138: 相手主導の放置敗北。起きている側（相手）のturn-timerが、手番プレイヤーの完全な放置を
// 検知して発火する。勝ちを確定＝相手（放置した本人）を敗者として reportRankedResult を呼ぶ
// （この申告が両者のランクをサーバー側で確定＝放置した本人が復帰しようがしまいがランクは下がる）。
// 放置した本人へも合図を送る（凍結中は届かないが、復帰時は下の reconnect 検知で敗北を表示する）。
window.addEventListener("ranked-opponent-afk", (e) => {
  const loserSeat = e.detail?.loserSeat;
  if (!loserSeat) return;
  if (!isOnlineMode() || !isRankedGame()) return;
  if (getSelfSeat() === loserSeat) return; // 自分が対象＝発火側ではない（保険）
  broadcastRankedForfeit({ loserSeat }); // 放置した本人・観戦者へ
  finishRankedForfeit(loserSeat);
});
// #138: 復帰時の敗北表示。放置敗北した本人（凍結中に相手が勝ちを申告＝ランクは既に確定済み）が
// 復帰すると、結果反映済み(ranked_result_applied)のランク対局に、結果モーダルを一度も見ずに入る。
// これを検知して勝敗（＝敗北）を表示し、ホームへ戻す。通常勝利（victory.js）・放置敗北の申告側
// （finishRankedForfeit）は markRankedResultShown で既に表示済みにするため、ここでは二重に出さない。
let lastRankedResultGameId = null;
subscribe(() => {
  if (!isOnlineMode()) return;
  const gameId = getCurrentGameId();
  if (gameId !== lastRankedResultGameId) {
    lastRankedResultGameId = gameId;
    rankedForfeitHandled = false; // 新しい対局＝放置敗北ガードを仕切り直す（連戦でも効くように）
  }
  if (!gameId || !isRankedGame()) return;
  const info = getRankedResultInfo();
  if (!info.applied || isRankedResultShown(gameId)) return;
  markRankedResultShown(gameId);
  void handleRankedReconnectResult(info.winnerSeat);
});
async function handleRankedReconnectResult(winnerSeat) {
  const iWon = !!winnerSeat && getSelfSeat() === winnerSeat;
  dismissAllInGameTransientUi(); // #144: 残留した到達モーダル・候補ヒント等を先に消す
  try {
    const { showRankedResultModal } = await import("./ranked-result-modal.js");
    const myRank = await getSelfRank();
    const note = iWon
      ? "この対局は既に終了しています（あなたの勝ち）。"
      : "放置（時間切れが続いた）ため、あなたの敗北で確定しています。";
    await showRankedResultModal({
      won: iWon,
      rank: myRank ? myRank.rank : 0,
      gauge: myRank ? myRank.gauge : 0,
      legendPoints: myRank ? myRank.legend_points : 0,
      note,
    });
  } catch (e) {
    console.error("reconnect ranked result modal failed", e);
  }
  try {
    await leaveGame();
  } catch (e) {
    console.error("leaveGame (reconnect result) failed", e);
  }
  try {
    const home = await import("./home-screen.js");
    home.openHomeScreen?.();
  } catch (e) {
    console.error("openHomeScreen (reconnect result) failed", e);
  }
}
// #139: オンラインのマイデッキ戦で、自席のペット・駒スキン・カード裏面が「自分の画面」では
// デッキで設定したものにならずグローバル設定になってしまう不具合の対応。相手の画面は同期
// ロスター（サーバーがselected_deckから書いた自席のpiece_skin_index等）を読むため正しいが、
// 自分の画面では getSkinImagePath/getPetOptionForSeat が自席についてローカルのグローバル好みを
// 最優先するため食い違う。CPU戦と同じ per-seat オーバーライド(setSeatLoadout)を、同期ロスターの
// 値で自席にだけ適用して直す（getSeatLoadout は最優先なのでグローバル好みより勝つ）。マイデッキ戦を
// 抜けたら適用した自席のオーバーライドだけを消す（他席・ローカルCPU戦のloadoutは触らない）。
let myDeckLoadoutSeat = null;
let myDeckLoadoutKey = null;
subscribe(() => {
  const seat = getSelfSeat();
  const inMyDeckOnline = isOnlineMode() && getState().myDeckMode && !!seat;
  if (inMyDeckOnline) {
    const ident = getSyncedIdentity(seat);
    if (
      ident &&
      (typeof ident.pieceSkinIndex === "number" ||
        typeof ident.petIndex === "number" ||
        typeof ident.cardBackSetIndex === "number")
    ) {
      const key = `${seat}:${ident.pieceSkinIndex}:${ident.petIndex}:${ident.cardBackSetIndex}`;
      if (key !== myDeckLoadoutKey) {
        myDeckLoadoutKey = key;
        myDeckLoadoutSeat = seat;
        setSeatLoadout(seat, {
          pieceSkinIndex: ident.pieceSkinIndex ?? 0,
          petIndex: ident.petIndex,
          cardBackSetIndex: ident.cardBackSetIndex,
        });
        render();
      }
    }
  } else if (myDeckLoadoutSeat) {
    // オンラインのマイデッキ戦を抜けた → 適用した自席のオーバーライドだけを空にして元へ戻す
    // （clearSeatLoadouts()は全席を消すのでCPU戦のloadoutを壊す。適用した席だけ空にする）。
    setSeatLoadout(myDeckLoadoutSeat, {});
    myDeckLoadoutSeat = null;
    myDeckLoadoutKey = null;
    render();
  }
});

buildAfkCpuBanner();
// 開発用のみ: エイドス会話パネルのプレビューをコンソールから呼べるようにする（本番のボタン・
// フローからは一切呼ばない。決定稿投入前の表示確認用）。
if (typeof window !== "undefined") {
  window.__eidosDialogueDemo = runEidosDialogueDemo;
  window.__eidosPlayScene = playEidosScene;
}
// しきい値到達（turn-timer.jsが連続タイムアップを数えて発火）→ ランクなら放置敗北、それ以外はCPU代行。
window.addEventListener("afk-cpu-threshold-reached", onAfkThresholdReached);
// 手動操作（在席の証拠）があれば連続タイムアップのカウンタをリセット。ただし既に代行中の間は
// 解除しない（誤って触れただけで戻さない。復帰は明示ボタンのみ）。captureで拾い、バナーの
// 「復帰する」ボタン自身のクリックも通常どおり動く（resetは代行中は何もしないため干渉しない）。
["pointerdown", "keydown"].forEach((ev) =>
  window.addEventListener(ev, () => {
    if (!isSelfCpuSubstituted()) resetTimeoutStreak();
  }, true)
);
// 相手席の代行状態を受信 → 表示に反映。
onAfkCpuStatusEvents(({ seat, substituted }) => {
  if (!seat || seat === getSelfSeat()) return;
  afkCpuStatusBySeat[seat] = !!substituted;
  render();
});

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
    // マイデッキ戦: 選択オーバーレイが残っていれば閉じる（BOOTSTRAPで盤面が始まったため）。
    if (isDeckSelectOpen()) closeDeckSelect();
    suppressGenericRenderForOnlineStart = true;
    // セットアップ演出〜スタートプレイヤー告知が閉じるまでは「セットアップ中」扱いにして、
    // フェイズ自動処理（＝ムーブフェイズの移動可能マスのハイライト）とターンタイマーを
    // 止めておく（ユーザー要望2026-08-11。ローカルのgame-setup.js runStep3と同じgate。
    // オンライン経路ではこれをセットしておらず、セットアップ完了前にハイライト・タイマーが
    // 走ってしまっていた）。告知onCloseでfalseに戻し、そこで初めて自動処理を開始する。
    setSetupRevealActive(true);
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
        // スタートプレイヤー告知が閉じた（自動8秒 or クリック）直後に、セットアップ完了として
        // フェイズ自動処理を解禁（setSetupRevealActive(false)がreconcilePhaseAutomation()を
        // 呼ぶ＝ここで初めて盤面ハイライト・タイマーが始まる）＋不具合報告の案内を一度だけ出す
        // （ユーザー要望2026-08-11「告知が閉じてからハイライト／タイマー開始」）。モーダルが
        // 重ならないよう告知のonCloseに繋ぐ。
        const onSetupRevealDone = () => {
          setSetupRevealActive(false); // 内部で reconcilePhaseAutomation() を呼ぶ
          maybeShowBugReportIntro();
          // 操作説明モーダル（game-intros.js）を1つ出す。ただし不具合報告の案内がまだ出る
          // ゲーム（未非表示）では重なるので、それが消えてから（既に非表示設定なら）出す。
          if (isBugReportIntroHidden()) void maybeShowGameStartIntros();
        };
        if (starter) showStartPlayerModal(starter, { onClose: onSetupRevealDone });
        else onSetupRevealDone();
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
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle || suppressGenericRenderForDrawFlight) return;
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
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle || suppressGenericRenderForDrawFlight) return;
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
  if (suppressGenericRenderForOnlineStart || suppressGenericRenderForContactTackle || suppressGenericRenderForDrawFlight) return;
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
// 言語切替（options-menuの言語セレクタ）でカード面のテキストを差し替えるため、盤面を再描画する。
onLangChange(() => render());
// 右下の常設アクションボタン（ターン終了/ドロー/公開ドロー/手札シャッフル/盤面拡大）の
// キャプション・ツールチップも現在の言語へ（要素はplayer-buttons.jsがid管理するので作り直さない）。
onLangChange(refreshActionButtonLabels);
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
  if (isLoggedIn) {
    // ローカルのペット選択をプロフィールへ書き戻す（対局開始時の座席作成でコピーされ、
    // 初回から相手にも反映される。ユーザー報告「開始時に相手のペットが反映されない」対応）。
    pushMyPetToProfile();
  }
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
    // シーズン終了報酬（docs/ranked-spec.md）。新シーズンに初めてログインした時、前シーズンの
    // 到達ランクに応じた通貨が既に付与されている（サーバー側のシーズン切替）。getSelfRankが
    // 返す pending_reward_* があればモーダルで1回だけ見せて、claimでクリアする。
    maybeShowSeasonReward();
  }
  wasLoggedInForDailyBonus = isLoggedIn;
});

async function maybeShowSeasonReward() {
  try {
    const rank = await getSelfRank();
    if (!rank || !rank.pending_reward_season) return;
    await showSeasonRewardModal({
      season: rank.pending_reward_season,
      rank: rank.pending_reward_rank ?? 0,
      amount: rank.pending_reward_amount ?? 0,
    });
    await claimSeasonReward();
    refreshCurrencyDisplay(); // 付与済み残高を反映
    refreshSelfStatusRankRing?.(); // 2ランク下・ゲージ0にリセットされた新シーズンのランクを反映
  } catch (err) {
    console.error("maybeShowSeasonReward failed", err);
  }
}

function showDailyBonusToast(amount) {
  // ユーザー要望「ログインでお金がもらえる時はモーダルで」。1日1回のログインボーナスを
  // 中央モーダルで知らせる（背景/×クリックで閉じる）。
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10060 });
  const modal = document.createElement("div");
  modal.id = "daily-bonus-modal";
  const title = document.createElement("div");
  title.className = "daily-bonus-modal-title";
  title.textContent = "🎁 ログインボーナス";
  const amountEl = document.createElement("div");
  amountEl.className = "daily-bonus-modal-amount";
  amountEl.textContent = `🪙 +${amount}`;
  const note = document.createElement("div");
  note.className = "daily-bonus-modal-note";
  note.textContent = "今日もあそんでくれてありがとう！（ログインボーナスは1日1回）";
  const okBtn = document.createElement("button");
  okBtn.className = "daily-bonus-modal-ok";
  okBtn.textContent = "受け取る";
  okBtn.addEventListener("click", close);
  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(amountEl);
  modal.appendChild(note);
  modal.appendChild(okBtn);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
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
  // 到達効果の解決中・選択ピッカー表示中・手札効果処理中等に届いたゲート侵攻は、その処理が
  // 終わるまで待ってから再生する（#135「パーティ効果処理中にゲート侵攻ボーナスが発動」対応。
  // isBusyForGateInvasionDeferral参照。flushはrender()末尾で毎回・処理が空いたタイミングで行う）。
  if (isBusyForGateInvasionDeferral()) {
    logAction("diag-gate-invasion-deferred", { count: events?.length ?? 0, depth: arrivalEffectProcessingDepth, picker: activeEffectPicker?.type ?? null, handEffectBusy: isHandEffectBusy() });
    pendingGateInvasionEvents.push(events);
    return;
  }
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

// マイデッキ戦フェーズ5（裏面の印）: トークンの裏面画像を返す。マイデッキ由来の札
// （token.myDeckOwner が付いている）は、所有者が設定した裏面セットで全員に見せる
// （roster=getSyncedIdentity に載っている各席の cardBackSetIndex を使う）。所有者の
// 裏面が不明（未同期・SQL未適用等）なら通常どおり自分の裏面設定にフォールバックする。
// getCardBackImagePath(token.cardId) を使っていた各描画箇所をこれに置き換えてある。
//
// ユーザー要望2026-08-11: 所有者が裏面を特に設定していない（標準=0/未設定）場合は、
// 所有者のファーストカードの色に合わせた色テーマ裏面（追加赤〜追加紫、index 2〜8）を
// 自動適用する（そのスキンを所持していなくても＝描画は所持と無関係）。プレイヤー同士で
// 裏面が被っても、駒の色で見分けやすくするため。
// noir=9（黒の裏面セット）。本気エイドス(C)は駒色が"noir"なので、マイデッキ札を黒裏面で見せる
// （ローカルではgetSyncedIdentityにcardBackSetIndexが無いため、駒色ベースのこの対応表で解決する）。
const MYDECK_COLOR_BACK_INDEX = { red: 2, orange: 3, yellow: 4, green: 5, blue: 6, pink: 7, purple: 8, noir: 9 };
function myDeckOwnerPieceColor(seat) {
  return getState().tokens.find((t) => t.kind === "piece" && t.player === seat)?.color ?? null;
}
function cardBackImageForToken(token) {
  if (token && token.myDeckOwner) {
    // 本気エイドス戦（マイデッキ）: 選んだデッキの裏面セットを座席ごとに一時上書き（グローバル
    // 設定を汚さない）。同期ロスター／色テーマより優先。
    const loadout = getSeatLoadout(token.myDeckOwner);
    let idx = loadout && typeof loadout.cardBackSetIndex === "number" ? loadout.cardBackSetIndex : getSyncedIdentity(token.myDeckOwner)?.cardBackSetIndex;
    if (!idx) {
      // 未設定/標準 → ファーストカード（＝駒）の色テーマ裏面を自動適用。
      const color = myDeckOwnerPieceColor(token.myDeckOwner);
      const colorIdx = color ? MYDECK_COLOR_BACK_INDEX[color] : undefined;
      if (typeof colorIdx === "number") idx = colorIdx;
    }
    if (typeof idx === "number") return getCardBackImagePath(token.cardId, idx);
  }
  return getCardBackImagePath(token ? token.cardId : null);
}

// マイデッキ戦フェーズ5: 場・手札のマイデッキ札をホバーすると、その札の所有者のアバターと
// 名前を出す（ユーザー要望2026-08-11。プレイヤー同士で裏面スキンが被った時の判別用）。
// カード要素は data-token-id を持つので、document への委譲リスナー1つで全カードを拾う
// （token.myDeckOwner を持つトークンだけ対象＝マイデッキ札のみ）。
let myDeckOwnerTooltipEl = null;
function ensureMyDeckOwnerTooltip() {
  if (myDeckOwnerTooltipEl) return myDeckOwnerTooltipEl;
  const el = document.createElement("div");
  el.id = "my-deck-owner-tooltip";
  const av = document.createElement("div");
  av.className = "my-deck-owner-tooltip-avatar";
  const nm = document.createElement("div");
  nm.className = "my-deck-owner-tooltip-name";
  const label = document.createElement("div");
  label.className = "my-deck-owner-tooltip-label";
  label.textContent = "マイデッキ";
  el.append(av, nm, label);
  el._avatarEl = av;
  el._nameEl = nm;
  document.body.appendChild(el);
  myDeckOwnerTooltipEl = el;
  return el;
}
function positionMyDeckOwnerTooltip(x, y) {
  const el = myDeckOwnerTooltipEl;
  if (!el) return;
  const pad = 14;
  const w = el.offsetWidth || 120;
  const h = el.offsetHeight || 64;
  let left = x + pad;
  let top = y - h - pad;
  if (left + w > window.innerWidth - 4) left = x - w - pad;
  if (top < 4) top = y + pad;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}
document.addEventListener("mouseover", (e) => {
  const cardEl = e.target?.closest?.("[data-token-id]");
  if (!cardEl) {
    myDeckOwnerTooltipEl?.classList.remove("is-visible");
    return;
  }
  const token = getState().tokens.find((t) => t.id === cardEl.dataset.tokenId);
  const owner = token?.myDeckOwner;
  if (!owner) {
    myDeckOwnerTooltipEl?.classList.remove("is-visible");
    return;
  }
  const el = ensureMyDeckOwnerTooltip();
  applyAvatarContent(el._avatarEl, getPlayerAvatar(owner));
  el._nameEl.textContent = getPlayerName(owner);
  positionMyDeckOwnerTooltip(e.clientX, e.clientY);
  el.classList.add("is-visible");
});
