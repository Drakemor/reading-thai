-- Thai Reading Quest — Supabase schema for Google sign-in + progress sync
-- Run in Supabase SQL Editor after creating a project.

-- Progress blob per user (same shape as localStorage state)
create table if not exists public.user_progress (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_progress enable row level security;

create policy "Users read own progress"
  on public.user_progress for select
  using (auth.uid() = user_id);

create policy "Users insert own progress"
  on public.user_progress for insert
  with check (auth.uid() = user_id);

create policy "Users update own progress"
  on public.user_progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists user_progress_updated_at_idx
  on public.user_progress (updated_at desc);
