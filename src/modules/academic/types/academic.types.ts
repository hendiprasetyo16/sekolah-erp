export interface AcademicYear {
    id: string;
    schoolId: string;
    name: string;
    startYear: number;
    endYear: number;
    isActive: boolean;
    createdAt: string;
}

export interface ClassItem {
    id: string;
    schoolId: string;
    academicYearId: string;
    name: string;
    gradeLevel: number;
    major?: string | null;
    homeroomTeacherId?: string | null;
    capacity: number;

    // Relasi (Join)
    academic_years?: { name: string; isActive: boolean } | null;
    teachers?: { fullName: string } | null;

    // Agregasi (Dihitung secara manual di service jika dibutuhkan)
    studentCount?: number;
}

export interface CreateClassPayload {
    schoolId: string;
    academicYearId: string;
    name: string;
    gradeLevel: number;
    major?: string;
    homeroomTeacherId?: string;
    capacity: number;
}

export type UpdateClassPayload = Partial<CreateClassPayload>;