// ホーム画面の「お知らせ／更新情報」（ユーザー要望「ホーム画面にバージョンアップ情報を追加し、
// デプロイの度にその概要を日時を添えて記載していきたい」）。
//
// ★運用メモ: デプロイするたびに、この CHANGELOG の先頭に { date, items } を1件追記する
//   （新しい順＝先頭が最新）。日付は YYYY-MM-DD。itemsはその回の変更の概要（箇条書き）。
//   ★2026-08-29から: 新しく追記する回は itemsEn（英語版・itemsと同じ順番・同じ件数）も
//     一緒に書く（ユーザー判断で過去分の英訳はしない＝itemsEnが無い回は日本語のまま出る）。

import { createBackdrop } from "./ui-helpers.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13
import { getLang } from "./i18n.js";

export const CHANGELOG = [
  {
    date: "2026-09-03",
    items: [
      "アプリが使う画像を、実際に表示される大きさに合わせて作り直しました。スマホ（特にiPhone）で対戦中にアプリが落ちてタイトル画面に戻ってしまう不具合の対策です。ゲーム中に読み込む画像の重さがおよそ3分の1になり、通信量と読み込みの待ち時間も減ります。見た目は変わりません。",
      "はじめての方向けに、ホーム画面の一番上へ「次にやること」を1つだけ表示するようにしました。①遊び方を覚える→②CPUと1戦→③誰かと対戦、と進み、終われば自動的に消えます（✕でいつでも消せます）。",
      "BGMが重なって鳴ってしまう不具合を直しました（マイページからホームに戻るとタイトルのBGMが鳴り出し、対戦を始めても鳴りやまない等）。BGMは常に1つだけ鳴る作りにしました。",
      "ホーム画面のBGMを待機中のBGMに変えました。",
      "追色を払う演出でカードが脈打つ時に効果音を付けました。",
      "勝利の演出に音を足しました。七色が1つ灯るごとに音が上がっていき、光が弾ける瞬間に一撃が入ります。",
      "オンライン対戦では、最後のロックの承認を全員に確認するようにしました。以前はゴメンナサイを使えない人が自動で承認されていたため、すぐ通ったことで「あの人は持っていない」と分かってしまっていました。",
      "最後のロックの承認で、相手の番のまま進まなくなることがあった不具合を直しました。",
      "右下に並ぶ「このターンの出来事」のマークを分かりやすくしました。手に入れた・引いたは「＋」に統一、ロックはカードに鎖が重なる表示、ゲート侵攻は「∞」になります。",
      "「不発のためこのカードを手札に加えます」などの結果のお知らせは、画面のどこかをタップすればすぐ閉じて次へ進めるようにしました（放置すれば今まで通り自動で消えます）。",
      "試練の儀式やザ・ギャンブルで鳴る心臓の鼓動を、もっとはっきり聞こえるようにしました（特にスマホ）。",
      "対応しているスマホでは、鼓動に合わせて端末が振動するようにしました（基本設定でオフにできます。iPhone・iPadは振動できません）。",
      "CPU戦を始めた時、配り始める直前に前の盤面（または起動時の盤面）が一瞬映っていたのを直しました。",
      "CPUがカウンターロックを持っているのに使わないことがあったのを直しました。ロックするカードが無くても、接触を無効にするために使うようになります。",
      "カードをじっくり選んでいると、処理中の判定が先に切れて駒が動かせてしまう不具合を、根本から直しました。何分かけて選んでも大丈夫です。",
      "相手の効果で自分がカードを置いた時、盤面のマークが相手のアバターになっていたのを直しました。実際に置いた人が表示されます。",
      "ゲート侵攻で自分のゲートのカードを回収した時、複数枚あればまとめて1つの画面で見られるようにしました。",
      "スマホで「◯◯を選んでください」の案内が小さすぎて読めなかったのを、他の画面と同じ大きさに直しました。",
      "スマホでアプリを閉じた時に「プッ」という音が鳴ることがあったので、音をなめらかに止めるようにしました。",
      "CPUが盤面の端ばかり通らないよう、同じくらい良い手なら内側を選ぶようにしました。",
      "CPU同士が「スリカエ」で手札を交換した時、何を交換したかが見えてしまっていたのを直しました。自分が関わっていない交換では、中身は伏せたまま「交換しました」とだけお知らせします。",
      "接触した時にカードを2枚奪ってしまうことがあった不具合を直しました。自動で承認する仕組みが2か所にあり、条件の変わり目で両方が動いてしまうことがありました。",
      "カードをオープンする効果（サフランなど）でじっくり選んでいると、処理中の判定が先に切れてしまい、その隙に駒が動かせてしまうことがあったのを直しました。",
      "対戦のあとホーム画面に戻ると無音になっていたのを直しました。タイトル画面と同じBGMが流れます。",
    ],
    itemsEn: [
      "Every image in the app has been rebuilt at the size it is actually displayed. This targets the crash where the app would drop back to the title screen mid-match on phones (iPhone especially): the memory used by images during a match is now about a third of what it was, and downloads are lighter too. Nothing looks different.",
      "New players now see a single “Next up” card at the top of the home screen: 1) learn how to play, 2) play one CPU match, 3) play someone. It disappears once you are up and running (or via the ✕).",
      "Fixed overlapping background music (for example the title theme starting when you returned home from My Page and never stopping once a match began). Only one track can now play at a time.",
      "The home screen now uses the waiting-room music.",
      "Added a sound to the card’s pulse when you pay a Color Cost.",
      "Added sound to the victory sequence: the pitch rises as each of the seven colours lights up, with an impact as the light bursts.",
      "Online matches now ask every player to approve a final lock. Previously players who could not use So Sorry! were approved automatically, and the instant skip revealed that they did not hold the card.",
      "Fixed: approving someone’s final lock could get stuck waiting on one player and never continue.",
      "Clearer marks on the “this turn” chips at the bottom right: gaining and drawing are now both “+”, a lock shows chains over the card, and a gate invasion shows “∞”.",
      "Result notices such as “the effect fizzled, so this card returns to your hand” can now be dismissed by tapping anywhere, moving the game on immediately (leave it alone and it still closes by itself).",
      "The heartbeat sound in Trial Ritual and The Gamble is now much easier to hear, especially on phones.",
      "On phones that support it, the device now vibrates along with the heartbeat (switchable in Settings; iPhone and iPad cannot vibrate).",
      "Fixed: starting a CPU battle briefly flashed the previous (or the app’s startup) board just before the deal.",
      "Fixed: the CPU sometimes held Counter Lock without using it. It now uses it to negate contact even when it has no card to lock (locking is optional).",
      "Fixed at the root: taking your time choosing cards no longer ends the “busy” state early, which had allowed a piece to be moved mid-effect.",
      "Fixed: when you placed a card because of an opponent’s effect, the board marker showed their avatar. It now shows whoever actually placed it.",
      "Gate invasion: cards recovered from your own gate are now shown together in a single window instead of one at a time.",
      "Fixed: the “choose …” banner was far too small to read on phones — it now matches the other on-screen messages.",
      "Fixed: closing the app on a phone could produce a short pop. Sound now fades out instead of stopping abruptly.",
      "The CPU no longer hugs the board edge as much — among equally good moves it now prefers the inside.",
      "Fixed: when two CPUs swapped cards with Sleight of Hand, the swapped cards were revealed. Swaps you are not part of now only say that a swap happened.",
      "Fixed: making contact could steal two cards. Two separate auto-approval paths could both fire when the conditions changed mid-way.",
      "Fixed: taking your time while flipping cards (Saffron and similar) could end the “busy” state early, letting a piece be moved in the middle of the effect.",
      "Fixed: returning to the home screen after a match left it silent — the title music now plays.",
    ],
  },
  {
    date: "2026-09-02",
    items: [
      "アプリの更新中に、どこまで進んでいるかが画面上部に出るようになりました（時間がかかる時でも止まっているのか進んでいるのか分かります）。",
      "CPU戦では、あなたの手番に持ち時間の時間切れが起きなくなりました。待っている相手がいないので、席を外していても勝手に手が進んだり砂時計が減ったりしません（オンライン対戦はこれまで通りです）。",
      "しばらく席を外して自動で進んだあと戻ってきた時に、「このマスでいいですか？」で「選び直す」を押すと何度も同じ確認が出てしまう不具合を直しました。自動で選ばれた分にはこの確認を出しません。",
    ],
    itemsEn: [
      "Updating the app now shows progress at the top of the screen, so you can tell it is working even when it takes a while.",
      "In CPU battles your own turn no longer times out. Nobody is waiting on you, so stepping away never plays a move for you or spends your hourglasses (online matches are unchanged).",
      "Fixed: after being away and having your turn played automatically, choosing “Pick again” on “Is this the square?” could ask you over and over. Automatic choices no longer show that confirmation.",
    ],
  },
  {
    date: "2026-09-02",
    items: [
      "勝利演出の最中に「ロックしました」などの対局中のお知らせが画面中央に出て、演出の邪魔になっていたのをやめました。演出が始まったら、その時に出ているお知らせも片付きます（選択が必要なモーダルはこれまで通り出ます）。",
      "対戦のあとホーム画面に戻っても、盤面のBGMが鳴り続けていたのを直しました。",
    ],
    itemsEn: [
      "In-game notices (like “Locked!”) no longer appear over the victory celebration — any already on screen are cleared when it starts. Modals that need your choice still appear as before.",
      "Fixed: the in-game music kept playing after a match when you returned to the home screen.",
    ],
  },
  {
    date: "2026-09-02",
    items: [
      "追色（同じ色のカードを捨てて使う）の演出で、吸い込まれていくカードが手札にも残ったままで二重に見えていたのを直しました。",
      "「スリカエ」で相手に返すカードを選んでいる最中に、選んだつもりのカードをそのまま使ってしまうことがあった不具合を直しました。カード効果の選択待ちの間は、手札や駒に触れても動かなくなります。",
      "ゲート侵攻の処理中に駒を動かせてしまい、本来の「自分のゲートへ戻る」が上書きされてしまうことがあった不具合を直しました。処理が終わるまで盤面の操作を受け付けません。",
    ],
    itemsEn: [
      "Fixed: during the Color Cost animation, the card being absorbed also stayed in your hand, so it looked doubled.",
      "Fixed: while choosing which card to hand back for Sleight of Hand, tapping a card could use it instead. Cards and pieces no longer respond while a card effect is waiting for a choice.",
      "Fixed: pieces could still be moved while a Gate Invasion was resolving, which overrode the “return to your own gate” step. The board no longer accepts input until it finishes.",
    ],
  },
  {
    date: "2026-09-02",
    items: [
      "「奇跡の森 ヴァーディアン」で公開ドローしたカードをタップしても、そのカードが手札に入って裏向きになるだけで使えなかった不具合を直しました。タップすると、手札のカードと同じように使用の確認が出ます。",
      "公開ドローしたカードにカーソルを合わせる（長押しする）と、拡大表示に「このターン使わなかったら、ターン終了時に捨てられます」と出るようにしました。",
      "通常の移動でも、移動先のマスを選んだあとに「このマスでいいですか？」の確認が出るようにしました（カード効果でマスを選ぶ時と同じ確認です。基本設定でまとめて切り替えられます）。",
      "CPUが「ゴメンナサイッ！」を使った時、処理が速すぎて何が起きたのか分からなかったのを直しました。奪ったカードを見せるモーダルを閉じる（または自動で消える）まで、次へ進まなくなります。",
      "ホームに戻っても勝利BGMが鳴り続け、しばらくすると勝利BGMがまた鳴り始めることがあった不具合を直しました。",
      "非公開のカードを手に入れた時のお知らせに、花札の絵文字ではなくカードの裏面を出すようにしました（画面中央のお知らせと、右下の「このターンの出来事」の両方）。",
      "運営からのお知らせに掲載期間を設定できるようにしました。期間を過ぎたお知らせは、まだ読んでいない方にも表示されません。",
      "ブラウザで遊んでいる方に、ホーム画面への追加（アプリのように起動できます）をご案内するようにしました。Androidなどではボタン一つで追加でき、iPhone・iPadでは追加の手順をご案内します（「あとで」を押すとしばらく出ません）。",
    ],
    itemsEn: [
      "Fixed: a card drawn face-up by Verdian, the Wondrous Forest could not be used — tapping it just moved it into your hand face-down. Tapping it now asks to use it, just like a card in your hand.",
      "Hovering (or long-pressing) a face-up drawn card now shows “Discarded at end of turn if you don’t use it this turn” on the enlarged card.",
      "Normal moves now also ask “Is this the square?” after you pick a destination — the same confirmation used when a card effect asks you to pick a square (both can be turned off together in Settings).",
      "Fixed: when a CPU used So Sorry!, everything resolved too fast to follow. The game now waits for the “what was taken” card modal to close before continuing.",
      "Fixed: the victory music kept playing after returning home, and could start again on its own after a while.",
      "Notices about cards gained face-down now show the actual card back instead of a playing-card emoji (both the center flash and the “this turn” strip at the bottom right).",
      "Announcements from the team can now have a display period. Once it ends, the announcement is no longer shown — not even to people who have not seen it yet.",
      "If you play in a browser, you will now be offered a way to add the game to your home screen. On Android it takes one tap; on iPhone and iPad we show you the steps (“Later” hides it for a while).",
    ],
  },
  {
    date: "2026-08-29",
    items: [
      "運営からのお知らせを、ホーム画面を開いた時にお伝えできるようにしました（同じお知らせが何度も出ることはありません）。通知を許可している方には、アプリを開いていなくても届くお知らせも送れるようにしました。",
      "「この相手でいいですか？」の確認を、マスを選ぶ効果と相手を選ぶ効果できちんと出し分けるようにしました（駒が乗っているマスを選ぶ効果では、これまで通り「このマスでいいですか？」と出ます）。",
      "CPUが、パーティのような「全員がそれぞれ選ぶ」効果で、強さの設定に関係なくランダムに選んでしまっていた不具合を直しました（最強にしていても2枚オープンを選ぶことがあったのはこれが原因でした）。",
      "相手を選ぶカード効果（プレゼントなど）で、駒を選んでいるのに「このマスでいいですか？」と出ていたのを「この相手でいいですか？」に直しました。",
      "不具合報告に、CPUの強さ・人数・2D表示・自動処理・演出の設定などの「その時の状態」を自動で添えるようにしました。原因の特定が早くなります。",
      "CPU戦が途中で止まってしまうことがあった原因を突き止めて直しました（赤のキューブ フェニックスを、CPUが「使えるのに何も起きない」状態で撃ち続けていました）。念のため、CPUが同じカードを撃ち続けても止まらないようにもしています。",
      "「収穫と種まき」に到達して、その効果でその「収穫と種まき」自身を拾い、同じマスへ置き直した時に、最後にもう一度手札へ加わってしまう不具合を直しました。置き直した場所に残ります。",
      "CPUがパーティの効果で「2枚オープン」を選んでしまうことがあったのを直しました（他に選べる選択肢がある限り選びません。CPUの強さの設定に関係なく効きます）。",
      "スマホでアプリを開いた時に、画面の一部にしか表示されないことがある不具合を直しました（縦横を切り替えなくても自動で直ります）。",
      "ランク戦の「対戦相手を募集している人が現れたらお知らせ」を、ホームのランク戦アイコンと対戦相手を待っている画面からその場でONにできるようにしました。",
      "スマホのホーム画面で、画面全体を上下にスワイプできてしまっていたのを直しました（中身はもともと収まっているのに、ほんの少しだけはみ出してスクロールできる状態になっていました）。",
      "CPUが、自分のロックエリアに置いたままでも使えるカード（ファーストカード・エターナルカード）を使えるようになりました。これまでは一切使わなかったため、ディメンションで一気に2マス動いてゲート侵攻できる場面などを見逃していました。",
      "CPUが、あと1色で勝ちの相手が必要としている色のカードを、場から優先して回収するようになりました（相手の勝ち筋を止めにきます）。",
      "スマホでα版のお知らせがスクロールしないと読めなかったのを直しました。横向きの画面では3つの項目が横に並び、文字も大きくなって、そのまま全部読めます。",
      "ホーム画面を開いたときに、このアプリがまだα版（テスト中）であることと、不具合の教え方をお知らせするようにしました。アプリを開くたびに1回だけ出ます（「今後このお知らせを表示しない」で止められます）。",
      "効果の自動処理モード中は、自分の手札公開エリア（画面下の枠）を出さないようにしました。公開したカードは手札の並びの中に出るので、下の枠は常に空で場所だけ取っていたためです（管理者向けの設定で元に戻せます）。",
      "「このマスでいいですか？」の確認を、画面の端ではなく選んだマスのすぐ隣（右上、入らなければ右下・左上・左下）に出すようにしました。上に出たり下に出たりしないので視線が動きません。",
      "追色（同じ色のカードを捨てて使う）の演出中に、効果の続き（セレスティアなら「相手の手札を選ぶ」など）が重なって出てしまうのを直しました。演出が終わってから次へ進みます。",
      "追色の演出は、画面のどこかをタップすればスキップできるようになりました。",
      "「このカードを選びますか？」の確認モーダルで、ボタンを押しても反応しないこと（カウンターロックでロックするカードを選ぶ場面など）を直しました。以前この症状を直した別のモーダルと同じ原因で、押した反応（明るくなる）だけは出るのにボタンが効かない状態でした。",
      "色を宣言する画面で、必要な数（試練の儀式なら3色）まで選び終えたら、残りの色が灰色になって選べなくなるようにしました。うっかり4色目を押しても増えません。選び直したいときは、選んだ色をもう一度押して外してください。",
      "カード効果でマスを選んだあと、「このマスでいいですか？」と一度確認するようにしました。押し間違えたまま確定してしまうのを防ぎます。確認は盤面を隠さない位置（選んだマスと反対側の端）に出て、そのマスが金色に光ります。モーダルの「今後このモーダルを表示しない」で切れますし、基本設定からいつでも戻せます。",
      "「黄のキューブ サフラン」でカードをオープンしたとき、何のカードをオープンしたのかが全員に分かるようになりました。",
      "CPUが「パーティー」の効果で「2枚オープン」を選ばないようにしました（他に選べるものが無い時だけ選びます）。",
      "スマホで、画面左下のプレイヤー名・称号・手札枚数が表示されなくなっていたのを直しました（着せ替えアイコンを隠した際に、その分だけ表示欄が画面の外へずれていました）。",
      "スマホで、ロックなどのミニ通知が画面中央から一瞬だけ左上へ飛んでから右下へ向かう、おかしな動きを直しました。エモートのメニューが開く位置も同じ理由でずれていたので直しています。",
      "画面の左上から駒に向かって半透明のカードが飛んでいく、意味のない演出が時々出ていたのを直しました（隠れている場所から飛ばそうとして、位置が測れず画面の隅から飛んでいました）。",
      "iPhone・iPadで、カードのタイトルとふりがなが効果文に重なって表示されることがあったのを直しました（ふりがなの作り方を、機種によって解釈が変わらない方法に変えました）。",
      "スマホ・タブレットで勝利演出の光やカードが実物と大きくズレて出ていたのを直しました（画面全体の縮小が二重にかかっていたためで、演出全体が対象です）。",
      "接触の演出のあと「奪った」表示が出ている最中に、ターンが次の人へ切り替わってしまうことがあったのを直しました。",
      "「ゴメンナサイッ！」をCPUが使ったのに、そのまま相手が勝利してしまう不具合を修正しました。カードのコストを払った一瞬のすきに、システムが「使えなかった」と判断して先に承認していたためです。",
      "スマホでの勝利演出で、ロックの光が画面外の見えない場所に出ていたのを直しました。スマホで実際に見えている小さいロック表示の方に光ります。",
      "色を宣言する画面で、1色選んだだけで残りの色が薄くなり「もう選べない」ように見えていたのをやめました。",
      "スマホでは、画面左下の着せ替えアイコン（駒スキン・カード裏・ペット・プレイマット・背景）を表示しないようにしました。狭い画面で盤面や手札の邪魔になっていたためです。着せ替えはマイページからこれまで通り変更できます。",
      "スマホでの、自分のアバター・手札を画面下に固定した時のトレイ・左下ステータスの位置を調整しました。",
      "マイページの実績（対戦数・勝利数・勝率・勝率順位・対戦数順位・登録年月日）が表示されなくなっていたのを直しました。英語表示に対応した際の書き換えミスが原因でした。",
      "スマホでの、画面左下に大きく映る自分のアバターの位置と、その背後にうっすら重なるアバターの大きさ・位置・濃さを、スマホ専用に調整できるようにしました（管理者向けの設定です）。",
      "勝利演出で、ロックエリアの光がカードの外側に浮いて見えていたのを直しました。光を合わせる相手をロックの枠から実際のカードに変え、盤面が動いても常に追いかけるようにしたので、カードのふちにぴったり沿って光ります。",
      "勝利演出の脈動から、駒のまわりの丸い光（スポットライト）をなくしました。駒自体が光るだけになります。",
      "勝利演出で、ロックエリアの光が実際のカードの位置とずれていたのを直しました。盤面の映り方を実際に測って合わせるようにしたので、画面の大きさや盤面の拡大率が変わってもぴったり重なります。",
      "勝利演出の脈動から、中央の白い丸を消しました（勝者の色のにじみだけになります）。",
      "勝利演出を細かく直しました。ロックエリアの光が盤面と同じ向きに寝るようになり（板が立って見えていました）、脈動に重なる白い光は勝者の駒の色でやわらかくにじむようにしました。",
      "勝利演出で、宙に浮いたロックカードがその場で消えるのをやめ、勝者の駒（キューブ）へ吸い込まれるようにしました。カードが浮いた後はロックエリアの光も残らず消えます。",
      "勝利演出で、勝者のロックエリアの七色が暗転の裏側に隠れてしまい色が見えなかったのを直しました。七色は暗転より手前ではっきりと灯ります。",
      "勝利演出の脈動を作り直しました。白い丸が広がるだけだったところを、勝者の駒（キューブ）に少し半透明のもう1つのキューブが重なって脈打ち、脈動のたびに一回り大きく広がって消えるようにしました。駒スキンもそのまま反映されます。",
      "勝利演出の標準の強さを、以前の「派手版」の設定にしました（光の量・脈動・残光が強めになります）。",
      "ライトモードで、モーダルの中の文字が薄くて読めなかったところを直しました（63か所）。前回モーダルの地を明るくした際に、中の文字色が暗い地のままの想定で残っていたためです。あわせて、以前から明るかったマイページ・ランキング・マイデッキ・ショップなどのページ内も点検して直しています。",
      "ライトモードなのにダークのままだったモーダル・パネル・案内表示を、まとめてライトの見た目に直しました（53か所）。確認モーダル、右クリックメニュー、カード補足、各種ピッカー、フェイズ案内、承認バナー、ツールチップなどが対象です。幕（背景を暗くするもの）・お祝いの色付きモーダル・物語の場面は、暗いままが正しいのでそのままにしています。",
      "7色目をロックした時の演出を「七色、集結」として作り直しました。盤面が静まり、勝者のロックエリアの七色が順に灯り、その光が帯や霧のように揺れながら勝者の国宝キューブへ集まって吸い込まれます。キューブが3回脈動したあと、強烈な白い光が画面を覆い、その中に勝者が浮かび上がります。",
      "カードの文字を、印刷されたカードに近い書体・太さにしました。これまでは端末に入っているフォント任せで、WindowsとMacで別の書体・細い表示になっていました。今後はどの端末でも同じ見た目になります。",
      "手札のカードにカーソルを合わせた時、その後ろにあるロックエリアのカードが拡大表示されてしまうことがあったのを直しました。実際に手前に見えているカードが拡大されます。",
      "不具合報告にスクリーンショットを添付できるようにしました（任意）。ファイルを選ぶほか、Ctrl+Vでの貼り付け・ドラッグ＆ドロップにも対応しています。",
      "ショップの駒スキンから「0thリメイク」を外しました（「標準」と同じ絵柄のため）。これを選んでいた場合は「標準」として表示されます。",
      "手札のカードが透明になって見えない・カードが丸く切り抜かれて見える・カードの効果文が中央寄せになる、という不具合を直しました（同じ日に入れた変更による一時的な不具合でした。ご迷惑をおかけしました）。",
      "英語表示で、フェイズ案内の「移動か接触ができます」・スキップボタン・左下の称号・カード名の一部が日本語のままだったのを直しました（言語をあとから切り替えた時も追随します）。",
      "英語表示に対応しました。オプションの「基本設定」で言語を English に切り替えると、タイトル画面から対局中の案内・ヘルプ・物語・マイページ・ショップ、カードの効果文やその補足まで英語で表示されます。",
      "称号を追加しました。対戦成績・ランク戦・不具合報告に応じて全16種類が少しずつ解放されます。マイページの名前の上をクリックするとコレクションが開き、お気に入りの1つを選んで名前の上に表示できます。",
      "マイデッキ編集画面に「使い方」を追加しました。初めて開いた時に自動で表示され、以降はヘッダーの「？ 使い方」からいつでも見返せます。あわせて、デッキの箱にカードをドラッグすると箱の絵をそのカードに変えられるようになりました。",
      "カードの効果文が枠からはみ出して絵の上に重なってしまうこと（なないろの欠片）を直しました。今後は枠に収まらない時だけ、その文だけ自動的に少し小さくなります。",
      "CPU戦や自動処理の途中で、まれに盤面が完全に止まって何も進まなくなる不具合を直しました。",
      "オンライン対局中にブラウザを更新すると、そのターンのロックフェイズがやり直しになり、もう1枚ロックできてしまう不具合を直しました。更新しても続きのフェイズから再開します。",
      "カウンターロックで接触を無効にした後、最後の1色（置けば勝利になるカード）をロックできなかったのを直しました。この場合も通常どおり全員の承認を挟みます。",
      "「重なっているカードを見る」の一覧で、カードにカーソルを合わせても拡大表示されなかったのを直しました。",
      "右下の「このターンの出来事」に、前のターンの出来事が残ってしまうことがあったのを直しました。",
    ],
    // 英語表示のとき items の代わりに出る（併記はしない。同じ順番・同じ件数で書くこと）。
    itemsEn: [
      "The team can now send you a message that appears when you open the home screen (the same message never shows twice). If you have allowed notifications, it can also reach you while the app is closed.",
      "The confirmation now correctly distinguishes “Choose this opponent?” from “Use this square?”, so effects that target a square still say square even when a piece is standing on it.",
      "Fixed a bug where the CPU chose at random in “everyone chooses” effects such as Party, regardless of the difficulty setting. This is why the strongest CPU sometimes picked “open two cards”.",
      "When a card effect asks you to choose an opponent (Present and others), the confirmation now says “Choose this opponent?” instead of “Use this square?”.",
      "Bug reports now automatically include the settings in effect at the time — CPU strength and player count, 2D display, auto-processing, animation options and so on — so causes can be pinned down faster.",
      "Fixed the cause of CPU battles freezing mid-game (the CPU kept firing Phoenix, the Red Cube, in a state where it counted as usable but nothing could happen). As a safety net, the CPU also stops repeating the same card.",
      "When you land on Harvest and Sow and its effect picks up that same Harvest and Sow and puts it back on the board, it no longer gets added to your hand afterwards. It stays where you put it.",
      "The CPU no longer picks Party’s “open two cards” option while any other option is available — at every CPU strength setting.",
      "Fixed a bug where the app sometimes drew into only part of the screen when opened on a phone. It now corrects itself without rotating the device.",
      "Ranked alerts (being told when someone is looking for an opponent) can now be switched on right from the ranked icon on the home screen and from the waiting screen.",
      "On phones, the home screen could be swiped up and down even though everything already fit. It no longer scrolls.",
      "The CPU can now use cards that stay usable in its own Lock Area (First and Eternal cards). It never used them before, so it missed plays such as moving two squares at once with Dimension to invade your gate.",
      "The CPU now prefers to pick up a board card in the colour an opponent needs to win, to cut off their last colour.",
      "On phones, the alpha notice no longer has to be scrolled to be read. In landscape the three points sit side by side and the text is larger, so it all fits on one screen.",
      "When you open the home screen, a notice now explains that the app is still an alpha and how to report anything odd. It appears once each time you open the app, and can be turned off from the notice itself.",
      "While automatic effect processing is on, your own reveal area at the bottom of the screen is no longer shown — revealed cards already appear among your hand, so the frame was always empty and just took up space (an admin setting can bring it back).",
      "The “Use this square?” prompt now appears right next to the square you picked (upper-right, falling back to lower-right, upper-left or lower-left) instead of at the edge of the screen, so your eyes stay in one place.",
      "Fixed the rest of an effect (such as Celestia’s “choose an opponent’s card”) appearing on top of the colour-cost animation. It now waits for the animation to finish.",
      "You can now skip the colour-cost animation by tapping anywhere on the screen.",
      "Fixed the “Choose this card?” prompt not responding to its buttons — for example when picking a card to lock with Counter Lock. It was the same cause as another prompt fixed earlier: the button lit up on tap but the press never registered.",
      "In the colour declaration screen, once you have picked the required number of colours (three for Trial Ritual) the rest turn grey and can no longer be picked. To change your mind, tap a chosen colour again to deselect it.",
      "After you pick a square for a card effect, the game now asks “Use this square?” once, so a mis-tap no longer locks in. The prompt appears on the opposite edge from the square you picked so it never covers it, and that square glows gold. You can switch it off from the prompt itself and turn it back on any time in the basic settings.",
      "When “Saffron, the Yellow Cube” reveals a card, everyone can now see which card was revealed.",
      "The CPU no longer picks “reveal two squares” for Party — it only does so when nothing else is available.",
      "Fixed your name, title and hand count disappearing from the bottom-left of the screen on phones. Hiding the dress-up icons had pushed that panel off the edge of the screen.",
      "Fixed the mini notifications (for locking a card and so on) briefly jumping to the top-left of the screen before flying to the corner on phones. The emote menu opened in the wrong place for the same reason and is fixed too.",
      "Fixed a stray translucent card sometimes flying from the top-left corner of the screen toward a piece. It was a flight animation starting from a hidden element whose position could not be measured.",
      "Fixed the card title and its reading overlapping the effect text on iPhone and iPad. The reading is now built in a way that every browser lays out the same.",
      "Fixed the victory sequence appearing far from where it should on phones and tablets — the whole-screen scaling was being applied twice, which threw off every part of the sequence.",
      "Fixed the turn sometimes passing to the next player while the “stolen card” display from a contact was still on screen.",
      "Fixed “So Sorry!” being played by a CPU yet the opponent still winning. While the cost was being paid, the game briefly judged the card unusable and approved the lock first.",
      "Fixed the Lock Area glow in the victory sequence appearing off-screen on phones. It now lights up the small lock display you can actually see.",
      "In the colour declaration screen, the remaining colours no longer dim after you pick just one — it looked as if you could not choose any more.",
      "On phones, the dress-up icons at the bottom-left (piece skin, card back, pet, playmat, background) are no longer shown — they got in the way of the board and your hand on a small screen. You can still change all of them from My Page as before.",
      "Adjusted the placement on phones of your avatar, the fixed hand tray at the bottom of the screen, and the bottom-left status area.",
      "Fixed the achievements on My Page (matches, wins, win rate, rankings, join date) not appearing at all. It was caused by a mistake made while adding English support.",
      "On phones, the position of the large avatar at the bottom-left of the screen, and the size, position and opacity of the translucent one behind it, can now be adjusted separately from desktop (an admin setting).",
      "Fixed the Lock Area glow appearing to float outside the cards during the victory sequence. It now tracks the actual card instead of the slot frame and follows the board if it moves, so it traces each card’s edge exactly.",
      "Removed the round pool of light around the piece during the victory pulse — now only the piece itself glows.",
      "Fixed the Lock Area glow not sitting on the actual cards during the victory sequence. It now measures how the board is actually drawn, so it lines up exactly at any window size or board zoom.",
      "Removed the white disc from the pulse in the victory sequence — only the winner’s coloured haze remains.",
      "Polished the victory sequence. The glow on the Lock Area now lies flat along the board instead of standing upright, and the light around the pulsing cube is now a soft haze in the winner’s colour rather than a hard white disc.",
      "In the victory sequence, the locked cards floating in mid-air are now drawn into the winner’s cube instead of fading out where they are, and the Lock Area glow no longer lingers once the cards have lifted away.",
      "Fixed the winner’s seven colors being hidden behind the dimming layer during the victory sequence — they now light up clearly in front of it.",
      "Rebuilt the pulse in the victory sequence. Instead of a plain white circle expanding, a slightly translucent copy of the winner’s cube now sits on top of the real one and beats, sending out a larger fading cube with every pulse. Your chosen piece skin is used as-is.",
      "The victory sequence now defaults to what used to be the “flashy” setting (stronger light, pulse and afterglow).",
      "Fixed 63 places where text inside a modal was too faint to read in light mode. When the panel backgrounds were lightened, the text colours inside were still written for a dark background. Pages that were already light — My Page, the rankings, your decks, the shop — were checked and fixed too.",
      "Fixed 53 modals, panels and notices that stayed dark in light mode — confirmation dialogs, the right-click menu, card notes, the various pickers, phase notices, approval banners, tooltips and more. Dimming layers, the coloured celebration modals and the story scenes are meant to be dark, so those are unchanged.",
      "The victory sequence has been rebuilt as “Seven Colors, Gathered”. The board falls quiet, the seven colours in the winner's Lock Area light up in turn, and their light drifts as ribbons and mist into the winner's National Treasure Cube. The cube beats three times, then a blinding white light floods the screen, and the winner appears within it.",
      "The text on the cards now uses a typeface and weight close to the printed cards. Until now it depended on whichever fonts your device happened to have, so it looked different — and thinner — on Windows than on a Mac. Everyone now sees the same thing.",
      "Fixed hovering a card in your hand sometimes enlarging the card behind it in the Lock Area instead. The card you can actually see in front is the one that enlarges.",
      "You can now attach a screenshot to a problem report (optional). Pick a file, paste with Ctrl+V, or drag and drop.",
      "Removed the “0th Remake” piece skin from the shop — it is the same artwork as “Standard”. If you had it selected, it now shows as “Standard”.",
      "Fixed cards in your hand becoming invisible, cards being clipped into a circle, and the text on a card being centred. These were introduced by a change made earlier the same day — sorry about that.",
      "Fixed parts of the interface staying in Japanese in English mode — the “Move or make contact” phase note, the Skip button, the title under your name, and some card names. They now follow the language even when you switch it after the app has started.",
      "The app is now available in English. Switch the language to English in Settings and everything is translated — the title screen, the prompts during a match, the help, the story, My Page, the shop, and the text and notes on the cards themselves.",
      "Titles have been added. All 16 of them unlock gradually from your match record, your ranked play and the problems you report. Click above your name on My Page to open your collection and pick one favorite to show there.",
      "The deck editor now has a “How to use” walkthrough. It appears the first time you open the editor, and you can bring it back at any time from “? How to use” in the header. You can also drag a card onto the deck case to make it the artwork on the box.",
      "Fixed the text on a card spilling out of its frame and over the artwork (Prism Shard). From now on, only the text that does not fit is shrunk slightly to stay inside the frame.",
      "Fixed a problem where the board could occasionally freeze completely during a CPU match or while effects were resolving automatically.",
      "Fixed a problem where reloading the page during an online match restarted your Lock phase for that turn, letting you lock a second card. You now resume from the phase you were in.",
      "Fixed Counter Lock not letting you lock your last remaining color (the card that would win you the game) after nullifying contact. As usual, everyone still has to approve that final lock.",
      "Fixed cards in the “See the stacked cards” list not enlarging when you hovered over them.",
      "Fixed events from the previous turn sometimes being left behind in “What happened this turn” at the bottom right.",
    ],
  },
  {
    date: "2026-08-28",
    items: [
      "オプションの「基本設定」を整理しました。よく使う設定（効果音・BGMの音量／カードを拡大表示する大きさ／全画面で遊ぶ／使う前に確認する）は開いてすぐ触れる位置に出し、残りは「動きが重い・カクつくとき」「画面の見え方」のように“困りごと”の名前でまとめました。折りたたみの中にさらに折りたたみがある状態も無くし、項目名も何が起きるか分かる言い方に書き換えています（設定できることは今まで通り全部あります）。",
      "対戦が終わった後、結果モーダルを閉じた直後に勝手にホーム画面へ戻されてしまうこと（ランク戦）を修正しました。終了後も部屋に残って盤面を確認できます。",
      "対戦結果が戦績システムに登録されないことがある不具合を修正しました。登録は勝敗が決まった瞬間に行われるようになり、対戦後のコメントは勝ち負けに関係なく参加者それぞれが残せます。",
      "パーティ（到達効果）が2周してしまう・1回のロック宣言に複数人が「ゴメンナサイッ！」を使えてしまう・ゴメンナサイの返事待ちの間にターンが進んでしまう、といった不具合を修正しました。",
      "セレスティア（青のキューブ）で、1人にしか手札を捨てさせられないことがある不具合を修正しました。捨てられたカードは全員に公開されます。",
    ],
  },
  {
    date: "2026-08-24",
    items: [
      "対戦終了時のモーダル（勝敗・もう一度戦う等）の文字が、ライト配色の時に薄くて見えにくかったのを読みやすい色に修正しました。",
      "スマホ・タブレットで横向きに固定しやすくしました。全画面表示ボタンで全画面にすると、対応端末では自動で横向きに固定されます。また、ホーム画面に追加したアプリ（PWA）として起動すると横向きで開くようになります（iPhoneのSafariのタブのままでは、これまで通り縦向きの時に横向き案内が出ます）。",
      "ゲート侵攻で奪ったカードの中身が、本来見えないはずの他のプレイヤー（観戦者など）にも伝わってしまう不具合を修正しました（オンライン対戦のプライバシー）。",
      "カウンターロックの「手札を1枚ロックしますか？」の確認ボタンが、まれにタップしても反応せず進めなくなる不具合に、より確実な対策を入れました。",
      "マスチェンジ（到達効果）で、入れ替えが終わった直後にカードが手札へ回収されるよう、処理の順番を直しました。",
    ],
  },
  {
    date: "2026-08-18",
    items: [
      "カードを盤面のマスに置くとき、手札や山札からマスの真上へすーっと滑り、上空で止まってストンと落ちて配置され、着地の瞬間にカードの周りに風・ホコリがふわっと舞う演出を追加しました。逆に、マスのカードが手札へ入るときも持ち上がって滑り込む演出になります。手で置く時（ドラッグ＆ドロップ）だけでなく、合同建設・増殖する樹々・ジャンプ台などのカード効果で置かれる時や、CPUが置く時も対象です（動作を軽くしたい時はオプションの「アニメーションを減らす」でオフにできます）。",
      "CPU戦（1人用の練習相手）が賢くなりました。標準の強さを「中級」にして、行き当たりばったりではなく盤面を見て打つようになります（移動先の選び方・効果の使いどころ・色の宣言などを考えて選びます）。もっと弱く／強くしたい時は、CPU戦の開始画面や基本設定で「新人（ランダム）〜最強（伏せカードののぞき見あり）」を選べます。",
      "ホーム画面に追加して、アプリのように起動できるようになりました（PWA）。ブラウザのメニューから「ホーム画面に追加／インストール」を選ぶと、タブやアドレスバーの無い全画面で遊べます。",
      "iPhone・iPadでは、ホーム画面に追加しておくと、アプリを閉じていてもランク戦のマッチ成立などの通知が届くようになります（Safariのタブのままだと閉じている間は届きません）。",
      "【ランク戦】対局結果のランクバッジに、湯気のような幻想的なオーラと、表面の光沢の演出を加えました。",
      "マイページを開いたまま「ヘルプ」「ランキング」を押すと開かないことがある不具合を修正しました。",
    ],
  },
  {
    date: "2026-08-17",
    items: [
      "スマホで別のアプリ／画面を開いている間は、BGM・効果音が鳴らないようにしました。iPhoneのマナーモード（サイレントスイッチ）もできるだけ尊重して消音します。画面に戻ると、鳴っていたBGMが再開します。",
      "【ランク戦】3〜4人のランク戦に対応しました。マッチメイク（自動で相手を探す）は、まず2人集まったら対戦を組み、そこから約20秒のあいだ3人目・4人目の参加を待ってから対戦を確定します（人数がなかなか揃わなくてもすぐ遊べて、集まれば自然に3〜4人戦になります）。合言葉フレンド戦でも、部屋に2〜4人集まれば開始できます。順位は「7色ロックの勝者=1位、以降はロックできていた色の数が多い順」で決まり、人数に応じたポイント表でレートに反映されます。",
      "【ランク戦】別のタブやアプリを見ている時でも、対戦相手が見つかった時・待機中の相手が現れた時にブラウザ通知とタブのアイコン（ファビコン）点滅で気づけるようにしました（特にキュー待ち中に別タブへ移っていても、マッチのレディチェックを見逃しにくくなります）。通知の許可を求める前に「何のための通知か」をアプリ内で説明するようにしました（いきなりブラウザの許可ダイアログが出て戸惑わないように）。",
      "【ランク戦】合言葉（部屋コード）で友達とランク戦ができるようになりました。部屋を作る時に「🏆 ランク戦にする」にチェックすると、結果がちゃんとレートに反映される2人対戦の私的な部屋になります（部屋コードを相手に共有し、「🔑 部屋コードで参加」から入ってもらいます）。",
      "【ランク戦】ランク戦のルールを統一しました：ターンタイマー・マイデッキ戦・白黒（無色）カードあり・ブーストモードの4つを常にON固定にします（マッチメイク／合言葉フレンド戦とも共通）。",
      "【ランク戦】対戦相手を探している待機中に、CPUと練習できるようになりました（マッチが成立したら自動で中断して対人戦に呼び戻します。CPU戦はレートに影響しません）。",
      "【ランク戦】シーズン（毎月）終了時に、その月の到達ランクに応じて通貨がもらえるようになりました。新しい月に初めてログインした時に「先月の報酬」として受け取れます。",
      "新しいペット「モリラ」「ポヨン」を追加しました（ショップで購入でき、タイトル画面のお散歩にも登場します）。",
      "2D表示モードでペットが見えない（一瞬たまに見える）不具合を修正しました。",
      "【ランク戦】対局終了後の結果画面で、七色ゲージの宝石を1個ずつゆっくり点灯（勝ち）／消灯（負け）させる演出にしました。昇格した時は、旧ランクのゲージが完成→称号が変わる→新ランクのゲージへ余りが持ち越される、という流れで見せます。",
      "【ランク戦】ホーム画面・マイページのランク表示をクリックすると「ランク戦について」の説明（段位・七色ゲージ・ポイント・シーズン・対戦相手の見つけ方）が開くようにしました。ヘルプの索引にも「🏆 ランク戦について」を追加しました。",
      "【ランク戦】ランク戦は自動処理モード・ターンタイマーが常にON固定です（不正・放置対策）。",
      "【ランク戦】対戦相手が待機に現れたら通知を受け取る設定（オプション）を追加し、ホーム画面のランク戦メニューに現在の待機人数を表示するようにしました（プレイ人口が少ないうち向け。通知の時間帯も設定できます）。",
      "【管理者向け】スモークテスト（CPU同士の自己対戦点検）に「不変条件チェック」を追加しました。対戦が止まらなくても、状態が壊れていないか（トークンの重複・同じマスに駒が2つ・カード総数の増減・ロックの色不一致など）を毎手番点検し、異常があれば診断ログに記録してFAIL扱いにします。人間対戦のバグ発見の負担軽減が狙いです。",
    ],
  },
  {
    date: "2026-08-14",
    items: [
      "ザ・ギャンブルの公開演出を改善しました（#95）。公開するカードを、公開エリアに出す前に画面中央のじらしフリップで全員に見せ、フリップ演出が全部終わってから公開エリアにまとめて並べるようにしました（以前は公開エリアに先に表向きで置かれてしまっていました）。",
      "ザ・ギャンブルの「1枚ずつ公開する／全部公開する」モーダルが、オンライン対戦で到達効果が二重発火して二重に出たり閉じなくなったりする不具合を修正しました（#96）。",
      "カウンターロックで相手の接触を無効化した時、その旨を全員にカード画像付きモーダルで知らせるようにしました（#90）。",
      "「もう一度遊ぶ／もう一度戦う」を押した“その瞬間”に勝利BGMが止まるようにしました（#88。以前は再戦のセットアップが終わるまで鳴り続けていました）。",
      "2D／3D切替の説明モーダルが実質2回出てしまっていたのを、1つに統合しました（#89）。",
      "タイトル画面の「🤖 CPU戦（1人用）」ボタンを撤去しました。CPU戦はログイン後のホーム画面「CPUマッチ＆フレンドリーマッチ」から始められます。",
      "ローカルCPU戦などで、接触の解決後にまれに進行が止まってしまう不具合を修正しました（接触後に優先権が手番プレイヤーへ戻らないケース。閉じる人がいない結果モーダルを短時間で自動的に閉じるようにしました）。",
      "盤面が固まって（手札が全部グレー表示・スキップボタンが押せない）進めなくなった時、しばらくすると自動で操作可能な状態へ復帰する安全装置を追加しました（#93。原因の切り分け用に、どこで固まったかの記録も残します）。",
      "【管理者向け】タイトル画面の右下（管理者ログイン時のみ）に、CPU同士の自己対戦を自動で回してエラー・盤面破損・詰みを点検する「🧪 スモークテスト」ボタンを新設しました。ウィンドウはドラッグで移動でき、位置・サイズは管理者モードの「📐 位置合わせ」で調整できます。",
    ],
  },
  {
    date: "2026-08-08",
    items: [
      "盤面拡大でミニロックエリア（画面下中央の縮小ロック＋ミニ手札公開エリア）が出ている間は、自分の通常の手札公開エリアを非表示にしました（重複を解消）。",
      "無意味なループ（例：2マス離れたジャンプ台の永久往復）を、ルール通り正しく防ぐようにしました（#49）。移動連鎖で既に通ったマスへ戻る「ループ先」は、CPUは選ばず別の手を採り、人間はそのマスをクリックすると警告が出て選べません。行き先が実質無い場合は直前に着地したマスに正しく留まります（以前の暫定対応の“途中で打ち切り”を廃止）。",
      "不具合報告に対局コンテキスト（オンライン/ローカル/CPU戦の別、各座席・手番・自席がCPU代行中か）を添付するようにしました（#48のご提案。状況の切り分け用）。",
      "試練の儀式で、オンライン対戦時に到達効果が二重発火して儀式が二重に走り、色選択モーダルが選択しても閉じない等の異常になる不具合を修正しました（#46。儀式に再入ガードを追加し、同時に2つ走らないようにしました。#47の合同建設まわりの異常もこの二重処理が原因の可能性が高く、あわせて改善が見込まれます）。",
      "対戦後のコメントが戦績システムに反映されない不具合をさらに強化修正しました（#45）。敗者はコメントを勝者へも中継し、勝者（試合IDを確実に保持）が代理投稿する経路を追加。あわせて敗者本人の直接投稿も試みます（返信IDを試合×プレイヤーで一意にしたため二重投稿にはなりません）。",
      "【CPU代行】AFKでCPU代行中のプレイヤーが、ゴメンナサイ／カウンターロックなどのリアクション判断でも止まらないようにしました（CPU戦と同じ挙動。相手の最後のロードにはゴメンナサイで自動対応、接触にはカウンターロックを使わず自動承認）。",
      "【新機能】タイマーが連続で規定回数タイムアップしたプレイヤーを、自動的にCPU操作へ切り替えるようにしました（放置対策）。切り替わった本人には画面下に「🤖 CPUに切替中です／復帰する」バナーが出て、押せばすぐ操作に戻れます（手動操作すればカウントはリセット）。相手側にはそのプレイヤー名に「🤖CPU操作中」が表示されます。切り替えまでの回数と代行CPUの強さは、基本設定内（管理者のみ表示）で調整できます。",
      "スリカエで相手の手札を奪う時、中央の受け取りモーダルのカード画像が「null」になってしまう不具合を修正しました（#43/#44。オンラインでは相手の手札の中身が隠れているため、先に自分の手札へ移してから中身を表示するようにしました）。",
      "ザ・ギャンブルの公開カードの中央じらしフリップ演出も、オンライン対戦で全プレイヤーに配信するようにしました（試練・マスチェンジと同様。公開カードのため全員が同じ演出を見られます）。",
      "マスチェンジの入れ替え電撃演出が、オンライン対戦で相手の画面に出ていなかった不具合を修正しました（#43。演出が実行者本人の画面だけのローカル再生だったため、相手クライアントにも配信して同じアークが見えるようにしました）。",
      "対戦後のコメントが戦績システムに反映されないことがある不具合を修正しました（#42）。敗者側は勝者からの試合ID通知（Realtime）を取りこぼすとコメントが黙って捨てられていたため、通知を受け取れなかった場合は直近の試合を直接検索してコメントを紐づけるフォールバックを追加しました。",
      "試練の儀式で踏んだカードの中央じらしフリップ演出を、オンライン対戦では全プレイヤーに配信するようにしました（踏んだカードは公開情報のため、実行者だけでなく全員が同じ演出を見られます）。",
      "スマホの縦持ち時に出る「端末を横向きにしてください」の案内を、画面全体に大きく表示するようにしました（アイコン・文字を画面サイズに追従して拡大）。",
      "接触の結果モーダルが閉じる前に次のターンが始まってしまう不具合を修正しました（#40）。結果モーダルが閉じるまで自動ターン終了を止め、通常は数秒で自動的にも閉じるようにしました（CPU戦では自動で閉じず、クリックするまで結果を確認できます）。",
      "試練の儀式のじらしフリップを、オンライン対戦でもローカルと同じように（盤面は伏せたまま、中央で1枚ずつじらしフリップ→その後に盤面を表向き）体験できるようにしました（サーバーが引いたカードの中身を引いた本人だけに返す方式。※サーバー側の再デプロイ後に有効。未デプロイの間は従来どおり先に表向きになりますが正常動作します）。",
      "ライトモード時、ログインボーナスのモーダルがダークのままだった不具合を修正しました（アイボリー地＋ゴールド枠＋濃い文字に）。",
      "オンライン対戦で試練の儀式が不発（カードがめくられず、駒も動かず「残念でした」で終了）になっていた不具合を修正しました（#41。伏せて置いたカードの中身がオンラインでは読めず色判定に失敗していたため、読めない場合は先に表向きにして判定するようにしました）。",
      "【CPU強化】スリカエ（手品師の技）でCPUが相手に渡すカードを賢く選ぶようにしました。自分がまだ要る色・相手がまだ要る色・貴重札はなるべく渡さず、双方ロック済みで無害な色を優先して渡します。",
      "【CPU強化】合同建設でCPUが置く場所を賢くしました。相手ゲート（＝空きなら侵攻の足場作り、近い空きマスなら侵攻ルートの前進）へ山札から置き、自分のゲート（空なら着地不能で既に安全）には置かないようにしました。",
      "マスチェンジの入れ替え演出の電撃を、鋭い実線から「ぼやけた湯気のようなオーラの電撃」に変更しました（外側に広くぼかしたオーラ層を追加し、芯も柔らかくにじませ、明滅を少しゆっくりに）。",
      "【CPU強化】自ゲート防衛を「乗られてから」ではなく「乗られる前」に行うよう修正しました。相手駒が自分のゲートに接近したら、CPUが自駒で自ゲートを占有し、相手が着地（＝ゲート侵攻）できないようブロックします。",
      "【CPU強化】CPUの移動が相手ゲートへ直行しやすくなりました（不具合#38対応。ゲートへの近づき度の重みを大きくし、途中のカード拾いより侵攻ルートの前進を優先）。",
      "【CPU強化】CPUの接触判断をカウンターロックの所持と連動させました。カウンターロックを持っていない時はむやみに相手の隣へ行かず（接触を狙わない・隣接に留まらない）、持っている時は積極的に接触を狙います。自分のゲートに乗った侵入者への体当たり（防衛）は常に行います。",
      "【CPU強化】パーティの「2枚オープン」で開けるマスを、無関係な場所ではなく相手ゲートに近いマス（＝侵攻ルートの偵察）から選ぶようにしました（不具合#39対応）。",
      "【CPU強化】CPU戦で、あなたが最後の7色目のロックを宣言した時、CPU（中級以上）がゴメンナサイ（＋追色コスト）を持っていれば自動で発動し、あなたのロックを1枚奪って勝利を阻止するようになりました。以前はCPUがゴメンナサイを一切使ってこず、承認欄の操作も人間側に見えてしまっていました（今はCPUの承認中は「CPUの承認を待っています…」表示になります）。",
      "ゲート侵攻で自分のゲートのカードを全て回収する時、何を回収したのかを回収した本人の画面だけに画面中央で大きく1枚ずつ表示するようにしました（表向き・裏向き問わず。裏向きだった分の中身も自分だけが確認できます）。",
      "【CPU強化】CPU（中級以上）が、収穫と種まき等で場のカードを拾う時、①相手ゲート ②相手の侵攻経路上のカード（拾って踏み台を潰し、自ゲートを守る）③場のジャンプ台（道具として積極的に確保）④まだ要る色、の順で狙うようになりました。",
      "【CPU強化】CPU（中級以上）が、効果でマスを選ぶ時（収穫と種まき等の拾う先など）に、相手ゲートに乗れるマス＞まだ揃っていない色の表向きカードがあるマス＞その他、の順で選ぶようになりました。また、スラム上がりの役人の手札効果は手札が少ない時だけ使う（多い時は不発になるので使わない）等、状況に応じて手札効果を使うようになりました。",
      "【CPU強化】CPUの移動がフラフラして意味不明だったのを、目的を持って動くようにしました。相手ゲートへ近づく（ゲート侵攻を狙う）、相手の駒へ近づく（接触を狙う）、自分のゲートに乗った相手には接触で追い返す（自ゲート防衛）を評価して移動先を選びます。",
      "効果お知らせの主語を総点検し、ザ・ギャンブルの成功（CONGRATULATIONS!）・試練の儀式の「〇回成功！」・ディメンションの一気移動など、相手が発動した時に自分の画面で「自分の結果」に見えてしまう文言に発動者名を添えました。",
      "試練の儀式で、置いたカードを盤面では裏向きのままにし、画面中央のじらしフリップで初めて公開するようにしました（以前は盤面のカードが先に表になっていてドキドキ感がありませんでした）。中央で公開した後に盤面のカードも表向きになります。",
      "【CPU強化】CPU（中級以上）が、コスト支払いや場に置くカード・捨てるカードを選ぶ時、要らないカード（既にロック済みの色など）を優先して手放し、まだ要る色や強い札（ゴメンナサイ・なないろの欠片・ファースト/エターナル）は残すようになりました。",
      "【CPU強化】最強のCPUは、相手の手札を奪う時（スリカエ・接触・ゲート侵攻）に中身をのぞき見して、一番価値の高い札（自分がまだ要る色・相手の強いリアクション札）を狙って奪うようになりました（中級・上級は従来通り無作為＝相手の手札は見えないため）。",
      "カウンターロックの到達効果のお知らせを「あなたは１番少なくロックしているので…」→「（発動者名）は１番少なくロックしているので…」に変更しました。相手が発動した時に自分の画面で「あなた」と出ていたのを、発動したプレイヤー名で表示します。",
      "【CPU強化】CPU（中級以上）が、ハンドフェイズで手札効果を能動的に使うようになりました（第一歩として、明確に得で安全な「収穫と種まき」「増殖する樹々」のみ。ザ・ギャンブルのようなリスクのある効果は使いません）。以前はハンドフェイズを丸ごとスキップしていました。",
      "捨てる／奪うロックカードを選ぶ時（選べる罠のロック捨て・ゴメンナサイの奪取など）、盤面を拡大してロックエリアが画面外の場合でも、ミニロックエリアの光っているスロットから選べるようにしました。",
      "セレスティア（青のキューブ）で相手の手札を選んだ時の中央モーダルを「奪った」→「捨てさせた」に変更しました（セレスティアは相手に捨てさせる効果で、自分の手札には加わらないため）。",
      "マスチェンジの入れ替え演出の電撃を橙色に変え、線をもっと太くしました。",
      "【CPU強化】CPU（中級以上）がゲート侵攻をより狙うようにしました。効果のマス選択で相手ゲートに乗れるならそこを選び、パーティーで1マス移動して相手ゲートに乗れるなら「移動」を優先、選べる罠では相手ゲートに乗って侵攻できる時に「自ゲートへ強制移動」を避けます。",
      "【CPU強化】CPU（中級以上）が、効果の選択肢を賢く選ぶようにしました。パーティーでは「場のカードを手札に得る」を優先し、選べる罠では被害の一番小さい選択肢（ロックを捨てる＝色が減る最悪手を避ける）を選びます（新人は従来通りランダム）。",
      "管理者モードのBGM「▶ 試聴」ボタンを、試聴中は「⏹ 停止」に切り替わるトグルにしました（もう一度押すと止まります）。スライダーは試聴中の音量をその場で反映します。",
      "スタートプレイヤー決定モーダルを、モーダルのどこかをクリックすると閉じられるようにしました（✕を押さなくてもOK。背景クリックは従来通り盤面へ素通しします）。",
      "試練の儀式も、移動先を選んで駒が進んだ後に一拍おいてから、踏んだカードを画面中央で“じらしフリップ”で公開するようにしました（ザ・ギャンブルと同じ演出）。",
      "勝利時BGMの既定音量を40%にしました（管理者モードで変更可）。",
      "接触で相手の手札を奪う時、「奪った」モーダルが出るその瞬間に、実際にそのカードが自分の手札へ加わるようにしました（以前は接触の一連の処理がすべて終わった後に加わっていました）。「奪った」モーダルは閉じる（クリック）まで次の処理へ進みません（タイムアップ時は自動で進みます）。",
      "【不具合#36】「ゴメンナサイを使う」を押した後、承認バナーが「ロックエリアから奪うカードを選んでください」の案内に切り替わるようにしました（承認/ゴメンナサイのボタンは引っ込みます）。",
      "管理者モードの各BGM音量スライダー（勝利時・オープニング・ゲーム時・待機中）に「▶ 試聴」ボタンを追加しました。スライダーを動かさなくても現在の音量で鳴らして確認できます（今後BGMが増えても同じ形で追加します）。",
      "マスチェンジで駒が入れ替わる時に、両方の駒が発光し、不安定な電撃のような光で結ばれて位置が入れ替わる演出を追加しました。",
      "マスチェンジの入れ替えと到達効果のルールを整備しました。入れ替えは「移動」ではないので裏向きカードは開きませんが、入れ替わり先に表向きのカードがあれば到達効果が発動します（発動者・相手ともそれぞれの入れ替わり先について）。到達効果で使った場合、相手が入れ替わった先＝マスチェンジ自身は再発動せず、マスチェンジが手札に加わって下の表向きカードが露出すればそれが相手の到達効果になります。両者の入れ替わり先に表向きカードがあれば同時発動で、処理順は発動者から時計回りです（カードの補足とQ&Aにも追記しました）。",
      "行動ログウィンドウの右上に✕（閉じる）ボタンを追加しました（📜アイコンだけでなくウィンドウ自身からも閉じられます）。",
      "【CPU強化】CPU（中級以上）が、ザ・ギャンブル・試練の儀式で色を賢く宣言するようにしました。ザ・ギャンブルでは手札を捨てないよう「出にくい色」を、試練の儀式では続きやすいよう「出やすい色」を、見えているカードから各色の残り枚数を推定して選びます。最強はさらに山札の一番上をのぞき見して、試練は当たる色、ギャンブルは引かれない色を狙います（新人は従来通りランダム）。",
      "ザ・ギャンブルの公開を、公開エリアだけでなく画面中央に大きく“じらしてフリップ”で1枚ずつ見せるようにしました（エターナル獲得と同じ正方形フリップ）。",
      "ザ・ギャンブル・試練の儀式の最中に、心臓の鼓動の効果音（合成音）を鳴らして緊張感を出すようにしました（結果が出たら止まります）。",
      "到達カードモーダルに「📌 キープ」ボタンを追加しました。押すとそのカードはターンを跨いでも消えず、✕で閉じるまで残ります（あとでゆっくり読みたい時用。複数キープすると左上に少しずつずらして重なります）。",
      "パーティで選択肢を選んでから移動先などのマスがハイライトされるまでの間が長かったのを、「○○を選択しました」の告知中にすぐハイライトされるようにしました。",
      "試練の儀式で、色を宣言してから実際にカードを置いて捲るまでに“ため”（少し間＋鼓動）を作り、CPUの進行が早すぎて追えなかったのを見やすくしました。",
    ],
  },
  {
    date: "2026-08-07",
    items: [
      "ザ・ギャンブルで宣言した色が出ずに手札を守れた時に、紙吹雪＋大きな「CONGRATULATIONS!」のお祝い演出を追加しました。",
      "試練の儀式は必ず最後はハズレで終わるため、最後に「〇回成功！」（当たった回数）を紙吹雪でお祝い表示するようにしました（途中の「おめでとう」モーダルはなくし、踏んだカードの中央表示＋最後のまとめ演出に整理しました）。",
      "カード拡大表示（PCはホバー、スマホ/タブレットは長押し）を、指やカーソルの右に出すか左に出すかをオプションの「基本設定」→「カード拡大を出す向き」で選べるようにしました（既定は右）。",
      "初回起動時の「サウンドと表示の設定」モーダルを、①サウンド（BGM/効果音）②表示（カード拡大サイズ）の2ステップに分け、スクロール不要にしました。",
      "ゲート侵攻でエターナルを獲得する演出で、フリップするタイミングでカードの上下が見切れる不具合を修正しました（カード画像は正方形なのに、直前の修正で表示枠を横長のエターナル束の比率に合わせてしまい上下が切れていました。表示枠を正方形に戻し、飛翔から中央表示への受け渡しも継ぎ目なく保ちました）。",
      "合同建設で、置くプレイヤーの手札が無い時は「山札から／手札から」の選択を出さず、自動で山札から１枚置き、「手札がないため山札から置きました」と全員に周知するようにしました（手札が無いのに選択を求められる無駄をなくしました）。",
      "【不具合#35】CPU戦で、CPUが収穫と種まき等で獲得したカードが、右下のカード獲得トーストに「あなたが獲得」として中身ごと表示され、CPUの手札がバレてしまう不具合を修正しました（取得したのが自分の時だけトースト＆手札の発光を出すようにしました。CPUの取得は伏せたままです）。",
      "【不具合#34】相手の近くで出る「🤝 接触する」ボタンの左端しか反応せず、真ん中を押しても何も起きない不具合を修正しました（フローティングUI一式を載せる層の中の、盤面上部にある相手プレイヤーのステータス表示が接触ボタンより手前に来てクリックを奪っていたのが原因。接触ボタンを最前面へ出しました）。",
      "ミニロックエリアの位置調整で、相手（上部）の既定の上からの位置を調整しました（実機での見やすさに合わせて 0.5rem → 2.2rem）。",
      "【不具合#33】自分がゴメンナサイッ！を使った時、奪うロックカードが自動で選ばれてしまう不具合を修正しました。相手（CPU等）のターン中に自分がリアクションでゴメンナサイを使うと、選択の主体が自分なのにCPUの選択と誤判定され、CPUの自動処理が勝手に1枚選んでいたのが原因です。自分が使うリアクションの選択は自分で選べるようにしました（同種の『あなたのターン以外に使う手札効果』全般に効きます）。",
      "到達したカードを手札に獲得した時、右下のカード獲得トースト（何を獲得したか）が出ないことがある不具合を修正しました（自動処理で到達効果を処理した場合に通知が漏れていました。手動で「手札に加える」した時と同じ通知を出します）。",
      "【不具合#32】ゲート侵攻で相手の手札を全部奪ってしまう（本来は半分）不具合を修正しました。攻撃側が人間で「奪う札を選ぶ」のに時間がかかると、内部の多重実行防止ガードの安全タイマー（60秒）が切れてしまい、その隙に自動ターン終了が再発火してゲート侵攻が二重に走り、手札を全部奪う・エターナルも複数回獲得していたのが原因です。侵攻処理中は自動ターン終了を止め、二重起動もしないようにしました。",
      "【CPU戦】CPUの強さを選べるようにしました（オプション →「CPU戦（1人用）」→「CPUの強さ」）。新人＝これまで通り完全ランダム。中級＝移動先を評価して選びます（相手ゲートに乗って侵攻を狙う／選べる罠・ザ・ギャンブル等の自滅マスを避ける／まだ揃っていない色を優先）。上級＝さらに相手の進行度を見て、進んでいる相手には接触（体当たり）で妨害します。最強＝上級に加えて伏せカードの中身ものぞき見して最善手を選びます。",
      "ゲート侵攻でエターナルを獲得する演出について、①画面中央で止まった後に少し“きゅっ”と拡大してからフリップしていたのを、継ぎ目なく（拡大せず）フリップするようにしました。②スマホでフリップしても表にならず裏向きのままになる不具合を修正しました（一部端末で効かない3D回転をやめ、全端末で確実に表になる方式に変更）。",
      "ミニロックエリア（拡大時の表示）に「ミニ手札公開エリア」を追加しました。公開ドロー（表向きに引いたカード）を、各プレイヤーのミニロック行の左隣に左揃えで表示します（自分・相手とも）。",
      "ミニロックエリアの位置調整で、相手（上部）の横方向のずれを自分（下部）とは別に調整できるようにしました（管理者モード →「ミニロックエリアの位置」→「相手：横方向のずれ」）。",
      "行動ログ（📜）に、移動して到達した効果が記録されないことがある不具合を修正しました（内部の処理深度の都合で、移動由来の到達がほとんど記録から漏れていました）。連鎖した到達効果も記録されるようになります。",
      "スリカエで、カードの「受け取った／渡した」モーダルのタイトルが逆になることがある不具合を修正しました（CPUがあなたにスリカエした時など。今は常に“あなた（この画面）視点”で、受け取ったカードは「受け取った」、渡した（奪われた）カードは「渡した／奪われた」と表示します）。",
      "ミニロックエリアを改良しました。相手プレイヤーのミニロックエリアは画面最上部に表示するようにし、名前の隣は「N/7」ではなく手札枚数を表示するようにしました。自分のミニロックエリアの右隣にはミニ捨て場（一番上のカードと枚数）を追加しました（位置は管理者モードで調整可）。",
      "【CPU戦】CPUが選ぶ番の選択モーダルを総点検し、色宣言（ザ・ギャンブル/試練の儀式）・選択肢（パーティ等）・奪う札の選択・「どこから置きますか？」・接触の承認・任意のはい/いいえなど、CPUの選択モーダルを人間の画面に出さないようにしました（自動で選ばれます）。「何を選んだか」の結果表示は従来通り出ます。",
      "ミニロックエリア（拡大時の下部表示）に、相手プレイヤーのロック状況も表示するようにしました（相手→自分の順で、自分が一番下。相手がどの色をあと何色でロックし切るか一目で分かります）。",
      "【CPU戦】CPUがパーティ・合同建設などの「マスを選ぶ」効果の途中で止まってしまう不具合を修正しました（選んだ結果の通知を出している一瞬に、CPUの優先権が誤って自分へ戻り、続くCPUの選択が誰にも自動処理されず固まっていたのが原因。#31）。",
      "【CPU戦】CPUが選ぶ番の「○○を選択してください」等の案内・候補ハイライトを、人間の画面に出さないようにしました（自分が選ぶのかと紛らわしいため）。CPUの選択は自動で行われ、「何を選んだか」の結果モーダルは従来通り表示します。",
      "「自分の手札を画面下に固定する」ON時の手札トレイについて、スマホ専用の位置・全体サイズ・回転を管理者モードで調整できるようにしました。",
      "ミニロックエリア（拡大時の下部表示）に並ぶファーストカード・エターナルカードを、クリックでそのまま使えるようにしました（実ロックエリアと同じ使用フロー。使えるカードは光ります）。",
      "試練の儀式で「何を踏んだか（置いて移動したカード）」を、その都度画面中央に大きく表示するようにしました。",
      "ゲート侵攻で相手から複数枚奪う時、1枚選ぶごとに実際に自分の手札へ加える（手札が1枚ずつ増える）ようにしました（以前はまとめて最後に加わっていました）。",
      "「自分の手札を画面下に固定する」ON時の手札トレイ（手札＋公開エリア）の位置・全体サイズを、管理者モードの「表示位置」で調整できるようにしました。",
      "駒スキンの新デザイン（0thリメイク）を追加し、これを標準（デフォルト）の駒スキンにしました。旧「基本」スキンは「紋様」に名前を変更しました（駒スキン選択・ショップに反映）。※以前の駒が表示され続ける場合は、一度 Ctrl+Shift+R で強制再読み込みしてください（ブラウザの画像キャッシュ対策）。",
      "アバターの初期設定（デフォルト）を「記憶を失った青年」にしました（ゲーム開始前は灰色、開始後は自分のファーストカードの色になります）。",
      "ミニロックエリア（拡大時に出る下部表示）の位置を画面最下部に変更しました。念のため、管理者モードの「表示位置」に位置調整（下からの位置・横ずれ・手札固定ON時の位置）を追加しました。",
      "盤面を拡大した状態でゲート侵攻のエターナル獲得演出が入ると、フリップするエターナルが画面からはみ出す不具合を修正しました（表示サイズを盤面ズームに引きずられず、常に画面内に収まるようにしました）。",
      "盤面を拡大して自分のロックエリアが画面外に出た時、画面下中央に「ミニロックエリア」（7色スロットのロック状況＝勝利まであと何色か）を自動表示するようにしました。ロックエリアが半分以上見えていれば出ません。",
      "オプションの「基本設定」に『自分の手札を画面下に固定する』を追加しました（既定OFF）。ONにすると、マウスホイールで盤面を拡大しても自分の手札が見切れず、画面下に一定サイズ・一定位置の手札トレイとして固定表示されます（ステータスエリアと同じく盤面ズームの外側に出すため、見た目は平らな手札トレイになります）。",
      "スリカエ・ゲート侵攻・接触などで相手の手札からカードを奪った（受け取った）時、何のカードを取ったのかを画面中央に大きく表示するようにしました（奪う側は裏向きしか見ていないため。ゲート侵攻で複数枚奪う時は1枚ずつ順番に表示）。",
      "プレゼントの到達効果（1番少なくロックしている人がドロー）で、誰がドロー対象なのかを画面中央にアバターで並べて周知するようにしました。",
      "セレナーデの手札効果でロックする時、ロック先が1つに決まっているカード（通常の色カード）では「ロックする場所を選択してください」のモーダルを出さず、自動でそこへロックするようにしました（七色の欠片のように複数の色スロットに置ける場合だけ選択モーダルを出します）。",
      "スリカエ（手品師の技）で相手にカードを渡した時、渡した側の画面に「受け取った」と出て『渡したのに自分が受け取った？』と誤解する問題を修正しました。渡した側には「渡した」と、相手に渡したカードを表示するようにしました。",
      "【CPU戦】画面右上の「🎲 セットアップ」ウィザードのボタン／パネルを、CPU戦の間は表示しないようにしました（1人用では使わないため）。",
      "【CPU戦】ゲーム開始時に、通常対戦と同じセットアップ演出（ファーストカードの配布→盤面へのカード配置アニメ）を見せるようにしました（以前は演出が裏で終わってしまい見えませんでした。開始時に一瞬4人が座って見える問題は引き続き出ません）。",
      "【CPU戦】「CPUの結果通知を自動で進める」（旧・CPUのモーダルを自動で進める）をOFFにした時の挙動を変えました。CPUが“選ぶ”モーダル（パーティの選択肢・色宣言など）は自動で進め、その“結果”を知らせる通知モーダルだけをクリックするまで表示するようにしました（自分が選ぶのかと錯覚してしまう問題の解消。じっくり結果を読めます）。",
      "【CPU戦】自分のターンなのに「画面をクリックしてCPUの手を進める」の案内が出たままになる不具合を修正しました（CPUが選択待ちの間だけ出るようにしました）。パーティ等の『全員が選ぶ』効果で、あなた自身の選択中にこの案内が残って紛らわしかったのも解消しています（#29 / #30）。",
      "【CPU戦】CPUの選択モーダル（パーティの選択肢など）のボタンを、あなたが代わりに押せてしまう不具合を修正しました。CPUの選択はCPU自身が行い、あなたはCPUのモーダルを操作できません（自動スキップONなら自動で、OFFならクリックで1手ずつ進みます）。",
      "【CPU戦】CPUがロックした後、ハンドフェイズへ食い気味に進んでしまう問題を調整しました。CPUの速さ設定（特に「ゆっくり」）に合わせて、フェイズの切り替えにも間を取るようにしました。",
      "プレゼントの手札効果（相手を選んでその隣に自分を置く）で、選べる相手が1人しかいない場合は自動でその相手を選び、その旨をモーダルで知らせるようにしました（スリカエ・マスチェンジ等と同じ挙動に統一。相手の駒を動かす同種の効果もあわせて対応）。",
    ],
  },
  {
    date: "2026-08-06",
    items: [
      "【CPU戦】CPUに勝利すると、勝利モーダルに続いてコイン獲得の演出が出て、毎回20コインもらえるようにしました（ログイン時のみ。コインはアカウントに紐づくため、未ログインだと獲得できません）。",
      "【CPU戦】オプションの「CPU戦（1人用）」に『CPUのモーダルを自動で進める』のON/OFFを追加しました。OFFにすると、CPUの効果モーダル（ザ・ギャンブル等）は自動で進まず、画面をどこでもクリックするたびに1手ずつ進みます（じっくり読みたい方向け。待機中は画面下に案内が出ます）。移動やロックはこれまで通り自動です。",
      "【CPU戦】オプションの「基本設定」に🤖CPU戦（1人用）の項目を追加し、CPUの速さを「ゆっくり／普通／早い」から選べるようにしました（CPUの行動が速すぎてザ・ギャンブル等のモーダルが読み取れない、という声への対応です。選ぶと次のCPUの手から効きます）。",
      "「新しいバージョンがあります」の更新通知バナーを、CPU戦の最中でも出すようにしました（以前は「対局中は出さない」対象にCPU戦も含まれており、CPU戦を続けていると新版に気づけず古い版のまま遊び続けてしまう状態でした）。",
      "オンライン対戦のゲート侵攻（手札を奪う時）で、「奪う札を選ぶ」モーダルが何重にも開いて閉じない・背景がだんだん暗くなる・「手札をシャッフル」が点滅する・ターンが勝手に何度も進む、という不具合を修正しました（ターン終了処理が奪う札の選択中に多重に走っていたのが原因）。「ゲート侵攻成功！」の告知が奪うモーダルより先に出るのもあわせて安定します。",
      "🤖 CPU戦（1人用・ベータ）を追加しました。タイトル画面の「CPU戦」ボタンから、ログイン不要であなた対CPUの対戦をこの端末だけで遊べます。CPUの手はまだランダムです（今後かしこくしていきます）。",
      "【CPU戦】ゲーム開始後にターンチェンジが延々と繰り返され、プレイできなくなる不具合を修正しました（ターンの区切りでフェイズがリセットされず、毎ターン即終了していたのが原因）。CPUの番が止まる・自分の番が始まらない症状もあわせて解消しています。",
      "【CPU戦】CPUがカードに到達しても到達効果が発動しない不具合を修正しました（到達効果の自動処理が自分の席の到達にしか働いておらず、CPU側の到達で素通りしていたのが原因）。",
      "【CPU戦】ゲート侵攻時に「OK」を何度も押させられる・背景がだんだん真っ暗になる・エターナル演出が何度も起きる不具合を修正しました（ローカルのゲート侵攻処理中に自動ターン終了が多重に走っていたのが原因。#20のオンライン版と同種の問題）。",
      "【CPU戦】パーティ・合同建設・スラム上がりの役人など「全員がそれぞれ選ぶ」効果で、CPUの選択まであなたが代行させられていた不具合を修正しました（CPUの選択はCPUが自動で行います）。",
      "【CPU戦】逆に、CPUの番にパーティ・スラム上がりの役人などであなたの選択（残す札・捨てる札）まで勝手に自動で選ばれてしまう不具合を修正しました（あなたの選択はあなたが選べます）。",
      "【CPU戦】開始時に一瞬4人が座った盤面が見える問題を直しました（2人対戦のセットアップが終わってから盤面を表示します）。また、CPU戦では基本時間・タイマーの表示を出さないようにしました（CPUを自動で動かすため内部的には使いますが、画面には出しません）。",
      "捨て札の山をダブルタップ（ダブルクリック）すると、捨て札の一覧を確認できるようにしました（右クリックの無いタブレット/スマホでも見られます）。",
      "初回起動時の設定モーダルに「効果音の音量」と「カード拡大表示のサイズ」の調整を追加しました（試聴・プレビュー付き。文字が読みやすいサイズにご調整ください）。いずれもあとからオプションの「基本設定」で再調整でき、カード拡大サイズは次回以降も保持されます。",
      "ヴァーディアンなどの「公開ドロー」で加えたカードが、ステータスエリアの手札枚数に反映されない不具合を修正しました。",
      "ゲート侵攻の表示順を整えました（「ゲート侵攻成功！」の告知を、奪う札を選ぶ画面や手札を奪う演出より先に表示するようにしました）。",
      "ゲート侵攻のエターナル獲得演出で、獲得エターナルが演出前からロックエリアに見えて直前に急に消える／フリップしたエターナルが画面左上へ飛んでいってしまう、不具合を修正しました。",
      "新しいペット「キィ」を追加しました（画像アニメ・4方向×モーション。ショップで購入でき、タイトル画面のお散歩にも登場します）。",
      "スマホ／タブレットで、アプリを開いている間は画面が自動で暗くならない・ロックされないようにしました（対応ブラウザのみ）。",
      "BGMの既定音量を調整しました（オープニング／ゲーム時／待機中を40%に）。ゲーム中のBGMがスマホで鳴りにくかったのも、操作をきっかけに鳴らし直すよう改善しました。",
      "スマホでオプションを開くと画面全体が左にずれて左半分が見切れる不具合を修正しました。",
      "ゲート侵攻で手札を奪う演出を改善しました（クリックした裏向きカードと別のカードがめくれて見える誤解を解消。奪う札は左から順にめくる表示にしました）。",
      "ゲート侵攻のエターナル獲得などの演出が終わり切る前に次のプレイヤーのターンへ移ってしまう不具合を修正しました（演出を最後まで見てから移行します）。",
      "不具合報告で、ページ読み込み直後のログや対戦相手のコンソールログも取りこぼさず取得するようにしました（調査の精度向上）。管理者用の不具合一覧で、コメントが長いと「詳細」ボタンが押せない不具合も修正しました。",
    ],
  },
  {
    date: "2026-08-05",
    items: [
      "ステータスエリアの自分のアバターに丸い枠が残る／背景が透明にならない不具合を修正しました（ランクリングの影が原因でした）。",
      "パーティの効果が2回処理される・自分のターン（ムーブフェイズ）が終わらなくなる不具合を修正しました。パーティを相手に取られた後にターンが相手へ移らない不具合もあわせて修正しました。",
      "ザ・ギャンブルなどの到達効果を処理している最中に、相手のターンへ移ってしまう不具合を修正しました。",
      "「記憶を失った青年」アバターを、ゲーム開始前は灰色、ゲームが始まって自分のファーストカードの色が決まったら、その色の青年に変わるようにしました。",
      "カードのドロー演出を改善しました（プレゼント等で演出の前に手札へ加わってしまう／手札に着地する瞬間に一瞬カードが消える、を修正）。",
      "不具合報告に、対戦相手全員のアクションログも自動で添付するようにしました。",
      "ライトモードで「接触の結果」モーダルがダークのままだったのを修正しました。",
      "ランクリングの太さを調整しました（管理者モードでさらに微調整できます）。",
    ],
  },
  {
    date: "2026-08-02",
    items: [
      "ライトモード（白系テーマ）を追加しました。管理者モードの「カラーテーマ」で切り替えられ、マイページ・ランキング・オプション・ショップ・ルールブック・図鑑・部屋一覧に対応。「対戦画面もライトにする」は別トグルで、対戦中もその場で切り替えて見比べられます。",
      "新しいペット「キュビット」（画像アニメ・4方向×モーション）を追加しました。歩く向きに合わせて向きが変わり、待機と行動（ジャンプ／あくび／耳ピク／歩く／一周）を交互に行います。駒の裏に回ると駒に隠れます。大きさ・一周の軌跡は管理者モードで調整できます。",
      "ロックしたファーストカード／エターナルカードをクリックしても効果を使えない不具合を修正しました（自動処理＋ドラッグ制限中に発火していなかった全種が対象）。",
      "自動処理モードで移動先も接触相手も無いとき、山札から隣に置くカードを「自分でマスを選び、裏向きで（中身は誰にも分からないように）」置くよう修正しました。",
      "ザ・ギャンブルのカード公開を1枚ずつにしました（「1枚公開する／全部公開する」「最後の1枚を公開する」モーダルでもったいぶれます）。",
      "合同建設で、各プレイヤーが山札から置いたのか手札から置いたのかを全員にお知らせするようにしました。",
      "ゲート侵攻のエターナル獲得演出で、フリップ直後に一瞬裏向きになる（2回フリップに見える）不具合を修正しました。",
      "対戦記録の画像にラウンド数・通算ターン数を記載するようにしました。",
      "対戦後のコメントがエンターで送信されず反映されない不具合を修正しました（Enterで送信、改行はShift+Enter）。",
      "ステータスエリアのオンライン状態アイコンを画面右上（残金の左）へ移し、部屋名を隣に表示するようにしました。プレイヤーB・C・Dのエモート表示位置も、名前と被らないよう調整しました。",
    ],
  },
  {
    date: "2026-08-01",
    items: [
      "国王アバターが激昂状態のときに別の国王の絵になってしまう不具合を修正しました（全7種を点検・修正）。",
      "対戦終了後のモーダルは、✕や外側クリックでは閉じないようにしました（「この部屋を出る」か「もう一度遊ぶ」でのみ閉じます。「盤面を確認する」は最小化です）。",
      "ステータスエリアのアバターを枠線の無い丸に戻し、背面に半透明のアバターを少しずらして重ねられるようにしました（サイズ・位置・透明度は管理者モードで調整可能）。半透明側をクリックしてもエモートは出ません。",
      "対戦後の戦績登録が反映されなかった件の調査・改善、および管理者ダッシュボードのログイン履歴に名前が出るよう記録タイミングを修正しました。",
    ],
  },
  {
    date: "2026-07-31",
    items: [
      "対戦終了後のモーダルに「盤面を確認する」を追加しました。押すと案内のあとモーダルが画面左上の🏆アイコンに最小化され、盤面を確認できます（アイコンを押すといつでも戻せます）。また「この部屋を出る」を押すとホーム画面に戻るようにしました。",
      "対戦終了後の順位表示を、実際のランキングのようにアバターと名前が並んだ一覧にし、ハイライトが最下位から自分の順位まで登っていく演出にしました（自分の行に到達すると強調表示）。",
      "選べるアバターに「各国の国王」7種（赤の王・橙のキツネ王・黄の光の王・緑の森の王・青の氷海王・桃の女王・紫の長老女王）を追加しました。ロック数に応じた覚醒版・激昂版もあります。",
      "ランキングで自分の行をハイライト点滅で強調するようにしました（3ランキングそれぞれで見つけやすく）。",
      "マイページでアバターを変更したとき、巨大アバター（背面の飾り）も即座に見た目が変わるように修正しました（全画面版でも反映）。",
      "戦績システムとの同期を完全自動化しました：名前・アバターを変更した瞬間に（連携済みなら）自動で戦績システムへ反映されます。対局開始時・勝利時の自動同期はそのままで、手動の「戦績システムと同期する」ボタンは不要になったので撤去しました。",
      "ランキングを、勝率・勝利数・対戦数の3つを横に同時表示にしました（タブ切替を廃止、囲う枠も撤去）。",
      "対戦終了時のモーダル（勝利・獲得コイン・順位・個人成績）が自動で切り替わらないようにしました。✕か背景クリックで閉じるまで、次のモーダルへ進みません。",
      "マイページのプロフィール表示を刷新：囲う枠（見えない当たり判定・クリップ）を撤去し、装飾アバターや着せ替えが画面いっぱいまで切れずに表示されるようにしました。",
      "オンライン対戦の部屋パネルを整理：「🆕 部屋を作成」「🚪 参加できる部屋」「👀 観戦できる対局」を見出し＋区切り線ではっきり分け、常時フォーム表示にしました。リアルタイム更新になったため「更新」ボタン、重複していた「ログを表示」（オプションのアクションログに集約）、場違いだった「ログアウト」（タイトル画面から可能）をこのパネルから撤去しました。",
      "マイページのプレイヤー名を、名前を直接クリック（＋小さな鉛筆アイコン）で編集できるようにし、「変更」ボタンを撤去しました。",
      "マイページでアバターを変更しても表示が変わらない不具合を修正しました。",
      "マイページの拡大した装飾アバターが透明な当たり判定で他の項目のクリックを奪う「見えない枠」を修正しました。",
      "ペットの既定を「なし（非表示）」にしました。",
      "図鑑／ルールブックではカード画像を直接並べず、「山札一覧を開く」ボタンからカード一覧（全画面）を見る形にしました。",
      "マイページがマウスホイールで上下にスクロールしてしまう不具合を修正しました（焼き込みレイアウトは固定表示にしました）。マイページの配置も更新しました。",
      "マイページを開いた状態でオプションを出したとき、他の場所をクリックしてもオプションが閉じない不具合を修正しました（重なったモーダルに関係なく外側クリックで閉じるようにしました）。",
      "オンラインのゲート侵攻を修正・強化：エターナル獲得の3Dフリップ演出がオンラインでも出るようにし（演出前に既にロック済みに見えてしまう問題も修正）、手札を奪う飛翔演出も追加しました。あわせて、ゲート侵攻の状態同期が壊れる不具合（内部エラー）も修正しました。",
      "「山札一覧」を全画面表示にし、カードにホバー（PC）または長押し（スマホ）すると拡大表示できるようにしました（クリックで補足テキスト付きの詳細も従来通り開きます）。",
      "スマホで画像を長押しすると「写真に保存／共有」メニューが出てしまうのを防止しました（カードの長押し拡大はそのまま使えます）。",
      "スマホで手札を拡大している最中に「ロックしますか？」等の確認モーダルが拡大の手前に出て読めない不具合を修正（カード拡大を最前面に表示）。",
      "スマホ／タブレットで駒消し・カード消しアイコンを、これまでの限界よりさらに上へ動かせるよう調整範囲を広げました（管理者モード）。",
      "スマホでの左下の自分アバターのサイズを、管理者モードで調整できるようにしました（既定も少し小さくしました）。",
      "スマホでオプションのドロップダウンが小さかったのを、既定で少し大きくしました（管理者モードの「オプションのドロップダウン サイズ倍率（スマホ）」でさらに調整できます。部屋作成・各モーダルは「画面中央モーダルのサイズ倍率（スマホ）」で調整可能）。",
      "ゲート侵攻で手札を奪われたとき、奪われた本人のモーダルに「奪われた自分のカード」を一覧表示するようにしました（本人だけに見え、相手や観戦者には非公開のままです）。",
      "選べる罠で捨てたカード（手札から／ロックから）を、全員に見えるお知らせモーダルで一覧表示するようにしました。",
      "スマホで「自分のターンです／相手のターンです」表示が画面右端で見切れる不具合を修正しました（右端基準に配置し、長い場合は折り返すようにしました）。",
      "オンラインで自分のペットを変更すると相手のペットも変わってしまう不具合を修正しました（自分の座席の駒にだけ自分の選択を反映するようにしました）。",
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

  // ユーザー要望「他の全画面ページ同様、左上に『← 戻る』ボタンを。右上✕は廃止」。
  const backBtn = document.createElement("button");
  backBtn.type = "button";
  backBtn.id = "changelog-back";
  backBtn.textContent = t("chg.back");
  backBtn.addEventListener("click", close);
  modalEl.appendChild(backBtn);

  const title = document.createElement("div");
  title.className = "changelog-modal-title";
  title.textContent = t("chg.title");
  modalEl.appendChild(title);

  const list = document.createElement("div");
  list.className = "changelog-list";
  if (CHANGELOG.length === 0) {
    const empty = document.createElement("div");
    empty.className = "changelog-empty";
    empty.textContent = t("chg.empty");
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
      // 英語表示では itemsEn があればそちらを出す。無ければ日本語のまま出し、
      // 「この回は日本語のみ」と一言添える（過去分は英訳しない方針＝ユーザー判断）。
      const useEn = getLang() !== "ja" && Array.isArray(entry.itemsEn) && entry.itemsEn.length > 0;
      if (getLang() !== "ja" && !useEn) {
        const note = document.createElement("div");
        note.className = "changelog-ja-only";
        note.textContent = t("chg.jaOnly");
        section.appendChild(note);
      }
      for (const item of useEn ? entry.itemsEn : entry.items) {
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
