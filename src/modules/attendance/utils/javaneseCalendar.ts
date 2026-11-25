// src/modules/attendance/utils/javaneseCalendar.ts
import type { SupportedAttendanceLocale } from '../types/attendance.types';

export interface JavaneseDateInfo {
  /** Nama hari Masehi sesuai bahasa aktif ("Minggu" / "Sunday") */
  dayName: string;
  /** Nama pasaran Jawa ("Pahing") */
  pasaran: string;
  /** Gabungan hari dan pasaran ("Minggu Pahing" / "Sunday Pahing") */
  hariPasaran: string;
  /** Tanggal dalam bulan Jawa, angka 1 s.d. 30 */
  javaneseDay: number;
  /** Nama bulan Jawa ("Jumadilawal") */
  javaneseMonth: string;
  /** Tahun Jawa (contoh: 1960) */
  javaneseYear: number;
  /** Nama tahun dalam siklus Windu ("Alip") */
  winduYearName: string;
  /** Format ringkas tanggal Jawa + pasaran ("21 Pahing") */
  shortJavaneseDate: string;
  /** Format super singkat untuk layar sangat sempit ("21 Ph") */
  compactJavaneseDate: string;
  /** Format lengkap */
  fullFormattedDate: string;
}

const HARI_LABELS: Record<SupportedAttendanceLocale, readonly string[]> = {
  id: ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const PASARAN_LIST = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'] as const;

const PASARAN_SHORT_MAP: Record<string, string> = {
  Legi: 'Lg',
  Pahing: 'Ph',
  Pon: 'Pn',
  Wage: 'Wg',
  Kliwon: 'Kl',
};

const BULAN_MASEHI_LABELS: Record<SupportedAttendanceLocale, readonly string[]> = {
  id: [
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
  ],
  en: [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ],
};

const BULAN_JAWA = [
  'Sura',
  'Sapar',
  'Mulud',
  'Bakda Mulud',
  'Jumadilawal',
  'Jumadilakir',
  'Rejeb',
  'Ruwah',
  'Pasa',
  'Sawal',
  'Dulkangidah',
  'Besar',
] as const;

const TAHUN_WINDU = [
  'Alip',
  'Ehe',
  'Jimawal',
  'Je',
  'Dal',
  'Be',
  'Wawu',
  'Jimakir',
] as const;

const PANJANG_TAHUN_WINDU = [354, 355, 354, 355, 354, 354, 354, 355] as const;
const TOTAL_HARI_SATU_WINDU = 2835;

// Epoch: 1 Sura 1936 Ja (Tahun Alip) = Selasa Wage, 4 Maret 2003
const EPOCH_JAWA_YEAR = 1936;
const EPOCH_PASARAN_INDEX = 3; // Wage
const EPOCH_UTC_MS = Date.UTC(2003, 2, 4);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDateParts(isoDate: string): { year: number; month: number; day: number } {
  const [yStr, mStr, dStr] = isoDate.split('-');
  return {
    year: Number(yStr) || 2026,
    month: Number(mStr) || 1,
    day: Number(dStr) || 1,
  };
}

export function getJavaneseDateInfo(
  isoDate: string,
  lang: SupportedAttendanceLocale = 'id'
): JavaneseDateInfo {
  const { year, month, day } = parseIsoDateParts(isoDate);
  const targetUtcMs = Date.UTC(year, month - 1, day);
  const utcDate = new Date(targetUtcMs);

  const dayOfWeek = utcDate.getUTCDay();
  const dayName = HARI_LABELS[lang][dayOfWeek];

  const diffDaysFromEpoch = Math.floor((targetUtcMs - EPOCH_UTC_MS) / MS_PER_DAY);
  const pasaranIndex = (((diffDaysFromEpoch + EPOCH_PASARAN_INDEX) % 5) + 5) % 5;
  const pasaran = PASARAN_LIST[pasaranIndex];

  let winduCount = Math.floor(diffDaysFromEpoch / TOTAL_HARI_SATU_WINDU);
  let remainingDays = diffDaysFromEpoch - winduCount * TOTAL_HARI_SATU_WINDU;

  if (remainingDays < 0) {
    winduCount -= 1;
    remainingDays += TOTAL_HARI_SATU_WINDU;
  }

  let javaneseYear = EPOCH_JAWA_YEAR + winduCount * 8;
  let winduIndex = 0;

  while (remainingDays >= PANJANG_TAHUN_WINDU[winduIndex]) {
    remainingDays -= PANJANG_TAHUN_WINDU[winduIndex];
    javaneseYear += 1;
    winduIndex += 1;
  }

  const isTahunWuntu = PANJANG_TAHUN_WINDU[winduIndex] === 355;
  const winduYearName = TAHUN_WINDU[winduIndex];

  const monthLengths = [
    30,
    29,
    30,
    29,
    30,
    29,
    30,
    29,
    30,
    29,
    30,
    isTahunWuntu ? 30 : 29,
  ];

  let javaneseMonthIndex = 0;
  while (javaneseMonthIndex < 11 && remainingDays >= monthLengths[javaneseMonthIndex]) {
    remainingDays -= monthLengths[javaneseMonthIndex];
    javaneseMonthIndex += 1;
  }

  const javaneseDay = remainingDays + 1;
  const javaneseMonth = BULAN_JAWA[javaneseMonthIndex];
  const bulanMasehiName = BULAN_MASEHI_LABELS[lang][month - 1] ?? '';

  const hariPasaran = `${dayName} ${pasaran}`;
  const shortJavaneseDate = `${javaneseDay} ${pasaran}`;
  const compactJavaneseDate = `${javaneseDay} ${PASARAN_SHORT_MAP[pasaran] ?? pasaran}`;
  const fullFormattedDate = `${hariPasaran}, ${day} ${bulanMasehiName} ${year} (${javaneseDay} ${javaneseMonth} ${javaneseYear} Ja)`;

  return {
    dayName,
    pasaran,
    hariPasaran,
    javaneseDay,
    javaneseMonth,
    javaneseYear,
    winduYearName,
    shortJavaneseDate,
    compactJavaneseDate,
    fullFormattedDate,
  };
}

export function getJavaneseMonthRangeLabel(
  year: number,
  monthIndexZeroBased: number
): string {
  const firstDayIso = `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}-01`;
  const lastDayNumber = new Date(
    Date.UTC(year, monthIndexZeroBased + 1, 0)
  ).getUTCDate();
  const lastDayIso = `${year}-${String(monthIndexZeroBased + 1).padStart(2, '0')}-${String(lastDayNumber).padStart(2, '0')}`;

  const startInfo = getJavaneseDateInfo(firstDayIso);
  const endInfo = getJavaneseDateInfo(lastDayIso);

  if (
    startInfo.javaneseMonth === endInfo.javaneseMonth &&
    startInfo.javaneseYear === endInfo.javaneseYear
  ) {
    return `${startInfo.javaneseDay} – ${endInfo.javaneseDay} ${startInfo.javaneseMonth} ${startInfo.javaneseYear} Ja`;
  }

  return `${startInfo.javaneseDay} ${startInfo.javaneseMonth} ${startInfo.javaneseYear} Ja - ${endInfo.javaneseDay} ${endInfo.javaneseMonth} ${endInfo.javaneseYear} Ja`;
}