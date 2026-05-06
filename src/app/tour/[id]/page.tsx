/**
 * /tour/[id] — Página pública del tour 360°
 * ─────────────────────────────────────────────────────────────────
 * Pipeline post-Skybox: las escenas llegan con panorama_status='complete'
 * desde el momento en que se crean (stitching client-side con OpenCV.js
 * o panorama nativo iPhone Pano). No hay generación asíncrona.
 *
 * Estados posibles:
 *   1. status='processing' o ninguna escena → "Armando tu paseo"
 *   2. status='failed' → mensaje de fallo
 *   3. Escenas listas → Tour360Navegable
 */
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import dynamicImport from 'next/dynamic';
import type { Scene360 } from '@/components/Tour360Navegable';

// Renombrado a `dynamicImport` para no colisionar con la export `dynamic`
// que Next.js usa como route segment config.
const Tour360Navegable = dynamicImport(() => import('@/components/Tour360Navegable'), { ssr: false });

export const dynamic = 'force-dynamic';

interface TourRow {
  id: string;
  nombre: string;
  status: 'processing' | 'ready' | 'failed';
  user_id: string;
  metadata: Record<string, any> | null;
}

interface SceneRow {
  id: string;
  orden: number;
  image_url: string;
  tipo_espacio: string | null;
  paleta_hex: string[] | null;
  panorama_url: string | null;
  panorama_status: 'pending' | 'generating' | 'complete' | 'error' | null;
  hotspots: any;
}

export default async function TourPage({ params }: { params: { id: string } }) {
  const supabase = createClient();

  // Query defensiva: primero los campos base que siempre existen,
  // después metadata por separado (puede fallar si la migración 0003
  // todavía no corrió). Sin esto, si la columna metadata no existe el
  // SELECT falla silencioso y page.tsx devuelve 404 aunque el tour exista.
  const { data: tourBase } = await supabase
    .from('tours')
    .select('id, nombre, status, user_id')
    .eq('id', params.id)
    .single();

  if (!tourBase) notFound();

  // Intento opcional de leer metadata. Si la columna no existe → null.
  let metadata: Record<string, any> | null = null;
  try {
    const { data: metaRow } = await supabase
      .from('tours')
      .select('metadata')
      .eq('id', params.id)
      .single();
    metadata = (metaRow as any)?.metadata ?? null;
  } catch { /* migración 0003 pendiente — seguimos sin metadata */ }

  const t = { ...tourBase, metadata } as TourRow;

  // Detectar si el visitante actual es el dueño (para mostrar editor de hotspots)
  const { data: userRes } = await supabase.auth.getUser();
  const isOwner = userRes.user?.id === t.user_id;

  if (t.status === 'processing') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
        <div className="text-center">
          <div className="serif-italic text-paseo-gold text-4xl mb-3">Armando tu paseo…</div>
          <p className="text-paseo-cream/60 text-sm">Recarga en unos segundos.</p>
        </div>
      </main>
    );
  }
  if (t.status === 'failed') {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
        <div className="text-center">
          <div className="text-2xl mb-2">Este paseo falló</div>
          <p className="text-paseo-cream/60 text-sm">Vuelve al dashboard y crea uno nuevo.</p>
        </div>
      </main>
    );
  }

  const { data: scenes } = await supabase
    .from('scenes')
    .select(
      'id, orden, image_url, tipo_espacio, paleta_hex, panorama_url, panorama_status, hotspots'
    )
    .eq('tour_id', t.id)
    .order('orden', { ascending: true });

  const list = (scenes ?? []) as SceneRow[];
  if (list.length === 0) notFound();

  // Todas las escenas deberían venir con panorama_url + status='complete'
  // desde el POST. Si alguna no, mostramos error simple en lugar de pantalla
  // de progreso (ya no hay generación asíncrona post-Skybox).
  const allReady = list.every((s) => s.panorama_status === 'complete' && s.panorama_url);

  if (!allReady) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
        <div className="text-center max-w-md px-6">
          <div className="text-2xl mb-3">Tour incompleto</div>
          <p className="text-paseo-cream/60 text-sm">
            Una o más escenas no tienen panorama. Esto puede pasar si las fotos no se subieron
            como panorámicas. Vuelve al dashboard y creá un tour nuevo usando el modo recorrido.
          </p>
        </div>
      </main>
    );
  }

  const scenes360: Scene360[] = list.map((s) => ({
    id: s.id,
    orden: s.orden,
    panorama_url: s.panorama_url!,
    image_url: s.image_url,
    tipo_espacio: s.tipo_espacio,
    paleta_hex: s.paleta_hex,
    hotspots: Array.isArray(s.hotspots) ? s.hotspots : [],
  }));

  return (
    <Tour360Navegable
      nombre={t.nombre}
      scenes={scenes360}
      metadata={t.metadata ?? null}
      tourId={t.id}
      canEdit={isOwner}
    />
  );
}
