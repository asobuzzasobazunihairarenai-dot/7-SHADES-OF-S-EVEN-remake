// 「直近で自分（このクライアント）が既に演出・通知済みのトークンid」を憶えておく、TTL付きの
// 小さなレジストリ。remote-move-animator.jsが「他人の操作かどうか」を判定するのに使う。
// online.jsとremote-move-animator.jsの両方から参照される（online.jsはBroadcastで届いた
// ゲート侵攻イベントのトークンidを、fetchAndHydrate()より前にここへ登録する必要があるため、
// remote-move-animator.js自体を経由すると循環importになる。依存の無いこの独立モジュールに
// 切り出すことで回避している）。

// 【#285・重要な使い方】印は **サーバーへ送る前** に付ける。
//   ○ markSelfHandled([id]); await moveToken(id, ...); await fetchAndHydrate(...);
//   × await moveToken(id, ...); markSelfHandled([id]); await fetchAndHydrate(...);
// 送信の応答を待っている間にサーバーからの通知で hydrate が走ることがあり、その時点で
// 印が無いと remote-move-animator.js が自分の操作を「他人の操作」と誤認して、古い形の
// 飛翔ゴーストを飛ばしてしまう（そのあと自分の演出も出るので二重に見える。ユーザー報告
// #285「オンラインで移動時に古い移動演出が出て、そのあと正規の移動演出が出た」）。
// 「送信が終われば印が付くから大丈夫」＝別の処理が直後に走ることを前提にした担保になって
// いて、その間に窓が開いていた。印にはTTLがあるので、送信が失敗しても数秒で消えるだけ＝
// 先に付けることによる実害は無い。
// 例外は「引くまでトークンidが分からない」ドロー系だけ（新しいidを hydrate 後に調べてから
// 付ける。main.js の findNewHandTokenIds 参照）。

let selfHandled = new Set();

export function markSelfHandled(tokenIds, ttlMs = 4000) {
  for (const id of tokenIds) {
    selfHandled.add(id);
    setTimeout(() => selfHandled.delete(id), ttlMs);
  }
}

export function isSelfHandled(id) {
  return selfHandled.has(id);
}
