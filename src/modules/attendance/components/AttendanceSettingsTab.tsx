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

    // 1. State Pengaturan Jam Kerja, Toleransi Keterlambatan, & Hari Kerja
    const [workStartTime, setWorkStartTime] = useState<string>('07:30');
    const [lateToleranceMinutes, setLateToleranceMinutes] = useState<number>(0);
    const [workEndTime, setWorkEndTime] = useState<string>('14:30');
    const [workDaysMode, setWorkDaysMode] = useState<WorkDaysMode>('SIX_DAYS');
    const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(false);
    const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

    // 2. State Tahun, Pilihan 3 Server API, Mode Muhammadiyah, & Hari Libur
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

    const [holidayScope, setHolidayScope] = useState<'GLOBAL' | 'SCHOOL'>(
        isSuperAdmin ? 'GLOBAL' : 'SCHOOL'
    );
    const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
    const [isLoadingHolidays, setIsLoadingHolidays] = useState<boolean>(false);

    // Tambah 1 tanggal libur manual
    const [newHolidayDate, setNewHolidayDate] = useState<string>('');
    const [newHolidayName, setNewHolidayName] = useState<string>('');
    const [isAddingHoliday, setIsAddingHoliday] = useState<boolean>(false);

    // Pratinjau Import Excel / Server (bisa diedit langsung sebelum disimpan)
    const [previewRows, setPreviewRows] = useState<ParsedHolidayRow[]>([]);
    const [previewSourceLabel, setPreviewSourceLabel] = useState<string>('');
    const [isImporting, setIsImporting] = useState<boolean>(false);

    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 5000);
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

    // Muat pengaturan jam kerja, toleransi keterlambatan, & hari kerja
    const loadScheduleSettings = useCallback(async () => {
        if (!selectedSchoolId) return;
        setIsLoadingSchedule(true);
        try {
            const { data, error } = await supabase
                .from('schools')
                .select('id, workStartTime, lateToleranceMinutes, workEndTime, workDaysMode')
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
            }
        } catch (err: unknown) {
            const msg =
                err instanceof Error
                    ? err.message
                    : 'Kolom pengaturan jam kerja belum tersedia. Jalankan skrip SQL di Supabase terlebih dahulu.';
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
        showToast(
            'success',
            `Tahun ${nextYear} berhasil ditambahkan! Klik "Sync dari Server (${nextYear})" atau "Import Excel" untuk mengisi tanggal merah.`
        );
    };

    // Simpan pengaturan jam masuk, toleransi keterlambatan, jam pulang, dan hari kerja
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
                })
                .eq('id', selectedSchoolId);

            if (error) throw error;
            setLateToleranceMinutes(cleanTolerance);
            showToast(
                'success',
                cleanTolerance > 0
                    ? `Tersimpan! Jam masuk ${workStartTime} + toleransi ${cleanTolerance} menit (batas terlambat ${effectiveDeadlinePreview}), pulang ${workEndTime}.`
                    : `Tersimpan! Jam masuk ${workStartTime} (tanpa toleransi), pulang ${workEndTime}.`
            );
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error ? err.message : 'Gagal menyimpan pengaturan jam kerja.'
            );
        } finally {
            setIsSavingSchedule(false);
        }
    };

    // Muat daftar hari libur untuk tahun terpilih + deteksi semua tahun yang ada di DB
    const loadHolidays = useCallback(async () => {
        setIsLoadingHolidays(true);
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

    // Simpan batch hari libur
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

    // Ambil Data Hari Libur Nasional & Cuti Bersama dari 3 Server API
    const handleFetchFromServer = async () => {
        setIsFetchingServer(true);
        try {
            const { rows, usedProviderLabel } = await fetchHolidaysFromServer({
                year: filterYear,
                includeCutiBersama: includeCutiFromServer,
                providerId: selectedApiProvider,
                calendarMode: calendarRefMode,
                includeAwalRamadan:
                    calendarRefMode === 'MUHAMMADIYAH' && includeAwalRamadan,
            });

            setPreviewRows(rows);
            setPreviewSourceLabel(`${usedProviderLabel} — Tahun ${filterYear}`);
            showToast(
                'success',
                `Berhasil menarik ${rows.length} data libur tahun ${filterYear} dari ${usedProviderLabel}! Kamu bisa edit tanggal di bawah sebelum Simpan ke Database.`
            );
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error ? err.message : 'Gagal mengambil data dari server.'
            );
        } finally {
            setIsFetchingServer(false);
        }
    };

    // Tambah 1 Hari Libur Manual
    const handleAddSingleHoliday = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newHolidayDate || newHolidayName.trim().length < 3) {
            showToast('error', 'Isi tanggal dan keterangan hari libur dengan lengkap.');
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
            showToast('success', 'Hari libur berhasil ditambahkan ke database!');
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error ? err.message : 'Gagal menambahkan hari libur.'
            );
        } finally {
            setIsAddingHoliday(false);
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
                showToast(
                    'error',
                    'Tidak ada baris valid ditemukan. Pastikan kolom 1 adalah Tanggal (YYYY-MM-DD) dan kolom 2 adalah Keterangan.'
                );
                return;
            }
            setPreviewRows(parsed);
            setPreviewSourceLabel(`File ${file.name}`);
            showToast(
                'success',
                `Berhasil membaca ${parsed.length} tanggal libur dari file. Periksa pratinjau lalu klik Simpan ke Database.`
            );
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error ? err.message : 'Gagal membaca file Excel/CSV.'
            );
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
            showToast(
                'success',
                `${countSaved} data hari libur & cuti bersama berhasil disimpan ke database!`
            );
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error ? err.message : 'Gagal menyimpan data ke database.'
            );
        } finally {
            setIsImporting(false);
        }
    };

    const handleDeleteHoliday = async (item: HolidayRecord) => {
        if (!isSuperAdmin && item.schoolId === null) {
            showToast(
                'error',
                'Hari Libur Nasional Global hanya dapat dihapus oleh Super Admin.'
            );
            return;
        }

        if (!window.confirm(`Hapus hari libur "${item.name}" (${item.date})?`)) {
            return;
        }

        try {
            const { error } = await supabase
                .from('national_holidays')
                .delete()
                .eq('id', item.id);

            if (error) throw error;
            showToast('success', 'Hari libur berhasil dihapus.');
            await loadHolidays();
        } catch (err: unknown) {
            showToast(
                'error',
                err instanceof Error ? err.message : 'Gagal menghapus hari libur.'
            );
        }
    };

    if (!canManage) return null;

    return (
        <div className="space-y-6">
            {/* Toast Notifikasi */}
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
                            Pilih sekolah untuk mengatur jam kerja, toleransi keterlambatan, & hari kerja:
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
          BAGIAN 1: JAM BERANGKAT, TOLERANSI KETERLAMBATAN, JAM PULANG, & HARI KERJA
      ==================================================================== */}
            <form
                onSubmit={handleSaveSchedule}
                className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
            >
                <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <Clock size={18} className="text-emerald-600" />
                            Jam Kerja, Toleransi Keterlambatan & Sistem Hari Kerja
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Menentukan batas waktu terlambat check-in, jadwal pulang, serta hari libur akhir pekan pada kalender presensi.
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
                        className="btn-primary px-5 py-2.5 text-xs font-bold"
                    >
                        <Save size={15} />
                        {isSavingSchedule ? 'Menyimpan...' : 'Simpan Pengaturan Jam & Hari Kerja'}
                    </button>
                </div>
            </form>

            {/* ====================================================================
          BAGIAN 2: HARI LIBUR NASIONAL & CUTI BERSAMA (3 SERVER API + EXCEL + DB)
      ==================================================================== */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-border pb-3">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <CalendarDays size={18} className="text-red-500" />
                            Kalender Hari Libur Nasional, Cuti Bersama & Sekolah
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Sinkronisasi cepat dari 3 server kalender nasional (dengan penyesuaian Muhammadiyah), impor file Excel (.xlsx / .csv), atau input manual.
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

                {/* Panel Kontrol Sinkronisasi 3 Server API + Kalender Muhammadiyah */}
                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 space-y-3">
                    <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                            <span className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 shrink-0">
                                <Server size={15} />
                                Server API:
                            </span>
                            <select
                                value={selectedApiProvider}
                                onChange={(e) =>
                                    setSelectedApiProvider(e.target.value as HolidayApiProviderId)
                                }
                                className="form-input w-auto! min-w-56 text-xs py-1.5 px-3 bg-card shrink-0"
                            >
                                {HOLIDAY_API_PROVIDER_OPTIONS.map((opt) => (
                                    <option key={opt.id} value={opt.id}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>

                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1 shrink-0">
                                <Moon size={14} />
                                Kalender:
                            </span>
                            <select
                                value={calendarRefMode}
                                onChange={(e) =>
                                    setCalendarRefMode(e.target.value as CalendarReferenceMode)
                                }
                                className="form-input w-auto! min-w-52 text-xs py-1.5 px-3 bg-card shrink-0"
                            >
                                <option value="MUHAMMADIYAH">
                                    Muhammadiyah (KHGT / Hisab)
                                </option>
                                <option value="PEMERINTAH">
                                    Pemerintah (SKB 3 Menteri)
                                </option>
                            </select>
                        </div>

                        <button
                            type="button"
                            onClick={handleFetchFromServer}
                            disabled={isFetchingServer}
                            className="btn-primary text-xs py-2 px-4 bg-blue-600 hover:bg-blue-700 shrink-0 self-start xl:self-auto"
                        >
                            <Server size={14} className={isFetchingServer ? 'animate-pulse' : ''} />
                            {isFetchingServer
                                ? 'Menghubungkan Server...'
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
                </div>

                {/* Kotak Pratinjau Hasil Server / Excel (Tanggal & Keterangan Bisa Diedit Langsung) */}
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
                                        <th className="py-2 px-3 font-semibold w-40">Tanggal (Bisa Edit)</th>
                                        <th className="py-2 px-3 font-semibold">Keterangan Libur / Cuti (Bisa Edit)</th>
                                        <th className="py-2 px-3 font-semibold w-14 text-right">Hapus</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {previewRows.map((row, idx) => (
                                        <tr key={`preview-${idx}`}>
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
                                    ))}
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

                {/* Daftar Hari Libur Tersimpan di Database + Pilihan Tahun & Tombol "+ Tambah Tahun" SEJAJAR */}
                <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-xs font-bold">
                            Daftar Tanggal Merah Tahun {filterYear} ({holidays.length} hari)
                        </h3>

                        {/* Kontainer 1 Baris Sejajar untuk Dropdown Tahun + Tombol Tambah Tahun + Refresh */}
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

                    {isLoadingHolidays ? (
                        <div className="py-8 text-center text-xs opacity-70">
                            Memuat data hari libur dari database...
                        </div>
                    ) : holidays.length === 0 ? (
                        <div className="py-8 text-center text-xs opacity-75 border border-dashed border-border rounded-xl space-y-2 px-4">
                            <p>
                                Belum ada data hari libur tersimpan untuk tahun{' '}
                                <strong>{filterYear}</strong>.
                            </p>
                            <p className="text-[11px] opacity-75">
                                Klik tombol <strong>Sync dari Server ({filterYear})</strong> di atas untuk menarik otomatis Hari Libur Nasional & Cuti Bersama, atau gunakan <strong>Import Excel / CSV</strong>.
                            </p>
                        </div>
                    ) : (
                        <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                            {holidays.map((item) => {
                                const isGlobal = item.schoolId === null;
                                const isCuti = item.name.toLowerCase().includes('cuti bersama');
                                const lockedForAdmin = !isSuperAdmin && isGlobal;

                                return (
                                    <div
                                        key={item.id}
                                        className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition text-xs"
                                    >
                                        <div className="flex flex-wrap items-center gap-2 min-w-0">
                                            <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-lg shrink-0">
                                                {item.date}
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

                                        {!lockedForAdmin && (
                                            <button
                                                type="button"
                                                onClick={() => handleDeleteHoliday(item)}
                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/15 transition shrink-0"
                                                title="Hapus hari libur"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}