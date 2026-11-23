-- US Heffingen: Club-Events speichern (Home-Menue). Einmal in Supabase ausfuehren:
-- SQL Editor -> New query -> alles einfuegen -> Run
alter table public.coach_events add column if not exists images jsonb not null default '[]'::jsonb;

create or replace function public.club_event_add(p_code text, p_date date, p_time text, p_title text, p_place text, p_note text, p_images jsonb default '[]'::jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  if p_images is not null and (jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) > 4 or length(p_images::text) > 700000) then
    raise exception 'images too large';
  end if;
  insert into public.coach_events(team, kind, date, time, title, place, note, images)
  values ('club', 'event', p_date, coalesce(p_time,''), left(p_title,80), left(coalesce(p_place,''),100), left(coalesce(p_note,''),200), coalesce(p_images,'[]'::jsonb));
end $$;
drop function if exists public.club_event_add(text,date,text,text,text,text);

create or replace function public.club_event_del(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  delete from public.coach_events where id = p_id and team = 'club';
end $$;

grant execute on function public.club_event_add(text,date,text,text,text,text,jsonb), public.club_event_del(text,uuid) to anon;
notify pgrst, 'reload schema';
