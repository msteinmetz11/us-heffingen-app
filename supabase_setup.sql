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

-- (Code-Hashes absichtlich entfernt: die Codes sind bereits in Supabase gespeichert und sollen nicht oeffentlich im Repo stehen.)

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
