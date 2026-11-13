import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type { ApiResponse, ApiResponsePaginated, PaginatedParams } from '@/services/api.types';
import type {
  StudentListItem,
  StudentDetail,
  CreateStudentPayload,
  UpdateStudentPayload,
  StudentBulkImportItem,
  StudentStatus,
  StudentParent,
  StudentEconomic,
} from '../types/student.types';

interface ClassRelationRow {
  name?: string;
  gradeLevel?: number;
}

interface RawStudentRow
  extends Omit<StudentDetail, 'className' | 'gradeLevel' | 'parents' | 'economic'> {
  classes?: ClassRelationRow | null;
  student_parents?: StudentParent[] | null;
  student_economics?: StudentEconomic | StudentEconomic[] | null;
}

interface BulkImportRpcResponse {
  success: boolean;
  inserted: number;
  updated: number;
  count: number;
  message: string;
}

export interface StudentListParams extends PaginatedParams {
  schoolId?: string;
  classId?: string;
  status?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Daftar kolom yang diizinkan untuk pengurutan agar aman dari manipulasi query
const ALLOWED_SORT_COLUMNS = new Set([
  'fullName',
  'nisn',
  'nis',
  'status',
  'entryDate',
  'className',
]);

/**
 * Menerjemahkan kode error PostgreSQL menjadi pesan Bahasa Indonesia yang ramah pengguna.
 */
const handleDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan pada database';

  if (pgError?.code === '23505' || message.includes('unique constraint')) {
    if (message.includes('nisn_key')) {
      message = 'NISN tersebut sudah terdaftar di sekolah ini. Silakan gunakan NISN lain.';
    } else if (message.includes('nis_key')) {
      message = 'NIS tersebut sudah digunakan oleh siswa lain di sekolah ini.';
    } else if (message.includes('nik_key')) {
      message = 'NIK tersebut sudah digunakan oleh siswa lain di sekolah ini.';
    } else {
      message = 'Data tersebut sudah terdaftar (Duplikat).';
    }
  } else if (pgError?.code === '23503') {
    message = 'Operasi gagal karena data masih terhubung dengan modul lain (kelas/tagihan/absensi).';
  }

  return new Error(message);
};

export const studentService = {
  /**
   * 1. MENGAMBIL DAFTAR SISWA (PAGINATED)
   * Mempertahankan nilai `nis` sebagai `null` jika kosong (konsisten dengan tipe data).
   */
  async list(params: StudentListParams): Promise<ApiResponsePaginated<StudentListItem>> {
    const {
      page = 1,
      limit = 10,
      search,
      schoolId,
      classId,
      status,
      sortBy = 'fullName',
      sortOrder = 'asc',
    } = params;

    let query = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)', { count: 'exact' });

    if (schoolId) query = query.eq('schoolId', schoolId);

    if (search && search.trim()) {
      const safeSearch = search.trim().replace(/[,%()]/g, '');
      if (safeSearch) {
        query = query.or(
          `fullName.ilike.%${safeSearch}%,nisn.ilike.%${safeSearch}%,nis.ilike.%${safeSearch}%`
        );
      }
    }

    if (classId && classId !== 'all') query = query.eq('classId', classId);
    if (status && status !== 'all') query = query.eq('status', status);

    const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'fullName';
    const isAsc = sortOrder === 'asc';

    if (safeSortBy === 'className') {
      query = query
        .order('gradeLevel', { referencedTable: 'classes', ascending: isAsc, nullsFirst: false })
        .order('name', { referencedTable: 'classes', ascending: isAsc, nullsFirst: false })
        .order('fullName', { ascending: true, nullsFirst: false });
    } else {
      query = query.order(safeSortBy, { ascending: isAsc, nullsFirst: false });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw handleDbError(error);

    const rows = (data || []) as unknown as RawStudentRow[];
    const mappedData: StudentListItem[] = rows.map((item) => ({
      id: item.id,
      nis: item.nis ?? null,
      nisn: item.nisn,
      nik: item.nik,
      fullName: item.fullName,
      gender: item.gender,
      className: item.classes?.name || '-',
      classId: item.classId ?? null,
      gradeLevel: item.classes?.gradeLevel || 0,
      status: item.status as StudentStatus,
      photoUrl: item.photoUrl ?? null,
      phone: item.phone ?? null,
      entryDate: item.entryDate,
      birthPlace: item.birthPlace,
      birthDate: item.birthDate,
      religion: item.religion ?? null,
      address: item.address,
    }));

    const total = count || 0;
    const totalPages = Math.ceil(total / limit);

    return {
      success: true,
      data: {
        data: mappedData,
        meta: {
          total,
          page,
          limit,
          totalPages,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
      message: 'Berhasil mengambil data siswa',
    };
  },

  /**
   * 2. MENGAMBIL DETAIL LENGKAP SATU SISWA BESERTA ORANG TUA & EKONOMI
   * Memvalidasi error pada seluruh query relasi agar tidak mengembalikan data parsial.
   */
  async getById(id: string, schoolId?: string): Promise<ApiResponse<StudentDetail>> {
    let studentQuery = supabase
      .from('students')
      .select('*, classes(name, gradeLevel)')
      .eq('id', id);

    if (schoolId) {
      studentQuery = studentQuery.eq('schoolId', schoolId);
    }

    const { data: studentData, error: studentError } = await studentQuery.single();
    if (studentError) throw handleDbError(studentError);

    const rawStudent = studentData as unknown as RawStudentRow;

    const [
      { data: parentsData, error: parentsError },
      { data: economicData, error: economicError },
    ] = await Promise.all([
      supabase
        .from('student_parents')
        .select('*')
        .eq('studentId', id)
        .eq('schoolId', rawStudent.schoolId),
      supabase
        .from('student_economics')
        .select('*')
        .eq('studentId', id)
        .eq('schoolId', rawStudent.schoolId)
        .maybeSingle(),
    ]);

    if (parentsError) throw handleDbError(parentsError);
    if (economicError) throw handleDbError(economicError);

    const mappedData: StudentDetail = {
      ...rawStudent,
      nis: rawStudent.nis ?? null,
      className: rawStudent.classes?.name || '-',
      classId: rawStudent.classId ?? null,
      gradeLevel: rawStudent.classes?.gradeLevel || 0,
      parents: (parentsData as StudentParent[]) || [],
      economic: (economicData as StudentEconomic | null) ?? null,
    };

    return {
      success: true,
      data: mappedData,
      message: 'Berhasil mengambil detail siswa',
    };
  },

  /**
   * 3. MENAMBAH DATA SISWA BARU BESERTA RELASINYA
   * Menggunakan `schoolId` yang sah dari baris siswa yang baru tersimpan di database.
   */
  async create(payload: CreateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...studentData } = payload;

    const { data: createdStudent, error: studentError } = await supabase
      .from('students')
      .insert(studentData)
      .select('id, schoolId')
      .single();

    if (studentError) throw handleDbError(studentError);

    const trustedSchoolId = createdStudent.schoolId;

    try {
      if (parents && parents.length > 0) {
        const parentsData = parents.map((p) => ({
          ...p,
          studentId: createdStudent.id,
          schoolId: trustedSchoolId,
        }));
        const { error: parentError } = await supabase.from('student_parents').insert(parentsData);
        if (parentError) throw handleDbError(parentError);
      }

      if (economic) {
        const { error: ecoError } = await supabase.from('student_economics').insert({
          ...economic,
          studentId: createdStudent.id,
          schoolId: trustedSchoolId,
        });
        if (ecoError) throw handleDbError(ecoError);
      }
    } catch (relationError) {
      // Rollback manual jika penyimpanan relasi gagal agar tidak menyisakan data siswa yatim
      await supabase.from('students').delete().eq('id', createdStudent.id);
      throw relationError;
    }

    return this.getById(createdStudent.id, trustedSchoolId);
  },

  /**
   * 4. MEMPERBARUI DATA SISWA & RELASINYA DENGAN AMAN
   * - Melarang perubahan `schoolId`.
   * - Mengambil `schoolId` sah dari record siswa di database.
   * - Mencadangkan data orang tua lama sebelum mengganti agar tidak hilang jika insert gagal.
   */
  async update(id: string, payload: UpdateStudentPayload): Promise<ApiResponse<StudentDetail>> {
    const { parents, economic, ...rawStudentData } = payload;

    // Pastikan `schoolId` tidak bisa disisipkan/diubah melalui update biasa
    const studentData = { ...rawStudentData };
    delete (studentData as Record<string, unknown>).schoolId;

    // Ambil identitas sekolah siswa yang sah langsung dari database
    const { data: existingStudent, error: fetchError } = await supabase
      .from('students')
      .select('id, schoolId')
      .eq('id', id)
      .single();

    if (fetchError) throw handleDbError(fetchError);
    const trustedSchoolId = existingStudent.schoolId;

    // 1. Update tabel utama siswa
    if (Object.keys(studentData).length > 0) {
      const { error: updateError } = await supabase
        .from('students')
        .update(studentData)
        .eq('id', id)
        .eq('schoolId', trustedSchoolId);

      if (updateError) throw handleDbError(updateError);
    }

    // 2. Update relasi orang tua hanya jika `parents` dikirim dalam payload
    if (parents !== undefined) {
      // Cadangkan data orang tua saat ini sebagai pengaman
      const { data: backupParents, error: backupError } = await supabase
        .from('student_parents')
        .select('*')
        .eq('studentId', id)
        .eq('schoolId', trustedSchoolId);

      if (backupError) throw handleDbError(backupError);

      const { error: deleteParentsError } = await supabase
        .from('student_parents')
        .delete()
        .eq('studentId', id)
        .eq('schoolId', trustedSchoolId);

      if (deleteParentsError) throw handleDbError(deleteParentsError);

      if (parents.length > 0) {
        const parentsData = parents.map((p) => ({
          ...p,
          studentId: id,
          schoolId: trustedSchoolId,
        }));

        const { error: insertParentsError } = await supabase
          .from('student_parents')
          .insert(parentsData);

        if (insertParentsError) {
          // Pulihkan data orang tua lama jika insert baru gagal
          if (backupParents && backupParents.length > 0) {
            const restoreRows = backupParents.map(({ id: _oldId, ...rest }) => rest);
            await supabase.from('student_parents').insert(restoreRows);
          }
          throw handleDbError(insertParentsError);
        }
      }
    }

    // 3. Update relasi ekonomi / kesejahteraan jika dikirim
    if (economic !== undefined && economic !== null) {
      const { error: ecoError } = await supabase
        .from('student_economics')
        .upsert(
          {
            ...economic,
            studentId: id,
            schoolId: trustedSchoolId,
          },
          { onConflict: 'studentId' }
        );

      if (ecoError) throw handleDbError(ecoError);
    }

    return this.getById(id, trustedSchoolId);
  },

  /**
   * 5. MENGHAPUS SATU DATA SISWA
   */
  async delete(id: string, schoolId?: string): Promise<ApiResponse<void>> {
    let query = supabase.from('students').delete().eq('id', id);
    if (schoolId) {
      query = query.eq('schoolId', schoolId);
    }

    const { error } = await query;
    if (error) {
      if (error.message.includes('student_bills') || error.code === '23503') {
        throw new Error('Siswa tidak dapat dihapus karena masih memiliki riwayat tagihan/akademik.');
      }
      throw handleDbError(error);
    }

    return { success: true, data: undefined, message: 'Siswa berhasil dihapus' };
  },

  /**
   * 6. MENGAMBIL SELURUH DATA SISWA LENGKAP UNTUK EKSPOR EXCEL
   * Menyertakan relasi kelas, orang tua, dan kesejahteraan ekonomi.
   */
  async exportAll(schoolId?: string): Promise<ApiResponse<StudentDetail[]>> {
    let query = supabase
      .from('students')
      .select('*, classes(name, gradeLevel), student_parents(*), student_economics(*)')
      .order('fullName', { ascending: true });

    if (schoolId) query = query.eq('schoolId', schoolId);

    const { data, error } = await query;
    if (error) throw handleDbError(error);

    const rows = (data || []) as unknown as RawStudentRow[];
    const mappedData: StudentDetail[] = rows.map((item) => {
      const rawEconomic = Array.isArray(item.student_economics)
        ? item.student_economics[0] ?? null
        : item.student_economics ?? null;

      return {
        ...item,
        nis: item.nis ?? null,
        className: item.classes?.name || '-',
        classId: item.classId ?? null,
        gradeLevel: item.classes?.gradeLevel || 0,
        parents: item.student_parents || [],
        economic: rawEconomic,
      };
    });

    return {
      success: true,
      data: mappedData,
      message: 'Berhasil mengambil semua data siswa lengkap',
    };
  },

  /**
   * 7. MENGOSONGKAN SELURUH DATA SISWA PADA SATU SEKOLAH
   */
  async deleteAll(schoolId: string): Promise<ApiResponse<void>> {
    if (!schoolId) throw new Error('School ID tidak valid');

    const { error } = await supabase.from('students').delete().eq('schoolId', schoolId);
    if (error) {
      if (error.message.includes('student_bills') || error.code === '23503') {
        throw new Error('Tidak bisa dikosongkan karena masih ada riwayat Tagihan/Pembayaran siswa.');
      }
      throw handleDbError(error);
    }

    return { success: true, data: undefined, message: 'Seluruh data siswa dikosongkan' };
  },

  /**
   * 8. IMPOR MASSAL SISWA (TRANSAKSI DATABASE ATOMIK VIA RPC)
   * Mengirim seluruh array ke PostgreSQL RPC `bulk_import_students` agar
   * insert, update, orang tua, dan ekonomi berjalan dalam 1 transaksi utuh.
   */
  async bulkImport(
    payload: StudentBulkImportItem[]
  ): Promise<ApiResponse<{ inserted: number; updated: number }>> {
    if (!payload || payload.length === 0) {
      throw new Error('Payload import kosong.');
    }

    // Bersihkan properti helper UI sebelum dikirim ke database RPC
    const sanitizedBatch = payload.map((item) => {
      const {
        id: _id,
        rawClassName: _rawClassName,
        diffAction: _diffAction,
        diffFields: _diffFields,
        ...cleanRecord
      } = item;
      return cleanRecord;
    });

    const { data, error } = await supabase.rpc('bulk_import_students', {
      batch_data: sanitizedBatch,
    });

    if (error) {
      throw handleDbError(error);
    }

    const result = data as BulkImportRpcResponse;

    return {
      success: true,
      data: {
        inserted: result?.inserted ?? 0,
        updated: result?.updated ?? 0,
      },
      message:
        result?.message ||
        `${result?.inserted ?? 0} data baru ditambahkan, ${result?.updated ?? 0} data diperbarui`,
    };
  },
};