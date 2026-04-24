'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X } from 'lucide-react';

const MAX = 7;
const MIN = 5;
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export interface DropzoneFotosProps {
  onChange: (files: File[]) => void;
  disabled?: boolean;
}

export default function DropzoneFotos({ onChange, disabled }: DropzoneFotosProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
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
      onChange(next);
    },
    [onChange]
  );

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
        setErr('Cada foto debe pesar menos de 10 MB.');
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
          Entre {MIN} y {MAX} fotos · JPG, PNG, WEBP · Máx 10 MB c/u
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
          <div className="mt-4 grid grid-cols-3 md:grid-cols-4 gap-3">
            {previews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden card p-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black rounded-full p-1"
                  aria-label="Eliminar foto"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
