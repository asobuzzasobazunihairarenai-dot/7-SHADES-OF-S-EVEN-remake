// タッチ主体の端末（タブレット・スマホ等）かどうかの共通判定。"hover:none かつ
// pointer:coarse"（ホバーできず入力精度が粗い）という標準的な検知方法を使う
// （トラックパッド付きノートPC等はhover:hover/pointer:fineのままなので対象外になる）。
// interaction-mode.jsが元々ボタン自体の表示/非表示にこの判定を使っていたが、PC/タブレットで
// UIの位置・サイズを分けたいという要望（誤操作防止ボタンだけでなく他のアイコンボタンにも
// 適用する）に対応するため、body.is-touch-deviceクラスとして切り出し、CSS側の
// `body.is-touch-device #foo { ... }` という形で複数箇所から参照できるようにした。

export const TOUCH_MEDIA_QUERY = "(hover: none) and (pointer: coarse)";

export function isTouchPrimaryDevice() {
  return window.matchMedia(TOUCH_MEDIA_QUERY).matches;
}

function applyBodyClass() {
  document.body.classList.toggle("is-touch-device", isTouchPrimaryDevice());
}

export function initDeviceDetect() {
  applyBodyClass();
  const mql = window.matchMedia(TOUCH_MEDIA_QUERY);
  if (mql.addEventListener) mql.addEventListener("change", applyBodyClass);
  else if (mql.addListener) mql.addListener(applyBodyClass);
}
