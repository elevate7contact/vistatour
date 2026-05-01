/**
 * /api/admin/confirm-user
 * ─────────────────────────────────────────────────────────────────
 * Confirma manualmente una cuenta de Supabase que quedó zombie
 * (registrada pero sin email confirmado — típico cuando la rate-limit
 * del free tier dropea el correo).
 *
 * Uso (curl):
 *   curl -X POST https://vistatour.vercel.app/api/admin/confirm-user \
 *     -H "x-admin-token: <ADMIN_TOKEN>" \
 *     -H "Content-Type: application/json" \
 *     -d '{"email":"juan@ejemplo.com"}'
 *
 * Protección: header x-admin-token debe matchear ADMIN_TOKEN env var.
 * Si ADMIN_TOKEN no está seteado, el endpoint responde 503 (apagado).
 *
 * Permisos: usa SUPABASE_SERVICE_ROLE_KEY (admin client) — necesario
 * para tocar auth.users.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    return NextResponse.json(
      { error: 'Endpoint deshabilitado: ADMIN_TOKEN no configurado.' },
      { status: 503 }
    );
  }

  const provided = req.headers.get('x-admin-token');
  if (provided !== adminToken) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body JSON inválido' }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: 'Falta email en body' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Buscar usuario por email (paginar si hay muchos — para MVP basta page 1)
  const { data: list, error: errList } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (errList) {
    return NextResponse.json({ error: errList.message }, { status: 500 });
  }
  const user = list.users.find((u) => u.email?.toLowerCase() === email);
  if (!user) {
    return NextResponse.json({ error: `No existe usuario con email ${email}` }, { status: 404 });
  }

  // Si ya está confirmado, idempotente OK
  if (user.email_confirmed_at) {
    return NextResponse.json({
      ok: true,
      already_confirmed: true,
      user_id: user.id,
      email: user.email,
    });
  }

  // Confirmar
  const { error: errUpd } = await admin.auth.admin.updateUserById(user.id, {
    email_confirm: true,
  });
  if (errUpd) {
    return NextResponse.json({ error: errUpd.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    confirmed: true,
    user_id: user.id,
    email: user.email,
  });
}
