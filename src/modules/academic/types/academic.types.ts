/**
 * Tipe data utama untuk entitas Tahun Ajaran.
 */
export interface AcademicYear {
    id: string;
    schoolId: string;
    name: string;
    startYear: number;
    endYear: number;
    isActive: boolean;
    createdAt: string;
}

/**
 * Tipe data relasi (Join) ringan yang digunakan saat kita hanya
 * membutuhkan sebagian kecil data dari tabel lain.
 */
export interface AcademicYearRelation {
    id: string;
    name: string;
    isActive: boolean;
}

export interface TeacherRelation {
    id: string;
    fullName: string;
}

export interface StudentRelation {
    id: string;
    status: string;
}

/**
 * Tipe data utama untuk entitas Kelas (Class/Rombel).
 * Digunakan untuk menampilkan data kelas di tabel (ClassListPage).
 */
export interface ClassItem {
    id: string;
    schoolId: string;
    academicYearId: string;
    name: string;
    gradeLevel: number;
    major?: string | null;
    homeroomTeacherId?: string | null;
    capacity: number;

    // Relasi data hasil JOIN dari tabel Supabase
    academic_years?: AcademicYearRelation | null;
    teachers?: TeacherRelation | null;

    // Agregasi: Jumlah siswa dengan status AKTIF di kelas ini
    studentCount?: number;
}

/**
 * Payload (Data yang dikirim) saat membuat kelas BARU.
 * Semua properti wajib diisi kecuali yang memiliki tanda '?'
 */
export interface CreateClassPayload {
    schoolId: string;
    academicYearId: string;
    name: string;
    gradeLevel: number;
    major?: string | null;
    homeroomTeacherId?: string | null;
    capacity: number;
}

/**
 * Payload (Data yang dikirim) saat MENGUBAH (Update) kelas.
 * Kita menggunakan utilitas TypeScript:
 * 1. Omit<..., 'schoolId'> : Membuang properti schoolId agar tidak bisa diubah.
 * 2. Partial<...> : Membuat semua properti yang tersisa menjadi opsional.
 */
/**
 * schoolId tidak boleh diubah melalui payload update.
 * Identitas sekolah ditentukan dari parameter service
 * dan tetap harus divalidasi oleh RLS di Supabase.
 */
export type UpdateClassPayload = Partial<Omit<CreateClassPayload, 'schoolId'>>;