-- 手元の Supabase だけに入る仮のデータ（npx supabase db reset で入る。クラウドには入らない）。
-- ゲームは本物の IGDB の ID とぶつからないよう、負の ID にする。
insert into public.games (id, name, alternative_names, platforms) values
  (-1, 'テスト用のゲーム（IDが要る）', '{"テストA"}', '{"PC","PlayStation 5"}'),
  (-2, 'テスト用のゲーム（部屋番号で入る）', '{"テストB"}', '{"Nintendo Switch"}'),
  (-3, 'テスト用のゲーム（スマホ）', '{}', '{"iOS","Android"}');
