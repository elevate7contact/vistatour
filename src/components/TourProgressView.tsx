'use client';

/**
 * TourProgressView
 * ─────────────────────────────────────────────────────────────────
 * Pantalla de progreso mientras los panoramas se generan en Skybox.
 *
 * Hace polling automático al endpoint GET /generate-panoramas cada 8s:
 *   - dispara el polling server-side a Skybox
 *   - actualiza panorama_url cuando completa
 *   - cuando allComplete=true, auto-dispara detect-hotspots
 *   - cuando allComplete y hay hotspots → router.refresh() recarga la
 *     página y page.tsx renderiza Tour360Navegable
 *
 * Sin recargas manuales. El cliente queda en esta pantalla y, cuando
 * todo está listo, automáticamente entra al tour navegable.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface SceneRow {
  id: string;
  orden: number;
  tipo_espacio: string | null;
  panorama_status: 'pending' | 'generating' | 'complete' | 'error' | null;
}

interface Props {
  tourId: string;
  scenes: SceneRow[];
  completeCount: number;
  errorCount: number;
}

export default function TourProgressView({ tourId, scenes, completeCount, errorCount }: Props) {
  const router = useRouter();
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [pollErrors, setPollErrors] = useState(0);

  // Contador visual
  useEffect(() => {
    const id = setInterval(() => setSecondsElapsed((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Polling cada 8s al endpoint para que actualice estado y dispare hotspots
  useEffect(() => {
    let stopped = false;

    async function tick() {
      try {
        const res = await fetch(`/api/tours/${tourId}/generate-panoramas`, {
          cache: 'no-store',
        });
        if (!res.ok) {
          setPollErrors((e) => e + 1);
          return;
        }
        const json = await res.json();
        // Si todos los panoramas están listos, recargamos la página.
        // page.tsx detectará allPanoramasReady y montará Tour360Navegable.
        if (json.allComplete) {
          // Pequeño delay para dar chance a detect-hotspots de terminar
          if (!stopped) {
            setTimeout(() => {
              if (!stopped) router.refresh();
            }, 3000);
          }
        }
      } catch {
        setPollErrors((e) => e + 1);
      }
    }

    // Primer tick rápido y después cada 8s
    tick();
    const id = setInterval(tick, 8000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [tourId, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
      <div className="text-center max-w-md px-6">
        <div className="serif-italic text-paseo-gold text-4xl mb-3">
          {errorCount > 0 ? 'Generando tu paseo (con reintentos)…' : 'Generando tu paseo 360°…'}
        </div>
        <p className="text-paseo-cream/60 text-sm mb-2">
          {completeCount} de {scenes.length} habitaciones listas.
        </p>
        <p className="text-paseo-cream/40 text-xs mb-6">
          Esto toma 60-90 segundos. ({secondsElapsed}s)
        </p>

        <div className="space-y-2 text-left">
          {scenes.map((s) => (
            <div key={s.id} className="flex items-center gap-3 text-sm">
              <span className="text-paseo-cream/80 capitalize w-32 text-left truncate">
                {s.tipo_espacio ?? `Escena ${s.orden + 1}`}
              </span>
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    s.panorama_status === 'complete'
                      ? 'bg-paseo-gold w-full'
                      : s.panorama_status === 'generating'
                      ? 'bg-paseo-gold/60 w-2/3 animate-pulse'
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

        <p className="mt-8 text-xs text-paseo-cream/40">
          ⏳ Esta pantalla se actualiza sola. Cuando estén las habitaciones, entras al tour automáticamente.
        </p>
        {pollErrors > 3 && (
          <p className="mt-2 text-xs text-red-400/70">
            (Hubo {pollErrors} errores de conexión. Si tarda mucho, recarga manualmente.)
          </p>
        )}
      </div>
    </main>
  );
}
