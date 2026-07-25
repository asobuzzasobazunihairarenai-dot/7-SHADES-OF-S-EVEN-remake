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

// ユーザー要望「スマホ用のUIをいじりたい」への対応、タッチ端末をさらにスマホ/タブレットへ
// 分ける判定。ブラウザには「これはスマホ」「これはタブレット」という直接的なAPIが無いため、
// 画面の短辺（向きが変わっても値が安定するようinnerWidth/innerHeightの小さい方を使う）が
// Material Designのブレークポイントと同じ600px未満ならスマホ、以上ならタブレット、という
// ヒューリスティックで推測する。大画面スマホ・小型タブレットの境界はどうしても曖昧になる
// ため、あくまで「初期値の推測」に留め、tablet-2d-warning.jsのモーダルで実際の端末を
// 選んでもらい、その回答（so7-device-type-override）を推測より優先する。
const PHONE_MAX_SHORT_EDGE_PX = 600;
const DEVICE_TYPE_STORAGE_KEY = "so7-device-type-override";

export function guessDeviceTypeBySize() {
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  return shortEdge < PHONE_MAX_SHORT_EDGE_PX ? "phone" : "tablet";
}

// ユーザーが実際に選んだ端末種別（"phone" | "tablet"）。未回答ならnull。
export function getDeviceTypeOverride() {
  const v = localStorage.getItem(DEVICE_TYPE_STORAGE_KEY);
  return v === "phone" || v === "tablet" ? v : null;
}

// 優先順位: ユーザーの回答 > 画面サイズからの推測。
export function getDeviceType() {
  return getDeviceTypeOverride() ?? guessDeviceTypeBySize();
}

export function setDeviceType(type) {
  if (type !== "phone" && type !== "tablet") return;
  localStorage.setItem(DEVICE_TYPE_STORAGE_KEY, type);
  applyBodyClass();
}

function applyBodyClass() {
  const touch = isTouchPrimaryDevice();
  document.body.classList.toggle("is-touch-device", touch);
  // スマホ/タブレットの区別は「タッチ主体の端末」の中でのみ意味を持つ（PCでは両方付けない）。
  const deviceType = touch ? getDeviceType() : null;
  document.body.classList.toggle("is-phone-device", deviceType === "phone");
  document.body.classList.toggle("is-tablet-device", deviceType === "tablet");
}

export function initDeviceDetect() {
  applyBodyClass();
  const mql = window.matchMedia(TOUCH_MEDIA_QUERY);
  if (mql.addEventListener) mql.addEventListener("change", applyBodyClass);
  else if (mql.addListener) mql.addListener(applyBodyClass);
  // 画面サイズの推測（回答が無い間だけ有効）は、回転等でinnerWidth/innerHeightが
  // 入れ替わることがあるためresizeでも再判定する。
  window.addEventListener("resize", applyBodyClass);
}
