// src/modules/teachers/services/teacher.service.ts
import { supabase } from '@/services/supabase.client';
import { useAuthStore } from '@/modules/auth/store/auth.store';
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
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Memvalidasi dan membersihkan string UUID agar aman dikirim ke query PostgreSQL.
 */
export const normalizeTeacherSchoolId = (value?: string | null): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return UUID_REGEX.test(trimmed) ? trimmed : null;
};

const assertValidUuid = (id: string, label = 'ID guru'): string => {
  const trimmed = typeof id === 'string' ? id.trim() : '';
  if (!UUID_REGEX.test(trimmed)) {
    throw new Error(`${label} tidak valid.`);
  }
  return trimmed;
};

// ============================================================================
// HELPER NORMALISASI & SANITASI DATA
// ============================================================================
const cleanNullableText = (value?: unknown): string | null => {
  if (value === undefined || value === null) return null;
  // Hapus tanda petik tunggal di awal (sering muncul pada ekspor Excel Dapodik untuk NIK/NUPTK/NIP)
  const trimmed = String(value)
    .replace(/^'+/, '')
    .replace(/\s+/g, ' ')
    .trim();
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

const normalizeGender = (value?: unknown): 'L' | 'P' | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'L' || upper === 'LAKI-LAKI' || upper === 'LAKILAKI' || upper === 'PRIA') {
    return 'L';
  }
  if (upper === 'P' || upper === 'PEREMPUAN' || upper === 'WANITA') {
    return 'P';
  }
  return null;
};

const normalizeReligion = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KATHOLIK') return 'KATOLIK';
  if (upper === 'BUDHA') return 'BUDDHA';
  if (upper.includes('KEPERCAYAAN')) return 'KEPERCAYAAN';
  return upper;
};

const normalizeMaritalStatus = (value?: unknown): string | null => {
  const cleaned = cleanNullableText(value);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'KAWIN') return 'Kawin';
  if (upper === 'BELUM KAWIN') return 'Belum Kawin';
  if (upper === 'JANDA/DUDA' || upper === 'JANDA' || upper === 'DUDA') {
    return 'Janda/Duda';
  }
  return cleaned;
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

  // Hapus field yang dikelola otomatis oleh database
  delete data.id;
  delete data.userId;
  delete data.createdAt;
  delete data.updatedAt;

  if ('fullName' in data && typeof data.fullName === 'string') {
    data.fullName = data.fullName.replace(/\s+/g, ' ').trim();
  }
  if ('gender' in data && data.gender !== undefined) {
    const normalizedGender = normalizeGender(data.gender);
    if (normalizedGender) {
      data.gender = normalizedGender;
    }
  }
  if ('religion' in data) {
    data.religion = normalizeReligion(data.religion);
  }
  if ('statusPerkawinan' in data) {
    data.statusPerkawinan = normalizeMaritalStatus(data.statusPerkawinan);
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

  // Standarisasi huruf kapital untuk kode pendidikan & status kepegawaian
  if (typeof data.education === 'string') {
    data.education = data.education.toUpperCase();
  }
  if (typeof data.status === 'string') {
    data.status = data.status.toUpperCase();
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
      const numericSalary = Number(val);
      if (numericSalary < 0) {
        throw new Error('Gaji pokok tidak boleh bernilai negatif.');
      }
      data.baseSalary = numericSalary;
    }
  }

  if ('maxHoursPerWeek' in data) {
    const val = Number(data.maxHoursPerWeek);
    data.maxHoursPerWeek = !Number.isNaN(val) && val > 0 ? Math.trunc(val) : 24;
  }

  return data;
};

// ============================================================================
// ERROR HANDLER POSTGRESQL & JARINGAN
// ============================================================================
const handleDbError = (error: unknown): Error => {
  const pgError = error as PostgrestError;
  let message = pgError?.message || 'Terjadi kesalahan saat memproses data guru.';
  const lowerMsg = message.toLowerCase();

  const rowPrefixMatch = message.match(/(Impor gagal pada baris ke-\d+:)/i);
  const rowPrefix = rowPrefixMatch ? `${rowPrefixMatch[1]} ` : '';

  if (lowerMsg.includes('network error') || lowerMsg.includes('failed to fetch')) {
    message = 'Koneksi ke server gagal. Periksa jaringan internet Anda lalu coba lagi.';
  } else if (pgError?.code === '23505' || lowerMsg.includes('unique constraint')) {
    if (lowerMsg.includes('nuptk')) {
      message = `${rowPrefix}NUPTK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (lowerMsg.includes('nik')) {
      message = `${rowPrefix}NIK tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else if (lowerMsg.includes('nip')) {
      message = `${rowPrefix}NIP tersebut sudah terdaftar pada guru lain di sekolah ini.`;
    } else {
      message = `${rowPrefix}Data guru tersebut sudah terdaftar (Duplikat).`;
    }
  } else if (pgError?.code === '23502') {
    message = `${rowPrefix}Terdapat kolom wajib yang masih kosong. Pastikan semua data wajib sudah terisi.`;
  } else if (pgError?.code === '23503') {
    message =
      'Operasi gagal karena data guru masih terhubung dengan modul lain (wali kelas, jadwal pelajaran, atau presensi).';
  } else if (pgError?.code === '23514') {
    message = `${rowPrefix}Nilai input tidak memenuhi aturan validasi data (cek Gaji Pokok >= 0 atau Jam Mengajar > 0).`;
  } else if (pgError?.code === '22007' || pgError?.code === '22008') {
    message = `${rowPrefix}Format tanggal tidak valid. Gunakan format YYYY-MM-DD.`;
  } else if (pgError?.code === '22P02') {
    message = `${rowPrefix}Format input angka, status, atau ID tidak valid.`;
  } else if (pgError?.code === '42501') {
    message = 'Anda tidak memiliki hak akses untuk melakukan operasi ini.';
  } else if (pgError?.code === 'PGRST116') {
    message = 'Data guru tidak ditemukan atau Anda tidak memiliki akses ke data ini.';
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
      teacherId,
      page = 1,
      limit = 10,
      search,
      status,
      isCertified,
      isActive,
      sortBy = 'fullName',
      sortOrder = 'asc',
    } = params;

    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const validTeacherId = normalizeTeacherSchoolId(teacherId);
    const safePage = Math.max(1, Math.trunc(page));
    const safeLimit = Math.max(1, Math.min(200, Math.trunc(limit)));

    let query = supabase
      .from('teachers')
      .select('*', { count: 'exact' });

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    if (validTeacherId) {
      query = query.eq('id', validTeacherId);
    }

    if (search && search.trim()) {
      const safeSearch = search
        .trim()
        .replace(/[,()\\]/g, '')
        .replace(/[%_]/g, '\\$&');
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

    const from = (safePage - 1) * safeLimit;
    const to = from + safeLimit - 1;

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
    const totalPages = Math.ceil(total / safeLimit);

    return {
      success: true,
      data: {
        data: mappedData,
        meta: {
          total,
          page: safePage,
          limit: safeLimit,
          totalPages,
          hasNext: safePage < totalPages,
          hasPrev: safePage > 1,
        },
      },
      message: 'Berhasil mengambil data guru & pegawai',
    };
  },

  async getById(id: string, schoolId?: string): Promise<ApiResponse<TeacherDetail>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeTeacherSchoolId(schoolId);

    let query = supabase
      .from('teachers')
      .select('*')
      .eq('id', validId);

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
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
    const validSchoolId = normalizeTeacherSchoolId(payload.schoolId);
    if (!validSchoolId) {
      throw new Error('Identitas sekolah tujuan tidak valid.');
    }

    const normalized = normalizeTeacherFields(
      payload as CreateTeacherPayload & Record<string, unknown>
    );

    if (!normalized.fullName || typeof normalized.fullName !== 'string') {
      throw new Error('Nama lengkap guru wajib diisi.');
    }
    if (normalized.gender !== 'L' && normalized.gender !== 'P') {
      throw new Error('Jenis kelamin wajib dipilih (L atau P).');
    }

    normalized.schoolId = validSchoolId;

    const { data, error } = await supabase
      .from('teachers')
      .insert(normalized)
      .select('id, schoolId')
      .single();

    if (error) throw handleDbError(error);

    return this.getById(data.id, data.schoolId);
  },

  async update(id: string, payload: UpdateTeacherPayload): Promise<ApiResponse<TeacherDetail>> {
    const validId = assertValidUuid(id);
    const normalized = normalizeTeacherFields(
      payload as UpdateTeacherPayload & Record<string, unknown>
    );
    delete normalized.schoolId;

    if ('fullName' in normalized && !normalized.fullName) {
      throw new Error('Nama lengkap guru tidak boleh dikosongkan.');
    }
    if ('gender' in normalized && normalized.gender !== 'L' && normalized.gender !== 'P') {
      throw new Error('Jenis kelamin tidak valid (gunakan L atau P).');
    }

    const { data: existing, error: fetchError } = await supabase
      .from('teachers')
      .select('id, schoolId, userId, fullName')
      .eq('id', validId)
      .single();

    if (fetchError) throw handleDbError(fetchError);

    if (Object.keys(normalized).length > 0) {
      const { error: updateError } = await supabase
        .from('teachers')
        .update(normalized)
        .eq('id', validId)
        .eq('schoolId', existing.schoolId);

      if (updateError) throw handleDbError(updateError);

      // Sinkronkan perubahan nama lengkap ke akun login (public.users) jika sudah tertaut
      if (
        existing.userId &&
        typeof normalized.fullName === 'string' &&
        normalized.fullName !== existing.fullName
      ) {
        try {
          await supabase
            .from('users')
            .update({ fullName: normalized.fullName })
            .eq('id', existing.userId)
            .eq('schoolId', existing.schoolId);

          const authState = useAuthStore.getState();
          if (authState.user && authState.user.id === existing.userId) {
            useAuthStore.setState({
              user: {
                ...authState.user,
                fullName: normalized.fullName,
              },
            });
          }
        } catch {
          // Best-effort sync (tidak menggagalkan update guru jika RLS users membatasi role Operator/TU)
        }
      }
    }

    return this.getById(validId, existing.schoolId);
  },

  async delete(id: string, schoolId?: string): Promise<ApiResponse<void>> {
    const validId = assertValidUuid(id);
    const validSchoolId = normalizeTeacherSchoolId(schoolId);

    let query = supabase
      .from('teachers')
      .delete()
      .eq('id', validId);

    if (validSchoolId) {
      query = query.eq('schoolId', validSchoolId);
    }

    // Gunakan .select('id') untuk mendeteksi jika RLS menolak penghapusan (0 baris terhapus)
    const { data, error } = await query.select('id');
    if (error) throw handleDbError(error);

    if (!data || data.length === 0) {
      throw new Error(
        'Data guru gagal dihapus. Pastikan data masih ada atau Anda memiliki peran Admin / Kepala Sekolah.'
      );
    }

    return {
      success: true,
      data: undefined,
      message: 'Data guru berhasil dihapus',
    };
  },

  async deleteMany(ids: string[], schoolId?: string): Promise<ApiResponse<{ deleted: number }>> {
    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const uniqueIds = Array.from(
      new Set(
        ids
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter((item) => UUID_REGEX.test(item))
      )
    );

    if (uniqueIds.length === 0) {
      return {
        success: true,
        data: { deleted: 0 },
        message: 'Tidak ada data guru valid yang dipilih',
      };
    }

    let totalDeleted = 0;

    for (let i = 0; i < uniqueIds.length; i += BULK_DELETE_CHUNK_SIZE) {
      const chunk = uniqueIds.slice(i, i + BULK_DELETE_CHUNK_SIZE);
      let query = supabase
        .from('teachers')
        .delete()
        .in('id', chunk);

      if (validSchoolId) {
        query = query.eq('schoolId', validSchoolId);
      }

      const { data, error } = await query.select('id');
      if (error) throw handleDbError(error);
      totalDeleted += data?.length ?? 0;
    }

    if (totalDeleted === 0) {
      throw new Error(
        'Tidak ada data guru yang berhasil dihapus. Periksa hak akses Anda (khusus Admin / Kepala Sekolah).'
      );
    }

    return {
      success: true,
      data: { deleted: totalDeleted },
      message: `${totalDeleted} data guru berhasil dihapus`,
    };
  },

  async deleteAll(schoolId: string): Promise<ApiResponse<void>> {
    const validSchoolId = assertValidUuid(schoolId, 'Identitas sekolah');

    const { error } = await supabase
      .from('teachers')
      .delete()
      .eq('schoolId', validSchoolId);

    if (error) throw handleDbError(error);

    return {
      success: true,
      data: undefined,
      message: 'Seluruh data guru & pegawai dikosongkan',
    };
  },

  async exportAll(schoolId?: string): Promise<ApiResponse<TeacherDetail[]>> {
    const validSchoolId = normalizeTeacherSchoolId(schoolId);
    const allRows: TeacherDetail[] = [];
    const batchSize = 1000;

    for (let from = 0; ; from += batchSize) {
      let query = supabase
        .from('teachers')
        .select('*')
        .order('fullName', { ascending: true })
        .range(from, from + batchSize - 1);

      if (validSchoolId) {
        query = query.eq('schoolId', validSchoolId);
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
      throw new Error('Data impor guru kosong.');
    }

    const sanitizedBatch = payload.map((item) => {
      const {
        id,
        schoolId: itemSchoolId,
        diffAction: _diffAction,
        diffFields: _diffFields,
        ...rest
      } = item;
      void [_diffAction, _diffFields];

      const normalizedCore = normalizeTeacherFields(rest);
      const validItemSchoolId = normalizeTeacherSchoolId(itemSchoolId);
      const validItemId = id && UUID_REGEX.test(id.trim()) ? id.trim() : undefined;

      return {
        ...(validItemId ? { id: validItemId } : {}),
        ...(validItemSchoolId ? { schoolId: validItemSchoolId } : {}),
        ...normalizedCore,
      };
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