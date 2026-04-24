import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TourViewer, { Scene } from '@/components/TourViewer';

export const dynamic = 'force-dynamic';

interface TourRow {
  id: string;
  nombre: string;
  status: 'processing' | 'ready' | 'failed';
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
    .select('orden, image_url, tipo_espacio, paleta_hex, direccion_siguiente, similitud_siguiente')
    .eq('tour_id', t.id)
    .order('orden', { ascending: true });

  const list = (scenes ?? []) as Scene[];
  if (list.length === 0) notFound();

  return <TourViewer nombre={t.nombre} scenes={list} />;
}
