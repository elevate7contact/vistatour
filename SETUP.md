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
| `SKYBOX_API_KEY` | https://skybox.blockadelabs.com → API | **NO — secret** |
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys | **NO — secret** |
| `ADMIN_TOKEN` | Generar uno random (ej: `openssl rand -hex 32`) | **NO — secret** |

En Vercel: Project → Settings → Environment Variables → agregar las 6
para Production, Preview y Development.

En local: copiar a `.env.local` (ya está en `.gitignore`).

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
3. (Esto permite que las URLs de fotos sean leídas por Skybox y por el viewer)

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

## 3. Pipeline único de generación 360°

Solo existe **un** camino, documentado:

```
Cliente sube fotos
      ↓
POST /api/tours
      ↓
1. Sube fotos a Supabase Storage
2. Llama Claude vision → analyze.ts → genera descripcion_fiel
3. Inserta scenes con skybox_prompt = descripcion_fiel
4. Auto-trigger fire-and-forget → POST /api/tours/[id]/generate-panoramas
      ↓
generate-panoramas/route.ts
      ↓
Para cada scene → Skybox API con SKYBOX_FIDELITY_CONFIG
  - enhance_prompt=false (no inventa)
  - prompt_strength=0.3 (mínima creatividad)
  - control_model=remix (foto del cliente como seed visual)
  - negative_text agresivo
      ↓
Polling vía GET /api/tours/[id]/generate-panoramas
      ↓
panorama_url guardado en scene
      ↓
Cliente abre /tour/[id]
      ↓
Tour360Navegable.tsx
  - Esfera con panorama IA (relleno lateral)
  - Plano frontal con foto ORIGINAL (fidelidad 100%)
```

> **No hay otro pipeline.** Si alguna vez ves código que llama a
> `/api/skybox/generate` o usa `TourViewer` o `Skybox360Viewer`, es
> legacy y hay que borrarlo.

---

## 4. Fidelidad de imagen — las 3 capas que la garantizan

Si las imágenes vuelven a salir distintas, debugá en este orden:

1. **Claude vision (`lib/anthropic/analyze.ts`)** — ¿está generando
   `descripcion_fiel` correctamente? Logs en /api/tours POST.
2. **Skybox params (`SKYBOX_FIDELITY_CONFIG` en generate-panoramas)** —
   ¿alguien activó `enhance_prompt`? ¿bajó el negative_text?
3. **Foto-ancla en viewer (`Tour360Navegable.tsx`)** — ¿está renderizando
   el plano frontal? Inspect el DOM, debería ver el mesh con la imagen original.

Si las 3 capas están OK y aún hay drift, probablemente Skybox cambió su
modelo. Tunear `SKYBOX_FIDELITY_CONFIG`.

---

## 5. Endpoint admin — confirmar cuentas zombie

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

## 6. Deploy

Push a `main` → Vercel auto-deploya. Tarda ~2 min.

Para verificar build local antes de pushear:

```bash
npm install
npm run build
```

Si pasa local, pasa en Vercel.

---

## 7. Stack y versiones

- Next.js 14.2.18 (App Router)
- React 18
- Supabase JS + @supabase/ssr
- Three.js (lazy-loaded)
- Tailwind CSS
- TypeScript estricto
- Skybox AI (Blockade Labs) — modelo realista, style 67
- Claude Sonnet 4 vision para analyze
