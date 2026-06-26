// frasco.js — motor de partículas para la página individual de un perfume.
// Muestra la foto del frasco; al pasar el mouse / tocar se desintegra en partículas
// con los colores reales de la foto, y se reagrupa al soltar.

const ES_MOVIL = window.matchMedia('(hover: none)').matches || ('ontouchstart' in window) || innerWidth < 760;

// Sprite de partícula pre-renderizado por color (redondeado para limitar la caché)
const SpriteCache = {};
function getSprite(col) {
  const r = Math.round(col[0] / 24) * 24, g = Math.round(col[1] / 24) * 24, b = Math.round(col[2] / 24) * 24;
  const key = r + ',' + g + ',' + b;
  if (SpriteCache[key]) return SpriteCache[key];
  const s = 24, c = document.createElement('canvas'); c.width = s; c.height = s;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grd.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`);
  grd.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grd; x.fillRect(0, 0, s, s);
  SpriteCache[key] = c; return c;
}

// Carga la foto del frasco y extrae puntos con su color real
function getColoredPointsFromImage(src, W, H, cb) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const o = off.getContext('2d');
    const scale = Math.min(W / img.width, H / img.height) * 0.7;
    const dw = img.width * scale, dh = img.height * scale;
    const ox = (W - dw) / 2, oy = (H - dh) / 2;
    o.drawImage(img, ox, oy, dw, dh);
    const data = o.getImageData(0, 0, W, H).data;
    const step = ES_MOVIL ? Math.max(4, Math.round(W / 64)) : Math.max(3, Math.round(W / 90));
    const pts = [];
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      if (data[i + 3] > 110) pts.push({ x, y, col: [data[i], data[i + 1], data[i + 2]] });
    }
    cb(pts, { img, ox, oy, dw, dh });
  };
  img.onerror = () => cb(null, null);
  img.src = src;
}

// Inicializa el frasco de partículas en un canvas dado
function initFrasco(canvas, silueta, glowHex) {
  const ctx = canvas.getContext('2d');
  function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const fallback = hexToRgb(glowHex);

  // Densidad de píxeles del dispositivo: en móviles HiDPI es 2-3. El backing store
  // del canvas debe coincidir con el tamaño REAL en pantalla × dpr, o el navegador
  // reescala una resolución fija hacia arriba y la foto se ve borrosa.
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);

  // Arranca DISPERSO (disperse=1) y se reagrupa hasta formar la foto (tgtDisperse=0).
  // Así la transición es continua con el catálogo: allí se desintegró, aquí se reforma.
  let W, H, cx, cy, S, parts = [], img = null, disperse = 1, tgtDisperse = 0;
  const mouse = { x: -999, y: -999 };

  function build(home) {
    return home.map(h => {
      const a = Math.random() * Math.PI * 2, dist = W * 0.16 + Math.random() * W * 0.2;
      return {
        hx: h.x + (Math.random() - .5) * 3 * S, hy: h.y + (Math.random() - .5) * 3 * S,
        x: h.x, y: h.y, dx: cx + Math.cos(a) * dist, dy: cy + Math.sin(a) * dist,
        col: h.col || fallback, sz: Math.random() * 1.2 + 0.7, seed: Math.random(), sp: Math.random() * 0.5 + 0.5
      };
    });
  }

  function loadPoints() {
    getColoredPointsFromImage(silueta, W, H, (pts, meta) => {
      if (pts && pts.length) {
        parts = build(pts); img = meta;
        // colocar las partículas en su posición DISPERSA y forzar disperse=1 justo cuando
        // los datos llegan (independiente del tiempo de carga) → la reagrupación siempre se ve.
        parts.forEach(p => { p.x = p.dx; p.y = p.dy; });
        disperse = 1; tgtDisperse = 0;
      }
    });
  }

  // Ajusta el backing store al tamaño real en pantalla × dpr (nítido en móvil)
  // y reconstruye los puntos. Se llama al inicio y al rotar/redimensionar.
  function resize() {
    const r = canvas.getBoundingClientRect();
    const cssW = r.width || 480, cssH = r.height || 560;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    W = canvas.width; H = canvas.height; cx = W / 2; cy = H / 2;
    S = dpr; // escala para las métricas en píxeles del backing store
    loadPoints();
  }
  resize();
  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 200); });

  if (!ES_MOVIL) {
    canvas.addEventListener('mousemove', e => { const r = canvas.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width * W; mouse.y = (e.clientY - r.top) / r.height * H; });
    canvas.addEventListener('mouseenter', () => { tgtDisperse = 0.7; });
    canvas.addEventListener('mouseleave', () => { mouse.x = -999; mouse.y = -999; tgtDisperse = 0; });
  } else {
    // en móvil: pulso de dispersión al tocar
    canvas.addEventListener('touchstart', () => { tgtDisperse = 0.7; });
    canvas.addEventListener('touchend', () => { tgtDisperse = 0; });
  }

  let t = 0;
  function frame() {
    t += 0.016;
    disperse += (tgtDisperse - disperse) * 0.09;
    const disp = disperse;
    ctx.clearRect(0, 0, W, H);

    if (img && disp < 0.3) {
      ctx.globalAlpha = Math.max(0, 1 - disp / 0.28);
      ctx.drawImage(img.img, img.ox, img.oy, img.dw, img.dh);
      ctx.globalAlpha = 1;
    }
    if (disp > 0.04) {
      ctx.globalCompositeOperation = 'lighter';
      const pAlpha = Math.min(1, (disp - 0.04) / 0.2);
      for (const p of parts) {
        const vibX = Math.sin(t * 2.0 * p.sp + p.seed * 6.28) * 2.0 * S;
        const vibY = Math.cos(t * 1.7 * p.sp + p.seed * 6.28) * 2.0 * S;
        let bx = p.hx + (p.dx - p.hx) * disp + vibX;
        let by = p.hy + (p.dy - p.hy) * disp + vibY;
        const mdx = bx - mouse.x, mdy = by - mouse.y, md = Math.sqrt(mdx * mdx + mdy * mdy);
        if (md < 70 * S && md > 0.1) { const f = (1 - md / (70 * S)) * 50 * S; bx += mdx / md * f; by += mdy / md * f; }
        p.x += (bx - p.x) * .16; p.y += (by - p.y) * .16;
        const sz = p.sz * 2.4 * S * (1 + Math.sin(t * 2.5 + p.seed * 6.28) * 0.15);
        ctx.globalAlpha = pAlpha * (0.5 + p.seed * 0.45);
        ctx.drawImage(getSprite(p.col), p.x - sz, p.y - sz, sz * 2, sz * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    requestAnimationFrame(frame);
  }
  frame();
}

window.initFrasco = initFrasco;
