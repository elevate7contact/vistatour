'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import DropzoneFotos from '@/components/DropzoneFotos';
import LoaderEstados from '@/components/LoaderEstados';

export default function NuevoTourPage() {
  const router = useRouter();
  const [nombre, setNombre] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!nombre.trim()) {
      setErr('Ponle un nombre al paseo.');
      return;
    }
    if (files.length < 5 || files.length > 7) {
      setErr('Selecciona entre 5 y 7 fotos.');
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append('nombre', nombre.trim());
    files.forEach((f) => fd.append('files', f));

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
          Subes 5 a 7 fotos y en menos de 2 minutos tienes un recorrido listo para compartir.
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

          <DropzoneFotos onChange={setFiles} disabled={loading} />

          {err && <p className="text-sm text-red-400">{err}</p>}

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
