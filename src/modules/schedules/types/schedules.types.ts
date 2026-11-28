export type WorkDaysMode = 'FIVE_DAYS' | 'SIX_DAYS';

export type DayOfWeekNumber = 1 | 2 | 3 | 4 | 5 | 6;

export type ScheduleViewTab = 'TODAY' | 'WEEKLY_CLASS' | 'TEACHER_LOAD';

export interface ScheduleSchoolContext {
  schoolId: string;
  schoolName: string;
  workDaysMode: WorkDaysMode;
  workStartTime: string;
  workEndTime: string;
  academicYearId: string;
  academicYearName: string;
  userId: string;
  primaryRole: string;
  allRoles: string[];
  canManageSchedule: boolean;
  currentTeacherId: string | null;
  linkedClassIds: string[];
}

export interface ScheduleClassOption {
  id: string;
  name: string;
  gradeLevel: number;
  major: string | null;
  homeroomTeacherId: string | null;
}

export interface ScheduleSubjectOption {
  id: string;
  code: string | null;
  name: string;
  category: string;
  sortOrder: number;
}

export interface ScheduleTeacherOption {
  id: string;
  fullName: string;
  gender: 'L' | 'P';
  position: string | null;
  subjects: string | null;
  tugasTambahan: string | null;
  photoUrl: string | null;
  isActive: boolean;
}

export interface ScheduleEntryItem {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  className: string;
  gradeLevel: number;
  subjectId: string | null;
  subjectName: string;
  subjectCode: string | null;
  subjectCategory: string;
  teacherId: string | null;
  teacherName: string;
  dayOfWeek: DayOfWeekNumber;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  room: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface ScheduleEntryPayload {
  id?: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherId: string | null;
  dayOfWeek: DayOfWeekNumber;
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  room: string;
  notes: string;
}

export interface ScheduleConflictInfo {
  type: 'CLASS' | 'TEACHER' | 'ROOM';
  message: string;
}

export interface ScheduleBundleData {
  classes: ScheduleClassOption[];
  subjects: ScheduleSubjectOption[];
  teachers: ScheduleTeacherOption[];
  entries: ScheduleEntryItem[];
}