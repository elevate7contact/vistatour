/**
 * /api/tours/[id]/detect-hotspots
 * ─────────────────────────────────────────────────────────────────
 * POST → para cada scene del tour, Claude analiza el panorama y detecta
 *        dónde están las puertas/aperturas que conectan a otras habitaciones.
 *        Calcula yaw/pitch del hotspot y lo asigna a la próxima scene
 *        (según el orden de scenes).
 *
 * Estrategia simple para MVP:
 * - scene[0] tiene 1 hotspot → scene[1] (con yaw/pitch detectado por Claude)
 * - scene[1] tiene 2 hotspots → scene[0] (atrás) + scene[2] (adelante)
 * - ...
 * - scene[n-1] tiene 1 hotspot → scene[n-2] (atrás)
 *
 * Si Claude no detecta puerta clara, usa default (yaw=0 pitch=-0.3 = al frente, al piso).
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import Anthropic from '@anthropic-ai/sdk';

interface HotspotPosition {
  yaw: number;
  pitch: number;
}

async function detectDoorPosition(panoramaUrl: string, targetLabel: string): Promise<HotspotPosition> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { yaw: 0, pitch: -0.3 }; // fallback
  }
  const anthropic = new Anthropic({ apiKey });

  try {
    // Descargar imagen y convertir a base64
    const imgRes = await fetch(panoramaUrl);
    if (!imgRes.ok) return { yaw: 0, pitch: -0.3 };
    const buf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buf).toString('base64');
    const mediaType = imgRes.headers.get('content-type') || 'image/jpeg';

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 200,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType as any,
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Esta es una imagen panorámica equirectangular 360°. La imagen va de izquierda a derecha cubriendo 360° (yaw -π a π), y de arriba abajo cubriendo 180° (pitch -π/2 a π/2).

Identifica la puerta o apertura más prominente que llevaría a una habitación distinta (idealmente etiquetada como "${targetLabel}").

Responde SOLO con un JSON con dos números entre paréntesis:
{"yaw": <radianes entre -3.14 y 3.14>, "pitch": <radianes entre -1.5 y 1.5>}

Donde yaw=0 es el centro de la imagen y pitch=0 es el horizonte. Pitch negativo = abajo (al piso). Para un hotspot natural en una puerta, pitch típico es entre -0.4 y -0.2.

Si no hay puerta clara, devuelve {"yaw": 0, "pitch": -0.3}.`,
          },
        ],
      }],
    });

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const match = text.match(/\{[^}]*"yaw"[^}]*"pitch"[^}]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      const yaw = Math.max(-Math.PI, Math.min(Math.PI, Number(parsed.yaw) || 0));
      const pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(parsed.pitch) || -0.3));
      return { yaw, pitch };
    }
  } catch (e) {
    console.error('[detect-hotspots] Claude error:', e);
  }
  return { yaw: 0, pitch: -0.3 };
}

export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supa = createAdminClient();
    const { data: scenes, error } = await supa
      .from('scenes')
      .select('id, orden, tipo_espacio, panorama_url, panorama_status')
      .eq('tour_id', params.id)
      .order('orden', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!scenes || scenes.length < 2) {
      return NextResponse.json({ error: 'Se necesitan al menos 2 escenas' }, { status: 400 });
    }

    // Solo procesar las que tienen panorama listo
    const ready = scenes.filter((s: any) => s.panorama_status === 'complete' && s.panorama_url);
    if (ready.length < 2) {
      return NextResponse.json({ error: 'No hay suficientes panoramas listos' }, { status: 400 });
    }

    // Para cada escena, calcular hotspots a las adyacentes (orden anterior y siguiente)
    const updates = await Promise.all(
      ready.map(async (s: any, idx: number) => {
        const hotspots: any[] = [];
        const prev = idx > 0 ? ready[idx - 1] : null;
        const next = idx < ready.length - 1 ? ready[idx + 1] : null;

        if (next) {
          const pos = await detectDoorPosition(s.panorama_url, next.tipo_espacio || 'siguiente habitación');
          hotspots.push({
            id: `hs-${s.id}-fwd`,
            to_scene_id: next.id,
            label: next.tipo_espacio || `Escena ${next.orden + 1}`,
            position: pos,
            icon: 'arrow-forward',
          });
        }
        if (prev) {
          // Para el hotspot "atrás", asumimos yaw opuesto al de adelante (si existe).
          // Si no existe próximo, calculamos posición con Claude.
          let pos: HotspotPosition;
          if (next) {
            const fwdHotspot = hotspots[0];
            pos = {
              yaw: fwdHotspot.position.yaw + Math.PI,
              pitch: fwdHotspot.position.pitch,
            };
            // Normalizar yaw a -π/π
            while (pos.yaw > Math.PI) pos.yaw -= 2 * Math.PI;
            while (pos.yaw < -Math.PI) pos.yaw += 2 * Math.PI;
          } else {
            pos = await detectDoorPosition(s.panorama_url, prev.tipo_espacio || 'habitación anterior');
          }
          hotspots.push({
            id: `hs-${s.id}-back`,
            to_scene_id: prev.id,
            label: prev.tipo_espacio || `Escena ${prev.orden + 1}`,
            position: pos,
            icon: 'door',
          });
        }

        await supa.from('scenes').update({ hotspots }).eq('id', s.id);
        return { sceneId: s.id, hotspotsCount: hotspots.length };
      })
    );

    return NextResponse.json({ tourId: params.id, scenes: updates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Error' }, { status: 500 });
  }
}
