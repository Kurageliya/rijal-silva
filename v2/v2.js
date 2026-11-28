/**
 * Rijal & Silva — v2
 * Tampilan baru di atas data & logika yang sama dengan versi sekarang
 * (Firestore, halaman buku pilihan, hitungan waktu, ulang tahun, musik).
 */
import { getCoupleSettings, getMemoriesList, setupCloudListeners, checkEditorAccess, saveScrapbookCustomPages } from '../js/repositories/storageRepository.js';
import { calculateTimeUnits } from '../js/services/counterService.js';
import { parseBirthday, getZodiac } from '../js/services/reminderService.js';
import { setupAudioSynth, onMusicUrlChanged } from '../js/services/audioService.js';
import { getEffectiveBookItems, getStickerForIndex, playPaperRustle } from '../js/modules/book.js';
import { getMemoryImages } from '../js/modules/timeline.js';
import { escapeHtml, getMemoryTimestamp } from '../js/utils/helpers.js';
import { showToast } from '../js/utils/toast.js';
// ?v= dinaikkan bersama v2.js setiap editor.js berubah (supaya HP tidak memakai versi lama dari cache)
import { openMemoryForm, openSettingsForm, openBookPicker, confirmDelete, toggleFeatured, openKapsulForm, openNinjaForm, openNontonForm } from './editor.js?v=25';
import { setupKapsul, renderKapsul, kapsulItems, dayKey, openBirthdayLetter } from './kapsul.js?v=25';
import { setupUltah, renderHariH, mustBlowFirst, nudgeCake } from './ultah.js?v=25';
import { setupNinja, renderNinja, ninjaItems, FINAL_ID } from './ninja.js?v=25';
import { setupNonton, renderNonton, nontonAbs } from './nonton.js?v=25';
import { drawScene, sceneFor } from './gambar.js?v=25';

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
/**
 * Path aset di data ditulis relatif ke akar situs (mis. "assets/images/x.jpeg").
 * Akar situs dihitung dari lokasi file ini (v2/v2.js), jadi benar baik halamannya di akar maupun di subfolder.
 */
const SITE_ROOT = new URL('../', import.meta.url);
const asset = (url) => (!url || /^(data:|https?:|blob:)/.test(url)) ? url : new URL(String(url).replace(/^\.?\//, ''), SITE_ROOT).href;
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
  settingsSig: '',
  doa: {} // doa ulang tahun per orang ('1' / '2'), dipakai juga setelah lilin ditiup
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
  $('#hero-day').textContent = dayN; // sticky note "hari ke-N"
  $('#since-kicker').textContent = `sejak ${fmtDate(start)}`;

  state.dayN = dayN;
  const built = Number($('#cal-pages').dataset.n || 0);
  if (built !== dayN && !tearing) buildCalendar(false); // pertama kali, atau lewat tengah malam

  $('#since').innerHTML = `<strong>Sejak ${fmtLong(start)}</strong>, jam ${pad(start.getHours())}.${pad(start.getMinutes())}. Sampai detik ini sudah:`;
  renderTrail(start, now, dayN);
}

/**
 * Semua target: hari ke-100 sampai 1000, lalu tiap 500 hari, angka kembar (111, 222, …, 1111, …, 11111, …),
 * dan tiap tahun jadian. Daftarnya selalu dibuat sampai jauh melewati hari ini (dayN), jadi berapa pun
 * lamanya (tanggal jadian diisi 1900 sekalipun) tetap ada target berikutnya.
 */
function milestones(start, dayN = 1) {
  const base = midnight(start).getTime();
  const last = Math.max(20000, dayN + 3000);
  const days = new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 111, 222, 333, 444, 555, 666, 777, 888, 999]);
  for (let n = 1500; n <= last; n += 500) days.add(n);
  for (const twin of [1111, 11111]) for (let k = 1; k <= 9 && twin * k <= last; k++) days.add(twin * k);
  const list = [...days].map((n) => ({ label: `Hari ke-${n}`, date: new Date(base + (n - 1) * DAY) }));
  const years = Math.max(60, Math.ceil(last / 365));
  for (let y = 1; y <= years; y++) list.push({ label: `${y} tahun`, date: addMonths(start, y * 12) });
  return list.sort((a, b) => a.date - b.date);
}

/** Jalur hari: target terakhir yang sudah lewat, jarum "hari ini", lalu tiga target berikutnya. */
function renderTrail(start, now, dayN) {
  const today = midnight(now);
  const all = milestones(start, dayN);
  const passed = all.filter((m) => midnight(m.date) < today);
  const done = passed.length ? passed[passed.length - 1] : { label: 'Hari pertama', date: midnight(start) };
  const next = all.filter((m) => midnight(m.date) >= today).slice(0, 3);
  if (!next.length) return; // tidak mungkin terjadi lagi, tapi jangan sampai menghentikan bagian lain
  const span = midnight(next[0].date) - midnight(done.date);
  const f = span > 0 ? Math.min(1, Math.max(0, (today - midnight(done.date)) / span)) : 1;
  // target yang punya gulungan tersegel ditempeli kertas segel kecil
  const sealed = new Set(kapsulItems().map((it) => it.openDate));
  const seal = (m) => (sealed.has(dayKey(m.date)) ? '<i class="trail-segel" title="ada gulungan tersegel untuk hari ini">封</i>' : '');
  const stop = (m, cls, em) => `<li class="${cls}"><span class="trail-dot">${cls === 'done' ? '♡' : ''}${seal(m)}</span>`
    + `<b>${m.label}</b><small>${fmtShort(m.date)}</small><em>${em}</em></li>`;
  const html = stop(done, 'done', 'sudah lewat')
    + next.map((m) => {
      const left = daysBetween(now, m.date);
      return stop(m, 'next', left === 0 ? 'hari ini!' : `${left} hari lagi`);
    }).join('')
    + `<li class="trail-now" aria-hidden="true"><span>hari ini · ke-${dayN}</span><i></i></li>`;
  const list = $('#trail-stops');
  list.style.setProperty('--f', f.toFixed(3));
  if (html !== list.dataset.html) { // berubah sekali sehari
    list.dataset.html = html;
    list.innerHTML = html;
  }
}

/* Kalender sobek: beberapa hari terakhir tersobek satu per satu sampai hari ini */
let tearing = false;

function calendarPage(n) {
  const d = new Date(midnight(anniversary()).getTime() + (n - 1) * DAY);
  return `<div class="cal-page"><small>hari ke</small><b class="d${String(n).length}">${n}</b>` // d4/d5: angka mengecil
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

/* Jam kertas: kartu angka yang membalik (separuh atas jatuh) tiap kali nilainya berubah */
const FLIP_UNITS = [['years', 'tahun'], ['months', 'bulan'], ['days', 'hari'], null, ['hours', 'jam'], ['minutes', 'menit'], ['seconds', 'detik']];
const FLIP_TILT = [-1.5, 1, -0.5, 0, 1.2, -1, 0.6];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let flipVisible = false;

function buildFlipclock() {
  const box = $('#flipclock');
  box.innerHTML = FLIP_UNITS.map((u, i) => (u
    ? `<div class="flip" data-u="${u[0]}" style="--tilt:${FLIP_TILT[i]}deg"><div class="flip-card">`
      + '<span class="f-top"><i></i></span><span class="f-bot"><i></i></span><span class="f-leaf-top"><i></i></span><span class="f-leaf-bot"><i></i></span>'
      + `</div><small>${u[1]}</small></div>`
    : '<span class="flip-and">dan</span>')).join('');
  new IntersectionObserver(([entry]) => { flipVisible = entry.isIntersecting; }).observe(box);
}

function setFlip(el, value) {
  const card = $('.flip-card', el);
  if (card.dataset.v === value) return;
  const [top, bot, leafTop, leafBot] = $$('i', card);
  card.classList.toggle('wide', value.length > 2);
  // pertama kali, tab tidak terlihat, atau jam di luar layar: langsung ganti tanpa animasi
  if (card.dataset.v === undefined || document.hidden || !flipVisible || reduceMotion) {
    card.dataset.v = value;
    top.textContent = bot.textContent = leafTop.textContent = leafBot.textContent = value;
    return;
  }
  card.dataset.v = value;
  top.textContent = value; // separuh atas baru sudah menunggu di belakang
  leafBot.textContent = value; // sisi belakang lembar yang jatuh
  card.classList.remove('go');
  void card.offsetWidth;
  card.classList.add('go');
  clearTimeout(card.flipTimer);
  card.flipTimer = setTimeout(() => {
    bot.textContent = value;
    leafTop.textContent = value;
    card.classList.remove('go');
  }, 540);
}

function tickClock() {
  const u = calculateTimeUnits(anniversary(), new Date());
  for (const el of $$('#flipclock .flip')) {
    const key = el.dataset.u;
    const n = Number(u[key]);
    setFlip(el, ['hours', 'minutes', 'seconds'].includes(key) ? pad(n) : String(n));
  }
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
    { n: '2', el: $('#bday-2'), name: p2, b: parseBirthday(s.birthdayPerson2 || '09-24', 9, 24),
      doa: `Doa tulus untuk ${p2}: semoga selalu bahagia, sehat, cantik, dan selalu bersama ${p1} selamanya.` },
    { n: '1', el: $('#bday-1'), name: p1, b: parseBirthday(s.birthdayPerson1 || '11-22', 11, 22),
      doa: `Doa terbaik untuk ${p1}: semoga dimudahkan segala urusan, rezeki melimpah, dan jadi sosok terbaik untuk ${p2}.` }
  ];
  const now = new Date();
  // tes di localhost: ?harih=1 / ?harih=2 memaksa hari ini jadi ulang tahun orang itu
  const forced = location.hostname === 'localhost' ? new URLSearchParams(location.search).get('harih') : null;
  for (const person of people) {
    const { el, b } = person;
    let next = new Date(now.getFullYear(), b.month - 1, b.day);
    if (midnight(next) < midnight(now)) next = new Date(now.getFullYear() + 1, b.month - 1, b.day);
    const left = forced === person.n ? 0 : daysBetween(now, next);
    person.today = left === 0;
    state.doa[person.n] = person.doa;
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
  // hari-H: kue berlilin di karcisnya, sapaan di atas halaman, dan judul tab
  const todays = renderHariH(people);
  document.title = todays.length ? `Selamat ulang tahun, ${todays.map((p) => p.name).join(' & ')}! ♡` : `${p1} & ${p2}`;
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
  setLightboxFull(false, false);
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
  updateLightboxActions();
}

function stepLightbox(dir) {
  const next = lb.index + dir;
  if (next < 0 || next >= lb.count) return;
  lb.index = next;
  updateLightbox();
}

const isLightboxFull = () => $('#lightbox').classList.contains('full');

/** Foto penuh layar (seperti di versi pertama: ketuk foto untuk melihatnya besar). */
function setLightboxFull(on, animate = true) {
  if (isLightboxFull() === on) return;
  $('#lightbox').classList.toggle('full', on);
  const zoom = $('#lb-zoom');
  zoom.innerHTML = `<i class="fa-solid fa-${on ? 'compress' : 'expand'}"></i>`;
  zoom.setAttribute('aria-label', on ? 'Kembali ke cerita' : 'Lihat foto penuh');
  updateLightbox(false); // ukuran foto berubah: geser ke foto yang sama tanpa animasi
  if (animate) $('#lb-print').animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' });
}

function setupLightbox() {
  $('#lb-backdrop').addEventListener('click', closeLightbox);
  // di foto penuh, X kembali ke kotak cerita dulu
  $('#lb-close').addEventListener('click', () => (isLightboxFull() ? setLightboxFull(false) : closeLightbox()));
  $('#lb-prev').addEventListener('click', () => stepLightbox(-1));
  $('#lb-next').addEventListener('click', () => stepLightbox(1));
  $('#lb-zoom').addEventListener('click', () => setLightboxFull(!isLightboxFull()));
  let downX = null;
  const photo = $('.lb-photo');
  photo.addEventListener('pointerdown', (e) => { downX = e.clientX; });
  photo.addEventListener('pointercancel', () => { downX = null; });
  photo.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    if (Math.abs(dx) > 40) stepLightbox(dx < 0 ? 1 : -1);
    else if (Math.abs(dx) < 8 && !e.target.closest('button')) setLightboxFull(!isLightboxFull()); // ketuk foto
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#lightbox').classList.contains('open') || $('#editor-dialog').open) return; // Esc di form edit hanya menutup form
    if (e.key === 'Escape') { if (isLightboxFull()) setLightboxFull(false); else closeLightbox(); return; }
    if (e.key === 'ArrowRight') stepLightbox(1);
    if (e.key === 'ArrowLeft') stepLightbox(-1);
  });
}

/** Tombol edit di bawah foto penuh (hanya tampil untuk editor). */
function updateLightboxActions() {
  const btn = $('#lb-actions [data-act="feature"]');
  if (!btn || !lb.mem) return;
  const featured = lb.mem.isFeatured !== false;
  btn.classList.toggle('on', featured);
  btn.innerHTML = featured ? '<i class="fa-solid fa-heart"></i> Di Cerita' : '<i class="fa-regular fa-heart"></i> Tampilkan di Cerita';
}

/* --------------------------------------------------------------------------
   Mode edit: tombol-tombolnya hanya terlihat setelah masuk sebagai editor
   (body.can-edit). Formnya ada di editor.js.
   -------------------------------------------------------------------------- */
function setupEditor() {
  const guard = (fn) => () => { if (editor.ok) fn(); };
  $('#btn-settings').addEventListener('click', guard(() => openSettingsForm(state.settings)));
  $('#btn-edit-letter').addEventListener('click', guard(() => openSettingsForm(state.settings, 'letters')));
  $('#btn-add-memory').addEventListener('click', guard(() => openMemoryForm(null, state.memories)));
  $('#btn-book-pick').addEventListener('click', guard(() => openBookPicker(state.memories, state.settings)));
  $('#lb-actions').addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]');
    if (!act || !editor.ok || !lb.mem) return;
    const mem = state.memories.find((m) => m.id === lb.mem.id) || lb.mem;
    if (act.dataset.act === 'edit') {
      closeLightbox();
      openMemoryForm(mem, state.memories);
    } else if (act.dataset.act === 'feature') {
      if (await toggleFeatured(mem)) {
        lb.mem = { ...mem, isFeatured: mem.isFeatured === false };
        updateLightboxActions();
      }
    } else if (act.dataset.act === 'delete') {
      confirmDelete(mem, () => closeLightbox());
    }
  });
}

/* --------------------------------------------------------------------------
   Cerita: jalan cerita (urut dari yang paling lama).
   Tiap kenangan: foto diselipkan di saku kertas (ketuk = tarik keluar & foto lain ikut terbuka,
   ketuk fotonya lagi = lihat penuh, ketuk sakunya = simpan lagi) + kartu catatan bergaris.
   Garis putus-putus yang menghubungkan saku tergambar mengikuti guliran.
   -------------------------------------------------------------------------- */
const isPhone = () => matchMedia('(max-width: 860px)').matches;

/** batas jumlah kenangan di Cerita (dulu 10, jadi 50 sejak 2026-11-27). Teks di form edit (editor.js) ikut menyebut angka ini. */
const STORY_MAX = 50;

/** Isi Cerita: kenangan ber-❤️, dari yang terlama, maksimal STORY_MAX. */
function storyList() {
  const oldestFirst = [...state.memories].sort((a, b) => getMemoryTimestamp(a) - getMemoryTimestamp(b));
  const featured = oldestFirst.filter((m) => m.isFeatured !== false);
  return (featured.length ? featured : oldestFirst).slice(0, STORY_MAX);
}

const TAPES = ['yellow', 'pink', 'green'];

function renderJourney() {
  const list = storyList();
  state.storyList = list;
  const box = $('#journey-stops');
  if (!list.length) {
    box.innerHTML = '<p class="empty-journey">Belum ada cerita.</p>';
    $('#journey-path').innerHTML = '';
    return;
  }
  let lastMonth = '';
  let flagN = 0;
  box.innerHTML = list.map((mem, i) => {
    const imgs = getMemoryImages(mem).map(asset);
    const d = parseDay(mem.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const flag = key !== lastMonth
      ? `<span class="month-flag f${flagN++ % 4}">${escapeHtml(d.toLocaleDateString('id-ID', { month: 'short' }))}</span>`
      : '';
    lastMonth = key;
    const extras = imgs.slice(1, 3).map((url, k) =>
      `<figure class="print extra e${k + 1}"><img src="${escapeHtml(url)}" alt="" loading="lazy" draggable="false"></figure>`).join('');
    const when = `${d.toLocaleDateString('id-ID', { weekday: 'long' })}${mem.time ? ` · jam ${escapeHtml(mem.time.replace(':', '.'))}` : ''}`;
    const title = escapeHtml(mem.title || 'Kenangan');
    const scene = sceneFor(mem);
    const doodle = scene === 'none' ? '' : `<div class="stop-art" aria-hidden="true">${drawScene(scene)}</div>`;
    return `<article class="stop ${i % 2 ? 'right' : 'left'}" data-i="${i}">
      ${flag}
      <div class="pocket-wrap" role="button" tabindex="0" aria-label="Tarik foto ${title} dari saku">
        ${extras}
        <figure class="print pull" style="--r:${i % 2 ? 2 : -2}deg"><img src="${escapeHtml(imgs[0] || '')}" alt="" loading="lazy" draggable="false"></figure>
        <div class="pocket">
          <span class="pocket-date">${escapeHtml(d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }))}</span>
          <span class="pocket-label"><span class="pull-me">tarik ↑</span><span class="tuck">simpan ↓</span></span>
          ${imgs.length > 1 ? `<span class="pocket-count">${imgs.length} foto</span>` : ''}
        </div>
      </div>
      <div class="note-wrap">
        <span class="tape ${TAPES[i % TAPES.length]}"></span>
        <div class="note">
          <button type="button" class="note-edit editor-only" aria-label="Edit kenangan ini" title="Edit kenangan"><i class="fa-solid fa-pen"></i></button>
          <div class="note-date"><b>${pad(d.getDate())}</b><span><strong>${d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</strong>${when}</span></div>
          <h3>${title}</h3>
          ${mem.category ? `<span class="note-cat">${escapeHtml(String(mem.category).toLowerCase())}</span>` : ''}
          ${mem.caption ? `<p class="clamp">${escapeHtml(mem.caption)}</p><button class="link note-more" hidden>Baca semua</button>` : ''}
        </div>
      </div>
      ${doodle}
    </article>`;
  }).join('') + '<p class="journey-end">bersambung…</p>';

  $$('.stop', box).forEach((stop) => {
    stop.addEventListener('revealed', checkClamps, { once: true });
    watch(stop);
  });
  requestAnimationFrame(() => { checkClamps(); drawJourneyPath(); });
}

/** Tombol "Baca semua" hanya muncul kalau catatannya memang terpotong. */
function checkClamps() {
  for (const p of $$('#journey-stops .note p.clamp')) {
    const more = p.nextElementSibling;
    if (more) more.hidden = p.scrollHeight <= p.clientHeight + 2;
  }
}

/** Garis putus-putus melewati tengah tiap saku (di HP: menyusuri pinggir kiri), berakhir di "bersambung…". */
function drawJourneyPath() {
  const journey = $('#journey');
  const svg = $('#journey-path');
  const stops = $$('#journey-stops .stop');
  if (!stops.length) { svg.innerHTML = ''; return; }
  const jr = journey.getBoundingClientRect();
  const narrow = isPhone();
  const pts = stops.map((s) => {
    const w = $('.pocket-wrap', s).getBoundingClientRect();
    return narrow ? [6, w.top - jr.top + w.height * 0.4] : [w.left - jr.left + w.width / 2, w.top - jr.top + w.height * 0.5];
  });
  const end = $('.journey-end', journey).getBoundingClientRect();
  pts.push(narrow ? [6, end.top - jr.top + 22] : [end.left - jr.left + end.width / 2, end.top - jr.top + 16]);
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const dy = (by - ay) * 0.55;
    const wob = narrow ? (i % 2 ? 9 : -9) : 0; // di HP garisnya sedikit meliuk
    d += ` C${(ax + wob).toFixed(1)} ${(ay + dy).toFixed(1)}, ${(bx + wob).toFixed(1)} ${(by - dy).toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`;
  }
  svg.setAttribute('viewBox', `0 0 ${jr.width.toFixed(0)} ${jr.height.toFixed(0)}`);
  svg.innerHTML = `<defs><mask id="journey-mask" maskUnits="userSpaceOnUse" x="-50" y="-50" width="${(jr.width + 100).toFixed(0)}" height="${(jr.height + 100).toFixed(0)}">`
    + `<path class="ink" d="${d}"/></mask></defs><path class="trace" d="${d}" mask="url(#journey-mask)"/>`;
  const ink = $('.ink', svg);
  state.journeyLen = ink.getTotalLength();
  ink.style.strokeDasharray = `${state.journeyLen}`;
  updateJourneyProgress();
}

/** Bagian garis yang sudah "tergambar" = sampai tiga perempat tinggi layar. */
function updateJourneyProgress() {
  const ink = $('#journey-path .ink');
  if (!ink) return;
  const r = $('#journey').getBoundingClientRect();
  // di HP garis langsung utuh: menggambar mengikuti guliran terasa patah-patah di HP
  const f = reduceMotion || isPhone() ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.75 - r.top) / r.height));
  ink.style.strokeDashoffset = `${(state.journeyLen * (1 - f)).toFixed(1)}`;
}

function setPocket(wrap, out) {
  wrap.classList.toggle('pulled', out);
  wrap.setAttribute('aria-label', out ? 'Foto sudah ditarik. Ketuk foto untuk melihat penuh, ketuk saku untuk menyimpan.' : 'Tarik foto dari saku');
  if (out) playPaperRustle();
}

function setupJourney() {
  const box = $('#journey-stops');
  box.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.note-edit');
    if (editBtn) {
      const mem = state.storyList[Number(editBtn.closest('.stop').dataset.i)];
      if (mem) openMemoryForm(mem, state.memories);
      return;
    }
    const more = e.target.closest('.note-more');
    if (more) {
      const clamped = more.previousElementSibling.classList.toggle('clamp');
      more.textContent = clamped ? 'Baca semua' : 'Tutup';
      requestAnimationFrame(drawJourneyPath);
      return;
    }
    const wrap = e.target.closest('.pocket-wrap');
    if (!wrap) return;
    if (!wrap.classList.contains('pulled')) { setPocket(wrap, true); return; }
    const fig = e.target.closest('.print');
    const mem = state.storyList[Number(wrap.closest('.stop').dataset.i)];
    if (fig && mem) {
      const n = fig.classList.contains('e1') ? 1 : fig.classList.contains('e2') ? 2 : 0;
      openLightbox(mem, n, fig);
    } else {
      setPocket(wrap, false);
    }
  });
  box.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('pocket-wrap')) {
      e.preventDefault();
      setPocket(e.target, !e.target.classList.contains('pulled'));
    }
  });

  let ticking = false;
  addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { updateJourneyProgress(); ticking = false; });
  }, { passive: true });
  let resizeTimer = null;
  let lastWidth = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastWidth) return; // HP: address bar naik-turun tidak perlu menggambar ulang
    lastWidth = innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { checkClamps(); drawJourneyPath(); }, 200);
  });
  // huruf dari Google Fonts bisa mengubah tinggi catatan setelah dimuat
  if (document.fonts) document.fonts.ready.then(() => { checkClamps(); drawJourneyPath(); });
  addEventListener('load', drawJourneyPath);
}

/* --------------------------------------------------------------------------
   Transisi hero → Waktu: lembar kraft Waktu naik menutupi hero seperti kertas baru
   ditaruh di atasnya. Hero menempel (CSS sticky) begitu bagian bawahnya terlihat,
   lalu mundur sedikit (mengecil & memudar); lembar Waktu datang agak miring lalu lurus.
   -------------------------------------------------------------------------- */
function setupStack() {
  if (reduceMotion) return; // halaman bergulir biasa
  const hero = $('.hero');
  const sheet = $('#waktu');
  // Di HP efek yang mengikuti guliran terasa patah-patah (guliran dan JS jalan di jalur berbeda).
  // Cukup: lembar Waktu "mendarat" sekali saat mulai terlihat, lewat transisi CSS yang mulus.
  if (isPhone()) {
    sheet.classList.add('landing');
    new IntersectionObserver(([entry], obs) => {
      if (!entry.isIntersecting) return;
      sheet.classList.add('landed');
      obs.disconnect();
    }, { rootMargin: '0px 0px -12% 0px' }).observe(sheet);
    return;
  }
  document.body.classList.add('stacking');
  // hero di HP lebih tinggi dari layar: baru menempel setelah bagian bawahnya terlihat
  const measure = () => hero.style.setProperty('--hero-h', `${hero.offsetHeight}px`);
  let ticking = false;
  const update = () => {
    ticking = false;
    const top = sheet.getBoundingClientRect().top;
    // 0 = lembar Waktu baru muncul di bawah layar, 1 = sudah menutupi hero sepenuhnya
    const p = Math.min(1, Math.max(0, 1 - top / innerHeight));
    const fade = Math.min(1, Math.max(0, (p - 0.35) / 0.65));
    hero.style.transform = p > 0 ? `scale(${(1 - 0.06 * p).toFixed(4)})` : '';
    hero.style.opacity = p > 0 ? (1 - fade * fade).toFixed(3) : '';
    sheet.style.setProperty('--tilt', `${(-1.6 * Math.pow(1 - p, 1.6)).toFixed(3)}deg`);
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => { measure(); onScroll(); });
  if (document.fonts) document.fonts.ready.then(measure);
  addEventListener('load', measure);
  measure();
  update();
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
      stage.classList.add('reading'); // surat mulai dari atas papan
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
      // Amplop memudar lewat class CSS, bukan animasi JS bertahan (fill) yang nanti dibatalkan:
      // di sebagian HP Android, animasi opacity yang dibatalkan kadang membuat amplop tetap
      // tak terlihat walau masih bisa diklik.
      envelope.classList.add('away');
      setTimeout(() => { busy = false; }, 460);
    }, 900);
  });

  $('#letter-close').addEventListener('click', () => {
    if (busy) return;
    busy = true;
    letter.classList.add('folding'); // surat memudar (CSS), lalu disembunyikan
    setTimeout(() => {
      wrap.hidden = true;
      letter.classList.remove('folding');
      stage.classList.remove('reading');
      // Amplop kembali tertutup tanpa memutar ulang animasi bukanya...
      envelope.classList.add('no-anim');
      envelope.classList.remove('open', 'floating');
      envelope.style.left = envelope.style.top = envelope.style.visibility = '';
      void envelope.offsetWidth;
      // ...lalu muncul lagi lewat transisi CSS; setelah selesai, tidak ada sisa animasi apa pun
      envelope.classList.remove('no-anim', 'away');
      hint.style.display = '';
      hint.classList.remove('hide');
      const top = stage.getBoundingClientRect().top;
      if (top < 0 || top > innerHeight * 0.6) stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
      busy = false;
    }, 270);
  });

  $$('#letter-tabs button').forEach((btn) => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.letter);
    if (i === state.letterIndex || busy) return;
    const body = $('#letter-body');
    body.classList.add('swapping'); // memudar lewat CSS (lihat catatan amplop di atas)
    setTimeout(() => {
      showLetter(i);
      body.classList.remove('swapping');
    }, 160);
  }));

  $('#letter-more').addEventListener('click', toggleLetterLength);
}

/* --------------------------------------------------------------------------
   Masuk (hanya Rijal & Silva). Untuk sekarang dipakai untuk mencoret.
   Kunci sebenarnya ada di Firestore Rules; di sini hanya menampilkan tombol.
   -------------------------------------------------------------------------- */
const editor = { user: null, ok: false };
const LOGIN_ERRORS = {
  'auth/popup-blocked': 'Popup login diblokir browser. Izinkan popup untuk situs ini, lalu coba lagi.',
  'auth/unauthorized-domain': 'Domain ini belum didaftarkan di Firebase Authentication.',
  'auth/operation-not-allowed': 'Login Google belum diaktifkan di Firebase Authentication.'
};

function setupLogin() {
  const btn = $('#btn-login');
  if (!window.firebase || typeof firebase.auth !== 'function') { btn.hidden = true; return; }
  const auth = firebase.auth();
  let clicked = false;
  btn.addEventListener('click', async () => {
    if (editor.user) {
      await auth.signOut();
      showToast('Kamu sudah keluar.');
      return;
    }
    clicked = true;
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (err) {
      clicked = false;
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
      console.error('Login gagal:', err);
      showToast(LOGIN_ERRORS[err.code] || 'Gagal masuk. Coba lagi sebentar lagi.');
    }
  });
  auth.onAuthStateChanged(async (user) => {
    editor.user = user;
    editor.ok = false;
    if (user) {
      const access = await checkEditorAccess();
      if (access === 'granted') {
        editor.ok = true;
        if (clicked) showToast(`Masuk sebagai ${user.email}. Sekarang kamu bisa mencoret di bagian Surat.`, 4200);
      } else if (access === 'denied') {
        showToast(`Akun ${user.email} tidak punya akses untuk mencoret.`);
        await auth.signOut();
      } else {
        showToast('Belum bisa memeriksa akses. Cek koneksi, lalu muat ulang halaman.');
      }
    }
    clicked = false;
    document.body.classList.toggle('can-edit', editor.ok);
    $('#login-who').textContent = editor.ok ? `masuk sebagai ${user.email} · ` : '';
    btn.textContent = editor.user ? 'keluar' : 'masuk';
    $('#coret-btn').hidden = !editor.ok;
    if (!editor.ok) stopCoret();
    safely('gulungan', () => renderKapsul()); // tombol tulis & pensil hanya untuk editor/penulisnya
    safely('jalan ninja', renderNinja); // papan "tulis janji" hanya untuk editor
    safely('nonton', renderNonton); // tombol +1 episode hanya untuk editor
  });
}

/* --------------------------------------------------------------------------
   Jalan ninja kita: janji & mimpi berdua di papan kayu (ninja.js, formnya di editor.js)
   -------------------------------------------------------------------------- */
const memoryById = (id) => state.memories.find((m) => m && m.id != null && String(m.id) === String(id));

function setupJalanNinja() {
  setupNinja({
    names: () => [state.settings.person1 || 'Rijal', state.settings.person2 || 'Silva'],
    canEdit: () => editor.ok,
    memoryThumb: (id) => {
      const m = memoryById(id);
      const first = m && getMemoryImages(m)[0];
      return first ? asset(first) : null;
    },
    openMemory: (id, el) => {
      const m = memoryById(id);
      if (m) openLightbox(m, 0, el);
    },
    onWrite: (item) => {
      if (editor.ok) openNinjaForm({ item, settings: state.settings, memories: state.memories });
    },
    alsoShow: () => nontonAbs() > 0
  });

  // syal nonton Naruto bareng (nonton.js), di bagian yang sama
  setupNonton({
    canEdit: () => editor.ok,
    onChange: () => safely('jalan ninja', renderNinja),
    onAtur: (abs) => { if (editor.ok) openNontonForm({ abs }); },
    // sampai Shippuden 500: papan janji yang menyebut Naruto (mis. "Nonton Naruto sampai tamat bareng") ikut dicap 叶
    onTamat: () => {
      const it = ninjaItems().find((x) => x.id !== FINAL_ID && !x.done && /naruto/i.test(x.text));
      if (!it) { showToast('Tamat! Syalnya selesai dirajut ♡', 4200); return; }
      firebase.firestore().collection('settings').doc('ninja')
        .set({ items: { [it.id]: { ...it, done: true, doneAt: dayKey(new Date()) } } }, { merge: true })
        .then(() => showToast(`Tamat! Papan "${it.text}" ikut dicap 叶 ♡`, 5200))
        .catch((err) => console.error('Papan janji gagal dicap:', err));
    }
  });
}

/* --------------------------------------------------------------------------
   Gulungan tersegel di bagian Waktu: di bawah karcis ulang tahun & di bawah jalur hari
   (isi & tampilannya di kapsul.js, formnya di editor.js)
   -------------------------------------------------------------------------- */
function setupGulungan() {
  setupKapsul({
    names: () => [state.settings.person1 || 'Rijal', state.settings.person2 || 'Silva'],
    settings: () => state.settings,
    canEdit: () => editor.ok,
    uid: () => (editor.ok && editor.user ? editor.user.uid : null),
    onWrite: (meta, preset) => {
      if (editor.ok && editor.user) openKapsulForm({ settings: state.settings, meta, preset, items: kapsulItems(), uid: editor.user.uid });
    },
    onChange: () => safely('waktu', renderTime), // tanda segel di target jalur hari
    mustBlowFirst,
    nudge: nudgeCake
  });
  // hari-H ulang tahun (ultah.js): setelah lilinnya padam, surat ulang tahunnya terbuka
  setupUltah({
    onBlown: (n) => {
      const result = openBirthdayLetter(n);
      if (result === 'early') showToast('Surat ulang tahunnya baru bisa dibuka pukul 00.00 WIB. Sebentar lagi ya ♡', 4600);
      else if (result === 'none' && state.doa[n]) showToast(state.doa[n], 4600);
    }
  });
}

/* --------------------------------------------------------------------------
   Coretan bersama di sekitar surat.
   Disimpan di Firestore settings/doodles (aturan "settings" yang sudah ada:
   semua orang boleh melihat, hanya editor yang boleh mengubah).
   Koordinat memakai papan 1000 × 520, jadi posisinya sama di semua ukuran layar.
   -------------------------------------------------------------------------- */
const BOARD_W = 1000;
const BOARD_H = 520;
const INKS = ['tinta', 'merah', 'biru', 'hijau', 'kuning'];
const DOODLE_LIMIT = 900000; // dokumen Firestore maksimal ~1 MB
const coret = { strokes: [], on: false, erasing: false, ink: 'tinta', mine: [], live: null, liveEl: null, erased: new Set() };

const doodleRef = () => (window.firebase && firebase.apps.length ? firebase.firestore().collection('settings').doc('doodles') : null);
const decodePts = (s) => String(s || '').split(' ').map((p) => p.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite));
const encodePts = (pts) => pts.map(([x, y]) => `${x},${y}`).join(' ');

/** Garis halus: kurva kuadrat lewat titik tengah tiap pasang titik. */
function pathD(pts) {
  if (!pts.length) return '';
  const [x0, y0] = pts[0];
  if (pts.length === 1) return `M${x0} ${y0} l0.01 0`; // titik
  let d = `M${x0} ${y0}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    d += ` Q${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const [xl, yl] = pts[pts.length - 1];
  return `${d} L${xl} ${yl}`;
}

/** Ramer–Douglas–Peucker: buang titik yang tidak mengubah bentuk garis, supaya data tetap kecil. */
function simplify(pts, eps = 0.9) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0];
  const [bx, by] = pts[pts.length - 1];
  const len = Math.hypot(bx - ax, by - ay) || 1;
  let max = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i];
    const dist = Math.abs((by - ay) * px - (bx - ax) * py + bx * ay - by * ax) / len;
    if (dist > max) { max = dist; idx = i; }
  }
  if (max <= eps) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), eps).slice(0, -1), ...simplify(pts.slice(idx), eps)];
}

function renderCoret() {
  const svg = $('#coret-board');
  svg.innerHTML = coret.strokes.map((s) => `<path class="i-${s.c}" data-id="${escapeHtml(s.id)}" d="${pathD(s.pts)}"/>`).join('');
  coret.liveEl = null;
  if (coret.live) startLivePath();
  updateStrokeWidth();
}

/** Tebal garis dalam piksel layar: ikut lebar papan, tapi tidak lebih tipis dari 2px di HP. */
function updateStrokeWidth() {
  const w = $('#coret-board').getBoundingClientRect().width || BOARD_W;
  $('#coret-board').style.setProperty('--sw', `${Math.max(2, Math.min(3.4, (w / BOARD_W) * 3.2)).toFixed(2)}px`);
}

function startLivePath() {
  coret.liveEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  coret.liveEl.setAttribute('class', `i-${coret.live.c}`);
  coret.liveEl.setAttribute('d', pathD(coret.live.pts));
  $('#coret-board').appendChild(coret.liveEl);
}

function boardPoint(e) {
  const r = $('#coret-board').getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / r.width) * BOARD_W);
  const y = Math.round(((e.clientY - r.top) / r.height) * BOARD_H);
  return [Math.max(0, Math.min(BOARD_W, x)), Math.max(0, Math.min(BOARD_H, y))];
}

/** Coretan yang paling atas di dekat titik ini (jarak ~14px di layar). */
function strokeNear([x, y]) {
  const r = $('#coret-board').getBoundingClientRect();
  const reach = 14 / (r.width / BOARD_W);
  for (let i = coret.strokes.length - 1; i >= 0; i--) {
    const pts = coret.strokes[i].pts;
    for (let k = 0; k < pts.length; k++) {
      const [ax, ay] = pts[k];
      const [bx, by] = pts[Math.min(k + 1, pts.length - 1)];
      const dx = bx - ax;
      const dy = by - ay;
      const t = dx || dy ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))) : 0;
      if (Math.hypot(x - (ax + t * dx), y - (ay + t * dy)) <= reach) return coret.strokes[i];
    }
  }
  return null;
}

function coretError(err, what) {
  console.error(`Coretan gagal ${what}:`, err);
  showToast(err && err.code === 'permission-denied'
    ? 'Ditolak server: akun ini tidak punya akses untuk mencoret.'
    : `Coretan gagal ${what}. Cek koneksi, lalu coba lagi.`);
}

async function saveStroke(raw) {
  const ref = doodleRef();
  if (!ref) return;
  try {
    await ref.set({ strokes: firebase.firestore.FieldValue.arrayUnion(raw) }, { merge: true });
  } catch (err) {
    coretError(err, 'disimpan');
  }
}

async function removeStroke(stroke) {
  const ref = doodleRef();
  if (!ref || !stroke) return;
  try {
    await ref.update({ strokes: firebase.firestore.FieldValue.arrayRemove(stroke.raw) });
  } catch (err) {
    coret.erased.delete(stroke.id);
    renderCoret(); // coretan yang tadi memudar tampil utuh lagi
    coretError(err, 'dihapus');
  }
}

function setInk(ink) {
  coret.ink = ink;
  setErasing(false);
  $$('.coret-inks button').forEach((b) => {
    b.classList.toggle('on', b.dataset.ink === ink);
    b.setAttribute('aria-checked', String(b.dataset.ink === ink));
  });
}

function setErasing(on) {
  coret.erasing = on;
  $('#coret-eraser').setAttribute('aria-pressed', String(on));
  $('#letter-stage').classList.toggle('erasing', on);
}

function startCoret() {
  if (!editor.ok) return;
  coret.on = true;
  $('#letter-stage').classList.add('drawing');
  $('#coret-tools').hidden = false;
  $('#coret-btn').hidden = true;
  updateStrokeWidth();
  const top = $('#coret-tools').getBoundingClientRect().top;
  if (top < 70 || top > innerHeight * 0.5) scrollBy({ top: top - 90, behavior: 'smooth' });
}

function stopCoret() {
  coret.on = false;
  coret.live = null;
  setErasing(false);
  $('#letter-stage').classList.remove('drawing');
  $('#coret-tools').hidden = true;
  $('#coret-btn').hidden = !editor.ok;
  renderCoret();
}

function setupCoret() {
  const svg = $('#coret-board');
  const ref = doodleRef();
  if (ref) {
    ref.onSnapshot((doc) => {
      const list = doc.exists && Array.isArray(doc.data().strokes) ? doc.data().strokes : [];
      coret.strokes = list
        .filter((raw) => raw && raw.id && raw.p)
        .sort((a, b) => (a.t || 0) - (b.t || 0))
        .map((raw) => ({ raw, id: String(raw.id), c: INKS.includes(raw.c) ? raw.c : 'tinta', pts: decodePts(raw.p) }));
      coret.size = JSON.stringify(list).length;
      renderCoret();
    }, (err) => console.warn('Coretan tidak bisa dimuat:', err));
  }

  $('#coret-btn').addEventListener('click', startCoret);
  $('#coret-done').addEventListener('click', stopCoret);
  $$('.coret-inks button').forEach((b) => b.addEventListener('click', () => setInk(b.dataset.ink)));
  $('#coret-eraser').addEventListener('click', () => setErasing(!coret.erasing));
  $('#coret-undo').addEventListener('click', () => {
    // coretan terakhir yang dibuat dari perangkat ini (dan masih ada)
    while (coret.mine.length) {
      const id = coret.mine.pop();
      const stroke = coret.strokes.find((s) => s.id === id);
      if (stroke) { removeStroke(stroke); return; }
    }
    showToast('Belum ada coretanmu yang bisa dibatalkan.');
  });

  const eraseAt = (pt) => {
    const hit = strokeNear(pt);
    if (!hit || coret.erased.has(hit.id)) return;
    coret.erased.add(hit.id);
    const el = svg.querySelector(`path[data-id="${CSS.escape(hit.id)}"]`);
    if (el) el.classList.add('fading');
    removeStroke(hit);
  };

  svg.addEventListener('pointerdown', (e) => {
    if (!coret.on || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* garis tetap jalan tanpa capture */ }
    const pt = boardPoint(e);
    if (coret.erasing) {
      coret.erased.clear();
      coret.erasingNow = true;
      eraseAt(pt);
      return;
    }
    if ((coret.size || 0) > DOODLE_LIMIT) {
      showToast('Tempat coretan sudah penuh. Hapus beberapa coretan lama dulu, ya.');
      return;
    }
    coret.live = { c: coret.ink, pts: [pt] };
    startLivePath();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!coret.on) return;
    const pt = boardPoint(e);
    if (coret.erasing) { if (coret.erasingNow) eraseAt(pt); return; }
    if (!coret.live) return;
    const [lx, ly] = coret.live.pts[coret.live.pts.length - 1];
    if (Math.hypot(pt[0] - lx, pt[1] - ly) < 2) return;
    coret.live.pts.push(pt);
    coret.liveEl.setAttribute('d', pathD(coret.live.pts));
  });
  const finish = () => {
    coret.erasingNow = false;
    if (!coret.live) return;
    const pts = simplify(coret.live.pts);
    const raw = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, c: coret.live.c, p: encodePts(pts), t: Date.now() };
    coret.live = null;
    coret.mine.push(raw.id);
    // tampil langsung; dokumen dari server menyusul lewat onSnapshot
    coret.strokes.push({ raw, id: raw.id, c: raw.c, pts });
    renderCoret();
    saveStroke(raw);
  };
  svg.addEventListener('pointerup', finish);
  svg.addEventListener('pointercancel', finish);
  addEventListener('resize', updateStrokeWidth);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && coret.on && !$('#lightbox').classList.contains('open')) stopCoret(); });

  // Hanya untuk tes di komputer sendiri (localhost): login Google tidak bisa dipakai di browser tes.
  if (location.hostname === 'localhost') {
    window.__coretTest = { coret, render: renderCoret, start: () => { editor.ok = true; startCoret(); }, decodePts,
      edit: () => { editor.ok = true; document.body.classList.add('can-edit'); } };
  }
}

/* --------------------------------------------------------------------------
   Mode gelap: tombol bulan/matahari. Tanpa pilihan, ikut setelan HP/laptop
   (dipasang lebih awal oleh skrip kecil di <head>).
   -------------------------------------------------------------------------- */
const BAR_COLOR = { krem: '#f4ede3', gelap: '#1d4436' };

function applyMode(mode) {
  document.documentElement.dataset.tema = mode;
  $('meta[name="theme-color"]').setAttribute('content', BAR_COLOR[mode]); // warna bilah alamat di HP
  const dark = mode === 'gelap';
  const btn = $('#btn-mode');
  btn.innerHTML = `<i class="fa-solid fa-${dark ? 'sun' : 'moon'}"></i>`;
  btn.title = dark ? 'Mode terang' : 'Mode gelap';
  btn.setAttribute('aria-label', btn.title);
}

function setupMode() {
  let chosen = null;
  try { chosen = localStorage.getItem('v2_tema'); } catch (e) { /* tidak wajib */ }
  const url = new URL(location.href);
  const fromLink = url.searchParams.get('tema');
  if (fromLink === 'gelap' || fromLink === 'krem') {
    chosen = fromLink;
    try { localStorage.setItem('v2_tema', chosen); } catch (e) { /* tidak wajib */ }
  }
  if (fromLink !== null) { // link lama (?tema=pink dst.) dibersihkan, pilihannya sudah diingat
    url.searchParams.delete('tema');
    history.replaceState(null, '', url);
  }
  if (chosen !== 'gelap' && chosen !== 'krem') chosen = null;
  applyMode(document.documentElement.dataset.tema === 'gelap' ? 'gelap' : 'krem');

  $('#btn-mode').addEventListener('click', () => {
    chosen = document.documentElement.dataset.tema === 'gelap' ? 'krem' : 'gelap';
    try { localStorage.setItem('v2_tema', chosen); } catch (e) { /* tidak wajib */ }
    applyMode(chosen);
  });
  // belum pernah memilih: ikut kalau setelan HP/laptop berganti (mis. otomatis gelap di malam hari)
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!chosen) applyMode(e.matches ? 'gelap' : 'krem');
  });
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
  // isi cerita lengkap + sidik tiap foto (panjang + ujungnya), supaya edit teks atau ganti foto ikut tampil
  return list.map((m) => [m.id, m.title, m.date, m.time, m.category, m.isFeatured, m.gambar || '', m.caption || '',
    getMemoryImages(m).map((u) => `${String(u).length}:${String(u).slice(-16)}`).join(',')].join('~')).join('|');
}

/**
 * Tiap bagian halaman dijalankan sendiri-sendiri. Dulu satu error (tanggal jadian 1900 membuat daftar
 * target habis) menghentikan init, sehingga buku, album, cerita, dan jam ikut kosong.
 */
function safely(name, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`[${name}]`, err);
  }
}

function renderMemories() {
  state.memoriesSig = memoriesSignature(state.memories);
  safely('buku', renderBook);
  safely('album', () => { renderTabs(); renderGrid(); });
  safely('cerita', renderJourney);
  safely('jalan ninja', renderNinja); // foto kenangan di belakang papan
}

function renderSettings() {
  state.settingsSig = JSON.stringify(state.settings);
  safely('nama', renderNames);
  safely('waktu', renderTime);
  safely('ulang tahun', renderBirthdays);
  safely('surat', () => {
    renderLetterTabs();
    if (!$('#letter-wrap').hidden) showLetter(state.letterIndex);
  });
  safely('gulungan', () => renderKapsul()); // nama di label gulungan
  safely('jalan ninja', renderNinja); // nama di papan
}

function init() {
  setupMode();
  $$('.reveal').forEach(watch);
  renderSettings();
  renderMemories();
  safely('jam', () => { buildFlipclock(); tickClock(); });
  setInterval(() => safely('jam', tickClock), 1000);
  // gulungan hanya digambar ulang kalau hitungan harinya berubah atau segelnya sudah boleh dibuka
  setInterval(() => { safely('waktu', renderTime); safely('ulang tahun', renderBirthdays); safely('gulungan', () => renderKapsul()); safely('nonton', renderNonton); }, 60000);

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

  for (const [name, setup] of [['kalender', setupCalendar], ['buku', setupBook], ['album', setupStrip],
    ['cerita', setupJourney], ['tumpukan', setupStack], ['lightbox', setupLightbox], ['surat', setupLetter],
    ['gulungan', setupGulungan], ['jalan ninja', setupJalanNinja], ['coretan', setupCoret], ['login', setupLogin], ['editor', setupEditor], ['navigasi', setupNav]]) safely(name, setup);
  safely('musik', () => setupAudioSynth($('#btn-audio-toggle'), $('#bg-music'), () => ({
    ...state.settings,
    musicUrl: asset(state.settings.musicUrl || 'assets/audio/music.mp3')
  })));

  setupCloudListeners({
    onMemoriesUpdate: (list) => {
      if (memoriesSignature(list) === state.memoriesSig) return;
      state.memories = list;
      renderMemories();
    },
    onSettingsUpdate: (settings) => {
      if (!settings) return;
      // foto buku: cache di perangkat ini mengikuti server (kalau dikosongkan di HP lain, di sini ikut kembali ke bawaan)
      saveScrapbookCustomPages(Array.isArray(settings.scrapbookCustomPages) && settings.scrapbookCustomPages.length ? settings.scrapbookCustomPages : null);
      if (JSON.stringify(settings) === state.settingsSig) return;
      const prevMusic = state.settings.musicUrl;
      state.settings = settings;
      renderSettings();
      safely('buku', renderBook);
      if (settings.musicUrl && settings.musicUrl !== prevMusic) onMusicUrlChanged(asset(settings.musicUrl));
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
