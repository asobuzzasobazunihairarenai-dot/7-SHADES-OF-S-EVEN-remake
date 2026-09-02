// 勝利演出（victory-celebration.js）が再生中かどうかを、どのモジュールからも参照できる
// ようにするだけの葉モジュール（import を一切持たないので循環importの心配が無い）。
//
// ユーザー報告2026-09-02「勝利時の演出の最中に『ロックしました』のミニモーダルが中央に
// 出て演出を邪魔している。処理演出が始まったら、そういったゲーム中のモーダルは不要」。
// 勝利演出が始まったら、対局中のお知らせ（獲得/ロック/捨て/効果の理由など、読まなくても
// 勝敗に影響しない情報表示）は出さない・出ているものは片付ける。
//
// 【方針】止めるのは「情報を見せるだけの表示」に限る。選択を求めるモーダル（マス選択・
// 手札選択・選択肢）は止めない——止めると効果の解決が進まなくなるため。
let active = false;
const cleanups = new Set();

// 演出が始まった瞬間に呼ばれる後片付け（表示中のトースト・モーダルを消す）を登録する。
export function registerCelebrationCleanup(fn) {
  cleanups.add(fn);
}

export function setCelebrationActive(v) {
  const next = !!v;
  const started = next && !active;
  active = next;
  if (!started) return;
  for (const fn of cleanups) {
    try {
      fn();
    } catch (err) {
      // 後片付けの1つが失敗しても演出は続ける（片付け漏れが残るだけ）。
    }
  }
}

export function isCelebrationActive() {
  return active;
}
