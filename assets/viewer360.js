// ═══════════════════════════════════════════════════════════════
// VIEWER360 — Tour 360° con panorama equirectangular combinado
// Todas las fotos de la propiedad → 1 sola imagen panorámica
// ═══════════════════════════════════════════════════════════════

const Viewer360 = (() => {
  let scene, camera, renderer, sphere, currentTexture;
  let animId = null;

  // Rotación actual y objetivo (interpolación suave)
  let rotX = 0, rotY = 0;
  let targetRotX = 0, targetRotY = 0;

  // FOV restringido — evita distorsión excesiva
  const FOV_DEFAULT = 80;
  const FOV_MIN     = 65;   // zoom máximo
  const FOV_MAX     = 90;   // zoom mínimo (vista natural)
  let fov = FOV_DEFAULT;

  // Estado de arrastre
  let isDragging  = false;
  let prevMouseX  = 0, prevMouseY = 0;
  let prevTouchX  = 0, prevTouchY = 0;
  let pinchStartDist = 0, pinchStartFov = FOV_DEFAULT;

  // ── Inicialización de la escena Three.js ──────────────────────
  function initScene(container) {
    scene = new THREE.Scene();

    const w = container.clientWidth  || window.innerWidth;
    const h = container.clientHeight || (window.innerHeight - 54);

    camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
    camera.position.set(0, 0, 0.01);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    // Corrección gamma para JPEGs
    if (THREE.sRGBEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    container.appendChild(renderer.domElement);

    // Esfera invertida — textura visible desde adentro
    const geo = new THREE.SphereGeometry(500, 72, 48);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    sphere = new THREE.Mesh(geo, mat);
    scene.add(sphere);

    bindEvents(container);
    animate();
  }

  // ── Loop de animación ─────────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    rotX += (targetRotX - rotX) * 0.08;
    rotY += (targetRotY - rotY) * 0.08;
    camera.rotation.order = 'YXZ';
    camera.rotation.y = rotY;
    camera.rotation.x = rotX;
    renderer.render(scene, camera);
  }

  // ── Generar panorama equirectangular combinando todas las fotos ─
  async function generatePanorama(imageSrcs) {
    // Resolución: 2:1 aspect ratio (equirectangular estándar)
    const isMobile = window.innerWidth < 768;
    const W = isMobile ? 2048 : 4096;
    const H = W / 2;

    const canvas = document.createElement('canvas');
    canvas.width  = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Fondo oscuro mientras carga
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, W, H);

    const n = imageSrcs.length;
    if (n === 0) return canvas;

    const sliceW = W / n;
    const fadeW  = Math.min(sliceW * 0.06, 30); // borde difuminado

    // Cargar todas las imágenes en paralelo
    const images = await Promise.all(
      imageSrcs.map(src => new Promise(res => {
        const img = new Image();
        img.onload  = () => res(img);
        img.onerror = () => res(null);
        img.src = src;
      }))
    );

    // Dibujar cada imagen en su sector horizontal
    images.forEach((img, i) => {
      if (!img) return;

      const sliceX = i * sliceW;

      ctx.save();
      // Clip al sector de esta imagen
      ctx.beginPath();
      ctx.rect(sliceX, 0, sliceW, H);
      ctx.clip();

      // Escalar para cubrir el sector (cover, no distorsionar)
      const scaleX = sliceW / img.width;
      const scaleY = H    / img.height;
      const scale  = Math.max(scaleX, scaleY);
      const dw = img.width  * scale;
      const dh = img.height * scale;
      const dx = sliceX + (sliceW - dw) / 2;
      const dy = (H - dh) / 2;

      ctx.drawImage(img, dx, dy, dw, dh);

      // Difuminado en borde izquierdo (excepto primera foto)
      if (i > 0) {
        const gl = ctx.createLinearGradient(sliceX, 0, sliceX + fadeW, 0);
        gl.addColorStop(0, 'rgba(0,0,0,0.55)');
        gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl;
        ctx.fillRect(sliceX, 0, fadeW, H);
      }

      // Difuminado en borde derecho (excepto última foto)
      if (i < n - 1) {
        const gr = ctx.createLinearGradient(sliceX + sliceW - fadeW, 0, sliceX + sliceW, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0)');
        gr.addColorStop(1, 'rgba(0,0,0,0.55)');
        ctx.fillStyle = gr;
        ctx.fillRect(sliceX + sliceW - fadeW, 0, fadeW, H);
      }

      ctx.restore();
    });

    return canvas;
  }

  // ── Cargar textura desde data URL ─────────────────────────────
  function loadTextureFromUrl(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.load(
        url,
        tex => {
          if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,
        err => reject(err)
      );
    });
  }

  // ── Actualizar texto de progreso en el loading ────────────────
  function setLoadingText(text) {
    const el = document.getElementById('viewer360-loading');
    if (!el) return;
    const span = el.querySelector('span');
    if (span) span.textContent = text;
  }

  // ── Abrir el visor con todas las fotos de la propiedad ────────
  async function open(imageSrcs, startIndex, roomNames) {
    const overlay   = document.getElementById('viewer360-overlay');
    const label     = document.getElementById('viewer360-room-name');
    const loading   = document.getElementById('viewer360-loading');
    const container = document.getElementById('viewer360-canvas-wrap');
    const hint      = document.getElementById('viewer360-hint');

    if (!overlay || !container) return;

    // Normalizar parámetros
    const srcs  = Array.isArray(imageSrcs) ? imageSrcs : [imageSrcs];
    const idx   = typeof startIndex === 'number' ? startIndex : 0;
    const names = Array.isArray(roomNames) ? roomNames : [];
    const n     = srcs.length;

    // Texto del topbar: "Tour 360° • N espacios"
    label.textContent = n > 1
      ? `Tour 360° · ${n} espacio${n !== 1 ? 's' : ''}`
      : (names[0] || 'Vista 360°');

    loading.style.display = 'flex';
    setLoadingText('Generando panorama 360°…');
    overlay.classList.remove('hidden');

    // Resetear cámara
    rotX = 0; rotY = 0;
    targetRotX = 0; targetRotY = 0;
    fov = FOV_DEFAULT;

    // Instrucciones según dispositivo
    if (hint) {
      hint.textContent = window.matchMedia('(pointer:coarse)').matches
        ? 'Desliza para rotar · Pellizca para zoom'
        : 'Arrastra para explorar · Scroll para zoom';
    }

    // Esperar layout del overlay
    await new Promise(r => setTimeout(r, 32));

    // Inicializar o redimensionar renderer
    if (!renderer) {
      initScene(container);
    } else {
      const w = container.clientWidth  || window.innerWidth;
      const h = container.clientHeight || (window.innerHeight - 54);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov    = fov;
      camera.updateProjectionMatrix();
    }

    // Generar panorama combinado
    try {
      setLoadingText(`Cargando ${n} foto${n !== 1 ? 's' : ''}…`);
      const panoramaCanvas = await generatePanorama(srcs);

      setLoadingText('Procesando textura…');
      const dataUrl = panoramaCanvas.toDataURL('image/jpeg', 0.88);
      const tex     = await loadTextureFromUrl(dataUrl);

      if (currentTexture) currentTexture.dispose();
      currentTexture = tex;
      sphere.material.map = tex;
      sphere.material.needsUpdate = true;

      // Apuntar cámara al espacio actual (basado en startIndex)
      // Cada foto ocupa 2π/n radianes → startIndex → ángulo de rotación
      if (n > 1) {
        // La esfera con scale(-1,1,1) mapea UV x=0 al frente y crece hacia la derecha visualmente
        targetRotY = -(idx / n) * Math.PI * 2;
        rotY = targetRotY; // sin transición al abrir
      }

      // Render explícito para mostrar inmediatamente
      if (renderer) renderer.render(scene, camera);

      loading.style.display = 'none';
    } catch (err) {
      loading.innerHTML =
        '<span style="color:var(--red);font-size:13px">Error al generar la vista 360°</span>';
    }
  }

  // ── Cerrar el visor ───────────────────────────────────────────
  function close() {
    const overlay = document.getElementById('viewer360-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen();
  }

  // ── Resetear vista al frente ──────────────────────────────────
  function resetView() {
    targetRotX = 0;
    targetRotY = 0;
    fov = FOV_DEFAULT;
    if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (renderer) renderer.render(scene, camera);
  }

  // ── Pantalla completa ─────────────────────────────────────────
  function toggleFullscreen() {
    const overlay = document.getElementById('viewer360-overlay');
    if (!document.fullscreenElement) {
      overlay.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  // ── Resize ────────────────────────────────────────────────────
  function handleResize() {
    if (!renderer) return;
    const container = document.getElementById('viewer360-canvas-wrap');
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', handleResize);

  // ════════════════════════════════════════════════════════════
  // EVENTOS — Mouse
  // ════════════════════════════════════════════════════════════

  function clampX(v) { return Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, v)); }

  function onMouseDown(e) {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    targetRotY += (e.clientX - prevMouseX) * 0.003;
    targetRotX  = clampX(targetRotX + (e.clientY - prevMouseY) * 0.003);
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    if (renderer) renderer.render(scene, camera);
  }

  function onMouseUp() { isDragging = false; }

  function onWheel(e) {
    e.preventDefault();
    // Sensibilidad reducida — scroll suave sin saltos
    fov += e.deltaY * 0.018;
    fov  = Math.max(FOV_MIN, Math.min(FOV_MAX, fov));
    if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (renderer) renderer.render(scene, camera);
  }

  // ── Eventos Touch ─────────────────────────────────────────────
  function onTouchStart(e) {
    if (e.touches.length === 1) {
      prevTouchX = e.touches[0].clientX;
      prevTouchY = e.touches[0].clientY;
      pinchStartDist = 0;
    } else if (e.touches.length === 2) {
      pinchStartDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      pinchStartFov = fov;
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      targetRotY += (e.touches[0].clientX - prevTouchX) * 0.004;
      targetRotX  = clampX(targetRotX + (e.touches[0].clientY - prevTouchY) * 0.004);
      prevTouchX  = e.touches[0].clientX;
      prevTouchY  = e.touches[0].clientY;
      if (renderer) renderer.render(scene, camera);
    } else if (e.touches.length === 2 && pinchStartDist > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      // Sensibilidad pinch suave
      fov = Math.max(FOV_MIN, Math.min(FOV_MAX,
        pinchStartFov - (dist - pinchStartDist) * 0.06
      ));
      if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (renderer) renderer.render(scene, camera);
    }
  }

  function onTouchEnd() { pinchStartDist = 0; }

  // ── Ligar eventos al canvas ───────────────────────────────────
  function bindEvents(container) {
    container.addEventListener('mousedown',  onMouseDown);
    window.addEventListener('mousemove',     onMouseMove);
    window.addEventListener('mouseup',       onMouseUp);
    container.addEventListener('wheel',      onWheel, { passive: false });
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove',  onTouchMove,  { passive: false });
    container.addEventListener('touchend',   onTouchEnd,   { passive: true });

    container.style.cursor = 'grab';
    container.addEventListener('mousedown', () => { container.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup',      () => { container.style.cursor = 'grab'; });
  }

  // API pública
  return { open, close, resetView, toggleFullscreen };
})();
