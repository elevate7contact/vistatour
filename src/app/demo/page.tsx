/**
 * /demo
 * ─────────────────────────────────────────────────────────────────
 * Redirige al tour pre-armado que se usa como demo pública.
 * El ID del tour vive en env DEMO_TOUR_ID, así rotamos la demo sin
 * tocar código.
 *
 * Uso: pegar paseo-ten.vercel.app/demo en outreach a realtors.
 * Si DEMO_TOUR_ID no está seteado, muestra mensaje de "demo en
 * preparación" en vez de un 404 feo.
 */
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function DemoPage() {
  const tourId = process.env.DEMO_TOUR_ID;

  if (!tourId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
        <div className="text-center max-w-md px-6">
          <div className="serif-italic text-paseo-gold text-4xl mb-3">
            Demo en preparación
          </div>
          <p className="text-paseo-cream/60 text-sm">
            Ya casi. Volvé en unos minutos o escribinos a hello@athora.ai.
          </p>
        </div>
      </main>
    );
  }

  redirect(`/tour/${tourId}`);
}
