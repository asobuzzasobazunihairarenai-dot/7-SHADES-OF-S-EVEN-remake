// フェイズ自動送り（自動スキップ）のオン/オフ設定だけを持つ、依存の無い極小モジュール。
// ユーザー要望「自動フェイズスキップのオン/オフボタンをフェイズ案内板に付けたい」。
//
// なぜ独立モジュールにするか: 以前この設定をphase-automation.jsに置き、ボタン側の
// phase-guide.jsからphase-automation.jsをimportしたところ、モジュールの評価順が変わって
// phase-automation.jsがonline.jsの初期化より前に評価され、トップレベルの
// onPhaseChangeEvents()呼び出しがonline.jsの未初期化変数にアクセスしてTDZエラー
// （Cannot access 'phaseChangeEventListeners' before initialization）で起動不能になった。
// この設定値と通知だけを「何もimportしない葉モジュール」に切り出し、phase-automation.jsと
// phase-guide.jsの双方がこれをimportする形にすれば循環・評価順の問題が起きない。
//
// この端末のみの設定（localStorage、アカウント/相手には同期しない——自分の手番の進み方を
// 選ぶだけでゲーム状態には一切影響しないため）。

const STORAGE_KEY = "so7-auto-phase-skip";
let enabled = true;
try {
  if (localStorage.getItem(STORAGE_KEY) === "0") enabled = false;
} catch (e) {
  /* localStorageが読めなければ既定ON */
}

const listeners = [];

export function isAutoPhaseSkipEnabled() {
  return enabled;
}

// 値を変更して永続化し、購読者（phase-automation.jsが「ONに戻した瞬間の再評価」用に登録）へ通知する。
export function setAutoPhaseSkipEnabled(v) {
  enabled = !!v;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
  } catch (e) {
    /* 保存できなくても実行中は反映される */
  }
  for (const fn of listeners) {
    try {
      fn(enabled);
    } catch (err) {
      console.error("auto-phase-skip listener failed", err);
    }
  }
}

export function onAutoPhaseSkipChange(fn) {
  listeners.push(fn);
}
