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

      {/* === Sección demo video real === */}
      <section className="relative bg-paseo-dark py-24 overflow-hidden">
        {/* Glow gold ambient */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-paseo-gold/10 blur-[120px] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6">
          <p className="text-center text-sm uppercase tracking-widest text-paseo-gold mb-4">
            Demo en vivo
          </p>
          <h2 className="text-center text-3xl md:text-5xl mb-16">
            Así se ve un{' '}
            <span className="serif-italic text-paseo-gold">paseo real.</span>
          </h2>

          <div className="flex flex-col lg:flex-row items-center justify-center gap-12 lg:gap-20">
            {/* Video vertical mockup tipo phone */}
            <div className="relative shrink-0">
              <div
                className="relative rounded-[42px] overflow-hidden border-2 border-paseo-gold/25 shadow-2xl shadow-paseo-gold/15 bg-black"
                style={{ aspectRatio: '9 / 16', width: 'min(340px, 100%)' }}
              >
                <video
                  className="w-full h-full object-cover"
                  autoPlay
                  loop
                  muted
                  playsInline
                  poster="/videos/inmueble-poster.jpg"
                  preload="metadata"
                >
                  <source src="/videos/inmueble.mp4" type="video/mp4" />
                  Tu navegador no soporta video HTML5.
                </video>
                {/* Notch decorativo phone */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-black rounded-full" />
              </div>
              {/* Reflejo sutil debajo */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-paseo-gold/10 blur-2xl rounded-full" />
            </div>

            {/* Texto al lado */}
            <div className="flex-1 max-w-md text-center lg:text-left">
              <p className="text-2xl md:text-3xl text-paseo-cream/95 leading-snug mb-6 font-medium">
                De 5 fotos planas a un recorrido inmersivo de 60 segundos.
              </p>
              <p className="text-paseo-cream/65 leading-relaxed mb-8">
                Sin productora. Sin cámara 360°. Sin reshoots.
                Solo las fotos del celular del realtor → un paseo virtual listo para
                WhatsApp, Instagram o email del cliente.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                <Link
                  href="/register"
                  className="btn-gold inline-block px-6 py-3 rounded-full font-medium"
                >
                  Crear el mío gratis
                </Link>
                <Link
                  href="#como-funciona"
                  className="btn-outline inline-block px-6 py-3 rounded-full"
                >
                  Ver cómo funciona
                </Link>
              </div>
              <p className="mt-6 text-xs text-paseo-cream/40 uppercase tracking-widest">
                Caso real · Inmueble en Bogotá
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="max-w-5xl mx-auto px-6 py-24">
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
