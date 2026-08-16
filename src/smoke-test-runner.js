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
import { checkInvariants, countCards } from "./game-invariants.js";
import { logAction } from "./action-log.js";

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
  // 不変条件違反（続き164）。ゲームが止まらなくても“状態が壊れている”系のバグを毎ポーリング
  // 検査して集める。同じ違反（code＋detail）は1度だけ記録（1.2秒ごとにスパムしない）。
  const invariantViolations = [];
  const seenViolations = new Set();
  let baselineCardCount = null;
  try {
    const cpu = await import("./cpu-battle.js");
    const admin = await import("./admin.js");

    // タイトル（オープニング）画面を先に閉じてから対局を始める。ボタンはタイトル画面から
    // 押されるが、opening-screen.jsのclose()はモジュール内クロージャで外から呼べないため、
    // 同等のこと（オーバーレイを隠す＋body classを外す）をここで行う。これをしないと、
    // ①盤面がオープニングの裏に隠れて効果音だけ鳴る（見えない）②到達選択や接触などの
    // モーダルがオープニングの背後に出て、自己対戦がそこで止まる（ユーザー報告: turn 4で詰み）。
    try {
      document.body.classList.remove("opening-screen-active");
      const opening = document.getElementById("opening-screen");
      if (opening) opening.style.display = "none";
      // ホーム画面から起動された場合にも隠す（今は管理者用ボタンがタイトルにしか出ないが保険）。
      const home = document.getElementById("home-screen-overlay") || document.getElementById("home-screen");
      if (home) home.style.display = "none";
    } catch {}

    onLog?.("CPU戦を開始（両席とも自動＝自己対戦）…");
    admin.setPseudoCpuModeEnabled?.(true);
    await cpu.startCpuBattle();
    admin.setPseudoCpuIncludeSelf?.(true); // setup前に：A席も自動化（でないとturn1で停滞する）
    await cpu.runCpuBattleSetup();
    admin.setPseudoCpuIncludeSelf?.(true);

    // 設定直後のカード総数を baseline に記録（以後、総数が変われば「カードが増減した」＝バグ）。
    try {
      baselineCardCount = countCards(getState());
      onLog?.(`不変条件チェック開始（カード総数 ${baselineCardCount}）`);
    } catch {}

    const start = Date.now();
    let lastProgressAt = Date.now();
    while (true) {
      await wait(1200);
      if (errors.length) { reason = "コンソールエラー/例外を検知"; break; }
      const s = getState();
      const turn = s.turnNumber ?? 0;
      const tokens = Array.isArray(s.tokens) ? s.tokens.length : 0;
      if (tokens < 40) { capture(`盤面破損: tokens=${tokens}`); reason = "盤面が壊れています"; break; }

      // 不変条件チェック（続き164）: 破れた条件を集めて診断ログにも残す。チェッカー自身の
      // 例外で自己対戦を止めないよう try で囲む。
      try {
        const viols = checkInvariants(s, { baselineCardCount });
        for (const vio of viols) {
          const sig = vio.code + "|" + (vio.detail ? JSON.stringify(vio.detail) : vio.msg);
          if (seenViolations.has(sig)) continue;
          seenViolations.add(sig);
          const entry = { turn, ...vio };
          invariantViolations.push(entry);
          try { logAction("diag-invariant-violation", entry); } catch {}
          onLog?.(`❗不変条件違反[${vio.code}] T${turn}: ${vio.msg}`);
        }
      } catch {}

      let won = false;
      try {
        const pa = await import("./phase-automation.js");
        won = typeof pa.hasAnyoneWon === "function" ? pa.hasAnyoneWon() : false;
      } catch {}
      if (won) { pass = errors.length === 0 && invariantViolations.length === 0; reason = `決着（${turn}ターン）`; lastTurn = turn; break; }
      if (turn > lastTurn) {
        lastTurn = turn;
        lastProgressAt = Date.now();
        onLog?.(`ターン ${turn}（${s.turnPlayer}）／盤面 ${tokens}`);
      }
      if (lastTurn >= TARGET_TURN) { pass = errors.length === 0 && invariantViolations.length === 0; reason = `${TARGET_TURN}ターン到達`; break; }
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
  // 不変条件違反があれば、たとえターン到達/決着していても FAIL 扱いにし、理由に件数を添える。
  if (invariantViolations.length) {
    const codes = [...new Set(invariantViolations.map((x) => x.code))].join(", ");
    reason = `${reason}／不変条件違反 ${invariantViolations.length}件（${codes}）`;
    onLog?.(`❗不変条件違反が合計 ${invariantViolations.length}件（${codes}）— 状態が壊れています`);
  }
  // 失敗（特に「詰み」）した時は、どこで止まったかを突き止められるよう、アクションログの
  // 末尾を出す（Node版 test/smoke.mjs と同じ診断）。詰みは疑似CPUの反応判断でごくたまに
  // 起きるため、最後の数十行から「どのカード効果/接触/選択で止まったか」を読み取れる。
  if (!pass) {
    try {
      const al = await import("./action-log.js");
      const tail = (al.getActionLogText?.() ?? "").split("\n").filter(Boolean).slice(-25);
      if (tail.length) {
        onLog?.("──── アクションログ末尾（診断用） ────");
        for (const line of tail) onLog?.(line);
      }
    } catch {}
  }
  return { pass, reason, turnsReached: lastTurn, errors, invariantViolations };
}

// 詰みの原因究明用に「全アクションログ＋エラー＋結果＋環境情報」を1つのテキストにまとめる。
// 末尾だけだと到達コンボ・接触の連鎖など“数十手前から始まる”原因を追い切れないことがあるため、
// 全ログを丸ごと渡せるようにする（ユーザー指摘2026-08-14）。
async function collectFullDiagnostics(res) {
  let logText = "";
  try {
    const al = await import("./action-log.js");
    logText = al.getActionLogText?.() ?? "";
  } catch {}
  let version = "";
  try {
    version = (await import("./app-version.js")).APP_VERSION ?? "";
  } catch {}
  const header = [
    "==== スモークテスト診断情報 ====",
    `日時: ${new Date().toISOString()}`,
    version ? `バージョン: ${version}` : null,
    `結果: ${res?.pass ? "PASS" : "FAIL"} — ${res?.reason ?? ""}`,
    `到達ターン: ${res?.turnsReached ?? "?"}`,
    `画面: ${window.innerWidth}x${window.innerHeight} / hidden=${document.hidden}`,
    `UA: ${navigator.userAgent}`,
    "",
    "---- エラー/例外 ----",
    (res?.errors && res.errors.length) ? res.errors.join("\n") : "（なし）",
    "",
    "---- 不変条件違反（状態の壊れ） ----",
    (res?.invariantViolations && res.invariantViolations.length)
      ? res.invariantViolations.map((x) => `[T${x.turn}] ${x.code}: ${x.msg}`).join("\n")
      : "（なし）",
    "",
    "---- アクションログ（全件） ----",
  ].filter((x) => x !== null).join("\n");
  return header + "\n" + logText;
}

let panelOpen = false;

// ボタンから呼ぶ。結果パネルを出し、「実行」で自己対戦→結果表示。テストは盤面を作り替えるので、
// 終了後は「タイトルに戻る（再読み込み）」でクリーンに戻す。
export function openSmokeTestPanel() {
  if (panelOpen) return;
  panelOpen = true;

  // ユーザー要望2026-08-14: 全画面バックドロップは廃止（盤面を見られるように）。パネルは
  // タイトルバーを掴んでドラッグ移動できる浮遊ウィンドウ。既定位置はCSSで左上。
  const panel = document.createElement("div");
  panel.className = "smoke-test-panel";

  const title = document.createElement("div");
  title.className = "smoke-test-title";
  title.textContent = "🧪 スモークテスト（ドラッグで移動可）";
  panel.appendChild(title);

  // タイトルバーのドラッグでパネルを移動（left/topを直接書き換え）。ポインタキャプチャで
  // ボタンの外へ出ても追従する。
  (() => {
    let dragging = false;
    let startX = 0, startY = 0, baseLeft = 0, baseTop = 0;
    title.addEventListener("pointerdown", (e) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      baseLeft = rect.left;
      baseTop = rect.top;
      startX = e.clientX;
      startY = e.clientY;
      panel.style.left = baseLeft + "px";
      panel.style.top = baseTop + "px";
      title.setPointerCapture?.(e.pointerId);
      e.preventDefault();
    });
    title.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      let nl = baseLeft + (e.clientX - startX);
      let nt = baseTop + (e.clientY - startY);
      // 画面外に出しすぎない（タイトルバーは常に掴める位置に留める）。
      nl = Math.max(-panel.offsetWidth + 60, Math.min(window.innerWidth - 60, nl));
      nt = Math.max(0, Math.min(window.innerHeight - 40, nt));
      panel.style.left = nl + "px";
      panel.style.top = nt + "px";
    });
    const endDrag = (e) => { dragging = false; title.releasePointerCapture?.(e.pointerId); };
    title.addEventListener("pointerup", endDrag);
    title.addEventListener("pointercancel", endDrag);
  })();

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

    // 診断情報（全アクションログ＋エラー＋環境）をまるごと渡せるように、コピー／ダウンロード
    // ボタンを出す（末尾だけでは追い切れない詰み対策。ユーザー指摘2026-08-14）。詰みの原因究明に
    // 特に有用なので、FAIL時は目立たせる。PASS時も一応残す（後から確認したい時のため）。
    const fullText = await collectFullDiagnostics(res);
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "smoke-test-copy";
    copyBtn.textContent = "📋 診断情報を全部コピー";
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(fullText);
        copyBtn.textContent = "✅ コピーしました";
      } catch {
        // クリップボード権限が無い環境向けのフォールバック: テキストエリアで選択→手動コピー。
        const ta = document.createElement("textarea");
        ta.value = fullText;
        ta.className = "smoke-test-copy-fallback";
        panel.insertBefore(ta, actions);
        ta.focus();
        ta.select();
        copyBtn.textContent = "↑ を選択してコピーしてください";
      }
      setTimeout(() => { copyBtn.textContent = "📋 診断情報を全部コピー"; }, 4000);
    });
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "smoke-test-download";
    dlBtn.textContent = "⬇ 全ログをダウンロード";
    dlBtn.addEventListener("click", () => {
      const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smoke-test-${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    actions.insertBefore(copyBtn, closeBtn);
    actions.insertBefore(dlBtn, closeBtn);

    // テストは盤面を作り替えるので、終わったらタイトルへ戻す導線に差し替える。
    runBtn.remove();
    closeBtn.disabled = false;
    closeBtn.textContent = "🔄 タイトルに戻る（再読み込み）";
    closeBtn.onclick = () => {
      markCleanExit();
      location.reload();
    };
  });

  document.body.appendChild(panel);
}
