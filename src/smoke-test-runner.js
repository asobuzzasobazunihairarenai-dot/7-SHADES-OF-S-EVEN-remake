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

// 状態が「動いているか」を見るための軽量な署名（トークンの位置/表裏・山の枚数・ターン/優先権）。
// これが変われば何かしらのアクションが起きた＝進行中。真の詰み（一定時間これが不変）だけを検知する。
function stateActivitySignature(s) {
  try {
    const toks = (s.tokens || [])
      .map((t) => {
        const l = t.location || {};
        return `${t.id}:${l.zone || ""}:${l.row ?? ""}:${l.col ?? ""}:${l.index ?? ""}:${l.side ?? ""}:${l.player ?? ""}:${t.faceUp ? 1 : 0}`;
      })
      .sort()
      .join(",");
    const piles = Object.values(s.piles || {})
      .map((a) => (Array.isArray(a) ? a.length : 0))
      .join(",");
    return `${s.turnNumber ?? ""}|${s.priorityPlayer ?? ""}|${piles}|${toks}`;
  } catch {
    return "";
  }
}

// 自己対戦を回して結果を返す。onLog(text)で進捗を逐次通知する。
// options.runToCompletion=true で、8ターンで止めず「決着（勝敗）まで」丸ごと1局を回す
// （ユーザー要望2026-08-17「スモークテストの強化」。終盤・勝利判定・より多くの効果の組み合わせを
// 網羅する。ランク戦は自動処理エンジン＝このテストが回すエンジンそのものなので、決着まで回せば
// ランク戦のゲームプレイも丸ごと点検できる）。決着まではターン数が読めないためハード上限を延長する。
async function runInAppSmokeTest(onLog, { runToCompletion = false } = {}) {
  const hardTimeoutMs = runToCompletion ? 600000 : HARD_TIMEOUT_MS; // 決着まで＝最大10分
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
    let lastStateSig = "";
    while (true) {
      await wait(1200);
      if (errors.length) { reason = "コンソールエラー/例外を検知"; break; }
      const s = getState();
      const turn = s.turnNumber ?? 0;
      const tokens = Array.isArray(s.tokens) ? s.tokens.length : 0;
      if (tokens < 40) { capture(`盤面破損: tokens=${tokens}`); reason = "盤面が壊れています"; break; }

      // 「詰み」判定は“ターンが進まない”ではなく“状態が全く変化しない”で見る（ユーザー報告2026-08-17:
      // 試練の儀式のような重い効果チェーンで1ターンが30秒以上かかり、進行しているのに誤FAILした）。
      // トークンの位置/表裏・山の枚数・ターン/優先権をまとめた署名が変われば「活動あり」＝タイマー
      // リセット。真の詰み（30秒どのアクションも起きない）だけを検知する。
      const stateSig = stateActivitySignature(s);
      if (stateSig !== lastStateSig) {
        lastStateSig = stateSig;
        lastProgressAt = Date.now();
      }

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
      // 通常モードは8ターン到達で健全とみなして終了。決着までモードは勝敗が出るまで続ける。
      if (!runToCompletion && lastTurn >= TARGET_TURN) { pass = errors.length === 0 && invariantViolations.length === 0; reason = `${TARGET_TURN}ターン到達`; break; }
      // タブが非表示だとブラウザがタイマーを強くスロットルして進行が極端に遅くなる（自己対戦は
      // タイマー駆動のため）。その間は「詰み」判定のカウントを進めない（誤FAIL防止。テスト中は
      // タブを開いたままにするのが前提だが、うっかり別タブへ行っても失敗扱いにしない）。
      if (document.hidden) lastProgressAt = Date.now();
      if (Date.now() - lastProgressAt > STALL_MS) { reason = `詰み：${STALL_MS / 1000}秒どのアクションも起きませんでした（${lastTurn}ターンで停止／盤面が完全に固まっています）`; break; }
      if (Date.now() - start > hardTimeoutMs) { reason = `タイムアウト（${lastTurn}ターン）`; break; }
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
  desc.textContent = "CPU戦を両席とも自動で回し、エラー・盤面破損・不変条件違反・詰み（一定時間まったく状態が変化しない）を監視します。「8ターン点検」は素早い健全性チェック、「決着まで実行」は勝敗が出るまで丸ごと1局回して終盤まで網羅します。実行すると今の画面は対局に切り替わります。";
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

  // 連続実行の設定行（ユーザー要望2026-08-17「何回も連続でテスト回す機能も欲しい」）。
  // 「詰み」等は疑似CPUの反応判断でごくたまに起きる間欠バグなので、まとめて回して再現率を測る。
  const repeatRow = document.createElement("div");
  repeatRow.className = "smoke-test-repeat-row";
  const repeatLabel = document.createElement("label");
  repeatLabel.className = "smoke-test-repeat-label";
  repeatLabel.textContent = "連続実行 ";
  const repeatInput = document.createElement("input");
  repeatInput.type = "number";
  repeatInput.min = "1";
  repeatInput.max = "50";
  repeatInput.value = "5";
  repeatInput.className = "smoke-test-repeat-input";
  repeatLabel.appendChild(repeatInput);
  const repeatUnit = document.createElement("span");
  repeatUnit.textContent = " 回";
  repeatLabel.appendChild(repeatUnit);
  const repeatFullLabel = document.createElement("label");
  repeatFullLabel.className = "smoke-test-repeat-full";
  const repeatFullCheck = document.createElement("input");
  repeatFullCheck.type = "checkbox";
  repeatFullLabel.appendChild(repeatFullCheck);
  repeatFullLabel.appendChild(document.createTextNode(" 各回を決着まで（遅い）"));
  repeatRow.appendChild(repeatLabel);
  repeatRow.appendChild(repeatFullLabel);
  panel.appendChild(repeatRow);

  const actions = document.createElement("div");
  actions.className = "smoke-test-actions";
  const runBtn = document.createElement("button");
  runBtn.type = "button";
  runBtn.className = "smoke-test-run";
  runBtn.textContent = "▶ 8ターン点検";
  // 決着まで丸ごと1局回す（終盤・勝利判定まで網羅。ユーザー要望2026-08-17「スモークテスト強化」）。
  const runFullBtn = document.createElement("button");
  runFullBtn.type = "button";
  runFullBtn.className = "smoke-test-run";
  runFullBtn.textContent = "🏁 決着まで実行";
  const repeatBtn = document.createElement("button");
  repeatBtn.type = "button";
  repeatBtn.className = "smoke-test-run";
  repeatBtn.textContent = "🔁 連続実行";
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
  actions.appendChild(runFullBtn);
  actions.appendChild(repeatBtn);
  actions.appendChild(closeBtn);
  panel.appendChild(actions);

  // 診断情報（全アクションログ＋エラー＋環境）を「コピー／ダウンロード」できるボタンを
  // actions に挿す（末尾だけでは追い切れない詰み対策。ユーザー指摘2026-08-14）。単発・連続の
  // 両方で使う共通ヘルパー。
  const addDiagnosticsButtons = (fullText, tag) => {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "smoke-test-copy";
    const copyLabel = tag ? `📋 ${tag}の診断をコピー` : "📋 診断情報を全部コピー";
    copyBtn.textContent = copyLabel;
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
      setTimeout(() => { copyBtn.textContent = copyLabel; }, 4000);
    });
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.className = "smoke-test-download";
    dlBtn.textContent = tag ? `⬇ ${tag}のログを保存` : "⬇ 全ログをダウンロード";
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
  };

  // テストは盤面を作り替えるので、終わったらタイトルへ戻す導線に差し替える（単発・連続 共通）。
  const swapToReload = () => {
    runBtn.remove();
    runFullBtn.remove();
    repeatBtn.remove();
    repeatRow.remove();
    closeBtn.disabled = false;
    closeBtn.textContent = "🔄 タイトルに戻る（再読み込み）";
    closeBtn.onclick = () => {
      markCleanExit();
      location.reload();
    };
  };

  const runTest = async (options) => {
    runBtn.disabled = true;
    runFullBtn.disabled = true;
    repeatBtn.disabled = true;
    repeatInput.disabled = true;
    closeBtn.disabled = true;
    (options.runToCompletion ? runFullBtn : runBtn).textContent = "実行中…";
    resultEl.textContent = "";
    resultEl.className = "smoke-test-result";
    addLog(options.runToCompletion ? "決着まで実行します…" : "開始します…");
    const res = await runInAppSmokeTest(addLog, options);
    resultEl.classList.add(res.pass ? "is-pass" : "is-fail");
    resultEl.textContent = res.pass ? `✅ PASS — ${res.reason}` : `❌ FAIL — ${res.reason}`;
    addDiagnosticsButtons(await collectFullDiagnostics(res));
    swapToReload();
  };

  // 連続実行（ユーザー要望2026-08-17）。指定回数まとめて回して再現率を測る（間欠バグ検出）。
  // 「⏹ 停止」で途中打ち切り。最初に失敗した回の診断情報だけコピー可能にする（原因究明用）。
  let cancelRepeat = false;
  const runRepeated = async () => {
    const times = Math.max(1, Math.min(50, parseInt(repeatInput.value, 10) || 5));
    const toCompletion = repeatFullCheck.checked;
    runBtn.disabled = true;
    runFullBtn.disabled = true;
    repeatInput.disabled = true;
    repeatFullCheck.disabled = true;
    closeBtn.disabled = true;
    resultEl.textContent = "";
    resultEl.className = "smoke-test-result";
    cancelRepeat = false;
    // 実行中は連続ボタンを「停止」に転用する。
    repeatBtn.textContent = "⏹ 停止";
    repeatBtn.onclick = () => {
      cancelRepeat = true;
      repeatBtn.disabled = true;
      repeatBtn.textContent = "停止中…";
    };
    addLog(`🔁 連続実行を開始（${times}回・${toCompletion ? "各回 決着まで" : "各回 8ターン点検"}）…`);
    const results = [];
    let firstFailure = null;
    let done = 0;
    for (let i = 1; i <= times; i++) {
      if (cancelRepeat) { addLog(`⏹ ${done}回で停止しました。`); break; }
      addLog(`━━━━ ${i}/${times}回目 ━━━━`);
      const res = await runInAppSmokeTest(addLog, { runToCompletion: toCompletion });
      results.push(res);
      done = i;
      addLog(`${i}回目: ${res.pass ? "✅PASS" : "❌FAIL"} — ${res.reason}`);
      if (!res.pass && !firstFailure) firstFailure = res;
      resultEl.classList.remove("is-pass", "is-fail");
      const passSoFar = results.filter((r) => r.pass).length;
      resultEl.textContent = `進行中… ${passSoFar}/${results.length} PASS`;
      await wait(600);
    }
    const passCount = results.filter((r) => r.pass).length;
    const allPass = results.length > 0 && passCount === results.length;
    resultEl.classList.add(allPass ? "is-pass" : "is-fail");
    resultEl.textContent = `${passCount}/${results.length} 回 PASS`;
    addLog(`🔁 連続実行 終了: ${passCount}/${results.length} 回 PASS`);
    // 最初に失敗した回の診断情報だけコピー可能にする（複数失敗しても代表1件で足りることが多い）。
    if (firstFailure) {
      addLog("❌ 失敗があった回の診断情報を下のボタンからコピーできます。");
      addDiagnosticsButtons(await collectFullDiagnostics(firstFailure), "失敗回");
    }
    swapToReload();
  };

  runBtn.addEventListener("click", () => runTest({ runToCompletion: false }));
  runFullBtn.addEventListener("click", () => runTest({ runToCompletion: true }));
  repeatBtn.addEventListener("click", runRepeated);

  document.body.appendChild(panel);
}
