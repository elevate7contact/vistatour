-- Paseo · migración inicial
-- Ejecutar UNA VEZ en Supabase SQL Editor.

create extension if not exists "pgcrypto";

-- ============ TABLAS ============
create table if not exists public.tours (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  status text not null default 'processing' check (status in ('processing','ready','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  tour_id uuid not null references public.tours(id) on delete cascade,
  orden int not null,
  image_url text not null,
  tipo_espacio text,
  paleta_hex jsonb,
  direccion_siguiente text check (direccion_siguiente in ('adelante','izquierda','derecha','arriba','abajo') or direccion_siguiente is null),
  similitud_siguiente text check (similitud_siguiente in ('alta','media','baja') or similitud_siguiente is null),
  created_at timestamptz not null default now(),
  unique (tour_id, orden)
);

create index if not exists scenes_tour_orden_idx on public.scenes(tour_id, orden);
create index if not exists tours_user_idx on public.tours(user_id);

-- ============ RLS ============
alter table public.tours enable row level security;
alter table public.scenes enable row level security;

-- tours
drop policy if exists "tours_public_select" on public.tours;
create policy "tours_public_select" on public.tours for select using (true);

drop policy if exists "tours_owner_insert" on public.tours;
create policy "tours_owner_insert" on public.tours for insert with check (auth.uid() = user_id);

drop policy if exists "tours_owner_update" on public.tours;
create policy "tours_owner_update" on public.tours for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "tours_owner_delete" on public.tours;
create policy "tours_owner_delete" on public.tours for delete using (auth.uid() = user_id);

-- scenes
drop policy if exists "scenes_public_select" on public.scenes;
create policy "scenes_public_select" on public.scenes for select using (true);

drop policy if exists "scenes_owner_insert" on public.scenes;
create policy "scenes_owner_insert" on public.scenes for insert
  with check (exists (select 1 from public.tours t where t.id = tour_id and t.user_id = auth.uid()));

drop policy if exists "scenes_owner_update" on public.scenes;
create policy "scenes_owner_update" on public.scenes for update
  using (exists (select 1 from public.tours t where t.id = tour_id and t.user_id = auth.uid()));

drop policy if exists "scenes_owner_delete" on public.scenes;
create policy "scenes_owner_delete" on public.scenes for delete
  using (exists (select 1 from public.tours t where t.id = tour_id and t.user_id = auth.uid()));

-- ============ STORAGE ============
insert into storage.buckets (id, name, public)
values ('tour-photos', 'tour-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "tour_photos_public_read" on storage.objects;
create policy "tour_photos_public_read" on storage.objects for select
  using (bucket_id = 'tour-photos');

drop policy if exists "tour_photos_user_upload" on storage.objects;
create policy "tour_photos_user_upload" on storage.objects for insert
  with check (
    bucket_id = 'tour-photos'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tour_photos_user_update" on storage.objects;
create policy "tour_photos_user_update" on storage.objects for update
  using (
    bucket_id = 'tour-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "tour_photos_user_delete" on storage.objects;
create policy "tour_photos_user_delete" on storage.objects for delete
  using (
    bucket_id = 'tour-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
