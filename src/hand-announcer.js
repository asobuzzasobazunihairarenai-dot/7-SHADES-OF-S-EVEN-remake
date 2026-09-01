// カードが誰かの手札に加わった時、それが「公開情報」（手札に入る直前、既に捨て場や表向きの
// テーブル上で誰でも見えていた）なら全員に、「非公開情報」（山札から裏向きで引いた・相手の
// 手札から奪った等、誰にも見えていなかった）なら本人にだけ中身を見せ、他のプレイヤーには
// 「カードを得た」という事実だけを伝えるポップアップ（トースト、自動で消える）。

import { getCardDefinition, getCardImagePath } from "./cards-data.js";
import { getCardName } from "./card-text.js"; // UI英語化フェーズ6: 表示用カード名（英語版があればそちら）
import { t } from "./ui-text.js";
import { showCardFace } from "./card-face-display.js";
import { getPlayerName } from "./player-identity.js";
import { createModalCloseX } from "./ui-helpers.js";
import { getSelfSeat, isOnlineMode } from "./online.js";
import { pushTurnEventStock, getTurnEventStockTargetRect, getTurnEventStockKey } from "./turn-event-stock.js";
import { stageClientToLocal, stageDelta } from "./main.js";

// カード名は表示用（英語版のカードテキストがあればそれ、無ければ日本語の原名）。
function cardNameOf(cardId) {
  return getCardName(cardId) || getCardDefinition(cardId)?.name || cardId;
}

// 通知の主語が「自分自身」の時は名前ではなく「あなた」と表示する（「プレイヤーAが獲得」の
// ような他人事っぽい文言になるのを避ける）。ローカルモードは1人で全座席を操作する前提で
// 「自分」の概念が実質無意味なため対象外（isOnlineMode()でガード）。gate-invasion-modal.js
// も同じ考え方を使うため、isPickupVisibleと同様にここからexportして再利用する。
export function getPlayerNameOrYou(player) {
  return isOnlineMode() && player === getSelfSeat() ? t("game.you") : getPlayerName(player);
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
  // #184: この出来事が「どのターンのものか」をフラッシュを出す瞬間に確定させておく
  // （飛翔が終わってチップを積む頃には次のターンに入っていることがあるため）。
  const turnKey = getTurnEventStockKey();
  let done = false;
  // フラッシュを畳んで、右下のストックへ飛ばす。飛び終わったらチップとして積む。
  const stow = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const from = toast.getBoundingClientRect();
    const to = getTurnEventStockTargetRect();
    // 【#197/#198・重要】getBoundingClientRect() が返すのは**ステージ変形後の実画面座標**。
    // このトーストは position:fixed だが body（＝ステージ変形の持ち主）の中にあるので、
    // left/top はステージのローカル座標で解釈される。実画面座標をそのまま入れると変形が
    // 二重にかかり、スマホでは中央にあったはずのトーストが一瞬**左上へ飛ぶ**
    //（PCは倍率1・オフセット0なので露見しない）。ghost-flight.js と同じく必ず変換する。
    const fromLocal = stageClientToLocal(from.left, from.top);
    // 中央寄せ(transform)をやめ、実座標に固定してから目標地点へ飛ばす。
    toast.classList.remove("is-flash", "show");
    toast.classList.add("is-flying");
    toast.style.left = `${fromLocal.x}px`;
    toast.style.top = `${fromLocal.y}px`;
    toast.style.right = "auto";
    toast.style.bottom = "auto";
    toast.style.width = `${stageDelta(from.width)}px`;
    toast.style.transform = "translate(0, 0) scale(1)";
    requestAnimationFrame(() => {
      // 移動量も実画面の差分なので、ローカル単位へ直してから translate に入れる。
      const dx = stageDelta(to.left + to.width / 2 - (from.left + from.width / 2));
      const dy = stageDelta(to.top + to.height / 2 - (from.top + from.height / 2));
      toast.style.transform = `translate(${dx}px, ${dy}px) scale(0.22)`;
      toast.style.opacity = "0.15";
    });
    setTimeout(() => {
      toast.remove();
      pushTurnEventStock({ ...opts, html: innerHTML }, turnKey);
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

// チップのツールチップ用の理由サフィックス（「（〜の効果）」/ 英語は " (…)"）。
function reasonSuffix(reason, slash) {
  if (!reason) return "";
  return t(slash ? "game.chip.reasonSlash" : "game.chip.reason", { reason });
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
        <div class="hand-pickup-toast-title">${t("game.toast.hiddenGain", { name: getPlayerNameOrYou(player), n: hiddenCount })}</div>
        ${reasonLine(reason)}
      </div>
    `,
      { icon: "🎴", label: t("game.chip.gainedN", { name: getPlayerNameOrYou(player), n: hiddenCount }) + reasonSuffix(reason) }
    );
    return;
  }

  const cardsHtml = visible
    .map((p) => {
      return `
        <div class="hand-pickup-toast-card">
          <div class="hand-pickup-toast-img" data-cardface-id="${p.cardId}"></div>
          <div class="hand-pickup-toast-name">${cardNameOf(p.cardId)}</div>
        </div>
      `;
    })
    .join("");
  const hiddenNote = hiddenCount > 0 ? `<div class="hand-pickup-toast-hidden-note">${t("game.toast.hiddenNote", { n: hiddenCount })}</div>` : "";

  showToast(
    `
    <div class="hand-pickup-toast-title">${t("game.toast.gained", { name: getPlayerNameOrYou(player) })}</div>
    ${reasonLine(reason)}
    <div class="hand-pickup-toast-cards">${cardsHtml}</div>
    ${hiddenNote}
  `,
    {
      icon: "🎴",
      cardId: visible.length === 1 ? visible[0].cardId : null,
      label: t("game.chip.gained", { name: getPlayerNameOrYou(player) }) + reasonSuffix(reason),
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
    <div class="hand-pickup-toast-title">${t("game.toast.gateTitle")}</div>
    <div class="hand-pickup-toast-text">${t("game.toast.gateText", { attacker: getPlayerNameOrYou(attacker), defender: getPlayerNameOrYou(defender) })}</div>
  `,
    { icon: "🚩", label: t("game.chip.gate", { name: getPlayerNameOrYou(attacker) }) }
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
    <div class="hand-pickup-toast-title">${t("game.toast.draws", { name: getPlayerNameOrYou(player), n: count })}</div>
    ${reasonLine(reason)}
  `,
    { icon: "🃏", label: t("game.chip.draw", { name: getPlayerNameOrYou(player), n: count }) + reasonSuffix(reason) }
  );
}

// player: ロックエリアの持ち主（そのカードをロックしたプレイヤー）。
// ロックは必ず表向き（[[state.js]]のfaceUpForLocation参照）で誰でも見える情報のため、
// announceHandPickupsと違い公開/非公開の出し分けは不要。白黒（無色）カードをロックエリアへ
// 「置く」ことは、ルール上ロックしたことにはならない（docs/cards.mdの黒カードの補足参照）ため、
// 呼び出し側（main.js）でその2色を除外してから呼ぶ。
export function announceCardLocked(player, cardId) {
  showToast(
    `
    <div class="hand-pickup-toast-title">${t("game.toast.locked", { name: getPlayerNameOrYou(player) })}</div>
    <div class="hand-pickup-toast-cards">
      <div class="hand-pickup-toast-card">
        <div class="hand-pickup-toast-img" data-cardface-id="${cardId}"></div>
        <div class="hand-pickup-toast-name">${cardNameOf(cardId)}</div>
      </div>
    </div>
  `,
    { icon: "🔒", cardId, label: t("game.chip.lock", { name: getPlayerNameOrYou(player), card: cardNameOf(cardId) }) }
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
    <div class="hand-pickup-toast-title">${t("game.toast.discarded", { name: getPlayerNameOrYou(player) })}</div>
    ${reasonLine(reason)}
    <div class="hand-pickup-toast-cards">
      <div class="hand-pickup-toast-card">
        <div class="hand-pickup-toast-img" data-cardface-id="${cardId}"></div>
        <div class="hand-pickup-toast-name">${cardNameOf(cardId)}</div>
      </div>
    </div>
  `,
    { icon: "🗑", cardId, label: t("game.chip.discard", { name: getPlayerNameOrYou(player), card: cardNameOf(cardId) }) + reasonSuffix(reason, true) }
  );
}
