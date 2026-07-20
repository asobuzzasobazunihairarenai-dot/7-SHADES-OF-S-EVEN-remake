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

let helpers = null; // { render, setSetupPendingTokenIds, maybeAnnounceLock, maybeTriggerCardArrivalForCard, triggerCardArrivalIfFaceUp, announceHandPickups }

export function registerRemoteMoveAnimatorHelpers(h) {
  helpers = h;
}

const FLIGHT_MS = 450;

// 直近でこのモジュールが把握しているトークンの位置スナップショット（id -> 簡易情報）。
let previousTokensById = new Map();

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

async function flyAndReveal(item, fromRect, table) {
  const el = table.querySelector(`[data-token-id="${item.id}"]`);
  if (!el) return;
  const toRect = el.getBoundingClientRect();
  if (fromRect) {
    const { done } = flyGhost(fromRect, toRect, getGhostImagePath(item.token), "setup-fly-card", FLIGHT_MS);
    await done;
  }
  el.classList.remove("is-setup-pending");
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
      if (item.kind === "pickup") continue;
      if (item.kind === "flip") {
        // 移動が無い＝飛翔ゴースト（document.body直下の2Dオーバーレイ）を経由する意味が
        // 無いため、その場で演出だけ直接発火する。
        triggerEffectsFor(item);
        continue;
      }
      let fromRect = null;
      if (item.kind === "move") fromRect = fromRects.get(item.id) || null;
      else if (item.kind === "new-lock") fromRect = getOriginPileRect(item.token.cardId);
      // new-cell-fadeはfromRectなし＝その場でフェードインするだけ。
      flyAndReveal(item, fromRect, table2); // 個々の飛翔は並行に進めてよいためawaitしない
    }
  });
}

// main.jsの新しいsubscribe()リスナー（オンラインゲーム開始アニメーション中は呼ばれない
// ようmain.js側でガード済み）から、hydrateState()のたびに呼ばれる。
export function handleHydrate() {
  const state = getState();
  if (!isOnlineMode()) {
    previousTokensById = snapshotOf(state);
    return;
  }
  if (!helpers) {
    previousTokensById = snapshotOf(state);
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
      items.push({ id: token.id, token, kind: "pickup", prevFaceUp: prev.faceUp });
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
