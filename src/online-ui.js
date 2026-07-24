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
  getMyActiveGames,
  getRoomName,
  getMemberCount,
  getCurrentGameId,
  getMySeat,
  leaveGame,
  signOut,
  startGame,
  getDebugLog,
  onRosterChange,
} from "./online.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { subscribe, getState, isOnlineMode, notifyListeners } from "./state.js";
import { playWaitingBgm, stopWaitingBgm } from "./sound.js";

// 部屋名の文字数上限。部屋一覧・ヘッダーの部屋バッジ等、限られた幅に表示する箇所が
// 複数あるため、極端に長い部屋名で崩れないよう作成時点で制限する（サーバー側
// so7_create_roomでも同じ上限で切り詰める、両方で持たせるのは既存の他の入力欄と同じ方針）。
const ROOM_NAME_MAX_LENGTH = 20;

// ユーザー要望「対戦相手を待っている間、公式Discordを開くボタンを並べたい」への対応。
const OFFICIAL_DISCORD_URL = "https://discord.gg/stP78fswKx";

let panelEl = null;
let backdropEl = null;
let contentEl = null;

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
      await renderRoomChoice(user);
      if (myGeneration !== renderGeneration) return;
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

async function renderRoomChoice(user) {
  const title = document.createElement("div");
  title.style.cssText = "font-weight: bold; margin-bottom: 0.6rem;";
  // 匿名ログインの場合、user.emailはundefinedではなく空文字列になることがあるため、
  // ??ではなく||でフォールバックする（??だと""はnullish扱いされず素通りしてしまい、
  // 「オンライン対戦（）」のように空の括弧が表示されるバグになっていた）。
  title.textContent = `🌐 オンライン対戦（${user.email || "匿名ユーザー"}）`;
  contentEl.appendChild(title);

  // 誤って「この部屋を離れる」を押した・ブラウザを閉じて放置した等で今は部屋の外にいるが、
  // サーバー上にはまだ自分の座席が残っている対局中の部屋があれば、ここに表示して
  // ワンクリックで再開できるようにする（so7_leave_room/so7_join_room側の変更と対）。
  try {
    const activeGames = await getMyActiveGames();
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

  // 「部屋を作成」フォームは最初は畳んでおき、押した時だけ名前/パスワード入力を出す。
  const createToggleBtn = textButton("＋ 部屋を作成");
  createToggleBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-bottom: 0.6rem;";
  const createForm = document.createElement("div");
  createForm.style.cssText =
    "display: none; margin-bottom: 0.8rem; padding: 0.5rem; border: 1px solid rgba(148, 163, 184, 0.3); border-radius: 0.3rem;";
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
  createToggleBtn.addEventListener("click", () => {
    createForm.style.display = createForm.style.display === "none" ? "block" : "none";
  });
  contentEl.appendChild(createToggleBtn);
  contentEl.appendChild(createForm);

  // ユーザー要望「このモーダルに『更新』（部屋が増えてないか確認）みたいなボタンが
  // 欲しい」への対応。部屋一覧はパネルを開いた瞬間の1回きりの取得のため、開いたまま
  // 待っていても新しい部屋には気づけなかった。renderPanelContent()自体を呼び直す
  // （既存のrenderGenerationガードにより連打しても二重表示にはならない）。
  const listLabelRow = document.createElement("div");
  listLabelRow.style.cssText =
    "display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.3rem;";
  const listLabel = document.createElement("span");
  listLabel.style.cssText = "font-size: 0.85rem;";
  listLabel.textContent = "参加できる部屋:";
  listLabelRow.appendChild(listLabel);
  const refreshBtn = document.createElement("button");
  refreshBtn.type = "button";
  refreshBtn.textContent = "🔄 更新";
  refreshBtn.style.cssText =
    "font-size: 0.75rem; padding: 0.15rem 0.5rem; background: rgba(148, 163, 184, 0.15); " +
    "border: 1px solid rgba(148, 163, 184, 0.4); border-radius: 0.3rem; color: #e2e8f0; cursor: pointer;";
  refreshBtn.addEventListener("click", () => {
    renderPanelContent();
  });
  listLabelRow.appendChild(refreshBtn);
  contentEl.appendChild(listLabelRow);

  const listStatus = document.createElement("div");
  listStatus.style.cssText = "font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.3rem; min-height: 1.2em;";
  contentEl.appendChild(listStatus);

  const listContainer = document.createElement("div");
  contentEl.appendChild(listContainer);

  try {
    const rooms = await listOpenRooms();
    if (rooms.length === 0) {
      listStatus.textContent = "現在、参加できる部屋はありません。「＋ 部屋を作成」から作ってください。";
    } else {
      for (const room of rooms) listContainer.appendChild(buildRoomRow(room));
    }
  } catch (err) {
    listStatus.textContent = `一覧の取得に失敗しました: ${err.message ?? err}`;
  }

  // 部屋コード直接入力は、URL共有(?room=)からの参加や一覧に出てこない場合の保険として、
  // 折りたたみ式の補助手段として残す。
  const codeToggleBtn = textButton("部屋コードで参加");
  codeToggleBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-top: 0.8rem;";
  const codeForm = document.createElement("div");
  codeForm.style.cssText = "display: none; margin-top: 0.4rem;";
  const codeInput = textInput("部屋コード");
  codeInput.style.textTransform = "uppercase";
  const codeStatus = document.createElement("div");
  codeStatus.style.cssText = "font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.3rem; min-height: 1.2em;";
  const codeJoinBtn = textButton("参加する");
  codeJoinBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
  codeJoinBtn.addEventListener("click", async () => {
    const code = codeInput.value.trim().toUpperCase();
    if (!code) {
      codeStatus.textContent = "部屋コードを入力してください。";
      return;
    }
    codeStatus.textContent = "参加中...";
    codeJoinBtn.disabled = true;
    try {
      await joinRoom(code);
      history.replaceState(null, "", `?room=${code}`);
      await renderPanelContent();
    } catch (err) {
      codeStatus.textContent = `エラー: ${err.message ?? err}`;
      codeJoinBtn.disabled = false;
    }
  });
  codeForm.appendChild(codeInput);
  codeForm.appendChild(codeStatus);
  codeForm.appendChild(codeJoinBtn);
  codeToggleBtn.addEventListener("click", () => {
    codeForm.style.display = codeForm.style.display === "none" ? "block" : "none";
  });
  contentEl.appendChild(codeToggleBtn);
  contentEl.appendChild(codeForm);

  // 別の認証方法（メール/Google/匿名）を試したい時のため、ログアウトできるようにしておく
  // （一度ログインすると明示的にログアウトするまでそのブラウザにセッションが残り続ける）。
  const signOutBtn = textButton("ログアウト");
  signOutBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box; margin-top: 0.8rem;";
  signOutBtn.addEventListener("click", async () => {
    await signOut();
    await renderPanelContent();
  });
  contentEl.appendChild(signOutBtn);
}

async function renderRoomStatus(gameId) {
  const mySeat = getMySeat();
  let roomName = "セブンの部屋";
  try {
    roomName = await getRoomName(gameId);
  } catch (err) {
    // 名前が取れなくても部屋自体は表示・操作できるようにしておく
  }

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
      timerCheckbox.checked = true;
      const timerLabel = document.createElement("span");
      timerLabel.textContent = "⏳ ターンタイマーを使用する";
      timerRow.appendChild(timerCheckbox);
      timerRow.appendChild(timerLabel);
      waitingBox.appendChild(timerRow);

      const startBtn = textButton(`ゲームを開始する（現在${count}名）`);
      // ログインパネルのボタン（renderLoginForm）と同じ理由で、display:blockを明示しないと
      // .header-tool-buttonの既定表示(inline-block)のせいで横並びになってしまう
      // （ユーザー報告のスクリーンショットで確認）。
      startBtn.style.cssText = "display: block; width: 100%; box-sizing: border-box;";
      startBtn.addEventListener("click", async () => {
        startBtn.disabled = true;
        try {
          await startGame(gameId, { timerEnabled: timerCheckbox.checked });
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
