// src/modules/attendance/components/AttendanceSettingsTab.tsx
import { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import type { WorkDaysMode, HolidayRecord } from '../utils/indonesianHolidays';
import {
    downloadHolidayExcelTemplate,
    parseHolidaySpreadsheetFile,
    type ParsedHolidayRow,
} from '../utils/excelHolidayParser';

export function AttendanceSettingsTab() {
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    const isAdmin = user?.role === 'ADMIN';
    const canManage = isSuperAdmin || isAdmin;

    // Pilihan sekolah (untuk Super Admin yang bisa berpindah antar sekolah)
    const [schools, setSchools] = useState<Array<{ id: string; name: string }>>([]);
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
        school?.id ?? ''
    );

    // 1. State Pengaturan Jam & Hari Kerja
    const [workStartTime, setWorkStartTime] = useState<string>('07:30');
    const [workEndTime, setWorkEndTime] = useState<string>('14:30');
    const [workDaysMode, setWorkDaysMode] = useState<WorkDaysMode>('SIX_DAYS');
    const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(false);
    const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

    // 2. State Pengaturan Hari Libur Nasional (Database + Import Excel)
    const [filterYear, setFilterYear] = useState<number>(() =>
        new Date().getFullYear()
    );
    const [holidayScope, setHolidayScope] = useState<'GLOBAL' | 'SCHOOL'>(
        isSuperAdmin ? 'GLOBAL' : 'SCHOOL'
    );
    const [holidays, setHolidays] = useState<HolidayRecord[]>([]);
    const [isLoadingHolidays, setIsLoadingHolidays] = useState<boolean>(false);

    // Tambah 1 tanggal libur manual
    const [newHolidayDate, setNewHolidayDate] = useState<string>('');
    const [newHolidayName, setNewHolidayName] = useState<string>('');
    const [isAddingHoliday, setIsAddingHoliday] = useState<boolean>(false);

    // Pratinjau Import Excel / CSV
    const [previewRows, setPreviewRows] = useState<ParsedHolidayRow[]>([]);
    const [isImporting, setIsImporting] = useState<boolean>(false);

    const [toast, setToast] = useState<{
        type: 'success' | 'error';
        message: string;
    } | null>(null);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4500);
    };

    // Sinkronkan sekolah aktif dari store
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

    // Muat pengaturan jam & hari kerja dari tabel schools
    const loadScheduleSettings = useCallback(async () => {
        if (!selectedSchoolId) return;
        setIsLoadingSchedule(true);
        try {
            const { data, error } = await supabase
                .from('schools')
                .select('id, workStartTime, workEndTime, workDaysMode')
                .eq('id', selectedSchoolId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setWorkStartTime(data.workStartTime || '07:30');
                setWorkEndTime(data.workEndTime || '14:30');
                setWorkDaysMode(
                    data.workDaysMode === 'FIVE_DAYS' ? 'FIVE_DAYS' : 'SIX_DAYS'
                );
            }
        } catch (err: any) {
            showToast(
                'error',
                err.message ??
                'Kolom pengaturan jam kerja belum tersedia. Jalankan skrip SQL di Supabase terlebih dahulu.'
            );
        } finally {
            setIsLoadingSchedule(false);
        }
    }, [selectedSchoolId]);

    useEffect(() => {
        loadScheduleSettings();
    }, [loadScheduleSettings]);

    // Simpan pengaturan jam masuk, jam pulang, dan hari kerja
    const handleSaveSchedule = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSchoolId) {
            showToast('error', 'Pilih sekolah terlebih dahulu.');
            return;
        }

        setIsSavingSchedule(true);
        try {
            const { error } = await supabase
                .from('schools')
                .update({
                    workStartTime,
                    workEndTime,
                    workDaysMode,
                })
                .eq('id', selectedSchoolId);

            if (error) throw error;
            showToast(
                'success',
                `Pengaturan jam kerja (${workStartTime} - ${workEndTime}) & ${workDaysMode === 'FIVE_DAYS' ? '5 Hari Kerja' : '6 Hari Kerja'
                } berhasil disimpan!`
            );
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal menyimpan pengaturan jam kerja.');
        } finally {
            setIsSavingSchedule(false);
        }
    };

    // Muat daftar hari libur dari tabel national_holidays
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
        } catch (err: any) {
            showToast(
                'error',
                err.message ??
                'Tabel national_holidays belum tersedia. Jalankan skrip SQL di Supabase terlebih dahulu.'
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

    // Simpan batch hari libur (dipakai oleh tambah manual & import Excel)
    const upsertHolidayRows = async (rows: ParsedHolidayRow[]) => {
        if (rows.length === 0) return;

        if (!isSuperAdmin && !resolvedHolidaySchoolId) {
            throw new Error('Data sekolah tidak ditemukan.');
        }

        // Ambil data eksisting untuk cakupan target agar tidak duplikat tanggal
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

        for (const row of rows) {
            const existingId = existingMap.get(row.date);
            if (existingId) {
                const { error: updErr } = await supabase
                    .from('national_holidays')
                    .update({ name: row.name })
                    .eq('id', existingId);
                if (updErr) throw updErr;
            } else {
                toInsert.push({
                    schoolId: resolvedHolidaySchoolId,
                    date: row.date,
                    name: row.name,
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
            setNewHolidayDate('');
            setNewHolidayName('');
            await loadHolidays();
            showToast('success', 'Hari libur berhasil ditambahkan ke database!');
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal menambahkan hari libur.');
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
            showToast(
                'success',
                `Berhasil membaca ${parsed.length} tanggal libur dari file. Periksa pratinjau lalu klik Simpan Import.`
            );
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal membaca file Excel/CSV.');
        }
    };

    // Eksekusi Import Pratinjau Excel ke Database
    const handleConfirmExcelImport = async () => {
        if (previewRows.length === 0) return;
        setIsImporting(true);
        try {
            await upsertHolidayRows(previewRows);
            const importedYear = Number(previewRows[0].date.slice(0, 4));
            if (Number.isFinite(importedYear)) {
                setFilterYear(importedYear);
            }
            setPreviewRows([]);
            await loadHolidays();
            showToast(
                'success',
                `${previewRows.length} data hari libur berhasil diimpor ke database!`
            );
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal mengimpor data ke database.');
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
        } catch (err: any) {
            showToast('error', err.message ?? 'Gagal menghapus hari libur.');
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
                            Pilih sekolah untuk mengatur jam kerja & hari kerja sekolah tersebut:
                        </p>
                    </div>
                    <select
                        className="form-input text-xs py-2 min-w-60"
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
          BAGIAN 1: PENGATURAN JAM BERANGKAT, JAM PULANG, & SISTEM HARI KERJA
      ==================================================================== */}
            <form
                onSubmit={handleSaveSchedule}
                className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
            >
                <div className="flex items-center justify-between border-b border-border pb-3">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <Clock size={18} className="text-emerald-600" />
                            Jam Kerja & Sistem Hari Kerja Sekolah
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Menentukan batas waktu terlambat check-in, jadwal pulang, serta hari libur akhir pekan pada kalender presensi.
                        </p>
                    </div>
                    {isLoadingSchedule && <RefreshCw size={16} className="spin opacity-60" />}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-semibold mb-1.5">
                            Jam Berangkat / Batas Masuk *
                        </label>
                        <input
                            type="time"
                            required
                            value={workStartTime}
                            onChange={(e) => setWorkStartTime(e.target.value)}
                            className="form-input w-full text-sm font-mono"
                        />
                        <p className="text-[11px] text-muted-foreground mt-1">
                            Check-in melewati jam ini otomatis tercatat berstatus <strong>TERLAMBAT</strong>.
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
                            Ditampilkan sebagai acuan jadwal pulang pada kartu presensi guru.
                        </p>
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
                                    Hari Sabtu tetap dihitung hari masuk; hanya <strong>Minggu & Libur Nasional</strong> yang berwarna merah.
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
          BAGIAN 2: HARI LIBUR NASIONAL & KALENDER LIBUR (DATABASE + EXCEL)
      ==================================================================== */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
                    <div>
                        <h2 className="text-base font-bold flex items-center gap-2">
                            <CalendarDays size={18} className="text-red-500" />
                            Kalender Hari Libur Nasional & Sekolah (Database)
                        </h2>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            Impor data hari libur dari file Excel (.xlsx / .csv) atau tambahkan tanggal merah secara manual tanpa perlu mengubah kode program.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => downloadHolidayExcelTemplate(filterYear)}
                            className="btn-secondary text-xs py-2 px-3"
                        >
                            <Download size={14} />
                            Template Excel
                        </button>

                        <label className="btn-primary text-xs py-2 px-3 cursor-pointer">
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

                {/* Pilihan Cakupan Libur Khusus SUPER_ADMIN */}
                {isSuperAdmin && (
                    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border text-xs">
                        <span className="font-semibold">Cakupan Input / Import:</span>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                name="holidayScope"
                                checked={holidayScope === 'GLOBAL'}
                                onChange={() => setHolidayScope('GLOBAL')}
                            />
                            <Globe size={13} className="text-purple-500" />
                            <span>Nasional / Global (Semua Sekolah)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                            <input
                                type="radio"
                                name="holidayScope"
                                checked={holidayScope === 'SCHOOL'}
                                onChange={() => setHolidayScope('SCHOOL')}
                            />
                            <Building2 size={13} className="text-blue-500" />
                            <span>Khusus Sekolah Terpilih</span>
                        </label>
                    </div>
                )}

                {/* Kotak Pratinjau Hasil Import Excel sebelum Disimpan */}
                {previewRows.length > 0 && (
                    <div className="p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                                <FileSpreadsheet size={16} />
                                <span>
                                    Pratinjau Import Excel ({previewRows.length} Tanggal Libur Siap Disimpan)
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setPreviewRows([])}
                                    className="btn-secondary text-xs py-1.5 px-3"
                                    disabled={isImporting}
                                >
                                    Batal
                                </button>
                                <button
                                    type="button"
                                    onClick={handleConfirmExcelImport}
                                    disabled={isImporting}
                                    className="btn-primary text-xs py-1.5 px-4 font-bold"
                                >
                                    <Save size={14} />
                                    {isImporting ? 'Mengimpor...' : 'Simpan ke Database'}
                                </button>
                            </div>
                        </div>

                        <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/60 text-left">
                                    <tr>
                                        <th className="py-2 px-3 font-semibold w-36">Tanggal</th>
                                        <th className="py-2 px-3 font-semibold">Keterangan Libur</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {previewRows.map((row, idx) => (
                                        <tr key={`${row.date}-${idx}`}>
                                            <td className="py-1.5 px-3 font-mono text-red-500 font-semibold">
                                                {row.date}
                                            </td>
                                            <td className="py-1.5 px-3">{row.name}</td>
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
                            Tanggal Libur *
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
                            placeholder="Contoh: Hari Raya Idul Fitri 1448 H / Libur Semester"
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

                {/* Daftar Hari Libur Tersimpan di Database */}
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold">
                            Daftar Tanggal Merah Tahun {filterYear} ({holidays.length} hari)
                        </h3>
                        <div className="flex items-center gap-2">
                            <select
                                value={filterYear}
                                onChange={(e) => setFilterYear(Number(e.target.value))}
                                className="form-input text-xs py-1 px-2.5"
                            >
                                {[
                                    new Date().getFullYear() - 1,
                                    new Date().getFullYear(),
                                    new Date().getFullYear() + 1,
                                    new Date().getFullYear() + 2,
                                ].map((yr) => (
                                    <option key={yr} value={yr}>
                                        Tahun {yr}
                                    </option>
                                ))}
                            </select>
                            <button
                                type="button"
                                onClick={loadHolidays}
                                className="p-1.5 rounded-lg bg-muted hover:bg-muted/80"
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
                        <div className="py-8 text-center text-xs opacity-65 border border-dashed border-border rounded-xl">
                            Belum ada data hari libur tersimpan untuk tahun {filterYear}. Gunakan tombol{' '}
                            <strong>Template Excel</strong> dan <strong>Import Excel / CSV</strong> di atas.
                        </div>
                    ) : (
                        <div className="max-h-72 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                            {holidays.map((item) => {
                                const isGlobal = item.schoolId === null;
                                const lockedForAdmin = !isSuperAdmin && isGlobal;

                                return (
                                    <div
                                        key={item.id}
                                        className="p-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition text-xs"
                                    >
                                        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                                            <span className="font-mono font-bold text-red-500 bg-red-500/10 px-2.5 py-1 rounded-lg shrink-0">
                                                {item.date}
                                            </span>
                                            <span className="font-medium truncate">{item.name}</span>
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