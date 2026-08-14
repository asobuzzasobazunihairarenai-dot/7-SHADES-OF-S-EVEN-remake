// アプリ内スモークテスト（ユーザー要望2026-08-14「タイトル画面右下に、管理者ログイン時だけ
// 出るスモークテストボタン」）。test/smoke.mjs（Node+Playwright）と同じ考え方を、そのまま今
// 開いている画面（実機・デプロイ先でも）で回せるようにしたもの——CPU戦を開始し「両席とも自動」
// （疑似CPU includeSelf）にして自己対戦させ、コンソールエラー/例外・盤面破損・詰み（ターン無進行）を
// 監視する。「実際にプレイして初めて壊れる」効果エンジンの回帰（#86/#87等）を、手で遊ばずに素早く
// 確認するための開発ツール。
//
// 循環import/TDZ回避（[[circular-import-tdz-and-no-cache-bust]]）: 重い依存（cpu-battle.js/
// admin.js）はボタン押下時に動的importする。state.jsは葉モジュールなので静的importでよい。

import { getState } from "./state.js";
import { markCleanExit } from "./crash-blackbox.js";

const TARGET_TURN = 8; // ここまで進めば健全とみなす
const STALL_MS = 30000; // ターンがこの時間まったく進まなければ「詰み」
const HARD_TIMEOUT_MS = 150000;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 自己対戦を回して結果を返す。onLog(text)で進捗を逐次通知する。
async function runInAppSmokeTest(onLog) {
  const errors = [];
  const origConsoleError = console.error;
  const capture = (msg) => {
    const s = String(msg).slice(0, 300);
    errors.push(s);
    onLog?.("⚠ " + s);
  };
  console.error = (...a) => {
    try { capture(a.map((x) => (typeof x === "string" ? x : (() => { try { return JSON.stringify(x); } catch { return String(x); } })())).join(" ")); } catch {}
    origConsoleError(...a);
  };
  const onErr = (e) => capture("UNCAUGHT: " + (e?.message ?? e));
  const onRej = (e) => capture("REJECTION: " + (e?.reason?.message ?? e?.reason ?? e));
  window.addEventListener("error", onErr);
  window.addEventListener("unhandledrejection", onRej);

  let lastTurn = 0;
  let pass = false;
  let reason = "";
  try {
    const cpu = await import("./cpu-battle.js");
    const admin = await import("./admin.js");
    onLog?.("CPU戦を開始（両席とも自動＝自己対戦）…");
    admin.setPseudoCpuModeEnabled?.(true);
    await cpu.startCpuBattle();
    admin.setPseudoCpuIncludeSelf?.(true); // setup前に：A席も自動化（でないとturn1で停滞する）
    await cpu.runCpuBattleSetup();
    admin.setPseudoCpuIncludeSelf?.(true);

    const start = Date.now();
    let lastProgressAt = Date.now();
    while (true) {
      await wait(1200);
      if (errors.length) { reason = "コンソールエラー/例外を検知"; break; }
      const s = getState();
      const turn = s.turnNumber ?? 0;
      const tokens = Array.isArray(s.tokens) ? s.tokens.length : 0;
      if (tokens < 40) { capture(`盤面破損: tokens=${tokens}`); reason = "盤面が壊れています"; break; }
      let won = false;
      try {
        const pa = await import("./phase-automation.js");
        won = typeof pa.hasAnyoneWon === "function" ? pa.hasAnyoneWon() : false;
      } catch {}
      if (won) { pass = errors.length === 0; reason = `決着（${turn}ターン）`; lastTurn = turn; break; }
      if (turn > lastTurn) {
        lastTurn = turn;
        lastProgressAt = Date.now();
        onLog?.(`ターン ${turn}（${s.turnPlayer}）／盤面 ${tokens}`);
      }
      if (lastTurn >= TARGET_TURN) { pass = errors.length === 0; reason = `${TARGET_TURN}ターン到達`; break; }
      // タブが非表示だとブラウザがタイマーを強くスロットルして進行が極端に遅くなる（自己対戦は
      // タイマー駆動のため）。その間は「詰み」判定のカウントを進めない（誤FAIL防止。テスト中は
      // タブを開いたままにするのが前提だが、うっかり別タブへ行っても失敗扱いにしない）。
      if (document.hidden) lastProgressAt = Date.now();
      if (Date.now() - lastProgressAt > STALL_MS) { reason = `詰み：${STALL_MS / 1000}秒ターンが進みませんでした（${lastTurn}ターンで停止）`; break; }
      if (Date.now() - start > HARD_TIMEOUT_MS) { reason = `タイムアウト（${lastTurn}ターン）`; break; }
    }
  } catch (err) {
    capture("EXCEPTION: " + (err?.message ?? err));
    reason = "実行時エラー";
  } finally {
    console.error = origConsoleError;
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
  }
  return { pass, reason, turnsReached: lastTurn, errors };
}

let panelOpen = false;

// ボタンから呼ぶ。結果パネルを出し、「実行」で自己対戦→結果表示。テストは盤面を作り替えるので、
// 終了後は「タイトルに戻る（再読み込み）」でクリーンに戻す。
export function openSmokeTestPanel() {
  if (panelOpen) return;
  panelOpen = true;

  const backdrop = document.createElement("div");
  backdrop.className = "smoke-test-backdrop";
  const panel = document.createElement("div");
  panel.className = "smoke-test-panel";

  const title = document.createElement("div");
  title.className = "smoke-test-title";
  title.textContent = "🧪 スモークテスト（自己対戦で自動チェック）";
  panel.appendChild(title);

  const desc = document.createElement("div");
  desc.className = "smoke-test-desc";
  desc.textContent = "CPU戦を両席とも自動で回し、エラー・盤面破損・詰み（ターン無進行）を監視します。実行すると今の画面は対局に切り替わります。";
  panel.appendChild(desc);

  const logEl = document.createElement("div");
  logEl.className = "smoke-test-log";
  panel.appendChild(logEl);
  const addLog = (t) => {
    const line = document.createElement("div");
    line.textContent = t;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  };

  const resultEl = document.createElement("div");
  resultEl.className = "smoke-test-result";
  panel.appendChild(resultEl);

  const actions = document.createElement("div");
  actions.className = "smoke-test-actions";
  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "smoke-test-run";
  runBtn.textContent = "▶ 実行";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "smoke-test-close";
  closeBtn.textContent = "閉じる";
  const close = () => {
    backdrop.remove();
    panel.remove();
    panelOpen = false;
  };
  closeBtn.addEventListener("click", close);
  actions.appendChild(runBtn);
  actions.appendChild(closeBtn);
  panel.appendChild(actions);

  runBtn.addEventListener("click", async () => {
    runBtn.disabled = true;
    closeBtn.disabled = true;
    runBtn.textContent = "実行中…";
    resultEl.textContent = "";
    resultEl.className = "smoke-test-result";
    addLog("開始します…");
    const res = await runInAppSmokeTest(addLog);
    resultEl.classList.add(res.pass ? "is-pass" : "is-fail");
    resultEl.textContent = res.pass ? `✅ PASS — ${res.reason}` : `❌ FAIL — ${res.reason}`;
    // テストは盤面を作り替えるので、終わったらタイトルへ戻す導線に差し替える。
    runBtn.remove();
    closeBtn.disabled = false;
    closeBtn.textContent = "🔄 タイトルに戻る（再読み込み）";
    closeBtn.onclick = () => {
      markCleanExit();
      location.reload();
    };
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}
