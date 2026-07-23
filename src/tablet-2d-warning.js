// タブレット点滅（preserve-3d+perspectiveの3D合成負荷が原因とほぼ確定、CLAUDE.md
// 参照）の警告モーダル。タッチ操作が主体の端末（device-detect.jsのisTouchPrimaryDevice、
// PCでは出ない）で、まだこのブラウザ/端末で見せたことが無ければ最初の1回だけ表示する
// （localStorageで記録、次回以降は出さない）。「2D表示に切り替える」ボタンから
// tablet-2d-mode.jsのトグルをその場でONにできる（同じ設定はオプションの基本設定・
// 管理者モードのどちらからもいつでも切り替えられる）。

import { isTouchPrimaryDevice } from "./device-detect.js";
import { setFlatten2dMode } from "./tablet-2d-mode.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

const STORAGE_KEY = "so7-tablet-2d-warning-dismissed";

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
    "端末によっては、特にスマホ・タブレットでは手札が見えなくなったりチカチカしたりする場合があります。その場合は下のボタンから2D表示に切り替えてください。これは画面右上のオプションからもいつでも切り替えられます。";
  body.style.cssText = "line-height: 1.6; margin-bottom: 1rem;";
  modal.appendChild(body);

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display: flex; gap: 0.5rem; justify-content: flex-end;";

  const switchBtn = document.createElement("button");
  switchBtn.type = "button";
  switchBtn.textContent = "2D表示に切り替える";
  switchBtn.style.cssText =
    "padding: 0.4rem 0.9rem; background: #be185d; border: none; border-radius: 0.3rem; color: white; cursor: pointer; font-size: 0.85rem;";
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

  btnRow.appendChild(switchBtn);
  btnRow.appendChild(okBtn);
  modal.appendChild(btnRow);

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
