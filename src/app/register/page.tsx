'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Navbar from '@/components/Navbar';
import { createClient } from '@/lib/supabase/client';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);
    if (password.length < 6) {
      setErr('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) {
      setErr('No pudimos crear tu cuenta. Intenta con otro correo.');
      return;
    }
    if (data.session) {
      router.push('/dashboard');
      router.refresh();
      return;
    }
    setMsg('Te enviamos un correo para confirmar tu cuenta. Revisa tu bandeja.');
  }

  return (
    <main className="min-h-screen bg-paseo-dark">
      <Navbar cta={false} />
      <div className="max-w-md mx-auto px-6 py-20">
        <h1 className="text-4xl mb-2">
          Crea tu <span className="serif-italic text-paseo-gold">cuenta</span>
        </h1>
        <p className="text-paseo-cream/60 mb-8">Un paseo nuevo en menos de dos minutos.</p>

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
              placeholder="Mínimo 6 caracteres"
            />
          </div>
          {err && <p className="text-sm text-red-400">{err}</p>}
          {msg && <p className="text-sm text-paseo-gold">{msg}</p>}
          <button
            type="submit"
            disabled={loading}
            className="btn-gold w-full py-3 rounded-lg font-medium disabled:opacity-60"
          >
            {loading ? 'Creando…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="mt-6 text-sm text-paseo-cream/60">
          ¿Ya tienes cuenta?{' '}
          <Link href="/login" className="text-paseo-gold">
            Iniciar sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
