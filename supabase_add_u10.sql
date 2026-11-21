-- U10 Trainer-Code in Supabase eintragen (SQL Editor -> New query -> Run)
insert into public.coach_codes (team, hash) values
  ('u10','2f060952e94ab8dd876ed0e6900e61dc6bfa0a5d2be011d394b0f8657e9cf407')
on conflict (team) do update set hash = excluded.hash;
