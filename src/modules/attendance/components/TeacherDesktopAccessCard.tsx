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

/**
 * Mengubah nilai mentah (string dipisah koma atau array) menjadi daftar string bersih.
 */
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

/**
 * Mengekstrak daftar tugas tambahan / jabatan dari berbagai kemungkinan nama kolom tabel `teachers`
 * serta menyelaraskannya dengan peran sistem (misal KEPALA_SEKOLAH).
 */
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

    // Jika akun user terhubung memiliki role KEPALA_SEKOLAH, pastikan muncul di urutan pertama
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

/**
 * Mengekstrak status kepegawaian (PNS, PPPK, GTY, GTT, Honorer, dll.)
 * dan status keaktifan (Aktif / Non-Aktif) dari baris data guru.
 */
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
 * Kartu Pengaturan Izin Presensi via Komputer / Laptop (Desktop)
 * Mendukung Saklar Global sekolah, Saklar Individual per Guru/PTK,
 * informasi Tugas Tambahan & Status Guru, serta Pagination.
 */
export function TeacherDesktopAccessCard({
    schoolId,
}: TeacherDesktopAccessCardProps) {
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
                    .eq('schoolId', schoolId),
            ]);

            if (teachersRes.error) throw teachersRes.error;
            if (schoolRes.error && !isMissingColumnError(schoolRes.error)) {
                throw schoolRes.error;
            }

            // Peta opsional userId -> role (misal mendeteksi KEPALA_SEKOLAH secara otomatis)
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
                        rawName.trim().length > 0 ? rawName.trim() : 'Tanpa Nama',
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
            if (mapped.length > 0 && mapped.every((t) => t.allowDesktopAttendance)) {
                setAllowDesktopGlobal(true);
            } else if (
                mapped.length > 0 &&
                mapped.every((t) => !t.allowDesktopAttendance)
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
                text: getErrorMessage(err, 'Gagal memuat daftar Guru/PTK.'),
            });
        } finally {
            setIsLoadingTeachers(false);
        }
    }, [schoolId]);

    useEffect(() => {
        void loadTeachersDesktopAccess();
    }, [loadTeachersDesktopAccess]);

    const handleToggleGlobal = async () => {
        if (!schoolId || isUpdatingGlobal) return;
        const nextAllow = !allowDesktopGlobal;
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
                    ? `Saklar Global AKTIF: Seluruh (${teachersList.length}) Guru/PTK kini diizinkan presensi lewat Komputer/Laptop.`
                    : 'Saklar Global NONAKTIF: Seluruh Guru/PTK kini wajib presensi lewat HP (kecuali diaktifkan per guru di bawah).',
            });
        } catch (err: unknown) {
            setFeedback({
                status: 'error',
                text: getErrorMessage(
                    err,
                    'Gagal mengubah pengaturan global presensi komputer.'
                ),
            });
        } finally {
            setIsUpdatingGlobal(false);
        }
    };

    const handleToggleSingleTeacher = async (
        teacher: TeacherDesktopAccessItem
    ) => {
        if (updatingTeacherIds[teacher.id]) return;
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
                    .eq('id', teacher.id);
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
                    ? `Izin Komputer DIAKTIFKAN untuk ${teacher.fullName}.`
                    : `Izin Komputer DIMATIKAN untuk ${teacher.fullName} (wajib lewat HP).`,
            });
        } catch (err: unknown) {
            setFeedback({
                status: 'error',
                text: getErrorMessage(
                    err,
                    `Gagal mengubah izin untuk ${teacher.fullName}.`
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

    const allowedCount = useMemo(
        () => teachersList.filter((t) => t.allowDesktopAttendance).length,
        [teachersList]
    );

    const filteredTeachers = useMemo(() => {
        const keyword = searchQuery.trim().toLowerCase();
        return teachersList.filter((t) => {
            if (filterMode === 'ALLOWED' && !t.allowDesktopAttendance) {
                return false;
            }
            if (filterMode === 'BLOCKED' && t.allowDesktopAttendance) {
                return false;
            }
            if (!keyword) return true;
            const matchName = t.fullName.toLowerCase().includes(keyword);
            const matchNip = (t.nip ?? '').toLowerCase().includes(keyword);
            const matchDuty = t.additionalDuties.some((d) =>
                d.toLowerCase().includes(keyword)
            );
            const matchEmployment = (t.employmentStatus ?? '')
                .toLowerCase()
                .includes(keyword);
            const matchActive = (t.activeStatus ?? '')
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
                        Izin Akses Presensi via Komputer / Laptop (Desktop)
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Secara bawaan, Guru/PTK melakukan presensi lewat HP. Gunakan saklar
                        di bawah untuk mengizinkan akses komputer secara global atau khusus
                        guru tertentu.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/25">
                        <Users size={13} />
                        {allowedCount} / {teachersList.length} Diizinkan
                    </span>

                    <button
                        type="button"
                        onClick={() => void loadTeachersDesktopAccess()}
                        disabled={isLoadingTeachers}
                        className="p-2 rounded-xl border border-border bg-card hover:bg-muted/80 text-foreground shadow-2xs active:scale-95 transition-all cursor-pointer"
                        title="Muat ulang daftar Guru/PTK"
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
                                ? 'Sembunyikan daftar per guru'
                                : 'Tampilkan daftar per guru'
                        }
                    >
                        {isListExpanded ? (
                            <>
                                <ChevronUp size={14} />
                                <span className="hidden sm:inline">Ringkas</span>
                            </>
                        ) : (
                            <>
                                <ChevronDown size={14} />
                                <span className="hidden sm:inline">Daftar Guru</span>
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* Saklar Global Sekolah */}
            <div
                onClick={() => void handleToggleGlobal()}
                role="switch"
                aria-checked={allowDesktopGlobal}
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void handleToggleGlobal();
                    }
                }}
                className={`p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-center justify-between gap-4 select-none active:scale-[0.99] ${allowDesktopGlobal
                    ? 'border-blue-600/70 bg-blue-500/10 shadow-2xs'
                    : 'border-border bg-muted/25 hover:bg-muted/40'
                    } ${isUpdatingGlobal ? 'opacity-70 pointer-events-none' : ''}`}
            >
                <div className="flex items-start gap-3">
                    <div
                        className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${allowDesktopGlobal
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                            }`}
                    >
                        {isUpdatingGlobal ? (
                            <Loader2 size={18} className="animate-spin" />
                        ) : allowDesktopGlobal ? (
                            <Monitor size={18} />
                        ) : (
                            <Smartphone size={18} />
                        )}
                    </div>
                    <div>
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold">
                                Saklar Global: Izinkan Semua Guru / PTK Absen via Komputer
                            </span>
                            <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${allowDesktopGlobal
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                                    }`}
                            >
                                {allowDesktopGlobal
                                    ? 'AKTIF (SEMUA BOLEH)'
                                    : 'NONAKTIF (KHUSUS HP)'}
                            </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                            {allowDesktopGlobal
                                ? 'Seluruh Guru/PTK di sekolah ini dapat melakukan presensi dari komputer maupun HP.'
                                : 'Default direkomendasikan: Guru/PTK wajib absen dari HP, kecuali guru yang diaktifkan pada daftar di bawah.'}
                        </p>
                    </div>
                </div>

                <span
                    className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${allowDesktopGlobal
                        ? 'bg-blue-600'
                        : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                >
                    <span
                        className={`w-5 h-5 rounded-full bg-white shadow-sm transform transition-transform ${allowDesktopGlobal ? 'translate-x-6' : 'translate-x-0'
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
                        {/* Flex input wrapper: mencegah ikon search menumpuk dengan teks */}
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
                                placeholder="Cari nama Guru/PTK, NIP, jabatan/tugas tambahan, atau status..."
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
                                Semua ({teachersList.length})
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
                                Boleh Komputer ({allowedCount})
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
                                Wajib HP ({teachersList.length - allowedCount})
                            </button>
                        </div>
                    </div>

                    {isLoadingTeachers ? (
                        <div className="py-8 text-center text-xs opacity-70 flex items-center justify-center gap-2">
                            <Loader2 size={15} className="animate-spin" />
                            Memuat daftar Guru & PTK...
                        </div>
                    ) : paginatedTeachers.length === 0 ? (
                        <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-xl">
                            {teachersList.length === 0
                                ? 'Belum ada data Guru / PTK terdaftar pada sekolah ini.'
                                : 'Tidak ada Guru / PTK yang cocok dengan pencarian Anda.'}
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
                                                    {/* Baris Nama + Status Kepegawaian & Keaktifan */}
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
                                                            teacher.activeStatus && (
                                                                <span
                                                                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${isInactive
                                                                        ? 'bg-red-500/12 text-red-700 dark:text-red-300 border-red-500/25'
                                                                        : 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                                                                        }`}
                                                                >
                                                                    {teacher.activeStatus}
                                                                </span>
                                                            )}
                                                    </div>

                                                    {/* Baris NIP & Lencana Tugas Tambahan / Jabatan */}
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[11px] text-muted-foreground font-mono">
                                                            {teacher.nip
                                                                ? `NIP: ${teacher.nip}`
                                                                : 'Tanpa NIP'}
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
                                                            <Monitor size={11} /> Boleh Komputer
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Smartphone size={11} /> Wajib HP
                                                        </>
                                                    )}
                                                </span>

                                                <button
                                                    type="button"
                                                    role="switch"
                                                    aria-checked={teacher.allowDesktopAttendance}
                                                    aria-label={`Izin komputer untuk ${teacher.fullName}`}
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
                                        Menampilkan <strong>{startItemNumber}</strong>–
                                        <strong>{endItemNumber}</strong> dari{' '}
                                        <strong>{filteredTeachers.length}</strong> Guru/PTK
                                    </span>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => {
                                            setPageSize(Number(e.target.value));
                                            setCurrentPage(1);
                                        }}
                                        aria-label="Jumlah guru per halaman"
                                        className="form-input w-auto! text-xs py-1 px-2 bg-card font-medium"
                                    >
                                        {TEACHER_PAGE_SIZE_OPTIONS.map((opt) => (
                                            <option key={opt} value={opt}>
                                                {opt} / halaman
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
                                            Sebelumnya
                                        </button>

                                        <span className="px-2 py-1 font-mono font-semibold text-foreground">
                                            Hal {safeCurrentPage} / {totalPages}
                                        </span>

                                        <button
                                            type="button"
                                            disabled={safeCurrentPage >= totalPages}
                                            onClick={() =>
                                                setCurrentPage((p) => Math.min(totalPages, p + 1))
                                            }
                                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-border bg-card hover:bg-muted disabled:opacity-40 cursor-pointer font-medium"
                                        >
                                            Berikutnya
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