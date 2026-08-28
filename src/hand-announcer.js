// カードが誰かの手札に加わった時、それが「公開情報」（手札に入る直前、既に捨て場や表向きの
// テーブル上で誰でも見えていた）なら全員に、「非公開情報」（山札から裏向きで引いた・相手の
// 手札から奪った等、誰にも見えていなかった）なら本人にだけ中身を見せ、他のプレイヤーには
// 「カードを得た」という事実だけを伝えるポップアップ（トースト、自動で消える）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { showCardFace } from "./card-face-display.js";
import { getPlayerName } from "./player-identity.js";
import { createModalCloseX } from "./ui-helpers.js";
import { getSelfSeat, isOnlineMode } from "./online.js";
import { pushTurnEventStock, getTurnEventStockTargetRect } from "./turn-event-stock.js";

// 通知の主語が「自分自身」の時は名前ではなく「あなた」と表示する（「プレイヤーAが獲得」の
// ような他人事っぽい文言になるのを避ける）。ローカルモードは1人で全座席を操作する前提で
// 「自分」の概念が実質無意味なため対象外（isOnlineMode()でガード）。gate-invasion-modal.js
// も同じ考え方を使うため、isPickupVisibleと同様にここからexportして再利用する。
export function getPlayerNameOrYou(player) {
  return isOnlineMode() && player === getSelfSeat() ? "あなた" : getPlayerName(player);
}

// 表示時間（秒）は管理者モードの「カード獲得ポップアップ」グループで調整できる
// （--hand-pickup-toast-duration、デフォルト5秒）。
function getDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--hand-pickup-toast-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 5 : seconds) * 1000;
}

// #4: 中央で一瞬フラッシュ→右下のストック（横帯）へ飛ばす。フラッシュの表示時間は
// 従来の「カード獲得ポップアップ 表示時間」設定を上限1.8秒で流用する（“一瞬”にするため）。
const STOCK_FLIGHT_MS = 420;
function flashDurationMs() {
  return Math.min(getDurationMs(), 1800);
}

// opts: { icon, label, cardId } — ストックのチップ（右下の横帯）に載せる情報。
function showToast(innerHTML, opts = {}) {
  const toast = document.createElement("div");
  toast.className = "hand-pickup-toast is-flash";
  let done = false;
  // フラッシュを畳んで、右下のストックへ飛ばす。飛び終わったらチップとして積む。
  const stow = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const from = toast.getBoundingClientRect();
    const to = getTurnEventStockTargetRect();
    // 中央寄せ(transform)をやめ、実座標に固定してから目標地点へ飛ばす。
    toast.classList.remove("is-flash", "show");
    toast.classList.add("is-flying");
    toast.style.left = `${from.left}px`;
    toast.style.top = `${from.top}px`;
    toast.style.right = "auto";
    toast.style.bottom = "auto";
    toast.style.width = `${from.width}px`;
    toast.style.transform = "translate(0, 0) scale(1)";
    requestAnimationFrame(() => {
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      toast.style.transform = `translate(${dx}px, ${dy}px) scale(0.22)`;
      toast.style.opacity = "0.15";
    });
    setTimeout(() => {
      toast.remove();
      pushTurnEventStock({ ...opts, html: innerHTML });
    }, STOCK_FLIGHT_MS);
  };
  const content = document.createElement("div");
  content.innerHTML = innerHTML;
  const closeBtn = createModalCloseX((e) => {
    e.stopPropagation(); // トースト全体のクリックでも飛ばせるようにしているため、二重に走らないよう止める
    stow();
  });
  closeBtn.classList.add("hand-pickup-toast-close");
  toast.appendChild(closeBtn);
  toast.appendChild(content);
  toast.addEventListener("click", stow); // クリックで即ストックへ（読み終えた人を待たせない）
  document.body.appendChild(toast);
  // カード画像のプレースホルダーに、カード面（テキスト合成/画像）を描画する。
  content.querySelectorAll(".hand-pickup-toast-img[data-cardface-id]").forEach((el) => {
    const id = el.dataset.cardfaceId;
    showCardFace(el, id, getCardImagePath(id));
  });
  requestAnimationFrame(() => toast.classList.add("show"));
  const timer = setTimeout(stow, flashDurationMs());
}

// 「何によって」を1行添える（ユーザー要望）。reasonが無ければ何も足さない。
function reasonLine(reason) {
  return reason ? `<div class="hand-pickup-toast-reason">${reason}</div>` : "";
}

// pickup（{cardId, wasPublic}）の中身を、今見ている本人(getSelfSeat())が見てよいかどうかを
// 判定する共通ルール。公開情報（wasPublic）か、そのpickupを得た本人自身が見ている場合だけ
// 中身を見せる。gate-invasion-modal.jsも同じ判定基準を使うため、ここから再利用する。
// cardIdが無い（何らかの理由でまだ解決できていない）場合は、閲覧資格があっても強制的に
// 非公開扱いにする——本来なら見えるはずの自分自身の手札でも、markSelfHandled()のTTL切れ後に
// 遅れて届いたBroadcastなどでcardIdが未解決のまま処理される可能性が完全には排除できず、
// そのままgetCardDefinition(null)を呼ぶとundefined.nameでクラッシュしていたため
// （このガードが無いと、そのカードだけでなく同じバッチの他のカードの通知まで巻き添えで
// 出なくなってしまう）。
export function isPickupVisible(pickup, player) {
  if (!pickup.cardId) return false;
  return pickup.wasPublic || player === getSelfSeat();
}

// player: カードを手に入れたプレイヤー。
// pickups: [{ cardId, wasPublic }, ...]（1回のアクションで複数枚まとめて手に入る場合はそのまま並べる）。
// wasPublicは「手札に入る直前、既にテーブル上で公開されていた情報かどうか」
//   （捨て場から/表向きのカードから＝true、山札から裏向きで引いた・相手の手札から奪った＝false）。
export function announceHandPickups(player, pickups, reason) {
  if (pickups.length === 0) return;

  const visible = pickups.filter((p) => isPickupVisible(p, player));
  const hiddenCount = pickups.length - visible.length;

  if (visible.length === 0) {
    showToast(
      `
      <div class="hand-pickup-toast-text">
        <div class="hand-pickup-toast-title">${getPlayerNameOrYou(player)}が非公開のカードを${hiddenCount}枚手札に加えました</div>
        ${reasonLine(reason)}
      </div>
    `,
      { icon: "🎴", label: `${getPlayerNameOrYou(player)}が${hiddenCount}枚獲得${reason ? `（${reason}）` : ""}` }
    );
    return;
  }

  const cardsHtml = visible
    .map((p) => {
      const def = getCardDefinition(p.cardId);
      return `
        <div class="hand-pickup-toast-card">
          <div class="hand-pickup-toast-img" data-cardface-id="${p.cardId}"></div>
          <div class="hand-pickup-toast-name">${def.name}</div>
        </div>
      `;
    })
    .join("");
  const hiddenNote = hiddenCount > 0 ? `<div class="hand-pickup-toast-hidden-note">＋非公開のカード${hiddenCount}枚</div>` : "";

  showToast(
    `
    <div class="hand-pickup-toast-title">${getPlayerNameOrYou(player)}が獲得</div>
    ${reasonLine(reason)}
    <div class="hand-pickup-toast-cards">${cardsHtml}</div>
    ${hiddenNote}
  `,
    {
      icon: "🎴",
      cardId: visible.length === 1 ? visible[0].cardId : null,
      label: `${getPlayerNameOrYou(player)}が獲得${reason ? `（${reason}）` : ""}`,
    }
  );
}

// attacker/defender: 相手ゲート侵攻ボーナスが発生した時の導入トースト。オンライン対戦では
// サーバー（so7-apply-action.ts）がターン終了時に自動判定・適用するため、ローカル版の
// ような1ステップずつの確認ポップアップは出さず、代わりにこのトースト→続く
// announceHandPickups（奪った手札・獲得したエターナルカード・帰還した自ゲートのカード）の
// 一連の通知で「何が起きたか」を伝える。
export function announceGateInvasion(attacker, defender) {
  showToast(
    `
    <div class="hand-pickup-toast-title">相手ゲート侵攻ボーナス発生</div>
    <div class="hand-pickup-toast-text">${getPlayerNameOrYou(attacker)}が${getPlayerNameOrYou(defender)}のゲートに侵攻！</div>
  `,
    { icon: "🚩", label: `${getPlayerNameOrYou(attacker)}がゲート侵攻` }
  );
}

// player: これからカードを引くプレイヤー。count: 枚数。ユーザー要望「「●枚ドローします。」
// 的なモーダルも欲しいです。全員に。」への対応——実際にカードが引かれる「前」に、
// 何を引くかは明かさず枚数だけを予告する（announceHandPickupsは「引き終わった後」に
// 中身を伝える別の通知）。「全員に」を厳密に満たすには他クライアントへのブロードキャストが
// 必要だが未対応で、今のところ実行者自身の画面にのみ表示される（実機オンライン対戦での
// 確認を推奨）。
export function announceDrawCount(player, count, reason) {
  showToast(
    `
    <div class="hand-pickup-toast-title">${getPlayerNameOrYou(player)}が${count}枚ドローします</div>
    ${reasonLine(reason)}
  `,
    { icon: "🃏", label: `${getPlayerNameOrYou(player)}が${count}枚ドロー${reason ? `（${reason}）` : ""}` }
  );
}

// player: ロックエリアの持ち主（そのカードをロックしたプレイヤー）。
// ロックは必ず表向き（[[state.js]]のfaceUpForLocation参照）で誰でも見える情報のため、
// announceHandPickupsと違い公開/非公開の出し分けは不要。白黒（無色）カードをロックエリアへ
// 「置く」ことは、ルール上ロックしたことにはならない（docs/cards.mdの黒カードの補足参照）ため、
// 呼び出し側（main.js）でその2色を除外してから呼ぶ。
export function announceCardLocked(player, cardId) {
  const def = getCardDefinition(cardId);
  showToast(
    `
    <div class="hand-pickup-toast-title">${getPlayerNameOrYou(player)}がロック</div>
    <div class="hand-pickup-toast-cards">
      <div class="hand-pickup-toast-card">
        <div class="hand-pickup-toast-img" data-cardface-id="${cardId}"></div>
        <div class="hand-pickup-toast-name">${def.name}</div>
      </div>
    </div>
  `,
    { icon: "🔒", cardId, label: `${getPlayerNameOrYou(player)}がロック（${def.name}）` }
  );
}

// #4: 「捨て」もストックに残す（ユーザー要望の獲得／捨て／ドロー／奪取のうち“捨て”）。
// 捨て場は表向きに積む＝公開情報なので、中身は常に全員へ見せてよい。
// reason: 「〜の効果で」等、何によって捨てたかの短い説明（省略可）。
export function announceCardDiscarded(player, cardId, reason) {
  if (!cardId) return;
  const def = getCardDefinition(cardId);
  if (!def) return;
  showToast(
    `
    <div class="hand-pickup-toast-title">${getPlayerNameOrYou(player)}が捨てました</div>
    ${reasonLine(reason)}
    <div class="hand-pickup-toast-cards">
      <div class="hand-pickup-toast-card">
        <div class="hand-pickup-toast-img" data-cardface-id="${cardId}"></div>
        <div class="hand-pickup-toast-name">${def.name}</div>
      </div>
    </div>
  `,
    { icon: "🗑", cardId, label: `${getPlayerNameOrYou(player)}が捨てた（${def.name}）${reason ? `／${reason}` : ""}` }
  );
}
