-- Migración 0003 — Branding del inmueble + información comercial.
-- Ejecutar UNA VEZ en Supabase SQL Editor.

-- Campo flexible JSONB en tours para guardar:
--   precio, ubicacion, area_m2, habitaciones, banos,
--   realtor_nombre, realtor_telefono, realtor_email, realtor_logo_url
alter table public.tours
  add column if not exists metadata jsonb default '{}'::jsonb;

create index if not exists idx_tours_metadata on public.tours using gin (metadata);
