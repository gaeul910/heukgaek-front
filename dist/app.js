'use strict';

// Leave blank until the recruitment form is announced.
const SITE_CONFIG = Object.freeze({ applicationUrl: '' });

const root = document.documentElement;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- theme ---------- */
const themeToggle = document.querySelector('.theme-toggle');
const themeColor = document.querySelector('meta[name="theme-color"]');
function syncTheme() {
  const isDark = root.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-label', isDark ? '밝은 화면으로 전환' : '어두운 화면으로 전환');
  themeToggle.setAttribute('aria-pressed', String(isDark));
  themeColor.content = isDark ? '#0a0a09' : '#f7f5f0';
}
syncTheme();
themeToggle.addEventListener('click', () => {
  root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('heukgaek-theme', root.dataset.theme); } catch (_) { /* storage may be unavailable */ }
  syncTheme();
});

/* ---------- header ---------- */
const header = document.querySelector('.site-header');
const headerApply = document.querySelector('.header-apply');
const heroApply = document.querySelector('#hero-apply');
const ctaObserver = new IntersectionObserver(([entry]) => {
  const visible = !entry.isIntersecting && entry.boundingClientRect.top < 80;
  headerApply.classList.toggle('visible', visible);
  headerApply.setAttribute('aria-hidden', String(!visible));
  headerApply.tabIndex = visible ? 0 : -1;
}, { rootMargin: '-80px 0px 0px 0px', threshold: 0 });
ctaObserver.observe(heroApply);

let scrollPending = false;
function syncHeader() { header.classList.toggle('scrolled', window.scrollY > 12); scrollPending = false; }
window.addEventListener('scroll', () => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(syncHeader); } }, { passive: true });
syncHeader();

/* ---------- mobile menu ---------- */
const menuToggle = document.querySelector('.menu-toggle');
const mobileNav = document.querySelector('#mobile-nav');
function closeMenu() { menuToggle.setAttribute('aria-expanded', 'false'); menuToggle.setAttribute('aria-label', '메뉴 열기'); mobileNav.hidden = true; }
menuToggle.addEventListener('click', () => {
  const willOpen = menuToggle.getAttribute('aria-expanded') !== 'true';
  menuToggle.setAttribute('aria-expanded', String(willOpen));
  menuToggle.setAttribute('aria-label', willOpen ? '메뉴 닫기' : '메뉴 열기');
  mobileNav.hidden = !willOpen;
});
mobileNav.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !mobileNav.hidden) { closeMenu(); menuToggle.focus(); } });
document.addEventListener('click', e => { if (!header.contains(e.target)) closeMenu(); });
matchMedia('(min-width: 1100px)').addEventListener('change', e => { if (e.matches) closeMenu(); });

/* ---------- active nav ---------- */
const navLinks = [...document.querySelectorAll('.desktop-nav a, #mobile-nav a')];
const sectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    navLinks.forEach(link => {
      const active = link.hash === '#' + entry.target.id;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'location'); else link.removeAttribute('aria-current');
    });
  });
}, { rootMargin: '-35% 0px -55% 0px', threshold: 0 });
document.querySelectorAll('main section[id]').forEach(s => sectionObserver.observe(s));

/* ---------- application dialog ---------- */
const dialog = document.querySelector('#application-dialog');
document.querySelectorAll('[data-apply]').forEach(button => button.addEventListener('click', () => {
  if (SITE_CONFIG.applicationUrl) window.location.assign(SITE_CONFIG.applicationUrl);
  else { dialog.showModal(); document.body.classList.add('dialog-open'); }
}));
dialog.querySelectorAll('.dialog-close, .dialog-confirm').forEach(b => b.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', e => {
  const r = dialog.getBoundingClientRect();
  if (e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) dialog.close();
});
dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
if (SITE_CONFIG.applicationUrl) document.querySelectorAll('#hero-apply, .header-apply').forEach(l => { l.href = SITE_CONFIG.applicationUrl; });
document.querySelector('#year').textContent = String(new Date().getFullYear());

/* ---------- cursor ---------- */
const cursor = document.querySelector('.cursor');
if (cursor && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let x = -100, y = -100, cx = -100, cy = -100;
  window.addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; cursor.classList.add('on'); }, { passive: true });
  document.addEventListener('pointerleave', () => cursor.classList.remove('on'));
  document.addEventListener('pointerover', e => cursor.classList.toggle('hover', !!e.target.closest('a, button:not(:disabled), .activity')));
  (function tick() {
    cx += (x - cx) * 0.28; cy += (y - cy) * 0.28;
    cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
    requestAnimationFrame(tick);
  })();
}

/* ---------- motion (GSAP) ---------- */
function showHeroStatic() { root.classList.add('hero-ready'); }

function initMotion() {
  const gsap = window.gsap;
  if (!gsap || reduceMotion) { showHeroStatic(); return; }
  gsap.registerPlugin(window.ScrollTrigger);

  // Hero: header and copy arrive while the glyphs are being written.
  let played = false;
  const playHero = () => {
    if (played) return; played = true;
    root.classList.add('hero-ready');
    const tl = gsap.timeline({ defaults: { ease: 'expo.out', duration: 1.4 } });
    tl.from('.site-header', { y: -24, opacity: 0, duration: 1.2 }, 0.2)
      .fromTo('.hero [data-hero]', { y: 28, opacity: 0, filter: 'blur(6px)' }, { y: 0, opacity: 1, filter: 'blur(0px)', stagger: 0.09 }, 1.1);
  };
  window.addEventListener('ink:reveal', playHero, { once: true });
  if (root.classList.contains('ink-ready') || root.classList.contains('no-ink')) playHero();
  setTimeout(playHero, 2600); // never leave the hero empty

  // Sections: rise in as they enter.
  gsap.utils.toArray('[data-reveal]').forEach(el => {
    gsap.from(el, {
      y: 42, opacity: 0, duration: 1.1, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%', once: true }
    });
  });

  // Brush underline is painted under each heading as it scrolls in.
  gsap.utils.toArray('.heading').forEach(h => {
    gsap.fromTo(h, { '--draw': 420 }, {
      '--draw': 0, duration: 1.3, ease: 'power3.inOut', delay: 0.25,
      scrollTrigger: { trigger: h, start: 'top 85%', once: true }
    });
  });

  // Closing line drifts slightly with scroll for depth.
  gsap.fromTo('.closing-line', { yPercent: 20 }, {
    yPercent: -10, ease: 'none',
    scrollTrigger: { trigger: '.closing', start: 'top bottom', end: 'bottom top', scrub: true }
  });
}
if (document.readyState === 'complete') initMotion();
else window.addEventListener('load', initMotion);
