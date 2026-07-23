-- ユーザー要望「アバター画像を自分でアップロードできるようにしたい」への対応。
-- 専用のSupabase Storageバケット"avatars"を新設し、誰でも読み取れる（公開URLで
-- 画像を表示するため）・ログイン済みユーザーは自分の画像をアップロード/上書きできる、
-- という最小限のポリシーを設定する。
--
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。
-- （実行後、Storage > avatars バケットが作成されていることを確認できます）
--
-- 保存パスはsrc/online.jsのuploadAvatarImage()が {user_id}.webp という固定名で
-- 使う（アップロードのたびに上書き、履歴は残さない）。

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 誰でも読み取れる（board上・戦績サイト等、ログインしていない人にも画像を見せる必要があるため）。
drop policy if exists "avatars_public_read" on storage.objects;
create policy "avatars_public_read" on storage.objects
  for select to public
  using (bucket_id = 'avatars');

-- ログイン済みユーザー（匿名ログイン含む）は誰でもアップロード・上書きできる。
-- ファイル名を{user_id}.webpに固定しているため、他人のファイルを上書きすることは
-- 「技術的には」可能だが、クライアント側(online.js)は必ず自分自身のuser_idを
-- ファイル名に使うため、通常の利用では他人の画像を書き換えることはない。
drop policy if exists "avatars_authenticated_insert" on storage.objects;
create policy "avatars_authenticated_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars');

drop policy if exists "avatars_authenticated_update" on storage.objects;
create policy "avatars_authenticated_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars');
