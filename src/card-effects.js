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
  LOCK_PAIR: "lock_pair", // なないろの欠片専用: 手札の同名2枚を任意のロックスロットへまとめてロックする
  DRAW_IF_FEWEST_LOCKED: "draw_if_fewest_locked", // カウンターロック専用: 自分のロック枚数が全員中で最少（同率含む）なら1枚ドロー
  SWAP_RANDOM_HAND_CARD: "swap_random_hand_card", // 手品師の技専用: 選んだ相手と、互いの手札から無作為に1枚ずつ交換する
  DRAW_ALL_FEWEST_LOCKED: "draw_all_fewest_locked", // プレゼント専用: ロック枚数が全員中で最少（同率含む）の全員がそれぞれ1枚ドロー
  DISCARD_ALL_FACEUP_ON_BOARD: "discard_all_faceup_on_board", // 白の意思の覚醒専用: 盤面（マス）にある表向きのカードを全て捨てる
  DISCARD_SELF: "discard_self", // このカード自身を捨てる（既定動作「手札に加える」の代わり）
  ALL_PLAYERS_DISCARD_HAND_AND_DRAW: "all_players_discard_hand_and_draw", // 色落ちキャット専用: 全員が手札を全て捨ててから指定枚数ドローする
};

// 効果の主語（誰が対象か）。
export const TARGETS = {
  SELF: "self",
  ALL_OPPONENTS: "all_opponents",
  ALL_PLAYERS: "all_players", // なないろの巨光専用: 自分を含む参加者全員
};

// カードを置くマスの選び方。「choose」はプレイヤーが実際にマスを選ぶ（UIでの対象選択が
// 必要）、「sameAs」は同じ効果内の別のアクションで選んだマスをそのまま指す
// （収穫と種まきの「拾ったマスに置き直す」を表現するために必要になった）。
export const TARGET_SELECTIONS = {
  CHOOSE: "choose",
  SAME_AS: "same_as",
  // 増殖する樹々専用: プレイヤーが選ぶのではなく、範囲内の該当マス全てが自動的に対象になる
  // （destination.withinCellsと組み合わせて使う）。
  ALL_WITHIN_RANGE: "all_within_range",
  // 黒の契約の烙印専用: 自分のロックエリアの空いているスロット（通常のロックと違い色を
  // 問わない）から選ぶ。
  OWN_EMPTY_LOCK_SLOTS: "own_empty_lock_slots",
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
  // 手札効果: 「これをゲート以外の任意のマスに表向きで置く。」
  "red-jump-pad": {
    arrival: {
      // 既定動作（効果処理後にこのカード自身を手札に加える）を明示的に上書きする。
      addsCardToHandAfter: false,
      // soundはgenerateEffectText（テキスト生成）には一切影響しない、実行時にだけ
      // 見るヒント（card-effect-engine.jsのVERBS.MOVE参照）。ユーザー要望
      // 「ジャンプ台で移動するときに専用の効果音を使ってください」。
      actions: [{ verb: VERBS.MOVE, count: 2, atOnce: true, sound: "jump" }],
    },
    handEffect: {
      // このカード自身が「置かれる」対象になるため、通常の手札効果のデフォルト
      // 「効果発動時にこのカードを捨てる」の対象外にする（なないろの欠片の
      // 「２枚をロックする」選択肢と同じ考え方）。
      keepsCardOnUse: true,
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          source: "self",
          faceUp: true,
          destination: { selection: TARGET_SELECTIONS.CHOOSE, excludeGates: true },
        },
      ],
    },
  },

  // カウンターロック（赤、通常カード） 到達効果: 「１番少なくロックしているなら
  // 1枚ドロー。」（補足: 「１番少なくロックしている」＝ロックしている枚数が
  // 参加者の中で１番少ないこと。同率首位も対象に含む一般的な解釈）。
  // 手札効果（「あなたへの接触の宣言時に使える。その接触を無効にする。」）は、
  // 接触の承認/拒否フロー自体への割り込みが必要な別種の実装のため今回は対象外。
  "red-counter-lock": {
    arrival: {
      actions: [{ verb: VERBS.DRAW_IF_FEWEST_LOCKED }],
    },
  },

  // プレゼント（桃、通常カード） 到達効果: 「１番少なくロックしている全員は、
  // １枚ドロー。」カウンターロックと違い、効果の使用者だけでなく「該当する
  // 全員」がそれぞれドローする（DRAW_ALL_FEWEST_LOCKED）。
  // 手札効果（「これを相手の隣に裏向きで置く。1枚ドロー。」）は「相手を選ぶ→隣接する
  // 空きマスを選ぶ」という新しい対象選択の組み合わせが必要なため今回は対象外。
  "pink-present": {
    arrival: {
      actions: [{ verb: VERBS.DRAW_ALL_FEWEST_LOCKED }],
    },
  },

  // 白の意思の覚醒（白、通常カード） 到達効果: 「場の全ての表向きのカードを
  // 捨てる。」（補足: カードの下にある表向きのカードは対象外＝１番上の原則、
  // つまり元々「場」＝盤面マスの一番上のカードしか意味を持たないため、対象は
  // 単純に「盤面マスにある表向きカード全部」でよい）。
  "white-awakening": {
    arrival: {
      actions: [{ verb: VERBS.DISCARD_ALL_FACEUP_ON_BOARD }],
    },
  },

  // 増殖する樹々（緑、通常カード） 到達効果: 「２マス以内の何もない全てのマスに
  // 山札からカードを１枚ずつ裏向きで置く。」プレイヤーが選ぶのではなく、範囲内の
  // 該当マス全てが自動的に対象になる（destination.selection: ALL_WITHIN_RANGE）。
  "green-growing-trees": {
    arrival: {
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          source: "deck",
          faceUp: false,
          destination: { selection: TARGET_SELECTIONS.ALL_WITHIN_RANGE, withinCells: 2 },
        },
      ],
    },
  },

  // なないろの巨光（白、通常カード） 到達効果: 「全員、3枚ドロー。このカードを
  // 捨てる。」既定動作（処理後に手札へ加える）を上書きし、代わりに捨てる
  // （DISCARD_SELF）。
  "white-radiance": {
    arrival: {
      addsCardToHandAfter: false,
      actions: [
        { verb: VERBS.DRAW, count: 3, target: TARGETS.ALL_PLAYERS },
        { verb: VERBS.DISCARD_SELF },
      ],
    },
  },

  // 色落ちキャット（黒、通常カード） 到達効果: 「これを捨てる。全員、手札を全て
  // 捨て、１枚ドロー。」なないろの巨光と同じ「捨てる」だが実際の文言が
  // 「これを」なのでselfLabelで上書きする。
  "black-faded-cat": {
    arrival: {
      addsCardToHandAfter: false,
      actions: [
        { verb: VERBS.DISCARD_SELF, selfLabel: "これ" },
        { verb: VERBS.ALL_PLAYERS_DISCARD_HAND_AND_DRAW, count: 1 },
      ],
    },
  },

  // 黒の契約の烙印（黒、通常カード） 到達効果: 「あなたの空いているロックエリアに、
  // これを表向きで置く。」（補足: 「置く」であって「ロックした」扱いにはならない
  // ため、通常のロックの色制限は関係なく空いていればどの色のスロットでもよい）。
  // ★（あなたのロックフェイズにロックしないなら〜）・■（これを任意のマスに裏向きで
  // 置く）は基本効果・手札効果の話で、いずれも今回のスコープ外。
  "black-contract-brand": {
    arrival: {
      addsCardToHandAfter: false,
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          source: "self",
          faceUp: true,
          destination: { selection: TARGET_SELECTIONS.OWN_EMPTY_LOCK_SLOTS },
        },
      ],
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

  // 手品師の技 -スリカエ-（黄、通常カード）
  // 到達効果: 「相手１人の手札から無作為に１枚、あなたの手札に加える。あなたの手札から
  // １枚、その相手の手札に加える。」
  // 手札効果: 「この効果はいつでも使える。上記の到達時の効果を得る。」——コスト無し。
  // ユーザー確認済み「『いつでも使える』はゲート侵攻処理を含む効果の処理中以外は
  // いつでも使えるという意味」。usableAnytime:trueを見て、main.js側がハンドフェイズ
  // 以外でもドラッグでの発動を許可し、ゲート侵攻処理中にドラッグされた場合だけ
  // 予約扱いにして処理が終わった後で確認モーダルを出す（card-effect-engine.jsの
  // 実行ロジック自体は他の手札効果と同じrunHandEffectOptionを共有する）。
  "yellow-sleight-of-hand": {
    arrival: {
      actions: [{ verb: VERBS.SWAP_RANDOM_HAND_CARD }],
    },
    handEffect: {
      usableAnytime: true,
      actions: [{ verb: VERBS.SWAP_RANDOM_HAND_CARD }],
    },
  },

  // 6. なないろの欠片（虹、通常カード） 手札効果: 「以下の効果のうち１つ得る。
  // ・１枚ドロー。・これを含めた「なないろの欠片」が２枚、あなたの手札にある時に
  // 使える。その２枚を任意の１箇所にロックする。２枚ドロー。」
  // ユーザー要望「手札効果は２つあります。効果選択モーダルを出してください。
  // 使用できない方はグレー表示。」への対応で、両方の選択肢をDSL化した
  // （handEffectOptions、複数選択肢を持つ手札効果の最初の例）。
  "rainbow-shard": {
    // 到達効果: 「到達効果はない。」（docs/cards.md）。actions:[]にすることで
    // runArrivalEffect()自体は動く（＝自己申告モーダルを出さず自動処理される）が
    // 何も実行せず、既定動作（このカード自身を手札に加える）だけが起きる。
    arrival: { actions: [] },
    handEffectOptions: [
      { id: "draw", label: "１枚ドロー", actions: [{ verb: VERBS.DRAW, count: 1, target: TARGETS.SELF }] },
      {
        id: "lock-pair",
        label: "２枚をロックする（２枚ドロー）",
        // これを含めた「なないろの欠片」が2枚、手札にある時だけ選べる。
        requiresPairInHand: true,
        // このカード自身が「ロックされる2枚」の1枚になるため、通常の手札効果の
        // デフォルト「効果発動時にこのカードを捨てる」の対象外にする
        // （docs/cards.md: 効果発動時の処遇は選択肢ごとに違う）。
        keepsCardOnUse: true,
        actions: [{ verb: VERBS.LOCK_PAIR }, { verb: VERBS.DRAW, count: 2, target: TARGETS.SELF }],
      },
    ],
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
  // なないろの巨光専用: docs/cards.mdの実際の文言は「全員は」ではなく「全員、」
  // （読点区切り）になっている。ALL_OPPONENTSとは別の言い回しのため区別する。
  if (target === TARGETS.ALL_PLAYERS) return "全員、";
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
      const faceLabel = action.faceUp ? "表向きで" : "裏向きで";
      // source: "self"（ジャンプ台の手札効果等）: 「手札から／山札から○枚」ではなく
      // 「これを」で始まる、このカード自身を指す専用の文型になる。
      if (action.source === "self") {
        // 黒の契約の烙印専用: 実際の文言は「これを」始まりではなく「あなたの空いている
        // ロックエリアに、これを〜置く」という置き場所（ロックエリア）が先に来る語順。
        if (action.destination?.selection === TARGET_SELECTIONS.OWN_EMPTY_LOCK_SLOTS) {
          return `あなたの空いているロックエリアに、これを${faceLabel}置く。`;
        }
        const destLabel = action.destination?.excludeGates ? "ゲート以外の任意のマスに" : "任意のマスに";
        return `これを${destLabel}${faceLabel}置く。`;
      }
      const sourceLabel = action.source === "hand" ? "手札から" : "山札から";
      // 増殖する樹々専用: 範囲内の「何もないマス」全てが自動的に対象になる（プレイヤーが
      // 選ぶ必要が無い）ため、他の選択式（choose/same_as）とは別の専用の文型になる。
      if (action.destination?.selection === TARGET_SELECTIONS.ALL_WITHIN_RANGE) {
        // 「１枚ずつ」は該当マス1つあたりの枚数を指す固定値で、action.count（無指定＝
        // undefined）とは無関係のため、上のcount変数は使わずここだけ決め打ちにする。
        const rangeLabel = action.destination.withinCells ? `${toFullWidthNumber(action.destination.withinCells)}マス以内の` : "";
        return `${rangeLabel}何もない全てのマスに${sourceLabel}カードを１枚ずつ${faceLabel}置く。`;
      }
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
      // ユーザー指摘: 生成文に「相手はこのカードの到達効果を得ない。」が欠けていた。
      // 入れ替えの結果、相手はこのカード（マスチェンジ）がまだ置かれたままの
      // マス（=このカードの使用者が元いたマス）へ移動することになるが、そこで
      // 到達判定を発生させると、相手がまた同じマスチェンジに到達→また入れ替え…と
      // 無限ループしてしまう。それを防ぐため到達判定を連鎖させない
      // （card-effect-engine.jsのVERBS.SWAP_POSITIONがctx.arrivedAtをセットしない）
      // という実装は元々あったが、その挙動を説明する一文がテキスト側に無かった。
      return `${count}マス以内の相手のいる場所とあなたのいる場所を入れ替える。相手はこのカードの到達効果を得ない。`;
    case VERBS.LOCK_PAIR:
      return "その２枚を任意の１箇所にロックする。";
    case VERBS.DRAW_IF_FEWEST_LOCKED:
      return "１番少なくロックしているなら1枚ドロー。";
    case VERBS.SWAP_RANDOM_HAND_CARD:
      return "相手１人の手札から無作為に１枚、あなたの手札に加える。あなたの手札から１枚、その相手の手札に加える。";
    case VERBS.DRAW_ALL_FEWEST_LOCKED:
      return "１番少なくロックしている全員は、１枚ドロー。";
    case VERBS.DISCARD_ALL_FACEUP_ON_BOARD:
      return "場の全ての表向きのカードを捨てる。";
    case VERBS.DISCARD_SELF:
      // なないろの巨光は「このカードを捨てる。」、色落ちキャットは「これを捨てる。」と
      // 実際の文言が違う（docs/cards.mdの表記ゆれ）ため、action.selfLabelで選べるように
      // した（既定は「このカード」）。
      return `${action.selfLabel ?? "このカード"}を捨てる。`;
    case VERBS.ALL_PLAYERS_DISCARD_HAND_AND_DRAW:
      return `全員、手札を全て捨て、${count}枚ドロー。`;
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
  // 上書きしている場合だけ、その旨を明示する一文を先頭に足す（ジャンプ台等）。ただし
  // DISCARD_SELFやPLACE_CARD(source:"self")のように、アクション自体が既にこのカードの
  // 行方を明示している場合は、docs/cards.md側にも「これは手札に加えない」の一文が
  // 存在しない（なないろの巨光・色落ちキャット・黒の契約の烙印で確認済み）ため、
  // 冗長な一文を足さない。
  const actionsHandleSelf = effectDef.actions?.some(
    (a) => a.verb === VERBS.DISCARD_SELF || (a.verb === VERBS.PLACE_CARD && a.source === "self")
  );
  if (effectDef.addsCardToHandAfter === false && !actionsHandleSelf) parts.push("これはあなたの手札に加えない。");
  const costText = renderCost(effectDef.cost);
  if (costText) parts.push(costText);
  for (const action of effectDef.actions) {
    parts.push(renderAction(action, context));
  }
  const limitText = renderUsageLimit(effectDef.usageLimit);
  if (limitText) parts.push(limitText);
  return parts.join("");
}

// handEffectOptions（複数選択肢を持つ手札効果、なないろの欠片等）専用。各選択肢を
// 「以下の効果のうち１つ得る。」の書式でまとめてテキスト化する（card-dev-mode.jsの
// 生成/実際テキスト比較用）。
//
// ユーザー指摘「生成文の『その』が文脈的に何を指すかわからない」への対応。
// requiresPairInHand（このカードを含めて同名2枚が手札に揃っている時だけ選べる、
// なないろの欠片の「２枚をロックする」選択肢用の特殊条件）は、選択肢が「使えるか
// どうか」の判定（card-effect-engine.jsのisHandEffectOptionUsable）にしか使われて
// おらず、generateEffectText側にはこの条件を文章化する仕組みが無かった。そのため
// 生成文はいきなり「その２枚を〜」から始まってしまい、「その」の指す相手（＝この
// カードを含めた同名2枚）がdocs/cards.mdの実際の文章と違って説明されないまま
// 欠けていた。requiresPairInHandを持つ選択肢には、cardNameを使って
// 「これを含めた「カード名」が２枚、あなたの手札にある時に使える。」という一文を
// 先頭に補うようにした（docs/cards.mdの実際の文言と同じ形）。
export function generateHandEffectOptionsText(options, cardName) {
  if (!options?.length) return "";
  const lines = options.map((opt) => {
    const prefix = opt.requiresPairInHand && cardName ? `これを含めた「${cardName}」が２枚、あなたの手札にある時に使える。` : "";
    return `・${prefix}${generateEffectText(opt)}`;
  });
  return `以下の効果のうち１つ得る。${lines.join("")}`;
}

// --- 動作確認用（このファイル単体で実行し、docs/cards.mdの実際の文章と目視比較する） ---
// 例: `node src/card-effects.js` で実行できる。ゲーム本体からは呼ばれない、
// スキーマ検証だけが目的の使い捨てチェック。
if (typeof process !== "undefined" && process.argv[1] && process.argv[1].endsWith("card-effects.js")) {
  console.log("生成テキスト vs docs/cards.mdの実際の文章（比較用）:\n");
  console.log("[ゴメンナサイッ！到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["purple-sorry"].arrival));
  console.log("  実際: １マス移動する。\n");

  console.log("[手品師の技 -スリカエ- 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["yellow-sleight-of-hand"].arrival));
  console.log("  実際: 相手１人の手札から無作為に１枚、あなたの手札に加える。あなたの手札から１枚、その相手の手札に加える。\n");

  console.log("[プレゼント 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["pink-present"].arrival));
  console.log("  実際: １番少なくロックしている全員は、１枚ドロー。\n");

  console.log("[白の意思の覚醒 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["white-awakening"].arrival));
  console.log("  実際: 場の全ての表向きのカードを捨てる。\n");

  console.log("[増殖する樹々 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["green-growing-trees"].arrival));
  console.log("  実際: ２マス以内の何もない全てのマスに山札からカードを１枚ずつ裏向きで置く。\n");

  console.log("[奇跡の森 マンズウッド 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-green"].handEffect));
  console.log("  実際: 【追色１】１枚ドロー。\n");

  console.log("[ジャンプ台 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["red-jump-pad"].arrival));
  console.log("  実際: これはあなたの手札に加えない。２マス先に一気に移動する。\n");

  console.log("[ジャンプ台 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["red-jump-pad"].handEffect));
  console.log("  実際: これをゲート以外の任意のマスに表向きで置く。\n");

  console.log("[カウンターロック 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["red-counter-lock"].arrival));
  console.log("  実際: １番少なくロックしているなら1枚ドロー。\n");

  console.log("[収穫と種まき 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["orange-harvest-sow"].arrival));
  console.log("  実際: 任意の１マスの１枚をあなたの手札に加える。手札から１枚をそのマスに裏向きで置く。\n");

  console.log("[黄金の宮殿 ドムス・ネロ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-yellow"].handEffect));
  console.log("  実際: 【追色１】２枚ドロー。相手全員は１枚ドロー。この効果は１ターンに１度のみ得られる。\n");

  console.log("[なないろの欠片 手札効果]");
  console.log("  生成: " + generateHandEffectOptionsText(CARD_EFFECTS["rainbow-shard"].handEffectOptions, "なないろの欠片"));
  console.log(
    "  実際: 以下の効果のうち１つ得る。・１枚ドロー。・これを含めた「なないろの欠片」が２枚、あなたの手札にある時に使える。その２枚を任意の１箇所にロックする。２枚ドロー。\n"
  );

  console.log("[マスチェンジ 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["orange-mass-change"].arrival));
  console.log("  実際: ３マス以内の相手のいる場所とあなたのいる場所を入れ替える。相手はこのカードの到達効果を得ない。\n");

  console.log("[なないろの巨光 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["white-radiance"].arrival));
  console.log("  実際: 全員、3枚ドロー。このカードを捨てる。\n");

  console.log("[色落ちキャット 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["black-faded-cat"].arrival));
  console.log("  実際: これを捨てる。全員、手札を全て捨て、１枚ドロー。\n");

  console.log("[黒の契約の烙印 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["black-contract-brand"].arrival));
  console.log("  実際: あなたの空いているロックエリアに、これを表向きで置く。\n");
}
