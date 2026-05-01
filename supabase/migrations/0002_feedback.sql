-- Migración 0002 — Captura de feedback de realtors sobre los tours.
-- Ejecutar UNA VEZ en Supabase SQL Editor.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid references public.tours(id) on delete set null,
  rating text not null check (rating in ('up','down','meh')),
  would_pay text check (would_pay in ('yes','no','maybe') or would_pay is null),
  comment text,
  user_agent text,
  referrer text,
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_tour on public.feedback(tour_id);
create index if not exists idx_feedback_created on public.feedback(created_at desc);

-- RLS: el endpoint usa service_role, no necesita policies abiertas.
alter table public.feedback enable row level security;
