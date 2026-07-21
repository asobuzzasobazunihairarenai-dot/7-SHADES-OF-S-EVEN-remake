// 管理者モードの「自分専用ステータスエリア再配置モード」。ONの間、左下ステータスエリアの
// 5つのアイコン（アバター・駒スキン・カード裏面・プレイマット・オンライン状態）を画面上で
// 直接ドラッグして位置を、マウスホイールでサイズを、それぞれ直感的に調整できる。
//
// icon-rearrange.js（手札シャッフル等5ボタンの再配置）と同じ設計方針を踏襲する:
// 各アイコンの基準位置・基準サイズは変えず、そこからのズレ・実際のサイズだけを専用の
// CSS変数（--self-status-icon-{avatar,piece,cardback,playmat,online}-pos-x/y・-size、
// admin.jsのGROUPSにスライダーとしても登録済み）へ書き込む。ドラッグでの再配置・ホイールでの
// リサイズ・スライダーでの微調整のどれも同じ値を共有するため、「出力をコピー」にも
// 自動的に反映される。
//
// document自体へcapture:trueで委譲リスナーを登録する（icon-rearrange.jsと同じ理由:
// 各アイコンは既にクリックでピッカーを開く・ホバーでツールチップを出す等の独自リスナーを
// 持っているため、ボタン自身に後から素朴にリスナーを足すと発火順序が不安定になる。
// キャプチャフェーズなら常にターゲット本体のリスナーより先に完了するため、確実に割り込める）。

import { isSelfStatusRearrangeMode } from "./admin.js";

const SELECTOR =
  ".self-status-avatar, .self-status-piece-thumb, .self-status-card-back-thumb, .self-status-playmat-thumb, #self-status-online";

const VARS_BY_CLASS = {
  "self-status-avatar": { pos: ["--self-status-icon-avatar-pos-x", "--self-status-icon-avatar-pos-y"], size: "--self-status-icon-avatar-size" },
  "self-status-piece-thumb": { pos: ["--self-status-icon-piece-pos-x", "--self-status-icon-piece-pos-y"], size: "--self-status-icon-piece-size" },
  "self-status-card-back-thumb": { pos: ["--self-status-icon-cardback-pos-x", "--self-status-icon-cardback-pos-y"], size: "--self-status-icon-cardback-size" },
  "self-status-playmat-thumb": { pos: ["--self-status-icon-playmat-pos-x", "--self-status-icon-playmat-pos-y"], size: "--self-status-icon-playmat-size" },
};

const ONLINE_VARS = { pos: ["--self-status-icon-online-pos-x", "--self-status-icon-online-pos-y"], size: "--self-status-icon-online-size" };

const SIZE_MIN_REM = 1.2;
const SIZE_MAX_REM = 6;

function resolveVars(el) {
  if (el.id === "self-status-online") return ONLINE_VARS;
  for (const cls of Object.keys(VARS_BY_CLASS)) {
    if (el.classList.contains(cls)) return VARS_BY_CLASS[cls];
  }
  return null;
}

function remToPx() {
  return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function currentRem(varName, fallback = 0) {
  const inline = document.documentElement.style.getPropertyValue(varName).trim();
  const parsed = parseFloat(inline || getComputedStyle(document.documentElement).getPropertyValue(varName));
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ドラッグ中・ホイール中に毎回admin:self-status-rearrange-changeを発火するとスライダー
// 再構築が頻発して無駄なため、少し間を置いてから1回だけ発火する（icon-rearrange.jsは
// ドラッグ終了時の1回だけだが、ホイールは「終了」の合図が無いため、この間引き方式にした）。
let notifyTimer = null;
function scheduleChangeNotify() {
  if (notifyTimer) clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    window.dispatchEvent(new CustomEvent("admin:self-status-rearrange-change"));
  }, 250);
}

function startDrag(el, varX, varY, e) {
  const startX = e.clientX;
  const startY = e.clientY;
  const remPx = remToPx();
  const baseX = currentRem(varX);
  const baseY = currentRem(varY);
  el.classList.add("is-rearranging");

  function onMove(ev) {
    const dxRem = (ev.clientX - startX) / remPx;
    const dyRem = (ev.clientY - startY) / remPx;
    document.documentElement.style.setProperty(varX, `${(baseX + dxRem).toFixed(2)}rem`);
    document.documentElement.style.setProperty(varY, `${(baseY + dyRem).toFixed(2)}rem`);
  }
  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    el.classList.remove("is-rearranging");
    scheduleChangeNotify();
  }
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
}

function onPointerDownCapture(e) {
  if (!isSelfStatusRearrangeMode()) return;
  const el = e.target.closest(SELECTOR);
  if (!el) return;
  const vars = resolveVars(el);
  if (!vars) return;
  e.preventDefault();
  e.stopPropagation();
  startDrag(el, vars.pos[0], vars.pos[1], e);
}

function onClickCapture(e) {
  if (!isSelfStatusRearrangeMode()) return;
  const el = e.target.closest(SELECTOR);
  if (!el) return;
  // 再配置モード中は本来のクリック操作（ピッカーを開く・アバター編集等）を発生させない。
  e.preventDefault();
  e.stopPropagation();
}

function onWheelCapture(e) {
  if (!isSelfStatusRearrangeMode()) return;
  const el = e.target.closest(SELECTOR);
  if (!el) return;
  const vars = resolveVars(el);
  if (!vars) return;
  e.preventDefault();
  e.stopPropagation();
  const current = currentRem(vars.size, 2.6);
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  const next = Math.min(SIZE_MAX_REM, Math.max(SIZE_MIN_REM, current + delta));
  document.documentElement.style.setProperty(vars.size, `${next.toFixed(2)}rem`);
  scheduleChangeNotify();
}

export function initSelfStatusRearrange() {
  document.addEventListener("pointerdown", onPointerDownCapture, true);
  document.addEventListener("click", onClickCapture, true);
  document.addEventListener("wheel", onWheelCapture, { capture: true, passive: false });
}
