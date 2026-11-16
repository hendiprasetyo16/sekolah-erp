// src/modules/attendance/components/AttendanceSettingsTab.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Clock,
    CalendarDays,
    FileSpreadsheet,
    Download,
    Upload,
    Plus,
    Trash2,
    Save,
    RefreshCw,
    CheckCircle2,
    AlertTriangle,
    Globe,
    Building2,
    Briefcase,
    Server,
    Moon,
    Loader2,
    Pencil,
    List,
    Calendar,
    X,
    Camera,
    MapPin,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { WorkDaysMode, HolidayRecord } from '../utils/indonesianHolidays';
import {
    downloadHolidayExcelTemplate,
    parseHolidaySpreadsheetFile,
    type ParsedHolidayRow,
} from '../utils/excelHolidayParser';
import {
    fetchHolidaysFromServer,
    HOLIDAY_API_PROVIDER_OPTIONS,
    type HolidayApiProviderId,
    type CalendarReferenceMode,
} from '../utils/holidayApiService';
import { getJavaneseDateInfo } from '../utils/javaneseCalendar';
import { HolidayCalendarView } from './HolidayCalendarView';

const CUSTOM_YEARS_STORAGE_KEY = 'sekolah_erp_holiday_custom_years';
const INITIAL_BASE_YEARS = [2026, 2027, 2028];

/**
 * Helper menghitung jam efektif setelah ditambah toleransi keterlambatan (menit)
 */
function calculateEffectiveDeadline(
    startTime: string,
    toleranceMinutes: number
): string {
    const [hStr, mStr] = startTime.split(':');
    const h = Number(hStr) || 7;
    const m = Number(mStr) || 0;
    const safeTolerance = Math.max(0, Math.floor(Number(toleranceMinutes) || 0));
    const totalMinutes = Math.min(23 * 60 + 59, h * 60 + m + safeTolerance);
    const finalH = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const finalM = String(totalMinutes % 60).padStart(2, '0');
    return `${finalH}:${finalM}`;
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

export function AttendanceSettingsTab() {
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isAdmin = user?.role === 'ADMIN';
    const canManage = isSuperAdmin || isAdmin;

    // Pilihan sekolah (khusus SUPER_ADMIN)
    const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
        school?.id ?? ''
    );

    // 1. State Pengaturan Jam Kerja, Toleransi, Kamera Selfie, & Hari Kerja
    const [workStartTime, setWorkStartTime] = useState<string>('07:30');
    const [lateToleranceMinutes, setLateToleranceMinutes] = useState<number>(0);
    const [workEndTime, setWorkEndTime] = useState<string>('14:30');
    const [workDaysMode, setWorkDaysMode] = useState<WorkDaysMode>('SIX_DAYS');
    const [requireSelfieCheckIn, setRequireSelfieCheckIn] = useState<boolean>(true);
    const [requireSelfieCheckOut, setRequireSelfieCheckOut] = useState<boolean>(true);
    const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(false);
    const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

    // 2. State Tahun, Pilihan Server API, Mode Muhammadiyah, & Hari Libur
    const [filterYear, setFilterYear] = useState<number>(() =>
        new Date().getFullYear()
    );
    const [customYears, setCustomYears] = useState<number[]>(() => {
        try {
            const saved = localStorage.getItem(CUSTOM_YEARS_STORAGE_KEY);
            const parsed: unknown = saved ? JSON.parse(saved) : [];
            return Array.isArray(parsed)
                ? parsed.filter((n): n is number => typeof n === 'number')
                : [];
        } catch {
            return [];
        }
    });
    const [dbRecordedYears, setDbRecordedYears] = useState<number[]>([]);
    const [selectedApiProvider, setSelectedApiProvider] =
        useState<HolidayApiProviderId>('AUTO');
    const [calendarRefMode, setCalendarRefMode] =
        useState<CalendarReferenceMode>('MUHAMMADIYAH');
    const [includeCutiFromServer, setIncludeCutiFromServer] =
        useState<boolean>(true);
    const [includeAwalRamadan, setIncludeAwalRamadan] = useState<boolean>(true);
    const [isFetchingServer, setIsFetchingServer] = useState<boolean>(false);

    // Status langsung di dalam kotak Sync
    const [syncFeedback, setSyncFeedback] = useState<{
        status: 'loading' | 'success' | 'error';
        text: string;
    } | null>(null);

    const [holidayScope, setHolidayScope] = useState<'GLOBAL' | 'SCHOOL'>(
        isSuperAdmin ? 'GLOBAL' : 'SCHOOL'
    );
    const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
    const [isLoadingHolidays, setIsLoadingHolidays] = useState<boolean>(false);

    // Default tampilan adalah Kalender
    const [holidayViewMode, setHolidayViewMode] = useState<'LIST' | 'CALENDAR'>(
        'CALENDAR'
    );

    // Checklist ID untuk Hapus Terpilih / Hapus Semua
    const [selectedHolidayIds, setSelectedHolidayIds] = useState<string[]>([]);

    // Modal Edit Hari Libur
    const [editingHoliday, setEditingHoliday] = useState<HolidayRecord | null>(
        null
    );
    const [editDateInput, setEditDateInput] = useState<string>('');
    const [editNameInput, setEditNameInput] = useState<string>('');
    const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

    // Modal Konfirmasi Hapus Modern
    const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
        title: string;
        description: string;
        targetIds: string[];
    } | null>(null);
    const [isDeletingHolidays, setIsDeletingHolidays] = useState<boolean>(false);

    // Tambah 1 tanggal libur manual
    const [newHolidayDate, setNewHolidayDate] = useState<string>('');
    const [newHolidayName, setNewHolidayName] = useState<string>('');
    const [isAddingHoliday, setIsAddingHoliday] = useState<boolean>(false);

    // Pratinjau Import Excel / Server
    const [previewRows, setPreviewRows] = useState<ParsedHolidayRow[]>([]);
    const [previewSourceLabel, setPreviewSourceLabel] = useState<string>('');
    const [isImporting, setIsImporting] = useState<boolean>(false);

    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 5500);
    };

    useEffect(() => {
        if (school?.id) {
            setSelectedSchoolId(school.id);
        }
    }, [school?.id]);

    // Muat daftar sekolah jika SUPER_ADMIN
    useEffect(() => {
        if (!isSuperAdmin) return;
        supabase
            .from('schools')
            .select('id, name')
            .order('name')
            .then(({ data }) => {
                const list = data ?? [];
                setSchools(list);
                if (!school?.id && list.length > 0) {
                    setSelectedSchoolId(list[0].id);
                }
            });
    }, [isSuperAdmin, school?.id]);

    // Muat pengaturan jam kerja, toleransi keterlambatan, kamera selfie, & hari kerja
    const loadScheduleSettings = useCallback(async () => {
        if (!selectedSchoolId) return;
        setIsLoadingSchedule(true);
        try {
            const { data, error } = await supabase
                .from('schools')
                .select('*')
                .eq('id', selectedSchoolId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setWorkStartTime(data.workStartTime || '07:30');
                setLateToleranceMinutes(
                    Math.max(0, Number(data.lateToleranceMinutes) || 0)
                );
                setWorkEndTime(data.workEndTime || '14:30');
                setWorkDaysMode(
                    data.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS'
                );
                setRequireSelfieCheckIn(
                    typeof data.requireSelfieCheckIn === 'boolean'
                        ? data.requireSelfieCheckIn
                        : true
                );
                setRequireSelfieCheckOut(
                    typeof data.requireSelfieCheckOut === 'boolean'
                        ? data.requireSelfieCheckOut
                        : true
                );
            }
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : 'Gagal memuat pengaturan presensi sekolah.';
            showToast('error', msg);
        } finally {
            setIsLoadingSchedule(false);
        }
    }, [selectedSchoolId]);

    useEffect(() => {
        loadScheduleSettings();
    }, [loadScheduleSettings]);

    const effectiveDeadlinePreview = useMemo(
        () => calculateEffectiveDeadline(workStartTime, lateToleranceMinutes),
        [workStartTime, lateToleranceMinutes]
    );

    // Gabungkan tahun dasar (2026-2028) + tahun dari DB + tahun tambahan user
    const availableYears = useMemo(() => {
        const yearsSet = new Set<number>([
            ...INITIAL_BASE_YEARS,
            ...dbRecordedYears,
            ...customYears,
            filterYear,
        ]);
        return Array.from(yearsSet).sort((a, b) => a - b);
    }, [dbRecordedYears, customYears, filterYear]);

    // Handler Tombol "+ Tambah Tahun"
    const handleAddNextYear = () => {
        const maxYear =
            availableYears.length > 0
                ? Math.max(...availableYears)
                : new Date().getFullYear();
        const nextYear = maxYear + 1;

        setCustomYears((prev) => {
            const updated = Array.from(new Set([...prev, nextYear])).sort(
                (a, b) => a - b
            );
            try {
                localStorage.setItem(CUSTOM_YEARS_STORAGE_KEY, JSON.stringify(updated));
            } catch {
                // abaikan jika storage penuh
            }
            return updated;
        });

        setFilterYear(nextYear);
        setSyncFeedback({
            status: 'success',
            text: `Tahun ${nextYear} ditambahkan. Klik "Sync dari Server (${nextYear})" untuk menarik jadwal liburnya.`,
        });
    };

    // Simpan pengaturan jam masuk, toleransi, kamera selfie, dan hari kerja
    const handleSaveSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSchoolId) {
            showToast('error', 'Pilih sekolah terlebih dahulu.');
            return;
        }

        const cleanTolerance = Math.max(
            0,
            Math.min(180, Math.floor(Number(lateToleranceMinutes) || 0))
        );

        setIsSavingSchedule(true);
        try {
            const { error } = await supabase
                .from('schools')
                .update({
                    workStartTime,
                    lateToleranceMinutes: cleanTolerance,
                    workEndTime,
                    workDaysMode,
                    requireSelfieCheckIn,
                    requireSelfieCheckOut,
                })
                .eq('id', selectedSchoolId);

            if (error) {
                // Fallback jika kolom requireSelfieCheckIn/Out belum dibuat di Supabase
                if (isMissingColumnError(error)) {
                    const retry = await supabase
                        .from('schools')
                        .update({
                            workStartTime,
                            lateToleranceMinutes: cleanTolerance,
                            workEndTime,
                            workDaysMode,
                        })
                        .eq('id', selectedSchoolId);

                    if (retry.error) throw retry.error;
                    showToast(
                        'error',
                        'Jam & hari kerja tersimpan, tetapi kolom requireSelfieCheckIn/Out belum ada di tabel schools Supabase. Jalankan perintah SQL ALTER TABLE terlebih dahulu.'
                    );
                    return;
                }
                throw error;
            }

            setLateToleranceMinutes(cleanTolerance);
            const selfieSummary = `Selfie Masuk: ${requireSelfieCheckIn ? 'Aktif' : 'Nonaktif (GPS Saja)'
                }, Selfie Pulang: ${requireSelfieCheckOut ? 'Aktif' : 'Nonaktif (GPS Saja)'
                }`;

            showToast(
                'success',
                cleanTolerance > 0
                    ? `Tersimpan! Masuk ${workStartTime} (+${cleanTolerance}m), pulang ${workEndTime} • ${selfieSummary}.`
                    : `Tersimpan! Masuk ${workStartTime}, pulang ${workEndTime} • ${selfieSummary}.`
            );
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error
                    ? err.message
                    : 'Gagal menyimpan pengaturan presensi.'
            );
        } finally {
            setIsSavingSchedule(false);
        }
    };

    // Muat daftar hari libur untuk tahun terpilih + deteksi semua tahun yang ada di DB
    const loadHolidays = useCallback(async () => {
        setIsLoadingHolidays(true);
        setSelectedHolidayIds([]);
        try {
            let query = supabase
                .from('national_holidays')
                .select('id, schoolId, date, name')
                .gte('date', `${filterYear}-01-01`)
                .lte('date', `${filterYear}-12-31`)
                .order('date', { ascending: true });

            if (selectedSchoolId) {
                query = query.or(
                    `schoolId.eq.${selectedSchoolId},schoolId.is.null`
                );
            } else {
                query = query.is('schoolId', null);
            }

            const { data, error } = await query;
            if (error) throw error;
            setHolidays((data ?? []) as HolidayRecord[]);

            const { data: allDates } = await supabase
                .from('national_holidays')
                .select('date');
            if (allDates) {
                const yearsInDb = Array.from(
                    new Set(
                        allDates
                            .map((r: { date: string }) => Number(String(r.date).slice(0, 4)))
                            .filter((y) => Number.isFinite(y) && y > 2000)
                    )
                );
                setDbRecordedYears(yearsInDb);
            }
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error
                    ? err.message
                    : 'Tabel national_holidays belum tersedia. Jalankan skrip SQL di Supabase terlebih dahulu.'
            );
        } finally {
            setIsLoadingHolidays(false);
        }
    }, [filterYear, selectedSchoolId]);

    useEffect(() => {
        loadHolidays();
    }, [loadHolidays]);

    const resolvedHolidaySchoolId =
        isSuperAdmin && holidayScope === 'GLOBAL' ? null : selectedSchoolId || null;

    // Simpan batch hari libur ke Supabase
    const upsertHolidayRows = async (rows: ParsedHolidayRow[]) => {
        const validRows = rows.filter(
            (r) => r.date.trim().length === 10 && r.name.trim().length > 0
        );
        if (validRows.length === 0) return;

        if (!isSuperAdmin && !resolvedHolidaySchoolId) {
            throw new Error('Data sekolah tidak ditemukan.');
        }

        let existingQuery = supabase
            .from('national_holidays')
            .select('id, date');

        if (resolvedHolidaySchoolId === null) {
            existingQuery = existingQuery.is('schoolId', null);
        } else {
            existingQuery = existingQuery.eq('schoolId', resolvedHolidaySchoolId);
        }

        const { data: existingList, error: fetchErr } = await existingQuery;
        if (fetchErr) throw fetchErr;

        const existingMap = new Map<string, string>();
        for (const item of existingList ?? []) {
            existingMap.set(item.date, item.id);
        }

        const toInsert: Array<{
            schoolId: string | null;
            date: string;
            name: string;
            createdBy: string | null;
        }> = [];

        for (const row of validRows) {
            const existingId = existingMap.get(row.date);
            if (existingId) {
                const { error: updErr } = await supabase
                    .from('national_holidays')
                    .update({ name: row.name.trim() })
                    .eq('id', existingId);
                if (updErr) throw updErr;
            } else {
                toInsert.push({
                    schoolId: resolvedHolidaySchoolId,
                    date: row.date,
                    name: row.name.trim(),
                    createdBy: user?.id ?? null,
                });
            }
        }

        if (toInsert.length > 0) {
            const { error: insErr } = await supabase
                .from('national_holidays')
                .insert(toInsert);
            if (insErr) throw insErr;
        }
    };

    // Ambil Data Hari Libur Nasional & Cuti Bersama dari Server API
    const handleFetchFromServer = async () => {
        setIsFetchingServer(true);
        setSyncFeedback({
            status: 'loading',
            text: `Sedang menarik data libur tahun ${filterYear}...`,
        });

        try {
            const { rows, usedProviderLabel } = await fetchHolidaysFromServer({
                year: filterYear,
                includeCutiBersama: includeCutiFromServer,
                providerId: selectedApiProvider,
                calendarMode: calendarRefMode,
                includeAwalRamadan:
                    calendarRefMode === 'MUHAMMADIYAH' && includeAwalRamadan,
                onProgress: (statusText) => {
                    setSyncFeedback({ status: 'loading', text: statusText });
                },
            });

            setPreviewRows(rows);
            setPreviewSourceLabel(`${usedProviderLabel} — Tahun ${filterYear}`);
            setSyncFeedback({
                status: 'success',
                text: `Berhasil menarik ${rows.length} tanggal merah dari ${usedProviderLabel}! Silakan cek pratinjau di bawah lalu klik "Simpan ke Database".`,
            });
        } catch (err: unknown) {
            const errMsg =
                err instanceof Error ? err.message : 'Gagal mengambil data dari server.';
            setSyncFeedback({
                status: 'error',
                text: errMsg,
            });
        } finally {
            setIsFetchingServer(false);
        }
    };

    // Tambah 1 Hari Libur Manual
    const handleAddSingleHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHolidayDate || newHolidayName.trim().length < 3) {
            setSyncFeedback({
                status: 'error',
                text: 'Isi tanggal dan keterangan hari libur dengan lengkap.',
            });
            return;
        }

        setIsAddingHoliday(true);
        try {
            await upsertHolidayRows([
                { date: newHolidayDate, name: newHolidayName.trim() },
            ]);
            const addedYear = Number(newHolidayDate.slice(0, 4));
            if (Number.isFinite(addedYear)) setFilterYear(addedYear);
            setNewHolidayDate('');
            setNewHolidayName('');
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: 'Hari libur berhasil ditambahkan ke database!',
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error ? err.message : 'Gagal menambahkan hari libur.',
            });
        } finally {
            setIsAddingHoliday(false);
        }
    };

    // Buka Modal Edit Hari Libur
    const handleOpenEditModal = (item: HolidayRecord) => {
        if (!isSuperAdmin && item.schoolId === null) {
            setSyncFeedback({
                status: 'error',
                text: 'Hari Libur Nasional Global hanya dapat diubah oleh Super Admin.',
            });
            return;
        }
        setEditingHoliday(item);
        setEditDateInput(item.date);
        setEditNameInput(item.name);
    };

    // Simpan Perubahan dari Modal Edit
    const handleSaveEditHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingHoliday) return;
        if (!editDateInput || editNameInput.trim().length < 3) {
            return;
        }

        setIsSavingEdit(true);
        try {
            const { error } = await supabase
                .from('national_holidays')
                .update({
                    date: editDateInput,
                    name: editNameInput.trim(),
                })
                .eq('id', editingHoliday.id);

            if (error) throw error;
            setEditingHoliday(null);
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: `Perubahan hari libur "${editNameInput.trim()}" berhasil disimpan!`,
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error ? err.message : 'Gagal memperbarui hari libur.',
            });
        } finally {
            setIsSavingEdit(false);
        }
    };

    // Baca File Excel / CSV yang dipilih user
    const handleSelectExcelFile = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;

        try {
            const parsed = await parseHolidaySpreadsheetFile(file);
            if (parsed.length === 0) {
                setSyncFeedback({
                    status: 'error',
                    text: 'Tidak ada baris valid ditemukan di file. Pastikan kolom 1 adalah Tanggal (YYYY-MM-DD) dan kolom 2 adalah Keterangan.',
                });
                return;
            }
            setPreviewRows(parsed);
            setPreviewSourceLabel(`File ${file.name}`);
            setSyncFeedback({
                status: 'success',
                text: `Berhasil membaca ${parsed.length} tanggal dari file ${file.name}. Klik "Simpan ke Database" di bawah untuk menyimpan.`,
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error ? err.message : 'Gagal membaca file Excel/CSV.',
            });
        }
    };

    // Eksekusi Simpan Pratinjau (Server / Excel) ke Database
    const handleConfirmBatchSave = async () => {
        if (previewRows.length === 0) return;
        setIsImporting(true);
        try {
            const countSaved = previewRows.length;
            await upsertHolidayRows(previewRows);
            const importedYear = Number(previewRows[0].date.slice(0, 4));
            if (Number.isFinite(importedYear)) {
                setFilterYear(importedYear);
            }
            setPreviewRows([]);
            setPreviewSourceLabel('');
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: `${countSaved} data hari libur & cuti bersama berhasil disimpan ke database!`,
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : 'Gagal menyimpan data ke database.',
            });
        } finally {
            setIsImporting(false);
        }
    };

    // Daftar item yang boleh dihapus oleh user saat ini
    const deletableHolidays = useMemo(
        () => holidays.filter((item) => isSuperAdmin || item.schoolId !== null),
        [holidays, isSuperAdmin]
    );

    const isAllSelected =
        deletableHolidays.length > 0 &&
        deletableHolidays.every((h) => selectedHolidayIds.includes(h.id));

    const toggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedHolidayIds([]);
        } else {
            setSelectedHolidayIds(deletableHolidays.map((h) => h.id));
        }
    };

    const toggleSelectOne = (id: string) => {
        setSelectedHolidayIds((prev) =>
            prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
        );
    };

    // Eksekusi Hapus dari Modal Konfirmasi Modern
    const handleConfirmDeleteExecution = async () => {
        if (!deleteConfirmModal || deleteConfirmModal.targetIds.length === 0) {
            return;
        }

        setIsDeletingHolidays(true);
        try {
            const { error } = await supabase
                .from('national_holidays')
                .delete()
                .in('id', deleteConfirmModal.targetIds);

            if (error) throw error;
            const deletedCount = deleteConfirmModal.targetIds.length;
            setDeleteConfirmModal(null);
            setSelectedHolidayIds([]);
            await loadHolidays();
            setSyncFeedback({
                status: 'success',
                text: `${deletedCount} data hari libur berhasil dihapus dari database.`,
            });
        } catch (err: unknown) {
            setSyncFeedback({
                status: 'error',
                text:
                    err instanceof Error ? err.message : 'Gagal menghapus hari libur.',
            });
        } finally {
            setIsDeletingHolidays(false);
        }
    };

    if (!canManage) return null;

    return (
        <div className="space-y-6">
            {/* Toast Notifikasi Atas */}
            {toast && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${toast.type === 'success'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                            : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-200'
                        }`}
                >
                    {toast.type === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                    ) : (
                        <AlertTriangle size={16} className="text-red-500 shrink-0" />
                    )}
                    <span>{toast.message}</span>
                </div>
            )}

            {/* Pemilih Sekolah Khusus SUPER_ADMIN */}
            {isSuperAdmin && (
                <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <p className="text-xs font-bold text-purple-700 dark:text-purple-300">
                            Mode Pengaturan Super Admin
                        </p>
                        <p className="text-[11px] opacity-75">
                            Pilih sekolah untuk mengatur jam kerja, verifikasi selfie, & hari kerja:
                        </p>
                    </div>
                    <select
                        className="form-input w-auto! min-w-60 text-xs py-2"
                        value={selectedSchoolId}
                        onChange={(e) => setSelectedSchoolId(e.target.value)}
                    >
                        {schools.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* ====================================================================
          BAGIAN 1: JAM KERJA, VERIFIKASI SELFIE, & SISTEM HARI KERJA
      ==================================================================== */}
            <form
                onSubmit={handleSaveSchedule}
                className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
            >
                <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <Clock size={18} className="text-emerald-600" />
                            Jam Kerja, Verifikasi Kamera Selfie & Sistem Hari Kerja
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Mengatur batas keterlambatan check-in, jadwal pulang, kewajiban foto selfie, serta hari libur akhir pekan.
                        </p>
                    </div>
                    {isLoadingSchedule && <RefreshCw size={16} className="spin opacity-60" />}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            Jam Berangkat / Masuk *
                        </label>
                        <input
                            type="time"
                            required
                            value={workStartTime}
                            onChange={(e) => setWorkStartTime(e.target.value)}
                            className="form-input w-full text-sm font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Jadwal masuk resmi sekolah.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            Toleransi Keterlambatan (Menit)
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={180}
                            step={1}
                            value={lateToleranceMinutes}
                            onChange={(e) =>
                                setLateToleranceMinutes(
                                    e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                                )
                            }
                            placeholder="0"
                            className="form-input w-full text-sm font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Isi <strong>0</strong> jika tanpa toleransi.
                        </p>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            Jam Pulang Kerja *
                        </label>
                        <input
                            type="time"
                            required
                            value={workEndTime}
                            onChange={(e) => setWorkEndTime(e.target.value)}
                            className="form-input w-full text-sm font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Acuan jadwal pulang pada kartu presensi.
                        </p>
                    </div>
                </div>

                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">
                        {lateToleranceMinutes > 0 ? (
                            <>
                                Toleransi aktif <strong>{lateToleranceMinutes} menit</strong>: Check-in s.d. pukul{' '}
                                <strong className="font-mono text-emerald-700 dark:text-emerald-300">
                                    {effectiveDeadlinePreview}
                                </strong>{' '}
                                berstatus <strong>HADIR</strong>, lewat pukul{' '}
                                <strong className="font-mono text-amber-700 dark:text-amber-300">
                                    {effectiveDeadlinePreview}
                                </strong>{' '}
                                berstatus <strong>TERLAMBAT</strong>.
                            </>
                        ) : (
                            <>
                                Tanpa toleransi: Check-in melewati pukul{' '}
                                <strong className="font-mono text-emerald-700 dark:text-emerald-300">
                                    {workStartTime}
                                </strong>{' '}
                                langsung tercatat <strong>TERLAMBAT</strong>.
                            </>
                        )}
                    </span>
                </div>

                {/* Pengaturan Verifikasi Kamera Selfie (Absen Masuk & Absen Pulang) */}
                <div className="space-y-2.5 pt-1">
                    <div>
                        <label className="block text-xs font-semibold">
                            Verifikasi Kamera Selfie Presensi (GPS + Foto Selfie vs GPS Saja)
                        </label>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                            Matikan jika sekolah hanya mewajibkan validasi titik koordinat GPS tanpa mengambil foto wajah.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {/* Sakelar 1: Selfie Absen Masuk */}
                        <div
                            onClick={() => setRequireSelfieCheckIn((prev) => !prev)}
                            role="switch"
                            aria-checked={requireSelfieCheckIn}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setRequireSelfieCheckIn((prev) => !prev);
                                }
                            }}
                            className={`p-4 rounded-xl border cursor-pointer transition flex items-start justify-between gap-3 select-none ${requireSelfieCheckIn
                                    ? 'border-emerald-600/70 bg-emerald-500/10'
                                    : 'border-border bg-muted/25 hover:bg-muted/40'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${requireSelfieCheckIn
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}
                                >
                                    {requireSelfieCheckIn ? <Camera size={16} /> : <MapPin size={16} />}
                                </div>
                                <div>
                                    <div className="text-xs font-bold">
                                        Selfie Presensi Datang (Check-In)
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {requireSelfieCheckIn
                                            ? 'Aktif: Guru wajib mengambil foto selfie saat absen masuk.'
                                            : 'Nonaktif: Absen masuk langsung tercatat dengan GPS saja.'}
                                    </p>
                                </div>
                            </div>

                            <span
                                className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${requireSelfieCheckIn ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                            >
                                <span
                                    className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${requireSelfieCheckIn ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </span>
                        </div>

                        {/* Sakelar 2: Selfie Absen Pulang */}
                        <div
                            onClick={() => setRequireSelfieCheckOut((prev) => !prev)}
                            role="switch"
                            aria-checked={requireSelfieCheckOut}
                            tabIndex={0}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setRequireSelfieCheckOut((prev) => !prev);
                                }
                            }}
                            className={`p-4 rounded-xl border cursor-pointer transition flex items-start justify-between gap-3 select-none ${requireSelfieCheckOut
                                    ? 'border-emerald-600/70 bg-emerald-500/10'
                                    : 'border-border bg-muted/25 hover:bg-muted/40'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                <div
                                    className={`p-2 rounded-lg shrink-0 mt-0.5 ${requireSelfieCheckOut
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                        }`}
                                >
                                    {requireSelfieCheckOut ? <Camera size={16} /> : <MapPin size={16} />}
                                </div>
                                <div>
                                    <div className="text-xs font-bold">
                                        Selfie Presensi Pulang (Check-Out)
                                    </div>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">
                                        {requireSelfieCheckOut
                                            ? 'Aktif: Guru wajib mengambil foto selfie saat absen pulang.'
                                            : 'Nonaktif: Absen pulang langsung tercatat dengan GPS saja.'}
                                    </p>
                                </div>
                            </div>

                            <span
                                className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${requireSelfieCheckOut ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                            >
                                <span
                                    className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${requireSelfieCheckOut ? 'translate-x-5' : 'translate-x-0'
                                        }`}
                                />
                            </span>
                        </div>
                    </div>
                </div>

                {/* Pilihan 5 Hari Kerja vs 6 Hari Kerja */}
                <div>
                    <label className="block text-xs font-semibold mb-2">
                        Sistem Hari Kerja Sekolah *
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={() => setWorkDaysMode('FIVE_DAYS')}
                            className={`p-4 rounded-xl border text-left transition flex items-start gap-3 ${workDaysMode === 'FIVE_DAYS'
                                    ? 'border-emerald-600 bg-emerald-500/10 ring-2 ring-emerald-500/20'
                                    : 'border-border bg-muted/20 hover:bg-muted/40'
                                }`}
                        >
                            <Briefcase
                                size={20}
                                className={
                                    workDaysMode === 'FIVE_DAYS'
                                        ? 'text-emerald-600 shrink-0 mt-0.5'
                                        : 'text-muted-foreground shrink-0 mt-0.5'
                                }
                            />
                            <div>
                                <div className="text-xs font-bold">
                                    5 Hari Kerja (Senin – Jumat)
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Hari <strong>Sabtu & Minggu</strong> otomatis ditandai sebagai Tanggal Merah pada kalender presensi.
                                </p>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setWorkDaysMode('SIX_DAYS')}
                            className={`p-4 rounded-xl border text-left transition flex items-start gap-3 ${workDaysMode === 'SIX_DAYS'
                                    ? 'border-emerald-600 bg-emerald-500/10 ring-2 ring-emerald-500/20'
                                    : 'border-border bg-muted/20 hover:bg-muted/40'
                                }`}
                        >
                            <Briefcase
                                size={20}
                                className={
                                    workDaysMode === 'SIX_DAYS'
                                        ? 'text-emerald-600 shrink-0 mt-0.5'
                                        : 'text-muted-foreground shrink-0 mt-0.5'
                                }
                            />
                            <div>
                                <div className="text-xs font-bold">
                                    6 Hari Kerja (Senin – Sabtu)
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                    Hari Sabtu tetap dihitung hari masuk; hanya <strong>Minggu, Libur Nasional & Cuti Bersama</strong> yang berwarna merah.
                                </p>
                            </div>
                        </button>
                    </div>
                </div>

                <div className="flex justify-end pt-1">
                    <button
                        type="submit"
                        disabled={isSavingSchedule || !selectedSchoolId}
                        className="btn-primary px-5 py-2.5 text-xs font-bold rounded-xl"
                    >
                        <Save size={15} />
                        {isSavingSchedule
                            ? 'Menyimpan...'
                            : 'Simpan Pengaturan Jam, Selfie & Hari Kerja'}
                    </button>
                </div>
            </form>

            {/* ====================================================================
          BAGIAN 2: HARI LIBUR NASIONAL & CUTI BERSAMA (SERVER API + EXCEL + DB)
      ==================================================================== */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border pb-3">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <CalendarDays size={18} className="text-red-500" />
                            Kalender Hari Libur Nasional, Cuti Bersama & Sekolah
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Sinkronisasi cepat dari 6 server kalender nasional (dengan penyesuaian Muhammadiyah), impor file Excel (.xlsx / .csv), atau input manual.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => downloadHolidayExcelTemplate(filterYear)}
                            className="btn-secondary text-xs py-2 px-3"
                        >
                            <Download size={14} />
                            Template Excel
                        </button>

                        <label className="btn-secondary text-xs py-2 px-3 cursor-pointer">
                            <Upload size={14} />
                            Import Excel / CSV
                            <input
                                type="file"
                                accept=".xlsx,.csv,.txt"
                                className="hidden"
                                onChange={handleSelectExcelFile}
                            />
                        </label>
                    </div>
                </div>

                {/* Panel Kontrol Sinkronisasi Server API + Kalender Muhammadiyah */}
                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex flex-col gap-2.5 flex-1">
                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 sm:w-24 shrink-0">
                                    <Server size={15} />
                                    Server API:
                                </span>
                                <select
                                    value={selectedApiProvider}
                                    onChange={(e) =>
                                        setSelectedApiProvider(e.target.value as HolidayApiProviderId)
                                    }
                                    className="form-input w-full sm:w-72 text-xs py-1.5 px-3 bg-card"
                                >
                                    {HOLIDAY_API_PROVIDER_OPTIONS.map((opt) => (
                                        <option key={opt.id} value={opt.id}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5 sm:w-24 shrink-0">
                                    <Moon size={15} />
                                    Kalender:
                                </span>
                                <select
                                    value={calendarRefMode}
                                    onChange={(e) =>
                                        setCalendarRefMode(e.target.value as CalendarReferenceMode)
                                    }
                                    className="form-input w-full sm:w-72 text-xs py-1.5 px-3 bg-card"
                                >
                                    <option value="MUHAMMADIYAH">
                                        Muhammadiyah (KHGT / Hisab)
                                    </option>
                                    <option value="PEMERINTAH">
                                        Pemerintah (SKB 3 Menteri)
                                    </option>
                                </select>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={handleFetchFromServer}
                            disabled={isFetchingServer}
                            className="btn-primary text-xs py-2.5 px-4 bg-blue-600 hover:bg-blue-700 shrink-0 self-start md:self-center"
                        >
                            {isFetchingServer ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Server size={14} />
                            )}
                            {isFetchingServer
                                ? 'Menarik Data...'
                                : `Sync dari Server (${filterYear})`}
                        </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-blue-500/20 text-xs">
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 cursor-pointer font-medium">
                                <input
                                    type="checkbox"
                                    checked={includeCutiFromServer}
                                    onChange={(e) => setIncludeCutiFromServer(e.target.checked)}
                                    className="rounded border-border"
                                />
                                <span>
                                    Sertakan jadwal <strong>Cuti Bersama</strong>
                                </span>
                            </label>

                            {calendarRefMode === 'MUHAMMADIYAH' && (
                                <label className="flex items-center gap-2 cursor-pointer font-medium text-emerald-800 dark:text-emerald-200">
                                    <input
                                        type="checkbox"
                                        checked={includeAwalRamadan}
                                        onChange={(e) => setIncludeAwalRamadan(e.target.checked)}
                                        className="rounded border-border"
                                    />
                                    <span>
                                        Sertakan <strong>Awal Puasa (1 Ramadan)</strong>
                                    </span>
                                </label>
                            )}
                        </div>

                        {isSuperAdmin && (
                            <div className="flex flex-wrap items-center gap-3">
                                <span className="font-semibold">Cakupan Simpan:</span>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="holidayScope"
                                        checked={holidayScope === 'GLOBAL'}
                                        onChange={() => setHolidayScope('GLOBAL')}
                                    />
                                    <Globe size={13} className="text-purple-500" />
                                    <span>Nasional / Global</span>
                                </label>
                                <label className="flex items-center gap-1.5 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="holidayScope"
                                        checked={holidayScope === 'SCHOOL'}
                                        onChange={() => setHolidayScope('SCHOOL')}
                                    />
                                    <Building2 size={13} className="text-blue-500" />
                                    <span>Khusus Sekolah Ini</span>
                                </label>
                            </div>
                        )}
                    </div>

                    {syncFeedback && (
                        <div
                            className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${syncFeedback.status === 'loading'
                                    ? 'bg-blue-500/15 border-blue-500/40 text-blue-800 dark:text-blue-200'
                                    : syncFeedback.status === 'success'
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                                        : 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200'
                                }`}
                        >
                            {syncFeedback.status === 'loading' ? (
                                <Loader2 size={15} className="animate-spin shrink-0" />
                            ) : syncFeedback.status === 'success' ? (
                                <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                            ) : (
                                <AlertTriangle size={15} className="text-red-600 shrink-0" />
                            )}
                            <span>{syncFeedback.text}</span>
                        </div>
                    )}
                </div>

                {/* Kotak Pratinjau Hasil Server / Excel */}
                {previewRows.length > 0 && (
                    <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                                <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                    <FileSpreadsheet size={16} />
                                    <span>
                                        Pratinjau: {previewSourceLabel} ({previewRows.length} Tanggal)
                                    </span>
                                </div>
                                <p className="text-[11px] opacity-75 mt-0.5">
                                    Tip: Klik tanggal atau keterangan di bawah jika ingin menggeser 1 hari sebelum disimpan.
                                </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setPreviewRows((prev) => [
                                            ...prev,
                                            { date: `${filterYear}-01-01`, name: 'Libur Tambahan' },
                                        ])
                                    }
                                    className="btn-secondary text-xs py-1.5 px-3"
                                    disabled={isImporting}
                                >
                                    <Plus size={13} />
                                    Tambah Baris
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setPreviewRows([]);
                                        setPreviewSourceLabel('');
                                    }}
                                    className="btn-secondary text-xs py-1.5 px-3"
                                    disabled={isImporting}
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmBatchSave}
                                    disabled={isImporting}
                                    className="btn-primary text-xs py-1.5 px-4 font-bold"
                                >
                                    <Save size={14} />
                                    {isImporting ? 'Menyimpan...' : 'Simpan ke Database'}
                                </button>
                            </div>
                        </div>

                        <div className="max-h-60 overflow-y-auto rounded-lg border border-border bg-card">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/60 text-left">
                                    <tr>
                                        <th className="py-2 px-3 font-semibold w-12">No</th>
                                        <th className="py-2 px-3 font-semibold w-40">Tanggal</th>
                                        <th className="py-2 px-3 font-semibold w-36">Pasaran Jawa</th>
                                        <th className="py-2 px-3 font-semibold">Keterangan Libur / Cuti</th>
                                        <th className="py-2 px-3 font-semibold w-14 text-right">Hapus</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {previewRows.map((row, idx) => {
                                        const jawaInfo =
                                            row.date.length === 10
                                                ? getJavaneseDateInfo(row.date)
                                                : null;
                                        return (
                                            <tr key={`preview-${idx}`}>
                                                <td className="py-1.5 px-3 font-mono text-muted-foreground">
                                                    {idx + 1}
                                                </td>
                                                <td className="py-1.5 px-3">
                                                    <input
                                                        type="date"
                                                        value={row.date}
                                                        onChange={(e) =>
                                                            setPreviewRows((prev) =>
                                                                prev.map((item, i) =>
                                                                    i === idx
                                                                        ? { ...item, date: e.target.value }
                                                                        : item
                                                                )
                                                            )
                                                        }
                                                        className="form-input w-auto! text-xs py-1 px-2 font-mono text-red-500 font-semibold"
                                                    />
                                                </td>
                                                <td className="py-1.5 px-3 text-[11px] font-medium text-muted-foreground">
                                                    {jawaInfo?.hariPasaran ?? '-'}
                                                </td>
                                                <td className="py-1.5 px-3">
                                                    <input
                                                        type="text"
                                                        value={row.name}
                                                        onChange={(e) =>
                                                            setPreviewRows((prev) =>
                                                                prev.map((item, i) =>
                                                                    i === idx
                                                                        ? { ...item, name: e.target.value }
                                                                        : item
                                                                )
                                                            )
                                                        }
                                                        className="form-input w-full text-xs py-1 px-2"
                                                    />
                                                </td>
                                                <td className="py-1.5 px-3 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setPreviewRows((prev) =>
                                                                prev.filter((_, i) => i !== idx)
                                                            )
                                                        }
                                                        className="p-1.5 text-red-500 hover:bg-red-500/15 rounded"
                                                        title="Kecualikan tanggal ini"
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* Form Tambah 1 Tanggal Libur Manual */}
                <form
                    onSubmit={handleAddSingleHoliday}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end bg-muted/25 p-3.5 rounded-xl border border-border"
                >
                    <div className="sm:col-span-4">
                        <label className="block text-[11px] font-semibold mb-1">
                            Tanggal Libur / Cuti *
                        </label>
                        <input
                            type="date"
                            required
                            value={newHolidayDate}
                            onChange={(e) => setNewHolidayDate(e.target.value)}
                            className="form-input w-full text-xs"
                        />
                    </div>
                    <div className="sm:col-span-5">
                        <label className="block text-[11px] font-semibold mb-1">
                            Keterangan Hari Libur *
                        </label>
                        <input
                            type="text"
                            required
                            value={newHolidayName}
                            onChange={(e) => setNewHolidayName(e.target.value)}
                            placeholder="Contoh: Awal Puasa Ramadan / Cuti Bersama Idul Fitri"
                            className="form-input w-full text-xs"
                        />
                    </div>
                    <div className="sm:col-span-3">
                        <button
                            type="submit"
                            disabled={isAddingHoliday}
                            className="btn-primary w-full justify-center py-2 text-xs font-bold"
                        >
                            <Plus size={14} />
                            {isAddingHoliday ? 'Menyimpan...' : 'Tambah Libur'}
                        </button>
                    </div>
                </form>

                {/* DAFTAR TANGGAL MERAH (KALENDER RESPONSIF + OPSI DAFTAR) */}
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <h3 className="text-xs font-bold">
                                Daftar Tanggal Merah Tahun {filterYear} ({holidays.length} hari)
                            </h3>

                            <div className="inline-flex rounded-lg border border-border bg-muted/50 p-0.5">
                                <button
                                    type="button"
                                    onClick={() => setHolidayViewMode('CALENDAR')}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${holidayViewMode === 'CALENDAR'
                                            ? 'bg-card text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    <Calendar size={13} />
                                    Kalender
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setHolidayViewMode('LIST')}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${holidayViewMode === 'LIST'
                                            ? 'bg-card text-foreground shadow-sm'
                                            : 'text-muted-foreground hover:text-foreground'
                                        }`}
                                >
                                    <List size={13} />
                                    Daftar
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <select
                                value={filterYear}
                                onChange={(e) => setFilterYear(Number(e.target.value))}
                                className="form-input w-auto! min-w-32 text-xs py-1.5 px-3 font-semibold shrink-0"
                            >
                                {availableYears.map((yr) => (
                                    <option key={yr} value={yr}>
                                        Tahun {yr}
                                    </option>
                                ))}
                            </select>

                            <button
                                type="button"
                                onClick={handleAddNextYear}
                                className="btn-secondary text-xs py-1.5 px-3 font-semibold text-emerald-700 dark:text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/10 shrink-0 whitespace-nowrap"
                                title="Tambahkan tahun berikutnya ke daftar pilihan"
                            >
                                <Plus size={14} />
                                Tambah Tahun
                            </button>

                            <button
                                type="button"
                                onClick={loadHolidays}
                                className="p-2 rounded-lg bg-muted hover:bg-muted/80 shrink-0"
                                title="Refresh Daftar Libur"
                            >
                                <RefreshCw
                                    size={14}
                                    className={isLoadingHolidays ? 'spin' : ''}
                                />
                            </button>
                        </div>
                    </div>

                    {!isLoadingHolidays && deletableHolidays.length > 0 && (
                        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-muted/35 border border-border text-xs">
                            {holidayViewMode === 'LIST' ? (
                                <label className="flex items-center gap-2 cursor-pointer font-semibold select-none">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        onChange={toggleSelectAll}
                                        className="rounded border-border w-4 h-4 accent-emerald-600 cursor-pointer"
                                    />
                                    <span>
                                        Pilih Semua ({selectedHolidayIds.length}/
                                        {deletableHolidays.length} dipilih)
                                    </span>
                                </label>
                            ) : (
                                <span className="text-[11px] text-muted-foreground">
                                    Ketuk tanggal mana pun untuk melihat detail & Pasaran Jawa
                                </span>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                                {holidayViewMode === 'LIST' && selectedHolidayIds.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setDeleteConfirmModal({
                                                title: `Hapus ${selectedHolidayIds.length} Tanggal Merah Terpilih?`,
                                                description: `Anda akan menghapus ${selectedHolidayIds.length} data tanggal merah yang dicentang dari database. Tindakan ini tidak dapat dibatalkan.`,
                                                targetIds: selectedHolidayIds,
                                            })
                                        }
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition"
                                    >
                                        <Trash2 size={13} />
                                        Hapus Terpilih ({selectedHolidayIds.length})
                                    </button>
                                )}

                                <button
                                    type="button"
                                    onClick={() =>
                                        setDeleteConfirmModal({
                                            title: `Hapus Semua Tanggal Merah Tahun ${filterYear}?`,
                                            description: `Seluruh ${deletableHolidays.length} data hari libur tahun ${filterYear} yang dapat Anda kelola akan dihapus permanen dari database.`,
                                            targetIds: deletableHolidays.map((h) => h.id),
                                        })
                                    }
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300 hover:bg-red-500/20 transition"
                                >
                                    <Trash2 size={13} />
                                    Hapus Semua ({deletableHolidays.length})
                                </button>
                            </div>
                        </div>
                    )}

                    {isLoadingHolidays ? (
                        <div className="py-8 text-center text-xs opacity-70">
                            Memuat data hari libur dari database...
                        </div>
                    ) : holidayViewMode === 'CALENDAR' ? (
                        <HolidayCalendarView
                            year={filterYear}
                            holidays={holidays}
                            workDaysMode={workDaysMode}
                            isSuperAdmin={isSuperAdmin}
                            onClickEditHoliday={handleOpenEditModal}
                            onClickAddHolidayOnDate={(isoDate) => {
                                setNewHolidayDate(isoDate);
                                setSyncFeedback({
                                    status: 'success',
                                    text: `Tanggal ${isoDate} dipilih pada formulir di atas. Ketik keterangannya lalu klik "+ Tambah Libur".`,
                                });
                            }}
                        />
                    ) : holidays.length === 0 ? (
                        <div className="py-8 text-center text-xs opacity-75 border border-dashed border-border rounded-xl space-y-2 px-4">
                            <p>
                                Belum ada data hari libur tersimpan untuk tahun{' '}
                                <strong>{filterYear}</strong>.
                            </p>
                            <p className="text-[11px] opacity-75">
                                Klik tombol <strong>Sync dari Server ({filterYear})</strong> di atas untuk menarik otomatis Hari Libur Nasional & Cuti Bersama, lalu klik <strong>Simpan ke Database</strong>.
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-96 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                            {holidays.map((item, index) => {
                                const isGlobal = item.schoolId === null;
                                const isCuti = item.name.toLowerCase().includes('cuti bersama');
                                const canManageItem = isSuperAdmin || !isGlobal;
                                const isChecked = selectedHolidayIds.includes(item.id);
                                const jawaInfo = getJavaneseDateInfo(item.date);

                                return (
                                    <div
                                        key={item.id}
                                        className={`p-3 flex items-center justify-between gap-3 transition text-xs ${isChecked ? 'bg-emerald-500/10' : 'hover:bg-muted/30'
                                            }`}
                                    >
                                        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                            {canManageItem ? (
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={() => toggleSelectOne(item.id)}
                                                    className="rounded border-border w-4 h-4 accent-emerald-600 cursor-pointer shrink-0"
                                                />
                                            ) : (
                                                <span className="w-4 shrink-0" />
                                            )}

                                            <span className="w-6 text-center font-mono text-[11px] font-bold text-muted-foreground shrink-0">
                                                {index + 1}.
                                            </span>

                                            <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-lg shrink-0">
                                                {item.date}
                                            </span>

                                            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 shrink-0">
                                                {jawaInfo.hariPasaran}
                                            </span>

                                            <span className="font-medium truncate">{item.name}</span>

                                            {isCuti && (
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                                                    Cuti Bersama
                                                </span>
                                            )}

                                            {isGlobal ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-300">
                                                    <Globe size={10} /> Nasional
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/15 text-blue-600 dark:text-blue-300">
                                                    <Building2 size={10} /> Sekolah
                                                </span>
                                            )}
                                        </div>

                                        {canManageItem && (
                                            <div className="flex items-center gap-1 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => handleOpenEditModal(item)}
                                                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-500/15 transition"
                                                    title="Edit tanggal atau keterangan"
                                                >
                                                    <Pencil size={14} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDeleteConfirmModal({
                                                            title: 'Hapus Tanggal Merah?',
                                                            description: `Apakah Anda yakin ingin menghapus "${item.name}" (${jawaInfo.fullFormattedDate})?`,
                                                            targetIds: [item.id],
                                                        })
                                                    }
                                                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition"
                                                    title="Hapus hari libur"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* MODAL 1: EDIT TANGGAL & KETERANGAN HARI LIBUR */}
            {editingHoliday && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <form
                        onSubmit={handleSaveEditHoliday}
                        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150"
                    >
                        <div className="flex items-center justify-between border-b border-border pb-3">
                            <div className="flex items-center gap-2">
                                <div className="p-2 rounded-lg bg-blue-500/15 text-blue-600">
                                    <Pencil size={16} />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold">Edit Tanggal Merah</h3>
                                    <p className="text-[11px] text-muted-foreground">
                                        Perbarui tanggal atau keterangan hari libur
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingHoliday(null)}
                                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    Tanggal Libur *
                                </label>
                                <input
                                    type="date"
                                    required
                                    value={editDateInput}
                                    onChange={(e) => setEditDateInput(e.target.value)}
                                    className="form-input w-full text-xs font-mono"
                                />
                                {editDateInput.length === 10 && (
                                    <p className="text-[11px] text-emerald-600 dark:text-emerald-300 mt-1 font-medium">
                                        Kalender Jawa:{' '}
                                        {getJavaneseDateInfo(editDateInput).fullFormattedDate}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1">
                                    Keterangan Hari Libur *
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={editNameInput}
                                    onChange={(e) => setEditNameInput(e.target.value)}
                                    className="form-input w-full text-xs"
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setEditingHoliday(null)}
                                disabled={isSavingEdit}
                                className="btn-secondary text-xs py-2 px-4"
                            >
                                Batal
                            </button>
                            <button
                                type="submit"
                                disabled={isSavingEdit}
                                className="btn-primary text-xs py-2 px-4 font-bold"
                            >
                                <Save size={14} />
                                {isSavingEdit ? 'Menyimpan...' : 'Simpan Perubahan'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* MODAL 2: KONFIRMASI HAPUS MODERN */}
            {deleteConfirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-start gap-3">
                            <div className="p-2.5 rounded-xl bg-red-500/15 text-red-600 shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div className="space-y-1">
                                <h3 className="text-sm font-bold text-foreground">
                                    {deleteConfirmModal.title}
                                </h3>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {deleteConfirmModal.description}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                            <button
                                type="button"
                                onClick={() => setDeleteConfirmModal(null)}
                                disabled={isDeletingHolidays}
                                className="btn-secondary text-xs py-2 px-4"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDeleteExecution}
                                disabled={isDeletingHolidays}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
                            >
                                <Trash2 size={14} />
                                {isDeletingHolidays ? 'Menghapus...' : 'Ya, Hapus Sekarang'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}