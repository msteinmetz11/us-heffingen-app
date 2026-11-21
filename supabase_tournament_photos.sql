-- US Heffingen: Turnier-Fotos fuer Coach (Supabase: SQL Editor -> New query -> einfuegen -> Run). Einmal ausfuehren.
-- Bewusst ohne $$-Quoting, ohne plpgsql und ohne SELECT INTO (der Dashboard-Editor verschluckt sich daran).
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
language sql security definer set search_path = public, extensions
as 'insert into public.coach_photos(event_id, data) select p_event, p_data from public.coach_events e where e.id = p_event and public._coach_ok(p_code, e.team) and (select count(*) from public.coach_photos x where x.event_id = p_event) < 2';

create or replace function public.coach_del_photo(p_code text, p_id uuid) returns void
language sql security definer set search_path = public, extensions
as 'delete from public.coach_photos p using public.coach_events e where p.id = p_id and e.id = p.event_id and public._coach_ok(p_code, e.team)';

grant execute on function public.coach_add_photo(text,uuid,text), public.coach_del_photo(text,uuid) to anon;
