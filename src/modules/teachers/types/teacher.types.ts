import type { Gender } from '@/types/common.types';

/**
 * Status kepegawaian guru & tenaga kependidikan (`public.teachers.status`).
 */
export type TeacherStatus =
  | 'PNS'
  | 'CPNS'
  | 'PPPK'
  | 'HONORER'
  | 'GTY'
  | 'GTT';

/**
 * Kolom yang diizinkan untuk pengurutan pada `teacherService.list`.
 */
export type TeacherSortField =
  | 'fullName'
  | 'nip'
  | 'nuptk'
  | 'position'
  | 'status'
  | 'joinDate'
  | 'createdAt';

/**
 * 1. DATA RINGKAS UNTUK TABEL & DAFTAR GURU
 */
export interface TeacherListItem {
  id: string;
  schoolId: string;
  userId?: string | null;

  fullName: string;
  nip?: string | null;
  nuptk?: string | null;
  nik?: string | null;
  gender: Gender;

  phone?: string | null;
  email?: string | null;
  status?: TeacherStatus | string | null;
  position?: string | null;
  tugasTambahan?: string | null;

  isCertified: boolean;
  isActive: boolean;
  photoUrl?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

/**
 * 2. DATA DETAIL LENGKAP GURU & PTK (STANDAR DAPODIK - `public.teachers`)
 */
export interface TeacherDetail extends TeacherListItem {
  noKk?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  religion?: string | null;
  kewarganegaraan?: string | null;
  namaIbuKandung?: string | null;

  // Alamat & Kontak Lengkap
  address?: string | null;
  dusun?: string | null;
  rt?: string | null;
  rw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  telepon?: string | null;
  lintang?: string | null;
  bujur?: string | null;

  // Pendidikan & Akademik
  education?: string | null;
  major?: string | null;
  university?: string | null;
  certificationNumber?: string | null;
  subjects?: string | null;
  maxHoursPerWeek: number;

  // Kepegawaian & SK
  joinDate?: string | null;
  baseSalary?: number | null;
  skCpns?: string | null;
  tanggalCpns?: string | null;
  skPengangkatan?: string | null;
  tmtPengangkatan?: string | null;
  lembagaPengangkatan?: string | null;
  pangkatGolongan?: string | null;
  sumberGaji?: string | null;
  tmtPns?: string | null;
  karpeg?: string | null;

  // Lisensi & Kompetensi Khusus
  sudahLisensiKepalaSekolah?: boolean | null;
  pernahDiklatKepengawasan?: boolean | null;
  keahlianBraille?: boolean | null;
  keahlianBahasaIsyarat?: boolean | null;
  nuks?: string | null;

  // Keluarga, Pajak & Bank
  statusPerkawinan?: string | null;
  namaSuamiIstri?: string | null;
  nipSuamiIstri?: string | null;
  pekerjaanSuamiIstri?: string | null;
  karisKarsu?: string | null;
  npwp?: string | null;
  namaWajibPajak?: string | null;
  bank?: string | null;
  nomorRekeningBank?: string | null;
  rekeningAtasNama?: string | null;
}

/**
 * 3. PAYLOAD UNTUK SIMPAN & UPDATE DATA
 */
export interface CreateTeacherPayload {
  schoolId: string;
  fullName: string;
  gender: Gender;

  nip?: string | null;
  nuptk?: string | null;
  nik?: string | null;
  noKk?: string | null;
  birthDate?: string | null;
  birthPlace?: string | null;
  religion?: string | null;
  kewarganegaraan?: string | null;
  namaIbuKandung?: string | null;

  address?: string | null;
  dusun?: string | null;
  rt?: string | null;
  rw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  city?: string | null;
  province?: string | null;
  postalCode?: string | null;
  telepon?: string | null;
  phone?: string | null;
  email?: string | null;
  photoUrl?: string | null;
  lintang?: string | null;
  bujur?: string | null;

  education?: string | null;
  major?: string | null;
  university?: string | null;
  status?: string | null;
  position?: string | null;
  tugasTambahan?: string | null;
  isCertified?: boolean;
  certificationNumber?: string | null;
  joinDate?: string | null;
  isActive?: boolean;
  baseSalary?: number | null;
  subjects?: string | null;
  maxHoursPerWeek?: number;

  skCpns?: string | null;
  tanggalCpns?: string | null;
  skPengangkatan?: string | null;
  tmtPengangkatan?: string | null;
  lembagaPengangkatan?: string | null;
  pangkatGolongan?: string | null;
  sumberGaji?: string | null;
  tmtPns?: string | null;
  karpeg?: string | null;

  sudahLisensiKepalaSekolah?: boolean | null;
  pernahDiklatKepengawasan?: boolean | null;
  keahlianBraille?: boolean | null;
  keahlianBahasaIsyarat?: boolean | null;
  nuks?: string | null;

  statusPerkawinan?: string | null;
  namaSuamiIstri?: string | null;
  nipSuamiIstri?: string | null;
  pekerjaanSuamiIstri?: string | null;
  karisKarsu?: string | null;
  npwp?: string | null;
  namaWajibPajak?: string | null;
  bank?: string | null;
  nomorRekeningBank?: string | null;
  rekeningAtasNama?: string | null;
}

export type UpdateTeacherPayload = Partial<Omit<CreateTeacherPayload, 'schoolId'>>;

export interface TeacherListParams {
  schoolId?: string;
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  isCertified?: boolean;
  isActive?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * 4. DATA & HASIL UNTUK FITUR SMARTDIFF IMPORT EXCEL DAPODIK PTK
 */
export type TeacherDiffAction = 'new' | 'updated' | 'unchanged';

export interface TeacherBulkImportItem extends CreateTeacherPayload {
  id?: string;
  diffAction?: TeacherDiffAction;
  diffFields?: string[];
}

export interface TeacherBulkImportResult {
  inserted: number;
  updated: number;
}