// ゲーム開始時に出す「操作の説明」モーダル群（ユーザー要望2026-08-12「不具合報告みたいに、
// ゲーム開始時に出て『今後表示しない』を設定できる説明モーダルをいくつか」）。
//
// 方針: 毎ゲーム開始時に「まだ見ていない説明」を1つだけ出す（一度に大量に出して圧迫しない、
// 優しいオンボーディング）。各モーダルは「わかった」で既読＝次から出さない。まとめてオフに
// したい人向けに「この手の説明はもう出さない」も用意する。既読/全オフは端末のlocalStorageに保存。

import { createBackdrop } from "./ui-helpers.js";

const SEEN_PREFIX = "so7-intro-seen-";
const ALL_OFF_KEY = "so7-intros-all-off";

function isSeen(key) {
  try {
    return localStorage.getItem(SEEN_PREFIX + key) === "1";
  } catch {
    return false;
  }
}
function markSeen(key) {
  try {
    localStorage.setItem(SEEN_PREFIX + key, "1");
  } catch {
    /* 保存不可でも進行は続ける */
  }
}
function isAllOff() {
  try {
    return localStorage.getItem(ALL_OFF_KEY) === "1";
  } catch {
    return false;
  }
}
function setAllOff() {
  try {
    localStorage.setItem(ALL_OFF_KEY, "1");
  } catch {
    /* noop */
  }
}

// 出す説明の一覧（上から順に、まだ見ていない最初の1つを毎ゲーム開始時に出す）。
// ユーザー指定: 自動スキップ／盤面拡大・ミニロック／エモート／2D3D切替／キープ。
// 提案として「行動ログ」も追加（席を外して戻った時に役立つため）。
const INTROS = [
  {
    key: "autoskip-v1",
    title: "⏭️ 自動送り（オート）",
    body:
      "画面右下の『自動送り（オート）』をONにすると、自分の番でやることが無いフェイズを自動で飛ばし、" +
      "CPU戦では相手の手番も自動で進みます。OFFにすると1手ずつ自分のペースで進められます。",
  },
  {
    key: "board-zoom-v1",
    title: "🔍 盤面拡大・ミニロックエリア",
    body:
      "画面右下の『盤面拡大』で盤面を大きく見られます。拡大中に自分のロックエリアが画面から隠れると、" +
      "画面の上下に『ミニロックエリア』（各プレイヤーのロック状況・手札枚数・捨て場）が自動で表示されます。",
  },
  {
    key: "emote-v1",
    title: "😊 エモート",
    body:
      "自分のアバター（画面のステータス表示）をクリックすると、エモート（スタンプ）を選んで相手に送れます。" +
      "対戦の合図やリアクションにどうぞ。",
  },
  {
    // #89: 以前は「2D/3D切替」と「ちらつく時は2Dへ」の2つに分かれていて、どちらも2D/3D
    // ボタンの説明のため「2D3Dの紹介が2回出た」と見えていた。1つのモーダルに統合する。
    key: "view-2d3d-v1",
    title: "🔄 2D／3D 切替",
    body:
      "画面上部のアイコンで、盤面の見た目を2D（真上から）と3D（斜め見下ろし）に切り替えられます。" +
      "見やすい方でお楽しみください。なお3D表示は端末によって画面がちらついたり重くなることがあります。" +
      "その場合は2D表示に切り替えると安定します。",
  },
  {
    key: "keep-v1",
    title: "📌 キープ",
    body:
      "駒がカードに乗った時に出る『到達カード』の拡大表示は、『📌 キープ』を押すと自動では消えなくなり、" +
      "✕で閉じるまでターンを跨いでも残せます。後でゆっくり確認したい時にどうぞ。",
  },
  {
    key: "action-log-v1",
    title: "📜 行動ログ",
    body:
      "画面右上の📜アイコンで『行動ログ』を開けます。誰が何をしたかを日本語で振り返れるので、" +
      "席を外して戻った時などに便利です。",
  },
];

let showing = false;

function showOne(intro) {
  return new Promise((resolve) => {
    const backdrop = createBackdrop(() => {}, { dim: true, zIndex: 10600 }); // 外側クリックでは閉じない
    const modal = document.createElement("div");
    modal.className = "game-intro-modal";

    const title = document.createElement("div");
    title.className = "game-intro-title";
    title.textContent = intro.title;

    const body = document.createElement("div");
    body.className = "game-intro-body";
    body.textContent = intro.body;

    const actions = document.createElement("div");
    actions.className = "game-intro-actions";

    const close = () => {
      backdrop.remove();
      modal.remove();
      resolve();
    };

    const ok = document.createElement("button");
    ok.type = "button";
    ok.className = "game-intro-ok";
    // 「わかった」は既読にしない＝閉じるだけ。次の対戦でまた出る（ユーザー要望2026-08-13）。
    ok.textContent = "わかった";
    ok.addEventListener("click", () => {
      close();
    });

    // 「今後このモーダルを表示しない」でこのモーダルを既読にする＝以後出さない（ユーザー要望）。
    const allOff = document.createElement("button");
    allOff.type = "button";
    allOff.className = "game-intro-alloff";
    allOff.textContent = "今後このモーダルを表示しない";
    allOff.addEventListener("click", () => {
      markSeen(intro.key);
      close();
    });

    actions.appendChild(ok);
    actions.appendChild(allOff);
    modal.appendChild(title);
    modal.appendChild(body);
    modal.appendChild(actions);

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);
  });
}

// ゲーム開始時（スタートプレイヤー告知が閉じた後など）に呼ぶ。まだ見ていない説明を1つだけ出す。
// 全て見終わっている／全オフ設定なら何もしない（安全に空振り）。多重表示も防ぐ。
export async function maybeShowGameStartIntros() {
  if (showing) return;
  if (isAllOff()) return;
  // condition付きの説明（例: 3D表示のときだけ出す flicker-2d-v1）は、条件を満たす時だけ対象にする。
  const next = INTROS.find((i) => !isSeen(i.key) && (!i.condition || i.condition()));
  if (!next) return;
  showing = true;
  try {
    await showOne(next);
  } finally {
    showing = false;
  }
}
