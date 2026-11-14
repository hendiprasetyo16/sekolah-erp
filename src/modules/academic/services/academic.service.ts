import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiResponse } from '@/services/api.types';

import type {
    AcademicYear,
    CreateAcademicYearPayload,
    Semester,
    CreateSemesterPayload,
    UpdateSemesterPayload,
    BulkDeleteClassesResult,
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
    academic_years: AcademicYearRelation | AcademicYearRelation[] | null;
    teachers: TeacherRelation | TeacherRelation[] | null;
    students?: StudentRelation[] | null;
}

// ======================================================
// ERROR HANDLING & VALIDATORS
// ======================================================

const handleDbError = (error: unknown): Error => {
    const pgError = error as Partial<PostgrestError> | null;
    const rawMessage =
        error instanceof Error
            ? error.message
            : pgError?.message || 'Terjadi kesalahan pada database.';

    if (pgError?.code === '23505' || rawMessage.includes('unique constraint')) {
        if (rawMessage.includes('academic_years_school_year_key')) {
            return new Error('Tahun ajaran tersebut sudah terdaftar di sekolah ini.');
        }
        if (rawMessage.includes('semesters_academic_year_type_key')) {
            return new Error('Semester (Ganjil/Genap) tersebut sudah ada pada tahun ajaran ini.');
        }
        if (rawMessage.includes('classes_school_year_name_key')) {
            return new Error('Nama kelas tersebut sudah digunakan pada tahun ajaran yang dipilih.');
        }
        return new Error('Data sudah terdaftar (duplikat).');
    }

    if (pgError?.code === '23503') {
        return new Error(
            'Data tidak dapat dihapus atau diubah karena masih terhubung dengan data lain (kelas, siswa, jadwal, atau tagihan).'
        );
    }

    if (pgError?.code === '23514') {
        if (rawMessage.includes('semesters_date_check')) {
            return new Error('Tanggal selesai semester harus lebih besar dari tanggal mulai.');
        }
        return new Error('Data tidak memenuhi aturan validasi database.');
    }

    if (pgError?.code === '42501') {
        return new Error('Anda tidak memiliki izin akses untuk melakukan operasi ini.');
    }

    return new Error(rawMessage);
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

const isValidGradeLevel = (gradeLevel: number): boolean =>
    Number.isInteger(gradeLevel) && gradeLevel >= 0 && gradeLevel <= 12;

const firstRelation = <T>(relation: T | T[] | null | undefined): T | null => {
    if (!relation) return null;
    return Array.isArray(relation) ? (relation[0] ?? null) : relation;
};

const toClassItem = (row: ClassQueryRow): ClassItem => {
    const activeStudentsCount =
        row.students?.filter((student) => student.status === 'AKTIF').length ?? 0;

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

    async getAcademicYears(schoolId: string): Promise<ApiResponse<AcademicYear[]>> {
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

    async createAcademicYear(
        payload: CreateAcademicYearPayload
    ): Promise<ApiResponse<AcademicYear>> {
        requireSchoolId(payload.schoolId);

        if (
            !Number.isInteger(payload.startYear) ||
            payload.startYear < 2000 ||
            payload.startYear > 2100
        ) {
            throw new Error('Tahun mulai harus berupa angka tahun yang valid (2000 - 2100).');
        }

        const endYear = payload.startYear + 1;
        const name = `${payload.startYear}/${endYear}`;

        // Cek apakah sudah ada tahun ajaran aktif di sekolah ini
        const { data: activeYears, error: checkActiveErr } = await supabase
            .from('academic_years')
            .select('id')
            .eq('schoolId', payload.schoolId)
            .eq('isActive', true)
            .limit(1);

        if (checkActiveErr) throw handleDbError(checkActiveErr);

        const shouldAutoActivate = (activeYears?.length ?? 0) === 0;
        const newYearId = crypto.randomUUID();

        const { data: createdYear, error: insertErr } = await supabase
            .from('academic_years')
            .insert({
                id: newYearId,
                schoolId: payload.schoolId,
                name,
                startYear: payload.startYear,
                endYear,
                isActive: shouldAutoActivate,
            })
            .select('*')
            .single();

        if (insertErr) throw handleDbError(insertErr);

        // Opsional: otomatis buat Semester Ganjil & Genap bawaan kalender pendidikan Indonesia
        if (payload.autoCreateSemesters) {
            const { error: semErr } = await supabase.from('semesters').insert([
                {
                    id: crypto.randomUUID(),
                    schoolId: payload.schoolId,
                    academicYearId: newYearId,
                    type: 'GANJIL',
                    startDate: `${payload.startYear}-07-01`,
                    endDate: `${payload.startYear}-12-31`,
                    isActive: shouldAutoActivate,
                },
                {
                    id: crypto.randomUUID(),
                    schoolId: payload.schoolId,
                    academicYearId: newYearId,
                    type: 'GENAP',
                    startDate: `${endYear}-01-01`,
                    endDate: `${endYear}-06-30`,
                    isActive: false,
                },
            ]);

            if (semErr) {
                await supabase.from('academic_years').delete().eq('id', newYearId);
                throw handleDbError(semErr);
            }
        }

        return {
            success: true,
            data: createdYear as AcademicYear,
            message: `Tahun ajaran ${name} berhasil dibuat.`,
        };
    },

    async setActiveAcademicYear(
        schoolId: string,
        id: string
    ): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID tahun ajaran');

        const { data: targetYear, error: findError } = await supabase
            .from('academic_years')
            .select('id, isActive')
            .eq('schoolId', schoolId)
            .eq('id', id)
            .maybeSingle();

        if (findError) throw handleDbError(findError);
        if (!targetYear) {
            throw new Error('Tahun ajaran tidak ditemukan pada sekolah ini.');
        }

        const { data: currentActive } = await supabase
            .from('academic_years')
            .select('id')
            .eq('schoolId', schoolId)
            .eq('isActive', true)
            .maybeSingle();

        const { error: offError } = await supabase
            .from('academic_years')
            .update({ isActive: false })
            .eq('schoolId', schoolId)
            .eq('isActive', true);

        if (offError) throw handleDbError(offError);

        const { error: onError } = await supabase
            .from('academic_years')
            .update({ isActive: true })
            .eq('schoolId', schoolId)
            .eq('id', id);

        if (onError) {
            if (currentActive?.id) {
                await supabase
                    .from('academic_years')
                    .update({ isActive: true })
                    .eq('schoolId', schoolId)
                    .eq('id', currentActive.id);
            }
            throw handleDbError(onError);
        }

        return {
            success: true,
            data: undefined,
            message: 'Tahun ajaran aktif berhasil diperbarui.',
        };
    },

    async deleteAcademicYear(
        schoolId: string,
        id: string
    ): Promise<ApiResponse<void>> {
        return this.deleteBulkAcademicYears(schoolId, [id]);
    },

    async deleteBulkAcademicYears(
        schoolId: string,
        ids: string[]
    ): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireIds(ids, 'tahun ajaran');

        const uniqueIds = [...new Set(ids)];

        const { data: existingYears, error: checkYearsError } = await supabase
            .from('academic_years')
            .select('id, isActive')
            .eq('schoolId', schoolId)
            .in('id', uniqueIds);

        if (checkYearsError) throw handleDbError(checkYearsError);

        if ((existingYears?.length ?? 0) !== uniqueIds.length) {
            throw new Error('Sebagian tahun ajaran tidak ditemukan atau bukan milik sekolah ini.');
        }

        if (existingYears?.some((ay) => ay.isActive)) {
            throw new Error('Tahun ajaran yang sedang aktif tidak dapat dihapus.');
        }

        const { data: classes, error: checkClassesError } = await supabase
            .from('classes')
            .select('id')
            .eq('schoolId', schoolId)
            .in('academicYearId', uniqueIds)
            .limit(1);

        if (checkClassesError) throw handleDbError(checkClassesError);

        if (classes && classes.length > 0) {
            throw new Error('Tahun ajaran terpilih tidak dapat dihapus karena masih digunakan oleh kelas.');
        }

        // Hapus semester terkait terlebih dahulu (karena relasi FK semesters -> academic_years ON DELETE RESTRICT)
        const { error: delSemError } = await supabase
            .from('semesters')
            .delete()
            .eq('schoolId', schoolId)
            .in('academicYearId', uniqueIds);

        if (delSemError) throw handleDbError(delSemError);

        const { data, error } = await supabase
            .from('academic_years')
            .delete()
            .eq('schoolId', schoolId)
            .in('id', uniqueIds)
            .select('id');

        if (error) throw handleDbError(error);

        if ((data?.length ?? 0) !== uniqueIds.length) {
            throw new Error('Tidak semua tahun ajaran berhasil dihapus.');
        }

        return {
            success: true,
            data: undefined,
            message: 'Tahun ajaran terpilih berhasil dihapus.',
        };
    },

    // ==================================================
    // SEMESTER
    // ==================================================

    async getSemesters(
        schoolId: string,
        academicYearId?: string
    ): Promise<ApiResponse<Semester[]>> {
        requireSchoolId(schoolId);

        let query = supabase
            .from('semesters')
            .select('*')
            .eq('schoolId', schoolId);

        if (academicYearId) {
            query = query.eq('academicYearId', academicYearId);
        }

        const { data, error } = await query.order('startDate', { ascending: true });

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: (data ?? []) as Semester[],
            message: 'Berhasil mengambil data semester.',
        };
    },

    async createSemester(payload: CreateSemesterPayload): Promise<ApiResponse<Semester>> {
        requireSchoolId(payload.schoolId);
        requireId(payload.academicYearId, 'ID tahun ajaran');

        if (!payload.startDate || !payload.endDate) {
            throw new Error('Tanggal mulai dan tanggal selesai semester wajib diisi.');
        }

        if (payload.endDate <= payload.startDate) {
            throw new Error('Tanggal selesai semester harus setelah tanggal mulai.');
        }

        if (payload.isActive) {
            const { error: offError } = await supabase
                .from('semesters')
                .update({ isActive: false })
                .eq('schoolId', payload.schoolId)
                .eq('isActive', true);

            if (offError) throw handleDbError(offError);
        }

        const { data, error } = await supabase
            .from('semesters')
            .insert({
                id: crypto.randomUUID(),
                schoolId: payload.schoolId,
                academicYearId: payload.academicYearId,
                type: payload.type,
                startDate: payload.startDate,
                endDate: payload.endDate,
                isActive: Boolean(payload.isActive),
            })
            .select('*')
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: data as Semester,
            message: `Semester ${payload.type} berhasil ditambahkan.`,
        };
    },

    async updateSemester(
        schoolId: string,
        id: string,
        payload: UpdateSemesterPayload
    ): Promise<ApiResponse<Semester>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID semester');

        if (payload.startDate && payload.endDate && payload.endDate <= payload.startDate) {
            throw new Error('Tanggal selesai semester harus setelah tanggal mulai.');
        }

        const { data, error } = await supabase
            .from('semesters')
            .update(payload)
            .eq('schoolId', schoolId)
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: data as Semester,
            message: 'Periode semester berhasil diperbarui.',
        };
    },

    async setActiveSemester(schoolId: string, id: string): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID semester');

        const { data: targetSemester, error: findError } = await supabase
            .from('semesters')
            .select('id, academicYearId')
            .eq('schoolId', schoolId)
            .eq('id', id)
            .maybeSingle();

        if (findError) throw handleDbError(findError);
        if (!targetSemester) {
            throw new Error('Semester tidak ditemukan pada sekolah ini.');
        }

        // Pastikan tahun ajaran induknya juga aktif
        await this.setActiveAcademicYear(schoolId, targetSemester.academicYearId);

        const { error: offError } = await supabase
            .from('semesters')
            .update({ isActive: false })
            .eq('schoolId', schoolId)
            .eq('isActive', true);

        if (offError) throw handleDbError(offError);

        const { error: onError } = await supabase
            .from('semesters')
            .update({ isActive: true })
            .eq('schoolId', schoolId)
            .eq('id', id);

        if (onError) throw handleDbError(onError);

        return {
            success: true,
            data: undefined,
            message: 'Semester aktif berhasil diperbarui.',
        };
    },

    async deleteSemester(schoolId: string, id: string): Promise<ApiResponse<void>> {
        requireSchoolId(schoolId);
        requireId(id, 'ID semester');

        const { data: target, error: findErr } = await supabase
            .from('semesters')
            .select('id, isActive')
            .eq('schoolId', schoolId)
            .eq('id', id)
            .maybeSingle();

        if (findErr) throw handleDbError(findErr);
        if (!target) throw new Error('Semester tidak ditemukan.');
        if (target.isActive) {
            throw new Error('Semester yang sedang aktif tidak dapat dihapus.');
        }

        const { error } = await supabase
            .from('semesters')
            .delete()
            .eq('schoolId', schoolId)
            .eq('id', id);

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: undefined,
            message: 'Semester berhasil dihapus.',
        };
    },

    // ==================================================
    // KELAS
    // ==================================================

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

    async getClassById(schoolId: string, id: string): Promise<ApiResponse<ClassItem>> {
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
            .maybeSingle();

        if (error) throw handleDbError(error);

        if (!data) {
            throw new Error('Kelas tidak ditemukan atau Anda tidak memiliki akses.');
        }

        return {
            success: true,
            data: toClassItem(data as unknown as ClassQueryRow),
            message: 'Berhasil mengambil detail kelas.',
        };
    },

    async createClass(payload: CreateClassPayload): Promise<ApiResponse<ClassItem>> {
        requireSchoolId(payload.schoolId);
        requireId(payload.academicYearId, 'ID tahun ajaran');

        if (!payload.name?.trim()) {
            throw new Error('Nama kelas wajib diisi.');
        }

        if (!isValidGradeLevel(payload.gradeLevel)) {
            throw new Error('Tingkat kelas harus antara 0 (TK/PAUD) hingga 12.');
        }

        if (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 500) {
            throw new Error('Kapasitas kelas harus antara 1 hingga 500 siswa.');
        }

        const { data: academicYear, error: yearError } = await supabase
            .from('academic_years')
            .select('id')
            .eq('schoolId', payload.schoolId)
            .eq('id', payload.academicYearId)
            .maybeSingle();

        if (yearError) throw handleDbError(yearError);
        if (!academicYear) {
            throw new Error('Tahun ajaran tidak ditemukan atau bukan milik sekolah ini.');
        }

        if (payload.homeroomTeacherId) {
            const { data: teacher, error: teacherError } = await supabase
                .from('teachers')
                .select('id')
                .eq('schoolId', payload.schoolId)
                .eq('id', payload.homeroomTeacherId)
                .maybeSingle();

            if (teacherError) throw handleDbError(teacherError);
            if (!teacher) {
                throw new Error('Wali kelas tidak ditemukan atau bukan milik sekolah ini.');
            }
        }

        const { data, error } = await supabase
            .from('classes')
            .insert({
                schoolId: payload.schoolId,
                academicYearId: payload.academicYearId,
                name: payload.name.trim(),
                gradeLevel: payload.gradeLevel,
                major: payload.major?.trim() || null,
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

        if (payload.name !== undefined && !payload.name.trim()) {
            throw new Error('Nama kelas tidak boleh kosong.');
        }

        if (payload.gradeLevel !== undefined && !isValidGradeLevel(payload.gradeLevel)) {
            throw new Error('Tingkat kelas harus antara 0 (TK/PAUD) hingga 12.');
        }

        if (
            payload.capacity !== undefined &&
            (!Number.isInteger(payload.capacity) || payload.capacity < 1 || payload.capacity > 500)
        ) {
            throw new Error('Kapasitas kelas harus antara 1 hingga 500 siswa.');
        }

        if (payload.academicYearId !== undefined) {
            requireId(payload.academicYearId, 'ID tahun ajaran');

            const { data: academicYear, error: yearError } = await supabase
                .from('academic_years')
                .select('id')
                .eq('schoolId', schoolId)
                .eq('id', payload.academicYearId)
                .maybeSingle();

            if (yearError) throw handleDbError(yearError);
            if (!academicYear) {
                throw new Error('Tahun ajaran tidak ditemukan atau bukan milik sekolah ini.');
            }
        }

        if (payload.homeroomTeacherId) {
            const { data: teacher, error: teacherError } = await supabase
                .from('teachers')
                .select('id')
                .eq('schoolId', schoolId)
                .eq('id', payload.homeroomTeacherId)
                .maybeSingle();

            if (teacherError) throw handleDbError(teacherError);
            if (!teacher) {
                throw new Error('Wali kelas tidak ditemukan atau bukan milik sekolah ini.');
            }
        }

        const updatePayload: UpdateClassPayload = {
            ...payload,
            ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
            ...(payload.major !== undefined ? { major: payload.major?.trim() || null } : {}),
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

    async deleteClass(schoolId: string, id: string): Promise<ApiResponse<void>> {
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
            throw new Error('Kelas tidak ditemukan atau bukan milik sekolah ini.');
        }

        const { data: students, error: checkError } = await supabase
            .from('students')
            .select('id')
            .eq('schoolId', schoolId)
            .eq('classId', id)
            .limit(1);

        if (checkError) throw handleDbError(checkError);
        if (students && students.length > 0) {
            throw new Error('Kelas tidak dapat dihapus karena masih memiliki siswa terdaftar.');
        }

        const { data, error } = await supabase
            .from('classes')
            .delete()
            .eq('schoolId', schoolId)
            .eq('id', id)
            .select('id');

        if (error) throw handleDbError(error);
        if (!data || data.length === 0) {
            throw new Error('Kelas tidak berhasil dihapus. Periksa izin database.');
        }

        return {
            success: true,
            data: undefined,
            message: 'Kelas berhasil dihapus.',
        };
    },

    async deleteBulkClasses(
        schoolId: string,
        ids: string[]
    ): Promise<ApiResponse<BulkDeleteClassesResult>> {
        requireSchoolId(schoolId);
        requireIds(ids, 'kelas');

        const uniqueIds = [...new Set(ids)];

        const { data: existingClasses, error: classError } = await supabase
            .from('classes')
            .select('id, name')
            .eq('schoolId', schoolId)
            .in('id', uniqueIds);

        if (classError) throw handleDbError(classError);

        if ((existingClasses?.length ?? 0) !== uniqueIds.length) {
            throw new Error('Sebagian kelas tidak ditemukan atau bukan milik sekolah ini.');
        }

        const { data: enrolledRows, error: checkError } = await supabase
            .from('students')
            .select('classId')
            .eq('schoolId', schoolId)
            .in('classId', uniqueIds);

        if (checkError) throw handleDbError(checkError);

        const occupiedClassIds = new Set(
            (enrolledRows ?? [])
                .map((row) => row.classId)
                .filter((cid): cid is string => Boolean(cid))
        );

        const deletableClasses = (existingClasses ?? []).filter(
            (cls) => !occupiedClassIds.has(cls.id)
        );
        const skippedClasses = (existingClasses ?? []).filter((cls) =>
            occupiedClassIds.has(cls.id)
        );

        if (deletableClasses.length === 0) {
            throw new Error(
                'Semua kelas yang dipilih masih memiliki siswa terdaftar sehingga tidak dapat dihapus.'
            );
        }

        const deletableIds = deletableClasses.map((cls) => cls.id);

        const { data, error } = await supabase
            .from('classes')
            .delete()
            .eq('schoolId', schoolId)
            .in('id', deletableIds)
            .select('id');

        if (error) throw handleDbError(error);

        const deletedCount = data?.length ?? 0;

        if (deletedCount === 0) {
            throw new Error('Tidak ada kelas yang berhasil dihapus. Periksa izin database.');
        }

        return {
            success: true,
            data: {
                deletedCount,
                skippedCount: skippedClasses.length,
                skippedNames: skippedClasses.map((cls) => cls.name),
            },
            message: `${deletedCount} kelas berhasil dihapus.`,
        };
    },
};