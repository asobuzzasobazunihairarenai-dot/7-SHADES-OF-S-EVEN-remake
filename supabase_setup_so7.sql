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

  insert into so7_games (id, name) values (new_id, coalesce(nullif(trim(room_name), ''), 'セブンの部屋'));
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
