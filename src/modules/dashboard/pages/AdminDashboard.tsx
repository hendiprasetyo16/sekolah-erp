// src/modules/dashboard/pages/AdminDashboard.tsx
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
  AlertCircle,
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
import { handlePortalDbError } from '../services/portal.service';

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

/**
 * Menghasilkan tanggal YYYY-MM-DD sesuai zona waktu lokal pengguna (WIB/WITA/WIT).
 */
function getLocalTodayIso(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Menghasilkan timestamp UTC ISO dari awal bulan 5 bulan lalu (pukul 00:00:00 waktu lokal)
 * agar transaksi dini hari pada tanggal 1 di WIB/WITA/WIT tetap masuk dalam grafik.
 */
function getSixMonthsWindowStartIso(): string {
  const now = new Date();
  const startLocal = new Date(now.getFullYear(), now.getMonth() - 5, 1, 0, 0, 0, 0);
  return startLocal.toISOString();
}

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

function formatCompactAxisValue(value: number): string {
  if (value === 0) return '0';
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)} M`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} Jt`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} Rb`;
  return String(value);
}

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
  const isId = locale === 'id';

  const { user, school, academicYear } = useAuthStore();
  const schoolId = school?.id ?? null;
  const userId = user?.id ?? null;

  // Ambil seluruh role aktif dari RPC v17 (role utama + additionalRoles + tugasTambahan Dapodik)
  const { data: rpcRoles = [] } = useQuery<string[]>({
    queryKey: ['user-all-roles', schoolId, userId],
    enabled: Boolean(userId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (
        supabase.rpc as unknown as (
          fn: string
        ) => Promise<{ data: string[] | null; error: unknown }>
      )('get_user_all_roles');

      if (error || !Array.isArray(data)) return [];
      return data;
    },
  });

  const activeRoles = useMemo(() => {
    const roleSet = new Set<string>();
    if (user?.role) roleSet.add(user.role);
    const extraRoles = (user as (typeof user & { additionalRoles?: string[] }) | null)
      ?.additionalRoles;
    if (Array.isArray(extraRoles)) {
      for (const r of extraRoles) {
        if (r) roleSet.add(r);
      }
    }
    for (const r of rpcRoles) {
      if (r) roleSet.add(r);
    }
    return Array.from(roleSet);
  }, [user, rpcRoles]);

  const hasAnyRole = (allowedRoles: string[]) =>
    activeRoles.some((r) => allowedRoles.includes(r));

  const isManager = hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'KEPALA_SEKOLAH']);
  const canViewFinance = hasAnyRole(['SUPER_ADMIN', 'ADMIN', 'KEPALA_SEKOLAH', 'BENDAHARA']);
  const canPrintLetters = hasAnyRole([
    'SUPER_ADMIN',
    'ADMIN',
    'OPERATOR',
    'KEPALA_SEKOLAH',
    'STAFF_TU',
  ]);

  // 1. FETCH DATA SISWA AKTIF PER SEKOLAH
  const {
    data: studentsData = [],
    isLoading: isLoadingStudents,
    isError: isErrorStudents,
  } = useQuery<StudentSummaryRow[]>({
    queryKey: ['dashboard-students-data', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return [];
      const { data, error } = await supabase
        .from('students')
        .select('id, gender, status')
        .eq('schoolId', schoolId);

      if (error) throw handlePortalDbError(error);
      return (data as StudentSummaryRow[] | null) ?? [];
    },
  });

  // 2. FETCH DATA PENERIMA PIP PER SEKOLAH
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
        if (fallback.error) return 0;
        return fallback.count ?? 0;
      }
      return count ?? 0;
    },
  });

  // 3. FETCH DATA GURU & STAF AKTIF PER SEKOLAH
  const {
    data: teachersCount = 0,
    isLoading: isLoadingTeachers,
    isError: isErrorTeachers,
  } = useQuery<number>({
    queryKey: ['dashboard-teachers-count', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) return 0;
      const { count, error } = await supabase
        .from('teachers')
        .select('*', { count: 'exact', head: true })
        .eq('schoolId', schoolId)
        .eq('isActive', true);

      if (error) throw handlePortalDbError(error);
      return count ?? 0;
    },
  });

  // 4. FETCH DATA KEUANGAN 6 BULAN TERAKHIR PER SEKOLAH
  const {
    data: financeData,
    isLoading: isLoadingFinance,
    isError: isErrorFinance,
  } = useQuery({
    queryKey: ['dashboard-finance-data', schoolId],
    enabled: Boolean(schoolId) && canViewFinance,
    queryFn: async () => {
      if (!schoolId) {
        return { monthlyRevenue: 0, pendingPayments: 0, revenueData: [] };
      }

      const sixMonthsStartIso = getSixMonthsWindowStartIso();

      const [incomeRes, billsRes] = await Promise.all([
        supabase
          .from('payment_transactions')
          .select('amount, paymentDate')
          .eq('schoolId', schoolId)
          .eq('status', 'BERHASIL')
          .gte('paymentDate', sixMonthsStartIso),
        supabase
          .from('student_bills')
          .select('totalAmount, paidAmount')
          .eq('schoolId', schoolId)
          .in('status', ['BELUM_BAYAR', 'CICILAN']),
      ]);

      if (incomeRes.error) throw handlePortalDbError(incomeRes.error);
      if (billsRes.error) throw handlePortalDbError(billsRes.error);

      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      let currentMonthIncome = 0;
      const monthNamesId = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      const monthNamesEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthLabels = isId ? monthNamesId : monthNamesEn;

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

  // 5. FETCH RINGKASAN OPERASIONAL HARIAN (SESUAI SKEMA DATABASE v17)
  const {
    data: operationalSummary,
    isError: isErrorOperational,
  } = useQuery({
    queryKey: ['dashboard-operational-summary', schoolId],
    enabled: Boolean(schoolId),
    queryFn: async () => {
      if (!schoolId) {
        return { attendanceRate: 0, damagedAssets: 0, incomingLetters: 0 };
      }

      const todayIso = getLocalTodayIso();

      const [attendanceRes, damagedRes, lettersRes] = await Promise.all([
        supabase
          .from('attendances')
          .select('status')
          .eq('schoolId', schoolId)
          .eq('type', 'SISWA')
          .eq('date', todayIso),
        supabase
          .from('inventory_items')
          .select('*', { count: 'exact', head: true })
          .eq('schoolId', schoolId)
          .eq('isActive', true)
          .in('condition', ['RUSAK', 'RUSAK_RINGAN', 'RUSAK_BERAT']),
        supabase
          .from('administration_records')
          .select('*', { count: 'exact', head: true })
          .eq('schoolId', schoolId)
          .eq('category', 'SURAT_MASUK'),
      ]);

      if (attendanceRes.error) throw handlePortalDbError(attendanceRes.error);

      const attendanceRows = (attendanceRes.data as AttendanceStatusRow[] | null) ?? [];
      const presentCount = attendanceRows.filter(
        (row) => row.status === 'HADIR' || row.status === 'TERLAMBAT'
      ).length;
      const attendanceRate =
        attendanceRows.length > 0 ? Math.round((presentCount / attendanceRows.length) * 100) : 0;

      return {
        attendanceRate,
        damagedAssets: damagedRes.error ? 0 : (damagedRes.count ?? 0),
        incomingLetters: lettersRes.error ? 0 : (lettersRes.count ?? 0),
      };
    },
  });

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
      { name: isId ? 'Laki-laki' : 'Male', value: maleCount, color: '#0ea5e9' },
      { name: isId ? 'Perempuan' : 'Female', value: femaleCount, color: '#ec4899' },
    ];
  }, [activeStudents, isId]);

  const allQuickActions: QuickActionItem[] = [
    {
      id: 'add-student',
      icon: UserPlus,
      label: isId ? 'Data Siswa' : 'Students',
      tone: 'sky',
      path: '/students',
      allowed: isManager,
    },
    {
      id: 'receive-payment',
      icon: CreditCard,
      label: isId ? 'Terima Pembayaran' : 'Receive Payment',
      tone: 'emerald',
      path: '/finance/payments',
      allowed: canViewFinance,
    },
    {
      id: 'attendance-report',
      icon: ClipboardCheck,
      label: isId ? 'Rekap Presensi' : 'Attendance',
      tone: 'amber',
      path: '/attendance',
      allowed: true,
    },
    {
      id: 'administration',
      icon: FileText,
      label: isId ? 'Administrasi Surat' : 'Administration',
      tone: 'violet',
      path: '/admin',
      allowed: canPrintLetters,
    },
    {
      id: 'schedules',
      icon: Calendar,
      label: isId ? 'Jadwal Pelajaran' : 'Schedules',
      tone: 'teal',
      path: '/schedules',
      allowed: true,
    },
    {
      id: 'reports',
      icon: BarChart3,
      label: isId ? 'Laporan Terpadu' : 'Reports',
      tone: 'rose',
      path: '/reports',
      allowed: canViewFinance || isManager,
    },
  ];

  const quickActions = allQuickActions.filter((action) => action.allowed);
  const hasLoadError =
    isErrorStudents || isErrorTeachers || isErrorFinance || isErrorOperational;

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="space-y-6">
      {/* WELCOME BANNER */}
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
              {isId
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

      {/* PERINGATAN JIKA SEBAGIAN DATA GAGAL DIMUAT */}
      {hasLoadError && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-300/60 bg-rose-50/70 p-4 text-xs text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>
            {isId
              ? 'Sebagian statistik gagal dimuat dari server. Periksa koneksi internet Anda lalu muat ulang halaman.'
              : 'Some dashboard statistics failed to load. Please check your internet connection and refresh.'}
          </span>
        </div>
      )}

      {/* KARTU STATISTIK UTAMA */}
      <div
        className={cn(
          'grid grid-cols-1 gap-4 sm:grid-cols-2',
          canViewFinance ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
        )}
      >
        <StatCard
          title={t('dashboard.totalStudents')}
          value={totalStudents}
          badgeText={isId ? 'Siswa Aktif' : 'Active'}
          badgeTone="emerald"
          icon={Users}
          gradient="bg-linear-to-br from-emerald-500 to-teal-700"
          isLoading={isLoadingStudents}
        />
        <StatCard
          title={t('dashboard.totalTeachers')}
          value={teachersCount}
          badgeText={isId ? 'PTK Aktif' : 'Active'}
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
              badgeText={isId ? 'Bulan Ini' : 'This Month'}
              badgeTone="violet"
              icon={Wallet}
              gradient="bg-linear-to-br from-violet-500 to-indigo-700"
              format="currency"
              isLoading={isLoadingFinance}
            />
            <StatCard
              title={t('dashboard.pendingPayments')}
              value={pendingPayments}
              badgeText={isId ? 'Belum Lunas' : 'Unpaid'}
              badgeTone="amber"
              icon={AlertTriangle}
              gradient="bg-linear-to-br from-amber-500 to-orange-600"
              format="currency"
              isLoading={isLoadingFinance}
            />
          </>
        )}
      </div>

      {/* KARTU STATISTIK OPERASIONAL SEKUNDER */}
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

      {/* BARIS GRAFIK ANALITIK */}
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
                  {isId
                    ? 'Rekapitulasi transaksi pembayaran terverifikasi 6 bulan terakhir'
                    : 'Verified payment transactions over the last 6 months'}
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span className="font-medium text-muted-foreground">
                  {isId ? 'Pemasukan' : 'Income'}
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
                      {isId
                        ? 'Belum Ada Transaksi Pembayaran'
                        : 'No Payment Transactions Yet'}
                    </p>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                      {isId
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
                  <RechartsTooltip content={<CustomTooltip valueFormat="currency" />} />
                  <Area
                    type="monotone"
                    name={isId ? 'Pemasukan' : 'Income'}
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
              {isId ? 'Proporsi peserta didik aktif' : 'Active student gender ratio'}
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

      {/* AKSES CEPAT MODUL OPERASIONAL */}
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