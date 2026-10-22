import React from 'react';
import { motion } from 'framer-motion';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, 
  PieChart, Pie, Cell, ResponsiveContainer 
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Wallet, AlertCircle, Activity, Users
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/utils/format';

// --- MOCK DATA ---

const revenueData = [
  { name: 'Jan', income: 42000000, expense: 25000000 },
  { name: 'Feb', income: 45000000, expense: 28000000 },
  { name: 'Mar', income: 43000000, expense: 26000000 },
  { name: 'Apr', income: 48000000, expense: 29000000 },
  { name: 'Mei', income: 46000000, expense: 27500000 },
  { name: 'Jun', income: 51000000, expense: 31000000 },
];

const expenseDistributionData = [
  { name: 'Gaji Pegawai', value: 45 },
  { name: 'Operasional', value: 20 },
  { name: 'Pemeliharaan', value: 15 },
  { name: 'BOS', value: 12 },
  { name: 'Lainnya', value: 8 },
];

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];

const recentTransactions = [
  { id: 'TRX-001', date: '2025-06-15', description: 'Pembayaran SPP Kelas 10A (30 Siswa)', category: 'Pemasukan SPP', type: 'MASUK', amount: 15000000 },
  { id: 'TRX-002', date: '2025-06-14', description: 'Pembayaran Listrik & Air', category: 'Operasional', type: 'KELUAR', amount: 3500000 },
  { id: 'TRX-003', date: '2025-06-12', description: 'Dana BOS Cair Tahap 2', category: 'Pemasukan BOS', type: 'MASUK', amount: 25000000 },
  { id: 'TRX-004', date: '2025-06-10', description: 'Pembelian Alat Tulis Kantor', category: 'Operasional', type: 'KELUAR', amount: 1200000 },
  { id: 'TRX-005', date: '2025-06-08', description: 'Gaji Guru Honorer', category: 'Gaji Pegawai', type: 'KELUAR', amount: 12500000 },
  { id: 'TRX-006', date: '2025-06-05', description: 'Pembayaran SPP Kelas 11B (25 Siswa)', category: 'Pemasukan SPP', type: 'MASUK', amount: 12500000 },
  { id: 'TRX-007', date: '2025-06-02', description: 'Perbaikan Atap Bocor', category: 'Pemeliharaan', type: 'KELUAR', amount: 4800000 },
  { id: 'TRX-008', date: '2025-06-01', description: 'Uang Pangkal Siswa Baru', category: 'Pemasukan Lainnya', type: 'MASUK', amount: 8500000 },
];

const topTunggakan = [
  { id: '1', name: 'Budi Santoso', class: '10A', amount: 1500000, months: 3 },
  { id: '2', name: 'Siti Aminah', class: '11B', amount: 1000000, months: 2 },
  { id: '3', name: 'Agus Pratama', class: '12C', amount: 1000000, months: 2 },
  { id: '4', name: 'Rina Wati', class: '10B', amount: 500000, months: 1 },
  { id: '5', name: 'Dewi Lestari', class: '11A', amount: 500000, months: 1 },
];

// --- ANIMATION VARIANTS ---
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

export default function FinanceDashboardPage() {
  return (
    <motion.div 
      className="p-6 space-y-6 bg-background min-h-screen"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Keuangan</h1>
          <p className="text-muted-foreground mt-1">Ringkasan kondisi keuangan sekolah bulan ini.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-sm font-medium">
            <Activity className="w-4 h-4 mr-2" />
            Status: Sehat
          </Badge>
        </div>
      </div>

      {/* STATS ROW */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" variants={itemVariants}>
        <Card className="relative overflow-hidden border-0 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pemasukan Bulan Ini</CardTitle>
            <div className="p-2 bg-emerald-100 rounded-full">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold text-foreground">Rp 45.750.000</div>
            <p className="text-xs text-emerald-600 flex items-center mt-1 font-medium">
              <TrendingUp className="h-3 w-3 mr-1" />
              +12% dari bulan lalu
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pengeluaran Bulan Ini</CardTitle>
            <div className="p-2 bg-rose-100 rounded-full">
              <TrendingDown className="h-4 w-4 text-rose-600" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold text-foreground">Rp 28.300.000</div>
            <p className="text-xs text-rose-600 flex items-center mt-1 font-medium">
              <TrendingDown className="h-3 w-3 mr-1" />
              +3% dari bulan lalu
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tunggakan SPP</CardTitle>
            <div className="p-2 bg-amber-100 rounded-full">
              <AlertCircle className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold text-foreground">Rp 12.400.000</div>
            <p className="text-xs text-amber-600 flex items-center mt-1 font-medium">
              <Users className="h-3 w-3 mr-1" />
              76 siswa
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-blue-100">Saldo Kas</CardTitle>
            <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm">
              <Wallet className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold">Rp 89.200.000</div>
            <p className="text-xs text-blue-100 flex items-center mt-1">
              Berdasarkan rekonsiliasi terakhir
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* CHARTS ROW */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={itemVariants}>
        <Card className="lg:col-span-2 shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Tren Keuangan 6 Bulan</CardTitle>
            <CardDescription>Perbandingan pemasukan dan pengeluaran per bulan.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'currentColor', opacity: 0.6 }} />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: 'currentColor', opacity: 0.6 }}
                    tickFormatter={(value) => `Rp ${value / 1000000}M`}
                  />
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    formatter={(value: number) => [formatCurrency(value), '']}
                    labelStyle={{ color: 'var(--foreground)', fontWeight: 'bold', marginBottom: '4px' }}
                  />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Area type="monotone" dataKey="income" name="Pemasukan" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#colorIncome)" />
                  <Area type="monotone" dataKey="expense" name="Pengeluaran" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExpense)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Distribusi Pengeluaran</CardTitle>
            <CardDescription>Berdasarkan kategori bulan ini.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseDistributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    stroke="none"
                  >
                    {expenseDistributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ backgroundColor: 'var(--background)', borderColor: 'var(--border)', borderRadius: '8px' }}
                    itemStyle={{ color: 'var(--foreground)' }}
                    formatter={(value: number) => [`${value}%`, 'Persentase']}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    iconType="circle"
                    wrapperStyle={{ fontSize: '12px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 w-full text-center text-sm text-muted-foreground">
              Total Pengeluaran: <strong className="text-foreground">Rp 28.300.000</strong>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* TABLES ROW */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={itemVariants}>
        <Card className="lg:col-span-2 shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Transaksi Terakhir</CardTitle>
              <CardDescription>8 transaksi terbaru di sistem.</CardDescription>
            </div>
            <button className="text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors">
              Lihat Semua
            </button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Tanggal</th>
                    <th className="px-4 py-3">Keterangan</th>
                    <th className="px-4 py-3">Kategori</th>
                    <th className="px-4 py-3">Jenis</th>
                    <th className="px-4 py-3 text-right rounded-tr-lg">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.map((trx) => (
                    <tr key={trx.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDate(trx.date)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{trx.description}</td>
                      <td className="px-4 py-3 text-muted-foreground">{trx.category}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={
                          trx.type === 'MASUK' 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }>
                          {trx.type}
                        </Badge>
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${
                        trx.type === 'MASUK' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {trx.type === 'MASUK' ? '+' : '-'}{formatCurrency(trx.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Top Tunggakan SPP</CardTitle>
            <CardDescription>Siswa dengan tunggakan terbesar.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topTunggakan.map((tunggakan) => (
                <div key={tunggakan.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-700 font-bold text-sm">
                        {tunggakan.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{tunggakan.name}</p>
                      <p className="text-xs text-muted-foreground">Kelas {tunggakan.class} • {tunggakan.months} Bulan</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-rose-600">{formatCurrency(tunggakan.amount)}</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="w-full mt-4 py-2 border border-border rounded-md text-sm font-medium hover:bg-muted transition-colors">
              Lihat Laporan Tunggakan
            </button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
