// ユーザー要望「アバター画像を自分でアップロードできるようにしたい。画像はWebPに
// 変換してからサーバーに保存する感じで。何か注意書きがあれば詳細説明リンクも置く」
// への対応。main.jsのopenAvatarPicker()（アバター選択モーダル）から呼ばれる、
// アップロード用のUI一式。実際のアップロード自体（Supabase Storageの"avatars"
// バケットへの保存）はonline.jsのuploadAvatarImage()に任せ、ここではファイル選択・
// 正方形クロップ・WebP変換・進捗表示だけを担当する。

import { uploadAvatarImage } from "./online.js";
import { openIconDetailModal } from "./icon-action-button.js";

// アバターは常に正方形・円形で表示されるため、これより大きい画像は縮小する
// （ファイルサイズを抑える目的も兼ねる）。
const MAX_AVATAR_DIMENSION = 512;
const WEBP_QUALITY = 0.85;

// 選んだ画像ファイルを、中央を正方形にクロップ→必要なら縮小→WebPのBlobに変換する。
async function fileToWebpBlob(file) {
  const objectUrl = URL.createObjectURL(file);
  let img;
  try {
    img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像を読み込めませんでした"));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error("画像のサイズを取得できませんでした");
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const outputSize = Math.min(side, MAX_AVATAR_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, outputSize, outputSize);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
  if (!blob) throw new Error("WebPへの変換に失敗しました（お使いのブラウザが対応していない可能性があります）");
  return blob;
}

// アバター選択モーダル(main.jsのopenAvatarPicker)へ差し込む、アップロード用の
// セクション一式を作って返す。onUploadedは、実際にアップロードが成功して公開URLが
// 得られた時に呼ばれる（呼び出し側でsetPlayerAvatar/render/モーダルを閉じる等を行う）。
export function buildAvatarUploadSection(onUploaded) {
  const wrap = document.createElement("div");
  wrap.className = "avatar-upload-section";

  const row = document.createElement("div");
  row.className = "avatar-upload-row";

  const uploadBtn = document.createElement("button");
  uploadBtn.type = "button";
  uploadBtn.className = "avatar-upload-btn";
  uploadBtn.textContent = "🖼️ 画像をアップロード";

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "opening-login-info-btn";
  infoBtn.textContent = "i";
  infoBtn.title = "アップロードについての注意";
  infoBtn.addEventListener("click", () => {
    openIconDetailModal("アバター画像のアップロードについて", [
      "アップロードした画像は自動的に中央が正方形に切り抜かれ、WebP形式に変換されてから保存されます。",
      "他のプレイヤーにも表示される画像です。他人を不快にさせる画像・著作権を侵害する画像はアップロードしないでください。",
      "不適切と判断した画像は、運営が予告なく削除・差し替えする場合があります。",
      "画像は自分のアカウントにつき1枚、同じ場所に上書き保存されます。アップロードし直すと前の画像には戻せません。",
    ]);
  });

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "avatar-upload-file-input";

  const statusEl = document.createElement("div");
  statusEl.className = "avatar-upload-status";

  uploadBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    uploadBtn.disabled = true;
    statusEl.textContent = "画像を変換中…";
    try {
      const blob = await fileToWebpBlob(file);
      statusEl.textContent = "アップロード中…";
      const url = await uploadAvatarImage(blob);
      statusEl.textContent = "";
      onUploaded(url);
    } catch (err) {
      console.error("avatar upload failed", err);
      statusEl.textContent = `エラー: ${err.message ?? err}`;
    } finally {
      uploadBtn.disabled = false;
    }
  });

  row.appendChild(uploadBtn);
  row.appendChild(infoBtn);
  wrap.appendChild(row);
  wrap.appendChild(statusEl);
  wrap.appendChild(fileInput);
  return wrap;
}
