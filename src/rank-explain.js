// ランク戦（フリーマッチ）の説明。ホーム画面・マイページのランク表示をクリックした時に出す
// 説明モーダル（ユーザー要望2026-08-17）と、ヘルプページの「🏆 ランク戦について」項目の両方で
// 使う共有コンテンツ。docs/ranked-spec.md の v1 仕様をプレイヤー向けにやさしく要約したもの。

import { createBackdrop, createModalCloseX } from "./ui-helpers.js";

// help.js の openItemModal と同じ { title, body:[段落...] } 形式。ヘルプの索引にもそのまま並べる。
export const RANK_EXPLAIN_SECTIONS = [
  {
    title: "ランク戦とは",
    body: [
      "「フリーマッチ（ランク戦）」は、対戦の勝敗でランク（段位）が上がったり下がったりする競技モードです。",
      "下から順にブロンズ → シルバー → ゴールド → プラチナ → ダイヤモンド → マスター → レジェンドの7段階があります。",
      "現在は2人戦（1対1）のみ。マイデッキ戦・自動処理モード・ターンタイマーは常にON、無色（白黒）カードは含めません（不正・放置対策のため固定です）。",
      "マイページで見られる「対戦数のティア（アバターの色付きリング）」とは別物の、勝敗で競うランクです。",
    ],
  },
  {
    title: "七色ゲージと昇格",
    body: [
      "各ランクには、赤 → 橙 → 黄 → 緑 → 青 → 桃 → 紫の順に点灯する七色のゲージがあります（このゲームの7色ロックと同じ並びです）。",
      "ポイントを得るとゲージが赤側から点灯し、7個すべて揃うと次のランクへ昇格します。",
      "7を超えて余ったポイントは、次のランクのゲージに持ち越されます。",
      "負けてマイナスを受けると、後ろ（紫側）から消えていきます。ただし現在のランクの0より下にはならず、シーズン中は一度上がったランクから下がることはありません（ゲージだけが上下します）。",
    ],
  },
  {
    title: "勝敗でもらえるポイント（2人戦）",
    body: [
      "ブロンズ〜ゴールドは「ランクブースト」で序盤を進みやすくしています：1位（勝ち）+3、2位（負け）−1。",
      "プラチナ以降は「通常」：1位 +1、2位 −1。",
      "ブースト／通常のどちらになるかは、対戦開始時点のあなたのランクで決まります。",
      "昇格の目安は、2人戦なら約3勝で1つ上のランクへ、です。",
    ],
  },
  {
    title: "レジェンド（最上位）",
    body: [
      "最上位のレジェンドに到達すると、以降は昇格の代わりに「レジェンドポイント（LP）」が積み上がります。",
      "LPの多さでレジェンド内ランキング（1位〜）を競います。レジェンドからの降格はありません。",
    ],
  },
  {
    title: "シーズン（毎月更新）",
    body: [
      "ランク戦は1か月ごとのシーズン制です。毎月新しいシーズンが始まります。",
      "新しいシーズンは、前のシーズンで到達したランクの2つ下・ゲージ0から再スタートします（例：前シーズンがダイヤモンドなら、翌月はゴールドから）。",
      "シーズン中は降格しないので、シーズン終了時のランク＝そのシーズンの最高到達ランクになります。",
    ],
  },
  {
    title: "対戦相手の見つけ方",
    body: [
      "「対戦相手を探しています」で待機し、相手が見つかると両者の画面に「対戦開始」が出ます。両者が押して初めて対戦（とレート・タイマー）が始まります。",
      "どちらかが押さなかった場合、押さなかった側は待機から外れるだけで、ペナルティもレート変動もありません（席を外していても安心です）。",
      "プレイ人口が少ないうちは、待機プレイヤーが現れたら通知を受け取る設定（オプション）や、合言葉で友だちとランク戦をする方法も使えます。",
    ],
  },
];

let modalEl = null;
let backdropEl = null;

function closeModal() {
  backdropEl?.remove();
  modalEl?.remove();
  backdropEl = null;
  modalEl = null;
}

// ランク表示（ホーム／マイページ）クリックで出す、全セクションを1枚にまとめたスクロール可能な
// 説明モーダル。どこから開いても最前面に出るよう十分高い z-index を使う。
export function showRankExplanationModal() {
  if (modalEl) return;
  backdropEl = createBackdrop(closeModal, { dim: true, zIndex: 20190 });
  document.body.appendChild(backdropEl);

  modalEl = document.createElement("div");
  modalEl.id = "rank-explain-modal";

  const titleEl = document.createElement("div");
  titleEl.className = "rank-explain-title";
  titleEl.textContent = "🏆 ランク戦について";
  modalEl.appendChild(titleEl);
  modalEl.appendChild(createModalCloseX(closeModal));

  const body = document.createElement("div");
  body.className = "rank-explain-body";
  for (const section of RANK_EXPLAIN_SECTIONS) {
    const h = document.createElement("div");
    h.className = "rank-explain-section-title";
    h.textContent = section.title;
    body.appendChild(h);
    for (const line of section.body) {
      const p = document.createElement("p");
      p.className = "rank-explain-paragraph";
      p.textContent = line;
      body.appendChild(p);
    }
  }
  modalEl.appendChild(body);

  const okBtn = document.createElement("button");
  okBtn.type = "button";
  okBtn.className = "rank-explain-ok";
  okBtn.textContent = "OK";
  okBtn.addEventListener("click", closeModal);
  modalEl.appendChild(okBtn);

  document.body.appendChild(modalEl);
}
