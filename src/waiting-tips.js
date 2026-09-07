// 【ユーザー要望2026-09-07】「ランク戦のマッチング待ち画面、暇なので助かり情報や豆知識を
// 流すのはどうかな？」への対応。相手が見つかるまでの数十秒〜数分、画面には回転する輪と
// 「他に探している人がいません」しか出ておらず、待つだけの時間になっていた。
//
// 方針:
//   ・**ルールブック（docs/rulebook.md）と実装で確かめた事実だけ**を書く。うろ覚えの「たぶん
//     こうだったはず」は入れない（覚え違いをそのまま広めてしまうため）。
//   ・PCでしかできない操作（右クリック等）は入れない。スマホでも読んで役に立つものだけにする。
//   ・出す順番は毎回シャッフルする（同じ人が毎回同じ順で読まされないように）。
//   ・**待機画面が閉じたら必ず止める**（タイマーを取り残さない）。stop() を呼ぶだけで済むよう、
//     要素と停止関数をまとめて返す。
//
// 文言は ui-text.js の tip.* にあり、ja/en とも同じキーで並んでいる。
import { t } from "./ui-text.js";

// 表示するキーの一覧。ここへ足すだけで増やせる（ui-text.js に ja/en 両方を書くこと）。
const TIP_KEYS = [
  "tip.contact",
  "tip.contactNotMove",
  "tip.gateInvasion",
  "tip.lockOnce",
  "tip.deckRefill",
  "tip.usableWhileLocked",
  "tip.gomennasai",
  "tip.moveFallback",
  "tip.arrivalCombo",
  "tip.timeout",
  "tip.myDeck",
  "tip.boardZoom",
];

const SHOW_MS = 9000; // 1件を出しておく時間（読み切れる長さ＋飽きない長さ）
const FADE_MS = 420; // 切り替わりのふわっと（CSSの transition と揃えること）

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 待機画面へ差し込む「豆知識」の帯を作る。{ el, stop } を返す。
export function createWaitingTips({ showMs = SHOW_MS } = {}) {
  const el = document.createElement("div");
  el.className = "waiting-tips";

  const label = document.createElement("div");
  label.className = "waiting-tips-label";
  label.textContent = t("tip.label");
  el.appendChild(label);

  const body = document.createElement("div");
  body.className = "waiting-tips-body";
  el.appendChild(body);

  const order = shuffled(TIP_KEYS);
  let index = 0;
  let timer = null;
  let fadeTimer = null;
  let stopped = false;

  const put = (key) => {
    body.textContent = t(key);
    body.classList.remove("is-fading");
  };

  const next = () => {
    if (stopped) return;
    // いったん薄くしてから差し替える（読んでいる途中で瞬間的に入れ替わらないように）。
    body.classList.add("is-fading");
    fadeTimer = setTimeout(() => {
      if (stopped) return;
      index = (index + 1) % order.length;
      put(order[index]);
    }, FADE_MS);
  };

  put(order[0]);
  timer = setInterval(next, showMs);

  return {
    el,
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
      if (fadeTimer) clearTimeout(fadeTimer);
      timer = null;
      fadeTimer = null;
    },
  };
}
