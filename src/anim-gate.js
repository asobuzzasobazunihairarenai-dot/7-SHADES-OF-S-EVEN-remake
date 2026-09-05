// 盤面の「演出」が再生中かどうかを、どのモジュールからも参照できるようにするだけの葉モジュール
// （import を一切持たないので循環importの心配が無い。celebration-state.js と同じ作り）。
//
// ユーザー報告2026-09-05 #261「接触演出、カード効果演出（マスチェンジなど）の最中にモーダルが
// 出るようになっちゃってます。演出はしっかり見せたいのでモーダルは演出後にしてください」。
//
// 【方針】演出そのものを止めるのではなく、**情報を見せるだけのモーダル**（「〇〇を使用しました」
// 「〜のため手札に加えます」「〇〇を奪いました」等）に、演出が終わるまで待ってもらう。
// 選択を求めるモーダル（マス選択・手札選択・選択肢）は待たせない——止めると効果の解決が
// 進まなくなるため（celebration-state.js と同じ線引き）。
//
// 【安全側の作り】待ちには必ず上限を設ける。演出側が end を呼び忘れても、モーダルが永久に
// 出ないという最悪の事態にはならない（少し遅れて出るだけ）。さらに、フラグが立ちっぱなしに
// なった場合も一定時間で自動的に下ろす（下記 STUCK_MS）。

// 【#266】タイミングの記録用フック。このファイルは import を一切持たない葉モジュールなので、
// 行動ログへの記録は外（main.js）から関数を差し込んでもらう。
let logHook = null;
export function setAnimGateLogger(fn) {
  logHook = typeof fn === "function" ? fn : null;
}
function note(event, data) {
  try {
    logHook?.(event, data);
  } catch (err) {
    // 記録に失敗しても演出・お知らせは止めない。
  }
}

let depth = 0;
let startedAt = 0;
const waiters = new Set();

// 演出が始まってからこの時間を超えて終わらない場合は、数え間違い（end の呼び忘れ）とみなして
// 強制的に下ろす。実際の演出はどれも数秒以内なので、これに掛かるのは異常時だけ。
const STUCK_MS = 15000;

function flush() {
  const list = [...waiters];
  waiters.clear();
  for (const fn of list) {
    try {
      fn();
    } catch (err) {
      // 1つの待ち手が失敗しても、他の待ち手は起こす。
    }
  }
}

// 演出が始まった瞬間に呼ばれる後片付け（中央に出ているお知らせを畳む等）。
// celebration-state.js の registerCelebrationCleanup と同じ考え方。
const startHooks = new Set();
export function registerBoardAnimationStart(fn) {
  startHooks.add(fn);
}

export function beginBoardAnimation() {
  const first = depth === 0;
  if (first) startedAt = Date.now();
  depth++;
  if (first) {
    for (const fn of startHooks) {
      try {
        fn();
      } catch (err) {
        // 1つ失敗しても演出は始める。
      }
    }
  }
}

export function endBoardAnimation() {
  depth = Math.max(0, depth - 1);
  if (depth === 0) flush();
}

export function isBoardAnimationPlaying() {
  if (depth > 0 && Date.now() - startedAt > STUCK_MS) {
    // 取り残されたフラグを自力で下ろす（待っているモーダルもここで起こす）。
    depth = 0;
    flush();
  }
  return depth > 0;
}

// 演出が終わるまで待つ。maxMs を過ぎたら演出が続いていても待つのをやめる（上限）。
export function waitForBoardAnimation(maxMs = 4000) {
  if (!isBoardAnimationPlaying()) return Promise.resolve();
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      waiters.delete(finish);
      resolve();
    };
    waiters.add(finish);
    setTimeout(finish, maxMs);
  });
}

// 演出関数を包む用の入れ物。中で例外が出ても必ず end されるので、数え間違いが起きない。
export async function withBoardAnimation(fn) {
  beginBoardAnimation();
  try {
    return await fn();
  } finally {
    endBoardAnimation();
  }
}

// --- 中央に出る「見せるだけ」のお知らせの順番待ち -------------------------------------
//
// ユーザー報告2026-09-05 #265「モーダルが次から次へと勝手に消えては次のモーダルで
// 切り替わりが早すぎて何が起こってるのかよくわかりません。以前はそんなことなかったのに！」。
//
// 【原因】上の flush() は、演出が終わった瞬間に**待っている全員を同じ一瞬で起こす**。
// 演出中に溜まったお知らせ（「〇〇を使用しました」「〜のため手札に加えます」「〇〇を
// 奪いました」、獲得・ドロー・ロックのトースト…）がそこで一斉に出て、しかもこれらは
// 中央の同じ場所に出る／前のものを消してから出る作りなので、**1つも読めないまま次々に
// 差し替わる**。演出ゲート（続き421）を入れる前は待たされなかったぶん自然にばらけていた
// ので、ユーザーの「以前はそんなことなかった」という感覚は正しい。
//
// 【対策】お知らせを1列に並べ、「1つ出したら最低これだけは次を出さない」間隔を空ける。
// 演出が終わるのを待つ処理もこの中でまとめて行う（呼ぶ側は waitForNoticeSlot だけでよい）。
//
// 【止まらないための作り】列が長くなったら間隔を詰める（下記 shortHold）。お知らせを
// await している効果処理があるので、待ち時間が積み上がって対局が止まる方が実害が大きい。
// 既定の間隔。呼ぶ側が「そのお知らせが場所を占める長さ」を知っている場合は引数で渡す
// （中央のトーストはフラッシュの長さ、右のモーダルはもう少し短くてよい）。
const NOTICE_HOLD_MS = 1300;
const NOTICE_MIN_HOLD_MS = 500; // 列が詰まっている時でもこれ以下には詰めない
const NOTICE_QUEUE_BUSY = 4; // これ以上並んだら間隔を半分にする（駆け足だが止まりはしない）

let noticeChain = Promise.resolve();
let noticeFreeAt = 0;
let noticePending = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 【#266】いま画面に「返事待ちのモーダル」が出ているか。
// ・.so7-modal-backdrop … 画面を覆って返事を待つモーダルの背景（#225 で付けた目印。
//   儀式の奪取ピッカー・「受け取った」表示・各種確認モーダルが該当する）
// ・#card-effect-picker-hint.show … マス/手札を選ばせている時の上部の案内バナー
// **実際に見えているものだけ**を数える——このアプリには「作りっぱなしで display / .show を
// 切り替えるだけ」の常駐要素が多く、存在の有無で判定すると永久に待つ（続き396・415の教訓）。
function isBlockingModalVisible() {
  try {
    for (const el of document.querySelectorAll(".so7-modal-backdrop")) {
      if (el.getClientRects().length > 0) return true;
    }
    const hint = document.getElementById("card-effect-picker-hint");
    if (hint && hint.classList.contains("show")) return true;
    // フェイズ告知（「ロックフェイズ」等・画面のやや上に約2.6秒出る）も中央の占有物として扱う。
    // ここに重ねると、ユーザーの言う「モーダルが一つ前の処理にラップして出る」状態になる。
    for (const el of document.querySelectorAll(".phase-announce-toast.show")) {
      if (el.getClientRects().length > 0) return true;
    }
  } catch (err) {
    // DOMが無い環境（テスト等）では「出ていない」とみなす。
  }
  return false;
}

// 【#270】フェイズ告知（「ロックフェイズ」等）が今まさに出ているか。
// ユーザー報告「CPUがハンドフェイズをスキップするとき、まだハンドフェイズモーダルが出ているのに
// ムーブフェイズモーダルがラップしてくる」。告知は 2.6 秒出るのに、ハンドフェイズの自動スキップは
// 1.5 秒で次へ進むため、同じ場所に2枚重なっていた。次のフェイズへ進む側がこれを見て待つ。
export function isPhaseAnnounceVisible() {
  try {
    for (const el of document.querySelectorAll(".phase-announce-toast.show")) {
      if (el.getClientRects().length > 0) return true;
    }
  } catch (err) {
    // DOMが無い環境（テスト等）では「出ていない」とみなす。
  }
  return false;
}

// 返事待ちのモーダルが閉じるのを待つ上限。これを超えたら諦めて出す——お知らせを await して
// いる効果処理があるので、**待ち続けて対局が止まる方が実害が大きい**（続き421と同じ考え方）。
const NOTICE_MODAL_WAIT_MAX_MS = 10000;
// 演出が途切れるのを待つ上限（連続する演出をまたいで待つ。同じく上限付き）。
const NOTICE_ANIM_WAIT_MAX_MS = 9000;

// 「中央にお知らせを出してよい順番」が来るまで待つ。演出中ならその後まで回される。
// holdMs: このお知らせが中央（同じ場所）を占める長さ。次のお知らせはそれだけ待つ。
export function waitForNoticeSlot(holdMs = NOTICE_HOLD_MS) {
  noticePending++;
  const run = async () => {
    const startedAt = Date.now();
    let reason = null;
    try {
      // 演出は連続することがある（到達のオーラが何度も出る等）。1回 flush を待っただけだと、
      // その直後に始まった次の演出に重なってしまう（実測でそうなっていた）。演出が途切れる
      // まで繰り返し待つ——ただし全体の上限は必ず設ける。
      const animDeadline = Date.now() + NOTICE_ANIM_WAIT_MAX_MS;
      while (isBoardAnimationPlaying() && Date.now() < animDeadline) {
        reason = "anim";
        await waitForBoardAnimation(Math.min(2000, Math.max(200, animDeadline - Date.now())));
      }
      const hold =
        noticePending > NOTICE_QUEUE_BUSY ? Math.max(NOTICE_MIN_HOLD_MS, Math.round(holdMs / 2)) : holdMs;
      const wait = noticeFreeAt - Date.now();
      if (wait > 0) {
        reason = reason || "queue";
        await sleep(Math.min(wait, holdMs));
      }
      // 【#266】返事待ちのモーダル（儀式の奪取ピッカー・確認モーダル等）が出ている間は
      // 中央にお知らせを重ねない。ユーザー報告「モーダルが一つ前の処理にラップして出る」。
      const modalDeadline = Date.now() + NOTICE_MODAL_WAIT_MAX_MS;
      while (isBlockingModalVisible() && Date.now() < modalDeadline) {
        reason = "modal";
        await sleep(150);
      }
      noticeFreeAt = Date.now() + hold;
    } finally {
      noticePending = Math.max(0, noticePending - 1);
      const waited = Date.now() - startedAt;
      if (waited >= 300) note("diag-notice-wait", { waited, reason, pending: noticePending });
    }
  };
  const p = noticeChain.then(run, run);
  noticeChain = p.then(
    () => {},
    () => {}
  );
  return p;
}

// 【#266】中央のお知らせがまだ出ている／これから出る、という状態か。フェイズの切り替えを
// 待たせるのに使う（ユーザー報告「ミニモーダルが中央に出ている時にもフェイズが切り替わる」）。
// noticeFreeAt は最大でも「今＋holdMs」なので、この値は自然に短時間で false へ戻る。
export function isNoticeQueueBusy() {
  return noticePending > 0 || Date.now() < noticeFreeAt;
}

// 対局のリセット・勝利演出などで、溜まっている順番待ちを無かったことにする。
export function resetNoticeQueue() {
  noticeChain = Promise.resolve();
  noticeFreeAt = 0;
  noticePending = 0;
}
