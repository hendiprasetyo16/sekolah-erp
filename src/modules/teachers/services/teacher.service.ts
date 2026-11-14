import { supabase } from '@/services/supabase.client';
import type { PostgrestError } from '@supabase/supabase-js';
import type {
  ApiResponse,
  ApiResponsePaginated,
} from '@/services/api.types';
import type {
  TeacherListItem,
  TeacherDetail,
  TeacherListParams,
  CreateTeacherPayload,
  UpdateTeacherPayload,
  TeacherBulkImportItem,
  TeacherBulkImportResult,
} from '../types/teacher.types';

interface BulkImportTeachersRpcResponse {
  success: boolean;
  inserted: number;
  updated: number;
  count: number;
  message: string;
}

const ALLOWED_SORT_COLUMNS = new Set([
  'fullName',
  'nip',
  'nuptk',
  'position',
  'status',
  'joinDate',
  'createdAt',
]);

const BULK_IMPORT_CHUNK_SIZE = 250;
const BULK_DELETE_CHUNK_SIZE = 200;

// ============================================================================
// HELPER NORMALISASI & SANITASI DATA
// ============================================================================
const cleanNullableText = (value?: unknown): string | null => {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).replace(/\s+/g, ' ').trim();
  if (!trimmed || trimmed === '(tidak diisi)' || trimmed.toLowerCase() === 'null') {
    return null;
  }
  return trimmed;
};

const normalizeBooleanFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === 'ya' || v === 'y' || v === '1' || v === 'sudah';
  }
  return false;
};

const normalizeReligion = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KATHOLIK') return 'KATOLIK';
  if (upper === 'BUDHA') return 'BUDDHA';
  return upper;
};

const normalizeNationality = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  if (cleaned.toUpperCase() === 'ID') return 'Indonesia';
  return cleaned;
};

const normalizeTeacherFields = <T extends Record<string, unknown>>(
  raw: T
): Record<string, unknown> => {
  const data: Record<string, unknown> = { ...raw };

  delete data.id;
  delete data.userId;
  delete data.createdAt;
  delete data.updatedAt;

  if ('fullName' in data && typeof data.fullName === 'string') {
    data.fullName = data.fullName.replace(/\s+/g, ' ').trim();
  }
  if ('religion' in data) {
    data.religion = normalizeReligion(data.religion);
  }
  if ('kewarganegaraan' in data) {
    data.kewarganegaraan = normalizeNationality(data.kewarganegaraan);
  }

  const nullableStringFields = [
    'nip',
    'nuptk',
    'nik',
    'noKk',
    'birthDate',
    'birthPlace',
    'address',
    'dusun',
    'rt',
    'rw',
    'kelurahan',
    'kecamatan',
    'city',
    'province',
    'postalCode',
    'telepon',
    'phone',
    'email',
    'photoUrl',
    'education',
    'major',
    'university',
    'status',
    'position',
    'tugasTambahan',
    'certificationNumber',
    'joinDate',
    'subjects',
    'skCpns',
    'tanggalCpns',
    'skPengangkatan',
    'tmtPengangkatan',
    'lembagaPengangkatan',
    'pangkatGolongan',
    'sumberGaji',
    'tmtPns',
    'karpeg',
    'namaIbuKandung',
    'statusPerkawinan',
    'namaSuamiIstri',
    'nipSuamiIstri',
    'pekerjaanSuamiIstri',
    'karisKarsu',
    'npwp',
    'namaWajibPajak',
    'bank',
    'nomorRekeningBank',
    'rekeningAtasNama',
    'lintang',
    'bujur',
    'nuks',
  ];

  for (const field of nullableStringFields) {
    if (field in data) {
      data[field] = cleanNullableText(data[field]);
    }
  }

  if (data.telepon === '0') {
    data.telepon = null;
  }

  const booleanFields = [
    'isCertified',
    'isActive',
    'sudahLisensiKepalaSekolah',
    'pernahDiklatKepengawasan',
    'keahlianBraille',
    'keahlianBahasaIsyarat',
  ];

  for (const field of booleanFields) {
    if (field in data && data[field] !== undefined && data[field] !== null) {
      data[field] = normalizeBooleanFlag(data[field]);
    }
  }

  if ('baseSalary' in data) {
    const val = data.baseSalary;
    if (val === undefined || val === null || val === '' || Number.isNaN(Number(val))) {
      data.baseSalary = null;
    } else {
      data.baseSalary = Number(val);
    }
  }

  if ('maxHoursPerWeek' in data) {
    const val = Number(data.maxHoursPerWeek);
    data.maxHoursPerWeek = !Number.isNaN(val) && val > 0 ? Math.trunc(val) : 24;
  }

  return data;
};

// ============================================================================
// ERROR HANDLER POSTGRESQL
// ============================================================================
const handleDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan pada database';

  const rowPrefixMatch = message.match(/(Impor gagal pada baris ke-\d+:)/i);
  const rowPrefix = rowPrefixMatch ? `${rowPrefixMatch[1]} ` : '';

  if (pgError?.code === '23505' || message.includes('unique constraint')) {
    if (message.includes('nip_key')) {
      message = `${rowPrefix}NIP tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (message.includes('nuptk_key')) {
      message = `${rowPrefix}NUPTK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (message.includes('nik_key')) {
      message = `${rowPrefix}NIK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else {
      message = `${rowPrefix}Data guru tersebut sudah terdaftar (Duplikat).`;
    }
  } else if (pgError?.code === '23502') {
    message = `${rowPrefix}Terdapat kolom wajib yang bernilai kosong (NOT NULL constraint).`;
  } else if (pgError?.code === '23503') {
    message =
      'Operasi gagal karena data guru masih terhubung dengan modul lain (wali kelas, jadwal pelajaran, atau presensi).';
  } else if (pgError?.code === '23514') {
    message = `${rowPrefix}Nilai input tidak memenuhi aturan validasi database (cek Gaji Pokok >= 0 atau Jam Mengajar > 0).`;
  } else if (pgError?.code === '22007' || pgError?.code === '22008') {
    message = `${rowPrefix}Format tanggal tidak valid. Gunakan format YYYY-MM-DD.`;
  } else if (pgError?.code === '22P02') {
    message = `${rowPrefix}Format input angka, boolean, atau ID tidak valid.`;
  } else if (pgError?.code === '42501') {
    message = 'Anda tidak memiliki hak akses untuk melakukan operasi ini.';
  }

  return new Error(message);
};

// ============================================================================
// SERVICE UTAMA MODUL GURU & PEGAWAI
// ============================================================================
export const teacherService = {
  async list(params: TeacherListParams): Promise<ApiResponsePaginated<TeacherListItem>> {
    const {
      schoolId,
      page = 1,
      limit = 10,
      search,
      status,
      isCertified,
      isActive,
      sortBy = 'fullName',
      sortOrder = 'asc',
    } = params;

    let query = supabase
      .from('teachers')
      .select('*', { count: 'exact' });

    if (schoolId) {
      query = query.eq('schoolId', schoolId);
    }

    if (search && search.trim()) {
      const safeSearch = search.trim().replace(/[,()\\]/g, '');
      if (safeSearch) {
        query = query.or(
          `fullName.ilike.%${safeSearch}%,nip.ilike.%${safeSearch}%,nuptk.ilike.%${safeSearch}%,nik.ilike.%${safeSearch}%,position.ilike.%${safeSearch}%`
        );
      }
    }

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (isCertified !== undefined) {
      query = query.eq('isCertified', isCertified);
    }

    if (isActive !== undefined) {
      query = query.eq('isActive', isActive);
    }

    const safeSortBy = ALLOWED_SORT_COLUMNS.has(sortBy) ? sortBy : 'fullName';
    const isAsc = sortOrder === 'asc';

    query = query.order(safeSortBy, { ascending: isAsc, nullsFirst: false });
    if (safeSortBy !== 'fullName') {
      query = query.order('fullName', { ascending: true, nullsFirst: false });
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data, count, error } = await query.range(from, to);
    if (error) throw handleDbError(error);

    const mappedData = ((data || []) as TeacherDetail[]).map((item) => ({
      id: item.id,
      schoolId: item.schoolId,
      userId: item.userId ?? null,
      fullName: item.fullName,
      nip: item.nip ?? null,
      nuptk: item.nuptk ?? null,
      nik: item.nik ?? null,
      gender: item.gender,
      phone: item.phone ?? null,
      email: item.email ?? null,
      status: item.status ?? null,
      position: item.position ?? null,
      tugasTambahan: item.tugasTambahan ?? null,
      isCertified: Boolean(item.isCertified),
      isActive: item.isActive ?? true,
      photoUrl: item.photoUrl ?? null,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
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
      message: 'Berhasil mengambil data guru & pegawai',
    };
  },

  async getById(id: string, schoolId?: string): Promise<ApiResponse<TeacherDetail>> {
    let query = supabase
      .from('teachers')
      .select('*')
      .eq('id', id);

    if (schoolId) {
      query = query.eq('schoolId', schoolId);
    }

    const { data, error } = await query.single();
    if (error) throw handleDbError(error);

    return {
      success: true,
      data: data as TeacherDetail,
      message: 'Berhasil mengambil detail guru',
    };
  },

  async create(payload: CreateTeacherPayload): Promise<ApiResponse<TeacherDetail>> {
    const normalized = normalizeTeacherFields(
      payload as CreateTeacherPayload & Record<string, unknown>
    );

    const { data, error } = await supabase
      .from('teachers')
      .insert(normalized)
      .select('id, schoolId')
      .single();

    if (error) throw handleDbError(error);

    return this.getById(data.id, data.schoolId);
  },

  async update(id: string, payload: UpdateTeacherPayload): Promise<ApiResponse<TeacherDetail>> {
    const normalized = normalizeTeacherFields(
      payload as UpdateTeacherPayload & Record<string, unknown>
    );
    delete normalized.schoolId;

    const { data: existing, error: fetchError } = await supabase
      .from('teachers')
      .select('id, schoolId')
      .eq('id', id)
      .single();

    if (fetchError) throw handleDbError(fetchError);

    if (Object.keys(normalized).length > 0) {
      const { error: updateError } = await supabase
        .from('teachers')
        .update(normalized)
        .eq('id', id)
        .eq('schoolId', existing.schoolId);

      if (updateError) throw handleDbError(updateError);
    }

    return this.getById(id, existing.schoolId);
  },

  async delete(id: string, schoolId?: string): Promise<ApiResponse<void>> {
    let query = supabase.from('teachers').delete().eq('id', id);
    if (schoolId) {
      query = query.eq('schoolId', schoolId);
    }

    const { error } = await query;
    if (error) throw handleDbError(error);

    return {
      success: true,
      data: undefined,
      message: 'Data guru berhasil dihapus',
    };
  },

  async deleteMany(ids: string[], schoolId?: string): Promise<ApiResponse<{ deleted: number }>> {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { success: true, data: { deleted: 0 }, message: 'Tidak ada data guru yang dipilih' };
    }

    for (let i = 0; i < uniqueIds.length; i += BULK_DELETE_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + BULK_DELETE_CHUNK_SIZE);
      let query = supabase.from('teachers').delete().in('id', chunk);
      if (schoolId) {
        query = query.eq('schoolId', schoolId);
      }

      const { error } = await query;
      if (error) throw handleDbError(error);
    }

    return {
      success: true,
      data: { deleted: uniqueIds.length },
      message: `${uniqueIds.length} data guru berhasil dihapus`,
    };
  },

  async deleteAll(schoolId: string): Promise<ApiResponse<void>> {
    if (!schoolId) throw new Error('School ID tidak valid');

    const { error } = await supabase.from('teachers').delete().eq('schoolId', schoolId);
    if (error) throw handleDbError(error);

    return {
      success: true,
      data: undefined,
      message: 'Seluruh data guru & pegawai dikosongkan',
    };
  },

  async exportAll(schoolId?: string): Promise<ApiResponse<TeacherDetail[]>> {
    const allRows: TeacherDetail[] = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
      let query = supabase
        .from('teachers')
        .select('*')
        .order('fullName', { ascending: true })
        .range(from, from + batchSize - 1);

      if (schoolId) {
        query = query.eq('schoolId', schoolId);
      }

      const { data, error } = await query;
      if (error) throw handleDbError(error);

      if (data && data.length > 0) {
        allRows.push(...(data as TeacherDetail[]));
      }
      if (!data || data.length < batchSize) break;
    }

    return {
      success: true,
      data: allRows,
      message: 'Berhasil mengambil semua data guru lengkap',
    };
  },

  async bulkImport(
    payload: TeacherBulkImportItem[]
  ): Promise<ApiResponse<TeacherBulkImportResult>> {
    if (!payload || payload.length === 0) {
      throw new Error('Payload import kosong.');
    }

    const sanitizedBatch = payload.map((item) => {
      const {
        id,
        diffAction: _diffAction,
        diffFields: _diffFields,
        ...rest
      } = item;
      void [_diffAction, _diffFields];

      const normalizedCore = normalizeTeacherFields(rest);
      return id ? { id, ...normalizedCore } : normalizedCore;
    });

    let totalInserted = 0;
    let totalUpdated = 0;

    for (let i = 0; i < sanitizedBatch.length; i += BULK_IMPORT_CHUNK_SIZE) {
      const chunk = sanitizedBatch.slice(i, i + BULK_IMPORT_CHUNK_SIZE);

      const { data, error } = await supabase.rpc('bulk_import_teachers', {
        batch_data: chunk,
      });

      if (error) {
        throw handleDbError(error);
      }

      const result = data as BulkImportTeachersRpcResponse;
      totalInserted += result?.inserted ?? 0;
      totalUpdated += result?.updated ?? 0;
    }

    return {
      success: true,
      data: {
        inserted: totalInserted,
        updated: totalUpdated,
      },
      message: `${totalInserted} data guru baru ditambahkan, ${totalUpdated} data diperbarui`,
    };
  },
};