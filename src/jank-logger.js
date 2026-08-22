// カクつき（重いフレーム）検知ロガー（続き243。ユーザー要望2026-08-22「ちらつきをログに
// 残して確認できないか」）。GPUの純粋なz-fighting（ピクセルがちらつくタイプ）は映らないが、
// 「再描画の暴走・合成の詰まり」が原因の“不規則なちらつき/スタッター”は、フレーム時間の
// 急増（＝カクつき）として現れることが多い。requestAnimationFrame の間隔を測り、しきい値を
// 超えたフレームを action-log に残す（後でユーザーが「📜 アクションログ」からコピーして共有）。
//
// 本編（通常プレイ）には負荷をかけないため、rAFループは「?jank=1 / ?iso=1 / ?flat=1、または
// 2D表示が保存済み」の時だけ開始する（＝ちらつきを調べている状況でのみ動く）。
import { logAction } from "./action-log.js";

const THRESHOLD_MS = 45; // 60fps=16.7ms。これを超える＝1フレーム以上ドロップ＝体感カクつき。
const LOG_THROTTLE_MS = 500; // ログ間引き（長フレームが続いても0.5秒に1回だけ記録）。

export function initJankLogger() {
  let on = false;
  try {
    const p = new URLSearchParams(location.search);
    on =
      p.get("jank") === "1" ||
      p.get("iso") === "1" ||
      p.get("flat") === "1" ||
      localStorage.getItem("so7-2d-mode") === "1";
  } catch (e) {
    on = false;
  }
  if (!on) return;
  if (typeof requestAnimationFrame !== "function" || typeof performance === "undefined") return;

  let last = performance.now();
  let lastLog = 0;
  let worst = 0;
  let longFrames = 0;
  let total = 0;

  function tick(now) {
    const dt = now - last;
    last = now;
    total++;
    if (dt > THRESHOLD_MS) {
      longFrames++;
      if (dt > worst) worst = dt;
      if (now - lastLog > LOG_THROTTLE_MS) {
        lastLog = now;
        try {
          logAction("diag-jank", {
            frameMs: Math.round(dt),
            worstMs: Math.round(worst),
            longFrames,
            totalFrames: total,
          });
        } catch (e) {
          /* noop */
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  try {
    logAction("diag-jank", { started: true, thresholdMs: THRESHOLD_MS });
  } catch (e) {
    /* noop */
  }
}
