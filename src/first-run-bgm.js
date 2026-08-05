// ユーザー要望「初めてアプリをやるとき、BGM設定モーダルを特別に最初に出したい。
// その際、音量の程度がわかるように試聴ボタンもつけたい」への対応。
// 初回起動時（localStorageのフラグが無い時）に一度だけ、オープニング画面の手前へ
// BGM音量の設定モーダルを出す。ブラウザの自動再生制限があるため、モーダル内の
// 「試聴」ボタン（＝ユーザー操作）をきっかけにBGMを鳴らして音量を確認できるようにする。

import { createBackdrop } from "./ui-helpers.js";
import { getBgmVolume, setBgmVolume, playOpeningBgm, stopOpeningBgm } from "./sound.js";

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
  title.textContent = "🎵 BGMの音量設定";

  const desc = document.createElement("div");
  desc.className = "first-run-bgm-desc";
  desc.textContent =
    "このアプリにはBGMがあります。お好みの音量に調整してください。「試聴する」で実際の音量を確認できます（あとからオプションでいつでも変更できます）。";

  const row = document.createElement("div");
  row.className = "first-run-bgm-row";
  const labelEl = document.createElement("span");
  labelEl.className = "first-run-bgm-label";
  labelEl.textContent = "BGMの音量";
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(getBgmVolume() * 100));
  const valueLabel = document.createElement("span");
  valueLabel.className = "first-run-bgm-value";
  valueLabel.textContent = `${slider.value}%`;
  slider.addEventListener("input", () => {
    setBgmVolume(Number(slider.value) / 100); // 再生中なら即座に音量へ反映される（sound.js）
    valueLabel.textContent = `${slider.value}%`;
  });
  row.append(labelEl, slider, valueLabel);

  let previewing = false;
  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "first-run-bgm-preview";
  previewBtn.textContent = "▶ 試聴する";
  previewBtn.addEventListener("click", () => {
    previewing = !previewing;
    if (previewing) {
      playOpeningBgm(); // このクリック（ユーザー操作）が自動再生制限を解除する
      previewBtn.textContent = "⏹ 停止";
    } else {
      stopOpeningBgm();
      previewBtn.textContent = "▶ 試聴する";
    }
  });

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "first-run-bgm-ok";
  okBtn.textContent = "この音量ではじめる";
  okBtn.addEventListener("click", () => {
    // 試聴中のBGMは止める（この後オープニング側で改めて鳴らすため、二重再生を避ける）。
    if (previewing) stopOpeningBgm(0);
    backdrop.remove();
    modal.remove();
  });

  modal.append(title, desc, row, previewBtn, okBtn);
  document.body.append(backdrop, modal);
}
