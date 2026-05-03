import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSb } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzePhotos, SceneAnalysis } from '@/lib/anthropic/analyze';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'tour-photos';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 25 * 1024 * 1024;   // panoramas equirectangulares pesan más

// Aspect ratio mínimo para considerar una foto como panorama equirectangular
// (modo Pano del iPhone/Android genera 2:1 o más; cámaras 360 pro = 2:1 exacto).
const PANORAMA_MIN_ASPECT = 1.85;
// Resolución mínima recomendada para calidad realtor premium.
const PANORAMA_MIN_WIDTH = 3072;

function extFromType(t: string): string {
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  return 'bin';
}

/**
 * Parser inline de dimensiones para JPG/PNG/WebP — sin dependencia externa.
 * Lee solo los headers necesarios. ~30 líneas, suficiente para nuestro caso.
 */
function getImageDimensions(buf: Buffer): { width: number; height: number } | null {
  // PNG: bytes 16-23 tras "PNG\r\n\x1a\n" header
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return {
      width:  buf.readUInt32BE(16),
      height: buf.readUInt32BE(20),
    };
  }
  // JPG: buscar SOF marker (0xFFC0-0xFFCF excepto C4, C8, CC)
  if (buf[0] === 0xFF && buf[1] === 0xD8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xFF) { i++; continue; }
      const marker = buf[i + 1];
      if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
        return {
          height: buf.readUInt16BE(i + 5),
          width:  buf.readUInt16BE(i + 7),
        };
      }
      const segLen = buf.readUInt16BE(i + 2);
      i += 2 + segLen;
    }
  }
  // WebP VP8/VP8L/VP8X (simplificado para VP8X que es lo común en panoramas)
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') {
      const w = (buf.readUIntLE(24, 3) + 1);
      const h = (buf.readUIntLE(27, 3) + 1);
      return { width: w, height: h };
    }
    if (chunk === 'VP8 ') {
      // VP8 lossy: dimensions in start of frame data
      const w = buf.readUInt16LE(26) & 0x3FFF;
      const h = buf.readUInt16LE(28) & 0x3FFF;
      return { width: w, height: h };
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  const supabase = createServerSb();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: 'No has iniciado sesión.' }, { status: 401 });
  }
  const userId = userRes.user.id;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Datos inválidos.' }, { status: 400 });
  }

  const nombre = (formData.get('nombre') as string | null)?.trim();
  if (!nombre) {
    return NextResponse.json({ error: 'El paseo necesita un nombre.' }, { status: 400 });
  }

  // Metadata opcional del inmueble (para realtors premium)
  const metadata: Record<string, string | number> = {};
  const metaFields = ['precio', 'ubicacion', 'area_m2', 'habitaciones', 'banos',
                      'realtor_nombre', 'realtor_telefono', 'realtor_email', 'realtor_logo_url'];
  for (const f of metaFields) {
    const v = formData.get(f);
    if (typeof v === 'string' && v.trim()) {
      metadata[f] = (f === 'area_m2' || f === 'habitaciones' || f === 'banos')
        ? Number(v) || 0
        : v.trim();
    }
  }

  const rawFiles = formData.getAll('files').filter((v): v is File => v instanceof File);
  if (rawFiles.length < 1 || rawFiles.length > 7) {
    return NextResponse.json({ error: 'Sube entre 1 y 7 fotos.' }, { status: 400 });
  }
  for (const f of rawFiles) {
    if (!ALLOWED.includes(f.type)) {
      return NextResponse.json(
        { error: 'Solo se permiten JPG, PNG o WEBP.' },
        { status: 400 }
      );
    }
    if (f.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'Cada foto debe pesar menos de 10 MB.' },
        { status: 400 }
      );
    }
  }

  const admin = createAdminClient();

  // 1) Create tour row — defensivo si migración 0003 (columna metadata) no corrió
  const baseInsert: any = { user_id: userId, nombre, status: 'processing' };
  const insertWithMeta = { ...baseInsert, metadata: Object.keys(metadata).length ? metadata : {} };

  let { data: tour, error: tourErr } = await admin
    .from('tours')
    .insert(insertWithMeta)
    .select('id')
    .single();

  // Si Postgres O Supabase-js rechazan por columna 'metadata' inexistente → reintenta sin ella.
  // Cubre AMBOS formatos de error:
  //  - Postgres directo: "column \"metadata\" of relation \"tours\" does not exist"
  //  - Supabase-js schema cache: "Could not find the 'metadata' column of 'tours' in the schema cache"
  const metadataMissing =
    tourErr && /metadata/i.test(tourErr.message) &&
    /(does not exist|schema cache|could not find)/i.test(tourErr.message);

  if (metadataMissing) {
    console.warn('[tours/POST] columna metadata no existe — reintentando sin ella. Correr supabase/migrations/0003_metadata.sql');
    const retry = await admin.from('tours').insert(baseInsert).select('id').single();
    tour = retry.data;
    tourErr = retry.error;
  }

  if (tourErr || !tour) {
    return NextResponse.json(
      { error: `No pudimos crear el paseo: ${tourErr?.message ?? 'error desconocido'}` },
      { status: 500 }
    );
  }
  const tourId = tour.id as string;

  try {
    // 2) Upload files + DETECTAR si cada foto es panorama equirectangular nativo
    const urls: string[] = [];
    const fileMeta: Array<{ isNativePanorama: boolean; width: number; height: number }> = [];

    for (let i = 0; i < rawFiles.length; i++) {
      const f = rawFiles[i];
      const ext = extFromType(f.type);
      const path = `${userId}/${tourId}/${i}-${crypto.randomUUID()}.${ext}`;
      const buf = Buffer.from(await f.arrayBuffer());

      // ── Detección de panorama nativo ─────────────────────────────────
      const dims = getImageDimensions(buf);
      const isNativePanorama = !!(dims && (dims.width / dims.height) >= PANORAMA_MIN_ASPECT);

      // Validación calidad premium: si es panorama nativo, exigir resolución mínima
      // para que apartamentos de alta gama no salgan pixelados.
      if (isNativePanorama && dims && dims.width < PANORAMA_MIN_WIDTH) {
        throw new Error(
          `La foto ${i + 1} parece un panorama (${dims.width}×${dims.height}) ` +
          `pero la resolución es baja. Para calidad realtor premium subila al menos ` +
          `en ${PANORAMA_MIN_WIDTH}px de ancho.`
        );
      }
      // ─────────────────────────────────────────────────────────────────

      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: f.type, upsert: false });
      if (upErr) throw new Error(`Error subiendo foto ${i + 1}: ${upErr.message}`);
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      urls.push(pub.publicUrl);
      fileMeta.push({
        isNativePanorama,
        width: dims?.width ?? 0,
        height: dims?.height ?? 0,
      });
    }

    // 3) Claude analysis (sigue corriendo para tipo_espacio + hotspots,
    //    aunque la foto sea panorama nativo)
    const analysis = (await analyzePhotos(urls)) as Array<SceneAnalysis & { foto_original?: number }>;

    // 4) Build scene rows. Si la foto es panorama nativo: panorama_url = image_url
    //    directamente y panorama_status = 'complete'. Bypass total de Skybox.
    const rows = analysis.map((s, i) => {
      const srcIdx =
        typeof s.foto_original === 'number' && s.foto_original >= 0 && s.foto_original < urls.length
          ? s.foto_original
          : i;
      const meta = fileMeta[srcIdx];
      const isNative = meta?.isNativePanorama ?? false;
      return {
        tour_id: tourId,
        orden: s.orden,
        image_url: urls[srcIdx],
        tipo_espacio: s.tipo_espacio,
        paleta_hex: s.paleta_hex,
        direccion_siguiente: s.direccion_siguiente,
        similitud_siguiente: s.similitud_siguiente,
        // Para panoramas nativos NO necesitamos prompt Skybox — la foto YA es 360°.
        skybox_prompt: isNative ? null : s.descripcion_fiel,
        // Panorama nativo: panorama_url = image_url, status = complete (no pasa por Skybox).
        // Foto plana: pendiente, Skybox la procesa después.
        panorama_url: isNative ? urls[srcIdx] : null,
        panorama_status: isNative ? 'complete' : 'pending',
      };
    });

    const { error: scErr } = await admin.from('scenes').insert(rows);
    if (scErr) throw new Error(`Error guardando escenas: ${scErr.message}`);

    await admin.from('tours').update({ status: 'ready' }).eq('id', tourId);

    // 5) Disparar generación de panoramas Skybox en background (fire-and-forget).
    //    No bloqueamos la respuesta — el cliente vuelve a /tour/{id} y ahí
    //    ve el progreso. Los panoramas se generan en paralelo (uno por scene).
    const origin = req.headers.get('origin') || `https://${req.headers.get('host')}`;
    fetch(`${origin}/api/tours/${tourId}/generate-panoramas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch((e) => {
      console.error('[tours/POST] auto-trigger panoramas falló:', e);
    });

    return NextResponse.json({ id: tourId }, { status: 201 });
  } catch (e) {
    await admin.from('tours').update({ status: 'failed' }).eq('id', tourId);
    const message = e instanceof Error ? e.message : 'Error inesperado.';
    return NextResponse.json(
      { error: `No pudimos armar el paseo: ${message}` },
      { status: 500 }
    );
  }
}
