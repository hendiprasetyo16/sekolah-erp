import { useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Calendar,
  ChevronDown,
  Clock,
  Edit3,
  Filter,
  LayoutGrid,
  ListChecks,
  MapPin,
  MonitorPlay,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getDayLabel, timeToMinutes } from '../services/schedules.service';
import { useSchedulesData } from '../hooks/useSchedulesData';
import { ScheduleFormModal } from '../components/ScheduleFormModal';
import type { DayOfWeekNumber, ScheduleEntryItem } from '../types/schedules.types';

interface ScheduleDashboardPageProps {
  isId?: boolean;
  selectedSchoolId?: string | null;
  selectedAcademicYearId?: string | null;
}

function getCategoryBadgeStyle(category: string): string {
  const norm = category.toUpperCase();
  if (norm.includes('KEJURUAN') || norm.includes('PRODUKTIF')) {
    return 'bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (norm.includes('MUATAN') || norm.includes('LOKAL')) {
    return 'bg-amber-500/10 text-amber-700 border-amber-200 dark:text-amber-300 dark:border-amber-800';
  }
  if (norm.includes('PILIHAN') || norm.includes('INFORMATIKA')) {
    return 'bg-sky-500/10 text-sky-700 border-sky-200 dark:text-sky-300 dark:border-sky-800';
  }
  return 'bg-slate-500/10 text-slate-700 border-slate-200 dark:text-slate-300 dark:border-slate-700';
}

export default function ScheduleDashboardPage({
  isId = true,
  selectedSchoolId = null,
  selectedAcademicYearId = null,
}: ScheduleDashboardPageProps) {
  const {
    context,
    classes,
    subjects,
    teachers,
    entries,
    isLoading,
    errorMessage,
    deletingId,
    jakartaNow,
    activeTab,
    setActiveTab,
    selectedDay,
    setSelectedDay,
    selectedClassId,
    setSelectedClassId,
    searchQuery,
    setSearchQuery,
    onlyMySchedule,
    setOnlyMySchedule,
    kpiSummary,
    weeklyOverview,
    filteredDaySchedule,
    weeklyClassMatrix,
    teacherLoadList,
    reload,
    removeEntry,
  } = useSchedulesData({
    isId,
    selectedSchoolId,
    selectedAcademicYearId,
  });

  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<ScheduleEntryItem | null>(null);
  const [modalDefaultDay, setModalDefaultDay] = useState<DayOfWeekNumber>(1);

  const formattedTodayDate = useMemo(() => {
    return new Intl.DateTimeFormat(isId ? 'id-ID' : 'en-US', {
      timeZone: 'Asia/Jakarta',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date());
  }, [isId]);

  const statCards = useMemo(
    () => [
      {
        label: isId ? 'Kelas Terjadwal' : 'Scheduled Classes',
        value: `${kpiSummary.activeClassesCount} / ${kpiSummary.totalClassesCount}`,
        sub: isId ? 'Kelas aktif tahun ajaran ini' : 'Active classes this academic year',
        icon: Users,
        color: 'text-blue-600 dark:text-blue-400',
        bg: 'bg-blue-500/10',
      },
      {
        label: isId ? 'Total Sesi Mingguan' : 'Total Weekly Sessions',
        value: String(kpiSummary.totalWeeklySessions),
        sub: isId
          ? `${kpiSummary.activeSubjectsCount} mata pelajaran aktif`
          : `${kpiSummary.activeSubjectsCount} active subjects`,
        icon: BookOpen,
        color: 'text-emerald-600 dark:text-emerald-400',
        bg: 'bg-emerald-500/10',
      },
      {
        label: isId ? 'Guru Mengajar Hari Ini' : 'Teachers Teaching Today',
        value: String(kpiSummary.teachingTodayTeachersCount),
        sub: isId
          ? `${kpiSummary.todaySessionsCount} sesi pada ${kpiSummary.todayDayLabel}`
          : `${kpiSummary.todaySessionsCount} sessions on ${kpiSummary.todayDayLabel}`,
        icon: MonitorPlay,
        color: 'text-amber-600 dark:text-amber-400',
        bg: 'bg-amber-500/10',
      },
    ],
    [kpiSummary, isId]
  );

  const handleOpenCreate = (dayPreset?: DayOfWeekNumber) => {
    setEditingEntry(null);
    setModalDefaultDay(dayPreset ?? selectedDay);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (entry: ScheduleEntryItem) => {
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleConfirmDelete = async (entry: ScheduleEntryItem) => {
    const promptMsg = isId
      ? `Hapus jadwal "${entry.subjectName}" untuk kelas ${entry.className} (${getDayLabel(entry.dayOfWeek, true)}, ${entry.startTime}-${entry.endTime})?`
      : `Delete "${entry.subjectName}" for class ${entry.className} (${getDayLabel(entry.dayOfWeek, false)}, ${entry.startTime}-${entry.endTime})?`;
    if (!window.confirm(promptMsg)) return;
    await removeEntry(entry);
  };

  if (isLoading && !context) {
    return (
      <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-10 w-64 rounded-lg bg-muted animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-2xl bg-muted animate-pulse" />
          ))}
        </div>
        <div className="h-96 rounded-2xl bg-muted animate-pulse" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto min-w-0">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {isId ? 'Jadwal Pelajaran' : 'Class Schedule'}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-1.5">
            <span className="font-medium text-foreground/80">
              {context?.schoolName ?? 'Sekolah'}
            </span>
            <span>•</span>
            {context && (
              <>
                <Badge
                  variant="outline"
                  className="text-xs font-medium bg-emerald-500/10 text-emerald-700 border-emerald-200 dark:text-emerald-300 dark:border-emerald-800"
                >
                  TA {context.academicYearName}
                </Badge>
                <span>•</span>
              </>
            )}
            <span>{formattedTodayDate}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {context?.currentTeacherId && (
            <Button
              type="button"
              variant={onlyMySchedule ? 'default' : 'outline'}
              size="sm"
              onClick={() => setOnlyMySchedule((v) => !v)}
              className={`gap-1.5 ${onlyMySchedule
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : ''
                }`}
            >
              <UserCheck className="w-4 h-4" />
              {onlyMySchedule
                ? isId
                  ? 'Jadwal Saya'
                  : 'My Schedule'
                : isId
                  ? 'Semua Jadwal'
                  : 'All Schedules'}
            </Button>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void reload()}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            {isId ? 'Muat Ulang' : 'Refresh'}
          </Button>

          {context?.canManageSchedule && (
            <Button
              type="button"
              size="sm"
              onClick={() => handleOpenCreate()}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
            >
              <Plus className="w-4 h-4" />
              {isId ? 'Tambah Jadwal' : 'Add Schedule'}
            </Button>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">{isId ? 'Terjadi Kendala' : 'Error Occurred'}</p>
            <p className="mt-0.5">{errorMessage}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
        {statCards.map((stat, idx) => (
          <div
            key={idx}
            className="rounded-2xl border bg-card text-card-foreground shadow-xs p-4 sm:p-5 flex items-center gap-4 min-w-0"
          >
            <div className={`p-3 rounded-xl shrink-0 ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
                {stat.label}
              </p>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight mt-0.5">
                {stat.value}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5 truncate">{stat.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Tabs & Fixed-Width Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label={isId ? 'Tampilan Jadwal' : 'Schedule Views'}
          className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/80 overflow-x-auto max-w-full"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'TODAY'}
            onClick={() => setActiveTab('TODAY')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${activeTab === 'TODAY'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
          >
            <Calendar className="w-4 h-4 shrink-0" />
            <span>{isId ? 'Jadwal Harian' : 'Daily Schedule'}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'WEEKLY_CLASS'}
            onClick={() => setActiveTab('WEEKLY_CLASS')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${activeTab === 'WEEKLY_CLASS'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
          >
            <LayoutGrid className="w-4 h-4 shrink-0" />
            <span>{isId ? 'Matriks per Kelas' : 'Class Weekly Matrix'}</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'TEACHER_LOAD'}
            onClick={() => setActiveTab('TEACHER_LOAD')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 transition-all ${activeTab === 'TEACHER_LOAD'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
              }`}
          >
            <ListChecks className="w-4 h-4 shrink-0" />
            <span>{isId ? 'Beban Mengajar Guru' : 'Teacher Workload'}</span>
          </button>
        </div>

        {activeTab !== 'WEEKLY_CLASS' && (
          <div className="relative min-w-0 max-w-full" style={{ width: '260px' }}>
            <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'TODAY'
                  ? isId
                    ? 'Cari mapel, kelas, guru...'
                    : 'Search subject, class, teacher...'
                  : isId
                    ? 'Cari nama guru / mapel...'
                    : 'Search teacher / subject...'
              }
              className="pl-9 pr-8 h-9 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={isId ? 'Hapus pencarian' : 'Clear search'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: DAILY SCHEDULE & WEEKLY OVERVIEW */}
      {activeTab === 'TODAY' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          <div className="lg:col-span-2 rounded-2xl border bg-card text-card-foreground shadow-xs overflow-hidden min-w-0">
            <div className="p-5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    {isId
                      ? `Jadwal Hari ${getDayLabel(selectedDay, true)}`
                      : `${getDayLabel(selectedDay, false)} Schedule`}
                  </span>
                  {jakartaNow.dayOfWeek === selectedDay && (
                    <Badge className="bg-emerald-600 text-white hover:bg-emerald-600 text-[11px]">
                      {isId ? 'Hari Ini' : 'Today'}
                    </Badge>
                  )}
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                  {isId
                    ? `Menampilkan ${filteredDaySchedule.length} sesi pelajaran terjadwal`
                    : `Showing ${filteredDaySchedule.length} scheduled sessions`}
                </p>
              </div>

              {context?.canManageSchedule && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenCreate(selectedDay)}
                  className="gap-1.5 self-start sm:self-auto shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {isId
                    ? `Tambah di ${getDayLabel(selectedDay, true)}`
                    : `Add on ${getDayLabel(selectedDay, false)}`}
                </Button>
              )}
            </div>

            {filteredDaySchedule.length === 0 ? (
              <div className="py-12 px-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mx-auto">
                  <Calendar className="w-6 h-6 text-muted-foreground/60" />
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {isId
                      ? `Belum ada jadwal pada hari ${getDayLabel(selectedDay, true)}`
                      : `No schedule entries for ${getDayLabel(selectedDay, false)}`}
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto">
                    {searchQuery
                      ? isId
                        ? 'Tidak ditemukan sesi yang cocok dengan kata kunci pencarian Anda.'
                        : 'No sessions matched your search query.'
                      : isId
                        ? 'Tambahkan sesi pelajaran baru atau pilih hari lain pada ringkasan mingguan.'
                        : 'Add a new session or select another day from the weekly summary.'}
                  </p>
                </div>
                {context?.canManageSchedule && !searchQuery && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleOpenCreate(selectedDay)}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                      <Plus className="w-4 h-4" />
                      {isId ? 'Tambah Sesi Pelajaran' : 'Add Lesson Session'}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b">
                    <tr>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">
                        {isId ? 'Waktu' : 'Time'}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {isId ? 'Mata Pelajaran' : 'Subject'}
                      </th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">
                        {isId ? 'Kelas' : 'Class'}
                      </th>
                      <th className="px-4 py-3 font-medium">
                        {isId ? 'Guru Pengampu' : 'Teacher'}
                      </th>
                      <th className="px-4 py-3 font-medium whitespace-nowrap">
                        {isId ? 'Ruangan' : 'Room'}
                      </th>
                      {context?.canManageSchedule && (
                        <th className="px-4 py-3 font-medium text-right whitespace-nowrap">
                          {isId ? 'Aksi' : 'Actions'}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDaySchedule.map((item) => {
                      const isLiveNow =
                        jakartaNow.dayOfWeek === item.dayOfWeek &&
                        jakartaNow.minutesNow >= timeToMinutes(item.startTime) &&
                        jakartaNow.minutesNow < timeToMinutes(item.endTime);

                      return (
                        <tr
                          key={item.id}
                          className={`border-b last:border-0 transition-colors ${isLiveNow
                            ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                            : 'hover:bg-muted/30'
                            }`}
                        >
                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 font-medium text-foreground">
                              <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span>
                                {item.startTime} - {item.endTime}
                              </span>
                            </div>
                            {isLiveNow && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 mt-0.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {isId ? 'Berlangsung' : 'In Progress'}
                              </span>
                            )}
                          </td>

                          <td className="px-4 py-3.5">
                            <div className="font-medium text-foreground">{item.subjectName}</div>
                            {item.notes && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                            )}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap">
                            <Badge
                              variant="outline"
                              className={`font-medium ${getCategoryBadgeStyle(
                                item.subjectCategory
                              )}`}
                            >
                              {item.className}
                            </Badge>
                          </td>

                          <td className="px-4 py-3.5 text-muted-foreground">
                            {item.teacherName}
                          </td>

                          <td className="px-4 py-3.5 whitespace-nowrap text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5 shrink-0" />
                              <span>{item.room || '-'}</span>
                            </div>
                          </td>

                          {context?.canManageSchedule && (
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(item)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                  title={isId ? 'Edit sesi' : 'Edit session'}
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleConfirmDelete(item)}
                                  disabled={deletingId === item.id}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                                  title={isId ? 'Hapus sesi' : 'Delete session'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sidebar: Weekly Day Selector */}
          <div className="rounded-2xl border bg-card text-card-foreground shadow-xs p-5 space-y-4 min-w-0">
            <div>
              <h2 className="text-base sm:text-lg font-semibold">
                {isId ? 'Ringkasan Mingguan' : 'Weekly Summary'}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {isId
                  ? `Klik hari untuk rincian (${context?.workDaysMode === 'FIVE_DAYS' ? '5 Hari Kerja' : '6 Hari Kerja'
                  })`
                  : `Click a day for details (${context?.workDaysMode === 'FIVE_DAYS' ? '5 Workdays' : '6 Workdays'
                  })`}
              </p>
            </div>

            <div className="space-y-2">
              {weeklyOverview.map((day) => (
                <button
                  key={day.dayOfWeek}
                  type="button"
                  onClick={() => setSelectedDay(day.dayOfWeek)}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl border text-left transition-all ${day.isSelected
                    ? 'bg-emerald-500/8 border-emerald-600/40 shadow-xs ring-1 ring-emerald-600/20'
                    : 'bg-card border-border hover:bg-muted/50'
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${day.isToday
                        ? 'bg-emerald-500 animate-pulse'
                        : day.isSelected
                          ? 'bg-emerald-600'
                          : 'bg-muted-foreground/30'
                        }`}
                    />
                    <div>
                      <span
                        className={`text-sm font-medium block ${day.isSelected
                          ? 'text-emerald-700 dark:text-emerald-300'
                          : 'text-foreground'
                          }`}
                      >
                        {day.label}
                      </span>
                      {day.isToday && (
                        <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          {isId ? 'Hari ini' : 'Today'}
                        </span>
                      )}
                    </div>
                  </div>

                  <Badge
                    variant={day.isSelected ? 'default' : 'secondary'}
                    className={
                      day.isSelected
                        ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                        : ''
                    }
                  >
                    {day.sessions} {isId ? 'Sesi' : 'Sessions'}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WEEKLY MATRIX BY CLASS */}
      {activeTab === 'WEEKLY_CLASS' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border bg-card shadow-xs">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Filter className="w-4 h-4 text-emerald-600 shrink-0" />
                <label htmlFor="class-matrix-filter" className="whitespace-nowrap">
                  {isId ? 'Rombel / Kelas:' : 'Class:'}
                </label>
              </div>

              <div className="relative min-w-0 max-w-full" style={{ width: '260px' }}>
                <select
                  id="class-matrix-filter"
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="appearance-none w-full h-9 rounded-lg border border-input bg-background text-foreground pl-3 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-600 transition-colors"
                >
                  {classes.length === 0 && (
                    <option value="">{isId ? 'Belum ada kelas' : 'No classes available'}</option>
                  )}
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} {cls.major ? `— ${cls.major}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {context?.canManageSchedule && selectedClassId && (
              <Button
                type="button"
                size="sm"
                onClick={() => handleOpenCreate(1)}
                className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <Plus className="w-4 h-4" />
                {isId ? 'Tambah Sesi ke Kelas Ini' : 'Add Session to Class'}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {weeklyClassMatrix.map((col) => (
              <div
                key={col.dayOfWeek}
                className="rounded-2xl border bg-card text-card-foreground shadow-xs flex flex-col overflow-hidden min-w-0"
              >
                <div className="py-3 px-4 border-b bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm sm:text-base font-semibold">{col.dayName}</h3>
                    <Badge variant="secondary" className="text-xs">
                      {col.items.length} {isId ? 'Sesi' : 'Sessions'}
                    </Badge>
                  </div>
                  {context?.canManageSchedule && selectedClassId && (
                    <button
                      type="button"
                      onClick={() => handleOpenCreate(col.dayOfWeek)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors"
                      title={
                        isId
                          ? `Tambah jadwal hari ${col.dayName}`
                          : `Add schedule on ${col.dayName}`
                      }
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="p-3.5 space-y-2.5 flex-1">
                  {col.items.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted-foreground border border-dashed rounded-xl">
                      {isId ? 'Kosong / Tidak ada jadwal' : 'Empty / No sessions'}
                    </div>
                  ) : (
                    col.items.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl border bg-background hover:border-emerald-500/40 transition-colors space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <Clock className="w-3.5 h-3.5" />
                            {item.startTime} - {item.endTime}
                          </span>

                          {context?.canManageSchedule && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(item)}
                                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                                title={isId ? 'Edit' : 'Edit'}
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleConfirmDelete(item)}
                                disabled={deletingId === item.id}
                                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                title={isId ? 'Hapus' : 'Delete'}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <p className="font-semibold text-sm text-foreground leading-snug">
                          {item.subjectName}
                        </p>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                          <span className="truncate max-w-45">{item.teacherName}</span>
                          {item.room && (
                            <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md">
                              <MapPin className="w-3 h-3" />
                              {item.room}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: TEACHER TEACHING LOAD */}
      {activeTab === 'TEACHER_LOAD' && (
        <div className="rounded-2xl border bg-card text-card-foreground shadow-xs overflow-hidden min-w-0">
          <div className="p-5 border-b flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-semibold">
                {isId ? 'Rekap Beban Mengajar PTK' : 'Teacher Workload Summary'}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                {isId
                  ? 'Distribusi sesi dan durasi mengajar mingguan per guru pada tahun ajaran aktif'
                  : 'Weekly session and teaching duration distribution per teacher in the active academic year'}
              </p>
            </div>
            <Badge variant="outline" className="text-xs">
              {teacherLoadList.length} {isId ? 'PTK Aktif' : 'Active Teachers'}
            </Badge>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-muted-foreground uppercase bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-3.5 font-medium">
                    {isId ? 'Nama Guru' : 'Teacher Name'}
                  </th>
                  <th className="px-4 py-3.5 font-medium">
                    {isId ? 'Mapel Ampuan' : 'Subjects'}
                  </th>
                  <th className="px-4 py-3.5 font-medium">
                    {isId ? 'Kelas Diajar' : 'Assigned Classes'}
                  </th>
                  <th className="px-4 py-3.5 font-medium text-right whitespace-nowrap">
                    {isId ? 'Total Sesi' : 'Total Sessions'}
                  </th>
                  <th className="px-4 py-3.5 font-medium text-right whitespace-nowrap">
                    {isId ? 'Durasi / Minggu' : 'Hours / Week'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {teacherLoadList.map(
                  ({ teacher, sessionCount, totalHoursFormatted, uniqueClasses }) => (
                    <tr key={teacher.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3.5 font-medium text-foreground">
                        {teacher.fullName}
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        {teacher.subjects || '-'}
                      </td>
                      <td className="px-4 py-3.5">
                        {uniqueClasses.length === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {isId ? 'Belum terjadwal' : 'Not scheduled'}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {uniqueClasses.map((clsName) => (
                              <Badge key={clsName} variant="outline" className="text-xs">
                                {clsName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <Badge
                          variant={sessionCount > 0 ? 'default' : 'secondary'}
                          className={
                            sessionCount > 0
                              ? 'bg-emerald-600 text-white hover:bg-emerald-600'
                              : ''
                          }
                        >
                          {sessionCount} {isId ? 'Sesi' : 'Sessions'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-right text-muted-foreground whitespace-nowrap font-medium">
                        {totalHoursFormatted} {isId ? 'Jam' : 'Hrs'}
                      </td>
                    </tr>
                  )
                )}
                {teacherLoadList.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      {isId
                        ? 'Tidak ada data guru yang sesuai dengan pencarian.'
                        : 'No teacher records matched your search.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      {context && (
        <ScheduleFormModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onSaved={reload}
          schoolId={context.schoolId}
          academicYearId={context.academicYearId}
          workDaysMode={context.workDaysMode}
          classes={classes}
          subjects={subjects}
          teachers={teachers}
          existingEntries={entries}
          editingEntry={editingEntry}
          defaultClassId={selectedClassId}
          defaultDayOfWeek={modalDefaultDay}
          isId={isId}
        />
      )}
    </div>
  );
}