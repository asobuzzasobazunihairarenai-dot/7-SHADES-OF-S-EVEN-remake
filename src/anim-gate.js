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

export function beginBoardAnimation() {
  if (depth === 0) startedAt = Date.now();
  depth++;
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
