create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 24),
  score integer not null,
  tier_name text,
  tier_color text,
  difficulty text,
  played_at timestamptz not null default now()
);

alter table public.scores enable row level security;

drop policy if exists "public can read scores" on public.scores;
create policy "public can read scores"
on public.scores for select
to anon
using (true);

drop policy if exists "public can submit scores" on public.scores;
create policy "public can submit scores"
on public.scores for insert
to anon
with check (char_length(name) between 1 and 24 and score >= 0);
