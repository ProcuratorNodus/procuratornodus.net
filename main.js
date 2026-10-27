// Procurator Nodus teaser — vanilla JS, no dependencies, no network.
// 1. Theme toggle (light / dark override, remembered in this browser only).
// 2. The hero: one set of points that loops knot, atoms, planets with a sun,
//    galaxies (cosmos.js, WebGL). With reduced motion, or without WebGL, it
//    shows one still frame (the planets with the sun) as an inline SVG.
// 3. Small decorative motion (diagram pulses, dashed flow, cursor) is only
//    switched on when the visitor has not asked for reduced motion.
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const prefersDark = matchMedia('(prefers-color-scheme: dark)');
  root.classList.add('js');

  /* ── Page menu (small screens) ─────────────────────────────────────── */
  // Without JavaScript the button stays hidden and the list is simply visible.
  const nav = document.getElementById('nav');
  const menuBtn = document.getElementById('menu-btn');
  const menu = document.getElementById('menu');
  if (nav && menuBtn && menu) {
    menuBtn.hidden = false;
    const wide = matchMedia('(min-width: 60rem)');
    const isOpen = () => nav.classList.contains('open');
    function setOpen(open, returnFocus) {
      nav.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      if (open) {
        const first = menu.querySelector('a');
        if (first) first.focus();
      } else if (returnFocus) {
        menuBtn.focus();
      }
    }
    menuBtn.addEventListener('click', () => setOpen(!isOpen(), false));
    menu.addEventListener('click', (e) => {
      if (e.target.closest('a')) setOpen(false, false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) setOpen(false, true);
    });
    document.addEventListener('click', (e) => {
      if (isOpen() && !nav.contains(e.target)) setOpen(false, false);
    });
    nav.addEventListener('focusout', (e) => {
      if (isOpen() && e.relatedTarget && !nav.contains(e.relatedTarget)) setOpen(false, false);
    });
    wide.addEventListener('change', () => {
      if (wide.matches) setOpen(false, false);
    });
  }

  /* ── Decorative motion gates ───────────────────────────────────────── */
  const motionTargets = '.diagram .pulse, .vg .fan path, .vg .merge path, .cur';
  function applyMotionGate() {
    const on = !reduced.matches;
    document.querySelectorAll(motionTargets).forEach((el) => el.classList.toggle('on', on));
  }
  applyMotionGate();

  /* ── The hero animation ────────────────────────────────────────────── */
  // The engine is in cosmos.js. Here: the loop, pausing, themes and reduced motion.
  // Without WebGL, or with reduced motion, the inline SVG stays up as a still frame.
  function buildKnot() {
    const wrap = document.getElementById('knot');
    const canvas = document.getElementById('knot-canvas');
    if (!wrap || !canvas || typeof PNCosmos === 'undefined') return null;

    let engine = null;
    let raf = 0, visible = false, lost = false;

    function parseColor(str, fallback) {
      const s = str.trim();
      if (s[0] === '#') {
        const h = s.length === 4 ? s.slice(1).split('').map((c) => c + c).join('') : s.slice(1, 7);
        const n = parseInt(h, 16);
        if (!Number.isNaN(n)) return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
      const m = s.match(/\d+(\.\d+)?/g);
      if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
      return fallback;
    }
    function readTheme() {
      if (!engine) return;
      const cs = getComputedStyle(root);
      engine.setColors(
        parseColor(cs.getPropertyValue('--knot-a'), [99, 102, 241]),
        parseColor(cs.getPropertyValue('--knot-b'), [129, 140, 248]),
        parseColor(cs.getPropertyValue('--knot-warm'), [245, 158, 11])
      );
    }
    function resize() {
      if (engine) engine.resize(wrap.clientWidth || 480, wrap.clientHeight || 480);
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      engine.frame(now);
    }
    function start() {
      if (raf || !engine || lost || reduced.matches || document.hidden) return;
      engine.resume();
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
    function live() {
      // Build on first use; the SVG still covers the wait and any failure.
      if (!engine && !lost) {
        engine = PNCosmos.create(canvas);
        if (!engine) { lost = true; return false; }
        readTheme();
        resize();
      }
      if (lost) return false;
      wrap.classList.add('knot-live');
      return true;
    }
    function update() {
      if (reduced.matches) { stop(); wrap.classList.remove('knot-live'); return; }
      if (visible && live()) start(); else stop();
    }

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      lost = true;
      stop();
      wrap.classList.remove('knot-live');
    });

    const io = new IntersectionObserver((entries) => {
      for (const e of entries) visible = e.isIntersecting;
      update();
    }, { threshold: 0.05 });
    io.observe(wrap);

    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else update();
    });
    reduced.addEventListener('change', update);

    return { refreshTheme: readTheme };
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
