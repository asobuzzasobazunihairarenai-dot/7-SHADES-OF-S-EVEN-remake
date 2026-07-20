// Phase 1: プレイマット画像・ロックエリア・各種カードの山の位置合わせを、コードを直接編集せずに
// ブラウザ上のスライダーで調整し、最終値をテキストで書き出せる管理者モード。
// 調整が終わったら「出力」欄の内容をそのまま開発者に渡せば、CSSの :root にある
// 対応する変数へそのまま反映できる。

import { createModalCloseX, createBackdrop } from "./ui-helpers.js";

// 大項目（カテゴリ）。項目が増えて縦に長くなりすぎたため、各グループ/トグルセクションを
// さらにこの単位でまとめる。GROUPS各要素・TOGGLE_SECTIONS各要素の`category`フィールドで
// どのカテゴリに属するか指定する。
const CATEGORIES = [
  { key: "position", label: "📐 位置合わせ" },
  { key: "effect", label: "✨ 演出" },
  { key: "behavior", label: "⚙ セットアップ・挙動" },
];

// scaleは基準サイズ（プレイマットなら盤面、各山ならカード1枚分）を100%とした拡大率。
// pos-x/pos-yは中心からのずれ。どちらもtransform: scale/translateなので、拡大しても見切れない。
const GROUPS = [
  {
    title: "カメラ（3D視点）の位置調整",
    category: "position",
    controls: [
      { key: "--table-tilt", label: "テーブルの傾き", unit: "deg", min: 0, max: 70, step: 1, default: 42 },
      { key: "--camera-perspective", label: "カメラ距離（小さいほど遠近感が強い）", unit: "px", min: 500, max: 3000, step: 10, default: 1150 },
      { key: "--camera-perspective-origin-y", label: "消失点の高さ（画面上端からの距離、ウィンドウサイズに依存しない固定値）", unit: "rem", min: 0, max: 20, step: 0.1, default: 8.4 },
      { key: "--camera-offset-y", label: "上下（Y軸）位置", unit: "rem", min: -20, max: 20, step: 0.1, default: -1.7 },
      { key: "--camera-zoom", label: "ズーム", unit: "", min: 0.3, max: 2.5, step: 0.01, default: 1 },
    ],
  },
  {
    title: "カード拡大プレビュー",
    category: "position",
    controls: [
      { key: "--card-preview-size", label: "サイズ", unit: "rem", min: 8, max: 36, step: 0.5, default: 20 },
    ],
  },
  {
    title: "カード獲得ポップアップ",
    category: "effect",
    controls: [
      { key: "--hand-pickup-toast-scale", label: "大きさ", unit: "", min: 0.8, max: 2.5, step: 0.05, default: 1.3 },
      { key: "--hand-pickup-toast-duration", label: "表示時間（秒）", unit: "", min: 1, max: 15, step: 0.5, default: 5 },
    ],
  },
  {
    title: "カード到達モーダル（駒がカードに乗った時）",
    category: "effect",
    controls: [
      { key: "--card-arrival-modal-size", label: "大きさ", unit: "rem", min: 8, max: 40, step: 0.5, default: 25 },
      { key: "--card-arrival-modal-duration", label: "表示時間（秒）", unit: "", min: 1, max: 15, step: 0.5, default: 5 },
    ],
  },
  {
    title: "相手ゲート侵攻ボーナス通知（オンライン対戦）",
    category: "effect",
    controls: [
      { key: "--gate-invasion-modal-size", label: "大きさ", unit: "rem", min: 8, max: 40, step: 0.5, default: 28 },
      { key: "--gate-invasion-modal-step-duration", label: "1ステップの表示時間（秒）", unit: "", min: 1, max: 15, step: 0.5, default: 3.5 },
    ],
  },
  {
    title: "スポットライトモードの明るい範囲",
    category: "effect",
    controls: [
      { key: "--spotlight-inner-radius", label: "明るい範囲の広さ", unit: "%", min: 0, max: 50, step: 1, default: 15 },
      { key: "--spotlight-outer-radius", label: "暗さが最大になる位置（大きいほど暗くなる範囲が広い＝falloffが緩やか）", unit: "%", min: 30, max: 100, step: 1, default: 100 },
      { key: "--spotlight-opacity", label: "最大の暗さ", unit: "", min: 0.3, max: 1, step: 0.05, default: 0.95 },
      { key: "--spotlight-width", label: "形の横幅", unit: "%", min: 20, max: 100, step: 1, default: 55 },
      { key: "--spotlight-height", label: "形の縦幅", unit: "%", min: 20, max: 100, step: 1, default: 50 },
    ],
  },
  {
    title: "効果音の音量（個別）",
    category: "effect",
    controls: [
      { key: "--sound-volume-hand-shuffle", label: "手札シャッフル", unit: "%", min: 0, max: 100, step: 5, default: 80 },
      { key: "--sound-volume-deck-shuffle", label: "山札シャッフル", unit: "%", min: 0, max: 100, step: 5, default: 80 },
      { key: "--sound-volume-card-flip", label: "カードめくり", unit: "%", min: 0, max: 100, step: 5, default: 80 },
      { key: "--sound-volume-card-place", label: "カードを置く", unit: "%", min: 0, max: 100, step: 5, default: 80 },
      { key: "--sound-volume-card-draw", label: "カードを抜き取る", unit: "%", min: 0, max: 100, step: 5, default: 80 },
      { key: "--sound-volume-arrival-effect", label: "到達効果", unit: "%", min: 0, max: 100, step: 5, default: 80 },
      { key: "--sound-volume-lock", label: "ロック", unit: "%", min: 0, max: 100, step: 5, default: 80 },
    ],
  },
  {
    title: "盤面拡大ボタン（1段階目）のズーム位置調整",
    category: "position",
    controls: [
      { key: "--board-zoom-margin", label: "余白（小さいほど余白が増える）", unit: "", min: 0.5, max: 1, step: 0.01, default: 0.95 },
      { key: "--board-zoom-offset-x", label: "位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--board-zoom-offset-y", label: "位置Y", unit: "rem", min: -30, max: 30, step: 0.1, default: -2.2 },
      { key: "--board-zoom-reference-height", label: "基準の高さ（ウィンドウサイズに依存させないための固定値）", unit: "px", min: 400, max: 2000, step: 10, default: 620 },
    ],
  },
  {
    title: "盤面拡大ボタン（2段階目「もっと拡大」）のズーム位置調整",
    category: "position",
    controls: [
      { key: "--board-zoom-2-margin", label: "余白（大きいほど拡大される）", unit: "", min: 1, max: 2, step: 0.01, default: 1.5 },
      { key: "--board-zoom-2-offset-x", label: "位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--board-zoom-2-offset-y", label: "位置Y", unit: "rem", min: -30, max: 30, step: 0.1, default: -2.5 },
      { key: "--board-zoom-2-reference-height", label: "基準の高さ（ウィンドウサイズに依存させないための固定値）", unit: "px", min: 400, max: 2000, step: 10, default: 800 },
    ],
  },
  {
    title: "フェイズ案内板（画面下部中央）",
    category: "position",
    controls: [
      { key: "--phase-guide-bottom", label: "Y位置（画面下端からの距離）", unit: "rem", min: 0, max: 20, step: 0.1, default: 0 },
      { key: "--phase-guide-item-width", label: "1項目の幅", unit: "rem", min: 2, max: 20, step: 0.1, default: 9 },
      { key: "--phase-guide-item-height", label: "1項目の高さ", unit: "rem", min: 1, max: 10, step: 0.1, default: 1 },
    ],
  },
  {
    title: "ターンタイマー：中央ロープの位置調整",
    category: "position",
    controls: [
      { key: "--turn-timer-rope-pos-x", label: "位置X", unit: "rem", min: -30, max: 30, step: 0.1, default: 0 },
      { key: "--turn-timer-rope-pos-y", label: "位置Y", unit: "rem", min: -30, max: 30, step: 0.1, default: 0 },
      { key: "--turn-timer-rope-width", label: "幅（プレイマットを横断するスケール）", unit: "rem", min: 10, max: 70, step: 0.5, default: 46 },
    ],
  },
  {
    title: "優先権譲渡ボタンの位置調整",
    category: "position",
    controls: [
      { key: "--priority-transfer-pos-x", label: "位置X", unit: "rem", min: -30, max: 30, step: 0.1, default: 0 },
      { key: "--priority-transfer-pos-y", label: "位置Y", unit: "rem", min: -30, max: 30, step: 0.1, default: 0 },
    ],
  },
  {
    title: "駒の当たり判定（ホバーすると発光する範囲）",
    category: "position",
    controls: [
      { key: "--piece-hitbox-scale", label: "広さ（見た目のサイズはそのまま）", unit: "", min: 0.5, max: 2.5, step: 0.05, default: 1 },
    ],
  },
  {
    title: "プレイマット",
    category: "position",
    controls: [
      { key: "--playmat-scale", label: "拡大率", unit: "", min: 0.5, max: 3, step: 0.01, default: 1.42 },
      { key: "--playmat-pos-x", label: "位置X（中心からのずれ）", unit: "%", min: -50, max: 50, step: 0.5, default: 0 },
      { key: "--playmat-pos-y", label: "位置Y（中心からのずれ）", unit: "%", min: -50, max: 50, step: 0.5, default: 0 },
    ],
  },
  {
    title: "ロックエリア（盤面中心からの距離、デフォルトはマスに密着）",
    category: "position",
    controls: [
      { key: "--lock-top-pos-x", label: "奥/C側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-top-pos-y", label: "奥/C側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bottom-pos-x", label: "手前/A側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bottom-pos-y", label: "手前/A側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-left-pos-x", label: "左/B側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-left-pos-y", label: "左/B側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-right-pos-x", label: "右/D側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-right-pos-y", label: "右/D側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-slot-border-width", label: "枠線の太さ", unit: "rem", min: 0, max: 0.4, step: 0.01, default: 0.01 },
      { key: "--lock-slot-glow-scale", label: "色グローの強さ", unit: "", min: 0, max: 2, step: 0.05, default: 0.25 },
    ],
  },
  {
    title: "ロックエリアバー（ロックエリアと盤面の間の装飾画像）",
    category: "position",
    controls: [
      { key: "--lock-bar-scale", label: "大きさ（共通）", unit: "", min: 0.3, max: 3, step: 0.01, default: 1.13 },
      { key: "--lock-bar-top-pos-x", label: "奥/C側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-top-pos-y", label: "奥/C側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-bottom-pos-x", label: "手前/A側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-bottom-pos-y", label: "手前/A側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-left-pos-x", label: "左/B側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-left-pos-y", label: "左/B側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-right-pos-x", label: "右/D側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bar-right-pos-y", label: "右/D側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
    ],
  },
  {
    title: "プレイヤー名ラベルの位置",
    category: "position",
    controls: [
      { key: "--label-a-pos-x", label: "A（自分）位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: -14.7 },
      { key: "--label-a-pos-y", label: "A（自分）位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: -1.1 },
      { key: "--label-b-pos-x", label: "B 位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: -14.7 },
      { key: "--label-b-pos-y", label: "B 位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: -1.5 },
      { key: "--label-c-pos-x", label: "C 位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: 14.2 },
      { key: "--label-c-pos-y", label: "C 位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: -1.5 },
      { key: "--label-d-pos-x", label: "D 位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: -16.4 },
      { key: "--label-d-pos-y", label: "D 位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: -1.5 },
    ],
  },
  {
    title: "プレイヤーアバターの位置・サイズ（手札の後ろ側に配置）",
    category: "position",
    controls: [
      { key: "--avatar-a-size", label: "A（自分）サイズ", unit: "rem", min: 1, max: 8, step: 0.1, default: 3 },
      { key: "--avatar-b-size", label: "B サイズ", unit: "rem", min: 1, max: 8, step: 0.1, default: 3 },
      { key: "--avatar-c-size", label: "C サイズ", unit: "rem", min: 1, max: 8, step: 0.1, default: 3 },
      { key: "--avatar-d-size", label: "D サイズ", unit: "rem", min: 1, max: 8, step: 0.1, default: 3 },
      { key: "--avatar-a-pos-x", label: "A（自分）位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--avatar-a-pos-y", label: "A（自分）位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: 1.9 },
      { key: "--avatar-b-pos-x", label: "B 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: -3.5 },
      { key: "--avatar-b-pos-y", label: "B 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: 0.1 },
      { key: "--avatar-c-pos-x", label: "C 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0.1 },
      { key: "--avatar-c-pos-y", label: "C 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: -6.8 },
      { key: "--avatar-d-pos-x", label: "D 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 3.5 },
      { key: "--avatar-d-pos-y", label: "D 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: -0.1 },
    ],
  },
  {
    title: "手札の位置（盤面中心からのずれ）",
    category: "position",
    controls: [
      { key: "--hand-a-pos-x", label: "A（自分）位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-a-pos-y", label: "A（自分）位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: -1.5 },
      { key: "--hand-b-pos-x", label: "B 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: -0.3 },
      { key: "--hand-b-pos-y", label: "B 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-c-pos-x", label: "C 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-c-pos-y", label: "C 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: -3 },
      { key: "--hand-d-pos-x", label: "D 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-d-pos-y", label: "D 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
    ],
  },
  {
    title: "手札エリアのサイズ（手札3枚時が基準。枚数に応じて自動で伸縮）",
    category: "position",
    controls: [
      { key: "--hand-a-size", label: "A（自分）サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 13 },
      { key: "--hand-b-size", label: "B サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 6 },
      { key: "--hand-c-size", label: "C サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 6 },
      { key: "--hand-d-size", label: "D サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 6 },
    ],
  },
  {
    title: "手札エリアの厚み（扇が伸びない方向。固定値、ロックエリアとの干渉調整用）",
    category: "position",
    controls: [
      { key: "--hand-a-thickness", label: "A（自分）厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 7 },
      { key: "--hand-b-thickness", label: "B 厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 4 },
      { key: "--hand-c-thickness", label: "C 厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 4 },
      { key: "--hand-d-thickness", label: "D 厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 4 },
    ],
  },
  {
    title: "山札",
    category: "position",
    controls: [
      { key: "--deck-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--deck-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 4.1 },
      { key: "--deck-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 1.5 },
    ],
  },
  {
    title: "捨て場",
    category: "position",
    controls: [
      { key: "--discard-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--discard-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: -4.1 },
      { key: "--discard-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: -3.7 },
    ],
  },
  {
    title: "エターナルカード",
    category: "position",
    controls: [
      { key: "--eternal-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--eternal-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 4.1 },
      { key: "--eternal-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: -3.7 },
    ],
  },
  {
    title: "ファーストカード",
    category: "position",
    controls: [
      { key: "--first-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--first-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: -4.1 },
      { key: "--first-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 1.5 },
    ],
  },
  {
    // 「アイコン再配置モード」（下のTOGGLE_SECTIONS参照）でドラッグした分のズレも、
    // ここと同じCSS変数へ直接書き込む（icon-rearrange.js参照）ため、ドラッグでも
    // スライダーでも同じ値を共有し、どちらで動かしても「出力をコピー」に反映される。
    title: "アイコンの位置調整（自由配置）",
    category: "position",
    controls: [
      { key: "--icon-pos-hand-shuffle-x", label: "手札シャッフル 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: -8.17 },
      { key: "--icon-pos-hand-shuffle-y", label: "手札シャッフル 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: 11.38 },
      { key: "--icon-pos-board-zoom-x", label: "盤面拡大 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: -0.29 },
      { key: "--icon-pos-board-zoom-y", label: "盤面拡大 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: -1.08 },
      { key: "--icon-pos-draw-x", label: "1枚ドロー 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: -6.21 },
      { key: "--icon-pos-draw-y", label: "1枚ドロー 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: -2.17 },
      { key: "--icon-pos-end-turn-x", label: "ターン終了 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--icon-pos-end-turn-y", label: "ターン終了 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--icon-pos-options-x", label: "オプション 位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--icon-pos-options-y", label: "オプション 位置Y", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
    ],
  },
];

const CONTROLS = GROUPS.flatMap((g) => g.controls);

// セットアップウィザード（game-setup.js）の「０：プレイ人数選択」で、2人/3人プレイ時の
// 座席をどう決めるか。CSS変数のスライダー群とは性質が異なる（見た目の微調整ではなく
// 挙動の切り替え）ため、GROUPS/CONTROLSとは別に単純なbool値として持つ。
let manualSeatMode = false;

export function isManualSeatMode() {
  return manualSeatMode;
}

// ロックしていても使えるカード（ファーストカード・エターナルカード）をロックエリア内で
// 目立たせる演出の種類。"orbit"=色の球がふちを回る（デフォルト）、"shine"=斜めに光る帯が
// 定期的に横切る。main.jsのbuildFlatCardが参照する。
let usableLockedEffect = "orbit";

export function getUsableLockedEffect() {
  return usableLockedEffect;
}

// カード到達モーダル（駒がカードに乗った時、src/card-arrival.js）を時間で自動的に消すか、
// 触るまで消さずに残すか。ユーザー要望「プレイヤーはカードを見ながら到達効果を処理したい」
// に合わせ、デフォルトは「消えない」（触ると消える）。
let cardArrivalModalPersistent = true;

export function isCardArrivalModalPersistent() {
  return cardArrivalModalPersistent;
}

// アイコン再配置モード。ONの間、5つのアイコンボタン（手札シャッフル・盤面拡大・
// 1枚ドロー・ターン終了・オプション）を画面上で直接ドラッグして自由に動かせる
// （icon-rearrange.js参照）。移動量は上の「アイコンの位置調整（自由配置）」グループと
// 同じCSS変数に書き込まれるため、動かした結果はスライダー・「出力をコピー」の両方に
// そのまま反映される。ドラッグ操作そのものを許可するかどうかのモード切替なので、
// GROUPS/CONTROLSの仕組みには乗せず単純なbool値として持つ（manualSeatMode等と同じ）。
let iconRearrangeMode = false;

export function isIconRearrangeMode() {
  return iconRearrangeMode;
}

// ゲートマス（各辺中央の4マス）を、光の色をした台座のように少しだけ高く見せる演出。
// デフォルトON。main.jsのbuildBoard()がこのフラグを見て、駒/カードの当たり判定には
// 影響しない装飾専用の子要素(.gate-pedestal、pointer-events:none)を表示/非表示する。
let gatePedestalVisible = true;

export function isGatePedestalVisible() {
  return gatePedestalVisible;
}

// 画面全体の明るさモード。「スタンダードモード」（デフォルト、従来通り）と
// 「スポットライトモード」（盤面付近だけ明るく、周辺を暗くする）。main.jsが
// body.spotlight-modeクラスの付け外しに使うCSS(#spotlight-overlay)を実際に描画する。
let spotlightMode = false;

export function isSpotlightMode() {
  return spotlightMode;
}

// ターンタイマー（ロープ・砂時計・優先権、src/turn-timer.js）。実質オンライン対戦向けの
// 機能でローカルモードでは緊張感が無いため、デフォルトはオフ。GROUPS/CONTROLSのCSS変数
// スライダーとは性質が異なる（見た目ではなくゲームロジックのパラメータ）ため、
// manualSeatMode等と同じくここに単純な数値/bool変数として持つ。
let turnTimerEnabled = false;
let initialHourglassStock = 1;
let maxHourglassStock = 3;
let ropeBaseSeconds = 30;
let ropeExtensionSeconds = 30;
let turnsToReplenishHourglass = 3;
// 砂時計を1個でも使い始めた後は、行動でリセットされる基本時間の窓がこの秒数を上限に
// 縮む（そのターンが終わるまで）。ターンが変わると通常のropeBaseSecondsに戻る。
let reducedBaseSeconds = 10;

export function isTurnTimerEnabled() {
  return turnTimerEnabled;
}
export function getInitialHourglassStock() {
  return initialHourglassStock;
}
export function getMaxHourglassStock() {
  return maxHourglassStock;
}
export function getRopeBaseSeconds() {
  return ropeBaseSeconds;
}
export function getRopeExtensionSeconds() {
  return ropeExtensionSeconds;
}
export function getTurnsToReplenishHourglass() {
  return turnsToReplenishHourglass;
}
export function getReducedBaseSeconds() {
  return reducedBaseSeconds;
}

// TOGGLE_SECTIONSの各buildContentはモジュール直下で定義される共有クロージャのため、
// buildPanel()内のローカル変数であるupdateExport()を直接呼べない。「更新して」を伝える
// 間接参照として、rebuildSlidersRefと同じ形のref経由で呼ぶ。
const updateExportRef = { current: () => {} };

// ターンタイマー設定用の数値入力行（ラベル + <input type="number"> + 単位）。CSS変数の
// スライダー(GROUPS/CONTROLS)とは違い、ゲームロジックのパラメータ（見た目ではなく数値その
// ものが意味を持つ）なのでinput[type=range]ではなくnumberにしてある。
function buildNumberRow(label, value, { min, max, step = 1, unit = "" }, onChange) {
  const row = document.createElement("label");
  row.style.cssText = "display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.3rem;";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  labelEl.style.cssText = "flex: 1;";
  const input = document.createElement("input");
  input.type = "number";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  // 明示的に背景・文字色を指定しないと、この管理者パネルの暗い配色の下でinput[type=number]の
  // 既定スタイル（薄いグレー文字）が読めないほど薄くなってしまうため、出力欄(#admin-export)と
  // 同系統の配色を明示する。
  input.style.cssText =
    "width: 4.5rem; background: #0f1520; color: #f1f5f9; border: 1px solid rgba(148,163,184,0.4); border-radius: 0.25rem; padding: 0.15rem 0.3rem;";
  input.addEventListener("change", () => {
    const num = Number(input.value);
    if (!Number.isFinite(num)) return;
    const clamped = Math.min(max, Math.max(min, num));
    input.value = String(clamped);
    onChange(clamped);
    updateExportRef.current();
  });
  const unitEl = document.createElement("span");
  unitEl.textContent = unit;
  row.appendChild(labelEl);
  row.appendChild(input);
  row.appendChild(unitEl);
  return row;
}

// 単純なON/OFFトグル系のセクション（GROUPSのCSS変数スライダーとは性質が異なる）も、
// カテゴリ分けの対象にするためこの配列にまとめておく。buildPanel()がcategoryごとに
// GROUPSと合わせて振り分ける。
const TOGGLE_SECTIONS = [
  {
    title: "セットアップウィザード",
    category: "behavior",
    buildContent: (content) => {
      const seatModeRow = document.createElement("label");
      seatModeRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const seatModeCheckbox = document.createElement("input");
      seatModeCheckbox.type = "checkbox";
      seatModeCheckbox.checked = manualSeatMode;
      seatModeCheckbox.addEventListener("change", () => {
        manualSeatMode = seatModeCheckbox.checked;
        window.dispatchEvent(new CustomEvent("admin:change"));
        updateExportRef.current();
      });
      const seatModeLabel = document.createElement("span");
      seatModeLabel.textContent = "2人/3人プレイの座席を自由に選べるようにする（オフ=人数から自動選択）";
      seatModeRow.appendChild(seatModeCheckbox);
      seatModeRow.appendChild(seatModeLabel);
      content.appendChild(seatModeRow);
    },
  },
  {
    title: "手番プレイヤー演出",
    category: "effect",
    buildContent: (content) => {
      const turnGlowRow = document.createElement("label");
      turnGlowRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const turnGlowCheckbox = document.createElement("input");
      turnGlowCheckbox.type = "checkbox";
      turnGlowCheckbox.checked = document.documentElement.style.getPropertyValue("--turn-glow-rgb").trim() === "255, 255, 255";
      turnGlowCheckbox.addEventListener("change", () => {
        setVar("--turn-glow-rgb", turnGlowCheckbox.checked ? "255, 255, 255" : "255, 224, 130", "");
        updateExportRef.current();
      });
      const turnGlowLabel = document.createElement("span");
      turnGlowLabel.textContent = "ロックエリア・アバターの手番グローを白色にする（オフ=黄色）";
      turnGlowRow.appendChild(turnGlowCheckbox);
      turnGlowRow.appendChild(turnGlowLabel);
      content.appendChild(turnGlowRow);
    },
  },
  {
    title: "ロック中でも使えるカードの強調演出",
    category: "effect",
    buildContent: (content) => {
      const effectRow = document.createElement("label");
      effectRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const effectCheckbox = document.createElement("input");
      effectCheckbox.type = "checkbox";
      effectCheckbox.checked = usableLockedEffect === "shine";
      effectCheckbox.addEventListener("change", () => {
        usableLockedEffect = effectCheckbox.checked ? "shine" : "orbit";
        window.dispatchEvent(new CustomEvent("admin:change"));
        updateExportRef.current();
      });
      const effectLabel = document.createElement("span");
      effectLabel.textContent = "斜めに光る帯にする（オフ=色の球がふちを回る）";
      effectRow.appendChild(effectCheckbox);
      effectRow.appendChild(effectLabel);
      content.appendChild(effectRow);
    },
  },
  {
    title: "カード到達モーダルの消え方",
    category: "effect",
    buildContent: (content) => {
      const persistRow = document.createElement("label");
      persistRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const persistCheckbox = document.createElement("input");
      persistCheckbox.type = "checkbox";
      persistCheckbox.checked = cardArrivalModalPersistent;
      persistCheckbox.addEventListener("change", () => {
        cardArrivalModalPersistent = persistCheckbox.checked;
        updateExportRef.current();
      });
      const persistLabel = document.createElement("span");
      persistLabel.textContent =
        "時間で自動的に消さない（触ると消える。オフ=右上の「カード到達モーダル」グループの表示時間で自動的に消える）";
      persistRow.appendChild(persistCheckbox);
      persistRow.appendChild(persistLabel);
      content.appendChild(persistRow);
    },
  },
  {
    title: "ゲートマスの台座演出",
    category: "effect",
    buildContent: (content) => {
      const pedestalRow = document.createElement("label");
      pedestalRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const pedestalCheckbox = document.createElement("input");
      pedestalCheckbox.type = "checkbox";
      pedestalCheckbox.checked = gatePedestalVisible;
      pedestalCheckbox.addEventListener("change", () => {
        gatePedestalVisible = pedestalCheckbox.checked;
        window.dispatchEvent(new CustomEvent("admin:change"));
        updateExportRef.current();
      });
      const pedestalLabel = document.createElement("span");
      pedestalLabel.textContent = "ゲートマス（4辺の中央）を台座のように少し高く見せる（ライトグレー）";
      pedestalRow.appendChild(pedestalCheckbox);
      pedestalRow.appendChild(pedestalLabel);
      content.appendChild(pedestalRow);
    },
  },
  {
    title: "画面の明るさモード",
    category: "effect",
    buildContent: (content) => {
      const spotlightRow = document.createElement("label");
      spotlightRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const spotlightCheckbox = document.createElement("input");
      spotlightCheckbox.type = "checkbox";
      spotlightCheckbox.checked = spotlightMode;
      spotlightCheckbox.addEventListener("change", () => {
        spotlightMode = spotlightCheckbox.checked;
        document.body.classList.toggle("spotlight-mode", spotlightMode);
        updateExportRef.current();
      });
      const spotlightLabel = document.createElement("span");
      spotlightLabel.textContent = "スポットライトモードにする（盤面付近だけ明るく、周辺を暗くする。オフ=スタンダードモード）";
      spotlightRow.appendChild(spotlightCheckbox);
      spotlightRow.appendChild(spotlightLabel);
      content.appendChild(spotlightRow);
    },
  },
  {
    title: "アイコン再配置モード",
    category: "position",
    buildContent: (content) => {
      const rearrangeRow = document.createElement("label");
      rearrangeRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer;";
      const rearrangeCheckbox = document.createElement("input");
      rearrangeCheckbox.type = "checkbox";
      rearrangeCheckbox.checked = iconRearrangeMode;
      rearrangeCheckbox.addEventListener("change", () => {
        iconRearrangeMode = rearrangeCheckbox.checked;
        document.body.classList.toggle("icon-rearrange-mode", iconRearrangeMode);
      });
      const rearrangeLabel = document.createElement("span");
      rearrangeLabel.textContent = "ONにする（手札シャッフル・盤面拡大・1枚ドロー・ターン終了・オプションの5アイコンを直接ドラッグして動かせます）";
      rearrangeRow.appendChild(rearrangeCheckbox);
      rearrangeRow.appendChild(rearrangeLabel);
      content.appendChild(rearrangeRow);

      const note = document.createElement("div");
      note.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; line-height: 1.5;";
      note.textContent =
        "動かした結果は上の「📐 位置合わせ」カテゴリ内「アイコンの位置調整（自由配置）」" +
        "グループの値としてそのまま反映されます。移動し終えたら下の「出力をコピー」を押して、" +
        "その内容を開発者に伝えてください。";
      content.appendChild(note);
    },
  },
  {
    title: "ターンタイマー（ロープ・砂時計）",
    category: "behavior",
    buildContent: (content) => {
      const enableRow = document.createElement("label");
      enableRow.style.cssText = "display: flex; align-items: center; gap: 0.4rem; cursor: pointer; margin-bottom: 0.5rem;";
      const enableCheckbox = document.createElement("input");
      enableCheckbox.type = "checkbox";
      enableCheckbox.checked = turnTimerEnabled;
      enableCheckbox.addEventListener("change", () => {
        turnTimerEnabled = enableCheckbox.checked;
        window.dispatchEvent(new CustomEvent("admin:change"));
        updateExportRef.current();
      });
      const enableLabel = document.createElement("span");
      enableLabel.textContent = "機能を有効にする（オフ=ロープ/砂時計バッジ/警告/優先権譲渡ボタンを一切表示しない）";
      enableRow.appendChild(enableCheckbox);
      enableRow.appendChild(enableLabel);
      content.appendChild(enableRow);

      const onlineNote = document.createElement("div");
      onlineNote.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.6rem; line-height: 1.5;";
      onlineNote.textContent =
        "※ オンライン対戦では、ここの設定（この行と下の6項目全て）は「ゲームを開始する」を" +
        "押した人の、押した瞬間の設定が対局全体で固定されて使われます。対局が始まった後に" +
        "誰かがここを変更しても、その対局には反映されません（不公平にならないための仕様）。" +
        "有効にしたい場合は、部屋を開始する人が事前にオンにしておいてください。";
      content.appendChild(onlineNote);

      content.appendChild(
        buildNumberRow("初期の砂時計個数", initialHourglassStock, { min: 0, max: 4, unit: "個" }, (v) => {
          initialHourglassStock = v;
        })
      );
      content.appendChild(
        buildNumberRow("最大保持数", maxHourglassStock, { min: 0, max: 6, unit: "個" }, (v) => {
          maxHourglassStock = v;
        })
      );
      content.appendChild(
        buildNumberRow("基本時間", ropeBaseSeconds, { min: 10, max: 120, unit: "秒" }, (v) => {
          ropeBaseSeconds = v;
        })
      );
      content.appendChild(
        buildNumberRow("延長時間（砂時計1個あたり）", ropeExtensionSeconds, { min: 10, max: 120, unit: "秒" }, (v) => {
          ropeExtensionSeconds = v;
        })
      );
      content.appendChild(
        buildNumberRow("補充に必要なターン数", turnsToReplenishHourglass, { min: 1, max: 10, unit: "ターン" }, (v) => {
          turnsToReplenishHourglass = v;
        })
      );
      content.appendChild(
        buildNumberRow(
          "砂時計を使い始めた後の基本時間の上限",
          reducedBaseSeconds,
          { min: 3, max: 60, unit: "秒" },
          (v) => {
            reducedBaseSeconds = v;
          }
        )
      );
    },
  },
];

function currentValue(key, fallback) {
  const inline = document.documentElement.style.getPropertyValue(key).trim();
  if (inline) return parseFloat(inline);
  const computed = getComputedStyle(document.documentElement).getPropertyValue(key).trim();
  const parsed = parseFloat(computed);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function setVar(key, value, unit) {
  document.documentElement.style.setProperty(key, `${value}${unit}`);
}

// 項目が増えて縦に長くなりすぎないよう、各セクションを<details>で開閉できるようにする
// （デフォルトは閉じた状態。今調整したいセクションだけ開けば済むようにして、パネル全体の
// 見た目をコンパクトに保つ）。
function buildSection(title, buildContent) {
  const details = document.createElement("details");
  details.style.cssText = "margin-top: 0.4rem; border-top: 1px solid rgba(148, 163, 184, 0.25); padding-top: 0.4rem;";
  const summary = document.createElement("summary");
  summary.textContent = title;
  summary.style.cssText = "cursor: pointer; font-weight: bold; color: #7dd3fc;";
  details.appendChild(summary);
  const content = document.createElement("div");
  content.style.cssText = "margin-top: 0.4rem;";
  buildContent(content);
  details.appendChild(content);
  return details;
}

// カテゴリ（大項目）用。個々のセクションと見分けやすいよう、少し濃い背景と大きめの見出しにする。
// 中の個別セクションと同じく、デフォルトは閉じた状態（パネルを開いた直後の見た目をコンパクトに
// 保つため）。
function buildCategory(label) {
  const details = document.createElement("details");
  details.style.cssText = "margin-top: 0.6rem; background: rgba(56, 189, 248, 0.06); border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 0.35rem; padding: 0.4rem 0.5rem;";
  const summary = document.createElement("summary");
  summary.textContent = label;
  summary.style.cssText = "cursor: pointer; font-weight: bold; color: #e0f2fe; font-size: 0.85rem;";
  details.appendChild(summary);
  return details;
}

function buildPanel(rebuildSlidersRef) {
  const panel = document.createElement("div");
  panel.id = "admin-panel";
  panel.style.cssText = `
    position: fixed; top: 1rem; left: 1rem; z-index: 1000;
    background: rgba(15, 23, 32, 0.95); border: 1px solid rgba(148,163,184,0.4);
    border-radius: 0.5rem; padding: 0.75rem; width: 19rem; max-height: 90vh;
    overflow-y: auto; box-sizing: border-box;
    font-family: sans-serif; font-size: 0.75rem; color: #e2e8f0;
    display: none;
  `;

  const title = document.createElement("div");
  title.textContent = "管理者モード：位置合わせ";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.5rem; padding-right: 1.6rem;";
  panel.appendChild(title);

  function buildGroupSection(group) {
    return buildSection(group.title, (content) => {
      for (const c of group.controls) {
        const row = document.createElement("div");
        row.style.cssText = "margin-bottom: 0.5rem;";

        const labelRow = document.createElement("div");
        labelRow.style.cssText = "display: flex; justify-content: space-between; margin-bottom: 0.15rem;";
        const label = document.createElement("span");
        label.textContent = c.label;
        const valueLabel = document.createElement("span");
        valueLabel.id = `admin-value-${c.key}`;
        labelRow.appendChild(label);
        labelRow.appendChild(valueLabel);

        const slider = document.createElement("input");
        slider.type = "range";
        slider.dataset.key = c.key;
        slider.min = String(c.min);
        slider.max = String(c.max);
        slider.step = String(c.step);
        slider.style.width = "100%";
        const initial = currentValue(c.key, c.default);
        slider.value = String(initial);
        valueLabel.textContent = `${initial}${c.unit}`;

        slider.addEventListener("input", () => {
          setVar(c.key, slider.value, c.unit);
          valueLabel.textContent = `${slider.value}${c.unit}`;
          updateExport();
          // 手札エリアのサイズ(--hand-*-size)等、CSSではなくJS側で読み取って適用している値は
          // CSS変数を変えるだけでは画面に反映されない。main.js側にrender()し直してもらう。
          window.dispatchEvent(new CustomEvent("admin:change"));
        });

        row.appendChild(labelRow);
        row.appendChild(slider);
        content.appendChild(row);
      }
    });
  }

  // 項目数が増えて縦に長くなりすぎたため、GROUPS/TOGGLE_SECTIONSをそれぞれのcategoryごとに
  // 大項目<details>の中へ振り分けて配置する（CATEGORIESの並び順を採用）。
  for (const cat of CATEGORIES) {
    const categoryEl = buildCategory(cat.label);
    for (const toggle of TOGGLE_SECTIONS) {
      if (toggle.category === cat.key) {
        categoryEl.appendChild(buildSection(toggle.title, toggle.buildContent));
      }
    }
    for (const group of GROUPS) {
      if (group.category === cat.key) {
        categoryEl.appendChild(buildGroupSection(group));
      }
    }
    panel.appendChild(categoryEl);
  }

  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = "display: flex; gap: 0.4rem; margin-top: 0.6rem;";

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "リセット";
  resetBtn.style.cssText = "flex: 1; padding: 0.3rem; background: #334155; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  resetBtn.addEventListener("click", () => {
    for (const c of CONTROLS) {
      setVar(c.key, c.default, c.unit);
    }
    rebuildSlidersRef.current();
    updateExport();
    window.dispatchEvent(new CustomEvent("admin:change"));
  });

  const copyBtn = document.createElement("button");
  copyBtn.textContent = "出力をコピー";
  copyBtn.style.cssText = "flex: 1; padding: 0.3rem; background: #0891b2; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  copyBtn.addEventListener("click", async () => {
    const text = exportEl.value;
    try {
      await navigator.clipboard.writeText(text);
      copyBtn.textContent = "コピーしました！";
    } catch {
      copyBtn.textContent = "コピー失敗（手動で選択してください）";
    }
    setTimeout(() => (copyBtn.textContent = "出力をコピー"), 1500);
  });

  buttonRow.appendChild(resetBtn);
  buttonRow.appendChild(copyBtn);
  panel.appendChild(buttonRow);

  const exportLabel = document.createElement("div");
  exportLabel.textContent = "この内容をそのまま開発者に伝えてください：";
  exportLabel.style.cssText = "margin-top: 0.6rem; opacity: 0.8;";
  panel.appendChild(exportLabel);

  const exportEl = document.createElement("textarea");
  exportEl.id = "admin-export";
  exportEl.readOnly = true;
  exportEl.style.cssText = "width: 100%; height: 12rem; margin-top: 0.3rem; background: #0f1520; color: #a5f3fc; font-family: monospace; font-size: 0.7rem; border: 1px solid rgba(148,163,184,0.3); border-radius: 0.25rem; padding: 0.4rem; box-sizing: border-box;";
  panel.appendChild(exportEl);

  function rebuildSliders() {
    for (const c of CONTROLS) {
      const value = currentValue(c.key, c.default);
      const input = panel.querySelector(`input[data-key="${c.key}"]`);
      const valueLabel = document.getElementById(`admin-value-${c.key}`);
      if (valueLabel) valueLabel.textContent = `${value}${c.unit}`;
      if (input) input.value = String(value);
    }
  }
  rebuildSlidersRef.current = rebuildSliders;

  // 「管理者モードの設定内容はすべて出力できるように」の対応。CSS変数のスライダー(CONTROLS)
  // だけでなく、GROUPS/CONTROLSの仕組みに乗っていないON/OFFトグル（manualSeatMode・
  // 手番グローの色・ロック中カードの強調演出の種類）も出力に含める。CSS変数ではないので
  // :rootブロックの外に、コメント付きの別ブロックとして追記する。
  function updateExport() {
    const lines = CONTROLS.map((c) => `  ${c.key}: ${currentValue(c.key, c.default)}${c.unit};`);
    const turnGlowWhite = document.documentElement.style.getPropertyValue("--turn-glow-rgb").trim() === "255, 255, 255";
    const toggleLines = [
      `manualSeatMode: ${manualSeatMode}`,
      `turnGlowWhite: ${turnGlowWhite}`,
      `usableLockedEffect: "${usableLockedEffect}"`,
      `cardArrivalModalPersistent: ${cardArrivalModalPersistent}`,
      `gatePedestalVisible: ${gatePedestalVisible}`,
      `spotlightMode: ${spotlightMode}`,
      `turnTimerEnabled: ${turnTimerEnabled}`,
      `initialHourglassStock: ${initialHourglassStock}`,
      `maxHourglassStock: ${maxHourglassStock}`,
      `ropeBaseSeconds: ${ropeBaseSeconds}`,
      `ropeExtensionSeconds: ${ropeExtensionSeconds}`,
      `turnsToReplenishHourglass: ${turnsToReplenishHourglass}`,
      `reducedBaseSeconds: ${reducedBaseSeconds}`,
    ];
    exportEl.value = `:root {\n${lines.join("\n")}\n}\n\n/* 以下はCSS変数ではない設定（管理者モードのチェックボックス等） */\n${toggleLines.join("\n")}`;
  }
  updateExportRef.current = updateExport;

  updateExport();
  return panel;
}

let openAdminPanelFn = null;

// options-menu.js（右上「⚙ オプション」の中の「管理者モード」項目）から呼ぶ。
// 以前はこのモジュール自身が左上に専用の呼び出しボタンを持っていたが、オプションメニューに
// 統合したため、パネルの開閉トリガーだけをここから外部提供する形にした。
export function openAdminPanel() {
  if (openAdminPanelFn) openAdminPanelFn();
}

export function initAdminMode() {
  const rebuildSlidersRef = { current: () => {} };
  const panel = buildPanel(rebuildSlidersRef);

  // icon-rearrange.jsが、アイコンのドラッグ再配置が1回終わるたびに発火する。スライダーの
  // 表示値・出力欄をその場で最新化する（パネルが閉じていても軽い処理なので無条件に行う）。
  window.addEventListener("admin:icon-rearrange-change", () => {
    rebuildSlidersRef.current();
    updateExportRef.current();
  });

  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
    panel.style.display = "block";
    backdrop.style.display = "block";
  }
  openAdminPanelFn = open;

  // ツールパネルなので背景は暗くしない（盤面を見ながら調整したいため）が、外側クリックで
  // 閉じられるようにする（今後追加するパネル/モーダルもこの閉じ方に統一する）。
  const backdrop = createBackdrop(close, { dim: false, zIndex: 999 });
  backdrop.style.display = "none";
  panel.appendChild(createModalCloseX(close));

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
}
