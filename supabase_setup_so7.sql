-- 7 SHADES OF S:EVEN オンライン対戦用スキーマ（第一弾・最小構成）
-- 既存の「7 SHADES OF S:EVEN 戦績管理システム」と同じSupabaseプロジェクトに相乗りするが、
-- テーブル名はso7_プレフィックスで完全に分離する（姉妹プロジェクトのsupabase_setup.sqlは
-- 一切変更しない）。
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
--
-- 事前準備: Supabaseダッシュボード > Authentication > Providers で
-- 「Email」のマジックリンク（OTP）ログインを有効化しておくこと。

create table if not exists so7_games (
  id text primary key,
  created_at timestamptz not null default now(),
  active_players jsonb not null default '[]'::jsonb, -- 例: ["A","C"]
  turn_player text,
  turn_number int,
  round_number int,
  start_player text,
  config jsonb not null default '{}'::jsonb, -- 例: {"includeBlackWhite": false}
  status text not null default 'open', -- 'open' | 'playing' | 'finished'
  version int not null default 0
);

create table if not exists so7_game_seats (
  game_id text not null references so7_games(id) on delete cascade,
  seat text not null, -- 'A' | 'B' | 'C' | 'D'
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (game_id, seat),
  unique (game_id, user_id)
);

-- カード・駒トークン（state.jsのtokens配列の1要素=1行に相当）。card_idは
-- 「隠すべき情報」の中心なので、生テーブルへの直接アクセスは一切許可しない
-- （下のso7_game_tokens_visibleビュー経由のみで読む）。
create table if not exists so7_game_tokens (
  game_id text not null references so7_games(id) on delete cascade,
  token_id text not null,
  kind text not null, -- 'card' | 'piece'
  card_id text, -- pieceの場合はnull
  face_up boolean not null default false,
  color text, -- pieceの色
  piece_player text, -- pieceの持ち主座席
  zone text not null, -- 'cell' | 'lock' | 'hand'
  row int,
  col int,
  side text,
  idx int,
  hand_player text, -- zone='hand'の時の座席
  order_index int not null default 0, -- 重なり順（tokens配列内の並び順に相当）
  primary key (game_id, token_id)
);
create index if not exists so7_game_tokens_game_id_idx on so7_game_tokens(game_id);

-- 各山の中身（state.jsのpilesに相当。cardsは末尾=一番上のcardId配列）。
create table if not exists so7_game_piles (
  game_id text not null references so7_games(id) on delete cascade,
  pile_name text not null, -- 'deck' | 'eternal' | 'first' | 'discard'
  cards jsonb not null default '[]'::jsonb,
  primary key (game_id, pile_name)
);

-- RLS有効化。so7_game_tokens/so7_game_pilesは生テーブルへのSELECT/INSERT/UPDATE/DELETEを
-- anon/authenticatedどちらにも一切許可しない（ポリシーを1つも作らない＝拒否がデフォルト）。
-- 読み書きはso7-apply-action Edge Function（サービスロールキー使用、RLSをバイパス）経由のみ。
alter table so7_games enable row level security;
alter table so7_game_seats enable row level security;
alter table so7_game_tokens enable row level security;
alter table so7_game_piles enable row level security;

-- so7_games・so7_game_seatsは秘密情報を含まないため、authenticatedに直接
-- SELECT/INSERTを許可する（部屋の作成・座席選択用）。
create policy "so7_games_select" on so7_games for select to authenticated using (true);
create policy "so7_games_insert" on so7_games for insert to authenticated with check (true);

create policy "so7_game_seats_select" on so7_game_seats for select to authenticated using (true);
create policy "so7_game_seats_insert" on so7_game_seats for insert to authenticated
  with check (user_id = auth.uid());

-- カードの中身(card_id)をマスクするビュー。
-- ビューはデフォルト(security_invoker指定なし=ビュー所有者権限で実行)のままにする。
-- security_invoker=trueにすると呼び出し元のRLS(＝生テーブルへの直接アクセス拒否)が
-- そのまま適用され、ビュー自体も弾かれてしまうため（Supabase SQL Editorで作成した
-- ビューの所有者はRLSをバイパスできる権限を持つロールになるので、この方式が成立する）。
-- auth.uid()はリクエストのJWTから読むだけの関数なので、ビューの実行権限には左右されない。
--
-- マスク条件は2つの独立したルール:
--   ・zone='hand': 持ち主(そのseatのuser_id)以外には常にcard_idを隠す(face_upは無視。
--     手札の表裏はローカル版main.jsの「自分がAかどうか」という前提のハードコードで、
--     実際のオンライン対戦では意味を持たないため)
--   ・zone in ('cell','lock'): face_upの値だけで判定(表向きなら誰でも見える共有情報)
create or replace view so7_game_tokens_visible as
select
  t.game_id,
  t.token_id,
  t.kind,
  case
    when t.zone = 'hand' then
      case when exists (
        select 1 from so7_game_seats s
        where s.game_id = t.game_id and s.seat = t.hand_player and s.user_id = auth.uid()
      ) then t.card_id else null end
    else
      case when t.face_up then t.card_id else null end
  end as card_id,
  t.face_up,
  t.color,
  t.piece_player,
  t.zone,
  t.row,
  t.col,
  t.side,
  t.idx,
  t.hand_player,
  t.order_index
from so7_game_tokens t
where exists (
  select 1 from so7_game_seats s where s.game_id = t.game_id and s.user_id = auth.uid()
);
grant select on so7_game_tokens_visible to authenticated;

-- 各山の中身をマスクするビュー。deck/eternal/firstは枚数のみ返し、discardは中身そのまま
-- （捨て場はルール通り「表向きに積む」場所のため、これは公開情報）。
create or replace view so7_game_piles_visible as
select
  p.game_id,
  p.pile_name,
  jsonb_array_length(p.cards) as card_count,
  case when p.pile_name = 'discard' then p.cards else null end as cards
from so7_game_piles p
where exists (
  select 1 from so7_game_seats s where s.game_id = p.game_id and s.user_id = auth.uid()
);
grant select on so7_game_piles_visible to authenticated;

-- アクション適用（so7-apply-action Edge Function）が使う、原子的な書き込み用RPC。
-- Edge Function側でゲームロジック(reduce相当)をTypeScriptで計算した「結果」を
-- ここに渡すだけにし、実際の書き込み（トークン全入れ替え・山の更新・games行の更新）は
-- 1つのトランザクション内で行う。p_expected_versionが現在のso7_games.versionと
-- 一致しない場合（＝この関数の呼び出しの間に誰か他の人の操作が先に反映されていた場合）は
-- エラーにする、という楽観的並行制御。同じゲーム行に対する呼び出しは"for update"で
-- 直列化される。
create or replace function so7_apply_and_commit(
  p_game_id text,
  p_expected_version int,
  p_games_patch jsonb,
  p_tokens jsonb,
  p_piles jsonb
) returns void
language plpgsql
security definer
as $$
declare
  v_current_version int;
begin
  select version into v_current_version from so7_games where id = p_game_id for update;
  if v_current_version is null then
    raise exception 'game_not_found';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'version_conflict';
  end if;

  delete from so7_game_tokens where game_id = p_game_id;
  insert into so7_game_tokens (
    game_id, token_id, kind, card_id, face_up, color, piece_player,
    zone, row, col, side, idx, hand_player, order_index
  )
  select
    p_game_id,
    t->>'token_id',
    t->>'kind',
    t->>'card_id',
    coalesce((t->>'face_up')::boolean, false),
    t->>'color',
    t->>'piece_player',
    t->>'zone',
    (t->>'row')::int,
    (t->>'col')::int,
    t->>'side',
    (t->>'idx')::int,
    t->>'hand_player',
    coalesce((t->>'order_index')::int, 0)
  from jsonb_array_elements(p_tokens) as t;

  delete from so7_game_piles where game_id = p_game_id;
  insert into so7_game_piles (game_id, pile_name, cards)
  select p_game_id, p->>'pile_name', p->'cards'
  from jsonb_array_elements(p_piles) as p;

  update so7_games set
    active_players = coalesce(p_games_patch->'active_players', active_players),
    turn_player = coalesce(p_games_patch->>'turn_player', turn_player),
    turn_number = coalesce((p_games_patch->>'turn_number')::int, turn_number),
    round_number = coalesce((p_games_patch->>'round_number')::int, round_number),
    start_player = coalesce(p_games_patch->>'start_player', start_player),
    status = coalesce(p_games_patch->>'status', status),
    version = version + 1
  where id = p_game_id;
end;
$$;

-- Realtime: so7_gamesは秘密情報を含まないため、任意でpostgres_changesに載せてよい
-- （手番・ラウンド数の即時反映用、必須ではない）。so7_game_tokens/so7_game_pilesは
-- 生テーブルへの直接SELECTを拒否しているため、postgres_changesを購読しても誰にも
-- 配信されない（RLSに従うため）。そちらはso7-apply-action Edge Functionからの
-- Broadcastメッセージ（"state_changed"の合図のみ、データ自体は載せない）で代替する。
alter publication supabase_realtime add table so7_games;

-- 追加機能: 部屋への参加時に座席(A/B/C/D)を選ばせず、「ゲームを開始する」ボタンを押した
-- 瞬間にso7-apply-action Edge Function側で参加者へランダムに座席を割り振るようにする。
-- 以前はseatがnot null・(game_id, seat)が主キーだったが、参加した時点ではまだ座席が
-- 決まらないため、seatをnull許容にし、主キーを(game_id, user_id)に変更する。
-- （game_id, seat）の一意性はseatが決まった後だけ効けばよいので、部分一意インデックスに
-- 置き換える。
alter table so7_game_seats drop constraint if exists so7_game_seats_pkey;
alter table so7_game_seats alter column seat drop not null;
alter table so7_game_seats add constraint so7_game_seats_pkey primary key (game_id, user_id);
create unique index if not exists so7_game_seats_seat_unique_idx
  on so7_game_seats (game_id, seat) where seat is not null;

-- 追加機能: プレイヤー名・アバター・駒スキンの選択を同期する。これらは隠すべき情報では
-- ないため、so7-apply-action Edge Functionを経由させず、joinRoom()と同じ「クライアントから
-- 直接テーブルへ書き込む」パターンを踏襲する。SELECTは既存のso7_game_seats_select
-- （using (true)、他人の行も読める）のままでよいが、UPDATEは今まで一切許可していなかった
-- ため、自分の行(user_id = auth.uid())に限定した新しいポリシーを追加する。
alter table so7_game_seats
  add column if not exists display_name text,
  add column if not exists avatar text,
  add column if not exists piece_skin_index int not null default 0;

create policy "so7_game_seats_update" on so7_game_seats for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 追加機能: 名前・アバター・駒スキンをユーザーごとに永続化する（ゲームをまたいで覚えておく）。
-- so7_game_seatsはゲームごとの行のため、新しいゲームに参加するたびに白紙に戻ってしまって
-- いた。user_idだけをキーにしたこのテーブルにも同時に書き込み（online.jsのupdateMyIdentity
-- 参照）、部屋に参加する瞬間(joinRoom)にここから読み出して初期値として使う。
create table if not exists so7_user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar text,
  piece_skin_index int not null default 0,
  updated_at timestamptz not null default now()
);
alter table so7_user_profiles enable row level security;
create policy "so7_user_profiles_select" on so7_user_profiles for select to authenticated
  using (user_id = auth.uid());
create policy "so7_user_profiles_insert" on so7_user_profiles for insert to authenticated
  with check (user_id = auth.uid());
create policy "so7_user_profiles_update" on so7_user_profiles for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 追加機能: 部屋名・パスワード・部屋一覧。部屋コードのコピペをやめ、部屋名を付けて一覧から
-- クリックで参加できるようにする（online.js/online-ui.js参照）。

-- 部屋名。既存のso7_games_selectがusing(true)のままなので、この列自体は特に秘匿する
-- 必要が無い（fetchAndHydrate()の既存select("*")がそのまま拾ってくれる）。
alter table so7_games add column if not exists name text not null default 'セブンの部屋';

-- パスワードのハッシュは、so7_gamesとは別の完全に独立したテーブルに置く。RLSは有効化する
-- が、authenticatedロールへのポリシーを一切付与しない（デフォルト拒否）。これにより
-- クライアント側のどんな実装ミス（select("*")等）があってもハッシュへは物理的に到達
-- できない。アクセスは全て下のSECURITY DEFINER関数経由のみに限定する。
create extension if not exists pgcrypto;
create table if not exists so7_game_passwords (
  game_id text primary key references so7_games(id) on delete cascade,
  password_hash text not null
);
alter table so7_game_passwords enable row level security;

-- 部屋の作成（部屋idの生成もSQL側で行い、クライアント入力を主キーとして信頼しない）。
create or replace function so7_create_room(room_name text default null, room_password text default null)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id text;
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
begin
  loop
    new_id := '';
    for i in 1..6 loop
      new_id := new_id || substr(alphabet, floor(random() * 36)::int + 1, 1);
    end loop;
    exit when not exists (select 1 from so7_games where id = new_id);
  end loop;

  -- 部屋名の文字数上限（クライアント側のmaxlengthと同じ20文字）。devtools/curlから直接
  -- 呼ばれた場合の保険として、サーバー側でも切り詰めておく。
  insert into so7_games (id, name) values (new_id, coalesce(nullif(left(trim(room_name), 20), ''), 'セブンの部屋'));
  if room_password is not null and room_password <> '' then
    insert into so7_game_passwords (game_id, password_hash) values (new_id, crypt(room_password, gen_salt('bf')));
  end if;
  return new_id;
end;
$$;
revoke execute on function so7_create_room(text, text) from public;
grant execute on function so7_create_room(text, text) to authenticated;

-- 部屋への参加。パスワード照合と座席行の作成をサーバー側で1つのSECURITY DEFINER関数に
-- まとめることで、クライアントがパスワードチェックを迂回してso7_game_seatsへ直接insert
-- してしまう経路を塞ぐ（当初案の穴。so7_game_seats_insertポリシー自体はuser_id=auth.uid()
-- のみのチェックで、パスワードの有無を関知できないため）。あわせて、既存のjoinRoom()が
-- クライアント側で行っていた「so7_user_profilesから前回の設定を読んで初期値にする」処理も
-- ここに統合する。
create or replace function so7_join_room(p_game_id text, p_password_attempt text default null)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  stored_hash text;
  profile record;
begin
  -- 既にこの部屋に自分の座席がある場合（対局中に誤って「この部屋を離れる」を押した後の
  -- 再参加や、ブラウザを閉じて放置した後に再度アクセスした場合等）は、パスワードの再照合も
  -- プロフィールの再コピーもせず、そのまま成功扱いにする——元の座席・色をそのまま引き継いで
  -- 途中から再開できるようにするため（so7_leave_room側で対局中は座席を削除しないように
  -- なったことと対になる変更）。
  if exists (select 1 from so7_game_seats where game_id = p_game_id and user_id = auth.uid()) then
    return;
  end if;

  select password_hash into stored_hash from so7_game_passwords where game_id = p_game_id;
  if stored_hash is not null then
    if p_password_attempt is null or crypt(p_password_attempt, stored_hash) <> stored_hash then
      raise exception 'invalid_password';
    end if;
  end if;

  select display_name, avatar, piece_skin_index into profile
  from so7_user_profiles where user_id = auth.uid();

  insert into so7_game_seats (game_id, user_id, display_name, avatar, piece_skin_index)
  values (p_game_id, auth.uid(), profile.display_name, profile.avatar, coalesce(profile.piece_skin_index, 0));
end;
$$;
revoke execute on function so7_join_room(text, text) from public;
grant execute on function so7_join_room(text, text) to authenticated;

-- 部屋一覧（開いている部屋のみ）。has_passwordは真偽値のみを公開し、ハッシュ自体は
-- 決して含めない。既存のso7_game_tokens_visible等と同じ「security_invokerを付けない」
-- パターンで、so7_game_passwords（authenticatedへのポリシー無し）をビュー所有者権限で
-- 参照できるようにする。
create view so7_games_list as
select
  g.id, g.name, g.status, g.created_at,
  (p.game_id is not null) as has_password,
  (select count(*) from so7_game_seats s where s.game_id = g.id) as member_count
from so7_games g
left join so7_game_passwords p on p.game_id = g.id
where g.status = 'open';
grant select on so7_games_list to authenticated;

-- 部屋名の改名。行レベルのRLS（参加者本人のみ）に加えて列レベルのGRANTでname列だけに
-- 更新可能範囲を絞る——RLSポリシーだけでは行全体が対象になってしまい、status/turn_player/
-- version等（本来so7-apply-action Edge Function経由でしか変更してはいけない列）まで誰でも
-- 書き換え可能になってしまう。RLSと列GRANTを両方満たさないと更新できない。
create policy "so7_games_update_name" on so7_games for update to authenticated
  using (exists (select 1 from so7_game_seats s where s.game_id = so7_games.id and s.user_id = auth.uid()))
  with check (exists (select 1 from so7_game_seats s where s.game_id = so7_games.id and s.user_id = auth.uid()));
grant update (name) on so7_games to authenticated;

-- 追加機能: 部屋を離れたら（明示的な「この部屋を離れる」、またはブラウザを閉じて放置）
-- 誰もいなくなった部屋を自動的に削除する。so7_game_seatsにso7_game_seats_delete相当の
-- ポリシーを新設する代わりに、座席の削除と「空になったら部屋ごと削除」を1つの
-- SECURITY DEFINER関数にまとめる——so7_create_room/so7_join_roomと同じ理由（自分の座席を
-- 削除した直後は「自分がこの部屋の参加者である」という条件のRLSがもう成立しなくなるため、
-- 通常のRLSポリシーだけでは「空になった部屋を削除する」権限を素直に表現しづらい）。
create or replace function so7_leave_room(p_game_id text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  game_status text;
begin
  select status into game_status from so7_games where id = p_game_id;
  -- 対局中（ロビー=open以外）の部屋では座席を削除しない。誤って「この部屋を離れる」を
  -- 押しても、同じアカウントで再度参加すれば元の座席・色のまま途中から再開できるように
  -- するため（＝ブラウザを閉じて放置した場合と同じ扱いに統一する）。座席の掃除は
  -- so7_cleanup_stale_rooms()の「対局中は全座席が24時間動きが無い場合のみ削除」という
  -- 既存ルールにそのまま任せる。ロビー（開始前）の部屋は今まで通り即座に座席を削除し、
  -- 誰もいなくなれば部屋ごと削除する。
  if game_status is not null and game_status <> 'open' then
    return;
  end if;
  delete from so7_game_seats where game_id = p_game_id and user_id = auth.uid();
  if not exists (select 1 from so7_game_seats where game_id = p_game_id) then
    delete from so7_games where id = p_game_id;
  end if;
end;
$$;
revoke execute on function so7_leave_room(text) from public;
grant execute on function so7_leave_room(text) to authenticated;

-- 「ブラウザを閉じて放置」を検知するため、参加中のクライアントが一定間隔で自分の座席の
-- last_seenを更新し続ける（online.jsのハートビート。ロビーでも対局中でも、部屋を離れる
-- まで止めない）。更新が一定時間途絶えた座席＝閉じられたまま放置されたとみなし、部屋一覧を
-- 開くたび（listOpenRooms()）に掃除する。定期実行cronジョブ等の追加インフラを必要としない
-- 「次に誰かが一覧を見た時に掃除される」方式（即座の削除ではない点に注意）。
-- ロビー（status='open'）と対局中（status<>'open'）でしきい値・掃除の粒度を変えている:
--   ・ロビー: 90秒。まだ誰も遊んでいないので、1人だけ抜けても他の待機者には実害が無いため、
--     個々の座席を単独で削除してよい。
--   ・対局中: 24時間。対局中は1人が一時的に接続が切れただけで他のプレイヤーを巻き込むわけには
--     いかないため、個々の座席は絶対に削除しない。「全員が同時に24時間以上応答が無い」＝
--     本当に全員が離脱したと判断できる場合だけ、対局（部屋）ごと削除する（長考・離席との
--     誤判定を避けるため、ロビーよりずっと長い猶予を取る）。
alter table so7_game_seats add column if not exists last_seen timestamptz not null default now();

create or replace function so7_cleanup_stale_rooms()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- ロビー: 個々の座席を掃除し、結果空になった部屋を削除する。
  delete from so7_game_seats s
  using so7_games g
  where s.game_id = g.id and g.status = 'open' and s.last_seen < now() - interval '90 seconds';

  delete from so7_games g
  where g.status = 'open' and not exists (select 1 from so7_game_seats s where s.game_id = g.id);

  -- 対局中: 個々の座席は触らず、全員のlast_seenが24時間以上更新されていない（＝座席が
  -- 無い、または全座席とも更新が無い）部屋だけ、まるごと削除する（座席・パスワード・
  -- カード・山札はso7_gamesへのon delete cascadeで一緒に消える）。
  delete from so7_games g
  where g.status <> 'open'
    and not exists (
      select 1 from so7_game_seats s
      where s.game_id = g.id and s.last_seen >= now() - interval '24 hours'
    );
end;
$$;
revoke execute on function so7_cleanup_stale_rooms() from public;
grant execute on function so7_cleanup_stale_rooms() to authenticated;

-- 追加機能: 部屋の改名は作成時（so7_create_room）のみとし、作成後は誰も変更できないように
-- する。以前追加した「参加者なら誰でも改名できる」ポリシー・列GRANTを取り消す
-- （UIを消すだけだとdevtools/curlから直接updateできてしまうため、サーバー側で構造的に
-- 不可能にする）。
drop policy if exists "so7_games_update_name" on so7_games;
revoke update (name) on so7_games from authenticated;

-- 追加機能: オプションの「基本設定」（ロックエリアバー表示・ロックエリア色表示・効果音の
-- 音量・アニメーション削減3項目・モーダル表示時間3項目）とショートカットキーも、
-- so7_user_profiles（名前・アバター・駒スキンと同じ、ユーザーごとに1行の永続プロフィール）
-- に含めてアカウントに紐づける。online.jsのloadMyPreferences()/saveMyPreference()参照。
alter table so7_user_profiles
  add column if not exists lock_area_bar_visible boolean not null default true,
  add column if not exists lock_color_visible boolean not null default true,
  add column if not exists sound_volume numeric not null default 0.8,
  add column if not exists flight_animation_disabled boolean not null default false,
  add column if not exists arrival_effect_disabled boolean not null default false,
  add column if not exists continuous_glow_disabled boolean not null default false,
  add column if not exists gate_invasion_modal_duration numeric not null default 3.5,
  add column if not exists card_arrival_modal_duration numeric not null default 5,
  add column if not exists hand_pickup_toast_duration numeric not null default 5,
  add column if not exists shortcuts jsonb not null default '{}'::jsonb;

-- 追加機能: ターンタイマー（ロープ・砂時計・優先権）のオンライン同期。隠す必要の無い
-- 公開情報（誰の優先権か・残り砂時計数は全員に見えるべき情報）のため、so7-apply-action
-- Edge Functionを経由させず、updateMyIdentity()と同じ「クライアントから直接テーブルへ
-- 書き込む」パターンを踏襲する（src/online.jsのupdatePriorityState参照）。
alter table so7_games
  add column if not exists priority_player text,
  add column if not exists priority_deadline bigint,
  add column if not exists priority_phase text,
  add column if not exists hourglass_stock jsonb not null default '{}'::jsonb;

-- priority_player/priority_deadline/priority_phaseは最後に書いた人が勝つ素朴な上書きで
-- よい（優先権譲渡ボタン自体が「誰でも押せる自己申告制」のため）。so7_games_update_name
-- （改名機能、後に取り消し済み）と同じ「行レベルRLS（参加者本人）＋列レベルGRANT」の
-- 組み合わせ——RLSポリシーだけでは行全体が対象になってしまい、status/turn_player/version等
-- （本来so7-apply-action Edge Function経由でしか変更してはいけない列）まで誰でも
-- 書き換え可能になってしまうため、列GRANTで更新可能範囲をこの3列だけに絞る。
create policy "so7_games_update_priority" on so7_games for update to authenticated
  using (exists (select 1 from so7_game_seats s where s.game_id = so7_games.id and s.user_id = auth.uid()))
  with check (exists (select 1 from so7_game_seats s where s.game_id = so7_games.id and s.user_id = auth.uid()));
grant update (priority_player, priority_deadline, priority_phase) on so7_games to authenticated;

-- hourglass_stockは座席ごとの差分マージが必要（他座席の値を巻き込んで上書きしないため）。
-- PostgRESTのUPDATEはSQL式（col = col || $delta）を送れないため専用のSECURITY DEFINER
-- 関数にし、hourglass_stock列自体への直接GRANTは行わない（この関数経由でしか変更できない
-- ようにし、誤った全置換の経路をDBの権限レベルで塞ぐ）。1つのUPDATE文の中で
-- hourglass_stock || p_deltaを評価するため、Postgresの行ロックにより複数クライアントからの
-- 同時マージも安全（読み取ってから書き込むのではなく、1文で完結するため競合状態が生じない）。
create or replace function so7_merge_hourglass_stock(p_game_id text, p_delta jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (select 1 from so7_game_seats where game_id = p_game_id and user_id = auth.uid()) then
    raise exception 'not_seated';
  end if;
  update so7_games set hourglass_stock = coalesce(hourglass_stock, '{}'::jsonb) || p_delta where id = p_game_id;
end;
$$;
revoke execute on function so7_merge_hourglass_stock(text, jsonb) from public;
grant execute on function so7_merge_hourglass_stock(text, jsonb) to authenticated;

-- ターンタイマー設定（基本時間・延長時間・初期/最大砂時計数・補充ターン数・有効/無効）を
-- 対局全体で共通の値に固定する（プレイヤーごとに異なると不公平になるため）。
-- includeBlackWhiteと同じく、BOOTSTRAP_GAME実行時に部屋作成者（開始ボタンを押した本人）の
-- その時点のローカル設定を1回だけ書き込み、以後は対局中変更しない。これは既存の
-- so7_apply_and_commit（BOOTSTRAP_GAME自身が経由する通常のゲーム操作パイプライン）の
-- gamesPatchに乗せるため、SET句に1行追加するだけでよい（so7-apply-action.ts参照）。
alter table so7_games add column if not exists timer_config jsonb;

create or replace function so7_apply_and_commit(
  p_game_id text,
  p_expected_version int,
  p_games_patch jsonb,
  p_tokens jsonb,
  p_piles jsonb
) returns void
language plpgsql
security definer
as $$
declare
  v_current_version int;
begin
  select version into v_current_version from so7_games where id = p_game_id for update;
  if v_current_version is null then
    raise exception 'game_not_found';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'version_conflict';
  end if;

  delete from so7_game_tokens where game_id = p_game_id;
  insert into so7_game_tokens (
    game_id, token_id, kind, card_id, face_up, color, piece_player,
    zone, row, col, side, idx, hand_player, order_index
  )
  select
    p_game_id,
    t->>'token_id',
    t->>'kind',
    t->>'card_id',
    coalesce((t->>'face_up')::boolean, false),
    t->>'color',
    t->>'piece_player',
    t->>'zone',
    (t->>'row')::int,
    (t->>'col')::int,
    t->>'side',
    (t->>'idx')::int,
    t->>'hand_player',
    coalesce((t->>'order_index')::int, 0)
  from jsonb_array_elements(p_tokens) as t;

  delete from so7_game_piles where game_id = p_game_id;
  insert into so7_game_piles (game_id, pile_name, cards)
  select p_game_id, p->>'pile_name', p->'cards'
  from jsonb_array_elements(p_piles) as p;

  update so7_games set
    active_players = coalesce(p_games_patch->'active_players', active_players),
    turn_player = coalesce(p_games_patch->>'turn_player', turn_player),
    turn_number = coalesce((p_games_patch->>'turn_number')::int, turn_number),
    round_number = coalesce((p_games_patch->>'round_number')::int, round_number),
    start_player = coalesce(p_games_patch->>'start_player', start_player),
    status = coalesce(p_games_patch->>'status', status),
    timer_config = coalesce(p_games_patch->'timer_config', timer_config),
    version = version + 1
  where id = p_game_id;
end;
$$;
