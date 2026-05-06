# VistaTour — Setup operativo

Para que cualquier persona del equipo (o vos en 6 meses) pueda levantar
este proyecto sin reconstruir el contexto desde cero.

---

## 1. Variables de entorno (Vercel + .env.local)

| Variable | Dónde sacarla | Pública? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Dashboard → Project Settings → API | Sí |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase Dashboard → Project Settings → API | Sí |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` | **NO — secret** |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys | **NO — secret** |
| `ADMIN_TOKEN` | Generar uno random (ej: `openssl rand -hex 32`) | **NO — secret** |

En Vercel: Project → Settings → Environment Variables → agregar las 5
para Production, Preview y Development.

En local: copiar a `.env.local` (ya está en `.gitignore`).

> **Nota:** `SKYBOX_API_KEY` ya no se usa. Si quedó en Vercel, podés borrarla.

---

## 2. Setup de Supabase (paso obligatorio para que el login funcione)

### 2.1 Apagar email confirmation (MVP)

El free-tier de Supabase tiene rate-limit de **2-3 emails/hora**. Si no lo
apagás, los registros se traban silenciosamente.

1. Supabase Dashboard → tu proyecto
2. Sidebar **Authentication** → **Sign In / Providers** → **Email**
3. Toggle OFF **"Confirm email"**
4. Save

> Cuando tengas SMTP propio (Resend, SendGrid), reactivás esto y configurás el SMTP en
> **Project Settings** → **Auth** → **SMTP Settings**.

### 2.2 Correr migraciones

1. Supabase Dashboard → **SQL Editor**
2. Pegar contenido de `supabase/migrations/0001_init.sql`
3. Run

Esto crea las tablas `tours`, `scenes` y el bucket `tour-photos`.

### 2.3 Storage bucket público

1. Supabase Dashboard → **Storage** → bucket `tour-photos`
2. Settings → **Public bucket** → ON
3. (Esto permite que las URLs de fotos sean leídas por el viewer)

### 2.4 Limpiar cuentas zombie (si existen)

Si vos o algún tester intentó registrarse antes de hacer el paso 2.1:

```sql
-- Confirmar todas las cuentas existentes
UPDATE auth.users
SET confirmed_at = NOW(), email_confirmed_at = NOW()
WHERE confirmed_at IS NULL;
```

O usar el endpoint `/api/admin/confirm-user` (ver sección 5).

---

## 3. Pipeline único de generación 360° (post-Skybox)

Skybox AI fue removido. Todo el procesamiento de panoramas pasa al cliente,
con OpenCV.js. Cero dependencias externas, cero costo por escena.

```
Cliente abre /dashboard/nuevo-tour
      ↓
Modo recorrido (default ON):
  - Realtor sube N fotos por cuarto desde un punto fijo, rotando
    (4/6/8 fotos según rotación elegida)
  - OpenCV.js client-side une cada grupo en un panorama equirectangular
  - Cada panorama tiene aspect ratio ≥ 1.85 (panorama nativo)
      ↓
Modo legacy (toggle OFF):
  - Realtor sube panorámicas ya capturadas (iPhone Pano mode, Insta360, etc.)
      ↓
POST /api/tours
      ↓
1. Verifica que cada foto sea panorámica (aspect ≥ 1.85)
   Si no, rechaza con error claro
2. Sube fotos a Supabase Storage
3. Claude vision (analyze.ts) genera tipo_espacio + paleta_hex + hotspots
4. Inserta scenes con panorama_url = image_url, status = 'complete'
      ↓
Cliente vuelve a /tour/[id]
      ↓
Tour360Navegable.tsx renderiza la esfera 360° con la foto real
  + hotspots editables si es el dueño
```

### Por qué stitching client-side

| | Skybox AI (removido) | OpenCV stitching (actual) |
|---|---|---|
| Costo por escena | $0.18–0.50 USD | $0 |
| Dependencia API | Blockade Labs | Cero |
| Fidelidad al espacio real | ~60% (genera 270°) | 100% (foto real) |
| Latencia | 30–60s por escena | 5–15s en navegador del cliente |
| Falla externa | Posible | Imposible |

---

## 4. Endpoint admin — confirmar cuentas zombie

```bash
curl -X POST https://vistatour.vercel.app/api/admin/confirm-user \
  -H "x-admin-token: <ADMIN_TOKEN del .env>" \
  -H "Content-Type: application/json" \
  -d '{"email":"juan@ejemplo.com"}'
```

Respuestas:
- `200 {ok:true, confirmed:true}` → cuenta confirmada, ya puede loguear
- `200 {ok:true, already_confirmed:true}` → ya estaba confirmada
- `404` → no existe ese email
- `401` → token mal
- `503` → ADMIN_TOKEN no configurado en Vercel

---

## 5. Deploy

Push a `main` → Vercel auto-deploya. Tarda ~2 min.

Para verificar build local antes de pushear:

```bash
npm install
npm run build
```

Si pasa local, pasa en Vercel.

---

## 6. Stack y versiones

- Next.js 14.2.18 (App Router)
- React 18
- Supabase JS + @supabase/ssr
- Three.js (lazy-loaded en viewer)
- @techstark/opencv-js (lazy-loaded en /nuevo-tour)
- Tailwind CSS
- TypeScript estricto
- Claude Sonnet vision para análisis de escena (tipo_espacio, paleta, hotspots)

---

## 7. Página de test independiente

`/test-stitch` — utilidad standalone para probar stitching de OpenCV.js
sin pasar por todo el flujo de upload/auth. Útil para debug rápido.
