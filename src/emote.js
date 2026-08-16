// エモート機能（続き78）。ユーザー要望「左下の巨大アバターを押すとマイページではなく
// エモートを選べるようにしたい。よろしく、ごめん、とか取り合ずそういうの！押すと
// 相手の画面の自分のアバターからその言葉が吹き出しで出る」。マイページへの入口は
// 続き77でオプションエリアのアイコンだけで足りるようになった（ユーザー確認済み）ため、
// 大アバターはエモート専用に転用する。
//
// 質問への回答で固まった仕様:
// ・候補は色分類も含めたやや多め（8〜12個）。この7色ゲームのカラーパレット
//   （--color-red等、board-layout.jsのCOLORSと同じ7色）を各ボタンの縁取りに使い、
//   ぱっと見で区別しやすくする（意味上の色分類ではなく見た目の分類）。
// ・吹き出しは対局中の他プレイヤー全員の画面（オンライン含む）に表示する。
//
// 表示先は「送信者本人の.player-avatar（盤面周囲、data-player属性で特定）」——
// 各クライアントは4座席分の.player-avatarを描画しているため、これは自分の画面にも
// 他プレイヤーの画面にも同じセレクタで存在する（main.jsのbuildPlayerZone参照）。
// オンライン中の配信はhand_effect_use等と同じ「見た目だけの合図」パターン
// （broadcastEmote/onEmoteEvents、online.js）。

import { getSelfSeat, isOnlineMode, broadcastEmote, onEmoteEvents } from "./online.js";

const COLOR_CYCLE = ["red", "blue", "yellow", "pink", "green", "purple", "orange"];
const EMOTE_LABELS = [
  "よろしく",
  "ごめん",
  "ナイス！",
  "ありがとう",
  "どんまい",
  "そうだね",
  "まって！",
  "がんばろう",
  "うーん…",
  "いいね！",
  "まけないよ！",
  "おつかれさま",
];
const EMOTES = EMOTE_LABELS.map((text, i) => ({ text, color: COLOR_CYCLE[i % COLOR_CYCLE.length] }));

let pickerEl = null;
let backdropEl = null;
// 自分の盤面アバター（.player-avatar[data-player=自分の座席]）は、admin.jsの
// isSelfBoardAvatarVisible()がデフォルトoff（「自分の分だけステータスエリアの
// 大アバターと重複して冗長」との既存判断）のため存在しないことが多い。その場合でも
// 送信者自身が反応を確認できるよう、openEmotePicker()に渡された大アバター要素を
// 覚えておき、ローカル送信時のフォールバック表示先にする。
let selfAvatarFallbackEl = null;

function closeEmotePicker() {
  pickerEl?.remove();
  pickerEl = null;
  backdropEl?.remove();
  backdropEl = null;
}

// anchorEl（大アバター要素）の右隣に開く、軽量なポップアップ。他のモーダルのような
// 暗転バックドロップではなく、外側クリックで閉じるだけの透明な当たり判定にする
// （エモートはテンポよく連投したい操作のため、画面を暗くして重さを出したくない）。
export function openEmotePicker(anchorEl) {
  selfAvatarFallbackEl = anchorEl ?? null;
  if (pickerEl) {
    closeEmotePicker();
    return;
  }
  backdropEl = document.createElement("div");
  backdropEl.id = "emote-picker-backdrop";
  backdropEl.addEventListener("click", closeEmotePicker);
  document.body.appendChild(backdropEl);

  pickerEl = document.createElement("div");
  pickerEl.id = "emote-picker";

  const title = document.createElement("div");
  title.id = "emote-picker-title";
  title.textContent = "エモートを選ぶ";
  pickerEl.appendChild(title);

  const grid = document.createElement("div");
  grid.id = "emote-picker-grid";
  for (const emote of EMOTES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "emote-picker-btn";
    btn.style.setProperty("--emote-color", `var(--color-${emote.color})`);
    btn.textContent = emote.text;
    btn.addEventListener("click", () => {
      sendEmote(emote.text);
      closeEmotePicker();
    });
    grid.appendChild(btn);
  }
  pickerEl.appendChild(grid);

  document.body.appendChild(pickerEl);

  if (anchorEl) {
    const rect = anchorEl.getBoundingClientRect();
    const pickerRect = pickerEl.getBoundingClientRect();
    let left = rect.right + 12;
    if (left + pickerRect.width > window.innerWidth - 8) left = window.innerWidth - pickerRect.width - 8;
    pickerEl.style.left = `${left}px`;
    pickerEl.style.bottom = `${Math.max(8, window.innerHeight - rect.bottom)}px`;
  }
}

function sendEmote(text) {
  const player = getSelfSeat();
  const shown = showEmoteBubble(player, text);
  // 自分の盤面アバターがデフォルト非表示（isSelfBoardAvatarVisible()）の場合、
  // 送信者自身には何も見えなくなってしまうため、大アバター（ステータスエリア）を
  // フォールバック表示先にする。
  if (!shown) attachBubble(selfAvatarFallbackEl, text);
  if (isOnlineMode()) broadcastEmote({ player, text });
}

// player本人の.player-avatar（盤面周囲、自分の画面にも相手の画面にも同じセレクタで
// 存在する）へ、吹き出しを一時的に追加する。ワンショット演出のため、他の同種演出
// （spawnArrivalBurst等）と同じ「使い捨てDOM要素、一定時間後にremove」パターン。
// 戻り値: 実際に表示できたか（対象アバターが存在したか）。
const EMOTE_BUBBLE_DURATION_MS = 3200;
function attachBubble(targetEl, text) {
  if (!targetEl) return false;
  const bubble = document.createElement("div");
  bubble.className = "emote-speech-bubble";
  bubble.textContent = text;
  targetEl.appendChild(bubble);
  setTimeout(() => bubble.remove(), EMOTE_BUBBLE_DURATION_MS);
  return true;
}
export function showEmoteBubble(player, text) {
  return attachBubble(document.querySelector(`.player-avatar[data-player="${player}"]`), text);
}

// 受信側（自分以外のクライアントから届いたエモート）。自分自身の発信はsendEmote内で
// 既にローカル表示済みのため、自分の座席からの合図は無視する（hand_effect_use受信側と
// 同じ判定パターン）。
onEmoteEvents(({ player, text }) => {
  if (player === getSelfSeat()) return;
  showEmoteBubble(player, text);
});
