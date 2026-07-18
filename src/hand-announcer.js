// カードが誰かの手札に加わった時、それが「公開情報」（手札に入る直前、既に捨て場や表向きの
// テーブル上で誰でも見えていた）なら全員に、「非公開情報」（山札から裏向きで引いた・相手の
// 手札から奪った等、誰にも見えていなかった）なら本人にだけ中身を見せ、他のプレイヤーには
// 「カードを得た」という事実だけを伝えるポップアップ（トースト、自動で消える）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { SEAT_LABELS } from "./board-layout.js";

function showToast(innerHTML) {
  const toast = document.createElement("div");
  toast.className = "hand-pickup-toast";
  toast.innerHTML = innerHTML;
  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  };
  toast.addEventListener("click", dismiss);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(dismiss, 3200);
}

// player: カードを手に入れたプレイヤー。
// pickups: [{ cardId, wasPublic }, ...]（1回のアクションで複数枚まとめて手に入る場合はそのまま並べる）。
// wasPublicは「手札に入る直前、既にテーブル上で公開されていた情報かどうか」
//   （捨て場から/表向きのカードから＝true、山札から裏向きで引いた・相手の手札から奪った＝false）。
export function announceHandPickups(player, pickups) {
  if (pickups.length === 0) return;

  const visible = pickups.filter((p) => p.wasPublic || player === "A");
  const hiddenCount = pickups.length - visible.length;

  const title = document.createElement("div");
  title.className = "hand-pickup-toast-title";
  title.textContent = `${SEAT_LABELS[player]}が獲得`;

  if (visible.length === 0) {
    showToast(`
      <div class="hand-pickup-toast-text">
        <div class="hand-pickup-toast-title">${SEAT_LABELS[player]}が非公開のカードを${hiddenCount}枚手札に加えました</div>
      </div>
    `);
    return;
  }

  const cardsHtml = visible
    .map((p) => {
      const def = getCardDefinition(p.cardId);
      return `
        <div class="hand-pickup-toast-card">
          <img src="${getCardImagePath(p.cardId)}" alt="${def.name}" />
          <div class="hand-pickup-toast-name">${def.name}</div>
        </div>
      `;
    })
    .join("");
  const hiddenNote = hiddenCount > 0 ? `<div class="hand-pickup-toast-hidden-note">＋非公開のカード${hiddenCount}枚</div>` : "";

  showToast(`
    <div class="hand-pickup-toast-title">${SEAT_LABELS[player]}が獲得</div>
    <div class="hand-pickup-toast-cards">${cardsHtml}</div>
    ${hiddenNote}
  `);
}
