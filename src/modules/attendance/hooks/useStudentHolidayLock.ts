// ============================================================================
// FILE: src/modules/attendance/hooks/useStudentHolidayLock.ts
// FUNGSI: Wrapper kompatibel untuk pengunci presensi hari libur SISWA
// ============================================================================

import type { SupportedAttendanceLocale } from '../types/attendance.types';
import {
  useHolidayLock,
  getTodayLocalISO,
  type HolidayLockState,
} from './useHolidayLock';

export { getTodayLocalISO };
export type StudentHolidayLockState = HolidayLockState;

export function useStudentHolidayLock(params?: {
  schoolId?: string;
  targetDate?: string;
  lang?: SupportedAttendanceLocale;
}): StudentHolidayLockState {
  return useHolidayLock({
    target: 'SISWA',
    schoolId: params?.schoolId,
    targetDate: params?.targetDate,
    lang: params?.lang,
  });
}