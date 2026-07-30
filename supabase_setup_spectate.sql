-- 観戦機能（ユーザー要望「後から部屋に入った人が観戦できるようにしてほしい」）。
-- 既存の so7_game_tokens_visible / so7_game_piles_visible は「参加者（座席保有者）だけが読める」
-- （outer where exists で座席チェック）ため、座席の無い観戦者は読めない。既存ビューには一切
-- 触れず、観戦者用の別ビューを追加する（＝現行プレイには影響ゼロ）。
--
-- Supabaseダッシュボード > SQL Editor に貼り付けて実行してください（冪等）。
--
-- ●公開観戦（spectate）: 手札・裏向きカードはマスクしたまま＝公開情報のみ。参加者フィルタ無し。
--   観戦者は誰の手札も裏向きカードも見えない（＝盤面・ロック・駒・表向きカードだけ）。
create or replace view so7_game_tokens_spectate as
select
  t.game_id, t.token_id, t.kind,
  -- 観戦者はどの座席の持ち主でもないため、手札は常に隠す。cell/lock は face_up の時だけ見える。
  case when t.zone = 'hand' then null else (case when t.face_up then t.card_id else null end) end as card_id,
  t.face_up, t.color, t.piece_player, t.zone, t.row, t.col, t.side, t.idx,
  t.hand_player, t.order_index, t.reveal_source, t.arrival_suppressed
from so7_game_tokens t;
grant select on so7_game_tokens_spectate to authenticated;

create or replace view so7_game_piles_spectate as
select
  p.game_id, p.pile_name,
  jsonb_array_length(p.cards) as card_count,
  case when p.pile_name = 'discard' then p.cards else null end as cards
from so7_game_piles p;
grant select on so7_game_piles_spectate to authenticated;

-- ●すべて見える観戦（all / god-view、配信の実況向け）: マスク一切なし。全プレイヤーの手札も
--   裏向きカードも丸見え。
--   ⚠ 注意: 認証済みユーザーなら誰でも任意の対局の隠し情報を読めるようになります
--   （プレイ中のプレイヤーの手札が観戦者に筒抜けになる、というプライバシー上のトレードオフ）。
--   身内・配信用途を想定した機能のため許容する前提。不要なら下の2ビューは作らないでください
--   （その場合クライアントの「すべて見える」観戦は公開観戦にフォールバックします）。
create or replace view so7_game_tokens_all as
select
  t.game_id, t.token_id, t.kind, t.card_id, t.face_up, t.color, t.piece_player,
  t.zone, t.row, t.col, t.side, t.idx, t.hand_player, t.order_index, t.reveal_source, t.arrival_suppressed
from so7_game_tokens t;
grant select on so7_game_tokens_all to authenticated;

create or replace view so7_game_piles_all as
select
  p.game_id, p.pile_name,
  jsonb_array_length(p.cards) as card_count,
  p.cards as cards
from so7_game_piles p;
grant select on so7_game_piles_all to authenticated;

-- 観戦できる（進行中の）対局の一覧。so7_games_list は status='open'（開始前）しか出さないため、
-- 観戦用に status='playing'（進行中）を出す別ビューを追加する。パスワードの有無・現在人数も返す。
create or replace view so7_games_spectate_list as
select
  g.id, g.name, g.status, g.created_at,
  (p.game_id is not null) as has_password,
  (select count(*) from so7_game_seats s where s.game_id = g.id) as member_count
from so7_games g
left join so7_game_passwords p on p.game_id = g.id
where g.status = 'playing';
grant select on so7_games_spectate_list to authenticated;
