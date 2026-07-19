// 効果音の再生。実物の音声ファイル(音声/効果音/)は画像素材と同じ理由でgit管理外にし、
// assets/sounds/に英語名でコピーして使う（.gitignoreの/音声/・/assets/sounds/参照）。

const SOUND_PATHS = {
  handShuffle: "assets/sounds/hand-shuffle.mp3",
  deckShuffle: "assets/sounds/deck-shuffle.mp3",
  cardFlip: "assets/sounds/card-flip.mp3",
  cardPlace: "assets/sounds/card-place.mp3",
};

export function playSound(name) {
  const path = SOUND_PATHS[name];
  if (!path) return;
  const audio = new Audio(path);
  // ブラウザの自動再生制限等で再生に失敗しても、ゲーム進行自体には影響させたくないので無視する。
  audio.play().catch(() => {});
}
