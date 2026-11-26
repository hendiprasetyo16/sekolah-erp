// src/modules/attendance/pages/StudentClassAttendancePage.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { useTranslation } from '@/hooks/useTranslation';
import { attendanceService } from '../services/attendance.service';
import { getLocalDateString } from '../services/gps.utils';
import { useStudentHolidayLock } from '../hooks/useStudentHolidayLock';
import type { SupportedAttendanceLocale } from '../types/attendance.types';

const DEFAULT_STUDENT_PAGE_SIZE = 10;
const STUDENT_PAGE_SIZE_OPTIONS = [10, 20, 50, 0] as const; // 0 = Semua
const DEFAULT_CLASS_FILTER_FOR_ADMIN = 'ALL';
const IN_QUERY_CHUNK_SIZE = 100; // Batas aman ukuran array .in('studentId', ids) pada PostgREST URL
const BULK_INSERT_CHUNK_SIZE = 100; // Ukuran batch bulk insert presensi baru
const CONCURRENT_UPDATE_CHUNK_SIZE = 25; // Jumlah update paralel per gelombang

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

interface UpdateAttendanceQueueItem {
    recordId: string;
    status: StudentAttendanceStatus;
    checkInTime: string | null;
    notes: string | null;
}

const STATUS_OPTIONS: {
    value: StudentAttendanceStatus;
    short: string;
    activeClass: string;
    badgeClass: string;
    icon: typeof CheckCircle2;
}[] = [
        {
            value: 'HADIR',
            short: 'H',
            activeClass:
                'bg-emerald-600 text-white border-emerald-600 shadow-2xs ring-1 ring-emerald-600/30',
            badgeClass:
                'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
            icon: CheckCircle2,
        },
        {
            value: 'TERLAMBAT',
            short: 'T',
            activeClass:
                'bg-amber-500 text-white border-amber-500 shadow-2xs ring-1 ring-amber-500/30',
            badgeClass:
                'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30',
            icon: Clock,
        },
        {
            value: 'IZIN',
            short: 'I',
            activeClass:
                'bg-blue-600 text-white border-blue-600 shadow-2xs ring-1 ring-blue-600/30',
            badgeClass:
                'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
            icon: FileText,
        },
        {
            value: 'SAKIT',
            short: 'S',
            activeClass:
                'bg-purple-600 text-white border-purple-600 shadow-2xs ring-1 ring-purple-600/30',
            badgeClass:
                'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30',
            icon: AlertCircle,
        },
        {
            value: 'ALPA',
            short: 'A',
            activeClass:
                'bg-red-600 text-white border-red-600 shadow-2xs ring-1 ring-red-600/30',
            badgeClass:
                'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
            icon: XCircle,
        },
    ];

function chunkArray<T>(items: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        chunks.push(items.slice(i, i + size));
    }
    return chunks;
}

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

function formatTimeDisplay(
    value: string | null | undefined,
    localeCode: string
): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (/^\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
        return trimmed.slice(0, 5);
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toLocaleTimeString(localeCode, {
        hour: '2-digit',
        minute: '2-digit',
    });
}

function getErrorInfo(
    err: unknown,
    fallbackProcess: string,
    fallbackUnexpected: string
): { code: string; message: string } {
    if (typeof err === 'object' && err !== null) {
        const rec = err as Record<string, unknown>;
        return {
            code: typeof rec.code === 'string' ? rec.code : '',
            message:
                typeof rec.message === 'string' && rec.message.trim().length > 0
                    ? rec.message
                    : fallbackProcess,
        };
    }
    if (err instanceof Error) {
        return { code: '', message: err.message };
    }
    return { code: '', message: fallbackUnexpected };
}

function isMissingColumnError(err: unknown): boolean {
    const { code, message } = getErrorInfo(err, '', '');
    const lower = message.toLowerCase();
    return (
        code === 'PGRST204' ||
        code === '42703' ||
        lower.includes('schema cache') ||
        (lower.includes('column') && lower.includes('does not exist'))
    );
}

export function StudentClassAttendancePage() {
    const { t } = useTranslation();
    const currentLang: SupportedAttendanceLocale =
        t('common.language') === 'Language' ? 'en' : 'id';
    const timeLocale = currentLang === 'en' ? 'en-US' : 'id-ID';
    const defaultSpecialEventNote = t(
        'studentClassAttendance.defaultSpecialEventNote'
    );

    const { user, school, hasAnyRole } = useAuthStore();
    const isSuperAdmin = hasAnyRole(['SUPER_ADMIN']);
    const isPrivilegedRole = hasAnyRole([
        'SUPER_ADMIN',
        'ADMIN',
        'KEPALA_SEKOLAH',
    ]);
    const canDeleteAttendance = hasAnyRole(['SUPER_ADMIN', 'ADMIN']);

    const [simSchools, setSimSchools] = useState<
        Array<{ id: string; name: string; npsn: string }>
    >([]);
    const [simSchoolId, setSimSchoolId] = useState<string>('');
    const activeSchoolId = isSuperAdmin
        ? simSchoolId || school?.id || user?.schoolId || ''
        : school?.id || user?.schoolId || '';

    const teacherScope = useTeacherScope(activeSchoolId);

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

    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_STUDENT_PAGE_SIZE);

    const [rows, setRows] = useState<StudentRowItem[]>([]);
    const [isLoadingClasses, setIsLoadingClasses] = useState<boolean>(false);
    const [isLoadingRows, setIsLoadingRows] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [checkingOutId, setCheckingOutId] = useState<string | null>(null);

    const [deleteTarget, setDeleteTarget] = useState<StudentRowItem | null>(null);
    const [isDeletingRecord, setIsDeletingRecord] = useState<boolean>(false);

    const [message, setMessage] = useState<MessageBanner | null>(null);

    const [enableClassAttendance, setEnableClassAttendance] =
        useState<boolean>(true);
    const [enableStudentCheckOut, setEnableStudentCheckOut] =
        useState<boolean>(true);

    const loadRowsSeqRef = useRef<number>(0);

    const holidayLock = useStudentHolidayLock({
        schoolId: activeSchoolId,
        targetDate: selectedDate,
        lang: currentLang,
    });

    const [showSpecialEventModal, setShowSpecialEventModal] =
        useState<boolean>(false);
    const [specialEventInput, setSpecialEventInput] = useState<string>('');

    const getStatusLabel = useCallback(
        (status: StudentAttendanceStatus): string => {
            switch (status) {
                case 'HADIR':
                    return t('studentClassAttendance.status_HADIR');
                case 'TERLAMBAT':
                    return t('studentClassAttendance.status_TERLAMBAT');
                case 'IZIN':
                    return t('studentClassAttendance.status_IZIN');
                case 'SAKIT':
                    return t('studentClassAttendance.status_SAKIT');
                case 'ALPA':
                    return t('studentClassAttendance.status_ALPA');
            }
        },
        [t]
    );

    const isActionBlockedByHoliday =
        holidayLock.isLocked || holidayLock.isLoading;

    const isSpecialEventMode = Boolean(
        holidayLock.isHoliday && holidayLock.isSpecialEventActive
    );
    const specialEventNote = useMemo(() => {
        const reason = (holidayLock.specialEventReason ?? '').trim();
        return reason || defaultSpecialEventNote;
    }, [holidayLock.specialEventReason, defaultSpecialEventNote]);

    const lockBannerMessage = useMemo(() => {
        if (holidayLock.isHoliday) {
            return t('studentClassAttendance.lockBannerHoliday', {
                holiday:
                    holidayLock.holidayName ||
                    t('studentClassAttendance.defaultHolidayName'),
            });
        }
        if (holidayLock.isSpecialEventActive) {
            return t('studentClassAttendance.lockBannerSpecialEvent', {
                reason: specialEventNote,
            });
        }
        return t('studentClassAttendance.lockBannerDefault');
    }, [
        holidayLock.isHoliday,
        holidayLock.holidayName,
        holidayLock.isSpecialEventActive,
        specialEventNote,
        t,
    ]);

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
                    .select('enableStudentClassAttendance, enableStudentCheckOut')
                    .eq('id', activeSchoolId)
                    .maybeSingle(),
            ]);

            if (classesRes.error) throw classesRes.error;

            let loadedClasses = (classesRes.data ?? []) as Array<{
                id: string;
                name: string;
            }>;

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
                    if (isHomeroomRestricted) {
                        return loadedClasses.some((c) => c.id === prev)
                            ? prev
                            : loadedClasses[0].id;
                    }
                    if (prev === 'ALL') return 'ALL';
                    if (loadedClasses.some((c) => c.id === prev)) return prev;
                    return DEFAULT_CLASS_FILTER_FOR_ADMIN;
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
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errLoadClasses', { message: errMsg }),
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
        t,
    ]);

    useEffect(() => {
        void loadClassesAndConfig();
    }, [loadClassesAndConfig]);

    const selectedClassName = useMemo(() => {
        if (selectedClassId === 'ALL') {
            return t('studentClassAttendance.allClassesOption');
        }
        return (
            classesList.find((c) => c.id === selectedClassId)?.name ??
            t('studentClassAttendance.selectedClassFallback')
        );
    }, [classesList, selectedClassId, t]);

    const loadClassStudentsAndAttendance = useCallback(async () => {
        if (!activeSchoolId || !selectedClassId || !selectedDate) {
            setRows([]);
            return;
        }

        const seq = ++loadRowsSeqRef.current;
        setIsLoadingRows(true);
        setMessage(null);
        setCurrentPage(1);

        try {
            let studentsQuery = supabase
                .from('students')
                .select('id, fullName, nisn, nis, classId, gender, classes(name)')
                .eq('schoolId', activeSchoolId)
                .eq('status', 'AKTIF')
                .order('fullName', { ascending: true })
                .limit(3000);

            if (selectedClassId !== 'ALL') {
                studentsQuery = studentsQuery.eq('classId', selectedClassId);
            } else if (isHomeroomRestricted && homeroomClassKey) {
                studentsQuery = studentsQuery.in(
                    'classId',
                    homeroomClassKey.split(',')
                );
            }

            const { data: studentsData, error: studentsErr } = await studentsQuery;

            if (seq !== loadRowsSeqRef.current) return;
            if (studentsErr) throw studentsErr;

            const typedStudents = (studentsData ?? []) as RawStudentDbRow[];
            const studentIds = typedStudents.map((s) => String(s.id));

            const attendanceMap = new Map<string, RawStudentAttendanceDbRow>();

            if (studentIds.length > 0) {
                const studentIdChunks = chunkArray(studentIds, IN_QUERY_CHUNK_SIZE);
                const attChunkResults = await Promise.all(
                    studentIdChunks.map((chunkIds) =>
                        supabase
                            .from('attendances')
                            .select(
                                'id, studentId, status, checkInTime, checkOutTime, time, notes'
                            )
                            .eq('schoolId', activeSchoolId)
                            .eq('date', selectedDate)
                            .eq('type', 'SISWA')
                            .in('studentId', chunkIds)
                    )
                );

                if (seq !== loadRowsSeqRef.current) return;

                for (const res of attChunkResults) {
                    if (res.error) throw res.error;
                    const typedAtts = (res.data ?? []) as RawStudentAttendanceDbRow[];
                    for (const att of typedAtts) {
                        if (att.studentId) {
                            attendanceMap.set(String(att.studentId), att);
                        }
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

                const savedNote = (existing?.notes ?? '').trim();

                return {
                    studentId: sid,
                    fullName:
                        st.fullName ?? t('studentClassAttendance.unnamedStudent'),
                    nisn: st.nisn ?? null,
                    nis: st.nis ?? null,
                    classId: st.classId ?? selectedClassId,
                    className: resolvedClassName ?? selectedClassName,
                    gender: st.gender ?? null,
                    status: validStatus,
                    checkInTime: existing?.checkInTime ?? existing?.time ?? null,
                    checkOutTime: existing?.checkOutTime ?? null,
                    notes: savedNote || (isSpecialEventMode ? specialEventNote : ''),
                    existingRecordId: existing?.id ? String(existing.id) : null,
                    isDirty: false,
                };
            });

            if (seq === loadRowsSeqRef.current) {
                setRows(combinedRows);
            }
        } catch (err: unknown) {
            if (seq !== loadRowsSeqRef.current) return;
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errLoadStudents', {
                    className: selectedClassName,
                    message: errMsg,
                }),
            });
        } finally {
            if (seq === loadRowsSeqRef.current) {
                setIsLoadingRows(false);
            }
        }
    }, [
        activeSchoolId,
        selectedClassId,
        selectedClassName,
        selectedDate,
        isHomeroomRestricted,
        homeroomClassKey,
        isSpecialEventMode,
        specialEventNote,
        t,
    ]);

    useEffect(() => {
        void loadClassStudentsAndAttendance();
    }, [loadClassStudentsAndAttendance]);

    useEffect(() => {
        if (!isSpecialEventMode) return;
        setRows((prev) => {
            let hasChanged = false;
            const updated = prev.map((row) => {
                if (row.notes.trim() !== '') return row;
                hasChanged = true;
                return {
                    ...row,
                    notes: specialEventNote,
                    isDirty: row.isDirty || row.status !== null,
                };
            });
            return hasChanged ? updated : prev;
        });
    }, [isSpecialEventMode, specialEventNote]);

    const handleSetStudentStatus = (
        studentId: string,
        newStatus: StudentAttendanceStatus
    ) => {
        if (isActionBlockedByHoliday) {
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
                const resolvedNote =
                    isSpecialEventMode && !row.notes.trim()
                        ? specialEventNote
                        : row.notes;
                return {
                    ...row,
                    status: newStatus,
                    checkInTime: isPresent ? row.checkInTime || nowIso : null,
                    notes: resolvedNote,
                    isDirty: true,
                };
            })
        );
    };

    const handleSetStudentNote = (studentId: string, notes: string) => {
        if (isActionBlockedByHoliday) return;
        setRows((prev) =>
            prev.map((row) =>
                row.studentId === studentId ? { ...row, notes, isDirty: true } : row
            )
        );
    };

    const handleMarkAllHadir = () => {
        if (isActionBlockedByHoliday) {
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
                const resolvedNote =
                    isSpecialEventMode && !row.notes.trim()
                        ? specialEventNote
                        : row.notes;
                return {
                    ...row,
                    status: 'HADIR',
                    checkInTime: row.checkInTime ?? nowIso,
                    notes: resolvedNote,
                    isDirty: true,
                };
            })
        );
    };

    const handleSaveAll = async () => {
        if (!activeSchoolId) return;

        if (isActionBlockedByHoliday) {
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
                text: t('studentClassAttendance.errNoChangesToSave'),
            });
            return;
        }

        setIsSaving(true);
        setMessage(null);

        try {
            const nowIso = buildIsoTimestampForDate(selectedDate);
            const targetStudentIds = rowsToSave.map((r) => r.studentId);

            // Cek data terkini di DB per batch 100 ID untuk mencegah bentrok unique constraint
            const targetChunks = chunkArray(targetStudentIds, IN_QUERY_CHUNK_SIZE);
            const existingChunkResults = await Promise.all(
                targetChunks.map((chunkIds) =>
                    supabase
                        .from('attendances')
                        .select('id, studentId')
                        .eq('schoolId', activeSchoolId)
                        .eq('date', selectedDate)
                        .eq('type', 'SISWA')
                        .in('studentId', chunkIds)
                )
            );

            const latestIdByStudent = new Map<string, string>();
            for (const res of existingChunkResults) {
                if (res.error) throw res.error;
                for (const r of (res.data ?? []) as Array<{
                    id: string;
                    studentId: string | null;
                }>) {
                    if (r.studentId) {
                        latestIdByStudent.set(String(r.studentId), String(r.id));
                    }
                }
            }

            const toUpdate: UpdateAttendanceQueueItem[] = [];
            const toInsert: Array<Record<string, string | null>> = [];

            for (const item of rowsToSave) {
                if (!item.status) continue;
                const isPresent =
                    item.status === 'HADIR' || item.status === 'TERLAMBAT';
                const effectiveCheckIn = isPresent
                    ? item.checkInTime || nowIso
                    : null;

                const effectiveNote =
                    item.notes.trim() ||
                    (isSpecialEventMode ? specialEventNote : null);

                const resolvedRecordId =
                    item.existingRecordId ||
                    latestIdByStudent.get(item.studentId) ||
                    null;

                // Kolom "time" adalah GENERATED ALWAYS di PostgreSQL sehingga tidak ikut dikirim
                if (resolvedRecordId) {
                    toUpdate.push({
                        recordId: resolvedRecordId,
                        status: item.status,
                        checkInTime: effectiveCheckIn,
                        notes: effectiveNote,
                    });
                } else {
                    toInsert.push({
                        schoolId: activeSchoolId,
                        studentId: item.studentId,
                        type: 'SISWA',
                        date: selectedDate,
                        status: item.status,
                        checkInTime: effectiveCheckIn,
                        notes: effectiveNote,
                        recordedBy: user?.id ?? null,
                    });
                }
            }

            // 1. Eksekusi UPDATE dalam gelombang paralel yang terkendali
            for (const updateBatch of chunkArray(
                toUpdate,
                CONCURRENT_UPDATE_CHUNK_SIZE
            )) {
                await Promise.all(
                    updateBatch.map(async (upd) => {
                        const { error: updErr } = await supabase
                            .from('attendances')
                            .update({
                                status: upd.status,
                                checkInTime: upd.checkInTime,
                                notes: upd.notes,
                                recordedBy: user?.id ?? null,
                            })
                            .eq('id', upd.recordId)
                            .eq('schoolId', activeSchoolId);

                        if (updErr) {
                            if (isMissingColumnError(updErr)) {
                                const { error: fallbackErr } = await supabase
                                    .from('attendances')
                                    .update({
                                        status: upd.status,
                                        checkInTime: upd.checkInTime,
                                        notes: upd.notes,
                                    })
                                    .eq('id', upd.recordId)
                                    .eq('schoolId', activeSchoolId);
                                if (fallbackErr) throw fallbackErr;
                            } else {
                                throw updErr;
                            }
                        }
                    })
                );
            }

            // 2. Eksekusi BULK INSERT per batch 100 baris
            for (const insertBatch of chunkArray(
                toInsert,
                BULK_INSERT_CHUNK_SIZE
            )) {
                const { error: insErr } = await supabase
                    .from('attendances')
                    .insert(insertBatch);

                if (insErr) {
                    if (isMissingColumnError(insErr)) {
                        const fallbackBatch = insertBatch.map((row) => ({
                            schoolId: row.schoolId,
                            studentId: row.studentId,
                            type: row.type,
                            date: row.date,
                            status: row.status,
                            checkInTime: row.checkInTime,
                            notes: row.notes,
                        }));
                        const { error: fallbackInsErr } = await supabase
                            .from('attendances')
                            .insert(fallbackBatch);
                        if (fallbackInsErr) throw fallbackInsErr;
                    } else {
                        throw insErr;
                    }
                }
            }

            const scopeLabel =
                selectedClassId === 'ALL'
                    ? t('studentClassAttendance.allClassesOption')
                    : t('studentClassAttendance.classOptionPrefix', {
                        name: selectedClassName,
                    });
            setMessage({
                status: 'success',
                text: t('studentClassAttendance.toastSaveSuccess', {
                    count: rowsToSave.length,
                    scope: scopeLabel,
                    date: selectedDate,
                }),
            });
            await loadClassStudentsAndAttendance();
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errSaveAttendance', {
                    message: errMsg,
                }),
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleStudentCheckOut = async (row: StudentRowItem) => {
        if (!row.existingRecordId || !enableStudentCheckOut || !activeSchoolId)
            return;

        if (isActionBlockedByHoliday) {
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
            const formattedClock = formatTimeDisplay(nowIso, timeLocale) ?? '';

            const { error } = await supabase
                .from('attendances')
                .update({ checkOutTime: nowIso })
                .eq('id', row.existingRecordId)
                .eq('schoolId', activeSchoolId);

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
                text: t('studentClassAttendance.toastCheckOutSuccess', {
                    name: row.fullName,
                    time: formattedClock,
                }),
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errCheckOut', {
                    name: row.fullName,
                    message: errMsg,
                }),
            });
        } finally {
            setCheckingOutId(null);
        }
    };

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
                text: t('studentClassAttendance.toastDeleteSuccess', {
                    name: deletedName,
                    date: selectedDate,
                }),
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errDeleteAttendance', {
                    message: errMsg,
                }),
            });
        } finally {
            setIsDeletingRecord(false);
        }
    };

    const handleConfirmActivateSpecialEvent = async () => {
        const resolvedReason =
            specialEventInput.trim() || defaultSpecialEventNote;
        try {
            await holidayLock.activateSpecialEvent(resolvedReason);
            setShowSpecialEventModal(false);
            setSpecialEventInput('');
            setRows((prev) =>
                prev.map((row) =>
                    row.notes.trim()
                        ? row
                        : {
                            ...row,
                            notes: resolvedReason,
                            isDirty: row.isDirty || row.status !== null,
                        }
                )
            );
            setMessage({
                status: 'success',
                text: t('studentClassAttendance.toastSpecialActivated', {
                    reason: resolvedReason,
                }),
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errActivateSpecial', {
                    message: errMsg,
                }),
            });
        }
    };

    const handleDeactivateSpecialEvent = async () => {
        try {
            await holidayLock.deactivateSpecialEvent();
            setRows((prev) =>
                prev.map((row) =>
                    !row.existingRecordId && row.notes === specialEventNote
                        ? { ...row, notes: '' }
                        : row
                )
            );
            setMessage({
                status: 'success',
                text: t('studentClassAttendance.toastSpecialDeactivated'),
            });
        } catch (err: unknown) {
            const { message: errMsg } = getErrorInfo(
                err,
                t('studentClassAttendance.errGenericProcess'),
                t('studentClassAttendance.errUnexpected')
            );
            setMessage({
                status: 'error',
                text: t('studentClassAttendance.errDeactivateSpecial', {
                    message: errMsg,
                }),
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
                ? STATUS_OPTIONS.find((opt) => opt.value === deleteTarget.status) ??
                null
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
                        <span>{t('studentClassAttendance.superAdminSimLabel')}</span>
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
                        {t('studentClassAttendance.pageTitle')}
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">
                        {t('studentClassAttendance.pageSubtitle')}
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
                                    ? t('studentClassAttendance.btnLockingHoliday')
                                    : t('studentClassAttendance.btnLockHolidayAgain')}
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowSpecialEventModal(true)}
                                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-border bg-card hover:bg-muted/80 text-foreground transition-all cursor-pointer"
                            >
                                <Sparkles size={14} className="text-amber-500" />
                                {t('studentClassAttendance.btnOpenSpecialEvent')}
                            </button>
                        ))}

                    <button
                        type="button"
                        onClick={handleMarkAllHadir}
                        disabled={
                            isActionBlockedByHoliday ||
                            isLoadingRows ||
                            rows.length === 0 ||
                            summary.belum === 0
                        }
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold border border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50 transition-all cursor-pointer"
                    >
                        <CheckCheck size={15} />
                        {t('studentClassAttendance.btnMarkAllHadir', {
                            count: summary.belum,
                        })}
                    </button>

                    <button
                        type="button"
                        onClick={() => void handleSaveAll()}
                        disabled={
                            isActionBlockedByHoliday || isSaving || summary.dirtyCount === 0
                        }
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                    >
                        {isSaving ? (
                            <Loader2 size={15} className="animate-spin" />
                        ) : (
                            <Save size={15} />
                        )}
                        {isSaving
                            ? t('studentClassAttendance.btnSaving')
                            : t('studentClassAttendance.btnSaveAttendance', {
                                count: summary.dirtyCount,
                            })}
                    </button>
                </div>
            </div>

            {/* Banner Status Hari Libur / Kegiatan Khusus */}
            {holidayLock.isLocked ? (
                <div className="p-4 rounded-xl border border-amber-500/50 bg-amber-500/15 text-amber-900 dark:text-amber-100 flex items-start gap-3">
                    <CalendarOff size={20} className="text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs space-y-1">
                        <p className="font-bold text-sm">
                            {t('studentClassAttendance.holidayBannerTitle', {
                                holiday:
                                    holidayLock.holidayName ||
                                    t('studentClassAttendance.defaultHolidayName'),
                            })}
                        </p>
                        <p className="opacity-90 leading-relaxed">
                            {t('studentClassAttendance.holidayBannerDescPrefix')}
                            <strong>{selectedDate}</strong>
                            {t('studentClassAttendance.holidayBannerDescSuffix')}
                        </p>
                    </div>
                </div>
            ) : (
                isSpecialEventMode && (
                    <div className="p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 flex items-center gap-2.5 text-xs">
                        <Unlock size={17} className="text-emerald-600 shrink-0" />
                        <span>
                            <strong>
                                {t('studentClassAttendance.specialEventBannerPrefix')}
                            </strong>{' '}
                            {specialEventNote}{' '}
                            {t('studentClassAttendance.specialEventBannerHolidayRef', {
                                holiday: holidayLock.holidayName,
                            })}
                        </span>
                    </div>
                )
            )}

            {!enableClassAttendance && (
                <div className="p-3.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 text-xs flex items-center gap-2">
                    <Info size={16} className="shrink-0" />
                    <span>{t('studentClassAttendance.disabledMethodBanner')}</span>
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
                        {t('studentClassAttendance.labelAttendanceDate')}
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
                        {t('studentClassAttendance.labelSelectClass')}
                    </label>
                    <select
                        value={selectedClassId}
                        onChange={(e) => setSelectedClassId(e.target.value)}
                        disabled={isLoadingClasses || classesList.length === 0}
                        className="form-input w-full text-xs font-semibold"
                    >
                        {classesList.length === 0 ? (
                            <option value="">
                                {t('studentClassAttendance.noClassesOption')}
                            </option>
                        ) : (
                            <>
                                {!isHomeroomRestricted && (
                                    <option value="ALL">
                                        {t('studentClassAttendance.allClassesOption')}
                                    </option>
                                )}
                                {classesList.map((cls) => (
                                    <option key={cls.id} value={cls.id}>
                                        {t('studentClassAttendance.classOptionPrefix', {
                                            name: cls.name,
                                        })}
                                    </option>
                                ))}
                            </>
                        )}
                    </select>
                </div>

                {/* Flex Input Wrapper: Ikon Search Anti-Tumpuk */}
                <div className="flex-1 min-w-60">
                    <label className="text-[11px] font-semibold block mb-1">
                        {t('studentClassAttendance.labelSearchStudent')}
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
                            placeholder={t('studentClassAttendance.searchPlaceholder')}
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
                                title={t('studentClassAttendance.titleClearSearch')}
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
                    <p className="text-[11px] opacity-65">
                        {t('studentClassAttendance.statTotalStudents')}
                    </p>
                    <p className="text-xl font-bold mt-0.5">{summary.total}</p>
                </div>
                <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
                    <p className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        {t('studentClassAttendance.statPresent')}
                    </p>
                    <p className="text-xl font-bold text-emerald-600 mt-0.5">
                        {summary.hadir}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5">
                    <p className="text-[11px] text-amber-700 dark:text-amber-300">
                        {t('studentClassAttendance.statLate')}
                    </p>
                    <p className="text-xl font-bold text-amber-600 mt-0.5">
                        {summary.terlambat}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-blue-500/30 bg-blue-500/5">
                    <p className="text-[11px] text-blue-700 dark:text-blue-300">
                        {t('studentClassAttendance.statPermission')}
                    </p>
                    <p className="text-xl font-bold text-blue-600 mt-0.5">
                        {summary.izin}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-purple-500/30 bg-purple-500/5">
                    <p className="text-[11px] text-purple-700 dark:text-purple-300">
                        {t('studentClassAttendance.statSick')}
                    </p>
                    <p className="text-xl font-bold text-purple-600 mt-0.5">
                        {summary.sakit}
                    </p>
                </div>
                <div className="p-3 rounded-xl border border-red-500/30 bg-red-500/5">
                    <p className="text-[11px] text-red-700 dark:text-red-300">
                        {t('studentClassAttendance.statAlpha')}
                    </p>
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
                                <th className="py-3 px-3 w-10 text-center font-semibold">
                                    {t('studentClassAttendance.colNo')}
                                </th>
                                <th className="py-3 px-3 font-semibold min-w-44">
                                    {t('studentClassAttendance.colStudentName')}
                                </th>
                                <th className="py-3 px-3 font-semibold min-w-64">
                                    {t('studentClassAttendance.colAttendanceStatus')}
                                </th>
                                <th className="py-3 px-3 font-semibold">
                                    {t('studentClassAttendance.colCheckInTime')}
                                </th>
                                {enableStudentCheckOut && (
                                    <th className="py-3 px-3 font-semibold">
                                        {t('studentClassAttendance.colCheckOutTime')}
                                    </th>
                                )}
                                <th className="py-3 px-3 font-semibold min-w-40">
                                    {t('studentClassAttendance.colNotes')}
                                </th>
                                {canDeleteAttendance && (
                                    <th className="py-3 px-3 text-center font-semibold w-24">
                                        {t('studentClassAttendance.colActions')}
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
                                            {t('studentClassAttendance.loadingStudents', {
                                                className: selectedClassName,
                                            })}
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
                                            ? t('studentClassAttendance.emptyNoClasses')
                                            : t('studentClassAttendance.emptyNoFilteredStudents')}
                                    </td>
                                </tr>
                            ) : (
                                paginatedRows.map((row, idx) => {
                                    const rowNumber =
                                        pageSize === 0
                                            ? idx + 1
                                            : (safeCurrentPage - 1) * pageSize + idx + 1;
                                    const formattedIn = formatTimeDisplay(
                                        row.checkInTime,
                                        timeLocale
                                    );
                                    const formattedOut = formatTimeDisplay(
                                        row.checkOutTime,
                                        timeLocale
                                    );
                                    const canCheckOut =
                                        enableStudentCheckOut &&
                                        !isActionBlockedByHoliday &&
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
                                                            {t('studentClassAttendance.classBadgeTag', {
                                                                name: row.className,
                                                            })}
                                                        </span>
                                                    )}
                                                    {row.nisn
                                                        ? `NISN: ${row.nisn}`
                                                        : row.nis
                                                            ? `NIS: ${row.nis}`
                                                            : t('studentClassAttendance.classOptionPrefix', {
                                                                name: row.className,
                                                            })}
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
                                                                disabled={isActionBlockedByHoliday}
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
                                                                <span>{getStatusLabel(opt.value)}</span>
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
                                                            {t('studentClassAttendance.btnCheckOut')}
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
                                                    disabled={isActionBlockedByHoliday}
                                                    onChange={(e) =>
                                                        handleSetStudentNote(row.studentId, e.target.value)
                                                    }
                                                    placeholder={
                                                        isSpecialEventMode
                                                            ? specialEventNote
                                                            : t(
                                                                'studentClassAttendance.notesPlaceholderDefault'
                                                            )
                                                    }
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
                                                            title={t(
                                                                'studentClassAttendance.titleDeleteRecord'
                                                            )}
                                                        >
                                                            <Trash2 size={12} />
                                                            <span>
                                                                {t('studentClassAttendance.btnDeleteRecord')}
                                                            </span>
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
                                {t('studentClassAttendance.paginationShowingPrefix')}
                                <strong>{startItemNumber}</strong>–
                                <strong>{endItemNumber}</strong>
                                {t('studentClassAttendance.paginationShowingMid')}
                                <strong>{filteredRows.length}</strong>
                                {t('studentClassAttendance.paginationShowingSuffix')}
                            </span>
                            <select
                                value={pageSize}
                                onChange={(e) => {
                                    setPageSize(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                aria-label={t('studentClassAttendance.ariaPageSize')}
                                className="form-input w-auto! text-xs py-1 px-2 bg-card font-medium"
                            >
                                {STUDENT_PAGE_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>
                                        {opt === 0
                                            ? t('studentClassAttendance.showAllOption')
                                            : t('studentClassAttendance.perPageOption', {
                                                count: opt,
                                            })}
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
                                    {t('studentClassAttendance.btnPrevPage')}
                                </button>

                                <span className="px-2.5 py-1 font-mono font-semibold text-foreground">
                                    {t('studentClassAttendance.pageIndicator', {
                                        current: safeCurrentPage,
                                        total: totalPages,
                                    })}
                                </span>

                                <button
                                    type="button"
                                    disabled={safeCurrentPage >= totalPages}
                                    onClick={() =>
                                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                >
                                    {t('studentClassAttendance.btnNextPage')}
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
                                        {t('studentClassAttendance.modalDeleteTitle')}
                                    </h3>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        {t('studentClassAttendance.modalDeleteSubtitle')}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                disabled={isDeletingRecord}
                                onClick={() => setDeleteTarget(null)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition cursor-pointer disabled:opacity-40"
                                aria-label={t('studentClassAttendance.ariaCloseDialog')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="p-3.5 rounded-xl border border-border bg-muted/40 space-y-2 text-xs">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">
                                    {t('studentClassAttendance.modalFieldStudentName')}
                                </span>
                                <span className="font-bold text-foreground text-right">
                                    {deleteTarget.fullName}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">
                                    {t('studentClassAttendance.modalFieldClassNisn')}
                                </span>
                                <span className="font-mono text-foreground">
                                    {deleteTarget.className}
                                    {deleteTarget.nisn ? ` • ${deleteTarget.nisn}` : ''}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-muted-foreground">
                                    {t('studentClassAttendance.modalFieldDate')}
                                </span>
                                <span className="font-mono font-semibold text-foreground">
                                    {selectedDate}
                                </span>
                            </div>
                            {deleteTargetStatusOption && (
                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/60">
                                    <span className="text-muted-foreground">
                                        {t('studentClassAttendance.modalFieldSavedStatus')}
                                    </span>
                                    <span
                                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${deleteTargetStatusOption.badgeClass}`}
                                    >
                                        <deleteTargetStatusOption.icon size={11} />
                                        {getStatusLabel(deleteTargetStatusOption.value)}
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
                                {t('studentClassAttendance.btnCancel')}
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
                                {isDeletingRecord
                                    ? t('studentClassAttendance.btnDeleting')
                                    : t('studentClassAttendance.btnConfirmDelete')}
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
                            {t('studentClassAttendance.modalSpecialTitle')}
                        </h3>
                        <p className="text-xs text-muted-foreground">
                            {t('studentClassAttendance.modalSpecialDescPrefix')}
                            <strong>{selectedDate}</strong>
                            {t('studentClassAttendance.modalSpecialDescSuffix')}
                        </p>
                        <div>
                            <label className="text-xs font-semibold block mb-1">
                                {t('studentClassAttendance.modalSpecialInputLabel')}
                            </label>
                            <input
                                type="text"
                                value={specialEventInput}
                                onChange={(e) => setSpecialEventInput(e.target.value)}
                                placeholder={t(
                                    'studentClassAttendance.modalSpecialInputPlaceholder',
                                    { defaultNote: defaultSpecialEventNote }
                                )}
                                className="form-input w-full text-xs"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowSpecialEventModal(false)}
                                className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-border hover:bg-muted cursor-pointer"
                            >
                                {t('studentClassAttendance.btnCancel')}
                            </button>
                            <button
                                type="button"
                                disabled={holidayLock.isToggling}
                                onClick={() => void handleConfirmActivateSpecialEvent()}
                                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50 cursor-pointer"
                            >
                                {holidayLock.isToggling
                                    ? t('studentClassAttendance.btnSavingModal')
                                    : t('studentClassAttendance.btnActivateSpecialEvent')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}