'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import DropzoneFotos from '@/components/DropzoneFotos';
import LoaderEstados from '@/components/LoaderEstados';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { stitchMultipleScenes } from '@/lib/stitcher';

export default function NuevoTourPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [stitchProgress, setStitchProgress] = useState<string | null>(null);

  // Stitch mode: agrupar N fotos por escena y unirlas en panoramas client-side
  // (reemplazo de Skybox — costo $0, fidelidad 100%)
  const [stitchMode, setStitchMode] = useState(true);
  const [photosPerScene, setPhotosPerScene] = useState(4);

  // Metadata premium opcional
  const [showMeta, setShowMeta] = useState(false);
  const [precio, setPrecio] = useState('');
  const [ubicacion, setUbicacion] = useState('');
  const [areaM2, setAreaM2] = useState('');
  const [habitaciones, setHabitaciones] = useState('');
  const [banos, setBanos] = useState('');
  const [realtorNombre, setRealtorNombre] = useState('');
  const [realtorTelefono, setRealtorTelefono] = useState('');
  const [realtorEmail, setRealtorEmail] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setStitchProgress(null);
    if (!nombre.trim()) {
      setErr('Ponle un nombre al paseo.');
      return;
    }

    // Validación según modo
    if (stitchMode) {
      if (files.length < 2) {
        setErr(`Modo recorrido necesita al menos ${photosPerScene} fotos (1 escena).`);
        return;
      }
      if (files.length % photosPerScene !== 0) {
        setErr(
          `${files.length} fotos no es múltiplo de ${photosPerScene}. ` +
          `Ajustá el número de fotos por escena o subí más fotos.`
        );
        return;
      }
    } else {
      if (files.length < 1 || files.length > 7) {
        setErr('Selecciona entre 1 y 7 fotos.');
        return;
      }
    }

    setLoading(true);

    // ── Stitching client-side: agrupa fotos en escenas y las une en panoramas ──
    // Cada panorama resultante es equirectangular (aspect ≥ 1.85), entonces el
    // backend lo detecta como panorama nativo y skipea Skybox automáticamente.
    let filesToUpload = files;
    if (stitchMode) {
      try {
        const groups: File[][] = [];
        for (let i = 0; i < files.length; i += photosPerScene) {
          groups.push(files.slice(i, i + photosPerScene));
        }
        setStitchProgress(`Uniendo ${files.length} fotos en ${groups.length} panoramas...`);
        const panoramas = await stitchMultipleScenes(groups, (cur, tot, status) => {
          setStitchProgress(`${status} (${cur}/${tot})`);
        });
        filesToUpload = panoramas;
        setStitchProgress(`✅ ${panoramas.length} panoramas generados. Subiendo...`);
      } catch (e) {
        setErr(
          'Error al unir las fotos: ' + (e as Error).message +
          '. Probá tomar las fotos con más overlap (gira menos cada vez), o desactivá el modo recorrido.'
        );
        setLoading(false);
        setStitchProgress(null);
        return;
      }
    }

    const fd = new FormData();
    fd.append('nombre', nombre.trim());
    filesToUpload.forEach((f) => fd.append('files', f));

    // Metadata opcional
    if (precio.trim()) fd.append('precio', precio.trim());
    if (ubicacion.trim()) fd.append('ubicacion', ubicacion.trim());
    if (areaM2.trim()) fd.append('area_m2', areaM2.trim());
    if (habitaciones.trim()) fd.append('habitaciones', habitaciones.trim());
    if (banos.trim()) fd.append('banos', banos.trim());
    if (realtorNombre.trim()) fd.append('realtor_nombre', realtorNombre.trim());
    if (realtorTelefono.trim()) fd.append('realtor_telefono', realtorTelefono.trim());
    if (realtorEmail.trim()) fd.append('realtor_email', realtorEmail.trim());

    try {
      const res = await fetch('/api/tours', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'No pudimos crear el paseo.');
      router.push(`/tour/${json.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-paseo-dark">
      <Navbar cta={false} />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <h1 className="text-4xl mb-2">
          Nuevo <span className="serif-italic text-paseo-gold">paseo</span>
        </h1>
        <p className="text-paseo-cream/60 mb-8">
          {stitchMode
            ? `Modo recorrido — ${photosPerScene} fotos por cuarto se unen en un panorama 360° real.`
            : '1 foto = vista 360° individual. 5+ fotos = recorrido navegable.'}
        </p>

        <form onSubmit={onSubmit} className="space-y-6">
          <div>
            <label className="text-sm block mb-1.5 text-paseo-cream/75">Nombre del paseo</label>
            <input
              type="text"
              required
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Apto 402 — Chicó"
              className="w-full"
              disabled={loading}
            />
          </div>

          {/* Toggle modo recorrido (stitching client-side) */}
          <div className="border border-paseo-gold/15 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="text-sm font-medium text-paseo-cream mb-1">
                  Modo recorrido
                  <span className="ml-2 text-xs text-paseo-gold/80 font-normal">
                    {stitchMode ? '· activo' : '· apagado'}
                  </span>
                </div>
                <div className="text-xs text-paseo-cream/60 leading-relaxed">
                  {stitchMode ? (
                    <>
                      Tomá <strong className="text-paseo-cream">{photosPerScene} fotos por cuarto</strong> desde
                      un mismo punto, rotando ~{Math.round(360 / photosPerScene)}° cada vez. Las uno en un
                      panorama 360° real — fidelidad 100% al espacio, sin generación con IA.
                    </>
                  ) : (
                    <>1 foto por escena. Para tours con efecto IA — usa el modo legacy.</>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setStitchMode((v) => !v)}
                disabled={loading}
                className={`shrink-0 w-12 h-6 rounded-full transition relative ${
                  stitchMode ? 'bg-paseo-gold' : 'bg-paseo-cream/20'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-5 h-5 bg-paseo-dark rounded-full transition ${
                    stitchMode ? 'left-6' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {stitchMode && (
              <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-3">
                <label className="text-xs text-paseo-cream/60">Fotos por cuarto:</label>
                <select
                  value={photosPerScene}
                  onChange={(e) => setPhotosPerScene(Number(e.target.value))}
                  disabled={loading}
                  className="text-sm bg-paseo-dark border border-paseo-gold/30 rounded px-2 py-1 text-paseo-cream"
                >
                  <option value={4}>4 fotos (rotación 90°)</option>
                  <option value={6}>6 fotos (rotación 60°)</option>
                  <option value={8}>8 fotos (rotación 45°)</option>
                </select>
                <span className="text-xs text-paseo-cream/40">más fotos = más overlap = mejor unión</span>
              </div>
            )}
          </div>

          <DropzoneFotos onChange={setFiles} disabled={loading} />

          {/* Metadata premium — collapsible */}
          <div className="border border-paseo-gold/15 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowMeta((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition"
              disabled={loading}
            >
              <div className="text-left">
                <div className="text-sm font-medium text-paseo-cream">
                  Detalles del inmueble <span className="text-paseo-gold/70 text-xs">· opcional</span>
                </div>
                <div className="text-xs text-paseo-cream/50 mt-0.5">
                  Precio, ubicación, datos del realtor — aparecen en el tour para look profesional
                </div>
              </div>
              {showMeta ? <ChevronUp size={18} className="text-paseo-cream/60" /> : <ChevronDown size={18} className="text-paseo-cream/60" />}
            </button>

            {showMeta && (
              <div className="p-4 space-y-3 border-t border-white/5">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-paseo-cream/60 block mb-1">Precio</label>
                    <input
                      type="text"
                      value={precio}
                      onChange={(e) => setPrecio(e.target.value)}
                      placeholder="USD 1,100,000"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-paseo-cream/60 block mb-1">Ubicación</label>
                    <input
                      type="text"
                      value={ubicacion}
                      onChange={(e) => setUbicacion(e.target.value)}
                      placeholder="Panama City, El Cangrejo"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-paseo-cream/60 block mb-1">Área (m²)</label>
                    <input
                      type="number"
                      value={areaM2}
                      onChange={(e) => setAreaM2(e.target.value)}
                      placeholder="180"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-paseo-cream/60 block mb-1">Habitaciones</label>
                    <input
                      type="number"
                      value={habitaciones}
                      onChange={(e) => setHabitaciones(e.target.value)}
                      placeholder="3"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-paseo-cream/60 block mb-1">Baños</label>
                    <input
                      type="number"
                      value={banos}
                      onChange={(e) => setBanos(e.target.value)}
                      placeholder="2"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                  </div>
                </div>
                <div className="pt-3 border-t border-white/5">
                  <div className="text-xs text-paseo-gold/80 mb-2 font-medium">Datos del realtor</div>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={realtorNombre}
                      onChange={(e) => setRealtorNombre(e.target.value)}
                      placeholder="Nombre del realtor"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                    <input
                      type="tel"
                      value={realtorTelefono}
                      onChange={(e) => setRealtorTelefono(e.target.value)}
                      placeholder="+507 6000-0000"
                      className="w-full text-sm"
                      disabled={loading}
                    />
                  </div>
                  <input
                    type="email"
                    value={realtorEmail}
                    onChange={(e) => setRealtorEmail(e.target.value)}
                    placeholder="realtor@inmobiliaria.com"
                    className="w-full text-sm mt-3"
                    disabled={loading}
                  />
                </div>
              </div>
            )}
          </div>

          {err && <p className="text-sm text-red-400">{err}</p>}
          {stitchProgress && (
            <div className="text-sm text-paseo-gold bg-paseo-gold/5 border border-paseo-gold/20 rounded p-3">
              {stitchProgress}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full py-3 rounded-lg font-medium disabled:opacity-60"
          >
            {loading ? 'Armando tu paseo…' : 'Generar recorrido'}
          </button>

          <LoaderEstados active={loading} />
        </form>
      </div>
    </main>
  );
}
