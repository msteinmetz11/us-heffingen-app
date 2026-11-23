-- US Heffingen: Club-Startseite (News, Fotos, Partner-Band)
-- Einmal in Supabase ausfuehren: SQL Editor -> New query -> einfuegen -> Run
-- Schreiben darf NUR, wer den Home-Code (Team 'home') kennt. Alle anderen Codes (Teams, Club, Gesamt-Code) bleiben unveraendert
-- und oeffnen den Home-Editor nicht.

insert into public.coach_codes (team, hash) values ('home','73604ac0b2112243895f2f31449e3c5d44fdf1b2918cd2c990bdbf37306e62a0')
on conflict (team) do update set hash = excluded.hash;

create or replace function public._home_ok(p_code text) returns boolean
language sql security definer set search_path = public, extensions as $$
  select exists (
    select 1 from public.coach_codes c
    where c.team = 'home'
      and c.hash = encode(digest('ush-coach-v1:' || upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex'));
$$;
revoke all on function public._home_ok(text) from public, anon, authenticated;

-- Der Gesamt-Code ('*') bekommt den Home-Editor nicht: 'home' aus seiner Teamliste herausnehmen
create or replace function public.coach_teams(p_code text) returns text[]
language plpgsql security definer set search_path = public, extensions as $fn$
declare t text;
begin
  select c.team into t from public.coach_codes c
   where c.hash = encode(digest('ush-coach-v1:' || upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g')), 'sha256'), 'hex');
  if t is null then return null; end if;
  if t = '*' then
    return array(select team from public.coach_codes where team not in ('*','home') order by team);
  end if;
  return array[t];
end $fn$;
grant execute on function public.coach_teams(text) to anon;

create table if not exists public.club_news (
  id uuid primary key default gen_random_uuid(),
  team text not null default 'club',
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 400),
  image text not null default '' check (char_length(image) <= 300000),
  created_at timestamptz not null default now()
);
create table if not exists public.club_photos (
  id uuid primary key default gen_random_uuid(),
  data text not null check (char_length(data) <= 600000),
  created_at timestamptz not null default now()
);
create table if not exists public.club_sponsors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  url text not null default '' check (char_length(url) <= 200),
  logo text not null default '' check (char_length(logo) <= 200000),
  pos int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.club_news enable row level security;
alter table public.club_photos enable row level security;
alter table public.club_sponsors enable row level security;
drop policy if exists "alle lesen" on public.club_news;
drop policy if exists "alle lesen" on public.club_photos;
drop policy if exists "alle lesen" on public.club_sponsors;
create policy "alle lesen" on public.club_news for select to anon using (true);
create policy "alle lesen" on public.club_photos for select to anon using (true);
create policy "alle lesen" on public.club_sponsors for select to anon using (true);
revoke insert, update, delete on public.club_news, public.club_photos, public.club_sponsors from anon, authenticated;
grant select on public.club_news, public.club_photos, public.club_sponsors to anon;

alter table public.club_news add column if not exists image text not null default '' check (char_length(image) <= 300000);
drop function if exists public.club_news_add(text,text,text,text);
create or replace function public.club_news_add(p_code text, p_team text, p_title text, p_body text, p_image text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  insert into public.club_news(team, title, body, image) values (coalesce(nullif(p_team,''),'club'), left(p_title,80), left(coalesce(p_body,''),400), coalesce(p_image,''));
end $$;
create or replace function public.club_news_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.club_news where id = p_id;
end $$;
create or replace function public.club_photo_add(p_code text, p_data text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  insert into public.club_photos(data) values (p_data);
end $$;
create or replace function public.club_photo_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.club_photos where id = p_id;
end $$;
create or replace function public.club_sponsor_add(p_code text, p_name text, p_url text, p_logo text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  insert into public.club_sponsors(name, url, logo, pos) values (left(p_name,60), left(coalesce(p_url,''),200), coalesce(p_logo,''), (select coalesce(max(pos),0)+1 from public.club_sponsors));
end $$;
create or replace function public.club_sponsor_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.club_sponsors where id = p_id;
end $$;

grant execute on function
  public.club_news_add(text,text,text,text,text), public.club_news_del(text,uuid),
  public.club_photo_add(text,text), public.club_photo_del(text,uuid),
  public.club_sponsor_add(text,text,text,text), public.club_sponsor_del(text,uuid) to anon;

-- Club-Events (erscheinen auf der Club-Startseite unter "This week" und im Tab "Club events")
create or replace function public.club_event_add(p_code text, p_date date, p_time text, p_title text, p_place text, p_note text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  insert into public.coach_events(team, kind, date, time, title, place, note)
  values ('club', 'event', p_date, coalesce(p_time,''), left(p_title,80), left(coalesce(p_place,''),100), left(coalesce(p_note,''),200));
end $$;
create or replace function public.club_event_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.coach_events where id = p_id and team = 'club';
end $$;
grant execute on function public.club_event_add(text,date,text,text,text,text), public.club_event_del(text,uuid) to anon;
