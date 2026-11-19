// src/modules/attendance/pages/StudentClassAttendancePage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
    Users,
    CheckCircle,
    Clock,
    AlertCircle,
    Save,
    RefreshCw,
    Search,
    UserCheck,
    Sparkles,
    School,
    Calendar,
    CheckSquare,
    LogOut,
    AlertTriangle,
    Lock,
    Unlock,
    CalendarOff,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString } from '../services/gps.utils';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useStudentHolidayLock } from '../hooks/useStudentHolidayLock';
import type {
    AttendanceStatus,
    ClassStudentAttendanceRow,
} from '../types/attendance.types';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const DEFAULT_CLASS_SPECIAL_EVENT = 'Kegiatan Khusus Sekolah';

interface ClassOption {
    id: string;
    name: string;
    gradeLevel: number;
    major?: string | null;
    homeroomTeacherId?: string | null;
}

type EnrichedClassStudentRow = Omit<
    ClassStudentAttendanceRow,
    'attendanceId' | 'checkOutTime'
> & {
    attendanceId?: string | null;
    checkOutTime?: string | null;
};

const STATUS_OPTIONS: Array<{
    value: AttendanceStatus;
    label: string;
    shortLabel: string;
    color: string;
}> = [
        { value: 'HADIR', label: 'Hadir', shortLabel: 'H', color: '#10B981' },
        { value: 'TERLAMBAT', label: 'Terlambat', shortLabel: 'T', color: '#F59E0B' },
        { value: 'IZIN', label: 'Izin', shortLabel: 'I', color: '#3B82F6' },
        { value: 'SAKIT', label: 'Sakit', shortLabel: 'S', color: '#8B5CF6' },
        { value: 'ALPA', label: 'Alpa', shortLabel: 'A', color: '#EF4444' },
    ];

function getErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message: unknown }).message === 'string'
    ) {
        return (error as { message: string }).message;
    }
    return fallbackMessage;
}

export function StudentClassAttendancePage() {
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';

    const [simSchools, setSimSchools] = useState<
        Array<{ id: string; name: string; npsn: string }>
    >([]);
    const [simSchoolId, setSimSchoolId] = useState<string>('');
    const activeSchoolId = isSuperAdmin
        ? simSchoolId || school?.id || ''
        : school?.id || '';

    const [classes, setClasses] = useState<ClassOption[]>([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [homeroomClassId, setHomeroomClassId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [statusFilter, setStatusFilter] = useState<string>('ALL');

    // Hook terpusat pengunci hari libur mengikuti selectedDate
    const {
        isLocked: isHolidayLocked,
        isHoliday,
        holidayName,
        isSpecialEventActive,
        specialEventReason,
        canManageOverride,
        isToggling: isTogglingHoliday,
        activateSpecialEvent,
        deactivateSpecialEvent,
    } = useStudentHolidayLock({
        schoolId: activeSchoolId,
        targetDate: selectedDate,
    });

    const [specialEventInput, setSpecialEventInput] = useState<string>('');

    // Pengaturan sekolah untuk siswa
    const [enableClassAttendance, setEnableClassAttendance] =
        useState<boolean>(true);
    const [enableStudentCheckOut, setEnableStudentCheckOut] =
        useState<boolean>(true);

    const [rows, setRows] = useState<EnrichedClassStudentRow[]>([]);
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
    const [isLoadingClasses, setIsLoadingClasses] = useState<boolean>(false);
    const [isLoadingSheet, setIsLoadingSheet] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [checkingOutStudentId, setCheckingOutStudentId] = useState<
        string | null
    >(null);
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'error' | 'warning';
        message: string;
    } | null>(null);

    const isSheetDisabled = !enableClassAttendance || isHolidayLocked;

    useEffect(() => {
        if (!isSuperAdmin) return;
        attendanceService
            .getAllSchoolsForSimulation()
            .then((list) => {
                setSimSchools(list);
                if (school?.id) setSimSchoolId(school.id);
                else if (list.length > 0) setSimSchoolId(list[0].id);
            })
            .catch(console.error);
    }, [isSuperAdmin, school?.id]);

    // Muat pengaturan presensi siswa dari tabel schools
    useEffect(() => {
        if (!activeSchoolId) return;
        supabase
            .from('schools')
            .select('*')
            .eq('id', activeSchoolId)
            .maybeSingle()
            .then(({ data }) => {
                if (!data) return;
                setEnableClassAttendance(
                    typeof data.enableStudentClassAttendance === 'boolean'
                        ? data.enableStudentClassAttendance
                        : true
                );
                setEnableStudentCheckOut(
                    typeof data.enableStudentCheckOut === 'boolean'
                        ? data.enableStudentCheckOut
                        : true
                );
            });
    }, [activeSchoolId]);

    // Muat Daftar Kelas & Deteksi Kelas Perwalian
    useEffect(() => {
        if (!activeSchoolId || !user?.id) return;

        let isMounted = true;
        (async () => {
            setIsLoadingClasses(true);
            setFeedback(null);
            try {
                const { data: activeYear } = await supabase
                    .from('academic_years')
                    .select('id')
                    .eq('schoolId', activeSchoolId)
                    .eq('isActive', true)
                    .maybeSingle();

                let classQuery = supabase
                    .from('classes')
                    .select('id, name, gradeLevel, major, homeroomTeacherId')
                    .eq('schoolId', activeSchoolId)
                    .order('gradeLevel', { ascending: true })
                    .order('name', { ascending: true });

                if (activeYear?.id) {
                    classQuery = classQuery.eq('academicYearId', activeYear.id);
                }

                const [classRes, teacherProfile] = await Promise.all([
                    classQuery,
                    !isSuperAdmin
                        ? attendanceService.getTeacherProfileByUser({
                            schoolId: activeSchoolId,
                            userId: user.id,
                            email: user.email,
                            fullName: user.fullName,
                        })
                        : Promise.resolve(null),
                ]);

                if (classRes.error) throw classRes.error;
                if (!isMounted) return;

                const classList: ClassOption[] = classRes.data ?? [];
                setClasses(classList);

                const myHomeroom = teacherProfile
                    ? classList.find((c) => c.homeroomTeacherId === teacherProfile.id)
                    : undefined;

                setHomeroomClassId(myHomeroom?.id ?? null);

                if (myHomeroom) {
                    setSelectedClassId(myHomeroom.id);
                } else if (classList.length > 0) {
                    setSelectedClassId(classList[0].id);
                } else {
                    setSelectedClassId('');
                }
            } catch (err: unknown) {
                if (isMounted) {
                    setFeedback({
                        type: 'error',
                        message: getErrorMessage(err, 'Gagal memuat daftar kelas.'),
                    });
                }
            } finally {
                if (isMounted) setIsLoadingClasses(false);
            }
        })();

        return () => {
            isMounted = false;
        };
    }, [activeSchoolId, user?.id, user?.email, user?.fullName, isSuperAdmin]);

    // Muat Lembar Absensi Siswa per Kelas & Tanggal (termasuk jam datang & pulang)
    const loadAttendanceSheet = useCallback(async () => {
        if (!activeSchoolId || !selectedClassId || !selectedDate) {
            setRows([]);
            return;
        }

        setIsLoadingSheet(true);
        setFeedback(null);
        try {
            const sheet = await attendanceService.getClassAttendanceSheet({
                schoolId: activeSchoolId,
                classId: selectedClassId,
                date: selectedDate,
            });

            const studentIds = sheet.map((s) => s.studentId);
            const extraMap = new Map<
                string,
                {
                    id: string;
                    time?: string | null;
                    checkInTime?: string | null;
                    checkOutTime?: string | null;
                }
            >();

            if (studentIds.length > 0) {
                const { data: attExtra } = await supabase
                    .from('attendances')
                    .select('id, studentId, time, checkInTime, checkOutTime')
                    .eq('schoolId', activeSchoolId)
                    .eq('date', selectedDate)
                    .eq('type', 'SISWA')
                    .in('studentId', studentIds);

                for (const item of attExtra ?? []) {
                    if (item.studentId) {
                        extraMap.set(item.studentId, item);
                    }
                }
            }

            const enriched: EnrichedClassStudentRow[] = sheet.map((row) => {
                const extra = extraMap.get(row.studentId);
                return {
                    ...row,
                    attendanceId: extra?.id ?? null,
                    checkInTime: row.checkInTime ?? extra?.checkInTime ?? extra?.time ?? null,
                    checkOutTime: extra?.checkOutTime ?? null,
                };
            });

            setRows(enriched);
            setHasUnsavedChanges(false);
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: getErrorMessage(err, 'Gagal memuat data absensi siswa.'),
            });
        } finally {
            setIsLoadingSheet(false);
        }
    }, [activeSchoolId, selectedClassId, selectedDate]);

    useEffect(() => {
        loadAttendanceSheet();
    }, [loadAttendanceSheet]);

    const handleActivateSpecialEvent = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const reasonText =
                specialEventInput.trim() || DEFAULT_CLASS_SPECIAL_EVENT;
            await activateSpecialEvent(reasonText);
            setSpecialEventInput('');
            setFeedback({
                type: 'success',
                message: `Mode Kegiatan Khusus ("${reasonText}") diaktifkan untuk tanggal ${selectedDate}.`,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: getErrorMessage(
                    err,
                    'Gagal mengaktifkan mode kegiatan khusus.'
                ),
            });
        }
    };

    const handleDeactivateSpecialEvent = async () => {
        try {
            await deactivateSpecialEvent();
            setFeedback({
                type: 'warning',
                message: `Presensi tanggal ${selectedDate} dikunci kembali mengikuti jadwal hari libur.`,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: getErrorMessage(err, 'Gagal mengunci kembali presensi.'),
            });
        }
    };

    const handleStatusChange = (
        studentId: string,
        newStatus: AttendanceStatus
    ) => {
        if (isSheetDisabled) return;
        setRows((prev) =>
            prev.map((row) =>
                row.studentId === studentId ? { ...row, status: newStatus } : row
            )
        );
        setHasUnsavedChanges(true);
        setFeedback(null);
    };

    const handleNotesChange = (studentId: string, newNotes: string) => {
        if (isSheetDisabled) return;
        setRows((prev) =>
            prev.map((row) =>
                row.studentId === studentId ? { ...row, notes: newNotes } : row
            )
        );
        setHasUnsavedChanges(true);
    };

    const handleMarkAllPresent = () => {
        if (isSheetDisabled) return;
        setRows((prev) => prev.map((row) => ({ ...row, status: 'HADIR' })));
        setHasUnsavedChanges(true);
        setFeedback({
            type: 'warning',
            message:
                'Semua siswa ditandai HADIR. Klik "Simpan Presensi" untuk menyimpan ke database.',
        });
    };

    const handleMarkUnrecordedPresent = () => {
        if (isSheetDisabled) return;
        setRows((prev) =>
            prev.map((row) =>
                row.status === null ? { ...row, status: 'HADIR' } : row
            )
        );
        setHasUnsavedChanges(true);
        setFeedback({
            type: 'warning',
            message:
                'Siswa yang belum terdata otomatis ditandai HADIR. Klik "Simpan Presensi" untuk menyimpan.',
        });
    };

    // Simpan Seluruh Presensi Kelas ke Database
    const handleSave = async () => {
        if (!activeSchoolId || !user?.id || !selectedClassId || isSheetDisabled) {
            return;
        }

        const filledRecords = rows
            .filter(
                (r): r is EnrichedClassStudentRow & { status: AttendanceStatus } =>
                    r.status !== null
            )
            .map((r) => ({
                studentId: r.studentId,
                status: r.status,
                notes: r.notes,
            }));

        if (filledRecords.length === 0) {
            setFeedback({
                type: 'warning',
                message: 'Belum ada status kehadiran siswa yang dipilih untuk disimpan.',
            });
            return;
        }

        setIsSaving(true);
        setFeedback(null);
        try {
            const res = await attendanceService.bulkStudentAttendance({
                schoolId: activeSchoolId,
                date: selectedDate,
                records: filledRecords,
                recordedBy: user.id,
            });

            // Pastikan kolom checkInTime ikut terisi untuk siswa HADIR/TERLAMBAT yang belum memiliki checkInTime
            const nowIso = new Date().toISOString();
            const eligibleIds = filledRecords
                .filter((r) => r.status === 'HADIR' || r.status === 'TERLAMBAT')
                .map((r) => r.studentId);

            if (eligibleIds.length > 0) {
                await supabase
                    .from('attendances')
                    .update({ checkInTime: nowIso })
                    .eq('schoolId', activeSchoolId)
                    .eq('date', selectedDate)
                    .eq('type', 'SISWA')
                    .in('studentId', eligibleIds)
                    .is('checkInTime', null);
            }

            if (res.success) {
                await loadAttendanceSheet();
                const unrecordedLeft = rows.length - filledRecords.length;
                setFeedback({
                    type: 'success',
                    message:
                        unrecordedLeft > 0
                            ? `Berhasil menyimpan presensi ${res.count} siswa (${unrecordedLeft} siswa masih belum diisi).`
                            : `Berhasil menyimpan presensi lengkap untuk ${res.count} siswa!`,
                });
            }
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: getErrorMessage(
                    err,
                    'Terjadi kesalahan saat menyimpan presensi kelas.'
                ),
            });
        } finally {
            setIsSaving(false);
        }
    };

    // Catat Jam Pulang (Check-Out) 1 Siswa oleh Guru / Wali Kelas
    const handleSingleStudentCheckOut = async (row: EnrichedClassStudentRow) => {
        if (!activeSchoolId || checkingOutStudentId || isSheetDisabled) return;
        setCheckingOutStudentId(row.studentId);
        setFeedback(null);
        try {
            const nowIso = new Date().toISOString();
            const { error } = await supabase
                .from('attendances')
                .update({ checkOutTime: nowIso })
                .eq('schoolId', activeSchoolId)
                .eq('studentId', row.studentId)
                .eq('date', selectedDate)
                .eq('type', 'SISWA');

            if (error) throw error;

            setRows((prev) =>
                prev.map((item) =>
                    item.studentId === row.studentId
                        ? { ...item, checkOutTime: nowIso }
                        : item
                )
            );
            setFeedback({
                type: 'success',
                message: `Jam pulang ${row.fullName} berhasil dicatat.`,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: getErrorMessage(err, 'Gagal mencatat jam pulang siswa.'),
            });
        } finally {
            setCheckingOutStudentId(null);
        }
    };

    // Catat Jam Pulang Massal untuk Siswa yang Sudah Hadir/Terlambat tapi Belum Pulang
    const handleBulkClassCheckOut = async () => {
        if (!activeSchoolId || isSheetDisabled) return;
        const targetIds = rows
            .filter(
                (r) =>
                    (r.status === 'HADIR' || r.status === 'TERLAMBAT') &&
                    r.attendanceId &&
                    !r.checkOutTime
            )
            .map((r) => r.studentId);

        if (targetIds.length === 0) {
            setFeedback({
                type: 'warning',
                message:
                    'Tidak ada siswa hadir yang menunggu pencatatan pulang (pastikan status kehadiran sudah disimpan terlebih dahulu).',
            });
            return;
        }

        setIsSaving(true);
        try {
            const nowIso = new Date().toISOString();
            const { error } = await supabase
                .from('attendances')
                .update({ checkOutTime: nowIso })
                .eq('schoolId', activeSchoolId)
                .eq('date', selectedDate)
                .eq('type', 'SISWA')
                .in('studentId', targetIds)
                .is('checkOutTime', null);

            if (error) throw error;
            await loadAttendanceSheet();
            setFeedback({
                type: 'success',
                message: `Jam pulang berhasil dicatat untuk ${targetIds.length} siswa.`,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: getErrorMessage(err, 'Gagal mencatat jam pulang massal.'),
            });
        } finally {
            setIsSaving(false);
        }
    };

    const stats = useMemo(() => {
        return {
            total: rows.length,
            hadir: rows.filter((r) => r.status === 'HADIR').length,
            terlambat: rows.filter((r) => r.status === 'TERLAMBAT').length,
            izin: rows.filter((r) => r.status === 'IZIN').length,
            sakit: rows.filter((r) => r.status === 'SAKIT').length,
            alpa: rows.filter((r) => r.status === 'ALPA').length,
            unrecorded: rows.filter((r) => r.status === null).length,
            checkedOut: rows.filter((r) => Boolean(r.checkOutTime)).length,
        };
    }, [rows]);

    const filteredRows = useMemo(() => {
        return rows.filter((row) => {
            const matchesSearch =
                !searchQuery.trim() ||
                row.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                row.nisn.includes(searchQuery.trim()) ||
                (row.nis && row.nis.includes(searchQuery.trim()));

            const matchesStatus =
                statusFilter === 'ALL' ||
                (statusFilter === 'UNRECORDED' && row.status === null) ||
                row.status === statusFilter;

            return matchesSearch && matchesStatus;
        });
    }, [rows, searchQuery, statusFilter]);

    const formatTime = (iso?: string | null) => {
        if (!iso) return '';
        return new Date(iso).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const selectedClassObj = classes.find((c) => c.id === selectedClassId);

    return (
        <div className="page-container">
            {/* Header Halaman */}
            <div className="page-header">
                <div>
                    <h1 className="page-title">Absensi Kelas Siswa</h1>
                    <p className="page-subtitle">
                        Pencatatan kehadiran &amp; kepulangan harian siswa per rombel oleh
                        Wali Kelas / Guru
                    </p>
                </div>

                <div className="page-header-actions">
                    {isSuperAdmin && simSchools.length > 0 && (
                        <select
                            className="form-input"
                            value={simSchoolId}
                            onChange={(e) => setSimSchoolId(e.target.value)}
                        >
                            {simSchools.map((s) => (
                                <option key={s.id} value={s.id}>
                                    Sekolah: {s.name}
                                </option>
                            ))}
                        </select>
                    )}

                    <button
                        type="button"
                        className="btn-secondary"
                        onClick={loadAttendanceSheet}
                        disabled={isLoadingSheet || !selectedClassId}
                    >
                        <RefreshCw size={16} className={isLoadingSheet ? 'spin' : ''} />
                        Muat Ulang
                    </button>

                    <button
                        type="button"
                        className="btn-primary"
                        onClick={handleSave}
                        disabled={
                            isSaving ||
                            isLoadingSheet ||
                            rows.length === 0 ||
                            isSheetDisabled
                        }
                    >
                        <Save size={16} />
                        {isSaving ? 'Menyimpan...' : 'Simpan Presensi'}
                    </button>
                </div>
            </div>

            {/* Banner Terkunci karena Hari Libur */}
            {isHolidayLocked && (
                <div className="mb-5 p-4 rounded-2xl border border-red-500/40 bg-red-500/10 space-y-3">
                    <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-xl bg-red-500/20 text-red-500 shrink-0">
                            <CalendarOff size={20} />
                        </div>
                        <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-red-500/20 text-red-600 dark:text-red-300">
                                    <Lock size={11} /> Absensi Kelas Terkunci
                                </span>
                                <span className="text-xs font-bold text-red-600 dark:text-red-300">
                                    {holidayName} ({selectedDate})
                                </span>
                            </div>
                            <p className="text-xs opacity-85 leading-relaxed">
                                Pengisian presensi kelas dikunci otomatis karena tanggal ini
                                merupakan hari libur / akhir pekan.
                            </p>
                        </div>
                    </div>

                    {canManageOverride && (
                        <form
                            onSubmit={handleActivateSpecialEvent}
                            className="pt-3 border-t border-red-500/25 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5"
                        >
                            <input
                                type="text"
                                value={specialEventInput}
                                onChange={(e) => setSpecialEventInput(e.target.value)}
                                placeholder="Keterangan kegiatan khusus (mis. Pramuka, Class Meeting, Lomba)..."
                                className="form-input flex-1 text-xs"
                            />
                            <button
                                type="submit"
                                disabled={isTogglingHoliday}
                                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition cursor-pointer disabled:opacity-50 shrink-0"
                            >
                                <Unlock size={14} />
                                {isTogglingHoliday
                                    ? 'Membuka Kunci...'
                                    : 'Aktifkan Mode Kegiatan Khusus'}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {/* Banner Mode Kegiatan Khusus Sedang Aktif */}
            {isHoliday && isSpecialEventActive && (
                <div className="mb-5 p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/12 text-xs text-emerald-700 dark:text-emerald-200 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                        <Sparkles size={18} className="text-emerald-500 shrink-0" />
                        <span>
                            <strong>Mode Kegiatan Khusus Aktif:</strong> {specialEventReason}{' '}
                            <span className="opacity-75">
                                (mengecualikan libur {holidayName})
                            </span>
                        </span>
                    </div>
                    {canManageOverride && (
                        <button
                            type="button"
                            disabled={isTogglingHoliday}
                            onClick={handleDeactivateSpecialEvent}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white transition cursor-pointer disabled:opacity-50"
                        >
                            <Lock size={13} />
                            {isTogglingHoliday ? 'Mengunci...' : 'Kunci Kembali'}
                        </button>
                    )}
                </div>
            )}

            {!enableClassAttendance && (
                <div className="mb-5 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2.5">
                    <AlertTriangle size={18} className="shrink-0" />
                    <span>
                        Fitur pengisian <strong>Absensi Kelas Siswa</strong> sedang
                        dinonaktifkan oleh Admin Sekolah. Data kehadiran siswa hanya
                        dicatat melalui Kiosk.
                    </span>
                </div>
            )}

            {/* Panel Pemilihan Kelas & Tanggal */}
            <div className="data-card mb-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider opacity-75 mb-1.5">
                            <School size={13} className="inline mr-1" />
                            Pilih Kelas / Rombel
                        </label>
                        <select
                            className="form-input w-full"
                            value={selectedClassId}
                            onChange={(e) => setSelectedClassId(e.target.value)}
                            disabled={isLoadingClasses || classes.length === 0}
                        >
                            {classes.length === 0 ? (
                                <option value="">
                                    {isLoadingClasses
                                        ? 'Memuat daftar kelas...'
                                        : 'Belum ada data kelas aktif'}
                                </option>
                            ) : (
                                classes.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                        {cls.name} {cls.major ? `(${cls.major})` : ''}
                                        {cls.id === homeroomClassId ? ' — ★ Kelas Wali Anda' : ''}
                                    </option>
                                ))
                            )}
                        </select>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider opacity-75 mb-1.5">
                            <Calendar size={13} className="inline mr-1" />
                            Tanggal Presensi
                        </label>
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="form-input w-full"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="btn-secondary flex-1 text-xs"
                            onClick={handleMarkUnrecordedPresent}
                            disabled={
                                rows.length === 0 ||
                                stats.unrecorded === 0 ||
                                isSheetDisabled
                            }
                        >
                            <Sparkles size={14} />
                            Isi Kosong → Hadir ({stats.unrecorded})
                        </button>

                        <button
                            type="button"
                            className="btn-secondary flex-1 text-xs"
                            onClick={handleMarkAllPresent}
                            disabled={rows.length === 0 || isSheetDisabled}
                        >
                            <CheckSquare size={14} />
                            Semua Hadir
                        </button>

                        {enableStudentCheckOut && (
                            <button
                                type="button"
                                className="btn-secondary flex-1 text-xs"
                                onClick={handleBulkClassCheckOut}
                                disabled={rows.length === 0 || isSaving || isSheetDisabled}
                                title="Catat jam pulang untuk semua siswa hadir yang belum pulang"
                            >
                                <LogOut size={14} />
                                Semua Pulang
                            </button>
                        )}
                    </div>
                </div>

                {selectedClassObj && selectedClassObj.id === homeroomClassId && (
                    <div className="mt-3 pt-3 border-t border-white/10 flex items-center gap-2 text-xs text-emerald-400">
                        <UserCheck size={15} />
                        <span>
                            Anda tercatat sebagai{' '}
                            <strong>Wali Kelas {selectedClassObj.name}</strong>.
                        </span>
                    </div>
                )}
            </div>

            {/* Notifikasi / Feedback */}
            {feedback && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-5 p-3.5 rounded-xl border flex items-center justify-between gap-3 text-sm"
                    style={{
                        background:
                            feedback.type === 'success'
                                ? 'rgba(16, 185, 129, 0.12)'
                                : feedback.type === 'warning'
                                    ? 'rgba(245, 158, 11, 0.12)'
                                    : 'rgba(239, 68, 68, 0.12)',
                        borderColor:
                            feedback.type === 'success'
                                ? 'rgba(16, 185, 129, 0.35)'
                                : feedback.type === 'warning'
                                    ? 'rgba(245, 158, 11, 0.35)'
                                    : 'rgba(239, 68, 68, 0.35)',
                        color:
                            feedback.type === 'success'
                                ? '#34D399'
                                : feedback.type === 'warning'
                                    ? '#FBBF24'
                                    : '#F87171',
                    }}
                >
                    <div className="flex items-center gap-2">
                        {feedback.type === 'success' ? (
                            <CheckCircle size={18} />
                        ) : (
                            <AlertCircle size={18} />
                        )}
                        <span>{feedback.message}</span>
                    </div>
                    {hasUnsavedChanges && !isSheetDisabled && (
                        <button
                            type="button"
                            className="btn-primary text-xs py-1 px-3"
                            onClick={handleSave}
                            disabled={isSaving}
                        >
                            Simpan Sekarang
                        </button>
                    )}
                </motion.div>
            )}

            {/* Kartu Ringkasan Statistik Kelas */}
            {selectedClassId && rows.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs opacity-70">Total Siswa</p>
                            <p className="text-xl font-bold">{stats.total}</p>
                        </div>
                    </div>
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs text-emerald-400">Hadir</p>
                            <p className="text-xl font-bold text-emerald-400">{stats.hadir}</p>
                        </div>
                    </div>
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs text-amber-400">Terlambat</p>
                            <p className="text-xl font-bold text-amber-400">
                                {stats.terlambat}
                            </p>
                        </div>
                    </div>
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs text-blue-400">Izin</p>
                            <p className="text-xl font-bold text-blue-400">{stats.izin}</p>
                        </div>
                    </div>
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs text-purple-400">Sakit</p>
                            <p className="text-xl font-bold text-purple-400">{stats.sakit}</p>
                        </div>
                    </div>
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs text-red-400">Alpa</p>
                            <p className="text-xl font-bold text-red-400">{stats.alpa}</p>
                        </div>
                    </div>
                    <div className="summary-card p-3">
                        <div>
                            <p className="text-xs opacity-70">Belum Diisi</p>
                            <p className="text-xl font-bold">{stats.unrecorded}</p>
                        </div>
                    </div>
                    {enableStudentCheckOut && (
                        <div className="summary-card p-3">
                            <div>
                                <p className="text-xs text-cyan-400">Sudah Pulang</p>
                                <p className="text-xl font-bold text-cyan-400">
                                    {stats.checkedOut}
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Toolbar Pencarian & Filter Status */}
            <div className="table-toolbar flex flex-wrap items-center justify-between gap-3 mb-4">
                <div className="relative flex-1 min-w-60">
                    <Search
                        size={16}
                        className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"
                    />
                    <input
                        type="text"
                        placeholder="Cari nama siswa, NISN, atau NIS..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="form-input w-full pl-9"
                    />
                </div>

                <div className="flex flex-wrap gap-1.5">
                    {[
                        { key: 'ALL', label: `Semua (${rows.length})` },
                        { key: 'UNRECORDED', label: `Belum Diisi (${stats.unrecorded})` },
                        { key: 'HADIR', label: `Hadir (${stats.hadir})` },
                        { key: 'TERLAMBAT', label: `Terlambat (${stats.terlambat})` },
                        { key: 'IZIN', label: `Izin (${stats.izin})` },
                        { key: 'SAKIT', label: `Sakit (${stats.sakit})` },
                        { key: 'ALPA', label: `Alpa (${stats.alpa})` },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setStatusFilter(tab.key)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === tab.key
                                ? 'bg-primary text-white'
                                : 'bg-white/5 opacity-75 hover:opacity-100'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tabel Daftar Siswa */}
            <div className="data-card">
                {isLoadingSheet || isLoadingClasses ? (
                    <div className="table-loading">
                        <RefreshCw size={24} className="spin" /> Memuat daftar siswa...
                    </div>
                ) : !selectedClassId ? (
                    <div className="table-empty">
                        <Users size={40} className="opacity-30" />
                        <p>Silakan pilih kelas terlebih dahulu untuk memulai absensi</p>
                    </div>
                ) : filteredRows.length === 0 ? (
                    <div className="table-empty">
                        <AlertCircle size={40} className="opacity-30" />
                        <p>Tidak ada data siswa aktif yang sesuai dengan filter</p>
                    </div>
                ) : (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '48px' }}>No</th>
                                    <th>Nama Siswa</th>
                                    <th>NISN / NIS</th>
                                    <th>Status Kehadiran</th>
                                    {enableStudentCheckOut && <th>Jam Pulang</th>}
                                    <th>Keterangan / Catatan</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map((row, idx) => {
                                    const canRecordCheckOut =
                                        enableStudentCheckOut &&
                                        !isSheetDisabled &&
                                        (row.status === 'HADIR' || row.status === 'TERLAMBAT') &&
                                        Boolean(row.attendanceId) &&
                                        !row.checkOutTime;

                                    return (
                                        <tr key={row.studentId}>
                                            <td className="td-mono text-xs opacity-70">{idx + 1}</td>
                                            <td>
                                                <div className="flex items-center gap-2.5">
                                                    {row.photoUrl ? (
                                                        <img
                                                            src={row.photoUrl}
                                                            alt={row.fullName}
                                                            className="w-8 h-8 rounded-full object-cover"
                                                        />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">
                                                            {row.fullName.charAt(0).toUpperCase()}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <div className="td-name">{row.fullName}</div>
                                                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                            {row.checkInTime && (
                                                                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-500">
                                                                    <Clock size={11} />
                                                                    {row.isFromKiosk ? 'Kiosk' : 'Datang'}:{' '}
                                                                    {formatTime(row.checkInTime)}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="td-mono text-xs">
                                                <div>{row.nisn}</div>
                                                {row.nis && (
                                                    <div className="opacity-60">NIS: {row.nis}</div>
                                                )}
                                            </td>
                                            <td>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {STATUS_OPTIONS.map((opt) => {
                                                        const isSelected = row.status === opt.value;
                                                        return (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                disabled={isSheetDisabled}
                                                                onClick={() =>
                                                                    handleStatusChange(row.studentId, opt.value)
                                                                }
                                                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition border disabled:opacity-50"
                                                                style={{
                                                                    backgroundColor: isSelected
                                                                        ? opt.color
                                                                        : 'transparent',
                                                                    borderColor: isSelected
                                                                        ? opt.color
                                                                        : 'rgba(255,255,255,0.12)',
                                                                    color: isSelected ? '#FFFFFF' : 'inherit',
                                                                    opacity: isSelected ? 1 : 0.72,
                                                                }}
                                                            >
                                                                <span className="hidden sm:inline">
                                                                    {opt.label}
                                                                </span>
                                                                <span className="sm:hidden">
                                                                    {opt.shortLabel}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>

                                            {enableStudentCheckOut && (
                                                <td>
                                                    {row.checkOutTime ? (
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-cyan-500/15 text-cyan-600 dark:text-cyan-300">
                                                            <LogOut size={12} />
                                                            {formatTime(row.checkOutTime)}
                                                        </span>
                                                    ) : canRecordCheckOut ? (
                                                        <button
                                                            type="button"
                                                            disabled={checkingOutStudentId === row.studentId}
                                                            onClick={() => handleSingleStudentCheckOut(row)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border border-cyan-500/40 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 hover:bg-cyan-500/20 transition cursor-pointer"
                                                        >
                                                            <LogOut size={12} />
                                                            {checkingOutStudentId === row.studentId
                                                                ? 'Menyimpan...'
                                                                : 'Catat Pulang'}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs opacity-40">-</span>
                                                    )}
                                                </td>
                                            )}

                                            <td>
                                                <input
                                                    type="text"
                                                    disabled={isSheetDisabled}
                                                    value={row.notes}
                                                    onChange={(e) =>
                                                        handleNotesChange(row.studentId, e.target.value)
                                                    }
                                                    placeholder="Contoh: Surat dokter, izin acara keluarga..."
                                                    className="form-input text-xs py-1.5 px-2.5 w-full min-w-45"
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {rows.length > 0 && !isSheetDisabled && (
                    <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs opacity-70">
                            {hasUnsavedChanges
                                ? '⚠️ Terdapat perubahan yang belum disimpan.'
                                : 'Semua perubahan tersinkronisasi dengan server.'}
                        </p>
                        <button
                            type="button"
                            className="btn-primary"
                            onClick={handleSave}
                            disabled={isSaving || isLoadingSheet}
                        >
                            <Save size={16} />
                            {isSaving ? 'Menyimpan...' : 'Simpan Presensi Kelas'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}