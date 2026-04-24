import Link from 'next/link';
import { redirect } from 'next/navigation';
import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase/server';
import DashboardClient from './DashboardClient';

export const dynamic = 'force-dynamic';

interface TourRow {
  id: string;
  nombre: string;
  status: 'processing' | 'ready' | 'failed';
  created_at: string;
}

interface SceneRow {
  tour_id: string;
  image_url: string;
  orden: number;
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: userRes } = await supabase.auth.getUser();
  if (!userRes.user) redirect('/login');

  const { data: tours } = await supabase
    .from('tours')
    .select('id, nombre, status, created_at')
    .eq('user_id', userRes.user.id)
    .order('created_at', { ascending: false });

  const list = (tours ?? []) as TourRow[];
  const ids = list.map((t) => t.id);
  let thumbs: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: scenes } = await supabase
      .from('scenes')
      .select('tour_id, image_url, orden')
      .in('tour_id', ids)
      .eq('orden', 0);
    ((scenes ?? []) as SceneRow[]).forEach((s) => {
      thumbs[s.tour_id] = s.image_url;
    });
  }

  return (
    <main className="min-h-screen bg-paseo-dark">
      <Navbar cta={false} />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl md:text-4xl">
              Tus <span className="serif-italic text-paseo-gold">paseos</span>
            </h1>
            <p className="text-paseo-cream/55 text-sm mt-1">{userRes.user.email}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard/nuevo-tour"
              className="btn-gold px-5 py-2.5 rounded-lg font-medium text-sm"
            >
              Nuevo paseo
            </Link>
            <DashboardClient />
          </div>
        </div>

        {list.length === 0 ? (
          <div className="card p-16 text-center">
            <div className="text-6xl serif-italic text-paseo-gold mb-4">∅</div>
            <h2 className="text-2xl mb-2">Todavía no has creado ningún paseo</h2>
            <p className="text-paseo-cream/55 mb-6">Empieza con tu primer inmueble.</p>
            <Link
              href="/dashboard/nuevo-tour"
              className="btn-gold inline-block px-6 py-3 rounded-lg font-medium"
            >
              Crear mi primer paseo
            </Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {list.map((t) => (
              <Link
                key={t.id}
                href={`/tour/${t.id}`}
                className="card overflow-hidden hover:border-paseo-gold/40 transition"
              >
                <div className="aspect-[4/3] bg-black/50 relative">
                  {thumbs[t.id] ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={thumbs[t.id]}
                      alt={t.nombre}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-paseo-cream/30 text-sm">
                      Sin preview
                    </div>
                  )}
                  <span
                    className={`absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-xs ${
                      t.status === 'ready'
                        ? 'bg-paseo-gold text-paseo-dark'
                        : t.status === 'processing'
                        ? 'bg-white/10 text-paseo-cream'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {t.status === 'ready'
                      ? 'Listo'
                      : t.status === 'processing'
                      ? 'Procesando'
                      : 'Falló'}
                  </span>
                </div>
                <div className="p-4">
                  <h3 className="text-lg truncate">{t.nombre}</h3>
                  <p className="text-xs text-paseo-cream/50 mt-1">{relativeEs(t.created_at)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function relativeEs(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `hace ${days} d`;
  return new Date(iso).toLocaleDateString('es-CO');
}
