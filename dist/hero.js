'use strict';
/*
  Hero: the 043 logo's pixel digits, drawn as ~750 small squares on a 2D canvas.
  - They gather into "403", then the 4 and the 0 swap places to make "043". Clicking the hero swaps them again.
  - The pointer pushes squares away; springs pull them back.
  - The loop stops once everything is at rest, when the hero is off screen, or when the tab is hidden.
  - With reduced motion (or ?static) it draws "043" once and never animates.
*/
(() => {
  const canvas = document.querySelector('.hero-canvas');
  const hero = canvas && canvas.closest('.hero');
  const ctx = canvas && canvas.getContext('2d');
  if (!ctx) return;

  const still = matchMedia('(prefers-reduced-motion: reduce)').matches || new URLSearchParams(location.search).has('static');
  const BLUE = '#1a2ffb';
  const GLYPHS = {
    0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
    3: ['.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.'],
  };
  const SUB = 4;               // squares per pixel edge
  const COLS = 17, ROWS = 7;   // three 5x7 digits with 1-pixel gaps

  // Target points in pixel units for one digit placed in a slot (0, 1, 2).
  function glyphPoints(ch, slot) {
    const pts = [];
    GLYPHS[ch].forEach((row, y) => [...row].forEach((c, x) => {
      if (c !== '#') return;
      for (let sy = 0; sy < SUB; sy++) for (let sx = 0; sx < SUB; sx++) pts.push([slot * 6 + x + (sx + 0.5) / SUB, y + (sy + 0.5) / SUB]);
    }));
    return pts;
  }
  // Same particle order in both layouts, so each digit keeps its own squares when 4 and 0 swap.
  const DIGIT = ['4', '0', '3'];
  const LAYOUT_403 = [glyphPoints('4', 0), glyphPoints('0', 1), glyphPoints('3', 2)];
  const LAYOUT_043 = [glyphPoints('4', 1), glyphPoints('0', 0), glyphPoints('3', 2)];
  const owner = LAYOUT_403.flatMap((pts, d) => pts.map(() => d));
  const N = owner.length;

  const px = new Float32Array(N), py = new Float32Array(N), vx = new Float32Array(N), vy = new Float32Array(N);
  const tx = new Float32Array(N), ty = new Float32Array(N), stiff = new Float32Array(N);
  for (let i = 0; i < N; i++) stiff[i] = 0.7 + Math.random() * 0.6;

  let w = 0, h = 0, cell = 0, ox = 0, oy = 0;
  let showing043 = false, running = false, visible = true, last = 0;
  let pointer = null, pointerAt = 0;

  function layout() {
    const rect = hero.getBoundingClientRect();
    w = rect.width; h = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gutter = Math.max(w * 0.05, 20);
    if (w >= 860) {
      cell = Math.min((w * 0.46) / COLS, (h * 0.36) / ROWS);
      ox = w - gutter - COLS * cell;
      oy = Math.max(110, h * 0.4 - (ROWS * cell) / 2);
    } else {
      cell = Math.min((w - gutter * 2) / COLS, (h * 0.24) / ROWS);
      ox = (w - COLS * cell) / 2;
      oy = Math.max(120, h * 0.38 - (ROWS * cell) / 2);
    }
    setTargets(false);
  }

  function setTargets(kick) {
    const src = showing043 ? LAYOUT_043 : LAYOUT_403;
    let i = 0;
    src.forEach(pts => pts.forEach(([x, y]) => { tx[i] = ox + x * cell; ty[i] = oy + y * cell; i++; }));
    if (!kick) return;
    // The 4 arcs over, the 0 dips under, so the swap reads as two digits trading places.
    for (let j = 0; j < N; j++) {
      const d = DIGIT[owner[j]];
      if (d === '4') vy[j] -= cell * (9 + Math.random() * 3);
      else if (d === '0') vy[j] += cell * (9 + Math.random() * 3);
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = BLUE;
    const size = (cell / SUB) * 0.8, half = size / 2;
    for (let i = 0; i < N; i++) ctx.fillRect(px[i] - half, py[i] - half, size, size);
  }

  function step(dt) {
    const K = 110, DAMP = 13, R = cell * 2.6, PUSH = cell * 380;
    const pointerLive = pointer && performance.now() - pointerAt < 1200;
    let moving = false;
    for (let i = 0; i < N; i++) {
      let ax = (tx[i] - px[i]) * K * stiff[i] - vx[i] * DAMP;
      let ay = (ty[i] - py[i]) * K * stiff[i] - vy[i] * DAMP;
      if (pointerLive) {
        const dx = px[i] - pointer.x, dy = py[i] - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < R * R && d2 > 0.01) {
          const d = Math.sqrt(d2), f = (1 - d / R) * PUSH;
          ax += (dx / d) * f; ay += (dy / d) * f;
        }
      }
      vx[i] += ax * dt; vy[i] += ay * dt;
      px[i] += vx[i] * dt; py[i] += vy[i] * dt;
      if (!moving && (Math.abs(vx[i]) + Math.abs(vy[i]) > 1.5 || Math.abs(tx[i] - px[i]) + Math.abs(ty[i] - py[i]) > 0.3)) moving = true;
    }
    return moving || pointerLive;
  }

  function frame(now) {
    if (!running) return;
    // rAF timestamps can be slightly older than performance.now() at wake-up; never step backwards.
    const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 30));
    last = Math.max(last, now);
    const busy = step(dt);
    draw();
    if (busy && visible && !document.hidden) requestAnimationFrame(frame);
    else running = false;
  }

  function wake() {
    if (still || running || !visible || document.hidden) return;
    running = true; last = performance.now();
    requestAnimationFrame(frame);
  }

  function swap() { showing043 = !showing043; setTargets(true); wake(); }

  layout();
  if (still) {
    showing043 = true; setTargets(false);
    px.set(tx); py.set(ty); draw();
    window.addEventListener('resize', () => { layout(); px.set(tx); py.set(ty); draw(); });
    return;
  }

  // Start scattered, gather into 403, then swap to 043.
  for (let i = 0; i < N; i++) { px[i] = Math.random() * w; py[i] = Math.random() * h; }
  draw();
  setTimeout(() => { if (!showing043) swap(); }, 1900);

  window.addEventListener('resize', () => { layout(); wake(); });
  hero.addEventListener('pointermove', e => {
    const r = canvas.getBoundingClientRect();
    pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; pointerAt = performance.now();
    wake();
  }, { passive: true });
  hero.addEventListener('pointerleave', () => { pointer = null; });
  hero.addEventListener('click', e => { if (!e.target.closest('a, button')) swap(); });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; wake(); }).observe(hero);
  document.addEventListener('visibilitychange', wake);
  wake();
})();
