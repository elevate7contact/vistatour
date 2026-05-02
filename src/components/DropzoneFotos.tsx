'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { Upload, X, Camera, AlertCircle } from 'lucide-react';

const MAX = 7;
const MIN = 1;
const MAX_SIZE = 25 * 1024 * 1024;     // 25 MB — los panoramas equirectangulares pesan más
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PANORAMA_MIN_ASPECT = 1.85;      // mismo umbral que el backend

function modeLabel(count: number) {
  if (count === 0) return null;
  if (count === 1) return { name: 'Vista 360° individual', desc: '1 panorama inmersivo de un espacio' };
  if (count <= 4) return { name: 'Tour pequeño', desc: 'recorrido básico con hotspots entre habitaciones' };
  return { name: 'Tour completo', desc: 'recorrido estilo Google Street View entre todas las habitaciones' };
}

// Detección de aspect ratio en el browser para feedback inmediato.
async function getAspect(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

export interface DropzoneFotosProps {
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropzoneFotos({ onChange, disabled }: DropzoneFotosProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [aspects, setAspects] = useState<Array<{ aspect: number; width: number; height: number; isPano: boolean } | null>>([]);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    (next: File[]) => {
      setFiles(next);
      setPreviews((old) => {
        old.forEach((u) => URL.revokeObjectURL(u));
        return next.map((f) => URL.createObjectURL(f));
      });
      // Detectar aspect ratio de cada foto (async, no bloquea)
      Promise.all(next.map((f) => getAspect(f))).then((dims) => {
        setAspects(
          dims.map((d) =>
            d
              ? {
                  aspect: d.width / d.height,
                  width: d.width,
                  height: d.height,
                  isPano: d.width / d.height >= PANORAMA_MIN_ASPECT,
                }
              : null
          )
        );
      });
      onChange(next);
    },
    [onChange]
  );

  const panoCount = aspects.filter((a) => a?.isPano).length;
  const planaCount = aspects.filter((a) => a && !a.isPano).length;
  const allPano = panoCount > 0 && planaCount === 0;
  const mixedTypes = panoCount > 0 && planaCount > 0;

  function validate(incoming: File[]): File[] | null {
    const all = [...files, ...incoming];
    if (all.length > MAX) {
      setErr(`Máximo ${MAX} fotos.`);
      return null;
    }
    for (const f of incoming) {
      if (!TYPES.includes(f.type)) {
        setErr('Solo se permiten JPG, PNG o WEBP.');
        return null;
      }
      if (f.size > MAX_SIZE) {
        setErr('Cada foto debe pesar menos de 25 MB.');
        return null;
      }
    }
    setErr(null);
    return all;
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const incoming = Array.from(list);
    const next = validate(incoming);
    if (next) update(next);
  }

  function removeAt(i: number) {
    const next = files.filter((_, idx) => idx !== i);
    update(next);
  }

  return (
    <div>
      {/* Banner educativo — calidad realtor premium */}
      <div className="mb-4 rounded-xl border border-paseo-gold/20 bg-paseo-gold/5 p-4">
        <div className="flex items-start gap-3">
          <Camera className="text-paseo-gold flex-shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <p className="text-sm text-paseo-cream font-medium">
              Para máxima calidad: subí fotos en modo <span className="text-paseo-gold">Panorama</span>
            </p>
            <p className="text-xs text-paseo-cream/65 mt-1.5 leading-relaxed">
              <strong className="text-paseo-cream">iPhone:</strong> Cámara → desliza a "Pano" → mové el celular suavemente de izquierda a derecha. ·{' '}
              <strong className="text-paseo-cream">Android:</strong> Cámara → "Más" → "Panorámica". ·{' '}
              <strong className="text-paseo-cream">Cámara 360°:</strong> JPG equirectangular directo (Insta360, Theta).
            </p>
            <p className="text-xs text-paseo-cream/50 mt-2 italic">
              Las fotos panorámicas se muestran tal cual, sin alteraciones IA. Es lo que da calidad de venta premium.
            </p>
          </div>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (!disabled) addFiles(e.dataTransfer.files);
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`card cursor-pointer text-center py-14 px-6 transition ${
          drag ? 'border-paseo-gold/60 bg-white/[0.03]' : ''
        } ${disabled ? 'opacity-60 pointer-events-none' : ''}`}
      >
        <Upload className="mx-auto mb-4 text-paseo-gold" size={32} />
        <p className="text-lg">
          Arrastra tus fotos o <span className="text-paseo-gold underline">haz clic</span>
        </p>
        <p className="text-sm text-paseo-cream/55 mt-1">
          Panorámicas (modo Pano) → calidad premium · Fotos planas → reconstrucción IA
        </p>
        <p className="text-xs text-paseo-cream/40 mt-1">
          JPG, PNG, WEBP · Máx 25 MB c/u · hasta {MAX} fotos
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={TYPES.join(',')}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {err && <p className="mt-3 text-sm text-red-400">{err}</p>}

      {previews.length > 0 && (
        <>
          <div className="mt-5 flex items-center justify-between text-sm text-paseo-cream/70">
            <span>
              {files.length} de {MAX} fotos seleccionadas
            </span>
            <span
              className={
                files.length >= MIN && files.length <= MAX ? 'text-paseo-gold' : 'text-red-400'
              }
            >
              {files.length < MIN ? `Faltan ${MIN - files.length}` : 'Listo para armar'}
            </span>
          </div>

          {/* Modo detectado según cantidad */}
          {(() => {
            const mode = modeLabel(files.length);
            if (!mode) return null;
            return (
              <div className="mt-3 p-3 rounded-lg border border-paseo-gold/20 bg-paseo-gold/5">
                <div className="text-sm text-paseo-gold font-medium">
                  {mode.name}
                </div>
                <div className="text-xs text-paseo-cream/60 mt-0.5">
                  {mode.desc}
                </div>
              </div>
            );
          })()}
          {/* Aviso si hay mezcla de tipos */}
          {mixedTypes && (
            <div className="mt-3 p-3 rounded-lg border border-amber-400/30 bg-amber-400/5 flex items-start gap-2">
              <AlertCircle className="text-amber-400 flex-shrink-0 mt-0.5" size={16} />
              <p className="text-xs text-amber-200/90 leading-relaxed">
                Estás mezclando fotos panorámicas y planas. Las planas se reconstruyen con IA y pueden verse
                distintas a las panorámicas. Para un tour homogéneo subí solo de un tipo.
              </p>
            </div>
          )}

          {/* Resumen de tipos */}
          {(panoCount > 0 || planaCount > 0) && (
            <div className="mt-3 flex gap-3 text-xs">
              {panoCount > 0 && (
                <span className="px-2 py-1 rounded-md bg-paseo-gold/15 text-paseo-gold">
                  ✓ {panoCount} panorámica{panoCount > 1 ? 's' : ''} · calidad premium
                </span>
              )}
              {planaCount > 0 && (
                <span className="px-2 py-1 rounded-md bg-white/8 text-paseo-cream/65">
                  {planaCount} foto{planaCount > 1 ? 's' : ''} plana{planaCount > 1 ? 's' : ''} · reconstrucción IA
                </span>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-3 md:grid-cols-4 gap-3">
            {previews.map((src, i) => {
              const a = aspects[i];
              return (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden card p-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                  {/* Etiqueta de tipo detectado */}
                  {a && (
                    <div
                      className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        a.isPano
                          ? 'bg-paseo-gold text-paseo-dark'
                          : 'bg-black/70 text-paseo-cream/80'
                      }`}
                    >
                      {a.isPano ? '360° PANO' : 'PLANA'}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAt(i)}
                    className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black rounded-full p-1"
                    aria-label="Eliminar foto"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
