// Procurator Nodus teaser: the hero animation. One set of points loops
//   knot -> atomic orbitals -> planetary system with a sun -> three spiral
//   galaxies on a filament -> back to the knot.
// Plain WebGL, no dependencies. Every stage is one particle state (a path per
// point, plus size, warmth and glow); the vertex shader morphs the current state
// into the next, so after the first frame the CPU only sets a few uniforms.
// Exposes PNCosmos.create(canvas); main.js drives it and handles motion preferences.
const PNCosmos = (() => {
  'use strict';

  const TAU = Math.PI * 2;

  // ── vector helpers ────────────────────────────────────────────────────────
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
  const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const smoothstep = (a, b, x) => {
    const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
    return t * t * (3 - 2 * t);
  };
  function gauss() {
    const u = 1 - Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random());
  }
  function ball(r) {
    const ct = Math.random() * 2 - 1, ph = Math.random() * TAU, rr = r * Math.cbrt(Math.random()), st = Math.sqrt(1 - ct * ct);
    return [rr * st * Math.cos(ph), rr * st * Math.sin(ph), rr * ct];
  }
  const fuzz = (s) => [gauss() * s, gauss() * s, gauss() * s];

  // ── the knot ──────────────────────────────────────────────────────────────
  // Torus knot surface, a (2,3) tube: radius 1.2, tube 0.35, 220 x 18 segments.
  function knotPoints() {
    const P = 2, Q = 3, R = 1.2, TUBE = 0.35, TUB = 220, RAD = 18;
    const out = new Float32Array((TUB + 1) * (RAD + 1) * 3);
    const onCurve = (u) => {
      const q = (Q / P) * u, cs = Math.cos(q);
      return [R * (2 + cs) * 0.5 * Math.cos(u), R * (2 + cs) * 0.5 * Math.sin(u), R * Math.sin(q) * 0.5];
    };
    let k = 0;
    for (let i = 0; i <= TUB; i++) {
      const u = (i / TUB) * P * TAU;
      const p1 = onCurve(u), p2 = onCurve(u + 0.01);
      const T = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]];
      const B = norm(cross(T, [p2[0] + p1[0], p2[1] + p1[1], p2[2] + p1[2]]));
      const N = norm(cross(B, T));
      for (let j = 0; j <= RAD; j++) {
        const v = (j / RAD) * TAU;
        const cx = -TUBE * Math.cos(v), cy = TUBE * Math.sin(v);
        out[k++] = p1[0] + cx * N[0] + cy * B[0];
        out[k++] = p1[1] + cx * N[1] + cy * B[1];
        out[k++] = p1[2] + cx * N[2] + cy * B[2];
      }
    }
    return out;
  }

  // ── orbital layouts ───────────────────────────────────────────────────────
  // A shell is an ellipse (semi-axes r and r*ratio) rotated by w in its own plane,
  // tilted by incl about x, then turned by node about z. Crisp shells carry
  // `clumps` electrons; field shells (clumps 0) are sparse, wide bands.
  const shellOf = (r, incl, node, w, o) =>
    Object.assign({ r, ratio: 0.86, incl, node, w, dir: 1, clumps: 1, phase0: node + w, sigma: 0.01, weight: 0.02 }, o || {});

  const A_SPOKES = [[92, 1.58, 0.1], [33, 1.72, -0.32], [-27, 1.6, 0.26], [-91, 1.68, -0.3], [-151, 1.6, 0.32], [150, 1.74, -0.24]];
  const LAYOUT_A = {
    hub: {
      c: [0, 0, 0], core: 0.17, coreWeight: 0.07, mass: 1,
      shells: [
        shellOf(0.5, 0.95, 0.35, 0, { clumps: 2, sigma: 0.008, weight: 0.085 }),
        shellOf(0.72, 1.12, 2.45, 0.5, { ratio: 0.82, sigma: 0.013, weight: 0.07 }),
        shellOf(0.95, 0.86, 4.3, -0.4, { dir: -1, clumps: 2, sigma: 0.018, weight: 0.056 }),
        shellOf(1.28, 0.7, 1.4, 0.9, { ratio: 0.9, clumps: 0, sigma: 0.05, weight: 0.042 }),
        shellOf(1.56, 1.2, 3.6, 0.2, { ratio: 0.9, clumps: 0, sigma: 0.075, weight: 0.032 }),
      ],
    },
    spokes: A_SPOKES.map(([deg, r, z], k) => {
      const a = (deg * Math.PI) / 180;
      return {
        c: [Math.cos(a) * r, Math.sin(a) * r, z], core: 0.075, coreWeight: 0.011, mass: 0.12,
        shells: [
          shellOf(0.19, 0.85 + 0.12 * (k % 3), 0.6 + k * 1.3, 0, { phase0: k * 2.2, sigma: 0.006, weight: 0.026 }),
          shellOf(0.3, 1.05 - 0.14 * (k % 2), 2.3 + k * 1.3, 0.3, { ratio: 0.82, phase0: 1.5 + k * 2.2, sigma: 0.01, weight: 0.019 }),
          shellOf(0.46, 0.5 + 0.2 * (k % 3), 4.1 + k * 0.9, 0, { ratio: 0.92, clumps: 0, sigma: 0.03, weight: 0.012 }),
        ],
      };
    }),
    bow: 0.2, threadWeight: 0.022, flat: false,
    pose: { tilt: 0.16, sway: 0.34, spin: 0 },
  };

  const B_SPOKES = [[84, 1.28, 0.06], [24, 1.66, -0.05], [-38, 1.38, 0.07], [-98, 1.72, -0.06], [-160, 1.32, 0.05], [140, 1.6, -0.07]];
  const LAYOUT_B = {
    hub: {
      c: [0, 0, 0], core: 0.16, coreWeight: 0.07, mass: 1,
      shells: [
        shellOf(0.48, 0.1, 0.5, 0, { ratio: 0.96, clumps: 2, sigma: 0.008, weight: 0.085 }),
        shellOf(0.66, 0.16, 2.6, 0.8, { ratio: 0.95, sigma: 0.012, weight: 0.07 }),
        shellOf(0.86, 0.12, 4.4, -0.5, { ratio: 0.96, clumps: 2, sigma: 0.016, weight: 0.056 }),
        shellOf(1.16, 0.08, 1.2, 0, { ratio: 0.97, clumps: 0, sigma: 0.045, weight: 0.042 }),
        shellOf(1.5, 0.06, 3.2, 0, { ratio: 0.97, clumps: 0, sigma: 0.07, weight: 0.034 }),
      ],
    },
    spokes: B_SPOKES.map(([deg, r, z], k) => {
      const a = (deg * Math.PI) / 180;
      return {
        c: [Math.cos(a) * r, Math.sin(a) * r, z], core: 0.075, coreWeight: 0.011, mass: 0.12,
        shells: [
          shellOf(0.17, 0.16 + 0.06 * (k % 2), k * 1.1, 0, { ratio: 0.95, phase0: k * 2.2, sigma: 0.006, weight: 0.026 }),
          shellOf(0.27, 0.24 - 0.05 * (k % 3), 1.7 + k * 1.1, 0.4, { ratio: 0.94, phase0: 1.4 + k * 2.2, sigma: 0.01, weight: 0.019 }),
          shellOf(0.42, 0.1, 3.0 + k, 0, { ratio: 0.96, clumps: 0, sigma: 0.028, weight: 0.012 }),
        ],
      };
    }),
    bow: 0.22, threadWeight: 0.022, flat: true,
    pose: { tilt: -0.74, sway: 0.1, spin: 0.07 },
  };

  /** Unit in-plane axes (major, minor) of an orbit plane. */
  function planeAxes(incl, node, w) {
    const ci = Math.cos(incl), si = Math.sin(incl), cn = Math.cos(node), sn = Math.sin(node);
    const tilt = (x, y) => [x * cn - y * ci * sn, x * sn + y * ci * cn, y * si];
    return [tilt(Math.cos(w), Math.sin(w)), tilt(-Math.sin(w), Math.cos(w))];
  }

  /** The thread from a spoke (theta 0) to the hub (theta pi): centre, U, V of its half-ellipse. */
  function threadAxes(L, spoke) {
    const d = [spoke.c[0] - L.hub.c[0], spoke.c[1] - L.hub.c[1], spoke.c[2] - L.hub.c[2]];
    const m = add(L.hub.c, scale(d, 0.5));
    const side = norm(cross([0, 0, 1], d));
    return [m, scale(d, 0.5), scale(side, L.bow * Math.hypot(d[0], d[1], d[2]))];
  }

  /** Orbital speed (rad/s) on a circle of radius r around a node. */
  const omegaAt = (node, r) => (0.22 * Math.sqrt(node.mass)) / Math.pow(r, 1.5);

  /** Rest pose (Euler XYZ) at time `sec`; z is the spin about the system normal. */
  function restEuler(L, sec, out) {
    out[0] = L.pose.tilt + 0.05 * Math.sin(sec * 0.23);
    out[1] = L.pose.sway * Math.sin(sec * 0.17 + 1);
    out[2] = L.pose.spin * sec;
    return out;
  }

  // ── point records ─────────────────────────────────────────────────────────
  // One record is one point's path: p(theta) = c + u cos(theta) + v sin(theta), with
  //   amp = 0: an orbit, theta = phase + omega t
  //   amp > 0: a swing, theta = base + amp sin(phase + omega t)
  //   amp < 0: a one-way drift, theta = base - amp fract((phase + omega t) / 2pi),
  //            fading in and out at its ends
  // `anchor` is the node it belongs to; heat tints it warm; glow makes a soft sprite.
  function nucleus(L, node, n, d0, out) {
    for (let k = 0; k < n; k++) {
      const r = node.core * (0.15 + 0.85 * Math.cbrt(Math.random()));
      let [u, v] = planeAxes(Math.acos(1 - 2 * Math.random()), Math.random() * TAU, Math.random() * TAU);
      if (L.flat) { u = [u[0], u[1], u[2] * 0.5]; v = [v[0], v[1], v[2] * 0.5]; }
      const omega = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.9);
      out.push({ c: node.c, u: scale(u, r), v: scale(v, r), phase: Math.random() * TAU, omega, delay: d0 + 0.07 * Math.random(), size: 1, base: 0, amp: 0, anchor: node.c, heat: 0, glow: 0 });
    }
  }

  function shell(node, s, n, d0, out) {
    const [u, v] = planeAxes(s.incl, s.node, s.w);
    const nrm = cross(u, v);
    const omega = s.dir * omegaAt(node, s.r);
    const clumpN = s.clumps > 0 ? Math.round(n * 0.3) : 0; // electrons; the rest trace the orbit
    const field = s.clumps === 0;
    for (let k = 0; k < n; k++) {
      let phase = ((k - clumpN + Math.random()) / (n - clumpN)) * TAU;
      let jit = 0;
      let size = field ? 0.75 : 0.95;
      if (k < clumpN) {
        // An electron: a small bead with a short tail behind it.
        const tail = Math.min(-Math.log(1 - Math.random()) * 0.22, 1.1);
        phase = s.phase0 + ((k % s.clumps) / s.clumps) * TAU - s.dir * tail;
        jit = 0.02 * Math.exp(-tail * 3);
        size = 1.2 - 0.3 * Math.min(tail / 0.6, 1);
      }
      const sc = 1 + (gauss() * s.sigma) / s.r;
      const c = add(add(node.c, scale(nrm, gauss() * s.sigma * 0.6)), ball(jit));
      const delay = d0 + (field ? 0.12 : 0.07) * Math.random();
      out.push({ c, u: scale(u, s.r * sc), v: scale(v, s.r * s.ratio * sc), phase, omega, delay, size, base: 0, amp: 0, anchor: node.c, heat: 0, glow: 0 });
    }
  }

  function thread(L, spoke, n, d0, out) {
    const [m, U, V] = threadAxes(L, spoke);
    const packetN = Math.round(n * 0.45);
    for (let k = 0; k < n; k++) {
      const packet = k < packetN;
      const base = packet ? Math.PI / 2 : 0.14 + Math.random() * (Math.PI - 0.28);
      const amp = packet ? Math.PI / 2 : 0.04;
      const phase = packet ? (k % 2) * Math.PI + gauss() * 0.1 : Math.random() * TAU;
      out.push({ c: add(m, ball(0.016)), u: U, v: V, phase, omega: packet ? 0.62 : 0.5, delay: d0 + 0.12 * Math.random(), size: 0.85, base, amp, anchor: m, heat: 0, glow: 0 });
    }
  }

  const recHome = (r) => add(add(r.c, scale(r.u, Math.cos(r.phase))), scale(r.v, Math.sin(r.phase)));

  /** Split `count` points over weighted shares by cumulative rounding (always sums to `count`). */
  function shareCounts(weights, count) {
    const total = weights.reduce((s, w) => s + w, 0);
    let acc = 0;
    return weights.map((w) => {
      const from = Math.round((acc / total) * count);
      acc += w;
      return Math.round((acc / total) * count) - from;
    });
  }

  /** The records of a layout, hub outward. `counts` forces the per-share counts, so
   *  two layouts of the same shape give matching roles record by record. */
  function orbitalRecords(L, count, counts) {
    const shares = [];
    const crisp = L.hub.shells.filter((s) => s.clumps > 0).length;
    shares.push({ w: L.hub.coreWeight, emit: (n, o) => nucleus(L, L.hub, n, 0.0, o) });
    L.hub.shells.forEach((s, j) => {
      const d0 = s.clumps > 0 ? 0.1 + 0.08 * j : 0.76 + 0.06 * (j - crisp);
      shares.push({ w: s.weight, emit: (n, o) => shell(L.hub, s, n, d0, o) });
    });
    const dist = L.spokes.map((sp) => Math.hypot(sp.c[0], sp.c[1], sp.c[2]));
    const dMin = Math.min(...dist), dMax = Math.max(...dist);
    L.spokes.forEach((sp, k) => {
      const near = (dist[k] - dMin) / (dMax - dMin || 1);
      shares.push({ w: L.threadWeight, emit: (n, o) => thread(L, sp, n, 0.32 + 0.06 * near, o) });
      shares.push({ w: sp.coreWeight, emit: (n, o) => nucleus(L, sp, n, 0.48 + 0.08 * near, o) });
      sp.shells.forEach((s, j) => shares.push({ w: s.weight, emit: (n, o) => shell(sp, s, n, s.clumps === 0 ? 0.84 : 0.56 + 0.08 * near + 0.07 * j, o) }));
    });
    const n = counts || shareCounts(shares.map((x) => x.w), count);
    const recs = [];
    shares.forEach((sh, k) => sh.emit(n[k], recs));
    return { recs, counts: n };
  }

  /** Pair records with knot points by angle around the centre, so each point leaves the
   *  knot toward the node on its own side. Returns the record index for each point. */
  function pairByAzimuth(recs, knot) {
    const count = knot.length / 3;
    const recAz = recs.map((r) => { const h = recHome(r); return Math.atan2(h[1], h[0]); });
    const byRec = recs.map((_, i) => i).sort((p, q) => recAz[p] - recAz[q]);
    const knotAz = Array.from({ length: count }, (_, i) => Math.atan2(knot[i * 3 + 1], knot[i * 3]));
    const byKnot = knotAz.map((_, i) => i).sort((p, q) => knotAz[p] - knotAz[q]);
    const pick = new Int32Array(count);
    for (let k = 0; k < count; k++) pick[byKnot[k]] = byRec[k];
    return pick;
  }

  // ── the galaxies ──────────────────────────────────────────────────────────
  // c centre, r disk radius, incl/node disk tilt, arms, wind = 1/tan(pitch),
  // spin = pattern speed (rad/s, sign = sense; rigid, so the arms never wind up),
  // twist = arm phase, weight = share of the points.
  const GALAXIES = [
    { c: [-1.3, -0.76, 0.2], r: 0.95, incl: 0.78, node: 0.5, arms: 2, wind: 3.0, spin: 0.09, twist: 0.4, weight: 0.3 },
    { c: [0.26, 0.1, -0.25], r: 0.7, incl: 1.02, node: 2.2, arms: 2, wind: 2.7, spin: -0.12, twist: 1.9, weight: 0.22 },
    { c: [1.55, 1.1, 0.15], r: 0.52, incl: 0.4, node: -0.9, arms: 3, wind: 1.9, spin: 0.15, twist: 3.1, weight: 0.17 },
  ];
  // The main filament runs lower-left to upper-right in a gentle S, leaving the frame at both ends.
  const FILAMENT = [[-2.7, -1.75, -0.25], GALAXIES[0].c, GALAXIES[1].c, GALAXIES[2].c, [2.65, 1.95, 0.3]];
  const FILAMENT_BOW = [0.1, -0.09, 0.11, -0.08];
  // Faint side strands: far end, galaxy index, bow.
  const STRANDS = [[[-0.35, -2.25, -0.3], 0, 0.12], [[-0.85, 1.95, 0.35], 1, -0.14], [[2.55, -0.35, -0.3], 2, 0.1]];
  const GALAXY_POSE = { pose: { tilt: 0.22, sway: 0.2, spin: 0 } };

  /** Half-ellipse link from a (theta 0) to b (theta pi), bowed sideways by `bow` of its length. */
  function link(a, b, bow) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const side = norm(cross([0, 0, 1], d));
    return [lerp3(a, b, 0.5), scale(d, -0.5), scale(side, bow * Math.hypot(d[0], d[1], d[2]))];
  }

  /** A record on a link: a trace point at `th` that shimmers in place, or a drift that
   *  runs from theta `drift.from` to `drift.to` and repeats. */
  function onLink(m, U, V, th, o) {
    const c = add(m, fuzz(o.sigma));
    if (o.drift) {
      const from = o.drift.from, to = o.drift.to;
      const omega = (to > from ? 1 : -1) * (0.7 + Math.random() * 0.4);
      const rec = { c, u: U, v: V, phase: Math.random() * TAU, omega, delay: o.delay, size: o.size, base: Math.min(from, to), amp: -Math.abs(to - from), anchor: c, heat: 0, glow: 0 };
      rec.anchor = recHome(rec);
      return rec;
    }
    const rec = { c, u: U, v: V, phase: Math.random() * TAU, omega: 0.5, delay: o.delay, size: o.size, base: th, amp: 0.035, anchor: c, heat: 0, glow: o.glow || 0 };
    rec.anchor = add(add(c, scale(U, Math.cos(th))), scale(V, Math.sin(th)));
    return rec;
  }

  function diskStar(g, u, v, nrm, r, th, z, size, heat, delay) {
    return { c: add(g.c, scale(nrm, z)), u: scale(u, r), v: scale(v, r), phase: th, omega: g.spin, delay, size, base: 0, amp: 0, anchor: g.c, heat, glow: 0 };
  }

  function galaxy(g, n, out) {
    const [u, v] = planeAxes(g.incl, g.node, 0);
    const nrm = cross(u, v);
    const nb = Math.round(n * 0.24), na = Math.round(n * 0.56);
    const R = g.r;
    const rIn = 0.17 * R;
    const trail = -Math.sign(g.spin); // trailing arms: the outer arm lags the rotation
    for (let k = 0; k < n; k++) {
      if (k < nb) {
        // Bulge: a dense, slightly flattened swarm on random orbits, mostly warm.
        const r = 0.22 * R * (0.08 + 0.92 * Math.pow(Math.random(), 1.6));
        let [pu, pv] = planeAxes(Math.acos(1 - 2 * Math.random()), Math.random() * TAU, Math.random() * TAU);
        const flat = (a) => add(a, scale(nrm, -0.45 * (a[0] * nrm[0] + a[1] * nrm[1] + a[2] * nrm[2])));
        pu = flat(pu); pv = flat(pv);
        const omega = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.4);
        out.push({ c: g.c, u: scale(pu, r), v: scale(pv, r), phase: Math.random() * TAU, omega, delay: 0.25 + 0.15 * Math.random(), size: 1.05 + 0.3 * (1 - r / (0.22 * R)), base: 0, amp: 0, anchor: g.c, heat: Math.random() < 0.72 ? 1 : 0, glow: 0 });
      } else if (k < nb + na) {
        // Arms: logarithmic spirals, spread widening outward, a few bright knots.
        const x = Math.random();
        const r = rIn + (R - rIn) * Math.pow(x, 0.9);
        const bright = Math.random() < 0.09;
        const th = g.twist + ((k % g.arms) / g.arms) * TAU + trail * g.wind * Math.log(r / rIn) + gauss() * (bright ? 0.05 : 0.12 + 0.2 * x);
        const heat = x < 0.15 && Math.random() < 0.3 ? 1 : 0;
        out.push(diskStar(g, u, v, nrm, r, th, gauss() * 0.02 * R, bright ? 1.35 : 1 - 0.3 * x, heat, 0.35 + 0.45 * x + 0.1 * Math.random()));
      } else {
        // Disk: an exponential sheet of faint stars under the arms.
        const r = Math.min(0.12 * R + -Math.log(1 - Math.random()) * 0.3 * R, 1.05 * R);
        const heat = r < 0.35 * R && Math.random() < 0.35 ? 1 : 0;
        out.push(diskStar(g, u, v, nrm, r, Math.random() * TAU, gauss() * 0.03 * R, 0.62, heat, 0.5 + 0.4 * Math.random()));
      }
    }
  }

  const SUN_SPRITES = 14;
  const HAZE_SPRITES = 40;

  function galaxyRecords(count) {
    const links = FILAMENT.slice(1).map((b, k) => link(FILAMENT[k], b, FILAMENT_BOW[k]));
    const len = FILAMENT.slice(1).map((b, k) => Math.hypot(b[0] - FILAMENT[k][0], b[1] - FILAMENT[k][1], b[2] - FILAMENT[k][2]));
    const outer = (k) => k === 0 || k === links.length - 1;
    const edgeTh = (k) => (k === 0 ? 0 : Math.PI);
    const shares = [];
    const totalLen = len.reduce((s, l) => s + l, 0);
    links.forEach(([m, U, V], k) => {
      const w = len[k] / totalLen;
      // The filament itself: densest near the galaxies, thinning toward the frame edges.
      shares.push({ w: 0.15 * w, emit: (n, o) => { for (let i = 0; i < n; i++) {
        if (outer(k)) {
          const t = Math.pow(Math.random(), 1.4);
          const th = Math.abs(edgeTh(k) - Math.PI * (1 - t) * 0.97);
          o.push(onLink(m, U, V, th, { size: 0.85 - 0.35 * t, delay: 0.2 * Math.random(), sigma: 0.03 }));
        } else {
          o.push(onLink(m, U, V, 0.05 + Math.random() * (Math.PI - 0.1), { size: 0.85, delay: 0.2 * Math.random(), sigma: 0.03 }));
        }
      } } });
      // Matter flowing along the filament into the galaxies.
      shares.push({ w: 0.07 * w, emit: (n, o) => { for (let i = 0; i < n; i++) {
        const drift = outer(k) ? { from: edgeTh(k), to: Math.PI - edgeTh(k) } : i % 2 ? { from: Math.PI / 2, to: 0 } : { from: Math.PI / 2, to: Math.PI };
        o.push(onLink(m, U, V, 0, { drift, size: 1, delay: 0.1 + 0.2 * Math.random(), sigma: 0.02 }));
      } } });
    });
    STRANDS.forEach(([far, gi, bow]) => {
      const [m, U, V] = link(far, GALAXIES[gi].c, bow);
      shares.push({ w: 0.022, emit: (n, o) => { for (let i = 0; i < n; i++) {
        if (i % 6 === 5) { o.push(onLink(m, U, V, 0, { drift: { from: 0, to: Math.PI }, size: 0.8, delay: 0.15 + 0.25 * Math.random(), sigma: 0.025 })); continue; }
        const th = Math.PI * (1 - Math.pow(Math.random(), 1.5));
        o.push(onLink(m, U, V, th, { size: 0.5 + 0.35 * (th / Math.PI), delay: 0.15 + 0.25 * Math.random(), sigma: 0.03 }));
      } } });
    });
    // A few faint specks drifting in tiny loops.
    shares.push({ w: 0.02, emit: (n, o) => { for (let i = 0; i < n; i++) {
      const c = [(Math.random() - 0.5) * 4.8, (Math.random() - 0.5) * 3.8, (Math.random() - 0.5) * 1.4];
      const [pu, pv] = planeAxes(Math.random() * Math.PI, Math.random() * TAU, 0);
      o.push({ c, u: scale(pu, 0.02), v: scale(pv, 0.02), phase: Math.random() * TAU, omega: 0.2, delay: 0.3 + 0.4 * Math.random(), size: 0.55, base: 0, amp: 0, anchor: c, heat: 0, glow: 0 });
    } } });
    GALAXIES.forEach((g) => shares.push({ w: g.weight, emit: (n, o) => galaxy(g, n, o) }));

    const recs = [];
    shareCounts(shares.map((s) => s.w), count - HAZE_SPRITES).forEach((n, k) => shares[k].emit(n, recs));
    // Soft sprites along the inner links make the filament glow.
    const haze = [];
    for (let i = 0; i < HAZE_SPRITES; i++) {
      const [m, U, V] = links[1 + (i % 2)];
      haze.push(recs.length);
      recs.push(onLink(m, U, V, 0.35 + Math.random() * (Math.PI - 0.7), { size: 10 + Math.random() * 10, delay: 0.25 + 0.15 * Math.random(), glow: 0.06, sigma: 0.03 }));
    }
    return { recs, haze };
  }

  // ── the plan ──────────────────────────────────────────────────────────────
  // Per stage: hold = seconds settled (its motion keeps running), morph = seconds to
  // the next stage, span = share of the morph spent staggering start times, settle =
  // arrive with a damped overshoot (else cubic in-out), pull = how far each path bends
  // through its pull point (0 = straight).
  const TIMELINE = [
    { hold: 4.5, morph: 3.0, span: 0.5, settle: true, pull: 1 },    // knot
    { hold: 5.0, morph: 2.6, span: 0.4, settle: true, pull: 0.45 }, // atomic
    { hold: 5.0, morph: 3.0, span: 0.5, settle: true, pull: 0.75 }, // planetary
    { hold: 6.0, morph: 3.0, span: 0.5, settle: false, pull: 0.5 }, // galaxies
  ];
  const STAGES = TIMELINE.length;
  // Floats per point per state: C.xyz size | U.xyz heat | V.xyz glow | phase omega base amp.
  const STATE = 16;

  /** Move records onto points first, first - 1, ... (drawn last, so soft sprites blend
   *  over everything without hiding it), swapping with their current holders. */
  function claimLast(of, recs, first) {
    const owner = new Int32Array(of.length);
    of.forEach((r, i) => { owner[r] = i; });
    recs.forEach((r, k) => {
      const p = first - k;
      const q = owner[r];
      const held = of[p];
      of[p] = r;
      of[q] = held;
      owner[r] = p;
      owner[held] = q;
    });
  }

  function buildPlan(knot) {
    const count = knot.length / 3;
    // Atomic and planetary share per-role counts, so the atom flattens into the orrery.
    const A = orbitalRecords(LAYOUT_A, count);
    const pickA = pairByAzimuth(A.recs, knot);
    const B = orbitalRecords(LAYOUT_B, count, A.counts);
    const sun = [];
    for (let j = 0; j < B.counts[0]; j++) {
      const r = B.recs[j]; // the hub nucleus: a warm, brighter star
      if (j < SUN_SPRITES) {
        const [pu, pv] = planeAxes(Math.random() * Math.PI, Math.random() * TAU, 0);
        B.recs[j] = Object.assign({}, r, { c: add(r.c, ball(0.03)), u: scale(pu, 0.015), v: scale(pv, 0.015), omega: 0.6, size: 18 + Math.random() * 40, heat: 1, glow: 0.065 });
        sun.push(j);
      } else {
        B.recs[j] = Object.assign({}, r, { size: 1.3, heat: 1 });
      }
    }
    const pickB = pickA.slice();
    claimLast(pickB, sun, count - 1);
    const G = galaxyRecords(count);
    const pickG = pairByAzimuth(G.recs, knot);
    claimLast(pickG, G.haze, count - 1 - SUN_SPRITES);

    const states = new Float32Array(count * STAGES * STATE);
    const moves = new Float32Array(count * STAGES * 4);
    const put = (i, s, r) => {
      const o = (s * count + i) * STATE;
      if (!r) { // the knot: a still point on the knot itself
        states.set([knot[i * 3], knot[i * 3 + 1], knot[i * 3 + 2], 1], o);
        return;
      }
      states.set([r.c[0], r.c[1], r.c[2], r.size, r.u[0], r.u[1], r.u[2], r.heat, r.v[0], r.v[1], r.v[2], r.glow, r.phase, r.omega, r.base, r.amp], o);
    };
    const move = (i, s, via, delay) => moves.set([via[0], via[1], via[2], Math.min(Math.max(delay, 0), 1)], (s * count + i) * 4);
    for (let i = 0; i < count; i++) {
      const k = [knot[i * 3], knot[i * 3 + 1], knot[i * 3 + 2]];
      const a = A.recs[pickA[i]], b = B.recs[pickB[i]], g = G.recs[pickG[i]];
      put(i, 0, null); put(i, 1, a); put(i, 2, b); put(i, 3, g);
      move(i, 0, lerp3(k, a.anchor, 0.55), a.delay);               // knot -> atomic
      move(i, 1, lerp3(a.anchor, b.anchor, 0.5), b.delay);         // atomic -> planetary
      move(i, 2, lerp3(b.anchor, g.anchor, 0.65), g.delay);        // planetary -> galaxies
      move(i, 3, lerp3(g.anchor, k, 0.5), i / (count - 1));        // galaxies -> knot, retied along its length
    }
    return { states, moves };
  }

  // ── shaders ───────────────────────────────────────────────────────────────
  const VERT = `
precision highp float;
uniform float uTime, uG, uSpan, uResolve, uPull;
uniform mat3 uRot;
uniform vec3 uProj;      // x: f / aspect, y: f, z: pixels per world unit at depth 1
uniform float uMaxPoint;
attribute vec4 aC0, aU0, aV0, aM0, aC1, aU1, aV1, aM1, aT;
varying float vHeat, vGlow, vSoft;

vec3 pnPath(vec3 c, vec3 u, vec3 v, vec2 arc, float phi) {
  float th = arc.y > 0.0 ? arc.x + arc.y * sin(phi) : arc.y < 0.0 ? arc.x - arc.y * fract(phi * 0.15915494) : phi;
  return c + u * cos(th) + v * sin(th);
}
float pnFade(vec2 arc, float phi) {
  if (arc.y >= 0.0) return 1.0;
  float s = fract(phi * 0.15915494);
  return smoothstep(0.0, 0.14, s) * (1.0 - smoothstep(0.86, 1.0, s));
}
float pnEase(float k, float resolve) {
  if (resolve > 0.5) {
    float q = k * k * (3.0 - 2.0 * k);
    return 1.0 - exp(-5.0 * q) * cos(4.71238898 * q);
  }
  return k < 0.5 ? 4.0 * k * k * k : 1.0 - 0.5 * pow(2.0 - 2.0 * k, 3.0);
}

void main() {
  float phi0 = aM0.x + aM0.y * uTime;
  float phi1 = aM1.x + aM1.y * uTime;
  vec3 p0 = pnPath(aC0.xyz, aU0.xyz, aV0.xyz, aM0.zw, phi0);
  vec3 p1 = pnPath(aC1.xyz, aU1.xyz, aV1.xyz, aM1.zw, phi1);
  float k = clamp((uG - aT.w * uSpan) / (1.0 - uSpan), 0.0, 1.0);
  float e = pnEase(k, uResolve);
  float w = 1.0 - e;
  vec3 via = mix(0.5 * (p0 + p1), aT.xyz, uPull);
  vec3 p = w * w * w * p0 + 3.0 * w * e * via + e * e * e * p1;
  float mixK = clamp(e, 0.0, 1.0);
  float size = mix(aC0.w * pnFade(aM0.zw, phi0), aC1.w * pnFade(aM1.zw, phi1), mixK);
  vHeat = mix(aU0.w, aU1.w, mixK);
  // A glow sprite is soft whenever it is large (growing in or shrinking out alike), a hard dot when small.
  vGlow = max(aV0.w, aV1.w);
  vSoft = vGlow > 0.0 ? smoothstep(1.5, 4.0, size) : 0.0;
  vec3 q = uRot * p;
  float depth = 5.0 - q.z;
  gl_Position = vec4(q.x * uProj.x, q.y * uProj.y, 0.0, depth);
  gl_PointSize = min(0.028 * size * uProj.z / depth, uMaxPoint);
}`;

  const FRAG = `
precision mediump float;
uniform vec3 uColor, uWarm;
varying float vHeat, vGlow, vSoft;
void main() {
  float a = 0.88;
  if (vSoft > 0.0) {
    vec2 q = gl_PointCoord * 2.0 - 1.0;
    float r = dot(q, q);
    if (r > 1.0) discard;
    float s = 1.0 - r;
    a *= mix(1.0, s * s * vGlow, vSoft);
  }
  gl_FragColor = vec4(mix(uColor, uWarm, vHeat), a);
}`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error('shader');
    return sh;
  }

  // ── quaternions (pose blending) ───────────────────────────────────────────
  const qFromEuler = (x, y, z, out) => { // Euler XYZ
    const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
    const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
    out[0] = s1 * c2 * c3 + c1 * s2 * s3;
    out[1] = c1 * s2 * c3 - s1 * c2 * s3;
    out[2] = c1 * c2 * s3 + s1 * s2 * c3;
    out[3] = c1 * c2 * c3 - s1 * s2 * s3;
  };
  const qDot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  function qBlend(out, a, b, w, sgn) { // normalised lerp, sign held by the caller
    const wa = 1 - w, wb = sgn * w;
    const x = a[0] * wa + b[0] * wb, y = a[1] * wa + b[1] * wb, z = a[2] * wa + b[2] * wb, t = a[3] * wa + b[3] * wb;
    const l = Math.hypot(x, y, z, t) || 1;
    out[0] = x / l; out[1] = y / l; out[2] = z / l; out[3] = t / l;
  }
  function qMatrix(q, s, m) { // 3x3, column-major, scaled by s
    const [x, y, z, w] = q;
    m[0] = s * (1 - 2 * (y * y + z * z)); m[1] = s * 2 * (x * y + z * w); m[2] = s * 2 * (x * z - y * w);
    m[3] = s * 2 * (x * y - z * w); m[4] = s * (1 - 2 * (x * x + z * z)); m[5] = s * 2 * (y * z + x * w);
    m[6] = s * 2 * (x * z + y * w); m[7] = s * 2 * (y * z - x * w); m[8] = s * (1 - 2 * (x * x + y * y));
  }

  // ── the engine ────────────────────────────────────────────────────────────
  const FOV_F = 1 / Math.tan((50 / 2) * Math.PI / 180);
  const MAX_DT = 0.1;       // a stalled or resumed tab never jumps the cycle
  const FIT_HALF_WIDTH = 2.75; // world half-width the galaxies need on screen

  /** Returns null when WebGL (or the shaders) are unavailable. */
  function create(canvas) {
    let gl = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true }) ||
           canvas.getContext('experimental-webgl');
    } catch (_) { gl = null; }
    if (!gl) return null;

    let prog;
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    } catch (_) { return null; }
    gl.useProgram(prog);

    const knot = knotPoints();
    const count = knot.length / 3;
    const plan = buildPlan(knot);

    const statesBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, statesBuf);
    gl.bufferData(gl.ARRAY_BUFFER, plan.states, gl.STATIC_DRAW);
    const movesBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, movesBuf);
    gl.bufferData(gl.ARRAY_BUFFER, plan.moves, gl.STATIC_DRAW);

    const loc = (n) => gl.getAttribLocation(prog, n);
    const FROM = ['aC0', 'aU0', 'aV0', 'aM0'].map(loc);
    const TO = ['aC1', 'aU1', 'aV1', 'aM1'].map(loc);
    const MOVE = loc('aT');
    [...FROM, ...TO, MOVE].forEach((l) => gl.enableVertexAttribArray(l));
    const U = {};
    ['uTime', 'uG', 'uSpan', 'uResolve', 'uPull', 'uRot', 'uProj', 'uMaxPoint', 'uColor', 'uWarm'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
    const maxPoint = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;
    gl.uniform1f(U.uMaxPoint, maxPoint);

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    /** Point the "from" attributes at stage s and the "to" attributes at the next one. No upload. */
    function bind(s) {
      const next = (s + 1) % STAGES;
      gl.bindBuffer(gl.ARRAY_BUFFER, statesBuf);
      for (let f = 0; f < 4; f++) {
        gl.vertexAttribPointer(FROM[f], 4, gl.FLOAT, false, STATE * 4, (s * count * STATE + f * 4) * 4);
        gl.vertexAttribPointer(TO[f], 4, gl.FLOAT, false, STATE * 4, (next * count * STATE + f * 4) * 4);
      }
      gl.bindBuffer(gl.ARRAY_BUFFER, movesBuf);
      gl.vertexAttribPointer(MOVE, 4, gl.FLOAT, false, 16, s * count * 16);
      const step = TIMELINE[s];
      gl.uniform1f(U.uSpan, step.span);
      gl.uniform1f(U.uResolve, step.settle ? 1 : 0);
      gl.uniform1f(U.uPull, step.pull);
    }

    // Pose per stage: the knot tumbles (only while it shows); the others turn to their
    // own rest pose on a clock centred on the stage's visible window, so a stage looks
    // the same every cycle. Blends are sign-locked normalised lerps.
    const restPose = [null, LAYOUT_A, LAYOUT_B, GALAXY_POSE];
    const visibleFor = TIMELINE.map((st, s) => TIMELINE[(s + STAGES - 1) % STAGES].morph + st.hold + st.morph);
    const eK = [0, 0];
    const rest = [0, 0, 0];
    const qA = [0, 0, 0, 1], qB = [0, 0, 0, 1], qOut = [0, 0, 0, 1];
    const rot = new Float32Array(9);
    function poseOf(s, shownFor, out) {
      const L = restPose[s];
      if (!L) { qFromEuler(eK[0], eK[1], 0, out); return; }
      restEuler(L, shownFor - visibleFor[s] / 2, rest);
      qFromEuler(rest[0], rest[1], rest[2], out);
    }

    let W = 1, H = 1, fit = 1;
    let colA = [0.39, 0.4, 0.95], colB = [0.5, 0.55, 0.97], warm = [0.96, 0.62, 0.04];
    let stage = 0, local = 0, sec = 0, tPulse = 0, last = -1, sgn = 1;
    bind(0);

    function resize(cssW, cssH) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = Math.max(1, Math.round(cssW * dpr));
      H = Math.max(1, Math.round(cssH * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, W, H);
      const aspect = W / H;
      // On a narrow stage shrink the whole scene so the end galaxies stay in frame.
      fit = Math.min(1, (5 / FOV_F) * aspect / FIT_HALF_WIDTH);
      gl.uniform3f(U.uProj, FOV_F / aspect, FOV_F, H / 2);
    }

    /** Advance the clock by the time since the last call and draw one frame. */
    function frame(nowMs) {
      const dt = last < 0 ? 1 / 60 : Math.min((nowMs - last) / 1000, MAX_DT);
      last = nowMs;
      sec += dt;
      local += dt;
      tPulse += dt * 0.36;
      let step = TIMELINE[stage];
      if (local >= step.hold + step.morph) {
        local -= step.hold + step.morph;
        stage = (stage + 1) % STAGES;
        bind(stage);
        step = TIMELINE[stage];
      }
      const g = local <= step.hold ? 0 : (local - step.hold) / step.morph;
      gl.uniform1f(U.uTime, sec);
      gl.uniform1f(U.uG, g);

      const next = (stage + 1) % STAGES;
      const w = smoothstep(0, 0.95, g);
      const shown = stage === 0 ? 1 - w : next === 0 ? w : 0;
      const k = shown * shown * dt * 60;
      if (k > 0) { eK[0] += 0.0008 * k; eK[1] += 0.0025 * k; }
      poseOf(stage, TIMELINE[(stage + STAGES - 1) % STAGES].morph + local, qA);
      poseOf(next, local - step.hold, qB);
      if (w === 0) sgn = qDot(qA, qB) < 0 ? -1 : 1;
      qBlend(qOut, qA, qB, w, sgn);
      qMatrix(qOut, fit, rot);
      gl.uniformMatrix3fv(U.uRot, false, rot);

      const pulse = (Math.sin(tPulse) + 1) * 0.5;
      gl.uniform3f(U.uColor, colA[0] + (colB[0] - colA[0]) * pulse, colA[1] + (colB[1] - colA[1]) * pulse, colA[2] + (colB[2] - colA[2]) * pulse);
      gl.uniform3f(U.uWarm, warm[0], warm[1], warm[2]);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
    }

    return {
      resize,
      frame,
      /** Forget the last timestamp, so a resumed loop does not count the time it was paused. */
      resume() { last = -1; },
      /** Colours as [r, g, b] in 0..255: the two accents the points breathe between, and the warm tone. */
      setColors(a, b, w) {
        colA = a.map((v) => v / 255); colB = b.map((v) => v / 255); warm = w.map((v) => v / 255);
      },
      dispose() {
        const ext = gl.getExtension('WEBGL_lose_context');
        gl.deleteBuffer(statesBuf);
        gl.deleteBuffer(movesBuf);
        gl.deleteProgram(prog);
        if (ext) ext.loseContext();
      },
    };
  }

  return { create };
})();
