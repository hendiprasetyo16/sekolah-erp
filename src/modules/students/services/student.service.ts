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

const handleDbError = (error: unknown) => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan pada database';

  if (pgError?.code === '23505' || message.includes('unique constraint')) {
    if (message.includes('nisn_key')) {
      message = 'NISN tersebut sudah terdaftar di sistem. Silakan gunakan NISN lain.';
    } else if (message.includes('nis_key')) {
      message = 'NIS tersebut sudah digunakan oleh siswa lain.';
    } else if (message.includes('nik_key')) {
      message = 'NIK tersebut sudah digunakan oleh siswa lain.';
    } else {
      message = 'Data tersebut sudah terdaftar (Duplikat).';
    }
  }
  return new Error(message);
};

export const studentService = {
  async list(params: PaginatedParams & { 
    classId?: string; 
    status?: string;
    sortBy?: string; 
    sortOrder?: 'asc' | 'desc'; 
  }): Promise<ApiResponsePaginated<StudentListItem>> {
    
    const { 
      page = 1, 
      limit = 10, 
      search, 
      classId, 
      status, 
      sortBy = 'fullName', 
      sortOrder = 'asc' 
    } = params;
    
    let query = supabase.from('students').select('*, classes(name, gradeLevel)', { count: 'exact' });

    if (search) query = query.or(`fullName.ilike.%${search}%,nisn.ilike.%${search}%,nis.ilike.%${search}%`);
    if (classId) query = query.eq('classId', classId);
    if (status) query = query.eq('status', status);

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    // PENANGANAN KHUSUS SORTING KELAS:
    // Karena 'className' adalah properti hasil gabungan (join), 
    // jika user mengurutkan berdasarkan kelas, kita arahkan ke kolom 'fullName' atau default dulu 
    // agar tidak error di Supabase, atau biarkan kolom database yang valid.
    let safeSortBy = sortBy;
    if (sortBy === 'className') {
      safeSortBy = 'fullName'; // Sementara di-fallback ke fullName agar tidak error query
    }

    const { data, count, error } = await query
      .order(safeSortBy, { ascending: sortOrder === 'asc' })
      .range(from, to);
      
    if (error) throw new Error(error.message);

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
        birthPlace: item.birthPlace as string,
        birthDate: item.birthDate as string,
        religion: item.religion as string | undefined,
        address: item.address as string,
      };
    });

    const totalPages = Math.ceil((count || 0) / limit);
    return {
      success: true,
      data: { data: mappedData, meta: { total: count || 0, page, limit, totalPages, hasNext: page < totalPages, hasPrev: page > 1 } },
      message: 'Berhasil mengambil data siswa'
    };
  },

  async getById(id: string): Promise<ApiResponse<StudentDetail>> {
    const { data: studentData, error } = await supabase.from('students').select('*, classes(name, gradeLevel)').eq('id', id).single();
    if (error) throw new Error(error.message);

    const cls = studentData.classes as { name?: string; gradeLevel?: number } | null;
    const { data: parentsData } = await supabase.from('student_parents').select('*').eq('studentId', id);
    const { data: economicData } = await supabase.from('student_economics').select('*').eq('studentId', id).maybeSingle();

    const mappedData: StudentDetail = {
      ...studentData,
      className: cls?.name || '-',
      gradeLevel: cls?.gradeLevel || 0,
      parents: parentsData || [],
      economic: economicData || undefined,
    } as StudentDetail;

    return { success: true, data: mappedData, message: 'Berhasil mengambil detail siswa' };
  },

  async create(payload: CreateStudentPayload & { schoolId: string; economic?: Omit<StudentEconomic, 'id' | 'studentId'> }): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...studentData } = payload;
    const { data, error } = await supabase.from('students').insert(studentData).select().single();
    if (error) throw handleDbError(error);

    if (parents && parents.length > 0) {
      const parentsData = parents.map(p => ({ ...p, studentId: data.id }));
      const { error: parentError } = await supabase.from('student_parents').insert(parentsData);
      if (parentError) throw handleDbError(parentError);
    }

    if (economic) await supabase.from('student_economics').insert({ ...economic, studentId: data.id });
    return this.getById(data.id);
  },

  async update(id: string, payload: UpdateStudentPayload & { economic?: Omit<StudentEconomic, 'id' | 'studentId'> }): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...studentData } = payload;
    if (Object.keys(studentData).length > 0) {
      const { error } = await supabase.from('students').update(studentData).eq('id', id);
      if (error) throw handleDbError(error);
    }

    if (parents && parents.length > 0) {
      await supabase.from('student_parents').delete().eq('studentId', id);
      const parentsData = parents.map(p => ({ ...p, studentId: id }));
      const { error: parentError } = await supabase.from('student_parents').insert(parentsData);
      if (parentError) throw handleDbError(parentError);
    }

    if (economic) await supabase.from('student_economics').upsert({ ...economic, studentId: id });
    return this.getById(id);
  },

  async delete(id: string): Promise<ApiResponse<void>> {
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return { success: true, data: undefined, message: 'Siswa berhasil dihapus' };
  },

  async importExcel(_file: File): Promise<ApiResponse<{ imported: number; skipped: number; errors: string[] }>> {
    throw new Error('Not implemented');
  },
  async exportData(_format: 'excel' | 'pdf', _params?: PaginatedParams): Promise<Blob> {
    throw new Error('Not implemented');
  },

  async exportAll(): Promise<ApiResponse<StudentDetail[]>> {
    const { data, error } = await supabase.from('students').select('*, classes(name, gradeLevel)').order('fullName', { ascending: true });
    if (error) throw new Error(error.message);

    const mappedData = data.map((item: any) => ({
      ...item, className: item.classes?.name || '-', gradeLevel: item.classes?.gradeLevel || 0,
    })) as StudentDetail[];
    return { success: true, data: mappedData, message: 'Berhasil mengambil semua data siswa' };
  },

  async deleteAll(schoolId: string): Promise<ApiResponse<void>> {
    if (!schoolId) throw new Error("School ID tidak valid");
    const { error } = await supabase.from('students').delete().eq('schoolId', schoolId);
    if (error) {
      if (error.message.includes('student_bills')) throw new Error('Tidak bisa dihapus karena ada riwayat Tagihan/Pembayaran.');
      throw new Error(`Gagal menghapus: ${error.message}`);
    }
    return { success: true, data: undefined, message: 'Seluruh data siswa dikosongkan' };
  },

  // PERBAIKAN: Menambahkan Error Handling untuk Parents & Economics di proses Bulk Import
  async bulkImport(payload: any[]): Promise<ApiResponse<{ count: number }>> {
    if (!payload || payload.length === 0) throw new Error('Payload kosong.');
    
    const BATCH_SIZE = 100; 
    let totalSuccess = 0;

    for (let i = 0; i < payload.length; i += BATCH_SIZE) {
      const batch = payload.slice(i, i + BATCH_SIZE);
      
      const studentsToUpsert = batch.map(item => {
        const { id, parents, economic, rawClassName, ...studentData } = item;
        return studentData; 
      });

      const { data: upsertedStudents, error: studentError } = await supabase
        .from('students')
        .upsert(studentsToUpsert, { onConflict: 'schoolId,nisn' })
        .select('id, nisn');

      if (studentError) {
        console.error('Gagal upsert batch siswa:', studentError.message);
        throw new Error(`Gagal menyimpan data siswa: ${studentError.message}`);
      }

      const studentIdMap = new Map();
      upsertedStudents?.forEach(s => studentIdMap.set(s.nisn, s.id));

      const parentsToInsert: any[] = [];
      const economicsToUpsert: any[] = [];

      batch.forEach(item => {
        const studentId = studentIdMap.get(item.nisn);
        if (studentId) {
          if (item.parents && item.parents.length > 0) {
            item.parents.forEach((p: any) => {
              const { id, ...rest } = p;
              parentsToInsert.push({ ...rest, studentId });
            });
          }
          if (item.economic) {
            const { id, ...rest } = item.economic;
            economicsToUpsert.push({ ...rest, studentId, schoolId: item.schoolId });
          }
        }
      });

      if (upsertedStudents && upsertedStudents.length > 0) {
         const studentIds = upsertedStudents.map(s => s.id);
         
         // 1. Proses Data Orang Tua
         await supabase.from('student_parents').delete().in('studentId', studentIds);
         if (parentsToInsert.length > 0) {
           const { error: parentError } = await supabase.from('student_parents').insert(parentsToInsert);
           if (parentError) {
             console.error('Gagal insert parents:', parentError);
             throw new Error(`Gagal menyimpan data Orang Tua: ${parentError.message}`);
           }
         }
         
         // 2. Proses Data Kesejahteraan/Ekonomi
         if (economicsToUpsert.length > 0) {
           const { error: ecoError } = await supabase.from('student_economics').upsert(economicsToUpsert, { onConflict: 'studentId' });
           if (ecoError) {
             console.error('Gagal upsert economics:', ecoError);
             throw new Error(`Gagal menyimpan data Kesejahteraan: ${ecoError.message}`);
           }
         }
      }
      totalSuccess += batch.length;
    }

    return {
      success: true,
      data: { count: totalSuccess },
      message: `${totalSuccess} siswa berhasil diimpor`
    };
  }
};