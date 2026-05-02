import Anthropic from '@anthropic-ai/sdk';

export interface SceneAnalysis {
  orden: number;
  tipo_espacio: string;
  paleta_hex: string[];
  direccion_siguiente: 'adelante' | 'izquierda' | 'derecha' | 'arriba' | 'abajo' | null;
  similitud_siguiente: 'alta' | 'media' | 'baja' | null;
  /** Descripción FIEL del espacio basada SOLO en lo que se ve en la foto.
   *  Mobiliario real, colores reales, materiales reales. Se usa como prompt
   *  para Skybox para que el panorama 360° sea fiel a la foto del cliente
   *  (sin inventar muebles ni cambiar el espacio). */
  descripcion_fiel: string;
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
    const desc = typeof item.descripcion_fiel === 'string' && item.descripcion_fiel.trim().length > 0
      ? item.descripcion_fiel.trim()
      : `${tipo} interior, real estate photography`;
    return {
      orden,
      tipo_espacio: tipo,
      paleta_hex: paleta.length > 0 ? paleta : ['#1a1a1c', '#d8a15a', '#f4ede1', '#8a8a8a', '#2c2c2e'],
      direccion_siguiente: dir,
      similitud_siguiente: sim,
      descripcion_fiel: desc,
    };
  });
}

export async function analyzePhotos(imageUrls: string[]): Promise<SceneAnalysis[]> {
  // Aceptar de 1 a 7 fotos (1 = vista 360 individual, 5+ = tour navegable)
  if (imageUrls.length < 1 || imageUrls.length > 7) {
    throw new Error('Se requieren entre 1 y 7 fotos.');
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Fetch images and convert to base64 — more reliable than URL source in SDK 0.30
  const imageBlocks = await Promise.all(
    imageUrls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`No se pudo cargar la imagen: ${url}`);
      const contentType = (res.headers.get('content-type') ?? 'image/jpeg') as
        | 'image/jpeg'
        | 'image/png'
        | 'image/gif'
        | 'image/webp';
      const buf = await res.arrayBuffer();
      const b64 = Buffer.from(buf).toString('base64');
      return {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: contentType, data: b64 },
      };
    })
  );

  const isSingle = imageUrls.length === 1;
  const lastIdx = imageUrls.length - 1;

  const textBlock = {
    type: 'text' as const,
    text: isSingle
      ? `Analiza esta foto de una propiedad inmobiliaria.

Devuelve SOLO un JSON array con UN objeto, sin explicación, sin markdown, sin texto extra. El objeto con las claves EXACTAS:
- orden: 0
- foto_original: 0
- tipo_espacio: string en español (ej: "sala", "cocina", "habitación principal", "baño", "comedor", "balcón", "entrada", "patio")
- paleta_hex: array de exactamente 5 strings hex de los colores DOMINANTES REALES en la foto (ej: ["#aabbcc", ...])
- direccion_siguiente: null
- similitud_siguiente: null
- descripcion_fiel: string en INGLÉS describiendo CON PRECISIÓN lo que se ve en la foto. Mobiliario real, colores reales, materiales reales (parquet, mármol, madera, etc), iluminación real (natural/artificial), elementos arquitectónicos reales (ventanas, puertas, columnas). NO INVENTES muebles, plantas, cuadros, ni elementos que no estén en la foto. Máximo 60 palabras. Termina con: ", real estate photography, equirectangular 360 panorama".`
      : `Analiza estas ${imageUrls.length} fotos de una propiedad inmobiliaria. Ordénalas en secuencia natural de recorrido (entrada → sala → cocina → habitaciones → baños → exterior). El campo "orden" debe ser el índice final (0..${lastIdx}) en el recorrido. Las fotos están numeradas en el orden en que aparecen (foto 0 es la primera). Cada objeto también debe tener "foto_original" que indica qué índice de entrada corresponde.

Devuelve SOLO un JSON array con ${imageUrls.length} objetos, sin explicación, sin markdown, sin texto extra. Cada objeto con las claves EXACTAS:
- orden: int (posición en el recorrido, 0..${lastIdx})
- foto_original: int (índice en el input original 0..${lastIdx})
- tipo_espacio: string en español (ej: "sala", "cocina", "habitación principal", "baño", "comedor", "balcón", "entrada", "patio")
- paleta_hex: array de exactamente 5 strings hex de los colores DOMINANTES REALES en cada foto (ej: ["#aabbcc", ...])
- direccion_siguiente: "adelante" | "izquierda" | "derecha" | "arriba" | "abajo" | null — cómo fluye visualmente esta escena hacia la siguiente
- similitud_siguiente: "alta" | "media" | "baja" | null — qué tan similares son los colores/composición con la siguiente
- descripcion_fiel: string en INGLÉS describiendo CON PRECISIÓN lo que se ve en cada foto. Mobiliario real, colores reales, materiales reales (parquet, mármol, madera, etc), iluminación real (natural/artificial), elementos arquitectónicos reales (ventanas, puertas, columnas). NO INVENTES muebles, plantas, cuadros, ni elementos que no estén en la foto. Máximo 60 palabras por foto. Termina cada descripción con: ", real estate photography, equirectangular 360 panorama".

La última escena (orden === ${lastIdx}) tiene direccion_siguiente y similitud_siguiente en null.`
  };

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    temperature: 0.1,
    system:
      'Eres un director técnico de fotogrametría arquitectónica. Tu única función es transcribir lo que la cámara registró, no interpretarlo. Reglas duras: ' +
      '1) Describe SOLO objetos visibles en el píxel. Si no está en la foto, no existe para ti. ' +
      '2) Nombra los colores con precisión técnica (warm cream, dusty grey, oak brown, off-white, charcoal). ' +
      '3) Nombra los materiales con precisión (light oak parquet, polished concrete, carrara marble, raw linen, brushed brass). ' +
      '4) Nombra la arquitectura literalmente (flat ceiling, central column, floor-to-ceiling window on the left wall). ' +
      '5) Si dudás si un objeto está, NO lo incluyas. Mejor descripción más corta que descripción inventada. ' +
      'Cada palabra que pongas será usada por un modelo de difusión para reconstruir la escena. Inventar = falla del entregable. ' +
      'Respondes SIEMPRE con JSON válido, sin prosa, sin explicaciones.',
    messages: [{ role: 'user', content: [...imageBlocks, textBlock] }]
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
