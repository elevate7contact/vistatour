'use client';

/**
 * Skybox360Viewer
 * ─────────────────────────────────────────────────────────
 * Visor 360° equirectangular con Three.js. Recibe la URL del panorama
 * generado por Skybox AI (vía /api/skybox/generate) y la renderiza
 * dentro de una esfera invertida con cámara perspectiva — el usuario
 * puede arrastrar para mirar alrededor (mouse + touch).
 *
 * Three.js se importa dinámicamente para no engordar el bundle inicial.
 */
import { X, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface Props {
  panoramaUrl: string;
  title?: string;
  onClose: () => void;
}

export default function Skybox360Viewer({ panoramaUrl, title, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let raf = 0;
    let disposed = false;
    const cleanup: Array<() => void> = [];

    (async () => {
      const THREE = await import('three');
      if (disposed || !containerRef.current) return;

      const container = containerRef.current;
      const w = container.clientWidth;
      const h = container.clientHeight;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(75, w / h, 0.1, 1100);
      camera.position.set(0, 0, 0.01);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(w, h);
      container.appendChild(renderer.domElement);

      const geometry = new THREE.SphereGeometry(500, 60, 40);
      geometry.scale(-1, 1, 1);

      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      const texture = loader.load(panoramaUrl, () => setLoading(false));
      const material = new THREE.MeshBasicMaterial({ map: texture });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);

      let lon = 0, lat = 0;
      let targetLon = 0, targetLat = 0;
      let isDragging = false;
      let lastX = 0, lastY = 0;

      function onPointerDown(e: PointerEvent) {
        isDragging = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
      function onPointerMove(e: PointerEvent) {
        if (!isDragging) return;
        targetLon -= (e.clientX - lastX) * 0.2;
        targetLat += (e.clientY - lastY) * 0.2;
        targetLat = Math.max(-85, Math.min(85, targetLat));
        lastX = e.clientX;
        lastY = e.clientY;
      }
      function onPointerUp() {
        isDragging = false;
      }
      function onWheel(e: WheelEvent) {
        e.preventDefault();
        camera.fov = Math.max(35, Math.min(95, camera.fov + e.deltaY * 0.05));
        camera.updateProjectionMatrix();
      }
      function onResize() {
        const ww = container.clientWidth;
        const hh = container.clientHeight;
        camera.aspect = ww / hh;
        camera.updateProjectionMatrix();
        renderer.setSize(ww, hh);
      }

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', onResize);

      function animate() {
        if (disposed) return;
        lon += (targetLon - lon) * 0.08;
        lat += (targetLat - lat) * 0.08;
        const phi = THREE.MathUtils.degToRad(90 - lat);
        const theta = THREE.MathUtils.degToRad(lon);
        const x = 500 * Math.sin(phi) * Math.cos(theta);
        const y = 500 * Math.cos(phi);
        const z = 500 * Math.sin(phi) * Math.sin(theta);
        camera.lookAt(x, y, z);
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      }
      animate();

      cleanup.push(() => {
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('wheel', onWheel);
        window.removeEventListener('resize', onResize);
        cancelAnimationFrame(raf);
        renderer.dispose();
        geometry.dispose();
        material.dispose();
        texture.dispose();
        if (renderer.domElement.parentElement) {
          renderer.domElement.parentElement.removeChild(renderer.domElement);
        }
      });

      // botón reset desde fuera
      (container as any).__resetView = () => {
        targetLon = 0;
        targetLat = 0;
        camera.fov = 75;
        camera.updateProjectionMatrix();
      };
    })();

    return () => {
      disposed = true;
      cleanup.forEach((fn) => fn());
    };
  }, [panoramaUrl]);

  function toggleFull() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
      setFull(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setFull(false);
    }
  }

  function resetView() {
    const fn = (containerRef.current as any)?.__resetView;
    fn?.();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black">
      <div ref={containerRef} className="relative w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-10 pointer-events-none">
          <div className="text-paseo-cream/80 text-sm">Cargando panorama 360°…</div>
        </div>
      )}

      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 text-paseo-cream/90">
        <span className="text-sm font-medium">{title ?? 'Modo Caminar'}</span>
      </div>

      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={resetView}
          className="bg-black/60 hover:bg-black/80 backdrop-blur rounded-full p-2 text-white"
          aria-label="Resetear vista"
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={toggleFull}
          className="bg-black/60 hover:bg-black/80 backdrop-blur rounded-full p-2 text-white"
          aria-label="Pantalla completa"
        >
          {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button
          onClick={onClose}
          className="bg-red-500/80 hover:bg-red-500 rounded-full p-2 text-white"
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/60 pointer-events-none">
        Arrastra para mirar · Scroll para zoom
      </div>
    </div>
  );
}
