// 駒スキン選択: 使うスキンのバリエーション（0=標準、1〜7=追加1〜7、8=大航海時代風、
// 9=遊びの王様風。以前は「駒スキン」「駒スキン追加」の2フォルダに分かれていたが、
// ユーザーが1つの画像素材/駒スキンフォルダに統合した）を1つだけ保持し、いつでも
// 自由に変更できるようにする。
// 駒の色自体はファーストカードで固定なので、選べるのは「自分の駒と同じ色の中のスキン
// バリエーション」だけ（色が変わるわけではない）。
// 以前は色ごとに別々のバリエーション番号を覚える設計（skinIndexByColor）だったが、
// ユーザー要望により「バリエーション番号（例:『追加1』）はユーザー1人につき1つの好みで、
// ゲームをまたいで駒の色が変わってもそのフォルダ内の該当色スキンを引き継ぐ」という
// 仕様に変更した（例: 赤の駒で「追加1」を選んでいれば、別のゲームで橙の駒になっても
// 「追加1」フォルダの橙が使われる）。
// トリガーとなるUI（駒の立体サムネイル）は左下の自分専用ステータスエリア側（main.js）に
// あるため、このモジュールはデータ管理とピッカーのモーダルだけを持つ。
//
// オンライン対戦では、他プレイヤーの駒スキンは自分のブラウザのローカル推測値ではなく、
// online.jsが同期取得した座席ロスター（getSyncedIdentity）を優先する。自分自身の座席に
// ついては、ローカルで実際に選び直した（またはログイン時にso7_user_profilesから復元
// された）好みのバリエーション番号を優先し、それが無ければ同期ロスターにフォールバックする
// （リロード直後、まだローカルの好みが復元される前の一瞬もsyncedへ正しくフォールバック
// できるようにするため）。

import { getState } from "./state.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getSelfSeat, isOnlineMode, getSyncedIdentity, updateMyIdentity, isItemUnlocked, openShop } from "./online.js";
import { COLORS } from "./board-layout.js";

// セットアップ前（自分の駒の色がまだファーストカードで決まっていない間）でも、左下の
// ステータスエリアからスキンだけ先に選べるようにするための仮のプレビュー色。実際の色が
// 決まればgetMyPieceColor()が優先されるため、ここはあくまで見た目を確認するためだけの
// 値（バリエーション番号の選択自体は色に依存しないため、どの色で見せても選択結果は同じ）。
const PREVIEW_FALLBACK_COLOR = COLORS[0];

const SKIN_VARIANTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; // 0=標準（assets/pieces/${color}.webp）

// ユーザー要望「一部駒スキンセットに名前を付けました」への対応。8=大航海時代風、
// 9=遊びの王様風の2セットだけテーマ名が付いているため、それ以外（1〜7）はこれまで
// 通り「追加N」のまま。card-back-skins.jsのSET_LABELSと同じ考え方。
const NAMED_SKIN_LABELS = {
  8: "大航海時代風",
  9: "遊びの王様風",
};

// ユーザー要望「駒スキンを購入できるようにする」への対応。標準(0)は無料、大航海時代風/
// 遊びの王様風(8,9)は特別セットのため少し高め、それ以外(1〜7)は均一価格。まだ具体的な
// 金額指定が無いプレースホルダー（対局終了ごとの通貨獲得額50、supabase_setup_so7.sqlの
// so7_award_match_currency参照、が基準）。実際の値は後で調整すること。
function getSkinCost(idx) {
  if (idx === 0) return 0;
  if (idx >= 8) return 120;
  return 80;
}

// shop-content.js（ショップのカタログ）がこのまま使えるよう、このモジュール自身の
// SKIN_VARIANTS/NAMED_SKIN_LABELSを唯一の正としてitem一覧を組み立てて返す（二重管理を
// 避けるため、ラベル・変化数はここだけが持つ）。
export function getSkinShopItems() {
  return SKIN_VARIANTS.map((variant) => ({
    itemKey: `piece-skin:${variant}`,
    label: NAMED_SKIN_LABELS[variant] ?? (variant === 0 ? "標準" : `追加${variant}`),
    cost: getSkinCost(variant),
  }));
}

let preferredSkinIndex = 0;
let hasLocalPreference = false;

// online.jsのloadMyPreferences()（ログイン直後）から、so7_user_profiles.piece_skin_indexを
// 復元するために呼ばれる。updateMyIdentity()による書き戻しは行わない（読み込みなので）。
export function setLocalPreferredSkinIndex(idx) {
  if (typeof idx !== "number") return;
  preferredSkinIndex = idx;
  hasLocalPreference = true;
}

// setup-animation.js/remote-move-animator.jsと同じ「main.jsから自分の関数を注入してもらう」
// 循環import回避パターン。スキン変更直後、自分の画面にも即座に反映させるためだけに使う
// （main.js自体はexportを持たない静的サイトのため、直接importできない）。
let helpers = null; // { render }
export function registerPieceSkinHelpers(h) {
  helpers = h;
}

// seat: 分かる場合（盤面上の駒を描画する時等）は渡すと、オンライン中はその座席の同期済み
// スキン選択を優先する。
// 自分の座席（seat省略時、またはseat===getSelfSeat()）については、ローカルに好みの
// バリエーション番号があればそれを最優先する（クリック直後の即時反映・ログイン時の
// so7_user_profiles復元、どちらもhasLocalPreferenceをtrueにする）。それが無ければ
// （リロード直後でまだ復元が終わっていない一瞬など）同期ロスターへフォールバックする。
// 他の座席は常に同期ロスターのみを見る（自分の好みのバリエーション番号を他人に押し付け
// ないため）。
export function getSkinImagePath(color, seat) {
  const isSelf = !seat || seat === getSelfSeat();
  let idx = 0;
  if (isSelf && hasLocalPreference) {
    idx = preferredSkinIndex;
  } else if (isOnlineMode() && seat) {
    const synced = getSyncedIdentity(seat)?.pieceSkinIndex;
    if (typeof synced === "number") idx = synced;
  }
  return idx === 0 ? `assets/pieces/${color}.webp` : `assets/pieces/${color}-${idx}.webp`;
}

export function getMyPieceColor() {
  const piece = getState().tokens.find((t) => t.kind === "piece" && t.player === getSelfSeat());
  return piece ? piece.color : null;
}

function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

export function openPieceSkinPicker() {
  const realColor = getMyPieceColor();
  const color = realColor || PREVIEW_FALLBACK_COLOR;

  const modal = document.createElement("div");
  modal.id = "piece-skin-modal";
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "駒スキンを選択";
  let note = null;
  if (!realColor) {
    note = document.createElement("div");
    note.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin: -0.4rem 0 0.8rem;";
    note.textContent = "まだ駒の色が決まっていないため仮の色で表示しています。バリエーションの選択自体は実際の色になっても引き継がれます。";
  }

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid";
  for (const idx of SKIN_VARIANTS) {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch";
    if ((hasLocalPreference ? preferredSkinIndex : 0) === idx) swatch.classList.add("is-selected");
    const img = document.createElement("img");
    img.src = idx === 0 ? `assets/pieces/${color}.webp` : `assets/pieces/${color}-${idx}.webp`;
    img.alt = idx === 0 ? "標準" : (NAMED_SKIN_LABELS[idx] ?? `追加${idx}`);
    swatch.appendChild(img);
    // ユーザー要望「駒スキンを購入できるようにする」への対応。未所持の有料スキンは
    // 選べないようにし、代わりにショップを開く（online.jsのisItemUnlocked/openShop）。
    const itemKey = `piece-skin:${idx}`;
    const cost = getSkinCost(idx);
    const locked = cost > 0 && !isItemUnlocked(itemKey);
    if (locked) {
      swatch.classList.add("is-locked");
      const lockBadge = document.createElement("span");
      lockBadge.className = "piece-skin-swatch-lock";
      lockBadge.textContent = `🔒${cost}`;
      swatch.appendChild(lockBadge);
    }
    swatch.addEventListener("click", () => {
      if (locked) {
        close();
        openShop("piece-skin");
        return;
      }
      setLocalPreferredSkinIndex(idx);
      notifyChange();
      updateMyIdentity({ pieceSkinIndex: idx }).catch((err) => console.error("updateMyIdentity failed", err));
      // 名前・アバターの編集(main.js)は変更直後に直接render()を呼んでいるが、ここは
      // それが漏れていたため、駒スキンを変えても選んだ本人の画面にすら反映されない
      // バグになっていた（駒スキンだけ相手にも自分にも反映されない、という報告の原因）。
      helpers?.render();
      close();
    });
    grid.appendChild(swatch);
  }

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  if (note) modal.appendChild(note);
  modal.appendChild(grid);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
