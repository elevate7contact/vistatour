/**
 * stitcher.ts — Stitching de fotos a panoramas con OpenCV.js (client-side).
 *
 * Reemplaza Skybox: el realtor sube N fotos del mismo cuarto y este módulo
 * las une en un panorama equirectangular real. Si el aspect ratio del resultado
 * es ≥ 1.85 (panorama nativo), el endpoint /api/tours hace bypass total
 * de Skybox y usa la imagen directo como panorama_url.
 *
 * Cero costo, cero API externa, 100% fidelidad al espacio real.
 */

let cvPromise: Promise<any> | null = null;

/**
 * Carga OpenCV.js una sola vez. Devuelve el módulo cuando está listo.
 */
export function loadOpenCV(): Promise<any> {
  if (cvPromise) return cvPromise;
  cvPromise = import('@techstark/opencv-js').then((mod) => {
    const cv = mod.default;
    if (cv && cv.Mat) return cv;
    return new Promise((resolve) => {
      cv.onRuntimeInitialized = () => resolve(cv);
    });
  });
  return cvPromise;
}

/**
 * Une un grupo de fotos (mismo cuarto, mismo punto, rotando) en un panorama.
 * Retorna un File JPG listo para subir como si fuera una foto panorámica nativa.
 *
 * @param files - 2 a 8 fotos del mismo cuarto, idealmente con 30-50% de overlap
 * @param outputName - nombre del archivo de salida
 * @returns File JPG con el panorama equirectangular, o null si stitching falla
 */
export async function stitchToPanorama(
  files: File[],
  outputName = 'panorama.jpg'
): Promise<{ file: File; width: number; height: number; durationMs: number } | null> {
  if (files.length < 2) {
    throw new Error('Necesito al menos 2 fotos para stitchear');
  }

  const cv = await loadOpenCV();
  const t0 = performance.now();

  // 1) Cargar cada foto en cv.Mat (BGR)
  const matVec = new cv.MatVector();
  try {
    for (const file of files) {
      const img = await loadImage(file);
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const rgba = cv.imread(canvas);
      const bgr = new cv.Mat();
      cv.cvtColor(rgba, bgr, cv.COLOR_RGBA2BGR);
      matVec.push_back(bgr);
      rgba.delete();
    }

    // 2) Stitch
    const stitcher = new cv.Stitcher.create(cv.Stitcher_PANORAMA);
    const result = new cv.Mat();
    const status = stitcher.stitch(matVec, result);

    if (status !== 0) {
      // 0 = OK, 1 = NEED_MORE_IMGS, 2 = HOMOGRAPHY_FAIL, 3 = CAMERA_PARAMS_ADJUST_FAIL
      const reasons: Record<number, string> = {
        1: 'Necesitan más fotos o más overlap entre ellas',
        2: 'Las fotos no tienen suficientes puntos en común — más overlap',
        3: 'Falló el ajuste de parámetros — fotos muy distintas en exposición o ángulo',
      };
      const reason = reasons[status] || `Error desconocido (status ${status})`;
      throw new Error(`Stitching falló: ${reason}`);
    }

    // 3) Convertir Mat → canvas → File
    const outCanvas = document.createElement('canvas');
    cv.imshow(outCanvas, result);
    const blob = await new Promise<Blob | null>((resolve) =>
      outCanvas.toBlob(resolve, 'image/jpeg', 0.92)
    );
    const width = result.cols;
    const height = result.rows;
    result.delete();

    if (!blob) throw new Error('No pude generar el JPG del panorama');

    const file = new File([blob], outputName, { type: 'image/jpeg' });
    const durationMs = Math.round(performance.now() - t0);

    return { file, width, height, durationMs };
  } finally {
    matVec.delete();
  }
}

/**
 * Stitchea múltiples grupos en paralelo (lógico) — devuelve N panoramas.
 *
 * @param groups - array de grupos, cada grupo es un array de Files del mismo cuarto
 * @returns array de Files panorama, en el mismo orden de los grupos
 */
export async function stitchMultipleScenes(
  groups: File[][],
  onProgress?: (current: number, total: number, status: string) => void
): Promise<File[]> {
  const results: File[] = [];
  for (let i = 0; i < groups.length; i++) {
    onProgress?.(i + 1, groups.length, `Procesando escena ${i + 1}/${groups.length}...`);
    const out = await stitchToPanorama(groups[i], `escena-${i + 1}.jpg`);
    if (!out) throw new Error(`Falló la escena ${i + 1}`);
    results.push(out.file);
  }
  return results;
}

/**
 * Verifica si un panorama resultante cumple el aspect ratio mínimo (1.85)
 * para que el backend lo trate como panorama nativo y skipee Skybox.
 */
export function isPanoramaNative(width: number, height: number): boolean {
  return width / height >= 1.85;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
