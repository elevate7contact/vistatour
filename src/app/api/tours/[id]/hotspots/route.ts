/**
 * /api/tours/[id]/hotspots
 * ─────────────────────────────────────────────────────────────────
 * PATCH — actualiza los hotspots de las escenas de un tour.
 * Solo el owner del tour puede modificar.
 *
 * Body: { scenes: [{ id, hotspots: Hotspot[] }, ...] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerSb } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

interface SceneUpdate {
  id: string;
  hotspots: any[];
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerSb();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: tour, error: tourErr } = await admin
    .from('tours')
    .select('id, user_id')
    .eq('id', params.id)
    .single();

  if (tourErr || !tour) {
    return NextResponse.json({ error: 'Tour no existe' }, { status: 404 });
  }
  if (tour.user_id !== userRes.user.id) {
    return NextResponse.json({ error: 'No tenés permisos sobre este tour' }, { status: 403 });
  }

  let body: { scenes?: SceneUpdate[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }
  if (!Array.isArray(body.scenes)) {
    return NextResponse.json({ error: 'Body debe tener scenes[]' }, { status: 400 });
  }

  // Validación básica: cada hotspot debe tener id, to_scene_id y position {yaw, pitch}
  const errors: string[] = [];
  for (const s of body.scenes) {
    if (!Array.isArray(s.hotspots)) continue;
    for (const h of s.hotspots) {
      if (!h.id || !h.to_scene_id || !h.position ||
          typeof h.position.yaw !== 'number' || typeof h.position.pitch !== 'number') {
        errors.push(`Hotspot inválido en scene ${s.id}`);
      }
    }
  }
  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join('; ') }, { status: 400 });
  }

  // Actualizar cada scene
  for (const s of body.scenes) {
    const { error } = await admin
      .from('scenes')
      .update({ hotspots: s.hotspots })
      .eq('id', s.id)
      .eq('tour_id', params.id);  // doble check de tour_id
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, updated: body.scenes.length });
}
