import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Users, GraduationCap, Wallet, AlertTriangle,
  TrendingUp, TrendingDown, Calendar, CreditCard,
  ClipboardCheck, Package, Award, FileText,
  UserPlus, BarChart3, ArrowUpRight, Clock,
  Pin
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from 'recharts';

import { supabase } from '@/services/supabase.client';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { formatCurrency, formatNumber, formatDate } from '@/utils/format';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

// --- TYPES ---
interface TooltipPayloadItem {
  color: string;
  value: number;
  name: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}

// Custom Tooltip for charts
function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl p-3 shadow-2xl">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span className="text-foreground font-medium">
            {entry.value > 1000 ? formatCurrency(entry.value) : formatNumber(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  title, value, change, icon: Icon, gradient, format = 'number',
}: {
  title: string;
  value: number;
  change: number;
  icon: LucideIcon;
  gradient: string;
  format?: 'number' | 'currency' | 'percentage';
}) {
  const isPositive = change >= 0;
  const displayValue = format === 'currency'
    ? formatCurrency(value)
    : format === 'percentage'
      ? `${value}%`
      : formatNumber(value);

  return (
    <motion.div variants={item} className="glass-card p-5 group hover:scale-[1.02] transition-transform duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center', gradient)}>
          <Icon size={22} className="text-white" />
        </div>
        <div className={cn(
          'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
          isPositive ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
        )}>
          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(change)}%
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground mb-1">{displayValue}</p>
      <p className="text-xs text-muted-foreground">{title}</p>
    </motion.div>
  );
}

export function AdminDashboard() {
  const { t, locale } = useTranslation();
  const { user } = useAuthStore();

  // 1. FETCH DATA SISWA 
  const { data: studentsData = [] } = useQuery({
    queryKey: ['dashboard-students-data'],
    queryFn: async () => {
      // HANYA ambil data yang ada di tabel students (jangan panggil economic di sini)
      const { data, error } = await supabase.from('students').select('id, gender, status');
      if (error) return [];
      return data as { id: string; gender: 'L' | 'P'; status: string }[];
    }
  });

  // 2. FETCH DATA PIP (Dari tabel student_economics terpisah)
  const { data: pipCount = 0 } = useQuery({
    queryKey: ['dashboard-pip-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('student_economics')
        .select('*', { count: 'exact', head: true })
        .eq('hasKip', true);
      if (error) return 0;
      return count || 0;
    }
  });

  // 3. FETCH DATA GURU
  const { data: teachersCount = 0 } = useQuery({
    queryKey: ['dashboard-teachers-count'],
    queryFn: async () => {
      const { count, error } = await supabase.from('teachers').select('*', { count: 'exact', head: true });
      if (error) return 0;
      return count || 0;
    }
  });

  // --- KALKULASI DATA REAL DARI DATABASE ---
  const totalStudents = studentsData.length;
  const pipRecipientsCount = pipCount; // Menggunakan hasil kueri PIP terpisah

  const studentDistribution = useMemo(() => {
    const maleCount = studentsData.filter(s => s.gender === 'L').length;
    const femaleCount = studentsData.filter(s => s.gender === 'P').length;
    return [
      { name: locale === 'id' ? 'Laki-laki' : 'Male', value: maleCount, color: '#3b82f6' },
      { name: locale === 'id' ? 'Perempuan' : 'Female', value: femaleCount, color: '#ec4899' },
    ];
  }, [studentsData, locale]);

  // --- PLACEHOLDER UNTUK MODUL SELANJUTNYA ---
  const dummyRevenueData = [
    { month: 'Jan', pemasukan: 0, pengeluaran: 0 },
    { month: 'Feb', pemasukan: 0, pengeluaran: 0 },
    { month: 'Mar', pemasukan: 0, pengeluaran: 0 },
    { month: 'Apr', pemasukan: 0, pengeluaran: 0 },
    { month: 'Mei', pemasukan: 0, pengeluaran: 0 },
  ];
  const pendingPayments = 0;
  const monthlyRevenue = 0;

  const quickActions = [
    { id: '1', icon: UserPlus, label: locale === 'id' ? 'Tambah Siswa' : 'Add Student', color: 'indigo', path: '/students/new' },
    { id: '2', icon: CreditCard, label: locale === 'id' ? 'Terima SPP' : 'Receive Fee', color: 'emerald', path: '/finance' },
    { id: '3', icon: ClipboardCheck, label: locale === 'id' ? 'Absensi' : 'Attendance', color: 'amber', path: '/' },
    { id: '4', icon: FileText, label: locale === 'id' ? 'Cetak Surat' : 'Print Letter', color: 'violet', path: '/' },
    { id: '5', icon: Calendar, label: locale === 'id' ? 'Jadwal' : 'Schedule', color: 'cyan', path: '/' },
    { id: '6', icon: BarChart3, label: locale === 'id' ? 'Laporan' : 'Reports', color: 'rose', path: '/' },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Welcome Banner */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl p-6 lg:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-800 opacity-90" />
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)` }} />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              {t('dashboard.welcome', { name: user?.fullName?.split(' ')[0] || 'Admin' })} 👋
            </h1>
            <p className="text-white/70 text-sm lg:text-base">
              {locale === 'id' ? 'Berikut ringkasan data sekolah Anda hari ini.' : "Here's your school data summary for today."}
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/20">
            <Calendar size={20} className="text-white/70" />
            <div>
              <p className="text-white text-sm font-medium">{formatDate(new Date(), 'dddd')}</p>
              <p className="text-white/60 text-xs">{formatDate(new Date())}</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title={t('dashboard.totalStudents')} value={totalStudents} change={+2.4} icon={Users} gradient="stat-gradient-indigo" />
        <StatCard title={t('dashboard.totalTeachers')} value={teachersCount} change={0} icon={GraduationCap} gradient="stat-gradient-emerald" />
        <StatCard title={t('dashboard.monthlyRevenue')} value={monthlyRevenue} change={0} icon={Wallet} gradient="stat-gradient-violet" format="currency" />
        <StatCard title={t('dashboard.pendingPayments')} value={pendingPayments} change={0} icon={AlertTriangle} gradient="stat-gradient-amber" format="currency" />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { title: t('dashboard.attendanceToday'), value: `0%`, icon: ClipboardCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { title: t('dashboard.damagedItems'), value: '0', icon: Package, color: 'text-red-400', bg: 'bg-red-500/10' },
          { title: t('dashboard.pipRecipients'), value: pipRecipientsCount.toString(), icon: Award, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { title: t('dashboard.incomingLetters'), value: '0', icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat, i) => (
          <motion.div key={i} variants={item} className="glass-card p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', stat.bg)}><stat.icon size={18} className={stat.color} /></div>
            <div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.title}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={item} className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.revenueChart')}</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-indigo-500" /><span className="text-muted-foreground">{locale === 'id' ? 'Pemasukan' : 'Income'}</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-purple-400" /><span className="text-muted-foreground">{locale === 'id' ? 'Pengeluaran' : 'Expense'}</span></div>
            </div>
          </div>
          <div className="relative w-full h-[280px]">
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/40 backdrop-blur-[2px] rounded-lg">
              <div className="text-center bg-card/90 p-4 rounded-xl border border-border/50 shadow-lg">
                <Wallet className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium text-foreground">{locale === 'id' ? 'Modul Keuangan Belum Aktif' : 'Finance Module Not Active'}</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">{locale === 'id' ? 'Grafik ini akan menampilkan data setelah modul tagihan SPP dibangun.' : 'This chart will populate once the fee management module is built.'}</p>
              </div>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dummyRevenueData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} /><stop offset="95%" stopColor="#6366f1" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} /><stop offset="95%" stopColor="#a855f7" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={45} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="pemasukan" stroke="#6366f1" fill="url(#gradIncome)" strokeWidth={2.5} />
                <Area type="monotone" dataKey="pengeluaran" stroke="#a855f7" fill="url(#gradExpense)" strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div variants={item} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('dashboard.studentDistribution')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={studentDistribution} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={3} dataKey="value" strokeWidth={0}>
                {studentDistribution.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <RechartsTooltip
                formatter={(value: any) => [formatNumber(Number(value) || 0), locale === 'id' ? 'Siswa' : 'Students']}
                contentStyle={{ background: 'rgba(10,10,15,0.95)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {studentDistribution.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                <span className="text-muted-foreground truncate">{entry.name}</span>
                <span className="text-foreground font-medium ml-auto">{entry.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Quick Actions */}
      <motion.div variants={item} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">{t('dashboard.quickActions')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.id} to={action.path}
              className={cn('flex flex-col items-center gap-2.5 p-4 rounded-xl border border-border/50 bg-muted/20 hover:bg-muted/40 transition-all duration-200 hover:scale-105 hover:shadow-lg group cursor-pointer')}
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110', action.color === 'indigo' && 'bg-indigo-500/10 text-indigo-400', action.color === 'emerald' && 'bg-emerald-500/10 text-emerald-400', action.color === 'amber' && 'bg-amber-500/10 text-amber-400', action.color === 'violet' && 'bg-violet-500/10 text-violet-400', action.color === 'cyan' && 'bg-cyan-500/10 text-cyan-400', action.color === 'rose' && 'bg-rose-500/10 text-rose-400')}>
                <action.icon size={20} />
              </div>
              <span className="text-xs font-medium text-foreground text-center">{action.label}</span>
            </Link>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}