// タブレット点滅（preserve-3d+perspectiveの3D合成負荷が原因とほぼ確定、CLAUDE.md
// 参照）の警告モーダル。タッチ操作が主体の端末（device-detect.jsのisTouchPrimaryDevice、
// PCでは出ない）で、まだこのブラウザ/端末で見せたことが無ければ最初の1回だけ表示する
// （localStorageで記録、次回以降は出さない）。「2D表示に切り替える」ボタンから
// tablet-2d-mode.jsのトグルをその場でONにできる（同じ設定はオプションの基本設定・
// 管理者モードのどちらからもいつでも切り替えられる）。

import { isTouchPrimaryDevice, getDeviceType, setDeviceType } from "./device-detect.js";
import { setFlatten2dMode } from "./tablet-2d-mode.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

const STORAGE_KEY = "so7-tablet-2d-warning-dismissed";

// 「おすすめ表示（2D＋拡大）」の拡大部分を担う関数（main.jsのapplyRecommendedMobileZoom）を
// 注入してもらう（main.jsを直接importすると循環importになるため。ユーザー要望2026-08-17）。
let recommendedZoomFn = null;
export function registerRecommendedViewHelper(fn) {
  recommendedZoomFn = fn;
}

export function maybeShowTablet2dWarning() {
  if (!isTouchPrimaryDevice()) return;
  if (localStorage.getItem(STORAGE_KEY) === "1") return;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, "1");
    backdrop.remove();
    modal.remove();
  }

  const backdrop = createBackdrop(dismiss, { dim: true, zIndex: 60000 });

  const modal = document.createElement("div");
  modal.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(26rem, 90vw); background: rgba(15, 23, 32, 0.98);
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.6rem;
    padding: 1.2rem; z-index: 60001; font-family: sans-serif; font-size: 0.85rem;
    color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;

  const title = document.createElement("div");
  title.textContent = "⚠️ 警告";
  title.style.cssText = "font-weight: bold; font-size: 1rem; margin-bottom: 0.6rem; padding-right: 1.6rem;";
  modal.appendChild(title);
  modal.appendChild(createModalCloseX(dismiss));

  const body = document.createElement("div");
  body.textContent =
    "端末によっては、特にスマホ・タブレットでは手札が見えなくなったりチカチカしたりする場合があります。スマホ・タブレットでは「2D表示にして、さらにピンチ／ホイールで拡大する」のが一番見やすいです。下の「おすすめ表示にする」を押すと、2D表示＋盤面拡大をまとめて適用します（画面右上のオプションからもいつでも切り替えられます）。";
  body.style.cssText = "line-height: 1.6; margin-bottom: 0.6rem;";
  modal.appendChild(body);

  // ユーザー要望「ブラウザはGoogleが推奨です、を追加したい」への対応。iPhone/iPadでは
  // どのブラウザ（Safari/Chrome/Edge等）も内部的にAppleの同じ描画エンジンを使う仕組み
  // のため効果は限定的だが、Androidタブレットでは端末標準ブラウザよりGoogle Chromeの方が
  // 3D描画・GPU合成の実装が新しく安定していることが多い。
  const browserNote = document.createElement("div");
  browserNote.textContent = "ブラウザはGoogle Chromeを推奨します（iPhone/iPadでは他のブラウザでも同じ描画エンジンのため効果は限定的です）。";
  browserNote.style.cssText = "line-height: 1.6; margin-bottom: 1rem; font-size: 0.8rem; color: #94a3b8;";
  modal.appendChild(browserNote);

  // ユーザー要望「スマホ用のUIをいじりたいので、念のためここで端末の種類を聞いておこう」。
  // 画面サイズからの推測（device-detect.jsのgetDeviceType）をデフォルトのチェックにしつつ、
  // 実際の端末をここで選んでもらう（回答はsetDeviceTypeで保存し、以後は推測より優先される）。
  const deviceTypeRow = document.createElement("div");
  deviceTypeRow.style.cssText = "margin-bottom: 1rem;";
  const deviceTypeLabel = document.createElement("div");
  deviceTypeLabel.textContent = "あなたの端末はどちらですか？";
  deviceTypeLabel.style.cssText = "margin-bottom: 0.4rem; font-size: 0.85rem;";
  deviceTypeRow.appendChild(deviceTypeLabel);

  const deviceTypeOptionsWrap = document.createElement("div");
  deviceTypeOptionsWrap.style.cssText = "display: flex; gap: 1.2rem;";
  const currentDeviceType = getDeviceType();
  for (const { value, text } of [
    { value: "phone", text: "スマホ" },
    { value: "tablet", text: "タブレット" },
  ]) {
    const optionLabel = document.createElement("label");
    optionLabel.style.cssText = "display: flex; align-items: center; gap: 0.3rem; cursor: pointer; font-size: 0.85rem;";
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "so7-device-type-choice";
    radio.value = value;
    radio.checked = currentDeviceType === value;
    radio.addEventListener("change", () => {
      if (radio.checked) setDeviceType(value);
    });
    optionLabel.appendChild(radio);
    optionLabel.appendChild(document.createTextNode(text));
    deviceTypeOptionsWrap.appendChild(optionLabel);
  }
  deviceTypeRow.appendChild(deviceTypeOptionsWrap);
  modal.appendChild(deviceTypeRow);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; flex-wrap: wrap; gap: 0.5rem; justify-content: flex-end;";

  // おすすめ（2D＋盤面拡大をまとめて適用）。
  const recommendBtn = document.createElement("button");
  recommendBtn.type = "button";
  recommendBtn.textContent = "📱 おすすめ表示にする（2D＋拡大）";
  recommendBtn.style.cssText =
    "padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.85rem; font-weight: bold;";
  recommendBtn.addEventListener("click", () => {
    setFlatten2dMode(true);
    recommendedZoomFn?.(); // 盤面拡大（main.jsから注入）
    dismiss();
  });

  // 2D表示だけ（拡大はしない）。
  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.textContent = "2D表示だけにする";
  switchBtn.style.cssText =
    "padding: 0.4rem 0.9rem; background: rgba(190,24,93,0.25); border: 1px solid #be185d; border-radius: 0.3rem; color: #fbcfe8; cursor: pointer; font-size: 0.85rem;";
  switchBtn.addEventListener("click", () => {
    setFlatten2dMode(true);
    dismiss();
  });

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.textContent = "わかりました";
  okBtn.style.cssText =
    "padding: 0.4rem 0.9rem; background: rgba(255,255,255,0.08); border: 1px solid rgba(148,163,184,0.3); border-radius: 0.3rem; color: #e2e8f0; cursor: pointer; font-size: 0.85rem;";
  okBtn.addEventListener("click", dismiss);

  btnRow.appendChild(recommendBtn);
  btnRow.appendChild(switchBtn);
  btnRow.appendChild(okBtn);
  modal.appendChild(btnRow);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
