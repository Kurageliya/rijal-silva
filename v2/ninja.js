/**
 * Jalan ninja kita: janji & mimpi berdua, ditulis di papan doa kayu (ema) yang digantung berjajar.
 * - Yang sudah terwujud dicap 叶 ("terkabul"), dan bisa disambungkan ke kenangannya:
 *   fotonya terselip di belakang papan, diketuk = dibuka di lightbox.
 * - Paling bawah selalu tujuan akhirnya: nikah (papan lebih besar, tali merah-putih).
 *
 * Data di Firestore: settings/ninja
 *   { items: { <id>: { id, text, by: '1' | '2' | 'b', order, done, doneAt: 'YYYY-MM-DD' | '', memoryId } } }
 *   Item ber-id 'akhir' = tujuan akhir (tidak bisa dihapus). Memakai aturan "settings" yang sudah ada:
 *   semua orang boleh membaca, hanya akun Rijal & Silva yang boleh mengubah.
 */
import { escapeHtml } from '../js/utils/helpers.js';

const $ = (sel, root = document) => root.querySelector(sel);
const CACHE_KEY = 'v2_ninja';
export const FINAL_ID = 'akhir';
const TILTS = [-2.4, 1.8, -1.2, 2.6, -0.6, 1.4, -2, 0.9];

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(validItem) : [];
  } catch (e) {
    return [];
  }
}

function validItem(it) {
  return it && typeof it.id === 'string' && typeof it.text === 'string';
}

const nj = {
  items: readCache(),
  hooks: {
    names: () => ['Rijal', 'Silva'],
    canEdit: () => false,
    memoryThumb: () => null, // (memoryId) → url foto pertama kenangan itu, atau null kalau sudah tidak ada
    openMemory: () => {}, // (memoryId, elemen asal)
    onWrite: () => {}, // (item | null) → buka form di editor.js
    alsoShow: () => false // bagian ini tetap tampil untuk tamu walau belum ada janji (mis. sudah mulai nonton Naruto)
  }
};

export function ninjaItems() {
  return nj.items;
}

function nameOf(by) {
  const [p1, p2] = nj.hooks.names();
  return by === '1' ? p1 : by === '2' ? p2 : 'berdua';
}

export function finalItem() {
  return nj.items.find((it) => it.id === FINAL_ID) || { id: FINAL_ID, text: 'Nikah', by: 'b', done: false, doneAt: '', memoryId: '' };
}

function wishes() {
  return nj.items.filter((it) => it.id !== FINAL_ID).sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
}

const fmtShort = (key) => {
  const [y, m, d] = String(key || '').split('-').map(Number);
  if (!y) return '';
  return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* --------------------------------------------------------------------------
   Gambar papan: pasak kuningan, tali, papan kayu bersudut atap
   (viewBox mulai dari y=-36 supaya pasak & talinya ikut di dalam gambar)
   -------------------------------------------------------------------------- */
function plaqueSvg(final = false) {
  const cord = final
    ? '<path class="ema-cord" d="M96 30 L99 -26 M104 30 L101 -26"/><path class="ema-cord white" d="M98 30 L100 -26 M102 30 L100 -26"/>'
    : '<path class="ema-cord" d="M96.5 30 L100 -26 L103.5 30"/>';
  return `<svg class="ema-art" viewBox="0 -36 200 196" aria-hidden="true">
    <path class="ema-body" d="M6 42 L100 6 L194 42 V153 Q194 158 189 158 H11 Q6 158 6 153 Z"/>
    <path class="ema-roof" d="M6 42 L100 6 L194 42 L194 53 L100 17 L6 53 Z"/>
    <path class="ema-grain" d="M10 78 C60 73 130 82 190 75 M10 108 C70 112 130 103 190 110 M10 136 C60 131 140 140 190 133"/>
    <path class="ema-edge" d="M17 58 L100 26 L183 58 V147 H17 Z"/>
    <circle class="ema-hole" cx="100" cy="31" r="4.2"/>
    ${cord}
    <circle class="ema-peg" cx="100" cy="-27" r="6"/><circle class="ema-peg-shine" cx="98" cy="-29" r="1.8"/>
  </svg>`;
}

function emaHtml(it, i, canEdit) {
  const thumb = it.done && it.memoryId ? nj.hooks.memoryThumb(it.memoryId) : null;
  const text = String(it.text || '').trim() || '…';
  const label = `${text}${it.done ? ', sudah terkabul' : ''}${canEdit ? '. Ketuk untuk mengubah' : ''}`;
  return `<li class="ema-item${it.done ? ' done' : ''}" style="--tilt:${TILTS[i % TILTS.length]}deg">
    ${thumb ? `<button type="button" class="ema-photo${i % 2 ? ' l' : ''}" data-mem="${escapeHtml(it.memoryId)}" aria-label="Lihat kenangannya" style="--r:${i % 2 ? -9 : 9}deg"><img src="${escapeHtml(thumb)}" alt="" loading="lazy" draggable="false"></button>` : ''}
    <button type="button" class="ema" data-id="${escapeHtml(it.id)}" aria-label="${escapeHtml(label)}">
      ${plaqueSvg()}
      <span class="ema-text${text.length > 40 ? ' long' : ''}">${escapeHtml(text)}</span>
      <span class="ema-by">~ ${escapeHtml(nameOf(it.by))}</span>
      ${it.done ? '<span class="ema-stamp" aria-hidden="true">叶</span>' : ''}
    </button>
    ${it.done && it.doneAt ? `<p class="ema-when">terkabul ${escapeHtml(fmtShort(it.doneAt))}</p>` : ''}
  </li>`;
}

function finalHtml(it, canEdit) {
  const thumb = it.done && it.memoryId ? nj.hooks.memoryThumb(it.memoryId) : null;
  const [p1, p2] = nj.hooks.names();
  const text = String(it.text || '').trim() || 'Nikah';
  return `<div class="ema-item ema-final${it.done ? ' done' : ''}">
    ${thumb ? `<button type="button" class="ema-photo" data-mem="${escapeHtml(it.memoryId)}" aria-label="Lihat kenangannya" style="--r:7deg"><img src="${escapeHtml(thumb)}" alt="" loading="lazy" draggable="false"></button>` : ''}
    <button type="button" class="ema" data-id="${FINAL_ID}" aria-label="Tujuan akhir: ${escapeHtml(text)}${it.done ? ', sudah terkabul' : ''}${canEdit ? '. Ketuk untuk mengubah' : ''}">
      ${plaqueSvg(true)}
      <span class="ema-text">${escapeHtml(text)}</span>
      <span class="ema-by">${escapeHtml(p1)} &amp; ${escapeHtml(p2)}</span>
      ${it.done ? '<span class="ema-stamp" aria-hidden="true">叶</span>' : ''}
    </button>
    <p class="ema-when">${it.done && it.doneAt ? `terkabul ${escapeHtml(fmtShort(it.doneAt))} ♡` : 'tujuan akhir jalan ninja kita'}</p>
  </div>`;
}

/* --------------------------------------------------------------------------
   Render
   -------------------------------------------------------------------------- */
export function renderNinja() {
  const sec = $('#ninja');
  const list = $('#ema-list');
  if (!sec || !list) return;
  const canEdit = nj.hooks.canEdit();
  const items = wishes();
  const fin = finalItem();
  // tamu tidak melihat bagian kosong; editor selalu melihatnya (untuk menulis janji pertama)
  // (catatan nonton Naruto di bagian ini juga membuatnya tampil, lihat nonton.js)
  const show = items.length > 0 || canEdit || nj.hooks.alsoShow();
  sec.hidden = !show;
  const navLi = $('#nav-ninja');
  if (navLi) navLi.hidden = !show;
  if (!show) {
    list.innerHTML = '';
    $('#ema-akhir').innerHTML = '';
    return;
  }

  const done = items.filter((it) => it.done).length;
  $('#ninja-count').innerHTML = items.length
    ? `<b>${done}</b> dari <b>${items.length}</b> janji sudah terkabul`
    : canEdit ? 'belum ada janji yang digantung. tulis yang pertama ♡' : '';
  list.innerHTML = items.map((it, i) => emaHtml(it, i, canEdit)).join('') + (canEdit ? `<li class="ema-item ema-add-wrap">
      <button type="button" class="ema-add" data-add>
        <svg class="ema-art" viewBox="0 -36 200 196" aria-hidden="true"><path d="M6 42 L100 6 L194 42 V153 Q194 158 189 158 H11 Q6 158 6 153 Z"/></svg>
        <span><i class="fa-solid fa-plus"></i> tulis janji</span>
      </button>
    </li>` : '');
  $('#ema-akhir').innerHTML = finalHtml(fin, canEdit);
}

function swing(btn) {
  btn.classList.remove('swing');
  void btn.offsetWidth; // ulang animasinya
  btn.classList.add('swing');
}

function onClick(e) {
  const photo = e.target.closest('.ema-photo');
  if (photo) {
    nj.hooks.openMemory(photo.dataset.mem, photo.querySelector('img'));
    return;
  }
  if (e.target.closest('[data-add]')) {
    if (nj.hooks.canEdit()) nj.hooks.onWrite(null);
    return;
  }
  const btn = e.target.closest('.ema');
  if (!btn) return;
  const id = btn.dataset.id;
  const it = id === FINAL_ID ? finalItem() : nj.items.find((x) => x.id === id);
  if (!it) return;
  if (nj.hooks.canEdit()) {
    nj.hooks.onWrite(it);
    return;
  }
  swing(btn);
  // tamu: papan yang sudah terkabul membuka kenangannya (kalau ada)
  const img = btn.parentElement.querySelector('.ema-photo img');
  if (it.done && img) setTimeout(() => nj.hooks.openMemory(it.memoryId, img), 260);
}

function setItems(items) {
  nj.items = items.filter(validItem);
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(nj.items)); } catch (e) { /* mode privat: cukup di memori */ }
  renderNinja();
}

export function setupNinja(hooks) {
  Object.assign(nj.hooks, hooks);
  for (const sel of ['#ema-list', '#ema-akhir']) {
    const el = $(sel);
    if (!el) continue;
    el.addEventListener('click', onClick);
    el.addEventListener('animationend', (e) => e.target.classList.remove('swing'));
  }
  renderNinja();

  if (window.firebase && firebase.apps.length) {
    firebase.firestore().collection('settings').doc('ninja').onSnapshot((doc) => {
      const raw = doc.exists ? (doc.data().items || {}) : {};
      setItems(Object.values(raw));
    }, (err) => console.warn('Jalan ninja tidak bisa dimuat:', err));
  }

  // Hanya untuk tes di komputer sendiri (localhost)
  if (location.hostname === 'localhost') {
    window.__ninjaTest = { nj, set: setItems, render: renderNinja };
  }
}
