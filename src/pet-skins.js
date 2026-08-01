// ペット選択（駒に追従する飾りペット piece-pet.js の見た目）。ダミーの絵文字7種から選べる。
// 選択はこの端末に保存（localStorage）。駒スキン等と同じく「左下ステータスエリアのアイコン」
// と「マイページ」から開けるピッカーを提供する。
//
// 現状は自分の駒に自分の選択を反映するローカル方式。将来は駒スキン(piece-skins.js)と同じく
// 座席ごとにオンライン同期して「相手の画面にも自分のペットが出る」ようにする予定
// （getPetEmojiForSeat が同期ロスターを見るように差し替えるだけで済むよう分離してある）。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { getSelfSeat, getSyncedIdentity, updateMyIdentity } from "./online.js";

// 絵文字ペット（仮）＋本番のスプライトペット。index 0 が既定。
// sprite付きのオプションは piece-pet.js が画像スプライト（4方向×モーション）で描画する
// （assets/pets/<sprite>/<sprite>-<front|back|left|right>-<static|walk|idle|yawn|ear|jump>.webp）。
export const PET_OPTIONS = [
  { emoji: "🐥", label: "ひよこ" },
  { emoji: "🐱", label: "ねこ" },
  { emoji: "🐶", label: "いぬ" },
  { emoji: "🐰", label: "うさぎ" },
  { emoji: "🐹", label: "ハムスター" },
  { emoji: "🦊", label: "きつね" },
  { emoji: "🐉", label: "ドラゴン" },
  { sprite: "cubit", label: "キュビット" }, // ユーザー作成の画像スプライト（4方向×6モーション）
  { emoji: null, label: "なし（非表示）" }, // ペットを表示しない（ユーザー要望）
];

// スプライトペットの画像パス。方向(front/back/left/right)とモーション(static/walk/idle/yawn/ear/jump)から。
export function petSpriteSrc(sprite, dir, motion) {
  return `assets/pets/${sprite}/${sprite}-${dir}-${motion}.webp`;
}

const STORAGE_KEY = "so7-pet-index";
// 既定は「なし（非表示）」（ユーザー要望）。保存値があればそれを優先する。
const NONE_INDEX = PET_OPTIONS.findIndex((o) => o.emoji === null);
let selectedIndex = NONE_INDEX >= 0 ? NONE_INDEX : 0;
try {
  const s = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (Number.isInteger(s) && PET_OPTIONS[s]) selectedIndex = s;
} catch (e) {
  /* 保存が読めなければ既定（なし） */
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
  if (seat && self && seat === self) return PET_OPTIONS[selectedIndex];
  const syncedIdx = seat ? getSyncedIdentity(seat)?.petIndex : null;
  if (typeof syncedIdx === "number" && PET_OPTIONS[syncedIdx]) return PET_OPTIONS[syncedIdx];
  return NONE_INDEX >= 0 ? PET_OPTIONS[NONE_INDEX] : PET_OPTIONS[0]; // 既定は「なし」
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

export function openPetPicker() {
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
  note.textContent = "駒に追従する飾りのペットです（仮の絵文字7種）。ゲームには影響しません。";

  const grid = document.createElement("div");
  grid.className = "piece-skin-modal-grid pet-picker-grid";
  PET_OPTIONS.forEach((opt, idx) => {
    const swatch = document.createElement("button");
    swatch.className = "piece-skin-swatch pet-picker-swatch";
    if (idx === selectedIndex) swatch.classList.add("is-selected");
    let face;
    if (opt.sprite) {
      // スプライトペットは正面の静止画をプレビューに使う。
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
    label.textContent = opt.label;
    swatch.appendChild(face);
    swatch.appendChild(label);
    swatch.addEventListener("click", () => {
      setSelectedPetIndex(idx);
      close();
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
