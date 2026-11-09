'use strict';

// Google Form for applications. Paste the full "보내기 → 링크" URL here.
// A docs.google.com/forms/... URL is also embedded on the page; a forms.gle short link opens in a new tab.
const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSe9p9_ouDcdgJk5tpJcNrdD7edCfxyv-AWie1U_zlZXQpTV0g/viewform'; // forms.gle/N8ZNDU1CXcNMJfA37

const root = document.documentElement;
const form = document.querySelector('#ch-form');
const input = document.querySelector('#ch-input');
const status = document.querySelector('#ch-status');
const frameWrap = document.querySelector('#ch-frame-wrap');
const success = document.querySelector('#ch-success');
const payloadOut = document.querySelector('#ch-payload');
const copyButton = document.querySelector('#ch-copy');
const formSlot = document.querySelector('#ch-form-slot');

/* ---------- theme (shared with the main site) ---------- */
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
  render(lastInput);
});

/* ---------- sandboxed preview ---------- */
// Each preview gets a fresh sandboxed frame: scripts may run inside it, but it has an opaque
// origin, so nothing in it can read or change this page, the main site, or its storage.
let frame = null;
let lastInput = '';
let solved = false;

function render(text) {
  lastInput = text;
  if (frame) frame.remove();
  frame = document.createElement('iframe');
  frame.className = 'ch-frame';
  frame.title = '각오 미리보기';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('referrerpolicy', 'no-referrer');
  frame.src = 'sandbox.html';
  frameWrap.append(frame);
}

window.addEventListener('message', e => {
  if (!frame || e.source !== frame.contentWindow || !e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'heukgaek-sandbox-ready') {
    frame.contentWindow.postMessage({ type: 'heukgaek-preview', input: lastInput, theme: root.dataset.theme }, '*');
  } else if (e.data.type === 'heukgaek-xss-solved') {
    onSolved();
  }
});

form.addEventListener('submit', e => {
  e.preventDefault();
  const text = input.value;
  status.textContent = text.trim() ? '미리보기를 갱신했습니다.' : '';
  render(text);
});

render('');

/* ---------- success ---------- */
function onSolved() {
  if (solved) return;
  solved = true;
  status.textContent = '성공했습니다!';
  payloadOut.textContent = lastInput; // textContent only: the payload never runs on this page
  showForm();
  success.hidden = false;
  success.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  success.focus({ preventScroll: true });
}

function showForm() {
  let url = null;
  try { url = FORM_URL ? new URL(FORM_URL) : null; } catch (_) { url = null; }
  if (!url || !/^https:$/.test(url.protocol) || !/(^|\.)(google\.com|forms\.gle)$/.test(url.hostname)) {
    const p = document.createElement('p');
    p.className = 'ch-pending';
    p.textContent = '지원서 링크는 곧 열립니다. 모집 공지를 확인해 주세요.';
    formSlot.append(p);
    return;
  }
  const open = document.createElement('a');
  open.className = 'button';
  open.href = url.href;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.innerHTML = '지원서 작성하기<svg class="icon"><use href="#external"/></svg>';
  formSlot.append(open);

  if (url.hostname === 'docs.google.com' && url.pathname.startsWith('/forms/')) {
    const embed = new URL(url.href);
    embed.searchParams.set('embedded', 'true');
    const f = document.createElement('iframe');
    f.className = 'ch-gform';
    f.title = '흑객 지원서';
    f.src = embed.href;
    f.loading = 'lazy';
    formSlot.append(f);
  }
}

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(lastInput);
    copyButton.firstChild.textContent = '복사됨';
  } catch (_) {
    const range = document.createRange();
    range.selectNodeContents(payloadOut);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
  }
});
