import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { Users, TrendingUp, GraduationCap, Award, FileText, FileSpreadsheet } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';

const stats = [
  { label: 'Total Siswa', value: '487', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { label: 'Kehadiran Rata-rata', value: '94.2%', icon: TrendingUp, color: 'text-teal-500', bg: 'bg-teal-500/10' },
  { label: 'Nilai Rata-rata', value: '78.5', icon: Award, color: 'text-green-500', bg: 'bg-green-500/10' },
  { label: 'Lulus UN', value: '98.7%', icon: GraduationCap, color: 'text-emerald-600', bg: 'bg-emerald-600/10' },
];

const attendanceData = [
  { name: 'XII RPL 1', hadir: 96, izin: 2, alpa: 2 },
  { name: 'XI TKJ 2', hadir: 92, izin: 5, alpa: 3 },
  { name: 'X DKV 1', hadir: 98, izin: 1, alpa: 1 },
  { name: 'XII AKL 2', hadir: 90, izin: 6, alpa: 4 },
  { name: 'XI OTKP 1', hadir: 95, izin: 3, alpa: 2 },
];

const statusData = [
  { name: 'Aktif', value: 450 },
  { name: 'Lulus', value: 25 },
  { name: 'DO', value: 5 },
  { name: 'Mutasi', value: 7 },
];

const COLORS = ['#10b981', '#3b82f6', '#ef4444', '#f59e0b'];

const topStudents = [
  { id: 1, name: 'Budi Santoso', class: 'XII RPL 1', score: 95.5 },
  { id: 2, name: 'Siti Aminah', class: 'XI TKJ 2', score: 94.2 },
  { id: 3, name: 'Ahmad Faisal', class: 'XII AKL 2', score: 93.8 },
  { id: 4, name: 'Diana Putri', class: 'X DKV 1', score: 92.5 },
  { id: 5, name: 'Riko Hermawan', class: 'XI OTKP 1', score: 91.0 },
];

export default function ReportsDashboardPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="p-6 space-y-6">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Laporan & Analitik</h1>
          <p className="text-muted-foreground mt-1">Metrik performa dan statistik akademik sekolah</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800/50 dark:text-emerald-400 dark:hover:bg-emerald-900/20">
            <FileText className="w-4 h-4" />
            PDF
          </Button>
          <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white">
            <FileSpreadsheet className="w-4 h-4" />
            Excel
          </Button>
        </div>
      </motion.div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, idx) => (
          <motion.div key={idx} variants={itemVariants}>
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow bg-gradient-to-br from-card to-emerald-50/30 dark:to-emerald-950/10">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={cn("p-4 rounded-xl", stat.bg)}>
                  <stat.icon className={cn("w-6 h-6", stat.color)} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
          <Card className="border-none shadow-sm h-full">
            <CardHeader>
              <CardTitle className="text-lg">Rekap Kehadiran Per Kelas</CardTitle>
              <CardDescription>Persentase kehadiran siswa bulan ini</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={attendanceData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                    <Tooltip cursor={{ fill: 'hsl(var(--muted)/0.5)' }} contentStyle={{ borderRadius: '8px', border: '1px solid hsl(var(--border))', backgroundColor: 'hsl(var(--background))' }} />
                    <Legend iconType="circle" />
                    <Bar dataKey="hadir" name="Hadir (%)" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                    <Bar dataKey="izin" name="Izin (%)" stackId="a" fill="#f59e0b" />
                    <Bar dataKey="alpa" name="Alpa (%)" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
          <Card className="border-none shadow-sm h-full">
            <CardHeader>
              <CardTitle className="text-lg">Distribusi Status Siswa</CardTitle>
              <CardDescription>Berdasarkan data tahun ajaran ini</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center">
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full mt-4">
                {statusData.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[idx] }} />
                    <div className="flex-1">
                      <p className="text-xs text-muted-foreground">{item.name}</p>
                      <p className="font-semibold">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="lg:col-span-3">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-500" />
                Top 5 Siswa Berprestasi
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {topStudents.map((student, idx) => (
                  <div key={student.id} className="p-4 rounded-xl border bg-card hover:border-emerald-200 hover:shadow-sm transition-all group">
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="secondary" className={cn(
                        idx === 0 ? "bg-amber-100 text-amber-700" : 
                        idx === 1 ? "bg-slate-200 text-slate-700" : 
                        idx === 2 ? "bg-orange-100 text-orange-700" : "bg-emerald-50 text-emerald-700"
                      )}>
                        #{idx + 1}
                      </Badge>
                      <span className="text-sm font-bold text-emerald-600">{student.score}</span>
                    </div>
                    <p className="font-semibold text-foreground truncate group-hover:text-emerald-600 transition-colors">{student.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{student.class}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
