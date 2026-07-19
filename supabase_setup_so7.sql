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
