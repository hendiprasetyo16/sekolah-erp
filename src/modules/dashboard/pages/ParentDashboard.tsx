import { useState, useMemo } from 'react';
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
    ChevronRight,
    GraduationCap,
    Users,
    CheckCircle2,
    Phone,
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
    const jsDay = new Date().getDay();
    return jsDay === 0 ? 7 : jsDay;
}

export function ParentDashboard() {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { user, school, academicYear } = useAuthStore();

    const schoolId = school?.id ?? null;
    const userId = user?.id ?? null;

    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    // 1. Ambil daftar putra/putri yang terhubung ke akun Orang Tua / Wali ini
    const { data: children = [], isLoading: isLoadingChildren } = useQuery({
        queryKey: ['portal-linked-students', schoolId, userId],
        enabled: Boolean(schoolId && userId),
        queryFn: () => fetchLinkedStudents(schoolId!, userId!),
    });

    const activeChild = useMemo(() => {
        if (children.length === 0) return null;
        if (selectedStudentId) {
            const found = children.find((c) => c.studentId === selectedStudentId);
            if (found) return found;
        }
        return children[0];
    }, [children, selectedStudentId]);

    // 2. Ambil Presensi Anak Terpilih
    const { data: attendances = [], isLoading: isLoadingAttendance } = useQuery({
        queryKey: ['portal-student-attendances', schoolId, activeChild?.studentId],
        enabled: Boolean(schoolId && activeChild?.studentId),
        queryFn: () => fetchStudentAttendances(schoolId!, activeChild!.studentId),
    });

    // 3. Ambil Jadwal Pelajaran Anak Terpilih
    const { data: schedules = [], isLoading: isLoadingSchedules } = useQuery({
        queryKey: ['portal-class-schedules', schoolId, activeChild?.classId, academicYear?.id],
        enabled: Boolean(schoolId && activeChild?.classId),
        queryFn: () => fetchClassSchedules(schoolId!, activeChild!.classId, academicYear?.id),
    });

    // 4. Ambil Tagihan & Pembayaran Anak Terpilih
    const { data: finance = { bills: [], payments: [] }, isLoading: isLoadingFinance } = useQuery({
        queryKey: ['portal-student-finance', schoolId, activeChild?.studentId],
        enabled: Boolean(schoolId && activeChild?.studentId),
        queryFn: () => fetchStudentFinance(schoolId!, activeChild!.studentId),
    });

    // 5. Ambil Pengumuman Sekolah untuk Orang Tua
    const { data: announcements = [] } = useQuery({
        queryKey: ['portal-announcements', schoolId, 'ORANG_TUA'],
        enabled: Boolean(schoolId),
        queryFn: () => fetchPortalAnnouncements(schoolId!, 'ORANG_TUA'),
    });

    // Status presensi hari ini
    const todayAttendance = useMemo(() => {
        const todayIso = new Date().toISOString().slice(0, 10);
        return attendances.find((a) => a.date === todayIso) ?? null;
    }, [attendances]);

    // Rekap presensi bulan ini
    const monthlyAttendance = useMemo(() => {
        const now = new Date();
        const prefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const rows = attendances.filter((a) => a.date.startsWith(prefix));
        const hadir = rows.filter((a) => a.status === 'HADIR' || a.status === 'TERLAMBAT').length;
        const rate = rows.length > 0 ? Math.round((hadir / rows.length) * 100) : 100;
        return { hadir, total: rows.length, rate };
    }, [attendances]);

    const todaySchedules = useMemo(() => {
        const todayDay = getCurrentIsoDayOfWeek();
        return schedules.filter((s) => s.dayOfWeek === todayDay);
    }, [schedules]);

    const unpaidBills = useMemo(
        () => finance.bills.filter((b) => b.status === 'BELUM_BAYAR' || b.status === 'CICILAN'),
        [finance.bills]
    );

    const unpaidTotal = useMemo(
        () => unpaidBills.reduce((sum, b) => sum + Math.max(0, b.totalAmount - b.paidAmount), 0),
        [unpaidBills]
    );

    return (
        <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
            {/* =====================================================================
          WELCOME BANNER ORANG TUA / WALI
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
                                ? `Selamat Datang, ${user?.fullName || 'Bapak/Ibu Wali'}!`
                                : `Welcome, ${user?.fullName || 'Parent/Guardian'}!`}
                        </h1>
                        <p className="text-sm text-emerald-100/85">
                            {isId
                                ? 'Pantau kehadiran harian, jadwal pelajaran, dan administrasi keuangan putra/putri Anda.'
                                : 'Monitor daily attendance, class schedules, and tuition administration for your child.'}
                        </p>
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

            {/* =====================================================================
          PEMILIH ANAK (JIKA TERHUBUNG KE LEBIH DARI 1 SISWA)
         ===================================================================== */}
            {children.length > 1 && (
                <motion.div
                    variants={itemVariants}
                    className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-xs"
                >
                    <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-muted-foreground">
                        <Users size={14} className="text-emerald-600" />
                        {isId ? 'Pilih Putra/Putri:' : 'Select Child:'}
                    </span>
                    {children.map((child) => {
                        const isSelected = child.studentId === activeChild?.studentId;
                        return (
                            <button
                                key={child.studentId}
                                type="button"
                                onClick={() => setSelectedStudentId(child.studentId)}
                                className={cn(
                                    'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all',
                                    isSelected
                                        ? 'bg-emerald-600 text-white shadow-xs'
                                        : 'bg-muted/50 text-foreground hover:bg-muted'
                                )}
                            >
                                {child.fullName} {child.className ? `(${child.className})` : ''}
                            </button>
                        );
                    })}
                </motion.div>
            )}

            {/* Peringatan jika akun Orang Tua belum ditautkan ke siswa mana pun */}
            {!isLoadingChildren && !activeChild && (
                <motion.div
                    variants={itemVariants}
                    className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50/70 p-5 text-amber-950 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                >
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm">
                        <p className="font-semibold">
                            {isId
                                ? 'Akun Wali Belum Terhubung dengan Data Siswa'
                                : 'Guardian Account Not Yet Linked to a Student'}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed opacity-90">
                            {isId
                                ? 'Silakan hubungi Admin Sekolah atau Tata Usaha untuk menautkan akun Bapak/Ibu dengan data putra/putri Anda melalui menu Manajemen Akun.'
                                : 'Please contact the School Administrator to link your account to your child’s record.'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* =====================================================================
          KARTU IDENTITAS ANAK AKTIF
         ===================================================================== */}
            {activeChild && (
                <motion.div
                    variants={itemVariants}
                    className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-xs sm:flex-row sm:items-center"
                >
                    <div className="flex items-center gap-3.5">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-600/10 text-base font-bold text-emerald-700 dark:text-emerald-300">
                            {activeChild.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-bold text-foreground">{activeChild.fullName}</h2>
                                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                    {activeChild.className
                                        ? `${isId ? 'Kelas' : 'Class'} ${activeChild.className}`
                                        : isId
                                            ? 'Kelas belum diatur'
                                            : 'No Class'}
                                </span>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                                NISN: {activeChild.nisn}
                                {activeChild.nis ? ` • NIS: ${activeChild.nis}` : ''}
                                {activeChild.homeroomTeacherName
                                    ? ` • ${isId ? 'Wali Kelas' : 'Homeroom'}: ${activeChild.homeroomTeacherName}`
                                    : ''}
                            </p>
                        </div>
                    </div>

                    {activeChild.homeroomTeacherPhone && (
                        <a
                            href={`tel:${activeChild.homeroomTeacherPhone}`}
                            className="inline-flex items-center gap-1.5 self-start rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted sm:self-center"
                        >
                            <Phone size={13} className="text-emerald-600" />
                            <span>{isId ? 'Hubungi Wali Kelas' : 'Call Homeroom'}</span>
                        </a>
                    )}
                </motion.div>
            )}

            {/* =====================================================================
          4 KARTU METRIK RINGKAS ANAK
         ===================================================================== */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Status Kehadiran Hari Ini */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            <ClipboardCheck size={20} />
                        </div>
                        <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                            {isId ? 'Hari Ini' : 'Today'}
                        </span>
                    </div>
                    {isLoadingAttendance ? (
                        <div className="mb-1 h-8 w-24 animate-pulse rounded-lg bg-muted" />
                    ) : (
                        <p className="text-xl font-bold text-foreground">
                            {todayAttendance
                                ? todayAttendance.status
                                : isId
                                    ? 'Belum Tercatat'
                                    : 'Not Recorded'}
                        </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                        {todayAttendance?.checkInTime
                            ? `${isId ? 'Jam Masuk' : 'Check-in'}: ${new Date(todayAttendance.checkInTime).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
                            : isId
                                ? 'Status presensi hari ini'
                                : "Today's attendance status"}
                    </p>
                </motion.div>

                {/* Persentase Kehadiran Bulan Ini */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                            <GraduationCap size={20} />
                        </div>
                        <span className="rounded-full border border-teal-500/25 bg-teal-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-teal-700 dark:text-teal-300">
                            {isId ? 'Bulan Ini' : 'This Month'}
                        </span>
                    </div>
                    <p className="text-2xl font-bold tabular-nums text-foreground">
                        {monthlyAttendance.rate}%
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isId
                            ? `${monthlyAttendance.hadir} dari ${monthlyAttendance.total} hari efektif`
                            : `${monthlyAttendance.hadir} of ${monthlyAttendance.total} days`}
                    </p>
                </motion.div>

                {/* Jadwal Pelajaran Hari Ini */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                            <BookOpen size={20} />
                        </div>
                        <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 dark:text-sky-300">
                            {isId ? 'Mapel' : 'Subjects'}
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
                        {isId ? 'Mata Pelajaran Hari Ini' : 'Subjects Today'}
                    </p>
                </motion.div>

                {/* Tagihan Belum Lunas */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                >
                    <div className="mb-3 flex items-center justify-between">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
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
                                ? `${unpaidBills.length} ${isId ? 'Tagihan' : 'Bills'}`
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
                        {isId ? 'Sisa Tagihan Administrasi' : 'Remaining Tuition Balance'}
                    </p>
                </motion.div>
            </div>

            {/* =====================================================================
          DETAIL JADWAL HARI INI, TAGIHAN & PENGUMUMAN
         ===================================================================== */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                {/* Jadwal Pelajaran Anak Hari Ini */}
                <motion.div
                    variants={itemVariants}
                    className="rounded-2xl border border-border bg-card p-5 shadow-xs lg:col-span-2"
                >
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-base font-bold text-foreground">
                                {isId ? 'Jadwal Pelajaran Anak Hari Ini' : "Child's Schedule Today"}
                            </h3>
                            <p className="text-xs text-muted-foreground">
                                {activeChild?.className
                                    ? `${isId ? 'Kelas' : 'Class'} ${activeChild.className}`
                                    : isId
                                        ? 'Jadwal belajar aktif'
                                        : 'Active schedule'}
                            </p>
                        </div>
                        <Link
                            to="/portal/schedules"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                            <span>{isId ? 'Lihat Semua Hari' : 'All Days'}</span>
                            <ChevronRight size={14} />
                        </Link>
                    </div>

                    {todaySchedules.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border py-10 text-center">
                            <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
                            <p className="text-sm font-medium text-foreground">
                                {isId ? 'Tidak ada jadwal pelajaran hari ini' : 'No classes scheduled today'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2.5">
                            {todaySchedules.map((item) => (
                                <div
                                    key={item.id}
                                    className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-muted/20 p-3.5 sm:flex-row sm:items-center"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold text-foreground">
                                            {item.subjectName}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                            {item.teacherName || (isId ? 'Guru Pengampu' : 'Teacher')}
                                            {item.room ? ` • ${isId ? 'Ruang' : 'Room'} ${item.room}` : ''}
                                        </p>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1 text-xs font-semibold tabular-nums text-foreground">
                                        <Clock size={13} className="text-emerald-600 dark:text-emerald-400" />
                                        <span>
                                            {item.startTime.slice(0, 5)} - {item.endTime.slice(0, 5)}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </motion.div>

                {/* Kolom Kanan: Rincian Tagihan Belum Lunas & Pengumuman */}
                <div className="space-y-6">
                    <motion.div
                        variants={itemVariants}
                        className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                    >
                        <div className="mb-3.5 flex items-center justify-between">
                            <h3 className="text-sm font-bold text-foreground">
                                {isId ? 'Tagihan Belum Lunas' : 'Unpaid Bills'}
                            </h3>
                            <Link
                                to="/portal/finance"
                                className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                            >
                                <span>{isId ? 'Detail' : 'Details'}</span>
                                <ChevronRight size={13} />
                            </Link>
                        </div>

                        {unpaidBills.length === 0 ? (
                            <div className="flex items-center gap-2 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
                                <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
                                <span>
                                    {isId
                                        ? 'Seluruh tagihan administrasi sudah lunas.'
                                        : 'All tuition bills are paid.'}
                                </span>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {unpaidBills.slice(0, 4).map((bill) => {
                                    const remaining = Math.max(0, bill.totalAmount - bill.paidAmount);
                                    return (
                                        <div
                                            key={bill.id}
                                            className="rounded-xl border border-border bg-muted/20 p-3 text-xs"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="font-semibold text-foreground">{bill.title}</p>
                                                <span className="shrink-0 font-bold tabular-nums text-amber-600 dark:text-amber-400">
                                                    {formatCurrency(remaining)}
                                                </span>
                                            </div>
                                            {bill.dueDate && (
                                                <p className="mt-1 text-[11px] text-muted-foreground">
                                                    {isId ? 'Jatuh tempo' : 'Due'}: {formatDate(bill.dueDate)}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </motion.div>

                    <motion.div
                        variants={itemVariants}
                        className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                    >
                        <div className="mb-3.5 flex items-center gap-2">
                            <Megaphone size={16} className="text-emerald-600 dark:text-emerald-400" />
                            <h3 className="text-sm font-bold text-foreground">
                                {isId ? 'Pengumuman Sekolah' : 'School Announcements'}
                            </h3>
                        </div>

                        {announcements.length === 0 ? (
                            <p className="py-4 text-center text-xs text-muted-foreground">
                                {isId ? 'Tidak ada pengumuman terbaru.' : 'No recent announcements.'}
                            </p>
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