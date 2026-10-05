/*
 * motion-core.js — procedural, seamlessly looping motion backgrounds.
 * Works in the browser (<script src="motion-core.js">) and in Node (require()).
 *
 * Every style draws a frame from a loop phase t in [0, 1).
 * All motion is built from periodic functions with integer frequencies,
 * so frame(t = 1) === frame(t = 0) and the loop is perfectly seamless.
 */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;

  // ---------- helpers ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rr = (rng, a, b) => a + (b - a) * rng();
  const ri = (rng, a, b) => Math.floor(rr(rng, a, b + 1));
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const mod1 = (x) => x - Math.floor(x);

  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a)).toFixed(4)})`;
  }
  function mix(hexA, hexB, k) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * k));
    return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  // ---------- palettes ----------
  const PALETTES = {
    'neon-violet':    { name: 'Neon Violet',    bg: '#07020f', bg2: '#1a0533', colors: ['#8b5cf6', '#d946ef', '#22d3ee'], kw: ['purple', 'violet', 'neon', 'magenta'] },
    'cyber-teal':     { name: 'Cyber Teal',     bg: '#010b10', bg2: '#022c3a', colors: ['#14b8a6', '#22d3ee', '#a3e635'], kw: ['teal', 'cyan', 'turquoise', 'green'] },
    'esports-red':    { name: 'Esports Red',    bg: '#0a0203', bg2: '#2a0508', colors: ['#ef4444', '#f97316', '#fde047'], kw: ['red', 'orange', 'fire', 'energy'] },
    'royal-gold':     { name: 'Royal Gold',     bg: '#0b0803', bg2: '#241a06', colors: ['#f59e0b', '#fcd34d', '#fff7d6'], kw: ['gold', 'golden', 'luxury', 'premium'] },
    'deep-ocean':     { name: 'Deep Ocean',     bg: '#020617', bg2: '#0c1e46', colors: ['#3b82f6', '#06b6d4', '#a5f3fc'], kw: ['blue', 'ocean', 'aqua', 'cool'] },
    'sunset-drive':   { name: 'Sunset Drive',   bg: '#120318', bg2: '#3b0a2a', colors: ['#f43f5e', '#fb923c', '#c026d3'], kw: ['sunset', 'pink', 'orange', 'retro'] },
    'toxic-lime':     { name: 'Toxic Lime',     bg: '#030a02', bg2: '#0d2007', colors: ['#84cc16', '#22c55e', '#facc15'], kw: ['green', 'lime', 'toxic', 'acid'] },
    'ice':            { name: 'Ice',            bg: '#050a14', bg2: '#10203a', colors: ['#e0f2fe', '#7dd3fc', '#c4b5fd'], kw: ['ice', 'frozen', 'white', 'winter'] },
    'magma':          { name: 'Magma',          bg: '#0a0400', bg2: '#2b0d00', colors: ['#dc2626', '#ea580c', '#facc15'], kw: ['lava', 'magma', 'hot', 'red'] },
    'corporate-blue': { name: 'Corporate Blue', bg: '#03081a', bg2: '#0a1a3f', colors: ['#2563eb', '#38bdf8', '#e2e8f0'], kw: ['blue', 'corporate', 'business', 'professional'] },
    'pink-candy':     { name: 'Pink Candy',     bg: '#12030d', bg2: '#2e0820', colors: ['#ec4899', '#f9a8d4', '#a78bfa'], kw: ['pink', 'pastel', 'candy', 'lavender'] },
    'emerald':        { name: 'Emerald',        bg: '#01100b', bg2: '#032e20', colors: ['#10b981', '#34d399', '#fbbf24'], kw: ['emerald', 'green', 'jade', 'nature'] },
  };

  // Static film grain tile: identical on every frame (loop-safe), breaks up gradient banding.
  function makeGrain(createCanvas, seed) {
    const size = 256;
    const c = createCanvas(size, size);
    const x = c.getContext('2d');
    const img = x.createImageData(size, size);
    const rng = mulberry32(seed ^ 0x9e3779b9);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(rng() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  function background(ctx, w, h, pal, angle) {
    const a = angle || Math.PI / 2;
    const cx = w / 2, cy = h / 2, r = Math.hypot(w, h) / 2;
    const g = ctx.createLinearGradient(cx - Math.cos(a) * r, cy - Math.sin(a) * r, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.addColorStop(0, pal.bg);
    g.addColorStop(1, pal.bg2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  function vignette(ctx, w, h, pal, strength) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, rgba(pal.bg, 0));
    g.addColorStop(1, rgba(pal.bg, strength));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // ---------- styles ----------
  const STYLES = {};

  // 1. Aurora — soft drifting gradient light
  STYLES.aurora = {
    name: 'Aurora Gradient',
    words: ['abstract', 'gradient', 'aurora'],
    keywords: ['gradient', 'aurora', 'soft', 'glow', 'blur', 'light', 'smooth', 'mesh gradient', 'dreamy', 'ambient'],
    seconds: 15,
    setup(rng, pal) {
      const n = ri(rng, 5, 7);
      const blobs = [];
      for (let i = 0; i < n; i++) {
        blobs.push({
          color: pal.colors[i % pal.colors.length],
          cx: rr(rng, 0.15, 0.85), cy: rr(rng, 0.15, 0.85),
          rx: rr(rng, 0.08, 0.3), ry: rr(rng, 0.08, 0.25),
          kx: ri(rng, 1, 2), ky: ri(rng, 1, 2),
          px: rr(rng, 0, TAU), py: rr(rng, 0, TAU), pr: rr(rng, 0, TAU),
          r: rr(rng, 0.25, 0.5), a: rr(rng, 0.5, 0.85),
        });
      }
      return { blobs, angle: rr(rng, 0, TAU) };
    },
    draw(ctx, t, st, w, h, pal) {
      background(ctx, w, h, pal, st.angle);
      ctx.globalCompositeOperation = 'screen';
      const d = Math.hypot(w, h);
      for (const b of st.blobs) {
        const x = (b.cx + b.rx * Math.cos(TAU * b.kx * t + b.px)) * w;
        const y = (b.cy + b.ry * Math.sin(TAU * b.ky * t + b.py)) * h;
        const r = b.r * d * (1 + 0.12 * Math.sin(TAU * t + b.pr));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba(b.color, b.a));
        g.addColorStop(0.45, rgba(b.color, b.a * 0.35));
        g.addColorStop(1, rgba(b.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalCompositeOperation = 'source-over';
      vignette(ctx, w, h, pal, 0.75);
    },
  };

  // 2. Bokeh — floating out-of-focus particles with parallax
  STYLES.bokeh = {
    name: 'Bokeh Particles',
    words: ['bokeh', 'particles', 'floating'],
    keywords: ['bokeh', 'particles', 'floating', 'dust', 'sparkle', 'glitter', 'defocused', 'lights', 'magic', 'celebration'],
    seconds: 20,
    setup(rng, pal) {
      const parts = [];
      const layers = [
        { n: 90, m: 1, size: [0.002, 0.005], a: [0.35, 0.8], soft: 0.3 },
        { n: 50, m: 2, size: [0.008, 0.022], a: [0.3, 0.65], soft: 0.5 },
        { n: 14, m: 3, size: [0.03, 0.07], a: [0.08, 0.2], soft: 0.85 },
      ];
      for (const L of layers) {
        for (let i = 0; i < L.n; i++) {
          parts.push({
            x0: rng(), y0: rng(), m: L.m,
            sway: rr(rng, 0.005, 0.03), j: ri(rng, 1, 2), ps: rr(rng, 0, TAU),
            q: ri(rng, 1, 3), pq: rr(rng, 0, TAU),
            size: rr(rng, L.size[0], L.size[1]), a: rr(rng, L.a[0], L.a[1]), soft: L.soft,
            color: pick(rng, pal.colors),
          });
        }
      }
      return { parts };
    },
    draw(ctx, t, st, w, h, pal) {
      background(ctx, w, h, pal, Math.PI / 2);
      ctx.globalCompositeOperation = 'lighter';
      const margin = 0.1, span = 1 + 2 * margin;
      for (const p of st.parts) {
        const travel = p.m * t;
        const y = (mod1(p.y0 - travel) * span - margin) * h;
        const x = (p.x0 + p.sway * Math.sin(TAU * p.j * t + p.ps)) * w;
        const r = p.size * h;
        const a = p.a * (0.65 + 0.35 * Math.sin(TAU * p.q * t + p.pq));
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, rgba('#ffffff', a * 0.9));
        g.addColorStop(1 - p.soft, rgba(p.color, a));
        g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      vignette(ctx, w, h, pal, 0.6);
    },
  };

  // 3. Synth grid — retro perspective grid floor, endless forward motion
  STYLES.synthgrid = {
    name: 'Retro Grid',
    words: ['retro', 'neon grid', 'synthwave'],
    keywords: ['synthwave', 'retrowave', 'grid', '80s', 'retro', 'vaporwave', 'neon', 'perspective', 'futuristic', 'cyberpunk'],
    seconds: 10,
    setup(rng, pal) {
      const stars = [];
      for (let i = 0; i < 160; i++) stars.push({ x: rng(), y: rng(), s: rr(rng, 0.4, 1.6), q: ri(rng, 1, 4), p: rr(rng, 0, TAU) });
      return {
        stars,
        horizon: rr(rng, 0.5, 0.6),
        laps: ri(rng, 3, 5),
        sun: rng() < 0.6,
        lineColor: pal.colors[0],
        glowColor: pal.colors[1],
        sunColor: [pal.colors[2] || pal.colors[1], pal.colors[1]],
      };
    },
    draw(ctx, t, st, w, h, pal) {
      const s = Math.min(w, h) / 1080;
      const hy = st.horizon * h;
      ctx.fillStyle = pal.bg;
      ctx.fillRect(0, 0, w, h);
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, hy);
      sky.addColorStop(0, pal.bg);
      sky.addColorStop(1, pal.bg2);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, hy);
      // stars
      for (const p of st.stars) {
        if (p.y * hy > hy * 0.92) continue;
        const a = 0.25 + 0.6 * (0.5 + 0.5 * Math.sin(TAU * p.q * t + p.p));
        ctx.fillStyle = rgba('#ffffff', a);
        ctx.fillRect(p.x * w, p.y * hy, p.s * 2 * s, p.s * 2 * s);
      }
      // sun
      if (st.sun) {
        const R = h * 0.22, cx = w / 2, cy = hy - R * 0.55;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w, hy);
        ctx.clip();
        const halo = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 2.2);
        halo.addColorStop(0, rgba(st.sunColor[1], 0.35));
        halo.addColorStop(1, rgba(st.sunColor[1], 0));
        ctx.fillStyle = halo;
        ctx.fillRect(0, 0, w, hy);
        const sg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
        sg.addColorStop(0, st.sunColor[0]);
        sg.addColorStop(1, st.sunColor[1]);
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.fill();
        // horizontal cut stripes (painted with the sky gradient), scrolling one period per loop
        ctx.beginPath();
        ctx.arc(cx, cy, R + 1, 0, TAU);
        ctx.clip();
        ctx.fillStyle = sky;
        const period = R * 0.13, top = cy - R * 0.35;
        for (let k = -1; k < 14; k++) {
          const yy = top + k * period + mod1(t) * period;
          if (yy < top) continue;
          const th = period * Math.min(0.65, ((yy - top) / (R * 0.9)) * 0.65);
          ctx.fillRect(cx - R - 2, yy, 2 * R + 4, th);
        }
        ctx.restore();
      }
      // floor
      const fl = ctx.createLinearGradient(0, hy, 0, h);
      fl.addColorStop(0, pal.bg2);
      fl.addColorStop(1, pal.bg);
      ctx.fillStyle = fl;
      ctx.fillRect(0, hy, w, h - hy);
      // grid lines (glow pass + core pass)
      const camH = 1, focal = (h - hy) * 0.9, near = 0.9, rows = 40;
      const off = mod1(t * st.laps);
      const project = (xw, z) => [w / 2 + (xw * focal) / z, hy + (camH * focal) / z];
      const passes = [
        { c: st.glowColor, lw: 6 * s, a: 0.18 },
        { c: st.lineColor, lw: 2 * s, a: 0.9 },
      ];
      for (const P of passes) {
        ctx.strokeStyle = P.c;
        ctx.lineWidth = P.lw;
        for (let i = 0; i <= rows; i++) {
          const z = i + 1 - off; // lines march toward the camera; one cell per lap
          if (z < 0.05) continue;
          const [, y] = project(0, z);
          if (y > h + P.lw) continue;
          ctx.globalAlpha = P.a * Math.min(1, 6 / z) * Math.max(0, Math.min(1, (rows - z) / 6));
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
        }
        ctx.globalAlpha = P.a;
        for (let xi = -30; xi <= 30; xi++) {
          const [x1, y1] = project(xi, near * 0.5);
          const [x2, y2] = project(xi, 400);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // horizon haze
      const hz = ctx.createLinearGradient(0, hy - h * 0.04, 0, hy + h * 0.12);
      hz.addColorStop(0, rgba(st.glowColor, 0));
      hz.addColorStop(0.3, rgba(st.glowColor, 0.45));
      hz.addColorStop(1, rgba(pal.bg2, 0));
      ctx.fillStyle = hz;
      ctx.fillRect(0, hy - h * 0.04, w, h * 0.16);
      vignette(ctx, w, h, pal, 0.5);
    },
  };

  // 4. Speed lines — esports energy streaks
  STYLES.speedlines = {
    name: 'Energy Streaks',
    words: ['speed lines', 'energy streaks', 'light trails'],
    keywords: ['speed', 'light trails', 'streaks', 'energy', 'motion', 'fast', 'esports', 'gaming', 'dynamic', 'power'],
    seconds: 10,
    setup(rng, pal) {
      const lines = [];
      for (let i = 0; i < 110; i++) {
        const depth = rng();
        lines.push({
          lane: rr(rng, -0.1, 1.1), x0: rng(), m: depth < 0.5 ? 1 : depth < 0.85 ? 2 : 3,
          len: rr(rng, 0.08, 0.35) * (0.5 + depth), th: rr(rng, 0.6, 2.2) * (0.5 + depth * 1.5),
          a: rr(rng, 0.25, 0.9), color: pick(rng, pal.colors),
        });
      }
      const angle = (pick(rng, [-1, 1]) * rr(rng, 8, 22) * Math.PI) / 180;
      return { lines, angle };
    },
    draw(ctx, t, st, w, h, pal) {
      background(ctx, w, h, pal, st.angle + Math.PI / 2);
      const s = Math.min(w, h) / 1080;
      const D = Math.hypot(w, h);
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(st.angle);
      ctx.globalCompositeOperation = 'lighter';
      const maxLen = 0.6 * D, span = D + 2 * maxLen;
      for (const L of st.lines) {
        const len = L.len * D;
        const head = mod1(L.x0 + L.m * t) * span - maxLen - D / 2;
        const y = (L.lane - 0.5) * D * 0.7;
        const g = ctx.createLinearGradient(head - len, 0, head, 0);
        g.addColorStop(0, rgba(L.color, 0));
        g.addColorStop(0.8, rgba(L.color, L.a));
        g.addColorStop(1, rgba('#ffffff', L.a));
        ctx.strokeStyle = g;
        ctx.lineCap = 'round';
        ctx.lineWidth = L.th * 3 * s;
        ctx.globalAlpha = 0.25;
        ctx.beginPath(); ctx.moveTo(head - len, y); ctx.lineTo(head, y); ctx.stroke();
        ctx.lineWidth = L.th * s;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.moveTo(head - len, y); ctx.lineTo(head, y); ctx.stroke();
      }
      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
      vignette(ctx, w, h, pal, 0.6);
    },
  };

  // 5. Hex pulse — tech hexagon grid with travelling waves
  STYLES.hexpulse = {
    name: 'Hex Tech Pulse',
    words: ['hexagon', 'tech grid', 'digital'],
    keywords: ['hexagon', 'hex', 'technology', 'digital', 'grid', 'honeycomb', 'sci-fi', 'futuristic', 'data', 'network'],
    seconds: 12,
    setup(rng, pal) {
      return {
        R: rr(rng, 0.03, 0.05),
        o1: [rr(rng, -0.2, 1.2), rr(rng, -0.2, 1.2)], f1: rr(rng, 1.5, 3), k1: ri(rng, 1, 2),
        o2: [rr(rng, -0.2, 1.2), rr(rng, -0.2, 1.2)], f2: rr(rng, 2, 4), k2: -ri(rng, 1, 2),
        seed: Math.floor(rng() * 1e9),
      };
    },
    draw(ctx, t, st, w, h, pal) {
      background(ctx, w, h, pal, Math.PI / 3);
      const R = st.R * Math.min(w, h);
      const hw = Math.sqrt(3) * R, vh = 1.5 * R;
      const cols = Math.ceil(w / hw) + 2, rows = Math.ceil(h / vh) + 2;
      const rng = mulberry32(st.seed);
      const c0 = pal.colors[0], c1 = pal.colors[1];
      ctx.lineWidth = Math.max(1, (Math.min(w, h) / 1080) * 1.2);
      for (let r = -1; r < rows; r++) {
        for (let c = -1; c < cols; c++) {
          const x = c * hw + (r & 1 ? hw / 2 : 0), y = r * vh;
          const nx = x / h, ny = y / h;
          const d1 = Math.hypot(nx - st.o1[0] * (w / h), ny - st.o1[1]);
          const d2 = Math.hypot(nx - st.o2[0] * (w / h), ny - st.o2[1]);
          const w1 = Math.pow(0.5 + 0.5 * Math.cos(TAU * (d1 * st.f1 - st.k1 * t)), 6);
          const w2 = Math.pow(0.5 + 0.5 * Math.cos(TAU * (d2 * st.f2 - st.k2 * t)), 8);
          const fq = 1 + Math.floor(rng() * 3), fp = rng() * TAU, spark = rng() < 0.04;
          const flick = spark ? Math.pow(0.5 + 0.5 * Math.sin(TAU * fq * t + fp), 12) : 0;
          const v = Math.min(1, w1 * 0.7 + w2 * 0.5 + flick);
          const col = mix(c0, c1, Math.min(1, w2 * 1.5));
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const ang = TAU * (k / 6) + Math.PI / 6;
            const px = x + Math.cos(ang) * R * 0.92, py = y + Math.sin(ang) * R * 0.92;
            k ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
          }
          ctx.closePath();
          ctx.fillStyle = rgba(col, 0.03 + v * 0.45);
          ctx.fill();
          ctx.strokeStyle = rgba(col, 0.12 + v * 0.7);
          ctx.stroke();
        }
      }
      vignette(ctx, w, h, pal, 0.65);
    },
  };

  // 6. Silk waves — layered flowing line ribbons
  STYLES.waves = {
    name: 'Silk Waves',
    words: ['flowing waves', 'silk lines', 'digital wave'],
    keywords: ['waves', 'flowing', 'lines', 'silk', 'ribbon', 'curves', 'elegant', 'wavy', 'fluid', 'smooth'],
    seconds: 15,
    setup(rng, pal) {
      const comps = [];
      for (let j = 0; j < 3; j++) {
        comps.push({ A: rr(rng, 0.03, 0.12), f: rr(rng, 0.6, 2.2), k: pick(rng, [1, -1, 2]), p: rr(rng, 0, TAU), d: rr(rng, 0.01, 0.05) });
      }
      return { comps, n: ri(rng, 40, 70), base: rr(rng, 0.4, 0.6), spread: rr(rng, 0.06, 0.18), c0: pal.colors[0], c1: pal.colors[1] };
    },
    draw(ctx, t, st, w, h, pal) {
      background(ctx, w, h, pal, Math.PI / 2);
      const s = Math.min(w, h) / 1080;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineWidth = 1.4 * s;
      const step = Math.max(4, 8 * s);
      for (let i = 0; i < st.n; i++) {
        const u = i / (st.n - 1);
        ctx.strokeStyle = rgba(mix(st.c0, st.c1, u), 0.25 + 0.45 * Math.sin(Math.PI * u));
        ctx.beginPath();
        for (let x = -step; x <= w + step; x += step) {
          const nx = x / w;
          let y = st.base + (u - 0.5) * st.spread;
          for (const c of st.comps) y += c.A * Math.sin(TAU * (c.f * nx) + TAU * c.k * t + c.p + i * c.d);
          x === -step ? ctx.moveTo(x, y * h) : ctx.lineTo(x, y * h);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
      vignette(ctx, w, h, pal, 0.55);
    },
  };

  // ---------- engine ----------
  /**
   * Create a renderer.
   * @param {object} opts { style, palette, seed, width, height, createCanvas?, grain? }
   * @returns {any} { style, pal, seed, draw(ctx, t, w, h) } (any: the checkJs pass in this project cannot see the extra fields)
   */
  function create(opts) {
    const style = STYLES[opts.style];
    if (!style) throw new Error('Unknown style: ' + opts.style);
    const pal = typeof opts.palette === 'object' ? opts.palette : PALETTES[opts.palette];
    if (!pal) throw new Error('Unknown palette: ' + opts.palette);
    const seed = opts.seed >>> 0;
    const state = style.setup(mulberry32(seed), pal);
    const grain = opts.grain !== false && opts.createCanvas ? makeGrain(opts.createCanvas, seed) : null;
    return {
      style, pal, seed,
      draw(ctx, t, w, h) {
        ctx.save();
        style.draw(ctx, mod1(t), state, w, h, pal);
        ctx.restore();
        if (grain) {
          ctx.save();
          ctx.globalAlpha = 0.035;
          ctx.globalCompositeOperation = 'overlay';
          ctx.fillStyle = ctx.createPattern(grain, 'repeat');
          ctx.fillRect(0, 0, w, h);
          ctx.restore();
        }
      },
    };
  }

  const api = { STYLES, PALETTES, create, mulberry32, TAU, rgba, mix };
  /** @type {any} */ (root).MotionCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
