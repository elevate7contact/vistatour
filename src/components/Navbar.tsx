import Link from 'next/link';

export default function Navbar({ cta = true }: { cta?: boolean }) {
  return (
    <header className="w-full px-6 md:px-10 py-5 flex items-center justify-between border-b border-white/5">
      <Link href="/" className="flex items-center gap-2 text-paseo-cream">
        <span className="text-2xl tracking-tight font-semibold">Paseo</span>
        <span className="serif-italic text-paseo-gold text-lg hidden sm:inline">.</span>
      </Link>
      {cta && (
        <nav className="flex items-center gap-3">
          <Link href="/login" className="btn-outline px-4 py-2 rounded-lg text-sm">
            Iniciar sesión
          </Link>
          <Link href="/register" className="btn-gold px-4 py-2 rounded-lg text-sm font-medium">
            Crear cuenta
          </Link>
        </nav>
      )}
    </header>
  );
}
