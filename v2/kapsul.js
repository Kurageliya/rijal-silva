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
  hooks: {
    names: () => ['Rijal', 'Silva'], settings: () => ({}), canEdit: () => false, uid: () => null, onWrite: () => {}, onChange: null,
    // hari-H ulang tahun (v2/ultah.js): suratnya baru boleh dibuka setelah lilinnya ditiup
    mustBlowFirst: () => false, nudge: () => {}
  },
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

/** 'MM-DD' ulang tahun orang ke-n (dari pengaturan, atau bawaannya). */
function birthdayMD(n) {
  const fallback = n === '1' ? '11-22' : '09-24';
  const raw = (kap.hooks.settings() || {})[`birthdayPerson${n}`];
  return /^\d{2}-\d{2}$/.test(raw || '') ? raw : fallback;
}

/** Surat ulang tahun = dibuka tepat di hari ulang tahun penerimanya; tempatnya di bawah karcis orang itu. */
function isBirthdayLetter(it) {
  return it.openDate.slice(5) === birthdayMD(it.to);
}

/** Akun yang sedang masuk ini orang ke berapa (dari suratnya yang lain, atau pilihan "Dari" terakhir di form). */
function myPerson(uid) {
  const mine = kap.items.find((it) => it.authorUid === uid);
  if (mine) return mine.from;
  try {
    const v = localStorage.getItem('v2_kapsul_dari');
    return v === '1' || v === '2' ? v : null;
  } catch (e) {
    return null;
  }
}

function itemHtml(it, i, { canEdit, uid, onTicket = false }) {
  const status = statusOf(it);
  const to = escapeHtml(nameOf(it.to));
  const from = escapeHtml(nameOf(it.from));
  const date = localDay(it.openDate);
  const mine = canEdit && uid && it.authorUid === uid;
  let text;
  if (onTicket) {
    // di bawah karcis sudah jelas untuk siapa dan kapan (hitungan harinya ada di karcis)
    const note = status === 'sealed' ? 'disegel sampai hari-H' : whenText(it, status);
    text = `<p class="gl-head">${it.title ? `“${escapeHtml(it.title)}”` : `surat dari ${from}`}</p>
      <p class="gl-sub">${it.title ? `dari ${from} · ` : ''}${note}</p>`;
  } else {
    text = `<p class="gl-head">${it.title ? `“${escapeHtml(it.title)}”` : `untuk ${to}`}</p>
      <p class="gl-sub">${it.title ? `dari ${from} untuk ${to}` : `dari ${from}`}</p>
      <p class="gl-when">${escapeHtml(it.label || 'dibuka')} · ${escapeHtml(fmtShort(date))}<br>${whenText(it, status)}</p>`;
  }
  return `<li class="gl-item ${status}" style="--tilt:${TILTS[i % TILTS.length]}deg">
      <button type="button" class="gulungan" data-id="${escapeHtml(it.id)}"
        aria-label="Surat ${status === 'sealed' ? 'tersegel ' : ''}dari ${from} untuk ${to}, dibuka ${escapeHtml(fmtDate(date))}">${scrollMarkup(it)}</button>
      <div class="gl-text">${text}</div>
      ${mine ? `<button type="button" class="gl-edit" data-edit="${escapeHtml(it.id)}" title="Ubah suratmu" aria-label="Ubah surat ini"><i class="fa-solid fa-pen"></i></button>` : ''}
    </li>`;
}

/**
 * Gulungan ada di bagian Waktu:
 * - surat ulang tahun diselipkan di bawah karcis ulang tahun penerimanya (#tk-gulungan-1 / -2);
 * - surat hari jadi & tanggal lain berjajar di bawah jalur "perjalanan kita" (#kapsul).
 * Tamu tidak melihat apa-apa selama belum ada gulungan.
 */
export function renderKapsul(force = false) {
  const box = $('#kapsul');
  const list = $('#kapsul-list');
  if (!box || !list) return;
  const canEdit = kap.hooks.canEdit();
  const uid = kap.hooks.uid();
  const items = sorted();
  const statuses = items.map((it) => `${it.id}:${statusOf(it)}:${daysLeft(it)}`).join('|');
  const sig = `${canEdit}|${uid}|${kap.hooks.names().join('&')}|${birthdayMD('1')},${birthdayMD('2')}|${JSON.stringify(kap.items)}|${statuses}`;
  if (!force && sig === kap.sig) return;
  kap.sig = sig;
  const opts = { canEdit, uid };

  const others = items.filter((it) => !isBirthdayLetter(it));
  box.hidden = !others.length && !canEdit;
  list.innerHTML = others.map((it, i) => itemHtml(it, i, opts)).join('') + (canEdit ? `<li class="gl-add-wrap">
      <button type="button" class="gl-add" data-add="anniv"><i class="fa-solid fa-plus"></i><span>tulis surat tersegel</span></button>
      ${others.length ? '' : '<p class="gl-sub">mis. untuk 1 tahun jadian</p>'}
    </li>` : '');

  const me = canEdit ? myPerson(uid) : null;
  for (const n of ['1', '2']) {
    const ul = $(`#tk-gulungan-${n}`);
    if (!ul) continue;
    const letters = items.filter((it) => it.to === n && isBirthdayLetter(it));
    // tombol tambah hanya di karcis pasangan, dan selama suratmu untuknya belum ada yang menunggu
    const add = canEdit && me !== n && !letters.some((it) => it.authorUid === uid && statusOf(it) === 'sealed');
    ul.hidden = !letters.length && !add;
    ul.innerHTML = letters.map((it, i) => itemHtml(it, i + 1, { ...opts, onTicket: true })).join('') + (add ? `<li class="gl-add-wrap">
        <button type="button" class="gl-add" data-add="ultah" data-to="${n}"><i class="fa-solid fa-plus"></i><span>selipkan surat ulang tahun untuk ${escapeHtml(nameOf(n))}</span></button>
      </li>` : '');
  }
  if (kap.hooks.onChange) kap.hooks.onChange();
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
  const add = e.target.closest('[data-add]');
  if (add) {
    if (kap.hooks.canEdit()) kap.hooks.onWrite(null, { occasion: add.dataset.add, to: add.dataset.to || null });
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
  if (statusOf(it) === 'ready' && isBirthdayLetter(it) && it.openDate === dayKey(new Date()) && kap.hooks.mustBlowFirst(it.to)) {
    shake(btn);
    kap.hooks.nudge(it.to);
    showToast('Tiup lilinnya dulu ya, kuenya ada di karcis ↑', 3600);
    return;
  }
  openView(it);
}

/**
 * Dipanggil setelah lilin ulang tahun orang ke-n padam: buka surat ulang tahun untuknya yang tanggalnya hari ini.
 * Hasil: 'opened', 'early' (ada, tapi segelnya belum lepas, mis. jam perangkat lebih cepat dari WIB), atau 'none'.
 */
export function openBirthdayLetter(n) {
  const today = dayKey(new Date());
  const letters = sorted().filter((it) => it.to === n && it.openDate === today && isBirthdayLetter(it));
  if (!letters.length) return 'none';
  const it = letters.find((x) => statusOf(x) !== 'sealed');
  if (!it) return 'early';
  openView(it);
  return 'opened';
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
  for (const sel of ['#kapsul-list', '#tk-gulungan-1', '#tk-gulungan-2']) {
    const el = $(sel);
    if (!el) continue;
    el.addEventListener('click', onShelfClick);
    el.addEventListener('animationend', (e) => e.target.classList.remove('nope'));
  }
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
