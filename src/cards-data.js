// 実際のカードデータ（docs/cards.md, docs/rulebook.mdより）。
// 「カード効果・カードデータはコードに埋め込まず、外部データとして持つ」という方針(CLAUDE.md)
// に沿って、ゲームロジック(state.js)や描画(main.js)から分離したこのファイルにまとめる。
// 到達効果・手札効果本文はカード画像自体に描かれているため含めない。noteはdocs/cards.mdの
// 「補足:」欄（画像には印刷されていない、ルール解釈の補足説明）を転記したもので、
// 山札一覧（deck-viewer.js）の「補足」ボタンで表示する。

// 通常カード19種、合計112枚（赤橙黄緑青桃紫は各色2種×7枚=98枚、虹1種×7枚、
// 無色(白黒)4種で合計7枚：色落ちキャットのみ1枚、他3種は2枚ずつ）。
export const NORMAL_CARDS = [
  { id: "red-jump-pad", name: "ジャンプ台", color: "red", count: 7, note: "「一気に移動」なので１マス目のカードや相手の駒等の有無は関係ない。" },
  { id: "red-counter-lock", name: "カウンターロック", color: "red", count: 7, note: "到達効果補足: 「１番少なくロックしている」とは、ロックしている枚数が１番少ないことである。手札効果補足: なし。" },
  { id: "orange-mass-change", name: "マスチェンジ", color: "orange", count: 7, note: "「３マス以内」とは、仮に３マス移動する場合に移動できる範囲のことである。「いる場所を入れ替える」とは駒を入れ替えるということ。自身の扱う駒の色はそのまま変わらない。「移動」ではないため入れ替え先のカードはオープンしない。" },
  { id: "orange-harvest-sow", name: "収穫と種まき", color: "orange", count: 7, note: "特になし。" },
  { id: "yellow-sleight-of-hand", name: "手品師の技 -スリカエ-", color: "yellow", count: 7, note: "特になし。" },
  { id: "yellow-gamble", name: "ザ・ギャンブル", color: "yellow", count: 7, note: "「ドロー」とは「山札から手札に加える」ことなので、手札をすべて捨てる際、この効果でドローしたカードもすべて捨てる。到達効果処理後に効果カード自身を手札に加えるため、このカードは捨てなくてもよい。" },
  { id: "green-joint-construction", name: "合同建設", color: "green", count: 7, note: "「何もないマス」とはカードもなくプレイヤーもいないマスのことである。複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。" },
  { id: "green-growing-trees", name: "増殖する樹々", color: "green", count: 7, note: "「何もないマス」とはカードもなくプレイヤーもいないマスのことである。「２マス以内」とは、仮に２マス移動する場合に移動できる範囲のことを示す。自分のいるマスも対象である。手札効果補足: カードの置かれているマスへも置くことができる。" },
  { id: "blue-slum-official", name: "スラム上がりの役人", color: "blue", count: 7, note: "複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。手札効果補足: 効果発動時に「このカードを捨てる」ため、「あなたの手札が１枚以下なら」のカウントの際にこのカード自身は含まない。" },
  { id: "blue-choosable-trap", name: "選べる罠", color: "blue", count: 7, note: "手札枚数が１枚以下のときは「あなたの手札を半分捨てる」は選べない（善処の原則）。自分のゲートにいるときは「あなたのゲートに強制移動する」は選べない。捨てれるロックカードが無いときは「あなたのロックしているカードを1枚捨てる」は選べない。全て選べないときは効果は不発。手札効果補足: カードの置かれているマスへも置くことができる。" },
  { id: "pink-party", name: "パーティー", color: "pink", count: 7, note: "複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。移動先の「到達効果は発動しない」ので効果処理は行われておらず、そのカードは手札には加わらない。" },
  { id: "pink-present", name: "プレゼント", color: "pink", count: 7, note: "「１番少なくロックしている」とは、ロックしている枚数が１番少ないことである。手札効果補足: 「隣」とは前後左右のマスのことである。" },
  { id: "purple-trial-ritual", name: "試練の儀式", color: "purple", count: 7, note: "「隣」とは前後左右のマスのことである。移動先の「到達効果は発動しない」ので効果処理は行われておらず、そのカードは手札には加わらない。「この効果を繰り返す」ため、宣言色が出続ければ何マスでも移動できる。" },
  { id: "purple-sorry", name: "ゴメンナサイッ！", color: "purple", count: 7, note: "手札効果補足: 相手はこの効果の処理が終わった後で宣言していたカードをロックする。" },
  { id: "rainbow-shard", name: "なないろの欠片", color: "rainbow", count: 7, note: "手札効果のためハンドフェイズでロックする。ロック枚数の扱いは２枚である。内１枚が何らかの効果でなくなっても残りの１枚のロックは継続する。" },
  { id: "white-radiance", name: "なないろの巨光", color: "white", count: 2, note: "複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。「フェイズ」とは「ロックフェイズ」「ハンドフェイズ」「ムーブフェイズ」のことである。" },
  { id: "white-awakening", name: "白の意思の覚醒", color: "white", count: 2, note: "カードの下にある表向きのカードは対象ではない。（１番上の原則）" },
  { id: "black-faded-cat", name: "色落ちキャット", color: "black", count: 1, note: "複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。" },
  { id: "black-contract-brand", name: "黒の契約の烙印", color: "black", count: 2, note: "基本効果補足: ロックする際の捨てる２枚の手札の色は問わない。到達効果補足: 「置く」は「ロック」していることにはならない。" },
];

// エターナルカード7種、各色1種・1枚（相手ゲート侵攻ボーナスで獲得するボーナスカード）。
export const ETERNAL_CARDS = [
  { id: "eternal-red", name: "紅蓮の火山 ワイナウエア", color: "red", note: "１マスに複数枚のカードがあれば、それらをすべて捨てる。" },
  { id: "eternal-orange", name: "禁断の果実 マルメゴ", color: "orange", note: "効果の使用により手札をすべて捨てずに済んだ場合で、まだ橙のカードを持っている限り何度でも効果を使用できる。「なないろの欠片」をドローした場合は、すべての色を兼ねているため橙として処理し、手札をすべて捨て、あなたはこのターン移動できない。" },
  { id: "eternal-yellow", name: "黄金の宮殿 ドムス・ネロ", color: "yellow", note: "複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。" },
  { id: "eternal-green", name: "奇跡の森 マンズウッド", color: "green", note: "なし。" },
  { id: "eternal-blue", name: "月下の漂流船 プリドゥエン", color: "blue", note: "カードの置かれた場所も対象にできる。" },
  { id: "eternal-pink", name: "結ばれの一本桜 コノハナサクヤ", color: "pink", note: "効果の対象となった相手プレイヤーは「移動」扱いになるため、移動先のカードが裏向きであればオープンし到達効果を得る。相手をあなたの隣に移動させた後、ムーブフェイズで移動先がなく相手に接触することしかできない場合は、接触できないため、山札から自分の隣にカードを裏向きで置きターン終了となる。" },
  { id: "eternal-purple", name: "終わりなき化学 ゲンテクニーク", color: "purple", note: "自分の手札に加えるのは選んだマスの１番上のカードである。（１番上の原則）" },
];

// ファーストカード7種、各色1種・1枚（ゲーム開始前に配られる、駒と同色のカード）。
export const FIRST_CARDS = [
  { id: "first-red", name: "赤のキューブ フェニックス", color: "red", note: "追色により赤のカードを捨ててから使用するため、実質捨て場の上から２番目のカードは、効果使用前の捨て場の１番上のカードとなる。手に入れたカードが赤ならば、そのカードを捨て、もう一度効果を使えるが、意味のない行為になる場合のループ行為は禁止とする。" },
  { id: "first-orange", name: "橙のキューブ ハーベスト", color: "orange", note: "相手の駒が乗っているマスも対象にでき、対象のマスのカードの表裏は問わない。手札にまだ橙のカードを持っていれば、そのカードを捨てることで何度でも効果を使ってもよい。「あなたから２マス以内」とは、仮に２マス移動する場合に移動できる範囲のことを示す。自分のいるマスも対象である。" },
  { id: "first-yellow", name: "黄のキューブ サフラン", color: "yellow", note: "「あなたから２マス以内」とは、仮に２マス移動する場合に移動できる範囲のことを示す。自分のいるマスも対象である。" },
  { id: "first-green", name: "緑のキューブ ヴァーディアン", color: "green", note: "ドロー（手札に加える）とあるが、オープンした状態で相手プレイヤーに見える状態で公開したままにしておくのが望ましい。" },
  { id: "first-blue", name: "青のキューブ セレスティア", color: "blue", note: "複数のプレイヤーを対象にした効果は原則、効果の使用者から時計回りに効果を処理する（処理順の原則）。" },
  { id: "first-pink", name: "桃のキューブ セレナーデ", color: "pink", note: "ロックフェイズでカードを１枚ロックしていたとしても、このカードの手札効果でもう１枚ロックすることができる。" },
  { id: "first-purple", name: "紫のキューブ ディメンション", color: "purple", note: "「一気に移動」なので１マス目のカードや相手の駒等の有無は関係ない。「通常の移動」とはムーブフェイズで通常行う移動のこと。" },
];

// カードid → 定義の逆引き（山札・手札等に入っている実際のトークンのcardIdから
// 名前・色を引くために使う）。
const ALL_CARDS = [...NORMAL_CARDS, ...ETERNAL_CARDS, ...FIRST_CARDS];
const CARD_BY_ID = new Map(ALL_CARDS.map((c) => [c.id, c]));

export function getCardDefinition(cardId) {
  return CARD_BY_ID.get(cardId);
}

// 実物のカード画像（画像素材/配下、assets/cards/にコピーしてcardIdをそのままファイル名にした
// もの）。プレイマット画像と同じ理由で、実際の絵柄はgit管理・公開リポジトリには含めない
// （.gitignoreの/assets/cards/参照）。画像自体にタイトル・色・効果テキストまで描かれているため、
// 表向きの時はこの画像を表示するだけでよく、別途テキストを重ねて表示する必要はない。
export function getCardImagePath(cardId) {
  return `assets/cards/${cardId}.png`;
}

// 裏面は「通常カード」「エターナルカード」「ファーストカード」でデザインが違う（物理カードと
// 同じ）。idの接頭辞（"eternal-"/"first-"）で判別する。
// cardIdがnullの場合（オンライン対戦で、本当に中身が見えない裏向きカード・他人の手札を
// 描画する時。so7_game_tokens_visibleビューがマスクした結果、真にcardIdが分からない）は
// 通常カードの裏面にフォールバックする（このオンライン対戦の第一弾では盤面49マスは
// 通常カードのみで構成されるため、実用上はこれで正しい）。
export function getCardBackImagePath(cardId) {
  if (!cardId) return "assets/cards/back-normal.png";
  if (cardId.startsWith("eternal-")) return "assets/cards/back-eternal.png";
  if (cardId.startsWith("first-")) return "assets/cards/back-first.png";
  return "assets/cards/back-normal.png";
}
