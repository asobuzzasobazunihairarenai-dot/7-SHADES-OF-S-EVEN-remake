// フレンド機能のUI（2026-09-04、ユーザー要望「一度何らかで対戦した時に、○○にフレンド
// 申請しますか？的な感じにするのはどうかな？」）。
//
// 申請の導線は2つだけ:
//   ① 対戦終了パネルの中の一行（post-game-panel.js が buildPostGameFriendRow を使う）
//   ② マイページの「👥 フレンド」→ モーダル内の「最近対戦した人」
// どちらも「一度オンラインで対戦した相手」にしか出ない。名前で検索する導線は用意しない
// （知らない人から申請が飛んでこないようにするため。ユーザーと合意した方針）。
//
// ゲスト（匿名ログイン）は対象外。アカウントが残らず次に会えないため、申請ボタン自体を出さない。
// 断られたことは相手にも自分にも見せない（サーバー側の so7_get_friends が declined を返さない）。

import {
  fetchFriends,
  fetchRecentOpponents,
  requestFriend,
  respondFriend,
  removeFriend,
  getCachedUser,
} from "./online.js";
import { createModalCloseX, createBackdrop } from "./ui-helpers.js";
import { t } from "./ui-text.js";

function canUseFriends() {
  const user = getCachedUser();
  return !!user && !user.is_anonymous;
}

function makeButton(label, className, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// 相手1人ぶんの行（アバターの丸・名前・オンラインの点・成績・右側のボタン群）。
function buildPersonRow({ name, avatarUrl, online, record }, actions) {
  const row = document.createElement("div");
  row.className = "friend-row";

  const av = document.createElement("div");
  av.className = "friend-row-avatar";
  if (avatarUrl) av.style.backgroundImage = 'url("' + avatarUrl + '")';
  row.appendChild(av);

  const info = document.createElement("div");
  info.className = "friend-row-info";
  const nameEl = document.createElement("div");
  nameEl.className = "friend-row-name";
  nameEl.textContent = name || t("fr.noName");
  info.appendChild(nameEl);
  const sub = document.createElement("div");
  sub.className = "friend-row-sub";
  const parts = [];
  if (online !== undefined) parts.push(online ? t("fr.online") : t("fr.offline"));
  if (record) parts.push(record);
  sub.textContent = parts.join(" ・ ");
  if (online) sub.classList.add("is-online");
  info.appendChild(sub);
  row.appendChild(info);

  const btns = document.createElement("div");
  btns.className = "friend-row-actions";
  for (const b of actions) btns.appendChild(b);
  row.appendChild(btns);
  return row;
}

function sectionHeading(text) {
  const h = document.createElement("div");
  h.className = "friend-section-heading";
  h.textContent = text;
  return h;
}

function emptyNote(text) {
  const p = document.createElement("div");
  p.className = "friend-empty-note";
  p.textContent = text;
  return p;
}

async function renderFriendsBody(container) {
  container.innerHTML = "";
  const heading = document.createElement("div");
  heading.className = "friend-modal-title";
  heading.textContent = t("fr.title");
  container.appendChild(heading);

  if (!canUseFriends()) {
    const user = getCachedUser();
    container.appendChild(emptyNote(user ? t("fr.guestNote") : t("fr.needLogin")));
    return;
  }

  const status = emptyNote(t("fr.loading"));
  container.appendChild(status);

  const [friends, recent] = await Promise.all([fetchFriends(), fetchRecentOpponents()]);
  status.remove();

  const recordByUser = new Map();
  for (const o of recent) recordByUser.set(o.userId, t("fr.record", { n: o.matches, w: o.wins }));

  const reload = () => renderFriendsBody(container).catch((err) => console.error("renderFriendsBody failed", err));

  // ① 届いている申請（相手からの pending）— 一番上に置く。
  const incoming = friends.filter((f) => f.direction === "incoming");
  if (incoming.length > 0) {
    container.appendChild(sectionHeading(t("fr.incoming")));
    for (const f of incoming) {
      container.appendChild(
        buildPersonRow(
          { name: f.name, avatarUrl: f.avatar, online: f.online, record: recordByUser.get(f.userId) },
          [
            makeButton(t("fr.accept"), "friend-btn is-primary", async (e) => {
              e.currentTarget.disabled = true;
              await respondFriend(f.userId, true);
              reload();
            }),
            makeButton(t("fr.decline"), "friend-btn", async (e) => {
              e.currentTarget.disabled = true;
              await respondFriend(f.userId, false);
              reload();
            }),
          ]
        )
      );
    }
  }

  // ② 成立しているフレンド。オンラインの人を上に出す。
  const mutual = friends
    .filter((f) => f.direction === "mutual")
    .sort((a, b) => Number(b.online) - Number(a.online));
  container.appendChild(sectionHeading(t("fr.mutual")));
  if (mutual.length === 0) {
    container.appendChild(emptyNote(t("fr.none")));
  } else {
    for (const f of mutual) {
      container.appendChild(
        buildPersonRow({ name: f.name, avatarUrl: f.avatar, online: f.online, record: recordByUser.get(f.userId) }, [
          makeButton(t("fr.remove"), "friend-btn", async (e) => {
            if (!window.confirm(t("fr.removeConfirm", { name: f.name || t("fr.noName") }))) return;
            e.currentTarget.disabled = true;
            await removeFriend(f.userId);
            reload();
          }),
        ])
      );
    }
  }

  // ③ 自分が出した申請（返事待ち）。相手が断ったものはサーバー側で除かれているので出ない。
  const outgoing = friends.filter((f) => f.direction === "outgoing");
  if (outgoing.length > 0) {
    container.appendChild(sectionHeading(t("fr.outgoing")));
    for (const f of outgoing) {
      container.appendChild(
        buildPersonRow({ name: f.name, avatarUrl: f.avatar, online: f.online }, [
          makeButton(t("fr.remove"), "friend-btn", async (e) => {
            e.currentTarget.disabled = true;
            await removeFriend(f.userId);
            reload();
          }),
        ])
      );
    }
  }

  // ④ 最近対戦した人（まだフレンドでも申請中でもない相手だけ）。ここから申請できる。
  const known = new Set(friends.map((f) => f.userId));
  const candidates = recent.filter((o) => !known.has(o.userId));
  container.appendChild(sectionHeading(t("fr.recent")));
  if (candidates.length === 0) {
    container.appendChild(emptyNote(recent.length === 0 ? t("fr.noneRecent") : ""));
  } else {
    for (const o of candidates) {
      container.appendChild(
        buildPersonRow(
          { name: o.name, avatarUrl: o.avatarUrl, record: t("fr.record", { n: o.matches, w: o.wins }) },
          [
            makeButton(t("fr.add"), "friend-btn is-primary", async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              const r = await requestFriend(o.userId);
              btn.textContent = r ? t("fr.requested") : t("fr.failed");
            }),
          ]
        )
      );
    }
  }
}

export function openFriendsModal() {
  if (document.getElementById("friends-modal")) return;
  const backdrop = createBackdrop(() => close(), { dim: true, zIndex: 10700 });
  const modal = document.createElement("div");
  modal.id = "friends-modal";
  modal.appendChild(createModalCloseX(() => close()));
  const body = document.createElement("div");
  body.className = "friends-modal-body";
  modal.appendChild(body);
  function close() {
    modal.remove();
    backdrop.remove();
  }
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  renderFriendsBody(body).catch((err) => console.error("renderFriendsBody failed", err));
}

// マイページに置く「👥 フレンド（n）」ボタン。押す前に「届いている申請がある」ことが
// 分かるよう、成立数を出しつつ、受信申請があればボタン自体を目立たせる。
export function buildFriendsButton() {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "my-page-friends-btn";
  btn.textContent = t("fr.button");
  btn.addEventListener("click", () => openFriendsModal());
  if (canUseFriends()) {
    fetchFriends()
      .then((list) => {
        const n = list.filter((f) => f.direction === "mutual").length;
        const incoming = list.filter((f) => f.direction === "incoming").length;
        btn.textContent = t("fr.buttonCount", { n });
        if (incoming > 0) btn.classList.add("has-incoming");
      })
      .catch(() => {});
  }
  return btn;
}

// 対戦終了パネルの中に出す「一緒に遊んだ人：〇〇　＋フレンド申請」の一行。
// opponents: [{ userId, name }]（ゲスト・自分は呼び出し側で除いておく）。
// まだフレンドでも申請中でもない相手が1人もいなければ null を返す（＝行を出さない）。
export async function buildPostGameFriendRow(opponents) {
  if (!canUseFriends()) return null;
  const list = (opponents ?? []).filter((o) => o && o.userId);
  if (list.length === 0) return null;
  let known = new Set();
  try {
    known = new Set((await fetchFriends()).map((f) => f.userId));
  } catch {
    /* 取れなくても申請ボタンは出す（押した時にサーバー側で二重申請は弾かれる） */
  }
  const targets = list.filter((o) => !known.has(o.userId));
  if (targets.length === 0) return null;

  const row = document.createElement("div");
  row.className = "post-game-friend-row";
  const label = document.createElement("span");
  label.className = "post-game-friend-label";
  label.textContent = t("fr.postGame") + "：";
  row.appendChild(label);
  for (const o of targets) {
    const chip = document.createElement("span");
    chip.className = "post-game-friend-chip";
    const nameEl = document.createElement("span");
    nameEl.textContent = o.name || t("fr.noName");
    chip.appendChild(nameEl);
    chip.appendChild(
      makeButton(t("fr.add"), "friend-btn is-primary is-small", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        const r = await requestFriend(o.userId);
        btn.textContent = r === "pending" ? t("fr.requested") : r ? t("fr.already") : t("fr.failed");
      })
    );
    row.appendChild(chip);
  }
  return row;
}
