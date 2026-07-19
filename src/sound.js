// 効果音の再生。実物の音声ファイル(音声/効果音/)は画像素材と同じ理由でgit管理外にし、
// assets/sounds/に英語名でコピーして使う（.gitignoreの/音声/・/assets/sounds/参照）。
// 音量は「マスター音量」（オプションメニューの基本設定、0〜1）と「効果音ごとの音量」
// （管理者モードの「効果音の音量（個別）」グループ、CSS変数として0〜100を保持）の
// 掛け算で最終的な再生音量を決める。

const SOUND_DEFS = {
  handShuffle: { path: "assets/sounds/hand-shuffle.mp3", cssVar: "--sound-volume-hand-shuffle" },
  deckShuffle: { path: "assets/sounds/deck-shuffle.mp3", cssVar: "--sound-volume-deck-shuffle" },
  cardFlip: { path: "assets/sounds/card-flip.mp3", cssVar: "--sound-volume-card-flip" },
  cardPlace: { path: "assets/sounds/card-place.mp3", cssVar: "--sound-volume-card-place" },
  cardDraw: { path: "assets/sounds/card-draw.mp3", cssVar: "--sound-volume-card-draw" },
  arrivalEffect: { path: "assets/sounds/arrival-effect.mp3", cssVar: "--sound-volume-arrival-effect" },
};

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
