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
import { ChevronLeft, ChevronRight, Home, Maximize2, Minimize2, Map as MapIcon, X, RotateCcw, Edit3, Save, Plus, Trash2, Phone, Mail } from 'lucide-react';
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

interface TourMetadata {
  precio?: string;
  ubicacion?: string;
  area_m2?: number;
  habitaciones?: number;
  banos?: number;
  realtor_nombre?: string;
  realtor_telefono?: string;
  realtor_email?: string;
  realtor_logo_url?: string;
}

interface Props {
  nombre: string;
  scenes: Scene360[];
  metadata?: TourMetadata | null;
  tourId?: string;
  canEdit?: boolean;
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

export default function Tour360Navegable({ nombre, scenes: scenesProp, metadata, tourId, canEdit }: Props) {
  const [scenes, setScenes] = useState<Scene360[]>(scenesProp);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [full, setFull] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [savingHotspots, setSavingHotspots] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
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

      // ─── FOTO-ANCLA v2 (segmento esférico curvado + alpha feathering) ──
      // Antes: plano flat → se veía como cuadro pegado.
      // Ahora: segmento de esfera (480u radio) que sigue la curvatura del
      // panorama (500u). FOV inicial ~75°×50°, se reajusta al aspect real
      // de cada foto. Bordes con feathering (alpha gradient) → la transición
      // foto→panorama IA es suave en lugar de un corte duro.
      const PHOTO_RADIUS = 480;
      const fovH0 = Math.PI * 0.42;   // ~75° horizontal
      const fovV0 = Math.PI * 0.28;   // ~50° vertical
      const photoGeo = new THREE.SphereGeometry(
        PHOTO_RADIUS, 64, 32,
        -fovH0 / 2, fovH0,
        Math.PI / 2 - fovV0 / 2, fovV0,
      );

      // Máscara alpha programática: blanco al centro, fade a negro en los
      // bordes (feather 10% por lado). Two linear gradients en multiply.
      function createFeatherMask(w: number, h: number, feather = 0.10) {
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d')!;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'multiply';
        // Horizontal
        let g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0, '#000');
        g.addColorStop(feather, '#FFF');
        g.addColorStop(1 - feather, '#FFF');
        g.addColorStop(1, '#000');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        // Vertical
        g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#000');
        g.addColorStop(feather, '#FFF');
        g.addColorStop(1 - feather, '#FFF');
        g.addColorStop(1, '#000');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        const tex = new THREE.CanvasTexture(c);
        return tex;
      }
      const featherMask = createFeatherMask(1024, 720);

      const photoMaterial = new THREE.MeshBasicMaterial({
        color: 0x111111,
        alphaMap: featherMask,
        transparent: true,
        side: THREE.BackSide,    // se ve desde adentro de la esfera
        depthTest: false,
      });
      const photoMesh = new THREE.Mesh(photoGeo, photoMaterial);
      photoMesh.renderOrder = 2;
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

  // Cambiar textura cuando cambia escena.
  // Post-Skybox: panorama_url SIEMPRE es la foto real del cliente (panorámica
  // nativa o stitcheada client-side con OpenCV). El photoMesh queda oculto
  // permanentemente — ya no hay foto-ancla curvada ni panorama IA detrás.
  useEffect(() => {
    const s = threeStateRef.current;
    if (!s.THREE || !s.material || !current?.panorama_url) return;

    const loader = new s.THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');

    setTransitioning(true);

    // Cargar el panorama real sobre la esfera principal
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

    // photoMesh siempre oculto — pipeline post-Skybox no usa foto-ancla
    if (s.photoMesh) {
      s.photoMesh.visible = false;
    }
  }, [current?.panorama_url]);

  // Navegación
  const goToScene = useCallback((idx: number) => {
    if (idx < 0 || idx >= scenes.length) return;
    setCurrentIdx(idx);
  }, [scenes.length]);

  const prev = useCallback(() => goToScene(currentIdx - 1), [goToScene, currentIdx]);
  const next = useCallback(() => goToScene(currentIdx + 1), [goToScene, currentIdx]);

  const onHotspotClick = useCallback((toSceneId: string) => {
    if (editMode) return;  // en modo edición, click en hotspot no navega
    const idx = sceneById.get(toSceneId);
    if (idx !== undefined) goToScene(idx);
  }, [sceneById, goToScene, editMode]);

  // ─── Edición de hotspots (solo si canEdit) ─────────────────────────
  const updateHotspot = useCallback((sceneIdx: number, hotspotId: string, patch: any) => {
    setScenes((prev) => prev.map((s, i) => {
      if (i !== sceneIdx) return s;
      const newHs = (s.hotspots || []).map((h) => h.id === hotspotId ? { ...h, ...patch } : h);
      return { ...s, hotspots: newHs };
    }));
  }, []);

  const removeHotspot = useCallback((sceneIdx: number, hotspotId: string) => {
    setScenes((prev) => prev.map((s, i) => {
      if (i !== sceneIdx) return s;
      const newHs = (s.hotspots || []).filter((h) => h.id !== hotspotId);
      return { ...s, hotspots: newHs };
    }));
  }, []);

  const addHotspot = useCallback((sceneIdx: number) => {
    // Captura la rotación actual de la cámara como yaw, pitch=0
    const yaw = ((threeStateRef.current.rotX ?? 0) * Math.PI) / 180;
    const pitch = ((threeStateRef.current.rotY ?? 0) * Math.PI) / 180;
    const targetIdx = (sceneIdx + 1) % scenes.length;
    const newHotspot = {
      id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      to_scene_id: scenes[targetIdx].id,
      label: scenes[targetIdx].tipo_espacio || 'Continuar',
      position: { yaw, pitch },
      icon: 'arrow-forward' as const,
    };
    setScenes((prev) => prev.map((s, i) => {
      if (i !== sceneIdx) return s;
      return { ...s, hotspots: [...(s.hotspots || []), newHotspot] };
    }));
  }, [scenes]);

  const saveHotspots = useCallback(async () => {
    if (!tourId) return;
    setSavingHotspots(true);
    setSaveMsg(null);
    try {
      const body = {
        scenes: scenes.map((s) => ({ id: s.id, hotspots: s.hotspots || [] })),
      };
      const res = await fetch(`/api/tours/${tourId}/hotspots`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Error guardando');
      }
      setSaveMsg('✓ Guardado');
      setTimeout(() => setSaveMsg(null), 2500);
    } catch (e) {
      setSaveMsg((e as Error).message);
      setTimeout(() => setSaveMsg(null), 4000);
    } finally {
      setSavingHotspots(false);
    }
  }, [tourId, scenes]);
  // ───────────────────────────────────────────────────────────────────

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

      {/* Top-left: branding del inmueble */}
      <div className="absolute top-4 left-4 z-20 max-w-[60vw]">
        <div className="bg-black/55 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10">
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="text-base font-semibold tracking-tight text-paseo-cream">{nombre}</span>
            {metadata?.ubicacion && (
              <span className="text-xs text-paseo-cream/55">· {metadata.ubicacion}</span>
            )}
          </div>
          {(metadata?.precio || metadata?.area_m2 || metadata?.habitaciones) && (
            <div className="flex items-center gap-3 text-xs text-paseo-cream/75 mt-1">
              {metadata?.precio && <span className="text-paseo-gold font-semibold">{metadata.precio}</span>}
              {metadata?.area_m2 && <span>{metadata.area_m2} m²</span>}
              {metadata?.habitaciones && <span>{metadata.habitaciones} hab</span>}
              {metadata?.banos && <span>{metadata.banos} baños</span>}
            </div>
          )}
        </div>
      </div>

      {/* Top-right: controles + (si owner) edición */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {canEdit && (
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`backdrop-blur rounded-full px-3 py-2 flex items-center gap-1.5 text-sm font-medium transition ${
              editMode
                ? 'bg-paseo-gold text-paseo-dark hover:bg-paseo-gold/90'
                : 'bg-black/50 hover:bg-black/70 text-paseo-cream'
            }`}
            aria-label="Editar hotspots"
            title="Editar hotspots"
          >
            <Edit3 size={14} />
            {editMode ? 'Saliendo' : 'Editar'}
          </button>
        )}
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

      {/* Footer con datos del realtor (solo en pantalla completa o si hay datos) */}
      {(metadata?.realtor_nombre || metadata?.realtor_telefono || metadata?.realtor_email) && (
        <div className="absolute bottom-4 right-4 z-20 max-w-xs">
          <div className="bg-black/55 backdrop-blur-md rounded-xl px-4 py-3 border border-white/10">
            {metadata.realtor_nombre && (
              <div className="text-paseo-gold text-xs uppercase tracking-wider mb-1">
                Contacto
              </div>
            )}
            {metadata.realtor_nombre && (
              <div className="text-sm font-semibold text-paseo-cream mb-1.5">
                {metadata.realtor_nombre}
              </div>
            )}
            <div className="space-y-1">
              {metadata.realtor_telefono && (
                <a
                  href={`tel:${metadata.realtor_telefono}`}
                  className="flex items-center gap-2 text-xs text-paseo-cream/80 hover:text-paseo-gold transition"
                >
                  <Phone size={12} /> {metadata.realtor_telefono}
                </a>
              )}
              {metadata.realtor_email && (
                <a
                  href={`mailto:${metadata.realtor_email}?subject=Interesado en ${nombre}`}
                  className="flex items-center gap-2 text-xs text-paseo-cream/80 hover:text-paseo-gold transition"
                >
                  <Mail size={12} /> {metadata.realtor_email}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Panel de edición (solo si editMode) */}
      {editMode && current && (
        <div className="absolute left-4 top-24 bottom-24 z-30 w-80 bg-black/85 backdrop-blur-md rounded-xl border border-paseo-gold/30 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-paseo-gold text-xs uppercase tracking-wider">Editor de hotspots</div>
              <div className="text-sm text-paseo-cream font-medium capitalize">
                Escena: {current.tipo_espacio || `#${currentIdx + 1}`}
              </div>
            </div>
            <button
              onClick={() => addHotspot(currentIdx)}
              className="bg-paseo-gold text-paseo-dark rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1 hover:bg-paseo-gold/90"
              title="Agregar hotspot en la dirección actual de la cámara"
            >
              <Plus size={14} /> Agregar
            </button>
          </div>

          <p className="text-xs text-paseo-cream/55 mb-3 leading-relaxed">
            Cada hotspot es una puerta clickeable. Apuntá la cámara hacia donde está la puerta y dale "Agregar".
            Cambiá el destino con el dropdown.
          </p>

          <div className="space-y-2">
            {(current.hotspots || []).length === 0 && (
              <div className="text-xs text-paseo-cream/40 italic">No hay hotspots en esta escena.</div>
            )}
            {(current.hotspots || []).map((h, idx) => (
              <div key={h.id} className="bg-white/5 rounded-lg p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-paseo-cream/60">Hotspot {idx + 1}</span>
                  <button
                    onClick={() => removeHotspot(currentIdx, h.id)}
                    className="text-red-400 hover:text-red-300"
                    title="Eliminar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <label className="text-[10px] text-paseo-cream/50 block mb-1">DESTINO</label>
                <select
                  value={h.to_scene_id}
                  onChange={(e) => {
                    const targetIdx = sceneById.get(e.target.value);
                    const targetScene = targetIdx !== undefined ? scenes[targetIdx] : null;
                    updateHotspot(currentIdx, h.id, {
                      to_scene_id: e.target.value,
                      label: targetScene?.tipo_espacio || h.label,
                    });
                  }}
                  className="w-full text-xs bg-black/50 border border-white/10 rounded px-2 py-1 text-paseo-cream"
                >
                  {scenes.filter((s) => s.id !== current.id).map((s) => (
                    <option key={s.id} value={s.id} className="bg-paseo-dark">
                      {s.tipo_espacio || `Escena ${s.orden + 1}`}
                    </option>
                  ))}
                </select>
                <label className="text-[10px] text-paseo-cream/50 block mt-2 mb-1">ETIQUETA</label>
                <input
                  type="text"
                  value={h.label || ''}
                  onChange={(e) => updateHotspot(currentIdx, h.id, { label: e.target.value })}
                  className="w-full text-xs bg-black/50 border border-white/10 rounded px-2 py-1 text-paseo-cream"
                  placeholder="Cocina, baño..."
                />
              </div>
            ))}
          </div>

          <button
            onClick={saveHotspots}
            disabled={savingHotspots}
            className="w-full mt-4 bg-paseo-gold text-paseo-dark rounded-lg py-2 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-paseo-gold/90"
          >
            <Save size={14} />
            {savingHotspots ? 'Guardando…' : 'Guardar cambios'}
          </button>
          {saveMsg && (
            <div className={`mt-2 text-xs text-center ${saveMsg.startsWith('✓') ? 'text-green-400' : 'text-red-400'}`}>
              {saveMsg}
            </div>
          )}
        </div>
      )}

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
