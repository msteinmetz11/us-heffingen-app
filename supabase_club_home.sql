-- US Heffingen: Club-Startseite (News, Fotos, Partner-Band)
-- Einmal in Supabase ausfuehren: SQL Editor -> New query -> einfuegen -> Run
-- Schreiben darf nur, wer den Club-Code (Team 'club') oder den Gesamt-Code ('*') kennt.

create table if not exists public.club_news (
  id uuid primary key default gen_random_uuid(),
  team text not null default 'club',
  title text not null check (char_length(title) between 1 and 80),
  body text not null default '' check (char_length(body) <= 400),
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

create or replace function public.club_news_add(p_code text, p_team text, p_title text, p_body text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, 'club') then raise exception 'invalid code'; end if;
  insert into public.club_news(team, title, body) values (coalesce(nullif(p_team,''),'club'), left(p_title,80), left(coalesce(p_body,''),400));
end $$;
create or replace function public.club_news_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, 'club') then raise exception 'invalid code'; end if;
  delete from public.club_news where id = p_id;
end $$;
create or replace function public.club_photo_add(p_code text, p_data text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, 'club') then raise exception 'invalid code'; end if;
  insert into public.club_photos(data) values (p_data);
end $$;
create or replace function public.club_photo_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, 'club') then raise exception 'invalid code'; end if;
  delete from public.club_photos where id = p_id;
end $$;
create or replace function public.club_sponsor_add(p_code text, p_name text, p_url text, p_logo text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, 'club') then raise exception 'invalid code'; end if;
  insert into public.club_sponsors(name, url, logo, pos) values (left(p_name,60), left(coalesce(p_url,''),200), coalesce(p_logo,''), (select coalesce(max(pos),0)+1 from public.club_sponsors));
end $$;
create or replace function public.club_sponsor_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._coach_ok(p_code, 'club') then raise exception 'invalid code'; end if;
  delete from public.club_sponsors where id = p_id;
end $$;

grant execute on function
  public.club_news_add(text,text,text,text), public.club_news_del(text,uuid),
  public.club_photo_add(text,text), public.club_photo_del(text,uuid),
  public.club_sponsor_add(text,text,text,text), public.club_sponsor_del(text,uuid) to anon;
