import { motion } from 'framer-motion';
import {
  Users, GraduationCap, Wallet, AlertTriangle,
  TrendingUp, TrendingDown, Calendar, CreditCard,
  ClipboardCheck, Package, Award, FileText,
  UserPlus, BarChart3, ArrowUpRight, Clock,
  Megaphone, Pin
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { cn } from '@/utils/cn';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { formatCurrency, formatNumber, formatDate } from '@/utils/format';
import {
  mockDashboardStats,
  mockRevenueData,
  mockStudentDistribution,
  mockAttendanceData,
  mockRecentPayments,
  mockTodaySchedule,
  mockAnnouncements,
  mockQuickActions,
} from '@/constants/mock-data';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

// Custom Tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="bg-card/95 backdrop-blur-xl border border-border/50 rounded-xl p-3 shadow-2xl">
      <p className="text-xs font-medium text-muted-foreground mb-1.5">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: entry.color }} />
          <span className="text-foreground font-medium">{formatCurrency(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

function StatCard({
  title,
  value,
  change,
  icon: Icon,
  gradient,
  format = 'number',
}: {
  title: string;
  value: number;
  change: number;
  icon: any;
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

const iconMap: Record<string, any> = {
  UserPlus,
  CreditCard,
  ClipboardCheck,
  FileText,
  Calendar,
  BarChart3,
};

export function AdminDashboard() {
  const { t, locale } = useTranslation();
  const { user } = useAuthStore();
  const stats = mockDashboardStats;

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6"
    >
      {/* Welcome Banner */}
      <motion.div variants={item} className="relative overflow-hidden rounded-2xl p-6 lg:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-violet-600 opacity-90" />
        <div className="absolute inset-0 opacity-10" style={{
          backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,255,255,0.2) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,255,255,0.1) 0%, transparent 50%)`
        }} />
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
              {t('dashboard.welcome', { name: user?.fullName?.split(' ')[0] || 'Admin' })} 👋
            </h1>
            <p className="text-white/70 text-sm lg:text-base">
              {locale === 'id'
                ? 'Berikut ringkasan data sekolah Anda hari ini.'
                : "Here's your school data summary for today."}
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
        <StatCard
          title={t('dashboard.totalStudents')}
          value={stats.totalStudents}
          change={stats.studentGrowth}
          icon={Users}
          gradient="stat-gradient-indigo"
        />
        <StatCard
          title={t('dashboard.totalTeachers')}
          value={stats.totalTeachers}
          change={stats.teacherGrowth}
          icon={GraduationCap}
          gradient="stat-gradient-emerald"
        />
        <StatCard
          title={t('dashboard.monthlyRevenue')}
          value={stats.monthlyRevenue}
          change={stats.revenueGrowth}
          icon={Wallet}
          gradient="stat-gradient-violet"
          format="currency"
        />
        <StatCard
          title={t('dashboard.pendingPayments')}
          value={stats.pendingPayments}
          change={stats.paymentGrowth}
          icon={AlertTriangle}
          gradient="stat-gradient-amber"
          format="currency"
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { title: t('dashboard.attendanceToday'), value: `${stats.attendanceToday}%`, icon: ClipboardCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { title: t('dashboard.damagedItems'), value: stats.damagedItems.toString(), icon: Package, color: 'text-red-400', bg: 'bg-red-500/10' },
          { title: t('dashboard.pipRecipients'), value: stats.pipRecipients.toString(), icon: Award, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { title: t('dashboard.incomingLetters'), value: stats.incomingLetters.toString(), icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
        ].map((stat, i) => (
          <motion.div key={i} variants={item} className="glass-card p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center', stat.bg)}>
              <stat.icon size={18} className={stat.color} />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.title}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart - 2/3 width */}
        <motion.div variants={item} className="lg:col-span-2 glass-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.revenueChart')}</h3>
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                <span className="text-muted-foreground">{locale === 'id' ? 'Pemasukan' : 'Income'}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full bg-purple-400" />
                <span className="text-muted-foreground">{locale === 'id' ? 'Pengeluaran' : 'Expense'}</span>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={mockRevenueData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="gradIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a855f7" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: '#71717a' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000000).toFixed(0)}jt`}
                width={45}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="pemasukan" stroke="#6366f1" fill="url(#gradIncome)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="pengeluaran" stroke="#a855f7" fill="url(#gradExpense)" strokeWidth={2} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Student Distribution Pie */}
        <motion.div variants={item} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">{t('dashboard.studentDistribution')}</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={mockStudentDistribution}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {mockStudentDistribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any) => [formatNumber(Number(value)), locale === 'id' ? 'Siswa' : 'Students']}
                contentStyle={{
                  background: 'rgba(10,10,15,0.95)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '12px',
                  fontSize: '12px',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {mockStudentDistribution.map((entry) => (
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
          {mockQuickActions.map((action) => {
            const Icon = iconMap[action.icon] || BarChart3;
            return (
              <button
                key={action.id}
                className={cn(
                  'flex flex-col items-center gap-2.5 p-4 rounded-xl border border-border/50',
                  'bg-muted/20 hover:bg-muted/40 transition-all duration-200',
                  'hover:scale-105 hover:shadow-lg group cursor-pointer'
                )}
              >
                <div className={cn(
                  'w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110',
                  action.color === 'indigo' && 'bg-indigo-500/10 text-indigo-400',
                  action.color === 'emerald' && 'bg-emerald-500/10 text-emerald-400',
                  action.color === 'amber' && 'bg-amber-500/10 text-amber-400',
                  action.color === 'violet' && 'bg-violet-500/10 text-violet-400',
                  action.color === 'cyan' && 'bg-cyan-500/10 text-cyan-400',
                  action.color === 'rose' && 'bg-rose-500/10 text-rose-400',
                )}>
                  <Icon size={20} />
                </div>
                <span className="text-xs font-medium text-foreground text-center">
                  {action.label[locale]}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Bottom Row: Schedule + Payments + Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Today's Schedule */}
        <motion.div variants={item} className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.todaySchedule')}</h3>
            <button className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              {t('common.viewAll')} <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {mockTodaySchedule.slice(0, 4).map((schedule) => (
              <div key={schedule.id} className="flex gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
                <div className="flex-shrink-0 w-14 text-center">
                  <Clock size={14} className="mx-auto mb-1 text-primary" />
                  <p className="text-[10px] text-muted-foreground leading-tight">{schedule.time.split(' - ')[0]}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{schedule.subject}</p>
                  <p className="text-xs text-muted-foreground">{schedule.class} • {schedule.room}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Recent Payments */}
        <motion.div variants={item} className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.recentPayments')}</h3>
            <button className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              {t('common.viewAll')} <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {mockRecentPayments.slice(0, 4).map((payment) => (
              <div key={payment.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors">
                <div className={cn(
                  'flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center',
                  payment.status === 'LUNAS' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                )}>
                  <CreditCard size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{payment.studentName}</p>
                  <p className="text-xs text-muted-foreground">{payment.class} • {payment.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-foreground">{formatCurrency(payment.amount)}</p>
                  <p className={cn(
                    'text-[10px] font-medium',
                    payment.status === 'LUNAS' ? 'text-emerald-400' : 'text-amber-400'
                  )}>
                    {payment.status === 'LUNAS' ? '✓ Lunas' : '◷ Sebagian'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Announcements */}
        <motion.div variants={item} className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-foreground">{t('dashboard.announcements')}</h3>
            <button className="text-xs text-primary hover:text-primary/80 flex items-center gap-1">
              {t('common.viewAll')} <ArrowUpRight size={12} />
            </button>
          </div>
          <div className="space-y-3">
            {mockAnnouncements.map((announcement) => (
              <div
                key={announcement.id}
                className="p-3 rounded-xl bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-2 mb-1.5">
                  {announcement.isPinned && (
                    <Pin size={12} className="text-primary mt-0.5 flex-shrink-0" />
                  )}
                  <p className="text-sm font-medium text-foreground leading-snug">{announcement.title}</p>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{announcement.content}</p>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">{announcement.author}</span>
                  <span className="text-[10px] text-muted-foreground">{formatDate(announcement.date, 'DD MMM YYYY')}</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Attendance Bar Chart */}
      <motion.div variants={item} className="glass-card p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          {locale === 'id' ? 'Ringkasan Kehadiran Minggu Ini' : "This Week's Attendance Summary"}
        </h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart
            data={[
              { day: 'Sen', hadir: 812, izin: 15, sakit: 12, alpha: 8 },
              { day: 'Sel', hadir: 825, izin: 10, sakit: 8, alpha: 4 },
              { day: 'Rab', hadir: 798, izin: 18, sakit: 22, alpha: 9 },
              { day: 'Kam', hadir: 830, izin: 8, sakit: 5, alpha: 4 },
              { day: 'Jum', hadir: 815, izin: 12, sakit: 15, alpha: 5 },
              { day: 'Sab', hadir: 780, izin: 20, sakit: 30, alpha: 17 },
            ]}
            margin={{ top: 5, right: 5, left: 0, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="day" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: '#71717a' }} axisLine={false} tickLine={false} width={35} />
            <Tooltip
              contentStyle={{
                background: 'rgba(10,10,15,0.95)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '12px',
              }}
            />
            <Bar dataKey="hadir" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="izin" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="sakit" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Bar dataKey="alpha" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center justify-center gap-6 mt-3">
          {[
            { label: 'Hadir', color: '#10b981' },
            { label: 'Izin', color: '#3b82f6' },
            { label: 'Sakit', color: '#f59e0b' },
            { label: 'Alpha', color: '#ef4444' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
              {l.label}
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
