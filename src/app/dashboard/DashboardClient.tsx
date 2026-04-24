'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function DashboardClient() {
  const router = useRouter();
  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }
  return (
    <button onClick={logout} className="btn-outline px-4 py-2 rounded-lg text-sm">
      Salir
    </button>
  );
}
