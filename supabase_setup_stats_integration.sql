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

-- matches.source: 'manual'（従来通り、戦績管理システムのUIから手動登録）か
-- 'digital'（このデジタル版が対戦終了時に自動登録）かを区別する。将来、戦績管理
-- システム側のUIで「デジタル版の記録」であることを表示し分けたくなった時にも使える。
-- デジタル版からの登録も、手動登録と同じく証拠画像（勝利時の盤面スクリーンショット、
-- html2canvasで撮影しmatch-proofsバケットへアップロード）を添えて、status='pending'
-- （要承認）で登録する（online.jsのsubmitStatsMatchResult参照。当初は証拠画像無し・
-- 即時承認の設計だったが、戦績管理システム本来の不正防止の仕組みをそのまま活かす
-- ため変更した）。
alter table matches
  add column if not exists source text not null default 'manual';

-- スクリーンショットの撮影・アップロード自体が失敗した場合（例: ブラウザの
-- 3D描画をhtml2canvasが正しく扱えない、ネットワーク不調等）でも対戦記録の登録
-- 自体は止めたくないため、その場合はproof_image_urlをnullのまま登録する
-- （online.jsのcaptureVictoryScreenshot参照）。従来proof_image_urlが必須
-- (NOT NULL)だったため、nullを許可するよう変更する（既にnull許容なら
-- 何もしないno-op）。
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

-- 補足（Storageのmatch-proofsバケットについて）: 戦績管理システムはSupabase Auth
-- ログインを使わず匿名(anon)のまま証拠画像をmatch-proofsバケットへアップロード
-- できているため、このバケットのStorageポリシーは既にanon/authenticated問わず
-- アップロードを許可している可能性が高く、追加のポリシーは恐らく不要と考えている。
-- もし実際にログイン済みユーザーからのアップロードが権限エラーで失敗する場合は、
-- Supabaseダッシュボード > Storage > match-proofs > Policies で
-- authenticatedロールのINSERTを許可するポリシーを追加してほしい。
