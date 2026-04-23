// ═══════════════════════════════════════════════════════════════
// VIEWER360 — Visor 360° interactivo con Three.js
// Usa SphereGeometry invertida + PerspectiveCamera
// ═══════════════════════════════════════════════════════════════

const Viewer360 = (() => {
  let scene, camera, renderer, sphere, currentTexture;
  let animId = null;

  // Rotación actual y objetivo (interpolación suave)
  let rotX = 0, rotY = 0;
  let targetRotX = 0, targetRotY = 0;
  let fov = 75;

  // Estado de arrastre (mouse)
  let isDragging = false;
  let prevMouseX = 0, prevMouseY = 0;

  // Estado de arrastre (touch)
  let prevTouchX = 0, prevTouchY = 0;
  let pinchStartDist = 0;
  let pinchStartFov = 75;

  // ── Inicialización de la escena Three.js ──────────────────────
  function initScene(container) {
    scene = new THREE.Scene();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || (window.innerHeight - 54);

    camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
    camera.position.set(0, 0, 0.01);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    // Corrección de gamma: output en sRGB para que JPEGs se vean correctos
    if (THREE.sRGBEncoding !== undefined) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    container.appendChild(renderer.domElement);

    // Esfera invertida: la textura se proyecta desde adentro
    const geo = new THREE.SphereGeometry(500, 60, 40);
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

    // Interpolación suave hacia el target
    rotX += (targetRotX - rotX) * 0.08;
    rotY += (targetRotY - rotY) * 0.08;

    camera.rotation.order = 'YXZ';
    camera.rotation.y = rotY;
    camera.rotation.x = rotX;

    renderer.render(scene, camera);
  }

  // ── Carga de textura con redimensionado ───────────────────────
  function loadTexture(src) {
    return new Promise((resolve, reject) => {
      // Para data: y blob: URLs, Three.js TextureLoader funciona correctamente.
      // Para URLs externas, añadimos crossOrigin.
      const loader = new THREE.TextureLoader();
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        loader.crossOrigin = 'anonymous';
      }

      loader.load(
        src,
        tex => {
          // Marcar textura como sRGB para que Three.js aplique corrección de gamma
          if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
          tex.needsUpdate = true;
          resolve(tex);
        },
        undefined,        // onProgress (no usado)
        err => reject(err || new Error('No se pudo cargar la imagen'))
      );
    });
  }

  // ── Abrir el visor con la foto actual ─────────────────────────
  async function open(roomSrc, roomName) {
    const overlay  = document.getElementById('viewer360-overlay');
    const label    = document.getElementById('viewer360-room-name');
    const loading  = document.getElementById('viewer360-loading');
    const container = document.getElementById('viewer360-canvas-wrap');
    const hint     = document.getElementById('viewer360-hint');

    if (!overlay || !container) return;

    label.textContent = roomName || 'Vista 360°';
    loading.style.display = 'flex';
    overlay.classList.remove('hidden');

    // Resetear posición de cámara
    rotX = 0; rotY = 0;
    targetRotX = 0; targetRotY = 0;
    fov = 75;

    // Esperar un tick para que el browser calcule el layout del overlay
    // (setTimeout en vez de rAF para que funcione aunque el tab no esté activo)
    await new Promise(r => setTimeout(r, 32));

    if (!renderer) {
      initScene(container);
    } else {
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight - 54;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Mostrar instrucciones en móvil
    if (hint) {
      const isMobile = window.matchMedia('(pointer: coarse)').matches;
      hint.textContent = isMobile
        ? 'Desliza para rotar · Pellizca para zoom'
        : 'Arrastra para rotar · Scroll para zoom';
    }

    try {
      const tex = await loadTexture(roomSrc);
      if (currentTexture) currentTexture.dispose();
      currentTexture = tex;
      sphere.material.map = tex;
      sphere.material.needsUpdate = true;
      // Render explícito para mostrar la textura inmediatamente
      // (necesario cuando el tab no está activo y rAF no dispara)
      if (renderer) renderer.render(scene, camera);
      loading.style.display = 'none';
    } catch (err) {
      loading.innerHTML =
        '<span style="color:var(--red);font-size:13px">Error al cargar la imagen</span>';
    }
  }

  // ── Cerrar el visor ───────────────────────────────────────────
  function close() {
    const overlay = document.getElementById('viewer360-overlay');
    if (overlay) overlay.classList.add('hidden');

    // Salir de pantalla completa si aplica
    if (document.fullscreenElement) document.exitFullscreen();
  }

  // ── Resetear vista al centro ──────────────────────────────────
  function resetView() {
    targetRotX = 0;
    targetRotY = 0;
    fov = 75;
    if (camera) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  // ── Pantalla completa ─────────────────────────────────────────
  function toggleFullscreen() {
    const overlay = document.getElementById('viewer360-overlay');
    if (!document.fullscreenElement) {
      overlay.requestFullscreen && overlay.requestFullscreen();
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  }

  // ── Responsive resize ─────────────────────────────────────────
  function handleResize() {
    if (!renderer) return;
    const container = document.getElementById('viewer360-canvas-wrap');
    if (!container) return;
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  }

  // ── Limpiar recursos Three.js ─────────────────────────────────
  function destroy() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    if (currentTexture) { currentTexture.dispose(); currentTexture = null; }
    if (sphere) {
      sphere.geometry.dispose();
      sphere.material.dispose();
      sphere = null;
    }
    if (renderer) { renderer.dispose(); renderer = null; }
    scene = null;
    camera = null;
  }

  // ════════════════════════════════════════════════════════════
  // EVENTOS
  // ════════════════════════════════════════════════════════════

  function clampRotX(val) {
    return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, val));
  }

  // Mouse ───────────────────────────────────────────────────────
  function onMouseDown(e) {
    isDragging = true;
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
  }

  function onMouseMove(e) {
    if (!isDragging) return;
    const dx = e.clientX - prevMouseX;
    const dy = e.clientY - prevMouseY;
    targetRotY += dx * 0.003;
    targetRotX  = clampRotX(targetRotX + dy * 0.003);
    prevMouseX = e.clientX;
    prevMouseY = e.clientY;
    // Render inmediato en cada movimiento (fallback si rAF no está activo)
    if (renderer) renderer.render(scene, camera);
  }

  function onMouseUp() { isDragging = false; }

  function onWheel(e) {
    e.preventDefault();
    fov += e.deltaY * 0.05;
    fov = Math.max(30, Math.min(120, fov));
    if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (renderer) renderer.render(scene, camera);
  }

  // Touch ───────────────────────────────────────────────────────
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
      const dx = e.touches[0].clientX - prevTouchX;
      const dy = e.touches[0].clientY - prevTouchY;
      targetRotY += dx * 0.004;
      targetRotX  = clampRotX(targetRotX + dy * 0.004);
      prevTouchX = e.touches[0].clientX;
      prevTouchY = e.touches[0].clientY;
    } else if (e.touches.length === 2 && pinchStartDist > 0) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      // Más separación = zoom in (FOV baja)
      fov = Math.max(30, Math.min(120, pinchStartFov - (dist - pinchStartDist) * 0.15));
      if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
    }
  }

  function onTouchEnd() {
    pinchStartDist = 0;
  }

  // ── Ligar todos los eventos al contenedor ────────────────────
  function bindEvents(container) {
    // Mouse
    container.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: false });

    // Touch
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    // Resize
    window.addEventListener('resize', handleResize);

    // Cursor
    container.style.cursor = 'grab';
    container.addEventListener('mousedown', () => { container.style.cursor = 'grabbing'; });
    window.addEventListener('mouseup', () => { container.style.cursor = 'grab'; });
  }

  // API pública
  return { open, close, resetView, toggleFullscreen };
})();
