// src/modules/attendance/hooks/useStudentHolidayLock.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { WorkDaysMode } from '../types/attendance.types';
import { getSchoolDateString } from '../services/gps.utils';

// ============================================================================
// KONSTANTA & PARAMETER YANG DAPAT DISESUAIKAN (SELARAS RLS v20.2)
// ============================================================================
const ALLOWED_OVERRIDE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
] as const;

const DEFAULT_EVENT_REASON = 'Kegiatan Khusus Sekolah';
const OVERRIDE_LOCAL_STORAGE_PREFIX = 'sekolah_erp_special_event';

export interface StudentHolidayLockState {
  /** Apakah presensi siswa saat ini terkunci karena hari libur */
  isLocked: boolean;
  /** Apakah tanggal target sebenarnya adalah hari libur / akhir pekan */
  isHoliday: boolean;
  /** Nama hari libur (misal: "Hari Minggu" atau "Idul Fitri") */
  holidayName: string;
  /** Apakah mode kegiatan khusus sedang diaktifkan untuk tanggal ini */
  isSpecialEventActive: boolean;
  /** Keterangan kegiatan khusus yang sedang berlangsung */
  specialEventReason: string;
  /** Apakah user yang login berhak mengaktifkan/menonaktifkan mode kegiatan khusus */
  canManageOverride: boolean;
  /** Status loading pengecekan jadwal libur */
  isLoading: boolean;
  /** Status loading saat menyimpan perubahan kunci */
  isToggling: boolean;
  /** Fungsi untuk membuka kunci presensi (aktifkan kegiatan khusus) */
  activateSpecialEvent: (reason?: string) => Promise<void>;
  /** Fungsi untuk mengunci kembali presensi hari libur */
  deactivateSpecialEvent: () => Promise<void>;
  /** Memuat ulang status libur & override */
  refreshLockState: () => Promise<void>;
}

/**
 * Mengambil tanggal hari ini dalam zona waktu sekolah (default WIB / Asia/Jakarta)
 */
export function getTodayLocalISO(timeZone: string = 'Asia/Jakarta'): string {
  return getSchoolDateString(new Date(), timeZone);
}

function getLocalOverrideKey(schoolId: string, dateISO: string): string {
  return `${OVERRIDE_LOCAL_STORAGE_PREFIX}_${schoolId}_${dateISO}`;
}

/**
 * Hook terpusat untuk mengecek status hari libur siswa dan mengelola
 * pembukaan kunci sementara ("Mode Kegiatan Khusus") via tabel `school_special_events`.
 */
export function useStudentHolidayLock(params?: {
  schoolId?: string;
  targetDate?: string;
}): StudentHolidayLockState {
  const { user, school } = useAuthStore();
  const activeSchoolId = params?.schoolId || school?.id || '';
  const activeDate = params?.targetDate || getTodayLocalISO();

  const [isHoliday, setIsHoliday] = useState<boolean>(false);
  const [holidayName, setHolidayName] = useState<string>('');
  const [isSpecialEventActive, setIsSpecialEventActive] = useState<boolean>(false);
  const [specialEventReason, setSpecialEventReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  // Evaluasi gabungan role utama & additionalRoles (v20.2)
  const userWithAdditionalRoles = user as
    | (typeof user & { additionalRoles?: string[] })
    | null;

  const allUserRoles: string[] = [
    ...(userWithAdditionalRoles?.role ? [userWithAdditionalRoles.role] : []),
    ...(Array.isArray(userWithAdditionalRoles?.additionalRoles)
      ? userWithAdditionalRoles.additionalRoles
      : []),
  ];

  const canManageOverride = allUserRoles.some((r) =>
    (ALLOWED_OVERRIDE_ROLES as readonly string[]).includes(r)
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
      // 1. Ambil pengaturan hari kerja sekolah & status kegiatan khusus secara paralel
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
          .select('id, eventDate, reason, isActive')
          .eq('schoolId', activeSchoolId)
          .eq('eventDate', activeDate)
          .maybeSingle(),
      ]);

      if (schoolRes.error) throw schoolRes.error;

      const workDaysMode: WorkDaysMode =
        schoolRes.data?.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS';

      // 2. Cek akhir pekan (Minggu selalu libur; Sabtu libur jika FIVE_DAYS)
      const [yStr, mStr, dStr] = activeDate.split('-');
      const localDateObj = new Date(
        Number(yStr),
        Number(mStr) - 1,
        Number(dStr)
      );
      const dayOfWeek = localDateObj.getDay();

      let detectedHolidayName = '';
      if (dayOfWeek === 0) {
        detectedHolidayName = 'Hari Minggu (Akhir Pekan)';
      } else if (dayOfWeek === 6 && workDaysMode === 'FIVE_DAYS') {
        detectedHolidayName = 'Hari Sabtu (Libur 5 Hari Kerja)';
      }

      // 3. Cek hari libur (prioritaskan jadwal khusus sekolah, lalu libur nasional)
      if (!holidayRes.error && holidayRes.data && holidayRes.data.length > 0) {
        const rows = holidayRes.data as Array<{
          schoolId: string | null;
          name: string;
        }>;
        const schoolSpecific = rows.find((r) => r.schoolId === activeSchoolId);
        const globalHoliday = rows.find((r) => r.schoolId === null);
        const matched = schoolSpecific ?? globalHoliday;

        if (matched) {
          detectedHolidayName = matched.name;
        }
      }

      const holidayFound = detectedHolidayName.length > 0;
      setIsHoliday(holidayFound);
      setHolidayName(detectedHolidayName);

      // 4. Cek status kegiatan khusus dari tabel public.school_special_events
      let overrideActive = false;
      let overrideText = '';

      if (!specialEventRes.error && specialEventRes.data) {
        overrideActive = Boolean(specialEventRes.data.isActive);
        overrideText = overrideActive
          ? String(specialEventRes.data.reason || '').trim() || DEFAULT_EVENT_REASON
          : '';
      } else if (specialEventRes.error) {
        // Cadangan pembacaan lokal hanya jika jaringan terputus
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
              overrideText = parsed.reason || DEFAULT_EVENT_REASON;
            }
          }
        } catch {
          // Abaikan error storage
        }
      }

      setIsSpecialEventActive(overrideActive);
      setSpecialEventReason(overrideText);
    } catch (err: unknown) {
      console.error('Gagal memeriksa status hari libur siswa:', err);
    } finally {
      setIsLoading(false);
    }
  }, [activeSchoolId, activeDate]);

  useEffect(() => {
    refreshLockState();
  }, [refreshLockState]);

  const activateSpecialEvent = async (reason?: string) => {
    if (!activeSchoolId || !canManageOverride) return;
    const cleanReason = (reason ?? '').trim() || DEFAULT_EVENT_REASON;

    setIsToggling(true);
    try {
      const { error } = await supabase.from('school_special_events').upsert(
        {
          schoolId: activeSchoolId,
          eventDate: activeDate,
          reason: cleanReason,
          isActive: true,
          createdBy: user?.id ?? null,
        },
        {
          onConflict: 'schoolId,eventDate',
        }
      );

      if (error) throw error;

      try {
        localStorage.setItem(
          getLocalOverrideKey(activeSchoolId, activeDate),
          JSON.stringify({ active: true, reason: cleanReason })
        );
      } catch {
        // Abaikan jika storage penuh
      }

      setIsSpecialEventActive(true);
      setSpecialEventReason(cleanReason);
    } finally {
      setIsToggling(false);
    }
  };

  const deactivateSpecialEvent = async () => {
    if (!activeSchoolId || !canManageOverride) return;

    setIsToggling(true);
    try {
      const { error } = await supabase
        .from('school_special_events')
        .update({ isActive: false })
        .eq('schoolId', activeSchoolId)
        .eq('eventDate', activeDate);

      if (error) throw error;

      try {
        localStorage.removeItem(
          getLocalOverrideKey(activeSchoolId, activeDate)
        );
      } catch {
        // Abaikan
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