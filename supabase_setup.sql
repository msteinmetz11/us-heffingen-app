-- US Heffingen: Coach-Eintraege (in Supabase: SQL Editor -> New query -> einfuegen -> Run)
create extension if not exists pgcrypto with schema extensions;

create table if not exists public.coach_codes (team text primary key, hash text not null);
create table if not exists public.coach_events (
  id uuid primary key default gen_random_uuid(),
  team text not null,
  kind text not null check (kind in ('training','game','event')),
  date date not null,
  time text not null default '',
  title text not null check (char_length(title) between 1 and 80),
  place text not null default '' check (char_length(place) <= 100),
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);

alter table public.coach_codes enable row level security;   -- keine Policy: von aussen unlesbar
alter table public.coach_events enable row level security;
drop policy if exists "alle lesen" on public.coach_events;
create policy "alle lesen" on public.coach_events for select to anon using (true);
revoke all on public.coach_codes from anon, authenticated;
revoke insert, update, delete on public.coach_events from anon, authenticated;
grant select on public.coach_events to anon;

insert into public.coach_codes (team, hash) values
  ('men','abdbc18fb3631c5ee2aaafd6036ecb1a8d83201fefe2e1302e65276be206f76a'),
  ('menb','a3c2d1808cde387d6e365ec57208cab0dc80de70159203705e68cc2e50e5d863'),
  ('menc','10000e5d6b774491d63286e5674f2348d64148ea68d18cee2a50172cf57a2cb3'),
  ('women','173ee18d1866158eeca7f5502c0c69fab30c0324e9476735acc9b7c453980531'),
  ('u22m','af7d002c7e5b0d9a790b55f64ee53086f14b144526cdf9bd0ce7ff0a0051b5bb'),
  ('u19w','521712af46e42e7b8a78de1bf605165bfa345d749ed0467e724df457b5798e1b'),
  ('u16m','30bb93b0b191651b0177053a5a30163ac4472d964123cbd6c74d399c4211095f'),
  ('u16w','54b170857c03f2a52af83c73ef65a692bd5508b6c659a2d472987e3a8eaca67f'),
  ('u14m','53a1179e8a24fdb02b66faeef2fe3e2a78bc1f8c0453d8c7c3691d1c4cfbf92d'),
  ('u14w','24236ae466c7c7cc8ab2e4d5220e9eacbf215f8c8adf1b39bf7412958aece030'),
  ('u12m','6013254209ac544482990cd00355fa51868ac312ed724d0dbdefa5f4040a39a0'),
  ('u12w','77f4ed1e90b0829091fca8eb373f32a317bf7090d59b74521ce5d2c7f65ec434'),
  ('club','0a25f8be6c0fd9b35575711d83c20e8cb688410e00a99c59b8c80ae24a8b03c6'),
  ('*','ea66d847bef2bb8c7bf2e4fb84b9fd29511c129fc84ab940a6fc253655a2ab96')
on conflict (team) do update set hash = excluded.hash;

create or replace function public._coach_ok(p_code text, p_team text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.coach_codes c
    where c.hash = encode(digest('ush-coach-v1:' || upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex')
      and (c.team = p_team or c.team = '*'));
$$;

create or replace function public.coach_teams(p_code text) returns text[]
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  select c.team into t from public.coach_codes c
   where c.hash = encode(digest('ush-coach-v1:' || upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
  if t is null then return null; end if;
  if t = '*' then
    return array(select team from public.coach_codes where team <> '*' order by team);
  end if;
  return array[t];
end $$;

create or replace function public.coach_add(p_code text, p_team text, p_kind text, p_date date, p_time text, p_title text, p_place text, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, p_team) then raise exception 'invalid code'; end if;
  insert into public.coach_events(team, kind, date, time, title, place, note)
  values (p_team, p_kind, p_date, coalesce(p_time,''), left(p_title,80), left(coalesce(p_place,''),100), left(coalesce(p_note,''),200));
end $$;

create or replace function public.coach_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  select team into t from public.coach_events where id = p_id;
  if t is null or not public._coach_ok(p_code, t) then raise exception 'invalid code'; end if;
  delete from public.coach_events where id = p_id;
end $$;

revoke all on function public._coach_ok(text,text) from public, anon, authenticated;
grant execute on function public.coach_teams(text), public.coach_add(text,text,text,date,text,text,text,text), public.coach_del(text,uuid) to anon;

-- Serien (wiederholende Trainings): einmal im SQL Editor ausfuehren
alter table public.coach_events add column if not exists series uuid;

create or replace function public.coach_add_series(p_code text, p_team text, p_kind text, p_date date, p_time text, p_title text, p_place text, p_note text, p_weeks int) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare s uuid := gen_random_uuid(); i int; n int := least(greatest(coalesce(p_weeks,1),1),52);
begin
  if not public._coach_ok(p_code, p_team) then raise exception 'invalid code'; end if;
  for i in 0..n-1 loop
    insert into public.coach_events(team, kind, date, time, title, place, note, series)
    values (p_team, p_kind, p_date + i*7, coalesce(p_time,''), left(p_title,80), left(coalesce(p_place,''),100), left(coalesce(p_note,''),200), s);
  end loop;
end $$;

create or replace function public.coach_del_series(p_code text, p_series uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  select team into t from public.coach_events where series = p_series limit 1;
  if t is null or not public._coach_ok(p_code, t) then raise exception 'invalid code'; end if;
  delete from public.coach_events where series = p_series;
end $$;

grant execute on function public.coach_add_series(text,text,text,date,text,text,text,text,int), public.coach_del_series(text,uuid) to anon;
