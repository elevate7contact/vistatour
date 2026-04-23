// ═══════════════════════════════════════════════════════════════
// VIEWER360 — Tour virtual inmersivo
// Una sala a la vez · Navegación con flechas + thumbnails
// Fotos regulares → equirectangular por mirror-tile
// ═══════════════════════════════════════════════════════════════

const Viewer360 = (() => {

  // Three.js
  let scene, camera, renderer, sphere;
  let animId   = null;
  let isBound  = false;

  // Estado de rooms
  let roomSrcs      = [];
  let roomNames     = [];
  let currentIdx    = 0;
  let currentTex    = null;
  let isTransition  = false;

  // Cámara
  let rotX = 0, rotY = 0, targetRotX = 0, targetRotY = 0;
  const FOV_DEF = 80, FOV_MIN = 65, FOV_MAX = 90;
  let fov = FOV_DEF;

  // Drag
  let isDragging = false;
  let prevMX = 0, prevMY = 0;
  let prevTX = 0, prevTY = 0;
  let pinchDist0 = 0, pinchFov0 = FOV_DEF;

  // ── Generar equirectangular desde foto regular ────────────────
  // Técnica mirror-tile: espeja la foto para llenar los 360°
  // sin zonas vacías ni distorsión extrema
  function makeEquirect(img) {
    const W = 4096, H = 2048;
    const c   = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Fondo oscuro (suelo y techo fuera del foto)
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Escalar foto para cubrir la altura completa
    const scale = H / img.naturalHeight;
    const pw    = img.naturalWidth * scale;   // ancho escalado
    const ph    = H;

    // Mirror-tile: dibuja la foto (y su espejo) hasta llenar W
    let x = 0, flip = false;
    while (x < W) {
      const drawW = Math.min(pw, W - x);
      ctx.save();
      if (flip) {
        // Espejo horizontal
        ctx.translate(x + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, pw, ph);
      } else {
        ctx.drawImage(img, x, 0, pw, ph);
      }
      ctx.restore();
      x   += pw;
      flip = !flip;
    }

    // Vignette top (techo) y bottom (suelo) para suavizar
    const vTop = ctx.createLinearGradient(0, 0, 0, H * 0.22);
    vTop.addColorStop(0, 'rgba(0,0,0,0.85)');
    vTop.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = vTop;
    ctx.fillRect(0, 0, W, H * 0.22);

    const vBot = ctx.createLinearGradient(0, H * 0.78, 0, H);
    vBot.addColorStop(0, 'rgba(0,0,0,0)');
    vBot.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vBot;
    ctx.fillRect(0, H * 0.78, W, H * 0.22);

    return c;
  }

  // ── Carga imagen y devuelve CanvasTexture equirectangular ─────
  function loadRoomTexture(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      // Sin crossOrigin para data: y blob: (evita canvas tainted)
      if (!src.startsWith('data:') && !src.startsWith('blob:')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        const equi = makeEquirect(img);
        // Convertir canvas → data URL → TextureLoader (más fiable en r128)
        const dataUrl = equi.toDataURL('image/jpeg', 0.9);
        const loader  = new THREE.TextureLoader();
        loader.load(dataUrl, tex => {
          if (THREE.sRGBEncoding !== undefined) tex.encoding = THREE.sRGBEncoding;
          tex.needsUpdate = true;
          resolve(tex);
        }, undefined, reject);
      };
      img.onerror = reject;
      img.src = src;
    });
  }

  // ── Inicializar escena Three.js ───────────────────────────────
  function initScene(container) {
    scene    = new THREE.Scene();
    const w  = container.clientWidth  || window.innerWidth;
    const h  = container.clientHeight || (window.innerHeight - 160);

    camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 1000);
    camera.position.set(0, 0, 0.01);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(renderer.domElement);

    // Esfera invertida
    const geo = new THREE.SphereGeometry(500, 72, 48);
    geo.scale(-1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      color:       0x0d0d0d,
      transparent: true,
      opacity:     1,
    });
    sphere = new THREE.Mesh(geo, mat);
    scene.add(sphere);

    if (!isBound) { bindEvents(container); isBound = true; }
    animate();
  }

  // ── Loop de animación ─────────────────────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    rotX += (targetRotX - rotX) * 0.08;
    rotY += (targetRotY - rotY) * 0.08;
    camera.rotation.order = 'YXZ';
    camera.rotation.y     = rotY;
    camera.rotation.x     = rotX;
    renderer.render(scene, camera);
  }

  // ── Actualizar UI (nombre, contador, thumbs activos) ──────────
  function updateUI() {
    const nameEl    = document.getElementById('viewer360-room-name');
    const counterEl = document.getElementById('viewer360-room-counter');
    if (nameEl)    nameEl.textContent    = roomNames[currentIdx] || `Espacio ${currentIdx + 1}`;
    if (counterEl) counterEl.textContent = `${currentIdx + 1} / ${roomSrcs.length}`;

    document.querySelectorAll('.v360-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === currentIdx);
    });

    // Mostrar/ocultar flechas si es una sola sala
    const single = roomSrcs.length <= 1;
    ['viewer360-prev','viewer360-next'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = single ? 'none' : 'flex';
    });
  }

  // ── Fade + swap de textura al cambiar de sala ─────────────────
  async function swapRoom(idx) {
    if (isTransition || idx === currentIdx) return;
    isTransition = true;

    // Fade out (12 frames ~ 200ms)
    for (let i = 12; i >= 0; i--) {
      sphere.material.opacity = i / 12;
      renderer.render(scene, camera);
      await new Promise(r => setTimeout(r, 16));
    }

    try {
      const tex = await loadRoomTexture(roomSrcs[idx]);
      if (currentTex) currentTex.dispose();
      currentTex  = tex;
      currentIdx  = idx;
      sphere.material.map = tex;
      sphere.material.needsUpdate = true;
      // Resetear cámara al frente de la nueva sala
      rotX = 0; rotY = 0; targetRotX = 0; targetRotY = 0;
      updateUI();
      // Scroll el thumb activo a la vista
      scrollThumbIntoView(idx);
    } catch (e) {}

    // Fade in
    for (let i = 0; i <= 12; i++) {
      sphere.material.opacity = i / 12;
      renderer.render(scene, camera);
      await new Promise(r => setTimeout(r, 16));
    }

    isTransition = false;
  }

  // ── Construir strip de thumbnails ─────────────────────────────
  function buildThumbs() {
    const strip = document.getElementById('viewer360-thumbs');
    if (!strip) return;
    strip.innerHTML = '';
    roomSrcs.forEach((src, i) => {
      const wrap  = document.createElement('div');
      wrap.className = 'v360-thumb' + (i === currentIdx ? ' active' : '');
      wrap.title = roomNames[i] || `Espacio ${i + 1}`;

      const img  = document.createElement('img');
      img.src    = src;
      img.alt    = wrap.title;
      img.draggable = false;

      const lbl  = document.createElement('div');
      lbl.className = 'v360-thumb-label';
      lbl.textContent = roomNames[i] || `${i + 1}`;

      wrap.appendChild(img);
      wrap.appendChild(lbl);
      wrap.onclick = () => goToRoom(i);
      strip.appendChild(wrap);
    });
  }

  function scrollThumbIntoView(idx) {
    const strip = document.getElementById('viewer360-thumbs');
    const thumb = strip?.querySelectorAll('.v360-thumb')[idx];
    thumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // ════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════

  async function open(imageSrcs, startIndex, rNames) {
    const overlay   = document.getElementById('viewer360-overlay');
    const loading   = document.getElementById('viewer360-loading');
    const container = document.getElementById('viewer360-canvas-wrap');
    if (!overlay || !container) return;

    roomSrcs   = Array.isArray(imageSrcs) ? imageSrcs : [imageSrcs];
    roomNames  = Array.isArray(rNames)    ? rNames    : [];
    currentIdx = typeof startIndex === 'number' ? startIndex : 0;
    fov        = FOV_DEF;
    rotX = 0; rotY = 0; targetRotX = 0; targetRotY = 0;

    loading.style.display = 'flex';
    overlay.classList.remove('hidden');

    // Instrucciones
    const hint = document.getElementById('viewer360-hint');
    if (hint) {
      hint.textContent = window.matchMedia('(pointer:coarse)').matches
        ? 'Desliza para mirar · Pellizca para zoom'
        : 'Arrastra para mirar · Scroll para zoom';
    }

    buildThumbs();
    updateUI();

    await new Promise(r => setTimeout(r, 32)); // esperar layout

    if (!renderer) {
      initScene(container);
    } else {
      const w = container.clientWidth  || window.innerWidth;
      const h = container.clientHeight || (window.innerHeight - 160);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.fov    = fov;
      camera.updateProjectionMatrix();
    }

    // Cargar textura de la sala inicial
    const setStatus = t => {
      const sp = document.querySelector('#viewer360-loading span');
      if (sp) sp.textContent = t;
    };
    setStatus('Procesando vista…');

    try {
      const tex = await loadRoomTexture(roomSrcs[currentIdx]);
      if (currentTex) currentTex.dispose();
      currentTex  = tex;
      sphere.material.map     = tex;
      sphere.material.opacity = 1;
      sphere.material.needsUpdate = true;
      renderer.render(scene, camera);
      loading.style.display = 'none';
    } catch (e) {
      loading.innerHTML =
        '<span style="color:var(--red);font-size:13px">Error al cargar la imagen</span>';
    }
  }

  function close() {
    const overlay = document.getElementById('viewer360-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen();
  }

  function resetView() {
    targetRotX = 0; targetRotY = 0;
    fov = FOV_DEF;
    if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
    if (renderer) renderer.render(scene, camera);
  }

  function toggleFullscreen() {
    const ov = document.getElementById('viewer360-overlay');
    if (!document.fullscreenElement) ov?.requestFullscreen();
    else document.exitFullscreen?.();
  }

  function nextRoom() { swapRoom((currentIdx + 1) % roomSrcs.length); }
  function prevRoom() { swapRoom((currentIdx - 1 + roomSrcs.length) % roomSrcs.length); }
  function goToRoom(i) { if (i !== currentIdx) swapRoom(i); }

  // ── Eventos mouse/touch ───────────────────────────────────────
  function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }

  function bindEvents(container) {
    container.addEventListener('mousedown', e => {
      isDragging = true; prevMX = e.clientX; prevMY = e.clientY;
      container.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', e => {
      if (!isDragging) return;
      targetRotY += (e.clientX - prevMX) * 0.003;
      targetRotX  = clamp(targetRotX + (e.clientY - prevMY) * 0.003, -Math.PI/2.5, Math.PI/2.5);
      prevMX = e.clientX; prevMY = e.clientY;
      if (renderer) renderer.render(scene, camera);
    });
    window.addEventListener('mouseup', () => {
      isDragging = false; container.style.cursor = 'grab';
    });

    container.addEventListener('wheel', e => {
      e.preventDefault();
      fov = clamp(fov + e.deltaY * 0.018, FOV_MIN, FOV_MAX);
      if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
      if (renderer) renderer.render(scene, camera);
    }, { passive: false });

    container.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        prevTX = e.touches[0].clientX; prevTY = e.touches[0].clientY;
        pinchDist0 = 0;
      } else if (e.touches.length === 2) {
        pinchDist0 = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        pinchFov0 = fov;
      }
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1) {
        targetRotY += (e.touches[0].clientX - prevTX) * 0.004;
        targetRotX  = clamp(targetRotX + (e.touches[0].clientY - prevTY) * 0.004, -Math.PI/2.5, Math.PI/2.5);
        prevTX = e.touches[0].clientX; prevTY = e.touches[0].clientY;
        if (renderer) renderer.render(scene, camera);
      } else if (e.touches.length === 2 && pinchDist0 > 0) {
        const d = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        fov = clamp(pinchFov0 - (d - pinchDist0) * 0.05, FOV_MIN, FOV_MAX);
        if (camera) { camera.fov = fov; camera.updateProjectionMatrix(); }
        if (renderer) renderer.render(scene, camera);
      }
    }, { passive: false });

    container.addEventListener('touchend', () => { pinchDist0 = 0; }, { passive: true });

    container.style.cursor = 'grab';

    window.addEventListener('resize', () => {
      if (!renderer) return;
      const w = container.clientWidth, h = container.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
  }

  return { open, close, resetView, toggleFullscreen, nextRoom, prevRoom, goToRoom };
})();
