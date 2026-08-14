import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiResponse, ApiResponsePaginated, PaginatedParams } from '@/services/api.types';
import type {
  StudentListItem,
  StudentDetail,
  CreateStudentPayload,
  UpdateStudentPayload,
  StudentEconomic,
  StudentStatus
} from '../types/student.types';

// FUNGSI BARU: Penerjemah Error Database ke Bahasa Manusia (STRICT TYPE)
const handleDbError = (error: unknown) => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan pada database';

  // Deteksi error duplikat (Kode PostgreSQL 23505)
  if (pgError?.code === '23505' || message.includes('unique constraint')) {
    if (message.includes('nisn_key')) {
      message = 'NISN tersebut sudah terdaftar di sistem. Silakan gunakan NISN lain.';
    } else if (message.includes('nis_key')) {
      message = 'NIS tersebut sudah digunakan oleh siswa lain.';
    } else {
      message = 'Data tersebut sudah terdaftar (Duplikat).';
    }
  }
  return new Error(message);
};

export const studentService = {
  async list(params: PaginatedParams & { classId?: string; status?: string }): Promise<ApiResponsePaginated<StudentListItem>> {
    const { page = 1, limit = 10, search, classId, status } = params;

    let query = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)', { count: 'exact' });

    if (search) {
      query = query.or(`fullName.ilike.%${search}%,nisn.ilike.%${search}%,nis.ilike.%${search}%`);
    }
    if (classId) {
      query = query.eq('classId', classId);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await query
      .order('fullName', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    // Menggunakan tipe data tegas (Record<string, unknown>) alih-alih 'any'
    const mappedData: StudentListItem[] = (data || []).map((item: Record<string, unknown>) => {
      const cls = item.classes as { name?: string; gradeLevel?: number } | null;
      return {
        id: item.id as string,
        nis: (item.nis as string) || '-',
        nisn: item.nisn as string,
        nik: item.nik as string,
        fullName: item.fullName as string,
        gender: item.gender as 'L' | 'P',
        className: cls?.name || '-',
        classId: item.classId as string,
        gradeLevel: cls?.gradeLevel || 0,
        status: item.status as StudentStatus,
        phone: item.phone as string | undefined,
        entryDate: item.entryDate as string,
      };
    });

    const totalPages = Math.ceil((count || 0) / limit);
    return {
      success: true,
      data: {
        data: mappedData,
        meta: {
          total: count || 0,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1
        }
      },
      message: 'Berhasil mengambil data siswa'
    };
  },

  async getById(id: string): Promise<ApiResponse<StudentDetail>> {
    // 1. Ambil data utama siswa dan kelasnya
    const { data: studentData, error } = await supabase
      .from('students')
      .select('*, classes(name, gradeLevel)')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const cls = studentData.classes as { name?: string; gradeLevel?: number } | null;

    // 2. Ambil data orang tua dari tabel 'student_parents'
    const { data: parentsData } = await supabase
      .from('student_parents')
      .select('*')
      .eq('studentId', id);

    // 3. Ambil data ekonomi (PIP/KIP) dari tabel 'student_economics'
    const { data: economicData } = await supabase
      .from('student_economics')
      .select('*')
      .eq('studentId', id)
      .maybeSingle();

    const mappedData: StudentDetail = {
      ...studentData,
      className: cls?.name || '-',
      gradeLevel: cls?.gradeLevel || 0,
      parents: parentsData || [],
      economic: economicData || undefined,
    } as StudentDetail;

    return {
      success: true,
      data: mappedData,
      message: 'Berhasil mengambil detail siswa'
    };
  },

  async create(payload: CreateStudentPayload & { schoolId: string; economic?: Omit<StudentEconomic, 'id' | 'studentId'> }): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...studentData } = payload;

    // 1. Simpan data utama siswa
    const { data, error } = await supabase
      .from('students')
      .insert(studentData)
      .select()
      .single();

    if (error) throw handleDbError(error);

    // 2. Simpan data orang tua jika ada
    if (parents && parents.length > 0) {
      const parentsData = parents.map(p => ({ ...p, studentId: data.id }));
      const { error: parentError } = await supabase
        .from('student_parents')
        .insert(parentsData);

      if (parentError) throw handleDbError(parentError);
    }

    // 3. Simpan data ekonomi/PIP jika ada
    if (economic) {
      await supabase
        .from('student_economics')
        .insert({ ...economic, studentId: data.id });
    }

    return this.getById(data.id);
  },

  async update(id: string, payload: UpdateStudentPayload & { economic?: Omit<StudentEconomic, 'id' | 'studentId'> }): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...studentData } = payload;

    if (Object.keys(studentData).length > 0) {
      const { error } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', id);

      if (error) throw handleDbError(error);
    }

    // Perbarui data orang tua
    if (parents && parents.length > 0) {
      await supabase.from('student_parents').delete().eq('studentId', id);
      const parentsData = parents.map(p => ({ ...p, studentId: id }));
      await supabase.from('student_parents').insert(parentsData);
    }

    // Perbarui data ekonomi
    if (economic) {
      await supabase.from('student_economics').upsert({ ...economic, studentId: id });
    }

    return this.getById(id);
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    const { error } = await supabase
      .from('students')
      .delete()
      .eq('id', id);

    if (error) throw new Error(error.message);

    return {
      success: true,
      data: undefined,
      message: 'Siswa berhasil dihapus'
    };
  },

  async importExcel(_file: File): Promise<ApiResponse<{ imported: number; skipped: number; errors: string[] }>> {
    throw new Error('Not implemented for direct Supabase client yet');
  },

  async exportData(_format: 'excel' | 'pdf', _params?: PaginatedParams): Promise<Blob> {
    throw new Error('Not implemented for direct Supabase client yet');
  },
};