'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Map, Footprints } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';

const Skybox360Viewer = dynamic(() => import('./Skybox360Viewer'), { ssr: false });

// Mapeo de tipo de espacio → prompt enriquecido para Skybox.
const ROOM_PROMPTS: Record<string, string> = {
  sala:        'modern bright living room interior, beige sofa, large windows with natural light, wooden floor, minimalist art on wall, real estate photography',
  salon:       'modern bright living room interior, beige sofa, large windows with natural light, wooden floor, minimalist art on wall, real estate photography',
  living:      'modern bright living room interior, beige sofa, large windows with natural light, wooden floor, minimalist art on wall, real estate photography',
  cocina:      'modern white kitchen interior, marble countertops, stainless steel appliances, pendant lights, large window, real estate photography',
  comedor:     'elegant dining room interior, wooden table for six, neutral palette, large windows, soft natural light, real estate photography',
  dormitorio:  'modern bedroom interior, queen bed with white linen, soft natural light, neutral colors, wooden floor, real estate photography',
  habitacion:  'modern bedroom interior, queen bed with white linen, soft natural light, neutral colors, wooden floor, real estate photography',
  cuarto:      'modern bedroom interior, queen bed with white linen, soft natural light, neutral colors, wooden floor, real estate photography',
  bano:        'modern bathroom interior, white marble, glass shower, neutral palette, soft daylight, real estate photography',
  estudio:     'home office interior, wooden desk, ergonomic chair, bookshelf, large window with natural light, real estate photography',
  balcon:      'apartment balcony exterior, city view, plants, modern railing, golden hour light, real estate photography',
  terraza:     'open rooftop terrace, plants, lounge furniture, city skyline, sunset light, real estate photography',
};

function buildPrompt(tipoEspacio: string | null, paleta: string[] | null) {
  const key = (tipoEspacio ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (const k of Object.keys(ROOM_PROMPTS)) {
    if (key.includes(k)) {
      const palette = paleta?.length ? `, color palette ${paleta.slice(0, 3).join(', ')}` : '';
      return `${ROOM_PROMPTS[k]}${palette}, equirectangular 360 panorama`;
    }
  }
  return 'modern residential interior, neutral palette, natural light, real estate photography, equirectangular 360 panorama';
}

export interface Scene {
  orden: number;
  image_url: string;
  tipo_espacio: string | null;
  paleta_hex: string[] | null;
  direccion_siguiente: 'adelante' | 'izquierda' | 'derecha' | 'arriba' | 'abajo' | null;
  similitud_siguiente: 'alta' | 'media' | 'baja' | null;
}

interface Props {
  nombre: string;
  scenes: Scene[];
}

function transitionFor(sim: Scene['similitud_siguiente']) {
  if (sim === 'alta') {
    return {
      initial: { opacity: 0, scale: 1 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 1.3 },
      transition: { duration: 0.6, ease: 'easeInOut' as const }
    };
  }
  if (sim === 'media') {
    return {
      initial: { opacity: 0, filter: 'blur(16px)' },
      animate: { opacity: 1, filter: 'blur(0px)' },
      exit: { opacity: 0, filter: 'blur(12px)' },
      transition: { duration: 0.4 }
    };
  }
  // baja (or null fallback)
  return {
    initial: { opacity: 0, scale: 1.15 },
    animate: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 1 },
    transition: { duration: 0.45 }
  };
}

export default function TourViewer({ nombre, scenes }: Props) {
  const total = scenes.length;
  const [i, setI] = useState(0);
  const [full, setFull] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const touchStart = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Modo Caminar (Skybox 360) — cache por escena
  const [walkUrl, setWalkUrl] = useState<string | null>(null);
  const [walkLoading, setWalkLoading] = useState(false);
  const [walkProgress, setWalkProgress] = useState<string>('');
  const cacheRef = useRef(new Map<number, string>());

  async function generateWalkMode() {
    const scene = scenes[i];
    if (!scene) return;
    const cached = cacheRef.current.get(scene.orden);
    if (cached) {
      setWalkUrl(cached);
      return;
    }
    try {
      setWalkLoading(true);
      setWalkProgress('Iniciando…');
      const prompt = buildPrompt(scene.tipo_espacio, scene.paleta_hex);
      const r = await fetch('/api/skybox/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.error || `POST falló (${r.status})`);
      }
      const { jobId } = await r.json();

      // polling cada 3s, máx 3 minutos
      let attempt = 0;
      while (attempt < 60) {
        attempt++;
        await new Promise((res) => setTimeout(res, 3000));
        setWalkProgress(`Generando panorama (${attempt * 3}s)…`);
        const sr = await fetch(`/api/skybox/generate?id=${jobId}`);
        const data = await sr.json();
        if (data.status === 'complete' && data.fileUrl) {
          cacheRef.current.set(scene.orden, data.fileUrl);
          setWalkUrl(data.fileUrl);
          return;
        }
        if (data.status === 'error') {
          throw new Error(data.error || 'Skybox falló');
        }
      }
      throw new Error('Timeout (3min)');
    } catch (e: any) {
      console.error('[walk-mode]', e);
      alert('Error generando modo caminar: ' + e.message);
    } finally {
      setWalkLoading(false);
      setWalkProgress('');
    }
  }

  const next = useCallback(() => setI((v) => Math.min(v + 1, total - 1)), [total]);
  const prev = useCallback(() => setI((v) => Math.max(v - 1, 0)), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.code === 'Space') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        prev();
      } else if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  useEffect(() => {
    function onFs() {
      setFull(Boolean(document.fullscreenElement));
    }
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  function toggleFull() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  const current = scenes[i];
  const t = transitionFor(scenes[i - 1]?.similitud_siguiente ?? current.similitud_siguiente);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[100dvh] bg-paseo-dark overflow-hidden select-none"
      onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        if (start == null) return;
        const delta = e.changedTouches[0].clientX - start;
        if (Math.abs(delta) > 50) {
          if (delta < 0) next();
          else prev();
        }
        touchStart.current = null;
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current.orden}
          initial={t.initial}
          animate={t.animate}
          exit={t.exit}
          transition={t.transition}
          className="absolute inset-0"
        >
          <div
            className="absolute inset-0 bg-center bg-cover kenburns"
            style={{ backgroundImage: `url(${current.image_url})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-paseo-dark/70 via-transparent to-paseo-dark/30" />
        </motion.div>
      </AnimatePresence>

      {/* top-left: logo + nombre */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        <span className="text-xl font-semibold tracking-tight">Paseo</span>
        <span className="text-paseo-cream/50">·</span>
        <span className="text-paseo-cream/80 text-sm truncate max-w-[50vw]">{nombre}</span>
      </div>

      {/* top-right: walk mode + fullscreen + map toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={generateWalkMode}
          disabled={walkLoading}
          className="flex items-center gap-2 px-4 h-9 rounded-full text-white font-semibold text-sm shadow-lg transition disabled:opacity-60 disabled:cursor-wait"
          style={{ background: 'linear-gradient(135deg, #FF6B35, #FF8555)' }}
          aria-label="Ver en Modo Caminar"
          title="Generar tour caminable con IA"
        >
          {walkLoading ? (
            <>
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              <span className="hidden sm:inline">{walkProgress || 'Generando…'}</span>
            </>
          ) : (
            <>
              <Footprints size={16} />
              <span className="hidden sm:inline">Ver en Modo Caminar</span>
            </>
          )}
        </button>
        <button
          onClick={() => setShowMap((v) => !v)}
          className="bg-black/50 hover:bg-black/70 backdrop-blur rounded-full p-2"
          aria-label="Mapa"
        >
          <Map size={18} />
        </button>
        <button
          onClick={toggleFull}
          className="bg-black/50 hover:bg-black/70 backdrop-blur rounded-full p-2"
          aria-label="Pantalla completa"
        >
          {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Visor 360° Skybox — overlay */}
      {walkUrl && (
        <Skybox360Viewer
          panoramaUrl={walkUrl}
          title={`${nombre} — ${current.tipo_espacio ?? 'Espacio'}`}
          onClose={() => setWalkUrl(null)}
        />
      )}

      {/* side arrows */}
      <button
        onClick={prev}
        disabled={i === 0}
        className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/70 backdrop-blur rounded-full p-3 disabled:opacity-30"
        aria-label="Anterior"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={next}
        disabled={i === total - 1}
        className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/70 backdrop-blur rounded-full p-3 disabled:opacity-30"
        aria-label="Siguiente"
      >
        <ChevronRight size={22} />
      </button>

      {/* bottom info */}
      <div className="absolute bottom-6 left-0 right-0 z-20 flex flex-col items-center gap-2 px-6">
        <div className="serif-italic text-paseo-gold text-2xl md:text-3xl capitalize">
          {current.tipo_espacio ?? 'espacio'}
        </div>
        <div className="text-xs text-paseo-cream/60">
          Escena {current.orden + 1} de {total} · ← → para navegar
        </div>
        <div className="flex gap-1 mt-1">
          {scenes.map((s, idx) => (
            <span
              key={s.orden}
              className={`h-[3px] rounded-full transition-all ${
                idx === i ? 'w-8 bg-paseo-gold' : 'w-4 bg-white/25'
              }`}
            />
          ))}
        </div>
      </div>

      {/* minimap */}
      <AnimatePresence>
        {showMap && (
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            className="absolute left-4 top-20 bottom-20 z-20 w-24 overflow-y-auto card p-2 space-y-2"
          >
            {scenes.map((s, idx) => (
              <button
                key={s.orden}
                onClick={() => setI(idx)}
                className={`w-full aspect-[4/3] rounded-md overflow-hidden border ${
                  idx === i ? 'border-paseo-gold' : 'border-transparent'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image_url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
