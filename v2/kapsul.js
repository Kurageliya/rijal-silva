/**
 * Gulungan tersegel: surat yang baru bisa dibaca pada tanggal yang dipilih penulisnya
 * (mis. 1 tahun jadian atau ulang tahun pasangan).
 *
 * Data di Firestore:
 * - settings/kapsul  { items: { <id>: { id, from, to, openDate, label, title, authorUid, sealedAt } } }
 *   Boleh dibaca semua orang. Isinya hanya siapa, untuk siapa, dan kapan dibuka.
 * - kapsul/<id>      { authorUid, openAt, from, to, text, updatedAt }
 *   Isi suratnya. openAt = pukul 00.00 WIB di tanggal dibuka. Firestore Rules hanya mengizinkan
 *   dokumen ini dibaca setelah openAt, kecuali oleh penulisnya sendiri (lihat firestore.rules).
 *
 * Gulungan yang sudah dibuka di perangkat ini dicatat di localStorage, supaya upacara
 * merobek segel hanya terjadi sekali.
 */
import { escapeHtml } from '../js/utils/helpers.js';
import { showToast } from '../js/utils/toast.js';

const $ = (sel, root = document) => root.querySelector(sel);
const DAY = 86400000;
const WIB = 7 * 3600000;
const OPENED_KEY = 'v2_kapsul_dibuka';
const CACHE_KEY = 'v2_kapsul';
const TILTS = [-2.2, 1.6, -1, 2.4, -1.8, 1.1];

const pad = (n) => String(n).padStart(2, '0');
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** 'YYYY-MM-DD' → waktu buka (00.00 WIB) dalam milidetik. */
export function openAtMs(openDate) {
  const [y, m, d] = String(openDate).split('-').map(Number);
  return Date.UTC(y, m - 1, d) - WIB;
}

/** 'YYYY-MM-DD' → Date lokal pukul 00.00 (untuk hitungan hari dan tampilan tanggal). */
export const localDay = (openDate) => {
  const [y, m, d] = String(openDate).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const fmtShort = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtLong = (d) => d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtDate = (d) => d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* mode privat: cukup di memori */ }
}

const kap = {
  items: (readJson(CACHE_KEY, []) || []).filter(validItem),
  contents: new Map(),
  opened: new Set(readJson(OPENED_KEY, [])),
  sig: '',
  hooks: { names: () => ['Rijal', 'Silva'], canEdit: () => false, uid: () => null, onWrite: () => {} },
  view: { item: null, busy: false, timers: [] }
};

function validItem(it) {
  return it && typeof it.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(it.openDate || '') && (it.from === '1' || it.from === '2');
}

export function kapsulItems() {
  return kap.items;
}

function nameOf(n) {
  const [p1, p2] = kap.hooks.names();
  return n === '2' ? p2 : p1;
}

function daysLeft(it) {
  return Math.round((localDay(it.openDate) - midnight(new Date())) / DAY);
}

function statusOf(it) {
  if (Date.now() < openAtMs(it.openDate)) return 'sealed';
  return kap.opened.has(it.id) ? 'opened' : 'ready';
}

/** Urutan di rak: yang sudah boleh dibuka, lalu yang masih tersegel (paling dekat dulu), lalu yang sudah dibuka. */
function sorted() {
  const rank = { ready: 0, sealed: 1, opened: 2 };
  return [...kap.items].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    if (sa !== sb) return rank[sa] - rank[sb];
    return sa === 'opened' ? b.openDate.localeCompare(a.openDate) : a.openDate.localeCompare(b.openDate);
  });
}

const segelDate = (it) => {
  const [y, m, d] = it.openDate.split('-');
  return `${d}.${m}<br>${y}`;
};

/** Gulungan tertutup (dipakai di rak). */
function scrollMarkup(it) {
  return `<span class="gl-knob l"></span><span class="gl-roll"></span><span class="gl-knob r"></span>
    <span class="gl-syal"></span>
    <span class="gl-segel"><b>封</b><small>${segelDate(it)}</small></span>`;
}

function whenText(it, status) {
  if (status === 'ready') return '<b>sudah boleh dibuka ♡</b>';
  if (status === 'opened') return 'sudah dibuka';
  const n = daysLeft(it);
  return `<b>${n <= 0 ? 'sebentar lagi' : n === 1 ? 'besok dibuka' : `${n} hari lagi`}</b>`;
}

/** Rak gulungan di bawah amplop. Tamu tidak melihat bagian ini kalau belum ada gulungan. */
export function renderKapsul(force = false) {
  const box = $('#kapsul');
  const list = $('#kapsul-list');
  if (!box || !list) return;
  const canEdit = kap.hooks.canEdit();
  const uid = kap.hooks.uid();
  const items = sorted();
  const statuses = items.map((it) => `${it.id}:${statusOf(it)}:${daysLeft(it)}`).join('|');
  const sig = `${canEdit}|${uid}|${kap.hooks.names().join('&')}|${JSON.stringify(kap.items)}|${statuses}`;
  if (!force && sig === kap.sig) return;
  kap.sig = sig;

  box.hidden = !items.length && !canEdit;
  list.innerHTML = items.map((it, i) => {
    const status = statusOf(it);
    const to = escapeHtml(nameOf(it.to));
    const from = escapeHtml(nameOf(it.from));
    const date = localDay(it.openDate);
    const head = it.title ? `“${escapeHtml(it.title)}”` : `untuk ${to}`;
    const sub = it.title ? `dari ${from} untuk ${to}` : `dari ${from}`;
    const label = escapeHtml(it.label || 'dibuka');
    const mine = canEdit && uid && it.authorUid === uid;
    return `<li class="gl-item ${status}" style="--tilt:${TILTS[i % TILTS.length]}deg">
      <button type="button" class="gulungan" data-id="${escapeHtml(it.id)}"
        aria-label="Surat ${status === 'sealed' ? 'tersegel' : ''} dari ${from} untuk ${to}, dibuka ${escapeHtml(fmtDate(date))}">${scrollMarkup(it)}</button>
      <p class="gl-head">${head}</p>
      <p class="gl-sub">${sub}</p>
      <p class="gl-when">${label} · ${escapeHtml(fmtShort(date))}<br>${whenText(it, status)}</p>
      ${mine ? `<button type="button" class="gl-edit" data-edit="${escapeHtml(it.id)}" title="Ubah suratmu" aria-label="Ubah surat ini"><i class="fa-solid fa-pen"></i></button>` : ''}
    </li>`;
  }).join('') + (canEdit ? `<li class="gl-add-wrap">
      <button type="button" class="gl-add" id="kapsul-add"><i class="fa-solid fa-plus"></i><span>tulis surat tersegel</span></button>
      ${items.length ? '' : '<p class="gl-sub">mis. untuk 1 tahun jadian, atau ulang tahun pasanganmu</p>'}
    </li>` : '');
}

function shake(btn) {
  btn.classList.remove('nope');
  void btn.offsetWidth; // ulang animasinya
  btn.classList.add('nope');
}

function onShelfClick(e) {
  const edit = e.target.closest('[data-edit]');
  if (edit) {
    const it = kap.items.find((x) => x.id === edit.dataset.edit);
    if (it && kap.hooks.canEdit()) kap.hooks.onWrite(it);
    return;
  }
  if (e.target.closest('#kapsul-add')) {
    if (kap.hooks.canEdit()) kap.hooks.onWrite(null);
    return;
  }
  const btn = e.target.closest('.gulungan');
  if (!btn) return;
  const it = kap.items.find((x) => x.id === btn.dataset.id);
  if (!it) return;
  if (statusOf(it) === 'sealed') {
    shake(btn);
    const n = daysLeft(it);
    const mine = kap.hooks.canEdit() && it.authorUid === kap.hooks.uid();
    showToast(mine
      ? 'Ini suratmu. Ketuk pensilnya kalau mau membaca atau mengubahnya.'
      : `Sabar ya, segelnya baru bisa dibuka ${fmtLong(localDay(it.openDate))}${n > 0 ? ` (${n} hari lagi)` : ''}.`, 4200);
    return;
  }
  openView(it);
}

/* --------------------------------------------------------------------------
   Membaca: gulungan dibentangkan di tengah layar
   -------------------------------------------------------------------------- */
async function loadContent(id) {
  if (kap.contents.has(id)) return kap.contents.get(id);
  if (!window.firebase || !firebase.apps.length) throw new Error('offline');
  const snap = await firebase.firestore().collection('kapsul').doc(id).get();
  if (!snap.exists) throw new Error('not-found');
  const data = snap.data();
  kap.contents.set(id, data);
  return data;
}

function later(fn, ms) {
  kap.view.timers.push(setTimeout(fn, ms));
}

function fillView(it, data) {
  const text = String((data && data.text) || '').trim();
  const from = nameOf(it.from);
  const paragraphs = text ? text.split(/\n\s*\n/) : ['(suratnya kosong)'];
  $('#kv-body').innerHTML = paragraphs.map((p, n) => `<p style="animation-delay:${(0.9 + n * 0.12).toFixed(2)}s">${escapeHtml(p.trim())}</p>`).join('')
    + `<p class="sign" style="animation-delay:${(0.9 + paragraphs.length * 0.12).toFixed(2)}s">~ ${escapeHtml(from)}</p>`;
}

function openView(it) {
  const view = $('#kapsul-view');
  if (!view || kap.view.busy) return;
  const first = statusOf(it) === 'ready';
  kap.view.item = it;
  kap.view.timers.forEach(clearTimeout);
  kap.view.timers = [];

  const scroll = $('#kv-scroll');
  scroll.className = `kv-scroll${first ? '' : ' no-seal'}`;
  $('#kv-head').textContent = `dari ${nameOf(it.from)}, untuk ${nameOf(it.to)}`;
  $('#kv-title').textContent = it.title || (it.label ? `Untuk ${it.label}` : 'Surat tersegel');
  $('#kv-foot').textContent = `${it.sealedAt ? `disegel ${fmtDate(localDay(it.sealedAt))} · ` : ''}dibuka ${fmtDate(localDay(it.openDate))}`;
  document.querySelectorAll('#kv-segel small').forEach((el) => { el.innerHTML = segelDate(it); });
  $('#kv-body').innerHTML = '';
  $('#kv-hint').textContent = first ? 'ketuk segelnya untuk membuka' : '';

  view.hidden = false;
  view.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  void view.offsetWidth;
  view.classList.add('show');
  view.scrollTop = 0;

  const loading = loadContent(it.id);
  loading.catch(() => {}); // ditangani saat dipakai
  scroll.focus({ preventScroll: true }); // fokus ke gulungannya (tanpa cincin fokus), bukan ke segelnya
  if (!first) {
    unroll(it, loading, 250);
  }
}

async function unroll(it, loading, delay = 0) {
  const scroll = $('#kv-scroll');
  let data;
  try {
    data = await loading;
  } catch (err) {
    console.warn('Isi gulungan gagal diambil:', err);
    const early = Date.now() < openAtMs(it.openDate) + 5 * 60000;
    showToast(early
      ? 'Segelnya belum mau lepas. Mungkin jam di perangkat ini lebih cepat; coba lagi sebentar lagi.'
      : 'Isi suratnya belum bisa diambil. Cek koneksi, lalu coba lagi.', 4600);
    closeView();
    return false;
  }
  if (kap.view.item !== it) return false;
  fillView(it, data);
  // tinggi kertas terbentang = tinggi isinya (isinya tetap tersusun walau kertasnya masih setinggi 0)
  $('.kv-paper').style.setProperty('--paper-h', `${$('.kv-in').offsetHeight}px`);
  later(() => scroll.classList.add('open'), delay);
  later(() => scroll.classList.add('done'), delay + 1400);
  return true;
}

async function breakSeal() {
  const it = kap.view.item;
  const scroll = $('#kv-scroll');
  if (!it || kap.view.busy || scroll.classList.contains('tearing')) return;
  kap.view.busy = true;
  $('#kv-hint').textContent = '';
  scroll.classList.add('tearing');
  const ok = await unroll(it, loadContent(it.id), 650);
  kap.view.busy = false;
  if (!ok) return;
  kap.opened.add(it.id);
  writeJson(OPENED_KEY, [...kap.opened]);
  renderKapsul(true);
}

function closeView() {
  const view = $('#kapsul-view');
  if (!view || view.hidden) return;
  kap.view.timers.forEach(clearTimeout);
  kap.view.timers = [];
  kap.view.item = null;
  kap.view.busy = false;
  view.classList.remove('show');
  view.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  setTimeout(() => {
    if (view.classList.contains('show')) return; // sudah dibuka lagi
    view.hidden = true;
    $('#kv-scroll').className = 'kv-scroll';
  }, 320);
}

/* --------------------------------------------------------------------------
   Pemasangan
   -------------------------------------------------------------------------- */
function setItems(items) {
  kap.items = items.filter(validItem);
  writeJson(CACHE_KEY, kap.items);
  renderKapsul();
}

export function setupKapsul(hooks) {
  Object.assign(kap.hooks, hooks);
  $('#kapsul-list').addEventListener('click', onShelfClick);
  $('#kapsul-list').addEventListener('animationend', (e) => e.target.classList.remove('nope'));
  // segel atau gulungannya sendiri boleh diketuk
  $('#kv-roll').addEventListener('click', () => {
    if (!$('#kv-scroll').classList.contains('no-seal')) breakSeal();
  });
  $('#kv-close').addEventListener('click', closeView);
  $('#kapsul-view').addEventListener('click', (e) => { if (e.target.matches('[data-close], .kapsul-view')) closeView(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#kapsul-view').hidden && !$('#editor-dialog').open) closeView();
  });
  renderKapsul(true);

  if (window.firebase && firebase.apps.length) {
    firebase.firestore().collection('settings').doc('kapsul').onSnapshot((doc) => {
      const raw = doc.exists ? (doc.data().items || {}) : {};
      setItems(Object.values(raw));
    }, (err) => console.warn('Gulungan tersegel tidak bisa dimuat:', err));
  }

  // Hanya untuk tes di komputer sendiri (localhost): login Google tidak bisa dipakai di browser tes.
  if (location.hostname === 'localhost') {
    window.__kapsulTest = {
      kap,
      set: (items, contents = {}) => {
        for (const [id, text] of Object.entries(contents)) kap.contents.set(id, { text });
        setItems(items);
      },
      open: (id) => openView(kap.items.find((x) => x.id === id)),
      breakSeal,
      closeView,
      render: renderKapsul,
      forget: () => { kap.opened.clear(); writeJson(OPENED_KEY, []); renderKapsul(true); }
    };
  }
}
