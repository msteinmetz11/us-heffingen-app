-- US Heffingen: Turnier-Fotos fuer Coach (Supabase: SQL Editor -> New query -> einfuegen -> Run). Einmal ausfuehren.
create table if not exists public.coach_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.coach_events(id) on delete cascade,
  data text not null check (char_length(data) between 100 and 600000),
  created_at timestamptz not null default now()
);
alter table public.coach_photos enable row level security;
drop policy if exists "alle lesen" on public.coach_photos;
create policy "alle lesen" on public.coach_photos for select to anon using (true);
revoke all on public.coach_photos from anon, authenticated;
grant select on public.coach_photos to anon;

create or replace function public.coach_add_photo(p_code text, p_event uuid, p_data text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  select team into t from public.coach_events where id = p_event;
  if t is null or not public._coach_ok(p_code, t) then raise exception 'invalid code'; end if;
  if (select count(*) from public.coach_photos where event_id = p_event) >= 2 then raise exception 'max 2 photos'; end if;
  insert into public.coach_photos(event_id, data) values (p_event, p_data);
end $$;

create or replace function public.coach_del_photo(p_code text, p_id uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare t text;
begin
  select e.team into t from public.coach_photos p join public.coach_events e on e.id = p.event_id where p.id = p_id;
  if t is null or not public._coach_ok(p_code, t) then raise exception 'invalid code'; end if;
  delete from public.coach_photos where id = p_id;
end $$;

grant execute on function public.coach_add_photo(text,uuid,text), public.coach_del_photo(text,uuid) to anon;
