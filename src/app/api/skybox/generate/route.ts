import { NextRequest, NextResponse } from 'next/server';

const SKYBOX_BASE = 'https://backend.blockadelabs.com/api/v1';

function apiKey() {
  const k = process.env.SKYBOX_API_KEY;
  if (!k) throw new Error('SKYBOX_API_KEY no configurada en variables de entorno');
  return k;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const prompt: string = body?.prompt;
    const styleId: number = body?.styleId ?? 67;
    const controlImageUrl: string | undefined = body?.controlImageUrl;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Falta prompt' }, { status: 400 });
    }

    const fd = new FormData();
    fd.append('prompt', prompt);
    fd.append('skybox_style_id', String(styleId));
    fd.append('enhance_prompt', 'true');

    // Adjuntar la foto real del usuario como imagen de referencia
    if (controlImageUrl) {
      const imgRes = await fetch(controlImageUrl);
      if (imgRes.ok) {
        const blob = await imgRes.blob();
        fd.append('control_image', blob, 'reference.jpg');
      }
    }

    const r = await fetch(`${SKYBOX_BASE}/skybox`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey() },
      body: fd,
    });

    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json(
        { error: 'Skybox POST falló', detail: txt.slice(0, 300), status: r.status },
        { status: 502 }
      );
    }

    const data = await r.json();
    return NextResponse.json({ jobId: data.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error desconocido' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 });

    const r = await fetch(`${SKYBOX_BASE}/imagine/requests/${id}`, {
      headers: { 'x-api-key': apiKey() },
    });
    if (!r.ok) {
      return NextResponse.json({ error: 'Skybox GET falló', status: r.status }, { status: 502 });
    }

    const data = await r.json();
    const reqInfo = data.request ?? data;
    const status: string = reqInfo.status ?? 'pending';

    if (status === 'complete') {
      return NextResponse.json({
        status: 'complete',
        fileUrl: reqInfo.file_url || reqInfo.thumb_url,
      });
    }
    if (status === 'error' || status === 'abort') {
      return NextResponse.json({ status: 'error', error: reqInfo.error_message ?? status });
    }
    return NextResponse.json({ status: 'pending', detail: status });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error desconocido' }, { status: 500 });
  }
}
