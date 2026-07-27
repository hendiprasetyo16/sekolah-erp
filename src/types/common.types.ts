export type Locale = 'id' | 'en';

export type Theme = 'light' | 'dark' | 'system';

export type UserRole =
  | 'SUPER_ADMIN'
  | 'KEPALA_SEKOLAH'
  | 'BENDAHARA'
  | 'OPERATOR'
  | 'WALI_KELAS'
  | 'GURU'
  | 'STAFF_TU'
  | 'STAFF_SARPRAS'
  | 'ORANG_TUA'
  | 'SISWA';

export type SchoolLevel = 'SD' | 'SMP' | 'SMA' | 'SMK';

export type SchoolType = 'NEGERI' | 'SWASTA';

export type Gender = 'L' | 'P';

export type SemesterType = 'GANJIL' | 'GENAP';

export type AttendanceStatus = 'HADIR' | 'IZIN' | 'SAKIT' | 'ALPHA' | 'TERLAMBAT';

export type PaymentStatus = 'BELUM_BAYAR' | 'SEBAGIAN' | 'LUNAS' | 'DIBATALKAN';

export type PaymentMethod = 'TUNAI' | 'TRANSFER' | 'VA' | 'QRIS';

export type ItemCondition = 'BAIK' | 'RUSAK_RINGAN' | 'RUSAK_BERAT' | 'HILANG';

export type EconomicCategory = 'SANGAT_MISKIN' | 'RENTAN_MISKIN' | 'MENENGAH' | 'MAMPU';

export type LetterType = 'MASUK' | 'KELUAR';

export type TransactionType = 'MASUK' | 'KELUAR';

export type ApprovalStatus = 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiError {
  success: false;
  message: string;
  errors?: Record<string, string[]>;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface DateRange {
  from: Date;
  to: Date;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatarUrl?: string;
  schoolId: string;
  isActive: boolean;
  lastLogin?: string;
}

export interface School {
  id: string;
  name: string;
  npsn: string;
  level: SchoolLevel;
  type: SchoolType;
  address: string;
  city: string;
  province: string;
  phone: string;
  email: string;
  logoUrl?: string;
}

export interface AcademicYear {
  id: string;
  name: string;
  startYear: number;
  endYear: number;
  isActive: boolean;
}

export interface Semester {
  id: string;
  academicYearId: string;
  type: SemesterType;
  startDate: string;
  endDate: string;
  isActive: boolean;
}
