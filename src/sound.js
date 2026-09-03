// 効果音の再生。実物の音声ファイル(音声/効果音/)は画像素材と同じ理由でgit管理外にし、
// assets/sounds/に英語名でコピーして使う（.gitignoreの/音声/・/assets/sounds/参照）。
// 音量は「マスター音量」（オプションメニューの基本設定、0〜1）と「効果音ごとの音量」
// （管理者モードの「効果音の音量（個別）」グループ、CSS変数として0〜100を保持）の
// 掛け算で最終的な再生音量を決める。

import { getState, subscribe } from "./state.js";
import { logAction } from "./action-log.js";

// ユーザー報告「iPhoneで基本設定のBGM音量を下げようとしたけど変化がありません」の
// 原因: iOS Safariは仕様として<audio>/<video>要素の.volumeプロパティのsetterを
// 無視する（ハードウェアの音量ボタン/サイレントスイッチだけを音量の決定権にするという
// Apple独自のポリシーで、古いiOSからずっとそう）。そのため.volumeを直接書き換える
// 今までの実装（applyLiveBgmVolume等）は、デスクトップ/Android等では効くがiOSだけ
// 無反応になる。唯一の回避策はWeb Audio API（AudioContext→GainNode）を経由すること
// ——GainNode.gain.valueはiOSでも実際の音量に反映される（Howler.js等の音声ライブラリが
// 同じ理由でこの方式を使っている）。BGM用の使い回しAudioインスタンスをGainNode経由の
// 出力に繋ぎ直し、以後は音量調整をGainNode側に一本化する（.volumeは常に1のままにして
// 二重に減衰しないようにする）。
let audioCtx = null;

// ---- スマホで別画面を開いている間は音を止める / iPhoneのマナーモードを尊重する ----
// ユーザー報告2026-08-17「スマホで別の画面を開いていてもBGMや効果音が鳴り続けています。
// 閉じてる間は鳴らない方が良いです。あとiPhoneのマナーモードを無視して音が鳴っている気も
// します」。2段構えで対処する：
//  (1) navigator.audioSession.type='ambient'（iOS 16.4+）。'ambient'カテゴリは
//      サイレント（マナー）スイッチで消音され、かつアプリがバックグラウンド/画面ロックに
//      なると自動で無音になる。iPhoneの2つの不満（マナーモード無視・裏でも鳴る）を両方直す。
//      Chrome等このAPIが無いブラウザでは何もしない（下の(2)で補う）。
//  (2) visibilitychange。ページが隠れたら再生中のBGMを一時停止し効果音も鳴らさない、
//      戻ったら隠れる直前に鳴っていたBGMだけ再開する（全プラットフォーム共通の保険）。
//      ※将来「通知音は閉じていても鳴らす」を足す時は、この効果音ゲートを通さない別経路にする。
let ambientSessionSet = false;
function ensureAmbientAudioSession() {
  if (ambientSessionSet) return;
  try {
    if (typeof navigator !== "undefined" && navigator.audioSession) {
      navigator.audioSession.type = "ambient";
      ambientSessionSet = true;
    }
  } catch (err) {
    /* 未対応環境は無視（visibilitychange側で対処する） */
  }
}

// ページが隠れた時に一時停止したBGMのAudio要素。戻った時にこれだけ再開する。
const bgmResumeOnVisible = new Set();
function allBgmAudios() {
  return [openingBgmAudio, gameBgmAudio, waitingBgmAudio, victoryBgmAudio];
}
// #221（ユーザー報告2026-09-03「スマホでゲーム画面を閉じる（収納する）とプンって音がなる」）:
// 鳴っている音を途中でいきなり止めると、波形が途切れて「プツッ／プン」というクリック音が出る
// （特にiOS）。止める直前にごく短く音量を絞ってから止めることで、この耳障りな音を防ぐ。
// 戻ってきた時のために元の音量は覚えておき、再開時に戻す。
const bgmVolumeBeforeFade = new WeakMap();
function fadeOutAndPause(a) {
  const startVolume = a.volume;
  bgmVolumeBeforeFade.set(a, startVolume);
  const steps = 6;
  const stepMs = 20;
  let i = 0;
  const tick = () => {
    i += 1;
    try {
      a.volume = Math.max(0, startVolume * (1 - i / steps));
      if (i >= steps) {
        a.pause();
        a.volume = startVolume; // 次に再生する時のために戻しておく
        return;
      }
    } catch (err) {
      try {
        a.pause();
      } catch (err2) {
        /* ignore */
      }
      return;
    }
    setTimeout(tick, stepMs);
  };
  setTimeout(tick, stepMs);
}

function handleVisibilityChange() {
  if (document.hidden) {
    // 隠れた瞬間、再生中のBGMを一時停止して覚えておく（効果音はplaySound側でゲートする）。
    for (const a of allBgmAudios()) {
      if (a && !a.paused) {
        bgmResumeOnVisible.add(a);
        try {
          fadeOutAndPause(a);
        } catch (err) {
          /* ignore */
        }
      }
    }
    // 効果音側（Web Audio）も、鳴っている途中で iOS にサスペンドされるとクリック音の元になる。
    // 明示的に suspend しておく（次に音を出す時 getAudioContext() が resume するので実害なし）。
    try {
      if (audioCtx && audioCtx.state === "running") audioCtx.suspend().catch(() => {});
    } catch (err) {
      /* ignore */
    }
  } else {
    // 戻ったら、隠れる直前に鳴っていたBGMだけ再開する。
    for (const a of bgmResumeOnVisible) {
      try {
        a.play().catch(() => {});
      } catch (err) {
        /* ignore */
      }
    }
    bgmResumeOnVisible.clear();
  }
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", handleVisibilityChange);
}

function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  ensureAmbientAudioSession();
  // iOSはユーザー操作直後でもcontextがsuspended状態のままのことがあるため、
  // 呼ぶたびにresumeを試みておく（既にrunning中なら何もしない、無害な呼び出し）。
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

// audioElごとに1度しか呼べない（同じ要素で2回createMediaElementSourceを呼ぶと
// 例外になる）ため、呼び出し側のBGM生成コード（if (!xBgmAudio) { ... }の中）で
// Audioインスタンスの生成と同時に1回だけ呼ぶこと。AudioContext自体が使えない
// 古い環境ではnullを返し、呼び出し側は.volumeへのフォールバックに切り替える。
function attachGainNode(audioEl) {
  const ctx = getAudioContext();
  if (!ctx) return null;
  try {
    const source = ctx.createMediaElementSource(audioEl);
    const gainNode = ctx.createGain();
    source.connect(gainNode);
    gainNode.connect(ctx.destination);
    return gainNode;
  } catch (err) {
    console.error("attachGainNode failed", err);
    return null;
  }
}

// GainNode経由・.volumeフォールバックのどちらでも同じ呼び方で音量を設定できるようにする
// ヘルパー。gainNodeが使える時はそちらを正とし（iOSで確実に効くのはこちらだけ）、
// audio.volumeは1のまま固定して二重減衰を防ぐ。gainNodeが無い（取得失敗）環境だけ、
// 従来通りaudio.volumeに反映する。
function setBgmTrackVolume(audioEl, gainNode, volume) {
  if (gainNode) {
    gainNode.gain.value = volume;
    audioEl.volume = 1;
  } else {
    audioEl.volume = volume;
  }
}

const SOUND_DEFS = {
  buttonPress: { path: "assets/sounds/button-press.mp3", cssVar: "--sound-volume-button-press" },
  handShuffle: { path: "assets/sounds/hand-shuffle.mp3", cssVar: "--sound-volume-hand-shuffle" },
  deckShuffle: { path: "assets/sounds/deck-shuffle.mp3", cssVar: "--sound-volume-deck-shuffle" },
  cardFlip: { path: "assets/sounds/card-flip.mp3", cssVar: "--sound-volume-card-flip" },
  cardPlace: { path: "assets/sounds/card-place.mp3", cssVar: "--sound-volume-card-place" },
  piecePlace: { path: "assets/sounds/piece-place.mp3", cssVar: "--sound-volume-piece-place" },
  cardDraw: { path: "assets/sounds/card-draw.mp3", cssVar: "--sound-volume-card-draw" },
  arrivalEffect: { path: "assets/sounds/arrival-effect.mp3", cssVar: "--sound-volume-arrival-effect" },
  lock: { path: "assets/sounds/lock.mp3", cssVar: "--sound-volume-lock" },
  turnSwitch: { path: "assets/sounds/turn-switch.mp3", cssVar: "--sound-volume-turn-switch" },
  // ユーザー要望「マスチェンジで入れ替わるときアニメで効果音を使用してください」
  // 「ジャンプ台で移動するときに次の効果音を使ってください」への対応。
  swap: { path: "assets/sounds/swap.wav", cssVar: "--sound-volume-swap" },
  jump: { path: "assets/sounds/jump.mp3", cssVar: "--sound-volume-jump" },
};

// オープニングBGM（ユーザー提供、音声/BGM/オープニング.mp3）。効果音(playSound)と違い
// ループ再生し続ける必要があるため、使い回す単一のAudioインスタンスを持つ。ブラウザの
// 自動再生制限により、ページ読み込み直後には再生できない（ユーザーの操作＝STARTボタン
// クリックが必要）ため、opening-screen.jsがそのクリックハンドラ内から呼ぶ設計にする。
let openingBgmAudio = null;
let openingBgmGain = null;

// 【BGMは常に1つだけ】ユーザー報告2026-09-03「マイページからホームに戻ったらタイトルのBGMが
// 鳴り始めて、CPU戦を開始してもそのBGMが鳴りやまなかった」への根本対策。以前は play*Bgm() が
// それぞれ自分のトラックを鳴らすだけで、**前のBGMを止めるのは呼び出し側の責任**だった。
// 画面遷移は数が多く（タイトル/ホーム/マイページ/ロビー/対局/勝利/対戦終了…）、どこか1か所で
// 止め忘れると重なって鳴り続ける。ここで「新しいBGMを鳴らす時は他を必ず止める」を1か所に
// まとめ、止め忘れという事故が構造的に起きないようにする。
// （呼び出し側に残っている stop*Bgm() は無害な二重呼び出しになるだけなので、そのままでよい）
function stopOtherBgms(keep) {
  if (keep !== "opening") stopOpeningBgm(250);
  if (keep !== "game") stopGameBgm(250);
  if (keep !== "waiting") stopWaitingBgm(250);
  if (keep !== "victory") stopVictoryBgm(250);
}
export function playOpeningBgm() {
  stopOtherBgms("opening");
  if (!openingBgmAudio) {
    openingBgmAudio = new Audio("assets/sounds/opening-bgm.mp3");
    openingBgmAudio.loop = true;
    openingBgmGain = attachGainNode(openingBgmAudio);
  }
  const volume = Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-opening-bgm")));
  setBgmTrackVolume(openingBgmAudio, openingBgmGain, volume);
  openingBgmAudio.currentTime = 0;
  openingBgmAudio.play().catch(() => {});
}

let bgmFadeIntervalId = null;

// ゲーム本編に入ったら（オープニング画面が閉じたら）止める。ユーザー要望「音楽もプチっと
// 終わるんじゃなくてフェードアウトしてほしい」への対応で、即座にpauseするのではなく
// durationMsかけて音量を0まで滑らかに下げてから止める（opening-screen.js側の
// オーバーレイのフェードアウト時間=CLOSE_TRANSITION_MSと合わせて呼ばれる想定）。
export function stopOpeningBgm(durationMs = 600) {
  if (!openingBgmAudio) return;
  if (bgmFadeIntervalId) clearInterval(bgmFadeIntervalId);
  const startVolume = openingBgmGain ? openingBgmGain.gain.value : openingBgmAudio.volume;
  const stepMs = 30;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;
  bgmFadeIntervalId = setInterval(() => {
    step++;
    const ratio = Math.max(0, 1 - step / steps);
    setBgmTrackVolume(openingBgmAudio, openingBgmGain, startVolume * ratio);
    if (step >= steps) {
      clearInterval(bgmFadeIntervalId);
      bgmFadeIntervalId = null;
      openingBgmAudio.pause();
      openingBgmAudio.currentTime = 0;
    }
  }, stepMs);
}

// ユーザー要望「ゲーム時のBGM追加しました。ゲーム開始時から流れるようにしたいです」
// への対応。オープニングBGMと同じ「使い回す単一のAudioインスタンス、ループ再生」
// 方式にする。
let gameBgmAudio = null;
let gameBgmGain = null;

export function playGameBgm() {
  stopOtherBgms("game");
  if (!gameBgmAudio) {
    gameBgmAudio = new Audio("assets/sounds/game-bgm.mp3");
    gameBgmAudio.loop = true;
    gameBgmGain = attachGainNode(gameBgmAudio);
  }
  const volume = Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-game-bgm")));
  setBgmTrackVolume(gameBgmAudio, gameBgmGain, volume);
  gameBgmAudio.currentTime = 0;
  gameBgmAudio.play().catch(() => {});
}

export function stopGameBgm(durationMs = 600) {
  if (!gameBgmAudio) return;
  if (gameBgmFadeIntervalId) clearInterval(gameBgmFadeIntervalId);
  const startVolume = gameBgmGain ? gameBgmGain.gain.value : gameBgmAudio.volume;
  const stepMs = 30;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;
  gameBgmFadeIntervalId = setInterval(() => {
    step++;
    const ratio = Math.max(0, 1 - step / steps);
    setBgmTrackVolume(gameBgmAudio, gameBgmGain, startVolume * ratio);
    if (step >= steps) {
      clearInterval(gameBgmFadeIntervalId);
      gameBgmFadeIntervalId = null;
      gameBgmAudio.pause();
      gameBgmAudio.currentTime = 0;
    }
  }, stepMs);
}
let gameBgmFadeIntervalId = null;

// ユーザー要望「プレイヤー待機中のBGMを追加しました」への対応。オンライン対戦の
// 部屋で他のプレイヤーを待っている間（online-ui.jsの「対戦相手を待っています」/
// 「ゲームを開始する」表示中）に流す。部屋パネルはonRosterChange等のたびに中身を
// 何度も再描画するため、既に再生中なら再スタートしない（currentTimeを巻き戻すと
// 再描画のたびに音が飛んでしまう）よう、他のBGMと違って明示的にガードする。
let waitingBgmAudio = null;
let waitingBgmGain = null;

export function playWaitingBgm() {
  stopOtherBgms("waiting");
  if (!waitingBgmAudio) {
    waitingBgmAudio = new Audio("assets/sounds/waiting-bgm.mp3");
    waitingBgmAudio.loop = true;
    waitingBgmGain = attachGainNode(waitingBgmAudio);
  }
  const volume = Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-waiting-bgm")));
  setBgmTrackVolume(waitingBgmAudio, waitingBgmGain, volume);
  if (waitingBgmAudio.paused) {
    waitingBgmAudio.currentTime = 0;
    waitingBgmAudio.play().catch(() => {});
  }
}

export function stopWaitingBgm(durationMs = 600) {
  if (!waitingBgmAudio || waitingBgmAudio.paused) return;
  if (waitingBgmFadeIntervalId) clearInterval(waitingBgmFadeIntervalId);
  const startVolume = waitingBgmGain ? waitingBgmGain.gain.value : waitingBgmAudio.volume;
  const stepMs = 30;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;
  waitingBgmFadeIntervalId = setInterval(() => {
    step++;
    const ratio = Math.max(0, 1 - step / steps);
    setBgmTrackVolume(waitingBgmAudio, waitingBgmGain, startVolume * ratio);
    if (step >= steps) {
      clearInterval(waitingBgmFadeIntervalId);
      waitingBgmFadeIntervalId = null;
      waitingBgmAudio.pause();
      waitingBgmAudio.currentTime = 0;
    }
  }, stepMs);
}
let waitingBgmFadeIntervalId = null;

// victory.js・tutorial.jsと同じ「turnPlayerがnull→非nullに変わった瞬間＝新しい対局が
// 実際に始まった」検知パターンを、このモジュール自身で完結させる（main.js側の配線を
// 増やさずに済む）。セットアップウィザードの各ステップを経てここまで来る時点で、
// 既にユーザー操作（ボタンクリック）を経ているため、ブラウザの自動再生制限には
// 引っかからない。対局が実際に始まったら、待機中BGMが鳴りっぱなしにならないよう
// あわせて止める。
let wasGameStartedForBgm = false;
// 盤面から離れている（ホーム画面・オープニング画面が開いている）かどうか。DOMだけを見るので
// 他モジュールへの依存が増えない（sound.jsは葉モジュールに近い状態を保ちたい）。
function isAwayFromBoard() {
  if (typeof document === "undefined") return false;
  return Boolean(document.getElementById("home-screen") || document.getElementById("opening-screen"));
}

export function initGameBgmAutoStart() {
  subscribe(() => {
    const started = Boolean(getState().turnPlayer);
    if (started && !wasGameStartedForBgm) {
      stopWaitingBgm();
      // 勝利BGMも止める。「もう一度戦う」（CPU戦）やオンラインの再戦で新しい対局が始まった時、
      // 勝利ファンファーレが鳴りっぱなしのままゲームBGMと重なる不具合への対応（ユーザー報告
      // 2026-08-13、CPU戦で勝利BGM中に再戦すると消えなかった）。
      stopVictoryBgm();
      playGameBgm();
    }
    wasGameStartedForBgm = started;
  });
  // ユーザー報告「ゲームBGMが鳴っていない気がする」。上のplayGameBgm()は状態購読
  // （＝サーバー同期などユーザー操作の“外”）から呼ばれるため、モバイルの自動再生制限で
  // <audio>.play()がブロックされ、無音のまま .catch で握りつぶされることがある。
  // 保険として、ユーザー操作のたびに「対局中なのに game BGM が止まっている」場合は
  // 取り直す（操作起点なら再生が通る）。既に鳴っていれば何もしない（gameBgmAudio.pausedで判定）。
  if (typeof window !== "undefined") {
    const retryOnGesture = () => {
      // ユーザー報告2026-09-02「対戦後、ホーム画面に戻っても盤面の時のBGMのまま」。
      // 対局が終わってホームへ戻っても state.turnPlayer は残ったままなので、この保険が
      // **ホーム画面のクリックのたびにゲームBGMを鳴らし直していた**（ホームへ戻る時に
      // 止めても、次のクリックで戻ってしまう）。盤面を離れている間は取り直さない。
      if (isAwayFromBoard()) return;
      if (Boolean(getState().turnPlayer) && gameBgmAudio && gameBgmAudio.paused) playGameBgm();
    };
    window.addEventListener("pointerdown", retryOnGesture, { passive: true });
    window.addEventListener("keydown", retryOnGesture, { passive: true });
  }
}

// マスター音量（0〜1）。オプションメニューの「基本設定」から調整できる（効果音のみ、
// BGMはmasterBgmVolume参照）。ユーザー要望「BGMと効果音の初期音量を50%にしてほしい」
// への対応でデフォルトを0.5にした（効果音は毎回new Audio()で鳴らす時に参照するため、
// この値を変えるだけで次に鳴る音から反映される）。ユーザー要望（2026-07-30）でデフォルトを
// 0.3（30%）に変更（保存済み設定がある人はそちらが優先されるため、新規/未設定ユーザー向け）。
let masterVolume = 0.3;

export function getSoundVolume() {
  return masterVolume;
}

export function setSoundVolume(next) {
  masterVolume = Math.min(1, Math.max(0, next));
}

// ユーザー要望「『オープニングBGMの音量』ではなくて『BGM』でよい。BGM全体の音量を
// 調整できるように」への対応。効果音のmasterVolumeとは独立した、BGM専用のマスター
// 音量（0〜1）。オープニング/ゲーム中/勝利時/待機中の全BGMがこれで一括調整できる
// （各playXBgm()参照）。管理者モードの「効果音の音量（個別）」にある4つの個別BGM
// スライダー（--sound-volume-*-bgm）は、このマスター値に対する相対的な微調整として
// そのまま残す（効果音の個別スライダーと同じ「マスター×個別」の二段構え）。
// デフォルトはユーザー要望（2026-07-30）により0.3（初期音量30%）。保存済み設定がある人は
// そちらが優先される（新規/未設定ユーザー向けの初期値）。
let masterBgmVolume = 0.3;

export function getBgmVolume() {
  return masterBgmVolume;
}

// ユーザー報告「基本設定でBGM音量を操作してもBGMに変化がありません」の原因: BGMは
// オープニング/ゲーム中/待機中それぞれ使い回しの単一Audioインスタンス（openingBgmAudio
// 等）を持ち、.volumeは各playXBgm()を"呼んだ瞬間"にしか設定していなかった。効果音
// （playSound、毎回new Audio()を使い捨てる方式）と違い、既に再生中のBGMはスライダーを
// 動かしても音量がそのまま変わらなかった。setBgmVolume自体で、今まさに再生中の
// 全BGMインスタンスの.volumeをその場で更新するようにして解決する。
export function setBgmVolume(next) {
  masterBgmVolume = Math.min(1, Math.max(0, next));
  applyLiveBgmVolume();
}

// 現在再生中（生成済み）の各BGM Audioインスタンスへ、最新のmasterBgmVolume×個別音量を
// 即座に反映する。フェードアウト中（bgmFadeIntervalId等が動いている間）は、フェードの
// 方が.volumeを継続的に上書きするため、ここでの変更はフェードに飲まれるが実害は無い
// （フェード終了＝停止するだけなので、フェード中に音量を変えたいという要求自体が
// 稀なケース）。
function applyLiveBgmVolume() {
  if (openingBgmAudio && !openingBgmAudio.paused) {
    setBgmTrackVolume(openingBgmAudio, openingBgmGain, Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-opening-bgm"))));
  }
  if (gameBgmAudio && !gameBgmAudio.paused) {
    setBgmTrackVolume(gameBgmAudio, gameBgmGain, Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-game-bgm"))));
  }
  if (waitingBgmAudio && !waitingBgmAudio.paused) {
    setBgmTrackVolume(waitingBgmAudio, waitingBgmGain, Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-waiting-bgm"))));
  }
}

function getPerSoundVolume(cssVar) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim();
  const pct = parseFloat(raw);
  return (Number.isNaN(pct) ? 80 : pct) / 100;
}

// ユーザー要望「『勝利時.mp3』をBGMフォルダへ移しました。音量調整などではBGMとして
// 扱ってください」への対応。以前はSOUND_DEFS（効果音、鳴らすたびnew Audio()を使い
// 捨てにする方式）の一員だったが、オープニングBGMと同じ「-bgm」接尾辞のファイル名
// 規約に合わせてassets/sounds/victory-bgm.mp3へ配置してもらう前提にし、専用の
// CSS変数（--sound-volume-victory-bgm）で音量を管理する。ループはしない（勝利の瞬間に
// 1回だけ再生するBGM）ため、オープニングBGMのような使い回しAudioインスタンスは不要で、
// 効果音と同じ「毎回new Audio()」のままでよい。
// 使い回す単一インスタンスにして、管理者モードの試聴（トグル）で止められるようにする
// （ユーザー要望2026-08-08「試聴開始したら停止ボタンに変わるように」）。実際の勝利時は
// loop=falseの一回きり、試聴時はloop=trueで止めるまでループする。
let victoryBgmAudio = null;
let victoryBgmGain = null;
let victoryBgmFadeIntervalId = null;
export function playVictoryBgm(loop = false) {
  stopOtherBgms("victory");
  const volume = Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-victory-bgm")));
  if (volume <= 0 && !loop) return; // 実際の勝利時は音量0なら鳴らさない（従来通り）
  if (!victoryBgmAudio) {
    victoryBgmAudio = new Audio("assets/sounds/victory-bgm.mp3");
    victoryBgmGain = attachGainNode(victoryBgmAudio);
  }
  if (victoryBgmFadeIntervalId) {
    clearInterval(victoryBgmFadeIntervalId);
    victoryBgmFadeIntervalId = null;
  }
  victoryBgmAudio.loop = loop;
  setBgmTrackVolume(victoryBgmAudio, victoryBgmGain, volume);
  victoryBgmAudio.currentTime = 0;
  victoryBgmAudio.play().catch(() => {});
}
export function stopVictoryBgm(durationMs = 300) {
  if (!victoryBgmAudio || victoryBgmAudio.paused) return;
  if (victoryBgmFadeIntervalId) clearInterval(victoryBgmFadeIntervalId);
  const startVolume = victoryBgmGain ? victoryBgmGain.gain.value : victoryBgmAudio.volume;
  const stepMs = 30;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;
  victoryBgmFadeIntervalId = setInterval(() => {
    step++;
    const ratio = Math.max(0, 1 - step / steps);
    setBgmTrackVolume(victoryBgmAudio, victoryBgmGain, startVolume * ratio);
    if (step >= steps) {
      clearInterval(victoryBgmFadeIntervalId);
      victoryBgmFadeIntervalId = null;
      victoryBgmAudio.pause();
      victoryBgmAudio.currentTime = 0;
    }
  }, stepMs);
}

// 管理者モードの各BGMスライダーの「▶ 試聴 / ⏹ 停止」トグル用（ユーザー要望2026-08-08）。
// 再生中なら止めてfalseを、止まっていたら鳴らしてtrueを返す（呼び出し側がボタン表示を切り替える）。
// 勝利時BGMだけは試聴中ループさせて、止めるまで鳴り続けるようにする。
export function toggleBgmPreview(cssVar) {
  const ctrl = {
    "--sound-volume-opening-bgm": { getAudio: () => openingBgmAudio, play: playOpeningBgm, stop: stopOpeningBgm },
    "--sound-volume-game-bgm": { getAudio: () => gameBgmAudio, play: playGameBgm, stop: stopGameBgm },
    "--sound-volume-waiting-bgm": { getAudio: () => waitingBgmAudio, play: playWaitingBgm, stop: stopWaitingBgm },
    "--sound-volume-victory-bgm": { getAudio: () => victoryBgmAudio, play: () => playVictoryBgm(true), stop: stopVictoryBgm },
  }[cssVar];
  if (!ctrl) return false;
  const audio = ctrl.getAudio();
  if (audio && !audio.paused) {
    ctrl.stop(0);
    return false;
  }
  ctrl.play();
  return true;
}

// ユーザー要望「管理者モードでBGMを個別調整するとき実際に音量確認でそのBGMを
// 鳴らせるようにしてください」（続き63）。admin.jsの各BGM個別音量スライダーの
// previewOnInteractから呼ばれる。スライダーはpointerdown時に1回、以後input（値が
// 変わるたび＝ドラッグ中）にも毎回呼ばれる設計（admin.js側のコメント参照）ため、
// 既に再生中ならcurrentTimeをリセットせず音量だけ更新し（毎回頭出しされて耳障りに
// ならないように）、まだ再生していなければ各playXBgm()で最初から始める。
export function previewBgmVolume(cssVar) {
  // 開始/停止は「▶ 試聴」トグル（toggleBgmPreview）が担うので、ここではスライダー操作中に
  // 「今試聴で鳴っているBGMの音量をその場で更新する」だけにする（鳴っていなければ何もしない）。
  const trackByVar = {
    "--sound-volume-opening-bgm": { getAudio: () => openingBgmAudio, getGain: () => openingBgmGain },
    "--sound-volume-game-bgm": { getAudio: () => gameBgmAudio, getGain: () => gameBgmGain },
    "--sound-volume-waiting-bgm": { getAudio: () => waitingBgmAudio, getGain: () => waitingBgmGain },
    "--sound-volume-victory-bgm": { getAudio: () => victoryBgmAudio, getGain: () => victoryBgmGain },
  };
  const track = trackByVar[cssVar];
  if (!track) return;
  const audio = track.getAudio();
  if (audio && !audio.paused) {
    const volume = Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume(cssVar)));
    setBgmTrackVolume(audio, track.getGain(), volume);
  }
}

// ユーザー報告「iPhoneで効果音が鳴らない（playSound failed NotAllowedError）」。iOSは
// new Audio().play() を「ユーザー操作の外」からは弾く。しかもページが一度アンロック済みでも、
// 毎回新しく生成する<audio>要素の再生は操作外だと弾かれ続ける。効果音は自動処理から鳴らす
// ことが多いため、ほぼ全て無音になっていた。対策として効果音はWeb Audio(AudioContext)経由で
// 鳴らす——一度ユーザー操作でAudioContextをresumeすれば、以後はデコード済みバッファを操作の
// 外からでも鳴らせる（Howler.js等と同じ方式）。バッファは初回操作時（initSoundUnlock）に一括
// デコードしてキャッシュする。未対応/未ロード時は従来の new Audio() にフォールバックする。
const soundBufferCache = new Map(); // name -> AudioBuffer | "loading" | null(失敗)
function loadSoundBuffer(name) {
  const def = SOUND_DEFS[name];
  const ctx = getAudioContext();
  if (!def || !ctx || soundBufferCache.has(name)) return;
  soundBufferCache.set(name, "loading");
  fetch(def.path)
    .then((r) => r.arrayBuffer())
    .then((buf) => ctx.decodeAudioData(buf))
    .then((decoded) => soundBufferCache.set(name, decoded))
    .catch((err) => {
      soundBufferCache.set(name, null);
      logAction("diag-sound-play-failed", { name, phase: "decode", errorName: err?.name ?? null });
    });
}

function playSoundViaWebAudio(name, volume) {
  const ctx = getAudioContext(); // 呼ぶたびにresumeも試みる
  if (!ctx) return false;
  const buf = soundBufferCache.get(name);
  if (buf === undefined) {
    loadSoundBuffer(name); // 未ロードなら今から読む（今回は間に合わないが次回以降鳴る）
    return false;
  }
  if (buf === "loading" || buf === null || ctx.state !== "running") return false;
  try {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(0);
    return true;
  } catch {
    return false;
  }
}

// 最初のユーザー操作（タップ/クリック/キー）で、AudioContextをresumeし、全効果音バッファを
// 事前デコードしてiOSの効果音をアンロックする。main.jsの起動時に一度呼ぶ。
let soundUnlockInstalled = false;
export function initSoundUnlock() {
  if (soundUnlockInstalled || typeof window === "undefined") return;
  soundUnlockInstalled = true;
  ensureAmbientAudioSession(); // iOSのマナーモード/バックグラウンド消音を有効化（対応環境のみ）
  const unlock = () => {
    const ctx = getAudioContext(); // resumeを試みる
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
    for (const name of Object.keys(SOUND_DEFS)) loadSoundBuffer(name);
    // iOSのアンロックを確実にするため、無音の1サンプルを一度鳴らす。
    if (ctx) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
      } catch {
        /* noop */
      }
    }
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock, { passive: true });
  window.addEventListener("touchstart", unlock, { passive: true });
}

// ユーザー要望2026-08-08「ザ・ギャンブルや試練の儀式のとき、心臓の鼓動の効果音を入れたい」。
// 専用の音源ファイルは持たず、AudioContextで「ドクッ…ドクッ」（lub-dub）を合成してループする。
// 効果音マスター音量(masterVolume)に連動。startHeartbeat/stopHeartbeatで囲んで使う（緊張場面で
// 鳴らし、結果が出たら止める）。多重startは無視、stopは冪等。
let heartbeatActive = false;
let heartbeatTimer = null;
// ユーザー要望2026-09-03「鼓動の効果音をもう少し大きくできる？」。以前は 62Hz / 48Hz の
// サイン波1本だけだったが、この帯域はスマホの小さなスピーカーではほとんど鳴らない（physically
// 再生できない）ため、音量を上げても大きくならなかった。**低音（体で感じる本体）＋その上の
// 中音（小さなスピーカーでも実際に聞こえる成分）の2層**にして、聞こえの大きさを底上げする。
// ピークの合計が 1.0 を超えると歪む（Web Audioは destination で頭打ち）ので、低音0.62＋
// 中音はその45%＝合計0.90までに収めてある。
function schedulePartial(ctx, when, freq, peak, decay) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, when);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq * 0.6), when + decay * 0.78);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + decay);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + decay + 0.04);
  } catch {
    /* 合成に失敗しても進行は止めない */
  }
}
function scheduleThump(ctx, when, freq, peak) {
  schedulePartial(ctx, when, freq, peak, 0.18); // 低音（本体）
  schedulePartial(ctx, when, freq * 2.6, peak * 0.45, 0.12); // 中音（スマホでも聞こえる成分）
}

// スマホの振動（ユーザー要望2026-09-03「スマホであれば振動を与えることできる？」）。
// Vibration API は Android Chrome 等では使えるが、**iPhone/iPad の Safari には実装が無い**
// （Appleが未対応。どのサイトからも振動させられない）。そのため supportsVibration() が false の
// 端末では設定項目自体を出さない。
const VIBRATION_KEY = "so7-vibration-enabled";
let vibrationEnabled = true;
try {
  const saved = localStorage.getItem(VIBRATION_KEY);
  if (saved !== null) vibrationEnabled = saved === "1";
} catch {
  /* localStorageが使えない環境でも既定値で動く */
}
export function supportsVibration() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}
export function isVibrationEnabled() {
  return vibrationEnabled;
}
export function setVibrationEnabled(v) {
  vibrationEnabled = !!v;
  try {
    localStorage.setItem(VIBRATION_KEY, vibrationEnabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}
// pattern は navigator.vibrate と同じ（数値=ミリ秒、配列=[振動,休止,振動,...]）。
// 画面が隠れている間は鳴らさない効果音と同じ考え方で振動もしない。
export function vibrate(pattern) {
  if (!vibrationEnabled || !supportsVibration()) return;
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* 未対応・拒否された場合は何もしない */
  }
}

export function startHeartbeat() {
  if (heartbeatActive) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  heartbeatActive = true;
  const periodMs = 900;
  const beat = () => {
    if (!heartbeatActive) return;
    const c = getAudioContext();
    if (c && c.state === "running") {
      // 以前は上限0.5・master×0.9。上限0.62・master×1.35に上げ、さらに中音成分を足した
      // （上のscheduleThump参照）。合計ピークは0.90までで歪まない。
      const peak = Math.min(0.62, Math.max(0, masterVolume) * 1.35);
      if (peak > 0) {
        const t = c.currentTime + 0.02;
        scheduleThump(c, t, 62, peak); // ドク（lub）
        scheduleThump(c, t + 0.19, 48, peak * 0.72); // ドクッ（dub）
      }
    }
    // 鼓動に合わせてスマホを短く2回振動させる（ドク・ドクッ）。対応端末のみ。
    vibrate([32, 158, 24]);
    heartbeatTimer = setTimeout(beat, periodMs);
  };
  beat();
}
export function stopHeartbeat() {
  heartbeatActive = false;
  // 鳴り止めると同時に振動も止める（振動だけ残ると気持ち悪いため）。
  if (supportsVibration()) {
    try {
      navigator.vibrate(0);
    } catch {
      /* ignore */
    }
  }
  if (heartbeatTimer) {
    clearTimeout(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function playSound(name) {
  // ページが別画面/バックグラウンドに隠れている間は効果音を鳴らさない（スマホで別アプリを
  // 開いている時に鳴り続けないように）。BGMはvisibilitychangeで一時停止済み。
  if (typeof document !== "undefined" && document.hidden) return;
  const def = SOUND_DEFS[name];
  if (!def) return;
  const volume = Math.min(1, Math.max(0, masterVolume * getPerSoundVolume(def.cssVar)));
  if (volume <= 0) return;
  // まずWeb Audioで鳴らす（iOSでも初回操作後は確実に鳴る）。未対応/未ロード時のみ従来方式へ。
  if (playSoundViaWebAudio(name, volume)) return;
  const audio = new Audio(def.path);
  audio.volume = volume;
  // 自動再生制限等で失敗してもゲーム進行は止めない。原因調査用に理由だけ記録する
  // （console.errorはiOSで大量に出て邪魔なため出さず、アクションログにだけ残す）。
  audio.play().catch((err) => {
    logAction("diag-sound-play-failed", { name, errorName: err?.name ?? null, message: String(err?.message ?? err) });
  });
}

// ユーザー要望2026-09-03「追色演出時のカードの脈動に効果音をつけたい／勝利時の演出にも」。
// 専用の音源ファイルは持たず、鼓動と同じ合成（schedulePartial）で作る。効果音のマスター音量に
// 連動し、画面が隠れている間は鳴らさない（playSound と同じ扱い）。
function canPlaySynth() {
  if (typeof document !== "undefined" && document.hidden) return false;
  return masterVolume > 0;
}

// 追色演出：カードが脈打つ瞬間の「ドクン」。強さ0〜1（演出側の脈動の強さに合わせる）。
export function playPulseThump(strength = 1) {
  if (!canPlaySynth()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  const peak = Math.min(0.5, masterVolume * 0.85 * Math.max(0.2, Math.min(1, strength)));
  const t = ctx.currentTime + 0.01;
  schedulePartial(ctx, t, 78, peak, 0.2); // 低音（体で感じる）
  schedulePartial(ctx, t, 205, peak * 0.4, 0.13); // 中音（スマホでも聞こえる）
}

// 勝利演出：七色が1つずつ灯る時の音。index 0〜6 で音が上がっていく（集まっていく高揚感）。
export function playVictoryChime(index = 0) {
  if (!canPlaySynth()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  // 全音階（ド レ ミ ソ ラ ド レ）で7段。和音にせず単音を重ねて澄んだ響きにする。
  const scale = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66];
  const freq = scale[Math.max(0, Math.min(scale.length - 1, index))];
  const peak = Math.min(0.34, masterVolume * 0.5);
  const t = ctx.currentTime + 0.01;
  schedulePartial(ctx, t, freq, peak, 0.5);
  schedulePartial(ctx, t, freq * 2, peak * 0.3, 0.35); // 倍音で鈴のような明るさを足す
}

// 勝利演出：白く弾ける瞬間の一撃（低い衝撃＋高く抜ける残響）。
export function playVictoryImpact() {
  if (!canPlaySynth()) return;
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;
  const peak = Math.min(0.55, masterVolume * 0.9);
  const t = ctx.currentTime + 0.01;
  schedulePartial(ctx, t, 55, peak, 0.9); // 腹に来る低音
  schedulePartial(ctx, t, 165, peak * 0.5, 0.7);
  schedulePartial(ctx, t + 0.02, 1318.51, peak * 0.28, 1.1); // 高く抜ける残響
}
