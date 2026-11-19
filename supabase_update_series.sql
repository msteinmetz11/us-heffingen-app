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
