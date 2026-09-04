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
  zone text not null, -- 'cell' | 'lock' | 'hand' | 'publicDraw'
  row int,
  col int,
  side text,
  idx int,
  hand_player text, -- zone='hand'|'publicDraw'の時の座席
  reveal_source text, -- zone='publicDraw'の時のみ意味を持つ: 'manual'（手札からドラッグで
                       -- 手動配置）| 'draw'（公開ドローボタンで山から引いた）
  order_index int not null default 0, -- 重なり順（tokens配列内の並び順に相当）
  primary key (game_id, token_id)
);
create index if not exists so7_game_tokens_game_id_idx on so7_game_tokens(game_id);
-- 手札公開エリア機能の追加時、既存のso7_game_tokensテーブルには無い列のため後から追加。
-- 新規にこのSQL全体を実行する環境では上のcreate table側で既に存在するため実質no-op。
alter table so7_game_tokens add column if not exists reveal_source text;
-- マイデッキ戦F5「裏面の印」。so7_game_tokens_visibleビュー（下で t.my_deck_owner を参照）が
-- 使うため、必ずそのビュー定義より前でこの列を追加しておく（初回実行でビュー作成が失敗しないよう）。
alter table so7_game_tokens add column if not exists my_deck_owner text;

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
-- create policyはcreate tableと違いif not existsが無いため、このSQL全体を再実行しても
-- 安全なように、必ずdrop policy if existsを直前に置いてから作り直す。
drop policy if exists "so7_games_select" on so7_games;
create policy "so7_games_select" on so7_games for select to authenticated using (true);
drop policy if exists "so7_games_insert" on so7_games;
create policy "so7_games_insert" on so7_games for insert to authenticated with check (true);

drop policy if exists "so7_game_seats_select" on so7_game_seats;
create policy "so7_game_seats_select" on so7_game_seats for select to authenticated using (true);
drop policy if exists "so7_game_seats_insert" on so7_game_seats;
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
--
-- 続き65: 「ERROR: 42P16: cannot drop columns from view」の修正。以前はここに
-- create or replace viewの最初の定義（reveal_sourceまでの列）を置き、後方
-- （このファイルの最後の方）でarrival_suppressedを追加した再定義を置いていた。
-- create or replace functionと違い、create or replace viewは「今まさにDBに存在する
-- ビューより列が少ない」定義を許さない（列を減らす＝dropとみなされエラーになる）ため、
-- 既にarrival_suppressedまで反映済みのDBに対してファイル全体を再実行すると、
-- このファイル前半にある「reveal_sourceまでしかない」古い定義が先に実行されて
-- エラーになっていた（ユーザー報告で発覚）。create or replace functionのような
-- 「後の定義だけが有効、前の定義は無害な上書き」という前提が views には
-- 通用しないため、以後は同じビューを複数回再定義せず、実際の定義（reveal_source・
-- arrival_suppressedを含む最新の列一式）はこのファイル末尾の1箇所にまとめてある。
--
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
    zone, row, col, side, idx, hand_player, reveal_source, order_index
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
    t->>'reveal_source',
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
-- alter publication ... add tableにはif not exists相当の構文が無いため、既にpublicationの
-- メンバーかどうかをpg_publication_tablesで確認してから追加する（このSQL全体の再実行を
-- 安全にするため）。
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'so7_games'
  ) then
    alter publication supabase_realtime add table so7_games;
  end if;
end $$;

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

drop policy if exists "so7_game_seats_update" on so7_game_seats;
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
drop policy if exists "so7_user_profiles_select" on so7_user_profiles;
create policy "so7_user_profiles_select" on so7_user_profiles for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "so7_user_profiles_insert" on so7_user_profiles;
create policy "so7_user_profiles_insert" on so7_user_profiles for insert to authenticated
  with check (user_id = auth.uid());
drop policy if exists "so7_user_profiles_update" on so7_user_profiles;
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
-- 引数を1つ増やした（p_ranked＝合言葉フレンドランク戦）ため、既存の2引数版を先にdropしてから
-- 作り直す。両方残すと so7_create_room(text,text) 呼び出しがどちらのオーバーロードにも当たり
-- ambiguous になるため（p_rankedにデフォルトがある）。再実行安全（存在しなければ何もしない）。
drop function if exists so7_create_room(text, text);
create or replace function so7_create_room(room_name text default null, room_password text default null, p_ranked boolean default false)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  new_id text;
  alphabet text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  base_name text;
  final_name text;
  suffix text;
  n int;
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
  base_name := coalesce(nullif(left(trim(room_name), 20), ''), 'セブンの部屋');

  -- ユーザー要望「すでに同名の部屋が存在する場合は自動で末尾に-2などの数字がつくように
  -- したい」への対応。既存の（掃除しきれていない過去の部屋も含む）so7_games.nameと
  -- 完全一致する間は、-2, -3, ...と末尾に付けて空くまで試す。20文字上限に収まるよう、
  -- 付番する場合はその分だけ元の名前を切り詰める。
  final_name := base_name;
  n := 1;
  while exists (select 1 from so7_games where name = final_name) loop
    n := n + 1;
    suffix := '-' || n;
    final_name := left(base_name, greatest(1, 20 - length(suffix))) || suffix;
  end loop;

  -- p_ranked＝合言葉フレンドランク戦（結果がレートに反映される私的なランク戦）。is_ranked を
  -- 立てておくと、クライアント側で自動処理が強制ON（#159のrender末尾ガード）になり、
  -- so7_ranked_report_result（is_rankedゲートあり）が対局終了時にレートを反映する。
  -- so7_games_list は not is_ranked で公開ロビーから除外するため、ランク部屋は一覧に出ない
  -- （＝部屋コードを相手に共有して参加する私的な部屋になる）。
  insert into so7_games (id, name, is_ranked) values (new_id, final_name, coalesce(p_ranked, false));
  if room_password is not null and room_password <> '' then
    insert into so7_game_passwords (game_id, password_hash) values (new_id, crypt(room_password, gen_salt('bf')));
  end if;
  return new_id;
end;
$$;
revoke execute on function so7_create_room(text, text, boolean) from public;
grant execute on function so7_create_room(text, text, boolean) to authenticated;

-- ペット選択（駒に追従する飾りペット）も座席ロスターで同期し、相手の画面にも反映する。
-- ユーザー報告「オンラインで自分以外のペットがみんなひよこ／相手がペットを変えても私の画面
-- では変わらない」の原因は、この列がDBに無く同期できていなかったこと（クライアントは
-- 列が無い環境向けにpet_index無しで取り直すフォールバックを持つが、その場合ペットは同期
-- されない）。未設定はnull（＝相手には既定の「なし/非表示」扱い）。piece_skin_indexと違い
-- 0はひよこを意味するため、not null default 0にすると全員ひよこに見えてしまう。よってnullable。
-- この関数(so7_join_room)がpet_indexを参照するため、関数定義より前に列を用意しておく。
alter table so7_game_seats add column if not exists pet_index int;
alter table so7_user_profiles add column if not exists pet_index int;

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

  select display_name, avatar, piece_skin_index, pet_index into profile
  from so7_user_profiles where user_id = auth.uid();

  insert into so7_game_seats (game_id, user_id, display_name, avatar, piece_skin_index, pet_index)
  values (p_game_id, auth.uid(), profile.display_name, profile.avatar, coalesce(profile.piece_skin_index, 0), profile.pet_index);
end;
$$;
revoke execute on function so7_join_room(text, text) from public;
grant execute on function so7_join_room(text, text) to authenticated;

-- 部屋一覧（開いている部屋のみ）。has_passwordは真偽値のみを公開し、ハッシュ自体は
-- 決して含めない。既存のso7_game_tokens_visible等と同じ「security_invokerを付けない」
-- パターンで、so7_game_passwords（authenticatedへのポリシー無し）をビュー所有者権限で
-- 参照できるようにする。
create or replace view so7_games_list as
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
drop policy if exists "so7_games_update_name" on so7_games;
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
-- 引数が増えた（p_force追加）ため旧 (text) は drop してから (text, boolean default) を作る
-- （1引数呼び出しがambiguousにならないように）。既存の leaveGame() の1引数RPC呼び出しは
-- p_force のデフォルト(false)で従来通り動く。
drop function if exists so7_leave_room(text);
create or replace function so7_leave_room(p_game_id text, p_force boolean default false)
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
  -- ただし p_force=true（スモークテストの後始末等）の時は、対局中でも座席を削除する
  -- （＝進行中の対局リストに残り続けないよう強制的に抜ける）。
  if not p_force and game_status is not null and game_status <> 'open' then
    return;
  end if;
  delete from so7_game_seats where game_id = p_game_id and user_id = auth.uid();
  if not exists (select 1 from so7_game_seats where game_id = p_game_id) then
    delete from so7_games where id = p_game_id;
  end if;
end;
$$;
revoke execute on function so7_leave_room(text, boolean) from public;
grant execute on function so7_leave_room(text, boolean) to authenticated;

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

  -- 対局中: 個々の座席は触らず、全員のlast_seenが一定時間以上更新されていない（＝座席が
  -- 無い、または全座席とも更新が無い）部屋だけ、まるごと削除する（座席・パスワード・
  -- カード・山札はso7_gamesへのon delete cascadeで一緒に消える）。
  -- ユーザー要望2026-08-14「全員が途中退出したら部屋を消す」。猶予を24時間→30分に短縮。
  -- 30分は、スマホの画面ロック/バックグラウンドでハートビート(setInterval, 25秒間隔)が
  -- 止まる・電波瞬断などの一時的な離席で誤って消さないための余裕（「ちょっと席外し」は耐え、
  -- 本当に放棄された部屋だけ消える）。※万一この削除中に裏に回していたクライアントが戻った
  -- 場合は、online.js側のガード（対局が消えていたら「この対局は終了しました」でタイトルへ）が拾う。
  delete from so7_games g
  where g.status <> 'open'
    and not exists (
      select 1 from so7_game_seats s
      where s.game_id = g.id and s.last_seen >= now() - interval '30 minutes'
    );
end;
$$;

-- ユーザー要望「ゲーム終了時に『もう一度遊ぶ』ボタンを追加。一緒に遊んだメンバー全員が
-- 『もう一度遊ぶ』を押すか、部屋から抜ける（ブラウザを閉じる）のどちらかを終えた時点で
-- ゲームが再開する」への対応。「まだこの部屋にいる（last_seenが新しい）のに、まだ
-- 押していない」座席が1つも無くなった時点で、誰かのクライアントがstartGame()
-- （＝BOOTSTRAP_GAMEの再実行、そのタイミングでso7_game_seatsに残っている座席だけで
-- 座席を割り振り直す仕組みが既にある）を呼ぶ。src/online.jsのcheckRematchReadiness/
-- setRematchReady参照。BOOTSTRAP_GAME実行時にso-apply-action.ts側でfalseへ戻すため、
-- 次の対局でまた素の状態から使える。
alter table so7_game_seats add column if not exists rematch_ready boolean not null default false;
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
  add column if not exists shortcuts jsonb not null default '{}'::jsonb,
  -- 「ロック前・手札使用前の確認モーダル」を表示するか（action-confirm-prefs.js）。
  -- 既定は表示する(true)。モーダルの「今後表示しない」やオプションの基本設定から切り替え、
  -- アカウントに紐づけて別端末でも共有する。
  add column if not exists action_confirm_enabled boolean not null default true;

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
drop policy if exists "so7_games_update_priority" on so7_games;
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

-- 最後のロック承認（ユーザー要望「勝利になる最後のロックは他プレイヤー全員の承認が必要」）。
-- 隠す必要の無い公開情報（誰が最後のロックを試みているか・誰の承認待ちか）のため、
-- 優先権(priority_player等)と違って専用の直接書き込み経路は不要——通常のso7_apply_and_commit
-- （REQUEST_FINAL_LOCK/RESPOND_FINAL_LOCKもso7-apply-action.ts経由のこのパイプラインに乗る）
-- のSET句に1行追加するだけでよい。timer_configと同じパターンで、so7-apply-action.ts側は
-- REQUEST_FINAL_LOCK/RESPOND_FINAL_LOCKの時だけこのキーをgamesPatchに含める（保留が
-- 解消された時はnullを明示的に含める）。それ以外のアクションではキー自体を含めないため、
-- coalesce()が正しく「現在値を維持」する。
alter table so7_games add column if not exists pending_final_lock jsonb;

-- 接触の承認待ち（ユーザー要望「接触を無効にする効果のカードが存在するので、接触される
-- プレイヤーには承認/拒否モーダルを出す」）。pending_final_lockと全く同じパターン
-- （REQUEST_CONTACT/RESPOND_CONTACTの時だけso7-apply-action.ts側がgamesPatchにこのキーを
-- 含める。保留が解消された時はnullを明示的に含める）。
alter table so7_games add column if not exists pending_contact jsonb;

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
    zone, row, col, side, idx, hand_player, reveal_source, order_index
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
    t->>'reveal_source',
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
    pending_final_lock = coalesce(p_games_patch->'pending_final_lock', pending_final_lock),
    pending_contact = coalesce(p_games_patch->'pending_contact', pending_contact),
    version = version + 1
  where id = p_game_id;
end;
$$;

-- 追加機能: プレイマット・カード裏面・背景画像の選択も、名前/アバター/駒スキンや基本設定と
-- 同じso7_user_profiles（ユーザーごとに1行の永続プロフィール）に含めてアカウントに紐づける
-- （ユーザー要望「まだアカウントに紐づいていないので紐づけてほしい」）。これらは他プレイヤーの
-- 画面には反映されない自分だけの見た目設定（card-back-skins.js冒頭のコメント参照）のため、
-- so7_game_seats側への書き込みは不要——online.jsのloadMyPreferences()/saveMyPreference()と
-- 同じ経路にそのまま乗せるだけでよい。
alter table so7_user_profiles
  add column if not exists playmat_id text,
  add column if not exists card_back_set_index int not null default 0,
  add column if not exists background_id text;

-- 追加機能: オプション「基本設定」にオープニングBGMの音量スライダーを追加した
-- （options-menu.jsのbuildBgmVolumeRow()参照）。既存のsound_volume（効果音マスター音量）と
-- 同じ列レベルの仕組みで、0〜100のパーセント値をそのまま保存する。
alter table so7_user_profiles
  add column if not exists sound_volume_opening_bgm numeric not null default 80;

-- 追加機能: アップロードしたアバター画像を、アバター選択一覧に自分専用の選択肢として
-- 出し続けられるようにする（ユーザー要望「アバター画像をアップロードしたらアバター変更
-- 時に一覧に出るようにしてほしい。もちろん他のプレイヤーの一覧には出ない」）。
-- so7_user_profilesは既にuser_id=auth.uid()のみが読み書きできるRLSになっているため、
-- この列も自然に「本人にしか見えない」設定になる（他プレイヤーの一覧には出ない、という
-- 要望をこの列単体で満たせる）。実際に選んだ現在のアバター（avatar列、他プレイヤーにも
-- 見える）とは別に、アップロードした画像そのもののURLだけをここに保存しておき、
-- 一覧を開くたびに読み出して選択肢の1つとして出す（src/online.jsのuploadAvatarImage/
-- fetchMyCustomAvatarUrl参照）。
alter table so7_user_profiles
  add column if not exists custom_avatar_url text;

-- 追加機能: ゲーム内通貨（ユーザー要望「対局終了毎に一定額稼げる仮想通貨を実装し、駒
-- スキンやアバター、カード裏面、プレイマット背景を購入できるようにしたい。将来的には
-- 課金も検討」）。
--
-- 残高(so7_user_currency)はso7_game_passwordsと同じ「RLSは有効化するが、authenticated
-- ロールへのUPDATE/INSERTポリシーを一切付与しない（デフォルト拒否）」パターンにする。
-- SELECTだけ本人に許可し、増減は必ず下のSECURITY DEFINER関数（so7_award_match_currency/
-- so7_purchase_item）経由に限定する——so7_user_profilesの他の列のように直接update()を
-- 許可すると、クライアントから残高を好きな値に書き換えられてしまうため（見た目の設定
-- （名前・アバター等）と違い、通貨は不正操作を防ぐ必要がある）。
create table if not exists so7_user_currency (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance int not null default 0,
  updated_at timestamptz not null default now()
);
alter table so7_user_currency enable row level security;
drop policy if exists "so7_user_currency_select" on so7_user_currency;
create policy "so7_user_currency_select" on so7_user_currency for select to authenticated
  using (user_id = auth.uid());

-- 購入済みの駒スキン/カード裏面/プレイマット/背景等（item_keyで種類を問わず一意に識別、
-- 例: "piece-skin:3"・"playmat:red-aged"）。残高と同じ理由で直接のINSERT/DELETEは許可せず、
-- so7_purchase_item経由のみとする。
create table if not exists so7_user_unlocks (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, item_key)
);
alter table so7_user_unlocks enable row level security;
drop policy if exists "so7_user_unlocks_select" on so7_user_unlocks;
create policy "so7_user_unlocks_select" on so7_user_unlocks for select to authenticated
  using (user_id = auth.uid());

-- 対局が終了した瞬間（勝利判定、victory.jsのcheckForVictory()）に呼ばれ、その対局の
-- 参加者全員（so7_game_seatsのuser_id）へ一定額を付与する。オンライン対戦は複数の
-- クライアント（勝者自身・傍観者それぞれ）がほぼ同時にcheckForVictory()で勝利を検知
-- するため、同じgame_idに対して複数回呼ばれる前提で設計する必要がある——so7_gamesに
-- 追加したcurrency_awardedフラグで「1ゲーム1回」だけに制限し、既に付与済みなら
-- 何もせず正常終了する（エラーにはしない。呼び出し側が結果を気にせず気軽に呼べるように
-- するため）。
-- ユーザー確認済み「対局終了毎に一定額」に加えて「勝利時にボーナス」も併用する。
-- p_winner_seat（'A'|'B'|'C'|'D'、victory.jsが検知した実際の勝者の座席、
-- so7_game_seats.seatと同じ表記）が渡されていれば、その座席のuser_idにだけ
-- p_winner_bonusを上乗せする。
-- ユーザー要望「対戦終了時にお金がもらえる演出を追加したい」への対応で、戻り値を
-- voidからint（呼び出し元=auth.uid()自身が実際に受け取った額、対象外/既に付与済みなら
-- 0）に変更した。複数クライアントがほぼ同時に呼んでも、実際にこの関数を実行して
-- currency_awardedを立てた1クライアントだけが自分の本当の受取額を得る（先に他の
-- クライアントが付与済みだった場合は0が返るため、演出を出さないよう呼び出し側
-- （currency-display.jsのshowCurrencyAwardEffect）で判定する）。
alter table so7_games add column if not exists currency_awarded boolean not null default false;

drop function if exists so7_award_match_currency(text, int);
drop function if exists so7_award_match_currency(text, int, text, int);
create or replace function so7_award_match_currency(
  p_game_id text,
  p_amount int default 50,
  p_winner_seat text default null,
  p_winner_bonus int default 30
)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_already boolean;
  r record;
  v_grant int;
  v_my_grant int := 0;
begin
  select currency_awarded into v_already from so7_games where id = p_game_id for update;
  if v_already is null then
    raise exception 'game_not_found';
  end if;
  if v_already then
    return 0;
  end if;

  for r in select user_id, seat from so7_game_seats where game_id = p_game_id loop
    v_grant := p_amount + case when r.seat = p_winner_seat then p_winner_bonus else 0 end;
    insert into so7_user_currency (user_id, balance, updated_at)
    values (r.user_id, v_grant, now())
    on conflict (user_id) do update
      set balance = so7_user_currency.balance + v_grant, updated_at = now();
    if r.user_id = auth.uid() then
      v_my_grant := v_grant;
    end if;
  end loop;

  -- 対局が終わったので status を 'finished' にする（currency_awardedと同じ「1ゲーム1回」の
  -- タイミング）。これで終了した対局が getMyActiveGames()（status<>'open'）の「再接続で続けられる
  -- 対局」一覧に残り続けず、掃除を待たずに消える（#77の副次対応。BOOTSTRAP側のstatus='playing'と対）。
  update so7_games set currency_awarded = true, status = 'finished' where id = p_game_id;
  return v_my_grant;
end;
$$;
revoke execute on function so7_award_match_currency(text, int, text, int) from public;
grant execute on function so7_award_match_currency(text, int, text, int) to authenticated;

-- ユーザー確認済み「ログインボーナス（日次）」。1日1回、ログイン中に呼ぶと一定額もらえる
-- （online.jsのclaimDailyLoginBonus参照、ログイン直後に自動で呼ぶ）。既に本日分を
-- 受け取り済みなら何もせず0を返す（エラーにはしない）。
alter table so7_user_currency add column if not exists last_daily_bonus_date date;

create or replace function so7_claim_daily_login_bonus(p_amount int default 20)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_last date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select last_daily_bonus_date into v_last from so7_user_currency where user_id = v_uid for update;
  if v_last is not null and v_last = current_date then
    return 0;
  end if;
  insert into so7_user_currency (user_id, balance, last_daily_bonus_date, updated_at)
  values (v_uid, p_amount, current_date, now())
  on conflict (user_id) do update
    set balance = so7_user_currency.balance + p_amount,
        last_daily_bonus_date = current_date,
        updated_at = now();
  return p_amount;
end;
$$;
revoke execute on function so7_claim_daily_login_bonus(int) from public;
grant execute on function so7_claim_daily_login_bonus(int) to authenticated;

-- ユーザー要望「CPU戦（1人用）で勝利したらお金ももらえるようにしてあげたい」。
-- ユーザー確定方針: 勝つたびに毎回20コイン（1日の上限なし）。オンライン対戦の
-- so7_award_match_currencyと違い、game_id（実際のオンライン対局）が無いローカルCPU戦
-- 専用のため、本人（auth.uid()）の残高にそのまま加算するだけの独立関数にする。
-- クライアント側(online.js awardCpuWinCurrency → victory.js)は「人間が勝った時」だけ
-- 呼ぶ（CPUが勝った時は呼ばない）。未ログインならそもそもclientが無く呼ばれない。
create or replace function so7_award_cpu_win(p_amount int default 20)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  insert into so7_user_currency (user_id, balance, updated_at)
  values (v_uid, p_amount, now())
  on conflict (user_id) do update
    set balance = so7_user_currency.balance + p_amount,
        updated_at = now();
  return p_amount;
end;
$$;
revoke execute on function so7_award_cpu_win(int) from public;
grant execute on function so7_award_cpu_win(int) to authenticated;

-- 購入。呼び出し元(auth.uid())自身の残高から差し引き、所持済みリストへ追加する。
-- 残高不足・購入済みの場合は例外を投げるだけで、残高・所持リストとも一切変更しない
-- （呼び出し側main.js/shop.jsがtry/catchでエラー内容に応じたメッセージを出す想定）。
create or replace function so7_purchase_item(p_item_key text, p_cost int)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_balance int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if exists (select 1 from so7_user_unlocks where user_id = v_uid and item_key = p_item_key) then
    raise exception 'already_owned';
  end if;
  select balance into v_balance from so7_user_currency where user_id = v_uid for update;
  if v_balance is null then
    v_balance := 0;
  end if;
  if v_balance < p_cost then
    raise exception 'insufficient_balance';
  end if;

  insert into so7_user_currency (user_id, balance, updated_at)
  values (v_uid, -p_cost, now())
  on conflict (user_id) do update
    set balance = so7_user_currency.balance - p_cost, updated_at = now();
  insert into so7_user_unlocks (user_id, item_key) values (v_uid, p_item_key);
end;
$$;
revoke execute on function so7_purchase_item(text, int) from public;
grant execute on function so7_purchase_item(text, int) to authenticated;

-- ユーザー要望「管理者モードで自分の通貨を自由に増やせるように」（テスト用）。
-- 誰でも実行できてしまっては通貨の不正取得になるため、開発者本人のGoogleアカウント
-- （auth.jwt()->>'email'）だけに制限する。クライアント側(online.jsのisAdminUser)の
-- チェックはUI表示の出し分けだけで、本当の制限はここ（サーバー側）で行っている——
-- 他のユーザーがこの関数を直接呼んでも'not_authorized'で拒否される。
-- ★重要: このメールアドレスが実際の管理者アカウントと一致しているか確認すること。
create or replace function so7_admin_grant_currency(p_amount int)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_balance int;
begin
  if v_uid is null or (v_email is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and v_email is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  insert into so7_user_currency (user_id, balance, updated_at)
  values (v_uid, p_amount, now())
  on conflict (user_id) do update
    set balance = so7_user_currency.balance + p_amount, updated_at = now()
  returning balance into v_balance;
  return v_balance;
end;
$$;
revoke execute on function so7_admin_grant_currency(int) from public;
grant execute on function so7_admin_grant_currency(int) to authenticated;

-- ユーザー要望「サイトの利用状況（ログイン数・訪問数・誰がログイン中か）がわかるように
-- したい」。個々の訪問記録・最終ログイン日時は誰でも見られる情報にしたくないため、
-- 生テーブルへのSELECTは一切許可しない（RLS有効化のみ、ポリシー無し＝so7_game_passwordsと
-- 同じ「原則拒否」）。開発者本人だけが呼べるso7_get_admin_stats()経由の集計値だけを返す。
create table if not exists so7_visit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null
);
alter table so7_visit_log enable row level security;
drop policy if exists "so7_visit_log_insert" on so7_visit_log;
create policy "so7_visit_log_insert" on so7_visit_log for insert to anon, authenticated
  with check (true);

-- 「今ログイン中かどうか」の判定用に、最終アクセス日時をso7_user_profilesへ追加する
-- （online.jsのtouchPresence、ログイン直後・数分おきに呼ばれる）。
alter table so7_user_profiles add column if not exists last_seen_at timestamptz;

-- ユーザー要望「『オープニングBGMの音量』ではなくて『BGM』でよい。BGM全体の音量を
-- 調整できるように」。options-menu.jsのBGMマスター音量スライダーを保存する列。
-- ハマりどころ（online.jsのコメント参照、以前sound_volume_opening_bgmで同じ問題が
-- 発生済み）: この列が存在しない間にonline.jsのloadMyPreferences()のSELECT文へ
-- 追加すると、1つの列が無いだけでSELECT文全体がエラーになり、他の設定（ロックエリア
-- 表示・効果音音量・モーダル表示時間等）まで丸ごと読み込めなくなる。そのため、この
-- SQLを実行し終えるまではonline.js側は意図的にSELECT文へ追加していない
-- （保存(saveMyPreference)はこの列がある前提で先に有効化してある。保存自体は
-- 1設定ごとの独立したUPDATEのため、列が無ければその保存だけ失敗するが他の設定には
-- 影響しない）。
alter table so7_user_profiles add column if not exists sound_volume_bgm numeric;

-- ユーザー要望「オプションの基本設定はすべてアカウントに紐づけるようにしてください」への
-- 対応。2D表示切り替え（タブレット点滅対策）とカード効果の自動処理ON/OFFも、他の基本設定
-- （効果音量・アニメーション設定等）と同じくアカウントへ保存するようにする。
alter table so7_user_profiles add column if not exists flatten_2d_mode boolean;
alter table so7_user_profiles add column if not exists card_auto_processing_enabled boolean;

-- ユーザー要望「相手の基本時間のカウントダウンを表示/非表示できるようにしてほしい」
-- （src/motion-prefs.jsのopponentBaseTimerVisible、src/options-menu.jsの基本設定）。
-- デフォルトは非表示（列がnullの間はクライアント側のfalseデフォルトのまま）。
alter table so7_user_profiles add column if not exists opponent_base_timer_visible boolean;

-- ユーザー報告2026-08-17「PCで物語チュートリアルを最後までやったのにスマホだと最初から（同じ
-- アカウント）」。従来この進捗はlocalStorage（端末ローカル）にしか無かったため端末間で共有され
-- なかった。intro_seen/tutorial_completed/eidos_easy_cleared等のフラグをjsonbでアカウントに保存し、
-- eidos-story.jsのstartEidosStoryが起動時にfetchMyEidosProgressで取得してローカルへマージする。
alter table so7_user_profiles add column if not exists eidos_progress jsonb;

-- ユーザー方針（2026-07-30）「ゲスト（匿名ログイン）はプレイヤーとして戦績登録しない・
-- 戦績上は『ゲスト（名前）』表示」。ログイン種別（匿名か否か）を各ユーザーのプロフィールに
-- 記録し、戦績連携（online.jsのfetchGuestUserIds/submitStatsMatchResult）が参照する。
alter table so7_user_profiles add column if not exists is_guest boolean not null default false;

create or replace function so7_touch_presence()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update so7_user_profiles set last_seen_at = now() where user_id = auth.uid();
end;
$$;
revoke execute on function so7_touch_presence() from public;
grant execute on function so7_touch_presence() to authenticated;

-- 管理者専用（開発者のGoogleアカウントのみ）。総ユーザー数・総訪問数・本日の訪問数・
-- 直近5分以内にlast_seen_atが更新された「ログイン中」ユーザーの表示名一覧をまとめて返す。
-- ★重要: このメールアドレスが実際の管理者アカウントと一致しているか確認すること。
create or replace function so7_get_admin_stats()
returns json
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_email text := auth.jwt() ->> 'email';
  v_result json;
begin
  if (v_email is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and v_email is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  select json_build_object(
    'totalUsers', (select count(*) from so7_user_profiles),
    'totalVisits', (select count(*) from so7_visit_log),
    'visitsToday', (select count(*) from so7_visit_log where created_at >= current_date),
    'onlineUsers', (
      select coalesce(json_agg(json_build_object(
        'displayName', coalesce(display_name, '(未設定)'),
        'lastSeenAt', last_seen_at
      ) order by last_seen_at desc), '[]'::json)
      from so7_user_profiles
      where last_seen_at >= now() - interval '5 minutes'
    )
  ) into v_result;
  return v_result;
end;
$$;
revoke execute on function so7_get_admin_stats() from public;
grant execute on function so7_get_admin_stats() to authenticated;

-- ユーザー要望「登録ユーザーのユーザー名とアドレスを一覧したい。ログイン履歴も
-- さかのぼれるようにしたい」への対応。管理者専用（開発者のGoogleアカウントのみ、
-- so7_get_admin_stats等と同じauth.jwt()チェック）。auth.usersはSECURITY DEFINERの
-- 内部でのみ参照でき、クライアントから直接SELECTすることはできない。
-- ★重要: このメールアドレスが実際の管理者アカウントと一致しているか確認すること。
create or replace function so7_get_admin_user_list()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    select u.id, u.email, p.display_name, u.created_at, p.last_seen_at
    from auth.users u
    left join so7_user_profiles p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;
revoke execute on function so7_get_admin_user_list() from public;
grant execute on function so7_get_admin_user_list() to authenticated;

-- ログイン履歴（実体はso7_visit_log、ページを開くたびの訪問記録）を新しい順に
-- ページングしながら遡れるようにする。p_offsetを増やしながら呼び出す想定。
create or replace function so7_get_admin_visit_log(p_limit int default 200, p_offset int default 0)
returns table (
  created_at timestamptz,
  user_id uuid,
  email text,
  display_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    select v.created_at, v.user_id, u.email, p.display_name
    from so7_visit_log v
    left join auth.users u on u.id = v.user_id
    left join so7_user_profiles p on p.user_id = v.user_id
    order by v.created_at desc
    limit p_limit offset p_offset;
end;
$$;
revoke execute on function so7_get_admin_visit_log(int, int) from public;
grant execute on function so7_get_admin_visit_log(int, int) to authenticated;

-- 追加機能（続き60）: 試練の儀式・マスチェンジ等「到達効果を得ない」移動を、駒トークン
-- 自身に付けたarrival_suppressedフラグで表す。remote-move-animator.js（他プレイヤーの
-- 操作を差分検知して到達を再現する仕組み）が、これを見て誤って到達を再現しないように
-- するための目印（隠すべき情報ではない＝手札のcard_idのような機密性は無いので、
-- 下のso7_game_tokens_visibleビューでもマスクせずそのまま公開する）。
alter table so7_game_tokens add column if not exists arrival_suppressed boolean not null default false;

-- so7_game_tokens_visibleの再定義（列の追加は末尾にしか置けない制約は既存コメント通り）。
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
  t.order_index,
  t.reveal_source,
  t.arrival_suppressed,
  -- マイデッキ戦の「所有者の印」。隠す情報ではない（全員がその札を所有者の裏面で見るため）
  -- のでマスクせず公開する。card_idは従来通り上のcaseでマスクされる。
  t.my_deck_owner
from so7_game_tokens t
where exists (
  select 1 from so7_game_seats s where s.game_id = t.game_id and s.user_id = auth.uid()
);
grant select on so7_game_tokens_visible to authenticated;

-- so7_apply_and_commitの再定義（arrival_suppressedをinsert列に追加しただけで、
-- それ以外は直前の定義と同じ）。
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
    zone, row, col, side, idx, hand_player, reveal_source, arrival_suppressed, my_deck_owner, order_index
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
    t->>'reveal_source',
    coalesce((t->>'arrival_suppressed')::boolean, false),
    t->>'my_deck_owner',
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
    pending_final_lock = coalesce(p_games_patch->'pending_final_lock', pending_final_lock),
    pending_contact = coalesce(p_games_patch->'pending_contact', pending_contact),
    version = version + 1
  where id = p_game_id;
end;
$$;

-- 追加機能（続き63）: 管理者ダッシュボードで「取得に失敗しました: structure of query
-- does not match function result type」というエラーが発生していた不具合の修正。
-- auth.usersのemail列は実際にはcharacter varying(255)型だが、以前の定義では
-- returns table(email text)に対してu.emailをそのまま（キャスト無し）で返しており、
-- PL/pgSQLのRETURN QUERYが要求する型の完全一致に違反していた（varcharとtextは
-- 通常のSELECTでは区別なく扱えるが、RETURN QUERYの行タイプ照合ではこの違いが
-- エラーになる）。u.email::textと明示キャストするだけで直る。
create or replace function so7_get_admin_user_list()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    select u.id, u.email::text, p.display_name, u.created_at, p.last_seen_at
    from auth.users u
    left join so7_user_profiles p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;
revoke execute on function so7_get_admin_user_list() from public;
grant execute on function so7_get_admin_user_list() to authenticated;

create or replace function so7_get_admin_visit_log(p_limit int default 200, p_offset int default 0)
returns table (
  created_at timestamptz,
  user_id uuid,
  email text,
  display_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    select v.created_at, v.user_id, u.email::text, p.display_name
    from so7_visit_log v
    left join auth.users u on u.id = v.user_id
    left join so7_user_profiles p on p.user_id = v.user_id
    order by v.created_at desc
    limit p_limit offset p_offset;
end;
$$;
revoke execute on function so7_get_admin_visit_log(int, int) from public;
grant execute on function so7_get_admin_visit_log(int, int) to authenticated;

-- 追加機能（続き64）: 「タイマーをオン、オフ」ボタン（ユーザー要望「押すと参加プレイヤー
-- 全員に承認拒否モーダルが出る。拒否が3回連続したらそのプレイヤーはこの対局中この
-- ボタンを押せなくなる」）。pending_final_lock/pending_contactと同じ「保留→queueの
-- 先頭から順に承認、誰か1人でも却下すればnullに戻す」パターンをもう1つ追加する。
-- timer_toggle_reject_streakは座席ごとの連続却下回数（jsonb、例: {"A": 2, "B": 0}）で、
-- 誰が何回連続で却下されたかは隠す必要の無い公開情報のためマスク無しでそのまま持つ。
alter table so7_games add column if not exists pending_timer_toggle jsonb;
alter table so7_games add column if not exists timer_toggle_reject_streak jsonb not null default '{}'::jsonb;

-- so7_apply_and_commitの再定義（pending_timer_toggle/timer_toggle_reject_streakを
-- insert対象の列に追加しただけで、それ以外は直前の定義と同じ）。
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
    zone, row, col, side, idx, hand_player, reveal_source, arrival_suppressed, my_deck_owner, order_index
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
    t->>'reveal_source',
    coalesce((t->>'arrival_suppressed')::boolean, false),
    t->>'my_deck_owner',
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
    pending_final_lock = coalesce(p_games_patch->'pending_final_lock', pending_final_lock),
    pending_contact = coalesce(p_games_patch->'pending_contact', pending_contact),
    pending_timer_toggle = coalesce(p_games_patch->'pending_timer_toggle', pending_timer_toggle),
    timer_toggle_reject_streak = coalesce(p_games_patch->'timer_toggle_reject_streak', timer_toggle_reject_streak),
    version = version + 1
  where id = p_game_id;
end;
$$;

-- 追加機能（続き66）: 「カード効果の自動処理」モードのオン/オフも、タイマーオン/オフと
-- 同じ「参加プレイヤー全員の承認」制にする（ユーザー要望「1人だけ自動処理モードとかだと
-- 変な挙動になっちゃいそうなので全員が同じモードの方が良い」）。実際の有効値
-- （isAutoProcessingEnabled）自体はtimer_configと違いサーバー側の同期カラムを持たず
-- 各クライアントが個別に持つ設定のため、ここではpending_auto_processing_toggle
-- （承認待ちキューの進行管理）だけを追加する。
alter table so7_games add column if not exists pending_auto_processing_toggle jsonb;

-- so7_apply_and_commitの再定義（pending_auto_processing_toggleをinsert対象の列に
-- 追加しただけで、それ以外は直前の定義と同じ）。
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
    zone, row, col, side, idx, hand_player, reveal_source, arrival_suppressed, my_deck_owner, order_index
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
    t->>'reveal_source',
    coalesce((t->>'arrival_suppressed')::boolean, false),
    t->>'my_deck_owner',
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
    pending_final_lock = coalesce(p_games_patch->'pending_final_lock', pending_final_lock),
    pending_contact = coalesce(p_games_patch->'pending_contact', pending_contact),
    pending_timer_toggle = coalesce(p_games_patch->'pending_timer_toggle', pending_timer_toggle),
    timer_toggle_reject_streak = coalesce(p_games_patch->'timer_toggle_reject_streak', timer_toggle_reject_streak),
    pending_auto_processing_toggle = coalesce(p_games_patch->'pending_auto_processing_toggle', pending_auto_processing_toggle),
    -- マイデッキ戦フラグ（BOOTSTRAP_GAME時にだけ patch に含まれる。boolean列なので ->> して ::boolean）。
    my_deck_mode = coalesce((p_games_patch->>'my_deck_mode')::boolean, my_deck_mode),
    version = version + 1
  where id = p_game_id;
end;
$$;

-- ユーザー要望（続き95）「対戦終了時、負けた方にもお金獲得演出モーダルを出したい」への
-- 対応。so7_award_match_currencyは元々「1ゲーム1回だけ実際に残高を付与する」設計で、
-- 2回目以降の呼び出し（同じゲームに対して他クライアントが先に付与済みだった場合）は
-- 単純に0を返していた。オンライン対戦は勝者・敗者それぞれのクライアントがほぼ同時に
-- checkForVictory()経由でこの関数を呼ぶため、実際には全員へ正しく残高が付与されていても
-- 「先に実行が完了した1クライアントだけ」が非ゼロの戻り値を得て演出モーダルを表示でき、
-- もう一方（多くの場合、勝利判定からの一連の処理が長い勝者側が先に完了しやすく、
-- 結果的に敗者側が0を受け取って演出が出ない）は演出無しのままになっていた。
-- 修正: 既に付与済み(v_already=true)の場合でも、残高は二重に増やさず、呼び出し元
-- (auth.uid())自身が「本来いくら受け取ったか」を決定的に計算して返すようにした
-- （p_amount・p_winner_bonusはランダム要素が無いため、後から計算しても一致する）。
-- これにより、呼び出し順に関わらず勝者・敗者の両方のクライアントが自分の受取額を
-- 正しく受け取り、victory.js側の`if (amount > 0) showCurrencyAwardModal(amount)`が
-- 両方の画面で正しく発火するようになる。関数シグネチャ（引数・戻り値の型）は
-- 変えていないため、online.js側の呼び出しコードの変更は不要。
create or replace function so7_award_match_currency(
  p_game_id text,
  p_amount int default 50,
  p_winner_seat text default null,
  p_winner_bonus int default 30
)
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_already boolean;
  r record;
  v_grant int;
  v_my_grant int := 0;
  v_my_seat text;
begin
  select currency_awarded into v_already from so7_games where id = p_game_id for update;
  if v_already is null then
    raise exception 'game_not_found';
  end if;

  select seat into v_my_seat from so7_game_seats where game_id = p_game_id and user_id = auth.uid();

  if v_already then
    -- 既に他クライアントが付与済み。残高はもう変更せず、演出表示のためだけに
    -- 「本来いくら受け取ったか」を計算して返す。
    if v_my_seat is null then
      return 0;
    end if;
    return p_amount + case when v_my_seat = p_winner_seat then p_winner_bonus else 0 end;
  end if;

  for r in select user_id, seat from so7_game_seats where game_id = p_game_id loop
    v_grant := p_amount + case when r.seat = p_winner_seat then p_winner_bonus else 0 end;
    insert into so7_user_currency (user_id, balance, updated_at)
    values (r.user_id, v_grant, now())
    on conflict (user_id) do update
      set balance = so7_user_currency.balance + v_grant, updated_at = now();
    if r.user_id = auth.uid() then
      v_my_grant := v_grant;
    end if;
  end loop;

  -- 対局が終わったので status を 'finished' にする（currency_awardedと同じ「1ゲーム1回」の
  -- タイミング）。これで終了した対局が getMyActiveGames()（status<>'open'）の「再接続で続けられる
  -- 対局」一覧に残り続けず、掃除を待たずに消える（#77の副次対応。BOOTSTRAP側のstatus='playing'と対）。
  update so7_games set currency_awarded = true, status = 'finished' where id = p_game_id;
  return v_my_grant;
end;
$$;

-- 追加機能: アプリ内「不具合報告」（ユーザー要望）。オプションから誰でもコメントを送れ、
-- その時点のアクションログ・コンソールログ・状況（バージョン/UA/部屋ID等）を自動で添付する。
-- 生ログは管理者だけが読めるようにし（RLSでSELECTは誰にも開けず、so7_get_admin_bug_reports
-- 経由の管理者だけが見られる）、INSERTは認証済みユーザーなら誰でも可（自分のuser_idで）。
create table if not exists so7_bug_reports (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  comment text not null,
  action_log text,
  console_log text,
  context jsonb,
  resolved boolean not null default false
);
alter table so7_bug_reports enable row level security;
-- SELECTポリシーは作らない（誰も直接は読めない。管理者は下のSECURITY DEFINER関数経由で読む）。
drop policy if exists "so7_bug_reports_insert" on so7_bug_reports;
create policy "so7_bug_reports_insert" on so7_bug_reports for insert to authenticated
  with check (user_id = auth.uid() or user_id is null);

-- 管理者（メール一致）だけが不具合報告の一覧を読める。so7_get_admin_visit_log等と同じ方式。
create or replace function so7_get_admin_bug_reports()
returns table (
  id bigint,
  created_at timestamptz,
  email text,
  display_name text,
  comment text,
  action_log text,
  console_log text,
  context jsonb,
  resolved boolean
)
language sql
security definer
set search_path = public
as $$
  select b.id, b.created_at, u.email, p.display_name,
         b.comment, b.action_log, b.console_log, b.context, b.resolved
  from so7_bug_reports b
  left join auth.users u on u.id = b.user_id
  left join so7_user_profiles p on p.user_id = b.user_id
  where (auth.jwt() ->> 'email') in ('asobuzz.asobazunihairarenai@gmail.com','shogoshogo0929@gmail.com')
  order by b.created_at desc
$$;
revoke execute on function so7_get_admin_bug_reports() from public;
grant execute on function so7_get_admin_bug_reports() to authenticated;

-- ── マイデッキ戦（マイデッキ.txt）: プレイヤーごとの持ち込みデッキを永続化する ──────────
-- デッキは { "<cardId>": <枚数>, ... } のJSONで持つ（例: {"rainbow-shard":7,"red-jump-pad":7}）。
-- 検証（7枚以上・同名7枚まで・スペシャルの3:1税・所持数）はクライアント(my-deck.js)で行い、
-- ここは素の保存先。so7_user_profilesは既にuser_id=auth.uid()のみ読み書きできるRLSなので、
-- デッキの中身（何を仕込んだか）は本人以外に漏れない。対戦中に相手へ見せるのは「マイデッキの
-- カードである」ことを示す裏面だけで、それは既存のアバター/名前と同様に対戦ステートへ載せて
-- 配る想定（プロフィール直読みではない。so7_user_profiles_selectがusing(user_id=auth.uid())で
-- 他人の行を読めないため）。
alter table so7_user_profiles add column if not exists my_deck jsonb;

-- マイデッキ戦かどうかを対局ごとに保持する（部屋作成者が対戦ロビーのトグルでON、
-- BOOTSTRAP_GAME時に1回だけ書き込む。timer_config等と同じ「対局全体で固定」の扱い）。
-- 全クライアントはこれを見て、ロックフェイズの3択（ロック／マイデッキから1枚／スキップ）を
-- 出すかどうかを決める。マイデッキ本体は so7_game_piles に "myDeck-<seat>" というパイル名で
-- 入り、so7_game_piles_visible は discard 以外の中身を返さない（枚数だけ公開）ので、相手や
-- 本人にも並び順・中身は見えず「残り枚数」だけが分かる（マイデッキ.txtの想定通り）。
alter table so7_games add column if not exists my_deck_mode boolean not null default false;

-- マイデッキ戦フェーズ5（裏面の印）: マイデッキ由来の札に付ける「所有者の席」印
-- （so7_game_tokens.my_deck_owner）は、so7_game_tokens_visibleビューが参照する都合上、上の
-- テーブル定義直後（reveal_source付近）で既に追加済み。ここでは重複防止のため何もしない。
-- 各席が選んでいるカード裏面セット。マイデッキ札を「所有者の裏面」で全員に見せるために、
-- 座席行にも持たせて全員が読めるようにする（名前・アバター・駒スキンと同じ公開情報の扱い）。
alter table so7_game_seats add column if not exists card_back_set_index int;
-- マイデッキ戦F4: 開始時の「デッキ選択」で各席が選んだデッキ（解決済み）を保存する。
-- 形: { cards:{cardId:count}, firstColor, pieceSkinIndex, petIndex, cardBackSetIndex }。
-- BOOTSTRAP_GAMEがこれを読み、マイデッキ配布・ファースト色・駒/ペット/裏面スキンの一時上書きに使う。
-- 隠す必要のある「中身」はBOOTSTRAP時にサーバー内で処理する（座席行は本人しか読めないRLS）。
alter table so7_game_seats add column if not exists selected_deck jsonb;

-- ============================================================================
-- ランク戦（フリーマッチ）フェーズ1: データ土台（2026-08-16、docs/ranked-spec.md参照）
-- ============================================================================
-- 既存の「対戦数ティア（stats-profileのランクリング）」とは別物の競技ランク。
-- ランク7段階（0=ブロンズ..6=レジェンド）×各ランク内の七色ゲージ（0..6、7で昇格）。
-- ポイント・昇格・シーズン切替のロジックはすべてこの下のSECURITY DEFINER関数で確定する
-- （クライアントを信頼しない。so7_user_currencyと同じ「SELECTだけ公開・書き込みはRPC経由」方式）。
-- このフェーズはレート土台のみ。待機キュー（マッチメイキング）はフェーズ2、対戦結果からの
-- 実際のポイント付与（結果検証込み）はフェーズ3で追加する。

create table if not exists so7_ranked_players (
  user_id uuid primary key references auth.users(id) on delete cascade,
  season_id text not null,               -- 例: '2026-08'（JSTの年月）
  rank smallint not null default 0,      -- 0=ブロンズ 1=シルバー 2=ゴールド 3=プラチナ 4=ダイヤ 5=マスター 6=レジェンド
  gauge smallint not null default 0,     -- 次ランクまでの七色ゲージ 0..6（7で昇格）
  legend_points int not null default 0,  -- LP（rank=6のときだけ意味を持つ）
  updated_at timestamptz not null default now()
);
alter table so7_ranked_players enable row level security;
-- ランクは公開情報（相手のランク表示・ランキング）なのでSELECTは全員可。書き込みは
-- INSERT/UPDATEポリシーを一切付与しない（デフォルト拒否）→ 下のRPC経由のみ。
drop policy if exists "so7_ranked_players_select" on so7_ranked_players;
create policy "so7_ranked_players_select" on so7_ranked_players for select to authenticated
  using (true);

-- シーズン終了報酬（docs/ranked-spec.md）。シーズン切替時に、前シーズンの到達ランク
-- （＝降格前の現ランク。シーズン中は降格しないのでこれがピーク）に応じた通貨を付与し、
-- 「未受取の報酬」としてここに記録する。クライアントが新シーズン初ログイン時にモーダルで
-- 見せ、so7_ranked_claim_reward()でクリアする（＝1回だけ表示。通貨自体は付与済み）。
alter table so7_ranked_players add column if not exists pending_reward_season text;
alter table so7_ranked_players add column if not exists pending_reward_rank smallint;
alter table so7_ranked_players add column if not exists pending_reward_amount int;

-- 到達ランク→シーズン終了報酬（通貨）。金額を変えたい時はここの数字を変えて再実行する。
-- 0=ブロンズ 1=シルバー 2=ゴールド 3=プラチナ 4=ダイヤ 5=マスター 6=レジェンド。
create or replace function so7_ranked_season_reward(p_rank int)
returns int
language sql
immutable
as $$
  select case
    when p_rank <= 0 then 50
    when p_rank = 1 then 100
    when p_rank = 2 then 200
    when p_rank = 3 then 350
    when p_rank = 4 then 550
    when p_rank = 5 then 800
    else 1200            -- 6以上＝レジェンド
  end;
$$;

-- 現在のシーズンID（JSTの年月）。cronは使わず、シーズン切替は「新シーズンに初めて
-- ランク戦に触れた時」に下の関数群が遅延で適用する。
create or replace function so7_ranked_current_season()
returns text
language sql
stable
set search_path = public, extensions
as $$
  select to_char((now() at time zone 'Asia/Tokyo'), 'YYYY-MM');
$$;

-- 【内部エンジン】1人のプレイヤーにポイント差分dを適用する。docs/ranked-spec.mdの
-- ゲージ処理（繰越・後ろから消灯=クランプ・0未満なし・シーズン中降格なし・レジェンドはLP）と
-- シーズン切替（古いシーズンなら現ランク-2・ゲージ0・LP0を1回だけ）をすべてここで確定する。
-- ★authenticatedにはgrantしない（クライアントから任意のdeltaを適用=不正を防ぐ）。上位の
--   結果反映RPC（フェーズ3）やadmin/self関数からのみ内部で呼ぶ。
create or replace function so7_ranked_apply_delta(p_user_id uuid, p_delta int)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_season text := so7_ranked_current_season();
  v_row_season text;
  v_rank smallint;
  v_gauge smallint;
  v_lp int;
  v_total int;
  v_reward int;
begin
  -- 行が無ければ現シーズンのブロンズ0で作る
  insert into so7_ranked_players (user_id, season_id, rank, gauge, legend_points, updated_at)
  values (p_user_id, v_season, 0, 0, 0, now())
  on conflict (user_id) do nothing;

  select season_id, rank, gauge, legend_points
    into v_row_season, v_rank, v_gauge, v_lp
    from so7_ranked_players where user_id = p_user_id for update;

  -- シーズン切替（古いシーズンなら現ランク-2・ゲージ0・LP0を1回だけ。何ヶ月空けても1回）
  if v_row_season is distinct from v_season then
    -- シーズン終了報酬: 降格前の現ランク（＝前シーズンの到達ランク＝ピーク）に応じた通貨を付与し、
    -- 「未受取の報酬」として記録する（クライアントがモーダルで見せてclaimでクリア）。ここは
    -- 季節が変わった最初の1回だけ実行される（以降 v_row_season=v_season で再入しない）ので冪等。
    v_reward := so7_ranked_season_reward(v_rank);
    if v_reward > 0 then
      insert into so7_user_currency (user_id, balance, updated_at)
        values (p_user_id, v_reward, now())
        on conflict (user_id) do update
          set balance = so7_user_currency.balance + v_reward, updated_at = now();
    end if;
    update so7_ranked_players
      set pending_reward_season = v_row_season,
          pending_reward_rank = v_rank,
          pending_reward_amount = v_reward
      where user_id = p_user_id;

    v_rank := greatest(0, v_rank - 2);
    v_gauge := 0;
    v_lp := 0;
    v_row_season := v_season;
  end if;

  if v_rank >= 6 then
    -- レジェンド: 以降はLPを積む・0未満にはしない
    v_lp := greatest(0, v_lp + p_delta);
  else
    v_total := v_gauge + p_delta;
    if v_total < 0 then
      v_total := 0;  -- 現ランク0未満なし・シーズン中降格なし
    end if;
    while v_total >= 7 and v_rank < 6 loop
      v_total := v_total - 7;  -- 7超過分を次ランクへ繰越
      v_rank := v_rank + 1;
    end loop;
    if v_rank >= 6 then
      v_lp := v_total;  -- 昇格でレジェンド入り→繰越をLPの初期値にする
      v_gauge := 0;
    else
      v_gauge := v_total;  -- 0..6
    end if;
  end if;

  update so7_ranked_players
    set season_id = v_row_season, rank = v_rank, gauge = v_gauge,
        legend_points = v_lp, updated_at = now()
    where user_id = p_user_id;
end;
$$;
revoke execute on function so7_ranked_apply_delta(uuid, int) from public;
-- ★authenticatedへのgrantはしない（内部専用）

-- 呼び出し元自身の現シーズンのランクを取得する（表示用）。行が無い/シーズンが古い時だけ
-- apply_delta(0)で作成/シーズン切替を反映し、それ以外は純粋なselect。
-- 返り値の列を増やした（pending_reward_*）ため、create or replace では型変更できない。
-- 既存関数を先に drop してから作り直す（再実行安全: 存在しなければ何もしない）。
drop function if exists so7_ranked_get_self();
create or replace function so7_ranked_get_self()
returns table(season_id text, rank smallint, gauge smallint, legend_points int,
  pending_reward_season text, pending_reward_rank smallint, pending_reward_amount int)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_season text := so7_ranked_current_season();
  v_row_season text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  select p.season_id into v_row_season from so7_ranked_players p where p.user_id = v_uid;
  if v_row_season is null or v_row_season is distinct from v_season then
    perform so7_ranked_apply_delta(v_uid, 0);  -- ポイント変化なし・作成/シーズン切替（＋シーズン終了報酬）だけ反映
  end if;
  return query
    select p.season_id, p.rank, p.gauge, p.legend_points,
           p.pending_reward_season, p.pending_reward_rank, p.pending_reward_amount
      from so7_ranked_players p where p.user_id = v_uid;
end;
$$;
revoke execute on function so7_ranked_get_self() from public;
grant execute on function so7_ranked_get_self() to authenticated;

-- シーズン終了報酬の「未受取」記録をクリアする（クライアントがモーダルを表示し終えた後に呼ぶ）。
-- 通貨自体はシーズン切替時に付与済みなので、これは「モーダルを1回だけ見せる」ための消し込み。
create or replace function so7_ranked_claim_reward()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  update so7_ranked_players
    set pending_reward_season = null, pending_reward_rank = null, pending_reward_amount = null
    where user_id = v_uid;
end;
$$;
revoke execute on function so7_ranked_claim_reward() from public;
grant execute on function so7_ranked_claim_reward() to authenticated;

-- 【管理者専用】任意のプレイヤーにポイント差分を適用する（動作検証・手動補正用）。
-- so7_admin_grant_currencyと同じく、関数内部でメールを直接チェックして本当に制限する。
-- ★重要: このメールアドレスが実際の管理者アカウントと一致しているか確認すること。
create or replace function so7_ranked_admin_apply_delta(p_target uuid, p_delta int)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
begin
  if v_uid is null or (v_email is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and v_email is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  perform so7_ranked_apply_delta(p_target, p_delta);
end;
$$;
revoke execute on function so7_ranked_admin_apply_delta(uuid, int) from public;
grant execute on function so7_ranked_admin_apply_delta(uuid, int) to authenticated;

-- 【検算用メモ（SQL Editorで手動実行して確認できる）】
-- SQL Editorはpostgres/service_roleで動くためauth.uid()/auth.jwt()が無い。内部エンジン
-- so7_ranked_apply_deltaを直接呼んで検算する（本番はクライアントがget_self/上位RPC経由で使う）。
-- 自分のuser_idは: select id, email from auth.users where email = 'あなたのメール';
--
--   -- 仕様の例（ゴールド5pt → 4人戦1位+4 → プラチナ・ゲージ2）を再現:
--   select so7_ranked_apply_delta('<あなたのuuid>', 19);  -- 0pt→ ゴールド(rank2) ゲージ5
--   select so7_ranked_apply_delta('<あなたのuuid>', 4);   -- +4 → プラチナ(rank3) ゲージ2
--   select rank, gauge, legend_points from so7_ranked_players where user_id = '<あなたのuuid>';
--     -- 期待: rank=3, gauge=2, legend_points=0
--
--   -- マイナスで降格しない・0未満にならないことの確認:
--   select so7_ranked_apply_delta('<あなたのuuid>', -100);
--   select rank, gauge from so7_ranked_players where user_id = '<あなたのuuid>';
--     -- 期待: rank=3のまま, gauge=0
--
--   -- 検証が済んだら消してよい: delete from so7_ranked_players where user_id = '<あなたのuuid>';

-- ============================================================================
-- ランク戦フェーズ2: マッチメイキング（待機キュー＋原子的ペアリング＋レディチェック）
-- ============================================================================
-- 2026-08-16、docs/ranked-spec.md参照。専用サーバーは無いのでポーリング方式の待機キュー。
-- 低母数対策の核＝レディチェック：マッチ成立＝即開始にせず、両者が「対戦開始」を押して
-- 初めてランク対局を作成する（AFKで即敗北を防ぐ）。書き込みは全部SECURITY DEFINERのRPC経由。

-- ランク対局の印。クライアントはこれを見て自動処理・タイマーを強制ONし、終了時にレート反映
-- （フェーズ3）する。合言葉フレンド戦もこの印を使う。公開ロビー一覧には出さない。
alter table so7_games add column if not exists is_ranked boolean not null default false;

-- 部屋一覧からランク対局を除外（ランクのキュー戦・合言葉戦は独自の入場経路を持つため、
-- 公開の「参加できる部屋」には出さない）。列を変えないのでcreate or replaceで安全。
create or replace view so7_games_list as
select
  g.id, g.name, g.status, g.created_at,
  (p.game_id is not null) as has_password,
  (select count(*) from so7_game_seats s where s.game_id = g.id) as member_count
from so7_games g
left join so7_game_passwords p on p.game_id = g.id
where g.status = 'open' and not g.is_ranked;

-- 待機中プレイヤー。RLSは有効化するがポリシーを付与しない（デフォルト拒否）＝直接読み書き
-- 不可、下のRPC経由のみ。deckはこの対局で使う解決済みデッキ（席へ引き継ぐ）。
create table if not exists so7_ranked_queue (
  user_id uuid primary key references auth.users(id) on delete cascade,
  deck jsonb,
  enqueued_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  status text not null default 'waiting',   -- 'waiting' | 'matched'
  match_id uuid                             -- 組まれたグループID（matched時）
);
-- 希望人数（2/3/4）。同じ party_size 同士だけがマッチする（続き190で追加）。
alter table so7_ranked_queue add column if not exists party_size int not null default 2;
alter table so7_ranked_queue enable row level security;

-- レディチェック待ちのグループ（2〜4人）。同じくRLSポリシー無し（RPC経由のみ）。
-- 段階的フィル（ユーザー提案2026-08-17「2人マッチしたら20秒3人目を待つ…」）に対応するため、
-- forming（まだ人を集めている）→ locked（締め切り or 4人でレディチェック開始）の状態を持つ。
-- pending は短命なエフェメラルなので drop&recreate で安全（再実行安全）。
drop table if exists so7_ranked_pending_match cascade;
create table so7_ranked_pending_match (
  id uuid primary key default gen_random_uuid(),
  players uuid[] not null,                  -- 集まった2〜4人の user_id
  ready uuid[] not null default '{}',       -- ready を押した user_id
  size int not null,                        -- 現在の人数（参考。判定は array_length(players) を使う）
  grow_deadline timestamptz not null default now(),  -- この時刻までに人が増えなければロックする
  locked boolean not null default false,    -- レディチェック開始済み（人集め終了）
  locked_at timestamptz,                    -- ロックした時刻（レディチェックの締め切りをここから測る）
  created_at timestamptz not null default now(),
  game_id text                             -- 全員ready後に作られた対局ID
);
alter table so7_ranked_pending_match enable row level security;

-- キューに 'waiting' で登録（再登録は待機状態にリセット）。p_size=希望人数(2/3/4)。
-- 引数が増えたため旧 (jsonb) は drop してから (jsonb,int) を作る。
drop function if exists so7_ranked_enqueue(jsonb);
create or replace function so7_ranked_enqueue(p_deck jsonb, p_size int default 2)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_size int := greatest(2, least(4, coalesce(p_size, 2)));
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into so7_ranked_queue (user_id, deck, party_size, enqueued_at, last_seen, status, match_id)
  values (v_uid, p_deck, v_size, now(), now(), 'waiting', null)
  on conflict (user_id) do update
    set deck = excluded.deck, party_size = v_size, enqueued_at = now(), last_seen = now(),
        status = 'waiting', match_id = null;
end;
$$;
revoke execute on function so7_ranked_enqueue(jsonb, int) from public;
grant execute on function so7_ranked_enqueue(jsonb, int) to authenticated;

-- ランク対局（so7_games＋各自の席）を作る内部ヘルパー。全員ready(so7_ranked_ready)と、
-- レディチェック締め切りで押した人だけで開始する(so7_ranked_pollの2-2)の両方から呼ぶ。
-- SECURITY DEFINER 同士の内部呼び出し専用（authenticated へは grant しない＝クライアントから
-- 直接叩けない。呼び出し元の DEFINER 権限で実行される）。
create or replace function so7_ranked_create_game(p_players uuid[])
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_game text;
  v_p uuid; v_deck jsonb; v_prof record;
begin
  v_game := 'r_' || replace(gen_random_uuid()::text, '-', '');
  insert into so7_games (id, name, status, is_ranked, my_deck_mode, timer_config)
  values (v_game, 'ランク戦', 'open', true, true,
          '{"enabled": true, "pseudoCpuModeEnabled": false}'::jsonb);
  foreach v_p in array p_players
  loop
    select display_name, avatar, piece_skin_index, pet_index into v_prof
      from so7_user_profiles where user_id = v_p;
    select deck into v_deck from so7_ranked_queue where user_id = v_p;
    insert into so7_game_seats
      (game_id, user_id, display_name, avatar, piece_skin_index, pet_index, selected_deck)
    values
      (v_game, v_p, v_prof.display_name, v_prof.avatar,
       coalesce(v_prof.piece_skin_index, 0), v_prof.pet_index, v_deck);
  end loop;
  return v_game;
end;
$$;
revoke execute on function so7_ranked_create_game(uuid[]) from public;

-- 待機中に数秒ごとに呼ぶ。①ハートビート ②掃除 ③グループ成立試行 ④自分の状態＋待機人数を返す。
-- #variable_conflict use_column: OUT列名(match_id/game_id等)と同名のテーブル列を、SQL内では
-- 列として解決させる（あいまいさ回避）。OUT列への代入は := で明示的に行う。
-- 返り値: opponents = 自分以外の参加者の配列（[{user_id,name,avatar,rank}]）、size = 目標人数。
drop function if exists so7_ranked_poll();
create or replace function so7_ranked_poll()
returns table(
  state text, match_id uuid, game_id text, waiting_count int,
  size int, grow_seconds int, opponents jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_status text;
  v_match uuid;
  v_ids uuid[] := '{}';
  v_new uuid;
  v_gid uuid;
  v_gplayers uuid[];
  r record;
  v_players uuid[]; v_ready uuid[]; v_locked boolean; v_deadline timestamptz; v_game text; v_p uuid;
  v_opps jsonb := '[]'::jsonb;
  v_prof record; v_rank smallint;
  v_newgame text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- (1) ハートビート
  update so7_ranked_queue set last_seen = now() where user_id = v_uid;

  -- (2-1) 離脱者（待機中でハートビートが古い）を削除
  delete from so7_ranked_queue
    where status = 'waiting' and last_seen < now() - interval '25 seconds';

  -- (2-2) レディチェック締め切り（ロック後62秒＝クライアント表示60秒の直後）。ユーザー要望
  --       2026-08-18「4人集まって2人しか対戦開始を押さなくても、押した人だけで対局はすべき」。
  --       締め切り時点で ready が2人以上いれば、押した人だけで対局を開始する（押さなかった人は
  --       AFKでキューから外す・ペナルティなし・レート変動なし）。1人以下なら従来通り解散
  --       （ready済み1人は待機に戻す）。※forming（未ロック）は grow_deadline でロックされるので、
  --       ここは locked=true のグループだけを対象にする。締め切りは locked_at から測る。
  for r in
    select * from so7_ranked_pending_match
    where locked and game_id is null and locked_at is not null and locked_at < now() - interval '62 seconds'
    for update skip locked
  loop
    if coalesce(array_length(r.ready, 1), 0) >= 2 then
      -- 押した人（ready）だけで対局を開始。押さなかった人はキューから外す。
      v_newgame := so7_ranked_create_game(r.ready);
      update so7_ranked_pending_match set game_id = v_newgame, players = r.ready where id = r.id;
      foreach v_p in array r.players loop
        if not (v_p = any(r.ready)) then
          delete from so7_ranked_queue where user_id = v_p;
        end if;
      end loop;
    else
      -- ready が2人未満（0/1）→ 解散。ready済み(1人)は待機に戻す、残りは外す。
      foreach v_p in array r.players loop
        if v_p = any(r.ready) then
          update so7_ranked_queue set status='waiting', match_id=null where user_id=v_p;
        else
          delete from so7_ranked_queue where user_id=v_p;
        end if;
      end loop;
      delete from so7_ranked_pending_match where id=r.id;
    end if;
  end loop;

  -- (2-3) 対局作成済みの古いグループ（クライアントが入場済みのはず）を後始末
  for r in
    select id, players from so7_ranked_pending_match
    where game_id is not null and created_at < now() - interval '3 minutes'
  loop
    delete from so7_ranked_queue q
      where q.user_id = any(r.players) and q.status='matched' and q.match_id=r.id;
    delete from so7_ranked_pending_match where id=r.id;
  end loop;

  -- (3) 段階的フィル。自分が waiting なら:
  --   (a) まだ人集め中(forming=未ロック・4人未満)のグループがあればそこに参加し、集合締め切りを延長する
  --       （＝新しい人が入るたびに「あと20秒」次の人を待つ、というユーザー提案の挙動）。
  --   (b) 無ければ、待機中の最古2人（自分含む）で新しいグループを作る。
  select status into v_status from so7_ranked_queue where user_id = v_uid;
  if v_status = 'waiting' then
    select id, players into v_gid, v_gplayers
      from so7_ranked_pending_match
      where not locked and game_id is null and coalesce(array_length(players, 1), 0) < 4
      order by created_at
      limit 1
      for update skip locked;
    if v_gid is not null then
      update so7_ranked_pending_match
        set players = array_append(players, v_uid),
            size = coalesce(array_length(players, 1), 0) + 1,
            grow_deadline = now() + interval '20 seconds'
        where id = v_gid;
      update so7_ranked_queue set status='matched', match_id=v_gid where user_id = v_uid;
    else
      for r in
        select user_id from so7_ranked_queue
        where status='waiting' and last_seen > now() - interval '25 seconds'
        order by enqueued_at
        limit 2
        for update skip locked
      loop
        v_ids := array_append(v_ids, r.user_id);
      end loop;
      if array_length(v_ids, 1) = 2 then
        v_new := gen_random_uuid();
        insert into so7_ranked_pending_match (id, players, ready, size, grow_deadline, locked, created_at)
        values (v_new, v_ids, '{}', 2, now() + interval '20 seconds', false, now());
        update so7_ranked_queue set status='matched', match_id=v_new where user_id = any(v_ids);
      end if;
    end if;
  end if;

  -- 集合締め切り経過 or 4人 で forming グループをロック（＝レディチェック開始）。
  -- locked_at をロック時刻として記録し、(2-2)のレディチェック締め切りをここから測る。
  update so7_ranked_pending_match
    set locked = true, locked_at = now()
    where not locked and game_id is null
      and (coalesce(array_length(players, 1), 0) >= 4 or now() > grow_deadline);

  -- (4) 自分の状態を組み立てて返す
  select status, match_id into v_status, v_match from so7_ranked_queue where user_id = v_uid;

  if v_status is null then
    state := 'none';
  elsif v_status = 'waiting' then
    state := 'waiting';
  elsif v_status = 'matched' then
    select players, ready, locked, grow_deadline, game_id
      into v_players, v_ready, v_locked, v_deadline, v_game
      from so7_ranked_pending_match where id = v_match;
    if v_players is null then
      -- グループが解散済みなのに自分のrowがmatchedのまま（レース）→ waitingに戻す
      update so7_ranked_queue set status='waiting', match_id=null where user_id=v_uid;
      state := 'waiting';
    else
      if v_game is not null then
        state := 'ingame';
      elsif v_locked then
        state := 'matched';   -- レディチェック（人集め終了）
      else
        state := 'forming';   -- まだ人集め中（あと grow_seconds 秒）
      end if;
      match_id := v_match;
      game_id := v_game;
      size := coalesce(array_length(v_players, 1), 0);
      grow_seconds := greatest(0, ceil(extract(epoch from (v_deadline - now())))::int);
      -- 自分以外の参加者を配列で返す（集合中/レディチェックで全員のアバター・名前・ランクを見せる）。
      foreach v_p in array v_players loop
        if v_p <> v_uid then
          select display_name, avatar into v_prof from so7_user_profiles where user_id = v_p;
          select rank into v_rank from so7_ranked_players where user_id = v_p;
          v_opps := v_opps || jsonb_build_object(
            'user_id', v_p,
            'name', coalesce(v_prof.display_name, ''),
            'avatar', coalesce(v_prof.avatar, ''),
            'rank', coalesce(v_rank, 0)
          );
        end if;
      end loop;
      opponents := v_opps;
    end if;
  end if;

  waiting_count := (select count(*) from so7_ranked_queue
                    where status='waiting' and last_seen > now() - interval '25 seconds');
  return next;
end;
$$;
revoke execute on function so7_ranked_poll() from public;
grant execute on function so7_ranked_poll() to authenticated;

-- 自分の ready を立てる。全員 ready になった瞬間にランク対局（so7_games＋N席、各自のデッキを
-- 席へ）を原子的に作成し game_id を書き込む（戻り値＝game_id、まだ相手待ちならnull）。
create or replace function so7_ranked_ready(p_match_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_players uuid[]; v_ready uuid[]; v_locked boolean; v_game text;
  v_p uuid; v_deck jsonb;
  v_prof record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select players, ready, locked, game_id into v_players, v_ready, v_locked, v_game
    from so7_ranked_pending_match where id = p_match_id for update;
  if v_players is null then raise exception 'match_not_found'; end if;
  if not (v_uid = any(v_players)) then raise exception 'not_in_match'; end if;
  if v_game is not null then return v_game; end if;  -- 既に作成済み（冪等）
  if not v_locked then return null; end if;  -- まだ人集め中（レディチェック未開始）

  if not (v_uid = any(v_ready)) then
    v_ready := array_append(v_ready, v_uid);
    update so7_ranked_pending_match set ready = v_ready where id = p_match_id;
  end if;

  -- 全員 ready（ready 配列が players を網羅＝現在の人数と一致）になったら対局を作る。
  -- 段階的フィルで size 列が実際の人数とズレ得るため、判定は array_length(players) を使う。
  if array_length(v_ready, 1) = array_length(v_players, 1) then
    v_game := so7_ranked_create_game(v_players);
    update so7_ranked_pending_match set game_id = v_game where id = p_match_id;
    return v_game;
  end if;
  return null;
end;
$$;
revoke execute on function so7_ranked_ready(uuid) from public;
grant execute on function so7_ranked_ready(uuid) to authenticated;

-- キャンセル（キューを抜ける／グループ解散）。対局作成前のキャンセルなら他の参加者を待機に戻す。
create or replace function so7_ranked_leave()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_match uuid;
  v_players uuid[]; v_remaining uuid[]; v_locked boolean; v_game text; v_p uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select match_id into v_match from so7_ranked_queue where user_id = v_uid;
  if v_match is not null then
    select players, locked, game_id into v_players, v_locked, v_game
      from so7_ranked_pending_match where id = v_match for update;
    if v_players is not null and v_game is null then
      v_remaining := array_remove(v_players, v_uid);
      if not v_locked and coalesce(array_length(v_remaining, 1), 0) >= 2 then
        -- まだ人集め中(forming)で、自分が抜けても2人以上残る → グループは残し、自分だけ抜ける。
        update so7_ranked_pending_match
          set players = v_remaining, size = array_length(v_remaining, 1),
              ready = array_remove(ready, v_uid)
          where id = v_match;
      else
        -- ロック済み or 残り1人以下 → グループ解散・自分以外は待機に戻す
        foreach v_p in array v_players loop
          if v_p <> v_uid then
            update so7_ranked_queue set status='waiting', match_id=null where user_id = v_p;
          end if;
        end loop;
        delete from so7_ranked_pending_match where id = v_match;
      end if;
    end if;
    -- game_idが既にある（対局作成済み）＝入場後のクリーンな離脱なら、他の参加者/グループは触らない
  end if;
  delete from so7_ranked_queue where user_id = v_uid;
end;
$$;
revoke execute on function so7_ranked_leave() from public;
grant execute on function so7_ranked_leave() to authenticated;

-- ============================================================================
-- ランク戦フェーズ3: 対戦結果からのレート反映（2026-08-16、docs/ranked-spec.md参照）
-- ============================================================================
-- ランク対局が7色ロックで終わったら、勝者=1位・敗者=2位としてポイントを反映する。
-- v1の信頼モデル: 報告された勝者を信頼する（1対局1回だけ適用＝冪等、action-logで係争対応、
-- 自動処理＋タイマーで不正を抑止という既存方針）。サーバー側での勝利検証（トークンの7色
-- ロック確認）は将来のハードニング。ポイント計算・昇格・シーズン切替はフェーズ1の
-- so7_ranked_apply_delta（内部エンジン）に委ねる。

alter table so7_games add column if not exists ranked_result_applied boolean not null default false;
-- 勝者の座席（place=1）。放置敗北などで結果反映時に居なかったクライアントが、復帰時に
-- 「この対局は既に終了・自分は勝ち/負け」を判定して表示するために保存する（2026-08-18）。
alter table so7_games add column if not exists ranked_winner_seat text;

-- 順位・人数・ブースト有無からポイント（デルタ）を返す（docs/ranked-spec.md のポイント表）。
-- ブースト（ブロンズ〜ゴールド＝rank<=2）はプラス側だけ大きく、マイナスは通常と同じ。
--   2人: 1位 +3/+1、2位 −1
--   3人: 1位 +3/+1、2位 0、3位 −1
--   4人: 1位 +4/+2、2位 +2/+1、3位 −1、4位 −2
-- （各セルは boost/normal。3位・4位は boost/normal 共通）。
create or replace function so7_ranked_points(p_count int, p_place int, p_boost boolean)
returns int
language sql
immutable
as $$
  select case
    when p_count = 2 then
      case p_place when 1 then (case when p_boost then 3 else 1 end) else -1 end
    when p_count = 3 then
      case p_place when 1 then (case when p_boost then 3 else 1 end) when 2 then 0 else -1 end
    when p_count = 4 then
      case p_place
        when 1 then (case when p_boost then 4 else 2 end)
        when 2 then (case when p_boost then 2 else 1 end)
        when 3 then -1
        else -2
      end
    else 0
  end;
$$;

-- ランク対局が7色ロックで終わったら、各プレイヤーの順位に応じてポイントを反映する。
-- v1の信頼モデル: クライアントが報告する順位を信頼する（1対局1回だけ適用＝冪等、action-logで
--   係争対応、自動処理＋タイマーで不正を抑止という既存方針。全クライアント＝勝者/傍観者が呼んでも
--   ranked_result_applied で1回だけ反映）。順位はクライアントが「勝者=1位、以降はロック色数の多い順
--   （同数は同順位＝競技順位）」で決めて p_placements（{"A":1,"C":2,...} 座席→順位）で渡す。
--   ロックは常に表向き＝公開情報なので全クライアントが同じ順位を算出でき、決定的（冪等と整合）。
-- ブースト/通常は各プレイヤー自身の「対戦開始時の現ランク」（＝適用前に読む現在ランク）で判定する。
-- 戻り値は反映結果（クライアントが演出に使う）。既に適用済み/非ランクなら skipped を返す。
-- （旧2人戦専用シグネチャ (text,text) は drop してから (text,jsonb) を作り直す。2人戦は
--   placements={winner:1,loser:2} で従来と同じ結果になる＝統一。）
drop function if exists so7_ranked_report_result(text, text);
create or replace function so7_ranked_report_result(p_game_id text, p_placements jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_is_ranked boolean;
  v_applied boolean;
  v_count int;
  v_rank smallint;
  v_boost boolean;
  v_place int;
  v_delta int;
  v_results jsonb := '[]'::jsonb;
  r record;
begin
  select is_ranked, ranked_result_applied into v_is_ranked, v_applied
    from so7_games where id = p_game_id for update;
  if v_is_ranked is null then raise exception 'game_not_found'; end if;
  if not v_is_ranked then return jsonb_build_object('skipped', 'not_ranked'); end if;
  if v_applied then return jsonb_build_object('skipped', 'already_applied'); end if;

  v_count := (select count(*) from jsonb_object_keys(p_placements));
  if v_count < 2 or v_count > 4 then raise exception 'bad_player_count'; end if;

  -- 参加座席ごとに、その座席の順位＋そのプレイヤー自身の現ランク（＝ブースト判定）でデルタを適用。
  -- 各プレイヤーの行は独立なので、プレイヤー単位で「現ランクを読む→デルタ適用」で正しい
  -- （他プレイヤーへの適用は自分のランク読みに影響しない）。
  for r in select seat, user_id from so7_game_seats where game_id = p_game_id loop
    v_place := (p_placements ->> r.seat)::int;
    if v_place is null then continue; end if; -- placementsに無い座席は対象外（通常起きない）
    select rank into v_rank from so7_ranked_players where user_id = r.user_id;
    if v_rank is null then v_rank := 0; end if;
    v_boost := v_rank <= 2;
    v_delta := so7_ranked_points(v_count, v_place, v_boost);
    perform so7_ranked_apply_delta(r.user_id, v_delta);
    v_results := v_results || jsonb_build_object(
      'user', r.user_id, 'seat', r.seat, 'place', v_place, 'delta', v_delta
    );
  end loop;

  -- 勝者（place=1）の座席を保存（復帰時の勝敗表示用）。placementsから最小placeの座席を取る。
  update so7_games
    set ranked_result_applied = true,
        ranked_winner_seat = (
          select key from jsonb_each_text(p_placements)
          order by value::int asc
          limit 1
        )
    where id = p_game_id;

  return jsonb_build_object('applied', true, 'count', v_count, 'results', v_results);
end;
$$;
revoke execute on function so7_ranked_report_result(text, jsonb) from public;
grant execute on function so7_ranked_report_result(text, jsonb) to authenticated;

-- =====================================================================================
-- Web Push（続き198）: タブ/ブラウザを閉じていても届くプッシュ通知の購読情報。
-- クライアントは so7_save_push_subscription（SECURITY DEFINER）でのみ自席の subscription を
-- 保存できる。読み取りは so7-send-push Edge Function（service role）のみ（authenticated への
-- select/insert/update ポリシーは付与しない＝直接アクセス不可）。
-- =====================================================================================
create table if not exists so7_push_subscriptions (
  endpoint text primary key,                 -- デバイスのpush endpoint（一意）
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null,                       -- subscription.keys.p256dh
  auth_key text not null,                     -- subscription.keys.auth（列名は auth スキーマと紛らわしいので auth_key）
  updated_at timestamptz not null default now()
);
create index if not exists so7_push_subscriptions_user_idx on so7_push_subscriptions(user_id);
alter table so7_push_subscriptions enable row level security;
-- authenticated への RLS ポリシーは付与しない（＝直接の select/insert/update/delete は拒否）。

-- 自席の push subscription を保存（upsert）。同じ endpoint（同じデバイス）は鍵を更新し、別ユーザーが
-- 同じデバイスで購読した時は所有者（user_id）を新ユーザーに付け替える。
create or replace function so7_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_endpoint is null or length(p_endpoint) = 0 then return; end if;
  insert into so7_push_subscriptions (endpoint, user_id, p256dh, auth_key, updated_at)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth, now())
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth_key = excluded.auth_key,
        updated_at = now();
end;
$$;
revoke execute on function so7_save_push_subscription(text, text, text) from public;
grant execute on function so7_save_push_subscription(text, text, text) to authenticated;

-- 表示言語（ja/en）。ユーザー要望「言語設定は端末ではなくアカウントに記録した方が良い」。
-- 他の設定列（sound_volume_bgm等）と違い、大きなloadMyPreferencesのSELECTには混ぜず
-- （1列でも未存在だと全設定の読み込みが丸ごと失敗する既知の落とし穴のため）、online.jsの
-- fetchMyLang()という独立クエリで安全に読む。保存はsaveMyPreference({lang})の独立UPDATE。
alter table so7_user_profiles add column if not exists lang text;

-- ユーザー要望2026-08-28（続き312）「戦績システムで、個別の不具合報告件数も記録してもいいかも」。
-- so7_bug_reports は SELECT ポリシーを一切作っていない（＝本文・ログは管理者しか読めない）ので、
-- **件数だけ**を返す集計関数を用意する。返すのは user_id と件数のみで、本文・アクションログ・
-- コンソールログ・コンテキストは一切返さない。戦績管理システム（姉妹サイト）が
-- 「このプレイヤーは何件報告してくれたか」をプレイヤー一覧に出すために使う。
create or replace function so7_get_bug_report_counts()
returns table (
  user_id uuid,
  report_count int
)
language sql
security definer
set search_path = public, extensions
as $$
  select b.user_id, count(*)::int as report_count
  from so7_bug_reports b
  where b.user_id is not null
  group by b.user_id;
$$;
revoke execute on function so7_get_bug_report_counts() from public;
grant execute on function so7_get_bug_report_counts() to authenticated;


-- ---------------------------------------------------------------------------
-- 追加(2026-08-29): 不具合報告にスクリーンショットを添付できるようにする（ユーザー要望）。
-- 画像は Storage の bug-shots バケットへ入れ、URL だけを so7_bug_reports.context の JSON に
-- 持たせる（テーブルの列は増やさない）。読み取りは公開（URLを知っている人だけが見られる。
-- ファイル名にランダムな時刻を含めるので総当たりは現実的でない）。書き込みはログイン中の
-- 本人が自分のフォルダ（user_id/）へだけ、に限定する。
-- ※ このSQLを実行するまでは、画像の添付だけが失敗する（本文・ログの送信は今まで通り成功する）。
insert into storage.buckets (id, name, public)
values ('bug-shots', 'bug-shots', true)
on conflict (id) do update set public = true;

drop policy if exists "bug_shots_read" on storage.objects;
create policy "bug_shots_read" on storage.objects
  for select using (bucket_id = 'bug-shots');

drop policy if exists "bug_shots_insert_own" on storage.objects;
create policy "bug_shots_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'bug-shots' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 追加(2026-09-02): 全員へのお知らせ（ユーザー要望「テスターに連絡したい」）。
-- 管理者が管理者ダッシュボードから投稿し、プレイヤーがホーム画面を開いた時に一度だけ
-- モーダルで表示する（既読はその端末のlocalStorageで管理するので、ここには持たない）。
-- 読み取りは authenticated（ゲストログインも含む＝アプリで遊んでいる人は全員読める）。
-- 書き込み・編集・削除は管理者のメールアドレスだけ（so7_get_admin_* と同じ判定）。
-- ※ このSQLを実行するまで、お知らせの取得は静かに失敗する（アプリは今まで通り動く）。
create table if not exists so7_announcements (
  id bigserial primary key,
  title text not null,
  body text not null,
  published boolean not null default true,
  -- 掲載期間（ユーザー要望2026-09-02「お知らせに期間を設定できるようにしたい。その期間を
  -- 過ぎていたら初めて開いた人にも通知は行かない」）。null は「制限なし」。
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);
-- 既に so7_announcements を作った後にこの2列を足す場合（後から実行しても安全）:
alter table so7_announcements add column if not exists starts_at timestamptz;
alter table so7_announcements add column if not exists ends_at timestamptz;
alter table so7_announcements enable row level security;

drop policy if exists "so7_announcements_select" on so7_announcements;
create policy "so7_announcements_select" on so7_announcements
  for select to authenticated using (true);

drop policy if exists "so7_announcements_admin_insert" on so7_announcements;
create policy "so7_announcements_admin_insert" on so7_announcements
  for insert to authenticated
  with check ((auth.jwt() ->> 'email') in ('asobuzz.asobazunihairarenai@gmail.com', 'shogoshogo0929@gmail.com'));

drop policy if exists "so7_announcements_admin_update" on so7_announcements;
create policy "so7_announcements_admin_update" on so7_announcements
  for update to authenticated
  using ((auth.jwt() ->> 'email') in ('asobuzz.asobazunihairarenai@gmail.com', 'shogoshogo0929@gmail.com'))
  with check ((auth.jwt() ->> 'email') in ('asobuzz.asobazunihairarenai@gmail.com', 'shogoshogo0929@gmail.com'));

drop policy if exists "so7_announcements_admin_delete" on so7_announcements;
create policy "so7_announcements_admin_delete" on so7_announcements
  for delete to authenticated
  using ((auth.jwt() ->> 'email') in ('asobuzz.asobazunihairarenai@gmail.com', 'shogoshogo0929@gmail.com'));

-- ── 追加(2026-09-03): 不具合報告に「対処済み」を付けられるようにする（ユーザー要望） ──────
-- 列(resolved)は最初から存在するが、値を書き換える手段が無かった（so7_bug_reports には
-- SELECT/UPDATE ポリシーを一切作っていない＝直接は読み書きできない設計のため）。
-- 読みと同じ方式で「管理者のメールで呼ばれた時だけ更新する」SECURITY DEFINER 関数を足す。
-- 戻り値は実際に更新された件数（0なら権限が無い＝静かに失敗していないか呼び出し側で分かる。
-- 姉妹リポジトリでRLSのUPDATEポリシー欠落を「エラー無し・0件」で踏んだ教訓）。
create or replace function so7_set_bug_report_resolved(p_id bigint, p_resolved boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  if (auth.jwt() ->> 'email') not in ('asobuzz.asobazunihairarenai@gmail.com','shogoshogo0929@gmail.com') then
    return 0;
  end if;
  update so7_bug_reports set resolved = coalesce(p_resolved, false) where id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function so7_set_bug_report_resolved(bigint, boolean) from public;
grant execute on function so7_set_bug_report_resolved(bigint, boolean) to authenticated;

-- ============================================================================
-- 追加(2026-09-04): 管理者ダッシュボードの改善（ユーザー要望）
--   ①「すべて対処済みにする」ボタン用の一括更新RPC
--   ② ログイン履歴に「通算ログイン回数・初ログイン日・今月のログイン回数」を併記
--   ③ 登録ユーザー一覧で「表示名未設定＝ゲスト（お試し）アカウント」を隠せるようにする
-- 戻り値の列を増やすため、②③は drop してから作り直す（create or replace では列を変えられない）。
-- ============================================================================

-- ① 不具合報告をすべて対処済みにする（管理者のみ）。更新した件数を返す。
create or replace function so7_resolve_all_bug_reports()
returns int
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  n int;
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  update so7_bug_reports set resolved = true where resolved is distinct from true;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function so7_resolve_all_bug_reports() from public;
grant execute on function so7_resolve_all_bug_reports() to authenticated;

-- ② ログイン履歴に、その行のユーザーの「通算ログイン回数・初ログイン日・今月のログイン回数」を併記する。
drop function if exists so7_get_admin_visit_log(int, int);
create or replace function so7_get_admin_visit_log(p_limit int default 200, p_offset int default 0)
returns table (
  created_at timestamptz,
  user_id uuid,
  email text,
  display_name text,
  total_logins bigint,
  first_login_at timestamptz,
  month_logins bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    with agg as (
      select
        v.user_id as uid,
        count(*) as total,
        min(v.created_at) as first_at,
        count(*) filter (where v.created_at >= date_trunc('month', now())) as this_month
      from so7_visit_log v
      where v.user_id is not null
      group by v.user_id
    )
    select v.created_at, v.user_id, u.email, p.display_name,
           coalesce(a.total, 0), a.first_at, coalesce(a.this_month, 0)
    from so7_visit_log v
    left join auth.users u on u.id = v.user_id
    left join so7_user_profiles p on p.user_id = v.user_id
    left join agg a on a.uid = v.user_id
    order by v.created_at desc
    limit p_limit offset p_offset;
end;
$$;
revoke execute on function so7_get_admin_visit_log(int, int) from public;
grant execute on function so7_get_admin_visit_log(int, int) to authenticated;

-- ③ 登録ユーザー一覧に「ゲスト（匿名ログイン）かどうか」を足す。ダッシュボード側で
--    既定では隠す（スモークテストやお試しで作られる使い捨てアカウントが大量に並ぶため）。
drop function if exists so7_get_admin_user_list();
create or replace function so7_get_admin_user_list()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_seen_at timestamptz,
  is_guest boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    select u.id, u.email, p.display_name, u.created_at, p.last_seen_at,
           -- 匿名ログイン（ゲスト）か。auth.users.is_anonymous を第一の根拠にし、
           -- 無い場合は本人が書いた so7_user_profiles.is_guest、それも無ければ
           -- 「メールアドレスが無い＝ゲスト」で判定する。
           coalesce(u.is_anonymous, p.is_guest, u.email is null) as is_guest
    from auth.users u
    left join so7_user_profiles p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;
revoke execute on function so7_get_admin_user_list() from public;
grant execute on function so7_get_admin_user_list() to authenticated;

-- ============================================================================
-- 追加(2026-09-04): フレンド機能（ユーザー要望）
--   ・申請は「一度対戦した相手」に対してだけ出す想定（クライアント側の導線で担保する）。
--   ・1組につき1行。user_a < user_b の順に正規化して入れる（同じ2人の行が2つできないように）。
--   ・status: 'pending'（申請中）/ 'accepted'（成立）/ 'declined'（断られた）。
--     断ったことは相手に伝えない——クライアントは自分が requested_by の時、declined を
--     「まだ返事がない」と区別せず単に「申請済み」として扱い、再申請の導線も出さない。
--   ・相手の表示名・アバター・最終アクセス（＝今アプリを開いているか）は so7_user_profiles に
--     あるが、そのRLSは「自分の行だけ」なので普通には読めない（2026-09-04のゲスト誤登録の
--     原因と同じ制限）。フレンドの分だけまとめて返す専用の関数を用意する。
-- ============================================================================

create table if not exists so7_friendships (
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  requested_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
alter table so7_friendships enable row level security;
-- 自分が当事者の行だけ読める。書き込みは下のRPC経由に限定する（直接insertは許可しない＝
-- 「対戦したことのある相手にだけ申請できる」という導線を迂回されないようにするため）。
drop policy if exists "so7_friendships_select" on so7_friendships;
create policy "so7_friendships_select" on so7_friendships for select to authenticated
  using (auth.uid() = user_a or auth.uid() = user_b);

-- フレンド申請を出す。既に行があれば何もしない（二重申請・断られた相手への再申請を防ぐ）。
create or replace function so7_request_friend(p_target uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  existing text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  if p_target is null or p_target = me then return 'invalid'; end if;
  a := least(me, p_target);
  b := greatest(me, p_target);
  select status into existing from so7_friendships where user_a = a and user_b = b;
  if existing is not null then return existing; end if;
  insert into so7_friendships (user_a, user_b, status, requested_by)
    values (a, b, 'pending', me);
  return 'pending';
end;
$$;
revoke execute on function so7_request_friend(uuid) from public;
grant execute on function so7_request_friend(uuid) to authenticated;

-- 申請に返事をする（承認 or 辞退）。申請を出した本人は返事できない。
create or replace function so7_respond_friend(p_other uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  a uuid;
  b uuid;
  row_requested_by uuid;
  row_status text;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  a := least(me, p_other);
  b := greatest(me, p_other);
  select requested_by, status into row_requested_by, row_status
    from so7_friendships where user_a = a and user_b = b;
  if row_requested_by is null then return 'none'; end if;
  if row_requested_by = me then return row_status; end if; -- 自分の申請には返事できない
  if row_status <> 'pending' then return row_status; end if;
  update so7_friendships
    set status = case when p_accept then 'accepted' else 'declined' end, updated_at = now()
    where user_a = a and user_b = b;
  return case when p_accept then 'accepted' else 'declined' end;
end;
$$;
revoke execute on function so7_respond_friend(uuid, boolean) from public;
grant execute on function so7_respond_friend(uuid, boolean) to authenticated;

-- フレンドを解除する（成立済み・申請中どちらでも、自分が当事者なら行ごと消す）。
create or replace function so7_remove_friend(p_other uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
  n int;
begin
  if me is null then raise exception 'not_signed_in'; end if;
  delete from so7_friendships
    where user_a = least(me, p_other) and user_b = greatest(me, p_other);
  get diagnostics n = row_count;
  return n > 0;
end;
$$;
revoke execute on function so7_remove_friend(uuid) from public;
grant execute on function so7_remove_friend(uuid) to authenticated;

-- 自分のフレンド（成立・申請中・受信した申請）を、相手の表示名・アバター・
-- 最終アクセス日時つきで返す。so7_user_profiles は自分の行しか読めないため、
-- 「自分が当事者の行に出てくる相手の分だけ」をこの関数で解禁する。
-- direction: 'incoming'（相手からの申請）/ 'outgoing'（自分が出した申請）/ 'mutual'（成立）。
create or replace function so7_get_friends()
returns table (
  friend_id uuid,
  status text,
  direction text,
  display_name text,
  avatar text,
  last_seen_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'not_signed_in'; end if;
  return query
    select
      case when f.user_a = me then f.user_b else f.user_a end as friend_id,
      f.status,
      case
        when f.status = 'accepted' then 'mutual'
        when f.requested_by = me then 'outgoing'
        else 'incoming'
      end as direction,
      p.display_name,
      p.avatar,
      p.last_seen_at,
      f.created_at
    from so7_friendships f
    left join so7_user_profiles p
      on p.user_id = (case when f.user_a = me then f.user_b else f.user_a end)
    where (f.user_a = me or f.user_b = me)
      -- 断られた申請は自分の画面から静かに消す（相手にも自分にも見せない）。
      and f.status <> 'declined'
    order by f.status, f.created_at desc;
end;
$$;
revoke execute on function so7_get_friends() from public;
grant execute on function so7_get_friends() to authenticated;

-- ============================================================================
-- 修正(2026-09-05): 管理者ダッシュボードの「ログイン履歴」「登録ユーザー一覧」が取れない
--   （ユーザー報告「取得に失敗しました: structure of query does not match function
--     result type」／登録ユーザー一覧が0件）
--
-- 原因: plpgsql の `returns table (...)` は、返す列の型が**厳密に一致**していないと
-- この実行時エラーになる。auth.users.email は text ではなく **character varying(255)**
-- なので、`email text` として返そうとすると落ちる（Supabaseでよくある落とし穴）。
-- count(*) の bigint と integer の 0 を混ぜた coalesce なども同種の事故になりやすい。
-- → **返す列すべてに明示的なキャストを付ける**（これでこの種のエラーは起きなくなる）。
--
-- 実行方法: 下の2つの関数定義をSQL Editorに貼って実行する（既存を置き換えるだけ。
-- 何度実行しても安全）。
-- ============================================================================

drop function if exists so7_get_admin_visit_log(int, int);
create or replace function so7_get_admin_visit_log(p_limit int default 200, p_offset int default 0)
returns table (
  created_at timestamptz,
  user_id uuid,
  email text,
  display_name text,
  total_logins bigint,
  first_login_at timestamptz,
  month_logins bigint
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    with agg as (
      select
        v.user_id as uid,
        count(*) as total,
        min(v.created_at) as first_at,
        count(*) filter (where v.created_at >= date_trunc('month', now())) as this_month
      from so7_visit_log v
      where v.user_id is not null
      group by v.user_id
    )
    select
      v.created_at::timestamptz,
      v.user_id::uuid,
      u.email::text,
      p.display_name::text,
      coalesce(a.total, 0)::bigint,
      a.first_at::timestamptz,
      coalesce(a.this_month, 0)::bigint
    from so7_visit_log v
    left join auth.users u on u.id = v.user_id
    left join so7_user_profiles p on p.user_id = v.user_id
    left join agg a on a.uid = v.user_id
    order by v.created_at desc
    limit p_limit offset p_offset;
end;
$$;
revoke execute on function so7_get_admin_visit_log(int, int) from public;
grant execute on function so7_get_admin_visit_log(int, int) to authenticated;

drop function if exists so7_get_admin_user_list();
create or replace function so7_get_admin_user_list()
returns table (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  last_seen_at timestamptz,
  is_guest boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  return query
    select
      u.id::uuid,
      u.email::text,
      p.display_name::text,
      u.created_at::timestamptz,
      p.last_seen_at::timestamptz,
      -- 匿名ログイン（ゲスト）か。auth.users.is_anonymous を第一の根拠にし、無い場合は
      -- 本人が書いた so7_user_profiles.is_guest、それも無ければ「メールアドレスが無い＝
      -- ゲスト」で判定する。
      coalesce(u.is_anonymous, p.is_guest, (u.email is null))::boolean
    from auth.users u
    left join so7_user_profiles p on p.user_id = u.id
    order by u.created_at desc;
end;
$$;
revoke execute on function so7_get_admin_user_list() from public;
grant execute on function so7_get_admin_user_list() to authenticated;

-- ============================================================================
-- 追加(2026-09-05): 「この端末にだけ保存されていた設定」をアカウントにも保存する
--   （ユーザー要望「基本設定が割とリセットされている印象。アカウントに保存すべき情報を
--     再精査してほしい」）
--
-- 対象: CPUの速さ/強さ/人数/自動送り、フェイズの自動スキップ、マスの確認、カード拡大の
--       大きさ・向き、盤面のカードを絵だけにする、手札を画面下に固定、自動処理中のドラッグ
--       制限、ランク戦の通知（ON/OFFと時間帯）。
--
-- 設定ごとに列を足すのではなく **1つの jsonb にまとめる**。列を増やす方式だと、列が1つ
-- 足りないだけでSELECT文全体が失敗し、他の設定まで丸ごと読めなくなる事故が起きる
-- （src/online.js の loadMyPreferences のコメント参照。実際に一度やらかしている）。
-- 読み書きも独立したクエリにしてあるので、この列がまだ無い環境でも他の設定に影響しない。
-- ============================================================================
alter table so7_user_profiles add column if not exists extra_prefs jsonb;
