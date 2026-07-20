// 画面右上の「⚙ オプション」ボタン。押すと開発者/管理者向けの各種ツールや、プレイヤーが
// その場で切り替えたい基本設定をまとめた小さなドロップダウンが開く。以前は「⚙ 管理者モード」が
// 単独のボタンとして左上にあったが、ここに統合し、左上はゲームタイトル表示用に空けた。

import { openAdminPanel } from "./admin.js";
import { isLockAreaBarVisible, setLockAreaBarVisible } from "./lock-area-bar.js";
import { isLockColorVisible, setLockColorVisible } from "./lock-color.js";
import { getSoundVolume, setSoundVolume } from "./sound.js";
import { SHORTCUT_TARGETS, getShortcut, setShortcut, registerShortcutSettingsOpener } from "./player-buttons.js";
import { createBackdrop } from "./ui-helpers.js";
import {
  isFlightAnimationDisabled,
  setFlightAnimationDisabled,
  isArrivalEffectDisabled,
  setArrivalEffectDisabled,
  isContinuousGlowDisabled,
  setContinuousGlowDisabled,
} from "./motion-prefs.js";
import { saveMyPreference } from "./online.js";

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
  label.textContent = "効果音の音量";
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
    keyBtn.textContent = "キーを押してください…";
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

  function close() {
    panel.style.display = "none";
    backdrop.style.display = "none";
  }
  function open() {
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
  }

  function renderContent() {
    panel.innerHTML = "";

    panel.appendChild(buildSectionTitle("基本設定"));
    panel.appendChild(
      buildCheckboxRow("ロックエリアバーを表示する", isLockAreaBarVisible(), (checked) => {
        setLockAreaBarVisible(checked);
        window.dispatchEvent(new CustomEvent("admin:change"));
        saveMyPreference({ lock_area_bar_visible: checked });
      })
    );
    panel.appendChild(
      buildCheckboxRow("ロックエリアの色を表示する", isLockColorVisible(), (checked) => {
        setLockColorVisible(checked);
        window.dispatchEvent(new CustomEvent("admin:change"));
        saveMyPreference({ lock_color_visible: checked });
      })
    );
    const volumeRow = buildVolumeRow();
    const volumeSlider = volumeRow.querySelector("input[type=range]");
    volumeSlider.addEventListener("change", () => {
      saveMyPreference({ sound_volume: Number(volumeSlider.value) / 100 });
    });
    panel.appendChild(volumeRow);

    panel.appendChild(buildSectionTitle("モーダル表示時間"));
    panel.appendChild(
      buildDurationRow("相手ゲート侵攻ボーナス通知", "--gate-invasion-modal-step-duration", 3.5, (value) => {
        saveMyPreference({ gate_invasion_modal_duration: value });
      })
    );
    panel.appendChild(
      buildDurationRow("到達モーダル", "--card-arrival-modal-duration", 5, (value) => {
        saveMyPreference({ card_arrival_modal_duration: value });
      })
    );
    panel.appendChild(
      buildDurationRow("カード獲得ポップアップ", "--hand-pickup-toast-duration", 5, (value) => {
        saveMyPreference({ hand_pickup_toast_duration: value });
      })
    );

    // パフォーマンス改善用。純粋にクライアントローカルな描画設定のため、1人がオンにしても
    // 相手プレイヤーの画面には一切影響しない（各ブラウザは自分のstateから独立して描画する）。
    panel.appendChild(buildSectionTitle("アニメーションを減らす（動作が重い時に）"));
    panel.appendChild(
      buildCheckboxRow("移動アニメーション（駒・カードの飛翔）を無効にする", isFlightAnimationDisabled(), (checked) => {
        setFlightAnimationDisabled(checked);
        saveMyPreference({ flight_animation_disabled: checked });
      })
    );
    panel.appendChild(
      buildCheckboxRow("到達・ロック演出（光の柱・ロック画像等）を無効にする", isArrivalEffectDisabled(), (checked) => {
        setArrivalEffectDisabled(checked);
        saveMyPreference({ arrival_effect_disabled: checked });
      })
    );
    panel.appendChild(
      buildCheckboxRow("常時光る演出（手番のグロー等）を無効にする", isContinuousGlowDisabled(), (checked) => {
        setContinuousGlowDisabled(checked);
        document.body.classList.toggle("reduce-glow", checked);
        saveMyPreference({ continuous_glow_disabled: checked });
      })
    );

    const shortcutDivider = document.createElement("div");
    shortcutDivider.className = "options-menu-divider";
    panel.appendChild(shortcutDivider);

    panel.appendChild(buildSectionTitle("ショートカットキー（プレイヤー用ボタン）"));
    const shortcutRows = SHORTCUT_TARGETS.map(({ id, label }) => buildShortcutRow(id, label));
    for (const { row } of shortcutRows) {
      panel.appendChild(row);
    }

    const presetBtn = document.createElement("button");
    presetBtn.className = "options-menu-shortcut-preset";
    presetBtn.textContent = "⭐ おすすめ";
    presetBtn.title = "手札シャッフル=S、盤面拡大=Z、1枚ドロー=Dを一括で割り当てます";
    presetBtn.addEventListener("click", () => {
      for (const [id, key] of Object.entries(RECOMMENDED_SHORTCUTS)) setShortcut(id, key);
      for (const { refresh } of shortcutRows) refresh();
      persistShortcuts();
    });
    panel.appendChild(presetBtn);

    const divider = document.createElement("div");
    divider.className = "options-menu-divider";
    panel.appendChild(divider);

    panel.appendChild(
      buildMenuItem("⚙ 管理者モード", () => {
        close();
        openAdminPanel();
      })
    );
  }

  renderContent();

  // プレイヤー用ボタンを右クリックした時、このパネルを開いて該当行を目立たせる。
  // open()が毎回中身を作り直すため、querySelectorは常にその時点の最新DOMを見る。
  registerShortcutSettingsOpener((buttonId) => {
    open();
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
  toggleBtn.className = "header-tool-button";
  toggleBtn.textContent = "⚙ オプション";
  toggleBtn.addEventListener("click", open);

  document.body.appendChild(backdrop);
  document.body.appendChild(panel);
  document.body.appendChild(toggleBtn);
}
