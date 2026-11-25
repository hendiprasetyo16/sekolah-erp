// ============================================================================
// FILE: src/modules/attendance/hooks/useStudentHolidayLock.ts
// FUNGSI UTAMA: PENGATURAN LOCK (PENGUNCI) PRESENSI HARI LIBUR & HARI MINGGU/SABTU
//               SERTA PEMBUKAAN KUNCI SEMENTARA UNTUK KEGIATAN KHUSUS SEKOLAH
// DIGUNAKAN DI:
//   1. Halaman Kiosk Siswa (StudentKioskPage.tsx)
//   2. Halaman Presensi Siswa per Kelas (StudentClassAttendancePage.tsx)
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type {
  SpecialEventTargetType,
  SupportedAttendanceLocale,
  WorkDaysMode,
} from '../types/attendance.types';
import { getSchoolDateString } from '../services/gps.utils';
import { checkRedDateStatus } from '../utils/indonesianHolidays';

const ALLOWED_OVERRIDE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
] as const;

const DEFAULT_EVENT_REASON_ID = 'Kegiatan Khusus Sekolah';
const DEFAULT_EVENT_REASON_EN = 'Special School Event';
const OVERRIDE_LOCAL_STORAGE_PREFIX = 'sekolah_erp_special_event_siswa';

interface SpecialEventStudentRow {
  id: string;
  eventDate: string;
  reason: string | null;
  targetType: string | null;
  isActive: boolean;
}

export interface StudentHolidayLockState {
  isLocked: boolean;
  isHoliday: boolean;
  holidayName: string;
  isSpecialEventActive: boolean;
  specialEventReason: string;
  canManageOverride: boolean;
  isLoading: boolean;
  isToggling: boolean;
  activateSpecialEvent: (reason?: string) => Promise<void>;
  deactivateSpecialEvent: () => Promise<void>;
  refreshLockState: () => Promise<void>;
}

function normalizeTargetType(raw: string | null | undefined): SpecialEventTargetType {
  const upper = String(raw ?? 'ALL').trim().toUpperCase();
  if (upper === 'GURU' || upper === 'SISWA' || upper === 'ALL') {
    return upper;
  }
  return 'ALL';
}

export function getTodayLocalISO(timeZone: string = 'Asia/Jakarta'): string {
  return getSchoolDateString(new Date(), timeZone);
}

function getLocalOverrideKey(schoolId: string, dateISO: string): string {
  return `${OVERRIDE_LOCAL_STORAGE_PREFIX}_${schoolId}_${dateISO}`;
}

export function useStudentHolidayLock(params?: {
  schoolId?: string;
  targetDate?: string;
  lang?: SupportedAttendanceLocale;
}): StudentHolidayLockState {
  const { user, school } = useAuthStore();
  const lang: SupportedAttendanceLocale = params?.lang ?? 'id';
  const defaultEventReason =
    lang === 'en' ? DEFAULT_EVENT_REASON_EN : DEFAULT_EVENT_REASON_ID;

  const schoolWithSettings = school as
    | (typeof school & { settings?: { timezone?: unknown } })
    | null;

  const schoolTimeZone =
    typeof schoolWithSettings?.settings?.timezone === 'string' &&
    schoolWithSettings.settings.timezone.trim()
      ? schoolWithSettings.settings.timezone.trim()
      : 'Asia/Jakarta';

  const activeSchoolId = params?.schoolId || school?.id || user?.schoolId || '';
  const activeDate = params?.targetDate || getTodayLocalISO(schoolTimeZone);

  const [isHoliday, setIsHoliday] = useState<boolean>(false);
  const [holidayName, setHolidayName] = useState<string>('');
  const [isSpecialEventActive, setIsSpecialEventActive] = useState<boolean>(false);
  const [specialEventReason, setSpecialEventReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  const userWithAdditionalRoles = user as
    | (typeof user & { additionalRoles?: string[] })
    | null;

  const allUserRoles: string[] = [
    ...(userWithAdditionalRoles?.role ? [userWithAdditionalRoles.role] : []),
    ...(Array.isArray(userWithAdditionalRoles?.additionalRoles)
      ? userWithAdditionalRoles.additionalRoles
      : []),
  ];

  const canManageOverride = allUserRoles.some((role) =>
    (ALLOWED_OVERRIDE_ROLES as readonly string[]).includes(role)
  );

  const refreshLockState = useCallback(async () => {
    if (!activeSchoolId || activeDate.length !== 10) {
      setIsHoliday(false);
      setHolidayName('');
      setIsSpecialEventActive(false);
      setSpecialEventReason('');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const [schoolRes, holidayRes, specialEventRes] = await Promise.all([
        supabase
          .from('schools')
          .select('workDaysMode')
          .eq('id', activeSchoolId)
          .maybeSingle(),
        supabase
          .from('national_holidays')
          .select('id, schoolId, date, name')
          .eq('date', activeDate),
        supabase
          .from('school_special_events')
          .select('id, eventDate, reason, targetType, isActive')
          .eq('schoolId', activeSchoolId)
          .eq('eventDate', activeDate),
      ]);

      if (schoolRes.error) throw schoolRes.error;

      const workDaysMode: WorkDaysMode =
        schoolRes.data?.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS';

      const holidaysMap: Record<string, string> = {};
      if (!holidayRes.error && holidayRes.data && holidayRes.data.length > 0) {
        const rows = holidayRes.data as Array<{
          schoolId: string | null;
          name: string;
        }>;
        const schoolSpecific = rows.find((r) => r.schoolId === activeSchoolId);
        const globalHoliday = rows.find((r) => r.schoolId === null);
        const matched = schoolSpecific ?? globalHoliday;
        if (matched) {
          holidaysMap[activeDate] = matched.name;
        }
      }

      const redStatus = checkRedDateStatus(
        activeDate,
        holidaysMap,
        workDaysMode,
        lang
      );

      setIsHoliday(redStatus.isRedDate);
      setHolidayName(redStatus.holidayName ?? '');

      let overrideActive = false;
      let overrideText = '';

      if (!specialEventRes.error && Array.isArray(specialEventRes.data)) {
        const eventRows = specialEventRes.data as SpecialEventStudentRow[];
        const activeForStudents = eventRows.find((row) => {
          if (!row.isActive) return false;
          const target = normalizeTargetType(row.targetType);
          return target === 'SISWA' || target === 'ALL';
        });

        if (activeForStudents) {
          overrideActive = true;
          overrideText =
            String(activeForStudents.reason || '').trim() || defaultEventReason;
        }
      } else if (specialEventRes.error) {
        try {
          const savedLocal = localStorage.getItem(
            getLocalOverrideKey(activeSchoolId, activeDate)
          );
          if (savedLocal) {
            const parsed = JSON.parse(savedLocal) as {
              active?: boolean;
              reason?: string;
            };
            if (parsed.active) {
              overrideActive = true;
              overrideText = parsed.reason || defaultEventReason;
            }
          }
        } catch {
          // Abaikan error localStorage
        }
      }

      setIsSpecialEventActive(overrideActive);
      setSpecialEventReason(overrideText);
    } catch (err: unknown) {
      console.error('Gagal memeriksa status pengaturan lock hari libur:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSchoolId, activeDate, lang, defaultEventReason]);

  useEffect(() => {
    void refreshLockState();
  }, [refreshLockState]);

  const activateSpecialEvent = async (reason?: string) => {
    if (!activeSchoolId) {
      throw new Error(
        lang === 'en'
          ? 'Active school is not selected.'
          : 'Sekolah aktif belum terpilih.'
      );
    }
    if (!canManageOverride) {
      throw new Error(
        lang === 'en'
          ? 'You do not have permission to unlock holiday attendance.'
          : 'Akun Anda tidak memiliki izin membuka kunci hari libur.'
      );
    }

    const cleanReason = (reason ?? '').trim() || defaultEventReason;
    setIsToggling(true);

    try {
      const { data: existingRows, error: checkErr } = await supabase
        .from('school_special_events')
        .select('id, targetType, isActive')
        .eq('schoolId', activeSchoolId)
        .eq('eventDate', activeDate);

      if (checkErr) throw checkErr;

      const rows = (existingRows ?? []) as Array<{
        id: string;
        targetType: string | null;
        isActive: boolean;
      }>;

      const existingAll = rows.find(
        (r) => normalizeTargetType(r.targetType) === 'ALL'
      );
      const existingSiswa = rows.find(
        (r) => normalizeTargetType(r.targetType) === 'SISWA'
      );

      if (existingSiswa) {
        const { error: updateErr } = await supabase
          .from('school_special_events')
          .update({
            reason: cleanReason,
            isActive: true,
          })
          .eq('id', existingSiswa.id);
        if (updateErr) throw updateErr;
      } else if (existingAll) {
        const { error: updateErr } = await supabase
          .from('school_special_events')
          .update({
            reason: cleanReason,
            isActive: true,
          })
          .eq('id', existingAll.id);
        if (updateErr) throw updateErr;
      } else {
        const { error: upsertErr } = await supabase
          .from('school_special_events')
          .upsert(
            {
              schoolId: activeSchoolId,
              eventDate: activeDate,
              reason: cleanReason,
              targetType: 'SISWA',
              isActive: true,
              createdBy: user?.id ?? null,
            },
            { onConflict: 'schoolId,eventDate,targetType' }
          );
        if (upsertErr) throw upsertErr;
      }

      try {
        localStorage.setItem(
          getLocalOverrideKey(activeSchoolId, activeDate),
          JSON.stringify({ active: true, reason: cleanReason })
        );
      } catch {
        // Abaikan jika kapasitas penyimpanan browser penuh
      }

      setIsSpecialEventActive(true);
      setSpecialEventReason(cleanReason);
    } finally {
      setIsToggling(false);
    }
  };

  const deactivateSpecialEvent = async () => {
    if (!activeSchoolId) {
      throw new Error(
        lang === 'en'
          ? 'Active school is not selected.'
          : 'Sekolah aktif belum terpilih.'
      );
    }
    if (!canManageOverride) {
      throw new Error(
        lang === 'en'
          ? 'You do not have permission to lock holiday attendance.'
          : 'Akun Anda tidak memiliki izin mengunci kembali hari libur.'
      );
    }

    setIsToggling(true);
    try {
      const { data: existingRows, error: fetchErr } = await supabase
        .from('school_special_events')
        .select('id, targetType, isActive')
        .eq('schoolId', activeSchoolId)
        .eq('eventDate', activeDate);

      if (fetchErr) throw fetchErr;

      const rows = (existingRows ?? []) as Array<{
        id: string;
        targetType: string | null;
        isActive: boolean;
      }>;

      const hasSeparateGuruRow = rows.some(
        (r) => normalizeTargetType(r.targetType) === 'GURU'
      );

      for (const row of rows) {
        const target = normalizeTargetType(row.targetType);
        if (target === 'SISWA' && row.isActive) {
          const { error } = await supabase
            .from('school_special_events')
            .update({ isActive: false })
            .eq('id', row.id);
          if (error) throw error;
        } else if (target === 'ALL' && row.isActive) {
          if (!hasSeparateGuruRow) {
            // Alihkan ke GURU saja agar presensi guru yang dibuka bersamaan tidak ikut tertutup
            const { error } = await supabase
              .from('school_special_events')
              .update({ targetType: 'GURU' })
              .eq('id', row.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('school_special_events')
              .update({ isActive: false })
              .eq('id', row.id);
            if (error) throw error;
          }
        }
      }

      try {
        localStorage.removeItem(
          getLocalOverrideKey(activeSchoolId, activeDate)
        );
      } catch {
        // Abaikan error localStorage
      }

      setIsSpecialEventActive(false);
      setSpecialEventReason('');
    } finally {
      setIsToggling(false);
    }
  };

  const isLocked = isHoliday && !isSpecialEventActive;

  return {
    isLocked,
    isHoliday,
    holidayName,
    isSpecialEventActive,
    specialEventReason,
    canManageOverride,
    isLoading,
    isToggling,
    activateSpecialEvent,
    deactivateSpecialEvent,
    refreshLockState,
  };
}