-- US Heffingen: Eintraege bearbeiten (News, Events, Partner im Home-Menue; Eintraege der Coaches)
-- Einmal in Supabase ausfuehren: SQL Editor -> New query -> alles einfuegen -> Run

create or replace function public.club_news_upd(p_code text, p_id uuid, p_team text, p_title text, p_body text, p_image text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  update public.club_news set team = coalesce(nullif(p_team,''),'club'), title = left(p_title,80),
    body = left(coalesce(p_body,''),4000), image = coalesce(p_image, image)
  where id = p_id;
end $$;

create or replace function public.club_event_upd(p_code text, p_id uuid, p_date date, p_time text, p_title text, p_place text, p_note text, p_images jsonb default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  if p_images is not null and (jsonb_typeof(p_images) <> 'array' or jsonb_array_length(p_images) > 4 or length(p_images::text) > 700000) then
    raise exception 'images too large';
  end if;
  update public.coach_events set date = p_date, time = coalesce(p_time,''), title = left(p_title,80),
    place = left(coalesce(p_place,''),100), note = left(coalesce(p_note,''),200), images = coalesce(p_images, images)
  where id = p_id and team = 'club';
end $$;

create or replace function public.club_sponsor_upd(p_code text, p_id uuid, p_name text, p_url text, p_logo text default null) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public._home_ok(p_code) then raise exception 'invalid code'; end if;
  update public.club_sponsors set name = left(p_name,60), url = left(coalesce(p_url,''),200), logo = coalesce(p_logo, logo)
  where id = p_id;
end $$;

-- Coaches: einen Eintrag aendern; mit p_all = true auch alle folgenden Termine derselben Serie
create or replace function public.coach_upd(p_code text, p_id uuid, p_kind text, p_date date, p_time text, p_title text, p_place text, p_note text, p_all boolean default false) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t text; s uuid; d0 date;
begin
  select team, series, date into t, s, d0 from public.coach_events where id = p_id;
  if t is null or t = 'club' or not public._coach_ok(p_code, t) then raise exception 'invalid code'; end if;
  if coalesce(p_all,false) and s is not null then
    update public.coach_events set kind = p_kind, date = date + (p_date - d0), time = coalesce(p_time,''), title = left(p_title,80),
      place = left(coalesce(p_place,''),100), note = left(coalesce(p_note,''),200)
    where series = s and date >= d0;
  else
    update public.coach_events set kind = p_kind, date = p_date, time = coalesce(p_time,''), title = left(p_title,80),
      place = left(coalesce(p_place,''),100), note = left(coalesce(p_note,''),200)
    where id = p_id;
  end if;
end $$;

grant execute on function
  public.club_news_upd(text,uuid,text,text,text,text),
  public.club_event_upd(text,uuid,date,text,text,text,text,jsonb),
  public.club_sponsor_upd(text,uuid,text,text,text),
  public.coach_upd(text,uuid,text,date,text,text,text,text,boolean) to anon;
notify pgrst, 'reload schema';
