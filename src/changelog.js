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
      "カード効果の自動処理モードを「部屋（対局）ごとの共通設定」に変更し、常にON（既定）で開始するようにしました。以前は個人設定として保存され、一度OFFにすると毎回OFFで起動してしまう不具合がありました。対局中の変更は従来通り、部屋の全員が承認して切り替わります。",
      "ロビーで、後から入室した人が部屋主の画面に着席表示されない不具合を修正しました（再描画の重複排除が、対局開始前の着席プレビューの変化を取りこぼしていたのが原因。全席のロスターを見て判定するよう修正）。",
      "オンライン対戦のロビーを刷新：部屋を作る/入ると待機モーダルではなく盤面へ移り、入室順（C→B→D）に他プレイヤーが着席していきます。画面中央のロビーモーダルは部屋主だけに「ゲームを開始する」（オプション内蔵・2人以上で有効）が出て、他の人には「○○がゲーム開始するのを待っています」と表示。開始で自動的に席が確定します。",
      "ペットの選択肢に「なし（非表示）」を追加しました。",
      "ホーム画面の「お知らせ／更新情報」に、未読があると「NEW」バッジが付くようにしました。開くと消えます。",
      "「図鑑／ルールブック」を全画面表示にし、山札一覧とルール・ヘルプの内容を1画面にまとめて表示するようにしました。",
      "ホーム画面のメニューアイコンを大きくし、文字・間隔を調整。マイページの配置を更新し、巨大な半透明アバター（最背面の飾り）を追加しました。",
      "ペット変更ピッカーが背面に隠れて開かない不具合を修正（モーダルのz-index指定漏れ）。",
      "ホームのメニューアイコンを大きくしても頭打ちになる不具合を修正（グリッド幅をアイコンサイズに連動）。マイページのレイアウト編集で要素の枠が中身に合うよう調整し、プロフィールを囲う枠を撤去しました。",
      "ホーム画面から管理者モードを開いてもウィンドウが背面に隠れて見えない不具合を修正。",
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
      "駒に遅れて追従する飾りのペット（仮）を追加しました。ゲームには一切関係ない見た目だけの要素です。ペットは各プレイヤーの「自ゲート側」に立ち、うろうろ歩く・小さく跳ねる・たまに高く飛ぶ・駒の周りを一周する・止まるをランダムに行います（全員バラバラの動き）。ペットは仮の絵文字7種から選べます（左下ステータスエリアのアイコン／マイページから）。管理者モードで位置・大きさ・追従速度・うろつき範囲・跳ねる激しさを微調整できます。",
      "マイページに着せ替え一式（駒スキン・カード裏・プレイマット・背景・ペット）の変更ボタンを追加しました。",
      "（管理者用）マイページのレイアウト編集モードを追加。ONにするとマイページの各要素をドラッグ移動・端で拡大縮小でき、「テキスト出力」で配置を書き出せます（保存はせず、製作者がプログラムに焼き込む運用）。",
      "ステータスエリアの着せ替えアイコン群（駒スキン・カード裏・ペット・プレマ・背景・オンライン）が崩れる不具合を修正し、flexで自動整列するようにしました。ペット変更アイコンが反応しない不具合も修正（他アイコンと重なっていたのが原因）。ステータスエリアのレイアウト（アバター・情報位置等）を調整。",
      "マイページのレイアウト編集モードを改善：アバター変更ボタンを独立要素化、右へ動かすと要素が潰れる不具合（カード幅の見えない壁）を修正、要素の実寸を保持するように。",
      "ホーム画面のメニューアイコンを、新しく作成した専用アイコン画像に変更しました（アイコンごとの枠は撤去）。明るい背景でも見やすいよう文字・アイコンを調整し、4個ずつ2段に整列。ホバーするとアイコン背面に幻想的なオーラが浮かぶ演出を追加しました。ホーム画面に入る時に一瞬暗い画面が出る不具合も修正（背景の下地色＋画像の事前読み込み）。メニューアイコンのサイズを管理者モードで一括調整できるようにしました。",
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

// 未読お知らせの判定（ユーザー要望「未読があればメニューアイコンにNEW表示」）。
// 最新エントリの日付＋項目数＋エントリ総数を「署名」とし、開いた時にlocalStorageへ保存する。
// 署名が保存値と違えば未読（新しいお知らせがある）とみなす。
const CHANGELOG_READ_KEY = "so7-changelog-read";
function currentSignature() {
  const top = CHANGELOG[0];
  if (!top) return "";
  return `${top.date}|${top.items.length}|${CHANGELOG.length}`;
}
export function hasUnreadChangelog() {
  try {
    return localStorage.getItem(CHANGELOG_READ_KEY) !== currentSignature();
  } catch (e) {
    return false;
  }
}
export function markChangelogRead() {
  try {
    localStorage.setItem(CHANGELOG_READ_KEY, currentSignature());
  } catch (e) {
    /* localStorage不可でも致命的ではない */
  }
}

function close() {
  backdropEl?.remove();
  modalEl?.remove();
  modalEl = null;
  backdropEl = null;
}

export function openChangelogModal() {
  if (modalEl) return;
  markChangelogRead(); // 開いた時点で既読に（メニューのNEW表示を消す）
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
