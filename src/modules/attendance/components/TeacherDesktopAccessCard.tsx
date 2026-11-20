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
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';

// ============================================================================
// PARAMETER KONFIGURASI TAMPILAN & PAGINATION
// ============================================================================
const DEFAULT_LIST_EXPANDED = true;
const DEFAULT_TEACHER_PAGE_SIZE = 10;
const TEACHER_PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

// ============================================================================
// TIPE DATA STRICT (TANPA `any`)
// ============================================================================
export interface TeacherDesktopAccessItem {
    id: string;
    fullName: string;
    nip: string | null;
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

interface RawTeacherRow {
    id: string;
    fullName: string | null;
    nip: string | null;
    allowDesktopAttendance: boolean | null;
}

interface RawSchoolDesktopRow {
    allowDesktopAttendanceGlobal: boolean | null;
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
 * Kartu Pengaturan Izin Presensi via Komputer / Laptop (Desktop)
 * Mendukung Saklar Global sekolah, Saklar Individual per Guru/PTK, serta Pagination.
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
            const [teachersRes, schoolRes] = await Promise.all([
                supabase
                    .from('teachers')
                    .select('id, fullName, nip, allowDesktopAttendance')
                    .eq('schoolId', schoolId)
                    .order('fullName', { ascending: true }),
                supabase
                    .from('schools')
                    .select('allowDesktopAttendanceGlobal')
                    .eq('id', schoolId)
                    .maybeSingle(),
            ]);

            if (teachersRes.error) throw teachersRes.error;
            if (schoolRes.error && !isMissingColumnError(schoolRes.error)) {
                throw schoolRes.error;
            }

            const rawTeachers = (teachersRes.data ?? []) as RawTeacherRow[];
            const mapped: TeacherDesktopAccessItem[] = rawTeachers.map((row) => ({
                id: String(row.id),
                fullName:
                    row.fullName && row.fullName.trim().length > 0
                        ? row.fullName
                        : 'Tanpa Nama',
                nip: row.nip && row.nip.trim().length > 0 ? row.nip : null,
                allowDesktopAttendance: Boolean(row.allowDesktopAttendance),
            }));

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
            return matchName || matchNip;
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
                                placeholder="Cari nama Guru/PTK atau NIP..."
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
                                    return (
                                        <div
                                            key={teacher.id}
                                            className="px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-muted/30 transition text-xs"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <span className="w-7 text-center font-mono text-[11px] font-bold text-muted-foreground shrink-0">
                                                    {rowNumber}.
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="font-semibold truncate text-foreground">
                                                        {teacher.fullName}
                                                    </p>
                                                    <p className="text-[11px] text-muted-foreground font-mono truncate">
                                                        {teacher.nip ? `NIP: ${teacher.nip}` : 'Tanpa NIP'}
                                                    </p>
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