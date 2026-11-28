import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { useTeacherScope } from '@/hooks/useTeacherScope';
import {
  getDayLabel,
  getJakartaNowInfo,
  schedulesService,
  timeToMinutes,
} from '../services/schedules.service';
import type {
  DayOfWeekNumber,
  ScheduleClassOption,
  ScheduleEntryItem,
  ScheduleSchoolContext,
  ScheduleSubjectOption,
  ScheduleTeacherOption,
  ScheduleViewTab,
} from '../types/schedules.types';

export interface UseSchedulesOptions {
  isId?: boolean;
  selectedSchoolId?: string | null;
  selectedAcademicYearId?: string | null;
}

export function useSchedulesData(options?: boolean | UseSchedulesOptions) {
  const isId = typeof options === 'boolean' ? options : options?.isId ?? true;
  const overrideSchoolId =
    typeof options === 'object' ? options?.selectedSchoolId ?? null : null;
  const overrideAcademicYearId =
    typeof options === 'object' ? options?.selectedAcademicYearId ?? null : null;

  // Baca sekolah aktif langsung dari Zustand auth.store (sinkron dengan tombol "Ganti Sekolah")
  const authUser = useAuthStore((state) => state.user);
  const activeSchool = useAuthStore((state) => state.school);

  const resolvedSchoolId = useMemo(
    () => overrideSchoolId ?? activeSchool?.id ?? authUser?.schoolId ?? null,
    [overrideSchoolId, activeSchool?.id, authUser?.schoolId]
  );

  const teacherScope = useTeacherScope(resolvedSchoolId);

  const [rawContext, setRawContext] = useState<ScheduleSchoolContext | null>(null);
  const [classes, setClasses] = useState<ScheduleClassOption[]>([]);
  const [subjects, setSubjects] = useState<ScheduleSubjectOption[]>([]);
  const [teachers, setTeachers] = useState<ScheduleTeacherOption[]>([]);
  const [entries, setEntries] = useState<ScheduleEntryItem[]>([]);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const jakartaNow = useMemo(() => getJakartaNowInfo(), []);
  const [activeTab, setActiveTab] = useState<ScheduleViewTab>('TODAY');
  const [selectedDay, setSelectedDay] = useState<DayOfWeekNumber>(
    jakartaNow.dayOfWeek ?? 1
  );
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [onlyMySchedule, setOnlyMySchedule] = useState<boolean>(false);

  const reload = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const ctx = await schedulesService.getContext(
        resolvedSchoolId,
        overrideAcademicYearId
      );
      setRawContext(ctx);

      const bundle = await schedulesService.getBundle(ctx.schoolId, ctx.academicYearId);
      setClasses(bundle.classes);
      setSubjects(bundle.subjects);
      setTeachers(bundle.teachers);
      setEntries(bundle.entries);

      setSelectedClassId((prev) => {
        if (prev && bundle.classes.some((c) => c.id === prev)) return prev;
        if (
          ctx.linkedClassIds.length > 0 &&
          bundle.classes.some((c) => c.id === ctx.linkedClassIds[0])
        ) {
          return ctx.linkedClassIds[0];
        }
        return bundle.classes[0]?.id ?? '';
      });

      if (!ctx.canManageSchedule && ctx.currentTeacherId) {
        setOnlyMySchedule(true);
      } else {
        setOnlyMySchedule(false);
      }
    } catch (err) {
      setRawContext(null);
      setClasses([]);
      setSubjects([]);
      setTeachers([]);
      setEntries([]);
      setErrorMessage(
        err instanceof Error ? err.message : 'Gagal memuat data modul jadwal.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [resolvedSchoolId, overrideAcademicYearId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const context = useMemo<ScheduleSchoolContext | null>(() => {
    if (!rawContext) return null;
    return {
      ...rawContext,
      canManageSchedule:
        rawContext.canManageSchedule || teacherScope.hasFullAcademicAccess,
      currentTeacherId: rawContext.currentTeacherId ?? teacherScope.teacherId,
    };
  }, [rawContext, teacherScope.hasFullAcademicAccess, teacherScope.teacherId]);

  const activeDays = useMemo<DayOfWeekNumber[]>(() => {
    if (context?.workDaysMode === 'FIVE_DAYS') return [1, 2, 3, 4, 5];
    return [1, 2, 3, 4, 5, 6];
  }, [context?.workDaysMode]);

  const visibleEntries = useMemo(() => {
    let list = entries;

    if (
      context &&
      ['ORANG_TUA', 'SISWA'].includes(context.primaryRole) &&
      context.linkedClassIds.length > 0
    ) {
      list = list.filter((e) => context.linkedClassIds.includes(e.classId));
    } else if (onlyMySchedule && context?.currentTeacherId) {
      list = list.filter((e) => e.teacherId === context.currentTeacherId);
    }

    return list;
  }, [entries, context, onlyMySchedule]);

  const kpiSummary = useMemo(() => {
    const todayDay = jakartaNow.dayOfWeek ?? 1;
    const todaySessions = visibleEntries.filter((e) => e.dayOfWeek === todayDay);
    const activeClassesCount = new Set(visibleEntries.map((e) => e.classId)).size;
    const teachingTodayTeachersCount = new Set(
      todaySessions.map((e) => e.teacherId).filter(Boolean)
    ).size;

    return {
      activeClassesCount,
      totalClassesCount: classes.length,
      totalWeeklySessions: visibleEntries.length,
      activeSubjectsCount: subjects.length,
      teachingTodayTeachersCount,
      todaySessionsCount: todaySessions.length,
      todayDayLabel: getDayLabel(todayDay, isId),
    };
  }, [visibleEntries, classes.length, subjects.length, jakartaNow.dayOfWeek, isId]);

  const weeklyOverview = useMemo(() => {
    return activeDays.map((day) => ({
      dayOfWeek: day,
      label: getDayLabel(day, isId),
      sessions: visibleEntries.filter((e) => e.dayOfWeek === day).length,
      isToday: jakartaNow.dayOfWeek === day,
      isSelected: selectedDay === day,
    }));
  }, [activeDays, visibleEntries, jakartaNow.dayOfWeek, selectedDay, isId]);

  const filteredDaySchedule = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleEntries
      .filter((e) => e.dayOfWeek === selectedDay)
      .filter((e) => {
        if (!q) return true;
        return (
          e.subjectName.toLowerCase().includes(q) ||
          e.className.toLowerCase().includes(q) ||
          e.teacherName.toLowerCase().includes(q) ||
          (e.room ?? '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
  }, [visibleEntries, selectedDay, searchQuery]);

  const weeklyClassMatrix = useMemo(() => {
    const classEntries = entries.filter((e) => e.classId === selectedClassId);
    return activeDays.map((day) => ({
      dayOfWeek: day,
      dayName: getDayLabel(day, isId),
      items: classEntries
        .filter((e) => e.dayOfWeek === day)
        .sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime)),
    }));
  }, [entries, selectedClassId, activeDays, isId]);

  const teacherLoadList = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return teachers
      .filter((t) => {
        if (!q) return true;
        return (
          t.fullName.toLowerCase().includes(q) ||
          (t.subjects ?? '').toLowerCase().includes(q)
        );
      })
      .map((teacher) => {
        const teacherSessions = entries.filter((e) => e.teacherId === teacher.id);
        const uniqueClasses = Array.from(new Set(teacherSessions.map((s) => s.className)));
        const totalMinutes = teacherSessions.reduce(
          (acc, s) => acc + (timeToMinutes(s.endTime) - timeToMinutes(s.startTime)),
          0
        );
        return {
          teacher,
          sessionCount: teacherSessions.length,
          totalHoursFormatted: (totalMinutes / 60).toFixed(1),
          uniqueClasses,
        };
      })
      .sort((a, b) => b.sessionCount - a.sessionCount);
  }, [teachers, entries, searchQuery]);

  const removeEntry = useCallback(
    async (entry: ScheduleEntryItem) => {
      if (!context) return;
      try {
        setDeletingId(entry.id);
        setErrorMessage(null);
        await schedulesService.deleteEntry(entry.id, context.schoolId);
        await reload();
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Gagal menghapus sesi jadwal.'
        );
      } finally {
        setDeletingId(null);
      }
    },
    [context, reload]
  );

  return {
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
  };
}