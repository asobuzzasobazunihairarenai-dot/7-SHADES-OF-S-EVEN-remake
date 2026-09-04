// はじめての人の「次にやること」カード（ユーザーと合意した③「新しく遊ぶ人の最初の10分を整える」）。
//
// 何が問題だったか: ホーム画面には8つのタイルが**全部同じ重さ**で並んでいて、初めて開いた人には
// どれから触ればいいのか分からない（物語チュートリアルが入口として用意されているのに、ショップや
// ランキングと見た目の優先度が同じ）。さらに、チュートリアルを終えた後も「次に何をすればいいか」の
// 案内が無く、そこで止まってしまう。
//
// 解決の方針: 新しいモードを足すのではなく、**今ある入口に順番を付けて1つだけ強調する**。
// ホームの一番上に「次にやること」を1枚だけ出し、押せばそのまま始まる。3歩（遊び方を覚える→
// CPUと1戦→誰かと対戦）を終えた人には**自動的に出なくなる**ので、慣れた人の邪魔をしない。
//
// 進捗の持ち方: 物語チュートリアルの進捗は既に eidos-story.js が localStorage＋アカウント同期で
// 持っている（tutorial_completed 等）ので**それをそのまま使う**。CPU戦/オンラインを遊んだかは
// ここで薄く1つずつ持つ（端末ローカル。アカウント同期までは不要＝「もう案内を出さない」ための
// 目印でしかないため）。
import { t } from "./ui-text.js";
import { isEidosProgress } from "./eidos-story.js";
import { registerSyncedPref } from "./pref-registry.js";

const KEY = "so7-first-steps-v1";

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}
function write(next) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 保存できなくても進行に影響は無い（案内がもう一度出るだけ） */
  }
}
function setFlag(flag) {
  const p = read();
  if (p[flag]) return;
  p[flag] = true;
  write(p);
}

// CPU戦を始めた／オンライン対局が始まった時に呼ぶ（案内を次の段階へ進めるための目印）。
export function noteCpuBattlePlayed() {
  setFlag("cpuPlayed");
}
export function noteOnlineMatchPlayed() {
  setFlag("onlinePlayed");
}
// 「もう案内はいらない」（✕）を押した人には二度と出さない。
export function dismissFirstSteps() {
  setFlag("dismissed");
}

// 今どの段階か。null なら案内を出さない（全部終わった／✕で消した）。
export function getFirstStep() {
  const p = read();
  if (p.dismissed) return null;
  // 物語チュートリアルを終えていない（＝遊び方をまだ知らない）。
  if (!isEidosProgress("tutorial_completed")) return "story";
  if (!p.cpuPlayed) return "cpu";
  if (!p.onlinePlayed) return "online";
  return null;
}

// 「次にやること」カードを作る。actions は各段階を実際に始める処理（ホーム側が持っている
// 入口をそのまま渡してもらう＝ここでは画面遷移の知識を持たない）。
// 出す必要が無ければ null を返す（呼び出し側は null を無視するだけでよい）。
export function buildFirstStepCard(actions) {
  const step = getFirstStep();
  if (!step) return null;
  const index = { story: 1, cpu: 2, online: 3 }[step];

  const card = document.createElement("div");
  card.id = "home-first-step";
  card.dataset.step = step;

  const badge = document.createElement("div");
  badge.className = "home-first-step-badge";
  badge.textContent = String(index);
  card.appendChild(badge);

  const body = document.createElement("div");
  body.className = "home-first-step-body";
  const label = document.createElement("div");
  label.className = "home-first-step-label";
  label.textContent = t("firstSteps.label");
  body.appendChild(label);
  const title = document.createElement("div");
  title.className = "home-first-step-title";
  title.textContent = t(`firstSteps.${step}.title`);
  body.appendChild(title);
  const desc = document.createElement("div");
  desc.className = "home-first-step-desc";
  desc.textContent = t(`firstSteps.${step}.desc`);
  body.appendChild(desc);
  card.appendChild(body);

  const go = document.createElement("button");
  go.type = "button";
  go.className = "home-first-step-go";
  go.textContent = t(`firstSteps.${step}.cta`);
  go.addEventListener("click", () => {
    actions?.[step]?.();
  });
  card.appendChild(go);

  const close = document.createElement("button");
  close.type = "button";
  close.className = "home-first-step-close";
  close.textContent = "✕";
  close.title = t("firstSteps.dismiss");
  close.setAttribute("aria-label", t("firstSteps.dismiss"));
  close.addEventListener("click", () => {
    dismissFirstSteps();
    card.remove();
  });
  card.appendChild(close);

  return card;
}

// アカウントにも保存する（pref-registry.js 参照）。別の端末で「1 遊び方を覚える」に
// 戻ってしまうと不自然なので、進み具合は本人に紐づける（物語チュートリアルの完了自体は
// 元からアカウント同期されている）。
registerSyncedPref("firstSteps", read, (v) => {
  if (!v || typeof v !== "object") return;
  // 「もう終わった」印は消さない方向にだけ揃える（どちらかの端末で進んでいれば進んだ扱い）。
  write({ ...read(), ...v });
});
