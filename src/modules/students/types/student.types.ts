import type { EconomicCategory, Gender, AttendanceStatus } from '@/types/common.types';

export interface StudentListItem {
  id: string;
  nisn: string;
  nik: string;
  fullName: string;
  gender: Gender;
  className: string;
  classId: string;
  gradeLevel: number;
  status: StudentStatus;
  photoUrl?: string;
  phone?: string;
  entryDate: string;
}

export type StudentStatus = 'AKTIF' | 'MUTASI_KELUAR' | 'LULUS' | 'DO' | 'CUTI';

export interface StudentDetail extends StudentListItem {
  noKk: string;
  nickname?: string;
  birthDate: string;
  birthPlace: string;
  religion: string;
  address: string;
  rt: string;
  rw: string;
  kelurahan: string;
  kecamatan: string;
  city: string;
  province: string;
  postalCode?: string;
  email?: string;
  distanceToSchool?: number;
  transport?: string;
  previousSchool?: string;
  parents: StudentParent[];
  economic?: StudentEconomic;
}

export interface StudentParent {
  id: string;
  relation: 'AYAH' | 'IBU' | 'WALI';
  fullName: string;
  nik?: string;
  phone?: string;
  email?: string;
  education?: string;
  occupation?: string;
  monthlyIncome?: number;
  isAlive: boolean;
  address?: string;
}

export interface StudentEconomic {
  hasKip: boolean;
  kipNumber?: string;
  hasKks: boolean;
  kksNumber?: string;
  hasPkh: boolean;
  isDtks: boolean;
  houseOwnership?: string;
  houseCondition?: string;
  dependentsCount?: number;
  isOrphan: boolean;
  orphanType?: 'YATIM' | 'PIATU' | 'YATIM_PIATU' | 'BUKAN';
  pipScore?: number;
  economicCategory?: EconomicCategory;
}

export interface CreateStudentPayload {
  nisn: string;
  nik: string;
  noKk: string;
  fullName: string;
  nickname?: string;
  gender: Gender;
  birthDate: string;
  birthPlace: string;
  religion: string;
  address: string;
  rt?: string;
  rw?: string;
  kelurahan?: string;
  kecamatan?: string;
  city: string;
  province: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  classId: string;
  entryDate: string;
  parents?: Omit<StudentParent, 'id'>[];
}

export type UpdateStudentPayload = Partial<CreateStudentPayload>;

export interface StudentAttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
  recordedBy: string;
}
