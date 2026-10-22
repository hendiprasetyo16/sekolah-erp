import React, { useState, useEffect } from 'react';
import { motion, type Variants } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  AlertCircle, 
  Users, 
  ArrowUpRight, 
  Download, 
  Filter,
  Activity,
  CreditCard,
  Building,
  Receipt
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  PieChart, 
  Pie, 
  Cell,
  Legend
} from 'recharts';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency, formatDate } from '@/utils/format';
import { financeService, type FinanceSummary, type Transaction, type Arrear } from '../services/finance.service';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#64748b'];

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 }
  }
};

const itemVariants: Variants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring', stiffness: 300, damping: 24 }
  }
};

export default function FinanceDashboardPage() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [arrears, setArrears] = useState<Arrear[]>([]);
  const [revenueData, setRevenueData] = useState<{ name: string; income: number; expense: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadFinanceData() {
      try {
        setLoading(true);
        const [sumData, trxData, arrData, trendData] = await Promise.all([
          financeService.getSummary(),
          financeService.getRecentTransactions(),
          financeService.getTopArrears(),
          financeService.getRevenueTrend(),
        ]);
        setSummary(sumData);
        setTransactions(trxData);
        setArrears(arrData);
        setRevenueData(trendData);
      } catch (err) {
        console.error('Failed to load finance data from Supabase:', err);
      } finally {
        setLoading(false);
      }
    }
    loadFinanceData();
  }, []);

  return (
    <motion.div 
      className="space-y-6"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard Keuangan</h1>
          <p className="text-muted-foreground mt-1">Ringkasan kondisi keuangan real-time dari database Supabase.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-sm font-medium">
            <Activity className="w-4 h-4 mr-2" />
            Status: Terhubung Supabase
          </Badge>
        </div>
      </div>

      {/* STATS ROW */}
      <motion.div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" variants={itemVariants}>
        <Card className="relative overflow-hidden border-0 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pemasukan</CardTitle>
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950 rounded-full">
              <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold text-foreground">{formatCurrency(summary?.totalIncome || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Dari pembayaran transaksi terverifikasi
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-rose-500/10 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Pengeluaran</CardTitle>
            <div className="p-2 bg-rose-100 dark:bg-rose-950 rounded-full">
              <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold text-foreground">{formatCurrency(summary?.totalExpense || 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Total pengeluaran tercatat
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-transparent" />
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tunggakan Tagihan</CardTitle>
            <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-full">
              <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold text-foreground">{formatCurrency(summary?.totalArrears || 0)}</div>
            <p className="text-xs text-amber-600 flex items-center mt-1 font-medium">
              <Users className="h-3 w-3 mr-1" />
              {summary?.arrearsCount || 0} tagihan belum lunas
            </p>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden border-0 shadow-md bg-gradient-to-br from-blue-600 to-indigo-700 text-white">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 relative z-10">
            <CardTitle className="text-sm font-medium text-blue-100">Saldo Kas Bersih</CardTitle>
            <div className="p-2 bg-white/20 rounded-full backdrop-blur-sm">
              <Wallet className="h-4 w-4 text-white" />
            </div>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="text-2xl font-bold">{formatCurrency(summary?.cashBalance || 0)}</div>
            <p className="text-xs text-blue-100 flex items-center mt-1">
              Pemasukan dikurangi pengeluaran
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* CHARTS ROW */}
      <motion.div className="grid grid-cols-1 lg:grid-cols-3 gap-6" variants={itemVariants}>
        <Card className="lg:col-span-2 shadow-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Arus Kas Pemasukan (6 Bulan Terakhir)</CardTitle>
              <CardDescription>Grafik tren pemasukan dari pembayaran siswa secara real.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[280px] w-full">
              {revenueData.length > 0 && revenueData.some(d => d.income > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))" 
                      fontSize={12} 
                      tickLine={false} 
                      axisLine={false}
                      tickFormatter={(value) => `Rp ${(value / 1000000).toFixed(0)}Jt`}
                    />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Pemasukan']}
                    />
                    <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#incomeGrad)" name="Pemasukan" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                  <CreditCard className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm font-medium">Belum ada transaksi pembayaran di Supabase</p>
                  <p className="text-xs text-muted-foreground mt-1">Grafik akan terisi otomatis saat pembayaran pertama masuk</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Ringkasan Status Tagihan</CardTitle>
            <CardDescription>Perbandingan pelunasan dan tunggakan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center pt-4">
            <div className="w-full space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-emerald-50/50 dark:bg-emerald-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-foreground">Total Pemasukan Masuk</span>
                </div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(summary?.totalIncome || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-amber-50/50 dark:bg-amber-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium text-foreground">Sisa Tunggakan Tertagih</span>
                </div>
                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(summary?.totalArrears || 0)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-blue-50/50 dark:bg-blue-950/20">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-medium text-foreground">Jumlah Tagihan Belum Lunas</span>
                </div>
                <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
                  {summary?.arrearsCount || 0}
                </span>
              </div>
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
              <CardDescription>Transaksi pembayaran terbaru yang tercatat di database Supabase.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 rounded-tl-lg">Tanggal</th>
                    <th className="px-4 py-3">Tagihan</th>
                    <th className="px-4 py-3">Siswa</th>
                    <th className="px-4 py-3">Metode</th>
                    <th className="px-4 py-3 text-right rounded-tr-lg">Jumlah</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((trx) => (
                    <tr key={trx.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                        {formatDate(trx.paymentDate)}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{trx.billTitle || 'Pembayaran'}</td>
                      <td className="px-4 py-3 text-muted-foreground">{trx.studentName || '-'}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                          {trx.paymentMethod}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-emerald-600">
                        +{formatCurrency(trx.amount)}
                      </td>
                    </tr>
                  ))}
                  {transactions.length === 0 && (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-muted-foreground">
                        Belum ada riwayat transaksi pembayaran di sistem.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-border/50">
          <CardHeader>
            <CardTitle>Top Tunggakan</CardTitle>
            <CardDescription>Tunggakan terbesar siswa dari database Supabase.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {arrears.map((tunggakan) => (
                <div key={tunggakan.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-950 flex items-center justify-center flex-shrink-0">
                      <span className="text-amber-700 dark:text-amber-400 font-bold text-sm">
                        {tunggakan.studentName ? tunggakan.studentName.split(' ').map(n => n[0]).join('').substring(0, 2) : 'SW'}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-foreground">{tunggakan.studentName}</p>
                      <p className="text-xs text-muted-foreground">Kelas {tunggakan.className}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm text-rose-600 dark:text-rose-400">{formatCurrency(tunggakan.amount)}</p>
                  </div>
                </div>
              ))}
              {arrears.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Tidak ada tagihan yang menunggak. Semua tagihan berstatus lunas.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
