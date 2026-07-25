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
import { CARD_EFFECTS, generateEffectText } from "./card-effects.js";
import { getState, moveToken, flipToken } from "./state.js";
import { getSelfSeat } from "./online.js";

// main.js側のtriggerCardArrival（自己申告モーダル／自動処理の分岐を持つ本体）は
// main.js内にしか無いため、他の箇所と同じ「register helper」注入パターンで
// main.js側から渡してもらう（循環import回避）。
let triggerCardArrivalHelper = null;
let renderHelper = null;
export function registerCardDevModeArrivalHelpers({ triggerCardArrival, render }) {
  triggerCardArrivalHelper = triggerCardArrival;
  renderHelper = render;
}

// ユーザー要望「テスト用にこの5枚を手札やマスに直接呼び出せるボタンが欲しい」への対応。
// 実際にデータとして存在する既存トークン（山札から未だ配られていないカードは中身が
// 実カードIDを持つトークンとしてまだ存在しないため対象外）を、自分の駒がいる
// マスへ移動＋表向きにしてから、そのまま到達処理を呼ぶ。セットアップ後の狙った
// カードを手作業で探しに行く手間を省くための開発用ショートカット。
function summonAndTriggerArrival(cardId) {
  const state = getState();
  const selfSeat = getSelfSeat();
  const piece = state.tokens.find((t) => t.kind === "piece" && t.player === selfSeat);
  if (!piece || piece.location.zone !== "cell") {
    alert("自分の駒が盤面上に見つかりません。先にセットアップを完了してください。");
    return;
  }
  const cardToken = state.tokens.find((t) => t.kind === "card" && t.cardId === cardId);
  if (!cardToken) {
    alert("このカードは今のゲームでまだ配られていません（山札の中）。セットアップ後にもう一度お試しください。");
    return;
  }
  const location = { zone: "cell", row: piece.location.row, col: piece.location.col };
  moveToken(cardToken.id, location);
  if (!cardToken.faceUp) flipToken(cardToken.id);
  renderHelper?.();
  if (triggerCardArrivalHelper) {
    triggerCardArrivalHelper(cardId, location);
  } else {
    alert("到達処理の呼び出し先が初期化されていません（main.jsの読み込み順を確認してください）。");
  }
}

// パイロット5枚（src/card-effects.jsのCARD_EFFECTSキーと対応、docs/cards.mdの実際の
// 文章と見比べるための一覧）。新しいパイロットカードを追加したら、ここにも追記する。
const PILOT_CARDS = [
  { cardId: "purple-sorry", kind: "arrival", actual: "１マス移動する。" },
  { cardId: "eternal-green", kind: "handEffect", actual: "【追色１】１枚ドロー。" },
  { cardId: "red-jump-pad", kind: "arrival", actual: "これはあなたの手札に加えない。２マス先に一気に移動する。" },
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
];

function buildPilotRow(pilot, close) {
  const def = getCardDefinition(pilot.cardId);
  const effectDef = CARD_EFFECTS[pilot.cardId]?.[pilot.kind];
  const generated = generateEffectText(effectDef);
  const matches = generated === pilot.actual;

  const row = document.createElement("div");
  row.className = "card-dev-mode-row";

  const nameEl = document.createElement("div");
  nameEl.className = "card-dev-mode-row-name";
  nameEl.textContent = `${matches ? "✅" : "⚠️"} ${def?.name ?? pilot.cardId}（${pilot.kind === "arrival" ? "到達効果" : "手札効果"}）`;
  row.appendChild(nameEl);

  const genRow = document.createElement("div");
  genRow.className = "card-dev-mode-row-line";
  genRow.innerHTML = `<span class="card-dev-mode-row-label is-generated">生成:</span> ${generated}`;
  row.appendChild(genRow);

  const actualRow = document.createElement("div");
  actualRow.className = "card-dev-mode-row-line";
  actualRow.innerHTML = `<span class="card-dev-mode-row-label">実際:</span> ${pilot.actual}`;
  row.appendChild(actualRow);

  // 到達効果はrunAutoArrivalEffect（main.js）に実際に配線済みなので、テスト用の
  // 呼び出しボタンを出す。手札効果（■）はまだ「使った」を宣言するトリガー自体が
  // アプリに無いため対象外（card-effect-engine.jsの冒頭コメント参照）。
  if (pilot.kind === "arrival") {
    const summonBtn = document.createElement("button");
    summonBtn.type = "button";
    summonBtn.className = "card-dev-mode-summon-btn";
    summonBtn.textContent = "🧪 自分の駒の位置に呼び出してテスト";
    // 効果によっては直後にマス/手札を選ぶ候補ハイライトが出るため、このパネル自体の
    // 背面（z-index高め）が盤面へのクリックを塞がないよう、実行前にパネルを閉じる。
    summonBtn.addEventListener("click", () => {
      close();
      summonAndTriggerArrival(pilot.cardId);
    });
    row.appendChild(summonBtn);
  }

  return row;
}

function buildPanel(close) {
  const panel = document.createElement("div");
  panel.id = "card-dev-mode-panel";

  const titleEl = document.createElement("div");
  titleEl.id = "card-dev-mode-title";
  titleEl.textContent = "🃏 カード開発モード";
  panel.appendChild(titleEl);
  panel.appendChild(createModalCloseX(close));

  const intro = document.createElement("div");
  intro.id = "card-dev-mode-intro";
  intro.textContent =
    "src/card-effects.jsの構造化データ（動詞＋パラメータ）から自動生成した効果文（生成）と、説明書の実際の文章（実際）を見比べる試作ビューです。到達効果（3枚）は基本設定「カード効果を自動処理する」がONの時、実際のゲーム挙動にも反映されます（手札効果はまだ未対応）。各カードの「🧪 自分の駒の位置に呼び出してテスト」ボタンで、盤面上のそのカードを探さずに即座に到達処理を試せます。";
  panel.appendChild(intro);

  const list = document.createElement("div");
  list.id = "card-dev-mode-list";
  for (const pilot of PILOT_CARDS) {
    list.appendChild(buildPilotRow(pilot, close));
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
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
  }
  openFn = open;

  const panel = buildPanel(close);
  panel.style.display = "none";
  const backdrop = createBackdrop(close, { dim: true, zIndex: 2700 });
  backdrop.style.display = "none";
  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}
