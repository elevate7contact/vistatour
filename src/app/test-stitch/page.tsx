/**
 * /test-stitch — Test page for OpenCV.js panorama stitching
 *
 * Sube N fotos del mismo cuarto desde un punto fijo (rotando 60-90° cada vez).
 * OpenCV.js las une en un panorama equirectangular en el navegador.
 * Cero llamada al backend, cero costo, 100% fidelidad.
 *
 * Reemplazo definitivo de Skybox para VistaTour.
 */
'use client';

import { useState, useRef, useEffect } from 'react';

declare global {
  interface Window {
    cv: any;
  }
}

export default function TestStitchPage() {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [status, setStatus] = useState<string>('Cargando OpenCV.js...');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [cvReady, setCvReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Cargar OpenCV.js dinámicamente desde el bundle
    import('@techstark/opencv-js').then((cvModule) => {
      const cv = cvModule.default;
      if (cv && cv.Mat) {
        window.cv = cv;
        setCvReady(true);
        setStatus('OpenCV.js listo. Subí 4-6 fotos del mismo cuarto rotando 60-90° cada vez.');
      } else if (cv && cv.onRuntimeInitialized !== undefined) {
        cv.onRuntimeInitialized = () => {
          window.cv = cv;
          setCvReady(true);
          setStatus('OpenCV.js listo. Subí 4-6 fotos del mismo cuarto rotando 60-90° cada vez.');
        };
      }
    }).catch((err) => {
      setStatus('Error cargando OpenCV.js: ' + err.message);
    });
  }, []);

  const onFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length < 2) {
      setStatus('Necesito al menos 2 fotos. Idealmente 4-6.');
      return;
    }
    setFiles(selected);
    setPreviews(selected.map((f) => URL.createObjectURL(f)));
    setResultUrl(null);
    setElapsedMs(null);
    setStatus(`${selected.length} fotos cargadas. Click "Stitch" para procesar.`);
  };

  const stitch = async () => {
    if (!cvReady || files.length < 2) return;
    const cv = window.cv;
    setStatus('Cargando imágenes a memoria...');
    const t0 = performance.now();

    try {
      // Cargar imágenes en cv.MatVector
      const matVec = new cv.MatVector();
      for (const file of files) {
        const img = await loadImage(file);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const mat = cv.imread(canvas);
        // OpenCV stitcher espera BGR (3 canales). imread devuelve RGBA. Convertir.
        const bgr = new cv.Mat();
        cv.cvtColor(mat, bgr, cv.COLOR_RGBA2BGR);
        matVec.push_back(bgr);
        mat.delete();
      }

      setStatus('Stitching panorama (esto puede tardar 5-15s)...');
      await new Promise((r) => setTimeout(r, 50)); // dar chance al UI de actualizar

      const stitcher = new cv.Stitcher.create(cv.Stitcher_PANORAMA);
      const result = new cv.Mat();
      const stitchStatus = stitcher.stitch(matVec, result);

      const t1 = performance.now();
      setElapsedMs(Math.round(t1 - t0));

      if (stitchStatus !== 0) {
        setStatus(
          `❌ Stitching falló (status ${stitchStatus}). Las fotos no tienen suficiente solape. Tomá más fotos con más overlap.`
        );
        matVec.delete();
        result.delete();
        return;
      }

      // Convertir resultado a canvas para mostrar
      const canvas = canvasRef.current!;
      cv.imshow(canvas, result);
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', 0.92)
      );
      if (blob) {
        setResultUrl(URL.createObjectURL(blob));
        setStatus(`✅ Panorama generado en ${Math.round(t1 - t0)}ms. ${result.cols}×${result.rows}px.`);
      }

      matVec.delete();
      result.delete();
    } catch (err: any) {
      setStatus('Error: ' + (err.message || String(err)));
      console.error(err);
    }
  };

  const loadImage = (file: File): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });

  return (
    <main className="min-h-screen bg-paseo-dark text-paseo-cream p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="serif-italic text-paseo-gold text-5xl mb-2">Test Stitcher</h1>
        <p className="text-paseo-cream/70 text-sm mb-8">
          OpenCV.js · client-side · 0 backend · 0 costo
        </p>

        <div className="border-2 border-dashed border-paseo-gold/40 rounded-lg p-6 mb-6">
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={onFilesSelected}
            disabled={!cvReady}
            className="text-paseo-cream"
          />
        </div>

        <div className="mb-6 p-4 bg-paseo-dark/50 border border-paseo-gold/20 rounded text-sm">
          {status}
        </div>

        {previews.length > 0 && (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2 mb-6">
            {previews.map((src, i) => (
              <img key={i} src={src} alt={`foto ${i + 1}`} className="rounded w-full h-24 object-cover" />
            ))}
          </div>
        )}

        {files.length >= 2 && cvReady && !resultUrl && (
          <button
            onClick={stitch}
            className="bg-paseo-gold text-paseo-dark px-8 py-3 rounded font-bold hover:scale-105 transition"
          >
            Stitch panorama →
          </button>
        )}

        {elapsedMs !== null && (
          <div className="text-paseo-gold text-sm mb-4">
            Tiempo total: {elapsedMs}ms · {(elapsedMs / 1000).toFixed(2)}s
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: resultUrl ? 'block' : 'none', maxWidth: '100%' }} />

        {resultUrl && (
          <div className="mt-6">
            <h2 className="text-paseo-gold text-xl mb-3">Resultado:</h2>
            <img src={resultUrl} alt="panorama" className="w-full rounded border border-paseo-gold/30" />
            <a
              href={resultUrl}
              download="panorama.jpg"
              className="inline-block mt-4 bg-paseo-gold text-paseo-dark px-6 py-2 rounded font-bold"
            >
              Descargar panorama
            </a>
          </div>
        )}
      </div>
    </main>
  );
}
