import { supabase } from '@/services/supabase.client';
import type {
  DayOfWeekNumber,
  ScheduleBundleData,
  ScheduleClassOption,
  ScheduleConflictInfo,
  ScheduleEntryItem,
  ScheduleEntryPayload,
  ScheduleSchoolContext,
  ScheduleSubjectOption,
  ScheduleTeacherOption,
  WorkDaysMode,
} from '../types/schedules.types';

export const DAY_LABELS_ID: Record<DayOfWeekNumber, string> = {
  1: 'Senin',
  2: 'Selasa',
  3: 'Rabu',
  4: 'Kamis',
  5: 'Jumat',
  6: 'Sabtu',
};

export const DAY_LABELS_EN: Record<DayOfWeekNumber, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

const ACADEMIC_MANAGER_ROLES = new Set([
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
]);

export function getDayLabel(day: DayOfWeekNumber, isId = true): string {
  return isId ? DAY_LABELS_ID[day] : DAY_LABELS_EN[day];
}

export function normalizeTimeHHMM(rawTime: string | null | undefined): string {
  if (!rawTime) return '00:00';
  const parts = rawTime.trim().split(':');
  const hh = (parts[0] ?? '00').padStart(2, '0');
  const mm = (parts[1] ?? '00').padStart(2, '0');
  return `${hh}:${mm}`;
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = normalizeTimeHHMM(hhmm).split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

export function getJakartaNowInfo(): {
  dayOfWeek: DayOfWeekNumber | null;
  minutesNow: number;
  hhmmNow: string;
} {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const weekdayStr = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hourStr = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minuteStr = parts.find((p) => p.type === 'minute')?.value ?? '00';

  const dayMap: Record<string, DayOfWeekNumber> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const hhmmNow = `${hourStr.padStart(2, '0')}:${minuteStr.padStart(2, '0')}`;
  return {
    dayOfWeek: dayMap[weekdayStr] ?? null,
    minutesNow: timeToMinutes(hhmmNow),
    hhmmNow,
  };
}

export function detectScheduleConflicts(
  candidate: {
    id?: string;
    classId: string;
    teacherId: string | null;
    dayOfWeek: DayOfWeekNumber;
    startTime: string;
    endTime: string;
    room: string;
  },
  existingEntries: ScheduleEntryItem[],
  isId = true
): ScheduleConflictInfo[] {
  const conflicts: ScheduleConflictInfo[] = [];
  const startMin = timeToMinutes(candidate.startTime);
  const endMin = timeToMinutes(candidate.endTime);

  if (endMin <= startMin) {
    return conflicts;
  }

  const normalizedRoom = candidate.room.trim().toLowerCase();

  for (const entry of existingEntries) {
    if (!entry.isActive) continue;
    if (candidate.id && entry.id === candidate.id) continue;
    if (entry.dayOfWeek !== candidate.dayOfWeek) continue;

    const entryStart = timeToMinutes(entry.startTime);
    const entryEnd = timeToMinutes(entry.endTime);
    const isOverlapping = startMin < entryEnd && endMin > entryStart;

    if (!isOverlapping) continue;

    if (entry.classId === candidate.classId) {
      conflicts.push({
        type: 'CLASS',
        message: isId
          ? `Kelas bentrok dengan "${entry.subjectName}" (${entry.startTime} - ${entry.endTime}).`
          : `Class conflicts with "${entry.subjectName}" (${entry.startTime} - ${entry.endTime}).`,
      });
    }

    if (candidate.teacherId && entry.teacherId === candidate.teacherId) {
      conflicts.push({
        type: 'TEACHER',
        message: isId
          ? `Guru bentrok karena mengajar di kelas ${entry.className} (${entry.startTime} - ${entry.endTime}).`
          : `Teacher conflicts with class ${entry.className} (${entry.startTime} - ${entry.endTime}).`,
      });
    }

    if (
      normalizedRoom.length > 0 &&
      entry.room &&
      entry.room.trim().toLowerCase() === normalizedRoom
    ) {
      conflicts.push({
        type: 'ROOM',
        message: isId
          ? `Ruangan "${entry.room}" dipakai kelas ${entry.className} (${entry.startTime} - ${entry.endTime}).`
          : `Room "${entry.room}" is occupied by class ${entry.className} (${entry.startTime} - ${entry.endTime}).`,
      });
    }
  }

  return conflicts;
}

export const schedulesService = {
  async getContext(
    activeSchoolId?: string | null,
    activeAcademicYearId?: string | null
  ): Promise<ScheduleSchoolContext> {
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      throw new Error('Sesi login tidak valid. Silakan masuk kembali.');
    }

    const [userRes, rolesRes] = await Promise.all([
      supabase
        .from('users')
        .select('id, schoolId, role, additionalRoles, isActive')
        .eq('id', user.id)
        .single(),
      supabase.rpc('get_user_all_roles'),
    ]);

    if (userRes.error || !userRes.data) {
      throw new Error('Profil pengguna tidak ditemukan.');
    }

    if (!userRes.data.isActive) {
      throw new Error('Akun pengguna tidak aktif.');
    }

    const allRoles: string[] = Array.isArray(rolesRes.data)
      ? (rolesRes.data as string[])
      : [userRes.data.role, ...((userRes.data.additionalRoles as string[] | null) ?? [])];

    const targetSchoolId =
      userRes.data.role === 'SUPER_ADMIN'
        ? activeSchoolId ?? null
        : (userRes.data.schoolId as string | null) ?? activeSchoolId ?? null;

    if (!targetSchoolId) {
      throw new Error(
        'Silakan pilih sekolah terlebih dahulu melalui tombol "Ganti Sekolah" di bagian atas.'
      );
    }

    const [schoolRes, preferredYearRes, fallbackYearRes, teacherRes, linksRes] =
      await Promise.all([
        supabase
          .from('schools')
          .select('id, name, workDaysMode, workStartTime, workEndTime')
          .eq('id', targetSchoolId)
          .single(),
        activeAcademicYearId
          ? supabase
              .from('academic_years')
              .select('id, name, isActive')
              .eq('schoolId', targetSchoolId)
              .eq('id', activeAcademicYearId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from('academic_years')
          .select('id, name, isActive')
          .eq('schoolId', targetSchoolId)
          .order('isActive', { ascending: false })
          .order('startYear', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('teachers')
          .select('id')
          .eq('schoolId', targetSchoolId)
          .eq('userId', user.id)
          .eq('isActive', true)
          .maybeSingle(),
        supabase
          .from('user_student_links')
          .select('student:students(classId)')
          .eq('schoolId', targetSchoolId)
          .eq('userId', user.id),
      ]);

    if (schoolRes.error || !schoolRes.data) {
      throw new Error('Data konfigurasi sekolah tidak ditemukan.');
    }

    const resolvedYear = preferredYearRes.data ?? fallbackYearRes.data;
    if (fallbackYearRes.error || !resolvedYear) {
      throw new Error(
        'Tahun ajaran belum dibuat. Silakan atur Tahun Ajaran terlebih dahulu di menu Master Akademik.'
      );
    }

    const linkedClassIds: string[] = [];
    if (Array.isArray(linksRes.data)) {
      for (const row of linksRes.data as Array<{ student?: { classId?: string | null } | null }>) {
        const cid = row?.student?.classId;
        if (cid && !linkedClassIds.includes(cid)) {
          linkedClassIds.push(cid);
        }
      }
    }

    const canManageSchedule = allRoles.some((r) => ACADEMIC_MANAGER_ROLES.has(r));

    return {
      schoolId: schoolRes.data.id as string,
      schoolName: schoolRes.data.name as string,
      workDaysMode: (schoolRes.data.workDaysMode as WorkDaysMode) || 'SIX_DAYS',
      workStartTime: normalizeTimeHHMM((schoolRes.data.workStartTime as string | null) || '07:30'),
      workEndTime: normalizeTimeHHMM((schoolRes.data.workEndTime as string | null) || '14:30'),
      academicYearId: resolvedYear.id as string,
      academicYearName: resolvedYear.name as string,
      userId: user.id,
      primaryRole: userRes.data.role as string,
      allRoles,
      canManageSchedule,
      currentTeacherId: (teacherRes.data?.id as string | undefined) ?? null,
      linkedClassIds,
    };
  },

  async getBundle(schoolId: string, academicYearId: string): Promise<ScheduleBundleData> {
    const [classesRes, subjectsRes, teachersRes, entriesRes] = await Promise.all([
      supabase
        .from('classes')
        .select('id, name, gradeLevel, major, homeroomTeacherId')
        .eq('schoolId', schoolId)
        .eq('academicYearId', academicYearId)
        .order('gradeLevel', { ascending: true })
        .order('name', { ascending: true }),

      supabase
        .from('subjects')
        .select('id, code, name, category, sortOrder')
        .eq('schoolId', schoolId)
        .eq('isActive', true)
        .order('sortOrder', { ascending: true })
        .order('name', { ascending: true }),

      supabase.rpc('get_school_teachers_directory', { p_school_id: schoolId }),

      supabase
        .from('schedule_entries')
        .select(
          'id, schoolId, academicYearId, classId, subjectId, teacherId, dayOfWeek, startTime, endTime, room, notes, isActive'
        )
        .eq('schoolId', schoolId)
        .eq('academicYearId', academicYearId)
        .eq('isActive', true)
        .order('dayOfWeek', { ascending: true })
        .order('startTime', { ascending: true }),
    ]);

    if (classesRes.error) throw new Error(`Gagal memuat data kelas: ${classesRes.error.message}`);
    if (subjectsRes.error) throw new Error(`Gagal memuat mata pelajaran: ${subjectsRes.error.message}`);
    if (teachersRes.error) throw new Error(`Gagal memuat direktori guru: ${teachersRes.error.message}`);
    if (entriesRes.error) throw new Error(`Gagal memuat jadwal pelajaran: ${entriesRes.error.message}`);

    const classes: ScheduleClassOption[] = (classesRes.data ?? []).map((c) => ({
      id: c.id as string,
      name: c.name as string,
      gradeLevel: Number(c.gradeLevel),
      major: (c.major as string | null) ?? null,
      homeroomTeacherId: (c.homeroomTeacherId as string | null) ?? null,
    }));

    const subjects: ScheduleSubjectOption[] = (subjectsRes.data ?? []).map((s) => ({
      id: s.id as string,
      code: (s.code as string | null) ?? null,
      name: s.name as string,
      category: (s.category as string | null) ?? 'UMUM',
      sortOrder: Number(s.sortOrder ?? 100),
    }));

    const teachers: ScheduleTeacherOption[] = (
      (teachersRes.data as ScheduleTeacherOption[] | null) ?? []
    ).map((t) => ({
      id: t.id,
      fullName: t.fullName,
      gender: t.gender,
      position: t.position ?? null,
      subjects: t.subjects ?? null,
      tugasTambahan: t.tugasTambahan ?? null,
      photoUrl: t.photoUrl ?? null,
      isActive: t.isActive,
    }));

    const classMap = new Map(classes.map((c) => [c.id, c]));
    const subjectMap = new Map(subjects.map((s) => [s.id, s]));
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));

    const entries: ScheduleEntryItem[] = (entriesRes.data ?? []).map((row) => {
      const cls = classMap.get(row.classId as string);
      const subj = row.subjectId ? subjectMap.get(row.subjectId as string) : undefined;
      const tch = row.teacherId ? teacherMap.get(row.teacherId as string) : undefined;

      return {
        id: row.id as string,
        schoolId: row.schoolId as string,
        academicYearId: row.academicYearId as string,
        classId: row.classId as string,
        className: cls?.name ?? 'Kelas Tidak Diketahui',
        gradeLevel: cls?.gradeLevel ?? 0,
        subjectId: (row.subjectId as string | null) ?? null,
        subjectName: subj?.name ?? 'Belum Ditentukan',
        subjectCode: subj?.code ?? null,
        subjectCategory: subj?.category ?? 'UMUM',
        teacherId: (row.teacherId as string | null) ?? null,
        teacherName: tch?.fullName ?? 'Belum Ditentukan',
        dayOfWeek: Number(row.dayOfWeek) as DayOfWeekNumber,
        startTime: normalizeTimeHHMM(row.startTime as string),
        endTime: normalizeTimeHHMM(row.endTime as string),
        room: (row.room as string | null) ?? null,
        notes: (row.notes as string | null) ?? null,
        isActive: Boolean(row.isActive),
      };
    });

    return { classes, subjects, teachers, entries };
  },

  async saveEntry(payload: ScheduleEntryPayload): Promise<void> {
    const startHHMM = normalizeTimeHHMM(payload.startTime);
    const endHHMM = normalizeTimeHHMM(payload.endTime);

    if (timeToMinutes(endHHMM) <= timeToMinutes(startHHMM)) {
      throw new Error('Jam selesai harus lebih akhir daripada jam mulai.');
    }

    if (!payload.classId || !payload.subjectId) {
      throw new Error('Kelas dan Mata Pelajaran wajib dipilih.');
    }

    const record = {
      schoolId: payload.schoolId,
      academicYearId: payload.academicYearId,
      classId: payload.classId,
      subjectId: payload.subjectId,
      teacherId: payload.teacherId || null,
      dayOfWeek: payload.dayOfWeek,
      startTime: `${startHHMM}:00`,
      endTime: `${endHHMM}:00`,
      room: payload.room.trim() || null,
      notes: payload.notes.trim() || null,
      isActive: true,
    };

    if (payload.id) {
      const { error } = await supabase
        .from('schedule_entries')
        .update(record)
        .eq('id', payload.id)
        .eq('schoolId', payload.schoolId);

      if (error) {
        throw new Error(error.message || 'Gagal memperbarui jadwal pelajaran.');
      }
      return;
    }

    const { error } = await supabase.from('schedule_entries').insert(record);

    if (error) {
      throw new Error(error.message || 'Gagal menyimpan jadwal pelajaran.');
    }
  },

  async deleteEntry(entryId: string, schoolId: string): Promise<void> {
    const { error } = await supabase
      .from('schedule_entries')
      .delete()
      .eq('id', entryId)
      .eq('schoolId', schoolId);

    if (error) {
      throw new Error(error.message || 'Gagal menghapus sesi jadwal.');
    }
  },
};