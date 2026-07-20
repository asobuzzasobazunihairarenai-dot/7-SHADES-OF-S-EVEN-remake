// パフォーマンス改善用の「アニメーションを減らす」設定。統合グラフィックスのPC等で
// 動作が重い場合に、プレイヤー自身の判断で個別にオン/オフできるようにする。純粋に
// クライアントローカルな描画設定のため（サーバーへは一切送らない）、1人がオンにしても
// 相手プレイヤーの画面には影響しない。src/lock-color.jsと同じ「モジュール変数＋
// getter/setter」パターン。ページ再読み込みでデフォルト（全てオフ＝今まで通り）に戻る、
// 他の基本設定トグルと同じ扱い（永続化しない）。

let flightDisabled = false;
let arrivalEffectDisabled = false;
let continuousGlowDisabled = false;

// 移動アニメーション（駒・カードの飛翔、ghost-flight.jsのflyGhost経由の全て）。
export function isFlightAnimationDisabled() {
  return flightDisabled;
}
export function setFlightAnimationDisabled(v) {
  flightDisabled = v;
}

// 到達・ロック演出（光の柱・光の輪・ロック画像の拡大フェードアウトなど、一時的な演出）。
export function isArrivalEffectDisabled() {
  return arrivalEffectDisabled;
}
export function setArrivalEffectDisabled(v) {
  arrivalEffectDisabled = v;
}

// 常時光る演出（手番の駒/ロックエリア/名前ラベル/アバターのパルス、ロック中カードの
// 周回演出など、ゲーム中ずっと動き続けるCSSアニメーション）。
export function isContinuousGlowDisabled() {
  return continuousGlowDisabled;
}
export function setContinuousGlowDisabled(v) {
  continuousGlowDisabled = v;
}
