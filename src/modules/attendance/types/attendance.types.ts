export type AttendanceStatus = 'HADIR' | 'TERLAMBAT' | 'IZIN' | 'SAKIT' | 'ALPA';

export interface StudentAttendance {
  id: string;
  schoolId: string;
  studentId: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
  recordedBy?: string | null;
  createdAt: string;
  time?: string;
  student?: {
    fullName: string;
    nisn: string;
    nis?: string;
    photoUrl?: string;
    classes?: {
      name: string;
    };
  };
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
    nip?: string;
    nuptk?: string;
    position?: string;
    photoUrl?: string;
  };
}

export interface SchoolCoordinates {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface AttendanceSummary {
  studentTotal: number;
  studentPresent: number;
  studentLate: number;
  studentSick: number;
  studentPermission: number;
  studentAbsent: number;
  studentPercentage: number;

  teacherTotal: number;
  teacherPresent: number;
  teacherLate: number;
  teacherPercentage: number;
}
