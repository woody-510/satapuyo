-- さたぷよ オンラインランキング（Supabase の「SQL Editor」に まるごと貼って Run）
-- 何回 Run しても大丈夫（作りなおすだけ。記録は消えない）
--
-- しくみ
--   ・scores テーブルに「プレイヤーごと・モードごとのベスト」を1行ずつ残す
--   ・ゲームからは submit_score / rename_player の関数を呼ぶだけ。テーブルに直接は書けない
--   ・secret（端末だけが知っている合言葉）は読めないようにしてある。ランキングで見えるのは public_id・名前・記録だけ

create table if not exists public.scores (
  secret     uuid not null,                     -- プレイヤーの合言葉（外からは見えない）
  public_id  uuid not null,                     -- ランキングで「自分の行」を見つけるための ID
  mode       text not null,                     -- endless / time / kumite / ac-pre-4 など
  name       text not null,
  value      double precision not null,         -- 点数 / タイム（秒） / 勝ちぬいた人数
  chain      integer not null default 0,        -- さいだい れんさ
  updated_at timestamptz not null default now(),
  primary key (secret, mode)
);
create index if not exists scores_mode_value on public.scores (mode, value);

-- だれでも読める（ただし secret の列はのぞく）。書くのは下の関数からだけ
alter table public.scores enable row level security;
drop policy if exists "scores are readable" on public.scores;
create policy "scores are readable" on public.scores for select using (true);
revoke all on public.scores from anon, authenticated;
grant select (public_id, mode, name, value, chain, updated_at) on public.scores to anon, authenticated;

-- 記録を送る。前のベストより良いときだけ書きかわる（名前はいつも新しいものに）
create or replace function public.submit_score(
  p_secret uuid, p_public uuid, p_mode text, p_name text, p_value double precision, p_chain integer
) returns void
language plpgsql security definer set search_path = public as $$
declare
  lower_better boolean := p_mode like 'ac-%';  -- ぜんけしアタックはタイムが短いほうがえらい
  v_name text := left(btrim(coalesce(p_name, '')), 10);
begin
  if p_mode is null or p_mode !~ '^(endless|time|kumite|ac-(pre|none)-[345])$' then
    raise exception 'bad mode';
  end if;
  if p_value is null or p_value <= 0 or p_value > 100000000 then
    raise exception 'bad value';
  end if;
  if v_name = '' then v_name := 'ななし'; end if;

  insert into scores as s (secret, public_id, mode, name, value, chain)
  values (p_secret, p_public, p_mode, v_name, p_value, coalesce(p_chain, 0))
  on conflict (secret, mode) do update set
    name = excluded.name,
    value = case when lower_better then least(s.value, excluded.value) else greatest(s.value, excluded.value) end,
    chain = case when (lower_better and excluded.value < s.value) or (not lower_better and excluded.value > s.value)
                 then excluded.chain else s.chain end,
    updated_at = case when (lower_better and excluded.value < s.value) or (not lower_better and excluded.value > s.value)
                      then now() else s.updated_at end;
end $$;

-- 名前を変えたら、その人の記録ぜんぶの名前を変える
create or replace function public.rename_player(p_secret uuid, p_name text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_name text := left(btrim(coalesce(p_name, '')), 10);
begin
  if v_name = '' then v_name := 'ななし'; end if;
  update scores set name = v_name where secret = p_secret;
end $$;

revoke all on function public.submit_score(uuid, uuid, text, text, double precision, integer) from public;
revoke all on function public.rename_player(uuid, text) from public;
grant execute on function public.submit_score(uuid, uuid, text, text, double precision, integer) to anon, authenticated;
grant execute on function public.rename_player(uuid, text) to anon, authenticated;

-- 変な記録を消したいときは（例）：
--   delete from public.scores where name = 'へんななまえ';
--   delete from public.scores where mode = 'endless' and value > 50000000;
