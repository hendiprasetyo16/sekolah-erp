// src/modules/attendance/components/StudentAttendanceSettingsCard.tsx
import { useState, useEffect, useCallback } from 'react';
import {
    Clock,
    GraduationCap,
    Save,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    QrCode,
    ClipboardList,
    LogOut,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';

// ============================================================================
// PARAMETER DEFAULT KONFIGURASI PRESENSI SISWA
// ============================================================================
const DEFAULT_STUDENT_WORK_START = '07:00';
const DEFAULT_STUDENT_LATE_TOLERANCE = 15;
const DEFAULT_STUDENT_WORK_END = '14:00';
const DEFAULT_STUDENT_CHECKOUT_START = '12:00';

// ============================================================================
// TIPE DATA STRICT (TANPA `any`)
// ============================================================================
export interface StudentAttendanceSettingsCardProps {
    schoolId: string;
    onSaved?: () => void;
}

interface SaveMessageState {
    status: 'success' | 'error';
    text: string;
}

interface RawSchoolStudentSettingsRow {
    studentWorkStartTime: string | null;
    studentLateToleranceMinutes: number | null;
    studentWorkEndTime: string | null;
    studentCheckOutStartTime: string | null;
    enableStudentKiosk: boolean | null;
    enableStudentClassAttendance: boolean | null;
    enableStudentCheckOut: boolean | null;
}

function getErrorDetails(err: unknown): { code: string; message: string } {
    if (typeof err === 'object' && err !== null) {
        const rec = err as Record<string, unknown>;
        return {
            code: typeof rec.code === 'string' ? rec.code : '',
            message:
                typeof rec.message === 'string' && rec.message.trim().length > 0
                    ? rec.message
                    : 'Terjadi kesalahan pada database.',
        };
    }
    if (err instanceof Error) {
        return { code: '', message: err.message };
    }
    return { code: '', message: 'Terjadi kesalahan tidak terduga.' };
}

function isMissingColumnError(err: unknown): boolean {
    const { code, message } = getErrorDetails(err);
    const lower = message.toLowerCase();
    return (
        code === 'PGRST204' ||
        code === '42703' ||
        lower.includes('schema cache') ||
        (lower.includes('column') && lower.includes('does not exist'))
    );
}

/**
 * Kartu Pengaturan Presensi Siswa
 * Mengatur Jam Masuk, Toleransi Terlambat, Jam Mulai Pulang, Jam Pulang,
 * serta Metode Presensi (Kiosk QR/NISN vs Manual Wali Kelas) & Toggle Absen Pulang.
 */
export function StudentAttendanceSettingsCard({
    schoolId,
    onSaved,
}: StudentAttendanceSettingsCardProps) {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [saveMessage, setSaveMessage] = useState<SaveMessageState | null>(null);

    const [studentWorkStartTime, setStudentWorkStartTime] = useState<string>(
        DEFAULT_STUDENT_WORK_START
    );
    const [studentLateToleranceMinutes, setStudentLateToleranceMinutes] =
        useState<number>(DEFAULT_STUDENT_LATE_TOLERANCE);
    const [studentWorkEndTime, setStudentWorkEndTime] = useState<string>(
        DEFAULT_STUDENT_WORK_END
    );
    const [studentCheckOutStartTime, setStudentCheckOutStartTime] =
        useState<string>(DEFAULT_STUDENT_CHECKOUT_START);

    const [enableStudentKiosk, setEnableStudentKiosk] = useState<boolean>(true);
    const [enableStudentClassAttendance, setEnableStudentClassAttendance] =
        useState<boolean>(true);
    const [enableStudentCheckOut, setEnableStudentCheckOut] =
        useState<boolean>(true);

    const loadSettings = useCallback(async () => {
        if (!schoolId) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('schools')
                .select(
                    'studentWorkStartTime, studentLateToleranceMinutes, studentWorkEndTime, studentCheckOutStartTime, enableStudentKiosk, enableStudentClassAttendance, enableStudentCheckOut'
                )
                .eq('id', schoolId)
                .maybeSingle();

            if (error && !isMissingColumnError(error)) {
                throw error;
            }

            const row = data as RawSchoolStudentSettingsRow | null;
            if (row) {
                if (row.studentWorkStartTime) {
                    setStudentWorkStartTime(row.studentWorkStartTime);
                }
                if (typeof row.studentLateToleranceMinutes === 'number') {
                    setStudentLateToleranceMinutes(row.studentLateToleranceMinutes);
                }
                if (row.studentWorkEndTime) {
                    setStudentWorkEndTime(row.studentWorkEndTime);
                }
                if (row.studentCheckOutStartTime) {
                    setStudentCheckOutStartTime(row.studentCheckOutStartTime);
                }
                if (typeof row.enableStudentKiosk === 'boolean') {
                    setEnableStudentKiosk(row.enableStudentKiosk);
                }
                if (typeof row.enableStudentClassAttendance === 'boolean') {
                    setEnableStudentClassAttendance(row.enableStudentClassAttendance);
                }
                if (typeof row.enableStudentCheckOut === 'boolean') {
                    setEnableStudentCheckOut(row.enableStudentCheckOut);
                }
            }
        } catch (err: unknown) {
            const { message } = getErrorDetails(err);
            setSaveMessage({
                status: 'error',
                text: `Gagal memuat pengaturan siswa: ${message}`,
            });
        } finally {
            setIsLoading(false);
        }
    }, [schoolId]);

    useEffect(() => {
        void loadSettings();
    }, [loadSettings]);

    const handleSave = async () => {
        if (!schoolId) return;

        if (!enableStudentKiosk && !enableStudentClassAttendance) {
            setSaveMessage({
                status: 'error',
                text: 'Minimal satu metode presensi siswa (Kiosk atau Manual Wali Kelas) harus diaktifkan.',
            });
            return;
        }

        setIsSaving(true);
        setSaveMessage(null);

        try {
            const payload = {
                studentWorkStartTime:
                    studentWorkStartTime.trim() || DEFAULT_STUDENT_WORK_START,
                studentLateToleranceMinutes: Math.max(
                    0,
                    Number(studentLateToleranceMinutes) || 0
                ),
                studentWorkEndTime:
                    studentWorkEndTime.trim() || DEFAULT_STUDENT_WORK_END,
                studentCheckOutStartTime:
                    studentCheckOutStartTime.trim() || DEFAULT_STUDENT_CHECKOUT_START,
                enableStudentKiosk,
                enableStudentClassAttendance,
                enableStudentCheckOut,
            };

            const { error } = await supabase
                .from('schools')
                .update(payload)
                .eq('id', schoolId);

            if (error) {
                if (isMissingColumnError(error)) {
                    throw new Error(
                        'Kolom pengaturan siswa belum ada di database. Jalankan SQL Migration Patch v20 terlebih dahulu.'
                    );
                }
                throw error;
            }

            setSaveMessage({
                status: 'success',
                text: 'Pengaturan jadwal & metode presensi siswa berhasil disimpan.',
            });
            onSaved?.();
        } catch (err: unknown) {
            const { message } = getErrorDetails(err);
            setSaveMessage({
                status: 'error',
                text: `Gagal menyimpan pengaturan siswa: ${message}`,
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (!schoolId) return null;

    return (
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                        <GraduationCap size={18} className="text-emerald-600" />
                        Pengaturan Jadwal & Metode Presensi Siswa
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Atur jam masuk, batas keterlambatan, jam pulang siswa, serta
                        metode presensi yang digunakan di sekolah.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={isSaving || isLoading}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-60"
                >
                    {isSaving ? (
                        <Loader2 size={14} className="animate-spin" />
                    ) : (
                        <Save size={14} />
                    )}
                    {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Siswa'}
                </button>
            </div>

            {saveMessage && (
                <div
                    className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${saveMessage.status === 'success'
                            ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-800 dark:text-emerald-200'
                            : 'bg-red-500/15 border-red-500/40 text-red-800 dark:text-red-200'
                        }`}
                >
                    {saveMessage.status === 'success' ? (
                        <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    ) : (
                        <AlertTriangle size={16} className="text-red-600 shrink-0" />
                    )}
                    <span>{saveMessage.text}</span>
                </div>
            )}

            {/* Bagian 1: Pengaturan Jam Operasional Siswa */}
            <div className="space-y-2.5">
                <div className="text-xs font-bold flex items-center gap-1.5 text-foreground">
                    <Clock size={14} className="text-emerald-600" />
                    <span>Jadwal Jam Masuk & Pulang Siswa</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                        <label className="text-[11px] font-semibold block mb-1">
                            Jam Masuk Siswa
                        </label>
                        <input
                            type="time"
                            value={studentWorkStartTime}
                            onChange={(e) => setStudentWorkStartTime(e.target.value)}
                            className="form-input w-full text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            Default: 07:00
                        </span>
                    </div>

                    <div>
                        <label className="text-[11px] font-semibold block mb-1">
                            Toleransi Terlambat (Menit)
                        </label>
                        <input
                            type="number"
                            min={0}
                            max={180}
                            value={studentLateToleranceMinutes}
                            onChange={(e) =>
                                setStudentLateToleranceMinutes(
                                    Math.max(0, Number(e.target.value))
                                )
                            }
                            className="form-input w-full text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            Lewat batas otomatis status TERLAMBAT
                        </span>
                    </div>

                    <div>
                        <label className="text-[11px] font-semibold block mb-1">
                            Jam Mulai Boleh Absen Pulang
                        </label>
                        <input
                            type="time"
                            value={studentCheckOutStartTime}
                            onChange={(e) => setStudentCheckOutStartTime(e.target.value)}
                            disabled={!enableStudentCheckOut}
                            className="form-input w-full text-xs disabled:opacity-50"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            Mencegah siswa absen pulang terlalu pagi
                        </span>
                    </div>

                    <div>
                        <label className="text-[11px] font-semibold block mb-1">
                            Jam Pulang Normal Siswa
                        </label>
                        <input
                            type="time"
                            value={studentWorkEndTime}
                            onChange={(e) => setStudentWorkEndTime(e.target.value)}
                            className="form-input w-full text-xs"
                        />
                        <span className="text-[10px] text-muted-foreground">
                            Default: 14:00
                        </span>
                    </div>
                </div>
            </div>

            {/* Bagian 2: Metode Presensi Siswa & Fitur Absen Pulang */}
            <div className="space-y-2.5 pt-1">
                <div className="text-xs font-bold text-foreground">
                    Metode Presensi Siswa yang Diaktifkan
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Card 1: Kiosk QR / NISN */}
                    <button
                        type="button"
                        onClick={() => setEnableStudentKiosk((prev) => !prev)}
                        className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex items-start justify-between gap-3 cursor-pointer active:scale-[0.98] ${enableStudentKiosk
                                ? 'border-emerald-600/70 bg-emerald-500/10 shadow-2xs'
                                : 'border-border bg-muted/20 opacity-75 hover:opacity-100'
                            }`}
                    >
                        <div className="space-y-1">
                            <div className="text-xs font-bold flex items-center gap-1.5">
                                <QrCode size={14} className="text-emerald-600 shrink-0" />
                                <span>Kiosk Mandiri (Scan QR / NISN)</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Siswa melakukan scan kartu QR atau ketik NISN di terminal
                                gerbang/kelas.
                            </p>
                        </div>
                        <span
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 mt-0.5 flex items-center ${enableStudentKiosk
                                    ? 'bg-emerald-600'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                        >
                            <span
                                className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${enableStudentKiosk ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                            />
                        </span>
                    </button>

                    {/* Card 2: Manual Wali Kelas / Guru */}
                    <button
                        type="button"
                        onClick={() => setEnableStudentClassAttendance((prev) => !prev)}
                        className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex items-start justify-between gap-3 cursor-pointer active:scale-[0.98] ${enableStudentClassAttendance
                                ? 'border-blue-600/70 bg-blue-500/10 shadow-2xs'
                                : 'border-border bg-muted/20 opacity-75 hover:opacity-100'
                            }`}
                    >
                        <div className="space-y-1">
                            <div className="text-xs font-bold flex items-center gap-1.5">
                                <ClipboardList size={14} className="text-blue-600 shrink-0" />
                                <span>Input Manual Wali Kelas / Guru</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                Wali kelas atau guru mengabsen siswa per kelas secara manual di
                                dalam kelas.
                            </p>
                        </div>
                        <span
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 mt-0.5 flex items-center ${enableStudentClassAttendance
                                    ? 'bg-blue-600'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                        >
                            <span
                                className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${enableStudentClassAttendance
                                        ? 'translate-x-5'
                                        : 'translate-x-0'
                                    }`}
                            />
                        </span>
                    </button>

                    {/* Card 3: Absen Pulang Siswa */}
                    <button
                        type="button"
                        onClick={() => setEnableStudentCheckOut((prev) => !prev)}
                        className={`p-3.5 rounded-xl border text-left transition-all duration-200 flex items-start justify-between gap-3 cursor-pointer active:scale-[0.98] ${enableStudentCheckOut
                                ? 'border-indigo-600/70 bg-indigo-500/10 shadow-2xs'
                                : 'border-border bg-muted/20 opacity-75 hover:opacity-100'
                            }`}
                    >
                        <div className="space-y-1">
                            <div className="text-xs font-bold flex items-center gap-1.5">
                                <LogOut size={14} className="text-indigo-600 shrink-0" />
                                <span>Aktifkan Absen Pulang Siswa</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {enableStudentCheckOut
                                    ? 'Siswa dapat mencatat jam pulang saat pulang sekolah.'
                                    : 'Absen pulang siswa dinonaktifkan (hanya mencatat absen masuk).'}
                            </p>
                        </div>
                        <span
                            className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 mt-0.5 flex items-center ${enableStudentCheckOut
                                    ? 'bg-indigo-600'
                                    : 'bg-slate-300 dark:bg-slate-600'
                                }`}
                        >
                            <span
                                className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${enableStudentCheckOut ? 'translate-x-5' : 'translate-x-0'
                                    }`}
                            />
                        </span>
                    </button>
                </div>
            </div>
        </div>
    );
}