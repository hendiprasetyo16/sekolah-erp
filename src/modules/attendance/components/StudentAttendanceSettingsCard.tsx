// src/modules/attendance/components/StudentAttendanceSettingsCard.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    GraduationCap,
    Save,
    Loader2,
    RefreshCw,
    Scan,
    Users,
    LogOut,
    CheckCircle2,
    AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/services/supabase.client';

// ============================================================================
// PARAMETER YANG BISA DISESUAIKAN
// ============================================================================
const DEFAULT_STUDENT_START_TIME = '07:00';
const DEFAULT_STUDENT_END_TIME = '13:30';
const DEFAULT_STUDENT_CHECKOUT_START = '11:30';

interface StudentAttendanceSettingsCardProps {
    selectedSchoolId: string;
}

function calculateStudentDeadline(
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

export function StudentAttendanceSettingsCard({
    selectedSchoolId,
}: StudentAttendanceSettingsCardProps) {
    const [studentWorkStartTime, setStudentWorkStartTime] = useState<string>(
        DEFAULT_STUDENT_START_TIME
    );
    const [studentLateToleranceMinutes, setStudentLateToleranceMinutes] =
        useState<number>(0);
    const [studentWorkEndTime, setStudentWorkEndTime] = useState<string>(
        DEFAULT_STUDENT_END_TIME
    );
    const [studentCheckOutStartTime, setStudentCheckOutStartTime] =
        useState<string>(DEFAULT_STUDENT_CHECKOUT_START);

    const [enableStudentKiosk, setEnableStudentKiosk] = useState<boolean>(true);
    const [enableStudentClassAttendance, setEnableStudentClassAttendance] =
        useState<boolean>(true);
    const [enableStudentCheckOut, setEnableStudentCheckOut] =
        useState<boolean>(true);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isSaving, setIsSaving] = useState<boolean>(false);
    const [feedback, setFeedback] = useState<{
        type: 'success' | 'error';
        text: string;
    } | null>(null);

    const loadStudentSettings = useCallback(async () => {
        if (!selectedSchoolId) return;
        setIsLoading(true);
        setFeedback(null);
        try {
            const { data, error } = await supabase
                .from('schools')
                .select('*')
                .eq('id', selectedSchoolId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                setStudentWorkStartTime(
                    data.studentWorkStartTime || DEFAULT_STUDENT_START_TIME
                );
                setStudentLateToleranceMinutes(
                    Math.max(0, Number(data.studentLateToleranceMinutes) || 0)
                );
                setStudentWorkEndTime(
                    data.studentWorkEndTime || DEFAULT_STUDENT_END_TIME
                );
                setStudentCheckOutStartTime(
                    data.studentCheckOutStartTime || DEFAULT_STUDENT_CHECKOUT_START
                );
                setEnableStudentKiosk(
                    typeof data.enableStudentKiosk === 'boolean'
                        ? data.enableStudentKiosk
                        : true
                );
                setEnableStudentClassAttendance(
                    typeof data.enableStudentClassAttendance === 'boolean'
                        ? data.enableStudentClassAttendance
                        : true
                );
                setEnableStudentCheckOut(
                    typeof data.enableStudentCheckOut === 'boolean'
                        ? data.enableStudentCheckOut
                        : true
                );
            }
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : 'Gagal memuat pengaturan presensi siswa.',
            });
        } finally {
            setIsLoading(false);
        }
    }, [selectedSchoolId]);

    useEffect(() => {
        loadStudentSettings();
    }, [loadStudentSettings]);

    const effectiveDeadline = useMemo(
        () =>
            calculateStudentDeadline(
                studentWorkStartTime,
                studentLateToleranceMinutes
            ),
        [studentWorkStartTime, studentLateToleranceMinutes]
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedSchoolId) return;

        const cleanTolerance = Math.max(
            0,
            Math.min(180, Math.floor(Number(studentLateToleranceMinutes) || 0))
        );

        setIsSaving(true);
        setFeedback(null);
        try {
            const { error } = await supabase
                .from('schools')
                .update({
                    studentWorkStartTime,
                    studentLateToleranceMinutes: cleanTolerance,
                    studentWorkEndTime,
                    studentCheckOutStartTime,
                    enableStudentKiosk,
                    enableStudentClassAttendance,
                    enableStudentCheckOut,
                })
                .eq('id', selectedSchoolId);

            if (error) throw error;

            setStudentLateToleranceMinutes(cleanTolerance);
            setFeedback({
                type: 'success',
                text: `Pengaturan siswa tersimpan! Masuk ${studentWorkStartTime} (batas ${effectiveDeadline}), buka pulang ${studentCheckOutStartTime}, jadwal pulang ${studentWorkEndTime}.`,
            });
        } catch (err: unknown) {
            setFeedback({
                type: 'error',
                text:
                    err instanceof Error
                        ? err.message
                        : 'Gagal menyimpan pengaturan siswa. Pastikan skrip SQL kolom siswa sudah dijalankan.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <form
            onSubmit={handleSave}
            className="rounded-xl border border-border bg-card p-5 shadow-sm space-y-5"
        >
            <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                    <h2 className="text-base font-bold flex items-center gap-2">
                        <GraduationCap size={18} className="text-indigo-600" />
                        Pengaturan Jadwal & Metode Presensi Siswa
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                        Diatur terpisah dari jadwal Guru/PTK. Mendukung Kiosk Siswa, Absensi
                        Kelas, dan pencatatan Jam Pulang untuk notifikasi WhatsApp orang tua.
                    </p>
                </div>
                {isLoading && <RefreshCw size={16} className="animate-spin opacity-60" />}
            </div>

            {feedback && (
                <div
                    className={`p-3 rounded-xl border text-xs font-medium flex items-center gap-2 ${feedback.type === 'success'
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-200'
                        : 'bg-red-500/15 border-red-500/40 text-red-700 dark:text-red-200'
                        }`}
                >
                    {feedback.type === 'success' ? (
                        <CheckCircle2 size={15} className="text-emerald-500 shrink-0" />
                    ) : (
                        <AlertTriangle size={15} className="text-red-500 shrink-0" />
                    )}
                    <span>{feedback.text}</span>
                </div>
            )}

            {/* Pengaturan Jam Siswa */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        Jam Masuk Siswa *
                    </label>
                    <input
                        type="time"
                        required
                        value={studentWorkStartTime}
                        onChange={(e) => setStudentWorkStartTime(e.target.value)}
                        className="form-input w-full text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Jadwal bel masuk siswa.
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        Toleransi Terlambat (Menit)
                    </label>
                    <input
                        type="number"
                        min={0}
                        max={180}
                        step={1}
                        value={studentLateToleranceMinutes}
                        onChange={(e) =>
                            setStudentLateToleranceMinutes(
                                e.target.value === '' ? 0 : Math.max(0, Number(e.target.value))
                            )
                        }
                        className="form-input w-full text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Batas hadir: <strong className="font-mono">{effectiveDeadline}</strong>
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        Mulai Buka Absen Pulang *
                    </label>
                    <input
                        type="time"
                        required
                        disabled={!enableStudentCheckOut}
                        value={studentCheckOutStartTime}
                        onChange={(e) => setStudentCheckOutStartTime(e.target.value)}
                        className="form-input w-full text-sm font-mono disabled:opacity-50"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Mencegah scan pagi dianggap pulang.
                    </p>
                </div>

                <div>
                    <label className="block text-xs font-semibold mb-1.5">
                        Jam Pulang Resmi Siswa *
                    </label>
                    <input
                        type="time"
                        required
                        value={studentWorkEndTime}
                        onChange={(e) => setStudentWorkEndTime(e.target.value)}
                        className="form-input w-full text-sm font-mono"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                        Acuan jadwal kepulangan siswa.
                    </p>
                </div>
            </div>

            {/* Saklar Metode Absensi Siswa */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                {/* 1. Kiosk Siswa */}
                <div
                    onClick={() => setEnableStudentKiosk((prev) => !prev)}
                    role="switch"
                    aria-checked={enableStudentKiosk}
                    tabIndex={0}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start justify-between gap-3 select-none ${enableStudentKiosk
                        ? 'border-indigo-600/70 bg-indigo-500/10'
                        : 'border-border bg-muted/25'
                        }`}
                >
                    <div className="flex items-start gap-2.5">
                        <Scan
                            size={17}
                            className={
                                enableStudentKiosk
                                    ? 'text-indigo-600 shrink-0 mt-0.5'
                                    : 'text-muted-foreground shrink-0 mt-0.5'
                            }
                        />
                        <div>
                            <div className="text-xs font-bold">Kiosk Siswa (QR / NISN)</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Siswa scan mandiri di perangkat Kiosk sekolah.
                            </p>
                        </div>
                    </div>
                    <span
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${enableStudentKiosk
                            ? 'bg-indigo-600'
                            : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                    >
                        <span
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${enableStudentKiosk ? 'translate-x-5' : 'translate-x-0'
                                }`}
                        />
                    </span>
                </div>

                {/* 2. Absensi Per Kelas */}
                <div
                    onClick={() => setEnableStudentClassAttendance((prev) => !prev)}
                    role="switch"
                    aria-checked={enableStudentClassAttendance}
                    tabIndex={0}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start justify-between gap-3 select-none ${enableStudentClassAttendance
                        ? 'border-indigo-600/70 bg-indigo-500/10'
                        : 'border-border bg-muted/25'
                        }`}
                >
                    <div className="flex items-start gap-2.5">
                        <Users
                            size={17}
                            className={
                                enableStudentClassAttendance
                                    ? 'text-indigo-600 shrink-0 mt-0.5'
                                    : 'text-muted-foreground shrink-0 mt-0.5'
                            }
                        />
                        <div>
                            <div className="text-xs font-bold">Absensi Kelas (Wali Kelas)</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Guru/Wali kelas mengabsen siswa per rombel.
                            </p>
                        </div>
                    </div>
                    <span
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${enableStudentClassAttendance
                            ? 'bg-indigo-600'
                            : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                    >
                        <span
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${enableStudentClassAttendance ? 'translate-x-5' : 'translate-x-0'
                                }`}
                        />
                    </span>
                </div>

                {/* 3. Pencatatan Jam Pulang (Check-Out) */}
                <div
                    onClick={() => setEnableStudentCheckOut((prev) => !prev)}
                    role="switch"
                    aria-checked={enableStudentCheckOut}
                    tabIndex={0}
                    className={`p-3.5 rounded-xl border cursor-pointer transition flex items-start justify-between gap-3 select-none ${enableStudentCheckOut
                        ? 'border-emerald-600/70 bg-emerald-500/10'
                        : 'border-border bg-muted/25'
                        }`}
                >
                    <div className="flex items-start gap-2.5">
                        <LogOut
                            size={17}
                            className={
                                enableStudentCheckOut
                                    ? 'text-emerald-600 shrink-0 mt-0.5'
                                    : 'text-muted-foreground shrink-0 mt-0.5'
                            }
                        />
                        <div>
                            <div className="text-xs font-bold">Catat Jam Pulang Siswa</div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                Merekam waktu pulang (siap untuk notif WA orang tua).
                            </p>
                        </div>
                    </div>
                    <span
                        className={`w-10 h-5 rounded-full p-0.5 transition-colors shrink-0 flex items-center ${enableStudentCheckOut
                            ? 'bg-emerald-600'
                            : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                    >
                        <span
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${enableStudentCheckOut ? 'translate-x-5' : 'translate-x-0'
                                }`}
                        />
                    </span>
                </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-border/60">
                <button
                    type="submit"
                    disabled={isSaving || !selectedSchoolId}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-linear-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                >
                    {isSaving ? (
                        <Loader2 size={15} className="animate-spin" />
                    ) : (
                        <Save size={15} />
                    )}
                    {isSaving ? 'Menyimpan...' : 'Simpan Pengaturan Siswa'}
                </button>
            </div>
        </form>
    );
}