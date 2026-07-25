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

function buildPilotRow(pilot) {
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
    "src/card-effects.jsの構造化データ（動詞＋パラメータ）から自動生成した効果文（生成）と、説明書の実際の文章（実際）を見比べる試作ビューです。まだこのデータはゲームの実際の挙動には一切影響しません。";
  panel.appendChild(intro);

  const list = document.createElement("div");
  list.id = "card-dev-mode-list";
  for (const pilot of PILOT_CARDS) {
    list.appendChild(buildPilotRow(pilot));
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
