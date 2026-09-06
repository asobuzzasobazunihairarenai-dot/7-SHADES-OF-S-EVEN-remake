// 降参（オンラインの2人戦のみ）。
//
// ユーザーの決定（2026-09-06）:
//   ・成績は**普通の負けと同じ**に記録する（戦績システムもランクも）。
//     「負けそうなら降参すればレートが減らない」という抜け道を作らないため。
//   ・**CPU戦には出さない**（いつでもタイトルへ戻れるので要らない）。
//   ・3人・4人戦は当面出さない（一人抜けた後の盤面をどう扱うかを決める必要があるため）。
//
// 設計の要点:
//   ・**サーバー側（Edge Function）には一切触らない**。状態を変えるのではなく
//     「降参した」という合図(broadcastResign)だけを流し、受け取った側が自分で対局終了の
//     処理を走らせる。so7-apply-action.ts の再デプロイが不要。
//   ・終わらせ方は victory.js の `concludeMatchWithWinner()` に**丸ごと相乗り**する。
//     7色そろえて勝った時とまったく同じ流れ（戦績への登録→勝利演出→通貨→順位→
//     ランク反映→対戦終了パネル）が走るので、「降参だけ記録が違う」という穴ができない。
//   ・合図が相手に届かなかった場合も、**降参した側は自分の画面で必ず終了処理を走らせる**
//     （記録は勝者・敗者どちらの画面からでも残せる作りになっている）。
import { getState } from "./state.js";
import { isOnlineMode, getSelfSeat, isSpectatingGame, broadcastResign, onResignEvents } from "./online.js";
import { isCpuBattleActive } from "./cpu-battle-state.js";
import { hasAnyoneWon, concludeMatchWithWinner } from "./victory.js";
import { createBackdrop, createOpenGuard } from "./ui-helpers.js";
import { t } from "./ui-text.js";
import { logAction } from "./action-log.js";

// 降参できる状況か。**対局中のオンライン2人戦で、自分が座って戦っている時だけ**。
export function canResignNow() {
  try {
    if (!isOnlineMode()) return false;
    if (isCpuBattleActive()) return false;
    if (isSpectatingGame()) return false;
    if (hasAnyoneWon()) return false;
    const st = getState();
    const seats = st.activePlayers || [];
    if (seats.length !== 2) return false;
    if (!st.turnPlayer) return false; // まだ始まっていない
    const me = getSelfSeat();
    return Boolean(me) && seats.includes(me);
  } catch (err) {
    return false;
  }
}

function opponentSeat() {
  const seats = getState().activePlayers || [];
  const me = getSelfSeat();
  return seats.find((s) => s !== me) || null;
}

// 実際に降参を確定させる。winnerSeat は残った側。
// **二重に走らせない判定は「もう決着したか」そのもので見る**（続き437）。専用のフラグを
// 持つと、対局をまたいで戻し忘れる経路ができるうえ、戻すために victory.js から呼び返す
// ことになって import が循環する。concludeMatchWithWinner() は同期的に announcedPlayers へ
// 足すので、この関数を抜けた時点で hasAnyoneWon() は必ず true になっている。
function finishResign(winnerSeat, { mine }) {
  if (hasAnyoneWon()) return;
  logAction("diag-resign", { winner: winnerSeat, mine });
  try {
    concludeMatchWithWinner(winnerSeat, { reason: "resign" });
  } catch (err) {
    console.error("resign conclude failed", err);
  }
}

// 確認モーダル。**開いた直後の合成クリックを弾く**（#230/#236 と同じ理由——タップして指を
// 離した位置にボタンが出ると、その同じタップで押されてしまう）。
function confirmResign() {
  return new Promise((resolve) => {
    // createOpenGuard() が返すのは「**まだ受け付けてはいけない**」を返す関数（400ms）。
    const tooSoon = createOpenGuard();
    let done = false;
    const close = (ok) => {
      if (done) return;
      done = true;
      backdrop.remove();
      modal.remove();
      resolve(ok);
    };
    const backdrop = createBackdrop(() => close(false), { dim: true, zIndex: 10620 });
    const modal = document.createElement("div");
    modal.id = "resign-confirm-modal";
    modal.className = "resign-confirm-modal";
    const title = document.createElement("div");
    title.className = "resign-confirm-title";
    title.textContent = t("resign.confirmTitle");
    const body = document.createElement("div");
    body.className = "resign-confirm-body";
    body.textContent = t("resign.confirmBody");
    const row = document.createElement("div");
    row.className = "resign-confirm-actions";
    const cancel = document.createElement("button");
    cancel.className = "resign-confirm-cancel";
    cancel.textContent = t("resign.cancel");
    cancel.addEventListener("click", () => { if (!tooSoon()) close(false); });
    const ok = document.createElement("button");
    ok.className = "resign-confirm-ok";
    ok.textContent = t("resign.confirmOk");
    ok.addEventListener("click", () => { if (!tooSoon()) close(true); });
    row.appendChild(cancel);
    row.appendChild(ok);
    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(row);
    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  });
}

// オプションメニューの「降参する」から呼ぶ。
export async function requestResign() {
  if (!canResignNow()) return;
  const ok = await confirmResign();
  if (!ok) return;
  // 押してから確認を取っている間に対局が終わっていることがある（相手が7色そろえた等）。
  // **待ちを挟んだら、その後にもう一度確かめる**（続き437・441と同じ形）。
  if (!canResignNow()) return;
  const winner = opponentSeat();
  if (!winner) return;
  const me = getSelfSeat();
  try {
    broadcastResign({ loserSeat: me, winnerSeat: winner });
  } catch (err) {
    console.error("broadcastResign failed", err);
  }
  finishResign(winner, { mine: true });
}

// 相手の降参の合図を受け取る。main.js の起動処理から1回だけ呼ぶ。
export function initResign() {
  onResignEvents((payload) => {
    try {
      const winnerSeat = payload?.winnerSeat;
      const loserSeat = payload?.loserSeat;
      if (!winnerSeat || !loserSeat) return;
      if (winnerSeat === loserSeat) return;
      if (hasAnyoneWon()) return;
      finishResign(winnerSeat, { mine: false });
    } catch (err) {
      console.error("resign event failed", err);
    }
  });
}

