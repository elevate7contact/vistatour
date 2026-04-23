// ═══════════════════════════════════════════════════════════════
// VIEWER360 — Visor inmersivo con efecto parallax CSS
// Sin Three.js · Alta calidad · Mouse/Touch/Giroscopio
// ═══════════════════════════════════════════════════════════════

const Viewer360 = (() => {

  let animId   = null;
  let isBound  = false;

  // Estado de rooms
  let roomSrcs     = [];
  let roomNames    = [];
  let roomTypes    = [];   // 'image' | 'video'
  let currentIdx   = 0;
  let isTransition = false;

  // Media element activo
  let mediaEl     = null;
  let currentVideo = null;

  // Parallax state (lerp suave)
  let targetDX = 0, targetDY = 0;
  let currDX   = 0, currDY   = 0;
  const LERP  = 0.055;  // velocidad de seguimiento (más bajo = más suave)
  const SCALE = 1.08;   // zoom base para que haya margen de movimiento
  const RANGE = 0.026;  // amplitud del parallax (fracción del tamaño)

  // ── Loop de animación (parallax lerp) ────────────────────────
  function animate() {
    animId = requestAnimationFrame(animate);
    currDX += (targetDX - currDX) * LERP;
    currDY += (targetDY - currDY) * LERP;
    if (mediaEl) {
      const tx = (currDX * 100 * RANGE).toFixed(3);
      const ty = (currDY * 100 * RANGE).toFixed(3);
      mediaEl.style.transform = `scale(${SCALE}) translate(${tx}%, ${ty}%)`;
    }
  }

  // ── Crear elemento media con estilos base ─────────────────────
  function _makeMediaEl(isVid) {
    const el = document.createElement(isVid ? 'video' : 'img');
    el.className = 'v360-media';
    if (isVid) {
      el.muted       = true;
      el.loop        = true;
      el.playsInline = true;
    }
    return el;
  }

  // ── Cargar imagen o video → devuelve el elemento listo ────────
  function loadRoom(src, isVid) {
    return new Promise((resolve, reject) => {
      const el    = _makeMediaEl(isVid);
      const event = isVid ? 'loadeddata' : 'load';
      el.addEventListener(event,  () => resolve(el), { once: true });
      el.addEventListener('error', reject,            { once: true });
      el.src = src;
    });
  }

  // ── Detener y liberar video actual ────────────────────────────
  function _releaseVideo() {
    if (!currentVideo) return;
    currentVideo.pause();
    currentVideo = null;
  }

  // ── Sincronizar icono play/pause ─────────────────────────────
  function _syncPlayBtn() {
    const btn = document.getElementById('viewer360-play-btn');
    if (!btn) return;
    const isVid = roomTypes[currentIdx] === 'video';
    btn.style.display = isVid ? 'flex' : 'none';
    if (!currentVideo) return;
    btn.innerHTML = currentVideo.paused
      ? `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><polygon points="4,2 14,8 4,14"/></svg>`
      : `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></svg>`;
  }

  // ── Actualizar UI (nombre, contador, flechas, thumbs) ────────
  function updateUI() {
    const nameEl    = document.getElementById('viewer360-room-name');
    const counterEl = document.getElementById('viewer360-room-counter');
    if (nameEl)    nameEl.textContent    = roomNames[currentIdx] || `Espacio ${currentIdx + 1}`;
    if (counterEl) counterEl.textContent = `${currentIdx + 1} / ${roomSrcs.length}`;

    document.querySelectorAll('.v360-thumb').forEach((el, i) => {
      el.classList.toggle('active', i === currentIdx);
    });

    const single = roomSrcs.length <= 1;
    ['viewer360-prev', 'viewer360-next'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.style.display = single ? 'none' : 'flex';
    });

    _syncPlayBtn();
  }

  // ── Crossfade al cambiar de sala ──────────────────────────────
  async function swapRoom(idx) {
    if (isTransition || idx === currentIdx) return;
    isTransition = true;

    const container = document.getElementById('viewer360-canvas-wrap');
    if (!container) { isTransition = false; return; }

    // Fade out el media actual
    if (mediaEl) {
      mediaEl.style.opacity = '0';
      await new Promise(r => setTimeout(r, 380));
    }

    try {
      const isVid = roomTypes[idx] === 'video';
      const newEl = await loadRoom(roomSrcs[idx], isVid);
      newEl.style.opacity = '0';
      container.appendChild(newEl);

      // Quitar el anterior
      if (mediaEl) { mediaEl.remove(); mediaEl = null; }
      _releaseVideo();

      if (isVid) {
        currentVideo = newEl;
        newEl.play().catch(() => {});
      }

      mediaEl    = newEl;
      currentIdx = idx;

      // Reset parallax
      targetDX = 0; targetDY = 0;

      // Fade in
      requestAnimationFrame(() => requestAnimationFrame(() => {
        newEl.style.opacity = '1';
      }));

      updateUI();
      scrollThumbIntoView(idx);
    } catch (e) { /* silencioso */ }

    isTransition = false;
  }

  // ── Thumbnails strip ─────────────────────────────────────────
  function buildThumbs() {
    const strip = document.getElementById('viewer360-thumbs');
    if (!strip) return;
    strip.innerHTML = '';
    roomSrcs.forEach((src, i) => {
      const isVid = roomTypes[i] === 'video';
      const wrap  = document.createElement('div');
      wrap.className = 'v360-thumb' + (i === currentIdx ? ' active' : '');
      wrap.title = roomNames[i] || `Espacio ${i + 1}`;

      if (isVid) {
        const vid = document.createElement('video');
        Object.assign(vid, { src, muted: true, autoplay: true, loop: true, playsInline: true });
        vid.draggable = false;
        wrap.appendChild(vid);
        const badge = document.createElement('div');
        badge.className = 'v360-thumb-video-badge';
        badge.textContent = '▶';
        wrap.appendChild(badge);
      } else {
        const img = document.createElement('img');
        img.src = src; img.alt = wrap.title; img.draggable = false;
        wrap.appendChild(img);
      }

      const lbl = document.createElement('div');
      lbl.className  = 'v360-thumb-label';
      lbl.textContent = roomNames[i] || `${i + 1}`;
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

  // ── Eventos mouse / touch / giroscopio ───────────────────────
  function bindEvents(container) {

    // Mouse
    container.addEventListener('mousemove', e => {
      const r = container.getBoundingClientRect();
      targetDX = ((e.clientX - r.left)  / r.width  - 0.5) * 2;
      targetDY = ((e.clientY - r.top)   / r.height - 0.5) * 2;
    });
    container.addEventListener('mouseleave', () => {
      targetDX = 0; targetDY = 0;
    });

    // Touch
    container.addEventListener('touchmove', e => {
      if (e.touches.length !== 1) return;
      const r = container.getBoundingClientRect();
      targetDX = ((e.touches[0].clientX - r.left) / r.width  - 0.5) * 2;
      targetDY = ((e.touches[0].clientY - r.top)  / r.height - 0.5) * 2;
    }, { passive: true });
    container.addEventListener('touchend', () => {
      targetDX = 0; targetDY = 0;
    }, { passive: true });

    // Giroscopio (iOS requiere permiso explícito)
    if (typeof DeviceOrientationEvent !== 'undefined') {
      const attachGyro = () => {
        window.addEventListener('deviceorientation', e => {
          const overlay = document.getElementById('viewer360-overlay');
          if (!overlay || overlay.classList.contains('hidden')) return;
          if (e.gamma === null) return;
          targetDX = Math.max(-1, Math.min(1, e.gamma / 22));
          targetDY = Math.max(-1, Math.min(1, (e.beta - 45) / 22));
        });
      };
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+: pedir permiso en primer click del usuario dentro del viewer
        container.addEventListener('click', () => {
          DeviceOrientationEvent.requestPermission()
            .then(s => { if (s === 'granted') attachGyro(); })
            .catch(() => {});
        }, { once: true });
      } else {
        attachGyro();
      }
    }

    // Teclado
    window.addEventListener('keydown', e => {
      const overlay = document.getElementById('viewer360-overlay');
      if (!overlay || overlay.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight') nextRoom();
      if (e.key === 'ArrowLeft')  prevRoom();
      if (e.key === 'Escape')     close();
      if (e.key === ' ')          { e.preventDefault(); togglePlay(); }
    });

    // Resize: nada que hacer (el CSS se encarga)
    window.addEventListener('resize', () => {
      targetDX = 0; targetDY = 0;
    });
  }

  // ════════════════════════════════════════════════════════════
  // API PÚBLICA
  // ════════════════════════════════════════════════════════════

  async function open(imageSrcs, startIndex, rNames, rTypes) {
    const overlay   = document.getElementById('viewer360-overlay');
    const loading   = document.getElementById('viewer360-loading');
    const container = document.getElementById('viewer360-canvas-wrap');
    if (!overlay || !container) return;

    roomSrcs   = Array.isArray(imageSrcs) ? imageSrcs : [imageSrcs];
    roomNames  = Array.isArray(rNames)    ? rNames    : [];
    roomTypes  = Array.isArray(rTypes)    ? rTypes    : [];
    currentIdx = typeof startIndex === 'number' ? startIndex : 0;
    targetDX = 0; targetDY = 0; currDX = 0; currDY = 0;

    loading.style.display = 'flex';
    overlay.classList.remove('hidden');

    // Hint
    const hint = document.getElementById('viewer360-hint');
    if (hint) {
      hint.textContent = window.matchMedia('(pointer:coarse)').matches
        ? 'Desliza para el efecto de profundidad'
        : 'Mueve el mouse para el efecto de profundidad';
      hint.style.opacity = '1';
      setTimeout(() => { hint.style.opacity = '0'; }, 3500);
    }

    // Limpiar media anterior
    if (mediaEl) { mediaEl.remove(); mediaEl = null; }
    _releaseVideo();

    buildThumbs();
    updateUI();

    if (!isBound) { bindEvents(container); isBound = true; }
    if (!animId)  animate();

    const isVid = roomTypes[currentIdx] === 'video';
    const setStatus = t => {
      const sp = document.querySelector('#viewer360-loading span');
      if (sp) sp.textContent = t;
    };
    setStatus(isVid ? 'Cargando video…' : 'Cargando imagen…');

    try {
      const el = await loadRoom(roomSrcs[currentIdx], isVid);
      el.style.opacity = '0';
      container.appendChild(el);
      mediaEl = el;
      if (isVid) {
        currentVideo = el;
        el.play().catch(() => {});
      }
      loading.style.display = 'none';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.opacity = '1';
      }));
      updateUI();
    } catch (e) {
      loading.innerHTML =
        '<span style="color:var(--red);font-size:13px">Error al cargar el archivo</span>';
    }
  }

  function close() {
    _releaseVideo();
    const overlay = document.getElementById('viewer360-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (document.fullscreenElement) document.exitFullscreen?.();
  }

  function resetView() {
    targetDX = 0; targetDY = 0;
  }

  function toggleFullscreen() {
    const ov = document.getElementById('viewer360-overlay');
    if (!document.fullscreenElement) ov?.requestFullscreen();
    else document.exitFullscreen?.();
  }

  function togglePlay() {
    if (!currentVideo) return;
    if (currentVideo.paused) currentVideo.play().catch(() => {});
    else currentVideo.pause();
    _syncPlayBtn();
  }

  function nextRoom() { swapRoom((currentIdx + 1) % roomSrcs.length); }
  function prevRoom() { swapRoom((currentIdx - 1 + roomSrcs.length) % roomSrcs.length); }
  function goToRoom(i) { if (i !== currentIdx) swapRoom(i); }

  return { open, close, resetView, toggleFullscreen, nextRoom, prevRoom, goToRoom, togglePlay };
})();
