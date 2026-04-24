import Anthropic from '@anthropic-ai/sdk';

export interface SceneAnalysis {
  orden: number;
  tipo_espacio: string;
  paleta_hex: string[];
  direccion_siguiente: 'adelante' | 'izquierda' | 'derecha' | 'arriba' | 'abajo' | null;
  similitud_siguiente: 'alta' | 'media' | 'baja' | null;
}

const DIRECCIONES = new Set(['adelante', 'izquierda', 'derecha', 'arriba', 'abajo']);
const SIMILITUDES = new Set(['alta', 'media', 'baja']);

function stripFences(text: string): string {
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return (fence ? fence[1] : text).trim();
}

function parseScenes(raw: string, n: number): SceneAnalysis[] {
  const jsonText = stripFences(raw);
  const parsed = JSON.parse(jsonText);
  if (!Array.isArray(parsed) || parsed.length !== n) {
    throw new Error('Respuesta de IA con formato inválido.');
  }
  return parsed.map((item, idx): SceneAnalysis => {
    const orden = typeof item.orden === 'number' ? item.orden : idx;
    const tipo = typeof item.tipo_espacio === 'string' ? item.tipo_espacio : 'espacio';
    const paleta: string[] = Array.isArray(item.paleta_hex)
      ? item.paleta_hex.filter((h: unknown): h is string => typeof h === 'string').slice(0, 5)
      : [];
    const dir = typeof item.direccion_siguiente === 'string' && DIRECCIONES.has(item.direccion_siguiente)
      ? (item.direccion_siguiente as SceneAnalysis['direccion_siguiente'])
      : null;
    const sim = typeof item.similitud_siguiente === 'string' && SIMILITUDES.has(item.similitud_siguiente)
      ? (item.similitud_siguiente as SceneAnalysis['similitud_siguiente'])
      : null;
    return {
      orden,
      tipo_espacio: tipo,
      paleta_hex: paleta.length > 0 ? paleta : ['#1a1a1c', '#d8a15a', '#f4ede1', '#8a8a8a', '#2c2c2e'],
      direccion_siguiente: dir,
      similitud_siguiente: sim
    };
  });
}

export async function analyzePhotos(imageUrls: string[]): Promise<SceneAnalysis[]> {
  if (imageUrls.length < 5 || imageUrls.length > 7) {
    throw new Error('Se requieren entre 5 y 7 fotos.');
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const imageBlocks = imageUrls.map((url) => ({
    type: 'image' as const,
    source: { type: 'url' as const, url }
  }));

  const textBlock = {
    type: 'text' as const,
    text: `Analiza estas ${imageUrls.length} fotos de una propiedad inmobiliaria. Ordénalas en secuencia natural de recorrido (entrada → sala → cocina → habitaciones → baños → exterior). El campo "orden" debe ser el índice final (0..${imageUrls.length - 1}) en el recorrido. Las fotos están numeradas en el orden en que aparecen (foto 0 es la primera). Cada objeto también debe tener "foto_original" que indica qué índice de entrada corresponde.

Devuelve SOLO un JSON array con ${imageUrls.length} objetos, sin explicación, sin markdown, sin texto extra. Cada objeto con las claves EXACTAS:
- orden: int (posición en el recorrido, 0..${imageUrls.length - 1})
- foto_original: int (índice en el input original 0..${imageUrls.length - 1})
- tipo_espacio: string en español (ej: "sala", "cocina", "habitación principal", "baño", "comedor", "balcón", "entrada", "patio")
- paleta_hex: array de exactamente 5 strings hex (ej: ["#aabbcc", ...])
- direccion_siguiente: "adelante" | "izquierda" | "derecha" | "arriba" | "abajo" | null — cómo fluye visualmente esta escena hacia la siguiente
- similitud_siguiente: "alta" | "media" | "baja" | null — qué tan similares son los colores/composición con la siguiente

La última escena (orden === ${imageUrls.length - 1}) tiene direccion_siguiente y similitud_siguiente en null.`
  };

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2000,
    temperature: 0.3,
    system:
      'Eres un director de tours virtuales inmobiliarios. Ordenas fotos de una propiedad en una secuencia narrativa fluida y analizas cada escena con precisión. Respondes SIEMPRE con JSON válido, sin prosa.',
    // El SDK v0.30 aún tipa `source` como base64; la API acepta `{type:'url', url}` en runtime.
    messages: [{ role: 'user', content: [...imageBlocks, textBlock] as unknown as [] }]
  });

  const first = msg.content[0];
  if (!first || first.type !== 'text') {
    throw new Error('La IA no devolvió texto analizable.');
  }

  try {
    const scenes = parseScenes(first.text, imageUrls.length);
    scenes.sort((a, b) => a.orden - b.orden);
    scenes.forEach((s, i) => {
      s.orden = i;
      if (i === scenes.length - 1) {
        s.direccion_siguiente = null;
        s.similitud_siguiente = null;
      }
    });
    // Re-attach foto_original index from parsed raw to map image_urls later.
    const rawParsed = JSON.parse(stripFences(first.text)) as Array<{ foto_original?: number }>;
    rawParsed.forEach((r, i) => {
      if (typeof r.foto_original === 'number') {
        (scenes[i] as SceneAnalysis & { foto_original?: number }).foto_original = r.foto_original;
      }
    });
    return scenes;
  } catch (err) {
    throw new Error(`No se pudo interpretar el análisis de la IA: ${(err as Error).message}`);
  }
}
