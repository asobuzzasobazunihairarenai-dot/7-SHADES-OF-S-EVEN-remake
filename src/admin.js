// Phase 1: プレイマット画像・ロックエリア・各種カードの山の位置合わせを、コードを直接編集せずに
// ブラウザ上のスライダーで調整し、最終値をテキストで書き出せる管理者モード。
// 調整が終わったら「出力」欄の内容をそのまま開発者に渡せば、CSSの :root にある
// 対応する変数へそのまま反映できる。

// scaleは基準サイズ（プレイマットなら盤面、各山ならカード1枚分）を100%とした拡大率。
// pos-x/pos-yは中心からのずれ。どちらもtransform: scale/translateなので、拡大しても見切れない。
const GROUPS = [
  {
    title: "プレイマット",
    controls: [
      { key: "--playmat-scale", label: "拡大率", unit: "", min: 0.5, max: 3, step: 0.01, default: 1.42 },
      { key: "--playmat-pos-x", label: "位置X（中心からのずれ）", unit: "%", min: -50, max: 50, step: 0.5, default: 0 },
      { key: "--playmat-pos-y", label: "位置Y（中心からのずれ）", unit: "%", min: -50, max: 50, step: 0.5, default: 0 },
    ],
  },
  {
    title: "ロックエリア（盤面中心からの距離、デフォルトはマスに密着）",
    controls: [
      { key: "--lock-top-pos-x", label: "奥/C側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-top-pos-y", label: "奥/C側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bottom-pos-x", label: "手前/A側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-bottom-pos-y", label: "手前/A側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-left-pos-x", label: "左/B側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-left-pos-y", label: "左/B側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-right-pos-x", label: "右/D側 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-right-pos-y", label: "右/D側 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--lock-slot-border-width", label: "枠線の太さ", unit: "rem", min: 0.02, max: 0.4, step: 0.02, default: 0.1 },
    ],
  },
  {
    title: "プレイヤー名ラベルの位置",
    controls: [
      { key: "--label-a-pos-x", label: "A（自分）位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-a-pos-y", label: "A（自分）位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-b-pos-x", label: "B 位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-b-pos-y", label: "B 位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-c-pos-x", label: "C 位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-c-pos-y", label: "C 位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-d-pos-x", label: "D 位置X", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
      { key: "--label-d-pos-y", label: "D 位置Y", unit: "rem", min: -24, max: 24, step: 0.1, default: 0 },
    ],
  },
  {
    title: "手札の位置（盤面中心からのずれ）",
    controls: [
      { key: "--hand-a-pos-x", label: "A（自分）位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-a-pos-y", label: "A（自分）位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-b-pos-x", label: "B 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-b-pos-y", label: "B 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-c-pos-x", label: "C 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-c-pos-y", label: "C 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-d-pos-x", label: "D 位置X", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
      { key: "--hand-d-pos-y", label: "D 位置Y", unit: "rem", min: -10, max: 10, step: 0.1, default: 0 },
    ],
  },
  {
    title: "手札エリアのサイズ（手札3枚時が基準。枚数に応じて自動で伸縮）",
    controls: [
      { key: "--hand-a-size", label: "A（自分）サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 16 },
      { key: "--hand-b-size", label: "B サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 10 },
      { key: "--hand-c-size", label: "C サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 10 },
      { key: "--hand-d-size", label: "D サイズ", unit: "rem", min: 4, max: 30, step: 0.5, default: 10 },
    ],
  },
  {
    title: "手札エリアの厚み（扇が伸びない方向。固定値、ロックエリアとの干渉調整用）",
    controls: [
      { key: "--hand-a-thickness", label: "A（自分）厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 7 },
      { key: "--hand-b-thickness", label: "B 厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 2.5 },
      { key: "--hand-c-thickness", label: "C 厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 5.2 },
      { key: "--hand-d-thickness", label: "D 厚み", unit: "rem", min: 1, max: 12, step: 0.1, default: 1.8 },
    ],
  },
  {
    title: "山札",
    controls: [
      { key: "--deck-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--deck-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
      { key: "--deck-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
    ],
  },
  {
    title: "捨て場",
    controls: [
      { key: "--discard-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--discard-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
      { key: "--discard-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
    ],
  },
  {
    title: "エターナルカード",
    controls: [
      { key: "--eternal-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--eternal-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
      { key: "--eternal-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
    ],
  },
  {
    title: "ファーストカード",
    controls: [
      { key: "--first-scale", label: "拡大率", unit: "", min: 0.3, max: 3, step: 0.01, default: 1 },
      { key: "--first-pos-x", label: "位置X（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
      { key: "--first-pos-y", label: "位置Y（中心からのずれ）", unit: "rem", min: -25, max: 25, step: 0.1, default: 0 },
    ],
  },
];

const CONTROLS = GROUPS.flatMap((g) => g.controls);

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

function buildPanel() {
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
  title.style.cssText = "font-weight: bold; margin-bottom: 0.5rem;";
  panel.appendChild(title);

  for (const group of GROUPS) {
    const groupTitle = document.createElement("div");
    groupTitle.textContent = group.title;
    groupTitle.style.cssText = "font-weight: bold; margin-top: 0.7rem; margin-bottom: 0.3rem; color: #7dd3fc; border-top: 1px solid rgba(148,163,184,0.25); padding-top: 0.5rem;";
    panel.appendChild(groupTitle);

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
      panel.appendChild(row);
    }
  }

  const buttonRow = document.createElement("div");
  buttonRow.style.cssText = "display: flex; gap: 0.4rem; margin-top: 0.5rem;";

  const resetBtn = document.createElement("button");
  resetBtn.textContent = "リセット";
  resetBtn.style.cssText = "flex: 1; padding: 0.3rem; background: #334155; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  resetBtn.addEventListener("click", () => {
    for (const c of CONTROLS) {
      setVar(c.key, c.default, c.unit);
    }
    rebuildSliders();
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

  function updateExport() {
    const lines = CONTROLS.map((c) => `  ${c.key}: ${currentValue(c.key, c.default)}${c.unit};`);
    exportEl.value = `:root {\n${lines.join("\n")}\n}`;
  }

  updateExport();
  return panel;
}

function buildToggleButton(panel) {
  const btn = document.createElement("button");
  btn.textContent = "⚙ 管理者モード";
  btn.style.cssText = `
    position: fixed; top: 1rem; left: 1rem; z-index: 1001;
    padding: 0.4rem 0.7rem; background: rgba(15,23,32,0.85); color: #e2e8f0;
    border: 1px solid rgba(148,163,184,0.4); border-radius: 0.4rem; cursor: pointer;
    font-family: sans-serif; font-size: 0.75rem;
  `;
  let open = false;
  btn.addEventListener("click", () => {
    open = !open;
    panel.style.display = open ? "block" : "none";
    btn.style.display = open ? "none" : "block";
  });
  panel.dataset.toggleAttached = "true";

  // パネルを閉じるボタンも用意する
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "閉じる";
  closeBtn.style.cssText = "width: 100%; margin-top: 0.5rem; padding: 0.3rem; background: #475569; color: #fff; border: none; border-radius: 0.25rem; cursor: pointer;";
  closeBtn.addEventListener("click", () => {
    open = false;
    panel.style.display = "none";
    btn.style.display = "block";
  });
  panel.appendChild(closeBtn);

  return btn;
}

export function initAdminMode() {
  const panel = buildPanel();
  const btn = buildToggleButton(panel);
  document.body.appendChild(btn);
  document.body.appendChild(panel);
}
