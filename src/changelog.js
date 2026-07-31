// ホーム画面の「お知らせ／更新情報」（ユーザー要望「ホーム画面にバージョンアップ情報を追加し、
// デプロイの度にその概要を日時を添えて記載していきたい」）。
//
// ★運用メモ: デプロイするたびに、この CHANGELOG の先頭に { date, items } を1件追記する
//   （新しい順＝先頭が最新）。日付は YYYY-MM-DD。itemsはその回の変更の概要（箇条書き）。

import { createBackdrop, createModalCloseX } from "./ui-helpers.js";

export const CHANGELOG = [
  {
    date: "2026-07-31",
    items: [
      "チュートリアルCPU戦のターン3まで完成：ジャンプ台で空いた相手ゲートへ侵攻→ゲート侵攻ボーナスでエターナル「緑」を獲得・ロック→7色そろえて勝利、まで遊べます。文言・演出も調整（CPU移動時のカードオープン、終了後はホームへ戻る 等）。",
      "観戦機能を追加：進行中の対局を後から観戦できます（「公開情報のみ」か「すべて見える」を選択可）。",
      "オンラインでゲート侵攻の演出（エターナル獲得・手札奪う）が出ない不具合を修正。",
      "戦績システムの試合コメントを「みんなのコメント」に刷新し、各コメントへ個別に返信できるようにしました。",
      "アプリ更新時にお知らせバナーを表示（対局中は出さず、対局が終わってから出ます）。この更新情報ページも追加。",
      "更新バナーが出ないまま勝手に更新されることがある不具合を修正（実行中コード自身のバージョンを基準に判定するように変更）。",
      "ホーム画面の背景画像を新しいタイトル画像に変更。ゲーム盤面の既定背景を「灰」に変更。",
      "右上オプションエリアに装飾帯を追加し（画面の左端から右端まで）、背景が白系でもアイコンが見やすくなるように改善。2D/3D切替アイコンは丸囲みと文字を外し、ホバーで説明が出る形にしました。",
      "チュートリアルCPU戦の左上に「チュートリアルを終了する」ボタンを追加（確認のうえホームへ戻ります）。",
      "更新バナーの「更新する」を押しても反映されず何度も出る不具合を修正（再読み込み前にキャッシュを取り直すように変更）。万一反映されない時はハードリフレッシュの案内も表示します。",
      "右上オプションエリアの各アイコン（Discord・ヘルプ・ランキング・マイページ・2D/3D）もホバーで簡易説明が出るように修正（画面上端で見切れないよう下側に表示）。アイコン下のテキストは背景が白系でも読めるよう暗いバッジ＋影を付けました。",
      "HUERISE画面の右下に、今動いているアプリのバージョン（デプロイ日時）を小さく表示するようにしました。",
      "自動処理モードで、ルールに反した自由なドラッグを制限しました：掴めるのは自分の手札カードだけになり、駒・盤面/ロックのカード・山札・捨て場・エターナル/ファースト束・相手の手札は掴めません。駒の移動は移動フェイズで光るマスをタップして行います。手札カードでも不正なドロップ（ロック不可タイミングでのロック、使えないタイミングでの効果発動、山などへの配置）は弾きます。管理者はオプションからこの制限を解除できます。",
      "駒に遅れて追従する飾りのペット（🐥・仮）を追加しました。ゲームには一切関係ない見た目だけの要素です（今後、着せ替えや本番の絵に育てる予定）。",
      "Googleでログイン済みでも「戦績システム連携」がログイン未検出になることがある不具合を修正（Google連携の判定を厳格すぎる条件から総合判定に変更）。",
    ],
  },
  {
    date: "2026-07-30",
    items: [
      "ブーストモードを追加：開始時にファーストカードの両隣の色をロックした状態でスタート（時短ルール）。",
      "捨て札の山を右クリックで捨て札一覧を表示できるようにしました。",
      "山札が切れたら自動でノーシャッフル補充（捨て場の一番上が山札の一番下）。",
      "スリカエ・セレスティア等、対象や結果が分かるお知らせモーダルを追加。スリカエにシャッフル演出も追加。",
      "駒にカーソルを合わせると全員のプレイヤー名を表示。盤外ではカーソル位置を相手に見せないように。",
    ],
  },
];

let modalEl = null;
let backdropEl = null;

function close() {
  backdropEl?.remove();
  modalEl?.remove();
  modalEl = null;
  backdropEl = null;
}

export function openChangelogModal() {
  if (modalEl) return;
  backdropEl = createBackdrop(close, { dim: true, zIndex: 2400 });
  modalEl = document.createElement("div");
  modalEl.id = "changelog-modal";

  const title = document.createElement("div");
  title.className = "changelog-modal-title";
  title.textContent = "📰 お知らせ／更新情報";
  modalEl.appendChild(title);
  modalEl.appendChild(createModalCloseX(close));

  const list = document.createElement("div");
  list.className = "changelog-list";
  if (CHANGELOG.length === 0) {
    const empty = document.createElement("div");
    empty.className = "changelog-empty";
    empty.textContent = "まだ更新情報はありません。";
    list.appendChild(empty);
  } else {
    for (const entry of CHANGELOG) {
      const section = document.createElement("div");
      section.className = "changelog-entry";
      const date = document.createElement("div");
      date.className = "changelog-date";
      date.textContent = entry.date;
      section.appendChild(date);
      const ul = document.createElement("ul");
      ul.className = "changelog-items";
      for (const item of entry.items) {
        const li = document.createElement("li");
        li.textContent = item; // textContentで安全に表示
        ul.appendChild(li);
      }
      section.appendChild(ul);
      list.appendChild(section);
    }
  }
  modalEl.appendChild(list);

  document.body.appendChild(backdropEl);
  document.body.appendChild(modalEl);
}
