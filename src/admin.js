// Phase 1: プレイマット画像とロックエリアの位置合わせを、コードを直接編集せずに
// ブラウザ上のスライダーで調整し、最終値をテキストで書き出せる管理者モード。
// 調整が終わったら「出力」欄の内容をそのまま開発者に渡せば、CSSの :root にある
// 対応する変数へそのまま反映できる。

// playmat-scaleは盤面(.board)の実サイズを100%とした拡大率（transform: scaleなので中心基準・見切れない）。
// pos-x/pos-yは中心からのずれ（%、transform: translateなのでこちらも見切れない）。
const CONTROLS = [
  { key: "--playmat-scale", label: "プレイマット拡大率", unit: "", min: 0.5, max: 3, step: 0.01, default: 1.3 },
  { key: "--playmat-pos-x", label: "プレイマット位置X（中心からのずれ）", unit: "%", min: -50, max: 50, step: 0.5, default: 0 },
  { key: "--playmat-pos-y", label: "プレイマット位置Y（中心からのずれ）", unit: "%", min: -50, max: 50, step: 0.5, default: 0 },
  { key: "--lock-thickness", label: "ロック帯の太さ", unit: "rem", min: 0.3, max: 3, step: 0.05, default: 1.45 },
  { key: "--arena-gap", label: "ロックエリアと盤面の間隔", unit: "rem", min: 0, max: 2, step: 0.05, default: 0 },
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

function buildPanel() {
  const panel = document.createElement("div");
  panel.id = "admin-panel";
  panel.style.cssText = `
    position: fixed; top: 1rem; left: 1rem; z-index: 1000;
    background: rgba(15, 23, 32, 0.92); border: 1px solid rgba(148,163,184,0.4);
    border-radius: 0.5rem; padding: 0.75rem; width: 19rem;
    font-family: sans-serif; font-size: 0.75rem; color: #e2e8f0;
    display: none;
  `;

  const title = document.createElement("div");
  title.textContent = "管理者モード：位置合わせ";
  title.style.cssText = "font-weight: bold; margin-bottom: 0.5rem;";
  panel.appendChild(title);

  for (const c of CONTROLS) {
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
    });

    row.appendChild(labelRow);
    row.appendChild(slider);
    panel.appendChild(row);
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
  exportEl.style.cssText = "width: 100%; height: 8rem; margin-top: 0.3rem; background: #0f1520; color: #a5f3fc; font-family: monospace; font-size: 0.7rem; border: 1px solid rgba(148,163,184,0.3); border-radius: 0.25rem; padding: 0.4rem; box-sizing: border-box;";
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
