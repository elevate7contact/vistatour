/**
 * /api/tours/[id]/generate-panoramas
 * ─────────────────────────────────────────────────────────────────
 * POST → lanza la generación de panoramas 360° para todas las escenas
 *        de un tour en paralelo. Marca cada scene con job_id + status='generating'.
 *
 * GET  → consulta el progreso de generación de un tour
 *        Para cada scene en 'generating', hace polling a Skybox.
 *        Cuando completa, descarga panorama y guarda en Supabase Storage,
 *        actualiza scene.panorama_url + status='complete'.
 *
 * Idempotente: si una scene ya está 'complete', la salta.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const SKYBOX_BASE = 'https://backend.blockadelabs.com/api/v1';

function skyboxKey() {
  const k = process.env.SKYBOX_API_KEY;
  if (!k) throw new Error('SKYBOX_API_KEY no configurada');
  return k;
}

const ROOM_PROMPTS: Record<string, string> = {
  sala: 'modern bright living room interior, comfortable sofa, large windows with natural light, wooden floor, real estate photography, equirectangular 360 panorama',
  salon: 'modern bright living room interior, comfortable sofa, large windows with natural light, wooden floor, real estate photography, equirectangular 360 panorama',
  living: 'modern bright living room interior, comfortable sofa, large windows with natural light, wooden floor, real estate photography, equirectangular 360 panorama',
  cocina: 'modern white kitchen interior, marble countertops, stainless steel appliances, pendant lights, large window, real estate photography, equirectangular 360 panorama',
  comedor: 'elegant dining room interior, wooden table for six, neutral palette, large windows, soft natural light, real estate photography, equirectangular 360 panorama',
  dormitorio: 'modern bedroom interior, queen bed with white linen, soft natural light, neutral colors, wooden floor, real estate photography, equirectangular 360 panorama',
  habitacion: 'modern bedroom interior, queen bed with white linen, soft natural light, neutral colors, wooden floor, real estate photography, equirectangular 360 panorama',
  cuarto: 'modern bedroom interior, queen bed with white linen, soft natural light, neutral colors, wooden floor, real estate photography, equirectangular 360 panorama',
  bano: 'modern bathroom interior, white marble, glass shower, neutral palette, soft daylight, real estate photography, equirectangular 360 panorama',
  estudio: 'home office interior, wooden desk, ergonomic chair, bookshelf, large window with natural light, real estate photography, equirectangular 360 panorama',
  balcon: 'apartment balcony exterior, city view, plants, modern railing, golden hour light, real estate photography, equirectangular 360 panorama',
  terraza: 'open rooftop terrace, plants, lounge furniture, city skyline, sunset light, real estate photography, equirectangular 360 panorama',
};

function buildPrompt(tipoEspacio: string | null, paleta: any): string {
  const key = (tipoEspacio ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  const palettePart = Array.isArray(paleta) && paleta.length
    ? `, color palette ${paleta.slice(0, 3).join(', ')}`
    : '';
  for (const k of Object.keys(ROOM_PROMPTS)) {
    if (key.includes(k)) {
      return `${ROOM_PROMPTS[k]}${palettePart}`;
    }
  }
  return `modern residential interior, neutral palette, natural light, real estate photography${palettePart}, equirectangular 360 panorama`;
}

async function skyboxStartJob(prompt: string, controlImageUrl: string | null): Promise<number | string> {
  const fd = new FormData();
  fd.append('prompt', prompt);
  fd.append('skybox_style_id', '67');
  fd.append('enhance_prompt', 'true');

  if (controlImageUrl) {
    try {
      const imgRes = await fetch(controlImageUrl);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        fd.append('control_image', blob, 'reference.jpg');
      }
    } catch (e) {
      // sin imagen de control — continúa solo con prompt
    }
  }

  const r = await fetch(`${SKYBOX_BASE}/skybox`, {
    method: 'POST',
    headers: { 'x-api-key': skyboxKey() },
    body: fd,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Skybox POST ${r.status}: ${txt.slice(0, 200)}`);
  }
  const data = await r.json();
  return data.id;
}

async function skyboxJobStatus(jobId: string): Promise<{ status: string; fileUrl?: string; error?: string }> {
  const r = await fetch(`${SKYBOX_BASE}/imagine/requests/${jobId}`, {
    headers: { 'x-api-key': skyboxKey() },
  });
  if (!r.ok) return { status: 'unknown' };
  const data = await r.json();
  const reqInfo = data.request ?? data;
  const status = reqInfo.status ?? 'pending';

  if (status === 'complete') {
    return { status: 'complete', fileUrl: reqInfo.file_url || reqInfo.thumb_url };
  }
  if (status === 'error' || status === 'abort') {
    return { status: 'error', error: reqInfo.error_message ?? status };
  }
  return { status: 'pending' };
}

/**
 * POST: dispara la generación de todos los panoramas de un tour.
 */
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supa = createAdminClient();
    const { data: scenes, error: errSc } = await supa
      .from('scenes')
      .select('id, image_url, tipo_espacio, paleta_hex, panorama_status, panorama_job_id, skybox_prompt')
      .eq('tour_id', params.id)
      .order('orden', { ascending: true });

    if (errSc) return NextResponse.json({ error: errSc.message }, { status: 500 });
    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No hay escenas en este tour' }, { status: 404 });
    }

    const results = await Promise.all(
      scenes.map(async (s: any) => {
        // Saltar si ya está completo
        if (s.panorama_status === 'complete') {
          return { sceneId: s.id, status: 'skipped', reason: 'already complete' };
        }
        try {
          // Si Claude generó descripcion_fiel (guardada en skybox_prompt), usarla
          // así el panorama 360 es fiel a la foto del cliente. Si no, fallback al prompt genérico.
          const prompt = s.skybox_prompt && s.skybox_prompt.trim().length > 10
            ? s.skybox_prompt
            : buildPrompt(s.tipo_espacio, s.paleta_hex);
          const jobId = await skyboxStartJob(prompt, s.image_url);
          await supa
            .from('scenes')
            .update({
              panorama_job_id: String(jobId),
              panorama_status: 'generating',
            })
            .eq('id', s.id);
          return { sceneId: s.id, status: 'generating', jobId: String(jobId) };
        } catch (e: any) {
          await supa
            .from('scenes')
            .update({ panorama_status: 'error' })
            .eq('id', s.id);
          return { sceneId: s.id, status: 'error', error: e?.message };
        }
      })
    );

    return NextResponse.json({ tourId: params.id, scenes: results });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}

/**
 * GET: consulta progreso de generación. Si una scene completó en Skybox,
 *      actualiza Supabase con la URL final.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supa = createAdminClient();
    const { data: scenes, error } = await supa
      .from('scenes')
      .select('id, panorama_status, panorama_job_id, panorama_url')
      .eq('tour_id', params.id)
      .order('orden', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!scenes) return NextResponse.json({ scenes: [] });

    const updated = await Promise.all(
      scenes.map(async (s: any) => {
        if (s.panorama_status === 'complete') return { sceneId: s.id, status: 'complete', url: s.panorama_url };
        if (s.panorama_status !== 'generating' || !s.panorama_job_id) {
          return { sceneId: s.id, status: s.panorama_status ?? 'pending' };
        }
        const r = await skyboxJobStatus(s.panorama_job_id);
        if (r.status === 'complete' && r.fileUrl) {
          await supa
            .from('scenes')
            .update({ panorama_status: 'complete', panorama_url: r.fileUrl })
            .eq('id', s.id);
          return { sceneId: s.id, status: 'complete', url: r.fileUrl };
        }
        if (r.status === 'error') {
          await supa
            .from('scenes')
            .update({ panorama_status: 'error' })
            .eq('id', s.id);
          return { sceneId: s.id, status: 'error', error: r.error };
        }
        return { sceneId: s.id, status: 'generating' };
      })
    );

    const completeCount = updated.filter((u) => u.status === 'complete').length;
    const allComplete = completeCount === updated.length;

    return NextResponse.json({
      tourId: params.id,
      total: updated.length,
      complete: completeCount,
      allComplete,
      scenes: updated,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
