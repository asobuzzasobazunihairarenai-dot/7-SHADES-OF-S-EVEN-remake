// オンライン対戦（第一弾・最小構成）の入り口UI。ログイン・部屋の作成/参加・座席選択・
// ゲーム開始のための簡易モーダル。洗練されたロビー画面は次回以降のスコープなので、
// 今回は「部屋コードをLINE等で直接共有する」という前提の最小限の見た目にしている。
// 既存の他モーダル（admin.js・deck-viewer.js等）と同じくui-helpers.jsの
// createModalCloseX/createBackdropを使い、閉じ方の一貫性を保つ。

import {
  isOnlineAvailable,
  signInWithMagicLink,
  signInWithGoogle,
  signInAnonymously,
  getCurrentUser,
  onAuthChange,
  createRoom,
  joinRoom,
  listOpenRooms,
  listSpectatableGames,
  spectateGame,
  getMyActiveGames,
  getRoomName,
  getMemberCount,
  getRoomHostInfo,
  getCurrentGameId,
  getMySeat,
  leaveGame,
  signOut,
  startGame,
  getDebugLog,
  onRosterChange,
  subscribeToOpenRoomsChanges,
  getAccountDisplayLabel,
} from "./online.js";
import { isLobbyPseudoCpuToggleVisible } from "./cpu-battle-state.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { subscribe, getState, isOnlineMode, notifyListeners } from "./state.js";
import { playWaitingBgm, stopWaitingBgm } from "./sound.js";
import { closeHomeScreen } from "./home-screen.js";

// 部屋名の文字数上限。部屋一覧・ヘッダーの部屋バッジ等、限られた幅に表示する箇所が
// 複数あるため、極端に長い部屋名で崩れないよう作成時点で制限する（サーバー側
// so7_create_roomでも同じ上限で切り詰める、両方で持たせるのは既存の他の入力欄と同じ方針）。
const ROOM_NAME_MAX_LENGTH = 20;

// ユーザー要望「対戦相手を待っている間、公式Discordを開くボタンを並べたい」への対応。
const OFFICIAL_DISCORD_URL = "https://discord.gg/stP78fswKx";

let panelEl = null;
let backdropEl = null;
let contentEl = null;
let unsubscribeOpenRooms = null; // 続き65: 部屋一覧のリアルタイム購読解除関数

// ユーザー報告「『オンラインで続ける』を押した直後、まだ部屋を選んでいない段階なのに
// モーダルの背後がテストモード（ローカルのサンドボックス）盤面のまま、B/C/Dにダミーの
// アバターが座っていたりセットアップボタンが出ていたりする」への対応。実際に部屋へ
// 入室するまではonline.jsのisOnlineMode()はまだfalseのままのため、main.js側の
// 「オンライン中はローカル専用UIを隠す」既存の仕組み（body.is-online-modeクラス、
// style.css参照）がこの段階では効いていなかった。
//
// ハマりどころ（ユーザー報告「モーダルを閉じるとテストモード画面に行っちゃう。今
// 見えている背景を維持してほしい」）: 当初はこのパネルが「開いている間だけ」true を
// 返す実装だったため、部屋を選ばずに✕で閉じると盤面がローカルのテストモード表示へ
// 戻ってしまっていた。「オンラインで続ける」を一度でも押したら、その後パネルを
// 閉じても（部屋に入らないままでも）二度とローカル表示へは戻らない「一方向のラッチ」
// に変更した（ページを読み込み直すかテストモードから入り直さない限りfalseへは
// 戻らない）。
let onlineIntentActive = false;
export function isOnlineIntentActive() {
  return onlineIntentActive;
}

// ユーザー報告「『オンラインで続ける』を押した後、次の画面に行くがテストモードの
// 画面（ローカルのサンドボックス盤面）に一瞬移ってしまっている」への対応。以前は
// このフラグをopenOnlinePanel()内でのみtrueにしていたが、openOnlinePanel()自体は
// オープニング画面のフェードアウト演出（opening-screen.jsのCLOSE_TRANSITION_MS）が
// 終わった後に呼ばれるため、フェードアウトしている最中はまだこのフラグがfalseの
// ままで、透けて見える背後の盤面がローカル表示（B/C/Dのダミーアバター等）のまま
// だった。クリックされた瞬間にこの軽量版だけ先に呼び、実際のパネル生成（見た目）は
// これまで通りフェードアウト後のopenOnlinePanel()に任せる。
export function markOnlineIntentActive() {
  onlineIntentActive = true;
  notifyListeners();
}

function closePanel() {
  panelEl?.remove();
  backdropEl?.remove();
  panelEl = null;
  backdropEl = null;
  contentEl = null;
  // 続き65: パネルを閉じたら部屋一覧のリアルタイム購読も止める（開いていない間まで
  // 無駄に受信し続けないように）。
  unsubscribeOpenRooms?.();
  unsubscribeOpenRooms = null;
  // onlineIntentActiveは一方向のラッチのため、部屋を選ばずに閉じても盤面表示は
  // オンライン風のまま維持される（isOnlineIntentActiveのコメント参照）。それでも
  // 念のため再描画は促しておく（他の状態変化と合わせて反映させるため）。
  notifyListeners();
}

function textButton(label) {
  const btn = document.createElement("button");
  btn.textContent = label;
  btn.className = "header-tool-button";
  return btn;
}

// renderPanelContent()はawaitをまたぐ非同期関数のため、短時間に複数回呼ばれる
// （例: 匿名ログイン成功直後、呼び出し元の明示的な再描画とonAuthChange経由の自動再描画が
// ほぼ同時に発生する）と、先に呼ばれた方がcontentEl.innerHTML=""で一旦クリアした「後」に
// 別の呼び出しもクリア→両方が中身を積み増してしまい、パネルの中身が二重に表示される
// バグがあった。世代番号を持たせ、awaitから戻った時点で自分が最新の呼び出しでなければ
// 描画を中断する（＝一番最後に呼ばれたものだけが実際にappendする）ことで解決した。
let renderGeneration = 0;

// ユーザー報告（続き106）「疑似CPUモードのチェックを入れてから『ゲームを開始する』を
// 押したはずなのに、対局を開始してみるとOFFのまま（timerConfig.pseudoCpuModeEnabled
// がfalse）になっていることがある」の原因: このパネル（部屋作成者の待機画面）は
// 「入室・退室はonRosterChange経由でこのパネルが開いている間だけリアルタイムに
// 再描画される」（renderRoomStatus内のコメント参照）ため、ターンタイマー/白黒カード/
// 疑似CPUモードの3つのチェックボックスは毎回この関数内でdocument.createElementから
// 作り直されており、チェック状態を保持する場所がどこにも無かった。ユーザーがチェックを
// 入れた直後に（例えば相手の入室検知や再接続等で）もう一度onRosterChangeが発火して
// 再描画されると、チェックボックスは668/667/684行目付近のハードコードされた初期値
// （タイマーtrue、白黒false、疑似CPUfalse）へ黙って巻き戻ってしまい、その後「ゲームを
// 開始する」を押した時にはユーザーの選択が跡形もなく消えていた。3つの選択状態を
// このパネルの外（モジュールスコープ）に持たせ、再描画のたびにそこから初期値を
// 復元し、ユーザーが変更するたびにそこへ書き戻すことで、再描画をまたいでも選択が
// 保持されるようにする。
let pendingRoomTimerEnabled = true;
let pendingRoomIncludeBlackWhite = false;
let pendingRoomPseudoCpuModeEnabled = false;
let pendingRoomBoost = false;

async function renderPanelContent() {
  if (!contentEl) return;
  const myGeneration = ++renderGeneration;
  contentEl.innerHTML = "";

  const available = isOnlineAvailable();
  const user = available ? await getCurrentUser() : null;
  if (myGeneration !== renderGeneration) return;

  if (!available) {
    const msg = document.createElement("div");
    msg.textContent =
      "オンライン機能を読み込めませんでした（index.htmlのsupabase-js読み込みに失敗した可能性があります）。";
    contentEl.appendChild(msg);
  } else if (!user) {
    renderLoginForm();
  } else {
    const gameId = getCurrentGameId();
    if (!gameId) {
      await renderRoomChoice(user, myGeneration);
      if (myGeneration !== renderGeneration) return;
    } else {
      // ユーザー要望のロビー刷新: 部屋に入ったら待機モーダルではなく、盤面へ遷移して
      // 中央にロビーモーダルを出す（対局前=座席未割り当てのとき）。対局中（再開）なら盤面のみ。
      // ユーザー報告「盤面が出ない」の対応: ホーム画面(#home-screen、z-index:1500)が開いたまま
      // だと盤面を覆ってしまうため、盤面へ移る時にホーム画面を閉じる（フレンドリーマッチは
      // ホームを閉じずにこのパネルを開くため、ここで閉じる）。
      closeHomeScreen();
      markOnlineIntentActive();
      closePanel();
      if (getMySeat()) {
        closeLobbyModal(); // 対局中（再開）→ 盤面のみ
      } else {
        openLobbyModal(gameId);
      }
      return; // パネルは閉じたので以降は描画しない
    }
  }

  // ユーザー要望で「ログを表示」はこの部屋パネルから撤去（アクションログはオプションの
  // 基本設定から見られるため重複）。buildDebugLogSectionは他から呼ばれなくなるが、
  // 将来また出したくなった時のために関数自体は残しておく。
}

// ===== 対戦ロビー（対局前の中央モーダル）: ユーザー要望のロビー刷新 =====
// 部屋作成/入室したら盤面へ遷移し、盤面上に中央モーダルを出す。他プレイヤーの着席は
// online.jsのupdateIdentityRoster（PREVIEW_SEAT_ORDER＝C→B→D）が既に担うため、ここは
// 「部屋主だけ開始できる／他の人には待機表示」のモーダルだけを担当する。座席が割り当てられ
// たら（＝ゲーム開始）ロビーモーダルは自動で閉じる。
let lobbyModalEl = null;
let lobbyModalGameId = null;
let lobbyRosterUnsub = null;

export function openLobbyModal(gameId) {
  if (lobbyModalEl && lobbyModalGameId === gameId) {
    renderLobbyModal();
    return;
  }
  closeLobbyModal();
  lobbyModalGameId = gameId;
  lobbyModalEl = document.createElement("div");
  lobbyModalEl.id = "online-lobby-modal";
  document.body.appendChild(lobbyModalEl);
  playWaitingBgm();
  renderLobbyModal();
  // 入室・退室・座席割り当てのたびに更新。座席が付いたら（ゲーム開始）閉じる。
  // ユーザー報告「部屋主の画面に後から入室した人が着席しない」への対応: onRosterChangeは
  // ロスター（着席プレビュー）を更新するが盤面は再描画しないため、ここで notifyListeners() を
  // 呼んで盤面を描き直し、C→B→Dに着席した他プレイヤーを反映させる。
  lobbyRosterUnsub = onRosterChange(() => {
    if (getMySeat()) {
      closeLobbyModal();
      return;
    }
    notifyListeners(); // 盤面を再描画（着席した他プレイヤーを反映）
    renderLobbyModal();
  });
}

export function closeLobbyModal() {
  lobbyRosterUnsub?.();
  lobbyRosterUnsub = null;
  lobbyModalEl?.remove();
  lobbyModalEl = null;
  lobbyModalGameId = null;
  stopWaitingBgm();
}

// 開始オプション（タイマー/無色/疑似CPU/ブースト）の4チェックボックス。pendingRoom* に束ねる。
function buildLobbyOptionRows() {
  const wrap = document.createElement("div");
  wrap.className = "online-lobby-options";
  const addToggle = (labelText, checked, onChange) => {
    const row = document.createElement("label");
    row.className = "online-lobby-option-row";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = checked;
    cb.addEventListener("change", () => onChange(cb.checked));
    const span = document.createElement("span");
    span.textContent = labelText;
    row.appendChild(cb);
    row.appendChild(span);
    wrap.appendChild(row);
  };
  addToggle("⏳ ターンタイマーを使用する", pendingRoomTimerEnabled, (v) => (pendingRoomTimerEnabled = v));
  addToggle("白黒（無色）カードを山札に含める", pendingRoomIncludeBlackWhite, (v) => (pendingRoomIncludeBlackWhite = v));
  // 疑似CPUモードのチェックは管理者モードで表示ONの時だけ出す（既定は非表示。ユーザー要望2026-08-08）。
  if (isLobbyPseudoCpuToggleVisible()) {
    addToggle("🤖 疑似CPUモード（自動選択のテスト用）を使う", pendingRoomPseudoCpuModeEnabled, (v) => (pendingRoomPseudoCpuModeEnabled = v));
  }
  addToggle("🚀 ブーストモード（両隣に効果なしファーストカードをロックして開始）", pendingRoomBoost, (v) => (pendingRoomBoost = v));
  return wrap;
}

async function renderLobbyModal() {
  const el = lobbyModalEl;
  const gameId = lobbyModalGameId;
  if (!el) return;
  let info;
  try {
    info = await getRoomHostInfo();
  } catch (err) {
    info = { amIHost: false, hostName: "部屋主", count: 0 };
  }
  if (el !== lobbyModalEl) return; // 別のロビーに切り替わっていたら中断

  el.innerHTML = "";
  const card = document.createElement("div");
  card.className = "online-lobby-card";

  const title = document.createElement("div");
  title.className = "online-lobby-title";
  title.textContent = "🌐 対戦ロビー";
  card.appendChild(title);

  const countEl = document.createElement("div");
  countEl.className = "online-lobby-count";
  countEl.textContent = `参加人数: ${info.count}人`;
  card.appendChild(countEl);

  if (info.amIHost) {
    card.appendChild(buildLobbyOptionRows());
    const canStart = info.count >= 2;
    const startBtn = textButton(canStart ? `ゲームを開始する（現在${info.count}名）` : "あと1人以上でゲーム開始できます");
    startBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-top: 0.6rem;";
    startBtn.disabled = !canStart;
    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true;
      try {
        await startGame(gameId, {
          timerEnabled: pendingRoomTimerEnabled,
          includeBlackWhite: pendingRoomIncludeBlackWhite,
          pseudoCpuModeEnabled: pendingRoomPseudoCpuModeEnabled,
          boost: pendingRoomBoost,
        });
        closeLobbyModal();
      } catch (err) {
        alert(err.message ?? String(err));
        startBtn.disabled = false;
      }
    });
    card.appendChild(startBtn);
  } else {
    const waiting = document.createElement("div");
    waiting.className = "online-lobby-waiting";
    waiting.textContent = `${info.hostName}さんがゲームを開始するのを待っています…`;
    card.appendChild(waiting);
  }

  const leaveBtn = textButton("この部屋を離れる");
  leaveBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-top: 0.5rem;";
  leaveBtn.addEventListener("click", () => {
    leaveGame();
    closeLobbyModal();
    setSavedRoomPassword(gameId, null);
    history.replaceState(null, "", location.pathname);
    openOnlinePanel(); // 部屋一覧へ戻る
  });
  card.appendChild(leaveBtn);

  el.appendChild(card);
}

// 「Failed to send a request to the Edge Function」のような、詳細が分かりにくいエラーが
// 起きた時に、非エンジニアのユーザーでも状況を報告しやすくするための簡易ログ表示。
// 普段は折りたたんでおき、押した時だけ中身（online.jsが記録した直近のエラー履歴）を
// テキストエリアに表示する。「コピー」ボタンでクリップボードにコピーできる。
function buildDebugLogSection() {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "margin-top: 0.8rem; border-top: 1px solid rgba(148, 163, 184, 0.25); padding-top: 0.5rem;";

  const toggleBtn = document.createElement("button");
  toggleBtn.textContent = "🐛 ログを表示";
  toggleBtn.className = "header-tool-button";
  toggleBtn.style.cssText = "font-size: 0.7rem; padding: 0.3rem 0.5rem; min-width: auto;";
  wrapper.appendChild(toggleBtn);

  const area = document.createElement("div");
  area.style.display = "none";
  area.style.marginTop = "0.4rem";

  const textarea = document.createElement("textarea");
  textarea.readOnly = true;
  textarea.style.cssText =
    "width: 100%; box-sizing: border-box; height: 8rem; font-size: 0.7rem; font-family: monospace; " +
    "background: rgba(0, 0, 0, 0.3); color: #e2e8f0; border: 1px solid rgba(148, 163, 184, 0.3); " +
    "border-radius: 0.3rem; padding: 0.3rem; resize: vertical;";
  area.appendChild(textarea);

  const hint = document.createElement("div");
  hint.style.cssText = "font-size: 0.7rem; color: #94a3b8; margin: 0.3rem 0;";
  hint.textContent =
    "※ CORS（ブラウザのクロスオリジン制限）が原因のエラーなど、ブラウザがJS側に理由を渡さない" +
    "種類のエラーは、この一覧にも詳細が出ないことがあります。その場合はブラウザの開発者ツール" +
    "（F12）のNetwork/Consoleタブの内容を教えてください。";
  area.appendChild(hint);

  const copyBtn = textButton("コピー");
  copyBtn.style.cssText = "font-size: 0.7rem; padding: 0.3rem 0.5rem; min-width: auto;";
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textarea.value);
      copyBtn.textContent = "コピーしました";
      setTimeout(() => (copyBtn.textContent = "コピー"), 1500);
    } catch {
      textarea.select();
    }
  });
  area.appendChild(copyBtn);

  wrapper.appendChild(area);

  toggleBtn.addEventListener("click", () => {
    const opening = area.style.display === "none";
    area.style.display = opening ? "block" : "none";
    toggleBtn.textContent = opening ? "🐛 ログを隠す" : "🐛 ログを表示";
    if (opening) textarea.value = getDebugLog();
  });

  return wrapper;
}

function renderLoginForm() {
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem;";
  title.textContent = "🌐 オンライン対戦（ログイン）";
  contentEl.appendChild(title);

  const input = document.createElement("input");
  input.type = "email";
  input.placeholder = "メールアドレス";
  input.style.cssText =
    "width: 100%; box-sizing: border-box; padding: 0.4rem; margin-bottom: 0.5rem; border-radius: 0.3rem; " +
    "border: 1px solid rgba(148, 163, 184, 0.4); background: rgba(255, 255, 255, 0.05); color: inherit;";
  contentEl.appendChild(input);

  const status = document.createElement("div");
  status.style.cssText = "font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.5rem; min-height: 1.2em;";
  contentEl.appendChild(status);

  // .header-tool-buttonはdisplayを指定していない（既定でinline-block）ため、幅に余裕が
  // あるこのパネルでは複数のボタンが横並びになってしまい、「Googleでログイン」と
  // 「とりあえず遊ぶ（匿名）」が見た目上ほぼ隣接して紛らわしく表示されるバグがあった
  // （ユーザー報告のスクリーンショットで確認）。ログイン手段のボタンはどれも縦に1列で
  // 並べたい意図が明確なため、ここで明示的にdisplay:block; width:100%;を指定する。
  const btn = textButton("マジックリンクを送る");
  btn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
  btn.addEventListener("click", async () => {
    if (!input.value) return;
    btn.disabled = true;
    status.textContent = "送信中...";
    try {
      await signInWithMagicLink(input.value);
      status.textContent = "メールを確認し、届いたリンクを開いてください。";
    } catch (err) {
      status.textContent = `エラー: ${err.message ?? err}`;
    } finally {
      btn.disabled = false;
    }
  });
  contentEl.appendChild(btn);

  const divider = document.createElement("div");
  divider.style.cssText = "text-align: center; font-size: 0.75rem; color: #94a3b8; margin: 0.7rem 0;";
  divider.textContent = "── または ──";
  contentEl.appendChild(divider);

  // Googleログインはページ遷移を伴う（Googleのログイン画面へ実際に飛んで戻ってくる）ため、
  // 押した直後にステータス表示を更新する意味があまりない（成功時はそのままページが
  // 離れる）。事前にSupabaseダッシュボードでのGoogleプロバイダ設定が必要。
  const googleBtn = textButton("Googleでログイン");
  googleBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-bottom: 0.4rem;";
  googleBtn.addEventListener("click", async () => {
    googleBtn.disabled = true;
    try {
      await signInWithGoogle();
    } catch (err) {
      status.textContent = `エラー: ${err.message ?? err}`;
      googleBtn.disabled = false;
    }
  });
  contentEl.appendChild(googleBtn);

  // 匿名ログインはページ遷移せずその場で完了する（メール確認不要、ユドナリウムのような
  // 手軽さ）。事前にSupabaseダッシュボードで「Anonymous Sign-Ins」を有効化しておく必要がある。
  const anonBtn = textButton("とりあえず遊ぶ（匿名）");
  anonBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
  anonBtn.addEventListener("click", async () => {
    anonBtn.disabled = true;
    status.textContent = "ログイン中...";
    try {
      await signInAnonymously();
      // ログイン成功はonAuthChange経由でパネルが自動的に更新されるはずだが、念のため
      // ここでも明示的に再描画しておく。
      await renderPanelContent();
    } catch (err) {
      status.textContent = `エラー: ${err.message ?? err}`;
      anonBtn.disabled = false;
    }
  });
  contentEl.appendChild(anonBtn);
}

function textInput(placeholderOrValue, { isValue } = {}) {
  const input = document.createElement("input");
  input.type = "text";
  if (isValue) input.value = placeholderOrValue;
  else input.placeholder = placeholderOrValue;
  input.style.cssText =
    "width: 100%; box-sizing: border-box; padding: 0.4rem; margin-bottom: 0.4rem; border-radius: 0.3rem; " +
    "border: 1px solid rgba(148, 163, 184, 0.4); background: rgba(255, 255, 255, 0.05); color: inherit;";
  return input;
}

// パスワード欄に「表示/非表示」切り替え(👁)ボタンを付けて包む。inputはtype="password"の
// まま渡し、返り値のwrapperをDOMに追加する（inputへの参照自体は呼び出し元がそのまま使える）。
function wrapWithPasswordToggle(input) {
  input.style.marginBottom = "0";
  input.style.paddingRight = "2rem";
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "position: relative; margin-bottom: 0.4rem;";
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.textContent = "👁";
  toggleBtn.title = "パスワードを表示";
  toggleBtn.style.cssText =
    "position: absolute; right: 0.2rem; top: 50%; transform: translateY(-50%); background: none; " +
    "border: none; cursor: pointer; font-size: 0.9rem; padding: 0.1rem 0.3rem; line-height: 1; color: inherit;";
  toggleBtn.addEventListener("click", () => {
    const nowShowing = input.type === "text";
    input.type = nowShowing ? "password" : "text";
    toggleBtn.textContent = nowShowing ? "👁" : "🙈";
    toggleBtn.title = nowShowing ? "パスワードを表示" : "パスワードを隠す";
  });
  wrapper.appendChild(input);
  wrapper.appendChild(toggleBtn);
  return wrapper;
}

// 部屋のパスワードは、サーバー側にはハッシュしか保存しない設計（そもそも平文を復元できない）
// ため、「部屋作成後もパスワードを確認できるように」は、作成した本人のこのブラウザだけが
// 作成時に入力した平文を覚えておく、という形でしか実現できない（別端末や別ブラウザからは
// 分からない）。サーバーへは一切送らない、あくまでこのブラウザのlocalStorageだけの記録。
function savedRoomPasswordKey(gameId) {
  return `so7-room-password-${gameId}`;
}
function getSavedRoomPassword(gameId) {
  try {
    return localStorage.getItem(savedRoomPasswordKey(gameId));
  } catch (err) {
    return null;
  }
}
export function setSavedRoomPassword(gameId, password) {
  try {
    if (password) localStorage.setItem(savedRoomPasswordKey(gameId), password);
    else localStorage.removeItem(savedRoomPasswordKey(gameId));
  } catch (err) {
    // localStorageが使えない環境でも致命的ではない（単に「作成後の確認」ができないだけ）
  }
}

// 部屋の状況パネルに表示する、保存済みパスワードの表示/非表示行。
function buildPasswordDisplayRow(password) {
  const row = document.createElement("div");
  row.style.cssText =
    "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.4rem; display: flex; align-items: center; gap: 0.3rem;";
  row.title = "このブラウザで部屋を作成した時だけ表示できます（サーバーには平文で保存されません）。";
  const label = document.createElement("span");
  label.textContent = "🔒 パスワード:";
  const valueEl = document.createElement("span");
  valueEl.style.cssText = "font-family: monospace; letter-spacing: 0.05em;";
  let visible = false;
  function refresh() {
    valueEl.textContent = visible ? password : "•".repeat(password.length);
  }
  refresh();
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.textContent = "👁";
  toggleBtn.title = "表示/非表示";
  toggleBtn.style.cssText = "background: none; border: none; cursor: pointer; font-size: 0.8rem; padding: 0 0.2rem; color: inherit;";
  toggleBtn.addEventListener("click", () => {
    visible = !visible;
    refresh();
    toggleBtn.textContent = visible ? "🙈" : "👁";
  });
  row.appendChild(label);
  row.appendChild(valueEl);
  row.appendChild(toggleBtn);
  return row;
}

// 部屋一覧の1行。パスワード無しならクリックでそのまま参加、有りならその場にパスワード
// 入力欄を展開する（別ダイアログを開かず、一覧のその場で完結させる）。
function buildRoomRow(room) {
  const row = document.createElement("div");
  row.style.cssText =
    "padding: 0.5rem 0.6rem; margin-bottom: 0.4rem; border: 1px solid rgba(148, 163, 184, 0.3); " +
    "border-radius: 0.3rem; cursor: pointer;";

  const label = document.createElement("div");
  label.style.cssText = "font-size: 0.85rem;";
  label.textContent = `${room.has_password ? "🔒 " : ""}${room.name}（${room.member_count}人）`;
  row.appendChild(label);

  const passRow = document.createElement("div");
  passRow.style.cssText = "display: none; margin-top: 0.4rem;";
  passRow.addEventListener("click", (e) => e.stopPropagation()); // 行自体のクリック(開閉)を誘発しない
  const passInput = textInput("パスワード");
  passInput.type = "password";
  const passStatus = document.createElement("div");
  passStatus.style.cssText = "font-size: 0.75rem; color: #f87171; min-height: 1.1em;";
  const passConfirmBtn = textButton("参加する");
  passConfirmBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
  passRow.appendChild(wrapWithPasswordToggle(passInput));
  passRow.appendChild(passStatus);
  passRow.appendChild(passConfirmBtn);
  row.appendChild(passRow);

  async function attemptJoin(password) {
    try {
      await joinRoom(room.id, password);
      history.replaceState(null, "", `?room=${room.id}`);
      await renderPanelContent();
    } catch (err) {
      if (room.has_password) {
        passStatus.textContent = err.message ?? String(err);
      } else {
        alert(`参加に失敗しました: ${err.message ?? err}`);
      }
    }
  }

  passConfirmBtn.addEventListener("click", () => attemptJoin(passInput.value));
  row.addEventListener("click", () => {
    if (room.has_password) {
      passRow.style.display = passRow.style.display === "none" ? "block" : "none";
    } else {
      attemptJoin(null);
    }
  });

  return row;
}

// ユーザー報告「ゲームを開始する画面が二つ連なって表示される」への対応。この関数は
// 内部に複数のawait（getMyActiveGames/listOpenRooms）を持ち、その間にonRosterChange等
// 経由でrenderPanelContent()が再度呼ばれると、古い方の呼び出しがawaitから戻った後も
// 新しい方が既に描画し直したcontentElへ構わず追記を続けてしまい、中身が二重に積み
// 上がるバグがあった（renderPanelContent自体の世代番号ガードは、この関数のawaitの
// "内側"までは守ってくれない）。呼び出し元から受け取ったmyGenerationを内部のawaitの
// 後でも都度チェックし、自分が既に古い世代なら追記せず中断するようにした。
async function renderRoomChoice(user, myGeneration) {
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem;";
  // 配信時にメールアドレスが画面に映るのを避けるため、getAccountDisplayLabelで
  // 名前 or 伏せ字メール（匿名は「ゲスト」）を表示する（ユーザー要望）。
  title.textContent = `🌐 オンライン対戦（${getAccountDisplayLabel(user)}）`;
  contentEl.appendChild(title);

  // 誤って「この部屋を離れる」を押した・ブラウザを閉じて放置した等で今は部屋の外にいるが、
  // サーバー上にはまだ自分の座席が残っている対局中の部屋があれば、ここに表示して
  // ワンクリックで再開できるようにする（so7_leave_room/so7_join_room側の変更と対）。
  try {
    const activeGames = await getMyActiveGames();
    if (myGeneration !== renderGeneration) return;
    if (activeGames.length > 0) {
      const resumeLabel = document.createElement("div");
      resumeLabel.style.cssText = "font-size: 0.85rem; margin-bottom: 0.3rem;";
      resumeLabel.textContent = "進行中の対局（途中退出した部屋）:";
      contentEl.appendChild(resumeLabel);
      for (const game of activeGames) {
        const resumeBtn = textButton(`▶ ${game.name} を再開`);
        resumeBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-bottom: 0.4rem;";
        resumeBtn.addEventListener("click", async () => {
          resumeBtn.disabled = true;
          try {
            await joinRoom(game.id);
            history.replaceState(null, "", `?room=${game.id}`);
            await renderPanelContent();
          } catch (err) {
            alert(`再開に失敗しました: ${err.message ?? err}`);
            resumeBtn.disabled = false;
          }
        });
        contentEl.appendChild(resumeBtn);
      }
      const resumeDivider = document.createElement("div");
      resumeDivider.style.cssText = "border-top: 1px solid rgba(148, 163, 184, 0.3); margin: 0.6rem 0;";
      contentEl.appendChild(resumeDivider);
    }
  } catch (err) {
    // 取れなくても部屋の作成・一覧自体は引き続き使えるようにしておく
  }

  // 「部屋を作成」セクション（ユーザー要望「作成／参加／観戦をはっきり分けたい」「フォームを
  // 出しているのに『＋部屋を作成』ボタンがあるのは変」）。以前は畳んでおくトグルだったが、
  // トグルは廃止し、見出しの下にフォームを常に表示する。
  const createLabel = document.createElement("div");
  createLabel.style.cssText = "font-weight: bold; font-size: 0.9rem; margin: 0 0 0.4rem;";
  createLabel.textContent = "🆕 部屋を作成";
  contentEl.appendChild(createLabel);
  const createForm = document.createElement("div");
  createForm.style.cssText = "margin-bottom: 0.4rem;";
  const nameInput = textInput("セブンの部屋", { isValue: true });
  nameInput.maxLength = ROOM_NAME_MAX_LENGTH;
  const passInput = textInput("パスワード（任意）");
  passInput.type = "password";
  const createStatus = document.createElement("div");
  createStatus.style.cssText = "font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.3rem; min-height: 1.2em;";
  const createConfirmBtn = textButton("作成する");
  createConfirmBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
  createConfirmBtn.addEventListener("click", async () => {
    createConfirmBtn.disabled = true;
    createStatus.textContent = "作成中...";
    try {
      const gameId = await createRoom(nameInput.value, passInput.value);
      setSavedRoomPassword(gameId, passInput.value || null);
      history.replaceState(null, "", `?room=${gameId}`);
      await renderPanelContent();
    } catch (err) {
      createStatus.textContent = `エラー: ${err.message ?? err}`;
      createConfirmBtn.disabled = false;
    }
  });
  createForm.appendChild(nameInput);
  createForm.appendChild(wrapWithPasswordToggle(passInput));
  createForm.appendChild(createStatus);
  createForm.appendChild(createConfirmBtn);
  contentEl.appendChild(createForm);

  // 「参加できる部屋」セクションの見出し（ユーザー要望「参加できる部屋／観戦できる対局が
  // まず分かれていた方が良い」）。区切り線＋太字の見出しで観戦セクションと明確に分ける。
  // リアルタイム更新（onRosterChange/部屋一覧の購読）になったため「🔄 更新」ボタンは撤去した。
  const listLabel = document.createElement("div");
  listLabel.style.cssText =
    "font-weight: bold; font-size: 0.9rem; margin: 0.2rem 0 0.4rem; padding-top: 0.6rem; border-top: 1px solid rgba(148, 163, 184, 0.25);";
  listLabel.textContent = "🚪 参加できる部屋";
  contentEl.appendChild(listLabel);

  const listStatus = document.createElement("div");
  listStatus.style.cssText = "font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.3rem; min-height: 1.2em;";
  contentEl.appendChild(listStatus);

  const listContainer = document.createElement("div");
  contentEl.appendChild(listContainer);

  try {
    const rooms = await listOpenRooms();
    if (myGeneration !== renderGeneration) return;
    if (rooms.length === 0) {
      listStatus.textContent = "現在、参加できる部屋はありません。「＋ 部屋を作成」から作ってください。";
    } else {
      for (const room of rooms) listContainer.appendChild(buildRoomRow(room));
    }
  } catch (err) {
    listStatus.textContent = `一覧の取得に失敗しました: ${err.message ?? err}`;
  }

  // ユーザー要望「『部屋コードで参加』はもう削除でいい」への対応。部屋一覧・
  // URL共有(?room=)からの参加で十分カバーできているため撤去した。

  // --- 観戦（進行中の対局を後から見る、ユーザー要望） ---
  // 「参加できる部屋」とはっきり分けるため、区切り線＋太字見出しの独立セクションにする。
  const specLabel = document.createElement("div");
  specLabel.style.cssText =
    "font-weight: bold; font-size: 0.9rem; margin: 1.1rem 0 0.4rem; padding-top: 0.8rem; border-top: 1px solid rgba(148, 163, 184, 0.25);";
  specLabel.textContent = "👀 観戦できる対局（進行中）";
  contentEl.appendChild(specLabel);

  // 見え方モード（公開＝手札等は見えない / すべて＝全手札も丸見えのgod-view）。
  const specModeRow = document.createElement("label");
  specModeRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; font-size: 0.78rem; color: #cbd5e1; margin-bottom: 0.4rem; cursor: pointer;";
  const specAllCheckbox = document.createElement("input");
  specAllCheckbox.type = "checkbox";
  const specModeText = document.createElement("span");
  specModeText.textContent = "すべて見える（全員の手札も見える／配信向け）";
  specModeRow.appendChild(specAllCheckbox);
  specModeRow.appendChild(specModeText);
  contentEl.appendChild(specModeRow);

  const specStatus = document.createElement("div");
  specStatus.style.cssText = "font-size: 0.8rem; color: #94a3b8; min-height: 1.2em;";
  contentEl.appendChild(specStatus);
  const specContainer = document.createElement("div");
  contentEl.appendChild(specContainer);

  try {
    const games = await listSpectatableGames();
    if (myGeneration !== renderGeneration) return;
    if (games.length === 0) {
      specStatus.textContent = "現在、観戦できる進行中の対局はありません。";
    } else {
      for (const g of games) {
        const specRowEl = document.createElement("div");
        specRowEl.style.cssText =
          "display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.3rem 0; border-top: 1px solid rgba(148,163,184,0.15);";
        const info = document.createElement("span");
        info.style.cssText = "font-size: 0.82rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;";
        info.textContent = `${g.name || "（無名の部屋）"}（${g.member_count}人）${g.has_password ? " 🔒" : ""}`;
        const watchBtn = document.createElement("button");
        watchBtn.type = "button";
        watchBtn.textContent = "👀 観戦";
        watchBtn.style.cssText =
          "flex: 0 0 auto; font-size: 0.78rem; padding: 0.2rem 0.6rem; background: #0e7490; color: #fff; border: none; border-radius: 0.3rem; cursor: pointer;";
        watchBtn.addEventListener("click", async () => {
          watchBtn.disabled = true;
          try {
            await spectateGame(g.id, specAllCheckbox.checked ? "all" : "public");
            closePanel();
          } catch (err) {
            alert(`観戦の開始に失敗しました: ${err.message ?? err}`);
            watchBtn.disabled = false;
          }
        });
        specRowEl.appendChild(info);
        specRowEl.appendChild(watchBtn);
        specContainer.appendChild(specRowEl);
      }
    }
  } catch (err) {
    specStatus.textContent = `観戦一覧の取得に失敗しました: ${err.message ?? err}`;
  }

  // ユーザー要望でこの部屋パネルからは「ログアウト」を撤去（用途が分かりづらく場違いなため）。
  // 別アカウントに切り替えたい等でログアウトしたい場合はタイトル画面（opening-screen.js）の
  // ログイン欄から行える。
}

// renderRoomChoice同様、内部のawait（getRoomName/getMemberCount）の間に新しい世代の
// 呼び出しが割り込むケースに備え、myGenerationを都度チェックする（詳しい経緯は
// renderRoomChoiceのコメント参照）。
async function renderRoomStatus(gameId, myGeneration) {
  const mySeat = getMySeat();
  let roomName = "セブンの部屋";
  try {
    roomName = await getRoomName(gameId);
  } catch (err) {
    // 名前が取れなくても部屋自体は表示・操作できるようにしておく
  }
  if (myGeneration !== renderGeneration) return;

  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.4rem;";
  title.textContent = mySeat ? `🌐 ${roomName}（座席${mySeat}）` : `🌐 ${roomName}`;
  contentEl.appendChild(title);

  const codeHint = document.createElement("div");
  codeHint.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.4rem;";
  codeHint.textContent = `部屋コード: ${gameId}`;
  contentEl.appendChild(codeHint);

  let count = 0;
  try {
    count = await getMemberCount(gameId);
  } catch (err) {
    // 人数取得に失敗しても部屋自体からは出られるようにしておく
  }
  if (myGeneration !== renderGeneration) return;
  const countEl = document.createElement("div");
  countEl.style.cssText = "font-size: 0.85rem; margin-bottom: 0.6rem;";
  countEl.textContent = mySeat
    ? `参加人数: ${count}人`
    : `参加人数: ${count}人（座席はゲーム開始時にランダムに決まります）`;
  contentEl.appendChild(countEl);

  const shareHint = document.createElement("div");
  shareHint.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.6rem;";
  shareHint.textContent = "他のプレイヤーは「🌐オンライン」の部屋一覧からこの部屋を選べます。";
  contentEl.appendChild(shareHint);

  // サーバーはパスワードのハッシュしか持たないため、これは「このブラウザで実際に部屋を
  // 作成した時に入力した値」をlocalStorageから引いているだけ（他端末では表示できない）。
  const savedPassword = getSavedRoomPassword(gameId);
  if (savedPassword) {
    contentEl.appendChild(buildPasswordDisplayRow(savedPassword));
  }

  // ユーザー要望「部屋を作ったら『対戦相手を待っています』が画面に出て、公式Discordを
  // 開くボタンも並べたい。2人以上揃ったら『ゲームを開始する（現在●名）』というボタンに
  // 変わり、入室メンバー誰でも押せる」への対応。まだ座席が無い（＝この部屋でゲームが
  // 始まっていない）全員に表示する。入室・退室はonline.jsのonRosterChange経由でこの
  // パネルが開いている間だけリアルタイムに再描画されるため、人数表示・ボタンの切り替わりも
  // 相手側の操作を待たずその場で反映される。
  if (!mySeat) {
    // ユーザー要望「プレイヤー待機中のBGMを追加しました」への対応。まだ座席が無い
    // （＝この部屋でゲームが始まっていない）間、常にこの分岐を通るためここで再生する。
    // playWaitingBgm()自体が「既に再生中なら再スタートしない」ガードを持つため、
    // このパネルがonRosterChange等で何度再描画されても音が飛ぶことはない。
    playWaitingBgm();

    const waitingBox = document.createElement("div");
    waitingBox.style.cssText =
      "text-align: center; padding: 0.8rem 0.5rem; margin-bottom: 0.6rem; " +
      "background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(148, 163, 184, 0.25); border-radius: 0.4rem;";

    if (count < 2) {
      const waitingText = document.createElement("div");
      waitingText.style.cssText = "font-weight: bold; margin-bottom: 0.6rem;";
      waitingText.textContent = "対戦相手を待っています。";
      waitingBox.appendChild(waitingText);
    } else {
      // ターンタイマーを使うかどうか。ここで決めた値が対局全体で固定される
      // （src/online.jsのstartGame()参照、不公平にならないよう対局中は変更できない）。
      // デフォルトはON——管理者モードの中まで潜らないと有効化できないと気づかれにくい、
      // というユーザー報告への対応。
      const timerRow = document.createElement("label");
      timerRow.style.cssText =
        "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; margin-bottom: 0.5rem; font-size: 0.85rem; text-align: left;";
      const timerCheckbox = document.createElement("input");
      timerCheckbox.type = "checkbox";
      timerCheckbox.checked = pendingRoomTimerEnabled;
      timerCheckbox.addEventListener("change", () => {
        pendingRoomTimerEnabled = timerCheckbox.checked;
      });
      const timerLabel = document.createElement("span");
      timerLabel.textContent = "⏳ ターンタイマーを使用する";
      timerRow.appendChild(timerCheckbox);
      timerRow.appendChild(timerLabel);
      waitingBox.appendChild(timerRow);

      // ユーザー要望（続き97）「『ゲームを開始する』の時に『無色カードを含める』的な
      // チェックを追加。デフォは含めない」。ローカルモードのセットアップウィザード
      // （game-setup.js）・クイックスタート（quick-start.js）には既にあった設定だが、
      // オンラインの部屋作成フローにはチェックボックス自体が無く、startGame()の
      // includeBlackWhite引数を渡していなかったため常にデフォルト値(false)のまま
      // 固定されていた（結果的に「常に無色なし」にはなっていたが、有りを選ぶ手段が
      // 無かった）。
      const bwRow = document.createElement("label");
      bwRow.style.cssText =
        "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; margin-bottom: 0.5rem; font-size: 0.85rem; text-align: left;";
      const bwCheckbox = document.createElement("input");
      bwCheckbox.type = "checkbox";
      bwCheckbox.checked = pendingRoomIncludeBlackWhite;
      bwCheckbox.addEventListener("change", () => {
        pendingRoomIncludeBlackWhite = bwCheckbox.checked;
      });
      const bwLabel = document.createElement("span");
      bwLabel.textContent = "白黒（無色）カードを山札に含める";
      bwRow.appendChild(bwCheckbox);
      bwRow.appendChild(bwLabel);
      waitingBox.appendChild(bwRow);

      // ユーザー要望（続き101）「疑似CPUモードを開始しても相手に反映されないので、
      // ゲーム開始ボタンを押す時に疑似CPUモードにチェックを入れるのはどう？」。
      // 続き98の「対局中にRealtime Broadcastで伝える」設計が実機テストで信頼できないと
      // 判明したため、timerEnabled/includeBlackWhiteと同じ「開始ボタンを押した瞬間の
      // 設定を対局全体の固定値としてサーバーに同期する」確実な仕組みに変更した。
      // 疑似CPUモードのチェックは管理者モードで表示ONの時だけ出す（既定は非表示。ユーザー要望2026-08-08）。
      if (isLobbyPseudoCpuToggleVisible()) {
        const pseudoCpuRow = document.createElement("label");
        pseudoCpuRow.style.cssText =
          "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; margin-bottom: 0.5rem; font-size: 0.85rem; text-align: left;";
        const pseudoCpuCheckbox = document.createElement("input");
        pseudoCpuCheckbox.type = "checkbox";
        pseudoCpuCheckbox.checked = pendingRoomPseudoCpuModeEnabled;
        pseudoCpuCheckbox.addEventListener("change", () => {
          pendingRoomPseudoCpuModeEnabled = pseudoCpuCheckbox.checked;
        });
        const pseudoCpuLabel = document.createElement("span");
        pseudoCpuLabel.textContent = "🤖 疑似CPUモード（自動選択のテスト用）を使う";
        pseudoCpuRow.appendChild(pseudoCpuCheckbox);
        pseudoCpuRow.appendChild(pseudoCpuLabel);
        waitingBox.appendChild(pseudoCpuRow);
      }

      // ブーストモード（ユーザー要望）。timerEnabled/includeBlackWhiteと同じく「開始ボタンを
      // 押した瞬間の設定を対局全体の固定値としてサーバー(BOOTSTRAP_GAME)へ送る」方式。
      const boostRow = document.createElement("label");
      boostRow.style.cssText =
        "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; margin-bottom: 0.5rem; font-size: 0.85rem; text-align: left;";
      const boostCheckbox = document.createElement("input");
      boostCheckbox.type = "checkbox";
      boostCheckbox.checked = pendingRoomBoost;
      boostCheckbox.addEventListener("change", () => {
        pendingRoomBoost = boostCheckbox.checked;
      });
      const boostLabel = document.createElement("span");
      boostLabel.textContent = "🚀 ブーストモード（両隣に効果なしファーストカードをロックして開始）";
      boostRow.appendChild(boostCheckbox);
      boostRow.appendChild(boostLabel);
      waitingBox.appendChild(boostRow);

      const startBtn = textButton(`ゲームを開始する（現在${count}名）`);
      // ログインパネルのボタン（renderLoginForm）と同じ理由で、display:blockを明示しないと
      // .header-tool-buttonの既定表示(inline-block)のせいで横並びになってしまう
      // （ユーザー報告のスクリーンショットで確認）。
      startBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
      startBtn.addEventListener("click", async () => {
        startBtn.disabled = true;
        try {
          await startGame(gameId, {
            timerEnabled: timerCheckbox.checked,
            includeBlackWhite: bwCheckbox.checked,
            pseudoCpuModeEnabled: pseudoCpuCheckbox.checked,
            boost: boostCheckbox.checked,
          });
          closePanel();
        } catch (err) {
          alert(err.message ?? String(err));
          startBtn.disabled = false;
        }
      });
      waitingBox.appendChild(startBtn);
    }

    const discordBtn = textButton("🔗 公式Discordを開く");
    discordBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-top: 0.5rem;";
    discordBtn.addEventListener("click", () => {
      window.open(OFFICIAL_DISCORD_URL, "_blank", "noopener,noreferrer");
    });
    waitingBox.appendChild(discordBtn);

    contentEl.appendChild(waitingBox);
  }

  const leaveBtn = textButton("この部屋を離れる");
  leaveBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
  leaveBtn.addEventListener("click", () => {
    leaveGame();
    stopWaitingBgm();
    setSavedRoomPassword(gameId, null);
    history.replaceState(null, "", location.pathname);
    // ユーザー要望「『この部屋を離れる』を押したら、また『オンラインで続ける』を
    // 押した時に出る画面に戻るようにしたい」への対応。以前はパネルごと閉じて
    // いたため、盤面がローカルのテストモード表示へ戻ってしまっていた。
    // leaveGame()でcurrentGameIdがnullに戻っているため、renderPanelContent()を
    // 呼び直せば自動的に部屋一覧（renderRoomChoice）が表示される。
    renderPanelContent();
  });
  contentEl.appendChild(leaveBtn);
}

export function openOnlinePanel() {
  onlineIntentActive = true;
  if (panelEl) return;
  backdropEl = createBackdrop(closePanel, { dim: true, zIndex: 10001 });
  panelEl = document.createElement("div");
  // ユーザー報告（続き92）「部屋を作るモーダルがスマホで小さい」への対応で、位置指定を
  // このinline styleからstyle.cssの#online-panelルールへ移した（victory-modal等、他の
  // 画面中央モーダルと同じ構成に揃える）。inline styleのまま残すと、後で追加する
  // body.is-phone-device #online-panel { transform: ... }（--center-modal-scale-phone
  // 一括調整グループへの合流）がinline styleに負けて効かなくなるため。
  panelEl.id = "online-panel";
  panelEl.appendChild(createModalCloseX(closePanel));
  contentEl = document.createElement("div");
  panelEl.appendChild(contentEl);
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
  renderPanelContent();
  // ユーザー要望「リアルタイムで作成された部屋が表示されるようにしたい」（続き65）。
  // まだどの部屋にも入っていない間はonRosterChange（特定の部屋のbroadcast）が使えない
  // ため、so7_gamesテーブル全体のPostgres Changesを購読し、変化のたびに一覧を含む
  // パネルを再描画する（renderPanelContentは現在の画面がroom-choiceでなければ実質
  // 無害に他の画面を再描画するだけなので、常に呼んで問題ない）。
  unsubscribeOpenRooms = subscribeToOpenRoomsChanges(() => {
    if (panelEl) renderPanelContent();
  });
  // isOnlineIntentActive()を見ているmain.js側の盤面表示（B/C/Dのダミーアバター・
  // セットアップボタン等をローカル専用として隠す判定）を、部屋を選ぶ前のこの時点から
  // 即座に反映させる（state.js自体は変化していないが、盤面側の再描画を強制する）。
  notifyListeners();
}

// マジックリンクのリンクを踏んで戻ってきた時など、ログイン状態が変わったら
// 開いているパネルの中身を更新する。main.jsの起動時に1回呼ぶ。
export function initOnlineUi() {
  onAuthChange(() => {
    if (panelEl) renderPanelContent();
  });

  // ユーザー要望「誰かが部屋に入ってきたら（相手側の他の操作を待たずに）リアルタイムで
  // 待機人数・『ゲームを開始する』ボタンに反映してほしい」への対応。online.js側で
  // 入室・退室・名前変更等のたびに発火する専用の通知（onRosterChange、notifyListeners()
  // より粒度が細かく盤面の駒移動等では発火しない）を購読し、パネルが開いている間だけ
  // 中身を最新化する。
  onRosterChange(() => {
    if (panelEl) renderPanelContent();
  });

  // 誰か1人が「ゲームを開始する」を押した瞬間、他の全クライアントでも部屋モーダルを
  // 自動で閉じる。turnPlayerがnull→非nullに変わった瞬間だけを検知する（離脱→再度別の
  // 部屋に入り直した時にturnPlayerがまたnullに戻るので、そのたびに再度検知できる）。
  let wasGameStarted = false;
  subscribe(() => {
    const started = Boolean(getState().turnPlayer);
    if (started && !wasGameStarted && isOnlineMode() && panelEl) {
      closePanel();
    }
    wasGameStarted = started;
  });
}
