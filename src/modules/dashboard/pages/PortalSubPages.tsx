import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    BookOpen,
    Calendar,
    ClipboardCheck,
    Clock,
    Receipt,
    Users,
    Wallet,
    CheckCircle2,
    AlertCircle,
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
    type LinkedStudentProfile,
} from '../services/portal.service';

const DAY_NAMES_ID: Record<number, string> = {
    1: 'Senin',
    2: 'Selasa',
    3: 'Rabu',
    4: 'Kamis',
    5: 'Jumat',
    6: 'Sabtu',
    7: 'Minggu',
};

const DAY_NAMES_EN: Record<number, string> = {
    1: 'Monday',
    2: 'Tuesday',
    3: 'Wednesday',
    4: 'Thursday',
    5: 'Friday',
    6: 'Saturday',
    7: 'Sunday',
};

function useActivePortalStudent() {
    const { user, school } = useAuthStore();
    const schoolId = school?.id ?? null;
    const userId = user?.id ?? null;
    const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

    const { data: students = [], isLoading } = useQuery({
        queryKey: ['portal-linked-students', schoolId, userId],
        enabled: Boolean(schoolId && userId),
        queryFn: () => fetchLinkedStudents(schoolId!, userId!),
    });

    const activeStudent: LinkedStudentProfile | null = useMemo(() => {
        if (students.length === 0) return null;
        if (selectedStudentId) {
            const match = students.find((s) => s.studentId === selectedStudentId);
            if (match) return match;
        }
        return students[0];
    }, [students, selectedStudentId]);

    return {
        schoolId,
        students,
        activeStudent,
        setSelectedStudentId,
        isLoading,
    };
}

function ChildSelectorBar({
    students,
    activeStudent,
    onSelect,
    isId,
}: {
    students: LinkedStudentProfile[];
    activeStudent: LinkedStudentProfile | null;
    onSelect: (id: string) => void;
    isId: boolean;
}) {
    if (students.length <= 1) return null;

    return (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-xs">
            <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-muted-foreground">
                <Users size={14} className="text-emerald-600" />
                {isId ? 'Pilih Siswa:' : 'Select Student:'}
            </span>
            {students.map((child) => {
                const active = child.studentId === activeStudent?.studentId;
                return (
                    <button
                        key={child.studentId}
                        type="button"
                        onClick={() => onSelect(child.studentId)}
                        className={cn(
                            'rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all',
                            active
                                ? 'bg-emerald-600 text-white shadow-xs'
                                : 'bg-muted/50 text-foreground hover:bg-muted'
                        )}
                    >
                        {child.fullName} {child.className ? `(${child.className})` : ''}
                    </button>
                );
            })}
        </div>
    );
}

// ============================================================================
// 1. HALAMAN JADWAL PELAJARAN SISWA / ORTU
// ============================================================================
export function PortalSchedulePage() {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { academicYear } = useAuthStore();
    const { schoolId, students, activeStudent, setSelectedStudentId } = useActivePortalStudent();

    const { data: schedules = [], isLoading } = useQuery({
        queryKey: ['portal-class-schedules', schoolId, activeStudent?.classId, academicYear?.id],
        enabled: Boolean(schoolId && activeStudent?.classId),
        queryFn: () => fetchClassSchedules(schoolId!, activeStudent!.classId, academicYear?.id),
    });

    const groupedByDay = useMemo(() => {
        const map = new Map<number, typeof schedules>();
        for (const item of schedules) {
            const list = map.get(item.dayOfWeek) ?? [];
            list.push(item);
            map.set(item.dayOfWeek, list);
        }
        return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    }, [schedules]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">
                    {isId ? 'Jadwal Pelajaran' : 'Class Schedule'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {activeStudent
                        ? `${activeStudent.fullName}${activeStudent.className ? ` • ${isId ? 'Kelas' : 'Class'} ${activeStudent.className}` : ''}`
                        : isId
                            ? 'Daftar jadwal mata pelajaran aktif'
                            : 'Active class timetable'}
                </p>
            </div>

            <ChildSelectorBar
                students={students}
                activeStudent={activeStudent}
                onSelect={setSelectedStudentId}
                isId={isId}
            />

            {isLoading ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="h-48 animate-pulse rounded-2xl bg-muted" />
                    ))}
                </div>
            ) : groupedByDay.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center">
                    <BookOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                    <p className="text-sm font-semibold text-foreground">
                        {isId ? 'Jadwal pelajaran belum tersedia' : 'No class schedule available yet'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                        {isId
                            ? 'Jadwal akan tampil setelah wali kelas atau admin mengatur rombel dan jadwal pelajaran.'
                            : 'Schedules will appear once the class timetable is published.'}
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {groupedByDay.map(([dayNum, items]) => (
                        <div
                            key={dayNum}
                            className="rounded-2xl border border-border bg-card p-5 shadow-xs"
                        >
                            <div className="mb-3.5 flex items-center gap-2 border-b border-border pb-2.5">
                                <Calendar size={16} className="text-emerald-600 dark:text-emerald-400" />
                                <h2 className="text-sm font-bold text-foreground">
                                    {isId ? DAY_NAMES_ID[dayNum] : DAY_NAMES_EN[dayNum]}
                                </h2>
                            </div>

                            <div className="space-y-2.5">
                                {items.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="rounded-xl border border-border bg-muted/25 p-3 text-xs"
                                    >
                                        <p className="font-semibold text-foreground">{entry.subjectName}</p>
                                        <p className="mt-0.5 text-muted-foreground">
                                            {entry.teacherName || (isId ? 'Guru Pengampu' : 'Teacher')}
                                            {entry.room ? ` • ${entry.room}` : ''}
                                        </p>
                                        <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                                            <Clock size={12} />
                                            <span>
                                                {entry.startTime.slice(0, 5)} - {entry.endTime.slice(0, 5)}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// 2. HALAMAN RIWAYAT PRESENSI SISWA / ORTU
// ============================================================================
export function PortalAttendancePage() {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { schoolId, students, activeStudent, setSelectedStudentId } = useActivePortalStudent();

    const { data: attendances = [], isLoading } = useQuery({
        queryKey: ['portal-student-attendances', schoolId, activeStudent?.studentId],
        enabled: Boolean(schoolId && activeStudent?.studentId),
        queryFn: () => fetchStudentAttendances(schoolId!, activeStudent!.studentId),
    });

    const summary = useMemo(() => {
        return {
            hadir: attendances.filter((a) => a.status === 'HADIR').length,
            terlambat: attendances.filter((a) => a.status === 'TERLAMBAT').length,
            sakit: attendances.filter((a) => a.status === 'SAKIT').length,
            izin: attendances.filter((a) => a.status === 'IZIN').length,
            alpa: attendances.filter((a) => a.status === 'ALPA').length,
        };
    }, [attendances]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">
                    {isId ? 'Riwayat Presensi' : 'Attendance History'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {activeStudent
                        ? `${activeStudent.fullName}${activeStudent.className ? ` • ${isId ? 'Kelas' : 'Class'} ${activeStudent.className}` : ''}`
                        : isId
                            ? 'Catatan kehadiran harian peserta didik'
                            : 'Daily student attendance logs'}
                </p>
            </div>

            <ChildSelectorBar
                students={students}
                activeStudent={activeStudent}
                onSelect={setSelectedStudentId}
                isId={isId}
            />

            {/* Ringkasan Status */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[
                    { label: 'Hadir', count: summary.hadir, tone: 'text-emerald-600 bg-emerald-500/10' },
                    { label: 'Terlambat', count: summary.terlambat, tone: 'text-amber-600 bg-amber-500/10' },
                    { label: 'Sakit', count: summary.sakit, tone: 'text-sky-600 bg-sky-500/10' },
                    { label: 'Izin', count: summary.izin, tone: 'text-violet-600 bg-violet-500/10' },
                    { label: 'Alpa', count: summary.alpa, tone: 'text-rose-600 bg-rose-500/10' },
                ].map((item) => (
                    <div
                        key={item.label}
                        className="rounded-2xl border border-border bg-card p-4 text-center shadow-xs"
                    >
                        <p className="text-2xl font-bold tabular-nums text-foreground">{item.count}</p>
                        <span
                            className={cn(
                                'mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                                item.tone
                            )}
                        >
                            {item.label}
                        </span>
                    </div>
                ))}
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                {isLoading ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        {isId ? 'Memuat data presensi...' : 'Loading attendance records...'}
                    </div>
                ) : attendances.length === 0 ? (
                    <div className="p-12 text-center">
                        <ClipboardCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground/60" />
                        <p className="text-sm font-semibold text-foreground">
                            {isId ? 'Belum ada data presensi tercatat' : 'No attendance records found'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Tanggal' : 'Date'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Status' : 'Status'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Jam Masuk' : 'Check-In'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Keterangan' : 'Notes'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {attendances.map((row) => (
                                    <tr key={row.id} className="hover:bg-muted/20">
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                                            {formatDate(row.date)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3">
                                            <span
                                                className={cn(
                                                    'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                                                    row.status === 'HADIR'
                                                        ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                        : row.status === 'TERLAMBAT'
                                                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                            : row.status === 'SAKIT' || row.status === 'IZIN'
                                                                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                                )}
                                            >
                                                {row.status}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-muted-foreground">
                                            {row.checkInTime
                                                ? new Date(row.checkInTime).toLocaleTimeString('id-ID', {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })
                                                : '-'}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{row.notes || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================================
// 3. HALAMAN TAGIHAN & RIWAYAT PEMBAYARAN SISWA / ORTU
// ============================================================================
export function PortalFinancePage() {
    const { locale } = useTranslation();
    const isId = locale === 'id';
    const { schoolId, students, activeStudent, setSelectedStudentId } = useActivePortalStudent();

    const { data: finance = { bills: [], payments: [] }, isLoading } = useQuery({
        queryKey: ['portal-student-finance', schoolId, activeStudent?.studentId],
        enabled: Boolean(schoolId && activeStudent?.studentId),
        queryFn: () => fetchStudentFinance(schoolId!, activeStudent!.studentId),
    });

    const totals = useMemo(() => {
        const totalBilled = finance.bills.reduce((acc, b) => acc + b.totalAmount, 0);
        const totalPaid = finance.bills.reduce((acc, b) => acc + b.paidAmount, 0);
        const remaining = Math.max(0, totalBilled - totalPaid);
        return { totalBilled, totalPaid, remaining };
    }, [finance.bills]);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold text-foreground">
                    {isId ? 'Tagihan & Pembayaran' : 'Bills & Payments'}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    {activeStudent
                        ? `${activeStudent.fullName}${activeStudent.className ? ` • ${isId ? 'Kelas' : 'Class'} ${activeStudent.className}` : ''}`
                        : isId
                            ? 'Informasi tagihan SPP dan riwayat transaksi pembayaran'
                            : 'Tuition bills and payment history'}
                </p>
            </div>

            <ChildSelectorBar
                students={students}
                activeStudent={activeStudent}
                onSelect={setSelectedStudentId}
                isId={isId}
            />

            {/* Ringkasan Keuangan */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <p className="text-xs text-muted-foreground">
                        {isId ? 'Total Tagihan' : 'Total Billed'}
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
                        {formatCurrency(totals.totalBilled)}
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <p className="text-xs text-muted-foreground">
                        {isId ? 'Sudah Dibayar' : 'Total Paid'}
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(totals.totalPaid)}
                    </p>
                </div>
                <div className="rounded-2xl border border-border bg-card p-5 shadow-xs">
                    <p className="text-xs text-muted-foreground">
                        {isId ? 'Sisa Tagihan' : 'Remaining Balance'}
                    </p>
                    <p className="mt-1 text-xl font-bold tabular-nums text-amber-600 dark:text-amber-400">
                        {formatCurrency(totals.remaining)}
                    </p>
                </div>
            </div>

            {/* Daftar Tagihan */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                    <Wallet size={16} className="text-emerald-600" />
                    <h2 className="text-sm font-bold text-foreground">
                        {isId ? 'Rincian Tagihan' : 'Bill Details'}
                    </h2>
                </div>

                {isLoading ? (
                    <div className="p-8 text-center text-sm text-muted-foreground">
                        {isId ? 'Memuat tagihan...' : 'Loading bills...'}
                    </div>
                ) : finance.bills.length === 0 ? (
                    <div className="p-10 text-center text-xs text-muted-foreground">
                        {isId ? 'Belum ada data tagihan.' : 'No bills recorded yet.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Nama Tagihan' : 'Bill Title'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Total' : 'Total'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Terbayar' : 'Paid'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Sisa' : 'Remaining'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Status' : 'Status'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {finance.bills.map((bill) => {
                                    const remaining = Math.max(0, bill.totalAmount - bill.paidAmount);
                                    return (
                                        <tr key={bill.id} className="hover:bg-muted/20">
                                            <td className="px-4 py-3">
                                                <p className="font-semibold text-foreground">{bill.title}</p>
                                                {bill.dueDate && (
                                                    <p className="text-[11px] text-muted-foreground">
                                                        {isId ? 'Jatuh tempo' : 'Due'}: {formatDate(bill.dueDate)}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-foreground">
                                                {formatCurrency(bill.totalAmount)}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-emerald-600 dark:text-emerald-400">
                                                {formatCurrency(bill.paidAmount)}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 font-semibold tabular-nums text-foreground">
                                                {formatCurrency(remaining)}
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3">
                                                <span
                                                    className={cn(
                                                        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                                                        bill.status === 'LUNAS'
                                                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                                                    )}
                                                >
                                                    {bill.status === 'LUNAS' ? (
                                                        <CheckCircle2 size={11} />
                                                    ) : (
                                                        <AlertCircle size={11} />
                                                    )}
                                                    {bill.status}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Riwayat Pembayaran */}
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
                <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
                    <Receipt size={16} className="text-emerald-600" />
                    <h2 className="text-sm font-bold text-foreground">
                        {isId ? 'Riwayat Transaksi Pembayaran' : 'Payment Transaction History'}
                    </h2>
                </div>

                {finance.payments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted-foreground">
                        {isId ? 'Belum ada transaksi pembayaran tercatat.' : 'No payment transactions yet.'}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="border-b border-border bg-muted/40 text-[11px] uppercase text-muted-foreground">
                                <tr>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Tanggal Bayar' : 'Date'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Metode' : 'Method'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Nominal' : 'Amount'}</th>
                                    <th className="px-4 py-3 font-semibold">{isId ? 'Referensi' : 'Reference'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {finance.payments.map((pay) => (
                                    <tr key={pay.id} className="hover:bg-muted/20">
                                        <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                                            {formatDate(pay.paymentDate)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                                            {pay.paymentMethod}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-3 font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                                            {formatCurrency(pay.amount)}
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground">{pay.reference || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}