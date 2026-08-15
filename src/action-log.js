// アクションログ（ユーザー提案「すべての選択行動結果のログを出力するようにしてそれを
// 提出することで不具合を見つけてもらうやり方」への対応）。続き57で「状態遷移が絡む
// 連鎖のタイミング系の不具合には有効」と合意した通り、あくまで状態遷移（dispatch・
// カード効果の動詞実行・到達の発火）の記録に限定し、モーダルの表示位置等のUI/UX的な
// 指摘には使わない前提の軽量ツール。
//
// 方針:
// ・メモリ上のリングバッファのみ（アカウントには一切保存しない、ページ再読み込みで消える）。
// ・デフォルトで有効にしておく（不具合は起きてから気づくものなので、事前にオンに
//   し忘れると意味が無い）。ただし軽量（上限件数を絞ったバッファへの追記だけ）なので
//   常時オンでも実害は無い。
// ・deck-viewer.js/card-dev-mode.jsと同じ「独立したパネル」として提供し、admin.jsの
//   「出力をコピー」ボタンと同じUXでそのままチャットに貼り付けられるようにする。
//   ユーザー要望「アクションログは誰でも見れてコピーできるようにしましょう」への
//   対応で、options-menu.js側は管理者限定ガード（isAdminUser）を掛けていない——
//   不具合報告時に誰でもログを提出できることの方が、開発者専用ツールとして絞る
//   ことより価値があると判断したため（他の2つ、⚙管理者モード/🃏カード開発モードとは
//   異なる扱い）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

// 診断ログ(diag-*)が多く、300件だとバグ報告時に肝心の履歴（dispatch/arrival/effect-verb等）が
// すぐ押し出されてしまっていた。診断ログ自体は継続中のバグ調査に有用なので消さず、代わりに
// バッファを広げて有用な履歴が長く残るようにする（1件は小さなオブジェクトなのでメモリ影響は軽微）。
const MAX_ENTRIES = 800;
let entries = [];
let enabled = true;

export function isActionLogEnabled() {
  return enabled;
}
export function setActionLogEnabled(v) {
  enabled = !!v;
}

// ユーザー要望（続き94）「アクションログにターン数を記録するようにするとアクション
// ログから探しやすいかもしれません。スクショの画面右上にターン数も表示されている」。
// state.jsが既にこのモジュールをimportしている（dispatch()からlogActionを呼ぶ）ため、
// ここでstate.jsを直接importし返すと循環importになる。state.js側から「今のターン/
// ラウンド数を返す関数」を1回だけ注入してもらう、他のモジュールと同じ
// 「register helper」パターンで回避する。
let getTurnInfoFn = null;
export function registerTurnInfoProvider(fn) {
  getTurnInfoFn = fn;
}

// category: "dispatch"（state.jsのdispatch、実際に適用されたアクション）/
// "effect-verb"（card-effect-engine.jsの動詞実行、成功/不発を含む）/
// "arrival"（main.jsのtriggerCardArrival、連鎖の起点ごとに1件）。
// detail: JSON化できる範囲の情報だけを渡すこと（トークン配列全体等は載せない——
// ログが肥大化する上、個々のアクションの意味が埋もれてしまうため）。
export function logAction(category, detail) {
  if (!enabled) return;
  const turnInfo = getTurnInfoFn?.() ?? null;
  entries.push({ t: Date.now(), turn: turnInfo?.turn ?? null, round: turnInfo?.round ?? null, category, detail });
  if (entries.length > MAX_ENTRIES) entries.splice(0, entries.length - MAX_ENTRIES);
}

export function clearActionLog() {
  entries = [];
}

function formatEntry(entry) {
  const d = new Date(entry.t);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  const ms = String(d.getMilliseconds()).padStart(3, "0");
  let detailText;
  try {
    detailText = JSON.stringify(entry.detail);
  } catch {
    detailText = String(entry.detail);
  }
  // ユーザー要望（続き94）「スクショの画面右上のターン数と突き合わせやすいように」。
  // ターン数が取れない時点の記録（セットアップ前等）はturnがnullのままなので、
  // その場合は表示自体を省略する（"T?/R?"のようなノイズを増やさない）。
  const turnLabel = entry.turn != null ? `T${entry.turn}${entry.round != null ? `/R${entry.round}` : ""} ` : "";
  return `[${hh}:${mm}:${ss}.${ms}] ${turnLabel}${entry.category}: ${detailText}`;
}

export function getActionLogText() {
  if (entries.length === 0) return "（まだ記録がありません）";
  return entries.map(formatEntry).join("\n");
}

// ゲーム画面の行動ログウィンドウ（main.js）が、素人にも読める日本語へ整形するために
// 生のエントリを取得する（古い→新しい順）。技術ログ(getActionLogText)とは別用途。
export function getActionLogEntries() {
  return entries;
}

// --- パネルUI（deck-viewer.jsのinitDeckViewer/openDeckViewerと同じ「起動時に1回だけ
// 生成し、以後はdisplayの切り替えだけ」パターン） -----------------------------------
let openPanelFn = null;
export function openActionLogPanel() {
  openPanelFn?.();
}

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "action-log-panel";
  panel.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    z-index: 10010; background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148,163,184,0.4);
    border-radius: 0.5rem; padding: 0.9rem; width: min(34rem, 90vw); max-height: 80vh;
    display: flex; flex-direction: column; box-sizing: border-box;
    font-family: sans-serif; font-size: 0.8rem; color: #e2e8f0;
  `;

  const title = document.createElement("div");
  title.textContent = "📜 アクションログ（開発用）";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.4rem; padding-right: 1.6rem;";
  panel.appendChild(title);

  const desc = document.createElement("div");
  desc.textContent =
    "状態遷移（駒/カードの移動・カード効果の動詞実行・到達の発火）を新しい順にさかのぼって最大300件まで記録します。不具合が起きたら、下の内容をコピーしてそのまま伝えてください。";
  desc.style.cssText = "opacity: 0.8; margin-bottom: 0.5rem; line-height: 1.4;";
  panel.appendChild(desc);

  const toggleRow = document.createElement("label");
  toggleRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; margin-bottom: 0.5rem;";
  const toggleCheckbox = document.createElement("input");
  toggleCheckbox.type = "checkbox";
  toggleCheckbox.checked = isActionLogEnabled();
  toggleCheckbox.addEventListener("change", () => setActionLogEnabled(toggleCheckbox.checked));
  const toggleLabel = document.createElement("span");
  toggleLabel.textContent = "記録を有効にする";
  toggleRow.appendChild(toggleCheckbox);
  toggleRow.appendChild(toggleLabel);
  panel.appendChild(toggleRow);

  const textarea = document.createElement("textarea");
  textarea.readOnly = true;
  textarea.style.cssText =
    "flex: 1; min-height: 16rem; background: #0f1520; color: #a5f3fc; font-family: monospace; font-size: 0.7rem; border: 1px solid rgba(148,163,184,0.3); border-radius: 0.25rem; padding: 0.4rem; box-sizing: border-box; resize: vertical;";
  panel.appendChild(textarea);

  function refresh() {
    // 新しい順（末尾が最新）で記録しているが、読む時は直近の出来事を一番上に見たいはず
    // なので、表示だけ逆順にする。
    textarea.value = getActionLogText().split("\n").reverse().join("\n");
  }
  refresh();

  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = "display: flex; gap: 0.4rem; margin-top: 0.5rem;";

  const refreshBtn = document.createElement("button");
  refreshBtn.textContent = "更新";
  refreshBtn.style.cssText = "flex: 1; padding: 0.35rem; background: #334155; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  refreshBtn.addEventListener("click", refresh);
  buttonRow.appendChild(refreshBtn);

  const clearBtn = document.createElement("button");
  clearBtn.textContent = "クリア";
  clearBtn.style.cssText = "flex: 1; padding: 0.35rem; background: #334155; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  clearBtn.addEventListener("click", () => {
    clearActionLog();
    refresh();
  });
  buttonRow.appendChild(clearBtn);

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "コピー";
  copyBtn.style.cssText = "flex: 1; padding: 0.35rem; background: #0891b2; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  copyBtn.addEventListener("click", async () => {
    refresh();
    try {
      await navigator.clipboard.writeText(textarea.value);
      copyBtn.textContent = "コピーしました！";
    } catch {
      copyBtn.textContent = "コピー失敗（手動で選択してください）";
    }
    setTimeout(() => (copyBtn.textContent = "コピー"), 1500);
  });
  buttonRow.appendChild(copyBtn);

  panel.appendChild(buttonRow);
  panel.appendChild(createModalCloseX(close));
  return { panel, refresh };
}

export function initActionLogPanel() {
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    // パネルを開くたびに最新の記録を反映する（buildPanel内で一度だけrefresh()した
    // 時点の内容のまま固まらないようにする——開いた瞬間が一番見たいタイミングのため）。
    refresh();
    panel.style.display = "flex";
    backdrop.style.display = "block";
  }
  openPanelFn = open;

  const { panel, refresh } = buildPanel(close);
  const backdrop = createBackdrop(close, { dim: true, zIndex: 10009 });
  backdrop.style.display = "none";
  panel.style.display = "none";

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}
