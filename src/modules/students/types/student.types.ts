import type {
  EconomicCategory,
  Gender,
  AttendanceStatus,
} from '@/types/common.types';

/**
 * Status keaktifan siswa di sekolah.
 * Sesuai dengan nilai default 'AKTIF' pada tabel `public.students`.
 */
export type StudentStatus =
  | 'AKTIF'
  | 'MUTASI_KELUAR'
  | 'LULUS'
  | 'DO'
  | 'CUTI';

/**
 * 1. DATA RINGKAS UNTUK TABEL & EXPORT EXCEL
 * Digunakan pada halaman daftar siswa agar ringan saat memuat ratusan baris data.
 */
export interface StudentListItem {
  id: string;
  nis?: string | null;
  nisn: string;
  nik: string;
  fullName: string;
  gender: Gender;

  // Catatan: `className` & `gradeLevel` bukan kolom di tabel `students`,
  // melainkan diambil dari relasi tabel `classes` saat query Supabase.
  className: string;
  classId: string | null;
  gradeLevel: number;

  status: StudentStatus;
  photoUrl?: string | null;
  phone?: string | null;
  entryDate: string;

  // Data tambahan untuk kebutuhan tabel & export Excel
  birthPlace: string;
  birthDate: string;
  religion?: string | null;
  address: string;
}

/**
 * 2. DATA DETAIL LENGKAP SISWA (STANDAR DAPODIK)
 * Digunakan pada halaman profil detail siswa dan saat mengisi form edit.
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

  // Data Periodik, Fisik & Tempat Tinggal (Sesuai kolom SQL `public.students`)
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

  // Data Rekening Bank (Untuk pencairan PIP / Beasiswa)
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
  relation: 'AYAH' | 'IBU' | 'WALI';
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
}

/**
 * 4. DATA KESEJAHTERAAN & BANTUAN SOSIAL (`public.student_economics`)
 */
export interface StudentEconomic {
  id?: string;
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
  orphanType?: 'YATIM' | 'PIATU' | 'YATIM_PIATU' | 'BUKAN' | null;

  // Hasil Skoring Otomatis & Desil DTSEN/DTKS
  pipScore?: number | null;
  economicCategory?: EconomicCategory | null;
  desil?: number | null;
  scoringDetails?: Record<string, unknown> | null; // Tipe JSONB di Supabase
  scoredAt?: string | null;
}

/**
 * 5. PAYLOAD UNTUK SIMPAN & UPDATE DATA
 * `schoolId` pada relasi orang tua dan ekonomi diisi otomatis oleh service/RPC,
 * sehingga tidak perlu dikirim dari komponen form.
 */
export type CreateStudentParentPayload = Omit<StudentParent, 'id'>;

export type CreateStudentEconomicPayload = Omit<
  StudentEconomic,
  'id' | 'studentId'
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
  entryDate: string;
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
 * Saat memperbarui data siswa, `schoolId` dilarang diubah demi menjaga keamanan multi-tenant.
 */
export type UpdateStudentPayload = Partial<
  Omit<CreateStudentPayload, 'schoolId'>
>;

/**
 * 6. DATA UNTUK FITUR IMPORT MASSAL EXCEL DAPODIK
 * Mendukung fungsi RPC `bulk_import_students` di Supabase.
 */
export interface StudentBulkImportItem extends CreateStudentPayload {
  id?: string;
  rawClassName?: string;
  diffAction?: 'new' | 'updated';
  diffFields?: string[];
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