// パネル/モーダル共通の「右上✕ボタン＋外クリックでも閉じる」という閉じ方の標準部品。
// admin.js・deck-viewer.js・game-setup.js・main.js(重なりカード一覧モーダル)が使う。
// 今後新しく追加するパネル/モーダルも、原則としてこの部品を使って統一する
// （それぞれが独自に「閉じる」ボタンを実装すると、閉じ方の一貫性が崩れやすいため）。

// パネル本体（position:fixed/relativeが前提）の右上に置く、丸型の✕ボタン。
export function createModalCloseX(onClose) {
  const btn = document.createElement("button");
  btn.className = "modal-close-x";
  btn.textContent = "×";
  btn.setAttribute("aria-label", "閉じる");
  btn.addEventListener("click", onClose);
  return btn;
}

// パネルの外側をクリックした時にも閉じられるようにする、全画面の透明なクリック受け皿。
// dim:trueにすると背景を薄暗くする（一覧・情報モーダル向け）。省略時は透明のまま
// （常駐ツールパネル向け。盤面を見ながら調整したいので背景を暗くしたくないケース）。
export function createBackdrop(onClose, { dim = false, zIndex = 2000 } = {}) {
  const backdrop = document.createElement("div");
  backdrop.style.cssText = `position: fixed; inset: 0; z-index: ${zIndex};${dim ? " background: rgba(0, 0, 0, 0.6);" : ""}`;
  backdrop.addEventListener("click", onClose);
  return backdrop;
}
