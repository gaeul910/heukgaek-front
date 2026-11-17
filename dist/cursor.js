'use strict';
/*
  Pointer effects (decoration only; the native cursor stays). Preview switch: ?fx=grid | magnet | scramble | all
  - grid:     a hidden dot grid shows in blue around the pointer.
  - magnet:   buttons lean toward the pointer.
  - scramble: nav links, buttons and card code decode from random glyphs on hover.
  Off on touch/coarse pointers, with reduced motion, and in ?static. Nothing runs while idle.
*/
(() => {
  const params = new URLSearchParams(location.search);
  if (params.has('static') || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const fx = (params.get('fx') || 'all').split(',');
  const on = name => fx.includes('all') || fx.includes(name);
  const blue = getComputedStyle(document.documentElement).getPropertyValue('--blue').trim() || '#1a2ffb';

  /* ---------- grid spotlight ---------- */
  if (fine && on('grid')) {
    const GAP = 22, R = 170;
    const c = document.createElement('canvas');
    c.className = 'fx-grid'; c.setAttribute('aria-hidden', 'true');
    document.body.prepend(c);
    const ctx = c.getContext('2d');
    let dpr = 1, raf = 0, tx = -999, ty = -999, x = -999, y = -999, alive = false, fade = 0;
    const resize = () => { dpr = Math.min(devicePixelRatio || 1, 2); c.width = innerWidth * dpr; c.height = innerHeight * dpr; wake(); };
    resize(); addEventListener('resize', resize, { passive: true });
    addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; tx = e.clientX; ty = e.clientY; if (!alive) { x = tx; y = ty; } alive = true; wake(); }, { passive: true });
    document.addEventListener('pointerleave', () => { alive = false; wake(); });
    addEventListener('scroll', wake, { passive: true });
    function wake() { if (!raf) raf = requestAnimationFrame(draw); }
    function draw() {
      raf = 0;
      x += (tx - x) * 0.18; y += (ty - y) * 0.18;
      fade += ((alive ? 1 : 0) - fade) * 0.12;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      ctx.fillStyle = blue;
      const oy = -(scrollY % GAP); // grid is fixed to the page, not the screen
      const x0 = Math.max(0, Math.floor((x - R) / GAP)), x1 = Math.ceil((x + R) / GAP);
      const y0 = Math.floor((y - R - oy) / GAP), y1 = Math.ceil((y + R - oy) / GAP);
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
        const px = gx * GAP, py = gy * GAP + oy, d = Math.hypot(px - x, py - y);
        if (d > R) continue;
        const k = (1 - d / R) ** 1.6 * fade;
        const s = 1 + k * 2.2;
        ctx.globalAlpha = k * 0.75;
        ctx.fillRect(px - s / 2, py - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3 || Math.abs((alive ? 1 : 0) - fade) > 0.01) raf = requestAnimationFrame(draw);
    }
  }

  /* ---------- magnetic buttons ---------- */
  if (fine && on('magnet')) {
    const PULL = 0.28, REACH = 36;
    document.querySelectorAll('.button').forEach(btn => {
      btn.classList.add('fx-magnet');
      const zone = () => { const r = btn.getBoundingClientRect(); return { r, l: r.left - REACH, t: r.top - REACH, rr: r.right + REACH, b: r.bottom + REACH }; };
      let active = false;
      addEventListener('pointermove', e => {
        if (e.pointerType !== 'mouse') return;
        const z = zone(), inside = e.clientX > z.l && e.clientX < z.rr && e.clientY > z.t && e.clientY < z.b;
        if (inside) {
          const dx = e.clientX - (z.r.left + z.r.width / 2), dy = e.clientY - (z.r.top + z.r.height / 2);
          btn.style.setProperty('--mx', (dx * PULL).toFixed(1) + 'px');
          btn.style.setProperty('--my', (dy * PULL).toFixed(1) + 'px');
          active = true;
        } else if (active) { btn.style.setProperty('--mx', '0px'); btn.style.setProperty('--my', '0px'); active = false; }
      }, { passive: true });
    });
  }

  /* ---------- text decode ---------- */
  if (on('scramble')) {
    const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>/_#$%&*=+?';
    const DUR = 420;
    const targets = document.querySelectorAll('.site-nav a, .button, .card-visual code');
    targets.forEach(el => {
      const host = el.closest('.card') || el;
      const nodes = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      if (!nodes.length) return;
      const originals = nodes.map(n => n.textContent);
      if (!el.hasAttribute('aria-label') && el.matches('a, button')) el.setAttribute('aria-label', el.textContent.trim());
      let run = 0;
      host.addEventListener('pointerenter', () => {
        const id = ++run, start = performance.now();
        (function tick(now) {
          if (id !== run) return;
          const p = Math.min(1, (now - start) / DUR);
          nodes.forEach((n, i) => {
            const src = originals[i], cut = Math.floor(src.length * p);
            let out = src.slice(0, cut);
            for (let j = cut; j < src.length; j++) out += src[j] === ' ' ? ' ' : GLYPHS[(Math.random() * GLYPHS.length) | 0];
            n.textContent = out;
          });
          if (p < 1) requestAnimationFrame(tick);
        })(start);
      });
    });
  }
})();
