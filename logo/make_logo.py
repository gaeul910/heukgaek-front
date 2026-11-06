"""
흑객 logo generator — an 이무기 (imugi) chasing the 여의주, drawn as one ink stroke.

Composition follows the traditional 운룡/여의주 motif: the serpent's body sweeps an
open enso, the head continues the line of the body (no bent neck) and leads the motion,
and the pearl sits in the open gap just ahead of the jaws. Mane and whiskers stream
backwards for speed; the tail frays into dry brush.

Run:  python make_logo.py      (writes the SVGs next to this file)
"""
import math, os, random

OUT = os.path.dirname(os.path.abspath(__file__))
random.seed(5)

C = dict(size=512, cx=256, cy=266,
         r_tail=146, r_head=172,      # slight spiral: the head rides outside the tail
         a_start=252, sweep=318,      # degrees; SVG angles (0 = right, 90 = down), runs counter-clockwise
         max_w=74, neck_w=50, head_scale=1.12, pearl_r=26)

def lerp(a, b, t): return a + (b - a) * t
def smooth(t): t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)
def norm(x, y):
    l = math.hypot(x, y) or 1.0
    return x / l, y / l
def P(pts): return ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)

# ---------------- body centerline ----------------
def spine(t):
    a = math.radians(C['a_start'] - C['sweep'] * t)
    r = lerp(C['r_tail'], C['r_head'], smooth(t)) + 6 * math.sin(2 * math.pi * t * 1.3 + 0.8)
    return C['cx'] + r * math.cos(a), C['cy'] + r * math.sin(a)

N = 340
pts = [spine(i / N) for i in range(N + 1)]

def width(i):
    t = i / N
    if t < 0.55: w = 2.5 + (C['max_w'] - 2.5) * math.sin(math.pi / 2 * t / 0.55) ** 1.6
    else: w = lerp(C['max_w'], C['neck_w'], smooth((t - 0.55) / 0.45))
    return w * (1 + 0.05 * math.sin(t * 31))

def tangent(i):
    a = pts[max(i - 1, 0)]; b = pts[min(i + 1, N)]
    return norm(b[0] - a[0], b[1] - a[1])
def outward(i):
    tx, ty = tangent(i); nx, ny = -ty, tx
    x, y = pts[i]
    return (nx, ny) if (x + nx - C['cx'])**2 + (y + ny - C['cy'])**2 > (x - C['cx'])**2 + (y - C['cy'])**2 else (-nx, -ny)

OUTER, INNER = [], []
for i in range(N + 1):
    (x, y), w = pts[i], width(i)
    ox, oy = outward(i)
    j = 0.9 * (random.random() - 0.5) if i < N * 0.45 else 0.25 * (random.random() - 0.5)
    OUTER.append((x + ox * (w / 2 + j), y + oy * (w / 2 + j)))
    INNER.append((x - ox * (w / 2 - j), y - oy * (w / 2 - j)))
body = OUTER + INNER[::-1]

# ---------------- head: continues the body line ----------------
bx, by = pts[-1]
dx, dy = tangent(N)              # forward
vx, vy = outward(N)              # +v = outer side (the back / brow)
S = C['head_scale']
def H(u, v): return (bx + (dx * u + vx * v) * S, by + (dy * u + vy * v) * S)
hw = C['neck_w'] / 2 / S
head = [H(*p) for p in [
    (-6, hw), (14, hw + 4), (32, hw + 6), (46, hw + 7), (58, hw + 2),     # skull to the brow ridge
    (74, 17), (94, 12), (110, 7), (118, 2),                               # long snout to the nose
    (114, -3), (92, -4), (66, -1),                                        # upper lip back to the mouth corner
    (92, -11), (104, -15), (96, -21), (72, -24),                          # open lower jaw and chin
    (46, -hw - 1), (20, -hw), (-6, -hw)]]                                 # throat back into the neck

# ---------------- mane & crest: streaming backwards ----------------
mane = []
def flick(root, back, out, w, length, sweep=1.25, lift=0.42):
    ra = (root[0] - back[0] * w * 0.12, root[1] - back[1] * w * 0.12)
    rb = (root[0] + back[0] * w * 0.18, root[1] + back[1] * w * 0.18)
    tip = (root[0] + out[0] * length * lift + back[0] * length * sweep, root[1] + out[1] * length * lift + back[1] * length * sweep)
    ctl = (root[0] + out[0] * length * (lift + 0.14) + back[0] * length * 0.35, root[1] + out[1] * length * (lift + 0.14) + back[1] * length * 0.35)
    mid = ((rb[0] + tip[0]) / 2, (rb[1] + tip[1]) / 2)
    return f'M{ra[0]:.1f},{ra[1]:.1f} Q{ctl[0]:.1f},{ctl[1]:.1f} {tip[0]:.1f},{tip[1]:.1f} Q{mid[0]:.1f},{mid[1]:.1f} {rb[0]:.1f},{rb[1]:.1f} Z'

for k, i in enumerate(range(int(N * 0.40), N - 10, 26)):
    (x, y), w = pts[i], width(i)
    ox, oy = outward(i)
    tx, ty = tangent(i)
    root = (x + ox * w * 0.44, y + oy * w * 0.44)
    mane.append(flick(root, (-tx, -ty), (ox, oy), w, w * (0.72 + 0.22 * math.sin(k * 2.1))))
# crest swept back from the skull, longer — reads as a mane, not horns
for (u, v, ln) in [(40, hw + 5, 64), (24, hw + 4, 56), (8, hw + 2, 46)]:
    root = H(u, v)
    mane.append(flick(root, (-dx, -dy), (vx, vy), 26, ln * S, sweep=1.15, lift=0.36))
# a beard under the jaw, streaming back
for (u, v, ln) in [(70, -24, 40), (52, -hw, 34)]:
    root = H(u, v)
    mane.append(flick(root, (-dx, -dy), (-vx, -vy), 18, ln * S, sweep=1.1, lift=0.3))

# ---------------- pearl ahead of the jaws ----------------
nose = H(122, 0)
PEARL = (nose[0] + dx * 30 - vx * 14, nose[1] + dy * 30 - vy * 14)
pr = C['pearl_r']

# ---------------- cut-outs ----------------
cuts = []
for k in range(15):  # dry brush: frayed tail, a few streaks through the body
    off = random.uniform(-0.42, 0.42)
    if k < 9: t0 = random.uniform(0.0, 0.1); t1 = t0 + random.uniform(0.16, 0.34); sw = random.uniform(0.8, 2.0)
    else: t0 = random.uniform(0.3, 0.7); t1 = t0 + random.uniform(0.05, 0.12); sw = random.uniform(0.6, 1.1)
    seg = []
    for i in range(int(t0 * N), min(int(t1 * N), N)):
        (x, y), w = pts[i], width(i)
        ox, oy = outward(i)
        seg.append((x + ox * w * off, y + oy * w * off))
    if len(seg) > 2: cuts.append(f'<path d="M{P(seg)}" stroke-width="{sw:.2f}"/>')
belly = []
for i in range(int(N * 0.32), N - 4):
    (x, y), w = pts[i], width(i)
    ox, oy = outward(i)
    belly.append((x - ox * w * 0.28, y - oy * w * 0.28))
cuts.append(f'<path d="M{P(belly)}" stroke-width="1.3" stroke-dasharray="6 9"/>')
e = H(60, 15); e2 = H(70, 13)
ang = math.degrees(math.atan2(e2[1] - e[1], e2[0] - e[0])) - 10
eye = (f'<ellipse cx="{e[0]:.1f}" cy="{e[1]:.1f}" rx="{9.5*S:.1f}" ry="{3.6*S:.1f}" transform="rotate({ang:.1f} {e[0]:.1f} {e[1]:.1f})" fill="#000"/>'
       f'<ellipse cx="{e[0]:.1f}" cy="{e[1]:.1f}" rx="{1.4*S:.1f}" ry="{3.4*S:.1f}" transform="rotate({ang:.1f} {e[0]:.1f} {e[1]:.1f})" fill="#fff"/>')
b1, b2, b3 = H(46, 23), H(60, 25), H(76, 19)
cuts.append(f'<path d="M{b1[0]:.1f},{b1[1]:.1f} Q{b2[0]:.1f},{b2[1]:.1f} {b3[0]:.1f},{b3[1]:.1f}" stroke-width="1.6"/>')
ns = H(108, 4)
cuts.append(f'<circle cx="{ns[0]:.1f}" cy="{ns[1]:.1f}" r="1.7" fill="#000" stroke="none"/>')
for (u, v, dv) in [(80, -4, -5), (90, -12, 5)]:
    a, b, c = H(u, v), H(u + 3, v + dv), H(u + 6, v)
    cuts.append(f'<path d="M{a[0]:.1f},{a[1]:.1f} L{b[0]:.1f},{b[1]:.1f} L{c[0]:.1f},{c[1]:.1f} Z" fill="#000" stroke="none"/>')
cuts.append(f'<path d="M{PEARL[0] - pr*0.6:.1f},{PEARL[1] - pr*0.1:.1f} A{pr*0.62:.1f},{pr*0.62:.1f} 0 0 1 {PEARL[0] + pr*0.05:.1f},{PEARL[1] - pr*0.6:.1f}" stroke-width="{pr*0.13:.1f}"/>')

# whiskers: long, streaming back over the body
whisk = []
for (u0, v0, pts_uv, sw) in [
    (112, 2, [(112, -26), (88, -46), (52, -44)], 2.2),
    (98, -16, [(86, -40), (60, -58), (28, -52)], 1.8)]:
    a = H(u0, v0); c1, c2, c3 = (H(*q) for q in pts_uv)
    whisk.append((f'M{a[0]:.1f},{a[1]:.1f} C{c1[0]:.1f},{c1[1]:.1f} {c2[0]:.1f},{c2[1]:.1f} {c3[0]:.1f},{c3[1]:.1f}', sw))

# ---------------- fit: square viewBox around everything that was drawn ----------------
import re
_all = ' '.join([P(body), P(head)] + mane + [d for d, _ in whisk])
_nums = [float(v) for v in re.findall(r'-?\d+\.?\d*', _all)]
_xs, _ys = _nums[0::2], _nums[1::2]
_xs += [PEARL[0] - pr, PEARL[0] + pr]; _ys += [PEARL[1] - pr, PEARL[1] + pr]
_x0, _x1, _y0, _y1 = min(_xs), max(_xs), min(_ys), max(_ys)
_side = max(_x1 - _x0, _y1 - _y0) + 28
_cx, _cy = (_x0 + _x1) / 2, (_y0 + _y1) / 2
VIEWBOX = f'{_cx - _side/2:.1f} {_cy - _side/2:.1f} {_side:.1f} {_side:.1f}'

# ---------------- assemble ----------------
def mark_svg(color, bg=None, rough=True):
    size = C['size']
    filt = ('<filter id="ink" x="-5%" y="-5%" width="110%" height="110%">'
            '<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="3" result="n"/>'
            '<feDisplacementMap in="SourceGraphic" in2="n" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter>') if rough else ''
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VIEWBOX}" role="img" aria-label="흑객 이무기 로고" style="color:{color}">
  <defs>
    {filt}
    <mask id="cut" maskUnits="userSpaceOnUse" x="-{size}" y="-{size}" width="{size*3}" height="{size*3}">
      <rect x="-{size}" y="-{size}" width="{size*3}" height="{size*3}" fill="#fff"/>
      <g fill="none" stroke="#000" stroke-linecap="round">{''.join(cuts)}</g>
      {eye}
    </mask>
  </defs>
  {f'<rect x="-{size}" y="-{size}" width="{size*3}" height="{size*3}" fill="{bg}"/>' if bg else ''}
  <g fill="currentColor"{' filter="url(#ink)"' if rough else ''}>
    <g mask="url(#cut)">
      <path d="M{P(body)} Z"/>
      <path d="M{P(head)} Z"/>
      {''.join(f'<path d="{m}"/>' for m in mane)}
      <circle cx="{PEARL[0]:.1f}" cy="{PEARL[1]:.1f}" r="{pr}"/>
    </g>
    <g fill="none" stroke="currentColor" stroke-linecap="round">{''.join(f'<path d="{d}" stroke-width="{sw}"/>' for d, sw in whisk)}</g>
  </g>
</svg>'''

files = {
    'heukgaek-mark-ink.svg': mark_svg('#0d0d0c'),
    'heukgaek-mark-ivory.svg': mark_svg('#efe8d9'),
    'heukgaek-mark-on-black.svg': mark_svg('#efe8d9', bg='#0a0a09'),
    'heukgaek-mark-on-paper.svg': mark_svg('#0d0d0c', bg='#f7f5f0'),
    'heukgaek-favicon.svg': mark_svg('#0d0d0c', rough=False),
}
for name, svg in files.items():
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
        f.write(svg)
print('wrote', ', '.join(files))
