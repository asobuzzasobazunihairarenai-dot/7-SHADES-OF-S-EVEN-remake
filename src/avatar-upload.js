// ユーザー要望「アバター画像を自分でアップロードできるようにしたい。画像はWebPに
// 変換してからサーバーに保存する感じで。何か注意書きがあれば詳細説明リンクも置く」
// への対応。main.jsのopenAvatarPicker()（アバター選択モーダル）から呼ばれる、
// アップロード用のUI一式。実際のアップロード自体（Supabase Storageの"avatars"
// バケットへの保存）はonline.jsのuploadAvatarImage()に任せ、ここではファイル選択・
// 正方形クロップ・WebP変換・進捗表示だけを担当する。

import { uploadAvatarImage } from "./online.js";
import { openIconDetailModal } from "./icon-action-button.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

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
    image.onerror = () => reject(new Error(t("av.loadFailed")));
      image.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new Error(t("av.sizeFailed"));
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const outputSize = Math.min(side, MAX_AVATAR_DIMENSION);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, sx, sy, side, side, 0, 0, outputSize, outputSize);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", WEBP_QUALITY));
  if (!blob) throw new Error(t("av.webpFailed"));
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
  uploadBtn.textContent = t("av.upload");

  const infoBtn = document.createElement("button");
  infoBtn.type = "button";
  infoBtn.className = "opening-login-info-btn";
  infoBtn.textContent = "i";
  infoBtn.title = t("av.infoTip");
  infoBtn.addEventListener("click", () => {
    openIconDetailModal(t("av.infoTitle"), [
      t("av.info1"),
      t("av.info2"),
      t("av.info3"),
      t("av.info4"),
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
      statusEl.textContent = t("av.converting");
    try {
      const blob = await fileToWebpBlob(file);
      statusEl.textContent = t("av.uploading");
      const url = await uploadAvatarImage(blob);
      statusEl.textContent = "";
      onUploaded(url);
    } catch (err) {
      console.error("avatar upload failed", err);
      statusEl.textContent = t("av.error", { msg: err.message ?? err });
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
