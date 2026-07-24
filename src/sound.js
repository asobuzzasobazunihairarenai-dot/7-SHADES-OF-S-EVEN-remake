// 効果音の再生。実物の音声ファイル(音声/効果音/)は画像素材と同じ理由でgit管理外にし、
// assets/sounds/に英語名でコピーして使う（.gitignoreの/音声/・/assets/sounds/参照）。
// 音量は「マスター音量」（オプションメニューの基本設定、0〜1）と「効果音ごとの音量」
// （管理者モードの「効果音の音量（個別）」グループ、CSS変数として0〜100を保持）の
// 掛け算で最終的な再生音量を決める。

import { getState, subscribe } from "./state.js";

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
};

// オープニングBGM（ユーザー提供、音声/BGM/オープニング.mp3）。効果音(playSound)と違い
// ループ再生し続ける必要があるため、使い回す単一のAudioインスタンスを持つ。ブラウザの
// 自動再生制限により、ページ読み込み直後には再生できない（ユーザーの操作＝STARTボタン
// クリックが必要）ため、opening-screen.jsがそのクリックハンドラ内から呼ぶ設計にする。
let openingBgmAudio = null;

export function playOpeningBgm() {
  if (!openingBgmAudio) {
    openingBgmAudio = new Audio("assets/sounds/opening-bgm.mp3");
    openingBgmAudio.loop = true;
  }
  const volume = Math.min(1, Math.max(0, masterVolume * getPerSoundVolume("--sound-volume-opening-bgm")));
  openingBgmAudio.volume = volume;
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
  const startVolume = openingBgmAudio.volume;
  const stepMs = 30;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;
  bgmFadeIntervalId = setInterval(() => {
    step++;
    const ratio = Math.max(0, 1 - step / steps);
    openingBgmAudio.volume = startVolume * ratio;
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

export function playGameBgm() {
  if (!gameBgmAudio) {
    gameBgmAudio = new Audio("assets/sounds/game-bgm.mp3");
    gameBgmAudio.loop = true;
  }
  const volume = Math.min(1, Math.max(0, masterVolume * getPerSoundVolume("--sound-volume-game-bgm")));
  gameBgmAudio.volume = volume;
  gameBgmAudio.currentTime = 0;
  gameBgmAudio.play().catch(() => {});
}

export function stopGameBgm(durationMs = 600) {
  if (!gameBgmAudio) return;
  if (gameBgmFadeIntervalId) clearInterval(gameBgmFadeIntervalId);
  const startVolume = gameBgmAudio.volume;
  const stepMs = 30;
  const steps = Math.max(1, Math.round(durationMs / stepMs));
  let step = 0;
  gameBgmFadeIntervalId = setInterval(() => {
    step++;
    const ratio = Math.max(0, 1 - step / steps);
    gameBgmAudio.volume = startVolume * ratio;
    if (step >= steps) {
      clearInterval(gameBgmFadeIntervalId);
      gameBgmFadeIntervalId = null;
      gameBgmAudio.pause();
      gameBgmAudio.currentTime = 0;
    }
  }, stepMs);
}
let gameBgmFadeIntervalId = null;

// victory.js・tutorial.jsと同じ「turnPlayerがnull→非nullに変わった瞬間＝新しい対局が
// 実際に始まった」検知パターンを、このモジュール自身で完結させる（main.js側の配線を
// 増やさずに済む）。セットアップウィザードの各ステップを経てここまで来る時点で、
// 既にユーザー操作（ボタンクリック）を経ているため、ブラウザの自動再生制限には
// 引っかからない。
let wasGameStartedForBgm = false;
export function initGameBgmAutoStart() {
  subscribe(() => {
    const started = Boolean(getState().turnPlayer);
    if (started && !wasGameStartedForBgm) {
      playGameBgm();
    }
    wasGameStartedForBgm = started;
  });
}

// マスター音量（0〜1）。オプションメニューの「基本設定」から調整できる。
let masterVolume = 0.8;

export function getSoundVolume() {
  return masterVolume;
}

export function setSoundVolume(next) {
  masterVolume = Math.min(1, Math.max(0, next));
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
  const volume = Math.min(1, Math.max(0, masterVolume * getPerSoundVolume("--sound-volume-victory-bgm")));
  if (volume <= 0) return;
  const audio = new Audio("assets/sounds/victory-bgm.mp3");
  audio.volume = volume;
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
