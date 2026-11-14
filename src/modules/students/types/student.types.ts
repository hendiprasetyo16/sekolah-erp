import type {
  EconomicCategory,
  Gender,
  AttendanceStatus,
} from '@/types/common.types';

/**
 * Status keaktifan siswa di sekolah (`public.students.status`).
 */
export type StudentStatus =
  | 'AKTIF'
  | 'MUTASI_KELUAR'
  | 'LULUS'
  | 'DO'
  | 'CUTI';

/**
 * Hubungan keluarga pada tabel `public.student_parents.relation`.
 */
export type ParentRelation = 'AYAH' | 'IBU' | 'WALI';

/**
 * Status yatim/piatu pada tabel `public.student_economics.orphanType`.
 */
export type OrphanType = 'YATIM' | 'PIATU' | 'YATIM_PIATU' | 'BUKAN';

/**
 * Kolom yang diizinkan untuk pengurutan pada `studentService.list`.
 */
export type StudentSortField =
  | 'fullName'
  | 'nisn'
  | 'nis'
  | 'status'
  | 'entryDate'
  | 'className'
  | 'createdAt';

/**
 * 1. DATA RINGKAS UNTUK TABEL & EXPORT EXCEL
 */
export interface StudentListItem {
  id: string;
  nis?: string | null;
  nisn: string;
  nik: string;
  fullName: string;
  gender: Gender;

  // Hasil join dari tabel `classes`
  className: string;
  classId: string | null;
  gradeLevel: number;

  status: StudentStatus;
  photoUrl?: string | null;
  phone?: string | null;
  entryDate: string | null;

  birthPlace: string;
  birthDate: string;
  religion?: string | null;
  address: string;

  createdAt?: string;
  updatedAt?: string;
}

/**
 * 2. DATA DETAIL LENGKAP SISWA (STANDAR DAPODIK - `public.students`)
 */
export interface StudentDetail extends StudentListItem {
  schoolId: string;
  noKk?: string | null;
  nickname?: string | null;

  // Alamat & Kontak Lengkap
  dusun?: string | null;
  rt?: string | null;
  rw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  city: string;
  province: string;
  postalCode?: string | null;
  telepon?: string | null;
  email?: string | null;

  // Dokumen Kelulusan & Identitas Kelahiran
  skhun?: string | null;
  noPesertaUn?: string | null;
  noIjazah?: string | null;
  noAktaLahir?: string | null;

  // Data Periodik, Fisik & Tempat Tinggal
  anakKe?: number | null;
  jmlSaudara?: number | null;
  lintang?: string | null;
  bujur?: string | null;
  beratBadan?: number | null;
  tinggiBadan?: number | null;
  lingkarKepala?: number | null;
  jarakSekolah?: number | null;
  jenisTinggal?: string | null;
  alatTransportasi?: string | null;
  kebutuhanKhusus?: string | null;
  sekolahAsal?: string | null;

  // Data Rekening Bank (Pencairan PIP / Beasiswa)
  bank?: string | null;
  noRekening?: string | null;
  namaRekening?: string | null;

  // Relasi ke tabel `student_parents` dan `student_economics`
  parents: StudentParent[];
  economic?: StudentEconomic | null;
}

/**
 * 3. DATA ORANG TUA / WALI SISWA (`public.student_parents`)
 */
export interface StudentParent {
  id: string;
  schoolId?: string;
  studentId?: string;
  relation: ParentRelation;
  fullName: string;
  birthYear?: string | null;
  nik?: string | null;
  phone?: string | null;
  email?: string | null;
  education?: string | null;
  occupation?: string | null;
  monthlyIncome?: string | null;
  isAlive: boolean;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * 4. DATA KESEJAHTERAAN & BANTUAN SOSIAL (`public.student_economics`)
 */
export interface StudentEconomic {
  id?: string;
  schoolId?: string;
  studentId?: string;

  // Kartu Bantuan & Kelayakan PIP
  hasKip: boolean;
  kipNumber?: string | null;
  namaKip?: string | null;
  layakPip: boolean;
  alasanLayakPip?: string | null;

  hasKks: boolean;
  kksNumber?: string | null;
  hasPkh: boolean;
  isDtks: boolean;

  // Kondisi Rumah & Keluarga
  houseOwnership?: string | null;
  houseCondition?: string | null;
  dependentsCount?: number | null;
  isOrphan: boolean;
  orphanType?: OrphanType | null;

  // Hasil Skoring Otomatis & Desil DTSEN/DTKS
  pipScore?: number | null;
  economicCategory?: EconomicCategory | null;
  desil?: number | null;
  scoringDetails?: Record<string, unknown> | null;
  scoredAt?: string | null;

  createdAt?: string;
  updatedAt?: string;
}

/**
 * 5. PAYLOAD UNTUK SIMPAN & UPDATE DATA
 */
export type CreateStudentParentPayload = Omit<
  StudentParent,
  'id' | 'schoolId' | 'studentId' | 'createdAt' | 'updatedAt'
>;

export type CreateStudentEconomicPayload = Omit<
  StudentEconomic,
  'id' | 'schoolId' | 'studentId' | 'createdAt' | 'updatedAt'
>;

export interface CreateStudentPayload {
  schoolId: string;

  nis?: string | null;
  nisn: string;
  nik: string;
  noKk?: string | null;

  fullName: string;
  nickname?: string | null;
  gender: Gender;
  birthDate: string;
  birthPlace: string;
  religion?: string | null;
  photoUrl?: string | null;

  address: string;
  dusun?: string | null;
  rt?: string | null;
  rw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  city: string;
  province: string;
  postalCode?: string | null;

  telepon?: string | null;
  phone?: string | null;
  email?: string | null;

  classId?: string | null;
  entryDate?: string | null;
  status?: StudentStatus;

  skhun?: string | null;
  noPesertaUn?: string | null;
  noIjazah?: string | null;
  noAktaLahir?: string | null;

  anakKe?: number | null;
  jmlSaudara?: number | null;
  lintang?: string | null;
  bujur?: string | null;
  beratBadan?: number | null;
  tinggiBadan?: number | null;
  lingkarKepala?: number | null;
  jarakSekolah?: number | null;
  jenisTinggal?: string | null;
  alatTransportasi?: string | null;
  kebutuhanKhusus?: string | null;
  sekolahAsal?: string | null;

  bank?: string | null;
  noRekening?: string | null;
  namaRekening?: string | null;

  parents?: CreateStudentParentPayload[];
  economic?: CreateStudentEconomicPayload | null;
}

/**
 * Saat memperbarui data siswa, `schoolId` dilarang diubah demi keamanan multi-tenant.
 */
export type UpdateStudentPayload = Partial<
  Omit<CreateStudentPayload, 'schoolId'>
>;

/**
 * 6. DATA & HASIL UNTUK FITUR IMPORT MASSAL EXCEL DAPODIK
 */
export interface StudentBulkImportItem extends CreateStudentPayload {
  id?: string;
  rawClassName?: string;
  diffAction?: 'new' | 'updated';
  diffFields?: string[];
}

export interface StudentBulkImportResult {
  inserted: number;
  updated: number;
}

/**
 * 7. DATA RIWAYAT KEHADIRAN SISWA (`public.attendances`)
 */
export interface StudentAttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  notes?: string | null;
  recordedBy: string;
}