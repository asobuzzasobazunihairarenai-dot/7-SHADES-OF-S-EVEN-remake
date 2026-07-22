-- 7 SHADES OF S:EVEN デジタル版 と 戦績管理システム の連携（Phase 1: 対戦結果の自動登録）
--
-- これまでsupabase_setup_so7.sqlの冒頭に「姉妹プロジェクトの戦績管理システム側の
-- テーブル（players/matches等、so7_プレフィックスの無いもの）は一切変更しない」と
-- 明記していたが、今回はユーザー要望（オンライン対戦終了時に戦績・参加者・勝者・
-- 所要時間を戦績管理システムへ自動登録したい）により、例外的にplayers/matchesへ
-- 列を2つだけ追加する。どちらのアプリも同じSupabaseプロジェクト
-- （prnddzrnblfysggiuzmo）を共有しているため、デジタル版側から直接
-- players/matchesテーブルへ書き込む設計にした（新しいSupabaseプロジェクトや
-- APIキーは不要）。
--
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください。

-- players.user_id: 戦績管理システムの「プレイヤー」を、デジタル版のログイン
-- アカウント（auth.users）に紐づける列。ユーザー要望「Googleアカウント等で既に
-- プレイヤー登録済みとわかれば新たに登録は行わない」に対応するためのキー。
-- 1つのアカウントにつき戦績プレイヤーは1人までなので一意制約を付ける
-- （nullは複数許容＝従来通り手動登録された「アカウント未紐づけ」のプレイヤーは
-- 引き続き何人いても問題ない）。
alter table players
  add column if not exists user_id uuid references auth.users(id);
create unique index if not exists players_user_id_idx on players(user_id) where user_id is not null;

-- matches.source: 'manual'（従来通り、戦績管理システムのUIから手動登録・証拠画像
-- 必須・要承認）か'digital'（デジタル版が対戦終了時に自動登録、承認不要）かを
-- 区別する。将来、戦績管理システム側のUIで「デジタル版の記録」であることを
-- 表示し分けたくなった時にも使える。
alter table matches
  add column if not exists source text not null default 'manual';

-- デジタル版からの自動登録は証拠画像（スクリーンショット）を用意できない
-- （そもそもゲームプレイの結果そのものが記録の正本のため、証拠画像という概念が
-- 不要）。従来はproof_image_urlが必須(NOT NULL)だったため、nullを許可するよう
-- 変更する（既にnull許容なら何もしないno-op）。
alter table matches alter column proof_image_url drop not null;

-- RLS: デジタル版のログイン済みユーザー(authenticated)がplayers/matchesへ
-- insertできるようにする。既存のポリシー内容が不明なため、この2テーブルへの
-- insertを許可する専用ポリシーを追加する形にした（既存のselect/update等の
-- ポリシーには一切触れない）。
drop policy if exists "players_insert_authenticated" on players;
create policy "players_insert_authenticated" on players for insert to authenticated with check (true);
drop policy if exists "matches_insert_authenticated" on matches;
create policy "matches_insert_authenticated" on matches for insert to authenticated with check (true);
-- 上のgetOrCreateStatsPlayer()は「まず自分のuser_idで既存行を探す」ためのselectも
-- 行うため、authenticatedにselectも許可する（既に許可されている場合はこのポリシーは
-- 効果を持たないだけで害はない）。
drop policy if exists "players_select_authenticated" on players;
create policy "players_select_authenticated" on players for select to authenticated using (true);
