// 「スマホでたまに落ちてタイトル画面に戻る」（#77／CPU戦でも発生＝通信ではなくクライアント側の
// リロード。多くはモバイルのメモリ不足によるタブ破棄/再読込）の原因を突き止めるための
// “ブラックボックス”。アプリの通常のログ・エラー捕捉は全てインメモリで、ページが落ちる
// （＝リロードされる）と消えてしまうため、落ちた直後の不具合報告には手がかりが残らなかった。
//
// この葉モジュールは localStorage に小さな記録を「心拍」で書き続け、次回起動時に「前回の
// セッションが不自然に終わっていないか（さっきまで動いていたのにクリーン終了マークが無い）」
// を判定する。判定結果・遷移種別(navType)・JSヒープのピーク・直前の未捕捉エラーを次の
// 不具合報告（アクションログ）に載せることで、次に落ちた時に原因（メモリ超過か・どの画面か・
// CPU戦かオンラインか）を掴めるようにする。
//
// 設計上の注意: アプリの他モジュールを一切importしない（循環import/TDZ回避。[[circular-import-tdz-and-no-cache-bust]]）。
// window/localStorage/performance のみ使用。全て try/catch で、記録失敗がアプリを壊さないようにする。

const KEY = "so7-blackbox-v1";
const HEARTBEAT_MS = 5000;
// 「さっきまで動いていた」とみなす猶予。これより前の記録なら、単に前回きちんと閉じて時間が
// 経ってから開き直しただけの可能性が高いので不審扱いしない。
const RECENT_MS = 90000;

let ctx = { inGame: false, mode: "title" }; // setBlackboxContextで更新（現在どの画面/対局か）
let peakHeapMB = 0;
let cleanExit = false; // 意図的なリロード/遷移の直前に markCleanExit() で true にする
let bootReport = null; // 起動時、前回が不審終了に見えた場合だけ中身が入る

function readRecord() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

function heapMB() {
  try {
    const used = performance?.memory?.usedJSHeapSize;
    return used ? Math.round(used / 1048576) : 0;
  } catch {
    return 0;
  }
}

function writeRecord(extra) {
  try {
    const now = heapMB();
    if (now > peakHeapMB) peakHeapMB = now;
    const rec = {
      t: Date.now(),
      inGame: ctx.inGame,
      mode: ctx.mode,
      heapMB: now,
      peakHeapMB,
      cleanExit,
      ...(extra || {}),
    };
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {
    /* localStorage不可（プライベートモード等）でも致命的でない */
  }
}

function navType() {
  try {
    return performance.getEntriesByType("navigation")[0]?.type ?? "unknown";
  } catch {
    return "unknown";
  }
}

// 現在の画面/対局コンテキストを更新（main.jsのrender購読から呼ぶ）。変化した時だけ書く。
export function setBlackboxContext(next) {
  const merged = { ...ctx, ...next };
  if (merged.inGame === ctx.inGame && merged.mode === ctx.mode) return;
  ctx = merged;
  writeRecord();
}

// 意図的にリロード/遷移する直前に呼ぶ（options-menuの「アプリ再読み込み」・update-checkerの
// 更新リロード等）。これを呼んでおけば、次回起動時にそのリロードを「不審な落下」と誤検知しない。
export function markCleanExit() {
  cleanExit = true;
  writeRecord();
}

// 起動時に判定した「前回は不審終了っぽい」レポート（無ければnull）。main.jsがアクションログへ流す。
export function getBlackboxBootReport() {
  return bootReport;
}

// 不具合報告に載せる現況サマリ（bug-report.jsが使う）。
export function getBlackboxSummary() {
  let limitMB = 0;
  try {
    const lim = performance?.memory?.jsHeapSizeLimit;
    limitMB = lim ? Math.round(lim / 1048576) : 0;
  } catch {
    /* ignore */
  }
  return {
    navType: navType(),
    heapMB: heapMB(),
    peakHeapMB,
    heapLimitMB: limitMB,
    inGame: ctx.inGame,
    mode: ctx.mode,
    bootReport,
  };
}

function init() {
  const prev = readRecord();
  const now = Date.now();
  // 前回記録があり、クリーン終了マークが無く、つい先ほど（RECENT_MS以内）まで動いていて、
  // かつ「対局中だった」か「未捕捉エラーがあった」なら、不審な落下（クラッシュ/ブラウザによる
  // タブ破棄・再読込）の可能性が高い。タイトル画面での単なる手動リフレッシュ等（対局中でなく
  // エラーも無い）はノイズなのでフラグしない——狙いは「対局から突然タイトルに戻る」の追跡。
  const recent = prev && prev.cleanExit !== true && typeof prev.t === "number" && now - prev.t < RECENT_MS;
  if (recent && (prev.inGame === true || prev.lastError)) {
    bootReport = {
      suspectedCrash: true,
      navType: navType(), // "reload"ならブラウザ/ユーザーによる再読込、"navigate"なら新規遷移
      secsSincePrev: Math.round((now - prev.t) / 1000),
      prevInGame: prev.inGame ?? null, // 落ちた時に対局中だったか
      prevMode: prev.mode ?? null, // "cpu" / "online" / "local" / "title" 等
      prevHeapMB: prev.heapMB ?? null,
      prevPeakHeapMB: prev.peakHeapMB ?? null, // メモリがどこまで膨らんでいたか＝負荷の指標
      prevLastError: prev.lastError ?? null, // 直前の未捕捉エラー（あれば）
    };
  }
  // 今回セッションの記録を開始（cleanExit=falseで初期化）。
  cleanExit = false;
  writeRecord({ sessionStart: now });

  // 未捕捉エラー/Promise拒否を localStorage 側にも残す（bug-report.jsのインメモリ捕捉は
  // リロードで消えるため、こちらは“落ちる直前のエラー”を次回起動へ持ち越す用）。
  const persistError = (msg) => {
    try {
      const r = readRecord() || {};
      r.lastError = String(msg).slice(0, 300);
      r.lastErrorAt = Date.now();
      r.cleanExit = false;
      localStorage.setItem(KEY, JSON.stringify(r));
    } catch {
      /* ignore */
    }
  };
  try {
    window.addEventListener("error", (e) => persistError(`${e?.message ?? ""} @ ${e?.filename ?? ""}:${e?.lineno ?? ""}`));
    window.addEventListener("unhandledrejection", (e) => persistError(`REJECTION: ${e?.reason?.message ?? e?.reason ?? ""}`));
    // 心拍。動いている間ずっと最終活動時刻＋ピークメモリを更新し続ける。
    setInterval(() => writeRecord(), HEARTBEAT_MS);
  } catch {
    /* ignore */
  }
}

init();
