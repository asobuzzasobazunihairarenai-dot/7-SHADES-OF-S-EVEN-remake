// online.jsが「直近のアクションは誰が(actorSeat)・何を(actionType)行った結果か」を
// 一時的に憶えておく、1件だけのシンプルなスロット。turn-timer.jsのonStateChangeが
// オンライン中に「本当に優先権保持者本人の操作でロープをリセットすべきか」を判定するのに
// 使う。self-handled-tokens.jsと同じ理由（online.js⇄turn-timer.jsの循環import回避）で
// 独立モジュールに切り出してある。

let lastActionInfo = null;

export function setLastActionInfo(info) {
  lastActionInfo = info;
}

// 1回読んだら消費済みとしてクリアする（次の無関係なhydrateに古い情報が誤って
// 適用されないように）。
export function consumeLastActionInfo() {
  const info = lastActionInfo;
  lastActionInfo = null;
  return info;
}
