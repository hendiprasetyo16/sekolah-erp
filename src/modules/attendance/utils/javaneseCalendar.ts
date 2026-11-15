// src/modules/attendance/utils/javaneseCalendar.ts

export type JavanesePasaran = 'Wage' | 'Kliwon' | 'Legi' | 'Pahing' | 'Pon';

const PASARAN_LIST: JavanesePasaran[] = [
  'Wage',
  'Kliwon',
  'Legi',
  'Pahing',
  'Pon',
];

const PASARAN_SHORT_MAP: Record<JavanesePasaran, string> = {
  Legi: 'Lg',
  Pahing: 'Ph',
  Pon: 'Pn',
  Wage: 'Wg',
  Kliwon: 'Kl',
};

const HARI_INDONESIA = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

export const BULAN_INDONESIA = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export interface JavaneseDateInfo {
  isoDate: string;
  dayNumber: number;
  dayOfWeek: number; // 0 = Minggu, 6 = Sabtu
  hariName: string; // Contoh: "Rabu"
  pasaran: JavanesePasaran; // Contoh: "Legi"
  pasaranShort: string; // Contoh: "Lg"
  hariPasaran: string; // Contoh: "Rabu Legi"
  fullFormattedDate: string; // Contoh: "18 Februari 2026 (Rabu Legi)"
}

/**
 * Menghitung Hari & Pasaran Jawa secara akurat berbasis UTC
 * Patokan: 17 Agustus 1945 = Jumat Legi
 */
export function getJavaneseDateInfo(isoDate: string): JavaneseDateInfo {
  const [yStr, mStr, dStr] = isoDate.split('-');
  const year = Number(yStr) || 2026;
  const month = Number(mStr) || 1;
  const day = Number(dStr) || 1;

  const utcMs = Date.UTC(year, month - 1, day);
  const utcDays = Math.floor(utcMs / 86400000);
  const dateObj = new Date(utcMs);
  const dayOfWeek = dateObj.getUTCDay();

  const pasaranIndex = ((utcDays % 5) + 5) % 5;
  const pasaran = PASARAN_LIST[pasaranIndex];
  const pasaranShort = PASARAN_SHORT_MAP[pasaran];
  const hariName = HARI_INDONESIA[dayOfWeek];
  const bulanName = BULAN_INDONESIA[month - 1] ?? '';

  return {
    isoDate,
    dayNumber: day,
    dayOfWeek,
    hariName,
    pasaran,
    pasaranShort,
    hariPasaran: `${hariName} ${pasaran}`,
    fullFormattedDate: `${day} ${bulanName} ${year} (${hariName} ${pasaran})`,
  };
}

/**
 * Membangun array sel kalender untuk 1 bulan tertentu (termasuk sel kosong awal bulan)
 */
export function buildMonthCalendarCells(
  year: number,
  monthIndex0: number
): Array<JavaneseDateInfo | null> {
  const firstDayUtc = new Date(Date.UTC(year, monthIndex0, 1));
  const startWeekday = firstDayUtc.getUTCDay(); // 0 = Minggu
  const daysInMonth = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();

  const cells: Array<JavaneseDateInfo | null> = [];

  // Sel kosong sebelum tanggal 1
  for (let i = 0; i < startWeekday; i++) {
    cells.push(null);
  }

  // Isi tanggal 1 sampai akhir bulan
  const monthStr = String(monthIndex0 + 1).padStart(2, '0');
  for (let d = 1; d <= daysInMonth; d++) {
    const dayStr = String(d).padStart(2, '0');
    const isoDate = `${year}-${monthStr}-${dayStr}`;
    cells.push(getJavaneseDateInfo(isoDate));
  }

  return cells;
}