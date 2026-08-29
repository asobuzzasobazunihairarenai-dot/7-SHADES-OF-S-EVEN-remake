// 画面右上の「⚙ オプション」ボタン。押すと開発者/管理者向けの各種ツールや、プレイヤーが
// その場で切り替えたい基本設定をまとめた小さなドロップダウンが開く。以前は「⚙ 管理者モード」が
// 単独のボタンとして左上にあったが、ここに統合し、左上はゲームタイトル表示用に空けた。

import { openAdminPanel } from "./admin.js";
import { getLang, setLang, SUPPORTED_LANGS, LANG_LABEL, onLangChange } from "./i18n.js";
import { t } from "./ui-text.js";
import { isAutoDragRestrictionEnabled, setAutoDragRestrictionEnabled } from "./auto-drag-restriction.js";
import { openActionLogPanel } from "./action-log.js";
import { markCleanExit } from "./crash-blackbox.js";
import { openCardDevMode } from "./card-dev-mode.js";
import { isProfileLayoutEditMode, setProfileLayoutEditMode } from "./profile-layout-editor.js";
import { isAutoProcessingEnabled, setAutoProcessingEnabled } from "./card-effect-engine.js";
import {
  isPseudoCpuModeEnabled,
  setPseudoCpuModeEnabled,
  isPseudoCpuIncludeSelf,
  setPseudoCpuIncludeSelf,
  getPseudoCpuDeadlineMs,
  setPseudoCpuDeadlineMs,
} from "./admin.js";
import { openDeckViewer } from "./deck-viewer.js";
import { isLockAreaBarVisible, setLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible, setLockColorVisible } from "./lock-color.js";
import { isActionConfirmEnabled, setActionConfirmEnabled } from "./action-confirm-prefs.js";
import { isBoardIllustOnly, setBoardIllustOnly } from "./board-card-display.js";
import { isFixedHandEnabled, setFixedHandEnabled } from "./fixed-hand.js";
import { getSoundVolume, setSoundVolume, getBgmVolume, setBgmVolume } from "./sound.js";
import { setCardPreviewSize, getCardPreviewSide, setCardPreviewSide } from "./card-preview-size.js";
import {
  getCpuSpeed,
  setCpuSpeed,
  isCpuAutoSkipEnabled,
  setCpuAutoSkipEnabled,
  getCpuDifficulty,
  setCpuDifficulty,
  isAfkCpuTakeoverEnabled,
  setAfkCpuTakeoverEnabled,
  getAfkTimeoutThreshold,
  setAfkTimeoutThreshold,
  getAfkCpuDifficulty,
  setAfkCpuDifficulty,
} from "./cpu-battle-state.js";
import { SHORTCUT_TARGETS, getShortcut, setShortcut, registerShortcutSettingsOpener } from "./player-buttons.js";
import { createBackdrop } from "./ui-helpers.js";
import {
  isFlightAnimationDisabled,
  setFlightAnimationDisabled,
  isArrivalEffectDisabled,
  setArrivalEffectDisabled,
  isContinuousGlowDisabled,
  setContinuousGlowDisabled,
  isOpponentBaseTimerVisible,
  setOpponentBaseTimerVisible,
} from "./motion-prefs.js";
import {
  saveMyPreference,
  resetMyAppearanceSettings,
  isAdminUser,
  getCurrentUser,
  signInWithGoogle,
  isOnlineMode,
  getSelfSeat,
  fetchAndHydrate,
  getCurrentGameId,
  isRankedGame,
} from "./online.js";
import { buildIconButtonContent, wireIconButtonClick } from "./icon-action-button.js";
import { openStatsPlayerLinkModal } from "./stats-player-link.js";
import { fetchStatsProfile } from "./stats-profile.js";
import { isFlatten2dMode, setFlatten2dMode } from "./tablet-2d-mode.js";
import { isFullscreenSupported, isFullscreenActive, toggleFullscreen } from "./fullscreen-toggle.js";
import {
  isRankedNotifyEnabled,
  setRankedNotifyEnabled,
  getRankedNotifyWindow,
  setRankedNotifyWindow,
} from "./ranked-notify.js";
import { getOptionArea } from "./option-area.js";
import { getState, requestAutoProcessingToggle, nextTurn } from "./state.js";
import { getFinalLockApprovalOrder } from "./board-layout.js";

function buildMenuItem(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "options-menu-item";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function buildSectionTitle(text) {
  const el = document.createElement("div");
  el.className = "options-menu-section-title";
  el.textContent = text;
  return el;
}

// 項目数が増えて縦に長くなりすぎたため、admin.jsの<details>と同じ考え方で、性質の近い
// 項目をグループごとに開閉できるようにする。buildContent(content)で中身を組み立てる。
// icon（続き64、ユーザー要望「見た目を整理するアイデアをください」への対応で追加した
// 「セクション見出しに小さいアイコンを付けて一覧性を上げる」）: 絵文字1文字程度を想定。
// onReset（省略可、同じくユーザー要望「セクションごとの初期設定に戻すボタン」）: 渡すと
// summary行の右端に小さな「戻す」ボタンを出す。クリックしてもdetailsの開閉（summaryの
// 既定動作）が起きないようstopPropagation/preventDefaultする。
function buildCollapsibleSection(title, buildContent, { icon, onReset } = {}) {
  const details = document.createElement("details");
  details.className = "options-menu-details";
  const summary = document.createElement("summary");
  const titleSpan = document.createElement("span");
  titleSpan.className = "options-menu-details-title";
  titleSpan.textContent = icon ? `${icon} ${title}` : title;
  summary.appendChild(titleSpan);
  if (onReset) {
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "options-menu-section-reset-btn";
    resetBtn.textContent = t("opt.reset");
    resetBtn.title = "このセクションの設定を初期値に戻します";
    resetBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onReset();
    });
    summary.appendChild(resetBtn);
  }
  details.appendChild(summary);
  const content = document.createElement("div");
  content.className = "options-menu-details-content";
  buildContent(content);
  details.appendChild(content);
  return details;
}

// ユーザー要望2026-08-28「基本設定内のUIを整備したい（ライトユーザーに優しくない）」への
// 対応（続き299）。折りたたまずベタ置きする「よく使う設定」ブロックの見出し。
// buildCollapsibleSectionと違い常に開いた状態＝パネルを開いた直後にそのまま操作できる。
function buildPlainGroupHeader(title, onReset) {
  const row = document.createElement("div");
  row.className = "options-menu-plain-group-header";
  const titleSpan = document.createElement("span");
  titleSpan.className = "options-menu-details-title";
  titleSpan.textContent = title;
  row.appendChild(titleSpan);
  if (onReset) {
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "options-menu-section-reset-btn";
    resetBtn.textContent = t("opt.reset");
    resetBtn.title = "このグループの設定を初期値に戻します";
    resetBtn.addEventListener("click", onReset);
    row.appendChild(resetBtn);
  }
  return row;
}

// セクションの中でさらに数項目をまとめたい時の小見出し。折りたたみは使わない——
// 折りたたみの中に折りたたみがあると存在に気づけないため、続き299で入れ子を全廃した。
function buildSubLabel(text) {
  const el = document.createElement("div");
  el.className = "options-menu-sub-label";
  el.textContent = text;
  return el;
}

// 「テスト用・上級者向け」セクション（続き299）。以前は「自動処理・タイマー」の中に、
// 普通に遊ぶ人には縁のない疑似CPUモードの設定（3項目＋長い説明）が常時並んでいて、
// ライトユーザーが自動処理のON/OFFを探しづらくなっていた。機能は残したまま（ユーザー要望
// 続き107「疑似CPUモードの設定を管理者以外にも触れるように」は維持）、専用の折りたたみへ
// 移した。AFK時のCPU代行（管理者のみ表示）も性質が近いのでここへまとめる。
function buildAdvancedSection() {
  return buildCollapsibleSection(
    t("opt.sec.group.advanced"),
    (content) => {
      const pseudoCpuNote = document.createElement("div");
      pseudoCpuNote.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin: 0 0 0.3rem; line-height: 1.5;";
      pseudoCpuNote.textContent =
        "疑似CPUモード（自動選択のテスト用）: オンライン対戦では部屋作成時の" +
        "チェックボックスが対局全体で優先される（下の「有効化」はローカルモード用）。" +
        "「自分の座席も対象に含める」は各プレイヤー個人の選択で、対局中いつでも変更できる。";
      content.appendChild(pseudoCpuNote);

      const pseudoCpuEnableRow = buildCheckboxRow("疑似CPUモードを有効にする（ローカルモード用）", isPseudoCpuModeEnabled(), (checked) => {
        setPseudoCpuModeEnabled(checked);
        window.dispatchEvent(new CustomEvent("admin:change"));
        // ユーザー要望（続き99）「ONにしたら現在持っている基本時間及び砂時計は0に
        // してください」。turn-timer.js側でこのイベントを受け、今まさに優先権を
        // 持っている座席が新しい設定で対象になったなら、待たずにその場で基本時間を
        // 1秒へ縮める。
        window.dispatchEvent(new CustomEvent("pseudo-cpu-settings-changed"));
      });
      content.appendChild(pseudoCpuEnableRow);

      const pseudoCpuSelfRow = buildCheckboxRow(
        "自分の座席も対象に含める（ONにすると対局が最初から最後まで自動進行し、観戦に徹することができる）",
        isPseudoCpuIncludeSelf(),
        (checked) => {
          setPseudoCpuIncludeSelf(checked);
          window.dispatchEvent(new CustomEvent("admin:change"));
          window.dispatchEvent(new CustomEvent("pseudo-cpu-settings-changed"));
        }
      );
      content.appendChild(pseudoCpuSelfRow);

      // ユーザー要望「疑似CPUモードの基本時間（従来固定1秒）をオプションで変更できる
      // ように」。対象座席がこの秒数だけで即タイムアウト→自動代行する。速くも遅くも
      // できるよう0.2〜10秒で調整可能（admin.jsのgetPseudoCpuDeadlineMs、localStorage保存）。
      const pseudoCpuTimeRow = document.createElement("label");
      pseudoCpuTimeRow.style.cssText =
        "display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0 0.2rem; font-size: 0.85rem;";
      const pseudoCpuTimeLabel = document.createElement("span");
      pseudoCpuTimeLabel.textContent = "疑似CPUの基本時間";
      pseudoCpuTimeLabel.style.cssText = "flex: 1;";
      const pseudoCpuTimeInput = document.createElement("input");
      pseudoCpuTimeInput.type = "number";
      pseudoCpuTimeInput.min = "0.2";
      pseudoCpuTimeInput.max = "10";
      pseudoCpuTimeInput.step = "0.1";
      pseudoCpuTimeInput.value = String(getPseudoCpuDeadlineMs() / 1000);
      pseudoCpuTimeInput.style.cssText =
        "width: 4.5rem; padding: 0.2rem 0.3rem; background: rgba(15,23,32,0.9); " +
        "border: 1px solid rgba(148,163,184,0.5); border-radius: 0.3rem; color: #e2e8f0;";
      pseudoCpuTimeInput.addEventListener("change", () => {
        const sec = Number(pseudoCpuTimeInput.value);
        if (Number.isFinite(sec) && sec > 0) {
          setPseudoCpuDeadlineMs(Math.round(sec * 1000));
          window.dispatchEvent(new CustomEvent("pseudo-cpu-settings-changed"));
        }
        pseudoCpuTimeInput.value = String(getPseudoCpuDeadlineMs() / 1000);
      });
      const pseudoCpuTimeUnit = document.createElement("span");
      pseudoCpuTimeUnit.textContent = "秒";
      pseudoCpuTimeRow.appendChild(pseudoCpuTimeLabel);
      pseudoCpuTimeRow.appendChild(pseudoCpuTimeInput);
      pseudoCpuTimeRow.appendChild(pseudoCpuTimeUnit);
      content.appendChild(pseudoCpuTimeRow);

      // AFK時のCPU代行（ユーザー要望2026-08-08）。連続タイムアップ回数のしきい値・代行CPUの
      // 強さは管理者だけが調整できる。切替そのものの挙動はturn-timer.js/main.jsが担い、
      // ここは設定値の編集だけ。
      if (isAdminUser()) {
        const afkTitle = document.createElement("div");
        afkTitle.style.cssText = "font-size: 0.78rem; color: #fbbf24; margin: 0.9rem 0 0.3rem; font-weight: bold;";
        afkTitle.textContent = "AFK時のCPU代行（管理者のみ）";
        content.appendChild(afkTitle);

        content.appendChild(
          buildCheckboxRow("連続タイムアップで自動的にCPU代行へ切り替える", isAfkCpuTakeoverEnabled(), (checked) =>
            setAfkCpuTakeoverEnabled(checked)
          )
        );

        const afkThRow = document.createElement("label");
        afkThRow.style.cssText = "display:flex; align-items:center; gap:0.5rem; margin:0.4rem 0 0.2rem; font-size:0.85rem;";
        const afkThLabel = document.createElement("span");
        afkThLabel.textContent = "CPU代行へ切り替える連続タイムアップ回数";
        afkThLabel.style.cssText = "flex:1;";
        const afkThInput = document.createElement("input");
        afkThInput.type = "number";
        afkThInput.min = "1";
        afkThInput.max = "20";
        afkThInput.step = "1";
        afkThInput.value = String(getAfkTimeoutThreshold());
        afkThInput.style.cssText =
          "width:4rem; padding:0.2rem 0.3rem; background:rgba(15,23,32,0.9); border:1px solid rgba(148,163,184,0.5); border-radius:0.3rem; color:#e2e8f0;";
        afkThInput.addEventListener("change", () => {
          setAfkTimeoutThreshold(afkThInput.value);
          afkThInput.value = String(getAfkTimeoutThreshold());
        });
        const afkThUnit = document.createElement("span");
        afkThUnit.textContent = "回";
        afkThRow.append(afkThLabel, afkThInput, afkThUnit);
        content.appendChild(afkThRow);

        const afkDiffRow = document.createElement("label");
        afkDiffRow.style.cssText = "display:flex; align-items:center; gap:0.5rem; margin:0.2rem 0; font-size:0.85rem;";
        const afkDiffLabel = document.createElement("span");
        afkDiffLabel.textContent = "代行CPUの強さ";
        afkDiffLabel.style.cssText = "flex:1;";
        const afkDiffSel = document.createElement("select");
        afkDiffSel.style.cssText =
          "padding:0.2rem 0.3rem; background:rgba(15,23,32,0.9); border:1px solid rgba(148,163,184,0.5); border-radius:0.3rem; color:#e2e8f0;";
        [
          ["rookie", t("cpu.diff.rookie")],
          ["intermediate", t("cpu.diff.intermediate")],
          ["advanced", t("cpu.diff.advanced")],
          ["master", t("cpu.diff.master")],
        ].forEach(([v, label]) => {
          const opt = document.createElement("option");
          opt.value = v;
          opt.textContent = label;
          if (v === getAfkCpuDifficulty()) opt.selected = true;
          afkDiffSel.appendChild(opt);
        });
        afkDiffSel.addEventListener("change", () => setAfkCpuDifficulty(afkDiffSel.value));
        afkDiffRow.append(afkDiffLabel, afkDiffSel);
        content.appendChild(afkDiffRow);
      }
    },
    { icon: "🧪" }
  );
}

function buildCheckboxRow(label, checked, onChange) {
  const row = document.createElement("label");
  row.className = "options-menu-checkbox-row";
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  checkbox.addEventListener("change", () => onChange(checkbox.checked));
  const span = document.createElement("span");
  span.textContent = label;
  row.appendChild(checkbox);
  row.appendChild(span);
  return row;
}

function buildVolumeRow() {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const label = document.createElement("span");
  label.textContent = t("opt.soundVolume");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(getSoundVolume() * 100));
  const valueLabel = document.createElement("span");
  valueLabel.className = "options-menu-volume-value";
  valueLabel.textContent = `${slider.value}%`;
  slider.addEventListener("input", () => {
    setSoundVolume(Number(slider.value) / 100);
    valueLabel.textContent = `${slider.value}%`;
  });
  row.appendChild(label);
  row.appendChild(slider);
  row.appendChild(valueLabel);
  return row;
}

// ユーザー要望「『オープニングBGMの音量』ではなくて『BGM』でよい。BGM全体の音量を
// 調整できるように」への対応。以前はオープニングBGM専用の個別音量（CSS変数）を
// 直接操作していたが、オープニング/ゲーム中/勝利時/待機中の全BGMをまとめて上下できる
// マスター音量（sound.jsのgetBgmVolume/setBgmVolume、効果音のmasterVolumeと対になる
// 独立した値）に切り替えた。個別のBGMごとの微調整は引き続き管理者モードの
// 「効果音の音量（個別）」グループに残っている。
function buildBgmVolumeRow() {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const labelEl = document.createElement("span");
  labelEl.textContent = t("opt.bgmVolume");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = "100";
  slider.step = "5";
  slider.value = String(Math.round(getBgmVolume() * 100));
  const valueLabel = document.createElement("span");
  valueLabel.className = "options-menu-volume-value";
  valueLabel.textContent = `${slider.value}%`;
  slider.addEventListener("input", () => {
    setBgmVolume(Number(slider.value) / 100);
    valueLabel.textContent = `${slider.value}%`;
  });
  slider.addEventListener("change", () => {
    // ハマりどころ（online.jsのコメント参照）: so7_user_profilesにまだ
    // sound_volume_bgm列が存在しない環境でSELECT文に含めるとアカウント設定の復元が
    // 丸ごと壊れるため、保存(saveMyPreference、独立した更新なので失敗しても他の設定に
    // 影響しない)はしても、読み込み側への追加はsupabase_setup_so7.sql実行後に行う。
    saveMyPreference({ sound_volume_bgm: Number(slider.value) });
  });
  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(valueLabel);
  return row;
}

// ユーザー要望「駒スキンやプレイマット等のアカウントに紐づく設定を初期化する
// ボタンを設置したい。基本設定の中がいいかな？」への対応。ネイティブのconfirm()は
// このアプリの他のどのモーダル/確認とも見た目が揃わないため使わず、代わりに
// 「1回目のクリックで『本当にリセットしますか？』に文言が変わり、5秒以内にもう一度
// 押すと実行される（それを過ぎると自動的に元の文言へ戻る）」という2段階クリックの
// 確認にした。実行後は各モジュール（駒スキン・プレイマット・カード裏面・背景・
// 名前・アバター）のローカル状態を1つずつ書き換えるより、ページを再読み込みして
// loadMyPreferences()に正しい既定値を読み直させる方が確実なため、成功時は
// window.location.reload()する。
function buildResetAppearanceRow() {
  const row = document.createElement("div");
  row.className = "options-menu-reset-row";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "options-menu-reset-btn";
  btn.textContent = t("opt.resetAccount");

  const hint = document.createElement("div");
  hint.className = "options-menu-reset-hint";
  hint.textContent = t("opt.resetAccountDesc");

  let armed = false;
  let armTimeoutId = null;
  function disarm() {
    armed = false;
    clearTimeout(armTimeoutId);
    btn.textContent = t("opt.resetAccount");
    btn.classList.remove("is-armed");
  }

  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = t("opt.resetAccountConfirm");
      btn.classList.add("is-armed");
      armTimeoutId = setTimeout(disarm, 5000);
      return;
    }
    disarm();
    btn.disabled = true;
    btn.textContent = t("opt.resetAccountBusy");
    try {
      await resetMyAppearanceSettings();
      markCleanExit(); // 意図的なリロード＝ブラックボックスに「不審な落下」と誤検知させない。
      window.location.reload();
    } catch (err) {
      console.error("resetMyAppearanceSettings failed", err);
      btn.disabled = false;
      btn.textContent = t("opt.resetAccountFailed");
      setTimeout(() => {
        btn.textContent = t("opt.resetAccount");
      }, 3000);
    }
  });

  row.appendChild(btn);
  row.appendChild(hint);
  return row;
}

// ユーザー要望「『カード拡大プレビューのサイズ』をいじったら実際にわかりやすいように
// プレビューを表示させてください」への対応。以前はスライダーの数値だけが変わり、
// 実際の見た目は盤面のカードにカーソルを乗せ直さないと確認できなかった。ここでは
// main.js側の本物のホバープレビュー（#card-preview）とは別に、画面中央に固定表示する
// 専用のデモ用要素を用意し、同じ--card-preview-sizeを共有することで見た目を完全に
// 一致させつつ、main.jsに触れず（循環import回避）このファイル単体で完結させる。
// スライダーを操作している間だけ表示し、操作が止まって少し経つと自動で消える
// （admin.jsのランクリングプレビューと同じ「操作が続く限り延長される一時表示」方式）。
let cardPreviewDemoEl = null;
let cardPreviewDemoHideTimer = null;
function showCardPreviewSizeDemo() {
  if (!cardPreviewDemoEl) {
    cardPreviewDemoEl = document.createElement("div");
    cardPreviewDemoEl.id = "options-menu-card-preview-demo";
    cardPreviewDemoEl.style.backgroundImage = 'url("assets/cards/back-normal.webp")';
    document.body.appendChild(cardPreviewDemoEl);
  }
  cardPreviewDemoEl.style.display = "block";
  clearTimeout(cardPreviewDemoHideTimer);
  cardPreviewDemoHideTimer = setTimeout(() => {
    cardPreviewDemoEl.style.display = "none";
  }, 1500);
}

function buildCardPreviewSizeRow() {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const labelEl = document.createElement("span");
  labelEl.textContent = t("opt.cardPreviewSize");
  const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--card-preview-size"));
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "8";
  slider.max = "36";
  slider.step = "0.5";
  slider.value = String(Number.isFinite(current) ? current : 20);
  const valueLabel = document.createElement("span");
  valueLabel.className = "options-menu-volume-value";
  valueLabel.textContent = `${slider.value}rem`;
  slider.addEventListener("input", () => {
    // setCardPreviewSizeがCSS変数の反映＋端末への保存＋admin:changeの発火をまとめて行う
    // （初回設定モーダルと同じ経路。どちらで変えても次回以降まで好みが保たれる）。
    setCardPreviewSize(Number(slider.value));
    valueLabel.textContent = `${slider.value}rem`;
    showCardPreviewSizeDemo();
  });
  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(valueLabel);
  return row;
}

// カード拡大プレビューを、指の長タップ／マウスホバー位置の右・左どちらに出すかを選ぶ
// セグメント（ユーザー要望2026-08-07: スマホ・PCとも右拡大/左拡大を選べるように。既定は右）。
function buildCardPreviewSideRow() {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const label = document.createElement("span");
  label.textContent = t("opt.cardPreviewSide");
  row.appendChild(label);
  const group = document.createElement("div");
  group.className = "options-menu-segment";
  const buttons = [];
  const refresh = () => {
    const cur = getCardPreviewSide();
    for (const b of buttons) b.classList.toggle("is-selected", b.dataset.v === cur);
  };
  for (const [v, text] of [
    ["right", "右に拡大"],
    ["left", "左に拡大"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "options-menu-segment-btn";
    btn.dataset.v = v;
    btn.textContent = text;
    btn.addEventListener("click", () => {
      setCardPreviewSide(v);
      refresh();
    });
    group.appendChild(btn);
    buttons.push(btn);
  }
  row.appendChild(group);
  refresh();
  return row;
}

// CPU戦（1人用）のCPUの速さ（ゆっくり／普通／早い）を選ぶセグメント。ユーザー要望
// 「CPUが速すぎてザ・ギャンブル等のモーダルが読み取れない」。選ぶとその場で反映され、
// 次のCPUの手から効く（cpu-battle-state.js、端末に保存）。
function buildCpuSpeedRow() {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const label = document.createElement("span");
  label.textContent = t("opt.cpuSpeed");
  row.appendChild(label);
  const group = document.createElement("div");
  group.className = "options-menu-segment";
  const buttons = [];
  const refresh = () => {
    const cur = getCpuSpeed();
    for (const b of buttons) b.classList.toggle("is-selected", b.dataset.v === cur);
  };
  for (const [v, text] of [
    ["slow", "ゆっくり"],
    ["normal", "普通"],
    ["fast", "早い"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "options-menu-segment-btn";
    btn.dataset.v = v;
    btn.textContent = text;
    btn.addEventListener("click", () => {
      setCpuSpeed(v);
      refresh();
    });
    group.appendChild(btn);
    buttons.push(btn);
  }
  row.appendChild(group);
  refresh();
  return row;
}

// CPU戦のCPUの強さ（新人／中級／上級／最強）を選ぶセグメント。ユーザー要望2026-08-07
// 「CPUを賢くしたい。現状の完全ランダムを新人とし段階的に強く、最強だけのぞき見OK」。
// 選ぶとその場で反映され、次のCPUの手から効く（cpu-battle-state.js、端末に保存）。
function buildCpuDifficultyRow() {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const label = document.createElement("span");
  label.textContent = t("opt.cpuStrength");
  row.appendChild(label);
  const group = document.createElement("div");
  group.className = "options-menu-segment";
  const buttons = [];
  const refresh = () => {
    const cur = getCpuDifficulty();
    for (const b of buttons) b.classList.toggle("is-selected", b.dataset.v === cur);
  };
  for (const [v, key] of [
    ["rookie", "cpu.diff.rookie"],
    ["intermediate", "cpu.diff.intermediate"],
    ["advanced", "cpu.diff.advanced"],
    ["master", "cpu.diff.master"],
  ]) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "options-menu-segment-btn";
    btn.dataset.v = v;
    btn.textContent = t(key);
    btn.addEventListener("click", () => {
      setCpuDifficulty(v);
      refresh();
    });
    group.appendChild(btn);
    buttons.push(btn);
  }
  row.appendChild(group);
  refresh();
  return row;
}

// 言語（ja/en）切替。ユーザー要望「英語表示の有効化」。現状の翻訳対象はカードのテキスト
// （タイトル・効果文・フレーバー・カード名）のみ＝メニュー等のUIはまだ日本語のまま。選ぶと
// setLang で保存(localStorage・この端末のみ)し、onLangChange→盤面再描画でカード面が切り替わる。
function buildLanguageRow() {
  const wrap = document.createElement("div");
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const label = document.createElement("span");
  label.textContent = "言語 / Language";
  row.appendChild(label);
  const group = document.createElement("div");
  group.className = "options-menu-segment";
  const buttons = [];
  const refresh = () => {
    const cur = getLang();
    for (const b of buttons) b.classList.toggle("is-selected", b.dataset.v === cur);
  };
  for (const v of SUPPORTED_LANGS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "options-menu-segment-btn";
    btn.dataset.v = v;
    btn.textContent = LANG_LABEL[v] || v;
    btn.addEventListener("click", () => {
      setLang(v); // localStorage（端末フォールバック）＋ onLangChange→再描画
      saveMyPreference({ lang: v }); // ログイン済みならアカウントにも保存（端末をまたいで引き継ぐ）
      refresh();
    });
    group.appendChild(btn);
    buttons.push(btn);
  }
  row.appendChild(group);
  wrap.appendChild(row);
  const note = document.createElement("div");
  note.style.cssText = "font-size: 0.72rem; color: #94a3b8; margin: 0.1rem 0 0.5rem; line-height: 1.5;";
  note.textContent = t("opt.langNote");
  wrap.appendChild(note);
  refresh();
  return wrap;
}

// ユーザー要望「戦績管理システムにすでに登録済みで、でもデジタル版を初めてやる人の
// ために、戦績管理システムのプレイヤー登録をアカウントに紐づける設定を設けたい。
// オプションの基本設定内に配置する」。実際のモーダル（一覧・検索・申請）は
// stats-player-link.jsが持つ。
// ユーザー要望「戦績管理システムのプレイヤーと連携について、Googleアカウントでログイン
// してないと連携できない仕様にしましょう。ゲストやマジックリンクでログインしている
// ときは『Googleアカウントでログインしていないと連携できない』旨を表示し、かつ
// 『Googleアカウントでログインしなおす』的なボタンもそこに置きましょう」（続き63）。
// 連携申請（requestStatsPlayerLink）自体はuser_idさえ紐づいていれば技術的には
// どのログイン方式でも実行できてしまうが、ゲスト（匿名）やマジックリンクのメール
// アドレスはブラウザ/端末を変えると再現できず「本人確認」の意味が薄いため、
// 最も本人性の高いGoogleログインだけに限定する。
// ユーザー要望（続き64）「基本設定内のUIを整理したい。戦績システム連携は一番上に
// 強調してください。連携済みであったり、戦績システムでプレイヤー承認されていれば
// グレー表示で」。専用のカード風の見た目（options-menu-stats-link-card）にし、
// パネルの一番上（「基本設定」タイトルのすぐ下）に単独で置く——折りたたみセクションに
// 入れると畳まれて目立たなくなるため、他の設定グループとは別枠にした。
function buildStatsPlayerLinkRow() {
  const row = document.createElement("div");
  row.className = "options-menu-stats-link-card";

  const labelEl = document.createElement("div");
  labelEl.className = "options-menu-stats-link-title";
  labelEl.textContent = t("opt.statsLink");
  row.appendChild(labelEl);

  const actionArea = document.createElement("div");
  actionArea.style.cssText = "display: flex; align-items: center; gap: 0.4rem; margin-top: 0.3rem;";
  row.appendChild(actionArea);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = t("opt.statsLinkSelect");
  btn.className = "options-menu-item";
  btn.style.cssText = "width: auto; flex: none; padding: 0.3rem 0.8rem;";
  btn.disabled = true;
  btn.addEventListener("click", openStatsPlayerLinkModal);
  actionArea.appendChild(btn);

  function showLinkedState() {
    row.classList.add("is-linked");
    actionArea.innerHTML = "";
    const done = document.createElement("div");
    done.textContent = t("opt.statsLinkDone");
    // 薄い黄緑だと（既定の）ライトテーマで視認性が悪かったので、濃い緑＋太字に（ユーザー報告）。
    done.style.cssText = "font-size: 0.85rem; color: #15803d; font-weight: 700;";
    actionArea.appendChild(done);
  }

  function showGoogleRequiredState() {
    actionArea.innerHTML = "";
    const note = document.createElement("div");
    note.textContent = t("opt.statsLinkGoogleOnly");
    note.style.cssText = "font-size: 0.7rem; color: #fca5a5; line-height: 1.4;";
    const reloginBtn = document.createElement("button");
    reloginBtn.type = "button";
    reloginBtn.textContent = t("opt.statsLinkReloginGoogle");
    reloginBtn.className = "options-menu-item";
    reloginBtn.style.cssText = "width: auto; flex: none; padding: 0.3rem 0.8rem; margin-top: 0.3rem;";
    reloginBtn.addEventListener("click", () => {
      signInWithGoogle().catch((err) => console.error("signInWithGoogle failed", err));
    });
    const stack = document.createElement("div");
    stack.appendChild(note);
    stack.appendChild(reloginBtn);
    actionArea.appendChild(stack);
  }

  (async () => {
    let user = null;
    try {
      user = await getCurrentUser();
    } catch (err) {
      console.error("getCurrentUser (stats player link gate) failed", err);
    }
    // ユーザー報告「Googleでログインしているのに『ログインしていない』と出る」。原因は
    // app_metadata.provider だけを見ていたこと——Supabaseでは、アカウントの主プロバイダが
    // email/マジックリンクでGoogleを後から連携した場合など、Google認証済みでも
    // app_metadata.provider が "google" 以外になり得る。Googleのアイデンティティ自体が
    // 紐づいているかを、providers配列・identities配列も含めて総合的に判定する。
    const appMeta = user?.app_metadata ?? {};
    const providerList = Array.isArray(appMeta.providers) ? appMeta.providers : [];
    const identities = Array.isArray(user?.identities) ? user.identities : [];
    const isGoogleLinked =
      appMeta.provider === "google" ||
      providerList.includes("google") ||
      identities.some((identity) => identity?.provider === "google");
    if (!isGoogleLinked) {
      showGoogleRequiredState();
      return;
    }
    // 既に戦績システム側で連携（承認）済みなら、選ぶことがもう無いのでグレー表示にする
    // （ユーザー要望「連携済みであったり、戦績システムでプレイヤー承認されていれば
    // グレー表示で」）。fetchStatsProfileのlinkedは承認が完了した状態を指す。
    try {
      const profile = await fetchStatsProfile(user.id);
      if (profile?.linked) {
        showLinkedState();
        return;
      }
    } catch (err) {
      console.error("fetchStatsProfile (stats player link gate) failed", err);
    }
    btn.disabled = false;
  })();

  return row;
}

// 「モーダル表示時間」グループの3スライダー共通部品。admin.jsの対応するスライダーと同じ
// CSS変数を直接setPropertyで共有するため、基本設定側から変更しても管理者モードの表示に
// 反映される。範囲・デフォルトもadmin.js側と揃えてある（1〜15秒、step 0.5）。
function buildDurationRow(label, cssVar, defaultValue, onSave) {
  const row = document.createElement("div");
  row.className = "options-menu-volume-row";
  const labelEl = document.createElement("span");
  labelEl.textContent = label;
  const current = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(cssVar));
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "1";
  slider.max = "15";
  slider.step = "0.5";
  slider.value = String(Number.isFinite(current) ? current : defaultValue);
  const valueLabel = document.createElement("span");
  valueLabel.className = "options-menu-volume-value";
  valueLabel.textContent = `${slider.value}秒`;
  slider.addEventListener("input", () => {
    const value = Number(slider.value);
    document.documentElement.style.setProperty(cssVar, String(value));
    valueLabel.textContent = `${slider.value}秒`;
    window.dispatchEvent(new CustomEvent("admin:change"));
    onSave(value);
  });
  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(valueLabel);
  return row;
}

// 「手札シャッフル」「盤面拡大」「1枚ドロー」（プレイヤー用ボタン）にキーボードショートカットを
// 割り当てる行。ボタンをクリックすると次に押したキーをそのまま割り当てる「記録待ち」状態になる
// （player-buttons.jsのgetShortcut/setShortcutで実体を保持）。プレイヤー用ボタンを右クリックした
// 時にも、このパネルを開いてこの行までスクロールする（initOptionsMenu内でregisterする）。
// 現在の全ショートカット割り当て（SHORTCUT_TARGETS分）をso7_user_profilesへ保存する。
function persistShortcuts() {
  const shortcuts = {};
  for (const { id } of SHORTCUT_TARGETS) {
    const key = getShortcut(id);
    if (key) shortcuts[id] = key;
  }
  saveMyPreference({ shortcuts });
}

function buildShortcutRow(buttonId, label) {
  const row = document.createElement("div");
  row.className = "options-menu-shortcut-row";
  row.dataset.shortcutFor = buttonId;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const keyBtn = document.createElement("button");
  keyBtn.className = "options-menu-shortcut-key";
  function refresh() {
    const key = getShortcut(buttonId);
    keyBtn.textContent = key ? key.toUpperCase() : "未設定";
  }
  refresh();
  keyBtn.addEventListener("click", () => {
    keyBtn.textContent = t("opt.pressKey");
    function onKey(e) {
      e.preventDefault();
      e.stopPropagation();
      window.removeEventListener("keydown", onKey, true);
      if (e.key !== "Escape") setShortcut(buttonId, e.key.toLowerCase());
      refresh();
      persistShortcuts();
    }
    window.addEventListener("keydown", onKey, true);
  });

  const clearBtn = document.createElement("button");
  clearBtn.className = "options-menu-shortcut-clear";
  clearBtn.textContent = "×";
  clearBtn.title = "割り当てを解除";
  clearBtn.addEventListener("click", () => {
    setShortcut(buttonId, null);
    refresh();
    persistShortcuts();
  });

  row.appendChild(labelEl);
  row.appendChild(keyBtn);
  row.appendChild(clearBtn);
  return { row, refresh };
}

// 「おすすめ」ボタンでまとめて割り当てるショートカットキー（手札シャッフル=S、盤面拡大=Z、
// 1枚ドロー=D）。ターン終了はキー操作だと誤操作の影響が大きい（ターンを間違えて進めてしまう）
// ため、おすすめでは割り当てず未設定のままにする。
const RECOMMENDED_SHORTCUTS = {
  "hand-shuffle-button": "s",
  "board-zoom-button": "z",
  "draw-button": "d",
  "end-turn-button": null,
};

export function initOptionsMenu() {
  const panel = document.createElement("div");
  panel.id = "options-menu-panel";
  panel.style.display = "none";

  // ユーザー報告「マイページを開いた状態でオプションを出すと、他の場所をクリックしても
  // オプションが閉じない」。オプションは透明backdrop(z-index 890)のクリックで閉じる方式だが、
  // マイページ等のより手前のモーダル（backdrop z-index 2300）が開いていると、外側クリックが
  // そちらに奪われてオプションのbackdropに届かず、1クリックでは閉じない。backdropの重なりに
  // 依存しないよう、オプションが開いている間はドキュメント全体のpointerdown（キャプチャ相）で
  // 「オプションのパネル外かつオプションボタン外」のクリックを検知して閉じる。パネル内や
  // オプションボタン自身、およびオプションから開く子パネル（管理者/山札一覧）内のクリックは
  // 閉じない（それらを触っている最中に裏でオプションが消えないように）。
  function onDocPointerDown(e) {
    const t = e.target;
    if (panel.contains(t)) return;
    if (document.getElementById("options-menu-button")?.contains(t)) return;
    if (t.closest?.("#admin-panel, #deck-viewer-panel, #profile-layout-export")) return;
    close();
  }
  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
    detailMode = false; // 次に開いた時は必ず基本設定から
    // ユーザー報告2026-08-28「ホーム画面からオプションを開くと上の黒帯が消えちゃってます」。
    // #options-menu-panel は inset:0 の全画面ページで、#option-area（上端のアイコン列＋装飾帯）
    // より前面にあったため、開いている間だけ帯が隠れていた。開閉に合わせてbodyクラスを付け外し、
    // CSS側でアイコン列を最前面へ出す（style.css の body.options-menu-open 参照）。
    document.body.classList.remove("options-menu-open");
    document.removeEventListener("pointerdown", onDocPointerDown, true);
  }
  // 言語セレクタはこのパネル内にあるので、切り替えたらパネル自身も新しい言語で作り直す
  // （開いている時だけ。閉じていれば次に開いた時 renderContent が新言語で組む）。
  onLangChange(() => {
    if (panel.style.display !== "none") renderContent();
  });
  function open() {
    document.addEventListener("pointerdown", onDocPointerDown, true);
    // 開くたびに中身を作り直す。パネルは起動時に1回だけ組み立てる方式だと、その時点では
    // まだアカウントの設定（online.jsのloadMyPreferences、ログイン直後に非同期で読み込む）が
    // 間に合っておらず、チェックボックス・スライダー・ショートカットキーの表示が起動直後の
    // デフォルト値のまま固定されてしまう（実際の設定値=各モジュールの内部状態は正しく
    // 復元されているが、パネルの見た目だけがそれを反映しないため「設定が記憶されていない」
    // ように見えるバグがあった）。開くたびに最新の値で作り直せば、ログイン直後の読み込みが
    // 完了していればその値が、まだなら暫定のデフォルトが、常に正しく表示される。
    renderContent();
    panel.style.display = "block";
    backdrop.style.display = "block";
    document.body.classList.add("options-menu-open"); // 上端の装飾帯を前面に保つ（closeのコメント参照）
  }

  let shortcutSectionEl = null;
  // 基本設定ビュー(false)／詳細設定ビュー(true)。閉じると必ず基本設定へ戻す（close参照）。
  let detailMode = false;

  function renderContent() {
    panel.innerHTML = "";

    // 全画面表示（ユーザー要望）にしたので、他の全画面ページ同様に左上へ「← 戻る」を置く。
    // ユーザー要望2026-08-28「よく使う設定より下の設定は詳細設定というボタンを作り格納する
    // のはどうかな？」。パネルを2ビュー（基本設定／詳細設定）に分け、detailMode で切り替える。
    // 折りたたみの中に折りたたみを作らない方針（続き299）を守りつつ、開いた直後に見えるものを
    // さらに減らすための構成。詳細設定ビューの「戻る」は基本設定ビューへ戻る。
    const backBtn = document.createElement("button");
    backBtn.type = "button";
    backBtn.id = "options-menu-back";
    backBtn.textContent = detailMode ? t("opt.backToBasic") : t("common.back");
    backBtn.addEventListener("click", () => {
      if (detailMode) {
        detailMode = false;
        renderContent();
        panel.scrollTop = 0;
        return;
      }
      close();
    });
    panel.appendChild(backBtn);

    panel.appendChild(buildSectionTitle(detailMode ? t("opt.detailSettings") : t("opt.basicSettings")));

    // ユーザー要望2026-08-28「基本設定内のUIを整備したい。現在ライトユーザーには優しくない」
    // への対応（続き299）。方針は2つ。
    //  A: よく使う設定（音量・カードの大きさ・全画面・使う前に確認）は折りたたまずベタ置きにし、
    //     開いた直後に「まず触るもの」がそのまま操作できるようにした。
    //  B: 残りは「機能の種類」（表示・演出／自動処理・タイマー）ではなく「困りごと」で分けた
    //     （動きが重い／画面の見え方／…）。困っている人が症状の言葉から辿り着けるようにするため。
    // あわせて、入れ子の折りたたみ（旧「ロックエリア関連」「モーダル表示時間」「アニメーションを
    // 減らす」）は、開いた中にさらに閉じた箱がある＝存在に気づけないため全廃し、小見出し
    // （buildSubLabel）に置き換えた。機能自体は1つも減らしていない（置き場所と呼び方の変更のみ）。
    if (!detailMode) panel.appendChild(buildLanguageRow());
    // ユーザー要望2026-08-28「戦績システムとの連携済み表示は基本設定ではなく、マイページに
    // 小さくさらっとあった方が良い」。ここからは撤去し、マイページ（my-page.js）へ移した。
    // buildStatsPlayerLinkRow自体は、将来また基本設定に出したくなった時のため残してある。

    // よく使う設定のブロックは基本設定ビューだけに出す（詳細設定ビューでは出さない）。
    if (!detailMode) {
      panel.appendChild(
        buildPlainGroupHeader(t("opt.sec.group.common"), () => {
          setSoundVolume(0.8);
          setBgmVolume(0.5);
          setCardPreviewSize(20);
          setActionConfirmEnabled(true);
          saveMyPreference({ sound_volume: 0.8, sound_volume_bgm: 50, action_confirm_enabled: true });
          renderContent();
        })
      );
      {
        const volumeRow = buildVolumeRow();
        const volumeSlider = volumeRow.querySelector("input[type=range]");
        volumeSlider.addEventListener("change", () => {
          saveMyPreference({ sound_volume: Number(volumeSlider.value) / 100 });
        });
        panel.appendChild(volumeRow);
      }
      panel.appendChild(buildBgmVolumeRow());
      panel.appendChild(buildCardPreviewSizeRow());
      // 「全画面で遊ぶ」はユーザー要望2026-08-28「オプションエリアにアイコンがあるからいらない
      // かも」で撤去した（#fullscreen-toggle-button が同じ機能を持つ）。
      // ユーザー要望「ロック前・手札使用前の確認モーダルを全デバイスで出す。モーダルの
      // 『今後表示しない』でオフにでき、ここから再度オンに戻せるように」。うっかり操作を
      // 防ぐ設定＝初めての人ほど触るため、よく使う設定として一番上のブロックに置く。
      panel.appendChild(
        buildCheckboxRow(t("opt.chk.actionConfirm"), isActionConfirmEnabled(), (checked) => {
          setActionConfirmEnabled(checked);
          saveMyPreference({ action_confirm_enabled: checked });
        })
      );

    }

    // 基本設定ビューはここまで。以降（困りごと別のセクション群・アカウント初期化・
    // アクションログ・管理者向け）は「詳細設定」ビューへ格納する。ユーザー要望により
    // 「山札一覧」だけは対局中によく開くため基本設定ビューに残す。
    if (!detailMode) {
      const detailBtn = document.createElement("button");
      detailBtn.type = "button";
      detailBtn.className = "options-menu-detail-entry";
      const detailTitle = document.createElement("span");
      detailTitle.className = "options-menu-detail-entry-title";
      detailTitle.textContent = `${t("opt.detailSettings")} ▸`;
      const detailHint = document.createElement("span");
      detailHint.className = "options-menu-detail-entry-hint";
      detailHint.textContent = t("opt.detailSettingsHint");
      detailBtn.appendChild(detailTitle);
      detailBtn.appendChild(detailHint);
      detailBtn.addEventListener("click", () => {
        detailMode = true;
        renderContent();
        panel.scrollTop = 0;
      });
      panel.appendChild(detailBtn);

      const basicDivider = document.createElement("div");
      basicDivider.className = "options-menu-divider";
      panel.appendChild(basicDivider);

      panel.appendChild(
        buildMenuItem("📋 " + t("deckviewer.title"), () => {
          close();
          openDeckViewer();
        })
      );
      // 対局中の状態（盤面・オンライン接続等）を個別に片付けるより、ページを丸ごと
      // 再読み込みする方が確実で安全（Googleログイン後の遷移等、既存の「戻ってくると
      // 最初からになる」フローと同じ挙動）。オンライン対戦中でも部屋の座席自体は
      // サーバー側に残るため、「進行中の対局を再開」から戻ってこられる。
      panel.appendChild(
        buildMenuItem("🏠 タイトルに戻る", () => {
          markCleanExit(); // 意図的なリロード＝ブラックボックスに「不審な落下」と誤検知させない。
          window.location.reload();
        })
      );
      return;
    }

    // --- ここから下は詳細設定ビュー。「困りごと」ごとの折りたたみ（入れ子なし・1階層のみ） ---

    // 「動きが重い・カクつくとき」。旧「表示・演出 > アニメーションを減らす」（入れ子の中の
    // 入れ子）＋タブレットのちらつき対策の2D表示を、症状の名前で1つにまとめた。純粋に
    // クライアントローカルな描画設定のため、ONにしても相手プレイヤーの画面には影響しない。
    panel.appendChild(
      buildCollapsibleSection(
        t("opt.sec.group.heavy"),
        (content) => {
          content.appendChild(
            buildCheckboxRow(t("opt.chk.disableFlight"), isFlightAnimationDisabled(), (checked) => {
              setFlightAnimationDisabled(checked);
              saveMyPreference({ flight_animation_disabled: checked });
            })
          );
          content.appendChild(
            buildCheckboxRow(t("opt.chk.disableArrival"), isArrivalEffectDisabled(), (checked) => {
              setArrivalEffectDisabled(checked);
              saveMyPreference({ arrival_effect_disabled: checked });
            })
          );
          content.appendChild(
            buildCheckboxRow(t("opt.chk.disableGlow"), isContinuousGlowDisabled(), (checked) => {
              setContinuousGlowDisabled(checked);
              document.body.classList.toggle("reduce-glow", checked);
              saveMyPreference({ continuous_glow_disabled: checked });
            })
          );
          // 実体はtablet-2d-mode.jsで管理者モードのトグルと共有している（同じ状態）。
          content.appendChild(
            buildCheckboxRow(t("opt.chk.flatten2d"), isFlatten2dMode(), (checked) => {
              setFlatten2dMode(checked);
              saveMyPreference({ flatten_2d_mode: checked });
            })
          );
        },
        {
          icon: "🐢",
          onReset: () => {
            setFlightAnimationDisabled(false);
            setArrivalEffectDisabled(false);
            setContinuousGlowDisabled(false);
            document.body.classList.remove("reduce-glow");
            setFlatten2dMode(false);
            window.dispatchEvent(new CustomEvent("admin:change"));
            saveMyPreference({
              flight_animation_disabled: false,
              arrival_effect_disabled: false,
              continuous_glow_disabled: false,
              flatten_2d_mode: false,
            });
            renderContent();
          },
        }
      )
    );

    // 「画面の見え方」。旧「表示・演出」から、よく使う設定へ移した分と動作の重さ関連を
    // 除いた残り＋旧入れ子2つ（ロックエリア関連／モーダル表示時間）を小見出しで並べた。
    panel.appendChild(
      buildCollapsibleSection(
        t("opt.sec.group.look"),
        (content) => {
          // ユーザー要望「盤面（場・捨て場・ロックエリア）のカードは遠景で文字が読めないので、
          // イラストのみのカード画像で映えさせたい。ホバー拡大や手札は通常のテキストあり画像
          // のまま」。この端末のみのローカル設定（board-card-display.js、相手には非同期）。
          content.appendChild(
            buildCheckboxRow(t("opt.chk.boardIllustOnly"), isBoardIllustOnly(), (checked) => {
              setBoardIllustOnly(checked);
            })
          );
          content.appendChild(buildCardPreviewSideRow());
          // ユーザー要望2026-08-07「マウスホイールで盤面を拡大すると自分の手札が見切れる。
          // ステータスエリアのように画角固定できないか」（fixed-hand.js）。
          content.appendChild(
            buildCheckboxRow(t("opt.chk.fixedHand"), isFixedHandEnabled(), (checked) => {
              setFixedHandEnabled(checked);
            })
          );
          content.appendChild(
            buildCheckboxRow(t("opt.chk.lockAreaBar"), isLockAreaBarVisible(), (checked) => {
              setLockAreaBarVisible(checked);
              window.dispatchEvent(new CustomEvent("admin:change"));
              saveMyPreference({ lock_area_bar_visible: checked });
            })
          );
          content.appendChild(
            buildCheckboxRow(t("opt.chk.lockColor"), isLockColorVisible(), (checked) => {
              setLockColorVisible(checked);
              window.dispatchEvent(new CustomEvent("admin:change"));
              saveMyPreference({ lock_color_visible: checked });
            })
          );
          // 自分自身のカウントダウンは常に表示する（この設定の対象外）。画面中央の砂時計
          // ロープも誰の分でも常時表示のまま（turn-timer.jsのupdateRope）。
          content.appendChild(
            buildCheckboxRow(t("opt.chk.opponentBaseTimer"), isOpponentBaseTimerVisible(), (checked) => {
              setOpponentBaseTimerVisible(checked);
              saveMyPreference({ opponent_base_timer_visible: checked });
            })
          );
          content.appendChild(buildSubLabel(t("opt.sec.modalDuration")));
          content.appendChild(
            buildDurationRow("相手のゲートに侵入した時のお知らせ", "--gate-invasion-modal-step-duration", 3.5, (value) => {
              saveMyPreference({ gate_invasion_modal_duration: value });
            })
          );
          content.appendChild(
            buildDurationRow("カードに到達した時のお知らせ", "--card-arrival-modal-duration", 5, (value) => {
              saveMyPreference({ card_arrival_modal_duration: value });
            })
          );
          content.appendChild(
            buildDurationRow("カードを手に入れた時の中央表示（この後、右下にたまります）", "--hand-pickup-toast-duration", 5, (value) => {
              saveMyPreference({ hand_pickup_toast_duration: value });
            })
          );
        },
        {
          icon: "👀",
          onReset: () => {
            setBoardIllustOnly(false);
            setLockAreaBarVisible(true);
            setLockColorVisible(true);
            setOpponentBaseTimerVisible(false);
            document.documentElement.style.setProperty("--gate-invasion-modal-step-duration", "3.5");
            document.documentElement.style.setProperty("--card-arrival-modal-duration", "5");
            document.documentElement.style.setProperty("--hand-pickup-toast-duration", "5");
            window.dispatchEvent(new CustomEvent("admin:change"));
            saveMyPreference({
              lock_area_bar_visible: true,
              lock_color_visible: true,
              opponent_base_timer_visible: false,
              gate_invasion_modal_duration: 3.5,
              card_arrival_modal_duration: 5,
              hand_pickup_toast_duration: 5,
            });
            renderContent();
          },
        }
      )
    );

    // CPU戦（1人用）の設定。ユーザー要望「CPUの行動が速すぎてモーダルが読めない。速さを
    // ゆっくり／普通／早いで選べるように」。
    panel.appendChild(
      buildCollapsibleSection(
        t("opt.sec.cpuBattle"),
        (content) => {
          content.appendChild(buildCpuDifficultyRow());
          const diffNote = document.createElement("div");
          diffNote.style.cssText = "font-size: 0.72rem; color: #94a3b8; margin: 0.1rem 0 0.5rem; line-height: 1.5;";
          diffNote.textContent =
            "新人＝完全ランダム。中級＝移動先を評価（相手ゲート侵攻・自滅マス回避・必要な色）。上級＝さらに相手の進行度を見て接触で妨害。最強＝上級＋伏せカードののぞき見。";
          content.appendChild(diffNote);
          content.appendChild(
            buildCheckboxRow(t("opt.chk.cpuAutoAdvance"), isCpuAutoSkipEnabled(), (checked) => {
              setCpuAutoSkipEnabled(checked);
            })
          );
          content.appendChild(buildCpuSpeedRow());
        },
        {
          icon: "🤖",
          onReset: () => {
            setCpuSpeed("normal");
            setCpuAutoSkipEnabled(true);
            setCpuDifficulty("intermediate"); // ②CPU戦を強くする: 既定を中級に（cpu-battle-state.js参照）
            renderContent();
          },
        }
      )
    );

    // ユーザー要望「この自動処理を適用するかしないかを基本設定で変えれるようにもしたい」
    // への対応。対象カードは今のところ到達効果3枚・手札効果2枚（src/card-effects.jsに
    // 構造化データがあるもの）。ユーザー要望「オプションの基本設定はすべてアカウントに
    // 紐づけるように」への対応で、他の基本設定と同じくsaveMyPreferenceで保存する
    // （以前は試験運用中のためセッション限りだったが、この機能自体が実用段階に
    // 達したため account 保存に切り替えた）。デフォルトON（続き63）。
    panel.appendChild(
      buildCollapsibleSection(
        t("opt.sec.group.auto"),
        (content) => {
          const note = document.createElement("div");
          note.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; line-height: 1.5;";
          note.textContent =
            "ONにすると、対応済みのカードは承認モーダルの代わりに効果が自動で実行され、フェイズも自動で進行します。それ以外のカードは今まで通り自己申告のままです。";
          content.appendChild(note);
          // ユーザー要望（続き66）「自動処理モードはデフォではオンですが、オフにする
          // 場合はタイム制同様に全プレイヤーへの承認制にしましょう。1人だけ自動処理
          // モードとかだと変な挙動になっちゃいそうなので全員が同じモードの方が良い」。
          // オンライン中だけ承認申請（main.jsのbuildAutoProcessingToggleBanner等が
          // 実際の承認バナー・反映を担当）にし、ローカルモード（1人が全座席を操作）は
          // 従来通り即座に切り替える。
          // ランク戦は自動処理必須（docs/ranked-spec.md）。ランク対局中はONで固定し、
          // オフにできないようにする（承認申請の経路にも入れない。状態の最終担保はmain.jsの
          // render末尾の強制ON）。
          const inRankedGame = isOnlineMode() && isRankedGame();
          const autoProcessingCheckboxRow = buildCheckboxRow(
            t("opt.autoProcessing"),
            inRankedGame ? true : isAutoProcessingEnabled(),
            async (checked) => {
              if (inRankedGame) {
                // ランク戦ではオフにさせない。チェックを元に戻して終わる。
                renderContent();
                return;
              }
              if (isOnlineMode()) {
                const selfSeat = getSelfSeat();
                const queue = getFinalLockApprovalOrder(selfSeat, getState().activePlayers);
                if (getState().pendingAutoProcessingToggle) {
                  renderContent(); // 既に別の承認待ちが進行中ならチェックボックスの見た目を元に戻す
                  return;
                }
                if (queue.length === 0) {
                  // 他に参加者がいない（承認不要で即時反映してよい）場合はそのまま切り替える。
                  setAutoProcessingEnabled(checked);
                  return;
                }
                try {
                  await requestAutoProcessingToggle(selfSeat, checked, queue);
                  await fetchAndHydrate(getCurrentGameId());
                } catch (err) {
                  console.error("requestAutoProcessingToggle failed", err);
                }
                renderContent(); // 承認待ちの間はチェックボックスの見た目を元の値に戻しておく
                return;
              }
              setAutoProcessingEnabled(checked);
            }
          );
          if (inRankedGame) {
            const input = autoProcessingCheckboxRow.querySelector("input");
            if (input) {
              input.checked = true;
              input.disabled = true;
            }
            autoProcessingCheckboxRow.style.opacity = "0.75";
            const rankedNote = document.createElement("div");
            rankedNote.style.cssText = "font-size: 0.72rem; color: #fbbf24; margin: 0.2rem 0 0.5rem 0;";
            rankedNote.textContent = t("opt.rankedAutoFixed");
            content.appendChild(autoProcessingCheckboxRow);
            content.appendChild(rankedNote);
          } else {
            content.appendChild(autoProcessingCheckboxRow);
          }

          // ユーザー要望「自動処理モードでは駒やカードをルールに反して自由に動かせてしまうのを
          // 制限したい。ただし管理者だけはこの制限を解除できるように（制限が無い方がテストしやすい）」。
          // 制限ON（既定）時は、自動処理中に掴めるのは自分の手札カードだけになり、駒・盤面/ロックの
          // カード・山・相手の手札は掴めず、不正なドロップ（ロック不可タイミングのロック等）も弾かれる
          // （auto-drag-restriction.js / main.jsのfindDraggableAt・onDragEnd参照）。管理者にだけ
          // 解除チェックボックスを見せる。
          if (isAdminUser()) {
            const dragRestrictRow = buildCheckboxRow(
              "🔓 自動処理中も自由にドラッグする（操作制限を解除・管理者用）",
              !isAutoDragRestrictionEnabled(),
              (checked) => {
                setAutoDragRestrictionEnabled(!checked);
              }
            );
            content.appendChild(dragRestrictRow);
          }

          // ユーザー要望（続き74）「自動処理モード時は手札シャッフル/1枚ドロー/公開
          // ドロー/ターン終了を非表示にしてください。緊急のバグ発生時用としてオプ
          // ションの基本設定の中に『緊急ターン終了』ボタンを新設してください」。
          // 自動処理モードが自動でターンを終了してくれない不具合が起きた場合の
          // 最後の逃げ道として、通常のターン終了ボタン（自分の手番/優先権チェックで
          // 無効化され得る）を経由せず、state.jsのnextTurn()を直接叩く——「通常の
          // チェックが壊れている状況」への対処が目的のため、あえてそのチェックを
          // 迂回する。誤操作防止に確認ダイアログを挟む。通常のターン終了ボタンが
          // 表示されている間（自動処理OFF）は不要なので、自動処理ONの間だけ出す。
          if (isAutoProcessingEnabled()) {
            const emergencyBtn = document.createElement("button");
            emergencyBtn.type = "button";
            emergencyBtn.textContent = t("opt.emergencyEndTurn");
            emergencyBtn.style.cssText =
              "margin-top: 0.6rem; padding: 0.4rem 0.8rem; background: rgba(220, 38, 38, 0.15); " +
              "border: 1px solid rgba(220, 38, 38, 0.5); border-radius: 0.3rem; color: #fca5a5; " +
              "cursor: pointer; font-size: 0.8rem; width: 100%; box-sizing: border-box;";
            emergencyBtn.title =
              "自動処理モードでターンが自動終了しない等の不具合が起きた時のための緊急手段です。通常の確認（自分の手番かどうか等）を行わずに強制的にターンを終了します。";
            emergencyBtn.addEventListener("click", () => {
              if (confirm("緊急ターン終了を実行します。通常の確認を行わずに強制的にターンを終了しますが、よろしいですか？")) {
                nextTurn();
              }
            });
            content.appendChild(emergencyBtn);
          }

        },
        {
          icon: "⚙️",
          onReset: () => {
            setAutoProcessingEnabled(true);
            renderContent();
          },
        }
      )
    );

    // ランク戦の「待機プレイヤーが現れたら通知」（続き162、ranked-notify.js）。プレイ人口が
    // 少ない間のコールドスタート対策。アプリを開いている人向けの軽量版（タブ点滅＋音＋バナー）。
    // 設定はこの端末に保存（localStorage）。閉じていても届くプッシュ通知は次フェーズ。
    panel.appendChild(
      buildCollapsibleSection(
        t("opt.sec.rankedNotify"),
        (content) => {
          const note = document.createElement("div");
          note.style.cssText = "font-size: 0.75rem; color: #94a3b8; margin-bottom: 0.5rem; line-height: 1.5;";
          note.textContent =
            "ONにすると、ランク戦で対戦相手を募集中の人が現れた時、この端末でアプリを開いている間に" +
            "タブ点滅・音・バナーでお知らせします（アプリを閉じている時は届きません）。";
          content.appendChild(note);

          const enableRow = buildCheckboxRow(t("opt.notify.enable"), isRankedNotifyEnabled(), (checked) => {
            setRankedNotifyEnabled(checked);
          });
          content.appendChild(enableRow);

          // 通知してもいい時間帯（開始・終了の「時」）。
          const win = getRankedNotifyWindow();
          let curStart = win.start;
          let curEnd = win.end;
          const timeRow = document.createElement("div");
          timeRow.style.cssText =
            "display:flex; align-items:center; gap:0.4rem; margin:0.5rem 0 0.2rem; font-size:0.85rem; flex-wrap:wrap;";
          const timeLabel = document.createElement("span");
          timeLabel.textContent = t("opt.notify.timeLabel");
          const mkHourSelect = (value, onChange) => {
            const sel = document.createElement("select");
            sel.style.cssText =
              "padding:0.2rem 0.3rem; background:rgba(15,23,32,0.9); border:1px solid rgba(148,163,184,0.5); border-radius:0.3rem; color:#e2e8f0;";
            for (let h = 0; h < 24; h++) {
              const opt = document.createElement("option");
              opt.value = String(h);
              opt.textContent = `${h}時`;
              if (h === value) opt.selected = true;
              sel.appendChild(opt);
            }
            sel.addEventListener("change", () => onChange(parseInt(sel.value, 10)));
            return sel;
          };
          const startSel = mkHourSelect(curStart, (v) => {
            curStart = v;
            setRankedNotifyWindow(curStart, curEnd);
          });
          const endSel = mkHourSelect(curEnd, (v) => {
            curEnd = v;
            setRankedNotifyWindow(curStart, curEnd);
          });
          const tilde = document.createElement("span");
          tilde.textContent = "〜";
          timeRow.append(timeLabel, startSel, tilde, endSel);
          content.appendChild(timeRow);

          const winNote = document.createElement("div");
          winNote.style.cssText = "font-size:0.72rem; color:#94a3b8; margin-top:0.3rem; line-height:1.5;";
          winNote.textContent = t("opt.notify.hint");
          content.appendChild(winNote);
        },
        { icon: "🏆" }
      )
    );

    const shortcutRows = SHORTCUT_TARGETS.map(({ id, label }) => buildShortcutRow(id, label));
    shortcutSectionEl = buildCollapsibleSection(t("opt.sec.shortcuts"), (content) => {
      for (const { row } of shortcutRows) {
        content.appendChild(row);
      }
      const presetBtn = document.createElement("button");
      presetBtn.className = "options-menu-shortcut-preset";
      presetBtn.textContent = t("opt.shortcutRecommended");
      presetBtn.title = "手札シャッフル=S、盤面拡大=Z、1枚ドロー=Dを一括で割り当てます";
      presetBtn.addEventListener("click", () => {
        for (const [id, key] of Object.entries(RECOMMENDED_SHORTCUTS)) setShortcut(id, key);
        for (const { refresh } of shortcutRows) refresh();
        persistShortcuts();
      });
      content.appendChild(presetBtn);
    });
    panel.appendChild(shortcutSectionEl);

    panel.appendChild(buildAdvancedSection());

    panel.appendChild(buildResetAppearanceRow());

    const divider = document.createElement("div");
    divider.className = "options-menu-divider";
    panel.appendChild(divider);

    // 「📋 山札一覧」は基本設定ビューへ移した（対局中によく開くため、詳細設定に埋めない）。
    // 「🎓 チュートリアルを見る」はヘルプ画面へ移設済み（help.js）。
    // ユーザー要望「アクションログは誰でも見れてコピーできるようにしましょう」への
    // 対応（続き60時点では管理者限定にしていたが、不具合報告の際に誰でもログを
    // コピーして提出できた方が良いと判断し、他の管理者専用項目とは切り離した）。
    panel.appendChild(
      buildMenuItem("📜 アクションログ", () => {
        close();
        openActionLogPanel();
      })
    );
    // 「🐛 不具合報告」はユーザー要望でオプションメニューの外（オプションエリアのオンライン
    // アイコンの左隣、main.jsのbuildBugReportWidget）へ常設で外出ししたため、ここには置かない。
    // ユーザー要望「管理者モードの制限についてオプションの『管理者モード』ボタンから
    // 一般ユーザーは入れないようにしたい」への対応。位置合わせ用のスライダー等は
    // 元々「開発者が調整して出力欄の値をCSSへ反映する」ための道具であり、各プレイヤー
    // 個別の設定ではないため、開発者アカウントだけに絞るのが実態に合っている
    // （isAdminUserは表示の出し分けだけで、この管理者モード自体には元々
    // サーバー側で保護すべき機密操作は無い——通貨付与等の本当に危険な機能は
    // admin.js内の「🔐 管理者専用」セクションが別途サーバー側でも制限している）。
    if (isAdminUser()) {
      panel.appendChild(
        buildMenuItem(t("opt.adminMode"), () => {
          close();
          openAdminPanel();
        })
      );
      // ユーザー要望「カード効果の自動処理を作っていくにあたり、実際にゲーム画面で
      // 確認したい。管理者モードを潜っていくのは大変なので、オプションの直下に
      // 『カード開発モード』として追加してほしい。もちろん管理者のみ入れるように」
      // への対応。上の「⚙ 管理者モード」と同じisAdminUser()ガードをそのまま流用する。
      panel.appendChild(
        buildMenuItem("🃏 カード開発モード", () => {
          close();
          openCardDevMode();
        })
      );
      // ユーザー要望「管理者モードにマイページ内レイアウト変更モードのオンオフを追加。ONで
      // マイページの要素をドラッグ移動・端で拡大縮小でき、設定はテキスト出力して焼き込む」。
      // profile-layout-editor.js が実体。ONにしてマイページを開くと編集ハンドル/ツールバーが出る。
      panel.appendChild(
        buildCheckboxRow("🧩 マイページのレイアウト編集モード（管理者用）", isProfileLayoutEditMode(), (checked) => {
          setProfileLayoutEditMode(checked);
        })
      );
      // ユーザー要望2026-08-15「前半チュートリアルを済ませていると物語チュートリアルが最初から
      // 演出されない。管理者だけが押せる『チュートリアル実績リセット』が欲しい」。物語進捗
      // (so7-eidos-progress-v1)を消して、次回タイル起動で導入から演出し直せるようにする。表示名は消さない。
      panel.appendChild(
        buildMenuItem("🎓 チュートリアル実績をリセット（管理者用）", async () => {
          close();
          if (!window.confirm("物語チュートリアルの進行状況（導入既読・クリア状況など）をリセットしますか？\n次回タイル起動時に最初から演出されます（プレイヤー名は消えません）。")) return;
          try {
            const { resetEidosProgress } = await import("./eidos-story.js");
            resetEidosProgress();
            window.alert("チュートリアル実績をリセットしました。");
          } catch (err) {
            console.error("resetEidosProgress failed", err);
          }
        })
      );
    }
    // ユーザー要望「オプション画面に『タイトルに戻る』があってもいいかも」への対応。
  }

  renderContent();

  // プレイヤー用ボタンを右クリックした時、このパネルを開いて該当行を目立たせる。
  // open()が毎回中身を作り直すため、querySelectorは常にその時点の最新DOMを見る。
  registerShortcutSettingsOpener((buttonId) => {
    open();
    if (shortcutSectionEl) shortcutSectionEl.open = true;
    const row = panel.querySelector(`[data-shortcut-for="${buttonId}"]`);
    if (row) {
      row.scrollIntoView({ block: "center" });
      row.classList.add("is-highlighted");
      setTimeout(() => row.classList.remove("is-highlighted"), 1500);
    }
  });

  // ツールパネルなので背景は暗くしない。外側クリックで閉じる（統一ルール）。
  // ハマりどころ: このパネル自体のz-index(901)は他パネル(999〜1000)より低くしてあるため、
  // backdropも合わせて低くしないと（以前ここを999のままにしていた）、backdropがパネルより
  // 手前に来てパネル内のボタン・チェックボックスへのクリックを奪ってしまい、
  // 「管理者モードを押しても開かない」「チェックボックスが外せない」という形で症状が出る。
  const backdrop = createBackdrop(close, { dim: false, zIndex: 890 });
  backdrop.style.display = "none";

  const toggleBtn = document.createElement("button");
  toggleBtn.id = "options-menu-button";
  const { captionEl } = buildIconButtonContent(toggleBtn, {
    icon: "assets/icons/options.svg",
    tooltip: "基本設定・管理者モード・山札一覧などを開きます",
  });
  captionEl.textContent = t("opt.title");
  wireIconButtonClick(toggleBtn, {
    detailTitle: t("opt.title"),
    detailParagraphs: [
      "基本設定（効果音の音量・アニメーションの有無・ショートカットキー等）・管理者モード（見た目の細かい調整）・山札一覧（カード一覧の確認）をまとめたメニューです。",
    ],
    onAction: open,
  });

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  getOptionArea().appendChild(toggleBtn);
}
