// src/modules/attendance/types/attendance.types.ts
export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPA';

export interface AttendanceSettings {
  checkInDeadline: string; // Format 'HH:mm', default '07:30'
  checkOutStart: string;   // Format 'HH:mm', default '14:00'
  requireSelfie: boolean;  // Apakah guru wajib selfie saat check-in
}

export interface StudentAttendance {
  id: string;
  schoolId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
  recordedBy?: string | null;
  createdAt: string;
  time?: string | null;
  student?: {
    fullName: string;
    nisn: string;
    nis?: string | null;
    photoUrl?: string | null;
    classId?: string | null;
    classes?: {
      name: string;
    };
  };
}

export interface ClassStudentAttendanceRow {
  studentId: string;
  fullName: string;
  nisn: string;
  nis?: string | null;
  photoUrl?: string | null;
  attendanceId?: string;
  status: AttendanceStatus | null;
  checkInTime?: string | null;
  notes: string;
  isFromKiosk: boolean;
}

export interface TeacherAttendance {
  id: string;
  schoolId: string;
  teacherId: string;
  date: string;
  checkInTime?: string | null;
  checkOutTime?: string | null;
  status: AttendanceStatus;
  checkInLat?: number | null;
  checkInLng?: number | null;
  checkInDistance?: number | null;
  isCheckInMock?: boolean;
  checkInSelfieUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  teacher?: {
    fullName: string;
    nip?: string | null;
    nuptk?: string | null;
    position?: string | null;
    photoUrl?: string | null;
  };
}

export interface SchoolCoordinates {
  latitude: number | null;
  longitude: number | null;
  attendanceRadiusMeters: number;
  settings: AttendanceSettings;
}

export interface AttendanceSummary {
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
  teacherAbsent: number;
  teacherPercentage: number;
}