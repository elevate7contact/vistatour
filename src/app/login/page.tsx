'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setErr('No pudimos iniciar sesión. Revisa tu correo y contraseña.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-paseo-dark">
      <Navbar cta={false} />
      <div className="max-w-md mx-auto px-6 py-20">
        <h1 className="text-4xl mb-2">
          Bienvenido de <span className="serif-italic text-paseo-gold">vuelta</span>
        </h1>
        <p className="text-paseo-cream/60 mb-8">Entra para ver tus paseos.</p>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm block mb-1.5 text-paseo-cream/75">Correo</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full"
              placeholder="tu@correo.com"
            />
          </div>
          <div>
            <label className="text-sm block mb-1.5 text-paseo-cream/75">Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full"
              placeholder="••••••••"
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full py-3 rounded-lg font-medium disabled:opacity-60"
          >
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="mt-6 text-sm text-paseo-cream/60">
          ¿No tienes cuenta?{' '}
          <Link href="/register" className="text-paseo-gold">
            Crear una
          </Link>
        </p>
      </div>
    </main>
  );
}
