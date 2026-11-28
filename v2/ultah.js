/**
 * Hari-H ulang tahun (bagian Waktu).
 *
 * Di hari ulang tahun seseorang (tanggal di perangkat ini):
 * - karcisnya dihiasi untaian bendera kertas, dan angka hitung mundurnya diganti kue berlilin;
 * - lilinnya ditiup lewat mikrofon, atau diketuk kalau mikrofon tidak bisa/tidak mau dipakai;
 * - setelah semua padam: konfeti kertas, lalu surat ulang tahun untuknya (gulungan tersegel) terbuka;
 * - bagian atas halaman ikut menyapa.
 *
 * Mikrofon baru menyala setelah kuenya diketuk, dan langsung dimatikan begitu lilin padam,
 * setelah 30 detik tanpa hasil, atau saat tab ditinggalkan. Suaranya tidak direkam atau dikirim ke mana pun;
 * yang dibaca hanya kerasnya suara, untuk tahu kapan sedang ditiup.
 */
import { escapeHtml } from '../js/utils/helpers.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const BLOWN_KEY = 'v2_lilin_ditiup'; // { '<n>': 'YYYY-MM-DD' }: hari terakhir lilin orang ke-n ditiup di perangkat ini
const CANDLES = [56, 80, 104]; // posisi x lilin di gambar kue
const MIC_LIMIT = 30000;
const CONFETTI = ['#8c2f4b', '#e8c25a', '#d9849a', '#b9a3cf', '#fbf4e6', '#7fa38a'];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

const pad = (n) => String(n).padStart(2, '0');
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function readBlown() {
  try {
    return JSON.parse(localStorage.getItem(BLOWN_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
}

const blownMem = {}; // cadangan kalau localStorage tidak bisa dipakai (mode privat)

function writeBlown(n) {
  blownMem[n] = todayKey();
  const all = readBlown();
  all[n] = todayKey();
  try { localStorage.setItem(BLOWN_KEY, JSON.stringify(all)); } catch (e) { /* cukup di memori */ }
}

const blownToday = (n) => (readBlown()[n] || blownMem[n]) === todayKey();

const hooks = { onBlown: () => {} };
const cakes = new Map(); // n → { n, name, el, box, btn, hint, bunting, mode, mic, timer, noMic }

/* --------------------------------------------------------------------------
   Gambar: kue kertas dan untaian bendera
   -------------------------------------------------------------------------- */
function cakeSvg() {
  // krim di atas kue: tepi bawahnya bergelombang, beberapa menetes lebih panjang
  let icing = 'M24 74 V68 Q24 61 31 61 H129 Q136 61 136 68 V74';
  const drips = { 1: 12, 4: 17, 6: 8 };
  for (let i = 0; i < 8; i++) {
    const len = drips[i] || 0;
    icing += len ? ` v${len} a7 7 0 0 1 -14 0 v${-len}` : ' a7 7 0 0 1 -14 0';
  }
  icing += ' Z';
  const sprinkles = [[38, 100, 20, '#e8c25a'], [52, 110, -30, '#fbf4e6'], [66, 98, 50, '#8c2f4b'], [86, 108, -10, '#e8c25a'],
    [100, 99, 35, '#fbf4e6'], [116, 109, -40, '#8c2f4b'], [126, 97, 15, '#e8c25a'], [44, 88, -50, '#8c2f4b']]
    .map(([x, y, r, c]) => `<rect x="${x - 4}" y="${y - 1.2}" width="8" height="2.4" rx="1.2" fill="${c}" transform="rotate(${r} ${x} ${y})"/>`).join('');
  const candles = CANDLES.map((x, i) => {
    const stripes = [36, 45, 54].map((y) => `<path d="M${x - 4} ${y + 4} L${x + 4} ${y - 1}"/>`).join('');
    return `<g class="candle" style="--i:${i}">
      <rect class="candle-body" x="${x - 4}" y="31" width="8" height="32" rx="2"/>
      <g class="candle-stripes">${stripes}</g>
      <path class="wick" d="M${x} 31 V26"/>
      <g class="flame"><path class="flame-out" d="M${x} 7 C${x + 7} 16 ${x + 6.5} 26 ${x} 27.5 C${x - 6.5} 26 ${x - 7} 16 ${x} 7 Z"/>
        <path class="flame-in" d="M${x} 15 C${x + 3.6} 20 ${x + 3.2} 26 ${x} 26.6 C${x - 3.2} 26 ${x - 3.6} 20 ${x} 15 Z"/></g>
      <path class="smoke" pathLength="1" d="M${x} 24 c-4 -5 4 -8 0 -13 c-4 -5 3 -8 1 -12"/>
    </g>`;
  }).join('');
  return `<svg viewBox="0 0 160 132" aria-hidden="true">
    <ellipse class="plate" cx="80" cy="123" rx="70" ry="6.5"/>
    <rect class="cake-body" x="24" y="66" width="112" height="56" rx="6"/>
    <rect class="cake-band" x="24" y="90" width="112" height="5"/>
    ${sprinkles}
    <path class="icing" d="${icing}"/>
    ${candles}
  </svg>`;
}

function buntingSvg() {
  const W = 420;
  const sag = 16;
  const n = 9;
  const colors = ['#8c2f4b', '#e8c25a', '#d9849a', '#fbf4e6', '#b9a3cf'];
  // tali: kurva kuadrat dari (8, 6) ke (W-8, 6) yang melengkung ke bawah
  const cx = W / 2;
  const cy = 6 + 2 * sag;
  const at = (t) => [(1 - t) * (1 - t) * 8 + 2 * (1 - t) * t * cx + t * t * (W - 8), (1 - t) * (1 - t) * 6 + 2 * (1 - t) * t * cy + t * t * 6];
  const tilt = (t) => Math.atan2(2 * (1 - t) * (cy - 6) + 2 * t * (6 - cy), 2 * (1 - t) * (cx - 8) + 2 * t * (W - 8 - cx)) * 180 / Math.PI;
  let flags = '';
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const [x, y] = at(t);
    // bendera di dalam <g> supaya goyangannya (CSS) tidak menimpa posisinya (atribut transform)
    flags += `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt(t).toFixed(1)})">`
      + `<path class="flag" d="M-13 0 H13 L0 23 Z" fill="${colors[i % colors.length]}" style="--i:${i}"/></g>`;
  }
  return `<svg class="bunting" viewBox="0 0 ${W} 50" aria-hidden="true">
    <path class="bunting-tali" d="M8 6 Q${cx} ${cy} ${W - 8} 6"/>${flags}
    <circle class="bunting-pin" cx="8" cy="6" r="4"/><circle class="bunting-pin" cx="${W - 8}" cy="6" r="4"/>
  </svg>`;
}

/* --------------------------------------------------------------------------
   Kue di karcis
   -------------------------------------------------------------------------- */
const HINTS = {
  idle: 'ketuk kuenya, terus tiup lilinnya',
  asking: 'izinkan mikrofonnya dulu ya…',
  listening: 'tiup ke mikrofon sekarang!',
  tap: 'ketuk kuenya buat niup lilinnya'
};

function setMode(c, mode, hint) {
  c.mode = mode;
  c.box.dataset.mode = mode;
  c.hint.innerHTML = hint || HINTS[mode] || '';
}

function mount(p) {
  const main = $('.ticket-main', p.el);
  if (!main) return;
  const box = document.createElement('div');
  box.className = 'cake-box';
  box.innerHTML = `<button type="button" class="cake" aria-label="Tiup lilin ulang tahun ${escapeHtml(p.name)}">${cakeSvg()}</button>
    <p class="cake-hint" aria-live="polite"></p>`;
  main.append(box);
  const bunting = document.createElement('div');
  bunting.className = 'bunting-wrap';
  bunting.innerHTML = buntingSvg();
  p.el.prepend(bunting);
  p.el.classList.add('hari-h');

  const c = { n: p.n, name: p.name, el: p.el, box, bunting, btn: $('.cake', box), hint: $('.cake-hint', box), mode: 'idle', mic: null, timer: 0, noMic: false };
  c.btn.addEventListener('click', () => onCake(c));
  c.btn.addEventListener('animationend', (e) => { if (e.target === c.btn) c.btn.classList.remove('nudge'); });
  cakes.set(p.n, c);
  if (blownToday(p.n)) {
    // sudah ditiup tadi di perangkat ini: lilinnya tetap padam (tanpa asap)
    c.btn.classList.add('quiet');
    $$('.candle', c.btn).forEach((el) => el.classList.add('out'));
    setMode(c, 'done', 'lilinnya sudah ditiup ♡ <span>ketuk buat nyalain lagi</span>');
  } else {
    setMode(c, 'idle');
  }
}

function unmount(n) {
  const c = cakes.get(n);
  if (!c) return;
  stopMic(c);
  clearTimeout(c.timer);
  c.box.remove();
  c.bunting.remove();
  c.el.classList.remove('hari-h');
  cakes.delete(n);
}

async function onCake(c) {
  if (c.mode === 'asking') return;
  if (c.mode === 'done') {
    relight(c);
    return;
  }
  if (c.mode === 'listening' || c.mode === 'tap') {
    puff(c);
    return;
  }
  // idle: coba mikrofon dulu; kalau tidak bisa, lilin ditiup dengan ketukan
  setMode(c, 'asking');
  try {
    await startMic(c);
    setMode(c, 'listening');
  } catch (err) {
    if (c.mode !== 'asking') return;
    console.info('Mikrofon tidak dipakai untuk meniup lilin:', (err && err.name) || err);
    setMode(c, 'tap', c.noMic ? 'mikrofonnya nggak bisa dipakai, <span>ketuk kuenya buat niup lilinnya</span>' : HINTS.tap);
  }
}

function puff(c) {
  const lit = $$('.candle:not(.out)', c.btn);
  if (!lit.length) return;
  lit[Math.floor(Math.random() * lit.length)].classList.add('out');
  c.btn.classList.add('gust');
  clearTimeout(c.gustTimer);
  c.gustTimer = setTimeout(() => { if (!c.mic) c.btn.classList.remove('gust'); }, 280);
  if (lit.length === 1) finish(c);
}

function finish(c) {
  stopMic(c);
  writeBlown(c.n);
  setMode(c, 'done', `selamat ulang tahun, ${escapeHtml(c.name)}!&nbsp;♡`);
  confetti(c.btn);
  clearTimeout(c.timer);
  c.timer = setTimeout(() => hooks.onBlown(c.n), reduceMotion ? 500 : 1600);
}

function relight(c) {
  clearTimeout(c.timer);
  c.btn.classList.remove('quiet', 'gust');
  $$('.candle', c.btn).forEach((el) => el.classList.remove('out'));
  setMode(c, 'idle');
}

/* --------------------------------------------------------------------------
   Mikrofon: lilin padam kalau suaranya keras cukup lama (seperti ditiup)
   -------------------------------------------------------------------------- */
async function startMic(c) {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (c.noMic || !AC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    c.noMic = true;
    throw new Error('unsupported');
  }
  const ctx = new AC(); // dibuat saat diketuk, supaya boleh berjalan di iPhone
  let stream;
  try {
    // tanpa peredam bising: suara tiupan justru yang mau didengar
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
  } catch (err) {
    ctx.close().catch(() => {});
    c.noMic = true;
    throw err;
  }
  if (c.mode !== 'asking' || cakes.get(c.n) !== c) { // kuenya sudah hilang (ganti hari) atau tab ditinggalkan
    stream.getTracks().forEach((t) => t.stop());
    ctx.close().catch(() => {});
    throw new Error('cancelled');
  }
  if (ctx.state === 'suspended') await ctx.resume().catch(() => {});
  const an = ctx.createAnalyser();
  an.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(an);
  const buf = new Float32Array(an.fftSize);
  const mic = newMic({ stream, ctx });
  mic.limit = setTimeout(() => {
    stopMic(c);
    setMode(c, 'idle', 'mikrofonnya dimatikan dulu. <span>ketuk kuenya lagi buat niup</span>');
  }, MIC_LIMIT);
  c.mic = mic;
  const loop = (now) => {
    if (c.mic !== mic) return;
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    hear(c, Math.sqrt(sum / buf.length), now);
    mic.raf = requestAnimationFrame(loop);
  };
  mic.raf = requestAnimationFrame(loop);
}

function newMic(extra = {}) {
  const now = performance.now();
  return { started: now, last: now, floor: 0, floorN: 0, blow: 0, raf: 0, limit: 0, ...extra };
}

/** Satu bacaan kerasnya suara (RMS 0..1). 0,4 detik pertama dipakai untuk mengukur suara ruangan. */
function hear(c, rms, now) {
  const m = c.mic;
  const dt = Math.min(now - m.last, 100);
  m.last = now;
  if (now - m.started < 400) {
    // rata-rata, bukan puncak: bunyi jari mengetuk layar tidak membuat ambangnya terlalu tinggi
    m.floorN += 1;
    m.floor += (rms - m.floor) / m.floorN;
    return;
  }
  const thr = Math.min(0.25, Math.max(0.06, m.floor * 4));
  c.btn.classList.toggle('gust', rms > thr * 0.45); // apinya miring kalau ada angin
  if (rms > thr) {
    m.blow += dt * (rms > thr * 2 ? 2 : 1);
    if (m.blow >= 180) {
      m.blow = 0;
      puff(c);
    }
  } else {
    m.blow = Math.max(0, m.blow - dt * 0.5);
  }
}

function stopMic(c) {
  const m = c.mic;
  if (!m) return;
  c.mic = null;
  cancelAnimationFrame(m.raf);
  clearTimeout(m.limit);
  if (m.stream) m.stream.getTracks().forEach((t) => t.stop());
  if (m.ctx) m.ctx.close().catch(() => {});
  c.btn.classList.remove('gust');
}

/* --------------------------------------------------------------------------
   Konfeti kertas
   -------------------------------------------------------------------------- */
function confetti(anchor) {
  if (reduceMotion) return;
  const r = anchor.getBoundingClientRect();
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  box.style.left = `${r.left + r.width / 2}px`;
  box.style.top = `${r.top + r.height * 0.3}px`;
  for (let i = 0; i < 60; i++) {
    const s = document.createElement('i');
    const a = (-90 + (Math.random() - 0.5) * 150) * (Math.PI / 180);
    const v = 90 + Math.random() * 160;
    s.style.cssText = `--dx:${(Math.cos(a) * v).toFixed(0)}px;--up:${(Math.sin(a) * v).toFixed(0)}px;`
      + `--fall:${(170 + Math.random() * 230).toFixed(0)}px;--r:${((Math.random() - 0.5) * 900).toFixed(0)}deg;`
      + `--d:${(1.5 + Math.random() * 0.9).toFixed(2)}s;background:${CONFETTI[i % CONFETTI.length]};`
      + (i % 4 === 0 ? 'width:8px;height:8px;border-radius:50%;' : '');
    box.append(s);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2600);
}

/* --------------------------------------------------------------------------
   Dipanggil dari v2.js
   -------------------------------------------------------------------------- */

/**
 * people: [{ n: '1' | '2', el: .ticket-wrap, name, today }]. Aman dipanggil tiap menit:
 * kue hanya dipasang/dilepas saat harinya berganti, jadi tidak mengganggu yang sedang meniup.
 */
export function renderHariH(people) {
  for (const p of people) {
    const c = cakes.get(p.n);
    if (p.today && !c) mount(p);
    else if (!p.today && c) unmount(p.n);
    else if (c) c.name = p.name;
  }
  const todays = people.filter((p) => p.today);
  const hello = $('#hello-bday');
  if (hello) {
    hello.hidden = !todays.length;
    if (todays.length) {
      const names = todays.map((p) => escapeHtml(p.name)).join(' & ');
      hello.href = `#${todays[0].el.id}`;
      hello.innerHTML = `<b>Hari ini ulang tahun ${names}!</b><span>tiup lilinnya di bawah ↓</span>`;
    }
  }
  return todays;
}

/** Surat ulang tahun orang ke-n baru boleh dibuka setelah lilinnya ditiup (hanya di hari-H). */
export function mustBlowFirst(n) {
  return cakes.has(n) && !blownToday(n);
}

/** Kue melompat kecil, mengingatkan untuk meniup dulu. */
export function nudgeCake(n) {
  const c = cakes.get(n);
  if (!c) return;
  c.btn.classList.remove('nudge');
  void c.btn.offsetWidth;
  c.btn.classList.add('nudge');
}

export function setupUltah(h) {
  Object.assign(hooks, h);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    cakes.forEach((c) => {
      if (c.mode !== 'listening' && c.mode !== 'asking') return;
      stopMic(c);
      setMode(c, 'idle');
    });
  });

  // Hanya untuk tes di komputer sendiri (localhost)
  if (location.hostname === 'localhost') {
    window.__ultahTest = {
      cakes,
      /** pura-pura mikrofon menyala, lalu kirim bacaan kerasnya suara selama ms milidetik */
      fakeMic: (n) => {
        const c = cakes.get(n);
        c.mic = newMic({ started: performance.now() - 1000 });
        c.mic.floor = 0.01;
        setMode(c, 'listening');
      },
      feed: (n, rms, ms = 100) => {
        const c = cakes.get(n);
        for (let t = 0; t < ms && c.mic; t += 16) hear(c, rms, c.mic.last + 16);
      },
      forget: () => { try { localStorage.removeItem(BLOWN_KEY); } catch (e) { /* tidak apa-apa */ } delete blownMem['1']; delete blownMem['2']; }
    };
  }
}
