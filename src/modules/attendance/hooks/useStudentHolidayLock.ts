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
import type { WorkDaysMode } from '../types/attendance.types';
import { getSchoolDateString } from '../services/gps.utils';

// ============================================================================
// KONSTANTA & PARAMETER PENGATURAN LOCK HARI LIBUR (MUDAH DISESUAIKAN)
// ============================================================================

/**
 * Daftar peran (role) pengguna yang diizinkan membuka/menutup kunci hari libur
 * untuk kegiatan khusus sekolah.
 */
const ALLOWED_OVERRIDE_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
] as const;

/** Teks alasan bawaan jika admin tidak mengetik nama kegiatan khusus */
const DEFAULT_EVENT_REASON = 'Kegiatan Khusus Sekolah';

/** Awalan kunci penyimpanan lokal (cadangan jika internet terputus sementara) */
const OVERRIDE_LOCAL_STORAGE_PREFIX = 'sekolah_erp_special_event';

/**
 * Struktur data status penguncian hari libur yang dikembalikan oleh hook ini.
 */
export interface StudentHolidayLockState {
  /** TRUE jika presensi siswa sedang terkunci (Hari Libur & tidak ada Kegiatan Khusus) */
  isLocked: boolean;
  /** TRUE jika tanggal yang dipilih termasuk hari libur / akhir pekan */
  isHoliday: boolean;
  /** Keterangan nama hari libur (contoh: "Hari Sabtu (Libur 5 Hari Kerja)") */
  holidayName: string;
  /** TRUE jika admin membuka kunci sementara untuk kegiatan khusus */
  isSpecialEventActive: boolean;
  /** Nama/alasan kegiatan khusus yang sedang aktif */
  specialEventReason: string;
  /** TRUE jika akun yang sedang login berhak membuka/menutup kunci hari libur */
  canManageOverride: boolean;
  /** TRUE saat sistem sedang mengecek kalender libur ke database */
  isLoading: boolean;
  /** TRUE saat sistem sedang menyimpan perubahan buka/tutup kunci */
  isToggling: boolean;
  /** Fungsi untuk membuka kunci hari libur (aktifkan presensi kegiatan khusus) */
  activateSpecialEvent: (reason?: string) => Promise<void>;
  /** Fungsi untuk mengunci kembali presensi pada hari libur */
  deactivateSpecialEvent: () => Promise<void>;
  /** Fungsi untuk memuat ulang status penguncian hari libur */
  refreshLockState: () => Promise<void>;
}

/**
 * Mengambil tanggal hari ini dalam format YYYY-MM-DD sesuai zona waktu sekolah.
 */
export function getTodayLocalISO(timeZone: string = 'Asia/Jakarta'): string {
  return getSchoolDateString(new Date(), timeZone);
}

/**
 * Membuat kunci penyimpanan lokal unik per sekolah dan per tanggal.
 */
function getLocalOverrideKey(schoolId: string, dateISO: string): string {
  return `${OVERRIDE_LOCAL_STORAGE_PREFIX}_${schoolId}_${dateISO}`;
}

/**
 * Mendeteksi apakah error dari Supabase disebabkan oleh nama kolom yang
 * belum tersedia di schema cache (misalnya kolom opsional `createdBy`).
 */
function isMissingColumnError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const rec = err as Record<string, unknown>;
  const code = typeof rec.code === 'string' ? rec.code : '';
  const message =
    typeof rec.message === 'string' ? rec.message.toLowerCase() : '';

  return (
    code === 'PGRST204' ||
    code === '42703' ||
    message.includes('schema cache') ||
    (message.includes('column') && message.includes('does not exist'))
  );
}

/**
 * Hook Pengaturan Lock Hari Libur Siswa:
 * - Mengunci presensi otomatis pada hari Minggu, Sabtu (mode 5 hari kerja),
 *   dan tanggal merah / libur kalender.
 * - Menyediakan fitur "Buka Presensi Kegiatan Khusus" bagi Admin / Super Admin.
 */
export function useStudentHolidayLock(params?: {
  schoolId?: string;
  targetDate?: string;
}): StudentHolidayLockState {
  const { user, school } = useAuthStore();

  // Gunakan schoolId dari parameter (penting untuk simulasi Super Admin),
  // atau fallback ke sekolah milik user yang sedang login.
  const activeSchoolId = params?.schoolId || school?.id || user?.schoolId || '';
  const activeDate = params?.targetDate || getTodayLocalISO();

  const [isHoliday, setIsHoliday] = useState<boolean>(false);
  const [holidayName, setHolidayName] = useState<string>('');
  const [isSpecialEventActive, setIsSpecialEventActive] = useState<boolean>(false);
  const [specialEventReason, setSpecialEventReason] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isToggling, setIsToggling] = useState<boolean>(false);

  // Gabungkan role utama dan role tambahan user untuk mengecek hak akses buka kunci
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

  /**
   * Memeriksa status hari libur & status pembukaan kunci kegiatan khusus.
   */
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
      // 1. Ambil pengaturan hari kerja sekolah, daftar libur, & kegiatan khusus sekaligus
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

      // 2. Cek apakah tanggal target adalah akhir pekan (Minggu atau Sabtu 5 hari kerja)
      const [yStr, mStr, dStr] = activeDate.split('-');
      const localDateObj = new Date(
        Number(yStr),
        Number(mStr) - 1,
        Number(dStr)
      );
      const dayOfWeek = localDateObj.getDay(); // 0 = Minggu, 6 = Sabtu

      let detectedHolidayName = '';
      if (dayOfWeek === 0) {
        detectedHolidayName = 'Hari Minggu (Akhir Pekan)';
      } else if (dayOfWeek === 6 && workDaysMode === 'FIVE_DAYS') {
        detectedHolidayName = 'Hari Sabtu (Libur 5 Hari Kerja)';
      }

      // 3. Cek tanggal merah / libur di tabel national_holidays
      //    (Prioritaskan jadwal khusus sekolah, lalu libur nasional umum)
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

      // 4. Cek apakah Mode Kegiatan Khusus (pembuka kunci) sedang aktif
      let overrideActive = false;
      let overrideText = '';

      if (!specialEventRes.error && specialEventRes.data) {
        overrideActive = Boolean(specialEventRes.data.isActive);
        overrideText = overrideActive
          ? String(specialEventRes.data.reason || '').trim() || DEFAULT_EVENT_REASON
          : '';
      } else if (specialEventRes.error) {
        // Cadangan pembacaan dari memori browser jika offline
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
  }, [activeSchoolId, activeDate]);

  useEffect(() => {
    void refreshLockState();
  }, [refreshLockState]);

  /**
   * Membuka kunci presensi pada hari libur (mengaktifkan Mode Kegiatan Khusus).
   */
  const activateSpecialEvent = async (reason?: string) => {
    if (!activeSchoolId) {
      throw new Error('Sekolah aktif belum terpilih.');
    }
    if (!canManageOverride) {
      throw new Error('Akun Anda tidak memiliki izin membuka kunci hari libur.');
    }

    const cleanReason = (reason ?? '').trim() || DEFAULT_EVENT_REASON;
    setIsToggling(true);

    try {
      // Cek apakah data pengecualian untuk sekolah & tanggal ini sudah pernah dibuat
      const { data: existingEvent, error: checkErr } = await supabase
        .from('school_special_events')
        .select('id')
        .eq('schoolId', activeSchoolId)
        .eq('eventDate', activeDate)
        .maybeSingle();

      if (checkErr) throw checkErr;

      if (existingEvent?.id) {
        // Perbarui baris yang sudah ada
        const { error: updateErr } = await supabase
          .from('school_special_events')
          .update({
            reason: cleanReason,
            isActive: true,
          })
          .eq('id', existingEvent.id);

        if (updateErr) throw updateErr;
      } else {
        // Buat baris baru (coba dengan createdBy, otomatis fallback jika kolom tidak ada)
        const { error: insertWithCreatorErr } = await supabase
          .from('school_special_events')
          .insert({
            schoolId: activeSchoolId,
            eventDate: activeDate,
            reason: cleanReason,
            isActive: true,
            createdBy: user?.id ?? null,
          });

        if (insertWithCreatorErr) {
          if (isMissingColumnError(insertWithCreatorErr)) {
            const { error: fallbackInsertErr } = await supabase
              .from('school_special_events')
              .insert({
                schoolId: activeSchoolId,
                eventDate: activeDate,
                reason: cleanReason,
                isActive: true,
              });

            if (fallbackInsertErr) throw fallbackInsertErr;
          } else {
            throw insertWithCreatorErr;
          }
        }
      }

      // Simpan salinan status ke memori lokal browser
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

  /**
   * Mengunci kembali presensi hari libur (menonaktifkan Mode Kegiatan Khusus).
   */
  const deactivateSpecialEvent = async () => {
    if (!activeSchoolId) {
      throw new Error('Sekolah aktif belum terpilih.');
    }
    if (!canManageOverride) {
      throw new Error('Akun Anda tidak memiliki izin mengunci kembali hari libur.');
    }

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
        // Abaikan error localStorage
      }

      setIsSpecialEventActive(false);
      setSpecialEventReason('');
    } finally {
      setIsToggling(false);
    }
  };

  // Presensi terkunci HANYA JIKA hari ini libur DAN tidak ada kegiatan khusus yang aktif
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