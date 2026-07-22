// オンライン対戦で「他プレイヤーの操作」を、Broadcast経由で受動的に受け取った時にも
// 目に見える形で再現する。main.jsのonDragEnd等は自分の操作については直接、移動元→移動先の
// アニメーション・到達演出・ロック演出・獲得通知を出しているが、Broadcast経由で届く
// 他人の操作には今まで何のフィードバックも無かった（盤面が黙って書き換わるだけ）。
//
// hydrateState()のたびに「直前のトークン一覧」と「今のトークン一覧」をid単位で突き合わせ、
// 位置が変わったトークンについて、対応する演出・通知を自分の操作と同じ関数で再現する。
// 自分自身の操作については、onDragEnd等が既にmarkSelfHandled()で対象トークンidを
// 「処理済み」としてマークしているため、ここでは二重に処理しない。
//
// main.js（実際のDOM構築処理・render()・演出関数を持つ）とはregisterRenderHelpers()経由の
// 注入で連携する（setup-animation.jsと同じ、循環import回避パターン）。

import { getState } from "./state.js";
import { isOnlineMode } from "./online.js";
import { flyGhost } from "./ghost-flight.js";
import { getCardImagePath, getCardBackImagePath } from "./cards-data.js";
import { getSkinImagePath } from "./piece-skins.js";
import { isSelfHandled } from "./self-handled-tokens.js";
import { getPlayerAvatar } from "./player-identity.js";
import { applyAvatarContent, getAvatarVariant } from "./avatar-render.js";

// ユーザー要望「点滅ハイライトの矢印・マスの色をそのプレイヤーの色にし、ミニアバターも
// 添えたい」への対応。この演出はターン制ゲームにおける「今まさにターンプレイヤーが
// 行った操作」を再現するものなので、その時点のturnPlayerを実行者とみなす
// （turn-timer.jsのgetPieceColorと同じ、駒のcolorを引くだけの小さな純粋関数のため、
// 依存関係を増やさないようここでも同じ実装を複製する）。
function getPieceColor(seat) {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === seat);
  return piece ? piece.color : null;
}

let helpers = null; // { render, setSetupPendingTokenIds, maybeAnnounceLock, maybeTriggerCardArrivalForCard, maybeTriggerCardArrivalForExposedCard, triggerCardArrivalIfFaceUp, announceHandPickups, findLocationElement }

export function registerRemoteMoveAnimatorHelpers(h) {
  helpers = h;
}

const FLIGHT_MS = 450;

// 直近でこのモジュールが把握しているトークンの位置スナップショット（id -> 簡易情報）。
let previousTokensById = new Map();

// 次回のhydrateでは、差分検知（新規出現・移動判定）を一切行わず、ベースラインの更新だけを
// 行う。ローカルモードの間は毎回trueにリセットしておくことで、オンラインへ切り替わった
// 直後の最初のhydrateが「ローカルの仮データ」と「実際の部屋の状態」を誤って比較してしまい、
// 全トークンが「新規出現」に見えてカード獲得通知が大量に誤発火する問題（部屋に参加した
// 瞬間、獲得していないのに獲得モーダルが複数出るバグの原因）を防ぐ。main.js側からも、
// セットアップ配布アニメーション中（このモジュール自体が丸ごと呼ばれない期間）が終わった
// 直後に明示的に呼んでもらう（skipNextHydrateDiff export）——配布アニメーション中は
// previousTokensByIdが更新されないため、終了直後の最初のhydrateで49マス・ファーストカード
// 全部が「新規出現」に見えてロック演出等が再生されてしまう問題（駒を初めて動かした瞬間に
// ゲーム開始時のロック演出が再発生するバグの原因）を防ぐ。
let skipNextDiff = true;

export function skipNextHydrateDiff() {
  skipNextDiff = true;
}

function isTableZone(location) {
  return location.zone === "cell" || location.zone === "lock";
}

function locationsEqual(a, b) {
  if (a.zone !== b.zone) return false;
  if (a.zone === "cell") return a.row === b.row && a.col === b.col;
  if (a.zone === "lock") return a.side === b.side && a.index === b.index;
  return a.player === b.player;
}

function snapshotOf(state) {
  const map = new Map();
  for (const t of state.tokens) {
    map.set(t.id, { kind: t.kind, location: t.location, faceUp: t.faceUp, cardId: t.cardId, color: t.color, player: t.player });
  }
  return map;
}

function getGhostImagePath(token) {
  if (token.kind === "piece") return getSkinImagePath(token.color, token.player);
  if (!token.cardId) return getCardBackImagePath(null);
  return token.faceUp ? getCardImagePath(token.cardId) : getCardBackImagePath(token.cardId);
}

// ロック行きで新規出現したカードの飛翔元。cardIdの接頭辞から出どころの山を推定する
// （first-/eternal-/それ以外→山札）。セル行きの裏向き新規出現は出どころを特定できないため
// この関数は呼ばない。
function getOriginPileRect(cardId) {
  const pileName = cardId.startsWith("first-") ? "first" : cardId.startsWith("eternal-") ? "eternal" : "deck";
  const el = document.querySelector(`.stack[data-pile="${pileName}"]`);
  return el ? el.getBoundingClientRect() : null;
}

// 移動元/移動先のマス・ロックスロット自体を一瞬点滅させる（駒・カードそのものではなく
// マスの縁を光らせる）。操作していないプレイヤーが「どこからどこへ動いたか」を見落とし
// にくくするための、控えめな合図。到達演出（光の柱、spawnArrivalBurst）とは別レイヤー
// （マス自体の縁の明滅 vs マス中央から立ち上る光の柱）なので、同時に発生しても見た目が
// 競合しない設計にしてある。長さは管理者モードで調整できる（--move-blink-duration、秒）。
// arrowには"down"（カードが置かれた側）または"up"（カードが取られた側）を渡すと、
// 点滅と一緒に方向を示す矢印も一瞬表示する（ユーザー要望：オンラインで相手がどこに
// 置いた/取ったのか分かりづらいので、区別しやすい矢印を出したい）。
function getMoveBlinkDurationMs() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--move-blink-duration").trim();
  const seconds = parseFloat(raw);
  return (Number.isNaN(seconds) ? 3 : seconds) * 1000;
}
// ユーザー報告「連続で置いたり取ったりした場合、時間内であっても前のアニメが
// 強制的に消えてしまう」への対応。以前は呼び出しのたびに素朴なsetTimeoutだけで
// クラス/矢印を消していたため、同じマスで短時間に複数回blinkLocationが呼ばれると、
// 先に仕掛けたタイマーが今回の分もろとも消してしまっていた（後から来た方の表示時間が
// 実質的に短縮される、または表示中に消える）。マスごとに「今何が予約されているか」を
// 憶えておき、新しい呼び出しが来たら前の予約を解除してから今回の分を予約し直す。
const pendingBlinkByHost = new WeakMap();

function blinkLocation(location, table, arrow = null) {
  const hostEl = helpers.findLocationElement?.(table, location);
  if (!hostEl) return;
  const durationMs = getMoveBlinkDurationMs();
  // ユーザー要望「点滅・矢印はそれを行ったプレイヤーの色にしたい、ミニアバターも
  // 添えたい」。この演出は常に「今のターンプレイヤーが行った操作」の再現なので、
  // その時点のturnPlayerを実行者とみなして色・アバターを決める。
  const actor = getState().turnPlayer;
  const color = actor ? getPieceColor(actor) : null;

  const pending = pendingBlinkByHost.get(hostEl);
  if (pending) {
    clearTimeout(pending.timeoutId);
    pending.arrowWrap?.remove();
  }

  hostEl.style.setProperty("--move-blink-color", color ? `var(--color-${color})` : "#ffffff");
  // 既に点滅中（前回のタイマーをキャンセルしただけでクラス自体は付いたまま）だと、
  // classList.addし直しても既に付いているクラスなのでCSSアニメーションが最初から
  // 再生し直されない。一度外してリフローを挟んでから付け直すことで、毎回きちんと
  // 最初から点滅を再生させる。
  hostEl.classList.remove("move-highlight-blink");
  void hostEl.offsetWidth;
  hostEl.classList.add("move-highlight-blink");

  let arrowWrap = null;
  if (arrow) {
    arrowWrap = document.createElement("div");
    arrowWrap.className = `move-blink-arrow is-${arrow}`;
    arrowWrap.style.setProperty("--move-blink-color", color ? `var(--color-${color})` : "#ffffff");
    // ユーザー要望「ミニアバターは矢印の上がいい」。DOM順=見た目の上下（.move-blink-arrowは
    // flex-direction: column）なので、アバターを先に足す。
    if (actor) {
      const avatarEl = document.createElement("div");
      avatarEl.className = "move-blink-arrow-avatar";
      applyAvatarContent(avatarEl, getAvatarVariant(getPlayerAvatar(actor), "front"));
      arrowWrap.appendChild(avatarEl);
    }
    // ユーザーが用意した色別の矢印画像（画像素材/アイコン/矢印/、7色×上/下）に差し替え。
    // 既にその色に着色済みの画像のため、CSS側で色を塗り直す必要は無い（--move-blink-color
    // は引き続きマス目の点滅・アバターの縁取りにだけ使う）。色が特定できない場合
    // （実行者不明・駒が見つからない等、通常は起こらない）は既定でredの画像にフォールバックする。
    const arrowGlyph = document.createElement("img");
    arrowGlyph.className = "move-blink-arrow-glyph";
    arrowGlyph.alt = "";
    arrowGlyph.src = `assets/icons/arrow-${color || "red"}-${arrow}.webp`;
    arrowWrap.appendChild(arrowGlyph);
    hostEl.appendChild(arrowWrap);
  }

  const timeoutId = setTimeout(() => {
    hostEl.classList.remove("move-highlight-blink");
    hostEl.style.removeProperty("--move-blink-color");
    arrowWrap?.remove();
    pendingBlinkByHost.delete(hostEl);
  }, durationMs);
  pendingBlinkByHost.set(hostEl, { timeoutId, arrowWrap });
}

async function flyAndReveal(item, fromRect, table, blinkDestination) {
  const el = table.querySelector(`[data-token-id="${item.id}"]`);
  if (!el) return;
  const toRect = el.getBoundingClientRect();
  if (fromRect) {
    const { done } = flyGhost(fromRect, toRect, getGhostImagePath(item.token), "setup-fly-card", FLIGHT_MS);
    await done;
  }
  el.classList.remove("is-setup-pending");
  // 場に「置かれた」到着マスなので常に↓（置いた）の矢印を出す。
  if (blinkDestination) blinkLocation(item.token.location, table, "down");
  triggerEffectsFor(item);
}

function triggerEffectsFor(item) {
  const token = item.token;
  if (token.location.zone === "lock") {
    const wasAlreadyLocked = item.kind === "move" && item.prevLocation.zone === "lock";
    helpers.maybeAnnounceLock?.(token.location, token.cardId, wasAlreadyLocked);
  }
  if (token.kind === "piece") {
    // 裏向きカードの上に他人の駒が到達した場合は、対話的な「オープンする/しない」選択肢を
    // 出さない（自分が動かしてもいない駒について開閉を選ばされる混乱を避けるため。表向き
    // カードへの到達演出のみ全員に再現する）。
    helpers.triggerCardArrivalIfFaceUp?.(token.location);
  } else if (token.kind === "card") {
    helpers.maybeTriggerCardArrivalForCard?.(token.location, token.cardId, token.faceUp);
    // 他プレイヤーがカードを動かした結果、移動元のマス/ロックスロットで駒の下に別のカードが
    // 新しく露出した場合も「到達」として再現する（main.jsのonDragEndと同じ考え方）。
    // 移動元と移動先が同じマスの場合（重なりの中で並び替えただけ等）は対象外にする。
    if (item.kind === "move") {
      const sameLocation =
        item.prevLocation.zone === token.location.zone &&
        (item.prevLocation.zone === "cell"
          ? item.prevLocation.row === token.location.row && item.prevLocation.col === token.location.col
          : item.prevLocation.side === token.location.side && item.prevLocation.index === token.location.index);
      if (!sameLocation) helpers.maybeTriggerCardArrivalForExposedCard?.(item.prevLocation);
    }
  }
}

function processMovedOrNew(items, table) {
  const fromRects = new Map();
  for (const item of items) {
    if (item.kind === "move") {
      const el = table.querySelector(`[data-token-id="${item.id}"]`);
      if (el) fromRects.set(item.id, el.getBoundingClientRect());
    }
  }

  // flipは位置が変わらずrender()時点で既に正しい（開いた後の）見た目になっているため、
  // 隠す必要がない（隠すと一瞬opacity:0になるだけ無駄なちらつきになる）。
  const hideIds = items.filter((i) => i.kind !== "pickup" && i.kind !== "flip").map((i) => i.id);
  if (hideIds.length > 0 && helpers.setSetupPendingTokenIds) {
    helpers.setSetupPendingTokenIds(new Set(hideIds));
  }

  // 手札への移動（獲得）は表示位置が動的なため飛翔させず、通知だけ出す（renderのタイミングは
  // 問わないのですぐ呼んでよい）。
  for (const item of items) {
    if (item.kind === "pickup") {
      helpers.announceHandPickups?.(item.token.location.player, [{ cardId: item.token.cardId, wasPublic: !!item.prevFaceUp }]);
    }
  }

  // 次のsubscribe(render)リスナーが走った後（マイクロタスク。hydrateState()のリスナー
  // ループは全て同期実行のため、次に登録されているgeneric renderリスナーが必ず先に完了
  // してから発火する）で、実際の飛翔・演出を行う。
  Promise.resolve().then(() => {
    if (helpers.setSetupPendingTokenIds) helpers.setSetupPendingTokenIds(new Set());
    const table2 = document.getElementById("game-table");
    if (!table2) return;
    for (const item of items) {
      if (item.kind === "pickup") {
        // 盤面/ロックから手札へ「取られた」場合、取られた側のマスを↑で点滅させる
        // （ユーザー要望：置いた時と同様、取った時も分かりやすくしたい）。山から直接
        // 手札へ引いた場合（prevLocationが無い）は該当マスが無いので対象外。
        if (item.prevLocation && isTableZone(item.prevLocation)) {
          blinkLocation(item.prevLocation, table2, "up");
        }
        continue;
      }
      if (item.kind === "flip") {
        // 移動が無い＝飛翔ゴースト（document.body直下の2Dオーバーレイ）を経由する意味が
        // 無いため、その場で演出だけ直接発火する。
        triggerEffectsFor(item);
        continue;
      }
      let fromRect = null;
      if (item.kind === "move") {
        fromRect = fromRects.get(item.id) || null;
        // 移動元は手札の場合もある（手札からロックへ等）。手札には点滅させる実マスが
        // 無いため、盤面/ロックからの移動の時だけ移動元も光らせる（↑＝取られた）。
        if (isTableZone(item.prevLocation)) blinkLocation(item.prevLocation, table2, "up");
      } else if (item.kind === "new-lock") fromRect = getOriginPileRect(item.token.cardId);
      // new-cell-fadeはfromRectなし＝その場でフェードインするだけ。
      // move/new-lock/new-cell-fadeはいずれも「場に何かが現れた/置かれた」ケースなので
      // 到着マスに↓（置いた）を出す。
      const blinkDestination = item.kind === "move" || item.kind === "new-lock" || item.kind === "new-cell-fade";
      flyAndReveal(item, fromRect, table2, blinkDestination); // 個々の飛翔は並行に進めてよいためawaitしない
    }
  });
}

// main.jsの新しいsubscribe()リスナー（オンラインゲーム開始アニメーション中は呼ばれない
// ようmain.js側でガード済み）から、hydrateState()のたびに呼ばれる。
export function handleHydrate() {
  const state = getState();
  if (!isOnlineMode()) {
    previousTokensById = snapshotOf(state);
    skipNextDiff = true;
    return;
  }
  if (!helpers) {
    previousTokensById = snapshotOf(state);
    return;
  }
  if (skipNextDiff) {
    previousTokensById = snapshotOf(state);
    skipNextDiff = false;
    return;
  }

  const items = [];
  for (const token of state.tokens) {
    if (isSelfHandled(token.id)) continue;
    const prev = previousTokensById.get(token.id);
    if (!prev) {
      // 新規出現（山から直接盤面/ロックへ引かれた等）。
      if (token.kind === "card" && token.location.zone === "lock" && token.faceUp && token.cardId) {
        items.push({ id: token.id, token, kind: "new-lock" });
      } else if (token.kind === "card" && token.location.zone === "cell") {
        items.push({ id: token.id, token, kind: "new-cell-fade" });
      } else if (token.kind === "card" && token.location.zone === "hand") {
        // 山から直接手札へドローされた場合（「1枚ドロー」ボタン等）。以前はこのケースが
        // 分類対象から漏れており、他プレイヤーがカードを引いても誰の画面にも獲得通知が
        // 出ないバグの原因だった（既存の"pickup"は「テーブル上のカードが手札へ移った」場合
        // しか扱っていない）。"pickup"kindをそのまま再利用する——山からのドローは必ず
        // 非公開情報として扱う（announceHandPickupsのwasPublic=false）。
        items.push({ id: token.id, token, kind: "pickup", prevFaceUp: false });
      }
      continue;
    }
    if (locationsEqual(prev.location, token.location) && prev.faceUp !== token.faceUp) {
      // 位置は変わらずfaceUpだけ変化＝その場でカードがオープンされた（駒の下の裏向き
      // カードを開いた時など）。"move"として扱うと不要なゴースト飛翔（document.body直下の
      // 2Dオーバーレイ）が発生し、盤面の3D階層内で本来手前にあるはずの駒より一瞬前面に
      // 描画されてしまうバグの原因になっていた。飛翔なしでその場に演出だけ発火する
      // 専用kindにする。
      items.push({ id: token.id, token, kind: "flip" });
      continue;
    }
    if (locationsEqual(prev.location, token.location)) continue;
    if (isTableZone(prev.location) && isTableZone(token.location)) {
      items.push({ id: token.id, token, kind: "move", prevLocation: prev.location });
    } else if (isTableZone(prev.location) && token.location.zone === "hand") {
      items.push({ id: token.id, token, kind: "pickup", prevFaceUp: prev.faceUp, prevLocation: prev.location });
    } else if (prev.location.zone === "hand" && isTableZone(token.location)) {
      // 手札からロック/盤面マスへ直接移動するケース（実際の対戦で最も一般的なロックの
      // やり方）。以前はこの向きの遷移が分類漏れしており、他プレイヤーの画面では
      // ロック演出が一切再生されないバグの原因だった。"move"kindをそのまま使う——
      // 移動前の実DOM要素（他プレイヤーの手札カードも実際に描画されている）から
      // fromRectが取れれば飛翔演出になり、取れなければ新規出現と同様その場で
      // フェードインする。prevLocation.zoneは"hand"なのでwasAlreadyLocked判定
      // （triggerEffectsFor参照）は正しくfalseになり、新規ロックとして扱われる。
      items.push({ id: token.id, token, kind: "move", prevLocation: prev.location });
    }
    // 手札→手札、手札→山等、その他の遷移は対象外（山へ送る操作はローカル版でも演出無し）。
  }

  previousTokensById = snapshotOf(state);

  if (items.length === 0) return;
  const table = document.getElementById("game-table");
  if (!table) return;
  processMovedOrNew(items, table);
}
