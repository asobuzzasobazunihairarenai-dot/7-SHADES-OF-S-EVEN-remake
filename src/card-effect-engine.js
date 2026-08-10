// カード効果の自動処理エンジン。src/card-effects.jsの構造化データ（動詞＋パラメータ）を
// 実際にゲーム状態へ適用する。ユーザー確認済み方針:
// ・基本設定でON/OFFを選べる（デフォルトOFF、既存の自己申告プレイを壊さないため）。
// ・構造化データを持つカード（CARD_EFFECTSに.arrival/.arrivalOptions/.handEffectの
//   いずれかを持つカード）だけを自動処理の対象にし、それ以外は今まで通り自己申告のまま。
//   全33種類のカードは既にCARD_EFFECTSにデータを持っている（docs/cards.mdの
//   「収録状況」参照、続き55で確認済み）。
//
// 手札効果（■）の自動処理も既に対応済み（下のrunHandEffect/canUseHandEffect参照。
// main.js側のドラッグ/クリックでの発動トリガーはhasHandEffectData/canUseHandEffectを
// 見て判定している）——このコメントは初期の設計試作時点（構造化データがパイロット5枚
// しかなく、手札効果はまだ未着手だった頃）のもので、その後の実装で古くなっていた。
//
// このモジュール自身はDOM操作を一切行わない（main.jsから、実際に駒・カードを動かす
// 関数とプレイヤーに選ばせる関数を`helpers`として渡してもらう、他の箇所と同じ
// 「呼び出し元に注入してもらう」設計）。

import { getState } from "./state.js";
import { VERBS, TARGETS, TARGET_SELECTIONS, CARD_EFFECTS } from "./card-effects.js";
import { getCardDefinition } from "./cards-data.js";
import { COLORS, SEAT_TO_SIDE, SIDE_TO_SEAT, GATE_POSITIONS, SEAT_ORDER } from "./board-layout.js";
import { logAction } from "./action-log.js";
// 桃のキューブ セレナーデ専用（LOCK_ONE_HAND_CARD_EXCEPT_FINAL）:「最後のロックは
// できない」の判定に、victory.jsの既存の「最後のロック承認」機能用の関数
// （main.jsの通常ドロップ処理でも使っている）をそのまま流用する。victory.jsは
// card-effect-engine.jsを（直接にも間接にも）importしていないため循環参照の
// 心配はない。
import { wouldCompleteLockWithNewIndex } from "./victory.js";

// ユーザー確認済み「効果自動処理は基本設定でON/OFFを選べるように」。他の「アニメーションを
// 減らす」設定（motion-prefs.js）と同じくセッション限りの設定（ページ再読み込みで
// デフォルトに戻る）。まだ試験運用中の機能のため、アカウントへの永続化はしない。
// ユーザー要望（続き63）によりデフォルトをONに変更（以前はOFF）。
let autoProcessingEnabled = true;

// 試練の儀式（RITUAL_PLACE_MOVE_REPEAT）の再入ガード（不具合#46）。オンラインで到達効果が二重に
// 発火する（同じカードの arrival が depth1/depth2 で連続して起きる）と、儀式が二重に走って色宣言
// モーダルが重なり「選択しても閉じない」等の異常になっていた。儀式は同時に2つ走ることは無いので、
// 既に処理中なら2つ目は即座に何もしないで抜ける。
let ritualPlaceMoveInProgress = false;
export function isAutoProcessingEnabled() {
  return autoProcessingEnabled;
}
export function setAutoProcessingEnabled(v) {
  autoProcessingEnabled = !!v;
}

// このカードの到達効果を自動処理してよいか（設定がON、かつ構造化データを持っている）。
// 選べる罠のように`arrival`ではなく`arrivalOptions`（複数選択肢から1つ選ぶ形の
// 到達効果）でデータを持つカードも対象に含める。
export function canAutoProcessArrival(cardId) {
  return autoProcessingEnabled && !!(CARD_EFFECTS[cardId]?.arrival || CARD_EFFECTS[cardId]?.arrivalOptions);
}

// ユーザー確認済み「手品師の技の『いつでも使える』はゲート侵攻処理を含む効果の処理中
// 以外はいつでも使えるという意味」。main.js側がこれを見て、ハンドフェイズ以外でも
// ドラッグでの発動を許可するかどうかを判断する（handEffectOptionsを持つカード
// ＝複数選択肢のあるカードにはこの概念は今のところ無いため対象外）。
export function isHandEffectUsableAnytime(cardId) {
  return !!CARD_EFFECTS[cardId]?.handEffect?.usableAnytime;
}

// --- 手札効果（■）の自動処理 -----------------------------------------------------------
// 「１ターンに１度のみ」等の使用回数制限（黄金の宮殿）は、セッション限りの試験運用の方針
// （アカウントには一切保存しない）に合わせ、このモジュール内のメモリだけで追跡する。
// キーは`${cardId}:${player}`、値は{turnNumber, count}（state.jsのturnNumberが変われば
// 新しいターンとみなしリセットする——NEXT_TURNのたびに+1されるだけの単純増加値のため、
// 「前回記録した時のturnNumberと今のturnNumberが違う」で「ターンが変わった」を判定できる）。
const handEffectUsage = new Map();
function usageKey(cardId, player) {
  return `${cardId}:${player}`;
}
function usageCountThisTurn(cardId, player) {
  const entry = handEffectUsage.get(usageKey(cardId, player));
  if (!entry || entry.turnNumber !== getState().turnNumber) return 0;
  return entry.count;
}
function isUnderUsageLimit(usageLimit, cardId, player) {
  if (!usageLimit) return true;
  if (usageLimit.per !== "turn") return true; // 今回のパイロットは"turn"のみ対応
  return usageCountThisTurn(cardId, player) < usageLimit.count;
}
function recordHandEffectUsage(cardId, player) {
  handEffectUsage.set(usageKey(cardId, player), { turnNumber: getState().turnNumber, count: usageCountThisTurn(cardId, player) + 1 });
}

// 禁断の果実 マルメゴ専用（PUBLIC_DRAW_DISABLE_HAND_EFFECTS_CONDITIONAL_DISCARD）:
// 「それらの手札効果はこのターン使うことができない。」を、handEffectUsageと同じ
// 「turnNumberが一致する間だけ有効」という自動失効パターンで実現する（このカード
// 固有のtokenId単位のため、cardId+player単位のhandEffectUsageとは別のMapにする）。
const handEffectDisabledUntilTurn = new Map(); // tokenId -> turnNumber
function disableHandEffectForTurn(tokenId) {
  handEffectDisabledUntilTurn.set(tokenId, getState().turnNumber);
}
function isHandEffectDisabledThisTurn(tokenId) {
  return handEffectDisabledUntilTurn.get(tokenId) === getState().turnNumber;
}

// 紫のキューブ ディメンション専用（ANNOUNCE_MOVEMENT_BOOST_THIS_TURN）: 「このターンの
// 通常の移動は２マス先に一気に移動する。」ユーザー指摘「効果文中の『通常の移動』とは
// ムーブフェイズで通常行う移動のこと」の通り、自動処理モードのムーブフェイズが計算する
// 移動候補（phase-automation.jsのreconcileMovePhase）自体を、このターンの間だけ
// count:1→2・atOnce:trueに切り替える必要がある。handEffectDisabledUntilTurnと同じ
// 「turnNumberが一致する間だけ有効」の自動失効パターン。
const movementBoostUntilTurn = new Map(); // player -> turnNumber
function activateMovementBoostForTurn(player) {
  movementBoostUntilTurn.set(player, getState().turnNumber);
}
export function isMovementBoostActiveThisTurn(player) {
  return movementBoostUntilTurn.get(player) === getState().turnNumber;
}

// 禁断の果実 マルメゴ専用（PUBLIC_DRAW_DISABLE_HAND_EFFECTS_CONDITIONAL_DISCARD）: 公開ドローの
// 中に橙があった時の「あなたはこのターン移動できない。」を実際に強制する（不具合#57: 以前は
// 案内するだけで、その後のムーブフェイズで移動できてしまっていた）。他の「このターン○○
// できない」系（eternal-pinkの接触できない等）は自己申告のままだが、マルメゴの移動禁止は
// ムーブフェイズのハイライト（phase-automation.js reconcileMovePhase）と、人間の手動移動
// （main.jsのドラッグ/タップ移動の確定）で実際に弾く。movementBoostUntilTurnと同じ
// 「turnNumberが一致する間だけ有効」の自動失効パターン。移動禁止は移動だけが対象で、接触は
// 禁止しない（効果文はあくまで「移動できない」であり接触には触れていないため）。
const movementDisabledUntilTurn = new Map(); // player -> turnNumber
function disableMovementForTurn(player) {
  movementDisabledUntilTurn.set(player, getState().turnNumber);
}
export function isMovementDisabledThisTurn(player) {
  return movementDisabledUntilTurn.get(player) === getState().turnNumber;
}

// テスト中に発覚したバグの修正: resetGame()するとstate.jsのturnNumberは1から再スタートする
// ため、前のゲームで既に「turnNumber:1で1回使用済み」と記録されていたカードが、新しい
// ゲームのturnNumber:1でも誤って「もう使った」扱いになってしまっていた（handEffectUsageは
// このモジュールのメモリに残り続け、resetGame()では一切クリアされないため）。ゲームを
// リセットする箇所（game-setup.js）から呼んでもらう。他のturnNumber基準の自動失効Map
// （handEffectDisabledUntilTurn・movementBoostUntilTurn）も同じ理由でここで一緒に
// クリアする。
export function resetHandEffectUsage() {
  handEffectUsage.clear();
  handEffectDisabledUntilTurn.clear();
  movementDisabledUntilTurn.clear();
  movementBoostUntilTurn.clear();
}

// 「追色」コスト（同色の別カードを手札から捨てる）で実際に捨てられる候補。cardTokenIdは
// 効果を使おうとしている本人のカード自身（同じ色でも自分自身は対象外）。
// ユーザー指摘＋docs/cards.mdの「なないろの欠片」記載（「★ これはすべての色であり、
// ロックフェイズではロックできない。」）確認: なないろの欠片は「すべての色」を兼ねる
// ため、追色コストとしてはどの色の代わりにも使える。
// main.jsのゴメンナサイ最後のロック割り込み（続き64）が、追色コスト候補の算出に
// そのまま再利用する。
export function findSameColorDiscardCandidates(cardTokenId, color, player) {
  return getState().tokens.filter((t) => {
    if (t.kind !== "card" || t.location.zone !== "hand" || t.location.player !== player || t.id === cardTokenId) return false;
    if (t.cardId === "rainbow-shard") return true;
    return getCardDefinition(t.cardId)?.color === color;
  });
}

// 手札効果データを「選択肢の配列」に正規化する。単一handEffectのカード（今までの
// 大半）は1件だけの配列として扱い（id:"default"）、handEffectOptionsを持つカード
// （なないろの欠片等、複数選択肢を持つ手札効果）はそのまま返す。呼び出し元（main.js）が
// 「選択肢が1つならモーダル無しでそのまま実行、2つ以上なら選ばせる」を共通の形で
// 書けるようにするための正規化。
export function getHandEffectOptions(cardId) {
  const def = CARD_EFFECTS[cardId];
  if (!def) return [];
  if (def.handEffectOptions) return def.handEffectOptions;
  if (def.handEffect) return [{ id: "default", label: null, ...def.handEffect }];
  return [];
}

// 1つの選択肢が今使えるか（設定ON・使用回数制限内・コストを払える・
// requiresPairInHand等の追加条件を満たす、の全てを満たすか）。
export function isHandEffectOptionUsable(cardId, cardTokenId, player, option) {
  if (!autoProcessingEnabled) return false;
  if (isHandEffectDisabledThisTurn(cardTokenId)) return false;
  if (!isUnderUsageLimit(option.usageLimit, cardId, player)) return false;
  if (option.cost?.verb === VERBS.DISCARD_SAME_COLOR) {
    const color = getCardDefinition(cardId)?.color;
    const candidates = findSameColorDiscardCandidates(cardTokenId, color, player);
    if (candidates.length < option.cost.count) return false;
  }
  if (option.requiresPairInHand) {
    const count = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player && t.cardId === cardId
    ).length;
    if (count < 2) return false;
  }
  // 桃のキューブ セレナーデ専用。ユーザー指摘: 「善処の原則」は発動宣言の時点で
  // 適用される——条件を満たせないと分かっているなら、コストを払う前の発動宣言
  // 自体ができない（コストだけ払わせて実際には何も起きない、という状態を避ける）。
  if (option.requiresLockableCardAvailable) {
    const { tokens } = getLockableHandTokensExceptFinal(player);
    if (tokens.length === 0) return false;
  }
  // スラム上がりの役人専用（続き59）。ユーザー指摘: セレナーデと同じ「善処の原則」の
  // 理屈で、DRAW_IF_HAND_AT_MOST（「あなたの手札が１枚以下なら２枚ドロー」）は、
  // このカード自身を先に捨てた後の残り手札枚数がmaxHandSizeを超えると分かっている
  // 時点で、発動宣言自体ができないはず（このカードを捨てるだけで何も起きない状態を
  // 避ける）。actions配列にDRAW_IF_HAND_AT_MOSTが含まれる場合、実際の検証と同じ
  // getHandTokens()の定義（手札＋公開ドロー、続き55参照）で、このカード自身を
  // 除いた枚数がmaxHandSizeを超えていないか事前に確認する。
  const drawIfAtMost = option.actions?.find((a) => a.verb === VERBS.DRAW_IF_HAND_AT_MOST);
  if (drawIfAtMost) {
    const handCountExcludingSelf = getHandTokens(player).filter((t) => t.id !== cardTokenId).length;
    if (handCountExcludingSelf > drawIfAtMost.maxHandSize) return false;
  }
  // ザ・ギャンブル専用（DISCARD_ONE_HAND_CARD）。手札効果はこのカード自身を先に捨てて
  // から残りのアクションを実行するため（DRAW_IF_HAND_AT_MOSTのコメント参照）、「手札を
  // 1枚捨てる」時点で自分以外に捨てられる手札が1枚も無いと、そこで止まって効果が完結
  // しない。セレナーデ等と同じ善処の原則で、自分以外の手札が無いなら発動宣言自体を
  // できないものとして扱う（ユーザー報告「ザ・ギャンブル1枚だけの時、使えないのに
  // ハンドフェイズがスキップされない」の一因）。
  const discardOne = option.actions?.find((a) => a.verb === VERBS.DISCARD_ONE_HAND_CARD);
  if (discardOne) {
    const otherHandCount = getHandTokens(player).filter((t) => t.id !== cardTokenId).length;
    if (otherHandCount < 1) return false;
  }
  // マスチェンジ専用（SWAP_POSITION）。セレナーデ等と同じ「善処の原則」で、指定マス数
  // 以内（３マス以内）に入れ替えられる相手の駒が1つも無ければ、対象がおらず効果が何も
  // 起きない（SWAP_POSITIONの実装は候補0でfalseを返す）ため、発動宣言自体をできない
  // ものとして扱う＝ハンドフェイズでトーンオフする（ユーザー要望2026-08-09）。
  const swap = option.actions?.find((a) => a.verb === VERBS.SWAP_POSITION);
  if (swap) {
    const selfPiece = getState().tokens.find((t) => t.kind === "piece" && t.player === player);
    if (!selfPiece?.location || getOpponentPieceCellsWithinRange(selfPiece.location, swap.count, player).length === 0) return false;
  }
  return true;
}

// 1つの選択肢が「今使えない理由」を日本語で返す（使えるならnull）。isHandEffectOptionUsableと
// 全く同じ順序・同じ条件で判定し、最初に引っかかった理由の説明文を返す。ユーザー報告#52
// 「まだセレナーデを一度も使っていないのに『使用済みの可能性がある』と出て使えない」への対応
// ——実際の不許可理由（追色コスト不足／ロックできる手札が無い／このカードでは勝利になる
// 最後のロックはできない、等）を正確に伝え、誤解を招く定型文を出さないようにするため。
function explainHandEffectOptionUnusable(cardId, cardTokenId, player, option) {
  if (!autoProcessingEnabled) return "自動処理モードがOFFのため、手札効果を自動では使えません。";
  if (isHandEffectDisabledThisTurn(cardTokenId)) return "このターンは別の効果によって、このカードの手札効果が封じられています。";
  if (!isUnderUsageLimit(option.usageLimit, cardId, player)) return "この効果はこのターンに使える回数の上限に達しています（このターン使用済みです）。";
  if (option.cost?.verb === VERBS.DISCARD_SAME_COLOR) {
    const color = getCardDefinition(cardId)?.color;
    const candidates = findSameColorDiscardCandidates(cardTokenId, color, player);
    if (candidates.length < option.cost.count) return "追色コストを払えません（コストとして捨てられる同じ色の手札がありません）。";
  }
  if (option.requiresPairInHand) {
    const count = getState().tokens.filter(
      (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player && t.cardId === cardId
    ).length;
    if (count < 2) return "この効果を使うには、同じカードが手札に2枚必要です。";
  }
  if (option.requiresLockableCardAvailable) {
    const { tokens } = getLockableHandTokensExceptFinal(player);
    if (tokens.length === 0)
      return "今ロックできる手札がありません（空きスロットが無い・色が合わない、またはこのカードでは最後の1色＝勝利になるロックはできないためです）。";
  }
  const drawIfAtMost = option.actions?.find((a) => a.verb === VERBS.DRAW_IF_HAND_AT_MOST);
  if (drawIfAtMost) {
    const handCountExcludingSelf = getHandTokens(player).filter((t) => t.id !== cardTokenId).length;
    if (handCountExcludingSelf > drawIfAtMost.maxHandSize) return "手札が多いため、この効果（手札が少ない時にドローする効果）は今は使えません。";
  }
  const discardOne = option.actions?.find((a) => a.verb === VERBS.DISCARD_ONE_HAND_CARD);
  if (discardOne) {
    const otherHandCount = getHandTokens(player).filter((t) => t.id !== cardTokenId).length;
    if (otherHandCount < 1) return "手札に他のカードが無いため、この効果を使えません。";
  }
  const swap = option.actions?.find((a) => a.verb === VERBS.SWAP_POSITION);
  if (swap) {
    const selfPiece = getState().tokens.find((t) => t.kind === "piece" && t.player === player);
    if (!selfPiece?.location || getOpponentPieceCellsWithinRange(selfPiece.location, swap.count, player).length === 0)
      return `${swap.count}マス以内に入れ替えられる相手の駒がいないため、この効果は今は使えません。`;
  }
  return null;
}

// このカードの手札効果が今使えない場合の理由（使えるならnull）。どれか1つでも使える選択肢が
// あればnull（＝使える）。全て使えない時は最初の選択肢の理由を返す（大半のカードは選択肢1つ）。
export function getHandEffectUnusableReason(cardId, cardTokenId, player) {
  const options = getHandEffectOptions(cardId);
  if (options.length === 0) return "このカードは手札効果を持っていません。";
  if (options.some((opt) => isHandEffectOptionUsable(cardId, cardTokenId, player, opt))) return null;
  return explainHandEffectOptionUnusable(cardId, cardTokenId, player, options[0]);
}

// このカードの手札効果を今使ってよいか（いずれかの選択肢が使えるか）。トリガーUI側
// （main.js）が「使用する」操作を有効にするかどうかの判定にも、Hand Phaseの自動
// スキップ判定にも使う共通関数。
export function canUseHandEffect(cardId, cardTokenId, player) {
  return getHandEffectOptions(cardId).some((opt) => isHandEffectOptionUsable(cardId, cardTokenId, player, opt));
}

// このカードが構造化された手札効果データを持っているか（使用可否は問わない）。
// main.js側の「クリックしたが手札効果自体を持っていないカードなら何もしない」判定用。
export function hasHandEffectData(cardId) {
  return getHandEffectOptions(cardId).length > 0;
}

// ゴメンナサイッ！・カウンターロックのように、手札効果が「あなたへのロック/接触の
// 宣言時に使える」等の反応時専用（Hand Phaseの自己申告では絶対に使えない）カードか。
// これらはhandEffectデータ自体を持たない（別種の実装が必要なため今回は未対応、
// card-effects.js参照）ため、main.js側の「hasHandEffectDataかつcanUseHandEffectが
// false」というトーンダウン判定の対象に自然には乗らない。ユーザー報告「ハンドフェイズで
// 通常はトーンダウンさせるべき」への対応で、この専用フラグだけを見る。
export function isHandEffectReactiveOnly(cardId) {
  return !!CARD_EFFECTS[cardId]?.handEffectReactiveOnly;
}

// コスト（追色）だけを見て払えるかどうか（使用回数制限・自動処理ON/OFFは問わない）。
// ユーザー要望「追色コストになるカードが手札に無い場合はその旨の警告を出す」ための、
// canUseHandEffectより細かい判定（何が原因で使えないかをUI側が案内できるようにする）。
// 選択肢が複数ある場合は、コストだけ見ていずれか1つでも払えればtrue（コスト以外の
// 条件、例えばrequiresPairInHandは問わない——「捨てられる手札が無い」という別種の
// 警告の判定専用のため）。
export function canPayHandEffectCost(cardId, cardTokenId, player) {
  const options = getHandEffectOptions(cardId);
  if (options.length === 0) return true;
  return options.some((opt) => {
    if (opt.cost?.verb !== VERBS.DISCARD_SAME_COLOR) return true;
    const color = getCardDefinition(cardId)?.color;
    return findSameColorDiscardCandidates(cardTokenId, color, player).length >= opt.cost.count;
  });
}

// docs/rulebook.md「ファーストカード/エターナルカード: 他のカードの効果の対象に
// ならない（奪われたり捨てることはできない）」。ロックされていても、選べる罠の
// 「ロックしているカードを1枚捨てる」のような他カードの効果からは常に除外する。
function isTargetableByOtherCardEffects(cardId) {
  return !cardId?.startsWith("eternal-") && !cardId?.startsWith("first-");
}

// ユーザー確認済み設計方針（続き55、ヴァーディアンの手札効果で公開ドローした2枚が
// 選べる罠の「手札を半分捨てる」を選べない現象への対応）: 「ドロー」＝「山札から
// 手札に加える」ため、公開ドロー（publicDrawゾーン、山からの公開ドロー・手札効果
// 使用宣言の駐機のどちらの経由でも）にあるカードも、まだ通常の手札に合流していない
// だけで「あなたの手札」であることに変わりはない（docs/cards.md補足）。ザ・ギャンブル
// のDISCARD_HAND_IF_REVEALED_MATCHES_DECLAREDで先行導入していたこの定義を、手札の
// 枚数を数える／手札をまとめて捨てる系の判定全てに一般化する。「今使える手札効果が
// あるか」（hasUsableHandEffect等）はここでは対象外——公開ドロー中のカードから直接
// 手札効果を発動するUI自体がまだ無い、別スコープの話のため意図的に含めない。
function getHandTokens(player) {
  return getState().tokens.filter(
    (t) => t.kind === "card" && t.location.player === player && (t.location.zone === "hand" || t.location.zone === "publicDraw")
  );
}

// 選べる罠専用: arrivalOptionsの1つの選択肢が今選べるか（docs/cards.mdの善処の原則
// 条件を満たすか）。requiresMinHandSize/requiresNotAtOwnGate/requiresHasLockedCardの
// いずれかを満たさなければ選べない（指定の無い条件はチェックしない）。
function isArrivalOptionUsable(player, pieceLocation, option) {
  if (option.requiresMinHandSize != null) {
    const count = getHandTokens(player).length;
    if (count < option.requiresMinHandSize) return false;
  }
  if (option.requiresNotAtOwnGate) {
    const gate = GATE_POSITIONS[SEAT_TO_SIDE[player]];
    if (pieceLocation && pieceLocation.row === gate.row && pieceLocation.col === gate.col) return false;
  }
  if (option.requiresHasLockedCard) {
    // ユーザー報告「ファーストカード1枚しかロックしていないのに『ロックしている
    // カードを1枚捨てる』を選べてしまっている」。ファースト/エターナルカードは
    // 他のカードの効果の対象にならないため、それらを除いた「捨てられるロック
    // カード」の有無で判定する。
    const side = SEAT_TO_SIDE[player];
    const hasLocked = getState().tokens.some(
      (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && isTargetableByOtherCardEffects(t.cardId)
    );
    if (!hasLocked) return false;
  }
  return true;
}

// 自分の手札の中に、今すぐ使える手札効果カードが1枚でもあるか（Hand Phaseの自動スキップ
// 判定用）。
export function hasUsableHandEffect(player) {
  return getState().tokens.some(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player && canUseHandEffect(t.cardId, t.id, player)
  );
}

const DIRECTIONS = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

function inBounds(row, col) {
  return row >= 0 && row <= 6 && col >= 0 && col <= 6;
}

function hasCardAt(row, col) {
  return getState().tokens.some((t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
}

function hasPieceAt(row, col) {
  return getState().tokens.some((t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
}

// ユーザー指摘「２マス先とは２マス移動できる範囲のことなので斜め隣のマスも対象」。
// atOnce（一気に）の「Nマス先」は、上下左右の単位移動をN回組み合わせて届く範囲全体を指し、
// 直線上のNマス先（4方向）だけでなく、方向を途中で変えた結果届く斜め隣接マスも含む
// （例: N=2なら、直線上の2マス先4方向＋「上に1＋右に1」のような組み合わせで届く
// 斜め隣接4方向＝合計8マス）。数学的には「そのマスからマンハッタン距離がちょうどN」の
// マス全て。N=1の場合はこの式でも従来通り上下左右4マスのみになる（斜めは距離2以上でしか
// 出現しないため）。
function enumerateManhattanRing(count) {
  const offsets = [];
  for (let drAbs = 0; drAbs <= count; drAbs++) {
    const dcAbs = count - drAbs;
    const drs = drAbs === 0 ? [0] : [drAbs, -drAbs];
    const dcs = dcAbs === 0 ? [0] : [dcAbs, -dcAbs];
    for (const dr of drs) {
      for (const dc of dcs) offsets.push({ dr, dc });
    }
  }
  return offsets;
}

// moveの候補マスを計算する（純粋関数、DOM不要）。ユーザー指摘を受けdocs/rulebook.mdの
// 「移動」の定義を確認: 「移動」とは自分の駒を、現在のマスから"カードの置かれた"別のマスに
// 置くこと（カードの無いマスにも置けるのは「強制移動」という別の用語で、ジャンプ台の
// 効果文にその語は出てこない）。またルール上、駒は物理的に1マスに1つまでなので、既に
// 駒がいるマスへは移動できない。atOnce（一気に）が唯一免除するのは「1マス目（＝経路の
// 途中のマス）のカード・駒の有無」（rulebook.md 289行目補足）であり、最終的な移動先
// （このコードが計算する候補そのもの）には適用されない。そのため、移動先が「カードあり・
// 駒なし」であることは、atOnceの有無に関わらず常に課す（旧実装はatOnce時にこの判定自体を
// 丸ごとスキップしており、駒のいるマスや空きマスまで候補に出てしまうバグだった）。
export function getMoveCandidates(fromLocation, count, atOnce) {
  const candidates = [];
  const offsets = atOnce
    ? enumerateManhattanRing(count)
    : DIRECTIONS.map(({ dr, dc }) => ({ dr: dr * count, dc: dc * count }));
  for (const { dr, dc } of offsets) {
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    if (!hasCardAt(row, col) || hasPieceAt(row, col)) continue;
    candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 「任意の1マス」（カードがあるマスに限る、1マスの1枚を対象にする効果向け）の候補一覧。
export function getAnyCellWithCardCandidates() {
  const candidates = [];
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      if (hasCardAt(row, col)) candidates.push({ zone: "cell", row, col });
    }
  }
  return candidates;
}

// 「任意のNマス」（カードの有無を問わない、山札から置く先を選ばせる効果向け）の候補一覧。
function getAllCellCandidates() {
  const candidates = [];
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// enumerateManhattanRing（ちょうど距離N）を0からNまで積み重ねた「N マス以内」
// （自分のいるマスも含む、距離0〜N全て）の候補。「２マス以内」等の効果文の実際の判定範囲
// （docs/cards.md「仮にNマス移動する場合に移動できる範囲」）に対応する。
function enumerateManhattanDisk(maxCount) {
  const offsets = [];
  for (let d = 0; d <= maxCount; d++) offsets.push(...enumerateManhattanRing(d));
  return offsets;
}

// 「Nマス以内のカードがあるマス」の候補（橙のキューブ ハーベスト等）。
function getCellsWithCardWithinRange(fromLocation, range) {
  const candidates = [];
  for (const { dr, dc } of enumerateManhattanDisk(range)) {
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    if (!hasCardAt(row, col)) continue;
    candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 指定マスに重なっているカードのうち一番上（１番上の原則、main.jsのfindTopCardAtと
// 同じ「トークン配列の末尾＝一番最後に動かされた＝一番上」という考え方）のトークンを
// 返す。無ければnull。PICKUP_TO_HANDの過去のバグ（Array#findで一番下を拾っていた）と
// 同じ間違いを繰り返さないよう、盤面マスの特定カードを1枚だけ取り出す箇所は必ずこれを使う。
function findTopCardAtCell(row, col) {
  const stack = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === row && t.location.col === col);
  return stack.length > 0 ? stack[stack.length - 1] : null;
}

// 指定マスにいる駒（あれば）を返す。getAllOpponentPieceCells/pickLocationで選ばれた
// マスから、実際にどのプレイヤーの駒かを引き直すのに使う。
function findPieceAtCell(row, col) {
  return getState().tokens.find((t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col) ?? null;
}

// 「Nマス以内の、一番上が裏向きのカードがあるマス」の候補（黄のキューブ サフラン専用）。
function getCellsWithFaceDownCardWithinRange(fromLocation, range) {
  const candidates = [];
  for (const { dr, dc } of enumerateManhattanDisk(range)) {
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    const top = findTopCardAtCell(row, col);
    if (top && !top.faceUp) candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 「Nマス以内にいる相手の駒のマス」の候補（マスチェンジ等）。自分のいるマス自身は
// 対象外（自分自身との入れ替えは意味を成さないため）。
function getOpponentPieceCellsWithinRange(fromLocation, range, player) {
  const candidates = [];
  for (const { dr, dc } of enumerateManhattanDisk(range)) {
    if (dr === 0 && dc === 0) continue;
    const row = fromLocation.row + dr;
    const col = fromLocation.col + dc;
    if (!inBounds(row, col)) continue;
    const piece = getState().tokens.find(
      (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col && t.player !== player
    );
    if (piece) candidates.push({ zone: "cell", row, col });
  }
  return candidates;
}

// 「相手の駒がいる全てのマス」の候補（範囲制限なし版、プレゼント・結ばれの一本桜等の
// 「相手を選ぶ」効果用）。ユーザー要望「場に関する効果で相手を選ぶ時はアバターでは
// なく駒を選ぶ形にしてほしい。場に関する効果は駒、相手の手札に関する効果はアバター、
// という使い分けはどうか」への対応。マスチェンジ（getOpponentPieceCellsWithinRange）
// と同じ「相手の駒のマスをpickLocationで選ばせる」パターンの、範囲を問わない版。
function getAllOpponentPieceCells(player) {
  const candidates = [];
  for (let row = 0; row <= 6; row++) {
    for (let col = 0; col <= 6; col++) {
      const piece = getState().tokens.find(
        (t) => t.kind === "piece" && t.location.zone === "cell" && t.location.row === row && t.location.col === col && t.player !== player
      );
      if (piece) candidates.push({ zone: "cell", row, col });
    }
  }
  return candidates;
}

// なないろの欠片のLOCK_PAIR専用: 自分のロックエリアの7色スロット全部（埋まっている
// スロットも含む——通常の「1色1枚まで」占有チェックの対象外の特殊ロックのため）。
function getOwnLockSlotCandidates(player) {
  const side = SEAT_TO_SIDE[player];
  return COLORS.map((_, index) => ({ zone: "lock", side, index }));
}

// 黒の契約の烙印専用: 自分のロックエリアの「空いている」スロットだけ（通常のロックと
// 違い色は問わない、getOwnLockSlotCandidatesと違って占有中のスロットは除外する）。
function getOwnEmptyLockSlotCandidates(player) {
  const side = SEAT_TO_SIDE[player];
  return getOwnLockSlotCandidates(player).filter(
    (slot) => !getState().tokens.some((t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && t.location.index === slot.index)
  );
}

// 桃のキューブ セレナーデ専用（LOCK_ONE_HAND_CARD_EXCEPT_FINAL）: 今ロック可能な
// （＝それをロックしても7色目＝勝利にはならない）手札カードと、それぞれの有効な
// 置き先スロットをまとめて求める。isHandEffectOptionUsable（発動前の善処の原則
// チェック——コストを払う前に「そもそも今使えるか」を判定する）と、実際の実行
// （runAction内のLOCK_ONE_HAND_CARD_EXCEPT_FINAL）の両方で同じロジックを使う
// ことで、「発動を宣言できたのに実際には何も起きない」という状態を避ける
// （ユーザー指摘: シェイズオブセブンの「善処の原則」は、手札効果発動宣言時に
// 条件を満たせないと分かっていたら発動自体できない、という方針）。
export function getLockableHandTokensExceptFinal(player) {
  const emptySlots = getOwnEmptyLockSlotCandidates(player).filter((slot) => !wouldCompleteLockWithNewIndex(player, slot.index));
  const candidateSlotsFor = (token) => {
    if (emptySlots.length === 0) return [];
    const color = getCardDefinition(token.cardId)?.color;
    // 無色（白・黒）と虹（なないろの欠片）は特定の色スロットに縛られないので、空いている
    // どのスロットにも置ける（プレイヤーがどの色にするか選ぶ）。虹をセレナーデでロックする
    // 場合は「色を選んで1枚だけ」ロックする（不具合#52、serenade-rainbow-shard-lock-rule。
    // 虹本来の手札効果=2枚ロックとは別で、ここでは単体を1スロットに置く＝勝利判定でも1色）。
    if (color === "white" || color === "black" || color === "rainbow") return emptySlots;
    const idx = COLORS.indexOf(color);
    const matching = emptySlots.filter((s) => s.index === idx);
    return idx >= 0 ? matching : [];
  };
  // 以前はなないろの欠片を候補から一律除外していたが、ユーザー報告#52「ピンクを追色コストに
  // 払い、なないろの欠片をロックできる状況なのにセレナーデが使えない」への対応で、虹も
  // セレナーデのロック対象に含める（色は上のcandidateSlotsForでプレイヤーが選ぶ）。
  const handTokens = getState().tokens.filter(
    (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === player
  );
  const tokens = handTokens.filter((t) => candidateSlotsFor(t).length > 0);
  return { candidateSlotsFor, tokens };
}

// カウンターロック専用: 指定プレイヤーが実際にロックしている枚数。
function countLockedCardsFor(player) {
  return getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "lock" && SIDE_TO_SEAT[t.location.side] === player).length;
}

// カウンターロック専用: 「１番少なくロックしている」＝参加している全プレイヤーの中で
// ロック枚数が最少（同率首位も含む——docs/cards.md補足「ロックしている枚数が
// １番少ないことである」の一般的な解釈、他の「１番多い/少ない」系カードと同じ）。
function isFewestLocked(player) {
  const counts = getState().activePlayers.map((p) => countLockedCardsFor(p));
  if (counts.length === 0) return false;
  return countLockedCardsFor(player) === Math.min(...counts);
}

// 処理順の原則（docs/cards.md「複数のプレイヤーを対象にした効果は原則、効果の
// 使用者から時計回りに効果を処理する」）: SEAT_ORDERをplayerから始まるように
// 回転させる。プレゼント・色落ちキャット等、複数箇所で同じ回転を個別に書いて
// いたのをここへ集約した。
export function rotatedActivePlayersFrom(player) {
  const order = SEAT_ORDER.filter((p) => getState().activePlayers.includes(p));
  const startIdx = order.indexOf(player);
  return startIdx >= 0 ? [...order.slice(startIdx), ...order.slice(0, startIdx)] : order;
}

// 1つのactionを実行する。helpers:
//   moveAndSync(tokenId, location): 実際にトークンを動かし、オンライン中の同期・
//     再描画まで面倒を見る（main.jsのaddArrivedCardToHand等と同じ責務）。
//   pickLocation(candidates, hint): プレイヤーに候補マスの中から1つ選んでもらう
//     （候補が1つしかなければ選ばせずそのまま採用してよい、呼び出し元の裁量）。hintは
//     「何を選ぶ場面か」をプレイヤーに案内する短い文（ユーザー要望「移動先のマスを
//     選択してください、等の案内を出してほしい」への対応）。
//   pickHandCard(player, hint): プレイヤーに自分の手札から1枚選んでもらう（手札トークンを返す）。
//   onCardAcquiredToHand(tokenId, cardId): PICKUP_TO_HANDで手札に加わったカードを
//     「何を獲得したか」表示し、後で置き直すまで手札内で光らせる（ユーザー要望）。省略可。
//   markPlacementTarget(location): PICKUP_TO_HANDで拾った元のマスを「ここに置き直す」
//     目印としてハイライトし続ける（ユーザー要望「どこに置かれるか忘れないように」）。省略可。
// 戻り値: 実際に何かが起きたか（true）、候補が無い等で「善処の原則」により何も
// 起きなかったか（false）。ユーザー要望「効果が不発だった場合は『不発のためこのカードを
// 手札に加えます』的なモーダルを出してほしい」への対応でrunArrivalEffect側が使う
// （runHandEffectOption側は今のところこの戻り値を見ていない）。
async function runAction(action, ctx, helpers) {
  switch (action.verb) {
    case VERBS.MOVE: {
      const candidates = getMoveCandidates(ctx.pieceLocation, action.count, !!action.atOnce);
      if (candidates.length === 0) return false; // 善処の原則: 選べる先が無ければ何もしない
      // 無意味なループ防止（#49、ユーザー方針「セブンではルール上無意味なループは禁止」）。この移動
      // 連鎖で既に通ったマス（出発マス含む）へ戻る候補を「ループ先」として扱う。ジャンプ台の連続移動で
      // 2つのジャンプ台を永遠に往復する等を防ぐ。
      helpers.recordMoveVisited?.(ctx.pieceLocation); // 出発マスを記録（この連鎖で通った印）
      const isLoop = (c) => !!helpers.isLoopMoveDest?.(c);
      const freshCells = candidates.filter((c) => !isLoop(c));
      const loopCells = candidates.filter(isLoop);
      let dest;
      if (helpers.isCpuDriving?.(ctx.player)) {
        // CPU（CPU戦のCPU席・AFK代行の自席）はループ先を選ばない。非ループの行き先が無ければ移動
        // しない（連鎖はここで自然終了。駒は直前に着地した現在地＝正当なマスに留まる）。
        if (freshCells.length === 0) return false;
        dest =
          freshCells.length === 1 && !ctx.forcePrompt
            ? freshCells[0]
            : await helpers.pickLocation(freshCells, "移動先のマスを選択してください");
      } else {
        // 人間: ループ先は警告して選べないようにする（alertCellsでクリック時に注意を出し選択させない）。
        // 非ループの行き先が1つも無ければ移動しない（＝実質行き先なし。駒は現在地に留まる）。
        if (freshCells.length === 0) return false;
        dest =
          freshCells.length === 1 && !ctx.forcePrompt
            ? freshCells[0]
            : await helpers.pickLocation(freshCells, "移動先のマスを選択してください", {
                alertCells: loopCells,
                alertMessage: "無意味なループになるため、そのマスへは移動できません。",
              });
      }
      if (!dest) return false;
      // ユーザー要望「ジャンプ台で移動するときに専用の効果音を使ってください」。
      // action.sound（DSL側で指定した場合のみ）をそのままhelpers.moveAndSyncへ
      // 渡す。指定が無い他のMOVEアクションは従来通り無音のまま。
      await helpers.moveAndSync(ctx.pieceTokenId, dest, action.sound);
      helpers.recordMoveVisited?.(dest); // 到達マスも記録（次の連鎖でここへ戻る＝ループとして検知）
      ctx.pieceLocation = dest;
      ctx.arrivedAt = dest; // 呼び出し元が「移動の結果、新しいマスに到達した」連鎖判定に使う
      return true;
    }
    case VERBS.DRAW: {
      // target: SELF（自分だけ）/ALL_OPPONENTS（対象は自分以外の参加座席それぞれ、
      // 1人ずつ指定枚数）。helpers.drawCards(player, count)はplayerごとに1回呼ぶ。
      const players =
        action.target === TARGETS.ALL_OPPONENTS
          ? getState().activePlayers.filter((p) => p !== ctx.player)
          : action.target === TARGETS.ALL_PLAYERS
            ? getState().activePlayers
            : [ctx.player];
      for (const p of players) {
        await helpers.drawCards(p, action.count);
      }
      return true;
    }
    case VERBS.PICKUP_DISCARD_SECOND_FROM_TOP: {
      // 赤のキューブ フェニックス専用: 捨て場の１番上から２番目のカードを手札に加える。
      // 捨て場は「一番上を引く」（DRAW_FROM_PILE）操作しか無く、途中のインデックスを
      // 直接指定する手段が無い（サーバー側so7-apply-action.tsも同様）。新しいアクション
      // 型を追加せず、既存の「一番上を引く」を2回使う（1回目＝退避、2回目＝本来の対象）
      // →退避した分を捨て場へ戻す、という3ステップで実現する。
      if (getState().piles.discard.length < 2) return false; // 善処の原則
      const setAsideToken = await helpers.drawFromDiscard(ctx.player);
      if (!setAsideToken) return false;
      const targetToken = await helpers.drawFromDiscard(ctx.player);
      if (!targetToken) {
        // 2枚目が引けなかった場合（同時操作等でスタック枚数がズレた等）、退避した分を
        // 捨て場へ戻して原状回復する。
        await helpers.discardAndSync(setAsideToken.id);
        return false;
      }
      await helpers.discardAndSync(setAsideToken.id);
      // お知らせ（ユーザー要望）: 誰が捨て場から何を手札に加えたか。
      await helpers.announceEffectReason?.(
        ctx.cardId,
        `${helpers.getPlayerName(ctx.player)}は捨て場から「${getCardDefinition(targetToken.cardId).name}」を手札に加えました。`
      );
      return true;
    }
    case VERBS.FLIP_UP_TO_N_WITHIN_RANGE: {
      // 黄のキューブ サフラン専用: あなたからwithinCellsマス以内の裏向きカードを、
      // maxCountまで（0枚でもよい＝「してもよい」）オープンする。候補が尽きるか、
      // maxCountに達するか、プレイヤーがこれ以上選ばない（pickLocationでnull）まで
      // 繰り返す。
      let flippedCount = 0;
      for (let i = 0; i < action.maxCount; i++) {
        const candidates = getCellsWithFaceDownCardWithinRange(ctx.pieceLocation, action.withinCells);
        if (candidates.length === 0) break;
        const chosen = await helpers.pickLocation(
          candidates,
          `オープンするマスを選択してください（任意、あと${action.maxCount - i}枚まで）`,
          { allowSkip: true, skipLabel: "これ以上開かない" }
        );
        if (!chosen) break; // 「してもよい」なので、これ以上選ばない＝正常終了
        const token = findTopCardAtCell(chosen.row, chosen.col);
        if (!token) break;
        await helpers.flipCard(token.id);
        flippedCount++;
        // オープンした先に駒が乗っていれば、その駒がそのカードに「到達」したものとして
        // 到達効果を発動する（サフランで自分の足元の裏向きカードをオープンした等）。
        // ジャンプ台を自分の駒の下へ表向きに置いた時と同じ扱い
        // （main.jsのmaybeTriggerArrivalForPlacedCard / maybeTriggerCardArrivalForCard）。
        // 以前はflipCardが裏→表に反転するだけで到達を一切起こさず、ユーザー報告
        // 「サフランで自分の足元をオープンしても到達効果が発動しない」の原因だった。
        helpers.maybeTriggerArrivalForPlacedCard?.({ zone: "cell", row: chosen.row, col: chosen.col }, token.cardId);
      }
      // お知らせ（ユーザー要望）: 何枚オープンしたか（優先度低だが一応）。
      if (flippedCount > 0) await helpers.announceEffectReason?.(ctx.cardId, `${flippedCount}枚のカードをオープンしました。`);
      return flippedCount > 0;
    }
    case VERBS.DISCARD_RANDOM_FROM_QUALIFYING_OPPONENTS: {
      // 青のキューブ セレスティア専用: 手札がminHandSize枚以上ある相手全員から、
      // 無作為に１枚ずつ選んで捨てる。「無作為に」は隠し情報（相手の手札の中身）が
      // 絡むため、スリカエ・接触の強奪と同じ「儀式的ピック」（相手の裏向きの手札から
      // 見た目上ランダムに選ぶ）で実現する（helpers.pickRandomFromOpponentHand）。
      // 処理順の原則に沿ってctx.playerから時計回りに1人ずつ。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        if (p === ctx.player) continue;
        const handCount = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p).length;
        if (handCount < action.minHandSize) continue;
        const picked = await helpers.pickRandomFromOpponentHand(p);
        if (!picked) continue;
        await helpers.discardAndSync(picked.id);
        // お知らせ（ユーザー要望）: 誰の手札から何を捨てさせたか（隠れ情報、対象ごと）。
        await helpers.announceEffectReason?.(
          ctx.cardId,
          `${helpers.getPlayerName(p)}の手札から「${getCardDefinition(picked.cardId).name}」を捨てさせました。`
        );
        hadEffect = true;
      }
      return hadEffect;
    }
    case VERBS.DISCARD_ALL_AT_CHOSEN_CELL: {
      // 紅蓮の火山 ワイナウエア専用: 任意の１マスの、そこにあるカード全て（スタック分
      // 含め全部、表裏問わず）を捨てる。
      const candidates = getAnyCellWithCardCandidates();
      if (candidates.length === 0) return false;
      const chosen =
        candidates.length === 1 && !ctx.forcePrompt ? candidates[0] : await helpers.pickLocation(candidates, "カードをすべて捨てるマスを選択してください");
      if (!chosen) return false;
      const stack = getState().tokens.filter(
        (t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === chosen.row && t.location.col === chosen.col
      );
      if (stack.length === 0) return false;
      for (const token of stack) {
        await helpers.discardAndSync(token.id);
      }
      // お知らせ（ユーザー要望）: どのマスを対象にしたか。
      await helpers.announceEffectReason?.(ctx.cardId, "このマスのカードをすべて捨てました。");
      return true;
    }
    case VERBS.PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END: {
      // 奇跡の森 マンズウッド専用: N枚公開ドローし、ターン終了時にそれらを捨てる。
      // 「ターン終了時」の実現方法はmain.jsのmarkDiscardAtTurnEnd/
      // flushPendingTurnEndDiscards参照（新しいサーバーアクション・状態を増やさず、
      // ターン終了ボタンが実際にnextTurn()を呼ぶ直前に先回りして捨てる方式）。ここでは
      // 「公開ドローする」＋「捨てる予定として覚えておく」だけで完結する。
      const tokenIds = await helpers.publicDrawReturningTokens(ctx.player, action.count);
      if (tokenIds.length === 0) return false;
      helpers.markDiscardAtTurnEnd?.(ctx.player, tokenIds);
      // お知らせ（ユーザー要望「マンズウッドは公開ドローではない→○○は1枚ドロー」）。
      await helpers.announceEffectReason?.(ctx.cardId, `${helpers.getPlayerName(ctx.player)}は${tokenIds.length}枚ドローしました。`);
      return true;
    }
    case VERBS.MOVE_CHOSEN_OPPONENT_ADJACENT_TO_SELF: {
      // 結ばれの一本桜 コノハナサクヤ専用: 相手を選び、その相手の駒をあなた自身の駒に
      // 隣接するマスへ移動させる。「移動」扱いのため、移動先が裏向きカードならオープン
      // する（docs/rulebook.md「移動」の定義、パーティーの「移動先の到達効果は得ない」
      // オプションと同じ考え方）。到達効果自体は対象になった相手プレイヤー本人の
      // クライアント側の既存の自動処理（remote-move-animator.jsが他プレイヤーの駒移動を
      // 検知して面上のカードが表向きなら自動で到達判定する仕組み、マスチェンジ等の
      // 「相手の駒を動かす」効果と同じ経路）に任せる——ここでは駒の移動とオープンだけを
      // 行う。「このターンあなたは接触できない」は実際には強制せず（このアプリの
      // Phase 1方針「ルール適用は一切しない」通り）、案内モーダルで知らせるに留める。
      // ユーザー要望「場に関する効果で相手を選ぶ時はアバターではなく駒を選ぶ形に」。
      // 盤面上の相手の駒のマスをpickLocationで選ばせる（マスチェンジと同じパターン）。
      const opponentCells = getAllOpponentPieceCells(ctx.player);
      if (opponentCells.length === 0) return false;
      let targetCell;
      if (opponentCells.length === 1) {
        // ユーザー要望「選べる相手が１人しかいない場合は自動でその人を選択し、その旨を
        // モーダルで示してほしい」（続き65／プレゼント等の再要望 2026-08-07）。スリカエ・
        // マスチェンジ等の「相手を選ぶ」系と揃え、手札効果のforcePrompt（対象1人でも選ばせる）
        // に関係なく自動選択する——相手が1人なら実質的に選択の余地が無いため（続き93の
        // 総点検ではマスチェンジだけを直したが、この「相手の駒を選ぶ」系にも抜けが残っていた）。
        targetCell = opponentCells[0];
        await helpers.announceEffectReason?.(ctx.cardId, "選べる相手が1人しかいないため、自動的に選択しました。");
      } else {
        targetCell = await helpers.pickLocation(opponentCells, "移動させる相手の駒を選んでください");
      }
      if (!targetCell) return false;
      const targetPiece = findPieceAtCell(targetCell.row, targetCell.col);
      const selfPiece = getState().tokens.find((t) => t.kind === "piece" && t.player === ctx.player);
      if (!targetPiece || !selfPiece || selfPiece.location.zone !== "cell") return false;
      const adjacentCells = enumerateManhattanRing(1)
        .map(({ dr, dc }) => ({ row: selfPiece.location.row + dr, col: selfPiece.location.col + dc }))
        .filter(({ row, col }) => inBounds(row, col) && !hasPieceAt(row, col))
        .map(({ row, col }) => ({ zone: "cell", row, col }));
      if (adjacentCells.length === 0) return false; // 善処の原則: 隣接マスが無ければ何もしない
      const dest = adjacentCells.length === 1 ? adjacentCells[0] : await helpers.pickLocation(adjacentCells, "相手を移動させるマスを選択してください");
      if (!dest) return false;
      await helpers.moveAndSync(targetPiece.id, dest);
      const destTop = findTopCardAtCell(dest.row, dest.col);
      if (destTop && !destTop.faceUp) {
        await helpers.flipCard(destTop.id);
      }
      // お知らせ（ユーザー要望）: 誰を誰の隣へ動かしたか＋接触制限。
      await helpers.announceEffectReason?.(
        ctx.cardId,
        `${helpers.getPlayerName(targetPiece.player)}を${helpers.getPlayerName(ctx.player)}の隣へ移動させました。このターンあなたは接触できません（自己申告）。`
      );
      return true;
    }
    case VERBS.PUBLIC_DRAW_DISABLE_HAND_EFFECTS_CONDITIONAL_DISCARD: {
      // 禁断の果実 マルメゴ専用: N枚公開ドロー→それらの手札効果は今ターン使用不可
      // （disableHandEffectForTurn、上のisHandEffectOptionUsableで参照）→その中に
      // 橙（なないろの欠片は全色兼用のため橙としても扱う、他の効果と同じ判定基準）が
      // あれば手札を全て捨てる。「あなたはこのターン移動できない」は他の「このターン
      // ○○できない」系（eternal-pink参照）と同じ理由で実際には強制せず、案内モーダルで
      // 知らせるに留める。
      // ユーザー要望2026-08-09「４枚ドローの演出をザ・ギャンブルと同様に」への対応。
      // ザ・ギャンブル（PUBLIC_DRAW_MATCHING_DECLARED_COLOR_COUNT）と全く同じ
      // 「鼓動SE→1枚ずつ中央でじらしフリップ公開（残り2枚以上なら『1枚公開/全部公開』の
      // モーダルでもったいぶれる）→結果」の流れにする。マルメゴは「橙が出るか（＝手札全捨て）」
      // のドキドキがギャンブルの「宣言色が出るか」とちょうど同じ構図なので、成功（橙なし）は
      // ギャンブル同様に紙吹雪で祝い、失敗（橙あり）は従来どおり結果モーダルで知らせる。
      // publicDrawReturningTokensはtokenIdを返す（手札効果封じ・橙判定に必要）。中央フリップ
      // 公開（gambleReveal）はcardIdを取るので、引いたtokenからcardIdを引き当てて渡す。
      helpers.startSuspenseSound?.();
      const tokenIds = [];
      const revealDrawn = async (ids) => {
        for (const tid of ids) {
          const t = getState().tokens.find((x) => x.id === tid);
          if (t) await helpers.gambleReveal?.(t.cardId);
          tokenIds.push(tid);
        }
      };
      let remaining = action.count;
      while (remaining > 0) {
        if (helpers.pickHandEffectOption && remaining > 1) {
          const opt = await helpers.pickHandEffectOption(ctx.cardId, [
            { id: "one", label: "１枚公開する", usable: true },
            { id: "all", label: `残り${remaining}枚をすべて公開する`, usable: true },
          ]);
          if (opt?.id === "all") {
            await revealDrawn(await helpers.publicDrawReturningTokens(ctx.player, remaining));
            remaining = 0;
            break;
          }
          // "one"/閉じた(null) → 1枚だけ公開して次へ。
        }
        await revealDrawn(await helpers.publicDrawReturningTokens(ctx.player, 1));
        remaining -= 1;
      }
      helpers.stopSuspenseSound?.(); // 結果が出るので鼓動を止める
      if (tokenIds.length === 0) return false;
      for (const tokenId of tokenIds) disableHandEffectForTurn(tokenId);
      const hasOrange = tokenIds.some((tokenId) => {
        const token = getState().tokens.find((t) => t.id === tokenId);
        if (!token) return false;
        return token.cardId === "rainbow-shard" || getCardDefinition(token.cardId)?.color === "orange";
      });
      if (hasOrange) {
        const handTokens = getHandTokens(ctx.player);
        for (const token of handTokens) {
          await helpers.discardAndSync(token.id);
        }
        // 「あなたはこのターン移動できない」を実際に強制する（不具合#57）。ムーブフェイズの
        // ハイライトと人間の手動移動の確定で弾く（reconcileMovePhase / main.jsのドラッグ・
        // タップ移動、isMovementDisabledThisTurnを参照）。接触は禁止しない（効果文は移動のみ）。
        disableMovementForTurn(ctx.player);
        // お知らせ（ユーザー要望）: 条件成立の結果を対象名付きで。
        await helpers.announceEffectReason?.(
          ctx.cardId,
          `残念、${helpers.getPlayerName(ctx.player)}は橙が出たため手札を全て捨て、このターンは移動できません。`
        );
      } else if (helpers.celebrate) {
        // 橙が出なかった＝手札を捨てずに済んだ（成功）。ザ・ギャンブルの「宣言色が出なかった
        // 時」と同様に紙吹雪＋英語見出しで祝う。
        await helpers.celebrate(ctx.cardId, {
          tone: "success",
          headline: "CONGRATULATIONS!",
          sub: `${helpers.getPlayerName(ctx.player)}は橙が出ませんでした。手札はそのまま残ります！`,
        });
      }
      return true;
    }
    case VERBS.ANNOUNCE_MOVEMENT_BOOST_THIS_TURN: {
      // 紫のキューブ ディメンション専用。ユーザー指摘「効果文中の『通常の移動』とは
      // ムーブフェイズで通常行う移動のこと。ジャンプ台みたいに２マス先がハイライト
      // されていなければならない」への対応で、自動処理モードのムーブフェイズが計算する
      // 移動候補（phase-automation.jsのreconcileMovePhase）自体をこのターンの間だけ
      // 2マス先・一気に（atOnce）へ切り替えるようにした（activateMovementBoostForTurn、
      // isMovementBoostActiveThisTurnで参照）。
      activateMovementBoostForTurn(ctx.player);
      await helpers.announceEffectReason?.(ctx.cardId, `${helpers.getPlayerName(ctx.player)}はこのターン、通常の移動を２マス先まで一気に行えます（自己申告）。`);
      return true;
    }
    case VERBS.LOCK_ONE_HAND_CARD_EXCEPT_FINAL: {
      // 桃のキューブ セレナーデ専用: 手札を1枚選んでロックする（候補の求め方は
      // getLockableHandTokensExceptFinal参照——通常の色一致ルールに従い、「最後の
      // ロック」＝7色目になってしまうスロットは除外済み）。このチェック自体は
      // isHandEffectOptionUsable（発動宣言前）でも同じ関数を使って行っており、
      // 候補が無い状態ではそもそもこの効果自体が発動宣言できない（善処の原則）ため、
      // ここに到達した時点で候補が0件になっているのは主に「宣言直後に他の効果で
      // 状況が変わった」ような稀なケースへの保険。
      const { candidateSlotsFor, tokens } = getLockableHandTokensExceptFinal(ctx.player);
      if (tokens.length === 0) return false;
      const lockableTokenIds = new Set(tokens.map((t) => t.id));
      // purpose:"lock" でCPUは「ロックしたい札（虹・要る色）優先」で自動選択（ユーザー要望2026-08-10）。
      const chosen = await helpers.pickHandCard(ctx.player, "ロックするカードを手札から選択してください", lockableTokenIds, { purpose: "lock" });
      if (!chosen) return false;
      const slots = candidateSlotsFor(chosen);
      if (slots.length === 0) return false;
      // ロック先スロットが1つに定まっているカード（通常の色カードは自分の色スロット1つ）は
      // 選ぶ余地が無いので、手札効果のforcePromptに関係なくモーダルを出さず自動でそこへ置く。
      // 七色の欠片のように複数スロットが候補になる（虹＝任意の欠色に置ける）カードだけ、
      // 「ロックする場所を選択してください」を出す。ユーザー要望（2026-08-07）。
      const dest = slots.length === 1 ? slots[0] : await helpers.pickLocation(slots, "ロックする場所を選択してください");
      if (!dest) return false;
      await helpers.moveAndSync(chosen.id, dest);
      return true;
    }
    case VERBS.PICKUP_TO_HAND: {
      // withinCells指定時（橙のキューブ ハーベスト等）は「Nマス以内」に絞る。未指定なら
      // 従来通り盤面全体（収穫と種まき等）。
      const candidates =
        action.withinCells != null ? getCellsWithCardWithinRange(ctx.pieceLocation, action.withinCells) : getAnyCellWithCardCandidates();
      if (candidates.length === 0) return false;
      const chosen =
        candidates.length === 1 && !ctx.forcePrompt
          ? candidates[0]
          : await helpers.pickLocation(candidates, "手札に加えるカードのあるマスを選択してください");
      if (!chosen) return false;
      // ユーザー報告「収穫と種まきで場のカードを取るとき、そのマスがスタックされて
      // いたら一番上ではなく上から2枚目のカードを取ってしまう」の原因: Array#find()は
      // 配列内で最初に見つかった要素（＝一番古く積まれた、スタックの一番下）を返して
      // しまっていた。main.jsのfindTopCardAt/getCardStackGroupsと同じ「トークン配列の
      // 末尾＝一番最後に動かされた＝一番上」という１番上の原則に合わせ、該当マスの
      // トークンを全て集めてから配列の最後（一番上）を選ぶよう修正した。
      const stackAtCell = getState().tokens.filter(
        (t) =>
          t.kind === "card" &&
          t.location.zone === "cell" &&
          t.location.row === chosen.row &&
          t.location.col === chosen.col
      );
      const token = stackAtCell[stackAtCell.length - 1];
      if (!token) return false;
      const wasFaceUp = token.faceUp; // 手札に入ると自動で表向きになるため、移動前の状態を保持しておく
      await helpers.moveAndSync(token.id, { zone: "hand", player: ctx.player });
      helpers.onCardAcquiredToHand?.(token.id, token.cardId, wasFaceUp, ctx.player);
      if (action.target?.saveAs) {
        ctx.selections[action.target.saveAs] = chosen;
        helpers.markPlacementTarget?.(chosen);
      }
      return true;
    }
    case VERBS.PLACE_CARD: {
      // destination.selection: SAME_AS（収穫と種まき・終わりなき化学ゲンテクニーク等、
      // 同じ効果内の別アクションで既に選んだマスへ置き直す）／CHOOSE（月下の漂流船
      // プリドゥエン等、その場でN個のマスを選ばせる。action.countがマス数）。
      let destinations = [];
      if (action.destination?.selection === TARGET_SELECTIONS.SAME_AS) {
        const dest = ctx.selections[action.destination.ref];
        if (dest) destinations = [dest];
      } else if (action.destination?.selection === TARGET_SELECTIONS.CHOOSE) {
        const pickCount = action.count ?? 1;
        // ユーザー要望「ジャンプ台の手札効果」：「これをゲート以外の任意のマスに」
        // 置く場合、ゲートマスは候補から外す（destination.excludeGates）。
        const cellCandidates = action.destination?.excludeGates
          ? getAllCellCandidates().filter((c) => !Object.values(GATE_POSITIONS).some((g) => g.row === c.row && g.col === c.col))
          : getAllCellCandidates();
        // ユーザー報告「プリドゥエン/増殖する樹々は『任意の“2マス”』なのに、同じ1マスに
        // 2枚置けてしまう」。既に選んだマスは次以降の候補から除外し、別々のマスにしか
        // 置けないようにする（＝重複マスは光らない＝選べない）。あわせて、既に選んだマスを
        // もう一度選ぼうとした時にはアラートで知らせる（pickLocationにalertCellsを渡す）。
        const pickedKeys = new Set();
        for (let i = 0; i < pickCount; i++) {
          const available = cellCandidates.filter((c) => !pickedKeys.has(`${c.row},${c.col}`));
          if (available.length === 0) break;
          const dest = await helpers.pickLocation(available, "カードを置くマスを選択してください（それぞれ別のマス）", {
            alertCells: [...pickedKeys].map((k) => {
              const [row, col] = k.split(",").map(Number);
              return { row, col };
            }),
            alertMessage: "そのマスには既に置く予定です。別のマスを選んでください。",
          });
          if (!dest) break;
          destinations.push(dest);
          pickedKeys.add(`${dest.row},${dest.col}`);
          // ユーザー報告「増殖する樹々の手札効果で、どのマスが選択済みかわかりづらい」。
          // 選ぶたびにmarkPlacementTargetで「ここに置かれる」目印を積み重ねる。
          helpers.markPlacementTarget?.(dest);
        }
      } else if (action.destination?.selection === TARGET_SELECTIONS.ALL_WITHIN_RANGE) {
        // 増殖する樹々専用: プレイヤーが選ぶのではなく、範囲内の「何もないマス」
        // （カードも駒も無いマス）全てが自動的に対象になる。自分がいるマスは自分の
        // 駒があるため、hasPieceAtの判定で自然に除外される（特別扱い不要）。
        const range = action.destination.withinCells ?? 0;
        for (const { dr, dc } of enumerateManhattanDisk(range)) {
          const row = ctx.pieceLocation.row + dr;
          const col = ctx.pieceLocation.col + dc;
          if (!inBounds(row, col)) continue;
          if (hasCardAt(row, col) || hasPieceAt(row, col)) continue;
          destinations.push({ zone: "cell", row, col });
        }
      } else if (action.destination?.selection === TARGET_SELECTIONS.OWN_EMPTY_LOCK_SLOTS) {
        // 黒の契約の烙印専用: 自分のロックエリアの空いているスロット（色不問）から選ぶ。
        const candidates = getOwnEmptyLockSlotCandidates(ctx.player);
        if (candidates.length === 0) return false; // 善処の原則: 空きが無ければ何もしない
        const dest = await helpers.pickLocation(candidates, "カードを置くロックエリアを選択してください");
        if (dest) destinations = [dest];
      } else {
        console.warn("card-effect-engine: place_cardのdestination.selectionが未対応です", action);
        return false;
      }
      if (destinations.length === 0) return false;
      for (const dest of destinations) {
        if (action.source === "self") {
          // ジャンプ台の手札効果／黒の契約の烙印の到達効果専用: このカード自身
          // （効果カード本体）を盤面またはロックエリアへ置く。他の手札からの選択とは
          // 違い相手に選ばせる必要が無い。destは既に正しい形（cellまたはlock）で
          // 渡ってくるため、ここで作り直さずそのまま使う。
          await helpers.moveAndSync(ctx.cardTokenId, dest);
          // 手札→マスの移動は既定で裏向きになる（state.jsのfaceUpForLocation）ため、
          // 表向き指定の時だけ明示的にめくる。
          if (action.faceUp) {
            await helpers.flipCard?.(ctx.cardTokenId);
            // ユーザー報告「ジャンプ台を自分の駒の下に表向きで置いたのに到達効果が
            // 発動しなかった」（続き62）。通常のドラッグ配置と同じく、置いた先に
            // 既に駒がいれば到達を発動させる。
            await helpers.maybeTriggerArrivalForPlacedCard?.(dest, ctx.cardId);
          }
        } else if (action.source === "hand") {
          const handToken = await helpers.pickHandCard(ctx.player, "そのマスに置くカードを手札から選択してください");
          if (!handToken) continue;
          await helpers.moveAndSync(handToken.id, { zone: "cell", row: dest.row, col: dest.col });
        } else {
          // "deck"（山札）: 手札からではなく山札の一番上を直接そのマスへ置く。
          await helpers.placeFromDeck(dest);
        }
        // ユーザー要望「配置後ここに配置したよがわかるように配置場所をしっかり
        // ハイライトしてください。マスの枠だけでなくカードの面も」。マスハイライト用の
        // ため、盤面（cell）への配置の時だけ呼ぶ（黒の契約の烙印のロックエリア配置は
        // 対象外——row/colを持たないロックスロットは元々この演出の対象外）。
        if (dest.zone === "cell") helpers.markPlacedLocation?.(dest);
      }
      return true;
    }
    case VERBS.SWAP_POSITION: {
      // 「入れ替え」であり「移動」ではないため（docs/cards.md補足）、到達判定は連鎖させない
      // （ctx.arrivedAtをセットしない）。
      const candidates = getOpponentPieceCellsWithinRange(ctx.pieceLocation, action.count, ctx.player);
      if (candidates.length === 0) return false;
      // 以前（続き31）はユーザー要望「３マス以内の相手をハイライトしてプレイヤーに
      // 選ばせるステップを踏んでください（対象が１人でも）」に沿い、候補が1人でも
      // 常にプレイヤーに選ばせていた。ユーザー要望（続き93）「マスチェンジで対象が
      // 1人しかいない場合はスリカエ時同様にその旨モーダルで示し自動選択で」で方針を
      // 転換。スリカエ（SWAP_RANDOM_HAND_CARD）と全く同じ「選べる相手が1人しかいない
      // 場合は自動選択し、その旨をモーダルで示す」パターンに揃える——スリカエ自身も
      // 到達・手札効果どちらの経路でもforcePromptに関係なく自動選択するため、ここでも
      // ctx.forcePromptは見ない（続き93の総点検で、「相手を選ぶ」系の効果の中で
      // このパターンが抜けていたのはマスチェンジだけと確認済み）。
      let target;
      if (candidates.length === 1) {
        target = candidates[0];
        await helpers.announceEffectReason?.(ctx.cardId, "選べる相手が1人しかいないため、自動的に選択しました。");
      } else {
        target = await helpers.pickLocation(candidates, "入れ替える相手のマスを選択してください");
      }
      if (!target) return false;
      // お知らせ用に入れ替え相手を先に捕まえる（swapPieces後は駒が動くため）。
      const swapTargetPlayer = findPieceAtCell(target.row, target.col)?.player;
      const fromLoc = { zone: "cell", row: ctx.pieceLocation.row, col: ctx.pieceLocation.col }; // 発動者の元マス(M)。相手はここへ入れ替わる。
      await helpers.swapPieces(ctx.pieceTokenId, ctx.pieceLocation, target);
      ctx.pieceLocation = target;
      if (swapTargetPlayer)
        await helpers.announceEffectReason?.(
          ctx.cardId,
          `${helpers.getPlayerName(ctx.player)}と${helpers.getPlayerName(swapTargetPlayer)}は駒の位置を入れ替えました。`
        );
      // ユーザー指定ルール2026-08-08（マスチェンジの入れ替えと到達効果）:
      // ・入れ替えは「移動」ではないので裏向きカードは開かない（表向きの時だけ到達効果が発動）。
      // ・発動者は入れ替わり先(target)の表向きカードの到達効果を得る。
      // ・相手は入れ替わり先(M)の表向きカードの到達効果を得る。ただし到達版ではMの一番上は今
      //   このマスチェンジ自身で、それ自体は再発動しない(処理順の都合で発動者側と二重発動しない)。
      //   到達版はこの後の既定動作「このカードを手札に加える」でマスチェンジがMから外れ、その下の
      //   表向きカードが露出した時にexposed-comboで相手ぶんが自動発動する。手札効果版はマスチェンジが
      //   盤上に無い（発動時に捨て済み）ので、Mの表向きカードをここで相手ぶんとして発動する。
      // ・入れ替えは同時なので両者の入れ替わり先に表向きカードがあれば両者発動。処理順は処理順の
      //   原則（発動者→時計回り）に従うため、先に発動者(自分)ぶんを処理する。
      await helpers.triggerArrivalAtIfFaceUp?.(target, ctx.player);
      const massChangeStillOnBoard =
        getState().tokens.find((t) => t.id === ctx.cardTokenId)?.location?.zone === "cell";
      if (!massChangeStillOnBoard && swapTargetPlayer) {
        await helpers.triggerArrivalAtIfFaceUp?.(fromLoc, swapTargetPlayer);
      }
      return true;
    }
    case VERBS.LOCK_PAIR: {
      // なないろの欠片専用: これを含めた同名2枚を、任意の1箇所（自分のロックエリアの
      // 好きな色スロット、通常の1色1枚の占有チェックは対象外の特殊ロック）へまとめて置く。
      const partner = getState().tokens.find(
        (t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === ctx.player && t.cardId === "rainbow-shard" && t.id !== ctx.cardTokenId
      );
      if (!partner) return false;
      const candidates = getOwnLockSlotCandidates(ctx.player);
      const dest = await helpers.pickLocation(candidates, "ロックする場所を選択してください");
      if (!dest) return false;
      await helpers.moveAndSync(ctx.cardTokenId, dest);
      await helpers.moveAndSync(partner.id, dest);
      return true;
    }
    case VERBS.DRAW_IF_FEWEST_LOCKED: {
      if (!isFewestLocked(ctx.player)) return false;
      // ユーザー要望「カウンターロックの到達効果について『あなたは１番少なくロック
      // しているので１枚ドローします』みたいなモーダルを出してからドローして
      // ください」。判定条件（盤面全体のロック枚数比較）は見ただけでは分からないため、
      // 先に理由を説明してから実際にドローする。
      // ユーザー要望2026-08-08「相手がカウンターロックに到達した時、自分の画面で『あなた』ではなく
      // そのプレイヤー名を表示してほしい」。効果の主語は発動者(ctx.player)。オンラインではこの文言を
      // 全員へ中継する（announceEffectReason）ため、「あなた」だと受け手全員に「あなた」と出て
      // しまう。常に発動者の名前で表示する。
      await helpers.announceEffectReason?.(
        ctx.cardId,
        `${helpers.getPlayerName(ctx.player)}は１番少なくロックしているので１枚ドローします。`
      );
      await helpers.drawCards(ctx.player, 1);
      return true;
    }
    case VERBS.SWAP_RANDOM_HAND_CARD: {
      // 手品師の技専用。ユーザー要望「駒ではなくアバターを選択して相手を選ぶ」への
      // 対応で、マス/駒ベースのpickLocationではなく専用のpickPlayer（アバターを
      // クリックして選ぶ）を使う。実際の手札交換（相手の手札を裏向きのまま画面中央に
      // 表示して選ばせる「儀式」演出＋自分から渡すカードは自分で選べる）はhelpers側
      // （main.jsのswapHandCardWithOpponentForEffect）に委ねる。
      const opponents = getState().activePlayers.filter((p) => p !== ctx.player);
      if (opponents.length === 0) return false;
      // ユーザー要望「相手が誰も手札を持っていないときのスリカエは不発モーダルにしたい」。
      // 交換相手として意味があるのは手札を1枚以上持つ相手だけ。全員が0枚なら不発にする
      // （以前は相手が1人だと『相手が1人のため～』と出して空振りしていた）。
      const handCountOf = (p) =>
        getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "hand" && t.location.player === p).length;
      const swappableOpponents = opponents.filter((p) => handCountOf(p) > 0);
      if (swappableOpponents.length === 0) {
        await helpers.announceFizzle?.(ctx.cardId);
        return false;
      }
      let targetPlayer;
      if (swappableOpponents.length === 1) {
        // ユーザー要望「スリカエなどで相手を選ぶ効果の場合で選べる相手が１人しかいない
        // 場合は自動でその人を選択してください。そしてその旨をモーダルで示してください」（続き65）。
        targetPlayer = swappableOpponents[0];
        await helpers.announceEffectReason?.(ctx.cardId, "手札を持っている相手が1人だけのため、自動的に選択しました。");
      } else {
        targetPlayer = await helpers.pickPlayer(swappableOpponents, "手札を交換する相手を選んでください（アバターをクリック）");
      }
      if (!targetPlayer) return false;
      await helpers.swapRandomHandCard(ctx.player, targetPlayer);
      // お知らせ（ユーザー要望）: 誰と誰が手札を交換したか。
      await helpers.announceEffectReason?.(
        ctx.cardId,
        `${helpers.getPlayerName(ctx.player)}と${helpers.getPlayerName(targetPlayer)}は手札を1枚ずつ交換しました。`
      );
      return true;
    }
    case VERBS.DRAW_ALL_FEWEST_LOCKED: {
      // プレゼント専用: カウンターロック（DRAW_IF_FEWEST_LOCKED、効果の使用者本人だけ
      // 判定）と違い、「該当する全員」がそれぞれドローする。処理順の原則（docs/cards.md
      // 「複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに処理する」）
      // に沿うよう、SEAT_ORDERをctx.playerから時計回りに並べ替えてから絞り込む。
      const qualifying = rotatedActivePlayersFrom(ctx.player).filter((p) => isFewestLocked(p));
      if (qualifying.length === 0) return false;
      // ユーザー要望2026-08-07「プレゼントの到達効果で誰がドロー対象なのか画面中央にアバターで
      // 周知したい」。対象者のアバターを並べて見せる（未対応環境では従来のテキスト通知に戻す）。
      if (helpers.announceDrawTargets) {
        await helpers.announceDrawTargets(qualifying, "１番少なくロックしている人が１枚ドロー");
      } else {
        await helpers.announceEffectReason?.(ctx.cardId, "１番少なくロックしている全員が１枚ドローします。");
      }
      for (const p of qualifying) {
        await helpers.drawCards(p, 1);
      }
      return true;
    }
    case VERBS.DISCARD_ALL_FACEUP_ON_BOARD: {
      // 白の意思の覚醒専用: 盤面マスにある表向きのカード全てを捨てる（１番上の原則により
      // 「場」＝盤面マスの一番上のカードだけが対象、という前提はgetState().tokensの
      // location.zone==="cell"フィルタで自然に満たされる——重なりの下側は元々別トークンの
      // faceUp状態を問わず対象に含めてよいわけではないが、この効果は「表向きのカード」
      // 全部が対象という素直な読みのため、重なりの上下は区別せずfaceUp:trueの盤面
      // カード全てを対象にする）。
      const candidates = getState().tokens.filter((t) => t.kind === "card" && t.location.zone === "cell" && t.faceUp);
      if (candidates.length === 0) return false;
      for (const token of candidates) {
        await helpers.discardAndSync(token.id);
      }
      // お知らせ（ユーザー要望）: 盤面一括変化の要約。
      await helpers.announceEffectReason?.(ctx.cardId, "場の表向きのカードを全て捨てました。");
      return true;
    }
    case VERBS.DISCARD_SELF: {
      // なないろの巨光・色落ちキャット専用: 既定動作（手札に加える）の代わりに
      // このカード自身を捨てる（effectDef.addsCardToHandAfter:falseと対で使う）。
      await helpers.discardAndSync(ctx.cardTokenId);
      return true;
    }
    case VERBS.ALL_PLAYERS_DISCARD_HAND_AND_DRAW: {
      // 色落ちキャット専用: 参加者全員が手札を全て捨ててから指定枚数ドローする
      // （処理順の原則に沿い、効果の使用者から時計回りに1人ずつ処理する）。
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        const handTokens = getHandTokens(p);
        for (const token of handTokens) {
          await helpers.discardAndSync(token.id);
        }
        await helpers.drawCards(p, action.count);
      }
      // お知らせ（ユーザー要望）: 全員の手札が変わったこと。
      await helpers.announceEffectReason?.(ctx.cardId, `全員が手札を全て捨てて、${action.count}枚ドローしました。`);
      return true;
    }
    case VERBS.DISCARD_HALF_HAND: {
      // 選べる罠専用: 手札の半分（端数切り捨て、docs/rulebook.md「手札の半分」の
      // 定義通り）を、自分で選んで捨てる（ゲート侵攻ボーナスの「無作為に奪う」とは
      // 違い、これは自分自身の手札を自分で選ぶ効果のため隠し情報の抽選は不要）。
      const handTokens = getHandTokens(ctx.player);
      const discardCount = Math.floor(handTokens.length / 2);
      if (discardCount === 0) return false;
      const discardedNames = [];
      for (let i = 0; i < discardCount; i++) {
        const chosen = await helpers.pickHandCard(ctx.player, `捨てるカードを手札から選択してください（残り${discardCount - i}枚）`);
        if (!chosen) break;
        discardedNames.push(getCardDefinition(chosen.cardId)?.name ?? chosen.cardId);
        await helpers.discardAndSync(chosen.id);
      }
      // お知らせ（ユーザー要望「選べる罠で何を捨てたか全員にモーダルで一覧表示したい」）:
      // 捨て札は公開情報のため、捨てたカードの一覧を全員へ告知する（effect_reasonモーダル）。
      if (discardedNames.length > 0) {
        await helpers.announceEffectReason?.(
          ctx.cardId,
          `${helpers.getPlayerName(ctx.player)}は選べる罠で手札の「${discardedNames.join("」「")}」を捨てました。`
        );
      }
      return true;
    }
    case VERBS.FORCED_MOVE_TO_OWN_GATE: {
      // 選べる罠専用: 自分のゲートへ強制移動する。「移動」であり接触の強制移動と同じく
      // 到達判定は連鎖する（docs/cards.mdにSWAP_POSITION等のような「到達効果を得ない」
      // 旨の記載が無いため）。
      const gate = GATE_POSITIONS[SEAT_TO_SIDE[ctx.player]];
      const dest = { zone: "cell", row: gate.row, col: gate.col };
      if (ctx.pieceLocation.row === dest.row && ctx.pieceLocation.col === dest.col) return false; // 善処の原則: 既に自分のゲートにいるなら何もしない
      await helpers.moveAndSync(ctx.pieceTokenId, dest);
      ctx.pieceLocation = dest;
      ctx.arrivedAt = dest;
      return true;
    }
    case VERBS.DISCARD_ONE_LOCKED_CARD: {
      // 選べる罠専用: 自分のロックしているカードから1枚選んで捨てる。lock_pair等と同じく
      // ロックスロットの形（{zone:"lock",side,index}）をそのままpickLocationの候補として使う。
      // ファースト/エターナルカードは他のカードの効果の対象にならないため候補から除外する
      // （docs/rulebook.md、isArrivalOptionUsableのrequiresHasLockedCard判定と揃える）。
      const side = SEAT_TO_SIDE[ctx.player];
      const lockedTokens = getState().tokens.filter(
        (t) => t.kind === "card" && t.location.zone === "lock" && t.location.side === side && isTargetableByOtherCardEffects(t.cardId)
      );
      if (lockedTokens.length === 0) return false;
      const candidates = lockedTokens.map((t) => t.location);
      const dest = candidates.length === 1 ? candidates[0] : await helpers.pickLocation(candidates, "捨てるロックカードを選択してください");
      if (!dest) return false;
      const chosen = lockedTokens.find((t) => t.location.side === dest.side && t.location.index === dest.index);
      if (!chosen) return false;
      await helpers.discardAndSync(chosen.id);
      // お知らせ（ユーザー要望「選べる罠で何を捨てたか全員にモーダルで表示したい」）:
      // ロック上のカードは元々公開情報。捨てたカードを全員へ告知する。
      await helpers.announceEffectReason?.(
        ctx.cardId,
        `${helpers.getPlayerName(ctx.player)}は選べる罠でロックしていた「${getCardDefinition(chosen.cardId)?.name ?? chosen.cardId}」を捨てました。`
      );
      return true;
    }
    case VERBS.DECLARE_COLORS: {
      // ザ・ギャンブル（action.minCount、以上）/試練の儀式（action.count、固定数）
      // 共通。実際の選択UI（複数色から選ばせる）はhelpers側（main.jsのdeclareColorsForEffect）
      // に委ねる。選んだ色はctx.selectionsに保存し、後続のアクションから参照する。
      const chosen = await helpers.declareColors(
        action.minCount != null ? { minCount: action.minCount } : { exactCount: action.count },
        ctx.cardId,
        ctx.player
      );
      if (!chosen || chosen.length === 0) return false;
      ctx.selections.declaredColors = chosen;
      return true;
    }
    case VERBS.PUBLIC_DRAW_MATCHING_DECLARED_COLOR_COUNT: {
      // ザ・ギャンブル専用: 直前のDECLARE_COLORSで宣言した色の種類数分、公開ドローする。
      const declaredColors = ctx.selections.declaredColors;
      if (!declaredColors?.length) return false;
      // ユーザー要望「1枚ずつもったいぶりたい。公開のたびに『1枚公開する/全部公開する』の
      // モーダルを出す」。残り2枚以上の時だけ選ばせ、残り1枚は自動で最後の1枚を公開する。
      const total = declaredColors.length;
      const revealedCardIds = [];
      let remaining = total;
      // ユーザー要望2026-08-08: 公開のたびに、そのカードを画面中央に大きく“じらしてフリップ”で
      // 見せる（helpers.gambleReveal）。緊張感を出すため心臓の鼓動（helpers.startSuspenseSound）を
      // 鳴らし始め、結果が出るDISCARD_HAND側で止める。
      helpers.startSuspenseSound?.();
      while (remaining > 0) {
        if (helpers.pickHandEffectOption) {
          // 残り2枚以上なら「1枚公開/全部公開」、最後の1枚は「最後の1枚を公開する」を毎回出す
          // （ユーザー要望: 最後の1枚ももったいぶりたい）。
          const options =
            remaining > 1
              ? [
                  { id: "one", label: "１枚公開する", usable: true },
                  { id: "all", label: `残り${remaining}枚をすべて公開する`, usable: true },
                ]
              : [{ id: "last", label: "最後の１枚を公開する", usable: true }];
          const opt = await helpers.pickHandEffectOption("yellow-gamble", options);
          if (opt?.id === "all") {
            const rest = await helpers.publicDraw(ctx.player, remaining);
            for (const cid of rest) {
              await helpers.gambleReveal?.(cid);
              revealedCardIds.push(cid);
            }
            remaining = 0;
            break;
          }
          // "one"/"last"/閉じた(null) → 1枚だけ公開して次へ。
        }
        const one = await helpers.publicDraw(ctx.player, 1);
        for (const cid of one) {
          await helpers.gambleReveal?.(cid);
          revealedCardIds.push(cid);
        }
        remaining -= 1;
      }
      ctx.selections.revealedCardIds = revealedCardIds;
      return revealedCardIds.length > 0;
    }
    case VERBS.DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED: {
      // ザ・ギャンブル専用: 公開ドローした中に宣言色が1つでもあれば、手札を全て捨てる。
      // 「ドロー」＝「山札から手札に加える」ため、この効果でドローしたカード（＝まだ
      // publicDrawゾーンにあり通常の手札には合流していない分）も対象に含める
      // （docs/cards.md補足）。この定義はgetHandTokens()として一般化した
      // （続き55、選べる罠の「手札を半分捨てる」にも同じ定義漏れがあったため）。
      const declaredColors = ctx.selections.declaredColors ?? [];
      const revealedCardIds = ctx.selections.revealedCardIds ?? [];
      // ユーザー報告「公開ドローの中に宣言色があるのに手札を全て捨てる処理が漏れている」
      // の原因: なないろの欠片は「全ての色を兼ねる」（RITUAL_PLACE_MOVE_REPEAT等、
      // 他の色一致判定と同じ既存の扱い）ため、公開ドローで出た時は宣言した色に関係なく
      // 常に一致扱いになるはずだが、ここではcardId==="rainbow-shard"の特別扱いが
      // 抜けており、getCardDefinition("rainbow-shard").color（実際の値は"rainbow"、
      // 宣言できる7色のいずれとも一致しない）だけで判定していたため、公開ドローで
      // なないろの欠片単独が出たケースで一致判定を取りこぼしていた。
      const matches = revealedCardIds.some(
        (cardId) => cardId === "rainbow-shard" || declaredColors.includes(getCardDefinition(cardId)?.color)
      );
      // 続き65: 公開ドローの結果で宣言色が判明した瞬間なので、常駐していた色宣言表示を消す。
      await helpers.announceColorsResolved?.();
      helpers.stopSuspenseSound?.(); // 結果が出たので鼓動を止める
      // 誰の結果かが分かるように発動者名を主語に添える（相手が発動した時に自分の画面で
      // 「自分が成功した」ように見えないように。ユーザー要望2026-08-08の総点検）。
      const gambleName = helpers.getPlayerName?.(ctx.player) ?? "";
      if (!matches) {
        // ユーザー要望2026-08-07: 宣言色が出なかった＝良い結果（手札を捨てずに済む）を、
        // 紙吹雪＋大きな英語見出しでお祝いする（案A、「おめでとう」ではなく英語で）。
        if (helpers.celebrate) {
          await helpers.celebrate(ctx.cardId, {
            tone: "success",
            headline: "CONGRATULATIONS!",
            sub: `${gambleName}は公開した中に宣言した色がありませんでした。手札はそのまま残ります！`,
          });
        } else {
          await helpers.announceEffectReason?.(ctx.cardId, `${gambleName}は公開した中に宣言した色が無かったため、手札はそのまま残ります。`);
        }
        return false;
      }
      await helpers.announceEffectReason?.(ctx.cardId, `残念でした。${gambleName}の公開した中に宣言した色があったため、手札を全て捨てます。`);
      const toDiscard = getHandTokens(ctx.player);
      // ユーザー報告「宣言色が出た時に手札がすべて捨てられず止まってしまっている」への
      // 対応。1枚ごとのdiscardAndSyncのどこかで例外が起きると（オンライン中の通信
      // エラー等）、そこでこのループ自体が中断し、残りのカードが手札に残ったまま
      // 効果全体が停止してしまう（catchが無いとrunArrivalEffectの外まで例外が伝播し、
      // 呼び出し元main.jsのtriggerCardArrivalではconsole.errorに落ちるだけで、
      // ユーザーからは何も起きなくなったように見える）。1枚失敗しても残りは
      // 続けて捨てられるようにする。
      for (const token of toDiscard) {
        try {
          await helpers.discardAndSync(token.id);
        } catch (err) {
          console.error("DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED: discardAndSync failed for", token.id, err);
        }
      }
      return true;
    }
    case VERBS.RITUAL_PLACE_MOVE_REPEAT: {
      // 試練の儀式専用: 隣接するマスへ山札から1枚表向きで置く→そこへ移動
      // （到達効果は得ない、ctx.arrivedAtはセットしない・置いたカードは手札にも
      // 加えない＝盤面に置かれたままになる）→置いたカードが宣言色なら「また色を
      // 宣言するところから」繰り返す。ユーザー補足:
      // ・なないろの欠片は「すべての色」を兼ねるため、出た時点で常に宣言色扱い
      //   （宣言した3色が何であっても関係なく続行する）。
      // ・「繰り返す」は同じ宣言色のまま置き直すことではなく、毎回改めて3色を
      //   宣言し直すこと。当たり続ける限り理論上いつまでも続けられる
      //   （実際には山札の残り枚数・盤面の広さで自然に打ち止めになる）。
      // 無限ループの安全弁の上限も、上記の「理論上いつまでも」を尊重して余裕を
      // 持たせてある（実戦で現実的に到達し得ない回数）。
      let declaredColors = ctx.selections.declaredColors;
      if (!declaredColors?.length) return false;
      // 不具合#46: 到達効果の二重発火で儀式が2つ同時に走らないようにする（再入ガード）。
      if (ritualPlaceMoveInProgress) return false;
      ritualPlaceMoveInProgress = true;
      try {
      let placedAny = false;
      let successCount = 0; // 宣言色に当たった回数（試練は必ずハズレで終わるので、最後にまとめて祝う）
      const MAX_ITERATIONS = 300;
      // ユーザー要望2026-08-08: 試練の緊張感を出すため心臓の鼓動を鳴らし、最後（結果表示前）に止める。
      helpers.startSuspenseSound?.();
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const adjacentCandidateCells = enumerateManhattanRing(1)
          .map(({ dr, dc }) => ({ row: ctx.pieceLocation.row + dr, col: ctx.pieceLocation.col + dc }))
          .filter(({ row, col }) => inBounds(row, col) && !hasPieceAt(row, col))
          .map(({ row, col }) => ({ zone: "cell", row, col }));
        if (adjacentCandidateCells.length === 0) break; // 善処の原則: 置ける隣接マスが無ければそこで終わる
        const dest =
          adjacentCandidateCells.length === 1
            ? adjacentCandidateCells[0]
            : await helpers.pickLocation(adjacentCandidateCells, "カードを置く隣接マスを選択してください");
        if (!dest) break;
        // ユーザー要望2026-08-08「CPUの色選択後から移動・カード捲りまでが早すぎる」。宣言色が
        // 決まってから実際に置いて捲るまで、鼓動とともに“ため”を作る（読みやすさと緊張感）。
        await helpers.delay?.(750);
        // ユーザー要望2026-08-08「フリップする時に盤面のカードが先にオープンされていてドキドキ感が
        // ない」。山札から“裏向き”で置き（盤面ではまだ中身が見えない）、下で中央じらしフリップで
        // 公開してから盤面のカードも表向きにする。裏向き置き（placeFromDeck）は戻り値でcardIdを
        // 返さないため、置いたカードは盤面のそのマスの一番上（DRAW_FROM_PILEは末尾に追加）から取る。
        // 山札から“裏向き”で置く（盤面ではまだ中身が見えない）。オンラインでもローカル同様の
        // じらしフリップにするため（ユーザー要望2026-08-08）、placeFromDeckRevealは「引いた本人
        // だけに中身(cardId)を返す」——サーバーが revealToActor でリクエスト元にのみcardIdを返し、
        // 盤面のカードは伏せたまま（他プレイヤーには見えない）。これにより下の中央じらしフリップ→
        // 盤面フリップの順で、オンラインでもドキドキ感が出る。
        const revealedCardId = (await helpers.placeFromDeckReveal?.(dest)) ?? null;
        const topCardAtDest = () =>
          getState()
            .tokens.filter((t) => t.kind === "card" && t.location.zone === "cell" && t.location.row === dest.row && t.location.col === dest.col)
            .slice(-1)[0];
        let placedToken = topCardAtDest();
        let placedCardId = revealedCardId ?? placedToken?.cardId;
        // フォールバック（不具合#41）: サーバー未再デプロイ等で中身が返らず、かつオンラインでは
        // 伏せカードの中身がRLSで隠れて盤面からも読めない場合は、先に盤面のカードを表向きにして
        // 判明させる（この時だけ盤面が先に見え“じらし”は効かないが、不発にはならず正常動作する）。
        if (placedToken && !placedCardId) {
          await helpers.flipCard?.(placedToken.id);
          placedToken = topCardAtDest();
          placedCardId = placedToken?.cardId;
        }
        if (!placedCardId) break; // 山札切れ等
        placedAny = true;
        // 続き59: 到達効果を得ない移動（ctx.arrivedAtを意図的にセットしない）である旨を
        // suppressArrival=trueで伝え、オンライン対戦の相手クライアント側
        // （remote-move-animator.js）が誤って到達を再現しないようにする。
        await helpers.moveAndSync(ctx.pieceTokenId, dest, undefined, true);
        ctx.pieceLocation = { row: dest.row, col: dest.col };
        // ユーザー要望2026-08-08「移動先をしっかり周知した後、じらしフリップで」。駒が移動先へ
        // 進んだ姿を一拍見せて（周知）から、中央のじらしフリップで踏んだカードを公開する。
        await helpers.delay?.(500);
        // 踏んだカードを中央に大きく“じらしてフリップ”で見せ、その後で盤面のカードも表向きにする
        // （試練で踏んだカードは表向きで盤面に残る）。
        await helpers.announceSteppedCard?.(placedCardId);
        // まだ裏向きなら（ローカルのじらし用）ここで盤面のカードを表向きに。オンラインで上の
        // 判明処理により既に表向きの場合は、二度目のflipで裏返さないよう最新状態を見て判断する。
        const boardCardNow = getState().tokens.find((t) => t.id === placedToken.id);
        if (boardCardNow && !boardCardNow.faceUp) await helpers.flipCard?.(placedToken.id);
        const placedColor = getCardDefinition(placedCardId)?.color;
        const isMatch = placedCardId === "rainbow-shard" || declaredColors.includes(placedColor);
        // 続き65: 置いたカードで宣言色が判明した瞬間なので、常駐していた色宣言表示を消す
        // （当たっていた場合はこの直後にhelpers.declareColorsで新しい表示に置き換わる）。
        await helpers.announceColorsResolved?.();
        if (!isMatch) break; // 宣言色が出なかった＝試練終了。結果はループ後にまとめて出す。
        // 当たり。踏んだカード自体は announceSteppedCard で中央に見せているので、ここでは
        // 「おめでとう」モーダルは挟まず（ユーザー: おめでとうはダサい／最後にまとめて出す）、
        // 回数だけ数えて次の色宣言へ進む。
        successCount += 1;
        const redeclared = await helpers.declareColors({ exactCount: 3 }, ctx.cardId, ctx.player);
        if (!redeclared || redeclared.length === 0) break; // 善処の原則: 再宣言をキャンセルしたらそこで終わる
        declaredColors = redeclared;
        ctx.selections.declaredColors = declaredColors;
      }
      helpers.stopSuspenseSound?.(); // 結果表示前に鼓動を止める
      // ユーザー要望2026-08-07: 試練は必ずハズレで終わるので、最後に「〇回成功！」を出す。
      // 1回以上当てていれば紙吹雪でお祝い、0回なら控えめに残念を出す。
      // 誰の結果かが分かるように発動者名を主語に添える（総点検、ユーザー要望2026-08-08）。
      const ritualName = helpers.getPlayerName?.(ctx.player) ?? "";
      if (successCount > 0) {
        if (helpers.celebrate) {
          await helpers.celebrate(ctx.cardId, { tone: "success", headline: `${successCount}回成功！`, sub: `${ritualName}が試練を耐え抜きました！` });
        } else {
          await helpers.announceEffectReason?.(ctx.cardId, `${ritualName}が${successCount}回成功！試練を耐え抜きました！`);
        }
      } else {
        await helpers.announceEffectReason?.(ctx.cardId, `残念でした。${ritualName}は宣言した色が出ませんでした。`);
      }
      return placedAny;
      } finally {
        ritualPlaceMoveInProgress = false;
      }
    }
    case VERBS.ALL_PLAYERS_PLACE_ONE_CARD_IN_EMPTY_CELL: {
      // 合同建設専用: 全員がそれぞれ「何もない1マスに山札または手札から1枚裏向きで
      // 置く」を、処理順の原則に沿って1人ずつ行う。各プレイヤー自身の選択
      // （マス・山札か手札か・どのカードか）はhelpers.delegateToPlayerに委ねる
      // （main.js側：自分の番ならその場で、他プレイヤーの番ならオンライン中継で
      // 対象プレイヤー本人の画面に委任する）。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        if (await helpers.delegateToPlayer(p, "joint-construction")) hadEffect = true;
      }
      return hadEffect;
    }
    case VERBS.ALL_PLAYERS_DISCARD_TO_THREE: {
      // スラム上がりの役人専用: 全員がそれぞれ「手札が3枚になるまで自分で選んで
      // 捨てる」を、処理順の原則に沿って1人ずつ行う。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        const beforeCount = getHandTokens(p).length;
        if (await helpers.delegateToPlayer(p, "slum-official-discard")) hadEffect = true;
        // お知らせ（ユーザー要望）: 誰が何枚捨てたか（対象ごと）。委任前後の手札枚数の差から算出。
        const discarded = beforeCount - getHandTokens(p).length;
        if (discarded > 0)
          await helpers.announceEffectReason?.(ctx.cardId, `${helpers.getPlayerName(p)}は手札を${discarded}枚捨てました。`);
      }
      return hadEffect;
    }
    case VERBS.ALL_PLAYERS_CHOOSE_PARTY_OPTION: {
      // パーティー専用: 全員がそれぞれ3択から1つ選んで得る、を処理順の原則に沿って
      // 1人ずつ行う。
      let hadEffect = false;
      for (const p of rotatedActivePlayersFrom(ctx.player)) {
        if (await helpers.delegateToPlayer(p, "party-option")) hadEffect = true;
      }
      return hadEffect;
    }
    case VERBS.END_CURRENT_PHASE: {
      // なないろの巨光・スラム上がりの役人・ザ・ギャンブルの手札効果専用。
      helpers.endCurrentPhase?.();
      return true;
    }
    case VERBS.PLACE_SELF_ADJACENT_TO_CHOSEN_OPPONENT: {
      // プレゼント専用: 相手を選び、その隣接マス（4方向、docs/cards.mdに「何もない」の
      // 限定が無いため占有状況は問わない）へこのカード自身を裏向きで置く。
      // ユーザー要望「場に関する効果で相手を選ぶ時はアバターではなく駒を選ぶ形に」。
      // 盤面上の相手の駒のマスをpickLocationで選ばせる（マスチェンジと同じパターン）。
      const opponentCells = getAllOpponentPieceCells(ctx.player);
      if (opponentCells.length === 0) return false;
      let targetCell;
      if (opponentCells.length === 1) {
        // ユーザー要望「選べる相手が１人しかいない場合は自動でその人を選択し、その旨を
        // モーダルで示してほしい」（続き65／プレゼント等の再要望 2026-08-07）。スリカエ・
        // マスチェンジ等の「相手を選ぶ」系と揃え、手札効果のforcePrompt（対象1人でも選ばせる）
        // に関係なく自動選択する——相手が1人なら実質的に選択の余地が無いため（続き93の
        // 総点検ではマスチェンジだけを直したが、この「相手の駒を選ぶ」系にも抜けが残っていた）。
        targetCell = opponentCells[0];
        await helpers.announceEffectReason?.(ctx.cardId, "選べる相手が1人しかいないため、自動的に選択しました。");
      } else {
        targetCell = await helpers.pickLocation(opponentCells, "隣に置く相手の駒を選んでください");
      }
      if (!targetCell) return false;
      const targetPiece = findPieceAtCell(targetCell.row, targetCell.col);
      if (!targetPiece || targetPiece.location.zone !== "cell") return false;
      const adjacentCells = enumerateManhattanRing(1)
        .map(({ dr, dc }) => ({ row: targetPiece.location.row + dr, col: targetPiece.location.col + dc }))
        .filter(({ row, col }) => inBounds(row, col))
        .map(({ row, col }) => ({ zone: "cell", row, col }));
      if (adjacentCells.length === 0) return false; // 善処の原則: 盤面端で隣接マスが無い場合
      const dest =
        adjacentCells.length === 1 ? adjacentCells[0] : await helpers.pickLocation(adjacentCells, "カードを置く隣接マスを選択してください");
      if (!dest) return false;
      await helpers.moveAndSync(ctx.cardTokenId, dest);
      // お知らせ（ユーザー要望）: 誰の隣にプレゼントを置いたか。
      await helpers.announceEffectReason?.(ctx.cardId, `${helpers.getPlayerName(targetPiece.player)}の隣にプレゼントを置きました。`);
      return true;
    }
    case VERBS.PLACE_DECK_CARD_ON_ALL_FACEUP_CELLS: {
      // 白の意思の覚醒専用: 場の全ての表向きのカードの上に山札から1枚ずつ裏向きで置く
      // （１番上の原則により対象は盤面マスのトークンのみでよい、白の意思の覚醒の
      // 到達効果DISCARD_ALL_FACEUP_ON_BOARDと同じ判定基準）。
      const faceUpCells = getState()
        .tokens.filter((t) => t.kind === "card" && t.location.zone === "cell" && t.faceUp)
        .map((t) => ({ zone: "cell", row: t.location.row, col: t.location.col }));
      if (faceUpCells.length === 0) return false;
      for (const dest of faceUpCells) {
        await helpers.placeFromDeck(dest);
      }
      return true;
    }
    case VERBS.DISCARD_OWN_HAND: {
      // 色落ちキャットの手札効果専用: 全員対象のALL_PLAYERS_DISCARD_HAND_AND_DRAWと
      // 違い、自分の手札だけを全て捨てる。
      const handTokens = getHandTokens(ctx.player);
      if (handTokens.length === 0) return false;
      for (const token of handTokens) {
        await helpers.discardAndSync(token.id);
      }
      return true;
    }
    case VERBS.DISCARD_ONE_HAND_CARD: {
      // ザ・ギャンブルの手札効果専用コスト: 追色（同色限定）と違い、手札からどの色でも
      // 1枚選んで捨てる。
      const handTokens = getHandTokens(ctx.player);
      if (handTokens.length === 0) return false;
      const chosen = await helpers.pickHandCard(ctx.player, "捨てるカードを手札から選択してください");
      if (!chosen) return false;
      await helpers.discardAndSync(chosen.id);
      return true;
    }
    case VERBS.DRAW_IF_HAND_AT_MOST: {
      // スラム上がりの役人専用: 手札効果は先にこのカード自身を捨ててから残りの
      // アクションが実行されるため（docs/cards.md補足）、ここでの手札枚数カウントには
      // このカード自身は含まれない。
      const handCount = getHandTokens(ctx.player).length;
      if (handCount > action.maxHandSize) return false;
      await helpers.drawCards(ctx.player, action.count);
      return true;
    }
    case VERBS.INHERIT_ARRIVAL_ACTIONS: {
      // ザ・ギャンブルの手札効果専用: 到達効果と全く同じactionsをそのまま実行する
      // （続き29のeffectDef単位inheritsArrivalフラグと違い、前後に別のアクションを
      // 挟めるアクション単位の仕組み）。
      const arrivalDef = CARD_EFFECTS[ctx.cardId]?.arrival;
      if (!arrivalDef?.actions?.length) return false;
      let hadEffect = false;
      for (const a of arrivalDef.actions) {
        if (await runActionSafely(a, ctx, helpers)) hadEffect = true;
      }
      return hadEffect;
    }
    default:
      console.warn(`card-effect-engine: 未対応の動詞 "${action.verb}"`);
      return false;
  }
}

// ユーザー報告「ザ・ギャンブルで宣言色が出てしまったときに、手札がすべて捨てられず
// 止まってしまっている」の調査で発見: runAction単体が例外を投げると（未実装の
// helper呼び出し等）、呼び出し元のfor-of loopにtry/catchが無いため、そこで例外が
// そのまま外まで伝播し、以降のアクション（手札を全て捨てる・フェイズを終了する等）が
// 一切実行されないまま効果全体が静かに止まる（コンソールにエラーは出るがユーザー
// 画面には何も表示されない）。1つのアクションの失敗が後続を道連れにしないよう、
// runAction/runActionSafelyを呼ぶ4箇所全て（runArrivalEffect・runHandEffectOption・
// runArrivalOptionsEffect・INHERIT_ARRIVAL_ACTIONS）でこちらを使う。
async function runActionSafely(action, ctx, helpers) {
  try {
    const result = await runAction(action, ctx, helpers);
    logAction("effect-verb", { verb: action.verb, cardId: ctx.cardId, player: ctx.player, result });
    return result;
  } catch (err) {
    console.error(`card-effect-engine: アクション実行に失敗（動詞 "${action.verb}"）`, err);
    logAction("effect-verb", { verb: action.verb, cardId: ctx.cardId, player: ctx.player, result: "error", error: String(err) });
    return false;
  }
}

// 選べる罠専用: 「以下の効果のうち1つ得る」形の到達効果（arrivalOptions）を処理する。
// なないろの欠片のhandEffectOptionsと同じ考え方だが、選ぶのはこのカードの到達効果
// 自身なので、使えるプレイヤーは常にeffectの使用者本人（対象選択は不要）。
async function runArrivalOptionsEffect(ctx, options, helpers) {
  const runCtx = {
    player: ctx.player,
    cardId: ctx.cardId,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: ctx.pieceTokenId,
    pieceLocation: ctx.pieceLocation,
    selections: {},
    arrivedAt: null,
  };
  const usableOptions = options.filter((opt) => isArrivalOptionUsable(runCtx.player, runCtx.pieceLocation, opt));
  let hadEffect = false;
  if (usableOptions.length > 0) {
    const optionsWithUsability = options.map((opt) => ({ ...opt, usable: usableOptions.includes(opt) }));
    const chosen = await helpers.pickArrivalOption(ctx.cardId, optionsWithUsability);
    if (chosen) {
      // 選べる罠（3択から1つ得る）で選んだ内容を全員に告知（choose-effect-reveal方針）。
      await helpers.announceEffectChoice?.(ctx.cardId, ctx.player, chosen.label);
      for (const action of chosen.actions) {
        if (await runActionSafely(action, runCtx, helpers)) hadEffect = true;
      }
    }
  }
  // docs/cards.md補足「全て選べないときは効果は不発となる。効果が不発の時は、この
  // カードをあなたの手札に加えるだけである」。選べる選択肢自体が無い場合に加え、
  // 選択肢はあったが（プレイヤーがピッカーをキャンセルした等で）結局何も起きなかった
  // 場合も同じ扱いにする。
  if (!hadEffect) {
    await helpers.announceFizzle?.(ctx.cardId, true);
  }
  // runArrivalEffectの既定動作と同じ理由（このカード自身が、選択肢の中の「場の
  // カードを手札に加える」系アクションで既に別プレイヤーの手札へ渡っている
  // 可能性がある）で、まだ盤面に残っている場合だけ動かす。
  const currentToken = getState().tokens.find((t) => t.id === ctx.cardTokenId);
  if (currentToken && currentToken.location.zone === "cell") {
    await helpers.moveAndSync(ctx.cardTokenId, { zone: "hand", player: ctx.player });
  }
  return runCtx.arrivedAt;
}

// 到達効果を自動処理する。ctx: { cardId, player, pieceTokenId, cardTokenId, pieceLocation }。
// 戻り値: 効果中にmoveが発生し新しいマスへ到達した場合はその場所（呼び出し元が続けて
// そのマスの到達判定を行うために使う）、それ以外はnull。
export async function runArrivalEffect(ctx, helpers) {
  // 選べる罠専用: `arrival`ではなく`arrivalOptions`でデータを持つカードは別経路。
  const arrivalOptions = CARD_EFFECTS[ctx.cardId]?.arrivalOptions;
  if (arrivalOptions) return runArrivalOptionsEffect(ctx, arrivalOptions, helpers);
  const effectDef = CARD_EFFECTS[ctx.cardId]?.arrival;
  if (!effectDef) return null;
  // ハマりどころ: このctx（このファイル冒頭のドキュメントコメント通り本来
  // cardTokenIdを含むはず）にcardTokenIdが抜けていた。runAction内でctx.cardTokenId
  // を参照するアクション（現状はPLACE_CARDのsource:"self"）が実行時に必ずundefined
  // を受け取ってしまうバグだったため、ここで明示的に引き継ぐ。
  const runCtx = {
    player: ctx.player,
    cardId: ctx.cardId,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: ctx.pieceTokenId,
    pieceLocation: ctx.pieceLocation,
    selections: {},
    arrivedAt: null,
  };
  let hadEffect = false;
  for (const action of effectDef.actions) {
    if (await runActionSafely(action, runCtx, helpers)) hadEffect = true;
  }
  // ユーザー要望「効果が不発だった場合（例: マスチェンジで３マス以内に相手がいない等）
  // は『不発のためこのカードを手札に加えます』的なモーダルを出しましょう」。アクションが
  // 1つ以上あるのに1つも実際には起きなかった場合だけが対象——なないろの欠片のように
  // actions:[]（＝到達効果自体が元々存在しないカード）は「不発」ではなく仕様通りの
  // 「何もしない」なので、こちらは対象外にする。
  if (effectDef.actions.length > 0 && !hadEffect) {
    await helpers.announceFizzle?.(ctx.cardId, effectDef.addsCardToHandAfter !== false);
  }
  // 既定動作（到達効果処理後にこのカード自身を手札に加える）。明示的にfalseの時だけ省略する
  // （docs/cards.mdの凡例通り）。
  // ユーザー報告「パーティの到達効果で場のカードを取ることを選んだ時、到達した
  // パーティのカード自身も対象にでき取れるが、到達していないプレイヤーがそれを
  // 取ったとき、そのプレイヤーの手札に加わらず到達プレイヤーに持っていかれて
  // しまう」の原因: パーティー等の「全員がそれぞれ選ぶ」効果（ALL_PLAYERS_
  // CHOOSE_PARTY_OPTION→delegateToPlayer）の中の「場の任意の１枚を手札に加える」
  // 選択肢は、まだ盤面に残っているこのカード自身（ctx.cardTokenId）も候補に
  // 含み得る。誰かがそれを選んで既に自分の手札へ移していても、ここの既定動作は
  // 無条件にctx.cardTokenIdを「到達プレイヤーの手札」へ動かしてしまい、既に
  // 別のプレイヤーへ渡っていたはずのカードを奪い返す形になっていた。このカードが
  // まだ盤面（cellゾーン）に残っている場合だけ既定動作を行うようにする。
  if (effectDef.addsCardToHandAfter !== false) {
    const currentToken = getState().tokens.find((t) => t.id === ctx.cardTokenId);
    if (currentToken && currentToken.location.zone === "cell") {
      // 手札へ移す前に、獲得するカードのidと公開状態を控えておく（移動後はcellから消えるため）。
      const addedCardId = currentToken.cardId;
      const wasFaceUp = !!currentToken.faceUp;
      // ユーザー要望「到達後、そのカードが実際に手札へ吸い込まれて加わるアニメを入れたい」。
      // 実際に手札へ移す(moveAndSync)前に、盤面マスから手札へ飛翔する演出を挟む
      // （移動アニメーションを減らす設定中はhelpers側で即nop）。
      await helpers.flyCardToHand?.(ctx.cardTokenId, ctx.player);
      await helpers.moveAndSync(ctx.cardTokenId, { zone: "hand", player: ctx.player });
      // ユーザー報告2026-08-07「到達したカードを獲得した時、右下のカード獲得トーストが
      // 出ていない気がする」。手動の到達（addArrivedCardToHand）は announceHandPickups で
      // 通知していたが、自動処理経由のこの既定動作では通知が漏れていた。同じトーストを出す。
      helpers.announceCardAddedToHand?.(addedCardId, ctx.player, wasFaceUp);
    }
  }
  return runCtx.arrivedAt;
}

// 選ばれた1つの選択肢を実際に実行する（runHandEffectの内部処理を切り出したもの）。
async function runHandEffectOption(ctx, option, helpers) {
  // ユーザー要望「手札効果を使用したら、このカードが使用されるよ！って知らしめる
  // モーダルをしっかりと出したい」。実際の状態変更（捨てる・コスト支払い等）より前、
  // 「このカードを使う」と決まった瞬間に出す。
  helpers.announceUse?.(ctx.cardId, option.label, ctx.player);
  // ユーザー指摘: 手札効果は「原則まず最初にそのカードを捨てて効果を発動する」。
  // 凡例（docs/cards.md）「効果カード自身の処遇の記載がなければ、効果発動時に
  // このカードを捨てる」の「発動時に」は、追色コストの支払いやアクション実行より
  // 前——最初のステップだという指摘。実際、スラム上がりの役人の手札効果補足
  // 「あなたの手札が１枚以下ならの時の手札のカウントの際にこのカード自身は含まない」
  // の通り、後続のアクションが「捨てた後の手札状態」を参照する効果が実在するため、
  // 単なる見た目の順序の話ではなく実際に先に捨てておく必要がある。エターナル/
  // ファーストカードは基本効果「これの手札効果はこれがロックされていても使える」の
  // 通り消費されない特別枠のため、このデフォルトの対象外（cardIdの命名規則で判定、
  // main.js側の他の分岐と同じ基準）。なないろの欠片の「２枚をロックする」選択肢の
  // ように、選択肢自体がこのカードを別の形で処遇する場合はkeepsCardOnUseで上書きする。
  if (!option.keepsCardOnUse && !ctx.cardId.startsWith("eternal-") && !ctx.cardId.startsWith("first-")) {
    await helpers.discardAndSync(ctx.cardTokenId);
  }
  if (option.cost?.verb === VERBS.DISCARD_SAME_COLOR) {
    const color = getCardDefinition(ctx.cardId)?.color;
    const candidates = findSameColorDiscardCandidates(ctx.cardTokenId, color, ctx.player);
    // ユーザー要望「追色カードを手札から選択するステップを踏んでください」。候補が
    // 1枚でも自動採用せず、常にpickDiscardCostのステップを踏ませる。
    const chosen = await helpers.pickDiscardCost(candidates, `捨てる${color === "white" || color === "black" ? "" : "同じ色の"}カードを手札から選択してください`);
    if (!chosen) return false;
    await helpers.discardAndSync(chosen.id);
  }
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === ctx.player);
  // ハマりどころ: このruncCtxにcardTokenIdが抜けていたため、runAction内で
  // ctx.cardTokenIdを参照するアクション（LOCK_PAIRの「自分自身は除外して同名の
  // もう1枚を探す」判定、PLACE_CARDのsource:"self"等）が実行時に必ずundefinedを
  // 受け取ってしまうバグだった（LOCK_PAIRの場合、`t.id !== ctx.cardTokenId`が
  // 常にtrueになり除外が効かなくなる）。ctx.cardTokenIdをそのまま引き継ぐ。
  const runCtx = {
    player: ctx.player,
    cardId: ctx.cardId,
    cardTokenId: ctx.cardTokenId,
    pieceTokenId: piece?.id ?? null,
    pieceLocation: piece?.location ?? null,
    selections: {},
    arrivedAt: null,
    // ユーザー要望「対象が１人でもハイライトして選ばせるステップを踏んでください」。
    // 到達効果（runArrivalEffect）は従来通り候補1つなら自動採用のまま
    // （テンポを優先、今回の要望の対象外）——手札効果だけこのフラグで切り替える。
    forcePrompt: true,
  };
  for (const action of option.actions) {
    await runActionSafely(action, runCtx, helpers);
  }
  recordHandEffectUsage(ctx.cardId, ctx.player);
  return true;
}

// 手札効果を自動処理する。ctx: { cardId, cardTokenId, player }。helpers（moveAndSync等の
// 既存分に加えて）:
//   discardAndSync(tokenId): 「追色」コストで実際にカードを1枚捨てる（オンライン同期込み）。
//   pickDiscardCost(candidates, hint): 追色コストの候補（同色の手札トークン配列）から
//     1枚選ばせる。
//   pickHandEffectOption(cardId, optionsWithUsability): 選択肢が2つ以上ある手札効果
//     （なないろの欠片等）で、どれを使うか選ばせる。optionsWithUsabilityの各要素は
//     `{...option, usable}` — usable:falseの選択肢はグレー表示にする（ユーザー要望）。
//     選ばれたoptionオブジェクト（またはキャンセル時null）を返す。
//   drawCards(player, count): 山札からplayerの手札へcount枚引く（オンライン同期込み）。
//   placeFromDeck(location): 山札の一番上を直接そのマスへ裏向きで置く（オンライン同期込み、
//     PLACE_CARDのsource:"deck"用）。
//   swapPieces(pieceTokenId, fromLocation, toLocation): 自分の駒と、toLocationにいる相手の
//     駒の位置を入れ替える（SWAP_POSITION用）。
//   announceUse(cardId, optionLabel): 「このカードを使用します」の告知モーダルを出す。
// マスチェンジ等、手札効果でも到達効果と同じアクション（PICKUP_TO_HAND・PLACE_CARD・
// SWAP_POSITION等）を使うカードが出てきたため、到達効果と同じrunAction()ディスパッチャを
// 共有する。自分の駒はplayerから引ける（盤面上に必ず1つだけ存在するため、呼び出し元から
// 別途渡してもらう必要は無い）。
// 戻り値: 実際に発動できた（コストを払えた）ならtrue、使用回数制限・コスト不足・
// 選択肢を選ばず終わった等で発動できなかったならfalse（呼び出し元がその旨を案内するために使う）。
export async function runHandEffect(ctx, helpers) {
  const options = getHandEffectOptions(ctx.cardId);
  if (options.length === 0) return false;
  if (!canUseHandEffect(ctx.cardId, ctx.cardTokenId, ctx.player)) return false;
  let chosenOption;
  if (options.length === 1) {
    chosenOption = options[0];
  } else {
    // ユーザー要望「手札効果は２つあります。効果選択モーダルを出してください。
    // 使用できない方はグレー表示。」
    const optionsWithUsability = options.map((opt) => ({
      ...opt,
      usable: isHandEffectOptionUsable(ctx.cardId, ctx.cardTokenId, ctx.player, opt),
    }));
    chosenOption = await helpers.pickHandEffectOption(ctx.cardId, optionsWithUsability);
    if (!chosenOption) return false;
    // 「選ぶ系」の手札効果（なないろの欠片 等、複数選択肢から1つ）は、選んだ内容を全員に
    // 告知する（ユーザー要望・choose-effect-reveal方針）。単一効果（options.length===1）は
    // 選択ではないので告知しない。
    await helpers.announceEffectChoice?.(ctx.cardId, ctx.player, chosenOption.label);
  }
  return runHandEffectOption(ctx, chosenOption, helpers);
}
