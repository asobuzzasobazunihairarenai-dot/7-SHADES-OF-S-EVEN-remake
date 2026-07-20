// 「直近で自分（このクライアント）が既に演出・通知済みのトークンid」を憶えておく、TTL付きの
// 小さなレジストリ。remote-move-animator.jsが「他人の操作かどうか」を判定するのに使う。
// online.jsとremote-move-animator.jsの両方から参照される（online.jsはBroadcastで届いた
// ゲート侵攻イベントのトークンidを、fetchAndHydrate()より前にここへ登録する必要があるため、
// remote-move-animator.js自体を経由すると循環importになる。依存の無いこの独立モジュールに
// 切り出すことで回避している）。

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
