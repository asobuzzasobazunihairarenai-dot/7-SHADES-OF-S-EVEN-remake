// エイドスとの会話を表示する、再利用可能な会話パネル（ユーザー要望2026-08-08）。
// 役割分離: ルール/操作の説明は既存の説明モーダル・吹き出しのまま。この会話UIは導入・場面転換・
// 評価・勝敗後など「物語性が必要な場面」専用。
//
// 使い方（低レベルAPI）:
//   const result = await runEidosDialogue(steps, { onStepShown });
//   steps: 会話ステップ配列（スキーマはeidos-dialogue-scenes.js参照）。
//   戻り値 result: { endedBy: "finished"|"choice", choice: <選んだ選択肢のvalue|null>, lastStepId }
//   選択肢を持つステップに到達したら、その選択を待って resolve（選択肢のvalueを返す）。
//   選択肢が無ければ最後まで送って resolve（choice:null）。
//
// 操作: パネルのタップ/クリック、またはEnter/Spaceで進行。文字送り中のタップ＝全文即時表示、
// 全文表示後のタップ＝次のセリフへ。会話中は盤面操作をロック（透明オーバーレイで吸収）、終了で解放。
// スマホでは画面下部の帯レイアウトにして盤面を隠しすぎない（CSS: #eidos-dialogue-panel）。
//
// 画像は必ず eidos-portraits.js 経由で解決（パス直書き禁止）。素材未配置IDは既定画像へフォールバック。

import { resolveEidosPortrait, resolveSeptPortrait } from "./eidos-portraits.js";

const TYPEWRITER_MS_PER_CHAR = 24;

let activeSession = null; // 多重起動防止（同時に1つだけ）

// 会話を再生する。stepsは配列。optionsは任意。Promiseを返す。
export function runEidosDialogue(steps, options = {}) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return Promise.resolve({ endedBy: "finished", choice: null, lastStepId: null });
  }
  // 既に会話中なら、前のをキャンセル扱いで畳んでから始める（実戦では基本起きない）。
  if (activeSession) activeSession.forceClose();

  return new Promise((resolve) => {
    const els = buildPanelDom();
    let index = -1;
    let typing = false;
    let typeTimer = null;
    let fullText = "";
    let resolved = false;

    function cleanup() {
      if (typeTimer) clearTimeout(typeTimer);
      window.removeEventListener("keydown", onKey, true);
      els.remove();
      document.body.classList.remove("eidos-dialogue-open");
      activeSession = null;
    }
    function finish(payload) {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(payload);
    }

    function renderStep(step) {
      // 立ち絵（位置: portraitSide "left"|"right"、既定 left）。
      const side = step.portraitSide === "right" ? "right" : "left";
      els.panel.dataset.portraitSide = side;
      els.portrait.style.backgroundImage = `url("${resolveEidosPortrait(step.portrait || "normal_front")}")`;
      // セプト（任意）。sept:true かつ画像が解決できれば出す。
      const septPath = step.sept ? resolveSeptPortrait(step.septPortrait || "sept_normal") : null;
      if (septPath) {
        els.sept.style.backgroundImage = `url("${septPath}")`;
        els.sept.style.display = "";
      } else {
        els.sept.style.display = "none";
      }
      els.name.textContent = step.speaker || "";
      // 本文（文字送り有無）。typewriterが明示false以外は文字送りする。
      fullText = step.text || "";
      els.choices.innerHTML = "";
      els.choices.style.display = "none";
      els.hint.style.display = "";
      if (step.typewriter === false) {
        els.text.textContent = fullText;
        typing = false;
        showChoicesIfAny(step);
      } else {
        startTypewriter(step);
      }
      options.onStepShown?.(step);
    }

    function startTypewriter(step) {
      typing = true;
      els.text.textContent = "";
      let i = 0;
      const tick = () => {
        els.text.textContent = fullText.slice(0, i);
        i++;
        if (i <= fullText.length) {
          typeTimer = setTimeout(tick, TYPEWRITER_MS_PER_CHAR);
        } else {
          typing = false;
          showChoicesIfAny(step);
        }
      };
      tick();
    }

    function completeTypewriter() {
      if (typeTimer) clearTimeout(typeTimer);
      typing = false;
      els.text.textContent = fullText;
      showChoicesIfAny(steps[index]);
    }

    function showChoicesIfAny(step) {
      if (!step?.choices?.length) return;
      els.hint.style.display = "none";
      els.choices.innerHTML = "";
      els.choices.style.display = "";
      step.choices.forEach((c) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "eidos-dialogue-choice";
        btn.textContent = c.label;
        btn.addEventListener("click", (ev) => {
          ev.stopPropagation();
          finish({ endedBy: "choice", choice: c.value ?? c.next ?? null, lastStepId: step.id ?? null });
        });
        els.choices.appendChild(btn);
      });
    }

    // タップ/クリック/キーで「進める」。
    function advance() {
      const step = steps[index];
      if (step?.choices?.length && !typing) return; // 選択肢待ちはタップで進めない（ボタンで選ぶ）
      if (typing) {
        completeTypewriter();
        return;
      }
      // 全文表示済み → 次へ。
      if (index >= steps.length - 1) {
        finish({ endedBy: "finished", choice: null, lastStepId: step?.id ?? null });
        return;
      }
      index++;
      renderStep(steps[index]);
    }

    function onKey(e) {
      if (e.key === "Enter" || e.key === " " || e.code === "Space") {
        e.preventDefault();
        e.stopPropagation();
        advance();
      }
    }

    els.panel.addEventListener("click", advance);
    window.addEventListener("keydown", onKey, true);

    activeSession = { forceClose: () => finish({ endedBy: "finished", choice: null, lastStepId: null }) };
    document.body.classList.add("eidos-dialogue-open");
    document.body.appendChild(els.root);
    // 最初のステップへ。
    index = 0;
    renderStep(steps[0]);
  });
}

export function isEidosDialogueOpen() {
  return !!activeSession;
}

// パネル一式のDOMを組む。root = 盤面ロック用オーバーレイ＋会話パネル。
function buildPanelDom() {
  const root = document.createElement("div");
  root.id = "eidos-dialogue-root";

  // 盤面操作ロック用の透明オーバーレイ（会話中は盤面クリックを吸収）。パネルより後ろ。
  const blocker = document.createElement("div");
  blocker.id = "eidos-dialogue-blocker";
  blocker.addEventListener("click", (e) => e.stopPropagation());
  root.appendChild(blocker);

  const panel = document.createElement("div");
  panel.id = "eidos-dialogue-panel";

  const portrait = document.createElement("div");
  portrait.className = "eidos-dialogue-portrait";

  const sept = document.createElement("div");
  sept.className = "eidos-dialogue-sept";
  sept.style.display = "none";

  const body = document.createElement("div");
  body.className = "eidos-dialogue-body";
  const name = document.createElement("div");
  name.className = "eidos-dialogue-name";
  const text = document.createElement("div");
  text.className = "eidos-dialogue-text";
  const choices = document.createElement("div");
  choices.className = "eidos-dialogue-choices";
  choices.style.display = "none";
  const hint = document.createElement("div");
  hint.className = "eidos-dialogue-hint";
  hint.textContent = "▶ タップ / Enter / Space で進む";
  body.append(name, text, choices, hint);

  panel.append(portrait, sept, body);
  root.appendChild(panel);

  return {
    root,
    panel,
    portrait,
    sept,
    name,
    text,
    choices,
    hint,
    remove: () => root.remove(),
  };
}
