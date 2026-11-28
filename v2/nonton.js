/**
 * Nonton Naruto bareng (di dalam "Jalan ninja kita"): syal merah yang dirajut sambil nonton,
 * seperti syal yang dirajut Hinata untuk Naruto di film The Last.
 *
 * Jalurnya Naruto 1–220 lalu Shippuden 1–500 = 720 episode (filler ikut dihitung), sampai Shippuden 500
 * ("The Message"): Naruto & Hinata berangkat ke pernikahan mereka. Syalnya memanjang tiap episode.
 *
 * Data: settings/nonton { abs: 0..720 (episode terakhir yang sudah ditonton, dihitung dari Naruto 1),
 *                         days: { 'YYYY-MM-DD': jumlah episode yang ditonton hari itu } }
 * Memakai aturan "settings" yang sudah ada. "+1 episode" memakai increment, jadi aman kalau
 * ditekan dari dua HP sekaligus (nonton bareng jarak jauh).
 */
import { showToast } from '../js/utils/toast.js';

const $ = (sel, root = document) => root.querySelector(sel);
export const NARUTO_EPS = 220;
export const SHIPPUDEN_EPS = 500;
export const TOTAL_EPS = NARUTO_EPS + SHIPPUDEN_EPS;
const CONFESSION = NARUTO_EPS + 166; // Shippuden 166: Hinata menyatakan perasaannya saat melawan Pain
const WEDDING_ARC = NARUTO_EPS + 494; // Shippuden 494–500: arc pernikahan
const CACHE_KEY = 'v2_nonton';
const DAY = 86400000;

const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDay = (key) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d);
};
const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const clampAbs = (n) => Math.max(0, Math.min(TOTAL_EPS, Math.round(Number(n) || 0)));

/** 0 → 'belum mulai', 132 → 'Naruto 132', 352 → 'Shippuden 132' */
export function epLabel(abs) {
  if (abs <= 0) return 'belum mulai';
  return abs <= NARUTO_EPS ? `Naruto ${abs}` : `Shippuden ${abs - NARUTO_EPS}`;
}

function readCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    if (raw && typeof raw === 'object') return { abs: clampAbs(raw.abs), days: raw.days && typeof raw.days === 'object' ? raw.days : {} };
  } catch (e) { /* abaikan */ }
  return { abs: 0, days: {} };
}

const nt = {
  ...readCache(),
  shown: -1, // abs yang terakhir digambar (untuk animasi jarum saat bertambah)
  hooks: {
    canEdit: () => false,
    onChange: () => {}, // abs berubah (bagian Jalan ninja ikut muncul/sembunyi untuk tamu)
    onAtur: () => {}, // buka form "atur" di editor.js
    onTamat: () => {} // sampai Shippuden 500: papan janji nonton Naruto ikut dicap
  }
};

export const nontonAbs = () => nt.abs;

/* --------------------------------------------------------------------------
   Hitungan: terakhir nonton & perkiraan sampai episode nikahan
   -------------------------------------------------------------------------- */
function lastWatched() {
  const keys = Object.keys(nt.days).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Number(nt.days[k]) > 0).sort();
  if (!keys.length) return null;
  const key = keys[keys.length - 1];
  return { key, n: Number(nt.days[key]) };
}

/** Episode per minggu dari 4 minggu terakhir (0 kalau datanya belum cukup). */
function weeklyPace() {
  const today = midnight(new Date());
  let recent = 0;
  let days = 0;
  for (const [k, v] of Object.entries(nt.days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
    const age = (today - localDay(k)) / DAY;
    if (age >= 0 && age < 28 && Number(v) > 0) {
      recent += Number(v);
      days += 1;
    }
  }
  return days >= 2 ? recent / 4 : 0;
}

function whenText(key) {
  const d = localDay(key);
  const diff = Math.round((midnight(new Date()) - d) / DAY);
  if (diff === 0) return 'hari ini';
  if (diff === 1) return 'kemarin';
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
}

/* --------------------------------------------------------------------------
   Gambar
   -------------------------------------------------------------------------- */
const NEEDLES = `<svg viewBox="0 0 40 56" aria-hidden="true">
  <path class="needle" d="M9 5 L30 47"/><path class="needle" d="M31 5 L10 47"/>
  <circle class="needle-knob" cx="9" cy="5" r="3.4"/><circle class="needle-knob" cx="31" cy="5" r="3.4"/>
</svg>`;

function buildTrack(track) {
  const at = (abs) => `${((abs / TOTAL_EPS) * 100).toFixed(2)}%`;
  track.innerHTML = `<div class="syal-rail"></div>
    <div class="syal"></div>
    <span class="syal-tick" style="left:${at(NARUTO_EPS)}"><i>Shippuden</i></span>
    <span class="syal-tag start">Naruto 1</span>
    <span class="syal-tag" style="left:${at(CONFESSION)}">166 · Hinata mengaku</span>
    <span class="syal-tag end">500 · nikah ♡</span>
    <span class="syal-needles">${NEEDLES}</span>`;
}

export function renderNonton() {
  const box = $('#nonton');
  if (!box) return;
  const canEdit = nt.hooks.canEdit();
  const abs = clampAbs(nt.abs);
  box.hidden = !(abs > 0 || canEdit); // tamu baru melihatnya setelah mulai nonton
  if (box.hidden) return;

  const track = $('#syal-track');
  if (!track.firstChild) buildTrack(track);
  track.style.setProperty('--p', ((abs / TOTAL_EPS) * 100).toFixed(3));
  track.setAttribute('aria-label', `Sudah ${abs} dari ${TOTAL_EPS} episode`);
  if (nt.shown >= 0 && abs > nt.shown) {
    const needles = $('.syal-needles', track);
    needles.classList.remove('knit');
    void needles.offsetWidth;
    needles.classList.add('knit');
  }
  nt.shown = abs;

  const left = TOTAL_EPS - abs;
  $('#nonton-now').innerHTML = abs === 0
    ? '<b>Belum mulai</b><span>syalnya baru seutas benang · 720 episode sampai Naruto &amp; Hinata nikah</span>'
    : abs >= TOTAL_EPS
      ? '<b>Tamat ♡</b><span>syalnya selesai dirajut. Naruto &amp; Hinata sudah nikah, giliran kita.</span>'
      : `<b>${epLabel(abs)}</b><span>${left} episode lagi sampai Naruto &amp; Hinata nikah</span>`;

  const notes = [];
  const last = lastWatched();
  if (last) notes.push(`terakhir nonton ${whenText(last.key)} · ${last.n} episode`);
  const pace = weeklyPace();
  if (pace > 0 && abs > 0 && abs < TOTAL_EPS) {
    const at = new Date(Date.now() + (left / pace) * 7 * DAY);
    notes.push(`kalau tetap ±${Math.max(1, Math.round(pace))} episode seminggu, sampai di episode nikahannya sekitar ${at.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}`);
  }
  if (abs >= WEDDING_ARC - 40 && abs < WEDDING_ARC) notes.push('sebelum Shippuden 494, tonton dulu film <i>The Last</i>: syal merahnya dari situ ♡');
  $('#nonton-meta').innerHTML = notes.map((t) => `<span>${t}</span>`).join('');

  const act = $('#nonton-act');
  act.hidden = !canEdit;
  const plus = $('[data-plus]', act);
  if (plus) plus.disabled = abs >= TOTAL_EPS;
}

/* --------------------------------------------------------------------------
   Menyimpan
   -------------------------------------------------------------------------- */
const ref = () => firebase.firestore().collection('settings').doc('nonton');

async function addEpisodes(n) {
  if (!nt.hooks.canEdit()) return;
  if (!window.firebase || !firebase.apps.length) { showToast('Belum tersambung ke server. Coba muat ulang halamannya.'); return; }
  const add = Math.min(n, TOTAL_EPS - nt.abs);
  if (add <= 0) return;
  const before = nt.abs;
  const inc = firebase.firestore.FieldValue.increment(add);
  try {
    // tampil langsung lewat onSnapshot (perubahan lokal), server menyusul
    await ref().set({ abs: inc, days: { [dayKey(new Date())]: inc } }, { merge: true });
    if (before + add >= TOTAL_EPS) nt.hooks.onTamat();
  } catch (err) {
    console.error('Catatan nonton gagal disimpan:', err);
    showToast(err && err.code === 'permission-denied' ? 'Ditolak server. Coba keluar lalu masuk lagi.' : 'Gagal menyimpan. Cek koneksi, lalu coba lagi.', 5200);
  }
}

function setData(data) {
  const prev = nt.abs;
  nt.abs = clampAbs(data.abs);
  nt.days = data.days && typeof data.days === 'object' ? data.days : {};
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ abs: nt.abs, days: nt.days })); } catch (e) { /* mode privat */ }
  renderNonton();
  if ((prev > 0) !== (nt.abs > 0)) nt.hooks.onChange();
}

export function setupNonton(hooks) {
  Object.assign(nt.hooks, hooks);
  const act = $('#nonton-act');
  if (act) {
    act.addEventListener('click', (e) => {
      if (e.target.closest('[data-plus]')) addEpisodes(1);
      else if (e.target.closest('[data-atur]') && nt.hooks.canEdit()) nt.hooks.onAtur(nt.abs);
    });
  }
  const needles = $('#syal-track');
  if (needles) needles.addEventListener('animationend', (e) => e.target.classList.remove('knit'));
  renderNonton();

  if (window.firebase && firebase.apps.length) {
    ref().onSnapshot((doc) => setData(doc.exists ? doc.data() : {}), (err) => console.warn('Catatan nonton tidak bisa dimuat:', err));
  }

  // Hanya untuk tes di komputer sendiri (localhost)
  if (location.hostname === 'localhost') {
    window.__nontonTest = { nt, set: setData, render: renderNonton };
  }
}
