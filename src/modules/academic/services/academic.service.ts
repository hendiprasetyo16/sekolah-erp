import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiResponse } from '@/services/api.types';
import type { AcademicYear, ClassItem, CreateClassPayload, UpdateClassPayload } from '../types/academic.types';

const handleDbError = (error: unknown) => {
    const pgError = error as PostgrestError;
    return new Error(pgError?.message || 'Terjadi kesalahan pada database');
};

export const academicService = {
    // --- TAHUN AJARAN ---
    async getAcademicYears(schoolId: string): Promise<ApiResponse<AcademicYear[]>> {
        const { data, error } = await supabase
            .from('academic_years')
            .select('*')
            .eq('schoolId', schoolId)
            .order('startYear', { ascending: false });

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: data as AcademicYear[],
            message: 'Berhasil mengambil data tahun ajaran'
        };
    },

    // FUNGSI BARU: Hapus Tahun Ajaran
    async deleteAcademicYear(id: string): Promise<ApiResponse<void>> {
        // Cek keamanan: Jangan izinkan hapus jika sudah ada kelas di tahun ajaran ini
        const { count } = await supabase
            .from('classes')
            .select('*', { count: 'exact', head: true })
            .eq('academicYearId', id);

        if (count && count > 0) {
            throw new Error('Tidak dapat menghapus tahun ajaran karena sudah ada kelas yang menggunakannya.');
        }

        const { error } = await supabase
            .from('academic_years')
            .delete()
            .eq('id', id);

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: undefined,
            message: 'Tahun ajaran berhasil dihapus'
        };
    },

    // --- KELAS ---
    async getClasses(schoolId: string, academicYearId?: string): Promise<ApiResponse<ClassItem[]>> {
        let query = supabase
            .from('classes')
            .select(`
        *,
        academic_years (name, isActive),
        teachers (fullName)
      `)
            .eq('schoolId', schoolId);

        if (academicYearId) {
            query = query.eq('academicYearId', academicYearId);
        }

        const { data, error } = await query.order('gradeLevel', { ascending: true }).order('name', { ascending: true });

        if (error) throw handleDbError(error);

        // Menghitung jumlah siswa per kelas secara paralel (Strict Type)
        const classes = data as unknown as ClassItem[];
        const classesWithCount = await Promise.all(
            classes.map(async (cls) => {
                const { count } = await supabase
                    .from('students')
                    .select('*', { count: 'exact', head: true })
                    .eq('classId', cls.id)
                    .eq('status', 'AKTIF');

                return { ...cls, studentCount: count || 0 };
            })
        );

        return {
            success: true,
            data: classesWithCount,
            message: 'Berhasil mengambil data kelas'
        };
    },

    async getClassById(id: string): Promise<ApiResponse<ClassItem>> {
        const { data, error } = await supabase
            .from('classes')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: data as ClassItem,
            message: 'Berhasil mengambil detail kelas'
        };
    },

    async createClass(payload: CreateClassPayload): Promise<ApiResponse<ClassItem>> {
        const { data, error } = await supabase
            .from('classes')
            .insert(payload)
            .select()
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: data as ClassItem,
            message: 'Kelas berhasil dibuat'
        };
    },

    async updateClass(id: string, payload: UpdateClassPayload): Promise<ApiResponse<ClassItem>> {
        const { data, error } = await supabase
            .from('classes')
            .update(payload)
            .eq('id', id)
            .select()
            .single();

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: data as ClassItem,
            message: 'Kelas berhasil diperbarui'
        };
    },

    async deleteClass(id: string): Promise<ApiResponse<void>> {
        // Cek apakah kelas masih memiliki siswa aktif
        const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .eq('classId', id);

        if (count && count > 0) {
            throw new Error('Tidak dapat menghapus kelas karena masih ada siswa yang terdaftar di dalamnya.');
        }

        const { error } = await supabase
            .from('classes')
            .delete()
            .eq('id', id);

        if (error) throw handleDbError(error);

        return {
            success: true,
            data: undefined,
            message: 'Kelas berhasil dihapus'
        };
    }
};