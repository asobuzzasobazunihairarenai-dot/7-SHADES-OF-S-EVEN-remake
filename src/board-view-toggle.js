// 2D / 3D 表示の切り替えアイコン（ユーザー要望「2Dと3Dを切り替えるアイコンを公式Discord
// アイコンと残金表示の間に新設。押すたびに2Dと3Dが切り替わり、アイコンの表示も切り替わる」）。
// 実体は tablet-2d-mode.js の isFlatten2dMode / setFlatten2dMode（オプション・管理者モードの
// 「2D表示に切り替える」トグルと共通の状態）。ここではそれを右上のオプションエリアの
// アイコンボタンからも切り替えられるようにし、今の表示状態をアイコン/キャプションに反映する。
// discord-link.js と同じ buildIconButtonContent / wireIconButtonClick パターン。

import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { getOptionArea } from "./option-area.js";
import { isFlatten2dMode, setFlatten2dMode, onFlatten2dModeChange } from "./tablet-2d-mode.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

const ICON_3D = "assets/icons/view-3d.svg";
const ICON_2D = "assets/icons/view-2d.svg";

export function initBoardViewToggle() {
  const btn = document.createElement("button");
  btn.id = "board-view-toggle-button";
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, { icon: ICON_3D, tooltip: "" });
  const imgEl = btn.querySelector(".icon-action-button-icon-img");

  // 今の表示状態（2D/3D）をアイコン・キャプション・ツールチップへ反映する。
  function applyState() {
    const flat = isFlatten2dMode();
    if (imgEl) imgEl.src = flat ? ICON_2D : ICON_3D;
    captionEl.textContent = flat ? "2D" : "3D";
    if (tooltipEl) tooltipEl.textContent = flat ? t("bvt.tip2d") : t("bvt.tip3d");
  }
  applyState();

  wireIconButtonClick(btn, {
    detailTitle: t("bvt.title"),
    detailParagraphs: [
      t("bvt.detail1"),
      t("bvt.detail2"),
    ],
    onAction: () => {
      setFlatten2dMode(!isFlatten2dMode());
      applyState();
    },
  });

  // オプションの基本設定・管理者モード側の同じトグルで変更された時も追従する。
  onFlatten2dModeChange(applyState);

  getOptionArea().appendChild(btn);
}
