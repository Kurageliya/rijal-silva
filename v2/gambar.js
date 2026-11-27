/* ==========================================================================
   Gambar line art di Cerita (dibuat di Gemini, lalu dipisah oleh docs/tools/LineArt.java):
     assets/cerita/<adegan>-garis.png  bentuk garis saja, dipakai sebagai CSS mask. Warnanya ikut mode
                                        (--art-line: merah tua di mode krem, merah muda di mode gelap).
     assets/cerita/<adegan>-warna.png  aksen berwarna (jepit bintang biru, jubah cukur), warnanya tetap.

   Tiap kenangan dapat satu adegan. Kalau editor belum memilih (field `gambar`),
   adegan ditebak dari judul, kategori, dan ceritanya.
   ========================================================================== */

const DIR = new URL('../assets/cerita/', import.meta.url);

/** adegan yang gambarnya ada: [lebar, tinggi] file -garis/-warna, dan nama di pilihan editor.
    pudar: gambar setengah badan yang terpotong di tepi bawah, jadi bagian bawahnya dibuat memudar. */
const SCENES = {
  chat: { size: [560, 508], label: 'Chat-an (pegang HP)' },
  ketemu: { size: [560, 603], label: 'Pertama ketemu (deg-degan)' },
  janji: { size: [560, 545], label: 'Janji kelingking' },
  makan: { size: [560, 517], label: 'Makan bareng' },
  pisah: { size: [560, 610], label: 'Perpisahan (dadah)' },
  cukur: { size: [560, 515], label: 'Potong rambut' },
  pulang: { size: [560, 661], label: 'Senja, bergandengan' },
  pantai: { size: [560, 506], label: 'Ke pantai' },
  ultah: { size: [560, 447], label: 'Ulang tahun (selfie + kue)', pudar: true },
  bianglala: { size: [560, 402], label: 'Naik bianglala' },
  game: { size: [560, 429], label: 'Main game bareng' },
  bareng: { size: [560, 583], label: 'Berdua melambai' },
};

export const SCENE_KEYS = Object.keys(SCENES);
export const SCENE_LABELS = Object.fromEntries(SCENE_KEYS.map((k) => [k, SCENES[k].label]));

/* Tebakan otomatis dari judul + kategori + cerita. Urutan penting: yang lebih spesifik di atas. */
const RULES = [
  ['ultah', /ultah|ulang ta?h?un|birthday|b'?day|milad/],
  ['bianglala', /bianglala|ferris|saloka|wahana|taman bermain|dufan|pasar malam|kincir/],
  ['game', /main game|\bgames?\b|gaming|playstation|\bps ?[345]?\b|private room|mabar|konsol/],
  ['chat', /whats ?app|\bwa\b|chat|pesan pertama|\bdm\b/],
  ['pantai', /pantai|laut|beach/],
  ['cukur', /rambut|cukur|barber|potong/],
  ['makan', /makan|steak|kuliner|jajan|resto|cafe|kafe|ngopi|dinner|lunch/],
  ['pisah', /pisah|perpisahan|dadah|goodbye/],
  ['pulang', /back to reality|pulang|nyesek|remnants|senja/],
  ['janji', /resmi|jadian|pacaran|janji|menyatakan|perasaan|nembak/],
  ['ketemu', /first meet|ketemu|bertemu|gugup|pertemuan/],
];

export function sceneFor(mem) {
  if (mem && mem.gambar) return mem.gambar === 'none' || SCENES[mem.gambar] ? mem.gambar : 'bareng';
  const hay = `${mem?.title || ''} | ${mem?.category || ''} | ${mem?.caption || ''}`.toLowerCase();
  for (const [key, re] of RULES) if (re.test(hay)) return key;
  return 'bareng';
}

export function drawScene(key) {
  const sc = SCENES[key];
  if (!sc) return '';
  const [w, h] = sc.size;
  const garis = new URL(`${key}-garis.png`, DIR).href;
  const mask = `url('${garis}') center / contain no-repeat`;
  return `<div class="lineart${sc.pudar ? ' pudar' : ''}" style="aspect-ratio:${w} / ${h}">`
    + `<span class="garis" style="-webkit-mask:${mask};mask:${mask}"></span>`
    + `<img class="warna" src="${new URL(`${key}-warna.png`, DIR).href}" alt="" width="${w}" height="${h}" loading="lazy" decoding="async">`
    + '</div>';
}
