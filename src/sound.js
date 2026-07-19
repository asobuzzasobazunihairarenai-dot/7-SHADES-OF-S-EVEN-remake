// 効果音の再生。実物の音声ファイル(音声/効果音/)は画像素材と同じ理由でgit管理外にし、
// assets/sounds/に英語名でコピーして使う（.gitignoreの/音声/・/assets/sounds/参照）。

const SOUND_PATHS = {
  handShuffle: "assets/sounds/hand-shuffle.mp3",
  deckShuffle: "assets/sounds/deck-shuffle.mp3",
  cardFlip: "assets/sounds/card-flip.mp3",
  cardPlace: "assets/sounds/card-place.mp3",
};

// 音量（0〜1）。オプションメニューの「基本設定」から調整できる（--volume: 0〜100を100で割った値）。
let volume = 0.8;

export function getSoundVolume() {
  return volume;
}

export function setSoundVolume(next) {
  volume = Math.min(1, Math.max(0, next));
}

export function playSound(name) {
  const path = SOUND_PATHS[name];
  if (!path || volume <= 0) return;
  const audio = new Audio(path);
  audio.volume = volume;
  // ブラウザの自動再生制限等で再生に失敗しても、ゲーム進行自体には影響させたくないので無視する。
  audio.play().catch(() => {});
}
