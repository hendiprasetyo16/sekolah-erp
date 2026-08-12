import { supabase } from '@/lib/supabase';
import type { ApiResponse, ApiResponsePaginated, PaginatedParams } from '@/services/api.types';
import type { StudentListItem, StudentDetail, CreateStudentPayload, UpdateStudentPayload } from '../types/student.types';

// Student API service using Supabase directly
export const studentService = {
  async list(params: PaginatedParams & { classId?: string; status?: string }): Promise<ApiResponsePaginated<StudentListItem>> {
    const { page = 1, limit = 10, search, classId, status } = params;
    
    let query = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)', { count: 'exact' });

    if (search) {
      query = query.or(`fullName.ilike.%${search}%,nisn.ilike.%${search}%`);
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

    // Map to frontend interface
    const mappedData = data.map((item: any) => ({
      ...item,
      className: item.classes?.name || '-',
      gradeLevel: item.classes?.gradeLevel || 0
    })) as StudentListItem[];

    return {
      success: true,
      data: mappedData,
      meta: {
        total: count || 0,
        page,
        limit,
        totalPages: Math.ceil((count || 0) / limit)
      },
      message: 'Berhasil mengambil data siswa'
    };
  },

  async getById(id: string): Promise<ApiResponse<StudentDetail>> {
    const { data, error } = await supabase
      .from('students')
      .select('*, classes(name, gradeLevel)')
      .eq('id', id)
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // Fetch parents
    const { data: parents } = await supabase
      .from('student_parents')
      .select('*')
      .eq('studentId', id);

    const mappedData = {
      ...data,
      className: data.classes?.name || '-',
      gradeLevel: data.classes?.gradeLevel || 0,
      parents: parents || []
    } as StudentDetail;

    return {
      success: true,
      data: mappedData,
      message: 'Berhasil mengambil detail siswa'
    };
  },

  async create(payload: CreateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    const { parents, ...studentData } = payload;
    
    // Insert student
    const { data, error } = await supabase
      .from('students')
      .insert(studentData)
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Insert parents if any
    if (parents && parents.length > 0) {
      const parentsData = parents.map(p => ({ ...p, studentId: data.id }));
      const { error: parentError } = await supabase
        .from('student_parents')
        .insert(parentsData);
        
      if (parentError) throw new Error(parentError.message);
    }

    return this.getById(data.id);
  },

  async update(id: string, payload: UpdateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    const { parents, ...studentData } = payload;
    
    if (Object.keys(studentData).length > 0) {
      const { error } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', id);

      if (error) throw new Error(error.message);
    }

    // Handle parents update (simplified: delete existing and re-insert)
    if (parents && parents.length > 0) {
      await supabase.from('student_parents').delete().eq('studentId', id);
      const parentsData = parents.map(p => ({ ...p, studentId: id }));
      await supabase.from('student_parents').insert(parentsData);
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

  async importExcel(file: File): Promise<ApiResponse<{ imported: number; skipped: number; errors: string[] }>> {
    // Requires a server function or edge function to process excel
    throw new Error('Not implemented for direct Supabase client yet');
  },

  async exportData(format: 'excel' | 'pdf', params?: PaginatedParams): Promise<Blob> {
    throw new Error('Not implemented for direct Supabase client yet');
  },
};
