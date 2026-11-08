'use strict';
/*
  Ink — a small stable-fluids simulation (WebGL2) used as the page background.
  - The pointer drags a brush through the fluid: it pushes velocity and deposits ink.
  - The hero glyphs 黑客 are a "target" the ink keeps healing toward, so the characters
    smear when you stir them and slowly gather back.
  - Ink is a single density channel; the display pass maps it to theme colours
    (ivory on black in dark mode, black on paper in light mode).
*/
(() => {
  const root = document.documentElement;
  const canvas = document.getElementById('ink');
  const hero = document.querySelector('.hero');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fail = () => root.classList.add('no-ink');
  if (!canvas || reduceMotion) return fail();

  const gl = canvas.getContext('webgl2', {
    alpha: false, antialias: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance'
  });
  if (!gl) return fail();
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return fail();

  const CONFIG = {
    simRes: 160,            // velocity grid height (texels)
    pressureIters: 22,
    curl: 6,
    velocityFade: 1.5,      // per second (exp)
    inkFade: 1.15,          // per second (exp) — trail lingers ~1.5–2s then bleeds away
    heal: 7.5,              // per second pull of the glyph back to shape (high = glyph stays put)
    brushInk: 0.34,
    brushForce: 0.1
  };

  /* ---------- GL helpers ---------- */
  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const VERT = compile(gl.VERTEX_SHADER, `#version 300 es
precision highp float;
in vec2 aPos;
uniform vec2 texel;
out vec2 vUv; out vec2 vL; out vec2 vR; out vec2 vT; out vec2 vB;
void main(){
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texel.x, 0.0); vR = vUv + vec2(texel.x, 0.0);
  vT = vUv + vec2(0.0, texel.y); vB = vUv - vec2(0.0, texel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`);
  function program(fragSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, VERT);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, '#version 300 es\nprecision highp float;\nprecision highp sampler2D;\nin vec2 vUv; in vec2 vL; in vec2 vR; in vec2 vT; in vec2 vB;\nout vec4 o;\n' + fragSrc));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  }

  const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }`;

  let progs;
  try {
    progs = {
      // Capsule splat: deposits along the segment prev→point so fast strokes stay continuous.
      splat: program(`
uniform sampler2D uTarget; uniform float aspect; uniform vec2 point; uniform vec2 prev;
uniform vec3 value; uniform vec2 radius; uniform float bristle; uniform float cap;
${NOISE}
void main(){
  vec2 p = vUv - prev; vec2 ba = point - prev;
  p.x *= aspect; ba.x *= aspect;
  float len2 = max(dot(ba, ba), 1e-8);
  float h = clamp(dot(p, ba) / len2, 0.0, 1.0);
  vec2 q = p - ba * h;
  float r = mix(radius.x, radius.y, h);
  float s = exp(-dot(q, q) / r);
  // dry-brush bristles: streaks running along the stroke
  float across = (p.x * ba.y - p.y * ba.x) * inversesqrt(len2);
  float br = mix(1.0, 0.45 + 0.75 * vnoise(vec2(across * 260.0, h * 3.0)), bristle);
  vec4 base = texture(uTarget, vUv);
  vec4 res = base + vec4(value * s * br, 0.0);
  res.x = cap > 0.0 ? min(res.x, max(base.x, cap)) : res.x;
  o = res;
}`),
      advect: program(`
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform vec2 velTexel;
uniform float dt; uniform float fade; uniform vec2 shift;
void main(){
  vec2 coord = vUv - dt * texture(uVelocity, vUv - shift).xy * velTexel - shift;
  vec4 v = texture(uSource, coord);
  float inside = step(0.0, coord.y) * step(coord.y, 1.0);
  o = v * fade * inside;
}`),
      // Ink advection + healing toward the glyph target, with the brush-written reveal.
      advectInk: program(`
uniform sampler2D uVelocity; uniform sampler2D uSource; uniform sampler2D uGlyph; uniform vec2 velTexel;
uniform float dt; uniform float fade; uniform vec2 shift; uniform float heal; uniform float scrollUv;
uniform float reveal; uniform vec4 bbox; uniform float vertical;
${NOISE}
void main(){
  vec2 coord = vUv - dt * texture(uVelocity, vUv - shift).xy * velTexel - shift;
  float inside = step(0.0, coord.y) * step(coord.y, 1.0);
  float d = texture(uSource, coord).r * fade * inside;
  vec2 g = vUv - vec2(0.0, scrollUv);
  float gv = 0.0;
  if (g.y >= 0.0 && g.y <= 1.0) {
    gv = texture(uGlyph, g).r;
    // write order: character by character, top to bottom with a slight lean
    vec2 l = clamp((g - bbox.xy) / bbox.zw, 0.0, 1.0);
    float ci, lx, ly;
    if (vertical > 0.5) { ci = step(l.y, 0.5); ly = fract((1.0 - l.y) * 2.0); lx = l.x; }
    else { ci = step(0.5, l.x); lx = fract(l.x * 2.0); ly = 1.0 - l.y; }
    float order = (ci + 0.72 * ly + 0.28 * lx + (vnoise(g * 38.0) - 0.5) * 0.12) / 2.0;
    gv *= smoothstep(order, order + 0.035, reveal);
  }
  float k = 1.0 - exp(-heal * dt);
  d += (gv - d) * k * smoothstep(0.02, 0.2, gv);
  o = vec4(d, 0.0, 0.0, 1.0);
}`),
      curl: program(`
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).y, R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x, B = texture(uVelocity, vB).x;
  o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`),
      vorticity: program(`
uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
void main(){
  float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x, T = texture(uCurl, vT).x, B = texture(uCurl, vB).x, C = texture(uCurl, vUv).x;
  vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  f /= length(f) + 1e-4;
  f *= curl * C; f.y *= -1.0;
  vec2 v = texture(uVelocity, vUv).xy + f * dt;
  o = vec4(clamp(v, -1200.0, 1200.0), 0.0, 1.0);
}`),
      divergence: program(`
uniform sampler2D uVelocity;
void main(){
  float L = texture(uVelocity, vL).x, R = texture(uVelocity, vR).x, T = texture(uVelocity, vT).y, B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
  o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`),
      clear: program(`
uniform sampler2D uTexture; uniform float value;
void main(){ o = value * texture(uTexture, vUv); }`),
      pressure: program(`
uniform sampler2D uPressure; uniform sampler2D uDivergence;
void main(){
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x, T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  float div = texture(uDivergence, vUv).x;
  o = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}`),
      gradient: program(`
uniform sampler2D uPressure; uniform sampler2D uVelocity;
void main(){
  float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x, T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
  vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
  o = vec4(v, 0.0, 1.0);
}`),
      display: program(`
uniform sampler2D uInk; uniform vec3 paper; uniform vec3 ink; uniform float grain; uniform vec2 res;
${NOISE}
void main(){
  float d = texture(uInk, vUv).r;
  float dl = texture(uInk, vL).r, dr = texture(uInk, vR).r, dt = texture(uInk, vT).r, db = texture(uInk, vB).r;
  float edge = length(vec2(dr - dl, dt - db));
  float a = 1.0 - exp(-d * 2.6);
  // fibrous bleed + a darker wet rim where ink meets paper
  float fib = vnoise(vUv * res / 3.0) * 0.6 + vnoise(vUv * res / 11.0) * 0.4;
  a *= mix(0.86, 1.06, fib);
  a = clamp(a + edge * 1.6 * smoothstep(0.05, 0.4, a), 0.0, 1.0);
  vec3 c = mix(paper, ink, a);
  c += (hash(gl_FragCoord.xy + fract(grain)) - 0.5) * 0.028;
  o = vec4(c, 1.0);
}`)
    };
  } catch (err) {
    console.warn('[ink] shader setup failed', err);
    return fail();
  }

  // Full-screen triangle
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function supported(internal, format) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, 4, 4, 0, format, gl.HALF_FLOAT, null);
    const f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(f); gl.deleteTexture(t);
    return ok;
  }
  const RGBA = { i: gl.RGBA16F, f: gl.RGBA };
  const RG = supported(gl.RG16F, gl.RG) ? { i: gl.RG16F, f: gl.RG } : RGBA;
  const R = supported(gl.R16F, gl.RED) ? { i: gl.R16F, f: gl.RED } : RGBA;
  if (!supported(RGBA.i, RGBA.f) && RG === RGBA) return fail();

  function target(w, h, fmt) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.i, w, h, 0, fmt.f, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo, w, h, tx: 1 / w, ty: 1 / h, free() { gl.deleteTexture(tex); gl.deleteFramebuffer(fbo); } };
  }
  function doubleTarget(w, h, fmt) {
    let a = target(w, h, fmt), b = target(w, h, fmt);
    return {
      w, h, tx: 1 / w, ty: 1 / h,
      get read() { return a; }, get write() { return b; },
      swap() { const t = a; a = b; b = t; },
      free() { a.free(); b.free(); }
    };
  }

  function bindTex(unit, t) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex || t); return unit; }
  function blit(dst) {
    if (dst) { gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function use(prog, texel) { gl.useProgram(prog.p); if (prog.u.texel) gl.uniform2f(prog.u.texel, texel[0], texel[1]); return prog.u; }

  /* ---------- state ---------- */
  let W = 0, H = 0, aspect = 1;
  let velocity, ink, divergence, curlT, pressure;
  const glyphTex = gl.createTexture();
  const glyph = { bbox: [0, 0, 0, 0], vertical: 0, ready: false };
  const glyphCanvas = document.createElement('canvas');
  const glyphCtx = glyphCanvas.getContext('2d');

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
    if (velocity && cw === canvas.width) {
      // Mobile URL bars resize the viewport while scrolling; ignore small height changes so
      // the ink is not wiped (the canvas just stretches by a few percent).
      if (ch === canvas.height || Math.abs(ch - canvas.height) / canvas.height < 0.22) return false;
    }
    canvas.width = cw; canvas.height = ch;
    W = innerWidth; H = innerHeight; aspect = W / H;

    const simH = CONFIG.simRes, simW = Math.round(simH * aspect);
    const inkH = Math.round(Math.min(Math.max(H * dpr * 0.75, 420), 1000)), inkW = Math.round(inkH * aspect);

    [velocity, ink, divergence, curlT, pressure].forEach(t => t && t.free());
    velocity = doubleTarget(simW, simH, RG);
    pressure = doubleTarget(simW, simH, R);
    divergence = target(simW, simH, R);
    curlT = target(simW, simH, R);
    ink = doubleTarget(inkW, inkH, R);
    drawGlyph(inkW, inkH);
    return true;
  }

  // The hero glyphs, drawn once per resize into a texture the ink heals toward.
  function drawGlyph(w, h) {
    glyphCanvas.width = w; glyphCanvas.height = h;
    const c = glyphCtx;
    c.fillStyle = '#000'; c.fillRect(0, 0, w, h);
    if (!document.fonts || !document.fonts.check('400 100px "Ma Shan Zheng"', '黑客')) { glyph.ready = false; upload(); return; }
    const vertical = (W / H) < 0.82;
    glyph.vertical = vertical ? 1 : 0;
    const heroH = hero ? Math.min(hero.offsetHeight, H) : H;
    const scale = w / W;
    let size, cx = W / 2, cy;
    if (vertical) { size = Math.min(W * 0.54, heroH * 0.222); cy = heroH * 0.36; }
    else { size = Math.min(heroH * 0.68, W * 0.37); cy = heroH * 0.45; }
    c.save();
    c.scale(scale, scale);
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `400 ${size}px "Ma Shan Zheng"`;
    const gap = size * 0.02;
    let pts;
    if (vertical) pts = [[cx, cy - size / 2 - gap], [cx, cy + size / 2 + gap]];
    else pts = [[cx - size / 2 - gap, cy], [cx + size / 2 + gap, cy]];
    // slight shadow pass gives the strokes a soaked, heavier body
    c.shadowColor = 'rgba(255,255,255,.55)';
    c.shadowBlur = size * 0.012;
    c.fillText('黑', pts[0][0], pts[0][1]);
    c.fillText('客', pts[1][0], pts[1][1]);
    c.restore();
    // bbox in GL uv (y up)
    const bw = vertical ? size : size * 2 + gap * 2;
    const bh = vertical ? size * 2 + gap * 2 : size;
    const x0 = (cx - bw / 2) / W, y0top = (cy - bh / 2) / H;
    glyph.bbox = [x0, 1 - (y0top + bh / H), bw / W, bh / H];
    glyph.ready = true;
    upload();
  }
  function upload() {
    gl.bindTexture(gl.TEXTURE_2D, glyphTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, glyphCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /* ---------- splats ---------- */
  function splat(t, prev, point, value, r0, r1, bristle, cap) {
    const u = use(progs.splat, [t.tx, t.ty]);
    gl.uniform1i(u.uTarget, bindTex(0, t.read));
    gl.uniform1f(u.aspect, aspect);
    gl.uniform2f(u.prev, prev[0], prev[1]);
    gl.uniform2f(u.point, point[0], point[1]);
    gl.uniform3f(u.value, value[0], value[1], value[2]);
    gl.uniform2f(u.radius, r0, r1);
    gl.uniform1f(u.bristle, bristle || 0);
    gl.uniform1f(u.cap, cap || 0);
    blit(t.write);
    t.swap();
  }
  function force(prev, point, fx, fy, radius) {
    splat(velocity, prev, point, [fx, fy, 0], radius, radius, 0, 0);
  }

  /* ---------- pointer (the brush) ---------- */
  const brush = { x: 0.5, y: 0.5, px: 0.5, py: 0.5, moved: false, active: false, width: 0.5, lastMove: 0 };
  function moveTo(cx, cy) {
    const x = cx / W, y = 1 - cy / H;
    if (!brush.active) { brush.px = x; brush.py = y; brush.active = true; }
    brush.x = x; brush.y = y; brush.moved = true; brush.lastMove = performance.now();
  }
  const lift = () => { brush.active = false; brush.moved = false; };
  // Mouse / pen: the brush follows the pointer.
  window.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') moveTo(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') moveTo(e.clientX, e.clientY); }, { passive: true });
  // Touch: pointer events stop once the browser starts scrolling, touch events keep coming,
  // so the brush keeps painting under the finger while the page scrolls.
  window.addEventListener('touchstart', e => { lift(); const t = e.touches[0]; if (t) moveTo(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchmove', e => { const t = e.touches[0]; if (t) moveTo(t.clientX, t.clientY); }, { passive: true });
  window.addEventListener('touchend', lift, { passive: true });
  window.addEventListener('touchcancel', lift, { passive: true });
  document.addEventListener('pointerleave', lift);
  window.addEventListener('blur', lift);

  function strokeBrush(dt) {
    if (!brush.moved) return;
    brush.moved = false;
    const dx = brush.x - brush.px, dy = brush.y - brush.py;
    const dist = Math.hypot(dx * aspect, dy);
    if (dist < 1e-5) return;
    const speed = dist / Math.max(dt, 1 / 240);           // viewport-heights per second
    // a calligraphy brush: slow = pressed and wide, fast = lifted and thin
    const target = Math.min(1, Math.max(0.32, 1.1 - speed * 0.22));
    const prevW = brush.width;
    brush.width += (target - brush.width) * 0.35;
    const toR = w => { const sigma = 0.0039 + w * 0.0122; return 2 * sigma * sigma; };
    const prev = [brush.px, brush.py], cur = [brush.x, brush.y];
    splat(ink, prev, cur, [CONFIG.brushInk, 0, 0], toR(prevW), toR(brush.width), 0.85, 1.0);
    const fs = CONFIG.brushForce / Math.max(dt, 1 / 240);
    force(prev, cur, dx * velocity.w * fs, dy * velocity.h * fs, 0.00035);
    brush.px = brush.x; brush.py = brush.y;
  }

  /* ---------- theme ---------- */
  const THEMES = {
    light: { paper: [0.969, 0.961, 0.941], ink: [0.051, 0.051, 0.047] },
    dark: { paper: [0.039, 0.039, 0.035], ink: [0.937, 0.910, 0.851] }
  };
  const pal = { paper: THEMES.light.paper.slice(), ink: THEMES.light.ink.slice() };
  function themeName() { return root.dataset.theme === 'dark' ? 'dark' : 'light'; }
  (function initPalette() { const t = THEMES[themeName()]; pal.paper = t.paper.slice(); pal.ink = t.ink.slice(); })();

  /* ---------- intro ---------- */
  let reveal = 0, revealStart = -1;
  const REVEAL_MS = 2900;
  const ease = t => 1 - Math.pow(1 - t, 3);
  function startReveal() {
    drawGlyph(ink.w, ink.h);
    revealStart = performance.now();
    root.classList.add('ink-ready');
    window.dispatchEvent(new CustomEvent('ink:reveal'));
  }
  const fontReady = document.fonts ? document.fonts.load('400 120px "Ma Shan Zheng"', '黑客').catch(() => null) : Promise.resolve();
  Promise.race([fontReady, new Promise(r => setTimeout(r, 2500))]).then(() => {
    if (document.fonts && !document.fonts.check('400 100px "Ma Shan Zheng"', '黑客')) {
      // font never arrived: keep the HTML glyph visible instead
      root.classList.add('no-glyph');
    }
    startReveal();
  });

  // While the glyph is being written, a ghost brush stirs the ink along the writing front.
  function ghostStir(t) {
    if (!glyph.ready || reveal <= 0 || reveal >= 1.05) return;
    const [bx, by, bw, bh] = glyph.bbox;
    const scrollUv = scrollY / H;
    for (let i = 0; i < 2; i++) {
      const ci = reveal < 0.5 ? 0 : 1;
      const local = Math.min(1, (reveal % 0.5) * 2);
      let x, y;
      if (glyph.vertical) { x = bx + Math.random() * bw; y = by + bh * (1 - (ci * 0.5 + local * 0.5)); }
      else { x = bx + bw * (ci * 0.5 + Math.random() * 0.5); y = by + bh * (1 - local); }
      y += scrollUv;
      const a = Math.random() * Math.PI * 2, m = 8 + Math.random() * 12;
      force([x, y], [x + 0.001, y], Math.cos(a) * m, Math.sin(a) * m, 0.0006);
    }
  }
  // Idle breathing so the characters never sit still like a font.
  function breathe(t) {
    if (!glyph.ready) return;
    const [bx, by, bw, bh] = glyph.bbox;
    const y0 = by + scrollY / H;
    if (y0 > 1.1 || y0 + bh < -0.1) return;
    const x = bx + bw * (0.5 + 0.48 * Math.sin(t * 0.00037) * Math.cos(t * 0.00021));
    const y = y0 + bh * (0.5 + 0.45 * Math.sin(t * 0.00029 + 1.7));
    const a = t * 0.0011;
    force([x, y], [x + 0.0005, y], Math.cos(a) * 4, Math.sin(a) * 4, 0.003);
  }

  /* ---------- step ---------- */
  let lastScroll = scrollY, lastT = performance.now(), sleeping = false;
  function step(dt, shift) {
    const vt = [velocity.tx, velocity.ty];
    let u;

    u = use(progs.curl, vt);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read));
    blit(curlT);

    u = use(progs.vorticity, vt);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read));
    gl.uniform1i(u.uCurl, bindTex(1, curlT));
    gl.uniform1f(u.curl, CONFIG.curl);
    gl.uniform1f(u.dt, dt);
    blit(velocity.write); velocity.swap();

    u = use(progs.divergence, vt);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read));
    blit(divergence);

    u = use(progs.clear, vt);
    gl.uniform1i(u.uTexture, bindTex(0, pressure.read));
    gl.uniform1f(u.value, 0.8);
    blit(pressure.write); pressure.swap();

    u = use(progs.pressure, vt);
    gl.uniform1i(u.uDivergence, bindTex(1, divergence));
    for (let i = 0; i < CONFIG.pressureIters; i++) {
      gl.uniform1i(u.uPressure, bindTex(0, pressure.read));
      blit(pressure.write); pressure.swap();
    }

    u = use(progs.gradient, vt);
    gl.uniform1i(u.uPressure, bindTex(0, pressure.read));
    gl.uniform1i(u.uVelocity, bindTex(1, velocity.read));
    blit(velocity.write); velocity.swap();

    u = use(progs.advect, vt);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read));
    gl.uniform1i(u.uSource, bindTex(0, velocity.read));
    gl.uniform2f(u.velTexel, velocity.tx, velocity.ty);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.fade, Math.exp(-CONFIG.velocityFade * dt));
    gl.uniform2f(u.shift, 0, shift);
    blit(velocity.write); velocity.swap();

    u = use(progs.advectInk, [ink.tx, ink.ty]);
    gl.uniform1i(u.uVelocity, bindTex(0, velocity.read));
    gl.uniform1i(u.uSource, bindTex(1, ink.read));
    gl.uniform1i(u.uGlyph, bindTex(2, glyphTex));
    gl.uniform2f(u.velTexel, velocity.tx, velocity.ty);
    gl.uniform1f(u.dt, dt);
    gl.uniform1f(u.fade, Math.exp(-CONFIG.inkFade * dt));
    gl.uniform2f(u.shift, 0, shift);
    gl.uniform1f(u.heal, glyph.ready ? CONFIG.heal : 0);
    gl.uniform1f(u.scrollUv, scrollY / H);
    gl.uniform1f(u.reveal, glyph.ready ? reveal : 0);
    gl.uniform4f(u.bbox, glyph.bbox[0], glyph.bbox[1], glyph.bbox[2], glyph.bbox[3]);
    gl.uniform1f(u.vertical, glyph.vertical);
    blit(ink.write); ink.swap();
  }

  function render(t) {
    const target = THEMES[themeName()];
    const k = 0.12;
    for (let i = 0; i < 3; i++) {
      pal.paper[i] += (target.paper[i] - pal.paper[i]) * k;
      pal.ink[i] += (target.ink[i] - pal.ink[i]) * k;
    }
    const u = use(progs.display, [ink.tx, ink.ty]);
    gl.uniform1i(u.uInk, bindTex(0, ink.read));
    gl.uniform3f(u.paper, pal.paper[0], pal.paper[1], pal.paper[2]);
    gl.uniform3f(u.ink, pal.ink[0], pal.ink[1], pal.ink[2]);
    gl.uniform1f(u.grain, t * 0.001);
    gl.uniform2f(u.res, canvas.width, canvas.height);
    blit(null);
  }

  function frame(t) {
    requestAnimationFrame(frame);
    if (resize()) lastScroll = scrollY;
    const dt = Math.min((t - lastT) / 1000, 1 / 30);
    lastT = t;

    if (revealStart >= 0) reveal = Math.min(1.08, ease(Math.min(1, (t - revealStart) / REVEAL_MS)) * 1.08);

    const dy = scrollY - lastScroll;
    lastScroll = scrollY;
    const shift = dy / H;

    // Sleep when nothing can change: hero off-screen, brush idle, no scrolling.
    const heroVisible = !hero || hero.getBoundingClientRect().bottom > 0;
    const idle = t - brush.lastMove > 3500 && Math.abs(dy) < 0.5;
    const tgt = THEMES[themeName()];
    const fading = Math.abs(tgt.paper[0] - pal.paper[0]) + Math.abs(tgt.ink[0] - pal.ink[0]) > 0.002;
    if (!heroVisible && idle && reveal >= 1 && !fading) {
      if (sleeping) return;
      sleeping = true;
    } else sleeping = false;

    gl.disable(gl.BLEND);
    strokeBrush(dt);
    ghostStir(t);
    breathe(t);
    step(dt, shift);
    render(t);
  }

  try {
    resize();
    requestAnimationFrame(frame);
    root.classList.add('ink-on');
  } catch (err) {
    console.warn('[ink] failed', err);
    fail();
  }
})();
