// src/modules/attendance/utils/indonesianHolidays.ts
import type {
  HolidayCategoryType,
  SupportedAttendanceLocale,
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

export type RedDateReasonCode =
  | 'SUNDAY'
  | 'SATURDAY_FIVE_DAYS'
  | 'HOLIDAY'
  | null;

/**
 * Mengecek apakah suatu tanggal (YYYY-MM-DD) merupakan Tanggal Merah:
 * - Hari Minggu (selalu merah)
 * - Hari Sabtu (merah jika sekolah memilih mode FIVE_DAYS / 5 hari kerja)
 * - Hari Libur Nasional / Cuti Bersama / Libur Sekolah yang tercatat di database
 */
export function checkRedDateStatus(
  dateStr: string,
  holidaysMap: Record<string, string> = {},
  workDaysMode: WorkDaysMode = 'SIX_DAYS',
  lang: SupportedAttendanceLocale = 'id'
): {
  isRedDate: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  reasonCode: RedDateReasonCode;
  holidayName: string | null;
} {
  const [yStr, mStr, dStr] = dateStr.split('-');
  const utcDate = new Date(
    Date.UTC(Number(yStr) || 2026, (Number(mStr) || 1) - 1, Number(dStr) || 1)
  );
  const dayOfWeek = utcDate.getUTCDay(); // 0 = Minggu, 6 = Sabtu
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const includeSaturday = workDaysMode === 'FIVE_DAYS';

  const dbHolidayName = holidaysMap[dateStr] || null;

  const isRedDate =
    isSunday || (includeSaturday && isSaturday) || Boolean(dbHolidayName);

  let reasonCode: RedDateReasonCode = null;
  let holidayName = dbHolidayName;

  if (dbHolidayName) {
    reasonCode = 'HOLIDAY';
  } else if (isSunday) {
    reasonCode = 'SUNDAY';
    holidayName =
      lang === 'en'
        ? 'Weekend Holiday (Sunday)'
        : 'Libur Akhir Pekan (Hari Minggu)';
  } else if (includeSaturday && isSaturday) {
    reasonCode = 'SATURDAY_FIVE_DAYS';
    holidayName =
      lang === 'en'
        ? 'Weekend Holiday (Saturday — 5-Day Workweek)'
        : 'Libur Akhir Pekan (Hari Sabtu — 5 Hari Kerja)';
  }

  return {
    isRedDate,
    isSunday,
    isSaturday,
    reasonCode,
    holidayName,
  };
}