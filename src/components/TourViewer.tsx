'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Map } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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

      {/* top-right: fullscreen + map toggle */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
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
