'use strict';

// "문제 풀러 가기" opens the XSS challenge; solving it reveals the Google Form (set in challenge/challenge.js).
const SITE_CONFIG = Object.freeze({ applicationUrl: 'challenge/' });

const root = document.documentElement;
// ?static (review/screenshot mode): jump to anchors instantly and show everything at rest.
const isStatic = new URLSearchParams(location.search).has('static');
if (isStatic) root.style.scrollBehavior = 'auto';

/* ---------- header ---------- */
const header = document.querySelector('.site-header');
let scrollPending = false;
function syncHeader() { header.classList.toggle('scrolled', window.scrollY > 12); scrollPending = false; }
window.addEventListener('scroll', () => { if (!scrollPending) { scrollPending = true; requestAnimationFrame(syncHeader); } }, { passive: true });
syncHeader();

/* ---------- nav: mark the section in view ---------- */
const navLinks = [...document.querySelectorAll('.site-nav a')];
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

/* ---------- apply ---------- */
// Header and hero buttons scroll to #join, where the flow is explained; the CTA button starts the challenge.
document.querySelectorAll('[data-apply]').forEach(button => button.addEventListener('click', () => window.location.assign(SITE_CONFIG.applicationUrl)));
document.querySelector('#year').textContent = String(new Date().getFullYear());

/* ---------- reveal on scroll ---------- */
const revealables = document.querySelectorAll('.reveal');
if (isStatic || !('IntersectionObserver' in window)) {
  revealables.forEach(el => el.classList.add('in'));
} else {
  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      revealObserver.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  revealables.forEach(el => revealObserver.observe(el));
}
