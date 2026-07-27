// 効果音の再生。実物の音声ファイル(音声/効果音/)は画像素材と同じ理由でgit管理外にし、
// assets/sounds/に英語名でコピーして使う（.gitignoreの/音声/・/assets/sounds/参照）。
// 音量は「マスター音量」（オプションメニューの基本設定、0〜1）と「効果音ごとの音量」
// （管理者モードの「効果音の音量（個別）」グループ、CSS変数として0〜100を保持）の
// 掛け算で最終的な再生音量を決める。

import { getState, subscribe } from "./state.js";

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
function getAudioContext() {
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
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

export function playOpeningBgm() {
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
export function initGameBgmAutoStart() {
  subscribe(() => {
    const started = Boolean(getState().turnPlayer);
    if (started && !wasGameStartedForBgm) {
      stopWaitingBgm();
      playGameBgm();
    }
    wasGameStartedForBgm = started;
  });
}

// マスター音量（0〜1）。オプションメニューの「基本設定」から調整できる（効果音のみ、
// BGMはmasterBgmVolume参照）。ユーザー要望「BGMと効果音の初期音量を50%にしてほしい」
// への対応でデフォルトを0.5にした（効果音は毎回new Audio()で鳴らす時に参照するため、
// この値を変えるだけで次に鳴る音から反映される）。
let masterVolume = 0.5;

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
// デフォルトはユーザー要望により0.5（初期音量50%）。
let masterBgmVolume = 0.5;

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
export function playVictoryBgm() {
  const volume = Math.min(1, Math.max(0, masterBgmVolume * getPerSoundVolume("--sound-volume-victory-bgm")));
  if (volume <= 0) return;
  const audio = new Audio("assets/sounds/victory-bgm.mp3");
  const gainNode = attachGainNode(audio);
  setBgmTrackVolume(audio, gainNode, volume);
  audio.play().catch(() => {});
}

export function playSound(name) {
  const def = SOUND_DEFS[name];
  if (!def) return;
  const volume = Math.min(1, Math.max(0, masterVolume * getPerSoundVolume(def.cssVar)));
  if (volume <= 0) return;
  const audio = new Audio(def.path);
  audio.volume = volume;
  // ブラウザの自動再生制限等で再生に失敗しても、ゲーム進行自体には影響させたくないので無視する。
  audio.play().catch(() => {});
}
