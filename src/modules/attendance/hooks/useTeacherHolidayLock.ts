// ============================================================================
// FILE: src/modules/attendance/hooks/useTeacherHolidayLock.ts
// FUNGSI: Wrapper kompatibel untuk pengunci presensi hari libur GURU
// ============================================================================

import type {
  SpecialEventTargetType,
  SupportedAttendanceLocale,
  WorkDaysMode,
} from '../types/attendance.types';
import { useHolidayLock, type HolidayLockState } from './useHolidayLock';

export type { SpecialEventTargetType };

interface UseTeacherHolidayLockParams {
  schoolId: string;
  targetDate: string;
  dbHolidaysMap?: Record<string, string>;
  workDaysMode?: WorkDaysMode;
  lang?: SupportedAttendanceLocale;
}

export interface TeacherHolidayLockState extends HolidayLockState {
  loading: boolean;
  isSpecialEvent: boolean;
  reason: string;
}

export function useTeacherHolidayLock({
  schoolId,
  targetDate,
  dbHolidaysMap,
  workDaysMode,
  lang = 'id',
}: UseTeacherHolidayLockParams) {
  const base = useHolidayLock({
    target: 'GURU',
    schoolId,
    targetDate,
    dbHolidaysMap,
    workDaysMode,
    lang,
  });

  const resolvedReason = base.isSpecialEventActive
    ? base.specialEventReason
    : base.isHoliday
      ? base.holidayName ||
        (lang === 'en'
          ? 'School / Weekend Holiday'
          : 'Hari Libur Sekolah / Akhir Pekan')
      : lang === 'en'
        ? 'Regular Workday'
        : 'Hari Kerja Normal';

  const enableTeacherSpecialEvent = async (
    title: string,
    userId?: string | null
  ): Promise<void> => {
    await base.activateSpecialEvent(title, userId);
  };

  const disableTeacherSpecialEvent = async (): Promise<void> => {
    await base.deactivateSpecialEvent();
  };

  return {
    ...base,
    loading: base.isLoading,
    isSpecialEvent: base.isSpecialEventActive,
    reason: resolvedReason,
    refreshHolidayLock: base.refreshLockState,
    enableTeacherSpecialEvent,
    disableTeacherSpecialEvent,
  };
}