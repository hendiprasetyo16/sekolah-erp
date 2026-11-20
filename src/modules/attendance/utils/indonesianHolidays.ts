// src/modules/attendance/utils/indonesianHolidays.ts
import type {
  HolidayCategoryType,
  WorkDaysMode,
} from '../types/attendance.types';

export type { WorkDaysMode, HolidayCategoryType };

export interface HolidayRecord {
  id: string;
  schoolId: string | null;
  date: string; // Format YYYY-MM-DD
  name: string;
  type?: HolidayCategoryType;
}

/**
 * Mengecek apakah suatu tanggal (YYYY-MM-DD) merupakan Tanggal Merah:
 * - Hari Minggu (selalu merah)
 * - Hari Sabtu (merah jika sekolah memilih mode FIVE_DAYS / 5 hari kerja)
 * - Hari Libur Nasional / Cuti Bersama / Libur Sekolah yang tercatat di database
 */
export function checkRedDateStatus(
  dateStr: string,
  holidaysMap: Record<string, string> = {},
  workDaysMode: WorkDaysMode = 'SIX_DAYS'
): {
  isRedDate: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  holidayName: string | null;
} {
  const dateObj = new Date(`${dateStr}T00:00:00`);
  const dayOfWeek = dateObj.getDay(); // 0 = Minggu, 6 = Sabtu
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const includeSaturday = workDaysMode === 'FIVE_DAYS';

  const dbHolidayName = holidaysMap[dateStr] || null;

  const isRedDate =
    isSunday || (includeSaturday && isSaturday) || Boolean(dbHolidayName);

  let holidayName = dbHolidayName;
  if (!holidayName && isSunday) {
    holidayName = 'Libur Akhir Pekan (Hari Minggu)';
  } else if (!holidayName && includeSaturday && isSaturday) {
    holidayName = 'Libur Akhir Pekan (Hari Sabtu — 5 Hari Kerja)';
  }

  return {
    isRedDate,
    isSunday,
    isSaturday,
    holidayName,
  };
}