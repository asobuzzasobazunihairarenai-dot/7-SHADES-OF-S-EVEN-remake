// カード効果の決定的ユニットテスト（続き236、ユーザー要望2026-08-20「テスト関係を強化」）。
//
//   node test/effects.mjs
//
// 目的: 一番バグが多い「カード効果」そのものの“正しい結果”を、状態を作って効果を1回走らせて
// アサートする。自己対戦スモーク（クラッシュ/不変条件/詰みを広く見る）が届かない「この効果は
// この状況で正確にこう動くべき」をピンポイントで固定する回帰ネット。#147/#152/パーティー/
// 試練の儀式など、これまで実機でしか確認できなかった検証を恒久化する。
//
// しくみ: card-effect-engine.js の runArrivalEffect/runHandEffect は、状態を getState()（本物の
// state.js）から読み、状態変更・選択は helpers.* に委譲する。ここでは helpers を差し替え、
//   ・状態変更（moveAndSync/discardAndSync/drawCards/flipCard/placeFromDeck/swapPieces 等）→ 本物の
//     state.js のアクション（moveToken/sendTokenToPile/drawFromPile/flipToken/swapPieceLocations）を dispatch
//   ・選択（pickLocation/pickHandCard/pickPlayer/pickDiscardCost/pickArrivalOption/pickHandEffectOption/
//     declareColors 等）→ ケースに書いた台本(picks)を順に返す
//   ・演出/音/通知（announce*/celebrate/delay/…）→ no-op
// にする。つまり「本物の効果ロジック＋本物の state 遷移」を、DOM/演出/選択の層だけ差し替えて検証する。
// エンジンの動詞実装・選択肢の使用可否・コスト・色一致ルール等（＝エンジン層のバグ）を捕まえる
// （main.jsのDOM層＝露出到達コンボの発火/飛翔演出などは対象外。あちらは自己対戦スモーク＋実機で）。
//
// 前提: `npm install`（playwright）＋ `npx playwright install chromium` 済み。デプロイには含まれない。

import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8797;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webp": "image/webp", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".svg": "image/svg+xml", ".gif": "image/gif",
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".woff2": "font/woff2", ".woff": "font/woff",
};

// -------------------- テストケース（serializable） --------------------
// state: hydrateState に渡す最小の盤面。ctx: 効果に渡す文脈。picks: 台本（型ごとに順に消費）。
// expect: Node 側で最終 state に対して確認するアサーション。
// 盤面の座席→ロック辺: A=bottom, B=left, C=top, D=right（board-layout）。COLORS順=赤橙黄緑青桃紫。
const CASES = [
  {
    name: "ジャンプ台(到達): 2マス先へ移動し、このカード自身は手札に加えない",
    kind: "arrival",
    cardId: "red-jump-pad",
    // 自分の駒(6,3)。2マス上(4,3)にカードあり(移動先)。ジャンプ台自身は(6,3)に表向き。
    state: {
      activePlayers: ["A"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 6, col: 3 } },
        { id: "jump", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 6, col: 3 } },
        { id: "dest", kind: "card", cardId: "green-growing-trees", faceUp: false, location: { zone: "cell", row: 4, col: 3 } },
        { id: "mid", kind: "card", cardId: "blue-choosable-trap", faceUp: false, location: { zone: "cell", row: 5, col: 3 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "red-jump-pad", cardTokenId: "jump", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 6, col: 3 } },
    picks: { location: [{ row: 4, col: 3 }] },
    expect: [
      { kind: "pieceAt", player: "A", row: 4, col: 3 }, // 2マス先へ一気に移動した
      { kind: "tokenZone", id: "jump", zone: "cell" }, // 自分自身は手札に加わらず盤面に残る
      { kind: "tokenNotInHand", id: "jump", player: "A" },
    ],
  },
  {
    name: "白の意思の覚醒(到達): 場の表向きカードを全て捨てる（裏向きは残る）",
    kind: "arrival",
    cardId: "white-awakening",
    state: {
      activePlayers: ["A"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 6, col: 3 } },
        { id: "self", kind: "card", cardId: "white-awakening", faceUp: true, location: { zone: "cell", row: 6, col: 3 } },
        { id: "up1", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 0, col: 0 } },
        { id: "up2", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "cell", row: 0, col: 1 } },
        { id: "down1", kind: "card", cardId: "green-growing-trees", faceUp: false, location: { zone: "cell", row: 1, col: 0 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "white-awakening", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 6, col: 3 } },
    picks: {},
    expect: [
      // 捨てられたカードはトークンが消えて piles.discard に cardId として積まれる。
      { kind: "tokenGone", id: "up1" },
      { kind: "tokenGone", id: "up2" },
      { kind: "pileContains", pile: "discard", cardId: "red-jump-pad" },
      { kind: "pileContains", pile: "discard", cardId: "blue-choosable-trap" },
      { kind: "tokenZone", id: "down1", zone: "cell" }, // 裏向きは対象外＝残る
    ],
  },
  {
    name: "なないろの巨光(到達): 全員3枚ドロー、このカードを捨てる",
    kind: "arrival",
    cardId: "white-radiance",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 6, col: 3 } },
        { id: "self", kind: "card", cardId: "white-radiance", faceUp: true, location: { zone: "cell", row: 6, col: 3 } },
      ],
      // 山札に6枚（A×3, B×3ぶん）。末尾が一番上（popで引く）。
      piles: {
        deck: ["red-jump-pad", "red-jump-pad", "red-jump-pad", "blue-choosable-trap", "blue-choosable-trap", "blue-choosable-trap"],
        eternal: [], first: [], discard: [],
      },
    },
    ctx: { player: "A", cardId: "white-radiance", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 6, col: 3 } },
    picks: {},
    expect: [
      { kind: "handCount", player: "A", n: 3 },
      { kind: "handCount", player: "B", n: 3 },
      { kind: "deckLen", n: 0 },
      { kind: "tokenGone", id: "self" }, // 自身を捨てる＝トークンは消えて discard へ
      { kind: "pileContains", pile: "discard", cardId: "white-radiance" },
    ],
  },
  {
    name: "カウンターロック(到達): 一番少なくロックしているなら1枚ドロー（最少）",
    kind: "arrival",
    cardId: "red-counter-lock",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 6, col: 3 } },
        { id: "self", kind: "card", cardId: "red-counter-lock", faceUp: true, location: { zone: "cell", row: 6, col: 3 } },
        // B が1色ロック済み、A は0 → A が最少 → ドローする
        { id: "bl", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "lock", side: "left", index: 0 } },
      ],
      piles: { deck: ["green-growing-trees"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "red-counter-lock", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 6, col: 3 } },
    picks: {},
    expect: [
      { kind: "deckLen", n: 0 }, // 最少なので山札から1枚引いた（1→0）
      // 手札は「引いた1枚＋既定でこのカード自身が手札に加わる」で計2枚。
      { kind: "handCount", player: "A", n: 2 },
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" },
    ],
  },
  {
    name: "カウンターロック(到達): 最少でないならドローしない",
    kind: "arrival",
    cardId: "red-counter-lock",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 6, col: 3 } },
        { id: "self", kind: "card", cardId: "red-counter-lock", faceUp: true, location: { zone: "cell", row: 6, col: 3 } },
        // A が1色、B が0 → A は最少でない → ドローしない
        { id: "al", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "lock", side: "bottom", index: 0 } },
      ],
      piles: { deck: ["green-growing-trees"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "red-counter-lock", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 6, col: 3 } },
    picks: {},
    expect: [
      { kind: "deckLen", n: 1 }, // 最少でない＝ドローしない（山札そのまま）
      // 手札は既定でこのカード自身が加わる1枚のみ。
      { kind: "handCount", player: "A", n: 1 },
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" },
    ],
  },
  {
    name: "収穫と種まき(到達): 選んだマスの1枚を手札へ→手札から1枚をそのマスへ裏向きで置く",
    kind: "arrival",
    cardId: "orange-harvest-sow",
    state: {
      activePlayers: ["A"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 6, col: 3 } },
        { id: "self", kind: "card", cardId: "orange-harvest-sow", faceUp: true, location: { zone: "cell", row: 6, col: 3 } },
        { id: "target", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 2, col: 2 } },
        { id: "inhand", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "orange-harvest-sow", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 6, col: 3 } },
    // 1回目のlocation=拾うマス(2,2)、handCard=手札から置く札(inhand)、その置き先locationは同じマス(SAME_AS)
    picks: { location: [{ row: 2, col: 2 }], handCard: ["inhand"] },
    expect: [
      { kind: "tokenZone", id: "target", zone: "hand", player: "A" }, // 拾った
      { kind: "tokenAtCell", id: "inhand", row: 2, col: 2 }, // 手札の札をそのマスへ置いた
      { kind: "tokenFaceDown", id: "inhand" }, // 裏向きで
    ],
  },
  {
    name: "マスチェンジ(到達): 3マス以内の相手の駒と位置を入れ替える",
    kind: "arrival",
    cardId: "orange-mass-change",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "pieceB", kind: "piece", player: "B", location: { zone: "cell", row: 3, col: 5 } },
        { id: "self", kind: "card", cardId: "orange-mass-change", faceUp: true, location: { zone: "cell", row: 3, col: 3 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "orange-mass-change", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ row: 3, col: 5 }], player: ["B"] },
    expect: [
      { kind: "pieceAt", player: "A", row: 3, col: 5 },
      { kind: "pieceAt", player: "B", row: 3, col: 3 },
    ],
  },
  {
    name: "マスチェンジ(手札): 追色コストを払い、位置を入れ替える。カード自身は捨てる",
    kind: "hand",
    cardId: "orange-mass-change",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "pieceB", kind: "piece", player: "B", location: { zone: "cell", row: 3, col: 5 } },
        { id: "self", kind: "card", cardId: "orange-mass-change", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "orange-harvest-sow", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "orange-mass-change", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], location: [{ row: 3, col: 5 }], player: ["B"] },
    expect: [
      { kind: "pieceAt", player: "A", row: 3, col: 5 },
      { kind: "pieceAt", player: "B", row: 3, col: 3 },
      { kind: "tokenGone", id: "cost" }, // 追色コストで捨てた
      { kind: "pileContains", pile: "discard", cardId: "orange-harvest-sow" },
      { kind: "tokenGone", id: "self" }, // 手札効果はカード自身を捨てる
      { kind: "pileContains", pile: "discard", cardId: "orange-mass-change" },
    ],
  },
  {
    name: "増殖する樹々(手札): 山札から3枚を選んだ3マスへ裏向きで置く。カード自身は捨てる",
    kind: "hand",
    cardId: "green-growing-trees",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "green-growing-trees", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      // 山札の3枚（並び順＝末尾が一番上、popで引かれる）。中身は問わないので有効な cardId を3つ。
      piles: { deck: ["red-jump-pad", "blue-choosable-trap", "green-joint-construction"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "green-growing-trees", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }] },
    expect: [
      { kind: "tokenGone", id: "self" }, // 手札効果はカード自身を先に捨てる
      { kind: "pileContains", pile: "discard", cardId: "green-growing-trees" },
      { kind: "deckLen", n: 0 }, // 3枚とも引かれた
      { kind: "cardAtCell", row: 0, col: 0, faceUp: false },
      { kind: "cardAtCell", row: 0, col: 1, faceUp: false },
      { kind: "cardAtCell", row: 0, col: 2, faceUp: false },
      { kind: "boardCardCount", n: 3 },
    ],
  },
  {
    name: "選べる罠(手札): このカード自身を選んだマスへ裏向きで置く。カードは捨てず盤面に残る",
    kind: "hand",
    cardId: "blue-choosable-trap",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "blue-choosable-trap", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ row: 2, col: 2 }] },
    expect: [
      { kind: "tokenAtCell", id: "self", row: 2, col: 2 }, // 自身が盤面へ（keepsCardOnUse＝捨てない）
      { kind: "tokenFaceDown", id: "self" }, // 裏向きで置かれる
    ],
  },
  {
    name: "奇跡の森マンズウッド/eternal-green(手札): 追色1を払い1枚ドロー。カード自身は捨てる",
    kind: "hand",
    cardId: "eternal-green",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "self", kind: "card", cardId: "eternal-green", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "green-growing-trees", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: ["red-jump-pad"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "eternal-green", cardTokenId: "self" },
    picks: { discardCost: ["cost"] },
    expect: [
      // エターナル/ファーストカードは使用時に捨てない（is-usable-while-locked の特別枠、engine line 2028）
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" },
      { kind: "tokenGone", id: "cost" },
      { kind: "deckLen", n: 0 }, // 1枚ドロー
      { kind: "handCount", player: "A", n: 2 }, // self（残る）＋引いた1枚
    ],
  },
  {
    name: "ジャンプ台(手札): これをゲート以外の任意マスに表向きで置く。カードは残る",
    kind: "hand",
    cardId: "red-jump-pad",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "red-jump-pad", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ row: 2, col: 2 }] },
    expect: [
      { kind: "tokenAtCell", id: "self", row: 2, col: 2 },
      { kind: "tokenFaceUp", id: "self" }, // 表向きで置く
    ],
  },
  {
    name: "白の意思の覚醒(手札): 場の表向きカードの上に山札から1枚ずつ裏向きで置く。自身は捨てる",
    kind: "hand",
    cardId: "white-awakening",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "white-awakening", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "fc1", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 0, col: 0 } },
        { id: "fc2", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "cell", row: 1, col: 1 } },
      ],
      piles: { deck: ["green-growing-trees", "orange-harvest-sow"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "white-awakening", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: {},
    expect: [
      { kind: "tokenGone", id: "self" },
      { kind: "pileContains", pile: "discard", cardId: "white-awakening" },
      { kind: "deckLen", n: 0 }, // 表向き2マス分＝2枚置いた
      { kind: "boardCardCount", n: 4 }, // 元の2枚＋置いた2枚
    ],
  },
  {
    name: "なないろの巨光(手札): 全員3枚ドロー→このフェイズ終了。自身は捨てる",
    kind: "hand",
    cardId: "white-radiance",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "self", kind: "card", cardId: "white-radiance", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: ["red-jump-pad", "blue-choosable-trap", "green-growing-trees", "orange-harvest-sow", "yellow-gamble", "pink-present"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "white-radiance", cardTokenId: "self" },
    picks: {},
    expect: [
      { kind: "tokenGone", id: "self" },
      { kind: "deckLen", n: 0 }, // A3枚+B3枚
      { kind: "handCount", player: "A", n: 3 },
      { kind: "handCount", player: "B", n: 3 },
    ],
  },
  {
    name: "色落ちキャット(到達): これを捨てる→全員、手札を全て捨て1枚ドロー",
    kind: "arrival",
    cardId: "black-faded-cat",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "black-faded-cat", faceUp: true, location: { zone: "cell", row: 3, col: 3 } },
        { id: "ha", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "hb", kind: "card", cardId: "blue-choosable-trap", faceUp: false, location: { zone: "hand", player: "B" } },
      ],
      piles: { deck: ["green-growing-trees", "orange-harvest-sow"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "black-faded-cat", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: {},
    expect: [
      { kind: "tokenGone", id: "self" }, // DISCARD_SELF
      { kind: "pileContains", pile: "discard", cardId: "black-faded-cat" },
      { kind: "tokenGone", id: "ha" }, // A の手札を全捨て
      { kind: "tokenGone", id: "hb" }, // B の手札を全捨て
      { kind: "handCount", player: "A", n: 1 }, // 各1枚ドロー
      { kind: "handCount", player: "B", n: 1 },
      { kind: "deckLen", n: 0 },
    ],
  },
  {
    name: "色落ちキャット(手札): ロック1枚捨て→3枚ドロー。フェイズ終了。自身は先に捨てる",
    kind: "hand",
    cardId: "black-faded-cat",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "self", kind: "card", cardId: "black-faded-cat", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "la", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "lock", side: "bottom", index: 0 } },
      ],
      piles: { deck: ["green-growing-trees", "orange-harvest-sow", "yellow-gamble"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "black-faded-cat", cardTokenId: "self" },
    picks: { location: [{ zone: "lock", side: "bottom", index: 0 }] },
    expect: [
      { kind: "tokenGone", id: "self" }, // 手札効果は自身を先に捨てる
      { kind: "tokenGone", id: "la" }, // ロック1枚捨て
      { kind: "deckLen", n: 0 }, // 1枚×3ドロー
      { kind: "handCount", player: "A", n: 3 },
    ],
  },
  {
    name: "黒の契約の烙印(到達): 空いている自分のロックスロットにこれを表向きで置く",
    kind: "arrival",
    cardId: "black-contract-brand",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "black-contract-brand", faceUp: true, location: { zone: "cell", row: 3, col: 3 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "black-contract-brand", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ zone: "lock", side: "bottom", index: 0 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "lock" }, // ロックエリアへ
      { kind: "tokenFaceUp", id: "self" }, // 表向きで置く
    ],
  },
  {
    name: "黒の契約の烙印(手札): これを任意のマスに裏向きで置く。カードは残る",
    kind: "hand",
    cardId: "black-contract-brand",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "black-contract-brand", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "black-contract-brand", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ row: 4, col: 4 }] },
    expect: [
      { kind: "tokenAtCell", id: "self", row: 4, col: 4 },
      { kind: "tokenFaceDown", id: "self" },
    ],
  },
  {
    name: "収穫と種まき(手札): 拾う→手札から同じマスへ置き直す（inheritsArrival）。自身は先に捨てる",
    kind: "hand",
    cardId: "orange-harvest-sow",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "orange-harvest-sow", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "target", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 2, col: 2 } },
        { id: "inhand", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "orange-harvest-sow", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { location: [{ row: 2, col: 2 }], handCard: ["inhand"] },
    expect: [
      { kind: "tokenGone", id: "self" }, // 手札効果は自身を先に捨てる
      { kind: "tokenZone", id: "target", zone: "hand", player: "A" }, // 拾った
      { kind: "tokenAtCell", id: "inhand", row: 2, col: 2 }, // 手札の札を置いた
      { kind: "tokenFaceDown", id: "inhand" },
    ],
  },
  {
    name: "黄金の宮殿ドムス・ネロ/eternal-yellow(手札): 追色1→自分2枚・相手全員1枚ドロー",
    kind: "hand",
    cardId: "eternal-yellow",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "self", kind: "card", cardId: "eternal-yellow", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "yellow-gamble", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: ["red-jump-pad", "blue-choosable-trap", "green-growing-trees"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "eternal-yellow", cardTokenId: "self" },
    picks: { discardCost: ["cost"] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // エターナルは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "handCount", player: "A", n: 3 }, // self（残る）＋自分2枚ドロー
      { kind: "handCount", player: "B", n: 1 }, // 相手1枚ドロー
      { kind: "deckLen", n: 0 },
    ],
  },
  {
    name: "終わりなき化学ゲンテクニーク/eternal-purple(手札): 追色1→拾う→同じマスに山札から裏向きで置く",
    kind: "hand",
    cardId: "eternal-purple",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "eternal-purple", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "purple-trial-ritual", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "target", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 0, col: 0 } },
      ],
      piles: { deck: ["green-growing-trees"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "eternal-purple", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], location: [{ row: 0, col: 0 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // エターナルは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "tokenZone", id: "target", zone: "hand", player: "A" }, // 拾った
      { kind: "cardAtCell", row: 0, col: 0, faceUp: false }, // 山札から裏向きで置いた
      { kind: "deckLen", n: 0 },
    ],
  },
  {
    name: "月下の漂流船プリドゥエン/eternal-blue(手札): 追色1→任意2マスに山札から裏向きで置く",
    kind: "hand",
    cardId: "eternal-blue",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "eternal-blue", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: ["red-jump-pad", "green-growing-trees"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "eternal-blue", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], location: [{ row: 0, col: 0 }, { row: 0, col: 1 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // エターナルは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "cardAtCell", row: 0, col: 0, faceUp: false },
      { kind: "cardAtCell", row: 0, col: 1, faceUp: false },
      { kind: "deckLen", n: 0 },
    ],
  },
  {
    name: "橙のキューブ ハーベスト/first-orange(手札): 追色1→2マス以内の1枚を手札に加える",
    kind: "hand",
    cardId: "first-orange",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "first-orange", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "orange-harvest-sow", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "target", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 3, col: 4 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "first-orange", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], location: [{ row: 3, col: 4 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // ファーストは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "tokenZone", id: "target", zone: "hand", player: "A" }, // 2マス以内の1枚を手札へ
    ],
  },
  {
    name: "紅蓮の火山ワイナウエア/eternal-red(手札): 追色1→任意1マスのカードを全て捨てる",
    kind: "hand",
    cardId: "eternal-red",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "eternal-red", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "st1", kind: "card", cardId: "green-growing-trees", faceUp: true, location: { zone: "cell", row: 0, col: 0 } },
        { id: "st2", kind: "card", cardId: "blue-choosable-trap", faceUp: false, location: { zone: "cell", row: 0, col: 0 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "eternal-red", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], location: [{ row: 0, col: 0 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // エターナルは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "tokenGone", id: "st1" }, // そのマスのカードを全て捨てた
      { kind: "tokenGone", id: "st2" },
      { kind: "boardCardCount", n: 0 },
    ],
  },
  {
    name: "なないろの欠片(手札・選択肢): 1枚ドローを選ぶ",
    kind: "hand",
    cardId: "rainbow-shard",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "self", kind: "card", cardId: "rainbow-shard", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: ["red-jump-pad"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "rainbow-shard", cardTokenId: "self" },
    picks: { option: ["draw"] },
    expect: [
      { kind: "tokenGone", id: "self" }, // 「1枚ドロー」選択肢は keepsCardOnUse でないので自身を捨てる
      { kind: "deckLen", n: 0 }, // 1枚ドロー
      { kind: "handCount", player: "A", n: 1 },
    ],
  },
  {
    name: "選べる罠(到達・選択肢): 手札を半分捨てるを選ぶ",
    kind: "arrival",
    cardId: "blue-choosable-trap",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "cell", row: 3, col: 3 } },
        { id: "h1", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "h2", kind: "card", cardId: "green-growing-trees", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "h3", kind: "card", cardId: "yellow-gamble", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "blue-choosable-trap", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    // 3枚の手札の半分（端数切り捨て）＝1枚を選んで捨てる
    picks: { option: ["discard-half-hand"], handCard: ["h1"] },
    expect: [
      { kind: "tokenGone", id: "h1" }, // 半分（1枚）捨てた
      { kind: "pileContains", pile: "discard", cardId: "red-jump-pad" },
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // 到達効果カードは既定で手札へ
    ],
  },
  {
    name: "プレゼント(到達): 一番少なくロックしている全員が1枚ドロー（Aのみ最少）",
    kind: "arrival",
    cardId: "pink-present",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "pink-present", faceUp: true, location: { zone: "cell", row: 3, col: 3 } },
        // B が1色ロック済み、A は0 → A のみ最少 → A だけドロー
        { id: "bl", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "lock", side: "left", index: 0 } },
      ],
      piles: { deck: ["green-growing-trees"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "pink-present", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: {},
    expect: [
      { kind: "deckLen", n: 0 }, // A が1枚ドロー
      { kind: "handCount", player: "A", n: 2 }, // ドロー1枚＋既定でこのカード自身
      { kind: "handCount", player: "B", n: 0 }, // 最少でないB はドローしない
    ],
  },
  {
    name: "増殖する樹々(到達): 2マス以内の何もないマス全てに山札から裏向きで置く",
    kind: "arrival",
    cardId: "green-growing-trees",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        // 駒を角(0,0)に置き、範囲内5マスのうち4マスを埋めて空きを(2,0)の1つに限定する
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 0, col: 0 } },
        { id: "self", kind: "card", cardId: "green-growing-trees", faceUp: true, location: { zone: "cell", row: 0, col: 0 } },
        { id: "f1", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "cell", row: 0, col: 1 } },
        { id: "f2", kind: "card", cardId: "blue-choosable-trap", faceUp: true, location: { zone: "cell", row: 0, col: 2 } },
        { id: "f3", kind: "card", cardId: "yellow-gamble", faceUp: true, location: { zone: "cell", row: 1, col: 0 } },
        { id: "f4", kind: "card", cardId: "purple-trial-ritual", faceUp: true, location: { zone: "cell", row: 1, col: 1 } },
      ],
      piles: { deck: ["orange-harvest-sow"], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "green-growing-trees", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 0, col: 0 } },
    picks: {},
    expect: [
      { kind: "cardAtCell", row: 2, col: 0, faceUp: false }, // 唯一の空きマスへ置いた
      { kind: "deckLen", n: 0 },
    ],
  },
  {
    name: "黄のキューブ サフラン/first-yellow(手札): 追色1→2マス以内の裏向きカードを最大4枚オープン",
    kind: "hand",
    cardId: "first-yellow",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "first-yellow", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "yellow-gamble", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "d1", kind: "card", cardId: "red-jump-pad", faceUp: false, location: { zone: "cell", row: 3, col: 4 } },
        { id: "d2", kind: "card", cardId: "blue-choosable-trap", faceUp: false, location: { zone: "cell", row: 3, col: 2 } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "first-yellow", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], location: [{ row: 3, col: 4 }, { row: 3, col: 2 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // ファーストは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "tokenFaceUp", id: "d1" }, // オープン
      { kind: "tokenFaceUp", id: "d2" },
    ],
  },
  {
    name: "紫のキューブ ディメンション/first-purple(手札): 追色1→移動強化の案内のみ（自身は残る）",
    kind: "hand",
    cardId: "first-purple",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "self", kind: "card", cardId: "first-purple", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "purple-trial-ritual", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "first-purple", cardTokenId: "self" },
    picks: { discardCost: ["cost"] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // ファーストは使用時に捨てない
      { kind: "tokenGone", id: "cost" }, // 追色1を支払う
    ],
  },
  {
    name: "桃のキューブ セレナーデ/first-pink(手札): 追色1→手札1枚をロック（最後のロック不可）",
    kind: "hand",
    cardId: "first-pink",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "self", kind: "card", cardId: "first-pink", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "pink-present", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "lk", kind: "card", cardId: "red-jump-pad", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "first-pink", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    picks: { discardCost: ["cost"], handCard: ["lk"] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // ファーストは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "tokenZone", id: "lk", zone: "lock" }, // 手札1枚をロックした
    ],
  },
  {
    name: "結ばれの一本桜/eternal-pink(手札): 追色1→相手を自分の隣へ移動",
    kind: "hand",
    cardId: "eternal-pink",
    state: {
      activePlayers: ["A", "B"], turnPlayer: "A",
      tokens: [
        { id: "pieceA", kind: "piece", player: "A", location: { zone: "cell", row: 3, col: 3 } },
        { id: "pieceB", kind: "piece", player: "B", location: { zone: "cell", row: 3, col: 5 } },
        { id: "self", kind: "card", cardId: "eternal-pink", faceUp: true, location: { zone: "hand", player: "A" } },
        { id: "cost", kind: "card", cardId: "pink-present", faceUp: true, location: { zone: "hand", player: "A" } },
      ],
      piles: { deck: [], eternal: [], first: [], discard: [] },
    },
    ctx: { player: "A", cardId: "eternal-pink", cardTokenId: "self", pieceTokenId: "pieceA", pieceLocation: { zone: "cell", row: 3, col: 3 } },
    // 相手は1人→自動選択。自分(3,3)の隣接4マスから(3,4)を選ぶ
    picks: { discardCost: ["cost"], location: [{ row: 3, col: 4 }] },
    expect: [
      { kind: "tokenZone", id: "self", zone: "hand", player: "A" }, // エターナルは使用時に捨てない
      { kind: "tokenGone", id: "cost" },
      { kind: "pieceAt", player: "B", row: 3, col: 4 }, // 相手を自分の隣へ移動
    ],
  },
];

// -------------------- 台本を消費する fake helpers（page context 内で構築） --------------------
// 文字列として page.evaluate に渡す（関数を直接渡せないため）。runOne が state.js/engine を import して実行。
const PAGE_RUNNER = `
async (spec) => {
  const st = await import("/src/state.js");
  const eng = await import("/src/card-effect-engine.js");
  st.setOnlineMode(false);
  eng.setAutoProcessingEnabled(true); // 手札効果は canUseHandEffect→isHandEffectOptionUsable が自動処理ONを要求
  eng.resetHandEffectUsage?.(); // 「1ターンに1度」等の使用回数をケース間でリセット
  const hydrated = JSON.parse(JSON.stringify(spec.state));
  // 実ゲームの状態は turnNumber を必ず持つ。未指定だと isHandEffectDisabledThisTurn の
  // 「handEffectDisabledUntilTurn.get(id)(=undefined) === turnNumber(=undefined)」が誤って
  // true になり手札効果が使用不可になるため、数値の既定を入れておく（テスト用の補正）。
  if (typeof hydrated.turnNumber !== "number") hydrated.turnNumber = 1;
  st.hydrateState(hydrated);

  const picks = spec.picks || {};
  const cursors = {};
  const nextPick = (type) => {
    const arr = picks[type] || [];
    const i = cursors[type] || 0;
    cursors[type] = i + 1;
    return arr[i];
  };
  const callLog = [];
  const S = () => st.getState();
  const findToken = (id) => S().tokens.find((t) => t.id === id);

  // 選択候補(candidates)から、台本の指定に一致する候補を返す。指定は {row,col} / {zone,side,index} /
  // "index:N" / トークンid（handCard用）/ 生の値（player/option/colors）。
  const resolveLocation = (spec2, candidates) => {
    if (spec2 === "skip") return null; // 「これ以上選ばない」（allowSkip の効果を明示的に終了）
    if (spec2 == null) return candidates && candidates[0];
    if (typeof spec2 === "string" && spec2.startsWith("index:")) return candidates[parseInt(spec2.slice(6), 10)];
    if (spec2 && spec2.zone === "lock") return (candidates || []).find((c) => c.zone === "lock" && c.side === spec2.side && c.index === spec2.index) || spec2;
    if (spec2 && typeof spec2.row === "number") return (candidates || []).find((c) => c.zone === "cell" && c.row === spec2.row && c.col === spec2.col) || { zone: "cell", row: spec2.row, col: spec2.col };
    return spec2;
  };

  const helpers = {
    // --- 状態変更（本物の state.js を dispatch）---
    moveAndSync: async (tokenId, location, sound, suppressArrival) => { callLog.push(["moveAndSync", tokenId, location]); st.moveToken(tokenId, location, suppressArrival); },
    discardAndSync: async (tokenId, pile) => { callLog.push(["discard", tokenId, pile]); st.sendTokenToPile(tokenId, pile || "discard"); },
    drawCards: async (player, count) => { callLog.push(["draw", player, count]); for (let i = 0; i < count; i++) st.drawFromPile("deck", { zone: "hand", player }); },
    flipCard: async (tokenId) => { callLog.push(["flip", tokenId]); const t = findToken(tokenId); if (t && !t.faceUp) st.flipToken(tokenId); },
    placeFromDeck: async (location, faceUp) => { callLog.push(["placeFromDeck", location, faceUp]); st.drawFromPile("deck", location); if (faceUp) { const top = S().tokens.filter((t)=>t.kind==="card"&&t.location.zone===location.zone&&(location.zone==="cell"?t.location.row===location.row&&t.location.col===location.col:t.location.side===location.side&&t.location.index===location.index)); const last = top[top.length-1]; if (last && !last.faceUp) st.flipToken(last.id); } },
    placeFromDeckReveal: async (location) => { callLog.push(["placeFromDeckReveal", location]); st.drawFromPile("deck", location); },
    swapPieces: async (pieceTokenId, fromLocation, targetLocation) => {
      callLog.push(["swap", pieceTokenId, targetLocation]);
      const opp = S().tokens.find((t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === targetLocation.row && t.location.col === targetLocation.col);
      if (!opp) return;
      st.swapPieceLocations(pieceTokenId, opp.id, true); // 本物と同じ原子的入れ替え(ローカル)
    },
    swapRandomHandCard: async () => { callLog.push(["swapRandomHandCard"]); },
    pickRandomFromOpponentHand: async () => { callLog.push(["pickRandomFromOpponentHand"]); return null; },

    // --- 選択（台本を消費）---
    pickLocation: async (candidates) => { const r = resolveLocation(nextPick("location"), candidates); callLog.push(["pickLocation", r]); return r; },
    pickHandCard: async (player, filter) => {
      const want = nextPick("handCard");
      let tok = null;
      if (want && typeof want === "string" && want.startsWith("index:")) { const hand = S().tokens.filter((t)=>t.kind==="card"&&t.location.zone==="hand"&&t.location.player===player); tok = hand[parseInt(want.slice(6),10)]; }
      else if (want) tok = findToken(want);
      callLog.push(["pickHandCard", tok && tok.id]); return tok || null;
    },
    pickDiscardCost: async (candidates) => {
      // 追色コスト。engine は返り値の .id / .cardId を読む＝トークンを返す必要がある。
      const want = nextPick("discardCost");
      let tok = null;
      if (want && typeof want === "string" && want.startsWith("index:")) tok = (candidates || [])[parseInt(want.slice(6), 10)];
      else if (want) tok = (candidates || []).find((c) => c.id === want) || findToken(want);
      else tok = (candidates || [])[0];
      callLog.push(["pickDiscardCost", tok && tok.id]); return tok || null;
    },
    pickPlayer: async () => { const r = nextPick("player"); callLog.push(["pickPlayer", r]); return r; },
    // 選択肢モーダル: engine は選ばれた「オプションのオブジェクト」（.id/.actions/.usable）を期待する。
    // 台本には id 文字列を書く → 渡された options 配列から id 一致のオブジェクトを返す。
    pickArrivalOption: async (cardId, options) => { const want = nextPick("option"); const o = (options || []).find((x) => x.id === want) || null; callLog.push(["pickArrivalOption", want]); return o; },
    pickHandEffectOption: async (cardId, options) => { const want = nextPick("option"); const o = (options || []).find((x) => x.id === want) || null; callLog.push(["pickHandEffectOption", want]); return o; },
    declareColors: async () => { const r = nextPick("colors"); callLog.push(["declareColors", r]); return r; },
    gambleReveal: async () => { const r = nextPick("gamble"); callLog.push(["gambleReveal", r]); return r; },
    delegateToPlayer: async (p, taskType) => { callLog.push(["delegateToPlayer", p, taskType]); return false; },
    isLoopMoveDest: () => false,
    isCpuDriving: () => false,
    getPlayerName: (p) => p,

    // --- 演出/音/通知/その他（no-op）---
    announceCardAddedToHand: () => {}, announceColorsResolved: () => {}, announceDrawTargets: () => {},
    announceEffectChoice: () => {}, announceEffectNotice: () => {}, announceEffectReason: async () => {},
    announceFizzle: async () => {}, announceSteppedCard: () => {}, announceUse: () => {},
    beginPublicDrawDefer: () => {}, endPublicDrawDefer: () => {}, celebrate: () => {}, delay: async () => {},
    drawFromDiscard: async () => {}, endCurrentPhase: () => {}, flyCardToHand: async () => {},
    markDiscardAtTurnEnd: () => {}, markPlacedLocation: () => {}, markPlacementTarget: () => {},
    maybeTriggerArrivalForPlacedCard: async () => {}, onCardAcquiredToHand: () => {},
    playAdditionalColorUse: () => {}, publicDraw: async () => {}, publicDrawReturningTokens: async () => [],
    publicDrawThenReveal: async () => {}, recordMoveVisited: () => {}, startSuspenseSound: () => {},
    stopSuspenseSound: () => {}, triggerArrivalAtIfFaceUp: async () => {},
  };

  // 手札効果ケースの失敗調査用の軽い診断（DEBUG_CALLS 時のみ出力）。
  let diag = null;
  if (spec.kind === "hand") {
    try {
      const opts = eng.getHandEffectOptions(spec.ctx.cardId);
      diag = {
        canUse: eng.canUseHandEffect(spec.ctx.cardId, spec.ctx.cardTokenId, spec.ctx.player),
        options: opts.map((o) => ({ label: o.label, cost: o.cost, actions: o.actions, inh: o.inheritsArrival, usable: eng.isHandEffectOptionUsable(spec.ctx.cardId, spec.ctx.cardTokenId, spec.ctx.player, o) })),
      };
    } catch (e) { diag = { probeError: String(e) }; }
  }
  try {
    if (spec.kind === "arrival") await eng.runArrivalEffect(spec.ctx, helpers);
    else await eng.runHandEffect(spec.ctx, helpers);
  } catch (e) {
    return { error: String(e && e.stack || e), calls: callLog, tokens: S().tokens, piles: S().piles, diag };
  }
  return { calls: callLog, tokens: S().tokens, piles: S().piles, diag };
}
`;

// -------------------- アサーション（Node 側） --------------------
function tokenById(res, id) { return res.tokens.find((t) => t.id === id); }
function checkExpect(res, exp) {
  const t = exp.id ? tokenById(res, exp.id) : null;
  switch (exp.kind) {
    case "tokenZone":
      if (!t) return `token ${exp.id} が見つからない`;
      if (t.location.zone !== exp.zone) return `token ${exp.id} は zone=${t.location.zone}（期待 ${exp.zone}）`;
      if (exp.player && t.location.player !== exp.player) return `token ${exp.id} は player=${t.location.player}（期待 ${exp.player}）`;
      return null;
    case "tokenNotInHand":
      if (t && t.location.zone === "hand" && t.location.player === exp.player) return `token ${exp.id} が手札(${exp.player})に入ってしまった`;
      return null;
    case "tokenAtCell":
      if (!t) return `token ${exp.id} が見つからない`;
      if (!(t.location.zone === "cell" && t.location.row === exp.row && t.location.col === exp.col)) return `token ${exp.id} は ${JSON.stringify(t.location)}（期待 cell ${exp.row},${exp.col}）`;
      return null;
    case "tokenFaceDown":
      if (!t) return `token ${exp.id} が見つからない`;
      if (t.faceUp) return `token ${exp.id} が表向き（期待 裏向き）`;
      return null;
    case "tokenFaceUp":
      if (!t) return `token ${exp.id} が見つからない`;
      if (!t.faceUp) return `token ${exp.id} が裏向き（期待 表向き）`;
      return null;
    case "tokenGone":
      if (t) return `token ${exp.id} がまだ存在する（期待 消滅＝山/捨て場へ）`;
      return null;
    case "pileContains": {
      const pile = res.piles[exp.pile] || [];
      const n = pile.filter((cid) => cid === exp.cardId).length;
      if (exp.n != null) { if (n !== exp.n) return `${exp.pile} の ${exp.cardId} が ${n}枚（期待 ${exp.n}）`; return null; }
      if (n < 1) return `${exp.pile} に ${exp.cardId} が無い`;
      return null;
    }
    case "pieceAt": {
      const p = res.tokens.find((x) => x.kind === "piece" && x.player === exp.player);
      if (!p) return `駒 ${exp.player} が見つからない`;
      if (!(p.location.zone === "cell" && p.location.row === exp.row && p.location.col === exp.col)) return `駒 ${exp.player} は ${JSON.stringify(p.location)}（期待 cell ${exp.row},${exp.col}）`;
      return null;
    }
    case "handCount": {
      const n = res.tokens.filter((x) => x.kind === "card" && x.location.zone === "hand" && x.location.player === exp.player).length;
      if (n !== exp.n) return `${exp.player} の手札 ${n}枚（期待 ${exp.n}）`;
      return null;
    }
    case "deckLen":
      if ((res.piles.deck || []).length !== exp.n) return `山札 ${(res.piles.deck || []).length}枚（期待 ${exp.n}）`;
      return null;
    case "cardAtCell": {
      // 任意のカードトークンが指定マスにあるか（配置系＝新規idのカードを id 指定なしで検査）。
      const cards = res.tokens.filter((x) => x.kind === "card" && x.location.zone === "cell" && x.location.row === exp.row && x.location.col === exp.col);
      if (cards.length === 0) return `cell ${exp.row},${exp.col} にカードが無い`;
      if (exp.faceUp != null && !cards.some((c) => !!c.faceUp === !!exp.faceUp)) return `cell ${exp.row},${exp.col} のカードが期待の向き(${exp.faceUp ? "表" : "裏"})でない`;
      return null;
    }
    case "boardCardCount": {
      const n = res.tokens.filter((x) => x.kind === "card" && x.location.zone === "cell").length;
      if (n !== exp.n) return `盤面のカード ${n}枚（期待 ${exp.n}）`;
      return null;
    }
    default:
      return `未知のアサーション ${exp.kind}`;
  }
}

// -------------------- 実行 --------------------
async function main() {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split("?")[0]);
    if (p === "/") p = "/index.html";
    const fp = path.join(ROOT, p);
    fs.readFile(fp, (e, d) => {
      if (e) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "application/octet-stream" });
      res.end(d);
    });
  });
  await new Promise((r) => srv.listen(PORT, r));

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("so7-disable-update-checker", "1");
      localStorage.setItem("so7-bgm-intro-shown-v1", "1");
      localStorage.setItem("so7-intros-all-off", "1");
    } catch (e) {}
  });
  await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: "load" });
  await page.waitForTimeout(2500);

  let pass = 0, fail = 0;
  for (const c of CASES) {
    const res = await page.evaluate(async ({ fn, spec }) => {
      const run = eval("(" + fn + ")");
      return await run(spec);
    }, { fn: PAGE_RUNNER, spec: c });

    if (res && res.error) {
      fail++;
      console.log(`❌ ${c.name}\n   例外: ${res.error.split("\n")[0]}`);
      continue;
    }
    const fails = [];
    for (const exp of c.expect) {
      const msg = checkExpect(res, exp);
      if (msg) fails.push(msg);
    }
    if (fails.length === 0) {
      pass++;
      console.log(`✅ ${c.name}`);
    } else {
      fail++;
      console.log(`❌ ${c.name}`);
      for (const m of fails) console.log(`   - ${m}`);
      if (process.env.DEBUG_CALLS) {
        console.log(`   calls: ${JSON.stringify(res.calls)}`);
        if (res.diag) console.log(`   diag: ${JSON.stringify(res.diag)}`);
      }
    }
  }

  console.log(`\n${pass}/${pass + fail} PASS` + (fail ? ` ❌ (${fail} FAIL)` : " ✅"));
  await browser.close();
  srv.close();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
