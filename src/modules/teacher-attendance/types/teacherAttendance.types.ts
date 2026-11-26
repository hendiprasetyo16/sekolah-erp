// src/modules/teacher-attendance/types/teacherAttendance.types.ts

export type SubView = 'beranda' | 'peta' | 'izin' | 'laporan' | 'log';

export type LeaveCategory = 'DINAS_LUAR' | 'IZIN' | 'SAKIT';

export type CheckOutTimingStatus = 'EARLY' | 'ON_TIME' | 'OVERTIME';

export interface DailyQuoteItem {
  quote: string;
  author?: string;
}

export interface DailyQuoteDbRow {
  quote: string;
  author?: string | null;
  isActive?: boolean;
  schoolId?: string | null;
  createdAt?: string;
}

export interface SchoolDbRow {
  id: string;
  name?: string | null;
  latitude?: number | string | null;
  lat?: number | string | null;
  longitude?: number | string | null;
  lng?: number | string | null;
  attendanceRadiusMeters?: number | string | null;
  attendanceRadius?: number | string | null;
  gpsRadius?: number | string | null;
  radius?: number | string | null;
  workStartTime?: string | null;
  lateToleranceMinutes?: number | string | null;
  workEndTime?: string | null;
  workDaysMode?: 'FIVE_DAYS' | 'SIX_DAYS' | string | null;
  requireSelfieCheckIn?: boolean | null;
  requireSelfieCheckOut?: boolean | null;
  settings?: {
    timezone?: string;
    [key: string]: unknown;
  } | null;
}

export interface SchoolGeoAndSchedule {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  workStartTime: string;
  lateToleranceMinutes: number;
  workEndTime: string;
  workDaysMode: 'FIVE_DAYS' | 'SIX_DAYS';
  requireSelfieCheckIn: boolean;
  requireSelfieCheckOut: boolean;
  timezone: string;
}

export interface TeacherDbRow {
  id: string;
  schoolId?: string | null;
  userId?: string | null;
  fullName?: string | null;
  email?: string | null;
  nip?: string | null;
  nuptk?: string | null;
  nik?: string | null;
  position?: string | null;
  additionalDuties?: string[] | string | null;
  photoUrl?: string | null;
  avatarUrl?: string | null;
  allowDesktopAttendance?: boolean | null;
  isActive?: boolean | null;
  [key: string]: unknown;
}

export interface TeacherProfile {
  id: string;
  schoolId: string;
  userId: string | null;
  fullName: string;
  email: string | null;
  nip: string | null;
  nuptk: string | null;
  nik: string | null;
  position: string | null;
  additionalDuties: string[];
  photoUrl: string | null;
  allowDesktopAttendance: boolean;
}

export interface AttendanceRecord {
  id: string;
  schoolId?: string;
  teacherId?: string;
  type?: string;
  date: string;
  status: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  checkInDistance?: number | null;
  checkOutDistance?: number | null;
  notes?: string | null;
  leaveType?: string | null;
  endDate?: string | null;
  attachmentUrl?: string | null;
  deviceTelemetry?: {
    lateMinutes?: number;
    [key: string]: unknown;
  } | null;
}

export interface SecurityAuditState {
  isSuspectedMock: boolean;
  flags: string[];
  telemetry: Record<string, unknown>;
}

export interface SubmitGpsRpcResult {
  success?: boolean;
  mode?: 'CHECK_IN' | 'CHECK_OUT';
  status?: string;
  serverTime?: string;
  distance?: number;
  distanceMeters?: number;
  [key: string]: unknown;
}