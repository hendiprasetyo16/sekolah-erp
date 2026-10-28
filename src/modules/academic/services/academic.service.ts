import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiResponse } from '@/services/api.types';
import type { AcademicYear, ClassItem, CreateClassPayload, UpdateClassPayload } from '../types/academic.types';

const handleDbError = (error: unknown) => {
    const pgError = error as PostgrestError;
    return new Error(pgError?.message || 'Terjadi kesalahan pada database');
};

export const academicService = {
    // ==========================================
    // TAHUN AJARAN
    // ==========================================
    async getAcademicYears(schoolId: string): Promise<ApiResponse<AcademicYear[]>> {
        // FILTER KETAT MULTI-TENANT
        if (!schoolId) throw new Error('School ID is required');

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

    async deleteAcademicYear(id: string): Promise<ApiResponse<void>> {
        // SAFETY CHECK DARI KODE LAMA ANDA
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

    // ==========================================
    // KELAS
    // ==========================================
    async getClasses(schoolId: string, academicYearId?: string): Promise<ApiResponse<ClassItem[]>> {
        // FILTER KETAT MULTI-TENANT
        if (!schoolId) throw new Error('School ID is required');

        // MENGGUNAKAN LOGIKA JOIN DARI KODE LAMA ANDA
        let query = supabase
            .from('classes')
            .select(`
                *,
                academic_years (id, name, isActive),
                teachers (id, fullName),
                students (id, status)
            `)
            .eq('schoolId', schoolId); // Mengunci query hanya untuk sekolah ini

        if (academicYearId) {
            query = query.eq('academicYearId', academicYearId);
        }

        const { data, error } = await query.order('gradeLevel', { ascending: true }).order('name', { ascending: true });

        if (error) throw handleDbError(error);

        // KALKULASI MEMORI DARI KODE LAMA ANDA
        const classesWithCount = data.map((cls: any) => {
            const activeStudentsCount = cls.students?.filter((s: any) => s.status === 'AKTIF').length || 0;
            const { students, ...rest } = cls; // Hapus array besar agar payload ringan

            return {
                ...rest,
                studentCount: activeStudentsCount
            };
        });

        return {
            success: true,
            data: classesWithCount as unknown as ClassItem[],
            message: 'Berhasil mengambil data kelas'
        };
    },

    async getClassById(schoolId: string, id: string): Promise<ApiResponse<ClassItem>> {
        // FILTER KETAT MULTI-TENANT
        if (!schoolId) throw new Error('School ID is required');

        const { data, error } = await supabase
            .from('classes')
            .select(`
                *,
                academic_years (id, name, isActive),
                teachers (id, fullName)
            `)
            .eq('schoolId', schoolId)
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
        if (!payload.schoolId) throw new Error('School ID is required');

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
        // SAFETY CHECK DARI KODE LAMA ANDA
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
    }, // <--- INI TANDA KOMA YANG SEBELUMNYA HILANG

    // ==========================================
    // BULK DELETE TAHUN AJARAN & KELAS
    // ==========================================
    async deleteBulkAcademicYears(ids: string[]): Promise<ApiResponse<void>> {
        // Cek apakah ada tahun ajaran yang sudah dipakai di tabel classes
        const { count } = await supabase
            .from('classes')
            .select('*', { count: 'exact', head: true })
            .in('academicYearId', ids);

        if (count && count > 0) {
            throw new Error('Beberapa tahun ajaran tidak dapat dihapus karena sedang digunakan oleh data kelas.');
        }

        const { error } = await supabase.from('academic_years').delete().in('id', ids);
        if (error) throw handleDbError(error);

        return { success: true, data: undefined, message: 'Tahun ajaran terpilih berhasil dihapus' };
    },

    async deleteBulkClasses(ids: string[]): Promise<ApiResponse<void>> {
        // Cek apakah ada kelas yang sudah memiliki siswa
        const { count } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true })
            .in('classId', ids);

        if (count && count > 0) {
            throw new Error('Beberapa kelas tidak dapat dihapus karena masih memiliki siswa yang terdaftar.');
        }

        const { error } = await supabase.from('classes').delete().in('id', ids);
        if (error) throw handleDbError(error);

        return { success: true, data: undefined, message: 'Kelas terpilih berhasil dihapus' };
    }
};