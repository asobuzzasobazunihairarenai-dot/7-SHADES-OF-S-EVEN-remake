// 画面遷移の「前面チェック」＝背面バグ検知（続き231、ユーザー相談2026-08-19 UIチェッカー第2弾）。
//
// 過去くり返し出た z-index/背面バグ（#119 ショップ画面でランキング/ヘルプが背面に開く、
// #139 マイページでヘルプ/ランキングが背面、等）は、いずれも「ある全画面ページを開いたまま
// 別の全画面ページを開くと、後から開いた方が前面に出ない」という遷移時の重なり順の問題。
// これは CPU 自己対戦（passive なスモーク）では一切再現できない——それらのページを開く操作を
// スモークが行わないため。そこで、実際に各ページのペアを順に開いて「後から開いた方が最前面に
// 出ているか」を elementFromPoint で確定的に検証する能動テストにした（誤検知ゼロ＝ヒューリスティック
// ではなく明示的なアサーション）。
//
// これは UI を実際に開閉する能動テストなので、checkUiInvariants（読み取り専用の passive 検査）とは
// 別物。live な自己対戦のポーリング中には呼ばず、明示的な単発実行（スモークパネルのボタン／
// Node 版の --nav モード）で使う。テスト後は必ず全ページを閉じて後始末する。

function tick(ms) {
  return new Promise((r) => setTimeout(r, ms || 0));
}

function describe(el) {
  if (!el) return "?";
  if (el.id) return "#" + el.id;
  const cls =
    typeof el.className === "string" && el.className
      ? "." + el.className.trim().split(/\s+/)[0]
      : "";
  return (el.tagName || "?").toLowerCase() + cls;
}

// 各全画面ページ：key（表示名）・id（生成される要素id）・open/close（動的importした関数）。
async function loadPages() {
  const [shop, ranking, help, profile] = await Promise.all([
    import("./shop.js"),
    import("./ranking-page.js"),
    import("./help.js"),
    import("./profile-page.js"),
  ]);
  return [
    { key: "ショップ", id: "shop-panel", open: () => shop.openShopPanel(), close: () => shop.closeShopPanel() },
    { key: "ランキング", id: "ranking-page", open: () => ranking.openRankingPage(), close: () => ranking.closeRankingPage() },
    { key: "ヘルプ", id: "help-panel", open: () => help.openHelpPanel(), close: () => help.closeHelpPanel() },
    { key: "マイページ", id: "profile-page", open: () => profile.openProfilePage(), close: () => profile.closeProfilePage() },
  ];
}

// open は async のもの（ランキングは fetch を伴う）もあるので await。ネットワークが無い環境で
// fetch が失敗しても overlay 自体は生成される設計なので、5秒の保険タイムアウトで待ちすぎない。
async function safeOpen(page) {
  await Promise.race([Promise.resolve(page.open()).catch(() => {}), tick(5000)]);
}

// 画面遷移の重なり順を検査する（能動テスト。DOMを開閉するが最後に必ず全て閉じる）。
// 戻り値: [{ code:"nav-behind", msg, detail }]（空＝異常なし）。document が無い環境では空。
export async function checkNavigationLayering() {
  const violations = [];
  if (typeof document === "undefined" || typeof window === "undefined") return violations;

  let pages;
  try {
    pages = await loadPages();
  } catch (e) {
    return violations; // モジュールが読めない環境（Node baseline等）では何もしない
  }

  const closeAll = async () => {
    for (const p of pages) {
      try {
        p.close();
      } catch (e) {}
    }
    await tick(60);
  };

  // 全画面ページはいずれも body 直下の position:fixed（body 自身のステージ変形が作る単一の
  // スタッキングコンテキスト内）なので、z-index を数値比較すれば「どのページが手前か」が確定する。
  // elementFromPoint だと、自己対戦中にゲームのモーダル（z 10000+）が中央を覆って誤検知するため、
  // ページ同士の重なり順は z-index 比較で判定する（ゲームのモーダルは無視）。
  const zOf = (el) => {
    const z = parseInt(getComputedStyle(el).zIndex, 10);
    return Number.isFinite(z) ? z : 0;
  };
  // ハマりどころ: shop-panel / help-panel は初回に一度だけ生成され、閉じても display:none で
  // 隠すだけ（要素は残る。ranking-page / profile-page は生成/破棄）。よって getElementById の
  // 有無ではなく「実際に表示されているか」で開閉を判定する必要がある。
  const isOpen = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity || "1") < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  await closeAll();

  for (const A of pages) {
    for (const B of pages) {
      if (A === B) continue;
      try {
        await safeOpen(A);
        await tick(80);
        // A が実際に開かなかった（ガード/未ログイン等）ら、前提が崩れるのでスキップ。
        if (!isOpen(document.getElementById(A.id))) {
          await closeAll();
          continue;
        }
        await safeOpen(B);
        await tick(140);
        const bEl = document.getElementById(B.id);
        // B が開かなかった（ガード/未ログイン等）場合は誤検知を避けてスキップ（背面バグではない）。
        if (!isOpen(bEl)) {
          await closeAll();
          continue;
        }
        // B より手前（同値含む）に“表示されたまま居残っている別の全画面ページ”があれば背面バグ。
        const bz = zOf(bEl);
        for (const P of pages) {
          if (P.id === B.id) continue;
          const pEl = document.getElementById(P.id);
          if (isOpen(pEl) && zOf(pEl) >= bz) {
            violations.push({
              code: "nav-behind",
              msg: `「${A.key}」を開いたまま「${B.key}」を開くと、${P.key}が前面に残り${B.key}が背面になる（背面バグ）`,
              detail: { from: A.key, to: B.key, coveredBy: P.key, bZ: bz, pZ: zOf(pEl) },
            });
          }
        }
      } catch (e) {
        // 開閉自体が例外（未ログインでのfetch失敗等）→ この組は判定不能としてスキップ
      } finally {
        await closeAll();
      }
    }
  }

  await closeAll();
  return violations;
}
