import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: tour, error } = await supabase
    .from('tours')
    .select('id, nombre, status, created_at')
    .eq('id', params.id)
    .single();
  if (error || !tour) {
    return NextResponse.json({ error: 'Paseo no encontrado.' }, { status: 404 });
  }
  const { data: scenes } = await supabase
    .from('scenes')
    .select('orden, image_url, tipo_espacio, paleta_hex, direccion_siguiente, similitud_siguiente')
    .eq('tour_id', params.id)
    .order('orden', { ascending: true });
  return NextResponse.json({ tour, scenes: scenes ?? [] });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) {
    return NextResponse.json({ error: 'No has iniciado sesión.' }, { status: 401 });
  }
  const { error } = await supabase.from('tours').delete().eq('id', params.id);
  if (error) {
    return NextResponse.json({ error: 'No pudimos eliminar el paseo.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
