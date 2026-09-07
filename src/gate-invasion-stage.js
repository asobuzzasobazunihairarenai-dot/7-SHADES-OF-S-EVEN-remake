// ゲート侵攻ボーナスの「見た目の据え置き」（2026-09-07・ユーザー要望「ちゃんとリアルな順番に
// したい」）。
//
// ■ 何が問題だったか（この仕組みを作った理由）
// オンラインのゲート侵攻は、サーバー(so7-apply-action.ts)が NEXT_TURN の中で
// ①手札を半分奪う ②エターナル獲得 ③自ゲートのカード回収＋帰還 を**一度にまとめて確定**する。
// クライアントはそのあとで5段の案内（gate-invasion-modal.js）を流すため、
// **案内が始まる前にもう全部終わっている**——駒はターン終了と同時に自ゲートへワープ済み、
// 自ゲートのカードは消え、奪った札は自分の手札に増え、エターナルはロックエリアに入っている。
// 「奪う札をめくって当てる」儀式に至っては、めくる前に自分の手札を見れば答えが分かる状態だった。
//
// ■ なぜ今までのエターナル抑制（suppressedEternalLockRender）では直らなかったか（重要）
// 抑制の指示は online.js の fetchAndHydrate().then() の後＝**盤面を描き直したあと**にしか
// 出せなかった。つまり「一度描いてから隠す」ことしかできず、最初の一瞬は必ず見える。
// さらに ①到達効果の処理中は案内自体が数秒〜数十秒先送りされる（その間ずっと見えっぱなし）
// ②侵攻が2件続くと2件目には抑制が掛からない（キューが空の時しか掛けない作りだった）。
// 「演出開始時 → キューに積んだ時点」と何度も前倒ししてきたが、どれもこの境界の内側だった。
//
// ■ この仕組みの考え方
// **サーバーの確定は今までどおり一度にまとめて行う**（途中で通信が切れても対局は絶対に
// 止まらない・侵攻が半分だけ適用される事故も起きない）。変えるのは**描き方だけ**——
// 取り直しの**前**に、動く前のトークンの写しを控えておき、案内がその段に来るまで
// 「まだ動いていない姿」で描く。段が来たら控えを捨てて本当の状態を描く（＝そこで動いて見える）。
// 状態自体は一切触らないので、リロードすれば正しい盤面がそのまま出る。
//
// 呼ぶ場所は online.js の state_changed ハンドラで、fetchAndHydrate() より**前**。
// 同じ場所に markSelfHandled(ids) が「あとで付けたのでは遅い」という同じ理由で置いてある。
//
// 安全装置: ①案内のキューが空になったら必ず全解除 ②絶対上限（時間）で必ず全解除
// ③状態から消えたトークンの控えは描画時に自動で捨てる。控えは見た目だけなので、
// 取り残しても最悪「少し古い絵が数秒残る」だけで、対局の進行には影響しない。

import { logAction } from "./action-log.js";

// 案内が先送りされることがあるので長めに取る（それでも必ず切れる）。
const STAGE_MAX_MS = 120000;

// tokenId -> { attacker, group, token }。token が null の場合は「その札は存在しなかったことに
// する」＝描かない（獲得したエターナルは新しく生まれた札なので、動く前の姿が存在しない）。
let entries = new Map();
// 獲得したエターナル（新しく生まれた札でトークンidがイベントに載らないため、cardId で照合する）。
let hiddenEternals = [];
let expiresAt = 0;

function hasAnything() {
  return entries.size > 0 || hiddenEternals.length > 0;
}

function isExpired() {
  return hasAnything() && Date.now() > expiresAt;
}

function requestRerender() {
  try {
    window.dispatchEvent(new CustomEvent("admin:change"));
  } catch (err) {
    /* 描き直しが促せなくても、次の描画で必ず反映される */
  }
}

// ゲート侵攻③の帰還演出用。据え置き中の駒（＝まだ敵ゲートに乗っている姿）を返す。
// main.js がここから出発点を受け取り、解除したあとに自ゲートへ跳ばせる。
export function getStagedPiece(attacker) {
  for (const e of entries.values()) {
    if (e.attacker === attacker && e.group === "home" && e.token?.kind === "piece") {
      return { id: e.token.id, location: e.token.location };
    }
  }
  return null;
}

// #327 の「ロックしたお知らせだけが案内より先に出る」を確実に抑えるための判定。
export function isEternalStagedHidden(cardId) {
  return hiddenEternals.some((h) => h.cardId === cardId);
}

export function isGateInvasionStageActive() {
  if (isExpired()) clearGateInvasionStage();
  return hasAnything();
}

// events: サーバーが state_changed に載せてきた gateInvasionEvents。
// preTokens: 取り直し**前**（＝まだ何も動いていない）の state.tokens。
export function stageGateInvasionRender(events, preTokens) {
  if (!Array.isArray(events) || events.length === 0) return 0;
  const byId = new Map((preTokens ?? []).map((t) => [t.id, t]));
  // 新しい侵攻が届いたら、前回の控えは捨てる（描き分けの取り違えを避ける）。
  entries = new Map();
  hiddenEternals = [];
  let staged = 0;
  const add = (tokenId, attacker, group, token) => {
    if (!tokenId) return;
    entries.set(tokenId, { attacker, group, token: token ?? null });
    staged += 1;
  };
  for (const ev of events) {
    const attacker = ev?.attacker;
    if (!attacker) continue;
    // ①奪われる札: 案内が「奪う」段に来るまで、相手の手札に残っているように描く。
    // 攻撃側の画面では、これで**めくる前に自分の手札を見て答えを知る**こともできなくなる。
    for (const tid of ev.stolenTokenIds ?? []) add(tid, attacker, "steal", byId.get(tid));
    // ②エターナル: 動く前の姿が無い（新しく生まれた札）ので「まだ描かない」。
    //   ロック枠から押し出された札は、押し出される前＝ロック枠に残っているように描く。
    if (ev.eternalCardId) {
      // 獲得したエターナルのトークンidはイベントに載っていないため、cardId で照合する
      // （下の isStagedHiddenEternal 参照。取り直し後の state から引く必要があるため）。
      hiddenEternals.push({ attacker, cardId: ev.eternalCardId });
      staged += 1;
    }
    for (const b of ev.bumpedCards ?? []) add(b?.tokenId, attacker, "eternal", byId.get(b?.tokenId));
    // ③自ゲートのカードと駒: 案内が「帰還」の段に来るまで、盤面に残っている／敵ゲートに
    //   乗ったままに描く。
    for (const g of ev.gateCards ?? []) add(g?.tokenId, attacker, "home", byId.get(g?.tokenId));
    const piece = (preTokens ?? []).find((t) => t.kind === "piece" && t.player === attacker);
    if (piece) add(piece.id, attacker, "home", piece);
  }
  expiresAt = Date.now() + STAGE_MAX_MS;
  logAction("diag-gate-invasion-stage", { staged, events: events.length, hiddenEternals: hiddenEternals.length });
  return staged;
}

// 描画側から呼ぶ。返り値: null（そのまま描く） / {hidden:true}（描かない） /
// {token}（この写しの姿で描く）。
export function stagedRenderStateOf(token) {
  if (isExpired()) {
    clearGateInvasionStage();
    return null;
  }
  if (hiddenEternals.length > 0 && token.kind === "card" && token.location?.zone === "lock" && token.cardId) {
    for (const h of hiddenEternals) {
      if (h.cardId === token.cardId) return { hidden: true };
    }
  }
  const e = entries.get(token.id);
  if (!e) return null;
  if (!e.token) return { hidden: true };
  return { token: e.token };
}

// 案内がその段に来たら控えを捨てる（＝そこで初めて動いて見える）。
// group: "steal" | "eternal" | "home"。attacker を渡すとその人の分だけ。
export function releaseGateInvasionStage(attacker, group) {
  let released = 0;
  for (const [id, e] of [...entries]) {
    if (attacker && e.attacker !== attacker) continue;
    if (group && e.group !== group) continue;
    entries.delete(id);
    released += 1;
  }
  if (!group || group === "eternal") {
    const before = hiddenEternals.length;
    hiddenEternals = hiddenEternals.filter((h) => (attacker ? h.attacker !== attacker : false));
    released += before - hiddenEternals.length;
  }
  if (released > 0) {
    logAction("diag-gate-invasion-stage-release", { attacker: attacker ?? null, group: group ?? "all", released });
    requestRerender();
  }
  return released;
}

export function clearGateInvasionStage() {
  const had = entries.size > 0 || hiddenEternals.length > 0;
  entries = new Map();
  hiddenEternals = [];
  expiresAt = 0;
  if (had) requestRerender();
  return had;
}

// 状態から消えたトークンの控えを捨てる（描画のたびに呼ぶ。控えが実体より長生きしないように）。
export function pruneGateInvasionStage(stateTokens) {
  if (entries.size === 0) return false;
  const alive = new Set(stateTokens.map((t) => t.id));
  let dropped = false;
  for (const id of [...entries.keys()]) {
    if (!alive.has(id)) {
      entries.delete(id);
      dropped = true;
    }
  }
  return dropped;
}
