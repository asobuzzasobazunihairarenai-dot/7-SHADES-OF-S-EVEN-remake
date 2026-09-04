// 「この端末にだけ保存されていた設定」を、アカウントにも保存できるようにするための受け口
// （ユーザー報告2026-09-05「私のアカウントでの基本設定が割とリセットされている印象です。
// CPUの速さとか」への対応）。
//
// 【背景】設定には2種類あった:
//   ・アカウントに保存（so7_user_profiles の列）… 音量・アニメ削減・表示時間・名前/アバター等
//   ・この端末にだけ保存（localStorage）… CPUの速さ/強さ/人数、フェイズの自動スキップ、
//     マスの確認、カード拡大の大きさ・向き、手札の固定、ランク戦の通知 など
// 後者は、閲覧データを消した・別のブラウザや端末で開いた・iOSが古い保存データを自動で
// 消した、といった理由で初期値に戻る。「設定がリセットされた」の正体はこれ。
//
// 【なぜ列を増やさず1つのJSONにまとめるのか】設定ごとに列を足していくと、**列が1つでも
// 足りないだけでSELECT文全体が失敗し、他の設定まで丸ごと読めなくなる**（online.js の
// loadMyPreferences のコメント参照。実際に一度やらかしている）。まとめて1つの jsonb
// （so7_user_profiles.extra_prefs）に入れ、しかも**独立したSELECT**で読むことで、
// この列がまだ無い環境でも他の設定に一切影響しないようにする。
//
// 【なぜ「登録制」なのか】この受け口は**importを一切持たない葉モジュール**にしてある。
// 各設定モジュール（cpu-battle-state.js 等）が自分から registerSyncedPref() を呼んで
// 登録する形なので、online.js はこのファイルだけを見ればよく、循環importが起きない
// （例: ranked-notify.js は online.js を import しているので、逆向きの import は作れない）。
//
// 【遅れて読み込まれるモジュールへの配慮】CPU戦の設定などは、対局を始めるまで読み込まれない
// ことがある。アカウントから読んだ値は pendingValues に取っておき、そのモジュールが登録
// された瞬間に適用する。

const entries = new Map(); // key -> { get, set }
let pendingValues = null; // アカウントから読んだ値（未登録キーの分もここに残る）
let lastSavedJson = null; // 直近で保存した内容（変化の検出用）

// 設定モジュールが自分を登録する。get は保存する値（JSONにできるもの）を返し、
// set はアカウントから読んだ値を適用する。
export function registerSyncedPref(key, get, set) {
  entries.set(key, { get, set });
  if (pendingValues && Object.prototype.hasOwnProperty.call(pendingValues, key)) {
    try {
      set(pendingValues[key]);
    } catch (err) {
      console.error("registerSyncedPref: 適用に失敗", key, err);
    }
  }
}

// 今の設定をまとめて1つのオブジェクトにする。
export function collectSyncedPrefs() {
  const out = {};
  for (const [key, entry] of entries) {
    try {
      const v = entry.get();
      if (v !== undefined && v !== null) out[key] = v;
    } catch (err) {
      /* 1つ壊れても他は保存する */
    }
  }
  return out;
}

// アカウントから読んだ値を適用する。まだ読み込まれていないモジュールの分は覚えておき、
// 登録された時に適用する（上の registerSyncedPref 参照）。
export function applySyncedPrefs(obj) {
  if (!obj || typeof obj !== "object") return;
  pendingValues = { ...(pendingValues || {}), ...obj };
  for (const [key, value] of Object.entries(obj)) {
    const entry = entries.get(key);
    if (!entry) continue;
    try {
      entry.set(value);
    } catch (err) {
      console.error("applySyncedPrefs: 適用に失敗", key, err);
    }
  }
  // 読み込んだ直後は「保存済み」とみなす（そのまま書き戻さない）。
  lastSavedJson = JSON.stringify(collectSyncedPrefs());
}

// 前回保存した時から変わっていれば、その内容を返す（変わっていなければ null）。
// 各設定の setter を書き換えずに変更を拾えるよう、**値そのものを比べる**方式にしてある
// （設定を変える経路はモーダルの「今後表示しない」等あちこちにあり、呼び忘れが起きやすいため）。
export function takeChangedSyncedPrefs() {
  const now = JSON.stringify(collectSyncedPrefs());
  if (now === lastSavedJson) return null;
  lastSavedJson = now;
  try {
    return JSON.parse(now);
  } catch (err) {
    return null;
  }
}

// ログアウト時など。次のログインで「読んだ値をそのまま保存し直す」ことがないよう戻す。
export function resetSyncedPrefTracking() {
  pendingValues = null;
  lastSavedJson = null;
}
