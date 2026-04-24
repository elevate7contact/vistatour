import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSb } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analyzePhotos, SceneAnalysis } from '@/lib/anthropic/analyze';

export const runtime = 'nodejs';
export const maxDuration = 60;

const BUCKET = 'tour-photos';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

function extFromType(t: string): string {
  if (t === 'image/jpeg') return 'jpg';
  if (t === 'image/png') return 'png';
  if (t === 'image/webp') return 'webp';
  return 'bin';
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
  const rawFiles = formData.getAll('files').filter((v): v is File => v instanceof File);
  if (rawFiles.length < 5 || rawFiles.length > 7) {
    return NextResponse.json({ error: 'Sube entre 5 y 7 fotos.' }, { status: 400 });
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

  // 1) Create tour row
  const { data: tour, error: tourErr } = await admin
    .from('tours')
    .insert({ user_id: userId, nombre, status: 'processing' })
    .select('id')
    .single();

  if (tourErr || !tour) {
    return NextResponse.json(
      { error: 'No pudimos crear el paseo. Intenta de nuevo.' },
      { status: 500 }
    );
  }
  const tourId = tour.id as string;

  try {
    // 2) Upload files
    const urls: string[] = [];
    for (let i = 0; i < rawFiles.length; i++) {
      const f = rawFiles[i];
      const ext = extFromType(f.type);
      const path = `${userId}/${tourId}/${i}-${crypto.randomUUID()}.${ext}`;
      const buf = Buffer.from(await f.arrayBuffer());
      const { error: upErr } = await admin.storage
        .from(BUCKET)
        .upload(path, buf, { contentType: f.type, upsert: false });
      if (upErr) throw new Error(`Error subiendo foto ${i + 1}: ${upErr.message}`);
      const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
      urls.push(pub.publicUrl);
    }

    // 3) Claude analysis
    const analysis = (await analyzePhotos(urls)) as Array<SceneAnalysis & { foto_original?: number }>;

    // 4) Build scene rows using foto_original mapping (fallback to identity).
    const rows = analysis.map((s, i) => {
      const srcIdx =
        typeof s.foto_original === 'number' && s.foto_original >= 0 && s.foto_original < urls.length
          ? s.foto_original
          : i;
      return {
        tour_id: tourId,
        orden: s.orden,
        image_url: urls[srcIdx],
        tipo_espacio: s.tipo_espacio,
        paleta_hex: s.paleta_hex,
        direccion_siguiente: s.direccion_siguiente,
        similitud_siguiente: s.similitud_siguiente
      };
    });

    const { error: scErr } = await admin.from('scenes').insert(rows);
    if (scErr) throw new Error(`Error guardando escenas: ${scErr.message}`);

    await admin.from('tours').update({ status: 'ready' }).eq('id', tourId);
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
