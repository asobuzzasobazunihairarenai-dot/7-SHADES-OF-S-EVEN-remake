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
  "red-jump-pad": {
    arrival: {
      // 既定動作（効果処理後にこのカード自身を手札に加える）を明示的に上書きする。
      addsCardToHandAfter: false,
      actions: [{ verb: VERBS.MOVE, count: 2 }],
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
      return `${count}マス移動する。`;
    case VERBS.DRAW:
      return `${renderTargetLabel(action.target)}${count}枚ドロー。`;
    case VERBS.PICKUP_TO_HAND: {
      const zoneLabel =
        action.target?.selection === TARGET_SELECTIONS.CHOOSE ? `任意の${toFullWidthNumber(action.target.count)}マスの` : "";
      if (action.target?.saveAs) context.selections[action.target.saveAs] = action.target;
      return `${zoneLabel}${count}枚をあなたの手札に加える。`;
    }
    case VERBS.PLACE_CARD: {
      const sourceLabel = action.source === "hand" ? "手札から" : "山札から";
      const faceLabel = action.faceUp ? "表向きで" : "裏向きで";
      const destLabel = action.destination?.selection === TARGET_SELECTIONS.SAME_AS ? "そのマスに" : "任意のマスに";
      return `${sourceLabel}${count}枚を${destLabel}${faceLabel}置く。`;
    }
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
  console.log("  実際: これはあなたの手札に加えない。２マス先に一気に移動する。");
  console.log("  （※「一気に」は演出上のニュアンスで、生成テキストでは省略している。挙動自体は");
  console.log("     ノートの「１マス目のカードや相手の駒等の有無は関係ない」通り、素通りする想定。）\n");

  console.log("[収穫と種まき 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["orange-harvest-sow"].arrival));
  console.log("  実際: 任意の１マスの１枚をあなたの手札に加える。手札から１枚をそのマスに裏向きで置く。\n");

  console.log("[黄金の宮殿 ドムス・ネロ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-yellow"].handEffect));
  console.log("  実際: 【追色１】２枚ドロー。相手全員は１枚ドロー。この効果は１ターンに１度のみ得られる。\n");
}
