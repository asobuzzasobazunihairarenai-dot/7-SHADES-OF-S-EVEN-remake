// エイドスとの物語会話を表示する、再利用可能な会話パネル（ユーザー要望2026-08-08 / 決定稿）。
// 役割分離: ルール/操作の説明は既存の説明モーダル・吹き出しのまま。この会話UIは導入・場面転換・
// 評価・勝敗後など「物語性が必要な場面」専用（既存の説明UIとは混在させない）。
//
// 表示方針（決定稿の共通表示方針）:
//   ・主人公（記憶を失った青年）= 画面左 / エイドス = 画面右 / セプト = 中央下（必要な時だけ）。
//   ・発話者は明度100%・不透明度100%・わずかに前へ拡大。聞き手は明度70〜80%・不透明度75〜85%。
//   ・発話していない側も原則消さない。話者名と本文は発話者側に寄せる。
//   ・選択肢表示中は両者を通常の明るさへ戻す。立ち絵切り替えは短いフェードで、強い点滅はさせない。
//
// 使い方（低レベルAPI）:
//   const result = await runEidosDialogue(steps, { onStepShown, fadeInFromBlack });
//   戻り値 result: { endedBy: "finished"|"choice", choice: <選んだ選択肢のvalue|null>, lastStepId }
//   ステップ内分岐: choice.next / step.next に「遷移先ステップID」を指定すると、そのIDへジャンプして続行。
//   choice.value だけ（nextなし）なら、その値を返して会話終了（呼び出し側がゲームイベントを解釈）。
//
// 操作: パネルのタップ/クリック、またはEnter/Spaceで進行。文字送り中のタップ＝全文即時表示、
// 全文表示後のタップ＝次のセリフへ。会話中は盤面操作をロック（透明オーバーレイで吸収）、終了で解放。
//
// 画像は必ず eidos-portraits.js 経由で解決（パス直書き禁止）。専用素材が無いIDは近い実絵へフォールバック。

import { resolveEidosPortrait, resolveProtagonistPortrait, resolveSeptPortrait } from "./eidos-portraits.js";
import { t } from "./ui-text.js"; // UI英語化フェーズ13

const TYPEWRITER_MS_PER_CHAR = 24;

let activeSession = null; // 多重起動防止（同時に1つだけ）

export function runEidosDialogue(steps, options = {}) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return Promise.resolve({ endedBy: "finished", choice: null, lastStepId: null });
  }
  if (activeSession) activeSession.forceClose();

  // ステップID → 配列index。分岐（next / choice.next）でジャンプするために使う。
  const idToIndex = new Map();
  steps.forEach((s, i) => {
    if (s.id != null) idToIndex.set(String(s.id), i);
  });

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
      els.root.remove();
      document.body.classList.remove("eidos-dialogue-open");
      activeSession = null;
    }
    function finish(payload) {
      if (resolved) return;
      resolved = true;
      // 退場フェード（強い点滅を避け、静かに閉じる）。
      els.root.classList.add("is-closing");
      setTimeout(() => {
        cleanup();
        resolve(payload);
      }, 200);
    }

    function applyPortraits(step) {
      // 両者とも原則表示。step未指定側は既定の向き（主人公=右向き / エイドス=左向き）へ。
      const pPath = resolveProtagonistPortrait(step.protagonist || "youth_normal");
      const ePath = resolveEidosPortrait(step.eidos || "normal_left");
      setPortraitImage(els.left, pPath);
      setPortraitImage(els.right, ePath);
      // セプト（中央下）。sept にIDが入っている時だけ表示。
      const septId = typeof step.sept === "string" ? step.sept : null;
      const septPath = septId ? resolveSeptPortrait(septId) : null;
      if (septPath) {
        setPortraitImage(els.sept, septPath);
        els.sept.classList.add("is-shown");
      } else {
        els.sept.classList.remove("is-shown");
      }
      // 発話者ハイライト。side: "left"(主人公) / "right"(エイドス) / "sept"。
      const side = step.side === "right" ? "right" : step.side === "sept" ? "sept" : "left";
      // 選択肢待ちのステップは両者を通常の明るさへ戻す（決定稿）。
      const neutral = !!step.choices?.length;
      setSpeaking(els.left, !neutral && side === "left");
      setSpeaking(els.right, !neutral && side === "right");
      setSpeaking(els.sept, !neutral && side === "sept");
      els.panel.dataset.speakerSide = side;
      // 演出フック（best-effort。未スタイルでも無害なクラスだけ付ける）。
      els.root.classList.toggle("fx-bg-dim", !!step.fx?.bgDim);
      els.root.classList.toggle("fx-aura-dark", !!step.fx?.auraDark);
      els.root.classList.toggle("fx-aura-gray", !!step.fx?.auraGray);
    }

    function renderStep(step) {
      applyPortraits(step);
      // 話者名は呼び出し側(options.resolveSpeaker)が解決したものを優先（主人公は名前設定後
      // 「記憶を失った青年ー○○」と表示する、等）。空話者のステップは非表示のまま。
      const speakerLabel = options.resolveSpeaker ? options.resolveSpeaker(step) : step.speaker || "";
      els.name.textContent = speakerLabel || "";
      els.name.style.visibility = speakerLabel ? "" : "hidden";
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
      const step = steps[index];
      // 選択肢待ちに切り替わったら両者を通常の明るさへ戻す。
      if (step?.choices?.length) {
        setSpeaking(els.left, false);
        setSpeaking(els.right, false);
        setSpeaking(els.sept, false);
      }
      showChoicesIfAny(step);
    }

    // 入力ステップ（名前入力など）: choicesコンテナを流用してテキスト入力＋決定ボタンを出す。
    // 決定でoptions.onInput(value,step)を呼び、通常ステップと同じ要領で次へ進む。
    function showInputField(step) {
      setSpeaking(els.left, false);
      setSpeaking(els.right, false);
      setSpeaking(els.sept, false);
      els.hint.style.display = "none";
      els.choices.innerHTML = "";
      els.choices.style.display = "";
      const wrap = document.createElement("div");
      wrap.className = "eidos-dialogue-input-wrap";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "eidos-dialogue-input";
      input.maxLength = step.input.maxLength || 12;
      // 初期値は呼び出し側(options.getInputDefault)が解決したものを優先（既に本人が名前を
      // 設定済みならその名前を初期値にする、等）。無ければステップ定義の既定値。
      const resolvedDefault = options.getInputDefault ? options.getInputDefault(step) : null;
      input.value = resolvedDefault ?? step.input.default ?? "";
      if (step.input.placeholder) input.placeholder = step.input.placeholder;
      input.addEventListener("click", (e) => e.stopPropagation());
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "eidos-dialogue-choice";
      btn.textContent = step.input.confirmLabel || t("edu.confirm");
      const submit = () => {
        const v = (input.value || "").trim() || (step.input.default || "");
        try {
          options.onInput?.(v, step);
        } catch (e) {
          console.error("onInput failed", e);
        }
        if (step.next != null && idToIndex.has(String(step.next))) {
          goTo(idToIndex.get(String(step.next)));
          return;
        }
        if (index >= steps.length - 1) {
          finish({ endedBy: "finished", choice: null, lastStepId: step.id ?? null });
          return;
        }
        goTo(index + 1);
      };
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        submit();
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          submit();
        }
      });
      wrap.append(input, btn);
      els.choices.appendChild(wrap);
      setTimeout(() => {
        try {
          input.focus();
          input.select();
        } catch {
          /* focus不可でも入力は可能 */
        }
      }, 60);
    }

    function showChoicesIfAny(step) {
      if (step?.input) {
        showInputField(step);
        return;
      }
      if (!step?.choices?.length) return;
      // 選択肢表示中は両者を通常の明るさへ戻す（決定稿）。
      setSpeaking(els.left, false);
      setSpeaking(els.right, false);
      setSpeaking(els.sept, false);
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
          if (c.next != null && idToIndex.has(String(c.next))) {
            goTo(idToIndex.get(String(c.next)));
          } else {
            finish({ endedBy: "choice", choice: c.value ?? c.next ?? null, lastStepId: step.id ?? null });
          }
        });
        els.choices.appendChild(btn);
      });
    }

    function goTo(i) {
      index = i;
      renderStep(steps[index]);
    }

    function advance() {
      const step = steps[index];
      if ((step?.choices?.length || step?.input) && !typing) return; // 選択肢・入力待ちはタップで進めない
      if (typing) {
        completeTypewriter();
        return;
      }
      // step.next（明示遷移先）優先。無ければ配列の次へ。末尾なら終了。
      if (step?.next != null && idToIndex.has(String(step.next))) {
        goTo(idToIndex.get(String(step.next)));
        return;
      }
      if (index >= steps.length - 1) {
        finish({ endedBy: "finished", choice: null, lastStepId: step?.id ?? null });
        return;
      }
      goTo(index + 1);
    }

    function onKey(e) {
      // 入力欄にフォーカス中は、スペースやEnterを会話送りに奪わせない（名前入力の妨げ防止。
      // Enterは入力欄自身のhandlerが決定として拾う）。
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
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
    // 暗転→徐々に明るく（SCENE1の会話開始前の演出。fadeInFromBlackで有効化）。
    if (options.fadeInFromBlack) els.root.classList.add("from-black");
    requestAnimationFrame(() => els.root.classList.add("is-open"));
    goTo(0);
  });
}

export function isEidosDialogueOpen() {
  return !!activeSession;
}

// 立ち絵の画像を差し替える。強い点滅を避けるため、同一要素の背景を差し替えるだけ（要素自体は
// 消えないので出入りのフラッシュが起きない）。明暗・拡大のトランジションはCSSが担当する。
function setPortraitImage(el, path) {
  if (!path) {
    el.style.backgroundImage = "";
    return;
  }
  const next = `url("${path}")`;
  if (el.style.backgroundImage === next) return;
  el.style.backgroundImage = next;
}

// 発話者/聞き手の明暗を切り替える。
function setSpeaking(el, speaking) {
  el.classList.toggle("is-speaking", speaking);
  el.classList.toggle("is-listening", !speaking);
}

// パネル一式のDOMを組む。root = 盤面ロック用オーバーレイ＋会話パネル。
function buildPanelDom() {
  const root = document.createElement("div");
  root.id = "eidos-dialogue-root";

  const blocker = document.createElement("div");
  blocker.id = "eidos-dialogue-blocker";
  blocker.addEventListener("click", (e) => e.stopPropagation());
  root.appendChild(blocker);

  const panel = document.createElement("div");
  panel.id = "eidos-dialogue-panel";

  const stage = document.createElement("div");
  stage.className = "eidos-dialogue-stage";
  const left = document.createElement("div");
  left.className = "eidos-dialogue-portrait eidos-dialogue-portrait-left";
  const right = document.createElement("div");
  right.className = "eidos-dialogue-portrait eidos-dialogue-portrait-right";
  const sept = document.createElement("div");
  sept.className = "eidos-dialogue-sept";
  stage.append(left, right, sept);

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
  hint.textContent = t("edu.hint");
  body.append(name, text, choices, hint);

  panel.append(stage, body);
  root.appendChild(panel);

  return { root, panel, stage, left, right, sept, name, text, choices, hint };
}
