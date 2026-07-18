// 実際のカードデータ（docs/cards.md, docs/rulebook.mdより）。
// 「カード効果・カードデータはコードに埋め込まず、外部データとして持つ」という方針(CLAUDE.md)
// に沿って、ゲームロジック(state.js)や描画(main.js)から分離したこのファイルにまとめる。
// 効果テキストは今回は含めない（カード名・色・枚数だけをまず反映し、実際に遊べるサンドボックス
// にする）。効果テキストの表示は今後の課題。

// 通常カード19種、合計112枚（赤橙黄緑青桃紫は各色2種×7枚=98枚、虹1種×7枚、
// 無色(白黒)4種で合計7枚：色落ちキャットのみ1枚、他3種は2枚ずつ）。
export const NORMAL_CARDS = [
  { id: "red-jump-pad", name: "ジャンプ台", color: "red", count: 7 },
  { id: "red-counter-lock", name: "カウンターロック", color: "red", count: 7 },
  { id: "orange-mass-change", name: "マスチェンジ", color: "orange", count: 7 },
  { id: "orange-harvest-sow", name: "収穫と種まき", color: "orange", count: 7 },
  { id: "yellow-sleight-of-hand", name: "手品師の技 -スリカエ-", color: "yellow", count: 7 },
  { id: "yellow-gamble", name: "ザ・ギャンブル", color: "yellow", count: 7 },
  { id: "green-joint-construction", name: "合同建設", color: "green", count: 7 },
  { id: "green-growing-trees", name: "増殖する樹々", color: "green", count: 7 },
  { id: "blue-slum-official", name: "スラム上がりの役人", color: "blue", count: 7 },
  { id: "blue-choosable-trap", name: "選べる罠", color: "blue", count: 7 },
  { id: "pink-party", name: "パーティー", color: "pink", count: 7 },
  { id: "pink-present", name: "プレゼント", color: "pink", count: 7 },
  { id: "purple-trial-ritual", name: "試練の儀式", color: "purple", count: 7 },
  { id: "purple-sorry", name: "ゴメンナサイッ！", color: "purple", count: 7 },
  { id: "rainbow-shard", name: "なないろの欠片", color: "rainbow", count: 7 },
  { id: "white-radiance", name: "なないろの巨光", color: "white", count: 2 },
  { id: "white-awakening", name: "白の意思の覚醒", color: "white", count: 2 },
  { id: "black-faded-cat", name: "色落ちキャット", color: "black", count: 1 },
  { id: "black-contract-brand", name: "黒の契約の烙印", color: "black", count: 2 },
];

// エターナルカード7種、各色1種・1枚（相手ゲート侵攻ボーナスで獲得するボーナスカード）。
export const ETERNAL_CARDS = [
  { id: "eternal-red", name: "紅蓮の火山 ワイナウエア", color: "red" },
  { id: "eternal-orange", name: "禁断の果実 マルメゴ", color: "orange" },
  { id: "eternal-yellow", name: "黄金の宮殿 ドムス・ネロ", color: "yellow" },
  { id: "eternal-green", name: "奇跡の森 マンズウッド", color: "green" },
  { id: "eternal-blue", name: "月下の漂流船 プリドゥエン", color: "blue" },
  { id: "eternal-pink", name: "結ばれの一本桜 コノハナサクヤ", color: "pink" },
  { id: "eternal-purple", name: "終わりなき化学 ゲンテクニーク", color: "purple" },
];

// ファーストカード7種、各色1種・1枚（ゲーム開始前に配られる、駒と同色のカード）。
export const FIRST_CARDS = [
  { id: "first-red", name: "赤のキューブ フェニックス", color: "red" },
  { id: "first-orange", name: "橙のキューブ ハーベスト", color: "orange" },
  { id: "first-yellow", name: "黄のキューブ サフラン", color: "yellow" },
  { id: "first-green", name: "緑のキューブ ヴァーディアン", color: "green" },
  { id: "first-blue", name: "青のキューブ セレスティア", color: "blue" },
  { id: "first-pink", name: "桃のキューブ セレナーデ", color: "pink" },
  { id: "first-purple", name: "紫のキューブ ディメンション", color: "purple" },
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

// 裏面は「通常カード」と「エターナルカード」でデザインが違う（物理カードと同じ）。
// エターナルカードのidは"eternal-"で始まる命名にしているので、それで判別する。
export function getCardBackImagePath(cardId) {
  return cardId.startsWith("eternal-") ? "assets/cards/back-eternal.png" : "assets/cards/back-normal.png";
}
