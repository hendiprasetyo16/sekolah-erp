import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiResponse } from '@/services/api.types';

import type {
    AcademicYear,
    ClassItem,
    CreateClassPayload,
    UpdateClassPayload,
    AcademicYearRelation,
    TeacherRelation,
    StudentRelation,
} from '../types/academic.types';

// ======================================================
// INTERNAL TYPES
// ======================================================

interface ClassQueryRow {
    id: string;
    schoolId: string;
    academicYearId: string;
    name: string;
    gradeLevel: number;
    major?: string | null;
    homeroomTeacherId?: string | null;
    capacity: number;

    academic_years:
        | AcademicYearRelation
        | AcademicYearRelation[]
        | null;

    teachers:
        | TeacherRelation
        | TeacherRelation[]
        | null;

    students?: StudentRelation[] | null;
}

interface ClassDeleteCheckRow {
    id: string;
    schoolId: string;
}

interface AcademicYearDeleteCheckRow {
    id: string;
    schoolId: string;
}

// ======================================================
// ERROR HANDLING
// ======================================================

const handleDbError = (error: unknown): Error => {
    if (error instanceof Error) {
        return error;
    }

    const pgError = error as Partial<PostgrestError> | null;

    return new Error(
        pgError?.message || 'Terjadi kesalahan pada database.'
    );
};

const requireSchoolId = (schoolId: string): void => {
    if (!schoolId?.trim()) {
        throw new Error('School ID wajib diisi.');
    }
};

const requireId = (id: string, label = 'ID'): void => {
    if (!id?.trim()) {
        throw new Error(`${label} wajib diisi.`);
    }
};

const requireIds = (ids: string[], label: string): void => {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error(`Pilih minimal satu ${label}.`);
    }

    if (ids.some((id) => !id?.trim())) {
        throw new Error(`Daftar ${label} mengandung ID yang tidak valid.`);
    }
};

/**
 * Relasi many-to-one biasanya berupa object.
 * Fungsi ini juga menangani array jika hasil relasi
 * dikembalikan sebagai array oleh tipe/query Supabase.
 */
const firstRelation = <T>(
    relation: T | T[] | null | undefined
): T | null => {
    if (!relation) return null;

    return Array.isArray(relation)
        ? relation[0] ?? null
        : relation;
};

const toClassItem = (row: ClassQueryRow): ClassItem => {
    const activeStudentsCount =
        row.students?.filter(
            (student) => student.status === 'AKTIF'
        ).length ?? 0;

    return {
        id: row.id,
        schoolId: row.schoolId,
        academicYearId: row.academicYearId,
        name: row.name,
        gradeLevel: row.gradeLevel,
        major: row.major ?? null,
        homeroomTeacherId: row.homeroomTeacherId ?? null,
        capacity: row.capacity,
        academic_years: firstRelation(row.academic_years),
        teachers: firstRelation(row.teachers),
        studentCount: activeStudentsCount,
    };
};

// ======================================================
// ACADEMIC SERVICE
// ======================================================

export const academicService = {
    // ==================================================
    // TAHUN AJARAN
    // ==================================================

    /**
     * Mengambil seluruh tahun ajaran milik satu sekolah.
     */
    async getAcademicYears(
        schoolId: string
    ): Promise<ApiResponse<AcademicYear[]>> {
        requireSchoolId(schoolId);

        const { data, error } = await supabase
            .from('academic_years')
            .select('*')
            .eq('schoolId', schoolId)
            .order('startYear', { ascending: false });

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: (data ?? []) as AcademicYear[],
            message: 'Berhasil mengambil data tahun ajaran.',
        };
    },

    /**
     * Menghapus satu tahun ajaran.
     * Tahun ajaran tidak dapat dihapus jika masih digunakan kelas.
     */
    async deleteAcademicYear(
        schoolId: string,
        id: string
    ): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID tahun ajaran');

        const { data: classes, error: checkError } = await supabase
            .from('classes')
            .select('id')
            .eq('schoolId', schoolId)
            .eq('academicYearId', id)
            .limit(1);

        if (checkError) throw handleDbError(checkError);

        if (classes && classes.length > 0) {
            throw new Error(
                'Tahun ajaran tidak dapat dihapus karena masih digunakan oleh kelas.'
            );
        }

        const { data, error } = await supabase
            .from('academic_years')
            .delete()
            .eq('schoolId', schoolId)
            .eq('id', id)
            .select('id');

        if (error) throw handleDbError(error);

        if (!data || data.length === 0) {
            throw new Error(
                'Tahun ajaran tidak ditemukan atau tidak memiliki izin untuk dihapus.'
            );
        }

        return {
            success: true,
            data: undefined,
            message: 'Tahun ajaran berhasil dihapus.',
        };
    },

    /**
     * Menghapus beberapa tahun ajaran sekaligus.
     * Seluruh data yang dipilih diperiksa sebelum penghapusan.
     */
    async deleteBulkAcademicYears(
        schoolId: string,
        ids: string[]
    ): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireIds(ids, 'tahun ajaran');

        const uniqueIds = [...new Set(ids)];

        const { data: classes, error: checkClassesError } =
            await supabase
                .from('classes')
                .select('id')
                .eq('schoolId', schoolId)
                .in('academicYearId', uniqueIds)
                .limit(1);

        if (checkClassesError) {
            throw handleDbError(checkClassesError);
        }

        if (classes && classes.length > 0) {
            throw new Error(
                'Tahun ajaran terpilih tidak dapat dihapus karena masih digunakan oleh kelas.'
            );
        }

        const { data: existingYears, error: checkYearsError } =
            await supabase
                .from('academic_years')
                .select('id')
                .eq('schoolId', schoolId)
                .in('id', uniqueIds);

        if (checkYearsError) {
            throw handleDbError(checkYearsError);
        }

        if ((existingYears?.length ?? 0) !== uniqueIds.length) {
            throw new Error(
                'Sebagian tahun ajaran tidak ditemukan atau bukan milik sekolah ini.'
            );
        }

        const { data, error } = await supabase
            .from('academic_years')
            .delete()
            .eq('schoolId', schoolId)
            .in('id', uniqueIds)
            .select('id');

        if (error) throw handleDbError(error);

        if ((data?.length ?? 0) !== uniqueIds.length) {
            throw new Error(
                'Tidak semua tahun ajaran berhasil dihapus. Periksa kembali izin dan kebijakan database.'
            );
        }

        return {
            success: true,
            data: undefined,
            message: 'Tahun ajaran terpilih berhasil dihapus.',
        };
    },

    // ==================================================
    // KELAS
    // ==================================================

    /**
     * Mengambil daftar kelas.
     * studentCount hanya menghitung siswa berstatus AKTIF.
     */
    async getClasses(
        schoolId: string,
        academicYearId?: string
    ): Promise<ApiResponse<ClassItem[]>> {
        requireSchoolId(schoolId);

        let query = supabase
            .from('classes')
            .select(`
                *,
                academic_years (
                    id,
                    name,
                    isActive
                ),
                teachers (
                    id,
                    fullName
                ),
                students (
                    id,
                    status
                )
            `)
            .eq('schoolId', schoolId);

        if (academicYearId) {
            query = query.eq('academicYearId', academicYearId);
        }

        const { data, error } = await query
            .order('gradeLevel', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw handleDbError(error);

        const rows = (data ?? []) as unknown as ClassQueryRow[];

        return {
            success: true,
            data: rows.map(toClassItem),
            message: 'Berhasil mengambil data kelas.',
        };
    },

    /**
     * Mengambil detail satu kelas berdasarkan sekolah dan ID kelas.
     */
    async getClassById(
        schoolId: string,
        id: string
    ): Promise<ApiResponse<ClassItem>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID kelas');

        const { data, error } = await supabase
            .from('classes')
            .select(`
                *,
                academic_years (
                    id,
                    name,
                    isActive
                ),
                teachers (
                    id,
                    fullName
                ),
                students (
                    id,
                    status
                )
            `)
            .eq('schoolId', schoolId)
            .eq('id', id)
            .single();

        if (error) throw handleDbError(error);

        const classItem = toClassItem(
            data as unknown as ClassQueryRow
        );

        return {
            success: true,
            data: classItem,
            message: 'Berhasil mengambil detail kelas.',
        };
    },

    /**
     * Membuat kelas baru.
     */
    async createClass(
        payload: CreateClassPayload
    ): Promise<ApiResponse<ClassItem>> {
        requireSchoolId(payload.schoolId);
        requireId(payload.academicYearId, 'ID tahun ajaran');

        if (!payload.name?.trim()) {
            throw new Error('Nama kelas wajib diisi.');
        }

        if (
            !Number.isInteger(payload.gradeLevel) ||
            payload.gradeLevel < 1
        ) {
            throw new Error('Tingkat kelas harus berupa bilangan bulat positif.');
        }

        if (
            !Number.isInteger(payload.capacity) ||
            payload.capacity < 1
        ) {
            throw new Error('Kapasitas kelas minimal 1 siswa.');
        }

        // Pastikan tahun ajaran milik sekolah yang sama.
        const { data: academicYear, error: yearError } = await supabase
            .from('academic_years')
            .select('id')
            .eq('schoolId', payload.schoolId)
            .eq('id', payload.academicYearId)
            .maybeSingle();

        if (yearError) throw handleDbError(yearError);

        if (!academicYear) {
            throw new Error(
                'Tahun ajaran tidak ditemukan atau bukan milik sekolah ini.'
            );
        }

        const { data, error } = await supabase
            .from('classes')
            .insert({
                schoolId: payload.schoolId,
                academicYearId: payload.academicYearId,
                name: payload.name.trim(),
                gradeLevel: payload.gradeLevel,
                major: payload.major ?? null,
                homeroomTeacherId: payload.homeroomTeacherId ?? null,
                capacity: payload.capacity,
            })
            .select(`
                *,
                academic_years (
                    id,
                    name,
                    isActive
                ),
                teachers (
                    id,
                    fullName
                ),
                students (
                    id,
                    status
                )
            `)
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: toClassItem(data as unknown as ClassQueryRow),
            message: 'Kelas berhasil dibuat.',
        };
    },

    /**
     * Memperbarui kelas berdasarkan sekolah dan ID kelas.
     * schoolId tidak dapat diganti lewat payload.
     */
    async updateClass(
        schoolId: string,
        id: string,
        payload: UpdateClassPayload
    ): Promise<ApiResponse<ClassItem>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID kelas');

        if (Object.keys(payload).length === 0) {
            throw new Error('Tidak ada data yang diperbarui.');
        }

        if (
            payload.name !== undefined &&
            !payload.name.trim()
        ) {
            throw new Error('Nama kelas tidak boleh kosong.');
        }

        if (
            payload.gradeLevel !== undefined &&
            (
                !Number.isInteger(payload.gradeLevel) ||
                payload.gradeLevel < 1
            )
        ) {
            throw new Error('Tingkat kelas harus berupa bilangan bulat positif.');
        }

        if (
            payload.capacity !== undefined &&
            (
                !Number.isInteger(payload.capacity) ||
                payload.capacity < 1
            )
        ) {
            throw new Error('Kapasitas kelas minimal 1 siswa.');
        }

        // Jika tahun ajaran diganti, validasi kepemilikannya.
        if (payload.academicYearId !== undefined) {
            requireId(payload.academicYearId, 'ID tahun ajaran');

            const { data: academicYear, error: yearError } =
                await supabase
                    .from('academic_years')
                    .select('id')
                    .eq('schoolId', schoolId)
                    .eq('id', payload.academicYearId)
                    .maybeSingle();

            if (yearError) throw handleDbError(yearError);

            if (!academicYear) {
                throw new Error(
                    'Tahun ajaran tidak ditemukan atau bukan milik sekolah ini.'
                );
            }
        }

        const updatePayload: UpdateClassPayload = {
            ...payload,
            ...(payload.name !== undefined
                ? { name: payload.name.trim() }
                : {}),
        };

        const { data, error } = await supabase
            .from('classes')
            .update(updatePayload)
            .eq('schoolId', schoolId)
            .eq('id', id)
            .select(`
                *,
                academic_years (
                    id,
                    name,
                    isActive
                ),
                teachers (
                    id,
                    fullName
                ),
                students (
                    id,
                    status
                )
            `)
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: toClassItem(data as unknown as ClassQueryRow),
            message: 'Kelas berhasil diperbarui.',
        };
    },

    /**
     * Menghapus satu kelas jika tidak memiliki siswa terdaftar.
     */
    async deleteClass(
        schoolId: string,
        id: string
    ): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID kelas');

        const { data: existingClass, error: classError } = await supabase
            .from('classes')
            .select('id')
            .eq('schoolId', schoolId)
            .eq('id', id)
            .maybeSingle();

        if (classError) throw handleDbError(classError);

        if (!existingClass) {
            throw new Error(
                'Kelas tidak ditemukan atau bukan milik sekolah ini.'
            );
        }

        const { data: students, error: checkError } = await supabase
            .from('students')
            .select('id')
            .eq('schoolId', schoolId)
            .eq('classId', id)
            .limit(1);

        if (checkError) throw handleDbError(checkError);

        if (students && students.length > 0) {
            throw new Error(
                'Kelas tidak dapat dihapus karena masih memiliki siswa terdaftar.'
            );
        }

        const { data, error } = await supabase
            .from('classes')
            .delete()
            .eq('schoolId', schoolId)
            .eq('id', id)
            .select('id');

        if (error) throw handleDbError(error);

        if (!data || data.length === 0) {
            throw new Error(
                'Kelas tidak berhasil dihapus. Periksa izin database.'
            );
        }

        return {
            success: true,
            data: undefined,
            message: 'Kelas berhasil dihapus.',
        };
    },

    // ==================================================
    // BULK DELETE KELAS
    // ==================================================

    /**
     * Menghapus beberapa kelas sekaligus.
     * Seluruh kelas diperiksa sebelum penghapusan.
     */
    async deleteBulkClasses(
        schoolId: string,
        ids: string[]
    ): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireIds(ids, 'kelas');

        const uniqueIds = [...new Set(ids)];

        const { data: existingClasses, error: classError } =
            await supabase
                .from('classes')
                .select('id')
                .eq('schoolId', schoolId)
                .in('id', uniqueIds);

        if (classError) throw handleDbError(classError);

        if ((existingClasses?.length ?? 0) !== uniqueIds.length) {
            throw new Error(
                'Sebagian kelas tidak ditemukan atau bukan milik sekolah ini.'
            );
        }

        const { data: students, error: checkError } = await supabase
            .from('students')
            .select('id')
            .eq('schoolId', schoolId)
            .in('classId', uniqueIds)
            .limit(1);

        if (checkError) throw handleDbError(checkError);

        if (students && students.length > 0) {
            throw new Error(
                'Kelas terpilih tidak dapat dihapus karena masih memiliki siswa terdaftar.'
            );
        }

        const { data, error } = await supabase
            .from('classes')
            .delete()
            .eq('schoolId', schoolId)
            .in('id', uniqueIds)
            .select('id');

        if (error) throw handleDbError(error);

        if ((data?.length ?? 0) !== uniqueIds.length) {
            throw new Error(
                'Tidak semua kelas berhasil dihapus. Periksa izin dan kebijakan database.'
            );
        }

        return {
            success: true,
            data: undefined,
            message: 'Kelas terpilih berhasil dihapus.',
        };
    },
};