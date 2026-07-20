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
  getMemberCount,
  getCurrentGameId,
  getMySeat,
  leaveGame,
  signOut,
  startGame,
  getDebugLog,
} from "./online.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { subscribe, getState, isOnlineMode } from "./state.js";

let panelEl = null;
let backdropEl = null;
let contentEl = null;

function closePanel() {
  panelEl?.remove();
  backdropEl?.remove();
  panelEl = null;
  backdropEl = null;
  contentEl = null;
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
      renderRoomChoice(user);
    } else {
      await renderRoomStatus(gameId);
      if (myGeneration !== renderGeneration) return;
    }
  }

  contentEl.appendChild(buildDebugLogSection());
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

function renderRoomChoice(user) {
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem;";
  // 匿名ログインの場合、user.emailはundefinedではなく空文字列になることがあるため、
  // ??ではなく||でフォールバックする（??だと""はnullish扱いされず素通りしてしまい、
  // 「オンライン対戦（）」のように空の括弧が表示されるバグになっていた）。
  title.textContent = `🌐 オンライン対戦（${user.email || "匿名ユーザー"}）`;
  contentEl.appendChild(title);

  const createBtn = textButton("部屋を作成する");
  createBtn.style.marginBottom = "0.8rem";
  createBtn.addEventListener("click", async () => {
    createBtn.disabled = true;
    try {
      const gameId = await createRoom();
      history.replaceState(null, "", `?room=${gameId}`);
      await renderPanelContent();
    } catch (err) {
      alert(`部屋の作成に失敗しました: ${err.message ?? err}`);
      createBtn.disabled = false;
    }
  });
  contentEl.appendChild(createBtn);

  const joinLabel = document.createElement("div");
  joinLabel.style.cssText = "font-size: 0.85rem; margin-bottom: 0.3rem;";
  joinLabel.textContent = "部屋コードで参加:";
  contentEl.appendChild(joinLabel);

  const codeInput = document.createElement("input");
  codeInput.type = "text";
  codeInput.placeholder = "部屋コード";
  codeInput.style.cssText =
    "width: 100%; box-sizing: border-box; padding: 0.4rem; margin-bottom: 0.5rem; border-radius: 0.3rem; " +
    "border: 1px solid rgba(148, 163, 184, 0.4); background: rgba(255, 255, 255, 0.05); color: inherit; " +
    "text-transform: uppercase;";
  contentEl.appendChild(codeInput);

  const status = document.createElement("div");
  status.style.cssText = "font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.3rem; min-height: 1.2em;";
  contentEl.appendChild(status);

  // 座席はここでは選ばず（後で「ゲームを開始する」を押した瞬間にランダムに割り振られる）、
  // 部屋に参加するだけのシンプルな1ボタンにした。
  const joinBtn = textButton("参加する");
  joinBtn.style.marginBottom = "0.8rem";
  joinBtn.addEventListener("click", async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
      status.textContent = "部屋コードを入力してください。";
      return;
    }
    status.textContent = "参加中...";
    joinBtn.disabled = true;
    try {
      await joinRoom(code);
      history.replaceState(null, "", `?room=${code}`);
      await renderPanelContent();
    } catch (err) {
      status.textContent = `エラー: ${err.message ?? err}`;
      joinBtn.disabled = false;
    }
  });
  contentEl.appendChild(joinBtn);

  // 別の認証方法（メール/Google/匿名）を試したい時のため、ログアウトできるようにしておく
  // （一度ログインすると明示的にログアウトするまでそのブラウザにセッションが残り続ける）。
  const signOutBtn = textButton("ログアウト");
  signOutBtn.style.marginTop = "0.8rem";
  signOutBtn.addEventListener("click", async () => {
    await signOut();
    await renderPanelContent();
  });
  contentEl.appendChild(signOutBtn);
}

async function renderRoomStatus(gameId) {
  const mySeat = getMySeat();
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.4rem;";
  title.textContent = mySeat ? `🌐 部屋: ${gameId}（あなたは座席${mySeat}）` : `🌐 部屋: ${gameId}`;
  contentEl.appendChild(title);

  let count = 0;
  try {
    count = await getMemberCount(gameId);
  } catch (err) {
    // 人数取得に失敗しても部屋自体からは出られるようにしておく
  }
  const countEl = document.createElement("div");
  countEl.style.cssText = "font-size: 0.85rem; margin-bottom: 0.6rem;";
  countEl.textContent = mySeat
    ? `参加人数: ${count}人`
    : `参加人数: ${count}人（座席はゲーム開始時にランダムに決まります）`;
  contentEl.appendChild(countEl);

  const shareHint = document.createElement("div");
  shareHint.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.6rem;";
  shareHint.textContent = "この部屋コードを他のプレイヤーに共有してください。";
  contentEl.appendChild(shareHint);

  if (!mySeat && count >= 2) {
    const startBtn = textButton("ゲームを開始する");
    startBtn.style.marginRight = "0.4rem";
    startBtn.style.marginBottom = "0.4rem";
    startBtn.addEventListener("click", async () => {
      startBtn.disabled = true;
      try {
        await startGame(gameId);
        closePanel();
      } catch (err) {
        alert(err.message ?? String(err));
        startBtn.disabled = false;
      }
    });
    contentEl.appendChild(startBtn);
  }

  const leaveBtn = textButton("この部屋を離れる");
  leaveBtn.addEventListener("click", () => {
    leaveGame();
    history.replaceState(null, "", location.pathname);
    closePanel();
  });
  contentEl.appendChild(leaveBtn);
}

export function openOnlinePanel() {
  if (panelEl) return;
  backdropEl = createBackdrop(closePanel, { dim: true, zIndex: 10001 });
  panelEl = document.createElement("div");
  panelEl.id = "online-panel";
  panelEl.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: min(22rem, 92vw); background: rgba(15, 23, 32, 0.98);
    border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.5rem; padding: 1rem;
    z-index: 10002; font-family: sans-serif; color: #e2e8f0;
    box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
  `;
  panelEl.appendChild(createModalCloseX(closePanel));
  contentEl = document.createElement("div");
  panelEl.appendChild(contentEl);
  document.body.appendChild(backdropEl);
  document.body.appendChild(panelEl);
  renderPanelContent();
}

// マジックリンクのリンクを踏んで戻ってきた時など、ログイン状態が変わったら
// 開いているパネルの中身を更新する。main.jsの起動時に1回呼ぶ。
export function initOnlineUi() {
  onAuthChange(() => {
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
