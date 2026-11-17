// D:\APLIKASI\sekolah-erp\src\modules\attendance\components\DesktopAttendancePermissionPanel.tsx
// src/modules/attendance/components/DesktopAttendancePermissionPanel.tsx
import { useState, useEffect, useCallback } from 'react';
import {
    Monitor,
    Smartphone,
    Search,
    ShieldCheck,
    Loader2,
    CheckCircle2,
    AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const ERR_LOAD_TEACHERS = 'Gagal memuat daftar guru.';
const ERR_UPDATE_PERMISSION = 'Gagal memperbarui izin presensi komputer.';

// ============================================================================
// DEFINISI TIPE DATA STRICT (TANPA ANY)
// ============================================================================
interface SchoolOption {
    id: string;
    name: string;
}

interface RawTeacherPermissionRow {
    id: string;
    fullName: string;
    nip?: string | null;
    nuptk?: string | null;
    position?: string | null;
    allowDesktopAttendance?: boolean | null;
}

interface TeacherPermissionRow {
    id: string;
    fullName: string;
    nip?: string | null;
    nuptk?: string | null;
    position?: string | null;
    allowDesktopAttendance: boolean;
}

interface FeedbackBanner {
    type: 'success' | 'error';
    message: string;
}

function extractErrorMessage(error: unknown, fallbackMessage: string): string {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const msg = (error as { message?: unknown }).message;
        if (typeof msg === 'string' && msg.trim().length > 0) {
            return msg;
        }
    }
    return fallbackMessage;
}

export function DesktopAttendancePermissionPanel() {
    const { user, school } = useAuthStore();
    const isSuperAdmin = user?.role === 'SUPER_ADMIN';

    const [schools, setSchools] = useState<SchoolOption[]>([]);
    const [selectedSchoolId, setSelectedSchoolId] = useState<string>(
        school?.id ?? ''
    );
    const [teachers, setTeachers] = useState<TeacherPermissionRow[]>([]);
    const [searchQuery, setSearchQuery] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<FeedbackBanner | null>(null);

    useEffect(() => {
        if (!isSuperAdmin) {
            if (school?.id) setSelectedSchoolId(school.id);
            return;
        }

        supabase
            .from('schools')
            .select('id, name')
            .order('name')
            .then(({ data }) => {
                const list = (data ?? []) as SchoolOption[];
                setSchools(list);
                if (!selectedSchoolId && list.length > 0) {
                    setSelectedSchoolId(list[0].id);
                }
            });
    }, [isSuperAdmin, school?.id, selectedSchoolId]);

    const loadTeachers = useCallback(async () => {
        if (!selectedSchoolId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('teachers')
                .select('id, fullName, nip, nuptk, position, allowDesktopAttendance')
                .eq('schoolId', selectedSchoolId)
                .eq('isActive', true)
                .order('fullName');

            if (error) throw error;

            const rows = (data ?? []) as RawTeacherPermissionRow[];
            setTeachers(
                rows.map(
                    (row): TeacherPermissionRow => ({
                        id: row.id,
                        fullName: row.fullName,
                        nip: row.nip ?? null,
                        nuptk: row.nuptk ?? null,
                        position: row.position ?? null,
                        allowDesktopAttendance: Boolean(row.allowDesktopAttendance),
                    })
                )
            );
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: extractErrorMessage(err, ERR_LOAD_TEACHERS),
            });
        } finally {
            setIsLoading(false);
        }
    }, [selectedSchoolId]);

    useEffect(() => {
        loadTeachers();
    }, [loadTeachers]);

    const handleTogglePermission = async (teacher: TeacherPermissionRow) => {
        if (updatingId) return;
        const nextValue = !teacher.allowDesktopAttendance;
        setUpdatingId(teacher.id);
        setFeedback(null);

        try {
            const { error } = await supabase.rpc('set_teacher_desktop_attendance', {
                p_teacher_id: teacher.id,
                p_allow: nextValue,
            });

            if (error) throw error;

            setTeachers((prev) =>
                prev.map((item) =>
                    item.id === teacher.id
                        ? { ...item, allowDesktopAttendance: nextValue }
                        : item
                )
            );

            setFeedback({
                type: 'success',
                message: nextValue
                    ? `Izin presensi komputer DIAKTIFKAN untuk ${teacher.fullName}.`
                    : `Izin presensi komputer DIMATIKAN untuk ${teacher.fullName} (Wajib HP).`,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                message: extractErrorMessage(err, ERR_UPDATE_PERMISSION),
            });
        } finally {
            setUpdatingId(null);
        }
    };

    const filteredTeachers = teachers.filter((t) => {
        const q = searchQuery.toLowerCase().trim();
        if (!q) return true;
        return (
            t.fullName.toLowerCase().includes(q) ||
            (t.nip ?? '').toLowerCase().includes(q) ||
            (t.position ?? '').toLowerCase().includes(q)
        );
    });

    const allowedCount = teachers.filter((t) => t.allowDesktopAttendance).length;

    return (
        <div className="data-card space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
                <div>
                    <h3 className="text-sm font-bold flex items-center gap-2">
                        <Monitor size={17} className="text-primary" />
                        Izin Presensi Melalui Komputer / Laptop (Pengecualian Guru)
                    </h3>
                    <p className="text-xs opacity-70 mt-0.5">
                        Secara bawaan, guru wajib presensi lewat HP / APK Android. Aktifkan
                        izin komputer khusus bagi guru sepuh atau guru yang membutuhkan.
                    </p>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-primary">
                    {allowedCount} dari {teachers.length} Guru Diizinkan
                </span>
            </div>

            {feedback && (
                <div
                    className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${feedback.type === 'success'
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                        }`}
                >
                    {feedback.type === 'success' ? (
                        <CheckCircle2 size={15} className="shrink-0" />
                    ) : (
                        <AlertTriangle size={15} className="shrink-0" />
                    )}
                    <span>{feedback.message}</span>
                </div>
            )}

            <div className="flex flex-wrap gap-2.5">
                {isSuperAdmin && (
                    <select
                        value={selectedSchoolId}
                        onChange={(e) => setSelectedSchoolId(e.target.value)}
                        className="form-input text-xs min-w-52"
                    >
                        {schools.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name}
                            </option>
                        ))}
                    </select>
                )}

                <div className="relative flex-1 min-w-52">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50"
                    />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Cari nama guru, NIP, atau jabatan..."
                        className="form-input w-full pl-8 text-xs"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-xs opacity-70">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Memuat data guru...</span>
                </div>
            ) : filteredTeachers.length === 0 ? (
                <p className="text-xs opacity-60 text-center py-6">
                    Tidak ada data guru yang sesuai.
                </p>
            ) : (
                <div className="divide-y divide-border border border-border rounded-2xl overflow-hidden">
                    {filteredTeachers.map((item) => {
                        const isUpdating = updatingId === item.id;
                        return (
                            <div
                                key={item.id}
                                className="p-3 bg-card hover:bg-muted/30 transition flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <div className="font-semibold text-xs truncate">
                                        {item.fullName}
                                    </div>
                                    <div className="text-[11px] opacity-65 truncate">
                                        {item.position || 'Guru / PTK'}
                                        {item.nip ? ` • NIP: ${item.nip}` : ''}
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 shrink-0">
                                    <span
                                        className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${item.allowDesktopAttendance
                                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                                            : 'bg-slate-500/15 text-slate-600 dark:text-slate-300'
                                            }`}
                                    >
                                        {item.allowDesktopAttendance ? (
                                            <>
                                                <ShieldCheck size={11} />
                                                HP & Komputer
                                            </>
                                        ) : (
                                            <>
                                                <Smartphone size={11} />
                                                Khusus HP
                                            </>
                                        )}
                                    </span>

                                    <button
                                        type="button"
                                        disabled={isUpdating}
                                        onClick={() => handleTogglePermission(item)}
                                        aria-label={`Ubah izin komputer untuk ${item.fullName}`}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${item.allowDesktopAttendance
                                            ? 'bg-emerald-600'
                                            : 'bg-slate-300 dark:bg-slate-700'
                                            }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${item.allowDesktopAttendance
                                                ? 'translate-x-6'
                                                : 'translate-x-1'
                                                }`}
                                        />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}