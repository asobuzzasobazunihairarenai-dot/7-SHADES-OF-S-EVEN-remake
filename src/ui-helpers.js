// パネル/モーダル共通の「右上✕ボタン＋外クリックでも閉じる」という閉じ方の標準部品。
// admin.js・deck-viewer.js・game-setup.js・main.js(重なりカード一覧モーダル)が使う。
// 今後新しく追加するパネル/モーダルも、原則としてこの部品を使って統一する
// （それぞれが独自に「閉じる」ボタンを実装すると、閉じ方の一貫性が崩れやすいため）。

// パネル本体（position:fixed/relativeが前提）の右上に置く、丸型の✕ボタン。
import { t } from "./ui-text.js"; // UI英語化フェーズ13

export function createModalCloseX(onClose) {
  const btn = document.createElement("button");
  btn.className = "modal-close-x";
  btn.textContent = "×";
  btn.setAttribute("aria-label", t("uih.close"));
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

// 対戦画面がライト配色か（theme-light=全体設定 or theme-light-ingame=盤面だけライト）。
export function isIngameLight() {
  return (
    document.body.classList.contains("theme-light") || document.body.classList.contains("theme-light-ingame")
  );
}

// 「中立ダークパネル」（ゲート侵攻結果・スタートプレイヤー決定・対戦完了パネル等、inline styleで
// ダーク色を直書きしているモーダル群）の配色を、ライト/ダークで出し分ける共通トークン。背景だけ
// 明るくすると内部の #e2e8f0 文字が見えなくなるため、コンテナ・本文・淡色・強調(金)・ボタンの色を
// まとめて返し、各モーダルが子要素の色まで一貫して切り替えられるようにする（#224で保留にしていた対応）。
export function neutralModalSkin() {
  return isIngameLight()
    ? {
        panel:
          "background: rgba(249, 250, 251, 0.99); border: 1px solid rgba(100, 116, 139, 0.45); color: #1e293b; box-shadow: 0 20px 50px rgba(15, 23, 42, 0.28);",
        text: "#1e293b",
        muted: "#475569",
        gold: "#92660a",
        btn: "background: rgba(100, 116, 139, 0.2); color: #1e293b;",
      }
    : {
        panel:
          "background: rgba(15, 23, 32, 0.98); border: 1px solid rgba(148, 163, 184, 0.4); color: #e2e8f0; box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);",
        text: "#e2e8f0",
        muted: "#94a3b8",
        gold: "#fbbf24",
        btn: "background: rgba(148, 163, 184, 0.25); color: #e2e8f0;",
      };
}
