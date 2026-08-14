import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/utils/cn';
import { Calendar, Clock, BookOpen, Users, MapPin, MonitorPlay, Code, Palette, Laptop } from 'lucide-react';
import { formatDate } from '@/utils/format';

const stats = [
  { label: 'Total Kelas Aktif', value: '12', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { label: 'Total Mata Pelajaran', value: '18', icon: BookOpen, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
  { label: 'Guru Mengajar Hari Ini', value: '15', icon: MonitorPlay, color: 'text-violet-500', bg: 'bg-violet-500/10' },
];

const weeklyOverview = [
  { day: 'Senin', sessions: 24, active: true },
  { day: 'Selasa', sessions: 22, active: false },
  { day: 'Rabu', sessions: 20, active: false },
  { day: 'Kamis', sessions: 24, active: false },
  { day: 'Jumat', sessions: 18, active: false },
];

const todaySchedule = [
  {
    id: 1,
    time: '07:00 - 08:30',
    subject: 'Matematika',
    class: 'XII RPL 1',
    teacher: 'Bpk. Ahmad Fauzi, S.Pd',
    room: 'Ruang 01',
    type: 'primary',
    icon: Code,
  },
  {
    id: 2,
    time: '08:30 - 10:00',
    subject: 'Pemrograman Web',
    class: 'XI TKJ 2',
    teacher: 'Ibu Rina Melati, M.Kom',
    room: 'Lab Komputer A',
    type: 'indigo',
    icon: Laptop,
  },
  {
    id: 3,
    time: '10:15 - 11:45',
    subject: 'Desain Grafis',
    class: 'X DKV 1',
    teacher: 'Bpk. Budi Santoso, S.Sn',
    room: 'Lab Multimedia',
    type: 'violet',
    icon: Palette,
  },
  {
    id: 4,
    time: '12:30 - 14:00',
    subject: 'Bahasa Inggris',
    class: 'XII RPL 2',
    teacher: 'Ibu Sarah Wijaya, S.Pd',
    room: 'Ruang 12',
    type: 'blue',
    icon: BookOpen,
  },
];

const getBadgeVariant = (type: string) => {
  switch (type) {
    case 'primary': return 'bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800';
    case 'indigo': return 'bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800';
    case 'violet': return 'bg-violet-100 text-violet-700 hover:bg-violet-100 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300 dark:border-violet-800';
    case 'blue': return 'bg-sky-100 text-sky-700 hover:bg-sky-100 border-sky-200 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-800';
    default: return '';
  }
};

export default function ScheduleDashboardPage() {
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
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Jadwal Pelajaran</h1>
          <p className="text-muted-foreground mt-1">Overview jadwal dan kelas hari ini, {formatDate(new Date().toISOString())}</p>
        </div>
      </motion.div>

      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, idx) => (
          <motion.div key={idx} variants={itemVariants}>
            <Card className="border-none shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6 flex items-center gap-4">
                <div className={cn("p-4 rounded-xl", stat.bg)}>
                  <stat.icon className={cn("w-6 h-6", stat.color)} />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
                  <p className="text-3xl font-bold">{stat.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="lg:col-span-2">
          <Card className="border-none shadow-sm h-full">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-500" />
                Jadwal Hari Ini
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                    <tr>
                      <th className="px-6 py-4 font-medium">Waktu</th>
                      <th className="px-6 py-4 font-medium">Mata Pelajaran</th>
                      <th className="px-6 py-4 font-medium">Kelas</th>
                      <th className="px-6 py-4 font-medium">Guru</th>
                      <th className="px-6 py-4 font-medium">Ruangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaySchedule.map((item) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-2 text-foreground font-medium">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            {item.time}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2 font-medium">
                            <div className={cn("p-1.5 rounded-md bg-muted", item.type === 'primary' ? 'text-blue-500' : 'text-indigo-500')}>
                              <item.icon className="w-4 h-4" />
                            </div>
                            {item.subject}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant="outline" className={cn("font-medium", getBadgeVariant(item.type))}>
                            {item.class}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-muted-foreground">
                          {item.teacher}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {item.room}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}>
          <Card className="border-none shadow-sm h-full bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20">
            <CardHeader>
              <CardTitle className="text-lg">Ringkasan Mingguan</CardTitle>
              <CardDescription>Beban mengajar per hari</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {weeklyOverview.map((day, idx) => (
                  <div key={idx} className={cn(
                    "flex items-center justify-between p-3 rounded-xl border transition-all",
                    day.active 
                      ? "bg-white dark:bg-card border-blue-200 shadow-sm ring-1 ring-blue-500/20" 
                      : "bg-white/50 dark:bg-card/50 border-transparent hover:bg-white dark:hover:bg-card"
                  )}>
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        day.active ? "bg-blue-500 animate-pulse" : "bg-muted-foreground/30"
                      )} />
                      <span className={cn(
                        "font-medium",
                        day.active ? "text-blue-700 dark:text-blue-400" : "text-muted-foreground"
                      )}>{day.day}</span>
                    </div>
                    <Badge variant="secondary" className={cn(
                      day.active ? "bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/50 dark:text-blue-300" : ""
                    )}>
                      {day.sessions} Sesi
                    </Badge>
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
