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
  DISCARD_HALF_HAND: "discard_half_hand", // 選べる罠専用: 自分の手札を半分（端数切り捨て）、自分で選んで捨てる
  FORCED_MOVE_TO_OWN_GATE: "forced_move_to_own_gate", // 選べる罠専用: 自分のゲートへ強制移動する（「移動」なので到達判定は連鎖する）
  DISCARD_ONE_LOCKED_CARD: "discard_one_locked_card", // 選べる罠専用: 自分のロックしているカードから1枚選んで捨てる
  DECLARE_COLORS: "declare_colors", // ザ・ギャンブル/試練の儀式専用: 色を宣言する（宣言数は固定/以上のどちらかをaction側で指定）
  PUBLIC_DRAW_MATCHING_DECLARED_COLOR_COUNT: "public_draw_matching_declared_color_count", // ザ・ギャンブル専用: 直前に宣言した色の種類数分、公開ドローする
  DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED: "discard_hand_if_revealed_matches_declared", // ザ・ギャンブル専用: 公開したカードの中に宣言色があれば手札を全て捨てる
  RITUAL_PLACE_MOVE_REPEAT: "ritual_place_move_repeat", // 試練の儀式専用: 隣に山札から1枚表向きで置く→そこへ移動（到達効果無し）→宣言色なら繰り返す
  ALL_PLAYERS_PLACE_TWO_CARDS_IN_EMPTY_CELLS: "all_players_place_two_cards_in_empty_cells", // 合同建設専用: 全員がそれぞれ、何もない2マスに山札または手札から1枚ずつ裏向きで置く
  ALL_PLAYERS_DISCARD_TO_THREE: "all_players_discard_to_three", // スラム上がりの役人専用: 全員がそれぞれ、手札が3枚になるまで自分で選んで捨てる
  ALL_PLAYERS_CHOOSE_PARTY_OPTION: "all_players_choose_party_option", // パーティー専用: 全員がそれぞれ、3つの選択肢から1つ選んで得る
  END_CURRENT_PHASE: "end_current_phase", // なないろの巨光・スラム上がりの役人・ザ・ギャンブル専用: 現在のフェイズを強制的に終了する
  PLACE_SELF_ADJACENT_TO_CHOSEN_OPPONENT: "place_self_adjacent_to_chosen_opponent", // プレゼント専用: 相手を選び、その隣に自分自身を裏向きで置く
  PLACE_DECK_CARD_ON_ALL_FACEUP_CELLS: "place_deck_card_on_all_faceup_cells", // 白の意思の覚醒専用: 場の全ての表向きのカードの上に山札から1枚ずつ裏向きで置く
  DISCARD_OWN_HAND: "discard_own_hand", // 色落ちキャット専用: 自分の手札を全て捨てる（全員対象のALL_PLAYERS_DISCARD_HAND_AND_DRAWと違い自分だけ）
  DISCARD_ONE_HAND_CARD: "discard_one_hand_card", // ザ・ギャンブル専用: 手札から1枚を選んで捨てる（追色コストと違い色の制約は無い）
  DRAW_IF_HAND_AT_MOST: "draw_if_hand_at_most", // スラム上がりの役人専用: 自分の手札が指定枚数以下ならドローする
  // ザ・ギャンブルの手札効果専用: 「上記の到達時の効果を得る」の前後に別のアクション
  // （手札を1枚捨てる・このフェイズを終了する）が挟まるカード用。既存のeffectDef単位の
  // inheritsArrivalフラグ（マスチェンジ・手品師の技・試練の儀式・合同建設の手札効果、
  // どれも「上記の到達時の効果を得る」だけで完結する）とは別に、actions配列の中の
  // 1アクションとして「到達効果のactionsをそのまま呼ぶ」を表現できるようにした。
  INHERIT_ARRIVAL_ACTIONS: "inherit_arrival_actions",
  // ここから続き43（ファースト/エターナルカードの手札効果を4枚追加）で新設した動詞。
  PICKUP_DISCARD_SECOND_FROM_TOP: "pickup_discard_second_from_top", // 赤のキューブ フェニックス専用: 捨て場の上から2番目のカードを手札に加える
  FLIP_UP_TO_N_WITHIN_RANGE: "flip_up_to_n_within_range", // 黄のキューブ サフラン専用: Nマス以内の裏向きカードを、M枚まで（してもよい）オープンする
  DISCARD_RANDOM_FROM_QUALIFYING_OPPONENTS: "discard_random_from_qualifying_opponents", // 青のキューブ セレスティア専用: 手札が指定枚数以上ある相手全員から無作為に1枚ずつ捨てる
  DISCARD_ALL_AT_CHOSEN_CELL: "discard_all_at_chosen_cell", // 紅蓮の火山 ワイナウエア専用: 任意の1マスのカードを全て捨てる
  // 続き44で新設。
  PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END: "public_draw_then_discard_at_turn_end", // 奇跡の森 マンズウッド専用: N枚公開ドローし、ターン終了時にそれらを捨てる
  MOVE_CHOSEN_OPPONENT_ADJACENT_TO_SELF: "move_chosen_opponent_adjacent_to_self", // 結ばれの一本桜 コノハナサクヤ専用: 相手を選び、その駒をあなたの隣へ移動させる（「移動」扱い）
  PUBLIC_DRAW_DISABLE_HAND_EFFECTS_CONDITIONAL_DISCARD: "public_draw_disable_hand_effects_conditional_discard", // 禁断の果実 マルメゴ専用: N枚公開ドロー、それらの手札効果は今ターン使用不可、橙が混ざっていたら手札全捨て＋今ターン移動不可
  ANNOUNCE_MOVEMENT_BOOST_THIS_TURN: "announce_movement_boost_this_turn", // 紫のキューブ ディメンション専用: このターンの通常の移動が2マス一気になる（このアプリは元々移動先を制限しないため、実際には案内のみ）
  // 続き45（ユーザーがdocs/cards.mdの空欄だった効果文を補完）で新設。
  LOCK_ONE_HAND_CARD_EXCEPT_FINAL: "lock_one_hand_card_except_final", // 桃のキューブ セレナーデ専用: 手札を1枚選んでロックする（通常の色一致ルール、ただし7色目＝勝利になるロックは対象外）
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
    // 手札効果: 「これを相手の隣に裏向きで置く。1枚ドロー。」相手を選び、その隣接
    // マスへこのカード自身を置く（このカード自身が「置かれる」対象になるため
    // keepsCardOnUse）。
    handEffect: {
      keepsCardOnUse: true,
      actions: [
        { verb: VERBS.PLACE_SELF_ADJACENT_TO_CHOSEN_OPPONENT },
        { verb: VERBS.DRAW, count: 1, target: TARGETS.SELF },
      ],
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
    // 手札効果: 「場の全ての表向きのカードの上に山札から１枚ずつ裏向きで置く。」
    handEffect: {
      actions: [{ verb: VERBS.PLACE_DECK_CARD_ON_ALL_FACEUP_CELLS }],
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
    // 手札効果: 「任意の3マスに山札からカードを裏向きで1枚ずつ置く。」既存のPLACE_CARD
    // （source:"deck"・CHOOSE・count:3）をそのまま使う。生成文「任意の３マスに山札から
    // １枚ずつ裏向きで置く。」は「カードを」の有無・語順・数字の全角半角がdocs/cards.md
    // と少し違うが、収穫と種まき等と同じ理由（ユーザー判断で生成文の語順統一を優先、
    // 続き25参照）で意図的に許容する。
    handEffect: {
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          count: 3,
          source: "deck",
          faceUp: false,
          destination: { selection: TARGET_SELECTIONS.CHOOSE },
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
    // 手札効果: 「全員、３枚ドロー。このフェイズを終了する。」到達効果と違い自分自身は
    // 捨てない（手札効果の既定「使用時にこのカードを捨てる」がそのまま適用される）。
    handEffect: {
      actions: [
        { verb: VERBS.DRAW, count: 3, target: TARGETS.ALL_PLAYERS },
        { verb: VERBS.END_CURRENT_PHASE },
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
    // 手札効果: 「あなたの手札をすべて捨てる。１枚ドロー。」到達効果と違い自分だけが
    // 対象（DISCARD_OWN_HAND、ALL_PLAYERS版と違い他プレイヤーへの委任は不要）。
    handEffect: {
      actions: [
        { verb: VERBS.DISCARD_OWN_HAND },
        { verb: VERBS.DRAW, count: 1, target: TARGETS.SELF },
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
    // 手札効果: 「これを任意のマスに裏向きで置く。」ジャンプ台の手札効果と同じ
    // PLACE_CARD(source:"self")パターン（ゲート除外は無い・裏向き指定のみ違う）。
    // このカード自身が「置かれる」対象になるため、既定の「使用時にこのカードを
    // 捨てる」の対象外にする（keepsCardOnUse）。
    handEffect: {
      keepsCardOnUse: true,
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          source: "self",
          faceUp: false,
          destination: { selection: TARGET_SELECTIONS.CHOOSE },
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
      // inheritsArrival: 到達効果と全く同じactionsを実行するが、生成テキストは
      // 「上記の到達時の効果を得る。」になる（docs/cards.md「■ この効果はいつでも
      // 使える。上記の到達時の効果を得る。」）。
      inheritsArrival: true,
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
      // inheritsArrival: 実際の実行はarrivalと同じactionsをそのまま使うが、
      // 生成テキストは「上記の到達時の効果を得る。」という参照文になる
      // （docs/cards.md、renderAction()参照）。
      inheritsArrival: true,
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

  // 赤のキューブ フェニックス（赤、ファーストカード） 手札効果:
  // 「【追色１】捨て場の１番上から２番目のカードをあなたの手札に加える。」
  "first-red": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.PICKUP_DISCARD_SECOND_FROM_TOP }],
    },
  },

  // 黄のキューブ サフラン（黄、ファーストカード） 手札効果:
  // 「【追色１】２マス以内のカードを４枚までオープンしてもよい。」
  "first-yellow": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.FLIP_UP_TO_N_WITHIN_RANGE, withinCells: 2, maxCount: 4 }],
    },
  },

  // 青のキューブ セレスティア（青、ファーストカード） 手札効果:
  // 「【追色１】手札が２枚以上ある相手全員の手札から、無作為に１枚ずつ選び、
  // それらを捨てる。」
  "first-blue": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.DISCARD_RANDOM_FROM_QUALIFYING_OPPONENTS, minHandSize: 2 }],
    },
  },

  // 紅蓮の火山 ワイナウエア（赤、エターナルカード） 手札効果:
  // 「《紅色の雨》：【追色１】任意の１マスのカードをすべて捨てる。」
  "eternal-red": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.DISCARD_ALL_AT_CHOSEN_CELL }],
    },
  },

  // 奇跡の森 マンズウッド（緑、ファーストカード） 手札効果:
  // 「【追色１】２枚ドローして、それらをすべて公開する。ターン終了時、それらを
  // 捨てる。この効果は１ターンに１度のみ得られる。」
  "first-green": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      usageLimit: { per: "turn", count: 1 },
      actions: [{ verb: VERBS.PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END, count: 2 }],
    },
  },

  // 結ばれの一本桜 コノハナサクヤ（桃、エターナルカード） 手札効果:
  // 「《恋の訪れ》：【追色１】相手をあなたの周囲へ移動する。このターンあなたは
  // 接触できない。」
  "eternal-pink": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.MOVE_CHOSEN_OPPONENT_ADJACENT_TO_SELF }],
    },
  },

  // 禁断の果実 マルメゴ（橙、エターナルカード） 手札効果:
  // 「《果実の提案》：【追色１】４枚ドロー。それらを公開する。それらの手札効果は
  // このターン使うことができない。その中に橙のカードがあったなら、あなたの手札を
  // すべて捨て、あなたはこのターン移動できない。」
  "eternal-orange": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.PUBLIC_DRAW_DISABLE_HAND_EFFECTS_CONDITIONAL_DISCARD, count: 4 }],
    },
  },

  // 紫のキューブ ディメンション（紫、ファーストカード） 手札効果:
  // 「【追色１】このターンの通常の移動は２マス先に一気に移動する。」続き44時点では
  // docs/cards.mdに追色コストの記載が無く、コスト無しとして実装していたが、ユーザーが
  // docs/cards.mdを追色コストありに修正（2026-07-27）。このアプリはそもそもムーブ
  // フェイズの移動先を制限していない（Phase 1方針「ルール適用は一切しない」、ドラッグで
  // 盤面のどこへでも置ける）ため、実際に「２マス先まで動けるようにする」ための制限
  // 緩和処理は元から不要——この手札効果は自己申告の案内として扱う（コストの支払い
  // 自体は他のファーストカードと同じ通常の追色フローで行われる）。
  "first-purple": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      actions: [{ verb: VERBS.ANNOUNCE_MOVEMENT_BOOST_THIS_TURN }],
    },
  },

  // 桃のキューブ セレナーデ（桃、ファーストカード） 手札効果:
  // 「【追色１】あなたの手札を１枚ロックする、ただし最後のロックはできない。
  // この効果は１ターンに１度のみ得られる。」（ユーザーがdocs/cards.mdの空欄
  // だった効果文を補完、2026-07-27）
  "first-pink": {
    handEffect: {
      cost: { verb: VERBS.DISCARD_SAME_COLOR, count: 1 },
      usageLimit: { per: "turn", count: 1 },
      actions: [{ verb: VERBS.LOCK_ONE_HAND_CARD_EXCEPT_FINAL }],
    },
  },

  // 選べる罠（青、通常カード） 到達効果: 「以下の効果のうち1つ得る。・あなたの手札を
  // 半分捨てる。・あなたのゲートに強制移動する。・あなたのロックしているカードを1枚
  // 捨てる。」なないろの欠片のhandEffectOptionsと同じ「複数選択肢から1つ」の考え方だが、
  // こちらは手札効果ではなく到達効果自身の選択のため、専用の`arrivalOptions`という
  // 別のトップレベルキーで表現する（`arrival`とは排他、runArrivalEffect側で分岐する）。
  // 善処の原則（docs/cards.md補足）で各選択肢に条件があり、選べる選択肢が1つも無い
  // 場合は不発（続き26で実装したannounceFizzle経由でプレイヤーに伝わる）。
  "blue-choosable-trap": {
    arrivalOptions: [
      {
        id: "discard-half-hand",
        label: "あなたの手札を半分捨てる。",
        // 手札枚数が１枚以下のときは選べない（docs/cards.md補足）。
        requiresMinHandSize: 2,
        actions: [{ verb: VERBS.DISCARD_HALF_HAND }],
      },
      {
        id: "forced-move-to-own-gate",
        label: "あなたのゲートに強制移動する。",
        // 自分のゲートにいるときは選べない（docs/cards.md補足）。
        requiresNotAtOwnGate: true,
        actions: [{ verb: VERBS.FORCED_MOVE_TO_OWN_GATE }],
      },
      {
        id: "discard-one-locked-card",
        label: "あなたのロックしているカードを1枚捨てる。",
        // 捨てれるロックカードが無いときは選べない（docs/cards.md補足）。
        requiresHasLockedCard: true,
        actions: [{ verb: VERBS.DISCARD_ONE_LOCKED_CARD }],
      },
    ],
    // 手札効果: 「このカードを任意のマスに裏向きで置く。」黒の契約の烙印・パーティーと
    // 同じPLACE_CARD(source:"self")パターンだが、実際の文言が「これを」ではなく
    // 「このカードを」なのでselfLabelで上書きする。
    handEffect: {
      keepsCardOnUse: true,
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          source: "self",
          faceUp: false,
          selfLabel: "このカード",
          destination: { selection: TARGET_SELECTIONS.CHOOSE },
        },
      ],
    },
  },

  // ザ・ギャンブル（黄、通常カード） 到達効果: 「２色以上、色を宣言する。その色の種類の
  // 数分ドローし公開する。それらの中に宣言色があるなら、あなたの手札を全て捨てる。」
  // 「ドロー」＝「山札から手札に加える」ため、この効果でドローしたカードも「手札を
  // 全て捨てる」の対象（docs/cards.md補足）——実装上は、ドローを「公開ドロー」
  // （state.jsの既存publicDrawゾーン、手札シャッフル/ターン終了まで手札に合流しない
  // 表向き専用ゾーン）として行い、DISCARD_HAND_IF_REVEALED_MATCHES_DECLAREDが
  // 手札＋公開ドロー分の両方をまとめて対象にすることで、この補足を素直に満たす。
  "yellow-gamble": {
    arrival: {
      actions: [
        { verb: VERBS.DECLARE_COLORS, minCount: 2 },
        { verb: VERBS.PUBLIC_DRAW_MATCHING_DECLARED_COLOR_COUNT },
        { verb: VERBS.DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED },
      ],
    },
    // 手札効果: 「あなたは手札を１枚捨てる。上記の到達時の効果を得る。このフェイズを
    // 終了する。」到達効果と全く同じ処理をINHERIT_ARRIVAL_ACTIONSで挟み込む
    // （前後に「1枚捨てる」「フェイズ終了」が付くため、続き29のeffectDef単位の
    // inheritsArrivalフラグでは表現できず、アクション単位の新しい動詞にした）。
    handEffect: {
      actions: [
        { verb: VERBS.DISCARD_ONE_HAND_CARD },
        { verb: VERBS.INHERIT_ARRIVAL_ACTIONS },
        { verb: VERBS.END_CURRENT_PHASE },
      ],
    },
  },

  // 試練の儀式（紫、通常カード） 到達効果: 「色を３色宣言する。あなたの隣に山札から
  // １枚表向きで置く。そのマスに移動し、移動先の到達効果は得ない。置いたカードが
  // 宣言色ならこの効果を繰り返す。」置く→移動→判定→（該当すれば）繰り返す、という
  // 一連の流れ全体をRITUAL_PLACE_MOVE_REPEAT 1つの動詞にまとめている（各繰り返しの
  // 隣接マスをその都度選ばせる必要があり、PLACE_CARD等の既存動詞を機械的に組み合わせる
  // よりも専用動詞の方がシンプルなため）。
  "purple-trial-ritual": {
    arrival: {
      actions: [
        { verb: VERBS.DECLARE_COLORS, count: 3 },
        { verb: VERBS.RITUAL_PLACE_MOVE_REPEAT },
      ],
    },
    // 手札効果: 「上記の到達時の効果を得る。」到達効果と全く同じactionsを
    // そのまま実行する（inheritsArrival、続き29のマスチェンジ・手品師の技と
    // 同じパターン）。
    handEffect: {
      inheritsArrival: true,
      actions: [
        { verb: VERBS.DECLARE_COLORS, count: 3 },
        { verb: VERBS.RITUAL_PLACE_MOVE_REPEAT },
      ],
    },
  },

  // 合同建設（緑、通常カード） 到達効果: 「全員は何もない２マスに山札または手札から
  // １枚裏向きで置く。」処理順の原則（効果の使用者から時計回り）に沿い、各プレイヤーが
  // 自分自身の選択（マス・山札か手札か・手札ならどのカードか）を行う。他プレイヤーの
  // 選択は自分のクライアントでは表現できないため、main.js側のhelpers.delegateToPlayer
  // （オンライン中は対象プレイヤー本人の画面へ委任するbroadcast往復）に委ねる。
  "green-joint-construction": {
    arrival: {
      actions: [{ verb: VERBS.ALL_PLAYERS_PLACE_TWO_CARDS_IN_EMPTY_CELLS }],
    },
    // 手札効果: 「上記の到達時の効果を得る。」到達効果と同じ（inheritsArrival）。
    handEffect: {
      inheritsArrival: true,
      actions: [{ verb: VERBS.ALL_PLAYERS_PLACE_TWO_CARDS_IN_EMPTY_CELLS }],
    },
  },

  // スラム上がりの役人（青、通常カード） 到達効果: 「全員は手札が３枚になるように
  // 捨てる。」合同建設と同じdelegateToPlayerパターン。
  "blue-slum-official": {
    arrival: {
      actions: [{ verb: VERBS.ALL_PLAYERS_DISCARD_TO_THREE }],
    },
    // 手札効果: 「あなたの手札が１枚以下なら２枚ドロー。このフェイズを終了する。」
    // 手札効果は原則使用時に自分自身を先に捨てるため（docs/cards.md補足）、この
    // 「１枚以下」判定の時点でこのカード自身は既に手札から居ない。
    handEffect: {
      actions: [
        { verb: VERBS.DRAW_IF_HAND_AT_MOST, maxHandSize: 1, count: 2 },
        { verb: VERBS.END_CURRENT_PHASE },
      ],
    },
  },

  // パーティー（桃、通常カード） 到達効果: 「全員は以下の効果のうち１つ得る。
  // ・１マス移動し、移動先の到達効果は得ない。・場の任意の１枚をあなたの手札に加える。
  // ・場の任意の２枚をオープンする。」合同建設と同じdelegateToPlayerパターンだが、
  // 各プレイヤーが委任された先でさらに3択から1つ選ぶ（main.js側で選べる罠と同じ
  // showHandEffectOptionPickerを流用）。
  "pink-party": {
    arrival: {
      actions: [{ verb: VERBS.ALL_PLAYERS_CHOOSE_PARTY_OPTION }],
    },
    // 手札効果: 「これを任意のマスに裏向きで置く。」黒の契約の烙印の手札効果と
    // 全く同じPLACE_CARD(source:"self")パターン。
    handEffect: {
      keepsCardOnUse: true,
      actions: [
        {
          verb: VERBS.PLACE_CARD,
          source: "self",
          faceUp: false,
          destination: { selection: TARGET_SELECTIONS.CHOOSE },
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
    case VERBS.PICKUP_DISCARD_SECOND_FROM_TOP:
      return "捨て場の１番上から２番目のカードをあなたの手札に加える。";
    case VERBS.FLIP_UP_TO_N_WITHIN_RANGE:
      return `${toFullWidthNumber(action.withinCells)}マス以内のカードを${toFullWidthNumber(action.maxCount)}枚までオープンしてもよい。`;
    case VERBS.DISCARD_RANDOM_FROM_QUALIFYING_OPPONENTS:
      return `手札が${toFullWidthNumber(action.minHandSize)}枚以上ある相手全員の手札から、無作為に１枚ずつ選び、それらを捨てる。`;
    case VERBS.DISCARD_ALL_AT_CHOSEN_CELL:
      return "任意の１マスのカードをすべて捨てる。";
    case VERBS.PUBLIC_DRAW_THEN_DISCARD_AT_TURN_END:
      return `${count}枚ドローして、それらをすべて公開する。ターン終了時、それらを捨てる。`;
    case VERBS.MOVE_CHOSEN_OPPONENT_ADJACENT_TO_SELF:
      return "相手をあなたの周囲へ移動する。このターンあなたは接触できない。";
    case VERBS.PUBLIC_DRAW_DISABLE_HAND_EFFECTS_CONDITIONAL_DISCARD:
      return `${count}枚ドロー。それらを公開する。それらの手札効果はこのターン使うことができない。その中に橙のカードがあったなら、あなたの手札をすべて捨て、あなたはこのターン移動できない。`;
    case VERBS.ANNOUNCE_MOVEMENT_BOOST_THIS_TURN:
      return "このターンの通常の移動は２マス先に一気に移動する。";
    case VERBS.LOCK_ONE_HAND_CARD_EXCEPT_FINAL:
      return "あなたの手札を１枚ロックする、ただし最後のロックはできない。";
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
        // 選べる罠専用: 実際の文言が「これを」ではなく「このカードを」なので、
        // action.selfLabelで上書きできるようにした（既定は「これ」のまま、
        // 黒の契約の烙印・パーティー等の既存カードには影響しない）。
        return `${action.selfLabel ?? "これ"}を${destLabel}${faceLabel}置く。`;
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
    case VERBS.DISCARD_HALF_HAND:
      return "あなたの手札を半分捨てる。";
    case VERBS.FORCED_MOVE_TO_OWN_GATE:
      return "あなたのゲートに強制移動する。";
    case VERBS.DISCARD_ONE_LOCKED_CARD:
      return "あなたのロックしているカードを1枚捨てる。";
    case VERBS.DECLARE_COLORS:
      // ザ・ギャンブル（「以上」＝下限のみ指定、count自体はプレイヤーが選ぶ）と
      // 試練の儀式（固定数）とで実際の文言の語順が違う（docs/cards.md）ため、
      // action.minCount/countのどちらが指定されているかで文型を分ける。
      return action.minCount != null
        ? `${toFullWidthNumber(action.minCount)}色以上、色を宣言する。`
        : `色を${toFullWidthNumber(action.count)}色宣言する。`;
    case VERBS.PUBLIC_DRAW_MATCHING_DECLARED_COLOR_COUNT:
      return "その色の種類の数分ドローし公開する。";
    case VERBS.DISCARD_HAND_IF_REVEALED_MATCHES_DECLARED:
      return "それらの中に宣言色があるなら、あなたの手札を全て捨てる。";
    case VERBS.RITUAL_PLACE_MOVE_REPEAT:
      return "あなたの隣に山札から１枚表向きで置く。そのマスに移動し、移動先の到達効果は得ない。置いたカードが宣言色ならこの効果を繰り返す。";
    case VERBS.ALL_PLAYERS_PLACE_TWO_CARDS_IN_EMPTY_CELLS:
      return "全員は何もない２マスに山札または手札から１枚裏向きで置く。";
    case VERBS.ALL_PLAYERS_DISCARD_TO_THREE:
      return "全員は手札が３枚になるように捨てる。";
    case VERBS.ALL_PLAYERS_CHOOSE_PARTY_OPTION:
      return "全員は以下の効果のうち１つ得る。・１マス移動し、移動先の到達効果は得ない。・場の任意の１枚をあなたの手札に加える。・場の任意の２枚をオープンする。";
    case VERBS.END_CURRENT_PHASE:
      return "このフェイズを終了する。";
    case VERBS.PLACE_SELF_ADJACENT_TO_CHOSEN_OPPONENT:
      return "これを相手の隣に裏向きで置く。";
    case VERBS.PLACE_DECK_CARD_ON_ALL_FACEUP_CELLS:
      return "場の全ての表向きのカードの上に山札から１枚ずつ裏向きで置く。";
    case VERBS.DISCARD_OWN_HAND:
      return "あなたの手札をすべて捨てる。";
    case VERBS.DISCARD_ONE_HAND_CARD:
      return "あなたは手札を１枚捨てる。";
    case VERBS.DRAW_IF_HAND_AT_MOST:
      return `あなたの手札が${toFullWidthNumber(action.maxHandSize)}枚以下なら${count}枚ドロー。`;
    case VERBS.INHERIT_ARRIVAL_ACTIONS:
      return "上記の到達時の効果を得る。";
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
  // ユーザー要望「マスチェンジのように『上記の到達時の効果を得る』で生成文を整理
  // できないか。到達効果の文面を手札効果が踏襲している場合この文言を使用する
  // ように」。手品師の技の「この効果はいつでも使える。」も同じく、今まで
  // generateEffectTextが素通りしていたフラグだったため、あわせて文章化する。
  if (effectDef.usableAnytime) parts.push("この効果はいつでも使える。");
  const costText = renderCost(effectDef.cost);
  if (costText) parts.push(costText);
  // inheritsArrival: true（マスチェンジ・手品師の技の手札効果等）は、実際の
  // アクション配列（エンジン実行用にactionsは引き続き持つ）をテキスト化せず、
  // 代わりに「上記の到達時の効果を得る。」という参照文だけを出す
  // （docs/cards.mdの凡例通り、到達効果と全く同じ処理を手札効果からも呼べる
  // カードに共通の言い回し）。
  if (effectDef.inheritsArrival) {
    parts.push("上記の到達時の効果を得る。");
  } else {
    for (const action of effectDef.actions) {
      parts.push(renderAction(action, context));
    }
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

  console.log("[マスチェンジ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["orange-mass-change"].handEffect));
  console.log("  実際: 【追色1】上記の到達時の効果を得る。\n");

  console.log("[手品師の技 -スリカエ- 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["yellow-sleight-of-hand"].handEffect));
  console.log("  実際: この効果はいつでも使える。上記の到達時の効果を得る。\n");

  console.log("[なないろの巨光 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["white-radiance"].arrival));
  console.log("  実際: 全員、3枚ドロー。このカードを捨てる。\n");

  console.log("[色落ちキャット 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["black-faded-cat"].arrival));
  console.log("  実際: これを捨てる。全員、手札を全て捨て、１枚ドロー。\n");

  console.log("[選べる罠 到達効果]");
  console.log(
    "  生成: " + generateHandEffectOptionsText(CARD_EFFECTS["blue-choosable-trap"].arrivalOptions)
  );
  console.log(
    "  実際: 以下の効果のうち1つ得る。・あなたの手札を半分捨てる。・あなたのゲートに強制移動する。・あなたのロックしているカードを1枚捨てる。\n"
  );

  console.log("[ザ・ギャンブル 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["yellow-gamble"].arrival));
  console.log(
    "  実際: ２色以上、色を宣言する。その色の種類の数分ドローし公開する。それらの中に宣言色があるなら、あなたの手札を全て捨てる。\n"
  );

  console.log("[試練の儀式 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["purple-trial-ritual"].arrival));
  console.log(
    "  実際: 色を３色宣言する。あなたの隣に山札から１枚表向きで置く。そのマスに移動し、移動先の到達効果は得ない。置いたカードが宣言色ならこの効果を繰り返す。\n"
  );

  console.log("[試練の儀式 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["purple-trial-ritual"].handEffect));
  console.log("  実際: 上記の到達時の効果を得る。\n");

  console.log("[黒の契約の烙印 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["black-contract-brand"].arrival));
  console.log("  実際: あなたの空いているロックエリアに、これを表向きで置く。\n");

  console.log("[黒の契約の烙印 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["black-contract-brand"].handEffect));
  console.log("  実際: これを任意のマスに裏向きで置く。\n");

  console.log("[合同建設 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["green-joint-construction"].arrival));
  console.log("  実際: 全員は何もない２マスに山札または手札から１枚裏向きで置く。\n");

  console.log("[合同建設 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["green-joint-construction"].handEffect));
  console.log("  実際: 上記の到達時の効果を得る。\n");

  console.log("[スラム上がりの役人 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["blue-slum-official"].arrival));
  console.log("  実際: 全員は手札が３枚になるように捨てる。\n");

  console.log("[パーティー 到達効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["pink-party"].arrival));
  console.log(
    "  実際: 全員は以下の効果のうち１つ得る。・１マス移動し、移動先の到達効果は得ない。・場の任意の１枚をあなたの手札に加える。・場の任意の２枚をオープンする。\n"
  );

  console.log("[パーティー 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["pink-party"].handEffect));
  console.log("  実際: これを任意のマスに裏向きで置く。\n");

  console.log("[増殖する樹々 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["green-growing-trees"].handEffect));
  console.log("  実際: 任意の3マスに山札からカードを裏向きで1枚ずつ置く。\n");

  console.log("[選べる罠 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["blue-choosable-trap"].handEffect));
  console.log("  実際: このカードを任意のマスに裏向きで置く。\n");

  console.log("[色落ちキャット 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["black-faded-cat"].handEffect));
  console.log("  実際: あなたの手札をすべて捨てる。１枚ドロー。\n");

  console.log("[白の意思の覚醒 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["white-awakening"].handEffect));
  console.log("  実際: 場の全ての表向きのカードの上に山札から１枚ずつ裏向きで置く。\n");

  console.log("[プレゼント 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["pink-present"].handEffect));
  console.log("  実際: これを相手の隣に裏向きで置く。1枚ドロー。\n");

  console.log("[なないろの巨光 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["white-radiance"].handEffect));
  console.log("  実際: 全員、３枚ドロー。このフェイズを終了する。\n");

  console.log("[スラム上がりの役人 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["blue-slum-official"].handEffect));
  console.log("  実際: あなたの手札が１枚以下なら２枚ドロー。このフェイズを終了する。\n");

  console.log("[ザ・ギャンブル 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["yellow-gamble"].handEffect));
  console.log("  実際: あなたは手札を１枚捨てる。上記の到達時の効果を得る。このフェイズを終了する。\n");

  console.log("[赤のキューブ フェニックス 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["first-red"].handEffect));
  console.log("  実際: 【追色１】捨て場の１番上から２番目のカードをあなたの手札に加える。\n");

  console.log("[黄のキューブ サフラン 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["first-yellow"].handEffect));
  console.log("  実際: 【追色１】２マス以内のカードを４枚までオープンしてもよい。\n");

  console.log("[青のキューブ セレスティア 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["first-blue"].handEffect));
  console.log("  実際: 【追色１】手札が２枚以上ある相手全員の手札から、無作為に１枚ずつ選び、それらを捨てる。\n");

  console.log("[紅蓮の火山 ワイナウエア 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-red"].handEffect));
  console.log("  実際: 【追色１】任意の１マスのカードをすべて捨てる。\n");

  console.log("[奇跡の森 マンズウッド 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["first-green"].handEffect));
  console.log("  実際: 【追色１】２枚ドローして、それらをすべて公開する。ターン終了時、それらを捨てる。この効果は１ターンに１度のみ得られる。\n");

  console.log("[結ばれの一本桜 コノハナサクヤ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-pink"].handEffect));
  console.log("  実際: 【追色１】相手をあなたの周囲へ移動する。このターンあなたは接触できない。\n");

  console.log("[禁断の果実 マルメゴ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["eternal-orange"].handEffect));
  console.log(
    "  実際: 【追色１】４枚ドロー。それらを公開する。それらの手札効果はこのターン使うことができない。その中に橙のカードがあったなら、あなたの手札をすべて捨て、あなたはこのターン移動できない。\n"
  );

  console.log("[紫のキューブ ディメンション 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["first-purple"].handEffect));
  console.log("  実際: 【追色１】このターンの通常の移動は２マス先に一気に移動する。\n");

  console.log("[桃のキューブ セレナーデ 手札効果]");
  console.log("  生成: " + generateEffectText(CARD_EFFECTS["first-pink"].handEffect));
  console.log("  実際: 【追色１】あなたの手札を１枚ロックする、ただし最後のロックはできない。この効果は１ターンに１度のみ得られる。\n");
}
