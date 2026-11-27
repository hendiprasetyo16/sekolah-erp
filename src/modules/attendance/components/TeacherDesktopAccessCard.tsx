// src/modules/attendance/components/TeacherDesktopAccessCard.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Monitor,
    Smartphone,
    Search,
    Users,
    RefreshCw,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
    ChevronLeft,
    ChevronRight,
    Briefcase,
    BadgeCheck,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useTranslation } from '@/hooks/useTranslation';

// ============================================================================
// PARAMETER KONFIGURASI TAMPILAN, BADGE & PAGINATION
// ============================================================================
const DEFAULT_LIST_EXPANDED = true;
const DEFAULT_TEACHER_PAGE_SIZE = 10;
const TEACHER_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

// Tampilkan badge status keaktifan (misal: Aktif / Non-Aktif) selain status kepegawaian
const SHOW_ACTIVE_STATUS_BADGE = true;

// Kata kunci jabatan/tugas tambahan yang diberi warna sorotan khusus
const HIGHLIGHT_DUTY_KEYWORDS = [
    'kepala sekolah',
    'wakil kepala',
    'wakasek',
    'bendahara',
    'operator',
    'kepala lab',
    'kepala perpustakaan',
] as const;

// ============================================================================
// TIPE DATA STRICT (TANPA `any`)
// ============================================================================
export interface TeacherDesktopAccessItem {
    id: string;
    fullName: string;
    nip: string | null;
    additionalDuties: string[];
    employmentStatus: string | null;
    activeStatus: string | null;
    allowDesktopAttendance: boolean;
}

export interface TeacherDesktopAccessCardProps {
    schoolId: string;
}

type FilterMode = 'ALL' | 'ALLOWED' | 'BLOCKED';

interface FeedbackState {
    status: 'success' | 'error';
    text: string;
}

interface RawSchoolDesktopRow {
    allowDesktopAttendanceGlobal: boolean | null;
}

interface RawUserRoleRow {
    id: string;
    role: string | null;
}

function getErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    if (typeof error === 'object' && error !== null) {
        const record = error as Record<string, unknown>;
        if (typeof record.message === 'string' && record.message.trim().length > 0) {
            return record.message;
        }
    }
    return fallback;
}

function isMissingColumnError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const record = error as Record<string, unknown>;
    const code = typeof record.code === 'string' ? record.code : '';
    const message =
        typeof record.message === 'string' ? record.message.toLowerCase() : '';

    return (
        code === 'PGRST204' ||
        code === '42703' ||
        message.includes('schema cache') ||
        (message.includes('column') && message.includes('does not exist'))
    );
}

function parseDutyValues(raw: unknown): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) {
        return raw
            .filter((item): item is string => typeof item === 'string')
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && item !== '-');
    }
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed || trimmed === '-') return [];
        return trimmed
            .split(/[,;|]+/)
            .map((part) => part.trim())
            .filter((part) => part.length > 0 && part !== '-');
    }
    return [];
}

function extractAdditionalDuties(
    row: Record<string, unknown>,
    linkedUserRole?: string | null
): string[] {
    const candidateKeys = [
        'additionalDuty',
        'additionalDuties',
        'tugasTambahan',
        'tugas_tambahan',
        'position',
        'jabatan',
        'ptkType',
        'jenisPtk',
        'jenis_ptk',
    ];

    const collected: string[] = [];

    if (linkedUserRole === 'KEPALA_SEKOLAH') {
        collected.push('Kepala Sekolah');
    }

    for (const key of candidateKeys) {
        const parsed = parseDutyValues(row[key]);
        for (const duty of parsed) {
            const alreadyExists = collected.some(
                (existing) => existing.toLowerCase() === duty.toLowerCase()
            );
            if (!alreadyExists) {
                collected.push(duty);
            }
        }
    }

    return collected;
}

function extractTeacherStatuses(row: Record<string, unknown>): {
    employmentStatus: string | null;
    activeStatus: string | null;
} {
    const employmentKeys = [
        'employmentStatus',
        'statusKepegawaian',
        'status_kepegawaian',
        'ptkStatus',
        'teacherStatus',
    ];

    let employmentStatus: string | null = null;
    for (const key of employmentKeys) {
        const val = row[key];
        if (typeof val === 'string' && val.trim().length > 0 && val.trim() !== '-') {
            employmentStatus = val.trim();
            break;
        }
    }

    let activeStatus: string | null = null;
    const rawStatus = row.status ?? row.activeStatus ?? row.statusAktif;
    if (typeof rawStatus === 'string' && rawStatus.trim().length > 0) {
        const upper = rawStatus.trim().toUpperCase();
        if (upper === 'ACTIVE' || upper === 'AKTIF') {
            activeStatus = 'Aktif';
        } else if (
            upper === 'INACTIVE' ||
            upper === 'NONAKTIF' ||
            upper === 'NON_AKTIF' ||
            upper === 'NON-AKTIF'
        ) {
            activeStatus = 'Non-Aktif';
        } else {
            activeStatus = rawStatus.trim();
        }
    } else if (typeof row.isActive === 'boolean') {
        activeStatus = row.isActive ? 'Aktif' : 'Non-Aktif';
    } else if (typeof row.is_active === 'boolean') {
        activeStatus = row.is_active ? 'Aktif' : 'Non-Aktif';
    }

    return { employmentStatus, activeStatus };
}

function isHighlightedDuty(duty: string): boolean {
    const lower = duty.toLowerCase();
    return HIGHLIGHT_DUTY_KEYWORDS.some((keyword) => lower.includes(keyword));
}

/**
- Kartu Pengaturan Izin Presensi via Komputer / Laptop (Desktop)
- Mendukung Saklar Global sekolah (termasuk status campuran), Saklar Individual per Guru/PTK,
- informasi Tugas Tambahan & Status Guru, serta Pagination.
 */
export function TeacherDesktopAccessCard({
    schoolId,
}: TeacherDesktopAccessCardProps) {
    const { t } = useTranslation();
    const isEnglish = t('common.language') === 'Language';

    const [allowDesktopGlobal, setAllowDesktopGlobal] = useState<boolean>(false);
    const [teachersList, setTeachersList] = useState<TeacherDesktopAccessItem[]>(
        []
    );
    const [isLoadingTeachers, setIsLoadingTeachers] = useState<boolean>(false);
    const [isUpdatingGlobal, setIsUpdatingGlobal] = useState<boolean>(false);
    const [updatingTeacherIds, setUpdatingTeacherIds] = useState<
        Record<string, boolean>
    >({});

    const [searchQuery, setSearchQuery] = useState<string>('');
    const [filterMode, setFilterMode] = useState<FilterMode>('ALL');
    const [isListExpanded, setIsListExpanded] = useState<boolean>(
        DEFAULT_LIST_EXPANDED
    );
    const [feedback, setFeedback] = useState<FeedbackState | null>(null);

    // State Pagination
    const [currentPage, setCurrentPage] = useState<number>(1);
    const [pageSize, setPageSize] = useState<number>(DEFAULT_TEACHER_PAGE_SIZE);

    const loadTeachersDesktopAccess = useCallback(async () => {
        if (!schoolId) return;
        setIsLoadingTeachers(true);
        setFeedback(null);
        setSearchQuery('');
        setFilterMode('ALL');

        try {
            const [teachersRes, schoolRes, usersRes] = await Promise.all([
                supabase
                    .from('teachers')
                    .select('*')
                    .eq('schoolId', schoolId)
                    .order('fullName', { ascending: true }),
                supabase
                    .from('schools')
                    .select('allowDesktopAttendanceGlobal')
                    .eq('id', schoolId)
                    .maybeSingle(),
                supabase
                    .from('users')
                    .select('id, role')
                    .eq('schoolId', schoolId)
                    .eq('role', 'KEPALA_SEKOLAH'),
            ]);

            if (teachersRes.error) throw teachersRes.error;
            if (schoolRes.error && !isMissingColumnError(schoolRes.error)) {
                throw schoolRes.error;
            }

            const userRoleMap = new Map<string, string>();
            if (!usersRes.error && Array.isArray(usersRes.data)) {
                for (const u of usersRes.data as RawUserRoleRow[]) {
                    if (u.id && u.role) {
                        userRoleMap.set(String(u.id), String(u.role));
                    }
                }
            }

            const rawTeachers = (teachersRes.data ?? []) as Record<
                string,
                unknown
            >[];

            const mapped: TeacherDesktopAccessItem[] = rawTeachers.map((row) => {
                const rawName =
                    typeof row.fullName === 'string'
                        ? row.fullName
                        : typeof row.name === 'string'
                            ? row.name
                            : '';
                const rawNip = typeof row.nip === 'string' ? row.nip.trim() : '';
                const linkedUserId =
                    typeof row.userId === 'string'
                        ? row.userId
                        : typeof row.user_id === 'string'
                            ? row.user_id
                            : null;
                const linkedRole = linkedUserId
                    ? userRoleMap.get(String(linkedUserId)) ?? null
                    : null;

                const additionalDuties = extractAdditionalDuties(row, linkedRole);
                const { employmentStatus, activeStatus } =
                    extractTeacherStatuses(row);

                return {
                    id: String(row.id ?? ''),
                    fullName:
                        rawName.trim().length > 0
                            ? rawName.trim()
                            : t('attendanceSettings.unnamedTeacher'),
                    nip: rawNip.length > 0 ? rawNip : null,
                    additionalDuties,
                    employmentStatus,
                    activeStatus,
                    allowDesktopAttendance: Boolean(row.allowDesktopAttendance),
                };
            });

            setTeachersList(mapped);
            setCurrentPage(1);

            const schoolRow = schoolRes.data as RawSchoolDesktopRow | null;
            if (
                mapped.length > 0 &&
                mapped.every((teacher) => teacher.allowDesktopAttendance)
            ) {
                setAllowDesktopGlobal(true);
            } else if (
                mapped.length > 0 &&
                mapped.every((teacher) => !teacher.allowDesktopAttendance)
            ) {
                setAllowDesktopGlobal(false);
            } else if (typeof schoolRow?.allowDesktopAttendanceGlobal === 'boolean') {
                setAllowDesktopGlobal(schoolRow.allowDesktopAttendanceGlobal);
            } else {
                setAllowDesktopGlobal(false);
            }
        } catch (err: unknown) {
            setFeedback({
                status: 'error',
                text: getErrorMessage(err, t('attendanceSettings.errLoadTeachers')),
            });
        } finally {
            setIsLoadingTeachers(false);
        }
    }, [schoolId, t]);

    useEffect(() => {
        void loadTeachersDesktopAccess();
    }, [loadTeachersDesktopAccess]);

    const allowedCount = useMemo(
        () => teachersList.filter((teacher) => teacher.allowDesktopAttendance).length,
        [teachersList]
    );

    const isAllAllowed =
        teachersList.length > 0 && allowedCount === teachersList.length;
    const isMixedState =
        teachersList.length > 0 &&
        allowedCount > 0 &&
        allowedCount < teachersList.length;
    const effectiveGlobalActive =
        isAllAllowed || (teachersList.length === 0 && allowDesktopGlobal);

    const handleToggleGlobal = async () => {
        if (!schoolId || isUpdatingGlobal) return;
        const nextAllow = !effectiveGlobalActive;
        setIsUpdatingGlobal(true);
        setFeedback(null);

        try {
            const { error: rpcError } = await supabase.rpc(
                'set_school_desktop_attendance_global',
                {
                    p_school_id: schoolId,
                    p_allow: nextAllow,
                }
            );

            if (rpcError) {
                const { error: teachersErr } = await supabase
                    .from('teachers')
                    .update({ allowDesktopAttendance: nextAllow })
                    .eq('schoolId', schoolId);

                if (teachersErr) throw teachersErr;

                const { error: schoolErr } = await supabase
                    .from('schools')
                    .update({ allowDesktopAttendanceGlobal: nextAllow })
                    .eq('id', schoolId);

                if (schoolErr && !isMissingColumnError(schoolErr)) {
                    throw schoolErr;
                }
            }

            setAllowDesktopGlobal(nextAllow);
            setTeachersList((prev) =>
                prev.map((teacher) => ({
                    ...teacher,
                    allowDesktopAttendance: nextAllow,
                }))
            );

            setFeedback({
                status: 'success',
                text: nextAllow
                    ? t('attendanceSettings.feedbackGlobalDesktopOn', {
                        count: teachersList.length,
                    })
                    : t('attendanceSettings.feedbackGlobalDesktopOff'),
            });
        } catch (err: unknown) {
            setFeedback({
                status: 'error',
                text: getErrorMessage(
                    err,
                    t('attendanceSettings.errToggleGlobalDesktop')
                ),
            });
        } finally {
            setIsUpdatingGlobal(false);
        }
    };

    const handleToggleSingleTeacher = async (
        teacher: TeacherDesktopAccessItem
    ) => {
        if (!schoolId || updatingTeacherIds[teacher.id]) return;
        const nextAllow = !teacher.allowDesktopAttendance;

        setUpdatingTeacherIds((prev) => ({ ...prev, [teacher.id]: true }));
        setFeedback(null);

        try {
            const { error: rpcError } = await supabase.rpc(
                'set_teacher_desktop_attendance',
                {
                    p_teacher_id: teacher.id,
                    p_allow: nextAllow,
                }
            );

            if (rpcError) {
                const { error: updErr } = await supabase
                    .from('teachers')
                    .update({ allowDesktopAttendance: nextAllow })
                    .eq('id', teacher.id)
                    .eq('schoolId', schoolId);
                if (updErr) throw updErr;
            }

            setTeachersList((prev) => {
                const updated = prev.map((item) =>
                    item.id === teacher.id
                        ? { ...item, allowDesktopAttendance: nextAllow }
                        : item
                );
                const allAllowed =
                    updated.length > 0 &&
                    updated.every((item) => item.allowDesktopAttendance);
                setAllowDesktopGlobal(allAllowed);
                return updated;
            });

            setFeedback({
                status: 'success',
                text: nextAllow
                    ? t('attendanceSettings.feedbackSingleDesktopOn', {
                        name: teacher.fullName,
                    })
                    : t('attendanceSettings.feedbackSingleDesktopOff', {
                        name: teacher.fullName,
                    }),
            });
        } catch (err: unknown) {
            setFeedback({
                status: 'error',
                text: getErrorMessage(
                    err,
                    t('attendanceSettings.errToggleSingleDesktop', {
                        name: teacher.fullName,
                    })
                ),
            });
        } finally {
            setUpdatingTeacherIds((prev) => {
                const nextMap = { ...prev };
                delete nextMap[teacher.id];
                return nextMap;
            });
        }
    };

    const filteredTeachers = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();
        return teachersList.filter((teacher) => {
            if (filterMode === 'ALLOWED' && !teacher.allowDesktopAttendance) {
                return false;
            }
            if (filterMode === 'BLOCKED' && teacher.allowDesktopAttendance) {
                return false;
            }
            if (!keyword) return true;
            const matchName = teacher.fullName.toLowerCase().includes(keyword);
            const matchNip = (teacher.nip ?? '').toLowerCase().includes(keyword);
            const matchDuty = teacher.additionalDuties.some((d) =>
                d.toLowerCase().includes(keyword)
            );
            const matchEmployment = (teacher.employmentStatus ?? '')
                .toLowerCase()
                .includes(keyword);
            const matchActive = (teacher.activeStatus ?? '')
                .toLowerCase()
                .includes(keyword);

            return (
                matchName || matchNip || matchDuty || matchEmployment || matchActive
            );
        });
    }, [teachersList, searchQuery, filterMode]);

    // Kalkulasi Pagination
    const totalPages = Math.max(1, Math.ceil(filteredTeachers.length / pageSize));
    const safeCurrentPage = Math.min(currentPage, totalPages);

    const paginatedTeachers = useMemo(() => {
        const startIdx = (safeCurrentPage - 1) * pageSize;
        return filteredTeachers.slice(startIdx, startIdx + pageSize);
    }, [filteredTeachers, pageSize, safeCurrentPage]);

    const startItemNumber =
        filteredTeachers.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
    const endItemNumber = Math.min(
        safeCurrentPage * pageSize,
        filteredTeachers.length
    );

    if (!schoolId) return null;

    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                        <Monitor size={18} className="text-blue-600" />
                        {t('attendanceSettings.desktopCardTitle')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        {t('attendanceSettings.desktopCardSubtitle')}
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                        <Users size={13} />
                        {t('attendanceSettings.desktopAllowedBadge', {
                            allowed: allowedCount,
                            total: teachersList.length,
                        })}
                    </span>

                    <button
                        type="button"
                        onClick={() => void loadTeachersDesktopAccess()}
                        disabled={isLoadingTeachers}
                        className="p-2 rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
                        title={t('attendanceSettings.titleReloadTeachers')}
                    >
                        <RefreshCw
                            size={14}
                            className={isLoadingTeachers ? 'animate-spin' : ''}
                        />
                    </button>

                    <button
                        type="button"
                        onClick={() => setIsListExpanded((prev) => !prev)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
                        title={
                            isListExpanded
                                ? t('attendanceSettings.titleCollapseTeachers')
                                : t('attendanceSettings.titleExpandTeachers')
                        }
                    >
                        {isListExpanded ? (
                            <>
                                <ChevronUp size={14} />
                                <span className="hidden sm:inline">
                                    {t('attendanceSettings.btnCollapse')}
                                </span>
                            </>
                        ) : (
                            <>
                                <ChevronDown size={14} />
                                <span className="hidden sm:inline">
                                    {t('attendanceSettings.btnTeacherList')}
                                </span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Saklar Global Sekolah (Mendukung Status Campuran / Indeterminate) */}
            <div
                onClick={() => void handleToggleGlobal()}
                role="switch"
                aria-checked={isMixedState ? 'mixed' : effectiveGlobalActive}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleToggleGlobal();
                    }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between gap-4 select-none active:scale-[0.99] ${effectiveGlobalActive
                    ? 'border-blue-600/70 bg-blue-500/10 shadow-2xs'
                    : isMixedState
                        ? 'border-amber-500/60 bg-amber-500/10 shadow-2xs'
                        : 'border-border bg-muted/25 hover:bg-muted/40'
                    } ${isUpdatingGlobal ? 'opacity-70 pointer-events-none' : ''}`}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${effectiveGlobalActive
                            ? 'bg-blue-600 text-white'
                            : isMixedState
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                    >
                        {isUpdatingGlobal ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : effectiveGlobalActive || isMixedState ? (
                            <Monitor size={18} />
                        ) : (
                            <Smartphone size={18} />
                        )}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold">
                                {t('attendanceSettings.globalDesktopTitle')}
                            </span>
                            <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${effectiveGlobalActive
                                    ? 'bg-blue-600 text-white'
                                    : isMixedState
                                        ? 'bg-amber-500 text-white'
                                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                    }`}
                            >
                                {effectiveGlobalActive
                                    ? t('attendanceSettings.globalDesktopBadgeOn')
                                    : isMixedState
                                        ? isEnglish
                                            ? `Partially Active (${allowedCount}/${teachersList.length} Teachers)`
                                            : `Sebagian Aktif (${allowedCount}/${teachersList.length} Guru)`
                                        : t('attendanceSettings.globalDesktopBadgeOff')}
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            {effectiveGlobalActive
                                ? t('attendanceSettings.globalDesktopDescOn')
                                : isMixedState
                                    ? isEnglish
                                        ? 'Desktop attendance is currently configured individually. Click this switch to enable desktop access for all teachers at once.'
                                        : 'Izin presensi desktop saat ini diatur secara khusus per individu. Klik saklar ini untuk mengaktifkan akses desktop bagi seluruh guru sekaligus.'
                                    : t('attendanceSettings.globalDesktopDescOff')}
                        </p>
                    </div>
                </div>

                <span
                    className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${effectiveGlobalActive
                        ? 'bg-blue-600'
                        : isMixedState
                            ? 'bg-amber-500'
                            : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                >
                    <span
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${effectiveGlobalActive
                            ? 'translate-x-6'
                            : isMixedState
                                ? 'translate-x-3'
                                : 'translate-x-0'
                            }`}
                    />
                </span>
            </div>

            {feedback && (
                <div
                    className={`p-2.5 rounded-lg border text-xs font-medium flex items-center gap-2 ${feedback.status === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                        : 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200'
                        }`}
                >
                    {feedback.status === 'success' ? (
                        <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    ) : (
                        <AlertTriangle size={15} className="text-red-600 shrink-0" />
                    )}
                    <span>{feedback.text}</span>
                </div>
            )}

            {isListExpanded && (
                <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                        <div className="flex items-center gap-2 flex-1 min-w-0 rounded-xl border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500/40">
                            <Search
                                size={14}
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
                                placeholder={t('attendanceSettings.searchTeachersPlaceholder')}
                                className="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                            />
                        </div>

                        <div className="inline-flex rounded-xl border border-border bg-muted/60 p-1 gap-1 shrink-0">
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterMode('ALL');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${filterMode === 'ALL'
                                    ? 'bg-card text-foreground shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {t('attendanceSettings.filterAllTeachers', {
                                    count: teachersList.length,
                                })}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterMode('ALLOWED');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${filterMode === 'ALLOWED'
                                    ? 'bg-card text-blue-600 dark:text-blue-300 shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {t('attendanceSettings.filterAllowedTeachers', {
                                    count: allowedCount,
                                })}
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setFilterMode('BLOCKED');
                                    setCurrentPage(1);
                                }}
                                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer ${filterMode === 'BLOCKED'
                                    ? 'bg-card text-foreground shadow-2xs'
                                    : 'text-muted-foreground hover:text-foreground'
                                    }`}
                            >
                                {t('attendanceSettings.filterBlockedTeachers', {
                                    count: teachersList.length - allowedCount,
                                })}
                            </button>
                        </div>
                    </div>

                    {isLoadingTeachers ? (
                        <div className="py-8 text-center text-xs opacity-70 flex items-center justify-center gap-2">
                            <Loader2 size={15} className="animate-spin" />
                            {t('attendanceSettings.loadingTeachers')}
                        </div>
                    ) : paginatedTeachers.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                            {teachersList.length === 0
                                ? t('attendanceSettings.emptyTeachersSchool')
                                : t('attendanceSettings.emptyTeachersSearch')}
                        </div>
                    ) : (
                        <div className="rounded-xl border border-border overflow-hidden">
                            <div className="divide-y divide-border">
                                {paginatedTeachers.map((teacher, idx) => {
                                    const rowNumber =
                                        (safeCurrentPage - 1) * pageSize + idx + 1;
                                    const isBusyRow = Boolean(updatingTeacherIds[teacher.id]);
                                    const isInactive =
                                        teacher.activeStatus?.toLowerCase() === 'non-aktif';
                                    const activeBadgeLabel = isInactive
                                        ? t('attendanceSettings.statusInactiveBadge')
                                        : teacher.activeStatus === 'Aktif'
                                            ? t('attendanceSettings.statusActiveBadge')
                                            : teacher.activeStatus;

                                    return (
                                        <div
                                            key={teacher.id}
                                            className="px-3.5 py-3 flex items-center justify-between gap-3 hover:bg-muted/30 transition text-xs"
                                        >
                                            <div className="flex items-start gap-2.5 min-w-0">
                                                <span className="w-7 text-center font-mono text-[11px] font-bold text-muted-foreground shrink-0 pt-0.5">
                                                    {rowNumber}.
                                                </span>
                                                <div className="min-w-0 space-y-1">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <p className="font-semibold text-foreground">
                                                            {teacher.fullName}
                                                        </p>

                                                        {teacher.employmentStatus && (
                                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 border border-indigo-500/25">
                                                                <BadgeCheck size={10} />
                                                                {teacher.employmentStatus}
                                                            </span>
                                                        )}

                                                        {SHOW_ACTIVE_STATUS_BADGE &&
                                                            activeBadgeLabel && (
                                                                <span
                                                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isInactive
                                                                        ? 'bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/25'
                                                                        : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                                                                        }`}
                                                                >
                                                                    {activeBadgeLabel}
                                                                </span>
                                                            )}
                                                    </div>

                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[11px] text-muted-foreground font-mono">
                                                            {teacher.nip
                                                                ? `NIP: ${teacher.nip}`
                                                                : t('attendanceSettings.noNip')}
                                                        </span>

                                                        {teacher.additionalDuties.map((duty) => {
                                                            const highlighted = isHighlightedDuty(duty);
                                                            return (
                                                                <span
                                                                    key={duty}
                                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${highlighted
                                                                        ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/35'
                                                                        : 'bg-muted text-foreground/80 border-border'
                                                                        }`}
                                                                >
                                                                    <Briefcase size={10} className="shrink-0" />
                                                                    {duty}
                                                                </span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 shrink-0">
                                                <span
                                                    className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${teacher.allowDesktopAttendance
                                                        ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300'
                                                        : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                                                        }`}
                                                >
                                                    {teacher.allowDesktopAttendance ? (
                                                        <>
                                                            <Monitor size={11} />{' '}
                                                            {t('attendanceSettings.badgeDesktopAllowed')}
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Smartphone size={11} />{' '}
                                                            {t('attendanceSettings.badgeMobileOnly')}
                                                        </>
                                                    )}
                                                </span>

                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={teacher.allowDesktopAttendance}
                                                    aria-label={t(
                                                        'attendanceSettings.ariaToggleDesktopFor',
                                                        { name: teacher.fullName }
                                                    )}
                                                    disabled={isBusyRow || isUpdatingGlobal}
                                                    onClick={() =>
                                                        void handleToggleSingleTeacher(teacher)
                                                    }
                                                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center cursor-pointer disabled:opacity-50 ${teacher.allowDesktopAttendance
                                                        ? 'bg-blue-600'
                                                        : 'bg-slate-300 dark:bg-slate-600'
                                                        }`}
                                                >
                                                    <span
                                                        className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform flex items-center justify-center ${teacher.allowDesktopAttendance
                                                            ? 'translate-x-5'
                                                            : 'translate-x-0'
                                                            }`}
                                                    >
                                                        {isBusyRow && (
                                                            <Loader2
                                                                size={11}
                                                                className="animate-spin text-blue-600"
                                                            />
                                                        )}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {/* Footer Kontrol Pagination */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-4 py-2.5 border-t border-border bg-muted/25 text-xs">
                                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                                    <span>
                                        {t('attendanceSettings.showingTeachersRange', {
                                            start: startItemNumber,
                                            end: endItemNumber,
                                            total: filteredTeachers.length,
                                        })}
                                    </span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        aria-label={t('attendanceSettings.ariaPageSize')}
                                        className="form-input w-auto! text-xs py-1 px-2 bg-card font-medium"
                                    >
                                        {TEACHER_PAGE_SIZE_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {t('attendanceSettings.perPageOption', { count: opt })}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {totalPages > 1 && (
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            disabled={safeCurrentPage <= 1}
                                            onClick={() =>
                                                setCurrentPage((p) => Math.max(1, p - 1))
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                        >
                                            <ChevronLeft size={14} />
                                            {t('attendanceSettings.btnPrevPage')}
                                        </button>

                                        <span className="px-2 py-1 font-mono font-semibold text-foreground">
                                            {t('attendanceSettings.pageIndicator', {
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
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                        >
                                            {t('attendanceSettings.btnNextPage')}
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}