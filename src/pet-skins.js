// ペット選択（駒に追従する飾りペット piece-pet.js の見た目）。ダミーの絵文字7種から選べる。
// 選択はこの端末に保存（localStorage）。駒スキン等と同じく「左下ステータスエリアのアイコン」
// と「マイページ」から開けるピッカーを提供する。
//
// 現状は自分の駒に自分の選択を反映するローカル方式。将来は駒スキン(piece-skins.js)と同じく
// 座席ごとにオンライン同期して「相手の画面にも自分のペットが出る」ようにする予定
// （getPetEmojiForSeat が同期ロスターを見るように差し替えるだけで済むよう分離してある）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getSelfSeat, getSyncedIdentity, updateMyIdentity, isItemUnlocked, openShop } from "./online.js";

// ペット（駒に追従する飾り）。ユーザー要望でダミーの絵文字ペットは廃止し、スプライトペット
// （ショップで購入）＋「なし」だけにした。sprite付きは piece-pet.js が画像スプライト
// （4方向×モーション）で描画する。itemKey/cost はショップ連携用（shop-content.js）。
export const PET_OPTIONS = [
  { sprite: "cubit", label: "キュビット", itemKey: "pet:cubit", cost: 300 },
  { sprite: "noxael", label: "ノクスアエル幼体", itemKey: "pet:noxael", cost: 300 },
  // セプトは非売品（チュートリアルのエイドス戦報酬でのみ入手）。ショップには出さないが、所持
  // すれば装備できるよう PET_OPTIONS には残す（getPetShopItems が nonSellable を除外する）。
  { sprite: "sept", label: "セプト", itemKey: "pet:sept", nonSellable: true },
  { sprite: "rubel", label: "ルベル", itemKey: "pet:rubel", cost: 300 },
  { sprite: "kii", label: "キィ", itemKey: "pet:kii", cost: 300 },
  { sprite: "moya", label: "モヤ", itemKey: "pet:moya", cost: 300 }, // 2026-08-12追加
  { emoji: null, label: "なし（非表示）" }, // ペットを表示しない（初期値）
];

// ショップ（shop-content.js の「ペット」カテゴリ）へ渡す商品一覧。全て有料・初期は未所持。
export function getPetShopItems() {
  return PET_OPTIONS.filter((o) => o.sprite && !o.nonSellable).map((o) => ({
    itemKey: o.itemKey,
    label: o.label,
    cost: o.cost,
    sprite: o.sprite, // ショップでクリック時にモーション再生するために渡す（shop.js参照）
    imagePath: petSpriteSrc(o.sprite, "front", "static"),
  }));
}

// スプライトペットの画像パス。方向(front/back/left/right)とモーション(static/walk/idle/yawn/ear/jump)から。
export function petSpriteSrc(sprite, dir, motion) {
  return `assets/pets/${sprite}/${sprite}-${dir}-${motion}.webp`;
}

const STORAGE_KEY = "so7-pet-index";
// 既定は「なし（非表示）」。ショップ化に伴い、旧ダミーペットの保存インデックスは意味が
// 変わる（並びが変わった）ため、一度だけ「なし」へ移行する（初期は所持ペット無し＝なし）。
const NONE_INDEX = PET_OPTIONS.findIndex((o) => o.emoji === null);
const PET_SHOP_MIGRATION_KEY = "so7-pet-shop-migrated-v1";
let selectedIndex = NONE_INDEX >= 0 ? NONE_INDEX : 0;
try {
  if (localStorage.getItem(PET_SHOP_MIGRATION_KEY) !== "1") {
    localStorage.setItem(STORAGE_KEY, String(NONE_INDEX));
    localStorage.setItem(PET_SHOP_MIGRATION_KEY, "1");
    selectedIndex = NONE_INDEX;
  } else {
    const s = parseInt(localStorage.getItem(STORAGE_KEY), 10);
    if (Number.isInteger(s) && PET_OPTIONS[s]) selectedIndex = s;
  }
} catch (e) {
  /* 保存が読めなければ既定（なし） */
}

// スプライトペットのitemKeyが未所持なら「なし」扱いにする（自分の表示・選択の保険）。
function isPetOwned(opt) {
  return !opt?.sprite || !opt.itemKey || isItemUnlocked(opt.itemKey);
}

// ログイン時に呼ぶ（main.jsのonAuthChange）。ローカルのペット選択をプロフィール（＆在室中は
// 座席）へ書き戻す。対局開始時の座席作成はこのプロフィール値をコピーするため、これで初回から
// 相手にもペットが反映される（ユーザー報告「開始時に相手のペットが反映されない」対応）。
export function pushMyPetToProfile() {
  updateMyIdentity({ petIndex: selectedIndex }).catch((err) => console.error("pushMyPetToProfile failed", err));
}

export function getSelectedPetIndex() {
  return selectedIndex;
}
export function setSelectedPetIndex(i) {
  if (!PET_OPTIONS[i]) return;
  selectedIndex = i;
  try {
    localStorage.setItem(STORAGE_KEY, String(i));
  } catch (e) {
    /* 保存できなくても実行中は反映される */
  }
  // オンライン中は座席ロスターへ同期し、相手の画面にも自分のペットが反映されるようにする
  // （名前/アバター/駒スキンと同じ仕組み。so7_game_seats.pet_index / so7_user_profiles.pet_index）。
  updateMyIdentity({ petIndex: i }).catch((err) => console.error("updateMyIdentity(pet) failed", err));
  notifyChange();
  helpers?.render?.();
}

// 座席seatのペット絵文字。自分の座席の駒だけローカル選択（「なし」を選ぶと null=非表示）を
// 反映し、それ以外（相手・座席不明）は既定を返す。
// ハマりどころ（ユーザー報告「オンラインで自分のペットを変えたら相手のペットも変わる」）:
// 以前は `!seat`（座席不明）でも自分の選択を返していたため、駒のdata-ownerが空のとき
// （token.playerが無く色→座席の補完も外れた等）に相手の駒へ自分のペットが漏れていた。
// 自分の選択は「seatが自分の座席と明示的に一致する時だけ」返す（座席同期は将来対応 TODO(sync)）。
// 座席seatのペット“オプション”（絵文字 or スプライト）。piece-pet.jsが絵文字/画像どちらで
// 描画するか判定するために使う。自分の座席は自分の選択、他プレイヤーはオンライン同期された
// 選択（getSyncedIdentity().petIndex）を反映する。未同期・不明はデフォルト＝「なし」（非表示）。
export function getPetOptionForSeat(seat) {
  const self = getSelfSeat();
  const none = NONE_INDEX >= 0 ? PET_OPTIONS[NONE_INDEX] : PET_OPTIONS[PET_OPTIONS.length - 1];
  if (seat && self && seat === self) {
    const mine = PET_OPTIONS[selectedIndex];
    // 未所持スプライトを選んでいる状態（旧データ等）は「なし」にフォールバック。
    return isPetOwned(mine) ? mine : none;
  }
  const syncedIdx = seat ? getSyncedIdentity(seat)?.petIndex : null;
  if (typeof syncedIdx === "number" && PET_OPTIONS[syncedIdx]) return PET_OPTIONS[syncedIdx];
  return none; // 既定は「なし」
}

export function getPetEmojiForSeat(seat) {
  return getPetOptionForSeat(seat).emoji; // null なら非表示（スプライトはpiece-pet.js側で判定）
}

// main.jsからrender()を注入（他の着せ替えモジュールと同じ循環import回避パターン）。
let helpers = null;
export function registerPetHelpers(h) {
  helpers = h;
}
function notifyChange() {
  window.dispatchEvent(new CustomEvent("admin:change"));
}

// options（マイデッキ編集から使う。ユーザー要望2026-08-11「デッキごとにペットを設定」）:
//   onSelect(idx): 指定するとグローバル設定を変えず、選んだindexをコールバックで返して閉じる。
//   selectedIndex: 現在の選択（ハイライト用）。
export function openPetPicker(options = {}) {
  const selectedIdx = typeof options.selectedIndex === "number" ? options.selectedIndex : selectedIndex;
  const modal = document.createElement("div");
  modal.id = "pet-picker-modal";
  modal.className = "piece-skin-modal"; // 既存のピッカー見た目を流用
  const close = () => {
    backdrop.remove();
    modal.remove();
  };
  const backdrop = createBackdrop(close, { zIndex: 10001 });

  const title = document.createElement("div");
  title.className = "piece-skin-modal-title";
  title.textContent = "ペットを選択";

  const note = document.createElement("div");
  note.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin: -0.4rem 0 0.8rem;";
  note.textContent = "駒に追従する飾りのペットです（ショップで購入）。ゲームには影響しません。";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid pet-picker-grid";
  PET_OPTIONS.forEach((opt, idx) => {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch pet-picker-swatch";
    if (idx === selectedIdx) swatch.classList.add("is-selected");
    // 未所持のスプライトはロック表示にして、クリックでショップを開く（駒スキン等と同じ挙動）。
    const locked = !!opt.sprite && !!opt.itemKey && !isItemUnlocked(opt.itemKey);
    if (locked) swatch.classList.add("is-locked");
    let face;
    if (opt.sprite) {
      face = document.createElement("img");
      face.className = "pet-picker-sprite";
      face.src = petSpriteSrc(opt.sprite, "front", "static");
      face.alt = "";
    } else {
      face = document.createElement("span");
      face.className = "pet-picker-emoji";
      face.textContent = opt.emoji ?? "🚫"; // 「なし」は🚫で表す
    }
    const label = document.createElement("span");
    label.className = "pet-picker-label";
    label.textContent = locked ? `🔒 ${opt.label}（${opt.cost}）` : opt.label;
    swatch.appendChild(face);
    swatch.appendChild(label);
    swatch.addEventListener("click", () => {
      close();
      if (locked) {
        openShop?.("pet");
        return;
      }
      // マイデッキ編集: グローバル設定は変えず、選んだindexをデッキへ返す。
      if (options.onSelect) {
        options.onSelect(idx);
        return;
      }
      setSelectedPetIndex(idx);
    });
    grid.appendChild(swatch);
  });

  modal.appendChild(createModalCloseX(close));
  modal.appendChild(title);
  modal.appendChild(note);
  modal.appendChild(grid);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}
