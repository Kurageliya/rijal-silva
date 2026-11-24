/**
 * Counter Service
 * Menghitung waktu jadian real-time (Tahun, Bulan, Hari, Jam, Menit, Detik).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Tanggal + n bulan, dengan jam yang sama. Kalau tanggalnya tidak ada di bulan
 * tujuan (misal 31 → Februari), dipakai hari terakhir bulan itu.
 */
function addMonths(date, n) {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + n);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

/**
 * Lama bersama menurut kalender: tepat di tanggal & jam jadian setiap bulan,
 * bulan bertambah satu dan hari kembali ke 0.
 */
export function calculateTimeUnits(anniversaryDateStr, now = new Date()) {
  const start = new Date(anniversaryDateStr);

  let totalMonths = 0;
  let rest = 0;
  if (now > start) {
    totalMonths = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
    if (addMonths(start, totalMonths) > now) totalMonths--;
    rest = now - addMonths(start, totalMonths);
  }

  const pad = (n) => String(n).padStart(2, '0');
  return {
    years: pad(Math.floor(totalMonths / 12)),
    months: pad(totalMonths % 12),
    days: pad(Math.floor(rest / MS_PER_DAY)),
    hours: pad(Math.floor(rest / 3600000) % 24),
    minutes: pad(Math.floor(rest / 60000) % 60),
    seconds: pad(Math.floor(rest / 1000) % 60),
    totalDays: Math.max(0, Math.floor((now - start) / MS_PER_DAY))
  };
}

let counterInterval = null;

export function startLiveCounter(getAnniversaryDate, onTick) {
  function tick() {
    const dateStr = typeof getAnniversaryDate === 'function' ? getAnniversaryDate() : getAnniversaryDate;
    if (!dateStr) return;
    const units = calculateTimeUnits(dateStr);
    if (typeof onTick === 'function') {
      onTick(units);
    }
  }

  tick();
  if (counterInterval) clearInterval(counterInterval);
  counterInterval = setInterval(tick, 1000);
  return counterInterval;
}
