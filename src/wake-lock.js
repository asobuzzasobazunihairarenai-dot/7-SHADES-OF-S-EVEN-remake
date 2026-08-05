// ユーザー要望「スマホやタブレットの自動画面オフを、アプリ側で防げるか？」への対応。
// Screen Wake Lock API（navigator.wakeLock）で、アプリを開いている間は画面が自動で
// 暗くならない/ロックされないようにする。対応ブラウザ（iOS Safari 16.4+ / Chrome 等）で
// のみ動作し、未対応環境では単に何もしない（例外も握りつぶす）。
//
// 仕様上、タブが非表示（別アプリ/別タブへ移動、画面ロック）になるとWake Lockは自動で
// 解放されるため、visibilitychange で可視に戻るたびに取り直す（これが無いと一度でも
// バックグラウンドにするとロックが効かなくなる）。

let wakeLockSentinel = null;
let enabled = false;

async function acquire() {
  if (!enabled) return;
  if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
  // 非表示中は取得できない（必ず失敗する）ので、可視の時だけ試みる。
  if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
  if (wakeLockSentinel) return; // 既に保持中
  try {
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    // OS 側の事情（省電力モード等）で勝手に解放されたら、参照をクリアして次の機会に取り直せるようにする。
    wakeLockSentinel.addEventListener("release", () => {
      wakeLockSentinel = null;
    });
  } catch {
    // 未対応・権限不足・非表示中などは黙って諦める（画面オフ防止はあくまでベストエフォート）。
    wakeLockSentinel = null;
  }
}

async function release() {
  if (!wakeLockSentinel) return;
  try {
    await wakeLockSentinel.release();
  } catch {
    /* 解放失敗は無視 */
  }
  wakeLockSentinel = null;
}

// アプリ起動時に一度呼ぶ。以後、可視に戻るたびに自動で取り直す。
export function initScreenWakeLock() {
  enabled = true;
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") acquire();
    });
  }
  // 初回の取得はユーザー操作起点でなくても多くのブラウザで通るが、念のため最初の
  // ポインタ/キー入力でも取り直す（iOSでrequestがユーザー操作を要求するケースの保険）。
  if (typeof window !== "undefined") {
    const kick = () => acquire();
    window.addEventListener("pointerdown", kick, { once: false, passive: true });
    window.addEventListener("keydown", kick, { once: false, passive: true });
  }
  acquire();
}

export function setScreenWakeLockEnabled(on) {
  enabled = !!on;
  if (enabled) acquire();
  else release();
}
