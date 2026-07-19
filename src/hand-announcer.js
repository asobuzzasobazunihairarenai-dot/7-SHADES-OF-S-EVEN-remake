// カードが誰かの手札に加わった時、それが「公開情報」（手札に入る直前、既に捨て場や表向きの
// テーブル上で誰でも見えていた）なら全員に、「非公開情報」（山札から裏向きで引いた・相手の
// 手札から奪った等、誰にも見えていなかった）なら本人にだけ中身を見せ、他のプレイヤーには
// 「カードを得た」という事実だけを伝えるポップアップ（トースト、自動で消える）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { getPlayerName } from "./player-identity.js";
import { createModalCloseX } from "./ui-helpers.js";
import { getSelfSeat } from "./online.js";

// 表示時間（秒）は管理者モードの「カード獲得ポップアップ」グループで調整できる
// （--hand-pickup-toast-duration、デフォルト5秒）。
function getDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--hand-pickup-toast-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 5 : seconds) * 1000;
}

function showToast(innerHTML) {
  const toast = document.createElement("div");
  toast.className = "hand-pickup-toast";
  const dismiss = () => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 400);
  };
  const content = document.createElement("div");
  content.innerHTML = innerHTML;
  const closeBtn = createModalCloseX((e) => {
    e.stopPropagation(); // トースト全体のクリックでも消えるようにしているため、二重に走らないよう止める
    dismiss();
  });
  closeBtn.classList.add("hand-pickup-toast-close");
  toast.appendChild(closeBtn);
  toast.appendChild(content);
  toast.addEventListener("click", dismiss);
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(dismiss, getDurationMs());
}

// player: カードを手に入れたプレイヤー。
// pickups: [{ cardId, wasPublic }, ...]（1回のアクションで複数枚まとめて手に入る場合はそのまま並べる）。
// wasPublicは「手札に入る直前、既にテーブル上で公開されていた情報かどうか」
//   （捨て場から/表向きのカードから＝true、山札から裏向きで引いた・相手の手札から奪った＝false）。
export function announceHandPickups(player, pickups) {
  if (pickups.length === 0) return;

  const visible = pickups.filter((p) => p.wasPublic || player === getSelfSeat());
  const hiddenCount = pickups.length - visible.length;

  if (visible.length === 0) {
    showToast(`
      <div class="hand-pickup-toast-text">
        <div class="hand-pickup-toast-title">${getPlayerName(player)}が非公開のカードを${hiddenCount}枚手札に加えました</div>
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
    <div class="hand-pickup-toast-title">${getPlayerName(player)}が獲得</div>
    <div class="hand-pickup-toast-cards">${cardsHtml}</div>
    ${hiddenNote}
  `);
}

// attacker/defender: 相手ゲート侵攻ボーナスが発生した時の導入トースト。オンライン対戦では
// サーバー（so7-apply-action.ts）がターン終了時に自動判定・適用するため、ローカル版の
// ような1ステップずつの確認ポップアップは出さず、代わりにこのトースト→続く
// announceHandPickups（奪った手札・獲得したエターナルカード・帰還した自ゲートのカード）の
// 一連の通知で「何が起きたか」を伝える。
export function announceGateInvasion(attacker, defender) {
  showToast(`
    <div class="hand-pickup-toast-title">相手ゲート侵攻ボーナス発生</div>
    <div class="hand-pickup-toast-text">${getPlayerName(attacker)}が${getPlayerName(defender)}のゲートに侵攻！</div>
  `);
}

// player: ロックエリアの持ち主（そのカードをロックしたプレイヤー）。
// ロックは必ず表向き（[[state.js]]のfaceUpForLocation参照）で誰でも見える情報のため、
// announceHandPickupsと違い公開/非公開の出し分けは不要。白黒（無色）カードをロックエリアへ
// 「置く」ことは、ルール上ロックしたことにはならない（docs/cards.mdの黒カードの補足参照）ため、
// 呼び出し側（main.js）でその2色を除外してから呼ぶ。
export function announceCardLocked(player, cardId) {
  const def = getCardDefinition(cardId);
  showToast(`
    <div class="hand-pickup-toast-title">${getPlayerName(player)}がロック</div>
    <div class="hand-pickup-toast-cards">
      <div class="hand-pickup-toast-card">
        <img src="${getCardImagePath(cardId)}" alt="${def.name}" />
        <div class="hand-pickup-toast-name">${def.name}</div>
      </div>
    </div>
  `);
}
