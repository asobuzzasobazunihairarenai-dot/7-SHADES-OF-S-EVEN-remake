-- ============================================================================
-- 【これを全部コピーして、SupabaseのSQL Editorに貼って実行してください】
--
-- 何度実行しても安全です（作り直す・無ければ足す、だけの内容です）。
-- 実行が終わったら、管理者ダッシュボードの「🔄 読み込み直す」を押してください。
--
-- 中身は2つだけ:
--   ① 管理者ダッシュボードの「登録ユーザー一覧」「ログイン履歴」が取れない不具合の修正
--   ② 設定（CPUの速さ等）をアカウントに保存するための保存場所を1つ足す
--
-- ※ もし赤いエラーが出たら、その文言をそのまま開発側へ伝えてください。
-- ============================================================================

-- ② 設定の保存場所（1行）。src/pref-registry.js の説明も参照。
alter table so7_user_profiles add column if not exists extra_prefs jsonb;

-- ============================================================================
-- 再修正(2026-09-05): 管理者ダッシュボードの「ログイン履歴」「登録ユーザー一覧」が
--   まだ "structure of query does not match function result type" で取れない件
--
-- 前回は `returns table (...)` の各列に明示キャストを付けて直そうとしたが、それでも
-- 直らなかった（ユーザー報告）。plpgsql の returns table は**列の型を1つでも取り違えると
-- 実行時に落ちる**という仕組みそのものが弱いので、**型合わせを一切やめる**ことにした。
-- 結果を jsonb（オブジェクトの配列）1つとして返せば、列の型・列の数・列の順番が
-- 何であっても一致しようがない＝この種のエラーは二度と起きない。
-- クライアント側（src/admin-dashboard.js）は今までどおり「オブジェクトの配列」として
-- 受け取れる（キー名はこれまでと同じ）。
--
-- 【実行方法】ここから下だけを SQL Editor に貼って実行すればよい。
-- 【うまくいかない時の確認用】いま実際にどちらの版が入っているかは、これで見られる:
--   select p.proname, pg_get_function_result(p.oid) as returns
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('so7_get_admin_user_list', 'so7_get_admin_visit_log');
--   → returns が "jsonb" になっていれば、この版が入っている。
-- ============================================================================

drop function if exists so7_get_admin_user_list();
create or replace function so7_get_admin_user_list()
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into result
  from (
    select
      u.id as user_id,
      u.email as email,
      p.display_name as display_name,
      u.created_at as created_at,
      p.last_seen_at as last_seen_at,
      -- 匿名ログイン（ゲスト）か。auth.users.is_anonymous を第一の根拠にし、無ければ
      -- 本人が書いた so7_user_profiles.is_guest、それも無ければ「メールアドレスが無い」で判定。
      coalesce(u.is_anonymous, p.is_guest, (u.email is null)) as is_guest
    from auth.users u
    left join so7_user_profiles p on p.user_id = u.id
  ) x;
  return result;
end;
$$;
revoke execute on function so7_get_admin_user_list() from public;
grant execute on function so7_get_admin_user_list() to authenticated;

drop function if exists so7_get_admin_visit_log(int, int);
create or replace function so7_get_admin_visit_log(p_limit int default 200, p_offset int default 0)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  result jsonb;
begin
  if ((auth.jwt() ->> 'email') is distinct from 'asobuzz.asobazunihairarenai@gmail.com' and (auth.jwt() ->> 'email') is distinct from 'shogoshogo0929@gmail.com') then
    raise exception 'not_authorized';
  end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]'::jsonb)
    into result
  from (
    with agg as (
      select
        v2.user_id as uid,
        count(*) as total,
        min(v2.created_at) as first_at,
        count(*) filter (where v2.created_at >= date_trunc('month', now())) as this_month
      from so7_visit_log v2
      where v2.user_id is not null
      group by v2.user_id
    )
    select
      v.created_at as created_at,
      v.user_id as user_id,
      u.email as email,
      p.display_name as display_name,
      coalesce(a.total, 0) as total_logins,
      a.first_at as first_login_at,
      coalesce(a.this_month, 0) as month_logins
    from so7_visit_log v
    left join auth.users u on u.id = v.user_id
    left join so7_user_profiles p on p.user_id = v.user_id
    left join agg a on a.uid = v.user_id
    order by v.created_at desc
    limit p_limit offset p_offset
  ) x;
  return result;
end;
$$;
revoke execute on function so7_get_admin_visit_log(int, int) from public;
grant execute on function so7_get_admin_visit_log(int, int) to authenticated;
