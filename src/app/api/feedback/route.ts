/**
 * /api/feedback
 * ─────────────────────────────────────────────────────────────────
 * POST — recibe feedback del visitante de un tour (cualquier realtor
 *        que el usuario comparta el link puede dejar feedback sin
 *        registrarse).
 *
 * Body: { tourId?: string, rating: 'up'|'down'|'meh', wouldPay?: string, comment?: string }
 *
 * Anti-spam: cap simple de longitud. Sin auth — la tabla está
 * protegida por RLS y solo el admin client puede leer.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

const VALID_RATINGS = new Set(['up', 'down', 'meh']);
const VALID_PAY = new Set(['yes', 'no', 'maybe']);

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const rating = String(body.rating ?? '').toLowerCase();
  if (!VALID_RATINGS.has(rating)) {
    return NextResponse.json({ error: 'rating inválido' }, { status: 400 });
  }

  const wouldPay = body.wouldPay ? String(body.wouldPay).toLowerCase() : null;
  if (wouldPay && !VALID_PAY.has(wouldPay)) {
    return NextResponse.json({ error: 'wouldPay inválido' }, { status: 400 });
  }

  const comment = (body.comment ? String(body.comment) : '').slice(0, 1000);
  const tourId = body.tourId ? String(body.tourId).slice(0, 64) : null;

  const supa = createAdminClient();
  const { error } = await supa.from('feedback').insert({
    tour_id: tourId,
    rating,
    would_pay: wouldPay,
    comment: comment || null,
    user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    referrer: req.headers.get('referer')?.slice(0, 300) ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
