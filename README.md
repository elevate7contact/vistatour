# Paseo

> No es un tour. Es un paseo.

SaaS para realtors en Colombia: suben 5 a 7 fotos de un inmueble y obtienen un recorrido virtual inmersivo listo para compartir.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS 3
- Supabase (Auth + Postgres + Storage)
- Claude Sonnet 4.5 (visión) vía `@anthropic-ai/sdk`
- Framer Motion
- Deploy: Vercel

## Setup local

```bash
npm install
cp .env.example .env.local   # rellena las 4 claves
npm run dev
```

Abrir http://localhost:3000.

## Variables de entorno

Definir en `.env.local` (dev) y en Vercel → Settings → Environment Variables (prod):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (solo server, NO `NEXT_PUBLIC_`)
- `ANTHROPIC_API_KEY`

## Migración Supabase (una sola vez)

1. Abre el SQL Editor del proyecto Supabase.
2. Copia y ejecuta el contenido de `supabase/migrations/0001_init.sql`.
3. Esto crea las tablas `tours` y `scenes`, RLS, y el bucket público `tour-photos`.

## Deploy

Push a `main` dispara el deploy en Vercel (https://vistatour.vercel.app). Las env vars deben estar configuradas en Vercel antes de probar en producción.

## Estructura

```
src/
  app/          rutas (landing, login, register, dashboard, tour/[id], api/tours)
  components/   Navbar, HeroAnimated, DropzoneFotos, LoaderEstados, TourViewer
  lib/
    supabase/   client, server, admin (service role)
    anthropic/  analyze (visión + ordenamiento de escenas)
supabase/migrations/0001_init.sql
```
