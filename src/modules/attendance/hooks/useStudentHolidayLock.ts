// src/modules/attendance/hooks/useStudentHolidayLock.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { WorkDaysMode } from '../utils/indonesianHolidays';

// ============================================================================
// KONSTANTA & PARAMETER YANG BISA KAMU SESUAIKAN
// ============================================================================
const ALLOWED_OVERRIDE_ROLES = ['TEACHER', 'ADMIN', 'SUPER_ADMIN'] as const;
const DEFAULT_EVENT_REASON = 'Kegiatan Khusus Sekolah';
const OVERRIDE_LOCAL_STORAGE_PREFIX = 'sekolah_erp_holiday_override';

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
 * Mengambil tanggal lokal hari ini dalam format YYYY-MM-DD
 */
export function getTodayLocalISO(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function getLocalOverrideKey(schoolId: string, dateISO: string): string {
    return `${OVERRIDE_LOCAL_STORAGE_PREFIX}_${schoolId}_${dateISO}`;
}

function isMissingColumnError(err: unknown): boolean {
    const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
    const code = String((err as { code?: string })?.code ?? '');
    return (
        code === 'PGRST204' ||
        code === '42703' ||
        msg.includes('schema cache') ||
        (msg.includes('column') && msg.includes('does not exist'))
    );
}

/**
 * Hook terpusat untuk mengecek status hari libur siswa dan mengelola
 * pembukaan kunci sementara ("Mode Kegiatan Khusus") oleh Guru/Wali/Admin/SuperAdmin.
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

    const canManageOverride = Boolean(
        user?.role &&
        (ALLOWED_OVERRIDE_ROLES as readonly string[]).includes(user.role)
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
            // 1. Ambil pengaturan hari kerja & status override dari tabel schools
            const { data: schoolData, error: schoolErr } = await supabase
                .from('schools')
                .select('*')
                .eq('id', activeSchoolId)
                .maybeSingle();

            if (schoolErr) throw schoolErr;

            const workDaysMode: WorkDaysMode =
                schoolData?.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS';

            // 2. Cek apakah tanggal target adalah akhir pekan (Minggu atau Sabtu pada mode 5 hari)
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

            // 3. Cek apakah tanggal target terdaftar di tabel national_holidays
            const { data: holidayRows, error: holidayErr } = await supabase
                .from('national_holidays')
                .select('id, schoolId, date, name')
                .eq('date', activeDate);

            if (!holidayErr && holidayRows && holidayRows.length > 0) {
                const matched = holidayRows.find(
                    (row: { schoolId: string | null; name: string }) =>
                        row.schoolId === activeSchoolId || row.schoolId === null
                );
                if (matched) {
                    detectedHolidayName = matched.name;
                }
            }

            const holidayFound = detectedHolidayName.length > 0;
            setIsHoliday(holidayFound);
            setHolidayName(detectedHolidayName);

            // 4. Cek apakah Mode Kegiatan Khusus sedang diaktifkan untuk tanggal ini
            let overrideActive = false;
            let overrideText = '';

            if (schoolData?.holidayOverrideDate === activeDate) {
                overrideActive = true;
                overrideText =
                    String(schoolData.holidayOverrideReason || '').trim() ||
                    DEFAULT_EVENT_REASON;
            } else {
                // Cek cadangan di localStorage jika kolom DB belum ditambahkan
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
                    // abaikan error pembacaan storage
                }
            }

            setIsSpecialEventActive(overrideActive);
            setSpecialEventReason(overrideText);
        } catch (err) {
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
            // Simpan ke localStorage sebagai cadangan instan
            try {
                localStorage.setItem(
                    getLocalOverrideKey(activeSchoolId, activeDate),
                    JSON.stringify({ active: true, reason: cleanReason })
                );
            } catch {
                // abaikan jika storage penuh
            }

            // Simpan ke Supabase agar sinkron ke perangkat Kiosk & Wali Kelas lain
            const { error } = await supabase
                .from('schools')
                .update({
                    holidayOverrideDate: activeDate,
                    holidayOverrideReason: cleanReason,
                })
                .eq('id', activeSchoolId);

            if (error && !isMissingColumnError(error)) {
                throw error;
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
            try {
                localStorage.removeItem(
                    getLocalOverrideKey(activeSchoolId, activeDate)
                );
            } catch {
                // abaikan
            }

            const { error } = await supabase
                .from('schools')
                .update({
                    holidayOverrideDate: null,
                    holidayOverrideReason: null,
                })
                .eq('id', activeSchoolId);

            if (error && !isMissingColumnError(error)) {
                throw error;
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