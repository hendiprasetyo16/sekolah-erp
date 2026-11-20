// src/modules/attendance/types/attendance.types.ts

export type AttendanceTargetType = 'SISWA' | 'GURU';

export type AttendanceStatus =
  | 'HADIR'
  | 'TERLAMBAT'
  | 'IZIN'
  | 'SAKIT'
  | 'ALPA'
  | 'CUTI'
  | 'DINAS'
  | 'DINAS_LUAR';

export type AttendanceApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type WorkDaysMode = 'FIVE_DAYS' | 'SIX_DAYS';

export type HolidayCategoryType = 'NASIONAL' | 'CUTI_BERSAMA' | 'SEKOLAH';

/**
 * Representasi lengkap 1 baris tabel public.attendances (Skema SQL v20.2)
 */
export interface AttendanceRow {
  id: string;
  schoolId: string;
  studentId: string | null;
  teacherId: string | null;
  type: AttendanceTargetType;
  date: string; // Format YYYY-MM-DD
  endDate: string | null;
  status: AttendanceStatus;
  leaveType: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  approvalStatus: AttendanceApprovalStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  recordedBy: string | null;
  checkInTime: string | null; // TIMESTAMPTZ ISO string
  time: string; // Kolom GENERATED ALWAYS AS ('HH:MI' Asia/Jakarta)
  checkOutTime: string | null; // TIMESTAMPTZ ISO string
  checkInLat: number | null;
  checkInLng: number | null;
  checkInDistance: number | null;
  checkInAccuracy: number | null;
  isCheckInMock: boolean | null;
  checkInSelfieUrl: string | null;
  checkOutLat: number | null;
  checkOutLng: number | null;
  checkOutDistance: number | null;
  checkOutAccuracy: number | null;
  isCheckOutMock: boolean | null;
  checkOutSelfieUrl: string | null;
  securityFlags: string[];
  deviceTelemetry: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Relasi profil siswa + kelas pada query presensi siswa
 */
export interface StudentAttendanceProfile {
  id: string;
  nis: string | null;
  nisn: string;
  fullName: string;
  gender: 'L' | 'P' | string;
  photoUrl: string | null;
  classId: string | null;
  classes?: {
    id?: string;
    name: string;
    gradeLevel?: number;
    major?: string | null;
  } | null;
}

/**
 * Data presensi siswa beserta relasi profil siswa & kelas
 */
export interface StudentAttendanceRecord extends AttendanceRow {
  type: 'SISWA';
  student?: StudentAttendanceProfile | null;
}

export type StudentAttendance = StudentAttendanceRecord;

/**
 * Relasi profil guru/PTK pada query presensi guru
 */
export interface TeacherAttendanceProfile {
  id: string;
  nip: string | null;
  nuptk: string | null;
  fullName: string;
  position: string | null;
  photoUrl: string | null;
  allowDesktopAttendance: boolean;
}

/**
 * Data presensi guru/PTK beserta relasi profil guru
 */
export interface TeacherAttendanceRecord extends AttendanceRow {
  type: 'GURU';
  teacher?: TeacherAttendanceProfile | null;
}

export type TeacherAttendance = TeacherAttendanceRecord;

/**
 * Satu baris lembar presensi kelas
 */
export interface ClassStudentAttendanceRow {
  studentId: string;
  fullName: string;
  nisn: string;
  nis: string | null;
  photoUrl: string | null;
  attendanceId?: string;
  status: AttendanceStatus | null;
  checkInTime: string | null;
  time: string;
  notes: string;
  isFromKiosk: boolean;
}

/**
 * Pengaturan presensi & geofencing pada kolom tabel public.schools (Skema SQL v20.2)
 */
export interface SchoolAttendanceSettings {
  id: string;
  name: string;
  latitude: number | null;
  longitude: number | null;
  attendanceRadiusMeters: number;
  workStartTime: string;
  workEndTime: string;
  workDaysMode: WorkDaysMode;
  lateToleranceMinutes: number;
  requireSelfieCheckIn: boolean;
  requireSelfieCheckOut: boolean;
  allowDesktopAttendanceGlobal: boolean;
  studentWorkStartTime: string;
  studentLateToleranceMinutes: number;
  studentWorkEndTime: string;
  studentCheckOutStartTime: string;
  enableStudentKiosk: boolean;
  enableStudentClassAttendance: boolean;
  enableStudentCheckOut: boolean;
  timezone: string;
}

export interface SchoolCoordinates {
  latitude: number | null;
  longitude: number | null;
  attendanceRadiusMeters: number;
  settings: SchoolAttendanceSettings;
}

/**
 * Representasi baris tabel public.school_special_events
 */
export interface SchoolSpecialEvent {
  id: string;
  schoolId: string;
  eventDate: string; // Format YYYY-MM-DD
  reason: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Representasi baris tabel public.national_holidays
 */
export interface NationalHolidayRow {
  id: string;
  schoolId: string | null;
  date: string; // Format YYYY-MM-DD
  name: string;
  type: HolidayCategoryType;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Ringkasan statistik harian presensi siswa dan guru
 */
export interface AttendanceSummary {
  date: string;
  studentTotal: number;
  studentRecorded: number;
  studentPresent: number;
  studentLate: number;
  studentSick: number;
  studentPermission: number;
  studentAbsent: number;
  studentUnrecorded: number;
  studentPercentage: number;
  teacherTotal: number;
  teacherRecorded: number;
  teacherPresent: number;
  teacherLate: number;
  teacherSick: number;
  teacherPermission: number;
  teacherLeaveOrDuty: number;
  teacherAbsent: number;
  teacherUnrecorded: number;
  teacherPendingApprovals: number;
  teacherPercentage: number;
}

/**
 * Payload parameter untuk RPC public.submit_teacher_gps_attendance
 */
export interface SubmitTeacherGpsAttendanceParams {
  mode: 'CHECK_IN' | 'CHECK_OUT';
  lat: number;
  lng: number;
  accuracy: number;
  selfiePath?: string | null;
  earlyReason?: string | null;
  isSuspectedMock?: boolean;
  securityFlags?: string[];
  deviceTelemetry?: Record<string, unknown>;
  simTeacherId?: string | null;
  simSchoolId?: string | null;
}

/**
 * Respons JSONB dari RPC public.submit_teacher_gps_attendance
 */
export interface GpsAttendanceRpcResponse {
  success: boolean;
  mode: 'CHECK_IN' | 'CHECK_OUT';
  status?: AttendanceStatus;
  distance: number;
  serverTime: string;
}

// ============================================================================
// TIPE DATA WHATSAPP GATEWAY (SKEMA SQL v20.2)
// ============================================================================

export type WaGatewayProvider = 'FONNTE' | 'WABLAS' | 'WOOWA' | 'CUSTOM';
export type WaNotificationEventType = 'CHECK_IN' | 'CHECK_OUT' | 'TEST';
export type WaNotificationStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface SchoolWaConfig {
  id?: string;
  schoolId: string;
  isEnabled: boolean;
  provider: WaGatewayProvider;
  apiUrl: string;
  apiToken: string;
  senderNumber?: string | null;
  customHeaders?: Record<string, string>;
  notifyOnCheckIn: boolean;
  notifyOnLate: boolean;
  notifyOnCheckOut: boolean;
  templateCheckIn: string;
  templateCheckOut: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WaNotificationLog {
  id: string;
  schoolId: string;
  studentId: string | null;
  recipientPhone: string;
  eventType: WaNotificationEventType;
  messageBody: string;
  status: WaNotificationStatus;
  providerResponse: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface StudentWaRecipientResult {
  eligible: boolean;
  reason?:
    | 'UNAUTHORIZED'
    | 'FORBIDDEN'
    | 'STUDENT_NOT_FOUND'
    | 'WA_DISABLED'
    | 'NO_PHONE';
  schoolId?: string;
  phone?: string;
  studentName?: string;
  className?: string;
  schoolName?: string;
}