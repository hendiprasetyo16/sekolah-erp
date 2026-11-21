// src/modules/attendance/pages/StudentClassAttendancePage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Users,
    CheckCircle2,
    Clock,
    FileText,
    AlertCircle,
    XCircle,
    Search,
    Save,
    Loader2,
    Calendar,
    LogOut,
    CheckCheck,
    Info,
    Lock,
    Unlock,
    CalendarOff,
    Sparkles,
    FlaskConical,
    X,
    ChevronLeft,
    ChevronRight,
    Trash2,
    AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString } from '../services/gps.utils';
import { useStudentHolidayLock } from '../hooks/useStudentHolidayLock';

// ============================================================================
// PARAMETER KONFIGURASI PAGINATION & STATUS PRESENSI SISWA
// ============================================================================
const DEFAULT_STUDENT_PAGE_SIZE = 10;
const STUDENT_PAGE_SIZE_OPTIONS = [10, 20, 50, 0] as const; // 0 = Semua

type StudentAttendanceStatus =
    | 'HADIR'
    | 'TERLAMBAT'
    | 'IZIN'
    | 'SAKIT'
    | 'ALPA';

interface StudentRowItem {
    studentId: string;
    fullName: string;
    nisn: string | null;
    nis: string | null;
    classId: string;
    className: string;
    gender: string | null;
    status: StudentAttendanceStatus | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    notes: string;
    existingRecordId: string | null;
    isDirty: boolean;
}

interface RawStudentDbRow {
    id: string;
    fullName: string | null;
    nisn: string | null;
    nis: string | null;
    classId: string | null;
    gender: string | null;
    classes?: { name: string } | Array<{ name: string }> | null;
}

interface RawStudentAttendanceDbRow {
    id: string;
    studentId: string | null;
    status: string | null;
    checkInTime: string | null;
    checkOutTime: string | null;
    time?: string | null;
    notes?: string | null;
}

interface MessageBanner {
    status: 'success' | 'error';
    text: string;
}

const STATUS_OPTIONS: {
    value: StudentAttendanceStatus;
    label: string;
    short: string;
    activeClass: string;
    badgeClass: string;
    icon: typeof CheckCircle2;
}[] = [
        {
            value: 'HADIR',
            label: 'Hadir',
            short: 'H',
            activeClass:
                'bg-emerald-600 text-white border-emerald-600 shadow-2xs ring-1 ring-emerald-600/30',
            badgeClass:
                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
            icon: CheckCircle2,
        },
        {
            value: 'TERLAMBAT',
            label: 'Terlambat',
            short: 'T',
            activeClass:
                'bg-amber-500 text-white border-amber-500 shadow-2xs ring-1 ring-amber-500/30',
            badgeClass:
                'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
            icon: Clock,
        },
        {
            value: 'IZIN',
            label: 'Izin',
            short: 'I',
            activeClass:
                'bg-blue-600 text-white border-blue-600 shadow-2xs ring-1 ring-blue-600/30',
            badgeClass:
                'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
            icon: FileText,
        },
        {
            value: 'SAKIT',
            label: 'Sakit',
            short: 'S',
            activeClass:
                'bg-purple-600 text-white border-purple-600 shadow-2xs ring-1 ring-purple-600/30',
            badgeClass:
                'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
            icon: AlertCircle,
        },
        {
            value: 'ALPA',
            label: 'Alpa',
            short: 'A',
            activeClass:
                'bg-red-600 text-white border-red-600 shadow-2xs ring-1 ring-red-600/30',
            badgeClass:
                'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
            icon: XCircle,
        },
    ];

function buildIsoTimestampForDate(dateStr: string): string {
    const now = new Date();
    const [yStr, mStr, dStr] = dateStr.split('-');
    const y = Number(yStr) || now.getFullYear();
    const m = (Number(mStr) || now.getMonth() + 1) - 1;
    const d = Number(dStr) || now.getDate();

    const combined = new Date(
        y,
        m,
        d,
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
    );
    return combined.toISOString();
}

function formatTimeDisplay(value?: string | null): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        return trimmed.slice(0, 5);
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getErrorInfo(err: unknown): { code: string; message: string } {
    if (typeof err === 'object' && err !== null) {
        const rec = err as Record<string, unknown>;
        return {
            code: typeof rec.code === 'string' ? rec.code : '',
            message:
                typeof rec.message === 'string' && rec.message.trim().length > 0
                    ? rec.message
                    : 'Terjadi kesalahan saat memproses data.',
        };
    }
    if (err instanceof Error) {
        return { code: '', message: err.message };
    }
    return { code: '', message: 'Terjadi kesalahan tidak terduga.' };
}

function isMissingColumnError(err: unknown): boolean {
    const { code, message } = getErrorInfo(err);
    const lower = message.toLowerCase();
    return (
        code === 'PGRST204' ||
        code === '42703' ||
        lower.includes('schema cache') ||
        (lower.includes('column') && lower.includes('does not exist'))
    );
}

export function StudentClassAttendancePage() {
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';
    // Peran pimpinan & admin selalu mendapat akses penuh ke semua kelas
    const isPrivilegedRole =
        user?.role === 'SUPER_ADMIN' ||
        user?.role === 'ADMIN' ||
        user?.role === 'KEPALA_SEKOLAH';

    // Peran yang diizinkan menghapus catatan presensi siswa
    const canDeleteAttendance =
        user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN';

    const [simSchools, setSimSchools] = useState<
        Array<{ id: string; name: string; npsn: string }>
    >([]);
    const [simSchoolId, setSimSchoolId] = useState<string>('');
    const activeSchoolId = isSuperAdmin
        ? simSchoolId || school?.id || user?.schoolId || ''
        : school?.id || user?.schoolId || '';

    const teacherScope = useTeacherScope(activeSchoolId);

    // Pembatasan kelas hanya berlaku untuk Wali Kelas SD non-admin
    const isHomeroomRestricted =
        !isPrivilegedRole && Boolean(teacherScope.isElementaryHomeroomRestricted);
    const homeroomClassKey = useMemo(
        () => teacherScope.homeroomClassIds.map((id) => String(id)).join(','),
        [teacherScope.homeroomClassIds]
    );

    const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString);
    const [classesList, setClassesList] = useState<
        Array<{ id: string; name: string }>
    >([]);
    const [selectedClassId, setSelectedClassId] = useState<string>('');
    const [searchQuery, setSearchQuery] = useState<string>('');

    // State Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_STUDENT_PAGE_SIZE);

    const [rows, setRows] = useState<StudentRowItem[]>([]);
    const [isLoadingClasses, setIsLoadingClasses] = useState<boolean>(false);
    const [isLoadingRows, setIsLoadingRows] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

    // State Modal Konfirmasi Hapus Presensi Siswa
    const [deleteTarget, setDeleteTarget] = useState<StudentRowItem | null>(null);
    const [isDeletingRecord, setIsDeletingRecord] = useState<boolean>(false);

    const [message, setMessage] = useState<MessageBanner | null>(null);

    const [enableClassAttendance, setEnableClassAttendance] =
        useState<boolean>(true);
    const [enableStudentCheckOut, setEnableStudentCheckOut] =
        useState<boolean>(true);

    const holidayLock = useStudentHolidayLock({
        schoolId: activeSchoolId,
        targetDate: selectedDate,
    });

    const [showSpecialEventModal, setShowSpecialEventModal] =
        useState<boolean>(false);
    const [specialEventInput, setSpecialEventInput] = useState<string>('');

    const lockBannerMessage = useMemo(() => {
        if (holidayLock.isHoliday) {
            return `Presensi dikunci otomatis karena hari libur (${holidayLock.holidayName ?? 'Libur Kalender'
                }).`;
        }
        if (holidayLock.isSpecialEventActive) {
            return `Mode kegiatan khusus aktif: ${holidayLock.specialEventReason ?? 'Kegiatan Sekolah'
                }.`;
        }
        return 'Presensi pada tanggal ini sedang dikunci.';
    }, [
        holidayLock.isHoliday,
        holidayLock.holidayName,
        holidayLock.isSpecialEventActive,
        holidayLock.specialEventReason,
    ]);

    // Tutup modal hapus dengan tombol Escape pada keyboard
    useEffect(() => {
        if (!deleteTarget) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isDeletingRecord) {
                setDeleteTarget(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [deleteTarget, isDeletingRecord]);

    // Sinkronkan sekolah aktif secara instan saat Super Admin menekan "Ganti Sekolah"
    useEffect(() => {
        if (isSuperAdmin && school?.id) {
            setSimSchoolId(school.id);
        }
    }, [isSuperAdmin, school?.id]);

    useEffect(() => {
        if (!isSuperAdmin) return;
        attendanceService
            .getAllSchoolsForSimulation()
            .then((list) => {
                setSimSchools(list);
                if (school?.id) setSimSchoolId(school.id);
                else if (list.length > 0) setSimSchoolId((prev) => prev || list[0].id);
            })
            .catch(console.error);
    }, [isSuperAdmin, school?.id]);

    const loadClassesAndConfig = useCallback(async () => {
        if (!activeSchoolId) return;
        // Untuk guru non-admin, tunggu scope guru selesai dimuat agar daftar kelas akurat
        if (!isPrivilegedRole && teacherScope.isLoading) return;

        setIsLoadingClasses(true);
        try {
            const [classesRes, schoolRes] = await Promise.all([
                supabase
                    .from('classes')
                    .select('id, name')
                    .eq('schoolId', activeSchoolId)
                    .order('gradeLevel', { ascending: true })
                    .order('name', { ascending: true }),
                supabase
                    .from('schools')
                    .select('*')
                    .eq('id', activeSchoolId)
                    .maybeSingle(),
            ]);

            if (classesRes.error) throw classesRes.error;

            let loadedClasses = (classesRes.data ?? []) as Array<{
                id: string;
                name: string;
            }>;

            // Hanya saring kelas jika user adalah Wali Kelas jenjang SD (bukan Admin/Super Admin)
            if (isHomeroomRestricted) {
                const allowedSet = new Set(
                    homeroomClassKey ? homeroomClassKey.split(',') : []
                );
                loadedClasses = loadedClasses.filter((cls) =>
                    allowedSet.has(String(cls.id))
                );
            }

            setClassesList(loadedClasses);

            if (loadedClasses.length > 0) {
                setSelectedClassId((prev) => {
                    if (!isHomeroomRestricted && prev === 'ALL') return 'ALL';
                    return loadedClasses.some((c) => c.id === prev)
                        ? prev
                        : loadedClasses[0].id;
                });
            } else {
                setSelectedClassId('');
            }

            if (!schoolRes.error && schoolRes.data) {
                const sRow = schoolRes.data as Record<string, unknown>;
                if (typeof sRow.enableStudentClassAttendance === 'boolean') {
                    setEnableClassAttendance(sRow.enableStudentClassAttendance);
                }
                if (typeof sRow.enableStudentCheckOut === 'boolean') {
                    setEnableStudentCheckOut(sRow.enableStudentCheckOut);
                }
            }
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal memuat daftar kelas: ${errMsg}`,
            });
        } finally {
            setIsLoadingClasses(false);
        }
    }, [
        activeSchoolId,
        isPrivilegedRole,
        teacherScope.isLoading,
        isHomeroomRestricted,
        homeroomClassKey,
    ]);

    useEffect(() => {
        void loadClassesAndConfig();
    }, [loadClassesAndConfig]);

    const selectedClassName = useMemo(() => {
        if (selectedClassId === 'ALL') return 'Semua Kelas';
        return (
            classesList.find((c) => c.id === selectedClassId)?.name ?? 'Terpilih'
        );
    }, [classesList, selectedClassId]);

    const loadClassStudentsAndAttendance = useCallback(async () => {
        if (!activeSchoolId || !selectedClassId || !selectedDate) {
            setRows([]);
            return;
        }

        setIsLoadingRows(true);
        setMessage(null);
        setCurrentPage(1);

        try {
            let studentsQuery = supabase
                .from('students')
                .select('id, fullName, nisn, nis, classId, gender, classes(name)')
                .eq('schoolId', activeSchoolId)
                .order('fullName', { ascending: true });

            if (selectedClassId !== 'ALL') {
                studentsQuery = studentsQuery.eq('classId', selectedClassId);
            } else if (isHomeroomRestricted && homeroomClassKey) {
                studentsQuery = studentsQuery.in(
                    'classId',
                    homeroomClassKey.split(',')
                );
            }

            const { data: studentsData, error: studentsErr } = await studentsQuery;

            if (studentsErr) throw studentsErr;

            const typedStudents = (studentsData ?? []) as RawStudentDbRow[];
            const studentIds = typedStudents.map((s) => String(s.id));

            const attendanceMap = new Map<string, RawStudentAttendanceDbRow>();

            if (studentIds.length > 0) {
                const { data: attData, error: attErr } = await supabase
                    .from('attendances')
                    .select(
                        'id, studentId, status, checkInTime, checkOutTime, time, notes'
                    )
                    .eq('schoolId', activeSchoolId)
                    .eq('date', selectedDate)
                    .eq('type', 'SISWA')
                    .in('studentId', studentIds);

                if (attErr) throw attErr;

                const typedAtts = (attData ?? []) as RawStudentAttendanceDbRow[];
                for (const att of typedAtts) {
                    if (att.studentId) {
                        attendanceMap.set(String(att.studentId), att);
                    }
                }
            }

            const combinedRows: StudentRowItem[] = typedStudents.map((st) => {
                const sid = String(st.id);
                const existing = attendanceMap.get(sid);
                const rawStatus = existing?.status
                    ? existing.status.toUpperCase()
                    : null;
                const normalizedRaw = rawStatus === 'ALPHA' ? 'ALPA' : rawStatus;

                const validStatus: StudentAttendanceStatus | null =
                    normalizedRaw === 'HADIR' ||
                        normalizedRaw === 'TERLAMBAT' ||
                        normalizedRaw === 'IZIN' ||
                        normalizedRaw === 'SAKIT' ||
                        normalizedRaw === 'ALPA'
                        ? normalizedRaw
                        : null;

                const resolvedClassName = Array.isArray(st.classes)
                    ? st.classes[0]?.name
                    : st.classes?.name;

                return {
                    studentId: sid,
                    fullName: st.fullName ?? 'Tanpa Nama',
                    nisn: st.nisn ?? null,
                    nis: st.nis ?? null,
                    classId: st.classId ?? selectedClassId,
                    className: resolvedClassName ?? selectedClassName,
                    gender: st.gender ?? null,
                    status: validStatus,
                    checkInTime: existing?.checkInTime ?? existing?.time ?? null,
                    checkOutTime: existing?.checkOutTime ?? null,
                    notes: existing?.notes ?? '',
                    existingRecordId: existing?.id ? String(existing.id) : null,
                    isDirty: false,
                };
            });

            setRows(combinedRows);
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal memuat data siswa kelas ${selectedClassName}: ${errMsg}`,
            });
        } finally {
            setIsLoadingRows(false);
        }
    }, [
        activeSchoolId,
        selectedClassId,
        selectedClassName,
        selectedDate,
        isHomeroomRestricted,
        homeroomClassKey,
    ]);

    useEffect(() => {
        void loadClassStudentsAndAttendance();
    }, [loadClassStudentsAndAttendance]);

    const handleSetStudentStatus = (
        studentId: string,
        newStatus: StudentAttendanceStatus
    ) => {
        if (holidayLock.isLocked) {
            setMessage({
                status: 'error',
                text: lockBannerMessage,
            });
            return;
        }

        const nowIso = buildIsoTimestampForDate(selectedDate);
        setRows((prev) =>
            prev.map((row) => {
                if (row.studentId !== studentId) return row;
                const isPresent = newStatus === 'HADIR' || newStatus === 'TERLAMBAT';
                return {
                    ...row,
                    status: newStatus,
                    checkInTime: isPresent ? row.checkInTime || nowIso : null,
                    isDirty: true,
                };
            })
        );
    };

    const handleSetStudentNote = (studentId: string, notes: string) => {
        if (holidayLock.isLocked) return;
        setRows((prev) =>
            prev.map((row) =>
                row.studentId === studentId ? { ...row, notes, isDirty: true } : row
            )
        );
    };

    const handleMarkAllHadir = () => {
        if (holidayLock.isLocked) {
            setMessage({
                status: 'error',
                text: lockBannerMessage,
            });
            return;
        }

        const nowIso = buildIsoTimestampForDate(selectedDate);
        setRows((prev) =>
            prev.map((row) => {
                if (row.status !== null) return row;
                return {
                    ...row,
                    status: 'HADIR',
                    checkInTime: row.checkInTime ?? nowIso,
                    isDirty: true,
                };
            })
        );
    };

    const handleSaveAll = async () => {
        if (!activeSchoolId) return;

        if (holidayLock.isLocked) {
            setMessage({
                status: 'error',
                text: lockBannerMessage,
            });
            return;
        }

        const rowsToSave = rows.filter((r) => r.isDirty && r.status !== null);
        if (rowsToSave.length === 0) {
            setMessage({
                status: 'error',
                text: 'Tidak ada perubahan presensi baru untuk disimpan. Pilih status siswa terlebih dahulu.',
            });
            return;
        }

        setIsSaving(true);
        setMessage(null);

        try {
            const nowIso = buildIsoTimestampForDate(selectedDate);

            for (const item of rowsToSave) {
                if (!item.status) continue;
                const isPresent =
                    item.status === 'HADIR' || item.status === 'TERLAMBAT';
                const effectiveCheckIn = isPresent
                    ? item.checkInTime || nowIso
                    : null;

                // Kolom "time" adalah GENERATED ALWAYS di PostgreSQL sehingga tidak ikut dikirim
                if (item.existingRecordId) {
                    const updatePayload: Record<string, string | null> = {
                        status: item.status,
                        checkInTime: effectiveCheckIn,
                        notes: item.notes.trim() || null,
                        recordedBy: user?.id ?? null,
                    };

                    const { error: updErr } = await supabase
                        .from('attendances')
                        .update(updatePayload)
                        .eq('id', item.existingRecordId);

                    if (updErr) {
                        if (isMissingColumnError(updErr)) {
                            const { error: fallbackErr } = await supabase
                                .from('attendances')
                                .update({
                                    status: item.status,
                                    checkInTime: effectiveCheckIn,
                                    notes: item.notes.trim() || null,
                                })
                                .eq('id', item.existingRecordId);
                            if (fallbackErr) throw fallbackErr;
                        } else {
                            throw updErr;
                        }
                    }
                } else {
                    const insertPayload: Record<string, string | null> = {
                        schoolId: activeSchoolId,
                        studentId: item.studentId,
                        type: 'SISWA',
                        date: selectedDate,
                        status: item.status,
                        checkInTime: effectiveCheckIn,
                        notes: item.notes?.trim() ? item.notes.trim() : null,
                        recordedBy: user?.id ?? null,
                    };

                    const { error: insErr } = await supabase
                        .from('attendances')
                        .insert(insertPayload);

                    if (insErr) {
                        if (isMissingColumnError(insErr)) {
                            const { error: fallbackInsErr } = await supabase
                                .from('attendances')
                                .insert({
                                    schoolId: activeSchoolId,
                                    studentId: item.studentId,
                                    type: 'SISWA',
                                    date: selectedDate,
                                    status: item.status,
                                    checkInTime: effectiveCheckIn,
                                    notes: item.notes.trim() || null,
                                });
                            if (fallbackInsErr) throw fallbackInsErr;
                        } else {
                            throw insErr;
                        }
                    }
                }
            }

            setMessage({
                status: 'success',
                text: `Berhasil menyimpan presensi ${rowsToSave.length} siswa kelas ${selectedClassName} (${selectedDate}).`,
            });
            await loadClassStudentsAndAttendance();
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal menyimpan presensi kelas: ${errMsg}`,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleStudentCheckOut = async (row: StudentRowItem) => {
        if (!row.existingRecordId || !enableStudentCheckOut) return;

        if (holidayLock.isLocked) {
            setMessage({
                status: 'error',
                text: lockBannerMessage,
            });
            return;
        }

        setCheckingOutId(row.studentId);
        setMessage(null);

        try {
            const nowIso = buildIsoTimestampForDate(selectedDate);
            const formattedClock = formatTimeDisplay(nowIso) ?? '';

            const { error } = await supabase
                .from('attendances')
                .update({ checkOutTime: nowIso })
                .eq('id', row.existingRecordId);

            if (error) throw error;

            setRows((prev) =>
                prev.map((item) =>
                    item.studentId === row.studentId
                        ? { ...item, checkOutTime: nowIso }
                        : item
                )
            );
            setMessage({
                status: 'success',
                text: `Absen pulang ${row.fullName} berhasil dicatat pukul ${formattedClock}.`,
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal mencatat absen pulang ${row.fullName}: ${errMsg}`,
            });
        } finally {
            setCheckingOutId(null);
        }
    };

    // Eksekusi hapus catatan presensi siswa dari Modal Konfirmasi
    const handleConfirmDeleteRecord = async () => {
        if (
            !deleteTarget?.existingRecordId ||
            !canDeleteAttendance ||
            !activeSchoolId
        ) {
            return;
        }

        setIsDeletingRecord(true);
        setMessage(null);

        try {
            const { error } = await supabase
                .from('attendances')
                .delete()
                .eq('id', deleteTarget.existingRecordId)
                .eq('schoolId', activeSchoolId);

            if (error) throw error;

            const deletedName = deleteTarget.fullName;
            setDeleteTarget(null);
            await loadClassStudentsAndAttendance();
            setMessage({
                status: 'success',
                text: `Catatan presensi ${deletedName} pada ${selectedDate} berhasil dihapus.`,
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal menghapus data presensi: ${errMsg}`,
            });
        } finally {
            setIsDeletingRecord(false);
        }
    };

    const handleConfirmActivateSpecialEvent = async () => {
        if (!specialEventInput.trim()) return;
        try {
            await holidayLock.activateSpecialEvent(specialEventInput.trim());
            setShowSpecialEventModal(false);
            setSpecialEventInput('');
            setMessage({
                status: 'success',
                text: 'Mode Kegiatan Khusus berhasil diaktifkan. Presensi siswa pada tanggal libur ini kini dibuka.',
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal mengaktifkan kegiatan khusus: ${errMsg}`,
            });
        }
    };

    const handleDeactivateSpecialEvent = async () => {
        try {
            await holidayLock.deactivateSpecialEvent();
            setMessage({
                status: 'success',
                text: 'Mode Kegiatan Khusus dinonaktifkan. Penguncian hari libur kembali berlaku.',
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(err);
            setMessage({
                status: 'error',
                text: `Gagal menonaktifkan kegiatan khusus: ${errMsg}`,
            });
        }
    };

    const filteredRows = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(
            (r) =>
                r.fullName.toLowerCase().includes(q) ||
                (r.nisn ?? '').toLowerCase().includes(q) ||
                (r.nis ?? '').toLowerCase().includes(q)
        );
    }, [rows, searchQuery]);

    // Kalkulasi Pagination
    const effectivePageSize = pageSize === 0 ? filteredRows.length || 1 : pageSize;
    const totalPages =
        pageSize === 0
            ? 1
            : Math.max(1, Math.ceil(filteredRows.length / effectivePageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedRows = useMemo(() => {
        if (pageSize === 0) return filteredRows;
        const startIdx = (safeCurrentPage - 1) * pageSize;
        return filteredRows.slice(startIdx, startIdx + pageSize);
    }, [filteredRows, pageSize, safeCurrentPage]);

    const startItemNumber =
        filteredRows.length === 0
            ? 0
            : pageSize === 0
                ? 1
                : (safeCurrentPage - 1) * pageSize + 1;
    const endItemNumber =
        pageSize === 0
            ? filteredRows.length
            : Math.min(safeCurrentPage * pageSize, filteredRows.length);

    const summary = useMemo(() => {
        let hadir = 0;
        let terlambat = 0;
        let izin = 0;
        let sakit = 0;
        let alpa = 0;
        let belum = 0;
        let dirtyCount = 0;

        for (const r of rows) {
            if (r.isDirty) dirtyCount++;
            if (r.status === 'HADIR') hadir++;
            else if (r.status === 'TERLAMBAT') terlambat++;
            else if (r.status === 'IZIN') izin++;
            else if (r.status === 'SAKIT') sakit++;
            else if (r.status === 'ALPA') alpa++;
            else belum++;
        }

        return {
            total: rows.length,
            hadir,
            terlambat,
            izin,
            sakit,
            alpa,
            belum,
            dirtyCount,
        };
    }, [rows]);

    const tableColSpan =
        5 + (enableStudentCheckOut ? 1 : 0) + (canDeleteAttendance ? 1 : 0);

    const deleteTargetStatusOption = useMemo(
        () =>
            deleteTarget?.status
                ? STATUS_OPTIONS.find((opt) => opt.value === deleteTarget.status) ?? null
                : null,
        [deleteTarget]
    );

    return (
        <div className="space-y-5 max-w-6xl mx-auto">
            {/* Banner Simulasi Khusus SUPER_ADMIN */}
            {isSuperAdmin && simSchools.length > 0 && (
                <div
                    className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3"
                    style={{
                        background: 'rgba(139, 92, 246, 0.1)',
                        borderColor: 'rgba(139, 92, 246, 0.35)',
                    }}
                >
                    <div className="flex items-center gap-2 text-xs font-semibold text-purple-600 dark:text-purple-300">
                        <FlaskConical size={16} />
                        <span>Mode Simulasi Super Admin:</span>
                    </div>
                    <select
                        className="form-input min-w-60 text-xs"
                        value={simSchoolId}
                        onChange={(e) => setSimSchoolId(e.target.value)}
                    >
                        {simSchools.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} ({s.npsn})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            {/* Header Halaman */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="text-emerald-600" size={24} />
                        Presensi Siswa per Kelas
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        Input & kelola kehadiran siswa harian secara kolektif oleh Wali
                        Kelas / Guru Mata Pelajaran.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {holidayLock.isHoliday &&
                        holidayLock.canManageOverride &&
                        (holidayLock.isSpecialEventActive ? (
                            <button
                                type="button"
                                disabled={holidayLock.isToggling}
                                onClick={() => void handleDeactivateSpecialEvent()}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold border border-red-500/40 bg-red-500/15 text-red-700 dark:text-red-200 hover:bg-red-500/25 transition-all cursor-pointer disabled:opacity-50"
                            >
                                <Lock size={14} />
                                {holidayLock.isToggling
                                    ? 'Mengunci...'
                                    : 'Kunci Kembali Hari Libur'}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowSpecialEventModal(true)}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted/80 text-foreground transition-all cursor-pointer"
                            >
                                <Sparkles size={14} className="text-amber-500" />
                                Buka Presensi Kegiatan Khusus
                            </button>
                        ))}

                    <button
                        type="button"
                        onClick={handleMarkAllHadir}
                        disabled={
                            holidayLock.isLocked ||
                            isLoadingRows ||
                            rows.length === 0 ||
                            summary.belum === 0
                        }
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                        <CheckCheck size={15} />
                        Tandai Semua Belum Diabsen = HADIR ({summary.belum})
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleSaveAll()}
                        disabled={
                            holidayLock.isLocked || isSaving || summary.dirtyCount === 0
                        }
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {isSaving ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <Save size={15} />
                        )}
                        {isSaving
                            ? 'Menyimpan...'
                            : `Simpan Presensi (${summary.dirtyCount})`}
                    </button>
                </div>
            </div>

            {/* Banner Status Hari Libur / Kegiatan Khusus */}
            {holidayLock.isLocked ? (
                <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100 flex items-start gap-3">
                    <CalendarOff size={20} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                        <p className="font-bold text-sm">
                            Hari Libur: {holidayLock.holidayName ?? 'Libur Kalender'}
                        </p>
                        <p className="opacity-90 leading-relaxed">
                            Pengisian presensi siswa untuk tanggal{' '}
                            <strong>{selectedDate}</strong> dikunci otomatis dan tidak
                            dihitung sebagai Alpa.
                        </p>
                    </div>
                </div>
            ) : (
                holidayLock.isHoliday &&
                holidayLock.isSpecialEventActive && (
                    <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5 text-xs">
                        <Unlock size={17} className="text-emerald-600 shrink-0" />
                        <span>
                            <strong>Mode Kegiatan Khusus Aktif:</strong>{' '}
                            {holidayLock.specialEventReason} (Pengecualian untuk jadwal libur{' '}
                            {holidayLock.holidayName})
                        </span>
                    </div>
                )
            )}

            {!enableClassAttendance && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
                    <Info size={16} className="shrink-0" />
                    <span>
                        Catatan: Metode presensi manual wali kelas saat ini dinonaktifkan di
                        Pengaturan Sekolah, namun Anda tetap dapat melihat dan memperbarui
                        data kelas.
                    </span>
                </div>
            )}

            {message && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${message.status === 'success'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                            : 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200'
                        }`}
                >
                    {message.status === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                        <AlertCircle size={16} className="text-red-600 shrink-0" />
                    )}
                    <span>{message.text}</span>
                </div>
            )}

            {/* Filter Bar */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-wrap items-end gap-3">
                <div>
                    <label className="text-[11px] font-semibold block mb-1">
                        Tanggal Presensi
                    </label>
                    <div className="relative">
                        <input
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="form-input text-xs pr-8"
                        />
                        <Calendar
                            size={14}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none"
                        />
                    </div>
                </div>

                <div className="min-w-44">
                    <label className="text-[11px] font-semibold block mb-1">
                        Pilih Kelas
                    </label>
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        disabled={isLoadingClasses || classesList.length === 0}
                        className="form-input w-full text-xs font-semibold"
                    >
                        {classesList.length === 0 ? (
                            <option value="">Belum ada data kelas</option>
                        ) : (
                            <>
                                {!isHomeroomRestricted && (
                                    <option value="ALL">Semua Kelas</option>
                                )}
                                {classesList.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                        Kelas {cls.name}
                                    </option>
                                ))}
                            </>
                        )}
                    </select>
                </div>

                {/* Flex Input Wrapper: Ikon Search Anti-Tumpuk */}
                <div className="flex-1 min-w-60">
                    <label className="text-[11px] font-semibold block mb-1">
                        Cari Siswa
                    </label>
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-emerald-500/40">
                        <Search
                            size={15}
                            className="shrink-0 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setCurrentPage(1);
                            }}
                            placeholder="Cari nama siswa, NISN, atau NIS..."
                            className="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery('');
                                    setCurrentPage(1);
                                }}
                                className="p-0.5 rounded-md text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                                title="Bersihkan pencarian"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Ringkasan Statistik Kelas */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                <div className="p-3 rounded-xl border border-border bg-card">
                    <p className="text-[11px] opacity-65">Total Siswa</p>
                    <p className="text-xl font-bold mt-0.5">{summary.total}</p>
                </div>
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        Hadir
                    </p>
                    <p className="text-xl font-bold text-emerald-600 mt-0.5">
                        {summary.hadir}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        Terlambat
                    </p>
                    <p className="text-xl font-bold text-amber-600 mt-0.5">
                        {summary.terlambat}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
                    <p className="text-[11px] text-blue-700 dark:text-blue-300">Izin</p>
                    <p className="text-xl font-bold text-blue-600 mt-0.5">
                        {summary.izin}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-500/5">
                    <p className="text-[11px] text-purple-700 dark:text-purple-300">
                        Sakit
                    </p>
                    <p className="text-xl font-bold text-purple-600 mt-0.5">
                        {summary.sakit}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5">
                    <p className="text-[11px] text-red-700 dark:text-red-300">Alpa</p>
                    <p className="text-xl font-bold text-red-600 mt-0.5">
                        {summary.alpa}
                    </p>
                </div>
            </div>

            {/* Tabel Daftar Siswa Kelas + Pagination */}
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                        <thead>
                            <tr className="border-b border-border bg-muted/40 text-left">
                                <th className="py-3 px-3 w-10 text-center font-semibold">No</th>
                                <th className="py-3 px-3 font-semibold min-w-44">Nama Siswa</th>
                                <th className="py-3 px-3 font-semibold min-w-64">
                                    Status Kehadiran
                                </th>
                                <th className="py-3 px-3 font-semibold">Jam Masuk</th>
                                {enableStudentCheckOut && (
                                    <th className="py-3 px-3 font-semibold">Jam Pulang</th>
                                )}
                                <th className="py-3 px-3 font-semibold min-w-40">
                                    Keterangan
                                </th>
                                {canDeleteAttendance && (
                                    <th className="py-3 px-3 text-center font-semibold w-24">
                                        Aksi
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {isLoadingRows ? (
                                <tr>
                                    <td
                                        colSpan={tableColSpan}
                                        className="py-12 text-center opacity-70"
                                    >
                                        <div className="inline-flex items-center gap-2">
                                            <Loader2 size={16} className="animate-spin" />
                                            Memuat daftar siswa {selectedClassName}...
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedRows.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={tableColSpan}
                                        className="py-12 text-center opacity-65"
                                    >
                                        {classesList.length === 0
                                            ? 'Belum ada data kelas/siswa terdaftar di sekolah ini.'
                                            : 'Tidak ada siswa yang sesuai dengan filter kelas/pencarian.'}
                                    </td>
                                </tr>
                            ) : (
                                paginatedRows.map((row, idx) => {
                                    const rowNumber =
                                        pageSize === 0
                                            ? idx + 1
                                            : (safeCurrentPage - 1) * pageSize + idx + 1;
                                    const formattedIn = formatTimeDisplay(row.checkInTime);
                                    const formattedOut = formatTimeDisplay(row.checkOutTime);
                                    const canCheckOut =
                                        enableStudentCheckOut &&
                                        !holidayLock.isLocked &&
                                        row.existingRecordId !== null &&
                                        (row.status === 'HADIR' || row.status === 'TERLAMBAT') &&
                                        !formattedOut;

                                    return (
                                        <tr
                                            key={row.studentId}
                                            className={`border-b border-border/60 transition hover:bg-muted/20 ${row.isDirty ? 'bg-emerald-500/5' : ''
                                                }`}
                                        >
                                            <td className="py-2.5 px-3 text-center font-mono opacity-65">
                                                {rowNumber}
                                            </td>
                                            <td className="py-2.5 px-3">
                                                <div className="font-semibold text-foreground">
                                                    {row.fullName}
                                                </div>
                                                <div className="text-[11px] opacity-65 font-mono">
                                                    {selectedClassId === 'ALL' && (
                                                        <span className="font-sans font-semibold text-emerald-700 dark:text-emerald-300 mr-1.5">
                                                            [Kelas {row.className}]
                                                        </span>
                                                    )}
                                                    {row.nisn
                                                        ? `NISN: ${row.nisn}`
                                                        : row.nis
                                                            ? `NIS: ${row.nis}`
                                                            : `Kelas ${row.className}`}
                                                </div>
                                            </td>

                                            <td className="py-2.5 px-3">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {STATUS_OPTIONS.map((opt) => {
                                                        const isSelected = row.status === opt.value;
                                                        const IconComp = opt.icon;
                                                        return (
                                                            <button
                                                                key={opt.value}
                                                                type="button"
                                                                disabled={holidayLock.isLocked}
                                                                onClick={() =>
                                                                    handleSetStudentStatus(
                                                                        row.studentId,
                                                                        opt.value
                                                                    )
                                                                }
                                                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer disabled:opacity-50 ${isSelected
                                                                        ? opt.activeClass
                                                                        : 'border-border bg-background hover:bg-muted text-foreground/80'
                                                                    }`}
                                                            >
                                                                <IconComp size={12} />
                                                                <span>{opt.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>

                                            <td className="py-2.5 px-3 font-mono font-semibold">
                                                {formattedIn ? (
                                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                                                        {formattedIn}
                                                    </span>
                                                ) : (
                                                    <span className="opacity-40">-</span>
                                                )}
                                            </td>

                                            {enableStudentCheckOut && (
                                                <td className="py-2.5 px-3">
                                                    {formattedOut ? (
                                                        <span className="font-mono font-semibold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-700 dark:text-indigo-300">
                                                            {formattedOut}
                                                        </span>
                                                    ) : canCheckOut ? (
                                                        <button
                                                            type="button"
                                                            disabled={checkingOutId === row.studentId}
                                                            onClick={() => void handleStudentCheckOut(row)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition cursor-pointer disabled:opacity-50"
                                                        >
                                                            {checkingOutId === row.studentId ? (
                                                                <Loader2 size={11} className="animate-spin" />
                                                            ) : (
                                                                <LogOut size={11} />
                                                            )}
                                                            Absen Pulang
                                                        </button>
                                                    ) : (
                                                        <span className="opacity-40 font-mono">-</span>
                                                    )}
                                                </td>
                                            )}

                                            <td className="py-2.5 px-3">
                                                <input
                                                    type="text"
                                                    value={row.notes}
                                                    disabled={holidayLock.isLocked}
                                                    onChange={(e) =>
                                                        handleSetStudentNote(row.studentId, e.target.value)
                                                    }
                                                    placeholder="Catatan opsional..."
                                                    className="form-input w-full text-[11px] py-1 px-2"
                                                />
                                            </td>

                                            {canDeleteAttendance && (
                                                <td className="py-2.5 px-3 text-center">
                                                    {row.existingRecordId ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => setDeleteTarget(row)}
                                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-all cursor-pointer"
                                                            title="Hapus catatan presensi tersimpan (Super Admin / Admin)"
                                                        >
                                                            <Trash2 size={12} />
                                                            <span>Hapus</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-[11px] opacity-30">-</span>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Footer Kontrol Pagination */}
                {!isLoadingRows && filteredRows.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-t border-border bg-muted/25 text-xs">
                        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                            <span>
                                Menampilkan <strong>{startItemNumber}</strong>–
                                <strong>{endItemNumber}</strong> dari{' '}
                                <strong>{filteredRows.length}</strong> siswa
                            </span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                aria-label="Jumlah siswa per halaman"
                                className="form-input w-auto! text-xs py-1 px-2 bg-card font-medium"
                            >
                                {STUDENT_PAGE_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt === 0 ? 'Tampilkan Semua' : `${opt} / halaman`}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {pageSize !== 0 && totalPages > 1 && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={safeCurrentPage <= 1}
                                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                >
                                    <ChevronLeft size={14} />
                                    Sebelumnya
                                </button>

                                <span className="px-2.5 py-1 font-mono font-semibold text-foreground">
                                    Hal {safeCurrentPage} / {totalPages}
                                </span>

                                <button
                                    type="button"
                                    disabled={safeCurrentPage >= totalPages}
                                    onClick={() =>
                                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                >
                                    Berikutnya
                                    <ChevronRight size={14} />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modal Konfirmasi Modern Hapus Catatan Presensi Siswa */}
            {deleteTarget && canDeleteAttendance && (
                <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
                    onClick={() => !isDeletingRecord && setDeleteTarget(null)}
                >
                    <div
                        className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 rounded-xl bg-red-500/15 text-red-600 dark:text-red-400 border border-red-500/25 shrink-0">
                                    <AlertTriangle size={20} />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-foreground">
                                        Hapus Catatan Presensi?
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Status kehadiran siswa akan direset menjadi Belum Diabsen.
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isDeletingRecord}
                                onClick={() => setDeleteTarget(null)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer disabled:opacity-40"
                                aria-label="Tutup dialog"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        {/* Kartu Ringkasan Data Siswa yang Akan Dihapus */}
                        <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Nama Siswa</span>
                                <span className="font-bold text-foreground text-right">
                                    {deleteTarget.fullName}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Kelas / NISN</span>
                                <span className="font-mono text-foreground">
                                    {deleteTarget.className}
                                    {deleteTarget.nisn ? ` • ${deleteTarget.nisn}` : ''}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">Tanggal</span>
                                <span className="font-mono font-semibold text-foreground">
                                    {selectedDate}
                                </span>
                            </div>
                            {deleteTargetStatusOption && (
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                                    <span className="text-muted-foreground">
                                        Status Tersimpan
                                    </span>
                                    <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${deleteTargetStatusOption.badgeClass}`}
                                    >
                                        <deleteTargetStatusOption.icon size={11} />
                                        {deleteTargetStatusOption.label}
                                    </span>
                                </div>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button
                                type="button"
                                disabled={isDeletingRecord}
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 rounded-xl text-xs font-semibold border border-border bg-background hover:bg-muted text-foreground transition cursor-pointer disabled:opacity-40"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                disabled={isDeletingRecord}
                                onClick={() => void handleConfirmDeleteRecord()}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow-sm transition cursor-pointer disabled:opacity-50"
                            >
                                {isDeletingRecord ? (
                                    <Loader2 size={14} className="animate-spin" />
                                ) : (
                                    <Trash2 size={14} />
                                )}
                                {isDeletingRecord ? 'Menghapus...' : 'Ya, Hapus Data'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Input Alasan Kegiatan Khusus */}
            {showSpecialEventModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-4">
                        <h3 className="text-base font-bold flex items-center gap-2">
                            <Sparkles size={18} className="text-amber-500" />
                            Buka Presensi Kegiatan Khusus
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            Presensi siswa pada hari libur tanggal{' '}
                            <strong>{selectedDate}</strong> akan dibuka sementara untuk
                            kegiatan khusus sekolah.
                        </p>
                        <div>
                            <label className="text-xs font-semibold block mb-1">
                                Nama Kegiatan / Alasan Pengecualian
                            </label>
                            <input
                                type="text"
                                value={specialEventInput}
                                onChange={(e) => setSpecialEventInput(e.target.value)}
                                placeholder="Contoh: Class Meeting / Kegiatan Pramuka / Studi Wisata"
                                className="form-input w-full text-xs"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowSpecialEventModal(false)}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted cursor-pointer"
                            >
                                Batal
                            </button>
                            <button
                                type="button"
                                disabled={!specialEventInput.trim() || holidayLock.isToggling}
                                onClick={() => void handleConfirmActivateSpecialEvent()}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 cursor-pointer"
                            >
                                {holidayLock.isToggling ? 'Menyimpan...' : 'Aktifkan Presensi'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}