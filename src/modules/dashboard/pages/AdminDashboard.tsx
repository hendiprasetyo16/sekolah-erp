import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users,
  GraduationCap,
  Wallet,
  AlertTriangle,
  Calendar,
  CreditCard,
  ClipboardCheck,
  Package,
  Award,
  FileText,
  UserPlus,
  BarChart3,
  Building2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';

import { supabase } from '@/services/supabase.client';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { formatCurrency, formatNumber, formatDate } from '@/utils/format';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

// --- TIPE DATA ---
interface StudentSummaryRow {
  id: string;
  gender: 'L' | 'P' | null;
  status: string | null;
}

interface PaymentTransactionRow {
  amount: number | string;
  paymentDate: string;
}

interface PendingBillRow {
  totalAmount: number | string;
  paidAmount: number | string;
}

interface AttendanceStatusRow {
  status: string | null;
}

interface TooltipPayloadItem {
  color?: string;
  value: number;
  name: string;
  payload?: {
    color?: string;
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
  valueFormat?: 'currency' | 'number';
}

interface StatCardProps {
  title: string;
  value: number;
  badgeText: string;
  badgeTone?: 'emerald' | 'teal' | 'violet' | 'amber';
  icon: LucideIcon;
  gradient: string;
  format?: 'number' | 'currency' | 'percentage';
  isLoading?: boolean;
}

interface QuickActionItem {
  id: string;
  icon: LucideIcon;
  label: string;
  tone: 'emerald' | 'teal' | 'sky' | 'amber' | 'violet' | 'rose';
  path: string;
  allowed: boolean;
}

const BADGE_TONE_STYLES: Record<NonNullable<StatCardProps['badgeTone']>, string> = {
  emerald: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  teal: 'border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300',
  violet: 'border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300',
  amber: 'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
};

const QUICK_ACTION_TONE_STYLES: Record<QuickActionItem['tone'], string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400',
  sky: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

/**
 * Memformat angka nominal besar pada sumbu Y grafik menjadi ringkas (Jt / Rb).
 */
function formatCompactAxisValue(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} Rb`;
  return String(value);
}

/**
 * Tooltip adaptif tema (Light & Dark mode) untuk seluruh grafik Recharts.
 */
function CustomTooltip({
  active,
  payload,
  label,
  valueFormat = 'currency',
}: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur-md">
      {label && <p className="mb-1.5 text-xs font-medium text-muted-foreground">{label}</p>}
      {payload.map((entry, idx) => {
        const dotColor = entry.color || entry.payload?.color || '#10b981';
        const formattedValue =
          valueFormat === 'currency'
            ? formatCurrency(Number(entry.value) || 0)
            : formatNumber(Number(entry.value) || 0);

        return (
          <div key={`${entry.name}-${idx}`} className="flex items-center gap-2 text-xs">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: dotColor }}
            />
            <span className="text-muted-foreground">{entry.name}:</span>
            <span className="font-bold tabular-nums text-foreground">{formattedValue}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Kartu Metrik Utama Dasbor.
 */
function StatCard({
  title,
  value,
  badgeText,
  badgeTone = 'emerald',
  icon: Icon,
  gradient,
  format = 'number',
  isLoading = false,
}: StatCardProps) {
  const displayValue =
    format === 'currency'
      ? formatCurrency(value)
      : format === 'percentage'
        ? `${value}%`
        : formatNumber(value);

  return (
    <motion.div
      variants={itemVariants}
      className="rounded-2xl border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', gradient)}>
          <Icon size={21} className="text-white" />
        </div>
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
            BADGE_TONE_STYLES[badgeTone]
          )}
        >
          {badgeText}
        </span>
      </div>

      {isLoading ? (
        <div className="mb-1.5 h-8 w-28 animate-pulse rounded-lg bg-muted" />
      ) : (
        <p className="mb-1 truncate text-2xl font-bold tabular-nums text-foreground" title={displayValue}>
          {displayValue}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{title}</p>
    </motion.div>
  );
}

export function AdminDashboard() {
  const { t, locale } = useTranslation();

  // 1. KONTEKS PENGGUNA, SEKOLAH AKTIF & HAK AKSES (RBAC)
  const { user, school, academicYear } = useAuthStore();
  const schoolId = school?.id ?? null;
  const role = user?.role ?? '';

  const isManager = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'KEPALA_SEKOLAH'].includes(role);
  const canViewFinance = ['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'BENDAHARA'].includes(role);
  const canPrintLetters = ['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'KEPALA_SEKOLAH', 'STAFF_TU'].includes(role);

  // 2. FETCH DATA SISWA AKTIF PER SEKOLAH
  const { data: studentsData = [], isLoading: isLoadingStudents } = useQuery<StudentSummaryRow[]>({
    queryKey: ['dashboard-students-data', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from('students')
        .select('id, gender, status')
        .eq('schoolId', schoolId);

      if (error || !data) return [];
      return data as StudentSummaryRow[];
    },
  });

  // 3. FETCH DATA PENERIMA PIP PER SEKOLAH
  const { data: pipCount = 0 } = useQuery<number>({
    queryKey: ['dashboard-pip-count', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return 0;
      const { count, error } = await supabase
        .from('student_economics')
        .select('*', { count: 'exact', head: true })
        .eq('schoolId', schoolId)
        .or('hasKip.eq.true,layakPip.eq.true,desil.lte.4');

      if (error) {
        const fallback = await supabase
          .from('student_economics')
          .select('*', { count: 'exact', head: true })
          .eq('schoolId', schoolId)
          .or('hasKip.eq.true,layakPip.eq.true');
        return fallback.count ?? 0;
      }
      return count ?? 0;
    },
  });

  // 4. FETCH DATA GURU & STAF PER SEKOLAH
  const { data: teachersCount = 0, isLoading: isLoadingTeachers } = useQuery<number>({
    queryKey: ['dashboard-teachers-count', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return 0;
      const { count, error } = await supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('schoolId', schoolId);

      if (error) return 0;
      return count ?? 0;
    },
  });

  // 5. FETCH DATA KEUANGAN REAL-TIME PER SEKOLAH (KHUSUS MANAJER & BENDAHARA)
  const { data: financeData, isLoading: isLoadingFinance } = useQuery({
    queryKey: ['dashboard-finance-data', schoolId],
    enabled: Boolean(schoolId) && canViewFinance,
    queryFn: async () => {
      if (!schoolId) {
        return { monthlyRevenue: 0, pendingPayments: 0, revenueData: [] };
      }

      const [incomeRes, billsRes] = await Promise.all([
        supabase
          .from('payment_transactions')
          .select('amount, paymentDate')
          .eq('schoolId', schoolId)
          .eq('status', 'BERHASIL'),
        supabase
          .from('student_bills')
          .select('totalAmount, paidAmount')
          .eq('schoolId', schoolId)
          .in('status', ['BELUM_BAYAR', 'CICILAN']),
      ]);

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let currentMonthIncome = 0;
      const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthLabels = locale === 'id' ? monthNamesId : monthNamesEn;

      // Siapkan 6 bulan terakhir secara berurutan
      const chartBuckets: { key: string; month: string; pemasukan: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(currentYear, currentMonth - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        chartBuckets.push({
          key,
          month: monthLabels[d.getMonth()],
          pemasukan: 0,
        });
      }

      const incomeRows = (incomeRes.data as PaymentTransactionRow[] | null) ?? [];
      for (const trx of incomeRows) {
        const d = new Date(trx.paymentDate);
        if (Number.isNaN(d.getTime())) continue;

        const amountValue = Number(trx.amount) || 0;
        if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
          currentMonthIncome += amountValue;
        }

        const bucketKey = `${d.getFullYear()}-${d.getMonth()}`;
        const bucket = chartBuckets.find((b) => b.key === bucketKey);
        if (bucket) {
          bucket.pemasukan += amountValue;
        }
      }

      const billRows = (billsRes.data as PendingBillRow[] | null) ?? [];
      const pending = billRows.reduce(
        (acc, b) => acc + Math.max(0, (Number(b.totalAmount) || 0) - (Number(b.paidAmount) || 0)),
        0
      );

      return {
        monthlyRevenue: currentMonthIncome,
        pendingPayments: pending,
        revenueData: chartBuckets.map(({ month, pemasukan }) => ({ month, pemasukan })),
      };
    },
  });

  // 6. FETCH RINGKASAN OPERASIONAL HARIAN (PRESENSI HARI INI, SARPRAS RUSAK, SURAT MASUK)
  const { data: operationalSummary } = useQuery({
    queryKey: ['dashboard-operational-summary', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) {
        return { attendanceRate: 0, damagedAssets: 0, incomingLetters: 0 };
      }

      const todayIso = new Date().toISOString().slice(0, 10);

      const [attendanceRes, damagedRes, lettersRes] = await Promise.all([
        supabase
          .from('student_attendance')
          .select('status')
          .eq('schoolId', schoolId)
          .eq('date', todayIso),
        supabase
          .from('assets')
          .select('*', { count: 'exact', head: true })
          .eq('schoolId', schoolId)
          .in('condition', ['RUSAK', 'RUSAK_RINGAN', 'RUSAK_BERAT']),
        supabase
          .from('letters')
          .select('*', { count: 'exact', head: true })
          .eq('schoolId', schoolId)
          .eq('type', 'MASUK'),
      ]);

      const attendanceRows = (attendanceRes.data as AttendanceStatusRow[] | null) ?? [];
      const presentCount = attendanceRows.filter((row) => row.status === 'HADIR').length;
      const attendanceRate =
        attendanceRows.length > 0 ? Math.round((presentCount / attendanceRows.length) * 100) : 0;

      return {
        attendanceRate,
        damagedAssets: damagedRes.error ? 0 : (damagedRes.count ?? 0),
        incomingLetters: lettersRes.error ? 0 : (lettersRes.count ?? 0),
      };
    },
  });

  // --- KALKULASI DATA SISWA AKTIF ---
  const activeStudents = useMemo(
    () => studentsData.filter((s) => !s.status || s.status === 'AKTIF'),
    [studentsData]
  );

  const totalStudents = activeStudents.length;
  const monthlyRevenue = financeData?.monthlyRevenue ?? 0;
  const pendingPayments = financeData?.pendingPayments ?? 0;
  const revenueChartData = financeData?.revenueData ?? [];

  const studentDistribution = useMemo(() => {
    const maleCount = activeStudents.filter((s) => s.gender === 'L').length;
    const femaleCount = activeStudents.filter((s) => s.gender === 'P').length;
    return [
      { name: locale === 'id' ? 'Laki-laki' : 'Male', value: maleCount, color: '#0ea5e9' },
      { name: locale === 'id' ? 'Perempuan' : 'Female', value: femaleCount, color: '#ec4899' },
    ];
  }, [activeStudents, locale]);

  // 7. QUICK ACTIONS DENGAN RUTE YANG VALID SESUAI SIDEBAR
  const allQuickActions: QuickActionItem[] = [
    {
      id: 'add-student',
      icon: UserPlus,
      label: locale === 'id' ? 'Data Siswa' : 'Students',
      tone: 'sky',
      path: '/students',
      allowed: isManager,
    },
    {
      id: 'receive-payment',
      icon: CreditCard,
      label: locale === 'id' ? 'Terima Pembayaran' : 'Receive Payment',
      tone: 'emerald',
      path: '/finance/payments',
      allowed: canViewFinance,
    },
    {
      id: 'attendance-report',
      icon: ClipboardCheck,
      label: locale === 'id' ? 'Rekap Presensi' : 'Attendance',
      tone: 'amber',
      path: '/attendance',
      allowed: true,
    },
    {
      id: 'administration',
      icon: FileText,
      label: locale === 'id' ? 'Administrasi Surat' : 'Administration',
      tone: 'violet',
      path: '/admin',
      allowed: canPrintLetters,
    },
    {
      id: 'schedules',
      icon: Calendar,
      label: locale === 'id' ? 'Jadwal Pelajaran' : 'Schedules',
      tone: 'teal',
      path: '/schedules',
      allowed: true,
    },
    {
      id: 'reports',
      icon: BarChart3,
      label: locale === 'id' ? 'Laporan Terpadu' : 'Reports',
      tone: 'rose',
      path: '/reports',
      allowed: canViewFinance || isManager,
    },
  ];

  const quickActions = allQuickActions.filter((action) => action.allowed);

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* =====================================================================
          WELCOME BANNER EMERALD-TEAL DENGAN IDENTITAS SEKOLAH AKTIF
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
              <div className="mb-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-emerald-50 backdrop-blur-xs">
                <Building2 size={13} />
                <span>{school.name}</span>
                {academicYear?.name && (
                  <span className="text-emerald-200">• TA {academicYear.name}</span>
                )}
              </div>
            )}

            <h1 className="mb-1.5 text-2xl font-bold tracking-tight text-white lg:text-3xl">
              {t('dashboard.welcome', { name: user?.fullName?.split(' ')[0] || 'User' })}
            </h1>
            <p className="text-sm text-emerald-100/85">
              {locale === 'id'
                ? 'Ringkasan operasional akademik, presensi, dan keuangan satuan pendidikan hari ini.'
                : 'Today’s operational summary for academics, attendance, and school finance.'}
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
          KARTU STATISTIK UTAMA (MENYESUAIKAN HAK AKSES KEUANGAN)
         ===================================================================== */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2',
          canViewFinance ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
        )}
      >
        <StatCard
          title={t('dashboard.totalStudents')}
          value={totalStudents}
          badgeText={locale === 'id' ? 'Siswa Aktif' : 'Active'}
          badgeTone="emerald"
          icon={Users}
          gradient="bg-linear-to-br from-emerald-500 to-teal-700"
          isLoading={isLoadingStudents}
        />
        <StatCard
          title={t('dashboard.totalTeachers')}
          value={teachersCount}
          badgeText={locale === 'id' ? 'Terdaftar' : 'Registered'}
          badgeTone="teal"
          icon={GraduationCap}
          gradient="bg-linear-to-br from-teal-500 to-cyan-700"
          isLoading={isLoadingTeachers}
        />

        {canViewFinance && (
          <>
            <StatCard
              title={t('dashboard.monthlyRevenue')}
              value={monthlyRevenue}
              badgeText={locale === 'id' ? 'Bulan Ini' : 'This Month'}
              badgeTone="violet"
              icon={Wallet}
              gradient="bg-linear-to-br from-violet-500 to-indigo-700"
              format="currency"
              isLoading={isLoadingFinance}
            />
            <StatCard
              title={t('dashboard.pendingPayments')}
              value={pendingPayments}
              badgeText={locale === 'id' ? 'Belum Lunas' : 'Unpaid'}
              badgeTone="amber"
              icon={AlertTriangle}
              gradient="bg-linear-to-br from-amber-500 to-orange-600"
              format="currency"
              isLoading={isLoadingFinance}
            />
          </>
        )}
      </div>

      {/* =====================================================================
          KARTU STATISTIK OPERASIONAL SEKUNDER
         ===================================================================== */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          {
            title: t('dashboard.attendanceToday'),
            value: `${operationalSummary?.attendanceRate ?? 0}%`,
            icon: ClipboardCheck,
            color: 'text-emerald-600 dark:text-emerald-400',
            bg: 'bg-emerald-500/10',
          },
          {
            title: t('dashboard.damagedItems'),
            value: formatNumber(operationalSummary?.damagedAssets ?? 0),
            icon: Package,
            color: 'text-rose-600 dark:text-rose-400',
            bg: 'bg-rose-500/10',
          },
          {
            title: t('dashboard.pipRecipients'),
            value: formatNumber(pipCount),
            icon: Award,
            color: 'text-sky-600 dark:text-sky-400',
            bg: 'bg-sky-500/10',
          },
          {
            title: t('dashboard.incomingLetters'),
            value: formatNumber(operationalSummary?.incomingLetters ?? 0),
            icon: FileText,
            color: 'text-amber-600 dark:text-amber-400',
            bg: 'bg-amber-500/10',
          },
        ].map((stat) => (
          <motion.div
            key={stat.title}
            variants={itemVariants}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs"
          >
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', stat.bg)}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold tabular-nums text-foreground">{stat.value}</p>
              <p className="truncate text-xs text-muted-foreground">{stat.title}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* =====================================================================
          BARIS GRAFIK ANALITIK (PEMASUKAN 6 BULAN & DISTRIBUSI GENDER SISWA)
         ===================================================================== */}
      <div
        className={cn(
          'grid gap-4',
          canViewFinance ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1 lg:grid-cols-2'
        )}
      >
        {canViewFinance && (
          <motion.div
            variants={itemVariants}
            className="rounded-2xl border border-border bg-card p-5 shadow-xs lg:col-span-2"
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-foreground">{t('dashboard.revenueChart')}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {locale === 'id'
                    ? 'Rekapitulasi transaksi pembayaran terverifikasi 6 bulan terakhir'
                    : 'Verified payment transactions over the last 6 months'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-muted-foreground">
                  {locale === 'id' ? 'Pemasukan' : 'Income'}
                </span>
              </div>
            </div>

            <div className="relative h-67.5 w-full">
              {revenueChartData.length === 0 ||
                revenueChartData.every((d) => d.pemasukan === 0) ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/40 backdrop-blur-[1px]">
                  <div className="max-w-xs rounded-xl border border-border bg-card/95 p-4 text-center shadow-md">
                    <Wallet className="mx-auto mb-2 h-7 w-7 text-emerald-600 dark:text-emerald-400" />
                    <p className="text-xs font-bold text-foreground">
                      {locale === 'id'
                        ? 'Belum Ada Transaksi Pembayaran'
                        : 'No Payment Transactions Yet'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {locale === 'id'
                        ? 'Grafik akan terisi otomatis saat pembayaran tagihan siswa tercatat.'
                        : 'Chart will populate automatically as student bill payments are recorded.'}
                    </p>
                  </div>
                </div>
              ) : null}

              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradIncomeEmerald" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.32} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#71717a' }}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                    tickFormatter={formatCompactAxisValue}
                  />
                  <RechartsTooltip
                    content={
                      <CustomTooltip
                        valueFormat="currency"
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    name={locale === 'id' ? 'Pemasukan' : 'Income'}
                    dataKey="pemasukan"
                    stroke="#10b981"
                    fill="url(#gradIncomeEmerald)"
                    strokeWidth={2.5}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* Grafik Distribusi Gender Siswa */}
        <motion.div
          variants={itemVariants}
          className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-xs"
        >
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {t('dashboard.studentDistribution')}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {locale === 'id' ? 'Proporsi peserta didik aktif' : 'Active student gender ratio'}
            </p>
          </div>

          <div className="my-2 h-50 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={studentDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {studentDistribution.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip content={<CustomTooltip valueFormat="number" />} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
            {studentDistribution.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="truncate text-muted-foreground">{entry.name}</span>
                <span className="ml-auto font-bold tabular-nums text-foreground">
                  {formatNumber(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* =====================================================================
          AKSES CEPAT MODUL OPERASIONAL (QUICK ACTIONS)
         ===================================================================== */}
      {quickActions.length > 0 && (
        <motion.div
          variants={itemVariants}
          className="rounded-2xl border border-border bg-card p-5 shadow-xs"
        >
          <h3 className="mb-4 text-sm font-bold text-foreground">{t('dashboard.quickActions')}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {quickActions.map((action) => (
              <Link
                key={action.id}
                to={action.path}
                className="group flex flex-col items-center gap-2.5 rounded-xl border border-border bg-muted/25 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-500/40 hover:bg-muted/50 hover:shadow-sm"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-110',
                    QUICK_ACTION_TONE_STYLES[action.tone]
                  )}
                >
                  <action.icon size={19} />
                </div>
                <span className="text-center text-xs font-semibold text-foreground">
                  {action.label}
                </span>
              </Link>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}