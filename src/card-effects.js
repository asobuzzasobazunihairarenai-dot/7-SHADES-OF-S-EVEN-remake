// カード効果の構造化データ（DSL）試作。ユーザーと相談の上決めた方針:
// ・カード効果を「動詞（verb）＋パラメータ」の配列として表現する。
// ・効果テキストは保存せず、常にこのデータから毎回その場で生成する
//   （generateEffectText参照。データを1箇所直せば表示文もズレなく追従する）。
// ・将来的にはカード画像のテキスト欄を空欄にして、この生成テキストを重ねて表示する
//   構想があるが、それはこのファイルの検証が済んでからの別作業（このファイルは
//   まだゲーム本体には一切配線していない、パイロット5枚だけの設計たたき台）。
//
// パイロットカード5枚（docs/cards.mdの実際のルールテキストと照らし合わせて選定）:
//   1. ゴメンナサイッ！   - 最小構成（動詞1つ・数量1つだけ）
//   2. 奇跡の森 マンズウッド - 「ドロー」動詞＋「追色」コストの最小構成
//   3. ジャンプ台         - 「効果カード自身は手札に加えない」という既定動作の上書き
//   4. 収穫と種まき       - 対象選択＋連続する2アクション（拾う→置く、同じマスを参照）
//   5. 黄金の宮殿 ドムス・ネロ - 自分/相手全員で数量が違う複数ターゲット＋使用回数制限
//
// このデータ構造で表現しきれないカードが見つかるたびに、動詞・パラメータの語彙を
// 増やしていく想定（このファイル冒頭のVERBS一覧がそのまま「今サポートしている動詞」の
// 一覧になる）。

// --- 語彙（今回のパイロット5枚を表現するのに必要な最小セット） -----------------------
// verb一覧。新しいカードを追加するたびに、ここに無い動詞が必要になったら追記する。
export const VERBS = {
  MOVE: "move", // 自分の駒を移動する
  DRAW: "draw", // 山札から手札にカードを加える
  PICKUP_TO_HAND: "pickup_to_hand", // 盤面上のカードを手札に加える
  PLACE_CARD: "place_card", // 手札または山札からマスにカードを置く
  DISCARD_SAME_COLOR: "discard_same_color", // 「追色」コスト: 同色のカードを手札から捨てる
  SWAP_POSITION: "swap_position", // 自分の駒と、範囲内にいる相手の駒の位置を入れ替える（「移動」ではない）
};

// 効果の主語（誰が対象か）。「自分」以外は今回のパイロットでは「相手全員」だけ登場する。
export const TARGETS = {
  SELF: "self",
  ALL_OPPONENTS: "all_opponents",
};

// カードを置くマスの選び方。「choose」はプレイヤーが実際にマスを選ぶ（UIでの対象選択が
// 必要）、「sameAs」は同じ効果内の別のアクションで選んだマスをそのまま指す
// （収穫と種まきの「拾ったマスに置き直す」を表現するために必要になった）。
export const TARGET_SELECTIONS = {
  CHOOSE: "choose",
  SAME_AS: "same_as",
};

// --- パイロットカード5枚 --------------------------------------------------------------
// cardIdはcards-data.jsの実際のidと一致させてある（将来ここを正規の効果データ置き場に
// 昇格させる時、getCardDefinition()の結果とこのファイルをcardId経由で突き合わせられる
// ようにするため）。
export const CARD_EFFECTS = {
  // 1. ゴメンナサイッ！（紫、通常カード） 到達効果: 「１マス移動する。」
  "purple-sorry": {
    arrival: {
      actions: [{ verb: VERBS.MOVE, count: 1 }],
    },
  },

  // 2. 奇跡の森 マンズウッド（緑、エターナルカード） 手札効果: 「【追色１】１枚ドロー。」
  "eternal-green": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.DRAW, count: 1, target: TARGETS.SELF }],
    },
  },

  // 3. ジャンプ台（赤、通常カード）
  // 到達効果: 「これはあなたの手札に加えない。２マス先に一気に移動する。」
  // ユーザー指摘: 「一気に」は言い回しではなく実際の挙動を変える条件。atOnce:falseだと
  // 「1マス移動して到達判定→もう1マス移動して到達判定」を2回繰り返す（各ステップで
  // 通常の移動ルール＝移動先にカードが必要、が適用される）。atOnce:trueだと中間マスの
  // カード・駒の有無を問わず最終着地点まで直接ワープし、到達判定も最終着地点でのみ
  // 発生する（ノート「１マス目のカードや相手の駒等の有無は関係ない」の通り）。
  "red-jump-pad": {
    arrival: {
      // 既定動作（効果処理後にこのカード自身を手札に加える）を明示的に上書きする。
      addsCardToHandAfter: false,
      actions: [{ verb: VERBS.MOVE, count: 2, atOnce: true }],
    },
  },

  // 4. 収穫と種まき（橙、通常カード）
  // 到達効果: 「任意の１マスの１枚をあなたの手札に加える。手札から１枚をそのマスに
  // 裏向きで置く。」
  "orange-harvest-sow": {
    arrival: {
      actions: [
        {
          verb: VERBS.PICKUP_TO_HAND,
          count: 1,
          target: { zone: "cell", selection: TARGET_SELECTIONS.CHOOSE, count: 1, saveAs: "chosenCell" },
        },
        {
          verb: VERBS.PLACE_CARD,
          count: 1,
          source: "hand",
          faceUp: false,
          destination: { zone: "cell", selection: TARGET_SELECTIONS.SAME_AS, ref: "chosenCell" },
        },
      ],
    },
  },

  // 5. 黄金の宮殿 ドムス・ネロ（黄、エターナルカード）
  // 手札効果: 「【追色１】２枚ドロー。相手全員は１枚ドロー。この効果は１ターンに
  // １度のみ得られる。」
  "eternal-yellow": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      usageLimit: { per: "turn", count: 1 },
      actions: [
        { verb: VERBS.DRAW, count: 2, target: TARGETS.SELF },
        { verb: VERBS.DRAW, count: 1, target: TARGETS.ALL_OPPONENTS },
      ],
    },
  },

  // 6. なないろの欠片（虹、通常カード） 手札効果: 「以下の効果のうち１つ得る。
  // ・１枚ドロー。・これを含めた「なないろの欠片」が２枚、あなたの手札にある時に
  // 使える。その２枚を任意の１箇所にロックする。２枚ドロー。」
  // 選択肢のうち「１枚ドロー」（コスト無し）だけを今回DSL化する。もう一方
  // （２枚集めて任意の１箇所にロックする）は、通常のロックフェイズ判定を経ない
  // 特殊なロック処理が必要でDSLの現在の語彙では表現しづらいため、引き続き
  // 自己申告のままにする（ユーザー確認の上での意図的な部分対応）。
  "rainbow-shard": {
    handEffect: {
      actions: [{ verb: VERBS.DRAW, count: 1, target: TARGETS.SELF }],
    },
  },

  // 7. 終わりなき化学 ゲンテクニーク（紫、エターナルカード） 手札効果:
  // 「【追色１】任意の１マスの１枚をあなたの手札に加える。そのマスに山札から
  // １枚裏向きで置く。」——収穫と種まきと同じ「拾う→同じマスに置き直す」の形だが、
  // 置き直す方の出どころが手札ではなく山札。
  "eternal-purple": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [
        {
          verb: VERBS.PICKUP_TO_HAND,
          count: 1,
          target: { zone: "cell", selection: TARGET_SELECTIONS.CHOOSE, count: 1, saveAs: "chosenCell" },
        },
        {
          verb: VERBS.PLACE_CARD,
          count: 1,
          source: "deck",
          faceUp: false,
          destination: { zone: "cell", selection: TARGET_SELECTIONS.SAME_AS, ref: "chosenCell" },
        },
      ],
    },
  },

  // 8. 月下の漂流船 プリドゥエン（青、エターナルカード） 手札効果:
  // 「【追色１】任意の２マスに山札から１枚ずつ裏向きで置く。」
  "eternal-blue": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          count: 2,
          source: "deck",
          faceUp: false,
          destination: { zone: "cell", selection: TARGET_SELECTIONS.CHOOSE },
        },
      ],
    },
  },

  // 9. マスチェンジ（橙、通常カード） 到達効果: 「３マス以内の相手のいる場所と
  // あなたのいる場所を入れ替える。相手はこのカードの到達効果を得ない。」／
  // 手札効果: 「【追色１】上記の到達時の効果を得る。」——同じ入れ替え効果を
  // 到達・手札の両方から呼べるよう、アクション自体を共有する。
  // 「入れ替える」は「移動」ではないため、入れ替え先のカードはオープンせず
  // 到達判定も連鎖しない（docs/cards.md 到達効果補足）。
  "orange-mass-change": {
    arrival: {
      actions: [{ verb: VERBS.SWAP_POSITION, count: 3 }],
    },
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.SWAP_POSITION, count: 3 }],
    },
  },

  // 10. 橙のキューブ ハーベスト（橙、ファーストカード） 手札効果:
  // 「【追色１】２マス以内のカードを１枚あなたの手札に加える。」
  // cardIdはcards-data.js（FIRST_CARDS）の実際のid「first-orange」に合わせる
  // （「色-first」ではなく「first-色」——main.js側のクリック判定
  // (cardId?.startsWith("first-"))もこの命名規則に依存している）。
  "first-orange": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [
        {
          verb: VERBS.PICKUP_TO_HAND,
          count: 1,
          withinCells: 2,
          target: { zone: "cell", selection: TARGET_SELECTIONS.CHOOSE, count: 1 },
        },
      ],
    },
  },
};

// --- 効果データ → 表示テキスト生成 -----------------------------------------------------
// ユーザー確認済み方針「効果を修正したら効果文も毎回上書き生成される（＝そもそも保存せず
// 毎回その場で計算する）」。動詞ごとにテンプレート文を持たせる方式（1つの万能組み立て
// ロジックにはしない——日本語は助数詞・語順が動詞ごとに変わるため）。
// 生成される文章は今の説明書の言い回しほど自然ではない、やや機械的な文になる想定
// （フレーバーテキストΩは別枠のまま人力で書く）。

// ユーザー要望「効果文が生成される」を実際の説明書の言い回しに近づけるための微調整。
// 説明書（docs/cards.md）は数字を全角（１２３…）で書く慣習のため、生成テキストでも
// 半角の数値をそのまま埋め込まず全角に変換する。
const FULLWIDTH_DIGITS = "０１２３４５６７８９";
function toFullWidthNumber(n) {
  return String(n).replace(/[0-9]/g, (d) => FULLWIDTH_DIGITS[Number(d)]);
}

function renderTargetLabel(target) {
  if (target === TARGETS.ALL_OPPONENTS) return "相手全員は";
  return ""; // 自分が主語の場合、既存の説明書と同じく主語を省略する
}

function renderAction(action, context) {
  const count = toFullWidthNumber(action.count);
  switch (action.verb) {
    case VERBS.MOVE:
      // atOnce（一気に）: 中間マスの状態を無視して直接ワープする、実際に挙動が変わる
      // 条件（ユーザー指摘、単なる言い回しの違いではない）。falseなら1マスずつの
      // 通常移動をcount回繰り返す想定（各回で移動先にカードが必要、到達判定も毎回発生）。
      return action.atOnce ? `${count}マス先に一気に移動する。` : `${count}マス移動する。`;
    case VERBS.DRAW:
      return `${renderTargetLabel(action.target)}${count}枚ドロー。`;
    case VERBS.PICKUP_TO_HAND: {
      const zoneLabel = action.withinCells
        ? `${toFullWidthNumber(action.withinCells)}マス以内の`
        : action.target?.selection === TARGET_SELECTIONS.CHOOSE
          ? `任意の${toFullWidthNumber(action.target.count)}マスの`
          : "";
      if (action.target?.saveAs) context.selections[action.target.saveAs] = action.target;
      return `${zoneLabel}${count}枚をあなたの手札に加える。`;
    }
    case VERBS.PLACE_CARD: {
      const sourceLabel = action.source === "hand" ? "手札から" : "山札から";
      const faceLabel = action.faceUp ? "表向きで" : "裏向きで";
      const destLabel =
        action.destination?.selection === TARGET_SELECTIONS.SAME_AS
          ? "そのマスに"
          : action.count > 1
            ? `任意の${count}マスに`
            : "任意のマスに";
      const perCardCount = action.destination?.selection === TARGET_SELECTIONS.SAME_AS ? count : "１";
      return `${destLabel}${sourceLabel}${perCardCount}枚${action.count > 1 ? "ずつ" : ""}${faceLabel}置く。`;
    }
    case VERBS.SWAP_POSITION:
      return `${count}マス以内の相手のいる場所とあなたのいる場所を入れ替える。`;
    default:
      return `（未対応の動詞: ${action.verb}）`;
  }
}

function renderCost(cost) {
  if (!cost) return "";
  if (cost.verb === VERBS.DISCARD_SAME_COLOR) return `【追色${toFullWidthNumber(cost.count)}】`;
  return "";
}

function renderUsageLimit(usageLimit) {
  if (!usageLimit) return "";
  const perLabel = usageLimit.per === "turn" ? "１ターン" : usageLimit.per;
  return `この効果は${perLabel}に${toFullWidthNumber(usageLimit.count)}度のみ得られる。`;
}

// effectDef: CARD_EFFECTS[cardId].arrival または .handEffect のどちらか一方。
export function generateEffectText(effectDef) {
  if (!effectDef) return "";
  const context = { selections: {} };
  const parts = [];
  // docs/cards.mdの凡例通り、既定動作（到達効果処理後にこのカード自身を手札に加える）を
  // 上書きしている場合だけ、その旨を明示する一文を先頭に足す（ジャンプ台等）。
  if (effectDef.addsCardToHandAfter === false) parts.push("これはあなたの手札に加えない。");
  const costText = renderCost(effectDef.cost);
  if (costText) parts.push(costText);
  for (const action of effectDef.actions) {
    parts.push(renderAction(action, context));
  }
  const limitText = renderUsageLimit(effectDef.usageLimit);
  if (limitText) parts.push(limitText);
  return parts.join("");
}

// --- 動作確認用（このファイル単体で実行し、docs/cards.mdの実際の文章と目視比較する） ---
// 例: `node src/card-effects.js` で実行できる。ゲーム本体からは呼ばれない、
// スキーマ検証だけが目的の使い捨てチェック。
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("card-effects.js")) {
  console.log("生成テキスト vs docs/cards.mdの実際の文章（比較用）:\n");
  console.log("[ゴメンナサイッ！到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["purple-sorry"].arrival));
  console.log("  実際: １マス移動する。\n");

  console.log("[奇跡の森 マンズウッド 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-green"].handEffect));
  console.log("  実際: 【追色１】１枚ドロー。\n");

  console.log("[ジャンプ台 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["red-jump-pad"].arrival));
  console.log("  実際: これはあなたの手札に加えない。２マス先に一気に移動する。\n");

  console.log("[収穫と種まき 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["orange-harvest-sow"].arrival));
  console.log("  実際: 任意の１マスの１枚をあなたの手札に加える。手札から１枚をそのマスに裏向きで置く。\n");

  console.log("[黄金の宮殿 ドムス・ネロ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-yellow"].handEffect));
  console.log("  実際: 【追色１】２枚ドロー。相手全員は１枚ドロー。この効果は１ターンに１度のみ得られる。\n");
}
