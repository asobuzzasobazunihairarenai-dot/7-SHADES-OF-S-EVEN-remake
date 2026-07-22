// アバターの値（絵文字1文字 / Googleプロフィール画像URL / ローカルのアバター画像パス）を
// 実際にDOMへ描画する共通ロジック。以前はmain.js・turn-timer.jsにそれぞれ軽量複製されて
// いたが、駒スキン画像への差し替え時にturn-timer.js側の判定が古いまま（http(s)://のみ対応）
// 残っていたバグ、さらにgame-setup.jsのスタートプレイヤー通知では複製すらされておらず
// textContentへ直接パスを突っ込んでいたバグ、と同じ種類の不具合が2回続けて起きたため、
// 1箇所にまとめた。

export function isImageAvatar(avatar) {
  return typeof avatar === "string" && (/^https?:\/\//.test(avatar) || /\.(png|jpe?g|webp|gif)$/i.test(avatar));
}

// ローカルのアバター画像は色ごとに正面(front)・左向き(left)・右向き(right)の3バリエーションが
// 用意されている（player-identity.jsのDEFAULT_AVATARS/AVATAR_OPTIONSは常にfront版を
// 「そのプレイヤーが選んだアバター」の正規の値として保持する）。表示する場所（盤面上のどの
// 席か、ステータスエリアか等）によって向きだけを差し替えたい時にこの関数を使う。
// Googleプロフィール画像等、front/left/right接尾辞を持たないアバター（isImageAvatarがtrueでも
// マッチしない）はバリエーションが無いため、そのまま返す（向き替え不可）。
export function getAvatarVariant(avatar, direction) {
  if (typeof avatar !== "string") return avatar;
  const m = avatar.match(/^(.*)-(?:front|left|right)(\.[a-zA-Z0-9]+)$/);
  if (!m) return avatar;
  return `${m[1]}-${direction}${m[2]}`;
}

// ユーザー要望「残りロックが3つになったら対応するアバターに変更」への対応。
// 画像素材/アバター/アバター2（-aura-awakened接尾辞）をassets/avatars/へ
// {color}-{front,left,right}-awakened.webpとしてコピー済み。Google/絵文字アバター等、
// front/left/right接尾辞を持たない（＝アバター1のローカル画像ではない）ものには
// 覚醒版が存在しないため、その場合は元のavatarをそのまま返す。
export function getAwakenedVariant(avatar) {
  if (typeof avatar !== "string") return avatar;
  const m = avatar.match(/^(.*-(?:front|left|right))(\.[a-zA-Z0-9]+)$/);
  if (!m) return avatar;
  return `${m[1]}-awakened${m[2]}`;
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
