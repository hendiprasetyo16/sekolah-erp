// src/hooks/useTeacherScope.ts
import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
import { resolveSchoolFilterGroup } from '@/constants/school.constants';
import { normalizeTeacherSchoolId } from '@/modules/teachers/services/teacher.service';

// Role manajemen akademik yang dapat melihat seluruh data guru & semua kelas
const FULL_ACADEMIC_ACCESS_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
  'OPERATOR',
  'STAFF_TU',
] as const;

// Role pimpinan yang diizinkan melihat rekap kehadiran seluruh guru
const TEACHER_ATTENDANCE_ADMIN_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'KEPALA_SEKOLAH',
] as const;

export interface TeacherSubjectAssignmentScope {
  id: string;
  subjectId: string;
  classId: string;
  academicYearId: string;
  weeklyHours: number;
  isPrimary: boolean;
}

export interface TeacherScopeResult {
  isLoading: boolean;
  effectiveRoles: string[];
  hasFullAcademicAccess: boolean;
  canViewAllTeacherAttendance: boolean;
  teacherId: string | null;
  homeroomClassIds: string[];
  isHomeroomTeacher: boolean;
  teachingAssignments: TeacherSubjectAssignmentScope[];
  taughtClassIds: string[];
  taughtSubjectIds: string[];
  accessibleClassIds: string[];
  canTeachSubjectInClass: (subjectId: string, classId: string) => boolean;
  isElementarySchool: boolean;
  isElementaryHomeroomRestricted: boolean;
}

export function useTeacherScope(overrideSchoolId?: string | null): TeacherScopeResult {
  const user = useAuthStore((state) => state.user);
  const school = useAuthStore((state) => state.school);
  const getEffectiveRoles = useAuthStore((state) => state.getEffectiveRoles);

  const activeSchoolId = useMemo(
    () =>
      normalizeTeacherSchoolId(overrideSchoolId) ??
      normalizeTeacherSchoolId(school?.id) ??
      normalizeTeacherSchoolId(user?.schoolId),
    [overrideSchoolId, school?.id, user?.schoolId]
  );

  // Ambil semua peran efektif (role utama + additionalRoles + tugasTambahan Dapodik)
  const effectiveRoles = useMemo(() => {
    if (!user) return [];
    return getEffectiveRoles();
  }, [user, getEffectiveRoles]);

  const hasFullAcademicAccess = useMemo(
    () =>
      effectiveRoles.some((role) =>
        (FULL_ACADEMIC_ACCESS_ROLES as readonly string[]).includes(role)
      ),
    [effectiveRoles]
  );

  const canViewAllTeacherAttendance = useMemo(
    () =>
      effectiveRoles.some((role) =>
        (TEACHER_ATTENDANCE_ADMIN_ROLES as readonly string[]).includes(role)
      ),
    [effectiveRoles]
  );

  // Cari profil guru (teacherId), kelas wali (homeroomClassIds), & penugasan mapel (teachingAssignments)
  const scopeQuery = useQuery({
    queryKey: ['teacher-scope', activeSchoolId, user?.id, user?.email],
    enabled: Boolean(activeSchoolId && user?.id && !hasFullAcademicAccess),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let resolvedTeacherId: string | null = null;

      // 1. Prioritas utama: cocokan kolom teachers.userId dengan user.id
      const { data: byUserId } = await supabase
        .from('teachers')
        .select('id')
        .eq('schoolId', activeSchoolId!)
        .eq('userId', user!.id)
        .maybeSingle();

      if (byUserId?.id) {
        resolvedTeacherId = String(byUserId.id);
      } else if (user?.email) {
        // 2. Cadangan: cocokan email jika userId belum tertaut di tabel teachers
        const { data: byEmail } = await supabase
          .from('teachers')
          .select('id')
          .eq('schoolId', activeSchoolId!)
          .ilike('email', user.email.trim())
          .maybeSingle();

        if (byEmail?.id) {
          resolvedTeacherId = String(byEmail.id);
        }
      }

      if (!resolvedTeacherId) {
        return {
          teacherId: null,
          homeroomClassIds: [] as string[],
          teachingAssignments: [] as TeacherSubjectAssignmentScope[],
        };
      }

      // 3. Cek tahun ajaran aktif & ambil paralel data Wali Kelas + Penugasan Mapel
      const { data: activeYear } = await supabase
        .from('academic_years')
        .select('id')
        .eq('schoolId', activeSchoolId!)
        .eq('isActive', true)
        .maybeSingle();

      const homeroomPromise = supabase
        .from('classes')
        .select('id')
        .eq('schoolId', activeSchoolId!)
        .eq('homeroomTeacherId', resolvedTeacherId);

      const assignmentsQuery = supabase
        .from('teacher_subject_assignments')
        .select('id, subjectId, classId, academicYearId, weeklyHours, isPrimary')
        .eq('schoolId', activeSchoolId!)
        .eq('teacherId', resolvedTeacherId)
        .eq('isActive', true);

      const assignmentsPromise = activeYear?.id
        ? assignmentsQuery.eq('academicYearId', activeYear.id)
        : assignmentsQuery;

      const [homeroomRes, assignmentsRes] = await Promise.all([
        homeroomPromise,
        assignmentsPromise,
      ]);

      const homeroomClassIds = (homeroomRes.data ?? []).map((cls) => String(cls.id));

      const teachingAssignments: TeacherSubjectAssignmentScope[] = (
        assignmentsRes.data ?? []
      ).map((row) => ({
        id: String(row.id),
        subjectId: String(row.subjectId),
        classId: String(row.classId),
        academicYearId: String(row.academicYearId),
        weeklyHours: Number(row.weeklyHours ?? 0),
        isPrimary: Boolean(row.isPrimary),
      }));

      return {
        teacherId: resolvedTeacherId,
        homeroomClassIds,
        teachingAssignments,
      };
    },
  });

  const teacherId = scopeQuery.data?.teacherId ?? null;
  const homeroomClassIds = scopeQuery.data?.homeroomClassIds ?? [];
  const isHomeroomTeacher = homeroomClassIds.length > 0;
  const teachingAssignments = scopeQuery.data?.teachingAssignments ?? [];

  const taughtClassIds = useMemo(
    () => Array.from(new Set(teachingAssignments.map((a) => a.classId))),
    [teachingAssignments]
  );

  const taughtSubjectIds = useMemo(
    () => Array.from(new Set(teachingAssignments.map((a) => a.subjectId))),
    [teachingAssignments]
  );

  const accessibleClassIds = useMemo(
    () => Array.from(new Set([...homeroomClassIds, ...taughtClassIds])),
    [homeroomClassIds, taughtClassIds]
  );

  // Gunakan helper resmi aplikasi untuk mendeteksi jenjang SD / MI / SDLB
  const isElementarySchool = useMemo(
    () => resolveSchoolFilterGroup(school?.level) === 'SD',
    [school?.level]
  );

  // Wali Kelas di jenjang SD dibatasi hanya pada kelas walinya; Guru Mapel tetap bebas
  const isElementaryHomeroomRestricted =
    !hasFullAcademicAccess && isElementarySchool && isHomeroomTeacher;

  const canTeachSubjectInClass = useCallback(
    (subjectId: string, classId: string): boolean => {
      if (hasFullAcademicAccess) return true;
      return teachingAssignments.some(
        (a) => a.subjectId === subjectId && a.classId === classId
      );
    },
    [hasFullAcademicAccess, teachingAssignments]
  );

  return {
    isLoading:
      !hasFullAcademicAccess && Boolean(activeSchoolId && user?.id) && scopeQuery.isLoading,
    effectiveRoles,
    hasFullAcademicAccess,
    canViewAllTeacherAttendance,
    teacherId,
    homeroomClassIds,
    isHomeroomTeacher,
    teachingAssignments,
    taughtClassIds,
    taughtSubjectIds,
    accessibleClassIds,
    canTeachSubjectInClass,
    isElementarySchool,
    isElementaryHomeroomRestricted,
  };
}