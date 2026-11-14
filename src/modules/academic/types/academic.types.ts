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
 * Payload untuk membuat Tahun Ajaran baru.
 */
export interface CreateAcademicYearPayload {
    schoolId: string;
    startYear: number;
    autoCreateSemesters?: boolean;
}

/**
 * Jenis semester sesuai aturan CHECK di database ('GANJIL' | 'GENAP').
 */
export type SemesterType = 'GANJIL' | 'GENAP';

/**
 * Tipe data utama untuk entitas Semester.
 */
export interface Semester {
    id: string;
    schoolId: string;
    academicYearId: string;
    type: SemesterType;
    startDate: string; // Format YYYY-MM-DD
    endDate: string;   // Format YYYY-MM-DD
    isActive: boolean;
    createdAt: string;
}

/**
 * Payload untuk membuat Semester baru.
 */
export interface CreateSemesterPayload {
    schoolId: string;
    academicYearId: string;
    type: SemesterType;
    startDate: string;
    endDate: string;
    isActive?: boolean;
}

/**
 * Payload untuk memperbarui tanggal Semester.
 */
export interface UpdateSemesterPayload {
    startDate?: string;
    endDate?: string;
}

/**
 * Tipe data relasi (Join) ringan.
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
 * Payload saat membuat kelas BARU.
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
 * Payload saat MENGUBAH (Update) kelas.
 * schoolId tidak boleh diubah melalui payload update.
 */
export type UpdateClassPayload = Partial<Omit<CreateClassPayload, 'schoolId'>>;

/**
 * Hasil penghapusan massal kelas.
 */
export interface BulkDeleteClassesResult {
    deletedCount: number;
    skippedCount: number;
    skippedNames: string[];
}