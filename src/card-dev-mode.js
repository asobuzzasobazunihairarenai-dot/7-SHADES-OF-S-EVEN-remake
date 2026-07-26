// カード開発モード（ユーザー要望「カード効果の自動処理を作っていくにあたり、実際に
// ゲーム画面で確認したい。管理者モードを潜っていくのは大変なので、オプションの直下に
// 『カード開発モード』として追加してほしい。もちろん管理者のみ入れるように」への対応）。
// 以前はadmin.jsの「🔐 管理者専用」内にネストした折りたたみとして置いていたが、
// クリック数が多く見つけにくかったため、専用のパネルとして独立させた。
//
// アクセス制限はoptions-menu.js側（isAdminUser()でボタン自体を非表示にする、
// admin.jsの「⚙ 管理者モード」項目と同じ扱い）で行う。このパネル自体は
// 「誰でも呼べるがボタンが無いと辿り着けない」レベルの制限で十分
// （通貨付与等の本当に機密な操作は無く、既存カードのデータを見比べるだけのため）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getCardDefinition } from "./cards-data.js";
import { CARD_EFFECTS, generateEffectText, generateHandEffectOptionsText } from "./card-effects.js";
import { getState, moveToken, flipToken, isOnlineMode } from "./state.js";
import { getSelfSeat, getCurrentGameId, fetchAndHydrate } from "./online.js";
import { markSelfHandled } from "./self-handled-tokens.js";
import { stageDelta, toStageLocalRect } from "./main.js";
import { setAutoProcessingEnabled } from "./card-effect-engine.js";

// main.js側のtriggerCardArrival・runAutoHandEffect（自己申告モーダル／自動処理の分岐を
// 持つ本体）はmain.js内にしか無いため、他の箇所と同じ「register helper」注入パターンで
// main.js側から渡してもらう（循環import回避）。
let triggerCardArrivalHelper = null;
let runAutoHandEffectHelper = null;
let renderHelper = null;
export function registerCardDevModeArrivalHelpers({ triggerCardArrival, runAutoHandEffect, render }) {
  triggerCardArrivalHelper = triggerCardArrival;
  runAutoHandEffectHelper = runAutoHandEffect;
  renderHelper = render;
}

// ユーザー要望「テスト用にこの5枚を手札やマスに直接呼び出せるボタンが欲しい」への対応。
// 実際にデータとして存在する既存トークン（山札から未だ配られていないカードは中身が
// 実カードIDを持つトークンとしてまだ存在しないため対象外）を、自分の駒がいる
// マスへ移動＋表向きにしてから、そのまま到達処理を呼ぶ。セットアップ後の狙った
// カードを手作業で探しに行く手間を省くための開発用ショートカット。
async function summonAndTriggerArrival(cardId) {
  const state = getState();
  const selfSeat = getSelfSeat();
  const piece = state.tokens.find((t) => t.kind === "piece" && t.player === selfSeat);
  if (!piece || piece.location.zone !== "cell") {
    alert("自分の駒が盤面上に見つかりません。先にセットアップを完了してください。");
    return;
  }
  const cardToken = state.tokens.find((t) => t.kind === "card" && t.cardId === cardId);
  if (!cardToken) {
    // オンライン中は、裏向きの盤面カード・他プレイヤーの手札はRLSによりcardIdが
    // マスクされ、そもそもクライアント側に「このカードがどれか」という情報自体が
    // 無い（見えない相手の手札を覗き見できてしまうと本末転倒なため、意図的な仕様）。
    // このカードが今どこにあるか自体は分からないため、直接の解決策は提示できない。
    alert(
      isOnlineMode()
        ? "このカードは今の対戦でまだ配られていないか、裏向き・相手の手札等でマスクされていて特定できません（オンライン対戦は他プレイヤーの非公開情報を覗けない設計のため）。ローカルのテストモードでの利用を推奨します。"
        : "このカードは今のゲームでまだ配られていません（山札の中）。セットアップ後にもう一度お試しください。"
    );
    return;
  }
  const location = { zone: "cell", row: piece.location.row, col: piece.location.col };
  if (isOnlineMode()) {
    try {
      await moveToken(cardToken.id, location);
      if (!cardToken.faceUp) await flipToken(cardToken.id);
      markSelfHandled([cardToken.id]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("summonAndTriggerArrival failed", err);
      alert("呼び出しに失敗しました（詳細はコンソールを確認してください）。");
      return;
    }
  } else {
    moveToken(cardToken.id, location);
    if (!cardToken.faceUp) flipToken(cardToken.id);
  }
  renderHelper?.();
  if (triggerCardArrivalHelper) {
    triggerCardArrivalHelper(cardId, location);
  } else {
    alert("到達処理の呼び出し先が初期化されていません（main.jsの読み込み順を確認してください）。");
  }
}

// summonAndTriggerArrivalの手札効果版。狙ったカードのトークンを自分の手札へ動かし、
// そのまま手札効果の自動処理を呼ぶ（runAutoHandEffect側が追色コスト選択・使用可否判定
// 等、実際のゲーム内クリック操作と全く同じ経路を通る）。
async function summonAndTriggerHandEffect(cardId) {
  const state = getState();
  const selfSeat = getSelfSeat();
  const cardToken = state.tokens.find((t) => t.kind === "card" && t.cardId === cardId);
  if (!cardToken) {
    alert(
      isOnlineMode()
        ? "このカードは今の対戦でまだ配られていないか、裏向き・相手の手札等でマスクされていて特定できません（オンライン対戦は他プレイヤーの非公開情報を覗けない設計のため）。ローカルのテストモードでの利用を推奨します。"
        : "このカードは今のゲームでまだ配られていません（山札の中）。セットアップ後にもう一度お試しください。"
    );
    return;
  }
  const location = { zone: "hand", player: selfSeat };
  if (isOnlineMode()) {
    try {
      await moveToken(cardToken.id, location);
      markSelfHandled([cardToken.id]);
      await fetchAndHydrate(getCurrentGameId());
    } catch (err) {
      console.error("summonAndTriggerHandEffect failed", err);
      alert("呼び出しに失敗しました（詳細はコンソールを確認してください）。");
      return;
    }
  } else {
    moveToken(cardToken.id, location);
  }
  renderHelper?.();
  if (runAutoHandEffectHelper) {
    runAutoHandEffectHelper(cardId, cardToken.id, selfSeat);
  } else {
    alert("手札効果処理の呼び出し先が初期化されていません（main.jsの読み込み順を確認してください）。");
  }
}

// パイロットカード（src/card-effects.jsのCARD_EFFECTSキーと対応、docs/cards.mdの実際の
// 文章と見比べるための一覧）。新しいパイロットカードを追加したら、ここにも追記する。
// kind: "arrival" | "handEffect" | "handEffectOptions"（複数選択肢を持つ手札効果）。
const PILOT_CARDS = [
  { cardId: "purple-sorry", kind: "arrival", actual: "１マス移動する。" },
  { cardId: "eternal-green", kind: "handEffect", actual: "【追色１】１枚ドロー。" },
  { cardId: "red-jump-pad", kind: "arrival", actual: "これはあなたの手札に加えない。２マス先に一気に移動する。" },
  // 生成文「そのマスに手札から１枚裏向きで置く。」は、docs/cards.mdの実際の文言
  // 「手札から１枚をそのマスに裏向きで置く。」と語順だけが違う（意味は同じ）。
  // 一度word-order一致に寄せる修正を入れたが、source:"hand"だけの特殊分岐が
  // 必要になり実装が複雑になる割に実益が薄いため、ユーザー判断で元の生成文の
  // ままに戻した（2026-07-26）。意図的な⚠️表示。
  {
    cardId: "orange-harvest-sow",
    kind: "arrival",
    actual: "任意の１マスの１枚をあなたの手札に加える。手札から１枚をそのマスに裏向きで置く。",
  },
  {
    cardId: "eternal-yellow",
    kind: "handEffect",
    actual: "【追色１】２枚ドロー。相手全員は１枚ドロー。この効果は１ターンに１度のみ得られる。",
  },
  {
    cardId: "rainbow-shard",
    kind: "handEffectOptions",
    actual:
      "以下の効果のうち１つ得る。・１枚ドロー。・これを含めた「なないろの欠片」が２枚、あなたの手札にある時に使える。その２枚を任意の１箇所にロックする。２枚ドロー。",
  },
  {
    cardId: "eternal-purple",
    kind: "handEffect",
    actual: "【追色１】任意の１マスの１枚をあなたの手札に加える。そのマスに山札から１枚裏向きで置く。",
  },
  { cardId: "eternal-blue", kind: "handEffect", actual: "【追色１】任意の２マスに山札から１枚ずつ裏向きで置く。" },
  {
    cardId: "orange-mass-change",
    kind: "arrival",
    actual: "３マス以内の相手のいる場所とあなたのいる場所を入れ替える。相手はこのカードの到達効果を得ない。",
  },
  { cardId: "orange-mass-change", kind: "handEffect", actual: "【追色1】上記の到達時の効果を得る。" },
  // 生成文「２マス以内の１枚をあなたの手札に加える。」は、docs/cards.mdの実際の
  // 文言「２マス以内のカードを１枚あなたの手札に加える。」と「カードを」の有無・
  // 枚数の位置だけが違う（意味は同じ）。orange-harvest-sowと同じ理由で、修正は
  // 一度入れたがユーザー判断で元の生成文のままに戻した（2026-07-26）。
  // 意図的な⚠️表示。
  { cardId: "first-orange", kind: "handEffect", actual: "【追色１】２マス以内のカードを１枚あなたの手札に加える。" },
  {
    cardId: "yellow-sleight-of-hand",
    kind: "arrival",
    actual: "相手１人の手札から無作為に１枚、あなたの手札に加える。あなたの手札から１枚、その相手の手札に加える。",
  },
  // handEffectの「この効果はいつでも使える。」はusableAnytime:trueというフラグ
  // （main.js側の発動タイミング制御にのみ影響）で、generateEffectText自体は
  // これを文章化しない設計のため、mass-changeの「上記の...効果を得る」と同じく
  // 生成文とは意図的に一致しない（⚠️表示が正常）。
  {
    cardId: "yellow-sleight-of-hand",
    kind: "handEffect",
    actual: "この効果はいつでも使える。上記の到達時の効果を得る。",
  },
  { cardId: "red-jump-pad", kind: "handEffect", actual: "これをゲート以外の任意のマスに表向きで置く。" },
  { cardId: "red-counter-lock", kind: "arrival", actual: "１番少なくロックしているなら1枚ドロー。" },
  { cardId: "pink-present", kind: "arrival", actual: "１番少なくロックしている全員は、１枚ドロー。" },
  { cardId: "white-awakening", kind: "arrival", actual: "場の全ての表向きのカードを捨てる。" },
  {
    cardId: "green-growing-trees",
    kind: "arrival",
    actual: "２マス以内の何もない全てのマスに山札からカードを１枚ずつ裏向きで置く。",
  },
  { cardId: "white-radiance", kind: "arrival", actual: "全員、3枚ドロー。このカードを捨てる。" },
  { cardId: "black-faded-cat", kind: "arrival", actual: "これを捨てる。全員、手札を全て捨て、１枚ドロー。" },
  { cardId: "black-contract-brand", kind: "arrival", actual: "あなたの空いているロックエリアに、これを表向きで置く。" },
  {
    cardId: "blue-choosable-trap",
    kind: "arrivalOptions",
    actual: "以下の効果のうち1つ得る。・あなたの手札を半分捨てる。・あなたのゲートに強制移動する。・あなたのロックしているカードを1枚捨てる。",
  },
  {
    cardId: "yellow-gamble",
    kind: "arrival",
    actual: "２色以上、色を宣言する。その色の種類の数分ドローし公開する。それらの中に宣言色があるなら、あなたの手札を全て捨てる。",
  },
  {
    cardId: "purple-trial-ritual",
    kind: "arrival",
    actual: "色を３色宣言する。あなたの隣に山札から１枚表向きで置く。そのマスに移動し、移動先の到達効果は得ない。置いたカードが宣言色ならこの効果を繰り返す。",
  },
];

const KIND_LABEL = {
  arrival: "到達効果",
  handEffect: "手札効果",
  handEffectOptions: "手札効果（選択式）",
  // 選べる罠専用: 到達効果自身が複数選択肢から1つ選ぶ形（arrivalOptions、
  // card-effects.js参照）。
  arrivalOptions: "到達効果（選択式）",
};

function buildPilotRow(pilot, minimize) {
  const def = getCardDefinition(pilot.cardId);
  const generated =
    pilot.kind === "handEffectOptions"
      ? generateHandEffectOptionsText(CARD_EFFECTS[pilot.cardId]?.handEffectOptions, def?.name)
      : pilot.kind === "arrivalOptions"
        ? generateHandEffectOptionsText(CARD_EFFECTS[pilot.cardId]?.arrivalOptions)
        : generateEffectText(CARD_EFFECTS[pilot.cardId]?.[pilot.kind]);
  const matches = generated === pilot.actual;

  const row = document.createElement("div");
  row.className = "card-dev-mode-row";

  const nameEl = document.createElement("div");
  nameEl.className = "card-dev-mode-row-name";
  nameEl.textContent = `${matches ? "✅" : "⚠️"} ${def?.name ?? pilot.cardId}（${KIND_LABEL[pilot.kind]}）`;
  row.appendChild(nameEl);

  const genRow = document.createElement("div");
  genRow.className = "card-dev-mode-row-line";
  genRow.innerHTML = `<span class="card-dev-mode-row-label is-generated">生成:</span> ${generated}`;
  row.appendChild(genRow);

  const actualRow = document.createElement("div");
  actualRow.className = "card-dev-mode-row-line";
  actualRow.innerHTML = `<span class="card-dev-mode-row-label">実際:</span> ${pilot.actual}`;
  row.appendChild(actualRow);

  // 到達効果はrunAutoArrivalEffect、手札効果（単一・選択式とも）はrunAutoHandEffect
  // （どちらもmain.js）に実際に配線済みなので、テスト用の呼び出しボタンを出す。
  const summonBtn = document.createElement("button");
  summonBtn.type = "button";
  summonBtn.className = "card-dev-mode-summon-btn";
  summonBtn.textContent =
    pilot.kind === "arrival" || pilot.kind === "arrivalOptions"
      ? "🧪 自分の駒の位置に呼び出してテスト"
      : "🧪 自分の手札に呼び出してテスト";
  // 効果によっては直後にマス/手札を選ぶ候補ハイライトが出るため、このパネル自体の
  // 背面（z-index高め）が盤面へのクリックを塞がないよう、実行前にパネルを閉じる。
  // closeではなくminimizeにしているのは、ユーザー要望「毎回開くのが面倒」への対応で、
  // 効果確認後すぐミニアイコンから同じ位置・サイズのまま再度開けるようにするため。
  summonBtn.addEventListener("click", () => {
    minimize();
    if (pilot.kind === "arrival" || pilot.kind === "arrivalOptions") {
      summonAndTriggerArrival(pilot.cardId);
    } else {
      summonAndTriggerHandEffect(pilot.cardId);
    }
  });
  row.appendChild(summonBtn);

  return row;
}

// ユーザー要望「毎回開くのが面倒。位置・サイズをエクスプローラーみたいに動かせるように」
// への対応。ドラッグ移動はadmin-panel（admin.js）と同じtoStageLocalRect/stageDelta方式
// （bodyのapplyViewportStage()によるscale変換を補正する）、サイズ変更はCSSのネイティブ
// resize:both（このパネルは盤面の3D階層の外なので、駒/カードのような自前の
// elementsFromPoint()当たり判定は不要——ネイティブのままで問題ない）。
function buildPanel(close, minimize) {
  const panel = document.createElement("div");
  panel.id = "card-dev-mode-panel";

  const titleEl = document.createElement("div");
  titleEl.id = "card-dev-mode-title";
  titleEl.textContent = "🃏 カード開発モード";
  titleEl.title = "ドラッグしてパネルを移動できます";
  titleEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const rect = toStageLocalRect(panel.getBoundingClientRect());
    const startX = e.clientX;
    const startY = e.clientY;
    const startLeft = rect.left;
    const startTop = rect.top;
    panel.style.left = `${startLeft}px`;
    panel.style.top = `${startTop}px`;
    panel.style.transform = "none";
    function onMove(ev) {
      panel.style.left = `${startLeft + stageDelta(ev.clientX - startX)}px`;
      panel.style.top = `${startTop + stageDelta(ev.clientY - startY)}px`;
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  });
  panel.appendChild(titleEl);

  const minimizeBtn = document.createElement("button");
  minimizeBtn.type = "button";
  minimizeBtn.id = "card-dev-mode-minimize-btn";
  minimizeBtn.textContent = "─";
  minimizeBtn.setAttribute("aria-label", "最小化");
  minimizeBtn.addEventListener("click", minimize);
  panel.appendChild(minimizeBtn);
  panel.appendChild(createModalCloseX(close));

  const intro = document.createElement("div");
  intro.id = "card-dev-mode-intro";
  intro.textContent =
    "src/card-effects.jsの構造化データ（動詞＋パラメータ）から自動生成した効果文（生成）と、説明書の実際の文章（実際）を見比べる試作ビューです。基本設定「カード効果を自動処理する」がONの時、実際のゲーム挙動にも反映されます。各カードの「🧪 呼び出してテスト」ボタンで、盤面上/山札の中のそのカードを探さずに即座に到達処理・手札効果を試せます。";
  panel.appendChild(intro);

  const list = document.createElement("div");
  list.id = "card-dev-mode-list";
  for (const pilot of PILOT_CARDS) {
    list.appendChild(buildPilotRow(pilot, minimize));
  }
  panel.appendChild(list);

  return panel;
}

let openFn = null;

export function openCardDevMode() {
  openFn?.();
}

export function initCardDevMode() {
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
    miniIcon.style.display = "none";
  }
  // ユーザー要望「カード開発モードを開いたら自動で『カード効果を自動処理する』を
  // オンにしてほしい」。開発モードを開く目的はほぼ常にこの自動処理のテストのため、
  // 毎回オプションを別途開いてトグルする手間を省く。
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
    miniIcon.style.display = "none";
    setAutoProcessingEnabled(true);
  }
  // ユーザー要望「縮小ボタンをつけて縮小するとミニアイコンになり、それをクリックすると
  // 再表示されるように」への対応。closeと違い、位置・サイズ（ドラッグ/resizeで
  // 変更済みのものも含む）はDOMごと保持したまま表示を切り替えるだけなので、
  // 再表示時に元の位置・サイズへそのまま戻る。
  function minimize() {
    panel.style.display = "none";
    backdrop.style.display = "none";
    miniIcon.style.display = "flex";
  }
  function restoreFromMini() {
    panel.style.display = "block";
    backdrop.style.display = "block";
    miniIcon.style.display = "none";
  }
  openFn = open;

  const panel = buildPanel(close, minimize);
  panel.style.display = "none";
  // ユーザー報告「適当な場所をクリックしたらウィンドウが消えてどこかに行ってしまう」
  // への対応。backdrop（パネル外側）のクリックはcloseではなくminimizeにして、
  // 必ずミニアイコン経由で戻れる状態にする（closeだと「×」を押した時と見分けが
  // つかず、次にどこから開き直せばいいか分かりにくかった）。
  const backdrop = createBackdrop(minimize, { dim: true, zIndex: 2700 });
  backdrop.style.display = "none";
  const miniIcon = document.createElement("button");
  miniIcon.type = "button";
  miniIcon.id = "card-dev-mode-mini-icon";
  miniIcon.textContent = "🃏";
  miniIcon.title = "カード開発モードを再表示";
  miniIcon.addEventListener("click", restoreFromMini);
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(miniIcon);
}
