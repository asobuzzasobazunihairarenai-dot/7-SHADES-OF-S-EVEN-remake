// フェイズ案内板: 「ロック」「ハンド」「ムーブ」フェイズを画面右下（他のアイコンボタン
// 群の近く）に、ユーザー提供のアイコン画像で常設表示する。以前はテキストラベルの3項目を
// 画面最下部中央に表示していたが、ユーザーが専用のアイコン画像（ロック/ハンド/ムーブ
// フェイズ.webp）を用意したのに合わせ、他のアイコンボタン（手札シャッフル等）と同じ
// 「アイコン+キャプション、ホバーで簡易説明・キャプションクリックで詳細説明」の見た目・
// 操作感に統一し、位置も右下へ引っ越した（icon-action-button.jsの共通部品をそのまま流用）。
// 現時点ではstate.jsに「今どのフェイズか」という状態が無いため、あくまで静的な案内として
// 実装する（強制力なし、自己申告のPhase1方針のまま）。将来、効果処理の全自動化にあわせて
// フェイズ状態を持たせた時、この案内板の該当ボタンを発光させる形で「今のフェイズ」を
// 示せるようにする想定（そのための土台として、ボタンをフェイズidで識別できるようにしてある）。

import { buildIconButtonContent, wireIconButtonClick, openIconDetailModal } from "./icon-action-button.js";
import { isAutoPhaseSkipEnabled, setAutoPhaseSkipEnabled } from "./auto-phase-skip-setting.js";
import { t } from "./ui-text.js";
import { onLangChange } from "./i18n.js";

// tutorial.jsのチュートリアル手順・help.jsの静的ヘルプからも共有される（説明文の二重管理を
// 避ける）。多言語化のため、表示文は ui-text.js のキーで持ち、下の phaseLabel/phaseShort/
// phaseDetail/phaseTitle を通して現在の言語で解決する（tutorial.js/help.js もこの関数を使う）。
// ムーブフェイズの detail は行動ごとに絵文字見出し（🚶移動/🤝接触/📥その他）を付けて短文に
// 分割してある（読みやすさのため）。
export const PHASES = [
  { id: "lock", icon: "assets/icons/lock-phase.webp", labelKey: "phase.lock.label", shortKey: "phase.lock.short", detailKeys: ["phase.lock.d1", "phase.lock.d2"] },
  { id: "hand", icon: "assets/icons/hand-phase.webp", labelKey: "phase.hand.label", shortKey: "phase.hand.short", detailKeys: ["phase.hand.d1", "phase.hand.d2"] },
  { id: "move", icon: "assets/icons/move-phase.webp", labelKey: "phase.move.label", shortKey: "phase.move.short", detailKeys: ["phase.move.d1", "phase.move.d2", "phase.move.d3", "phase.move.d4", "phase.move.d5", "phase.move.d6", "phase.move.d7"] },
];

// フェイズの表示文を現在の言語で解決する（phase-guide.js/tutorial.js/help.js 共用）。
export function phaseLabel(phase) { return t(phase.labelKey); }
export function phaseShort(phase) { return t(phase.shortKey); }
export function phaseDetail(phase) { return phase.detailKeys.map((k) => t(k)); }
export function phaseTitle(phase) { return t("phase.titleSuffix", { label: t(phase.labelKey) }); }

// 言語切替時にキャプション・ツールチップを差し替えられるよう参照を持っておく
// （フェイズ案内板のボタン群は一度だけ生成され、通常のrender()では作り直されないため）。
const phaseButtonRefs = [];
let autoSkipSyncFn = null;

function buildPhaseButton(phase) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = `phase-guide-${phase.id}-button`;
  btn.dataset.phase = phase.id;
  const { captionEl, tooltipEl } = buildIconButtonContent(btn, { icon: phase.icon, tooltip: phaseShort(phase) });
  captionEl.textContent = phaseLabel(phase);
  wireIconButtonClick(btn, {
    // detailTitle/detailParagraphs を関数で渡す＝開く瞬間に現在の言語で解決される。
    detailTitle: () => phaseTitle(phase),
    detailParagraphs: () => phaseDetail(phase),
    // ユーザー要望「フェイズ案内板の詳細説明についてアイコンをクリックでも表示される
    // ようにしてほしい」。icon-action-button.jsの共通部品は本来「アイコン=実際の操作、
    // キャプション文字=詳細説明」という役割分担だが、このボタン群には実行すべき操作が
    // 元々無い（案内専用）。他のボタン（1枚ドロー等）と違ってicon-action-button.js側の
    // 共通挙動を変える必要は無く、このボタンだけonAction（アイコンクリック時）でも
    // キャプションクリックと同じ詳細モーダルを開けばよい。
    onAction: () => openIconDetailModal(phaseTitle(phase), phaseDetail(phase)),
  });
  phaseButtonRefs.push({ phase, captionEl, tooltipEl });
  return btn;
}

// ユーザー要望「自動フェイズスキップのオン/オフボタンを、フェイズ案内板のロックアイコンの
// 左隣に新設したい。ONなら今まで通り自動でフェイズを送る、OFFなら自分でスキップを押すまで
// 送らない（ロックできる手札が無いこと等を相手に悟られないため）」。スキップボタンは
// バー末尾（右側）にappendされるため、この常設トグルはバー先頭（左側）に置いて干渉を避ける。
function buildAutoSkipToggleButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "phase-auto-skip-toggle";
  btn.classList.add("icon-action-button", "phase-auto-skip-toggle");

  const iconWrap = document.createElement("span");
  iconWrap.className = "icon-action-button-icon-wrap";
  const glyph = document.createElement("span");
  glyph.className = "phase-auto-skip-toggle-glyph";
  glyph.textContent = "⏭";
  const stateBadge = document.createElement("span");
  stateBadge.className = "phase-auto-skip-toggle-state";
  iconWrap.appendChild(glyph);
  iconWrap.appendChild(stateBadge);

  const caption = document.createElement("span");
  caption.className = "icon-action-button-caption";
  caption.textContent = t("phase.autoSkip.caption");

  btn.appendChild(iconWrap);
  btn.appendChild(caption);

  const sync = () => {
    const on = isAutoPhaseSkipEnabled();
    btn.classList.toggle("is-on", on);
    btn.classList.toggle("is-off", !on);
    stateBadge.textContent = on ? "ON" : "OFF";
    caption.textContent = t("phase.autoSkip.caption");
    btn.title = on ? t("phase.autoSkip.titleOn") : t("phase.autoSkip.titleOff");
  };
  btn.addEventListener("click", () => {
    setAutoPhaseSkipEnabled(!isAutoPhaseSkipEnabled());
    sync();
  });
  autoSkipSyncFn = sync;
  sync();
  return btn;
}

// 言語切替時に、生成済みのフェイズ案内ボタンのキャプション・ツールチップを差し替える。
function refreshPhaseGuideLabels() {
  for (const ref of phaseButtonRefs) {
    ref.captionEl.textContent = phaseLabel(ref.phase);
    ref.tooltipEl.textContent = phaseShort(ref.phase);
  }
  if (autoSkipSyncFn) autoSkipSyncFn();
}

export function initPhaseGuide() {
  const bar = document.createElement("div");
  bar.id = "phase-guide-bar";
  bar.appendChild(buildAutoSkipToggleButton()); // ロックアイコンの左隣（バー先頭）
  for (const phase of PHASES) {
    bar.appendChild(buildPhaseButton(phase));
  }
  document.body.appendChild(bar);
  onLangChange(refreshPhaseGuideLabels);
}
