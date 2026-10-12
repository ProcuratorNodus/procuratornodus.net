// Procurator Nodus teaser — vanilla JS, no dependencies, no network.
// 1. Theme toggle (light / dark override, remembered in this browser only).
// 2. The knot: a particle torus knot that cycles into the hub-and-spoke
//    constellation and back, rendered on a 2D canvas. With reduced motion
//    it draws one still, complete frame instead of animating.
// 3. Small decorative motion (diagram pulses, dashed flow, cursor) is only
//    switched on when the visitor has not asked for reduced motion.
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');

  /* ── Decorative motion gates ───────────────────────────────────────── */
  const motionTargets = '.diagram .pulse, .vg .fan path, .vg .merge path, .cur';
  function applyMotionGate() {
    const on = !reduced.matches;
    document.querySelectorAll(motionTargets).forEach((el) => el.classList.toggle('on', on));
  }
  applyMotionGate();

  /* ── The knot ──────────────────────────────────────────────────────── */
  function buildKnot() {
    const wrap = document.getElementById('knot');
    const canvas = document.getElementById('knot-canvas');
    if (!wrap || !canvas || typeof canvas.getContext !== 'function') return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Torus knot surface, sampled like a (p=2, q=3) tube: radius 1.2, tube 0.35,
    // 220 tubular × 18 radial segments.
    const P = 2, Q = 3, R = 1.2, TUBE = 0.35, TUB = 220, RAD = 18;
    const COUNT = (TUB + 1) * (RAD + 1);
    const knotPos = new Float32Array(COUNT * 3);

    function onCurve(u) {
      const quOverP = (Q / P) * u;
      const cs = Math.cos(quOverP);
      return [R * (2 + cs) * 0.5 * Math.cos(u), R * (2 + cs) * 0.5 * Math.sin(u), R * Math.sin(quOverP) * 0.5];
    }
    function cross(a, b) {
      return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    }
    function norm(v) {
      const l = Math.hypot(v[0], v[1], v[2]) || 1;
      v[0] /= l; v[1] /= l; v[2] /= l;
      return v;
    }
    let k = 0;
    for (let i = 0; i <= TUB; i++) {
      const u = (i / TUB) * P * Math.PI * 2;
      const p1 = onCurve(u), p2 = onCurve(u + 0.01);
      const T = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
      let N = [p2[0] + p1[0], p2[1] + p1[1], p2[2] + p1[2]];
      const B = norm(cross(T, N));
      N = norm(cross(B, T));
      for (let j = 0; j <= RAD; j++) {
        const v = (j / RAD) * Math.PI * 2;
        const cx = -TUBE * Math.cos(v), cy = TUBE * Math.sin(v);
        knotPos[k++] = p1[0] + cx * N[0] + cy * B[0];
        knotPos[k++] = p1[1] + cx * N[1] + cy * B[1];
        knotPos[k++] = p1[2] + cx * N[2] + cy * B[2];
      }
    }

    // Hub-and-spoke constellation: a dense hub, six spoke clusters on a gently
    // puckered hexagon, two axial clusters in front and behind, and filaments
    // tracing hub → spoke.
    function buildConstellation(count) {
      const out = new Float32Array(count * 3);
      const RING = 6, RING_R = 1.7, HUB_R = 0.34, CLUSTER_R = 0.19;
      const hubShare = Math.floor(count * 0.28);
      const spokeShare = Math.floor(count * 0.42);
      const centers = [];
      for (let s = 0; s < RING; s++) {
        const a = (s / RING) * Math.PI * 2 + Math.PI / 2;
        centers.push([Math.cos(a) * RING_R, Math.sin(a) * RING_R, s % 2 === 0 ? 0.38 : -0.38]);
      }
      centers.push([0.68, -0.3, 1.35], [-0.72, 0.34, -1.35]);
      function scatter(i, cx, cy, cz, radius) {
        const cosT = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const rad = radius * Math.cbrt(Math.random());
        const sinT = Math.sqrt(1 - cosT * cosT);
        out[i * 3] = cx + rad * sinT * Math.cos(phi);
        out[i * 3 + 1] = cy + rad * sinT * Math.sin(phi);
        out[i * 3 + 2] = cz + rad * cosT;
      }
      for (let i = 0; i < count; i++) {
        if (i < hubShare) scatter(i, 0, 0, 0, HUB_R);
        else if (i < hubShare + spokeShare) {
          const c = centers[(i - hubShare) % centers.length];
          scatter(i, c[0], c[1], c[2], CLUSTER_R);
        } else {
          const c = centers[i % centers.length];
          const along = 0.12 + Math.random() * 0.76;
          scatter(i, c[0] * along, c[1] * along, c[2] * along, 0.05);
        }
      }
      return out;
    }
    const constPos = buildConstellation(COUNT);
    const STAGGER = 0.3;
    const stagger = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) stagger[i] = Math.random() * STAGGER;
    const pos = knotPos.slice();

    // Morph driver: g = 0 is the knot, g = 1 the constellation. Dwell in each
    // state, then morph to the other. Times are normalised to a 60 fps frame
    // so the pace is the same on every display.
    const MORPH_STEP = 1 / (1.8 * 60);
    const DWELL = 380;
    let g = 0, target = 0, dwell = DWELL, writtenG = -1;
    let rotX = 0, rotY = 0, t = 0;

    function easeInOut(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function writeMorph() {
      if (writtenG === g) return;
      for (let i = 0; i < COUNT; i++) {
        const p = Math.min(Math.max((g - stagger[i]) / (1 - STAGGER), 0), 1);
        const e = easeInOut(p);
        const j = i * 3;
        pos[j] = knotPos[j] + (constPos[j] - knotPos[j]) * e;
        pos[j + 1] = knotPos[j + 1] + (constPos[j + 1] - knotPos[j + 1]) * e;
        pos[j + 2] = knotPos[j + 2] + (constPos[j + 2] - knotPos[j + 2]) * e;
      }
      writtenG = g;
    }

    // Colour breathes between the two accent tokens of the active theme.
    let colA = [99, 102, 241], colB = [129, 140, 248];
    function parseColor(str) {
      const s = str.trim();
      if (s[0] === '#') {
        const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
        const n = parseInt(h, 16);
        if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      const m = s.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
      return null;
    }
    function readTheme() {
      const cs = getComputedStyle(root);
      colA = parseColor(cs.getPropertyValue('--knot-a')) || colA;
      colB = parseColor(cs.getPropertyValue('--knot-b')) || colB;
    }
    function mix(pulse) {
      const r = Math.round(colA[0] + (colB[0] - colA[0]) * pulse);
      const gg = Math.round(colA[1] + (colB[1] - colA[1]) * pulse);
      const b = Math.round(colA[2] + (colB[2] - colA[2]) * pulse);
      return `rgb(${r},${gg},${b})`;
    }

    // Camera: perspective, 50° vertical field of view, 5 units back.
    let W = 0, H = 0;
    const TAN_HALF = Math.tan((50 / 2) * Math.PI / 180);
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrap.clientWidth || 480;
      const h = wrap.clientHeight || 480;
      W = Math.round(w * dpr); H = Math.round(h * dpr);
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    }
    function draw() {
      writeMorph();
      const f = (H / 2) / TAN_HALF;
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      const pulse = (Math.sin(t) + 1) * 0.5;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = 0.88;
      ctx.fillStyle = mix(pulse);
      ctx.beginPath();
      for (let i = 0; i < COUNT; i++) {
        const j = i * 3;
        const x = pos[j], y = pos[j + 1], z = pos[j + 2];
        // rotate about Y, then X (Euler XYZ with no Z component)
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y2 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        const depth = 5 - z2;
        if (depth <= 0.1) continue;
        const s = Math.max(1, (0.032 * (H / 2)) / depth);
        const px = W / 2 + (x1 * f) / depth;
        const py = H / 2 - (y2 * f) / depth;
        ctx.rect(px - s / 2, py - s / 2, s, s);
      }
      ctx.fill();
    }

    let raf = 0, last = 0, visible = false;
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = last ? Math.min((now - last) / (1000 / 60), 3) : 1;
      last = now;
      rotY += 0.0025 * dt;
      rotX += 0.0008 * dt;
      t += 0.006 * dt;
      if (g !== target) {
        g = target > g ? Math.min(g + MORPH_STEP * dt, 1) : Math.max(g - MORPH_STEP * dt, 0);
      } else if ((dwell -= dt) <= 0) {
        target = target === 0 ? 1 : 0;
        dwell = DWELL;
      }
      draw();
    }
    function start() {
      if (raf || reduced.matches) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    // Reduced motion: one complete frame of the knot at a readable angle.
    function still() {
      stop();
      g = 0; target = 0; dwell = DWELL;
      rotY = 0.55; rotX = 0.35; t = Math.PI / 2;
      draw();
    }
    function show() { wrap.classList.add('knot-live'); }

    readTheme();
    resize();
    // If the hero is already on screen, switch to the canvas at once rather
    // than waiting for the first observer callback.
    const r0 = wrap.getBoundingClientRect();
    if (r0.bottom > 0 && r0.top < window.innerHeight) {
      visible = true;
      show();
      if (reduced.matches) still(); else start();
    } else if (reduced.matches) { still(); show(); }

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting;
      if (visible) {
        if (reduced.matches) { still(); show(); }
        else { show(); start(); }
      } else {
        stop();
      }
    }, { threshold: 0.05 });
    io.observe(wrap);

    const ro = new ResizeObserver(() => {
      resize();
      if (!raf) draw();
    });
    ro.observe(wrap);

    reduced.addEventListener('change', () => {
      if (reduced.matches) { still(); show(); }
      else if (visible) start();
    });

    return {
      refreshTheme() {
        readTheme();
        if (!raf) draw();
      },
    };
  }

  const knot = buildKnot();

  /* ── Theme toggle ──────────────────────────────────────────────────── */
  const btn = document.getElementById('theme');
  const isDark = () => (root.dataset.theme ? root.dataset.theme === 'dark' : prefersDark.matches);
  function syncButton() {
    if (!btn) return;
    const d = isDark();
    btn.setAttribute('aria-label', d ? 'Switch to light theme' : 'Switch to dark theme');
    btn.setAttribute('aria-pressed', String(d));
  }
  if (btn) {
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('pn-theme', next); } catch (_) { /* storage unavailable: theme still applies for this page */ }
      syncButton();
      if (knot) knot.refreshTheme();
    });
  }
  prefersDark.addEventListener('change', () => {
    syncButton();
    if (knot) knot.refreshTheme();
  });
  syncButton();

  reduced.addEventListener('change', applyMotionGate);
})();
