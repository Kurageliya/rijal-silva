/**
 * Rijal & Silva — v2
 * Tampilan baru di atas data & logika yang sama dengan versi sekarang
 * (Firestore, halaman buku pilihan, hitungan waktu, ulang tahun, musik).
 */
import { getCoupleSettings, getMemoriesList, setupCloudListeners } from '../js/repositories/storageRepository.js';
import { calculateTimeUnits } from '../js/services/counterService.js';
import { parseBirthday, getZodiac } from '../js/services/reminderService.js';
import { setupAudioSynth, onMusicUrlChanged } from '../js/services/audioService.js';
import { getEffectiveBookItems, getStickerForIndex, playPaperRustle } from '../js/modules/book.js';
import { getMemoryImages } from '../js/modules/timeline.js';
import { escapeHtml, getMemoryTimestamp } from '../js/utils/helpers.js';
import { showToast } from '../js/utils/toast.js';

const DAY = 86400000;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / DAY);
const fmtLong = (d) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDate = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtShort = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const parseDay = (s) => new Date(String(s || '').split('T')[0] + 'T12:00:00');
const pad = (n) => String(n).padStart(2, '0');
/** Path aset di data ditulis relatif ke root situs; v2 ada satu folder di bawahnya. */
const asset = (url) => (!url || /^(data:|https?:|blob:)/.test(url)) ? url : '../' + String(url).replace(/^\.?\//, '');
const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function addMonths(date, n) {
  const r = new Date(date.getTime());
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}

function readView() {
  try { return localStorage.getItem('v2_album_view') === 'grid' ? 'grid' : 'slide'; } catch (e) { return 'slide'; }
}

const state = {
  settings: getCoupleSettings(),
  memories: getMemoriesList(),
  filter: 'all',
  view: readView(),
  storyList: [],
  storyIndex: 0,
  storyPhoto: 0,
  bookIndex: 0,
  letterIndex: 0,
  memoriesSig: '',
  settingsSig: ''
};

/* --------------------------------------------------------------------------
   Muncul saat di-scroll
   -------------------------------------------------------------------------- */
const revealer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('in');
    entry.target.dispatchEvent(new CustomEvent('revealed'));
    revealer.unobserve(entry.target);
  }
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
const watch = (el) => el && revealer.observe(el);

function countUp(el, to, duration = 1100) {
  const start = performance.now();
  const from = 0;
  function step(now) {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = Math.round(from + (to - from) * easeOut(t));
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

/* --------------------------------------------------------------------------
   Hero: nama & buku
   -------------------------------------------------------------------------- */
function renderNames() {
  const p1 = state.settings.person1 || 'Rijal';
  const p2 = state.settings.person2 || 'Silva';
  $('#name-1').textContent = p1;
  $('#name-2').textContent = p2;
  $('#nav-brand').textContent = `${p1} & ${p2}`;
  $('#footer-text').textContent = `dibuat ${p1}, untuk ${p2}`;
  document.title = `${p1} & ${p2}`;
}

const PAGE_TAPES = [['pink a', 'yellow b'], ['green c'], ['yellow a', 'pink b'], ['pink c'], ['green a', 'yellow b'], ['yellow c']];
const PAGE_TILT = [-2, 1.4, -1, 2, -1.6, 1];

function renderBook() {
  const items = getEffectiveBookItems(state.memories, state.settings.scrapbookCustomPages);
  const n = items.length;
  $('.rings').innerHTML = '<div class="ring"></div>'.repeat(8);
  $('#pages').innerHTML = items.map((item, i) => `
    <div class="page" data-i="${i}" style="z-index:${n - i}">
      <div class="face front">
        <figure class="print" style="--r:${PAGE_TILT[i % PAGE_TILT.length]}deg">
          ${PAGE_TAPES[i % PAGE_TAPES.length].map((t) => `<span class="tape ${t}"></span>`).join('')}
          <img src="${escapeHtml(asset(item.imgUrl))}" alt="" draggable="false">
          <figcaption class="cap">${escapeHtml(item.title)}</figcaption>
          <small>${escapeHtml(item.formattedDate)}</small>
        </figure>
        ${getStickerForIndex(i)}
        <div class="page-foot"><span>hal. ${i + 1} / ${n}</span><span class="turn">${i < n - 1 ? 'balik →' : 'ke awal ↺'}</span></div>
      </div>
      <div class="face back"></div>
    </div>`).join('');
  state.bookIndex = Math.min(state.bookIndex, Math.max(0, n - 1));
  $$('.page').forEach((page, i) => page.classList.toggle('flipped', i < state.bookIndex));
  updateBookControls();
}

function updateBookControls() {
  const n = $$('.page').length;
  $('#book-count').textContent = `${Math.min(state.bookIndex + 1, n)} / ${n}`;
  $('#book-prev').disabled = state.bookIndex === 0;
}

let flipping = false;
function settlePage(page, extraClasses) {
  setTimeout(() => {
    page.classList.remove('turning', ...extraClasses);
    page.style.zIndex = $$('.page').length - Number(page.dataset.i);
    flipping = false;
  }, 780);
}

function flipNext() {
  const pages = $$('.page');
  if (flipping || pages.length < 2) return;
  if (state.bookIndex >= pages.length - 1) return flipToStart();
  const page = pages[state.bookIndex];
  flipping = true;
  playPaperRustle();
  page.style.zIndex = 100;
  page.classList.remove('returning');
  page.classList.add('turning', 'flipped');
  state.bookIndex++;
  $('#book-hint').classList.add('gone');
  updateBookControls();
  settlePage(page, []);
}

function flipPrev() {
  const pages = $$('.page');
  if (flipping || state.bookIndex === 0) return;
  const page = pages[state.bookIndex - 1];
  flipping = true;
  playPaperRustle();
  page.style.zIndex = 100;
  page.classList.add('returning', 'turning');
  page.classList.remove('flipped');
  state.bookIndex--;
  updateBookControls();
  settlePage(page, ['returning']);
}

function flipToStart() {
  const pages = $$('.page');
  flipping = true;
  playPaperRustle();
  const last = state.bookIndex;
  for (let i = last - 1; i >= 0; i--) {
    setTimeout(() => {
      pages[i].classList.add('returning');
      pages[i].classList.remove('flipped');
    }, (last - 1 - i) * 90);
  }
  state.bookIndex = 0;
  updateBookControls();
  setTimeout(() => {
    pages.forEach((p) => p.classList.remove('returning'));
    flipping = false;
  }, last * 90 + 800);
}

function setupBook() {
  const book = $('#book');
  let downX = null;
  book.addEventListener('pointerdown', (e) => { downX = e.clientX; });
  book.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (dx > 40) flipPrev();
    else flipNext(); // tap atau geser ke kiri
  });
  book.addEventListener('pointercancel', () => { downX = null; });
  $('#book-next').addEventListener('click', flipNext);
  $('#book-prev').addEventListener('click', flipPrev);
}

/* --------------------------------------------------------------------------
   Waktu bersama
   -------------------------------------------------------------------------- */
function anniversary() {
  return new Date(state.settings.anniversaryDate || '2026-02-15T09:00:00');
}

function renderTime() {
  const start = anniversary();
  const now = new Date();
  const dayN = Math.max(1, daysBetween(start, now) + 1);
  $('#hero-day').textContent = `hari ke-${dayN}`;
  $('#since-kicker').textContent = `sejak ${fmtDate(start)}`;

  state.dayN = dayN;
  const built = Number($('#cal-pages').dataset.n || 0);
  if (built !== dayN && !tearing) buildCalendar(false); // pertama kali, atau lewat tengah malam

  const u = calculateTimeUnits(start, now);
  const years = Number(u.years), months = Number(u.months), days = Number(u.days);
  const parts = [years && `${years} tahun`, months && `${months} bulan`, `${days} hari`].filter(Boolean).join(' ');
  $('#since').innerHTML = `<strong>${parts}</strong> sejak ${fmtLong(start)}, jam ${pad(start.getHours())}.${pad(start.getMinutes())}.`;

  const marks = [];
  for (const n of [100, 200, 300, 500, 1000]) marks.push({ label: `Hari ke-${n}`, date: new Date(midnight(start).getTime() + (n - 1) * DAY) });
  for (const y of [1, 2, 3]) marks.push({ label: `${y} tahun`, date: addMonths(start, y * 12) });
  const upcoming = marks.filter((m) => midnight(m.date) >= midnight(now)).sort((a, b) => a.date - b.date).slice(0, 3);
  const list = $('#milestones');
  const html = upcoming.map((m, i) => {
    const left = daysBetween(now, m.date);
    const pct = Math.min(100, Math.max(2, ((now - start) / (m.date - start)) * 100));
    return `<li class="reveal" style="transition-delay:${i * 0.1}s" data-pct="${pct.toFixed(1)}">
      <b>${m.label}</b><span>${fmtLong(m.date)}</span><em>${left === 0 ? 'hari ini!' : `${left} hari lagi`}</em><i></i></li>`;
  }).join('');
  if (html === list.dataset.html) return; // hanya berubah sekali sehari
  list.dataset.html = html;
  list.innerHTML = html;
  $$('li', list).forEach((li) => {
    li.addEventListener('revealed', () => { $('i', li).style.width = li.dataset.pct + '%'; }, { once: true });
    watch(li);
  });
}

/* Kalender sobek: beberapa hari terakhir tersobek satu per satu sampai hari ini */
let tearing = false;

function calendarPage(n) {
  const d = new Date(midnight(anniversary()).getTime() + (n - 1) * DAY);
  return `<div class="cal-page"><small>hari ke</small><b>${n}</b>`
    + `<span>${d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' })}</span></div>`;
}

function buildCalendar(tear) {
  const n = state.dayN || 1;
  const box = $('#cal-pages');
  const extra = tear ? Math.min(5, n - 1) : 0;
  let html = calendarPage(n);
  for (let k = n - 1; k >= n - extra; k--) html += calendarPage(k); // yang terakhir di DOM ada paling atas
  box.innerHTML = html;
  box.dataset.n = n;
  if (!extra) return;
  tearing = true;
  const order = [...box.children].slice(1).reverse();
  order.forEach((page, i) => setTimeout(() => {
    page.classList.add('torn');
    page.addEventListener('animationend', () => page.remove(), { once: true });
  }, 350 + i * 330));
  setTimeout(() => { tearing = false; }, 350 + order.length * 330 + 800);
}

function setupCalendar() {
  const cal = $('#calendar');
  const replay = () => {
    if (tearing) return;
    playPaperRustle();
    buildCalendar(true);
  };
  cal.addEventListener('click', replay);
  cal.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); replay(); } });
  cal.addEventListener('revealed', () => buildCalendar(true), { once: true });
  watch(cal);
}

/** Tepi atas & bawah kertas kraft dibuat sobek (acak tapi tetap sama tiap kunjungan). */
function tornEdges(el, seed = 11) {
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const top = [];
  const bottom = [];
  for (let x = 0; x <= 100; x += 2) top.push(`${x}% ${(1 + rand() * 9).toFixed(1)}px`);
  for (let x = 100; x >= 0; x -= 2) bottom.push(`${x}% calc(100% - ${(1 + rand() * 9).toFixed(1)}px)`);
  el.style.clipPath = `polygon(${top.join(', ')}, ${bottom.join(', ')})`;
}

function tickClock() {
  const u = calculateTimeUnits(anniversary(), new Date());
  $('#ticker').innerHTML = `dan <b>${u.hours}</b> jam <b>${u.minutes}</b> menit <b>${u.seconds}</b> detik`;
}

/* --------------------------------------------------------------------------
   Ulang tahun
   -------------------------------------------------------------------------- */
const HEART_PATH = 'M12 20.5C5.5 15.4 2 11.6 3.4 7.6 4.6 4.2 9.2 3.6 11.8 7.4c2.4-3.9 7.2-3.6 8.6-.1 1.6 3.9-1.8 7.9-8.4 13.2z';
const HEART_COLORS = ['#8c2f4b', '#d9849a', '#2b2321', '#c9a24a'];

function heartBurst(button) {
  const r = button.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < 12; i++) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.classList.add('doodle-heart');
    svg.innerHTML = `<path d="${HEART_PATH}"/>`;
    svg.style.stroke = HEART_COLORS[i % HEART_COLORS.length];
    svg.style.left = `${cx - 17}px`;
    svg.style.top = `${cy - 17}px`;
    if (i % 3 === 0) svg.style.fill = 'rgba(217, 132, 154, 0.35)';
    document.body.appendChild(svg);
    const angle = (-90 + (Math.random() - 0.5) * 150) * (Math.PI / 180);
    const dist = 70 + Math.random() * 90;
    const duration = 1100 + Math.random() * 500;
    svg.animate([
      { transform: 'translate(0, 0) scale(0.3) rotate(0deg)' },
      { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist - 30}px) scale(${0.8 + Math.random() * 0.6}) rotate(${(Math.random() - 0.5) * 70}deg)` }
    ], { duration, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)', fill: 'forwards' });
    // terlihat penuh dulu, baru memudar di akhir
    const fade = svg.animate([{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }], { duration, fill: 'forwards' });
    fade.onfinish = () => svg.remove();
  }
}

function renderBirthdays() {
  const s = state.settings;
  const p1 = s.person1 || 'Rijal';
  const p2 = s.person2 || 'Silva';
  const people = [
    { el: $('#bday-2'), name: p2, b: parseBirthday(s.birthdayPerson2 || '09-24', 9, 24),
      doa: `Doa tulus untuk ${p2}: semoga selalu bahagia, sehat, cantik, dan selalu bersama ${p1} selamanya.` },
    { el: $('#bday-1'), name: p1, b: parseBirthday(s.birthdayPerson1 || '11-22', 11, 22),
      doa: `Doa terbaik untuk ${p1}: semoga dimudahkan segala urusan, rezeki melimpah, dan jadi sosok terbaik untuk ${p2}.` }
  ];
  const now = new Date();
  for (const person of people) {
    const { el, b } = person;
    let next = new Date(now.getFullYear(), b.month - 1, b.day);
    if (midnight(next) < midnight(now)) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
    const left = daysBetween(now, next);
    const zodiac = getZodiac(b.month, b.day);
    $('[data-name]', el).textContent = person.name;
    $('[data-meta]', el).textContent = `${b.day} ${next.toLocaleDateString('id-ID', { month: 'long' })} · ${zodiac.name}`;
    el.classList.toggle('today', left === 0);
    const daysEl = $('[data-days]', el);
    daysEl.dataset.count = left;
    daysEl.nextElementSibling.textContent = left === 0 ? 'hari ini!' : 'hari lagi';
    if (daysEl.dataset.done) daysEl.textContent = left;
    $('[data-on]', el).textContent = left === 0 ? `Selamat ulang tahun, ${person.name}!` : fmtLong(next);
    $('[data-wish]', el).onclick = (e) => { heartBurst(e.currentTarget); showToast(person.doa, 4200); };
  }
}

/* --------------------------------------------------------------------------
   Album
   -------------------------------------------------------------------------- */
const CARD_TILT = [-1.6, 1.2, -0.6, 1.8, 0.8, -1.2, 1.5, -0.9];
const CARD_Y = [0, 10, 0, -6, 6, 0, -4, 8];

function newestFirst() {
  return [...state.memories].sort((a, b) => getMemoryTimestamp(b) - getMemoryTimestamp(a));
}

function renderTabs() {
  const cats = new Map();
  for (const m of state.memories) {
    const c = String(m.category || '').trim();
    if (c && !cats.has(c.toLowerCase())) cats.set(c.toLowerCase(), c.charAt(0).toUpperCase() + c.slice(1));
  }
  if (state.filter !== 'all' && !cats.has(state.filter)) state.filter = 'all';
  const tabs = [['all', 'Semua'], ...cats];
  $('#tabs').innerHTML = tabs.map(([key, label]) =>
    `<button data-filter="${escapeHtml(key)}" class="${key === state.filter ? 'on' : ''}">${escapeHtml(label)}</button>`).join('');
  $$('#tabs button').forEach((btn) => btn.addEventListener('click', () => setFilter(btn.dataset.filter)));
}

function setFilter(key) {
  if (key === state.filter) return;
  state.filter = key;
  $$('#tabs button').forEach((btn) => btn.classList.toggle('on', btn.dataset.filter === key));
  $$('#grid .card').forEach((card) => card.classList.add('out'));
  setTimeout(() => renderGrid(), 200);
}

function setView(view) {
  if (view === state.view) return;
  state.view = view;
  try { localStorage.setItem('v2_album_view', view); } catch (e) { /* tidak wajib */ }
  $$('#grid .card').forEach((card) => card.classList.add('out'));
  setTimeout(() => renderGrid(), 200);
}

function applyView() {
  const slide = state.view === 'slide';
  $('#grid').classList.toggle('slide', slide);
  $('#strip-foot').classList.toggle('grid-mode', !slide);
  $$('#view-toggle button').forEach((btn) => btn.classList.toggle('on', btn.dataset.view === state.view));
}

/** Garis progres, panah, dan pudar tepi mengikuti posisi geser. */
function updateStrip() {
  const grid = $('#grid');
  const foot = $('#strip-foot');
  if (!grid.classList.contains('slide')) return;
  const max = grid.scrollWidth - grid.clientWidth;
  foot.classList.toggle('no-overflow', max <= 2);
  const atStart = grid.scrollLeft <= 2;
  const atEnd = grid.scrollLeft >= max - 2;
  grid.style.setProperty('--fade-l', atStart ? '0px' : '36px');
  grid.style.setProperty('--fade-r', atEnd || max <= 2 ? '0px' : '36px');
  const thumb = $('#strip-thumb');
  thumb.style.width = `${(grid.clientWidth / grid.scrollWidth) * 100}%`;
  thumb.style.left = `${(grid.scrollLeft / grid.scrollWidth) * 100}%`;
  $('#strip-prev').disabled = atStart;
  $('#strip-next').disabled = atEnd;
}

function setupStrip() {
  const grid = $('#grid');
  let ticking = false;
  grid.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateStrip(); ticking = false; });
  }, { passive: true });
  addEventListener('resize', updateStrip);

  const step = () => {
    const card = $('.card', grid);
    return card ? (card.offsetWidth + parseFloat(getComputedStyle(grid).columnGap || 36)) * 2 : 500;
  };
  $('#strip-prev').addEventListener('click', () => grid.scrollBy({ left: -step(), behavior: 'smooth' }));
  $('#strip-next').addEventListener('click', () => grid.scrollBy({ left: step(), behavior: 'smooth' }));
  $$('#view-toggle button').forEach((btn) => btn.addEventListener('click', () => setView(btn.dataset.view)));
  state.stripDragged = enableDragScroll(grid, () => grid.classList.contains('slide'));
}

function renderGrid() {
  const grid = $('#grid');
  applyView();
  grid.scrollLeft = 0;
  const list = newestFirst().filter((m) => state.filter === 'all' || String(m.category || '').trim().toLowerCase() === state.filter);
  if (!list.length) {
    grid.innerHTML = '<p class="empty">Belum ada foto di sini.</p>';
    updateStrip();
    return;
  }
  grid.innerHTML = list.map((m, i) => {
    const imgs = getMemoryImages(m);
    const delay = (i % 4) * 0.08 + Math.floor(i / 4) * 0.06;
    return `<figure class="print card ${imgs.length > 1 ? 'stack' : ''}" data-id="${escapeHtml(m.id)}"
        style="--r:${CARD_TILT[i % CARD_TILT.length]}deg;--y:${CARD_Y[i % CARD_Y.length]}px;--d:${delay.toFixed(2)}s">
      <span class="pin p${i % 4}"></span>
      <img src="${escapeHtml(asset(imgs[0] || ''))}" alt="" loading="lazy" draggable="false">
      ${imgs.length > 1 ? `<span class="count">${imgs.length} foto</span>` : ''}
      <figcaption class="cap">${escapeHtml(m.title || 'Kenangan')}</figcaption>
      <small>${fmtShort(parseDay(m.date))}</small>
    </figure>`;
  }).join('');
  $$('#grid .card').forEach((card) => {
    card.addEventListener('revealed', () => setTimeout(() => card.classList.add('settled'), 900), { once: true });
    card.addEventListener('click', () => {
      if (state.stripDragged && state.stripDragged()) return; // barusan digeser, bukan klik
      const mem = state.memories.find((m) => m.id === card.dataset.id);
      if (mem) openLightbox(mem, 0, card);
    });
    watch(card);
  });
  requestAnimationFrame(updateStrip);
}

/* --------------------------------------------------------------------------
   Lightbox: foto membesar dari posisinya di album
   -------------------------------------------------------------------------- */
const lb = { mem: null, index: 0, count: 0, origin: null, busy: false };

function openLightbox(mem, index, origin) {
  const imgs = getMemoryImages(mem).map(asset);
  if (!imgs.length) return;
  Object.assign(lb, { mem, index, count: imgs.length, origin });
  $('#lb-track').innerHTML = imgs.map((url) => `<img src="${escapeHtml(url)}" alt="" draggable="false">`).join('');
  $('#lb-title').textContent = mem.title || '';
  $('#lb-date').textContent = fmtDate(parseDay(mem.date)) + (mem.time ? ` · ${mem.time.replace(':', '.')}` : '');
  $('#lb-caption').textContent = mem.caption || '';
  updateLightbox(false);

  const box = $('#lightbox');
  box.classList.add('open');
  box.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  const print = $('#lb-print');
  if (origin) {
    const from = origin.getBoundingClientRect();
    const to = print.getBoundingClientRect();
    origin.style.visibility = 'hidden';
    print.animate([
      { transformOrigin: '0 0', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}) rotate(-2deg)` },
      { transformOrigin: '0 0', transform: 'none' }
    ], { duration: 480, easing: 'cubic-bezier(0.2, 0.7, 0.2, 1)' });
  } else {
    print.animate([{ opacity: 0, transform: 'translateY(24px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'ease-out' });
  }
}

function closeLightbox() {
  const box = $('#lightbox');
  if (!box.classList.contains('open') || lb.busy) return;
  lb.busy = true;
  const print = $('#lb-print');
  const origin = lb.origin;
  const finish = (anim) => {
    box.classList.remove('open', 'closing');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (origin) origin.style.visibility = '';
    if (anim) anim.cancel();
    lb.busy = false;
  };
  box.classList.add('closing');
  const target = origin && origin.getBoundingClientRect();
  if (target && target.bottom > 0 && target.top < innerHeight) {
    const from = print.getBoundingClientRect();
    const anim = print.animate([
      { transformOrigin: '0 0', transform: 'none' },
      { transformOrigin: '0 0', transform: `translate(${target.left - from.left}px, ${target.top - from.top}px) scale(${target.width / from.width}) rotate(-1deg)` }
    ], { duration: 380, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' });
    anim.onfinish = () => finish(anim);
  } else {
    const anim = print.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    anim.onfinish = () => finish(anim);
  }
}

function updateLightbox(animate = true) {
  const track = $('#lb-track');
  track.style.transition = animate ? '' : 'none';
  track.style.transform = `translateX(-${lb.index * 100}%)`;
  const many = lb.count > 1;
  $('#lb-prev').hidden = !many || lb.index === 0;
  $('#lb-next').hidden = !many || lb.index === lb.count - 1;
  $('#lb-counter').hidden = !many;
  $('#lb-counter').textContent = `${lb.index + 1} / ${lb.count}`;
}

function stepLightbox(dir) {
  const next = lb.index + dir;
  if (next < 0 || next >= lb.count) return;
  lb.index = next;
  updateLightbox();
}

function setupLightbox() {
  $('#lb-backdrop').addEventListener('click', closeLightbox);
  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', () => stepLightbox(-1));
  $('#lb-next').addEventListener('click', () => stepLightbox(1));
  let downX = null;
  const photo = $('.lb-photo');
  photo.addEventListener('pointerdown', (e) => { downX = e.clientX; });
  photo.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#lightbox').classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowRight') stepLightbox(1);
    if (e.key === 'ArrowLeft') stepLightbox(-1);
  });
}

/* --------------------------------------------------------------------------
   Cerita: jemuran foto (urut dari yang paling lama) + kartu cerita
   -------------------------------------------------------------------------- */
const isPhone = () => matchMedia('(max-width: 860px)').matches;

/** Aturan timeline tetap sama dengan versi sekarang: kenangan ber-❤️, dari yang terlama, maksimal 10. */
function storyList() {
  const oldestFirst = [...state.memories].sort((a, b) => getMemoryTimestamp(a) - getMemoryTimestamp(b));
  const featured = oldestFirst.filter((m) => m.isFeatured !== false);
  return (featured.length ? featured : oldestFirst).slice(0, 10);
}

function renderLine() {
  const list = state.storyList;
  const track = $('#line-track');
  if (!list.length) { track.innerHTML = '<p class="empty">Belum ada cerita.</p>'; return; }

  // Di HP foto dibuat hampir selebar layar supaya tidak terlihat kecil; foto sebelah tetap mengintip.
  const narrow = isPhone();
  const itemW = narrow ? Math.round(Math.min(320, innerWidth * 0.74)) : 190;
  const step = itemW + (narrow ? 30 : 42);
  const pad = narrow ? 18 : Math.max(24, (innerWidth - 1080) / 2 + 24);

  // posisi tiap benda di tali: bendera bulan, foto, lalu tulisan "bersambung…"
  // (di HP bendera sedikit diselipkan di belakang foto supaya foto pertama utuh terlihat)
  const parts = [];
  let x = pad + (narrow ? 14 : 34);
  let lastMonth = '';
  list.forEach((mem, i) => {
    const d = parseDay(mem.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (key !== lastMonth) {
      parts.push({ type: 'flag', x, label: d.toLocaleDateString('id-ID', { month: 'short' }) });
      x += narrow ? 58 : 94;
      lastMonth = key;
    }
    parts.push({ type: 'item', x, i });
    x += step;
  });
  parts.push({ type: 'end', x: x + 6 });
  const x0 = pad;
  const x1 = x + 190;
  const W = x1 + pad;

  // tali melengkung (kurva kuadrat) di antara dua tiang
  const y0 = 34;
  const sag = narrow ? 34 : 58;
  const ropeY = (px) => {
    const t = Math.min(1, Math.max(0, (px - x0) / (x1 - x0)));
    return (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * (y0 + sag * 2) + t * t * y0;
  };
  const angleAt = (px) => Math.atan((ropeY(px + 10) - ropeY(px - 10)) / 20) * (180 / Math.PI);

  let html = `<svg class="rope" width="${W}" height="200" viewBox="0 0 ${W} 200"><path d="M${x0} ${y0} Q ${(x0 + x1) / 2} ${y0 + sag * 2} ${x1} ${y0}"/></svg>`
    + `<div class="post" style="left:${x0 - 6}px"></div><div class="post" style="left:${x1 - 5}px"></div>`;
  let flagN = 0;
  for (const part of parts) {
    if (part.type === 'flag') {
      const cx = part.x + 37;
      html += `<div class="flag f${flagN++ % 4}" style="left:${part.x}px;top:${ropeY(cx) - 1}px;transform:rotate(${angleAt(cx).toFixed(1)}deg)">`
        + `<div>${escapeHtml(part.label)}</div></div>`;
    } else if (part.type === 'end') {
      html += `<div class="line-end" style="left:${part.x}px;top:${ropeY(part.x + 60)}px;transform:rotate(${angleAt(part.x + 60).toFixed(1)}deg)">bersambung…</div>`;
    } else {
      const mem = list[part.i];
      const imgs = getMemoryImages(mem);
      const cx = part.x + itemW / 2;
      const tilt = angleAt(cx) + (part.i % 2 ? 1.5 : -1.5);
      const d = parseDay(mem.date);
      html += `<div class="hang" data-i="${part.i}" style="left:${part.x}px;top:${ropeY(cx) + 4}px;--a:${tilt.toFixed(1)}deg;--dur:${(4 + (part.i % 3) * 0.7).toFixed(1)}s;--delay:-${(part.i * 0.9).toFixed(1)}s">
        <span class="peg"></span>
        <figure class="print">
          <img src="${escapeHtml(asset(imgs[0] || ''))}" alt="" loading="lazy" draggable="false">
          ${imgs.length > 1 ? `<span class="many">${imgs.length} foto</span>` : ''}
          <figcaption class="when">${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</figcaption>
        </figure>
        <div class="hang-tag">${escapeHtml(mem.title || 'Kenangan')}</div>
      </div>`;
    }
  }
  track.style.width = `${W}px`;
  // tinggi: tali paling turun (y0 + sag) + foto persegi + tanggal + label, sisa untuk ayunan & foto aktif yang membesar
  track.style.height = `${y0 + sag + itemW + (narrow ? 150 : 160)}px`;
  track.style.setProperty('--hang-w', `${itemW}px`);
  track.innerHTML = html;
  $$('.hang', track).forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === state.storyIndex));
}

function centerHang(i, smooth = true) {
  const el = $(`.hang[data-i="${i}"]`);
  if (!el) return;
  const box = $('#line-scroll');
  const max = box.scrollWidth - box.clientWidth;
  const left = Math.max(0, Math.min(max, el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2));
  if (Math.abs(left - box.scrollLeft) < 2) return;
  // Geseran ini dari kode: catat tujuannya supaya tidak dianggap geseran pengguna sampai tiba.
  state.lineTarget = left;
  clearTimeout(state.lineTargetTimer);
  state.lineTargetTimer = setTimeout(() => { state.lineTarget = null; }, 3000);
  box.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
}

/**
 * Saat tali digeser pengguna, kartu cerita ikut berganti ke foto yang sedang di tengah.
 * Titik bacanya ikut bergeser: di ujung kiri memilih foto pertama, di ujung kanan foto terakhir.
 */
function pickStoryFromLine() {
  const box = $('#line-scroll');
  const max = box.scrollWidth - box.clientWidth;
  const ratio = max > 0 ? box.scrollLeft / max : 0.5;
  const reading = box.scrollLeft + box.clientWidth * ratio;
  let best = null;
  let bestDistance = Infinity;
  for (const el of $$('.hang')) {
    const distance = Math.abs(el.offsetLeft + el.offsetWidth / 2 - reading);
    if (distance < bestDistance) { bestDistance = distance; best = el; }
  }
  if (best && Number(best.dataset.i) !== state.storyIndex) selectStory(Number(best.dataset.i), { center: false });
}

function setStoryPhoto(n, fade = true) {
  const mem = state.storyList[state.storyIndex];
  if (!mem) return;
  const imgs = getMemoryImages(mem).map(asset);
  state.storyPhoto = Math.max(0, Math.min(imgs.length - 1, n));
  const img = $('#story-img');
  img.src = imgs[state.storyPhoto] || '';
  $$('#story-thumbs button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === state.storyPhoto));
  if (fade) {
    img.classList.remove('story-img-fade');
    void img.offsetWidth;
    img.classList.add('story-img-fade');
  }
}

function selectStory(i, { center = true, animate = true } = {}) {
  const list = state.storyList;
  if (!list.length) return;
  state.storyIndex = Math.max(0, Math.min(list.length - 1, i));
  const mem = list[state.storyIndex];
  const imgs = getMemoryImages(mem).map(asset);
  const d = parseDay(mem.date);

  $('#story-day').textContent = pad(d.getDate());
  $('#story-when').innerHTML = `<strong>${d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</strong>`
    + `${d.toLocaleDateString('id-ID', { weekday: 'long' })}${mem.time ? ` · jam ${escapeHtml(mem.time.replace(':', '.'))}` : ''}`;
  $('#story-title').textContent = mem.title || '';
  $('#story-cat').textContent = String(mem.category || '').toLowerCase();
  $('#story-caption').textContent = mem.caption || '';
  $('#story-count').textContent = `${state.storyIndex + 1} / ${list.length}`;
  $('#story-prev').disabled = state.storyIndex === 0;
  $('#story-next').disabled = state.storyIndex === list.length - 1;

  $('#story-thumbs').innerHTML = imgs.length > 1
    ? imgs.map((url, n) => `<button data-n="${n}" aria-label="Foto ${n + 1}"><img src="${escapeHtml(url)}" alt="" loading="lazy"></button>`).join('')
    : '';
  $('#story-card').classList.toggle('single', imgs.length < 2);
  // Di HP kartu tidak punya foto besar (fotonya di jemuran), jadi thumbnail langsung membuka foto penuh.
  $$('#story-thumbs button').forEach((b) => b.addEventListener('click', () => {
    if (isPhone()) openLightbox(mem, Number(b.dataset.n), b);
    else setStoryPhoto(Number(b.dataset.n));
  }));
  setStoryPhoto(0, false);

  $$('.hang').forEach((el) => el.classList.toggle('on', Number(el.dataset.i) === state.storyIndex));
  if (animate) {
    for (const el of [$('#story-photo'), $('#story-text')]) {
      el.classList.remove('swap-in');
      void el.offsetWidth;
      el.classList.add('swap-in');
    }
  }
  if (center) centerHang(state.storyIndex);
}

function renderStory() {
  state.storyList = storyList();
  state.storyIndex = Math.min(state.storyIndex || 0, Math.max(0, state.storyList.length - 1));
  renderLine();
  selectStory(state.storyIndex, { center: false, animate: false });
}

function setupStory() {
  const box = $('#line-scroll');
  const dragged = enableDragScroll(box);
  let settle = null;
  box.addEventListener('scroll', () => {
    if (state.lineTarget != null) {
      // geseran dari kode masih berjalan; catatan dihapus setelah tali diam sebentar
      clearTimeout(state.lineTargetSettle);
      state.lineTargetSettle = setTimeout(() => { state.lineTarget = null; }, 220);
      return;
    }
    clearTimeout(settle);
    settle = setTimeout(pickStoryFromLine, 140);
  }, { passive: true });
  // begitu pengguna menyentuh tali, geseran berikutnya miliknya
  for (const type of ['pointerdown', 'touchstart', 'wheel']) {
    box.addEventListener(type, () => { state.lineTarget = null; }, { passive: true });
  }
  $('#line-track').addEventListener('click', (e) => {
    const hang = e.target.closest('.hang');
    if (!hang || dragged()) return;
    const i = Number(hang.dataset.i);
    if (i === state.storyIndex) { // foto yang sudah dipilih: buka penuh
      const mem = state.storyList[i];
      if (mem) openLightbox(mem, 0, $('.print', hang));
      return;
    }
    selectStory(i);
    // kalau kartu cerita masih di bawah layar, gulir pelan supaya perubahannya terlihat
    const card = $('#story-card').getBoundingClientRect();
    if (card.top > innerHeight - 160) scrollBy({ top: card.top - innerHeight + Math.min(card.height, innerHeight - 120) + 24, behavior: 'smooth' });
  });
  $('#story-prev').addEventListener('click', () => selectStory(state.storyIndex - 1));
  $('#story-next').addEventListener('click', () => selectStory(state.storyIndex + 1));
  $('#story-photo').addEventListener('click', () => {
    const mem = state.storyList[state.storyIndex];
    if (mem) openLightbox(mem, state.storyPhoto || 0, $('#story-photo'));
  });
  let resizeTimer = null;
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastWidth) return; // HP: address bar naik-turun tidak perlu render ulang
    lastWidth = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { renderLine(); centerHang(state.storyIndex, false); }, 200);
  });
}

/** Geser dengan mouse (di HP sudah bisa swipe bawaan). Mengembalikan fungsi "barusan di-drag?" untuk mengabaikan klik. */
function enableDragScroll(el, isActive = () => true) {
  let drag = null;
  let blockUntil = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || !isActive()) return;
    drag = { x: e.clientX, left: el.scrollLeft, moved: false, id: e.pointerId };
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 6) {
      drag.moved = true;
      el.classList.add('dragging');
      el.setPointerCapture(drag.id);
    }
    if (drag.moved) el.scrollLeft = drag.left - dx;
  });
  const end = () => {
    if (!drag) return;
    if (drag.moved) blockUntil = performance.now() + 250;
    el.classList.remove('dragging');
    drag = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return () => performance.now() < blockUntil;
}

/* --------------------------------------------------------------------------
   Surat: amplop dibuka, kertas dibentangkan
   -------------------------------------------------------------------------- */
function letterText(i) {
  const s = state.settings;
  return i === 0 ? (s.letterMessage || '') : (s.letterMessage2 || '');
}

function renderLetterTabs() {
  const [a, b] = $$('#letter-tabs button');
  a.textContent = `Dari ${state.settings.person1 || 'Rijal'}`;
  b.textContent = `Dari ${state.settings.person2 || 'Silva'}`;
}

const LETTER_CLAMP = 480; // 12 baris kertas
const LETTER_FULL_MAX = 720; // surat sampai 18 baris langsung tampil utuh

function showLetter(i, startDelay = 0) {
  state.letterIndex = i;
  $$('#letter-tabs button').forEach((btn) => btn.classList.toggle('on', Number(btn.dataset.letter) === i));
  const body = $('#letter-body');
  const text = letterText(i).trim();
  const writer = i === 0 ? (state.settings.person1 || 'Rijal') : (state.settings.person2 || 'Silva');
  const paragraphs = text ? text.split(/\n\s*\n/) : [`Surat dari ${writer} masih kosong.`];
  const delay = (n) => (startDelay + n * 0.1).toFixed(2);
  body.innerHTML = paragraphs.map((p, n) => `<p style="animation-delay:${delay(n)}s">${escapeHtml(p.trim())}</p>`).join('')
    + (text ? `<p class="sign" style="animation-delay:${delay(paragraphs.length)}s">~ ${escapeHtml(writer)}</p>` : '');
  body.style.maxHeight = '';
  body.scrollTop = 0;
  const tooLong = body.scrollHeight > LETTER_FULL_MAX + 8;
  body.classList.toggle('clamped', tooLong);
  $('#letter-more').hidden = !tooLong;
  $('#letter-more').textContent = 'Baca lanjutannya';
}

function toggleLetterLength() {
  const body = $('#letter-body');
  const more = $('#letter-more');
  const expanding = body.classList.contains('clamped');
  body.scrollTop = 0; // Ctrl+F bisa menggulung isi yang dipendekkan
  const done = (fn) => body.addEventListener('transitionend', function end(e) {
    if (e.propertyName !== 'max-height') return;
    body.removeEventListener('transitionend', end);
    fn();
  });
  if (expanding) {
    body.style.maxHeight = `${LETTER_CLAMP}px`;
    body.classList.remove('clamped');
    void body.offsetHeight;
    body.style.maxHeight = `${body.scrollHeight}px`;
    done(() => { body.style.maxHeight = 'none'; });
    more.textContent = 'Tutup sebagian';
  } else {
    body.style.maxHeight = `${body.scrollHeight}px`;
    void body.offsetHeight;
    body.style.maxHeight = `${LETTER_CLAMP}px`;
    done(() => { body.classList.add('clamped'); body.style.maxHeight = ''; });
    more.textContent = 'Baca lanjutannya';
    const top = $('#letter').getBoundingClientRect().top;
    if (top < 0) scrollBy({ top: top - 90, behavior: 'smooth' });
  }
}

function setupLetter() {
  const stage = $('#letter-stage');
  const envelope = $('#envelope');
  const wrap = $('#letter-wrap');
  const letter = $('#letter');
  const hint = $('.envelope-hint');
  const ease = 'cubic-bezier(0.2, 0.7, 0.2, 1)';
  let busy = false;

  envelope.addEventListener('click', () => {
    if (busy || envelope.classList.contains('open')) return;
    busy = true;
    playPaperRustle();
    envelope.classList.add('open'); // tutup terangkat, segel lepas, kertas naik
    hint.classList.add('hide');

    setTimeout(() => {
      // Amplop dilepas dari alur tapi tetap di tempatnya; surat menempati posisinya.
      const paper = $('.env-paper', envelope).getBoundingClientRect();
      const env = envelope.getBoundingClientRect();
      const box = stage.getBoundingClientRect();
      envelope.classList.add('floating');
      envelope.style.left = `${env.left - box.left}px`;
      envelope.style.top = `${env.top - box.top}px`;
      hint.style.display = 'none';
      wrap.hidden = false;
      showLetter(state.letterIndex, 0.35);

      // Surat membesar tepat dari kertas yang keluar dari amplop
      const to = letter.getBoundingClientRect();
      letter.animate([
        { transformOrigin: '0 0', transform: `translate(${paper.left - to.left}px, ${paper.top - to.top}px) scale(${paper.width / to.width})` },
        { transformOrigin: '0 0', transform: 'none' }
      ], { duration: 650, easing: ease });
      $('#letter-tabs').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 400, fill: 'backwards' });
      $('.letter-foot').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 500, fill: 'backwards' });
      const fade = envelope.animate([
        { opacity: 1, transform: 'rotate(-2deg)' },
        { opacity: 0, transform: 'translateY(40px) rotate(-2deg) scale(0.95)' }
      ], { duration: 450, easing: 'ease-in', fill: 'forwards' });
      fade.onfinish = () => { envelope.style.visibility = 'hidden'; busy = false; };
    }, 900);
  });

  $('#letter-close').addEventListener('click', () => {
    if (busy) return;
    busy = true;
    const fold = letter.animate([
      { opacity: 1, transform: 'none' },
      { opacity: 0, transform: 'translateY(18px) scale(0.97)' }
    ], { duration: 260, easing: 'ease-in', fill: 'forwards' });
    fold.onfinish = () => {
      wrap.hidden = true;
      fold.cancel();
      // Amplop kembali tertutup tanpa memutar ulang animasi bukanya
      envelope.getAnimations().forEach((a) => a.cancel());
      envelope.classList.add('no-anim');
      envelope.classList.remove('open', 'floating');
      envelope.style.left = envelope.style.top = envelope.style.visibility = '';
      void envelope.offsetWidth;
      envelope.classList.remove('no-anim');
      hint.style.display = '';
      hint.classList.remove('hide');
      envelope.animate([
        { opacity: 0, transform: 'translateY(14px) rotate(-2deg)' },
        { opacity: 1, transform: 'rotate(-2deg)' }
      ], { duration: 380, easing: ease });
      const top = stage.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.6) stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      busy = false;
    };
  });

  $$('#letter-tabs button').forEach((btn) => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.letter);
    if (i === state.letterIndex || busy) return;
    const body = $('#letter-body');
    body.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).onfinish = (e) => {
      showLetter(i);
      e.target.cancel();
    };
  }));

  $('#letter-more').addEventListener('click', toggleLetterLength);
}

/* --------------------------------------------------------------------------
   Tema: dipilih dari tombol palet. Pilihan ditulis ke link (?tema=...) supaya
   link yang dikirim langsung menampilkan tema yang sama, dan diingat di perangkat ini.
   -------------------------------------------------------------------------- */
const TEMA_BAR = { pink: '#f8dce2', warna: '#f6d3da', gelap: '#1d4436', krem: '#f4ede3' };

function applyTema(tema, save) {
  if (!TEMA_BAR[tema]) tema = 'pink';
  document.documentElement.dataset.tema = tema;
  $('meta[name="theme-color"]').setAttribute('content', TEMA_BAR[tema]); // warna bilah alamat di HP
  $$('#tema-pop button').forEach((b) => b.classList.toggle('on', b.dataset.tema === tema));
  if (!save) return;
  try { localStorage.setItem('v2_tema', tema); } catch (e) { /* tidak wajib */ }
  const url = new URL(location.href);
  url.searchParams.set('tema', tema);
  history.replaceState(null, '', url);
}

function setupTema() {
  const btn = $('#btn-tema');
  const pop = $('#tema-pop');
  const fromLink = new URLSearchParams(location.search).get('tema');
  applyTema(document.documentElement.dataset.tema, Boolean(fromLink && TEMA_BAR[fromLink]));
  const toggle = (open) => {
    pop.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(pop.hidden); });
  $$('button', pop).forEach((b) => b.addEventListener('click', () => {
    applyTema(b.dataset.tema, true);
    setTimeout(() => toggle(false), 180);
  }));
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { toggle(false); btn.focus(); } });
}

/* --------------------------------------------------------------------------
   Navbar
   -------------------------------------------------------------------------- */
function setupNav() {
  const nav = $('#nav');
  const links = $$('.nav-links a');
  const spy = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const link = links.find((a) => a.getAttribute('href') === `#${entry.target.id}`);
      if (entry.isIntersecting) links.forEach((a) => a.classList.toggle('active', a === link));
      else if (link) link.classList.remove('active');
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('main section').forEach((s) => spy.observe(s));

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      nav.classList.toggle('scrolled', scrollY > 8);
      ticking = false;
    });
  }, { passive: true });
}

/* --------------------------------------------------------------------------
   Render & data
   -------------------------------------------------------------------------- */
function memoriesSignature(list) {
  return list.map((m) => [m.id, m.title, m.date, m.time, m.category, m.isFeatured, (m.caption || '').length, getMemoryImages(m).length].join('~')).join('|');
}

function renderMemories() {
  state.memoriesSig = memoriesSignature(state.memories);
  renderBook();
  renderTabs();
  renderGrid();
  renderStory();
}

function renderSettings() {
  state.settingsSig = JSON.stringify(state.settings);
  renderNames();
  renderTime();
  renderBirthdays();
  renderLetterTabs();
  if (!$('#letter-wrap').hidden) showLetter(state.letterIndex);
}

function init() {
  setupTema();
  $$('.reveal').forEach(watch);
  renderSettings();
  renderMemories();
  tickClock();
  setInterval(tickClock, 1000);
  setInterval(() => { renderTime(); renderBirthdays(); }, 60000);

  // angka hari menuju ulang tahun menghitung naik saat pertama terlihat
  $$('.ticket-wrap').forEach((card) => {
    card.addEventListener('revealed', () => {
      const el = $('[data-days]', card);
      countUp(el, Number(el.dataset.count), 900);
      setTimeout(() => { el.dataset.done = '1'; }, 950);
    }, { once: true });
    watch(card);
  });
  $$('.doodle').forEach(watch);
  tornEdges($('#kraft-sheet'));

  setupCalendar();
  setupBook();
  setupStrip();
  setupStory();
  setupLightbox();
  setupLetter();
  setupNav();
  setupAudioSynth($('#btn-audio-toggle'), $('#bg-music'), () => ({
    ...state.settings,
    musicUrl: asset(state.settings.musicUrl || 'assets/audio/music.mp3')
  }));

  setupCloudListeners({
    onMemoriesUpdate: (list) => {
      if (memoriesSignature(list) === state.memoriesSig) return;
      state.memories = list;
      renderMemories();
    },
    onSettingsUpdate: (settings) => {
      if (!settings || JSON.stringify(settings) === state.settingsSig) return;
      const prevMusic = state.settings.musicUrl;
      state.settings = settings;
      renderSettings();
      renderBook();
      if (settings.musicUrl && settings.musicUrl !== prevMusic) onMusicUrlChanged(asset(settings.musicUrl));
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
