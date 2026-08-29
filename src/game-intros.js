// ゲーム開始時に出す「操作の説明」モーダル群（ユーザー要望2026-08-12「不具合報告みたいに、
// ゲーム開始時に出て『今後表示しない』を設定できる説明モーダルをいくつか」）。
//
// 方針: 毎ゲーム開始時に「まだ見ていない説明」を1つだけ出す（一度に大量に出して圧迫しない、
// 優しいオンボーディング）。各モーダルは「わかった」で既読＝次から出さない。まとめてオフに
// したい人向けに「この手の説明はもう出さない」も用意する。既読/全オフは端末のlocalStorageに保存。

import { createBackdrop } from "./ui-helpers.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ9

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
// UI英語化フェーズ9: 読み込み時に固定せず、呼ぶたびに現在の言語で組み立てる。
// key は表示済みの記録（localStorage）に使うので言語に関係なく不変。
function getIntros() {
  return [
    { key: "autoskip-v1", title: t("intro.autoskip.title"), body: t("intro.autoskip.body") },
    { key: "board-zoom-v1", title: t("intro.zoom.title"), body: t("intro.zoom.body") },
    { key: "emote-v1", title: t("intro.emote.title"), body: t("intro.emote.body") },
    // #89: 以前は「2D/3D切替」と「ちらつく時は2Dへ」の2つに分かれていて、どちらも2D/3D
    // ボタンの説明のため「2D3Dの紹介が2回出た」と見えていた。1つのモーダルに統合してある。
    { key: "view-2d3d-v1", title: t("intro.view.title"), body: t("intro.view.body") },
    { key: "keep-v1", title: t("intro.keep.title"), body: t("intro.keep.body") },
    { key: "action-log-v1", title: t("intro.log.title"), body: t("intro.log.body") },
  ];
}

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
    ok.textContent = t("intro.ok");
    ok.addEventListener("click", () => {
      close();
    });

    // 「今後このモーダルを表示しない」でこのモーダルを既読にする＝以後出さない（ユーザー要望）。
    const allOff = document.createElement("button");
    allOff.type = "button";
    allOff.className = "game-intro-alloff";
    allOff.textContent = t("intro.never");
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
  // 自己対戦（両席が疑似CPU＝スモークテスト等）では、操作する人間がいないうえ、説明モーダルの
  // 暗幕が盤面を暗くし続けてしまうため出さない（ユーザー報告2026-08-14「スモークテスト中に画面が
  // どんどん暗くなる」の主因の一つ）。admin.jsを静的importすると循環になるので動的importで確認
  // （[[circular-import-tdz-and-no-cache-bust]]。対局開始後なので全モジュール評価済みで安全）。
  try {
    const { isPseudoCpuIncludeSelf } = await import("./admin.js");
    if (isPseudoCpuIncludeSelf?.()) return;
  } catch { /* 取得失敗時は従来どおり出す */ }
  // condition付きの説明（例: 3D表示のときだけ出す flicker-2d-v1）は、条件を満たす時だけ対象にする。
  const next = getIntros().find((i) => !isSeen(i.key) && (!i.condition || i.condition()));
  if (!next) return;
  showing = true;
  try {
    await showOne(next);
  } finally {
    showing = false;
  }
}
