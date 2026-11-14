import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
    Building2,
    Calendar,
    ClipboardCheck,
    Wallet,
    BookOpen,
    Clock,
    Megaphone,
    AlertCircle,
    CheckCircle2,
    ChevronRight,
    GraduationCap,
    UserCheck,
} from 'lucide-react';

import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { formatCurrency, formatDate } from '@/utils/format';
import {
    fetchLinkedStudents,
    fetchStudentAttendances,
    fetchClassSchedules,
    fetchStudentFinance,
    fetchPortalAnnouncements,
} from '../services/portal.service';

const containerVariants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0 },
};

function getCurrentIsoDayOfWeek(): number {
    const jsDay = new Date().getDay(); // 0 (Minggu) - 6 (Sabtu)
    return jsDay === 0 ? 7 : jsDay;
}

function formatTimeRange(startTime: string, endTime: string): string {
    return `${startTime.slice(0, 5)} - ${endTime.slice(0, 5)}`;
}

function isClassOngoing(startTime: string, endTime: string): boolean {
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return hhmm >= startTime.slice(0, 5) && hhmm <= endTime.slice(0, 5);
}

export function StudentDashboard() {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { user, school, academicYear } = useAuthStore();

    const schoolId = school?.id ?? null;
    const userId = user?.id ?? null;

    // 1. Ambil Profil Siswa yang terhubung dengan akun ini
    const { data: linkedProfiles = [], isLoading: isLoadingProfile } = useQuery({
        queryKey: ['portal-linked-students', schoolId, userId],
        enabled: Boolean(schoolId && userId),
        queryFn: () => fetchLinkedStudents(schoolId!, userId!),
    });

    const student = linkedProfiles[0] ?? null;

    // 2. Ambil Data Presensi Siswa
    const { data: attendances = [], isLoading: isLoadingAttendance } = useQuery({
        queryKey: ['portal-student-attendances', schoolId, student?.studentId],
        enabled: Boolean(schoolId && student?.studentId),
        queryFn: () => fetchStudentAttendances(schoolId!, student!.studentId),
    });

    // 3. Ambil Jadwal Pelajaran Kelas Siswa
    const { data: schedules = [], isLoading: isLoadingSchedules } = useQuery({
        queryKey: ['portal-class-schedules', schoolId, student?.classId, academicYear?.id],
        enabled: Boolean(schoolId && student?.classId),
        queryFn: () => fetchClassSchedules(schoolId!, student!.classId, academicYear?.id),
    });

    // 4. Ambil Data Tagihan & Pembayaran
    const { data: finance = { bills: [], payments: [] }, isLoading: isLoadingFinance } = useQuery({
        queryKey: ['portal-student-finance', schoolId, student?.studentId],
        enabled: Boolean(schoolId && student?.studentId),
        queryFn: () => fetchStudentFinance(schoolId!, student!.studentId),
    });

    // 5. Ambil Pengumuman Sekolah
    const { data: announcements = [] } = useQuery({
        queryKey: ['portal-announcements', schoolId, 'SISWA'],
        enabled: Boolean(schoolId),
        queryFn: () => fetchPortalAnnouncements(schoolId!, 'SISWA'),
    });

    // Kalkulasi statistik presensi bulan berjalan
    const attendanceStats = useMemo(() => {
        const now = new Date();
        const currentMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const thisMonthRows = attendances.filter((a) => a.date.startsWith(currentMonthPrefix));

        const hadir = thisMonthRows.filter(
            (a) => a.status === 'HADIR' || a.status === 'TERLAMBAT'
        ).length;
        const sakit = thisMonthRows.filter((a) => a.status === 'SAKIT').length;
        const izin = thisMonthRows.filter((a) => a.status === 'IZIN').length;
        const alpa = thisMonthRows.filter((a) => a.status === 'ALPA').length;
        const rate = thisMonthRows.length > 0 ? Math.round((hadir / thisMonthRows.length) * 100) : 100;

        return { hadir, sakit, izin, alpa, rate, total: thisMonthRows.length };
    }, [attendances]);

    // Jadwal hari ini
    const todaySchedules = useMemo(() => {
        const todayDay = getCurrentIsoDayOfWeek();
        return schedules.filter((s) => s.dayOfWeek === todayDay);
    }, [schedules]);

    // Total sisa tagihan belum lunas
    const unpaidTotal = useMemo(() => {
        return finance.bills
            .filter((b) => b.status === 'BELUM_BAYAR' || b.status === 'CICILAN')
            .reduce((sum, b) => sum + Math.max(0, b.totalAmount - b.paidAmount), 0);
    }, [finance.bills]);

    const unpaidBillsCount = useMemo(
        () =>
            finance.bills.filter((b) => b.status === 'BELUM_BAYAR' || b.status === 'CICILAN').length,
        [finance.bills]
    );

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
            {/* =====================================================================
          WELCOME BANNER SISWA
         ===================================================================== */}
            <motion.div variants={itemVariants} className="relative overflow-hidden rounded-2xl p-6 lg:p-8">
                <div className="absolute inset-0 bg-linear-to-r from-emerald-600 via-teal-700 to-emerald-900" />
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 opacity-15"
                    style={{
                        backgroundImage:
                            'radial-gradient(circle at 20% 50%, rgba(255,255,255,0.28) 0%, transparent 50%), radial-gradient(circle at 85% 40%, rgba(255,255,255,0.2) 0%, transparent 50%)',
                    }}
                />
                <div className="relative z-10 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                        {school?.name && (
                            <div className="mb-2.5 inline-flex flex-wrap items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50 backdrop-blur-xs">
                                <Building2 size={13} />
                                <span>{school.name}</span>
                                {academicYear?.name && (
                                    <span className="text-emerald-200">• TA {academicYear.name}</span>
                                )}
                            </div>
                        )}

                        <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-white lg:text-3xl">
                            {isId
                                ? `Halo, ${student?.fullName || user?.fullName || 'Siswa'}!`
                                : `Hello, ${student?.fullName || user?.fullName || 'Student'}!`}
                        </h1>

                        <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-100/90 sm:text-sm">
                            {student ? (
                                <>
                                    <span className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-0.5 font-medium">
                                        <GraduationCap size={14} />
                                        {student.className
                                            ? `${isId ? 'Kelas' : 'Class'} ${student.className}`
                                            : isId
                                                ? 'Kelas belum diatur'
                                                : 'Class not assigned'}
                                    </span>
                                    <span>• NISN {student.nisn}</span>
                                    {student.homeroomTeacherName && (
                                        <span>
                                            • {isId ? 'Wali Kelas' : 'Homeroom'}: {student.homeroomTeacherName}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span>
                                    {isId
                                        ? 'Portal Akademik Peserta Didik'
                                        : 'Student Academic Portal'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="hidden items-center gap-3 rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-md lg:flex">
                        <Calendar size={20} className="text-emerald-100" />
                        <div>
                            <p className="text-sm font-semibold text-white">{formatDate(new Date(), 'dddd')}</p>
                            <p className="text-xs text-emerald-100/80">{formatDate(new Date())}</p>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Peringatan jika akun belum ditautkan oleh Admin */}
            {!isLoadingProfile && !student && (
                <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                >
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm">
                        <p className="font-semibold">
                            {isId
                                ? 'Akun Anda Belum Terhubung ke Profil Siswa'
                                : 'Your Account Is Not Linked to a Student Profile'}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed opacity-90">
                            {isId
                                ? 'Silakan hubungi Admin Sekolah atau Tata Usaha untuk menautkan akun ini dengan data NISN Anda melalui menu Manajemen Akun.'
                                : 'Please contact the School Administrator to link this account to your student record.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* =====================================================================
          4 KARTU RINGKASAN UTAMA SISWA
         ===================================================================== */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <UserCheck size={20} />
                        </div>
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {isId ? 'Bulan Ini' : 'This Month'}
                        </span>
                    </div>
                    {isLoadingAttendance ? (
                        <div className="mb-1 h-8 w-20 animate-pulse rounded-lg bg-muted" />
                    ) : (
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                            {attendanceStats.rate}%
                        </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isId
                            ? `Kehadiran (${attendanceStats.hadir} hari hadir)`
                            : `Attendance (${attendanceStats.hadir} days present)`}
                    </p>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <BookOpen size={20} />
                        </div>
                        <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                            {isId ? 'Hari Ini' : 'Today'}
                        </span>
                    </div>
                    {isLoadingSchedules ? (
                        <div className="mb-1 h-8 w-16 animate-pulse rounded-lg bg-muted" />
                    ) : (
                        <p className="text-2xl font-bold tabular-nums text-foreground">
                            {todaySchedules.length}
                        </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isId ? 'Mata Pelajaran Hari Ini' : 'Subjects Scheduled Today'}
                    </p>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <ClipboardCheck size={20} />
                        </div>
                        <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            S / I / A
                        </span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                        {attendanceStats.sakit} / {attendanceStats.izin} / {attendanceStats.alpa}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isId ? 'Sakit / Izin / Alpa Bulan Ini' : 'Sick / Excused / Absent'}
                    </p>
                </motion.div>

                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400">
                            <Wallet size={20} />
                        </div>
                        <span
                            className={cn(
                                'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                                unpaidTotal > 0
                                    ? 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300'
                                    : 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            )}
                        >
                            {unpaidTotal > 0
                                ? `${unpaidBillsCount} ${isId ? 'Tagihan' : 'Bills'}`
                                : isId
                                    ? 'Lunas'
                                    : 'Paid'}
                        </span>
                    </div>
                    {isLoadingFinance ? (
                        <div className="mb-1 h-8 w-28 animate-pulse rounded-lg bg-muted" />
                    ) : (
                        <p
                            className="truncate text-2xl font-bold tabular-nums text-foreground"
                            title={formatCurrency(unpaidTotal)}
                        >
                            {formatCurrency(unpaidTotal)}
                        </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isId ? 'Sisa Tagihan Belum Lunas' : 'Outstanding Tuition Balance'}
                    </p>
                </motion.div>
            </div>

            {/* =====================================================================
          BARIS UTAMA: JADWAL HARI INI & PRESENSI / PENGUMUMAN
         ===================================================================== */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Jadwal Pelajaran Hari Ini */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs lg:col-span-2"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h2 className="text-base font-bold text-foreground">
                                {isId ? 'Jadwal Pelajaran Hari Ini' : "Today's Class Schedule"}
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                {student?.className
                                    ? `${isId ? 'Rombel' : 'Class'} ${student.className}`
                                    : isId
                                        ? 'Jadwal belajar aktif'
                                        : 'Active class schedule'}
                            </p>
                        </div>
                        <Link
                            to="/portal/schedules"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                            <span>{isId ? 'Jadwal Lengkap' : 'Full Schedule'}</span>
                            <ChevronRight size={14} />
                        </Link>
                    </div>

                    {isLoadingSchedules ? (
                        <div className="space-y-2.5">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="h-16 animate-pulse rounded-xl bg-muted" />
                            ))}
                        </div>
                    ) : todaySchedules.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border py-10 text-center">
                            <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                            <p className="text-sm font-medium text-foreground">
                                {isId ? 'Tidak ada jadwal pelajaran hari ini' : 'No classes scheduled today'}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                {isId
                                    ? 'Silakan cek menu Jadwal Pelajaran untuk melihat jadwal hari lainnya.'
                                    : 'Check the full schedule page to view other days.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {todaySchedules.map((item) => {
                                const ongoing = isClassOngoing(item.startTime, item.endTime);
                                return (
                                    <div
                                        key={item.id}
                                        className={cn(
                                            'flex flex-col justify-between gap-2 rounded-xl border p-3.5 transition-colors sm:flex-row sm:items-center',
                                            ongoing
                                                ? 'border-emerald-500/40 bg-emerald-500/5'
                                                : 'border-border bg-muted/20'
                                        )}
                                    >
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-semibold text-foreground">
                                                    {item.subjectName}
                                                </p>
                                                {ongoing && (
                                                    <span className="shrink-0 rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                                                        {isId ? 'Berlangsung' : 'Ongoing'}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                                {item.teacherName || (isId ? 'Guru Pengampu' : 'Teacher')}
                                                {item.room ? ` • ${isId ? 'Ruang' : 'Room'} ${item.room}` : ''}
                                            </p>
                                        </div>

                                        <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
                                            <Clock size={13} className="text-emerald-600 dark:text-emerald-400" />
                                            <span>{formatTimeRange(item.startTime, item.endTime)}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </motion.div>

                {/* Kolom Kanan: Riwayat Presensi Terbaru & Pengumuman */}
                <div className="space-y-6">
                    {/* Presensi Terbaru */}
                    <motion.div
                        variants={itemVariants}
                        className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                    >
                        <div className="mb-3.5 flex items-center justify-between">
                            <h2 className="text-sm font-bold text-foreground">
                                {isId ? 'Presensi Terbaru' : 'Recent Attendance'}
                            </h2>
                            <Link
                                to="/portal/attendance"
                                className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                                <span>{isId ? 'Semua' : 'All'}</span>
                                <ChevronRight size={13} />
                            </Link>
                        </div>

                        {attendances.length === 0 ? (
                            <p className="py-6 text-center text-xs text-muted-foreground">
                                {isId ? 'Belum ada catatan presensi.' : 'No attendance records yet.'}
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {attendances.slice(0, 4).map((att) => (
                                    <div
                                        key={att.id}
                                        className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs"
                                    >
                                        <div>
                                            <p className="font-medium text-foreground">{formatDate(att.date)}</p>
                                            {att.checkInTime && (
                                                <p className="text-[11px] text-muted-foreground">
                                                    {isId ? 'Masuk' : 'In'}:{' '}
                                                    {new Date(att.checkInTime).toLocaleTimeString('id-ID', {
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        <span
                                            className={cn(
                                                'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                                                att.status === 'HADIR'
                                                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                    : att.status === 'TERLAMBAT'
                                                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                        : att.status === 'SAKIT' || att.status === 'IZIN'
                                                            ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                            )}
                                        >
                                            {att.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>

                    {/* Pengumuman Sekolah */}
                    <motion.div
                        variants={itemVariants}
                        className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                    >
                        <div className="mb-3.5 flex items-center gap-2">
                            <Megaphone size={16} className="text-emerald-600 dark:text-emerald-400" />
                            <h2 className="text-sm font-bold text-foreground">
                                {isId ? 'Pengumuman Sekolah' : 'School Announcements'}
                            </h2>
                        </div>

                        {announcements.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                                <span>
                                    {isId ? 'Tidak ada pengumuman terbaru.' : 'No recent announcements.'}
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {announcements.slice(0, 3).map((ann) => (
                                    <div
                                        key={ann.id}
                                        className="rounded-xl border border-border bg-muted/20 p-3 text-xs"
                                    >
                                        <p className="font-semibold text-foreground">{ann.title}</p>
                                        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                                            {ann.content}
                                        </p>
                                        <p className="mt-1.5 text-[10px] text-muted-foreground/80">
                                            {formatDate(ann.publishDate)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
                </div>
            </div>
        </motion.div>
    );
}