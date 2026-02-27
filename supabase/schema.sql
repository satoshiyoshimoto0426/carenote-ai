-- CareNote AI — Supabase Schema
-- Run this in the Supabase SQL Editor

-- Evaluations table
create table if not exists evaluations (
  id          uuid primary key default gen_random_uuid(),
  user_id     text not null,          -- Clerk user ID (e.g. "user_xxxx")
  client_name text not null default '',
  file_name   text not null default '',
  total_score integer not null,
  result      jsonb not null,         -- Full EvaluationResult JSON
  created_at  timestamptz not null default now()
);

-- Index for fast per-user lookups
create index if not exists evaluations_user_id_idx
  on evaluations (user_id, created_at desc);

-- Row Level Security
alter table evaluations enable row level security;

-- Policy: users can only read/write their own rows
-- (Service role key bypasses RLS — used for all server-side writes)
create policy "Users can read own evaluations"
  on evaluations for select
  using (user_id = auth.uid()::text);

create policy "Users can insert own evaluations"
  on evaluations for insert
  with check (user_id = auth.uid()::text);
