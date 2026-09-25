// ============================================================
// CROP EDITOR + UPLOAD S PROGRESSOM
// ============================================================

// ------------------------------------------------------------------
// Upload overlay
// ------------------------------------------------------------------
function ensureUploadOverlay() {
  let el = document.getElementById('upload-overlay');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'upload-overlay';
  el.className = 'upload-overlay';
  el.innerHTML = `
    <div class="upload-overlay-inner">
      <div class="upload-spinner"></div>
      <p class="upload-overlay-label" id="upload-overlay-label">Nahrávám…</p>
      <div class="upload-overlay-bar"><div class="upload-overlay-fill" id="upload-overlay-fill"></div></div>
      <p class="upload-overlay-percent" id="upload-overlay-percent">0 %</p>
      <p class="upload-overlay-hint">Nezavírej prosím tuto stránku.</p>
    </div>`;
  document.body.appendChild(el);
  return el;
}

function showUploadOverlay(label = 'Nahrávám…') {
  const el = ensureUploadOverlay();
  const lbl = document.getElementById('upload-overlay-label');
  const pct = document.getElementById('upload-overlay-percent');
  const fill = document.getElementById('upload-overlay-fill');
  if (lbl) lbl.textContent = label;
  if (pct) pct.textContent = '0 %';
  if (fill) fill.style.width = '0%';
  el.style.pointerEvents = 'auto';
  el.classList.add('is-visible');
  document.body.style.overflow = 'hidden';
}

function updateUploadOverlay(pct, label) {
  const el = document.getElementById('upload-overlay');
  if (!el) return;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const pctEl = document.getElementById('upload-overlay-percent');
  const fill = document.getElementById('upload-overlay-fill');
  const lbl = document.getElementById('upload-overlay-label');
  if (pctEl) pctEl.textContent = p + ' %';
  if (fill) fill.style.width = p + '%';
  if (label && lbl) lbl.textContent = label;
}

// OPRAVA: Dôrazné čistenie — zruší pointer-events okamžite, z DOM odstráni po animácii.
function hideUploadOverlay() {
  const el = document.getElementById('upload-overlay');
  if (el) {
    el.classList.remove('is-visible');
    el.style.pointerEvents = 'none';
    // Po animácii odstrániť z DOM úplne (aby nič neblokovalo klik)
    setTimeout(() => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }, 260);
  }
  // Vždy vyčisti body
  document.body.style.overflow = '';
  document.body.style.pointerEvents = '';
  document.documentElement.style.pointerEvents = '';
}

// ------------------------------------------------------------------
// Upload s progressom (XHR)
// ------------------------------------------------------------------
function uploadWithProgress(path, formData, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const token = (typeof getToken === 'function') ? getToken() : null;

    xhr.open('POST', `${API_BASE_URL}${path}`, true);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress((e.loaded / e.total) * 100);
      }
    };

    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else {
        const msg = (data && data.error) || `Chyba ${xhr.status}`;
        const err = new Error(msg);
        err.status = xhr.status;
        err.data = data;
        reject(err);
      }
    };

    xhr.onerror = () => reject(new Error('Chyba pripojenia.'));
    xhr.ontimeout = () => reject(new Error('Vypršal čas nahrávania.'));
    xhr.timeout = 120000;

    xhr.send(formData);
  });
}

// ------------------------------------------------------------------
// Crop Editor
// ------------------------------------------------------------------
function openCropEditor(file, opts = {}) {
  return new Promise(async (resolve) => {
    const aspect = opts.aspect || 9 / 16;
    const maxWidth = opts.maxWidth || 1080;
    const quality = opts.quality || 0.88;
    const label = opts.label || '';
    const outputType = opts.outputType || 'image/jpeg';

    let img;
    try { img = await loadImageFromFile(file); }
    catch (err) {
      showToast('Nepodařilo se načíst obrázek.');
      resolve(null);
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'crop-modal';
    modal.innerHTML = `
      <div class="crop-modal-head">
        <button class="crop-modal-btn" data-crop-cancel>Zrušit</button>
        <span class="crop-modal-title">${escapeHtml(label || 'Ořezat')}</span>
        <button class="crop-modal-btn crop-modal-btn-primary" data-crop-confirm>Hotovo</button>
      </div>
      <div class="crop-stage" data-crop-stage>
        <canvas class="crop-canvas" data-crop-canvas></canvas>
        <div class="crop-grid">
          <div class="crop-grid-line crop-grid-v1"></div>
          <div class="crop-grid-line crop-grid-v2"></div>
          <div class="crop-grid-line crop-grid-h1"></div>
          <div class="crop-grid-line crop-grid-h2"></div>
        </div>
      </div>
      <div class="crop-toolbar">
        <button class="crop-tool-btn" data-crop-zoom-out aria-label="Zmenšit">−</button>
        <input type="range" class="crop-zoom-slider" data-crop-zoom min="1" max="4" step="0.01" value="1" />
        <button class="crop-tool-btn" data-crop-zoom-in aria-label="Zvětšit">+</button>
        <button class="crop-tool-btn" data-crop-rotate aria-label="Otočit">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
        </button>
      </div>
    `;
    document.body.appendChild(modal);
    modal.classList.add('is-open');
    document.body.style.overflow = 'hidden';

    const stage = modal.querySelector('[data-crop-stage]');
    const canvas = modal.querySelector('[data-crop-canvas]');
    const ctx = canvas.getContext('2d');

    function computeFrame() {
      const rect = stage.getBoundingClientRect();
      const maxW = rect.width - 24;
      const maxH = rect.height - 24;
      let w = maxW;
      let h = w / aspect;
      if (h > maxH) { h = maxH; w = h * aspect; }
      return { w: Math.floor(w), h: Math.floor(h) };
    }

    let frame = computeFrame();
    canvas.style.width = frame.w + 'px';
    canvas.style.height = frame.h + 'px';

    const dpr = window.devicePixelRatio || 1;
    canvas.width = frame.w * dpr;
    canvas.height = frame.h * dpr;
    ctx.scale(dpr, dpr);

    const st = { scale: 1, offsetX: 0, offsetY: 0, rotation: 0 };

    function getBaseScale() {
      const rotated = (st.rotation % 180 !== 0);
      const imgW = rotated ? img.height : img.width;
      const imgH = rotated ? img.width : img.height;
      return Math.max(frame.w / imgW, frame.h / imgH);
    }

    function resetView() {
      st.scale = getBaseScale();
      st.offsetX = 0;
      st.offsetY = 0;
      draw();
      syncZoomSlider();
    }

    function syncZoomSlider() {
      const slider = modal.querySelector('[data-crop-zoom]');
      if (!slider) return;
      const baseScale = getBaseScale();
      const rel = st.scale / baseScale;
      slider.value = Math.min(4, Math.max(1, rel)).toString();
    }

    function clampOffsets() {
      const rotated = (st.rotation % 180 !== 0);
      const imgW = rotated ? img.height : img.width;
      const imgH = rotated ? img.width : img.height;
      const drawW = imgW * st.scale;
      const drawH = imgH * st.scale;
      const maxX = Math.max(0, (drawW - frame.w) / 2);
      const maxY = Math.max(0, (drawH - frame.h) / 2);
      st.offsetX = Math.max(-maxX, Math.min(maxX, st.offsetX));
      st.offsetY = Math.max(-maxY, Math.min(maxY, st.offsetY));
    }

    function draw() {
      clampOffsets();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(dpr, dpr);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, frame.w, frame.h);

      const cx = frame.w / 2 + st.offsetX;
      const cy = frame.h / 2 + st.offsetY;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((st.rotation * Math.PI) / 180);
      const dw = img.width * st.scale;
      const dh = img.height * st.scale;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      ctx.restore();
    }

    let isDragging = false;
    let dragStart = null;
    let pinchStart = null;

    function getPoint(e) {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }
    function touchDist(touches) {
      const [a, b] = touches;
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }

    function pointerDown(e) {
      if (e.touches && e.touches.length === 2) {
        pinchStart = { dist: touchDist(e.touches), scale: st.scale };
        return;
      }
      const p = getPoint(e);
      isDragging = true;
      dragStart = { x: p.x, y: p.y, ox: st.offsetX, oy: st.offsetY };
    }

    function pointerMove(e) {
      if (e.touches && e.touches.length === 2 && pinchStart) {
        const d = touchDist(e.touches);
        const ratio = d / pinchStart.dist;
        const base = getBaseScale();
        st.scale = Math.max(base, Math.min(base * 4, pinchStart.scale * ratio));
        draw();
        syncZoomSlider();
        e.preventDefault();
        return;
      }
      if (!isDragging) return;
      const p = getPoint(e);
      st.offsetX = dragStart.ox + (p.x - dragStart.x);
      st.offsetY = dragStart.oy + (p.y - dragStart.y);
      draw();
      if (e.touches) e.preventDefault();
    }

    function pointerUp() { isDragging = false; pinchStart = null; }

    canvas.addEventListener('mousedown', pointerDown);
    window.addEventListener('mousemove', pointerMove);
    window.addEventListener('mouseup', pointerUp);
    canvas.addEventListener('touchstart', pointerDown, { passive: false });
    canvas.addEventListener('touchmove', pointerMove, { passive: false });
    canvas.addEventListener('touchend', pointerUp);
    canvas.addEventListener('touchcancel', pointerUp);

    modal.querySelector('[data-crop-zoom]').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      const base = getBaseScale();
      st.scale = base * v;
      draw();
    });
    modal.querySelector('[data-crop-zoom-in]').addEventListener('click', () => {
      const base = getBaseScale();
      st.scale = Math.min(base * 4, st.scale * 1.15);
      draw();
      syncZoomSlider();
    });
    modal.querySelector('[data-crop-zoom-out]').addEventListener('click', () => {
      const base = getBaseScale();
      st.scale = Math.max(base, st.scale / 1.15);
      draw();
      syncZoomSlider();
    });
    modal.querySelector('[data-crop-rotate]').addEventListener('click', () => {
      st.rotation = (st.rotation + 90) % 360;
      resetView();
    });
    modal.querySelector('[data-crop-cancel]').addEventListener('click', () => {
      cleanup();
      resolve(null);
    });

    modal.querySelector('[data-crop-confirm]').addEventListener('click', async () => {
      const outW = Math.round(maxWidth);
      const outH = Math.round(maxWidth / aspect);
      const out = document.createElement('canvas');
      out.width = outW;
      out.height = outH;
      const octx = out.getContext('2d');
      octx.fillStyle = '#000';
      octx.fillRect(0, 0, outW, outH);

      const scaleFactor = outW / frame.w;
      const cx = outW / 2 + st.offsetX * scaleFactor;
      const cy = outH / 2 + st.offsetY * scaleFactor;

      octx.save();
      octx.translate(cx, cy);
      octx.rotate((st.rotation * Math.PI) / 180);
      const dw = img.width * st.scale * scaleFactor;
      const dh = img.height * st.scale * scaleFactor;
      octx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
      octx.restore();

      out.toBlob((blob) => {
        cleanup();
        if (!blob) { resolve(null); return; }
        const ext = outputType === 'image/png' ? 'png' : 'jpg';
        const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.' + ext;
        const newFile = new File([blob], name, { type: outputType, lastModified: Date.now() });
        resolve(newFile);
      }, outputType, quality);
    });

    const onResize = () => {
      frame = computeFrame();
      canvas.style.width = frame.w + 'px';
      canvas.style.height = frame.h + 'px';
      canvas.width = frame.w * dpr;
      canvas.height = frame.h * dpr;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      resetView();
    };
    window.addEventListener('resize', onResize);

    // OPRAVA: Silný cleanup — okamžité odstránenie z DOM, žiadny pointer-events leak
    function cleanup() {
      window.removeEventListener('mousemove', pointerMove);
      window.removeEventListener('mouseup', pointerUp);
      window.removeEventListener('resize', onResize);
      modal.classList.remove('is-open');
      modal.style.pointerEvents = 'none';
      if (modal.parentNode) modal.parentNode.removeChild(modal);
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }

    resetView();
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (err) => { URL.revokeObjectURL(url); reject(err); };
    img.src = url;
  });
}
