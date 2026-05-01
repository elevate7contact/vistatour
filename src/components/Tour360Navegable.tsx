'use client';

/**
 * Tour360Navegable
 * ─────────────────────────────────────────────────────────────────
 * Visor multi-escena 360° estilo Google Street View.
 *
 * Recibe N escenas con panorama_url + hotspots y permite navegar
 * entre ellas con clicks en hotspots flotantes (puertas, accesos).
 *
 * Cada escena = una habitación = un panorama equirectangular.
 * Cada hotspot = un punto clickeable a yaw/pitch específico que
 * lleva a otra escena.
 *
 * Three.js se carga dinámicamente para no engordar el bundle inicial.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Home, Maximize2, Minimize2, Map as MapIcon, X, RotateCcw } from 'lucide-react';
import FeedbackWidget from './FeedbackWidget';
// Map renombrado a MapIcon para no sombrear el Map nativo de JavaScript

export interface Scene360 {
  id: string;
  orden: number;
  panorama_url: string;
  /** Foto ORIGINAL del cliente. Se proyecta como ancla frontal dentro del 360°
   *  para garantizar que el realtor vea SU foto exacta, sin alteraciones. */
  image_url: string;
  tipo_espacio: string | null;
  paleta_hex: string[] | null;
  hotspots: Hotspot[] | null;
}

export interface Hotspot {
  id: string;
  to_scene_id: string;
  label?: string;
  position: { yaw: number; pitch: number }; // radianes
  icon?: 'arrow-forward' | 'door' | 'stairs';
}

interface Props {
  nombre: string;
  scenes: Scene360[];
}

// ─── ICONO HOTSPOT (SVG inline) ───────────────────────────────────
function HotspotIcon({ pulsing = true }: { pulsing?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className="w-full h-full">
      {pulsing && (
        <circle cx="32" cy="32" r="28" fill="rgba(255,193,79,0.25)">
          <animate attributeName="r" values="22;30;22" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.1;0.5" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
      <circle cx="32" cy="32" r="20" fill="rgba(255,193,79,0.95)" stroke="white" strokeWidth="2" />
      <path
        d="M22 32 L42 32 M34 24 L42 32 L34 40"
        stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"
      />
    </svg>
  );
}

export default function Tour360Navegable({ nombre, scenes }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [full, setFull] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);

  // Estado del Three.js que vive entre renders
  const threeStateRef = useRef<{
    scene?: any; camera?: any; renderer?: any;
    sphere?: any; texture?: any; material?: any;
    // Foto-ancla: malla con la foto ORIGINAL del cliente, posicionada al frente.
    // Garantiza fidelidad fotográfica — el cliente ve SU foto, no la versión IA.
    photoMesh?: any; photoTexture?: any; photoMaterial?: any;
    THREE?: any; raf?: number; disposed?: boolean;
    rotX?: number; rotY?: number;
    targetRotX?: number; targetRotY?: number;
    isDragging?: boolean; lastX?: number; lastY?: number;
    onPointerDown?: any; onPointerMove?: any; onPointerUp?: any;
    onWheel?: any; onResize?: any;
  }>({});

  // Mapa por id para búsqueda rápida
  const sceneById = useMemo(() => {
    const m = new Map<string, number>();
    scenes.forEach((s, i) => m.set(s.id, i));
    return m;
  }, [scenes]);

  const current = scenes[currentIdx];

  // Inicializar Three.js una sola vez
  useEffect(() => {
    let disposed = false;

    (async () => {
      const THREE = await import('three');
      if (disposed || !sceneRef.current) return;

      const container = sceneRef.current;
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
      const material = new THREE.MeshBasicMaterial({ color: 0x000000 });
      const sphere = new THREE.Mesh(geometry, material);
      scene.add(sphere);

      // ─── FOTO-ANCLA (Camino B — fidelidad fotográfica) ───────────────────
      // Plano curvado más cercano a la cámara que la esfera de panorama,
      // anclado al frente (+X). Renderiza la foto ORIGINAL del cliente.
      // El realtor ve SU foto exacta cuando mira al frente. Solo al rotar
      // ~70° lateralmente aparece el panorama IA (relleno).
      const photoGeo = new THREE.PlaneGeometry(560, 360);
      const photoMaterial = new THREE.MeshBasicMaterial({
        color: 0x111111,         // negro hasta que cargue la textura
        side: THREE.DoubleSide,
        transparent: false,
      });
      const photoMesh = new THREE.Mesh(photoGeo, photoMaterial);
      photoMesh.position.set(480, 0, 0);   // 480u sobre +X (cámara mira a +X por default)
      photoMesh.lookAt(0, 0, 0);            // gira el plano para encarar la cámara
      photoMesh.renderOrder = 2;            // se dibuja después del sphere → siempre encima
      photoMaterial.depthTest = false;      // no es ocultado por la esfera
      scene.add(photoMesh);
      // ───────────────────────────────────────────────────────────────────

      const state = threeStateRef.current;
      state.THREE = THREE;
      state.scene = scene;
      state.camera = camera;
      state.renderer = renderer;
      state.sphere = sphere;
      state.material = material;
      state.photoMesh = photoMesh;
      state.photoMaterial = photoMaterial;
      state.rotX = 0; state.rotY = 0;
      state.targetRotX = 0; state.targetRotY = 0;
      state.isDragging = false;
      state.lastX = 0; state.lastY = 0;
      state.disposed = false;

      function onPointerDown(e: PointerEvent) {
        state.isDragging = true;
        state.lastX = e.clientX; state.lastY = e.clientY;
      }
      function onPointerMove(e: PointerEvent) {
        if (!state.isDragging) return;
        state.targetRotX = (state.targetRotX ?? 0) - (e.clientX - (state.lastX ?? 0)) * 0.2;
        state.targetRotY = (state.targetRotY ?? 0) + (e.clientY - (state.lastY ?? 0)) * 0.2;
        state.targetRotY = Math.max(-85, Math.min(85, state.targetRotY ?? 0));
        state.lastX = e.clientX; state.lastY = e.clientY;
      }
      function onPointerUp() { state.isDragging = false; }
      function onWheel(e: WheelEvent) {
        e.preventDefault();
        if (!state.camera) return;
        state.camera.fov = Math.max(35, Math.min(95, state.camera.fov + e.deltaY * 0.05));
        state.camera.updateProjectionMatrix();
      }
      function onResize() {
        if (!state.camera || !state.renderer) return;
        const ww = container.clientWidth, hh = container.clientHeight;
        state.camera.aspect = ww / hh;
        state.camera.updateProjectionMatrix();
        state.renderer.setSize(ww, hh);
      }

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      window.addEventListener('resize', onResize);

      state.onPointerDown = onPointerDown;
      state.onPointerMove = onPointerMove;
      state.onPointerUp = onPointerUp;
      state.onWheel = onWheel;
      state.onResize = onResize;

      function animate() {
        if (state.disposed) return;
        state.rotX = (state.rotX ?? 0) + ((state.targetRotX ?? 0) - (state.rotX ?? 0)) * 0.08;
        state.rotY = (state.rotY ?? 0) + ((state.targetRotY ?? 0) - (state.rotY ?? 0)) * 0.08;
        const phi = THREE.MathUtils.degToRad(90 - (state.rotY ?? 0));
        const theta = THREE.MathUtils.degToRad(state.rotX ?? 0);
        const x = 500 * Math.sin(phi) * Math.cos(theta);
        const y = 500 * Math.cos(phi);
        const z = 500 * Math.sin(phi) * Math.sin(theta);
        state.camera!.lookAt(x, y, z);
        state.renderer!.render(state.scene, state.camera);
        state.raf = requestAnimationFrame(animate);
      }
      animate();
    })();

    return () => {
      disposed = true;
      const s = threeStateRef.current;
      s.disposed = true;
      if (s.raf) cancelAnimationFrame(s.raf);
      if (s.renderer) {
        if (s.onPointerDown) s.renderer.domElement.removeEventListener('pointerdown', s.onPointerDown);
        if (s.onWheel) s.renderer.domElement.removeEventListener('wheel', s.onWheel);
        if (s.renderer.domElement.parentElement) {
          s.renderer.domElement.parentElement.removeChild(s.renderer.domElement);
        }
        s.renderer.dispose();
      }
      if (s.material) s.material.dispose();
      if (s.texture) s.texture.dispose();
      if (s.photoMaterial) s.photoMaterial.dispose();
      if (s.photoTexture) s.photoTexture.dispose();
      if (s.photoMesh && s.photoMesh.geometry) s.photoMesh.geometry.dispose();
      if (s.onPointerMove) window.removeEventListener('pointermove', s.onPointerMove);
      if (s.onPointerUp) window.removeEventListener('pointerup', s.onPointerUp);
      if (s.onResize) window.removeEventListener('resize', s.onResize);
    };
  }, []);

  // Cambiar textura cuando cambia escena (panorama IA + foto original)
  useEffect(() => {
    const s = threeStateRef.current;
    if (!s.THREE || !s.material || !current?.panorama_url) return;

    const loader = new s.THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    setTransitioning(true);

    // 1) Panorama IA (relleno lateral)
    loader.load(current.panorama_url, (newTex: any) => {
      if (s.texture) s.texture.dispose();
      s.texture = newTex;
      s.material.map = newTex;
      s.material.color.set(0xffffff);
      s.material.needsUpdate = true;
      s.targetRotX = 0;
      s.targetRotY = 0;
      setTimeout(() => setTransitioning(false), 200);
    });

    // 2) Foto ORIGINAL del cliente — ancla frontal, fidelidad 100%
    if (current.image_url && s.photoMaterial && s.photoMesh) {
      loader.load(current.image_url, (photoTex: any) => {
        if (s.photoTexture) s.photoTexture.dispose();
        s.photoTexture = photoTex;
        s.photoMaterial.map = photoTex;
        s.photoMaterial.color.set(0xffffff);
        s.photoMaterial.needsUpdate = true;

        // Ajustar geometría al aspect ratio REAL de la foto
        // así no se distorsiona (importante para inmobiliarias).
        const img = photoTex.image;
        if (img && img.width && img.height) {
          const aspect = img.width / img.height;
          // Altura base 360u; ancho = 360 * aspect. Capeado para no ocupar más del FOV.
          const targetH = 360;
          const targetW = Math.min(720, targetH * aspect);
          // Reemplazar geometría con la nueva proporción
          const oldGeo = s.photoMesh.geometry;
          s.photoMesh.geometry = new s.THREE.PlaneGeometry(targetW, targetH);
          if (oldGeo) oldGeo.dispose();
          // Re-anclar posición y orientación
          s.photoMesh.position.set(480, 0, 0);
          s.photoMesh.lookAt(0, 0, 0);
        }
      });
    }
  }, [current?.panorama_url, current?.image_url]);

  // Navegación
  const goToScene = useCallback((idx: number) => {
    if (idx < 0 || idx >= scenes.length) return;
    setCurrentIdx(idx);
  }, [scenes.length]);

  const prev = useCallback(() => goToScene(currentIdx - 1), [goToScene, currentIdx]);
  const next = useCallback(() => goToScene(currentIdx + 1), [goToScene, currentIdx]);

  const onHotspotClick = useCallback((toSceneId: string) => {
    const idx = sceneById.get(toSceneId);
    if (idx !== undefined) goToScene(idx);
  }, [sceneById, goToScene]);

  // Teclado
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { prev(); }
      else if (e.key === 'm' || e.key === 'M') { setShowMap(v => !v); }
      else if (e.key === 'Escape' && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  useEffect(() => {
    function onFs() { setFull(Boolean(document.fullscreenElement)); }
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  function toggleFull() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }

  function resetView() {
    const s = threeStateRef.current;
    s.targetRotX = 0;
    s.targetRotY = 0;
    if (s.camera) {
      s.camera.fov = 75;
      s.camera.updateProjectionMatrix();
    }
  }

  // Convertir yaw/pitch a posición CSS (proyección equirectangular sobre la pantalla)
  // Para una implementación simple: hotspots en posiciones absolutas % del viewport
  // Una versión más sofisticada usaría raycasting Three.js, pero esto es suficiente para MVP
  function hotspotPosition(yaw: number, pitch: number) {
    // yaw: -π a π → 0% a 100% horizontal (centrado en la rotación actual)
    const s = threeStateRef.current;
    const currentYaw = ((s.rotX ?? 0) * Math.PI) / 180;
    const relYaw = yaw - currentYaw;
    // Normalizar a -π/π
    let normYaw = relYaw;
    while (normYaw > Math.PI) normYaw -= 2 * Math.PI;
    while (normYaw < -Math.PI) normYaw += 2 * Math.PI;
    // FOV ~75° = 1.3 radianes; mapear -1.3/+1.3 a 0%/100%
    const xPct = 50 + (normYaw / 1.3) * 50;
    // pitch: -π/2 a π/2 → 100% a 0% vertical
    const yPct = 50 - (pitch / (Math.PI / 4)) * 50;

    const visible = xPct > -10 && xPct < 110 && yPct > -10 && yPct < 110;
    return { left: `${xPct}%`, top: `${yPct}%`, visible };
  }

  // Forzar re-render cada 100ms para actualizar posición hotspots según rotación actual
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);

  if (!current) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-paseo-dark text-paseo-cream">
        <div className="text-center">
          <div className="text-2xl mb-2">No hay escenas</div>
        </div>
      </main>
    );
  }

  const hotspots = (current.hotspots || []).filter(h => sceneById.has(h.to_scene_id));

  return (
    <div ref={containerRef} className="relative w-full h-[100dvh] bg-paseo-dark overflow-hidden select-none">
      {/* Sphere viewer */}
      <div ref={sceneRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* Hotspots overlay */}
      <div className="absolute inset-0 pointer-events-none">
        {hotspots.map(h => {
          const pos = hotspotPosition(h.position.yaw, h.position.pitch);
          if (!pos.visible) return null;
          const targetIdx = sceneById.get(h.to_scene_id);
          const targetScene = targetIdx !== undefined ? scenes[targetIdx] : null;
          const targetLabel = h.label || targetScene?.tipo_espacio || 'Continuar';
          return (
            <button
              key={h.id}
              onClick={() => onHotspotClick(h.to_scene_id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto group"
              style={{ left: pos.left, top: pos.top }}
              aria-label={`Ir a ${targetLabel}`}
            >
              <div className="w-16 h-16 md:w-20 md:h-20 transition-transform group-hover:scale-110">
                <HotspotIcon />
              </div>
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1 rounded-full bg-black/70 backdrop-blur text-white text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity capitalize">
                {targetLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Loading overlay */}
      {transitioning && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-30 pointer-events-none">
          <div className="text-paseo-cream text-sm">Cargando…</div>
        </div>
      )}

      {/* Top-left: nombre */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-3">
        <span className="text-xl font-semibold tracking-tight text-paseo-cream">Paseo</span>
        <span className="text-paseo-cream/50">·</span>
        <span className="text-paseo-cream/80 text-sm truncate max-w-[50vw]">{nombre}</span>
      </div>

      {/* Top-right: controles */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <button
          onClick={resetView}
          className="bg-black/50 hover:bg-black/70 backdrop-blur rounded-full p-2 text-paseo-cream"
          aria-label="Resetear vista"
          title="Resetear vista (R)"
        >
          <RotateCcw size={18} />
        </button>
        <button
          onClick={() => setShowMap(v => !v)}
          className="bg-black/50 hover:bg-black/70 backdrop-blur rounded-full p-2 text-paseo-cream"
          aria-label="Mapa"
          title="Mapa (M)"
        >
          <MapIcon size={18} />
        </button>
        <button
          onClick={toggleFull}
          className="bg-black/50 hover:bg-black/70 backdrop-blur rounded-full p-2 text-paseo-cream"
          aria-label="Pantalla completa"
        >
          {full ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
      </div>

      {/* Side arrows */}
      <button
        onClick={prev}
        disabled={currentIdx === 0}
        className="absolute left-2 md:left-6 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/70 backdrop-blur rounded-full p-3 disabled:opacity-30 text-paseo-cream"
        aria-label="Anterior"
      >
        <ChevronLeft size={22} />
      </button>
      <button
        onClick={next}
        disabled={currentIdx === scenes.length - 1}
        className="absolute right-2 md:right-6 top-1/2 -translate-y-1/2 z-20 bg-black/40 hover:bg-black/70 backdrop-blur rounded-full p-3 disabled:opacity-30 text-paseo-cream"
        aria-label="Siguiente"
      >
        <ChevronRight size={22} />
      </button>

      {/* Bottom info */}
      <div className="absolute bottom-6 left-0 right-0 z-20 flex flex-col items-center gap-2 px-6">
        <div className="serif-italic text-paseo-gold text-2xl md:text-3xl capitalize">
          {current.tipo_espacio ?? 'espacio'}
        </div>
        <div className="text-xs text-paseo-cream/60">
          Escena {currentIdx + 1} de {scenes.length} · arrastra para mirar · click hotspots para navegar
        </div>
        <div className="flex gap-1 mt-1">
          {scenes.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => goToScene(idx)}
              className={`h-[3px] rounded-full transition-all ${
                idx === currentIdx ? 'w-8 bg-paseo-gold' : 'w-4 bg-white/25 hover:bg-white/40'
              }`}
              aria-label={`Ir a escena ${idx + 1}`}
            />
          ))}
        </div>
      </div>

      {/* Mini-mapa */}
      {showMap && (
        <div className="absolute left-4 top-20 bottom-20 z-30 w-28 overflow-y-auto bg-black/70 backdrop-blur rounded-lg p-2 space-y-2">
          {scenes.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => goToScene(idx)}
              className={`w-full aspect-[4/3] rounded-md overflow-hidden border-2 transition ${
                idx === currentIdx ? 'border-paseo-gold' : 'border-transparent hover:border-white/30'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.panorama_url} alt={s.tipo_espacio ?? ''} className="w-full h-full object-cover" />
              <div className="text-[10px] text-paseo-cream/80 capitalize truncate mt-1">
                {s.tipo_espacio}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Widget de feedback flotante — para realtors que ven la demo */}
      <FeedbackWidget tourId={current?.id} />
    </div>
  );
}
