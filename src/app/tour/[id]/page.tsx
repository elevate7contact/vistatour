/**
 * /tour/[id] — Página pública del tour 360°
 * ─────────────────────────────────────────────────────────────────
 * Tres estados posibles:
 *   1. status='processing' o ninguna escena → "Armando tu paseo"
 *   2. Escenas con panorama_status='generating' o 'pending' → progress screen
 *   3. Todas las escenas con panorama_status='complete' → Tour360Navegable
 *
 * El pipeline ÚNICO de generación es /api/tours/[id]/generate-panoramas
 * (auto-trigger desde POST /api/tours). Aquí solo leemos estado.
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
  const { data: tour } = await supabase
    .from('tours')
    .select('id, nombre, status')
    .eq('id', params.id)
    .single();

  if (!tour) notFound();
  const t = tour as TourRow;

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

  // CASO 1 — Todas las escenas tienen panorama listo → modo navegable
  const allPanoramasReady =
    list.length > 0 && list.every((s) => s.panorama_status === 'complete' && s.panorama_url);

  if (allPanoramasReady) {
    const scenes360: Scene360[] = list.map((s) => ({
      id: s.id,
      orden: s.orden,
      panorama_url: s.panorama_url!,
      // image_url = foto ORIGINAL del cliente. Se renderiza como ancla frontal
      // dentro del 360° para garantizar fidelidad fotográfica perfecta.
      image_url: s.image_url,
      tipo_espacio: s.tipo_espacio,
      paleta_hex: s.paleta_hex,
      hotspots: Array.isArray(s.hotspots) ? s.hotspots : [],
    }));
    return <Tour360Navegable nombre={t.nombre} scenes={scenes360} />;
  }

  // CASO 2 — Algunas escenas todavía generando o pendientes → pantalla de progreso
  // (no hay fallback al pipeline viejo; el único pipeline es generate-panoramas)
  const completeCount = list.filter((s) => s.panorama_status === 'complete').length;
  const errorCount = list.filter((s) => s.panorama_status === 'error').length;

  return (
    <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
      <div className="text-center max-w-md px-6">
        <div className="serif-italic text-paseo-gold text-4xl mb-3">
          {errorCount > 0 ? 'Generando tu paseo (con reintentos)…' : 'Generando tu paseo 360°…'}
        </div>
        <p className="text-paseo-cream/60 text-sm mb-6">
          {completeCount} de {list.length} habitaciones listas. Esto toma 60-90 segundos.
        </p>
        <div className="space-y-2">
          {list.map((s) => (
            <div key={s.id} className="flex items-center gap-3 text-sm">
              <span className="text-paseo-cream/80 capitalize w-32 text-left">
                {s.tipo_espacio ?? `Escena ${s.orden + 1}`}
              </span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    s.panorama_status === 'complete'
                      ? 'bg-paseo-gold w-full'
                      : s.panorama_status === 'generating'
                      ? 'bg-paseo-gold/60 w-2/3'
                      : s.panorama_status === 'error'
                      ? 'bg-red-500/60 w-1/2'
                      : 'bg-white/20 w-1/4'
                  }`}
                />
              </div>
              <span className="text-xs text-paseo-cream/50 w-20 text-right">
                {s.panorama_status === 'complete'
                  ? '✓ Listo'
                  : s.panorama_status === 'generating'
                  ? 'Generando…'
                  : s.panorama_status === 'error'
                  ? 'Reintentando'
                  : 'En cola'}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-paseo-cream/40">
          Recarga en 30 segundos para ver el progreso.
        </p>
      </div>
    </main>
  );
}
