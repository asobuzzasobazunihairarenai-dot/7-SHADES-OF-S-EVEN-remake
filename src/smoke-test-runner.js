// アプリ内スモークテスト（ユーザー要望2026-08-14「タイトル画面右下に、管理者ログイン時だけ
// 出るスモークテストボタン」）。test/smoke.mjs（Node+Playwright）と同じ考え方を、そのまま今
// 開いている画面（実機・デプロイ先でも）で回せるようにしたもの——CPU戦を開始し「両席とも自動」
// （疑似CPU includeSelf）にして自己対戦させ、コンソールエラー/例外・盤面破損・詰み（ターン無進行）を
// 監視する。「実際にプレイして初めて壊れる」効果エンジンの回帰（#86/#87等）を、手で遊ばずに素早く
// 確認するための開発ツール。
//
// 循環import/TDZ回避（[[circular-import-tdz-and-no-cache-bust]]）: 重い依存（cpu-battle.js/
// admin.js）はボタン押下時に動的importする。state.jsは葉モジュールなので静的importでよい。

import { getState, isOnlineMode } from "./state.js";
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
// 対戦終了後のモーダル（勝利・個人結果・ランク結果・通貨・ポストゲーム）を静かに片付ける。
// 連続実行の各ラウンド開始時に呼び、前ラウンドのモーダルが盤面を覆って観戦を妨げないようにする。
async function clearEndgameModals() {
  try {
    const vic = await import("./victory.js");
    vic.forceCloseVictoryModal?.(); // 勝利モーダル＋その背景を、エピローグ連鎖を起こさず消す
  } catch {}
  // その他のエピローグモーダル（多くはオンライン専用だが保険で）をidで消し、取り残された
  // 全画面の背景（createBackdrop製＝子要素のない fixed div）も一緒に掃く。ラウンド開始時＝
  // 盤面を作り直す直前なので、この時点での背景掃きは安全。
  const ids = [
    "victory-modal", "match-personal-result-modal", "ranked-result-modal", "currency-award-modal",
    "rank-up-modal", "ranked-season-reward-modal", "post-game-panel",
  ];
  // 同一idが複数あっても（万一の重複）全部消えるよう querySelectorAll で掃く。
  for (const id of ids) document.querySelectorAll("#" + id).forEach((el) => el.remove());
  try {
    for (const el of Array.from(document.body.children)) {
      if (el.tagName !== "DIV" || el.id) continue;
      const cs = getComputedStyle(el);
      if (cs.position === "fixed" && el.children.length === 0 && (parseInt(cs.zIndex, 10) || 0) >= 10000) {
        el.remove();
      }
    }
  } catch {}
}

async function runInAppSmokeTest(onLog, { runToCompletion = false, playerCount = 2 } = {}) {
  const pc = playerCount === 3 || playerCount === 4 ? playerCount : 2;
  // 3-4人は2人より1ターンの手番数が多く1局が長い（続き226）。8ターン点検の制限時間を人数に比例
  // させて、3-4人でも8ターン到達の猶予を確保する（決着まで＝最大10分は据え置き）。STALL_MS(30秒
  // 無活動＝詰み)は1手あたりの尺なので人数に依らず据え置き。
  const hardTimeoutMs = runToCompletion ? 600000 : Math.round(HARD_TIMEOUT_MS * (pc / 2));
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
  // 続き223: マスチェンジ等の入れ替え（SWAP_POSITION）は2手を順に適用するため、その間だけ
  // 両駒が片方のマスに乗る「一過性のpiece-overlap」が必ず生じる（＝状態の壊れではない）。
  // 単発ポーリングで拾うと誤検知になるので、同じ違反が連続2ポーリング（≒2.4秒）続いた時だけ
  // 「本物の壊れ」として記録する（詰み時は違反が居座り続けるので必ず捕捉できる）。
  let prevPollSigs = new Set();
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

    // 前ラウンドの勝利/結果モーダルを片付ける（ユーザー報告2026-08-18「連続実行で勝利モーダルや
    // 『あなたの勝ち』モーダルが消えず、テスト風景を観戦できない」）。勝利モーダルは実プレイ用に
    // 自動クローズを撤去してある（✕/背景クリックのみ）ため、CPU自己対戦では誰も閉じず残り続けて
    // 次ラウンドの盤面を覆ってしまう。onCloseの連鎖（通貨/ランク/個人結果）は起こさず静かに消す。
    await clearEndgameModals();

    onLog?.(`CPU戦を開始（${pc}人・全席とも自動＝自己対戦）…`);
    admin.setPseudoCpuModeEnabled?.(true);
    await cpu.startCpuBattle(pc);
    admin.setPseudoCpuIncludeSelf?.(true); // setup前に：A席も自動化（でないとturn1で停滞する）
    await cpu.runCpuBattleSetup({ count: pc });
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
        const nowSigs = new Set();
        for (const vio of viols) {
          const sig = vio.code + "|" + (vio.detail ? JSON.stringify(vio.detail) : vio.msg);
          nowSigs.add(sig);
          if (seenViolations.has(sig)) continue;
          // 連続2ポーリング続いた違反だけ本物とみなす（入れ替えの一過性overlap誤検知を防ぐ）。
          if (!prevPollSigs.has(sig)) continue;
          seenViolations.add(sig);
          const entry = { turn, ...vio };
          invariantViolations.push(entry);
          try { logAction("diag-invariant-violation", entry); } catch {}
          onLog?.(`❗不変条件違反[${vio.code}] T${turn}: ${vio.msg}`);
        }
        prevPollSigs = nowSigs;
      } catch {}

      let won = false;
      try {
        const vic = await import("./victory.js");
        won = typeof vic.hasAnyoneWon === "function" ? vic.hasAnyoneWon() : false;
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

// オンライン対戦の監視モード（レベル1。ユーザー相談2026-08-17「2ブラウザでスモークを回して
// オンライン特有のバグを拾いたい」）。ローカルスモークと違い、対局は開始しない／盤面を作り替え
// ない——既に2ブラウザで「タイマー＋疑似CPU」を有効にして始めたオンライン対戦に“この画面だけ”を
// アタッチして、自クライアント側のエラー・詰み・不変条件違反を監視する。オンライン特有の経路
// （Edge Functionのreduce・broadcast同期・version_conflict・オンライン版ゲート侵攻modal・
// 優先権同期・ランク結果反映）は、この「実際に通信させて片側を監視」でしか踏めない。
// 各ブラウザで押せば両視点から監視できる。shouldStop() が true を返したら中断する。
const ONLINE_STALL_MS = 90000; // オンラインはネット遅延＋重い効果ターンがあるためローカルより緩め
const ONLINE_HARD_TIMEOUT_MS = 20 * 60 * 1000; // 監視は最長20分（決着しなくても異常なしなら終了）
const ONLINE_WAIT_START_MS = 5 * 60 * 1000; // 対局開始をこの時間まで待つ

async function runOnlineSmokeMonitor(onLog, shouldStop) {
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

  let pass = false;
  let reason = "";
  let lastTurn = 0;
  const invariantViolations = [];
  const seenViolations = new Set();
  try {
    // このクライアントの自席も自動化しておく（部屋が疑似CPUで開始されていれば続き108で既に
    // includeSelf は自動ONだが、念のための保険。無害＝二重に設定しても同じ）。
    try {
      const admin = await import("./admin.js");
      admin.setPseudoCpuIncludeSelf?.(true);
    } catch {}
    const online = await import("./online.js");
    const tt = await import("./turn-timer.js");
    const selfSeat = () => { try { return online.getSelfSeat?.(); } catch { return undefined; } };

    onLog?.("オンライン対戦の開始を待っています…");
    onLog?.("（2ブラウザで『⏳ターンタイマー』＋『🤖疑似CPU』の両方を有効にした部屋を作成→参加→開始してください）");
    const waitStart = Date.now();
    while (!(isOnlineMode() && getState().turnPlayer)) {
      if (shouldStop()) { reason = "監視を停止しました（対局開始前）"; pass = true; return { pass, reason, turnsReached: 0, errors, invariantViolations }; }
      if (Date.now() - waitStart > ONLINE_WAIT_START_MS) {
        reason = "オンライン対戦が始まりませんでした（5分待機）";
        return { pass: false, reason, turnsReached: 0, errors, invariantViolations };
      }
      await wait(1000);
    }
    onLog?.(`オンライン対戦を検知（自分の席=${selfSeat() ?? "?"}）。監視を開始します。`);
    // タイトル画面（HUERISE）のまま浮いているスモークパネルから開始した場合、通常の
    // 「オンラインで続ける」ボタン（close()経由）を通らないためオープニング画面が閉じず、
    // 盤面が背後に隠れてしまう（ユーザー報告2026-08-17）。対局を検知したら明示的に閉じる。
    try { (await import("./opening-screen.js")).forceCloseOpeningScreen?.(); } catch {}
    // 自動プレイの前提（この席が疑似CPUで駆動される＋タイマー有効）を確認して、満たさなければ警告。
    const willAutoPlay = !!tt.isPseudoCpuTarget?.(selfSeat());
    const timerOn = !!tt.isTurnTimerEnabled?.();
    if (!willAutoPlay || !timerOn) {
      onLog?.("⚠ この画面は自動プレイ条件を満たしていません（部屋を『タイマー＋疑似CPU』有効で開始する必要があります）。進行が止まる場合はこの設定を確認してください。");
    }

    const start = Date.now();
    let lastProgressAt = Date.now();
    let lastStateSig = "";
    while (true) {
      await wait(1500);
      if (shouldStop()) { reason = `監視を停止しました（${lastTurn}ターンまで異常なし）`; pass = errors.length === 0 && invariantViolations.length === 0; break; }
      if (!isOnlineMode()) { reason = `オンライン対戦から抜けました（${lastTurn}ターンまで異常なし）`; pass = errors.length === 0 && invariantViolations.length === 0; break; }
      if (errors.length) { reason = "コンソールエラー/例外を検知"; break; }
      const s = getState();
      const turn = s.turnNumber ?? 0;
      const tokens = Array.isArray(s.tokens) ? s.tokens.length : 0;
      if (tokens < 40) { capture(`盤面破損: tokens=${tokens}`); reason = "盤面が壊れています"; break; }

      const stateSig = stateActivitySignature(s);
      if (stateSig !== lastStateSig) { lastStateSig = stateSig; lastProgressAt = Date.now(); }

      // 不変条件（続き164）。オンラインは各クライアントが“マスク済み”の状態しか見えない
      // （相手の手札・裏向きカードの中身がnull／山は枚数だけ）ため、カード総数の保存は検査
      // できない＝baselineCardCount を渡さない（構造チェックのみ）。渡さなければ card-conservation は
      // 自動でスキップされ、unknown-cardid は null をスキップ・lock-color はロックが常に公開のため安全。
      try {
        const viols = checkInvariants(s);
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
        const vic = await import("./victory.js");
        won = typeof vic.hasAnyoneWon === "function" ? vic.hasAnyoneWon() : false;
      } catch {}
      if (won) { pass = errors.length === 0 && invariantViolations.length === 0; reason = `決着（${turn}ターン）`; lastTurn = turn; break; }
      if (turn > lastTurn) {
        lastTurn = turn;
        lastProgressAt = Date.now();
        onLog?.(`ターン ${turn}（${s.turnPlayer}）／盤面 ${tokens}`);
      }
      if (document.hidden) lastProgressAt = Date.now();
      if (Date.now() - lastProgressAt > ONLINE_STALL_MS) {
        reason = `詰み：${ONLINE_STALL_MS / 1000}秒どのアクションも起きませんでした（${lastTurn}ターン。タイマー/疑似CPUが無効か、どちらかのクライアントが固まっている可能性）`;
        break;
      }
      if (Date.now() - start > ONLINE_HARD_TIMEOUT_MS) {
        reason = `監視タイムアウト（${lastTurn}ターン、異常なし）`;
        pass = errors.length === 0 && invariantViolations.length === 0;
        break;
      }
    }
  } catch (err) {
    capture("EXCEPTION: " + (err?.message ?? err));
    reason = "実行時エラー";
  } finally {
    console.error = origConsoleError;
    window.removeEventListener("error", onErr);
    window.removeEventListener("unhandledrejection", onRej);
  }
  if (invariantViolations.length) {
    const codes = [...new Set(invariantViolations.map((x) => x.code))].join(", ");
    reason = `${reason}／不変条件違反 ${invariantViolations.length}件（${codes}）`;
    onLog?.(`❗不変条件違反が合計 ${invariantViolations.length}件（${codes}）— 状態が壊れています`);
  }
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

// ワンタッチ・オンライン監視（レベル2。ユーザー要望2026-08-17「手動セットアップが面倒／疑似CPU
// チェックが見当たらない。ワンタッチ実装した方が早い」）。各ブラウザでボタンを押すだけで、
// ①（未ログインなら）ゲストログイン ②共通の“スモーク部屋”を探して参加 or 作成して相手を待つ
// ③2人揃ったらホストが「タイマー＋疑似CPU」有効で自動開始 ④対局開始を検知したら
// runOnlineSmokeMonitor で監視、まで面倒を見る。手動での部屋作成・チェックボックス操作は不要。
// 2つのブラウザ（別ブラウザ or シークレットでゲスト2つ）でそれぞれ押せば、勝手にマッチして
// 自己対戦しながら両視点を監視できる。
const SMOKE_ROOM_NAME = "SMOKE-AUTO-TEST"; // 共通の合言葉部屋名（20字以内・ASCIIで完全一致を確実に）
const ONLINE_MATCH_WAIT_MS = 5 * 60 * 1000; // マッチ成立をこの時間まで待つ（全体の締め切り）
// 1回の試行で2人揃うのをこの時間まで待つ。短いと両ブラウザが同じ周期で部屋を作り直して
// すれ違う“ライブロック”になるため、長めに取って部屋を安定させ、合流ロジックで収束させる。
const MATCH_ATTEMPT_FIND2_MS = 120000;
const MATCH_ATTEMPT_START_MS = 30000; // 1回の試行で対局が始まるのをこの時間まで待つ

// スモークの後始末: 今いる部屋を離れる。対局が既に始まっている(status<>open)と so7_leave_room は
// 座席を残す（再開用の仕様）ため、SMOKE-AUTO-TEST 部屋が「進行中の対局」に残り続ける（ユーザー
// 報告2026-08-17「抜けるボタンを押しても消えない」）。そこで captured gameId を force 付きで強制
// 削除して確実に消す。
async function smokeLeaveCurrent(online) {
  let gid = null;
  try { gid = online.getCurrentGameId?.() ?? null; } catch { /* noop */ }
  try { await online.leaveGame(); } catch { /* noop */ }
  if (gid) { try { await online.leaveGameById(gid, true); } catch { /* noop */ } }
}

// 前回の中途半端な終了で「進行中の対局」に残った SMOKE-AUTO-TEST 部屋を全て強制削除する。
async function cleanupLingeringSmokeRooms(online) {
  try {
    const active = await online.getMyActiveGames();
    for (const g of active) {
      if (g && g.name === SMOKE_ROOM_NAME) {
        try { await online.leaveGameById(g.id, true); } catch { /* noop */ }
      }
    }
  } catch { /* noop */ }
}

// 詳細ログ（ユーザー要望2026-08-17「原因が分かるようにログを仕込んでください」）。
// listOpenRooms が返す SMOKE 部屋の一覧・人数・自分/相手の別・各操作の成否をすべて出す。
function shortId(id) { return id == null ? "?" : String(id).slice(0, 6); }
function dumpSmokeRooms(rooms, myGameId, myId, owners) {
  const smoke = rooms.filter((r) => r.name === SMOKE_ROOM_NAME);
  if (smoke.length === 0) return "SMOKE部屋: 0件";
  return "SMOKE部屋: " + smoke.map((r) => {
    const mine = r.id === myGameId ? "★自分の部屋" : "";
    let own = "";
    if (owners && owners[r.id]) own = owners[r.id] === myId ? "(主=自分)" : `(主=${shortId(owners[r.id])})`;
    return `[${shortId(r.id)} mc:${r.member_count}${mine ? " " + mine : ""}${own}]`;
  }).join(" ");
}

// 1回のマッチ試行: 部屋を探す/作る → 2人揃うのを待つ → ホストなら開始 → 対局開始を待つ。
// 開始できたら {status:"started"}、この部屋がダメ（時間内に始まらない＝前回の残り・ゴースト席の
// 可能性）なら {status:"retry", failedRoomId}、停止/致命は {status:"stop"|"fatal"}。
// failedRooms: 直前に「開始しなかった」部屋idの集合（同じゴースト部屋へ即再入して無限ループするのを防ぐ）。
async function attemptOneTouchMatch(online, onLog, shouldStop, failedRooms, myId) {
  const dbg = (m) => onLog?.("🔎 " + m);
  // 2) スモーク部屋を探す or 作る。listOpenRooms はサーバーの stale-room 掃除も兼ねる
  //    （ゴースト席＝ハートビートが止まった前回の席は数十秒でここで刈られる）。
  let rooms = [];
  try { rooms = await online.listOpenRooms(); } catch (e) { dbg("listOpenRooms失敗: " + (e?.message ?? e)); rooms = []; }
  dbg(`一覧(${rooms.length}件中) ` + dumpSmokeRooms(rooms, null, myId));
  if (failedRooms.size > 0) dbg("除外中(失敗済み): " + [...failedRooms].map(shortId).join(","));
  const waiting = rooms
    .filter((r) => r.name === SMOKE_ROOM_NAME && r.member_count === 1 && !failedRooms.has(r.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1)); // idの小さい方を優先（相手側と決定的に一致させる）
  let gameId, amHost;
  if (waiting.length > 0) {
    dbg(`待機中の部屋 [${shortId(waiting[0].id)}] に参加します…`);
    onLog?.("待機中のスモーク部屋に参加します…");
    try { await online.joinRoom(waiting[0].id); }
    catch (e) { dbg(`joinRoom(${shortId(waiting[0].id)})失敗: ` + (e?.message ?? e)); return { status: "retry", failedRoomId: waiting[0].id }; }
    gameId = online.getCurrentGameId();
    amHost = false;
    dbg(`参加完了 現在の部屋=[${shortId(gameId)}]`);
  } else {
    onLog?.("スモーク部屋を作成して相手を待ちます…（もう1つのブラウザでも『🌐 オンライン監視』を押してください）");
    gameId = await online.createRoom(SMOKE_ROOM_NAME, null); // 作成すると自動で入室する
    amHost = true;
    dbg(`部屋作成 [${shortId(gameId)}]（自分がホスト）`);
  }

  // 3) 2人揃うまで待つ。二重作成（両ブラウザがほぼ同時に作成）に備え、ホストは他に待機中の
  //    スモーク部屋（idが自分より小さく、直前に失敗していない方）があればそちらへ合流して収束させる。
  const findStart = Date.now();
  let pollN = 0;
  while (true) {
    if (shouldStop()) return { status: "stop", reason: "停止しました（相手待ち）" };
    if (Date.now() - findStart > MATCH_ATTEMPT_FIND2_MS) { dbg(`2人待ちタイムアウト（部屋[${shortId(gameId)}]は開始せず）`); return { status: "retry", failedRoomId: gameId }; }
    let count = 1;
    try { count = await online.getMemberCount(gameId); } catch (e) { dbg(`getMemberCount(${shortId(gameId)})失敗: ` + (e?.message ?? e)); count = 1; }
    pollN++;
    if (count >= 2) { dbg(`部屋[${shortId(gameId)}] 人数=${count} → マッチ成立`); break; }
    if (amHost) {
      let rs = [];
      try { rs = await online.listOpenRooms(); } catch (e) { dbg("listOpenRooms(待機中)失敗: " + (e?.message ?? e)); rs = []; }
      // 相手の部屋が見えているか毎回ダンプ（原因究明用）。所有者も引く（同一/別アカウント判定）。
      const smokeRooms = rs.filter((r) => r.name === SMOKE_ROOM_NAME);
      const owners = {};
      for (const r of smokeRooms) { try { owners[r.id] = await online.getRoomOwnerId(r.id); } catch {} }
      dbg(`待機${pollN}回目 人数=${count} / ` + dumpSmokeRooms(rs, gameId, myId, owners));
      const smaller = smokeRooms
        .filter((r) => r.member_count === 1 && r.id !== gameId && r.id < gameId && !failedRooms.has(r.id))
        .sort((a, b) => (a.id < b.id ? -1 : 1))[0];
      if (smaller) {
        dbg(`より小さいid [${shortId(smaller.id)}] があるので合流します`);
        onLog?.("別のスモーク部屋が見つかったので合流します…");
        await online.leaveGame().catch(() => {});
        try { await online.joinRoom(smaller.id); }
        catch (e) { dbg(`合流joinRoom(${shortId(smaller.id)})失敗: ` + (e?.message ?? e)); return { status: "retry", failedRoomId: smaller.id }; }
        gameId = online.getCurrentGameId();
        amHost = false;
        dbg(`合流完了 現在の部屋=[${shortId(gameId)}]`);
      }
    }
    await wait(2000);
  }

  // 4) ホスト（＝最初に入室した人。getRoomHostInfoが決定的に1人だけtrueにする）が自動開始。
  let hostInfo = { amIHost: false };
  try { hostInfo = await online.getRoomHostInfo(); } catch (e) { dbg("getRoomHostInfo失敗: " + (e?.message ?? e)); }
  dbg(`ホスト判定: amIHost=${hostInfo.amIHost} 人数=${hostInfo.count}`);
  if (hostInfo.amIHost) {
    onLog?.("2人揃いました。ホストとして対局を開始します（タイマー＋疑似CPU）…");
    try {
      await online.startGame(gameId, { timerEnabled: true, pseudoCpuModeEnabled: true, includeBlackWhite: false });
      dbg(`startGame(${shortId(gameId)}) 呼び出し成功`);
    } catch (e) {
      dbg(`startGame(${shortId(gameId)})失敗: ` + (e?.message ?? e));
      return { status: "retry", failedRoomId: gameId }; // 開始失敗（version_conflict等）→作り直して再挑戦
    }
  } else {
    onLog?.("2人揃いました。ホストの開始を待っています…");
  }

  // 5) 対局開始（turnPlayerが立つ）を待つ。時間内に始まらなければ retry（＝相手がゴースト席で
  //    ホストが誰も開始しない“残り部屋”に当たった可能性）。抜けて作り直す。
  const startWait = Date.now();
  while (!(isOnlineMode() && getState().turnPlayer)) {
    if (shouldStop()) return { status: "stop", reason: "停止しました（対局開始待ち）" };
    if (Date.now() - startWait > MATCH_ATTEMPT_START_MS) { dbg(`対局開始待ちタイムアウト（部屋[${shortId(gameId)}] amIHost=${hostInfo.amIHost}）`); return { status: "retry", failedRoomId: gameId }; }
    await wait(1000);
  }
  return { status: "started", gameId };
}

// ワンタッチ・オンライン監視（レベル2。ユーザー要望2026-08-17「手動セットアップが面倒／疑似CPU
// チェックが見当たらない。ワンタッチ実装した方が早い」）。各ブラウザでボタンを押すだけで、
// ①（未ログインなら）ゲストログイン ②共通の“スモーク部屋”を探して参加 or 作成して相手を待つ
// ③2人揃ったらホストが「タイマー＋疑似CPU」有効で自動開始 ④対局開始を検知したら
// runOnlineSmokeMonitor で監視、まで面倒を見る。手動での部屋作成・チェックボックス操作は不要。
// 前回の残り部屋・ゴースト席に当たっても、その部屋を抜けて作り直す“リトライ”方式にして
// （ユーザー報告2026-08-17「2回目が始まらない。残った SMOKE-AUTO-TEST 部屋が原因では」）、
// 数回のリトライで必ず新規部屋に収束するようにした。
async function runOneTouchOnlineSmoke(onLog, shouldStop) {
  const empty = (pass, reason) => ({ pass, reason, turnsReached: 0, errors: [], invariantViolations: [] });
  let online, admin;
  try {
    online = await import("./online.js");
    admin = await import("./admin.js");
  } catch (e) {
    return empty(false, "モジュールの読み込みに失敗しました");
  }
  try {
    // 1) ログイン確保（未ログインならゲスト）。
    let user = await online.getCurrentUser();
    if (!user) {
      onLog?.("ゲストでログインします…");
      try { await online.signInAnonymously(); } catch (e) { return empty(false, "ゲストログインに失敗しました: " + (e?.message ?? e)); }
      for (let i = 0; i < 20 && !user; i++) {
        if (shouldStop()) return empty(true, "停止しました（ログイン待ち）");
        await wait(500);
        user = await online.getCurrentUser();
      }
      if (!user) return empty(false, "ログインが完了しませんでした");
    }
    const myId = user.id;
    onLog?.(`ログイン中（${user.email || "ゲスト"}） / user_id=${shortId(myId)}`);
    // このクライアントの自席も自動化（保険。部屋が疑似CPUで始まれば続き108で自動ONだが）。
    admin.setPseudoCpuIncludeSelf?.(true);

    // 前回の監視が中途半端に終わっていた場合の“残り座席／購読”をまず片付けてから始める
    // （残った SMOKE-AUTO-TEST 部屋が2回目のマッチを妨げる、というユーザー報告2026-08-17）。
    // 対局が始まった SMOKE 部屋は so7_leave_room が座席を残すため「進行中の対局」に残り続ける。
    // 通常の leaveGame に加えて、進行中の対局リストの SMOKE 部屋も force 削除して確実に消す。
    await online.leaveGame().catch(() => {});
    await cleanupLingeringSmokeRooms(online);

    const overallStart = Date.now();
    const failedRooms = new Set(); // 開始しなかった部屋（ゴースト）を覚えて即再入を防ぐ
    while (true) {
      if (shouldStop()) { await online.leaveGame().catch(() => {}); return empty(true, "停止しました（マッチ待ち）"); }
      if (Date.now() - overallStart > ONLINE_MATCH_WAIT_MS) { await online.leaveGame().catch(() => {}); return empty(false, "マッチが成立しませんでした（5分待機）"); }

      let attempt;
      try {
        attempt = await attemptOneTouchMatch(online, onLog, shouldStop, failedRooms, myId);
      } catch (e) {
        onLog?.("🔎 マッチ試行で例外（作り直して再試行します）: " + (e?.message ?? e));
        await online.leaveGame().catch(() => {});
        await wait(1500);
        continue;
      }
      if (attempt.status === "stop") { await online.leaveGame().catch(() => {}); return empty(true, attempt.reason); }
      if (attempt.status === "fatal") { await online.leaveGame().catch(() => {}); return empty(false, attempt.reason); }
      if (attempt.status === "started") {
        onLog?.(`対局開始（自分の席=${online.getSelfSeat?.() ?? "?"}）。監視に移ります。`);
        const res = await runOnlineSmokeMonitor(onLog, shouldStop);
        await smokeLeaveCurrent(online); // 後始末: 対局中でも SMOKE 部屋の座席を強制削除して残さない
        return res;
      }
      // status === "retry": この部屋は開始しなかった。覚えて抜け、少し待って作り直す。
      if (attempt.failedRoomId != null) failedRooms.add(attempt.failedRoomId);
      await online.leaveGame().catch(() => {});

      // 「同じアカウントで2つのブラウザ」を検知する。オンライン監視は2つの別々の
      // user_id（別々の座席）が必要で、同一アカウントだと (game_id,user_id) 主キーの
      // 都合で1部屋に2席入れず、member_count が永遠に2にならず延々とリトライになる
      // （ユーザー報告2026-08-17）。他の SMOKE-AUTO-TEST 部屋が見えていて、その部屋主が
      // 全部“自分の user_id”なら＝同一アカウント。自分の残りゴースト部屋で誤検知しないよう、
      // 別の user_id が部屋主の部屋が1つでもあれば同一アカウント判定にはしない。
      try {
        const me = (await online.getCurrentUser())?.id;
        let rs = [];
        try { rs = await online.listOpenRooms(); } catch { rs = []; }
        const others = rs.filter((r) => r.name === SMOKE_ROOM_NAME && r.id !== online.getCurrentGameId());
        if (me && others.length > 0) {
          const owners = await Promise.all(others.map((r) => online.getRoomOwnerId(r.id).catch(() => null)));
          const anyOtherAccount = owners.some((o) => o && o !== me);
          const allMine = owners.length > 0 && owners.every((o) => o === me);
          if (allMine && !anyOtherAccount) {
            return empty(
              false,
              "⚠ 2つのブラウザが同じアカウントでログインしています。オンライン監視は別々のアカウント（別々のuser_id）が必要です。一方を『shogoshogo0929@gmail.com』でログインするか、片方のブラウザ（シークレット等）でログアウトしてゲストで入り直してください。"
            );
          }
        }
      } catch {}

      onLog?.("この部屋は開始しませんでした（前回の残り部屋の可能性）。抜けて作り直します…");
      await wait(1500);
    }
  } catch (err) {
    await online.leaveGame().catch(() => {});
    return empty(false, "実行時エラー: " + (err?.message ?? err));
  }
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
  desc.textContent = "CPU戦を両席とも自動で回し、エラー・盤面破損・不変条件違反・詰み（一定時間まったく状態が変化しない）を監視します。「8ターン点検」は素早い健全性チェック、「決着まで実行」は勝敗が出るまで丸ごと1局回して終盤まで網羅、「連続実行」は指定回数まとめて回して間欠バグの再現率を測ります（実行すると今の画面は対局に切り替わります）。「🌐 オンライン監視」は、2つのブラウザ（別ブラウザ or シークレットでゲスト2つ）でそれぞれ押すだけで、自動でマッチング→『タイマー＋疑似CPU』有効で対局開始→オンライン特有のバグ（同期・ゲート侵攻modal・優先権 等）を監視まで行います（手動の部屋作成は不要）。オンライン監視も「連続実行」の回数を使い、1試合終わるたびに自動で次のマッチへ再ペアリングして指定試合数まで続けます（両ブラウザで同じ回数にしておくこと）。";
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
  // 人数選択（2〜4人。続き226）。ローカル自己対戦の人数。オンライン監視は常に相手依存なので無関係。
  const countLabel = document.createElement("label");
  countLabel.className = "smoke-test-repeat-label";
  countLabel.textContent = " 人数 ";
  const countSelect = document.createElement("select");
  countSelect.className = "smoke-test-repeat-input";
  for (const n of [2, 3, 4]) {
    const opt = document.createElement("option");
    opt.value = String(n);
    opt.textContent = `${n}人`;
    countSelect.appendChild(opt);
  }
  countSelect.value = "2";
  countLabel.appendChild(countSelect);
  repeatRow.appendChild(countLabel);
  const smokePlayerCount = () => {
    const n = parseInt(countSelect.value, 10);
    return n === 3 || n === 4 ? n : 2;
  };
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
  // オンライン監視（レベル1。ユーザー相談2026-08-17）。ローカル対戦は開始せず、既に始めた
  // オンライン対戦にこの画面をアタッチして監視する。
  const onlineBtn = document.createElement("button");
  onlineBtn.type = "button";
  onlineBtn.className = "smoke-test-run smoke-test-online";
  onlineBtn.textContent = "🌐 オンライン監視";
  onlineBtn.title = "各ブラウザで押すだけで、自動でマッチ→タイマー＋疑似CPUで開始→監視まで行う（『連続実行』の回数だけ試合を繰り返す）";
  // バックグラウンド実行（ユーザー要望2026-08-19「タブを前面に保つのがつらい、別作業したい」）。
  // ブラウザからヘッドレスNodeプロセスは起動できない（Webページはローカルコマンドを実行不可）ため、
  // 「今の設定に合ったターミナルコマンド（node test/smoke.mjs …）をコピーする」ボタンにする。
  // これをターミナルに貼れば、ヘッドレスChromiumが別プロセスで走り＝タブを前面に保たず・スロットル
  // されずにバックグラウンドで回せる（test/smoke.mjs 冒頭のコメント参照）。
  const bgBtn = document.createElement("button");
  bgBtn.type = "button";
  bgBtn.className = "smoke-test-run smoke-test-online";
  bgBtn.textContent = "🖥️ バックグラウンド実行";
  bgBtn.title = "今の人数・モードに合った『node test/smoke.mjs …』コマンドをコピーします。ターミナルに貼ると、タブを前面に保たずバックグラウンドで回せます（ヘッドレスなのでスロットルされず速い）。";
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
  actions.appendChild(onlineBtn);
  actions.appendChild(bgBtn);
  actions.appendChild(closeBtn);
  panel.appendChild(actions);

  // バックグラウンド実行ボタン: 今の人数（countSelect）・決着までモード（repeatFullCheck）に
  // 合わせたコマンドを組み立ててコピーし、resultEl に手順を表示する。
  bgBtn.onclick = async () => {
    const pc = smokePlayerCount();
    const full = repeatFullCheck.checked;
    // 連続実行の回数（repeatInput）も反映する（ユーザー指摘2026-08-19「連続続行なのか判別できてる？」）。
    // 1回なら --repeat を付けない（単発）、2回以上なら --repeat N。既定は連続実行入力欄の値（5）。
    const times = Math.max(1, Math.min(50, parseInt(repeatInput.value, 10) || 1));
    const nodeCmd = `node test/smoke.mjs${pc !== 2 ? " " + pc : ""}${full ? " --full" : ""}${times > 1 ? " --repeat " + times : ""}`;
    // どのフォルダから実行してもいいよう、プロジェクトフォルダへ cd してから実行する形にする
    // （ユーザーが C:\Users\user から実行して Cannot find module になった対策）。PowerShell 用（;）。
    const projectDir = "D:\\7 SHADES OF SEVEN remake デジタル版";
    const cmd = `cd "${projectDir}"; ${nodeCmd}`;
    let copied = false;
    try {
      await navigator.clipboard.writeText(cmd);
      copied = true;
    } catch {}
    resultEl.classList.remove("is-pass", "is-fail");
    resultEl.textContent = "";
    addLog("──── 🖥️ バックグラウンド実行 ────");
    addLog(copied ? "次のコマンドをコピーしました（PowerShellに貼って実行）:" : "次のコマンドを PowerShell で実行してください:");
    addLog(`　${cmd}`);
    addLog("※ヘッドレスChromiumが別プロセスで走るので、タブを前面に保たず別作業できます（スロットルされず速い）。");
    addLog("　内容: 人数=" + pc + "人" + (full ? "・決着まで" : "・8ターン点検") + "・" + (times > 1 ? "連続" + times + "回" : "単発1回") + "。");
    addLog("　cmd.exeの場合は先頭を「cd /d \"" + projectDir + "\" && 」に、フォルダを移した場合はパスを直してください。");
    addLog("　前提: npm install 済み＋ npx playwright install chromium 済み。");
    bgBtn.textContent = copied ? "✅ コピーしました" : "🖥️ バックグラウンド実行";
    setTimeout(() => { bgBtn.textContent = "🖥️ バックグラウンド実行"; }, 2500);
  };

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
    onlineBtn.remove();
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
    onlineBtn.disabled = true;
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
    onlineBtn.disabled = true;
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
      const res = await runInAppSmokeTest(addLog, { runToCompletion: toCompletion, playerCount: smokePlayerCount() });
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

  // オンライン監視（レベル1）。ローカル対戦は開始せず、既に始めた（or これから始める）
  // オンライン対戦にこの画面をアタッチして監視する。実行中は「⏹ 監視停止」に転用。
  let cancelOnline = false;
  const runOnlineMonitor = async () => {
    runBtn.disabled = true;
    runFullBtn.disabled = true;
    repeatBtn.disabled = true;
    repeatInput.disabled = true;
    repeatFullCheck.disabled = true;
    closeBtn.disabled = true;
    resultEl.textContent = "";
    resultEl.className = "smoke-test-result";
    cancelOnline = false;
    onlineBtn.textContent = "⏹ 監視停止";
    onlineBtn.onclick = () => {
      cancelOnline = true;
      onlineBtn.disabled = true;
      onlineBtn.textContent = "停止中…";
    };
    // ユーザー要望2026-08-18「オンライン監視も連続実行を取り入れたい」。連続実行の回数入力
    // （repeatInput）をそのまま使う。1なら従来通り1試合、Nなら1試合ごとに自動で次のマッチへ
    // 再ペアリングして計N試合監視する（両ブラウザとも同じワンタッチのループを回すので、1試合
    // 終わるたびに両者がSMOKE-AUTO-TEST部屋で再び揃い、次のラウンドが始まる）。
    const times = Math.max(1, Math.min(50, parseInt(repeatInput.value, 10) || 1));
    if (times > 1) addLog(`🌐 ワンタッチ・オンライン監視を連続実行（最大${times}試合）。`);
    else addLog("🌐 ワンタッチ・オンライン監視を開始します。");
    const results = [];
    let firstFailure = null;
    for (let i = 1; i <= times; i++) {
      if (cancelOnline) { addLog(`⏹ ${i - 1}試合で停止しました。`); break; }
      if (times > 1) addLog(`━━━━ ${i}/${times}試合目 ━━━━`);
      const res = await runOneTouchOnlineSmoke(addLog, () => cancelOnline);
      results.push(res);
      if (times > 1) addLog(`${i}試合目: ${res.pass ? "✅PASS" : "❌FAIL"} — ${res.reason}`);
      if (!res.pass && !firstFailure) firstFailure = res;
      const passSoFar = results.filter((r) => r.pass).length;
      resultEl.classList.remove("is-pass", "is-fail");
      resultEl.textContent = times > 1 ? `進行中… ${passSoFar}/${results.length} PASS` : "";
      // 停止/失敗（マッチ不成立・ログイン失敗等のfatal）なら連続を打ち切る。詰み/エラー検出は
      // 次の試合へ進んで再現率を測る（ローカルの連続実行と同じ思想）。
      if (cancelOnline) break;
      if (i < times) await wait(1200);
    }
    if (results.length === 1) {
      const res = results[0];
      resultEl.classList.add(res.pass ? "is-pass" : "is-fail");
      resultEl.textContent = res.pass ? `✅ 異常なし — ${res.reason}` : `❌ 検出 — ${res.reason}`;
      addDiagnosticsButtons(await collectFullDiagnostics(res));
    } else {
      const passCount = results.filter((r) => r.pass).length;
      const allPass = results.length > 0 && passCount === results.length;
      resultEl.classList.add(allPass ? "is-pass" : "is-fail");
      resultEl.textContent = `${passCount}/${results.length} 試合 PASS`;
      addLog(`🌐 オンライン監視 連続実行 終了: ${passCount}/${results.length} 試合 PASS`);
      if (firstFailure) {
        addLog("❌ 検出があった試合の診断情報を下のボタンからコピーできます。");
        addDiagnosticsButtons(await collectFullDiagnostics(firstFailure), "検出試合");
      }
    }
    swapToReload();
  };

  // 注意: repeatBtn / onlineBtn は実行中に「⏹ 停止」へ転用する（.onclick を停止ハンドラへ差し替える）。
  // addEventListener だと開始ハンドラが残ったまま停止ハンドラも登録され、停止クリックで両方発火して
  // 二重実行になる（＝診断ボタンが2行出る／console.error上書きが積み重なる不具合。ユーザー報告2026-08-17）。
  // .onclick は単一スロットなので、停止ハンドラへ差し替えれば開始ハンドラは確実に外れる。
  runBtn.onclick = () => runTest({ runToCompletion: false, playerCount: smokePlayerCount() });
  runFullBtn.onclick = () => runTest({ runToCompletion: true, playerCount: smokePlayerCount() });
  repeatBtn.onclick = runRepeated;
  onlineBtn.onclick = runOnlineMonitor;

  document.body.appendChild(panel);
}
