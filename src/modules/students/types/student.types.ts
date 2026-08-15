import type { EconomicCategory, Gender, AttendanceStatus } from '@/types/common.types';

export interface StudentListItem {
  id: string;
  nis?: string;
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

  // Dikembalikan untuk kebutuhan Export Excel & Tabel
  birthPlace: string;
  birthDate: string;
  religion?: string;
  address: string;
}

export type StudentStatus = 'AKTIF' | 'MUTASI_KELUAR' | 'LULUS' | 'DO' | 'CUTI';

export interface StudentDetail extends StudentListItem {
  schoolId: string;
  noKk?: string;
  nickname?: string;
  rt?: string;
  rw?: string;
  kelurahan?: string;
  kecamatan?: string;
  city: string;
  province: string;
  postalCode?: string;
  email?: string;
  distanceToSchool?: number;
  transport?: string;
  previousSchool?: string;

  // Dapodik / Fisik / Bank (Sesuai update tabel terbaru)
  skhun?: string;
  noPesertaUn?: string;
  noIjazah?: string;
  noAktaLahir?: string;
  anakKe?: number;
  jmlSaudara?: number;
  lintang?: string;
  bujur?: string;
  beratBadan?: number;
  tinggiBadan?: number;
  lingkarKepala?: number;
  jarakSekolah?: number;
  jenisTinggal?: string;
  alatTransportasi?: string;
  kebutuhanKhusus?: string;
  sekolahAsal?: string;
  bank?: string;
  noRekening?: string;
  namaRekening?: string;

  // Relasi
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

  // Update terbaru PIP/KIP
  scoringDetails?: string;
  scoredAt?: string;
  namaKip?: string;
  layakPip?: boolean;
  alasanLayakPip?: string;
}

// Payload untuk menambah data siswa baru secara komprehensif
export interface CreateStudentPayload {
  schoolId: string;
  nis?: string;
  nisn: string;
  nik: string;
  noKk?: string;
  fullName: string;
  nickname?: string;
  gender: Gender;
  birthDate: string;
  birthPlace: string;
  religion?: string;
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
  classId?: string;
  entryDate: string;
  status?: StudentStatus;

  // Dapodik / Fisik / Bank
  skhun?: string;
  noPesertaUn?: string;
  noIjazah?: string;
  noAktaLahir?: string;
  anakKe?: number;
  jmlSaudara?: number;
  lintang?: string;
  bujur?: string;
  beratBadan?: number;
  tinggiBadan?: number;
  lingkarKepala?: number;
  jarakSekolah?: number;
  jenisTinggal?: string;
  alatTransportasi?: string;
  kebutuhanKhusus?: string;
  sekolahAsal?: string;
  bank?: string;
  noRekening?: string;
  namaRekening?: string;

  // Relasi Data
  parents?: Omit<StudentParent, 'id'>[];
  economic?: Omit<StudentEconomic, 'id' | 'studentId'>;
}

export type UpdateStudentPayload = Partial<CreateStudentPayload>;

export interface StudentAttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string;
  recordedBy: string;
}