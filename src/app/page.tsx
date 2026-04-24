import Link from 'next/link';
import Navbar from '@/components/Navbar';
import HeroAnimated from '@/components/HeroAnimated';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-paseo-dark text-paseo-cream">
      <Navbar />

      <section className="relative h-[88vh] w-full flex items-center justify-center text-center overflow-hidden">
        <HeroAnimated />
        <div className="relative z-10 max-w-3xl px-6">
          <h1 className="text-5xl md:text-7xl leading-tight tracking-tight font-medium">
            No es un tour.{' '}
            <span className="serif-italic text-paseo-gold">Es un paseo.</span>
          </h1>
          <p className="mt-6 text-base md:text-lg text-paseo-cream/75 max-w-xl mx-auto">
            Convierte 5 a 7 fotos de un inmueble en un recorrido virtual inmersivo en 90 segundos.
            Sin equipos caros. Sin curva de aprendizaje. Solo fotos.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/register"
              className="btn-gold px-6 py-3 rounded-full font-medium"
            >
              Crear mi primer paseo gratis
            </Link>
            <Link href="/login" className="btn-outline px-6 py-3 rounded-full">
              Ya tengo cuenta
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-24">
        <p className="text-center text-sm uppercase tracking-widest text-paseo-gold mb-4">
          Cómo funciona
        </p>
        <h2 className="text-center text-3xl md:text-5xl mb-14">
          Tres pasos. <span className="serif-italic text-paseo-gold">Un paseo.</span>
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: '01', t: 'Sube 5 a 7 fotos', d: 'Jpg, png o webp. Desde tu celular o computador.' },
            { n: '02', t: 'La IA ordena el recorrido', d: 'Detecta espacios, paletas y flujo natural de la propiedad.' },
            { n: '03', t: 'Compartes un link', d: 'Un paseo inmersivo listo para WhatsApp, Instagram o email.' }
          ].map((s) => (
            <div key={s.n} className="card p-8">
              <div className="serif-italic text-paseo-gold text-4xl mb-4">{s.n}</div>
              <h3 className="text-xl mb-2">{s.t}</h3>
              <p className="text-paseo-cream/65 text-sm">{s.d}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 text-center">
          <Link
            href="/register"
            className="btn-gold inline-block px-8 py-3 rounded-full font-medium"
          >
            Empezar ahora
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-paseo-cream/40">
        Paseo — Athora AI — 2026
      </footer>
    </main>
  );
}
