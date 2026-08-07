// ユーザー要望「初めてアプリをやるとき、BGM設定モーダルを特別に最初に出したい。
// その際、音量の程度がわかるように試聴ボタンもつけたい」への対応、および続きの要望
// 「効果音量も設定できるように。その後、カード拡大表示のサイズも『文字が読みやすいサイズに』
// 調整させたい。あとでオプションから再調整できることも伝えたい」への対応。
// 初回起動時（localStorageのフラグが無い時）に一度だけ、オープニング画面の手前へ
// サウンド（BGM／効果音）と表示（カード拡大サイズ）の設定モーダルを出す。ブラウザの
// 自動再生制限があるため、モーダル内の「試聴」ボタン（＝ユーザー操作）をきっかけに
// BGM／効果音を鳴らして確認できるようにする。

import { createBackdrop } from "./ui-helpers.js";
import {
  getBgmVolume,
  setBgmVolume,
  playOpeningBgm,
  stopOpeningBgm,
  getSoundVolume,
  setSoundVolume,
  playSound,
} from "./sound.js";
import { setCardPreviewSize } from "./card-preview-size.js";
import { saveMyPreference } from "./online.js";

const FLAG_KEY = "so7-bgm-intro-shown-v1";

function alreadyShown() {
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}
function markShown() {
  try {
    localStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* 保存できなくても実行中は表示済み扱いにする */
  }
}

// 音量スライダー1行分を作る共通関数（BGM／効果音で見た目を揃える）。
// initial: 0〜1、onInput(0〜1): スライダー操作時に呼ぶ。
function buildVolumeRow(labelText, initial01, onInput) {
  const row = document.createElement("div");
  row.className = "first-run-bgm-row";
  const labelEl = document.createElement("span");
  labelEl.className = "first-run-bgm-label";
  labelEl.textContent = labelText;
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(initial01 * 100));
  const valueLabel = document.createElement("span");
  valueLabel.className = "first-run-bgm-value";
  valueLabel.textContent = `${slider.value}%`;
  slider.addEventListener("input", () => {
    valueLabel.textContent = `${slider.value}%`;
    onInput(Number(slider.value) / 100);
  });
  row.append(labelEl, slider, valueLabel);
  return { row, getValue: () => Number(slider.value) };
}

// 初回だけ表示する。既に表示済みなら何もしない。
export function maybeShowFirstRunBgmModal() {
  if (alreadyShown()) return;
  markShown(); // 一度出したら（このあと閉じる前にリロードされても）再表示しない

  // 背景クリックでは閉じない（「はじめる」ボタンでのみ閉じる）。オープニングより前面。
  const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 100050 });
  const modal = document.createElement("div");
  modal.id = "first-run-bgm-modal";

  const title = document.createElement("div");
  title.className = "first-run-bgm-title";
  title.textContent = "🎵 サウンドと表示の設定";

  // ユーザー要望2026-08-07「初回設定モーダルがスクロール必要な状態。2段階に分けて
  // スクロール不要にして」。①サウンド（BGM／効果音）→②表示（カード拡大サイズ）の2ステップに分ける。
  const desc = document.createElement("div");
  desc.className = "first-run-bgm-desc";
  desc.textContent =
    "このアプリにはBGMと効果音があります。それぞれお好みの音量に調整してください（「試聴」で実際の音を確認できます）。あとからオプションの「基本設定」でいつでも変更できます。";

  // --- BGM 音量 ---
  const bgm = buildVolumeRow("BGMの音量", getBgmVolume(), (v) => setBgmVolume(v)); // 再生中なら即反映(sound.js)

  let bgmPreviewing = false;
  const bgmPreviewBtn = document.createElement("button");
  bgmPreviewBtn.type = "button";
  bgmPreviewBtn.className = "first-run-bgm-preview";
  bgmPreviewBtn.textContent = "▶ BGMを試聴する";
  bgmPreviewBtn.addEventListener("click", () => {
    bgmPreviewing = !bgmPreviewing;
    if (bgmPreviewing) {
      playOpeningBgm(); // このクリック（ユーザー操作）が自動再生制限を解除する
      bgmPreviewBtn.textContent = "⏹ 停止";
    } else {
      stopOpeningBgm();
      bgmPreviewBtn.textContent = "▶ BGMを試聴する";
    }
  });

  // --- 効果音 音量 ---
  const sfx = buildVolumeRow("効果音の音量", getSoundVolume(), (v) => setSoundVolume(v)); // 次に鳴る音から反映(sound.js)

  const sfxPreviewBtn = document.createElement("button");
  sfxPreviewBtn.type = "button";
  sfxPreviewBtn.className = "first-run-bgm-preview";
  sfxPreviewBtn.textContent = "▶ 効果音を鳴らす";
  sfxPreviewBtn.addEventListener("click", () => {
    // playSoundは現在のマスター音量（setSoundVolumeで今設定した値）で鳴るので、
    // スライダーを動かした結果をそのまま確かめられる。クリック自体がiOSの音声解除の
    // きっかけにもなる（initSoundUnlock、起動時に配線済み）。
    playSound("cardPlace");
  });

  // --- カード拡大プレビューのサイズ ---
  const sizeLabel = document.createElement("div");
  sizeLabel.className = "first-run-bgm-desc";
  sizeLabel.style.marginBottom = "0.4rem";
  sizeLabel.textContent =
    "カードを拡大表示（マウスなら重ねて、タブレット/スマホなら長押しで表示）したときの大きさです。下のカードのテキストが読みやすいサイズに調整してください。";

  const sizeRow = document.createElement("div");
  sizeRow.className = "first-run-bgm-row";
  const sizeName = document.createElement("span");
  sizeName.className = "first-run-bgm-label";
  sizeName.textContent = "拡大サイズ";
  const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-preview-size"));
  const sizeSlider = document.createElement("input");
  sizeSlider.type = "range";
  sizeSlider.min = "8";
  sizeSlider.max = "36";
  sizeSlider.step = "0.5";
  sizeSlider.value = String(Number.isFinite(current) ? current : 20);
  const sizeValue = document.createElement("span");
  sizeValue.className = "first-run-bgm-value";
  sizeValue.textContent = `${sizeSlider.value}rem`;

  // 拡大サイズを確かめるためのデモカード（テキスト入りのカード表面）。実際のホバー拡大と
  // 同じ --card-preview-size を共有し、画面中央に出す。モーダルも中央なので、デモ表示中は
  // モーダルを薄くして後ろのデモが見えるようにし、操作が止まったら元へ戻す。
  let demoEl = null;
  let demoHideTimer = null;
  const showSizeDemo = () => {
    if (!demoEl) {
      demoEl = document.createElement("div");
      demoEl.id = "first-run-card-preview-demo";
      demoEl.style.backgroundImage = 'url("assets/cards/purple-trial-ritual.webp")';
      document.body.appendChild(demoEl);
    }
    demoEl.style.display = "block";
    modal.style.opacity = "0.18"; // スライダー操作は薄いモーダル越しでも続けられる
    clearTimeout(demoHideTimer);
    demoHideTimer = setTimeout(() => {
      if (demoEl) demoEl.style.display = "none";
      modal.style.opacity = "";
    }, 1400);
  };
  sizeSlider.addEventListener("input", () => {
    setCardPreviewSize(Number(sizeSlider.value));
    sizeValue.textContent = `${sizeSlider.value}rem`;
    showSizeDemo();
  });
  sizeRow.append(sizeName, sizeSlider, sizeValue);

  // ステップ①（サウンド）→②（表示）へ進む「次へ」ボタン。
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "first-run-bgm-ok";
  nextBtn.textContent = "次へ（1/2）";

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "first-run-bgm-ok";
  okBtn.textContent = "この設定ではじめる（2/2）";
  okBtn.addEventListener("click", () => {
    // 試聴中のBGMは止める（この後オープニング側で改めて鳴らすため、二重再生を避ける）。
    if (bgmPreviewing) stopOpeningBgm(0);
    if (demoEl) demoEl.remove();
    clearTimeout(demoHideTimer);
    // ログイン済みならアカウントにも保存する（未ログインなら安全に無視される）。カード拡大
    // サイズはcard-preview-size.js側で既に端末へ保存済み。
    saveMyPreference({ sound_volume: sfx.getValue() / 100, sound_volume_bgm: bgm.getValue() });
    backdrop.remove();
    modal.remove();
  });

  // ①サウンドのステップ、②表示（拡大サイズ）のステップに分けてスクロール不要にする。
  const step1 = document.createElement("div");
  step1.className = "first-run-bgm-step";
  step1.append(desc, bgm.row, bgmPreviewBtn, sfx.row, sfxPreviewBtn, nextBtn);

  const step2 = document.createElement("div");
  step2.className = "first-run-bgm-step";
  step2.style.display = "none";
  step2.append(sizeLabel, sizeRow, okBtn);

  nextBtn.addEventListener("click", () => {
    if (bgmPreviewing) stopOpeningBgm(0); // ステップを離れる時は試聴BGMを止める
    step1.style.display = "none";
    step2.style.display = "";
  });

  modal.append(title, step1, step2);
  document.body.append(backdrop, modal);
}
