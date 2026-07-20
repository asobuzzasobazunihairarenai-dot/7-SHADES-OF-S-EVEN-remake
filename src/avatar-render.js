// アバターの値（絵文字1文字 / Googleプロフィール画像URL / ローカルのアバター画像パス）を
// 実際にDOMへ描画する共通ロジック。以前はmain.js・turn-timer.jsにそれぞれ軽量複製されて
// いたが、駒スキン画像への差し替え時にturn-timer.js側の判定が古いまま（http(s)://のみ対応）
// 残っていたバグ、さらにgame-setup.jsのスタートプレイヤー通知では複製すらされておらず
// textContentへ直接パスを突っ込んでいたバグ、と同じ種類の不具合が2回続けて起きたため、
// 1箇所にまとめた。

export function isImageAvatar(avatar) {
  return typeof avatar === "string" && (/^https?:\/\//.test(avatar) || /\.(png|jpe?g|webp|gif)$/i.test(avatar));
}

export function applyAvatarContent(el, avatar) {
  if (isImageAvatar(avatar)) {
    let img = el.querySelector("img.avatar-image");
    if (!img) {
      img = document.createElement("img");
      img.className = "avatar-image";
      el.textContent = "";
      el.appendChild(img);
    }
    img.src = avatar;
  } else {
    el.querySelector("img.avatar-image")?.remove();
    el.textContent = avatar;
  }
}
