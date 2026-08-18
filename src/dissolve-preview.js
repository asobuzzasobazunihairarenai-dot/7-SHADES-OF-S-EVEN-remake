// 手札使用のCanvas霧散演出（card-dissolve.js）のプレビュー/シミュレーション画面（続き220）。
// ユーザー要望「V4/V5の長さ等を管理者モードで調整したい。試作のような演出シミュレーション画面が
// あってもいい」。使用カード・追色カード・V4/V5・各スライダー（→CSS変数）を選んで再生できる。
// 管理者モードの「手札使用の霧散演出」グループの『プレビューを開く』ボタンから呼ぶ。
import { playCardDissolve } from "./card-dissolve.js";
import { NORMAL_CARDS } from "./cards-data.js";

let overlay = null;

const SLIDERS = [
  { key: "--dissolve-speed", label: "速さ（小さいほど長い）", min: 0.4, max: 1.4, step: 0.05, fb: 0.85 },
  { key: "--dissolve-mist", label: "湯気の濃さ", min: 0.4, max: 1.6, step: 0.05, fb: 1 },
  { key: "--dissolve-residue", label: "残滓の量", min: 0.4, max: 1.8, step: 0.05, fb: 1 },
  { key: "--dissolve-card-size", label: "中央カードの大きさ(px)", min: 200, max: 560, step: 10, fb: 340 },
];

function readVar(key, fb) {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(key));
  return Number.isFinite(v) ? v : fb;
}

export function openDissolvePreview() {
  if (overlay) return;
  overlay = document.createElement("div");
  overlay.id = "dissolve-preview-overlay";

  // 暗幕（演出canvasは z-index 10660。その下＝10650 に敷いて演出を見やすく）
  const backdrop = document.createElement("div");
  backdrop.style.cssText = "position:fixed;inset:0;background:radial-gradient(ellipse at 50% 45%,#0c1524,#05070a 70%);z-index:10650;";
  overlay.appendChild(backdrop);

  // 操作パネル（演出canvasの上＝10700）
  const panel = document.createElement("div");
  panel.style.cssText =
    "position:fixed;top:1.2rem;left:1.2rem;z-index:10700;width:17rem;max-height:calc(100vh - 2.4rem);overflow-y:auto;" +
    "background:rgba(12,17,26,0.94);border:1px solid rgba(255,255,255,0.14);border-radius:0.6rem;padding:1rem 1rem 1.2rem;" +
    "color:#e6edfb;font-size:0.78rem;box-shadow:0 0.6rem 2rem rgba(0,0,0,0.6);";
  overlay.appendChild(panel);

  const title = document.createElement("div");
  title.textContent = "🎬 手札使用の霧散演出プレビュー";
  title.style.cssText = "font-size:0.86rem;font-weight:700;margin-bottom:0.8rem;letter-spacing:0.02em;";
  panel.appendChild(title);

  const mkSelect = (labelText, defId) => {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:block;margin-bottom:0.7rem;";
    const lab = document.createElement("div");
    lab.textContent = labelText;
    lab.style.cssText = "color:#9aa6be;font-size:0.72rem;margin-bottom:0.25rem;";
    wrap.appendChild(lab);
    const sel = document.createElement("select");
    sel.style.cssText = "width:100%;background:#0f1520;color:#e6edfb;border:1px solid rgba(255,255,255,0.16);border-radius:0.35rem;padding:0.35rem 0.4rem;font-size:0.76rem;";
    for (const c of NORMAL_CARDS) {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.name}（${c.color}）`;
      sel.appendChild(opt);
    }
    sel.value = defId;
    wrap.appendChild(sel);
    panel.appendChild(wrap);
    return sel;
  };

  const usedSel = mkSelect("使用カード", "red-jump-pad");
  const costSel = mkSelect("追色カード（V5用）", "blue-slum-official");

  // V4 / V5 切替
  const modeRow = document.createElement("div");
  modeRow.style.cssText = "display:flex;gap:0.4rem;margin-bottom:0.8rem;";
  let mode = "v4";
  const mkModeBtn = (m, text) => {
    const b = document.createElement("button");
    b.textContent = text;
    b.style.cssText = "flex:1;padding:0.4rem 0;border:1px solid rgba(255,255,255,0.18);border-radius:0.35rem;background:#0f1520;color:#c7d2e6;font-size:0.74rem;cursor:pointer;";
    b.addEventListener("click", () => {
      mode = m;
      updateModeBtns();
      costSel.parentElement.style.opacity = mode === "v5" ? "1" : "0.4";
    });
    return b;
  };
  const v4Btn = mkModeBtn("v4", "V4 通常");
  const v5Btn = mkModeBtn("v5", "V5 追色");
  const updateModeBtns = () => {
    for (const [b, m] of [[v4Btn, "v4"], [v5Btn, "v5"]]) {
      const on = mode === m;
      b.style.background = on ? "#dce6f6" : "#0f1520";
      b.style.color = on ? "#10141d" : "#c7d2e6";
      b.style.borderColor = on ? "#dce6f6" : "rgba(255,255,255,0.18)";
    }
  };
  modeRow.appendChild(v4Btn);
  modeRow.appendChild(v5Btn);
  panel.appendChild(modeRow);
  updateModeBtns();
  costSel.parentElement.style.opacity = "0.4";

  // スライダー（CSS変数を直接書き換え＝card-dissolve.jsが再生時に読む。管理者モードのスライダーとも共有）
  for (const s of SLIDERS) {
    const wrap = document.createElement("label");
    wrap.style.cssText = "display:block;margin-bottom:0.55rem;";
    const head = document.createElement("div");
    head.style.cssText = "display:flex;justify-content:space-between;color:#9aa6be;font-size:0.7rem;margin-bottom:0.15rem;";
    const lab = document.createElement("span");
    lab.textContent = s.label;
    const val = document.createElement("span");
    head.appendChild(lab);
    head.appendChild(val);
    wrap.appendChild(head);
    const range = document.createElement("input");
    range.type = "range";
    range.min = String(s.min);
    range.max = String(s.max);
    range.step = String(s.step);
    range.value = String(readVar(s.key, s.fb));
    range.style.cssText = "width:100%;accent-color:#dce8ff;";
    val.textContent = range.value;
    range.addEventListener("input", () => {
      document.documentElement.style.setProperty(s.key, range.value);
      val.textContent = range.value;
    });
    wrap.appendChild(range);
    panel.appendChild(wrap);
  }

  // 再生ボタン
  const playBtn = document.createElement("button");
  playBtn.textContent = "▶ 再生";
  playBtn.style.cssText = "width:100%;margin-top:0.5rem;padding:0.6rem 0;border:1px solid #cbd8ed;border-radius:0.4rem;background:#dce6f6;color:#10141d;font-size:0.82rem;font-weight:700;cursor:pointer;letter-spacing:0.04em;";
  playBtn.addEventListener("click", () => {
    // 前の演出canvasが残っていたら消してから再生（連続再生の確認用）
    document.querySelectorAll(".card-dissolve-canvas").forEach((c) => c.remove());
    const used = usedSel.value;
    if (mode === "v5") {
      playCardDissolve(used, { costCardId: costSel.value, costStart: { x: 520, y: 760 } });
    } else {
      playCardDissolve(used);
    }
  });
  panel.appendChild(playBtn);

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕ 閉じる";
  closeBtn.style.cssText = "width:100%;margin-top:0.5rem;padding:0.45rem 0;border:1px solid rgba(255,255,255,0.2);border-radius:0.4rem;background:transparent;color:#9aa6be;font-size:0.76rem;cursor:pointer;";
  closeBtn.addEventListener("click", closeDissolvePreview);
  panel.appendChild(closeBtn);

  const note = document.createElement("div");
  note.textContent = "スライダーはCSS変数を直接変更（管理者モードの「手札使用の霧散演出」スライダーと共有）。良い値が決まったら管理者モードの「出力をコピー」で共有してください。";
  note.style.cssText = "margin-top:0.7rem;color:#6b7690;font-size:0.66rem;line-height:1.7;";
  panel.appendChild(note);

  document.body.appendChild(overlay);
}

export function closeDissolvePreview() {
  document.querySelectorAll(".card-dissolve-canvas").forEach((c) => c.remove());
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}
