-- =====================================================================
--  Einweihungsparty · Datenbank einrichten
-- =====================================================================
--  So geht's: Supabase → SQL Editor → "New query" → diese GANZE Datei
--  hineinkopieren → "Run". Du kannst sie gefahrlos mehrmals ausführen.
--
--  Die Idee:
--  • Ohne Gast-Code (Login) darf die Webseite gar nichts.
--  • Mit Gast-Code darf sie genau das: Adresse und Snacks lesen, sich
--    anmelden, einen Snack hinzufügen und einen FREIEN Snack übernehmen.
--  • Die Gästeliste – und wer was mitbringt – seht nur ihr im Dashboard.
--  • Löschen oder ändern kann über die Webseite niemand etwas.
--
--  ⚠ Tragt hier KEINE Adresse ein: Diese Datei ist auf GitHub öffentlich.
--    Die Adresse kommt danach im Table Editor in die Tabelle party_info.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Wer ist Gast?
--    Wer mit dem gemeinsamen Gast-Konto eingeloggt ist.
--    Die E-Mail muss genau gleich sein wie in config.js (guestEmail).
-- ---------------------------------------------------------------------
create or replace function public.is_guest()
returns boolean
language sql
stable
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = lower('gast@example.com');
$$;


-- ---------------------------------------------------------------------
-- 2) Tabellen
-- ---------------------------------------------------------------------

-- Infos, die Gäste erst nach dem Login sehen (genau eine Zeile)
--   surprise = optionaler Text für die Karte "Psst … noch etwas"
--              (erste Zeile = Überschrift, leer = keine Karte)
create table if not exists public.party_info (
  id       smallint primary key default 1 check (id = 1),
  address  text not null default 'Adresse folgt',
  note     text,
  surprise text
);

alter table public.party_info add column if not exists surprise text;  -- für bestehende Datenbanken

insert into public.party_info (id) values (1)
on conflict (id) do nothing;

-- Anmeldungen
create table if not exists public.guests (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(btrim(name)) between 1 and 80),
  persons     smallint not null default 1 check (persons between 1 and 10),
  message     text check (char_length(message) <= 500)
);

-- Snacks & Getränke (claimed_by leer = noch frei)
create table if not exists public.snacks (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  claimed_by  text check (char_length(btrim(claimed_by)) between 1 and 80),
  claimed_at  timestamptz,
  constraint snacks_claim_complete check ((claimed_by is null) = (claimed_at is null))
);


-- ---------------------------------------------------------------------
-- 3) Rechte: erst alles wegnehmen, dann gezielt erlauben
--    anon          = nicht eingeloggt  → bekommt gar nichts
--    authenticated = eingeloggt        → nur diese Spalten:
-- ---------------------------------------------------------------------
revoke all on table public.party_info, public.guests, public.snacks from anon, authenticated;

grant select (address, note, surprise) on public.party_info to authenticated; -- Adresse & Überraschung lesen
grant insert (name, persons, message) on public.guests     to authenticated;  -- sich anmelden, NICHT lesen
grant select (id, name, claimed_at)   on public.snacks     to authenticated;  -- Snacks lesen, OHNE Namen


-- ---------------------------------------------------------------------
-- 4) Row Level Security: zusätzlich wird jede Zeile geprüft
-- ---------------------------------------------------------------------
alter table public.party_info enable row level security;
alter table public.guests     enable row level security;
alter table public.snacks     enable row level security;

drop policy if exists "Gäste sehen die Party-Infos" on public.party_info;
create policy "Gäste sehen die Party-Infos"
  on public.party_info for select
  to authenticated
  using ((select public.is_guest()));

drop policy if exists "Gäste dürfen sich anmelden" on public.guests;
create policy "Gäste dürfen sich anmelden"
  on public.guests for insert
  to authenticated
  with check ((select public.is_guest()));

drop policy if exists "Gäste sehen die Snack-Liste" on public.snacks;
create policy "Gäste sehen die Snack-Liste"
  on public.snacks for select
  to authenticated
  using ((select public.is_guest()));

-- Bewusst keine weiteren Regeln: kein Lesen der Gäste, kein Ändern,
-- kein Löschen. Snacks hinzufügen/übernehmen geht nur über die zwei
-- Funktionen unten, die alles selbst prüfen.


-- ---------------------------------------------------------------------
-- 5) Snack übernehmen – wer zuerst kommt, bekommt ihn
-- ---------------------------------------------------------------------
create or replace function public.claim_snack(snack_id bigint, guest_name text)
returns boolean                -- true = gehört jetzt dir, false = war schon weg
language plpgsql
security definer               -- darf die Tabelle ändern, prüft aber selbst:
set search_path = ''
as $$
begin
  if not public.is_guest() then
    raise exception 'Bitte zuerst einloggen.';
  end if;
  if coalesce(btrim(guest_name), '') = '' then
    raise exception 'Bitte gib deinen Namen ein.';
  end if;

  -- Ein einziger Schritt: nur vergeben, wenn der Snack noch frei ist.
  -- Klicken zwei gleichzeitig, wartet der Zweite einen Augenblick,
  -- sieht dann "schon vergeben" und bekommt false zurück.
  update public.snacks
     set claimed_by = btrim(guest_name),
         claimed_at = now()
   where id = snack_id
     and claimed_by is null;

  return found;
end;
$$;


-- ---------------------------------------------------------------------
-- 6) Eigenen Snack eintragen ("Ich bringe … mit") – gehört direkt dir
-- ---------------------------------------------------------------------
create or replace function public.add_snack(snack_name text, guest_name text)
returns bigint                 -- die Nummer des neuen Snacks
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id bigint;
begin
  if not public.is_guest() then
    raise exception 'Bitte zuerst einloggen.';
  end if;
  if coalesce(btrim(snack_name), '') = '' or coalesce(btrim(guest_name), '') = '' then
    raise exception 'Snack und Name dürfen nicht leer sein.';
  end if;

  insert into public.snacks (name, claimed_by, claimed_at)
  values (btrim(snack_name), btrim(guest_name), now())
  returning id into new_id;

  return new_id;
end;
$$;

-- Nur eingeloggte Gäste dürfen die zwei Funktionen aufrufen
revoke all on function public.claim_snack(bigint, text) from public, anon;
revoke all on function public.add_snack(text, text)     from public, anon;
grant execute on function public.claim_snack(bigint, text) to authenticated;
grant execute on function public.add_snack(text, text)     to authenticated;


-- ---------------------------------------------------------------------
-- 7) "Wachhalter": tut nichts, hält das Gratis-Projekt aber aktiv.
--    Wird von .github/workflows/wachhalten.yml alle 3 Tage aufgerufen.
-- ---------------------------------------------------------------------
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$ select 'pong'::text $$;

grant execute on function public.ping() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 8) Realtime: Änderungen an der Snack-Liste sofort an alle senden
--    (die Spalte claimed_by wird dabei nicht mitgeschickt – siehe 3)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'snacks'
  ) then
    alter publication supabase_realtime add table public.snacks;
  end if;
end
$$;


-- ---------------------------------------------------------------------
-- 9) Start-Snacks (nur beim allerersten Mal, solange die Liste leer ist)
-- ---------------------------------------------------------------------
insert into public.snacks (name)
select s.name
from (values
  ('Chips'),
  ('Lebkuchen'),
  ('Mandarinen'),
  ('Käse & Cracker'),
  ('Guetzli')
) as s(name)
where not exists (select 1 from public.snacks);
