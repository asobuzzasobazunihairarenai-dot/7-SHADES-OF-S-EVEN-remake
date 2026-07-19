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
      { key: "--camera-offset-y", label: "上下（Y軸）位置", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
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
      { key: "--board-zoom-margin", label: "余白（小さいほど余白が増える）", unit: "", min: 0.5, max: 1, step: 0.01, default: 0.8 },
      { key: "--board-zoom-offset-x", label: "位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--board-zoom-offset-y", label: "位置Y", unit: "rem", min: -30, max: 30, step: 0.1, default: -2 },
      { key: "--board-zoom-reference-height", label: "基準の高さ（ウィンドウサイズに依存させないための固定値）", unit: "px", min: 400, max: 2000, step: 10, default: 800 },
    ],
  },
  {
    title: "盤面拡大ボタン（2段階目「もっと拡大」）のズーム位置調整",
    category: "position",
    controls: [
      { key: "--board-zoom-2-margin", label: "余白（大きいほど拡大される）", unit: "", min: 1, max: 2, step: 0.01, default: 1.13 },
      { key: "--board-zoom-2-offset-x", label: "位置X", unit: "rem", min: -20, max: 20, step: 0.1, default: 0 },
      { key: "--board-zoom-2-offset-y", label: "位置Y", unit: "rem", min: -30, max: 30, step: 0.1, default: -2.5 },
      { key: "--board-zoom-2-reference-height", label: "基準の高さ（ウィンドウサイズに依存させないための固定値）", unit: "px", min: 400, max: 2000, step: 10, default: 800 },
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
      { key: "--avatar-size", label: "サイズ（共通）", unit: "rem", min: 1, max: 8, step: 0.1, default: 3 },
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

// TOGGLE_SECTIONSの各buildContentはモジュール直下で定義される共有クロージャのため、
// buildPanel()内のローカル変数であるupdateExport()を直接呼べない。「更新して」を伝える
// 間接参照として、rebuildSlidersRefと同じ形のref経由で呼ぶ。
const updateExportRef = { current: () => {} };

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
