/**
 * Rijal & Silva — v2: mode edit (hanya untuk akun editor; tombolnya muncul lewat body.can-edit).
 * Semua form tampil di satu <dialog> bergaya selembar kertas.
 * Penyimpanan memakai fungsi yang sama dengan v1, jadi perubahan juga terlihat di versi lama,
 * dan tampilan v2 ikut berubah sendiri lewat listener Firestore (onSnapshot).
 */
import { syncMemoryToCloud, deleteMemoryFromCloud, syncSettingsToCloud, saveScrapbookCustomPages } from '../js/repositories/storageRepository.js';
import { compressAndReadImage, isSupportedImageFile, isHeicFile, escapeHtml, formatIndoDate } from '../js/utils/helpers.js';
import { getMemoryImages } from '../js/modules/timeline.js';
import { showToast } from '../js/utils/toast.js';
import { drawScene, sceneFor, SCENE_KEYS, SCENE_LABELS } from './gambar.js?v=14';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const SITE_ROOT = new URL('../', import.meta.url);
const asset = (url) => (!url || /^(data:|https?:|blob:)/.test(url)) ? url : new URL(String(url).replace(/^\.?\//, ''), SITE_ROOT).href;
const DEFAULT_CATEGORIES = [['kencan', 'Kencan'], ['liburan', 'Liburan'], ['spesial', 'Spesial']];
const MAX_BOOK_PAGES = 6;

function dialog() {
  return $('#editor-dialog');
}

/** Buka dialog dengan isi baru; fungsi bind dipanggil setelah isi terpasang. */
function openDialog(html, bind) {
  const dlg = dialog();
  dlg.innerHTML = `<span class="tape yellow dlg-tape" aria-hidden="true"></span>
    <button type="button" class="dlg-close" aria-label="Tutup"><i class="fa-solid fa-xmark"></i></button>${html}`;
  $('.dlg-close', dlg).addEventListener('click', () => closeDialog());
  if (!dlg.open) dlg.showModal();
  dlg.focus(); // fokus ke kertasnya, bukan ke tombol tutup (cincin fokus di tombol membingungkan)
  dlg.scrollTop = 0;
  if (bind) bind(dlg);
}

function closeDialog() {
  const dlg = dialog();
  if (dlg.open) dlg.close();
}

/** Tombol simpan: nonaktif + teks "Menyimpan…" selama proses, kembali seperti semula sesudahnya. */
async function busy(btn, task) {
  const label = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Menyimpan…';
  try {
    return await task();
  } finally {
    btn.disabled = false;
    btn.innerHTML = label;
  }
}

/* --------------------------------------------------------------------------
   Kenangan: tambah & edit
   -------------------------------------------------------------------------- */
function categoryOptions(memories, selected) {
  const custom = new Map();
  for (const m of memories) {
    const raw = String(m.category || '').trim();
    const key = raw.toLowerCase();
    if (raw && !DEFAULT_CATEGORIES.some(([k]) => k === key) && !custom.has(key)) {
      custom.set(key, raw.charAt(0).toUpperCase() + raw.slice(1));
    }
  }
  const all = [...DEFAULT_CATEGORIES, ...custom];
  const sel = String(selected || '').trim().toLowerCase();
  const known = all.some(([k]) => k === sel);
  return all.map(([k, label]) => `<option value="${escapeHtml(k)}"${k === sel ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')
    + `<option value="__new__"${sel && !known ? ' selected' : ''}>+ kategori baru…</option>`;
}

/**
 * Form kenangan. mem = null untuk kenangan baru.
 * Foto bisa ditambah (HEIC ikut dikonversi), dihapus, dan dijadikan sampul (foto pertama).
 */
export function openMemoryForm(mem, memories) {
  const isNew = !mem;
  const rawDate = (mem && mem.date) || '';
  const date = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
  const time = (mem && mem.time) || (rawDate.includes('T') ? rawDate.split('T')[1].slice(0, 5) : '');
  const category = mem ? mem.category : 'kencan';
  const knownCategory = !category || [...DEFAULT_CATEGORIES.map(([k]) => k), ...memories.map((m) => String(m.category || '').trim().toLowerCase())]
    .includes(String(category).trim().toLowerCase());
  let photos = mem ? [...getMemoryImages(mem)] : [];

  openDialog(`
    <h2 class="dlg-title">${isNew ? 'Kenangan baru' : 'Edit kenangan'}</h2>
    <form class="dlg-form" id="memory-form" novalidate>
      <div class="field">
        <span class="field-label">Foto <small>(foto pertama jadi sampul)</small></span>
        <div class="photo-grid" id="photo-grid"></div>
        <input type="file" id="photo-input" accept="image/*,.heic,.heif" multiple hidden>
      </div>
      <label class="field"><span class="field-label">Judul</span>
        <input type="text" name="title" required maxlength="80" value="${escapeHtml((mem && mem.title) || '')}" placeholder="mis. Kencan pertama di Kudus">
      </label>
      <div class="field-row">
        <label class="field"><span class="field-label">Tanggal</span><input type="date" name="date" required value="${escapeHtml(date)}"></label>
        <label class="field"><span class="field-label">Jam <small>(boleh kosong)</small></span><input type="time" name="time" value="${escapeHtml(time)}"></label>
      </div>
      <label class="field"><span class="field-label">Kategori</span>
        <select name="category">${categoryOptions(memories, category)}</select>
      </label>
      <label class="field new-category" ${knownCategory ? 'hidden' : ''}><span class="field-label">Nama kategori baru</span>
        <input type="text" name="newCategory" maxlength="30" value="${knownCategory ? '' : escapeHtml(category || '')}" placeholder="mis. ulang tahun">
      </label>
      <label class="field"><span class="field-label">Ceritanya</span>
        <textarea name="caption" rows="5" placeholder="Tulis ceritanya di sini…">${escapeHtml((mem && mem.caption) || '')}</textarea>
      </label>
      <label class="check"><input type="checkbox" name="featured" ${!mem || mem.isFeatured !== false ? 'checked' : ''}>
        <span>Tampilkan di <b>Cerita</b> ♡ <small>(jalan cerita memakai 10 kenangan ber-♡ yang paling lama)</small></span>
      </label>
      <div class="field">
        <span class="field-label">Gambar di Cerita</span>
        <div class="gambar-pick">
          <select name="gambar" aria-label="Gambar di Cerita">
            <option value="">Otomatis</option>
            ${SCENE_KEYS.map((k) => `<option value="${k}"${mem && mem.gambar === k ? ' selected' : ''}>${escapeHtml(SCENE_LABELS[k])}</option>`).join('')}
            <option value="none"${mem && mem.gambar === 'none' ? ' selected' : ''}>Tanpa gambar</option>
          </select>
          <div class="gambar-preview" aria-hidden="true"></div>
        </div>
      </div>
      <div class="dlg-actions">
        <button type="button" class="link muted" data-cancel>Batal</button>
        <button type="submit" class="btn">${isNew ? 'Tambahkan' : 'Simpan'}</button>
      </div>
    </form>`, (dlg) => {
    const form = $('#memory-form', dlg);
    const grid = $('#photo-grid', dlg);
    const input = $('#photo-input', dlg);
    const select = form.elements.category;
    const newCat = $('.new-category', dlg);

    const renderPhotos = () => {
      grid.innerHTML = photos.map((url, i) => `
        <figure class="photo-tile${i === 0 ? ' cover' : ''}">
          <img src="${escapeHtml(asset(url))}" alt="">
          ${i === 0 ? '<span class="cover-tag">sampul</span>' : `<button type="button" class="tile-btn star" data-cover="${i}" title="Jadikan sampul" aria-label="Jadikan foto ${i + 1} sampul"><i class="fa-solid fa-star"></i></button>`}
          <button type="button" class="tile-btn remove" data-remove="${i}" title="Hapus foto" aria-label="Hapus foto ${i + 1}"><i class="fa-solid fa-xmark"></i></button>
        </figure>`).join('')
        + '<button type="button" class="photo-add" id="photo-add"><i class="fa-solid fa-plus"></i><span>tambah foto</span></button>';
    };
    renderPhotos();

    grid.addEventListener('click', (e) => {
      if (e.target.closest('#photo-add')) { input.click(); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) { photos.splice(Number(rm.dataset.remove), 1); renderPhotos(); return; }
      const cover = e.target.closest('[data-cover]');
      if (cover) { photos.unshift(...photos.splice(Number(cover.dataset.cover), 1)); renderPhotos(); }
    });
    input.addEventListener('change', async () => {
      const raw = [...(input.files || [])];
      const files = raw.filter(isSupportedImageFile);
      if (!files.length) {
        if (raw.length) showToast('Format foto tidak didukung. Pilih JPG, PNG, WEBP, atau HEIC.');
        return;
      }
      if (files.some(isHeicFile)) showToast('Sedang mengubah foto HEIC, tunggu sebentar…');
      const add = $('#photo-add', dlg);
      add.disabled = true;
      add.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i><span>memproses…</span>';
      for (const file of files) {
        try {
          const dataUrl = await compressAndReadImage(file);
          if (dataUrl) photos.push(dataUrl);
        } catch (err) {
          console.warn('Foto gagal dibaca:', err);
          showToast(`Foto ${file.name || ''} gagal dimuat.`);
        }
      }
      input.value = '';
      renderPhotos();
    });
    select.addEventListener('change', () => {
      newCat.hidden = select.value !== '__new__';
      if (!newCat.hidden) form.elements.newCategory.focus();
    });

    // pratinjau gambar; "Otomatis" ikut menebak dari judul + kategori + cerita yang sedang diketik
    const pick = form.elements.gambar;
    const preview = $('.gambar-preview', dlg);
    const renderPick = () => {
      const f = form.elements;
      const auto = sceneFor({ title: f.title.value, category: select.value === '__new__' ? f.newCategory.value : select.value, caption: f.caption.value });
      pick.options[0].textContent = `Otomatis (${SCENE_LABELS[auto]})`;
      const key = pick.value || auto;
      preview.innerHTML = key === 'none' ? '<span>tanpa gambar</span>' : drawScene(key);
    };
    renderPick();
    pick.addEventListener('change', renderPick);
    let pickTimer = null;
    form.addEventListener('input', (e) => {
      if (e.target === pick || pick.value) return;
      clearTimeout(pickTimer);
      pickTimer = setTimeout(renderPick, 300);
    });
    $('[data-cancel]', dlg).addEventListener('click', () => closeDialog());

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      const title = f.title.value.trim();
      if (!photos.length) { showToast('Tambahkan minimal 1 foto dulu, ya.'); return; }
      if (!title) { showToast('Judulnya belum diisi.'); f.title.focus(); return; }
      if (!f.date.value) { showToast('Tanggalnya belum diisi.'); f.date.focus(); return; }
      let cat = select.value;
      if (cat === '__new__') {
        cat = f.newCategory.value.trim();
        if (!cat) { showToast('Tulis nama kategori barunya.'); f.newCategory.focus(); return; }
      }
      const data = {
        ...(mem || {}),
        id: mem ? mem.id : `mem-${Date.now()}`,
        title,
        date: f.date.value,
        time: f.time.value.trim(),
        category: cat,
        caption: f.caption.value.trim(),
        images: [...photos],
        imgUrl: photos[0],
        isFeatured: f.featured.checked,
        gambar: f.gambar.value
      };
      const ok = await busy($('button[type="submit"]', form), () => syncMemoryToCloud(data));
      if (ok) {
        closeDialog();
        showToast(isNew ? 'Kenangan baru sudah ditempel ♡' : 'Kenangan sudah diperbarui.');
      }
    });
  });
}

/** Tampilkan / sembunyikan dari jalan Cerita. */
export async function toggleFeatured(mem) {
  const next = mem.isFeatured === false;
  const ok = await syncMemoryToCloud({ ...mem, isFeatured: next });
  if (ok) showToast(next ? 'Ditampilkan di Cerita ♡' : 'Disembunyikan dari Cerita.');
  return ok;
}

/** Konfirmasi hapus di kertas yang sama; onDone dipanggil setelah berhasil (mis. menutup lightbox). */
export function confirmDelete(mem, onDone) {
  openDialog(`
    <h2 class="dlg-title">Hapus kenangan ini?</h2>
    <p class="dlg-text">"${escapeHtml(mem.title || 'Kenangan')}" beserta ${getMemoryImages(mem).length} fotonya akan dihapus dari album dan cerita, di versi baru maupun versi lama. Tidak bisa dibatalkan.</p>
    <div class="dlg-actions">
      <button type="button" class="link muted" data-cancel>Batal</button>
      <button type="button" class="btn danger" data-ok>Hapus</button>
    </div>`, (dlg) => {
    $('[data-cancel]', dlg).addEventListener('click', () => closeDialog());
    $('[data-ok]', dlg).addEventListener('click', async (e) => {
      const ok = await busy(e.currentTarget, () => deleteMemoryFromCloud(mem.id));
      if (ok) {
        closeDialog();
        showToast('Kenangan sudah dihapus.');
        if (onDone) onDone();
      }
    });
  });
}

/* --------------------------------------------------------------------------
   Pengaturan: nama, tanggal jadian, ulang tahun, musik, dan dua surat
   -------------------------------------------------------------------------- */
export function openSettingsForm(settings, focus = '') {
  const s = settings || {};
  const p1 = s.person1 || 'Rijal';
  const p2 = s.person2 || 'Silva';
  openDialog(`
    <h2 class="dlg-title">${focus === 'letters' ? 'Edit surat' : 'Pengaturan'}</h2>
    <form class="dlg-form" id="settings-form" novalidate>
      <div class="field-row">
        <label class="field"><span class="field-label">Nama 1</span><input type="text" name="person1" maxlength="30" value="${escapeHtml(s.person1 || '')}" placeholder="Rijal"></label>
        <label class="field"><span class="field-label">Nama 2</span><input type="text" name="person2" maxlength="30" value="${escapeHtml(s.person2 || '')}" placeholder="Silva"></label>
      </div>
      <label class="field"><span class="field-label">Tanggal & jam jadian</span>
        <input type="datetime-local" name="anniversaryDate" value="${escapeHtml((s.anniversaryDate || '').slice(0, 16))}">
      </label>
      <div class="field-row">
        <label class="field"><span class="field-label">Ulang tahun <span data-name="1">${escapeHtml(p1)}</span> <small>(BB-TT)</small></span>
          <input type="text" name="birthdayPerson1" inputmode="numeric" pattern="\\d{2}-\\d{2}" maxlength="5" placeholder="11-22" value="${escapeHtml(s.birthdayPerson1 || '')}"></label>
        <label class="field"><span class="field-label">Ulang tahun <span data-name="2">${escapeHtml(p2)}</span> <small>(BB-TT)</small></span>
          <input type="text" name="birthdayPerson2" inputmode="numeric" pattern="\\d{2}-\\d{2}" maxlength="5" placeholder="09-24" value="${escapeHtml(s.birthdayPerson2 || '')}"></label>
      </div>
      <label class="field"><span class="field-label">Link musik <small>(mp3; kosongkan untuk lagu bawaan)</small></span>
        <input type="url" name="musicUrl" value="${escapeHtml(s.musicUrl || '')}" placeholder="https://…/lagu.mp3">
      </label>
      <label class="field" id="letter-1"><span class="field-label">Surat dari <span data-name="1">${escapeHtml(p1)}</span></span>
        <textarea name="letterMessage" rows="8" class="lined">${escapeHtml(s.letterMessage || '')}</textarea>
      </label>
      <label class="field"><span class="field-label">Surat dari <span data-name="2">${escapeHtml(p2)}</span></span>
        <textarea name="letterMessage2" rows="8" class="lined">${escapeHtml(s.letterMessage2 || '')}</textarea>
      </label>
      <p class="dlg-hint">Pisahkan paragraf surat dengan satu baris kosong.</p>
      <div class="dlg-actions">
        <button type="button" class="link muted" data-cancel>Batal</button>
        <button type="submit" class="btn">Simpan</button>
      </div>
    </form>`, (dlg) => {
    const form = $('#settings-form', dlg);
    // label nama ikut berubah saat nama diketik
    for (const n of ['1', '2']) {
      form.elements[`person${n}`].addEventListener('input', (e) => {
        $$(`[data-name="${n}"]`, dlg).forEach((el) => { el.textContent = e.target.value.trim() || (n === '1' ? 'Rijal' : 'Silva'); });
      });
    }
    if (focus === 'letters') setTimeout(() => $('#letter-1', dlg).scrollIntoView({ block: 'start' }), 50);
    $('[data-cancel]', dlg).addEventListener('click', () => closeDialog());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = form.elements;
      for (const name of ['birthdayPerson1', 'birthdayPerson2']) {
        const v = f[name].value.trim();
        if (v && !/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v)) {
          showToast('Format ulang tahun: bulan-tanggal, mis. 09-24.');
          f[name].focus();
          return;
        }
      }
      const updated = {
        ...s,
        person1: f.person1.value.trim() || p1,
        person2: f.person2.value.trim() || p2,
        anniversaryDate: f.anniversaryDate.value || s.anniversaryDate || '',
        birthdayPerson1: f.birthdayPerson1.value.trim() || s.birthdayPerson1 || '11-22',
        birthdayPerson2: f.birthdayPerson2.value.trim() || s.birthdayPerson2 || '09-24',
        musicUrl: f.musicUrl.value.trim(),
        letterMessage: f.letterMessage.value.trim(),
        letterMessage2: f.letterMessage2.value.trim()
      };
      const ok = await busy($('button[type="submit"]', form), () => syncSettingsToCloud(updated));
      if (ok) {
        closeDialog();
        showToast(focus === 'letters' ? 'Surat sudah disimpan ♡' : 'Pengaturan sudah disimpan.');
      }
    });
  });
}

/* --------------------------------------------------------------------------
   Halaman buku di hero: pilih sampai 6 foto, urutannya sesuai urutan dipilih
   -------------------------------------------------------------------------- */
export function openBookPicker(memories, settings) {
  const all = [];
  for (const m of memories) {
    getMemoryImages(m).forEach((url, photoIndex) => all.push({
      id: `${m.id}#${photoIndex}`, memoryId: m.id, photoIndex, imgUrl: url,
      title: m.title || 'Momen Spesial', formattedDate: formatIndoDate(m.date) || 'Kenangan Berdua'
    }));
  }
  const current = Array.isArray(settings && settings.scrapbookCustomPages) ? settings.scrapbookCustomPages : [];
  let picked = current.map((p) => `${p.memoryId}#${p.photoIndex || 0}`).filter((key) => all.some((a) => a.id === key));

  openDialog(`
    <h2 class="dlg-title">Foto di buku</h2>
    <p class="dlg-text">Pilih sampai ${MAX_BOOK_PAGES} foto. Urutan halaman mengikuti urutan kamu memilih.</p>
    <div class="pick-grid" id="pick-grid"></div>
    <div class="dlg-actions">
      <button type="button" class="link muted" data-reset>Pakai pilihan bawaan</button>
      <button type="button" class="btn" data-save>Simpan</button>
    </div>`, (dlg) => {
    const grid = $('#pick-grid', dlg);
    const render = () => {
      grid.innerHTML = all.map((a) => {
        const n = picked.indexOf(a.id);
        return `<button type="button" class="pick${n >= 0 ? ' on' : ''}" data-id="${escapeHtml(a.id)}" aria-pressed="${n >= 0}" title="${escapeHtml(a.title)}">
          <img src="${escapeHtml(asset(a.imgUrl))}" alt="" loading="lazy">${n >= 0 ? `<b>${n + 1}</b>` : ''}</button>`;
      }).join('');
    };
    render();
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('.pick');
      if (!b) return;
      const id = b.dataset.id;
      if (picked.includes(id)) picked = picked.filter((x) => x !== id);
      else if (picked.length >= MAX_BOOK_PAGES) { showToast(`Maksimal ${MAX_BOOK_PAGES} foto untuk buku.`); return; }
      else picked.push(id);
      render();
    });
    const save = async (btn, list) => {
      const pages = list.map((id, idx) => {
        const a = all.find((x) => x.id === id);
        return { id: `page_${Date.now()}_${idx}`, memoryId: a.memoryId, photoIndex: a.photoIndex, imgUrl: a.imgUrl, title: a.title, formattedDate: a.formattedDate };
      });
      const updated = {
        ...settings,
        scrapbookCustomPages: pages.length ? pages : null,
        scrapbookPageRefs: pages.length ? pages.map((p) => ({ memoryId: p.memoryId, photoIndex: p.photoIndex, id: p.id })) : null
      };
      const ok = await busy(btn, () => syncSettingsToCloud(updated));
      if (ok) {
        saveScrapbookCustomPages(pages.length ? pages : null);
        closeDialog();
        showToast(pages.length ? `Buku sekarang ${pages.length} halaman.` : 'Buku kembali ke pilihan bawaan.');
      }
    };
    $('[data-save]', dlg).addEventListener('click', (e) => save(e.currentTarget, picked));
    $('[data-reset]', dlg).addEventListener('click', (e) => save(e.currentTarget, []));
  });
}
