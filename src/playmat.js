// プレイマットの選択。画像素材/プレイマット/配下に複数色（白・青・黒）が用意されたため、
// セットアップウィザードの手順0で選べるようにする（デフォルトは白）。他の実物画像素材と
// 同じ理由でgit管理外（.gitignoreの/assets/playmats/参照）。

export const PLAYMAT_OPTIONS = [
  { id: "white", label: "白", path: "assets/playmats/white.png" },
  { id: "blue", label: "青", path: "assets/playmats/blue.png" },
  { id: "black", label: "黒", path: "assets/playmats/black.png" },
];

let selectedPlaymatId = "white";

export function getSelectedPlaymatId() {
  return selectedPlaymatId;
}

export function setSelectedPlaymatId(id) {
  if (PLAYMAT_OPTIONS.some((p) => p.id === id)) selectedPlaymatId = id;
}

export function getSelectedPlaymatPath() {
  return PLAYMAT_OPTIONS.find((p) => p.id === selectedPlaymatId).path;
}
